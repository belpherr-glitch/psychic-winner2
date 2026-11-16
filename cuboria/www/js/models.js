// Cubória: modelos em pixel art. Cada peça é feita de caixas cujas faces são pintadas pixel a pixel
// (mapas de caracteres -> cores), e os itens são sprites 16x16 com espessura. Tudo em unidades de pixel.
(function () {
  const CB = window.CB, B = CB.B, D = CB.D, I = CB.I, IT = CB.IT;
  const key = (c) => c[0] + ',' + c[1] + ',' + c[2] + ',' + (c[3] || 0);

  function quad(out, p0, p1, p2, p3, n, c) {
    const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, e = c[3] || 0;
    for (const p of [p0, p1, p2, p0, p2, p3]) out.push(p[0], p[1], p[2], r, g, b, n[0], n[1], n[2], e);
  }
  // pinta uma face cols x rows; at(c, r) devolve a cor; place(c0, c1, r) devolve os 4 cantos do retângulo
  function paint(out, cols, rows, at, place, n) {
    for (let r = 0; r < rows; r++) {
      let c0 = 0;
      while (c0 < cols) {
        const col = at(c0, r), k = key(col);
        let c1 = c0 + 1;
        while (c1 < cols && key(at(c1, r)) === k) c1++;
        const q = place(c0, c1, r);
        quad(out, q[0], q[1], q[2], q[3], n, col);
        c0 = c1;
      }
    }
  }
  // caixa: {b:[x0,y0,z0,w,h,d], f:cor de fundo, front/back/side/left/right/top: mapa (linhas de texto ou função)}
  // mapas laterais são desenhados com a frente do modelo à esquerda
  function box(out, s, pal) {
    const [x0, y0, z0, w, h, d] = s.b, x1 = x0 + w, y1 = y0 + h, z1 = z0 + d;
    const fill = typeof s.f === 'string' ? pal[s.f] : s.f;
    const getter = (map, cols, rows, mirror) => {
      if (!map) return null;
      if (typeof map === 'function') return (c, r) => { const v = map(mirror ? cols - 1 - c : c, r, cols, rows); return typeof v === 'string' ? pal[v] || fill : v; };
      return (c, r) => { const row = map[Math.min(r, map.length - 1)] || '', ch = row[mirror ? cols - 1 - c : c]; return pal[ch] || fill; };
    };
    const int = (v) => Math.abs(v - Math.round(v)) < 1e-6;
    const face = (map, cols, rows, mirror, place, n) => {
      const g = int(cols) && int(rows) ? getter(map, cols, rows, mirror) : null;
      if (g) paint(out, cols, rows, g, place, n);
      else { const q = place(0, cols, 0, rows); quad(out, q[0], q[1], q[2], q[3], n, fill); }
    };
    const sideL = s.left || s.side, sideR = s.right || s.side;
    face(s.front, w, h, false, (a, b, r, rr) => { const yt = y1 - r, yb = rr ? y0 : yt - 1; return [[x0 + a, yb, z1], [x0 + b, yb, z1], [x0 + b, yt, z1], [x0 + a, yt, z1]]; }, [0, 0, 1]);
    face(s.back, w, h, false, (a, b, r, rr) => { const yt = y1 - r, yb = rr ? y0 : yt - 1; return [[x1 - a, yb, z0], [x1 - b, yb, z0], [x1 - b, yt, z0], [x1 - a, yt, z0]]; }, [0, 0, -1]);
    face(sideR, d, h, false, (a, b, r, rr) => { const yt = y1 - r, yb = rr ? y0 : yt - 1; return [[x1, yb, z1 - a], [x1, yb, z1 - b], [x1, yt, z1 - b], [x1, yt, z1 - a]]; }, [1, 0, 0]);
    face(sideL, d, h, !s.left, (a, b, r, rr) => { const yt = y1 - r, yb = rr ? y0 : yt - 1; return [[x0, yb, z0 + a], [x0, yb, z0 + b], [x0, yt, z0 + b], [x0, yt, z0 + a]]; }, [-1, 0, 0]);
    face(s.top, w, d, false, (a, b, r, rr) => { const zb = z0 + r, zf = rr ? z1 : zb + 1; return [[x0 + a, y1, zf], [x0 + b, y1, zf], [x0 + b, y1, zb], [x0 + a, y1, zb]]; }, [0, 1, 0]);
    face(s.bottom, w, d, false, (a, b, r, rr) => { const zb = z0 + r, zf = rr ? z1 : zb + 1; return [[x0 + a, y0, zb], [x0 + b, y0, zb], [x0 + b, y0, zf], [x0 + a, y0, zf]]; }, [0, -1, 0]);
  }
  function part(boxes, pal) {
    const out = [];
    for (const b of boxes) box(out, b, pal);
    return { data: new Float32Array(out), n: out.length / 10, vb: null };
  }
  // sprite 16x16 com espessura: a imagem fica no plano YZ (cima da imagem = +z, direita = +y), pega em (gc, gr)
  function sprite(rows, pal, gc, gr, th) {
    const out = [], G = [];
    for (let r = 0; r < 16; r++) { let row = (rows[r] || '').padEnd(16, '.'); if (/[Ww]/.test(row) && !/[Hhd]/.test(row)) row = row.replace(/k/g, 'q'); G.push(row); }
    const at = (c, r) => (c < 0 || r < 0 || c > 15 || r > 15 ? null : pal[G[r][c]] || null);
    const t = th || 0.8;
    for (let r = 0; r < 16; r++)
      for (let c = 0; c < 16; c++) {
        const col = at(c, r);
        if (!col) continue;
        const y0 = c - gc, y1 = y0 + 1, z1 = gr - r + 0.5, z0 = z1 - 1;
        // junta a corrida de mesma cor nas duas faces grandes
        if (c === 0 || !at(c - 1, r) || key(at(c - 1, r)) !== key(col)) {
          let c2 = c + 1;
          while (c2 < 16 && at(c2, r) && key(at(c2, r)) === key(col)) c2++;
          const ye = c2 - gc;
          quad(out, [t, y0, z0], [t, ye, z0], [t, ye, z1], [t, y0, z1], [1, 0, 0], col);
          quad(out, [-t, ye, z0], [-t, y0, z0], [-t, y0, z1], [-t, ye, z1], [-1, 0, 0], col);
        }
        const edge = [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8, col[3]];
        if (!at(c - 1, r)) quad(out, [-t, y0, z0], [t, y0, z0], [t, y0, z1], [-t, y0, z1], [0, -1, 0], edge);
        if (!at(c + 1, r)) quad(out, [t, y1, z0], [-t, y1, z0], [-t, y1, z1], [t, y1, z1], [0, 1, 0], edge);
        if (!at(c, r - 1)) quad(out, [-t, y0, z1], [t, y0, z1], [t, y1, z1], [-t, y1, z1], [0, 0, 1], edge);
        if (!at(c, r + 1)) quad(out, [t, y0, z0], [-t, y0, z0], [-t, y1, z0], [t, y1, z0], [0, 0, -1], edge);
      }
    return { data: new Float32Array(out), n: out.length / 10, vb: null, grip: [gc, gr] };
  }
  const K = [28, 22, 50, 0], WH = [255, 255, 255, 0];
  const sh = (c, k, e) => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k), e || 0];
  const hsh = (x, y, s) => CB.hash2(x, y, s);

  // ───────── personagem ─────────
  const PP = {
    s: [255, 206, 162], S: [226, 168, 128], h: [112, 62, 36], H: [156, 92, 50], w: WH, b: [58, 130, 238], k: K, m: [176, 84, 84], n: [232, 176, 136],
    t: [66, 150, 238], T: [116, 186, 252], d: [46, 112, 200], l: [112, 74, 42], g: [255, 214, 84], p: [62, 60, 124], P: [44, 42, 94], o: [86, 56, 38], O: [124, 84, 56],
  };
  const hair = (c, r) => (hsh(c, r, 5) < 0.22 ? 'H' : 'h');
  const player = {
    head: part([
      { b: [-4, 0, -4, 8, 8, 8], f: 's',
        front: ['hhHhhhHh', 'hhhhhhhh', 'hhshhssh', 'skksskks', 'swbssbws', 'swbssbws', 'sssnnsss', 'Ssmmmmss'],
        side: ['hhHhhhhh', 'hhhhhHhh', 'shhhhhhh', 'sshhhhhh', 'ssShhHhh', 'ssshhhhh', 'sssshhhh', 'SsssShhh'],
        back: hair, top: hair, bottom: () => 'S' },
      { b: [-4.5, 6.6, -4.5, 9, 1.9, 9], f: 'h', top: hair },
      { b: [-4.5, 5, 3.2, 3, 1.8, 1.4], f: 'H' }, { b: [0.5, 5.4, 3.2, 4, 1.4, 1.4], f: 'h' },
      { b: [-4.6, 1.5, -4.6, 9.2, 5.2, 1.2], f: 'h' },
    ], PP),
    torso: part([
      { b: [-4, 0, -2, 8, 9, 4], f: 't',
        front: ['tTssssTt', 'tTtsstTt', 'tTttttTt', 'tttttttt', 'tttttttt', 'tttttttd', 'dddddddd', 'lllgglll', 'pppppppp'],
        back: ['tttttttt', 'tTttttTt', 'tTttttTt', 'tttttttt', 'tttttttt', 'tttttttt', 'dddddddd', 'llllllll', 'pppppppp'],
        side: ['tttt', 'tttt', 'tttt', 'tttd', 'tttd', 'ttdd', 'dddd', 'llll', 'pppp'], top: () => 't', bottom: () => 'P' },
    ], PP),
    arm: part([
      { b: [-1.5, -8, -1.5, 3, 9, 3], f: 't', front: ['tTt', 'tTt', 'ttt', 'ddd', 'sss', 'sss', 'sss', 'sss', 'sSs'], side: ['tTt', 'ttt', 'ttd', 'ddd', 'sss', 'sss', 'ssS', 'ssS', 'sSS'], back: ['ttt', 'ttt', 'ttd', 'ddd', 'sss', 'ssS', 'ssS', 'sSS', 'SSS'], top: () => 'T' },
      { b: [-2, -11, -2, 4, 3.2, 4], f: 's', front: ['sSsS', 'ssss', 'SSSS'], side: ['ssss', 'sssS', 'SSSS'], bottom: () => 'S' },
    ], PP),
    leg: part([
      { b: [-2, -7, -2, 4, 7, 4], f: 'p', front: ['pppp', 'pppp', 'pPpp', 'pppp', 'pppP', 'pppp', 'PPPP'], side: ['pppp', 'pppP', 'pppP', 'ppPP', 'pppP', 'ppPP', 'PPPP'], back: () => 'P' },
      { b: [-2.3, -9, -2.3, 4.6, 2.3, 5.6], f: 'o', front: ['oOOo', 'oooo'], top: () => 'O' },
    ], PP),
  };

  // ───────── itens: sprites 16x16 em pé (cabo embaixo) ─────────
  const SPR = {
    pick: ['', '..kkkkkkkkkkkk..', '.kHHHHHHHHHHhhk.', 'kHhhkkkWwkkkhhdk', 'khdk..kWwk..khdk', 'kdk...kWwk...kdk', '.k....kWwk....k.', '......kWwk......', '......kWwk......', '......kWwk......',
      '......kWwk......', '......kWwk......', '......kWwk......', '......kWwk......', '......kWwk......', '......kkkk......'],
    sword: ['.......kk.......', '......kHhk......', '......kHhk......', '......kHhk......', '......kHhk......', '......kHhk......', '......kHhk......', '......kHhk......', '......kHhk......', '......kHdk......',
      '...kkkkHdkkkk...', '...kGggggggdk...', '...kkkkWwkkkk...', '......kWwk......', '......kWwk......', '......kkkk......'],
    bar: ['', '', '', '', '....kkkkkkkk....', '...kHHHHHHHhk...', '..kHhhhhhhhhdk..', '.kHhhhhhhhhhhdk.', '.khhhhhhhhhhddk.', '.kddddddddddddk.', '..kkkkkkkkkkkk..'],
    blob: ['', '', '', '', '.....kkkkkk.....', '...kkHHhhhhkk...', '..kHHhhhhhhhhk..', '..kHhhhhhhhhhk..', '.khhhhhhhhhhhhk.', '.khhhhhhhhhhddk.', '.khhhhhhhhhdddk.', '..kddddddddddk..', '...kkkkkkkkkk...'],
    fruit: ['........kk......', '.......kggk.....', '......kkgk......', '....kkkwkkkk....', '...kHHhhhhhhk...', '..kHHhhhhhhhhk..', '..kHhhhhhhhhhk..', '..khhhhhhhhhhk..', '..khhhhhhhhhdk..', '..khhhhhhhhddk..',
      '...khhhhhhddk...', '....kkddddkk....', '......kkkk......'],
    torch: ['', '.......ff.......', '......fFFf......', '......fFFf......', '.....fFFFFf.....', '.....fFFFFf.....', '......fFFf......', '......kkkk......', '......kWwk......', '......kWwk......',
      '......kWwk......', '......kWwk......', '......kWwk......', '......kWwk......', '......kWwk......', '......kkkk......'],
    heart: ['', '', '..kkkk....kkkk..', '.kHHhhk..khhhhk.', 'kHHhhhhkkhhhhhdk', 'kHhhhhhhhhhhhhdk', 'khhhhhhhhhhhhhdk', 'khhhhhhhhhhhhddk', '.khhhhhhhhhhddk.', '..khhhhhhhhddk..', '...khhhhhhddk...', '....khhhhddk....', '.....khhddk.....', '......kddk......', '.......kk.......'],
    mush: ['', '', '....kkkkkkkk....', '..kkHHhhhhhhkk..', '.kHHhhwhhhhwhdk.', '.kHhhhhhhhhhhdk.', '.khwhhhhhwhhddk.', '..kkkkkkkkkkkk..', '......ksSk......', '......ksSk......', '......ksSk......', '.....kssSSk.....', '.....kkkkkk.....'],
  };
  const WOOD = { W: [186, 132, 80, 0], w: [140, 94, 54, 0], q: [98, 62, 36, 0] };
  const items = {};
  function tint(c, e) { return Object.assign({ h: sh(c, 1, e), H: sh(c, 1.28, e), d: sh(c, 0.7, e), k: sh(c, 0.5, e), G: [240, 200, 90, 0], g: [176, 132, 50, 0] }, WOOD); }
  function blockMesh(id) {
    const tl = CB.TILE[id], A = CB.ATLAS;
    if (!tl) { const c = D[id].c1; return part([{ b: [-3, -3, -3, 6, 6, 6], f: [c[0], c[1], c[2], D[id].light ? 0.7 : 0] }], {}); }
    const tex = (tile) => (c, r) => {
      const tx = (tile % 16) * 16 + Math.floor(c * 2.67), ty = Math.floor(tile / 16) * 16 + Math.floor(r * 2.67), o = (ty * A.size + tx) * 4;
      return [A.data[o], A.data[o + 1], A.data[o + 2], A.data[o + 3] === 200 ? 0.8 : 0];
    };
    return part([{ b: [-3, -3, -3, 6, 6, 6], f: [0, 0, 0, 0], front: tex(tl[1]), back: tex(tl[1]), left: tex(tl[1]), right: tex(tl[1]), top: tex(tl[0]), bottom: tex(tl[2]) }], {});
  }
  // malha de um item: {mesh, kind:'tool'|'block'|'small'}
  CB.itemModel = function (id) {
    if (items[id]) return items[id];
    let m;
    if (id >= 100) {
      const it = IT[id], e = it.glow ? 0.75 : 0;
      if (it.tool === 'pick') m = { mesh: sprite(SPR.pick, tint(it.c, e), 7.5, 12.5), kind: 'tool' };
      else if (it.tool === 'sword') m = { mesh: sprite(SPR.sword, tint(it.c, e), 7.5, 13.5), kind: 'tool' };
      else if (it.bar) m = { mesh: sprite(SPR.bar, tint(it.c, 0), 7.5, 8), kind: 'small' };
      else if (id === I.FRUIT) m = { mesh: sprite(SPR.fruit, Object.assign(tint(it.c, 0), { g: [70, 190, 90, 0], w: [110, 72, 40, 0] }), 7.5, 8), kind: 'small' };
      else m = { mesh: sprite(SPR.blob, tint(it.c, 0.15), 7.5, 9), kind: 'small' };
    } else if (id === B.TORCH) m = { mesh: sprite(SPR.torch, Object.assign({ f: [255, 150, 40, 1], F: [255, 232, 120, 1], k: [98, 62, 36, 0] }, WOOD), 7.5, 12.5), kind: 'tool' };
    else if (id === B.HEART) m = { mesh: sprite(SPR.heart, tint(D[id].c1, 0.7), 7.5, 8), kind: 'small' };
    else if (id === B.MUSH) m = { mesh: sprite(SPR.mush, Object.assign(tint(D[id].c1, 0.7), { w: [230, 255, 250, 0.8], s: [236, 240, 250, 0], S: [196, 204, 226, 0] }), 7.5, 8), kind: 'small' };
    else m = { mesh: blockMesh(id), kind: 'block' };
    return (items[id] = m);
  };

  // ───────── monstros ─────────
  function slime(c) {
    const pal = { a: sh(c, 1), A: sh(c, 1.28), d: sh(c, 0.72), D: sh(c, 0.55), k: K, w: WH, m: sh(c, 0.4) };
    const skin = (c2, r, cols, rows) => (r === 0 ? 'A' : r >= rows - 1 ? 'D' : hsh(c2, r, 3) < 0.12 ? 'A' : c2 === 0 || c2 === cols - 1 ? 'd' : 'a');
    return part([
      { b: [-6, 0, -6, 12, 5, 12], f: 'a', front: ['AAaaaaaaaaaa', 'akkwaaakkwaa', 'akkkaaakkkad', 'aaaammmmaadd', 'DDDDDDDDDDDD'], side: skin, back: skin, top: (c2, r) => (c2 < 3 && r < 3 ? 'A' : 'a') },
      { b: [-5, 5, -5, 10, 4, 10], f: 'a', front: ['AAAaaaaaaa', 'AAaaaaaaaa', 'Aaaaaaaaaa', 'aaaaaaaaad'], side: skin, back: skin, top: (c2, r) => (c2 > 1 && c2 < 5 && r > 1 && r < 4 ? 'A' : 'a') },
      { b: [-3, 9, -3, 6, 2, 6], f: 'A', front: ['AAAAAa', 'Aaaaaa'], side: ['AAaaaa', 'aaaaad'], top: () => 'A' },
    ], pal);
  }
  const SLIMES = [[90, 216, 128], [90, 166, 255], [255, 116, 178], [204, 128, 255]].map(slime);
  const BP = { f: [104, 76, 128, 0], F: [140, 106, 166, 0], d: [70, 50, 90, 0], k: K, r: [255, 70, 70, 1], w: WH, m: [56, 40, 74, 0], M: [84, 60, 106, 0], e: [200, 120, 150, 0] };
  const fur = (c, r) => (hsh(c, r, 9) < 0.25 ? 'F' : hsh(c, r, 10) < 0.2 ? 'd' : 'f');
  const bat = {
    body: part([
      { b: [-3, 0, -2.5, 6, 6, 5], f: 'f', front: ['fFffFf', 'frkkrf', 'fkffkf', 'ffkkff', 'fwkkwf', 'dfdddf'], side: fur, back: fur, top: fur },
      { b: [-3, 6, -1, 2, 3, 1.5], f: 'd', front: ['fd', 'fe', 'fe'] }, { b: [1, 6, -1, 2, 3, 1.5], f: 'd', front: ['df', 'ef', 'ef'] },
    ], BP),
    wingA: part([{ b: [0, -2.5, -0.5, 6, 5, 1], f: 'm', front: ['dddddd', 'mmMmmm', 'mMmmMm', 'mmmMmm', 'm.mm.m'], back: ['dddddd', 'mmmMmm', 'mMmmMm', 'mmMmmm', 'mmmmmm'] }], BP),
    wingB: part([{ b: [0, -1.5, -0.5, 5, 4, 1], f: 'm', front: ['ddddd', 'mMmmm', 'mmmMm', 'mmmmm'], back: ['ddddd', 'mmmMm', 'mMmmm', 'mmmmm'] }], BP),
  };
  const WP = { c: [118, 70, 190, 0.18], C: [160, 104, 236, 0.3], d: [78, 44, 136, 0.1], k: [16, 8, 34, 0], e: [255, 240, 140, 1], g: [210, 150, 255, 0.9], '.': null };
  const cloth = (c, r, cols, rows) => (r === rows - 1 && (c + r) % 2 ? 'd' : hsh(c, r, 14) < 0.2 ? 'C' : hsh(c, r, 15) < 0.25 ? 'd' : 'c');
  const wisp = {
    body: part([
      { b: [-4, 10, -4, 8, 8, 8], f: 'c', front: ['cCCccccc', 'cckkkkcc', 'ckkkkkkc', 'ckekkekc', 'ckekkekc', 'ckkkkkkc', 'cckkkkcc', 'dccccccd'], side: cloth, back: cloth, top: cloth },
      { b: [-4.5, 6, -3.5, 9, 4, 7], f: 'c', front: cloth, side: cloth, back: cloth, top: () => 'd' },
      { b: [-3.5, 2.5, -3, 7, 3.5, 6], f: 'd', front: cloth, side: cloth, back: cloth },
      { b: [-2.5, 0, -2, 5, 2.5, 4], f: 'd' }, { b: [-1, -2, -1, 2, 2, 2], f: 'd' },
    ], WP),
    hand: part([{ b: [-1.2, -1.2, -1.2, 2.4, 2.4, 2.4], f: 'g' }, { b: [-0.6, -0.6, 1.2, 1.2, 1.2, 1.2], f: 'e' }], WP),
  };
  const GP = { a: [136, 142, 160, 0], b: [158, 164, 182, 0], d: [82, 86, 108, 0], D: [58, 60, 82, 0], m: [86, 170, 84, 0], M: [124, 206, 108, 0], e: [140, 255, 170, 1], k: K };
  const rock = (c, r) => { const o = (Math.floor(r / 3) % 2) * 2; return r % 3 === 2 || (c + o) % 4 === 3 ? 'd' : hsh(c >> 1, r, 20) < 0.3 ? 'b' : 'a'; };
  const mossy = (c, r) => (r === 0 || (r === 1 && hsh(c, 1, 21) < 0.5) ? (hsh(c, r, 22) < 0.3 ? 'M' : 'm') : rock(c, r));
  const golem = {
    torso: part([
      { b: [-6, 0, -3.5, 12, 10, 7], f: 'a', front: (c, r) => (r >= 3 && r <= 6 && c >= 5 && c <= 6 ? 'e' : r >= 2 && r <= 7 && c >= 4 && c <= 7 && (r === 2 || r === 7 || c === 4 || c === 7) ? 'D' : mossy(c, r)), side: mossy, back: mossy, top: () => 'm', bottom: () => 'D' },
      { b: [-7, 8.5, -4, 14, 2.5, 8], f: 'm', front: (c, r) => (hsh(c, r, 23) < 0.35 ? 'M' : 'm'), top: (c, r) => (hsh(c, r, 24) < 0.35 ? 'M' : 'm') },
    ], GP),
    head: part([{ b: [-3.5, 0, -3, 7, 6, 6], f: 'a', front: ['mMmmMmm', 'ddddddd', 'aeeaeea', 'adaaada', 'adddddd', 'aabaaba'], side: mossy, back: mossy, top: () => 'm' }], GP),
    arm: part([{ b: [-2, -11, -2, 4, 12, 4], f: 'a', front: mossy, side: mossy, back: mossy, top: () => 'm' }, { b: [-2.8, -15, -2.8, 5.6, 4.5, 5.6], f: 'b', front: ['bbbbb', 'bdbdb', 'ddddd', 'DDDDD'], side: rock, bottom: () => 'D' }], GP),
    leg: part([{ b: [-2.5, -8, -2.5, 5, 8, 5], f: 'a', front: rock, side: rock, back: rock }, { b: [-3, -8, -3, 6, 2.5, 7], f: 'd', top: () => 'a' }], GP),
  };
  CB.MDL = { player, SLIMES, bat, wisp, golem, part };
})();
