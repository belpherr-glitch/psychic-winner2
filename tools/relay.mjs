// Relay de desenvolvimento: simula no PC a rede local do celular.
// node tools/relay.mjs  → anfitrião e convidados (abas do navegador) conversam por aqui.
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 47801 });
let host = null, roomName = '', next = 1;
const clients = new Map();

wss.on('connection', (ws, req) => {
  const q = new URL(req.url, 'http://x').searchParams;
  const role = q.get('role');
  if (role === 'probe') { if (host) ws.send(JSON.stringify({ room: roomName })); return; }
  if (role === 'host') {
    host = ws; roomName = q.get('name') || 'Sala';
    ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.to) clients.get(m.to)?.send(m.data);
      else for (const c of clients.values()) c.send(m.data);
    });
    ws.on('close', () => { host = null; for (const c of clients.values()) c.close(); });
    return;
  }
  const id = next++;
  clients.set(id, ws);
  host?.send(JSON.stringify({ ev: 'join', id }));
  ws.on('message', (raw) => host?.send(JSON.stringify({ ev: 'msg', id, data: raw.toString() })));
  ws.on('close', () => { clients.delete(id); host?.send(JSON.stringify({ ev: 'leave', id })); });
});
console.log('relay em ws://localhost:47801');
