// Cubória: texturas em pixel art 16x16, desenhadas por código num atlas 256x256.
// Alfa no atlas: 255 normal, 200 = pixel que brilha, 0 = buraco, outros = translúcido.
(function () {
  const CB = window.CB, B = CB.B, D = CB.D;
  const N = 16, TILES = 16, SIZE = N * TILES;
  const data = new Uint8Array(SIZE * SIZE * 4);
  const tiles = {}; // id -> [cima, lado, baixo]
  let next = 0;

  // gerador simples com semente
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const sh = (c, k) => [Math.max(0, Math.min(255, c[0] * k)), Math.max(0, Math.min(255, c[1] * k)), Math.max(0, Math.min(255, c[2] * k))];
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const hue = (c, d) => [c[0] + d[0], c[1] + d[1], c[2] + d[2]];

  // um "quadro" 16x16 em memória
  class T {
    constructor(seed) { this.p = new Array(N * N).fill(null).map(() => [0, 0, 0, 255]); this.r = rng(seed); }
    get(x, y) { return this.p[((y + N) % N) * N + ((x + N) % N)]; }
    set(x, y, c, a) { const q = this.get(x, y); q[0] = c[0]; q[1] = c[1]; q[2] = c[2]; q[3] = a == null ? 255 : a; }
    fill(c) { for (let i = 0; i < N * N; i++) this.p[i] = [c[0], c[1], c[2], 255]; return this; }
    speck(c, n, a) { for (let i = 0; i < n; i++) this.set(Math.floor(this.r() * N), Math.floor(this.r() * N), c, a); return this; }
    copy() { const t = new T(1); t.p = this.p.map((q) => q.slice()); t.r = this.r; return t; }
    // pedras/torrões: células com contorno escuro, luz em cima-esquerda e sombra embaixo-direita
    chunks(base, cells, o) {
      o = Object.assign({ out: 0.55, hi: 1.18, lo: 0.82, vary: 0.1, edge: true }, o);
      const pts = [];
      for (let i = 0; i < cells; i++) pts.push([this.r() * N, this.r() * N, 1 - o.vary + this.r() * o.vary * 2]);
      const own = new Int8Array(N * N);
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          let best = 1e9, bi = 0;
          for (let i = 0; i < pts.length; i++) {
            let dx = Math.abs(x + 0.5 - pts[i][0]), dy = Math.abs(y + 0.5 - pts[i][1]);
            dx = Math.min(dx, N - dx); dy = Math.min(dy, N - dy);
            const d = Math.max(dx, dy) * 0.55 + Math.hypot(dx, dy) * 0.45;
            if (d < best) { best = d; bi = i; }
          }
          own[y * N + x] = bi;
        }
      const O = (x, y) => own[((y + N) % N) * N + ((x + N) % N)];
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const c = O(x, y), k = pts[c][2];
          let col = sh(base, k);
          if (o.edge && (O(x + 1, y) !== c || O(x, y + 1) !== c)) col = sh(base, o.out);
          else if (O(x - 1, y) !== c || O(x, y - 1) !== c) col = sh(base, k * o.hi);
          else if (O(x + 2, y) !== c || O(x, y + 2) !== c) col = sh(base, k * o.lo);
          this.set(x, y, col);
        }
      return this;
    }
    // aglomerados de pedrinhas preciosas
    gems(c, n, glow) {
      for (let i = 0; i < n; i++) {
        const x = 1 + Math.floor(this.r() * 13), y = 1 + Math.floor(this.r() * 13), w = 2 + Math.floor(this.r() * 2), h = 2;
        for (let dy = -1; dy <= h; dy++) for (let dx = -1; dx <= w; dx++) if ((dx === -1 || dx === w) !== (dy === -1 || dy === h)) this.set(x + dx, y + dy, sh(c, 0.4));
        for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) this.set(x + dx, y + dy, sh(c, dy === 0 ? 1.1 : 0.85), glow ? 200 : 255);
        this.set(x, y, mixc(c, [255, 255, 255], 0.65), glow ? 200 : 255);
      }
      return this;
    }
  }
  function put(t) {
    const id = next++, tx = (id % TILES) * N, ty = Math.floor(id / TILES) * N;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const q = t.p[y * N + x], o = ((ty + y) * SIZE + tx + x) * 4;
      data[o] = q[0]; data[o + 1] = q[1]; data[o + 2] = q[2]; data[o + 3] = q[3];
    }
    return id;
  }
  const same = (t) => { const i = put(t); return [i, i, i]; };

  // ───── blocos ─────
  const C = (id) => D[id].c1, C2 = (id) => D[id].c2;
  const dirt = () => new T(11).chunks(C(B.DIRT), 7, { out: 0.72, hi: 1.12, lo: 0.88, vary: 0.08 }).speck(sh(C(B.DIRT), 0.62), 6).speck(sh(C(B.DIRT), 1.25), 4);
  const stone = (base, seed) => new T(seed).chunks(base, 6, { out: 0.58, hi: 1.2, lo: 0.85, vary: 0.07 });
  const grassSide = (dirtT, g, seed) => {
    const t = dirtT.copy(), r = rng(seed);
    for (let x = 0; x < N; x++) {
      const h = 3 + Math.floor(r() * 2.6) + (x % 5 === 2 ? 1 : 0);
      for (let y = 0; y < h; y++) t.set(x, y, sh(g, y === 0 ? 1.15 : r() < 0.25 ? 0.82 : 1));
      t.set(x, h, sh(g, 0.55));
    }
    return t;
  };
  const grassTop = (g, seed) => {
    // tufos de folhinhas: base lisa, alguns tufos claros com sombra embaixo
    const t = new T(seed).fill(g);
    for (let i = 0; i < 9; i++) {
      const x = Math.floor(t.r() * N), y = Math.floor(t.r() * N);
      t.set(x, y, sh(g, 1.2)); t.set(x + 1, y, sh(g, 1.12)); t.set(x, y + 1, sh(g, 0.84)); t.set(x + 1, y + 1, sh(g, 0.84));
    }
    return t.speck(sh(g, 0.86), 10).speck(sh(g, 1.1), 6);
  };
  const dT = dirt();
  tiles[B.DIRT] = same(dT);
  { const top = put(grassTop(C(B.GRASS), 21)), side = put(grassSide(dT, C(B.GRASS), 22)); tiles[B.GRASS] = [top, side, tiles[B.DIRT][0]]; }
  { const top = put(grassTop(C(B.PGRASS), 23)), side = put(grassSide(dT, C(B.PGRASS), 24)); tiles[B.PGRASS] = [top, side, tiles[B.DIRT][0]]; }
  const stT = stone(C(B.STONE), 31);
  tiles[B.STONE] = same(stT);
  const deepT = stone(C(B.DEEP), 32);
  tiles[B.DEEP] = same(deepT);
  tiles[B.BEDROCK] = same(stone(C(B.BEDROCK), 33).speck([20, 20, 30], 10));
  tiles[B.SAND] = same(new T(41).fill(C(B.SAND)).speck(sh(C(B.SAND), 0.86), 30).speck(sh(C(B.SAND), 1.08), 18).speck(sh(C(B.SAND), 0.7), 5));
  tiles[B.SNOW] = same(new T(42).chunks(C(B.SNOW), 5, { out: 0.9, hi: 1.02, lo: 0.95, vary: 0.02 }).speck([200, 220, 245], 8));
  { const t = new T(43).fill(C(B.ICE)); for (let k = 0; k < 4; k++) { const o = Math.floor(t.r() * 16); for (let i = 0; i < 6; i++) t.set(o + i, i + k * 4, sh(C2(B.ICE), 1.05)); } t.speck([255, 255, 255], 5); tiles[B.ICE] = same(t); }
  const ore = (id, base, seed, glow) => (tiles[id] = same(stone(base, seed).gems(C(id), 3 + (seed % 2), glow)));
  ore(B.COAL, C(B.STONE), 51, false);
  ore(B.COPPER, C(B.STONE), 52, false);
  ore(B.IRON, C(B.STONE), 53, false);
  ore(B.GOLD, C(B.DEEP), 54, false);
  ore(B.RUBY, C(B.DEEP), 55, true);
  { const t = new T(56).fill(sh(C(B.CRYSTAL), 0.55));
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const d = ((x + y) % 8), e = ((x - y + 16) % 8); const c = d < 4 ? mixc(C(B.CRYSTAL), C2(B.CRYSTAL), e / 8) : mixc(C2(B.CRYSTAL), C(B.CRYSTAL), d / 8); t.set(x, y, sh(c, d === 0 || e === 0 ? 0.6 : 1), d === 0 || e === 0 ? 255 : 200); }
    t.speck([255, 255, 255], 6, 200); tiles[B.CRYSTAL] = same(t); }
  // troncos
  const bark = (c, c2, seed) => {
    const t = new T(seed).fill(c);
    for (let x = 0; x < N; x++) { const k = x % 4 === 0 ? 0.62 : x % 4 === 3 ? 0.85 : 1.06; for (let y = 0; y < N; y++) t.set(x, y, sh(c, k)); }
    for (let i = 0; i < 10; i++) { const x = Math.floor(t.r() * N), y = Math.floor(t.r() * N); t.set(x, y, sh(c2, 0.7)); t.set(x, y + 1, sh(c2, 0.7)); }
    return t;
  };
  const rings = (c, c2, seed) => {
    const t = new T(seed);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      t.set(x, y, d > 6.5 ? sh(c2, 0.75) : Math.floor(d) % 2 ? sh(c, 1.2) : sh(c, 1.02));
    }
    return t;
  };
  { const s = put(bark(C(B.LOG), C2(B.LOG), 61)), r = put(rings(mixc(C(B.LOG), [230, 180, 120], 0.5), C(B.LOG), 62)); tiles[B.LOG] = [r, s, r]; tiles[B.WOOD] = [r, s, r]; }
  { const s = put(bark(C(B.PALE), C2(B.PALE), 63)), r = put(rings(mixc(C(B.PALE), [255, 240, 250], 0.4), C2(B.PALE), 64)); tiles[B.PALE] = [r, s, r]; }
  { const t = new T(65).fill(C(B.CACTUS)); for (let x = 0; x < N; x += 4) for (let y = 0; y < N; y++) t.set(x, y, sh(C(B.CACTUS), 0.7)); for (let i = 0; i < 10; i++) t.set(1 + Math.floor(t.r() * 3) * 4 + 1, Math.floor(t.r() * N), [240, 240, 200]); tiles[B.CACTUS] = same(t); }
  // folhas: tufos com buracos
  const leaves = (c, c2, seed) => {
    const t = new T(seed).fill(sh(c, 0.72));
    for (let i = 0; i < 22; i++) {
      const x = Math.floor(t.r() * N), y = Math.floor(t.r() * N), k = 0.88 + t.r() * 0.3;
      t.set(x, y, sh(c, k * 1.12)); t.set(x + 1, y, sh(c, k)); t.set(x, y + 1, sh(c, k)); t.set(x + 1, y + 1, sh(c2, k * 0.9));
    }
    for (let i = 0; i < 16; i++) t.set(Math.floor(t.r() * N), Math.floor(t.r() * N), [0, 0, 0], 0);
    return t;
  };
  for (const id of [B.LEAVES, B.PLEAVES, B.PINE, B.LEAF_Y, B.LEAF_B, B.LEAF_V, B.LEAF_O]) tiles[id] = same(leaves(C(id), C2(id), 70 + id));
  // tábuas
  { const c = C(B.PLANKS), t = new T(81).fill(c);
    for (let b = 0; b < 4; b++) {
      const y0 = b * 4, seam = 3 + Math.floor(t.r() * 10), k = 0.94 + t.r() * 0.12;
      for (let y = 0; y < 4; y++) for (let x = 0; x < N; x++) t.set(x, y0 + y, sh(c, (y === 0 ? 1.14 : y === 3 ? 0.62 : 1) * k));
      for (let y = 0; y < 3; y++) t.set(seam, y0 + y, sh(c, 0.62));
      t.set(seam - 2, y0 + 1, sh(c, 0.5)); t.set((seam + 7) % N, y0 + 1, sh(c, 0.5));
    }
    tiles[B.PLANKS] = same(t); }
  { const c = C(B.BRICK), m = C2(B.BRICK), t = new T(82).fill(m);
    for (let r = 0; r < 4; r++) for (let b = 0; b < 2; b++) {
      const x0 = b * 8 + (r % 2) * 4, k = 0.9 + t.r() * 0.2;
      for (let y = 0; y < 3; y++) for (let x = 0; x < 7; x++) t.set(x0 + x, r * 4 + y, sh(c, k * (y === 0 ? 1.15 : y === 2 ? 0.82 : 1)));
    }
    tiles[B.BRICK] = same(t); }
  { const t = new T(83);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const edge = x === 0 || y === 0 || x === 15 || y === 15, shine = (x + y === 5 || x + y === 6 || x + y === 18);
      t.set(x, y, edge ? [150, 200, 230] : shine ? [255, 255, 255] : [200, 235, 255], edge ? 255 : shine ? 210 : 70);
    }
    tiles[B.GLASS] = same(t); }
  { const t = new T(84).fill(C(B.WATER));
    for (let i = 0; i < 9; i++) { const x = Math.floor(t.r() * N), y = Math.floor(t.r() * N); for (let k = 0; k < 4; k++) t.set(x + k, y, C2(B.WATER)); }
    for (let i = 0; i < N * N; i++) t.p[i][3] = 170;
    tiles[B.WATER] = same(t); }
  { const t = new T(85).chunks(C(B.LAVA), 5, { out: 0.75, hi: 1.25, lo: 0.9, vary: 0.1 }).speck(C2(B.LAVA), 14);
    for (let i = 0; i < N * N; i++) t.p[i][3] = 200;
    tiles[B.LAVA] = same(t); }
  { const st = stone(C(B.STONE), 86), side = st.copy();
    for (let y = 7; y < 13; y++) for (let x = 4; x < 12; x++) side.set(x, y, y === 7 || x === 4 || x === 11 ? sh(C(B.STONE), 0.4) : mixc(C2(B.FURNACE), [255, 230, 120], (y - 7) / 8), y === 7 || x === 4 || x === 11 ? 255 : 200);
    tiles[B.FURNACE] = [put(st), put(side), tiles[B.STONE][0]]; }
  tiles[B.BENCH] = tiles[B.PLANKS];

  // índices dos quadros pro shader (linha 4 da paleta: cima, lado, baixo)
  CB.TILE = tiles;
  CB.ATLAS = { data, size: SIZE, tiles: TILES };
  // desenha um quadro num canvas (pros ícones)
  CB.tileCanvas = function (i) {
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const x = c.getContext('2d'), img = x.createImageData(N, N), tx = (i % TILES) * N, ty = Math.floor(i / TILES) * N;
    for (let y = 0; y < N; y++) for (let k = 0; k < N; k++) {
      const o = ((ty + y) * SIZE + tx + k) * 4, q = (y * N + k) * 4;
      img.data[q] = data[o]; img.data[q + 1] = data[o + 1]; img.data[q + 2] = data[o + 2]; img.data[q + 3] = data[o + 3] < 100 && data[o + 3] > 0 ? 160 : data[o + 3];
    }
    x.putImageData(img, 0, 0);
    return c;
  };
})();
