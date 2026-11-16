// Small pixel-art painting toolkit used for blocks, items and models.
import { mulberry32, hash2 } from './noise.js';

const cache = new Map();
export function rgb(hex) {
  let c = cache.get(hex);
  if (c) return c;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) : 255;
  c = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), a];
  cache.set(hex, c);
  return c;
}

export function mix(a, b, t) {
  const A = typeof a === 'string' ? rgb(a) : a;
  const B = typeof b === 'string' ? rgb(b) : b;
  return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t, A[3] + (B[3] - A[3]) * t];
}

export function shade(c, k) {
  const A = typeof c === 'string' ? rgb(c) : c;
  return [Math.min(255, A[0] * k), Math.min(255, A[1] * k), Math.min(255, A[2] * k), A[3]];
}

// Tileable value noise in [0,1)
export function vnoise(x, y, period, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const m = (v) => ((v % period) + period) % period;
  const a = hash2(m(x0), m(y0), seed), b = hash2(m(x0 + 1), m(y0), seed);
  const c = hash2(m(x0), m(y0 + 1), seed), d = hash2(m(x0 + 1), m(y0 + 1), seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// A painter over a w*h RGBA buffer.
export class Painter {
  constructor(w, h, seed = 1) {
    this.w = w; this.h = h;
    this.buf = new Uint8ClampedArray(w * h * 4);
    this.r = mulberry32(seed);
    this.seed = seed;
  }
  rand() { return this.r(); }
  ri(n) { return Math.floor(this.r() * n); }
  pick(arr) { return arr[Math.floor(this.r() * arr.length)]; }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  set(x, y, c) {
    if (!this.inb(x, y)) return;
    const C = typeof c === 'string' ? rgb(c) : c;
    const i = (y * this.w + x) * 4;
    this.buf[i] = C[0]; this.buf[i + 1] = C[1]; this.buf[i + 2] = C[2]; this.buf[i + 3] = C[3] === undefined ? 255 : C[3];
  }
  setW(x, y, c) { // wrapped set
    x = ((x % this.w) + this.w) % this.w; y = ((y % this.h) + this.h) % this.h;
    this.set(x, y, c);
  }
  get(x, y) {
    if (!this.inb(x, y)) return [0, 0, 0, 0];
    const i = (y * this.w + x) * 4;
    return [this.buf[i], this.buf[i + 1], this.buf[i + 2], this.buf[i + 3]];
  }
  alpha(x, y) { return this.inb(x, y) ? this.buf[(y * this.w + x) * 4 + 3] : 0; }
  fill(c) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.set(x, y, c); }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  mul(x, y, k) { const c = this.get(x, y); if (c[3]) this.set(x, y, shade(c, k)); }
  // weighted speckle fill from palette
  speckle(pal, weights) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      this.set(x, y, pal[pickWeighted(this.r, weights || pal.map(() => 1))]);
    }
  }
  // clustered noise mapped to palette (dark->light order)
  clouds(pal, scale = 4, seedOff = 0, jitter = 0.18) {
    const p = Math.max(1, Math.round(this.w / scale));
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      let v = vnoise(x / scale, y / scale, p, this.seed + seedOff) * 0.7 +
        vnoise(x / (scale / 2), y / (scale / 2), p * 2, this.seed + seedOff + 7) * 0.3;
      v += (this.r() - 0.5) * jitter;
      const idx = Math.max(0, Math.min(pal.length - 1, Math.floor(v * pal.length)));
      this.set(x, y, pal[idx]);
    }
  }
  bevel(light = 1.12, dark = 0.8) {
    for (let i = 0; i < this.w; i++) { this.mul(i, 0, light); this.mul(i, this.h - 1, dark); }
    for (let j = 1; j < this.h - 1; j++) { this.mul(0, j, light); this.mul(this.w - 1, j, dark); }
  }
  // Voronoi cobbles: cells with darker seams and lit upper-left edges.
  cobble(pal, seam, nCells = 6, hl = 1.18) {
    const pts = [];
    for (let i = 0; i < nCells; i++) pts.push([this.r() * this.w, this.r() * this.h, pal[this.ri(pal.length)]]);
    const W = this.w, H = this.h;
    const owner = new Int16Array(W * H);
    const d2 = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let best = 1e9, second = 1e9, bi = 0;
      for (let k = 0; k < pts.length; k++) {
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          const dx = x + 0.5 - (pts[k][0] + ox * W), dy = y + 0.5 - (pts[k][1] + oy * H);
          const d = dx * dx + dy * dy;
          if (d < best) { second = best; best = d; bi = k; } else if (d < second) second = d;
        }
      }
      owner[y * W + x] = bi;
      d2[y * W + x] = Math.sqrt(second) - Math.sqrt(best);
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const o = owner[y * W + x];
      let c = pts[o][2];
      const n = (this.r() - 0.5) * 0.12 + 1;
      if (d2[y * W + x] < 0.9) { this.set(x, y, seam); continue; }
      const up = owner[((y + H - 1) % H) * W + x], lf = owner[y * W + ((x + W - 1) % W)];
      const dn = owner[((y + 1) % H) * W + x], rt = owner[y * W + ((x + 1) % W)];
      let k = n;
      if (up !== o || lf !== o) k *= hl;
      else if (dn !== o || rt !== o) k *= 0.86;
      this.set(x, y, shade(c, k));
    }
  }
  // Draws dark outline around opaque pixels into transparent neighbours.
  outline(col, diag = false) {
    const add = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.alpha(x, y)) continue;
      let n = this.alpha(x - 1, y) || this.alpha(x + 1, y) || this.alpha(x, y - 1) || this.alpha(x, y + 1);
      if (!n && diag) n = this.alpha(x - 1, y - 1) || this.alpha(x + 1, y + 1) || this.alpha(x + 1, y - 1) || this.alpha(x - 1, y + 1);
      if (n) add.push([x, y]);
    }
    for (const [x, y] of add) this.set(x, y, col);
  }
  line(x0, y0, x1, y1, c) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  disc(cx, cy, r, c) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r * r) this.set(x, y, c);
      }
  }
  toImageData() { return new ImageData(this.buf, this.w, this.h); }
  toCanvas(scale = 1) {
    const c = document.createElement('canvas');
    c.width = this.w * scale; c.height = this.h * scale;
    const ctx = c.getContext('2d');
    if (scale === 1) ctx.putImageData(this.toImageData(), 0, 0);
    else {
      const t = document.createElement('canvas'); t.width = this.w; t.height = this.h;
      t.getContext('2d').putImageData(this.toImageData(), 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(t, 0, 0, c.width, c.height);
    }
    return c;
  }
  blitTo(ctx, x, y) { ctx.putImageData(this.toImageData(), x, y); }
}

export function pickWeighted(r, w) {
  let s = 0;
  for (const v of w) s += v;
  let t = r() * s;
  for (let i = 0; i < w.length; i++) { t -= w[i]; if (t <= 0) return i; }
  return w.length - 1;
}
