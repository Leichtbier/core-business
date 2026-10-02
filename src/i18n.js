import en from './lang/en.js';
import de from './lang/de.js';

// Sprache der Oberfläche: Englisch (Standard) oder Deutsch. Gewählt im Startbildschirm und im Browser gespeichert;
// ?lang=de|en in der Adresse gilt nur für diesen Aufruf (z. B. für Tests), ohne die gespeicherte Wahl zu ändern.
// Texte im HTML tragen ihren Schlüssel in data-i18n (Inhalt), data-i18n-title und data-i18n-aria.
const LANGS = { en, de };
const KEY = 'ml3d.lang';
const known = (l) => typeof l === 'string' && Object.hasOwn(LANGS, l);

function initialLang() {
  const q = new URLSearchParams(location.search).get('lang');
  if (known(q)) return q;
  try { const s = localStorage.getItem(KEY); if (known(s)) return s; } catch { /* ohne Speicher */ }
  return 'en';
}

export let lang = initialLang();

// Text zum Schlüssel; Funktionen bekommen args (z. B. t('deathStats', score, depth)). Fehlt er, gilt Englisch.
// Listen und Tabellen (minerals, items, upgrades …) werden nur als Ganzes ersetzt, daher in de.js immer vollständig.
export function t(key, ...args) {
  const v = LANGS[lang][key] ?? en[key];
  return typeof v === 'function' ? v(...args) : v;
}

export function setLang(l) {
  if (!known(l)) return;
  lang = l;
  try { localStorage.setItem(KEY, l); } catch { /* ohne Speicher */ }
  applyStatic();
}

// Namen aus src/constants.js in der gewählten Sprache (Index wie MINERALS, ITEMS, UPGRADES[cat].names)
export const mineralName = (i) => t('minerals')[i];
export const itemName = (i) => t('items')[i].name;
export const itemDesc = (i) => t('items')[i].desc;
export const upgradeTitle = (cat) => t('upgrades')[cat].title;
export const upgradeName = (cat, lvl) => t('upgrades')[cat].names[lvl];
export const upgradeUnit = (cat) => t('upgrades')[cat].unit;

export function applyStatic(root = document) {
  document.documentElement.lang = lang;
  for (const el of root.querySelectorAll('[data-i18n]')) el.innerHTML = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  for (const el of root.querySelectorAll('[data-lang]')) el.classList.toggle('active', el.dataset.lang === lang);
}
