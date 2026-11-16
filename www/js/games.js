// EvoLab: moldes de jogo. Cada molde define mundo, sensores (entradas da rede),
// ações (saídas da rede), física e desenho. Nada de engine: só parâmetros editáveis.
(function () {
  const NL = window.NL, W = NL.W, H = NL.H;
  const BG = '#12151c', GROUND = '#232a3a', LINE = '#3a455e', OBS = '#e2586b', OBS2 = '#f2a65a';
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function stars(ctx, dist) {
    ctx.fillStyle = '#2b3347';
    for (let i = 0; i < 28; i++) {
      const x = (((i * 97.3 - dist * 0.15) % W) + W) % W;
      const y = (i * 53.7) % 240;
      ctx.fillRect(x, y + 10, 2, 2);
    }
  }

  // desenha as IAs: as não seguidas ficam translúcidas, a seguida fica por cima
  function eachAgent(ctx, agents, view, fn) {
    if (!view.solo) {
      ctx.globalAlpha = 0.3;
      let n = 0;
      for (const a of agents) {
        if (a.dead || a === view.focus) continue;
        fn(a, false);
        if (++n > 150) break;
      }
      ctx.globalAlpha = 1;
    }
    if (view.focus && !view.focus.dead) fn(view.focus, true);
  }

  function body(ctx, x, y, w, h, hue, focus) {
    rr(ctx, x, y, w, h, Math.min(7, h / 3));
    ctx.fillStyle = 'hsl(' + hue + ',70%,60%)';
    ctx.fill();
    if (focus) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + w - 11, y + 6, 6, 6);
    ctx.fillStyle = '#12151c';
    ctx.fillRect(x + w - 8, y + 8, 3, 3);
  }

  // pista fixa: repete os itens do editor em loop
  function spawnTrack(T, w, def) {
    const tr = w.track;
    if (!tr.length) return;
    for (;;) {
      const it = tr[w.ti];
      const x = W + 200 + w.loop * T.loopLen + it.x;
      if (x > w.dist + W + 100) break;
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

  // ───────────────────────── CORREDOR ─────────────────────────
  const GY = 300, AX = 90, AW = 30;
  const RP = {
    low: { w: 24, h: 40, e: 0 },
    tall: { w: 24, h: 62, e: 0 },
    wide: { w: 64, h: 30, e: 0 },
    fly: { w: 44, h: 24, e: 30 },
  };
  NL.types.runner = {
    name: 'Corredor',
    desc: 'Corre sozinho. A IA decide quando pular e quando abaixar.',
    nIn: 7, nOut: 2,
    inputLabels: ['dist. obstáculo', 'largura', 'altura', 'voando?', 'velocidade', 'minha altura', 'dist. 2º'],
    outputLabels: ['pular', 'abaixar'],
    controls: [
      { label: 'Pular', out: 0, keys: [' ', 'ArrowUp'] },
      { label: 'Abaixar', out: 1, keys: ['ArrowDown'] },
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
        while (w.nextX < w.dist + W + 100) {
          const id = list[Math.floor(w.rnd() * list.length)].id;
          const o = this.trackObs({ t: id });
          o.x = w.nextX;
          w.obs.push(o);
          const lo = Math.min(p.gapMin, p.gapMax), hi = Math.max(p.gapMin, p.gapMax);
          w.nextX += o.w + (lo + w.rnd() * (hi - lo)) * (0.5 + (0.5 * w.speed) / p.speed);
        }
      }
      while (w.obs.length && w.obs[0].x + w.obs[0].w < w.dist - 40) w.obs.shift();
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
      const h = a.duck ? 22 : 44, x0 = w.dist + AX + 3, x1 = w.dist + AX + AW - 3;
      for (const o of w.obs) {
        if (o.x > x1) break;
        if (o.x + o.w < x0) continue;
        if (a.y + 2 < o.e + o.h && a.y + h - 2 > o.e) { a.dead = true; return; }
      }
    },
    agentPos(w, a) { return { x: AX + AW / 2, y: GY - a.y - 22 }; },
    bg(ctx, dist, width) {
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, width, H);
      ctx.fillStyle = GROUND;
      ctx.fillRect(0, GY, width, H - GY);
      ctx.fillStyle = LINE;
      ctx.fillRect(0, GY, width, 2);
      for (let x = -(dist % 80); x < width; x += 80) ctx.fillRect(x, GY + 18, 30, 3);
    },
    drawObs(ctx, o, sx) {
      ctx.fillStyle = o.e > 0 ? OBS2 : OBS;
      rr(ctx, sx, GY - o.e - o.h, o.w, o.h, 5);
      ctx.fill();
    },
    draw(ctx, w, agents, view) {
      this.bg(ctx, w.dist, W);
      stars(ctx, w.dist);
      for (const o of w.obs) this.drawObs(ctx, o, o.x - w.dist);
      eachAgent(ctx, agents, view, (a, f) => {
        const h = a.duck ? 22 : 44;
        body(ctx, AX, GY - a.y - h, AW, h, a.hue, f);
      });
    },
  };

  // ───────────────────────── VOADOR ─────────────────────────
  const FX = 130, FR = 13, FH = H - 20, PW = 60;
  NL.types.flyer = {
    name: 'Voador',
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
      { key: 'gap', label: 'Tamanho da abertura', min: 90, max: 220, step: 5, def: 140 },
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
    newAgent() { return { y: H / 2 - 20, vy: 0, dead: false }; },
    step(w, def, dt) {
      const p = def.params;
      w.t += dt;
      w.dist += p.speed * dt;
      if (w.track) spawnTrack(this, w, def);
      else
        while (w.nextX < w.dist + W + 100) {
          const m = p.gap / 2 + 25;
          w.obs.push({ x: w.nextX, w: PW, gap: p.gap, cy: m + w.rnd() * (FH - 2 * m) });
          w.nextX += PW + p.spacing;
        }
      while (w.obs.length && w.obs[0].x + w.obs[0].w < w.dist - 40) w.obs.shift();
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
    agentPos(w, a) { return { x: FX, y: a.y }; },
    bg(ctx, dist, width) {
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, width, H);
      ctx.fillStyle = GROUND;
      ctx.fillRect(0, FH, width, H - FH);
      ctx.fillStyle = LINE;
      ctx.fillRect(0, FH, width, 2);
    },
    drawObs(ctx, o, sx) {
      ctx.fillStyle = OBS;
      const top = o.cy - o.gap / 2, bot = o.cy + o.gap / 2;
      rr(ctx, sx, -10, o.w, top + 10, 6);
      ctx.fill();
      rr(ctx, sx, bot, o.w, FH - bot + 10, 6);
      ctx.fill();
    },
    draw(ctx, w, agents, view) {
      this.bg(ctx, w.dist, W);
      stars(ctx, w.dist);
      for (const o of w.obs) this.drawObs(ctx, o, o.x - w.dist);
      ctx.fillStyle = GROUND;
      ctx.fillRect(0, FH + 2, W, H - FH);
      eachAgent(ctx, agents, view, (a, f) => {
        ctx.beginPath();
        ctx.arc(FX, a.y, FR, 0, 6.2832);
        ctx.fillStyle = 'hsl(' + a.hue + ',70%,60%)';
        ctx.fill();
        if (f) { ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke(); }
        ctx.fillStyle = '#fff';
        ctx.fillRect(FX + 3, a.y - 6, 6, 6);
        ctx.fillStyle = '#12151c';
        ctx.fillRect(FX + 6, a.y - 4, 3, 3);
        ctx.fillStyle = 'hsl(' + a.hue + ',70%,42%)';
        ctx.beginPath();
        const up = a.vy < 0 ? -9 : 7;
        ctx.moveTo(FX - 10, a.y);
        ctx.lineTo(FX + 1, a.y);
        ctx.lineTo(FX - 7, a.y + up);
        ctx.fill();
      });
    },
  };

  // ───────────────────────── ESQUIVA ─────────────────────────
  const DY = H - 30, DS = 28;
  NL.types.dodger = {
    name: 'Esquiva',
    desc: 'Blocos caem do céu. A IA anda pra esquerda e direita pra não ser esmagada.',
    nIn: 8, nOut: 2,
    inputLabels: ['minha posição', 'bloco 1 ↔', 'bloco 1 perto', 'bloco 1 larg.', 'bloco 2 ↔', 'bloco 2 perto', 'bloco 2 larg.', 'velocidade'],
    outputLabels: ['esquerda', 'direita'],
    controls: [
      { label: '◀ Esquerda', out: 0, keys: ['ArrowLeft'] },
      { label: 'Direita ▶', out: 1, keys: ['ArrowRight'] },
    ],
    loopLen: 0,
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
    newAgent() { return { x: W / 2 - DS / 2, dead: false }; },
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
        w.obs.push({ x, y: -30, w: bw, h: 26 });
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
      const dir = (out[1] > 0.5 ? 1 : 0) - (out[0] > 0.5 ? 1 : 0);
      a.x = clamp(a.x + dir * def.params.move * dt, 0, W - DS);
      for (const o of w.obs)
        if (o.y + o.h > DY - DS + 3 && o.y < DY && o.x < a.x + DS - 3 && o.x + o.w > a.x + 3) { a.dead = true; return; }
    },
    agentPos(w, a) { return { x: a.x + DS / 2, y: DY - DS / 2 }; },
    draw(ctx, w, agents, view) {
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, W, H);
      stars(ctx, 0);
      ctx.fillStyle = GROUND;
      ctx.fillRect(0, DY, W, H - DY);
      ctx.fillStyle = LINE;
      ctx.fillRect(0, DY, W, 2);
      ctx.fillStyle = OBS;
      for (const o of w.obs) { rr(ctx, o.x, o.y, o.w, o.h, 5); ctx.fill(); }
      eachAgent(ctx, agents, view, (a, f) => body(ctx, a.x, DY - DS, DS, DS, a.hue, f));
    },
  };
})();
