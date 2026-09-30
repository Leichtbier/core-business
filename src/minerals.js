import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Aussehen der Mineralien (Index = Tile-ID - 6, wie MINERALS in constants.js). Jede Sorte hat eine eigene
// Form, damit sie sich nicht nur über die Farbe unterscheidet:
//   shape    Kristallform (mineralGeometry)
//   count    Anzahl Kristalle pro Tile [min, max]
//   size     Grundgröße, stretch Streckung (x, y, z)
//   radial   Kristalle zeigen strahlenförmig nach außen (Nadeln, Stäbe, Spitzen)
//   env      Stärke der Umgebungsspiegelung (Metallglanz, Funkeln)
//   selfLit  Eigenleuchten in der Grundfarbe (bleibt im Dunkeln erkennbar), glow Stärke des Lichthofs
export const MINERAL_LOOK = [
  { name: 'Ironium', color: 0x7d6354, metal: 0.5, rough: 0.75, env: 0.55, selfLit: 0.22, glow: 0.06,
    shape: 'lump', count: [3, 4], size: 0.1, stretch: [1, 0.75, 0.9] },
  { name: 'Bronzium', color: 0xd07a33, metal: 0.9, rough: 0.35, env: 0.8, selfLit: 0.18, glow: 0.08,
    shape: 'nugget', count: [2, 3], size: 0.11, stretch: [1.2, 0.8, 1] },
  { name: 'Silverium', color: 0xc6d2de, metal: 1.0, rough: 0.18, env: 1.1, selfLit: 0.15, glow: 0.1,
    shape: 'spike', count: [4, 6], size: 0.13, stretch: [1.3, 1, 1.3], radial: true },
  { name: 'Goldium', color: 0xffbd1c, metal: 1.0, rough: 0.22, env: 1.0, selfLit: 0.22, glow: 0.22, emissive: 0x2a1a00,
    shape: 'nugget', count: [2, 3], size: 0.14, stretch: [1.15, 0.85, 1] },
  { name: 'Platinium', color: 0xe4eaff, metal: 1.0, rough: 0.08, env: 1.35, selfLit: 0.18, glow: 0.15, emissive: 0x10141e,
    shape: 'cube', count: [2, 4], size: 0.095, stretch: [1, 1, 1] },
  { name: 'Einsteinium', color: 0xb4ff2e, metal: 0.1, rough: 0.35, env: 0.4, selfLit: 0.3, glow: 0.5, emissive: 0x5ae81a,
    shape: 'rod', count: [3, 4], size: 0.105, stretch: [1.2, 1, 1.2], radial: true },
  { name: 'Emerald', color: 0x0aa854, metal: 0.05, rough: 0.06, env: 0.9, selfLit: 0.3, glow: 0.3, emissive: 0x033a1a,
    shape: 'prism', count: [2, 3], size: 0.15, stretch: [1.25, 1, 1.25], radial: true },
  { name: 'Ruby', color: 0xe0102e, metal: 0.05, rough: 0.06, env: 0.9, selfLit: 0.3, glow: 0.35, emissive: 0x4a0010,
    shape: 'ruby', count: [2, 3], size: 0.13, stretch: [1, 1, 1] },
  { name: 'Diamond', color: 0xcff3ff, metal: 0.35, rough: 0.0, env: 2.6, selfLit: 0.2, glow: 0.42, emissive: 0x24506a,
    shape: 'brilliant', count: [1, 2], size: 0.17, stretch: [1, 1, 1] },
  { name: 'Amazonite', color: 0x25d8c8, metal: 0.2, rough: 0.1, env: 0.8, selfLit: 0.3, glow: 0.45, emissive: 0x0a5f58,
    shape: 'tetra', count: [3, 5], size: 0.12, stretch: [0.7, 1.5, 0.7], radial: true },
  // Sonderfunde (ein Stück pro Tile): mehrteilige Modelle mit eigenen Farben je Teil (parts: Vertex-Farben,
  // color bleibt die Leitfarbe für Lichthof, Splitter und Anzeigen); upright: liegt aufrecht zur Kamera,
  // spin: darf beliebig gedreht liegen (Knochen)
  { name: 'Dinosaur Bones', color: 0xf0ead8, metal: 0.0, rough: 0.75, env: 0.3, selfLit: 0.2, glow: 0.2,
    shape: 'bones', parts: true, upright: true, spin: true, count: [1, 1], size: 0.27, stretch: [1, 1, 1] },
  { name: 'Treasure', color: 0xffd040, metal: 0.55, rough: 0.35, env: 1.0, selfLit: 0.16, glow: 0.3, emissive: 0x1a1000,
    shape: 'chest', parts: true, upright: true, count: [1, 1], size: 0.26, stretch: [1, 1, 1] },
  { name: 'Martian Skeleton', color: 0xd8d0c0, metal: 0.0, rough: 0.7, env: 0.3, selfLit: 0.2, glow: 0.2,
    shape: 'skull', parts: true, upright: true, count: [1, 1], size: 0.24, stretch: [1, 1, 1] },
  { name: 'Religious Artifact', color: 0xb070ff, metal: 0.6, rough: 0.25, env: 1.1, selfLit: 0.2, glow: 0.4, emissive: 0x200a38,
    shape: 'artifact', parts: true, upright: true, count: [1, 1], size: 0.27, stretch: [1, 1, 1] },
];

// ---------- mehrteilige Modelle der Sonderfunde ----------
// Jedes Teil bekommt seine Farbe als Vertex-Farbe, alles wird zu einer Geometrie verschmolzen (eine
// InstancedMesh je Sorte wie bei den Mineralien). Größe ca. 2.4 Einheiten, Vorderseite zeigt nach +Z.
function colored(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
// Teil verschieben/drehen/skalieren: place(geo, [x, y, z], [rx, ry, rz], [sx, sy, sz])
function place(geo, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  return geo.scale(...scale).rotateX(rot[0]).rotateY(rot[1]).rotateZ(rot[2]).translate(...pos);
}
function assemble(parts) {
  const geos = parts.map(([geo, hex]) => colored(geo.index ? geo.toNonIndexed() : geo, hex));
  const merged = mergeGeometries(geos, false);
  merged.computeVertexNormals();
  return merged;
}

// Knochen mit Gelenkköpfen an beiden Enden (Achse x)
function bone(len, r, hex, knob = hex) {
  const parts = [[new THREE.CylinderGeometry(r, r * 1.15, len, 7).rotateZ(Math.PI / 2), hex]];
  for (const s of [-1, 1]) for (const dy of [-0.55, 0.55]) {
    parts.push([place(new THREE.SphereGeometry(r * 1.5, 7, 5), [s * len / 2, dy * r * 1.6, 0]), knob]);
  }
  return parts;
}
const shift = (parts, pos, rot = [0, 0, 0], scale = [1, 1, 1]) => parts.map(([g, c]) => [place(g, pos, rot, scale), c]);

function findGeometry(shape) {
  if (shape === 'bones') {
    // Oberschenkelknochen, darüber gekreuzt ein Rippenbogen, daneben ein Wirbel
    const IVORY = 0xe9dcc0, AGED = 0xc8b58c, STAIN = 0x8c7550;
    const vertebra = [
      [new THREE.CylinderGeometry(0.28, 0.28, 0.3, 8).rotateX(Math.PI / 2), AGED],
      [place(new THREE.ConeGeometry(0.09, 0.5, 5), [0, 0.38, 0]), IVORY],
      [place(new THREE.ConeGeometry(0.07, 0.4, 5), [0.3, 0.05, 0], [0, 0, -Math.PI / 2]), IVORY],
      [place(new THREE.ConeGeometry(0.07, 0.4, 5), [-0.3, 0.05, 0], [0, 0, Math.PI / 2]), IVORY],
    ];
    return assemble([
      ...bone(1.9, 0.15, IVORY, AGED),
      ...shift([[new THREE.TorusGeometry(0.7, 0.07, 5, 12, Math.PI * 0.8), AGED]], [0.05, 0.05, 0.12], [0, 0, 0.5]),
      ...shift(vertebra, [-0.55, -0.42, 0.1], [0.3, 0, 0.4], [0.9, 0.9, 0.9]),
      [place(new THREE.SphereGeometry(0.1, 5, 4), [0.35, -0.05, 0.14], [0, 0, 0], [1.6, 0.8, 0.5]), STAIN],
    ]);
  }
  if (shape === 'chest') {
    // Holztruhe mit gewölbtem Deckel, Goldbeschlägen, Schloss, obenauf und davor Münzen und Edelsteine
    const WOOD = 0x6e4020, WOOD_DARK = 0x4a2a14, GOLD = 0xffc53a, RUBY = 0xe0102e, EMERALD = 0x10b060;
    const parts = [
      [place(new THREE.BoxGeometry(1.8, 0.95, 1.1), [0, -0.3, 0]), WOOD],
      [place(new THREE.CylinderGeometry(0.55, 0.55, 1.8, 10, 1, false, 0, Math.PI), [0, 0.17, 0], [0, 0, Math.PI / 2]), WOOD_DARK],
      [place(new THREE.BoxGeometry(0.34, 0.4, 0.08), [0, -0.05, 0.58]), GOLD],            // Schloss
      [place(new THREE.BoxGeometry(0.1, 0.16, 0.04), [0, -0.08, 0.63]), WOOD_DARK],       // Schlüsselloch
    ];
    for (const x of [-0.72, 0.72]) {                                                    // Beschläge
      parts.push([place(new THREE.BoxGeometry(0.14, 0.97, 1.14), [x, -0.3, 0]), GOLD]);
      parts.push([place(new THREE.CylinderGeometry(0.57, 0.57, 0.14, 10, 1, false, 0, Math.PI), [x, 0.17, 0], [0, 0, Math.PI / 2]), GOLD]);
    }
    for (const x of [-0.9, 0.9]) for (const y of [-0.76, 0.12]) parts.push([place(new THREE.BoxGeometry(0.05, 0.16, 1.14), [x, y, 0]), GOLD]);
    // Münzen: ein Stapel davor und verstreute
    for (let i = 0; i < 4; i++) parts.push([place(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 10), [0.95, -0.72 + i * 0.055, 0.55]), GOLD]);
    for (const [x, z, a] of [[-0.75, 0.7, 0.4], [-0.4, 0.8, 1.2], [0.45, 0.78, 0.8]]) {
      parts.push([place(new THREE.CylinderGeometry(0.15, 0.15, 0.05, 10), [x, -0.75, z], [a, 0, 0.3]), GOLD]);
    }
    parts.push([place(new THREE.OctahedronGeometry(0.14, 0), [-0.55, 0.78, 0.2], [0, 0.5, 0], [1, 1.3, 1]), RUBY]);
    parts.push([place(new THREE.OctahedronGeometry(0.12, 0), [0.35, 0.74, 0.25], [0.4, 0, 0], [1, 1.3, 1]), EMERALD]);
    parts.push([place(new THREE.CylinderGeometry(0.15, 0.15, 0.05, 10), [0.05, 0.72, 0.3], [1.1, 0, 0]), GOLD]);
    return assemble(parts);
  }
  if (shape === 'skull') {
    // Marsianer: hoher, nach hinten gezogener Hirnschädel, riesige schräge Augenhöhlen, schmaler Kiefer,
    // darunter Halswirbel und Rippenbögen
    const BONE = 0xd9cfbb, SHADE = 0xa99c82, HOLE = 0x140e0a;
    const parts = [
      [place(new THREE.SphereGeometry(0.7, 12, 9), [0, 0.45, -0.1], [0.15, 0, 0], [0.95, 1.2, 1.05]), BONE],
      [place(new THREE.SphereGeometry(0.3, 10, 7), [0, -0.3, 0.22], [0, 0, 0], [1, 0.9, 0.9]), BONE],     // Gesicht
      [place(new THREE.ConeGeometry(0.17, 0.36, 7), [0, -0.62, 0.26], [Math.PI, 0, 0]), SHADE],        // Kiefer
      [place(new THREE.SphereGeometry(0.035, 4, 3), [-0.05, -0.24, 0.49]), HOLE],                      // Nasenlöcher
      [place(new THREE.SphereGeometry(0.035, 4, 3), [0.05, -0.24, 0.49]), HOLE],
      [place(new THREE.BoxGeometry(0.2, 0.03, 0.02), [0, -0.44, 0.44]), HOLE],                         // Mundspalt
    ];
    for (const s of [-1, 1]) {
      // große, schräge Augenhöhlen vorne im Hirnschädel
      parts.push([place(new THREE.SphereGeometry(0.2, 9, 7), [s * 0.25, 0.1, 0.5], [0, 0, s * -0.5], [1.35, 0.8, 0.45]), HOLE]);
      parts.push([place(new THREE.TorusGeometry(0.66, 0.065, 4, 10, Math.PI * 0.7), [0, -1.05, -0.15], [0, 0, s > 0 ? -0.35 : Math.PI + 0.35], [1, 0.55, 1]), SHADE]);
      parts.push([place(new THREE.TorusGeometry(0.52, 0.06, 4, 10, Math.PI * 0.65), [0, -1.27, -0.15], [0, 0, s > 0 ? -0.3 : Math.PI + 0.3], [1, 0.5, 1]), SHADE]);
    }
    for (let i = 0; i < 3; i++) parts.push([place(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 6), [0, -0.72 - i * 0.14, -0.1]), BONE]);
    return assemble(parts).translate(0, 0.2, 0);
  }
  if (shape === 'artifact') {
    // Violetter Kristall in einer goldenen Fassung auf einem Sockel, umgeben von einem Ring mit Zacken
    const GOLD = 0xe0ac3a, GOLD_DARK = 0x9a6a1c, CRYSTAL = 0xb070ff, CORE = 0xe8c8ff;
    const parts = [
      [place(new THREE.CylinderGeometry(0.42, 0.55, 0.22, 8), [0, -1.0, 0]), GOLD_DARK],
      [place(new THREE.CylinderGeometry(0.12, 0.2, 0.55, 8), [0, -0.66, 0]), GOLD],
      [place(new THREE.SphereGeometry(0.16, 8, 6), [0, -0.38, 0]), GOLD],
      [place(new THREE.OctahedronGeometry(0.42, 0), [0, 0.2, 0], [0, 0.4, 0], [0.8, 1.35, 0.8]), CRYSTAL],
      [place(new THREE.OctahedronGeometry(0.18, 0), [0, 0.2, 0.05], [0, 0.4, 0], [0.8, 1.3, 0.8]), CORE],
      [place(new THREE.TorusGeometry(0.72, 0.06, 5, 20), [0, 0.2, 0]), GOLD],
    ];
    for (const s of [-1, 1]) {                                                        // Fassung: zwei Klauen
      parts.push([place(new THREE.TorusGeometry(0.34, 0.045, 4, 8, Math.PI * 0.7), [0, 0.02, 0], [0, 0, s > 0 ? -0.3 : Math.PI + 0.3]), GOLD]);
    }
    for (let i = 0; i < 8; i++) {                                                     // Zacken am Ring
      const a = (i / 8) * Math.PI * 2;
      parts.push([place(new THREE.ConeGeometry(0.06, 0.24, 4), [Math.cos(a) * 0.86, 0.2 + Math.sin(a) * 0.86, 0], [0, 0, a - Math.PI / 2]), GOLD]);
    }
    return assemble(parts);
  }
  return null;
}

// Ecken deterministisch verbeulen (gleiche Position -> gleicher Versatz, damit keine Risse entstehen)
function jitter(geo, amount, seed) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const h = Math.sin((x * 12.9898 + y * 78.233 + z * 37.719 + seed) * 43758.5453) % 1;
    const k = 1 + amount * h;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

// Kristallform je Sorte, Größe ca. 1 (wird pro Kristall skaliert); "radial"-Formen zeigen nach +Y
export function mineralGeometry(shape) {
  const find = findGeometry(shape);
  if (find) return find;
  const lathe = (pts, segs) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs);
  switch (shape) {
    case 'lump': return jitter(new THREE.DodecahedronGeometry(1, 0), 0.3, 1);
    case 'nugget': return jitter(new THREE.IcosahedronGeometry(1, 1), 0.28, 2);
    case 'spike': return new THREE.CylinderGeometry(0, 0.28, 2.6, 5).translate(0, 1.0, 0);          // Nadel
    case 'cube': return new THREE.BoxGeometry(1.3, 1.3, 1.3);
    case 'rod': return new THREE.CylinderGeometry(0.38, 0.38, 2.2, 6).translate(0, 0.9, 0);        // Sechskantstab
    case 'prism': return lathe([[0, -1.3], [0.5, -0.8], [0.5, 0.8], [0, 1.3]], 6).translate(0, 0.9, 0);
    case 'ruby': return lathe([[0, -0.75], [0.85, -0.15], [0.85, 0.1], [0.5, 0.6], [0, 0.62]], 8);
    case 'brilliant': return lathe([[0, -1.05], [1.0, 0.05], [0.95, 0.15], [0.55, 0.5], [0, 0.5]], 10).rotateX(-0.5);
    case 'tetra': return new THREE.TetrahedronGeometry(1, 0).translate(0, 0.7, 0);
    default: return new THREE.OctahedronGeometry(1, 0);
  }
}

// Umgebungsbild nur für die Mineralien: warmer Himmel oben, dunkler Boden, zwei helle Lichtflächen für
// Glanzlichter. Ohne Umgebungsspiegelung wirken Metalle stumpf und Diamanten wie Glasbrocken.
export function gemEnvironment(renderer) {
  const scene = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 32, 16);
  const colors = [], top = new THREE.Color(0xffe6cc).multiplyScalar(1.2), mid = new THREE.Color(0x5a3a2a);
  const low = new THREE.Color(0x0c0606), c = new THREE.Color();
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / 10;
    if (t > 0) c.copy(mid).lerp(top, t); else c.copy(mid).lerp(low, -t);
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true })));
  for (const [x, y, z, w, h, s] of [[-4, 6, 5, 5, 2.5, 4], [6, 2, 5, 2, 4, 2.5], [0, -3, -7, 8, 1.5, 0.8]]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(s) }));
    panel.position.set(x, y, z);
    panel.lookAt(0, 0, 0);
    scene.add(panel);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(scene, 0.02).texture;
  pmrem.dispose();
  return tex;
}
