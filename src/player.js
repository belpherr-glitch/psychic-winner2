// Player: inventory, movement, cameras (1st person, 3rd person, front view) and held-item visuals.
import * as THREE from 'three';
import { moveBody, canStep, raycast, solidAt } from './physics.js';
import { buildHumanoid, instHumanoid, extrudeSprite, blockItemGeo } from './models.js';
import { SKINS } from './entities.js';
import { ITEM_BY_ID, itemPainter } from './items.js';
import { BLOCKS, OPAQUE } from './blocks.js';
import { sfx } from './audio.js';

const V = THREE.Vector3;

export class Inventory {
  constructor(n = 36) { this.slots = new Array(n).fill(null); this.sel = 0; this.listeners = []; }
  changed() { for (const f of this.listeners) f(); }
  max(id) { return ITEM_BY_ID[id] ? ITEM_BY_ID[id].stack : 99; }
  canAdd(id, n) {
    for (const s of this.slots) { if (!s) return true; if (s.id === id && s.count < this.max(id)) return true; }
    return false;
  }
  add(id, n) {
    const mx = this.max(id);
    for (const s of this.slots) {
      if (n <= 0) break;
      if (s && s.id === id && s.count < mx) { const k = Math.min(n, mx - s.count); s.count += k; n -= k; }
    }
    for (let i = 0; i < this.slots.length && n > 0; i++) {
      if (!this.slots[i]) { const k = Math.min(n, mx); this.slots[i] = { id, count: k }; n -= k; }
    }
    this.changed();
    return n;
  }
  count(id) { let c = 0; for (const s of this.slots) if (s && s.id === id) c += s.count; return c; }
  remove(id, n) {
    for (let i = this.slots.length - 1; i >= 0 && n > 0; i--) {
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
  get selected() { return this.slots[this.sel]; }
  serialize() { return this.slots.map((s) => (s ? [s.id, s.count] : 0)); }
  load(arr) { this.slots = arr.map((s) => (s && ITEM_BY_ID[s[0]] ? { id: s[0], count: s[1] } : null)); while (this.slots.length < 36) this.slots.push(null); this.changed(); }
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
    this.camMode = 0;
    this.swing = 0; this.swingDur = 0.3;
    this.invuln = 0;
    this.dead = false;
    this.walkT = 0;
    this.regenT = 0;
    this.bob = 0;
    this.heldId = -1;
    this.fallStart = null;

    // third-person rig
    const proto = buildHumanoid(SKINS.player);
    this.rig = instHumanoid(proto);
    game.scene.add(this.rig.group);
    this.shadow = game.makeShadow(0.45);

    // first-person view model (arm + item) attached to camera
    this.view = new THREE.Group();
    this.viewMat = new THREE.MeshBasicMaterial({ map: proto.atlas.texture(), vertexColors: true, alphaTest: 0.5, depthTest: true });
    const arm = new THREE.Mesh(proto.parts.armR.geo, this.viewMat);
    this.viewArm = new THREE.Group();
    this.viewArm.add(arm);
    arm.scale.setScalar(1.15);
    this.view.add(this.viewArm);
    this.viewHand = new THREE.Group();
    this.viewHand.position.set(0, -12 * proto.scale * 1.15, 0.03);
    this.viewArm.add(this.viewHand);
    game.viewScene.add(this.view);
    this.vm = { px: 0.6, py: -0.44, pz: 0.08, rx: 1.6, ry: 0.25, rz: 0.0 };
    this.vmItem = { x: -2.0, y: 0, z: 0.3 };
    this.renderOrderFix(this.view);
  }
  renderOrderFix(obj) { obj.traverse((o) => { o.renderOrder = 50; }); }

  eye() { return new V(this.pos.x, this.pos.y + this.eyeH, this.pos.z); }
  lookDir() {
    return new V(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  setHeld(id) {
    if (id === this.heldId) return;
    this.heldId = id;
    for (const hand of [this.rig.hand, this.viewHand]) {
      while (hand.children.length) hand.remove(hand.children[0]);
      if (id < 0 || !ITEM_BY_ID[id]) continue;
      const it = ITEM_BY_ID[id];
      let mesh;
      if (it.type === 'block' && BLOCKS[it.block].render === 'cube') {
        mesh = new THREE.Mesh(blockItemGeo(this.game.faceUV, it.block, 0.32), new THREE.MeshBasicMaterial({ map: this.game.atlasTex, vertexColors: true }));
        mesh.position.set(0, -0.05, 0.12);
      } else {
        const geo = extrudeSprite(itemPainter(id), 0.8, 1.2);
        geo.translate(0.32, 0.27, 0); // move handle to origin
        mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
        const inner = new THREE.Group();
        inner.add(mesh);
        mesh.rotation.z = Math.PI / 4;
        const holder = new THREE.Group();
        holder.add(inner);
        if (hand === this.viewHand) { holder.rotation.set(this.vmItem.x, this.vmItem.y, this.vmItem.z); holder.scale.setScalar(0.62); }
        else { inner.rotation.y = Math.PI / 2; holder.rotation.set(Math.PI / 2 - 0.25, 0, 0); }
        mesh.userData.item = true;
        if (it.glow) mesh.material.userData.glow = true;
        mesh = holder;
      }
      hand.add(mesh);
    }
    this.renderOrderFix(this.view);
  }

  hurt(dmg, dir, knock = 8) {
    if (this.dead || this.invuln > 0) return;
    this.hp -= dmg;
    this.invuln = 0.6;
    if (dir) { this.vel.x += dir.x * knock; this.vel.z += dir.z * knock; this.vel.y = Math.max(this.vel.y, 5); }
    this.game.onPlayerHurt(dmg);
    sfx('hurt');
    if (this.hp <= 0) { this.hp = 0; this.dead = true; this.respawnT = 5; this.game.onPlayerDeath(); }
  }

  update(dt, inp) {
    const g = this.game;
    this.invuln -= dt;
    if (this.dead) {
      this.rig.group.visible = false;
      this.view.visible = false;
      this.respawnT -= dt;
      return;
    }
    // look
    this.yaw -= inp.lookX;
    this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch - inp.lookY));

    // move
    const fwd = new V(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new V(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = new V().addScaledVector(fwd, inp.moveY).addScaledVector(right, inp.moveX);
    const mag = Math.min(1, wish.length());
    if (mag > 0) wish.normalize();
    const speed = (inp.sprint ? 6.4 : 4.6) * mag;
    const ctrl = this.onGround ? 14 : this.inWater ? 4 : 3.5;
    this.vel.x += (wish.x * speed - this.vel.x) * Math.min(1, dt * ctrl);
    this.vel.z += (wish.z * speed - this.vel.z) * Math.min(1, dt * ctrl);

    if (this.inWater) {
      this.vel.y -= 9 * dt;
      this.vel.y *= 1 - Math.min(1, dt * 2.5);
      if (inp.jump) this.vel.y = Math.min(this.vel.y + 30 * dt, 4.2);
      this.fallStart = null;
    } else {
      this.vel.y = Math.max(-45, this.vel.y - 27 * dt);
      if (inp.jump && this.onGround) { this.vel.y = 8.7; sfx('jump'); }
      else if (g.settings.autoJump && this.onGround && mag > 0.3 && canStep(g.world, this, wish.x, wish.z)) this.vel.y = 8.7;
    }
    const wasGround = this.onGround;
    moveBody(g.world, this, dt);
    // fall damage
    if (!this.onGround && !this.inWater) { if (this.fallStart === null || this.pos.y > this.fallStart) this.fallStart = this.pos.y; }
    if (this.onGround && !wasGround && this.fallStart !== null) {
      const fall = this.fallStart - this.pos.y;
      if (fall > 9) this.hurt(Math.round((fall - 9) * 7), null);
      this.fallStart = null;
    }
    if (this.onGround) this.fallStart = null;

    // regen
    this.regenT += dt;
    if (this.regenT > 1) {
      this.regenT = 0;
      if (this.hp < this.maxHp && g.timeSinceHurt > 6) this.hp = Math.min(this.maxHp, this.hp + 1 + Math.floor(g.timeSinceHurt / 10));
      this.mana = Math.min(this.maxMana, this.mana + 3);
    }

    // animation
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.walkT += dt * hs * 2.3;
    this.bob += dt * hs * 1.6;
    this.swing = Math.max(0, this.swing - dt);
    const sw = this.swing > 0 ? Math.sin((1 - this.swing / this.swingDur) * Math.PI) : 0;
    const P = this.rig.parts;
    const s = Math.sin(this.walkT) * Math.min(1, hs / 3) * 0.7;
    P.legL.rotation.x = s; P.legR.rotation.x = -s;
    P.armL.rotation.x = -s * 0.8;
    P.armR.rotation.x = s * 0.8 - sw * 1.9 - (this.heldId >= 0 ? 0.25 : 0);
    P.armR.rotation.z = sw * 0.3;
    P.head.rotation.x = -this.pitch * 0.7;
    if (!this.onGround && !this.inWater) { P.legL.rotation.x = 0.4; P.legR.rotation.x = -0.2; }
    this.rig.group.position.copy(this.pos);
    this.rig.group.rotation.y = this.yaw + Math.PI;
    g.placeShadow(this.shadow, this.pos, 0.6);

    // first-person arm
    const bobX = Math.sin(this.bob) * 0.025 * Math.min(1, hs / 3), bobY = Math.abs(Math.cos(this.bob)) * 0.03 * Math.min(1, hs / 3);
    const vm = this.vm;
    const asp = Math.min(1, g.camera.aspect / 1.6);
    this.viewArm.position.set(vm.px * (0.4 + 0.6 * asp) + bobX - sw * 0.15, vm.py - bobY + sw * 0.1, vm.pz - sw * 0.15);
    this.viewArm.rotation.set(vm.rx + sw * 0.7, vm.ry + sw * 0.5, vm.rz - sw * 0.3);
  }

  updateCamera(cam, dt) {
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
      cam.position.y += Math.abs(Math.cos(this.bob)) * 0.04 * Math.min(1, Math.hypot(this.vel.x, this.vel.z) / 3);
      cam.lookAt(eye.clone().add(dir));
    } else {
      const back = this.camMode === 1 ? -1 : 1;
      const right = new V(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const pivot = eye.clone().add(new V(0, 0.15, 0));
      if (this.camMode === 1) pivot.addScaledVector(right, 0.55);
      let dist = this.camMode === 1 ? 4.2 : 3.4;
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

  // Ray used for targeting: origin and direction depend on camera mode.
  aimRay(cam) {
    if (this.camMode === 1) {
      const o = cam.position.clone();
      const d = new V(); cam.getWorldDirection(d);
      // skip to the point nearest the player's eye
      const eye = this.eye();
      const t = Math.max(0, eye.clone().sub(o).dot(d));
      o.addScaledVector(d, t);
      return { o, d };
    }
    return { o: this.eye(), d: this.lookDir() };
  }

  serialize() {
    return { x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: this.yaw, pitch: this.pitch, hp: this.hp, maxHp: this.maxHp, mana: this.mana, inv: this.inv.serialize(), sel: this.inv.sel };
  }
}

export { solidAt };
