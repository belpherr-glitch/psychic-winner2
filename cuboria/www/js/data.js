// Cubória: ruído, blocos, itens e receitas
(function () {
  const CB = (window.CB = {});

  // ───── ruído determinístico ─────
  CB.hash2 = function (x, y, s) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const sm = (t) => t * t * (3 - 2 * t);
  CB.noise1 = function (x, s) {
    const i = Math.floor(x), f = sm(x - i);
    return CB.hash2(i, 0, s) * (1 - f) + CB.hash2(i + 1, 0, s) * f;
  };
  CB.noise2 = function (x, y, s) {
    const i = Math.floor(x), j = Math.floor(y), fx = sm(x - i), fy = sm(y - j);
    const a = CB.hash2(i, j, s), b = CB.hash2(i + 1, j, s), c = CB.hash2(i, j + 1, s), d = CB.hash2(i + 1, j + 1, s);
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  };
  CB.hash3 = function (x, y, z, s) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 2246822519) + Math.imul(s | 0, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  CB.fbm1 = (x, s) => CB.noise1(x, s) * 0.6 + CB.noise1(x * 2.1, s + 17) * 0.28 + CB.noise1(x * 4.3, s + 31) * 0.12;
  CB.fbm2 = (x, y, s) => CB.noise2(x, y, s) * 0.62 + CB.noise2(x * 2.1, y * 2.1, s + 17) * 0.26 + CB.noise2(x * 4.2, y * 4.2, s + 31) * 0.12;

  // ───── blocos ─────
  // estilos do shader: 0 liso, 1 pedra, 2 minério, 3 tronco, 4 tábuas, 5 grama, 6 folhas, 7 tijolo, 8 cristal, 9 lava,
  // 10 água, 11 vidro, 12 fornalha; sprites: 20 mato, 21 flor, 22 cogumelo, 23 tocha, 24 coração, 25 lanterna
  const B = (CB.B = {
    AIR: 0, DIRT: 1, GRASS: 2, STONE: 3, SAND: 4, SNOW: 5, ICE: 6, LOG: 7, LEAVES: 8, PLANKS: 9, COAL: 10, COPPER: 11, IRON: 12,
    GOLD: 13, CRYSTAL: 14, DEEP: 15, BEDROCK: 16, WATER: 17, LAVA: 18, TORCH: 19, BENCH: 20, FURNACE: 21, BRICK: 22, GLASS: 23,
    CACTUS: 24, TGRASS: 25, FLOWER: 26, MUSH: 27, PGRASS: 28, PLEAVES: 29, LANTERN: 30, HEART: 31, PINE: 32, WOOD: 33, RUBY: 34,
    LEAF_Y: 35, LEAF_B: 36, LEAF_V: 37, PALE: 38, LEAF_O: 39,
  });
  const D = (CB.D = []);
  const def = (id, name, c1, c2, style, o) =>
    (D[id] = Object.assign({ id, name, c1, c2, style, kind: 'cube', solid: true, opaque: true, thin: false, hard: 0.5, need: 0, drop: id, light: null, z: 0.3 }, o));
  def(B.AIR, 'Ar', [0, 0, 0], [0, 0, 0], 0, { kind: 'none', solid: false, opaque: false });
  def(B.DIRT, 'Terra', [150, 98, 62], [128, 80, 50], 0, { hard: 0.35 });
  def(B.GRASS, 'Grama', [96, 200, 78], [150, 98, 62], 5, { hard: 0.4, drop: B.DIRT });
  def(B.STONE, 'Pedra', [136, 142, 160], [112, 118, 138], 1, { hard: 0.9, need: 0.9 });
  def(B.SAND, 'Areia', [240, 214, 140], [226, 196, 120], 0, { hard: 0.3 });
  def(B.SNOW, 'Neve', [240, 248, 255], [214, 230, 250], 0, { hard: 0.3 });
  def(B.ICE, 'Gelo', [150, 214, 250], [200, 236, 255], 8, { hard: 0.6, emis: 0 });
  def(B.LOG, 'Tronco', [128, 84, 52], [104, 66, 40], 3, { hard: 0.7, drop: B.WOOD });
  def(B.LEAVES, 'Folhas', [70, 176, 84], [48, 146, 70], 6, { opaque: false, leafy: true, hard: 0.15, drop: 0 });
  def(B.PLANKS, 'Tábuas', [214, 162, 96], [176, 124, 68], 4, { hard: 0.5 });
  def(B.COAL, 'Carvão', [44, 44, 56], [136, 142, 160], 2, { hard: 1.0, need: 0.9 });
  def(B.COPPER, 'Minério de cobre', [240, 138, 70], [136, 142, 160], 2, { hard: 1.2, need: 1 });
  def(B.IRON, 'Minério de ferro', [222, 200, 184], [112, 118, 138], 2, { hard: 1.6, need: 1.8 });
  def(B.GOLD, 'Minério de ouro', [255, 214, 64], [86, 88, 116], 2, { hard: 2.0, need: 2.8 });
  def(B.CRYSTAL, 'Cristal', [96, 240, 255], [190, 120, 255], 8, { hard: 1.6, need: 1.8, light: [3, 12, 14], emis: 0.75 });
  def(B.DEEP, 'Rocha funda', [86, 88, 116], [68, 70, 98], 1, { hard: 1.5, need: 1.8 });
  def(B.BEDROCK, 'Rocha-mãe', [40, 40, 52], [28, 28, 40], 1, { hard: 1e9, need: 99 });
  def(B.WATER, 'Água', [60, 150, 240], [130, 210, 255], 10, { kind: 'liquid', solid: false, opaque: false, hard: 1e9, drop: 0 });
  def(B.LAVA, 'Lava', [255, 110, 30], [255, 220, 80], 9, { kind: 'liquid', solid: false, opaque: false, hard: 1e9, drop: 0, light: [15, 7, 2], emis: 1 });
  def(B.TORCH, 'Tocha', [255, 170, 60], [120, 78, 46], 23, { kind: 'sprite', solid: false, opaque: false, hard: 0.05, light: [15, 11, 6], z: 0.15 });
  def(B.BENCH, 'Bancada', [200, 146, 84], [128, 84, 52], 4, { kind: 'model', opaque: false, hard: 0.5 });
  def(B.FURNACE, 'Fornalha', [120, 120, 136], [255, 140, 40], 12, { hard: 0.9, need: 0.9, light: [12, 6, 2], emis: 0 });
  def(B.BRICK, 'Tijolos', [196, 92, 76], [226, 214, 200], 7, { hard: 1.0, need: 0.9 });
  def(B.GLASS, 'Vidro', [190, 235, 255], [255, 255, 255], 11, { opaque: false, hard: 0.3 });
  def(B.CACTUS, 'Cacto', [70, 170, 96], [46, 130, 76], 3, { kind: 'model', opaque: false, hard: 0.3 });
  def(B.TGRASS, 'Mato', [96, 196, 80], [44, 120, 60], 20, { kind: 'sprite', sway: true, solid: false, opaque: false, hard: 0.02, drop: 0 });
  def(B.FLOWER, 'Flor', [255, 110, 150], [56, 150, 70], 21, { kind: 'sprite', sway: true, solid: false, opaque: false, hard: 0.02, drop: 0 });
  def(B.MUSH, 'Cogumelo brilhante', [90, 255, 200], [230, 240, 255], 22, { kind: 'sprite', solid: false, opaque: false, hard: 0.05, light: [2, 9, 7], heal: 20 });
  def(B.PGRASS, 'Grama roxa', [190, 110, 240], [110, 78, 120], 5, { hard: 0.4, drop: B.DIRT });
  def(B.PLEAVES, 'Folhas rosa', [255, 140, 200], [230, 100, 180], 6, { opaque: false, leafy: true, hard: 0.15, drop: 0 });
  def(B.LANTERN, 'Lanterna de cristal', [140, 245, 255], [80, 84, 110], 25, { kind: 'sprite', solid: false, opaque: false, hard: 0.2, light: [9, 15, 15], z: 0.15 });
  def(B.HEART, 'Cristal de vida', [255, 70, 110], [255, 170, 190], 24, { kind: 'sprite', solid: false, opaque: false, hard: 0.8, light: [11, 3, 5], use: 'heart' });
  def(B.PINE, 'Folhas de pinheiro', [44, 132, 96], [30, 104, 80], 6, { opaque: false, leafy: true, hard: 0.15, drop: 0 });
  def(B.WOOD, 'Madeira', [150, 100, 60], [120, 78, 46], 3, { hard: 0.6 });
  def(B.RUBY, 'Rubi', [255, 70, 120], [255, 170, 90], 8, { hard: 1.8, need: 2.8, light: [13, 3, 6], emis: 0.75 });

  def(B.LEAF_Y, 'Folhas douradas', [255, 214, 90], [240, 170, 60], 6, { opaque: false, leafy: true, hard: 0.15, drop: 0 });
  def(B.LEAF_B, 'Folhas azuis', [110, 200, 255], [80, 150, 240], 6, { opaque: false, leafy: true, hard: 0.15, drop: 0 });
  def(B.LEAF_V, 'Folhas violeta', [180, 120, 255], [140, 90, 230], 6, { opaque: false, leafy: true, hard: 0.15, drop: 0 });
  def(B.PALE, 'Tronco claro', [230, 220, 240], [190, 176, 210], 3, { hard: 0.7, drop: B.WOOD });
  def(B.LEAF_O, 'Folhas de outono', [255, 140, 70], [220, 100, 60], 6, { opaque: false, leafy: true, hard: 0.15, drop: 0 });

  // ───── itens que não são blocos ─────
  const I = (CB.I = {
    PICK_WOOD: 100, PICK_COPPER: 101, PICK_IRON: 102, PICK_GOLD: 103, SWORD_WOOD: 110, SWORD_COPPER: 111, SWORD_IRON: 112,
    SWORD_GOLD: 113, SWORD_CRYSTAL: 114, BAR_COPPER: 120, BAR_IRON: 121, BAR_GOLD: 122, GEL: 130, FRUIT: 131,
  });
  const IT = (CB.IT = {});
  const it = (id, name, o) => (IT[id] = Object.assign({ id, name }, o));
  const WOODC = [150, 100, 58], COP = [240, 138, 70], IRO = [214, 214, 226], GOL = [255, 214, 64], CRY = [96, 240, 255];
  it(I.PICK_WOOD, 'Picareta de madeira', { tool: 'pick', power: 1, c: WOODC });
  it(I.PICK_COPPER, 'Picareta de cobre', { tool: 'pick', power: 1.8, c: COP });
  it(I.PICK_IRON, 'Picareta de ferro', { tool: 'pick', power: 2.8, c: IRO });
  it(I.PICK_GOLD, 'Picareta de ouro', { tool: 'pick', power: 4.2, c: GOL });
  it(I.SWORD_WOOD, 'Espada de madeira', { tool: 'sword', dmg: 7, c: WOODC });
  it(I.SWORD_COPPER, 'Espada de cobre', { tool: 'sword', dmg: 11, c: COP });
  it(I.SWORD_IRON, 'Espada de ferro', { tool: 'sword', dmg: 16, c: IRO });
  it(I.SWORD_GOLD, 'Espada de ouro', { tool: 'sword', dmg: 23, c: GOL });
  it(I.SWORD_CRYSTAL, 'Lâmina de cristal', { tool: 'sword', dmg: 34, c: CRY, glow: [0.3, 0.9, 1.0] });
  it(I.BAR_COPPER, 'Barra de cobre', { c: COP, bar: true });
  it(I.BAR_IRON, 'Barra de ferro', { c: IRO, bar: true });
  it(I.BAR_GOLD, 'Barra de ouro', { c: GOL, bar: true });
  it(I.GEL, 'Geleca', { c: [110, 220, 140], blob: true });
  it(I.FRUIT, 'Fruta', { c: [255, 80, 80], blob: true, heal: 12 });
  CB.itemName = (id) => (id >= 100 ? IT[id].name : D[id].name);
  CB.isBlock = (id) => id > 0 && id < 100;

  // ───── receitas: out [id, n], inp [[id, n]...], st = estação necessária por perto ─────
  CB.RECIPES = [
    { out: [B.PLANKS, 4], inp: [[B.WOOD, 1]] },
    { out: [B.BENCH, 1], inp: [[B.PLANKS, 8]] },
    { out: [B.TORCH, 4], inp: [[B.WOOD, 1], [B.COAL, 1]] },
    { out: [B.TORCH, 4], inp: [[B.WOOD, 1], [I.GEL, 1]] },
    { out: [I.PICK_WOOD, 1], inp: [[B.PLANKS, 6]], st: B.BENCH },
    { out: [I.SWORD_WOOD, 1], inp: [[B.PLANKS, 5]], st: B.BENCH },
    { out: [B.FURNACE, 1], inp: [[B.STONE, 16]], st: B.BENCH },
    { out: [I.BAR_COPPER, 1], inp: [[B.COPPER, 3]], st: B.FURNACE },
    { out: [I.BAR_IRON, 1], inp: [[B.IRON, 3]], st: B.FURNACE },
    { out: [I.BAR_GOLD, 1], inp: [[B.GOLD, 3]], st: B.FURNACE },
    { out: [B.BRICK, 4], inp: [[B.STONE, 4]], st: B.FURNACE },
    { out: [B.GLASS, 2], inp: [[B.SAND, 2]], st: B.FURNACE },
    { out: [I.PICK_COPPER, 1], inp: [[I.BAR_COPPER, 6], [B.PLANKS, 2]], st: B.BENCH },
    { out: [I.SWORD_COPPER, 1], inp: [[I.BAR_COPPER, 5], [B.PLANKS, 1]], st: B.BENCH },
    { out: [I.PICK_IRON, 1], inp: [[I.BAR_IRON, 6], [B.PLANKS, 2]], st: B.BENCH },
    { out: [I.SWORD_IRON, 1], inp: [[I.BAR_IRON, 5], [B.PLANKS, 1]], st: B.BENCH },
    { out: [I.PICK_GOLD, 1], inp: [[I.BAR_GOLD, 6], [B.PLANKS, 2]], st: B.BENCH },
    { out: [I.SWORD_GOLD, 1], inp: [[I.BAR_GOLD, 5], [B.PLANKS, 1]], st: B.BENCH },
    { out: [I.SWORD_CRYSTAL, 1], inp: [[B.CRYSTAL, 12], [I.BAR_GOLD, 4]], st: B.BENCH },
    { out: [B.LANTERN, 1], inp: [[B.CRYSTAL, 2], [I.BAR_IRON, 1]], st: B.BENCH },
  ];
})();
