import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TILE, EARTH_WIDTH, EARTH_HEIGHT, BUILDINGS, T, DAY_LENGTH, SAVE_POD } from './constants.js';
import {
  dirtTexture, rockTexture, smokeTexture, billboardTexture, glowTexture, lavaTexture, paveTextures, PAVE_VARIANTS, backWallTexture,
} from './textures.js';
import { ItemFX } from './items-fx.js';
import { MINERAL_LOOK, mineralGeometry, gemEnvironment } from './minerals.js';
import { Dropship } from './dropship.js';
import { BossView } from './boss.js';
import { tileGeometry, paveGeometry, boulderGeometry, boulderFragments, BOULDER_VARIANTS, lavaPocketGeometry, rimGeometry, rimPattern, worldUV, RIM, UP, RIGHT, DOWN, LEFT } from './tiles.js';

// Weltpixel (y nach unten) -> three.js-Einheiten (1 Tile = 1 Einheit, y nach oben)
const U = 1 / TILE;
// Darstellung des Pods: Physik rechnet wie im Original mit 40x40 px (0.8 Tile). Im Original ist die
// Grafik breiter als der Tunnel; in 2.5D sieht das schlecht aus, daher wird das Modell verkleinert.
const POD_SCALE = 0.7;
const POD_Z = 0.05;
const POD_LAYER = 1;
// Sichtbarer Ausschnitt wie im Original (550 x 400 px = 11 x 8 Tiles): mindestens 11 Tiles breit
// bzw. 7 Reihen hoch, je nachdem, was bei diesem Seitenverhältnis mehr Abstand braucht.
const VIEW_TILES_W = 11, VIEW_TILES_H = 7;
// Lackierung des Pods je Hüllen-Stufe (wie die Panzerplatten in assets/upgrades.py):
// Farbe, Metall, Rauheit, Eigenleuchten (wenig Metall: ohne Umgebungsspiegelung wirkt Metall schwarz)
const HULL_LOOK = [
  null, // Stock Hull: Originalfarben aus pod.glb
  { color: 0x6e5a50, metal: 0.25, rough: 0.6 },
  { color: 0xb8763a, metal: 0.3, rough: 0.35 },
  { color: 0x8f9cab, metal: 0.25, rough: 0.3 },
  { color: 0xe4e7eb, metal: 0.2, rough: 0.2 },
  { color: 0x5fd040, metal: 0.3, rough: 0.35, emissive: 0x0f3a08 },
  { color: 0x26345e, metal: 0.45, rough: 0.3, emissive: 0x06203a, shield: true },
];
// Eigenleuchten der Rückwand hinter freigelegten Tiles: knapp unter der Oberfläche bzw. ganz unten
const LAVA_SHAPES = 4; // Formvarianten der Magmaeinschlüsse
const BACK_GLOW_MIN = 0.3, BACK_GLOW_MAX = 0.9;
const toX = (px) => px * U;
const toY = (py) => -py * U;


// Werbetafel "Mars Needs Miners" an der Oberfläche: Mitte x, Tiefe z (hinter der Spielebene), Tafel w x h,
// Unterkante der Tafel legs über dem Boden (Boden bei y = -4.5)
// Steht zwischen Upgrade- und Reparaturwerkstatt: so weit vom Save-Pod (x ≈ 17.7, vorne), dass er sich durch die
// Parallaxe nie vor das Plakat schiebt
const BILLBOARD = { x: 27.5, z: -10.5, w: 8, h: 3.5, legs: 3.3 };

// Formvariante des Felsbrockens in Tile (x, y), gleich für Darstellung und Sprengung
const boulderVariant = (x, y) => Math.floor(hash(x, y, 13) * BOULDER_VARIANTS) % BOULDER_VARIANTS;
const ROCK_Z = 0.28; // Brocken sitzen vor der Tile-Mitte und ragen vorne aus dem Erdreich (Vorderseite bei z = 0.5)

function hash(x, y, k = 0) {
  let h = (x * 374761393 + y * 668265263 + k * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Bodenfarbe abhängig von der Tiefe (Mars-Erde: orange -> rotbraun -> dunkel)
const DEPTH_COLORS = [
  [0, new THREE.Color(0xc0703f)],
  [60, new THREE.Color(0xa0583a)],
  [160, new THREE.Color(0x7d4a3a)],
  [300, new THREE.Color(0x6a3c34)],
  [450, new THREE.Color(0x5a2a26)],
  [600, new THREE.Color(0x4a1512)],
];
function depthColor(ty, out) {
  for (let i = 1; i < DEPTH_COLORS.length; i++) {
    if (ty <= DEPTH_COLORS[i][0]) {
      const [a, ca] = DEPTH_COLORS[i - 1], [b, cb] = DEPTH_COLORS[i];
      return out.copy(ca).lerp(cb, (ty - a) / (b - a));
    }
  }
  return out.copy(DEPTH_COLORS[DEPTH_COLORS.length - 1][1]);
}

export class Renderer {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    // Schatten nur für den Scheinwerfer des Pods: Fels blockiert sein Licht
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    this.camDist = 9.5; // wird in resize() an das Seitenverhältnis angepasst
    this.cam = { x: 8, y: -3 };
    this.time = 0;

    this.skyColor = new THREE.Color(0xe39a6a);      // Mittag
    this.nightSky = new THREE.Color(0x07060d);      // Mitternacht
    this.duskSky = new THREE.Color(0x4a5a86);       // Dämmerung: Mars-Sonnenuntergänge sind bläulich
    this.curSky = new THREE.Color();
    this.deepColor = new THREE.Color(0x050203);
    this.scene.background = this.skyColor.clone();
    this.scene.fog = new THREE.Fog(this.skyColor.clone(), 14, 60);

    this.setupLights();
    this.setupMaterials();
    this.setupTerrain();
    this.flickers = []; // flackernde Leuchtschriften
    this.blinkers = []; // blinkende Warnleuchten
    this.welds = [];    // Schweißlicht (Schübe schneller Blitze)
    this.setupSurface();
    this.setupCosmos();
    this.pod = this.buildPod();
    this.scene.add(this.pod.root);
    this.putOnPodLayer(this.pod.root);
    this.podLayer = POD_LAYER;
    this.podScale = POD_SCALE;
    this.itemFx = new ItemFX(this);
    this.dropship = new Dropship(this);
    this.boss = new BossView(this);
    this.particles = [];
    this.debris = []; // Stücke gesprengter Felsbrocken (breakBoulder)
    this.particleGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const t = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    // Abstand zur Vorderkante der Tiles (z = 0.5), damit genau so viel sichtbar ist
    this.camDist = this.zoom ?? Math.max(VIEW_TILES_W / 2 / (t * this.camera.aspect), VIEW_TILES_H / 2 / t) + 0.5;
  }

  setupLights() {
    this.hemi = new THREE.HemisphereLight(0xffd9b8, 0x5a2a18, 1.2);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0dd, 2.2);
    this.sun.position.set(-6, 10, 8);
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.05);
    this.scene.add(this.ambient);
  }

  setupMaterials() {
    const dirtTex = dirtTexture(), rockTex = rockTexture(), lavaTex = lavaTexture(), paveTex = paveTextures();
    this.mats = {
      dirt: worldUV(new THREE.MeshStandardMaterial({ map: dirtTex, bumpMap: dirtTex, bumpScale: 1.5, roughness: 0.95 }), 0.5),
      rock: worldUV(new THREE.MeshStandardMaterial({ map: rockTex, bumpMap: rockTex, bumpScale: 4, roughness: 0.8, flatShading: true }), 0.8),
      // fliegende Felsstücke nach einer Sprengung: Textur über die eigenen UVs, sonst "schwimmt" sie beim Fliegen
      rockDebris: new THREE.MeshStandardMaterial({ map: rockTex, bumpMap: rockTex, bumpScale: 4, roughness: 0.8, flatShading: true }),
      lava: worldUV(new THREE.MeshStandardMaterial({
        map: lavaTex, emissiveMap: lavaTex, emissive: 0xff5500, emissiveIntensity: 0.9, roughness: 0.5,
      }), 0.5),
      // Betonplatten unter den Gebäuden: Beton und Stahlkante (Gruppen von paveGeometry)
      pave: [
        new THREE.MeshStandardMaterial({ map: paveTex.concrete, bumpMap: paveTex.concrete, bumpScale: 1.2, roughness: 0.9 }),
        new THREE.MeshStandardMaterial({ map: paveTex.steel, bumpMap: paveTex.steel, bumpScale: 0.8, roughness: 0.55, metalness: 0.35 }),
      ],
      // verkohlte, glimmende Erde rund um Magmaeinschlüsse
      crust: worldUV(new THREE.MeshStandardMaterial({
        map: dirtTex, bumpMap: dirtTex, bumpScale: 2, color: 0x4a1a0c, emissive: 0x5a1400, roughness: 1,
      }), 0.5),
      back: new THREE.MeshStandardMaterial({ map: backWallTexture(), roughness: 1 }),
    };
    this.animateLava(this.mats.lava);
    // Mineralien: eigene Umgebungsspiegelung (Metallglanz, Funkeln) und leichtes Eigenleuchten, damit sie
    // auch im Dunkeln erkennbar bleiben (wie im Original); Stärken je Sorte in src/minerals.js
    const env = gemEnvironment(this.renderer);
    this.gemMats = MINERAL_LOOK.map((l) => {
      // Sonderfunde tragen ihre Farben je Teil (Vertex-Farben); ihr Eigenleuchten ist neutral, sonst färbt es alle Teile ein
      const emissive = new THREE.Color(l.emissive ?? 0x000000).add(new THREE.Color(l.parts ? 0xffffff : l.color).multiplyScalar(l.selfLit * (l.parts ? 0.5 : 1)));
      return new THREE.MeshStandardMaterial({
        color: l.parts ? 0xffffff : l.color, vertexColors: !!l.parts, metalness: l.metal, roughness: l.rough, emissive, flatShading: true,
        envMap: env, envMapIntensity: l.env,
      });
    });
  }

  setupTerrain() {
    const make = (geo, mat, n, colored) => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      if (colored) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      m.frustumCulled = false;
      m.castShadow = m.receiveShadow = true;
      m.count = 0;
      this.scene.add(m);
      return m;
    };
    // 16 Kanten-Varianten je Material (Bitmaske der freiliegenden Seiten)
    const variants = [...Array(16)].map((_, mask) => tileGeometry(mask));
    const variantSet = (mat, full, other, colored) =>
      variants.map((geo, mask) => make(geo, mat, mask === 0 ? full : other, colored));
    this.meshes = {
      dirt: variantSet(this.mats.dirt, 1200, 300, true),
      // Magmaeinschlüsse: Erd-Tile (dirt) mit eingelassener Blase und Kruste, LAVA_SHAPES Formvarianten
      lava: [...Array(LAVA_SHAPES)].map((_, v) => make(lavaPocketGeometry(v), this.mats.lava, 120, false)),
      crust: [...Array(LAVA_SHAPES)].map((_, v) =>
        make(lavaPocketGeometry(v, { radius: 0.38, front: 0.506, dome: 0.012 }), this.mats.crust, 120, false)),
      rock: [...Array(BOULDER_VARIANTS)].map((_, v) => make(boulderGeometry(v), this.mats.rock, 250, true)),
      // je Plattenvariante: linkes Endstück, Mittelstück, rechtes Endstück (Index end + 1 + 3 * Variante)
      pave: [...Array(PAVE_VARIANTS * 3)].map((_, i) =>
        make(paveGeometry(Math.floor(i / 3), PAVE_VARIANTS, (i % 3) - 1), this.mats.pave, 24, false)),
    };
    this.rims = new Map(); // Tunnelrand-Muster -> InstancedMesh
    // Weicher, additiver Lichtschein um Mineral-Tiles (Farbe je Mineral, pulsiert leicht)
    this.glow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
      map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }), 600);
    this.glow.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(600 * 3), 3);
    this.glow.frustumCulled = false;
    this.glow.count = 0;
    this.scene.add(this.glow);
    this.gems = this.gemMats.map((mat, kind) => {
      const m = new THREE.InstancedMesh(mineralGeometry(MINERAL_LOOK[kind].shape), mat, 300);
      m.frustumCulled = false;
      m.count = 0;
      this.scene.add(m);
      return m;
    });

    // Rückwand hinter den Tunneln
    const tex = this.mats.back.map;
    tex.repeat.set(EARTH_WIDTH, EARTH_HEIGHT);
    // Grundlicht der Rückwand: sie leuchtet schwach aus ihrer eigenen Textur, damit freigelegte Tiles
    // auch tief unten (wo kaum Licht hinkommt) vom ungegrabenen Erdreich zu unterscheiden sind.
    // Stärke je nach Tiefe in updateLighting.
    this.mats.back.emissiveMap = tex;
    this.mats.back.emissive.setHex(0xffd2b4);
    this.mats.back.emissiveIntensity = 0;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(EARTH_WIDTH, EARTH_HEIGHT), this.mats.back);
    back.position.set(EARTH_WIDTH / 2 - 0.5, -5.5 - EARTH_HEIGHT / 2, -0.5);
    back.receiveShadow = true;
    this.scene.add(back);

    // Seitlicher Fels außerhalb der Welt
    const sideMat = new THREE.MeshStandardMaterial({ color: 0x3a2018, roughness: 1 });
    for (const x of [-20.5, EARTH_WIDTH + 19.5]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(40, EARTH_HEIGHT, 1), sideMat);
      side.position.set(x, -4.5 - EARTH_HEIGHT / 2, 0);
      this.scene.add(side);
    }

    this.tmpM = new THREE.Matrix4();
    this.tmpQ = new THREE.Quaternion();
    this.tmpE = new THREE.Euler();
    this.tmpP = new THREE.Vector3();
    this.tmpS = new THREE.Vector3();
    this.tmpC = new THREE.Color();
  }

  setupSurface() {
    const g = new THREE.Group();
    // Boden hinter dem Querschnitt, auf dem die Gebäude stehen
    const groundMat = new THREE.MeshStandardMaterial({ color: 0xa65a32, roughness: 1 });
    const ground = new THREE.Mesh(new THREE.BoxGeometry(200, 1, 60), groundMat);
    ground.position.set(EARTH_WIDTH / 2, -5, -30.5);
    g.add(ground);

    // Gebäude: leere Gruppen an der richtigen Stelle, die Modelle lädt loadAssets()
    this.houses = [];
    for (const b of BUILDINGS) {
      const house = new THREE.Group();
      house.position.set((b.cols[0] + b.cols[1]) / 2, -4.5, -1.6);
      g.add(house);
      this.houses.push({ house, url: b.model });
    }

    // Save-Pod: schwebt über der Oberfläche, das Modell lädt loadAssets() (knapp hinter der Ebene des Pods)
    this.savePod = { root: new THREE.Group(), hatches: [], glow: null, open: 0 };
    this.savePod.root.position.set(toX(SAVE_POD.x + SAVE_POD.cx), toY(SAVE_POD.y + SAVE_POD.bob[0]), -0.35);
    g.add(this.savePod.root);

    this.buildBillboard(g);

    // Ferne Berge
    const mountMat = new THREE.MeshStandardMaterial({ color: 0x9a4a30, roughness: 1, flatShading: true });
    for (let i = 0; i < 14; i++) {
      const r = 4 + hash(i, 1) * 8;
      const m = new THREE.Mesh(new THREE.ConeGeometry(r, r * (0.6 + hash(i, 2) * 0.6), 5), mountMat);
      m.position.set(-25 + i * 6.5 + hash(i, 3) * 4, -4.5 + r * 0.25, -35 - hash(i, 4) * 15);
      m.rotation.y = hash(i, 5) * Math.PI;
      g.add(m);
    }
    this.surface = g;
    this.scene.add(g);
  }

  // Werbetafel von Husk Heavy Industries: Plakat auf Stahlrahmen, zwei Stützen mit Kreuzverstrebung,
  // Wartungssteg mit Geländer und Strahlern, die das Plakat nachts beleuchten (Eigenleuchten des Plakats)
  buildBillboard(parent) {
    const B = BILLBOARD, GY = -4.5;
    const root = new THREE.Group();
    root.position.set(B.x, GY, B.z);
    root.rotation.y = -0.06; // leicht zur Straße gedreht
    parent.add(root);
    const steel = new THREE.MeshStandardMaterial({ color: 0x2c2724, metalness: 0.5, roughness: 0.65 });
    const rust = new THREE.MeshStandardMaterial({ color: 0x5a2c16, metalness: 0.3, roughness: 0.85 });
    const lampGlow = new THREE.MeshStandardMaterial({ color: 0x302a20, emissive: 0xffe8b0, emissiveIntensity: 0.4 });
    this.poster = billboardTexture();
    const posterMat = new THREE.MeshStandardMaterial({
      map: this.poster.texture, emissiveMap: this.poster.texture, emissive: 0xffffff, emissiveIntensity: 0.1, roughness: 0.85,
    });
    const box = (w, h, d, x, y, z, mat, rz = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.rotation.z = rz;
      root.add(m);
      return m;
    };
    const bottom = B.legs, cy = bottom + B.h / 2;
    // Tafel: vorne das Plakat, sonst Blech
    const board = new THREE.Mesh(new THREE.BoxGeometry(B.w, B.h, 0.12), [steel, steel, steel, steel, posterMat, rust]);
    board.position.set(0, cy, 0);
    root.add(board);
    // Rahmen
    box(B.w + 0.3, 0.16, 0.26, 0, bottom + B.h + 0.05, 0.02, steel);
    box(B.w + 0.3, 0.16, 0.26, 0, bottom - 0.05, 0.02, steel);
    for (const s of [-1, 1]) box(0.16, B.h + 0.26, 0.26, s * (B.w / 2 + 0.07), cy, 0.02, steel);
    // Stützen (hinter der Tafel bis zur Tafelmitte), Kreuzverstrebung dazwischen
    const LX = B.w * 0.3;
    for (const s of [-1, 1]) {
      box(0.3, cy, 0.3, s * LX, cy / 2, -0.3, steel);
      box(0.7, 0.1, 0.7, s * LX, 0.05, -0.3, rust); // Fußplatte
    }
    const span = Math.hypot(LX * 2, bottom * 0.8);
    const ang = Math.atan2(bottom * 0.8, LX * 2);
    box(span, 0.09, 0.09, 0, bottom * 0.45, -0.3, rust, ang);
    box(span, 0.09, 0.09, 0, bottom * 0.45, -0.3, rust, -ang);
    // Wartungssteg unter der Tafel mit Geländer (bleibt unterhalb des Plakats, verdeckt den Banner nicht)
    const deck = bottom - 0.62;
    box(B.w + 0.2, 0.06, 0.7, 0, deck, 0.42, steel);
    box(B.w + 0.2, 0.05, 0.05, 0, deck + 0.5, 0.75, steel);
    for (let i = 0; i <= 8; i++) box(0.05, 0.5, 0.05, -B.w / 2 + (B.w / 8) * i, deck + 0.25, 0.75, steel);
    for (const s of [-1, 1]) box(0.08, 0.08, 0.9, s * LX, deck - 0.05, 0.1, steel); // Konsolen zum Steg
    // Strahler vorne am Steg auf Auslegern, nach oben auf das Plakat gerichtet
    for (let i = 0; i < 4; i++) {
      const x = -B.w * 0.375 + (B.w / 4) * i;
      box(0.05, 0.05, 0.5, x, deck + 0.02, 0.95, steel);
      const head = box(0.3, 0.16, 0.22, x, deck + 0.12, 1.18, steel);
      head.rotation.x = -1.0;
      const lens = box(0.24, 0.02, 0.16, x, deck + 0.2, 1.13, lampGlow);
      lens.rotation.x = -1.0;
    }
    this.billboard = { posterMat, lampGlow };
  }

  // Mr. Husk ins Plakat einsetzen (Porträt aus Portrait3D.snapshotRecruiter)
  setBillboardPortrait(canvas) {
    if (canvas) this.poster.setPortrait(canvas);
  }

  // Alle Modelle laden (Pod und Gebäude), Fortschritt 0..1 melden, danach Shader vorab übersetzen.
  // Wirft einen Fehler, wenn eine Datei fehlt: ohne Modelle gibt es nichts Sinnvolles anzuzeigen.
  async loadAssets(onProgress = () => {}, extra = []) {
    const loader = new GLTFLoader();
    const tasks = [
      { url: 'assets/pod.glb', apply: (gltf) => this.applyPodModel(gltf) },
      ...this.houses.map((h) => ({ url: h.url, apply: (gltf) => this.applyBuildingModel(h.house, gltf) })),
      { url: 'assets/rocks.glb', apply: (gltf) => this.applyRocks(gltf) },
      { url: 'assets/items.glb', apply: (gltf) => this.itemFx.apply(gltf) },
      { url: 'assets/upgrades.glb', apply: (gltf) => this.applyUpgrades(gltf) },
      { url: 'assets/dropship.glb', apply: (gltf) => this.dropship.apply(gltf) },
      { url: 'assets/husk_boss.glb', apply: (gltf) => this.boss.apply(gltf) },
      { url: 'assets/save_pod.glb', apply: (gltf) => this.applySavePod(gltf) },
    ];
    const parts = new Array(tasks.length + extra.length).fill(0);
    const report = () => onProgress(parts.reduce((a, b) => a + b, 0) / parts.length);
    const fail = (url) => (e) => { throw new Error(`${url} konnte nicht geladen werden (${e.message || e})`); };
    await Promise.all([
      ...tasks.map((t, i) => loader.loadAsync(t.url, (ev) => {
        if (ev.total) { parts[i] = 0.95 * ev.loaded / ev.total; report(); }
      }).catch(fail(t.url)).then((gltf) => { t.apply(gltf); parts[i] = 1; report(); })),
      ...extra.map((job, j) => job((f) => { parts[tasks.length + j] = f; report(); })
        .then(() => { parts[tasks.length + j] = 1; report(); })),
    ]);
    this.itemFx.attachClip(); // Schnittebene am Pod ändert die Shader, daher vor dem Übersetzen
    // Lampen der Gebäude aus der Oberflächen-Kulisse lösen: die Kulisse wird unter Tage ausgeblendet,
    // die Lichter müssen aber in der Szene bleiben. Ändert sich die Zahl der Lichter, übersetzt three.js
    // alle Shader neu und das Spiel hängt kurz (beim Durchqueren von Reihe 20 und beim Teleport).
    this.surface.updateMatrixWorld(true);
    const surfaceLights = [];
    this.surface.traverse((o) => { if (o.isLight) surfaceLights.push(o); });
    this.surfaceLights ??= new THREE.Group();
    this.scene.add(this.surfaceLights);
    for (const l of surfaceLights) this.surfaceLights.attach(l);
    // Shader für alle Materialien vorab übersetzen, damit das erste Bild nicht ruckelt; dazu kommen
    // Items und Bohrköpfe, die erst später in der Szene auftauchen (außerhalb des Bildes geparkt)
    const warm = new THREE.Group();
    for (const o of [...this.itemFx.warmupObjects(), ...(this.drillProtos || []).filter(Boolean).map((d) => d.clone())]) warm.add(o);
    warm.add(new THREE.Mesh(boulderFragments(0)[0].geo, this.mats.rockDebris)); // Felsstücke nach Sprengungen
    warm.position.set(EARTH_WIDTH / 2, -3, -1);
    this.scene.add(warm);
    this.dropship.root.visible = true; // unsichtbare Objekte werden nicht vorübersetzt
    this.boss.warmup(true);
    this.camera.layers.enableAll();
    await this.renderer.compileAsync(this.scene, this.camera);
    this.scene.remove(warm);
    this.dropship.root.visible = false;
    this.boss.warmup(false);
    this.camera.layers.set(0);
  }

  // Gesteine auf der Oberfläche verteilen (deterministisch, bei jedem Start gleich). Drei Tiefenebenen:
  // vorne kleines Geröll zwischen den Gebäuden, in der Mitte Brocken, hinten große Formationen.
  applyRocks(gltf) {
    // Prototypen sammeln: mehrfarbige Objekte kommen als Gruppe mit Teil-Meshes an
    const protos = {};
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      let node = o;
      while (node && !/^(Rock|Formation)_\d+$/.test(node.name)) node = node.parent;
      if (node) (protos[node.name] ||= []).push(o);
    });
    const rocks = Object.keys(protos).filter((k) => k.startsWith('Rock'));
    const forms = Object.keys(protos).filter((k) => k.startsWith('Formation'));
    // Grundflächen der Gebäude (x-Bereiche), dort vorne keine Steine
    const blocked = BUILDINGS.map((b) => [b.cols[0] - 0.9, b.cols[1] + 0.9]);
    const B = BILLBOARD;
    const underBillboard = (x, z) => Math.abs(z - B.z) < 1.2 && Math.abs(x - B.x) < B.w / 2 + 0.6;
    const free = (x, z) => (z < -4.2 || !blocked.some(([a, b]) => x > a && x < b)) && !underBillboard(x, z);
    const placements = {};
    const add = (key, x, z, s, sy, rot) => (placements[key] ||= []).push({ x, z, s, sy, rot });
    const X0 = -30, X1 = EARTH_WIDTH + 30;
    let n = 0;
    const r = () => hash(n++, 7, 3);
    // Vorne: kleines Geröll
    for (let i = 0; i < 140; i++) {
      const x = X0 + r() * (X1 - X0), z = -0.7 - r() * 3.5;
      if (free(x, z)) add(rocks[Math.floor(r() * rocks.length)], x, z, 0.08 + r() * 0.22, 0.7 + r() * 0.6, r() * 6.3);
    }
    // Mitte: Brocken und einzelne kleinere Formationen
    for (let i = 0; i < 70; i++) {
      const x = X0 + r() * (X1 - X0), z = -4.5 - r() * 10;
      if (r() < 0.1) add(forms[Math.floor(r() * forms.length)], x, z, 0.35 + r() * 0.35, 0.7 + r() * 0.5, r() * 6.3);
      else add(rocks[Math.floor(r() * rocks.length)], x, z, 0.3 + r() * 0.7, 0.6 + r() * 0.7, r() * 6.3);
    }
    // Hinten: große Formationen vor den Bergen
    for (let i = 0; i < 18; i++) {
      const x = X0 - 10 + r() * (X1 - X0 + 20), z = -22 - r() * 12;
      add(forms[Math.floor(r() * forms.length)], x, z, 0.9 + r() * 1.2, 0.7 + r() * 0.7, r() * 6.3);
    }
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0), C = new THREE.Color();
    for (const [key, list] of Object.entries(placements)) {
      for (const proto of protos[key]) {
        const mesh = new THREE.InstancedMesh(proto.geometry, proto.material, list.length);
        proto.material.flatShading = true;
        list.forEach((p, i) => {
          Q.setFromAxisAngle(up, p.rot);
          M.compose(P.set(p.x, -4.5, p.z), Q, S.set(p.s, p.s * p.sy, p.s));
          mesh.setMatrixAt(i, M);
          mesh.setColorAt(i, C.setScalar(0.85 + hash(i, 3, 9) * 0.3));
        });
        this.surface.add(mesh);
      }
    }
  }

  // Gebäude-Modell einsetzen. Konvention: Ursprung in der Mitte der Grundfläche am Boden,
  // Vorderseite bei z = 0 (liegt hier bei z = -0.6).
  applyBuildingModel(house, gltf) {
    const model = gltf.scene;
    house.clear();
    model.position.z = 1.0;
    let signColor = 0xff6a10; // Licht am Schild übernimmt die Farbe der Leuchtschrift
    let weld = null;          // Schweißlicht: Material und zugehöriges Licht flackern gemeinsam
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.material.metalness = Math.min(o.material.metalness, 0.45); // keine Umgebungs-Spiegelung
      if (o.material.name === 'SignGlow') {
        this.flickers.push({ mat: o.material, base: o.material.emissiveIntensity, seed: Math.random() * 100 });
        signColor = o.material.emissive.getHex();
      }
      if (o.material.name === 'WeldGlow') weld = { mat: o.material, base: o.material.emissiveIntensity, light: null };
    });
    // An den Empties "Lamp_*" echte Lichter setzen
    model.updateMatrixWorld(true);
    model.traverse((o) => {
      if (!o.name.startsWith('Lamp_')) return;
      const beacon = o.name.startsWith('Lamp_Beacon');
      const warm = {
        Lamp_Canopy: [0xffb060, 2.5, 4], Lamp_Window: [0xff8030, 1.0, 2.2], Lamp_Post: [0xffd090, 2.5, 5],
        Lamp_Bay: [0xffd090, 2.2, 3.5], Lamp_Furnace: [0xff5010, 2.0, 2.5], Lamp_Ore: [0x60d0ff, 0.8, 1.5],
        Lamp_Sign: [signColor, 1.2, 2.5], Lamp_Windows: [0xff8030, 0.8, 2.2], Lamp_Tower: [0xff8030, 1.0, 2.5],
        Lamp_Weld: [0x8fb4ff, 2.5, 2.5],
        Lamp_Container: [0xffb070, 1.0, 1.8],
        Lamp_SaveSign: [0x60ff80, 0.35, 0.9], Lamp_Thruster: [0xff9040, 1.2, 1.4],
      };
      const [color, intensity, dist] = beacon ? [0xff2010, 1.5, 2.5] : (warm[o.name] || [0xffb060, 1.5, 3]);
      const light = new THREE.PointLight(color, intensity, dist, 1.6);
      o.add(light);
      if (beacon) this.blinkers.push({ light, base: intensity, phase: Math.random() });
      if (o.name === 'Lamp_Weld' && weld) weld.light = { light, base: intensity };
    });
    if (weld) this.welds.push(weld);
    house.add(model);
  }

  // Save-Pod wie ein Gebäude einsetzen (Leuchtschrift, Warnleuchte, Lampen), aber ohne Versatz nach vorne
  applySavePod(gltf) {
    const sp = this.savePod;
    this.applyBuildingModel(sp.root, gltf);
    const model = gltf.scene;
    model.position.z = 0;
    for (const name of ['Hatch_L', 'Hatch_R']) {
      const h = model.getObjectByName(name);
      if (h) sp.hatches.push({ obj: h, dir: name === 'Hatch_L' ? 1 : -1 });
    }
    model.traverse((o) => { if (o.isMesh && o.material.name === 'ThrusterGlow') sp.glow = { mat: o.material, base: o.material.emissiveIntensity }; });
  }

  // Wippen wie savePodMC (57 Frames), Klappe öffnet sich, wenn der Pod in der Nähe ist
  updateSavePod(game, dt) {
    const sp = this.savePod, f = game.savePodFrame;
    sp.root.visible = f >= 0;
    if (f < 0) return;
    sp.root.position.y = toY(game.savePodY(f) + (SAVE_POD.top + SAVE_POD.bottom) / 2);
    const dx = game.pod.x - (SAVE_POD.x + SAVE_POD.cx), dy = game.pod.y - game.savePodY(f);
    const near = Math.hypot(dx, dy) < 160 || game.saving ? 1 : 0;
    sp.open += (near - sp.open) * Math.min(1, dt * 4);
    for (const h of sp.hatches) h.obj.rotation.z = h.dir * sp.open * 1.9;
    if (sp.glow) sp.glow.mat.emissiveIntensity = sp.glow.base * (0.75 + Math.sin(this.time * 9) * 0.15 + Math.random() * 0.1);
  }

  buildPod() {
    const root = new THREE.Group();   // Position + Neigung
    const yaw = new THREE.Group();    // Blickrichtung / Wenden
    root.add(yaw);

    // Licht: Scheinwerfer (mit Schatten, damit er nicht durch Fels scheint) und ein schwaches Nahlicht.
    // Beide sitzen im Tunnel, nicht vor der Schnittfläche; das Nahlicht reicht nur bis zu den Tunnelwänden.
    const lamp = new THREE.PointLight(0xffd6a0, 0, 1.6, 1.2);
    lamp.position.set(0, 0.25, 0);
    root.add(lamp);
    const spot = new THREE.SpotLight(0xfff2d0, 0, 12, Math.PI / 5, 0.5, 1.2);
    spot.position.set(0.3, 0.05, 0);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.camera.near = 0.05;
    spot.shadow.camera.far = 12;
    spot.shadow.bias = -0.0005;
    spot.shadow.normalBias = 0.02;
    yaw.add(spot);
    spot.target.position.set(3, -0.6, 0);
    yaw.add(spot.target);

    const exhaustPoint = new THREE.Object3D(); // Austrittspunkt der Abgase (Auspuffrohre hinten oben)
    exhaustPoint.position.set(-0.33, 0.32, 0);
    yaw.add(exhaustPoint);

    // Rumpf, Rotor, Bohrer und Räder kommen aus assets/pod.glb (loadAssets)
    return { root, yaw, rotor: null, drillSide: null, drillDown: null, lamp, spot, exhaustPoint, wheels: [], drillScale: 1, turnAngle: Math.PI };
  }

  // ---------- Terrain in der Umgebung der Kamera aufbauen ----------
  updateTerrain(game) {
    const w = game.world;
    const halfH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * (this.camDist + 1);
    const halfW = halfH * this.camera.aspect;
    const y0 = Math.max(0, Math.floor(-this.cam.y - halfH - 2));
    const y1 = Math.min(w.height - 1, Math.ceil(-this.cam.y + halfH + 3));
    const x0 = Math.max(0, Math.floor(this.cam.x - halfW - 2));
    const x1 = Math.min(w.width - 1, Math.ceil(this.cam.x + halfW + 2));

    const counts = {};
    for (const k in this.meshes) counts[k] = new Array(this.meshes[k].length).fill(0);
    const gemCounts = new Array(this.gems.length).fill(0);
    this.glowCount = 0;
    const M = this.tmpM, P = this.tmpP, S = this.tmpS, C = this.tmpC;
    const id = new THREE.Quaternion();
    const pod = game.pod;
    const digging = pod.dig && pod.mod === 'digging';
    const prog = game.digProgress();
    if (!digging) this.digGem = null;

    const H = w.height;
    const isDig = (x, y) => digging && pod.digX === x && pod.digY === y;
    // Leere Felder mit Tunnelrand: wie getTileGraphicName nur zwischen Reihe 5 und earthHeight-13.
    // Das gerade angebohrte Feld zählt schon als leer: sein Rand bleibt, nur der Kern wird abgetragen.
    const rimmed = (x, y) => x >= 0 && x < w.width && y >= 5 && y <= H - 13 && (w.get(x, y) === 0 || isDig(x, y));
    // Für die Vorlagen zählt alles Nicht-Leere als fest (auch außerhalb der Welt). Das angebohrte Feld
    // (-100) ist für die Nachbarn weiter fest, ihre Ränder bleiben stehen; sie ändern sich erst mit
    // doneDigging (3x3-reloadTile), wenn das Feld 0 wird. Nur das Feld, aus dem der Pod kommt, öffnet
    // sich zum Bohrfeld. Im Original erst ab der Hälfte (reloadTile in der Bohranimation), hier sofort:
    // der Pod sinkt ins Bohrfeld und würde in 2.5D sonst hinter dem stehengebliebenen Rand verschwinden.
    const srcX = digging ? pod.digX - (pod.dig.dir === 'down' ? 0 : pod.dig.xDir) : 0;
    const srcY = digging ? pod.digY - (pod.dig.dir === 'down' ? 1 : 0) : 0;
    const full = (x, y, fromX, fromY) => {
      const t = w.get(x, y);
      if (isDig(x, y)) return !(fromX === srcX && fromY === srcY);
      return t === undefined || t !== 0;
    };
    // Freie Seite eines festen Tiles: nur zu Hohlräumen ohne Tunnelrand (Himmel, Kern)
    const open = (x, y) => {
      if (x < 0 || x >= w.width || y >= H) return false;
      if (y < 0) return true;
      const t = w.get(x, y);
      return !(t !== 0 && t > -100) && !rimmed(x, y);
    };
    const maskAt = (x, y) =>
      (open(x, y - 1) ? UP : 0) | (open(x + 1, y) ? RIGHT : 0) |
      (open(x, y + 1) ? DOWN : 0) | (open(x - 1, y) ? LEFT : 0);

    const put = (kind, variant, x, y, sx = 1, sy = 1, ox = 0, oy = 0, color = null, oz = 0) => {
      const mesh = this.meshes[kind][variant];
      const i = counts[kind][variant];
      if (i >= mesh.instanceMatrix.count) return;
      P.set(x + ox, -y + oy, oz);
      S.set(sx, sy, 1);
      M.compose(P, id, S);
      mesh.setMatrixAt(i, M);
      if (color && mesh.instanceColor) mesh.setColorAt(i, color);
      counts[kind][variant] = i + 1;
    };
    const rimCounts = new Map();
    const lavaSpots = [];
    // Randmuster je Feld merken; fallen Randstücke weg, an ihrer Stelle Staub aufwirbeln
    const prevKeys = this.rimKeys || new Map();
    const nextKeys = new Map();
    const SUB = [-0.5 + RIM / 2, 0, 0.5 - RIM / 2];
    const putRim = (x, y) => {
      const f = (nx, ny) => full(nx, ny, x, y);
      let n = (f(x - 1, y - 1) ? 1 : 0) | (f(x, y - 1) ? 2 : 0) | (f(x + 1, y - 1) ? 4 : 0) |
        (f(x - 1, y) ? 8 : 0) | (f(x + 1, y) ? 16 : 0) |
        (f(x - 1, y + 1) ? 32 : 0) | (f(x, y + 1) ? 64 : 0) | (f(x + 1, y + 1) ? 128 : 0);
      // Angebohrtes Feld ("Half"-Grafik im Original): unabhängig von den Nachbarn bleiben alle Wände
      // stehen, offen ist nur die Seite, von der der Pod kommt. Erst doneDigging lädt die Umgebung neu.
      if (isDig(x, y)) n = 0xff & ~(pod.dig.dir === 'down' ? 2 : pod.dig.xDir > 0 ? 8 : 16);
      const key = rimPattern(n);
      const idx = x * H + y;
      const prev = prevKeys.get(idx);
      nextKeys.set(idx, key);
      if (prev !== undefined && (prev & ~key)) {
        const removed = prev & ~key;
        const col = depthColor(y, new THREE.Color());
        for (let i = 0; i < 9; i++) {
          if (!((removed >> i) & 1)) continue;
          this.spawnDust(x + SUB[i % 3], -y + SUB[Math.floor(i / 3)], col, i === 4 ? 1 : 2);
        }
      }
      const mesh = this.rimMesh(key);
      if (!mesh) return;
      const i = rimCounts.get(mesh) || 0;
      if (i >= mesh.instanceMatrix.count) return;
      P.set(x, -y, 0);
      S.set(1, 1, 1);
      M.compose(P, id, S);
      mesh.setMatrixAt(i, M);
      mesh.setColorAt(i, depthColor(y, C));
      rimCounts.set(mesh, i + 1);
    };

    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        let t = w.get(x, y);
        let sx = 1, sy = 1, ox = 0, oy = 0, oz = 0, mask = 0;
        if (rimmed(x, y)) putRim(x, y);
        if (t === T.DIGGING) {
          if (!isDig(x, y)) continue;
          // Kern des angebohrten Tiles schrumpft in Bohrrichtung, knapp hinter dem Rand
          t = game.dugTile;
          const left = Math.max(0.001, 1 - prog);
          if (pod.dig.dir === 'down') { sy = left; oy = -(1 - left) / 2; }
          else { sx = left; ox = (pod.dig.xDir * (1 - left)) / 2; }
          oz = -0.02;
        } else {
          if (t === 0 || t === undefined || t <= -100) continue;
          mask = maskAt(x, y);
        }

        if ((t >= 1 && t <= 5) || t === T.GAS || (t >= 6 && t <= 19)) {
          put('dirt', mask, x, y, sx, sy, ox, oy, depthColor(y, C), oz);
          if (t >= 6 && t <= 19) {
            if (isDig(x, y)) {
              // Drehung vom Bohrbeginn merken (das Original setzt sie bei halbem Fortschritt neu)
              const key = `${x},${y}`;
              if (this.digGem?.key !== key) this.digGem = { key, rot: w.rotation(x, y), crumbled: new Set() };
              this.placeGems(t - 6, x, y, this.digGem.rot, gemCounts, { prog, dir: pod.dig.dir, xDir: pod.dig.xDir });
            } else {
              this.placeGems(t - 6, x, y, w.rotation(x, y), gemCounts);
            }
          }
        } else if (t >= 25 && t <= 27) {
          // Fels: Brocken, eingebettet in Erde
          put('dirt', mask, x, y, 1, 1, 0, 0, depthColor(y, C));
          C.setScalar(0.8 + (t - 25) * 0.1);
          const s = 0.92 + hash(x, y, 9) * 0.08;
          put('rock', boulderVariant(x, y), x, y, s, s, 0, 0, C, ROCK_Z);
        } else if (t >= 28 && t <= 30) {
          // Magma in Erde eingebettet: Rand aus Erdreich, darin verkohlte Kruste und die glühende Blase.
          // Beim Anbohren schrumpft alles gemeinsam mit dem Kern.
          put('dirt', mask, x, y, sx, sy, ox, oy, depthColor(y, C), oz);
          const v = Math.floor(hash(x, y, 5) * LAVA_SHAPES);
          if (!isDig(x, y)) lavaSpots.push([x, y]);
          put('crust', v, x, y, sx, sy, ox, oy, null, oz);
          put('lava', v, x, y, sx, sy, ox, oy, null, oz);
        } else if (t === -1 || t === -2) {
          put('dirt', mask, x, y, sx, sy, ox, oy, depthColor(y, C), oz); // Oberflächen-Tile (im Original Gras)
        } else if (t <= -3 && t >= -5) {
          // -3 linkes Ende, -4 Mitte, -5 rechtes Ende; Varianten reihum (gemischt), damit Nachbarplatten nie gleich aussehen
          put('pave', (-4 - t) + 1 + 3 * [2, 0, 3, 1][x % PAVE_VARIANTS], x, y);
        } else if (t === -6 || t === -7) {
          put('dirt', mask, x, y, 1, 1, 0, 0, C.setRGB(0.3, 0.2, 0.18));
        } else if (t === -8) {
          put('dirt', mask, x, y, 1, 1, 0, 0, C.setRGB(0.04, 0.02, 0.02));
        } else if (t <= -9 && t >= -12) {
          put('dirt', mask, x, y, 1, 1, 0, 0, C.setRGB(0.5, 0.08, 0.05));
        }
      }
    }
    this.rimKeys = nextKeys;
    this.lavaSpots = lavaSpots;
    for (const mesh of this.rims.values()) {
      if (!mesh) continue;
      mesh.count = rimCounts.get(mesh) || 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    for (const k in this.meshes) {
      this.meshes[k].forEach((m, i) => {
        m.count = counts[k][i];
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      });
    }
    this.gems.forEach((m, i) => { m.count = gemCounts[i]; m.instanceMatrix.needsUpdate = true; });
    this.glow.count = this.glowCount;
    this.glow.instanceMatrix.needsUpdate = true;
    if (this.glow.instanceColor) this.glow.instanceColor.needsUpdate = true;
  }

  // Instanz-Mesh für ein Tunnelrand-Muster (wird beim ersten Bedarf erzeugt)
  rimMesh(key) {
    if (!this.rims) this.rims = new Map();
    if (this.rims.has(key)) return this.rims.get(key);
    const geo = rimGeometry(key);
    let mesh = null;
    if (geo) {
      mesh = new THREE.InstancedMesh(geo, this.mats.dirt, 160);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(160 * 3), 3);
      mesh.frustumCulled = false;
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.count = 0;
      this.scene.add(mesh);
    }
    this.rims.set(key, mesh);
    return mesh;
  }

  // Lichtschein eines Mineral-Tiles: wertvollere Mineralien leuchten etwas stärker, jedes pulsiert phasenversetzt
  placeGlow(kind, x, y, fade = 1) {
    const i = this.glowCount;
    if (i >= this.glow.instanceMatrix.count) return;
    const phase = hash(x, y, 21) * Math.PI * 2;
    const pulse = 0.85 + 0.15 * Math.sin(this.time * 1.6 + phase);
    const strength = MINERAL_LOOK[kind].glow * pulse * fade;
    const size = 1.15 + 0.1 * Math.sin(this.time * 1.1 + phase);
    this.tmpP.set(x, -y, 0.53);
    this.tmpS.set(size, size, 1);
    this.tmpM.compose(this.tmpP, new THREE.Quaternion(), this.tmpS);
    this.glow.setMatrixAt(i, this.tmpM);
    this.glow.setColorAt(i, this.tmpC.setHex(MINERAL_LOOK[kind].color).multiplyScalar(strength));
    this.glowCount = i + 1;
  }

  // dig (optional): { prog, dir, xDir } für das angebohrte Tile. Die Bohrfront trägt das Tile von der
  // Pod-Seite her ab; Kristalle vor der Front zittern und schrumpfen, erreichte Kristalle zerbröseln.
  placeGems(kind, x, y, rot, gemCounts, dig = null) {
    this.placeGlow(kind, x, y, dig ? Math.max(0, 1 - dig.prog) : 1);
    const mesh = this.gems[kind], look = MINERAL_LOOK[kind];
    const [cMin, cMax] = look.count;
    const n = cMin + Math.floor(hash(x, y, 3) * (cMax - cMin + 1));
    const M = this.tmpM, P = this.tmpP, S = this.tmpS, Q = this.tmpQ, E = this.tmpE;
    for (let k = 0; k < n; k++) {
      const i = gemCounts[kind];
      if (i >= mesh.instanceMatrix.count) return;
      const a = rot * Math.PI / 2 + k * (Math.PI * 2 / n) + hash(x, y, k) * 0.9;
      const r = n === 1 ? 0 : (look.radial ? 0.05 : 0.15) + hash(x, y, k + 7) * 0.1;
      const size = look.size * (0.8 + hash(x, y, k + 11) * 0.5);
      const ox = Math.cos(a) * r, oy = Math.sin(a) * r;
      let shake = 0;
      if (dig) {
        // Abstand des Kristalls vor der Bohrfront (0 = Front erreicht)
        const depth = dig.dir === 'down' ? 0.5 - oy : dig.xDir > 0 ? ox + 0.5 : 0.5 - ox;
        const ahead = depth - dig.prog;
        if (ahead <= 0) {
          if (!this.digGem.crumbled.has(k)) {
            this.digGem.crumbled.add(k);
            this.spawnShards(x + ox, -y + oy, kind);
          }
          continue;
        }
        shake = Math.max(0, 1 - ahead / 0.25);
      }
      P.set(x + ox + (Math.random() - 0.5) * 0.04 * shake, -y + oy + (Math.random() - 0.5) * 0.04 * shake, 0.5);
      const wobble = shake * (Math.random() - 0.5) * 0.6;
      // Nadeln, Stäbe und Spitzen strahlen vom Tile-Mittelpunkt nach außen, leicht zur Kamera geneigt
      if (look.radial) E.set(0.35 + hash(x, y, k + 1) * 0.5 + wobble, hash(x, y, k + 2) * 1.2, a - Math.PI / 2);
      // Sonderfunde: aufrecht zur Kamera, leicht schräg; Knochen dürfen beliebig gedreht liegen
      else if (look.upright) E.set(0.25 + wobble, (hash(x, y, k + 2) - 0.5) * 0.7, look.spin ? a : (hash(x, y, k + 1) - 0.5) * 0.35);
      else E.set(hash(x, y, k + 1) * 3 + wobble, hash(x, y, k + 2) * 3, a);
      Q.setFromEuler(E);
      S.set(size * look.stretch[0], size * look.stretch[1], size * look.stretch[2]);
      S.multiplyScalar(1 - 0.35 * shake);
      M.compose(P, Q, S);
      mesh.setMatrixAt(i, M);
      gemCounts[kind] = i + 1;
    }
  }

  // ---------- Lava ----------
  // Fließende Oberfläche: zwei gegeneinander wandernde, verwirbelte Lagen der Lava-Textur werden
  // überblendet; helle Adern wandern langsam darüber. Die Zeit kommt aus this.lavaTime (updateLava).
  animateLava(mat) {
    this.lavaTime = { value: 0 };
    const worldUVCompile = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, renderer) => {
      worldUVCompile(shader, renderer);
      shader.uniforms.uLavaTime = this.lavaTime;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
uniform float uLavaTime;
vec4 lavaCol;`)
        .replace('#include <map_fragment>', `
          {
            float t = uLavaTime;
            vec2 uv = vMapUv;
            vec2 swirl = vec2(sin(uv.y * 9.0 + t * 1.1), cos(uv.x * 8.0 - t * 0.9)) * 0.035;
            vec4 a = texture2D(map, uv + swirl + vec2(t * 0.020, t * 0.012));
            vec4 b = texture2D(map, uv * 1.35 - swirl.yx + vec2(-t * 0.016, t * 0.022));
            float m = 0.5 + 0.5 * sin(t * 0.8 + uv.x * 4.0 + uv.y * 3.0);
            lavaCol = mix(a, b, m);
            // helle Adern, die langsam über die Oberfläche ziehen
            float vein = sin(uv.x * 14.0 + sin(uv.y * 11.0 + t * 1.3) * 1.8 - t * 1.6);
            lavaCol.rgb += vec3(0.35, 0.22, 0.05) * smoothstep(0.82, 1.0, vein);
            diffuseColor *= lavaCol;
          }`)
        .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance *= lavaCol.rgb;');
    };
    mat.customProgramCacheKey = () => 'lavaFlow';
  }

  // Blasen, die in sichtbaren Magmaeinschlüssen aufsteigen und platzen (Positionen aus updateTerrain)
  updateLava(dt) {
    this.lavaTime.value = this.time;
    if (!this.bubbles) {
      const geo = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2); // Halbkugel
      geo.rotateX(Math.PI / 2); // Wölbung zeigt zur Kamera (+Z)
      const mat = new THREE.MeshStandardMaterial({ color: 0xff8a20, emissive: 0xff5a00, emissiveIntensity: 1.6, roughness: 0.3 });
      this.bubbles = [...Array(24)].map(() => {
        const m = new THREE.Mesh(geo, mat);
        m.visible = false;
        this.scene.add(m);
        return m;
      });
    }
    const spots = this.lavaSpots || [];
    // ungefähr eine neue Blase pro Einschluss alle 1,5 s
    let n = spots.length * dt / 1.5;
    while (n > 0 && spots.length) {
      if (Math.random() < n) {
        const b = this.bubbles.find((x) => !x.visible);
        if (!b) break;
        const [x, y] = spots[Math.floor(Math.random() * spots.length)];
        const a = Math.random() * Math.PI * 2, r = Math.random() * 0.2;
        b.position.set(x + Math.cos(a) * r, -y + Math.sin(a) * r, 0.52);
        b.userData = { age: 0, life: 0.6 + Math.random() * 0.8, size: 0.04 + Math.random() * 0.06 };
        b.visible = true;
      }
      n -= 1;
    }
    for (const b of this.bubbles) {
      if (!b.visible) continue;
      const u = b.userData;
      u.age += dt;
      const t = u.age / u.life;
      if (t >= 1) {
        b.visible = false;
        // Platzen: ein paar glühende Spritzer
        this.spawnSpatter(b.position, 1 + Math.floor(Math.random() * 3));
        continue;
      }
      const s = u.size * Math.sqrt(t) * (t > 0.85 ? 1 + (t - 0.85) * 3 : 1);
      b.scale.set(s, s, s * 0.6);
    }
  }

  // Glühende Lavatropfen (teilen Geometrie und Material, fallen mit der Partikel-Schwerkraft)
  spawnSpatter(pos, n) {
    this.spatterGeo ??= new THREE.SphereGeometry(0.018, 6, 4);
    this.spatterMat ??= new THREE.MeshStandardMaterial({ color: 0xffa030, emissive: 0xff6a00, emissiveIntensity: 2 });
    for (let i = 0; i < n && this.particles.length < 300; i++) {
      const m = new THREE.Mesh(this.spatterGeo, this.spatterMat);
      m.position.set(pos.x, pos.y, pos.z + 0.02);
      m.userData.v = new THREE.Vector3((Math.random() - 0.5) * 0.03, 0.02 + Math.random() * 0.025, 0.01);
      m.userData.life = 14 + Math.random() * 10;
      m.userData.sharedMat = true;
      this.scene.add(m);
      this.particles.push(m);
    }
  }

  // ---------- Partikel ----------
  // ---------- Abgase ----------
  // Wie addSteam im Original: Wölkchen hinten oben am Pod, zufällig gedreht, 20 Frames Lebensdauer,
  // höchstens 11 gleichzeitig (das älteste wird ersetzt). Sie bleiben in der Welt stehen.
  spawnPuff() {
    if (!this.smokeTex) this.smokeTex = smokeTexture();
    if (!this.puffs) this.puffs = [];
    let puff;
    if (this.puffs.length >= 11) {
      puff = this.puffs.shift();
    } else {
      puff = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, transparent: true, depthWrite: false }));
      this.scene.add(puff);
    }
    this.pod.exhaustPoint.getWorldPosition(puff.position);
    puff.position.x += (Math.random() - 0.5) * 0.06;
    puff.material.rotation = THREE.MathUtils.degToRad(Math.random() * 40 - 20);
    puff.userData = { age: 0, drift: (Math.random() - 0.5) * 0.15, y0: puff.position.y };
    puff.visible = true;
    this.puffs.push(puff);
  }

  // Staub, wenn Tunnelränder verschwinden: aufquellende, langsam absinkende Wolken in Erdfarbe
  spawnDust(x, y, color, n = 2) {
    if (!this.smokeTex) this.smokeTex = smokeTexture();
    if (!this.dust) this.dust = [];
    for (let k = 0; k < n; k++) {
      let d = this.dust.find((p) => !p.visible);
      if (!d) {
        if (this.dust.length >= 80) d = this.dust.shift(); // älteste ersetzen
        else d = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, transparent: true, depthWrite: false }));
        this.scene.add(d);
      } else {
        this.dust.splice(this.dust.indexOf(d), 1);
      }
      d.position.set(x + (Math.random() - 0.5) * 0.15, y + (Math.random() - 0.5) * 0.15, 0.45 + Math.random() * 0.1);
      d.material.rotation = Math.random() * Math.PI * 2;
      d.userData = {
        age: -Math.random() * 0.12, life: 0.7 + Math.random() * 0.35, color: color.clone().multiplyScalar(1.25),
        vx: (Math.random() - 0.5) * 0.25, vy: 0.05 + Math.random() * 0.12, spin: (Math.random() - 0.5) * 1.5,
        size: 0.35 + Math.random() * 0.25,
      };
      d.visible = true;
      d.scale.set(0.001, 0.001, 1);
      this.dust.push(d);
    }
  }

  updateDust(dt) {
    if (!this.dust) return;
    const light = 0.45 + 0.55 * (this.surfaceLight ?? 1);
    for (const d of this.dust) {
      if (!d.visible) continue;
      const u = d.userData;
      u.age += dt;
      if (u.age < 0) continue;
      const t = u.age / u.life;
      if (t >= 1) { d.visible = false; continue; }
      const size = u.size * (0.4 + 0.8 * Math.sqrt(t));
      d.scale.set(size, size, 1);
      d.position.x += u.vx * dt;
      d.position.y += (u.vy - 0.35 * t) * dt; // erst leicht aufsteigen, dann absinken
      d.material.rotation += u.spin * dt;
      d.material.opacity = 0.75 * Math.min(1, t * 6) * Math.pow(1 - t, 1.4);
      d.material.color.copy(u.color).multiplyScalar(light);
    }
  }

  updatePuffs(dt) {
    if (!this.puffs) return;
    const life = 20 / 42; // 20 Frames bei 42 fps
    const light = 0.35 + 0.65 * (this.surfaceLight ?? 1);
    for (const puff of this.puffs) {
      const u = puff.userData;
      if (!puff.visible) continue;
      u.age += dt;
      const t = u.age / life;
      if (t >= 1) { puff.visible = false; continue; }
      const size = 0.12 + 0.4 * Math.sqrt(t);
      puff.scale.set(size, size, 1);
      puff.position.y = u.y0 + 0.3 * t;
      puff.position.x += u.drift * dt;
      puff.material.opacity = 0.8 * Math.pow(1 - t, 1.2);
      puff.material.color.setRGB(0.36 * light, 0.34 * light, 0.32 * light);
    }
  }

  spawnChunks(xPx, yPx, color, n = 3, speed = 1) {
    for (let i = 0; i < n; i++) {
      if (this.particles.length > 250) break;
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 1 });
      const m = new THREE.Mesh(this.particleGeo, mat);
      m.position.set(toX(xPx) + (Math.random() - 0.5) * 0.3, toY(yPx) + (Math.random() - 0.5) * 0.3, 0.3 + Math.random() * 0.3);
      m.userData.v = new THREE.Vector3((Math.random() - 0.5) * 0.08 * speed, (0.01 + Math.random() * 0.04) * speed, (Math.random() - 0.2) * 0.05 * speed);
      m.userData.life = 30 + Math.random() * 20;
      this.scene.add(m);
      this.particles.push(m);
    }
  }

  // Kristall zerbröselt: kleine Splitter im Material des Minerals springen heraus und fallen herunter
  spawnShards(x, y, kind) {
    if (!this.shardGeo) this.shardGeo = new THREE.OctahedronGeometry(1, 0);
    const n = kind >= 10 ? 10 : 7;
    for (let i = 0; i < n; i++) {
      if (this.particles.length > 300) break;
      const m = new THREE.Mesh(this.shardGeo, this.gemMats[kind]);
      const s = 0.018 + Math.random() * 0.03;
      m.scale.set(s, s * (1 + Math.random()), s);
      m.position.set(x + (Math.random() - 0.5) * 0.08, y + (Math.random() - 0.5) * 0.08, 0.5 + Math.random() * 0.05);
      m.userData.v = new THREE.Vector3((Math.random() - 0.5) * 0.07, 0.02 + Math.random() * 0.05, 0.01 + Math.random() * 0.03);
      m.userData.life = 35 + Math.random() * 25;
      m.userData.sharedMat = true; // Material gehört dem Mineral, nicht wegwerfen
      this.scene.add(m);
      this.particles.push(m);
    }
  }

  // Nach Dynamit/C4: Brocken und Staub in der Farbe jedes gesprengten Tiles. Felsbrocken brechen in ihre
  // Stücke auseinander, die vom Explosionszentrum (cx, cy in px) wegfliegen; power 1 = Dynamit, 1.4 = C4.
  blastDebris(cleared, cx = null, cy = null, power = 1) {
    let sx = 0, sy = 0;
    for (const [x, y] of cleared) { sx += x; sy += y; }
    const ex = cx !== null ? cx / TILE : sx / Math.max(1, cleared.length);
    const ey = cy !== null ? cy / TILE : sy / Math.max(1, cleared.length);
    for (const [x, y, t] of cleared) {
      const c = tileColorHex(t, y);
      if (t >= 25 && t <= 27) {
        this.breakBoulder(x, y, ex, ey, power);
        this.spawnDust(x, -y, new THREE.Color(0x8a8078), 3);
      } else {
        this.spawnChunks(x * TILE, y * TILE, c, 4, 2.2);
        this.spawnDust(x, -y, new THREE.Color(c), 2);
      }
    }
  }

  // Die Stücke des Brockens in Tile (x, y) als einzelne Meshes, weg von (ex, ey) in Tile-Einheiten
  breakBoulder(x, y, ex, ey, power) {
    this.boulderFrags ??= [...Array(BOULDER_VARIANTS)].map((_, v) => boulderFragments(v));
    const s = 0.92 + hash(x, y, 9) * 0.08;
    let dx = x - ex, dy = y - ey;
    const d = Math.hypot(dx, dy);
    if (d < 0.01) { dx = 0; dy = -1; } else { dx /= d; dy /= d; }
    const push = power * (0.09 + 0.05 / (1 + d)); // nah an der Ladung fliegt es weiter
    for (const f of this.boulderFrags[boulderVariant(x, y)]) {
      if (this.debris.length > 260) break;
      const m = new THREE.Mesh(f.geo, this.mats.rockDebris);
      m.position.set(x + f.pos.x * s, -y + f.pos.y * s, ROCK_Z + f.pos.z);
      m.scale.setScalar(s);
      const spread = 0.35 + Math.random() * 0.3;
      m.userData.v = new THREE.Vector3(
        (dx + f.pos.x * 2.5 * spread) * push + (Math.random() - 0.5) * 0.03,
        (-dy + f.pos.y * 2.5 * spread) * push + 0.04 + Math.random() * 0.04,
        0.004 + Math.random() * 0.014);
      m.userData.spin = new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.3);
      m.userData.life = 90 + Math.random() * 50;
      m.userData.scale = s;
      this.scene.add(m);
      this.debris.push(m);
    }
  }

  // Felsstücke: Schwerkraft, Abprallen an festen Tiles (Welt des laufenden Spiels), zum Schluss zerbröseln
  updateDebris(world) {
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const m = this.debris[i], v = m.userData.v, p = m.position;
      v.y -= 0.009;
      v.z *= 0.96;
      const solid = (tx, ty) => world && world.solidTile(Math.round(tx), Math.round(-ty));
      if (solid(p.x + v.x, p.y)) { v.x *= -0.35; v.y *= 0.8; m.userData.spin.multiplyScalar(0.6); }
      if (solid(p.x, p.y + v.y)) {
        v.y *= v.y < 0 ? -0.3 : -0.2;
        v.x *= 0.7;
        m.userData.spin.multiplyScalar(0.5);
        if (Math.abs(v.y) < 0.012) v.y = 0; // liegen bleiben
      }
      p.add(v);
      p.z = Math.min(p.z, 0.65); // nicht zu nah an die Kamera
      m.rotation.x += m.userData.spin.x;
      m.rotation.y += m.userData.spin.y;
      m.rotation.z += m.userData.spin.z;
      const life = --m.userData.life;
      if (life < 25) m.scale.setScalar(m.userData.scale * Math.max(0.01, life / 25)); // zerbröseln
      if (life > 0) continue;
      this.scene.remove(m);
      this.debris.splice(i, 1);
      if (Math.random() < 0.5) this.spawnDust(p.x, p.y, new THREE.Color(0x8a8078), 1);
    }
  }

  explode(xPx, yPx) {
    this.spawnChunks(xPx, yPx, 0xf2a81d, 14, 3);
    this.spawnChunks(xPx, yPx, 0xff5500, 14, 4);
  }

  updateParticles() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const m = this.particles[i];
      const v = m.userData.v;
      v.y -= 0.012;
      m.position.add(v);
      m.rotation.x += 0.2; m.rotation.y += 0.15;
      if (--m.userData.life <= 0) {
        this.scene.remove(m);
        if (!m.userData.sharedMat) m.material.dispose();
        this.particles.splice(i, 1);
      }
    }
  }

  // ---------- Pod ----------
  updatePod(game, px, py) {
    const p = game.pod, pod = this.pod;
    // Lichter des Pods bleiben immer in der Szene (sonst übersetzt three.js alle Shader neu und das
    // Spiel hängt kurz); beim Tod verschwindet nur das Modell, die Lichter gehen in ItemFX.update aus
    if (pod.model) pod.model.visible = p.mod !== 'dead';
    pod.root.position.set(toX(px), toY(py), POD_Z);
    // Der verkleinerte Pod steht auf dem sichtbaren Boden: unter Tage auf dem unteren Tunnelrand,
    // an der Oberfläche (ohne Tunnelrand) direkt auf dem Gras. Ein stehender Pod sitzt physikalisch
    // immer 0.1 Tile unter der Feldmitte, seine Kollisionsbox reicht 0.4 nach unten.
    const w = game.world, cx = Math.round(px / TILE), cy = Math.round(py / TILE);
    const t = w.get(cx, cy);
    const rimmed = cy >= 5 && cy <= w.height - 13 && !(t !== 0 && t > -100);
    const targetY = -0.4 + 0.4 * POD_SCALE + (rimmed ? RIM : 0);
    pod.offsetY = pod.offsetY === undefined ? targetY : pod.offsetY + (targetY - pod.offsetY) * 0.25;
    pod.yaw.position.y = pod.offsetY;
    pod.yaw.scale.setScalar(POD_SCALE);
    pod.root.rotation.z = -THREE.MathUtils.degToRad(p.rotation);

    // Blickrichtung: Modell schaut nach +X; beim Wenden durch die Kamera hindurch drehen
    let target = pod.turnAngle;
    if (p.facing === 'right') target = 0;
    else if (p.facing === 'left') target = Math.PI;
    else if (p.anim && p.anim.type === 'turn') {
      const f = p.anim.frame / 4;
      target = p.facing === 'turning_right' ? Math.PI * (1 - f) : Math.PI * f;
    }
    pod.turnAngle += (target - pod.turnAngle) * 0.5;
    pod.yaw.rotation.y = -pod.turnAngle;

    const air = p.mod === 'air' || p.mod === 'launching' || p.mod === 'landing' || p.mod === 'digdownlaunching';
    pod.rotor.visible = air || p.rotorVel > 0.5;
    pod.rotor.rotateY((p.rotorVel + (air ? 2 : 0)) * 0.12);
    let rs = 1;
    if (p.anim && (p.anim.type === 'launch' || p.anim.type === 'digdownlaunch' || p.anim.type === 'digacrosslaunch')) rs = p.anim.frame / 10;
    else if (p.anim && p.anim.type === 'land') rs = 1 - p.anim.frame / 10;
    else if (!air) rs = 0;
    pod.rotor.scale.setScalar(Math.max(0.05, rs));

    // Bohrer drehen sich um ihre Längsachse (bei Kegel und Blender-Modell die lokale Y-Achse)
    const digDir = p.dig ? p.dig.dir : null;
    // Immer nur ein Bohrer sichtbar (im Original zeigt digDownMC den Pod mit Bohrer unten)
    pod.drillDown.visible = digDir === 'down';
    pod.drillSide.visible = digDir !== 'down';
    pod.drillSide.scale.setScalar(pod.drillScale * (digDir === 'across' ? 1.25 : 1));
    if (digDir === 'down') pod.drillDown.rotateY(0.6);
    if (digDir === 'across') pod.drillSide.rotateY(0.6);

    // Räder rollen mit der tatsächlichen Bewegung am Boden
    const dx = px - (pod.lastPx ?? px);
    pod.lastPx = px;
    if (pod.wheels.length && !air) {
      const forward = dx * U * (p.facing === 'left' || p.facing === 'turning_right' ? -1 : 1);
      for (const wh of pod.wheels) wh.rotateZ(-forward / (0.066 * POD_SCALE));
    }
  }

  // Alle sichtbaren Teile des Pods auf die eigene Render-Ebene legen (Lichter bleiben auf allen Ebenen)
  putOnPodLayer(obj) {
    obj.traverse((o) => { if (!o.isLight) o.layers.set(POD_LAYER); });
  }

  // Pod-Modell (assets/pod.glb) in das Gerüst aus buildPod() einsetzen
  applyPodModel(gltf) {
    const pod = this.pod, model = gltf.scene;
    model.traverse((o) => {
      if (!o.isMesh) return;
      if (o.material.transparent) o.material.depthWrite = false; // Cockpitglas
      // ohne Umgebungs-Spiegelung wirken rein metallische Flächen schwarz
      o.material.metalness = Math.min(o.material.metalness, 0.45);
    });
    pod.yaw.add(model);
    this.putOnPodLayer(model);
    pod.model = model; // zum Ausblenden (Tod, Teleport) nur das Modell verstecken, nie die Lichter
    pod.rotor = model.getObjectByName('Rotor');
    pod.drillSide = model.getObjectByName('DrillSide');
    pod.drillDown = model.getObjectByName('DrillDown');
    pod.wheels = [];
    model.traverse((o) => { if (o.name.startsWith('Wheel_')) pod.wheels.push(o); });
    pod.drillScale = 1;
  }

  // ---------- Upgrades am Pod: Bohrkopf und Lackierung ----------
  applyUpgrades(gltf) {
    this.drillProtos = [];
    for (const o of gltf.scene.children) {
      const m = /^Up_drill_(\d+)$/.exec(o.name);
      if (!m) continue;
      o.traverse((c) => {
        if (!c.isMesh) return;
        c.material.metalness = Math.min(c.material.metalness, 0.45);
        c.material.clippingPlanes = [this.itemFx.clip]; // wie der übrige Pod (Materietransmitter)
      });
      this.drillProtos[+m[1]] = o;
    }
  }

  // Bei jedem Bild aufrufen; baut nur um, wenn sich eine Stufe geändert hat
  updateUpgrades(game, time) {
    const pod = this.pod, up = game.up;
    if (!pod.rotor || !this.drillProtos) return;
    if (pod.drillLevel !== up.drill) {
      pod.drillLevel = up.drill;
      for (const d of [pod.drillSide, pod.drillDown]) {
        // Originalgeometrie aus pod.glb ausblenden, gewählten Bohrkopf einsetzen (gleiche Achse: lokal +Y)
        d.userData.stock ??= d.children.slice();
        for (const c of d.userData.stock) c.visible = false;
        if (d.userData.bit) d.remove(d.userData.bit);
        d.userData.bit = this.drillProtos[up.drill].clone();
        d.add(d.userData.bit);
        this.putOnPodLayer(d.userData.bit);
      }
    }
    if (pod.hullLevel !== up.hull) {
      pod.hullLevel = up.hull;
      if (!pod.paint) {
        pod.paint = [];
        pod.yaw.traverse((o) => {
          if (o.isMesh && (o.material.name === 'Paint' || o.material.name === 'PaintDark') && !pod.paint.some((p) => p.mat === o.material)) {
            const m = o.material;
            pod.paint.push({ mat: m, dark: m.name === 'PaintDark', color: m.color.clone(), metal: m.metalness, rough: m.roughness });
          }
        });
      }
      const look = HULL_LOOK[up.hull];
      for (const p of pod.paint) {
        if (look) p.mat.color.setHex(look.color).multiplyScalar(p.dark ? 0.6 : 1);
        else p.mat.color.copy(p.color);
        p.mat.metalness = look ? look.metal : p.metal;
        p.mat.roughness = look ? look.rough : p.rough;
        p.mat.emissive.setHex(look?.emissive ?? 0);
      }
      if (look?.shield && !pod.shield) {
        // Energieschild: schwach leuchtende Blase um den Pod
        pod.shield = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshBasicMaterial({
          color: 0x40c8ff, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        pod.shield.scale.set(0.62, 0.5, 0.42);
        pod.shield.position.set(0.04, 0.02, 0);
        pod.model.add(pod.shield); // verschwindet mit dem Modell (Tod, Teleport)
        this.putOnPodLayer(pod.shield);
      }
      if (pod.shield) pod.shield.visible = !!look?.shield;
    }
    if (pod.shield?.visible) pod.shield.material.opacity = 0.07 + 0.04 * Math.sin(time * 3.1) + 0.02 * Math.sin(time * 11.7);
  }

  // ---------- Himmel: Sonne, Mond, Sterne ----------
  setupCosmos() {
    const disc = (color, size) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(), color, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
      }));
      sp.scale.set(size, size, 1);
      this.surface.add(sp);
      return sp;
    };
    this.sunDisc = disc(0xfff0d0, 14);
    this.sunCore = disc(0xffffff, 5);
    this.moonDisc = disc(0xc8d0e0, 6);
    // Sterne auf einer fernen Kuppel über dem Horizont
    const n = 700, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = hash(i, 1, 77) * Math.PI, e = 0.03 + hash(i, 2, 77) * 0.9;
      pos[i * 3] = EARTH_WIDTH / 2 + Math.cos(a) * 160 * Math.cos(e);
      pos[i * 3 + 1] = -4.5 + Math.sin(e) * 90;
      pos[i * 3 + 2] = -95 - Math.sin(a) * 30;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false,
    }));
    this.surface.add(this.stars);
    this.sunDir = new THREE.Vector3(-0.5, 0.8, 0.6).normalize();
  }

  // Wie updateCosmos/updateBg im Original: Sonne von Tagesanfang bis zur Hälfte, danach Mond, jeweils im
  // Bogen über den Himmel; Helligkeit als Dreieck mit Maximum zu Mittag (1/4) und Minimum um Mitternacht (3/4).
  updateCosmos(dayTime) {
    const f = dayTime / DAY_LENGTH;
    const d = (f - 0.25 + 1) % 1;
    const day = d <= 0.5 ? 1 - d * 2 : (d - 0.5) * 2;
    // Himmelsfarbe: Nacht -> bläuliche Dämmerung -> Tag
    if (day < 0.5) this.curSky.copy(this.nightSky).lerp(this.duskSky, day / 0.5);
    else this.curSky.copy(this.duskSky).lerp(this.skyColor, (day - 0.5) / 0.5);
    // Bogen: Sonne für f in [0, 0.5), Mond für [0.5, 1)
    const place = (sprite, t, h) => {
      const x = EARTH_WIDTH / 2 + (t - 0.5) * 150;
      const y = -4.5 - 6 + Math.sin(t * Math.PI) * h;
      sprite.position.set(x, y, -110);
    };
    const sunUp = f < 0.5, t = sunUp ? f / 0.5 : (f - 0.5) / 0.5;
    this.sunDisc.visible = this.sunCore.visible = sunUp;
    this.moonDisc.visible = !sunUp;
    if (sunUp) {
      place(this.sunDisc, t, 30);
      this.sunCore.position.copy(this.sunDisc.position);
      this.sunDisc.material.opacity = 0.35 + 0.4 * day;
      // Lichtrichtung folgt der Sonne (tief am Morgen/Abend, steil zu Mittag)
      this.sunDir.set((t - 0.5) * 1.6, Math.max(0.15, Math.sin(t * Math.PI)), 0.6).normalize();
    } else {
      place(this.moonDisc, t, 26);
      this.sunDir.set((t - 0.5) * 1.6, Math.max(0.15, Math.sin(t * Math.PI)), 0.6).normalize();
    }
    this.stars.material.opacity = Math.pow(Math.max(0, 1 - day * 1.6), 1.5) * 0.9;
    return day;
  }

  // ---------- Kamera & Licht ----------
  updateCamera(px, py, snap) {
    // Im Endkampf weiter weg und höher, damit der Boss (bis 5 Tiles hoch) ganz ins Bild passt
    const lift = this.battleView ?? 0;
    const dist = this.camDist * (1 + 0.28 * lift);
    const tx = toX(px), ty = toY(py) + 1.7 * lift;
    const halfW = this.viewHalfWidth(dist);
    const minX = -0.5 + halfW, maxX = EARTH_WIDTH - 0.5 - halfW;
    const cx = minX < maxX ? Math.min(Math.max(tx, minX), maxX) : EARTH_WIDTH / 2;
    const k = snap ? 1 : 0.12;
    this.cam.x += (cx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
    this.camera.position.set(this.cam.x, this.cam.y + dist * 0.16, dist);
    this.camera.lookAt(this.cam.x, this.cam.y + 0.2, 0);
  }

  // Halbe Sichtbreite auf Höhe der Vorderkante der Tiles (z = 0.5): der Fels außerhalb der Karte beginnt dort,
  // bleibt so außerhalb des Bildes und verdeckt dahinter alles jenseits des Kartenrands. Die Kamera schaut leicht
  // nach unten, daher hängt die Breite von der Bildhöhe ab – die breitere der beiden rechten Ecken zählt.
  viewHalfWidth(dist) {
    const c = this.camera, v = (this.edgeV ??= new THREE.Vector3());
    c.position.set(0, dist * 0.16, dist);
    c.lookAt(0, 0.2, 0);
    c.updateMatrixWorld();
    let half = 0;
    for (const ny of [1, -1]) {
      v.set(1, ny, 0.5).unproject(c).sub(c.position);
      half = Math.max(half, c.position.x + v.x * (0.5 - c.position.z) / v.z);
    }
    return half;
  }

  updateLighting(game) {
    const tileY = game.pod.y / TILE;
    const s = THREE.MathUtils.clamp(1 - (tileY - 4) / 7, 0, 1); // 1 = Oberfläche, 0 = tief unten
    this.surfaceLight = s;
    const day = this.updateCosmos(game.dayTime ?? DAY_LENGTH / 4); // 1 = Mittag, 0 = Mitternacht
    this.sun.intensity = 2.2 * s * Math.max(0, day * 1.2 - 0.1);
    // unter Tage festes Grundlicht, an der Oberfläche nach Tageszeit (nachts dunkel, mittags hell)
    this.hemi.intensity = 0.6 * (1 - s) + s * (0.3 + 0.9 * day);
    this.sun.target.position.set(this.cam.x, this.cam.y, 0);
    this.sun.position.copy(this.sunDir).multiplyScalar(12).add(this.sun.target.position);
    const deep = THREE.MathUtils.clamp((tileY - 5) / 500, 0, 1);
    // Scheinwerfer unter Tage, nachts auch an der Oberfläche
    const lights = Math.max(1 - s, (1 - day) * 0.85);
    this.pod.lamp.intensity = lights * 3;
    this.pod.spot.intensity = lights * 18;
    this.ambient.intensity = 0.04 + (1 - deep) * 0.04;
    this.mats.back.emissiveIntensity = (1 - s) * (BACK_GLOW_MIN + (BACK_GLOW_MAX - BACK_GLOW_MIN) * deep);
    const bg = this.scene.background;
    bg.copy(this.deepColor).lerp(this.curSky, s);
    this.scene.fog.color.copy(bg);
    this.scene.fog.near = 8 + s * 6;   // an der Oberfläche Luftperspektive: Entferntes wird dunstig
    this.scene.fog.far = 18 + s * 40;
    this.surface.visible = tileY < 20;
    this.mats.lava.emissiveIntensity = 0.8 + Math.sin(this.time * 3) * 0.25;
    this.mats.crust.emissiveIntensity = 0.6 + Math.sin(this.time * 3 - 0.6) * 0.3;
    // Leuchtschrift: meist an, gelegentlich kurzes unruhiges Flackern
    for (const f of this.flickers) {
      const t = this.time + f.seed;
      const glitch = Math.sin(t * 0.7) > 0.93 || Math.sin(t * 1.9 + 1) > 0.97;
      f.mat.emissiveIntensity = glitch ? f.base * (Math.sin(t * 60) > 0 ? 0.15 : 0.8) : f.base;
    }
    // Werbetafel: tagsüber nur Sonnenlicht, nachts von den Strahlern angeleuchtet
    if (this.billboard) {
      const night = 1 - day;
      this.billboard.posterMat.emissiveIntensity = 0.08 + night * 0.5;
      this.billboard.lampGlow.emissiveIntensity = 0.3 + night * 3;
    }
    // Warnleuchten blinken im Sekundentakt
    for (const b of this.blinkers) b.light.intensity = ((this.time + b.phase) % 1.2) < 0.5 ? b.base : 0;
    // Schweißen: ca. 2.5 s Schub mit zufälligen Blitzen, dann 1.5 s Pause
    for (const w of this.welds) {
      const active = (this.time % 4) < 2.5;
      const f = active ? (Math.random() < 0.7 ? 0.4 + Math.random() * 0.9 : 0.05) : 0.03;
      w.mat.emissiveIntensity = w.base * f;
      if (w.light) w.light.light.intensity = w.light.base * f;
    }
    this.gemMats[5].emissiveIntensity = 0.8 + Math.sin(this.time * 5) * 0.4;
  }

  project(xPx, yPx) {
    const v = new THREE.Vector3(toX(xPx), toY(yPx), 0).project(this.camera);
    return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight };
  }

  render(game, alpha, dt) {
    this.time += dt;
    const p = game.pod;
    const px = p.prevX + (p.x - p.prevX) * alpha;
    const py = p.prevY + (p.y - p.prevY) * alpha;
    this.battleView = (this.battleView ?? 0) + ((game.battle ? 1 : 0) - (this.battleView ?? 0)) * Math.min(1, dt * 1.5);
    this.updateCamera(px, py, this.snapNext);
    this.snapNext = false;
    this.updateTerrain(game);
    this.updatePod(game, px, py);
    this.updateUpgrades(game, this.time);
    this.updateSavePod(game, dt);
    this.updateLighting(game);
    this.itemFx.update(game, alpha, dt);
    // Erdbeben (quakeFX): im Original zittert nur das Erdreich (earthMC.e um +x/+y px, also nach rechts unten),
    // der Pod bleibt stehen. Hier: Kamera versetzen und den Pod mitnehmen, damit er auf dem Bildschirm ruht.
    const quake = game.quakeOffset;
    if (quake) {
      const d = toX(quake);
      this.camera.position.x -= d;
      this.camera.position.y += d;
      this.pod.root.position.x -= d;
      this.pod.root.position.y += d;
    }
    this.shipAudio = this.dropship.update(game, alpha, dt, this.time);
    this.boss.update(game, alpha, dt, this.time);
    this.updateParticles();
    this.updateDebris(game.world);
    this.updatePuffs(dt);
    this.updateDust(dt);
    this.updateLava(dt);
    // Wie im Original liegt der Pod immer über dem Erdreich: erst die Welt (Ebene 0) zeichnen,
    // dann den Tiefenpuffer leeren und den Pod (Ebene 1) mit derselben Beleuchtung darüberlegen.
    const r = this.renderer, bg = this.scene.background;
    r.autoClear = false;
    r.clear();
    this.scene.traverse((o) => { if (o.isLight) o.layers.enableAll(); });
    this.camera.layers.set(0);
    r.render(this.scene, this.camera);
    r.clearDepth();
    this.scene.background = null;
    this.camera.layers.set(POD_LAYER);
    r.render(this.scene, this.camera);
    this.scene.background = bg;
  }
}

export function tileColorHex(t, y) {
  if (t >= 28 && t <= 30) return 0xff6a00;
  if (t >= 25 && t <= 27) return 0x6b6560;
  if (t >= 6 && t <= 19) return MINERAL_LOOK[t - 6].color;
  return depthColor(y, new THREE.Color()).getHex();
}
