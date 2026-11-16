// EvoLab: telas (início, editor, treino/jogo/desafio) e laço de simulação
(function () {
  const NL = window.NL, W = NL.W, H = NL.H, DT = 1 / 60, INK = NL.INK;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const FONT = 'Fredoka,system-ui,sans-serif';

  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };

  // ───────── som (sintetizado, sem arquivos) ─────────
  const SFX = {
    tap: [[520, 0.05]], jump: [[520, 0.05], [760, 0.07]], die: [[240, 0.09], [150, 0.2]],
    rec: [[660, 0.07], [880, 0.07], [1175, 0.16]], win: [[523, 0.09], [659, 0.09], [784, 0.09], [1047, 0.22]],
  };
  const Snd = {
    on: LS.get('evolab.snd', true), ctx: null,
    play(name) {
      if (!this.on) return;
      try {
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        const ac = this.ctx;
        if (ac.state === 'suspended') ac.resume();
        let t = ac.currentTime;
        for (const [f, d] of SFX[name]) {
          const o = ac.createOscillator(), g = ac.createGain();
          o.type = 'triangle';
          o.frequency.value = f;
          g.gain.setValueAtTime(0.12, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + d);
          o.connect(g).connect(ac.destination);
          o.start(t);
          o.stop(t + d);
          t += d;
        }
      } catch (e) {}
    },
  };
  function syncSound() { $('#btSound').textContent = Snd.on ? '🔊 Som ligado' : '🔇 Som desligado'; }
  $('#btSound').onclick = () => { Snd.on = !Snd.on; LS.set('evolab.snd', Snd.on); syncSound(); Snd.play('tap'); };
  syncSound();

  // ───────── dados ─────────
  const CFG = [
    { key: 'pop', label: 'IAs por geração', min: 10, max: 500, step: 10, def: 60 },
    { key: 'hidden', label: 'Neurônios (mudar zera o treino)', min: 2, max: 16, step: 1, def: 8 },
    { key: 'mut', label: 'Chance de mutação (%)', min: 1, max: 50, step: 1, def: 10 },
    { key: 'str', label: 'Força da mutação', min: 0.05, max: 1, step: 0.05, def: 0.3 },
    { key: 'elite', label: 'Elite que passa intacta (%)', min: 1, max: 30, step: 1, def: 5 },
    { key: 'maxScore', label: 'Pontos pra fechar a geração', min: 500, max: 20000, step: 500, def: 3000 },
  ];
  const cfg = Object.assign({}, ...CFG.map((c) => ({ [c.key]: c.def })), LS.get('evolab.cfg', {}));
  const MEDALS = [500, 1500, 3000], MEDAL_NAMES = ['bronze', 'prata', 'ouro'];
  const medals = (rec) => MEDALS.filter((m) => rec >= m).length;

  const SYL = ['bi', 'zu', 'ko', 'lu', 'pi', 'ta', 'mo', 'ne', 'fa', 'gi', 'do', 'xu', 'ra', 'le', 'vi', 'ju', 'ca', 'te', 'ba', 'nho'];
  function mkName() {
    let n = '';
    for (let i = 0, k = Math.random() < 0.4 ? 3 : 2; i < k; i++) n += SYL[Math.floor(Math.random() * SYL.length)];
    return n[0].toUpperCase() + n.slice(1);
  }

  const DEF_THEME = { runner: 'deserto', flyer: 'campo', dodger: 'noite', lanes: 'doce' };
  function newDef(type, name) {
    const T = NL.types[type], params = {}, pieces = {};
    T.params.forEach((q) => (params[q.key] = q.def));
    T.pieces.forEach((q) => (pieces[q.id] = true));
    return { id: 'g' + Date.now().toString(36) + Math.floor(Math.random() * 1e5), name, type, theme: DEF_THEME[type], params, pieces, mode: 'random', track: [] };
  }
  let games = LS.get('evolab.games', null);
  if (!games) games = [newDef('runner', 'Corrida no deserto'), newDef('flyer', 'Voo no campo'), newDef('dodger', 'Chuva de blocos'), newDef('lanes', 'Estrada doce')];
  // completa o que faltar em jogos salvos por versões antigas
  games = games.filter((g) => NL.types[g.type]);
  games.forEach((g) => {
    if (!NL.themes[g.theme]) g.theme = DEF_THEME[g.type];
    NL.types[g.type].params.forEach((q) => { if (!(q.key in g.params)) g.params[q.key] = q.def; });
  });
  function saveGames() { LS.set('evolab.games', games); }
  saveGames();
  const brainKey = (def) => 'evolab.brain.' + def.id;
  const humanKey = (def) => 'evolab.human.' + def.id;
  const hiddenOf = (T, n) => (n - T.nOut) / (T.nIn + 1 + T.nOut);
  function loadBrain(def) {
    const b = LS.get(brainKey(def), null), T = NL.types[def.type];
    if (!b || !b.genes) return null;
    const h = hiddenOf(T, b.genes.length);
    return Number.isInteger(h) && h > 0 ? Object.assign(b, { hidden: h }) : null;
  }

  // ───────── navegação ─────────
  let screen = 'home';
  function show(name) {
    screen = name;
    for (const s of ['home', 'editor', 'run']) $('#' + s).hidden = s !== name;
  }
  NL.back = function () {
    if (screen === 'home') return false;
    if (screen === 'run') stopRun();
    show('home');
    renderHome();
    return true;
  };
  document.querySelectorAll('[data-back]').forEach((b) => (b.onclick = () => { Snd.play('tap'); NL.back(); }));

  function slider(box, q, value, onChange) {
    const el = document.createElement('label');
    el.className = 'slider';
    el.innerHTML = '<div><span>' + esc(q.label) + '</span><b></b></div><input type="range" min="' + q.min + '" max="' + q.max + '" step="' + q.step + '">';
    const inp = el.querySelector('input'), out = el.querySelector('b');
    inp.value = value;
    out.textContent = +inp.value;
    inp.oninput = () => { out.textContent = +inp.value; onChange(+inp.value); };
    box.appendChild(el);
  }

  // prepara um canvas: escala uniforme, mundo ancorado embaixo, largura visível variável
  function view(c) {
    const dpr = window.devicePixelRatio || 1, cw = c.clientWidth, ch = c.clientHeight;
    if (c.width !== Math.round(cw * dpr) || c.height !== Math.round(ch * dpr)) { c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr); }
    const s = Math.min(ch / H, cw / W) || 1, v = { s, VW: cw / s, VH: ch / s, oy: ch / s - H, ctx: c.getContext('2d') };
    v.ctx.setTransform(dpr * s, 0, 0, dpr * s, 0, dpr * s * v.oy);
    return v;
  }
  function hud(c) {
    const dpr = window.devicePixelRatio || 1, cw = c.clientWidth, ch = c.clientHeight;
    if (c.width !== Math.round(cw * dpr) || c.height !== Math.round(ch * dpr)) { c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr); }
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    return ctx;
  }

  // ───────── início ─────────
  function thumb(c, def) {
    const T = NL.types[def.type], a = Object.assign(T.newAgent(def), { hue: 45, idx: 0 });
    const w = T.newWorld(def, NL.rng(7));
    for (let i = 0; i < 150; i++) T.step(w, def, DT, [a]);
    const v = view(c);
    T.draw(v.ctx, w, [a], { focus: a, VW: v.VW, th: NL.themes[def.theme] });
  }
  function renderHome() {
    const box = $('#games');
    box.innerHTML = games.length ? '' : '<p class="empty">Nenhum jogo ainda. Crie um ali do lado.</p>';
    games.forEach((g) => {
      const b = loadBrain(g), m = b ? medals(b.record) : 0;
      const el = document.createElement('div');
      el.className = 'card';
      el.innerHTML =
        '<canvas></canvas><div class="in"><div class="top"><b>' + esc(g.name) + '</b><span class="stars">' +
        [0, 1, 2].map((i) => (i < m ? '<i>★</i>' : '★')).join('') + '</span></div>' +
        '<div class="meta">' + NL.types[g.type].name + ' · ' + (b ? 'geração ' + b.gen + ' · recorde ' + b.record : 'IAs sem treino') + '</div>' +
        '<div class="btns"><button class="primary" data-a="train">Treinar IAs</button>' +
        '<button data-a="play">' + (b ? 'Desafiar IA' : 'Jogar') + '</button><button data-a="edit">Editar</button></div></div>';
      el.querySelector('[data-a=train]').onclick = () => startRun(g, 'train');
      el.querySelector('[data-a=play]').onclick = () => startRun(g, b ? 'duel' : 'play');
      el.querySelector('[data-a=edit]').onclick = () => openEditor(g);
      box.appendChild(el);
      thumb(el.querySelector('canvas'), g);
    });
  }
  Object.keys(NL.types).forEach((id) => {
    const T = NL.types[id], b = document.createElement('button');
    b.innerHTML = '<i>' + T.icon + '</i>' + T.name;
    b.onclick = () => {
      Snd.play('tap');
      const g = newDef(id, 'Meu ' + T.name.toLowerCase() + ' ' + (games.filter((x) => x.type === id).length + 1));
      games.unshift(g);
      saveGames();
      openEditor(g);
    };
    $('#templates').appendChild(b);
  });

  // ───────── editor ─────────
  let ed = null, tool = null;
  function openEditor(def) {
    ed = def;
    const T = NL.types[def.type];
    tool = T.pieces.length ? T.pieces[0].id : null;
    $('#edName').value = def.name;
    $('#edDesc').textContent = T.icon + ' ' + T.name + ' — ' + T.desc;
    $('#edTrackBox').hidden = !T.pieces.length;
    $('#edDel').textContent = 'Excluir';
    delete $('#edDel').dataset.sure;
    show('editor');
    renderEditor();
  }
  function renderEditor() {
    const T = NL.types[ed.type], track = ed.mode === 'track';
    const th = $('#edThemes');
    th.innerHTML = '';
    Object.keys(NL.themes).forEach((id) => {
      const b = document.createElement('button');
      b.textContent = NL.themes[id].name;
      b.classList.toggle('on', ed.theme === id);
      b.onclick = () => { ed.theme = id; saveGames(); renderEditor(); };
      th.appendChild(b);
    });
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
    $('#trackHint').textContent = track
      ? 'Toque na pista pra colocar a peça escolhida; toque numa peça pra tirar. Arraste pro lado pra ver o resto. A pista se repete em loop.'
      : !T.pieces.length ? 'Prévia do jogo. Os blocos caem em lugares sorteados.'
      : T.pieces.length > 1 ? 'Prévia. Marque quais obstáculos podem aparecer; a ordem é sorteada a cada geração.'
      : 'Prévia. As posições são sorteadas a cada geração. Use "Pista montada" pra desenhar a sua.';
    const box = $('#edParams');
    box.innerHTML = '';
    T.params.forEach((q) => {
      if (q.random && track) return;
      slider(box, q, ed.params[q.key], (v) => { ed.params[q.key] = v; saveGames(); drawTrack(); });
    });
    drawTrack();
  }
  const TRH = 170;
  function drawTrack() {
    if (!ed || screen !== 'editor') return;
    const T = NL.types[ed.type], c = $('#track'), th = NL.themes[ed.theme];
    if (ed.mode !== 'track') { c.style.width = '100%'; thumb(c, ed); return; }
    const s = TRH / H, dpr = window.devicePixelRatio || 1;
    c.style.width = T.loopLen * s + 'px';
    c.width = T.loopLen * s * dpr;
    c.height = TRH * dpr;
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr * s, 0, 0, dpr * s, 0, 0);
    T.bg(ctx, th, 0, T.loopLen);
    ctx.fillStyle = 'rgba(29,26,57,.18)';
    for (let x = 200; x < T.loopLen; x += 200) ctx.fillRect(x, 0, 2, H);
    ed.track.forEach((it) => T.drawObs(ctx, T.trackObs(it, ed), it.x, th, 0));
  }
  $('#track').onclick = (e) => {
    if (ed.mode !== 'track') return;
    const T = NL.types[ed.type], r = e.target.getBoundingClientRect(), s = TRH / H;
    const x = (e.clientX - r.left) / s, y = (e.clientY - r.top) / s;
    const hit = ed.track.findIndex((it) => {
      const o = T.trackObs(it, ed);
      return x >= it.x - 6 && x <= it.x + o.w + 6 && (!T.trackHit || T.trackHit(it, o, x, y));
    });
    if (hit >= 0) ed.track.splice(hit, 1);
    else {
      const w = T.trackObs({ t: tool, x: 0, y }, ed).w;
      ed.track.push({ t: tool, x: Math.max(0, Math.round((x - w / 2) / 10) * 10), y: Math.round(y) });
      ed.track.sort((a, b) => a.x - b.x);
    }
    Snd.play('tap');
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
    g.name = (ed.name + ' 2').slice(0, 30);
    games.unshift(g);
    saveGames();
    openEditor(g);
  };
  $('#edDel').onclick = (e) => {
    const b = e.target;
    if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Toque de novo'; return; }
    LS.del(brainKey(ed));
    LS.del(humanKey(ed));
    games = games.filter((g) => g !== ed);
    saveGames();
    NL.back();
  };

  // ───────── treino / jogo / desafio ─────────
  const R = { active: false, side: window.innerWidth >= 760 };
  const xbuf = new Float32Array(16);
  let lastGen = -1, parts = [], toastT = 0, toastAt = 0;

  function toast(msg) {
    const now = Date.now();
    if (now - toastAt < 1300) return;
    toastAt = now;
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 1900);
  }

  function startRun(def, mode) {
    const T = NL.types[def.type];
    Snd.play('tap');
    Object.assign(R, {
      active: true, def, T, mode, paused: false, over: false, input: [0, 0], followBest: true, solo: false,
      gen: 1, record: 0, history: [], champion: null, champName: '', champFit: -1, lastSave: 0, focus: null, hidden: cfg.hidden,
    });
    const train = mode === 'train';
    $('#side').hidden = !(train && R.side);
    $('#btSide').parentElement.hidden = !train;
    $('#speedBox').hidden = !train;
    $('#playCtl').hidden = train;
    $('#overMsg').hidden = true;
    $('#stGen').parentElement.hidden = $('#stAlive').parentElement.hidden = !train;
    $('#toast').classList.remove('show');
    parts = [];
    lastGen = -1;
    const saved = loadBrain(def);
    if (train) {
      const nG = NL.geneCount(T.nIn, cfg.hidden, T.nOut), kids = [];
      if (saved && saved.hidden === cfg.hidden) {
        R.gen = saved.gen;
        R.record = saved.record;
        R.history = saved.history || [];
        R.champion = Float32Array.from(saved.genes);
        R.champName = saved.name || mkName();
        R.champFit = saved.champFit || 0;
        kids.push({ genes: R.champion.slice(), name: R.champName, crown: true });
        while (kids.length < cfg.pop) kids.push({ genes: kids.length < cfg.pop * 0.8 ? NL.mutate(R.champion, 0.15, 0.3) : NL.randomGenes(nG) });
      } else while (kids.length < cfg.pop) kids.push({ genes: NL.randomGenes(nG) });
      spawn(kids);
      setSpeed(1);
      syncButtons();
    } else {
      R.record = LS.get(humanKey(def), 0);
      R.rival = mode === 'duel' && saved ? saved : null;
      buildPlayCtl();
      spawnPlay();
    }
    show('run');
  }
  function spawnPlay() {
    const kids = [{ genes: null, name: 'Você', hue: 45 }];
    if (R.rival) { R.hidden = R.rival.hidden; kids.push({ genes: Float32Array.from(R.rival.genes), name: R.rival.name || 'IA', hue: 330, crown: true }); }
    spawn(kids);
    R.input = [0, 0];
    $('#overMsg').hidden = true;
  }
  function stopRun() {
    if (R.active && R.mode === 'train') saveBrain(true);
    R.active = false;
  }
  function spawn(kids) {
    const T = R.T;
    R.agents = kids.map((k, i) => {
      const a = T.newAgent(R.def);
      a.brain = k.genes ? new NL.Brain(T.nIn, R.hidden, T.nOut, k.genes) : null;
      a.hue = k.hue != null ? k.hue : (i * 47 + 190) % 360;
      a.idx = i;
      a.fit = 0;
      a.name = k.name || mkName();
      a.crown = !!k.crown;
      return a;
    });
    R.alive = R.agents.length;
    R.world = T.newWorld(R.def, NL.rng((Math.random() * 2 ** 32) >>> 0));
    R.focus = R.agents[0];
    R.over = false;
  }
  const score = () => Math.floor(R.world.dist / 10);

  function puff(a) {
    if (parts.length > 160 || (R.mode === 'train' && (R.speed === 'max' || R.speed > 5))) return;
    const p = R.T.agentPos(R.world, a, R.VW || W);
    for (let i = 0; i < 7; i++) {
      const ang = Math.random() * 6.28, v = 60 + Math.random() * 160;
      parts.push({ x: p.x, y: p.y, vx: Math.cos(ang) * v - 80, vy: Math.sin(ang) * v - 120, life: 0.5 + Math.random() * 0.3, hue: a.hue });
    }
  }

  function tick() {
    const T = R.T, w = R.world, def = R.def;
    T.step(w, def, DT, R.agents);
    for (const a of R.agents) {
      if (a.dead) continue;
      let out = R.input;
      if (a.brain) { T.sense(w, a, def, xbuf); out = a.brain.run(xbuf); }
      T.stepAgent(w, a, out, def, DT);
      if (a.dead) { a.fit = w.dist; R.alive--; puff(a); }
    }
    if (R.mode === 'train') {
      if (!R.alive || score() >= cfg.maxScore) endGeneration();
      return;
    }
    const me = R.agents[0], ai = R.agents[1];
    if (me.dead || (ai && ai.dead)) gameOver(me, ai);
  }
  function gameOver(me, ai) {
    R.over = true;
    const pts = score(), rec = Math.max(R.record, pts);
    if (pts > R.record) { R.record = pts; LS.set(humanKey(R.def), pts); }
    let title = 'Fim de jogo!', won = false;
    if (ai) {
      if (!me.dead) { title = 'Você venceu ' + ai.name + '!'; won = true; }
      else if (ai.dead) title = 'Empate!';
      else title = ai.name + ' ganhou!';
    }
    $('#overTitle').textContent = title;
    $('#overText').textContent = pts + ' pontos · seu recorde: ' + rec;
    $('#overMsg').hidden = false;
    Snd.play(won ? 'win' : 'die');
  }

  function endGeneration() {
    const w = R.world;
    for (const a of R.agents) if (!a.dead) a.fit = w.dist;
    const ranked = R.agents.map((a) => ({ genes: a.brain.g, fitness: a.fit, name: a.name })).sort((a, b) => b.fitness - a.fitness);
    const best = Math.floor(ranked[0].fitness / 10);
    const avg = Math.floor(ranked.reduce((s, r) => s + r.fitness, 0) / ranked.length / 10);
    R.history.push([best, avg]);
    if (R.history.length > 300) R.history.shift();
    if (best > R.record) {
      const m0 = medals(R.record), m1 = medals(best);
      R.record = best;
      if (m1 > m0) { toastAt = 0; toast('★ Medalha de ' + MEDAL_NAMES[m1 - 1] + ' com ' + ranked[0].name + '!'); Snd.play('win'); }
      else if (R.gen > 1) { toast('Novo recorde: ' + best + ' — ' + ranked[0].name); if (R.speed !== 'max') Snd.play('rec'); }
    }
    if (ranked[0].fitness >= R.champFit) { R.champFit = ranked[0].fitness; R.champion = ranked[0].genes.slice(); R.champName = ranked[0].name; }
    R.gen++;
    spawn(NL.evolve(ranked, cfg.pop, cfg).map((k) => ({ genes: k.genes, name: k.from >= 0 ? ranked[k.from].name : null, crown: k.from === 0 })));
    saveBrain(false);
  }
  function saveBrain(force) {
    const now = Date.now();
    if (!R.champion || (!force && now - R.lastSave < 2000)) return;
    R.lastSave = now;
    LS.set(brainKey(R.def), { gen: R.gen, record: R.record, champFit: R.champFit, name: R.champName, genes: Array.from(R.champion), history: R.history });
  }
  function resetTraining() {
    LS.del(brainKey(R.def));
    R.hidden = cfg.hidden;
    const nG = NL.geneCount(R.T.nIn, cfg.hidden, R.T.nOut), kids = [];
    while (kids.length < cfg.pop) kids.push({ genes: NL.randomGenes(nG) });
    Object.assign(R, { gen: 1, record: 0, history: [], champion: null, champFit: -1, followBest: true });
    lastGen = -1;
    spawn(kids);
    syncButtons();
  }

  // quem seguir
  const firstAlive = () => R.agents.findIndex((a) => !a.dead);
  function pickFocus() {
    const i = firstAlive();
    if (i < 0) return;
    if (!R.focus || R.focus.dead || (R.followBest && R.focus.idx !== i)) R.focus = R.agents[i];
  }
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
    $('#btSide').classList.toggle('on', R.side);
    $('#btPause').textContent = R.paused ? '▶' : '❚❚';
    $('#btPause').classList.toggle('on', R.paused);
  }
  document.querySelectorAll('#speeds button').forEach((b) => (b.onclick = () => setSpeed(b.dataset.s === 'max' ? 'max' : +b.dataset.s)));
  $('#btPause').onclick = () => { R.paused = !R.paused; syncButtons(); };
  $('#btPrev').onclick = () => cycle(-1);
  $('#btNext').onclick = () => cycle(1);
  $('#btBest').onclick = () => { R.followBest = true; syncButtons(); };
  $('#btSolo').onclick = () => { R.solo = !R.solo; syncButtons(); };
  $('#btSide').onclick = () => { R.side = !R.side; $('#side').hidden = !R.side; lastGen = -1; syncButtons(); };
  $('#btSkip').onclick = () => { if (R.active && R.mode === 'train') endGeneration(); };
  $('#btReset').onclick = (e) => {
    const b = e.target;
    if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Toque de novo'; setTimeout(() => { delete b.dataset.sure; b.textContent = 'Zerar treino'; }, 2500); return; }
    delete b.dataset.sure;
    b.textContent = 'Zerar treino';
    resetTraining();
  };
  $('#overAgain').onclick = () => { Snd.play('tap'); spawnPlay(); };
  CFG.forEach((q) =>
    slider($('#cfg'), q, cfg[q.key], (v) => {
      cfg[q.key] = v;
      LS.set('evolab.cfg', cfg);
      if (q.key === 'hidden' && R.active && R.mode === 'train') resetTraining();
    })
  );

  $('#cv').addEventListener('pointerdown', (e) => {
    if (!R.active || R.over) return;
    if (R.mode !== 'train') {
      if (R.T.controls.length === 1) press(R.T.controls[0], 1);
      return;
    }
    const r = e.target.getBoundingClientRect(), s = R.vs || 1;
    const x = (e.clientX - r.left) / s, y = (e.clientY - r.top) / s - (R.voy || 0);
    let best = null, bd = 70 * 70;
    for (const a of R.agents) {
      if (a.dead) continue;
      const p = R.T.agentPos(R.world, a, R.VW), d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bd) { bd = d; best = a; }
    }
    if (best) { R.focus = best; R.followBest = false; syncButtons(); Snd.play('tap'); }
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave'])
    $('#cv').addEventListener(ev, () => { if (R.active && R.mode !== 'train' && R.T.controls.length === 1) press(R.T.controls[0], 0); });

  // controles de quem joga
  function press(c, v) {
    if (v && !R.input[c.out] && !R.over) Snd.play(c.out === 0 && R.T.controls.length < 3 ? 'jump' : 'tap');
    R.input[c.out] = v;
  }
  function buildPlayCtl() {
    const box = $('#playCtl'), cs = R.T.controls;
    box.innerHTML = '';
    cs.forEach((c, i) => {
      const b = document.createElement('button');
      b.textContent = c.label;
      b.className = cs.length === 1 || i === 1 ? 'r' : R.T.splitCtl ? 'l' : 'r2';
      const set = (v) => (e) => { e.preventDefault(); press(c, v); b.classList.toggle('on', !!v); };
      b.addEventListener('pointerdown', set(1));
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, set(0));
      box.appendChild(b);
    });
  }
  function key(e, v) {
    if (!R.active || R.mode === 'train' || screen !== 'run') return;
    const c = R.T.controls.find((c) => c.keys.includes(e.key));
    if (!c) return;
    e.preventDefault();
    if (R.over) { if (v && !e.repeat) spawnPlay(); return; }
    press(c, v);
  }
  addEventListener('keydown', (e) => key(e, 1));
  addEventListener('keyup', (e) => key(e, 0));

  // ───────── desenho ─────────
  function nameTag(ctx, a, up) {
    const p = R.T.agentPos(R.world, a, R.VW), y = p.top - (a.crown || up ? 30 : 16) - (up ? 16 : 0);
    ctx.font = '700 15px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK;
    ctx.strokeText(a.name, p.x, y);
    ctx.fillStyle = '#fff';
    ctx.fillText(a.name, p.x, y);
  }
  function drawNN() {
    const c = $('#nn'), w = c.clientWidth, h = c.clientHeight;
    if (!w) return;
    const ctx = hud(c), b = R.focus && R.focus.brain;
    if (!b) return;
    const T = R.T, xs = [96, w / 2 + 14, w - 70];
    const ys = (n, i) => ((i + 0.5) * h) / n;
    const edge = (x0, y0, x1, y1, wt, act) => {
      const a = Math.min(1, Math.abs(wt) / 2) * (0.12 + 0.88 * Math.min(1, Math.abs(act)));
      if (a < 0.05) return;
      ctx.strokeStyle = (wt > 0 ? 'rgba(18,184,134,' : 'rgba(255,93,143,') + a.toFixed(2) + ')';
      ctx.lineWidth = Math.min(3.5, 0.6 + Math.abs(wt));
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    };
    for (let hh = 0; hh < b.nH; hh++) {
      for (let i = 0; i < b.nI; i++) edge(xs[0], ys(b.nI, i), xs[1], ys(b.nH, hh), b.w1(i, hh), b.inp[i]);
      for (let o = 0; o < b.nO; o++) edge(xs[1], ys(b.nH, hh), xs[2], ys(b.nO, o), b.w2(hh, o), b.hid[hh]);
    }
    const node = (x, y, v, r) => {
      const t = Math.max(0, Math.min(1, Math.abs(v)));
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832);
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.fillStyle = (v >= 0 ? 'rgba(61,220,151,' : 'rgba(255,93,143,') + t + ')'; ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    };
    ctx.font = '500 10.5px ' + FONT;
    ctx.textBaseline = 'middle';
    for (let i = 0; i < b.nI; i++) {
      node(xs[0], ys(b.nI, i), b.inp[i], 5);
      ctx.fillStyle = '#6f6a8f'; ctx.textAlign = 'right';
      ctx.fillText(T.inputLabels[i], xs[0] - 9, ys(b.nI, i));
    }
    for (let hh = 0; hh < b.nH; hh++) node(xs[1], ys(b.nH, hh), b.hid[hh], 5);
    ctx.font = '700 12px ' + FONT;
    for (let o = 0; o < b.nO; o++) {
      const on = b.out[o] > 0.5;
      node(xs[2], ys(b.nO, o), on ? 1 : 0, 9);
      ctx.fillStyle = on ? INK : '#a9a4c4'; ctx.textAlign = 'left';
      ctx.fillText(T.outputLabels[o], xs[2] + 13, ys(b.nO, o));
    }
  }
  function drawGraph() {
    const c = $('#graph'), w = c.clientWidth, h = c.clientHeight;
    if (!w) return;
    const ctx = hud(c), hs = R.history;
    if (hs.length < 2) {
      ctx.fillStyle = '#6f6a8f'; ctx.font = '500 12px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Aparece depois de 2 gerações', w / 2, h / 2);
      return;
    }
    const max = Math.max(10, ...hs.map((p) => p[0]));
    const line = (k, col, lw) => {
      ctx.beginPath();
      hs.forEach((p, i) => {
        const x = 8 + (i * (w - 16)) / (hs.length - 1), y = h - 8 - (p[k] / max) * (h - 28);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke();
    };
    line(1, '#9a94bd', 2);
    line(0, '#ff5d8f', 3);
    ctx.fillStyle = '#6f6a8f'; ctx.font = '500 10.5px ' + FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('máx. ' + max, 8, 13);
  }

  function render() {
    const v = view($('#cv')), ctx = v.ctx, train = R.mode === 'train';
    R.VW = v.VW; R.vs = v.s; R.voy = v.oy;
    R.T.draw(ctx, R.world, R.agents, { focus: R.focus, solo: train && R.solo, solid: !train, VW: v.VW, th: NL.themes[R.def.theme] });
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (!R.paused) { p.life -= DT; p.x += p.vx * DT; p.y += p.vy * DT; p.vy += 600 * DT; }
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      ctx.globalAlpha = Math.min(1, p.life * 3);
      ctx.fillStyle = 'hsl(' + p.hue + ',88%,62%)';
      ctx.fillRect(p.x - 4, p.y - 4, 8, 8);
      ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(p.x - 4, p.y - 4, 8, 8);
    }
    ctx.globalAlpha = 1;
    if (train) { if (R.focus && !R.focus.dead) nameTag(ctx, R.focus); }
    else for (const a of R.agents) if (!a.dead) nameTag(ctx, a, a.idx ? 0 : (R.agents[1] ? 4 : 0));
    $('#stScore').textContent = score();
    $('#stRec').textContent = Math.max(R.record, score());
    if (!train) return;
    $('#stGen').textContent = R.gen;
    $('#stAlive').textContent = R.alive + '/' + R.agents.length;
    if (!R.side) return;
    $('#stWho').textContent = R.focus ? (R.focus.crown ? '👑 ' : '') + R.focus.name : '—';
    drawNN();
    if (lastGen !== R.gen) { lastGen = R.gen; drawGraph(); }
  }
  function frame() {
    requestAnimationFrame(frame);
    if (!R.active || screen !== 'run') return;
    if (!R.paused && !R.over) {
      if (R.mode !== 'train') tick();
      else if (R.speed === 'max') {
        const t0 = performance.now();
        do { for (let i = 0; i < 20; i++) tick(); } while (performance.now() - t0 < 12);
      } else for (let i = 0; i < R.speed; i++) tick();
    }
    if (R.mode === 'train') pickFocus();
    render();
  }
  addEventListener('resize', () => {
    lastGen = -1;
    if (screen === 'home') renderHome();
    if (screen === 'editor') drawTrack();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && R.active && R.mode === 'train') saveBrain(true); });

  show('home');
  renderHome();
  // redesenha as miniaturas quando a fonte/medidas estiverem prontas
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (screen === 'home') renderHome(); });
  requestAnimationFrame(frame);
})();
