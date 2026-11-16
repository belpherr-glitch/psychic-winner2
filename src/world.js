// Céu, luz, rio, mata ao redor e nuvens.
import * as THREE from 'three';
import { rng, smooth, lerp } from './util.js';
import { HALF, WATER_Y, RIVER, riverX, riverProfile, heightAt, grainTex } from './terrain.js';
import { toon } from './gfx.js';

export function makeSky(scene) {
  const g = new THREE.SphereGeometry(450, 32, 16);
  const top = new THREE.Color(0x3d9df0), hor = new THREE.Color(0xe4f4ff), bot = new THREE.Color(0xcfe8d0);
  const c = new Float32Array(g.attributes.position.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < g.attributes.position.count; i++) {
    const y = g.attributes.position.getY(i) / 450;
    if (y > 0) tmp.copy(hor).lerp(top, Math.pow(y, 0.6));
    else tmp.copy(hor).lerp(bot, Math.min(1, -y * 4));
    c[i * 3] = tmp.r; c[i * 3 + 1] = tmp.g; c[i * 3 + 2] = tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const sky = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -1;
  scene.add(sky);
  scene.fog = new THREE.Fog(0xd6ecf7, 90, 300);
  return sky;
}

export function makeLights(scene) {
  const hemi = new THREE.HemisphereLight(0xdaf0ff, 0x8a7a50, 1.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff3dc, 2.4);
  sun.castShadow = true;
  const sc = sun.shadow.camera;
  sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 160;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  return { hemi, sun, off: new THREE.Vector3(32, 58, 20) };
}

function rippleTexture() {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);
  const r = rng(5);
  for (let i = 0; i < 260; i++) {
    const x = r() * S, y = r() * S, w = 6 + r() * 26;
    g.strokeStyle = `rgba(160,225,240,${0.25 + r() * 0.4})`;
    g.lineWidth = 1 + r() * 2;
    g.beginPath();
    g.ellipse(x, y, w, w * 0.25, 0, Math.PI * 1.1, Math.PI * 1.9);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(4, 30);
  return t;
}

export function makeWater(scene) {
  const tex = rippleTexture();
  const mat = toon({ color: 0x36c6dc, map: tex, transparent: true, opacity: 0.86 }, true);
  // rio fora do canteiro (dentro, a água é simulada em water.js)
  const L = 230;
  for (const sg of [1, -1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(40, L), mat);
    w.rotation.x = -Math.PI / 2;
    w.position.set(RIVER.cx, WATER_Y, sg * (HALF + L / 2 - 0.6));
    scene.add(w);
  }
  return { tex };
}

// chão fora do canteiro (o rio continua até a neblina)
export function makeOuter(scene) {
  const grass = toon({ color: 0x78c437, map: grainTex }, true);
  const add = (x0, x1, z0, z1) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), grass);
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, -0.02, (z0 + z1) / 2);
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  const F = 420;
  const gl = RIVER.cx - 9, gr = RIVER.cx + 9;
  add(-F, -HALF, -F, F);
  add(HALF, F, -F, F);
  add(-HALF, gl, HALF, F);
  add(gr, HALF, HALF, F);
  add(-HALF, gl, -F, -HALF);
  add(gr, HALF, -F, -HALF);
  // faixa do rio fora do mapa, mesmo perfil da margem
  const seg = 36;
  for (const sgn of [1, -1]) {
    const g = new THREE.PlaneGeometry(gr - gl, F - HALF, seg, 1);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    const col = new Float32Array(p.count * 3);
    const cg = new THREE.Color(0x78c437), cs = new THREE.Color(0xd9be82), tmp = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + (gl + gr) / 2;
      const h = lerp(0, -2.3, riverProfile(Math.abs(x - RIVER.cx)));
      p.setY(i, h - 0.02);
      tmp.copy(cs).lerp(cg, smooth(WATER_Y + 0.3, WATER_Y + 0.9, h));
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, toon({ vertexColors: true, map: grainTex }, true));
    m.position.set((gl + gr) / 2, 0, sgn * (HALF + (F - HALF) / 2));
    m.receiveShadow = true;
    scene.add(m);
  }
}

/* ---------- vegetação e pedras ---------- */
const TMAX = 420;
function droopCone(r, h, y, seg, seed) {
  const g = new THREE.ConeGeometry(r, h, seg, 2).translate(0, y, 0);
  const p = g.attributes.position, rr = rng(seed);
  for (let i = 0; i < p.count; i++) {
    const py = p.getY(i);
    if (py < y - h / 2 + 0.01) p.setY(i, py - rr() * 0.25);
    else if (py < y + h / 2 - 0.01) { p.setX(i, p.getX(i) * (0.95 + rr() * 0.12)); p.setZ(i, p.getZ(i) * (0.95 + rr() * 0.12)); }
  }
  const f = g.toNonIndexed();
  f.computeVertexNormals();
  return f;
}
const pineGeos = [
  new THREE.CylinderGeometry(0.16, 0.26, 1.8, 6).translate(0, 0.9, 0),
  droopCone(1.7, 2.0, 2.0, 8, 1), droopCone(1.32, 1.8, 3.1, 8, 2), droopCone(0.95, 1.6, 4.1, 7, 3), droopCone(0.55, 1.3, 5.0, 6, 4),
];
const roundGeo = (() => {
  const g = new THREE.IcosahedronGeometry(1.4, 1);
  const p = g.attributes.position, r = rng(8);
  const seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = p.getX(i).toFixed(3) + p.getY(i).toFixed(3) + p.getZ(i).toFixed(3);
    if (!seen.has(key)) seen.set(key, 0.85 + r() * 0.3);
    const k = seen.get(key);
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.9, p.getZ(i) * k);
  }
  g.translate(0, 3.0, 0);
  const f = g.index ? g.toNonIndexed() : g;
  f.computeVertexNormals();
  return f;
})();
const rockGeo = (() => {
  const g = new THREE.DodecahedronGeometry(0.6, 0);
  const p = g.attributes.position, r = rng(5);
  const seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = p.getX(i).toFixed(3) + p.getY(i).toFixed(3) + p.getZ(i).toFixed(3);
    if (!seen.has(key)) seen.set(key, 0.75 + r() * 0.5);
    const k = seen.get(key);
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.65, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
})();
const trunkMat = toon({ color: 0x8a4f2b });
const leafMat = toon({});
const pine = pineGeos.map((g, i) => new THREE.InstancedMesh(g, i === 0 ? trunkMat : leafMat, TMAX));
const roundTrunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.22, 2.4, 6).translate(0, 1.2, 0), trunkMat, 120);
const roundTop = new THREE.InstancedMesh(roundGeo, leafMat, 120);
const rocks = new THREE.InstancedMesh(rockGeo, toon({ color: 0x9a9890 }), 160);
const all = [...pine, roundTrunk, roundTop, rocks];
for (const p of all) { p.castShadow = true; p.frustumCulled = false; p.count = 0; }
rocks.castShadow = false;
export function addTreeMeshes(scene) { for (const p of all) scene.add(p); }

export function placeTrees(seed, reserved) {
  const r = rng(seed * 13 + 1);
  const trees = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
  const col = new THREE.Color();
  const free = (x, z, rad, gap = 4.2) => {
    if (Math.abs(x - riverX(Math.max(-HALF, Math.min(HALF, z)))) < RIVER.w / 2 + 4.5) return false;
    for (const rr of reserved) if (x > rr[0] - rad && x < rr[2] + rad && z > rr[1] - rad && z < rr[3] + rad) return false;
    for (const t of trees) if ((t.x - x) ** 2 + (t.z - z) ** 2 < gap) return false;
    return true;
  };
  let np = 0, nr = 0, tries = 0;
  while ((np < TMAX || nr < 120) && tries++ < 12000) {
    const ang = r() * Math.PI * 2;
    const rad = 25 + Math.pow(r(), 0.7) * 72;
    const x = Math.cos(ang) * rad * 1.1, z = Math.sin(ang) * rad;
    const inside = Math.abs(x) < HALF - 1 && Math.abs(z) < HALF - 1;
    if (inside && rad < 30 && r() < 0.6) continue;
    if (!free(x, z, 2)) continue;
    const y = inside ? heightAt(x, z) : -0.02;
    const round = r() < 0.22;
    if (round ? nr >= 120 : np >= TMAX) continue;
    const sc = round ? 0.8 + r() * 0.5 : 0.75 + r() * 0.8;
    trees.push({ x, z, r: (round ? 0.45 : 0.55) * sc, inside });
    p.set(x, y - 0.05, z);
    e.set((r() - 0.5) * 0.06, r() * 6.28, (r() - 0.5) * 0.06);
    q.setFromEuler(e);
    s.set(sc, sc * (0.9 + r() * 0.35), sc);
    m.compose(p, q, s);
    if (round) {
      roundTrunk.setMatrixAt(nr, m); roundTop.setMatrixAt(nr, m);
      col.setHSL(0.22 + r() * 0.07, 0.62, 0.42 + r() * 0.1);
      roundTop.setColorAt(nr, col);
      nr++;
    } else {
      for (const part of pine) part.setMatrixAt(np, m);
      col.setHSL(0.35 + r() * 0.05, 0.55 + r() * 0.15, 0.27 + r() * 0.08);
      for (let j = 1; j < pine.length; j++) pine[j].setColorAt(np, col);
      np++;
    }
  }
  // pedras espalhadas na borda
  let nk = 0;
  for (let t = 0; t < 900 && nk < 160; t++) {
    const ang = r() * Math.PI * 2, rad = 30 + r() * 60;
    const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
    const inside = Math.abs(x) < HALF - 1 && Math.abs(z) < HALF - 1;
    if (!free(x, z, 1, 1.5)) continue;
    if (inside && Math.max(Math.abs(x), Math.abs(z)) < HALF - 7) continue;
    const sc = 0.4 + r() * r() * 1.6;
    p.set(x, (inside ? heightAt(x, z) : 0) + 0.05 * sc, z);
    e.set(r() * 0.4, r() * 6.28, r() * 0.4);
    q.setFromEuler(e);
    s.set(sc, sc, sc);
    m.compose(p, q, s);
    rocks.setMatrixAt(nk++, m);
  }
  pine.forEach((x) => { x.count = np; }); roundTrunk.count = nr; roundTop.count = nr; rocks.count = nk;
  for (const part of all) {
    part.instanceMatrix.needsUpdate = true;
    if (part.instanceColor) part.instanceColor.needsUpdate = true;
  }
  return trees.filter((t) => t.inside);
}

export function makeClouds(scene) {
  const g = new THREE.Group();
  const mat = toon({ color: 0xffffff, emissive: 0x7d8fa6, fog: false });
  const r = rng(99);
  for (let c = 0; c < 12; c++) {
    const cl = new THREE.Group();
    const n = 3 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const s = 4 + r() * 6;
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), mat);
      m.position.set(i * 6 - n * 3 + r() * 3, r() * 3, r() * 4);
      m.scale.y = 0.55;
      cl.add(m);
    }
    const a = r() * Math.PI * 2, d = 140 + r() * 160;
    cl.position.set(Math.cos(a) * d, 70 + r() * 40, Math.sin(a) * d);
    cl.rotation.y = r() * 6;
    g.add(cl);
  }
  scene.add(g);
  return g;
}
