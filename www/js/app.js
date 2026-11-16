// EvoLab: telas (início, editor, treino/jogo) e laço de simulação
(function () {
  const NL = window.NL, W = NL.W, H = NL.H, DT = 1 / 60;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };

  // ───────── dados ─────────
  const CFG = [
    { key: 'pop', label: 'IAs por geração', min: 10, max: 500, step: 10, def: 60 },
    { key: 'hidden', label: 'Neurônios ocultos (mudar zera o treino)', min: 2, max: 16, step: 1, def: 8 },
    { key: 'mut', label: 'Chance de mutação (%)', min: 1, max: 50, step: 1, def: 10 },
    { key: 'str', label: 'Força da mutação', min: 0.05, max: 1, step: 0.05, def: 0.3 },
    { key: 'elite', label: 'Elite que passa intacta (%)', min: 1, max: 30, step: 1, def: 5 },
    { key: 'maxScore', label: 'Pontos pra encerrar a geração', min: 500, max: 20000, step: 500, def: 3000 },
  ];
  const cfg = Object.assign({}, ...CFG.map((c) => ({ [c.key]: c.def })), LS.get('evolab.cfg', {}));

  function newDef(type, name) {
    const T = NL.types[type], params = {}, pieces = {};
    T.params.forEach((q) => (params[q.key] = q.def));
    T.pieces.forEach((q) => (pieces[q.id] = true));
    return { id: 'g' + Date.now().toString(36) + Math.floor(Math.random() * 1e5), name, type, params, pieces, mode: 'random', track: [] };
  }
  let games = LS.get('evolab.games', null);
  if (!games) {
    games = [newDef('runner', 'Corrida no deserto'), newDef('flyer', 'Voo entre barreiras'), newDef('dodger', 'Chuva de blocos')];
    saveGames();
  }
  // completa parâmetros que faltarem (jogos salvos por versões antigas)
  games = games.filter((g) => NL.types[g.type]);
  games.forEach((g) => NL.types[g.type].params.forEach((q) => { if (!(q.key in g.params)) g.params[q.key] = q.def; }));
  function saveGames() { LS.set('evolab.games', games); }
  const brainKey = (def) => 'evolab.brain.' + def.id;

  // ───────── navegação ─────────
  let screen = 'home';
  function show(name) {
    screen = name;
    for (const s of ['home', 'editor', 'run']) $('#' + s).hidden = s !== name;
    window.scrollTo(0, 0);
  }
  NL.back = function () {
    if (screen === 'home') return false;
    if (screen === 'run') stopRun();
    renderHome();
    show('home');
    return true;
  };
  document.querySelectorAll('[data-back]').forEach((b) => (b.onclick = NL.back));

  function slider(box, q, value, onChange) {
    const el = document.createElement('label');
    el.className = 'slider';
    el.innerHTML = '<div><span>' + esc(q.label) + '</span><b></b></div><input type="range" min="' + q.min + '" max="' + q.max + '" step="' + q.step + '">';
    const inp = el.querySelector('input'), out = el.querySelector('b');
    inp.value = value;
    out.textContent = +inp.value;
    inp.oninput = () => { out.textContent = +inp.value; onChange(+inp.value); };
    box.appendChild(el);
    return el;
  }

  // ───────── início ─────────
  function renderHome() {
    const box = $('#games');
    box.innerHTML = games.length ? '' : '<p class="hint" style="padding:0 16px">Nenhum jogo ainda. Crie um aqui embaixo.</p>';
    games.forEach((g) => {
      const b = LS.get(brainKey(g), null);
      const el = document.createElement('div');
      el.className = 'card';
      el.innerHTML =
        '<div class="top"><b>' + esc(g.name) + '</b><span class="tag">' + NL.types[g.type].name + '</span></div>' +
        '<div class="meta">' + (b ? 'Geração ' + b.gen + ' · recorde ' + b.record + ' pts' : 'IAs ainda não treinadas') + '</div>' +
        '<div class="btns"><button class="primary" data-a="train">Treinar IAs</button><button data-a="play">Jogar</button><button data-a="edit">Editar</button></div>';
      el.querySelector('[data-a=train]').onclick = () => startRun(g, 'train');
      el.querySelector('[data-a=play]').onclick = () => startRun(g, 'play');
      el.querySelector('[data-a=edit]').onclick = () => openEditor(g);
      box.appendChild(el);
    });
  }
  Object.keys(NL.types).forEach((id) => {
    const T = NL.types[id], b = document.createElement('button');
    b.innerHTML = '<b>+ ' + T.name + '</b><span>' + T.desc + '</span>';
    b.onclick = () => {
      const g = newDef(id, 'Meu ' + T.name.toLowerCase() + ' ' + (games.filter((x) => x.type === id).length + 1));
      games.unshift(g);
      saveGames();
      openEditor(g);
    };
    $('#templates').appendChild(b);
  });

  // ───────── editor ─────────
  let ed = null, tool = null;
  const TRH = 150;
  function openEditor(def) {
    ed = def;
    const T = NL.types[def.type];
    tool = T.pieces.length ? T.pieces[0].id : null;
    $('#edName').value = def.name;
    $('#edDesc').textContent = T.name + ': ' + T.desc;
    $('#edTrackBox').hidden = !T.pieces.length;
    $('#edDel').textContent = 'Excluir';
    delete $('#edDel').dataset.sure;
    renderEditor();
    show('editor');
    drawTrack();
  }
  function renderEditor() {
    const T = NL.types[ed.type], track = ed.mode === 'track';
    document.querySelectorAll('#edMode button').forEach((b) => b.classList.toggle('on', b.dataset.m === ed.mode));
    const chips = $('#edPieces');
    chips.innerHTML = '';
    if (track || T.pieces.length > 1)
      T.pieces.forEach((q) => {
        const b = document.createElement('button');
        b.textContent = q.label;
        b.classList.toggle('on', track ? tool === q.id : ed.pieces[q.id] !== false);
        b.onclick = () => {
          if (ed.mode === 'track') tool = q.id;
          else ed.pieces[q.id] = ed.pieces[q.id] === false;
          saveGames();
          renderEditor();
        };
        chips.appendChild(b);
      });
    if (track) {
      const clr = document.createElement('button');
      clr.textContent = 'Limpar pista';
      clr.className = 'danger';
      clr.onclick = () => { ed.track = []; saveGames(); drawTrack(); };
      chips.appendChild(clr);
    }
    $('#trackWrap').hidden = !track;
    $('#trackHint').textContent = track
      ? 'Escolha a peça e toque na pista pra colocar. Toque numa peça pra tirar. A pista se repete em loop.'
      : T.pieces.length > 1 ? 'Marque quais obstáculos podem aparecer. A ordem é sorteada a cada geração.' : 'As barreiras aparecem em alturas sorteadas a cada geração.';
    const box = $('#edParams');
    box.innerHTML = '';
    T.params.forEach((q) => {
      if (q.random && track) return;
      slider(box, q, ed.params[q.key], (v) => { ed.params[q.key] = v; saveGames(); if (track) drawTrack(); });
    });
    if (track) drawTrack();
  }
  function drawTrack() {
    if (!ed || ed.mode !== 'track') return;
    const T = NL.types[ed.type], c = $('#track'), s = TRH / H, dpr = window.devicePixelRatio || 1;
    c.style.width = T.loopLen * s + 'px';
    c.width = T.loopLen * s * dpr;
    c.height = TRH * dpr;
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr * s, 0, 0, dpr * s, 0, 0);
    T.bg(ctx, 0, T.loopLen);
    ctx.fillStyle = 'rgba(255,255,255,.06)';
    for (let x = 200; x < T.loopLen; x += 200) ctx.fillRect(x, 0, 2, H);
    ed.track.forEach((it) => T.drawObs(ctx, T.trackObs(it, ed), it.x));
  }
  $('#track').onclick = (e) => {
    const T = NL.types[ed.type], r = e.target.getBoundingClientRect(), s = TRH / H;
    const x = (e.clientX - r.left) / s, y = (e.clientY - r.top) / s;
    const hit = ed.track.findIndex((it) => x >= it.x - 6 && x <= it.x + T.trackObs(it, ed).w + 6);
    if (hit >= 0) ed.track.splice(hit, 1);
    else {
      const w = T.trackObs({ t: tool, x: 0, y }, ed).w;
      ed.track.push({ t: tool, x: Math.max(0, Math.round((x - w / 2) / 10) * 10), y: Math.round(y) });
      ed.track.sort((a, b) => a.x - b.x);
    }
    saveGames();
    drawTrack();
  };
  document.querySelectorAll('#edMode button').forEach((b) => (b.onclick = () => { ed.mode = b.dataset.m; saveGames(); renderEditor(); }));
  $('#edName').oninput = (e) => { ed.name = e.target.value.trim() || 'Sem nome'; saveGames(); };
  $('#edTrain').onclick = () => startRun(ed, 'train');
  $('#edPlay').onclick = () => startRun(ed, 'play');
  $('#edDup').onclick = () => {
    const g = JSON.parse(JSON.stringify(ed));
    g.id = newDef(ed.type, '').id;
    g.name = (ed.name + ' (cópia)').slice(0, 30);
    games.unshift(g);
    saveGames();
    openEditor(g);
  };
  $('#edDel').onclick = (e) => {
    const b = e.target;
    if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Toque de novo pra excluir'; return; }
    LS.del(brainKey(ed));
    games = games.filter((g) => g !== ed);
    saveGames();
    NL.back();
  };

  // ───────── treino / jogo ─────────
  const R = { active: false };
  let lastGen = -1;
  const xbuf = new Float32Array(16);

  function startRun(def, mode) {
    const T = NL.types[def.type];
    Object.assign(R, {
      active: true, def, T, mode, paused: false, over: false, input: [0, 0], followBest: true, solo: false,
      gen: 1, record: 0, history: [], champion: null, champFit: -1, lastSave: 0, focus: null,
    });
    $('#runTitle').textContent = def.name;
    $('#trainCtl').hidden = mode !== 'train';
    $('#playCtl').hidden = mode !== 'play';
    $('#overMsg').hidden = true;
    if (mode === 'train') {
      const saved = LS.get(brainKey(def), null);
      const nG = NL.geneCount(T.nIn, cfg.hidden, T.nOut);
      let genes = [];
      if (saved && saved.genes && saved.genes.length === nG) {
        R.gen = saved.gen;
        R.record = saved.record;
        R.history = saved.history || [];
        R.champion = Float32Array.from(saved.genes);
        R.champFit = saved.champFit || 0;
        genes.push(R.champion.slice());
        while (genes.length < cfg.pop) genes.push(genes.length < cfg.pop * 0.8 ? NL.mutate(R.champion, 0.15, 0.3) : NL.randomGenes(nG));
      } else while (genes.length < cfg.pop) genes.push(NL.randomGenes(nG));
      spawn(genes);
      setSpeed(1);
      syncButtons();
    } else {
      buildPlayCtl();
      spawn([null]);
    }
    lastGen = -1;
    show('run');
  }
  function stopRun() {
    if (R.active && R.mode === 'train') saveBrain(true);
    R.active = false;
  }
  function spawn(genes) {
    const T = R.T;
    R.agents = genes.map((g, i) => {
      const a = T.newAgent(R.def);
      a.brain = g ? new NL.Brain(T.nIn, cfg.hidden, T.nOut, g) : null;
      a.hue = g ? (i * 47) % 360 : 168;
      a.idx = i;
      a.fit = 0;
      return a;
    });
    R.alive = R.agents.length;
    R.world = T.newWorld(R.def, NL.rng((Math.random() * 2 ** 32) >>> 0));
    R.focus = R.agents[0];
    R.over = false;
  }
  function tick() {
    const T = R.T, w = R.world, def = R.def;
    T.step(w, def, DT, R.agents);
    for (const a of R.agents) {
      if (a.dead) continue;
      let out = R.input;
      if (a.brain) { T.sense(w, a, def, xbuf); out = a.brain.run(xbuf); }
      T.stepAgent(w, a, out, def, DT);
      if (a.dead) { a.fit = w.dist; R.alive--; }
    }
    if (R.mode === 'play') {
      if (!R.alive) {
        R.over = true;
        $('#overMsg').innerHTML = 'Você fez ' + score() + ' pontos.<br>Toque pra tentar de novo.';
        $('#overMsg').hidden = false;
      }
    } else if (!R.alive || score() >= cfg.maxScore) endGeneration();
  }
  const score = () => Math.floor(R.world.dist / 10);

  function endGeneration() {
    const w = R.world;
    for (const a of R.agents) if (!a.dead) a.fit = w.dist;
    const ranked = R.agents.map((a) => ({ genes: a.brain.g, fitness: a.fit })).sort((a, b) => b.fitness - a.fitness);
    const best = Math.floor(ranked[0].fitness / 10);
    const avg = Math.floor(ranked.reduce((s, r) => s + r.fitness, 0) / ranked.length / 10);
    R.history.push([best, avg]);
    if (R.history.length > 300) R.history.shift();
    if (best > R.record) R.record = best;
    if (ranked[0].fitness >= R.champFit) { R.champFit = ranked[0].fitness; R.champion = ranked[0].genes.slice(); }
    R.gen++;
    spawn(NL.evolve(ranked, cfg.pop, cfg));
    saveBrain(false);
  }
  function saveBrain(force) {
    const now = Date.now();
    if (!R.champion || (!force && now - R.lastSave < 2000)) return;
    R.lastSave = now;
    LS.set(brainKey(R.def), { gen: R.gen, record: R.record, champFit: R.champFit, genes: Array.from(R.champion), history: R.history });
  }
  function resetTraining() {
    LS.del(brainKey(R.def));
    const nG = NL.geneCount(R.T.nIn, cfg.hidden, R.T.nOut), genes = [];
    while (genes.length < cfg.pop) genes.push(NL.randomGenes(nG));
    Object.assign(R, { gen: 1, record: 0, history: [], champion: null, champFit: -1, followBest: true });
    lastGen = -1;
    spawn(genes);
    syncButtons();
  }

  // quem seguir
  function pickFocus() {
    if (R.focus && !R.focus.dead && !(R.followBest && R.focus.idx !== firstAlive())) return;
    const i = firstAlive();
    if (i >= 0) R.focus = R.agents[i];
  }
  function firstAlive() { return R.agents.findIndex((a) => !a.dead); }
  function cycle(dir) {
    const n = R.agents.length;
    let i = R.focus ? R.focus.idx : 0;
    for (let k = 0; k < n; k++) {
      i = (i + dir + n) % n;
      if (!R.agents[i].dead) { R.focus = R.agents[i]; R.followBest = false; break; }
    }
    syncButtons();
  }
  function setSpeed(s) {
    R.speed = s;
    document.querySelectorAll('#speeds button').forEach((b) => b.classList.toggle('on', b.dataset.s === String(s)));
  }
  function syncButtons() {
    $('#btBest').classList.toggle('on', R.followBest);
    $('#btSolo').classList.toggle('on', R.solo);
    $('#btPause').textContent = R.paused ? '▶' : '⏸';
  }
  document.querySelectorAll('#speeds button').forEach((b) => (b.onclick = () => setSpeed(b.dataset.s === 'max' ? 'max' : +b.dataset.s)));
  $('#btPause').onclick = () => { R.paused = !R.paused; syncButtons(); };
  $('#btPrev').onclick = () => cycle(-1);
  $('#btNext').onclick = () => cycle(1);
  $('#btBest').onclick = () => { R.followBest = true; syncButtons(); };
  $('#btSolo').onclick = () => { R.solo = !R.solo; syncButtons(); };
  $('#btSkip').onclick = () => { if (R.active && R.mode === 'train') endGeneration(); };
  $('#btReset').onclick = () => resetTraining();
  $('#runEdit').onclick = () => { const d = R.def; stopRun(); openEditor(d); };
  CFG.forEach((q) =>
    slider($('#cfg'), q, cfg[q.key], (v) => {
      cfg[q.key] = v;
      LS.set('evolab.cfg', cfg);
      if (q.key === 'hidden' && R.active && R.mode === 'train') resetTraining();
    })
  );

  $('#cv').addEventListener('pointerdown', (e) => {
    if (!R.active) return;
    if (R.mode === 'play') {
      if (R.over) { $('#overMsg').hidden = true; spawn([null]); }
      return;
    }
    const r = e.target.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H;
    let best = null, bd = 60 * 60;
    for (const a of R.agents) {
      if (a.dead) continue;
      const p = R.T.agentPos(R.world, a), d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bd) { bd = d; best = a; }
    }
    if (best) { R.focus = best; R.followBest = false; syncButtons(); }
  });

  // controles do modo "jogar eu mesmo"
  function buildPlayCtl() {
    const box = $('#playCtl');
    box.innerHTML = '';
    R.T.controls.forEach((c) => {
      const b = document.createElement('button');
      b.textContent = c.label;
      const set = (v) => (e) => { e.preventDefault(); R.input[c.out] = v; b.classList.toggle('on', !!v); };
      b.addEventListener('pointerdown', set(1));
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, set(0));
      box.appendChild(b);
    });
  }
  function key(e, v) {
    if (!R.active || R.mode !== 'play' || screen !== 'run') return;
    const c = R.T.controls.find((c) => c.keys.includes(e.key));
    if (!c) return;
    e.preventDefault();
    if (v && R.over) { $('#overMsg').hidden = true; spawn([null]); return; }
    R.input[c.out] = v;
  }
  addEventListener('keydown', (e) => key(e, 1));
  addEventListener('keyup', (e) => key(e, 0));

  // ───────── desenho ─────────
  function fit(c, lw, lh) {
    const dpr = window.devicePixelRatio || 1, cw = c.clientWidth, ch = c.clientHeight;
    if (c.width !== Math.round(cw * dpr) || c.height !== Math.round(ch * dpr)) { c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr); }
    const ctx = c.getContext('2d');
    ctx.setTransform((c.width / (lw || cw)), 0, 0, (c.height / (lh || ch)), 0, 0);
    return ctx;
  }

  function drawNN() {
    const c = $('#nn'), w = c.clientWidth, h = c.clientHeight;
    if (!w) return;
    const ctx = fit(c);
    ctx.clearRect(0, 0, w, h);
    const b = R.focus && R.focus.brain;
    if (!b) return;
    const T = R.T, xs = [92, w / 2 + 10, w - 78];
    const ys = (n, i) => ((i + 0.5) * h) / n;
    const edge = (x0, y0, x1, y1, wt, act) => {
      const a = Math.min(1, Math.abs(wt) / 2) * (0.15 + 0.85 * Math.min(1, Math.abs(act)));
      if (a < 0.04) return;
      ctx.strokeStyle = (wt > 0 ? 'rgba(94,234,212,' : 'rgba(226,88,107,') + a.toFixed(2) + ')';
      ctx.lineWidth = Math.min(3, 0.5 + Math.abs(wt));
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    };
    for (let hh = 0; hh < b.nH; hh++) {
      for (let i = 0; i < b.nI; i++) edge(xs[0], ys(b.nI, i), xs[1], ys(b.nH, hh), b.w1(i, hh), b.inp[i]);
      for (let o = 0; o < b.nO; o++) edge(xs[1], ys(b.nH, hh), xs[2], ys(b.nO, o), b.w2(hh, o), b.hid[hh]);
    }
    const node = (x, y, v, r) => {
      const t = Math.max(0, Math.min(1, Math.abs(v)));
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832);
      ctx.fillStyle = v >= 0 ? 'rgba(94,234,212,' + (0.15 + 0.85 * t) + ')' : 'rgba(226,88,107,' + (0.15 + 0.85 * t) + ')';
      ctx.fill();
      ctx.strokeStyle = '#4a556e'; ctx.lineWidth = 1; ctx.stroke();
    };
    ctx.font = '10px system-ui,sans-serif';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < b.nI; i++) {
      node(xs[0], ys(b.nI, i), b.inp[i], 5);
      ctx.fillStyle = '#8b95a8'; ctx.textAlign = 'right';
      ctx.fillText(T.inputLabels[i], xs[0] - 9, ys(b.nI, i));
    }
    for (let hh = 0; hh < b.nH; hh++) node(xs[1], ys(b.nH, hh), b.hid[hh], 5);
    for (let o = 0; o < b.nO; o++) {
      const on = b.out[o] > 0.5;
      node(xs[2], ys(b.nO, o), on ? 1 : 0.05, 8);
      ctx.fillStyle = on ? '#5eead4' : '#8b95a8'; ctx.textAlign = 'left';
      ctx.fillText(T.outputLabels[o], xs[2] + 12, ys(b.nO, o));
    }
  }
  function drawGraph() {
    const c = $('#graph'), w = c.clientWidth, h = c.clientHeight;
    if (!w) return;
    const ctx = fit(c);
    ctx.clearRect(0, 0, w, h);
    const hs = R.history;
    if (hs.length < 2) {
      ctx.fillStyle = '#8b95a8'; ctx.font = '12px system-ui,sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('O gráfico aparece depois de 2 gerações', w / 2, h / 2);
      return;
    }
    const max = Math.max(10, ...hs.map((p) => p[0]));
    const line = (k, col, lw) => {
      ctx.beginPath();
      hs.forEach((p, i) => {
        const x = 8 + (i * (w - 16)) / (hs.length - 1), y = h - 8 - (p[k] / max) * (h - 26);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke();
    };
    line(1, '#6b7690', 1.5);
    line(0, '#5eead4', 2);
    ctx.fillStyle = '#8b95a8'; ctx.font = '10px system-ui,sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(max + ' pts', 8, 11);
  }

  function render() {
    const ctx = fit($('#cv'), W, H);
    R.T.draw(ctx, R.world, R.agents, { focus: R.focus, solo: R.mode === 'train' && R.solo });
    ctx.fillStyle = '#e8ecf3';
    ctx.font = '600 20px system-ui,sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(score(), W - 14, 28);
    if (R.mode !== 'train') return;
    ctx.textAlign = 'left';
    ctx.font = '600 13px system-ui,sans-serif';
    ctx.fillStyle = '#8b95a8';
    ctx.fillText('GERAÇÃO ' + R.gen, 14, 24);
    $('#stGen').textContent = R.gen;
    $('#stAlive').textContent = R.alive + '/' + R.agents.length;
    $('#stScore').textContent = score();
    $('#stRec').textContent = Math.max(R.record, score());
    $('#stWho').textContent = R.focus ? 'Seguindo a IA nº ' + (R.focus.idx + 1) + '.' : '';
    drawNN();
    if (lastGen !== R.gen) { lastGen = R.gen; drawGraph(); }
  }
  function frame() {
    requestAnimationFrame(frame);
    if (!R.active || screen !== 'run') return;
    if (!R.paused && !R.over) {
      if (R.mode === 'play') tick();
      else if (R.speed === 'max') {
        const t0 = performance.now();
        do { for (let i = 0; i < 20 && R.active; i++) tick(); } while (performance.now() - t0 < 12);
      } else for (let i = 0; i < R.speed; i++) tick();
    }
    if (R.mode === 'train') pickFocus();
    render();
  }
  addEventListener('resize', () => { lastGen = -1; });
  document.addEventListener('visibilitychange', () => { if (document.hidden && R.active && R.mode === 'train') saveBrain(true); });

  renderHome();
  show('home');
  requestAnimationFrame(frame);
})();
