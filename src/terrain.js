// Terreno deformável: heightfield com material, camada solta e grama por vértice.
// Material solto escorrega até o ângulo de repouso (autômato celular por chunks ativos).
import * as THREE from 'three';
import { clamp, lerp, smooth, rng, makeNoise, fbm, b64, unb64 } from './util.js';
import { toon, RAMP_GROUND } from './gfx.js';

export const N = 160;            // células por lado
export const G = N + 1;          // vértices por lado
export const CELL = 0.5;         // metros por célula
export const HALF = (N * CELL) / 2;
export const CA = CELL * CELL;   // área de uma célula (m²)
export const NV = G * G;
export const WATER_Y = -0.85;

export const MATS = [
  { id: 0, name: 'Terra', hex: 0xc0643a, repose: 0.8, coh: 1.7, soft: 1.0, dust: 0.9, ui: '#b0643b' },
  { id: 1, name: 'Cascalho', hex: 0xeceae4, repose: 0.68, coh: 1.15, soft: 0.8, dust: 0.25, ui: '#cfcbc2' },
  { id: 2, name: 'Areia', hex: 0xf2d38c, repose: 0.6, coh: 0.95, soft: 1.45, dust: 1.0, ui: '#e3c27a' },
  { id: 3, name: 'Argila', hex: 0xd0703f, repose: 0.98, coh: 2.8, soft: 0.5, dust: 0.35, ui: '#c26a3e' },
];
for (const m of MATS) m.c = new THREE.Color(m.hex);
const GA = new THREE.Color(0x63bb2e), GB = new THREE.Color(0x9ad845);

export const H = new Float32Array(NV);
export const ROCK = new Float32Array(NV);
export const LOOSE = new Float32Array(NV);
export const GRASS = new Float32Array(NV);
export const BASE0 = new Float32Array(NV);
export const VAR = new Float32Array(NV);
export const MAT = new Uint8Array(NV);
const TUFT = new Int32Array(NV).fill(-1);

export const RIVER = { cx: 26, amp: 3, w: 7 };
export const riverX = (z) => RIVER.cx + RIVER.amp * Math.sin((z * Math.PI) / HALF);
// perfil da margem: profundidade relativa (0 = terra firme, 1 = leito)
export const riverProfile = (d) => 1 - smooth(RIVER.w / 2 - 1.5, RIVER.w / 2 + 5, d);

export const toG = (w) => (w + HALF) / CELL;
export const toW = (g) => -HALF + g * CELL;

export function heightAt(x, z) {
  let fx = toG(x), fz = toG(z);
  fx = clamp(fx, 0, N - 1e-4);
  fz = clamp(fz, 0, N - 1e-4);
  const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, i = iz * G + ix;
  return lerp(lerp(H[i], H[i + 1], tx), lerp(H[i + G], H[i + G + 1], tx), tz);
}
export function nearestIndex(x, z) {
  const ix = clamp(Math.round(toG(x)), 0, G - 1), iz = clamp(Math.round(toG(z)), 0, G - 1);
  return iz * G + ix;
}

/* ---------- textura granulada (cor + relevo) ---------- */
function grainTextures() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const hc = document.createElement('canvas');
  hc.width = hc.height = S;
  const hg = hc.getContext('2d');
  g.fillStyle = '#efefef'; g.fillRect(0, 0, S, S);
  hg.fillStyle = '#000'; hg.fillRect(0, 0, S, S);
  const r = rng(11);
  const dot = (ctx, x, y, rad, fill) => {
    ctx.fillStyle = fill;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const px = x + ox, py = y + oy;
      if (px < -rad || py < -rad || px > S + rad || py > S + rad) continue;
      ctx.beginPath(); ctx.arc(px, py, rad, 0, Math.PI * 2); ctx.fill();
    }
  };
  for (let i = 0; i < 2600; i++) {
    const x = r() * S, y = r() * S, rad = 1 + r() * r() * 4.2;
    const l = (175 + r() * 80) | 0;
    dot(g, x + rad * 0.3, y + rad * 0.35, rad, 'rgba(60,30,10,0.16)');
    dot(g, x, y, rad, `rgb(${l},${l},${l})`);
    dot(g, x - rad * 0.3, y - rad * 0.3, rad * 0.4, 'rgba(255,255,255,0.3)');
    const hgrd = hg.createRadialGradient(x, y, 0, x, y, rad);
    hgrd.addColorStop(0, `rgba(255,255,255,${0.5 + r() * 0.5})`); hgrd.addColorStop(1, 'rgba(255,255,255,0)');
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { hg.fillStyle = hgrd; hg.save(); hg.translate(ox, oy); hg.beginPath(); hg.arc(x, y, rad, 0, 7); hg.fill(); hg.restore(); }
  }
  // normal map a partir da altura
  const hd = hg.getImageData(0, 0, S, S).data;
  const nc = document.createElement('canvas');
  nc.width = nc.height = S;
  const ng = nc.getContext('2d');
  const out = ng.createImageData(S, S);
  const hAt = (x, y) => hd[(((y + S) % S) * S + ((x + S) % S)) * 4] / 255;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (hAt(x - 1, y) - hAt(x + 1, y)) * 2.2, dy = (hAt(x, y - 1) - hAt(x, y + 1)) * 2.2;
    const l = 1 / Math.hypot(dx, dy, 1);
    const o = (y * S + x) * 4;
    out.data[o] = (dx * l * 0.5 + 0.5) * 255; out.data[o + 1] = (dy * l * 0.5 + 0.5) * 255; out.data[o + 2] = (l * 0.5 + 0.5) * 255; out.data[o + 3] = 255;
  }
  ng.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const n = new THREE.CanvasTexture(nc);
  n.wrapS = n.wrapT = THREE.RepeatWrapping;
  n.anisotropy = 4;
  return [t, n];
}
export const [grainTex, grainNormal] = grainTextures();

/* ---------- malha ---------- */
const geo = new THREE.BufferGeometry();
const pos = new Float32Array(NV * 3), nor = new Float32Array(NV * 3), col = new Float32Array(NV * 3), uv = new Float32Array(NV * 2);
for (let z = 0; z < G; z++) for (let x = 0; x < G; x++) {
  const i = z * G + x;
  pos[i * 3] = toW(x);
  pos[i * 3 + 2] = toW(z);
  uv[i * 2] = (x * CELL) / 2.2;
  uv[i * 2 + 1] = (z * CELL) / 2.2;
}
const index = new Uint32Array(N * N * 6);
let k = 0;
for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
  const a = z * G + x, b = a + 1, c = a + G, d = c + 1;
  index[k++] = a; index[k++] = c; index[k++] = b;
  index[k++] = b; index[k++] = c; index[k++] = d;
}
geo.setIndex(new THREE.BufferAttribute(index, 1));
const aPos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
const aNor = new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage);
const aCol = new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage);
geo.setAttribute('position', aPos);
geo.setAttribute('normal', aNor);
geo.setAttribute('color', aCol);
geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), HALF * 1.6);

export const terrainMesh = new THREE.Mesh(
  geo,
  toon({ vertexColors: true, map: grainTex, normalMap: grainNormal, normalScale: new THREE.Vector2(0.9, 0.9), gradientMap: RAMP_GROUND })
);
terrainMesh.receiveShadow = true;
terrainMesh.frustumCulled = false;

/* ---------- tufos de grama (lâminas com vento) ---------- */
const TUFT_MAX = 9000;
function bladeTuft() {
  const pos = [], col = [];
  const r = rng(4);
  const dark = new THREE.Color(0x4f9f2c), light = new THREE.Color(0xc9f27a);
  for (let b = 0; b < 6; b++) {
    const a = r() * Math.PI * 2, rad = r() * 0.1;
    const bx = Math.cos(a) * rad, bz = Math.sin(a) * rad;
    const h = 0.18 + r() * 0.2, w = 0.04 + r() * 0.025;
    const lean = (r() - 0.5) * 0.25, la = r() * Math.PI * 2;
    const tx = bx + Math.cos(la) * lean, tz = bz + Math.sin(la) * lean;
    const px = Math.cos(a + 1.57) * w, pz = Math.sin(a + 1.57) * w;
    pos.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, tx, h, tz);
    col.push(dark.r, dark.g, dark.b, dark.r, dark.g, dark.b, light.r, light.g, light.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // normais pra cima: grama iluminada por igual
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}
export const windUniform = { value: 0 };
const tuftMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
tuftMat.onBeforeCompile = (sh) => {
  sh.uniforms.uTime = windUniform;
  sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    vec2 ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
    float wv = sin(uTime * 1.6 + ip.x * 0.31 + ip.y * 0.22) + 0.5 * sin(uTime * 2.9 + ip.x * 0.8 - ip.y * 0.4);
    transformed.x += wv * 0.07 * position.y * 2.5;
    transformed.z += wv * 0.04 * position.y * 2.5;`);
};
export const tuftMesh = new THREE.InstancedMesh(bladeTuft(), tuftMat, TUFT_MAX);
tuftMesh.frustumCulled = false;
tuftMesh.count = 0;
const tuftData = []; // {i, x, z, rot, s}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);

function setTuft(t, idx) {
  _p.set(t.x, H[t.i] - 0.02, t.z);
  _e.set(t.tilt, t.rot, 0);
  _q.setFromEuler(_e);
  _s.set(t.s, t.s * t.sy, t.s);
  _m.compose(_p, _q, _s);
  tuftMesh.setMatrixAt(idx, _m);
}

export function placeTufts(seed) {
  const r = rng(seed * 7 + 3);
  TUFT.fill(-1);
  tuftData.length = 0;
  const c = new THREE.Color();
  for (let z = 1; z < G - 1 && tuftData.length < TUFT_MAX; z++) for (let x = 1; x < G - 1; x++) {
    if (tuftData.length >= TUFT_MAX) break;
    const i = z * G + x;
    if (GRASS[i] < 0.95 || r() > 0.36) continue;
    if (H[i] < WATER_Y + 0.4) continue;
    const t = {
      i, x: toW(x) + (r() - 0.5) * CELL, z: toW(z) + (r() - 0.5) * CELL,
      rot: r() * 6.28, tilt: (r() - 0.5) * 0.2, s: 0.8 + r() * 0.7, sy: 0.7 + r() * 0.8,
    };
    const idx = tuftData.length;
    tuftData.push(t);
    TUFT[i] = idx;
    setTuft(t, idx);
    c.setHSL(0, 0, 0.85 + r() * 0.3);
    tuftMesh.setColorAt(idx, c);
  }
  tuftMesh.count = tuftData.length;
  tuftMesh.instanceMatrix.needsUpdate = true;
  if (tuftMesh.instanceColor) tuftMesh.instanceColor.needsUpdate = true;
}

/* ---------- atualização da malha ---------- */
let dx0 = G, dz0 = G, dx1 = -1, dz1 = -1;
let nx0 = G, nz0 = G, nx1 = -1, nz1 = -1;
export function dirty(x0, z0, x1, z1) {
  if (x0 < nx0) nx0 = Math.max(0, x0);
  if (z0 < nz0) nz0 = Math.max(0, z0);
  if (x1 > nx1) nx1 = Math.min(G - 1, x1);
  if (z1 > nz1) nz1 = Math.min(G - 1, z1);
  x0 = clamp(x0 - 1, 0, G - 1); z0 = clamp(z0 - 1, 0, G - 1);
  x1 = clamp(x1 + 1, 0, G - 1); z1 = clamp(z1 + 1, 0, G - 1);
  if (x0 < dx0) dx0 = x0;
  if (z0 < dz0) dz0 = z0;
  if (x1 > dx1) dx1 = x1;
  if (z1 > dz1) dz1 = z1;
}
export function dirtyAll() { dx0 = 0; dz0 = 0; dx1 = G - 1; dz1 = G - 1; }

function writeColor(i) {
  const m = MATS[MAT[i]].c;
  const v = 1 + VAR[i];
  let r = m.r * v, g = m.g * v, b = m.b * v;
  if (LOOSE[i] > 0.03) { r *= 1.1; g *= 1.08; b *= 1.04; }
  const dug = BASE0[i] - H[i];
  if (dug > 0.05) { const kk = 1 - Math.min(dug * 0.16, 0.36); r *= kk; g *= kk; b *= kk; }
  const gr = GRASS[i];
  if (gr > 0) {
    const t = clamp(0.5 + VAR[i] * 4, 0, 1);
    r = lerp(r, lerp(GA.r, GB.r, t), gr);
    g = lerp(g, lerp(GA.g, GB.g, t), gr);
    b = lerp(b, lerp(GA.b, GB.b, t), gr);
  }
  const w = H[i] - WATER_Y;
  if (w < 0.15) {
    const kk = clamp((0.15 - w) * 1.4, 0, 0.6);
    r *= 1 - kk; g *= 1 - kk * 0.55; b *= 1 - kk * 0.25;
  }
  col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
}

export function flush() {
  if (dx1 < 0) return;
  let tuftChanged = false;
  for (let z = dz0; z <= dz1; z++) {
    for (let x = dx0; x <= dx1; x++) {
      const i = z * G + x;
      pos[i * 3 + 1] = H[i];
      const hl = H[x > 0 ? i - 1 : i], hr = H[x < G - 1 ? i + 1 : i];
      const hd = H[z > 0 ? i - G : i], hu = H[z < G - 1 ? i + G : i];
      let nx = hl - hr, ny = 2 * CELL, nz = hd - hu;
      const l = 1 / Math.hypot(nx, ny, nz);
      nor[i * 3] = nx * l; nor[i * 3 + 1] = ny * l; nor[i * 3 + 2] = nz * l;
      writeColor(i);
      const t = TUFT[i];
      if (t >= 0) {
        const td = tuftData[t];
        if (GRASS[i] < 0.55) { tuftMesh.setMatrixAt(t, _zero); TUFT[i] = -1; }
        else setTuft(td, t);
        tuftChanged = true;
      }
    }
  }
  const start = dz0 * G * 3, count = (dz1 - dz0 + 1) * G * 3;
  for (const a of [aPos, aNor, aCol]) {
    a.addUpdateRange(start, count);
    a.needsUpdate = true;
  }
  if (tuftChanged) tuftMesh.instanceMatrix.needsUpdate = true;
  dx0 = G; dz0 = G; dx1 = -1; dz1 = -1;
}

/* ---------- escorregamento (ângulo de repouso) ---------- */
const CH = 16, NC = Math.ceil(G / CH);
const chunkT = new Float32Array(NC * NC);
export function wake(gx, gz, t = 1.2) {
  const cx = clamp((gx / CH) | 0, 0, NC - 1), cz = clamp((gz / CH) | 0, 0, NC - 1);
  const c = cz * NC + cx;
  if (chunkT[c] < t) chunkT[c] = t;
}
export function resetRelax() { chunkT.fill(0); }

const NBO = [1, -1, G, -G, G + 1, G - 1, -G + 1, -G - 1];
const NBD = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];

function relaxChunk(cx, cz, flip) {
  const x0 = Math.max(1, cx * CH), x1 = Math.min(G - 2, cx * CH + CH - 1);
  const z0 = Math.max(1, cz * CH), z1 = Math.min(G - 2, cz * CH + CH - 1);
  let moved = 0;
  for (let zz = z0; zz <= z1; zz++) {
    const z = flip ? z1 - (zz - z0) : zz;
    for (let xx = x0; xx <= x1; xx++) {
      const x = flip ? x1 - (xx - x0) : xx;
      const i = z * G + x;
      let hi = H[i];
      const loose = LOOSE[i] > 0.01;
      const m = MATS[MAT[i]];
      const tA = (loose ? m.repose : m.coh) * CELL;
      let avail = loose ? LOOSE[i] : hi - ROCK[i];
      if (avail <= 1e-4) continue;
      let out = 0;
      for (let kk = 0; kk < 8; kk++) {
        const j = i + NBO[kk];
        const d = hi - H[j];
        const mx = tA * NBD[kk];
        if (d > mx) {
          let mv = (d - mx) * 0.12;
          if (mv > avail) mv = avail;
          if (mv < 1e-5) continue;
          hi -= mv; avail -= mv; out += mv;
          const lj = LOOSE[j];
          H[j] += mv;
          LOOSE[j] = lj + mv;
          if (lj < 0.06) MAT[j] = MAT[i];
          GRASS[j] = 0;
          if (avail <= 0) break;
        }
      }
      if (out > 0) {
        H[i] = hi;
        if (loose) LOOSE[i] = Math.max(0, LOOSE[i] - out);
        GRASS[i] = 0;
        moved += out;
      }
    }
  }
  if (moved > 0) dirty(x0, z0, x1, z1);
  return moved;
}

let flipper = false;
export function relax(dt) {
  for (let pass = 0; pass < 2; pass++) {
    flipper = !flipper;
    for (let c = 0; c < NC * NC; c++) {
      if (chunkT[c] <= 0) continue;
      if (pass === 0) chunkT[c] -= dt;
      const cx = c % NC, cz = (c / NC) | 0;
      const mv = relaxChunk(cx, cz, flipper);
      if (mv > 2e-4) {
        if (chunkT[c] < 0.5) chunkT[c] = 0.5;
        for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) {
          const nx = cx + ox, nz = cz + oz;
          if (nx < 0 || nz < 0 || nx >= NC || nz >= NC) continue;
          const n = nz * NC + nx;
          if (chunkT[n] < 0.25) chunkT[n] = 0.25;
        }
      }
    }
  }
}

/* ---------- depósito / retirada ---------- */
// deposita um volume (m³) num ponto do mundo, dividido bilinearmente entre 4 vértices
export function deposit(x, z, vol, mat) {
  if (vol <= 0) return;
  let fx = clamp(toG(x), 1, N - 1.001), fz = clamp(toG(z), 1, N - 1.001);
  const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz;
  const dh = vol / CA;
  const w = [(1 - tx) * (1 - tz), tx * (1 - tz), (1 - tx) * tz, tx * tz];
  const ids = [iz * G + ix, iz * G + ix + 1, (iz + 1) * G + ix, (iz + 1) * G + ix + 1];
  for (let q = 0; q < 4; q++) {
    const i = ids[q], a = dh * w[q];
    if (LOOSE[i] < 0.08 || a > LOOSE[i] * 0.5) MAT[i] = mat;
    H[i] += a;
    LOOSE[i] += a;
    GRASS[i] = 0;
  }
  dirty(ix, iz, ix + 1, iz + 1);
  wake(ix, iz, 1.5);
}

// marca/compacta trilhas de pneu e esteira
export function tread(x, z, amount, sink) {
  const i = nearestIndex(x, z);
  let ch = false;
  if (GRASS[i] > 0) { GRASS[i] = Math.max(0, GRASS[i] - amount); ch = true; }
  if (LOOSE[i] > 0.02 && sink > 0) {
    const d = Math.min(LOOSE[i] - 0.01, sink);
    H[i] -= d; LOOSE[i] -= d; ch = true;
  }
  if (ch) {
    const ix = i % G, iz = (i / G) | 0;
    dirty(ix, iz, ix, iz);
  }
}

/* ---------- geração de canteiro ---------- */
export function baseTerrain(seed, soil) {
  const r = rng(seed), n1 = makeNoise(r), n2 = makeNoise(r), n3 = makeNoise(r);
  for (let z = 0; z < G; z++) for (let x = 0; x < G; x++) {
    const i = z * G + x, wx = toW(x), wz = toW(z);
    let h = fbm(n1, wx * 0.022 + 3, wz * 0.022 + 7, 4) * 3.2 + fbm(n2, wx * 0.09, wz * 0.09, 2) * 0.2;
    const dc = Math.hypot(wx + 3, wz);
    h = lerp(h * 0.15, h, smooth(15, 34, dc));
    const e = Math.max(Math.abs(wx), Math.abs(wz));
    h = lerp(h, 0, smooth(HALF - 9, HALF - 0.5, e));
    const t = riverProfile(Math.abs(wx - riverX(wz)));
    h = lerp(h, -2.3, t);
    H[i] = h;
    ROCK[i] = h - 3.4;
    LOOSE[i] = 0;
    MAT[i] = soil;
    if (h < WATER_Y + 0.6) MAT[i] = soil === 1 ? 1 : 2;
    GRASS[i] = smooth(WATER_Y + 0.3, WATER_Y + 0.9, h);
    VAR[i] = (r() - 0.5) * 0.1 + fbm(n3, wx * 0.35, wz * 0.35, 2) * 0.16;
  }
  BASE0.set(H);
}

export function forRect(x0, z0, x1, z1, fn) {
  const gx0 = clamp(Math.ceil(toG(x0)), 1, G - 2), gx1 = clamp(Math.floor(toG(x1)), 1, G - 2);
  const gz0 = clamp(Math.ceil(toG(z0)), 1, G - 2), gz1 = clamp(Math.floor(toG(z1)), 1, G - 2);
  for (let z = gz0; z <= gz1; z++) for (let x = gx0; x <= gx1; x++) fn(z * G + x, toW(x), toW(z), x, z);
}

export function addPile(cx, cz, r, h, mat, rand) {
  forRect(cx - r, cz - r, cx + r, cz + r, (i, wx, wz) => {
    const d = Math.hypot(wx - cx, wz - cz) / r;
    if (d >= 1) return;
    const dh = h * Math.pow(1 - d * d, 1.35) * (1 + (rand() - 0.5) * 0.1);
    H[i] += dh;
    LOOSE[i] += dh;
    MAT[i] = mat;
    GRASS[i] = 0;
  });
}

export function clearGrass(x0, z0, x1, z1, margin = 1.5) {
  forRect(x0 - margin, z0 - margin, x1 + margin, z1 + margin, (i, wx, wz) => {
    const d = Math.min(wx - (x0 - margin), (x1 + margin) - wx, wz - (z0 - margin), (z1 + margin) - wz);
    GRASS[i] = Math.min(GRASS[i], 1 - smooth(0, margin, d));
  });
}

export function roughen(x0, z0, x1, z1, amp, freq, rand) {
  const n = makeNoise(rand);
  forRect(x0, z0, x1, z1, (i, wx, wz) => {
    const d = Math.min(wx - x0, x1 - wx, wz - z0, z1 - wz);
    const f = smooth(0, 2.5, d);
    H[i] += fbm(n, wx * freq, wz * freq, 3) * amp * f;
  });
}

export function carvePit(x0, z0, x1, z1, depth, wall) {
  forRect(x0 - wall, z0 - wall, x1 + wall, z1 + wall, (i, wx, wz) => {
    const d = Math.min(wx - (x0 - wall), (x1 + wall) - wx, wz - (z0 - wall), (z1 + wall) - wz);
    const dd = depth * smooth(0, wall * 2, d);
    H[i] -= dd;
    if (dd > 0.05) GRASS[i] = 0;
  });
}

// volume de um retângulo (m³) acima de uma referência por vértice
export function volumeBetween(x0, z0, x1, z1, ref) {
  let v = 0;
  forRect(x0, z0, x1, z1, (i) => { v += (H[i] - ref(i)) * CA; });
  return v;
}

// pátio de máquinas: plano, cascalho compactado
export function pad(x0, z0, x1, z1, h, mat, edge = 3) {
  forRect(x0 - edge, z0 - edge, x1 + edge, z1 + edge, (i, wx, wz) => {
    const d = Math.min(wx - (x0 - edge), (x1 + edge) - wx, wz - (z0 - edge), (z1 + edge) - wz);
    const t = smooth(0, edge, d);
    H[i] = lerp(H[i], h, t);
    ROCK[i] = Math.min(ROCK[i], H[i] - 3);
    if (t > 0.5) { MAT[i] = mat; GRASS[i] = Math.min(GRASS[i], 1 - smooth(0.5, 1, t)); }
  });
}

/* ---------- rede: pacotes de terreno alterado ---------- */
export function takeNetRect() {
  if (nx1 < 0) return null;
  const r = [nx0, nz0, nx1, nz1];
  nx0 = G; nz0 = G; nx1 = -1; nz1 = -1;
  return r;
}
export function resetNetRect() { nx0 = G; nz0 = G; nx1 = -1; nz1 = -1; }
export function packRect(x0, z0, x1, z1) {
  const w = x1 - x0 + 1, hgt = z1 - z0 + 1, n = w * hgt;
  const h = new Int16Array(n), m = new Uint8Array(n), l = new Uint8Array(n), g = new Uint8Array(n);
  let k = 0;
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++, k++) {
    const i = z * G + x;
    h[k] = Math.round(H[i] * 400);
    m[k] = MAT[i];
    l[k] = Math.min(255, Math.round(LOOSE[i] * 100));
    g[k] = Math.round(GRASS[i] * 255);
  }
  return { r: [x0, z0, x1, z1], h: b64(new Uint8Array(h.buffer)), m: b64(m), l: b64(l), g: b64(g) };
}
export function applyRect(p) {
  const [x0, z0, x1, z1] = p.r;
  const h = new Int16Array(unb64(p.h).buffer), m = unb64(p.m), l = unb64(p.l), g = unb64(p.g);
  let k = 0;
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++, k++) {
    const i = z * G + x;
    H[i] = h[k] / 400; MAT[i] = m[k]; LOOSE[i] = l[k] / 100; GRASS[i] = g[k] / 255;
  }
  dirty(x0, z0, x1, z1);
  resetNetRect();
}
