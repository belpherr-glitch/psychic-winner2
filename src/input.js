// Controles: dois joysticks flutuantes (esquerdo dirige, direito opera a hidráulica),
// arrastar no alto da tela gira a câmera, pinça dá zoom. Teclado para testes no PC.
import { clamp } from './util.js';

const RAD = 58;

export class Input {
  constructor(layer, stickL, stickR) {
    this.layer = layer;
    this.L = { el: stickL, knob: stickL.querySelector('.knob'), id: null, x: 0, y: 0, ox: 0, oy: 0 };
    this.R = { el: stickR, knob: stickR.querySelector('.knob'), id: null, x: 0, y: 0, ox: 0, oy: 0 };
    this.cam = new Map();
    this.camDX = 0; this.camDY = 0; this.zoom = 0;
    this.keys = new Set();
    this.onFirst = null;
    layer.addEventListener('pointerdown', (e) => this.down(e));
    layer.addEventListener('pointermove', (e) => this.move(e));
    layer.addEventListener('pointerup', (e) => this.up(e));
    layer.addEventListener('pointercancel', (e) => this.up(e));
    layer.addEventListener('wheel', (e) => { this.zoom += Math.sign(e.deltaY) * 1.2; e.preventDefault(); }, { passive: false });
    layer.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', (e) => { this.keys.add(e.code); this.first(); });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.release(this.L); this.release(this.R); });
  }
  first() { if (this.onFirst) { this.onFirst(); } }

  down(e) {
    this.first();
    const w = innerWidth, h = innerHeight;
    const low = e.clientY > h * 0.36;
    let s = null;
    if (low && e.clientX < w * 0.45 && this.L.id === null) s = this.L;
    else if (low && e.clientX > w * 0.55 && this.R.id === null) s = this.R;
    try { this.layer.setPointerCapture(e.pointerId); } catch (_) { /* sem captura */ }
    if (s) {
      s.id = e.pointerId;
      s.ox = e.clientX; s.oy = e.clientY;
      s.el.classList.add('active');
      s.el.style.left = e.clientX + 'px';
      s.el.style.top = e.clientY + 'px';
      this.setKnob(s, 0, 0);
    } else {
      this.cam.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
  }
  move(e) {
    for (const s of [this.L, this.R]) {
      if (s.id !== e.pointerId) continue;
      let dx = e.clientX - s.ox, dy = e.clientY - s.oy;
      const d = Math.hypot(dx, dy);
      if (d > RAD) { dx *= RAD / d; dy *= RAD / d; }
      this.setKnob(s, dx, dy);
      return;
    }
    const c = this.cam.get(e.pointerId);
    if (!c) return;
    if (this.cam.size >= 2) {
      const pts = [...this.cam.values()];
      const before = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      c.x = e.clientX; c.y = e.clientY;
      const after = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      this.zoom -= (after - before) * 0.04;
      return;
    }
    this.camDX += e.clientX - c.x;
    this.camDY += e.clientY - c.y;
    c.x = e.clientX; c.y = e.clientY;
  }
  up(e) {
    for (const s of [this.L, this.R]) if (s.id === e.pointerId) this.release(s);
    this.cam.delete(e.pointerId);
  }
  release(s) {
    s.id = null; s.x = 0; s.y = 0;
    s.el.classList.remove('active');
    s.el.style.left = ''; s.el.style.top = '';
    this.setKnob(s, 0, 0);
  }
  setKnob(s, dx, dy) {
    s.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const dead = 0.1;
    const f = (v) => { const a = Math.abs(v) / RAD; return a < dead ? 0 : Math.sign(v) * ((a - dead) / (1 - dead)); };
    s.x = f(dx); s.y = f(dy);
  }
  takeCam() {
    const r = { dx: this.camDX, dy: this.camDY, zoom: this.zoom };
    this.camDX = 0; this.camDY = 0; this.zoom = 0;
    return r;
  }
  state() {
    const k = this.keys;
    const kv = (a, b) => (k.has(a) || k.has(b) ? 1 : 0);
    const thr = clamp(-this.L.y + kv('KeyW', 'ArrowUp') - kv('KeyS', 'ArrowDown'), -1, 1);
    const steer = clamp(this.L.x + kv('KeyD', 'ArrowRight') - kv('KeyA', 'ArrowLeft'), -1, 1);
    const ty = clamp(-this.R.y + kv('KeyI', 'KeyR') - kv('KeyK', 'KeyF'), -1, 1);
    const tx = clamp(this.R.x + kv('KeyL', 'KeyE') - kv('KeyJ', 'KeyQ'), -1, 1);
    return { thr, steer, ty, tx };
  }
  reset() { this.release(this.L); this.release(this.R); this.cam.clear(); this.keys.clear(); }
}
