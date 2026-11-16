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
// spec: skin, hair, eyes, shirt, shirt2, pants, boots, belt, style flags
export function buildHumanoid(spec, scale = 1.8 / 32) {
  const atlas = new ModelAtlas(256, spec.seed || 7);
  const S = scale;
  const skin = spec.skin, skinD = shade(skin, 0.82);
  const hair = spec.hair, hairD = shade(hair, 0.75), hairL = shade(hair, 1.2);

  const faceFront = (p) => {
    noiseFill(p, skin, 0.03);
    // hair fringe
    if (!spec.bald) for (let x = 0; x < 8; x++) {
      const len = spec.fringe ? spec.fringe[x] : [2, 2, 1, 2, 1, 1, 2, 2][x];
      for (let y = 0; y < len; y++) p.set(x, y, y === len - 1 ? hairD : hair);
    }
    // brows
    const brow = spec.brow || hairD;
    p.set(1, 2, brow); p.set(2, 2, brow); p.set(5, 2, brow); p.set(6, 2, brow);
    // eyes
    if (spec.glowEyes) {
      p.set(1, 3, spec.glowEyes); p.set(2, 3, spec.glowEyes); p.set(5, 3, spec.glowEyes); p.set(6, 3, spec.glowEyes);
      p.set(1, 4, shade(spec.glowEyes, 0.6)); p.set(6, 4, shade(spec.glowEyes, 0.6));
    } else {
      p.set(1, 3, '#ffffff'); p.set(2, 3, spec.eyes); p.set(1, 4, '#e8e8f0'); p.set(2, 4, '#1a1a2a');
      p.set(5, 3, spec.eyes); p.set(6, 3, '#ffffff'); p.set(5, 4, '#1a1a2a'); p.set(6, 4, '#e8e8f0');
    }
    p.set(1, 5, mix(skin, '#ff8080', 0.3)); p.set(6, 5, mix(skin, '#ff8080', 0.3));
    p.set(3, 6, shade(skin, 0.6)); p.set(4, 6, shade(skin, 0.6));
    if (spec.beard) {
      for (let x = 1; x < 7; x++) { p.set(x, 7, spec.beard); }
      p.set(2, 6, spec.beard); p.set(5, 6, spec.beard); p.set(3, 5, spec.beard); p.set(4, 5, spec.beard);
      p.set(0, 6, spec.beard); p.set(7, 6, spec.beard); p.set(0, 7, spec.beard); p.set(7, 7, spec.beard);
      p.set(3, 6, '#5a2a20'); p.set(4, 6, '#5a2a20');
    }
    if (spec.scar) { p.set(5, 1, '#7a3a3a'); p.set(6, 2, '#7a3a3a'); p.set(6, 5, '#5a7a3a'); }
  };
  const headSide = (p, mirror) => {
    const X = (x) => (mirror ? 7 - x : x);
    noiseFill(p, skin, 0.03);
    if (!spec.bald) {
      for (let x = 0; x < 8; x++) {
        const len = x > 4 ? 7 : 2 + (x % 2);
        for (let y = 0; y < len; y++) p.set(X(x), y, (x + y) % 4 === 0 ? hairD : hair);
      }
    }
    p.set(X(3), 4, skinD); p.set(X(3), 5, skinD); p.set(X(4), 4, shade(skin, 0.9)); // ear
    if (spec.beard) for (let y = 5; y < 8; y++) { p.set(X(0), y, spec.beard); p.set(X(1), y, spec.beard); }
  };
  const headBack = (p) => {
    noiseFill(p, spec.bald ? skin : hair, 0.06);
    if (!spec.bald) for (let x = 0; x < 8; x++) { p.set(x, 7, x % 2 ? hairD : hair); if (x % 3 === 0) p.set(x, 3, hairL); }
  };
  const headTop = (p) => { noiseFill(p, spec.bald ? skin : hair, 0.08); if (!spec.bald) for (let i = 0; i < 6; i++) p.set(p.ri(8), p.ri(8), hairL); };
  const headBottom = (p) => noiseFill(p, skinD, 0.03);

  const shirt = spec.shirt, shirtD = shade(shirt, 0.78), shirt2 = spec.shirt2 || shade(shirt, 1.15);
  const bodyFront = (p) => {
    fabric(p, shirt);
    for (let y = 0; y < p.h; y++) { p.set(0, y, shirtD); p.set(p.w - 1, y, shirtD); }
    // collar
    p.set(3, 0, skin); p.set(4, 0, skin); p.set(3, 1, skinD); p.set(4, 1, skinD); p.set(2, 0, shirt2); p.set(5, 0, shirt2);
    if (spec.vest) for (let y = 0; y < p.h - 3; y++) { p.set(1, y, spec.vest); p.set(2, y, spec.vest); p.set(5, y, spec.vest); p.set(6, y, spec.vest); }
    if (spec.torn) { p.set(2, 9, skin); p.set(3, 10, skin); p.set(6, 4, skinD); p.set(5, 10, '#000000'); }
    const by = p.h - 3;
    for (let x = 0; x < p.w; x++) p.set(x, by, spec.belt || '#5a3a1e');
    if (spec.buckle) { p.set(3, by, spec.buckle); p.set(4, by, spec.buckle); }
    for (let x = 0; x < p.w; x++) p.set(x, p.h - 1, shirtD);
    if (spec.emblem) { p.set(5, 4, spec.emblem); p.set(5, 5, shade(spec.emblem, 0.7)); }
  };
  const bodyBack = (p) => {
    fabric(p, shirt);
    if (spec.vest) noiseFill(p, spec.vest, 0.05);
    for (let x = 0; x < p.w; x++) p.set(x, p.h - 3, spec.belt || '#5a3a1e');
    for (let x = 0; x < p.w; x++) p.set(x, p.h - 1, shirtD);
  };
  const bodySide = (p) => { fabric(p, spec.vest || shirt); p.set(1, p.h - 3, spec.belt || '#5a3a1e'); p.set(2, p.h - 3, spec.belt || '#5a3a1e'); p.set(0, p.h - 3, spec.belt || '#5a3a1e'); p.set(3, p.h - 3, spec.belt || '#5a3a1e'); };
  const bodyTop = (p) => { fabric(p, shirt); p.set(3, 1, skin); p.set(4, 1, skin); p.set(3, 2, skin); p.set(4, 2, skin); };

  const sleeve = spec.sleeve || 5;
  const armSide = (p) => {
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const c = y < sleeve ? shade(shirt, 0.95 + p.rand() * 0.08) : shade(skin, 0.97 + p.rand() * 0.05);
      p.set(x, y, c);
    }
    for (let x = 0; x < p.w; x++) p.set(x, sleeve - 1, shirtD);
    if (spec.gloves) for (let y = p.h - 3; y < p.h; y++) for (let x = 0; x < p.w; x++) p.set(x, y, spec.gloves);
    if (spec.torn) p.set(1, sleeve, '#000000');
  };
  const armTop = (p) => noiseFill(p, shirt, 0.05);
  const armBottom = (p) => noiseFill(p, spec.gloves || skinD, 0.03);

  const pants = spec.pants, pantsD = shade(pants, 0.75), boots = spec.boots;
  const legSide = (p) => {
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      let c = y >= p.h - 3 ? shade(boots, 0.95 + p.rand() * 0.1) : shade(pants, 0.94 + p.rand() * 0.1);
      if (y === p.h - 4) c = pantsD;
      p.set(x, y, c);
    }
    if (spec.torn) { p.set(1, 5, skinD); p.set(2, 6, '#000000'); }
  };
  const legTop = (p) => noiseFill(p, pants, 0.05);
  const legBottom = (p) => noiseFill(p, shade(boots, 0.7), 0.05);

  const parts = {};
  // pivot positions in px; model origin at feet centre
  const head = [boxGeo(atlas, [8, 8, 8], [-4, 0, -4], { front: faceFront, left: headSide, right: (p) => headSide(p, true), back: headBack, top: headTop, bottom: headBottom }, S)];
  head.push(boxGeo(atlas, [1, 1, 1], [-0.5, 2.5, 4], { all: (p) => p.fill(skinD) }, S)); // nose
  if (!spec.bald && spec.hairTuft !== false) {
    head.push(boxGeo(atlas, [9, 2, 9], [-4.5, 7, -4.5], { all: (p) => { noiseFill(p, hair, 0.1); for (let i = 0; i < p.w; i += 2) p.set(i, p.h - 1, hairD); } }, S));
    head.push(boxGeo(atlas, [9, 5, 1.5], [-4.5, 2.5, -5], { all: (p) => { noiseFill(p, hair, 0.1); for (let x = 0; x < p.w; x += 2) p.set(x, p.h - 1, hairD); } }, S));
  }
  if (spec.hat) {
    const hat = spec.hat, hatD = shade(hat, 0.7);
    head.push(boxGeo(atlas, [13, 1, 13], [-6.5, 7.5, -6.5], { all: (p) => { noiseFill(p, hat, 0.06); }, bottom: (p) => noiseFill(p, hatD, 0.05) }, S));
    head.push(boxGeo(atlas, [9, 4, 9], [-4.5, 8.5, -4.5], { all: (p) => { noiseFill(p, hat, 0.06); for (let x = 0; x < p.w; x++) p.set(x, p.h - 1, spec.hatBand || '#5a2a1a'); }, top: (p) => { noiseFill(p, hat, 0.06); for (let x = 2; x < 7; x++) p.set(x, 4, hatD); } }, S));
  }
  parts.head = { geo: mergeGeos(head), pivot: [0, 24, 0] };
  const body = [boxGeo(atlas, [8, 12, 4], [-4, 0, -2], { front: bodyFront, back: bodyBack, left: bodySide, right: bodySide, top: bodyTop, bottom: (p) => noiseFill(p, pants, 0.05) }, S)];
  if (spec.backpack) {
    body.push(boxGeo(atlas, [6, 7, 2.5], [-3, 3, -4.5], {
      back: (p) => { noiseFill(p, '#8a5a2e', 0.08); for (let x = 0; x < p.w; x++) p.set(x, 2, '#5a3a1e'); p.set(2, 3, '#d9b04a'); p.set(3, 3, '#d9b04a'); p.rect(1, 4, 4, 2, '#7a4e26'); },
      all: (p) => noiseFill(p, '#7a4e26', 0.08),
    }, S));
    body.push(boxGeo(atlas, [7, 2, 2.5], [-3.5, 10, -4.5], { all: (p) => { noiseFill(p, '#b8432f', 0.1); p.set(0, 0, '#8a2f20'); } }, S)); // bedroll
  }
  if (spec.cape) body.push(boxGeo(atlas, [8, 12, 0.6], [-4, -1, -2.8], { all: (p) => { noiseFill(p, spec.cape, 0.08); for (let y = 0; y < p.h; y++) p.set(0, y, shade(spec.cape, 0.7)); } }, S));
  parts.body = { geo: mergeGeos(body), pivot: [0, 12, 0] };
  const armW = spec.armW || 3;
  const armGeo = (left) => {
    const g = [boxGeo(atlas, [armW, 12, armW], [-armW / 2, -12, -armW / 2], { all: armSide, top: armTop, bottom: armBottom }, S)];
    if (spec.pads) g.push(boxGeo(atlas, [armW + 1, 3, armW + 1], [-armW / 2 - 0.5, -3, -armW / 2 - 0.5], { all: (p) => { noiseFill(p, spec.pads, 0.08); for (let x = 0; x < p.w; x++) p.set(x, p.h - 1, shade(spec.pads, 0.65)); } }, S));
    return mergeGeos(g);
  };
  parts.armR = { geo: armGeo(false), pivot: [-(4 + armW / 2), 23, 0] };
  parts.armL = { geo: armGeo(true), pivot: [4 + armW / 2, 23, 0] };
  const legGeo = () => mergeGeos([
    boxGeo(atlas, [4, 12, 4], [-2, -12, -2], { all: legSide, top: legTop, bottom: legBottom }, S),
    boxGeo(atlas, [4.6, 2, 4.6], [-2.3, -9.5, -2.3], { all: (p) => { noiseFill(p, shade(boots, 1.15), 0.08); for (let x = 0; x < p.w; x++) p.set(x, 0, shade(boots, 1.35)); } }, S),
  ]);
  parts.legR = { geo: legGeo(), pivot: [-2, 12, 0] };
  parts.legL = { geo: legGeo(), pivot: [2, 12, 0] };
  return { atlas, parts, scale: S };
}

// Instantiate a humanoid rig: returns { group, parts, material, hand }
export function instHumanoid(proto) {
  const mat = modelMaterial(proto.atlas);
  const group = new THREE.Group();
  const root = new THREE.Group();
  group.add(root);
  const parts = {};
  for (const [k, def] of Object.entries(proto.parts)) {
    const pivot = new THREE.Group();
    pivot.position.set(def.pivot[0] * proto.scale, def.pivot[1] * proto.scale, def.pivot[2] * proto.scale);
    const mesh = new THREE.Mesh(def.geo, mat);
    pivot.add(mesh);
    root.add(pivot);
    parts[k] = pivot;
  }
  const hand = new THREE.Group();
  hand.position.set(0, -11 * proto.scale, 0.5 * proto.scale);
  parts.armR.add(hand);
  return { group, root, parts, material: mat, hand };
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
