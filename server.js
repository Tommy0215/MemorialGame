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

// HTTP server to serve static files
const server = http.createServer((req, res) => {
  // Normalize the path
  let filePath = req.url === "/" ? "/index.html" : req.url;
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

      res.writeHead(200, { "Content-Type": contentType });
      res.end(data);
    }
  });
});

// WebSocket server attached to the same HTTP server
const wss = new WebSocketServer({ server });

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


wss.on("connection", (ws) => {
  console.log("Player connected");

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
      // already know about them).
      for (const client of wss.clients) {
        if (client !== ws && client.readyState === 1) {
          client.send(text);
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