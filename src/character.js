// Personagem chibi estilo anime, ESCULPIDO por código (ver sdf.js):
// - corpo, roupa e cabelo são malhas contínuas com esqueleto (skinning), não pecinhas coladas
// - animação por clipes de keyframes (AnimationMixer) com mistura suave
// - cabelo, orelhas, fitas, saia, capa e rabo têm física (springs.js): reagem a vento e movimento
// - modular: o criador de personagem troca só os índices da config; cada parte é refeita só quando muda
import * as THREE from 'three';
import { cozyMat } from './materials.js';
import { canvasTex, shade } from './textures.js';
import { SpringSet } from './springs.js';
import { ell, cap, box, plane, prepare, sculpt, boundsOf, fieldOf, raycast } from './sdf.js';

export const OPTIONS = {
  skin: ['#ffe9d6', '#fcd9bb', '#f0be94', '#d39a6c', '#a56f47', '#7a4c30'],
  hairColor: ['#3d2c33', '#6b4226', '#a8642e', '#f0c05a', '#f8ecc0', '#d8584a', '#f5a3c4', '#86a4ea', '#8fd6a6', '#bda3ee', '#f3f2f7'],
  eyeColor: ['#7a4a2c', '#3f8fe0', '#3fae6c', '#9a66e0', '#eb8f2e', '#e8506e', '#eabb22'],
  shirtColor: ['#fffaf0', '#ee6a62', '#f6a843', '#f8dc62', '#78c873', '#60c0d2', '#6688e0', '#b080de', '#f598bc', '#4f4960'],
  pantsColor: ['#5677c0', '#3f4d6c', '#80603f', '#62985e', '#bd5a52', '#9176c0', '#e8dab4', '#f7f4ea'],
  accent: ['#ee6a62', '#f598bc', '#f8dc62', '#78c873', '#60c0d2', '#6688e0', '#b080de', '#fffaf0', '#4f4960'],
  height: ['Baixinha', 'Média', 'Alta'],
  thighs: ['Finas', 'Médias', 'Grossas'],
  hips: ['Estreito', 'Médio', 'Largo'],
  chest: ['Reto', 'Médio', 'Grande'],
  hair: ['Chiquinhas', 'Longo', 'Curto', 'Rabo de cavalo', 'Espetado', 'Coquinhos', 'Fofinho'],
  eyes: ['Redondo', 'Gatinho', 'Sonolento'],
  mouth: ['Sorriso', 'Gatinho', 'Alegre'],
  outfit: ['Vestido', 'Macacão', 'Moletom', 'Camiseta'],
  hat: ['Nenhum', 'Boina', 'Chapéu de sol', 'Laço', 'Coroinha', 'Sapinho'],
  ears: ['Nenhum', 'Gatinho', 'Coelho', 'Chifres', 'Unicórnio', 'Elfo'],
  back: ['Nenhum', 'Asinhas', 'Capa', 'Rabo de gato', 'Mochila'],
};

export function defaultConfig() {
  return { name: '', skin: 0, height: 1, thighs: 1, hips: 1, chest: 0, hair: 0, hairColor: 3, eyeColor: 1, eyes: 0, mouth: 0, outfit: 0, shirtColor: 8, pantsColor: 0, accent: 0, hat: 0, ears: 0, back: 0 };
}
// garante que uma config (ex.: de um save antigo) só tem índices válidos
export function sanitizeConfig(c) {
  const out = defaultConfig();
  for (const k in out) {
    if (k === 'name') out.name = typeof c?.name === 'string' ? c.name.slice(0, 12) : '';
    else if (Number.isInteger(c?.[k]) && c[k] >= 0 && c[k] < OPTIONS[k].length) out[k] = c[k];
  }
  return out;
}
export function randomConfig(name = '') {
  const c = { name };
  for (const k in OPTIONS) c[k] = (Math.random() * OPTIONS[k].length) | 0;
  for (const k of ['hat', 'ears', 'back']) if (Math.random() < 0.4) c[k] = 0;
  return c;
}

const TAU = Math.PI * 2;
const ARM_BIND = 1.0; // pose de escultura: braços bem abertos (não gruda no corpo)
const ARM_Z = 0.2; // braços soltos ao lado do corpo
export const WALK_DUR = 0.56, RUN_DUR = 0.4, IDLE_DUR = 2.8;
const LINE = '#3a2430';
const IDENT = new THREE.Matrix4();
const SCALE = 0.62; // unidades do modelo -> mundo

// Medidas do corpo, em unidades do modelo (a cabeça tem ~0.8 de altura).
// Proporção chibi de anime: 2,3 a 3 cabeças de altura, com tronco, cintura, quadril, pernas e braços de verdade.
// Altura, coxas, quadril e peito vêm do criador de personagem.
export function bodyDims(cfg) {
  const H = [{ L: 0.64, sh: 0.58, neck: 0 }, { L: 0.8, sh: 0.66, neck: 0 }, { L: 0.98, sh: 0.74, neck: 0 }][cfg.height];
  const th = [0.14, 0.16, 0.185][cfg.thighs];
  const pw0 = [0.3, 0.33, 0.37][cfg.hips], hx = th + 0.02, pw = Math.max(pw0, hx + th * 0.95);
  const D = {
    ...H, chest: cfg.chest, cw: 0.245, cd: 0.17, ww: 0, wd: 0, pw, pd: 0.2 + (pw - 0.33) * 0.4, hx,
    th: [th, th * 0.85], sn: [th * 0.8, th * 0.62], ar: [0.062, 0.054], fr: [0.054, 0.048], hand: 0.06, foot: [0.08, 0.06, 0.11],
  };
  D.a = (D.L - 0.12) / 2; // coxa e canela (o pé ocupa os últimos 0.12) // coxa e canela
  D.ua = D.sh * 0.42; D.fa = D.sh * 0.36; // braço e antebraço
  D.chestY = D.sh * 0.62; D.ch = D.sh * 0.36; D.shX = D.cw * 0.8;
  D.waistY = D.L + 0.1; D.shY = D.waistY + D.sh; D.kneeY = D.L - 0.02 - D.a;
  D.hemY = D.kneeY + 0.06; D.skirt = D.L + 0.07 - D.hemY;
  D.cadence = Math.sqrt(D.L / 0.8); // perna maior = passo mais lento
  D.skel = `${cfg.height}_${cfg.hips}`; // o que muda o esqueleto
  D.key = `${cfg.height}${cfg.thighs}${cfg.hips}${cfg.chest}`; // o que muda a escultura do corpo
  return D;
}


// ---------- cabeça (espaço local do osso da cabeça) ----------
const HC = [0, 0.35, 0], HR = [0.47, 0.37, 0.42];
const headPrims = () => prepare([
  ell(null, HC, HR),
  ell(null, [0.15, 0.17, 0.07], [0.27, 0.21, 0.27], { k: 0.12 }),
  ell(null, [-0.15, 0.17, 0.07], [0.27, 0.21, 0.27], { k: 0.12 }),
]);
// ponto sobre o "elipsoide" da cabeça: az = ângulo a partir da frente, el = elevação, off = afastamento
const HP = (az, el, off = 0) => [HC[0] + Math.sin(az) * Math.cos(el) * HR[0] * (1 + off), HC[1] + Math.sin(el) * HR[1] * (1 + off), HC[2] + Math.cos(az) * Math.cos(el) * HR[2] * (1 + off)];

// ---------- rosto: desenhado liso (olhão de anime, bochecha, boquinha) ----------
function faceTex(cfg, mode) {
  // Estilo das referências: olhão baixo e afastado, sem sobrancelha (a franja cobre), cílio de cima grosso,
  // íris em degradê (escura em cima, clara embaixo) com brilho grande, bochecha rosada larga e boquinha aberta.
  const eye = OPTIONS.eyeColor[cfg.eyeColor], skin = OPTIONS.skin[cfg.skin];
  const lash = '#3b2228';
  return canvasTex(256, 208, (ctx) => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const cy = 137, rx = 34, ry = 39;
    const eyeShape = (cx) => {
      // olho arredondado, topo um pouco reto (cara de anime)
      ctx.beginPath();
      ctx.moveTo(cx - rx, cy - ry * 0.35);
      ctx.bezierCurveTo(cx - rx, cy - ry * 1.02, cx + rx, cy - ry * 1.02, cx + rx, cy - ry * 0.35);
      ctx.bezierCurveTo(cx + rx, cy + ry * 0.75, cx + rx * 0.62, cy + ry, cx, cy + ry);
      ctx.bezierCurveTo(cx - rx * 0.62, cy + ry, cx - rx, cy + ry * 0.75, cx - rx, cy - ry * 0.35);
      ctx.closePath();
    };
    for (const sg of [-1, 1]) {
      const cx = 128 + sg * 60;
      // bochecha larga e macia
      const bx = cx + sg * 10, by = cy + ry + 6;
      const g = ctx.createRadialGradient(bx, by, 2, bx, by, 34);
      g.addColorStop(0, 'rgba(255,120,140,0.62)'); g.addColorStop(0.6, 'rgba(255,130,150,0.42)'); g.addColorStop(1, 'rgba(255,135,155,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(bx, by, 34, 24, 0, 0, TAU); ctx.fill();

      ctx.strokeStyle = lash;
      if (mode === 'closed') {
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(cx - rx, cy + 4); ctx.quadraticCurveTo(cx, cy + 18, cx + rx, cy + 4); ctx.stroke();
        continue;
      }
      if (mode === 'happy') {
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(cx - rx + 2, cy + 12); ctx.quadraticCurveTo(cx, cy - 18, cx + rx - 2, cy + 12); ctx.stroke();
        continue;
      }
      ctx.save();
      eyeShape(cx); ctx.clip();
      // íris ocupando quase o olho todo
      const ig = ctx.createLinearGradient(0, cy - ry, 0, cy + ry);
      ig.addColorStop(0, shade(eye, -0.12)); ig.addColorStop(0.35, shade(eye, 0.16)); ig.addColorStop(0.75, shade(eye, 0.3)); ig.addColorStop(1, shade(eye, 0.4));
      ctx.fillStyle = ig; ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
      // pupila suave
      ctx.fillStyle = shade(eye, -0.22); ctx.globalAlpha = 0.6;
      ctx.beginPath();
      if (cfg.eyes === 1) ctx.ellipse(cx, cy + 2, 5, 22, 0, 0, TAU); else ctx.ellipse(cx, cy - 2, 11, 14, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      // reflexo claro embaixo
      ctx.fillStyle = shade(eye, 0.42); ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.ellipse(cx + sg * 3, cy + ry * 0.62, rx * 0.62, 8, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      // pálpebra de cima pesada (sonolento)
      if (cfg.eyes === 2) { ctx.fillStyle = skin; ctx.fillRect(cx - rx - 2, cy - ry - 2, rx * 2 + 4, ry * 0.85); }
      ctx.restore();
      // cílio de cima grosso + rabinho pra fora
      const top = cfg.eyes === 2 ? cy - ry * 0.15 : cy - ry * 0.62;
      ctx.lineWidth = 7;
      ctx.beginPath();
      if (cfg.eyes === 2) { ctx.moveTo(cx - rx - 2, top + 2); ctx.quadraticCurveTo(cx, top - 4, cx + rx + 2, top + 2); }
      else { ctx.moveTo(cx - rx - 1, cy - ry * 0.3); ctx.bezierCurveTo(cx - rx, cy - ry * 1.04, cx + rx, cy - ry * 1.04, cx + rx + 1, cy - ry * 0.3); }
      ctx.stroke();
      ctx.lineWidth = 5;
      const ox = cx + sg * (rx + 1), oy = cfg.eyes === 2 ? top + 2 : cy - ry * 0.42;
      ctx.beginPath(); ctx.moveTo(ox - sg * 3, oy); ctx.lineTo(ox + sg * 7, oy - (cfg.eyes === 1 ? 10 : 5)); ctx.stroke();
      // contorno fino nas laterais e cílio de baixo bem leve
      ctx.lineWidth = 1.6; ctx.strokeStyle = shade(eye, -0.3);
      ctx.save(); eyeShape(cx); ctx.stroke(); ctx.restore();
      // brilhos
      ctx.fillStyle = '#ffffff';
      const hy = cfg.eyes === 2 ? cy + 2 : cy - 10;
      ctx.beginPath(); ctx.ellipse(cx - sg * 2 - 10, hy - 4, 8, 9, -0.2, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 10, cy + 14, 3.6, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 2, hy - 5, 2.2, 0, TAU); ctx.fill();
    }
    // boca pequena, perto do queixo
    const my = cy + ry + 8;
    ctx.strokeStyle = '#7d2f3c'; ctx.lineWidth = 3.5;
    if (mode === 'happy' || cfg.mouth === 2) {
      // aberta: "D" com linguinha
      ctx.fillStyle = '#a63a4a';
      ctx.beginPath(); ctx.moveTo(119, my - 2); ctx.quadraticCurveTo(128, my - 4, 137, my - 2); ctx.quadraticCurveTo(136, my + 14, 128, my + 14); ctx.quadraticCurveTo(120, my + 14, 119, my - 2); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff8fa2'; ctx.beginPath(); ctx.ellipse(128, my + 9, 5.5, 3.5, 0, 0, TAU); ctx.fill();
    } else if (cfg.mouth === 1) {
      // gatinho com dentinho
      ctx.fillStyle = '#a63a4a';
      ctx.beginPath(); ctx.moveTo(119, my); ctx.quadraticCurveTo(128, my + 13, 137, my); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(116, my - 2); ctx.quadraticCurveTo(122, my + 5, 128, my); ctx.quadraticCurveTo(134, my + 5, 140, my - 2); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(131, my + 1); ctx.lineTo(135, my + 1); ctx.lineTo(133, my + 5); ctx.closePath(); ctx.fill();
    } else {
      // sorrisinho aberto
      ctx.fillStyle = '#a63a4a';
      ctx.beginPath(); ctx.moveTo(121, my); ctx.quadraticCurveTo(128, my + 10, 135, my); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }, { smooth: true });
}

// ---------- roupa: pintada numa textura projetada de frente (metade esquerda) e de costas (direita) ----------
const TX = 0.85, TY = 2.0, TW = 320, TH = 640; // área coberta: x em [-TX, TX], y em [0, TY] (pose de escultura)
function outfitTex(cfg, D) {
  const shirt = OPTIONS.shirtColor[cfg.shirtColor], pants = OPTIONS.pantsColor[cfg.pantsColor], acc = OPTIONS.accent[cfg.accent];
  const cw = D.cw, w = D.waistY, ch = D.waistY + D.chestY, sh = D.shY, hip = D.L, shoe = 0.088, o = cfg.outfit;
  return canvasTex(TW * 2, TH, (ctx) => {
    const X = (x) => ((x + TX) / (TX * 2)) * TW, Y = (y) => TH - (y / TY) * TH, U = (r) => (r / (TX * 2)) * TW;
    for (const half of [0, 1]) {
      const front = half === 0;
      ctx.save();
      ctx.beginPath(); ctx.rect(half * TW, 0, TW, TH); ctx.clip();
      ctx.translate(half * TW, 0);
      const R = (x0, y0, x1, y1, c) => { ctx.fillStyle = c; ctx.fillRect(X(x0), Y(y1), X(x1) - X(x0), Y(y0) - Y(y1)); };
      const dot = (x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(X(x), Y(y), U(r), 0, TAU); ctx.fill(); };
      const line = (pts, wd, c) => { ctx.strokeStyle = c; ctx.lineWidth = U(wd); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])))); ctx.stroke(); };
      R(-TX, 0, TX, TY, shirt);
      if (o === 0) {
        // vestido: meias, barra, faixa na cintura, gola e botões
        R(-0.6, shoe, 0.6, D.hemY, '#ffffff');
        R(-0.7, D.hemY, 0.7, D.hemY + 0.035, '#ffffff');
        R(-0.7, D.hemY + 0.035, 0.7, D.hemY + 0.05, shade(shirt, -0.1));
        R(-0.6, w - 0.025, 0.6, w + 0.015, acc);
        if (front) {
          dot(-0.06, sh + 0.01, 0.05, '#ffffff'); dot(0.06, sh + 0.01, 0.05, '#ffffff');
          dot(0, ch + 0.06, 0.013, acc); dot(0, ch + 0.02, 0.01, '#ffffff'); dot(0, ch - 0.02, 0.01, '#ffffff');
          dot(0.045, w - 0.005, 0.032, shade(acc, -0.12)); dot(-0.045, w - 0.005, 0.032, shade(acc, -0.12));
        } else R(-0.09, sh - 0.015, 0.09, sh + 0.02, '#ffffff');
      } else if (o === 1) {
        // macacão: calça, peitilho, alças, botões e bolso
        const pL = shade(pants, 0.1), pD = shade(pants, -0.12);
        R(-0.6, 0, 0.6, w + 0.03, pants);
        R(-0.6, shoe, 0.6, shoe + 0.035, pL);
        if (front) {
          R(-cw * 0.48, w, cw * 0.48, ch + 0.05, pants); R(-cw * 0.48, ch + 0.04, cw * 0.48, ch + 0.06, pL);
          line([[-cw * 0.42, ch + 0.05], [-cw * 0.5, sh + 0.04]], 0.05, pants); line([[cw * 0.42, ch + 0.05], [cw * 0.5, sh + 0.04]], 0.05, pants);
          dot(-cw * 0.36, ch + 0.03, 0.02, '#f8d45c'); dot(cw * 0.36, ch + 0.03, 0.02, '#f8d45c');
          line([[-0.035, ch - 0.015], [0.035, ch - 0.015], [0.035, ch - 0.065], [-0.035, ch - 0.065], [-0.035, ch - 0.015]], 0.006, pD);
        } else {
          line([[-cw * 0.5, sh + 0.04], [cw * 0.3, w + 0.03]], 0.05, pants); line([[cw * 0.5, sh + 0.04], [-cw * 0.3, w + 0.03]], 0.05, pants);
          line([[-0.12, hip + 0.03], [-0.04, hip + 0.03], [-0.04, hip - 0.03], [-0.12, hip - 0.03], [-0.12, hip + 0.03]], 0.006, pD);
        }
      } else if (o === 2) {
        // moletom: barra, bolso canguru, cordões; calça por baixo
        R(-0.6, 0, 0.6, hip + 0.005, pants);
        R(-0.6, hip, 0.6, hip + 0.04, shade(shirt, -0.1));
        if (front) {
          line([[-0.08, w + 0.03], [0.08, w + 0.03], [0.1, w - 0.05], [-0.1, w - 0.05], [-0.08, w + 0.03]], 0.008, shade(shirt, -0.13));
          line([[-0.03, sh - 0.005], [-0.035, sh - 0.09]], 0.01, '#ffffff'); line([[0.03, sh - 0.005], [0.035, sh - 0.1]], 0.01, '#ffffff');
          dot(-0.035, sh - 0.095, 0.01, '#ffffff'); dot(0.035, sh - 0.105, 0.01, '#ffffff');
        }
      } else {
        // camiseta com estampa + shorts e meias
        R(-0.6, 0, 0.6, w - 0.02, pants);
        R(-0.6, w - 0.045, 0.6, w - 0.02, shade(pants, 0.1));
        R(-0.6, shoe, 0.6, 0.16, '#ffffff');
        if (front) {
          ctx.fillStyle = acc;
          const hx = X(0), hy = Y(ch), k = U(0.04);
          ctx.beginPath(); ctx.moveTo(hx, hy + k); ctx.bezierCurveTo(hx - k * 2, hy - k * 0.4, hx - k * 0.9, hy - k * 1.6, hx, hy - k * 0.6);
          ctx.bezierCurveTo(hx + k * 0.9, hy - k * 1.6, hx + k * 2, hy - k * 0.4, hx, hy + k); ctx.fill();
        }
      }
      R(-0.6, 0, 0.6, shoe, o === 0 ? acc : '#8a563e'); // sapatos
      R(-0.6, 0, 0.6, 0.02, o === 0 ? shade(acc, -0.15) : '#5e3a2b');
      ctx.restore();
    }
  }, { smooth: true });
}
const outfitUV = (x, y) => [(x + TX) / (TX * 2), y / TY];

// ---------- animações (poses amostradas em keyframes) ----------
const NODES = ['hips', 'torso', 'head', 'armL', 'armR', 'foreArmL', 'foreArmR', 'legL', 'legR', 'shinL', 'shinR'];
const BASE = { hipsY: 0, squash: 1, hips: [0, 0, 0], torso: [0, 0, 0], head: [0, 0, 0], armL: [0, 0, ARM_Z], armR: [0, 0, -ARM_Z], foreArmL: [-0.2, 0, 0], foreArmR: [-0.2, 0, 0], legL: [0, 0, 0.03], legR: [0, 0, -0.03], shinL: [0, 0, 0], shinR: [0, 0, 0] };

function makeClip(name, dur, n, poseFn, hipY) {
  const times = [], tr = { hipsPos: [], rigScale: [] };
  for (const k of NODES) tr[k] = [];
  const e = new THREE.Euler(), q = new THREE.Quaternion();
  for (let i = 0; i <= n; i++) {
    const p = { ...BASE, ...poseFn(i / n) };
    times.push((i / n) * dur);
    tr.hipsPos.push(0, hipY + p.hipsY, 0);
    const s = p.squash, side = 1 / Math.sqrt(s);
    tr.rigScale.push(side, s, side); // amassa/estica conservando volume
    for (const k of NODES) {
      e.set(p[k][0], p[k][1], p[k][2], 'YXZ');
      q.setFromEuler(e);
      tr[k].push(q.x, q.y, q.z, q.w);
    }
  }
  return new THREE.AnimationClip(name, dur, [
    new THREE.VectorKeyframeTrack('hips.position', times, tr.hipsPos),
    new THREE.VectorKeyframeTrack('rig.scale', times, tr.rigScale),
    ...NODES.map((k) => new THREE.QuaternionKeyframeTrack(k + '.quaternion', times, tr[k])),
  ]);
}

const ease = (u) => u * u * (3 - 2 * u);
function keys(t, k) {
  for (let i = 0; i < k.length - 1; i++) {
    if (t <= k[i + 1][0]) return k[i][1] + (k[i + 1][1] - k[i][1]) * ease((t - k[i][0]) / (k[i + 1][0] - k[i][0]));
  }
  return k[k.length - 1][1];
}

function idlePose(t, cycles = 1) {
  const s = (ph = 0, f = 1) => Math.sin(TAU * t * cycles * f + ph);
  return {
    hipsY: 0.005 * s() - 0.01,
    squash: 1 + 0.02 * s(),
    hips: [0, 0.06, 0.045 + 0.015 * s(0, 0.5)],
    torso: [0.03 + 0.02 * s(0.8), -0.04, -0.06 - 0.015 * s(0, 0.5)],
    head: [0.04 + 0.03 * s(-0.9), 0.05, 0.1 + 0.04 * s(0.6, 0.5)],
    // mãos juntas na frente da barriga
    armL: [-0.38 + 0.03 * s(0.5), 0.15, 0.14],
    armR: [-0.38 + 0.03 * s(1.1), -0.15, -0.14],
    foreArmL: [-1.05 - 0.04 * s(), 0.0, -0.75],
    foreArmR: [-1.05 - 0.04 * s(), 0.0, 0.75],
    // peso na perna esquerda, direita relaxada com o joelho dobradinho
    legL: [0.0, 0, 0.0],
    legR: [-0.16, 0, -0.07],
    shinL: [0.02, 0, 0],
    shinR: [0.3, 0, 0],
  };
}

// tchauzinho: braço direito pra cima acenando
function wavePose(t) {
  const p = idlePose(t, 1);
  const up = keys(t, [[0, 0], [0.15, 1], [0.85, 1], [1, 0]]);
  const w = Math.sin(t * TAU * 4) * up;
  p.armR = [-0.2 * up + p.armR[0] * (1 - up), p.armR[1] * (1 - up), p.armR[2] * (1 - up) - 2.5 * up];
  p.foreArmR = [p.foreArmR[0] * (1 - up) - 0.2 * up, 0, p.foreArmR[2] * (1 - up) - (0.45 + 0.4 * w) * up];
  p.armL = [0.05, 0, ARM_Z];
  p.foreArmL = [-0.3, 0, 0];
  p.head = [p.head[0], 0.05, 0.16 * up + p.head[2] * (1 - up)];
  return p;
}

function gaitPose(t, g) {
  const p = TAU * t, S = Math.sin(p), C2 = Math.cos(p * 2);
  const leg = (ph, sg) => [-g.leg * Math.sin(p + ph) - g.lean * 0.5, 0, sg * 0.03];
  const shin = (ph) => [0.06 + g.knee * Math.max(0, Math.cos(p + ph)) ** 1.3, 0, 0];
  return {
    hipsY: g.bob * C2 - g.bob,
    squash: 1 + g.stretch * C2,
    hips: [0, g.twist * S, g.roll * S],
    torso: [g.lean, -g.twist * 1.6 * S, -g.roll * 0.6 * S],
    head: [-g.lean * 0.6 + 0.04 * C2, g.twist * 0.6 * S, -g.roll * 1.4 * S],
    armL: [g.armBack + g.arm * S, 0, ARM_Z + g.armOut + 0.08 * C2],
    armR: [g.armBack - g.arm * S, 0, -ARM_Z - g.armOut - 0.08 * C2],
    foreArmL: [-g.elbow - 0.3 * Math.max(0, -S), 0, 0],
    foreArmR: [-g.elbow - 0.3 * Math.max(0, S), 0, 0],
    legL: leg(0, 1), legR: leg(Math.PI, -1), shinL: shin(0), shinR: shin(Math.PI),
  };
}
const WALK = { leg: 0.62, knee: 0.85, arm: 0.55, armOut: 0.08, armBack: 0, elbow: 0.25, lean: 0.04, bob: 0.016, stretch: 0.035, twist: 0.1, roll: 0.08 };
// corrida de anime: tronco inclinado e bracinhos jogados pra trás
const RUN = { leg: 1.05, knee: 1.5, arm: 0.16, armOut: 0.25, armBack: 1.15, elbow: 0.1, lean: 0.3, bob: 0.03, stretch: 0.05, twist: 0.13, roll: 0.05 };

function lookPose(t) {
  const y = keys(t, [[0, 0], [0.1, 0], [0.24, 1], [0.42, 1], [0.58, -1], [0.78, -1], [0.92, 0], [1, 0]]);
  const p = idlePose(t, 2);
  p.hips = [0, y * 0.12, p.hips[2]];
  p.torso = [p.torso[0], y * 0.22, p.torso[2]];
  p.head = [p.head[0] - Math.abs(y) * 0.05, y * 0.6, p.head[2] + y * 0.07];
  return p;
}
// pulinho de alegria: agacha, pula com os braços pra cima, amassa ao pousar
function cheerPose(t) {
  const p = idlePose(t, 1);
  const jump = keys(t, [[0, 0], [0.22, 0], [0.42, 1], [0.6, 0], [0.78, 0], [1, 0]]);
  const h = Math.sin(Math.min(1, Math.max(0, (t - 0.22) / 0.38)) * Math.PI);
  const arms = keys(t, [[0, 0], [0.16, -0.2], [0.34, 1], [0.6, 1], [0.8, 0], [1, 0]]);
  p.hipsY = 0.24 * h + keys(t, [[0, 0], [0.18, -0.04], [0.24, 0], [0.6, 0], [0.68, -0.04], [0.82, 0], [1, 0]]);
  p.squash = keys(t, [[0, 1], [0.18, 0.86], [0.3, 1.12], [0.52, 1.04], [0.66, 0.84], [0.8, 1.04], [0.9, 1], [1, 1]]);
  p.armL = [0, 0, ARM_Z + arms * 1.9];
  p.armR = [0, 0, -ARM_Z - arms * 1.9];
  p.foreArmL = p.foreArmR = [-0.2 + arms * 0.1, 0, 0];
  p.head = [-0.18 * jump, 0, 0];
  p.legL = [0.3 * h, 0, 0.03 + 0.25 * h];
  p.legR = [0.3 * h, 0, -0.03 - 0.25 * h];
  p.shinL = p.shinR = [0.5 * h, 0, 0];
  return p;
}

const clipCache = new Map();
function clips(D) {
  const key = D.L + '_' + D.cadence;
  if (!clipCache.has(key)) {
    const c = D.cadence;
    clipCache.set(key, {
      idle: makeClip('idle', IDLE_DUR, 28, (t) => idlePose(t), D.L),
      look: makeClip('look', IDLE_DUR * 2, 56, lookPose, D.L),
      cheer: makeClip('cheer', 1.5, 36, cheerPose, D.L),
      wave: makeClip('wave', 2.2, 66, wavePose, D.L),
      walk: makeClip('walk', WALK_DUR * c, 24, (t) => gaitPose(t, WALK), D.L),
      run: makeClip('run', RUN_DUR * c, 24, (t) => gaitPose(t, RUN), D.L),
    });
  }
  return clipCache.get(key);
}
const FIDGETS = ['look', 'cheer', 'wave'];

// ---------- contorno estilo anime (casca invertida) ----------
const outlineMat = new THREE.MeshBasicMaterial({ color: '#6b4545', side: THREE.BackSide });
outlineMat.onBeforeCompile = (sh) => {
  sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed += normalize(normal) * 0.009;');
};

const geoCache = new Map(); // esculturas já feitas (trocar de volta pra um estilo é instantâneo)
const cached = (key, make) => {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
};

export class Character {
  constructor(cfg) {
    this.group = new THREE.Group();
    this.group.scale.setScalar(SCALE);
    this.springs = new SpringSet();
    this.parts = {}; // nome -> { key, objs, springs, mats }
    this.wings = [];
    this.time = 0;
    this.mixer = new THREE.AnimationMixer(this.group);
    this.phase = 0;
    this.idleTime = 0;
    this.nextFidget = 4 + Math.random() * 4;
    this.fidget = null;
    this.fidgetLeft = 0;
    this.blinkT = 2;
    this.blinkHold = 0;
    this.setConfig(cfg);
  }

  // (re)cria o esqueleto pras medidas do corpo; descarta todas as partes
  buildSkeleton(D) {
    for (const p of Object.values(this.parts)) this.disposePart(p);
    this.parts = {};
    if (this.j) {
      this.group.remove(this.j.rig);
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.group);
    }
    this.bindM = new Map();
    this.bindInv = new Map();
    const j = (this.j = {});
    j.rig = new THREE.Object3D(); // inclinação e squash & stretch
    j.rig.name = 'rig';
    this.group.add(j.rig);
    this.bindM.set(j.rig, new THREE.Matrix4());
    const B = (name, parent, p, r) => (j[name] = this.bone(parent, p, r, name));
    B('hips', j.rig, [0, D.L, 0]);
    B('torso', j.hips, [0, 0.1, 0]);
    B('head', j.torso, [0, D.sh + 0.06 + D.neck, 0]);
    B('armL', j.torso, [D.shX, D.sh - 0.03, 0], [0, 0, ARM_BIND]);
    B('armR', j.torso, [-D.shX, D.sh - 0.03, 0], [0, 0, -ARM_BIND]);
    B('foreArmL', j.armL, [0, -D.ua, 0]);
    B('foreArmR', j.armR, [0, -D.ua, 0]);
    B('legL', j.hips, [D.hx, -0.02, 0]);
    B('legR', j.hips, [-D.hx, -0.02, 0]);
    B('shinL', j.legL, [0, -D.a, 0]);
    B('shinR', j.legR, [0, -D.a, 0]);
    this.main = NODES.map((n) => j[n]);

    this.clips = clips(D);
    this.act = {};
    this.w = {};
    for (const k in this.clips) {
      const a = this.mixer.clipAction(this.clips[k]);
      a.play();
      a.setEffectiveWeight(k === 'idle' ? 1 : 0);
      this.act[k] = a;
      this.w[k] = k === 'idle' ? 1 : 0;
    }
    this.act.walk.timeScale = 0;
    this.act.run.timeScale = 0;
    this.fidget = null;
    this.skel = D.skel;
    this.mixer.update(0);
  }

  // cria um osso e registra a pose de escultura (bind) dele em espaço de modelo
  bone(parent, p, r = [0, 0, 0], name = '') {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(p[0], p[1], p[2]);
    b.rotation.set(r[0], r[1], r[2]);
    parent.add(b);
    b.updateMatrix();
    const m = new THREE.Matrix4().multiplyMatrices(this.bindM.get(parent) || IDENT, b.matrix);
    this.bindM.set(b, m);
    this.bindInv.set(b, m.clone().invert());
    return b;
  }

  resetSprings() {
    this.springs.reset();
  }
  playFidget(name) {
    this.fidget = name;
    this.fidgetLeft = this.clips[name].duration;
    this.act[name].time = 0;
  }

  // ---------- montagem ----------
  setConfig(cfg) {
    this.cfg = cfg = { ...cfg };
    const D = (this.D = bodyDims(cfg));
    if (D.skel !== this.skel) this.buildSkeleton(D);
    const lowHat = cfg.hat === 1 || cfg.hat === 2;
    const tall = cfg.hat === 0 || cfg.hat === 3;
    this.part('body', 'body' + D.key, (P) => this.buildBody(P));
    this.part('outfit', `o${cfg.outfit}_${D.key}`, (P) => this.buildOutfit(P, cfg.outfit));
    this.part('hair', `h${cfg.hair}_${tall ? 1 : 0}`, (P) => this.buildHair(P, cfg.hair, tall));
    this.part('hat', 't' + cfg.hat, (P) => this.buildHat(P, cfg.hat));
    this.part('ears', `e${cfg.ears}_${lowHat ? 1 : 0}`, (P) => this.buildEars(P, cfg.ears, lowHat));
    this.part('back', `b${cfg.back}_${D.key}`, (P) => this.buildBack(P, cfg.back));

    // lista de molas na ordem das partes (pais sempre antes dos filhos)
    this.springs.list = Object.values(this.parts).flatMap((p) => p.springs);
    this.springs.reset();
    this.wings = this.parts.back.wings || [];

    // cores e texturas
    const colors = {
      skin: OPTIONS.skin[cfg.skin], hair: OPTIONS.hairColor[cfg.hairColor], acc: OPTIONS.accent[cfg.accent],
      accDark: shade(OPTIONS.accent[cfg.accent], -0.12), shirt: OPTIONS.shirtColor[cfg.shirtColor],
    };
    for (const p of Object.values(this.parts)) for (const m of p.mats) if (colors[m.userData.role]) m.color.set(colors[m.userData.role]);
    const om = this.parts.outfit.mats[0];
    om.map?.dispose();
    om.map = outfitTex(cfg, D);
    this.faceTex && Object.values(this.faceTex).forEach((t) => t.dispose());
    this.faceTex = { open: faceTex(cfg, 'open'), closed: faceTex(cfg, 'closed'), happy: faceTex(cfg, 'happy') };
    this.face.material.map = this.faceTex.open;
  }

  disposePart(p) {
    for (const o of p.objs) {
      o.parent?.remove(o);
      o.traverse((m) => { if (m.isSkinnedMesh) m.skeleton.dispose(); });
    }
    for (const m of p.mats) { m.map?.dispose(); m.dispose(); }
  }
  // refaz uma parte só se a "chave" de forma dela mudou
  part(name, key, build) {
    const old = this.parts[name];
    if (old?.key === key) return;
    if (old) this.disposePart(old);
    const P = { key, objs: [], springs: [], mats: [] };
    this.parts[name] = P;
    build(P);
  }

  mat(P, role, opts = {}) {
    const m = cozyMat({ color: role[0] === '#' ? role : '#ffffff', ...opts });
    m.userData.role = role;
    P.mats.push(m);
    return m;
  }
  // osso extra de uma parte; spring = parâmetros de física (ou null pra osso rígido)
  pbone(P, parent, p, r, spring) {
    const b = this.bone(parent, p, r);
    if (this.main.includes(parent)) P.objs.push(b);
    if (spring) {
      const before = this.springs.list.length;
      this.springs.add(b, spring);
      P.springs.push(...this.springs.list.splice(before));
    }
    return b;
  }
  // malha esculpida com esqueleto. prims usam ossos; bones = ossos extras além dos principais
  skinned(P, key, prims, material, { h = 0.013, extra = [], uv = null, outline = true, fall = 0.03 } = {}) {
    const bones = [...this.main, ...extra];
    const geo = cached(key + '|' + this.D.skel, () => {
      prepare(prims, this.bindInv);
      const bb = boundsOf(prims, 0.04);
      return sculpt(prims, { h, min: bb.min, max: bb.max, bones, uv, falloff: fall });
    });
    const inv = bones.map((b) => this.bindInv.get(b));
    const mk = (m) => {
      const s = new THREE.SkinnedMesh(geo, m);
      s.bind(new THREE.Skeleton(bones, inv), IDENT);
      s.frustumCulled = false;
      this.group.add(s);
      P.objs.push(s);
      return s;
    };
    const mesh = mk(material);
    mesh.castShadow = true;
    if (outline) mk(outlineMat);
    return mesh;
  }
  // peça rígida esculpida, presa a um osso/objeto (prims em espaço local, sem osso)
  piece(P, parent, key, prims, material, { h = 0.014, p = [0, 0, 0], r = [0, 0, 0], outline = true } = {}) {
    const geo = cached(key, () => {
      prepare(prims, null);
      const bb = boundsOf(prims, 0.04);
      return sculpt(prims, { h, min: bb.min, max: bb.max });
    });
    const m = new THREE.Mesh(geo, material);
    m.position.set(p[0], p[1], p[2]);
    m.rotation.set(r[0], r[1], r[2]);
    m.castShadow = true;
    if (outline) m.add(new THREE.Mesh(geo, outlineMat));
    parent.add(m);
    if (this.main.includes(parent)) P.objs.push(m);
    return m;
  }
  // detalhe pequeno feito de forma simples (miolo de flor, pupila, argola...)
  bit(P, parent, geo, material, p = [0, 0, 0], s = 1, r = [0, 0, 0]) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(p[0], p[1], p[2]);
    m.rotation.set(r[0], r[1], r[2]);
    if (Array.isArray(s)) m.scale.set(s[0], s[1], s[2]); else m.scale.setScalar(s);
    parent.add(m);
    if (this.main.includes(parent)) P.objs.push(m);
    return m;
  }

  // Corpo chibi estilizado: tronco é um "feijãozinho" liso que só alarga de leve embaixo (sem cintura),
  // pernas são tubinhos macios, pé e mão redondinhos. Nada de anatomia realista.
  bodyPrims() {
    const j = this.j, D = this.D, out = {};
    out.pelvis = ell(j.hips, [0, 0.0, -0.01], [D.pw, 0.18, D.pd], { k: 0.1 });
    out.waist = ell(j.torso, [0, D.sh * 0.3, 0], [(D.cw + D.pw) / 2, D.sh * 0.42, (D.cd + D.pd) / 2], { k: 0.16 });
    out.chest = ell(j.torso, [0, D.sh * 0.68, 0], [D.cw, D.sh * 0.34, D.cd], { k: 0.16 });
    if (D.chest > 0) out.bust = ell(j.torso, [0, D.sh * 0.6, D.cd * 0.42], [D.cw * 0.78, 0.05 + 0.025 * D.chest, D.cd * (0.55 + 0.12 * D.chest)], { k: 0.12 });
    out.neck = cap(j.torso, [0, D.sh - 0.06, 0], [0, D.sh + 0.04, 0], 0.08, 0.075, { k: 0.06 });
    for (const s of ['L', 'R']) {
      out['shoulder' + s] = ell(j['arm' + s], [0, -0.01, 0], [D.ar[0] * 1.2, D.ar[0] * 1.2, D.ar[0] * 1.15], { k: 0.06 });
      out['thigh' + s] = cap(j['leg' + s], [0, 0.02, 0], [0, -D.a, 0], D.th[0], D.th[1], { k: 0.025 });
      out['shin' + s] = cap(j['shin' + s], [0, 0, 0], [0, -D.a, 0], D.sn[0], D.sn[1], { k: 0.04 });
      out['foot' + s] = ell(j['shin' + s], [0, -D.a - 0.075, 0.03], D.foot, { k: 0.04 });
      out['arm' + s] = cap(j['arm' + s], [0, 0, 0], [0, -D.ua, 0], D.ar[0], D.ar[1], { k: 0.03 });
      out['fore' + s] = cap(j['foreArm' + s], [0, 0, 0], [0, -D.fa, 0], D.fr[0], D.fr[1], { k: 0.03 });
      out['hand' + s] = ell(j['foreArm' + s], [0, -D.fa - 0.035, 0], [D.hand, D.hand * 1.05, D.hand * 0.95], { k: 0.03 });
    }
    return out;
  }

  buildBody(P) {
    const j = this.j;
    const skin = this.mat(P, 'skin', { soft: true });
    this.skinned(P, 'body' + this.D.key, Object.values(this.bodyPrims()), skin, { h: 0.014 });
    // cabeça (rígida) + rosto colado na superfície
    const hp = headPrims();
    this.piece(P, j.head, 'head', hp, this.mat(P, 'skin', { soft: true }), { h: 0.026 });
    const f = fieldOf(hp), O = [0, 0.3, 0], NU = 26, NV = 20, pos = [], uvs = [], nrm = [], idx = [];
    for (let v = 0; v <= NV; v++) for (let u = 0; u <= NU; u++) {
      const az = -1.25 + 2.5 * (u / NU), el = 0.8 - 2.0 * (v / NV);
      const d = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
      const t = raycast(f, O, d, 1.2);
      const x = O[0] + d[0] * t, y = O[1] + d[1] * t, z = O[2] + d[2] * t, e = 0.004;
      const n = new THREE.Vector3(f(x + e, y, z) - f(x - e, y, z), f(x, y + e, z) - f(x, y - e, z), f(x, y, z + e) - f(x, y, z - e)).normalize();
      pos.push(x + n.x * 0.004, y + n.y * 0.004, z + n.z * 0.004);
      nrm.push(n.x, n.y, n.z);
      uvs.push(u / NU, 1 - v / NV);
      if (u < NU && v < NV) { const a = v * (NU + 1) + u, b = a + NU + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    this.face = new THREE.Mesh(g, this.mat(P, '#ffffff', { soft: true, transparent: true, rim: 0, alphaTest: 0.02 }));
    this.face.renderOrder = 2;
    j.head.add(this.face);
    P.objs.push(this.face);
  }

  buildOutfit(P, o) {
    const j = this.j, D = this.D, b = this.bodyPrims();
    const inf = (p, t, more) => ({ ...p, infl: t, ...more });
    const torsoUp = (t) => [inf(b.waist, t), inf(b.chest, t), ...(b.bust ? [inf(b.bust, t)] : [])];
    const prims = [], extra = [];
    if (o === 0) {
      // vestido: saia rodada em osso com mola (balança como sino), mangas bufantes, meias
      const sk = this.pbone(P, j.hips, [0, 0.07, 0], [0, 0, 0], { len: D.skirt, stiff: 34, drag: 0.35, gravity: 0, wind: 0.5, maxAngle: 0.2 });
      extra.push(sk);
      prims.push(cap(sk, [0, 0.01, 0], [0, -D.skirt, 0], D.pw * 0.9, D.pw * 1.75, { k: 0.02, fall: 0.06 }), plane(sk, [0, -D.skirt, 0], [0, -1, 0], { k: 0.012 }));
      prims.push(...torsoUp(0.012), inf(b.pelvis, 0.006, { k: 0.05 }), ell(j.torso, [0, D.sh, 0.03], [D.cw * 0.5, 0.035, D.cd * 0.75], { k: 0.015 }));
      for (const s of ['L', 'R']) prims.push(inf(b['shoulder' + s], 0.012), ell(j['arm' + s], [0, -0.05, 0], [D.ar[0] * 1.5, D.ar[0] * 1.55, D.ar[0] * 1.5], { k: 0.02 }), inf(b['shin' + s], 0.007, { k: 0.01 }));
    } else if (o === 1) {
      prims.push(inf(b.pelvis, 0.02), ...torsoUp(0.013));
      for (const s of ['L', 'R']) prims.push(inf(b['thigh' + s], 0.018), inf(b['shin' + s], 0.016), inf(b['shoulder' + s], 0.012), inf(b['arm' + s], 0.012));
      const cy = D.chestY, cz = D.cd + 0.008 + (D.chest ? 0.03 * D.chest : 0);
      prims.push(box(j.torso, [0, cy - 0.04, cz], [D.cw * 0.45, 0.09, 0.012], 0.02, { k: 0.02 }));
      for (const sg of [1, -1]) prims.push(cap(j.torso, [sg * D.cw * 0.4, cy + 0.04, cz - 0.01], [sg * D.cw * 0.5, D.sh + 0.01, 0], 0.025, 0.025, { k: 0.012 }), cap(j.torso, [sg * D.cw * 0.5, D.sh + 0.01, 0], [sg * D.cw * 0.3, cy - 0.06, -D.cd - 0.005], 0.025, 0.025, { k: 0.012 }));
    } else if (o === 2) {
      prims.push(inf(b.pelvis, 0.014));
      for (const s of ['L', 'R']) prims.push(inf(b['thigh' + s], 0.016), inf(b['shin' + s], 0.014));
      prims.push(...torsoUp(0.028), ell(j.torso, [0, -0.04, 0], [D.pw + 0.02, 0.075, D.pd + 0.03], { k: 0.05 }), ell(j.torso, [0, D.sh - 0.03, -D.cd * 0.85], [D.cw * 0.6, 0.1, 0.1], { k: 0.03 }));
      prims.push(box(j.torso, [0, 0.05, D.cd + 0.07], [D.cw * 0.42, 0.06, 0.012], 0.018, { k: 0.02 }));
      for (const s of ['L', 'R']) prims.push(inf(b['shoulder' + s], 0.02), inf(b['arm' + s], 0.02), inf(b['fore' + s], 0.02), ell(j['foreArm' + s], [0, -D.fa * 0.85, 0], [0.062, 0.024, 0.062], { k: 0.012 }));
    } else {
      prims.push(inf(b.pelvis, 0.017), inf(b.thighL, 0.017), inf(b.thighR, 0.017), plane(j.hips, [0, -0.02 - D.a * 0.42, 0], [0, -1, 0], { k: 0.012 }));
      prims.push(...torsoUp(0.013));
      for (const s of ['L', 'R']) prims.push(inf(b['shoulder' + s], 0.013), cap(j['arm' + s], [0, 0, 0], [0, -D.ua * 0.55, 0], D.ar[0] + 0.014, D.ar[0] + 0.012, { k: 0.02 }), cap(j['shin' + s], [0, -D.a, 0], [0, -D.a + 0.08, 0], D.sn[1] + 0.008, D.sn[1] + 0.012, { k: 0.01 }));
    }
    prims.push(inf(b.footL, 0.014), inf(b.footR, 0.014));
    const m = this.mat(P, '#ffffff', { frontBack: true });
    this.skinned(P, `outfit${o}_${D.key}`, prims, m, { h: 0.0145, extra, uv: outfitUV });
    P.mats.unshift(P.mats.pop()); // o material da roupa fica em mats[0] (recebe a textura)
  }

  // corrente de mechas com física: cada elo é um osso com mola; a mecha é uma malha só
  lockChain(P, parent, root, rot, radii, len, sp, prims, extra) {
    let b = this.pbone(P, parent, root, rot, { len, ...sp });
    for (let i = 0; i < radii.length - 1; i++) {
      extra.push(b);
      prims.push(cap(b, [0, 0, 0], [0, -len, 0], radii[i], radii[i + 1], { k: 0.06, fall: 0.045 }));
      if (i < radii.length - 2) b = this.pbone(P, b, [0, -len, 0], [0, 0, 0], { len, ...sp, stiff: (sp.stiff || 14) * 0.85 });
    }
  }

  // lâmina de cabelo: sequência de elipsoides achatados com física (fica liso, não "embolotado")
  sheetChain(P, parent, root, rot, widths, depth, len, sp, prims, extra) {
    let b = this.pbone(P, parent, root, rot, { len, ...sp });
    for (let i = 0; i < widths.length; i++) {
      extra.push(b);
      prims.push(ell(b, [0, -len * 0.5, 0], [widths[i], len * 0.72, depth * (1 - i * 0.08)], { k: 0.09, fall: 0.06 }));
      if (i < widths.length - 1) b = this.pbone(P, b, [0, -len, 0], [0, 0, 0], { len, ...sp, stiff: (sp.stiff || 14) * 0.85 });
    }
  }

  buildHair(P, style, tall) {
    const j = this.j, H = j.head, prims = [], extra = [];
    const hair = this.mat(P, 'hair', { soft: true });
    // calota: maior que a cabeça, puxada pra cima e pra trás; depois "recorta" o rosto
    prims.push(ell(H, [0, 0.38, -0.04], [0.5, 0.39, 0.47]));
    if (style === 2 || style === 6) prims.push(ell(H, [0, 0.2, -0.16], [0.5, 0.26, 0.38], { k: 0.08 }));
    if (style === 4) prims.push(plane(H, [0, 0.08, 0], [0, -1, 0], { k: 0.05 }));
    prims.push(ell(H, [0, 0.17, 0.44], [0.42, 0.34, 0.42], { op: 'sub', k: 0.035 }));
    // franja: mechas afiladas que descem pela testa (em 2 trechos pra acompanhar a curva)
    const bang = (az, tipAz, tipEl, r) => {
      const a = HP(az, 1.0, 0.05), m = HP((az + tipAz) / 2, (1.0 + tipEl) / 2 + 0.05, 0.085), e = HP(tipAz, tipEl, 0.075);
      prims.push(cap(H, a, m, r, r * 0.9, { k: 0.03 }), cap(H, m, e, r * 0.9, 0.05, { k: 0.03 }));
    };
    const spiky = style === 4;
    const fr = spiky ? 0.08 : 0;
    bang(-1.0, -1.14, -0.45, 0.13); bang(-0.68, -0.78, -0.2 + fr, 0.13); bang(-0.34, -0.4, -0.1 + fr, 0.135); bang(0.0, -0.02, -0.13 + fr, 0.14);
    bang(0.34, 0.4, -0.1 + fr, 0.135); bang(0.68, 0.78, -0.2 + fr, 0.13); bang(1.0, 1.14, -0.45, 0.13);
    // mechas laterais soltas, na frente da orelha
    for (const sg of [1, -1]) {
      const long = style === 0 || style === 1;
      if (long) {
        // cortina lisa dos lados do rosto, descendo até o peito (como nas referências)
        const a = HP(sg * 1.25, 0.55, 0.08), m = HP(sg * 1.25, -0.05, 0.14);
        prims.push(cap(H, a, m, 0.09, 0.095, { k: 0.06 }));
        this.sheetChain(P, H, m, [0, sg * 0.6, sg * 0.08], [0.1, 0.1, 0.09, 0.07, 0.04], 0.05, 0.15, { stiff: 18, maxAngle: 0.5, wind: 0.9, gravity: 0.5 }, prims, extra);
      } else {
        const a = HP(sg * 1.3, 0.5, 0.07), m = HP(sg * 1.27, -0.05, 0.1);
        prims.push(cap(H, a, m, 0.085, 0.075, { k: 0.03 }));
        this.lockChain(P, H, m, [0, 0, sg * 0.12], [0.075, 0.02], 0.2, { stiff: 20, maxAngle: 0.5, wind: 0.9 }, prims, extra);
      }
    }
    const ahoge = () => this.lockChain(P, H, [0.02, 0.76, 0.02], [0.5, 0, -2.3], [0.035, 0.028, 0.006], 0.11, { stiff: 22, gravity: 0, maxAngle: 0.8, wind: 1.6 }, prims, extra);

    if (style === 0) {
      // chiquinhas compridas
      for (const sg of [1, -1]) {
        this.lockChain(P, H, [sg * 0.47, 0.56, -0.1], [0.1, 0, sg * 0.5], [0.09, 0.125, 0.13, 0.105, 0.065, 0.02], 0.17, { stiff: 11, maxAngle: 0.8, gravity: 0.6 }, prims, extra);
        this.bit(P, H, new THREE.SphereGeometry(0.075, 10, 8), this.mat(P, 'acc'), [sg * 0.475, 0.565, -0.1]).add(new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), outlineMat));
      }
      if (tall) ahoge();
    } else if (style === 1) {
      // cabelão solto até a cintura
      // cabelão liso até a cintura: 4 mechas largas atrás
      for (const sg of [1, -1]) {
        this.sheetChain(P, H, [sg * 0.17, 0.3, -0.33], [-0.06, sg * 0.3, sg * 0.03], [0.24, 0.27, 0.27, 0.25, 0.2, 0.1], 0.09, 0.2, { stiff: 13, maxAngle: 0.5, gravity: 0.5 }, prims, extra);
      }
      if (tall) ahoge();
    } else if (style === 2) {
      // chanel com pontinhas viradas
      for (const az of [1.9, 2.5, 3.14, -2.5, -1.9]) prims.push(cap(H, HP(az, -0.45, 0.02), HP(az, -0.95, 0.42), 0.12, 0.02, { k: 0.03 }));
      if (tall) ahoge();
    } else if (style === 3) {
      this.lockChain(P, H, [0, 0.72, -0.4], [-0.95, 0, 0], [0.09, 0.14, 0.145, 0.11, 0.06, 0.02], 0.165, { stiff: 11, maxAngle: 0.8, gravity: 0.6 }, prims, extra);
      this.bit(P, H, new THREE.TorusGeometry(0.085, 0.03, 6, 14), this.mat(P, 'acc'), [0, 0.73, -0.41], 1, [0.6, 0, 0]);
    } else if (style === 4) {
      // espetado
      const sp = [[0, 1.25], [0.9, 1.05], [-0.9, 1.05], [2.2, 0.95], [-2.2, 0.95], [3.14, 0.8], [1.5, 0.6], [-1.5, 0.6], [2.4, 0.35], [-2.4, 0.35], [3.14, 0.15], [1.75, 0.05], [-1.75, 0.05], [2.7, -0.2], [-2.7, -0.2]];
      for (const s of sp) if (tall || s[1] < 0.9) prims.push(cap(H, HP(s[0], s[1], -0.05), HP(s[0] * 1.03, s[1] - 0.08, 0.6), 0.17, 0.02, { k: 0.02 }));
    } else if (style === 5) {
      for (const sg of [1, -1]) {
        prims.push(tall ? ell(H, [sg * 0.33, 0.83, -0.08], [0.17, 0.16, 0.17], { k: 0.025 }) : ell(H, [sg * 0.38, 0.5, -0.4], [0.17, 0.17, 0.16], { k: 0.025 }));
        this.lockChain(P, H, tall ? [sg * 0.42, 0.72, -0.12] : [sg * 0.44, 0.4, -0.42], [0, 0, sg * 0.5], [0.05, 0.045, 0.01], 0.13, { stiff: 16, maxAngle: 0.8 }, prims, extra);
      }
      for (const az of [2.3, 3.14, -2.3]) prims.push(cap(H, HP(az, -0.5, 0.02), HP(az, -0.95, 0.3), 0.1, 0.012, { k: 0.03 }));
    } else {
      // fofinho: nuvem de cachos
      const puffs = [[0, 1.2, 0.12], [0.8, 0.9, 0.13], [-0.8, 0.9, 0.13], [1.7, 0.7, 0.14], [-1.7, 0.7, 0.14], [2.6, 0.8, 0.13], [-2.6, 0.8, 0.13], [1.5, 0.1, 0.16], [-1.5, 0.1, 0.16], [2.3, 0.15, 0.16], [-2.3, 0.15, 0.16], [3.14, 0.3, 0.16], [1.9, -0.5, 0.14], [-1.9, -0.5, 0.14], [2.7, -0.45, 0.15], [-2.7, -0.45, 0.15]];
      for (const p of puffs) if (tall || p[1] < 1) prims.push(ell(H, HP(p[0], p[1], 0.1), [p[2] + 0.03, p[2], p[2] + 0.03], { k: 0.025 }));
    }
    this.skinned(P, P.key, prims, hair, { h: 0.016, extra, fall: 0.04 });
  }

  buildHat(P, hat) {
    const H = this.j.head, top = 0.78;
    if (hat === 1) {
      // boina com cabinho
      const m = this.piece(P, H, 'beret', [ell(null, [0.04, 0.08, 0], [0.4, 0.13, 0.38]), ell(null, [0, 0.01, 0], [0.31, 0.055, 0.3], { k: 0.03 }), cap(null, [0.04, 0.19, 0], [0.065, 0.27, 0], 0.02, 0.012, { k: 0.015 })], this.mat(P, 'acc'), { p: [0.07, top - 0.02, -0.03], r: [0.12, 0, -0.24] });
      void m;
    } else if (hat === 2) {
      // chapéu de sol com fita e flor
      // aba e copa numa curva só (torneado), bem lisa
      const prof = [[0.001, 0.27], [0.12, 0.262], [0.24, 0.225], [0.32, 0.16], [0.36, 0.08], [0.375, 0.03], [0.46, 0.012], [0.6, -0.002], [0.7, -0.012], [0.715, -0.03], [0.6, -0.03], [0.001, -0.03]].reverse().map((v) => new THREE.Vector2(v[0], v[1]));
      const lathe = cached('sunhat', () => new THREE.LatheGeometry(prof, 28));
      const g = this.bit(P, H, lathe, this.mat(P, '#f6dc8c'), [0, top - 0.09, -0.02], 1, [-0.17, 0, 0.07]);
      g.castShadow = true;
      g.add(new THREE.Mesh(lathe, outlineMat));
      this.bit(P, g, new THREE.TorusGeometry(0.365, 0.035, 6, 24), this.mat(P, 'acc'), [0, 0.065, 0], [1, 1, 0.8], [Math.PI / 2, 0, 0]);
      const f = new THREE.Object3D();
      f.position.set(0.27, 0.11, 0.27);
      f.rotation.set(-0.55, 0.75, 0);
      g.add(f);
      const petal = this.mat(P, '#ffffff'), petalG = new THREE.SphereGeometry(0.062, 8, 6);
      for (let i = 0; i < 5; i++) this.bit(P, f, petalG, petal, [Math.cos(i * 1.257) * 0.078, 0, Math.sin(i * 1.257) * 0.078], [1, 0.5, 1]);
      this.bit(P, f, new THREE.SphereGeometry(0.047, 8, 6), this.mat(P, '#ffd24a'), [0, 0.022, 0]);
      this.ribbonTails(P, g, [0, 0.05, -0.36], 0.2);
    } else if (hat === 3) {
      // laço grande com pontas soltas
      const g = this.piece(P, H, 'bow', [ell(null, [0.19, 0.02, 0], [0.2, 0.15, 0.07]), ell(null, [-0.19, 0.02, 0], [0.2, 0.15, 0.07]), ell(null, [0, 0, 0.01], [0.075, 0.085, 0.075], { k: 0.02 }), ell(null, [0.1, 0.02, 0], [0.05, 0.2, 0.2], { op: 'sub', k: 0.04 }), ell(null, [-0.1, 0.02, 0], [0.05, 0.2, 0.2], { op: 'sub', k: 0.04 }), ell(null, [0, 0, 0.01], [0.07, 0.08, 0.07], { k: 0.02 })], this.mat(P, 'acc'), { h: 0.012, p: [0, top + 0.03, -0.14], r: [-0.3, 0, 0] });
      this.ribbonTails(P, g, [0, -0.03, -0.05], 0.17);
    } else if (hat === 4) {
      const gold = this.mat(P, '#f8d45c');
      const g = this.bit(P, H, new THREE.CylinderGeometry(0.15, 0.13, 0.09, 12, 1, true), this.mat(P, '#f8d45c', { side: THREE.DoubleSide }), [0.15, top - 0.02, 0.02], 1.5, [0.05, 0, -0.32]);
      for (let i = 0; i < 5; i++) this.bit(P, g, new THREE.ConeGeometry(0.045, 0.1, 4), gold, [Math.cos(i * 1.257) * 0.14, 0.09, Math.sin(i * 1.257) * 0.14]);
      this.bit(P, g, new THREE.SphereGeometry(0.03, 8, 6), this.mat(P, 'acc'), [0, 0, 0.15]);
    } else if (hat === 5) {
      const g = this.piece(P, H, 'frog', [ell(null, [0, 0.06, 0], [0.16, 0.1, 0.14]), ell(null, [0.075, 0.15, 0.04], [0.055, 0.055, 0.055], { k: 0.03 }), ell(null, [-0.075, 0.15, 0.04], [0.055, 0.055, 0.055], { k: 0.03 })], this.mat(P, '#86d470'), { h: 0.01, p: [0, top + 0.01, 0.04] });
      const eye = this.mat(P, LINE);
      for (const sg of [1, -1]) this.bit(P, g, new THREE.SphereGeometry(0.022, 8, 6), eye, [sg * 0.08, 0.16, 0.085]);
    }
  }
  // duas fitinhas soltas ao vento
  ribbonTails(P, parent, at, len) {
    const g = cached('ribbon' + len, () => new THREE.SphereGeometry(1, 10, 8).scale(0.045, len * 0.6, 0.014).translate(0, -len * 0.5, 0));
    for (const sg of [1, -1]) {
      const b = this.pbone(P, parent, [at[0] + sg * 0.05, at[1], at[2]], [-0.45, 0, sg * 0.35], { len, stiff: 9, maxAngle: 1.1, wind: 1.8, gravity: 0.3 });
      const m = this.bit(P, b, g, this.mat(P, 'acc'));
      m.add(new THREE.Mesh(g, outlineMat));
      const b2 = this.pbone(P, b, [0, -len * 0.9, 0], [0, 0, 0], { len, stiff: 7, maxAngle: 1.1, wind: 2, gravity: 0.3 });
      this.bit(P, b2, g, this.mat(P, 'acc'), [0, 0, 0], 0.85).add(new THREE.Mesh(g, outlineMat));
    }
  }

  buildEars(P, ears, lowHat) {
    const H = this.j.head;
    if (ears === 1) {
      for (const sg of [1, -1]) {
        const at = HP(sg * 0.75, lowHat ? 0.7 : 0.95, 0.1);
        const b = this.pbone(P, H, at, [0.05, 0, -sg * 0.38], { len: 0.2, stiff: 42, drag: 0.4, gravity: 0, wind: 0.5, maxAngle: 0.28, up: true });
        this.piece(P, b, 'catear', [cap(null, [0, -0.04, 0], [0, 0.22, 0], 0.15, 0.02), plane(null, [0, 0, 0.055], [0, 0, 1], { k: 0.03 }), plane(null, [0, 0, -0.06], [0, 0, -1], { k: 0.03 })], this.mat(P, 'hair'), { h: 0.012 });
        this.bit(P, b, new THREE.ConeGeometry(0.085, 0.17, 8), this.mat(P, '#ffb3c6'), [0, 0.07, 0.045], [1, 1, 0.3]);
      }
    } else if (ears === 2) {
      for (const sg of [1, -1]) {
        const b = this.pbone(P, H, [sg * 0.17, 0.82, lowHat ? -0.24 : -0.05], [lowHat ? -0.6 : -0.1, 0, -sg * 0.22], { len: 0.3, stiff: 18, drag: 0.3, gravity: 0, maxAngle: 0.6, up: true, wind: 1.2 });
        this.piece(P, b, 'bunnyear', [ell(null, [0, 0.22, 0], [0.095, 0.27, 0.05])], this.mat(P, '#ffffff'), { h: 0.012 });
        this.bit(P, b, new THREE.SphereGeometry(1, 10, 8), this.mat(P, '#ffb3c6'), [0, 0.23, 0.035], [0.05, 0.19, 0.025]);
      }
    } else if (ears === 3) {
      for (const sg of [1, -1]) {
        const at = HP(sg * 0.95, lowHat ? 0.6 : 0.82, 0.04);
        this.piece(P, H, 'horn' + sg, [cap(null, [0, 0, 0], [sg * 0.09, 0.11, 0], 0.075, 0.062), cap(null, [sg * 0.09, 0.11, 0], [sg * 0.2, 0.17, -0.02], 0.062, 0.042, { k: 0.02 }), cap(null, [sg * 0.2, 0.17, -0.02], [sg * 0.31, 0.15, -0.06], 0.042, 0.008, { k: 0.02 })], this.mat(P, '#54445a'), { h: 0.011, p: at });
      }
    } else if (ears === 4) {
      const g = this.piece(P, H, 'unihorn', [cap(null, [0, 0, 0], [0, 0.3, 0], 0.062, 0.008)], this.mat(P, '#fff3c4'), { h: 0.01, p: HP(0, 1.02, 0.04), r: [0.55, 0, 0] });
      const ring = this.mat(P, '#ffb3c6');
      for (let i = 0; i < 3; i++) this.bit(P, g, new THREE.TorusGeometry(0.058 - i * 0.014, 0.012, 5, 12), ring, [0, 0.04 + i * 0.075, 0], 1, [Math.PI / 2, 0, 0]);
    } else if (ears === 5) {
      for (const sg of [1, -1]) {
        this.piece(P, H, 'elf' + sg, [cap(null, [0, 0, 0], [sg * 0.23, 0.1, -0.06], 0.075, 0.01), plane(null, [0, 0, 0.03], [0, 0, 1], { k: 0.02 }), plane(null, [0, 0, -0.045], [0, 0, -1], { k: 0.02 })], this.mat(P, 'skin', { soft: true }), { h: 0.01, p: [sg * 0.47, 0.27, 0.02] });
      }
    }
  }

  buildBack(P, back) {
    const j = this.j, D = this.D;
    const backZ = -D.cd - 0.01;
    if (back === 1) {
      P.wings = [];
      for (const sg of [1, -1]) {
        const w = this.pbone(P, j.torso, [sg * 0.05, D.sh * 0.72, backZ], [0, sg * 0.5, 0]);
        w.userData.sg = sg;
        P.wings.push(w);
        this.piece(P, w, 'wing' + sg, [ell(null, [sg * 0.17, 0.09, 0], [0.2, 0.08, 0.03]), ell(null, [sg * 0.15, -0.02, 0], [0.17, 0.07, 0.03], { k: 0.02 }), ell(null, [sg * 0.11, -0.1, 0], [0.12, 0.055, 0.028], { k: 0.02 })], this.mat(P, '#ffffff'), { h: 0.011 }).scale.setScalar(1.6);
      }
    } else if (back === 2) {
      // capa até o joelho: 3 colunas de ossos com mola, uma malha só
      const seg = (D.sh + 0.12 + (D.L - D.kneeY) * 0.6) / 3;
      const prims = [ell(j.torso, [0, D.sh - 0.01, -0.01], [D.cw + 0.025, 0.05, D.cd + 0.03])], extra = [];
      for (const [x, ry] of [[-D.cw * 0.8, -0.45], [0, 0], [D.cw * 0.8, 0.45]]) {
        let b = this.pbone(P, j.torso, [x, D.sh - 0.03, backZ + 0.02 + Math.abs(x) * 0.25], [-0.12, ry, 0], { len: seg, stiff: 14, maxAngle: 0.9, wind: 1.5, gravity: 0.3 });
        for (let i = 0; i < 3; i++) {
          extra.push(b);
          prims.push(ell(b, [0, -seg * 0.5, 0], [0.105 + i * 0.016, seg * 0.72, 0.022], { k: 0.03, fall: 0.05 }));
          if (i < 2) b = this.pbone(P, b, [0, -seg, 0], [0, 0, 0], { len: seg, stiff: 11 - i * 2, maxAngle: 0.9, wind: 1.7, gravity: 0.3 });
        }
      }
      this.skinned(P, 'cape' + D.key, prims, this.mat(P, 'acc'), { h: 0.013, extra, fall: 0.05 });
    } else if (back === 3) {
      const prims = [], extra = [];
      let b = this.pbone(P, j.hips, [0, -0.06, -D.pd - 0.02], [1.75, 0, 0], { len: 0.12, stiff: 20, gravity: 0, maxAngle: 0.5, wind: 0.6 });
      for (let i = 0; i < 5; i++) {
        extra.push(b);
        prims.push(cap(b, [0, 0, 0], [0, -0.12, 0], 0.05, i === 4 ? 0.045 : 0.05, { k: 0.02, fall: 0.04 }));
        if (i < 4) b = this.pbone(P, b, [0, -0.12, 0], [0.35, 0, 0], { len: 0.12, stiff: 14 - i * 1.5, gravity: 0, maxAngle: 0.7, wind: 1 });
      }
      this.skinned(P, 'tail' + D.key, prims, this.mat(P, 'hair'), { h: 0.009, extra });
    } else if (back === 4) {
      this.piece(P, j.torso, 'pack', [box(null, [0, 0, 0], [0.11, 0.12, 0.05], 0.05), box(null, [0, -0.05, -0.075], [0.07, 0.05, 0.015], 0.025, { k: 0.015 }), ell(null, [0, 0.13, 0.01], [0.12, 0.05, 0.08], { k: 0.03 })], this.mat(P, 'acc'), { h: 0.011, p: [0, D.chestY - 0.02, backZ - 0.07] });
      for (const sg of [1, -1]) this.bit(P, j.torso, new THREE.TorusGeometry(D.sh * 0.3, 0.016, 5, 16, Math.PI * 1.1), this.mat(P, 'accDark'), [sg * 0.075, D.chestY + 0.02, -0.01], [0.75, 1, 1.15], [0, Math.PI / 2, -0.3]);
    }
  }

  // inclinação procedural do corpo (ex.: deitar nas curvas); chamada pelo jogador
  setLean(pitch, roll) {
    this.j.rig.rotation.set(pitch, 0, roll);
  }

  // speed em unidades/s; walkSpeed/runSpeed dizem como misturar caminhada e corrida
  update(dt, speed = 0, walkSpeed = 1.9, runSpeed = 4.2) {
    this.time += dt;
    const w = this.w;
    const moving = speed > 0.08;
    const runMix = THREE.MathUtils.clamp((speed - walkSpeed) / (runSpeed - walkSpeed), 0, 1);
    const move = THREE.MathUtils.clamp(speed / (walkSpeed * 0.6), 0, 1);

    if (moving) {
      this.idleTime = 0;
      this.fidget = null;
    } else if (this.fidget) {
      this.fidgetLeft -= dt;
      if (this.fidgetLeft <= 0.25) { this.fidget = null; this.idleTime = 0; this.nextFidget = 5 + Math.random() * 6; }
    } else if ((this.idleTime += dt) > this.nextFidget) {
      this.playFidget(FIDGETS[(Math.random() * FIDGETS.length) | 0]);
    }
    const target = { idle: 1 - move, look: 0, cheer: 0, wave: 0, walk: move * (1 - runMix), run: move * runMix };
    if (this.fidget) { target[this.fidget] = 1 - move; target.idle = 0; }
    const k = 1 - Math.exp(-dt * 10);
    for (const n in w) {
      w[n] += (target[n] - w[n]) * (n === 'look' ? 1 - Math.exp(-dt * 5) : k);
      this.act[n].setEffectiveWeight(w[n]);
    }
    // caminhada e corrida compartilham a mesma fase, então a mistura não "tropeça"
    const wd = this.clips.walk.duration, rd = this.clips.run.duration;
    const dur = THREE.MathUtils.lerp(wd, rd, runMix);
    const rate = moving ? THREE.MathUtils.clamp(speed / THREE.MathUtils.lerp(walkSpeed, runSpeed, runMix), 0.6, 1.3) : 1;
    this.phase = (this.phase + (dt / dur) * rate) % 1;
    this.act.walk.time = this.phase * wd;
    this.act.run.time = this.phase * rd;
    this.mixer.update(dt);

    // asinhas batendo (mais rápido ao correr)
    for (const wg of this.wings) wg.rotation.y = wg.userData.sg * (0.45 + 0.4 * Math.sin(this.time * (5 + speed * 2.5)));

    // física dos penduricalhos
    this.group.updateMatrixWorld(true);
    this.springs.update(dt, this.time);

    // rosto: pisca; fica de olhinho fechado feliz no pulinho
    this.blinkT -= dt;
    let face = this.faceTex.open;
    if (this.fidget === 'cheer' && this.fidgetLeft > 0.45) face = this.faceTex.happy;
    else if (this.blinkHold > 0) { this.blinkHold -= dt; face = this.faceTex.closed; }
    else if (this.blinkT <= 0) { this.blinkHold = 0.11; this.blinkT = Math.random() < 0.2 ? 0.3 : 2 + Math.random() * 3.5; }
    if (this.face.material.map !== face) this.face.material.map = face;
  }
}
