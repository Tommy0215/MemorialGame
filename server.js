import http from "http";
import fs from "fs";
import path from "path";
import { WebSocketServer } from "ws";

const PORT = 8080;
const IP = "3.25.72.218";

// HTTP server to serve static files
const server = http.createServer((req, res) => {
  // Normalize the path
  let filePath = req.url === "/" ? "/index.html" : req.url;
  filePath = path.join(process.cwd(), filePath);

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
  console.log(`Server running on http://${IP}:${PORT}`);
});