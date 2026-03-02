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

wss.on("connection", (ws) => {
  console.log("Player connected");

  ws.on("message", (data) => {
    // Broadcast to all other clients
    for (const client of wss.clients) {
      if (client !== ws && client.readyState === 1) {
        client.send(data);
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