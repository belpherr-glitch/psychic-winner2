// Transporte da rede local.
// No celular: plugin nativo LanNet (servidor WebSocket + anúncio UDP no anfitrião).
// No navegador (desenvolvimento): relay em ws://localhost:47801 (tools/relay.mjs).
import { registerPlugin, Capacitor } from '@capacitor/core';

const LanNet = registerPlugin('LanNet');
export const isNative = () => Capacitor.isNativePlatform();
export const PORT = 47800;
const DEV_RELAY = 'ws://localhost:47801';

// ---------- anfitrião ----------
export class HostLink {
  constructor() { this.onJoin = null; this.onLeave = null; this.onMsg = null; this.ip = ''; this.handles = []; }
  async start(name) {
    if (isNative()) {
      const r = await LanNet.host({ port: PORT, name });
      this.ip = r.ip;
      this.handles.push(await LanNet.addListener('join', (e) => this.onJoin && this.onJoin(e.id)));
      this.handles.push(await LanNet.addListener('leave', (e) => this.onLeave && this.onLeave(e.id)));
      this.handles.push(await LanNet.addListener('msg', (e) => this.onMsg && this.onMsg(e.id, e.data)));
      return this.ip;
    }
    // navegador: relay de desenvolvimento
    await new Promise((res, rej) => {
      const ws = (this.ws = new WebSocket(DEV_RELAY + '?role=host&name=' + encodeURIComponent(name)));
      ws.onopen = res;
      ws.onerror = () => rej(new Error('Relay de desenvolvimento não está rodando (node tools/relay.mjs).'));
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.ev === 'join') this.onJoin && this.onJoin(m.id);
        else if (m.ev === 'leave') this.onLeave && this.onLeave(m.id);
        else if (m.ev === 'msg') this.onMsg && this.onMsg(m.id, m.data);
      };
    });
    this.ip = 'localhost';
    return this.ip;
  }
  send(data, to = 0) {
    if (isNative()) LanNet.send({ data, to }).catch(() => {});
    else if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ to, data }));
  }
  async stop() {
    for (const h of this.handles) try { h.remove(); } catch (_) { /* ok */ }
    this.handles = [];
    if (isNative()) await LanNet.stop().catch(() => {});
    if (this.ws) this.ws.close();
  }
}

// ---------- convidado ----------
export class ClientLink {
  constructor() { this.onMsg = null; this.onClose = null; this.ws = null; }
  connect(ip) {
    return new Promise((res, rej) => {
      const url = isNative() || ip !== 'localhost' ? `ws://${ip}:${PORT}` : DEV_RELAY + '?role=client';
      const ws = (this.ws = new WebSocket(url));
      const t = setTimeout(() => { ws.close(); rej(new Error('Sem resposta da sala.')); }, 6000);
      ws.onopen = () => { clearTimeout(t); res(); };
      ws.onerror = () => { clearTimeout(t); rej(new Error('Não foi possível conectar.')); };
      ws.onclose = () => this.onClose && this.onClose();
      ws.onmessage = (ev) => this.onMsg && this.onMsg(ev.data);
    });
  }
  send(data) { if (this.ws && this.ws.readyState === 1) this.ws.send(data); }
  close() { if (this.ws) { this.ws.onclose = null; this.ws.close(); } }
}

// procura salas anunciadas na rede
export async function discoverRooms(onRoom, ms = 3000) {
  if (!isNative()) {
    // navegador: o relay de desenvolvimento faz papel de sala local
    try {
      const ws = new WebSocket(DEV_RELAY + '?role=probe');
      await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
      ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.room) onRoom({ ip: 'localhost', port: PORT, name: m.room }); };
      await new Promise((r) => setTimeout(r, 600));
      ws.close();
    } catch (_) { /* sem relay */ }
    return;
  }
  const h = await LanNet.addListener('room', onRoom);
  try { await LanNet.discover({ ms }); } finally { h.remove(); }
}
