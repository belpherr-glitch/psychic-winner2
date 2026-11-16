// Voxília — game bootstrap and main loop.
import * as THREE from 'three';
import { World, W, D, H, SEA, BIOME_NAMES, BIOME } from './world.js';
import { B, BLOCKS, buildAtlas, makeWaterTexture, makeLavaTexture, makeCrackTextures, SOLID, RENDER, OPAQUE } from './blocks.js';
import { ChunkManager, createWorldMaterials } from './mesher.js';
import { Sky } from './sky.js';
import { Particles, DamageText } from './particles.js';
import { Player } from './player.js';
import { Gloop, Walker, Moth, NPC, Boss, Projectile, Drop, BENTO_LINES } from './entities.js';
import { ITEMS, ITEM_BY_ID, RECIPES, itemName, itemPainter } from './items.js';
import { raycast } from './physics.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { OutlinePass } from './post.js';
import { initAudio, sfx, audioState, updateMusic } from './audio.js';

THREE.ColorManagement.enabled = false;
const V = THREE.Vector3;
const SAVE_KEY = 'voxilia-save-v1';
const SET_KEY = 'voxilia-settings-v1';
const DAY_LEN = 720; // seconds per full day

function store(key, val) { try { if (val === undefined) return JSON.parse(localStorage.getItem(key) || 'null'); localStorage.setItem(key, JSON.stringify(val)); } catch (e) { return null; } return null; }
function clearStore(key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } }
const LCURVE = []; for (let i = 0; i < 16; i++) LCURVE[i] = i === 0 ? 0 : Math.pow(0.8, 15 - i);

const mobile = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const QUALITY = {
  baixa: { ratio: 0.7, view: 44 },
  media: { ratio: 1.0, view: 60 },
  alta: { ratio: Math.min(window.devicePixelRatio || 1, 1.75), view: 84 },
};

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.settings = Object.assign({ touchSens: 1, mouseSens: 1, autoJump: true, music: true, sfx: true, quality: mobile ? 'media' : 'alta', invertY: false }, store(SET_KEY) || {});
    audioState.music = this.settings.music; audioState.sfx = this.settings.sfx;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.autoClear = false;
    this.post = new OutlinePass(this.renderer);
    this.scene = new THREE.Scene();
    this.viewScene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 900);
    this.scene.add(this.camera);
    this.scene.fog = new THREE.Fog(0xb9dcf6, 30, 80);
    this.applyQuality();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.state = 'loading';
    this.time = 0.04;
    this.mobs = []; this.projectiles = []; this.drops = [];
    this.boss = null;
    this.camShake = 0;
    this.timeSinceHurt = 99;
    this.spawnT = 0;
    this.saveT = 0;
    this.useT = 0; this.attackT = 0; this.mineT = 0;
    this.mining = null;
    this.stats = {};
    this.daylightFactor = 1;
    this.paused = false;
    this.panel = null;
  }

  applyQuality() {
    const q = QUALITY[this.settings.quality] || QUALITY.media;
    this.renderer.setPixelRatio(q.ratio);
    this.viewDist = q.view;
    this.resize();
  }
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 80 : 72;
    this.camera.updateProjectionMatrix();
  }
  saveSettings() { store(SET_KEY, this.settings); }

  async load() {
    const bar = document.getElementById('loadfill'), lbl = document.getElementById('loadlabel');
    const progress = (p, label) => { bar.style.width = `${Math.round(p * 100)}%`; if (label) lbl.textContent = label + '…'; };
    const save = store(SAVE_KEY);
    this.save = save;
    const seed = save ? save.seed : (Math.random() * 1e9) | 0;
    this.world = new World(seed);
    await this.world.generate(progress);
    if (save && save.edits) {
      const list = [];
      for (let i = 0; i < save.edits.length; i += 2) list.push([save.edits[i], save.edits[i + 1]]);
      this.world.applyEdits(list);
      progress(0.82, 'Restaurando suas construções');
      await new Promise((r) => setTimeout(r, 0));
      this.world.relight(0, 0, W - 1, D - 1);
    }
    const atlas = buildAtlas();
    this.atlasTex = atlas.tex; this.faceUV = atlas.faceUV;
    this.mats = createWorldMaterials(atlas.tex, makeWaterTexture(), atlas, makeLavaTexture());
    this.chunks = new ChunkManager(this.world, this.scene, this.mats, this.faceUV, atlas.faceTile);
    progress(0.84, 'Montando os blocos');
    await this.chunks.buildAll((p) => progress(0.84 + p * 0.14, 'Montando os blocos'));
    this.sky = new Sky(this.scene);
    this.particles = new Particles(this.scene);
    this.dmgText = new DamageText(this.scene);
    this.shadowTex = this.makeShadowTex();
    this.player = new Player(this);
    this.ui = new UI(this);
    this.input = new Input(this.canvas, this.settings);
    this.buildHelpers();
    const sp = this.world.spawn;
    this.player.pos.set(sp.x, sp.y, sp.z);
    if (save && save.player) {
      const p = save.player;
      this.player.pos.set(p.x, p.y, p.z); this.player.yaw = p.yaw; this.player.pitch = p.pitch;
      this.player.hp = p.hp; this.player.maxHp = p.maxHp; this.player.mana = p.mana;
      this.player.inv.load(p.inv); this.player.inv.sel = p.sel || 0;
      this.time = save.time || 0.05;
      this.stats = save.stats || {};
    } else {
      const I = ITEMS;
      for (const [it, n] of [[I.copper_sword, 1], [I.copper_pick, 1], [I.copper_axe, 1], [I.torch, 12], [I.potion, 3], [I.planks, 20], [I.workbench, 1]]) this.player.inv.add(it.id, n);
    }
    this.player.inv.changed();
    if (this.world.hut) {
      const hut = this.world.hut;
      this.npc = new NPC(this, hut.x + 0.5, hut.y + 0.1, hut.z + 0.5);
      this.mobs.push(this.npc);
    }
    progress(1, 'Pronto');
    this.state = 'title';
    this.titleT = 0;
    document.getElementById('loading').hidden = true;
    document.getElementById('titlebtns').hidden = false;
    document.getElementById('btn-play').textContent = save ? 'Continuar' : 'Jogar';
    document.getElementById('btn-new').hidden = !save;
    this.bindMenus();
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  buildHelpers() {
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004));
    this.highlight = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x101018, transparent: true, opacity: 0.55, fog: false }));
    this.highlight.visible = false;
    this.scene.add(this.highlight);
    this.cracks = makeCrackTextures();
    this.crackMesh = new THREE.Mesh(new THREE.BoxGeometry(1.006, 1.006, 1.006), new THREE.MeshBasicMaterial({ map: this.cracks[0], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, fog: false }));
    this.crackMesh.visible = false;
    this.scene.add(this.crackMesh);
  }
  makeShadowTex() {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d');
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const d = Math.hypot(x - 15.5, y - 15.5) / 16;
      if (d < 1) { g.fillStyle = `rgba(0,0,0,${(d < 0.7 ? 0.45 : 0.25).toFixed(2)})`; g.fillRect(x, y, 1, 1); }
    }
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    return t;
  }
  makeShadow(r) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false, fog: false }));
    m.rotation.x = -Math.PI / 2;
    m.scale.set(r * 2.2, r * 2.2, 1);
    m.renderOrder = 1;
    this.scene.add(m);
    return m;
  }
  placeShadow(m, pos, w) {
    const x = Math.floor(pos.x), z = Math.floor(pos.z);
    let y = Math.floor(pos.y + 0.1);
    let k = 0;
    while (k < 8 && y > 0 && !SOLID[this.world.get(x, y - 1, z)]) { y--; k++; }
    m.visible = k < 8;
    m.position.set(pos.x, y + 0.02, pos.z);
    const s = Math.max(0.2, 1 - (pos.y - y) / 6) * w * 1.6;
    m.scale.set(s, s, 1);
  }

  bindMenus() {
    const $ = (s) => document.getElementById(s);
    $('btn-play').onclick = () => this.startPlay();
    $('btn-new').onclick = () => { $('confirm-new').hidden = false; };
    $('btn-new-yes').onclick = () => { clearStore(SAVE_KEY); location.reload(); };
    $('btn-new-no').onclick = () => { $('confirm-new').hidden = true; };
    $('btn-resume').onclick = () => this.setPause(false);
    $('btn-save').onclick = () => { this.saveGame(); this.ui.message('Jogo salvo neste navegador.', '#bff8ff'); this.setPause(false); };
    $('btn-quit').onclick = () => { this.saveGame(); location.reload(); };
    $('btn-newworld').onclick = () => { $('confirm-new2').hidden = false; };
    $('btn-new2-yes').onclick = () => { clearStore(SAVE_KEY); location.reload(); };
    $('btn-new2-no').onclick = () => { $('confirm-new2').hidden = true; };
    $('dlg-tip').onclick = () => this.npcTalk(true);
    $('dlg-craft').onclick = () => { this.closeDialog(); this.togglePanel(true); };
    $('dlg-close').onclick = () => this.closeDialog();
    const sens = $('set-sens'), q = $('set-quality'), aj = $('set-autojump'), mu = $('set-music'), sf = $('set-sfx'), inv = $('set-invert');
    sens.value = this.settings.touchSens; q.value = this.settings.quality; aj.checked = this.settings.autoJump; mu.checked = this.settings.music; sf.checked = this.settings.sfx; inv.checked = this.settings.invertY;
    sens.oninput = () => { this.settings.touchSens = +sens.value; this.settings.mouseSens = +sens.value; this.saveSettings(); };
    q.onchange = () => { this.settings.quality = q.value; this.applyQuality(); this.saveSettings(); };
    aj.onchange = () => { this.settings.autoJump = aj.checked; this.saveSettings(); };
    mu.onchange = () => { this.settings.music = audioState.music = mu.checked; this.saveSettings(); };
    sf.onchange = () => { this.settings.sfx = audioState.sfx = sf.checked; this.saveSettings(); };
    inv.onchange = () => { this.settings.invertY = inv.checked; this.saveSettings(); };
  }

  startPlay() {
    initAudio();
    sfx('click');
    this.state = 'play';
    document.getElementById('title').hidden = true;
    document.getElementById('hud').hidden = false;
    document.body.classList.toggle('touch', this.input.touchMode);
    this.ui.refreshInv();
    if (!this.save) this.ui.message('Bem-vindo a Voxília! Fale com o Bento na cabana.', '#fff2a6');
    try { navigator.wakeLock && navigator.wakeLock.request('screen').catch(() => {}); } catch (e) { /* ignore */ }
  }

  setPause(on) {
    this.paused = on;
    document.getElementById('pause').hidden = !on;
    this.input.enabled = !on && !this.panel;
    if (on) this.input.release();
  }
  togglePanel(on) {
    const p = document.getElementById('invpanel');
    if (on === undefined) on = p.hidden;
    p.hidden = !on;
    this.panel = on ? 'inv' : null;
    this.input.enabled = !on && !this.paused;
    if (on) { this.input.release(); this.ui.invSel = -1; }
    this.ui.refreshInv();
  }
  npcTalk(next) {
    const d = document.getElementById('dialog');
    d.hidden = false;
    this.panel = 'dialog';
    this.input.enabled = false;
    this.input.release();
    if (next) this.npc.lineIdx = (this.npc.lineIdx + 1) % BENTO_LINES.length;
    let line = BENTO_LINES[this.npc.lineIdx];
    if (this.daylightFactor < 0.4 && !next) line = 'Está escuro lá fora. Fique perto das tochas, os Andarilhos não gostam de luz.';
    document.getElementById('dlg-text').textContent = line;
    sfx('click');
  }
  closeDialog() {
    document.getElementById('dialog').hidden = true;
    this.panel = null;
    this.input.enabled = !this.paused;
  }

  selectSlot(i) {
    const inv = this.player.inv;
    inv.sel = (i + 9) % 9;
    inv.changed();
    const s = inv.selected;
    this.ui.showItemName(s ? itemName(s.id) : '');
    sfx('click');
  }

  nearStations() {
    const p = this.player.pos;
    const out = { workbench: false, furnace: false };
    const x0 = Math.floor(p.x), y0 = Math.floor(p.y), z0 = Math.floor(p.z);
    for (let y = y0 - 2; y <= y0 + 3; y++) for (let z = z0 - 4; z <= z0 + 4; z++) for (let x = x0 - 4; x <= x0 + 4; x++) {
      const id = this.world.get(x, y, z);
      if (id === B.WORKBENCH) out.workbench = true;
      if (id === B.FURNACE) out.furnace = true;
    }
    return out;
  }
  craft(i) {
    const r = RECIPES[i], inv = this.player.inv;
    const st = this.nearStations();
    if (r.station && !st[r.station]) return;
    if (!r.in.every(([it, n]) => inv.count(it.id) >= n)) return;
    for (const [it, n] of r.in) inv.remove(it.id, n);
    const left = inv.add(r.out[0].id, r.out[1]);
    if (left > 0) this.dropFromPlayer(r.out[0].id, left);
    sfx('craft');
    this.ui.pickup(r.out[0].id, r.out[1]);
    this.stats.crafted = (this.stats.crafted || 0) + 1;
  }

  // ------------------------------------------------------------ helpers used by entities
  lightAt(x, y, z) {
    const l = this.world.getLight(Math.floor(x), Math.floor(y), Math.floor(z));
    return Math.max(0.1, LCURVE[l & 15] * this.daylightFactor, LCURVE[l >> 4]);
  }
  message(t, c) { this.ui.message(t, c); }
  addMob(m) { this.mobs.push(m); }
  addProjectile(p) { this.projectiles.push(p); }
  spawnDrop(id, n, pos) { if (n > 0 && ITEM_BY_ID[id]) this.drops.push(new Drop(this, id, n, pos)); }
  dropFromPlayer(id, n) {
    const d = this.player.lookDir();
    const pos = this.player.eye().addScaledVector(d, 0.6);
    const drop = new Drop(this, id, n, pos);
    drop.vel.set(d.x * 6, 3, d.z * 6);
    drop.age = -1.5;
    this.drops.push(drop);
  }
  onPickup(id, n) { if (n > 0) { this.ui.pickup(id, n); sfx('pickup'); } }
  onPlayerHurt(dmg) {
    this.timeSinceHurt = 0;
    const f = document.getElementById('hurtflash');
    f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
    if (this.player.camMode !== 0) this.dmgText.add(this.player.pos.x, this.player.pos.y + 2.2, this.player.pos.z, String(dmg), '#ff5a5a');
  }
  onPlayerDeath() {
    sfx('death');
    document.getElementById('death').hidden = false;
    this.input.release();
    this.mining = null;
  }

  // ------------------------------------------------------------ actions
  computeTarget() {
    const p = this.player;
    const { o, d } = p.aimRay(this.camera);
    const reach = 5.2;
    const hit = raycast(this.world, o.x, o.y, o.z, d.x, d.y, d.z, reach, (id) => RENDER[id] !== 0 && id !== B.WATER);
    let ent = null, entDist = Infinity;
    for (const m of this.mobs) {
      if (m.dead) continue;
      const t = rayAABB(o, d, m.pos.x - m.w / 2, m.pos.y, m.pos.z - m.w / 2, m.pos.x + m.w / 2, m.pos.y + m.h, m.pos.z + m.w / 2);
      if (t !== null && t < entDist && t < (m.boss ? 9 : 5)) { entDist = t; ent = m; }
    }
    if (ent && hit && hit.dist < entDist) ent = null;
    this.target = { block: ent ? null : hit, ent, o, d };
  }

  meleeTargets(reach) {
    const p = this.player, eye = p.eye(), dir = p.lookDir();
    const flat = new V(dir.x, 0, dir.z).normalize();
    const out = [];
    for (const m of this.mobs) {
      if (m.dead || m.npc) continue;
      const c = new V(m.pos.x, m.pos.y + m.h / 2, m.pos.z);
      const to = c.clone().sub(eye);
      const r = reach + m.w / 2;
      const dist = to.length();
      if (dist > r + (m.boss ? 2 : 0)) continue;
      const hd = new V(to.x, 0, to.z);
      const hl = hd.length();
      if (hl > 0.4 && hd.normalize().dot(flat) < 0.55) continue;
      if (Math.abs(to.y) > 2.2 + m.h / 2) continue;
      out.push({ m, dist });
    }
    if (this.target && this.target.ent && !this.target.ent.npc && !out.find((o) => o.m === this.target.ent)) out.push({ m: this.target.ent, dist: 0 });
    return out.sort((a, b) => a.dist - b.dist).slice(0, 3).map((o) => o.m);
  }

  attackHeld(dt) {
    const p = this.player;
    const sel = p.inv.selected;
    const it = sel ? ITEM_BY_ID[sel.id] : null;
    this.attackT -= dt;
    if (it && it.type === 'wand') {
      if (this.attackT <= 0) {
        this.attackT = it.speed;
        if (p.mana < it.mana) { this.ui.showItemName('Mana insuficiente'); return; }
        p.mana -= it.mana;
        p.swing = p.swingDur = 0.25;
        const o = p.eye().addScaledVector(p.lookDir(), 0.8);
        const { d } = p.aimRay(this.camera);
        this.projectiles.push(new Projectile(this, o, d.clone().multiplyScalar(30), 'player', it.damage, 'bolt'));
        sfx('magic');
      }
      return;
    }
    if (it && it.type === 'weapon') {
      this.mining = null;
      if (this.attackT <= 0) {
        this.attackT = it.speed;
        p.swing = p.swingDur = it.speed;
        sfx('swing');
        const dir = p.lookDir().setY(0).normalize();
        for (const m of this.meleeTargets(it.reach)) m.hurt(it.damage, dir, it.knock);
        // swing arc sparkles
        if (it.glow) {
          const e = p.eye();
          for (let k = 0; k < 6; k++) this.particles.spawn(e.x + dir.x * 1.5, e.y - 0.3 + Math.random() * 0.6, e.z + dir.z * 1.5, (Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2, new THREE.Color('#9ff4ff'), 0.08, 0.4, 0, true);
        }
      }
      return;
    }
    // tools / hands: hit mobs in front, otherwise mine
    const tgt = this.target;
    const close = this.meleeTargets(2.6);
    if (close.length && (!tgt.block || tgt.block.dist > 1.5)) {
      this.mining = null;
      if (this.attackT <= 0) {
        this.attackT = it ? it.speed || 0.4 : 0.4;
        p.swing = p.swingDur = this.attackT;
        sfx('swing');
        close[0].hurt(it && it.damage ? it.damage : 3, p.lookDir().setY(0).normalize(), 4);
      }
      return;
    }
    const b = tgt.block;
    if (!b) { this.mining = null; return; }
    const def = BLOCKS[b.id];
    if (def.hardness < 0) return;
    const key = `${b.x},${b.y},${b.z}`;
    if (!this.mining || this.mining.key !== key) this.mining = { key, x: b.x, y: b.y, z: b.z, prog: 0, id: b.id };
    const tool = it && it.type === 'tool' ? it.tool : null;
    const power = tool ? it.power : 1;
    let time;
    if (def.minPower && (tool !== 'pick' || power < def.minPower)) {
      if (this.mineT <= 0) { this.ui.showItemName('Precisa de uma picareta mais forte'); this.mineT = 0.8; p.swing = p.swingDur = 0.25; sfx('dig'); }
      this.mineT -= dt;
      return;
    }
    // Fast, hit-based mining: a pickaxe breaks dirt in one swing and stone in two or three.
    if (def.tool === 'none') time = 0.05;
    else if (tool === def.tool || (tool === 'pick' && def.tool === 'shovel')) time = (def.hardness / power) * 0.28;
    else if (def.tool === 'shovel') time = def.hardness * 0.6;
    else if (def.tool === 'axe') time = def.hardness * (tool === 'pick' ? 0.9 : 1.6);
    else time = def.hardness * (tool ? 1.4 : 2.5);
    this.mining.prog += dt / Math.max(0.05, time);
    this.mineT -= dt;
    if (this.mineT <= 0) {
      this.mineT = 0.25;
      p.swing = p.swingDur = 0.25;
      sfx('dig');
      this.blockParticles(b.x, b.y, b.z, b.id, 3);
    }
    if (this.mining.prog >= 1) {
      this.breakBlock(b.x, b.y, b.z);
      this.mining = null;
    }
  }

  blockParticles(x, y, z, id, n) {
    const p = itemPainter(id < 100 && ITEM_BY_ID[id] ? id : B.DIRT);
    const cols = [];
    for (let k = 0; k < 6; k++) { const c = p.get(2 + ((k * 5) % 12), 2 + ((k * 7) % 12)); if (c[3]) cols.push(new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255)); }
    if (!cols.length) cols.push(new THREE.Color(0.5, 0.4, 0.3));
    this.particles.burst(x + 0.5, y + 0.5, z + 0.5, cols, n, 3.5, 0.11);
  }

  breakBlock(x, y, z) {
    const id = this.world.get(x, y, z);
    const def = BLOCKS[id];
    this.setBlock(x, y, z, B.AIR);
    sfx('break');
    const pid = ITEM_BY_ID[id] ? id : (def.drop && ITEM_BY_ID[def.drop] ? def.drop : B.DIRT);
    this.blockParticles(x, y, z, pid, 14);
    let drop = def.drop;
    if (id === B.CRYSTAL_ORE) drop = ITEMS.crystal.id;
    if ((id === B.LEAVES || id === B.DARK_LEAVES) && Math.random() < 0.04) this.spawnDrop(ITEMS.gel.id, 0, new V());
    if ((id === B.PRISM_PINK || id === B.PRISM_GOLD || id === B.PRISM_LILAC) && Math.random() < 0.08) drop = ITEMS.crystal.id;
    if (id === B.TALL_GRASS && Math.random() < 0.05) drop = B.MUSHROOM;
    if (drop && ITEM_BY_ID[drop]) this.spawnDrop(drop, 1, new V(x + 0.5, y + 0.3, z + 0.5));
    // unsupported plants / torches above fall
    const above = this.world.get(x, y + 1, z);
    if (RENDER[above] === 2 || RENDER[above] === 3) this.breakBlock(x, y + 1, z);
    this.flowWater(x, y, z);
    this.stats.mined = (this.stats.mined || 0) + 1;
  }
  flowWater(x, y, z) {
    const w = this.world;
    const q = [[x, y, z]];
    let n = 0;
    while (q.length && n < 80) {
      const [cx, cy, cz] = q.shift();
      if (w.get(cx, cy, cz) !== B.AIR || cy > SEA) continue;
      const src = w.get(cx, cy + 1, cz) === B.WATER || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => w.get(cx + dx, cy, cz + dz) === B.WATER);
      if (!src) continue;
      this.setBlock(cx, cy, cz, B.WATER);
      n++;
      q.push([cx, cy - 1, cz], [cx + 1, cy, cz], [cx - 1, cy, cz], [cx, cy, cz + 1], [cx, cy, cz - 1]);
    }
  }
  setBlock(x, y, z, id) {
    const box = this.world.setBlock(x, y, z, id);
    if (!box) return;
    this.chunks.markBox(Math.min(box.x0, x - 1), Math.min(box.z0, z - 1), Math.max(box.x1, x + 1), Math.max(box.z1, z + 1));
    this.chunks.flush(x, z, 1);
    if (x % 16 === 0) this.chunks.flush(x - 1, z, 0);
    if (x % 16 === 15) this.chunks.flush(x + 1, z, 0);
    if (z % 16 === 0) this.chunks.flush(x, z - 1, 0);
    if (z % 16 === 15) this.chunks.flush(x, z + 1, 0);
  }

  use() {
    const p = this.player;
    if (p.dead) return;
    const tgt = this.target;
    if (tgt.ent && tgt.ent.npc && tgt.ent.pos.distanceTo(p.pos) < 6) { this.npcTalk(false); return; }
    const sel = p.inv.selected;
    const it = sel ? ITEM_BY_ID[sel.id] : null;
    if (tgt.block && (tgt.block.id === B.WORKBENCH || tgt.block.id === B.FURNACE) && !(it && it.type === 'block')) { this.togglePanel(true); return; }
    if (!it) return;
    if (it.type === 'block') {
      const b = tgt.block;
      if (!b) return;
      let x = b.x + b.nx, y = b.y + b.ny, z = b.z + b.nz;
      if (BLOCKS[b.id].replaceable && b.id !== B.AIR) { x = b.x; y = b.y; z = b.z; }
      const cur = this.world.get(x, y, z);
      if (!BLOCKS[cur].replaceable || !this.world.inside(x, y, z)) return;
      const bid = it.block;
      const needsFloor = RENDER[bid] === 2 || RENDER[bid] === 3;
      if (needsFloor && !SOLID[this.world.get(x, y - 1, z)]) return;
      if (SOLID[bid]) {
        const hit = (e) => x + 1 > e.pos.x - e.w / 2 && x < e.pos.x + e.w / 2 && z + 1 > e.pos.z - e.w / 2 && z < e.pos.z + e.w / 2 && y + 1 > e.pos.y && y < e.pos.y + e.h;
        if (hit(p)) return;
        if (this.mobs.some((m) => !m.dead && hit(m))) return;
      }
      this.setBlock(x, y, z, bid);
      p.inv.takeSelected(1);
      p.swing = p.swingDur = 0.2;
      sfx('place');
      this.stats.placed = (this.stats.placed || 0) + 1;
      return;
    }
    if (it.type === 'consumable') {
      if (it.heal) { if (p.hp >= p.maxHp) return; p.hp = Math.min(p.maxHp, p.hp + it.heal); this.dmgText.add(p.pos.x, p.pos.y + 2.2, p.pos.z, '+' + it.heal, '#6aff8a'); }
      if (it.mana) { p.mana = Math.min(p.maxMana, p.mana + it.mana); }
      if (it.maxHp) { if (p.maxHp >= 200) { this.ui.message('Sua vida já está no máximo.'); return; } p.maxHp += it.maxHp; p.hp += it.maxHp; this.ui.message('Vida máxima aumentada!', '#ff9aaa'); }
      p.inv.takeSelected(1);
      sfx('drink');
      return;
    }
    if (it.type === 'summon') {
      if (this.boss && !this.boss.dead) { this.ui.message('O Colosso já está desperto!', '#ff9a7a'); return; }
      const a = p.yaw + Math.PI + (Math.random() - 0.5);
      const bx = Math.max(6, Math.min(W - 6, p.pos.x - Math.sin(p.yaw) * 14)), bz = Math.max(6, Math.min(D - 6, p.pos.z - Math.cos(p.yaw) * 14));
      void a;
      this.boss = new Boss(this, bx, Math.min(H - 6, p.pos.y + 22), bz);
      this.mobs.push(this.boss);
      p.inv.takeSelected(1);
      this.ui.message('O Colosso de Granito despertou!', '#ff8a5a');
      this.camShake = 0.8;
    }
  }

  // ------------------------------------------------------------ spawning
  spawnMobs(dt) {
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    this.spawnT = 1.6;
    const p = this.player;
    if (p.dead) return;
    const night = this.daylightFactor < 0.45;
    const hostile = this.mobs.filter((m) => !m.dead && m.hostile && !m.boss);
    const cap = night ? 9 : 5;
    for (const m of hostile) if (m.pos.distanceTo(p.pos) > 64) m.remove();
    if (hostile.length >= cap) return;
    const surfaceH = this.world.topSolid(p.pos.x, p.pos.z);
    const underground = p.pos.y < surfaceH - 6;
    let x, y, z;
    if (underground) {
      for (let tries = 0; tries < 12; tries++) {
        x = Math.floor(p.pos.x + (Math.random() - 0.5) * 36); z = Math.floor(p.pos.z + (Math.random() - 0.5) * 36);
        y = Math.floor(p.pos.y + (Math.random() - 0.5) * 12);
        const d = Math.hypot(x - p.pos.x, z - p.pos.z);
        if (d < 10) continue;
        if (this.world.get(x, y, z) === B.AIR && this.world.get(x, y + 1, z) === B.AIR && SOLID[this.world.get(x, y - 1, z)] && (this.world.getLight(x, y, z) >> 4) < 6) {
          this.mobs.push(Math.random() < 0.6 ? new Gloop(this, x + 0.5, y, z + 0.5, 4, true, 1) : new Walker(this, x + 0.5, y, z + 0.5));
          return;
        }
      }
      return;
    }
    const a = Math.random() * Math.PI * 2, r = 20 + Math.random() * 16;
    x = Math.floor(p.pos.x + Math.cos(a) * r); z = Math.floor(p.pos.z + Math.sin(a) * r);
    if (x < 2 || z < 2 || x > W - 3 || z > D - 3) return;
    y = this.world.topSolid(x, z);
    const top = this.world.get(x, y, z);
    if (top === B.WATER || top === B.ICE || !SOLID[top] || y + 3 >= H) return;
    if (OPAQUE[this.world.get(x, y + 1, z)] || OPAQUE[this.world.get(x, y + 2, z)]) return;
    const hut = this.world.hut;
    if (hut && Math.hypot(x - hut.x, z - hut.z) < 14) return;
    if ((this.world.getLight(x, y + 1, z) >> 4) > 7) return; // torches keep monsters away
    const biome = this.world.biomeAt(x, z);
    let m;
    if (biome === BIOME.PRISM && Math.random() < 0.35) m = new Moth(this, x + 0.5, y + 4, z + 0.5);
    else if (night && Math.random() < 0.65) m = new Walker(this, x + 0.5, y + 1, z + 0.5);
    else m = new Gloop(this, x + 0.5, y + 1, z + 0.5, biome, night, Math.random() < 0.1 ? 1.5 : 1);
    this.mobs.push(m);
  }

  // ------------------------------------------------------------ main loop
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    let dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.state === 'title') { this.titleFrame(dt); return; }
    if (this.state !== 'play') return;
    const p = this.player;
    const inp = this.input.frame();
    for (const e of this.input.poll()) this.handleEvent(e);
    const running = !this.paused;
    if (!running) dt = 0;
    this.time = (this.time + dt / DAY_LEN) % 1;
    this.timeSinceHurt += dt;
    this.camShake = Math.max(0, this.camShake - dt);

    if (running) {
      p.update(dt, inp);
      if (p.dead && p.respawnT <= 0) this.respawn();
      this.computeTarget();
      if (!p.dead && inp.attack) this.attackHeld(dt);
      else { this.mining = null; this.attackT -= dt; }
      if (inp.useHeld && !p.dead) { this.useT -= dt; if (this.useT <= 0) { this.useT = 0.16; this.use(); } } else this.useT = 0.2;
      for (const m of this.mobs) if (!m.dead) m.update(dt);
      this.mobs = this.mobs.filter((m) => !m.dead);
      for (const pr of this.projectiles) pr.update(dt);
      this.projectiles = this.projectiles.filter((x) => !x.dead);
      for (const d of this.drops) d.update(dt);
      this.drops = this.drops.filter((x) => !x.dead);
      if (this.boss && this.boss.dead) this.boss = null;
      this.spawnMobs(dt);
    }
    this.renderWorld(dt, p);
    // HUD
    this.ui.update(dt);
    const hrs = (6 + this.time * 24) % 24;
    const hh = String(Math.floor(hrs)).padStart(2, '0'), mm = String(Math.floor((hrs % 1) * 6) * 10).padStart(2, '0');
    this.ui.setInfo(`${BIOME_NAMES[this.world.biomeAt(p.pos.x, p.pos.z)]} · ${hh}:${mm} · ${this.daylightFactor < 0.45 ? 'noite' : 'dia'}`);
    const talk = document.getElementById('btn-talk');
    const canTalk = this.npc && !this.npc.dead && this.npc.pos.distanceTo(p.pos) < 5;
    if (talk.hidden === canTalk) talk.hidden = !canTalk;
    if (p.dead) document.getElementById('deathtime').textContent = Math.max(0, Math.ceil(p.respawnT));
    updateMusic(dt, this.daylightFactor < 0.45, !!this.boss);
    this.saveT += dt;
    if (this.saveT > 40) { this.saveT = 0; this.saveGame(); }
  }

  renderWorld(dt, p) {
    p.updateCamera(this.camera, dt);
    const center = new V(W / 2, 0, D / 2);
    const env = this.sky.update(this.time, this.camera.position, dt, center);
    this.daylightFactor = env.day;
    const u = this.mats.shared;
    u.uTime.value += dt;
    u.uDay.value = env.day;
    u.uSkyTint.value.copy(env.skyTint);
    // underwater tint
    const camBlock = this.world.get(Math.floor(this.camera.position.x), Math.floor(this.camera.position.y + 0.1), Math.floor(this.camera.position.z));
    const under = camBlock === B.WATER;
    const fogCol = under ? new THREE.Color(0.08, 0.22, 0.4).multiplyScalar(0.4 + env.day * 0.6) : env.fog;
    u.uFogColor.value.copy(fogCol);
    u.uFogNear.value = under ? 2 : this.viewDist * 0.5;
    u.uFogFar.value = under ? 18 : this.viewDist;
    this.scene.fog.color.copy(fogCol);
    this.scene.fog.near = u.uFogNear.value; this.scene.fog.far = u.uFogFar.value;
    this.chunks.flush(undefined, undefined, 2);
    this.chunks.updateVisibility(this.camera.position.x, this.camera.position.z, this.viewDist + 8);
    // highlight + cracks
    const tb = this.target && this.target.block;
    this.highlight.visible = !!tb && !p.dead && this.state === 'play';
    if (tb) {
      const r = RENDER[tb.id];
      if (r === 1) { this.highlight.scale.set(1, 1, 1); this.highlight.position.set(tb.x + 0.5, tb.y + 0.5, tb.z + 0.5); }
      else { this.highlight.scale.set(0.6, 0.85, 0.6); this.highlight.position.set(tb.x + 0.5, tb.y + 0.42, tb.z + 0.5); }
    }
    if (this.mining && this.mining.prog > 0.02) {
      this.crackMesh.visible = true;
      this.crackMesh.position.set(this.mining.x + 0.5, this.mining.y + 0.5, this.mining.z + 0.5);
      this.crackMesh.material.map = this.cracks[Math.min(7, Math.floor(this.mining.prog * 8))];
    } else this.crackMesh.visible = false;
    // entity lighting
    for (const m of this.mobs) m.tint(this.lightAt(m.pos.x, m.pos.y + m.h * 0.6, m.pos.z));
    const pl = this.lightAt(p.pos.x, p.pos.y + 1.2, p.pos.z);
    p.rig.material.color.setScalar(pl);
    p.viewMat.color.setScalar(Math.max(0.25, pl));
    const held = (o) => { if (o.material && !o.material.userData.glow && !o.material.map) o.material.color.setScalar(Math.max(0.3, pl)); };
    p.rig.hand.traverse(held); p.viewHand.traverse(held);
    this.particles.update(dt, this.world, (x, y, z) => this.lightAt(x, y, z));
    this.dmgText.update(dt);
    u.uSunDir.value.copy(env.sunDir.y > -0.05 ? env.sunDir : env.sunDir.clone().negate());
    this.post.render(this.scene, this.camera, fogCol, this.viewDist * 1.6);
    if (p.view.visible) { this.renderer.clearDepth(); this.renderer.render(this.viewScene, this.camera); }
  }

  titleFrame(dt) {
    this.titleT += dt;
    const hut = this.world.hut || { x: W / 2, y: 40, z: D / 2 };
    const a = this.titleT * 0.06 + 0.6;
    const r = 26;
    this.camera.position.set(hut.x + Math.cos(a) * r, hut.y + 12, hut.z + Math.sin(a) * r);
    this.camera.lookAt(hut.x, hut.y + 3, hut.z);
    const env = this.sky.update(this.time, this.camera.position, dt, new V(W / 2, 0, D / 2));
    this.daylightFactor = env.day;
    const u = this.mats.shared;
    u.uTime.value += dt; u.uDay.value = env.day; u.uSkyTint.value.copy(env.skyTint); u.uFogColor.value.copy(env.fog);
    u.uFogNear.value = 60; u.uFogFar.value = 120;
    this.scene.fog.color.copy(env.fog); this.scene.fog.near = 60; this.scene.fog.far = 120;
    this.chunks.updateVisibility(hut.x, hut.z, 120);
    for (const m of this.mobs) { m.update(dt); m.tint(this.lightAt(m.pos.x, m.pos.y + 1, m.pos.z)); }
    this.player.rig.group.visible = false;
    this.player.shadow.visible = false;
    u.uSunDir.value.copy(env.sunDir.y > -0.05 ? env.sunDir : env.sunDir.clone().negate());
    this.post.render(this.scene, this.camera, env.fog, 200);
  }

  handleEvent(e) {
    const p = this.player;
    switch (e.type) {
      case 'slot': this.selectSlot(e.n); break;
      case 'scroll': if (!this.panel) this.selectSlot(p.inv.sel + e.dir); break;
      case 'inv': if (this.panel === 'dialog') this.closeDialog(); else this.togglePanel(); break;
      case 'craft': this.togglePanel(true); break;
      case 'cam': p.camMode = (p.camMode + 1) % 3; this.ui.message(['Primeira pessoa', 'Terceira pessoa', 'Visão frontal'][p.camMode], '#e8ffd8'); break;
      case 'talk': if (this.npc && this.npc.pos.distanceTo(p.pos) < 5) this.npcTalk(false); break;
      case 'pause':
        if (this.panel === 'inv') this.togglePanel(false);
        else if (this.panel === 'dialog') this.closeDialog();
        else this.setPause(!this.paused);
        break;
      case 'use': if (!this.panel && !this.paused) { this.use(); this.useT = 0.35; } break;
      case 'quick': {
        const pot = p.inv.slots.findIndex((s) => s && s.id === ITEMS.potion.id);
        if (pot >= 0 && p.hp < p.maxHp) { const old = p.inv.sel; p.inv.sel = pot; this.use(); p.inv.sel = old; p.inv.changed(); }
        break;
      }
      default: break;
    }
  }

  respawn() {
    const p = this.player, sp = this.world.spawn;
    p.dead = false; p.hp = p.maxHp; p.vel.set(0, 0, 0);
    p.pos.set(sp.x, sp.y, sp.z);
    p.fallStart = null;
    document.getElementById('death').hidden = true;
    this.ui.message('Você acordou na cabana do Bento.', '#fff2a6');
  }

  saveGame() {
    if (this.state !== 'play') return;
    const edits = [];
    for (const [i, id] of this.world.edits) edits.push(i, id);
    store(SAVE_KEY, { v: 1, seed: this.world.seed, edits, player: this.player.serialize(), time: this.time, stats: this.stats });
  }
}

function rayAABB(o, d, x0, y0, z0, x1, y1, z1) {
  let tmin = 0, tmax = Infinity;
  const ax = [[o.x, d.x, x0, x1], [o.y, d.y, y0, y1], [o.z, d.z, z0, z1]];
  for (const [oo, dd, a, b] of ax) {
    if (Math.abs(dd) < 1e-8) { if (oo < a || oo > b) return null; continue; }
    let t1 = (a - oo) / dd, t2 = (b - oo) / dd;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}

const game = new Game();
window.__game = game;
game.load().catch((e) => {
  console.error(e);
  const l = document.getElementById('loadlabel');
  if (l) l.textContent = 'Erro ao carregar: ' + e.message;
});
window.addEventListener('beforeunload', () => game.saveGame());
document.addEventListener('visibilitychange', () => { if (document.hidden) { game.saveGame(); if (game.state === 'play' && !game.paused) game.setPause(true); } });
