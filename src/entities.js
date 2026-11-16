// Creatures, NPC, boss, projectiles and item drops.
import * as THREE from 'three';
import { ModelAtlas, boxGeo, mergeGeos, modelMaterial, buildHumanoid, instHumanoid, noiseFill, extrudeSprite, blockItemGeo } from './models.js';
import { Painter, shade, mix } from './pixel.js';
import { moveBody, canStep } from './physics.js';
import { ITEMS, ITEM_BY_ID, itemPainter } from './items.js';
import { BLOCKS } from './blocks.js';
import { sfx } from './audio.js';

const V = THREE.Vector3;
const tmp = new V();

// ------------------------------------------------------------ prototypes (built once)
const protos = {};

export const SKINS = {
  player: { seed: 11, skin: '#e9b78f', hair: '#7a3b1c', eyes: '#3a7bd5', shirt: '#2f5fa8', shirt2: '#e8d9b0', pants: '#5a3e2b', boots: '#3a2618', belt: '#6b4520', buckle: '#f2c94c', backpack: true, pads: '#7a8696', emblem: '#f2c94c' },
  bento: { seed: 21, skin: '#d9a07a', hair: '#e6e0d0', eyes: '#3a5a3a', shirt: '#c9b48a', vest: '#4f6b3a', pants: '#6b5038', boots: '#3a2618', belt: '#3a2618', buckle: '#c9c9c9', hat: '#8a6a3e', hatBand: '#5a2a1a', hairTuft: false, beard: '#e6e0d0', brow: '#bfb8a8', sleeve: 7 },
  walker: { seed: 31, skin: '#7f9a74', hair: '#2a2a22', eyes: '#000', glowEyes: '#ffe14a', shirt: '#5a6a80', pants: '#3a3550', boots: '#2a2620', belt: '#2a2620', torn: true, scar: true, sleeve: 3 },
};

function humanoid(key) {
  if (!protos[key]) protos[key] = buildHumanoid(SKINS[key]);
  return protos[key];
}

function gloopProto(color) {
  const key = 'gloop' + color;
  if (protos[key]) return protos[key];
  const atlas = new ModelAtlas(128, 3);
  const S = 1 / 16;
  const c = color, cd = shade(color, 0.7), cl = shade(color, 1.3);
  const jelly = (p) => {
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) p.set(x, y, mix(cl, cd, y / p.h * 0.9 + (p.rand() - 0.5) * 0.08));
    for (let x = 0; x < p.w; x++) p.set(x, p.h - 1, cd);
    p.set(1, 1, '#ffffff'); p.set(2, 1, '#ffffff'); p.set(1, 2, '#ffffff');
  };
  const face = (p) => {
    jelly(p);
    // eyes
    for (const ex of [3, 9]) {
      p.rect(ex, 4, 2, 3, '#ffffff'); p.set(ex + (ex < 7 ? 1 : 0), 5, '#14141e'); p.set(ex + (ex < 7 ? 1 : 0), 6, '#14141e');
    }
    p.set(6, 8, cd); p.set(7, 8, cd); p.set(7, 9, shade(cd, 0.7)); p.set(8, 8, cd);
  };
  const body = boxGeo(atlas, [14, 12, 14], [-7, 0, -7], { front: face, all: jelly, top: (p) => { jelly(p); p.set(3, 3, '#ffffff'); p.set(4, 3, '#ffffff'); p.set(3, 4, '#ffffff'); } }, S);
  const core = boxGeo(atlas, [6, 5, 6], [-3, 2, -3], { all: (p) => { noiseFill(p, shade(color, 0.45), 0.1); p.set(1, 1, shade(color, 0.8)); } }, S);
  protos[key] = { atlas, body, core };
  return protos[key];
}

function mothProto() {
  if (protos.moth) return protos.moth;
  const atlas = new ModelAtlas(128, 5);
  const S = 1 / 16;
  const fur = (p) => { noiseFill(p, '#6d55b8', 0.12); for (let y = 0; y < p.h; y += 2) for (let x = 0; x < p.w; x++) if ((x + y) % 3 === 0) p.set(x, y, '#a98bea'); };
  const body = mergeGeos([
    boxGeo(atlas, [3, 3, 7], [-1.5, -1.5, -4], { all: fur }, S),
    boxGeo(atlas, [4, 4, 4], [-2, -1.8, 3], { all: fur, front: (p) => { fur(p); p.set(0, 1, '#9ff4ff'); p.set(3, 1, '#9ff4ff'); p.set(0, 2, '#2fc8e0'); p.set(3, 2, '#2fc8e0'); } }, S),
    boxGeo(atlas, [0.6, 4, 0.6], [-1.6, 2, 5.5], { all: (p) => p.fill('#2a1a50') }, S),
    boxGeo(atlas, [0.6, 4, 0.6], [1.0, 2, 5.5], { all: (p) => p.fill('#2a1a50') }, S),
  ]);
  const wingP = (p) => {
    p.fill([0, 0, 0, 0]);
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const nx = x / (p.w - 1), ny = (y - p.h / 2) / (p.h / 2);
      if (nx * nx * 0.9 + ny * ny * (0.6 + nx) < 1) {
        let c = mix('#f07bb0', '#7fe6f5', nx);
        if (Math.abs(ny) > 0.75 - nx * 0.3) c = shade(c, 0.6);
        p.set(x, y, c);
      }
    }
    p.disc(p.w * 0.55, p.h * 0.5, 1.6, '#fff2a6'); p.set(Math.floor(p.w * 0.55), Math.floor(p.h * 0.5), '#2a1a50');
  };
  const wing = boxGeo(atlas, [10, 0.5, 9], [0, 0, -4.5], { top: wingP, bottom: wingP, all: (p) => p.fill('#a98bea') }, S);
  protos.moth = { atlas, body, wing };
  return protos.moth;
}

function bossProto() {
  if (protos.boss) return protos.boss;
  const atlas = new ModelAtlas(512, 9);
  const S = 1 / 8;
  const G = ['#4b4854', '#5c5866', '#6d6878', '#7f7a8a', '#938d9e'];
  const granite = (p, veins = true) => {
    p.cobble(G, '#2c2a33', Math.max(3, Math.floor(p.w * p.h / 40)), 1.15);
    if (veins) {
      for (let k = 0; k < Math.max(1, p.w * p.h / 120); k++) {
        let x = p.ri(p.w), y = p.ri(p.h);
        for (let s = 0; s < 6 + p.ri(6); s++) {
          p.set(x, y, s % 3 === 0 ? '#9ff4ff' : '#2fc8e0');
          x += p.ri(3) - 1; y += 1;
          if (y >= p.h) break;
        }
      }
    }
    for (let i = 0; i < p.w * p.h / 70; i++) p.set(p.ri(p.w), p.ri(p.h), '#4f7a3a'); // moss specks
  };
  const crystal = (p) => {
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) p.set(x, y, mix('#e6fdff', '#2fb8d6', y / p.h + (x === 0 ? -0.2 : 0)));
    for (let y = 0; y < p.h; y++) p.set(p.w - 1, y, '#1a6f8a');
  };
  const pinkCrystal = (p) => {
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) p.set(x, y, mix('#ffe0f0', '#d9629a', y / p.h));
    for (let y = 0; y < p.h; y++) p.set(p.w - 1, y, '#8a2f5a');
  };
  const torsoFront = (p) => {
    granite(p);
    // chest plate frame
    for (let y = 5; y < 15; y++) for (let x = 7; x < 17; x++) {
      const edge = y === 5 || y === 14 || x === 7 || x === 16;
      p.set(x, y, edge ? '#2c2a33' : '#3a3742');
    }
    // abs carving
    for (let x = 4; x < 20; x++) { p.set(x, 17, '#3a3742'); }
    p.set(12, 18, '#3a3742'); p.set(12, 19, '#3a3742');
  };
  const torso = boxGeo(atlas, [24, 20, 14], [-12, 0, -7], { front: torsoFront, all: (p) => granite(p) }, S);
  const headFront = (p) => {
    granite(p, false);
    for (let x = 0; x < p.w; x++) { p.set(x, 2, '#2c2a33'); p.set(x, 3, '#3a3742'); } // brow
    p.rect(2, 4, 3, 2, '#141218'); p.rect(7, 4, 3, 2, '#141218'); // sockets
    for (let x = 3; x < 9; x++) p.set(x, 7, '#141218'); // mouth slot
    for (let x = 3; x < 9; x += 2) p.set(x, 8, '#141218');
    p.set(5, 5, '#5c5866'); p.set(6, 5, '#5c5866'); p.set(5, 6, '#3a3742'); p.set(6, 6, '#3a3742'); // nose ridge
  };
  const head = boxGeo(atlas, [12, 10, 11], [-6, 0, -5.5], { front: headFront, all: (p) => granite(p, false) }, S);
  const jaw = boxGeo(atlas, [10, 3, 4], [-5, -1, 3.5], { all: (p) => granite(p, false) }, S);
  const crown = mergeGeos([
    boxGeo(atlas, [2, 6, 2], [-5, 9, -1], { all: crystal }, S),
    boxGeo(atlas, [2, 9, 2], [-1, 9, -1], { all: crystal }, S),
    boxGeo(atlas, [2, 6, 2], [3, 9, -1], { all: crystal }, S),
    boxGeo(atlas, [1.5, 4, 1.5], [-3.2, 9, 2], { all: pinkCrystal }, S),
    boxGeo(atlas, [1.5, 4, 1.5], [1.7, 9, 2], { all: pinkCrystal }, S),
  ]);
  const pauldron = mergeGeos([
    boxGeo(atlas, [9, 7, 11], [-4.5, 0, -5.5], { all: (p) => granite(p), top: (p) => { granite(p, false); for (let x = 0; x < p.w; x++) p.set(x, 0, '#938d9e'); } }, S),
    boxGeo(atlas, [2, 7, 2], [-2, 7, -2], { all: crystal }, S),
    boxGeo(atlas, [2, 5, 2], [1, 7, 1], { all: pinkCrystal }, S),
    boxGeo(atlas, [1.5, 4, 1.5], [1, 7, -3], { all: crystal }, S),
  ]);
  const lower = mergeGeos([
    boxGeo(atlas, [18, 5, 12], [-9, -6, -6], { all: (p) => granite(p) }, S),
    boxGeo(atlas, [12, 5, 9], [-6, -12.5, -4.5], { all: (p) => granite(p) }, S),
    boxGeo(atlas, [6, 4, 6], [-3, -18, -3], { all: (p) => granite(p) }, S),
    boxGeo(atlas, [2, 4, 2], [-1, -23, -1], { all: crystal }, S),
  ]);
  const fistSide = (p) => { granite(p, false); for (let y = 0; y < p.h; y += 3) p.set(0, y, '#2c2a33'); };
  const fist = mergeGeos([
    boxGeo(atlas, [10, 9, 10], [-5, -4.5, -5], {
      all: fistSide,
      front: (p) => { granite(p, false); for (let x = 0; x < p.w; x++) { p.set(x, 3, '#2c2a33'); } for (let k = 0; k < 4; k++) p.set(1 + k * 2 + 1, 2, '#2c2a33'); },
    }, S),
    boxGeo(atlas, [2, 2, 2], [-4, 4.5, 1], { all: crystal }, S),
    boxGeo(atlas, [2, 3, 2], [-1, 4.5, 1], { all: crystal }, S),
    boxGeo(atlas, [2, 2, 2], [2, 4.5, 1], { all: pinkCrystal }, S),
    boxGeo(atlas, [8, 4, 6], [-4, -3, -10], { all: (p) => granite(p, false) }, S),
  ]);
  const eye = boxGeo(atlas, [2, 1.5, 0.6], [-1, -0.75, 0], { all: (p) => p.fill('#ffffff') }, S);
  const core = boxGeo(atlas, [7, 7, 2], [-3.5, -3.5, 0], { all: (p) => { for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) { const d = Math.hypot(x - 3, y - 3); p.set(x, y, d < 1.5 ? '#ffffff' : d < 3 ? '#9ff4ff' : '#2fc8e0'); } } }, S);
  protos.boss = { atlas, torso, head, jaw, crown, pauldron, lower, fist, eye, core };
  return protos.boss;
}

function nameLabel(text, color = '#e8ffd8') {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 30px "Pixelify Sans", "Courier New", monospace';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = 'rgba(10,14,20,0.9)'; g.strokeText(text, 256, 34);
  g.fillStyle = color; g.fillText(text, 256, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
  s.scale.set(4, 0.5, 1);
  return s;
}

// ------------------------------------------------------------ base
export class Ent {
  constructor(game, x, y, z) {
    this.game = game;
    this.pos = new V(x, y, z);
    this.vel = new V();
    this.w = 0.8; this.h = 0.8;
    this.hp = this.maxHp = 20;
    this.dead = false;
    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    game.scene.add(this.group);
    this.mats = [];
    this.hurtT = 0;
    this.contactCD = 0;
    this.yaw = 0;
    this.hostile = true;
    this.damage = 10;
    this.shadow = game.makeShadow(0.5);
  }
  get center() { return tmp.set(this.pos.x, this.pos.y + this.h / 2, this.pos.z); }
  hurt(dmg, dir, knock = 5) {
    if (this.dead) return;
    const crit = Math.random() < 0.08;
    const d = Math.round(dmg * (crit ? 2 : 1) * (0.85 + Math.random() * 0.3));
    this.hp -= d;
    this.hurtT = 0.22;
    this.game.dmgText.add(this.pos.x, this.pos.y + this.h + 0.4, this.pos.z, String(d), crit ? '#ff5a4a' : '#ffb347', crit);
    if (dir) { this.vel.x += dir.x * knock; this.vel.z += dir.z * knock; this.vel.y = Math.max(this.vel.y, knock * 0.6); }
    sfx('hit');
    if (this.hp <= 0) this.die();
  }
  die() {
    this.dead = true;
    const c = this.center;
    this.game.particles.burst(c.x, c.y, c.z, this.deathColors || [new THREE.Color('#ffffff')], 18, 5, 0.14);
    this.onDeath && this.onDeath();
    this.remove();
  }
  remove() {
    this.dead = true;
    this.game.scene.remove(this.group);
    if (this.shadow) this.game.scene.remove(this.shadow);
  }
  tint(l) {
    for (const m of this.mats) {
      if (m.userData.glow) continue;
      if (this.hurtT > 0) m.color.setRGB(1, 0.35, 0.35);
      else m.color.setScalar(l);
    }
  }
  physics(dt, grav = 26) {
    if (this.inWater) { this.vel.y -= grav * 0.3 * dt; this.vel.y = Math.max(this.vel.y, -3); this.vel.multiplyScalar(1 - Math.min(1, dt * 2)); }
    else this.vel.y = Math.max(-40, this.vel.y - grav * dt);
    moveBody(this.game.world, this, dt);
  }
  touchPlayer(dt) {
    const p = this.game.player;
    this.contactCD -= dt;
    if (!this.hostile || this.contactCD > 0 || p.dead) return;
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
    const dy = (p.pos.y + 0.9) - (this.pos.y + this.h / 2);
    if (Math.abs(dx) < (this.w + 0.6) / 2 + 0.1 && Math.abs(dz) < (this.w + 0.6) / 2 + 0.1 && Math.abs(dy) < (this.h + 1.8) / 2) {
      p.hurt(this.damage, new V(dx, 0, dz).normalize());
      this.contactCD = 0.8;
    }
  }
  common(dt) {
    this.hurtT -= dt;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    if (this.shadow) this.game.placeShadow(this.shadow, this.pos, this.w);
    if (this.pos.y < -10) this.remove();
  }
  faceToward(x, z, dt, rate = 8) {
    const target = Math.atan2(x - this.pos.x, z - this.pos.z);
    let d = target - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * rate);
  }
}

// ------------------------------------------------------------ Gloop (bouncy jelly)
const GLOOP_COLORS = { 0: '#5fd35a', 1: '#62b8f0', 2: '#e8b85a', 3: '#f07bd0', 4: '#4fbde8', 5: '#e8b85a', night: '#9a6af0' };
export class Gloop extends Ent {
  constructor(game, x, y, z, biome, night, big = 1) {
    super(game, x, y, z);
    const color = night && Math.random() < 0.5 ? GLOOP_COLORS.night : GLOOP_COLORS[biome] || GLOOP_COLORS[0];
    const P = gloopProto(color);
    this.size = big;
    this.w = 0.85 * big; this.h = 0.72 * big;
    this.hp = this.maxHp = Math.round((22 + (night ? 10 : 0)) * big * big);
    this.damage = Math.round(8 * big);
    const coreMat = modelMaterial(P.atlas);
    const bodyMat = modelMaterial(P.atlas, { transparent: true, opacity: 0.8, alphaTest: 0 });
    this.mats.push(coreMat, bodyMat);
    this.model = new THREE.Group();
    const core = new THREE.Mesh(P.core, coreMat);
    const body = new THREE.Mesh(P.body, bodyMat);
    body.renderOrder = 1;
    this.model.add(core, body);
    this.model.scale.setScalar(big);
    this.group.add(this.model);
    this.hopT = 0.5 + Math.random() * 1.5;
    this.deathColors = [new THREE.Color(color), new THREE.Color(shadeHex(color, 1.3))];
    this.name = 'Gosma';
  }
  update(dt) {
    const p = this.game.player;
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (this.onGround) {
      this.vel.x *= 1 - Math.min(1, dt * 10); this.vel.z *= 1 - Math.min(1, dt * 10);
      this.hopT -= dt;
      this.faceToward(p.pos.x, p.pos.z, dt, 5);
      if (this.hopT <= 0) {
        const aggro = dist < 22 && !p.dead;
        const dir = aggro ? new V(dx, 0, dz).normalize() : new V(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
        const sp = aggro ? 3.4 : 1.6;
        this.vel.set(dir.x * sp, aggro && Math.random() < 0.4 ? 9.5 : 7, dir.z * sp);
        this.hopT = aggro ? 0.7 + Math.random() * 0.9 : 1.5 + Math.random() * 2;
        if (dist < 14) sfx('gloop');
      }
    }
    this.physics(dt);
    this.touchPlayer(dt);
    // squash & stretch
    const sy = this.onGround ? 1 - Math.max(0, 0.3 - this.hopT) * 0.8 : 1 + Math.min(0.25, Math.abs(this.vel.y) * 0.03);
    this.model.scale.set(this.size / Math.sqrt(sy), this.size * sy, this.size / Math.sqrt(sy));
    this.common(dt);
  }
  onDeath() {
    this.game.spawnDrop(ITEMS.gel.id, 1 + Math.floor(Math.random() * 2 * this.size), this.center.clone());
    if (Math.random() < 0.12) this.game.spawnDrop(ITEMS.coin.id, 1, this.center.clone());
  }
}
function shadeHex(h, k) { const c = shade(h, k); return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`; }

// ------------------------------------------------------------ Walker (night humanoid)
export class Walker extends Ent {
  constructor(game, x, y, z) {
    super(game, x, y, z);
    const rig = instHumanoid(humanoid('walker'));
    this.rig = rig;
    this.group.add(rig.group);
    this.mats.push(rig.material);
    this.w = 0.6; this.h = 1.8;
    this.hp = this.maxHp = 55;
    this.damage = 14;
    this.walkT = Math.random() * 10;
    this.deathColors = [new THREE.Color('#7f9a74'), new THREE.Color('#5a6a80')];
    this.name = 'Andarilho';
    this.groan = 3 + Math.random() * 6;
  }
  update(dt) {
    const p = this.game.player;
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const chase = dist < 30 && !p.dead;
    let mx = 0, mz = 0;
    if (chase) { mx = dx / dist; mz = dz / dist; this.faceToward(p.pos.x, p.pos.z, dt, 6); }
    else { mx = Math.sin(this.yaw) * 0.4; mz = Math.cos(this.yaw) * 0.4; if (Math.random() < dt * 0.3) this.yaw += (Math.random() - 0.5) * 2; }
    const sp = 2.3;
    const ctrl = this.onGround ? 10 : 2;
    this.vel.x += (mx * sp - this.vel.x) * Math.min(1, dt * ctrl);
    this.vel.z += (mz * sp - this.vel.z) * Math.min(1, dt * ctrl);
    if ((this.hitWall || canStep(this.game.world, this, mx, mz)) && this.onGround) this.vel.y = 8.6;
    if (this.inWater && chase) this.vel.y = Math.max(this.vel.y, 2.5);
    this.physics(dt);
    this.touchPlayer(dt);
    this.walkT += dt * Math.hypot(this.vel.x, this.vel.z) * 2.2;
    const s = Math.sin(this.walkT) * 0.6;
    const P = this.rig.parts;
    P.legL.rotation.x = s; P.legR.rotation.x = -s;
    P.armL.rotation.x = -1.45 + s * 0.15; P.armR.rotation.x = -1.35 - s * 0.15;
    P.head.rotation.z = Math.sin(this.walkT * 0.5) * 0.12;
    this.common(dt);
    if (this.game.daylightFactor > 0.7 && dist > 18) this.remove();
  }
  onDeath() {
    if (Math.random() < 0.5) this.game.spawnDrop(ITEMS.coin.id, 1 + Math.floor(Math.random() * 2), this.center.clone());
    if (Math.random() < 0.15) this.game.spawnDrop(ITEMS.potion.id, 1, this.center.clone());
  }
}

// ------------------------------------------------------------ Moth (flying, prism glade)
export class Moth extends Ent {
  constructor(game, x, y, z) {
    super(game, x, y, z);
    const P = mothProto();
    const mat = modelMaterial(P.atlas, { side: THREE.DoubleSide });
    this.mats.push(mat);
    this.body = new THREE.Mesh(P.body, mat);
    this.wl = new THREE.Mesh(P.wing, mat); this.wr = new THREE.Mesh(P.wing, mat);
    this.wl.position.set(0.08, 0.05, 0); this.wr.position.set(-0.08, 0.05, 0); this.wr.scale.x = -1;
    this.model = new THREE.Group();
    this.model.add(this.body, this.wl, this.wr);
    this.model.scale.setScalar(1.4);
    this.group.add(this.model);
    this.w = 0.7; this.h = 0.5;
    this.hp = this.maxHp = 32;
    this.damage = 11;
    this.t = Math.random() * 10;
    this.swoop = 0;
    this.deathColors = [new THREE.Color('#f07bb0'), new THREE.Color('#7fe6f5'), new THREE.Color('#fff2a6')];
    this.name = 'Mariposa Prismática';
  }
  update(dt) {
    const p = this.game.player;
    this.t += dt;
    this.swoop -= dt;
    const target = new V(p.pos.x + Math.sin(this.t * 0.8) * 4, p.pos.y + 3 + Math.sin(this.t * 1.7), p.pos.z + Math.cos(this.t * 0.8) * 4);
    if (this.swoop < 0 && this.swoop > -1.2) target.set(p.pos.x, p.pos.y + 1, p.pos.z);
    if (this.swoop < -1.2) this.swoop = 2.5 + Math.random() * 3;
    const d = target.sub(this.pos);
    const dl = d.length();
    if (dl > 40 || p.dead) d.set(Math.sin(this.t), 0.2, Math.cos(this.t));
    d.normalize().multiplyScalar(this.swoop < 0 ? 8 : 4.5);
    this.vel.lerp(d, Math.min(1, dt * 2.5));
    moveBody(this.game.world, this, dt);
    this.touchPlayer(dt);
    this.yaw = Math.atan2(this.vel.x, this.vel.z);
    const f = Math.sin(this.t * 22) * 0.9;
    this.wl.rotation.z = f; this.wr.rotation.z = -f;
    this.common(dt);
  }
  onDeath() {
    this.game.spawnDrop(ITEMS.crystal.id, 1 + Math.floor(Math.random() * 2), this.center.clone());
  }
}

// ------------------------------------------------------------ NPC Bento
export const BENTO_LINES = [
  'Olá, eu sou o Bento! Corte árvores com o machado e faça uma Bancada com 8 tábuas.',
  'A noite traz os Andarilhos. Construa paredes ou acenda tochas e fique por perto.',
  'Minérios brilham no fundo das cavernas. Derreta-os numa Fornalha para fazer barras.',
  'Ao sul fica a Clareira Prismática. Os cristais de lá alimentam armas mágicas.',
  'Junte pedra, fragmentos prismáticos e barras de cobre para criar o Ídolo de Granito... se tiver coragem.',
  'Gosmas deixam Gel. Gel com tábuas vira tocha; com cogumelos vira poção de cura.',
  'Cristais de Vida aumentam sua resistência. Eu levaria alguns antes de enfrentar o Colosso.',
  'Ilhas flutuam acima dos campos. Empilhe blocos para alcançá-las!',
  'O mar ao redor da ilha não tem fim. Pelo menos foi o que me disseram.',
];
export class NPC extends Ent {
  constructor(game, x, y, z) {
    super(game, x, y, z);
    const rig = instHumanoid(humanoid('bento'));
    this.rig = rig;
    this.group.add(rig.group);
    this.mats.push(rig.material);
    this.w = 0.6; this.h = 1.8;
    this.hp = this.maxHp = 250;
    this.hostile = false;
    this.npc = true;
    this.name = 'Bento, o Explorador';
    this.home = new V(x, y, z);
    this.goal = null;
    this.idle = 2;
    this.walkT = 0;
    this.label = nameLabel(`${this.name}: 250/250`);
    this.label.position.y = 2.35;
    this.group.add(this.label);
    this.lineIdx = 0;
    // walking stick
    const stick = new Painter(16, 16, 3);
    stick.line(3, 15, 12, 1, '#7a4a20'); stick.set(12, 1, '#a06a34'); stick.set(11, 2, '#a06a34'); stick.outline('#2a1a10');
    const sm = new THREE.Mesh(extrudeSprite(stick, 1.0), new THREE.MeshBasicMaterial({ vertexColors: true }));
    this.mats.push(sm.material);
    sm.rotation.set(Math.PI / 2, 0, Math.PI / 4);
    sm.position.set(0, 0, 0.2);
    rig.hand.add(sm);
  }
  update(dt) {
    const p = this.game.player;
    const dPlayer = this.pos.distanceTo(p.pos);
    let mx = 0, mz = 0;
    if (dPlayer < 4.5 && !p.dead) {
      this.faceToward(p.pos.x, p.pos.z, dt, 6);
      this.goal = null;
    } else if (this.goal) {
      const dx = this.goal.x - this.pos.x, dz = this.goal.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.5) { this.goal = null; this.idle = 2 + Math.random() * 4; }
      else { mx = dx / d; mz = dz / d; this.faceToward(this.goal.x, this.goal.z, dt, 5); }
    } else {
      this.idle -= dt;
      if (this.idle < 0) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * 7;
        this.goal = new V(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
      }
    }
    const sp = 1.6;
    this.vel.x += (mx * sp - this.vel.x) * Math.min(1, dt * 8);
    this.vel.z += (mz * sp - this.vel.z) * Math.min(1, dt * 8);
    if ((this.hitWall || canStep(this.game.world, this, mx, mz)) && this.onGround && (mx || mz)) this.vel.y = 8.6;
    this.physics(dt);
    this.walkT += dt * Math.hypot(this.vel.x, this.vel.z) * 2.4;
    const s = Math.sin(this.walkT) * 0.55;
    const P = this.rig.parts;
    P.legL.rotation.x = s; P.legR.rotation.x = -s; P.armL.rotation.x = -s * 0.7; P.armR.rotation.x = -0.4 + s * 0.3;
    P.head.rotation.x = Math.sin(performance.now() / 900) * 0.05;
    if (this.pos.distanceTo(this.home) > 25) this.pos.copy(this.home);
    this.common(dt);
  }
  hurt() { }
}

// ------------------------------------------------------------ Boss: Colosso de Granito
export class Boss extends Ent {
  constructor(game, x, y, z) {
    super(game, x, y, z);
    const P = bossProto();
    this.name = 'Colosso de Granito';
    this.w = 3.2; this.h = 5.2;
    this.hp = this.maxHp = 1800;
    this.damage = 20;
    const mat = modelMaterial(P.atlas);
    this.mat = mat;
    this.mats.push(mat);
    const M = (g) => new THREE.Mesh(g, mat);
    this.model = new THREE.Group();
    this.model.position.y = 3.0;
    this.group.add(this.model);
    const torso = M(P.torso); this.model.add(torso);
    this.headG = new THREE.Group(); this.headG.position.set(0, 2.5, 0.1); this.model.add(this.headG);
    this.headG.add(M(P.head), M(P.jaw), M(P.crown));
    this.eyeMat = new THREE.MeshBasicMaterial({ color: '#7ff4ff', fog: false }); this.eyeMat.userData.glow = true;
    for (const ex of [-0.44, 0.44]) { const e = new THREE.Mesh(P.eye, this.eyeMat); e.position.set(ex, 0.62, 0.66); this.headG.add(e); }
    this.coreMat = new THREE.MeshBasicMaterial({ map: P.atlas.texture(), vertexColors: true, fog: false }); this.coreMat.userData.glow = true;
    const core = new THREE.Mesh(P.core, this.coreMat); core.position.set(0, 1.25, 0.88); this.model.add(core);
    for (const sx of [-1, 1]) { const pa = M(P.pauldron); pa.position.set(sx * 1.6, 1.9, 0); pa.rotation.z = -sx * 0.15; this.model.add(pa); }
    this.lowerG = new THREE.Group(); this.lowerG.add(M(P.lower)); this.model.add(this.lowerG);
    this.fists = [-1, 1].map((sx) => {
      const g = new THREE.Group(); g.add(M(P.fist));
      game.scene.add(g);
      return { g, side: sx, state: 'idle', t: 0, pos: new V(), vel: new V(), target: new V() };
    });
    this.state = 'intro';
    this.timer = 2.8;
    this.atkCD = 2;
    this.t = 0;
    this.enraged = false;
    this.summoned = false;
    this.shake = 0;
    this.deathColors = [new THREE.Color('#6d6878'), new THREE.Color('#2fc8e0'), new THREE.Color('#9ff4ff'), new THREE.Color('#f07bb0')];
    this.boss = true;
    this.vel.set(0, 0, 0);
    if (this.shadow) { this.game.scene.remove(this.shadow); this.shadow = game.makeShadow(1.8); }
    sfx('roar');
  }
  remove() {
    super.remove();
    for (const f of this.fists) this.game.scene.remove(f.g);
  }
  hurt(dmg, dir, knock) {
    if (this.state === 'intro') { this.game.dmgText.add(this.pos.x, this.pos.y + 6, this.pos.z, 'Imune', '#c8d0e8'); return; }
    super.hurt(dmg, null, 0);
    if (!this.enraged && this.hp < this.maxHp / 2) {
      this.enraged = true;
      this.eyeMat.color.set('#ff4a3a');
      this.game.message('O Colosso se enfurece!', '#ff7a5a');
      sfx('roar');
    }
  }
  groundBelow(x, z, fromY) {
    for (let y = Math.floor(fromY); y > 0; y--) if (this.game.world.isSolid(Math.floor(x), y, Math.floor(z))) return y + 1;
    return 0;
  }
  update(dt) {
    const g = this.game, p = g.player;
    this.t += dt;
    this.timer -= dt;
    const toP = new V(p.pos.x - this.pos.x, 0, p.pos.z - this.pos.z);
    const dist = toP.length();
    toP.normalize();
    const ground = this.groundBelow(this.pos.x, this.pos.z, this.pos.y + 4);
    const speed = this.enraged ? 4.6 : 3.2;
    if (p.dead) {
      g.message('O Colosso de Granito voltou a dormir...', '#c8d0e8');
      this.remove();
      return;
    }
    if (this.state === 'intro') {
      const gy = ground + 1.0;
      this.pos.y += (gy - this.pos.y) * Math.min(1, dt * 1.6);
      this.faceToward(p.pos.x, p.pos.z, dt, 2);
      if (this.timer <= 0) { this.state = 'chase'; this.timer = 0; }
    } else if (this.state === 'chase') {
      const hover = Math.max(ground + 1.2, p.pos.y + 0.8) + Math.sin(this.t * 2) * 0.35;
      this.pos.y += (hover - this.pos.y) * Math.min(1, dt * 2.5);
      const want = dist > 7 ? speed : dist < 4 ? -speed * 0.5 : 0;
      this.vel.x += (toP.x * want - this.vel.x) * Math.min(1, dt * 3);
      this.vel.z += (toP.z * want - this.vel.z) * Math.min(1, dt * 3);
      this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
      this.faceToward(p.pos.x, p.pos.z, dt, 4);
      this.atkCD -= dt;
      if (this.atkCD <= 0) {
        const r = Math.random();
        if (dist > 14) { this.punch(); }
        else if (r < 0.4) this.punch();
        else if (r < 0.72) { this.state = 'rise'; this.timer = 1.1; sfx('roar'); }
        else { this.state = 'volley'; this.timer = 1.4; this.shots = this.enraged ? 3 : 2; this.shotT = 0.2; }
        this.atkCD = this.enraged ? 1.6 : 2.6;
      }
      if (this.enraged && !this.summoned) {
        this.summoned = true;
        for (let k = 0; k < 3; k++) g.addMob(new Gloop(g, this.pos.x + (Math.random() - 0.5) * 6, this.pos.y + 2, this.pos.z + (Math.random() - 0.5) * 6, 3, true, 1.4));
      }
    } else if (this.state === 'rise') {
      this.pos.y += dt * 7;
      this.pos.x += toP.x * dt * 6; this.pos.z += toP.z * dt * 6;
      if (this.timer <= 0) { this.state = 'drop'; this.vel.y = -4; }
    } else if (this.state === 'drop') {
      this.vel.y -= dt * 60;
      this.pos.y += this.vel.y * dt;
      if (this.pos.y <= ground) {
        this.pos.y = ground;
        this.state = 'recover'; this.timer = 0.9;
        this.shockwave();
      }
    } else if (this.state === 'recover') {
      if (this.timer <= 0) { this.state = 'chase'; }
    } else if (this.state === 'volley') {
      this.faceToward(p.pos.x, p.pos.z, dt, 6);
      this.shotT -= dt;
      if (this.shotT <= 0 && this.shots > 0) {
        this.shots--; this.shotT = 0.45;
        const n = this.enraged ? 7 : 5;
        const origin = new V(this.pos.x, this.pos.y + 4.3, this.pos.z);
        for (let i = 0; i < n; i++) {
          const target = new V(p.pos.x, p.pos.y + 1, p.pos.z);
          const dir = target.sub(origin).normalize();
          const spread = (i - (n - 1) / 2) * 0.16;
          dir.applyAxisAngle(new V(0, 1, 0), spread);
          g.addProjectile(new Projectile(g, origin.clone(), dir.multiplyScalar(15), 'enemy', 15, 'shard'));
        }
        sfx('magic');
      }
      if (this.timer <= 0) this.state = 'chase';
    }
    // body animation
    this.model.position.y = 3.0 + Math.sin(this.t * 2.2) * 0.1;
    this.lowerG.position.y = Math.sin(this.t * 2.2 + 1) * 0.15;
    this.lowerG.rotation.y = this.t * 0.6;
    this.headG.rotation.x = this.state === 'volley' ? -0.25 : Math.sin(this.t) * 0.05;
    const pulse = 0.7 + Math.sin(this.t * (this.enraged ? 10 : 4)) * 0.3;
    this.coreMat.color.setRGB(pulse, pulse, pulse);
    this.updateFists(dt);
    this.common(dt);
    if (this.shake > 0) this.shake -= dt;
  }
  punch() {
    const f = this.fists.find((x) => x.state === 'idle');
    if (!f) return;
    const p = this.game.player;
    f.state = 'wind'; f.t = 0.45;
    f.target.set(p.pos.x, p.pos.y + 0.9, p.pos.z);
    sfx('swing');
  }
  shockwave() {
    const g = this.game, p = g.player;
    sfx('slam');
    this.shake = 0.6;
    g.camShake = 0.6;
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      g.particles.spawn(this.pos.x + Math.cos(a) * 2, this.pos.y + 0.2, this.pos.z + Math.sin(a) * 2, Math.cos(a) * 12, 2, Math.sin(a) * 12, new THREE.Color(i % 2 ? '#8a8494' : '#5c5866'), 0.35, 0.8, 4);
    }
    const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    if (d < 7.5 && Math.abs(p.pos.y - this.pos.y) < 2.5) p.hurt(this.enraged ? 34 : 26, new V(p.pos.x - this.pos.x, 0, p.pos.z - this.pos.z).normalize(), 14);
  }
  updateFists(dt) {
    const p = this.game.player;
    const yawM = new THREE.Matrix4().makeRotationY(this.yaw);
    for (const f of this.fists) {
      const rest = new V(f.side * 2.9, 2.9 + Math.sin(this.t * 2 + f.side) * 0.3, 0.9).applyMatrix4(yawM).add(this.pos);
      if (f.state === 'idle') {
        f.pos.lerp(rest, Math.min(1, dt * 8));
      } else if (f.state === 'wind') {
        f.t -= dt;
        const back = rest.clone().add(new V(0, 1.2, -1.5).applyMatrix4(yawM));
        f.pos.lerp(back, Math.min(1, dt * 6));
        if (f.t <= 0) { f.state = 'fly'; f.t = 1.1; f.target.set(p.pos.x, p.pos.y + 0.9, p.pos.z); f.vel.copy(f.target).sub(f.pos).normalize().multiplyScalar(this.enraged ? 24 : 19); }
      } else if (f.state === 'fly') {
        f.t -= dt;
        f.pos.addScaledVector(f.vel, dt);
        if (f.pos.distanceTo(new V(p.pos.x, p.pos.y + 0.9, p.pos.z)) < 1.4 && !p.dead) {
          p.hurt(this.enraged ? 28 : 22, f.vel.clone().setY(0).normalize(), 12);
          f.state = 'back';
        }
        if (this.game.world.isSolid(Math.floor(f.pos.x), Math.floor(f.pos.y), Math.floor(f.pos.z))) {
          this.game.particles.burst(f.pos.x, f.pos.y, f.pos.z, [new THREE.Color('#6d6878'), new THREE.Color('#8a8494')], 10, 6);
          sfx('slam');
          f.state = 'back';
        }
        if (f.t <= 0) f.state = 'back';
      } else if (f.state === 'back') {
        f.pos.lerp(rest, Math.min(1, dt * 5));
        if (f.pos.distanceTo(rest) < 0.4) f.state = 'idle';
      }
      f.g.position.copy(f.pos);
      f.g.rotation.y = this.yaw;
      if (f.state === 'fly') f.g.lookAt(f.pos.clone().add(f.vel));
    }
  }
  tint(l) {
    super.tint(Math.max(l, 0.55));
  }
  die() {
    const g = this.game;
    sfx('boss_die');
    g.camShake = 1;
    for (let k = 0; k < 4; k++) g.particles.burst(this.pos.x, this.pos.y + 1 + k, this.pos.z, this.deathColors, 25, 9, 0.3);
    const c = new V(this.pos.x, this.pos.y + 2, this.pos.z);
    g.spawnDrop(ITEMS.core.id, 1, c.clone());
    g.spawnDrop(ITEMS.crystal.id, 12 + Math.floor(Math.random() * 8), c.clone());
    g.spawnDrop(ITEMS.coin.id, 15, c.clone());
    g.spawnDrop(ITEMS.life_crystal.id, 2, c.clone());
    g.spawnDrop(ITEMS.potion.id, 3, c.clone());
    g.message('O Colosso de Granito foi derrotado!', '#9ff4ff');
    g.stats.bossKills = (g.stats.bossKills || 0) + 1;
    super.die();
  }
}

// ------------------------------------------------------------ projectiles
let shardGeo = null;
export class Projectile {
  constructor(game, pos, vel, owner, damage, kind) {
    this.game = game; this.pos = pos; this.vel = vel; this.owner = owner; this.damage = damage; this.kind = kind;
    this.life = 3; this.dead = false;
    if (kind === 'shard') {
      if (!shardGeo) shardGeo = extrudeSprite(itemPainter(ITEMS.crystal.id), 0.9, 2);
      this.mesh = new THREE.Mesh(shardGeo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
    } else {
      this.mesh = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), new THREE.MeshBasicMaterial({ color: '#bff8ff', fog: false }));
    }
    this.mesh.position.copy(pos);
    game.scene.add(this.mesh);
  }
  update(dt) {
    const g = this.game;
    this.life -= dt;
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.x += dt * 10; this.mesh.rotation.y += dt * 7;
    if (this.kind === 'bolt') {
      const c = Math.random() < 0.5 ? new THREE.Color('#7fe6f5') : new THREE.Color('#f07bb0');
      g.particles.spawn(this.pos.x, this.pos.y, this.pos.z, (Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5), c, 0.12, 0.4, 0, true);
    }
    if (g.world.isSolid(Math.floor(this.pos.x), Math.floor(this.pos.y), Math.floor(this.pos.z))) return this.kill(true);
    if (this.owner === 'enemy') {
      const p = g.player;
      if (!p.dead && Math.abs(p.pos.x - this.pos.x) < 0.6 && Math.abs(p.pos.z - this.pos.z) < 0.6 && this.pos.y > p.pos.y - 0.2 && this.pos.y < p.pos.y + 1.9) {
        p.hurt(this.damage, this.vel.clone().setY(0).normalize(), 6);
        return this.kill(true);
      }
    } else {
      for (const m of g.mobs) {
        if (m.dead || m.npc) continue;
        const hw = m.w / 2 + 0.2;
        if (Math.abs(m.pos.x - this.pos.x) < hw && Math.abs(m.pos.z - this.pos.z) < hw && this.pos.y > m.pos.y - 0.2 && this.pos.y < m.pos.y + m.h + 0.2) {
          m.hurt(this.damage, this.vel.clone().setY(0).normalize(), 4);
          return this.kill(true);
        }
      }
    }
    if (this.life <= 0) this.kill(false);
  }
  kill(fx) {
    if (this.dead) return;
    this.dead = true;
    this.game.scene.remove(this.mesh);
    if (fx) this.game.particles.burst(this.pos.x, this.pos.y, this.pos.z, [new THREE.Color('#7fe6f5'), new THREE.Color('#e6fdff')], 8, 4, 0.1);
  }
}

// ------------------------------------------------------------ item drops
const dropGeoCache = new Map();
export class Drop {
  constructor(game, id, count, pos) {
    this.game = game; this.id = id; this.count = count;
    this.pos = pos; this.vel = new V((Math.random() - 0.5) * 3, 4 + Math.random() * 2, (Math.random() - 0.5) * 3);
    this.w = 0.3; this.h = 0.3;
    this.age = 0; this.dead = false;
    const it = ITEM_BY_ID[id];
    let geo = dropGeoCache.get(id), mat;
    if (it.type === 'block' && BLOCKS[it.block].render === 'cube') {
      if (!geo) { geo = blockItemGeo(game.faceUV, it.block, 0.3); dropGeoCache.set(id, geo); }
      mat = new THREE.MeshBasicMaterial({ map: game.atlasTex, vertexColors: true });
    } else {
      if (!geo) { geo = extrudeSprite(itemPainter(id), 0.5, 1.4); dropGeoCache.set(id, geo); }
      mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    }
    this.mat = mat;
    this.mesh = new THREE.Mesh(geo, mat);
    this.spin = Math.random() * 6;
    game.scene.add(this.mesh);
  }
  update(dt) {
    const g = this.game, p = g.player;
    this.age += dt;
    const target = new V(p.pos.x, p.pos.y + 0.8, p.pos.z);
    const d = target.distanceTo(this.pos);
    if (this.age > 0.5 && d < 3.2 && !p.dead && p.inv.canAdd(this.id, this.count)) {
      const dir = target.sub(this.pos).normalize();
      this.vel.lerp(dir.multiplyScalar(10), Math.min(1, dt * 8));
      this.pos.addScaledVector(this.vel, dt);
      if (d < 0.7) {
        const left = p.inv.add(this.id, this.count);
        g.onPickup(this.id, this.count - left);
        this.count = left;
        if (left <= 0) return this.kill();
      }
    } else {
      this.vel.y -= 22 * dt;
      this.vel.x *= 1 - Math.min(1, dt * 3); this.vel.z *= 1 - Math.min(1, dt * 3);
      moveBody(g.world, this, dt);
    }
    this.spin += dt * 2;
    this.mesh.position.set(this.pos.x, this.pos.y + 0.25 + Math.sin(this.age * 3) * 0.06, this.pos.z);
    this.mesh.rotation.y = this.spin;
    const l = g.lightAt(this.pos.x, this.pos.y + 0.3, this.pos.z);
    this.mat.color.setScalar(Math.max(0.35, l));
    if (this.age > 300) this.kill();
  }
  kill() { this.dead = true; this.game.scene.remove(this.mesh); }
}
