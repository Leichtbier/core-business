import * as THREE from 'three';
import { TILE } from './constants.js';

// Darstellung des Endkampfs: Mr. Husk (Husk_P1) und Satan (Husk_P2) aus assets/husk_boss.glb, bewegt über
// die Gelenk-Empties. Die Spiellogik steckt in src/battle.js; hier wird nur dargestellt, was dort passiert.

const U = 1 / TILE;
const Z = -0.12;                       // etwas hinter der Ebene des Pods
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const GLOW_SCALE = { StaffGlow: 0.3, LaserGlow: 0.3, InfernoGlow: 0.15, EvilEye: 0.2, ChimneyGlow: 0.2 };

export class BossView {
  constructor(renderer) {
    this.r = renderer;
    this.root = new THREE.Group();
    this.root.visible = false;
    renderer.scene.add(this.root);
    // Laser: Zielstrahl (dünn, schwach) und Strahl (dick, hell), jeweils entlang +X mit Länge 1
    const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true).translate(0, 0.5, 0).rotateZ(-Math.PI / 2);
    const beamMat = (opacity) => new THREE.MeshBasicMaterial({
      color: 0xff2a10, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    this.tracer = new THREE.Mesh(beamGeo, beamMat(0.35));
    this.beam = new THREE.Mesh(beamGeo, beamMat(0.9));
    this.beamCore = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
      color: 0xffe0c0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    // Feuerball aus dem Kessel
    this.fire = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshStandardMaterial({
      color: 0xff5a10, emissive: 0xff3a00, emissiveIntensity: 1.1, roughness: 0.6, flatShading: true,
    }));
    for (const m of [this.tracer, this.beam, this.beamCore, this.fire]) this.root.add(m);
    this.hitFlash = 0;
    this.lastPhase = 0;
    // Führungslicht auf den Boss: von Anfang an in der Szene (Stärke 0), sonst würden alle Shader neu übersetzt
    this.key = new THREE.PointLight(0xffc8a0, 0, 12, 1.2);
    this.rim = new THREE.PointLight(0xff4020, 0, 10, 1.4);
    renderer.scene.add(this.key, this.rim);
  }

  apply(gltf) {
    const prep = (name) => {
      const model = gltf.scene.getObjectByName(name).clone(true);
      model.position.set(0, 0, 0);
      const mats = [], glows = [];
      model.traverse((o) => {
        if (!o.isMesh) return;
        o.material = o.material.clone();
        o.material.metalness = Math.min(o.material.metalness, 0.45);
        mats.push({ mat: o.material, emissive: o.material.emissive.clone() });
        if (GLOW_SCALE[o.material.name]) {
          o.material.emissiveIntensity *= GLOW_SCALE[o.material.name];
          glows.push({ mat: o.material, base: o.material.emissiveIntensity });
        }
      });
      const p = name === 'Husk_P1' ? 'P1_' : 'P2_';
      const J = (n) => model.getObjectByName(p + n);
      const joints = {};
      for (const n of ['Hips', 'Torso', 'Head', 'ArmL', 'ArmR', 'ForearmL', 'ForearmR', 'LegL', 'LegR',
        'ShinL', 'ShinR', 'FootL', 'FootR', 'Tail']) joints[n] = J(n);
      const rest = new Map();
      model.traverse((o) => rest.set(o, { rot: o.rotation.clone(), pos: o.position.clone() }));
      const holder = new THREE.Group();
      holder.add(model);
      this.root.add(holder);
      return { holder, model, mats, glows, joints, rest, yaw: 0.75, hipY: J('Hips').position.y };
    };
    this.p1 = prep('Husk_P1');
    this.p2 = prep('Husk_P2');
  }

  // Beim Laden kurz alles zeigen, damit die Shader vorübersetzt werden
  warmup(on) {
    this.root.visible = on;
    for (const v of [this.p1, this.p2]) if (v) v.holder.visible = on;
    for (const m of [this.tracer, this.beam, this.beamCore, this.fire]) m.visible = on;
  }

  damaged() { this.hitFlash = 0.25; }

  update(game, alpha, dt, time) {
    const b = game.battle;
    this.root.visible = !!b && !!this.p1;
    this.key.intensity = this.rim.intensity = 0;
    if (!this.root.visible) return;
    const phase = b.phase, v = phase === 1 ? this.p1 : this.p2;
    this.p1.holder.visible = phase === 1 && b.state !== 'wait';
    this.p2.holder.visible = phase === 2;
    for (const [o, r] of v.rest) { o.rotation.copy(r.rot); o.position.copy(r.pos); }
    const J = v.joints;
    const f = b.frame + (b.active ? alpha : 0);
    const x = (b.prevX + (b.x - b.prevX) * alpha + 75) * U, y = -b.floorY * U;

    // Blickrichtung: schräg zur Kamera in Laufrichtung, beim Wenden durch die Kamera hindurch
    const target = b.face * 0.75;
    if (b.state === 'turn') v.yaw = -target + 2 * target * smooth(f / 11);
    else v.yaw += (target - v.yaw) * 0.3;
    v.holder.rotation.y = v.yaw;
    let sink = 0, shake = 0;

    // Gehen
    const walking = b.state === 'walk' ? 1 : b.state === 'turn' ? 0.3 : 0;
    const w = time * (phase === 1 ? 7.5 : 5.2);
    for (const [s, ph] of [['L', 0], ['R', Math.PI]]) {
      const a = Math.sin(w + ph) * 0.5 * walking;
      J['Leg' + s].rotation.x = a;
      J['Shin' + s].rotation.x = (phase === 2 ? -1 : 1) * Math.max(0, Math.sin(w + ph + 1.2)) * 0.7 * walking;
      J['Foot' + s].rotation.x = -a * 0.5;
      J['Arm' + s].rotation.x = -a * 0.6;
      J['Forearm' + s].rotation.x = -0.2 - Math.max(0, -a) * 0.4;
    }
    J.Hips.position.y = v.hipY + Math.abs(Math.sin(w)) * 0.06 * walking;
    J.Head.rotation.z = Math.sin(time * 1.3) * 0.05;
    if (J.Tail) J.Tail.rotation.z = Math.sin(time * 2.3) * 0.35;

    if (b.state === 'melee') {
      if (phase === 1) {
        // Stab ausholen (0-20), zuschlagen (20-36), zurück
        const up = smooth(f / 20), down = smooth((f - 20) / 10), back = smooth((f - 38) / 16);
        J.ArmR.rotation.x = -2.7 * up + 3.3 * down - 0.6 * back;
        J.Torso.rotation.x = -0.12 * up + 0.3 * down - 0.18 * back;
      } else {
        // beide Fäuste hoch (0-40), Schlag auf den Boden (40-60)
        const up = smooth(f / 40), down = smooth((f - 44) / 14), back = smooth((f - 80) / 30);
        for (const s of ['L', 'R']) J['Arm' + s].rotation.x = (-2.6 * up + 3.3 * down) * (1 - back);
        J.Torso.rotation.x = (-0.2 * up + 0.45 * down) * (1 - back);
      }
    }
    if (b.state === 'ranged') {
      if (phase === 1) {
        const aim = smooth(f / 8) * (1 - smooth((f - 70) / 5));
        J.Head.rotation.x = 0.15 * aim;
        J.ArmL.rotation.x = -1.2 * aim;          // zeigt auf das Ziel
        J.ArmL.rotation.z = 0.3 * aim;
      } else {
        const lean = smooth(f / 30) * (1 - smooth((f - 36) / 4)), thrust = smooth((f - 34) / 5) * (1 - smooth((f - 60) / 20));
        J.Torso.rotation.x = -0.28 * lean + 0.35 * thrust;
        J.ArmL.rotation.z = 0.9 * (lean + thrust); J.ArmR.rotation.z = -0.9 * (lean + thrust);
      }
    }
    if (b.state === 'die') {
      if (phase === 1) {
        sink = 3.2 * smooth(f / 142);
        J.Torso.rotation.x = 0.35 * smooth(f / 30);
        J.ArmL.rotation.x = J.ArmR.rotation.x = -2.8 * smooth(f / 40);      // Arme hoch, er versinkt
        shake = f < 100 ? 0.04 : 0;
      } else {
        const stagger = smooth(f / 60), fall = smooth((f - 60) / 60);
        J.Torso.rotation.x = 0.25 * stagger + 0.3 * fall;
        J.Head.rotation.x = 0.4 * fall;
        for (const s of ['L', 'R']) { J['Arm' + s].rotation.x = -0.6 * stagger - 1.8 * fall; J['Leg' + s].rotation.x = -0.4 * fall; }
        sink = 4.9 * smooth((f - 110) / 190);
        shake = f < 300 ? 0.05 : 0;
      }
    }
    if (b.state === 'breakout') {
      // aus dem Boden hervorbrechen: Arme zuerst, dann der ganze Körper
      sink = 4.9 * (1 - smooth(f / 200));
      for (const s of ['L', 'R']) J['Arm' + s].rotation.x = -2.9 * (1 - smooth((f - 150) / 60));
      shake = f < 200 ? 0.05 : 0;
    }
    v.holder.position.set(x + (Math.random() - 0.5) * shake, y - sink + (Math.random() - 0.5) * shake * 0.5, Z);
    const h = phase === 1 ? 3 : 4.5;
    this.key.position.set(x - 1.5, y + h * 0.75, 3.2);
    this.key.intensity = 14;
    this.rim.position.set(x + 1.2, y + h * 0.9, -1.2);
    this.rim.intensity = 10;

    // Laser (Phase 1): Zielstrahl, dann der fegende Strahl
    const L = b.laser;
    this.tracer.visible = this.beam.visible = this.beamCore.visible = false;
    if (phase === 1 && L && (L.aiming || L.on)) {
      const s = b.laserSegment();
      const ang = Math.atan2(-s.dy, s.dx), len = 700 * U;
      for (const [m, r, show] of [[this.tracer, 0.02, L.aiming], [this.beam, 0.09 + 0.02 * Math.sin(time * 40), L.on], [this.beamCore, 0.035, L.on]]) {
        m.visible = show;
        m.position.set(s.ox * U, -s.oy * U, Z + 0.35);
        m.rotation.set(0, 0, ang);
        m.scale.set(len, r, r);
      }
      if (L.on) this.r.itemFx.flash(0xff3010, 6, new THREE.Vector3(s.ox * U, -s.oy * U, 0.8), 0, 0);
    }
    // Feuerball (Phase 2)
    const F = b.fireball;
    this.fire.visible = phase === 2 && !!F;
    if (F) {
      const rad = 28 * U * F.scale / 100;
      this.fire.position.set(F.x * U, -F.y * U, Z + 0.35);
      this.fire.scale.setScalar(Math.max(0.01, rad));
      this.fire.rotation.z = -F.rot * Math.PI / 180;
      this.r.itemFx.flash(0xff7020, 5 * F.scale / 100, this.fire.position, 0, 0);
      if (Math.random() < 0.6) {
        this.r.itemFx.sprite({
          pos: this.fire.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * rad, (Math.random() - 0.5) * rad, 0.05)),
          fire: true, additive: false, tex: this.r.itemFx.smokeTex, size: rad * 1.6, grow: true, life: 0.35,
        });
      }
    }
    // Leuchten und Trefferblitz
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    const hit = this.hitFlash > 0 ? this.hitFlash / 0.25 : 0;
    for (const m of v.mats) m.mat.emissive.copy(m.emissive).lerp(new THREE.Color(0xff2000), hit * 0.8);
    for (const g of v.glows) g.mat.emissiveIntensity = g.base * (0.8 + 0.3 * Math.sin(time * 5));
  }
}
