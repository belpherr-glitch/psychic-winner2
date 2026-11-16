// Água com física: modelo de águas rasas por "tubos virtuais" numa grade de 1 m.
// A água escoa pelo relevo, enche buracos, é deslocada quando o terreno sobe
// e o rio é mantido por uma nascente (montante) e um escoadouro (jusante).
// Barro jogado na água deixa ela turva, e a turbidez vai sendo levada pela corrente.
import * as THREE from 'three';
import { HALF, WATER_Y, RIVER, riverX, heightAt, grainTex } from './terrain.js';
import { toon } from './gfx.js';
import { clamp } from './util.js';

export const WN = 80;                 // células por lado
const WC = (HALF * 2) / WN;           // tamanho da célula (1 m)
const NC = WN * WN;
const B = new Float32Array(NC);       // fundo (terreno)
const D = new Float32Array(NC);       // profundidade
const FL = new Float32Array(NC), FR = new Float32Array(NC), FU = new Float32Array(NC), FD = new Float32Array(NC);
const VX = new Float32Array(NC), VZ = new Float32Array(NC);
const MUD = new Float32Array(NC), MUD2 = new Float32Array(NC);
const GRAV = 9.81;

const cx = (i) => -HALF + (i + 0.5) * WC;

/* ---------- malha ---------- */
const geo = new THREE.BufferGeometry();
const pos = new Float32Array(NC * 3), col = new Float32Array(NC * 3);
for (let z = 0; z < WN; z++) for (let x = 0; x < WN; x++) {
  const i = z * WN + x;
  pos[i * 3] = cx(x); pos[i * 3 + 2] = cx(z);
}
const idx = [];
for (let z = 0; z < WN - 1; z++) for (let x = 0; x < WN - 1; x++) {
  const a = z * WN + x, b = a + 1, c = a + WN, d = c + 1;
  idx.push(a, c, b, b, c, d);
}
geo.setIndex(idx);
geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
const uv = new Float32Array(NC * 2);
for (let i = 0; i < NC; i++) { uv[i * 2] = pos[i * 3] / 6; uv[i * 2 + 1] = pos[i * 3 + 2] / 6; }
geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
geo.computeVertexNormals();
geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), HALF * 1.6);

function rippleTex() {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * S, y = Math.random() * S, w = 6 + Math.random() * 24;
    g.strokeStyle = `rgba(170,230,245,${0.25 + Math.random() * 0.45})`;
    g.lineWidth = 1 + Math.random() * 2;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      g.beginPath(); g.ellipse(x + ox, y + oy, w, w * 0.28, 0, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export const waterTex = rippleTex();
const mat = toon({ vertexColors: true, map: waterTex, transparent: true, opacity: 0.86, depthWrite: false }, true);
export const waterMesh = new THREE.Mesh(geo, mat);
waterMesh.frustumCulled = false;
waterMesh.renderOrder = 1;
waterMesh.receiveShadow = true;

const SHALLOW = new THREE.Color(0x63d9e6), DEEP = new THREE.Color(0x1f8fb8), MUDDY = new THREE.Color(0x9c7048), FOAM = new THREE.Color(0xe9fbff);

/* ---------- fundo e estado inicial ---------- */
function sampleBed() {
  for (let z = 0; z < WN; z++) for (let x = 0; x < WN; x++) B[z * WN + x] = heightAt(cx(x), cx(z));
}
export function resetWater() {
  sampleBed();
  for (let i = 0; i < NC; i++) {
    D[i] = Math.max(0, WATER_Y - B[i]);
    FL[i] = FR[i] = FU[i] = FD[i] = 0;
    VX[i] = VZ[i] = 0;
    MUD[i] = 0;
  }
  // só mantém água ligada ao rio (lagoas isoladas abaixo do nível somem)
  for (let z = 0; z < WN; z++) for (let x = 0; x < WN; x++) {
    const i = z * WN + x;
    if (Math.abs(cx(x) - riverX(cx(z))) > RIVER.w / 2 + 6) D[i] = 0;
  }
}

/* ---------- nascente e escoadouro ---------- */
function boundaries() {
  for (const [z, level] of [[0, WATER_Y + 0.06], [WN - 1, WATER_Y - 0.06]]) {
    const r = riverX(cx(z));
    for (let x = 0; x < WN; x++) {
      if (Math.abs(cx(x) - r) > RIVER.w / 2 + 1) continue;
      const i = z * WN + x;
      D[i] = Math.max(0, level - B[i]);
      MUD[i] *= 0.5;
    }
  }
}

/* ---------- passo ---------- */
let acc = 0, bedT = 0;
export function stepWater(dt) {
  bedT -= dt;
  if (bedT <= 0) { bedT = 0.1; sampleBed(); }
  acc += dt;
  const h = 1 / 30;
  let steps = 0;
  while (acc >= h && steps < 2) { acc -= h; steps++; sim(h); }
  if (steps === 2) acc = 0;
}

function sim(dt) {
  boundaries();
  const k = (dt * GRAV) / WC, damp = 0.995;
  for (let z = 0; z < WN; z++) for (let x = 0; x < WN; x++) {
    const i = z * WN + x;
    const h = B[i] + D[i];
    if (D[i] <= 1e-4) { FL[i] = FR[i] = FU[i] = FD[i] = 0; continue; }
    let l = x > 0 ? Math.max(0, FL[i] * damp + k * (h - B[i - 1] - D[i - 1])) : 0;
    let r = x < WN - 1 ? Math.max(0, FR[i] * damp + k * (h - B[i + 1] - D[i + 1])) : 0;
    let u = z > 0 ? Math.max(0, FU[i] * damp + k * (h - B[i - WN] - D[i - WN])) : 0;
    let d = z < WN - 1 ? Math.max(0, FD[i] * damp + k * (h - B[i + WN] - D[i + WN])) : 0;
    const sum = (l + r + u + d) * dt;
    if (sum > D[i]) { const s = D[i] / sum; l *= s; r *= s; u *= s; d *= s; }
    FL[i] = l; FR[i] = r; FU[i] = u; FD[i] = d;
  }
  for (let z = 0; z < WN; z++) for (let x = 0; x < WN; x++) {
    const i = z * WN + x;
    const inL = x > 0 ? FR[i - 1] : 0, inR = x < WN - 1 ? FL[i + 1] : 0;
    const inU = z > 0 ? FD[i - WN] : 0, inD = z < WN - 1 ? FU[i + WN] : 0;
    const dv = (inL + inR + inU + inD - FL[i] - FR[i] - FU[i] - FD[i]) * dt;
    const d0 = D[i];
    D[i] = Math.max(0, d0 + dv);
    const dm = Math.max(0.05, (d0 + D[i]) / 2);
    VX[i] = (inL - FL[i] + FR[i] - inR) / (2 * dm);
    VZ[i] = (inU - FU[i] + FD[i] - inD) / (2 * dm);
    // terreno acima da água (aterro) empurra a água pra fora naturalmente pelo fundo mais alto
  }
  // barro levado pela corrente (advecção simples + decaimento)
  for (let z = 1; z < WN - 1; z++) for (let x = 1; x < WN - 1; x++) {
    const i = z * WN + x;
    if (D[i] < 0.02) { MUD2[i] = 0; continue; }
    const sx = x - VX[i] * dt * 1.2, sz = z - VZ[i] * dt * 1.2;
    const ix = clamp(Math.round(sx), 0, WN - 1), iz = clamp(Math.round(sz), 0, WN - 1);
    MUD2[i] = (MUD[iz * WN + ix] * 0.7 + (MUD[i - 1] + MUD[i + 1] + MUD[i - WN] + MUD[i + WN]) * 0.075) * 0.996;
  }
  MUD.set(MUD2);
}

/* ---------- consultas ---------- */
function cellOf(x, z) {
  const ix = clamp(Math.floor((x + HALF) / WC), 0, WN - 1), iz = clamp(Math.floor((z + HALF) / WC), 0, WN - 1);
  return iz * WN + ix;
}
export function waterDepth(x, z) {
  if (Math.abs(x) >= HALF || Math.abs(z) >= HALF) return 0;
  const i = cellOf(x, z);
  return D[i] > 0.02 ? Math.max(0, B[i] + D[i] - heightAt(x, z)) : 0;
}
export function waterSurface(x, z) {
  const i = cellOf(x, z);
  return D[i] > 0.02 ? B[i] + D[i] : -1e9;
}
export function waterFlow(x, z) { const i = cellOf(x, z); return [VX[i], VZ[i]]; }
export function stirMud(x, z, amount) {
  if (Math.abs(x) >= HALF || Math.abs(z) >= HALF) return;
  const i = cellOf(x, z);
  if (D[i] > 0.02) MUD[i] = Math.min(1, MUD[i] + amount);
}
// estado compacto (rede): profundidade em cm
export function packWater() {
  const o = new Uint8Array(NC);
  for (let i = 0; i < NC; i++) o[i] = Math.min(255, Math.round(D[i] * 50));
  return o;
}

/* ---------- render ---------- */
const tmp = new THREE.Color();
let nT = 0;
export function renderWater(dt, t) {
  for (let i = 0; i < NC; i++) {
    const d = D[i];
    // célula seca: esconde o vértice sob o terreno
    pos[i * 3 + 1] = d > 0.02 ? B[i] + d : B[i] - 0.25;
    const deep = clamp(d / 1.8, 0, 1);
    tmp.copy(SHALLOW).lerp(DEEP, deep).lerp(MUDDY, clamp(MUD[i] * 1.4, 0, 0.85));
    const sp = Math.hypot(VX[i], VZ[i]);
    if (d < 0.12 || sp > 0.9) tmp.lerp(FOAM, clamp(sp > 0.9 ? (sp - 0.9) * 0.5 : (0.12 - d) * 4, 0, 0.6));
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  geo.attributes.position.needsUpdate = true;
  geo.attributes.color.needsUpdate = true;
  nT -= dt;
  if (nT <= 0) { nT = 0.2; geo.computeVertexNormals(); }
  waterTex.offset.y -= dt * 0.06;
  waterTex.offset.x = Math.sin(t * 0.3) * 0.02;
}
