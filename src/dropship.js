import * as THREE from 'three';
import { TILE, DROP_FRAMES } from './constants.js';

// Startsequenz: das Mothership (assets/dropship.glb) bringt den Pod. Während der 53 Frames Spielpause
// (game.dropAnim) fliegt es heran, bremst, senkt den Pod an der Winde ab und klinkt ihn in Frame 53 aus;
// danach steigt es in Echtzeit wieder auf und verschwindet, während schon gespielt wird.

const U = 1 / TILE;
const FPS = 42;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const easeOut = (x) => 1 - (1 - clamp01(x)) ** 3;

const ARRIVE = 34;     // Frame, in dem das Schiff über dem Ziel steht
const LOWER_FROM = 36; // Winde senkt den Pod ab ...
const LOWER_TO = 50;   // ... bis hier
const LOWER = 0.34;    // so weit hängt der Pod beim Ausklinken unter der Klammer
const CLAMP_OPEN = 0.75;
const LEAVE_TIME = 4;  // Sekunden für den Abflug

export class Dropship {
  constructor(renderer) {
    this.r = renderer;
    this.root = new THREE.Group();
    this.root.visible = false;
    this.r.scene.add(this.root);
    // Lichter von Anfang an in der Szene lassen (Stärke 0), sonst übersetzt three.js alle Shader neu
    this.spot = new THREE.SpotLight(0xfff0d8, 0, 9, Math.PI / 7, 0.6, 1.2);
    this.spot.target = new THREE.Object3D();
    this.thrust = new THREE.PointLight(0xff8a40, 0, 4, 1.5);
    this.beacon = new THREE.PointLight(0xff2010, 0, 3, 1.6);
    this.r.scene.add(this.spot, this.spot.target, this.thrust, this.beacon);
    this.phase = 'idle';
  }

  apply(gltf) {
    const model = gltf.scene;
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.material.metalness = Math.min(o.material.metalness, 0.45);
      if (o.material.transparent) o.material.depthWrite = false;
    });
    this.root.add(model);
    this.r.putOnPodLayer(model); // wie der Pod über dem Erdreich, damit Klammer und Pod richtig überlappen
    this.fans = [0, 1, 2, 3].map((i) => model.getObjectByName('Fan_' + i));
    this.clampF = model.getObjectByName('Clamp_F');
    this.clampB = model.getObjectByName('Clamp_B');
    this.cable = model.getObjectByName('Cable');
    this.spotAt = model.getObjectByName('Lamp_Spot');
    this.beaconAt = model.getObjectByName('Lamp_Beacon');
    this.thrustAt = model.getObjectByName('Lamp_Thruster');
    const mat = (name) => { let m = null; model.traverse((o) => { if (o.isMesh && o.material.name === name) m = o.material; }); return m; };
    this.thrusterMat = mat('ThrusterGlow');
    this.beaconMat = mat('Beacon');
    this.thrusterBase = this.thrusterMat?.emissiveIntensity ?? 1;
    this.beaconBase = this.beaconMat?.emissiveIntensity ?? 1;
  }

  // Beim Spielstart mit Startsequenz aufrufen (nach game.startDrop)
  start(game) {
    const p = game.pod;
    // Zielpunkt: dort hängt der Pod beim Ausklinken (seine Position nach den 10 Vorab-Bewegungen)
    this.target = new THREE.Vector3(p.x * U, -p.y * U, 0.05);
    this.phase = 'drop';
    this.leaveT = 0;
    this.root.visible = true;
    this.events = { released: false };
  }

  stop() {
    this.phase = 'idle';
    this.root.visible = false;
    this.spot.intensity = this.thrust.intensity = this.beacon.intensity = 0;
  }

  // Einmal pro Bild nach updatePod aufrufen; liefert { hum, rate } für den Ton (hum 0 = aus)
  update(game, alpha, dt, time) {
    if (this.phase === 'idle' || !this.fans) return { hum: 0 };
    const pod = this.r.pod, T = this.target;
    let x, y, tilt, lower = 0, clamp = 0, thrust, fanSpeed, hum, rate;

    if (this.phase === 'drop') {
      const a = game.dropAnim;
      const f = a ? a.frame + alpha : DROP_FRAMES;
      // Anflug von links: schnell herein, dabei bremsen (Nase hoch), dann Schweben mit leichtem Wippen
      const e = easeOut(f / ARRIVE);
      x = T.x - 16 * (1 - e);
      y = T.y + LOWER + 2.4 * (1 - e) ** 2 + 0.03 * Math.sin(time * 2.6) * smooth((f - ARRIVE + 6) / 6);
      tilt = 0.28 * Math.sin(Math.PI * e) * (1 - e * 0.5) - 0.06 * (1 - e) ** 3;
      clamp = smooth((f - LOWER_FROM + 2) / 4);                  // Klammern geben den Pod frei ...
      lower = LOWER * smooth((f - LOWER_FROM) / (LOWER_TO - LOWER_FROM)); // ... und die Winde senkt ab
      thrust = 1 - smooth((f - 6) / 20);
      fanSpeed = 22;
      hum = 0.35 + 0.65 * e;
      rate = 0.34 + 0.12 * (1 - e);
      // Pod hängt an der Klammer bzw. am Seil (Physik steht, Darstellung folgt dem Schiff)
      pod.root.position.set(x, y - lower - pod.yaw.position.y, 0.05);
      pod.root.rotation.z = tilt * (1 - lower / LOWER);
      if (pod.rotor) pod.rotor.visible = false;
      if (!a) { this.phase = 'leave'; this.events.released = true; }
    }
    if (this.phase === 'leave') {
      // Abflug: Klammern schließen, Schiff steigt beschleunigt nach rechts oben weg
      const t = (this.leaveT += dt);
      x = T.x + 1.6 * t * t;
      y = T.y + LOWER + 0.9 * t + 0.5 * t * t;
      tilt = -0.2 * smooth(t / 1.2);
      clamp = 1 - smooth((t - 0.2) / 0.6);
      lower = 0;
      thrust = smooth((t - 0.3) / 0.5);
      fanSpeed = 26;
      hum = 1 - smooth((t - LEAVE_TIME + 1.5) / 1.5);
      rate = 0.4 + 0.25 * smooth(t / 2);
      if (t > LEAVE_TIME) { this.stop(); return { hum: 0 }; }
    }

    this.root.position.set(x, y, 0.05);
    this.root.rotation.z = tilt;
    for (const [i, fan] of this.fans.entries()) fan.rotation.y += fanSpeed * dt * (i % 2 ? 1 : -1);
    this.clampF.rotation.z = CLAMP_OPEN * clamp;
    this.clampB.rotation.z = -CLAMP_OPEN * clamp;
    this.cable.visible = lower > 0.005;
    this.cable.scale.y = Math.max(0.001, lower + 0.04);
    // Schubdüsen, Rundumleuchte, Suchscheinwerfer
    if (this.thrusterMat) this.thrusterMat.emissiveIntensity = this.thrusterBase * (0.25 + 1.5 * thrust * (0.85 + 0.3 * Math.random()));
    const blink = (time % 1) < 0.25 ? 1 : 0;
    if (this.beaconMat) this.beaconMat.emissiveIntensity = this.beaconBase * (0.1 + blink);
    this.root.updateMatrixWorld(true);
    this.thrustAt.getWorldPosition(this.thrust.position);
    this.thrust.intensity = 6 * thrust;
    this.beaconAt.getWorldPosition(this.beacon.position);
    this.beacon.intensity = 2 * blink;
    this.spotAt.getWorldPosition(this.spot.position);
    this.spot.target.position.set(this.spot.position.x + 0.3, this.spot.position.y - 4, 0);
    this.spot.intensity = 14 * (1 - (this.r.surfaceLight ?? 1) * 0.5);
    return { hum: Math.max(0, hum), rate, released: this.events.released && !(this.events.released = false) };
  }
}
