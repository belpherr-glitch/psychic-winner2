// Player: inventory + equipment, movement abilities, buffs, cameras and held-item animations.
import * as THREE from 'three';
import { moveBody, raycast, solidAt } from './physics.js';
import { shade } from './pixel.js';
import { buildHumanoid, instHumanoid, animateHumanoid, extrudeSprite, blockItemGeo, ModelAtlas, boxGeo, noiseFill } from './models.js';
import { SKINS } from './entities.js';
import { ITEM_BY_ID, itemPainter, BUFFS } from './items.js';
import { BLOCKS, OPAQUE, SOLID } from './blocks.js';
import { sfx } from './audio.js';

const V = THREE.Vector3;
export const EQUIP_START = 36; // 36 head, 37 body, 38 legs, 39-42 accessories
export const EQUIP_KINDS = ['head', 'body', 'legs', 'acc', 'acc', 'acc', 'acc'];
const lerp = (a, b, t) => a + (b - a) * t;

export class Inventory {
  constructor(n = 43) { this.slots = new Array(n).fill(null); this.sel = 0; this.listeners = []; }
  changed() { for (const f of this.listeners) f(); }
  max(id) { return ITEM_BY_ID[id] ? ITEM_BY_ID[id].stack : 99; }
  canAdd(id) {
    for (let i = 0; i < EQUIP_START; i++) { const s = this.slots[i]; if (!s) return true; if (s.id === id && s.count < this.max(id)) return true; }
    return false;
  }
  add(id, n) {
    const mx = this.max(id);
    for (let i = 0; i < EQUIP_START && n > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id && s.count < mx) { const k = Math.min(n, mx - s.count); s.count += k; n -= k; }
    }
    for (let i = 0; i < EQUIP_START && n > 0; i++) {
      if (!this.slots[i]) { const k = Math.min(n, mx); this.slots[i] = { id, count: k }; n -= k; }
    }
    this.changed();
    return n;
  }
  count(id) { let c = 0; for (let i = 0; i < EQUIP_START; i++) { const s = this.slots[i]; if (s && s.id === id) c += s.count; } return c; }
  remove(id, n) {
    for (let i = EQUIP_START - 1; i >= 0 && n > 0; i--) {
      const s = this.slots[i];
      if (s && s.id === id) { const k = Math.min(n, s.count); s.count -= k; n -= k; if (!s.count) this.slots[i] = null; }
    }
    this.changed();
  }
  takeSelected(n = 1) {
    const s = this.slots[this.sel];
    if (!s) return;
    s.count -= n;
    if (s.count <= 0) this.slots[this.sel] = null;
    this.changed();
  }
  fits(idx, id) {
    if (idx < EQUIP_START || id === undefined) return true;
    const it = ITEM_BY_ID[id];
    const kind = EQUIP_KINDS[idx - EQUIP_START];
    if (kind === 'acc') return !!it.acc;
    return it.armor === kind;
  }
  equipped() { return this.slots.slice(EQUIP_START).filter(Boolean).map((s) => ITEM_BY_ID[s.id]); }
  get selected() { return this.slots[this.sel]; }
  serialize() { return this.slots.map((s) => (s ? [s.id, s.count] : 0)); }
  load(arr) {
    this.slots = arr.map((s) => (s && ITEM_BY_ID[s[0]] ? { id: s[0], count: s[1] } : null));
    while (this.slots.length < 43) this.slots.push(null);
    this.changed();
  }
}

// Wings model shown on the back when equipped: two feathered panels hinged at the spine
function buildWings(color) {
  const atlas = new ModelAtlas(64, 3);
  const feather = (p) => {
    p.fill([0, 0, 0, 0]);
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const nx = x / p.w, ny = y / p.h;
      if (ny > nx * 0.55 && ny < 1 - (1 - nx) * 0.15 && (x * 3 + y) % 7 !== 0) p.set(x, y, (x + Math.floor(y / 2)) % 4 === 0 ? '#ffffff' : nx > 0.6 ? shade(color, 0.8) : color);
    }
  };
  const geo = boxGeo(atlas, [16, 14, 0.6], [0, -11, 0], { front: feather, back: feather, all: (p) => p.fill(color) }, 1 / 16);
  const mat = new THREE.MeshBasicMaterial({ map: atlas.texture(), vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide });
  mat.userData.glow = true;
  const g = new THREE.Group();
  const pl = new THREE.Group(), pr = new THREE.Group();
  pl.add(new THREE.Mesh(geo, mat)); pr.add(new THREE.Mesh(geo, mat));
  pr.scale.x = -1;
  pl.position.set(0.05, 0.5, -0.2); pr.position.set(-0.05, 0.5, -0.2);
  g.add(pl, pr);
  g.userData = { pl, pr, mat };
  return g;
}

export class Player {
  constructor(game) {
    this.game = game;
    this.pos = new V();
    this.vel = new V();
    this.w = 0.6; this.h = 1.8; this.eyeH = 1.62;
    this.yaw = Math.PI / 2; this.pitch = -0.1;
    this.maxHp = 100; this.hp = 100;
    this.maxMana = 60; this.mana = 60;
    this.inv = new Inventory();
    this.camMode = 1;
    this.swing = 0; this.swingDur = 0.3; this.anim = 'swing';
    this.invuln = 0;
    this.dead = false;
    this.walkT = 0; this.regenT = 0; this.bob = 0;
    this.heldId = -1;
    this.fallStart = null;
    this.step = true;
    this.visY = null;
    this.buffs = []; // {key, time}
    this.jumpsLeft = 0; this.flight = 0; this.jumpHeld = false;
    this.hook = null; // {pos, state:'fly'|'hold', dir, t}
    this.stats = {};
    this.wingsKey = null;

    const proto = buildHumanoid(SKINS.player);
    this.rig = instHumanoid(proto);
    game.scene.add(this.rig.group);
    this.shadow = game.makeShadow(0.45);
    this.armorMat = null;

    // first-person view model: pivot at the shoulder, arm and item inside
    this.view = new THREE.Group();
    this.viewMat = new THREE.MeshBasicMaterial({ map: proto.atlas.texture(), vertexColors: true, alphaTest: 0.5 });
    this.viewPivot = new THREE.Group();
    this.view.add(this.viewPivot);
    this.viewArm = new THREE.Group();
    const sc = proto.scale;
    const upper = new THREE.Mesh(proto.parts.armR.geo, this.viewMat);
    const fore = new THREE.Group(); fore.position.y = -4.3 * sc; fore.add(new THREE.Mesh(proto.parts.foreR.geo, this.viewMat));
    const handG = new THREE.Group(); handG.position.y = -3.4 * sc; handG.add(new THREE.Mesh(proto.parts.handR.geo, this.viewMat));
    upper.add(fore); fore.add(handG);
    this.viewFore = fore;
    const armG = new THREE.Group(); armG.add(upper); armG.scale.setScalar(1.25);
    this.viewArm.add(armG);
    this.viewArm.rotation.set(1.62, 0.22, 0);
    this.viewPivot.add(this.viewArm);
    this.viewHand = new THREE.Group();
    this.viewHand.position.set(0, -1.6 * sc, 0.4 * sc);
    handG.add(this.viewHand);
    game.viewScene.add(this.view);

    // grappling rope
    this.rope = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new V(), new V()]), new THREE.LineBasicMaterial({ color: 0x5a3a1e }));
    this.rope.visible = false; this.rope.frustumCulled = false;
    game.scene.add(this.rope);
    this.hookMesh = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), new THREE.MeshBasicMaterial({ color: 0x9aa0aa }));
    this.hookMesh.visible = false;
    game.scene.add(this.hookMesh);
  }

  eye() { return new V(this.pos.x, (this.visY === null ? this.pos.y : this.visY) + this.eyeH, this.pos.z); }
  lookDir() {
    return new V(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  // ------------------------------------------------------------ equipment & buffs
  recalcStats() {
    const st = { defense: 0, speed: 1, jumps: 0, flight: 0, noFall: false, regen: 0, mine: 1, glow: 0, lavaImmune: false, damage: 1, wings: null, manaMax: 0, crit: 0 };
    const eq = this.inv.equipped();
    for (const it of eq) {
      if (it.defense) st.defense += it.defense;
      const a = it.acc;
      if (a) {
        if (a.speed) st.speed += a.speed;
        if (a.jumps) st.jumps += a.jumps;
        if (a.flight) { st.flight = Math.max(st.flight, a.flight); st.wings = it.wingColor || '#9ff4ff'; }
        if (a.noFall) st.noFall = true;
        if (a.regen) st.regen += a.regen;
        if (a.mine) st.mine += a.mine;
        if (a.lava) st.lavaImmune = true;
        if (a.damage) st.damage += a.damage;
        if (a.mana) st.manaMax += a.mana;
        if (a.crit) st.crit += a.crit;
      }
    }
    // set bonus: full armor of one material
    const mats = ['head', 'body', 'legs'].map((k, i) => { const s = this.inv.slots[EQUIP_START + i]; return s ? ITEM_BY_ID[s.id].set : null; });
    if (mats[0] && mats[0] === mats[1] && mats[1] === mats[2]) { st.defense += 3; st.setBonus = mats[0]; }
    for (const b of this.buffs) {
      const B = BUFFS[b.key];
      if (B.defense) st.defense += B.defense;
      if (B.speed) st.speed += B.speed;
      if (B.regen) st.regen += B.regen;
      if (B.mine) st.mine += B.mine;
      if (B.glow) st.glow = Math.max(st.glow, B.glow);
      if (B.damage) st.damage += B.damage;
      if (B.lava) st.lavaImmune = true;
    }
    this.stats = st;
    this.maxManaTotal = this.maxMana + st.manaMax;
    if (st.wings !== this.wingsKey) {
      this.wingsKey = st.wings;
      if (this.wings) this.rig.parts.body.remove(this.wings);
      this.wings = st.wings ? buildWings(st.wings) : null;
      if (this.wings) this.rig.parts.body.add(this.wings);
    }
  }
  addBuff(key, time) {
    const b = this.buffs.find((x) => x.key === key);
    if (b) b.time = Math.max(b.time, time); else this.buffs.push({ key, time });
    this.recalcStats();
  }

  // ------------------------------------------------------------ held item
  setHeld(id) {
    if (id === this.heldId) return;
    this.heldId = id;
    for (const hand of [this.rig.hand, this.viewHand]) {
      while (hand.children.length) hand.remove(hand.children[0]);
      if (id < 0 || !ITEM_BY_ID[id]) continue;
      const it = ITEM_BY_ID[id];
      const fp = hand === this.viewHand;
      let mesh;
      if (it.type === 'block' && BLOCKS[it.block].render === 'cube') {
        mesh = new THREE.Mesh(blockItemGeo(this.game.faceUV, it.block, fp ? 0.3 : 0.34), new THREE.MeshBasicMaterial({ map: this.game.atlasTex, vertexColors: true }));
        mesh.position.set(0, -0.06, fp ? 0.0 : 0.12);
        mesh.rotation.set(0.3, 0.6, 0);
      } else {
        const tool = it.type === 'weapon' || it.type === 'tool';
        const big = it.key === 'colossus_sword' ? 1.25 : 1;
        const size = (tool ? 0.95 : 0.6) * big;
        const geo = extrudeSprite(itemPainter(id), size, tool ? 2.6 : 2.2);
        // move the grip (lower-left of the sprite) to the origin for tools/weapons
        if (tool || it.type === 'wand' || it.type === 'hook') geo.translate(size * 0.38, size * 0.33, 0);
        const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
        if (it.glow) mat.userData.glow = true;
        mesh = new THREE.Mesh(geo, mat);
        const inner = new THREE.Group();
        inner.add(mesh);
        if (tool || it.type === 'wand' || it.type === 'hook') mesh.rotation.z = Math.PI / 4; // blade along +Y
        const holder = new THREE.Group();
        holder.add(inner);
        if (fp) {
          holder.rotation.set(-2.25, 0.25, 0.15);
          holder.scale.setScalar(tool ? 0.45 : 0.5);
        } else {
          inner.rotation.y = Math.PI / 2;
          holder.rotation.set(tool ? 1.95 : 1.5, 0, 0);
          if (!tool) holder.position.set(0, -0.05, 0.08);
        }
        mesh = holder;
      }
      hand.add(mesh);
    }
    this.view.traverse((o) => { o.renderOrder = 50; });
  }
  animKind() {
    const s = this.inv.selected;
    const it = s ? ITEM_BY_ID[s.id] : null;
    if (!it) return 'punch';
    if (it.type === 'weapon') return 'swing';
    if (it.type === 'tool') return 'chop';
    if (it.type === 'wand' || it.type === 'hook' || it.type === 'beam') return 'cast';
    if (it.type === 'consumable') return 'drink';
    return 'punch';
  }
  startAnim(dur, kind) { this.swing = this.swingDur = dur; this.anim = kind || this.animKind(); }

  hurt(dmg, dir, knock = 8) {
    if (this.dead || this.invuln > 0) return;
    const def = this.stats.defense || 0;
    const real = Math.max(1, Math.round(dmg - def * 0.5));
    this.hp -= real;
    this.invuln = 0.6;
    if (dir) { this.vel.x += dir.x * knock; this.vel.z += dir.z * knock; this.vel.y = Math.max(this.vel.y, 5); }
    this.game.onPlayerHurt(real);
    sfx('hurt');
    if (this.hp <= 0) { this.hp = 0; this.dead = true; this.respawnT = 5; this.hook = null; this.game.onPlayerDeath(); }
  }

  // ------------------------------------------------------------ grappling hook
  fireHook() {
    const { o, d } = this.aimRay(this.game.camera);
    this.hook = { pos: this.eye(), dir: d.clone(), state: 'fly', t: 0 };
    void o;
    sfx('swing');
  }
  updateHook(dt) {
    const h = this.hook;
    if (!h) { this.rope.visible = this.hookMesh.visible = false; return; }
    const w = this.game.world;
    if (h.state === 'fly') {
      h.t += dt;
      const step = 34 * dt;
      for (let k = 0; k < 4; k++) {
        h.pos.addScaledVector(h.dir, step / 4);
        if (SOLID[w.get(Math.floor(h.pos.x), Math.floor(h.pos.y), Math.floor(h.pos.z))]) { h.state = 'hold'; sfx('place'); break; }
      }
      if (h.state === 'fly' && h.t > 0.55) { this.hook = null; return; }
    } else {
      const target = h.pos.clone().sub(new V(0, 1.3, 0));
      const to = target.sub(this.pos);
      const d = to.length();
      if (d > 0.8) this.vel.copy(to.normalize().multiplyScalar(Math.min(17, d * 6)));
      else this.vel.set(0, 0, 0);
      this.fallStart = null;
      this.jumpsLeft = this.stats.jumps;
      this.flight = this.stats.flight;
    }
    const a = this.eye().add(new V(0, -0.4, 0));
    this.rope.geometry.setFromPoints([a, h.pos]);
    this.rope.visible = this.hookMesh.visible = true;
    this.hookMesh.position.copy(h.pos);
  }

  // ------------------------------------------------------------ update
  update(dt, inp) {
    const g = this.game;
    this.invuln -= dt;
    if (this.dead) {
      this.rig.group.visible = false;
      this.view.visible = false;
      this.respawnT -= dt;
      this.updateHook(dt);
      return;
    }
    // buffs tick
    let buffChanged = false;
    for (const b of this.buffs) b.time -= dt;
    if (this.buffs.some((b) => b.time <= 0)) { this.buffs = this.buffs.filter((b) => b.time > 0); buffChanged = true; }
    if (buffChanged || !this.stats.speed) this.recalcStats();
    const st = this.stats;

    this.yaw -= inp.lookX;
    this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch - inp.lookY));

    const fwd = new V(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new V(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = new V().addScaledVector(fwd, inp.moveY).addScaledVector(right, inp.moveX);
    const mag = Math.min(1, wish.length());
    if (mag > 0) wish.normalize();
    const speed = (inp.sprint ? 7.0 : 5.2) * mag * st.speed;
    const ctrl = this.onGround ? 14 : this.inWater ? 4 : 5;
    this.vel.x += (wish.x * speed - this.vel.x) * Math.min(1, dt * ctrl);
    this.vel.z += (wish.z * speed - this.vel.z) * Math.min(1, dt * ctrl);

    const jumpPressed = inp.jump && !this.jumpHeld;
    this.jumpHeld = inp.jump;
    if (this.onGround) { this.jumpsLeft = st.jumps; this.flight = st.flight; this.flying = false; }
    if (this.hook && jumpPressed) { this.hook = null; this.vel.y = 9; sfx('jump'); }
    else if (this.hook && this.hook.state === 'hold') { /* pulled by hook */ }
    else if (this.inWater) {
      this.vel.y -= 9 * dt;
      this.vel.y *= 1 - Math.min(1, dt * 2.5);
      if (inp.jump) this.vel.y = Math.min(this.vel.y + 30 * dt, 4.6);
      this.fallStart = null;
    } else {
      // variable-height jump: holding jump early in the jump keeps rising
      const grav = inp.jump && this.vel.y > 0 && this.jumpT > 0 ? 14 : 30;
      this.jumpT = Math.max(0, (this.jumpT || 0) - dt);
      this.vel.y = Math.max(-45, this.vel.y - grav * dt);
      if (jumpPressed && this.onGround) { this.vel.y = 9.2; this.jumpT = 0.28; sfx('jump'); }
      else if (jumpPressed && this.jumpsLeft > 0) {
        this.jumpsLeft--; this.vel.y = 9.6; this.jumpT = 0.2; sfx('jump');
        for (let k = 0; k < 14; k++) g.particles.spawn(this.pos.x, this.pos.y, this.pos.z, (Math.random() - 0.5) * 5, -Math.random() * 2, (Math.random() - 0.5) * 5, new THREE.Color(1, 1, 1), 0.22, 0.6, -1, true);
      } else if (inp.jump && !this.onGround && st.flight > 0 && this.jumpsLeft === 0 && this.vel.y < 6) {
        if (this.flight > 0) { this.flight -= dt; this.vel.y = Math.min(this.vel.y + 55 * dt, 7.5); this.flying = true; }
        else if (this.vel.y < -3) { this.vel.y = -3; this.flying = true; } // glide
        this.fallStart = null;
      }
    }
    const wasGround = this.onGround;
    moveBody(g.world, this, dt);
    if (!this.onGround && !this.inWater && !this.hook) { if (this.fallStart === null || this.pos.y > this.fallStart) this.fallStart = this.pos.y; }
    if (this.onGround && !wasGround && this.fallStart !== null) {
      const fall = this.fallStart - this.pos.y;
      if (fall > 11 && !st.noFall) this.hurt(Math.round((fall - 11) * 6), null);
      this.fallStart = null;
    }
    if (this.onGround) this.fallStart = null;
    this.updateHook(dt);

    const off = this.onGround ? g.world.groundOffset(this.pos.x, this.pos.z, this.pos.y) : 0;
    const target = this.pos.y + off;
    if (this.visY === null || Math.abs(this.visY - target) > 2.5) this.visY = target;
    else this.visY += (target - this.visY) * Math.min(1, dt * (this.onGround ? 12 : 30));
    if (this.inLava && !st.lavaImmune) this.hurt(20, null, 0);

    this.regenT += dt;
    if (this.regenT > 1) {
      this.regenT = 0;
      let r = st.regen;
      if (g.timeSinceHurt > 6) r += 1 + Math.floor(g.timeSinceHurt / 10);
      if (this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + r);
      this.mana = Math.min(this.maxManaTotal || this.maxMana, this.mana + 4);
    }
    this.animate(dt);
  }

  animate(dt) {
    const g = this.game;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.walkT += dt * hs * 2.1;
    this.bob += dt * hs * 1.5;
    this.swing = Math.max(0, this.swing - dt);
    const u = this.swing > 0 ? 1 - this.swing / this.swingDur : 1;
    const on = this.swing > 0;
    const e = 1 - Math.pow(1 - u, 3); // ease-out
    const arc = Math.sin(u * Math.PI);
    const walk = Math.min(1, hs / 4);
    const air = !this.onGround && !this.inWater;
    const holding = this.heldId >= 0;
    let arm = holding ? { x: -0.55 + Math.sin(this.walkT) * 0.25 * walk, z: -0.05, fore: -0.5 } : null, twist = 0;
    if (on) {
      switch (this.anim) {
        case 'swing': arm = { x: lerp(-3.1, 0.4, e), z: -0.3, fore: lerp(-0.6, 0, e) }; twist = lerp(0.45, -0.5, e); break;
        case 'chop': arm = { x: lerp(-2.7, -0.15, e), z: -0.1, fore: lerp(-0.9, -0.1, e) }; twist = lerp(0.2, -0.2, e); break;
        case 'cast': arm = { x: -1.55 - this.pitch * 0.8 + arc * 0.2, z: 0, fore: 0 }; break;
        case 'drink': arm = { x: -0.4 - 2.0 * arc, z: 0.5 * arc, fore: -1.6 * arc }; break;
        default: arm = { x: -0.3 - 1.3 * arc, z: 0, fore: -0.8 + 0.8 * arc }; break;
      }
    } else if (holding && this.animKind() === 'cast' && g.input && g.input.attack) arm = { x: -1.55 - this.pitch * 0.8, fore: 0 };
    animateHumanoid(this.rig, { dt, speed: hs, air, vy: this.vel.y, swim: this.inWater && !this.onGround, armR: arm, armL: this.flying ? { x: -0.4, z: 0.5 } : null, lookPitch: -this.pitch * 0.6, twist, run: hs > 6 });
    if (this.flying) this.rig.parts.armR.rotation.z = -0.5;
    // wings flap
    if (this.wings) {
      const f = this.flying ? Math.sin(performance.now() / 70) * 0.7 : air ? 0.3 : 0.15 + Math.sin(performance.now() / 600) * 0.05;
      this.wings.userData.pl.rotation.set(0.15, 0.5 + f, 0.25);
      this.wings.userData.pr.rotation.set(0.15, -0.5 - f, -0.25);
      this.wings.position.y = 0.0;
    }
    this.rig.group.position.set(this.pos.x, this.visY, this.pos.z);
    this.rig.group.rotation.y = this.yaw + Math.PI;
    g.placeShadow(this.shadow, this.pos, 0.6);

    // first-person: shoulder pivot motion
    const asp = Math.min(1, g.camera.aspect / 1.6);
    const bx = Math.sin(this.bob) * 0.03 * walk, by = Math.abs(Math.cos(this.bob)) * 0.035 * walk;
    const vp = this.viewPivot;
    vp.position.set(0.58 * (0.45 + 0.55 * asp) + bx, -0.45 - by, 0.06);
    vp.rotation.set(0, 0, 0);
    if (on) {
      switch (this.anim) {
        case 'swing': vp.rotation.set(lerp(1.1, -1.0, e), lerp(-0.25, 0.85, e), lerp(-0.2, 0.5, e)); vp.position.x -= 0.12 * arc; break;
        case 'chop': vp.rotation.set(lerp(0.85, -0.55, e), lerp(-0.05, 0.3, e), 0); break;
        case 'cast': vp.position.z += 0.1 * arc; vp.rotation.x = 0.12 + 0.1 * arc; break;
        case 'drink': vp.position.x -= 0.32 * arc; vp.position.y += 0.22 * arc; vp.rotation.set(0.9 * arc, 0.6 * arc, 0); break;
        default: vp.position.z -= 0.18 * arc; vp.rotation.x = -0.25 * arc; break;
      }
    } else {
      vp.rotation.x = Math.sin(performance.now() / 900) * 0.015; // idle breathing
      if (holding && this.animKind() === 'cast' && g.input && g.input.attack) vp.rotation.x = 0.14;
    }
  }

  updateCamera(cam) {
    const g = this.game;
    const eye = this.eye();
    const dir = this.lookDir();
    const shake = g.camShake > 0 ? g.camShake * 0.15 : 0;
    this.rig.group.visible = this.camMode !== 0 && !this.dead;
    this.view.visible = this.camMode === 0 && !this.dead;
    if (this.dead) {
      cam.position.set(eye.x, eye.y + 1.5, eye.z);
      cam.lookAt(eye.x + dir.x, eye.y, eye.z + dir.z);
      return;
    }
    if (this.camMode === 0) {
      cam.position.copy(eye);
      cam.lookAt(eye.clone().add(dir));
    } else {
      const back = this.camMode === 1 ? -1 : 1;
      const right = new V(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const pivot = eye.clone().add(new V(0, 0.2, 0));
      if (this.camMode === 1) pivot.addScaledVector(right, 0.6);
      let dist = this.camMode === 1 ? 4.4 : 3.4;
      const cd = dir.clone().multiplyScalar(back);
      const hit = raycast(g.world, pivot.x, pivot.y, pivot.z, cd.x, cd.y, cd.z, dist + 0.3, (id) => OPAQUE[id] === 1);
      if (hit) dist = Math.max(0.6, hit.dist - 0.3);
      cam.position.copy(pivot).addScaledVector(cd, dist);
      if (this.camMode === 1) cam.lookAt(pivot.clone().addScaledVector(dir, 10));
      else cam.lookAt(pivot);
    }
    if (shake) cam.position.add(new V((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake));
    this.view.position.copy(cam.position);
    this.view.quaternion.copy(cam.quaternion);
  }

  aimRay(cam) {
    if (this.camMode === 1) {
      const o = cam.position.clone();
      const d = new V(); cam.getWorldDirection(d);
      const eye = this.eye();
      const t = Math.max(0, eye.clone().sub(o).dot(d));
      o.addScaledVector(d, t);
      return { o, d };
    }
    return { o: this.eye(), d: this.lookDir() };
  }

  serialize() {
    return { x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: this.yaw, pitch: this.pitch, hp: this.hp, maxHp: this.maxHp, mana: this.mana, maxMana: this.maxMana, inv: this.inv.serialize(), sel: this.inv.sel, buffs: this.buffs, cam: this.camMode };
  }
}

export { solidAt, noiseFill };
