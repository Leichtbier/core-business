import {
  TILE, GRAVITY, FRICTION, AIR_RESISTANCE, WORLD_MIN_X, WORLD_MAX_X, DEPTH_ZERO_Y,
  MINERALS, UPGRADES, BUILDINGS, T, DAY_LENGTH, ITEMS, ITEM, DROP_PREMOVES, DROP_FRAMES, TRANSMISSIONS, TRANSMISSION_CORE, TRANSMISSION_SATAN,
  SAVE_POD, SAVE_SLOTS, QUAKE,
} from './constants.js';
import { World, random } from './world.js';
import { Battle, LOOT_FIRST, LOOT_LAST, LOOT_INTERVAL } from './battle.js';
import { t as tr, itemName, upgradeName } from './i18n.js'; // tr, weil t hier oft eine Tile-ID ist

const W = 20; // halbe Breite des Pods (atv.width)
const H = 20; // halbe Höhe des Pods (atv.height)

// Frame-Längen der Flash-Animationen, deren letzter Frame ein Skript auslöst
const ANIM_FRAMES = { launch: 10, land: 10, digdownlaunch: 7, digacrosslaunch: 10, turn: 4 };
const DIG_DOWN_DEPLOY = 9;   // sprite430: Bewegung beginnt in Frame 10
const DIG_ACROSS_DEPLOY = 1; // sprite454: Bewegung beginnt in Frame 2
const FUEL_DEATH_FRAMES = 99; // sprite480: nach 99 Frames leerem Tank -> die()

// Items, die das Spiel anhalten (gotoLabel 'itemFrame'): Dauer bis zur Rückkehr nach 'mainFrame' in Frames.
//   Dynamit (itemDynamiteMC): 30 Explosionen à 1 pro Frame, danach removeTiles() im 3x3-Feld
//   C4 (itemC4MC): 90 Explosionen à 2 pro Frame, danach removeTiles() im 5x5-Feld
//   Quantenteleporter (sprite1545): Versetzen in Frame 42, Weltaufbau 7 x 2 Frames, Pod wieder da in Frame 76
//   Materietransmitter (sprite1643): Versetzen in Frame 47, Weltaufbau 7 x 2 Frames, Pod wieder da in Frame 92
const ITEM_ANIM = {
  [ITEM.DYNAMITE]: { len: 31, radius: 1 },
  [ITEM.C4]: { len: 47, radius: 2 },
  [ITEM.QUANTUM]: { len: 89, relocate: 43 },
  [ITEM.MATTER]: { len: 105, relocate: 48 },
};
const ITEM_COOLDOWN = 5; // useItem: nur wenn itemTimer > 5 (itemTimer zählt in tileEvents, also alle 4 Frames)

export class Game {
  constructor(input, events) {
    this.input = input;   // { left, right, up, down } -> bool
    this.events = events; // Callbacks an UI/Renderer
    this.reset();
  }

  reset() {
    this.world = new World();
    this.cash = 20;
    this.score = 0;
    this.lvl = 1;
    this.mineralValueMod = this.lvl; // difficulties(...).mineralValueMod
    this.up = { drill: 0, hull: 0, engine: 0, fuelTank: 0, radiator: 0, bay: 0 };
    this.bay = new Array(10).fill(0);
    this.items = new Array(ITEMS.length).fill(0); // atv.usableItem
    this.itemTimer = 0;
    this.itemAnim = null; // laufendes Item mit Spielpause: { id, frame, len }
    this.quakeAnim = null; // laufendes Erdbeben (quakeFrame): { frame, move, acc, offset }
    this.dropAnim = null; // Startsequenz: { frame, len }
    this.lastTransmission = -1; // zuletzt gezeigter Funkspruch
    this.transmission = null;   // gerade offener Funkspruch (Index); das Spiel steht solange
    this.findReport = null;     // gerade offener Fundbericht (Index in MINERALS, 10..13); das Spiel steht solange
    this.notice = null;         // gerade offener Hinweis ('rock': erster Bohrversuch in Fels); das Spiel steht solange
    this.rockHintShown = false;
    this.inCore = false;        // im Original currentBGM == 'core' (Kernbereich, Endkampf)
    this.battle = null;         // laufender Endkampf (battleMode)
    this.victory = null;        // Siegesbildschirm mit Beute (winFrame)
    this.satanDead = false;
    const pod = {
      x: 400, y: 100, xVel: 0, yVel: 0, rotorVel: 0, rotation: 0,
      facing: 'left', mod: 'air', tread: false,
      hp: 10, fuel: 6,
      anim: null,   // { type, frame, dir }
      dig: null,    // Bohrzustand
      digX: -1, digY: -1, difX: 0,
      hidden: false, // während eines Teleports unsichtbar (atvMC._visible = 0)
    };
    this.pod = pod;
    this.dugTile = 0;
    this.launchCount = 0;
    this.steamCount = 0;
    this.engineLoad = 100;
    this.dayTime = 0; // updateTime: läuft jeden Frame, auch in den Shops
    this.playTime = 0;      // Frames dieser Runde (updateTime), wird mitgespeichert
    this.totalPlayTime = 0; // Frames aller Runden
    this.savePodFrame = -1; // Frame des wippenden Save-Pods, -1 = nicht angezeigt (unter Tage)
    this.saving = false;    // Speicherdialog offen (saveFrame)
    this.mainCount = 0;
    this.buildingTimer = 0;
    this.fuelEmptyFrames = 0;
    this.maxDepth = 0;
    this.frame = 0;
    this.dead = false;
    this.paused = false; // z. B. während ein Shop offen ist
  }

  // ---------- abgeleitete Werte ----------
  get enginePower() { return UPGRADES.engine.values[this.up.engine]; }
  get maxHp() { return UPGRADES.hull.values[this.up.hull]; }
  get fuelCap() { return UPGRADES.fuelTank.values[this.up.fuelTank]; }
  get cooling() { return UPGRADES.radiator.values[this.up.radiator]; }
  get drillSpeed() { return UPGRADES.drill.values[this.up.drill]; }
  get baySize() { return UPGRADES.bay.values[this.up.bay]; }
  get baySpace() { return this.baySize - this.bay.reduce((a, b) => a + b, 0); }
  get mass() {
    let m = 198;
    for (let i = 0; i < 10; i++) m += this.bay[i] * MINERALS[i].mass;
    return m;
  }
  get depth() { return Math.trunc((DEPTH_ZERO_Y - this.pod.y) / 4); }
  mineralPrice(i) { return Math.trunc(MINERALS[i].value / this.mineralValueMod); }

  hit(px, py) { return this.world.hit(px, py); }
  canAct() { const f = this.pod.facing; return f === 'left' || f === 'right'; }

  // ---------- Schaden / Tod ----------
  damage(d) {
    const p = this.pod;
    if (p.mod === 'dead') return;
    d = Math.trunc(d);
    if (d === 0) return;
    p.hp -= d;
    this.events.damage?.(d);
    if (p.hp <= 0) this.die();
  }

  die() {
    const p = this.pod;
    if (p.mod === 'dead') return;
    p.mod = 'dead';
    p.dig = null;
    this.world.lagSolid = -1;
    p.anim = null;
    this.dead = true;
    this.events.death?.();
  }

  addToBay(n) {
    if (n > 9) {
      this.cash += MINERALS[n].value;
      this.events.bonus?.(MINERALS[n].value);
      this.events.dialogue?.(tr('wow'));
      // Zusätzlich zum Original: Fundbericht wie ein Funkspruch, das Spiel steht, bis er geschlossen wird
      if (n <= 13) {
        this.findReport = n;
        this.paused = true;
        this.events.specialFind?.(n);
      }
      return true;
    }
    if (this.baySpace > 0) { this.bay[n]++; return true; }
    return false;
  }

  getTilePoints(t) {
    if (t < 6 || t > 27) return 25 * this.mineralValueMod;
    t = Math.min(t, 14);
    return MINERALS[t - 6].value * 5 * this.mineralValueMod;
  }

  // Tageszeit weiterzählen (im Original in allen Spiel- und Shop-Frames, nicht in der Pause)
  tickTime() {
    if (this.dead || this.itemAnim || this.dropAnim || this.quakeAnim || this.transmission !== null || this.findReport !== null || this.notice !== null) return; // dort läuft updateTime nicht
    this.dayTime = (this.dayTime + 1) % (DAY_LENGTH + 1);
    this.playTime++;
    this.totalPlayTime++;
  }

  // ---------- Hauptschleife: ein Flash-Frame ----------
  step() {
    if (this.victory) { this.tickVictory(); return; }
    if (this.paused || this.dead) return;
    if (this.quakeAnim) { this.tickQuake(); return; } // quakeFrame: das Spiel steht, nur das Erdreich zittert
    // Items mit Spielpause: der Boss läuft im Original weiter (eigene Clips in earthMC)
    if (this.itemAnim) { this.tickItem(); this.battle?.update(); return; }
    if (this.dropAnim) {
      if (++this.dropAnim.frame >= this.dropAnim.len) {
        this.dropAnim = null;
        this.events.dropped?.();
      }
      return;
    }
    this.frame++;
    this.updateSavePod();
    this.mainCount++;
    if (this.mainCount >= 4) {
      this.tileEvents();
      this.mainCount = 0;
      if (!this.paused) this.checkTransmissions();
    }
    if (this.paused) return; // tileEvents kann einen Shop öffnen, checkTransmissions einen Funkspruch
    this.move();
    this.tickAnims();
    this.battle?.update();
    this.checkFuel();
    this.maxDepth = Math.min(this.depth, this.maxDepth);
  }

  checkFuel() {
    const p = this.pod;
    if (p.fuel < 0) p.fuel = 0;
    // fuelTankMC.gotoAndStop(101 - pct): Frame 101 enthält die Todes-Animation
    if (101 - Math.trunc((p.fuel / this.fuelCap) * 100) >= 101) {
      if (++this.fuelEmptyFrames >= FUEL_DEATH_FRAMES) this.die();
    } else {
      this.fuelEmptyFrames = 0;
    }
  }

  // vehicle.prototype.move
  move() {
    const p = this.pod, inp = this.input;
    const P = this.enginePower;
    // Motorlast wie idl im Original (Grundlage für den Motorsound): 100 im Stand, mehr bei Schub/Bohren.
    // Beim Bohren wird sie nicht neu berechnet, der letzte Wert bleibt stehen.
    let idl = null;
    if (p.mod !== 'digging') {
      const m = this.mass;
      idl = 100;
      const onGround = Math.trunc(p.yVel / 10) === 0 &&
        (this.hit(p.x + W - 1, p.y + H + 1) || this.hit(p.x - W + 1, p.y + H + 1));

      if (onGround) {
        if (inp.right) {
          if (p.mod === 'ground' && this.hit(p.x + W + 1, p.y) && this.canAct()) { this.startDigging('right'); idl = 120; }
          p.xVel = Math.min(p.xVel + P / m, P / 10);
          p.fuel -= P / 50000;
          this.steamCount += 4;
          idl += 30;
        } else if (inp.left) {
          if (this.canAct() && p.mod === 'ground' && this.hit(p.x - W - 1, p.y)) { this.startDigging('left'); idl = 120; }
          p.xVel = Math.max(p.xVel - P / m, -P / 10);
          p.fuel -= P / 50000;
          this.steamCount += 4;
          idl += 30;
        }
        if (inp.up) {
          if (this.canAct()) {
            p.yVel = Math.max(p.yVel - (P / m) * 2, -P / 10);
            p.fuel -= P / 50000;
            this.startTransform('launch');
          }
        } else if (inp.down) {
          if (this.canAct() && p.mod === 'ground') { this.startDigging('down'); idl = 150; }
        }
        p.xVel *= FRICTION;
        p.rotation = 0;
        if (p.mod === 'air' && this.canAct()) {
          p.rotorVel = 0;
          this.startTransform('land');
        } else if (p.mod === 'ground') {
          if (p.facing === 'left' && p.xVel > 0) this.startTurning('right', 'ground');
          else if (p.facing === 'right' && p.xVel < 0) this.startTurning('left', 'ground');
        }
      } else {
        if (inp.right) {
          p.xVel = Math.min(p.xVel + P / m / 1.5, P / 10);
          p.rotation = Math.min(p.rotation + P / 50, 15);
          p.fuel -= P / 50000;
          p.rotorVel = Math.min(p.rotorVel + 0.3, 11);
          this.steamCount += 2;
          idl += 20;
        } else if (inp.left) {
          p.xVel = Math.max(p.xVel - P / m / 1.5, -P / 10);
          p.rotation = Math.max(p.rotation - P / 50, -15);
          p.fuel -= P / 50000;
          p.rotorVel = Math.min(p.rotorVel + 0.3, 11);
          this.steamCount += 2;
          idl += 20;
        } else if (p.rotation > 1) p.rotation -= 1;
        else if (p.rotation < -1) p.rotation += 1;

        if (inp.up) {
          if (p.mod === 'air') {
            p.rotorVel = Math.min(p.rotorVel + 1, 11);
            p.yVel = Math.max(p.yVel - P / m, -P / 12);
          } else {
            p.yVel = Math.max(p.yVel - P / m / 1.5, -P / 12);
          }
          p.rotation *= 0.7;
          p.fuel -= P / 50000;
          this.steamCount += 4;
          idl += 30;
        }
        p.xVel *= AIR_RESISTANCE;
        p.yVel *= AIR_RESISTANCE;
        p.yVel = Math.min(p.yVel + GRAVITY / 30, 20);

        if (p.mod === 'ground' && this.canAct()) {
          if (++this.launchCount > 5) {
            this.startTransform('launch');
            this.launchCount = 0;
          }
        } else if (p.mod === 'air') {
          this.launchCount = 0;
          if (p.facing === 'left' && p.xVel > 0) this.startTurning('right', 'air');
          else if (p.facing === 'right' && p.xVel < 0) this.startTurning('left', 'air');
          p.rotorVel = Math.max(p.rotorVel * 0.95, 2);
        } else {
          this.launchCount = 0;
        }
      }
    }

    if (idl !== null) this.engineLoad = idl;
    // Leerlaufverbrauch (läuft auch beim Bohren)
    p.fuel -= P / 100000;

    // Kollision
    if (p.xVel > 0) {
      if (this.hit(p.x + p.xVel + W, p.y + H) || this.hit(p.x + p.xVel + W, p.y - H)) p.xVel = 0;
    } else if (p.xVel < 0) {
      if (this.hit(p.x + p.xVel - W, p.y + H) || this.hit(p.x + p.xVel - W, p.y - H)) p.xVel = 0;
    }
    if (p.yVel > 0) {
      if (this.hit(p.x + W, p.y + p.yVel + H) || this.hit(p.x - W, p.y + p.yVel + H)) {
        if (p.yVel > 7) {
          this.events.crash?.();
          this.damage(p.yVel / 2);
        }
        p.yVel *= -0.2;
      }
    } else if (p.yVel < 0) {
      if (this.hit(p.x + W, p.y + p.yVel - H - 1) || this.hit(p.x - W, p.y + p.yVel - H - 1)) p.yVel *= -0.2;
    }
    if ((this.hit(p.x + W - 1, p.y + H + 1) || this.hit(p.x - W + 1, p.y + H + 1)) && Math.abs(p.yVel) < 0.12) p.yVel = 0;
    if (Math.abs(p.xVel) < 0.12) p.xVel = 0;
    if (Math.abs(p.yVel) < 0.07) p.yVel = 0;

    p.x = Math.min(Math.max(p.x + p.xVel, WORLD_MIN_X), WORLD_MAX_X);
    p.y += p.yVel;

    // Abgase (optExhaust): Zähler läuft auch im Leerlauf, über 20 entsteht ein Wölkchen (addSteam)
    this.steamCount += 2;
    if (this.steamCount > 20) {
      this.steamCount = 0;
      this.events.steam?.();
    }
  }

  // ---------- Animationen mit Skript am Ende ----------
  startTransform(m) {
    const p = this.pod;
    if (m === 'land') {
      p.mod = 'landing';
      p.anim = { type: 'land', frame: 0 };
    } else if (m === 'launch') {
      if (p.mod === 'launching' || !p.tread) return;
      p.mod = 'launching';
      p.tread = false;
      p.anim = { type: 'launch', frame: 0 };
    } else if (m === 'digdownlaunch') {
      p.mod = 'launching';
      p.tread = false;
      p.anim = { type: 'digdownlaunch', frame: 0 };
    } else if (m === 'digacrosslaunch') {
      p.mod = 'digdownlaunching';
      p.tread = false;
      p.anim = { type: 'digacrosslaunch', frame: 0 };
    }
  }

  doneTransform(m) {
    const p = this.pod;
    if (m === 'land') { p.mod = 'ground'; p.tread = true; }
    else p.mod = 'air';
  }

  startTurning(dir, m) {
    const p = this.pod;
    p.facing = dir === 'left' ? 'turning_left' : 'turning_right';
    if (m === 'ground') p.tread = false;
    p.anim = { type: 'turn', frame: 0, dir, m };
  }

  doneTurning(m) {
    const p = this.pod;
    if (p.facing === 'turning_left') p.facing = 'left';
    else if (p.facing === 'turning_right') p.facing = 'right';
    if (m === 'ground') p.tread = true;
  }

  tickAnims() {
    const p = this.pod;
    if (p.dig) this.tickDig();
    const a = p.anim;
    if (!a) return;
    a.frame++;
    if (a.frame < ANIM_FRAMES[a.type]) return;
    p.anim = null;
    if (a.type === 'turn') this.doneTurning(a.m);
    else this.doneTransform(a.type);
  }

  // ---------- Bohren ----------
  diggable(t) {
    return t !== undefined && t !== 0 && ((t > -3 && t < 25) || t > 27);
  }

  startDigging(dir) {
    const p = this.pod, w = this.world;
    if (!p.tread || this.input.up) return;
    p.xVel = 0;
    p.yVel = 0;
    if (dir === 'down') {
      p.digX = Math.trunc(p.x / TILE + 0.5);
      p.digY = Math.trunc(p.y / TILE + 1.5);
      const t = w.get(p.digX, p.digY);
      if (t === 0 || t === undefined) return;
      if (this.diggable(t)) {
        p.mod = 'digging';
        p.tread = false;
        p.anim = null;
        this.dugTile = t;
        w.set(p.digX, p.digY, T.DIGGING);
        w.lagSolid = w.idx(p.digX, p.digY);
        p.difX = p.digX * TILE - p.x;
        p.dig = { dir: 'down', frame: 0, vel: 0, moved: 0, reloaded: false, xDir: 0 };
        this.events.digStart?.(p.digX, p.digY, t);
        if (this.isLava(t)) this.lavaHit(29 * this.cooling);
      } else {
        if (p.mod === 'digging') p.mod = 'ground';
        this.events.undiggable?.();
        this.checkRockHint(t);
      }
    } else if (dir === 'right' || dir === 'left') {
      if (!this.hit(p.x + W / 2, p.y + H + 10) && !this.hit(p.x - W / 2, p.y + H + 10)) return;
      p.digX = Math.trunc(p.x / TILE + 0.5) + (dir === 'right' ? 1 : -1);
      p.digY = Math.trunc(p.y / TILE + 0.5);
      const t = w.get(p.digX, p.digY);
      if (t === 0 || t === undefined) return;
      if (this.diggable(t)) {
        p.facing = dir;
        p.mod = 'digging';
        p.tread = false;
        p.anim = null;
        this.dugTile = t;
        w.set(p.digX, p.digY, T.DIGGING);
        w.lagSolid = w.idx(p.digX, p.digY);
        p.dig = { dir: 'across', frame: 0, vel: 0, moved: 0, reloaded: false, xDir: dir === 'right' ? 1 : -1 };
        this.events.digStart?.(p.digX, p.digY, t);
        if (this.isLava(t)) this.lavaHit(29 * this.cooling);
      } else {
        this.events.undiggable?.();
        this.checkRockHint(t);
      }
    }
  }

  isLava(t) { return t > 27 && t < 31; }
  lavaHit(d) { this.events.lava?.(); this.damage(d); }

  hitGasPocket() {
    this.events.gas?.();
    this.damage(Math.trunc(-(this.depth + 3000) / 15) * this.cooling);
  }

  digVelocity() {
    const v = 0.5 * this.drillSpeed;
    return v / (1 + -this.depth / 1000);
  }

  // Frame-Skripte aus sprite430 (runter) und sprite454 (seitwärts)
  tickDig() {
    const p = this.pod, d = p.dig;
    if (!d || p.mod === 'dead') return;
    d.frame++;
    const P = this.enginePower;
    if (d.dir === 'down') {
      if (d.frame < DIG_DOWN_DEPLOY) return;
      if (d.frame === DIG_DOWN_DEPLOY) { d.vel = this.digVelocity(); return; }
      p.y += d.vel;
      d.moved += d.vel;
      p.x += (p.difX / 50) * d.vel;
      p.fuel -= P / 25000;
      this.steamCount += 4;
      if ((d.frame - DIG_DOWN_DEPLOY) % 3 !== 0) return;
      if (d.moved < 50) {
        if (d.moved > 20 && !d.reloaded) {
          d.reloaded = true;
          this.world.lagSolid = -1; // reloadTile(): Kollision des Tiles entfernen
          this.world.rot[this.world.idx(p.digX, p.digY)] = 0;
          if (this.isLava(this.dugTile)) this.lavaHit(29 * this.cooling);
          if (this.dugTile === T.GAS) this.hitGasPocket();
        }
      } else {
        p.y -= d.moved - 50;
        p.dig = null;
        this.doneDigging('down');
      }
    } else {
      if (d.frame <= DIG_ACROSS_DEPLOY) { d.vel = this.digVelocity(); return; }
      p.x += d.vel * d.xDir;
      d.moved += d.vel;
      p.fuel -= P / 25000;
      this.steamCount += 4;
      if ((d.frame - DIG_ACROSS_DEPLOY) % 3 !== 0) return;
      if (d.moved < 40) {
        if (d.moved > 15 && !d.reloaded) {
          d.reloaded = true;
          this.world.lagSolid = -1; // reloadTile(): Kollision des Tiles entfernen
          this.world.rot[this.world.idx(p.digX, p.digY)] = 2 + d.xDir;
          if (this.isLava(this.dugTile)) this.lavaHit(12);
          if (this.dugTile === T.GAS) this.hitGasPocket();
        }
      } else {
        p.x -= (d.moved - 40) * d.xDir;
        p.dig = null;
        this.doneDigging('across');
      }
    }
  }

  // Fortschritt 0..1 des aktuellen Bohrvorgangs (nur für die Darstellung)
  digProgress() {
    const d = this.pod.dig;
    if (!d) return 0;
    return Math.min(1, d.moved / (d.dir === 'down' ? 50 : 40));
  }

  doneDigging(dir) {
    const p = this.pod, w = this.world;
    if (p.mod === 'dead') return;
    w.lagSolid = -1;
    w.set(p.digX, p.digY, 0);
    const t = this.dugTile;
    if (t > 5 && t < 28) {
      if (this.addToBay(t - 6)) {
        if (t - 6 <= 9) this.events.mineral?.(t - 6);
      } else {
        this.events.warning?.(tr('bayFull'));
      }
    }
    const pts = this.getTilePoints(t);
    this.score += pts;
    this.events.points?.(pts);
    this.events.digDone?.(p.digX, p.digY, t);

    if (dir === 'down') {
      this.launchCount = 0;
      if (this.hit(p.x + W / 2, p.y + H + 10) || this.hit(p.x - W / 2, p.y + H + 10)) {
        p.tread = true;
        if (this.input.down && !this.paused) this.startDigging('down');
        else p.mod = 'ground';
        if (p.mod === 'digging' && !p.dig) p.mod = 'ground';
      } else {
        this.startTransform('digdownlaunch');
      }
    } else {
      if (this.hit(p.x + W, p.y + H + 10) || this.hit(p.x - W, p.y + H + 10)) {
        p.mod = 'ground';
        p.tread = true;
      } else {
        this.startTransform('digacrosslaunch');
      }
    }
  }

  // ---------- Funksprüche (checkTransmissions / transmissionFrame) ----------
  checkTransmissions() {
    const next = TRANSMISSIONS[this.lastTransmission + 1];
    if (!next || !(-this.maxDepth > next.depth)) return;
    if (this.lastTransmission < 0 && !(this.dayTime > 40)) return;
    this.openTransmission(this.lastTransmission + 1);
  }

  openTransmission(i) {
    this.lastTransmission = i;
    this.transmission = i;
    this.paused = true;
    if (TRANSMISSIONS[i].bonus) this.cash += TRANSMISSIONS[i].bonus;
    this.events.transmission?.(i);
  }

  closeTransmission() {
    const t = this.transmission;
    if (t === null) return;
    this.transmission = null;
    this.paused = false;
    // Nach "Wir sehen uns in der Hölle" beginnt der Kampf, nach "Sieh meine wahre Gestalt" Phase 2
    if (t === TRANSMISSION_CORE && this.inCore && !this.battle) this.startBattle();
    if (t === TRANSMISSION_SATAN && this.battle) this.battle.startP2();
  }

  // Zusätzlich zum Original: beim ersten Bohrversuch in Fels (Tile 25..27) ein Hinweis wie ein Funkspruch.
  // Einmal pro Spiel (nicht im Spielstand, nach dem Laden also erneut); das Spiel steht, bis er geschlossen wird.
  checkRockHint(t) {
    if (this.rockHintShown || !(t >= T.ROCK_MIN && t <= T.ROCK_MAX)) return;
    this.rockHintShown = true;
    this.notice = 'rock';
    this.paused = true;
    this.pod.xVel = 0;
    this.events.notice?.('rock');
  }

  closeNotice() {
    if (this.notice === null) return;
    this.notice = null;
    this.paused = false;
  }

  closeFindReport() {
    if (this.findReport === null) return;
    this.findReport = null;
    this.paused = false;
  }

  // ---------- Endkampf ----------
  startBattle() {
    this.battle = new Battle(this);
    this.events.battleStart?.();
  }

  stopBattle() {
    if (!this.battle) return;
    this.battle = null;
    this.events.battleStop?.();
  }

  // doneBreakout: Satan ist ausgebrochen, Funkspruch 13
  bossBrokeOut() {
    this.openTransmission(TRANSMISSION_SATAN);
  }

  // doneDeath von Phase 2: winFrame. Neue Runde auf höherem Level: Upgrades, Items und Laderaum zurück,
  // Hülle und Tank voll; danach wird Stück für Stück die Beute ausgezahlt.
  winBattle() {
    this.satanDead = true;
    this.battle = null;
    this.lvl++;
    this.mineralValueMod = this.lvl;
    for (const k in this.up) this.up[k] = 0;
    this.pod.hp = this.maxHp;
    this.pod.fuel = this.fuelCap;
    this.bay.fill(0);
    this.items.fill(0);
    this.victory = { count: 0, next: LOOT_FIRST - 1, done: false };
    this.events.victory?.();
  }

  tickVictory() {
    const v = this.victory;
    v.count++;
    if (v.next < LOOT_LAST) {
      if (v.count > LOOT_INTERVAL) {
        v.count = 0;
        v.next++;
        this.cash += MINERALS[v.next].value;
        this.events.loot?.(v.next);
      }
    } else if (!v.done) {
      v.done = true;
      this.events.lootDone?.();
    }
  }

  // Weiter nach dem Sieg: neue Welt, neuer Abwurf; Geld, Punkte und Level bleiben
  startNewRound() {
    const keep = {
      cash: this.cash, score: this.score, lvl: this.lvl, playTime: this.playTime, totalPlayTime: this.totalPlayTime,
      rockHintShown: this.rockHintShown, // den Fels-Hinweis kennt der Spieler schon
    };
    this.reset();
    Object.assign(this, keep);
    this.mineralValueMod = this.lvl;
  }

  // ---------- Startsequenz (main frame 5 / dropFrame / mothershipMC) ----------
  // Nach reset() aufrufen, wenn das Mothership den Pod absetzen soll
  startDrop() {
    for (let i = 0; i < DROP_PREMOVES; i++) this.move();
    this.dropAnim = { frame: 0, len: DROP_FRAMES };
  }

  // ---------- Items (useItem im Original) ----------
  // Liefert true, wenn das Item eingesetzt wurde. Tasten wirken nur im laufenden Spiel (gameMode 0, keine Pause).
  useItem(i) {
    if (this.paused || this.dead || this.itemAnim || this.dropAnim || this.quakeAnim) return false;
    if (!(this.items[i] > 0)) { this.events.itemEmpty?.(i); return false; }
    if (!(this.itemTimer > ITEM_COOLDOWN)) return false;
    const p = this.pod;
    if (i === ITEM.FUEL) {
      p.fuel = Math.min(p.fuel + 25, this.fuelCap);
    } else if (i === ITEM.NANOBOTS) {
      p.hp = Math.min(p.hp + 30, this.maxHp);
    } else {
      if (p.mod !== 'ground') return false; // Sprengen und Teleportieren nur auf festem Boden
      this.itemAnim = { id: i, frame: 0, len: ITEM_ANIM[i].len };
      if (ITEM_ANIM[i].relocate) p.hidden = true;
      // im Endkampf trifft die Sprengung den Boss sofort beim Zünden (attackDynamite / attackC4)
      if (i === ITEM.DYNAMITE) this.battle?.attackDynamite();
      if (i === ITEM.C4) this.battle?.attackC4();
    }
    this.items[i]--;
    this.itemTimer = 0;
    this.events.itemUsed?.(i);
    return true;
  }

  // Ein Frame des itemFrame: das Spiel steht, nur die Item-Animation läuft
  tickItem() {
    const a = this.itemAnim, cfg = ITEM_ANIM[a.id], p = this.pod;
    a.frame++;
    if (cfg.relocate && a.frame === cfg.relocate) this.teleport(a.id);
    if (a.frame < a.len) return;
    this.itemAnim = null;
    if (cfg.radius) {
      const cleared = this.removeTiles(cfg.radius);
      this.events.blast?.(a.id, cleared);
    } else {
      p.hidden = false;
      this.events.itemDone?.(a.id);
    }
  }

  // removeTiles() aus itemDynamiteMC/itemC4MC: alles außer Pflaster, Gebäuden und Kern verschwindet –
  // auch Fels, Lava und wertvolle Mineralien (ohne Gutschrift)
  removeTiles(r) {
    const p = this.pod, w = this.world;
    const px = Math.trunc(p.x / TILE + 0.5), py = Math.trunc(p.y / TILE + 0.5);
    const cleared = [];
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        const x = px + dx, y = py + dy;
        if (x < 0 || x >= w.width - 2 || y < 0 || y >= w.height - 2) continue;
        const t = w.get(x, y);
        if (t === 0 || !(t > -3)) continue;
        w.set(x, y, 0);
        cleared.push([x, y, t]);
      }
    }
    return cleared;
  }

  // Zielpunkte aus sprite1545/sprite1643: earthMC auf (0, y0), Pod auf (250, 300) -> Welt-y = 300 - y0
  teleport(id) {
    const p = this.pod;
    p.x = 250;
    if (id === ITEM.QUANTUM) {
      p.y = 300 - (random(100) + 200);
      p.xVel = random(40) - 20;
      p.yVel = random(100) - 30;
    } else {
      p.y = 200;
      p.xVel = 0;
      p.yVel = 0;
    }
    this.events.teleport?.(id);
  }

  buyItem(i) {
    const it = ITEMS[i];
    if (this.cash < it.price) return { ok: false, msg: tr('noCash') };
    this.cash -= it.price;
    this.items[i]++;
    return { ok: true, msg: tr('itemBought', itemName(i), it.hotKey) };
  }

  // ---------- Oberfläche: Gebäude ----------
  // vehicle.prototype.tileEvents (läuft jeden 4. Frame)
  tileEvents() {
    this.itemTimer++;
    const p = this.pod;
    const Tx = Math.trunc(p.x / TILE + 0.5);
    const Ty = Math.trunc(p.y / TILE);
    // Kern: Einfahrt unter Reihe earthHeight-13 löst preBattle aus (Funkspruch 12), Rückkehr über
    // earthHeight-17 beendet den Kernbereich wieder (stopBattle). Der Endkampf selbst folgt später.
    const H = this.world.height;
    if (Ty > H - 13) {
      if (!this.inCore) {
        this.inCore = true;
        this.events.enterCore?.();
        this.openTransmission(TRANSMISSION_CORE);
        return;
      }
    } else if (Ty < H - 17 && this.inCore) {
      this.inCore = false;
      this.stopBattle();
      this.events.leaveCore?.();
    }
    if (Ty > 6) return; // Original: nur nahe der Oberfläche (eY > -5)
    this.buildingTimer++;
    if (p.mod === 'ground' && this.buildingTimer > 15 && Ty === 4) {
      const b = BUILDINGS.find((b) => b.triggerX === Tx);
      if (!b) return;
      p.x += b.push;
      p.xVel = 0;
      this.buildingTimer = 0;
      this.paused = true;
      this.events.enterShop?.(b.id);
    } else if (this.savePodHit() && this.buildingTimer > 15) {
      // Save-Pod in der Luft angeflogen: saveFrame, der Pod wird rechts daneben angehalten
      p.x += SAVE_POD.push;
      p.xVel = 0;
      p.yVel = 0;
      this.buildingTimer = 0;
      this.paused = true;
      this.saving = true;
      this.events.enterSave?.();
    }
  }

  // ---------- Speichern (savePodMC / saveFrame / saveGameOffline) ----------
  // displaySavePod/removeSavePod: der Clip existiert nur nahe der Oberfläche und beginnt beim Einblenden neu
  updateSavePod() {
    if (Math.trunc(this.pod.y / TILE) > 6) this.savePodFrame = -1;
    else this.savePodFrame = (this.savePodFrame + 1) % SAVE_POD.bob.length;
  }

  // Obere Kante der wippenden Trefferfläche in Weltkoordinaten (px)
  savePodY(frame = this.savePodFrame) { return SAVE_POD.y + SAVE_POD.bob[Math.max(0, frame)]; }

  // earthMC.savePodMC.hitTest(atvMC._x, atvMC._y, true): Mittelpunkt des Pods in der 73 x 98 px großen Bitmap-Form
  savePodHit() {
    if (this.savePodFrame < 0) return false;
    const p = this.pod, cy = this.savePodY();
    return p.x >= SAVE_POD.x && p.x <= SAVE_POD.x + SAVE_POD.w &&
      p.y >= cy + SAVE_POD.top && p.y <= cy + SAVE_POD.bottom;
  }

  // exitSave: zurück ins Spiel
  leaveSave() {
    this.saving = false;
    this.paused = false;
    this.buildingTimer = 0;
  }

  // saveGameOffline: Stand über write(daten) ablegen. Speichern setzt die Punkte zurück (auch im Original),
  // aber nur, wenn das Schreiben geklappt hat.
  save(write) {
    const result = write(this.saveData());
    this.score = 0;
    return result;
  }

  // Die 32 Werte wie myObj.objArray (Score und scoreBillion immer 0)
  saveData() {
    const a = new Array(SAVE_SLOTS).fill(0);
    a[1] = this.cash;
    a[3] = this.lvl;
    a[4] = this.pod.hp;
    a[5] = Math.max(Math.trunc(this.pod.fuel), 1);
    ['hull', 'drill', 'engine', 'fuelTank', 'radiator', 'bay'].forEach((k, i) => { a[6 + i] = this.up[k]; });
    for (let i = 0; i < 10; i++) a[12 + i] = this.bay[i];
    for (let i = 0; i < 7; i++) a[22 + i] = this.items[i] ?? 0;
    a[29] = this.lastTransmission;
    a[30] = this.playTime;
    a[31] = this.totalPlayTime;
    return a;
  }

  // restoreLoadedGameOffline: nach reset() (neue Welt) die gespeicherten Werte übernehmen, jeweils mit int()
  applySave(a) {
    const n = (i) => Math.trunc(Number(a[i])) || 0;
    this.score = n(0);
    this.cash = n(1);
    this.lvl = Math.max(1, n(3));
    this.mineralValueMod = this.lvl;
    this.pod.hp = n(4);
    this.pod.fuel = n(5);
    ['hull', 'drill', 'engine', 'fuelTank', 'radiator', 'bay'].forEach((k, i) => {
      this.up[k] = Math.min(Math.max(n(6 + i), 0), UPGRADES[k].values.length - 1);
    });
    for (let i = 0; i < 10; i++) this.bay[i] = n(12 + i);
    for (let i = 0; i < this.items.length; i++) this.items[i] = n(22 + i);
    this.lastTransmission = n(29);
    this.playTime = n(30);
    this.totalPlayTime = n(31);
  }

  leaveShop() {
    this.paused = false;
    this.buildingTimer = 0;
    this.earthQuakeChance(); // im Original beim Verlassen eines Shops (gameKeyListener -> mainFrame)
  }

  // ---------- Erdbeben (earthQuakeChance / earthQuake / quakeFX) ----------
  // Ab 150.000 Punkten bebt es beim Verlassen eines Shops mit Chance 1:20
  earthQuakeChance() {
    if (this.score > QUAKE.minScore && random(QUAKE.chance) === 0) this.earthQuake(QUAKE.magnitude);
  }

  // Jede Reihe von 11 bis earthHeight-16 verrutscht (bei Stärke 4 immer, random(5 - 4) ist stets 0) um ein
  // Tile nach links oder rechts. Danach steht das Spiel, während quakeFX das Erdreich zittern lässt.
  earthQuake(magnitude) {
    const H = this.world.height;
    for (let y = QUAKE.firstRow; y < H - 15; y++) {
      if (random(5 - magnitude) !== 0) continue;
      this.world.shiftRow(y, random(2) === 0 ? -1 : 1);
    }
    this.quakeAnim = { frame: 0, move: 0, acc: 0.5, offset: 0 };
    this.events.quake?.();
  }

  // quakeFX (sprite1071): Frame 1 Ausschlag += 0.5 und Erdreich um (+Ausschlag, +Ausschlag) px versetzen,
  // Frame 3 zurück, Frame 4: bei 10 px umkehren, bei 0 px zurück nach mainFrame. Zusammen 160 Frames.
  tickQuake() {
    const q = this.quakeAnim;
    q.frame++;
    const phase = (q.frame - 1) % 4;
    if (phase === 0) { q.move += q.acc; q.offset = q.move; }
    else if (phase === 2) q.offset = 0;
    else if (phase === 3) {
      if (!(q.move < 10)) q.acc = -q.acc;
      if (!(q.move > 0)) { this.quakeAnim = null; this.events.quakeDone?.(); }
    }
  }

  // Versatz des Erdreichs in px (für die Darstellung)
  get quakeOffset() { return this.quakeAnim ? this.quakeAnim.offset : 0; }

  // ---------- Shop-Aktionen (liefern eine Meldung zurück) ----------
  buyFuel(amount) {
    const p = this.pod;
    let d = this.fuelCap - p.fuel;
    if (amount !== -1) d = Math.min(d, amount);
    if (Math.trunc(d) === 0 && d > 0) d = 1;
    d = Math.trunc(d);
    if (d === 0) return { ok: false, msg: tr('tankFull') };
    if (this.cash < d) return { ok: false, msg: tr('noCash') };
    this.cash -= d;
    p.fuel = Math.min(p.fuel + d, this.fuelCap);
    if (amount === -1) p.fuel = this.fuelCap;
    return { ok: true, msg: tr('fuelBought', d, p.fuel >= this.fuelCap) };
  }

  repair(amount) {
    const p = this.pod;
    const REPAIR_COST = 15;
    const dif = this.maxHp - p.hp;
    let cost = amount === -1 ? Math.trunc(dif) * REPAIR_COST : Math.min(amount, dif * REPAIR_COST);
    if (Math.trunc(cost) === 0 && cost > 0) cost = 1;
    cost = Math.trunc(cost);
    if (cost <= 0) return { ok: false, msg: tr('noDamage') };
    if (this.cash < cost) return { ok: false, msg: tr('noCash') };
    this.cash -= cost;
    p.hp = amount === -1 ? this.maxHp : Math.min(p.hp + cost / REPAIR_COST, this.maxHp);
    return { ok: true, msg: tr('repaired', cost, p.hp >= this.maxHp) };
  }

  sellAll() {
    let total = 0;
    for (let i = 0; i < 10; i++) {
      total += this.bay[i] * this.mineralPrice(i);
      this.bay[i] = 0;
    }
    if (total === 0) return { ok: false, msg: tr('nothingToSell') };
    this.cash += total;
    return { ok: true, msg: tr('soldAll', total) };
  }

  buyUpgrade(cat, level) {
    const u = UPGRADES[cat];
    if (this.up[cat] === level) return { ok: false, msg: tr('upgradeOwned') };
    if (this.cash < u.prices[level]) return { ok: false, msg: tr('noCash') };
    this.cash -= u.prices[level];
    this.up[cat] = level;
    if (cat === 'hull') this.pod.hp = this.maxHp;
    if (cat === 'fuelTank') this.pod.fuel = this.fuelCap;
    return { ok: true, msg: tr('upgradeBought', upgradeName(cat, level)) };
  }
}

export { random };
