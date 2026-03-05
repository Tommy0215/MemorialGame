import http from "http";
import fs from "fs";
import path from "path";
import { WebSocketServer } from "ws";

// allow deployment environments to override the port and
// don't hard‑code the public IP address.  listening on
// "0.0.0.0" below ensures the server accepts connections
// on any interface (required on EC2).
const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
// IP is only used for logging; we cannot reliably know the
// machine's external address from within the process, so fall
// back to a placeholder.  you can optionally set
// process.env.IP when starting the server.
const IP = process.env.IP || "0.0.0.0";

// ----- simple login system ------------------------------------------------
// load users from users.json; this file is not committed to git so
// credentials are never exposed. format: { "username": "password", ... }
let users = new Map();
try {
  const data = JSON.parse(fs.readFileSync("users.json", "utf8"));
  users = new Map(Object.entries(data));
  console.log(`[Auth] Loaded ${users.size} user(s) from users.json`);
} catch (err) {
  console.error("[Auth] Failed to load users.json:", err.message);
  console.error("[Auth] Create a users.json file with format: { \"alice\": \"password\" }");
  process.exit(1);
}

// load skin-to-username mappings
let skins = new Map();
try {
  const data = JSON.parse(fs.readFileSync("skins.json", "utf8"));
  skins = new Map(Object.entries(data));
  console.log(`[Auth] Loaded skins for ${skins.size} user(s) from skins.json`);
} catch (err) {
  console.error("[Auth] Warning: Could not load skins.json:", err.message);
  console.error("[Auth] Create skins.json with format: { \"alice\": \"skin1\" }");
}

// session token -> username
const sessions = new Map();

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return header.split(";").reduce((acc, pair) => {
    const [k, v] = pair.split("=").map((s) => s && s.trim());
    if (k && v) acc[k] = decodeURIComponent(v);
    return acc;
  }, {});
}

function isAuthenticated(req) {
  const cookies = parseCookies(req);
  return cookies.session && sessions.has(cookies.session);
}

function getUsernameFromRequest(req) {
  const cookies = parseCookies(req);
  const token = cookies.session;
  return token ? sessions.get(token) : null;
}

// helper used when a login attempt succeeds
function createSession(username) {
  const token = Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
  sessions.set(token, username);
  return token;
}

// --------------------------------------------------------------------------

// HTTP server to serve static files and handle login
const server = http.createServer((req, res) => {
  // handle quick login POST (development only)
  if (req.method === "POST" && req.url === "/quick-login") {
    // Use the first user from users.json for quick login
    const firstUsername = users.keys().next().value;
    if (firstUsername) {
      const token = createSession(firstUsername);
      res.writeHead(200, {
        "Set-Cookie": `session=${token}; HttpOnly; Path=/`,
        "Content-Type": "application/json",
      });
      res.end(JSON.stringify({ success: true, username: firstUsername }));
    } else {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "No users available" }));
    }
    return;
  }

  // handle login POST
  if (req.method === "POST" && req.url === "/login") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      const params = new URLSearchParams(body);
      const username = params.get("username") || "";
      const password = params.get("password") || "";
      if (users.get(username) === password) {
        const token = createSession(username);
        res.writeHead(302, {
          Location: "/",
          "Set-Cookie": `session=${token}; HttpOnly; Path=/`,
        });
        res.end();
      } else {
        res.writeHead(302, { Location: "/login" });
        res.end();
      }
    });
    return;
  }

  // if not authenticated and not requesting the login page, redirect
  if (!isAuthenticated(req) && req.url !== "/login") {
    // we allow the static copy of login.html through as well
    if (req.method === "GET") {
      res.writeHead(302, { Location: "/login" });
      res.end();
      return;
    }
  }

  // for a GET request we just serve files from dist (including the login
  // page that lives in public/login.html and is copied over by vite).
  if (req.method === "GET") {
    let filePath = req.url === "/" ? "/index.html" : req.url;
    // special-case the login route so it resolves to login.html
    if (filePath === "/login") filePath = "/login.html";
    // Serve from the 'dist' directory which contains the built/bundled assets
    filePath = path.join(process.cwd(), "dist", filePath);

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("Not Found");
      } else {
        // Simple content type handling
        let contentType = "text/html";
        if (filePath.endsWith(".js")) contentType = "text/javascript";
        else if (filePath.endsWith(".css")) contentType = "text/css";
        else if (filePath.endsWith(".json")) contentType = "application/json";
        else if (filePath.endsWith(".png")) contentType = "image/png";
        else if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) contentType = "image/jpeg";
        else if (filePath.endsWith(".gif")) contentType = "image/gif";
        else if (filePath.endsWith(".svg")) contentType = "image/svg+xml";

        res.writeHead(200, { "Content-Type": contentType });
        res.end(data);
      }
    });
    return;
  }

  // all other methods are responded with 405
  res.writeHead(405);
  res.end();
});

// WebSocket server will be attached manually so we can protect the upgrade
// request with the same session check as the HTTP routes.
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  if (!isAuthenticated(req)) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

// keep a list of all red blocks that have been spawned so far. when a new
// client connects we replay these to them so the world isn't empty. the array
// isn’t cleared when a player disconnects – blocks are permanent for the
// duration of the server process.
// we attach a small expiration timer to each block so they automatically
// disappear after a few seconds, preventing the server memory from growing
// without bound.

function generateBlockId() {
  // simple pseudo‑unique identifier; collisions are practically impossible for
  // our use case.
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

const spawnedBlocks = [];


wss.on("connection", (ws, req) => {
  const username = getUsernameFromRequest(req);
  const skin = username ? skins.get(username) : "skin1";
  console.log(`Player connected: ${username} (skin: ${skin})`);

  // replay any blocks that were created before this client joined
  for (const blk of spawnedBlocks) {
    try {
      ws.send(JSON.stringify({
        type: "spawnBlock",
        blockId: blk.id,
        position: blk.position,
      }));
    } catch (e) {
      // if the socket is already closed, ignore
    }
  }

  ws.on("message", (data) => {
      const text = data.toString();
      console.log("[Server] Received message:", text.substring(0, 100));

      let msg;
      try {
        msg = JSON.parse(text);
      } catch (e) {
        // not JSON, just ignore/broadcast as before
        msg = null;
      }

      // include this player's skin in state updates
      if (msg && msg.type === "state" && username && skin) {
        msg.skin = skin;
      }

      // handle spawnBlock specially so we can assign an ID and schedule
      // expiration. clients will still create the cube locally right when they
      // press the key, but the server keeps the canonical list for new
      // connections and broadcasts removal events.
      if (msg && msg.type === "spawnBlock" && msg.position) {
        const bid = generateBlockId();
        spawnedBlocks.push({ id: bid, position: msg.position });

        // schedule expiration
        setTimeout(() => {
          const idx = spawnedBlocks.findIndex((b) => b.id === bid);
          if (idx !== -1) spawnedBlocks.splice(idx, 1);
          // inform everyone to drop the block
          for (const client of wss.clients) {
            if (client.readyState === 1) {
              client.send(JSON.stringify({ type: "despawnBlock", blockId: bid }));
            }
          }
        }, 5000);

        // broadcast spawn with the block ID to clients (including sender)
        const out = JSON.stringify({
          type: "spawnBlock",
          clientId: msg.clientId || null,
          blockId: bid,
          position: msg.position,
        });

        for (const client of wss.clients) {
          if (client.readyState === 1) {
            client.send(out);
          }
        }

        // we handled the broadcast ourselves, so return early
        return;
      }

      // other messages just get relayed as before (sender excluded since they
      // already know about them). Use the modified msg if it was parsed and changed
      const outText = (msg && msg.type === "state") ? JSON.stringify(msg) : text;
      for (const client of wss.clients) {
        if (client !== ws && client.readyState === 1) {
          client.send(outText);
          console.log("[Server] Broadcasted to other client");
        }
      }
    });
  ws.on("close", () => {
    console.log("Player disconnected");
  });
});

server.listen(PORT, "0.0.0.0", () => {
  // we bind to 0.0.0.0 so the server accepts connections on any
  // interface. that means the address printed by `server.address()`
  // will generally be "0.0.0.0" which isn't useful to clients –
  // they need to use the host name or public IP of the instance.
  // the optional IP environment variable can be used to override
  // the displayed host if you know it ahead of time.
  const addr = server.address();
  let host = IP;
  if (addr && typeof addr === "object") {
    if (addr.address !== "0.0.0.0" && addr.address !== "::") {
      host = addr.address;
    }
  }

  if (host === "0.0.0.0" || host === "::") {
    console.log(
      `Server listening on port ${PORT} (bound to all interfaces). ` +
        `Use your EC2 instance's public IP or domain to connect.`
    );
  } else {
    console.log(`Server running on http://${host}:${PORT}`);
  }
});