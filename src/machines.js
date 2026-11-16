// Máquinas: modelos detalhados em cel shading, dirigibilidade, hidráulica e interação com o solo.
import * as THREE from 'three';
import { clamp, lerp, approach } from './util.js';
import {
  H, LOOSE, ROCK, GRASS, MAT as MATID, MATS, CELL, CA, HALF, G, WATER_Y,
  heightAt, toG, toW, deposit, dirty, wake, tread, grainTex,
} from './terrain.js';
import { spawn, puff } from './particles.js';
import { MAT, toon, rbox, part, cylGeo, axleGeo, fenderGeo, arcStrip, plateGeo, wheelGroup, Piston, anchor, bake, outline } from './gfx.js';

/* ---------- especificações ---------- */
export const MACHINES = {
  loader: {
    name: 'Carregadeira de rodas', short: 'Carregadeira', kind: 'loader', price: 0,
    maxSpeed: 6.5, accel: 3.2, brake: 8, power: 5, wb: 3, maxSteer: 0.62, cap: 2.2,
    contacts: { f: 1.5, b: -1.5, x: 1.18 }, circles: [[-1.9, 1.45], [0.5, 1.45]],
    desc: 'Caçamba de 2,2 m³. Chassi articulado, ágil e alta o bastante para carregar caminhão.',
    stats: { Caçamba: '2,2 m³', Velocidade: '23 km/h', Força: 'Média' },
  },
  truck: {
    name: 'Caminhão basculante', short: 'Caminhão', kind: 'truck', price: 0,
    maxSpeed: 10, accel: 3.4, brake: 9, power: 1, wb: 4.6, maxSteer: 0.55, cap: 9,
    contacts: { f: 2.6, b: -2.1, x: 1.05 }, circles: [[2.5, 1.35], [0.2, 1.35], [-2.3, 1.35]],
    desc: 'Báscula de 9 m³. Leva material longe e despeja por trás.',
    stats: { Báscula: '9 m³', Velocidade: '36 km/h', Força: '—' },
  },
  skid: {
    name: 'Minicarregadeira', short: 'Mini', kind: 'skid', price: 2200,
    maxSpeed: 4.8, accel: 4.5, brake: 10, power: 2.4, tank: true, turnRate: 1.9, cap: 0.7,
    contacts: { f: 0.6, b: -0.6, x: 0.78 }, circles: [[0, 1.25]],
    desc: 'Pequena e precisa. Gira no próprio eixo, ótima para acabamento e espaços apertados.',
    stats: { Caçamba: '0,7 m³', Velocidade: '17 km/h', Força: 'Baixa' },
  },
  dozer: {
    name: 'Trator de esteira', short: 'Esteira', kind: 'dozer', price: 4800,
    maxSpeed: 3.4, accel: 2.2, brake: 7, power: 16, tank: true, turnRate: 0.85,
    contacts: { f: 1.6, b: -1.6, x: 1.22 }, circles: [[1.0, 1.75], [-1.1, 1.75]],
    desc: 'Lâmina de 3,7 m e força bruta. Empurra montanhas de terra e nivela áreas grandes.',
    stats: { Lâmina: '3,7 m', Velocidade: '12 km/h', Força: 'Muito alta' },
  },
};

/* ---------- modelos ---------- */
const heapGeo = new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2);
{
  // relevo irregular no monte da carga
  const p = heapGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y > 0.05) {
      const n = Math.sin(p.getX(i) * 9.1) * Math.cos(p.getZ(i) * 7.3) * 0.08;
      p.setY(i, y * (1 + n));
    }
  }
  heapGeo.computeVertexNormals();
}
function heap(parent, x, y, z) {
  const m = new THREE.Mesh(heapGeo, toon({ map: grainTex }, true));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.visible = false;
  m.userData.keep = true;
  m.userData.noOutline = true;
  parent.add(m);
  return m;
}

// cabine com estrutura, vidros, teto, giroflex e interior
function cab(parent, w, h, d, x, y, z, opts = {}) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  const shell = new THREE.Group();
  g.add(shell);
  const b = 0.28;
  part(g, rbox(w, b, d, 0.05), MAT.paint, 0, b / 2, 0);
  // colunas
  const t = 0.1;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(shell, rbox(t, h, t, 0.03), MAT.black, sx * (w / 2 - t / 2), b + h / 2, sz * (d / 2 - t / 2));
  for (const sz of [-1, 1]) part(shell, rbox(w, 0.08, 0.08, 0.02), MAT.black, 0, b + h * 0.42, sz * (d / 2 - 0.04));
  // teto com aba
  part(shell, rbox(w + 0.22, 0.17, d + 0.28, 0.07), MAT.paint, 0, b + h + 0.08, 0.04);
  part(shell, rbox(w - 0.1, 0.06, d - 0.1, 0.02), MAT.black, 0, b + h - 0.01, 0);
  // vidros
  part(shell, new THREE.BoxGeometry(w - 0.12, h - 0.1, 0.03), MAT.glass, 0, b + h / 2, d / 2 - 0.04);
  part(shell, new THREE.BoxGeometry(w - 0.12, h - 0.1, 0.03), MAT.glass, 0, b + h / 2, -d / 2 + 0.04);
  for (const sx of [-1, 1]) part(shell, new THREE.BoxGeometry(0.03, h - 0.1, d - 0.12), MAT.glass, sx * (w / 2 - 0.04), b + h / 2, 0);
  // limpador
  part(shell, new THREE.BoxGeometry(0.03, 0.55, 0.02), MAT.black, w * 0.12, b + h * 0.35, d / 2 + 0.005, 0, 0, 0.5);
  // giroflex + faróis de trabalho
  const bx = w / 2 - 0.22, bz = -d / 2 + 0.25;
  part(shell, cylGeo(0.07, 0.09, 0.06, 10), MAT.black, bx, b + h + 0.19, bz);
  part(shell, cylGeo(0.075, 0.075, 0.13, 10), MAT.beacon, bx, b + h + 0.28, bz);
  for (const sx of [-1, 1]) {
    part(shell, rbox(0.2, 0.12, 0.1, 0.03), MAT.black, sx * (w / 2 - 0.18), b + h + 0.22, d / 2 + 0.06);
    part(shell, new THREE.BoxGeometry(0.15, 0.08, 0.02), MAT.lamp, sx * (w / 2 - 0.18), b + h + 0.22, d / 2 + 0.115);
    part(shell, rbox(0.2, 0.12, 0.1, 0.03), MAT.black, sx * (w / 2 - 0.18), b + h + 0.22, -d / 2 - 0.06);
    part(shell, new THREE.BoxGeometry(0.15, 0.08, 0.02), MAT.lamp, sx * (w / 2 - 0.18), b + h + 0.22, -d / 2 - 0.115);
    // retrovisores
    if (!opts.noMirror) {
      part(shell, cylGeo(0.018, 0.018, 0.45, 6), MAT.black, sx * (w / 2 + 0.2), b + h * 0.75, d / 2 - 0.05, 0, 0, sx * 1.2);
      part(shell, rbox(0.05, 0.28, 0.2, 0.02), MAT.black, sx * (w / 2 + 0.4), b + h * 0.68, d / 2 - 0.05);
    }
  }
  // interior
  const seatZ = -d * 0.12;
  part(g, rbox(0.55, 0.14, 0.5, 0.05), MAT.seat, 0, b + 0.42, seatZ);
  part(g, rbox(0.55, 0.62, 0.13, 0.05), MAT.seat, 0, b + 0.78, seatZ - 0.26, -0.12);
  part(g, cylGeo(0.06, 0.08, 0.35, 8), MAT.black, 0, b + 0.2, seatZ);
  for (const sx of [-1, 1]) part(g, rbox(0.16, 0.5, 0.5, 0.04), MAT.black, sx * 0.38, b + 0.3, seatZ + 0.1);
  part(g, cylGeo(0.02, 0.02, 0.16, 6), MAT.black, 0.38, b + 0.62, seatZ + 0.22);
  part(g, new THREE.SphereGeometry(0.045, 8, 6), MAT.paint, 0.38, b + 0.71, seatZ + 0.22);
  part(g, rbox(w - 0.35, 0.32, 0.22, 0.04), MAT.black, 0, b + 0.55, d / 2 - 0.2);
  const scr = part(g, new THREE.BoxGeometry(0.3, 0.17, 0.02), MAT.screen, w * 0.18, b + 0.78, d / 2 - 0.25, -0.5);
  scr.castShadow = false;
  if (opts.wheel) {
    part(g, cylGeo(0.03, 0.03, 0.4, 6), MAT.black, 0, b + 0.72, d / 2 - 0.35, -0.6);
    part(g, new THREE.TorusGeometry(0.17, 0.025, 6, 16), MAT.black, 0, b + 0.88, d / 2 - 0.45, -0.95);
  }
  const seat = new THREE.Object3D();
  seat.position.set(0, b + 1.15, seatZ + 0.05);
  g.add(seat);
  bake(shell, new Set());
  bake(g);
  const hide = [shell];
  return { g, hide, seat };
}

// caçamba curva com chapas laterais, lâmina de desgaste e dentes
function bucketModel(parent, W, s, armX) {
  const b = new THREE.Group();
  parent.add(b);
  const S = (pts) => pts.map(([z, y]) => [z * s, y * s]);
  const contour = [[1.05, -0.55], [0.0, -0.55]];
  for (let i = 1; i <= 6; i++) {
    const a = -Math.PI / 2 - (i / 6) * (Math.PI / 2);
    contour.push([0.0 + Math.cos(a) * 0.45, -0.1 + Math.sin(a) * 0.45]);
  }
  contour.push([-0.4, 0.28], [-0.2, 0.47], [0.12, 0.5]);
  const C = S(contour);
  part(b, arcStrip(C, W, 0.07), MAT.paint);
  part(b, arcStrip(S(contour.map(([z, y]) => [z + 0.03, y + 0.035])).slice(0, -1), W - 0.14, 0.02), MAT.paintDark);
  const side = S([...contour, [0.45, 0.2]]);
  for (const sx of [-1, 1]) {
    part(b, plateGeo(side, 0.07), MAT.paint, sx * (W / 2 - 0.035), 0, 0);
    part(b, rbox(0.1, 0.12, 0.9 * s, 0.03), MAT.edge, sx * (W / 2 + 0.01), -0.5 * s, 0.6 * s, 0.35);
  }
  part(b, rbox(W + 0.06, 0.08, 0.24 * s, 0.025), MAT.edge, 0, -0.55 * s, 1.03 * s);
  const n = Math.max(5, Math.round(W / 0.33));
  const tooth = new THREE.ConeGeometry(0.075 * Math.max(s, 0.75), 0.2 * s + 0.04, 4).rotateX(Math.PI / 2).rotateZ(Math.PI / 4);
  tooth.scale(1, 0.55, 1);
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + 0.18 + (i * (W - 0.36)) / (n - 1);
    part(b, tooth, MAT.edge, x, -0.55 * s, 1.15 * s + 0.02);
    part(b, rbox(0.13, 0.1, 0.16, 0.02), MAT.steel, x, -0.55 * s, 1.07 * s);
  }
  // reforços e orelhas de articulação
  part(b, rbox(W * 0.86, 0.14, 0.12, 0.04), MAT.paintDark, 0, 0.1 * s, -0.48 * s);
  part(b, rbox(W * 0.86, 0.14, 0.12, 0.04), MAT.paintDark, 0, -0.32 * s, -0.42 * s);
  for (const sx of [-1, 1]) part(b, rbox(0.12, 0.5 * s, 0.4 * s, 0.03), MAT.frame, sx * armX, 0.0, -0.42 * s);
  part(b, rbox(0.3, 0.42 * s, 0.32 * s, 0.03), MAT.frame, 0, 0.42 * s, -0.36 * s);
  return b;
}

function buildLoader(kind) {
  const big = kind === 'loader';
  const P = big
    ? { R: 0.86, W: 0.7, TX: 1.2, ZF: 1.5, ZR: -1.5, piv: [0, 1.95, 1.35], L: 2.6, ax: 0.8, BW: 2.9, bs: 1, liftMax: 0.86, edgeMin: -0.32 }
    : { R: 0.43, W: 0.4, TX: 0.8, ZF: 0.6, ZR: -0.6, piv: [0, 1.62, -0.8], L: 2.45, ax: 0.88, BW: 1.85, bs: 0.66, liftMax: 0.78, edgeMin: -0.24 };
  const root = new THREE.Group();
  const front = new THREE.Group(), rear = new THREE.Group();
  root.add(front, rear);
  const wheels = [];
  for (const [x, z, par] of [[P.TX, P.ZF, front], [-P.TX, P.ZF, front], [P.TX, P.ZR, rear], [-P.TX, P.ZR, rear]]) {
    const w = wheelGroup(P.R, P.W);
    w.position.set(x, P.R, z);
    if (x < 0) w.rotation.y = Math.PI;
    par.add(w);
    wheels.push(w);
  }
  const arm = new THREE.Group();
  arm.position.set(...P.piv);
  let cabin;
  const pistonDefs = [];
  if (big) {
    // ---------- traseira ----------
    part(rear, rbox(1.25, 0.55, 3.0, 0.08), MAT.frame, 0, 1.0, -1.75);
    part(rear, axleGeo(0.24, 2.0), MAT.frame, 0, P.R, P.ZR);
    part(rear, rbox(1.9, 1.08, 2.3, 0.16), MAT.paint, 0, 1.9, -2.45);
    part(rear, rbox(1.72, 0.2, 2.15, 0.08), MAT.paint, 0, 2.48, -2.5, 0.05);
    part(rear, rbox(1.35, 0.06, 1.4, 0.02), MAT.grille, 0, 2.6, -2.75, 0.05);
    for (const sx of [-1, 1]) {
      part(rear, new THREE.BoxGeometry(0.02, 0.56, 1.3), MAT.grille, sx * 0.955, 1.98, -2.75);
      const lg = part(rear, new THREE.PlaneGeometry(1.2, 0.3), MAT.logo, sx * 0.957, 1.55, -2.25, 0, sx * Math.PI / 2, 0);
      lg.castShadow = false;
      part(rear, fenderGeo(P.R + 0.12, 0.82, Math.PI * 0.9), MAT.paint, sx * P.TX, P.R, P.ZR);
      part(rear, rbox(0.84, 0.08, 0.5, 0.03), MAT.paint, sx * P.TX, P.R + 0.2, P.ZR - 0.95, 0.9);
      // corrimão no capô
      part(rear, cylGeo(0.022, 0.022, 1.7, 6), MAT.black, sx * 0.72, 2.75, -2.45, Math.PI / 2);
      for (const zz of [-1.65, -3.25]) part(rear, cylGeo(0.022, 0.022, 0.18, 6), MAT.black, sx * 0.72, 2.66, zz);
      part(rear, rbox(0.24, 0.15, 0.06, 0.03), MAT.tail, sx * 0.88, 1.6, -4.06);
      part(rear, rbox(0.24, 0.15, 0.06, 0.03), MAT.black, sx * 0.88, 1.6, -4.04);
    }
    // contrapeso com faixa de advertência
    part(rear, rbox(2.38, 0.95, 0.65, 0.2), MAT.paint, 0, 1.45, -3.72);
    part(rear, new THREE.BoxGeometry(1.5, 0.22, 0.02), MAT.hazard, 0, 1.4, -4.055);
    part(rear, new THREE.BoxGeometry(1.25, 0.55, 0.02), MAT.grille, 0, 2.1, -3.605);
    part(rear, rbox(0.45, 0.12, 0.2, 0.04), MAT.black, 0, 1.0, -4.0);
    // escapamento e pré-filtro
    part(rear, cylGeo(0.075, 0.085, 0.95, 10), MAT.black, 0.55, 3.0, -1.95);
    part(rear, cylGeo(0.09, 0.09, 0.08, 10), MAT.chrome, 0.55, 3.46, -1.95);
    part(rear, cylGeo(0.13, 0.13, 0.42, 12), MAT.black, -0.55, 2.82, -1.75);
    part(rear, new THREE.SphereGeometry(0.13, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), MAT.black, -0.55, 3.03, -1.75);
    // escada do lado esquerdo
    for (const zz of [-0.15, -0.6]) part(rear, rbox(0.05, 1.3, 0.05, 0.02), MAT.black, 1.08, 0.95, zz);
    for (let i = 0; i < 4; i++) part(rear, rbox(0.06, 0.04, 0.5, 0.01), MAT.steel, 1.08, 0.45 + i * 0.3, -0.38);
    part(rear, rbox(2.05, 0.2, 1.95, 0.05), MAT.frame, 0, 1.42, -0.6);
    cabin = cab(rear, 1.6, 1.62, 1.6, 0, 1.52, -0.6, { wheel: true });
    // ---------- dianteira ----------
    part(front, rbox(1.15, 0.85, 2.15, 0.12), MAT.paint, 0, 1.15, 1.05);
    part(front, axleGeo(0.24, 2.0), MAT.frame, 0, P.R, P.ZF);
    part(front, cylGeo(0.16, 0.16, 0.7, 10), MAT.frame, 0, 1.1, 0.05);
    for (const sx of [-1, 1]) {
      part(front, fenderGeo(P.R + 0.12, 0.82, Math.PI * 0.75), MAT.paint, sx * P.TX, P.R, P.ZF, -0.25);
      part(front, rbox(0.32, 1.0, 0.7, 0.06), MAT.paint, sx * 0.8, 1.6, 1.3);
      part(front, rbox(0.2, 0.14, 0.08, 0.03), MAT.black, sx * 0.62, 1.62, 2.1);
      part(front, new THREE.BoxGeometry(0.14, 0.09, 0.02), MAT.lamp, sx * 0.62, 1.62, 2.145);
    }
    for (const sx of [-1, 1]) pistonDefs.push([front, [sx * 0.6, 0.95, 1.95], arm, [sx * 0.6, -0.34, 1.15], 0.1]);
  } else {
    // ---------- minicarregadeira ----------
    part(root, rbox(1.48, 0.62, 2.05, 0.1), MAT.paint, 0, 0.74, 0);
    part(root, rbox(1.45, 0.9, 0.75, 0.14), MAT.paint, 0, 1.38, -0.86);
    part(root, new THREE.BoxGeometry(1.0, 0.45, 0.02), MAT.grille, 0, 1.4, -1.245);
    part(root, new THREE.BoxGeometry(1.0, 0.16, 0.02), MAT.hazard, 0, 0.72, -1.035);
    for (const sx of [-1, 1]) {
      part(root, rbox(0.22, 1.15, 0.55, 0.06), MAT.paint, sx * P.ax, 1.25, -0.78);
      part(root, rbox(0.18, 0.12, 0.06, 0.03), MAT.tail, sx * 0.55, 1.72, -1.24);
      part(root, new THREE.PlaneGeometry(0.9, 0.22), MAT.logo, sx * 0.745, 0.78, 0.1, 0, sx * Math.PI / 2, 0).castShadow = false;
    }
    part(root, cylGeo(0.06, 0.06, 0.45, 8), MAT.black, 0.45, 2.02, -1.0);
    cabin = cab(root, 1.08, 1.18, 1.15, 0, 0.98, 0.05, { noMirror: true });
    // grade de proteção frontal
    for (let i = -2; i <= 2; i++) part(root, cylGeo(0.015, 0.015, 1.05, 4), MAT.black, i * 0.18, 1.83, 0.64);
    for (const sx of [-1, 1]) pistonDefs.push([root, [sx * P.ax, 0.72, 0.35], arm, [sx * P.ax, -0.2, 0.95], 0.065]);
  }
  // ---------- braço ----------
  (big ? front : root).add(arm);
  for (const sx of [-1, 1]) {
    part(arm, rbox(big ? 0.26 : 0.17, big ? 0.48 : 0.3, P.L + 0.25, 0.08), MAT.paint, sx * P.ax, 0, P.L / 2 - 0.05);
    part(arm, axleGeo(big ? 0.13 : 0.09, big ? 0.36 : 0.26), MAT.frame, sx * P.ax, 0, 0);
    part(arm, axleGeo(big ? 0.12 : 0.08, big ? 0.34 : 0.24), MAT.frame, sx * P.ax, 0, P.L);
  }
  part(arm, axleGeo(big ? 0.17 : 0.1, P.ax * 2), MAT.paint, 0, 0.05, P.L * 0.52);
  if (big) part(arm, rbox(0.26, 0.85, 0.28, 0.06), MAT.paint, 0, 0.35, P.L * 0.52, 0.35);
  const bucket = new THREE.Group();
  bucket.position.set(0, 0, P.L);
  arm.add(bucket);
  const bm = bucketModel(bucket, P.BW, P.bs, P.ax);
  pistonDefs.push([arm, big ? [0, 0.72, P.L * 0.52] : [0, 0.12, P.L * 0.55], bucket, [0, 0.42 * P.bs, -0.36 * P.bs], big ? 0.1 : 0.06]);
  const load = heap(bucket, 0, -0.5 * P.bs, 0.38 * P.bs);
  // fusão e pistões
  for (const grp of [front, rear, arm, root]) bake(grp);
  bake(bm);
  for (const w of wheels) bake(w);
  const pistons = pistonDefs.map(([pa, a, pb, bb, r]) => new Piston(root, anchor(pa, ...a), anchor(pb, ...bb), r));
  const liftMin = Math.asin(clamp((P.edgeMin - P.piv[1] + 0.55 * P.bs) / P.L, -1, 1));
  return {
    root, front, rear, wheels, wheelR: P.R, arm, tool: bucket, heap: load, cabin, pistons,
    tool_: { W: P.BW, heel: new THREE.Vector3(0, -0.55 * P.bs, -0.12 * P.bs), edge: new THREE.Vector3(0, -0.55 * P.bs, 1.05 * P.bs) },
    liftMin, liftMax: P.liftMax, bs: P.bs, BW: P.BW, articulated: big,
  };
}

/* ---------- esteira com sapatas animadas ---------- */
class Track {
  constructor(parent, x) {
    this.zc = 1.42; this.r = 0.44; this.yc = 0.44;
    this.len = 4 * this.zc + 2 * Math.PI * this.r;
    this.n = 44;
    const g = rbox(0.66, 0.08, 0.17, 0.025);
    this.mesh = new THREE.InstancedMesh(g, MAT.black, this.n);
    this.mesh.castShadow = true;
    this.mesh.position.x = x;
    this.mesh.frustumCulled = false;
    parent.add(this.mesh);
    this.s = 0;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._e = new THREE.Euler(); this._one = new THREE.Vector3(1, 1, 1);
    this.update(0);
  }
  point(s) {
    const { zc, r, yc } = this;
    s = ((s % this.len) + this.len) % this.len;
    const L = 2 * zc, A = Math.PI * r;
    if (s < L) return [-zc + s, yc - r, -Math.PI / 2];
    s -= L;
    if (s < A) { const a = -Math.PI / 2 + s / r; return [zc + Math.cos(a) * r, yc + Math.sin(a) * r, a]; }
    s -= A;
    if (s < L) return [zc - s, yc + r, Math.PI / 2];
    s -= L;
    const a = Math.PI / 2 + s / r;
    return [-zc + Math.cos(a) * r, yc + Math.sin(a) * r, a];
  }
  update(ds) {
    this.s -= ds;
    for (let i = 0; i < this.n; i++) {
      const [z, y, a] = this.point(this.s + (i * this.len) / this.n);
      // normal externa = (cos a, sin a) no plano (z,y)
      this._e.set(Math.atan2(Math.cos(a), Math.sin(a)), 0, 0);
      this._q.setFromEuler(this._e);
      this._p.set(0, y + Math.sin(a) * 0.03, z + Math.cos(a) * 0.03);
      this._m.compose(this._p, this._q, this._one);
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

function buildDozer() {
  const root = new THREE.Group();
  const tracks = [];
  for (const sx of [-1, 1]) {
    const x = sx * 1.22;
    part(root, rbox(0.42, 0.5, 2.9, 0.08), MAT.frame, x, 0.46, 0);
    part(root, axleGeo(0.36, 0.42, 16), MAT.steel, x, 0.44, 1.42);
    part(root, axleGeo(0.38, 0.44, 12), MAT.black, x, 0.44, -1.42);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      part(root, rbox(0.4, 0.1, 0.1, 0.02), MAT.black, x, 0.44 + Math.sin(a) * 0.4, -1.42 + Math.cos(a) * 0.4, -a);
    }
    for (let k = 0; k < 5; k++) part(root, axleGeo(0.13, 0.44, 10), MAT.steel, x, 0.15, -0.95 + k * 0.48);
    for (let k = 0; k < 2; k++) part(root, axleGeo(0.09, 0.3, 8), MAT.steel, x, 0.82, -0.5 + k * 1.0);
    part(root, rbox(0.76, 0.07, 3.1, 0.03), MAT.paint, x, 0.98, 0);
    tracks.push(new Track(root, x));
  }
  // corpo e capô
  part(root, rbox(1.75, 0.95, 3.1, 0.12), MAT.paint, 0, 1.4, 0.05);
  part(root, rbox(1.45, 0.8, 1.7, 0.16), MAT.paint, 0, 2.2, 0.9);
  part(root, rbox(1.2, 0.05, 1.3, 0.02), MAT.grille, 0, 2.6, 0.85);
  part(root, new THREE.BoxGeometry(1.15, 0.62, 0.03), MAT.grille, 0, 2.0, 1.76);
  for (const sx of [-1, 1]) {
    part(root, new THREE.BoxGeometry(0.02, 0.45, 1.2), MAT.grille, sx * 0.73, 2.15, 0.95);
    part(root, new THREE.PlaneGeometry(1.25, 0.32), MAT.logo, sx * 0.88, 1.45, 0.25, 0, sx * Math.PI / 2, 0).castShadow = false;
    part(root, rbox(0.2, 0.13, 0.08, 0.03), MAT.black, sx * 0.55, 2.42, 1.78);
    part(root, new THREE.BoxGeometry(0.14, 0.08, 0.02), MAT.lamp, sx * 0.55, 2.42, 1.825);
  }
  part(root, cylGeo(0.08, 0.09, 1.0, 10), MAT.black, 0.42, 3.05, 1.2);
  part(root, cylGeo(0.095, 0.095, 0.07, 10), MAT.chrome, 0.42, 3.55, 1.2);
  part(root, cylGeo(0.13, 0.13, 0.38, 12), MAT.black, -0.42, 2.8, 1.25);
  part(root, rbox(1.85, 0.2, 1.5, 0.05), MAT.frame, 0, 1.92, -0.8);
  const cabin = cab(root, 1.5, 1.48, 1.35, 0, 1.92, -0.8);
  // tanque, escarificador
  part(root, rbox(1.6, 0.55, 0.42, 0.1), MAT.paint, 0, 1.45, -1.72);
  part(root, new THREE.BoxGeometry(1.2, 0.16, 0.02), MAT.hazard, 0, 1.5, -1.935);
  part(root, rbox(1.55, 0.24, 0.32, 0.06), MAT.paint, 0, 0.95, -2.05);
  for (const sx of [-0.45, 0.45]) {
    part(root, rbox(0.14, 0.75, 0.16, 0.03), MAT.steel, sx, 0.62, -2.18);
    part(root, new THREE.ConeGeometry(0.08, 0.22, 4).rotateX(Math.PI), MAT.edge, sx, 0.15, -2.2);
  }
  // braços de empuxo + lâmina
  const arm = new THREE.Group();
  arm.position.set(0, 0.62, 0.3);
  root.add(arm);
  for (const sx of [-1, 1]) {
    part(arm, rbox(0.2, 0.28, 2.45, 0.06), MAT.paint, sx * 1.58, -0.3, 1.15, 0.26);
    part(arm, axleGeo(0.12, 0.3), MAT.frame, sx * 1.58, 0, 0);
  }
  const blade = new THREE.Group();
  blade.position.set(0, -0.62, 2.3);
  arm.add(blade);
  const BW = 3.7;
  const mold = [[0.14, 0.04], [0.03, 0.28], [-0.04, 0.56], [-0.04, 0.86], [0.04, 1.12], [0.17, 1.3]];
  part(blade, arcStrip(mold, BW, 0.1), MAT.paint);
  part(blade, arcStrip(mold.map(([z, y]) => [z + 0.04, y]), BW - 0.2, 0.02).translate(0, 0, 0), MAT.paintDark);
  for (const sx of [-1, 1]) part(blade, plateGeo([...mold, [-0.32, 1.22], [-0.36, 0.1]], 0.08), MAT.paint, sx * (BW / 2 - 0.04), 0, 0);
  part(blade, rbox(BW * 0.88, 0.85, 0.22, 0.06), MAT.paintDark, 0, 0.62, -0.22);
  for (const sx of [-1.2, -0.4, 0.4, 1.2]) part(blade, rbox(0.1, 1.0, 0.3, 0.03), MAT.paint, sx, 0.62, -0.18);
  part(blade, rbox(BW + 0.04, 0.13, 0.13, 0.03), MAT.edge, 0, 0.06, 0.13);
  for (const sx of [-1, 1]) part(blade, rbox(0.3, 0.18, 0.2, 0.04), MAT.edge, sx * (BW / 2 - 0.15), 0.08, 0.14);
  const pistonDefs = [];
  for (const sx of [-1, 1]) pistonDefs.push([root, [sx * 0.62, 2.15, 1.6], blade, [sx * 0.62, 1.05, -0.3], 0.1]);
  bake(root); bake(arm); bake(blade);
  const pistons = pistonDefs.map(([pa, a, pb, bb, r]) => new Piston(root, anchor(pa, ...a), anchor(pb, ...bb), r));
  return {
    root, tracks, arm, tool: blade, cabin, pistons,
    tool_: { W: BW, heel: new THREE.Vector3(0, 0, -0.38), edge: new THREE.Vector3(0, 0, 0.16) },
    BW,
  };
}

function buildTruck() {
  const root = new THREE.Group();
  const R = 0.78;
  const wheels = [], steerers = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 1.1, R, 2.6);
    root.add(pivot);
    const w = wheelGroup(R, 0.62);
    if (sx < 0) w.rotation.y = Math.PI;
    pivot.add(w);
    wheels.push(w);
    steerers.push(pivot);
    for (const z of [-1.35, -2.75]) {
      const r = wheelGroup(R, 0.68);
      r.position.set(sx * 1.08, R, z);
      if (sx < 0) r.rotation.y = Math.PI;
      root.add(r);
      wheels.push(r);
    }
  }
  // chassi, motor e plataforma
  part(root, rbox(1.05, 0.45, 7.0, 0.06), MAT.frame, 0, 1.05, -0.3);
  part(root, axleGeo(0.25, 1.9), MAT.frame, 0, R, -1.35);
  part(root, axleGeo(0.25, 1.9), MAT.frame, 0, R, -2.75);
  part(root, rbox(2.55, 0.38, 0.32, 0.08), MAT.black, 0, 1.02, 3.88);
  part(root, rbox(1.85, 1.2, 1.55, 0.14), MAT.paint, 0, 1.85, 3.12);
  part(root, new THREE.BoxGeometry(1.35, 0.85, 0.03), MAT.grille, 0, 1.85, 3.9);
  for (const sx of [-1, 1]) {
    part(root, rbox(0.24, 0.16, 0.06, 0.03), MAT.black, sx * 1.05, 2.25, 3.9);
    part(root, new THREE.BoxGeometry(0.18, 0.1, 0.02), MAT.lamp, sx * 1.05, 2.25, 3.935);
    part(root, fenderGeo(R + 0.12, 0.72, Math.PI * 0.8), MAT.paint, sx * 1.1, R, 2.6);
    part(root, cylGeo(0.022, 0.022, 0.5, 6), MAT.black, sx * 1.25, 2.75, 3.5);
  }
  part(root, rbox(2.75, 0.12, 1.75, 0.04), MAT.paint, 0, 2.5, 2.9);
  part(root, cylGeo(0.022, 0.022, 2.6, 6), MAT.black, 0, 3.0, 3.72, 0, 0, Math.PI / 2);
  part(root, rbox(1.0, 0.6, 1.1, 0.1), MAT.paint, 0.75, 2.86, 2.75);
  part(root, cylGeo(0.14, 0.14, 0.55, 12), MAT.black, 0.85, 3.4, 3.0);
  part(root, cylGeo(0.07, 0.08, 1.0, 10), MAT.black, 0.35, 3.5, 2.4);
  part(root, rbox(0.55, 0.65, 1.3, 0.1), MAT.paint, 1.3, 1.35, 0.6);
  part(root, rbox(0.55, 0.45, 0.9, 0.08), MAT.frame, -1.28, 1.25, 0.6);
  for (let i = 0; i < 5; i++) part(root, rbox(0.5, 0.04, 0.2, 0.01), MAT.steel, -1.32, 0.55 + i * 0.4, 3.35 - i * 0.12);
  for (const sx of [-1, 1]) {
    part(root, rbox(0.65, 0.1, 2.75, 0.04), MAT.frame, sx * 1.06, 1.62, -2.05);
    part(root, rbox(0.2, 0.14, 0.06, 0.03), MAT.tail, sx * 0.4, 1.0, -3.83);
  }
  part(root, new THREE.BoxGeometry(1.0, 0.18, 0.02), MAT.hazard, 0, 1.25, -3.81);
  const cabin = cab(root, 1.22, 1.38, 1.35, -0.62, 2.56, 2.55, { wheel: true });
  // báscula
  const bed = new THREE.Group();
  bed.position.set(0, 1.5, -3.55);
  root.add(bed);
  const BL = 4.8;
  part(bed, rbox(2.5, 0.14, BL, 0.04), MAT.paintDark, 0, 0.07, BL / 2);
  part(bed, rbox(2.5, 0.12, 0.6, 0.04), MAT.paintDark, 0, 0.16, 0.12, -0.35);
  const sideOut = [[0, 0.1], [BL, 0], [BL, 1.45], [0.8, 1.1], [0, 0.55]];
  for (const sx of [-1, 1]) {
    part(bed, plateGeo(sideOut, 0.08), MAT.paint, sx * 1.27, 0, 0);
    part(bed, rbox(0.12, 0.12, BL, 0.04), MAT.paint, sx * 1.3, 1.25, BL / 2 + 0.1, Math.atan2(0.35, BL - 0.8) * 0.3);
    for (let i = 0; i < 4; i++) part(bed, rbox(0.1, 0.95, 0.14, 0.03), MAT.paintDark, sx * 1.33, 0.5, 0.7 + i * 1.2);
    part(bed, rbox(0.1, 0.12, BL, 0.03), MAT.paintDark, sx * 1.33, 0.1, BL / 2);
  }
  part(bed, rbox(2.62, 1.5, 0.14, 0.05), MAT.paint, 0, 0.75, BL);
  part(bed, rbox(2.75, 0.12, 0.42, 0.04), MAT.paint, 0, 1.5, BL + 0.2);
  for (const sx of [-0.8, 0, 0.8]) part(bed, rbox(0.14, 1.3, 0.12, 0.03), MAT.paintDark, sx, 0.7, BL + 0.12);
  const load = heap(bed, 0, 0.14, BL / 2 - 0.1);
  const pistonDefs = [];
  for (const sx of [-1, 1]) pistonDefs.push([root, [sx * 0.42, 1.12, -0.6], bed, [sx * 0.42, 0.0, 3.1], 0.11]);
  bake(root); bake(bed);
  for (const w of wheels) bake(w);
  const pistons = pistonDefs.map(([pa, a, pb, bb, r]) => new Piston(root, anchor(pa, ...a), anchor(pb, ...bb), r));
  return { root, wheels, steerers, wheelR: R, bed, heap: load, cabin, BL, pistons };
}

/* ---------- veículo ---------- */
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _o = new THREE.Vector3();
const _inv = new THREE.Matrix4();

export class Vehicle {
  constructor(id, scene) {
    this.id = id;
    this.s = MACHINES[id];
    this.kind = this.s.kind;
    const b = this.kind === 'truck' ? buildTruck() : this.kind === 'dozer' ? buildDozer() : buildLoader(this.kind);
    Object.assign(this, b);
    this.root.rotation.order = 'YXZ';
    scene.add(this.root);
    outline(this.root);
    this.root.traverse((o) => { if (o.isMesh && o.material !== undefined && !o.userData.noOutline) o.castShadow = true; });
    this.x = 0; this.z = 0; this.y = 0; this.yaw = 0; this.pitch = 0; this.roll = 0;
    this.speed = 0; this.steerA = 0; this.resist = 0; this.yawRate = 0;
    this.load = 0; this.mat = 0; this.tilt = 0;
    this.lift = this.kind === 'dozer' ? 0.3 : (this.liftMin ?? 0) + 0.3;
    this.curl = 0.12;
    this.bladePitch = 0;
    this.trackL = 0; this.trackR = 0;
    this.hydro = 0; // atividade hidráulica (som)
    this.digRate = 0; // volume movido (som/efeitos)
    this.rpm = 0;
    this.fx = 0; this.fz = 1;
    this.bedInv = new THREE.Matrix4();
    this.dustT = 0;
  }

  place(x, z, yaw) {
    this.x = x; this.z = z; this.yaw = yaw; this.speed = 0;
    this.pose(0, true);
    this.sync();
  }

  // amostra o terreno nos pontos de apoio
  pose(dt, snap) {
    const c = this.s.contacts;
    const s = Math.sin(this.yaw), co = Math.cos(this.yaw);
    const at = (lx, lz) => heightAt(this.x + co * lx + s * lz, this.z - s * lx + co * lz);
    const fl = at(c.x, c.f), fr = at(-c.x, c.f), bl = at(c.x, c.b), br = at(-c.x, c.b);
    let hf = (fl + fr) / 2, hb = (bl + br) / 2, hl = (fl + bl) / 2, hr = (fr + br) / 2;
    if (this.s.tank) {
      const ml = at(c.x, 0), mr = at(-c.x, 0);
      hl = Math.max(hl, (ml + hl) / 2); hr = Math.max(hr, (mr + hr) / 2);
    }
    const yt = Math.max((hf + hb) / 2, (fl + fr + bl + br) / 4);
    const pt = Math.atan2(hf - hb, c.f - c.b);
    const rt = Math.atan2(hl - hr, 2 * c.x);
    if (snap) { this.y = yt; this.pitch = pt; this.roll = rt; return; }
    const k = Math.min(1, dt * 12), kr = Math.min(1, dt * 9);
    if (yt < this.y) this.y = Math.max(yt, this.y - 9 * dt * dt - (this.y - yt) * k * 0.6);
    else this.y = lerp(this.y, yt, k);
    this.pitch = lerp(this.pitch, pt, kr);
    this.roll = lerp(this.roll, rt, kr);
  }

  circlesWorld(x, z, yaw, out) {
    out.length = 0;
    const s = Math.sin(yaw), c = Math.cos(yaw);
    for (const [lz, r] of this.s.circles) out.push([x + s * lz, z + c * lz, r]);
    return out;
  }

  blocked(nx, nz, nyaw, world) {
    const lim = HALF - 3.5;
    if (Math.abs(nx) > lim || Math.abs(nz) > lim) return true;
    const cs = this.circlesWorld(nx, nz, nyaw, this._cs || (this._cs = []));
    for (const [cx, cz, r] of cs) {
      for (const t of world.trees) {
        const dx = t.x - cx, dz = t.z - cz;
        if (dx * dx + dz * dz < (r + t.r) * (r + t.r)) return true;
      }
      for (const v of world.vehicles) {
        if (v === this) continue;
        const os = v.circlesWorld(v.x, v.z, v.yaw, v._cs2 || (v._cs2 = []));
        for (const [ox, oz, orr] of os) {
          const dx = ox - cx, dz = oz - cz;
          if (dx * dx + dz * dz < (r + orr) * (r + orr)) return true;
        }
      }
    }
    // paredes íngremes e água funda
    const dir = Math.sign(this.speed) || 1;
    const c = this.s.contacts;
    const s = Math.sin(nyaw), co = Math.cos(nyaw);
    const lz = dir > 0 ? c.f : c.b;
    for (const lx of [c.x, -c.x]) {
      const wx = nx + co * lx + s * lz, wz = nz - s * lx + co * lz;
      const h0 = heightAt(wx, wz);
      const h1 = heightAt(wx + s * dir * 0.45, wz + co * dir * 0.45);
      if (h1 - h0 > 0.55) return true;
    }
    if (heightAt(nx, nz) < WATER_Y - 0.75) return true;
    return false;
  }

  drive(dt, inp, world) {
    const s = this.s;
    const thr = inp.thr, st = inp.steer;
    const loadF = s.cap ? 1 - 0.22 * (this.load / s.cap) * (this.kind === 'truck' ? 1 : 0.5) : 1;
    const rf = Math.max(0.12, s.power / (s.power + this.resist));
    const maxV = s.maxSpeed * loadF * rf;
    const target = thr * (thr > 0 ? maxV : maxV * 0.65);
    if (Math.abs(thr) < 0.05) this.speed = approach(this.speed, 0, s.brake * dt);
    else {
      const braking = Math.sign(target) !== Math.sign(this.speed) && Math.abs(this.speed) > 0.15;
      this.speed = approach(this.speed, target, (braking ? s.brake : s.accel) * dt);
    }
    if (this.speed > maxV) this.speed = approach(this.speed, maxV, s.brake * 1.5 * dt);
    this.speed -= Math.sin(this.pitch) * 3.2 * dt;
    if (Math.abs(thr) < 0.05 && Math.abs(this.speed) < 0.35) this.speed = approach(this.speed, 0, 2 * dt);

    let yawRate;
    if (s.tank) {
      yawRate = -st * s.turnRate * (1 - 0.35 * Math.abs(this.speed) / s.maxSpeed) * rf;
      if (Math.abs(st) > 0.3 && Math.abs(thr) < 0.05) this.speed = approach(this.speed, 0, s.brake * dt);
    } else {
      this.steerA = approach(this.steerA, st * s.maxSteer, 1.5 * dt);
      yawRate = (-this.speed * Math.tan(this.steerA)) / s.wb;
    }
    this.yawRate = yawRate;
    const nyaw = this.yaw + yawRate * dt;
    const nx = this.x + Math.sin(nyaw) * this.speed * dt;
    const nz = this.z + Math.cos(nyaw) * this.speed * dt;
    if (this.blocked(nx, nz, nyaw, world)) {
      if (!this.blocked(this.x, this.z, nyaw, world)) this.yaw = nyaw;
      this.speed *= -0.15;
      this.bump = 0.25;
    } else {
      this.x = nx; this.z = nz; this.yaw = nyaw;
    }
    this.fx = Math.sin(this.yaw); this.fz = Math.cos(this.yaw);
    const target_rpm = clamp(0.25 + Math.abs(thr) * 0.5 + Math.abs(this.speed) / s.maxSpeed * 0.3 + Math.min(this.resist / s.power, 1) * 0.35 + this.hydro * 0.25, 0, 1.2);
    this.rpm = lerp(this.rpm, target_rpm, Math.min(1, dt * 4));
    this.groundEffects(dt);
  }

  // marcas de pneu, compactação e poeira
  groundEffects(dt) {
    const sp = Math.abs(this.speed) + Math.abs(this.yawRate) * 1.5;
    if (sp < 0.2) return;
    const c = this.s.contacts;
    const s = this.fx, co = this.fz;
    const heavy = this.kind === 'dozer' ? 1.6 : this.kind === 'truck' ? 1 + this.load / 9 : 1;
    const amt = sp * dt * 0.35 * heavy, sink = sp * dt * 0.012 * heavy;
    const zs = this.s.tank ? [c.f, 0, c.b] : [c.f, c.b];
    for (const lx of [c.x, -c.x]) for (const lz of zs) {
      const wx = this.x + co * lx + s * lz, wz = this.z - s * lx + co * lz;
      tread(wx, wz, amt, sink);
      tread(wx + co * 0.25, wz - s * 0.25, amt * 0.6, sink * 0.5);
    }
    this.dustT -= dt;
    if (Math.abs(this.speed) > 2.2 && this.dustT <= 0) {
      this.dustT = 0.07;
      const lz = c.b - 0.4, lx = (Math.random() > 0.5 ? 1 : -1) * c.x;
      const wx = this.x + co * lx + s * lz, wz = this.z - s * lx + co * lz;
      const i = Math.round(toG(wz)) * G + Math.round(toG(wx));
      if (GRASS[i] < 0.4 && H[i] > WATER_Y + 0.2 && MATS[MATID[i]].dust > 0.5) {
        puff(wx, heightAt(wx, wz) + 0.3, wz, -s * this.speed * 0.2, -co * this.speed * 0.2, 0.55);
      }
    }
  }

  hydraulics(dt, inp) {
    const tx = inp.tx, ty = inp.ty;
    this.hydro = lerp(this.hydro, Math.min(1, Math.abs(tx) + Math.abs(ty)), Math.min(1, dt * 6));
    if (this.kind === 'loader' || this.kind === 'skid') {
      this.lift = clamp(this.lift + ty * 0.5 * dt, this.liftMin, this.liftMax);
      this.curl = clamp(this.curl - tx * 1.1 * dt, -1.05, 0.75);
    } else if (this.kind === 'dozer') {
      this.lift = clamp(this.lift + ty * 0.35 * dt, -0.2, 0.45);
      this.bladePitch = clamp(this.bladePitch + tx * 0.5 * dt, -0.3, 0.3);
    } else if (this.kind === 'truck') {
      this.tilt = clamp(this.tilt + ty * 0.45 * dt, 0, 0.95);
    }
  }

  sync() {
    const r = this.root;
    r.position.set(this.x, this.y, this.z);
    r.rotation.set(-this.pitch, this.yaw, this.roll);
    if (this.kind === 'loader' || this.kind === 'skid') {
      this.arm.rotation.x = -this.lift;
      this.tool.rotation.x = this.lift - this.curl;
      if (this.articulated) {
        this.front.rotation.y = -this.steerA * 0.55;
        this.rear.rotation.y = this.steerA * 0.55;
      }
    } else if (this.kind === 'dozer') {
      this.arm.rotation.x = -this.lift;
      this.tool.rotation.x = this.lift + this.bladePitch;
    } else {
      this.bed.rotation.x = -this.tilt;
      for (const p of this.steerers) p.rotation.y = -this.steerA;
    }
    if (this.pistons) {
      this.root.updateMatrixWorld(true);
      for (const p of this.pistons) p.update();
    }
  }

  animate(dt) {
    if (this.wheels) {
      const spin = (this.speed * dt) / this.wheelR;
      if (this.s.tank) {
        const w = this.yawRate * this.s.contacts.x;
        this.wheels.forEach((wh, i) => { wh.rotation.x += ((this.speed + (i % 2 === 0 ? -w : w)) * dt) / this.wheelR; });
      } else for (const wh of this.wheels) wh.rotation.x += spin;
    }
    if (this.tracks) {
      const w = this.yawRate * this.s.contacts.x;
      this.tracks[0].update((this.speed + w) * dt);
      this.tracks[1].update((this.speed - w) * dt);
    }
    this.updateHeap();
  }

  updateHeap() {
    const m = this.heap;
    if (!m) return;
    const f = this.s.cap ? this.load / this.s.cap : 0;
    m.visible = f > 0.01;
    if (!m.visible) return;
    if (this.kind === 'truck') m.scale.set(1.15, 0.12 + 1.15 * Math.sqrt(f), 2.3 * (0.6 + 0.4 * Math.min(1, f * 2)));
    else m.scale.set(this.BW * 0.46, (0.12 + 0.55 * f) * this.bs, 0.58 * this.bs);
    m.material.color.copy(MATS[this.mat].c);
  }

  // interação da caçamba/lâmina com o solo
  applyTool(dt, world) {
    if (this.kind === 'truck') return this.truckDump(dt);
    this.root.updateMatrixWorld(true);
    const T = this.tool_, obj = this.tool;
    const Ec = obj.localToWorld(_v.copy(T.edge));
    const Hc = obj.localToWorld(_v2.copy(T.heel));
    const origin = obj.getWorldPosition(_o);
    // eixo lateral da ferramenta
    const ax = obj.localToWorld(new THREE.Vector3(1, 0, 0)).sub(origin);
    const axl = Math.hypot(ax.x, ax.z) || 1;
    const wx = ax.x / axl, wz = ax.z / axl;
    let fx = Ec.x - Hc.x, fz = Ec.z - Hc.z;
    let len = Math.hypot(fx, fz);
    if (len < 0.25) { fx = this.fx; fz = this.fz; len = 0.25; } else { fx /= len; fz /= len; }
    const side = ax.y / axl; // inclinação lateral
    const W = T.W, hw = W / 2;
    const ex = Ec.x, ez = Ec.z;
    const minX = Math.min(Hc.x, Ec.x) - hw - 0.6, maxX = Math.max(Hc.x, Ec.x) + hw + 0.6;
    const minZ = Math.min(Hc.z, Ec.z) - hw - 0.6, maxZ = Math.max(Hc.z, Ec.z) + hw + 0.6;
    // a ferramenta está perto do chão?
    if (Math.min(Ec.y, Hc.y) > heightAt(ex, ez) + 1.2 && Math.min(Ec.y, Hc.y) > heightAt(Hc.x, Hc.z) + 1.2) {
      this.resist = lerp(this.resist, 0, Math.min(1, dt * 5));
      this.digRate = lerp(this.digRate, 0, Math.min(1, dt * 5));
      this.bucketDump(dt, Ec, origin);
      return;
    }
    const gx0 = Math.max(1, Math.floor(toG(minX))), gx1 = Math.min(G - 2, Math.ceil(toG(maxX)));
    const gz0 = Math.max(1, Math.floor(toG(minZ))), gz1 = Math.min(G - 2, Math.ceil(toG(maxZ)));
    const ncol = Math.ceil(W / CELL) + 1;
    const cols = this._cols || (this._cols = new Float32Array(16));
    cols.fill(0);
    const matv = [0, 0, 0, 0];
    let total = 0, hard = 0;
    for (let z = gz0; z <= gz1; z++) for (let x = gx0; x <= gx1; x++) {
      const px = toW(x), pz = toW(z);
      const dx = px - Hc.x, dz = pz - Hc.z;
      const u = dx * wx + dz * wz, v = dx * fx + dz * fz;
      if (u < -hw || u > hw || v < -0.1 || v > len + 0.12) continue;
      const by = lerp(Hc.y, Ec.y, clamp(v / len, 0, 1)) + u * side;
      const i = z * G + x;
      const ex_ = H[i] - by;
      if (ex_ <= 0.004) continue;
      const amt = Math.min(ex_, H[i] - ROCK[i]);
      if (amt <= 0) continue;
      const wasLoose = LOOSE[i] > 0.02;
      H[i] -= amt;
      LOOSE[i] = Math.max(0, LOOSE[i] - amt);
      GRASS[i] = 0;
      matv[MATID[i]] += amt;
      hard += amt * (wasLoose ? 0.55 : 2.2 / MATS[MATID[i]].soft);
      total += amt;
      const ci = clamp(Math.floor(((u + hw) / W) * (ncol - 1) + 0.5), 0, 15);
      cols[ci] += amt;
    }
    let V = total * CA;
    let dom = 0;
    for (let q = 1; q < 4; q++) if (matv[q] > matv[dom]) dom = q;
    if (V > 0) {
      dirty(gx0, gz0, gx1, gz1);
      wake(gx0, gz0); wake(gx1, gz1); wake(gx0, gz1); wake(gx1, gz0);
    }
    // caçamba engole o material se estiver na posição de corte
    let taken = 0;
    if (this.s.cap && this.curl > -0.5 && V > 0) {
      const space = this.s.cap - this.load;
      taken = Math.min(V, Math.max(0, space));
      if (taken > 0) {
        if (this.load < 0.05 || taken > this.load * 0.3) this.mat = dom;
        this.load += taken;
      }
    }
    const R = V - taken;
    if (R > 1e-5 && total > 0) {
      const back = this.speed < -0.15;
      const ahead = back ? -0.45 : 0.5;
      const bx = back ? Hc.x : ex, bz = back ? Hc.z : ez;
      for (let ci = 0; ci < ncol; ci++) {
        if (cols[ci] <= 0) continue;
        const share = (R * cols[ci]) / total;
        const u = (ci / (ncol - 1)) * W - hw;
        deposit(bx + wx * u + fx * ahead, bz + wz * u + fz * ahead, share, dom);
      }
    }
    // torrões voando (cosméticos)
    const rate = V / Math.max(dt, 1e-3);
    if (V > 0.0015) {
      const nfx = Math.min(4, Math.ceil(V * 50));
      for (let q = 0; q < nfx; q++) {
        const u = (Math.random() - 0.5) * W * 0.9;
        spawn(ex + wx * u, Ec.y + 0.35 + Math.random() * 0.3, ez + wz * u,
          this.fx * this.speed * 0.9 + (Math.random() - 0.5) * 1.2, 1 + Math.random() * 2.2, this.fz * this.speed * 0.9 + (Math.random() - 0.5) * 1.2,
          0, dom, 0.06 + Math.random() * 0.1);
      }
      if (MATS[dom].dust > 0.5 && Math.random() < 0.3) puff(ex, Ec.y + 0.6, ez, this.fx, this.fz, 0.7);
    }
    this.resist = lerp(this.resist, (hard * CA) / Math.max(dt, 1e-3), Math.min(1, dt * 8));
    this.digRate = lerp(this.digRate, rate, Math.min(1, dt * 8));
    this.bucketDump(dt, Ec, origin);
  }

  bucketDump(dt, Ec, origin) {
    if (!this.s.cap || this.load <= 0) return;
    const fd = this.tool.localToWorld(_v2.set(0, 0, 1)).sub(origin);
    const sy = fd.y;
    if (sy > -0.32) return;
    const rate = this.s.cap * 1.5 * clamp((-sy - 0.32) / 0.45, 0.15, 1);
    const out = Math.min(this.load, rate * dt);
    this.load -= out;
    if (this.load < 0.004) this.load = 0;
    const np = Math.max(1, Math.round(out / 0.016));
    const pv = out / np;
    const T = this.tool_;
    for (let q = 0; q < np; q++) {
      const u = (Math.random() - 0.5) * T.W * 0.85;
      const p = this.tool.localToWorld(_v.set(u, T.edge.y + 0.15, T.edge.z - 0.1));
      spawn(p.x, p.y, p.z,
        fd.x * 1.4 + this.fx * this.speed + (Math.random() - 0.5) * 0.5,
        fd.y * 1.2 - Math.random() * 0.5,
        fd.z * 1.4 + this.fz * this.speed + (Math.random() - 0.5) * 0.5,
        pv, this.mat);
    }
  }

  truckDump(dt) {
    this.root.updateMatrixWorld(true);
    this.bedInv.copy(this.bed.matrixWorld).invert();
    this.resist = 0;
    if (this.tilt < 0.3 || this.load <= 0) return;
    const rate = 5 * clamp((this.tilt - 0.3) / 0.5, 0.1, 1);
    const out = Math.min(this.load, rate * dt);
    this.load -= out;
    if (this.load < 0.004) this.load = 0;
    const np = Math.max(1, Math.round(out / 0.022));
    const pv = out / np;
    const o = this.bed.getWorldPosition(_o);
    const back = this.bed.localToWorld(_v2.set(0, 0, -1)).sub(o);
    for (let q = 0; q < np; q++) {
      const p = this.bed.localToWorld(_v.set((Math.random() - 0.5) * 2.1, 0.3 + Math.random() * 0.3, 0.05));
      spawn(p.x, p.y, p.z,
        back.x * 1.6 + this.fx * this.speed + (Math.random() - 0.5) * 0.4,
        back.y * 1.2 - 0.3,
        back.z * 1.6 + this.fz * this.speed + (Math.random() - 0.5) * 0.4, pv, this.mat);
    }
  }

  // partícula caindo dentro da báscula?
  catchParticle(x, y, z, v, m) {
    if (this.kind !== 'truck' || this.tilt > 0.22) return false;
    if (this.load >= this.s.cap) return false;
    _v.set(x, y, z).applyMatrix4(this.bedInv);
    if (_v.x < -1.2 || _v.x > 1.2 || _v.z < 0.1 || _v.z > this.BL - 0.1) return false;
    const top = 0.12 + 1.3 * Math.sqrt(this.load / this.s.cap);
    if (_v.y > top + 0.15 || _v.y < -0.4) return false;
    if (this.load < 0.1 || v > this.load * 0.2) this.mat = m;
    this.load = Math.min(this.s.cap, this.load + v);
    return true;
  }

  get cabHide() { return this.cabin.hide; }
  get seat() { return this.cabin.seat; }
}

