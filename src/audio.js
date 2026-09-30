// Soundeffekte über die Web Audio API.
// Bohren: Im Original startet bei jedem Bohrbeginn eine zufällige von fünf Varianten ('SFXdrill10' + random(5))
// mit zufälligem Versatz und läuft bis doneDigging. Unsere Samples sind kurze, ausklingende Schläge (~0.5 s),
// daher werden sie während des Bohrens überlappend nacheinander abgespielt, jeweils eine andere Variante.

const DRILL_FILES = [1, 2, 3].map((i) => new URL(`../assets/sounds/drill_${i}.wav`, import.meta.url));
const DRILL_INTERVAL = 0.34;   // Sekunden zwischen zwei Schlägen
const DRILL_JITTER = 0.06;     // zufällige Abweichung davon
const DRILL_VOLUME = 0.55;
const FADE_OUT = 0.12;

// Motor: Im Original spielt idle(s) je nach Last s (100 im Stand, 130 beim Fahren, 150 beim Bohren nach
// unten, in der Luft 120..150) eine höher gestimmte Variante mit Lautstärke s - 40. Wir haben ein Sample
// und ändern Tonhöhe und Lautstärke mit der Last. Im Shop ist der Motor aus (stopIdle), in der Pause stumm.
const ENGINE_FILE = new URL('../assets/sounds/engine.wav', import.meta.url);

// Einzelne Effekte (Lautstärke 0..1):
//   buy        Kasse, im Original SFXpurchase (Tanken, Reparatur, Upgrades, Items) und SFXsale (Verkauf)
//   explosion  Pod zerstört, Gastasche, Dynamit und C4 (im Original SFXexplode, Lautstärke 80)
//   fuelLow    Warnton der Tankanzeige (im Original SFXfuelLow, Lautstärke 50), wiederholt sich
const SFX = {
  buy: { url: new URL('../assets/sounds/buy.wav', import.meta.url), volume: 0.7 },
  explosion: { url: new URL('../assets/sounds/explosion.wav', import.meta.url), volume: 0.8 },
  fuelLow: { url: new URL('../assets/sounds/fuel_low.wav', import.meta.url), volume: 0.45 },
};
// Abstand der Warntöne: Tank fast leer bzw. leer (die 99 Frames bis zur Explosion laufen)
const SHIP_VOLUME = 0.55;
export const FUEL_WARN_INTERVAL = { low: 1.2, empty: 0.5 };
const ENGINE_VOLUME = 0.32;   // Lautstärke bei Last 150
const ENGINE_AIR_BOOST = 1.15; // in der Luft läuft im Original zusätzlich der Rotor

// Musik: Im Original läuft das Hauptthema mit Lautstärke 70 (Bohren: 100), in den Shops ein eigenes
// Stück mit 30, das bei jedem Betreten von vorne startet, in der Pause 0 (changeBGM / pauseGame).
// Hier: jeder Shop hat sein eigenes Stück (Schlüssel = Shop-ID); ein Shop ohne eigenes Stück würde das
// Hauptthema leiser weiterspielen. Stücke werden gestreamt (komplett dekodiert wären es ~60 MB für das Hauptthema).
const MUSIC_FILES = {
  main: new URL('../assets/music/main_theme.mp3', import.meta.url),
  fuel: new URL('../assets/music/fuel_station.mp3', import.meta.url),
  sell: new URL('../assets/music/mineral_processing.mp3', import.meta.url),
  upgrade: new URL('../assets/music/upgrade_shop.mp3', import.meta.url),
  repair: new URL('../assets/music/repair_shop.mp3', import.meta.url),
};
const RESTART_ON_ENTER = new Set(['fuel', 'sell', 'upgrade', 'repair']); // Shop-Musik beginnt wie im Original immer von vorne
export const hasShopTrack = (shopId) => shopId !== 'main' && shopId in MUSIC_FILES;
export const MUSIC_LEVEL = { main: 0.4, shop: 0.17, shopTrack: 0.32, off: 0 };
const MUSIC_FADE = 0.6; // Sekunden für Überblendungen

export class SoundFX {
  constructor() {
    this.ctx = null;
    this.drill = [];
    this.drilling = false;
    this.nextHit = 0;
    this.lastVariant = -1;
    this.voices = new Set();
    this.tracks = {};     // Name -> { el, gain, level }
    this.current = null;  // aktuell gewähltes Stück
    this.musicMuted = false;
    this.musicVolume = 1; // Regler 0..1 (unten rechts), wirkt quadratisch wie ein Lautstärkeregler
    this.sfxVolume = 1;
    this.sfxMuted = false;
    this.sfx = {};        // Name -> AudioBuffer (siehe SFX)
    this.sfxData = {};    // vorgeladene, noch nicht dekodierte Daten
    this.nextWarn = 0;
  }

  // Lautstärke von Musik und Effekten getrennt (0..1) und je stumm schaltbar; wirkt auch vor init()
  setMusicMuted(muted) { this.musicMuted = muted; this.applyVolume(); }
  setMusicVolume(v) { this.musicVolume = v; this.applyVolume(); }
  setSfxMuted(muted) { this.sfxMuted = muted; this.applyVolume(); }
  setSfxVolume(v) { this.sfxVolume = v; this.applyVolume(); }
  get musicGain() { return this.musicMuted ? 0 : this.musicVolume ** 2; }
  get sfxGain() { return this.sfxMuted ? 0 : this.sfxVolume ** 2; }

  applyVolume() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const [bus, v] of [[this.musicBus, this.musicGain], [this.master, this.sfxGain]]) {
      if (!bus) continue;
      const g = bus.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(v, now + 0.1);
    }
  }

  // Einen Effekt aus SFX abspielen; volume skaliert die Grundlautstärke, rate ändert die Tonhöhe
  play(name, { volume = 1, rate = 1, when = 0 } = {}) {
    const buf = this.sfx[name];
    if (!this.ctx || !buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const gain = this.ctx.createGain();
    gain.gain.value = SFX[name].volume * volume;
    src.connect(gain).connect(this.master);
    src.start(when);
  }

  playBuy() { this.play('buy'); }

  // Jeden Frame aufrufen: level 0 = aus, 1 = Tank fast leer, 2 = leer. Der Warnton wiederholt sich,
  // bei leerem Tank doppelt so schnell; nach einer Pause beginnt er sofort wieder.
  updateFuelWarning(level) {
    if (!this.ctx || !this.sfx.fuelLow) return;
    const now = this.ctx.currentTime;
    if (!level) { this.nextWarn = 0; return; }
    const gap = level === 2 ? FUEL_WARN_INTERVAL.empty : FUEL_WARN_INTERVAL.low;
    if (!this.nextWarn || this.nextWarn > now + gap) this.nextWarn = now;
    if (now >= this.nextWarn) {
      this.play('fuelLow', { rate: level === 2 ? 1.08 : 1 });
      this.nextWarn = now + gap;
    }
  }

  // Während des Ladebildschirms: Bohrgeräusche herunterladen (dekodiert wird erst in init())
  async preload(onProgress = () => {}) {
    let done = 0;
    const names = Object.keys(SFX);
    const files = [...DRILL_FILES, ENGINE_FILE, ...names.map((n) => SFX[n].url)];
    const data = await Promise.all(files.map(async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url.pathname} konnte nicht geladen werden (HTTP ${res.status})`);
      const buf = await res.arrayBuffer();
      onProgress(++done / files.length);
      return buf;
    }));
    for (const n of [...names].reverse()) this.sfxData[n] = data.pop();
    this.engineData = data.pop();
    this.drillData = data;
  }

  // Browser erlauben Audio erst nach einer Nutzeraktion: beim Spielstart aufrufen
  async init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const t = this.tracks[this.current];
      if (t?.el.paused && t.level > 0) t.el.play().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); // alle Soundeffekte (Regler "Effekte")
    this.master.gain.value = this.sfxGain;
    this.master.connect(this.ctx.destination);
    this.initMusic();
    try {
      const data = this.drillData || await Promise.all(DRILL_FILES.map(async (url) => (await fetch(url)).arrayBuffer()));
      this.drill = await Promise.all(data.map((buf) => this.ctx.decodeAudioData(buf.slice(0))));
      const engineBuf = this.engineData || await (await fetch(ENGINE_FILE)).arrayBuffer();
      this.startEngine(seamlessLoop(this.ctx, await this.ctx.decodeAudioData(engineBuf.slice(0))));
      for (const [n, def] of Object.entries(SFX)) {
        const buf = this.sfxData[n] || await (await fetch(def.url)).arrayBuffer();
        this.sfx[n] = await this.ctx.decodeAudioData(buf.slice(0));
      }
    } catch (e) {
      console.warn('Bohrgeräusche konnten nicht geladen werden', e);
      this.drill = [];
    }
  }

  initMusic() {
    this.musicBus = this.ctx.createGain(); // gemeinsamer Regler aller Musikstücke (Regler "Musik")
    this.musicBus.gain.value = this.musicGain;
    this.musicBus.connect(this.ctx.destination);
    for (const [name, url] of Object.entries(MUSIC_FILES)) {
      const el = new window.Audio();
      el.src = url.href;
      el.loop = true;
      el.preload = name === 'main' ? 'auto' : 'metadata';
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      this.ctx.createMediaElementSource(el).connect(gain).connect(this.musicBus);
      this.tracks[name] = { el, gain, level: 0, stopTimer: null };
    }
  }

  // Stück und Lautstärke wählen; alles wird weich übergeblendet, stumme Stücke werden danach angehalten
  setMusic(name, level) {
    if (!this.ctx || !this.tracks[name]) return;
    const entering = name !== this.current;
    this.current = name;
    const now = this.ctx.currentTime;
    for (const [n, t] of Object.entries(this.tracks)) {
      const target = n === name ? level : 0;
      if (target === t.level) continue;
      t.level = target;
      const g = t.gain.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(target, now + MUSIC_FADE);
      clearTimeout(t.stopTimer);
      if (target > 0) {
        if (entering && RESTART_ON_ENTER.has(n)) t.el.currentTime = 0;
        if (t.el.paused) t.el.play().catch((e) => console.warn('Musik konnte nicht gestartet werden', e));
      } else {
        t.stopTimer = setTimeout(() => { if (t.level === 0) t.el.pause(); }, MUSIC_FADE * 1000 + 50);
      }
    }
  }

  // Mothership der Startsequenz: tiefes Brummen (Motor-Sample stark heruntergestimmt), Lautstärke und
  // Tonhöhe folgen dem Flug; jeden Frame aufrufen (level 0 = aus)
  updateShip(level, rate = 0.4) {
    if (!this.ctx || !this.engineLoopBuf) return;
    if (!this.ship) {
      if (level <= 0) return;
      const src = this.ctx.createBufferSource();
      src.buffer = this.engineLoopBuf;
      src.loop = true;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain).connect(this.master);
      src.start();
      this.ship = { src, gain };
    }
    const now = this.ctx.currentTime;
    this.ship.gain.gain.setTargetAtTime(SHIP_VOLUME * level, now, 0.08);
    this.ship.src.playbackRate.setTargetAtTime(rate, now, 0.15);
    if (level <= 0) {
      const { src } = this.ship;
      this.ship = null;
      src.stop(now + 0.5);
    }
  }

  // Funkspruch (im Original SFXtransmission): kurzes Rauschen und zwei Pieptöne, synthetisch erzeugt
  playRadio() {
    if (!this.ctx) return;
    const c = this.ctx, now = c.currentTime;
    const len = Math.floor(c.sampleRate * 0.35);
    const noise = c.createBuffer(1, len, c.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = noise;
    const band = c.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1800;
    const ng = c.createGain();
    ng.gain.value = 0.25;
    src.connect(band).connect(ng).connect(this.master);
    src.start(now);
    for (const [t, f] of [[0.32, 1320], [0.46, 1760]]) {
      const o = c.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.setValueAtTime(0, now + t);
      g.gain.linearRampToValueAtTime(0.08, now + t + 0.01);
      g.gain.linearRampToValueAtTime(0, now + t + 0.1);
      o.connect(g).connect(this.master);
      o.start(now + t);
      o.stop(now + t + 0.12);
    }
  }

  // Laser-Monokel: sirrender, abfallender Ton (synthetisch), so lang wie der Strahl
  playLaser() {
    if (!this.ctx) return;
    const c = this.ctx, now = c.currentTime, len = 35 / 42;
    const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain();
    o.type = 'sawtooth';
    o2.type = 'square';
    o.frequency.setValueAtTime(900, now);
    o.frequency.exponentialRampToValueAtTime(420, now + len);
    o2.frequency.setValueAtTime(906, now);
    o2.frequency.exponentialRampToValueAtTime(418, now + len);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.07, now + 0.03);
    g.gain.setValueAtTime(0.07, now + len - 0.1);
    g.gain.linearRampToValueAtTime(0, now + len);
    o.connect(g); o2.connect(g); g.connect(this.master);
    o.start(now); o2.start(now); o.stop(now + len); o2.stop(now + len);
  }

  // Ausklinken des Pods: dumpfer Schlag (Bohrschlag, tief gestimmt)
  playClunk() {
    if (!this.ctx || !this.drill.length) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.drill[0];
    src.playbackRate.value = 0.5;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.9;
    src.connect(gain).connect(this.master);
    src.start();
  }

  startEngine(buffer) {
    this.engineLoopBuf = buffer;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    src.connect(this.engineGain).connect(this.master);
    src.start();
    this.engine = src;
  }

  // Jeden Frame aufrufen: Motor folgt der Last (100..180), aus im Shop/Pause/Tod
  updateEngine(active, load, air) {
    if (!this.engine) return;
    const now = this.ctx.currentTime;
    const s = Math.max(100, Math.min(load, 180));
    const vol = active ? ENGINE_VOLUME * (s - 40) / 110 * (air ? ENGINE_AIR_BOOST : 1) : 0;
    const rate = 0.9 + (s - 100) / 100 * 0.45;
    this.engineGain.gain.setTargetAtTime(vol, now, active ? 0.08 : 0.05);
    this.engine.playbackRate.setTargetAtTime(rate, now, 0.12);
  }

  // Jeden Frame aufrufen: spielt Bohrschläge, solange active wahr ist
  update(active) {
    if (!this.ctx || !this.drill.length) return;
    const now = this.ctx.currentTime;
    if (active && !this.drilling) {
      this.drilling = true;
      this.nextHit = now + Math.random() * 0.05; // wie der zufällige Startversatz im Original
    } else if (!active && this.drilling) {
      this.drilling = false;
      this.fadeOutAll(now);
    }
    // bis kurz in die Zukunft vorplanen, damit Frame-Schwankungen keine Lücken erzeugen
    while (this.drilling && this.nextHit < now + 0.1) {
      this.playHit(Math.max(this.nextHit, now));
      this.nextHit += DRILL_INTERVAL + (Math.random() * 2 - 1) * DRILL_JITTER;
    }
  }

  playHit(when) {
    let v;
    do { v = Math.floor(Math.random() * this.drill.length); } while (this.drill.length > 1 && v === this.lastVariant);
    this.lastVariant = v;
    const src = this.ctx.createBufferSource();
    src.buffer = this.drill[v];
    src.playbackRate.value = 0.94 + Math.random() * 0.12;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(DRILL_VOLUME, when + 0.015);
    src.connect(gain).connect(this.master);
    src.start(when);
    const voice = { src, gain };
    this.voices.add(voice);
    src.onended = () => this.voices.delete(voice);
  }

  fadeOutAll(now) {
    for (const { src, gain } of this.voices) {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + FADE_OUT);
      try { src.stop(now + FADE_OUT + 0.02); } catch { /* schon beendet */ }
    }
  }
}

// Aus einem Sample mit ausklingendem Ende eine nahtlose Schleife bauen: der Schluss wird mit gleicher
// Leistung in den Anfang überblendet (Sample 1.0 s: Schleife 0.1..0.9 s, Überblendung 0.1 s).
export function seamlessLoop(ctx, src, fade = 0.1, cut = 0.1) {
  const rate = src.sampleRate, F = Math.floor(fade * rate), start = F;
  const L = Math.floor((src.duration - cut) * rate) - F - start + F;
  const out = ctx.createBuffer(src.numberOfChannels, L, rate);
  for (let c = 0; c < src.numberOfChannels; c++) {
    const a = src.getChannelData(c), o = out.getChannelData(c);
    for (let i = 0; i < L; i++) o[i] = a[start + i];
    for (let j = 0; j < F; j++) {
      const t = j / F;
      o[L - F + j] = a[start + L - F + j] * Math.cos(t * Math.PI / 2) + a[j] * Math.sin(t * Math.PI / 2);
    }
  }
  return out;
}
