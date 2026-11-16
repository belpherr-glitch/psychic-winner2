// Cubória: jogo (personagem em terceira pessoa, controles, mineração, construção, inimigos, mochila, salvamento)
(function () {
  const CB = window.CB, B = CB.B, D = CB.D, I = CB.I, IT = CB.IT;
  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const WSIZE = 224, WH = 112, DAY = 720, REACH = 9, PS = 1.95;
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  const cfg = Object.assign({ quality: 1, view: 1, sens: 1, sound: true, autojump: true, tp: false }, LS.get('cuboria.cfg', {}));
  const saveCfg = () => LS.set('cuboria.cfg', cfg);

  // ───── som sintetizado ─────
  const SFX = {
    dig: [[180, 0.04, 'square', 0.05]], brk: [[140, 0.06, 'square', 0.07], [90, 0.08, 'square', 0.06]], place: [[300, 0.05, 'triangle', 0.1]],
    swing: [[420, 0.05, 'triangle', 0.05], [260, 0.06, 'triangle', 0.04]], hit: [[220, 0.06, 'square', 0.09], [120, 0.08, 'square', 0.07]],
    hurt: [[300, 0.07, 'sawtooth', 0.08], [160, 0.12, 'sawtooth', 0.07]], pick: [[880, 0.04, 'triangle', 0.07], [1320, 0.06, 'triangle', 0.06]],
    jump: [[330, 0.05, 'triangle', 0.05], [520, 0.05, 'triangle', 0.04]], craft: [[520, 0.06, 'triangle', 0.1], [780, 0.08, 'triangle', 0.1], [1040, 0.1, 'triangle', 0.08]],
    heal: [[660, 0.08, 'sine', 0.1], [990, 0.12, 'sine', 0.1]], die: [[300, 0.15, 'sawtooth', 0.1], [200, 0.2, 'sawtooth', 0.1], [100, 0.4, 'sawtooth', 0.1]],
    pop: [[200, 0.05, 'sine', 0.12], [400, 0.08, 'sine', 0.1]],
  };
  let actx = null, lastS = {};
  function sfx(name) {
    if (!cfg.sound) return;
    const now = performance.now();
    if (lastS[name] && now - lastS[name] < 45) return;
    lastS[name] = now;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      let t = actx.currentTime;
      for (const [f, d, type, vol] of SFX[name]) {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = type; o.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.0008, t + d);
        o.connect(g).connect(actx.destination);
        o.start(t); o.stop(t + d + 0.02);
        t += d;
      }
    } catch (e) {}
  }

  // ───── ícones (desenhados no canvas) ─────
  const ICONS = {};
  const rgb = (c, k) => 'rgb(' + c.map((v) => Math.round(clamp(v * (k || 1), 0, 255))).join(',') + ')';
  function icon(id) {
    if (ICONS[id]) return ICONS[id];
    const c = document.createElement('canvas');
    c.width = c.height = 48;
    const x = c.getContext('2d');
    x.lineJoin = 'round'; x.lineCap = 'round';
    const ink = '#1b1640';
    if (id === -1) {
      x.fillStyle = '#ffd2a8'; x.strokeStyle = ink; x.lineWidth = 3;
      x.beginPath(); x.roundRect ? x.roundRect(12, 16, 24, 24, 7) : x.rect(12, 16, 24, 24); x.fill(); x.stroke();
      for (let k = 0; k < 4; k++) { x.beginPath(); x.roundRect ? x.roundRect(12 + k * 6, 8, 6, 14, 3) : x.rect(12 + k * 6, 8, 6, 14); x.fill(); x.stroke(); }
      return (ICONS[id] = c.toDataURL());
    }
    if (id < 100) {
      const d = D[id];
      const spr = { [B.TORCH]: 1, [B.FLOWER]: 1, [B.TGRASS]: 1, [B.MUSH]: 1, [B.HEART]: 1, [B.LANTERN]: 1, [B.BENCH]: 1 }[id];
      if (spr) {
        x.lineWidth = 3; x.strokeStyle = ink;
        if (id === B.TORCH) { x.fillStyle = rgb(d.c2); x.fillRect(21, 18, 6, 24); x.strokeRect(21, 18, 6, 24); x.fillStyle = rgb(d.c1); x.beginPath(); x.arc(24, 14, 8, 0, 7); x.fill(); x.stroke(); }
        else if (id === B.HEART) { x.fillStyle = rgb(d.c1); x.beginPath(); x.moveTo(24, 42); x.bezierCurveTo(2, 26, 10, 6, 24, 16); x.bezierCurveTo(38, 6, 46, 26, 24, 42); x.fill(); x.stroke(); }
        else if (id === B.MUSH) { x.fillStyle = rgb(d.c2); x.fillRect(19, 24, 10, 18); x.strokeRect(19, 24, 10, 18); x.fillStyle = rgb(d.c1); x.beginPath(); x.ellipse(24, 22, 17, 11, 0, Math.PI, 0); x.closePath(); x.fill(); x.stroke(); }
        else if (id === B.LANTERN) { x.fillStyle = rgb(d.c2); x.fillRect(12, 10, 24, 30); x.strokeRect(12, 10, 24, 30); x.fillStyle = rgb(d.c1); x.fillRect(17, 15, 14, 20); }
        else if (id === B.BENCH) { x.fillStyle = rgb(d.c1); x.fillRect(4, 14, 40, 9); x.strokeRect(4, 14, 40, 9); x.fillStyle = rgb(d.c2); x.fillRect(8, 23, 7, 19); x.fillRect(33, 23, 7, 19); x.strokeRect(8, 23, 7, 19); x.strokeRect(33, 23, 7, 19); }
        else { x.fillStyle = rgb(d.c2); x.fillRect(22, 20, 4, 24); x.fillStyle = rgb(d.c1); x.beginPath(); x.arc(24, 17, 10, 0, 7); x.fill(); x.stroke(); }
      } else {
        // cubinho isométrico
        const T = [[24, 4], [43, 14], [24, 24], [5, 14]], L = [[5, 14], [24, 24], [24, 45], [5, 35]], R = [[24, 24], [43, 14], [43, 35], [24, 45]];
        const poly = (p, f) => { x.beginPath(); p.forEach((q, i) => (i ? x.lineTo(...q) : x.moveTo(...q))); x.closePath(); x.fillStyle = f; x.fill(); };
        const top = id === B.GRASS || id === B.PGRASS ? d.c1 : d.c1, sideC = id === B.GRASS || id === B.PGRASS ? d.c2 : d.c1;
        poly(T, rgb(top, 1.1)); poly(L, rgb(sideC, 0.85)); poly(R, rgb(sideC, 0.68));
        if (d.style === 2 || d.style === 8) { x.fillStyle = rgb(d.style === 2 ? d.c1 : d.c2, 1.1); x.fillRect(11, 22, 6, 6); x.fillRect(30, 28, 6, 6); x.fillRect(22, 10, 6, 5); }
        if (id === B.GRASS || id === B.PGRASS) { x.fillStyle = rgb(d.c1, 0.85); x.fillRect(5, 14, 19, 6); x.fillStyle = rgb(d.c1, 0.7); x.beginPath(); x.moveTo(24, 24); x.lineTo(43, 14); x.lineTo(43, 20); x.lineTo(24, 30); x.fill(); }
        x.lineWidth = 3; x.strokeStyle = ink;
        x.beginPath(); x.moveTo(24, 4); x.lineTo(43, 14); x.lineTo(43, 35); x.lineTo(24, 45); x.lineTo(5, 35); x.lineTo(5, 14); x.closePath(); x.stroke();
        x.lineWidth = 1.5; x.beginPath(); x.moveTo(5, 14); x.lineTo(24, 24); x.lineTo(43, 14); x.moveTo(24, 24); x.lineTo(24, 45); x.stroke();
      }
    } else {
      const it = IT[id];
      x.lineWidth = 3; x.strokeStyle = ink;
      if (it.tool === 'pick') {
        x.strokeStyle = ink; x.lineWidth = 8; x.beginPath(); x.moveTo(12, 40); x.lineTo(32, 16); x.stroke();
        x.strokeStyle = '#a8794a'; x.lineWidth = 4; x.stroke();
        x.lineWidth = 9; x.strokeStyle = ink; x.beginPath(); x.moveTo(12, 14); x.quadraticCurveTo(30, 2, 42, 24); x.stroke();
        x.lineWidth = 5; x.strokeStyle = rgb(it.c); x.stroke();
      } else if (it.tool === 'sword') {
        x.lineWidth = 10; x.strokeStyle = ink; x.beginPath(); x.moveTo(14, 34); x.lineTo(40, 8); x.stroke();
        x.lineWidth = 6; x.strokeStyle = rgb(it.c); x.stroke();
        x.lineWidth = 4; x.strokeStyle = '#ffffff'; x.globalAlpha = 0.5; x.beginPath(); x.moveTo(20, 26); x.lineTo(36, 10); x.stroke(); x.globalAlpha = 1;
        x.lineWidth = 7; x.strokeStyle = ink; x.beginPath(); x.moveTo(9, 27); x.lineTo(21, 39); x.moveTo(13, 35); x.lineTo(7, 41); x.stroke();
        x.lineWidth = 3.5; x.strokeStyle = '#a8794a'; x.beginPath(); x.moveTo(9, 27); x.lineTo(21, 39); x.moveTo(13, 35); x.lineTo(7, 41); x.stroke();
      } else if (it.bar) {
        x.fillStyle = rgb(it.c); x.beginPath(); x.moveTo(10, 32); x.lineTo(16, 18); x.lineTo(38, 18); x.lineTo(42, 32); x.closePath(); x.fill(); x.stroke();
        x.fillStyle = 'rgba(255,255,255,.45)'; x.fillRect(18, 21, 16, 3);
      } else {
        x.fillStyle = rgb(it.c); x.beginPath(); x.ellipse(24, 27, 15, 13, 0, 0, 7); x.fill(); x.stroke();
        x.fillStyle = 'rgba(255,255,255,.5)'; x.beginPath(); x.ellipse(18, 22, 4, 3, -0.5, 0, 7); x.fill();
        if (id === I.FRUIT) { x.fillStyle = '#3ddc97'; x.beginPath(); x.ellipse(28, 12, 6, 3, -0.6, 0, 7); x.fill(); x.stroke(); }
      }
    }
    return (ICONS[id] = c.toDataURL());
  }
  const itemCol = (id) => (id < 100 ? D[id].c1.map((v) => v / 255) : IT[id].c.map((v) => v / 255));

  // ───── estado ─────
  const cv = $('#cv'), ov = $('#ov'), octx = ov.getContext('2d');
  let gfx = null;
  try { gfx = new CB.Gfx(cv); } catch (e) { document.body.innerHTML = '<p style="padding:30px">Seu aparelho não conseguiu iniciar os gráficos 3D (WebGL).<br>' + e.message + '</p>'; return; }
  const batch = new CB.Batch(), vmb = new CB.Batch();
  const applyCfg = () => { gfx.quality = cfg.quality; gfx.viewDist = [64, 96, 128][cfg.view]; };
  applyCfg();
  let G = null, screen = 'menu';

  const slotKey = (n) => 'cuboria.slot.' + n;
  function newPlayer(w) {
    const inv = new Array(40).fill(null);
    inv[0] = { id: I.PICK_WOOD, n: 1 };
    inv[1] = { id: I.SWORD_WOOD, n: 1 };
    inv[2] = { id: B.TORCH, n: 12 };
    return { x: w.spawn[0], y: w.spawn[1], z: w.spawn[2], vx: 0, vy: 0, vz: 0, w: 0.58, h: 3.4, yaw: 0, hp: 100, maxHp: 100, inv, sel: 0,
      onGround: false, inWater: false, swing: 0, invul: 0, calm: 0, walk: 0, mine: null, useCd: 0, dead: 0, lastVy: 0 };
  }

  // ───── física de caixa contra os blocos ─────
  function overlaps(w, e) {
    const x0 = Math.floor(e.x - e.w), x1 = Math.floor(e.x + e.w - 1e-6), y0 = Math.floor(e.y), y1 = Math.floor(e.y + e.h - 1e-6), z0 = Math.floor(e.z - e.w), z1 = Math.floor(e.z + e.w - 1e-6);
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (w.solid(x, y, z)) return [x, y, z];
    return null;
  }
  function moveAxis(w, e, ax, d) {
    if (!d) return false;
    const key = ax === 0 ? 'x' : ax === 1 ? 'y' : 'z';
    e[key] += d;
    const hit = overlaps(w, e);
    if (!hit) return false;
    if (ax === 1) e.y = d < 0 ? Math.floor(e.y) + 1 : Math.floor(e.y + e.h) - e.h - 1e-4;
    else {
      const c = hit[ax];
      e[key] = d > 0 ? c - e.w - 1e-4 : c + 1 + e.w + 1e-4;
      if (overlaps(w, e)) e[key] -= d;
    }
    return true;
  }
  function physics(w, e, dt) {
    const steps = Math.ceil(Math.max(Math.abs(e.vx), Math.abs(e.vy), Math.abs(e.vz)) * dt / 0.35) || 1;
    const h = dt / steps;
    e.onGround = false; e.hitWall = false;
    for (let s = 0; s < steps; s++) {
      if (moveAxis(w, e, 1, e.vy * h)) { if (e.vy < 0) e.onGround = true; e.lastVy = e.vy; e.vy = 0; }
      if (moveAxis(w, e, 0, e.vx * h)) { e.hitWall = true; e.vx = 0; }
      if (moveAxis(w, e, 2, e.vz * h)) { e.hitWall = true; e.vz = 0; }
    }
  }
  // luz num ponto (pra colorir personagem, inimigos e itens)
  function litAt(x, y, z) {
    const L = G.world.light(Math.floor(x), Math.floor(y), Math.floor(z)), s = L[0] / 15, sc = G.env.skyCol;
    return [0, 1, 2].map((c) => 1 - Math.exp(-(sc[c] * s * 0.95 + (L[c + 1] / 15) * 1.3) * 1.8) + 0.04);
  }

  // ───── mochila ─────
  const maxStack = (id) => (id >= 100 && IT[id].tool ? 1 : 999);
  function addItem(id, n) {
    const inv = G.p.inv;
    for (const s of inv) if (s && s.id === id && s.n < maxStack(id)) { const k = Math.min(n, maxStack(id) - s.n); s.n += k; n -= k; if (!n) break; }
    for (let i = 0; i < inv.length && n > 0; i++) if (!inv[i]) { const k = Math.min(n, maxStack(id)); inv[i] = { id, n: k }; n -= k; }
    hotbarDirty = true;
    if (screen === 'bag') renderBag();
    return n;
  }
  const count = (id) => G.p.inv.reduce((s, it) => s + (it && it.id === id ? it.n : 0), 0);
  function take(id, n) {
    for (const s of G.p.inv) if (s && s.id === id) { const k = Math.min(n, s.n); s.n -= k; n -= k; if (!n) break; }
    G.p.inv.forEach((s, i) => { if (s && s.n <= 0) G.p.inv[i] = null; });
    hotbarDirty = true;
  }

  // ───── itens no chão, partículas, números ─────
  function dropItem(id, n, x, y, z) {
    if (!id || n <= 0) return;
    G.drops.push({ id, n, x, y, z, vx: (Math.random() - 0.5) * 6, vy: 7 + Math.random() * 4, vz: (Math.random() - 0.5) * 6, w: 0.25, h: 0.5, age: 0 });
  }
  function burst(x, y, z, cols, n, sp, emis) {
    for (let i = 0; i < n; i++) {
      const c = cols[i % cols.length];
      G.parts.push({ x, y, z, vx: (Math.random() - 0.5) * sp * 1.6, vy: Math.random() * sp * 1.3 + 2, vz: (Math.random() - 0.5) * sp * 1.6, life: 0.5 + Math.random() * 0.5, col: c, s: 0.07 + Math.random() * 0.09, emis: emis || 0 });
    }
  }
  const blockCols = (id) => [D[id].c1.map((v) => v / 255), D[id].c2.map((v) => v / 255)];
  function popText(x, y, z, txt, col) { G.texts.push({ x, y, z, txt, col, life: 1 }); }
  let toastT = 0, toastLast = '';
  function toast(msg) {
    const t = $('#toast');
    if (toastLast === msg && t.classList.contains('show')) return;
    toastLast = msg;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // ───── quebrar e colocar blocos ─────
  const PLANTS = new Set([B.TGRASS, B.FLOWER, B.MUSH]);
  function breakAt(x, y, z) {
    const w = G.world, id = w.get(x, y, z), d = D[id];
    if (!id || d.kind === 'liquid') return;
    const cols = blockCols(id);
    if (id === B.LOG || id === B.PALE) return fellTree(x, y, z, id);
    w.set(x, y, z, B.AIR);
    burst(x + 0.5, y + 0.5, z + 0.5, cols, 12, 4);
    sfx('brk');
    let drop = d.drop;
    if (d.leafy && Math.random() < 0.05) drop = I.FRUIT;
    if (drop) dropItem(drop, 1, x + 0.5, y + 0.5, z + 0.5);
    // plantas e tochas soltas em cima caem junto
    const up = w.get(x, y + 1, z);
    if (PLANTS.has(up) || up === B.HEART) breakAt(x, y + 1, z);
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      if (w.get(nx, ny, nz) === B.TORCH || w.get(nx, ny, nz) === B.LANTERN) {
        let ok = false;
        for (const [ex, ey, ez] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0], [0, 1, 0]]) if (w.solid(nx + ex, ny + ey, nz + ez)) ok = true;
        if (!ok) breakAt(nx, ny, nz);
      }
    }
  }
  // derruba a árvore inteira: troncos ligados pra cima e as folhas em volta
  function fellTree(x, y, z, LOGID) {
    const w = G.world, logs = [], seen = new Set(), q = [[x, y, z]];
    while (q.length && logs.length < 500) {
      const [cx, cy, cz] = q.pop(), k = cx + ',' + cy + ',' + cz;
      if (seen.has(k) || cy < y || w.get(cx, cy, cz) !== LOGID) continue;
      seen.add(k);
      logs.push([cx, cy, cz]);
      for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (dx || dy || dz) q.push([cx + dx, cy + dy, cz + dz]);
    }
    let fruit = 0, minX = x, maxX = x, minY = y, maxY = y, minZ = z, maxZ = z;
    for (const [lx, ly, lz] of logs) {
      w.t[w.idx(lx, ly, lz)] = B.AIR; w.edits.set(w.idx(lx, ly, lz), B.AIR);
      minX = Math.min(minX, lx); maxX = Math.max(maxX, lx); minY = Math.min(minY, ly); maxY = Math.max(maxY, ly); minZ = Math.min(minZ, lz); maxZ = Math.max(maxZ, lz);
      if (Math.random() < 0.4) burst(lx + 0.5, ly + 0.5, lz + 0.5, blockCols(LOGID), 3, 4);
    }
    const top = logs.filter((l) => l[1] >= minY + 4);
    for (let ly = minY; ly <= maxY + 6; ly++)
      for (let lz = minZ - 7; lz <= maxZ + 7; lz++)
        for (let lx = minX - 7; lx <= maxX + 7; lx++) {
          const id = w.get(lx, ly, lz);
          if (!D[id].leafy && !(id === B.SNOW && D[w.get(lx, ly - 1, lz)].leafy)) continue;
          if (!top.some((l) => Math.abs(l[0] - lx) <= 6 && Math.abs(l[2] - lz) <= 6 && Math.abs(l[1] - ly) <= 6)) continue;
          w.t[w.idx(lx, ly, lz)] = B.AIR; w.edits.set(w.idx(lx, ly, lz), B.AIR);
          if (Math.random() < 0.04) burst(lx + 0.5, ly + 0.5, lz + 0.5, blockCols(id), 2, 3);
          if (Math.random() < 0.006) fruit++;
        }
    for (let cx = minX - 7; cx <= maxX + 7; cx++) for (let cz = minZ - 7; cz <= maxZ + 7; cz++) {
      if (!w.inside(cx, 0, cz)) continue;
      const c = cz * w.W + cx;
      while (w.hm[c] > 0 && (w.t[w.idx(cx, w.hm[c], cz)] === B.AIR)) w.hm[c]--;
    }
    w.relight(minX - 22, minY - 15, minZ - 22, maxX + 22, maxY + 22, maxZ + 22);
    const wood = Math.max(1, Math.ceil(logs.length / 2));
    dropItem(B.WOOD, wood, x + 0.5, y + 1, z + 0.5);
    if (fruit) dropItem(I.FRUIT, fruit, x + 0.5, y + 1.5, z + 0.5);
    sfx('brk');
    toast('Árvore derrubada: +' + wood + ' madeira');
    mapDirty = true;
  }
  function canPlace(x, y, z, id) {
    const w = G.world;
    if (!w.inside(x, y, z) || y < 1) return false;
    const cur = w.get(x, y, z);
    if (cur !== B.AIR && !PLANTS.has(cur) && cur !== B.WATER && cur !== B.TGRASS) return false;
    if (D[id].solid) {
      const box = { x: x + 0.5, y, z: z + 0.5, w: 0.5, h: 1 };
      const hit = (e) => Math.abs(e.x - box.x) < e.w + 0.5 && Math.abs(e.z - box.z) < e.w + 0.5 && e.y < y + 1 && e.y + e.h > y;
      if (hit(G.p)) return false;
      for (const m of G.mobs) if (hit(m)) return false;
    }
    return true;
  }

  // ───── raio da mira (voxel DDA) ─────
  function raycast(o, d, maxT) {
    const w = G.world;
    let x = Math.floor(o[0]), y = Math.floor(o[1]), z = Math.floor(o[2]);
    const sx = Math.sign(d[0]), sy = Math.sign(d[1]), sz = Math.sign(d[2]);
    const tdx = Math.abs(1 / d[0]), tdy = Math.abs(1 / d[1]), tdz = Math.abs(1 / d[2]);
    let tx = (sx > 0 ? x + 1 - o[0] : o[0] - x) * tdx, ty = (sy > 0 ? y + 1 - o[1] : o[1] - y) * tdy, tz = (sz > 0 ? z + 1 - o[2] : o[2] - z) * tdz;
    let n = [0, 0, 0], t = 0;
    for (let k = 0; k < 200 && t <= maxT; k++) {
      const id = w.get(x, y, z);
      if (id && D[id].kind !== 'liquid') return { x, y, z, n, id, t };
      if (tx < ty && tx < tz) { t = tx; tx += tdx; x += sx; n = [-sx, 0, 0]; }
      else if (ty < tz) { t = ty; ty += tdy; y += sy; n = [0, -sy, 0]; }
      else { t = tz; tz += tdz; z += sz; n = [0, 0, -sz]; }
    }
    return null;
  }

  // ───── controles ─────
  const inp = { jx: 0, jy: 0, jump: false, use: false, keys: {} };
  let stickId = null, stickO = null, lookId = null, lookLast = null;
  const stick = $('#stick');
  cv.addEventListener('pointerdown', (e) => {
    if (screen !== 'play') return;
    if (e.clientX < window.innerWidth * 0.42 && stickId === null && e.pointerType !== 'mouse') {
      stickId = e.pointerId; stickO = [e.clientX, e.clientY];
      stick.style.display = 'block'; stick.style.left = e.clientX + 'px'; stick.style.top = e.clientY + 'px';
      stick.firstChild.style.transform = '';
    } else if (lookId === null) { lookId = e.pointerId; lookLast = [e.clientX, e.clientY, e.clientX, e.clientY]; }
    try { cv.setPointerCapture(e.pointerId); } catch (x) {}
  });
  cv.addEventListener('pointermove', (e) => {
    if (e.pointerId === stickId) {
      let dx = e.clientX - stickO[0], dy = e.clientY - stickO[1];
      const l = Math.hypot(dx, dy), R = 50;
      if (l > R) { dx *= R / l; dy *= R / l; }
      inp.jx = dx / R; inp.jy = -dy / R;
      stick.firstChild.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    } else if (e.pointerId === lookId && G) {
      const k = 0.0055 * cfg.sens;
      G.cam.yaw -= (e.clientX - lookLast[0]) * k;
      G.cam.pitch = clamp(G.cam.pitch + (e.clientY - lookLast[1]) * k, cfg.tp ? -1.1 : -1.5, cfg.tp ? 1.35 : 1.5);
      lookLast[0] = e.clientX; lookLast[1] = e.clientY;
    }
  });
  const upPtr = (e) => {
    if (e.pointerId === stickId) { stickId = null; inp.jx = inp.jy = 0; stick.style.display = 'none'; }
    if (e.pointerId === lookId) {
      // clique de mouse sem arrastar = usar uma vez
      if (e.pointerType === 'mouse' && lookLast && Math.hypot(e.clientX - lookLast[2], e.clientY - lookLast[3]) < 5 && G) useTap = true;
      lookId = null;
    }
  };
  cv.addEventListener('pointerup', upPtr);
  cv.addEventListener('pointercancel', upPtr);
  let useTap = false;
  const hold = (el, key) => {
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); inp[key] = true; el.classList.add('on'); if (key === 'use') useTap = true; });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, () => { inp[key] = false; el.classList.remove('on'); });
  };
  hold($('#btUse'), 'use');
  hold($('#btJump'), 'jump');
  addEventListener('keydown', (e) => {
    inp.keys[e.code] = true;
    if (screen === 'play') {
      if (e.code === 'Space') inp.jump = true;
      if (e.code === 'KeyF' || e.code === 'Enter') { inp.use = true; useTap = true; }
      if (/^Digit[1-8]$/.test(e.code)) { G.p.sel = +e.code[5] - 1; hotbarDirty = true; }
      if (e.code === 'KeyE' || e.code === 'Tab') { e.preventDefault(); openBag(); }
      if (e.code === 'Escape') pauseGame();
      if (e.code === 'KeyV') $('#btCam').onclick();
    } else if (screen === 'bag' && (e.code === 'KeyE' || e.code === 'Tab' || e.code === 'Escape')) { e.preventDefault(); closeBag(); }
  });
  addEventListener('keyup', (e) => {
    inp.keys[e.code] = false;
    if (e.code === 'Space') inp.jump = false;
    if (e.code === 'KeyF' || e.code === 'Enter') inp.use = false;
  });
  cv.addEventListener('wheel', (e) => { if (screen === 'play') { G.p.sel = (G.p.sel + (e.deltaY > 0 ? 1 : 7)) % 8; hotbarDirty = true; } }, { passive: true });

  // ───── barra de itens ─────
  let hotbarDirty = true, mapDirty = true, lastSelKey = '', nmT = 0;
  const HAND = -1;
  function slotEl(s, cls) {
    const el = document.createElement('div');
    el.className = 'it' + (cls ? ' ' + cls : '');
    if (s) el.innerHTML = '<img src="' + icon(s.id) + '">' + (s.n > 1 ? '<span>' + s.n + '</span>' : '');
    return el;
  }
  function renderHotbar() {
    const hb = $('#hotbar');
    hb.innerHTML = '';
    for (let i = 0; i < 8; i++) {
      const el = slotEl(G.p.inv[i], i === G.p.sel ? 'sel' : '');
      el.insertAdjacentHTML('beforeend', '<em>' + (i + 1) + '</em>');
      el.onpointerdown = (e) => { e.stopPropagation(); G.p.sel = i; hotbarDirty = true; sfx('pop'); };
      hb.appendChild(el);
    }
    const s = G.p.inv[G.p.sel];
    $('#useIcon').src = icon(s ? s.id : HAND);
    const key = s ? s.id + ':' + G.p.sel : 'x' + G.p.sel;
    if (key !== lastSelKey) {
      lastSelKey = key;
      const nm = $('#itemName');
      nm.textContent = s ? CB.itemName(s.id) : 'Mão';
      nm.classList.add('show');
      clearTimeout(nmT); nmT = setTimeout(() => nm.classList.remove('show'), 1600);
    }
    hotbarDirty = false;
  }

  // ───── mochila e criação ─────
  let bagPick = -1, stationsNear = new Set();
  function scanStations() {
    stationsNear = new Set();
    const p = G.p, w = G.world;
    for (let y = -3; y <= 3; y++) for (let z = -4; z <= 4; z++) for (let x = -4; x <= 4; x++) {
      const id = w.get(Math.floor(p.x) + x, Math.floor(p.y) + y, Math.floor(p.z) + z);
      if (id === B.BENCH || id === B.FURNACE) stationsNear.add(id);
    }
  }
  function openBag() { if (screen !== 'play') return; screen = 'bag'; $('#bag').hidden = false; bagPick = -1; inp.use = inp.jump = false; scanStations(); renderBag(); sfx('pop'); }
  function closeBag() { screen = 'play'; $('#bag').hidden = true; hotbarDirty = true; }
  $('#btBag').onclick = openBag;
  $('#bagClose').onclick = closeBag;
  function renderBag() {
    const grid = $('#grid'), inv = G.p.inv;
    grid.innerHTML = '';
    inv.forEach((s, i) => {
      const el = slotEl(s, (i === bagPick ? 'pick' : '') + (i === G.p.sel ? ' sel' : ''));
      el.onclick = () => {
        if (bagPick < 0) { if (s) { bagPick = i; sfx('pop'); } }
        else { const t = inv[i]; inv[i] = inv[bagPick]; inv[bagPick] = t; bagPick = -1; sfx('place'); hotbarDirty = true; }
        renderBag();
      };
      grid.appendChild(el);
    });
    const ps = bagPick >= 0 ? inv[bagPick] : inv[G.p.sel];
    $('#bagInfo').textContent = ps ? CB.itemName(ps.id) + (ps.n > 1 ? ' ×' + ps.n : '') + (bagPick >= 0 ? ' — toque onde quer colocar' : '') : '';
    const st = [...stationsNear].map((id) => D[id].name);
    $('#stations').textContent = st.length ? 'perto de: ' + st.join(', ') : 'fique perto de uma Bancada ou Fornalha pra ver mais';
    const box = $('#recipes');
    box.innerHTML = '';
    const rows = CB.RECIPES.map((r, k) => {
      const hasSt = !r.st || stationsNear.has(r.st), hasAll = r.inp.every(([id, n]) => count(id) >= n);
      return { r, k, ok: hasSt && hasAll, hasSt };
    }).sort((a, b) => (b.ok - a.ok) || (b.hasSt - a.hasSt) || a.k - b.k);
    for (const { r, ok, hasSt } of rows) {
      const el = document.createElement('div');
      el.className = 'rc ' + (ok ? 'ok' : 'no');
      const ing = r.inp.map(([id, n]) => { const have = count(id); return (have >= n ? '' : '<i>') + n + '× ' + CB.itemName(id) + (have >= n ? '' : '</i>'); }).join(' + ');
      el.innerHTML = '<img src="' + icon(r.out[0]) + '"><div class="nm"><b>' + CB.itemName(r.out[0]) + (r.out[1] > 1 ? ' ×' + r.out[1] : '') + '</b><small>' + ing +
        (r.st ? ' · ' + (hasSt ? '' : '<i>') + 'precisa de ' + D[r.st].name + (hasSt ? '' : '</i>') : '') + '</small></div>';
      const b = document.createElement('button');
      b.textContent = 'Criar';
      b.disabled = !ok;
      b.onclick = () => {
        r.inp.forEach(([id, n]) => take(id, n));
        const left = addItem(r.out[0], r.out[1]);
        if (left) dropItem(r.out[0], left, G.p.x, G.p.y + 1, G.p.z);
        sfx('craft');
        renderBag();
      };
      el.appendChild(b);
      box.appendChild(el);
    }
  }

  // ───── inimigos ─────
  const MOB = {
    slime: { name: 'Geleca', w: 0.82, h: 1.45, hp: 26, dmg: 9, drop: [[I.GEL, 1, 3, 1]] },
    bat: { name: 'Morcego', w: 0.6, h: 0.9, hp: 18, dmg: 10, fly: true, drop: [[I.GEL, 1, 1, 0.3]] },
    wisp: { name: 'Assombro', w: 0.7, h: 1.4, hp: 44, dmg: 15, ghost: true, drop: [[B.CRYSTAL, 1, 2, 0.5], [I.FRUIT, 1, 1, 0.3]] },
    golem: { name: 'Golem de musgo', w: 1.05, h: 3.7, hp: 90, dmg: 20, drop: [[I.BAR_IRON, 1, 3, 0.7], [B.RUBY, 1, 1, 0.25]] },
  };
  const SLIMECOL = [[0.35, 0.85, 0.5], [0.35, 0.65, 1], [1, 0.45, 0.7], [0.8, 0.5, 1]];
  function spawnMob(type, x, y, z) {
    const T = MOB[type], hp = T.hp * (1 + G.day * 0.08);
    G.mobs.push({ type, x, y, z, vx: 0, vy: 0, vz: 0, w: T.w, h: T.h, hp, max: hp, t: Math.random() * 2, flash: 0, yaw: 0, col: SLIMECOL[Math.floor(Math.random() * 4)], onGround: false, anim: Math.random() * 6 });
  }
  function trySpawn() {
    const w = G.world, p = G.p, night = G.daylight < 0.3;
    const cap = night ? 10 : 6;
    if (G.mobs.length >= cap) return;
    const a = Math.random() * 6.283, r = 30 + Math.random() * 26;
    const x = Math.floor(p.x + Math.cos(a) * r), z = Math.floor(p.z + Math.sin(a) * r);
    if (!w.inside(x, 1, z)) return;
    const top = w.hm[z * w.W + x], under = p.y < w.hm[Math.floor(p.z) * w.W + Math.floor(p.x)] - 6;
    if (!under) {
      const y = top + 1, ground = w.get(x, top, z);
      if (D[ground].kind === 'liquid' || D[ground].leafy) return;
      if (night) spawnMob(Math.random() < 0.45 ? 'wisp' : Math.random() < 0.3 ? 'golem' : 'slime', x + 0.5, y + (Math.random() < 0.45 ? 5 : 0), z + 0.5);
      else if (Math.random() < 0.5) spawnMob('slime', x + 0.5, y, z + 0.5);
    } else {
      for (let k = 0; k < 8; k++) {
        const y = Math.floor(p.y) + Math.floor(Math.random() * 24) - 12;
        if (y < 2 || w.get(x, y, z) !== B.AIR || w.get(x, y + 1, z) !== B.AIR || w.get(x, y + 2, z) !== B.AIR || w.get(x + 1, y, z) !== B.AIR || !w.solid(x, y - 1, z)) continue;
        if (w.light(x, y, z)[0] > 7) continue;
        const r2 = Math.random();
        spawnMob(r2 < 0.45 ? 'bat' : r2 < 0.85 || w.get(x, y + 3, z) !== B.AIR ? 'slime' : 'golem', x + 0.5, y + (r2 < 0.45 ? 1.5 : 0), z + 0.5);
        break;
      }
    }
  }
  function hurtMob(m, dmg, dir) {
    m.hp -= dmg; m.flash = 0.15;
    const kb = m.type === 'golem' ? 5 : 12;
    m.vx += dir[0] * kb; m.vz += dir[2] * kb; m.vy = Math.max(m.vy, m.type === 'golem' ? 4 : 9);
    popText(m.x, m.y + m.h + 0.3, m.z, String(Math.round(dmg)), '#ffe066');
    sfx('hit');
    if (m.hp <= 0) {
      m.dead = true;
      G.kills++;
      const col = m.type === 'slime' ? m.col : m.type === 'wisp' ? [0.75, 0.45, 1] : m.type === 'golem' ? [0.35, 0.6, 0.35] : [0.45, 0.35, 0.5];
      burst(m.x, m.y + m.h / 2, m.z, [col, col.map((v) => v * 0.7)], 22, 7, m.type === 'wisp' ? 1 : 0);
      for (const [id, a, b, ch] of MOB[m.type].drop) if (Math.random() < ch) dropItem(id, a + Math.floor(Math.random() * (b - a + 1)), m.x, m.y + 1, m.z);
      sfx('pop');
    }
  }
  function hurtPlayer(dmg, from) {
    const p = G.p;
    if (p.invul > 0 || p.dead) return;
    p.hp -= dmg; p.invul = 0.7; p.calm = 0; G.hurtFx = 1;
    if (from) { const dx = p.x - from.x, dz = p.z - from.z, l = Math.hypot(dx, dz) || 1; p.vx += (dx / l) * 14; p.vz += (dz / l) * 14; p.vy = Math.max(p.vy, 10); }
    popText(p.x, p.y + 4, p.z, '-' + Math.round(dmg), '#ff5d8f');
    sfx('hurt');
    if (p.hp <= 0) { p.hp = 0; p.dead = 4; sfx('die'); $('#dead').hidden = false; }
  }
  function updateMobs(dt) {
    const w = G.world, p = G.p;
    for (const m of G.mobs) {
      const T = MOB[m.type], dx = p.x - m.x, dz = p.z - m.z, dy = p.y + 1.7 - (m.y + m.h / 2), dist = Math.hypot(dx, dz);
      m.t -= dt; m.anim += dt; m.flash = Math.max(0, m.flash - dt);
      if (dist > 0.1) m.yaw = lerp(m.yaw, Math.atan2(dx, dz), Math.min(1, dt * 6));
      const chase = !p.dead && dist < 44;
      if (m.type === 'slime' || m.type === 'golem') {
        m.vy -= 50 * dt;
        if (m.onGround) {
          m.vx *= 0.8; m.vz *= 0.8;
          if (m.type === 'slime' && m.t <= 0) {
            m.t = 0.8 + Math.random() * 1.2;
            const a = chase ? Math.atan2(dz, dx) : Math.random() * 6.283, sp = chase ? 7.5 : 3.5;
            m.vx = Math.cos(a) * sp; m.vz = Math.sin(a) * sp; m.vy = 13 + Math.random() * 5;
          } else if (m.type === 'golem' && chase) {
            m.vx = (dx / dist) * 4.6; m.vz = (dz / dist) * 4.6;
            if (m.hitWall && m.t <= 0) { m.vy = 17; m.t = 0.6; }
          }
        }
        physics(w, m, dt);
      } else if (m.type === 'bat') {
        const tx = chase ? dx : Math.cos(m.anim) * 3, tz = chase ? dz : Math.sin(m.anim) * 3, ty = chase ? dy + Math.sin(m.anim * 3) * 2 : Math.sin(m.anim * 2);
        const l = Math.hypot(tx, ty, tz) || 1;
        m.vx = lerp(m.vx, (tx / l) * 8.5, dt * 2); m.vy = lerp(m.vy, (ty / l) * 8.5, dt * 2); m.vz = lerp(m.vz, (tz / l) * 8.5, dt * 2);
        physics(w, m, dt);
      } else {
        const l = Math.hypot(dx, dy, dz) || 1, sp = chase ? 5 : 1.5;
        m.vx = lerp(m.vx, (dx / l) * sp, dt * 1.5); m.vy = lerp(m.vy, (dy / l) * sp + Math.sin(m.anim * 2) * 0.6, dt * 1.5); m.vz = lerp(m.vz, (dz / l) * sp, dt * 1.5);
        m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt;
        if (G.daylight > 0.6) m.hp -= dt * 20;
        if (m.hp <= 0) m.dead = true;
      }
      if (m.y < -5) m.dead = true;
      if (Math.hypot(dx, dz) > 100) m.dead = true;
      // encostou no jogador
      if (!m.dead && Math.abs(dx) < p.w + m.w && Math.abs(dz) < p.w + m.w && p.y < m.y + m.h && p.y + p.h > m.y) hurtPlayer(T.dmg, m);
      // lava machuca
      if (w.get(Math.floor(m.x), Math.floor(m.y + 0.2), Math.floor(m.z)) === B.LAVA && m.type !== 'wisp') { m.hp -= 40 * dt; if (m.hp <= 0) m.dead = true; }
    }
    G.mobs = G.mobs.filter((m) => !m.dead);
  }

  // ───── ações do botão Usar ─────
  function swingAttack(dmg) {
    const p = G.p;
    if (p.swing > 0) return;
    p.swing = 0.34; p.swingDmg = dmg; p.swingHit = false;
    sfx('swing');
  }
  function doSwingHit() {
    const p = G.p, f = [Math.sin(G.cam.yaw), 0, Math.cos(G.cam.yaw)];
    p.yaw = G.cam.yaw;
    for (const m of G.mobs) {
      const dx = m.x - p.x, dz = m.z - p.z, dy = m.y + m.h / 2 - (p.y + 1.8);
      const d = Math.hypot(dx, dz);
      if (d > 4.6 + m.w || Math.abs(dy) > 4) continue;
      if (d > 0.6 && (dx * f[0] + dz * f[2]) / d < 0.25) continue;
      const crit = Math.random() < 0.08;
      hurtMob(m, p.swingDmg * (crit ? 2 : 1) * (0.9 + Math.random() * 0.2), [dx / (d || 1), 0, dz / (d || 1)]);
    }
  }
  let digNoise = 0, needToast = 0;
  function useItem(dt) {
    const p = G.p, s = p.inv[p.sel], tgt = G.target;
    const it = s && s.id >= 100 ? IT[s.id] : null;
    if (it && it.tool === 'sword') { swingAttack(it.dmg); p.mine = null; return; }
    if (s && s.id >= 100 && it.heal) {
      if (useTap && p.hp < p.maxHp) { p.hp = Math.min(p.maxHp, p.hp + it.heal); take(s.id, 1); sfx('heal'); popText(p.x, p.y + 4, p.z, '+' + it.heal, '#3ddc97'); }
      return;
    }
    if (s && s.id < 100 && (D[s.id].use === 'heart' || D[s.id].heal)) {
      if (!useTap) return;
      if (D[s.id].use === 'heart') {
        if (p.maxHp >= 300) { toast('Sua vida já está no máximo'); return; }
        p.maxHp += 20; p.hp = Math.min(p.maxHp, p.hp + 20); take(s.id, 1); sfx('heal'); toast('Vida máxima: ' + p.maxHp);
      } else if (p.hp < p.maxHp) { p.hp = Math.min(p.maxHp, p.hp + D[s.id].heal); take(s.id, 1); sfx('heal'); popText(p.x, p.y + 4, p.z, '+' + D[s.id].heal, '#3ddc97'); }
      return;
    }
    // inimigo bem na frente: bate com o que estiver na mão
    const f = [Math.sin(G.cam.yaw), 0, Math.cos(G.cam.yaw)];
    const near = G.mobs.some((m) => { const dx = m.x - p.x, dz = m.z - p.z, d = Math.hypot(dx, dz); return d < 3.6 + m.w && Math.abs(m.y - p.y) < 3.5 && (d < 1 || (dx * f[0] + dz * f[2]) / d > 0.4); });
    if (near && useTap) { swingAttack(it && it.tool === 'pick' ? 6 + it.power * 2 : 3); return; }
    if (s && s.id < 100) {
      // colocar bloco
      if (!tgt || p.useCd > 0) return;
      const x = tgt.x + tgt.n[0], y = tgt.y + tgt.n[1], z = tgt.z + tgt.n[2];
      if (PLANTS.has(tgt.id) && D[s.id].solid) { if (canPlace(tgt.x, tgt.y, tgt.z, s.id)) placeAt(tgt.x, tgt.y, tgt.z, s); return; }
      if (canPlace(x, y, z, s.id)) placeAt(x, y, z, s);
      return;
    }
    // minerar
    if (!tgt) { p.mine = null; return; }
    const d = D[tgt.id], power = it && it.tool === 'pick' ? it.power : 0.55;
    if (d.hard >= 1e8) return;
    if (power < d.need) {
      if (needToast <= 0) { toast(d.need > 2 ? 'Precisa de uma picareta de ferro ou melhor' : d.need > 1 ? 'Precisa de uma picareta de cobre ou melhor' : 'Precisa de uma picareta'); needToast = 2; }
      return;
    }
    if (!p.mine || p.mine.x !== tgt.x || p.mine.y !== tgt.y || p.mine.z !== tgt.z) p.mine = { x: tgt.x, y: tgt.y, z: tgt.z, k: 0 };
    p.mine.k += (dt * power * 1.6) / Math.max(0.05, d.hard);
    p.swingVis = (p.swingVis || 0) + dt;
    digNoise -= dt;
    if (digNoise <= 0) { digNoise = 0.22; sfx('dig'); burst(tgt.x + 0.5 + tgt.n[0] * 0.5, tgt.y + 0.5 + tgt.n[1] * 0.5, tgt.z + 0.5 + tgt.n[2] * 0.5, blockCols(tgt.id), 3, 2.5); }
    if (p.mine.k >= 1) {
      p.mine = null; mapDirty = true;
      if (!(it && it.tool === 'pick')) { breakAt(tgt.x, tgt.y, tgt.z); return; }
      // a picareta tira um bloco 2x2x2: cresce pro lado da mira e pra dentro da parede
      const hp = [G.eye[0] + G.fwd[0] * tgt.t, G.eye[1] + G.fwd[1] * tgt.t, G.eye[2] + G.fwd[2] * tgt.t];
      const base = [tgt.x, tgt.y, tgt.z], dir = [0, 1, 2].map((a) => (tgt.n[a] ? -tgt.n[a] : hp[a] - base[a] > 0.5 ? 1 : -1));
      const cells = [];
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) cells.push([base[0] + a * dir[0], base[1] + b * dir[1], base[2] + c * dir[2]]);
      const drops = {};
      for (const [x, y, z] of cells) {
        const id = G.world.get(x, y, z), dd = D[id];
        if (!id || dd.kind === 'liquid' || dd.hard >= 1e8 || dd.need > power || dd.hard > d.hard * 1.6 + 0.3) continue;
        if ((x !== base[0] || y !== base[1] || z !== base[2]) && (id === B.LOG || id === B.PALE)) continue;
        if (id === B.LOG || id === B.PALE || dd.kind === 'sprite') { breakAt(x, y, z); continue; }
        G.world.set(x, y, z, B.AIR, true);
        if (dd.drop) drops[dd.drop] = (drops[dd.drop] || 0) + 1;
        if (dd.leafy && Math.random() < 0.02) drops[I.FRUIT] = (drops[I.FRUIT] || 0) + 1;
        const up = G.world.get(x, y + 1, z);
        if (PLANTS.has(up) || up === B.HEART || up === B.TORCH) { G.world.set(x, y + 1, z, B.AIR, true); if (up !== B.TGRASS && D[up].drop) drops[up] = (drops[up] || 0) + 1; }
      }
      G.world.relight(base[0] - 16, base[1] - 16, base[2] - 16, base[0] + 17, base[1] + 17, base[2] + 17);
      for (const id in drops) dropItem(+id, drops[id], base[0] + 0.5 + dir[0] * 0.5, base[1] + 0.5 + dir[1] * 0.5, base[2] + 0.5 + dir[2] * 0.5);
      burst(base[0] + 0.5 + dir[0] * 0.5, base[1] + 0.5 + dir[1] * 0.5, base[2] + 0.5 + dir[2] * 0.5, blockCols(tgt.id), 16, 5);
      sfx('brk');
    }
  }
  function placeAt(x, y, z, s) {
    G.world.set(x, y, z, s.id);
    take(s.id, 1);
    G.p.useCd = 0.11;
    sfx('place');
    mapDirty = true;
  }

  // ───── atualização ─────
  function update(dt) {
    const w = G.world, p = G.p, cam = G.cam;
    G.time += dt;
    const ph = (G.time / DAY) % 1, sa = ph * 6.283;
    G.daylight = sstep(-0.12, 0.22, Math.sin(sa));
    G.day = Math.floor(G.time / DAY);
    // jogador
    if (p.dead > 0) {
      p.dead -= dt;
      $('#deadT').textContent = 'Voltando em ' + Math.ceil(p.dead) + '…';
      if (p.dead <= 0) {
        p.dead = 0; p.hp = p.maxHp; p.x = w.spawn[0]; p.y = w.spawn[1]; p.z = w.spawn[2]; p.vx = p.vy = p.vz = 0;
        while (overlaps(w, p)) p.y += 1;
        $('#dead').hidden = true;
      }
    } else {
      let jx = inp.jx, jy = inp.jy;
      const K = inp.keys;
      if (K.KeyA || K.ArrowLeft) jx -= 1; if (K.KeyD || K.ArrowRight) jx += 1;
      if (K.KeyW || K.ArrowUp) jy += 1; if (K.KeyS || K.ArrowDown) jy -= 1;
      const jl = Math.hypot(jx, jy);
      if (jl > 1) { jx /= jl; jy /= jl; }
      const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw), rx = -fz, rz = fx;
      const wx = rx * jx + fx * jy, wz = rz * jx + fz * jy, wl = Math.hypot(wx, wz);
      const feet = w.get(Math.floor(p.x), Math.floor(p.y + 0.4), Math.floor(p.z)), chest = w.get(Math.floor(p.x), Math.floor(p.y + 2.2), Math.floor(p.z));
      p.inWater = feet === B.WATER || chest === B.WATER;
      const speed = p.inWater ? 6 : 10.5, acc = p.onGround ? 14 : 5;
      p.vx = lerp(p.vx, wx * speed, Math.min(1, dt * acc));
      p.vz = lerp(p.vz, wz * speed, Math.min(1, dt * acc));
      if (wl > 0.15) { let d = Math.atan2(wx, wz) - p.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); p.yaw += d * Math.min(1, dt * 12); p.walk += dt * wl * 9; }
      if (p.inWater) {
        p.vy -= 16 * dt; p.vy *= Math.pow(0.15, dt);
        if (inp.jump) p.vy = Math.min(p.vy + 42 * dt, 8);
      } else {
        p.vy -= 60 * dt;
        if (inp.jump && p.onGround) { p.vy = 23; sfx('jump'); }
      }
      // pulo automático em degraus de 1 bloco
      // degrau de 1 bloco: sobe sozinho; de 2: pulo automático
      if (p.onGround && wl > 0.2) {
        const ax = Math.floor(p.x + (wx / wl) * (p.w + 0.35)), az = Math.floor(p.z + (wz / wl) * (p.w + 0.35)), fy = Math.floor(p.y + 0.01);
        const free = (y0, y1) => { for (let y = y0; y <= y1; y++) if (w.solid(ax, y, az)) return false; return true; };
        if (w.solid(ax, fy, az) && free(fy + 1, fy + 4) && p.y - fy < 0.3) {
          const oy = p.y; p.y = fy + 1.001;
          if (overlaps(w, p)) p.y = oy; else G.stepT = 0.12;
        } else if (cfg.autojump && w.solid(ax, fy, az) && w.solid(ax, fy + 1, az) && free(fy + 2, fy + 5) && !p.inWater) p.vy = 21;
      }
      p.vy = Math.max(p.vy, -70);
      physics(w, p, dt);
      if (p.onGround && p.lastVy < -44 && !p.inWater) hurtPlayer(Math.round((-p.lastVy - 44) * 2.5), null);
      p.lastVy = 0;
      if (feet === B.LAVA || chest === B.LAVA) { hurtPlayer(25, null); p.vy = Math.max(p.vy, 14); }
      if (p.y < -10) { p.hp = 0; hurtPlayer(1, null); }
      p.invul = Math.max(0, p.invul - dt);
      p.calm += dt;
      if (p.calm > 4 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + dt * (p.calm > 10 ? 4 : 1.5));
      p.useCd = Math.max(0, p.useCd - dt);
      needToast -= dt;
      if (p.swing > 0) {
        p.swing -= dt;
        if (!p.swingHit && p.swing < 0.2) { p.swingHit = true; doSwingHit(); }
      }
    }
    // câmera atrás do personagem, com colisão
    const cp = Math.cos(cam.pitch), f = [Math.sin(cam.yaw) * cp, -Math.sin(cam.pitch), Math.cos(cam.yaw) * cp];
    const right = [-Math.cos(cam.yaw), 0, Math.sin(cam.yaw)];
    G.camY = G.camY == null ? p.y : lerp(G.camY, p.y, Math.min(1, dt * 14));
    const head = [p.x + right[0] * 1.0, G.camY + 3.1, p.z + right[2] * 1.0];
    if (!cfg.tp) {
      G.eye = [p.x, G.camY + 3.05, p.z];
      G.fwd = f; cam.cur = 0;
      if (Math.hypot(p.vx, p.vz) > 0.3 || p.swing > 0 || p.mine) p.yaw = cam.yaw;
    }
    let dist = cfg.tp ? cam.dist : 0;
    for (let t = 0.5; cfg.tp && t < cam.dist; t += 0.15) {
      const q = [head[0] - f[0] * t, head[1] - f[1] * t, head[2] - f[2] * t];
      const id = w.get(Math.floor(q[0]), Math.floor(q[1]), Math.floor(q[2]));
      if (CB.OPQ[id] || (id && D[id].solid && !D[id].leafy)) { dist = Math.max(0.6, t - 0.4); break; }
    }
    if (cfg.tp) {
      cam.cur = cam.cur == null || cam.cur < 0.5 ? dist : dist < cam.cur ? dist : lerp(cam.cur, dist, Math.min(1, dt * 4));
      G.eye = [head[0] - f[0] * cam.cur, head[1] - f[1] * cam.cur, head[2] - f[2] * cam.cur];
      G.fwd = f;
    }
    // mira: raio da câmera; o alvo tem que estar ao alcance do personagem
    const hit = raycast(G.eye, f, cam.cur + REACH + 1);
    G.target = null;
    if (hit) {
      const hx = hit.x + 0.5 - p.x, hy = hit.y + 0.5 - (p.y + 2.6), hz = hit.z + 0.5 - p.z;
      if (Math.hypot(hx, hy, hz) <= REACH + 0.5) G.target = hit;
    }
    if (inp.use && p.dead <= 0) useItem(dt);
    else { p.mine = null; p.swingVis = 0; }
    useTap = false;
    if (!inp.use && !inp.keys.KeyF) p.mine = null;
    // inimigos, itens, partículas
    G.spawnT -= dt;
    if (G.spawnT <= 0) { G.spawnT = 1.4; trySpawn(); }
    updateMobs(dt);
    for (const d of G.drops) {
      d.age += dt;
      const dx = p.x - d.x, dy = p.y + 1.6 - d.y, dz = p.z - d.z, l = Math.hypot(dx, dy, dz);
      if (l < 6 && d.age > 0.4 && !p.dead) {
        d.vx = lerp(d.vx, (dx / l) * 16, dt * 6); d.vy = lerp(d.vy, (dy / l) * 16, dt * 6); d.vz = lerp(d.vz, (dz / l) * 16, dt * 6);
        d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
        if (l < 1.7) {
          const left = addItem(d.id, d.n);
          if (left < d.n) { sfx('pick'); popText(p.x, p.y + 4, p.z, '+' + (d.n - left) + ' ' + CB.itemName(d.id), '#fff7e6'); }
          d.n = left;
          if (!left) d.gone = true;
        }
      } else { d.vy -= 40 * dt; d.vx *= 0.96; d.vz *= 0.96; physics(w, d, dt); }
      if (d.age > 300) d.gone = true;
    }
    G.drops = G.drops.filter((d) => !d.gone);
    for (const q of G.parts) { q.life -= dt; q.vy -= 26 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; if (w.solid(Math.floor(q.x), Math.floor(q.y), Math.floor(q.z))) { q.vy = Math.abs(q.vy) * 0.3; q.vx *= 0.5; q.vz *= 0.5; } }
    G.parts = G.parts.filter((q) => q.life > 0);
    if (G.parts.length > 400) G.parts.splice(0, G.parts.length - 400);
    for (const t of G.texts) { t.life -= dt; t.y += dt * 0.9; }
    G.texts = G.texts.filter((t) => t.life > 0);
    G.hurtFx = Math.max(0, (G.hurtFx || 0) - dt * 2.5);
    // água escorrendo
    G.flowT -= dt;
    if (G.flowT <= 0) { G.flowT = 0.25; if (w.flow.length) { w.stepFlow(48); mapDirty = true; } }
    // ambiente
    G.env = envAt(ph);
    G.saveT -= dt;
    if (G.saveT <= 0) { G.saveT = 45; save(); }
    G.mapT -= dt;
    if (G.mapT <= 0) { G.mapT = 0.4; drawMap(); }
  }
  // cores do céu e da luz conforme a hora (e se a câmera está debaixo da terra ou da água)
  function envAt(ph) {
    const w = G.world, sa = ph * 6.283, s = Math.sin(sa), d = G.daylight;
    const warm = Math.exp(-Math.pow(s / 0.2, 2)) * (Math.cos(sa) > -2 ? 1 : 0);
    const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
    let skyCol = mix([0.16, 0.2, 0.42], [1.0, 0.96, 0.86], d);
    skyCol = mix(skyCol, [1.0, 0.62, 0.42], warm * 0.55);
    const zen = mix([0.02, 0.025, 0.1], [0.12, 0.42, 1.0], d);
    let hor = mix([0.07, 0.08, 0.2], [0.6, 0.84, 1.0], d);
    hor = mix(hor, [1.0, 0.56, 0.36], warm * 0.75);
    const sunDir = [Math.cos(sa), s, 0.35];
    const sl = Math.hypot(...sunDir); sunDir[0] /= sl; sunDir[1] /= sl; sunDir[2] /= sl;
    const sunCol = mix([0, 0, 0], [1.0, 0.86, 0.6], sstep(-0.1, 0.1, s)).map((v, i) => v * (1 + warm * [0.3, -0.1, -0.4][i]));
    // quanto a câmera está "no escuro" (caverna)
    const e = G.eye || [G.p.x, G.p.y + 1.6, G.p.z];
    const L = w.light(Math.floor(e[0]), Math.floor(e[1]), Math.floor(e[2]));
    const tgtDepth = 1 - sstep(4, 12, L[0]);
    G.depth = lerp(G.depth == null ? tgtDepth : G.depth, tgtDepth, 0.05);
    const cave = [0.02, 0.018, 0.05];
    const inWater = w.get(Math.floor(e[0]), Math.floor(e[1]), Math.floor(e[2])) === B.WATER;
    const VD = gfx.viewDist;
    let fogCol = mix(hor, cave, G.depth), fog = [lerp(VD * 0.45, 10, G.depth), lerp(VD, 46, G.depth)];
    if (inWater) { fogCol = [0.05, 0.25, 0.45].map((v) => v * (0.3 + 0.7 * d)); fog = [1, 22]; }
    const up = sunDir[1] > -0.02, lightDir = up ? sunDir : sunDir.map((v) => -v);
    const dirK = up ? 0.95 * sstep(-0.02, 0.18, sunDir[1]) : 0.3 * sstep(0.02, 0.2, -sunDir[1]);
    return { skyCol, zen, hor, sunDir, sunCol, stars: 1 - sstep(0, 0.45, d), fogCol, fog, depth: G.depth, cave, water: inWater ? 0.5 : 0,
      lightDir, dirK, focus: [G.p.x, G.p.y + 2, G.p.z], ink: [0.05, 0.04, 0.12] };
  }

  // ───── desenho das entidades ─────
  const SKIN = [1, 0.8, 0.62], SHIRT = [0.32, 0.62, 0.98], PANTS = [0.26, 0.24, 0.48], HAIR = [0.4, 0.22, 0.14], SHOE = [0.25, 0.17, 0.12], INKC = [0.1, 0.08, 0.2];
  function heldModel(m, s, arm, swingA) {
    if (!s) return;
    const limb = { p: [0.34, 1.28, 0], ax: arm };
    if (s.id < 100) { batch.box(m, 0.34, 0.68, 0.18, 0.11, 0.11, 0.11, itemCol(s.id), D[s.id].light ? 0.6 : 0, limb); return; }
    const it = IT[s.id], c = it.c.map((v) => v / 255), wood = [0.6, 0.42, 0.25], e = it.glow ? 0.7 : 0;
    if (it.tool === 'sword') {
      batch.box(m, 0.34, 0.74, 0.12, 0.035, 0.035, 0.12, wood, 0, limb);
      batch.box(m, 0.34, 0.74, 0.24, 0.12, 0.035, 0.03, [0.3, 0.25, 0.2], 0, limb);
      batch.box(m, 0.34, 0.74, 0.62, 0.05, 0.03, 0.36, c, e, limb);
    } else if (it.tool === 'pick') {
      batch.box(m, 0.34, 0.74, 0.28, 0.035, 0.035, 0.3, wood, 0, limb);
      batch.box(m, 0.34, 0.74, 0.55, 0.05, 0.28, 0.05, c, e, limb);
    } else batch.box(m, 0.34, 0.68, 0.18, 0.1, 0.06, 0.1, c, 0, limb);
  }
  const EYEW = [0.97, 0.97, 1], IRIS = [0.25, 0.55, 0.95], BROW = [0.3, 0.16, 0.1], MOUTH = [0.65, 0.3, 0.3], BELT = [0.45, 0.3, 0.15], BUCK = [1, 0.85, 0.3];
  function drawPlayer() {
    const p = G.p;
    if (p.dead > 0 || G.cam.cur < 1.6) return;
    if (p.invul > 0 && Math.floor(p.invul * 14) % 2) return;
    const m = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, lit: litAt(p.x, p.y + 2, p.z), scale: PS };
    const moving = Math.hypot(p.vx, p.vz) > 1 && p.onGround, sw = moving ? Math.sin(p.walk * 0.55) * 0.75 : 0;
    const air = !p.onGround && !p.inWater ? 0.5 : 0, bob = moving ? Math.abs(Math.sin(p.walk * 0.55)) * 0.03 : 0;
    // pernas e botas
    for (const [sx, a] of [[-0.11, sw + air], [0.11, -sw - air * 0.4]]) {
      const L = { p: [sx, 0.72, 0], ax: a };
      batch.box(m, sx, 0.42, 0, 0.1, 0.3, 0.11, PANTS, 0, L);
      batch.box(m, sx, 0.08, 0.025, 0.11, 0.08, 0.14, SHOE, 0, L);
    }
    const by = bob;
    // tronco: camisa, gola, cinto
    batch.box(m, 0, 1.0 + by, 0, 0.24, 0.3, 0.14, SHIRT);
    batch.box(m, 0, 1.24 + by, 0.141, 0.1, 0.05, 0.005, SKIN);
    batch.box(m, 0, 0.75 + by, 0, 0.25, 0.045, 0.15, BELT);
    batch.box(m, 0, 0.75 + by, 0.152, 0.045, 0.035, 0.005, BUCK, 0.2);
    // cabeça com rosto
    const hy = 1.52 + by;
    batch.box(m, 0, hy, 0, 0.24, 0.24, 0.24, SKIN);
    batch.box(m, 0, hy + 0.21, -0.01, 0.26, 0.07, 0.26, HAIR);
    batch.box(m, 0, hy + 0.06, -0.21, 0.26, 0.2, 0.06, HAIR);
    batch.box(m, -0.255, hy + 0.06, -0.05, 0.02, 0.18, 0.2, HAIR);
    batch.box(m, 0.255, hy + 0.06, -0.05, 0.02, 0.18, 0.2, HAIR);
    batch.box(m, -0.12, hy + 0.16, 0.245, 0.11, 0.035, 0.012, HAIR);
    batch.box(m, 0.09, hy + 0.17, 0.245, 0.08, 0.03, 0.012, HAIR);
    for (const sx of [-0.095, 0.095]) {
      batch.box(m, sx, hy + 0.0, 0.244, 0.055, 0.06, 0.006, EYEW);
      batch.box(m, sx + 0.012, hy - 0.005, 0.25, 0.032, 0.045, 0.006, IRIS);
      batch.box(m, sx + 0.016, hy - 0.01, 0.255, 0.016, 0.022, 0.004, INKC);
      batch.box(m, sx, hy + 0.09, 0.246, 0.055, 0.014, 0.006, BROW);
    }
    batch.box(m, 0, hy - 0.13, 0.245, 0.05, 0.014, 0.006, MOUTH);
    // braços (o direito balança quando bate ou cava)
    let arm = -sw * 0.8;
    if (p.swing > 0) { const k = 1 - p.swing / 0.34; arm = -2.4 + k * 3.2; }
    else if (p.mine) arm = -1.2 - Math.abs(Math.sin(G.time * 14)) * 1.0;
    else if (p.inv[p.sel]) arm = Math.min(arm, -0.25);
    const LA = { p: [-0.34, 1.28 + by, 0], ax: sw * 0.8 }, RA = { p: [0.34, 1.28 + by, 0], ax: arm };
    batch.box(m, -0.34, 1.05 + by, 0, 0.09, 0.25, 0.09, SHIRT, 0, LA);
    batch.box(m, -0.34, 0.74 + by, 0, 0.08, 0.07, 0.08, SKIN, 0, LA);
    batch.box(m, 0.34, 1.05 + by, 0, 0.09, 0.25, 0.09, SHIRT, 0, RA);
    batch.box(m, 0.34, 0.74 + by, 0, 0.08, 0.07, 0.08, SKIN, 0, RA);
    heldModel(m, p.inv[p.sel], arm);
  }
  // nuvens fofas feitas de caixas (ganham contorno como o resto)
  function makeClouds(seed) {
    const out = [], H2 = CB.hash2;
    for (let k = 0; k < 46; k++) {
      const cx = -160 + H2(k, 1, seed) * (WSIZE + 320), cz = -160 + H2(k, 2, seed) * (WSIZE + 320), cy = 128 + H2(k, 3, seed) * 22;
      const parts = [], n = 4 + Math.floor(H2(k, 4, seed) * 6);
      for (let j = 0; j < n; j++) {
        const sx = 4 + H2(k, j * 4, seed + 1) * 7, sy = 2.5 + H2(k, j * 4 + 1, seed + 1) * 3.5, sz = 3 + H2(k, j * 4 + 2, seed + 1) * 6;
        parts.push([(H2(k, j * 4 + 3, seed + 1) - 0.5) * 22, sy * 0.6 + (j % 3) * 1.6 - 1, (H2(k, j * 5, seed + 2) - 0.5) * 14, sx, sy, sz]);
      }
      out.push({ x: cx, y: cy, z: cz, parts });
    }
    return out;
  }
  function drawClouds() {
    const env = G.env, d = G.daylight, span = WSIZE + 320;
    const warm = env.hor.map((v) => v * 0.4);
    const col = [0, 1, 2].map((i) => Math.min(1, 0.32 + 0.68 * d) * [0.98, 0.98, 1][i] + warm[i] * 0.25 * (1 - d));
    const lit = [1, 1, 1], drift = G.time * 1.2;
    for (const c of G.clouds) {
      const x = ((((c.x + drift + 160) % span) + span) % span) - 160;
      if (Math.hypot(x - G.eye[0], c.z - G.eye[2]) > 260) continue;
      const m = { x, y: c.y, z: c.z, yaw: 0, lit };
      for (const q of c.parts) {
        batch.box(m, q[0], q[1], q[2], q[3], q[4], q[5], col, 2.12);
        batch.box(m, q[0], q[1] - q[4] * 0.55, q[2], q[3] * 0.92, q[4] * 0.5, q[5] * 0.92, col.map((v) => v * 0.82), 2.06);
      }
    }
  }
  function drawMob(mb) {
    const lit = mb.flash > 0 ? [3, 3, 3] : litAt(mb.x, mb.y + mb.h / 2, mb.z);
    const m = { x: mb.x, y: mb.y, z: mb.z, yaw: mb.yaw, lit, scale: mb.type === 'golem' ? 1.95 : 2 };
    if (mb.type === 'slime') {
      const sq = mb.onGround ? 1 + Math.sin(mb.anim * 6) * 0.06 : 1 - clamp(mb.vy * 0.03, -0.15, 0.2);
      const hy = 0.36 * sq, hx = 0.42 / Math.sqrt(sq);
      batch.box(m, 0, hy, 0, hx, hy, hx, mb.col, 0.12);
      batch.box(m, 0, hy * 0.9, 0, hx * 0.6, hy * 0.55, hx * 0.6, mb.col.map((v) => v * 0.6), 0.2);
      batch.box(m, -0.14, hy * 1.25, hx, 0.06, 0.08, 0.01, INKC);
      batch.box(m, 0.14, hy * 1.25, hx, 0.06, 0.08, 0.01, INKC);
    } else if (mb.type === 'bat') {
      const fl = Math.sin(mb.anim * 18) * 0.8, c = [0.42, 0.3, 0.5];
      batch.box(m, 0, 0.22, 0, 0.14, 0.14, 0.14, c);
      batch.box(m, -0.3, 0.26, 0, 0.18, 0.03, 0.12, c.map((v) => v * 0.8), 0, { p: [-0.12, 0.26, 0], az: fl });
      batch.box(m, 0.3, 0.26, 0, 0.18, 0.03, 0.12, c.map((v) => v * 0.8), 0, { p: [0.12, 0.26, 0], az: -fl });
      batch.box(m, -0.06, 0.26, 0.14, 0.03, 0.03, 0.01, [1, 0.3, 0.3], 0.9);
      batch.box(m, 0.06, 0.26, 0.14, 0.03, 0.03, 0.01, [1, 0.3, 0.3], 0.9);
    } else if (mb.type === 'wisp') {
      const c = [0.75, 0.45, 1];
      batch.box(m, 0, 0.45, 0, 0.22, 0.22, 0.22, c, 0.85, null, mb.anim * 2);
      batch.box(m, 0, 0.45, 0, 0.12, 0.12, 0.12, [1, 0.95, 1], 1, null, -mb.anim * 3);
      for (let k = 0; k < 3; k++) batch.box(m, Math.sin(mb.anim * 3 + k * 2) * 0.35, 0.2 - k * 0.12, Math.cos(mb.anim * 3 + k * 2) * 0.35, 0.06, 0.06, 0.06, c, 0.9);
    } else {
      const sw = Math.sin(mb.anim * 5) * (Math.hypot(mb.vx, mb.vz) > 0.5 ? 0.5 : 0), st = [0.5, 0.52, 0.56], moss = [0.35, 0.62, 0.32];
      batch.box(m, -0.22, 0.4, 0, 0.17, 0.4, 0.18, st, 0, { p: [-0.22, 0.8, 0], ax: sw });
      batch.box(m, 0.22, 0.4, 0, 0.17, 0.4, 0.18, st, 0, { p: [0.22, 0.8, 0], ax: -sw });
      batch.box(m, 0, 1.2, 0, 0.42, 0.42, 0.28, st);
      batch.box(m, 0, 1.55, 0, 0.44, 0.1, 0.3, moss);
      batch.box(m, 0, 1.72, 0.04, 0.24, 0.18, 0.22, st);
      batch.box(m, -0.09, 1.74, 0.27, 0.05, 0.04, 0.01, [0.5, 1, 0.6], 1);
      batch.box(m, 0.09, 1.74, 0.27, 0.05, 0.04, 0.01, [0.5, 1, 0.6], 1);
      batch.box(m, -0.56, 1.0, 0, 0.13, 0.42, 0.14, st, 0, { p: [-0.56, 1.45, 0], ax: -sw });
      batch.box(m, 0.56, 1.0, 0, 0.13, 0.42, 0.14, st, 0, { p: [0.56, 1.45, 0], ax: sw });
    }
  }
  function drawViewModel() {
    vmb.reset();
    const p = G.p;
    if (cfg.tp || p.dead > 0) return;
    const e = G.eye, moving = Math.hypot(p.vx, p.vz) > 1 && p.onGround;
    const bob = moving ? Math.sin(p.walk * 0.55) : 0;
    const m = { x: e[0], y: e[1], z: e[2], yaw: G.cam.yaw, pitch: G.cam.pitch, lit: litAt(e[0], e[1] - 0.5, e[2]) };
    let ax = 0;
    if (p.swing > 0) { const k = 1 - p.swing / 0.34; ax = Math.sin(k * Math.PI) * 1.3; }
    else if (p.mine) ax = Math.abs(Math.sin(G.time * 14)) * 0.7;
    const ox = -0.34 + bob * 0.015, oy = -0.3 + Math.abs(bob) * 0.025;
    const L = { p: [ox, oy, 0.35], ax: -ax, az: bob * 0.04 };
    vmb.box(m, ox, oy, 0.55, 0.075, 0.075, 0.22, SHIRT, 0, L);
    vmb.box(m, ox, oy + 0.005, 0.8, 0.068, 0.068, 0.05, SKIN, 0, L);
    const s = p.inv[p.sel];
    if (!s) return;
    const hz = 0.82, hy = oy + 0.06;
    if (s.id === B.TORCH) {
      vmb.box(m, ox, hy + 0.08, hz, 0.014, 0.1, 0.014, [0.45, 0.3, 0.17], 0, L);
      vmb.box(m, ox, hy + 0.2, hz, 0.026, 0.03, 0.026, [1, 0.72, 0.3], 1, L);
      return;
    }
    if (s.id < 100) { vmb.box(m, ox + 0.02, hy + 0.04, hz + 0.02, 0.055, 0.055, 0.055, itemCol(s.id), D[s.id].light ? 0.6 : 0, L, 0.6); return; }
    const it = IT[s.id], c = it.c.map((v) => v / 255), wood = [0.45, 0.3, 0.17], em = it.glow ? 0.7 : 0;
    const T = { p: L.p, ax: L.ax - 0.35, az: L.az };
    if (it.tool === 'sword') {
      vmb.box(m, ox, hy + 0.02, hz, 0.018, 0.06, 0.018, wood, 0, T);
      vmb.box(m, ox, hy + 0.09, hz, 0.06, 0.014, 0.02, [0.3, 0.25, 0.2], 0, T);
      vmb.box(m, ox, hy + 0.27, hz, 0.022, 0.17, 0.01, c, em, T);
      vmb.box(m, ox, hy + 0.27, hz + 0.006, 0.008, 0.15, 0.008, c.map((v) => Math.min(1, v * 1.3)), em, T);
    } else if (it.tool === 'pick') {
      vmb.box(m, ox, hy + 0.12, hz, 0.014, 0.15, 0.014, wood, 0, T);
      vmb.box(m, ox, hy + 0.27, hz, 0.022, 0.022, 0.08, c, em, T);
      vmb.box(m, ox, hy + 0.255, hz + 0.1, 0.018, 0.03, 0.03, c, em, T);
      vmb.box(m, ox, hy + 0.255, hz - 0.1, 0.018, 0.03, 0.03, c, em, T);
    } else vmb.box(m, ox, hy + 0.05, hz, 0.06, 0.045, 0.06, c, 0, T);
  }
  function drawWorldBits() {
    batch.reset();
    drawClouds();
    if (cfg.tp) drawPlayer();
    drawViewModel();
    for (const mb of G.mobs) if (Math.hypot(mb.x - G.eye[0], mb.z - G.eye[2]) < gfx.viewDist) drawMob(mb);
    for (const d of G.drops) {
      const m = { x: d.x, y: d.y + 0.3 + Math.sin(d.age * 3) * 0.1, z: d.z, yaw: 0, lit: litAt(d.x, d.y + 0.4, d.z), scale: 2 };
      const emis = d.id < 100 && D[d.id].light ? 0.6 : d.id >= 100 && IT[d.id].glow ? 0.6 : 0;
      batch.box(m, 0, 0, 0, 0.13, 0.13, 0.13, itemCol(d.id), emis, null, d.age * 2);
    }
    for (const q of G.parts) {
      const m = { x: q.x, y: q.y, z: q.z, yaw: 0, lit: q.emis ? [1, 1, 1] : litAt(q.x, q.y, q.z) };
      batch.box(m, 0, 0, 0, q.s, q.s, q.s, q.col, q.emis);
    }
    // contorno do bloco mirado
    const t = G.target;
    if (t && G.p.dead <= 0) {
      const m = { x: t.x, y: t.y, z: t.z, yaw: 0, lit: [1, 1, 1] }, c = [1, 1, 1], e = 0.35, k = 0.012, o = -0.005, L = 1.01;
      for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        batch.box(m, 0.5, o + a * L, o + b * L, 0.5, k, k, c, e);
        batch.box(m, o + a * L, 0.5, o + b * L, k, 0.5, k, c, e);
        batch.box(m, o + a * L, o + b * L, 0.5, k, k, 0.5, c, e);
      }
    }
  }
  // camada 2D: mira, progresso, números
  function drawOverlay() {
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = innerWidth, H = innerHeight;
    if (ov.width !== Math.round(W * dpr)) { ov.width = Math.round(W * dpr); ov.height = Math.round(H * dpr); }
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    octx.clearRect(0, 0, W, H);
    if (screen !== 'play' && screen !== 'bag') return;
    const cx = W / 2, cy = H / 2, p = G.p;
    octx.lineCap = 'round';
    const tg = !!G.target, gap = tg ? 4 : 6, len = 6;
    octx.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { octx.moveTo(cx + dx * gap, cy + dy * gap); octx.lineTo(cx + dx * (gap + len), cy + dy * (gap + len)); }
    octx.strokeStyle = 'rgba(20,14,50,.75)'; octx.lineWidth = 4.5; octx.stroke();
    octx.strokeStyle = tg ? '#ffd34d' : 'rgba(255,255,255,.85)'; octx.lineWidth = 2; octx.stroke();
    octx.fillStyle = tg ? '#ffd34d' : '#fff'; octx.beginPath(); octx.arc(cx, cy, 1.6, 0, 7); octx.fill();
    if (p.mine && p.mine.k > 0) {
      octx.lineWidth = 6; octx.strokeStyle = 'rgba(27,22,64,.8)';
      octx.beginPath(); octx.arc(cx, cy, 18, -Math.PI / 2, -Math.PI / 2 + p.mine.k * 6.283); octx.stroke();
      octx.lineWidth = 3; octx.strokeStyle = '#ffc93c'; octx.stroke();
    }
    octx.textAlign = 'center';
    octx.font = '700 16px Fredoka, system-ui, sans-serif';
    octx.lineJoin = 'round';
    for (const t of G.texts) {
      const s = gfx.project(t.x, t.y, t.z);
      if (!s) continue;
      octx.globalAlpha = Math.min(1, t.life * 2);
      octx.lineWidth = 4; octx.strokeStyle = '#1b1640'; octx.strokeText(t.txt, s.x, s.y);
      octx.fillStyle = t.col; octx.fillText(t.txt, s.x, s.y);
    }
    octx.globalAlpha = 1;
    for (const m of G.mobs) {
      if (m.hp >= m.max) continue;
      const s = gfx.project(m.x, m.y + m.h + 0.6, m.z);
      if (!s || Math.hypot(m.x - p.x, m.z - p.z) > 40) continue;
      octx.fillStyle = '#1b1640'; octx.fillRect(s.x - 22, s.y - 4, 44, 8);
      octx.fillStyle = '#ff5d8f'; octx.fillRect(s.x - 20, s.y - 2, 40 * Math.max(0, m.hp / m.max), 4);
    }
  }
  // mapa visto de cima
  let mapImg = null, mapCtx = null;
  function drawMap() {
    const w = G.world, p = G.p, c = $('#map'), R = 64, N = R * 2;
    if (!mapCtx) { mapCtx = c.getContext('2d'); mapImg = mapCtx.createImageData(N, N); c.width = c.height = N; }
    const d = mapImg.data, px = Math.floor(p.x), pz = Math.floor(p.z);
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const x = px - R + i, z = pz - R + j, o = (j * N + i) * 4;
        if (!w.inside(x, 0, z)) { d[o] = 20; d[o + 1] = 16; d[o + 2] = 50; d[o + 3] = 255; continue; }
        const h = w.hm[z * w.W + x];
        let id = w.get(x, h + 1, z);
        if (!id || D[id].kind === 'sprite') id = w.get(x, h, z);
        let top = h; for (let k = h + 1; k < Math.min(w.H, h + 12); k++) { const v = w.get(x, k, z); if (v === B.WATER || D[v].leafy) { id = v; top = k; } }
        const col = D[id].c1, k = 0.55 + (top - 40) / 90;
        d[o] = col[0] * k; d[o + 1] = col[1] * k; d[o + 2] = col[2] * k; d[o + 3] = 255;
      }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if ((i - R) * (i - R) + (j - R) * (j - R) > R * R) d[(j * N + i) * 4 + 3] = 0;
    mapCtx.clearRect(0, 0, N, N);
    mapCtx.putImageData(mapImg, 0, 0);
    mapCtx.save();
    mapCtx.translate(R, R);
    mapCtx.rotate(-p.yaw + Math.PI);
    mapCtx.fillStyle = '#fff'; mapCtx.strokeStyle = '#1b1640'; mapCtx.lineWidth = 2;
    mapCtx.beginPath(); mapCtx.moveTo(0, -6); mapCtx.lineTo(5, 5); mapCtx.lineTo(-5, 5); mapCtx.closePath(); mapCtx.fill(); mapCtx.stroke();
    mapCtx.restore();
    for (const m of G.mobs) {
      const i = Math.floor(m.x) - px + R, j = Math.floor(m.z) - pz + R;
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      mapCtx.fillStyle = '#ff5d8f'; mapCtx.fillRect(i - 2, j - 2, 4, 4);
    }
  }
  let lastHp = -1;
  function updateHud() {
    const p = G.p;
    if (Math.round(p.hp) !== lastHp || hotbarDirty) {
      const hurt = Math.round(p.hp) < lastHp;
      lastHp = Math.round(p.hp);
      const box = $('#hearts'), n = Math.ceil(p.maxHp / 20);
      box.style.gridTemplateColumns = 'repeat(' + Math.min(n, 10) + ', auto)';
      if (box.children.length !== n) { box.innerHTML = ''; for (let k = 0; k < n; k++) box.appendChild(document.createElement('i')).appendChild(document.createElement('b')); }
      for (let k = 0; k < n; k++) {
        const f = clamp((p.hp - k * 20) / 20, 0, 1), el = box.children[k];
        el.firstChild.style.width = f * 100 + '%';
        if (hurt && f < 1 && f > 0) { el.classList.remove('beat'); void el.offsetWidth; el.classList.add('beat'); }
      }
      $('#hpText').textContent = lastHp + '/' + p.maxHp;
    }
    if (hotbarDirty) renderHotbar();
    const ph = (G.time / DAY) % 1, hrs = (ph * 24 + 6) % 24;
    $('#clock').textContent = 'Dia ' + (G.day + 1) + ' · ' + String(Math.floor(hrs)).padStart(2, '0') + ':' + String(Math.floor((hrs % 1) * 6) * 10).padStart(2, '0');
    $('#dialHand').setAttribute('transform', 'rotate(' + ((ph * 360 + 270) % 360 - 0) + ' 20 20)');
    const t = G.target;
    const nm = t ? D[t.id].name : '';
    if ($('#tname').textContent !== nm) $('#tname').textContent = nm;
  }

  // ───── mundos salvos ─────
  function save() {
    if (!G) return;
    const p = G.p;
    const ok = LS.set(slotKey(G.slot), {
      v: 1, seed: G.world.seed, name: G.name, created: G.created, time: G.time, kills: G.kills, edits: G.world.editList(), cam: { yaw: G.cam.yaw, pitch: G.cam.pitch },
      p: { x: p.x, y: p.y, z: p.z, yaw: p.yaw, hp: p.hp, maxHp: p.maxHp, inv: p.inv, sel: p.sel },
    });
    if (!ok) toast('Não deu pra salvar: memória cheia');
  }
  const TIPS = ['Segure ⛏ mirando num bloco pra cavar.', 'Corte o tronco de baixo e a árvore inteira cai.', 'Madeira vira tábuas; 8 tábuas viram uma bancada.',
    'Tochas iluminam cavernas com luz quente.', 'Cristais de vida (corações) aumentam sua vida máxima.', 'À noite, os Assombros saem pra caçar.',
    'Fornalha + minério = barras de metal pra ferramentas melhores.', 'Cogumelos brilhantes curam um pouco.'];
  async function startGame(slot, data) {
    screen = 'loading';
    $('#menu').hidden = true; $('#loading').hidden = false;
    $('#loadTitle').textContent = data ? 'Carregando o mundo…' : 'Criando o mundo…';
    $('#loadTip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
    const seed = data ? data.seed : (Math.random() * 1e9) | 0;
    const world = new CB.World(WSIZE, WH, seed);
    const gen = world.generate();
    const bar = $('#loadBar');
    for (;;) {
      const r = gen.next();
      bar.style.width = Math.round((r.value || 0) * 70) + '%';
      if (r.done) break;
      await new Promise((ok) => setTimeout(ok, 0));
    }
    if (data && data.edits && data.edits.length) { world.applyEdits(data.edits); await new Promise((ok) => setTimeout(ok, 0)); }
    G = { world, slot, name: data ? data.name : 'Mundo ' + (slot + 1), created: data ? data.created : Date.now(), time: data ? data.time : DAY * 0.04,
      kills: data ? data.kills || 0 : 0, clouds: makeClouds(seed), mobs: [], drops: [], parts: [], texts: [], spawnT: 3, flowT: 0, saveT: 45, mapT: 0, day: 0, daylight: 1,
      cam: { yaw: data && data.cam ? data.cam.yaw : 0.6, pitch: data && data.cam ? data.cam.pitch : 0.28, dist: 9, cur: null } };
    G.p = newPlayer(world);
    if (data && data.p) Object.assign(G.p, data.p, { vx: 0, vy: 0, vz: 0 });
    while (overlaps(world, G.p) && G.p.y < WH) G.p.y += 1;
    G.daylight = sstep(-0.12, 0.22, Math.sin(((G.time / DAY) % 1) * 6.283));
    gfx.clearSections();
    hotbarDirty = true; mapDirty = true; lastHp = -1;
    update(0);
    gfx.loading = true;
    const t0 = performance.now();
    for (;;) {
      gfx.setCamera(G.eye, G.fwd);
      batch.reset();
      gfx.render(world, G.env, G.time, batch, 0);
      bar.style.width = Math.round(70 + 30 * (1 - Math.min(1, gfx.pending / 60))) + '%';
      if (gfx.pending === 0 || performance.now() - t0 > 8000) break;
      await new Promise((ok) => requestAnimationFrame(ok));
    }
    gfx.loading = false;
    $('#loading').hidden = true; $('#hud').hidden = false;
    screen = 'play';
    renderHotbar();
    drawMap();
    if (!data) toast('Segure o botão grande pra cavar · arraste à direita pra olhar');
  }
  function quitGame() {
    save();
    G = null; screen = 'menu';
    gfx.clearSections();
    for (const id of ['#hud', '#pause', '#bag', '#dead']) $(id).hidden = true;
    $('#menu').hidden = false;
    renderMenu();
  }
  function pauseGame() { if (screen !== 'play') return; screen = 'pause'; $('#pause').hidden = false; save(); inp.use = inp.jump = false; }
  $('#btPause').onclick = pauseGame;
  const syncCam = () => $('#btCam').classList.toggle('on', !!cfg.tp);
  $('#btCam').onclick = () => { cfg.tp = !cfg.tp; saveCfg(); syncCam(); sfx('pop'); if (G) { G.cam.cur = null; G.cam.pitch = clamp(G.cam.pitch, -1.1, 1.35); } };
  syncCam();
  $('#psResume').onclick = () => { screen = 'play'; $('#pause').hidden = true; };
  $('#psQuit').onclick = quitGame;
  $('#psSettings').onclick = () => openSettings('pause');
  $('#btSettings').onclick = () => openSettings('menu');

  function renderMenu() {
    const box = $('#slots');
    box.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const d = LS.get(slotKey(i), null), el = document.createElement('div');
      el.className = 'slot';
      el.innerHTML = '<div><b>' + (d ? d.name : 'Espaço vazio') + '</b><small>' +
        (d ? 'Dia ' + (Math.floor(d.time / DAY) + 1) + ' · vida ' + d.p.maxHp + ' · ' + (d.kills || 0) + ' inimigos vencidos' : 'Um mundo novo, gerado na hora') + '</small></div>';
      const go = document.createElement('button');
      go.className = 'primary';
      go.textContent = d ? 'Jogar' : 'Criar mundo';
      go.onclick = () => { sfx('pop'); startGame(i, d); };
      el.appendChild(go);
      if (d) {
        const del = document.createElement('button');
        del.className = 'danger small';
        del.textContent = 'Apagar';
        del.onclick = () => {
          if (!del.dataset.sure) { del.dataset.sure = 1; del.textContent = 'Certeza?'; setTimeout(() => { if (del.isConnected) { delete del.dataset.sure; del.textContent = 'Apagar'; } }, 2500); return; }
          LS.del(slotKey(i)); renderMenu();
        };
        el.appendChild(del);
      }
      box.appendChild(el);
    }
  }
  let setFrom = 'menu';
  function openSettings(from) {
    setFrom = from;
    $(from === 'menu' ? '#menu' : '#pause').hidden = true;
    $('#settings').hidden = false;
    const box = $('#setBody');
    box.innerHTML = '';
    const seg = (label, opts, key) => {
      const o = document.createElement('div');
      o.className = 'opt';
      o.innerHTML = '<span>' + label + '</span><div class="seg"></div>';
      opts.forEach((t, i) => {
        const b = document.createElement('button');
        b.textContent = t;
        b.className = (typeof cfg[key] === 'boolean' ? cfg[key] === (i === 0) : cfg[key] === i) ? 'on' : '';
        b.onclick = () => { cfg[key] = typeof cfg[key] === 'boolean' ? i === 0 : i; saveCfg(); applyCfg(); openSettings(from); };
        o.lastChild.appendChild(b);
      });
      box.appendChild(o);
    };
    seg('Qualidade gráfica', ['Leve', 'Média', 'Bonita'], 'quality');
    seg('Distância de visão', ['Curta', 'Média', 'Longa'], 'view');
    seg('Som', ['Ligado', 'Desligado'], 'sound');
    seg('Pulo automático em degraus', ['Ligado', 'Desligado'], 'autojump');
    seg('Câmera', ['3ª pessoa', '1ª pessoa'], 'tp');
    const o = document.createElement('label');
    o.className = 'opt';
    o.innerHTML = '<span>Sensibilidade da câmera: <b>' + cfg.sens.toFixed(1) + '</b></span><input type="range" min="0.4" max="2.5" step="0.1">';
    const r = o.querySelector('input');
    r.value = cfg.sens;
    r.oninput = () => { cfg.sens = +r.value; o.querySelector('b').textContent = cfg.sens.toFixed(1); saveCfg(); };
    box.appendChild(o);
  }
  $('#setClose').onclick = () => { $('#settings').hidden = true; $(setFrom === 'menu' ? '#menu' : '#pause').hidden = false; };

  // botão voltar do Android
  window.CBback = function () {
    if (screen === 'bag') { closeBag(); return true; }
    if (!$('#settings').hidden) { $('#setClose').onclick(); return true; }
    if (screen === 'play') { pauseGame(); return true; }
    if (screen === 'pause') { $('#psResume').onclick(); return true; }
    return false;
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden && G) { save(); if (screen === 'play') pauseGame(); } });
  window.CBdebug = () => ({ G, addItem, breakAt, spawnMob, DAY, openBag, renderBag });

  // ───── laço principal ─────
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!G || screen === 'loading' || screen === 'menu') { octx.clearRect(0, 0, ov.width, ov.height); return; }
    if (screen === 'play') update(dt);
    gfx.setCamera(G.eye, G.fwd);
    drawWorldBits();
    gfx.render(G.world, G.env, G.time, batch, G.hurtFx, vmb);
    drawOverlay();
    updateHud();
  }
  renderMenu();
  requestAnimationFrame(frame);
})();
