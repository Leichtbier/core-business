// Spielkonstanten, 1:1 aus dem ActionScript von motherload.swf übernommen.
// Einheiten wie im Original: Pixel, Frames (42 fps), Tiles à 50 px.

export const FPS = 42;
export const TILE = 50;
export const EARTH_WIDTH = 36;
export const EARTH_HEIGHT = 600;

// Startsequenz: beim ersten Start läuft atv.move() zehnmal, dann hält das Mothership (mothershipMC) das
// Spiel 53 Frames an; in Frame 53 erscheint der Pod und das Spiel beginnt (droppedOff = true)
export const DROP_PREMOVES = 10;
export const DROP_FRAMES = 53;

// Funksprüche (transmissions[i] = new transmission(msg, sender, depth, bonus, image)): erscheinen der Reihe nach,
// sobald die größte erreichte Tiefe (in ft) die Schwelle überschreitet; der erste (depth -1) kommt nach der Landung,
// wenn dayTime > 40. Nr. 12 löst die Einfahrt in den Kern aus (preBattle), Nr. 13 Satans Ausbruch im Endkampf.
// Absender und Text stehen je Sprache in src/lang/*.js (transmissions, gleicher Index). image wählt das Porträt
// (src/portrait3d.js): husk = Mr. Husk im Anzug, husk_battle = mit Kampfausrüstung, satan, miner = anderer Pod,
// static = Rauschen
export const TRANSMISSIONS = [
  { depth: -1, bonus: 0, image: 'husk' },
  { depth: 500, bonus: 1000, image: 'husk' },
  { depth: 1000, bonus: 3000, image: 'husk' },
  { depth: 1750, bonus: 0, image: 'static', eyes: true },
  { depth: 2100, bonus: 0, image: 'miner' },
  { depth: 2500, bonus: 0, image: 'static' },
  { depth: 3100, bonus: 0, image: 'miner' },
  { depth: 3500, bonus: 25000, image: 'husk' },
  { depth: 4100, bonus: 0, image: 'miner' },
  { depth: 4500, bonus: 0, image: 'static' },
  { depth: 6200, bonus: 0, image: 'husk' },
  { depth: 7000, bonus: 0, image: 'husk' },
  { depth: 9998, bonus: 0, image: 'husk_battle' },
  { depth: 9999, bonus: 0, image: 'satan' },
];
export const TRANSMISSION_CORE = 12;  // preBattle: lastTransmission = 11, dann transmissionFrame
export const TRANSMISSION_SATAN = 13; // doneBreakout im Endkampf: lastTransmission = 12
export const TRANSMISSION_MIN_FRAMES = 20; // frühestens nach 20 Frames lässt sich ein Funkspruch schließen

// Tag-Nacht-Zyklus (updateTime/updateCosmos): ein Tag dauert 2880 Frames, Mittag bei 1/4, Mitternacht bei 3/4
export const DAY_LENGTH = 2880;

export const GRAVITY = 9.81;
export const FRICTION = 0.94;
export const AIR_RESISTANCE = 0.98;

// Bewegungsgrenzen des Pods in Weltkoordinaten: Mitte der ersten bis Mitte der letzten Tile-Spalte
// (Original: earthMinX/earthMaxX + Bildschirm 0..550 – dort waren die letzten zwei Spalten unerreichbar)
export const WORLD_MIN_X = 0;
export const WORLD_MAX_X = (EARTH_WIDTH - 1) * TILE;

// Welt-Y des Pods, bei dem der Höhenmesser 0 ft anzeigt: depth = int((204 - y) / 4)
export const DEPTH_ZERO_Y = 204;

// minerals[i] = new mineral(name, value, mass); Tile-ID = i + 6
export const MINERALS = [
  { name: 'Ironium', value: 30, mass: 1 },
  { name: 'Bronzium', value: 60, mass: 1 },
  { name: 'Silverium', value: 100, mass: 1 },
  { name: 'Goldium', value: 250, mass: 2 },
  { name: 'Platinium', value: 750, mass: 3 },
  { name: 'Einsteinium', value: 2000, mass: 4 },
  { name: 'Emerald', value: 5000, mass: 6 },
  { name: 'Ruby', value: 20000, mass: 8 },
  { name: 'Diamond', value: 100000, mass: 10 },
  { name: 'Amazonite', value: 500000, mass: 12 },
  // Sonderfunde (gehen nicht in den Laderaum, sondern werden sofort ausgezahlt)
  { name: 'Dinosaur Bones', value: 1000, mass: 1 },
  { name: 'Treasure', value: 5000, mass: 1 },
  { name: 'Martian Skeleton', value: 10000, mass: 1 },
  { name: 'Religious Artifact', value: 50000, mass: 1 },
  // Beute aus dem Endkampf (winFrame: mineralCollectCount 14..23, sofort ausgezahlt)
  { name: "Mr. Husk's Kevlar Suit", value: 50000, mass: 1 },
  { name: "Mr. Husk's Staff of Hell", value: 100000, mass: 1 },
  { name: "Mr. Husk's Laser Monocle", value: 200000, mass: 1 },
  { name: "Satan's Hooves", value: 300000, mass: 1 },
  { name: "Satan's Horns", value: 400000, mass: 1 },
  { name: "Satan's Evil Eye (right)", value: 500000, mass: 1 },
  { name: "Satan's Evil Eye (left)", value: 500000, mass: 1 },
  { name: "Satan's Boiler of Eternal Infernos", value: 600000, mass: 1 },
  { name: 'Martian Reward for Restoring Peace', value: 1000000, mass: 1 },
  { name: '250,000 Shares of Husk HI Inc.', value: 25000000, mass: 1 },
];

export const UPGRADES = {
  drill: {
    title: 'DRILL', unit: 'ft/s',
    names: ['Stock Drill', 'Silvide Drill', 'Goldium Drill', 'Emerald Drill', 'Ruby Drill', 'Diamond Drill', 'Amazonite Drill'],
    values: [2, 2.8, 4, 5, 7, 9.5, 12],
    prices: [0, 750, 2000, 5000, 20000, 100000, 500000],
  },
  hull: {
    title: 'HULL', unit: 'HP',
    names: ['Stock Hull', 'Ironium Hull', 'Bronzium Hull', 'Steel Hull', 'Platinium Hull', 'Einsteinium Hull', 'Energy-Shielded Hull'],
    values: [10, 17, 30, 50, 80, 120, 180],
    prices: [0, 750, 2000, 5000, 20000, 100000, 500000],
  },
  engine: {
    title: 'ENGINE', unit: 'HP',
    names: ['Stock Engine', 'V4 1600 cc', 'V4 2.0 Ltr Turbo', 'V6 3.8 Ltr', 'V8 Supercharged 5.0 Ltr', 'V12 6.0 Ltr', 'V16 Jag Engine'],
    values: [150, 160, 170, 180, 190, 200, 210],
    prices: [0, 750, 2000, 5000, 20000, 100000, 500000],
  },
  fuelTank: {
    title: 'FUEL TANK', unit: 'L',
    names: ['Micro Tank', 'Medium Tank', 'Huge Tank', 'Gigantic Tank', 'Titanic Tank', 'Leviathan Tank', 'Liquid Compression Tank'],
    values: [10, 15, 25, 40, 60, 100, 150],
    prices: [0, 750, 2000, 5000, 20000, 100000, 500000],
  },
  radiator: {
    title: 'RADIATOR', unit: '%', // angezeigt als Minderung des Hitzeschadens (lessHeat)
    names: ['Stock Fan', 'Dual Fans', 'Single Turbine', 'Dual Turbines', 'Puron Cooling', 'Tri-Turbine Freon Array'],
    values: [1, 0.9, 0.75, 0.6, 0.4, 0.2],
    prices: [0, 2000, 5000, 20000, 100000, 500000],
  },
  bay: {
    title: 'CARGO BAY', unit: 'slots', // angezeigt je Sprache (slots)
    names: ['Micro Bay', 'Medium Bay', 'Huge Bay', 'Gigantic Bay', 'Titanic Bay', 'Leviathan Bay'],
    values: [7, 15, 25, 40, 70, 120],
    prices: [0, 750, 2000, 5000, 20000, 100000],
  },
};

// item[i] = new podItem(name, price, desc, hotKey); gekauft in der Reparaturwerkstatt.
// key: KeyboardEvent.code der Taste, model/icon: Objektname in assets/items.glb bzw. Bild in assets/items/
export const ITEMS = [
  { name: 'Reserve Fuel Tank', price: 2000, desc: 'Portable backup - refills up to 25 Liters instantaneously.', hotKey: 'F', key: 'KeyF', model: 'Item_Fuel', icon: 'fuel' },
  { name: 'Hull Repair Nanobots', price: 7500, desc: 'Repairs a maximum of 30 Damage anytime, anywhere.', hotKey: 'R', key: 'KeyR', model: 'Item_Nanobots', icon: 'nanobots' },
  { name: 'Dynamite', price: 2000, desc: 'Blasts clear a small area around your pod.', hotKey: 'X', key: 'KeyX', model: 'Item_Dynamite', icon: 'dynamite' },
  { name: 'Plastic Explosives', price: 5000, desc: 'Creates an enormous explosion, clearing a large area around your pod.', hotKey: 'C', key: 'KeyC', model: 'Item_C4', icon: 'c4' },
  { name: 'Quantum Teleporter', price: 2000, desc: 'Teleports you somewhere above surface level.  (results may vary)', hotKey: 'Q', key: 'KeyQ', model: 'Item_Quantum', icon: 'quantum' },
  { name: 'Matter Transmitter', price: 10000, desc: 'Safely and accurately returns you above ground.', hotKey: 'M', key: 'KeyM', model: 'Item_Matter', icon: 'matter' },
];
export const ITEM = { FUEL: 0, NANOBOTS: 1, DYNAMITE: 2, C4: 3, QUANTUM: 4, MATTER: 5 };

export const FUEL_PRICE_PER_L = 1;   // buyFuel: $1 pro Liter
export const REPAIR_COST = 15;       // repair: $15 pro HP

// Gebäude an der Oberfläche: Auslöse-Spalte (Tx bei Ty == 4) und Rückstoß beim Verlassen
export const BUILDINGS = [
  { id: 'fuel', name: 'FUEL', triggerX: 3, push: 55, cols: [3, 5], rows: [3, 4], color: 0xd24a2a, model: 'assets/fuel_station.glb' },
  { id: 'sell', name: 'MINERAL PROCESSING', triggerX: 10, push: -55, cols: [10, 13], rows: [2, 4], color: 0x3a78c8, model: 'assets/mineral_processing.glb' },
  { id: 'upgrade', name: 'UPGRADES', triggerX: 24, push: -55, cols: [22, 25], rows: [2, 4], color: 0xe0a020, model: 'assets/upgrade_shop.glb' },
  { id: 'repair', name: 'REPAIR', triggerX: 31, push: -55, cols: [30, 32], rows: [3, 4], color: 0x40a050, model: 'assets/repair_shop.glb' },
];

// Tile-IDs (earth[x][y][0])
//   0          leer
//   1..5       Erde
//   6..19      Mineralien / Sonderfunde (MINERALS[id-6])
//   25..27     Fels (nicht bohrbar)
//   28..30     Lava
//   31         Gastasche (sieht aus wie Erde)
//   -1,-2      Gras   -3..-5 Pflaster (nicht bohrbar)
//   -6,-7      Stalaktiten  -8 Dunkelheit  -9..-12 Seelen  -999 Kern-Hohlraum
//   -100       wird gerade gebohrt   < -100 Gebäude-Kulisse
export const T = {
  EMPTY: 0, ROCK_MIN: 25, ROCK_MAX: 27, LAVA_MIN: 28, LAVA_MAX: 30, GAS: 31,
  DIGGING: -100, BLANK: -999,
};

// Fundberichte beim Bergen eines Sonderfunds (finds) und Hinweise des Bordcomputers (notices): src/lang/*.js

// Erdbeben (earthQuakeChance / earthQuake): beim Verlassen eines Shops, wenn p1.score > 150000, mit random(20) == 0;
// immer mit Stärke 4 (dann verrutscht jede Reihe ab Reihe 11 bis earthHeight-16)
export const QUAKE = { minScore: 150000, chance: 20, magnitude: 4, firstRow: 11 };

// Save-Pod (savePodMC): schwebt über der Oberfläche bei earthMC-Koordinaten (850, -50), solange eY > -5.
// Die Trefferfläche ist die Bitmap-Form 73 x 98 px (Shape 1961, Mitte bei x + 36.5); ihr Clip wippt in
// 57 Frames auf und ab (Mittelpunkt y + 44.05 .. y + 54.05). hitTest prüft den Mittelpunkt des Pods.
export const SAVE_POD = {
  x: 850, y: -50, w: 73, top: -49.05, bottom: 48.95, cx: 36.5,
  bob: [49.05, 49.75, 50.4, 50.95, 51.5, 52.0, 52.4, 52.8, 53.15, 53.4, 53.65, 53.8, 53.95, 54.0, 54.05, 53.95, 53.85,
    53.7, 53.5, 53.25, 52.95, 52.65, 52.25, 51.85, 51.35, 50.85, 50.3, 49.7, 49.05, 48.4, 47.8, 47.25, 46.75, 46.25,
    45.85, 45.45, 45.15, 44.85, 44.6, 44.4, 44.25, 44.15, 44.05, 44.15, 44.25, 44.4, 44.6, 44.85, 45.15, 45.45, 45.85,
    46.25, 46.75, 47.25, 47.8, 48.4, 49.05],
  push: 55, // exitSave: der Pod wird 55 px nach rechts gesetzt und angehalten
};
// Spielstand (saveGameOffline): 32 Werte wie myObj.objArray im Original, 7 Item-Plätze (hier 6 belegt)
export const SAVE_SLOTS = 32;
