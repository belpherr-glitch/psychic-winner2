// Grãos e torrões: carregam volume real. Ao tocar o chão viram terreno;
// ao cair numa báscula viram carga do caminhão.
import * as THREE from 'three';
import { MATS, heightAt, deposit, grainTex } from './terrain.js';
import { toon } from './gfx.js';

const MAX = 2200;
const geo = new THREE.IcosahedronGeometry(1, 0);
const mesh = new THREE.InstancedMesh(geo, toon({ map: grainTex }), MAX);
mesh.frustumCulled = false;
mesh.castShadow = true;
mesh.count = 0;
mesh.setColorAt(0, new THREE.Color(1, 1, 1));
export const particleMesh = mesh;

const px = new Float32Array(MAX), py = new Float32Array(MAX), pz = new Float32Array(MAX);
const vx = new Float32Array(MAX), vy = new Float32Array(MAX), vz = new Float32Array(MAX);
const vol = new Float32Array(MAX), sz = new Float32Array(MAX), rot = new Float32Array(MAX), spin = new Float32Array(MAX);
const cr = new Float32Array(MAX), cg = new Float32Array(MAX), cb = new Float32Array(MAX);
const mat = new Uint8Array(MAX), age = new Float32Array(MAX);
let n = 0;

const catchers = []; // fn(x,y,z,vol,mat) -> true se absorveu
export const addCatcher = (fn) => catchers.push(fn);
let onLand = null;
export const setLandHook = (fn) => { onLand = fn; };

export function spawn(x, y, z, ux, uy, uz, v, m, size) {
  if (n >= MAX) {
    // sem espaço: deposita direto pra não perder volume
    if (v > 0) { deposit(x, z, v, m); if (onLand) onLand(x, z, v, m); }
    return;
  }
  const i = n++;
  px[i] = x; py[i] = y; pz[i] = z;
  vx[i] = ux; vy[i] = uy; vz[i] = uz;
  vol[i] = v; mat[i] = m; age[i] = 0;
  sz[i] = size ?? Math.min(0.32, Math.max(0.07, Math.cbrt(Math.max(v, 0.0004)) * 0.75));
  rot[i] = Math.random() * 6.28;
  spin[i] = (Math.random() - 0.5) * 8;
  const c = MATS[m].c, k = 0.82 + Math.random() * 0.3;
  cr[i] = c.r * k; cg[i] = c.g * k; cb[i] = c.b * k;
}

export function clearParticles() { n = 0; mesh.count = 0; }
export const particleCount = () => n;

function kill(i) {
  const j = --n;
  if (i === j) return;
  px[i] = px[j]; py[i] = py[j]; pz[i] = pz[j];
  vx[i] = vx[j]; vy[i] = vy[j]; vz[i] = vz[j];
  vol[i] = vol[j]; mat[i] = mat[j]; age[i] = age[j]; sz[i] = sz[j];
  rot[i] = rot[j]; spin[i] = spin[j]; cr[i] = cr[j]; cg[i] = cg[j]; cb[i] = cb[j];
}

export function updateParticles(dt) {
  const me = mesh.instanceMatrix.array, ce = mesh.instanceColor.array;
  for (let i = 0; i < n; i++) {
    vy[i] -= 9.81 * dt;
    vx[i] *= 1 - 0.4 * dt;
    vz[i] *= 1 - 0.4 * dt;
    px[i] += vx[i] * dt; py[i] += vy[i] * dt; pz[i] += vz[i] * dt;
    rot[i] += spin[i] * dt;
    age[i] += dt;
    let gone = false;
    if (vy[i] < 0 && vol[i] > 0) {
      for (const c of catchers) {
        if (c(px[i], py[i], pz[i], vol[i], mat[i])) { gone = true; break; }
      }
    }
    if (!gone) {
      const h = heightAt(px[i], pz[i]);
      if (py[i] <= h || age[i] > 6) {
        if (vol[i] > 0) {
          deposit(px[i], pz[i], vol[i], mat[i]);
          if (onLand) onLand(px[i], pz[i], vol[i], mat[i]);
        }
        gone = true;
      }
    }
    if (gone) { kill(i); i--; continue; }
  }
  for (let i = 0; i < n; i++) {
    const s = sz[i], c = Math.cos(rot[i]) * s, sn = Math.sin(rot[i]) * s, o = i * 16;
    me[o] = c; me[o + 1] = 0; me[o + 2] = -sn; me[o + 3] = 0;
    me[o + 4] = 0; me[o + 5] = s * 0.78; me[o + 6] = 0; me[o + 7] = 0;
    me[o + 8] = sn; me[o + 9] = 0; me[o + 10] = c; me[o + 11] = 0;
    me[o + 12] = px[i]; me[o + 13] = py[i]; me[o + 14] = pz[i]; me[o + 15] = 1;
    ce[i * 3] = cr[i]; ce[i * 3 + 1] = cg[i]; ce[i * 3 + 2] = cb[i];
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
}

/* ---------- poeira (cosmética) ---------- */
const DMAX = 160;
const dmesh = new THREE.InstancedMesh(
  new THREE.IcosahedronGeometry(1, 1),
  new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.38, depthWrite: false, flatShading: true }),
  DMAX
);
dmesh.frustumCulled = false;
dmesh.count = 0;
export const dustMesh = dmesh;
const dust = [];
const _m = new THREE.Matrix4();
const _pc = new THREE.Color();
export function puff(x, y, z, vxx, vzz, size = 0.5, color = 0xe8d6b4) {
  if (dust.length >= DMAX) dust.shift();
  dust.push({ x, y, z, vx: vxx + (Math.random() - 0.5) * 0.6, vz: vzz + (Math.random() - 0.5) * 0.6, vy: 0.4 + Math.random() * 0.5, t: 0, life: 1.4 + Math.random(), s: size, c: color });
}
export function updateDust(dt) {
  let k = 0;
  for (let i = 0; i < dust.length; i++) {
    const d = dust[i];
    d.t += dt;
    if (d.t > d.life) continue;
    d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
    d.vx *= 1 - dt; d.vz *= 1 - dt;
    const f = d.t / d.life, s = d.s * (0.6 + f * 2.2) * (1 - f * f);
    _m.makeScale(s, s * 0.8, s).setPosition(d.x, d.y, d.z);
    dmesh.setColorAt(k, _pc.set(d.c || 0xe8d6b4));
    dmesh.setMatrixAt(k++, _m);
    dust[k - 1] = d;
  }
  dust.length = k;
  dmesh.count = k;
  dmesh.instanceMatrix.needsUpdate = true;
  if (dmesh.instanceColor) dmesh.instanceColor.needsUpdate = true;
}
export function clearDust() { dust.length = 0; dmesh.count = 0; }
