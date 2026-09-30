import { TILE } from './constants.js';
import { random } from './world.js';

// Endkampf im Kern: Mr. Husk (Phase 1, im Original satanP1/sprite1932) und Satan (Phase 2, satanP2/sprite1873).
// Zeiten in Flash-Frames (42 fps) aus den Animationen des Originals. Die Trefferzonen sind im Original
// Kollisionsgrafiken (map, meleeMap, laser, fireballMC, criticalMap, damageMap, extendedMap); hier werden sie
// mit Rechtecken bzw. Abständen nachgebildet, passend zu den 3D-Modellen (P1 ca. 3 Tiles, P2 ca. 4.5 Tiles hoch).

const WALK_SPEED = 4;
const DIR_TIMER = { 1: 80, 2: 15 };          // changeDir: so oft wird geprüft, auf welcher Seite der Pod ist
const TURN_LEN = 11;                          // turnAround-Animation (sprite1885)
const MELEE_LEN = { 1: 56, 2: 114 };          // sprite1915 / sprite1826 -> doneMelee
const RANGED_LEN = { 1: 75, 2: 89 };          // sprite1927 / sprite1849 -> doneRanged
const DIE_LEN = { 1: 142, 2: 369 };           // sprite1931 / sprite1872 -> doneDeath
const WAIT_P1 = 60;                           // "wait" nach Phase 1, dann preBattleP2
const BREAKOUT_LEN = 219;                     // sprite1875 -> doneBreakout (Funkspruch 13)
const X_MIN = -35, X_MAX = 1550;              // Wendepunkte (satan._x)
const CENTER = 75;                            // Körpermitte relativ zu satan._x
const FLOOR_OFFSET = 190;                     // Boden liegt 190 px unter satan._y
export const LOOT_FIRST = 14, LOOT_LAST = 23; // winFrame: mineralCollectCount 13 -> 23, alle 60 Frames eins
export const LOOT_INTERVAL = 60;

// Schaden am Pod (wird mit Kühler und Schwierigkeitsgrad multipliziert) und Rückstoß
const BODY = { 1: { dmg: 25, kickY: 10 }, 2: { dmg: 50, kickY: 15 } };
const MELEE = { 1: { dmg: 100, kickX: 15 }, 2: { dmg: 200, kickX: 20 } };
const RANGED = { 1: { dmg: 50, kickY: 20 }, 2: { dmg: 100, kickY: 20 } };

// Nachgebildete Trefferzonen (Weltpixel, relativ zu Körpermitte und Boden)
const BODY_BOX = { 1: { half: 40, height: 150 }, 2: { half: 70, height: 225 } };
const MELEE_ZONE = { 1: { from: 0, to: 140, height: 170, frames: [20, 36] }, 2: { from: 10, to: 175, height: 150, frames: [40, 64] } };
const LASER = { aim: [6, 34], fire: [34, 69], length: 700, width: 16 };
const FIREBALL_RADIUS = 28;
const BLAST_ZONES = { critical: 10, damage: 70, extended: 170 }; // Zusatzabstand um den Körper

export class Battle {
  constructor(game) {
    this.game = game;
    this.lvl = game.lvl;
    const H = game.world.height;
    this.floorY = (H - 5) * TILE - TILE / 2;  // Oberkante des Kernbodens
    this.phase = 1;
    this.state = 'walk';
    this.frame = 0;
    this.mod = 'walkRight';
    this.x = 1200;                            // satan._x
    this.prevX = this.x;
    this.hp = this.maxHp = this.lvl * 1000;   // difficulty[lvl].satanP1Hp
    this.dirTimer = 0;
    this.count = 0;
    this.damageTimer = 1000;
    this.attackDamageTimer = 1000;
    this.rangedTimer = 1000;
    this.laser = null;
    this.fireball = null;
    this.active = true;                       // Phase 2 wartet nach dem Ausbruch auf den Funkspruch
  }

  get face() { return this.mod === 'walkRight' ? 1 : -1; }
  get cx() { return this.x + CENTER; }
  get damMod() { return this.lvl; }          // satanP1dam / satanP2dam = lvl

  // ---------- Ablauf ----------
  update() {
    this.prevX = this.x;
    if (!this.active) return;
    this.frame++;
    const s = this.state;
    if (s === 'walk') this.walk();
    else if (s === 'turn') { if (this.frame >= TURN_LEN) this.setState('walk'); }
    else if (s === 'melee') this.melee();
    else if (s === 'ranged') this.ranged();
    else if (s === 'die') this.dying();
    else if (s === 'wait') { if (this.frame > WAIT_P1) this.preBattleP2(); }
    else if (s === 'breakout') this.breakout();
    if (this.phase === 2 && this.fireball) this.updateFireball();
  }

  setState(s) {
    this.state = s;
    this.frame = 0;
  }

  walk() {
    this.x += WALK_SPEED * this.face;
    if (++this.dirTimer > DIR_TIMER[this.phase]) this.changeDir();
    if (this.x < X_MIN) { if (this.mod === 'walkLeft') this.turn('walkRight'); }
    else if (this.x > X_MAX) { if (this.mod === 'walkRight') this.turn('walkLeft'); }
    else if (++this.count === 120) {
      this.count = random(40);
      if (random(2) === 0) this.startMelee(); else this.startRanged();
    }
    this.collisionCheck();
    if (this.phase === 2) this.collisionCheckRanged();
  }

  changeDir() {
    this.dirTimer = 0;
    const podRight = this.game.pod.x > this.cx;
    if (podRight && this.mod !== 'walkRight') this.turn('walkRight');
    else if (!podRight && this.mod !== 'walkLeft') this.turn('walkLeft');
  }

  turn(mod) {
    this.mod = mod;
    this.setState('turn');
    this.game.events.bossTurn?.();
  }

  startMelee() {
    this.attackDamageTimer = 1000;
    this.setState('melee');
  }

  startRanged() {
    this.attackDamageTimer = 1000;
    this.setState('ranged');
    if (this.phase === 1) {
      // sprite1927 Frame 6: Zielrichtung zufällig, der Strahl schwenkt danach um 4 Grad pro Frame
      this.laser = { angle: random(180) - 135, dir: (random(2) ? 1 : -1) * 4, on: false, aiming: false };
    }
  }

  melee() {
    this.collisionCheck();
    this.collisionCheckMelee();
    if (this.phase === 2) this.collisionCheckRanged();
    if (this.phase === 2 && this.frame === 58) this.game.events.bossSlam?.(this.cx + this.face * 110, this.floorY);
    if (this.frame >= MELEE_LEN[this.phase]) this.setState('walk');
  }

  ranged() {
    this.collisionCheck();
    if (this.phase === 1) {
      const L = this.laser, f = this.frame;
      L.aiming = f >= LASER.aim[0] && f < LASER.aim[1];
      L.on = f >= LASER.fire[0] && f < LASER.fire[1];
      if (f === LASER.fire[0]) this.game.events.bossLaser?.();
      if (L.on && f > LASER.fire[0]) L.angle += L.dir;
      this.collisionCheckRanged();
      if (f >= RANGED_LEN[1]) { this.laser = null; this.setState('walk'); }
    } else {
      if (this.frame === 34) this.game.events.bossFireballCharge?.();
      if (this.frame === 39) this.spawnFireball();
      this.collisionCheckRanged();
      if (this.frame >= RANGED_LEN[2]) this.setState('walk');
    }
  }

  // ---------- Treffer am Pod ----------
  hurtPod(amount) {
    this.game.events.bossHitPod?.();
    this.game.damage(amount * this.game.cooling * this.damMod); // radMod * damMod
  }

  inBody(extra = 0) {
    const p = this.game.pod, b = BODY_BOX[this.phase];
    return Math.abs(p.x - this.cx) < b.half + extra && p.y > this.floorY - b.height - extra && p.y < this.floorY + extra;
  }

  collisionCheck() {
    if (++this.damageTimer > 15 && this.inBody()) {
      this.damageTimer = 0;
      this.hurtPod(BODY[this.phase].dmg);
      this.game.pod.yVel += BODY[this.phase].kickY;
    }
  }

  collisionCheckMelee() {
    if (!(++this.attackDamageTimer > 10)) return;
    const z = MELEE_ZONE[this.phase], p = this.game.pod;
    if (this.frame < z.frames[0] || this.frame > z.frames[1]) return;
    const d = (p.x - this.cx) * this.face;
    if (d < z.from || d > z.to || p.y < this.floorY - z.height || p.y > this.floorY) return;
    this.attackDamageTimer = 0;
    this.hurtPod(MELEE[this.phase].dmg);
    // P1: nach oben geschleudert; P2: vor Frame 42 hoch, danach nach unten geschmettert
    p.yVel += this.phase === 1 ? -10 : (this.frame > 42 ? 20 : -20);
    p.xVel += MELEE[this.phase].kickX * this.face;
  }

  laserSegment() {
    const L = this.laser, a = L.angle * Math.PI / 180;
    const ox = this.cx + this.face * 8, oy = this.floorY - 132;   // Laser-Monokel
    return { ox, oy, dx: Math.cos(a) * this.face, dy: Math.sin(a) };
  }

  collisionCheckRanged() {
    const p = this.game.pod;
    if (this.phase === 1) {
      if (!(++this.attackDamageTimer > 10) || !this.laser?.on) return;
      const { ox, oy, dx, dy } = this.laserSegment();
      const t = Math.max(0, Math.min(LASER.length, (p.x - ox) * dx + (p.y - oy) * dy));
      if (Math.hypot(ox + dx * t - p.x, oy + dy * t - p.y) > LASER.width) return;
      this.attackDamageTimer = 0;
      this.hurtPod(RANGED[1].dmg);
      p.yVel += RANGED[1].kickY;
    } else {
      if (!(++this.rangedTimer > 10) || !this.fireball) return;
      const f = this.fireball;
      if (Math.hypot(f.x - p.x, f.y - p.y) > FIREBALL_RADIUS * f.scale / 100 + 15) return;
      this.rangedTimer = 0;
      this.hurtPod(RANGED[2].dmg);
      p.yVel += RANGED[2].kickY;
    }
  }

  // Feuerball aus dem Kessel (sprite1952): springt, prallt am Boden ab, schrumpft nach 120 Frames
  spawnFireball() {
    const xAdj = this.mod === 'walkRight' ? 25 : 0;
    this.fireball = {
      x: this.x + 60 + xAdj, y: this.floorY - FLOOR_OFFSET + 85, scale: 10, count: 0, rot: 0,
      yVel: -17, xVel: this.mod === 'walkLeft' ? -random(4) - 4 : random(4) + 4,
    };
    this.game.events.bossFireball?.();
  }

  updateFireball() {
    const f = this.fireball;
    f.yVel += 1;
    f.x += f.xVel;
    f.y += f.yVel;
    if (f.y > this.floorY - 10 && f.yVel > 0) f.yVel *= -0.9;
    f.rot += f.xVel / 2;
    if (++f.count > 120) {
      f.scale -= 5;
      if (f.scale < 5) this.fireball = null;
    } else if (f.scale < 100) f.scale += 20;
  }

  // ---------- Treffer am Boss (Dynamit und C4, beim Zünden) ----------
  attackDynamite() {
    if (!this.hittable()) return;
    if (this.inBody(BLAST_ZONES.critical)) this.damage(120);
    else if (this.inBody(BLAST_ZONES.damage)) this.damage(60);
  }

  attackC4() {
    if (!this.hittable()) return;
    if (this.inBody(BLAST_ZONES.critical)) this.damage(240);
    else if (this.inBody(BLAST_ZONES.damage)) this.damage(120);
    else if (this.inBody(BLAST_ZONES.extended)) this.damage(60);
  }

  hittable() { return this.active && !['die', 'wait', 'breakout'].includes(this.state); }

  damage(n) {
    this.hp -= Math.trunc(n);
    this.game.events.bossDamaged?.(n);
    if (this.hp <= 0) {
      this.hp = 0;
      this.laser = null;
      this.setState('die');
      this.game.events.bossDying?.(this.phase);
      this.game.events.bossQuake?.(this.phase === 1 ? 10 : 4);
    }
  }

  dying() {
    // P1 (sprite1931) bebt alle 10 Frames bis Frame 99; P2 (sprite1872) bei 0, 67, 237 und Blitz bei 299
    const f = this.frame;
    if (this.phase === 1 ? f % 10 === 0 && f <= 99 : [0, 67, 237].includes(f)) this.game.events.bossQuake?.(this.phase === 1 ? 10 : 4);
    if (this.phase === 2 && f === 299) this.game.events.bossFlash?.();
    if (f < DIE_LEN[this.phase]) return;
    if (this.phase === 1) this.setState('wait');
    else { this.active = false; this.game.winBattle(); }
  }

  // Phase 2: Satan erscheint etwas weiter rechts und bricht aus dem Boden aus
  preBattleP2() {
    this.phase = 2;
    this.x += 140;
    this.hp = this.maxHp = this.lvl * 2000;   // difficulty[lvl].satanP2Hp
    this.mod = 'walkRight';
    this.damageTimer = this.attackDamageTimer = this.rangedTimer = 1000;
    this.count = this.dirTimer = 0;
    this.setState('breakout');
    this.game.events.bossPhase2?.();
  }

  breakout() {
    const f = this.frame;
    if (f === 0 || (f >= 139 && f <= 169 && (f - 139) % 10 === 0)) this.game.events.bossQuake?.(10);
    if (f < BREAKOUT_LEN) return;
    // doneBreakout: Funkspruch 13, danach geht es los (startBattleP2)
    this.active = false;
    this.setState('walk');
    this.game.bossBrokeOut();
  }

  startP2() { this.active = true; this.mod = 'walkRight'; this.setState('walk'); }
}
