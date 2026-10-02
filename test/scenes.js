import { TRANSMISSIONS, TRANSMISSION_CORE, TRANSMISSION_SATAN, DEPTH_ZERO_Y } from '../src/constants.js';

// Nachgestellte Situationen für Screenshots (index.html?autostart&scene=NAME&keys=...&warp=N)
// Pod an der Oberfläche in Spalte col absetzen (für Screenshots der Gebäude)
const surfaceAt = (col) => (game) => {
  Object.assign(game.pod, { x: col * 50, y: 5 * 50 - 45, xVel: 0, yVel: 0, mod: 'ground', tread: true, facing: 'right', anim: null });
};

export const scenes = {
  // Pod steht auf einem Goldium-Tile (id 9) in normalem Erdreich und bohrt es nach unten an
  gem(game) {
    const w = game.world, p = game.pod;
    for (let x = 4; x <= 12; x++) for (let y = 8; y <= 14; y++) w.set(x, y, 1);
    w.set(8, 10, 0);
    w.set(8, 11, 9);
    Object.assign(p, { x: 400, y: 11 * 50 - 45, xVel: 0, yVel: 0, mod: 'ground', tread: true, facing: 'left', anim: null });
  },
  upgradeView: surfaceAt(20),
  repairView: surfaceAt(28),
  // Gerader Schacht in Spalte 8 von der Oberfläche bis Reihe 40, dazu ein Quergang in Reihe 18; der Pod steht
  // oben am Schacht. Mit ?quake verrutschen alle Reihen ab 11: der Schacht wird zum Zickzack
  shaft(game) {
    const w = game.world, p = game.pod;
    for (let x = 0; x < 36; x++) for (let y = 6; y <= 44; y++) w.set(x, y, 1 + ((x * 7 + y * 3) % 5));
    for (let y = 6; y <= 40; y++) w.set(8, y, 0);
    for (let x = 4; x <= 13; x++) w.set(x, 18, 0);
    Object.assign(p, { x: 7 * 50, y: 4 * 50 + 4.5, xVel: 0, yVel: 0, mod: 'ground', tread: true, facing: 'right', anim: null });
  },
  // Pod steht in einer Kammer (Reihe 60) mitten in Felsbrocken aller drei Sorten, darunter und daneben
  // Erdreich; mit ?give=3&use=2 (Dynamit) bzw. use=3 (C4) brechen die Brocken auseinander
  boulders(game) {
    const w = game.world, p = game.pod, row = 60;
    for (let x = 0; x < 36; x++) for (let y = row - 5; y <= row + 5; y++) w.set(x, y, 1 + ((x * 7 + y * 3) % 5));
    for (let x = 4; x <= 12; x++) for (let y = row - 3; y <= row + 3; y++) if ((x + y) % 3 !== 0) w.set(x, y, 25 + ((x * 5 + y) % 3));
    w.set(8, row, 0);
    w.set(8, row + 1, 1);
    Object.assign(p, { x: 8 * 50, y: row * 50 + 4.5, xVel: 0, yVel: 0, mod: 'ground', tread: true, facing: 'right', anim: null });
  },
  // vor der Mineralverarbeitung mit gemischter Fracht im Laderaum (für ?shop=sell)
  cargo(game) {
    surfaceAt(8)(game);
    game.up.bay = 3;
    Object.assign(game.bay, [9, 6, 4, 3, 2, 1, 1, 0, 0, 0]);
  },
  // Pod schwebt links neben dem Save-Pod (x 850..923 px, y -50..48 px); mit keys=right fliegt er hinein
  savePod(game) {
    Object.assign(game.pod, { x: 835, y: 0, xVel: 0, yVel: 0, mod: 'air', tread: false, facing: 'right', anim: null });
    game.buildingTimer = 16; // wie nach einer Weile an der Oberfläche
  },
  // Gang in Reihe 12 über die ganze Kartenbreite, Pod in der Mitte; mit keys=right bzw. keys=left&warp=N
  // fährt er bis an den Rand (Erreichbarkeit der äußeren Spalten, Kamera-Begrenzung)
  edge(game) {
    const w = game.world, p = game.pod;
    for (let x = 0; x < 36; x++) for (let y = 8; y <= 16; y++) w.set(x, y, y === 12 ? 0 : 1 + ((x * 7 + y * 3) % 5));
    Object.assign(p, { x: 17 * 50, y: 12 * 50 + 4.5, xVel: 0, yVel: 0, mod: 'ground', tread: true, facing: 'right', anim: null });
  },
  // Tief unten (Reihe 450): gegrabene Gänge und eine Höhle neben ungegrabenem Erdreich
  deep(game) {
    const w = game.world, p = game.pod;
    for (let x = 0; x < 36; x++) for (let y = 440; y <= 462; y++) w.set(x, y, 1 + ((x * 7 + y * 3) % 5));
    for (let x = 4; x <= 14; x++) w.set(x, 450, 0);              // waagrechter Gang
    for (let y = 444; y <= 456; y++) w.set(9, y, 0);             // senkrechter Schacht
    for (let x = 11; x <= 13; x++) for (let y = 446; y <= 448; y++) w.set(x, y, 0); // kleine Höhle
    Object.assign(p, { x: 400, y: 451 * 50 - 45, xVel: 0, yVel: 0, mod: 'ground', tread: true, facing: 'right', anim: null });
  },
  // Alle 14 Mineralien nebeneinander (Reihe 20 bzw. mit ?row=N tiefer), darüber ein Gang zum Vergleichen
  // Alle zehn Mineralien und die vier Sonderfunde (Tile 6..19, nach Wert aufsteigend) nebeneinander unter einem
  // langen Gang in Reihe 90 (Sonderfunde natürlich erst ab Reihe 80), je ein Erd-Tile Abstand: Spalten 3, 5, ... 29.
  // Der Pod steht links am Anfang des Gangs und kann alles der Reihe nach von oben anbohren. Damit das ohne
  // Umweg zur Oberfläche geht: Medium Bay (15 Plätze für die zehn Mineralien) und voller Huge Tank (25 L).
  finds(game) {
    const w = game.world, p = game.pod, row = 90;
    for (let x = 0; x < 36; x++) for (let y = row - 4; y <= row + 3; y++) w.set(x, y, 1 + ((x * 7 + y * 3) % 5));
    for (let x = 1; x <= 31; x++) w.set(x, row - 1, 0);            // Gang über der Reihe
    for (let k = 0; k < 14; k++) w.set(3 + k * 2, row, 6 + k);
    w.rot[w.idx(3 + 11 * 2, row)] = 0; // Treasure liegt wie im Original immer gerade (generate: rot = 0 für Tile 17)
    game.up.bay = Math.max(game.up.bay, 1);
    game.up.fuelTank = Math.max(game.up.fuelTank, 2);
    p.fuel = game.fuelCap;
    Object.assign(p, { x: 2 * 50, y: (row - 1) * 50 + 4.5, xVel: 0, yVel: 0, mod: 'ground', tread: true, facing: 'right', anim: null });
  },
  minerals(game) {
    const w = game.world, p = game.pod;
    const row = +new URLSearchParams(location.search).get('row') || 20;
    for (let x = 0; x < 36; x++) for (let y = row - 4; y <= row + 3; y++) w.set(x, y, 1 + ((x * 7 + y * 3) % 5));
    for (let x = 1; x <= 16; x++) w.set(x, row - 1, 0);                        // Gang über den Mineralien
    for (let k = 0; k < 14; k++) w.set(2 + k, row, 6 + k);                    // Reihe 1: alle Sorten
    for (let k = 0; k < 10; k++) w.set(2 + k, row + 1, 6 + k);                // Reihe 2: die zehn Erze erneut
    Object.assign(p, { x: 8 * 50, y: (row - 1) * 50 + 4.5, xVel: 0, yVel: 0, mod: 'ground', tread: true, facing: 'right', anim: null });
  },
  // Magmaeinschlüsse: einzeln, als Gruppe und direkt am Gang (Reihe 120)
  lava(game) {
    const w = game.world, p = game.pod;
    for (let x = 0; x < 36; x++) for (let y = 112; y <= 128; y++) w.set(x, y, 1 + ((x * 7 + y * 3) % 5));
    for (let x = 4; x <= 13; x++) w.set(x, 120, 0);                 // Gang
    w.set(10, 119, 28); w.set(11, 119, 29); w.set(11, 118, 30);       // Gruppe direkt über dem Gang
    w.set(6, 117, 29); w.set(12, 122, 28); w.set(5, 121, 30);         // einzelne Einschlüsse
    w.set(14, 120, 28);                                              // am Gangende
    Object.assign(p, { x: 400, y: 121 * 50 - 45, xVel: 0, yVel: 0, mod: 'ground', tread: true, facing: 'right', anim: null });
  },
  // Pod in einer kleinen Kammer, Blick nach rechts; dahinter 2 Tiles Fels, dann eine große Höhle.
  // Der Scheinwerfer darf die Höhle nicht durch den Fels hindurch beleuchten.
  leak(game) {
    const w = game.world, p = game.pod;
    for (let x = 2; x <= 20; x++) for (let y = 12; y <= 20; y++) w.set(x, y, 1);
    w.set(8, 16, 0);                                            // Kammer des Pods
    for (let x = 11; x <= 16; x++) for (let y = 14; y <= 18; y++) w.set(x, y, 0); // Höhle hinter dem Fels
    Object.assign(p, { x: 400, y: 17 * 50 - 45, xVel: 0, yVel: 0, mod: 'ground', tread: true, facing: 'right', anim: null });
  },
  // Pod steht auf einem einzelnen Block in einem Hohlraum (links, rechts und darunter leer)
  pillar(game) {
    const w = game.world, p = game.pod;
    for (let x = 4; x <= 12; x++) for (let y = 8; y <= 14; y++) w.set(x, y, 1);
    for (let x = 6; x <= 10; x++) for (let y = 9; y <= 12; y++) w.set(x, y, 0);
    w.set(8, 11, 3);
    Object.assign(p, { x: 400, y: 11 * 50 - 45, xVel: 0, yVel: 0, mod: 'ground', tread: true, facing: 'left', anim: null });
  },
  // Seitwärts bohren in einen Block, über und unter dem Ziel ist Hohlraum
  ledge(game) {
    const w = game.world, p = game.pod;
    for (let x = 4; x <= 12; x++) for (let y = 8; y <= 14; y++) w.set(x, y, 1);
    for (let x = 6; x <= 10; x++) for (let y = 9; y <= 10; y++) w.set(x, y, 0);
    w.set(9, 10, 1); w.set(9, 11, 0);      // Ziel: fester Block, darüber und darunter Hohlraum
    Object.assign(p, { x: 404.5, y: 11 * 50 - 45, xVel: 0, yVel: 0, mod: 'ground', tread: true, facing: 'right', anim: null });
  },
};

// Ausstattung für den Endkampf, wie sie ein Spieler nach dem Weg in den Kern (~7.400 ft) typischerweise hat:
// gut, aber nicht voll ausgebaut (rund $520.000 investiert; die letzte Stufe kostet je $500.000, beim Laderaum
// $100.000), unterwegs etwas Tank und
// Hülle verbraucht, einige Items aufgebraucht und eine Ladung wertvoller Mineralien aus der Tiefe an Bord.
//   Diamond Drill, Einsteinium Hull (120 HP), V12, Leviathan Tank (100 L), Puron Cooling (60 % weniger
//   Hitzeschaden, im Endkampf wirkt der Kühler auch auf die Treffer des Bosses), Titanic Bay (70 Plätze)
// Die Szenario-Optionen (Alle Items ×5, alle Upgrades maximal, Testgeld) werden danach angewendet und gehen vor.
export function endgameLoadout(game) {
  Object.assign(game.up, { drill: 5, hull: 5, engine: 5, fuelTank: 5, radiator: 4, bay: 4 });
  game.pod.hp = Math.round(game.maxHp * 0.85);
  game.pod.fuel = game.fuelCap * 0.6;
  game.items.splice(0, game.items.length, 2, 2, 3, 2, 1, 1); // Reservetank, Nanobots, Dynamit, C4, Quanten-, Materieteleporter
  game.bay.splice(0, 10, 0, 0, 0, 0, 5, 6, 4, 3, 1, 0);      // Platinium, Einsteinium, Emerald, Ruby, Diamond
  game.cash = 38000;
  game.score = 2400000;
}

// Storyline-Checkpunkte: Stand der Funksprüche setzen und den Pod so platzieren, dass Funkspruch n auf dem
// normalen Weg ausgelöst wird (Tiefe knapp unter der Schwelle bzw. Einfahrt in den Kern). Nr. 13 kommt im
// Original erst im Endkampf (Satans Ausbruch); bis der Kampf existiert, öffnet ihn der Checkpunkt direkt.
export function checkpoint(game, n) {
  const w = game.world, p = game.pod, H = w.height;
  game.lastTransmission = n - 1;
  game.dayTime = Math.max(game.dayTime, 60);
  const standAt = (col, row) => Object.assign(p, {
    x: col * 50, y: row * 50 + 4.5, xVel: 0, yVel: 0, mod: 'ground', tread: true, facing: 'right', anim: null,
  });
  if (n === 0) {                                     // Startdialog an der Oberfläche
    game.dayTime = 30;
    standAt(8, 4);
    return;
  }
  if (n >= TRANSMISSION_CORE) {                      // im Kern (Hohlraum über dem Kernboden)
    standAt(8, H - 6);
    endgameLoadout(game);
    game.maxDepth = game.depth;
    if (n === TRANSMISSION_SATAN) {
      game.inCore = true;
      game.openTransmission(TRANSMISSION_SATAN);
    }
    return;
  }
  // Kammer so tief, dass die größte Tiefe die Schwelle gerade überschreitet
  const depth = TRANSMISSIONS[n].depth + 8;
  const row = Math.ceil((DEPTH_ZERO_Y + 4 * depth - 4.5) / 50);
  for (let x = 4; x <= 12; x++) for (let y = row - 3; y <= row + 3; y++) w.set(x, y, 1 + ((x * 7 + y * 3) % 5));
  w.set(8, row, 0);
  w.set(8, row - 1, 0);
  standAt(8, row);
  game.maxDepth = 0;
}

// Endkampf direkt: mode 1 (Phase 1), 2 (Phase 2 läuft), breakout (Satan bricht aus), win (Siegesbildschirm)
export function battleScene(game, mode) {
  const p = game.pod, H = game.world.height;
  // Pod einige Tiles links vom Boss (satan._x = 1200)
  Object.assign(p, { x: (mode === '1' ? 22 : 25) * 50, y: (H - 6) * 50 + 4.5, xVel: 0, yVel: 0, mod: 'ground', tread: true, facing: 'right', anim: null });
  game.inCore = true;
  game.lastTransmission = TRANSMISSION_CORE;
  endgameLoadout(game);
  game.maxDepth = game.depth;
  game.startBattle();
  const b = game.battle;
  if (mode === '2' || mode === 'breakout') {
    b.preBattleP2();
    if (mode === '2') { game.lastTransmission = TRANSMISSION_SATAN; b.startP2(); }
  }
  if (mode === 'win') game.winBattle();
  // ?bossState=melee|ranged: Boss greift sofort an (für Screenshots)
  const st = new URLSearchParams(location.search).get('bossState');
  if (game.battle?.active && st === 'melee') game.battle.startMelee();
  if (game.battle?.active && st === 'ranged') game.battle.startRanged();
}
