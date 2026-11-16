// Model building: atlas-packed box parts with painted pixel faces, sprite extrusion, block items.
import * as THREE from 'three';
import { Painter, shade, mix, rgb } from './pixel.js';
import { FACES } from './mesher.js';

// ------------------------------------------------------------ atlas
export class ModelAtlas {
  constructor(size = 256, seed = 1) {
    this.size = size;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d');
    this.x = 1; this.y = 1; this.rowH = 0;
    this.seed = seed;
    this.tex = null;
  }
  add(w, h, paint) {
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    if (this.x + w + 1 > this.size) { this.x = 1; this.y += this.rowH + 2; this.rowH = 0; }
    if (this.y + h + 1 > this.size) throw new Error('atlas full');
    const p = new Painter(w, h, this.seed++);
    if (paint) paint(p, w, h); else p.fill('#ff00ff');
    // padded blit: copy edge pixels into 1px border to stop seams
    const img = p.toCanvas();
    const c = this.ctx;
    c.drawImage(img, this.x, this.y);
    c.drawImage(img, 0, 0, w, 1, this.x, this.y - 1, w, 1);
    c.drawImage(img, 0, h - 1, w, 1, this.x, this.y + h, w, 1);
    c.drawImage(img, 0, 0, 1, h, this.x - 1, this.y, 1, h);
    c.drawImage(img, w - 1, 0, 1, h, this.x + w, this.y, 1, h);
    const S = this.size;
    const rect = [this.x / S, 1 - (this.y + h) / S, (this.x + w) / S, 1 - this.y / S];
    this.x += w + 2; this.rowH = Math.max(this.rowH, h);
    return rect;
  }
  texture() {
    if (!this.tex) {
      this.tex = new THREE.CanvasTexture(this.canvas);
      this.tex.magFilter = THREE.NearestFilter; this.tex.minFilter = THREE.NearestFilter;
      this.tex.generateMipmaps = false; this.tex.colorSpace = THREE.NoColorSpace;
    }
    return this.tex;
  }
}

// faces: object with keys front back left right top bottom (painters) or 'all'
// size [w,h,d] in px, from [x,y,z] = min corner in px relative to pivot. Model faces +z.
export function boxGeo(atlas, size, from, faces, scale) {
  const [w, h, d] = size;
  const pick = (k) => faces[k] || faces.side || faces.all;
  const dims = { left: [d, h], right: [d, h], top: [w, d], bottom: [w, d], front: [w, h], back: [w, h] };
  const keys = ['left', 'right', 'top', 'bottom', 'front', 'back']; // matches FACES order (+x,-x,+y,-y,+z,-z)
  const rects = keys.map((k) => atlas.add(dims[k][0], dims[k][1], (p) => pick(k)(p, k)));
  const pos = [], uv = [], col = [], idx = [];
  FACES.forEach((f, fi) => {
    const r = rects[fi];
    const base = pos.length / 3;
    for (const c of f.c) {
      pos.push((from[0] + c[0] * w) * scale, (from[1] + c[1] * h) * scale, (from[2] + c[2] * d) * scale);
      col.push(f.shade, f.shade, f.shade);
    }
    uv.push(r[0], r[3], r[2], r[3], r[2], r[1], r[0], r[1]);
    idx.push(base, base + 3, base + 2, base, base + 2, base + 1);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export function mergeGeos(geos) {
  let total = 0, itotal = 0;
  for (const g of geos) { total += g.attributes.position.count; itotal += g.index.count; }
  const pos = new Float32Array(total * 3), uv = new Float32Array(total * 2), col = new Float32Array(total * 3);
  const idx = new Uint32Array(itotal);
  let o = 0, io = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3);
    uv.set(g.attributes.uv.array, o * 2);
    col.set(g.attributes.color.array, o * 3);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + o;
    o += g.attributes.position.count; io += gi.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

export function modelMaterial(atlas, opts = {}) {
  return new THREE.MeshBasicMaterial(Object.assign({ map: atlas.texture(), vertexColors: true, alphaTest: 0.5 }, opts));
}

// ------------------------------------------------------------ painting helpers
export function noiseFill(p, base, amt = 0.08) {
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) p.set(x, y, shade(base, 1 - amt + p.rand() * amt * 2));
}
function fabric(p, base, dark) {
  noiseFill(p, base, 0.05);
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if ((x + y * 3) % 7 === 0) p.set(x, y, shade(base, 0.9));
  if (dark) for (let x = 0; x < p.w; x++) p.set(x, p.h - 1, dark);
}

// ------------------------------------------------------------ humanoids
// Chibi rig: big head, segmented limbs (shoulder/elbow, hip/knee), separate hands and feet.
export function buildHumanoid(spec, scale = 1.8 / 29.5) {
  const atlas = new ModelAtlas(256, spec.seed || 7);
  const S = scale;
  const skin = spec.skin, skinD = shade(skin, 0.82);
  const hair = spec.hair, hairD = shade(hair, 0.72), hairL = shade(hair, 1.22);
  const shirt = spec.shirt, shirtD = shade(shirt, 0.78), shirt2 = spec.shirt2 || shade(shirt, 1.18);
  const pants = spec.pants, pantsD = shade(pants, 0.75), boots = spec.boots, bootsL = shade(boots, 1.3);
  const belt = spec.belt || '#5a3a1e';
  const B = (size, from, faces) => boxGeo(atlas, size, from, faces, S);

  // --- head (10 x 9 x 9)
  const face = (p) => {
    noiseFill(p, skin, 0.025);
    // big expressive eyes (3 tall) with highlight
    const eye = (x0, mirror) => {
      if (spec.glowEyes) { p.rect(x0, 4, 2, 2, spec.glowEyes); p.set(x0 + (mirror ? 0 : 1), 4, '#ffffff'); return; }
      p.rect(x0, 3, 2, 3, '#ffffff');
      p.set(x0 + (mirror ? 0 : 1), 4, spec.eyes); p.set(x0 + (mirror ? 0 : 1), 5, spec.eyes);
      p.set(x0 + (mirror ? 1 : 0), 5, shade(spec.eyes, 0.6)); p.set(x0 + (mirror ? 0 : 1), 3, '#1a1a2a');
      p.set(x0 + (mirror ? 1 : 0), 3, '#1a1a2a');
    };
    eye(2, false); eye(6, true);
    const brow = spec.brow || hairD;
    p.set(2, 2, brow); p.set(3, 2, brow); p.set(6, 2, brow); p.set(7, 2, brow);
    p.set(1, 6, mix(skin, '#ff7070', 0.35)); p.set(8, 6, mix(skin, '#ff7070', 0.35));
    p.set(4, 7, shade(skin, 0.55)); p.set(5, 7, shade(skin, 0.6));
    if (spec.beard) { for (let x = 1; x < 9; x++) p.set(x, 8, spec.beard); for (const x of [0, 1, 2, 7, 8, 9]) p.set(x, 7, spec.beard); p.set(3, 6, spec.beard); p.set(4, 6, spec.beard); p.set(5, 6, spec.beard); p.set(6, 6, spec.beard); }
    if (spec.scar) { p.set(7, 1, '#7a3a3a'); p.set(8, 2, '#7a3a3a'); p.set(2, 7, '#5a7a3a'); }
  };
  const headSide = (p, mirror) => {
    const X = (x) => (mirror ? p.w - 1 - x : x);
    noiseFill(p, skin, 0.025);
    p.set(X(4), 4, skinD); p.set(X(4), 5, skinD); p.set(X(5), 5, shade(skin, 0.9));
    if (spec.beard) for (let y = 6; y < 9; y++) for (let x = 0; x < 3; x++) p.set(X(x), y, spec.beard);
  };
  const headParts = [B([10, 9, 9], [-5, 0, -4.5], { front: face, left: (p) => headSide(p, false), right: (p) => headSide(p, true), all: (p) => noiseFill(p, skin, 0.03) })];
  const hairFill = (p) => { noiseFill(p, hair, 0.08); for (let x = 0; x < p.w; x += 2) p.set(x, p.h - 1, hairD); for (let i = 0; i < p.w; i += 3) p.set(i, 0, hairL); };
  if (!spec.bald && !spec.hat) {
    headParts.push(B([11, 3.5, 10], [-5.5, 7.5, -5], { all: hairFill, top: (p) => { noiseFill(p, hair, 0.1); for (let i = 0; i < 8; i++) p.set(p.ri(p.w), p.ri(p.h), hairL); } }));
    headParts.push(B([11, 6.5, 2], [-5.5, 1.5, -5.6], { all: hairFill })); // back
    headParts.push(B([1.6, 5.5, 8], [-5.9, 2.5, -4.5], { all: hairFill })); // sides
    headParts.push(B([1.6, 5.5, 8], [4.3, 2.5, -4.5], { all: hairFill }));
    // fringe tufts over the forehead
    headParts.push(B([4, 2, 1.4], [-4.6, 6.2, 3.8], { all: hairFill }));
    headParts.push(B([3.5, 1.6, 1.4], [0.6, 6.6, 3.8], { all: hairFill }));
    headParts.push(B([2.4, 2.6, 2.4], [1.5, 10.2, -1.5], { all: hairFill })); // cowlick
  }
  if (spec.hat) {
    const hat = spec.hat, hatD = shade(hat, 0.7);
    headParts.push(B([15, 1, 15], [-7.5, 7.6, -7.5], { all: (p) => noiseFill(p, hat, 0.06), bottom: (p) => noiseFill(p, hatD, 0.05) }));
    headParts.push(B([10, 4.5, 10], [-5, 8.6, -5], { all: (p) => { noiseFill(p, hat, 0.06); for (let x = 0; x < p.w; x++) p.set(x, p.h - 1, spec.hatBand || '#5a2a1a'); }, top: (p) => { noiseFill(p, hat, 0.06); for (let x = 2; x < 8; x++) p.set(x, 5, hatD); } }));
    if (spec.beard) headParts.push(B([10.4, 3, 2], [-5.2, -1.2, 3.6], { all: (p) => noiseFill(p, spec.beard, 0.08) }));
  }
  headParts.push(B([1.4, 1.4, 1.2], [-0.7, 2.6, 4.4], { all: (p) => p.fill(skinD) })); // nose

  // --- torso (8 x 9 x 5) with collar, belt and optional vest/backpack/cape
  const torsoFront = (p) => {
    noiseFill(p, shirt, 0.05);
    for (let y = 0; y < p.h; y++) { p.set(0, y, shirtD); p.set(p.w - 1, y, shirtD); }
    p.set(3, 0, skin); p.set(4, 0, skin); p.set(3, 1, skinD); p.set(4, 1, skinD); p.set(2, 0, shirt2); p.set(5, 0, shirt2); p.set(2, 1, shirt2); p.set(5, 1, shirt2);
    if (spec.vest) for (let y = 0; y < p.h - 2; y++) { p.set(1, y, spec.vest); p.set(2, y, spec.vest); p.set(5, y, spec.vest); p.set(6, y, spec.vest); }
    if (spec.torn) { p.set(2, 6, skin); p.set(3, 7, skin); p.set(6, 3, skinD); }
    for (let x = 0; x < p.w; x++) p.set(x, p.h - 2, belt);
    if (spec.buckle) { p.set(3, p.h - 2, spec.buckle); p.set(4, p.h - 2, spec.buckle); }
    p.set(4, 3, shirtD); p.set(4, 5, shirtD);
    if (spec.emblem) { p.set(6, 3, spec.emblem); }
  };
  const torsoAll = (p) => { noiseFill(p, spec.vest || shirt, 0.05); for (let x = 0; x < p.w; x++) p.set(x, p.h - 2, belt); };
  const body = [B([8, 9, 5], [-4, 0, -2.5], { front: torsoFront, all: torsoAll, top: (p) => noiseFill(p, shirt, 0.05), bottom: (p) => noiseFill(p, pants, 0.05) })];
  body.push(B([8.6, 2.2, 5.6], [-4.3, -0.6, -2.8], { all: (p) => { noiseFill(p, pants, 0.05); for (let x = 0; x < p.w; x++) p.set(x, 0, belt); } })); // hips
  if (spec.backpack) {
    body.push(B([6, 6, 2.6], [-3, 1.5, -5], { back: (p) => { noiseFill(p, '#8a5a2e', 0.08); for (let x = 0; x < p.w; x++) p.set(x, 1, '#5a3a1e'); p.set(2, 2, '#d9b04a'); p.set(3, 2, '#d9b04a'); p.rect(1, 3, 4, 2, '#7a4e26'); }, all: (p) => noiseFill(p, '#7a4e26', 0.08) }));
    body.push(B([7, 2, 2.6], [-3.5, 7.4, -5], { all: (p) => { noiseFill(p, '#b8432f', 0.1); p.set(0, 0, '#8a2f20'); } }));
  }
  if (spec.scarf) body.push(B([8.8, 1.8, 5.8], [-4.4, 8.2, -2.9], { all: (p) => { noiseFill(p, spec.scarf, 0.1); for (let x = 0; x < p.w; x += 3) p.set(x, 1, shade(spec.scarf, 0.7)); } }));

  // --- limbs
  const sleeveLen = spec.sleeve || 3;
  const upperArm = (p) => { for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) p.set(x, y, y < sleeveLen ? shade(shirt, 0.94 + p.rand() * 0.1) : shade(skin, 0.97 + p.rand() * 0.05)); if (sleeveLen < p.h) for (let x = 0; x < p.w; x++) p.set(x, sleeveLen - 1, shirtD); };
  const foreArm = (p) => { noiseFill(p, sleeveLen > 4 ? shirt : skin, 0.04); if (spec.torn) p.set(1, 1, '#000'); };
  const handP = (p) => { noiseFill(p, spec.gloves || skin, 0.04); for (let x = 0; x < p.w; x++) p.set(x, p.h - 1, shade(spec.gloves || skin, 0.8)); };
  const thigh = (p) => { noiseFill(p, pants, 0.05); for (let x = 0; x < p.w; x++) p.set(x, p.h - 1, pantsD); };
  const shin = (p) => { for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) p.set(x, y, y > p.h - 3 ? shade(boots, 0.95 + p.rand() * 0.1) : shade(pants, 0.94 + p.rand() * 0.08)); for (let x = 0; x < p.w; x++) p.set(x, p.h - 3, bootsL); };
  const foot = (p) => { noiseFill(p, boots, 0.08); for (let x = 0; x < p.w; x++) p.set(x, p.h - 1, shade(boots, 0.6)); };
  const parts = {
    body: { geo: mergeGeos(body), pivot: [0, 9, 0], parent: 'root' },
    head: { geo: mergeGeos(headParts), pivot: [0, 9, 0.2], parent: 'body' },
  };
  for (const side of ['R', 'L']) {
    const sx = side === 'R' ? -1 : 1;
    const upper = [B([3, 4.4, 3], [-1.5, -4.4, -1.5], { all: upperArm, top: (p) => noiseFill(p, shirt, 0.05) })];
    if (spec.pads) upper.push(B([3.8, 2.2, 3.8], [-1.9, -2.2, -1.9], { all: (p) => { noiseFill(p, spec.pads, 0.08); for (let x = 0; x < p.w; x++) p.set(x, p.h - 1, shade(spec.pads, 0.65)); } }));
    parts['arm' + side] = { geo: mergeGeos(upper), pivot: [sx * 5.4, 8.4, 0], parent: 'body' };
    parts['fore' + side] = { geo: B([2.8, 3.6, 2.8], [-1.4, -3.6, -1.4], { all: foreArm }), pivot: [0, -4.3, 0], parent: 'arm' + side };
    parts['hand' + side] = { geo: B([3.4, 3, 3.4], [-1.7, -3, -1.7], { all: handP }), pivot: [0, -3.4, 0], parent: 'fore' + side };
    parts['leg' + side] = { geo: B([3.6, 4.6, 3.6], [-1.8, -4.6, -1.8], { all: thigh }), pivot: [sx * 2.1, 9, 0], parent: 'root' };
    parts['shin' + side] = { geo: B([3.4, 3, 3.4], [-1.7, -3, -1.7], { all: shin }), pivot: [0, -4.5, 0], parent: 'leg' + side };
    parts['foot' + side] = { geo: B([3.8, 1.8, 5.4], [-1.9, -1.8, -2], { all: foot, top: (p) => { noiseFill(p, bootsL, 0.08); } }), pivot: [0, -2.7, 0], parent: 'shin' + side };
  }
  return { atlas, parts, scale: S };
}

// Instantiate a rig: returns { group, root, parts, material, hand }
export function instHumanoid(proto) {
  const mat = modelMaterial(proto.atlas);
  const group = new THREE.Group();
  const root = new THREE.Group();
  group.add(root);
  const parts = { root };
  const order = ['body', 'head', 'armR', 'armL', 'foreR', 'foreL', 'handR', 'handL', 'legR', 'legL', 'shinR', 'shinL', 'footR', 'footL'];
  for (const k of order) {
    const def = proto.parts[k];
    if (!def) continue;
    const pivot = new THREE.Group();
    pivot.position.set(def.pivot[0] * proto.scale, def.pivot[1] * proto.scale, def.pivot[2] * proto.scale);
    pivot.add(new THREE.Mesh(def.geo, mat));
    (parts[def.parent] || root).add(pivot);
    parts[k] = pivot;
  }
  const hand = new THREE.Group();
  hand.position.set(0, -1.6 * proto.scale, 0.4 * proto.scale);
  parts.handR.add(hand);
  return { group, root, parts, material: mat, hand, scale: proto.scale, t: Math.random() * 10, land: 0 };
}

// Procedural animation shared by player, NPCs and walkers.
// st: { speed (m/s), dt, air, vy, swim, armR: {x,y,z}|null, armL, lookPitch, run }
export function animateHumanoid(rig, st) {
  const P = rig.parts, dt = st.dt;
  rig.t += dt;
  const k = Math.min(1, st.speed / 5.5);
  rig.phase = (rig.phase || 0) + dt * (3.2 + st.speed * 1.35) * (k > 0.05 ? 1 : 0);
  const ph = rig.phase;
  const sp = Math.sin(ph), cp = Math.cos(ph);
  const sc = rig.scale;
  // landing squash
  if (rig.wasAir && !st.air) rig.land = Math.min(1, Math.abs(rig.lastVy || 8) / 14);
  rig.wasAir = st.air; rig.lastVy = st.vy;
  rig.land = Math.max(0, rig.land - dt * 5);
  const breath = Math.sin(rig.t * 2.2);
  let bodyY = 0, lean = 0;
  if (st.swim) {
    const s = Math.sin(rig.t * 5);
    P.legR.rotation.x = s * 0.5; P.legL.rotation.x = -s * 0.5;
    P.shinR.rotation.x = 0.4; P.shinL.rotation.x = 0.4;
    P.armR.rotation.set(-2.6 + s * 0.6, 0, -0.3); P.armL.rotation.set(-2.6 - s * 0.6, 0, 0.3);
    P.foreR.rotation.x = -0.4; P.foreL.rotation.x = -0.4;
    lean = 0.5;
  } else if (st.air) {
    const up = st.vy > 1;
    P.legR.rotation.x = up ? -1.0 : -0.3; P.shinR.rotation.x = up ? 1.5 : 0.5;
    P.legL.rotation.x = up ? 0.2 : 0.35; P.shinL.rotation.x = up ? 0.6 : 0.2;
    P.armR.rotation.set(up ? -0.5 : -2.4, 0, -0.5); P.foreR.rotation.x = -0.6;
    P.armL.rotation.set(up ? 0.6 : -2.4, 0, up ? 0.9 : 0.6); P.foreL.rotation.x = -0.5;
    lean = up ? 0.15 : -0.1;
  } else {
    // walk / run cycle with knee bend and opposite arm swing
    P.legR.rotation.x = sp * 0.85 * k; P.legL.rotation.x = -sp * 0.85 * k;
    P.shinR.rotation.x = Math.max(0, -Math.sin(ph - 0.9)) * 1.3 * k + 0.05;
    P.shinL.rotation.x = Math.max(0, Math.sin(ph - 0.9)) * 1.3 * k + 0.05;
    P.footR.rotation.x = -Math.max(0, sp) * 0.3 * k; P.footL.rotation.x = Math.max(0, sp) * 0.3 * k;
    P.armR.rotation.set(-sp * 0.75 * k, 0, -0.08 - breath * 0.02); P.armL.rotation.set(sp * 0.75 * k, 0, 0.08 + breath * 0.02);
    P.foreR.rotation.x = -0.35 - Math.max(0, -sp) * 0.6 * k; P.foreL.rotation.x = -0.35 - Math.max(0, sp) * 0.6 * k;
    bodyY = Math.abs(cp) * 0.9 * k - rig.land * 2.2 + breath * 0.15 * (1 - k);
    lean = 0.18 * k * (st.run ? 1.6 : 1) + rig.land * 0.25;
  }
  if (st.armR) { P.armR.rotation.set(st.armR.x, st.armR.y || 0, st.armR.z || 0); P.foreR.rotation.x = st.armR.fore !== undefined ? st.armR.fore : -0.15; }
  if (st.armL) { P.armL.rotation.set(st.armL.x, st.armL.y || 0, st.armL.z || 0); P.foreL.rotation.x = st.armL.fore !== undefined ? st.armL.fore : -0.2; }
  P.body.position.y = (9 + bodyY) * sc;
  P.body.rotation.x = lean;
  P.body.rotation.y = st.twist || Math.sin(ph) * 0.12 * k;
  P.head.rotation.x = (st.lookPitch || 0) - lean * 0.8 + Math.sin(rig.t * 1.7) * 0.02;
  P.head.rotation.y = -P.body.rotation.y * 0.6 + (st.headYaw || 0);
  // legs follow body bob
  P.legR.position.y = P.legL.position.y = (9 + Math.min(0, bodyY)) * sc;
  if (rig.land > 0 && !st.air) { P.shinR.rotation.x += rig.land * 0.8; P.shinL.rotation.x += rig.land * 0.8; P.legR.rotation.x -= rig.land * 0.4; P.legL.rotation.x -= rig.land * 0.4; }
}

// ------------------------------------------------------------ sprite extrusion (items)
export function extrudeSprite(painter, size = 1, thickness = 1) {
  const w = painter.w, h = painter.h;
  const px = size / Math.max(w, h);
  const pos = [], col = [], idx = [];
  const filled = (x, y) => x >= 0 && y >= 0 && x < w && y < h && painter.alpha(x, y) > 127;
  const quad = (verts, c, s) => {
    const base = pos.length / 3;
    for (const v of verts) { pos.push(v[0], v[1], v[2]); col.push(c[0] / 255 * s, c[1] / 255 * s, c[2] / 255 * s); }
    idx.push(base, base + 3, base + 2, base, base + 2, base + 1);
  };
  const t = (thickness * px) / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!filled(x, y)) continue;
    const c = painter.get(x, y);
    const X0 = (x - w / 2) * px, X1 = X0 + px, Y1 = (h / 2 - y) * px, Y0 = Y1 - px;
    quad([[X0, Y1, t], [X1, Y1, t], [X1, Y0, t], [X0, Y0, t]], c, 1);
    quad([[X1, Y1, -t], [X0, Y1, -t], [X0, Y0, -t], [X1, Y0, -t]], c, 0.8);
    if (!filled(x, y - 1)) quad([[X0, Y1, -t], [X1, Y1, -t], [X1, Y1, t], [X0, Y1, t]], c, 0.95);
    if (!filled(x, y + 1)) quad([[X0, Y0, t], [X1, Y0, t], [X1, Y0, -t], [X0, Y0, -t]], c, 0.6);
    if (!filled(x - 1, y)) quad([[X0, Y1, -t], [X0, Y1, t], [X0, Y0, t], [X0, Y0, -t]], c, 0.75);
    if (!filled(x + 1, y)) quad([[X1, Y1, t], [X1, Y1, -t], [X1, Y0, -t], [X1, Y0, t]], c, 0.75);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------ block item (mini cube)
export function blockItemGeo(faceUV, id, size = 1) {
  const uvs = faceUV[id];
  const pos = [], uv = [], col = [], idx = [];
  const h = size / 2;
  FACES.forEach((f) => {
    const u = uvs[f.slot];
    const base = pos.length / 3;
    for (const c of f.c) { pos.push((c[0] - 0.5) * size, (c[1] - 0.5) * size, (c[2] - 0.5) * size); col.push(f.shade, f.shade, f.shade); }
    uv.push(u[0], u[3], u[2], u[3], u[2], u[1], u[0], u[1]);
    idx.push(base, base + 3, base + 2, base, base + 2, base + 1);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

export { shade, mix, rgb };
