// Voxília — game bootstrap and main loop.
import * as THREE from 'three';
import { World, W, D, H, SEA, HELL, BIOME_NAMES, BIOME, layerName } from './world.js';
import { B, BLOCKS, buildAtlas, makeWaterTexture, makeLavaTexture, makeCrackTextures, SOLID, RENDER, OPAQUE } from './blocks.js';
import { ChunkManager, createWorldMaterials } from './mesher.js';
import { Sky } from './sky.js';
import { Particles, DamageText } from './particles.js';
import { Player } from './player.js';
import { Gloop, Walker, Moth, NPC, Boss, Projectile, Drop, BENTO_LINES, SlimeBoss, Serpent, AuroraBeam, NPC_KINDS } from './entities.js';
import { EQUIP_START, EQUIP_KINDS } from './player.js';
import { ITEMS, ITEM_BY_ID, RECIPES, itemName, itemPainter, BUFFS } from './items.js';
import { raycast } from './physics.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { OutlinePass } from './post.js';
import { Net, RemotePlayers } from './net.js';
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
    this.net = new Net();
    let save = store(SAVE_KEY);
    let joinCode = null;
    try { joinCode = sessionStorage.getItem('voxilia-join'); sessionStorage.removeItem('voxilia-join'); } catch (e) { /* ignore */ }
    if (joinCode) {
      progress(0.01, `Entrando na sala ${joinCode}`);
      try {
        const init = await this.net.join(joinCode);
        this.mp = 'guest';
        save = { seed: init.seed, edits: init.edits, time: init.time, guest: true };
        progress(0.02, 'Conectado! Gerando o mundo do anfitrião');
      } catch (e) {
        progress(0.01, 'Falha ao entrar: ' + e.message);
        await new Promise((r) => setTimeout(r, 2500));
      }
    }
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
    if (save && save.guest) { this.time = save.time || this.time; }
    if (save && save.player) {
      const p = save.player;
      this.player.pos.set(p.x, p.y, p.z); this.player.yaw = p.yaw; this.player.pitch = p.pitch;
      this.player.hp = p.hp; this.player.maxHp = p.maxHp; this.player.mana = p.mana; this.player.maxMana = p.maxMana || 60;
      this.player.buffs = p.buffs || []; if (p.cam !== undefined) this.player.camMode = p.cam;
      this.player.inv.load(p.inv); this.player.inv.sel = p.sel || 0;
      this.time = save.time || 0.05;
      this.stats = save.stats || {};
    } else {
      const I = ITEMS;
      for (const [it, n] of [[I.copper_sword, 1], [I.copper_pick, 1], [I.copper_axe, 1], [I.torch, 12], [I.potion, 3], [I.planks, 20], [I.workbench, 1]]) this.player.inv.add(it.id, n);
    }
    this.player.recalcStats();
    this.beam = new AuroraBeam(this);
    this.player.inv.changed();
    if (this.world.hut) {
      const hut = this.world.hut;
      this.npc = new NPC(this, hut.x + 0.5, hut.y + 0.1, hut.z + 0.5);
      this.mobs.push(this.npc);
    }
    this.housed = {};
    for (const h of (save && save.npcs) || []) {
      const n = new NPC(this, h.x, h.y, h.z, h.kind);
      this.mobs.push(n); this.housed[h.kind] = n;
    }
    progress(1, 'Pronto');
    this.state = 'title';
    this.titleT = 0;
    document.getElementById('loading').hidden = true;
    document.getElementById('titlebtns').hidden = false;
    document.getElementById('btn-play').textContent = this.mp === 'guest' ? 'Entrar no mundo' : save ? 'Continuar' : 'Jogar';
    document.getElementById('btn-new').hidden = !save || this.mp === 'guest';
    document.getElementById('btn-mp').hidden = this.mp === 'guest';
    this.remotes = new RemotePlayers(this);
    this.net.onMessage = (m, from) => this.onNet(m, from);
    this.net.onStatus = (t) => { document.getElementById('mp-status').textContent = t; if (this.state === 'play') this.ui.message(t, '#bff8ff'); };
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
    $('btn-mp').onclick = () => { $('mppanel').hidden = false; $('titlebtns').hidden = true; };
    $('mp-back').onclick = () => { $('mppanel').hidden = true; $('titlebtns').hidden = false; };
    const nameIn = $('mp-name');
    nameIn.value = this.settings.name || ('Aventureiro' + Math.floor(Math.random() * 90 + 10));
    nameIn.onchange = () => { this.settings.name = nameIn.value.slice(0, 16) || 'Aventureiro'; this.saveSettings(); };
    this.settings.name = nameIn.value;
    $('mp-host').onclick = async () => {
      if (!this.net.available()) { $('mp-status').textContent = 'Multijogador precisa do app ou de um navegador comum (com internet).'; return; }
      $('mp-status').textContent = 'Abrindo sala…';
      try {
        const code = await this.net.hostRoom(() => { const edits = []; for (const [i, id] of this.world.edits) edits.push(i, id); return { seed: this.world.seed, edits, time: this.time }; });
        this.mp = 'host';
        $('mp-code').textContent = code;
        $('mp-codebox').hidden = false;
        $('pause-code').textContent = `Sala: ${code}`;
      } catch (e) { $('mp-status').textContent = 'Não foi possível abrir a sala: ' + (e.type || e.message); }
    };
    $('mp-start').onclick = () => { $('mppanel').hidden = true; this.startPlay(); };
    $('mp-join').onclick = () => {
      const code = $('mp-joincode').value.trim().toUpperCase();
      if (code.length < 4) { $('mp-status').textContent = 'Digite o código da sala.'; return; }
      try { sessionStorage.setItem('voxilia-join', code); } catch (e) { /* ignore */ }
      location.reload();
    };
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
    $('dlg-shop').onclick = () => this.openShop();
    $('btn-creative').onclick = () => { this.settings.creative = !this.settings.creative; this.saveSettings(); $('btn-creative').textContent = `Modo criativo: ${this.settings.creative ? 'ligado' : 'desligado'}`; this.ui.message(this.settings.creative ? 'Modo criativo: todos os itens na Criação.' : 'Modo criativo desligado.', '#bff8ff'); };
    $('btn-creative').textContent = `Modo criativo: ${this.settings.creative ? 'ligado' : 'desligado'}`;
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
  npcTalk(next, who) {
    const npc = who || this.talkNpc || this.npc;
    this.talkNpc = npc;
    const d = document.getElementById('dialog');
    d.hidden = false;
    this.panel = 'dialog';
    this.input.enabled = false;
    this.input.release();
    document.getElementById('dlg-name').textContent = npc.name;
    document.getElementById('dlg-shop').hidden = !npc.shop;
    document.getElementById('shoplist').hidden = true;
    if (next) npc.lineIdx = (npc.lineIdx + 1) % npc.lines.length;
    let line = npc.lines[npc.lineIdx];
    if (npc.kind === 'bento' && this.daylightFactor < 0.4 && !next) line = 'Está escuro lá fora. Fique perto das tochas, os Andarilhos não gostam de luz.';
    if (npc.kind === 'bento' && !this.housed.merchant && !next && Math.random() < 0.5) line = 'Construa uma casa fechada com porta, tocha e bancada. Com moedas no bolso, uma mercadora pode se mudar para lá!';
    document.getElementById('dlg-text').textContent = line;
    sfx('click');
  }
  openShop() {
    const list = document.getElementById('shoplist');
    list.hidden = false;
    const I = ITEMS;
    const stock = [[I.torch, 5, 2], [I.potion, 1, 4], [I.mana_potion, 1, 4], [I.mining_potion, 1, 8], [I.regen_potion, 1, 8], [I.swift_potion, 1, 8], [I.iron_potion, 1, 10],
      [I.grapple, 1, 35], [I.light_feather, 1, 50], [I.cloud_bottle, 1, 70], [I.door, 1, 3], [I.jelly_gem, 1, 15], [I.copper_pick, 1, 6], [I.iron_bar, 3, 6]];
    const inv = this.player.inv;
    list.innerHTML = '';
    const coins = inv.count(I.coin.id);
    const head = document.createElement('div'); head.className = 'help'; head.textContent = `Suas moedas: ${coins}`;
    list.appendChild(head);
    for (const [it, n, price] of stock) {
      const row = document.createElement('div'); row.className = 'recipe ok';
      row.innerHTML = `<div class="rout"><img src="${this.ui.icon(it.id)}" alt=""><div><b>${it.name}</b>${n > 1 ? ` <small>x${n}</small>` : ''}<div class="ring"><span class="${coins >= price ? '' : 'miss'}"><img src="${this.ui.icon(I.coin.id)}" alt="">${price}</span></div></div></div>`;
      const b = document.createElement('button'); b.className = 'btn small'; b.textContent = 'Comprar'; b.disabled = coins < price;
      b.onclick = () => { if (inv.count(I.coin.id) < price) return; inv.remove(I.coin.id, price); const left = inv.add(it.id, n); if (left) this.dropFromPlayer(it.id, left); sfx('craft'); this.ui.pickup(it.id, n); this.openShop(); };
      row.appendChild(b); list.appendChild(row);
    }
  }
  // An enclosed room around the player with a door, a light and a workbench lets a new NPC move in.
  checkHousing() {
    if (this.housed.merchant) return;
    const p = this.player, w = this.world;
    if (p.inv.count(ITEMS.coin.id) < 10) return;
    const sx = Math.floor(p.pos.x), sy = Math.floor(p.pos.y + 0.5), sz = Math.floor(p.pos.z);
    const seen = new Set(), q = [[sx, sy, sz]];
    let light = false, bench = false, door = false, n = 0;
    while (q.length) {
      const [x, y, z] = q.pop();
      const k = x + ',' + y + ',' + z;
      if (seen.has(k)) continue;
      seen.add(k);
      const id = w.get(x, y, z);
      if (id === B.DOOR) { door = true; continue; }
      if (SOLID[id]) { if (id === B.WORKBENCH) bench = true; continue; }
      if (id === B.TORCH) light = true;
      if (++n > 500 || Math.abs(x - sx) > 14 || Math.abs(z - sz) > 14 || Math.abs(y - sy) > 10) return;
      q.push([x + 1, y, z], [x - 1, y, z], [x, y + 1, z], [x, y - 1, z], [x, y, z + 1], [x, y, z - 1]);
    }
    if (n < 30 || !light || !bench || !door) return;
    if (this.world.hut && Math.hypot(sx - this.world.hut.x, sz - this.world.hut.z) < 6) return; // Bento's hut is taken
    const m = new NPC(this, sx + 0.5, sy, sz + 0.5, 'merchant');
    this.mobs.push(m); this.housed.merchant = m;
    this.ui.message('Lira, a Mercadora, se mudou para a sua casa!', '#e6c04a');
    sfx('craft');
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
    const free = this.settings.creative;
    if (!free && r.station && !st[r.station]) return;
    if (!free && !r.in.every(([it, n]) => inv.count(it.id) >= n)) return;
    if (!free) for (const [it, n] of r.in) inv.remove(it.id, n);
    const left = inv.add(r.out[0].id, r.out[1]);
    if (left > 0) this.dropFromPlayer(r.out[0].id, left);
    sfx('craft');
    this.ui.pickup(r.out[0].id, r.out[1]);
    this.stats.crafted = (this.stats.crafted || 0) + 1;
  }

  // ------------------------------------------------------------ helpers used by entities
  lightAt(x, y, z) {
    const l = this.world.getLight(Math.floor(x), Math.floor(y), Math.floor(z));
    const pp = this.player ? this.player.pos : null;
    const gk = pp ? Math.max(0, 1 - Math.hypot(x - pp.x, y - pp.y - 1.2, z - pp.z) / 7) : 0;
    return Math.max(0.1, LCURVE[l & 15] * this.daylightFactor, LCURVE[l >> 4], gk * gk * 0.75);
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
    if (it && it.type === 'beam') { this.mining = null; this.beamOn = true; return; }
    if (it && it.type === 'wand') {
      if (this.attackT <= 0) {
        this.attackT = it.speed;
        if (p.mana < it.mana) { this.ui.showItemName('Mana insuficiente'); return; }
        p.mana -= it.mana;
        p.startAnim(0.25, 'cast');
        const o = p.eye().addScaledVector(p.lookDir(), 0.8);
        const { d } = p.aimRay(this.camera);
        this.projectiles.push(new Projectile(this, o, d.clone().multiplyScalar(30), 'player', it.damage * p.stats.damage, it.proj || 'bolt'));
        sfx('magic');
      }
      return;
    }
    if (it && it.type === 'weapon') {
      this.mining = null;
      if (this.attackT <= 0) {
        this.attackT = it.speed;
        p.startAnim(it.speed, 'swing');
        sfx('swing');
        const dir = p.lookDir().setY(0).normalize();
        for (const m of this.meleeTargets(it.reach)) { m.hurt(it.damage * p.stats.damage, dir, it.knock); if (it.fire) this.particles.burst(m.pos.x, m.pos.y + m.h / 2, m.pos.z, [new THREE.Color('#ff7a1a'), new THREE.Color('#ffd84a')], 6, 3, 0.1); }
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
    this.mining.prog += dt * p.stats.mine / Math.max(0.05, time);
    this.mineT -= dt;
    if (this.mineT <= 0) {
      this.mineT = 0.25;
      p.startAnim(0.25, 'chop');
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
  setBlock(x, y, z, id, remote = false) {
    if (!remote && this.net && this.net.active) this.net.send({ t: 'b', x, y, z, id });
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
    if (tgt.ent && tgt.ent.npc && tgt.ent.pos.distanceTo(p.pos) < 6) { this.npcTalk(false, tgt.ent); return; }
    if (tgt.block && tgt.block.id === B.CHEST) { this.openChest(tgt.block); return; }
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
      p.startAnim(0.2, 'punch');
      sfx('place');
      this.stats.placed = (this.stats.placed || 0) + 1;
      return;
    }
    if (it.armor || it.acc) {
      const inv = p.inv;
      let slot = -1;
      for (let i = 0; i < 7; i++) { const k = EQUIP_KINDS[i]; if ((it.acc ? k === 'acc' : k === it.armor) && !inv.slots[EQUIP_START + i]) { slot = EQUIP_START + i; break; } }
      if (slot < 0) slot = it.acc ? EQUIP_START + 3 : EQUIP_START + EQUIP_KINDS.indexOf(it.armor);
      const old = inv.slots[slot];
      inv.slots[slot] = inv.slots[inv.sel];
      inv.slots[inv.sel] = old;
      p.recalcStats(); inv.changed();
      this.ui.message(`Equipado: ${it.name}`, '#bff8ff');
      sfx('craft');
      return;
    }
    if (it.type === 'hook') { if (p.hook) p.hook = null; else p.fireHook(); return; }
    if (it.type === 'consumable') {
      if (it.buff) { p.addBuff(it.buff, it.time); p.inv.takeSelected(1); p.startAnim(0.5, 'drink'); sfx('drink'); this.ui.message(BUFFS[it.buff].name + '!', BUFFS[it.buff].color); return; }
      if (it.heal) { if (p.hp >= p.maxHp) return; p.hp = Math.min(p.maxHp, p.hp + it.heal); this.dmgText.add(p.pos.x, p.pos.y + 2.2, p.pos.z, '+' + it.heal, '#6aff8a'); }
      if (it.mana) { p.mana = Math.min(p.maxMana, p.mana + it.mana); }
      if (it.maxHp) { if (p.maxHp >= 200) { this.ui.message('Sua vida já está no máximo.'); return; } p.maxHp += it.maxHp; p.hp += it.maxHp; this.ui.message('Vida máxima aumentada!', '#ff9aaa'); }
      p.inv.takeSelected(1);
      p.startAnim(0.5, 'drink');
      sfx('drink');
      return;
    }
    if (it.type === 'summon') {
      if (this.boss && !this.boss.dead) { this.ui.message('Já há um chefe desperto!', '#ff9a7a'); return; }
      if (it.boss === 'slime') {
        if (this.daylightFactor < 0.5) { this.ui.message('A Gema só reage à luz do dia.'); return; }
        this.boss = new SlimeBoss(this, p.pos.x - Math.sin(p.yaw) * 12, Math.min(H - 6, p.pos.y + 20), p.pos.z - Math.cos(p.yaw) * 12);
        this.mobs.push(this.boss); p.inv.takeSelected(1);
        this.ui.message('A Gosma Anciã despertou!', '#7fd2f5'); this.camShake = 0.6;
        return;
      }
      if (it.boss === 'serpent') {
        if (p.pos.y > HELL + 6) { this.ui.message('A Isca só funciona no Submundo.'); return; }
        this.boss = new Serpent(this, p.pos.x + 10, p.pos.y - 8, p.pos.z + 10);
        this.mobs.push(this.boss); p.inv.takeSelected(1);
        this.ui.message('A Serpente de Brasa despertou!', '#ffb02a'); this.camShake = 0.8;
        return;
      }
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

  openChest(b) {
    const I = ITEMS;
    const deep = b.y < 24;
    const r = () => Math.random();
    const loot = [[I.coin.id, 5 + Math.floor(r() * 12)], [I.torch.id, 8 + Math.floor(r() * 12)]];
    const pool = deep
      ? [[I.gold_bar, 4, 8], [I.potion, 2, 4], [I.mana_potion, 2, 3], [I.life_crystal, 1, 1], [I.crystal, 4, 9], [I.star_wand, 1, 1], [I.gold_pick, 1, 1]]
      : [[I.copper_bar, 4, 8], [I.iron_bar, 3, 7], [I.potion, 1, 3], [I.life_crystal, 1, 1], [I.crystal, 2, 5], [I.iron_sword, 1, 1], [I.iron_pick, 1, 1], [I.glowcap, 2, 4]];
    const accs = deep ? [I.lava_charm, I.storm_bottle, I.war_emblem, I.mana_ring, I.swift_boots] : [I.cloud_bottle, I.swift_boots, I.light_feather, I.regen_ring, I.grapple, I.mana_ring];
    if (r() < 0.75) loot.push([accs[Math.floor(r() * accs.length)].id, 1]);
    const pots = [I.regen_potion, I.swift_potion, I.iron_potion, I.mining_potion, I.shine_potion];
    loot.push([pots[Math.floor(r() * pots.length)].id, 1 + Math.floor(r() * 2)]);
    for (let k = 0; k < 2; k++) {
      const [it, a, z] = pool[Math.floor(r() * pool.length)];
      loot.push([it.id, a + Math.floor(r() * (z - a + 1))]);
    }
    const pos = new V(b.x + 0.5, b.y + 1.1, b.z + 0.5);
    for (const [id, n] of loot) { const d = new Drop(this, id, n, pos.clone()); d.vel.set((Math.random() - 0.5) * 4, 5, (Math.random() - 0.5) * 4); this.drops.push(d); }
    this.setBlock(b.x, b.y, b.z, B.CHEST_OPEN);
    this.particles.burst(pos.x, pos.y, pos.z, [new THREE.Color('#f2c94c'), new THREE.Color('#fff2a6')], 20, 4, 0.1);
    sfx('craft');
    this.ui.message('Você abriu um baú!', '#f2c94c');
    this.stats.chests = (this.stats.chests || 0) + 1;
  }

  // ------------------------------------------------------------ spawning
  spawnMobs(dt) {
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    this.spawnT = this.crimson ? 0.7 : 1.6;
    const p = this.player;
    if (p.dead) return;
    const night = this.daylightFactor < 0.45;
    const hostile = this.mobs.filter((m) => !m.dead && m.hostile && !m.boss);
    const cap = this.crimson ? 18 : night ? 9 : 5;
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
    if ((this.world.getLight(x, y + 1, z) >> 4) > 7 && !this.crimson) return; // torches keep monsters away
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
      const selIt = p.inv.selected ? ITEM_BY_ID[p.inv.selected.id] : null;
      let beamActive = !p.dead && inp.attack && selIt && selIt.type === 'beam';
      if (beamActive) {
        this.beamMana = (this.beamMana || 0) - dt;
        if (this.beamMana <= 0) { if (p.mana < selIt.mana) beamActive = false; else { p.mana -= selIt.mana; this.beamMana = 0.2; } }
        if (beamActive && Math.random() < dt * 8) sfx('magic');
      }
      const { o: bo, d: bd } = p.aimRay(this.camera);
      const handPos = p.eye().addScaledVector(p.lookDir(), 0.9).add(new V(0, -0.25, 0));
      void bo;
      this.beam.update(dt, !!beamActive, handPos, bd.clone().normalize(), selIt && selIt.type === 'beam' ? selIt.damage * p.stats.damage : 0);
      this.houseT = (this.houseT || 0) - dt;
      if (this.houseT <= 0) { this.houseT = 3; this.checkHousing(); }
      this.updateEvents();
      this.netTick(dt);
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
    const layer = layerName(p.pos.y, this.world.height[Math.max(0, Math.min(W - 1, Math.floor(p.pos.x))) + Math.max(0, Math.min(D - 1, Math.floor(p.pos.z))) * W]);
    this.ui.setInfo(`${layer || BIOME_NAMES[this.world.biomeAt(p.pos.x, p.pos.z)]} · ${hh}:${mm} · ${this.daylightFactor < 0.45 ? 'noite' : 'dia'}`);
    const talk = document.getElementById('btn-talk');
    const near = this.mobs.find((m) => m.npc && !m.dead && m.pos.distanceTo(p.pos) < 5);
    const canTalk = !!near;
    if (near && talk.dataset.who !== near.name) { talk.dataset.who = near.name; talk.textContent = `Falar com ${near.name.split(',')[0]}`; }
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
    // depth below the surface darkens the fog; the underworld glows red
    const cp = this.camera.position;
    const surfY = this.world.height[Math.max(0, Math.min(W - 1, Math.floor(cp.x))) + Math.max(0, Math.min(D - 1, Math.floor(cp.z))) * W];
    const depthK = THREE.MathUtils.smoothstep(surfY - cp.y, 4, 14);
    const hellK = THREE.MathUtils.smoothstep(HELL + 4 - cp.y, 0, 6);
    const fogCol = under ? new THREE.Color(0.08, 0.22, 0.4).multiplyScalar(0.4 + env.day * 0.6) : env.fog.clone();
    if (!under && this.crimson) { fogCol.lerp(new THREE.Color(0.45, 0.06, 0.08), 0.55 * (1 - env.day)); u.uSkyTint.value.lerp(new THREE.Color(1, 0.3, 0.3), 0.6); this.sky.uniforms.uTop.value.lerp(new THREE.Color(0.25, 0.02, 0.04), 0.7); this.sky.uniforms.uHor.value.lerp(new THREE.Color(0.5, 0.08, 0.1), 0.7); }
    if (!under && depthK > 0) fogCol.lerp(new THREE.Color(0.03, 0.025, 0.04), depthK);
    if (!under && hellK > 0) fogCol.lerp(new THREE.Color(0.32, 0.08, 0.03), hellK);
    this.envDepth = depthK;
    u.uFogColor.value.copy(fogCol);
    u.uFogNear.value = under ? 2 : this.viewDist * (0.5 - depthK * 0.25);
    u.uFogFar.value = under ? 18 : this.viewDist * (1 - depthK * 0.35);
    u.uGlow.value.set(p.pos.x, p.pos.y + 1.2, p.pos.z, 5 + depthK * 5);
    u.uMinLight.value = 0.07 + hellK * 0.12;
    this.scene.fog.color.copy(fogCol);
    this.scene.fog.near = u.uFogNear.value; this.scene.fog.far = u.uFogFar.value;
    this.sky.group.visible = this.envDepth < 0.98; this.sky.clouds.visible = this.envDepth < 0.98;
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
      case 'cam': p.camMode = (p.camMode + 1) % 3; this.ui.message(['Primeira pessoa', 'Terceira pessoa', 'Visão frontal'][p.camMode], '#e8ffd8'); document.getElementById('btn-cam').textContent = ['1ª pessoa', '3ª pessoa', 'Frente'][p.camMode]; break;
      case 'talk': { const n = this.mobs.find((m) => m.npc && !m.dead && m.pos.distanceTo(p.pos) < 5); if (n) this.npcTalk(false, n); break; }
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

  onNet(m, from) {
    if (m.t === 's') this.remotes.state(m.id, m);
    else if (m.t === 'b') this.setBlock(m.x, m.y, m.z, m.id, true);
    else if (m.t === 'leave') { this.remotes.remove(m.id); }
    else if (m.t === 'time' && this.mp === 'guest') this.time = m.time;
    else if (m.t === 'hostgone') this.ui.message('O anfitrião saiu da sala.', '#ff9aaa');
    void from;
  }
  netTick(dt) {
    if (!this.net || !this.net.active) return;
    this.remotes.update(dt);
    this.netT = (this.netT || 0) - dt;
    if (this.netT > 0) return;
    this.netT = 0.09;
    const p = this.player;
    const msg = { t: 's', id: this.net.id, n: this.settings.name, c: (this.net.id || '').length % 6, x: +p.pos.x.toFixed(2), y: +((p.visY ?? p.pos.y)).toFixed(2), z: +p.pos.z.toFixed(2), yaw: +p.yaw.toFixed(3), p: +p.pitch.toFixed(2), a: !p.onGround ? 1 : 0, vy: +p.vel.y.toFixed(1), h: p.heldId };
    if (p.swing > 0 && !this.sentSwing) { msg.sw = p.swingDur; msg.k = p.anim; this.sentSwing = true; }
    if (p.swing <= 0) this.sentSwing = false;
    this.net.send(msg);
    if (this.mp === 'host') { this.timeSync = (this.timeSync || 0) + 1; if (this.timeSync % 50 === 0) this.net.send({ t: 'time', time: this.time }); }
  }
  updateEvents() {
    const night = this.daylightFactor < 0.45;
    if (night && !this.wasNight) {
      this.nightCount = (this.nightCount || 0) + 1;
      this.crimson = this.nightCount > 1 && Math.random() < 0.3;
      if (this.crimson) { this.ui.message('A Lua Carmesim está nascendo...', '#ff4a5a'); sfx('roar'); }
    }
    if (!night && this.wasNight && this.crimson) { this.crimson = false; this.ui.message('A Lua Carmesim se pôs.', '#ffb0b8'); }
    this.wasNight = night;
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
    if (this.state !== 'play' || this.mp === 'guest') return;
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
window.__items = ITEMS;
window.__ents = { Gloop, Walker, Moth, SlimeBoss, Serpent, Boss };
game.load().catch((e) => {
  console.error(e);
  const l = document.getElementById('loadlabel');
  if (l) l.textContent = 'Erro ao carregar: ' + e.message;
});
window.addEventListener('beforeunload', () => game.saveGame());
document.addEventListener('visibilitychange', () => { if (document.hidden) { game.saveGame(); if (game.state === 'play' && !game.paused) game.setPause(true); } });
