// Simple WebSocket relay server for multiplayer (ESM-friendly)
// Run with:
//   npm install ws
//   node server.js

import WebSocket, { WebSocketServer } from "ws";

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws) => {
  ws.on("message", (data) => {
    // Broadcast any state message to all other clients
    for (const client of wss.clients) {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  });

  ws.on("close", () => {
    // Clients clean themselves up when they stop receiving updates
  });
});

console.log(`Multiplayer server running on ws://localhost:${PORT}`);

