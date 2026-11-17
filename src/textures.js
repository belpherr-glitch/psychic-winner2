// Texturas pixel art geradas por código (sem arquivos externos, tudo leve).
import * as THREE from 'three';

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hex(c) {
  return '#' + new THREE.Color(c).getHexString();
}
// clareia (amt>0) ou escurece (amt<0) uma cor
export function shade(c, amt) {
  const col = new THREE.Color(c);
  const hsl = {};
  col.getHSL(hsl);
  // sombras puxam pro roxo/azul, luzes pro amarelo: deixa o pixel art mais "cozy"
  const h = hsl.h + (amt < 0 ? 0.02 : -0.012) * Math.min(1, Math.abs(amt) * 4);
  col.setHSL((h + 1) % 1, Math.min(1, hsl.s * (1 + (amt < 0 ? 0.12 : -0.05))), THREE.MathUtils.clamp(hsl.l + amt, 0, 1));
  return '#' + col.getHexString();
}

export function canvasTex(w, h, draw, { repeat = false, mip = false, smooth = false } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = smooth ? THREE.LinearFilter : THREE.NearestFilter;
  if (smooth) mip = true;
  t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.NearestFilter;
  t.generateMipmaps = mip;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const P = (ctx, x, y, c, w = 1, h = 1) => {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
};

// granulado sutil: multiplica a cor do material e dá cara de pixel art nas peças lisas
let _noise;
export function noiseTex() {
  if (_noise) return _noise;
  const r = rng(11);
  _noise = canvasTex(8, 8, (ctx) => {
    P(ctx, 0, 0, '#ffffff', 8, 8);
    for (let i = 0; i < 9; i++) P(ctx, (r() * 8) | 0, (r() * 8) | 0, r() < 0.5 ? '#e9e4ee' : '#f6f2ea');
  }, { repeat: true });
  return _noise;
}

function specks(ctx, w, h, r, colors, n) {
  for (let i = 0; i < n; i++) P(ctx, (r() * w) | 0, (r() * h) | 0, colors[(r() * colors.length) | 0]);
}

export function plankTex() {
  const r = rng(21);
  return canvasTex(32, 32, (ctx) => {
    P(ctx, 0, 0, '#f3e4c1', 32, 32);
    for (let row = 0; row < 4; row++) {
      const y = row * 8;
      P(ctx, 0, y, '#fbf0d4', 32, 1);
      P(ctx, 0, y + 7, '#cdb78c', 32, 1);
      const j = (row * 13 + 5) % 32;
      P(ctx, j, y, '#cdb78c', 1, 7);
      for (let i = 0; i < 5; i++) P(ctx, (r() * 32) | 0, y + 1 + ((r() * 6) | 0), '#e6d4aa', 2 + ((r() * 3) | 0), 1);
    }
  }, { repeat: true, mip: true });
}

export function shingleTex() {
  return canvasTex(32, 32, (ctx) => {
    P(ctx, 0, 0, '#c9573f', 32, 32);
    for (let row = 0; row < 4; row++) {
      const y = row * 8;
      const off = row % 2 ? 4 : 0;
      P(ctx, 0, y + 7, '#96392f', 32, 1);
      P(ctx, 0, y, '#de7152', 32, 1);
      for (let x = off; x < 32 + off; x += 8) {
        P(ctx, x % 32, y, '#96392f', 1, 8);
        P(ctx, (x + 1) % 32, y + 1, '#e58a66', 2, 1);
        P(ctx, (x + 5) % 32, y + 5, '#b54a38', 2, 1);
      }
    }
  }, { repeat: true, mip: true });
}

export function stoneTex() {
  const r = rng(33);
  return canvasTex(32, 32, (ctx) => {
    P(ctx, 0, 0, '#8f8a99', 32, 32);
    for (let row = 0; row < 4; row++) {
      const y = row * 8;
      const off = row % 2 ? 6 : 0;
      for (let x = off; x < 32 + off; x += 12) {
        const c = ['#aaa5b3', '#9d98a8', '#b6b1bd'][(r() * 3) | 0];
        for (let i = 0; i < 11; i++) P(ctx, (x + i) % 32, y + 1, c, 1, 6);
        P(ctx, (x + 1) % 32, y + 1, '#c9c5cf', 3, 1);
      }
    }
    specks(ctx, 32, 32, r, ['#7d7888'], 14);
  }, { repeat: true, mip: true });
}

export function brickTex() {
  return canvasTex(16, 16, (ctx) => {
    P(ctx, 0, 0, '#d9c7b0', 16, 16);
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? 4 : 0;
      for (let x = off; x < 16 + off; x += 8) {
        for (let i = 0; i < 7; i++) P(ctx, (x + i) % 16, row * 4, i < 2 ? '#c8684b' : '#b3523d', 1, 3);
      }
    }
  }, { repeat: true });
}

export function woodTex() {
  const r = rng(44);
  return canvasTex(16, 16, (ctx) => {
    P(ctx, 0, 0, '#b07a45', 16, 16);
    for (let x = 0; x < 16; x++) {
      if (r() < 0.3) P(ctx, x, 0, '#96633a', 1, 16);
      else if (r() < 0.25) P(ctx, x, 0, '#c48d54', 1, 16);
    }
    specks(ctx, 16, 16, r, ['#7f5231', '#cf9b62'], 10);
  }, { repeat: true });
}

export function barkTex() {
  const r = rng(55);
  return canvasTex(16, 16, (ctx) => {
    P(ctx, 0, 0, '#7d5638', 16, 16);
    for (let i = 0; i < 16; i++) {
      const x = (r() * 16) | 0, y = (r() * 16) | 0, l = 3 + ((r() * 6) | 0);
      for (let k = 0; k < l; k++) P(ctx, x, (y + k) % 16, i % 3 ? '#624130' : '#96693f');
    }
  }, { repeat: true });
}

export function leafTex(base, seed = 66) {
  const r = rng(seed);
  const light = shade(base, 0.09), dark = shade(base, -0.08), hi = shade(base, 0.17);
  return canvasTex(32, 32, (ctx) => {
    P(ctx, 0, 0, hex(base), 32, 32);
    for (let i = 0; i < 26; i++) {
      const x = (r() * 32) | 0, y = (r() * 32) | 0;
      // cachinho de folha: meia-lua clara com sombra embaixo
      P(ctx, x, y, light, 3, 1);
      P(ctx, (x + 31) % 32, (y + 1) % 32, light, 1, 1);
      P(ctx, (x + 3) % 32, (y + 1) % 32, light, 1, 1);
      P(ctx, x, (y + 2) % 32, dark, 3, 1);
      if (i % 4 === 0) P(ctx, (x + 1) % 32, y, hi, 1, 1);
    }
    specks(ctx, 32, 32, r, [dark], 30);
  }, { repeat: true, mip: true });
}

export function doorTex() {
  return canvasTex(16, 24, (ctx) => {
    P(ctx, 0, 0, '#6b4429', 16, 24);
    P(ctx, 1, 1, '#a76a3c', 14, 23);
    for (let x = 1; x < 15; x += 5) P(ctx, x + 4, 1, '#8a5530', 1, 23);
    P(ctx, 1, 1, '#c28450', 14, 1);
    // janelinha
    P(ctx, 4, 4, '#6b4429', 8, 7);
    P(ctx, 5, 5, '#ffe9a6', 6, 5);
    P(ctx, 5, 5, '#fff6d6', 2, 2);
    P(ctx, 8, 5, '#6b4429', 1, 5);
    // maçaneta
    P(ctx, 12, 14, '#f6cf57', 2, 2);
    P(ctx, 12, 16, '#b98a2a', 2, 1);
  });
}

export function windowTex() {
  return canvasTex(16, 16, (ctx) => {
    P(ctx, 0, 0, '#7a4f33', 16, 16);
    P(ctx, 1, 1, '#fdf6e3', 14, 14);
    P(ctx, 2, 2, '#8fd3e8', 12, 11);
    P(ctx, 2, 2, '#b9e9f5', 12, 3);
    P(ctx, 3, 3, '#ffffff', 2, 1);
    P(ctx, 3, 4, '#ffffff', 1, 1);
    P(ctx, 10, 9, '#74bedb', 3, 3);
    P(ctx, 7, 2, '#fdf6e3', 2, 11);
    P(ctx, 2, 7, '#fdf6e3', 12, 1);
    P(ctx, 0, 14, '#a8744a', 16, 2);
    P(ctx, 0, 14, '#c79160', 16, 1);
  });
}

export function tuftTex(seed, base = '#6fb84c') {
  const r = rng(seed);
  const cols = [shade(base, -0.07), hex(base), shade(base, 0.08), shade(base, 0.15)];
  return canvasTex(16, 16, (ctx) => {
    for (let i = 0; i < 9; i++) {
      const x = 1 + ((r() * 14) | 0);
      const h = 5 + ((r() * 10) | 0);
      const c = cols[(r() * 3) | 0];
      const lean = r() < 0.5 ? -1 : 1;
      for (let k = 0; k < h; k++) {
        const xx = x + (k > h * 0.6 ? lean : 0);
        P(ctx, xx, 15 - k, k === h - 1 ? cols[3] : c);
      }
    }
  });
}

export function flowerTex(petal, center = '#ffd84a') {
  return canvasTex(16, 16, (ctx) => {
    const stem = '#4f9a3d';
    const draw = (x, top) => {
      P(ctx, x, top + 2, stem, 1, 15 - top - 1);
      P(ctx, x - 1, top + 6, stem, 1, 1);
      P(ctx, x + 1, top + 8, '#66b548', 1, 1);
      P(ctx, x - 1, top, petal, 3, 3);
      P(ctx, x - 2, top + 1, petal, 5, 1);
      P(ctx, x, top - 1, petal, 1, 5);
      P(ctx, x, top + 1, center, 1, 1);
      P(ctx, x - 1, top, shade(petal, 0.12), 1, 1);
    };
    draw(4, 4);
    draw(11, 7);
    draw(8, 1);
  });
}

// ---------- chão da fazenda: um grande canvas pintado pixel a pixel ----------
const FARM = 64; // unidades cobertas pelo canvas (16 px por unidade)
const PPU = 16;

function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export const LAYOUT = {
  field: { cx: 8, cz: 5, hx: 10, hz: 9, r: 2.5 },
  pond: { x: 17.5, z: -17, r: 4.9 },
  house: { x: -9, z: -20, w: 9, d: 6.5 },
  path: [[-9, -16.6], [-9, -11], [-9.6, -2], [-8.6, 9], [-5.5, 18], [-1.2, 24], [0, 30]],
  fence: 28,
};

function sdField(x, z) {
  const f = LAYOUT.field;
  const qx = Math.abs(x - f.cx) - (f.hx - f.r), qz = Math.abs(z - f.cz) - (f.hz - f.r);
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - f.r;
}
function sdPath(x, z) {
  const p = LAYOUT.path;
  let best = 1e9;
  for (let i = 0; i < p.length - 1; i++) {
    const ax = p[i][0], az = p[i][1], bx = p[i + 1][0], bz = p[i + 1][1];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best - 0.8;
}
function sdPond(x, z) {
  return Math.hypot(x - LAYOUT.pond.x, z - LAYOUT.pond.z) - (LAYOUT.pond.r + 0.9);
}
// 'grass' | 'dirt' | 'path' | 'sand' (sem ruído, usado pra espalhar decoração)
export function groundKind(x, z, margin = 0) {
  if (sdPond(x, z) < margin) return 'sand';
  if (sdField(x, z) < margin) return 'dirt';
  if (sdPath(x, z) < margin) return 'path';
  return 'grass';
}

const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const GRASS = ['#72b84d', '#86c95a', '#5fa646', '#79bf50', '#8fd162'].map(rgb); // base, claro, escuro, base2, brilho
const GRASS_EDGE = rgb('#4c8f40');
const DIRT = ['#b98250', '#c99560', '#a06c41', '#8a5a37', '#dcbf90'].map(rgb);
const PATHC = ['#dcbd82', '#e9cf97', '#c9a66b', '#b08c58'].map(rgb);
const SAND = ['#e6d39a', '#f1e2b2', '#d2bb80', '#bfa56c'].map(rgb);
const FLOWERS = ['#ffffff', '#ffe36e', '#ff9db5', '#c9a4ff'].map(rgb);

function grassTile() {
  const T = 32, tile = new Uint8Array(T * T), r = rng(7);
  for (let i = 0; i < 70; i++) {
    const x = (r() * T) | 0, y = (r() * T) | 0, k = r() < 0.5 ? 1 : 2;
    tile[y * T + x] = k;
    if (r() < 0.6) tile[((y + 1) % T) * T + x] = k;
    if (r() < 0.25) tile[y * T + ((x + 1) % T)] = k;
  }
  return tile;
}

export function groundTextures() {
  const tile = grassTile();
  const outer = canvasTex(32, 32, (ctx) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const c = GRASS[tile[y * 32 + x]];
      P(ctx, x, y, `rgb(${c[0]},${c[1]},${c[2]})`);
    }
  }, { repeat: true, mip: true });

  const S = FARM * PPU;
  const farm = canvasTex(S, S, (ctx) => {
    const img = ctx.createImageData(S, S), d = img.data;
    for (let py = 0; py < S; py++) {
      for (let px = 0; px < S; px++) {
        const x = (px + 0.5) / PPU - FARM / 2, z = (py + 0.5) / PPU - FARM / 2;
        const n = vnoise(x * 0.9 + 40, z * 0.9 + 40) * 2 - 1;
        const n2 = vnoise(x * 2.3 + 9, z * 2.3 + 71) * 2 - 1;
        const h = hash2(px, py);
        const dPond = sdPond(x, z) + n * 0.3;
        const dField = sdField(x, z) + n * 0.45 + n2 * 0.12;
        const dPath = sdPath(x, z) + n * 0.28 + n2 * 0.1;
        let c;
        if (dPond < 0) {
          c = dPond > -0.14 ? SAND[3] : dPond < -0.75 ? SAND[2] : h < 0.07 ? SAND[1] : h > 0.95 ? SAND[2] : SAND[0];
        } else if (dField < 0) {
          const big = vnoise(x * 0.35, z * 0.35);
          c = dField > -0.16 ? DIRT[3] : h < 0.05 ? DIRT[1] : h > 0.94 ? DIRT[2] : h > 0.925 ? DIRT[4] : big > 0.62 ? DIRT[1] : DIRT[0];
          if (dField < -0.16 && dField > -0.3 && h < 0.5) c = DIRT[2];
        } else if (dPath < 0) {
          c = dPath > -0.12 ? PATHC[3] : h < 0.08 ? PATHC[1] : h > 0.93 ? PATHC[2] : PATHC[0];
        } else {
          const edge = Math.min(dPond, dField, dPath);
          const inside = Math.max(Math.abs(x), Math.abs(z));
          const fade = Math.max(0, Math.min(1, (30 - inside) / 3)); // some perto da borda: emenda invisível
          const big = vnoise(x * 0.22 + 5, z * 0.22 + 5);
          let k = tile[(py & 31) * 32 + (px & 31)];
          if (k === 0 && fade > 0 && big > 0.56 && (fade === 1 || h < fade)) k = 3;
          c = GRASS[k];
          if (fade === 1 && big > 0.56 && k === 1) c = GRASS[4];
          if (edge < 0.13) c = GRASS_EDGE;
          else if (edge < 0.3 && h < 0.35) c = GRASS[2];
          else if (fade === 1 && h > 0.9985) c = FLOWERS[(hash2(py, px) * 4) | 0];
        }
        const i = (py * S + px) * 4;
        d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, { mip: true });
  return { farm, outer, size: FARM };
}
