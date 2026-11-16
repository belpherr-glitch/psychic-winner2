// Controles de toque: o analógico virtual aparece onde o dedo tocar. No criador, arrastar gira o personagem.
// No teclado (pra testar no PC): WASD/setas, Shift anda devagar.
export class Input {
  constructor(el, stickEl) {
    this.move = { x: 0, y: 0 }; // -1..1 (y pra frente)
    this.lookDX = 0;
    this.lookDY = 0;
    this.mode = 'none'; // 'play' | 'rotate' | 'none'
    this.keys = new Set();
    this.stickEl = stickEl;
    this.knob = stickEl.querySelector('.knob');
    this.stickId = null;
    this.lookId = null;
    this.R = 56;

    const down = (e) => {
      if (this.mode === 'none') return;
      e.preventDefault();
      if (this.mode === 'play') {
        if (this.stickId !== null) return;
        this.stickId = e.pointerId;
        this.ox = e.clientX;
        this.oy = e.clientY;
        this.placeStick(e.clientX, e.clientY, 0, 0, true);
      } else if (this.lookId === null) {
        this.lookId = e.pointerId;
        this.lx = e.clientX;
        this.ly = e.clientY;
      }
    };
    const moveEv = (e) => {
      if (e.pointerId === this.stickId) {
        let dx = e.clientX - this.ox, dy = e.clientY - this.oy;
        const len = Math.hypot(dx, dy);
        if (len > this.R) { dx *= this.R / len; dy *= this.R / len; }
        this.move.x = dx / this.R;
        this.move.y = -dy / this.R;
        this.placeStick(this.ox, this.oy, dx, dy, true);
      } else if (e.pointerId === this.lookId) {
        this.lookDX += e.clientX - this.lx;
        this.lookDY += e.clientY - this.ly;
        this.lx = e.clientX;
        this.ly = e.clientY;
      }
    };
    const up = (e) => {
      if (e.pointerId === this.stickId) {
        this.stickId = null;
        this.move.x = this.move.y = 0;
        this.resetStick();
      }
      if (e.pointerId === this.lookId) this.lookId = null;
    };
    el.addEventListener('pointerdown', down);
    addEventListener('pointermove', moveEv);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    addEventListener('keydown', (e) => { if (e.target.tagName !== 'INPUT') this.keys.add(e.code); });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    this.resetStick();
  }

  setMode(m) {
    this.mode = m;
    this.stickId = this.lookId = null;
    this.move.x = this.move.y = 0;
    this.lookDX = this.lookDY = 0;
    this.resetStick();
  }
  placeStick(x, y, dx, dy, active) {
    this.stickEl.style.left = x + 'px';
    this.stickEl.style.top = y + 'px';
    this.stickEl.style.bottom = 'auto';
    this.stickEl.classList.toggle('active', active);
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  resetStick() {
    this.stickEl.style.left = '';
    this.stickEl.style.top = '';
    this.stickEl.style.bottom = '';
    this.stickEl.classList.remove('active');
    this.knob.style.transform = '';
  }

  // vetor de movimento final (toque ou teclado), módulo <= 1
  getMove() {
    const k = this.keys;
    let x = this.move.x, y = this.move.y;
    const kx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const ky = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    if (kx || ky) {
      const l = Math.hypot(kx, ky), s = k.has('ShiftLeft') || k.has('ShiftRight') ? 0.45 : 1;
      x = (kx / l) * s;
      y = (ky / l) * s;
    }
    const m = Math.hypot(x, y);
    if (m < 0.14) return { x: 0, y: 0, m: 0 };
    return { x: x / m, y: y / m, m: Math.min(1, m) };
  }
  takeLook() {
    const d = { x: this.lookDX, y: this.lookDY };
    this.lookDX = this.lookDY = 0;
    return d;
  }
}
