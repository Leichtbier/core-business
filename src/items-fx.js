import * as THREE from 'three';
import { TILE, ITEM } from './constants.js';
import { smokeTexture, glowTexture } from './textures.js';

// Darstellung der Items (Modelle aus assets/items.glb). Die Spiellogik steckt in sim.js; hier wird nur
// gezeigt, was dort passiert. Items mit Spielpause (Sprengstoff, Teleporter) laufen im Takt von
// game.itemAnim.frame, die anderen (Reservetank, Nanobots) in Echtzeit, während weitergespielt wird.

const U = 1 / TILE;
const FPS = 42;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const backOut = (x) => { x = clamp01(x); const c = 1.7; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };
const rand = (n) => Math.floor(Math.random() * n); // AS2 random(n)

// Explosionen wie in itemDynamiteMC/itemC4MC: count läuft von 10 bis explosions, jede Explosion liegt
// zufällig um (-1|0|1) * count * dispersal * (0.5..1) px neben dem Pod. Hier beginnt das Feuerwerk erst
// nach der Zündphase (fuse) und wird auf die restlichen Frames verteilt; Dauer und Wirkung bleiben gleich.
const BLAST = {
  [ITEM.DYNAMITE]: { model: 'Item_Dynamite', scale: 2, fuse: 11, explosions: 40, dispersal: 2, size: 0.55, shake: 0.12 },
  [ITEM.C4]: { model: 'Item_C4', scale: 2, fuse: 17, explosions: 100, dispersal: 1.5, size: 0.7, shake: 0.25 },
};

export class ItemFX {
  constructor(renderer) {
    this.r = renderer;
    this.protos = {};
    this.effects = [];
    this.sprites = [];
    this.smokeTex = smokeTexture();
    this.glowTex = glowTexture();
    this.shake = 0;
    // ein gemeinsames Licht für Blitze und Leuchten der Items
    this.light = new THREE.PointLight(0xffffff, 0, 6, 1.5);
    this.r.scene.add(this.light);
    // Schnittebene für den Materietransmitter: behält nur, was unterhalb von constant liegt
    this.clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6);
    this.r.renderer.localClippingEnabled = true;
    // Scanring des Materietransmitters (einmal angelegt, damit sein Shader nur einmal übersetzt wird)
    this.scanMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.5, 1.6, 2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
  }

  // Objekte, die im Ladebildschirm kurz in die Szene kommen, damit ihre Shader vorab übersetzt werden
  // (sonst ruckelt der erste Einsatz eines Items)
  warmupObjects() {
    const list = Object.values(this.protos).map((o) => o.clone());
    list.push(new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), this.scanMat));
    for (const [tex, blending] of [[this.glowTex, THREE.AdditiveBlending], [this.smokeTex, THREE.NormalBlending]]) {
      list.push(new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, blending, transparent: true, depthWrite: false, fog: false, toneMapped: false,
      })));
    }
    return list;
  }

  apply(gltf) {
    for (const o of gltf.scene.children) {
      o.traverse((m) => {
        if (!m.isMesh) return;
        m.material.metalness = Math.min(m.material.metalness, 0.45); // ohne Umgebung wirkt Metall schwarz
        if (m.material.transparent) m.material.depthWrite = false;
      });
      this.protos[o.name] = o;
    }
  }

  // Schnittebene an die Materialien des Pods hängen (vor dem Vorübersetzen der Shader aufrufen)
  attachClip() {
    this.r.pod.yaw.traverse((o) => { if (o.isMesh) o.material.clippingPlanes = [this.clip]; });
  }

  make(name, scale) {
    const o = this.protos[name].clone();
    o.scale.setScalar(scale);
    this.r.putOnPodLayer(o);
    return o;
  }

  static material(obj, name) {
    let found = null;
    obj.traverse((o) => { if (o.isMesh && o.material.name === name) found = o.material; });
    return found;
  }

  // ---------- Leuchtende Sprites (Feuerbälle, Rauch, Funken, Wirbel) ----------
  sprite(opts) {
    let s = this.sprites.find((x) => !x.visible);
    if (!s) {
      if (this.sprites.length > 260) return null;
      s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, fog: false, toneMapped: false }));
      s.layers.set(this.r.podLayer);
      this.r.scene.add(s);
      this.sprites.push(s);
    }
    const additive = opts.additive !== false;
    s.material.map = opts.tex || (additive ? this.glowTex : this.smokeTex);
    s.material.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    s.material.rotation = Math.random() * Math.PI * 2;
    s.position.copy(opts.pos);
    s.userData = { age: -(opts.delay || 0), ...opts };
    s.visible = true;
    s.scale.set(0.001, 0.001, 1);
    return s;
  }

  updateSprites(dt) {
    for (const s of this.sprites) {
      if (!s.visible) continue;
      const u = s.userData;
      u.age += dt;
      if (u.age < 0) continue;
      const t = u.age / u.life;
      if (t >= 1) {
        s.visible = false;
        if (u.then) u.then(s.position);
        continue;
      }
      if (u.vel) s.position.addScaledVector(u.vel, dt);
      if (u.rise) s.position.y += u.rise * dt;
      if (u.orbit) {
        const o = u.orbit, a = o.a0 + o.w * u.age, rr = o.r0 * (1 - t * o.shrink);
        s.position.set(o.c.x + Math.cos(a) * rr, o.c.y + Math.sin(a) * rr * o.squash, o.c.z);
      }
      const size = u.size * (u.grow ? 0.35 + 0.65 * Math.sqrt(t) : 1 - 0.5 * t);
      s.scale.set(size, size, 1);
      s.material.rotation += (u.spin || 0) * dt;
      if (u.fire) {
        // Feuerball (deckend): gelb -> orange -> dunkelrot, zum Ende durchscheinend
        const c = s.material.color;
        c.setRGB(1 - 0.5 * t, Math.max(0.1, 0.72 - 1.3 * t), Math.max(0.03, 0.3 - 1.2 * t));
        s.material.opacity = 0.95 * Math.pow(1 - t, 0.8);
      } else {
        s.material.color.copy(u.color);
        s.material.opacity = (u.alpha ?? 1) * Math.min(1, t * 5) * Math.pow(1 - t, 1.2);
      }
    }
  }

  fireball(cx, cy, dxPx, dyPx, size, delay = 0) {
    const pos = new THREE.Vector3(cx + dxPx * U, cy - dyPx * U, 0.45 + Math.random() * 0.2);
    const s = size * (1 + Math.random());   // _xscale = random(100) + 100
    // heller Kern (additiv) über einem deckenden Feuerball, danach Rauch
    this.sprite({ pos: pos.clone().setZ(pos.z + 0.01), color: new THREE.Color(0.9, 0.55, 0.2), size: s * 0.55, life: 0.2, delay });
    this.sprite({
      pos, fire: true, additive: false, size: s, grow: true, life: 0.45 + Math.random() * 0.2, spin: (Math.random() - 0.5) * 2, delay,
      tex: this.smokeTex,
      then: (p) => this.sprite({
        pos: p.clone(), additive: false, color: new THREE.Color(0x2a2522), alpha: 0.75, size: s * 1.3, grow: true,
        life: 1.2 + Math.random() * 0.8, rise: 0.35, spin: (Math.random() - 0.5) * 0.6,
      }),
    });
  }

  // ---------- Pod-Explosion: Feuerball, Druckwelle, der Pod zerbricht in seine Einzelteile ----------
  // Die Trümmer sind die echten Teile aus pod.glb (Rumpf, Kuppel, Räder, Bohrer ...). Sie fliegen mit Drall
  // auseinander, prallen am Erdreich ab (gleiche Kollision wie der Pod), größere Teile brennen eine Weile.
  podExplosion(game) {
    const pod = this.r.pod, world = game.world;
    // Position aus der Simulation (die Darstellung kann hinterherhängen)
    pod.root.position.x = game.pod.x * U;
    pod.root.position.y = -game.pod.y * U;
    pod.root.updateMatrixWorld(true);
    const center = new THREE.Box3().setFromObject(pod.model).getCenter(new THREE.Vector3());
    const shownIn = (o) => { for (let n = o; n && n !== pod.model; n = n.parent) if (!n.visible) return false; return true; };
    const parts = [];
    pod.model.traverse((o) => {
      if (!o.isMesh || !shownIn(o)) return;
      const m = new THREE.Mesh(o.geometry, o.material);
      o.matrixWorld.decompose(m.position, m.quaternion, m.scale);
      m.layers.set(this.r.podLayer);
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      const size = o.geometry.boundingSphere.radius * m.scale.x;
      const out = m.position.clone().sub(center);
      out.z *= 0.3;
      if (out.lengthSq() < 1e-4) out.set(Math.random() - 0.5, 0.5, 0);
      out.normalize();
      const speed = (2.2 + Math.random() * 2.5) / Math.max(0.6, Math.sqrt(size * 8));
      const v = out.multiplyScalar(speed);
      v.y += 1.5 + Math.random() * 2.5;
      v.z = (Math.random() - 0.3) * 0.6;
      const w = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(18);
      const burn = size > 0.06 && Math.random() < 0.6 ? 1.2 + Math.random() * 1.5 : 0;
      parts.push({ m, v, w, burn, life: 2.6 + Math.random() * 1.4, base: m.scale.clone(), smokeT: 0 });
      this.r.scene.add(m);
    });

    // Feuerball aus vielen versetzten Explosionen, Druckwelle, Blitz, Beben
    this.shake = 0.35;
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 26 * (0.4 + i / 26);
      this.fireball(center.x, center.y, Math.cos(a) * r, Math.sin(a) * r, 0.55 + Math.random() * 0.35, i * 0.014);
    }
    this.sprite({ pos: center.clone().setZ(0.7), color: new THREE.Color(1.3, 0.85, 0.45), size: 3.4, grow: true, life: 0.32 });
    this.sprite({ pos: center.clone().setZ(0.72), color: new THREE.Color(1.6, 1.5, 1.3), size: 1.4, life: 0.12 });

    const g = 7, spin = new THREE.Quaternion(), e = new THREE.Euler();
    let t = 0, smokeT = 0;
    const cleanup = () => { for (const p of parts) this.r.scene.remove(p.m); };
    this.effects.push({
      update: (dt) => {
        if (dt > 0.5) { cleanup(); return false; } // Neustart: sofort aufräumen
        t += dt;
        this.flash(0xff9a40, 55 * Math.max(0, 1 - t / 0.5) ** 2 + 3 * Math.max(0, 1 - t / 3), center, 0, 0.3);
        // Rauchsäule über der Unglücksstelle
        if ((smokeT -= dt) <= 0 && t < 3) {
          smokeT = 0.07;
          this.sprite({
            pos: center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0, 0.5)), additive: false,
            color: new THREE.Color(0x1e1a18), alpha: 0.8, size: 0.7 + Math.random() * 0.5, grow: true,
            life: 1.6 + Math.random(), rise: 0.8, spin: (Math.random() - 0.5) * 0.8,
          });
        }
        for (const p of parts) {
          if (!p.m.parent) continue;
          const pos = p.m.position;
          p.v.y -= g * dt;
          p.v.multiplyScalar(1 - 0.25 * dt);
          const nx = pos.x + p.v.x * dt, ny = pos.y + p.v.y * dt;
          // Aufprall am Erdreich: abprallen, Drall verlieren
          if (world.hit(nx * TILE, -pos.y * TILE)) { p.v.x *= -0.35; p.w.multiplyScalar(0.7); } else pos.x = nx;
          if (world.hit(pos.x * TILE, -ny * TILE)) {
            p.v.y *= p.v.y < 0 ? -0.3 : -0.2;
            p.v.x *= 0.6;
            p.w.multiplyScalar(0.5);
            if (Math.abs(p.v.y) < 0.4) p.v.y = 0;
          } else pos.y = ny;
          pos.z = Math.min(0.75, Math.max(-0.35, pos.z + p.v.z * dt));
          p.m.quaternion.multiply(spin.setFromEuler(e.set(p.w.x * dt, p.w.y * dt, p.w.z * dt)));
          // brennende Trümmer ziehen Feuer und Rauch hinter sich her
          if (t < p.burn && (p.smokeT -= dt) <= 0) {
            p.smokeT = 0.045;
            const q = pos.clone();
            q.z += 0.05;
            this.sprite({ pos: q, fire: true, additive: false, tex: this.smokeTex, size: 0.18 + Math.random() * 0.12, grow: true, life: 0.3 });
            if (Math.random() < 0.5) {
              this.sprite({ pos: q.clone(), additive: false, color: new THREE.Color(0x24201e), alpha: 0.6, size: 0.25, grow: true, life: 0.9, rise: 0.4 });
            }
          }
          // am Ende schrumpfen und verschwinden
          const k = 1 - Math.max(0, Math.min(1, (t - p.life) / 0.4));
          p.m.scale.copy(p.base).multiplyScalar(k);
          if (k <= 0) this.r.scene.remove(p.m);
        }
        if (t < 4.6) return true;
        cleanup();
        return false;
      },
    });
  }

  // ---------- Start eines Items (Ereignis itemUsed aus sim.js) ----------
  start(id, game) {
    const pod = this.r.pod;
    if (id === ITEM.FUEL) this.effects.push(this.fuelFX());
    else if (id === ITEM.NANOBOTS) this.effects.push(this.nanoFX());
    else if (BLAST[id]) this.effects.push(this.blastFX(id, game));
    else if (id === ITEM.QUANTUM) this.effects.push(this.quantumFX(game));
    else if (id === ITEM.MATTER) this.effects.push(this.matterFX(game));
    pod.root.updateMatrixWorld(true);
  }

  // Ereignis teleport: der Pod ist versetzt worden, die Kamera springt mit
  teleported() {
    this.r.snapNext = true;
    for (const e of this.effects) e.arrived?.();
  }

  // ---------- Reservetank: Flasche schwebt über dem Pod, dockt an und entleert sich ----------
  fuelFX() {
    const root = this.r.pod.root, obj = this.make('Item_Fuel', 1.4);
    const glow = ItemFX.material(obj, 'FuelGlow'), base = glow.emissiveIntensity;
    root.add(obj);
    let t = 0;
    return {
      update: (dt) => {
        t += dt;
        const pop = backOut(t / 0.2), sink = smooth((t - 0.25) / 0.45), gone = smooth((t - 0.8) / 0.25);
        obj.scale.setScalar(1.4 * pop * (1 - gone));
        obj.position.set(0, 0.85 - 0.45 * sink - 0.15 * gone, 0.12);
        obj.rotation.set(0, t * 5 * (1 - sink) + 0.5, 0.25 * Math.sin(t * 9) * (1 - sink));
        glow.emissiveIntensity = base * (1 + 2 * sink * (0.5 + 0.5 * Math.sin(t * 30)));
        this.flash(0xffa030, 3 * sink * (1 - gone), root.position, 0, 0.3);
        if (t < 1.1) return true;
        root.remove(obj);
        glow.emissiveIntensity = base;
        return false;
      },
    };
  }

  // ---------- Nanobots: Kapsel öffnet sich, ein Schwarm krabbelt um den Rumpf ----------
  nanoFX() {
    const root = this.r.pod.root, cap = this.make('Item_Nanobots', 1.3);
    root.add(cap);
    const bots = [];
    for (let i = 0; i < 14; i++) {
      const b = this.make('Nanobot', 0.085);
      b.visible = false;
      root.add(b);
      bots.push({ b, a0: (i / 14) * Math.PI * 2, w: 2.2 + Math.random() * 1.5, dir: i % 2 ? 1 : -1, delay: 0.3 + i * 0.03 });
    }
    let t = 0, sparkT = 0;
    return {
      update: (dt) => {
        t += dt;
        const pop = backOut(t / 0.2), out = smooth((t - 0.35) / 0.25);
        cap.scale.setScalar(1.3 * pop * (1 - out));
        cap.position.set(0, 0.75 + 0.1 * out, 0.12);
        cap.rotation.y = t * 4;
        const end = smooth((t - 1.8) / 0.35);
        for (const k of bots) {
          const u = t - k.delay;
          k.b.visible = u > 0 && end < 1;
          if (!k.b.visible) continue;
          // aus der Kapsel herausfliegen, dann dicht um den Rumpf kreisen
          const reach = smooth(u / 0.3), a = k.a0 + k.dir * k.w * u;
          const x = Math.cos(a) * 0.36, y = -0.08 + Math.sin(a) * 0.22, z = 0.3 + 0.08 * Math.sin(a * 2);
          k.b.position.set(x * reach, 0.75 + (y - 0.75) * reach, 0.12 + (z - 0.12) * reach);
          k.b.rotation.set(0, 0, a + k.dir * Math.PI / 2);
          k.b.scale.setScalar(0.085 * (1 - end));
        }
        sparkT -= dt;
        if (t > 0.5 && t < 1.9 && sparkT <= 0) {
          sparkT = 0.04;
          const k = bots[rand(bots.length)];
          const p = k.b.getWorldPosition(new THREE.Vector3());
          this.sprite({ pos: p, color: new THREE.Color(0.4, 1.1, 1.4), size: 0.12, life: 0.25 });
        }
        this.flash(0x50d8ff, 2.5 * smooth((t - 0.3) / 0.3) * (1 - end), root.position, 0, 0.2);
        if (t < 2.2) return true;
        root.remove(cap);
        for (const k of bots) root.remove(k.b);
        return false;
      },
    };
  }

  // ---------- Dynamit / C4: ablegen, Zündphase, dann das Feuerwerk ----------
  blastFX(id, game) {
    const cfg = BLAST[id], p = game.pod, pod = this.r.pod;
    const obj = this.make(cfg.model, cfg.scale);
    const dir = p.facing === 'left' || p.facing === 'turning_right' ? -1 : 1;
    // Position aus der Simulation (die Darstellung kann einen Frame hinterherhängen)
    const cx = p.x * U, cy = -p.y * U;
    const ground = cy + pod.yaw.position.y - 0.4 * this.r.podScale;
    const x0 = cx + dir * 0.5;
    this.r.scene.add(obj);
    const spark = obj.getObjectByName('Dynamite_Spark');
    const led = ItemFX.material(obj, 'BlinkRed'), sparkMat = ItemFX.material(obj, 'FuseSpark');
    const ledBase = led?.emissiveIntensity ?? 0, sparkBase = sparkMat?.emissiveIntensity ?? 0;
    let lastFrame = 0, count = 10, done = false, tail = 0;
    const len = game.itemAnim.len;
    const perFrame = (cfg.explosions - 10) / (len - cfg.fuse);
    return {
      update: (dt, a, alpha) => {
        const f = a ? a.frame + alpha : len;
        // Ablegen: kleiner Wurf vom Pod nach vorne auf den Boden
        const drop = clamp01(f / 5);
        obj.position.set(cx + (x0 - cx) * drop, ground + 0.25 * Math.sin(drop * Math.PI) + (1 - drop) * 0.1, 0.32);
        obj.visible = f < cfg.fuse;
        if (spark) spark.scale.setScalar(0.7 + Math.random() * 0.8);
        if (sparkMat) sparkMat.emissiveIntensity = sparkBase * (0.5 + Math.random());
        if (led) led.emissiveIntensity = Math.sin(f * f * 0.08) > 0 ? ledBase : 0; // piept immer schneller
        if (f < cfg.fuse) {
          const tip = spark ? spark.getWorldPosition(new THREE.Vector3()) : obj.position;
          this.flash(led ? 0xff2010 : 0xffa040, led ? 1.2 : 2 + Math.random() * 2, tip, 0, 0);
          if (spark && Math.random() < 0.6) {
            this.sprite({ pos: tip.clone(), color: new THREE.Color(1.5, 1.0, 0.4), size: 0.05, life: 0.3,
              vel: new THREE.Vector3((Math.random() - 0.5) * 1.2, Math.random() * 1.2, 0.2) });
          }
        }
        // pro Simulations-Frame die fälligen Explosionen auslösen
        const whole = a ? a.frame : len;
        for (; lastFrame < whole; lastFrame++) {
          if (lastFrame + 1 < cfg.fuse) continue;
          if (lastFrame + 1 === cfg.fuse) {
            this.onBlast?.(id); // Explosionsgeräusch (main.js)
            this.shake = cfg.shake;
            this.flash(0xffc070, 45, new THREE.Vector3(x0, cy, 0.8), 0, 0);
          }
          let n = Math.floor(perFrame * (lastFrame + 2 - cfg.fuse)) - Math.floor(perFrame * (lastFrame + 1 - cfg.fuse));
          for (; n > 0 && count < cfg.explosions; n--, count++) {
            const k = count * cfg.dispersal;
            this.fireball(cx, cy, (rand(3) - 1) * k * (rand(50) + 50) / 100, (rand(3) - 1) * k * (rand(50) + 50) / 100, cfg.size);
          }
          this.shake = Math.max(this.shake, cfg.shake * 0.5);
        }
        if (f >= cfg.fuse) this.flash(0xff8a30, 18 * (1 - (f - cfg.fuse) / (len - cfg.fuse)) + 4, new THREE.Vector3(cx, cy, 1), 0, 0);
        if (!a && !done) done = true;
        if (done) {
          tail += dt;
          this.flash(0xff7020, 6 * (1 - tail / 0.4), new THREE.Vector3(cx, cy, 1), 0, 0);
          if (tail > 0.4) {
            this.r.scene.remove(obj);
            if (led) led.emissiveIntensity = ledBase;
            if (sparkMat) sparkMat.emissiveIntensity = sparkBase;
            return false;
          }
        }
        return true;
      },
    };
  }

  // ---------- Quantenteleporter: instabil, der Pod flackert, verzerrt sich und wird davongeschleudert ----------
  quantumFX(game) {
    const pod = this.r.pod, dev = this.make('Item_Quantum', 1.6);
    pod.root.add(dev);
    const rings = [0, 1, 2].map((i) => dev.getObjectByName('Quantum_Ring' + i));
    const core = dev.getObjectByName('QuantumCore');
    const spin = rings.map(() => new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1));
    const len = game.itemAnim.len, reloc = 43;
    let tail = 0, swirl = 0;
    return {
      arrived: () => { this.flash(0xd070ff, 50, pod.root.position, 0, 0); },
      update: (dt, a, alpha) => {
        const f = a ? a.frame + alpha : len + tail * FPS;
        const before = f < reloc;
        // Gerät: taucht über dem Pod auf, bricht vor dem Sprung zusammen, am Ziel wieder da
        const s = before ? backOut(f / 7) * (1 - smooth((f - 36) / 6)) : smooth((f - 55) / 10) * (1 - smooth(tail / 0.35));
        dev.scale.setScalar(1.6 * s);
        dev.visible = s > 0.01;
        dev.position.set(0, 0.18 + 0.03 * Math.sin(f * 0.9), 0.05);
        const wild = before ? 0.15 + f / 30 : 0.6;
        rings.forEach((r, i) => {
          r.rotation.x += spin[i].x * wild * dt * 8;
          r.rotation.y += spin[i].y * wild * dt * 8;
          r.rotation.z += spin[i].z * wild * dt * 8;
        });
        if (core) core.scale.setScalar(1 + 0.25 * Math.sin(f * 2.3) + (Math.random() - 0.5) * 0.3 * wild);
        // Pod: vor dem Sprung immer stärker flackern und in die Länge ziehen, am Ziel umgekehrt
        const warp = before ? smooth((f - 10) / 30) : 1 - smooth((f - 70) / 19);
        const y = pod.yaw;
        pod.model.visible = warp < 0.97 && Math.random() > warp * 0.7;
        y.scale.set(y.scale.x * (1 - 0.8 * warp), y.scale.y * (1 + 1.2 * warp), y.scale.z * (1 - 0.5 * warp));
        y.position.x = (Math.random() - 0.5) * 0.08 * warp;
        // violette Energiewirbel
        swirl -= dt;
        if (swirl <= 0 && f < len) {
          swirl = 0.02;
          const c = pod.root.position.clone();
          c.z = 0.5;
          this.sprite({
            pos: c, color: new THREE.Color(1.2, 0.45, 1.6), size: 0.1 + Math.random() * 0.12, life: 0.6,
            orbit: { c, a0: Math.random() * 6.3, w: (before ? 7 : -7) * (0.6 + Math.random()), r0: 0.25 + Math.random() * 0.45, shrink: before ? 0.9 : -0.3, squash: 0.8 },
          });
        }
        this.flash(0xc060ff, 3 + 4 * warp + (Math.random() - 0.5) * 3, pod.root.position, 0, 0.3);
        if (a) return true;
        tail += dt;
        if (tail < 0.4) return true;
        pod.root.remove(dev);
        return false;
      },
    };
  }

  // ---------- Materietransmitter: sauberer Scan, der Pod wird Zeile für Zeile ab- und wieder aufgebaut ----------
  matterFX(game) {
    const pod = this.r.pod, dev = this.make('Item_Matter', 1.6);
    pod.root.add(dev);
    const rings = [0, 1].map((i) => dev.getObjectByName('Matter_Ring' + i));
    // zwei große Scanringe um den Pod (Kopien des Gerätrings, selbstleuchtend)
    const scanMat = this.scanMat;
    const scans = [0, 1].map(() => {
      const r = rings[0].clone();
      r.traverse((o) => { if (o.isMesh) o.material = scanMat; });
      r.scale.setScalar(5);
      r.rotation.set(0, 0, 0);
      pod.root.add(r);
      this.r.putOnPodLayer(r);
      return r;
    });
    const len = game.itemAnim.len, reloc = 48;
    const top = 0.25, bottom = -0.42; // Bereich des Pods relativ zur Mitte
    let tail = 0;
    return {
      arrived: () => { this.flash(0x60d0ff, 40, pod.root.position, 0, 0); },
      update: (dt, a, alpha) => {
        const f = a ? a.frame + alpha : len + tail * FPS;
        const before = f < reloc;
        const s = before ? backOut(f / 8) * (1 - smooth((f - 42) / 5)) : smooth((f - 60) / 8) * (1 - smooth(tail / 0.35));
        dev.scale.setScalar(1.6 * s);
        dev.visible = s > 0.01;
        dev.position.set(0, 0.2, 0.05);
        rings.forEach((r, i) => { r.rotation.y += (i ? -3 : 3) * dt; });
        // Scan: vor dem Sprung von oben nach unten (Pod verschwindet), am Ziel von unten nach oben
        const k = before ? smooth((f - 10) / 30) : smooth((f - 72) / 30);
        const cut = before ? top + (bottom - top) * k : bottom + (top - bottom) * k;
        const scanning = before ? f > 8 && f < 42 : f > 70 && f < len;
        scans.forEach((r, i) => {
          r.visible = scanning;
          r.position.set(0, cut + (i ? 0.035 : -0.035), 0.05);
        });
        scanMat.opacity = 0.8 + 0.2 * Math.sin(f * 1.3);
        const pr = pod.root.position.y;
        this.clip.constant = scanning || (before ? f >= 42 : f < 72) ? pr + cut : 1e6;
        pod.model.visible = before ? f < 42 : f > 71;
        if (scanning && Math.random() < 0.7) {
          const p = new THREE.Vector3(pod.root.position.x + (Math.random() - 0.5) * 0.7, pr + cut, 0.4);
          this.sprite({ pos: p, color: new THREE.Color(0.4, 1.2, 1.8), size: 0.07, life: 0.4, rise: before ? -0.2 : 0.2 });
        }
        this.flash(0x60d0ff, scanning ? 4 : 1.5 * s, pod.root.position, 0, 0.3);
        if (a) return true;
        tail += dt;
        if (tail < 0.4) return true;
        this.clip.constant = 1e6;
        pod.root.remove(dev);
        for (const r of scans) pod.root.remove(r);
        return false;
      },
    };
  }

  // Licht des Effekts setzen (das stärkste Anliegen pro Bild gewinnt)
  flash(color, intensity, pos, dx, dy) {
    if (intensity <= this.lightWant) return;
    this.lightWant = intensity;
    this.light.color.setHex(color);
    this.light.position.set(pos.x + dx, pos.y + dy, Math.max(pos.z, 0.6));
  }

  // Einmal pro Bild nach updatePod/updateCamera aufrufen
  update(game, alpha, dt) {
    const pod = this.r.pod;
    // Standard: Pod sichtbar, außer er ist zerstört oder die Spiellogik hat ihn versteckt (Teleport);
    // Effekte überschreiben das. Versteckt wird nur das Modell: verschwänden Lichter aus der Szene,
    // müsste three.js alle Shader neu übersetzen und das Spiel hinge kurz.
    pod.model.visible = !game.pod.hidden && game.pod.mod !== 'dead';
    pod.yaw.position.x = 0;
    this.clip.constant = 1e6;
    this.lightWant = 0;
    this.effects = this.effects.filter((e) => e.update(dt, game.itemAnim, alpha));
    this.light.intensity = this.lightWant;
    if (!pod.model.visible) { pod.lamp.intensity = 0; pod.spot.intensity = 0; }
    this.updateSprites(dt);
    // Kamerawackeln bei Explosionen
    if (this.shake > 0.002) {
      this.r.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.r.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.pow(0.02, dt);
    }
  }

  reset() {
    for (const e of this.effects) e.update(10, null, 1); // laufende Effekte sofort beenden
    this.effects = [];
    for (const s of this.sprites) s.visible = false;
    this.clip.constant = 1e6;
    this.shake = 0;
  }
}
