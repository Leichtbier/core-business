import { SCENARIO_GROUPS, SCENARIO_OPTIONS } from '../test/scenarios.js';
import { nav } from './nav.js';
import { DEV } from './dev.js';

// Menü "Testszenarien" im Startbildschirm: startet ein Szenario, indem die Seite mit den passenden
// URL-Parametern neu geladen wird (dieselben Parameter wie für die Headless-Tests, siehe README).
const $ = (id) => document.getElementById(id);
const OPT_KEY = 'ml3d.scenarioOptions';

export function setupScenarioMenu() {
  // Zurück ins Startmenü (aus Pause und Todesbildschirm): Seite ohne Testparameter neu laden
  for (const b of document.querySelectorAll('.menuBtn')) b.addEventListener('click', () => goToMenu());
  // Testszenarien nur im Testmodus (src/dev.js), sonst gibt es den Knopf gar nicht
  if (!DEV) { $('scenarioBtn').remove(); $('scenarioScreen').remove(); return; }

  let chosen = new Set();
  try { chosen = new Set(JSON.parse(localStorage.getItem(OPT_KEY) || '[]')); } catch { /* ohne Speicher */ }
  // Startgeld aus dem Startskript (?cash=...) vorbelegen
  if (new URLSearchParams(location.search).has('cash')) chosen.add('cash');

  const opts = $('scenarioOptions');
  for (const o of SCENARIO_OPTIONS) {
    const label = document.createElement('label');
    label.className = 'opt';
    label.dataset.nav = 'opt-' + o.id;
    label.innerHTML = `<input type="checkbox"> ${o.label}`;
    const box = label.querySelector('input');
    box.checked = chosen.has(o.id);
    box.addEventListener('change', () => {
      if (box.checked) chosen.add(o.id); else chosen.delete(o.id);
      try { localStorage.setItem(OPT_KEY, JSON.stringify([...chosen])); } catch { /* egal */ }
    });
    opts.appendChild(label);
  }

  const list = $('scenarioList');
  let n = 0;
  for (const g of SCENARIO_GROUPS) {
    const h = document.createElement('h3');
    h.textContent = g.title;
    list.appendChild(h);
    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const sc of g.items) {
      const b = document.createElement('button');
      b.className = 'scn';
      b.dataset.nav = 'scn-' + n++;
      b.innerHTML = `<b>${sc.name}</b><span>${sc.desc}</span>`;
      b.addEventListener('click', () => launch(sc.params, chosen));
      grid.appendChild(b);
    }
    list.appendChild(grid);
  }

  const show = (on) => {
    $('scenarioScreen').classList.toggle('hidden', !on);
    $('startScreen').classList.toggle('hidden', on);
  };
  $('scenarioBtn').addEventListener('click', () => show(true));
  $('scenarioBack').addEventListener('click', () => show(false));
  // Tastatur: Vorauswahl ist das erste Szenario, Esc führt zurück ins Startmenü (dort wieder auf "Testszenarien")
  nav.register($('scenarioScreen'), {
    initial: () => 'scn-0',
    back: () => { show(false); nav.focus($('startScreen'), 'scenarioBtn'); },
  });
}

function launch(params, chosen) {
  const p = new URLSearchParams(params);
  // Optionen überschreiben gleichnamige Werte des Szenarios (z. B. mehr Items)
  for (const o of SCENARIO_OPTIONS) {
    if (!chosen.has(o.id)) continue;
    for (const [k, v] of new URLSearchParams(o.params)) p.set(k, v);
  }
  location.search = '?dev&autostart&' + p.toString().replace(/%3A/g, ':').replace(/%2C/g, ',');
}

export function goToMenu() {
  if (!DEV) { location.search = ''; return; }
  const cash = new URLSearchParams(location.search).get('cash');
  location.search = '?dev' + (cash ? '&cash=' + cash : '');
}
