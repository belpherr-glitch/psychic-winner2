// Touch (virtual joystick + drag-to-look + buttons) and keyboard/mouse input.
export class Input {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.moveX = 0; this.moveY = 0;
    this.lookX = 0; this.lookY = 0;
    this.jump = false; this.sprint = false;
    this.attack = false; this.useHeld = false;
    this.events = [];
    this.keys = new Set();
    this.enabled = true;
    this.touchMode = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.looks = new Map();
    this.locked = false;
    this.setupTouch();
    this.setupDesktop();
  }
  emit(e) { this.events.push(e); }
  poll() { const e = this.events; this.events = []; return e; }

  setupTouch() {
    const joyZone = document.getElementById('joyzone');
    const knob = document.getElementById('joyknob');
    const base = document.getElementById('joybase');
    const R = 52;
    const setKnob = () => {
      base.style.transform = `translate(${this.joy.ox - 60}px, ${this.joy.oy - 60}px)`;
      knob.style.transform = `translate(${this.joy.ox + this.joy.x * R - 26}px, ${this.joy.oy + this.joy.y * R - 26}px)`;
    };
    joyZone.addEventListener('pointerdown', (e) => {
      if (this.joy.id !== null) return;
      e.preventDefault();
      joyZone.setPointerCapture(e.pointerId);
      this.joy.id = e.pointerId;
      const r = joyZone.getBoundingClientRect();
      this.joy.ox = e.clientX - r.left; this.joy.oy = e.clientY - r.top;
      this.joy.x = this.joy.y = 0;
      joyZone.classList.add('active');
      setKnob();
    });
    joyZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.joy.id) return;
      const r = joyZone.getBoundingClientRect();
      let dx = (e.clientX - r.left - this.joy.ox) / R, dy = (e.clientY - r.top - this.joy.oy) / R;
      const m = Math.hypot(dx, dy);
      if (m > 1) { dx /= m; dy /= m; }
      this.joy.x = dx; this.joy.y = dy;
      setKnob();
    });
    const end = (e) => {
      if (e.pointerId !== this.joy.id) return;
      this.joy.id = null; this.joy.x = this.joy.y = 0;
      joyZone.classList.remove('active');
      setKnob();
    };
    joyZone.addEventListener('pointerup', end);
    joyZone.addEventListener('pointercancel', end);

    // look area
    const look = document.getElementById('lookzone');
    look.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      e.preventDefault();
      look.setPointerCapture(e.pointerId);
      this.looks.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
    });
    look.addEventListener('pointermove', (e) => {
      const l = this.looks.get(e.pointerId);
      if (!l) return;
      const s = this.settings.touchSens * 0.005;
      this.lookX += (e.clientX - l.x) * s;
      this.lookY += (e.clientY - l.y) * s;
      l.x = e.clientX; l.y = e.clientY;
    });
    const lend = (e) => {
      const l = this.looks.get(e.pointerId);
      if (!l) return;
      this.looks.delete(e.pointerId);
      if (performance.now() - l.t < 220 && Math.hypot(e.clientX - l.sx, e.clientY - l.sy) < 10) this.emit({ type: 'tap' });
    };
    look.addEventListener('pointerup', lend);
    look.addEventListener('pointercancel', lend);

    // buttons
    document.querySelectorAll('[data-hold]').forEach((b) => {
      const k = b.dataset.hold;
      const on = (e) => { e.preventDefault(); b.setPointerCapture && b.setPointerCapture(e.pointerId); this[k] = true; b.classList.add('down'); if (k === 'useHeld') this.emit({ type: 'use' }); };
      const off = (e) => { e.preventDefault(); this[k] = false; b.classList.remove('down'); };
      b.addEventListener('pointerdown', on);
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
      b.addEventListener('lostpointercapture', off);
    });
    document.querySelectorAll('[data-tap]').forEach((b) => {
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.emit({ type: b.dataset.tap }); b.classList.add('down'); setTimeout(() => b.classList.remove('down'), 120); });
    });
  }

  setupDesktop() {
    const c = this.canvas;
    const look = document.getElementById('lookzone');
    look.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked && !this.touchMode) { try { const r = c.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (err) { /* ignore */ } }
      if (e.button === 0) this.attack = true;
      if (e.button === 2) { this.useHeld = true; this.emit({ type: 'use' }); }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.attack = false;
      if (e.button === 2) this.useHeld = false;
    });
    look.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === c; });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      const s = this.settings.mouseSens * 0.0022;
      this.lookX += e.movementX * s;
      this.lookY += e.movementY * s;
    });
    window.addEventListener('wheel', (e) => { if (this.enabled) this.emit({ type: 'scroll', dir: Math.sign(e.deltaY) }); }, { passive: true });
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys.add(e.code);
      if (k >= '1' && k <= '9') this.emit({ type: 'slot', n: +k - 1 });
      if (k === 'e' || k === 'i') this.emit({ type: 'inv' });
      if (k === 'c') this.emit({ type: 'craft' });
      if (k === 'v' || e.code === 'F5') { e.preventDefault(); this.emit({ type: 'cam' }); }
      if (k === 'f') this.emit({ type: 'talk' });
      if (k === 'q') this.emit({ type: 'quick' });
      if (k === 'escape') this.emit({ type: 'pause' });
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.attack = false; this.useHeld = false; });
  }

  frame() {
    let mx = this.joy.x, my = -this.joy.y;
    const K = this.keys;
    if (K.has('KeyW') || K.has('ArrowUp')) my += 1;
    if (K.has('KeyS') || K.has('ArrowDown')) my -= 1;
    if (K.has('KeyA') || K.has('ArrowLeft')) mx -= 1;
    if (K.has('KeyD') || K.has('ArrowRight')) mx += 1;
    const m = Math.hypot(mx, my);
    if (m > 1) { mx /= m; my /= m; }
    const out = {
      moveX: this.enabled ? mx : 0, moveY: this.enabled ? my : 0,
      lookX: this.enabled ? this.lookX : 0, lookY: this.enabled ? this.lookY * (this.settings.invertY ? -1 : 1) : 0,
      jump: this.enabled && (this.jump || K.has('Space')),
      sprint: K.has('ShiftLeft') || K.has('ShiftRight') || Math.hypot(this.joy.x, this.joy.y) > 0.92,
      attack: this.enabled && this.attack,
      useHeld: this.enabled && this.useHeld,
    };
    this.lookX = 0; this.lookY = 0;
    return out;
  }
  release() { this.attack = false; this.useHeld = false; this.jump = false; if (document.pointerLockElement) document.exitPointerLock(); }
}
