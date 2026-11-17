// Estúdio de comparação (só desenvolvimento): personagem de frente, fundo branco, câmera ortográfica.
// Usado pelos scripts de comparação com as imagens de referência.
import * as THREE from 'three';
import { Character, defaultConfig } from '../src/character.js';

const W = 420, H = 640;
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#ffffff');
scene.add(new THREE.HemisphereLight('#fff4dc', '#9c8fc9', 1.75));
const sun = new THREE.DirectionalLight('#ffe6b8', 2.5);
sun.position.set(-3, 6, 5);
scene.add(sun);
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
let ch = new Character(defaultConfig());
scene.add(ch.group);

window.studio = {
  // cfg: config do personagem; ang: giro (0 = de frente); top/bottom: faixa vertical enquadrada (mundo)
  show(cfg, { ang = 0, pose = 'idle', t = 0.0, extra = 0, tight = false } = {}) {
    ch.setConfig({ ...defaultConfig(), ...cfg });
    ch.group.rotation.y = ang;
    ch.fidget = null;
    for (const k in ch.act) { ch.act[k].setEffectiveWeight(k === pose ? 1 : 0); ch.w[k] = k === pose ? 1 : 0; }
    ch.mixer.setTime(t);
    for (let i = 0; i < 40; i++) ch.update(1 / 60, 0); // assenta a física
    for (const k in ch.act) ch.act[k].setEffectiveWeight(k === pose ? 1 : 0);
    ch.mixer.update(0);
    // enquadra do pé ao topo da cabeça (altura vem das medidas do corpo)
    const D = ch.D, sc = ch.group.scale.y;
    // tight: enquadra exatamente do pé ao topo do cabelo (pra decalcar sobre a referência)
    const hairTop = D.L + 0.1 + D.sh + 0.06 + D.neck + 0.78;
    const top = (tight ? hairTop : hairTop + 0.02 + extra) * sc, pad = top * 0.03;
    cam.top = top / 2 + pad; cam.bottom = -(top / 2 + pad);
    cam.left = -((top + 2 * pad) / 2) * (W / H); cam.right = -cam.left;
    cam.position.set(0, top / 2, 10);
    cam.lookAt(0, top / 2, 0);
    cam.updateProjectionMatrix();
    const h = top;
    renderer.render(scene, cam);
    return h;
  },
};
window.__ready = true;
