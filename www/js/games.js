// EvoLab: cenários e moldes de jogo. Cada molde define peças, mundo, sensores (entradas da rede),
// ações (saídas da rede), física e desenho. Nada de engine: só peças e parâmetros editáveis.
(function () {
  const NL = window.NL, W = NL.W, H = NL.H;
  const INK = (NL.INK = '#1d1a39');
  const AHEAD = 1300; // até onde o mundo é gerado à frente (cobre telas bem largas)
  const START = W + 200; // onde começa a primeira volta da pista montada
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const snap = (v, s) => Math.round(v / s) * s;
  const mod = (a, n) => ((a % n) + n) % n;

  NL.themes = {
    campo: { name: 'Campo', sky: ['#5fcdf5', '#d9f7ff'], sun: '#ffd93d', far: '#a5e3a0', near: '#62c370', ground: '#f3cf8e', top: '#4fb061', obs: '#ff5d8f', obs2: '#8338ec', cloud: '#ffffff', road: '#5b5f7a' },
    deserto: { name: 'Deserto', sky: ['#ff9e5e', '#ffe3ad'], sun: '#fff6c2', far: '#f7b267', near: '#e07a3f', ground: '#f6d78f', top: '#d08c45', obs: '#2a9d8f', obs2: '#e63946', cloud: '#fff1d6', road: '#7a5c48' },
    noite: { name: 'Noite', sky: ['#120f38', '#4a3b8f'], sun: '#f5f3ce', far: '#39348a', near: '#2a2569', ground: '#463f96', top: '#7a70d6', obs: '#ff5d8f', obs2: '#ffc93c', cloud: '#5a519e', stars: true, road: '#25224d' },
    neve: { name: 'Neve', sky: ['#8fcaff', '#f4fbff'], sun: '#ffffff', far: '#e6f2ff', near: '#c4dcf5', ground: '#ffffff', top: '#a9c9e8', obs: '#3d5a80', obs2: '#ee6c4d', cloud: '#ffffff', road: '#6f86a3' },
    doce: { name: 'Doce', sky: ['#ff9ec4', '#ffe5ec'], sun: '#fffbe0', far: '#d3b8e6', near: '#b392d6', ground: '#fdf0d5', top: '#ff7aa2', obs: '#06d6a0', obs2: '#8338ec', cloud: '#ffffff', road: '#8d6aa8' },
    vulcao: { name: 'Vulcão', sky: ['#2b0a1e', '#b3261e'], sun: '#ffb703', far: '#5c1a1b', near: '#3a0f14', ground: '#4a2c2a', top: '#ff7b00', obs: '#ffb703', obs2: '#f1faee', cloud: '#6b2a2a', road: '#2e1a1a' },
    mar: { name: 'Praia', sky: ['#00b4d8', '#caf0f8'], sun: '#fff3b0', far: '#48cae4', near: '#0096c7', ground: '#ffe8a3', top: '#f4c95d', obs: '#ef476f', obs2: '#7b2cbf', cloud: '#ffffff', road: '#3d6f8f' },
  };
  NL.shapes = { bicho: 'Bicho', bola: 'Bola', robo: 'Robô', fantasma: 'Fantasma' };
  NL.accs = { none: 'Nada', cartola: 'Cartola', antena: 'Antena', laco: 'Laço', bone: 'Boné' };

  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  NL.rr = rr;

  function hills(ctx, col, off, VW, gy, amp, f) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, gy);
    for (let x = 0; x <= VW + 16; x += 16) {
      const X = x + off;
      ctx.lineTo(x, gy - amp * (0.55 + 0.3 * Math.sin(X * f) + 0.15 * Math.sin(X * f * 2.7 + 1)));
    }
    ctx.lineTo(VW + 16, gy);
    ctx.fill();
  }

  // céu, sol/lua, nuvens, morros em paralaxe e chão
  function scene(ctx, th, dist, VW, gy) {
    const g = ctx.createLinearGradient(0, -200, 0, gy);
    g.addColorStop(0, th.sky[0]);
    g.addColorStop(1, th.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, -600, VW, gy + 600);
    if (th.stars) {
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      for (let i = 0; i < 40; i++) ctx.fillRect(mod(i * 97.3 - dist * 0.02, VW), mod(i * 53.7, gy - 60) - 20, 2, 2);
    }
    ctx.fillStyle = th.sun;
    ctx.beginPath();
    ctx.arc(Math.min(VW, 1100) - 120, 64, 30, 0, 6.2832);
    ctx.fill();
    ctx.fillStyle = th.cloud;
    ctx.globalAlpha *= 0.9;
    const span = VW + 240;
    for (let i = 0; i < Math.ceil(VW / 260); i++) {
      const x = mod(i * 290 - dist * 0.08, span) - 120, y = 30 + ((i * 47) % 80);
      ctx.beginPath();
      ctx.arc(x, y, 16, 0, 6.2832);
      ctx.arc(x + 20, y - 8, 20, 0, 6.2832);
      ctx.arc(x + 44, y, 15, 0, 6.2832);
      ctx.fill();
    }
    ctx.globalAlpha /= 0.9;
    hills(ctx, th.far, dist * 0.15, VW, gy, 95, 0.006);
    hills(ctx, th.near, dist * 0.35 + 300, VW, gy, 52, 0.011);
    ctx.fillStyle = th.ground;
    ctx.fillRect(0, gy, VW, H - gy + 4);
    ctx.fillStyle = th.top;
    ctx.fillRect(0, gy, VW, 9);
    ctx.fillStyle = INK;
    ctx.fillRect(0, gy - 2, VW, 3);
    ctx.fillStyle = 'rgba(29,26,57,.14)';
    for (let x = -mod(dist, 110); x < VW; x += 110) {
      ctx.fillRect(x, gy + 22, 34, 4);
      ctx.fillRect(x + 60, gy + 38, 18, 4);
    }
  }

  function block(ctx, x, y, w, h, fill, r) {
    rr(ctx, x, y, w, h, r || 7);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.3)';
    rr(ctx, x + 5, y + 5, Math.max(2, w - 10), Math.min(6, h / 4), 3);
    ctx.fill();
  }
  function coin(ctx, cx, cy, t) {
    const sq = 0.55 + 0.45 * Math.abs(Math.cos((t || 0) * 4 + cx * 0.02));
    ctx.beginPath();
    ctx.ellipse(cx, cy, 11 * sq, 11, 0, 0, 6.2832);
    ctx.fillStyle = '#ffc93c';
    ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = '#fff3b0';
    ctx.fillRect(cx - 2 * sq, cy - 5, 4 * sq, 10);
  }
  function eye(ctx, x, y, r) {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.arc(x + r * 0.35, y, r * 0.5, 0, 6.2832); ctx.fill();
  }
  function crown(ctx, cx, y) {
    ctx.fillStyle = '#ffc93c';
    ctx.beginPath();
    ctx.moveTo(cx - 10, y); ctx.lineTo(cx - 11, y - 11); ctx.lineTo(cx - 5, y - 5); ctx.lineTo(cx, y - 13);
    ctx.lineTo(cx + 5, y - 5); ctx.lineTo(cx + 11, y - 11); ctx.lineTo(cx + 10, y);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
  }
  // enfeite na cabeça (a coroa da campeã tem prioridade)
  function hat(ctx, cx, y, a, look) {
    if (a.crown) return crown(ctx, cx, y);
    const k = look && look.acc;
    ctx.lineWidth = 2; ctx.strokeStyle = INK;
    if (k === 'cartola') {
      ctx.fillStyle = INK;
      ctx.fillRect(cx - 8, y - 14, 16, 13);
      ctx.fillRect(cx - 13, y - 3, 26, 4);
      ctx.fillStyle = '#ff5d8f';
      ctx.fillRect(cx - 8, y - 7, 16, 3);
    } else if (k === 'antena') {
      ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(cx, y - 12); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, y - 14, 4, 0, 6.2832); ctx.fillStyle = '#ff5d8f'; ctx.fill(); ctx.stroke();
    } else if (k === 'laco') {
      ctx.fillStyle = '#ff5d8f';
      ctx.beginPath();
      ctx.moveTo(cx, y - 4); ctx.lineTo(cx - 11, y - 11); ctx.lineTo(cx - 11, y + 2); ctx.closePath();
      ctx.moveTo(cx, y - 4); ctx.lineTo(cx + 11, y - 11); ctx.lineTo(cx + 11, y + 2); ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else if (k === 'bone') {
      ctx.fillStyle = '#4cc9f0';
      ctx.beginPath(); ctx.arc(cx - 1, y + 1, 11, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillRect(cx + 6, y - 2, 12, 4); ctx.strokeRect(cx + 6, y - 2, 12, 4);
    }
  }

  // personagem: corpo, olho, perninhas e enfeite
  function blob(ctx, x, y, w, h, a, legs, look) {
    const shape = (look && look.shape) || 'bicho';
    ctx.lineCap = 'round';
    if (legs >= 0 && shape !== 'fantasma') {
      ctx.strokeStyle = INK; ctx.lineWidth = 4;
      const s = Math.sin(legs) * 5;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.3, y + h - 3); ctx.lineTo(x + w * 0.3 + s, y + h + 6);
      ctx.moveTo(x + w * 0.7, y + h - 3); ctx.lineTo(x + w * 0.7 - s, y + h + 6);
      ctx.stroke();
      h -= 4;
    }
    if (shape === 'fantasma') {
      const r = Math.min(w / 2, h / 2), b = y + h + 4;
      ctx.beginPath();
      ctx.moveTo(x, b);
      ctx.lineTo(x, y + r);
      ctx.arc(x + w / 2, y + r, w / 2, Math.PI, 0);
      ctx.lineTo(x + w, b);
      ctx.lineTo(x + w * 0.75, b - 6); ctx.lineTo(x + w * 0.5, b); ctx.lineTo(x + w * 0.25, b - 6);
      ctx.closePath();
    } else rr(ctx, x, y, w, h, shape === 'bola' ? 99 : shape === 'robo' ? 3 : 10);
    ctx.fillStyle = 'hsl(' + a.hue + ',88%,62%)';
    ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    if (shape === 'robo') {
      ctx.fillStyle = INK;
      rr(ctx, x + w * 0.35, y + Math.min(6, h * 0.25), w * 0.6, Math.min(11, h * 0.5), 3); ctx.fill();
      ctx.fillStyle = '#4cc9f0';
      ctx.fillRect(x + w * 0.68, y + Math.min(9, h * 0.35), 5, 5);
    } else {
      if (shape !== 'bola') { ctx.fillStyle = 'rgba(255,255,255,.3)'; rr(ctx, x + 4, y + 4, w * 0.4, 5, 3); ctx.fill(); }
      eye(ctx, x + w - 10, y + Math.min(12, h * 0.45), 6);
    }
    hat(ctx, x + w / 2, y - 2, a, look);
  }

  // as IAs não seguidas ficam translúcidas; a seguida é desenhada por cima
  function eachAgent(ctx, agents, view, fn) {
    const vis = (a) => !(a.inv > 0 && ((a.inv * 12) | 0) % 2);
    if (!view.solo) {
      if (!view.solid) ctx.globalAlpha = 0.35;
      let n = 0;
      for (const a of agents) {
        if (a.dead || a === view.focus || !vis(a)) continue;
        fn(a);
        if (++n > 120) break;
      }
      ctx.globalAlpha = 1;
    }
    if (view.focus && !view.focus.dead && vis(view.focus)) {
      if (view.ghost) ctx.globalAlpha = 0.55;
      fn(view.focus);
      ctx.globalAlpha = 1;
    }
  }
  const taken = (view, o) => view && view.focus && view.focus.got && view.focus.got[o.id];

  function pickW(list, def, rnd) {
    let tot = 0;
    const f = (q) => { const v = def.freq && def.freq[q.id]; return v == null ? q.freq : v; };
    for (const q of list) tot += f(q);
    if (tot <= 0) return null;
    let r = rnd() * tot;
    for (const q of list) { r -= f(q); if (r < 0) return q; }
    return list[list.length - 1];
  }
  const coinChance = (T, def) => { const v = def.freq && def.freq.coin; return (v == null ? T.piece('coin').freq : v) / 10; };

  // comum a todos os moldes
  const base = {
    piece(id) { return this.pieces.find((q) => q.id === id) || this.pieces[0]; },
    make(t, over) { return Object.assign({ t }, this.piece(t).d, over); },
    add(w, o, def) { o.id = w.cid++; this.fin(o, def); w.obs.push(o); return o; },
    fin() {},
    newWorld(def, rnd) {
      const len = def.len || this.loopLen;
      const w = {
        dist: 0, t: 0, speed: def.params.speed || 0, obs: [], rnd, loop: 0, ti: 0, cid: 1, nextX: START, len,
        track: def.mode === 'track' && this.pieces.length ? def.track.filter((it) => it.x < len).sort((a, b) => a.x - b.x) : null,
      };
      this.init && this.init(w, def);
      return w;
    },
    // gera o mundo à frente: pista montada (em loop) ou sorteio
    grow(w, def) {
      const limit = w.dist + AHEAD;
      if (!w.track) return this.spawn(w, def, limit);
      if (!w.track.length) return;
      for (;;) {
        const it = w.track[w.ti], x = START + w.loop * w.len + it.x;
        if (x > limit) break;
        this.add(w, Object.assign({}, this.piece(it.t).d, it, { x }), def);
        if (++w.ti >= w.track.length) { w.ti = 0; w.loop++; }
      }
    },
    cull(w) { while (w.obs.length && w.obs[0].x + w.obs[0].w < w.dist - 60) w.obs.shift(); },
    // sorteia uma pista do tamanho pedido (pro botão "preencher com sorteio")
    randomTrack(def, len) {
      const d = Object.assign({}, def, { mode: 'random' }), w = this.newWorld(d, NL.rng((Math.random() * 2 ** 32) >>> 0));
      this.spawn(w, d, START + len - 80);
      return w.obs.map((o) => {
        const it = Object.assign({}, o, { x: snap(o.x - START, 10) });
        for (const k of ['id', 'ce', 'ccy', 'g']) delete it[k];
        return it;
      }).filter((it) => it.x >= 0 && it.x + it.w <= len);
    },
  };
  const MOVE = [
    { key: 'amp', label: 'Sobe e desce', min: 0, max: 90, step: 5 },
    { key: 'spd', label: 'Rapidez do movimento', min: 1, max: 8, step: 0.5 },
  ];

  // ───────────────────────── CORREDOR ─────────────────────────
  const GY = 300, AX = 90, AW = 32;
  const BLOCK = [
    { key: 'w', label: 'Largura', min: 16, max: 160, step: 2 },
    { key: 'h', label: 'Altura', min: 16, max: 120, step: 2 },
    { key: 'e', label: 'Distância do chão', min: 0, max: 130, step: 5 },
  ].concat(MOVE);
  NL.types.runner = Object.assign({}, base, {
    name: 'Corredor', icon: '🏃',
    desc: 'Corre sozinho. A IA decide quando pular e quando abaixar.',
    nIn: 9, nOut: 2,
    inputLabels: ['dist. obstáculo', 'largura', 'altura', 'voando/buraco', 'velocidade', 'minha altura', 'dist. 2º', 'dist. moeda', 'altura moeda'],
    outputLabels: ['pular', 'abaixar'],
    controls: [
      { label: 'Abaixar', out: 1, keys: ['ArrowDown'] },
      { label: 'Pular', out: 0, keys: [' ', 'ArrowUp'] },
    ],
    loopLen: 2400, shapes: true,
    pieces: [
      { id: 'low', label: 'Baixo', d: { w: 26, h: 40, e: 0, amp: 0, spd: 3 }, freq: 5, props: BLOCK },
      { id: 'tall', label: 'Alto', d: { w: 26, h: 62, e: 0, amp: 0, spd: 3 }, freq: 4, props: BLOCK },
      { id: 'wide', label: 'Largo', d: { w: 66, h: 30, e: 0, amp: 0, spd: 3 }, freq: 3, props: BLOCK },
      { id: 'fly', label: 'Voador', d: { w: 46, h: 24, e: 30, amp: 0, spd: 3 }, freq: 3, props: BLOCK },
      { id: 'pit', label: 'Buraco', d: { w: 90 }, freq: 0, props: [{ key: 'w', label: 'Largura', min: 50, max: 220, step: 10 }] },
      { id: 'coin', label: 'Moeda', d: { w: 22, e: 60 }, freq: 3, props: [{ key: 'e', label: 'Altura', min: 0, max: 150, step: 10 }] },
    ],
    params: [
      { key: 'speed', label: 'Velocidade inicial', min: 150, max: 600, step: 10, def: 300 },
      { key: 'accel', label: 'Aceleração', min: 0, max: 30, step: 1, def: 6 },
      { key: 'maxSpeed', label: 'Velocidade máxima', min: 300, max: 1200, step: 20, def: 800 },
      { key: 'gravity', label: 'Gravidade', min: 1200, max: 4000, step: 100, def: 2600 },
      { key: 'jump', label: 'Força do pulo', min: 500, max: 1100, step: 10, def: 780 },
      { key: 'gapMin', label: 'Distância mínima entre obstáculos', min: 150, max: 500, step: 10, def: 260, random: true },
      { key: 'gapMax', label: 'Distância máxima entre obstáculos', min: 200, max: 900, step: 10, def: 520, random: true },
    ],
    presets: {
      'Fácil': { speed: 240, accel: 3, maxSpeed: 500, gapMin: 340, gapMax: 620 },
      'Normal': {},
      'Difícil': { speed: 380, accel: 10, maxSpeed: 1000, gapMin: 220, gapMax: 420 },
      'Insano': { speed: 480, accel: 16, maxSpeed: 1200, gapMin: 190, gapMax: 340 },
    },
    fin(o) { o.ce = o.e || 0; },
    spawn(w, def, limit) {
      const p = def.params, hz = this.pieces.filter((q) => q.id !== 'coin'), cc = coinChance(this, def);
      const lo = Math.min(p.gapMin, p.gapMax), hi = Math.max(p.gapMin, p.gapMax);
      while (w.nextX < limit) {
        const q = pickW(hz, def, w.rnd);
        let ow = 0;
        if (q) ow = this.add(w, this.make(q.id, { x: w.nextX }), def).w;
        const gap = (lo + w.rnd() * (hi - lo)) * (0.5 + (0.5 * w.speed) / p.speed);
        if (w.rnd() < cc) this.add(w, this.make('coin', { x: Math.round(w.nextX + ow + gap / 2), e: [10, 60, 110][Math.floor(w.rnd() * 3)] }), def);
        w.nextX += ow + gap;
      }
    },
    newAgent() { return { y: 0, vy: 0, duck: false, dead: false }; },
    step(w, def, dt) {
      const p = def.params;
      w.t += dt;
      w.speed = Math.min(Math.max(p.maxSpeed, p.speed), p.speed + p.accel * w.t);
      w.dist += w.speed * dt;
      this.grow(w, def);
      for (const o of w.obs) if (o.amp) o.ce = o.e + o.amp * (0.5 + 0.5 * Math.sin(w.t * o.spd + o.x * 0.01));
      this.cull(w);
    },
    sense(w, a, def, x) {
      const front = w.dist + AX;
      let o1 = null, o2 = null, c = null;
      for (const o of w.obs) {
        if (o.x + o.w < front) continue;
        if (o.t === 'coin') { if (!c && !a.got[o.id]) c = o; continue; }
        if (!o1) o1 = o;
        else if (!o2) o2 = o;
        if (o2 && c) break;
      }
      const pit = o1 && o1.t === 'pit';
      x[0] = o1 ? clamp((o1.x - front - AW) / W, -0.2, 1) : 1;
      x[1] = o1 ? o1.w / 80 : 0;
      x[2] = o1 && !pit ? o1.h / 80 : 0;
      x[3] = o1 ? (pit ? -1 : o1.ce / 30) : 0;
      x[4] = w.speed / 1200;
      x[5] = a.y / 120;
      x[6] = o2 ? clamp((o2.x - front - AW) / W, 0, 1) : 1;
      x[7] = c ? clamp((c.x - front - AW) / W, -0.2, 1) : 1;
      x[8] = c ? c.e / 120 : 0;
    },
    stepAgent(w, a, out, def, dt) {
      const p = def.params;
      a.duck = out[1] > 0.5;
      if (out[0] > 0.5 && a.y <= 0 && !a.duck) a.vy = p.jump;
      a.vy -= p.gravity * (a.duck && a.y > 0 ? 3 : 1) * dt;
      a.y += a.vy * dt;
      if (a.y <= 0) { a.y = 0; a.vy = 0; }
      const h = a.duck ? 22 : 44, x0 = w.dist + AX + 4, x1 = w.dist + AX + AW - 4;
      for (const o of w.obs) {
        if (o.x > x1) break;
        if (o.x + o.w < x0) continue;
        if (o.t === 'coin') {
          if (!a.got[o.id] && a.y < o.e + 22 && a.y + h > o.e) { a.got[o.id] = 1; a.coins++; }
        } else if (o.t === 'pit') {
          if (a.y <= 0 && x0 >= o.x && x1 <= o.x + o.w) { a.dead = true; return; }
        } else if (a.y + 2 < o.ce + o.h && a.y + h - 2 > o.ce) { a.dead = true; return; }
      }
    },
    agentPos(w, a) { return { x: AX + AW / 2, y: GY - a.y - (a.duck ? 11 : 22), top: GY - a.y - (a.duck ? 22 : 44) }; },
    // caixa da peça no editor e como o arrasto vertical mexe nela
    box(o) {
      if (o.t === 'pit') return { y: GY - 8, h: H - GY + 8 };
      if (o.t === 'coin') return { y: GY - o.e - 22, h: 22 };
      return { y: GY - o.e - o.h, h: o.h };
    },
    place(it, y, isNew) {
      if (it.t === 'coin') it.e = clamp(snap(GY - y - 11, 10), 0, 150);
      else if (it.t !== 'pit' && !isNew) { const e = GY - y - it.h / 2; it.e = e < 12 ? 0 : clamp(snap(e, 5), 0, 130); }
    },
    bg(ctx, th, dist, VW) { scene(ctx, th, dist, VW, GY); },
    drawObs(ctx, o, sx, th, t, view) {
      const e = o.ce == null ? o.e || 0 : o.ce;
      if (o.t === 'coin') { if (!taken(view, o)) coin(ctx, sx + 11, GY - o.e - 11, t); return; }
      if (o.t === 'pit') {
        ctx.fillStyle = INK;
        ctx.fillRect(sx, GY - 2, o.w, H - GY + 8);
        ctx.fillStyle = 'rgba(255,255,255,.12)';
        ctx.fillRect(sx + 4, GY + 6, o.w - 8, 4);
        return;
      }
      if (e > 0 || o.amp) {
        const f = Math.sin((t || 0) * 18) * 7, top = GY - e - o.h, cx = sx + o.w / 2;
        ctx.fillStyle = th.obs2; ctx.strokeStyle = INK; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx - 10, top + 6); ctx.lineTo(cx + 2, top - 8 - f); ctx.lineTo(cx + 12, top + 6);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        block(ctx, sx, top, o.w, o.h, th.obs2, 11);
        eye(ctx, sx + 10, top + Math.min(11, o.h / 2), 5);
      } else block(ctx, sx, GY - o.h, o.w, o.h + 4, th.obs);
    },
    draw(ctx, w, agents, view) {
      const th = view.th;
      scene(ctx, th, w.dist, view.VW, GY);
      for (const o of w.obs) if (o.x - w.dist < view.VW) this.drawObs(ctx, o, o.x - w.dist, th, w.t, view);
      eachAgent(ctx, agents, view, (a) => {
        const h = a.duck ? 22 : 44;
        blob(ctx, AX, GY - a.y - h, AW, h, a, a.y > 0 ? 1.2 : w.dist * 0.09 + a.idx, view.look);
      });
    },
  });

  // ───────────────────────── VOADOR ─────────────────────────
  const FX = 130, FR = 14, FH = H - 50, PW = 62;
  NL.types.flyer = Object.assign({}, base, {
    name: 'Voador', icon: '🐤',
    desc: 'Cai o tempo todo. A IA decide quando bater asa pra passar pelas aberturas.',
    nIn: 8, nOut: 1,
    inputLabels: ['minha altura', 'vel. vertical', 'dist. barreira', 'abertura ↕', '2ª abertura ↕', 'tam. abertura', 'dist. moeda', 'moeda ↕'],
    outputLabels: ['bater asa'],
    controls: [{ label: 'Bater asa', out: 0, keys: [' ', 'ArrowUp'] }],
    loopLen: 2400,
    pieces: [
      { id: 'pipe', label: 'Barreira', d: { w: PW, cy: 155, gap: 0, amp: 0, spd: 2.5 }, freq: 10, props: [{ key: 'gap', label: 'Abertura (0 = regra do jogo)', min: 0, max: 220, step: 5 }].concat(MOVE) },
      { id: 'coin', label: 'Moeda', d: { w: 22, y: 150 }, freq: 3, props: [] },
    ],
    params: [
      { key: 'speed', label: 'Velocidade', min: 100, max: 400, step: 10, def: 190 },
      { key: 'gravity', label: 'Gravidade', min: 600, max: 2500, step: 50, def: 1400 },
      { key: 'flap', label: 'Força da asa', min: 200, max: 600, step: 10, def: 380 },
      { key: 'gap', label: 'Tamanho da abertura', min: 90, max: 200, step: 5, def: 135 },
      { key: 'spacing', label: 'Distância entre barreiras', min: 180, max: 450, step: 10, def: 260, random: true },
      { key: 'move', label: 'Barreiras que se mexem (%)', min: 0, max: 100, step: 5, def: 0, random: true },
    ],
    presets: {
      'Fácil': { speed: 150, gap: 175, spacing: 320 },
      'Normal': {},
      'Difícil': { speed: 240, gap: 115, spacing: 220, move: 30 },
      'Insano': { speed: 300, gap: 100, spacing: 200, move: 70 },
    },
    fin(o, def) {
      if (o.t !== 'pipe') return;
      o.g = o.gap >= 60 ? o.gap : def.params.gap;
      o.cy = clamp(o.cy, o.g / 2 + 15, FH - o.g / 2 - 15);
      o.ccy = o.cy;
    },
    spawn(w, def, limit) {
      const p = def.params, cc = coinChance(this, def);
      if (w.nextX === START) w.nextX = W + 100;
      while (w.nextX < limit) {
        const m = p.gap / 2 + 22;
        this.add(w, this.make('pipe', { x: w.nextX, cy: Math.round(m + w.rnd() * (FH - 2 * m)), amp: w.rnd() * 100 < p.move ? 45 : 0 }), def);
        if (w.rnd() < cc) this.add(w, this.make('coin', { x: Math.round(w.nextX + PW + p.spacing / 2 - 11), y: Math.round(50 + w.rnd() * (FH - 100)) }), def);
        w.nextX += PW + p.spacing;
      }
    },
    newAgent() { return { y: FH / 2, vy: 0, dead: false }; },
    step(w, def, dt) {
      w.t += dt;
      w.dist += def.params.speed * dt;
      this.grow(w, def);
      for (const o of w.obs) if (o.amp) o.ccy = clamp(o.cy + o.amp * Math.sin(w.t * o.spd + o.x * 0.01), o.g / 2 + 8, FH - o.g / 2 - 8);
      this.cull(w);
    },
    sense(w, a, def, x) {
      const back = w.dist + FX - FR;
      let o1 = null, o2 = null, c = null;
      for (const o of w.obs) {
        if (o.x + o.w < back) continue;
        if (o.t === 'coin') { if (!c && !a.got[o.id]) c = o; continue; }
        if (!o1) o1 = o;
        else if (!o2) o2 = o;
        if (o2 && c) break;
      }
      x[0] = a.y / H;
      x[1] = clamp(a.vy / 600, -1.5, 1.5);
      x[2] = o1 ? clamp((o1.x - w.dist - FX) / W, -0.3, 1) : 1;
      x[3] = o1 ? ((o1.ccy - a.y) / H) * 2 : 0;
      x[4] = o2 ? ((o2.ccy - a.y) / H) * 2 : 0;
      x[5] = (o1 ? o1.g : def.params.gap) / 220;
      x[6] = c ? clamp((c.x - w.dist - FX) / W, -0.3, 1) : 1;
      x[7] = c ? ((c.y - a.y) / H) * 2 : 0;
    },
    stepAgent(w, a, out, def, dt) {
      const p = def.params;
      if (out[0] > 0.5) a.vy = -p.flap;
      a.vy += p.gravity * dt;
      a.y += a.vy * dt;
      if (a.y < FR) { a.y = FR; a.vy = 0; a.dead = true; return; }
      if (a.y > FH - FR) { a.y = FH - FR; a.vy = -p.flap; a.dead = true; return; }
      const cx = w.dist + FX;
      for (const o of w.obs) {
        if (o.x > cx + FR) break;
        if (o.x + o.w < cx - FR) continue;
        if (o.t === 'coin') {
          if (!a.got[o.id] && Math.abs(a.y - o.y) < FR + 11) { a.got[o.id] = 1; a.coins++; }
        } else if (a.y - FR + 2 < o.ccy - o.g / 2 || a.y + FR - 2 > o.ccy + o.g / 2) { a.dead = true; return; }
      }
    },
    agentPos(w, a) { return { x: FX, y: a.y, top: a.y - FR }; },
    box(o) { return o.t === 'coin' ? { y: o.y - 11, h: 22 } : { y: 0, h: FH }; },
    place(it, y) {
      if (it.t === 'coin') it.y = clamp(snap(y, 5), 20, FH - 20);
      else it.cy = clamp(snap(y, 5), 60, FH - 60);
    },
    bg(ctx, th, dist, VW) { scene(ctx, th, dist, VW, FH); },
    drawObs(ctx, o, sx, th, t, view, def) {
      if (o.t === 'coin') { if (!taken(view, o)) coin(ctx, sx + 11, o.y, t); return; }
      const g = o.g || (o.gap >= 60 ? o.gap : def ? def.params.gap : 135), cy = o.ccy == null ? o.cy : o.ccy;
      const top = cy - g / 2, bot = cy + g / 2, col = o.amp ? th.obs2 : th.obs;
      block(ctx, sx + 4, -620, o.w - 8, top + 610, col, 4);
      block(ctx, sx, top - 22, o.w, 22, col, 6);
      block(ctx, sx + 4, bot + 10, o.w - 8, FH - bot - 8, col, 4);
      block(ctx, sx, bot, o.w, 22, col, 6);
    },
    draw(ctx, w, agents, view) {
      const th = view.th;
      scene(ctx, th, w.dist, view.VW, FH);
      for (const o of w.obs) if (o.x - w.dist < view.VW) this.drawObs(ctx, o, o.x - w.dist, th, w.t, view);
      ctx.fillStyle = th.top; ctx.fillRect(0, FH, view.VW, 9);
      ctx.fillStyle = INK; ctx.fillRect(0, FH - 2, view.VW, 3);
      eachAgent(ctx, agents, view, (a) => {
        const tilt = clamp(a.vy / 700, -0.5, 0.9);
        ctx.save();
        ctx.translate(FX, a.y);
        ctx.rotate(tilt);
        ctx.fillStyle = '#ff9f1c'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(10, -3); ctx.lineTo(23, 2); ctx.lineTo(10, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, FR, 0, 6.2832);
        ctx.fillStyle = 'hsl(' + a.hue + ',88%,62%)'; ctx.fill();
        ctx.lineWidth = 3; ctx.stroke();
        ctx.fillStyle = 'hsl(' + a.hue + ',80%,46%)';
        const up = a.vy < 0 ? -11 : 8;
        ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(2, 0); ctx.lineTo(-8, up); ctx.closePath(); ctx.fill();
        ctx.lineWidth = 2.5; ctx.stroke();
        eye(ctx, 5, -5, 5);
        ctx.restore();
        hat(ctx, FX, a.y - FR - 1, a, view.look);
      });
    },
  });

  // ───────────────────────── ESQUIVA ─────────────────────────
  const DY = H - 50, DS = 30;
  NL.types.dodger = Object.assign({}, base, {
    name: 'Esquiva', icon: '☄️',
    desc: 'Blocos caem do céu. A IA anda pros lados pra não ser esmagada.',
    nIn: 10, nOut: 2,
    inputLabels: ['minha posição', 'bloco 1 ↔', 'bloco 1 perto', 'bloco 1 larg.', 'bloco 2 ↔', 'bloco 2 perto', 'bloco 2 larg.', 'velocidade', 'moeda ↔', 'moeda perto'],
    outputLabels: ['esquerda', 'direita'],
    controls: [
      { label: '◀', out: 0, keys: ['ArrowLeft'] },
      { label: '▶', out: 1, keys: ['ArrowRight'] },
    ],
    loopLen: 0, splitCtl: true, shapes: true,
    pieces: [],
    params: [
      { key: 'fall', label: 'Velocidade da queda', min: 100, max: 500, step: 10, def: 220 },
      { key: 'accel', label: 'Aceleração', min: 0, max: 20, step: 1, def: 5 },
      { key: 'move', label: 'Velocidade do personagem', min: 150, max: 600, step: 10, def: 320 },
      { key: 'rate', label: 'Blocos por segundo', min: 0.5, max: 5, step: 0.1, def: 1.6, random: true },
      { key: 'size', label: 'Largura dos blocos', min: 30, max: 120, step: 5, def: 60, random: true },
      { key: 'aim', label: 'Blocos mirando nas IAs (%)', min: 0, max: 100, step: 5, def: 50, random: true },
      { key: 'coins', label: 'Moedas por segundo', min: 0, max: 2, step: 0.1, def: 0.3, random: true },
    ],
    presets: {
      'Fácil': { fall: 160, rate: 1, size: 50, accel: 2, aim: 30 },
      'Normal': {},
      'Difícil': { fall: 300, rate: 2.4, accel: 8, aim: 60 },
      'Insano': { fall: 380, rate: 3.4, size: 80, accel: 12, aim: 75 },
    },
    init(w, def) { w.acc = 0.5; w.cacc = 0; w.speed = def.params.fall; },
    spawn() {},
    newAgent() { return { x: W / 2 - DS / 2, dir: 0, dead: false }; },
    step(w, def, dt, agents) {
      const p = def.params;
      w.t += dt;
      w.dist += 100 * dt;
      w.speed = Math.min(900, p.fall + p.accel * w.t);
      w.acc += p.rate * dt;
      while (w.acc >= 1) {
        w.acc -= 1;
        const bw = p.size * (0.6 + 0.8 * w.rnd());
        let x = w.rnd() * (W - bw);
        const tgt = agents[Math.floor(w.rnd() * agents.length)];
        if (w.rnd() * 100 < p.aim && tgt && !tgt.dead) x = clamp(tgt.x + DS / 2 - bw / 2 + (w.rnd() - 0.5) * 40, 0, W - bw);
        w.obs.push({ x, y: -40, w: bw, h: 28, k: w.rnd() < 0.3 });
      }
      w.cacc += p.coins * dt;
      while (w.cacc >= 1) { w.cacc -= 1; w.obs.push({ t: 'coin', id: w.cid++, x: 10 + w.rnd() * (W - 42), y: -40, w: 22, h: 22 }); }
      for (const o of w.obs) o.y += w.speed * dt;
      while (w.obs.length && w.obs[0].y > H) w.obs.shift();
    },
    sense(w, a, def, x) {
      let o1 = null, o2 = null, c = null;
      for (const o of w.obs) {
        if (o.y > DY) continue;
        if (o.t === 'coin') { if (!a.got[o.id] && (!c || o.y > c.y)) c = o; continue; }
        if (!o1 || o.y > o1.y) { o2 = o1; o1 = o; }
        else if (!o2 || o.y > o2.y) o2 = o;
      }
      const cx = a.x + DS / 2;
      x[0] = (cx / W) * 2 - 1;
      x[1] = o1 ? clamp((o1.x + o1.w / 2 - cx) / 200, -1, 1) : 0;
      x[2] = o1 ? clamp(1 - (DY - o1.y) / H, 0, 1) : 0;
      x[3] = o1 ? o1.w / 120 : 0;
      x[4] = o2 ? clamp((o2.x + o2.w / 2 - cx) / 200, -1, 1) : 0;
      x[5] = o2 ? clamp(1 - (DY - o2.y) / H, 0, 1) : 0;
      x[6] = o2 ? o2.w / 120 : 0;
      x[7] = w.speed / 900;
      x[8] = c ? clamp((c.x + 11 - cx) / 200, -1, 1) : 0;
      x[9] = c ? clamp(1 - (DY - c.y) / H, 0, 1) : 0;
    },
    stepAgent(w, a, out, def, dt) {
      a.dir = (out[1] > 0.5 ? 1 : 0) - (out[0] > 0.5 ? 1 : 0);
      a.x = clamp(a.x + a.dir * def.params.move * dt, 0, W - DS);
      for (const o of w.obs) {
        if (!(o.y + o.h > DY - DS + 4 && o.y < DY && o.x < a.x + DS - 4 && o.x + o.w > a.x + 4)) continue;
        if (o.t === 'coin') { if (!a.got[o.id]) { a.got[o.id] = 1; a.coins++; } }
        else { a.dead = true; return; }
      }
    },
    ox(VW) { return Math.max(0, (VW - W) / 2); },
    agentPos(w, a, VW) { return { x: this.ox(VW) + a.x + DS / 2, y: DY - DS / 2, top: DY - DS }; },
    draw(ctx, w, agents, view) {
      const th = view.th, ox = this.ox(view.VW);
      scene(ctx, th, w.t * 40, view.VW, DY);
      ctx.save();
      ctx.translate(ox, 0);
      for (const o of w.obs) {
        if (o.t === 'coin') { if (!taken(view, o)) coin(ctx, o.x + 11, o.y + 11, w.t); }
        else block(ctx, o.x, o.y, o.w, o.h, o.k ? th.obs2 : th.obs, 8);
      }
      eachAgent(ctx, agents, view, (a) => blob(ctx, a.x, DY - DS, DS, DS, a, a.dir ? w.t * 22 + a.idx : 1.57, view.look));
      ctx.restore();
      if (ox > 0) {
        block(ctx, ox - 22, -620, 20, DY + 624, th.near, 4);
        block(ctx, ox + W + 2, -620, 20, DY + 624, th.near, 4);
      }
    },
  });

  // ───────────────────────── PISTAS ─────────────────────────
  const LT = 70, LH = 80, CW = 44;
  const laneY = (l) => LT + LH / 2 + l * LH;
  const laneAt = (y) => clamp(Math.floor((y - LT) / LH), 0, 2);
  const LEN = [{ key: 'w', label: 'Comprimento', min: 30, max: 240, step: 2 }];
  NL.types.lanes = Object.assign({}, base, {
    name: 'Pistas', icon: '🚗',
    desc: 'Estrada de 3 pistas vista de cima. A IA troca de pista pra desviar dos bloqueios.',
    nIn: 8, nOut: 2,
    inputLabels: ['minha pista', 'livre em cima', 'livre no meio', 'livre embaixo', 'velocidade', 'moeda em cima', 'moeda no meio', 'moeda embaixo'],
    outputLabels: ['subir', 'descer'],
    controls: [
      { label: '▼', out: 1, keys: ['ArrowDown'] },
      { label: '▲', out: 0, keys: ['ArrowUp'] },
    ],
    loopLen: 2400,
    pieces: [
      { id: 'cone', label: 'Bloqueio', d: { w: 42, lane: 1 }, freq: 6, props: LEN },
      { id: 'truck', label: 'Caminhão', d: { w: 120, lane: 1 }, freq: 2, props: LEN },
      { id: 'coin', label: 'Moeda', d: { w: 22, lane: 1 }, freq: 3, props: [] },
    ],
    topFill: (th) => th.near,
    params: [
      { key: 'speed', label: 'Velocidade inicial', min: 150, max: 600, step: 10, def: 300 },
      { key: 'accel', label: 'Aceleração', min: 0, max: 30, step: 1, def: 8 },
      { key: 'maxSpeed', label: 'Velocidade máxima', min: 300, max: 1400, step: 20, def: 900 },
      { key: 'agility', label: 'Rapidez na troca de pista', min: 3, max: 14, step: 0.5, def: 7 },
      { key: 'spacing', label: 'Distância entre bloqueios', min: 160, max: 500, step: 10, def: 280, random: true },
      { key: 'double', label: 'Chance de bloqueio duplo (%)', min: 0, max: 100, step: 5, def: 40, random: true },
    ],
    presets: {
      'Fácil': { speed: 240, accel: 4, spacing: 360, double: 15 },
      'Normal': {},
      'Difícil': { speed: 380, accel: 12, spacing: 240, double: 60 },
      'Insano': { speed: 480, accel: 18, spacing: 200, double: 80, maxSpeed: 1300 },
    },
    spawn(w, def, limit) {
      const p = def.params, hz = this.pieces.filter((q) => q.id !== 'coin'), cc = coinChance(this, def);
      while (w.nextX < limit) {
        const free = Math.floor(w.rnd() * 3), two = w.rnd() * 100 < p.double;
        const keep = (free + 1 + Math.floor(w.rnd() * 2)) % 3;
        let mw = 0;
        for (let l = 0; l < 3; l++) {
          if (l === free || !(two || l === keep)) continue;
          const q = pickW(hz, def, w.rnd);
          if (q) mw = Math.max(mw, this.add(w, this.make(q.id, { x: w.nextX, lane: l }), def).w);
        }
        const gap = p.spacing * (0.8 + 0.4 * w.rnd()) * (0.5 + (0.5 * w.speed) / p.speed);
        if (w.rnd() < cc) this.add(w, this.make('coin', { x: Math.round(w.nextX + mw + gap / 2), lane: Math.floor(w.rnd() * 3) }), def);
        w.nextX += mw + gap;
      }
    },
    newAgent() { return { lane: 1, ly: 1, dead: false }; },
    step(w, def, dt) {
      const p = def.params;
      w.t += dt;
      w.speed = Math.min(Math.max(p.maxSpeed, p.speed), p.speed + p.accel * w.t);
      w.dist += w.speed * dt;
      this.grow(w, def);
      while (w.obs.length && w.obs[0].x + 240 < w.dist - 60) w.obs.shift();
    },
    sense(w, a, def, x) {
      const front = w.dist + AX;
      x[0] = a.ly - 1;
      x[1] = x[2] = x[3] = x[5] = x[6] = x[7] = 1;
      for (const o of w.obs) {
        if (o.x + o.w < front) continue;
        const d = clamp((o.x - front - CW) / W, 0, 1);
        if (d >= 1) break;
        const i = (o.t === 'coin' ? 5 : 1) + o.lane;
        if (o.t === 'coin' && a.got[o.id]) continue;
        if (x[i] === 1) x[i] = d;
      }
      x[4] = w.speed / 1400;
    },
    stepAgent(w, a, out, def, dt) {
      if (Math.abs(a.ly - a.lane) < 0.05) {
        if (out[0] > 0.5 && out[1] <= 0.5 && a.lane > 0) a.lane--;
        else if (out[1] > 0.5 && out[0] <= 0.5 && a.lane < 2) a.lane++;
      }
      const d = a.lane - a.ly, s = def.params.agility * dt;
      a.ly += Math.abs(d) <= s ? d : Math.sign(d) * s;
      const x0 = w.dist + AX + 4, x1 = w.dist + AX + CW - 4;
      for (const o of w.obs) {
        if (o.x > x1) break;
        if (o.x + o.w < x0) continue;
        if (o.t === 'coin') {
          if (!a.got[o.id] && Math.abs(a.ly - o.lane) < 0.5) { a.got[o.id] = 1; a.coins++; }
        } else if (Math.abs(a.ly - o.lane) < 0.62) { a.dead = true; return; }
      }
    },
    agentPos(w, a) { return { x: AX + CW / 2, y: laneY(a.ly), top: laneY(a.ly) - 17 }; },
    box(o) { return o.t === 'coin' ? { y: laneY(o.lane) - 11, h: 22 } : { y: laneY(o.lane) - 27, h: 54 }; },
    place(it, y) { it.lane = laneAt(y); },
    bg(ctx, th, dist, VW) {
      ctx.fillStyle = th.near;
      ctx.fillRect(0, -600, VW, H + 600);
      ctx.fillStyle = th.far;
      for (let x = -mod(dist, 170); x < VW; x += 170) {
        ctx.beginPath(); ctx.arc(x + 40, 34, 16, 0, 6.2832); ctx.arc(x + 120, H - 18, 13, 0, 6.2832); ctx.fill();
      }
      ctx.fillStyle = th.road;
      ctx.fillRect(0, LT, VW, LH * 3);
      ctx.fillStyle = INK;
      ctx.fillRect(0, LT - 3, VW, 4);
      ctx.fillRect(0, LT + LH * 3 - 1, VW, 4);
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      for (let x = -mod(dist, 90); x < VW; x += 90) {
        ctx.fillRect(x, LT + LH - 3, 44, 6);
        ctx.fillRect(x, LT + LH * 2 - 3, 44, 6);
      }
    },
    drawObs(ctx, o, sx, th, t, view) {
      const y = laneY(o.lane);
      if (o.t === 'coin') { if (!taken(view, o)) coin(ctx, sx + 11, y, t); return; }
      block(ctx, sx, y - 27, o.w, 54, o.t === 'truck' ? th.obs2 : th.obs, 9);
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.fillRect(sx + 5, y - 5, o.w - 10, 10);
    },
    draw(ctx, w, agents, view) {
      const th = view.th;
      this.bg(ctx, th, w.dist, view.VW);
      for (const o of w.obs) if (o.x - w.dist < view.VW) this.drawObs(ctx, o, o.x - w.dist, th, w.t, view);
      eachAgent(ctx, agents, view, (a) => {
        const y = laneY(a.ly);
        ctx.fillStyle = INK;
        rr(ctx, AX + 5, y - 20, 11, 40, 4); ctx.fill();
        rr(ctx, AX + 28, y - 20, 11, 40, 4); ctx.fill();
        rr(ctx, AX, y - 15, CW, 30, 9);
        ctx.fillStyle = 'hsl(' + a.hue + ',88%,62%)'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
        rr(ctx, AX + 22, y - 10, 13, 20, 4);
        ctx.fillStyle = '#d9f7ff'; ctx.fill();
        ctx.lineWidth = 2; ctx.stroke();
        hat(ctx, AX + 12, y - 14, a, view.look);
      });
    },
  });
})();
