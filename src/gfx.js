// Base gráfica: materiais PBR, texturas procedurais, peças arredondadas,
// pneus com garras, pistões hidráulicos e fusão de malhas estáticas.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from './util.js';

/* ---------- texturas ---------- */
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// leve sujeira na pintura (sutil, para não "esponjar" o cel shading)
const paintTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
  const r = rng(3);
  for (let i = 0; i < 160; i++) {
    const x = r() * w, y = r() * h, s = 2 + r() * 10;
    g.fillStyle = `rgba(120,80,40,${0.03 + r() * 0.04})`;
    g.beginPath(); g.arc(x, y, s, 0, 7); g.fill();
  }
});

export const hazardTex = canvasTex(256, 64, (g, w, h) => {
  g.fillStyle = '#16171a'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#f2b10a';
  for (let x = -h; x < w + h; x += 40) {
    g.beginPath(); g.moveTo(x, h); g.lineTo(x + 20, h); g.lineTo(x + 20 + h, 0); g.lineTo(x + h, 0); g.closePath(); g.fill();
  }
});

export const grilleTex = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#0c0d0f'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 12) {
    const grd = g.createLinearGradient(0, y, 0, y + 8);
    grd.addColorStop(0, '#4a4d52'); grd.addColorStop(1, '#202226');
    g.fillStyle = grd; g.fillRect(0, y + 2, w, 7);
  }
});

export const logoTex = canvasTex(512, 128, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.font = '800 84px "Barlow Condensed", "Arial Narrow", sans-serif';
  g.textBaseline = 'middle';
  g.fillStyle = '#16171a';
  const tw = g.measureText('TERRA PESADA').width;
  const k = Math.min(1, (w - 20) / tw);
  g.setTransform(k, 0, 0, 1, 10, 0);
  g.fillText('TERRA PESADA', 0, h / 2 + 4);
});

/* ---------- cel shading ---------- */
function ramp(tones) {
  const d = new Uint8Array(tones.length * 4);
  tones.forEach((t, i) => { const v = Math.round(t * 255); d.set([v, v, v, 255], i * 4); });
  const tex = new THREE.DataTexture(d, tones.length, 1, THREE.RGBAFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
export const RAMP_HARD = ramp([0.42, 0.68, 0.9, 1.0]);   // máquinas: faixas bem marcadas
export const RAMP_SOFT = ramp([0.6, 0.78, 0.92, 1.0]);   // chão e vegetação: mais suave
export const toon = (o, soft = false) => new THREE.MeshToonMaterial({ gradientMap: soft ? RAMP_SOFT : RAMP_HARD, ...o });

// vidro estilizado: azul escuro com reflexo em faixa diagonal
const glassTex = canvasTex(128, 128, (g, w, h) => {
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, '#4f86b8'); grd.addColorStop(1, '#1d3b5c');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.beginPath(); g.moveTo(w * 0.15, h); g.lineTo(w * 0.42, h); g.lineTo(w * 0.85, 0); g.lineTo(w * 0.58, 0); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.beginPath(); g.moveTo(w * 0.48, h); g.lineTo(w * 0.56, h); g.lineTo(w, h * 0.1); g.lineTo(w, 0); g.closePath(); g.fill();
});
glassTex.wrapS = glassTex.wrapT = THREE.ClampToEdgeWrapping;

export const MAT = {
  paint: toon({ color: 0xffbd18 }),
  paintDark: toon({ color: 0xd99a10, map: paintTex }),
  black: toon({ color: 0x2a2c31 }),
  frame: toon({ color: 0x34373d }),
  rubber: toon({ color: 0x26262a }),
  steel: toon({ color: 0x8d939b }),
  edge: toon({ color: 0xb3b6ba }),
  chrome: toon({ color: 0xe8edf2, emissive: 0x30353a }),
  glass: new THREE.MeshBasicMaterial({ map: glassTex, transparent: true, opacity: 0.9 }),
  lamp: new THREE.MeshBasicMaterial({ color: 0xfff6d6 }),
  tail: new THREE.MeshBasicMaterial({ color: 0xe0281b }),
  beacon: new THREE.MeshBasicMaterial({ color: 0xff8c1a }),
  seat: toon({ color: 0x3a3b40 }),
  screen: new THREE.MeshBasicMaterial({ color: 0x59c7ff }),
  grille: toon({ map: grilleTex }),
  hazard: toon({ map: hazardTex }),
  logo: new THREE.MeshBasicMaterial({ map: logoTex, transparent: true, depthWrite: false }),
};

/* ---------- contorno (casco invertido) ---------- */
export const outlineMat = new THREE.ShaderMaterial({
  uniforms: { color: { value: new THREE.Color(0x111214) } },
  vertexShader: `
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vec3 n = normalize(normalMatrix * normal);
      float t = clamp(-mv.z * 0.0021, 0.018, 0.07);
      mv.xyz += n * t;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `uniform vec3 color; void main() { gl_FragColor = vec4(color, 1.0); }`,
  side: THREE.BackSide,
});
const outlineCache = new WeakMap();
function outlineGeo(geo) {
  if (outlineCache.has(geo)) return outlineCache.get(geo);
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', geo.attributes.position.clone());
  if (geo.index) g.setIndex(geo.index.clone());
  g = mergeVertices(g, 1e-3);
  g.computeVertexNormals();
  outlineCache.set(geo, g);
  return g;
}
// adiciona contorno a todas as malhas de um objeto (exceto vidro/luzes)
export function outline(obj) {
  const list = [];
  obj.traverse((m) => {
    if (!m.isMesh || m.userData.noOutline || m.isInstancedMesh) return;
    if (m.material === outlineMat || m.material.isMeshBasicMaterial) return;
    list.push(m);
  });
  for (const m of list) {
    const o = new THREE.Mesh(outlineGeo(m.geometry), outlineMat);
    o.userData.noOutline = true;
    o.castShadow = false;
    o.receiveShadow = false;
    m.add(o);
  }
}

/* ---------- peças ---------- */
export function rbox(w, h, d, r = 0.06, seg = 2) {
  return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
}
export function part(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
export const cylGeo = (r1, r2, h, s = 12) => new THREE.CylinderGeometry(r1, r2, h, s);
// cilindro deitado ao longo do eixo X
export const axleGeo = (r, w, s = 14) => new THREE.CylinderGeometry(r, r, w, s).rotateZ(Math.PI / 2);

// casca de para-lama (meio cilindro aberto)
export function fenderGeo(r, w, arc = Math.PI * 0.95) {
  const g = new THREE.CylinderGeometry(r, r, w, 18, 1, true, -arc / 2, arc);
  g.rotateZ(Math.PI / 2);
  g.rotateX(-Math.PI / 2);
  return g;
}

// faixa curva (chapas em arco) — usada em caçambas e lâminas
export function arcStrip(pts, width, thick) {
  const geos = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [z0, y0] = pts[i], [z1, y1] = pts[i + 1];
    const len = Math.hypot(z1 - z0, y1 - y0);
    const g = new THREE.BoxGeometry(width, thick, len + thick * 0.6);
    g.rotateX(-Math.atan2(y1 - y0, z1 - z0));
    g.translate(0, (y0 + y1) / 2, (z0 + z1) / 2);
    geos.push(g);
  }
  return mergeGeometries(geos);
}

// chapa lateral a partir de um contorno (z,y)
export function plateGeo(pts, thick) {
  const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false });
  g.translate(0, 0, -thick / 2);
  g.rotateY(-Math.PI / 2);
  return g;
}

/* ---------- pneu de obra com garras em V ---------- */
const tireCache = new Map();
export function tireGeo(R, W, lugs = 20) {
  const key = R + ':' + W;
  if (tireCache.has(key)) return tireCache.get(key);
  const hw = W / 2;
  const prof = [
    [R * 0.6, -hw + 0.02], [R * 0.8, -hw], [R - 0.07, -hw + 0.01], [R - 0.02, -hw + 0.06],
    [R - 0.005, -hw + 0.14], [R, 0], [R - 0.005, hw - 0.14], [R - 0.02, hw - 0.06],
    [R - 0.07, hw - 0.01], [R * 0.8, hw], [R * 0.6, hw - 0.02],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const lathe = new THREE.LatheGeometry(prof, 30);
  lathe.rotateZ(Math.PI / 2);
  const geos = [lathe.toNonIndexed()];
  const lugH = Math.max(0.05, R * 0.085);
  for (let k = 0; k < lugs; k++) {
    const a = (k / lugs) * Math.PI * 2;
    for (const side of [-1, 1]) {
      const g = new THREE.BoxGeometry(W * 0.5, lugH, R * 0.17);
      g.rotateY(side * 0.5);
      g.translate(side * W * 0.22, R + lugH * 0.35, side * R * 0.04);
      g.rotateX(a + (side > 0 ? Math.PI / lugs : 0));
      geos.push(g.toNonIndexed());
    }
  }
  for (const g of geos) { g.deleteAttribute('uv'); }
  const out = mergeGeometries(geos);
  out.computeVertexNormals();
  tireCache.set(key, out);
  return out;
}

export function wheelGroup(R, W, rimMat = MAT.paint) {
  const g = new THREE.Group();
  const t = new THREE.Mesh(tireGeo(R, W, R > 0.6 ? 20 : 14), MAT.rubber);
  t.castShadow = true;
  g.add(t);
  const rim = new THREE.Mesh(axleGeo(R * 0.6, W * 0.82, 16), rimMat);
  rim.castShadow = true;
  g.add(rim);
  const dish = new THREE.Mesh(axleGeo(R * 0.36, W * 0.9, 12), MAT.black);
  g.add(dish);
  const hub = new THREE.Mesh(axleGeo(R * 0.16, W * 0.98, 10), MAT.steel);
  g.add(hub);
  const bolts = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const b = axleGeo(0.03, W * 0.93, 6);
    b.translate(0, Math.cos(a) * R * 0.26, Math.sin(a) * R * 0.26);
    bolts.push(b);
  }
  g.add(new THREE.Mesh(mergeGeometries(bolts), MAT.chrome));
  return g;
}

/* ---------- pistão hidráulico entre duas âncoras ---------- */
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
export class Piston {
  constructor(root, ancA, ancB, r = 0.09) {
    this.root = root; this.A = ancA; this.B = ancB;
    this.g = new THREE.Group();
    root.add(this.g);
    root.updateMatrixWorld(true);
    ancA.getWorldPosition(_a); ancB.getWorldPosition(_b);
    const rest = _a.distanceTo(_b);
    this.barrelLen = rest * 0.6;
    const barrel = new THREE.Mesh(cylGeo(r, r, this.barrelLen, 12).translate(0, this.barrelLen / 2, 0), MAT.paint);
    barrel.castShadow = true;
    const cap = new THREE.Mesh(cylGeo(r * 1.15, r * 1.15, 0.08, 12).translate(0, this.barrelLen, 0), MAT.black);
    this.rod = new THREE.Mesh(cylGeo(r * 0.55, r * 0.55, 1, 10).translate(0, 0.5, 0), MAT.chrome);
    this.rod.castShadow = true;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(r * 1.1, 10, 8), MAT.black);
    this.eye = eye;
    this.g.add(barrel, cap, this.rod, eye);
  }
  update() {
    this.A.getWorldPosition(_a); this.B.getWorldPosition(_b);
    this.root.worldToLocal(_a); this.root.worldToLocal(_b);
    _d.subVectors(_b, _a);
    const len = _d.length();
    this.g.position.copy(_a);
    this.g.quaternion.setFromUnitVectors(_up, _d.multiplyScalar(1 / len));
    const start = this.barrelLen * 0.85;
    this.rod.position.y = start;
    this.rod.scale.y = Math.max(0.05, len - start);
    this.eye.position.y = len;
  }
}

export function anchor(parent, x, y, z) {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}

/* ---------- funde malhas estáticas de um grupo por material ---------- */
export function bake(group, keep = new Set()) {
  const byMat = new Map();
  const remove = [];
  group.updateMatrix();
  for (const c of group.children) {
    if (!c.isMesh || c.isInstancedMesh || keep.has(c) || c.userData.keep) continue;
    c.updateMatrix();
    let g = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    g.applyMatrix4(c.matrix);
    if (!byMat.has(c.material)) byMat.set(c.material, []);
    byMat.get(c.material).push(g);
    remove.push(c);
  }
  for (const c of remove) group.remove(c);
  for (const [mat, geos] of byMat) {
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
}

export { mergeGeometries };
