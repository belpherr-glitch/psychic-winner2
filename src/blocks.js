// Block registry and procedural pixel-art texture atlas.
import * as THREE from 'three';
import { Painter, shade, mix } from './pixel.js';

export const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, SNOW: 5, ICE: 6, LOG: 7, LEAVES: 8, PINE_LEAVES: 9,
  PLANKS: 10, COPPER_ORE: 11, IRON_ORE: 12, GOLD_ORE: 13, CRYSTAL_ORE: 14, PRISM_GRASS: 15, MOONSTONE: 16,
  PRISM_PINK: 17, PRISM_GOLD: 18, PRISM_LILAC: 19, PALE_LOG: 20, WATER: 21, BEDROCK: 22, BRICK: 23,
  WORKBENCH: 24, TORCH: 25, CACTUS: 26, SANDSTONE: 27, TALL_GRASS: 28, FLOWER_RED: 29, FLOWER_YELLOW: 30,
  PRISM_TUFT: 31, MUSHROOM: 32, DEAD_BUSH: 33, FURNACE: 34, SNOWY_DIRT: 35, DARK_LEAVES: 36, PINE_LOG: 37,
  GLOWCAP: 38, CLOUD: 39,
};

// render: cube | cross | torch | water | none
// filter: light reduction when passing through (15 = blocks light)
const DEF = [];
function def(id, name, o) {
  DEF[id] = Object.assign({
    id, name, render: 'cube', solid: true, opaque: true, filter: 15, hardness: 1, tool: 'pick',
    drop: id, emit: 0, tex: null, replaceable: false,
  }, o);
}

def(B.AIR, 'Ar', { render: 'none', solid: false, opaque: false, filter: 0, drop: 0, replaceable: true });
def(B.GRASS, 'Grama', { tex: ['grass_top', 'grass_side', 'dirt'], hardness: 0.5, tool: 'shovel', drop: B.DIRT });
def(B.DIRT, 'Terra', { tex: 'dirt', hardness: 0.45, tool: 'shovel' });
def(B.STONE, 'Pedra', { tex: 'stone', hardness: 1.4 });
def(B.SAND, 'Areia', { tex: 'sand', hardness: 0.45, tool: 'shovel' });
def(B.SNOW, 'Neve', { tex: 'snow', hardness: 0.4, tool: 'shovel' });
def(B.ICE, 'Gelo', { tex: 'ice', hardness: 0.6 });
def(B.LOG, 'Madeira', { tex: ['log_top', 'log_side', 'log_top'], hardness: 1.1, tool: 'axe' });
def(B.LEAVES, 'Folhas', { tex: 'leaves', hardness: 0.2, tool: 'axe', filter: 2, drop: 0 });
def(B.PINE_LEAVES, 'Folhas de Pinho', { tex: 'pine_leaves', hardness: 0.2, tool: 'axe', filter: 2, drop: 0 });
def(B.PLANKS, 'Tábuas', { tex: 'planks', hardness: 0.9, tool: 'axe' });
def(B.COPPER_ORE, 'Minério de Cobre', { tex: 'copper_ore', hardness: 2.0 });
def(B.IRON_ORE, 'Minério de Ferro', { tex: 'iron_ore', hardness: 2.6 });
def(B.GOLD_ORE, 'Minério de Ouro', { tex: 'gold_ore', hardness: 3.0 });
def(B.CRYSTAL_ORE, 'Cristal Prismático', { tex: 'crystal_ore', hardness: 2.4, emit: 7 });
def(B.PRISM_GRASS, 'Grama Prismática', { tex: ['prism_grass_top', 'prism_grass_side', 'dirt'], hardness: 0.5, tool: 'shovel', drop: B.DIRT });
def(B.MOONSTONE, 'Pedra-lua', { tex: 'moonstone', hardness: 1.5 });
def(B.PRISM_PINK, 'Folhas Rosadas', { tex: 'prism_pink', hardness: 0.2, tool: 'axe', filter: 2, drop: 0 });
def(B.PRISM_GOLD, 'Folhas Douradas', { tex: 'prism_gold', hardness: 0.2, tool: 'axe', filter: 2, drop: 0 });
def(B.PRISM_LILAC, 'Folhas Lilás', { tex: 'prism_lilac', hardness: 0.2, tool: 'axe', filter: 2, drop: 0 });
def(B.PALE_LOG, 'Madeira Pálida', { tex: ['pale_log_top', 'pale_log_side', 'pale_log_top'], hardness: 1.1, tool: 'axe' });
def(B.WATER, 'Água', { render: 'water', solid: false, opaque: false, filter: 1, drop: 0, hardness: -1, replaceable: true });
def(B.BEDROCK, 'Rocha Matriz', { tex: 'bedrock', hardness: -1, drop: 0 });
def(B.BRICK, 'Tijolo de Pedra', { tex: 'brick', hardness: 1.6 });
def(B.WORKBENCH, 'Bancada', { tex: ['bench_top', 'bench_side', 'planks'], hardness: 0.8, tool: 'axe' });
def(B.TORCH, 'Tocha', { render: 'torch', solid: false, opaque: false, filter: 0, hardness: 0.05, tool: 'none', emit: 14, tex: 'torch' });
def(B.CACTUS, 'Cacto', { tex: ['cactus_top', 'cactus_side', 'cactus_top'], hardness: 0.5, tool: 'axe' });
def(B.SANDSTONE, 'Arenito', { tex: ['sandstone_top', 'sandstone_side', 'sandstone_top'], hardness: 1.2 });
const plant = { render: 'cross', solid: false, opaque: false, filter: 0, hardness: 0.02, tool: 'none', replaceable: true };
def(B.TALL_GRASS, 'Capim', Object.assign({ tex: 'tall_grass', drop: 0 }, plant));
def(B.FLOWER_RED, 'Flor Rubi', Object.assign({ tex: 'flower_red' }, plant));
def(B.FLOWER_YELLOW, 'Flor Solar', Object.assign({ tex: 'flower_yellow' }, plant));
def(B.PRISM_TUFT, 'Broto de Cristal', Object.assign({ tex: 'prism_tuft', drop: 0, emit: 5 }, plant));
def(B.MUSHROOM, 'Cogumelo', Object.assign({ tex: 'mushroom' }, plant));
def(B.DEAD_BUSH, 'Arbusto Seco', Object.assign({ tex: 'dead_bush', drop: 0 }, plant));
def(B.GLOWCAP, 'Cogumelo Brilhante', Object.assign({ tex: 'glowcap', emit: 9 }, plant));
def(B.FURNACE, 'Fornalha', { tex: ['furnace_top', 'furnace_side', 'furnace_top'], hardness: 1.6, emit: 10 });
def(B.SNOWY_DIRT, 'Terra Nevada', { tex: ['snow', 'snow_side', 'dirt'], hardness: 0.5, tool: 'shovel', drop: B.DIRT });
def(B.DARK_LEAVES, 'Folhas Densas', { tex: 'dark_leaves', hardness: 0.2, tool: 'axe', filter: 2, drop: 0 });
def(B.PINE_LOG, 'Madeira de Pinho', { tex: ['pine_log_top', 'pine_log_side', 'pine_log_top'], hardness: 1.1, tool: 'axe', drop: B.LOG });
def(B.CLOUD, 'Nuvem', { tex: 'cloud', hardness: 0.3, tool: 'none' });

export const BLOCKS = DEF;
export const NUM_BLOCKS = DEF.length;

// Fast lookup tables used by the mesher/physics.
export const OPAQUE = new Uint8Array(256);
export const SOLID = new Uint8Array(256);
export const FILTER = new Uint8Array(256);
export const EMIT = new Uint8Array(256);
export const RENDER = new Uint8Array(256); // 0 none 1 cube 2 cross 3 torch 4 water
// Natural terrain is drawn as a smooth surface instead of cubes.
export const SMOOTH = new Uint8Array(256);
for (const id of [B.GRASS, B.DIRT, B.STONE, B.SAND, B.SNOW, B.ICE, B.COPPER_ORE, B.IRON_ORE, B.GOLD_ORE, B.CRYSTAL_ORE,
  B.PRISM_GRASS, B.MOONSTONE, B.BEDROCK, B.SANDSTONE, B.SNOWY_DIRT, B.CLOUD]) SMOOTH[id] = 1;
for (const d of DEF) {
  if (!d) continue;
  OPAQUE[d.id] = d.opaque ? 1 : 0;
  SOLID[d.id] = d.solid ? 1 : 0;
  FILTER[d.id] = d.filter;
  EMIT[d.id] = d.emit;
  RENDER[d.id] = { none: 0, cube: 1, cross: 2, torch: 3, water: 4 }[d.render];
}

// ---------------------------------------------------------------- textures
const T = 16;
const PAL = {
  grass: ['#2f6f26', '#3a8a2e', '#46a137', '#53b542', '#68c752'],
  dirt: ['#5a3a22', '#6e482b', '#7d5534', '#8e6540', '#9d744d'],
  stone: ['#6c6e76', '#7a7c84', '#878992', '#9496a0'],
  sand: ['#cdb06c', '#d9bf7c', '#e4cc8c', '#eed99e'],
  snow: ['#cfdcee', '#dde8f5', '#eaf2fb', '#f7fbff'],
  ice: ['#7ab8e0', '#8ec7ea', '#a5d6f2', '#c4e7fa'],
  bark: ['#4a3019', '#5a3c22', '#6b4a2b', '#7c5734'],
  ring: ['#8f6a3e', '#a8804f', '#b8925e', '#c9a46e'],
  leaves: ['#1c5221', '#256a2a', '#2f7d32', '#3b9440', '#4cab4f'],
  dark: ['#123d1c', '#195025', '#21622d', '#2b7637', '#378a42'],
  pine: ['#14362a', '#1c4635', '#245640', '#2d684d', '#3a7b5c'],
  planks: ['#8f6638', '#a87b47', '#b98a52', '#c99a60'],
  prism: ['#2f9fbf', '#3bb7cf', '#52cadb', '#74dbe8', '#a5eef4'],
  moon: ['#9a8cbc', '#ac9fcd', '#bdb1dc', '#cfc5ea'],
  pink: ['#c24f86', '#d9629a', '#f07bb0', '#f597c2', '#ffbadb'],
  gold: ['#b98a24', '#d9ab33', '#f2c94c', '#f7d96e', '#fff0b0'],
  lilac: ['#6d55b8', '#8f72d6', '#a98bea', '#bba3f2', '#dccdfc'],
  pale: ['#c7bfaa', '#d8d1c0', '#e9e4d8', '#f5f1e6'],
  bedrock: ['#1b1b20', '#26262c', '#33333a', '#44444c'],
  sandstone: ['#c2a35e', '#cdb06c', '#d9bf7c', '#e4cc8c'],
  cactus: ['#2a6328', '#357a32', '#42913c', '#52a849'],
};

const painters = {};
function tile(name, fn) { painters[name] = fn; }

tile('grass_top', (p) => {
  p.clouds(PAL.grass.slice(1), 4, 1, 0.35);
  for (let i = 0; i < 26; i++) { // blade highlights
    const x = p.ri(16), y = p.ri(16);
    p.set(x, y, PAL.grass[4]); p.setW(x, y + 1, PAL.grass[1]);
  }
  for (let i = 0; i < 6; i++) p.set(p.ri(16), p.ri(16), '#7fd65e');
});
tile('dirt', (p) => {
  p.clouds(PAL.dirt.slice(0, 4), 4, 2, 0.4);
  for (let i = 0; i < 7; i++) { // pebbles
    const x = p.ri(15), y = p.ri(15);
    p.set(x, y, PAL.dirt[4]); p.set(x + 1, y, PAL.dirt[3]); p.set(x, y + 1, PAL.dirt[1]); p.set(x + 1, y + 1, PAL.dirt[0]);
  }
});
function grassSide(p, top, base = 'dirt') {
  painters[base](p);
  const h = new Array(16).fill(0).map(() => 3 + p.ri(3));
  for (let x = 0; x < 16; x++) {
    if (p.rand() < 0.3) h[x] += 2;
    for (let y = 0; y < h[x]; y++) p.set(x, y, top[Math.min(top.length - 1, Math.max(0, top.length - 1 - y + p.ri(2)))]);
    p.set(x, h[x], shade(top[0], 0.7));
  }
}
tile('grass_side', (p) => grassSide(p, PAL.grass));
tile('stone', (p) => { p.cobble(PAL.stone, '#4e5057', 7); });
tile('sand', (p) => {
  p.clouds(PAL.sand, 4, 3, 0.25);
  for (let y = 2; y < 16; y += 5) for (let x = 0; x < 16; x++) {
    const yy = y + Math.round(Math.sin(x * 0.7 + y) * 1);
    p.setW(x, yy, PAL.sand[0]);
  }
  for (let i = 0; i < 8; i++) p.set(p.ri(16), p.ri(16), '#fff3c4');
});
tile('snow', (p) => {
  p.clouds(PAL.snow, 4, 4, 0.2);
  for (let i = 0; i < 7; i++) p.set(p.ri(16), p.ri(16), '#ffffff');
  for (let i = 0; i < 3; i++) p.set(p.ri(16), p.ri(16), '#b6cbe6');
});
tile('snow_side', (p) => grassSide(p, ['#b6cbe6', '#cfdcee', '#e2ecf7', '#f7fbff']));
tile('ice', (p) => {
  p.clouds(PAL.ice, 5, 5, 0.12);
  for (let k = 0; k < 3; k++) {
    const x0 = p.ri(16), y0 = p.ri(16), len = 3 + p.ri(5);
    for (let i = 0; i < len; i++) p.setW(x0 + i, y0 - i, '#e6f7ff');
  }
  p.bevel(1.1, 0.85);
});
tile('log_side', (p) => {
  for (let x = 0; x < 16; x++) {
    const base = PAL.bark[(x * 7 + 3) % 3 + 1];
    for (let y = 0; y < 16; y++) p.set(x, y, shade(base, 0.92 + p.rand() * 0.16));
    if (x % 4 === 0) for (let y = 0; y < 16; y++) if (p.rand() < 0.8) p.set(x, y, PAL.bark[0]);
  }
  for (let i = 0; i < 4; i++) { const x = p.ri(16), y = p.ri(14); p.set(x, y, PAL.bark[3]); p.set(x, y + 1, PAL.bark[0]); }
});
tile('log_top', (p) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)) + Math.hypot(x - 7.5, y - 7.5) * 0.25;
    const ring = Math.floor(d) % 3;
    p.set(x, y, PAL.ring[ring === 0 ? 0 : ring === 1 ? 2 : 1]);
  }
  p.rect(7, 7, 2, 2, PAL.ring[3]);
  for (let i = 0; i < 16; i++) { p.set(i, 0, PAL.bark[1]); p.set(i, 15, PAL.bark[1]); p.set(0, i, PAL.bark[1]); p.set(15, i, PAL.bark[1]); }
});
tile('pine_log_side', (p) => {
  for (let x = 0; x < 16; x++) {
    const b = ['#3b2616', '#4a3020', '#57392a'][(x * 5 + 1) % 3];
    for (let y = 0; y < 16; y++) p.set(x, y, shade(b, 0.9 + p.rand() * 0.2));
  }
  for (let i = 0; i < 10; i++) { const x = p.ri(16), y = p.ri(16); p.set(x, y, '#2a1a0e'); }
});
tile('pine_log_top', (p) => { painters.log_top(p); });
function leafy(p, pal, holes = '#0e2a12') {
  p.fill(pal[0]);
  for (let i = 0; i < 22; i++) {
    const cx = p.ri(16), cy = p.ri(16), r = 1.2 + p.rand() * 1.8;
    const c = pal[1 + p.ri(pal.length - 2)];
    for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
      const d = Math.hypot(x, y);
      if (d <= r) p.setW(cx + x, cy + y, d < r * 0.45 && y < 0 ? pal[pal.length - 1] : c);
    }
    p.setW(cx, cy + Math.ceil(r), pal[0]);
  }
  for (let i = 0; i < 5; i++) p.set(p.ri(16), p.ri(16), holes);
}
tile('leaves', (p) => leafy(p, PAL.leaves));
tile('dark_leaves', (p) => leafy(p, PAL.dark, '#0a2010'));
tile('pine_leaves', (p) => {
  p.fill(PAL.pine[0]);
  for (let i = 0; i < 40; i++) {
    const x = p.ri(16), y = p.ri(16), c = PAL.pine[1 + p.ri(4)];
    p.setW(x, y, c); p.setW(x + 1, y + 1, c); p.setW(x - 1, y + 1, shade(c, 0.85));
  }
  for (let i = 0; i < 6; i++) p.set(p.ri(16), p.ri(16), '#dfeaf2');
});
tile('planks', (p) => {
  for (let y = 0; y < 16; y++) {
    const board = Math.floor(y / 4);
    const base = PAL.planks[[1, 2, 1, 3][board]];
    for (let x = 0; x < 16; x++) {
      let c = shade(base, 0.94 + p.rand() * 0.1);
      if (y % 4 === 3) c = PAL.planks[0];
      else if (y % 4 === 0) c = shade(base, 1.1);
      p.set(x, y, c);
    }
    const seam = (board * 7 + 3) % 16;
    if (y % 4 !== 3) p.set(seam, y, PAL.planks[0]);
  }
  for (let b = 0; b < 4; b++) { // grain + nails
    const y = b * 4 + 1;
    const gx = p.ri(10);
    for (let i = 0; i < 4; i++) p.set(gx + i, y + (i > 1 ? 1 : 0), shade(PAL.planks[1], 0.85));
    p.set(1, y, '#5a3f22'); p.set(14, y, '#5a3f22');
  }
});
function ore(p, base, pal, seam, count = 4) {
  p.cobble(base, seam, 7);
  for (let i = 0; i < count; i++) {
    const cx = 2 + p.ri(12), cy = 2 + p.ri(12);
    const shape = [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1], [2, 1], [1, 2]];
    for (const [dx, dy] of shape) if (p.rand() < 0.8) p.set(cx + dx, cy + dy, pal[1]);
    p.set(cx, cy, pal[2]); p.set(cx + 1, cy + 1, pal[0]); p.set(cx - 1, cy + 1, pal[0]);
  }
}
tile('copper_ore', (p) => ore(p, PAL.stone, ['#8a4b24', '#d27a3e', '#f4ab70'], '#4e5057'));
tile('iron_ore', (p) => ore(p, PAL.stone, ['#7d6a5e', '#c9b3a4', '#f0e2d6'], '#4e5057'));
tile('gold_ore', (p) => ore(p, PAL.stone, ['#9c6d10', '#f2c230', '#fff1a0'], '#4e5057'));
tile('crystal_ore', (p) => {
  p.cobble(PAL.moon, '#7b6c9e', 6);
  for (let i = 0; i < 4; i++) {
    const cx = 2 + p.ri(11), cy = 3 + p.ri(10);
    const c = p.pick([['#2fc8e0', '#9ff4ff'], ['#ef5fae', '#ffc0e3'], ['#b07cff', '#e4ccff']]);
    for (let k = 0; k < 4; k++) { p.set(cx, cy - k, c[0]); p.set(cx + 1, cy - k + 1, shade(c[0], 0.75)); }
    p.set(cx, cy - 3, c[1]); p.set(cx, cy - 2, c[1]);
  }
});
tile('prism_grass_top', (p) => {
  p.clouds(PAL.prism.slice(0, 4), 4, 9, 0.35);
  for (let i = 0; i < 18; i++) p.set(p.ri(16), p.ri(16), PAL.prism[4]);
  for (let i = 0; i < 5; i++) p.set(p.ri(16), p.ri(16), p.pick(['#ff9bd2', '#fff2a8', '#d6c2ff']));
});
tile('prism_grass_side', (p) => grassSide(p, PAL.prism));
tile('moonstone', (p) => {
  p.cobble(PAL.moon, '#7b6c9e', 6, 1.2);
  for (let i = 0; i < 5; i++) p.set(p.ri(16), p.ri(16), '#f3eeff');
});
tile('prism_pink', (p) => leafy(p, PAL.pink, '#7a2a52'));
tile('prism_gold', (p) => leafy(p, PAL.gold, '#7a5a10'));
tile('prism_lilac', (p) => leafy(p, PAL.lilac, '#3a2a70'));
tile('pale_log_side', (p) => {
  for (let x = 0; x < 16; x++) {
    const base = PAL.pale[(x * 5 + 2) % 3 + 1];
    for (let y = 0; y < 16; y++) p.set(x, y, shade(base, 0.95 + p.rand() * 0.08));
  }
  for (let i = 0; i < 7; i++) { // dark birch-like marks
    const x = p.ri(14), y = p.ri(16);
    p.set(x, y, '#6f6656'); p.set(x + 1, y, '#8a8070');
  }
  for (let i = 0; i < 4; i++) p.set(p.ri(16), p.ri(16), '#f2c94c');
});
tile('pale_log_top', (p) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const d = Math.hypot(x - 7.5, y - 7.5);
    p.set(x, y, PAL.pale[Math.floor(d) % 2 ? 1 : 2]);
  }
  p.rect(7, 7, 2, 2, '#f2c94c');
  for (let i = 0; i < 16; i++) { p.set(i, 0, PAL.pale[0]); p.set(i, 15, PAL.pale[0]); p.set(0, i, PAL.pale[0]); p.set(15, i, PAL.pale[0]); }
});
tile('bedrock', (p) => { p.cobble(PAL.bedrock, '#0c0c0f', 9, 1.3); });
tile('brick', (p) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const row = Math.floor(y / 4), off = row % 2 ? 4 : 0;
    const bx = (x + off) % 8;
    let c = shade(PAL.stone[1 + ((row + Math.floor((x + off) / 8)) % 3)], 0.95 + p.rand() * 0.1);
    if (y % 4 === 3 || bx === 7) c = '#4a4c53';
    else if (y % 4 === 0 || bx === 0) c = shade(c, 1.15);
    p.set(x, y, c);
  }
});
tile('bench_top', (p) => {
  painters.planks(p);
  for (let i = 0; i < 16; i++) { p.set(i, 0, '#5a3f22'); p.set(i, 15, '#5a3f22'); p.set(0, i, '#5a3f22'); p.set(15, i, '#5a3f22'); }
  // saw
  p.rect(3, 4, 6, 2, '#c8ccd4'); p.rect(3, 6, 6, 1, '#8a8f99'); p.rect(9, 4, 2, 2, '#7a4a20');
  // hammer
  p.rect(10, 9, 1, 5, '#7a4a20'); p.rect(8, 8, 5, 2, '#9aa0aa'); p.rect(8, 8, 5, 1, '#c8ccd4');
});
tile('bench_side', (p) => {
  p.fill('#3a2614');
  const top = new Painter(16, 16, 77); painters.planks(top);
  for (let y = 0; y < 5; y++) for (let x = 0; x < 16; x++) p.set(x, y, top.get(x, y));
  for (let x = 0; x < 16; x++) p.set(x, 5, '#5a3f22');
  for (let y = 6; y < 16; y++) {
    for (let x = 1; x < 4; x++) p.set(x, y, shade(PAL.planks[1], x === 1 ? 1.1 : 0.9));
    for (let x = 12; x < 15; x++) p.set(x, y, shade(PAL.planks[1], x === 12 ? 1.1 : 0.9));
    for (let x = 4; x < 12; x++) p.set(x, y, '#3a2614');
  }
  p.rect(4, 9, 8, 2, PAL.planks[0]);
  p.rect(5, 6, 2, 3, '#9aa0aa'); p.rect(8, 6, 3, 2, '#c49a5a');
});
tile('furnace_side', (p) => {
  painters.brick(p);
  p.rect(4, 7, 8, 7, '#1d1714');
  for (let x = 4; x < 12; x++) { p.set(x, 13, p.pick(['#ff8a1e', '#ffc23a', '#ff5a1a'])); if (p.rand() < 0.6) p.set(x, 12, p.pick(['#ff8a1e', '#ffd84a'])); }
  p.set(6, 11, '#ffb02a'); p.set(9, 11, '#ff7a1a'); p.set(7, 10, '#ffe27a');
  p.rect(3, 6, 10, 1, '#3a3c42');
});
tile('furnace_top', (p) => { painters.brick(p); p.rect(6, 6, 4, 4, '#2a2a2e'); p.rect(7, 7, 2, 2, '#ff8a1e'); });
tile('cactus_side', (p) => {
  for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) {
    const ridge = x % 4;
    p.set(x, y, shade(PAL.cactus[ridge === 0 ? 0 : ridge === 1 ? 3 : 2], 0.95 + p.rand() * 0.1));
  }
  for (let i = 0; i < 8; i++) { const x = p.ri(4) * 4 + 1, y = p.ri(16); p.set(x, y, '#efe6b8'); }
  p.bevel(1.05, 0.85);
});
tile('cactus_top', (p) => { p.clouds(PAL.cactus, 4, 11, 0.2); p.disc(8, 8, 3, PAL.cactus[3]); p.set(8, 8, '#f5a3c0'); p.bevel(1.05, 0.8); });
tile('sandstone_side', (p) => {
  for (let y = 0; y < 16; y++) {
    const band = PAL.sandstone[[2, 3, 2, 1, 2, 1, 0, 1][Math.floor(y / 2) % 8]];
    for (let x = 0; x < 16; x++) p.set(x, y, shade(band, 0.95 + p.rand() * 0.1));
  }
  for (let x = 0; x < 16; x++) { p.set(x, 0, PAL.sandstone[3]); p.set(x, 15, PAL.sandstone[0]); }
});
tile('sandstone_top', (p) => { p.clouds(PAL.sandstone, 4, 12, 0.2); p.bevel(1.1, 0.85); });
tile('cloud', (p) => { p.clouds(['#e8eef8', '#f3f7fc', '#ffffff'], 5, 13, 0.1); });

// --- cross sprites (transparent)
tile('tall_grass', (p) => {
  const cols = PAL.grass;
  for (let b = 0; b < 7; b++) {
    const x0 = 1 + b * 2 + p.ri(2), h = 6 + p.ri(9), lean = (p.rand() - 0.5) * 0.5;
    for (let i = 0; i < h; i++) {
      const x = Math.round(x0 + lean * i), y = 15 - i;
      p.set(x, y, cols[Math.min(4, 1 + Math.floor((i / h) * 4))]);
    }
  }
});
tile('flower_red', (p) => {
  p.line(8, 15, 8, 7, '#3a8a2e'); p.set(7, 12, '#46a137'); p.set(6, 11, '#46a137'); p.set(9, 10, '#46a137'); p.set(10, 9, '#46a137');
  const pc = ['#c4243c', '#e8364e', '#ff6b7c'];
  for (const [dx, dy] of [[0, -2], [-2, 0], [2, 0], [0, 2], [-1, -1], [1, -1], [-1, 1], [1, 1]]) p.set(8 + dx, 5 + dy, pc[(dx + dy + 3) % 3]);
  p.set(8, 5, '#ffd84a');
});
tile('flower_yellow', (p) => {
  p.line(7, 15, 8, 8, '#3a8a2e'); p.set(6, 13, '#46a137'); p.set(9, 11, '#46a137');
  p.disc(8, 6, 2.6, '#f2c230'); p.set(7, 5, '#fff1a0'); p.set(8, 6, '#8a5a10'); p.set(9, 7, '#c99a20');
});
tile('prism_tuft', (p) => {
  const cs = [['#2fc8e0', '#9ff4ff'], ['#ef5fae', '#ffc0e3'], ['#b07cff', '#e4ccff']];
  for (let k = 0; k < 4; k++) {
    const x = 2 + k * 3 + p.ri(2), h = 4 + p.ri(8), c = cs[k % 3];
    for (let i = 0; i < h; i++) { p.set(x, 15 - i, c[0]); if (i < h - 1) p.set(x + 1, 15 - i, shade(c[0], 0.7)); }
    p.set(x, 15 - h, c[1]); p.set(x, 16 - h, c[1]);
  }
});
tile('mushroom', (p) => {
  p.rect(7, 10, 2, 6, '#efe3cf'); p.set(7, 10, '#fff6e6');
  for (let x = 3; x <= 12; x++) for (let y = 5; y <= 9; y++) {
    const dx = (x - 7.5) / 5, dy = (y - 9) / 4.5;
    if (dx * dx + dy * dy <= 1) p.set(x, y, y < 7 ? '#e0413a' : '#b8302a');
  }
  p.set(5, 7, '#fff'); p.set(9, 6, '#fff'); p.set(7, 8, '#fff'); p.set(11, 8, '#fff');
});
tile('glowcap', (p) => {
  for (const [x, h] of [[4, 5], [9, 8], [12, 4]]) {
    p.rect(x, 16 - h, 1, h, '#cfe8ff');
    p.rect(x - 2, 15 - h, 5, 2, '#3fd7ff'); p.rect(x - 1, 14 - h, 3, 1, '#a5f3ff');
  }
});
tile('dead_bush', (p) => {
  const c = '#8a6a3e';
  p.line(8, 15, 8, 9, c); p.line(8, 11, 4, 6, c); p.line(8, 10, 12, 5, c); p.line(6, 8, 6, 4, c); p.line(10, 7, 13, 7, c);
  p.set(4, 5, '#a8865a'); p.set(12, 4, '#a8865a');
});
tile('torch', (p) => {
  p.rect(7, 6, 2, 10, '#7a4a20'); p.rect(7, 6, 1, 10, '#9a6a35');
  p.rect(7, 3, 2, 3, '#ffd84a'); p.set(7, 2, '#fff1a0'); p.set(8, 2, '#ff9a2a'); p.set(7, 5, '#ff7a1a'); p.set(8, 4, '#fff6c8');
});

export const TILE_NAMES = Object.keys(painters);
const ATLAS_COLS = 8;
export const ATLAS_SIZE = ATLAS_COLS * T; // 128px wide
export const tileIndex = {};

export function buildAtlas() {
  const rows = Math.ceil(TILE_NAMES.length / ATLAS_COLS);
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * T; canvas.height = rows * T;
  const ctx = canvas.getContext('2d');
  TILE_NAMES.forEach((name, i) => {
    const p = new Painter(T, T, 1000 + i * 31);
    painters[name](p);
    p.blitTo(ctx, (i % ATLAS_COLS) * T, Math.floor(i / ATLAS_COLS) * T);
    tileIndex[name] = i;
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  const W = canvas.width, H = canvas.height;
  const e = 0.02; // texel inset to avoid bleeding
  function uv(name) {
    const i = tileIndex[name];
    const x = (i % ATLAS_COLS) * T, y = Math.floor(i / ATLAS_COLS) * T;
    return [(x + e) / W, 1 - (y + T - e) / H, (x + T - e) / W, 1 - (y + e) / H]; // u0,v0(bottom),u1,v1(top)
  }
  // per-block per-face uv: [top, side, bottom]
  const faceUV = [], faceTile = [];
  for (const d of DEF) {
    if (!d || !d.tex) continue;
    const t = Array.isArray(d.tex) ? d.tex : [d.tex, d.tex, d.tex];
    faceUV[d.id] = [uv(t[0]), uv(t[1]), uv(t[2])];
    faceTile[d.id] = [tileIndex[t[0]], tileIndex[t[1]], tileIndex[t[2]]];
  }
  return { canvas, tex, uv, faceUV, faceTile, W, H, cols: ATLAS_COLS, rows: H / T };
}

// Draw a 16x16 tile to a canvas (for icons).
export function tileCanvas(name) {
  const p = new Painter(T, T, 1000 + TILE_NAMES.indexOf(name) * 31);
  painters[name](p);
  return p;
}

export function makeWaterTexture() {
  const p = new Painter(16, 16, 4242);
  p.clouds(['#1d5fa8', '#2470bd', '#2b80cf', '#3a92dc'], 4, 3, 0.15);
  for (let k = 0; k < 4; k++) {
    const y = k * 4 + 1, x0 = p.ri(16);
    for (let i = 0; i < 6; i++) p.setW(x0 + i, y + (i > 2 ? 1 : 0), '#7cc4f2');
  }
  const c = p.toCanvas();
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

export function makeCrackTextures() {
  const out = [];
  const base = new Painter(16, 16, 999);
  const segs = [];
  // Build a random crack tree once, reveal progressively.
  let pts = [[8, 8]];
  for (let i = 0; i < 40; i++) {
    const [x, y] = base.pick(pts);
    const nx = x + base.ri(3) - 1, ny = y + base.ri(3) - 1;
    if (nx < 0 || ny < 0 || nx > 15 || ny > 15) continue;
    segs.push([nx, ny]); pts.push([nx, ny]);
  }
  for (let s = 1; s <= 8; s++) {
    const p = new Painter(16, 16, 1);
    const n = Math.floor((segs.length * s) / 8);
    p.set(8, 8, [20, 20, 20, 220]);
    for (let i = 0; i < n; i++) p.set(segs[i][0], segs[i][1], [20, 20, 20, 200]);
    const t = new THREE.CanvasTexture(p.toCanvas());
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    out.push(t);
  }
  return out;
}

export { mix };
