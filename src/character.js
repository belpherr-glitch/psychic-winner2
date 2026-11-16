// Personagem chibi: esqueleto de juntas + peças low-poly com textura pixel art.
// As animações são clipes de keyframes de verdade (AnimationMixer), com mistura suave entre eles.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { cozyMat } from './materials.js';
import { canvasTex, noiseTex, shade, hex } from './textures.js';

export const OPTIONS = {
  skin: ['#ffe0c2', '#f7c9a0', '#e3a878', '#c68655', '#9a6038', '#6e4226'],
  hairColor: ['#3a2a22', '#6b4226', '#a8642e', '#e2b04a', '#f3e2a0', '#c94f3a', '#e58fb0', '#6c8fd6', '#7ac48a', '#e9e9ee'],
  eyeColor: ['#4a3122', '#3f7fbf', '#3f9a5a', '#8a5fc4', '#c9793a', '#3b3b4a'],
  shirtColor: ['#f4f1e6', '#e8615a', '#f2a23c', '#f5d657', '#6fbf6a', '#58b6c9', '#5f7fd8', '#a977d6', '#f08fb4'],
  pantsColor: ['#4f6fb5', '#3d4a66', '#7a5a3c', '#5c8f58', '#b5524a', '#8a6fb8', '#d8c9a0'],
  hair: ['Curto', 'Longo', 'Chiquinhas', 'Rabo de cavalo', 'Espetado', 'Coque', 'Cacheado'],
  outfit: ['Macacão', 'Camiseta', 'Listrada'],
  hat: ['Nenhum', 'Chapéu de palha', 'Boné'],
};

export function defaultConfig() {
  return { name: '', skin: 1, hair: 0, hairColor: 1, eyeColor: 0, outfit: 0, shirtColor: 1, pantsColor: 0, hat: 0 };
}
export function randomConfig(name = '') {
  const r = (k) => (Math.random() * OPTIONS[k].length) | 0;
  return { name, skin: r('skin'), hair: r('hair'), hairColor: r('hairColor'), eyeColor: r('eyeColor'), outfit: r('outfit'), shirtColor: r('shirtColor'), pantsColor: r('pantsColor'), hat: Math.random() < 0.5 ? 0 : r('hat') };
}

const HIP_Y = 0.44;
const ARM_Z = 0.15;
const TAU = Math.PI * 2;
export const WALK_DUR = 0.62, RUN_DUR = 0.44, IDLE_DUR = 2.6;

// ---------- texturas pixel art do personagem ----------
const P = (ctx, x, y, c, w = 1, h = 1) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };

function faceTex(cfg, closed) {
  const eye = OPTIONS.eyeColor[cfg.eyeColor];
  const brow = shade(OPTIONS.hairColor[cfg.hairColor], -0.12);
  const skin = OPTIONS.skin[cfg.skin];
  return canvasTex(24, 24, (ctx) => {
    for (const ex of [5, 15]) {
      P(ctx, ex, 7, brow, 4, 1); // sobrancelha
      if (closed) {
        P(ctx, ex, 13, '#2a1d24', 4, 1);
        P(ctx, ex - 1, 12, '#2a1d24', 1, 1);
        P(ctx, ex + 4, 12, '#2a1d24', 1, 1);
      } else {
        P(ctx, ex, 10, '#2a1d24', 4, 1); // cílios
        P(ctx, ex - 1, 11, '#2a1d24', 1, 1);
        P(ctx, ex, 11, '#ffffff', 4, 4);
        P(ctx, ex + (ex < 12 ? 1 : 0), 11, eye, 3, 4);
        P(ctx, ex + (ex < 12 ? 2 : 1), 12, '#1c1420', 2, 3);
        P(ctx, ex + (ex < 12 ? 1 : 0), 11, '#ffffff', 2, 1); // brilho
        P(ctx, ex + (ex < 12 ? 3 : 2), 14, shade(eye, 0.2), 1, 1);
      }
    }
    // bochechas
    ctx.globalAlpha = 0.55;
    P(ctx, 3, 16, '#ff7d8f', 3, 2);
    P(ctx, 18, 16, '#ff7d8f', 3, 2);
    ctx.globalAlpha = 1;
    // boquinha
    P(ctx, 11, 18, '#8a3b3b', 2, 1);
    P(ctx, 10, 17, '#8a3b3b', 1, 1);
    P(ctx, 13, 17, '#8a3b3b', 1, 1);
    P(ctx, 11, 19, shade(skin, -0.08), 2, 1);
  });
}

function torsoTex(cfg, side) {
  const shirt = OPTIONS.shirtColor[cfg.shirtColor], pants = OPTIONS.pantsColor[cfg.pantsColor];
  const sD = shade(shirt, -0.1), sL = shade(shirt, 0.08), pD = shade(pants, -0.1), pL = shade(pants, 0.1);
  return canvasTex(16, 14, (ctx) => {
    P(ctx, 0, 0, shirt, 16, 14);
    P(ctx, 0, 0, sL, 16, 1);
    for (let i = 0; i < 6; i++) P(ctx, (i * 7 + 3) % 16, (i * 5 + 2) % 14, sD);
    if (cfg.outfit === 2) for (let y = 2; y < 14; y += 4) P(ctx, 0, y, sD, 16, 2);
    if (cfg.outfit === 0) {
      // macacão
      if (side === 'front') {
        P(ctx, 3, 0, pants, 2, 5); P(ctx, 11, 0, pants, 2, 5);
        P(ctx, 3, 5, pants, 10, 9);
        P(ctx, 3, 5, pL, 10, 1);
        P(ctx, 4, 5, '#f6cf57', 1, 1); P(ctx, 11, 5, '#f6cf57', 1, 1);
        P(ctx, 6, 8, pD, 4, 1); P(ctx, 6, 8, pD, 1, 3); P(ctx, 9, 8, pD, 1, 3); P(ctx, 6, 11, pD, 4, 1);
        P(ctx, 0, 11, pants, 16, 3);
      } else if (side === 'back') {
        P(ctx, 3, 0, pants, 2, 3); P(ctx, 11, 0, pants, 2, 3);
        P(ctx, 5, 3, pants, 2, 2); P(ctx, 9, 3, pants, 2, 2); P(ctx, 7, 5, pants, 2, 2);
        P(ctx, 0, 8, pants, 16, 6); P(ctx, 0, 8, pL, 16, 1);
      } else {
        P(ctx, 0, 9, pants, 16, 5); P(ctx, 0, 9, pL, 16, 1);
      }
    } else if (side === 'front') {
      // gola + estampa
      P(ctx, 6, 0, shade(OPTIONS.skin[cfg.skin], -0.05), 4, 1);
      P(ctx, 5, 0, sD, 1, 2); P(ctx, 10, 0, sD, 1, 2); P(ctx, 6, 1, sD, 4, 1);
      if (cfg.outfit === 1) {
        const h = '#ffffff';
        P(ctx, 6, 5, h, 2, 1); P(ctx, 9, 5, h, 2, 1); P(ctx, 5, 6, h, 7, 2); P(ctx, 6, 8, h, 5, 1); P(ctx, 7, 9, h, 3, 1); P(ctx, 8, 10, h, 1, 1);
      }
    }
  });
}

// ---------- animações ----------
function eulerTrack(name, dur, n, fn) {
  const times = [], vals = [], e = new THREE.Euler(), q = new THREE.Quaternion();
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const v = fn(t);
    e.set(v[0], v[1], v[2], 'YXZ');
    q.setFromEuler(e);
    times.push(t * dur);
    vals.push(q.x, q.y, q.z, q.w);
  }
  return new THREE.QuaternionKeyframeTrack(name + '.quaternion', times, vals);
}
function vecTrack(name, prop, dur, n, fn) {
  const times = [], vals = [];
  for (let i = 0; i <= n; i++) { times.push((i / n) * dur); vals.push(...fn(i / n)); }
  return new THREE.VectorKeyframeTrack(`${name}.${prop}`, times, vals);
}

function idleClip(name, cycles, headLook) {
  const dur = IDLE_DUR * cycles, n = 24 * cycles;
  const s = (t, ph = 0) => Math.sin(TAU * t * cycles + ph);
  const look = headLook || (() => 0);
  return new THREE.AnimationClip(name, dur, [
    vecTrack('hips', 'position', dur, n, (t) => [0, HIP_Y + 0.006 * s(t), 0]),
    eulerTrack('hips', dur, n, (t) => [0, look(t) * 0.12, 0.012 * s(t, 1.3)]),
    vecTrack('torso', 'scale', dur, n, (t) => [1 + 0.018 * s(t), 1 + 0.03 * s(t), 1 + 0.035 * s(t)]),
    eulerTrack('torso', dur, n, (t) => [0.02 * s(t, 1), look(t) * 0.2, 0]),
    eulerTrack('head', dur, n, (t) => [0.035 * s(t, -0.7) - Math.abs(look(t)) * 0.06, look(t) * 0.62, 0.028 * s(t, 0.5)]),
    eulerTrack('armL', dur, n, (t) => [0.05 * s(t, 0.4), 0, ARM_Z + 0.05 * s(t)]),
    eulerTrack('armR', dur, n, (t) => [0.05 * s(t, 0.9), 0, -ARM_Z - 0.05 * s(t)]),
    eulerTrack('foreArmL', dur, n, (t) => [-0.14 - 0.03 * s(t), 0, 0]),
    eulerTrack('foreArmR', dur, n, (t) => [-0.14 - 0.03 * s(t), 0, 0]),
    eulerTrack('legL', dur, n, () => [0, 0, 0.02]),
    eulerTrack('legR', dur, n, () => [0, 0, -0.02]),
    eulerTrack('shinL', dur, n, () => [0, 0, 0]),
    eulerTrack('shinR', dur, n, () => [0, 0, 0]),
  ]);
}

// olhadinha pros lados (suave, com pausas)
function lookAround(t) {
  const k = [[0, 0], [0.12, 0], [0.24, 1], [0.42, 1], [0.58, -1], [0.78, -1], [0.9, 0], [1, 0]];
  for (let i = 0; i < k.length - 1; i++) {
    if (t <= k[i + 1][0]) {
      let u = (t - k[i][0]) / (k[i + 1][0] - k[i][0]);
      u = u * u * (3 - 2 * u);
      return k[i][1] + (k[i + 1][1] - k[i][1]) * u;
    }
  }
  return 0;
}

function gaitClip(name, dur, g) {
  const n = 24;
  const leg = (ph) => (t) => [-g.leg * Math.sin(TAU * t + ph) - g.lean * 0.4, 0, 0];
  const shin = (ph) => (t) => [0.08 + g.knee * Math.max(0, Math.cos(TAU * t + ph)) ** 1.4, 0, 0];
  const arm = (ph, sgn) => (t) => [g.arm * Math.sin(TAU * t + ph), 0, sgn * (ARM_Z + g.armOut)];
  const fore = (ph) => (t) => [-g.elbow - 0.35 * Math.max(0, -Math.sin(TAU * t + ph)), 0, 0];
  return new THREE.AnimationClip(name, dur, [
    vecTrack('hips', 'position', dur, n, (t) => [0, HIP_Y - g.bob + g.bob * Math.cos(TAU * t * 2), 0]),
    eulerTrack('hips', dur, n, (t) => [0, g.twist * Math.sin(TAU * t), 0.035 * Math.sin(TAU * t)]),
    vecTrack('torso', 'scale', dur, n, () => [1, 1, 1]),
    eulerTrack('torso', dur, n, (t) => [g.lean, -g.twist * 1.7 * Math.sin(TAU * t), -0.03 * Math.sin(TAU * t)]),
    eulerTrack('head', dur, n, (t) => [-g.lean * 0.55 + 0.03 * Math.cos(TAU * t * 2), g.twist * 0.7 * Math.sin(TAU * t), 0.02 * Math.sin(TAU * t)]),
    eulerTrack('armL', dur, n, arm(0, 1)),
    eulerTrack('armR', dur, n, arm(Math.PI, -1)),
    eulerTrack('foreArmL', dur, n, fore(0)),
    eulerTrack('foreArmR', dur, n, fore(Math.PI)),
    eulerTrack('legL', dur, n, leg(0)),
    eulerTrack('legR', dur, n, leg(Math.PI)),
    eulerTrack('shinL', dur, n, shin(0)),
    eulerTrack('shinR', dur, n, shin(Math.PI)),
  ]);
}

let _clips;
function clips() {
  if (_clips) return _clips;
  _clips = {
    idle: idleClip('idle', 1),
    look: idleClip('look', 2, lookAround),
    walk: gaitClip('walk', WALK_DUR, { leg: 0.62, knee: 0.95, arm: 0.55, armOut: 0, elbow: 0.25, lean: 0.05, bob: 0.014, twist: 0.09 }),
    run: gaitClip('run', RUN_DUR, { leg: 1.0, knee: 1.55, arm: 1.1, armOut: 0.08, elbow: 1.15, lean: 0.24, bob: 0.03, twist: 0.15 }),
  };
  return _clips;
}

// ---------- montagem ----------
const rb = (w, h, d, r = 0.05, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, r);

export class Character {
  constructor(cfg) {
    this.group = new THREE.Group();
    const J = (name, parent, x, y, z) => {
      const o = new THREE.Object3D();
      o.name = name;
      o.position.set(x, y, z);
      parent.add(o);
      return o;
    };
    const j = (this.j = {});
    j.hips = J('hips', this.group, 0, HIP_Y, 0);
    j.torso = J('torso', j.hips, 0, 0.06, 0);
    j.head = J('head', j.torso, 0, 0.38, 0);
    j.armL = J('armL', j.torso, 0.27, 0.31, 0);
    j.armR = J('armR', j.torso, -0.27, 0.31, 0);
    j.foreArmL = J('foreArmL', j.armL, 0, -0.17, 0);
    j.foreArmR = J('foreArmR', j.armR, 0, -0.17, 0);
    j.legL = J('legL', j.hips, 0.11, -0.04, 0);
    j.legR = J('legR', j.hips, -0.11, -0.04, 0);
    j.shinL = J('shinL', j.legL, 0, -0.18, 0);
    j.shinR = J('shinR', j.legR, 0, -0.18, 0);

    this.meshes = [];
    this.mixer = new THREE.AnimationMixer(this.group);
    const c = clips();
    this.act = {};
    for (const k in c) {
      const a = this.mixer.clipAction(c[k]);
      a.play();
      a.setEffectiveWeight(k === 'idle' ? 1 : 0);
      this.act[k] = a;
    }
    this.act.walk.timeScale = 0;
    this.act.run.timeScale = 0;
    this.w = { idle: 1, look: 0, walk: 0, run: 0 };
    this.phase = 0;
    this.idleTime = 0;
    this.nextLook = 5 + Math.random() * 4;
    this.looking = 0;
    this.blinkT = 2;
    this.blinkHold = 0;
    this.setConfig(cfg);
    this.mixer.update(0);
  }

  setConfig(cfg) {
    this.cfg = { ...cfg };
    this.faceOpen?.dispose();
    this.faceClosed?.dispose();
    for (const m of this.meshes) {
      m.parent.remove(m);
      m.geometry.dispose();
      for (const mat of [].concat(m.material)) {
        if (mat.map && mat.map !== noiseTex()) mat.map.dispose();
        mat.dispose();
      }
    }
    this.meshes = [];
    const j = this.j, noise = noiseTex();
    const add = (parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      m.castShadow = true;
      parent.add(m);
      this.meshes.push(m);
      return m;
    };
    const flat = (c) => cozyMat({ color: c, map: noise });
    const skinC = OPTIONS.skin[cfg.skin], hairC = OPTIONS.hairColor[cfg.hairColor];
    const shirtC = OPTIONS.shirtColor[cfg.shirtColor], pantsC = OPTIONS.pantsColor[cfg.pantsColor];
    const shoeC = '#6b4630';

    // tronco (cada lado da caixa com sua textura)
    const tSide = cozyMat({ map: torsoTex(cfg, 'side') });
    add(j.torso, rb(0.44, 0.4, 0.31, 0.09), [tSide, tSide.clone(), flat(shirtC), flat(pantsC), cozyMat({ map: torsoTex(cfg, 'front') }), cozyMat({ map: torsoTex(cfg, 'back') })], 0, 0.19, 0);
    add(j.hips, rb(0.42, 0.2, 0.3, 0.08), flat(pantsC), 0, 0, 0);

    for (const s of ['L', 'R']) {
      const leg = j['leg' + s], shin = j['shin' + s], arm = j['arm' + s], fore = j['foreArm' + s];
      add(leg, rb(0.18, 0.24, 0.2, 0.06), flat(pantsC), 0, -0.08, 0);
      add(shin, rb(0.165, 0.16, 0.18, 0.05), flat(pantsC), 0, -0.06, 0);
      add(shin, rb(0.2, 0.11, 0.3, 0.05), flat(shoeC), 0, -0.165, 0.04);
      add(arm, rb(0.15, 0.22, 0.16, 0.06), flat(shirtC), 0, -0.07, 0);
      add(fore, rb(0.12, 0.16, 0.13, 0.05), flat(skinC), 0, -0.06, 0);
      add(fore, rb(0.14, 0.13, 0.15, 0.06), flat(skinC), 0, -0.17, 0);
    }

    // cabeça
    const hy = 0.33;
    add(j.head, rb(0.74, 0.66, 0.66, 0.2, 3), flat(skinC), 0, hy, 0);
    add(j.head, rb(0.08, 0.14, 0.12, 0.035, 1), flat(skinC), 0.385, hy - 0.04, 0);
    add(j.head, rb(0.08, 0.14, 0.12, 0.035, 1), flat(skinC), -0.385, hy - 0.04, 0);
    this.faceOpen = faceTex(cfg, false);
    this.faceClosed = faceTex(cfg, true);
    this.face = add(j.head, new THREE.PlaneGeometry(0.6, 0.6), cozyMat({ map: this.faceOpen, alphaTest: 0.4, rim: 0 }), 0, hy, 0.334);
    this.face.castShadow = false;

    // cabelo
    const hm = () => flat(hairC);
    const hat = cfg.hat;
    const H = (geo, x, y, z, rx, ry, rz) => add(j.head, geo, hm(), x, y, z, rx, ry, rz);
    const sph = (r) => new THREE.SphereGeometry(r, 8, 6);
    if (cfg.hair === 6) {
      // cacheado: nuvem de cachos
      const pts = [[0, 0.66, 0], [0.26, 0.62, 0.1], [-0.26, 0.62, 0.1], [0.24, 0.6, -0.2], [-0.24, 0.6, -0.2], [0, 0.6, -0.3], [0.38, 0.42, -0.05], [-0.38, 0.42, -0.05], [0.3, 0.36, -0.3], [-0.3, 0.36, -0.3], [0, 0.36, -0.38], [0, 0.6, 0.28], [0.22, 0.55, 0.3], [-0.22, 0.55, 0.3]];
      pts.forEach((p, i) => H(sph(0.2 + (i % 3) * 0.015), p[0], p[1] - (hat ? 0.04 : 0), p[2]));
    } else {
      H(rb(0.8, 0.3, 0.72, 0.13), 0, hy + 0.22, -0.01);
      H(rb(0.8, 0.46, 0.24, 0.1), 0, hy + 0.06, -0.27);
      // franja em 3 mechas
      H(rb(0.26, 0.17, 0.1, 0.04), -0.23, hy + 0.2, 0.31);
      H(rb(0.24, 0.12, 0.1, 0.04), 0.01, hy + 0.225, 0.315);
      H(rb(0.26, 0.19, 0.1, 0.04), 0.24, hy + 0.19, 0.31);
      H(rb(0.09, 0.3, 0.24, 0.04), 0.375, hy + 0.1, 0.08);
      H(rb(0.09, 0.3, 0.24, 0.04), -0.375, hy + 0.1, 0.08);
      if (cfg.hair === 1) {
        H(rb(0.8, 0.8, 0.2, 0.09), 0, hy - 0.2, -0.29);
        H(rb(0.11, 0.62, 0.26, 0.05), 0.385, hy - 0.14, -0.08);
        H(rb(0.11, 0.62, 0.26, 0.05), -0.385, hy - 0.14, -0.08);
      } else if (cfg.hair === 2) {
        for (const sx of [1, -1]) {
          add(j.head, rb(0.1, 0.08, 0.1, 0.03, 1), flat('#f08fb4'), sx * 0.43, hy + 0.08, -0.08);
          const p = H(sph(0.19), sx * 0.53, hy - 0.08, -0.08, 0, 0, sx * 0.25);
          p.scale.set(0.9, 1.5, 0.9);
        }
      } else if (cfg.hair === 3) {
        add(j.head, rb(0.14, 0.1, 0.1, 0.03, 1), flat('#f08fb4'), 0, hy + 0.2, -0.4);
        const p = H(sph(0.17), 0, hy - 0.02, -0.5, 0.35, 0, 0);
        p.scale.set(0.9, 1.9, 0.85);
      } else if (cfg.hair === 4 && !hat) {
        const sp = [[0, 0.74, 0.05, 0.1, 0], [0.22, 0.7, 0, 0, -0.5], [-0.22, 0.7, 0, 0, 0.5], [0.1, 0.72, -0.2, -0.5, -0.2], [-0.1, 0.72, -0.2, -0.5, 0.2], [0, 0.68, 0.24, 0.7, 0]];
        for (const s of sp) H(new THREE.ConeGeometry(0.13, 0.3, 5), s[0], s[1], s[2], s[3], 0, s[4]);
      } else if (cfg.hair === 5 && !hat) {
        H(sph(0.2), 0, hy + 0.46, -0.12);
      }
    }

    if (hat === 1) {
      const straw = cozyMat({ color: '#f0d07a', map: noise });
      add(j.head, new THREE.CylinderGeometry(0.64, 0.66, 0.045, 14), straw, 0, hy + 0.3, 0, 0.04);
      add(j.head, new THREE.CylinderGeometry(0.3, 0.36, 0.24, 12), straw.clone(), 0, hy + 0.42, 0, 0.04);
      add(j.head, new THREE.CylinderGeometry(0.368, 0.372, 0.07, 12), flat('#d9534a'), 0, hy + 0.35, 0, 0.04);
    } else if (hat === 2) {
      const cap = flat(shade(OPTIONS.shirtColor[cfg.shirtColor], -0.12));
      const dome = add(j.head, new THREE.SphereGeometry(0.41, 10, 6, 0, TAU, 0, Math.PI / 2), cap, 0, hy + 0.2, -0.01);
      dome.scale.set(1, 0.7, 0.95);
      add(j.head, rb(0.5, 0.045, 0.3, 0.02, 1), cap.clone(), 0, hy + 0.23, 0.42, 0.12);
    }
  }

  // speed em unidades/s; walkSpeed/runSpeed dizem como misturar caminhada e corrida
  update(dt, speed = 0, walkSpeed = 1.9, runSpeed = 4.2) {
    const w = this.w;
    const moving = speed > 0.08;
    const runMix = THREE.MathUtils.clamp((speed - walkSpeed) / (runSpeed - walkSpeed), 0, 1);
    const move = THREE.MathUtils.clamp(speed / (walkSpeed * 0.6), 0, 1);

    if (moving) {
      this.idleTime = 0;
      this.looking = 0;
    } else {
      this.idleTime += dt;
      if (this.looking > 0) {
        this.looking -= dt;
        if (this.looking <= 0) { this.idleTime = 0; this.nextLook = 5 + Math.random() * 6; }
      } else if (this.idleTime > this.nextLook) {
        this.looking = IDLE_DUR * 2;
        this.act.look.time = 0;
      }
    }
    const lookW = this.looking > 0.35 ? 1 : 0;
    const target = { idle: (1 - move) * (1 - lookW), look: (1 - move) * lookW, walk: move * (1 - runMix), run: move * runMix };
    const k = 1 - Math.exp(-dt * 9);
    for (const n in w) {
      w[n] += (target[n] - w[n]) * (n === 'look' ? 1 - Math.exp(-dt * 4) : k);
      this.act[n].setEffectiveWeight(w[n]);
    }
    // caminhada e corrida compartilham a mesma fase, então a mistura não "tropeça"
    const dur = THREE.MathUtils.lerp(WALK_DUR, RUN_DUR, runMix);
    const rate = moving ? THREE.MathUtils.clamp(speed / THREE.MathUtils.lerp(walkSpeed, runSpeed, runMix), 0.55, 1.3) : 1;
    this.phase = (this.phase + (dt / dur) * rate) % 1;
    this.act.walk.time = this.phase * WALK_DUR;
    this.act.run.time = this.phase * RUN_DUR;
    this.mixer.update(dt);

    // piscar
    this.blinkT -= dt;
    if (this.blinkHold > 0) {
      this.blinkHold -= dt;
      if (this.blinkHold <= 0) this.face.material.map = this.faceOpen;
    } else if (this.blinkT <= 0) {
      this.face.material.map = this.faceClosed;
      this.blinkHold = 0.11;
      this.blinkT = Math.random() < 0.2 ? 0.28 : 2 + Math.random() * 3.5;
    }
  }
}
