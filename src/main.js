import '@fontsource/pixelify-sans/latin-400.css';
import '@fontsource/pixelify-sans/latin-700.css';
import './style.css';
import * as THREE from 'three';
import { windTime } from './materials.js';
import { buildWorld } from './world.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { defaultConfig, randomConfig, sanitizeConfig } from './character.js';
import { loadSave, writeSave, loadSettings, writeSettings } from './save.js';

// ---------- renderizador ----------
// Imagem limpa com anti-aliasing; a resolução interna é limitada pela opção de gráficos (leve no celular).
const QUALITY = [{ name: 'Leve', h: 540, shadow: 1024 }, { name: 'Normal', h: 810, shadow: 2048 }, { name: 'Fino', h: 1080, shadow: 2048 }];
const settings = loadSettings();
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
// lente longa (FOV baixo) + câmera alta na diagonal: enquadramento de jogo de fazenda, quase isométrico
const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 400);

// luz: sol quente + céu claro com sombras puxadas pro lilás
scene.add(new THREE.HemisphereLight('#fff4dc', '#9c8fc9', 1.75));
const sun = new THREE.DirectionalLight('#ffe6b8', 2.5);
const SUN_DIR = new THREE.Vector3(-0.55, 1, 0.5).normalize();
sun.castShadow = true;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
const sunQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(SUN_DIR, new THREE.Vector3(), new THREE.Vector3(0, 1, 0)));
const sunQi = sunQ.clone().invert();
let shadowSize = 0;
const tmp = new THREE.Vector3();
function aimSun(focus, size) {
  const cam = sun.shadow.camera;
  if (size !== shadowSize) {
    shadowSize = size;
    cam.left = cam.bottom = -size;
    cam.right = cam.top = size;
    cam.near = 1;
    cam.far = 140;
    cam.updateProjectionMatrix();
  }
  // prende o foco na grade de texels do mapa de sombra (evita sombra "tremendo" ao andar)
  const texel = (size * 2) / sun.shadow.mapSize.x;
  tmp.copy(focus).applyQuaternion(sunQi);
  tmp.x = Math.round(tmp.x / texel) * texel;
  tmp.y = Math.round(tmp.y / texel) * texel;
  tmp.applyQuaternion(sunQ);
  sun.target.position.copy(tmp);
  sun.position.copy(tmp).addScaledVector(SUN_DIR, 60);
}

function applyQuality() {
  const q = QUALITY[settings.quality] || QUALITY[1];
  const w = innerWidth || 1, h = innerHeight || 1;
  const ih = Math.min(q.h, Math.round(h * Math.min(devicePixelRatio || 1, 2)));
  renderer.setPixelRatio(1);
  renderer.setSize(Math.round((ih * w) / h), ih, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (sun.shadow.mapSize.x !== q.shadow) {
    sun.shadow.mapSize.set(q.shadow, q.shadow);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }
  shadowSize = 0;
}
addEventListener('resize', applyQuality);

// ---------- mundo e jogador ----------
const world = buildWorld(scene);
let save = loadSave();
if (save) save.char = sanitizeConfig(save.char);
let cfg = save ? { ...save.char } : defaultConfig();
const player = new Player(scene, cfg, world);
const input = new Input(document.getElementById('touch'), document.getElementById('stick'));

// ---------- câmera ----------
const ZOOM = [{ name: 'Perto', d: 13 }, { name: 'Média', d: 17 }, { name: 'Longe', d: 22 }];
const cam = { yaw: 0, pitch: 0.62, dist: (ZOOM[settings.zoom] || ZOOM[1]).d };
const camPos = new THREE.Vector3(0, 16, 36), camLook = new THREE.Vector3(0, 1, -4);
const wantPos = new THREE.Vector3(), wantLook = new THREE.Vector3();
let menuAngle = 0.35;
let state = 'menu';
let editing = false; // criador aberto a partir da pausa

function placePlayerFromSave() {
  if (save?.pos) {
    player.pos.set(save.pos[0], 0, save.pos[1]);
    player.face(save.heading || 0);
    cam.yaw = 0;
  } else {
    player.pos.copy(world.spawn);
    player.face(0);
    cam.yaw = 0;
  }
  player.vel.set(0, 0);
  player.char.resetSprings();
}
function persist() {
  if (state !== 'play' && state !== 'pause') return;
  save = { char: cfg, pos: [player.pos.x, player.pos.z], heading: player.heading, camYaw: cam.yaw };
  writeSave(save);
}

const ui = new UI({
  newGame() {
    cfg = defaultConfig();
    editing = false;
    openCreator();
  },
  continueGame() {
    placePlayerFromSave();
    startPlay();
  },
  back() {
    if (editing) {
      cfg = { ...save.char };
      player.char.setConfig(cfg);
      startPlay();
    } else {
      if (save?.char) { cfg = { ...save.char }; player.char.setConfig(cfg); }
      toMenu();
    }
  },
  random() {
    cfg = randomConfig(cfg.name);
    player.char.setConfig(cfg);
    ui.buildCreator(cfg, () => player.char.setConfig(cfg));
  },
  start() {
    cfg.name = (cfg.name || '').trim() || 'Brisa';
    document.activeElement?.blur();
    if (!editing) { save = null; placePlayerFromSave(); }
    startPlay();
  },
  pause() {
    state = 'pause';
    input.setMode('none');
    ui.show('pause');
    persist();
  },
  resume: () => startPlay(),
  edit() {
    editing = true;
    openCreator();
  },
  quit() {
    persist();
    toMenu();
  },
  quality(d) {
    settings.quality = (settings.quality + d + QUALITY.length) % QUALITY.length;
    writeSettings(settings);
    applyQuality();
    ui.setQualityLabel(QUALITY[settings.quality].name);
  },
  zoom(d) {
    settings.zoom = (settings.zoom + d + ZOOM.length) % ZOOM.length;
    writeSettings(settings);
    cam.dist = ZOOM[settings.zoom].d;
    ui.setZoomLabel(ZOOM[settings.zoom].name);
  },
});

function toMenu() {
  state = 'menu';
  input.setMode('none');
  ui.setHasSave(!!save?.char);
  ui.show('menu');
  player.group.visible = !!save?.char;
  if (save?.char) placePlayerFromSave();
}
function openCreator() {
  state = 'create';
  player.group.visible = true;
  player.vel.set(0, 0);
  if (!editing) player.pos.copy(world.spawn);
  player.char.resetSprings();
  player.face(editing ? cam.yaw : 0);
  if (!editing) cam.yaw = 0;
  player.char.setConfig(cfg);
  ui.buildCreator(cfg, () => player.char.setConfig(cfg));
  input.setMode('rotate');
  ui.show('creator');
}
function startPlay() {
  state = 'play';
  player.group.visible = true;
  ui.setTag(cfg.name);
  ui.show('hud');
  input.setMode('play');
  persist();
}

ui.setQualityLabel(QUALITY[settings.quality]?.name || 'Normal');
ui.setZoomLabel((ZOOM[settings.zoom] || ZOOM[1]).name);
applyQuality();
toMenu();

// ---------- loop ----------
const timer = new THREE.Timer();
let saveTimer = 0;
const NO_MOVE = { x: 0, y: 0, m: 0 };

function frame() {
  requestAnimationFrame(frame);
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);
  if (document.hidden) return;
  windTime.value += dt;
  world.update(dt);
  let snap = 6;

  if (state === 'menu') {
    menuAngle += dt * 0.045;
    wantPos.set(Math.sin(menuAngle) * 36 - 2, 15, Math.cos(menuAngle) * 36 - 4);
    wantLook.set(-2, 1.5, -5);
    player.update(dt, NO_MOVE, 0);
    aimSun(wantLook, 44);
    snap = 2.5;
  } else if (state === 'create') {
    const look = input.takeLook();
    player.face(player.heading + look.x * 0.012);
    player.update(dt, NO_MOVE, 0);
    // personagem fica na metade esquerda da tela; o painel ocupa a direita
    const d = 4.3, halfW = d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
    const sx = Math.cos(cam.yaw), sz = -Math.sin(cam.yaw), shift = halfW * 0.46;
    wantLook.set(player.pos.x + sx * shift, 0.72, player.pos.z + sz * shift);
    wantPos.set(wantLook.x + Math.sin(cam.yaw) * d, 1.05, wantLook.z + Math.cos(cam.yaw) * d);
    aimSun(player.pos, 14);
    snap = 5;
  } else {
    if (state === 'play') {
      player.update(dt, input.getMove(), cam.yaw);
      saveTimer += dt;
      if (saveTimer > 5) { saveTimer = 0; persist(); }
    }
    const cp = Math.cos(cam.pitch);
    wantLook.set(player.pos.x, 0.8, player.pos.z);
    wantPos.set(wantLook.x + Math.sin(cam.yaw) * cp * cam.dist, wantLook.y + Math.sin(cam.pitch) * cam.dist, wantLook.z + Math.cos(cam.yaw) * cp * cam.dist);
    aimSun(player.pos, 26);
    snap = 7;
  }

  const k = 1 - Math.exp(-dt * snap);
  camPos.lerp(wantPos, k);
  camLook.lerp(wantLook, k);
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  renderer.render(scene, camera);
}
frame();

document.addEventListener('visibilitychange', () => {
  if (document.hidden) persist();
});
// expõe pro console/testes
window.__game = { player, cam, input, scene, renderer, get state() { return state; } };
