import express from 'express';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { RoomManager } from './rooms.js';

const dev = process.argv.includes('--dev');
const PORT = Number(process.env.PORT) || 5180;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const app = express();
const server = http.createServer(app);
// destroyUpgrade off so Vite's hot-reload socket can share this server in dev.
const io = new Server(server, { maxHttpBufferSize: 1e5, destroyUpgrade: false });
const rooms = new RoomManager();

function lanUrls() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => `http://${i.address}:${PORT}`);
}

function broadcast(code) {
  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.code === code) socket.emit('room', rooms.view(code, socket.data.clientId));
  }
}

const reply = (ack, result) => {
  if (typeof ack === 'function') ack(result);
};

io.on('connection', (socket) => {
  const clientId = socket.handshake.auth?.clientId;
  if (typeof clientId !== 'string' || clientId.length < 8 || clientId.length > 64) {
    socket.disconnect(true);
    return;
  }
  socket.data.clientId = clientId;
  socket.emit('hello', { lanUrls: lanUrls() });

  const enter = (code) => {
    const previous = socket.data.code;
    socket.data.code = code;
    if (previous && previous !== code) broadcast(previous);
    broadcast(code);
  };

  socket.on('create', (payload, ack) => {
    const result = rooms.createRoom(clientId, payload?.name);
    if (result.ok) enter(result.code);
    reply(ack, result);
  });

  socket.on('join', (payload, ack) => {
    const result = rooms.join(payload?.code, clientId, payload?.name);
    if (result.ok) enter(result.code);
    reply(ack, result);
  });

  socket.on('leave', (_payload, ack) => {
    const { code } = socket.data;
    if (code) {
      rooms.leave(code, clientId);
      socket.data.code = null;
      broadcast(code);
    }
    reply(ack, { ok: true });
  });

  socket.on('action', (payload, ack) => {
    const { code } = socket.data;
    if (!code) return reply(ack, { ok: false, error: 'Join a room first' });
    const result = rooms.act(code, clientId, payload?.type, payload?.payload);
    if (result.ok && !result.quiet) broadcast(code);
    return reply(ack, result);
  });

  socket.on('disconnect', () => {
    const { code } = socket.data;
    if (!code) return;
    const stillHere = [...io.sockets.sockets.values()].some(
      (s) => s !== socket && s.data.code === code && s.data.clientId === clientId,
    );
    if (!stillHere) {
      rooms.setConnected(code, clientId, false);
      broadcast(code);
    }
  });
});

setInterval(() => {
  for (const code of rooms.tick()) broadcast(code);
}, 150);

if (dev) {
  const { createServer } = await import('vite');
  const vite = await createServer({
    root,
    server: { middlewareMode: true, hmr: { server } },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  const dist = path.join(root, 'dist');
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  IPL Auction is running${dev ? ' (dev)' : ''}`);
  console.log(`  On this computer:   http://localhost:${PORT}`);
  for (const url of lanUrls()) console.log(`  Friends on Wi-Fi:   ${url}`);
  console.log('');
});
