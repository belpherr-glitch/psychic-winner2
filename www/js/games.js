// EvoLab: cenários e moldes de jogo. Cada molde define mundo, sensores (entradas da rede),
// ações (saídas da rede), física e desenho. Nada de engine: só parâmetros editáveis.
(function () {
  const NL = window.NL, W = NL.W, H = NL.H;
  const INK = (NL.INK = '#1d1a39');
  const AHEAD = 1300; // até onde o mundo é gerado à frente (cobre telas bem largas)
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  NL.themes = {
    campo: { name: 'Campo', sky: ['#5fcdf5', '#d9f7ff'], sun: '#ffd93d', far: '#a5e3a0', near: '#62c370', ground: '#f3cf8e', top: '#4fb061', obs: '#ff5d8f', obs2: '#8338ec', cloud: '#ffffff', road: '#5b5f7a' },
    deserto: { name: 'Deserto', sky: ['#ff9e5e', '#ffe3ad'], sun: '#fff6c2', far: '#f7b267', near: '#e07a3f', ground: '#f6d78f', top: '#d08c45', obs: '#2a9d8f', obs2: '#e63946', cloud: '#fff1d6', road: '#7a5c48' },
    noite: { name: 'Noite', sky: ['#120f38', '#4a3b8f'], sun: '#f5f3ce', far: '#39348a', near: '#2a2569', ground: '#463f96', top: '#7a70d6', obs: '#ff5d8f', obs2: '#ffc93c', cloud: '#5a519e', stars: true, road: '#25224d' },
    neve: { name: 'Neve', sky: ['#8fcaff', '#f4fbff'], sun: '#ffffff', far: '#e6f2ff', near: '#c4dcf5', ground: '#ffffff', top: '#a9c9e8', obs: '#3d5a80', obs2: '#ee6c4d', cloud: '#ffffff', road: '#6f86a3' },
    doce: { name: 'Doce', sky: ['#ff9ec4', '#ffe5ec'], sun: '#fffbe0', far: '#d3b8e6', near: '#b392d6', ground: '#fdf0d5', top: '#ff7aa2', obs: '#06d6a0', obs2: '#8338ec', cloud: '#ffffff', road: '#8d6aa8' },
  };

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
  const mod = (a, n) => ((a % n) + n) % n;

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
    ctx.arc(Math.min(VW, 2000) - 120, 64, 30, 0, 6.2832);
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

  // bichinho: corpo arredondado, olho e perninhas
  function blob(ctx, x, y, w, h, a, legs) {
    ctx.lineCap = 'round';
    if (legs >= 0) {
      ctx.strokeStyle = INK; ctx.lineWidth = 4;
      const s = Math.sin(legs) * 5;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.3, y + h - 3); ctx.lineTo(x + w * 0.3 + s, y + h + 6);
      ctx.moveTo(x + w * 0.7, y + h - 3); ctx.lineTo(x + w * 0.7 - s, y + h + 6);
      ctx.stroke();
      h -= 4;
    }
    rr(ctx, x, y, w, h, 10);
    ctx.fillStyle = 'hsl(' + a.hue + ',88%,62%)';
    ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.3)';
    rr(ctx, x + 4, y + 4, w * 0.4, 5, 3);
    ctx.fill();
    eye(ctx, x + w - 9, y + Math.min(12, h * 0.45), 6);
    if (a.crown) crown(ctx, x + w / 2, y - 3);
  }

  // as IAs não seguidas ficam translúcidas; a seguida é desenhada por cima
  function eachAgent(ctx, agents, view, fn) {
    if (!view.solo) {
      if (!view.solid) ctx.globalAlpha = 0.35;
      let n = 0;
      for (const a of agents) {
        if (a.dead || a === view.focus) continue;
        fn(a);
        if (++n > 120) break;
      }
      ctx.globalAlpha = 1;
    }
    if (view.focus && !view.focus.dead) fn(view.focus);
  }

  // pista montada: repete os itens do editor em loop
  function spawnTrack(T, w, def) {
    const tr = w.track;
    if (!tr.length) return;
    for (;;) {
      const it = tr[w.ti];
      const x = W + 200 + w.loop * T.loopLen + it.x;
      if (x > w.dist + AHEAD) break;
      const o = T.trackObs(it, def);
      o.x = x;
      w.obs.push(o);
      if (++w.ti >= tr.length) { w.ti = 0; w.loop++; }
    }
  }
  function baseWorld(def, rnd) {
    return {
      dist: 0, t: 0, speed: 0, obs: [], rnd, loop: 0, ti: 0,
      track: def.mode === 'track' ? def.track.slice().sort((a, b) => a.x - b.x) : null,
    };
  }
  function cull(w) { while (w.obs.length && w.obs[0].x + w.obs[0].w < w.dist - 60) w.obs.shift(); }

  // ───────────────────────── CORREDOR ─────────────────────────
  const GY = 300, AX = 90, AW = 32;
  const RP = {
    low: { w: 26, h: 40, e: 0 },
    tall: { w: 26, h: 62, e: 0 },
    wide: { w: 66, h: 30, e: 0 },
    fly: { w: 46, h: 24, e: 30 },
  };
  NL.types.runner = {
    name: 'Corredor', icon: '🏃',
    desc: 'Corre sozinho. A IA decide quando pular e quando abaixar.',
    nIn: 7, nOut: 2,
    inputLabels: ['dist. obstáculo', 'largura', 'altura', 'voando?', 'velocidade', 'minha altura', 'dist. 2º'],
    outputLabels: ['pular', 'abaixar'],
    controls: [
      { label: 'Abaixar', out: 1, keys: ['ArrowDown'] },
      { label: 'Pular', out: 0, keys: [' ', 'ArrowUp'] },
    ],
    loopLen: 2400,
    pieces: [
      { id: 'low', label: 'Baixo' },
      { id: 'tall', label: 'Alto' },
      { id: 'wide', label: 'Largo' },
      { id: 'fly', label: 'Voador' },
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
    trackObs(it) {
      const p = RP[it.t] || RP.low;
      return { w: p.w, h: p.h, e: p.e, t: it.t };
    },
    newWorld(def, rnd) {
      const w = baseWorld(def, rnd);
      w.speed = def.params.speed;
      w.nextX = W + 200;
      return w;
    },
    newAgent() { return { y: 0, vy: 0, duck: false, dead: false }; },
    step(w, def, dt) {
      const p = def.params;
      w.t += dt;
      w.speed = Math.min(Math.max(p.maxSpeed, p.speed), p.speed + p.accel * w.t);
      w.dist += w.speed * dt;
      if (w.track) spawnTrack(this, w, def);
      else {
        const on = this.pieces.filter((q) => def.pieces[q.id] !== false);
        const list = on.length ? on : this.pieces;
        while (w.nextX < w.dist + AHEAD) {
          const o = this.trackObs({ t: list[Math.floor(w.rnd() * list.length)].id });
          o.x = w.nextX;
          w.obs.push(o);
          const lo = Math.min(p.gapMin, p.gapMax), hi = Math.max(p.gapMin, p.gapMax);
          w.nextX += o.w + (lo + w.rnd() * (hi - lo)) * (0.5 + (0.5 * w.speed) / p.speed);
        }
      }
      cull(w);
    },
    sense(w, a, def, x) {
      const front = w.dist + AX;
      let o1 = null, o2 = null;
      for (const o of w.obs) {
        if (o.x + o.w < front) continue;
        if (!o1) o1 = o;
        else { o2 = o; break; }
      }
      x[0] = o1 ? clamp((o1.x - front - AW) / W, -0.2, 1) : 1;
      x[1] = o1 ? o1.w / 80 : 0;
      x[2] = o1 ? o1.h / 80 : 0;
      x[3] = o1 ? o1.e / 30 : 0;
      x[4] = w.speed / 1200;
      x[5] = a.y / 120;
      x[6] = o2 ? clamp((o2.x - front - AW) / W, 0, 1) : 1;
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
        if (a.y + 2 < o.e + o.h && a.y + h - 2 > o.e) { a.dead = true; return; }
      }
    },
    agentPos(w, a) { return { x: AX + AW / 2, y: GY - a.y - (a.duck ? 11 : 22), top: GY - a.y - (a.duck ? 22 : 44) }; },
    bg(ctx, th, dist, VW) { scene(ctx, th, dist, VW, GY); },
    drawObs(ctx, o, sx, th, t) {
      if (o.e > 0) {
        const f = Math.sin((t || 0) * 18) * 7;
        ctx.fillStyle = th.obs2; ctx.strokeStyle = INK; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(sx + 12, GY - o.e - o.h + 6); ctx.lineTo(sx + 26, GY - o.e - o.h - 8 - f); ctx.lineTo(sx + 34, GY - o.e - o.h + 6);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        block(ctx, sx, GY - o.e - o.h, o.w, o.h, th.obs2, 11);
        eye(ctx, sx + 10, GY - o.e - o.h + 11, 5);
      } else block(ctx, sx, GY - o.h, o.w, o.h + 4, th.obs);
    },
    draw(ctx, w, agents, view) {
      const th = view.th;
      scene(ctx, th, w.dist, view.VW, GY);
      for (const o of w.obs) if (o.x - w.dist < view.VW) this.drawObs(ctx, o, o.x - w.dist, th, w.t);
      eachAgent(ctx, agents, view, (a) => {
        const h = a.duck ? 22 : 44;
        blob(ctx, AX, GY - a.y - h, AW, h, a, a.y > 0 ? 1.2 : w.dist * 0.09 + a.idx);
      });
    },
  };

  // ───────────────────────── VOADOR ─────────────────────────
  const FX = 130, FR = 14, FH = H - 50, PW = 62;
  NL.types.flyer = {
    name: 'Voador', icon: '🐤',
    desc: 'Cai o tempo todo. A IA decide quando bater asa pra passar pelas aberturas.',
    nIn: 6, nOut: 1,
    inputLabels: ['minha altura', 'vel. vertical', 'dist. barreira', 'abertura ↕', '2ª abertura ↕', 'tam. abertura'],
    outputLabels: ['bater asa'],
    controls: [{ label: 'Bater asa', out: 0, keys: [' ', 'ArrowUp'] }],
    loopLen: 2400,
    pieces: [{ id: 'pipe', label: 'Barreira' }],
    params: [
      { key: 'speed', label: 'Velocidade', min: 100, max: 400, step: 10, def: 190 },
      { key: 'gravity', label: 'Gravidade', min: 600, max: 2500, step: 50, def: 1400 },
      { key: 'flap', label: 'Força da asa', min: 200, max: 600, step: 10, def: 380 },
      { key: 'gap', label: 'Tamanho da abertura', min: 90, max: 200, step: 5, def: 135 },
      { key: 'spacing', label: 'Distância entre barreiras', min: 180, max: 450, step: 10, def: 260, random: true },
    ],
    trackObs(it, def) {
      const g = def.params.gap;
      return { w: PW, gap: g, cy: clamp(it.y, g / 2 + 15, FH - g / 2 - 15) };
    },
    newWorld(def, rnd) {
      const w = baseWorld(def, rnd);
      w.speed = def.params.speed;
      w.nextX = W + 100;
      return w;
    },
    newAgent() { return { y: FH / 2, vy: 0, dead: false }; },
    step(w, def, dt) {
      const p = def.params;
      w.t += dt;
      w.dist += p.speed * dt;
      if (w.track) spawnTrack(this, w, def);
      else
        while (w.nextX < w.dist + AHEAD) {
          const m = p.gap / 2 + 22;
          w.obs.push({ x: w.nextX, w: PW, gap: p.gap, cy: m + w.rnd() * (FH - 2 * m) });
          w.nextX += PW + p.spacing;
        }
      cull(w);
    },
    sense(w, a, def, x) {
      const back = w.dist + FX - FR;
      let o1 = null, o2 = null;
      for (const o of w.obs) {
        if (o.x + o.w < back) continue;
        if (!o1) o1 = o;
        else { o2 = o; break; }
      }
      x[0] = a.y / H;
      x[1] = clamp(a.vy / 600, -1.5, 1.5);
      x[2] = o1 ? clamp((o1.x - w.dist - FX) / W, -0.3, 1) : 1;
      x[3] = o1 ? ((o1.cy - a.y) / H) * 2 : 0;
      x[4] = o2 ? ((o2.cy - a.y) / H) * 2 : 0;
      x[5] = def.params.gap / 220;
    },
    stepAgent(w, a, out, def, dt) {
      const p = def.params;
      if (out[0] > 0.5) a.vy = -p.flap;
      a.vy += p.gravity * dt;
      a.y += a.vy * dt;
      if (a.y < FR || a.y > FH - FR) { a.dead = true; return; }
      const cx = w.dist + FX;
      for (const o of w.obs) {
        if (o.x > cx + FR) break;
        if (o.x + o.w < cx - FR) continue;
        if (a.y - FR + 2 < o.cy - o.gap / 2 || a.y + FR - 2 > o.cy + o.gap / 2) { a.dead = true; return; }
      }
    },
    agentPos(w, a) { return { x: FX, y: a.y, top: a.y - FR }; },
    bg(ctx, th, dist, VW) { scene(ctx, th, dist, VW, FH); },
    drawObs(ctx, o, sx, th) {
      const top = o.cy - o.gap / 2, bot = o.cy + o.gap / 2;
      block(ctx, sx + 4, -620, o.w - 8, top + 610, th.obs, 4);
      block(ctx, sx, top - 22, o.w, 22, th.obs, 6);
      block(ctx, sx + 4, bot + 10, o.w - 8, FH - bot - 8, th.obs, 4);
      block(ctx, sx, bot, o.w, 22, th.obs, 6);
    },
    draw(ctx, w, agents, view) {
      const th = view.th;
      scene(ctx, th, w.dist, view.VW, FH);
      for (const o of w.obs) if (o.x - w.dist < view.VW) this.drawObs(ctx, o, o.x - w.dist, th);
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
        if (a.crown) crown(ctx, FX, a.y - FR - 2);
      });
    },
  };

  // ───────────────────────── ESQUIVA ─────────────────────────
  const DY = H - 50, DS = 30;
  NL.types.dodger = {
    name: 'Esquiva', icon: '☄️',
    desc: 'Blocos caem do céu. A IA anda pros lados pra não ser esmagada.',
    nIn: 8, nOut: 2,
    inputLabels: ['minha posição', 'bloco 1 ↔', 'bloco 1 perto', 'bloco 1 larg.', 'bloco 2 ↔', 'bloco 2 perto', 'bloco 2 larg.', 'velocidade'],
    outputLabels: ['esquerda', 'direita'],
    controls: [
      { label: '◀', out: 0, keys: ['ArrowLeft'] },
      { label: '▶', out: 1, keys: ['ArrowRight'] },
    ],
    loopLen: 0,
    splitCtl: true,
    pieces: [],
    params: [
      { key: 'fall', label: 'Velocidade da queda', min: 100, max: 500, step: 10, def: 220 },
      { key: 'accel', label: 'Aceleração', min: 0, max: 20, step: 1, def: 5 },
      { key: 'rate', label: 'Blocos por segundo', min: 0.5, max: 5, step: 0.1, def: 1.6 },
      { key: 'size', label: 'Largura dos blocos', min: 30, max: 120, step: 5, def: 60 },
      { key: 'move', label: 'Velocidade da IA', min: 150, max: 600, step: 10, def: 320 },
    ],
    newWorld(def, rnd) {
      const w = baseWorld(def, rnd);
      w.acc = 0.5;
      w.speed = def.params.fall;
      return w;
    },
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
        if (w.rnd() < 0.5 && tgt && !tgt.dead) x = clamp(tgt.x + DS / 2 - bw / 2 + (w.rnd() - 0.5) * 40, 0, W - bw);
        w.obs.push({ x, y: -40, w: bw, h: 28, k: w.rnd() < 0.3 });
      }
      for (const o of w.obs) o.y += w.speed * dt;
      while (w.obs.length && w.obs[0].y > H) w.obs.shift();
    },
    sense(w, a, def, x) {
      let o1 = null, o2 = null;
      for (const o of w.obs) {
        if (o.y > DY) continue;
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
    },
    stepAgent(w, a, out, def, dt) {
      a.dir = (out[1] > 0.5 ? 1 : 0) - (out[0] > 0.5 ? 1 : 0);
      a.x = clamp(a.x + a.dir * def.params.move * dt, 0, W - DS);
      for (const o of w.obs)
        if (o.y + o.h > DY - DS + 4 && o.y < DY && o.x < a.x + DS - 4 && o.x + o.w > a.x + 4) { a.dead = true; return; }
    },
    ox(VW) { return Math.max(0, (VW - W) / 2); },
    agentPos(w, a, VW) { return { x: this.ox(VW) + a.x + DS / 2, y: DY - DS / 2, top: DY - DS }; },
    draw(ctx, w, agents, view) {
      const th = view.th, ox = this.ox(view.VW);
      scene(ctx, th, w.t * 40, view.VW, DY);
      ctx.save();
      ctx.translate(ox, 0);
      for (const o of w.obs) block(ctx, o.x, o.y, o.w, o.h, o.k ? th.obs2 : th.obs, 8);
      eachAgent(ctx, agents, view, (a) => blob(ctx, a.x, DY - DS, DS, DS, a, a.dir ? w.t * 22 + a.idx : 1.57));
      ctx.restore();
      if (ox > 0) {
        // paredes nas bordas do campo
        block(ctx, ox - 22, -620, 20, DY + 624, th.near, 4);
        block(ctx, ox + W + 2, -620, 20, DY + 624, th.near, 4);
      }
    },
  };

  // ───────────────────────── PISTAS ─────────────────────────
  const LT = 70, LH = 80, CW = 44, OW = 42;
  const laneY = (l) => LT + LH / 2 + l * LH;
  NL.types.lanes = {
    name: 'Pistas', icon: '🚗',
    desc: 'Estrada de 3 pistas vista de cima. A IA troca de pista pra desviar dos bloqueios.',
    nIn: 5, nOut: 2,
    inputLabels: ['minha pista', 'livre em cima', 'livre no meio', 'livre embaixo', 'velocidade'],
    outputLabels: ['subir', 'descer'],
    controls: [
      { label: '▼', out: 1, keys: ['ArrowDown'] },
      { label: '▲', out: 0, keys: ['ArrowUp'] },
    ],
    loopLen: 2400,
    pieces: [{ id: 'cone', label: 'Bloqueio' }],
    topFill: (th) => th.near,
    params: [
      { key: 'speed', label: 'Velocidade inicial', min: 150, max: 600, step: 10, def: 300 },
      { key: 'accel', label: 'Aceleração', min: 0, max: 30, step: 1, def: 8 },
      { key: 'maxSpeed', label: 'Velocidade máxima', min: 300, max: 1400, step: 20, def: 900 },
      { key: 'agility', label: 'Rapidez na troca de pista', min: 3, max: 14, step: 0.5, def: 7 },
      { key: 'spacing', label: 'Distância entre bloqueios', min: 160, max: 500, step: 10, def: 280, random: true },
      { key: 'double', label: 'Chance de bloqueio duplo (%)', min: 0, max: 100, step: 5, def: 40, random: true },
    ],
    trackObs(it) { return { w: OW, lane: clamp(Math.floor((it.y - LT) / LH), 0, 2) }; },
    trackHit(it, o, x, y) { return o.lane === clamp(Math.floor((y - LT) / LH), 0, 2); },
    newWorld(def, rnd) {
      const w = baseWorld(def, rnd);
      w.speed = def.params.speed;
      w.nextX = W + 200;
      return w;
    },
    newAgent() { return { lane: 1, ly: 1, dead: false }; },
    step(w, def, dt) {
      const p = def.params;
      w.t += dt;
      w.speed = Math.min(Math.max(p.maxSpeed, p.speed), p.speed + p.accel * w.t);
      w.dist += w.speed * dt;
      if (w.track) spawnTrack(this, w, def);
      else
        while (w.nextX < w.dist + AHEAD) {
          const free = Math.floor(w.rnd() * 3), two = w.rnd() * 100 < p.double;
          const keep = (free + 1 + Math.floor(w.rnd() * 2)) % 3;
          for (let l = 0; l < 3; l++) if (l !== free && (two || l === keep)) w.obs.push({ x: w.nextX, w: OW, lane: l });
          w.nextX += OW + p.spacing * (0.8 + 0.4 * w.rnd()) * (0.5 + (0.5 * w.speed) / p.speed);
        }
      cull(w);
    },
    sense(w, a, def, x) {
      const front = w.dist + AX;
      x[0] = a.ly - 1;
      x[1] = x[2] = x[3] = 1;
      let found = 0;
      for (const o of w.obs) {
        if (o.x + o.w < front) continue;
        const d = clamp((o.x - front - CW) / W, 0, 1);
        if (d >= 1) break;
        if (x[1 + o.lane] === 1) { x[1 + o.lane] = d; if (++found === 3) break; }
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
        if (Math.abs(a.ly - o.lane) < 0.62) { a.dead = true; return; }
      }
    },
    agentPos(w, a) { return { x: AX + CW / 2, y: laneY(a.ly), top: laneY(a.ly) - 17 }; },
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
    drawObs(ctx, o, sx, th) {
      const y = laneY(o.lane);
      block(ctx, sx, y - 27, o.w, 54, th.obs, 9);
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.fillRect(sx + 5, y - 5, o.w - 10, 10);
    },
    draw(ctx, w, agents, view) {
      const th = view.th;
      this.bg(ctx, th, w.dist, view.VW);
      for (const o of w.obs) if (o.x - w.dist < view.VW) this.drawObs(ctx, o, o.x - w.dist, th);
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
        if (a.crown) crown(ctx, AX + 12, y + 6);
      });
    },
  };
})();
