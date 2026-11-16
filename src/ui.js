// Interface em HTML por cima do canvas: menu inicial, criador de personagem, HUD e pausa.
import { OPTIONS } from './character.js';

const $ = (id) => document.getElementById(id);
const SCHEMA = [
  { key: 'skin', label: 'Pele', type: 'swatch' },
  { key: 'hair', label: 'Cabelo', type: 'cycle' },
  { key: 'hairColor', label: 'Cor', type: 'swatch' },
  { key: 'eyeColor', label: 'Olhos', type: 'swatch' },
  { key: 'outfit', label: 'Roupa', type: 'cycle' },
  { key: 'shirtColor', label: 'Camisa', type: 'swatch' },
  { key: 'pantsColor', label: 'Calça', type: 'swatch' },
  { key: 'hat', label: 'Chapéu', type: 'cycle' },
];

export class UI {
  constructor(handlers) {
    this.h = handlers;
    this.screens = { menu: $('menu'), creator: $('creator'), hud: $('hud'), pause: $('pause') };
    $('btn-new').onclick = () => handlers.newGame();
    $('btn-continue').onclick = () => handlers.continueGame();
    $('btn-back').onclick = () => handlers.back();
    $('btn-random').onclick = () => handlers.random();
    $('btn-start').onclick = () => handlers.start();
    $('btn-pause').onclick = () => handlers.pause();
    $('btn-resume').onclick = () => handlers.resume();
    $('btn-edit').onclick = () => handlers.edit();
    $('btn-quit').onclick = () => handlers.quit();
    $('q-prev').onclick = () => handlers.quality(-1);
    $('q-next').onclick = () => handlers.quality(1);
    $('loading').remove();
  }

  show(...names) {
    for (const k in this.screens) this.screens[k].classList.toggle('hidden', !names.includes(k));
  }
  setHasSave(has) {
    $('btn-continue').classList.toggle('hidden', !has);
    $('btn-continue').classList.toggle('primary', has);
  }
  setTag(name) {
    $('tag').textContent = `Fazenda de ${name}`;
  }
  setQualityLabel(t) {
    $('q-label').textContent = t;
  }

  // monta as linhas do criador a partir da config atual
  buildCreator(cfg, onChange) {
    const root = $('creator-rows');
    root.textContent = '';
    const row = (label) => {
      const r = document.createElement('div');
      r.className = 'row';
      const l = document.createElement('label');
      l.textContent = label;
      r.append(l);
      root.append(r);
      return r;
    };
    const nameRow = row('Nome');
    const input = document.createElement('input');
    input.maxLength = 12;
    input.placeholder = 'Seu nome';
    input.value = cfg.name || '';
    input.autocomplete = 'off';
    input.oninput = () => { cfg.name = input.value; };
    input.onkeydown = (e) => { if (e.key === 'Enter') input.blur(); };
    nameRow.append(input);

    for (const s of SCHEMA) {
      const r = row(s.label), opts = OPTIONS[s.key];
      if (s.type === 'swatch') {
        const wrap = document.createElement('div');
        wrap.className = 'swatches';
        opts.forEach((c, i) => {
          const b = document.createElement('button');
          b.className = 'swatch' + (cfg[s.key] === i ? ' sel' : '');
          b.style.background = c;
          b.onclick = () => {
            cfg[s.key] = i;
            wrap.querySelectorAll('.swatch').forEach((el, k) => el.classList.toggle('sel', k === i));
            onChange();
          };
          wrap.append(b);
        });
        r.append(wrap);
      } else {
        const wrap = document.createElement('div');
        wrap.className = 'cycle';
        const span = document.createElement('span');
        span.textContent = opts[cfg[s.key]];
        const mk = (txt, d) => {
          const b = document.createElement('button');
          b.className = 'btn small';
          b.textContent = txt;
          b.onclick = () => {
            cfg[s.key] = (cfg[s.key] + d + opts.length) % opts.length;
            span.textContent = opts[cfg[s.key]];
            onChange();
          };
          return b;
        };
        wrap.append(mk('<', -1), span, mk('>', 1));
        r.append(wrap);
      }
    }
  }
}
