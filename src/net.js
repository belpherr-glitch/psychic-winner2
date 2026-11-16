// Multiplayer over WebRTC (PeerJS). The host owns the world; guests receive the seed + edits,
// then everyone shares player states and block changes. Star topology: the host relays.
import * as THREE from 'three';
import { buildHumanoid, instHumanoid, animateHumanoid, extrudeSprite, blockItemGeo } from './models.js';
import { SKINS } from './entities.js';
import { ITEM_BY_ID, itemPainter } from './items.js';
import { BLOCKS } from './blocks.js';

const PREFIX = 'voxilia-sala-';
// optional custom signalling server: ?peer=host:port/path
function peerOpts() {
  try { const q = new URLSearchParams(location.search).get('peer'); if (q) { const [hp, ...path] = q.split('/'); const [host, port] = hp.split(':'); return { host, port: +port || 443, path: '/' + path.join('/'), secure: location.protocol === 'https:' && !host.startsWith('localhost'), debug: 0 }; } } catch (e) { /* ignore */ }
  return { debug: 0 };
}
const COLORS = ['#2f6ab8', '#b8402e', '#2f9a4a', '#8a3ab8', '#c99a20', '#2aa8a8'];
export function roomCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

export class Net {
  constructor() {
    this.peer = null; this.conns = []; this.host = false; this.id = null;
    this.onMessage = null; this.onStatus = null; this.code = null;
  }
  get active() { return !!this.peer && (this.host || this.conns.length > 0); }
  status(t) { if (this.onStatus) this.onStatus(t); }
  available() { return typeof window.Peer === 'function'; }

  hostRoom(getInit) {
    return new Promise((resolve, reject) => {
      if (!this.available()) return reject(new Error('Multijogador indisponível aqui'));
      this.code = roomCode();
      this.host = true;
      this.peer = new window.Peer(PREFIX + this.code, peerOpts());
      this.peer.on('open', (id) => { this.id = id; this.status(`Sala ${this.code} aberta`); resolve(this.code); });
      this.peer.on('error', (e) => { this.status('Erro: ' + (e.type || e.message)); reject(e); });
      this.peer.on('connection', (c) => {
        c.on('open', () => {
          this.conns.push(c);
          c.send({ t: 'init', ...getInit(), you: c.peer });
          this.status(`${this.conns.length} jogador(es) conectado(s)`);
        });
        c.on('data', (m) => { this.relay(m, c); if (this.onMessage) this.onMessage(m, c.peer); });
        c.on('close', () => { this.conns = this.conns.filter((x) => x !== c); if (this.onMessage) this.onMessage({ t: 'leave', id: c.peer }); this.status(`${this.conns.length} jogador(es) conectado(s)`); });
      });
    });
  }
  join(code) {
    return new Promise((resolve, reject) => {
      if (!this.available()) return reject(new Error('Multijogador indisponível aqui'));
      this.code = code.toUpperCase().trim();
      this.peer = new window.Peer(undefined, peerOpts());
      const timer = setTimeout(() => reject(new Error('A sala não respondeu')), 20000);
      this.peer.on('error', (e) => { clearTimeout(timer); reject(new Error(e.type === 'peer-unavailable' ? 'Sala não encontrada' : (e.type || e.message))); });
      this.peer.on('open', (id) => {
        this.id = id;
        const c = this.peer.connect(PREFIX + this.code, { reliable: true });
        c.on('data', (m) => {
          if (m.t === 'init') { clearTimeout(timer); resolve(m); return; }
          if (this.onMessage) this.onMessage(m, c.peer);
        });
        c.on('open', () => { this.conns = [c]; });
        c.on('close', () => { this.conns = []; this.status('Desconectado da sala'); if (this.onMessage) this.onMessage({ t: 'hostgone' }); });
      });
    });
  }
  send(m) { for (const c of this.conns) if (c.open) c.send(m); }
  relay(m, from) { if (!this.host) return; for (const c of this.conns) if (c !== from && c.open) c.send(m); }
}

// Other players drawn in the world
export class RemotePlayers {
  constructor(game) { this.game = game; this.map = new Map(); this.proto = null; }
  get(id, name, colorIdx) {
    let r = this.map.get(id);
    if (!r) {
      const spec = Object.assign({}, SKINS.player, { shirt: COLORS[colorIdx % COLORS.length], seed: 50 + colorIdx });
      const rig = instHumanoid(buildHumanoid(spec));
      this.game.scene.add(rig.group);
      const label = makeLabel(name || 'Jogador');
      label.position.y = 2.3;
      rig.group.add(label);
      r = { rig, pos: new THREE.Vector3(), target: new THREE.Vector3(), yaw: 0, tyaw: 0, pitch: 0, held: -1, anim: null, t: 0, last: performance.now(), name, label, vy: 0, air: false, shadow: this.game.makeShadow(0.45) };
      this.map.set(id, r);
    }
    return r;
  }
  state(id, s) {
    const r = this.get(id, s.n, s.c || 0);
    if (r.pos.lengthSq() === 0) r.pos.set(s.x, s.y, s.z);
    r.target.set(s.x, s.y, s.z); r.tyaw = s.yaw; r.pitch = s.p; r.air = !!s.a; r.vy = s.vy || 0; r.last = performance.now();
    if (s.sw) { r.swing = s.sw; r.swingKind = s.k; r.swingT = s.sw; }
    if (s.h !== r.held) this.setHeld(r, s.h);
  }
  setHeld(r, id) {
    r.held = id;
    const hand = r.rig.hand;
    while (hand.children.length) hand.remove(hand.children[0]);
    const it = ITEM_BY_ID[id];
    if (!it) return;
    let mesh;
    if (it.type === 'block' && BLOCKS[it.block].render === 'cube') mesh = new THREE.Mesh(blockItemGeo(this.game.faceUV, it.block, 0.34), new THREE.MeshBasicMaterial({ map: this.game.atlasTex, vertexColors: true }));
    else {
      const geo = extrudeSprite(itemPainter(id), 0.95, 2.6);
      geo.translate(0.36, 0.31, 0);
      mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
      const inner = new THREE.Group(); inner.add(mesh); mesh.rotation.z = Math.PI / 4; inner.rotation.y = Math.PI / 2;
      const holder = new THREE.Group(); holder.add(inner); holder.rotation.x = 1.95;
      mesh = holder;
    }
    hand.add(mesh);
  }
  remove(id) {
    const r = this.map.get(id);
    if (!r) return;
    this.game.scene.remove(r.rig.group); this.game.scene.remove(r.shadow);
    this.map.delete(id);
  }
  update(dt) {
    for (const [id, r] of this.map) {
      if (performance.now() - r.last > 8000) { this.remove(id); continue; }
      const prev = r.pos.clone();
      r.pos.lerp(r.target, Math.min(1, dt * 10));
      let d = r.tyaw - r.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      r.yaw += d * Math.min(1, dt * 10);
      const speed = Math.hypot(r.pos.x - prev.x, r.pos.z - prev.z) / Math.max(dt, 1e-3);
      let arm = r.held >= 0 ? { x: -0.5, fore: -0.5 } : null;
      if (r.swingT > 0) {
        r.swingT -= dt;
        const e = 1 - Math.pow(r.swingT / r.swing, 3);
        arm = { x: -3.0 + 3.4 * Math.min(1, e), z: -0.3, fore: 0 };
      }
      animateHumanoid(r.rig, { dt, speed, air: r.air, vy: r.vy, armR: arm, lookPitch: -r.pitch * 0.6 });
      r.rig.group.position.copy(r.pos);
      r.rig.group.rotation.y = r.yaw + Math.PI;
      const l = this.game.lightAt(r.pos.x, r.pos.y + 1.2, r.pos.z);
      r.rig.material.color.setScalar(l);
      this.game.placeShadow(r.shadow, r.pos, 0.6);
    }
  }
}

function makeLabel(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 48;
  const g = c.getContext('2d');
  g.font = 'bold 26px "Pixelify Sans", monospace';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.strokeText(text, 128, 26);
  g.fillStyle = '#bff8ff'; g.fillText(text, 128, 26);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
  s.scale.set(2.4, 0.45, 1);
  return s;
}
