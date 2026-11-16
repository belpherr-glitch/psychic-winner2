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
  // sprite 16x16 com espessura e relevo: a silhueta inteira é fina e o miolo (pixels cercados) é mais grosso.
  // A imagem fica no plano YZ (cima da imagem = +z, direita = +y), com a pega em (gc, gr).
  function sprite(rows, pal, gc, gr, th) {
    const out = [], G = [];
    for (let r = 0; r < 16; r++) { let row = (rows[r] || '').padEnd(16, '.'); if (/[Ww]/.test(row) && !/[Hhd]/.test(row)) row = row.replace(/k/g, 'q'); G.push(row); }
    const px = (c, r) => (c < 0 || r < 0 || c > 15 || r > 15 ? null : pal[G[r][c]] || null);
    const inner = (c, r) => (px(c, r) && px(c - 1, r) && px(c + 1, r) && px(c, r - 1) && px(c, r + 1) ? px(c, r) : null);
    const layer = (at, t, lo) => {
      for (let r = 0; r < 16; r++)
        for (let c = 0; c < 16; c++) {
          const col = at(c, r);
          if (!col) continue;
          const y0 = c - gc, y1 = y0 + 1, z1 = gr - r + 0.5, z0 = z1 - 1;
          quad(out, [t, y0, z0], [t, y1, z0], [t, y1, z1], [t, y0, z1], [1, 0, 0], col);
          quad(out, [-t, y1, z0], [-t, y0, z0], [-t, y0, z1], [-t, y1, z1], [-1, 0, 0], col);
          const e = [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8, col[3]];
          for (const sx of [-1, 1]) {
            const a = sx * lo, bb = sx * t;
            if (!at(c - 1, r)) quad(out, [a, y0, z0], [bb, y0, z0], [bb, y0, z1], [a, y0, z1], [0, -1, 0], e);
            if (!at(c + 1, r)) quad(out, [bb, y1, z0], [a, y1, z0], [a, y1, z1], [bb, y1, z1], [0, 1, 0], e);
            if (!at(c, r - 1)) quad(out, [a, y0, z1], [bb, y0, z1], [bb, y1, z1], [a, y1, z1], [0, 0, 1], e);
            if (!at(c, r + 1)) quad(out, [bb, y0, z0], [a, y0, z0], [a, y1, z0], [bb, y1, z0], [0, 0, -1], e);
          }
        }
    };
    const t = th || 0.7;
    layer(px, t, 0);
    layer(inner, t * 1.9, t);
    return { data: new Float32Array(out), n: out.length / 10, vb: null, grip: [gc, gr] };
  }
  const K = [28, 22, 50, 0], WH = [255, 255, 255, 0];
  const sh = (c, k, e) => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k), e || 0];
  const hsh = (x, y, s) => CB.hash2(x, y, s);

  // ───────── personagem ─────────
  const PP = {
    s: [255, 208, 164], S: [228, 170, 130], h: [188, 98, 42], H: [226, 136, 58], B: [112, 56, 28], w: WH, b: [84, 150, 240], i: [44, 84, 180], k: K, m: [176, 84, 80], n: [234, 176, 136],
    t: [136, 130, 110], T: [164, 158, 136], d: [102, 96, 82], l: [100, 66, 38], g: [255, 214, 84], p: [72, 88, 156], P: [52, 64, 118], o: [96, 62, 42], O: [138, 94, 62],
  };
  const hair = (c, r) => (((c + r) & 1) && hsh(c, r, 5) < 0.7 ? 'H' : 'h');
  const q = (b, f, o) => Object.assign({ b, f }, o);
  const both = (b, f, o) => [q(b, f, o), q([-b[0] - b[3], b[1], b[2], b[3], b[4], b[5]], f, o)]; // espelha em x
  const fringe = [1.5, 0.8, 1.7, 1, 0.6, 1.4, 0.9, 1.7, 1.1, 1.5].map((h, k) => q([-6.5 + k * 1.3, 8.5 - h, 5.5, 1.3, h, 0.9], k % 2 ? 'H' : 'h'));
  const player = {
    // cabeça com o dobro de resolução (12x11 pixels no rosto); o jogo desenha em escala menor
    head: part([
      q([-6, 0, -5.5, 12, 11, 11], 's', {
        front: ['hHhhhHhhhHhh', 'hhhHhhhHhhhh', 'hhHhhhhhhHhh', 'hshhsshhsshh', 'sBBBBssBBBBs', 'skkkkllkkkks'.replace(/l/g, 's'), 'swwbisswwbis', 'swwbisswwbis', 'ssssSnnSssss', 'ssssmmmmssss', 'SssssssssssS'],
        side: ['hhhhhhhhhhh', 'hhhhhhhhhhh', 'hhhhhhhhhhh', 'shhhhhhhhhh', 'sshhhhhhhhh', 'ssshhhhhhhh', 'sssSshhhhhh', 'sssshhhhhhh', 'ssssshhhhhh', 'sssssshhhhh', 'SssssssShhh'].map((r, k) => r.replace(/h/g, (m, o) => (((o + k) & 1) && hsh(o, k, 6) < 0.7 ? 'H' : 'h'))),
        back: hair, top: hair, bottom: () => 'S' }),
      q([-1, 2.1, 5.5, 2, 1.5, 0.9], 'n'), ...both([1, 6, 5.5, 4, 0.9, 0.45], 'B'), ...both([6, 3.4, -1, 0.8, 2.6, 2], 'S'),
      q([-6.5, 8.5, -6, 13, 3, 12], 'h', { top: hair, front: hair, side: hair, back: hair }), ...fringe,
      ...both([5.6, 4.2, -6, 1, 4.6, 9.6], 'h', { side: hair }), q([-6.5, 1, -6.4, 13, 8, 1.2], 'h', { back: hair }), q([-5, -0.6, -6.2, 10, 1.9, 1], 'H'),
    ], PP),
    torso: part([
      q([-4, 0, -2, 8, 9, 4], 'p', { front: () => 'p', back: () => 'p', side: () => 'p', bottom: () => 'P' }),
      // túnica por cima com gola em V, cinto com fivela
      q([-4.5, 1, -2.5, 9, 8, 5], 't', { front: ['ttdsssdtt', 'tttdsdttt', 'tTttdttTt', 'tTtttttTt', 'ttttttttt', 'ttttttttt', 'ttdtttdtt', 'ddddddddd'], back: (c, r) => (r === 7 ? 'd' : c === 4 && r > 4 ? 'd' : 't'), side: (c, r) => (r === 7 ? 'd' : c === 0 ? 'T' : 't'), top: () => 't' }),
      q([-4.7, 2.2, -2.7, 9.4, 1.4, 5.4], 'l'), q([-1, 2, 2.6, 2, 1.8, 0.5], 'g'), q([-0.4, 2.6, 3, 0.8, 0.6, 0.2], 'l'),
    ], PP),
    arm: part([
      q([-1.5, -8, -1.5, 3, 9, 3], 's', { front: ['ttt', 'ttt', 'ttt', 'ddd', 'sss', 'sss', 'sss', 'sss', 'sSs'], side: ['ttt', 'ttt', 'ttd', 'ddd', 'sss', 'sss', 'ssS', 'ssS', 'sSS'], back: ['ttt', 'ttt', 'ttd', 'ddd', 'sss', 'ssS', 'ssS', 'sSS', 'SSS'], top: () => 'T' }),
      q([-2, -3, -2, 4, 4, 4], 't', { front: ['tTtt', 'tTtt', 'tttt', 'dddd'], side: ['tTtt', 'tttt', 'tttd', 'dddd'], back: ['tttt', 'tttt', 'tttd', 'dddd'], top: () => 'T' }),
      // punho fechado com dedos marcados e polegar
      q([-2, -11, -2, 4, 3.2, 4], 's', { front: ['sSsS', 'sSsS', 'SSSS'], side: ['ssss', 'sssS', 'SSSS'], bottom: () => 'S' }),
      q([-1.8, -11.3, 1.9, 3.6, 1.5, 0.5], 'S'), q([-0.6, -9.6, 1.9, 1.2, 1.4, 0.7], 's'),
    ], PP),
    leg: part([
      q([-2, -7, -2, 4, 7, 4], 'p', { front: ['pppp', 'pppp', 'pPpp', 'pppp', 'pppP', 'pppp', 'PPPP'], side: ['pppp', 'pppP', 'pppP', 'ppPP', 'pppP', 'ppPP', 'PPPP'], back: () => 'P' }),
      q([-2.3, -7.3, -2.3, 4.6, 1.5, 4.6], 'P'),
      q([-2.4, -9, -2.4, 4.8, 2.4, 5.8], 'o'), q([-2.6, -7.1, -2.6, 5.2, 0.9, 5.2], 'O'), q([-2.2, -9, 3.3, 4.4, 1.6, 0.9], 'O'), q([-2.7, -9.4, -2.7, 5.4, 0.6, 6.7], 'k'),
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

  // ───────── monstros (esculpidos em camadas) ─────────
  function slime(c) {
    const pal = { a: sh(c, 1), A: sh(c, 1.28), d: sh(c, 0.72), D: sh(c, 0.55), k: K, w: WH, m: sh(c, 0.36) };
    const skin = (c2, r, cols, rows) => (r === 0 ? 'A' : r >= rows - 1 ? 'D' : hsh(c2, r, 3) < 0.12 ? 'A' : c2 === 0 || c2 === cols - 1 ? 'd' : 'a');
    const tier = (x, y, w, h) => q([-x, y, -x, w, h, w], 'a', { front: skin, side: skin, back: skin, top: (c2, r) => (c2 < w * 0.4 && r > w * 0.5 ? 'A' : 'a') });
    return part([
      tier(5.5, 0, 11, 2), tier(6.5, 1, 13, 4), tier(6, 5, 12, 2), tier(5, 7, 10, 2), tier(3.5, 9, 7, 1), tier(2, 10, 4, 1),
      q([-6.9, 2, -4.5, 13.8, 2.4, 9], 'a'), q([-4.5, 2, -6.9, 9, 2.4, 13.8], 'a'),
      // brilho, olhos saltados com reflexo, boca, gotas escorrendo
      q([-4.8, 6.6, 2.8, 2.6, 2, 2.4], 'A'), q([-3.4, 8.7, 1.4, 1.2, 0.9, 1.2], 'w'),
      ...both([1.3, 3, 6.5, 2.3, 2.7, 0.6], 'k'), ...both([1.4, 4.7, 7, 0.9, 0.9, 0.3], 'w'), q([-1.3, 1.6, 6.5, 2.6, 0.9, 0.5], 'm'),
      q([5.9, 0, 1.6, 1.9, 1.5, 2.2], 'd'), q([-7.5, 0, -3, 1.7, 1.1, 2.6], 'd'), q([2, 0, -7.4, 2.4, 1.2, 1.6], 'd'),
    ], pal);
  }
  const SLIMES = [[90, 216, 128], [90, 166, 255], [255, 116, 178], [204, 128, 255]].map(slime);
  const BP = { f: [104, 76, 128, 0], F: [140, 106, 166, 0], d: [70, 50, 90, 0], k: K, r: [255, 70, 70, 1], w: WH, m: [56, 40, 74, 0], M: [84, 60, 106, 0], e: [214, 130, 160, 0] };
  const fur = (c, r) => (hsh(c, r, 9) < 0.25 ? 'F' : hsh(c, r, 10) < 0.2 ? 'd' : 'f');
  const memb = (c, r) => (hsh(c, r, 11) < 0.25 ? 'M' : 'm');
  const bat = {
    body: part([
      q([-3, 0, -2.5, 6, 6, 5], 'f', { front: fur, side: fur, back: fur, top: fur }),
      // focinho, presas, olhos acesos, tufo, orelhas com miolo, barriga e garras
      q([-1.5, 1, 2.5, 3, 2, 1.4], 'F', { front: ['FkF', 'fff'] }), ...both([0.6, 0.1, 3.3, 0.7, 1.1, 0.5], 'w'),
      ...both([1.1, 3.5, 2.5, 1.4, 1.3, 0.45], 'r'), q([-1.2, 5.5, 1.2, 2.4, 1.3, 1.5], 'F'),
      ...both([1, 5.4, -1, 2.3, 3.6, 1.6], 'd'), ...both([1.5, 6, 0.5, 1.3, 2.4, 0.35], 'e'), ...both([1.6, 9, -0.8, 1, 1, 1.2], 'd'),
      q([-2.3, -0.9, -1.6, 4.6, 1.3, 3.6], 'F'), ...both([0.9, -1.8, 0.2, 0.9, 1.1, 0.9], 'd'), q([-1, 0.5, -3.4, 2, 2.4, 1], 'd'),
    ], BP),
    wingA: part([
      q([0, -2.5, -0.5, 6, 5, 1], 'm', { front: memb, back: memb }), q([0, 2, -0.9, 6.3, 1, 1.8], 'd'), q([5.2, -3.6, -0.8, 1, 6.4, 1.6], 'd'), q([2.4, -3.2, -0.7, 0.7, 5.6, 1.4], 'd'),
      q([0.5, -3.7, -0.4, 1.7, 1.3, 0.8], 'm'), q([3.2, -4.1, -0.4, 1.8, 1.7, 0.8], 'm'),
    ], BP),
    wingB: part([
      q([0, -1.5, -0.5, 5, 4, 1], 'm', { front: memb, back: memb }), q([0, 2, -0.9, 5.5, 0.9, 1.8], 'd'), q([2.4, -2.2, -0.7, 0.7, 4.6, 1.4], 'd'),
      q([4.9, 1.5, -0.7, 1.3, 1.8, 1.4], 'w'), q([0.8, -2.7, -0.4, 1.5, 1.3, 0.8], 'm'), q([3.3, -2.4, -0.4, 1.5, 1, 0.8], 'm'),
    ], BP),
  };
  const WP = { c: [118, 70, 190, 0.18], C: [160, 104, 236, 0.3], d: [78, 44, 136, 0.1], k: [16, 8, 34, 0], e: [255, 240, 140, 1], g: [210, 150, 255, 0.9] };
  const cloth = (c, r, cols, rows) => (r === rows - 1 && (c + r) % 2 ? 'd' : hsh(c, r, 14) < 0.2 ? 'C' : hsh(c, r, 15) < 0.25 ? 'd' : 'c');
  const cl = { front: cloth, side: cloth, back: cloth, top: cloth };
  const wisp = {
    body: part([
      q([-4, 10, -4, 8, 8, 8], 'c', Object.assign({}, cl, { front: ['cCCccccc', 'cckkkkcc', 'ckkkkkkc', 'ckkkkkkc', 'ckkkkkkc', 'ckkkkkkc', 'cckkkkcc', 'dccccccd'] })),
      // capuz com aba e ponta caída, olhos acesos no fundo, capa nos ombros, corpo afinando, tiras rasgadas e amuleto
      q([-4.7, 17.1, 2.4, 9.4, 1.5, 2.5], 'C'), ...both([3.5, 10.4, 2.6, 1.3, 7, 2.1], 'c'), q([-3.1, 9.5, 2.8, 6.2, 1.1, 1.7], 'd'),
      q([-2.2, 17.4, -5, 4.4, 2.1, 3.2], 'c'), q([-1.1, 18.8, -6, 2.2, 1.5, 2.2], 'd'), q([-0.5, 18, -6.8, 1, 1, 1.2], 'C'),
      ...both([0.9, 12.9, 3.6, 1.3, 2.3, 0.4], 'e'),
      q([-5.7, 6.8, -4.1, 11.4, 3.6, 8.2], 'c', cl), ...both([4.6, 5.6, -3, 1.3, 2, 6], 'd'),
      q([-4.5, 4.4, -3.5, 9, 2.6, 7], 'c', cl), q([-3.5, 2.2, -3, 7, 2.4, 6], 'd', cl), q([-2.5, 0.4, -2, 5, 2, 4], 'd'), q([-1, -1.6, -1, 2, 2.2, 2], 'd'),
      q([-4, 1.6, 2.6, 1.4, 3.6, 0.8], 'd'), q([-1.6, 0.2, 2.9, 1.4, 4.6, 0.8], 'c'), q([1.1, 1, 2.7, 1.4, 3.8, 0.8], 'd'), q([3, 2.2, 2.4, 1.2, 2.8, 0.8], 'c'),
      q([-3.4, 0.8, -3.6, 1.4, 4.2, 0.8], 'd'), q([0.2, -0.2, -3.5, 1.5, 4.8, 0.8], 'c'), q([2.4, 1.4, -3.6, 1.3, 3.4, 0.8], 'd'),
      q([-2.5, 9, 3.1, 5, 0.6, 0.7], 'g'), q([-1, 6.9, 3.4, 2, 2.1, 0.9], 'e'),
    ], WP),
    hand: part([q([-1.3, -1.3, -1.3, 2.6, 2.6, 2.6], 'g'), q([-1.3, 1.3, 0.3, 0.7, 1.1, 0.9], 'C'), q([-0.35, 1.3, 0.3, 0.7, 1.4, 0.9], 'C'), q([0.6, 1.3, 0.3, 0.7, 1.1, 0.9], 'C'), q([-1.9, -0.4, 0, 0.7, 0.9, 0.9], 'C'), q([-0.7, -0.7, 1.3, 1.4, 1.4, 1.4], 'e')], WP),
  };
  const GP = { a: [136, 142, 160, 0], b: [164, 170, 188, 0], d: [86, 90, 112, 0], D: [58, 60, 82, 0], m: [86, 170, 84, 0], M: [124, 206, 108, 0], e: [140, 255, 170, 1], k: K, r: [226, 92, 92, 0], w: [244, 236, 220, 0] };
  const rock = (c, r) => { const o = (Math.floor(r / 3) % 2) * 2; return r % 3 === 2 || (c + o) % 4 === 3 ? 'd' : hsh(c >> 1, r, 20) < 0.3 ? 'b' : 'a'; };
  const mossy = (c, r) => (r === 0 || (r === 1 && hsh(c, 1, 21) < 0.5) ? (hsh(c, r, 22) < 0.3 ? 'M' : 'm') : rock(c, r));
  const rk = { front: rock, side: rock, back: rock }, mk = { front: mossy, side: mossy, back: mossy, top: () => 'm' };
  const moss = (c, r) => (hsh(c, r, 23) < 0.35 ? 'M' : 'm');
  const golem = {
    torso: part([
      q([-6, 0, -3.5, 12, 10, 7], 'a', Object.assign({}, mk, { bottom: () => 'D' })),
      // placa do peito com runa acesa, ombros de pedra, manto de musgo, cinto de pedras, cristais e calombos nas costas
      q([-4.5, 2, 3.5, 9, 6, 1.2], 'b', { front: (c, r) => ((c === 4 && r >= 1 && r <= 4) || (r === 2 && c >= 3 && c <= 5) ? 'e' : r === 0 || r === 5 || c === 0 || c === 8 ? 'd' : 'b') }),
      ...both([4.5, 6.8, -3.8, 4.6, 4.6, 7.6], 'a', mk), ...both([5.4, 11.2, -1.5, 2.4, 1.4, 3], 'M'),
      q([-7, 8.6, -4.1, 14, 2.5, 8.2], 'm', { front: moss, back: moss, top: moss }), q([-6.5, 0, -3.9, 13, 1.7, 7.8], 'd'), ...both([2, -0.4, 3.6, 2.2, 2, 0.8], 'b'),
      q([-3.2, 6, -5.4, 1.7, 4.2, 2], 'e'), q([0.4, 7, -5.2, 1.5, 5.8, 1.8], 'e'), q([2.6, 5.4, -4.9, 1.3, 3.2, 1.5], 'e'), q([-5, 1.2, -4.7, 4.2, 3.2, 1.4], 'd'), q([1, 2, -4.5, 3.4, 2.4, 1.2], 'b'),
    ], GP),
    head: part([
      q([-3.5, 0, -3, 7, 6, 6], 'a', Object.assign({}, mk, { front: ['mMmmMmm', 'aabaaba', 'adddada', 'aDDaDDa', 'abaaaba', 'aabaaba'] })),
      // sobrancelha saliente, olhos acesos afundados, queixo, tufo de musgo e um cogumelinho
      q([-3.9, 3.9, 2.6, 7.8, 1.4, 1.3], 'd'), ...both([0.6, 2.7, 3, 2, 1.1, 0.3], 'e'), q([-3.1, -0.7, 2.4, 6.2, 1.9, 1.3], 'b'), ...both([0.4, 1, 3.6, 1.1, 0.8, 0.4], 'd'),
      q([-2.6, 6, -2.2, 4.4, 1.3, 3.8], 'M'), q([1.6, 6, 0.6, 0.9, 1.7, 0.9], 'w'), q([0.9, 7.5, -0.1, 2.3, 0.9, 2.3], 'r'), q([1.6, 8.4, 0.6, 0.9, 0.5, 0.9], 'r'),
    ], GP),
    arm: part([
      q([-2, -11, -2, 4, 12, 4], 'a', mk), q([-2.7, -1.6, -2.7, 5.4, 3.5, 5.4], 'd'), q([-2.7, -10.6, -2.7, 5.4, 4.2, 5.4], 'a', rk), q([-2.3, -3.2, 2, 2.5, 2.1, 0.5], 'm'),
      q([-3.2, -15, -3.2, 6.4, 4.6, 6.4], 'b', { side: rock, back: rock, bottom: () => 'D' }), q([-3, -15.4, 3, 1.7, 1.8, 0.7], 'd'), q([-0.85, -15.4, 3, 1.7, 1.8, 0.7], 'd'), q([1.3, -15.4, 3, 1.7, 1.8, 0.7], 'd'),
    ], GP),
    leg: part([
      q([-2.5, -8, -2.5, 5, 8, 5], 'a', rk), q([-2.9, -4.3, 2.2, 5.8, 2.5, 0.9], 'b'), q([-2.8, -5.7, -2.8, 5.6, 0.8, 5.6], 'm'),
      q([-3.2, -8, -3, 6.4, 2.6, 7.4], 'd', { top: () => 'a' }), q([-3, -8, 4.3, 1.8, 1.6, 1], 'b'), q([-0.9, -8, 4.3, 1.8, 1.6, 1], 'b'), q([1.2, -8, 4.3, 1.8, 1.6, 1], 'b'),
    ], GP),
  };
  CB.MDL = { player, SLIMES, bat, wisp, golem, part };
})();
