// DOM HUD: hotbar, vitals, boss bar, messages, inventory + crafting, NPC dialog, menus.
import { ITEM_BY_ID, ITEMS, RECIPES, BUFFS, itemIcon, itemName } from './items.js';
import { EQUIP_START, EQUIP_KINDS } from './player.js';
import { Painter } from './pixel.js';
import { sfx } from './audio.js';

const $ = (s) => document.querySelector(s);
function h(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }

function pixelIcon(rows, pal, scale = 3) {
  const p = new Painter(rows[0].length, rows.length, 1);
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) p.set(x, y, pal[ch]); }));
  return p.toCanvas(scale).toDataURL();
}
const HEART = ['.oo.oo.', 'oHhohho', 'oHhhhho', 'ohhhhdo', '.ohhdo.', '..odo..', '...o...'];
const heartFull = pixelIcon(HEART, { o: '#3a0d14', H: '#ffd0da', h: '#e8344f', d: '#a51d33' });
const heartHalf = pixelIcon(HEART.map((r) => r.slice(0, 4).replace(/[hHd]/g, 'h') + r.slice(4).replace(/[hHd]/g, 'e')), { o: '#3a0d14', h: '#e8344f', e: '#4a2a30' });
const heartEmpty = pixelIcon(HEART, { o: '#3a0d14', H: '#5a3a40', h: '#4a2a30', d: '#3a1f24' });
const STAR = ['...o...', '..oSo..', 'ooSssoo', 'osssssd', '.ossdo.', '.osdod.', 'oo...oo'];
const starFull = pixelIcon(STAR, { o: '#0d1a3a', S: '#e6f3ff', s: '#3a8ae8', d: '#1f4fa8' });
const starEmpty = pixelIcon(STAR, { o: '#0d1a3a', S: '#3a4a6a', s: '#26324a', d: '#1a2236' });

export class UI {
  constructor(game) {
    this.game = game;
    this.hotbar = $('#hotbar');
    this.slots = [];
    for (let i = 0; i < 9; i++) {
      const s = h('button', 'slot');
      s.innerHTML = `<span class="num">${i + 1}</span><img alt=""><span class="cnt"></span>`;
      s.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); game.selectSlot(i); });
      this.hotbar.appendChild(s);
      this.slots.push(s);
    }
    this.hearts = $('#hearts'); this.stars = $('#stars');
    this.lifeTxt = $('#lifetxt'); this.manaTxt = $('#manatxt');
    this.itemName = $('#itemname');
    this.feed = $('#feed');
    this.msg = $('#msg');
    this.bossbar = $('#bossbar');
    this.info = $('#info');
    this.invSel = -1;
    this.panel = $('#invpanel');
    this.invGrid = $('#invgrid');
    this.craftList = $('#craftlist');
    this.stationTxt = $('#stations');
    this.invSlots = [];
    const eqRow = document.getElementById('equipgrid');
    const eqNames = { head: 'Cabeça', body: 'Corpo', legs: 'Pernas', acc: 'Acessório' };
    for (let i = 0; i < 43; i++) {
      if (i >= EQUIP_START) {
        const s = h('button', 'slot eq');
        s.innerHTML = `<span class="num">${eqNames[EQUIP_KINDS[i - EQUIP_START]]}</span><img alt=""><span class="cnt"></span>`;
        s.addEventListener('click', () => this.clickInv(i));
        eqRow.appendChild(s);
        this.invSlots.push(s);
        continue;
      }
      const s = h('button', 'slot' + (i < 9 ? ' hot' : ''));
      s.innerHTML = '<img alt=""><span class="cnt"></span>';
      s.addEventListener('click', () => this.clickInv(i));
      this.invGrid.appendChild(s);
      this.invSlots.push(s);
    }
    $('#invclose').addEventListener('click', () => game.togglePanel(false));
    $('#invdrop').addEventListener('click', () => this.dropSelected());
    $('#invsort').addEventListener('click', () => this.sortInv());
    game.player.inv.listeners.push(() => this.refreshInv());
    this.lastHp = -1; this.lastMana = -1; this.lastMax = -1;
    this.feedItems = [];
    this.msgT = 0;
  }

  refreshInv() {
    const inv = this.game.player.inv;
    this.slots.forEach((s, i) => this.fillSlot(s, inv.slots[i], i === inv.sel));
    if (!this.panel.hidden) {
      this.invSlots.forEach((s, i) => this.fillSlot(s, inv.slots[i], i === this.invSel));
      this.renderCraft();
      const sel = this.invSel >= 0 ? inv.slots[this.invSel] : null;
      $('#invdesc').textContent = sel ? `${itemName(sel.id)}${ITEM_BY_ID[sel.id].desc ? ' · ' + ITEM_BY_ID[sel.id].desc : ''}` : 'Toque em um item para movê-lo. Toque em outro espaço para trocar.';
    }
    const cur = inv.selected;
    this.game.player.setHeld(cur ? cur.id : -1);
  }
  fillSlot(s, item, selected) {
    const img = s.querySelector('img'), cnt = s.querySelector('.cnt');
    s.classList.toggle('sel', !!selected);
    if (item) {
      const src = itemIcon(item.id);
      if (img.getAttribute('src') !== src) img.src = src;
      img.style.visibility = 'visible';
      cnt.textContent = item.count > 1 ? item.count : '';
      s.title = itemName(item.id);
    } else { img.style.visibility = 'hidden'; cnt.textContent = ''; s.title = ''; }
  }
  showItemName(name) {
    this.itemName.textContent = name;
    this.itemName.classList.remove('fade');
    void this.itemName.offsetWidth;
    this.itemName.classList.add('fade');
  }

  clickInv(i) {
    const inv = this.game.player.inv;
    sfx('click');
    if (this.invSel < 0) { if (inv.slots[i]) this.invSel = i; }
    else if (this.invSel === i) this.invSel = -1;
    else {
      const a = inv.slots[this.invSel], b = inv.slots[i];
      if (a && b && a.id === b.id && b.count < inv.max(b.id)) {
        const k = Math.min(a.count, inv.max(b.id) - b.count);
        b.count += k; a.count -= k;
        if (!a.count) inv.slots[this.invSel] = null;
      } else {
        if (!inv.fits(i, a && a.id) || !inv.fits(this.invSel, b && b.id)) { this.message('Esse item não vai nesse espaço.', '#ff9aaa'); this.invSel = -1; inv.changed(); return; }
        inv.slots[this.invSel] = b; inv.slots[i] = a;
      }
      this.invSel = -1;
    }
    this.game.player.recalcStats();
    inv.changed();
  }
  dropSelected() {
    const inv = this.game.player.inv;
    if (this.invSel < 0 || !inv.slots[this.invSel]) return;
    const s = inv.slots[this.invSel];
    this.game.dropFromPlayer(s.id, s.count);
    inv.slots[this.invSel] = null;
    this.invSel = -1;
    inv.changed();
  }
  sortInv() {
    const inv = this.game.player.inv;
    const rest = inv.slots.slice(9).filter(Boolean).sort((a, b) => a.id - b.id);
    for (let i = 9; i < 36; i++) inv.slots[i] = rest[i - 9] || null;
    this.invSel = -1;
    inv.changed();
  }

  icon(id) { return itemIcon(id); }
  renderBuffs() {
    const p = this.game.player;
    const html = p.buffs.map((b) => { const B = BUFFS[b.key]; const pot = Object.values(ITEMS).find((it) => it.buff === b.key); const t = b.time > 60 ? `${Math.ceil(b.time / 60)}m` : `${Math.ceil(b.time)}s`; return `<div class="buff" title="${B.name}"><img src="${pot ? itemIcon(pot.id) : ''}" alt=""><span>${t}</span></div>`; }).join('');
    if (html !== this.lastBuffs) { this.lastBuffs = html; document.getElementById('buffs').innerHTML = html; }
    const st = p.stats;
    const d = document.getElementById('defense');
    const txt = st.defense ? `Defesa ${st.defense}` : '';
    if (d.textContent !== txt) d.textContent = txt;
  }
  renderCraft() {
    const g = this.game, inv = g.player.inv;
    const st = g.nearStations();
    this.stationTxt.innerHTML = `<span class="${st.workbench ? 'ok' : 'no'}">Bancada</span><span class="${st.furnace ? 'ok' : 'no'}">Fornalha</span>`;
    const frag = document.createDocumentFragment();
    const rows = RECIPES.map((r, i) => {
      const stationOk = !r.station || st[r.station];
      const haveAll = r.in.every(([it, n]) => inv.count(it.id) >= n);
      return { r, i, ok: g.settings.creative || (stationOk && haveAll), stationOk, haveAll };
    }).sort((a, b) => (b.ok - a.ok) || (b.stationOk - a.stationOk));
    if (g.settings.creative) {
      const all = h('div', 'creative');
      all.innerHTML = '<div class="help">Modo criativo: toque para pegar.</div>';
      const grid = h('div', 'cgrid');
      for (const it of Object.values(ITEMS)) {
        const b = h('button', 'slot'); b.title = it.name;
        b.innerHTML = `<img src="${itemIcon(it.id)}" alt="">`;
        b.addEventListener('click', () => { inv.add(it.id, it.stack > 1 ? Math.min(it.stack, 30) : 1); this.pickup(it.id, 1); });
        grid.appendChild(b);
      }
      all.appendChild(grid);
      frag.appendChild(all);
    }
    for (const { r, i, ok, stationOk } of rows) {
      const row = h('div', 'recipe' + (ok ? ' ok' : ''));
      const out = h('div', 'rout');
      out.innerHTML = `<img src="${itemIcon(r.out[0].id)}" alt=""><div><b>${r.out[0].name}</b>${r.out[1] > 1 ? ` <small>x${r.out[1]}</small>` : ''}<div class="ring">${r.in.map(([it, n]) => `<span class="${inv.count(it.id) >= n ? '' : 'miss'}"><img src="${itemIcon(it.id)}" alt="">${n}</span>`).join('')}${r.station && !stationOk ? `<span class="miss st">${r.station === 'workbench' ? 'precisa de Bancada' : 'precisa de Fornalha'}</span>` : ''}</div></div>`;
      const btn = h('button', 'btn small', 'Criar');
      btn.disabled = !ok;
      btn.addEventListener('click', () => g.craft(i));
      row.append(out, btn);
      frag.appendChild(row);
    }
    this.craftList.replaceChildren(frag);
  }

  update(dt) {
    const g = this.game, p = g.player;
    if (p.hp !== this.lastHp || p.maxHp !== this.lastMax) {
      this.lastHp = p.hp; this.lastMax = p.maxHp;
      const n = Math.ceil(p.maxHp / 20);
      let html = '';
      for (let i = 0; i < n; i++) {
        const v = p.hp - i * 20;
        html += `<img src="${v >= 20 ? heartFull : v >= 10 ? heartHalf : heartEmpty}" alt="">`;
      }
      this.hearts.innerHTML = html;
      this.lifeTxt.textContent = `Vida ${Math.ceil(p.hp)}/${p.maxHp}`;
    }
    const mana = Math.floor(p.mana);
    if (mana !== this.lastMana) {
      this.lastMana = mana;
      let html = '';
      for (let i = 0; i < Math.ceil((p.maxManaTotal || p.maxMana) / 20); i++) html += `<img src="${mana - i * 20 >= 10 ? starFull : starEmpty}" alt="">`;
      this.stars.innerHTML = html;
      this.manaTxt.textContent = `Mana ${mana}`;
    }
    this.renderBuffs();
    // boss bar
    const b = g.boss && !g.boss.dead ? g.boss : null;
    this.bossbar.hidden = !b;
    if (b) {
      $('#bossname').textContent = b.name;
      $('#bossfill').style.width = `${Math.max(0, b.hp / b.maxHp) * 100}%`;
      $('#bosshp').textContent = `${Math.max(0, Math.ceil(b.hp))} / ${b.maxHp}`;
    }
    // feed
    for (let i = this.feedItems.length - 1; i >= 0; i--) {
      const f = this.feedItems[i];
      f.t -= dt;
      if (f.t <= 0) { f.el.remove(); this.feedItems.splice(i, 1); }
      else f.el.style.opacity = Math.min(1, f.t);
    }
    if (this.msgT > 0) { this.msgT -= dt; this.msg.style.opacity = Math.min(1, this.msgT); }
  }

  pickup(id, n) {
    const name = itemName(id);
    const ex = this.feedItems.find((f) => f.id === id);
    if (ex) { ex.n += n; ex.t = 3; ex.el.querySelector('span').textContent = `${name} (${ex.n})`; return; }
    const el = h('div', 'feeditem', `<img src="${itemIcon(id)}" alt=""><span>${name} (${n})</span>`);
    this.feed.appendChild(el);
    this.feedItems.push({ id, n, el, t: 3 });
    if (this.feedItems.length > 5) { const f = this.feedItems.shift(); f.el.remove(); }
  }
  message(text, color = '#ffffff') {
    this.msg.textContent = text;
    this.msg.style.color = color;
    this.msgT = 3.5;
    this.msg.style.opacity = 1;
  }
  setInfo(text) { if (this.info.textContent !== text) this.info.textContent = text; }
}
