// EvoLab: telas (início, editor, treino/jogo/desafio) e laço de simulação
(function () {
  const NL = window.NL, W = NL.W, H = NL.H, DT = 1 / 60, INK = NL.INK;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const snap = (v, s) => Math.round(v / s) * s;
  const FONT = 'Fredoka,system-ui,sans-serif';

  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };

  // ───────── som (sintetizado, sem arquivos) ─────────
  const SFX = {
    tap: [[520, 0.05]], jump: [[520, 0.05], [760, 0.07]], die: [[240, 0.09], [150, 0.2]], coin: [[990, 0.05], [1320, 0.09]],
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
    { key: 'maxScore', label: 'Distância pra fechar a geração', min: 500, max: 20000, step: 500, def: 3000 },
  ];
  const cfg = Object.assign({}, ...CFG.map((c) => ({ [c.key]: c.def })), LS.get('evolab.cfg', {}));
  const MEDALS = [500, 1500, 3000], MEDAL_NAMES = ['bronze', 'prata', 'ouro'];
  const medals = (rec) => MEDALS.filter((m) => rec >= m).length;
  const WEATHER = { none: 'Limpo', chuva: 'Chuva', neve: 'Neve' };

  const SYL = ['bi', 'zu', 'ko', 'lu', 'pi', 'ta', 'mo', 'ne', 'fa', 'gi', 'do', 'xu', 'ra', 'le', 'vi', 'ju', 'ca', 'te', 'ba', 'nho'];
  function mkName() {
    let n = '';
    for (let i = 0, k = Math.random() < 0.4 ? 3 : 2; i < k; i++) n += SYL[Math.floor(Math.random() * SYL.length)];
    return n[0].toUpperCase() + n.slice(1);
  }

  const DEF_THEME = { runner: 'deserto', flyer: 'campo', dodger: 'noite', lanes: 'doce' };
  const newId = () => 'g' + Date.now().toString(36) + Math.floor(Math.random() * 1e5);
  // garante que um jogo (novo, antigo ou importado) tem todos os campos
  function normalize(g) {
    const T = NL.types[g.type];
    if (!NL.themes[g.theme]) g.theme = DEF_THEME[g.type];
    g.name = String(g.name || 'Sem nome').slice(0, 30);
    g.params = g.params || {};
    T.params.forEach((q) => { if (typeof g.params[q.key] !== 'number') g.params[q.key] = q.def; });
    g.freq = g.freq || {};
    T.pieces.forEach((q) => { if (typeof g.freq[q.id] !== 'number') g.freq[q.id] = g.pieces && g.pieces[q.id] === false ? 0 : q.freq; });
    delete g.pieces;
    g.rules = Object.assign({ lives: 1, coinVal: 50, actCost: 0 }, g.rules);
    g.look = Object.assign({ shape: 'bicho', acc: 'none', color: 'rainbow', hue: 45 }, g.look);
    if (!WEATHER[g.weather]) g.weather = 'none';
    g.sensors = g.sensors || {};
    g.len = clamp(+g.len || T.loopLen || 2400, 800, 8000);
    g.mode = g.mode === 'track' && T.pieces.length ? 'track' : 'random';
    g.track = (Array.isArray(g.track) ? g.track : []).filter((it) => it && T.pieces.some((q) => q.id === it.t)).map((it) => {
      const o = Object.assign({}, T.piece(it.t).d, it);
      if (g.type === 'flyer' && it.t === 'pipe' && it.cy == null && it.y != null) o.cy = it.y;
      if (g.type === 'lanes' && it.lane == null && it.y != null) o.lane = clamp(Math.floor((it.y - 70) / 80), 0, 2);
      o.x = clamp(+o.x || 0, 0, 8000);
      return o;
    });
    return g;
  }
  function newDef(type, name) { return normalize({ id: newId(), name, type }); }
  let games = LS.get('evolab.games', null);
  if (!games) games = [newDef('runner', 'Corrida no deserto'), newDef('flyer', 'Voo no campo'), newDef('dodger', 'Chuva de blocos'), newDef('lanes', 'Estrada doce')];
  games = games.filter((g) => g && NL.types[g.type]).map(normalize);
  function saveGames() { LS.set('evolab.games', games); }
  saveGames();
  const brainKey = (def) => 'evolab.brain.' + def.id;
  const humanKey = (def) => 'evolab.human.' + def.id;
  function loadBrain(def) {
    const b = LS.get(brainKey(def), null), T = NL.types[def.type];
    if (!b || !b.genes || b.nIn !== T.nIn) return null;
    const h = (b.genes.length - T.nOut) / (T.nIn + 1 + T.nOut);
    return Number.isInteger(h) && h > 0 ? Object.assign(b, { hidden: h }) : null;
  }
  const shareCode = (def) => 'EVO1.' + btoa(unescape(encodeURIComponent(JSON.stringify(Object.assign({}, def, { id: undefined })))));
  function importCode(code) {
    const m = String(code).trim().match(/^EVO1\.([A-Za-z0-9+/=]+)$/);
    if (!m) throw new Error('bad');
    const g = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
    if (!g || !NL.types[g.type]) throw new Error('bad');
    g.id = newId();
    return normalize(g);
  }

  // ───────── agentes (usado no treino, no jogo e na prévia do editor) ─────────
  const xbuf = new Float32Array(16);
  function mkAgent(T, def, k, i, hidden) {
    const a = T.newAgent(def);
    a.brain = k.genes ? new NL.Brain(T.nIn, hidden, T.nOut, k.genes) : null;
    a.hue = k.hue != null ? k.hue : def.look.color === 'fixed' ? def.look.hue : (i * 47 + 190) % 360;
    a.idx = i;
    a.fit = 0;
    a.name = k.name || mkName();
    a.crown = !!k.crown;
    a.got = {};
    a.coins = 0;
    a.acts = 0;
    a.pb = 0;
    a.lives = def.rules.lives;
    a.inv = 0;
    return a;
  }
  const maskOf = (def) => Object.keys(def.sensors).filter((i) => def.sensors[i] === false).map(Number);
  // um passo de um agente: sensores -> rede -> ação -> física, mais vidas e contagem de ações
  function act(T, w, a, def, human, mask) {
    let out = human;
    if (a.brain) {
      T.sense(w, a, def, xbuf);
      for (const i of mask) xbuf[i] = 0;
      out = a.brain.run(xbuf);
    }
    const bits = (out[0] > 0.5 ? 1 : 0) | (out[1] > 0.5 ? 2 : 0);
    if (bits & ~a.pb) a.acts++;
    a.pb = bits;
    T.stepAgent(w, a, out, def, DT);
    if (a.inv > 0) { a.inv -= DT; a.dead = false; }
    else if (a.dead && a.lives > 1) { a.lives--; a.inv = 1.2; a.dead = false; }
  }
  const fitOf = (a, w, def) => Math.max(0, w.dist + (a.coins * def.rules.coinVal - a.acts * def.rules.actCost) * 10);

  // ───────── navegação ─────────
  let screen = 'home';
  function show(name) {
    screen = name;
    for (const s of ['home', 'editor', 'run']) $('#' + s).hidden = s !== name;
  }
  NL.back = function () {
    if (!$('#modal').hidden) { $('#modal').hidden = true; return true; }
    if (screen === 'home') return false;
    if (screen === 'run') stopRun();
    show('home');
    renderHome();
    return true;
  };
  document.querySelectorAll('[data-back]').forEach((b) => (b.onclick = () => { Snd.play('tap'); NL.back(); }));

  // ───────── pecinhas de interface ─────────
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function slider(box, q, value, onChange) {
    const e = el('label', 'slider');
    e.innerHTML = '<div><span>' + esc(q.label) + '</span><b></b></div><input type="range" min="' + q.min + '" max="' + q.max + '" step="' + q.step + '">';
    const inp = e.querySelector('input'), out = e.querySelector('b');
    inp.value = value;
    out.textContent = +inp.value;
    inp.oninput = () => { out.textContent = +inp.value; onChange(+inp.value); };
    box.appendChild(e);
  }
  function chips(box, list, isOn, onClick) {
    const c = el('div', 'chips');
    list.forEach(([id, label]) => {
      const b = el('button', isOn(id) ? 'on' : '', label);
      b.onclick = () => { Snd.play('tap'); onClick(id); };
      c.appendChild(b);
    });
    box.appendChild(c);
    return c;
  }
  function btn(box, label, cls, onClick) {
    const b = el('button', cls, label);
    b.onclick = (e) => onClick(e.currentTarget);
    box.appendChild(b);
    return b;
  }
  // botão que pede um segundo toque antes de fazer algo sem volta
  function sure(b, label, fn) {
    if (!b.dataset.sure) {
      b.dataset.sure = 1;
      b.textContent = 'Toque de novo';
      setTimeout(() => { if (b.isConnected && b.dataset.sure) { delete b.dataset.sure; b.textContent = label; } }, 2500);
      return;
    }
    delete b.dataset.sure;
    b.textContent = label;
    fn();
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
  function weather(ctx, kind, t, VW) {
    if (kind === 'chuva') {
      ctx.strokeStyle = 'rgba(255,255,255,.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 70; i++) {
        const x = ((i * 137.5 + t * 260) % (VW + 60)) - 30, y = ((i * 71.3 + t * 900) % (H + 300)) - 300;
        ctx.moveTo(x, y);
        ctx.lineTo(x - 5, y + 16);
      }
      ctx.stroke();
    } else if (kind === 'neve') {
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      for (let i = 0; i < 60; i++) {
        const x = (i * 137.5 + Math.sin(t * 1.3 + i) * 18 + VW * 4) % VW, y = ((i * 71.3 + t * (50 + (i % 5) * 14)) % (H + 300)) - 300;
        ctx.beginPath();
        ctx.arc(x, y, 2 + (i % 3), 0, 6.2832);
        ctx.fill();
      }
    }
  }

  // ───────── início ─────────
  function thumb(c, def) {
    const T = NL.types[def.type], a = mkAgent(T, def, { hue: def.look.color === 'fixed' ? def.look.hue : 45 }, 0);
    const w = T.newWorld(def, NL.rng(7));
    for (let i = 0; i < 150; i++) T.step(w, def, DT, [a]);
    const v = view(c);
    T.draw(v.ctx, w, [a], { focus: a, VW: v.VW, th: NL.themes[def.theme], look: def.look });
    weather(v.ctx, def.weather, 1, v.VW);
  }
  function renderHome() {
    const box = $('#games');
    box.innerHTML = games.length ? '' : '<p class="empty">Nenhum jogo ainda. Crie um ali do lado.</p>';
    games.forEach((g) => {
      const b = loadBrain(g), m = b ? medals(b.record) : 0;
      const e = el('div', 'card');
      e.innerHTML =
        '<canvas></canvas><div class="in"><div class="top"><b>' + esc(g.name) + '</b><span class="stars">' +
        [0, 1, 2].map((i) => (i < m ? '<i>★</i>' : '★')).join('') + '</span></div>' +
        '<div class="meta">' + NL.types[g.type].name + ' · ' + (b ? 'geração ' + b.gen + ' · recorde ' + b.record : 'IAs sem treino') + '</div>' +
        '<div class="btns"><button class="primary" data-a="train">Treinar IAs</button>' +
        '<button data-a="play">' + (b ? 'Desafiar IA' : 'Jogar') + '</button><button data-a="edit">Editar</button></div></div>';
      e.querySelector('[data-a=train]').onclick = () => startRun(g, 'train');
      e.querySelector('[data-a=play]').onclick = () => startRun(g, b ? 'duel' : 'play');
      e.querySelector('[data-a=edit]').onclick = () => openEditor(g);
      box.appendChild(e);
      thumb(e.querySelector('canvas'), g);
    });
  }
  Object.keys(NL.types).forEach((id) => {
    const T = NL.types[id], b = el('button');
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
  $('#btImport').onclick = () => { $('#impText').value = ''; $('#impErr').textContent = ''; $('#modal').hidden = false; };
  $('#impNo').onclick = () => { $('#modal').hidden = true; };
  $('#impOk').onclick = () => {
    try {
      const g = importCode($('#impText').value);
      games.unshift(g);
      saveGames();
      $('#modal').hidden = true;
      openEditor(g);
    } catch (e) { $('#impErr').textContent = 'Esse código não é de um jogo do EvoLab.'; }
  };

  // ───────── editor ─────────
  const TABS = [['fase', 'Fase'], ['regras', 'Regras'], ['visual', 'Visual'], ['ia', 'IA'], ['mais', 'Mais']];
  const E = { tab: 'fase', scroll: 0, sel: null, tool: null, drag: null, undo: [], redo: [], P: null, dirtyAt: 0 };
  let ed = null;
  const levelMode = () => ed && ed.mode === 'track' && E.tab === 'fase';
  function changed() { saveGames(); E.dirtyAt = Date.now() + 250; }

  function openEditor(def) {
    ed = def;
    const T = NL.types[def.type];
    Object.assign(E, { tab: 'fase', scroll: -40, sel: null, tool: T.pieces.length ? T.pieces[0].id : null, drag: null, undo: [], redo: [], P: null, dirtyAt: 0 });
    $('#edName').value = def.name;
    show('editor');
    renderEditor();
  }
  function renderEditor() {
    const tabs = $('#edTabs');
    tabs.innerHTML = '';
    TABS.forEach(([id, label]) => {
      const b = el('button', E.tab === id ? 'on' : '', label);
      b.onclick = () => { E.tab = id; Snd.play('tap'); renderEditor(); };
      tabs.appendChild(b);
    });
    renderTools();
    renderPane();
  }
  function pushUndo() {
    E.undo.push(JSON.stringify(ed.track));
    if (E.undo.length > 60) E.undo.shift();
    E.redo = [];
  }
  function undo(from, to) {
    if (!from.length) return;
    to.push(JSON.stringify(ed.track));
    ed.track = JSON.parse(from.pop());
    E.sel = null;
    changed();
    renderEditor();
  }
  function delSel() {
    if (!E.sel) return;
    pushUndo();
    ed.track = ed.track.filter((it) => it !== E.sel);
    E.sel = null;
    changed();
    renderEditor();
  }
  function renderTools() {
    const box = $('#edTools'), T = NL.types[ed.type];
    const acts = $('#edActs');
    box.hidden = acts.hidden = !levelMode();
    box.innerHTML = acts.innerHTML = '';
    if (box.hidden) return;
    T.pieces.forEach((q) => {
      const b = el('button', 'small' + (E.tool === q.id ? ' on' : ''), q.label);
      b.onclick = () => { E.tool = E.tool === q.id ? null : q.id; Snd.play('tap'); renderTools(); };
      box.appendChild(b);
    });
    btn(acts, '↶', 'small', () => undo(E.undo, E.redo)).disabled = !E.undo.length;
    btn(acts, '↷', 'small', () => undo(E.redo, E.undo)).disabled = !E.redo.length;
    btn(acts, 'Apagar', 'small danger', delSel).disabled = !E.sel;
  }

  const PANES = {
    fase(box, T) {
      const track = ed.mode === 'track';
      if (T.pieces.length)
        chips(box, [['random', 'Sorteada'], ['track', 'Montada por mim']], (id) => ed.mode === id, (id) => { ed.mode = id; E.sel = null; changed(); renderEditor(); }).className = 'seg';
      if (track) {
        if (E.sel) {
          const it = E.sel, q = T.piece(it.t);
          box.appendChild(el('h3', '', 'Peça selecionada: ' + q.label));
          slider(box, { label: 'Posição na pista', min: 0, max: ed.len, step: 10 }, it.x, (v) => { it.x = v; changed(); });
          q.props.forEach((pr) => slider(box, pr, it[pr.key], (v) => { it[pr.key] = v; changed(); }));
          const row = el('div', 'actions');
          btn(row, 'Duplicar peça', 'small', () => {
            pushUndo();
            const c = Object.assign({}, it, { x: clamp(it.x + (it.w || 40) + 60, 0, ed.len - 20) });
            ed.track.push(c);
            E.sel = c;
            changed();
            renderEditor();
          });
          btn(row, 'Apagar peça', 'small danger', delSel);
          box.appendChild(row);
        } else box.appendChild(el('p', 'hint', 'Escolha uma peça embaixo da pista e toque onde quer colocar. Toque numa peça pra selecionar e mudar tamanho, altura e movimento. Arraste a peça pra mover; arraste o fundo pra andar pela pista.'));
        box.appendChild(el('h3', '', 'Pista (' + ed.track.length + ' peças)'));
        slider(box, { label: 'Comprimento antes de repetir', min: 800, max: 8000, step: 200 }, ed.len, (v) => { ed.len = v; changed(); });
        const row = el('div', 'actions');
        btn(row, '🎲 Preencher', 'small', () => { pushUndo(); ed.track = T.randomTrack(ed, ed.len); E.sel = null; changed(); renderEditor(); });
        btn(row, 'Limpar tudo', 'small danger', (b) => sure(b, 'Limpar tudo', () => { pushUndo(); ed.track = []; E.sel = null; changed(); renderEditor(); }));
        box.appendChild(row);
        box.appendChild(el('p', 'hint', '"Preencher" sorteia uma pista inteira usando as frequências do modo Sorteada, pra você ajustar depois.'));
      } else {
        if (T.pieces.length) {
          box.appendChild(el('h3', '', 'Com que frequência cada peça aparece'));
          T.pieces.forEach((q) => slider(box, { label: q.label, min: 0, max: 10, step: 1 }, ed.freq[q.id], (v) => { ed.freq[q.id] = v; changed(); }));
        }
        box.appendChild(el('h3', '', 'Sorteio'));
        T.params.filter((q) => q.random).forEach((q) => slider(box, q, ed.params[q.key], (v) => { ed.params[q.key] = v; changed(); }));
        box.appendChild(el('p', 'hint', 'A cada geração o sorteio muda, então as IAs não conseguem decorar a fase.'));
      }
    },
    regras(box, T) {
      box.appendChild(el('h3', '', 'Dificuldade pronta'));
      chips(box, Object.keys(T.presets).map((k) => [k, k]).concat([['rnd', '🎲 Surpresa']]), () => false, (id) => {
        T.params.forEach((q) => {
          if (id === 'rnd') ed.params[q.key] = clamp(+snap(q.min + ((Math.random() + Math.random()) / 2) * (q.max - q.min), q.step).toFixed(2), q.min, q.max);
          else ed.params[q.key] = id in T.presets && q.key in T.presets[id] ? T.presets[id][q.key] : q.def;
        });
        changed();
        renderPane();
      });
      box.appendChild(el('h3', '', 'Ajuste fino'));
      T.params.filter((q) => !q.random).forEach((q) => slider(box, q, ed.params[q.key], (v) => { ed.params[q.key] = v; changed(); }));
      slider(box, { label: 'Vidas (batidas que aguenta)', min: 1, max: 5, step: 1 }, ed.rules.lives, (v) => { ed.rules.lives = v; changed(); });
    },
    visual(box, T) {
      const pick = (title, map, get, set) => {
        box.appendChild(el('h3', '', title));
        chips(box, Object.keys(map).map((k) => [k, map[k].name || map[k]]), (id) => get() === id, (id) => { set(id); changed(); renderPane(); });
      };
      pick('Cenário', NL.themes, () => ed.theme, (v) => (ed.theme = v));
      pick('Clima', WEATHER, () => ed.weather, (v) => (ed.weather = v));
      if (T.shapes) pick('Personagem', NL.shapes, () => ed.look.shape, (v) => (ed.look.shape = v));
      pick('Enfeite', NL.accs, () => ed.look.acc, (v) => (ed.look.acc = v));
      pick('Cor das IAs', { rainbow: 'Cada uma de uma cor', fixed: 'Todas iguais' }, () => ed.look.color, (v) => (ed.look.color = v));
      if (ed.look.color === 'fixed') slider(box, { label: 'Tom da cor', min: 0, max: 350, step: 10 }, ed.look.hue, (v) => { ed.look.hue = v; changed(); });
    },
    ia(box, T) {
      box.appendChild(el('h3', '', 'O que a IA enxerga'));
      chips(box, T.inputLabels.map((l, i) => [i, l]), (i) => ed.sensors[i] !== false, (i) => { ed.sensors[i] = ed.sensors[i] === false; changed(); renderPane(); });
      box.appendChild(el('p', 'hint', 'Desligue um sentido e veja se ela ainda aprende. Cada um é uma entrada da rede neural.'));
      box.appendChild(el('h3', '', 'Recompensa (o que conta como "ir bem")'));
      slider(box, { label: 'Pontos por moeda', min: 0, max: 300, step: 10 }, ed.rules.coinVal, (v) => { ed.rules.coinVal = v; changed(); });
      slider(box, { label: 'Custo de cada ação (evita apertar à toa)', min: 0, max: 20, step: 1 }, ed.rules.actCost, (v) => { ed.rules.actCost = v; changed(); });
      box.appendChild(el('p', 'hint', 'A pontuação é a distância, mais as moedas, menos o custo das ações. As IAs com mais pontos passam os genes adiante.'));
      const b = loadBrain(ed);
      box.appendChild(el('h3', '', 'Treino deste jogo'));
      box.appendChild(el('p', 'hint', b ? 'Geração ' + b.gen + ', recorde ' + b.record + ', campeã ' + (b.name || '?') + '.' : 'Ainda sem treino.'));
      if (b) btn(box, 'Zerar treino', 'small danger', (x) => sure(x, 'Zerar treino', () => { LS.del(brainKey(ed)); E.P = null; renderPane(); }));
    },
    mais(box, T) {
      box.appendChild(el('p', 'hint', T.icon + ' ' + T.name + ' — ' + T.desc));
      const row = el('div', 'actions');
      btn(row, 'Duplicar jogo', 'small', () => {
        const g = JSON.parse(JSON.stringify(ed));
        g.id = newId();
        g.name = (ed.name + ' 2').slice(0, 30);
        games.unshift(g);
        saveGames();
        openEditor(g);
      });
      btn(row, 'Excluir jogo', 'small danger', (b) => sure(b, 'Excluir jogo', () => {
        LS.del(brainKey(ed));
        LS.del(humanKey(ed));
        games = games.filter((g) => g !== ed);
        saveGames();
        NL.back();
      }));
      box.appendChild(row);
      box.appendChild(el('h3', '', 'Compartilhar'));
      box.appendChild(el('p', 'hint', 'Mande este código pra um amigo. Ele cola em "Importar código" na tela inicial e recebe o jogo (sem as IAs treinadas).'));
      const ta = el('textarea', 'code');
      ta.readOnly = true;
      ta.value = shareCode(ed);
      box.appendChild(ta);
      btn(box, 'Copiar código', 'small', (b) => {
        ta.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (e) {}
        if (!ok && navigator.clipboard) navigator.clipboard.writeText(ta.value).catch(() => {});
        b.textContent = 'Copiado!';
        setTimeout(() => { if (b.isConnected) b.textContent = 'Copiar código'; }, 1500);
      });
    },
  };
  function renderPane() {
    const box = $('#edPane'), top = box.scrollTop;
    box.innerHTML = '';
    PANES[E.tab](box, NL.types[ed.type]);
    box.scrollTop = top;
  }
  $('#edName').oninput = (e) => { ed.name = e.target.value.trim().slice(0, 30) || 'Sem nome'; saveGames(); };
  $('#edTrain').onclick = () => startRun(ed, 'train');
  $('#edPlay').onclick = () => startRun(ed, 'play');

  // construtor de fase: toque coloca, arrasta move, arrasta o fundo anda
  const obsOf = (T, it) => { const o = Object.assign({}, T.piece(it.t).d, it); T.fin(o, ed); return o; };
  function evPos(e) {
    const r = $('#edCv').getBoundingClientRect();
    return { x: (e.clientX - r.left) / E.vs + E.scroll, y: (e.clientY - r.top) / E.vs - E.voy, px: e.clientX, py: e.clientY };
  }
  function hitItem(T, p) {
    let best = null, area = Infinity;
    for (const it of ed.track) {
      const o = obsOf(T, it), b = T.box(o);
      if (p.x < it.x - 8 || p.x > it.x + o.w + 8 || p.y < b.y - 8 || p.y > b.y + b.h + 8) continue;
      if (o.w * b.h < area) { area = o.w * b.h; best = it; }
    }
    return best;
  }
  $('#edCv').addEventListener('pointerdown', (e) => {
    if (!levelMode()) return;
    const T = NL.types[ed.type], p = evPos(e), hit = hitItem(T, p);
    E.drag = hit ? { it: hit, dx: p.x - hit.x, px: p.px, py: p.py, moved: false } : { s0: E.scroll, px: p.px, py: p.py, moved: false };
    if (hit !== E.sel && hit) { E.sel = hit; renderEditor(); }
    try { e.target.setPointerCapture(e.pointerId); } catch (x) {}
  });
  $('#edCv').addEventListener('pointermove', (e) => {
    const d = E.drag;
    if (!d || !levelMode()) return;
    const T = NL.types[ed.type], p = evPos(e);
    if (!d.moved && Math.hypot(p.px - d.px, p.py - d.py) > 7) { d.moved = true; if (d.it) pushUndo(); }
    if (!d.moved) return;
    if (d.it) {
      d.it.x = clamp(snap(p.x - d.dx, 10), 0, Math.max(0, ed.len - (d.it.w || 20)));
      T.place(d.it, p.y, false);
    } else E.scroll = d.s0 - (p.px - d.px) / E.vs;
  });
  const endDrag = (e) => {
    const d = E.drag;
    E.drag = null;
    if (!d || !levelMode()) return;
    const T = NL.types[ed.type];
    if (d.moved) { if (d.it) { changed(); renderEditor(); } return; }
    if (d.it || e.type !== 'pointerup') return;
    if (!E.tool) { if (E.sel) { E.sel = null; renderEditor(); } return; }
    const p = evPos(e), it = T.make(E.tool, {});
    if (p.x < 0 || p.x > ed.len) return;
    it.x = clamp(snap(p.x - it.w / 2, 10), 0, Math.max(0, ed.len - it.w));
    T.place(it, p.y, true);
    pushUndo();
    ed.track.push(it);
    E.sel = it;
    Snd.play('tap');
    changed();
    renderEditor();
  };
  $('#edCv').addEventListener('pointerup', endDrag);
  $('#edCv').addEventListener('pointercancel', endDrag);

  function drawLevel() {
    const T = NL.types[ed.type], th = NL.themes[ed.theme], v = view($('#edCv')), ctx = v.ctx;
    E.vs = v.s; E.voy = v.oy;
    E.scroll = clamp(E.scroll, -40, Math.max(-40, ed.len - v.VW + 60));
    const sc = E.scroll;
    T.bg(ctx, th, sc, v.VW);
    ctx.fillStyle = 'rgba(29,26,57,.13)';
    for (let x = Math.ceil(sc / 200) * 200; x < sc + v.VW; x += 200) if (x > 0 && x < ed.len) ctx.fillRect(x - sc, -600, 2, H + 600);
    for (const it of ed.track) {
      const sx = it.x - sc;
      if (sx < -260 || sx > v.VW || it.x >= ed.len) continue;
      const o = obsOf(T, it);
      T.drawObs(ctx, o, sx, th, 0, null, ed);
      if (o.amp) {
        ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.font = '700 18px ' + FONT; ctx.textAlign = 'center';
        const b = T.box(o), ty = clamp(b.y - 8, 34 - v.oy, H - 60);
        ctx.strokeText('↕', sx + o.w / 2, ty); ctx.fillText('↕', sx + o.w / 2, ty);
      }
      if (it === E.sel) {
        const b = T.box(o);
        ctx.setLineDash([7, 5]);
        ctx.lineWidth = 3; ctx.strokeStyle = '#fff';
        ctx.strokeRect(sx - 5, b.y - 5, o.w + 10, b.h + 10);
        ctx.lineDashOffset = 6; ctx.strokeStyle = INK;
        ctx.strokeRect(sx - 5, b.y - 5, o.w + 10, b.h + 10);
        ctx.setLineDash([]); ctx.lineDashOffset = 0;
      }
    }
    // fora da pista fica escurecido; os rótulos marcam início e fim do loop
    ctx.fillStyle = 'rgba(29,26,57,.5)';
    if (sc < 0) ctx.fillRect(0, -600, -sc, H + 600);
    if (ed.len - sc < v.VW) ctx.fillRect(ed.len - sc, -600, v.VW, H + 600);
    ctx.font = '700 13px ' + FONT; ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.lineJoin = 'round';
    const lab = (t, x) => { ctx.strokeText(t, x, 18 - v.oy); ctx.fillText(t, x, 18 - v.oy); };
    if (sc < 60) lab('início ▸', -sc + 6);
    if (ed.len - sc < v.VW) lab('◂ fim (repete)', ed.len - sc + 6);
    // barrinha mostrando onde você está na pista
    const bw = v.VW - 24, k = bw / (ed.len + 100);
    ctx.fillStyle = 'rgba(29,26,57,.4)';
    NL.rr(ctx, 12, H - 12, bw, 6, 3); ctx.fill();
    ctx.fillStyle = '#fff';
    NL.rr(ctx, 12 + (sc + 40) * k, H - 12, Math.min(bw, Math.max(20, v.VW * k)), 6, 3); ctx.fill();
  }

  // prévia animada: a campeã jogando (ou um personagem fantasma se ainda não há treino)
  function previewReset() {
    const T = NL.types[ed.type], b = loadBrain(ed);
    E.P = {
      w: T.newWorld(ed, NL.rng(11 + Math.floor(Math.random() * 99))), ghost: !b, mask: maskOf(ed),
      a: mkAgent(T, ed, { genes: b ? Float32Array.from(b.genes) : null, name: b ? b.name : '', hue: ed.look.color === 'fixed' ? ed.look.hue : 45, crown: !!b }, 0, b && b.hidden),
    };
    $('#edBadge').textContent = b ? 'Prévia: ' + (b.name || 'a campeã') + ' jogando' : 'Prévia · treine as IAs pra ver a campeã jogando aqui';
  }
  function drawPreview() {
    const T = NL.types[ed.type];
    if (!E.P || (E.dirtyAt && Date.now() > E.dirtyAt)) { E.dirtyAt = 0; previewReset(); }
    const P = E.P;
    T.step(P.w, ed, DT, [P.a]);
    if (!P.ghost) act(T, P.w, P.a, ed, null, P.mask);
    if (P.a.dead || P.w.dist > 15000) { previewReset(); return; }
    const v = view($('#edCv'));
    T.draw(v.ctx, P.w, [P.a], { focus: P.a, VW: v.VW, th: NL.themes[ed.theme], look: ed.look, ghost: P.ghost });
    weather(v.ctx, ed.weather, P.w.t, v.VW);
  }

  // ───────── treino / jogo / desafio ─────────
  const R = { active: false, side: window.innerWidth >= 760 };
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
      active: true, def, T, mode, paused: false, over: false, input: [0, 0], followBest: true, solo: false, mask: maskOf(def),
      gen: 1, record: 0, history: [], champion: null, champName: '', champFit: -1, lastSave: 0, focus: null, hidden: cfg.hidden,
    });
    const train = mode === 'train';
    $('#side').hidden = !(train && R.side);
    $('#btSide').parentElement.hidden = !train;
    $('#speedBox').hidden = !train;
    $('#playCtl').hidden = train;
    $('#overMsg').hidden = true;
    $('#stGen').parentElement.hidden = $('#stAlive').parentElement.hidden = !train;
    $('#stLives').parentElement.hidden = train || def.rules.lives < 2;
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
    R.agents = kids.map((k, i) => mkAgent(R.T, R.def, k, i, R.hidden));
    R.alive = R.agents.length;
    R.world = R.T.newWorld(R.def, NL.rng((Math.random() * 2 ** 32) >>> 0));
    R.focus = R.agents[0];
    R.over = false;
  }
  const dscore = () => Math.floor(R.world.dist / 10);
  const pts = (a) => Math.floor((a.dead ? a.fit : fitOf(a, R.world, R.def)) / 10);

  function puff(a) {
    if (parts.length > 160 || (R.mode === 'train' && (R.speed === 'max' || R.speed > 5))) return;
    const p = R.T.agentPos(R.world, a, R.VW || W);
    for (let i = 0; i < 7; i++) {
      const ang = Math.random() * 6.28, v = 60 + Math.random() * 160;
      parts.push({ x: p.x, y: p.y, vx: Math.cos(ang) * v - 80, vy: Math.sin(ang) * v - 120, life: 0.5 + Math.random() * 0.3, hue: a.hue });
    }
  }

  function tick() {
    const T = R.T, w = R.world, def = R.def, train = R.mode === 'train';
    T.step(w, def, DT, R.agents);
    for (const a of R.agents) {
      if (a.dead) continue;
      const c0 = a.coins, l0 = a.lives;
      act(T, w, a, def, R.input, R.mask);
      if (!train && !a.brain) { if (a.coins > c0) Snd.play('coin'); if (a.lives < l0) Snd.play('die'); }
      if (a.dead) { a.fit = fitOf(a, w, def); R.alive--; puff(a); }
    }
    if (train) {
      if (!R.alive || dscore() >= cfg.maxScore) endGeneration();
      return;
    }
    const me = R.agents[0], ai = R.agents[1];
    if (me.dead || (ai && ai.dead)) gameOver(me, ai);
  }
  function gameOver(me, ai) {
    R.over = true;
    const p = pts(me), rec = Math.max(R.record, p);
    if (p > R.record) { R.record = p; LS.set(humanKey(R.def), p); }
    let title = 'Fim de jogo!', won = false;
    if (ai) {
      if (!me.dead) { title = 'Você venceu ' + ai.name + '!'; won = true; }
      else if (ai.dead) title = 'Empate!';
      else title = ai.name + ' ganhou!';
    }
    $('#overTitle').textContent = title;
    $('#overText').textContent = p + ' pontos · seu recorde: ' + rec;
    $('#overMsg').hidden = false;
    Snd.play(won ? 'win' : 'die');
  }

  function endGeneration() {
    const w = R.world;
    for (const a of R.agents) if (!a.dead) a.fit = fitOf(a, w, R.def);
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
    LS.set(brainKey(R.def), { gen: R.gen, record: R.record, champFit: R.champFit, name: R.champName, nIn: R.T.nIn, genes: Array.from(R.champion), history: R.history });
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
  $('#btReset').onclick = (e) => sure(e.currentTarget, 'Zerar treino', resetTraining);
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
    if (v && !R.input[c.out] && !R.over) Snd.play(c.out === 0 ? 'jump' : 'tap');
    R.input[c.out] = v;
  }
  function buildPlayCtl() {
    const box = $('#playCtl'), cs = R.T.controls;
    box.innerHTML = '';
    cs.forEach((c, i) => {
      const b = el('button', cs.length === 1 || i === 1 ? 'r' : R.T.splitCtl ? 'l' : 'r2', c.label);
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
    const p = R.T.agentPos(R.world, a, R.VW), tall = a.crown || up || R.def.look.acc !== 'none';
    const y = p.top - (tall ? 30 : 16) - (up ? 16 : 0);
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
    const T = R.T, xs = [96, w / 2 + 14, w - 70], off = R.def.sensors;
    const ys = (n, i) => ((i + 0.5) * h) / n;
    const edge = (x0, y0, x1, y1, wt, a0) => {
      const a = Math.min(1, Math.abs(wt) / 2) * (0.12 + 0.88 * Math.min(1, Math.abs(a0)));
      if (a < 0.05) return;
      ctx.strokeStyle = (wt > 0 ? 'rgba(18,184,134,' : 'rgba(255,93,143,') + a.toFixed(2) + ')';
      ctx.lineWidth = Math.min(3.5, 0.6 + Math.abs(wt));
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    };
    for (let hh = 0; hh < b.nH; hh++) {
      for (let i = 0; i < b.nI; i++) if (off[i] !== false) edge(xs[0], ys(b.nI, i), xs[1], ys(b.nH, hh), b.w1(i, hh), b.inp[i]);
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
      ctx.globalAlpha = off[i] === false ? 0.3 : 1;
      node(xs[0], ys(b.nI, i), b.inp[i], 4.5);
      ctx.fillStyle = '#6f6a8f'; ctx.textAlign = 'right';
      ctx.fillText(T.inputLabels[i], xs[0] - 9, ys(b.nI, i));
    }
    ctx.globalAlpha = 1;
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
    const v = view($('#cv')), ctx = v.ctx, train = R.mode === 'train', def = R.def;
    R.VW = v.VW; R.vs = v.s; R.voy = v.oy;
    R.T.draw(ctx, R.world, R.agents, { focus: R.focus, solo: train && R.solo, solid: !train, VW: v.VW, th: NL.themes[def.theme], look: def.look });
    weather(ctx, def.weather, R.world.t, v.VW);
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
    else for (const a of R.agents) if (!a.dead) nameTag(ctx, a, !a.idx && R.agents[1]);
    const who = train ? R.focus : R.agents[0], p = who ? pts(who) : 0;
    $('#stScore').textContent = p;
    $('#stRec').textContent = Math.max(R.record, p);
    if (!train) { $('#stLives').textContent = '♥'.repeat(Math.max(0, R.agents[0].lives)); return; }
    $('#stGen').textContent = R.gen;
    $('#stAlive').textContent = R.alive + '/' + R.agents.length;
    if (!R.side) return;
    $('#stWho').textContent = R.focus ? (R.focus.crown ? '👑 ' : '') + R.focus.name : '—';
    drawNN();
    if (lastGen !== R.gen) { lastGen = R.gen; drawGraph(); }
  }
  function frame() {
    requestAnimationFrame(frame);
    if (screen === 'editor' && ed) {
      const lv = levelMode();
      $('#edBadge').hidden = lv;
      if (lv) drawLevel(); else drawPreview();
      return;
    }
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
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && R.active && R.mode === 'train') saveBrain(true); });

  show('home');
  renderHome();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (screen === 'home') renderHome(); });
  requestAnimationFrame(frame);
})();
