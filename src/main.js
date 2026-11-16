import * as THREE from 'three';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import './style.css';
import { clamp, lerp, wrapA, rng, money, m3 } from './util.js';
import {
  terrainMesh, tuftMesh, flush, dirtyAll, relax, resetRelax, baseTerrain, placeTufts,
  heightAt, MATS, HALF, WATER_Y, windUniform, pad, BASE0, H,
} from './terrain.js';
import { particleMesh, dustMesh, updateParticles, updateDust, clearParticles, clearDust, addCatcher, setLandHook } from './particles.js';
import { MACHINES, Vehicle } from './machines.js';
import { JOBS, STAGING, Job } from './contracts.js';
import { makeSky, makeLights, makeWater, makeOuter, addTreeMeshes, placeTrees, makeClouds } from './world.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import * as TER from './terrain.js';

const $ = (s) => document.querySelector(s);

/* ================= salvamento ================= */
const SAVE_KEY = 'terra-pesada-v1';
const save = (() => {
  const def = { money: 800, owned: ['loader', 'truck'], done: {}, sound: true, quality: 'high', tut: {} };
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    return s ? { ...def, ...s } : def;
  } catch (_) { return def; }
})();
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (_) { /* sem armazenamento */ } }

/* ================= render ================= */
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 900);
makeSky(scene);
const lights = makeLights(scene);
const water = makeWater(scene);
makeOuter(scene);
addTreeMeshes(scene);
const clouds = makeClouds(scene);
scene.add(terrainMesh, tuftMesh, particleMesh, dustMesh);

function applyQuality() {
  const hi = save.quality === 'high';
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, hi ? 1.75 : 1));
  lights.sun.shadow.mapSize.set(hi ? 2048 : 1024, hi ? 2048 : 1024);
  if (lights.sun.shadow.map) { lights.sun.shadow.map.dispose(); lights.sun.shadow.map = null; }
  tuftMesh.visible = true;
  $('#pQuality').textContent = 'Gráficos: ' + (hi ? 'alto' : 'leve');
  resize();
}
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w > h ? 55 : 72;
  camera.updateProjectionMatrix();
  checkRotate();
}
addEventListener('resize', resize);

/* ================= estado ================= */
const world = { vehicles: [], trees: [] };
const fleet = {};
let job = null;
let active = null;
let mode = 'title';
let jobTime = 0;
let elapsed = 0;
const sound = new Sound();
sound.enabled = save.sound;

const input = new Input($('#touch'), $('#stickL'), $('#stickR'));
input.onFirst = () => sound.start();

addCatcher((x, y, z, v, m) => {
  for (const veh of world.vehicles) if (veh.kind === 'truck' && veh.catchParticle(x, y, z, v, m)) return true;
  return false;
});
setLandHook((x, z, v) => { if (job) job.onLand(x, z, v); });

function getVehicle(id) {
  if (!fleet[id]) fleet[id] = new Vehicle(id, scene);
  return fleet[id];
}

/* ================= canteiro ================= */
function buildSite(def, seed) {
  if (job) { job.dispose(); job = null; }
  clearParticles();
  clearDust();
  resetRelax();
  baseTerrain(seed, def.soil);
  pad(-21, -31, 6, -23, 0.05, 1);
  BASE0.set(H);
  const ctx = { rand: rng(seed + 17), target: null };
  const spec = def.setup(ctx);
  const reserved = [[-26, -44, 12, -21], ...(spec.reserved || [])];
  if (spec.zone) reserved.push([spec.zone[0] - 3, spec.zone[1] - 3, spec.zone[2] + 3, spec.zone[3] + 3]);
  world.trees = placeTrees(seed, reserved);
  placeTufts(seed);
  dirtyAll();
  flush();
  job = new Job(def, spec, ctx, scene);
  job.evaluate();
  // frota disponível no pátio
  for (const v of Object.values(fleet)) v.root.visible = false;
  world.vehicles = [];
  const order = ['loader', 'truck', 'dozer', 'skid'].filter((id) => save.owned.includes(id));
  order.forEach((id, k) => {
    const v = getVehicle(id);
    v.root.visible = true;
    v.load = 0; v.tilt = 0; v.resist = 0; v.steerA = 0;
    v.lift = v.kind === 'dozer' ? 0.3 : v.liftMin + 0.3;
    v.curl = 0.12;
    const [sx, sz] = STAGING[k];
    v.place(sx, sz, 0);
    world.vehicles.push(v);
  });
  const want = def.req.find((r) => save.owned.includes(r)) || order[0];
  setActive(fleet[want]);
  jobTime = 0;
}

function setActive(v) {
  active = v;
  cam.yaw = v.yaw + Math.PI;
  cam.snap = true;
  const kind = v.kind;
  const L = { loader: ['Subir', 'Descer', 'Recolher', 'Despejar'], skid: ['Subir', 'Descer', 'Recolher', 'Despejar'], dozer: ['Subir', 'Baixar', 'Recua', 'Avança'], truck: ['Bascular', 'Abaixar', '', ''] }[kind];
  $('#labT').textContent = L[0]; $('#labB').textContent = L[1]; $('#labL').textContent = L[2]; $('#labR').textContent = L[3];
  $('#gName').textContent = v.s.name;
  $('#gLoadWrap').hidden = !v.s.cap;
  $('#gLoadLbl').textContent = kind === 'truck' ? 'Báscula' : 'Caçamba';
  for (const o of Object.values(fleet)) for (const m of o.cabHide) m.visible = true;
  if (cam.mode === 'cab') for (const m of v.cabHide) m.visible = false;
  if (mode === 'play' && !save.tut[kind]) {
    save.tut[kind] = 1; persist();
    const tips = {
      loader: 'Baixe a caçamba até o chão e avance contra o monte. Levante e incline para a direita para despejar.',
      skid: 'Joystick esquerdo para os lados gira no lugar. Direito: braço e caçamba.',
      dozer: 'Baixe a lâmina até encostar e avance para empurrar. Lâmina alta raspa, baixa corta.',
      truck: 'Pare ao lado da carregadeira para receber carga. Joystick direito para cima bascula.',
    };
    toast(tips[kind], 6);
  }
}

/* ================= câmera ================= */
const cam = { mode: 'chase', yaw: 0, off: 0, pitch: 0.46, dist: 14, idle: 0, look: 0, lookP: -0.08, snap: true, pos: new THREE.Vector3(), tgt: new THREE.Vector3() };
const _t = new THREE.Vector3(), _p = new THREE.Vector3();

function updateCamera(dt) {
  const v = active;
  const c = input.takeCam();
  if (cam.mode === 'cab') {
    cam.look = clamp(cam.look - c.dx * 0.005, -2.2, 2.2);
    cam.lookP = clamp(cam.lookP - c.dy * 0.004, -0.9, 0.5);
    if (Math.abs(c.dx) < 0.1 && input.cam.size === 0) cam.look = lerp(cam.look, 0, Math.min(1, dt * 0.6));
    v.root.updateMatrixWorld(true);
    v.seat.getWorldPosition(_p);
    camera.position.copy(_p);
    const yaw = v.yaw + cam.look, p = cam.lookP - v.pitch * Math.cos(cam.look);
    _t.set(_p.x + Math.sin(yaw) * Math.cos(p) * 10, _p.y + Math.sin(p) * 10, _p.z + Math.cos(yaw) * Math.cos(p) * 10);
    camera.lookAt(_t);
    camera.near = 0.05;
    camera.updateProjectionMatrix();
    return;
  }
  camera.near = 0.1;
  const high = cam.mode === 'high';
  cam.off -= c.dx * 0.006;
  cam.pitch = clamp(cam.pitch + c.dy * 0.004, 0.08, 1.35);
  cam.dist = clamp(cam.dist + c.zoom, 6, 34);
  if (Math.abs(c.dx) + Math.abs(c.dy) > 0.5) cam.idle = 0; else cam.idle += dt;
  if (cam.idle > 2.5 && Math.abs(v.speed) > 0.6) cam.off = lerp(cam.off, 0, Math.min(1, dt * 1.2));
  const back = v.speed < -0.5 && cam.idle > 1 ? 0 : Math.PI;
  const wantYaw = v.yaw + back + cam.off;
  cam.yaw += wrapA(wantYaw - cam.yaw) * Math.min(1, dt * (cam.snap ? 60 : 3.2));
  const pitch = high ? Math.max(cam.pitch, 1.0) : cam.pitch;
  const dist = high ? cam.dist * 1.7 : cam.dist;
  cam.tgt.set(v.x + v.fx * 1.8, v.y + (v.kind === 'truck' ? 2.4 : 1.9), v.z + v.fz * 1.8);
  _p.set(
    cam.tgt.x + Math.sin(cam.yaw) * Math.cos(pitch) * dist,
    cam.tgt.y + Math.sin(pitch) * dist,
    cam.tgt.z + Math.cos(cam.yaw) * Math.cos(pitch) * dist
  );
  const gy = Math.max(heightAt(_p.x, _p.z), WATER_Y) + 1.0;
  if (_p.y < gy) _p.y = gy;
  if (cam.snap) { cam.pos.copy(_p); cam.snap = false; } else cam.pos.lerp(_p, Math.min(1, dt * 7));
  camera.position.copy(cam.pos);
  camera.lookAt(cam.tgt);
}

function cycleCamera() {
  const order = ['chase', 'cab', 'high'];
  cam.mode = order[(order.indexOf(cam.mode) + 1) % order.length];
  for (const o of Object.values(fleet)) for (const m of o.cabHide) m.visible = true;
  if (cam.mode === 'cab') { for (const m of active.cabHide) m.visible = false; cam.look = 0; cam.lookP = -0.12; }
  cam.snap = true;
  toast({ chase: 'Câmera externa', cab: 'Câmera na cabine', high: 'Câmera aérea' }[cam.mode], 1.2);
}

/* ================= HUD ================= */
let toastT = 0;
function toast(msg, sec = 2.5) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  toastT = sec;
}
let hudT = 0;
function updateHud(dt) {
  hudT -= dt;
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('#toast').hidden = true; }
  if (hudT > 0) return;
  hudT = 0.12;
  $('#money').textContent = money(save.money);
  const v = active;
  $('#gSpeed').textContent = Math.round(Math.abs(v.speed) * 3.6);
  if (v.s.cap) {
    const f = v.load / v.s.cap;
    $('#gLoad').style.width = Math.round(f * 100) + '%';
    $('#gLoadTxt').textContent = `${m3(v.load)} de ${m3(v.s.cap)} m³ · ${MATS[v.mat].name}`;
  }
  if (job) {
    $('#jobInfo').textContent = job.label();
    const bar = $('#jobBar');
    bar.style.width = Math.round(job.progress * 100) + '%';
    bar.classList.toggle('ok', job.done);
    $('#jobGoal').style.left = job.type === 'free' ? '-10px' : `calc(${job.goal * 100}% - 1px)`;
    $('#bFinish').hidden = !job.done;
  }
}
function setupJobHud() {
  $('#jobTitle').textContent = job.def.title;
  const legend = $('#jobLegend');
  legend.innerHTML = '';
  const colors = { cut: 'var(--cut)', fill: 'var(--fill)', ok: 'var(--ok)', need: 'var(--need)' };
  for (const [k, txt] of job.legend()) {
    const s = document.createElement('span');
    s.style.setProperty('--c', colors[k]);
    s.textContent = txt;
    legend.appendChild(s);
  }
  $('.bar').hidden = job.type === 'free';
}

/* ================= telas ================= */
function show(id) {
  for (const s of ['#sTitle', '#sJobs', '#sShop', '#sPause', '#sDone']) $(s).hidden = s !== id;
  $('#hud').hidden = !(mode === 'play' || mode === 'pause');
  checkRotate();
}

function renderJobs() {
  $('#jobsMoney').textContent = money(save.money);
  const list = $('#jobList');
  list.innerHTML = '';
  for (const def of JOBS) {
    const missing = def.req.filter((r) => !save.owned.includes(r));
    const el = document.createElement('article');
    el.className = 'card' + (missing.length ? ' locked' : '');
    const soil = MATS[def.soil];
    const reqTxt = def.req.length ? def.req.map((r) => MACHINES[r].short).join(' + ') : 'Qualquer máquina';
    const doneN = save.done[def.id] || 0;
    el.innerHTML = `
      <div class="row"><span class="soil" style="--soil:${def.id === 'estrada' ? MATS[1].ui : def.id === 'aterro' ? MATS[2].ui : soil.ui}">${def.id === 'estrada' ? 'Cascalho' : def.id === 'aterro' ? 'Areia' : def.id === 'livre' ? 'Misto' : soil.name}</span>
      <span class="pay">${def.pay ? money(def.pay) : 'Treino'}</span></div>
      <h3>${def.title}</h3>
      <p class="client">${def.client}</p>
      <p class="desc">${def.blurb}</p>
      <div class="meta">
        <span class="chip">${def.size}</span>
        <span class="chip ${missing.length ? 'miss' : ''}">${missing.length ? 'Precisa: ' + missing.map((r) => MACHINES[r].short).join(', ') : reqTxt}</span>
        ${doneN ? `<span class="chip done">Feito ${doneN}×</span>` : ''}
      </div>`;
    const b = document.createElement('button');
    b.className = missing.length ? 'ghost' : 'big';
    b.textContent = missing.length ? 'Ver na garagem' : def.pay ? 'Aceitar contrato' : 'Entrar no pátio';
    b.onclick = () => (missing.length ? openShop() : startJob(def));
    el.appendChild(b);
    list.appendChild(el);
  }
}

let thumbs = null;
function machineThumbs() {
  if (thumbs) return thumbs;
  thumbs = {};
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(360, 180);
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight(0xffffff, 0x665544, 1.6));
  const d = new THREE.DirectionalLight(0xffffff, 2.2);
  d.position.set(5, 8, 6);
  sc.add(d);
  const cm = new THREE.PerspectiveCamera(30, 2, 0.1, 100);
  for (const id of Object.keys(MACHINES)) {
    const v = new Vehicle(id, sc);
    v.x = 0; v.z = 0; v.y = 0; v.yaw = -0.7;
    if (v.kind !== 'truck' && v.kind !== 'dozer') { v.lift = 0.15; v.curl = 0.2; }
    v.sync();
    const L = id === 'truck' ? 15 : id === 'skid' ? 8 : 12.5;
    cm.position.set(L * 0.75, L * 0.42, L * 0.62);
    cm.lookAt(0, id === 'skid' ? 1.0 : 1.5, 0.3);
    r.render(sc, cm);
    thumbs[id] = r.domElement.toDataURL();
    sc.remove(v.root);
  }
  r.dispose();
  return thumbs;
}

function renderShop() {
  $('#shopMoney').textContent = money(save.money);
  const list = $('#shopList');
  list.innerHTML = '';
  let th = {};
  try { th = machineThumbs(); } catch (_) { th = {}; }
  for (const [id, m] of Object.entries(MACHINES)) {
    const own = save.owned.includes(id);
    const el = document.createElement('article');
    el.className = 'card';
    el.innerHTML = `
      <div class="mach-art">${th[id] ? `<img src="${th[id]}" alt="${m.name}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">` : ''}</div>
      <div class="row"><h3>${m.name}</h3><span class="pay">${own ? '' : money(m.price)}</span></div>
      <p class="desc">${m.desc}</p>
      <dl class="stats">${Object.entries(m.stats).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
    const b = document.createElement('button');
    if (own) { b.className = 'ghost'; b.textContent = 'Na garagem'; b.disabled = true; }
    else {
      b.className = 'big';
      b.textContent = save.money >= m.price ? 'Comprar' : `Faltam ${money(m.price - save.money)}`;
      b.disabled = save.money < m.price;
      b.onclick = () => {
        if (save.money < m.price) return;
        save.money -= m.price;
        save.owned.push(id);
        persist();
        renderShop();
      };
    }
    el.appendChild(b);
    list.appendChild(el);
  }
}

let shopReturn = 'jobs';
function openShop() { shopReturn = mode === 'title' ? 'title' : 'jobs'; mode = 'shop'; renderShop(); show('#sShop'); }
function openJobs() { mode = 'jobs'; renderJobs(); show('#sJobs'); }
function openTitle() { mode = 'title'; show('#sTitle'); }

function startJob(def) {
  sound.start();
  mode = 'play';
  buildSite(def, (Date.now() % 100000) + Math.floor(Math.random() * 1000));
  setupJobHud();
  show(null);
  input.reset();
  cam.mode = 'chase';
  cam.off = 0; cam.pitch = 0.46; cam.dist = 14;
  setActive(active);
  const [cx, cz] = job.center();
  if (job.type !== 'free') toast(`${job.def.client}: ${job.def.blurb}`, 6);
  void cx; void cz;
}

function finishJob() {
  if (!job || !job.done) return;
  const def = job.def;
  const extra = job.type === 'haul' ? 0 : clamp((job.progress - job.goal) / (1 - job.goal), 0, 1);
  const bonus = Math.round((def.pay * 0.25 * extra) / 10) * 10;
  save.money += def.pay + bonus;
  save.done[def.id] = (save.done[def.id] || 0) + 1;
  persist();
  $('#dTitle').textContent = def.title;
  $('#dPay').textContent = money(def.pay);
  $('#dBonus').textContent = money(bonus);
  const mins = Math.floor(jobTime / 60), secs = Math.floor(jobTime % 60);
  $('#dTime').textContent = `${mins} min ${String(secs).padStart(2, '0')} s`;
  $('#dTotal').textContent = money(def.pay + bonus);
  mode = 'done';
  show('#sDone');
}

/* ---------- botões ---------- */
const tap = (sel, fn) => $(sel).addEventListener('click', (e) => { e.stopPropagation(); sound.start(); fn(); });
tap('#tPlay', openJobs);
tap('#tShop', openShop);
tap('#jShop', openShop);
tap('#jBack', openTitle);
tap('#sBack', () => (shopReturn === 'title' ? openTitle() : openJobs()));
tap('#bCam', cycleCamera);
tap('#bSwitch', () => {
  const vs = world.vehicles;
  if (vs.length < 2) { toast('Compre mais máquinas na garagem', 1.8); return; }
  setActive(vs[(vs.indexOf(active) + 1) % vs.length]);
  toast(active.s.name, 1.2);
});
tap('#bMenu', () => { mode = 'pause'; input.reset(); show('#sPause'); $('#hud').hidden = false; });
tap('#pResume', () => { mode = 'play'; show(null); });
tap('#pReset', () => {
  const k = world.vehicles.indexOf(active);
  const [sx, sz] = STAGING[k];
  active.place(sx, sz, 0);
  active.speed = 0;
  cam.snap = true;
  mode = 'play'; show(null);
});
tap('#pSound', () => {
  save.sound = !save.sound; persist();
  sound.setEnabled(save.sound);
  $('#pSound').textContent = 'Som: ' + (save.sound ? 'ligado' : 'desligado');
});
tap('#pQuality', () => { save.quality = save.quality === 'high' ? 'low' : 'high'; persist(); applyQuality(); });
tap('#pQuit', () => { openJobs(); buildSite(JOBS.find((j) => j.id === 'livre'), 7); });
tap('#bFinish', finishJob);
tap('#dOk', () => { openJobs(); buildSite(JOBS.find((j) => j.id === 'livre'), 7); });
$('#pSound').textContent = 'Som: ' + (save.sound ? 'ligado' : 'desligado');
addEventListener('keydown', (e) => {
  if (mode !== 'play') return;
  if (e.code === 'KeyC') cycleCamera();
  if (e.code === 'Tab' || e.code === 'KeyV') { e.preventDefault(); $('#bSwitch').click(); }
  if (e.code === 'Escape') $('#bMenu').click();
});

let rotateDismissed = false;
function checkRotate() {
  const portrait = innerHeight > innerWidth * 1.05;
  const touch = matchMedia('(pointer: coarse)').matches;
  $('#rotate').hidden = !(portrait && touch && !rotateDismissed && (mode === 'play' || mode === 'pause'));
}
tap('#rotOk', () => { rotateDismissed = true; checkRotate(); });

/* ================= loop ================= */
let last = performance.now();
let evalT = 0;
const NONE = { thr: 0, steer: 0, ty: 0, tx: 0 };

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  elapsed += dt;
  windUniform.value = elapsed;
  water.tex.offset.y -= dt * 0.05;
  water.tex.offset.x = Math.sin(elapsed * 0.3) * 0.02;
  clouds.rotation.y += dt * 0.003;

  const playing = mode === 'play';
  if (active) {
    const inp = playing ? input.state() : NONE;
    for (const v of world.vehicles) {
      if (v === active) {
        v.hydraulics(dt, inp);
        v.drive(dt, inp, world);
      } else {
        v.hydro = 0;
        if (Math.abs(v.speed) > 0) v.drive(dt, NONE, world);
      }
      v.pose(dt, false);
      v.sync();
      if (v === active || v.kind === 'truck') v.applyTool(dt, world);
      v.animate(dt);
    }
  }
  updateParticles(dt);
  updateDust(dt);
  relax(dt);
  flush();

  if (job) {
    job.tick(elapsed);
    evalT -= dt;
    if (evalT <= 0) { evalT = 0.25; job.evaluate(); }
  }

  if (mode === 'play' || mode === 'pause' || mode === 'done') {
    if (playing) jobTime += dt;
    updateCamera(dt);
    updateHud(dt);
    const a = active;
    const flow = a.kind === 'truck' ? (a.tilt > 0.3 && a.load > 0 ? 2 : 0) : 0;
    sound.update(a.rpm, a.digRate, a.hydro, flow, a.kind === 'dozer' || a.kind === 'truck', !playing);
  } else {
    // vitrine: câmera girando pelo canteiro
    const t = elapsed * 0.05;
    camera.near = 0.1;
    camera.position.set(Math.sin(t) * 30 - 4, 14 + Math.sin(t * 0.7) * 2, Math.cos(t) * 30 - 6);
    camera.lookAt(-6, 1, -12);
    sound.update(0, 0, 0, 0, false, true);
  }
  if (window.__camOverride) { camera.position.fromArray(window.__camOverride[0]); camera.lookAt(...window.__camOverride[1]); }
  const focus = active ? _t.set(active.x, 0, active.z) : _t.set(0, 0, 0);
  lights.sun.position.copy(focus).add(lights.off);
  lights.sun.target.position.copy(focus);
  renderer.render(scene, camera);
}

/* ================= início ================= */
applyQuality();
buildSite(JOBS.find((j) => j.id === 'livre'), 7);
show('#sTitle');
requestAnimationFrame(frame);
function renderIcon(size, transparent) {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(size, size);
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight(0xffffff, 0x665544, 1.7));
  const d = new THREE.DirectionalLight(0xffffff, 2.4);
  d.position.set(6, 9, 4);
  sc.add(d);
  const v = new Vehicle('loader', sc);
  v.x = 0; v.z = 0; v.y = 0; v.yaw = -0.75; v.lift = 0.35; v.curl = 0.3;
  v.sync();
  const cm = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  cm.position.set(13.5, 7.6, 10.4);
  cm.lookAt(0.6, 1.6, 0.4);
  if (!transparent) r.setClearColor(0x15171a, 1);
  r.render(sc, cm);
  const url = r.domElement.toDataURL('image/png');
  r.dispose();
  return url;
}
window.__game = { renderIcon, TER, get job() { return job; }, get active() { return active; }, get mode() { return mode; }, world, save, startJob, JOBS, finishJob, input };
