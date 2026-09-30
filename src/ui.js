import { MINERALS, UPGRADES, ITEMS, TRANSMISSIONS, TRANSMISSION_MIN_FRAMES, FPS } from './constants.js';
import { t, mineralName, itemName, itemDesc, upgradeTitle, upgradeName, upgradeUnit } from './i18n.js';
import { writeSave } from './save.js';
import { nav } from './nav.js';
import { MINERAL_LOOK } from './minerals.js';
import { devParams } from './dev.js';

const $ = (id) => document.getElementById(id);
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const kbd = (...keys) => keys.map((k) => `<kbd>${k}</kbd>`).join('');
// Rolle unter dem Absender, je nach Porträt (Schlüssel in src/lang/*.js)
const TRANS_ROLE = { husk: 'roleCeo', husk_battle: 'roleCeo', miner: 'roleMiner', static: 'roleStatic' };
const fmt = (n) => '$' + Math.floor(n).toLocaleString('en-US');

export class UI {
  constructor(game, renderer) {
    this.game = game;
    this.renderer = renderer;
    this.shopId = null;
    this.upgradeTab = 'drill';
    $('shopExit').addEventListener('click', () => this.closeShop());
    $('transOk').addEventListener('click', () => this.transmissionKey(true));
    $('saveYes').addEventListener('click', () => this.confirmSave());
    $('saveNo').addEventListener('click', () => this.closeSave());
    $('saveOk').addEventListener('click', () => this.closeSave());
    // Tastatursteuerung: Vorauswahl je Oberfläche (sinnvollste Aktion), Esc wie "Verlassen"/"Nein"
    nav.register($('victory'), { initial: () => 'victoryNext' });
    nav.register($('saveScreen'), {
      initial: () => (this.saveState?.done ? 'saveOk' : 'saveYes'),
      back: () => this.closeSave(),
      keys: (code) => {
        if (!this.saveState || this.saveState.done) return false;
        if (code === 'KeyJ' || code === 'KeyY') { this.confirmSave(); return true; }
        if (code === 'KeyN') { this.closeSave(); return true; }
        return false;
      },
    });
    nav.register($('shop'), {
      initial: () => this.shopDefault(),
      back: () => this.closeShop(),
      keys: (code) => {
        if (this.shopId !== 'upgrade' || !['KeyQ', 'KeyE', 'PageUp', 'PageDown'].includes(code)) return false;
        const cats = Object.keys(UPGRADES);
        const d = code === 'KeyQ' || code === 'PageUp' ? -1 : 1;
        this.setUpgradeTab(cats[(cats.indexOf(this.upgradeTab) + d + cats.length) % cats.length]);
        nav.focus($('shop'), this.shopDefault());
        return true;
      },
    });
    // Item-Leiste im HUD: Icon, Taste, Anzahl
    this.itemSlots = ITEMS.map((it) => {
      const slot = document.createElement('div');
      slot.className = 'slot empty';
      slot.innerHTML = `<img src="assets/items/${it.icon}.png" alt=""><span class="key">${it.hotKey}</span><span class="count"></span>`;
      $('itemBar').appendChild(slot);
      return { slot, count: slot.querySelector('.count'), n: -1 };
    });
  }

  // ---------- Funksprüche ----------
  // Text erscheint Buchstabe für Buchstabe (printText im Original), dabei bewegt sich der Mund.
  // Schließen mit beliebiger Taste frühestens nach TRANSMISSION_MIN_FRAMES; läuft der Text noch,
  // zeigt der erste Tastendruck ihn vollständig an.
  showTransmission(i) {
    const tr = TRANSMISSIONS[i], txt = t('transmissions')[i];
    // 3D-Brustbild aus den Endgegner-Modellen
    const image = devParams().get('portrait') || tr.image; // ?portrait=satan zum Testen
    this.showMessage({
      head: t('transHead'), sender: txt.sender, role: TRANS_ROLE[tr.image] ? t(TRANS_ROLE[tr.image]) : '???', text: txt.msg,
      image, eyes: !!tr.eyes, onClose: () => this.game.closeTransmission(),
    });
  }

  // Fundbericht beim Bergen eines Sonderfunds: gleiches Fenster, der Fund dreht sich als 3D-Modell
  showFind(n) {
    const r = t('finds')[n];
    this.showMessage({
      head: t('findHead'), sender: r.title, role: t('findRole'), tone: 'find',
      text: `${r.msg}\n\n${t('credit', fmt(MINERALS[n].value))}`,
      image: 'find_' + n, onClose: () => this.game.closeFindReport(),
    });
  }

  // Hinweis des Bordcomputers (z. B. erster Bohrversuch in Fels): gleiches Fenster in Warnfarbe
  showNotice(id) {
    const n = t('notices')[id];
    this.showMessage({
      head: n.head, sender: n.title, role: t('noticeRole'), tone: 'warn', text: n.msg,
      image: 'notice_' + id, onClose: () => this.game.closeNotice(),
    });
  }

  // tone: null (Funkspruch, cyan), 'find' (Fundbericht, gold), 'warn' (Hinweis, orange)
  showMessage({ head, sender, role, text, image, eyes = false, tone = null, onClose }) {
    this.trans = { text, shown: 0, opened: performance.now(), done: false, onClose };
    this.portrait.show($('transImage'), image, { eyes });
    $('transHead').textContent = head;
    $('transPanel').classList.toggle('find', tone === 'find');
    $('transPanel').classList.toggle('notice', tone === 'warn'); // nicht "warn": so heißt die LOW-FUEL-Anzeige im HUD
    $('transSender').textContent = sender;
    $('transRole').textContent = role;
    $('transMsg').textContent = '';
    $('transMsg').classList.add('typing');
    $('transOk').disabled = true;
    $('transmission').classList.remove('hidden');
    clearInterval(this.transTimer);
    this.transTimer = setInterval(() => {
      const tr = this.trans;
      if (!tr) return;
      if (!tr.done) {
        tr.shown = Math.min(tr.text.length, tr.shown + 2);
        $('transMsg').textContent = tr.text.slice(0, tr.shown);
        if (tr.shown >= tr.text.length) this.finishTransmissionText();
      }
      this.portrait.talking = !tr.done;
      if (this.transReady()) $('transOk').disabled = false;
    }, 30);
  }

  transReady() { return !!this.trans && performance.now() - this.trans.opened >= (TRANSMISSION_MIN_FRAMES / FPS) * 1000; }

  finishTransmissionText() {
    const tr = this.trans;
    tr.done = true;
    tr.shown = tr.text.length;
    $('transMsg').textContent = tr.text;
    $('transMsg').classList.remove('typing');
  }

  get transmissionOpen() { return !!this.trans; }

  // Tastendruck während eines Funkspruchs: erst Text vervollständigen, dann schließen
  transmissionKey(close = false) {
    const tr = this.trans;
    if (!tr || !this.transReady()) return false;
    if (!tr.done && !close) { this.finishTransmissionText(); return false; }
    clearInterval(this.transTimer);
    this.trans = null;
    this.portrait.hide();
    $('transmission').classList.add('hidden');
    tr.onClose?.();
    return true;
  }

  // ---------- Save-Pod (saveFrame): Frage, Speichern, Rückmeldung ----------
  openSave(onClose) {
    this.saveState = { onClose, done: false };
    $('saveText').innerHTML = t('saveAsk');
    $('saveYes').classList.remove('hidden');
    $('saveNo').classList.remove('hidden');
    $('saveOk').classList.add('hidden');
    $('saveScreen').classList.remove('hidden');
  }

  get saveOpen() { return !!this.saveState; }

  confirmSave() {
    const st = this.saveState;
    if (!st || st.done) return;
    st.done = true;
    let text;
    try {
      const { prior } = this.game.save(writeSave);
      text = t('saved') + (prior ? t('savedOver') : '');
    } catch {
      text = t('saveFailed');
    }
    $('saveText').innerHTML = text;
    $('saveYes').classList.add('hidden');
    $('saveNo').classList.add('hidden');
    $('saveOk').classList.remove('hidden');
  }

  closeSave() {
    const st = this.saveState;
    if (!st) return;
    this.saveState = null;
    $('saveScreen').classList.add('hidden');
    st.onClose?.();
  }

  // ---------- Sieg (winFrame): Beute Stück für Stück ----------
  showVictory() {
    $('lootList').innerHTML = '';
    $('nextLevel').textContent = this.game.lvl;
    $('victoryNext').disabled = true;
    $('lootCash').textContent = fmt(this.game.cash);
    $('victory').classList.remove('hidden');
  }

  addLoot(i) {
    const row = document.createElement('tr');
    row.innerHTML = `<td>${mineralName(i)}</td><td class="num">${fmt(MINERALS[i].value)}</td>`;
    $('lootList').appendChild(row);
    $('lootCash').textContent = fmt(this.game.cash);
  }

  lootDone() { $('victoryNext').disabled = false; }

  hideVictory() { $('victory').classList.add('hidden'); }

  // kurzer Lichtblitz über dem Bild (Teleport)
  flash(color) {
    const el = $('flash');
    el.style.background = color;
    el.classList.remove('go');
    void el.offsetWidth; // Animation neu starten
    el.classList.add('go');
  }

  // ---------- HUD ----------
  updateHUD() {
    const g = this.game, p = g.pod;
    const fuelPct = Math.max(0, p.fuel / g.fuelCap);
    const hullPct = Math.max(0, p.hp / g.maxHp);
    const cargo = g.baySize - g.baySpace;
    $('fuelBar').style.width = (fuelPct * 100).toFixed(1) + '%';
    $('fuelBar').classList.toggle('low', fuelPct < 0.25);
    $('fuelText').textContent = `${p.fuel.toFixed(1)} / ${g.fuelCap} L`;
    $('hullBar').style.width = (hullPct * 100).toFixed(1) + '%';
    $('hullBar').classList.toggle('low', hullPct < 0.3);
    $('hullText').textContent = `${Math.max(0, Math.ceil(p.hp))} / ${g.maxHp}`;
    $('cargoBar').style.width = ((cargo / g.baySize) * 100).toFixed(1) + '%';
    $('cargoText').textContent = `${cargo} / ${g.baySize}`;
    $('cashText').textContent = fmt(g.cash);
    $('scoreText').textContent = t('score') + ' ' + g.score.toLocaleString('en-US');
    const d = g.depth;
    $('depthText').textContent = d < -5813 ? '?' + (10000 + Math.floor(Math.random() * 90000)) + ' ft.' : d + ' ft.';
    ITEMS.forEach((_, i) => {
      const s = this.itemSlots[i], n = g.items[i];
      s.slot.title = itemName(i); // Sprache kann im Startbildschirm wechseln
      if (s.n === n) return;
      s.n = n;
      s.count.textContent = n > 0 ? 'x' + n : '';
      s.slot.classList.toggle('empty', n === 0);
    });
    $('warnFuel').classList.toggle('hidden', !(fuelPct < 0.15 && !g.dead && !g.paused));
    $('warnFuel').textContent = t(g.fuelEmptyFrames > 0 ? 'outOfFuel' : 'lowFuel');
    // Lebensbalken des Bosses (satanHPBar), nicht während Tod, Pause und Ausbruch
    const b = g.battle, showBoss = !!b && !['die', 'wait', 'breakout'].includes(b.state) && (b.phase === 1 || b.active);
    $('bossBar').classList.toggle('hidden', !showBoss);
    if (showBoss) {
      $('bossName').textContent = b.phase === 1 ? 'MR. HUSK' : 'SATAN';
      $('bossFill').style.width = (100 * b.hp / b.maxHp).toFixed(1) + '%';
      $('bossHp').textContent = `${b.hp} / ${b.maxHp}`;
    }
  }

  floater(text, cls, xPx, yPx, dy = 0) {
    const pos = this.renderer.project(xPx, yPx);
    const el = document.createElement('div');
    el.className = 'floater ' + cls;
    el.textContent = text;
    el.style.left = pos.x + 'px';
    el.style.top = pos.y + dy + 'px';
    $('floaters').appendChild(el);
    setTimeout(() => el.remove(), 1700);
  }

  // ---------- Shops ----------
  // Jede Aktion ist ein Knopf mit festem Schlüssel (data-nav), damit die Tastaturauswahl den Neuaufbau übersteht.
  openShop(id) {
    this.shopId = id;
    $('shopPanel').dataset.shop = id;
    $('shopTitle').textContent = t('shopTitles')[id] || id.toUpperCase();
    $('shopHints').innerHTML = t('shopHints')[id] || '';
    $('shop').classList.remove('hidden');
    this.message('', true);
    this.renderShop();
    nav.focus($('shop'), this.shopDefault());
  }

  closeShop() {
    if (!this.shopId) return;
    this.shopId = null;
    $('shop').classList.add('hidden');
    this.game.leaveShop();
  }

  // Vorauswahl: die Aktion, für die man den Shop meistens betritt
  shopDefault() {
    const g = this.game, p = g.pod;
    switch (this.shopId) {
      case 'fuel': return g.fuelCap - p.fuel >= 1 ? 'fuel-full' : 'exit';
      case 'sell': return g.bay.some((n) => n > 0) ? 'sell-all' : 'exit';
      case 'repair': {
        if (g.maxHp - p.hp >= 1) return 'repair-full';
        const i = ITEMS.findIndex((it) => g.cash >= it.price);
        return i >= 0 ? 'item-' + i : 'exit';
      }
      case 'upgrade': {
        const next = g.up[this.upgradeTab] + 1;
        return next < UPGRADES[this.upgradeTab].names.length ? 'up-' + next : 'tab-' + this.upgradeTab;
      }
    }
    return 'exit';
  }

  setUpgradeTab(k) {
    if (k === this.upgradeTab) return;
    this.upgradeTab = k;
    this.message('', true);
    this.renderShop();
  }

  message(text, ok) {
    const m = $('shopMsg');
    m.textContent = text;
    m.className = 'msg ' + (ok ? 'ok' : 'err');
  }

  // Ergebnis einer Shop-Aktion anzeigen; after: Auswahl danach (z. B. nach "Alles verkaufen" auf "Verlassen")
  act(result, after = null) {
    this.message(result.msg, result.ok);
    if (result.ok) this.onPurchase?.(); // Kassensound
    this.renderShop();
    if (result.ok && after) nav.focus($('shop'), typeof after === 'function' ? after() : after);
  }

  renderShop() {
    const g = this.game, p = g.pod, body = $('shopBody');
    $('shopCash').textContent = fmt(g.cash);
    body.innerHTML = '';
    const el = (tag, cls, html = '') => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      e.innerHTML = html;
      return e;
    };
    const btn = (key, html, fn, cls = '') => {
      const b = el('button', cls, html);
      b.dataset.nav = key;
      b.addEventListener('click', fn);
      return b;
    };
    const meter = (pct, label, value, cls) => el('div', 'meter',
      `<div class="bar"><div class="fill ${cls}" style="width:${(Math.max(0, pct) * 100).toFixed(1)}%"></div></div>
       <div class="caption"><span>${label}</span><span class="lcd">${value}</span></div>`);

    if (this.shopId === 'fuel') {
      body.appendChild(meter(p.fuel / g.fuelCap, t('fuelMeter'), `${Math.trunc(p.fuel + 0.4)} / ${g.fuelCap} L`, 'fuel'));
      const row = el('div', 'options-row');
      for (const a of [5, 10, 25, 50]) row.appendChild(btn('fuel-' + a, `$${a}`, () => this.act(g.buyFuel(a))));
      const full = Math.max(1, Math.trunc(g.fuelCap - p.fuel));
      row.appendChild(btn('fuel-full', `${t('fillUp')} · $${full}`, () => this.act(g.buyFuel(-1), 'exit'), 'big'));
      body.appendChild(row);
    } else if (this.shopId === 'repair') {
      body.appendChild(meter(p.hp / g.maxHp, t('hullMeter'), `${Math.trunc(p.hp)} / ${g.maxHp} HP`, 'hull'));
      const row = el('div', 'options-row');
      for (const a of [50, 100, 200, 500]) row.appendChild(btn('repair-' + a, `$${a}`, () => this.act(g.repair(a))));
      const full = Math.trunc(g.maxHp - p.hp) * 15;
      row.appendChild(btn('repair-full', full > 0 ? `${t('repairAll')} · $${full.toLocaleString('en-US')}` : t('repairAll'),
        () => this.act(g.repair(-1), 'exit'), 'big'));
      body.appendChild(row);
      // Im Original verkauft die Reparaturwerkstatt auch die Items
      body.appendChild(el('h3', '', t('itemsHead')));
      const grid = el('div', 'upgrades items');
      ITEMS.forEach((it, i) => {
        const b = btn('item-' + i, `<img src="assets/items/${it.icon}.png" alt="">
          <div class="info"><div class="name">${itemName(i)}</div><div class="stat">${itemDesc(i)}</div>
          <div><span class="price">${fmt(it.price)}</span><span class="have">${g.items[i] ? '× ' + g.items[i] : ''}</span>
          <span class="stat"> · ${t('itemKey')} ${kbd(it.hotKey)}</span></div></div>`, () => this.act(g.buyItem(i)), 'up item');
        if (g.cash < it.price) b.classList.add('poor');
        grid.appendChild(b);
      });
      body.appendChild(grid);
    } else if (this.shopId === 'sell') {
      const table = el('table', 'list');
      let total = 0, rows = '';
      for (let i = 0; i < 10; i++) {
        if (!g.bay[i]) continue;
        const v = g.mineralPrice(i);
        total += v * g.bay[i];
        rows += `<tr><td><span class="swatch" style="background:${hex(MINERAL_LOOK[i].color)};color:${hex(MINERAL_LOOK[i].color)}"></span>${mineralName(i)}</td>
          <td class="num">${g.bay[i]}</td><td class="num">× ${fmt(v)}</td><td class="num">${fmt(v * g.bay[i])}</td></tr>`;
      }
      if (!rows) rows = `<tr><td colspan="4" class="emptyNote">${t('bayEmpty')}</td></tr>`;
      table.innerHTML = `<tr><th>${t('colMineral')}</th><th class="num">${t('colQty')}</th><th class="num">${t('colPrice')}</th><th class="num">${t('colValue')}</th></tr>${rows}
        <tr class="total"><td colspan="3"><b>${t('total')}</b></td><td class="num"><span class="lcd">${fmt(total)}</span></td></tr>`;
      body.appendChild(table);
      const row = el('div', 'options-row');
      row.appendChild(btn('sell-all', total ? `${t('sellAll')} · ${fmt(total)}` : t('sellAll'),
        () => this.act(g.sellAll(), 'exit'), 'big'));
      body.appendChild(row);
    } else if (this.shopId === 'upgrade') {
      const tabs = el('div', 'tabs');
      for (const k of Object.keys(UPGRADES)) {
        const b = btn('tab-' + k, upgradeTitle(k), () => this.setUpgradeTab(k));
        b.addEventListener('navselect', () => this.setUpgradeTab(k)); // mit der Tastatur schaltet schon das Auswählen um
        if (k === this.upgradeTab) b.classList.add('active');
        tabs.appendChild(b);
      }
      body.appendChild(tabs);
      const cat = this.upgradeTab, u = UPGRADES[cat], owned = g.up[cat];
      const grid = el('div', 'upgrades');
      u.names.forEach((_, lvl) => {
        let stat = `${u.values[lvl]} ${cat === 'bay' ? t('slots') : upgradeUnit(cat)}`;
        if (cat === 'radiator') stat = t('lessHeat', Math.round((1 - u.values[lvl]) * 100));
        if (cat === 'drill') stat = t('drillSpeed', u.values[lvl]);
        const status = lvl === owned ? t('installed') : lvl === owned + 1 ? t('nextLevel') : '';
        const b = btn('up-' + lvl, `<img src="assets/upgrades/${cat}_${lvl}.png" alt="">
          <div class="name">${upgradeName(cat, lvl)}</div><div class="stat">${stat}</div>
          <div class="price">${u.prices[lvl] ? fmt(u.prices[lvl]) : '—'}</div><div class="status">${status}&nbsp;</div>`,
          () => this.act(g.buyUpgrade(cat, lvl), () => this.shopDefault()), 'up');
        if (lvl === owned) b.classList.add('owned');
        else if (lvl < owned) b.classList.add('lower');
        else if (g.cash < u.prices[lvl]) b.classList.add('poor');
        grid.appendChild(b);
      });
      body.appendChild(grid);
    }
  }
}
