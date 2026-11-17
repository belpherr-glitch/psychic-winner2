// Escultura por código: o modelo é descrito como volumes (elipsoides, cápsulas afiladas...) que se
// fundem suavemente (campo de distância, SDF). Daí sai UMA malha contínua (surface nets), com normais
// lisas e pesos de esqueleto calculados automaticamente a partir do osso de cada volume.
import * as THREE from 'three';

// ---------- construtores de volumes ----------
// b = osso (null = espaço local da malha), k = raio de fusão suave, op = 'add' | 'sub' | 'int'
export const ell = (b, c, r, o = {}) => ({ t: 0, b, c, r, k: 0.04, op: 'add', ...o });
export const cap = (b, a, e, ra, rb = ra, o = {}) => ({ t: 1, b, a, e, ra, rb, k: 0.04, op: 'add', ...o });
export const box = (b, c, h, round = 0.02, o = {}) => ({ t: 2, b, c, h, round, k: 0.02, op: 'add', ...o });
// meio-espaço: tudo do lado contrário à normal n (a partir do ponto o) fica "dentro"
export const plane = (b, p, n, o = {}) => ({ t: 3, b, c: p, n, k: 0.01, op: 'int', ...o });

function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

function primDist(p, x, y, z) {
  // ponto no espaço do osso
  const m = p.m;
  let lx = x, ly = y, lz = z;
  if (m) {
    lx = m[0] * x + m[4] * y + m[8] * z + m[12];
    ly = m[1] * x + m[5] * y + m[9] * z + m[13];
    lz = m[2] * x + m[6] * y + m[10] * z + m[14];
  }
  let d;
  if (p.t === 0) {
    const qx = lx - p.c[0], qy = ly - p.c[1], qz = lz - p.c[2], r = p.r;
    const ax = qx / r[0], ay = qy / r[1], az = qz / r[2];
    const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
    if (k0 < 1e-6) d = -Math.min(r[0], r[1], r[2]);
    else {
      const bx = ax / r[0], by = ay / r[1], bz = az / r[2];
      d = (k0 * (k0 - 1)) / Math.sqrt(bx * bx + by * by + bz * bz);
    }
  } else if (p.t === 1) {
    const a = p.a, e = p.e;
    const bx = e[0] - a[0], by = e[1] - a[1], bz = e[2] - a[2];
    const px = lx - a[0], py = ly - a[1], pz = lz - a[2];
    let h = (px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz);
    h = h < 0 ? 0 : h > 1 ? 1 : h;
    const dx = px - bx * h, dy = py - by * h, dz = pz - bz * h;
    d = Math.sqrt(dx * dx + dy * dy + dz * dz) - (p.ra + (p.rb - p.ra) * h);
  } else if (p.t === 2) {
    const qx = Math.abs(lx - p.c[0]) - p.h[0], qy = Math.abs(ly - p.c[1]) - p.h[1], qz = Math.abs(lz - p.c[2]) - p.h[2];
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
    d = Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - p.round;
  } else {
    d = (lx - p.c[0]) * p.n[0] + (ly - p.c[1]) * p.n[1] + (lz - p.c[2]) * p.n[2];
  }
  return d - (p.infl || 0);
}

function evalPrims(prims, x, y, z) {
  let d = 1e9;
  for (let i = 0; i < prims.length; i++) {
    const p = prims[i], bs = p.bs;
    if (bs && d < 1e8) {
      const ex = x - bs[0], ey = y - bs[1], ez = z - bs[2], lim = bs[3] + d + p.k;
      if (lim <= 0 || ex * ex + ey * ey + ez * ez > lim * lim) continue;
    }
    const di = primDist(p, x, y, z);
    if (p.op === 'add') d = smin(d, di, p.k);
    else if (p.op === 'sub') d = -smin(-d, di, p.k);
    else d = -smin(-d, -di, p.k);
  }
  return d;
}
export const fieldOf = (prims) => (x, y, z) => evalPrims(prims, x, y, z);

// prepara os volumes: guarda a matriz modelo->osso de cada um
// bindInv: Map(osso -> Matrix4 inversa do bind em espaço de modelo); ossos fora do mapa = local
export function prepare(prims, bindInv) {
  const v = new THREE.Vector3(), inv = new THREE.Matrix4();
  for (const p of prims) {
    p.m = p.b && bindInv ? bindInv.get(p.b).elements : null;
    // esfera envolvente em espaço de modelo: permite pular volumes distantes (bem mais rápido)
    const toModel = (c) => { v.set(c[0], c[1], c[2]); if (p.m) v.applyMatrix4(inv.fromArray(p.m).invert()); return v.toArray(); };
    const extra = p.infl || 0;
    if (p.op !== 'add' || p.t === 3) p.bs = null;
    else if (p.t === 0) p.bs = [...toModel(p.c), Math.max(p.r[0], p.r[1], p.r[2]) + extra];
    else if (p.t === 2) p.bs = [...toModel(p.c), Math.hypot(p.h[0], p.h[1], p.h[2]) + p.round + extra];
    else {
      const a = toModel(p.a), e = toModel(p.e);
      p.bs = [(a[0] + e[0]) / 2, (a[1] + e[1]) / 2, (a[2] + e[2]) / 2, Math.hypot(a[0] - e[0], a[1] - e[1], a[2] - e[2]) / 2 + Math.max(p.ra, p.rb) + extra];
    }
  }
  return prims;
}

const CORNERS = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

// Gera a malha. opts: { h: tamanho da célula, min/max: caixa [x,y,z], bones: lista de ossos do esqueleto
// (pra gravar os pesos), uv: (x,y,z,nx,ny,nz) => [u,v], falloff: suavidade dos pesos }
export function sculpt(prims, { h = 0.014, min, max, bones = null, uv = null, falloff = 0.03 }) {
  const nx = Math.ceil((max[0] - min[0]) / h) + 1, ny = Math.ceil((max[1] - min[1]) / h) + 1, nz = Math.ceil((max[2] - min[2]) / h) + 1;
  // Amostragem em dois níveis: primeiro uma grade grossa; só os blocos perto da superfície são
  // amostrados por inteiro, e cada bloco só consulta os volumes que chegam até ele.
  const vals = new Float32Array(nx * ny * nz).fill(NaN);
  const B = 4, reach = B * h * 2.6, half = B * h * 0.87;
  const nbx = Math.ceil(nx / B), nby = Math.ceil(ny / B);
  const lists = new Map(); // bloco -> volumes relevantes
  for (let bz = 0; bz < nz; bz += B) for (let by = 0; by < ny; by += B) for (let bx = 0; bx < nx; bx += B) {
    const x1 = Math.min(bx + B, nx - 1), y1 = Math.min(by + B, ny - 1), z1 = Math.min(bz + B, nz - 1);
    const cx = min[0] + ((bx + x1) / 2) * h, cy = min[1] + ((by + y1) / 2) * h, cz = min[2] + ((bz + z1) / 2) * h;
    const c = evalPrims(prims, cx, cy, cz);
    const near = Math.abs(c) < reach;
    let list = prims;
    if (near) {
      list = prims.filter((p) => !p.bs || Math.hypot(cx - p.bs[0], cy - p.bs[1], cz - p.bs[2]) - p.bs[3] < half + reach + p.k);
      lists.set(bx / B + (by / B) * nbx + (bz / B) * nbx * nby, list);
    }
    for (let z = bz; z <= z1; z++) for (let y = by; y <= y1; y++) for (let x = bx; x <= x1; x++) {
      const k = x + y * nx + z * nx * ny;
      if (near) { if (vals[k] !== vals[k] || Math.abs(vals[k]) >= reach) vals[k] = evalPrims(list, min[0] + x * h, min[1] + y * h, min[2] + z * h); }
      else if (vals[k] !== vals[k]) vals[k] = c;
    }
  }
  const listAt = (x, y, z) => lists.get(Math.floor((x - min[0]) / h / B) + Math.floor((y - min[1]) / h / B) * nbx + Math.floor((z - min[2]) / h / B) * nbx * nby) || prims;

  const cells = new Int32Array(nx * ny * nz).fill(-1);
  const pos = [];
  const cv = new Float32Array(8);
  for (let z = 0; z < nz - 1; z++) for (let y = 0; y < ny - 1; y++) for (let x = 0; x < nx - 1; x++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) {
      const v = vals[x + CORNERS[c][0] + (y + CORNERS[c][1]) * nx + (z + CORNERS[c][2]) * nx * ny];
      cv[c] = v;
      if (v < 0) mask |= 1 << c;
    }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (let e = 0; e < 12; e++) {
      const a = EDGES[e][0], b = EDGES[e][1];
      if ((cv[a] < 0) === (cv[b] < 0)) continue;
      const t = cv[a] / (cv[a] - cv[b]);
      sx += CORNERS[a][0] + (CORNERS[b][0] - CORNERS[a][0]) * t;
      sy += CORNERS[a][1] + (CORNERS[b][1] - CORNERS[a][1]) * t;
      sz += CORNERS[a][2] + (CORNERS[b][2] - CORNERS[a][2]) * t;
      n++;
    }
    cells[x + y * nx + z * nx * ny] = pos.length / 3;
    pos.push(min[0] + (x + sx / n) * h, min[1] + (y + sy / n) * h, min[2] + (z + sz / n) * h);
  }

  // normais lisas pelo gradiente do campo
  const count = pos.length / 3, nrm = new Float32Array(count * 3), e = h * 0.5;
  for (let v = 0; v < count; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2], L = listAt(x, y, z);
    const f = (a, b, c) => evalPrims(L, a, b, c);
    const gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1;
    nrm[v * 3] = gx / l; nrm[v * 3 + 1] = gy / l; nrm[v * 3 + 2] = gz / l;
  }

  // faces: um quadrado pra cada aresta da grade que cruza a superfície
  const idx = [];
  const quad = (a, b, c, d) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    // orienta a face pra fora comparando com a normal do campo
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const wx = pos[d * 3] - pos[a * 3], wy = pos[d * 3 + 1] - pos[a * 3 + 1], wz = pos[d * 3 + 2] - pos[a * 3 + 2];
    const dot = (uy * wz - uz * wy) * nrm[a * 3] + (uz * wx - ux * wz) * nrm[a * 3 + 1] + (ux * wy - uy * wx) * nrm[a * 3 + 2];
    if (dot < 0) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d);
  };
  const C = (x, y, z) => cells[x + y * nx + z * nx * ny];
  for (let z = 1; z < nz - 1; z++) for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) {
    const v0 = vals[x + y * nx + z * nx * ny] < 0;
    if (v0 !== (vals[x + 1 + y * nx + z * nx * ny] < 0)) quad(C(x, y - 1, z - 1), C(x, y, z - 1), C(x, y, z), C(x, y - 1, z));
    if (v0 !== (vals[x + (y + 1) * nx + z * nx * ny] < 0)) quad(C(x - 1, y, z - 1), C(x - 1, y, z), C(x, y, z), C(x, y, z - 1));
    if (v0 !== (vals[x + y * nx + (z + 1) * nx * ny] < 0)) quad(C(x - 1, y - 1, z), C(x, y - 1, z), C(x, y, z), C(x - 1, y, z));
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setIndex(idx);

  if (uv) {
    const uvs = new Float32Array(count * 2);
    for (let v = 0; v < count; v++) {
      const r = uv(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
      uvs[v * 2] = r[0]; uvs[v * 2 + 1] = r[1];
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  }

  if (bones) {
    // peso de cada osso = quão perto o vértice está dos volumes daquele osso
    const si = new Uint16Array(count * 4), sw = new Float32Array(count * 4), acc = new Float32Array(bones.length);
    for (const p of prims) p.bi = p.op === 'add' && p.b ? bones.indexOf(p.b) : -1;
    for (let v = 0; v < count; v++) {
      acc.fill(0);
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2], L = listAt(x, y, z);
      for (let k = 0; k < L.length; k++) {
        const p = L[k];
        if (p.bi < 0) continue;
        const d = Math.max(primDist(p, x, y, z), 0);
        const w = Math.exp(-d / (p.fall || falloff));
        if (w > acc[p.bi]) acc[p.bi] = w;
      }
      let sum = 0;
      for (let s = 0; s < 4; s++) {
        let best = 0;
        for (let b = 1; b < acc.length; b++) if (acc[b] > acc[best]) best = b;
        si[v * 4 + s] = best; sw[v * 4 + s] = acc[best]; sum += acc[best];
        acc[best] = -1;
      }
      for (let s = 0; s < 4; s++) sw[v * 4 + s] = sum > 0 ? Math.max(sw[v * 4 + s], 0) / sum : s === 0 ? 1 : 0;
    }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  }
  g.computeBoundingSphere();
  return g;
}

// caixa que envolve os volumes (em espaço de modelo), com folga
export function boundsOf(prims, pad = 0.05) {
  const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9], v = new THREE.Vector3(), inv = new THREE.Matrix4();
  const grow = (p, r) => { for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], p.getComponent(i) - r); max[i] = Math.max(max[i], p.getComponent(i) + r); } };
  for (const p of prims) {
    if (p.op !== 'add') continue;
    const toModel = (c) => { v.set(c[0], c[1], c[2]); if (p.m) v.applyMatrix4(inv.fromArray(p.m).invert()); return v; };
    const extra = (p.infl || 0) + pad;
    if (p.t === 0) grow(toModel(p.c), Math.max(p.r[0], p.r[1], p.r[2]) + extra);
    else if (p.t === 1) { grow(toModel(p.a), p.ra + extra); grow(toModel(p.e), p.rb + extra); }
    else if (p.t === 2) grow(toModel(p.c), Math.hypot(p.h[0], p.h[1], p.h[2]) + p.round + extra);
  }
  return { min, max };
}

// anda por um raio a partir de "o" na direção "d" até encostar na superfície (pra colar o rosto na cabeça)
export function raycast(f, o, d, tMax = 2) {
  let t = tMax;
  // de fora pra dentro
  for (let i = 0; i < 60; i++) {
    const v = f(o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t);
    if (v < 0.0008) break;
    t -= v * 0.9;
    if (t < 0) return 0;
  }
  return t;
}
