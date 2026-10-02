import { FPS, ITEMS, ITEM, TRANSMISSIONS } from './constants.js';
import { Game } from './sim.js';
import { Renderer, tileColorHex } from './render.js';
import { UI } from './ui.js';
import { SoundFX, MUSIC_LEVEL, DEEP_MUSIC_FT, DEEP_MUSIC_HYST, hasShopTrack } from './audio.js';
import { setupScenarioMenu } from './menu.js';
import { Portrait3D } from './portrait3d.js';
import { readSave } from './save.js';
import { nav } from './nav.js';
import { devParams } from './dev.js';
import { t, setLang, nextLang, applyStatic, mineralName, itemName } from './i18n.js';

const $ = (id) => document.getElementById(id);
applyStatic(); // Texte der Oberfläche in der gewählten Sprache (im HTML steht Englisch)

// ---------- Eingabe (Pfeiltasten und WASD wie im Original) ----------
const input = { left: false, right: false, up: false, down: false };
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
};

let running = false;
let startCash = null; // ?cash=N: Startgeld zum Testen
let held = false; // Testhilfe: Spiel und Effekte angehalten (?stopAt)
let userPaused = false;
let deepMusic = false; // Tiefenthema aktiv (siehe DEEP_MUSIC_FT)

window.addEventListener('keydown', (e) => {
  if (running) sfx.init(); // falls der Browser den Ton bis zur ersten Taste blockiert hat
  // Funkspruch offen: jede Taste gilt dem Dialog (wie im Original), nicht dem Spiel
  if (ui.transmissionOpen) {
    if (ui.transmissionScroll(e.code)) { e.preventDefault(); return; }
    if (!e.repeat && !['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) ui.transmissionKey();
    if (KEYMAP[e.code] || e.code === 'Space') e.preventDefault();
    return;
  }
  // Offene Lautstärkeregler: Esc schließt sie (statt ein Menü zu öffnen oder zu schließen)
  if (e.code === 'Escape' && volumeOpen()) { showVolume(false); return; }
  // Menüs, Dialoge und Shops: Auswahl mit Pfeiltasten/WASD, Enter, Esc (src/nav.js)
  const screen = nav.active();
  if (nav.handle(e)) return;
  if (e.code === 'KeyN' && !e.repeat) setMusicMuted(!sfx.musicMuted);
  if (e.code === 'KeyP' && !e.repeat && running && !game.dead && (!screen || screen.root === $('pauseScreen'))) setPaused(!userPaused);
  if (screen) return; // solange eine Oberfläche offen ist, erreicht keine Taste das Spiel
  const k = KEYMAP[e.code];
  if (k) { input[k] = true; e.preventDefault(); }
  // Items per Taste (F, R, X, C, Q, M wie im Original)
  const item = ITEMS.findIndex((it) => it.key === e.code);
  if (item >= 0 && running && !userPaused) { game.useItem(item); e.preventDefault(); }
});
function setPaused(on) {
  userPaused = on;
  $('pauseScreen').classList.toggle('hidden', !on);
  if (on) for (const k in input) input[k] = false;
}
window.addEventListener('keyup', (e) => {
  const k = KEYMAP[e.code];
  if (k) { input[k] = false; e.preventDefault(); }
});
window.addEventListener('blur', () => { for (const k in input) input[k] = false; });

// ---------- Spiel, Renderer, UI ----------
const renderer = new Renderer($('view'));
let deathReason = ''; // Schlüssel des Texts in src/lang/*.js

const events = {
  mineral: (i) => ui.floater('+1 ' + mineralName(i), 'mineral', game.pod.x, game.pod.y, -30),
  points: (pts) => ui.floater(pts.toLocaleString('en-US'), 'points', game.pod.x, game.pod.y, -10),
  bonus: (v) => ui.floater('+$' + v.toLocaleString('en-US'), 'bonus', game.pod.x, game.pod.y, -55),
  dialogue: (text) => ui.floater(text, 'bonus', game.pod.x, game.pod.y, -85),
  warning: (text) => ui.floater(text, 'warning', game.pod.x, game.pod.y, -50),
  damage: (d) => ui.floater('-' + d + ' HP', 'damage', game.pod.x, game.pod.y, 10),
  crash: () => { deathReason = 'deathCrash'; },
  lava: () => {
    deathReason = 'deathLava';
    renderer.spawnChunks(game.pod.x, game.pod.y, 0xff6a00, 12, 1.5);
  },
  gas: () => {
    sfx.play('explosion', { volume: 0.7, rate: 1.15 });
    deathReason = 'deathGas';
    renderer.spawnChunks(game.pod.x, game.pod.y, 0xffcc55, 25, 3);
  },
  undiggable: () => {},
  steam: () => renderer.spawnPuff(),
  digStart: () => {},
  digDone: (x, y, t) => renderer.spawnChunks(x * 50, y * 50, tileColorHex(t, y), 6),
  itemUsed: (i) => {
    ui.floater(t('itemUsed', itemName(i)), 'item', game.pod.x, game.pod.y, -60);
    renderer.itemFx.start(i, game);
  },
  itemEmpty: (i) => ui.floater(t('itemEmpty', itemName(i)), 'warning', game.pod.x, game.pod.y, -50),
  blast: (id, cleared) => renderer.blastDebris(cleared, game.pod.x, game.pod.y, id === ITEM.C4 ? 1.4 : 1),
  teleport: (id) => { renderer.itemFx.teleported(); ui.flash(id === ITEM.QUANTUM ? '#e4a8ff' : '#bff0ff'); },
  // Sonderfund geborgen: Fundbericht im Stil der Funksprüche (Geld ist schon gutgeschrieben)
  specialFind: (n) => {
    for (const k in input) input[k] = false;
    sfx.playRadio();
    ui.showFind(n);
  },
  // Erdbeben: tiefes Grollen (im Original ohne eigenen Ton in quakeFX; hier aus dem Explosionsgeräusch)
  quake: () => {
    sfx.play('explosion', { volume: 0.7, rate: 0.32 });
    setTimeout(() => sfx.play('explosion', { volume: 0.5, rate: 0.28 }), 1400);
  },
  // Hinweis des Bordcomputers (erster Bohrversuch in Fels)
  notice: (id) => {
    for (const k in input) input[k] = false;
    sfx.playRadio();
    ui.showNotice(id);
  },
  transmission: (i) => {
    for (const k in input) input[k] = false;
    sfx.playRadio();
    ui.showTransmission(i);
  },
  // Endkampf
  battleStart: () => {},
  battleStop: () => {},
  bossDamaged: () => { renderer.boss.damaged(); sfx.play('explosion', { volume: 0.45, rate: 0.7 }); },
  bossHitPod: () => { deathReason = game.battle?.phase === 2 ? 'deathSatan' : 'deathHusk'; },
  bossQuake: (n) => {
    renderer.itemFx.shake = Math.max(renderer.itemFx.shake, n * 0.02);
    const b = game.battle;
    if (b) for (let i = 0; i < 3; i++) renderer.spawnChunks(b.cx + (Math.random() - 0.5) * 160, b.floorY - 5, i % 2 ? 0x3a2a24 : 0xd8d0c0, 4, 2);
  },
  bossSlam: (x, y) => {
    renderer.itemFx.shake = 0.3;
    renderer.spawnChunks(x, y - 5, 0x3a2a24, 12, 2.5);
    sfx.play('explosion', { volume: 0.5, rate: 0.6 });
  },
  bossLaser: () => sfx.playLaser(),
  bossFireballCharge: () => {},
  bossFireball: () => sfx.play('explosion', { volume: 0.35, rate: 1.5 }),
  bossDying: () => sfx.play('explosion', { volume: 0.9, rate: 0.55 }),
  bossPhase2: () => sfx.play('explosion', { volume: 0.6, rate: 0.45 }),
  bossFlash: () => ui.flash('#fff2d0'),
  victory: () => { for (const k in input) input[k] = false; ui.showVictory(); },
  loot: (i) => { ui.addLoot(i); sfx.playBuy(); },
  lootDone: () => ui.lootDone(),
  // Save-Pod angeflogen (saveFrame): wie im Original mit Funkgeräusch
  enterSave: () => {
    for (const k in input) input[k] = false;
    sfx.playRadio();
    ui.openSave(() => game.leaveSave());
  },
  enterShop: (id) => {
    for (const k in input) input[k] = false;
    ui.openShop(id);
  },
  death: () => {
    sfx.play('explosion');
    renderer.itemFx.podExplosion(game); // Feuer, Druckwelle, Trümmer
    renderer.explode(game.pod.x, game.pod.y); // dazu Funken
    if (game.pod.fuel <= 0.01 * game.fuelCap) deathReason = 'deathFuel';
    setTimeout(() => {
      if (held) return; // angehaltene Testaufnahme (?stopAt): Explosion nicht verdecken
      $('deathReason').textContent = t(deathReason || 'deathHull');
      $('deathStats').textContent = t('deathStats', game.score.toLocaleString('en-US'), game.maxDepth);
      $('deathLoadBtn').classList.toggle('hidden', !readSave());
      $('deathScreen').classList.remove('hidden');
    }, 2200); // erst die Explosion zeigen
  },
};

const game = new Game(input, events);
const ui = new UI(game, renderer);
window.ml3d = { game, ui, renderer }; // für die Tests in test/*.html (Zustand prüfen, ohne auf Animationsframes zu warten)
const portrait = new Portrait3D(); // 3D-Brustbild für die Funksprüche
ui.portrait = portrait;

const sfx = new SoundFX();
window.ml3d.sfx = sfx;
ui.onPurchase = () => sfx.playBuy();
// Dynamit etwas heller und leiser, C4 tiefer und voll
renderer.itemFx.onBlast = (id) => sfx.play('explosion', id === ITEM.C4 ? { rate: 0.85 } : { volume: 0.75, rate: 1.1 });

// Lautstärke (unten rechts): das Symbol klappt Regler für Musik und Effekte auf, je mit Stummschalter;
// Taste N schaltet die Musik stumm. Alles bleibt im Browser gespeichert.
const VOLUME_KEY = 'ml3d.volume';
const vol = { music: 1, sfx: 1, musicMuted: false, sfxMuted: false };
try {
  Object.assign(vol, JSON.parse(localStorage.getItem(VOLUME_KEY) || '{}'));
  if (localStorage.getItem('ml3d.musicMuted') === '1') vol.musicMuted = true; // Stand vor den Reglern übernehmen
  localStorage.removeItem('ml3d.musicMuted');
} catch { /* ohne Speicher */ }
function applyVolume() {
  sfx.setMusicVolume(vol.music);
  sfx.setMusicMuted(vol.musicMuted);
  sfx.setSfxVolume(vol.sfx);
  sfx.setSfxMuted(vol.sfxMuted);
  const silent = { music: vol.musicMuted || vol.music === 0, sfx: vol.sfxMuted || vol.sfx === 0 };
  for (const k of ['music', 'sfx']) {
    $(k + 'Row').classList.toggle('silent', silent[k]);
    $(k + 'Vol').value = Math.round(vol[k] * 100);
    $(k + 'Val').textContent = Math.round(vol[k] * 100) + '%';
  }
  $('volBtn').classList.toggle('silent', silent.music && silent.sfx);
  $('volBtn').classList.toggle('part', silent.music !== silent.sfx);
  try { localStorage.setItem(VOLUME_KEY, JSON.stringify(vol)); } catch { /* ohne Speicher */ }
}
const setMusicMuted = (muted) => { vol.musicMuted = muted; applyVolume(); };
const volumeOpen = () => !$('volPanel').classList.contains('hidden');
function showVolume(on) {
  $('volPanel').classList.toggle('hidden', !on);
  $('volBtn').classList.toggle('open', on);
  $('volBtn').setAttribute('aria-expanded', on);
}
$('volBtn').addEventListener('click', (e) => {
  sfx.init();
  showVolume(!volumeOpen());
  e.currentTarget.blur(); // sonst löst Leertaste/Enter den Knopf erneut aus
});
for (const k of ['music', 'sfx']) {
  const slider = $(k + 'Vol');
  slider.addEventListener('input', () => {
    vol[k] = slider.value / 100;
    if (vol[k] > 0) vol[k + 'Muted'] = false; // wer den Regler aufdreht, will etwas hören
    applyVolume();
  });
  // Regler nicht im Fokus lassen, sonst verstellen die Pfeiltasten beim Fahren die Lautstärke
  slider.addEventListener('change', () => slider.blur());
  slider.addEventListener('pointerup', () => slider.blur());
  $(k + 'Mute').addEventListener('click', (e) => {
    sfx.init();
    vol[k + 'Muted'] = !vol[k + 'Muted'];
    if (!vol[k + 'Muted'] && vol[k] === 0) vol[k] = 0.5; // Stummschalter aus bei Regler auf 0: wieder hörbar machen
    applyVolume();
    e.currentTarget.blur();
  });
}
// Klick daneben schließt die Regler
window.addEventListener('pointerdown', (e) => { if (volumeOpen() && !$('volume').contains(e.target)) showVolume(false); });
applyVolume();

// save: gespeicherter Stand ({ data }) – wie im Original neue Welt und neuer Abwurf, dann die Werte übernehmen
function start(save = null) {
  sfx.init(); // Audio darf erst nach einer Nutzeraktion starten
  $('startScreen').classList.add('hidden');
  $('deathScreen').classList.add('hidden');
  $('hud').classList.remove('hidden');
  if (running) { game.reset(); renderer.itemFx.reset(); }
  if (save) game.applySave(save.data);
  else if (startCash !== null) game.cash = startCash; // Testgeld gilt auch nach "Neues Spiel"
  // Startsequenz: das Mothership setzt den Pod ab (nicht in Testszenarien, die den Pod selbst platzieren)
  const q = devParams();
  const testRun = ['scene', 'use', 'shop', 'warp', 'nodrop', 'checkpoint', 'battle'].some((k) => q.has(k));
  if (testRun) game.lastTransmission = TRANSMISSIONS.length; // Testszenarien ohne Funksprüche (Checkpunkte setzen sie selbst)
  if (testRun) renderer.dropship.stop();
  else { game.startDrop(); renderer.dropship.start(game); }
  running = true;
  setPaused(false);
  deathReason = '';
  game.pod.prevX = game.pod.x;
  game.pod.prevY = game.pod.y;
  renderer.snapNext = true;
}
$('startBtn').addEventListener('click', () => start());

// Spiel laden (preLoadGameOffline): ohne Spielstand nur ein Hinweis
function loadGame() {
  const save = readSave();
  if (!save) {
    $('loadInfo').textContent = t('noSave');
    $('loadInfo').classList.add('bad');
    return;
  }
  start(save);
}
$('loadBtn').addEventListener('click', loadGame);
// Im Startbildschirm zeigen, was gespeichert ist
function showSaveInfo() {
  const save = readSave();
  $('loadInfo').classList.remove('bad');
  $('loadInfo').textContent = '';
  if (!save) return;
  const when = new Date(save.savedAt).toLocaleString(t('locale'), { dateStyle: 'medium', timeStyle: 'short' });
  const cash = '$' + (Math.trunc(save.data[1]) || 0).toLocaleString('en-US');
  $('loadInfo').textContent = t('saveInfo', when, cash, Math.trunc(save.data[3]) || 1);
}
showSaveInfo();
// Sprache umschalten (Englisch/Deutsch), gilt sofort und bleibt im Browser gespeichert
$('langBtn').addEventListener('click', () => { setLang(nextLang()); showSaveInfo(); });

// Nach dem Sieg: wie im Original erst die Frage nach dem Speichern (Spielzeit der Runde beginnt neu),
// dann die neue Runde auf höherem Level mit neuem Abwurf
$('victoryNext').addEventListener('click', () => {
  ui.hideVictory();
  game.playTime = 0;
  sfx.playRadio();
  ui.openSave(newRound);
});
function newRound() {
  game.startNewRound();
  renderer.itemFx.reset();
  game.startDrop();
  renderer.dropship.start(game);
  game.pod.prevX = game.pod.x;
  game.pod.prevY = game.pod.y;
  renderer.snapNext = true;
}
setupScenarioMenu();
$('restartBtn').addEventListener('click', () => { running = true; start(); });
$('deathLoadBtn').addEventListener('click', () => { const save = readSave(); if (save) start(save); });
$('resumeBtn').addEventListener('click', () => setPaused(false));

// Tastatursteuerung der Menüs: Vorauswahl ist jeweils die naheliegendste Aktion
nav.register($('startScreen'), {
  initial: () => (readSave() ? 'loadBtn' : 'startBtn'),
  keys: (code) => { if (code !== 'KeyL') return false; loadGame(); return true; },
});
nav.register($('pauseScreen'), { initial: () => 'resumeBtn', back: () => setPaused(false) });
nav.register($('deathScreen'), { initial: () => (readSave() ? 'deathLoadBtn' : 'restartBtn') });

// ---------- Hauptschleife: feste 42 Hz Simulation, Darstellung interpoliert ----------
const STEP = 1 / FPS;
let acc = 0;
let last = performance.now();
game.pod.prevX = game.pod.x;
game.pod.prevY = game.pod.y;

function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (running && !userPaused && !held) {
    acc += dt;
    while (acc >= STEP) {
      game.pod.prevX = game.pod.x;
      game.pod.prevY = game.pod.y;
      game.step();
      game.tickTime();
      if (game.pod.dig && game.frame % 4 === 0) {
        const p = game.pod;
        const cx = p.dig.dir === 'down' ? p.x : p.x + p.dig.xDir * 25;
        const cy = p.dig.dir === 'down' ? p.y + 25 : p.y;
        renderer.spawnChunks(cx, cy, tileColorHex(game.dugTile, p.digY), 1);
      }
      acc -= STEP;
    }
  }
  const alpha = running && !game.paused ? acc / STEP : 1;
  sfx.update(running && !userPaused && !game.paused && !game.dead && !!game.pod.dig);
  // Tankwarnung wie die LOW-FUEL-Anzeige; bei leerem Tank (Countdown bis zur Explosion) schneller
  const playing = running && !userPaused && !game.paused && !game.dead;
  const fuelPct = game.pod.fuel / game.fuelCap;
  sfx.updateFuelWarning(!playing ? 0 : game.fuelEmptyFrames > 0 ? 2 : fuelPct < 0.15 ? 1 : 0);
  const m = game.pod.mod;
  sfx.updateEngine(running && !userPaused && !game.paused && !game.dead, game.engineLoad,
    m === 'air' || m === 'launching' || m === 'digdownlaunching');
  // Musik: jeder Shop mit eigenem Stück (ohne eigenes Stück: leiseres Hauptthema), Pause stumm;
  // unterhalb von DEEP_MUSIC_FT läuft das Tiefenthema statt des Hauptthemas
  const shopTrack = hasShopTrack(ui.shopId) ? ui.shopId : null;
  if (-game.depth >= DEEP_MUSIC_FT) deepMusic = true;
  else if (-game.depth < DEEP_MUSIC_FT - DEEP_MUSIC_HYST) deepMusic = false;
  const theme = deepMusic ? 'deep' : 'main';
  if (!running || userPaused) sfx.setMusic(shopTrack || theme, MUSIC_LEVEL.off);
  else if (shopTrack) sfx.setMusic(shopTrack, MUSIC_LEVEL.shopTrack);
  else sfx.setMusic(theme, game.paused ? MUSIC_LEVEL.shop : MUSIC_LEVEL.main);
  renderer.render(game, alpha, held ? 0 : dt);
  // Mothership: Brummen folgt dem Flug, beim Ausklinken ein Schlag
  const ship = renderer.shipAudio || { hum: 0 };
  sfx.updateShip(userPaused ? 0 : ship.hum, ship.rate);
  if (ship.released) sfx.playClunk();
  if (running) ui.updateHUD();
  requestAnimationFrame(loop);
}

// ---------- Ladebildschirm: erst alle Modelle und Bohrgeräusche laden, dann Startbildschirm ----------
let assetsReady = false;
let loadFailed = false; // nach einem Fehler darf der Fortschritt der übrigen Dateien die Meldung nicht überschreiben
try {
  await renderer.loadAssets((f) => {
    if (loadFailed) return;
    $('loadBar').style.width = (f * 100).toFixed(0) + '%';
    $('loadText').textContent = f < 1 ? t('loadingPct', Math.round(f * 100)) : t('preparing');
  }, [(progress) => sfx.preload(progress), (progress) => portrait.load(progress)]);
} catch (e) {
  console.error(e);
  loadFailed = true;
  $('loadText').textContent = t('loadError', e.message);
  $('loadText').classList.add('bad');
  throw e;
}
assetsReady = true;
// Werbetafel: Mr. Husk persönlich zeigt auf den Betrachter (einmal aus dem Porträt-Modell gerendert)
try { renderer.setBillboardPortrait(portrait.snapshotRecruiter()); } catch (e) { console.warn('Husk-Porträt für die Werbetafel fehlt', e); }
$('loadScreen').classList.add('hidden');
$('startScreen').classList.remove('hidden');
requestAnimationFrame(loop);

// ?autostart überspringt den Startbildschirm, ?keys=down,right hält Tasten gedrückt (zum Testen; alle Parameter nur im Testmodus, src/dev.js)
const params = devParams();
if (params.has('autostart')) start();
else if (params.has('menu')) $('scenarioBtn').click(); // ?menu öffnet die Testszenarien
if (params.has('zoom')) { renderer.zoom = +params.get('zoom'); renderer.resize(); }
if (params.has('time')) game.dayTime = +params.get('time'); // Tageszeit 0..2880 (Mittag 720, Mitternacht 2160)
if (params.has('scene')) (await import('../test/scenes.js')).scenes[params.get('scene')](game);
// ?battle=1|2|breakout|win: Endkampf direkt (Phase 1, Phase 2, Satans Ausbruch, Sieg), siehe test/scenes.js
if (params.has('battle')) (await import('../test/scenes.js')).battleScene(game, params.get('battle'));
// ?checkpoint=N: Storyline-Checkpunkt N (Funkspruch N wird regulär ausgelöst), siehe test/scenes.js
if (params.has('checkpoint')) (await import('../test/scenes.js')).checkpoint(game, +params.get('checkpoint'));
for (const k of (params.get('keys') || '').split(',')) if (k in input) input[k] = true;
// ?give=N füllt jedes Item auf N auf
if (params.has('give')) game.items.fill(+params.get('give') || 3);
if (params.has('cash')) game.cash = startCash = +params.get('cash');
// ?talk=I öffnet Funkspruch I sofort (Startdialog: ?talk=0)
if (params.has('talk')) game.openTransmission(+params.get('talk') || 0);
// ?find=N öffnet den Fundbericht von Sonderfund N (10 Knochen, 11 Truhe, 12 Skelett, 13 Artefakt) samt Gutschrift
// ?quake löst sofort ein Erdbeben aus (wie beim Verlassen eines Shops ab 150.000 Punkten mit Chance 1:20)
if (params.has('quake')) game.earthQuake(4);
// ?notice=rock zeigt den Hinweis beim ersten Bohrversuch in Fels
if (params.get('notice') === 'rock') game.checkRockHint(25);
if (params.has('find')) game.addToBay(Math.min(13, Math.max(10, +params.get('find') || 10)));
// ?up=drill:6,hull:5 setzt Upgrade-Stufen direkt (Tank und Hülle werden gefüllt)
for (const kv of (params.get('up') || '').split(',').filter(Boolean)) {
  const [k, v] = kv.split(':');
  if (k in game.up) game.up[k] = +v;
  game.pod.hp = game.maxHp;
  game.pod.fuel = game.fuelCap;
}
if (params.has('shop')) { game.paused = true; ui.openShop(params.get('shop')); } // ?shop=repair öffnet einen Shop
// ?warp=N simuliert N Frames sofort vor (z. B. für Screenshots unter Tage)
for (let i = 0, n = +params.get('warp') || 0; i < n && !game.paused; i++) {
  game.step();
  game.pod.prevX = game.pod.x;
  game.pod.prevY = game.pod.y;
}
renderer.snapNext = true;
// ?use=I setzt Item I sofort ein (nach ?warp)
if (params.has('use')) {
  game.itemTimer = 99;
  game.useItem(+params.get('use'));
}
// ?kill zerstört den Pod sofort (Explosion ansehen)
if (params.has('kill')) { deathReason = 'deathTest'; game.damage(game.pod.hp + 1); }
// ?stopAt=F spult F Frames samt Effekten vor und hält an (Items, Startsequenz, Explosion)
if (params.has('stopAt') && running) {
  const stopAt = +params.get('stopAt') || 0;
  for (let i = 0; i < stopAt; i++) {
    game.pod.prevX = game.pod.x;
    game.pod.prevY = game.pod.y;
    game.step();
    game.tickTime();
    renderer.render(game, 1, STEP);
  }
  held = stopAt > 0;
}
