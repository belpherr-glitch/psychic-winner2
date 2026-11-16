// Chunk meshing (face culling, smooth lighting, ambient occlusion) + world shaders.
import * as THREE from 'three';
import { W, D, H, CH } from './world.js';
import { B, OPAQUE, RENDER, SMOOTH } from './blocks.js';
import { hash2 } from './noise.js';

// Face table: normal, corners TL,TR,BR,BL viewed from outside, uv slot (0 top 1 side 2 bottom), shade.
export const FACES = [
  { n: [1, 0, 0], c: [[1, 1, 1], [1, 1, 0], [1, 0, 0], [1, 0, 1]], slot: 1, shade: 0.82 },
  { n: [-1, 0, 0], c: [[0, 1, 0], [0, 1, 1], [0, 0, 1], [0, 0, 0]], slot: 1, shade: 0.82 },
  { n: [0, 1, 0], c: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]], slot: 0, shade: 1.0 },
  { n: [0, -1, 0], c: [[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]], slot: 2, shade: 0.55 },
  { n: [0, 0, 1], c: [[0, 1, 1], [1, 1, 1], [1, 0, 1], [0, 0, 1]], slot: 1, shade: 0.7 },
  { n: [0, 0, -1], c: [[1, 1, 0], [0, 1, 0], [0, 0, 0], [1, 0, 0]], slot: 1, shade: 0.7 },
];
// For each face/corner: offsets of side1, side2, corner neighbours (relative to the block)
for (const f of FACES) {
  const a = f.n[0] ? 0 : f.n[1] ? 1 : 2;
  const others = [0, 1, 2].filter((k) => k !== a);
  f.nb = f.c.map((corner) => {
    const s1 = f.n.slice(), s2 = f.n.slice(), cc = f.n.slice();
    const d0 = corner[others[0]] ? 1 : -1, d1 = corner[others[1]] ? 1 : -1;
    s1[others[0]] += d0; s2[others[1]] += d1; cc[others[0]] += d0; cc[others[1]] += d1;
    return [s1, s2, cc];
  });
}

const LCURVE = new Float32Array(16);
for (let i = 0; i < 16; i++) LCURVE[i] = i === 0 ? 0 : Math.pow(0.8, 15 - i);
const AOK = [0.42, 0.62, 0.8, 1.0];

class Buf {
  constructor(extra) { this.pos = []; this.uv = []; this.shade = []; this.light = []; this.idx = []; this.extra = extra ? [] : null; this.n = 0; }
  geometry(extraName) {
    if (!this.n) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aShade', new THREE.Float32BufferAttribute(this.shade, 1));
    g.setAttribute('aLight', new THREE.Float32BufferAttribute(this.light, 2));
    if (this.extra) g.setAttribute(extraName, new THREE.Float32BufferAttribute(this.extra, 1));
    g.setIndex(this.n > 65000 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

export function buildChunk(world, ccx, ccz, faceUV, faceTile) {
  const op = new Buf(false), cr = new Buf(true), wa = new Buf(true), la = new Buf(true);
  const wa0 = wa;
  const x0 = ccx * CH, z0 = ccz * CH;
  const BL = world.blocks, LT = world.light;
  const get = (x, y, z) => world.get(x, y, z);
  const lightAt = (x, y, z) => world.getLight(x, y, z);

  // find vertical extent of interest
  let ymax = 0;
  for (let z = z0; z < z0 + CH; z++) for (let x = x0; x < x0 + CH; x++) {
    for (let y = H - 1; y > ymax; y--) if (BL[x + W * (z + D * y)] !== B.AIR) { ymax = y; break; }
  }

  for (let y = 0; y <= Math.min(H - 1, ymax + 1); y++) {
    for (let z = z0; z < z0 + CH; z++) {
      for (let x = x0; x < x0 + CH; x++) {
        const id = BL[x + W * (z + D * y)];
        const r = RENDER[id];
        if (r === 0) continue;
        if (r === 1) {
          if (SMOOTH[id]) continue;
          const uvs = faceUV[id];
          for (let fi = 0; fi < 6; fi++) {
            const f = FACES[fi];
            const nx = x + f.n[0], ny = y + f.n[1], nz = z + f.n[2];
            const nid = get(nx, ny, nz);
            if (OPAQUE[nid] && !SMOOTH[nid]) continue;
            const uv = uvs[f.slot];
            const base = op.n;
            const ao = [0, 0, 0, 0];
            const sinkBelow = SMOOTH[get(x, y - 1, z)] ? 0.6 : 0;
            for (let k = 0; k < 4; k++) {
              const c = f.c[k];
              op.pos.push(x + c[0], y + c[1] - (c[1] === 0 ? sinkBelow : 0), z + c[2]);
              const nb = f.nb[k];
              const o1 = OPAQUE[get(x + nb[0][0], y + nb[0][1], z + nb[0][2])];
              const o2 = OPAQUE[get(x + nb[1][0], y + nb[1][1], z + nb[1][2])];
              const o3 = OPAQUE[get(x + nb[2][0], y + nb[2][1], z + nb[2][2])];
              const a = o1 && o2 ? 0 : 3 - (o1 + o2 + o3);
              ao[k] = a;
              // smooth light
              let ls = 0, lb = 0, cnt = 0;
              const l0 = lightAt(nx, ny, nz); ls += l0 & 15; lb += l0 >> 4; cnt++;
              if (!o1) { const l = lightAt(x + nb[0][0], y + nb[0][1], z + nb[0][2]); ls += l & 15; lb += l >> 4; cnt++; }
              if (!o2) { const l = lightAt(x + nb[1][0], y + nb[1][1], z + nb[1][2]); ls += l & 15; lb += l >> 4; cnt++; }
              if (!o3 && !(o1 && o2)) { const l = lightAt(x + nb[2][0], y + nb[2][1], z + nb[2][2]); ls += l & 15; lb += l >> 4; cnt++; }
              const sl = ls / cnt, bl = lb / cnt;
              op.light.push(lerpCurve(sl), lerpCurve(bl));
              op.shade.push(f.shade * AOK[a]);
            }
            op.uv.push(uv[0], uv[3], uv[2], uv[3], uv[2], uv[1], uv[0], uv[1]);
            if (ao[0] + ao[2] < ao[1] + ao[3]) op.idx.push(base + 1, base, base + 3, base + 1, base + 3, base + 2);
            else op.idx.push(base, base + 3, base + 2, base, base + 2, base + 1);
            op.n += 4;
          }
        } else if (r === 2) {
          const uv = faceUV[id][0];
          const l = LT[x + W * (z + D * y)];
          const ls = LCURVE[l & 15], lb = LCURVE[l >> 4];
          const jx = (hash2(x, z, y) - 0.5) * 0.3, jz = (hash2(z, x, y + 9) - 0.5) * 0.3;
          const hgt = 0.85 + hash2(x + 3, z, y) * 0.3;
          const gS = world.surf[x + z * W];
          const gy = gS && world.height[x + z * W] === y - 1 ? Math.max(-0.6, Math.min(0.6, gS - y)) : 0;
          const a = 0.12, b = 0.88;
          const quads = [[[a, a], [b, b]], [[a, b], [b, a]]];
          for (const [p, q] of quads) {
            const base = cr.n;
            const px0 = x + p[0] + jx, pz0 = z + p[1] + jz, px1 = x + q[0] + jx, pz1 = z + q[1] + jz;
            cr.pos.push(px0, y + gy + hgt - 0.08, pz0, px1, y + gy + hgt - 0.08, pz1, px1, y + gy - 0.08, pz1, px0, y + gy - 0.08, pz0);
            cr.uv.push(uv[0], uv[3], uv[2], uv[3], uv[2], uv[1], uv[0], uv[1]);
            for (let k = 0; k < 4; k++) { cr.shade.push(k < 2 ? 1.0 : 0.75); cr.light.push(ls, lb); }
            cr.extra.push(1, 1, 0, 0);
            cr.idx.push(base, base + 3, base + 2, base, base + 2, base + 1);
            cr.n += 4;
          }
        } else if (r === 3) {
          // torch: small post with flame, uses tile pixel columns 7..9
          const uv = faceUV[id][0];
          const pu = (px) => uv[0] + (uv[2] - uv[0]) * px / 16;
          const pv = (py) => uv[3] - (uv[3] - uv[1]) * py / 16;
          const bx0 = x + 7 / 16, bx1 = x + 9 / 16, bz0 = z + 7 / 16, bz1 = z + 9 / 16, by0 = y, by1 = y + 13 / 16;
          const box = [
            [[bx1, by1, bz1], [bx1, by1, bz0], [bx1, by0, bz0], [bx1, by0, bz1]],
            [[bx0, by1, bz0], [bx0, by1, bz1], [bx0, by0, bz1], [bx0, by0, bz0]],
            [[bx0, by1, bz0], [bx1, by1, bz0], [bx1, by1, bz1], [bx0, by1, bz1]],
            [[bx0, by1 - 0.001, bz1], [bx1, by1, bz1], [bx1, by0, bz1], [bx0, by0, bz1]],
            [[bx1, by1, bz0], [bx0, by1, bz0], [bx0, by0, bz0], [bx1, by0, bz0]],
          ];
          box.forEach((q, qi) => {
            const base = cr.n;
            for (const v of q) cr.pos.push(v[0], v[1], v[2]);
            if (qi === 2) cr.uv.push(pu(7), pv(2), pu(9), pv(2), pu(9), pv(4), pu(7), pv(4));
            else cr.uv.push(pu(7), pv(3), pu(9), pv(3), pu(9), pv(16), pu(7), pv(16));
            for (let k = 0; k < 4; k++) { cr.shade.push(1); cr.light.push(1, 1); }
            cr.extra.push(0, 0, 0, 0);
            cr.idx.push(base, base + 3, base + 2, base, base + 2, base + 1);
            cr.n += 4;
          });
        } else if (r === 4 || r === 5) {
          const wa = r === 4 ? wa0 : la;
          for (let fi = 0; fi < 6; fi++) {
            const f = FACES[fi];
            const nx = x + f.n[0], ny = y + f.n[1], nz = z + f.n[2];
            const nid = get(nx, ny, nz);
            if (nid === id || (OPAQUE[nid] && !SMOOTH[nid]) || (SMOOTH[nid] && fi !== 2)) continue;
            if (fi === 3) continue;
            const base = wa.n;
            const l = lightAt(nx, ny, nz);
            const ls = LCURVE[l & 15], lb = LCURVE[l >> 4];
            for (let k = 0; k < 4; k++) {
              const c = f.c[k];
              const wx = x + c[0], wy = y + c[1], wz = z + c[2];
              wa.pos.push(wx, wy, wz);
              if (fi === 2) wa.uv.push(wx, wz); else wa.uv.push(wx + wz, wy);
              wa.shade.push(f.shade);
              wa.light.push(ls, lb);
              const topNeighbour = get(x, y + 1, z) === id;
              wa.extra.push(c[1] === 1 && !topNeighbour ? 1 : 0);
            }
            wa.idx.push(base, base + 3, base + 2, base, base + 2, base + 1);
            wa.n += 4;
          }
        }
      }
    }
  }
  return { opaque: op.geometry(), cross: cr.geometry('aSway'), water: wa.geometry('aTop'), lava: la.geometry('aTop'), terrain: buildTerrain(world, ccx, ccz, faceTile) };
}


// ---------------------------------------------------------------- smooth terrain (surface nets)
const SOLID_SMOOTH = (id) => SMOOTH[id] === 1;
export function buildTerrain(world, ccx, ccz, faceTile) {
  const x0 = ccx * CH, z0 = ccz * CH;
  const P = CH + 4, ox = x0 - 2, oz = z0 - 2;
  const BL = world.blocks;
  let ymax = 1;
  for (let z = oz; z < oz + P; z++) for (let x = ox; x < ox + P; x++) {
    if (x < 0 || z < 0 || x >= W || z >= D) { ymax = Math.max(ymax, 24); continue; }
    for (let y = H - 1; y > ymax; y--) if (SMOOTH[BL[x + W * (z + D * y)]]) { ymax = y; break; }
  }
  const NY = Math.min(H, ymax + 2) + 2; // local y = world y + 1
  const S = new Uint8Array(P * P * NY), ID = new Uint8Array(P * P * NY), Dn = new Float32Array(P * P * NY);
  const li = (x, y, z) => x + P * (z + P * y);
  for (let ly = 0; ly < NY; ly++) for (let lz = 0; lz < P; lz++) for (let lx = 0; lx < P; lx++) {
    const id = ly === 0 ? B.BEDROCK : world.get(ox + lx, ly - 1, oz + lz);
    const i = li(lx, ly, lz);
    ID[i] = id; S[i] = SMOOTH[id];
  }
  for (let ly = 0; ly < NY; ly++) for (let lz = 0; lz < P; lz++) for (let lx = 0; lx < P; lx++) {
    const i = li(lx, ly, lz);
    const s = S[i];
    if (lx === 0 || lz === 0 || ly === 0 || lx === P - 1 || lz === P - 1 || ly === NY - 1) { Dn[i] = s; continue; }
    const a = S[i - 1] + S[i + 1] + S[i - P] + S[i + P] + S[i - P * P] + S[i + P * P];
    Dn[i] = 0.62 * s + 0.38 * (a / 6);
  }
  // natural, unedited surface columns use the continuous height so hills are smooth slopes
  for (let lz = 0; lz < P; lz++) for (let lx = 0; lx < P; lx++) {
    const wx = ox + lx, wz = oz + lz;
    if (wx < 0 || wz < 0 || wx >= W || wz >= D) continue;
    const S = world.surf[wx + wz * W];
    if (!S) continue;
    const h = world.height[wx + wz * W];
    const ly = h + 1;
    if (ly + 1 >= NY) continue;
    const i0 = li(lx, ly, lz), i1 = li(lx, ly + 1, lz);
    if (!S || !SOLID_SMOOTH(ID[i0]) || SMOOTH[ID[i1]]) continue;
    Dn[i0] = Math.min(1, Math.max(0.5, S - h));
    Dn[i1] = Math.min(0.5, Math.max(0, S - h - 1));
    Dn[li(lx, ly - 1, lz)] = Math.max(Dn[li(lx, ly - 1, lz)], 0.9);
  }
  const inside = (i) => Dn[i] > 0.5;
  // cell cache: cell (cx,cy,cz) spans voxel centres cx..cx+1
  const cache = new Int32Array(P * P * NY).fill(-1);
  const vp = [], vn = [], vl = [], va = [];
  const CORN = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const dv = new Float32Array(8);
  function cell(cx, cy, cz) {
    const ci = li(cx, cy, cz);
    if (cache[ci] >= 0) return cache[ci];
    for (let k = 0; k < 8; k++) dv[k] = Dn[li(cx + CORN[k][0], cy + CORN[k][1], cz + CORN[k][2])];
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of EDGES) {
      const da = dv[a] - 0.5, db = dv[b] - 0.5;
      if ((da > 0) === (db > 0)) continue;
      const t = da / (da - db);
      sx += CORN[a][0] + (CORN[b][0] - CORN[a][0]) * t;
      sy += CORN[a][1] + (CORN[b][1] - CORN[a][1]) * t;
      sz += CORN[a][2] + (CORN[b][2] - CORN[a][2]) * t;
      n++;
    }
    if (!n) { sx = sy = sz = 0.5; n = 1; }
    const wx = ox + cx + 0.5 + sx / n, wy = cy - 1 + 0.5 + sy / n, wz = oz + cz + 0.5 + sz / n;
    let gx = (dv[1] + dv[3] + dv[5] + dv[7]) - (dv[0] + dv[2] + dv[4] + dv[6]);
    let gy = (dv[2] + dv[3] + dv[6] + dv[7]) - (dv[0] + dv[1] + dv[4] + dv[5]);
    let gz = (dv[4] + dv[5] + dv[6] + dv[7]) - (dv[0] + dv[1] + dv[2] + dv[3]);
    const gl = Math.hypot(gx, gy, gz) || 1;
    // light: average over open corners
    let ls = 0, lb = 0, cnt = 0, solid = 0;
    for (let k = 0; k < 8; k++) {
      if (dv[k] > 0.5) { solid++; continue; }
      const l = world.getLight(ox + cx + CORN[k][0], cy - 1 + CORN[k][1], oz + cz + CORN[k][2]);
      if (OPAQUE[world.get(ox + cx + CORN[k][0], cy - 1 + CORN[k][1], oz + cz + CORN[k][2])]) continue;
      ls += l & 15; lb += l >> 4; cnt++;
    }
    const idx = vp.length / 3;
    vp.push(wx, wy, wz);
    vn.push(-gx / gl, -gy / gl, -gz / gl);
    vl.push(cnt ? lerpCurve(ls / cnt) : 0, cnt ? lerpCurve(lb / cnt) : 0);
    va.push(Math.max(0.45, 1 - Math.max(0, solid - 4) * 0.13));
    cache[ci] = idx;
    return idx;
  }
  const pos = [], nor = [], lig = [], ao = [], til = [], idx = [];
  const matOf = (i, j) => {
    let id = S[i] ? ID[i] : S[j] ? ID[j] : 0;
    if (!id) { // density-inside but empty voxel: borrow a solid neighbour's material
      for (const o of [-P * P, -1, 1, -P, P, P * P]) if (S[i + o]) { id = ID[i + o]; break; }
    }
    return faceTile[id] || faceTile[B.DIRT];
  };
  const quad = (c0, c1, c2, c3, t, outDir) => {
    const vs = [cell(...c0), cell(...c1), cell(...c2), cell(...c3)];
    // winding check against outward direction
    const p = (k) => [vp[vs[k] * 3], vp[vs[k] * 3 + 1], vp[vs[k] * 3 + 2]];
    const A = p(0), Bv = p(1), C = p(2);
    const ux = Bv[0] - A[0], uy = Bv[1] - A[1], uz = Bv[2] - A[2];
    const wx = C[0] - A[0], wy = C[1] - A[1], wz = C[2] - A[2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const flip = nx * outDir[0] + ny * outDir[1] + nz * outDir[2] < 0;
    const base = pos.length / 3;
    for (const v of vs) {
      pos.push(vp[v * 3], vp[v * 3 + 1], vp[v * 3 + 2]);
      nor.push(vn[v * 3], vn[v * 3 + 1], vn[v * 3 + 2]);
      lig.push(vl[v * 2], vl[v * 2 + 1]);
      ao.push(va[v]);
      til.push(t[0], t[1], t[2]);
    }
    if (flip) idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    else idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (let ly = 1; ly < NY - 1; ly++) for (let lz = 2; lz < CH + 2; lz++) for (let lx = 2; lx < CH + 2; lx++) {
    const i = li(lx, ly, lz);
    const a = inside(i);
    // +x edge
    let j = i + 1;
    if (a !== inside(j)) quad([lx, ly - 1, lz - 1], [lx, ly, lz - 1], [lx, ly, lz], [lx, ly - 1, lz], matOf(a ? i : j, a ? j : i), a ? [1, 0, 0] : [-1, 0, 0]);
    j = i + P * P;
    if (a !== inside(j)) quad([lx - 1, ly, lz - 1], [lx, ly, lz - 1], [lx, ly, lz], [lx - 1, ly, lz], matOf(a ? i : j, a ? j : i), a ? [0, 1, 0] : [0, -1, 0]);
    j = i + P;
    if (a !== inside(j)) quad([lx - 1, ly - 1, lz], [lx, ly - 1, lz], [lx, ly, lz], [lx - 1, ly, lz], matOf(a ? i : j, a ? j : i), a ? [0, 0, 1] : [0, 0, -1]);
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aLight', new THREE.Float32BufferAttribute(lig, 2));
  g.setAttribute('aAO', new THREE.Float32BufferAttribute(ao, 1));
  g.setAttribute('aTiles', new THREE.Float32BufferAttribute(til, 3));
  g.setIndex(pos.length / 3 > 65000 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

function lerpCurve(v) {
  const i = Math.floor(v), f = v - i;
  if (i >= 15) return 1;
  return LCURVE[i] + (LCURVE[i + 1] - LCURVE[i]) * f;
}

// ---------------------------------------------------------------- materials
const commonVS = /* glsl */`
  attribute float aShade;
  attribute vec2 aLight;
  attribute float aSway;
  uniform float uTime;
  uniform float uSwayAmt;
  varying vec2 vUv;
  varying float vShade;
  varying vec2 vLight;
  varying float vDist;
  void main() {
    vUv = uv; vShade = aShade; vLight = aLight;
    vec3 p = position;
    if (uSwayAmt > 0.0) {
      float w = aSway * uSwayAmt;
      p.x += sin(uTime * 1.8 + position.x * 0.7 + position.z * 0.4) * 0.09 * w;
      p.z += cos(uTime * 1.4 + position.z * 0.8 + position.x * 0.3) * 0.07 * w;
    }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vDist = length(mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const commonFS = /* glsl */`
  uniform sampler2D uMap;
  uniform float uDay;
  uniform vec3 uSkyTint;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uMinLight;
  varying vec2 vUv;
  varying float vShade;
  varying vec2 vLight;
  varying float vDist;
  void main() {
    vec4 t = texture2D(uMap, vUv);
    if (t.a < 0.5) discard;
    vec3 sky = uSkyTint * (vLight.x * uDay);
    vec3 torch = vec3(1.0, 0.8, 0.55) * vLight.y * 1.05;
    vec3 L = max(max(sky, torch), vec3(uMinLight, uMinLight, uMinLight * 1.3));
    vec3 c = t.rgb * vShade * L;
    float f = smoothstep(uFogNear, uFogFar, vDist);
    gl_FragColor = vec4(mix(c, uFogColor, f), 1.0);
  }
`;
const waterVS = /* glsl */`
  attribute float aShade;
  attribute vec2 aLight;
  attribute float aTop;
  uniform float uTime;
  varying vec2 vUv;
  varying float vShade;
  varying vec2 vLight;
  varying float vDist;
  varying vec3 vWorld;
  void main() {
    vUv = uv; vShade = aShade; vLight = aLight;
    vec3 p = position;
    p.y -= aTop * (0.14 + sin(uTime * 1.6 + p.x * 0.9 + p.z * 0.7) * 0.04);
    vWorld = p;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vDist = length(mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const waterFS = /* glsl */`
  uniform sampler2D uWater;
  uniform float uDay;
  uniform float uTime;
  uniform vec3 uSkyTint;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uMinLight;
  varying vec2 vUv;
  varying float vShade;
  varying vec2 vLight;
  varying float vDist;
  varying vec3 vWorld;
  void main() {
    vec2 uv = vUv + vec2(uTime * 0.035, uTime * 0.02);
    vec4 t = texture2D(uWater, uv);
    vec4 t2 = texture2D(uWater, vUv * 0.5 - vec2(uTime * 0.02, -uTime * 0.03));
    vec3 col = mix(t.rgb, t2.rgb, 0.4);
    vec3 sky = uSkyTint * (vLight.x * uDay);
    vec3 torch = vec3(1.0, 0.8, 0.55) * vLight.y;
    vec3 L = max(max(sky, torch), vec3(uMinLight));
    vec3 c = col * vShade * L * 1.1;
    float f = smoothstep(uFogNear, uFogFar, vDist);
    gl_FragColor = vec4(mix(c, uFogColor, f), mix(0.78, 1.0, f));
  }
`;


const terrainVS = /* glsl */`
  attribute vec2 aLight;
  attribute float aAO;
  attribute vec3 aTiles;
  varying vec3 vWorld;
  varying vec3 vN;
  varying vec2 vLight;
  varying float vAO;
  varying vec3 vTiles;
  varying float vDist;
  void main() {
    vWorld = position; vN = normal; vLight = aLight; vAO = aAO; vTiles = aTiles;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDist = length(mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const terrainFS = /* glsl */`
  uniform sampler2D uMap;
  uniform vec2 uAtlas;
  uniform float uDay;
  uniform vec3 uSkyTint;
  uniform vec3 uSunDir;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uMinLight;
  varying vec3 vWorld;
  varying vec3 vN;
  varying vec2 vLight;
  varying float vAO;
  varying vec3 vTiles;
  varying float vDist;
  vec2 tileUV(float tile, vec2 f) {
    tile = floor(tile + 0.5);
    float col = mod(tile, uAtlas.x);
    float row = floor(tile / uAtlas.x + 0.001);
    f = clamp(fract(f), 0.004, 0.996);
    return vec2((col + f.x) / uAtlas.x, 1.0 - (row + 1.0 - f.y) / uAtlas.y);
  }
  void main() {
    vec3 n = normalize(vN);
    vec3 an = abs(n);
    vec4 t;
    if (an.y > 0.6) t = texture2D(uMap, tileUV(n.y > 0.0 ? vTiles.x : vTiles.z, vec2(vWorld.x, -vWorld.z)));
    else if (an.x > an.z) t = texture2D(uMap, tileUV(vTiles.y, vec2(-vWorld.z * sign(n.x), vWorld.y)));
    else t = texture2D(uMap, tileUV(vTiles.y, vec2(vWorld.x * sign(n.z), vWorld.y)));
    float ndl = dot(n, uSunDir);
    float toon = ndl > 0.3 ? 1.0 : (ndl > -0.05 ? 0.84 : 0.7);
    float up = 0.88 + 0.12 * n.y;
    vec3 sky = uSkyTint * (vLight.x * uDay) * toon * up;
    vec3 torch = vec3(1.0, 0.8, 0.55) * vLight.y * 1.05;
    vec3 L = max(max(sky, torch), vec3(uMinLight, uMinLight, uMinLight * 1.3));
    vec3 c = t.rgb * vAO * L;
    float f = smoothstep(uFogNear, uFogFar, vDist);
    gl_FragColor = vec4(mix(c, uFogColor, f), 1.0);
  }
`;

const lavaFS = /* glsl */`
  uniform sampler2D uWater;
  uniform float uTime;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  varying vec2 vUv;
  varying float vShade;
  varying float vDist;
  void main() {
    vec4 t = texture2D(uWater, vUv * 0.5 + vec2(uTime * 0.02, uTime * 0.013));
    vec4 t2 = texture2D(uWater, vUv * 0.25 - vec2(uTime * 0.011, -uTime * 0.017));
    vec3 c = mix(t.rgb, t2.rgb, 0.5) * (0.85 + 0.15 * vShade) * 1.15;
    float f = smoothstep(uFogNear, uFogFar, vDist) * 0.6;
    gl_FragColor = vec4(mix(c, uFogColor, f), 1.0);
  }
`;
export function createWorldMaterials(atlas, waterTex, info, lavaTex) {
  const shared = {
    uTime: { value: 0 },
    uDay: { value: 1 },
    uSkyTint: { value: new THREE.Color(1, 1, 1) },
    uFogColor: { value: new THREE.Color(0.7, 0.8, 0.95) },
    uFogNear: { value: 40 },
    uFogFar: { value: 90 },
    uMinLight: { value: 0.07 },
    uSunDir: { value: new THREE.Vector3(0.3, 0.9, 0.3).normalize() },
  };
  const terrain = new THREE.ShaderMaterial({
    uniforms: Object.assign({}, shared, { uMap: { value: atlas }, uAtlas: { value: new THREE.Vector2(info.cols, info.rows) } }),
    vertexShader: terrainVS, fragmentShader: terrainFS,
  });
  const opaque = new THREE.ShaderMaterial({
    uniforms: Object.assign({}, shared, { uMap: { value: atlas }, uSwayAmt: { value: 0 } }),
    vertexShader: commonVS, fragmentShader: commonFS,
  });
  const cross = new THREE.ShaderMaterial({
    uniforms: Object.assign({}, shared, { uMap: { value: atlas }, uSwayAmt: { value: 1 } }),
    vertexShader: commonVS, fragmentShader: commonFS, side: THREE.DoubleSide,
  });
  const water = new THREE.ShaderMaterial({
    uniforms: Object.assign({}, shared, { uWater: { value: waterTex } }),
    vertexShader: waterVS, fragmentShader: waterFS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const lava = new THREE.ShaderMaterial({
    uniforms: Object.assign({}, shared, { uWater: { value: lavaTex } }),
    vertexShader: waterVS, fragmentShader: lavaFS,
  });
  return { shared, opaque, cross, water, terrain, lava };
}

// ---------------------------------------------------------------- chunk manager
export class ChunkManager {
  constructor(world, scene, mats, faceUV, faceTile) {
    this.world = world; this.scene = scene; this.mats = mats; this.faceUV = faceUV; this.faceTile = faceTile;
    this.nx = W / CH; this.nz = D / CH;
    this.chunks = [];
    this.dirty = new Set();
    for (let z = 0; z < this.nz; z++) for (let x = 0; x < this.nx; x++) this.chunks.push({ x, z, meshes: [], built: false });
  }
  chunk(x, z) { return this.chunks[x + z * this.nx]; }
  build(c) {
    for (const m of c.meshes) { this.scene.remove(m); m.geometry.dispose(); }
    c.meshes = [];
    const g = buildChunk(this.world, c.x, c.z, this.faceUV, this.faceTile);
    if (g.terrain) c.meshes.push(new THREE.Mesh(g.terrain, this.mats.terrain));
    if (g.opaque) c.meshes.push(new THREE.Mesh(g.opaque, this.mats.opaque));
    if (g.cross) c.meshes.push(new THREE.Mesh(g.cross, this.mats.cross));
    if (g.lava) c.meshes.push(new THREE.Mesh(g.lava, this.mats.lava));
    if (g.water) { const m = new THREE.Mesh(g.water, this.mats.water); m.renderOrder = 2; c.meshes.push(m); }
    for (const m of c.meshes) { m.matrixAutoUpdate = false; m.visible = c.visible !== false; this.scene.add(m); }
    c.built = true;
  }
  async buildAll(progress) {
    let i = 0;
    for (const c of this.chunks) {
      this.build(c);
      if (++i % 6 === 0 && progress) { progress(i / this.chunks.length); await new Promise((r) => setTimeout(r, 0)); }
    }
  }
  markBox(x0, z0, x1, z1) {
    const cx0 = Math.max(0, Math.floor(x0 / CH)), cx1 = Math.min(this.nx - 1, Math.floor(x1 / CH));
    const cz0 = Math.max(0, Math.floor(z0 / CH)), cz1 = Math.min(this.nz - 1, Math.floor(z1 / CH));
    for (let z = cz0; z <= cz1; z++) for (let x = cx0; x <= cx1; x++) this.dirty.add(this.chunk(x, z));
  }
  // rebuild the chunk containing (x,z) right away, others over the next frames
  flush(x, z, budget = 2) {
    if (x !== undefined) {
      const c = this.chunk(Math.floor(x / CH), Math.floor(z / CH));
      if (c && this.dirty.has(c)) { this.build(c); this.dirty.delete(c); }
    }
    let n = 0;
    for (const c of this.dirty) { this.build(c); this.dirty.delete(c); if (++n >= budget) break; }
  }
  updateVisibility(px, pz, dist) {
    for (const c of this.chunks) {
      const cx = c.x * CH + CH / 2, cz = c.z * CH + CH / 2;
      const v = Math.hypot(cx - px, cz - pz) < dist + CH * 0.75;
      if (v !== c.visible) { c.visible = v; for (const m of c.meshes) m.visible = v; }
    }
  }
}
