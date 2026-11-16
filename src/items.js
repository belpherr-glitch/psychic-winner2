// Items, sprites (procedural pixel art), icons and recipes.
import { Painter, shade, mix } from './pixel.js';
import { B, BLOCKS, tileCanvas } from './blocks.js';

// ------------------------------------------------------------ sprite painters (16x16)
const OUT = '#1c1420';
const METALS = {
  copper: ['#7a3d1c', '#b8642e', '#e08a4a', '#ffc08a'],
  iron: ['#4c4f58', '#868b96', '#b8bdc8', '#eef1f6'],
  gold: ['#8a5a0c', '#d39a1a', '#f5cc3a', '#fff2a6'],
  crystal: ['#1a6f8a', '#2fb8d6', '#7fe6f5', '#e6fdff'],
  granite: ['#3c3a44', '#6a6672', '#9b96a3', '#d8d2df'],
};
const WOOD = ['#4a2c14', '#7a4a20', '#a06a34'];

function sword(m, big = false) {
  return (p) => {
    const len = big ? 11 : 9;
    for (let t = 0; t <= len; t++) {
      const x = 4 + t, y = 11 - t;
      p.set(x, y, m[2]); p.set(x + 1, y, m[1]); p.set(x, y - 1, m[3]);
      if (big) { p.set(x - 1, y - 1, m[2]); p.set(x + 1, y + 1, m[0]); }
    }
    p.set(4 + len + 1, 11 - len - 1, m[3]);
    // guard
    const g = big ? METALS.granite : METALS.gold;
    for (let k = -2; k <= 2; k++) p.set(4 + k, 11 + k, k === 0 ? g[3] : g[2]);
    p.set(2, 9, g[1]); p.set(6, 13, g[1]);
    if (big) { p.set(4, 11, '#5ff0ff'); }
    // handle
    p.set(3, 12, WOOD[2]); p.set(2, 13, WOOD[1]); p.set(1, 14, g[2]);
    p.outline(OUT);
  };
}
function pickaxe(m) {
  return (p) => {
    for (let t = 0; t < 11; t++) { p.set(2 + t, 13 - t, t % 3 ? WOOD[1] : WOOD[2]); }
    const head = [[3, 3], [4, 2], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 2], [11, 3], [12, 4], [13, 5], [14, 6], [14, 7], [14, 8], [14, 9], [14, 10], [13, 11], [12, 12]];
    head.forEach(([x, y], i) => {
      p.set(x, y, i < 3 || i > 14 ? m[1] : m[2]);
      if (i > 1 && i < 16) p.set(x - (i > 9 ? 1 : 0), y + (i <= 9 ? 1 : 0), m[1]);
    });
    p.set(6, 1, m[3]); p.set(7, 1, m[3]); p.set(14, 7, m[3]);
    p.set(10, 4, m[0]); p.set(11, 4, m[1]); p.set(11, 5, m[0]);
    p.outline(OUT);
  };
}
function axe(m) {
  return (p) => {
    for (let t = 0; t < 12; t++) p.set(2 + t, 14 - t, t % 3 ? WOOD[1] : WOOD[2]);
    for (let y = 1; y < 9; y++) for (let x = 6; x < 13; x++) {
      const dx = x - 9.5, dy = y - 4.5;
      if (dx * dx / 12 + dy * dy / 14 < 1 && x + y < 15) p.set(x, y, x + y < 11 ? m[2] : m[1]);
    }
    for (let y = 2; y < 8; y++) p.set(7 + Math.max(0, 4 - Math.abs(y - 4)) - 3, y, m[3]);
    p.outline(OUT);
  };
}
function wand(p) {
  for (let t = 0; t < 10; t++) p.set(2 + t, 13 - t, t % 2 ? '#3a2470' : '#5a3aa0');
  p.set(1, 14, '#f5cc3a');
  const cx = 12, cy = 3;
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0, -2], [2, 0], [0, 2], [-2, 0]]) p.set(cx + dx, cy + dy, '#7fe6f5');
  p.set(cx, cy, '#ffffff'); p.set(cx + 1, cy - 1, '#e6fdff'); p.set(cx - 1, cy + 1, '#2fb8d6');
  p.set(15, 0, '#fff2a6'); p.set(9, 1, '#fff2a6'); p.set(15, 6, '#fff2a6');
  p.outline(OUT);
}
function potion(liq, liqL) {
  return (p) => {
    p.rect(6, 1, 4, 2, '#a07a4a'); p.rect(7, 3, 2, 2, '#cfe8f0');
    p.disc(8, 10, 4.6, '#cfe8f0');
    for (let y = 8; y < 15; y++) for (let x = 3; x < 13; x++) if (p.alpha(x, y)) p.set(x, y, y === 8 ? liqL : liq);
    p.set(5, 9, '#ffffff'); p.set(5, 10, '#ffffff'); p.set(6, 8, '#ffffff');
    p.outline(OUT);
  };
}
function gel(p) {
  p.disc(8, 10, 4.5, '#4fbde8'); p.disc(8, 7, 2.5, '#4fbde8');
  p.disc(8, 10, 3, '#6fd2f5'); p.set(6, 8, '#e6fbff'); p.set(7, 7, '#e6fbff'); p.set(10, 12, '#2a8ac0');
  p.outline('#1a3a6a');
}
function bar(m) {
  return (p) => {
    for (let y = 6; y < 12; y++) {
      const inset = Math.max(0, 8 - y);
      for (let x = 2 + inset; x < 14 - (11 - y > 3 ? 0 : 0); x++) p.set(x, y, y === 6 || y === 7 ? m[3] : y > 9 ? m[1] : m[2]);
    }
    p.rect(4, 7, 8, 1, m[3]); p.set(12, 10, m[0]); p.set(13, 10, m[0]);
    p.outline(OUT);
  };
}
function shard(p) {
  const pts = [[8, 1], [9, 2], [7, 2], [10, 4], [6, 4], [10, 6], [6, 6], [10, 8], [6, 8], [9, 11], [7, 11], [8, 13]];
  for (let y = 1; y < 14; y++) {
    const half = y < 5 ? (y - 1) * 0.8 : y < 9 ? 2.5 : (13 - y) * 0.6;
    for (let x = Math.round(8 - half); x <= Math.round(8 + half); x++) p.set(x, y, x < 8 ? '#7fe6f5' : x === 8 ? '#e6fdff' : '#2fb8d6');
  }
  p.set(12, 3, '#ef5fae'); p.set(13, 4, '#ef5fae'); p.set(12, 4, '#ffc0e3');
  void pts; p.outline('#123a52');
}
function idol(p) {
  for (let y = 2; y < 15; y++) for (let x = 2; x < 14; x++) {
    const dx = (x - 7.5) / 6, dy = (y - 8) / 6.5;
    if (dx * dx + dy * dy < 1) p.set(x, y, (x + y) % 5 === 0 ? '#5c5966' : '#7c7886');
  }
  p.rect(5, 4, 2, 1, '#3c3a44'); p.rect(9, 4, 2, 1, '#3c3a44');
  p.set(5, 5, '#ff5a3a'); p.set(10, 5, '#ff5a3a');
  p.disc(8, 10, 2.2, '#2fb8d6'); p.set(8, 9, '#e6fdff'); p.set(7, 10, '#7fe6f5');
  p.line(4, 12, 6, 13, '#3c3a44'); p.line(10, 7, 12, 9, '#3c3a44');
  p.outline(OUT);
}
function heartCrystal(p) {
  const heart = ['..XX..XX..', '.XXXXXXXX.', 'XXXXXXXXXX', 'XXXXXXXXXX', '.XXXXXXXX.', '..XXXXXX..', '...XXXX...', '....XX....'];
  heart.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 'X') p.set(3 + x, 4 + y, y < 2 ? '#ff7a9a' : '#e0304f'); }));
  p.set(5, 5, '#ffffff'); p.set(6, 5, '#ffd0da');
  p.outline(OUT);
}
function core(p) {
  p.disc(8, 8, 6, '#3c3a44'); p.disc(8, 8, 4.4, '#2fb8d6'); p.disc(8, 8, 2.5, '#7fe6f5'); p.set(7, 7, '#ffffff'); p.set(8, 7, '#e6fdff');
  p.outline(OUT);
}
function coin(p) { p.disc(8, 8, 5, '#d39a1a'); p.disc(8, 8, 3.8, '#f5cc3a'); p.rect(7, 5, 2, 6, '#d39a1a'); p.set(6, 6, '#fff2a6'); p.outline(OUT); }

// ------------------------------------------------------------ item registry
// type: block | tool | weapon | wand | consumable | material | summon
export const ITEMS = {};
let nextId = 100;
function item(key, o) {
  const id = o.block !== undefined ? o.block : nextId++;
  ITEMS[key] = Object.assign({ key, id, stack: 99, type: 'material' }, o, { id });
  return ITEMS[key];
}
export const ITEM_BY_ID = {};

// block items
const blockItems = [
  ['dirt', B.DIRT], ['stone', B.STONE], ['sand', B.SAND], ['snow', B.SNOW], ['ice', B.ICE], ['log', B.LOG], ['planks', B.PLANKS],
  ['copper_ore', B.COPPER_ORE], ['iron_ore', B.IRON_ORE], ['gold_ore', B.GOLD_ORE], ['moonstone', B.MOONSTONE],
  ['pale_log', B.PALE_LOG], ['brick', B.BRICK], ['workbench', B.WORKBENCH], ['torch', B.TORCH], ['cactus', B.CACTUS],
  ['sandstone', B.SANDSTONE], ['furnace', B.FURNACE], ['flower_red', B.FLOWER_RED], ['flower_yellow', B.FLOWER_YELLOW],
  ['mushroom', B.MUSHROOM], ['glowcap', B.GLOWCAP], ['cloud', B.CLOUD],
];
for (const [k, b] of blockItems) item(k, { block: b, type: 'block', name: BLOCKS[b].name });

item('crystal', { name: 'Fragmento Prismático', paint: shard, desc: 'Brilha com luz própria.' });
item('gel', { name: 'Gel', paint: gel, desc: 'Pegajoso. Bom para tochas e poções.' });
item('copper_bar', { name: 'Barra de Cobre', paint: bar(METALS.copper) });
item('iron_bar', { name: 'Barra de Ferro', paint: bar(METALS.iron) });
item('gold_bar', { name: 'Barra de Ouro', paint: bar(METALS.gold) });
item('coin', { name: 'Moeda de Ouro', paint: coin });
item('core', { name: 'Núcleo do Colosso', paint: core, desc: 'Ainda pulsa com energia.' });

item('copper_pick', { name: 'Picareta de Cobre', type: 'tool', tool: 'pick', power: 1.0, damage: 5, speed: 0.32, paint: pickaxe(METALS.copper), stack: 1 });
item('iron_pick', { name: 'Picareta de Ferro', type: 'tool', tool: 'pick', power: 1.7, damage: 7, speed: 0.28, paint: pickaxe(METALS.iron), stack: 1 });
item('gold_pick', { name: 'Picareta de Ouro', type: 'tool', tool: 'pick', power: 2.4, damage: 8, speed: 0.25, paint: pickaxe(METALS.gold), stack: 1 });
item('copper_axe', { name: 'Machado de Cobre', type: 'tool', tool: 'axe', power: 1.3, damage: 7, speed: 0.36, paint: axe(METALS.copper), stack: 1 });
item('iron_axe', { name: 'Machado de Ferro', type: 'tool', tool: 'axe', power: 2.0, damage: 9, speed: 0.32, paint: axe(METALS.iron), stack: 1 });
item('copper_sword', { name: 'Espada de Cobre', type: 'weapon', damage: 11, speed: 0.36, reach: 3.2, knock: 6, paint: sword(METALS.copper), stack: 1 });
item('iron_sword', { name: 'Espada de Ferro', type: 'weapon', damage: 17, speed: 0.34, reach: 3.4, knock: 7, paint: sword(METALS.iron), stack: 1 });
item('gold_sword', { name: 'Espada de Ouro', type: 'weapon', damage: 23, speed: 0.32, reach: 3.5, knock: 7, paint: sword(METALS.gold), stack: 1 });
item('crystal_sword', { name: 'Lâmina Prismática', type: 'weapon', damage: 31, speed: 0.3, reach: 3.8, knock: 8, paint: sword(METALS.crystal), stack: 1, glow: true });
item('colossus_sword', { name: 'Espada do Colosso', type: 'weapon', damage: 48, speed: 0.34, reach: 4.4, knock: 12, paint: sword(METALS.crystal, true), stack: 1, glow: true });
item('star_wand', { name: 'Cetro Estelar', type: 'wand', damage: 24, speed: 0.3, mana: 8, paint: wand, stack: 1, glow: true });
item('potion', { name: 'Poção de Cura', type: 'consumable', heal: 50, paint: potion('#e0304f', '#ff7a9a') });
item('mana_potion', { name: 'Poção de Mana', type: 'consumable', mana: 60, paint: potion('#3a5ae0', '#7a9aff') });
item('life_crystal', { name: 'Cristal de Vida', type: 'consumable', maxHp: 20, paint: heartCrystal, desc: 'Aumenta a vida máxima em 20.' });
item('idol', { name: 'Ídolo de Granito', type: 'summon', paint: idol, desc: 'Desperta o Colosso de Granito.' });

for (const it of Object.values(ITEMS)) ITEM_BY_ID[it.id] = it;

// ------------------------------------------------------------ painters & icons
const painterCache = new Map();
export function itemPainter(id) {
  if (painterCache.has(id)) return painterCache.get(id);
  const it = ITEM_BY_ID[id];
  let p;
  if (it.block !== undefined && it.type === 'block') {
    const d = BLOCKS[it.block];
    const tname = Array.isArray(d.tex) ? d.tex[1] : d.tex;
    p = tileCanvas(tname);
  } else {
    p = new Painter(16, 16, id * 13);
    it.paint(p);
  }
  painterCache.set(id, p);
  return p;
}

const iconCache = new Map();
// Returns a data URL icon (isometric cube for full blocks, sprite for others)
export function itemIcon(id) {
  if (iconCache.has(id)) return iconCache.get(id);
  const it = ITEM_BY_ID[id];
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const d = it.type === 'block' ? BLOCKS[it.block] : null;
  if (d && d.render === 'cube') {
    const t = Array.isArray(d.tex) ? d.tex : [d.tex, d.tex, d.tex];
    const top = tileCanvas(t[0]).toCanvas(), side = tileCanvas(t[1]).toCanvas();
    // top face
    ctx.save(); ctx.setTransform(1, 0.5, -1, 0.5, 16, 1); ctx.drawImage(top, 0, 0, 16, 16, 0, 0, 15, 15); ctx.restore();
    // left face
    ctx.save(); ctx.setTransform(1, 0.5, 0, 1, 1, 8.5); ctx.drawImage(side, 0, 0, 16, 16, 0, 0, 15, 15);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, 0, 15, 15); ctx.restore();
    // right face
    ctx.save(); ctx.setTransform(1, -0.5, 0, 1, 16, 16); ctx.drawImage(side, 0, 0, 16, 16, 0, 0, 15, 15);
    ctx.fillStyle = 'rgba(0,0,0,0.36)'; ctx.fillRect(0, 0, 15, 15); ctx.restore();
  } else {
    ctx.drawImage(itemPainter(id).toCanvas(), 0, 0, 32, 32);
  }
  const url = c.toDataURL();
  iconCache.set(id, url);
  return url;
}

// ------------------------------------------------------------ recipes
// station: null (mãos), 'workbench', 'furnace'
const I = ITEMS;
export const RECIPES = [
  { out: [I.planks, 4], in: [[I.log, 1]], station: null },
  { out: [I.planks, 4], in: [[I.pale_log, 1]], station: null },
  { out: [I.workbench, 1], in: [[I.planks, 8]], station: null },
  { out: [I.torch, 4], in: [[I.planks, 1], [I.gel, 1]], station: null },
  { out: [I.torch, 2], in: [[I.planks, 1], [I.crystal, 1]], station: null },
  { out: [I.furnace, 1], in: [[I.stone, 16], [I.log, 3], [I.torch, 2]], station: 'workbench' },
  { out: [I.brick, 4], in: [[I.stone, 4]], station: 'workbench' },
  { out: [I.sandstone, 2], in: [[I.sand, 4]], station: 'workbench' },
  { out: [I.copper_bar, 1], in: [[I.copper_ore, 3]], station: 'furnace' },
  { out: [I.iron_bar, 1], in: [[I.iron_ore, 3]], station: 'furnace' },
  { out: [I.gold_bar, 1], in: [[I.gold_ore, 3]], station: 'furnace' },
  { out: [I.copper_sword, 1], in: [[I.copper_bar, 6], [I.planks, 1]], station: 'workbench' },
  { out: [I.iron_pick, 1], in: [[I.iron_bar, 8], [I.planks, 3]], station: 'workbench' },
  { out: [I.iron_axe, 1], in: [[I.iron_bar, 7], [I.planks, 3]], station: 'workbench' },
  { out: [I.iron_sword, 1], in: [[I.iron_bar, 7]], station: 'workbench' },
  { out: [I.gold_pick, 1], in: [[I.gold_bar, 10], [I.planks, 3]], station: 'workbench' },
  { out: [I.gold_sword, 1], in: [[I.gold_bar, 8]], station: 'workbench' },
  { out: [I.crystal_sword, 1], in: [[I.crystal, 12], [I.gold_bar, 4]], station: 'workbench' },
  { out: [I.star_wand, 1], in: [[I.crystal, 8], [I.gold_bar, 2], [I.pale_log, 2]], station: 'workbench' },
  { out: [I.potion, 2], in: [[I.gel, 2], [I.mushroom, 1]], station: 'workbench' },
  { out: [I.potion, 1], in: [[I.gel, 2], [I.glowcap, 1]], station: 'workbench' },
  { out: [I.mana_potion, 2], in: [[I.gel, 2], [I.crystal, 1]], station: 'workbench' },
  { out: [I.life_crystal, 1], in: [[I.crystal, 6], [I.gold_bar, 1], [I.flower_red, 2]], station: 'workbench' },
  { out: [I.idol, 1], in: [[I.stone, 20], [I.crystal, 5], [I.copper_bar, 2]], station: 'workbench' },
  { out: [I.colossus_sword, 1], in: [[I.core, 1], [I.crystal, 10]], station: 'workbench' },
];

export function itemName(id) { return ITEM_BY_ID[id] ? ITEM_BY_ID[id].name : '?'; }
export { shade, mix };
