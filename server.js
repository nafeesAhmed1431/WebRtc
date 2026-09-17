const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const { randomUUID } = require('crypto');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// roomId -> Set of client sockets
const rooms = new Map();

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

wss.on('connection', (ws) => {
  ws.id = randomUUID();
  ws.roomId = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type === 'join') {
      const roomId = msg.roomId;
      let peers = rooms.get(roomId);
      if (!peers) {
        peers = new Set();
        rooms.set(roomId, peers);
      }

      if (peers.size >= 2) {
        send(ws, { type: 'full' });
        return;
      }

      const existing = [...peers];
      peers.add(ws);
      ws.roomId = roomId;

      send(ws, { type: 'joined', id: ws.id, initiator: existing.length === 0 });
      for (const peer of existing) send(peer, { type: 'peer-joined' });
      return;
    }

    // relay signaling messages (offer/answer/ice-candidate) to the other peer in the room
    if (['offer', 'answer', 'ice-candidate'].includes(msg.type)) {
      const peers = rooms.get(ws.roomId);
      if (!peers) return;
      for (const peer of peers) {
        if (peer !== ws) send(peer, { ...msg, from: ws.id });
      }
    }
  });

  ws.on('close', () => {
    if (!ws.roomId) return;
    const peers = rooms.get(ws.roomId);
    if (!peers) return;
    peers.delete(ws);
    for (const peer of peers) send(peer, { type: 'peer-left' });
    if (peers.size === 0) rooms.delete(ws.roomId);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`WebRTC signaling server on http://localhost:${PORT}`));
