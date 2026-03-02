import http from "http";
import { WebSocketServer } from "ws";
import fs from "fs";
import path from "path";

const PORT = 8080;

// 1️⃣ Create HTTP server
const server = http.createServer((req, res) => {
  if (req.url === "/") {
    const filePath = path.resolve("./index.html");
    const html = fs.readFileSync(filePath);
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
  } else {
    res.writeHead(404);
    res.end();
  }
});

// 2️⃣ Attach WebSocket to same server
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("Player connected");

  ws.on("message", (data) => {
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
  console.log(`Server running on http://3.25.72.218:${PORT}`);
});