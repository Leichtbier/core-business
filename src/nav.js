// Tastatursteuerung aller Menüs, Dialoge und Shops.
// Jede Oberfläche wird mit register() angemeldet; aktiv ist die oberste sichtbare (spätere im DOM liegen
// darüber). Pfeiltasten/WASD wählen räumlich das nächste Element in der Richtung, Tab/Umschalt+Tab der Reihe
// nach, Enter/Leertaste löst aus, Esc geht zurück. Auswählbar sind Knöpfe und Optionen (label.opt).
// Beim Öffnen und nach jedem Neuaufbau des Inhalts wird die Auswahl über ihren Schlüssel (data-nav oder id)
// wiederhergestellt, sonst gilt die Vorgabe der Oberfläche (initial).
const MOVE = {
  ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0],
  ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1],
};
const PICKABLE = 'button:not(.nonav), label.opt';
const shown = (el) => el.getClientRects().length > 0;
const center = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

export class MenuNav {
  constructor() {
    this.screens = [];
    this.observer = new MutationObserver(() => this.sync());
  }

  // opts: initial() -> Schlüssel der Vorgabe, back() für Esc, keys(code, e) -> true für eigene Tasten
  register(root, opts = {}) {
    const s = { root, initial: opts.initial || (() => null), back: opts.back, keys: opts.keys, sel: null, selKey: null };
    this.screens.push(s);
    this.screens.sort((a, b) => (a.root.compareDocumentPosition(b.root) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    this.observer.observe(root, { attributes: true, attributeFilter: ['class', 'disabled'], childList: true, subtree: true });
    // Maus: Zeigen wählt aus, Klicken nimmt keinen Fokus (sonst löst die Leertaste den Knopf ein zweites Mal aus)
    root.addEventListener('mouseover', (e) => {
      const el = e.target.closest(PICKABLE);
      if (el && this.items(s).includes(el)) this.select(s, el, false);
    });
    root.addEventListener('mousedown', (e) => { if (e.target.closest(PICKABLE)) e.preventDefault(); });
    this.sync();
  }

  active() {
    for (let i = this.screens.length - 1; i >= 0; i--) if (shown(this.screens[i].root)) return this.screens[i];
    return null;
  }

  items(s) { return [...s.root.querySelectorAll(PICKABLE)].filter((el) => !el.disabled && shown(el)); }

  key(el) { return el.dataset.nav || el.id || null; }

  sync() {
    for (const s of this.screens) {
      if (!shown(s.root)) {
        if (s.sel) s.sel.classList.remove('sel');
        s.sel = null;
        s.selKey = null; // beim nächsten Öffnen gilt wieder die Vorgabe
        continue;
      }
      const items = this.items(s);
      if (s.sel && items.includes(s.sel) && s.sel.classList.contains('sel')) continue;
      let el = s.selKey && items.find((e) => this.key(e) === s.selKey);
      if (!el) {
        const k = s.initial();
        el = items.find((e) => this.key(e) === k) || items[0];
      }
      if (el) this.select(s, el, false, true);
    }
  }

  // Auswahl einer Oberfläche von außen setzen (z. B. nach dem Verkaufen auf "Verlassen")
  focus(root, key) {
    const s = this.screens.find((x) => x.root === root);
    if (!s) return;
    s.selKey = key;
    if (s.sel) s.sel.classList.remove('sel');
    s.sel = null;
    this.sync();
  }

  select(s, el, notify = true, force = false) {
    if (s.sel === el && !force) return;
    if (s.sel) s.sel.classList.remove('sel');
    s.sel = el;
    s.selKey = this.key(el);
    if (!el.classList.contains('sel')) el.classList.add('sel');
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (notify) el.dispatchEvent(new CustomEvent('navselect'));
  }

  // räumlich: nächstes Element in Richtung (dx, dy); seitlicher Versatz zählt dreifach
  move(s, dx, dy) {
    const items = this.items(s);
    if (!s.sel || !items.includes(s.sel)) { if (items[0]) this.select(s, items[0]); return; }
    const a = center(s.sel);
    let best = null, bestScore = Infinity;
    for (const el of items) {
      if (el === s.sel) continue;
      const c = center(el), vx = c.x - a.x, vy = c.y - a.y;
      const along = vx * dx + vy * dy;
      if (along <= 4) continue;
      const score = along + Math.abs(dx ? vy : vx) * 3;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (best) this.select(s, best);
  }

  step(s, d) {
    const items = this.items(s);
    if (!items.length) return;
    const i = items.indexOf(s.sel);
    this.select(s, items[(i + d + items.length) % items.length]);
  }

  // Liefert true, wenn die Taste einer Oberfläche galt (dann nicht mehr ans Spiel weitergeben)
  handle(e) {
    this.sync(); // Inhalt kann sich seit der letzten Beobachtung geändert haben (z. B. Knopf gerade ausgeblendet)
    const s = this.active();
    if (!s) return false;
    if (s.keys?.(e.code, e)) { e.preventDefault(); return true; }
    const m = MOVE[e.code];
    if (m) { this.move(s, m[0], m[1]); e.preventDefault(); return true; }
    if (e.code === 'Tab') { this.step(s, e.shiftKey ? -1 : 1); e.preventDefault(); return true; }
    if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') {
      if (!e.repeat && s.sel && !s.sel.disabled) s.sel.click();
      e.preventDefault();
      return true;
    }
    if (e.code === 'Escape') {
      if (!e.repeat) s.back?.();
      e.preventDefault();
      return true;
    }
    return false;
  }
}

export const nav = new MenuNav();
