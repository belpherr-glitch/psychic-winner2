// Motor de grãos (DEM simplificado por Position Based Dynamics).
// Cada torrão é uma esfera com volume real que colide com o chão, com os
// outros grãos e com as peças das máquinas (caçamba, báscula, lâmina, pneus).
//
// Otimizações para celular fraco:
//  - hash espacial 3D (vizinhança O(1));
//  - grãos "estacionados" dentro de caçamba/báscula viram carga rígida
//    (não simulam, só acompanham a peça);
//  - grãos parados no chão "assentam": viram altura do terreno e somem;
//  - limite de grãos ajustável em tempo real pelo controle de desempenho.
import * as THREE from 'three';
import { MATS, heightAt, deposit, HALF, WATER_Y } from './terrain.js';
import { toon } from './gfx.js';
import { waterSurface, stirMud } from './water.js';

export const GR = 0.11;          // raio do grão (m)
export const GV = 0.0095;        // volume que cada grão carrega (m³)
const MAX = 3200;
let cap = 2600;                  // limite atual (adaptativo)
export const setGrainCap = (c) => { cap = Math.max(400, Math.min(MAX, c | 0)); };
export const grainCap = () => cap;

const px = new Float32Array(MAX), py = new Float32Array(MAX), pz = new Float32Array(MAX);
const qx = new Float32Array(MAX), qy = new Float32Array(MAX), qz = new Float32Array(MAX); // posição anterior
const lx = new Float32Array(MAX), ly = new Float32Array(MAX), lz = new Float32Array(MAX); // local no contêiner
const rest = new Float32Array(MAX), age = new Float32Array(MAX), sz = new Float32Array(MAX), rot = new Float32Array(MAX);
const mat = new Uint8Array(MAX), state = new Uint8Array(MAX); // 0 livre, 2 estacionado
const cont = new Int16Array(MAX), touch = new Int8Array(MAX), onGround = new Uint8Array(MAX);
const cr = new Float32Array(MAX), cg = new Float32Array(MAX), cb = new Float32Array(MAX);
let n = 0;

/* ---------- render ---------- */
const geo = new THREE.IcosahedronGeometry(1, 0);
const mesh = new THREE.InstancedMesh(geo, toon({ color: 0xffffff }), MAX);
mesh.frustumCulled = false;
mesh.castShadow = true;
mesh.receiveShadow = true;
mesh.count = 0;
mesh.setColorAt(0, new THREE.Color(1, 1, 1));
export const grainMesh = mesh;

/* ---------- colisores e contêineres ---------- */
// colisor: caixa orientada presa a um Object3D (anchor) com meias-medidas h
// contêiner: espaço interno de uma peça que guarda carga (caçamba, báscula)
const colliders = [];
const containers = [];
export function addCollider(anchor, hx, hy, hz, containerId = -1, friction = 0.7) {
  const c = { anchor, hx, hy, hz, ci: containerId, mu: friction, m: new Float32Array(16), prev: new Float32Array(16), inv: new THREE.Matrix4(), first: true, enabled: true };
  colliders.push(c);
  return c;
}
// box: [x0,y0,z0,x1,y1,z1] no espaço local do objeto; spill(): true quando deve derramar
export function addContainer(obj, box, spill) {
  const c = { obj, box, spill, inv: new THREE.Matrix4(), m: new Float32Array(16), count: 0, enabled: true };
  containers.push(c);
  return containers.length - 1;
}
export function containerLoad(ci) { return containers[ci] ? containers[ci].count * GV : 0; }
export function containerMat(ci) {
  const counts = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) if (state[i] === 2 && cont[i] === ci) counts[mat[i]]++;
  let b = 0;
  for (let k = 1; k < 4; k++) if (counts[k] > counts[b]) b = k;
  return b;
}
export function setOwnerEnabled(obj, on) {
  for (const c of colliders) {
    let p = c.anchor;
    while (p && p !== obj) p = p.parent;
    if (p) c.enabled = on;
  }
  for (const c of containers) {
    let p = c.obj;
    while (p && p !== obj) p = p.parent;
    if (p) c.enabled = on;
  }
}

function refreshColliders() {
  for (const c of colliders) {
    c.prev.set(c.first ? c.anchor.matrixWorld.elements : c.m);
    c.m.set(c.anchor.matrixWorld.elements);
    c.inv.copy(c.anchor.matrixWorld).invert();
    c.first = false;
  }
  for (const c of containers) {
    c.m.set(c.obj.matrixWorld.elements);
    c.inv.copy(c.obj.matrixWorld).invert();
  }
}

/* ---------- criação e remoção ---------- */
let onBake = null;
export const setBakeHook = (fn) => { onBake = fn; };

export function spawnGrain(x, y, z, vx, vy, vz, m, dt = 1 / 60) {
  if (n >= cap) return false;
  const i = n++;
  px[i] = x; py[i] = y; pz[i] = z;
  qx[i] = x - vx * dt; qy[i] = y - vy * dt; qz[i] = z - vz * dt;
  mat[i] = m; state[i] = 0; cont[i] = -1; rest[i] = 0; age[i] = 0; touch[i] = -1;
  sz[i] = GR * (0.85 + Math.random() * 0.45);
  rot[i] = Math.random() * 6.28;
  const c = MATS[m].c, k = 0.8 + Math.random() * 0.34;
  cr[i] = c.r * k; cg[i] = c.g * k; cb[i] = c.b * k;
  return true;
}
export const grainCount = () => n;
export const grainsFree = () => cap - n;

function kill(i) {
  const j = --n;
  if (i === j) return;
  px[i] = px[j]; py[i] = py[j]; pz[i] = pz[j]; qx[i] = qx[j]; qy[i] = qy[j]; qz[i] = qz[j];
  lx[i] = lx[j]; ly[i] = ly[j]; lz[i] = lz[j]; rest[i] = rest[j]; age[i] = age[j]; sz[i] = sz[j]; rot[i] = rot[j];
  mat[i] = mat[j]; state[i] = state[j]; cont[i] = cont[j]; touch[i] = touch[j]; onGround[i] = onGround[j];
  cr[i] = cr[j]; cg[i] = cg[j]; cb[i] = cb[j];
}
function bake(i) {
  deposit(px[i], pz[i], GV, mat[i]);
  if (onBake) onBake(px[i], pz[i], GV, mat[i]);
  kill(i);
}
export function clearGrains() { n = 0; mesh.count = 0; }

/* ---------- hash espacial ---------- */
const TS = 16384, CELL = GR * 2;
const head = new Int32Array(TS), next = new Int32Array(MAX);
const hkey = (ix, iy, iz) => (((ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)) >>> 0) & (TS - 1);
function buildHash() {
  head.fill(-1);
  for (let i = 0; i < n; i++) {
    const k = hkey(Math.floor(px[i] / CELL), Math.floor(py[i] / CELL), Math.floor(pz[i] / CELL));
    next[i] = head[k];
    head[k] = i;
  }
}

/* ---------- passo de simulação ---------- */
const G = 9.81, D2 = (GR * 2) * (GR * 2);
const _v = new THREE.Vector3();

function collideBoxes(i, sub) {
  // retorna se encostou em algo
  let hit = false;
  for (let k = 0; k < colliders.length; k++) {
    const c = colliders[k];
    if (!c.enabled) continue;
    const e = c.inv.elements;
    const x = px[i], y = py[i], z = pz[i];
    const ax = e[0] * x + e[4] * y + e[8] * z + e[12];
    const ay = e[1] * x + e[5] * y + e[9] * z + e[13];
    const az = e[2] * x + e[6] * y + e[10] * z + e[14];
    const R = sz[i] * 0.9;
    const dx = c.hx + R - Math.abs(ax), dy = c.hy + R - Math.abs(ay), dz = c.hz + R - Math.abs(az);
    if (dx <= 0 || dy <= 0 || dz <= 0) continue;
    // sai pela face de menor penetração
    let nx = 0, ny = 0, nz = 0, d;
    if (dx < dy && dx < dz) { nx = Math.sign(ax) || 1; d = dx; }
    else if (dy < dz) { ny = Math.sign(ay) || 1; d = dy; }
    else { nz = Math.sign(az) || 1; d = dz; }
    if (d > 0.12) d = 0.12;
    const m = c.m, p = c.prev;
    // normal em mundo
    let wx = m[0] * nx + m[4] * ny + m[8] * nz, wy = m[1] * nx + m[5] * ny + m[9] * nz, wz = m[2] * nx + m[6] * ny + m[10] * nz;
    const wl = Math.hypot(wx, wy, wz) || 1;
    wx /= wl; wy /= wl; wz /= wl;
    px[i] += wx * d; py[i] += wy * d; pz[i] += wz * d;
    // deslocamento da superfície nesse subpasso (arrasta o grão)
    const sx = ((m[0] - p[0]) * ax + (m[4] - p[4]) * ay + (m[8] - p[8]) * az + (m[12] - p[12])) / sub;
    const sy = ((m[1] - p[1]) * ax + (m[5] - p[5]) * ay + (m[9] - p[9]) * az + (m[13] - p[13])) / sub;
    const sz_ = ((m[2] - p[2]) * ax + (m[6] - p[6]) * ay + (m[10] - p[10]) * az + (m[14] - p[14])) / sub;
    // atrito: velocidade relativa tangencial
    let rx = px[i] - qx[i] - sx, ry = py[i] - qy[i] - sy, rz = pz[i] - qz[i] - sz_;
    const rn = rx * wx + ry * wy + rz * wz;
    rx -= rn * wx; ry -= rn * wy; rz -= rn * wz;
    const rt = Math.hypot(rx, ry, rz);
    const lim = c.mu * d;
    const f = rt < lim ? 1 : lim / rt;
    qx[i] += rx * f; qy[i] += ry * f; qz[i] += rz * f;
    // a superfície empurrando: transmite a velocidade normal da peça
    const sn = sx * wx + sy * wy + sz_ * wz;
    if (sn > 0) { qx[i] -= wx * sn * 0.2; qy[i] -= wy * sn * 0.2; qz[i] -= wz * sn * 0.2; }
    touch[i] = c.ci;
    hit = true;
  }
  return hit;
}

function park(i, ci) {
  const c = containers[ci];
  const e = c.inv.elements, x = px[i], y = py[i], z = pz[i];
  lx[i] = e[0] * x + e[4] * y + e[8] * z + e[12];
  ly[i] = e[1] * x + e[5] * y + e[9] * z + e[13];
  lz[i] = e[2] * x + e[6] * y + e[10] * z + e[14];
  state[i] = 2;
  cont[i] = ci;
}
function insideContainer(i, c) {
  const e = c.inv.elements, x = px[i], y = py[i], z = pz[i];
  const a = e[0] * x + e[4] * y + e[8] * z + e[12];
  const b = e[1] * x + e[5] * y + e[9] * z + e[13];
  const d = e[2] * x + e[6] * y + e[10] * z + e[14];
  const B = c.box;
  return a > B[0] && a < B[3] && b > B[1] && b < B[4] && d > B[2] && d < B[5];
}

export function stepGrains(dt) {
  refreshColliders();
  // contêineres que estão derramando soltam a carga
  for (let k = 0; k < containers.length; k++) {
    const c = containers[k];
    c.count = 0;
    c.spilling = c.enabled && c.spill();
  }
  // grãos estacionados acompanham a peça
  for (let i = 0; i < n; i++) {
    if (state[i] !== 2) continue;
    const c = containers[cont[i]];
    const m = c.m;
    const x = m[0] * lx[i] + m[4] * ly[i] + m[8] * lz[i] + m[12];
    const y = m[1] * lx[i] + m[5] * ly[i] + m[9] * lz[i] + m[13];
    const z = m[2] * lx[i] + m[6] * ly[i] + m[10] * lz[i] + m[14];
    if (c.spilling || !c.enabled) {
      // solta com a velocidade da peça
      qx[i] = px[i]; qy[i] = py[i]; qz[i] = pz[i];
      state[i] = 0; cont[i] = -1; rest[i] = 0;
    } else c.count++;
    px[i] = x; py[i] = y; pz[i] = z;
  }

  const sub = dt > 1 / 45 ? 2 : 1;
  const h = dt / sub;
  const damp = 0.996;
  for (let s = 0; s < sub; s++) {
    // integra
    for (let i = 0; i < n; i++) {
      if (state[i] === 2) continue;
      let vx = (px[i] - qx[i]) * damp, vy = (py[i] - qy[i]) * damp, vz = (pz[i] - qz[i]) * damp;
      // limita velocidade (evita grão "explodindo" ao nascer encostado na peça)
      const vm = Math.hypot(vx, vy, vz), vmax = 7 * h;
      if (vm > vmax) { const k = vmax / vm; vx *= k; vy *= k; vz *= k; }
      qx[i] = px[i]; qy[i] = py[i]; qz[i] = pz[i];
      px[i] += vx; py[i] += vy - G * h * h; pz[i] += vz;
      touch[i] = -2; onGround[i] = 0;
    }
    buildHash();
    // grão x grão
    for (let i = 0; i < n; i++) {
      if (state[i] === 2) continue;
      const ix = Math.floor(px[i] / CELL), iy = Math.floor(py[i] / CELL), iz = Math.floor(pz[i] / CELL);
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) for (let oz = -1; oz <= 1; oz++) {
        let j = head[hkey(ix + ox, iy + oy, iz + oz)];
        while (j >= 0) {
          if (j !== i && (j > i || state[j] === 2)) {
            const dx = px[i] - px[j], dy = py[i] - py[j], dz = pz[i] - pz[j];
            const d2 = dx * dx + dy * dy + dz * dz;
            const rr = (sz[i] + sz[j]) * 0.92;
            if (d2 < rr * rr && d2 > 1e-10) {
              const d = Math.sqrt(d2), pen = rr - d, nx = dx / d, ny = dy / d, nz = dz / d;
              if (state[j] === 2) {
                px[i] += nx * pen; py[i] += ny * pen; pz[i] += nz * pen;
                if (ny > 0.5) { touch[i] = cont[j]; }
                // atrito com a carga
                let rx = px[i] - qx[i], ry = py[i] - qy[i], rz = pz[i] - qz[i];
                const rn = rx * nx + ry * ny + rz * nz;
                rx -= rn * nx; ry -= rn * ny; rz -= rn * nz;
                qx[i] += rx * 0.5; qy[i] += ry * 0.5; qz[i] += rz * 0.5;
              } else {
                const hp = pen * 0.5;
                px[i] += nx * hp; py[i] += ny * hp; pz[i] += nz * hp;
                px[j] -= nx * hp; py[j] -= ny * hp; pz[j] -= nz * hp;
                // atrito entre grãos (faz monte em vez de líquido)
                const rvx = (px[i] - qx[i]) - (px[j] - qx[j]), rvy = (py[i] - qy[i]) - (py[j] - qy[j]), rvz = (pz[i] - qz[i]) - (pz[j] - qz[j]);
                const rn = rvx * nx + rvy * ny + rvz * nz;
                const tx = rvx - rn * nx, ty = rvy - rn * ny, tz = rvz - rn * nz;
                const f = 0.22;
                qx[i] += tx * f; qy[i] += ty * f; qz[i] += tz * f;
                qx[j] -= tx * f; qy[j] -= ty * f; qz[j] -= tz * f;
                if (ny > 0.6 && onGround[j]) onGround[i] = 2;
              }
            }
          }
          j = next[j];
        }
      }
    }
    // peças das máquinas, água e chão
    for (let i = 0; i < n; i++) {
      if (state[i] === 2) continue;
      collideBoxes(i, sub);
      // dentro d'água: arrasto forte e empuxo (afunda devagar e turva a água)
      const ws = waterSurface(px[i], pz[i]);
      if (py[i] < ws) {
        const k = 0.12;
        qx[i] += (px[i] - qx[i]) * k; qy[i] += (py[i] - qy[i]) * k; qz[i] += (pz[i] - qz[i]) * k;
        py[i] += G * h * h * 0.45;
        if ((i & 7) === 0) stirMud(px[i], pz[i], 0.01);
      }
      const R = sz[i] * 0.8;
      const hgt = heightAt(px[i], pz[i]);
      if (py[i] < hgt + R) {
        // normal do terreno
        const e = 0.3;
        const gx = heightAt(px[i] - e, pz[i]) - heightAt(px[i] + e, pz[i]);
        const gz = heightAt(px[i], pz[i] - e) - heightAt(px[i], pz[i] + e);
        const il = 1 / Math.hypot(gx, 2 * e, gz);
        const nx = gx * il, ny = 2 * e * il, nz = gz * il;
        const pen = (hgt + R - py[i]) * ny;
        px[i] += nx * pen; py[i] += ny * pen; pz[i] += nz * pen;
        let rx = px[i] - qx[i], ry = py[i] - qy[i], rz = pz[i] - qz[i];
        const rn = rx * nx + ry * ny + rz * nz;
        rx -= rn * nx; ry -= rn * ny; rz -= rn * nz;
        const rt = Math.hypot(rx, ry, rz), lim = 0.9 * pen + 0.002;
        const f = rt < lim ? 1 : lim / rt;
        qx[i] += rx * f; qy[i] += ry * f; qz[i] += rz * f;
        onGround[i] = 1;
      }
    }
  }

  // estado: estacionar, assentar, limpar
  for (let i = 0; i < n; i++) {
    if (state[i] === 2) continue;
    age[i] += dt;
    const v2 = ((px[i] - qx[i]) ** 2 + (py[i] - qy[i]) ** 2 + (pz[i] - qz[i]) ** 2) / (h * h);
    const slow = v2 < 0.5 * 0.5;
    rest[i] = slow ? rest[i] + dt : 0;
    // dentro de algum contêiner parado em relação a ele?
    if (touch[i] !== -2) {
      for (let k = 0; k < containers.length; k++) {
        const c = containers[k];
        if (!c.enabled || c.spilling) continue;
        if (insideContainer(i, c)) {
          if (touch[i] === k && rest[i] > 0.05) { park(i, k); c.count++; }
          break;
        }
      }
      if (state[i] === 2) continue;
    }
    const out = Math.abs(px[i]) > HALF - 0.5 || Math.abs(pz[i]) > HALF - 0.5 || py[i] < WATER_Y - 3;
    if (out) { kill(i); i--; continue; }
    if ((onGround[i] && rest[i] > 0.3 && touch[i] === -2) || (onGround[i] === 2 && rest[i] > 0.5 && touch[i] === -2) || age[i] > 14) {
      bake(i); i--; continue;
    }
  }
}

/* ---------- render ---------- */
export function renderGrains() {
  const me = mesh.instanceMatrix.array, ce = mesh.instanceColor.array;
  for (let i = 0; i < n; i++) {
    const s = sz[i], c = Math.cos(rot[i]) * s, sn = Math.sin(rot[i]) * s, o = i * 16;
    me[o] = c; me[o + 1] = 0; me[o + 2] = -sn; me[o + 3] = 0;
    me[o + 4] = 0; me[o + 5] = s * 0.85; me[o + 6] = 0; me[o + 7] = 0;
    me[o + 8] = sn; me[o + 9] = 0; me[o + 10] = c; me[o + 11] = 0;
    me[o + 12] = px[i]; me[o + 13] = py[i]; me[o + 14] = pz[i]; me[o + 15] = 1;
    ce[i * 3] = cr[i]; ce[i * 3 + 1] = cg[i]; ce[i * 3 + 2] = cb[i];
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
}

// estado compacto pra rede: x,y,z quantizados + material
export function packGrains(out) {
  const len = Math.min(n, cap);
  const buf = out && out.length >= len * 4 ? out : new Int16Array(len * 4);
  for (let i = 0; i < len; i++) {
    buf[i * 4] = Math.round(px[i] * 400); buf[i * 4 + 1] = Math.round(py[i] * 400);
    buf[i * 4 + 2] = Math.round(pz[i] * 400); buf[i * 4 + 3] = mat[i];
  }
  return buf.subarray(0, len * 4);
}
// cliente: mostra grãos recebidos do anfitrião (sem simular)
export function unpackGrains(buf) {
  const len = Math.min(buf.length / 4, MAX) | 0;
  for (let i = 0; i < len; i++) {
    px[i] = buf[i * 4] / 400; py[i] = buf[i * 4 + 1] / 400; pz[i] = buf[i * 4 + 2] / 400;
    const m = buf[i * 4 + 3];
    if (i >= n || mat[i] !== m) {
      mat[i] = m; sz[i] = GR * (0.85 + ((i * 37) % 17) / 37); rot[i] = i * 1.7;
      const c = MATS[m].c, k = 0.8 + ((i * 13) % 11) / 32;
      cr[i] = c.r * k; cg[i] = c.g * k; cb[i] = c.b * k;
    }
  }
  n = len;
}
