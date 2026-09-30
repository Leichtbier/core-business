import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MINERAL_LOOK, mineralGeometry, gemEnvironment } from './minerals.js';
import { boulderGeometry } from './tiles.js';
import { rockTexture } from './textures.js';

// Porträts für die Funksprüche, live in einem eigenen kleinen Renderer:
//   husk          Mr. Husk im Anzug (Endgegner-Modell Phase 1 ohne Kampfausrüstung)
//   husk_battle   Mr. Husk mit Laser-Monokel, Staff of Hell und Kevlar-Platten (vor dem Endkampf)
//   satan         Satan (Endgegner-Modell Phase 2)
//   miner         Pilot eines anderen Grabpods (pod.glb, andere Lackierung, Notbeleuchtung im Cockpit)
//   static        gestörtes Signal: Bildrauschen, auf Wunsch blitzen darin glühende Augen auf
//   find_10..13   Sonderfund auf einem Drehteller (Fundberichte, Modelle aus src/minerals.js)
//   notice_rock   Felsbrocken auf dem Drehteller (Hinweis beim ersten Bohrversuch in Fels)
// Beim Sprechen nickt der Kopf und der Mund bewegt sich; Leuchtteile pulsieren.

const GEAR = ['P1_Monocle', 'P1_MonocleFrame', 'P1_Staff', 'P1_StaffOrb', 'P1_Kevlar'];

const VIEWS = {
  husk: {
    file: 'boss', root: 'Husk_P1', prefix: 'P1_', bg: 0x0d1822, hide: GEAR, civil: true,
    cam: [0.5, 2.62, 2.45], look: [-0.05, 2.5, 0], fov: 30,
    glow: [], key: 0xffe2c8, rim: 0x7fc8ff,
  },
  husk_battle: {
    file: 'boss', root: 'Husk_P1', prefix: 'P1_', bg: 0x1a0606, hide: [],
    cam: [0.5, 2.55, 2.45], look: [-0.1, 2.52, 0], fov: 30,
    glow: ['StaffGlow', 'LaserGlow'], key: 0xffc8a8, rim: 0xff3010,
  },
  satan: {
    file: 'boss', root: 'Husk_P2', prefix: 'P2_', bg: 0x1c0806, hide: [],
    cam: [0.8, 3.8, 4.6], look: [0, 4.05, 0], fov: 38,
    glow: ['InfernoGlow', 'EvilEye', 'ChimneyGlow'], key: 0xffb070, rim: 0xff5020,
  },
  miner: {
    file: 'pod', bg: 0x0a0c0c, hide: [],
    cam: [1.05, 0.5, 1.15], look: [0.02, 0.08, 0], fov: 36,
    glow: [], key: 0xd8e0e0, rim: 0x70a0ff,
  },
};

// Pose für die Werbetafel (Gelenk -> Euler-Winkel): zeigt mit dem linken Arm auf den Betrachter.
// Am Arm hebt x nach vorne (zur Kamera), z schwenkt zur Seite (negativ: zur Körpermitte); siehe test/husk-poses.html
export const RECRUITER_POSE = {
  ArmL: [-1.5, 0, -0.12], ForearmL: [-0.25, 0, 0], ArmR: [0.05, 0, 0.08], Head: [-0.05, -0.08, 0.03], Torso: [0, 0.1, 0],
};

// Dämpfung der Leuchtmaterialien im Porträt (ohne Bloom würden sie weiß überstrahlen)
const GLOW_SCALE = { StaffGlow: 0.3, LaserGlow: 0.25, InfernoGlow: 0.1, EvilEye: 0.12, ChimneyGlow: 0.15 };

export class Portrait3D {
  constructor(width = 220, height = 257) {
    this.w = width;
    this.h = height;
    this.views = {};
    this.talking = false;
  }

  // Im Ladebildschirm: Modelle laden und Shader vorab übersetzen (eigener WebGL-Kontext)
  async load(onProgress = () => {}) {
    const loader = new GLTFLoader();
    const [boss, pod] = await Promise.all([
      loader.loadAsync('assets/husk_boss.glb', (e) => { if (e.total) onProgress(0.8 * e.loaded / e.total); }),
      loader.loadAsync('assets/pod.glb'),
    ]);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.w, this.h, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.canvas = this.renderer.domElement;
    const files = { boss, pod };
    for (const [name, v] of Object.entries(VIEWS)) this.views[name] = this.buildView(files[v.file], v);
    // Sonderfunde für die Fundberichte: find_10 .. find_13
    const env = gemEnvironment(this.renderer);
    MINERAL_LOOK.forEach((l, i) => { if (l.parts) this.views['find_' + i] = this.buildFind(l, env); });
    // Hinweis "Bohrer blockiert": ein Felsbrocken wie im Gestein (tiles.js), vergrößert auf Drehtellergröße
    const rock = rockTexture();
    this.views.notice_rock = this.buildTurntable(
      boulderGeometry(0).translate(0, 0, -0.12).scale(2.4, 2.4, 2.4),
      new THREE.MeshStandardMaterial({ map: rock, bumpMap: rock, bumpScale: 4, roughness: 0.85, flatShading: true, color: 0xc8beb4 }));
    for (const view of Object.values(this.views)) this.renderer.compile(view.scene, view.camera);
    this.buildStatic();
    onProgress(1);
  }

  buildView(gltf, v) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(v.bg);
    const model = (v.root ? gltf.scene.getObjectByName(v.root) : gltf.scene).clone(true);
    model.position.set(0, 0, 0);
    scene.add(model);
    const glowMats = [];
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone(); // eigene Materialien: Änderungen hier beeinflussen nicht das Spiel
      o.material.metalness = Math.min(o.material.metalness, 0.45);
      if (o.material.transparent) o.material.depthWrite = false;
      if (v.glow.includes(o.material.name)) {
        glowMats.push({ mat: o.material, base: o.material.emissiveIntensity * (GLOW_SCALE[o.material.name] ?? 0.3) });
      }
      // Im Anzug: Kevlar-Teile an Armen und Beinen sehen aus wie der übrige Anzug
      if (v.civil && o.material.name === 'KevlarPlate') o.material.color.setHex(0x0c0d10);
      // Anderer Grabpod: olivgrüne, abgenutzte Lackierung
      if (v.file === 'pod' && o.material.name === 'Paint') o.material.color.setHex(0x5f7040);
      if (v.file === 'pod' && o.material.name === 'PaintDark') o.material.color.setHex(0x34401f);
    });
    for (const name of v.hide) { const o = model.getObjectByName(name); if (o) o.visible = false; }
    // Mund um seine eigene Mitte skalierbar machen (für die Sprechbewegung)
    const mouth = v.prefix ? model.getObjectByName(v.prefix + 'Mouth') : null;
    if (mouth?.isMesh) {
      mouth.geometry = mouth.geometry.clone();
      mouth.geometry.computeBoundingBox();
      const c = mouth.geometry.boundingBox.getCenter(new THREE.Vector3());
      mouth.geometry.translate(-c.x, -c.y, -c.z);
      mouth.position.add(c);
    }
    scene.add(new THREE.HemisphereLight(0xcfd8e0, 0x2a1810, v.file === 'pod' ? 0.5 : 0.9));
    const key = new THREE.DirectionalLight(v.key, v.file === 'pod' ? 1.2 : 1.9);
    key.position.set(-2, 4, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(v.rim, 2.2);
    rim.position.set(3, 3, -3);
    scene.add(rim);
    // Notbeleuchtung im Cockpit des anderen Pods (flackert)
    const cockpit = new THREE.PointLight(0xff3020, 0, 1.2, 1.5);
    cockpit.position.set(0.07, 0.3, 0.05);
    scene.add(cockpit);
    const camera = new THREE.PerspectiveCamera(v.fov, this.w / this.h, 0.05, 50);
    camera.position.set(...v.cam);
    camera.lookAt(...v.look);
    const J = (n) => (v.prefix ? model.getObjectByName(v.prefix + n) : null);
    return {
      scene, camera, model, glowMats, mouth, cockpit, pod: v.file === 'pod',
      head: J('Head'), torso: J('Torso'), armL: J('ArmL'), tail: J('Tail'),
      pilot: v.file === 'pod' ? [model.getObjectByName('PilotHelmet'), model.getObjectByName('PilotVisor')] : [],
      rotor: v.file === 'pod' ? model.getObjectByName('Rotor') : null,
    };
  }

  // Sonderfund auf einem Drehteller im Labor
  buildFind(look, env) {
    return this.buildTurntable(mineralGeometry(look.shape), new THREE.MeshStandardMaterial({
      color: 0xffffff, vertexColors: true, metalness: look.metal, roughness: look.rough, flatShading: true,
      envMap: env, envMapIntensity: look.env,
    }));
  }

  // Modell auf einem Drehteller, warmes Licht von vorne, kühles Streiflicht von hinten
  buildTurntable(geo, mat) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x140e08);
    const find = new THREE.Mesh(geo, mat);
    scene.add(find);
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 0.14, 24),
      new THREE.MeshStandardMaterial({ color: 0x2a2420, metalness: 0.4, roughness: 0.6 }));
    plate.position.y = -1.62;
    scene.add(plate);
    scene.add(new THREE.HemisphereLight(0xfff0dc, 0x2a1810, 1.1));
    const key = new THREE.DirectionalLight(0xffe0b0, 2.2);
    key.position.set(-3, 4, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fc8ff, 1.6);
    rim.position.set(3, 2, -4);
    scene.add(rim);
    const camera = new THREE.PerspectiveCamera(30, this.w / this.h, 0.1, 50);
    camera.position.set(0, 0.9, 7.6);
    camera.lookAt(0, -0.15, 0);
    return { scene, camera, find, glowMats: [] };
  }

  // Einmalige Aufnahme für die Werbetafel "Mars Needs Miners": Mr. Husk im Anzug zeigt auf den Betrachter
  // (wie auf dem alten "I Want You"-Rekrutierungsplakat). Eigener Renderer mit transparentem Hintergrund,
  // danach wieder freigegeben; liefert ein 2D-Canvas.
  snapshotRecruiter(w = 640, h = 720, pose = RECRUITER_POSE) {
    const v = this.views.husk;
    if (!v) return null;
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1);
    r.setSize(w, h, false);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.setClearColor(0x000000, 0);
    const J = (n) => v.model.getObjectByName('P1_' + n);
    const joints = Object.keys(pose).map((n) => [J(n), J(n)?.rotation.clone()]);
    for (const [n, [x, y, z]] of Object.entries(pose)) J(n)?.rotation.set(x, y, z);
    const bg = v.scene.background;
    v.scene.background = null;
    const cam = new THREE.PerspectiveCamera(30, w / h, 0.05, 50);
    cam.position.set(0.15, 2.35, 4.4);
    cam.lookAt(0.02, 2.05, 0);
    r.render(v.scene, cam);
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    out.getContext('2d').drawImage(r.domElement, 0, 0);
    v.scene.background = bg;
    for (const [j, rot] of joints) if (j) j.rotation.copy(rot);
    r.dispose();
    r.forceContextLoss();
    return out;
  }

  // Gestörtes Signal: grobes Rauschen in einem 2D-Canvas
  buildStatic() {
    const c = document.createElement('canvas');
    c.width = 110;
    c.height = 128;
    c.style.imageRendering = 'pixelated';
    this.staticCanvas = c;
    this.staticCtx = c.getContext('2d');
    this.staticImg = this.staticCtx.createImageData(c.width, c.height);
  }

  // Porträt in container anzeigen (image: husk | husk_battle | satan | miner | static)
  show(container, image, { eyes = false } = {}) {
    this.image = image;
    this.eyes = eyes;
    this.view = this.views[image] || null;
    const el = image === 'static' ? this.staticCanvas : this.canvas;
    container.innerHTML = '';
    container.appendChild(el);
    el.style.width = '100%';
    el.style.height = '100%';
    this.t0 = performance.now();
    cancelAnimationFrame(this.raf);
    const loop = () => { this.frame((performance.now() - this.t0) / 1000); this.raf = requestAnimationFrame(loop); };
    loop();
  }

  hide() {
    cancelAnimationFrame(this.raf);
    this.view = null;
    this.image = null;
  }

  frame(t) {
    if (this.image === 'static') { this.drawStatic(t); return; }
    const v = this.view;
    if (!v) return;
    const talk = this.talking ? 1 : 0;
    if (v.head) {
      // Kopf: leichtes Wiegen, beim Sprechen Nicken im Satzrhythmus
      v.head.rotation.x = 0.03 * Math.sin(t * 1.1) + talk * 0.05 * Math.sin(t * 7.3) * Math.sin(t * 1.7);
      v.head.rotation.y = 0.08 * Math.sin(t * 0.6);
      v.head.rotation.z = 0.03 * Math.sin(t * 0.9 + 1);
      v.torso.rotation.x = 0.015 * Math.sin(t * 1.6); // Atmen
      if (v.armL) v.armL.rotation.x = -talk * (0.15 + 0.1 * Math.sin(t * 2.3)); // gestikuliert
    }
    if (v.tail) v.tail.rotation.z = 0.3 * Math.sin(t * 2.1);
    // Drehteller schwenkt hin und her, die Vorderseite bleibt meist sichtbar
    if (v.find) { v.find.rotation.y = 1.1 * Math.sin(t * 0.55); v.find.rotation.x = 0.12 + 0.05 * Math.sin(t * 1.3); }
    if (v.mouth) {
      const open = talk * Math.max(0, Math.sin(t * 17) * Math.sin(t * 5.3));
      v.mouth.scale.set(1 - 0.12 * open, 1 + 2.2 * open, 1 + 0.3 * open);
    }
    if (v.pod) {
      // Pilot wippt beim Sprechen, Notlicht flackert, Rotor steht still
      for (const p of v.pilot) if (p) p.position.y = (p.userData.y0 ??= p.position.y) + talk * 0.006 * Math.sin(t * 14);
      v.cockpit.intensity = 0.6 + 0.5 * Math.max(0, Math.sin(t * 3)) * (Math.random() < 0.08 ? 0.2 : 1);
      if (v.rotor) v.rotor.visible = false;
    }
    for (const g of v.glowMats) g.mat.emissiveIntensity = g.base * (0.8 + 0.25 * Math.sin(t * 5) + 0.1 * Math.random());
    this.renderer.render(v.scene, v.camera);
  }

  drawStatic(t) {
    const img = this.staticImg, d = img.data, w = img.width, h = img.height;
    const bar = (t * 40) % (h + 30) - 15; // wandernder heller Streifen
    // Augen: nur ab und zu kurz sichtbar, beim Sprechen häufiger
    const eyeOn = this.eyes && (Math.sin(t * 2.3) > 0.55 || (this.talking && Math.random() < 0.25));
    for (let y = 0; y < h; y++) {
      const lineBoost = Math.abs(y - bar) < 6 ? 60 : 0;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        let v = Math.random() * 200 + lineBoost;
        let r = v, g = v, b = v;
        if (eyeOn) {
          for (const ex of [36, 74]) {
            const dx = (x - ex) / 9, dy = (y - 52) / 4.5;
            const e = Math.max(0, 1 - dx * dx - dy * dy);
            if (e > 0) { r += 255 * e * 1.4; g += 120 * e; b -= 60 * e; }
          }
        }
        d[i] = Math.min(255, r); d[i + 1] = Math.min(255, g); d[i + 2] = Math.max(0, Math.min(255, b)); d[i + 3] = 255;
      }
    }
    this.staticCtx.putImageData(img, 0, 0);
  }
}
