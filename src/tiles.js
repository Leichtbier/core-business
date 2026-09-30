import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Seiten-Bits für freiliegende Kanten eines Tiles
export const UP = 1, RIGHT = 2, DOWN = 4, LEFT = 8;

// Ein Tile als extrudierte Fläche: Seiten, die an einen Hohlraum grenzen, bekommen eine runde Fase,
// Außenecken zwischen zwei freien Seiten werden abgerundet. Seiten zu Nachbar-Erde bleiben bündig,
// damit das Erdreich als zusammenhängende Masse wirkt (wie die Tunnelränder im Original).
export function tileGeometry(mask, { radius = 0.22, bevel = 0.09, thickness = 0.12, segments = 4 } = {}) {
  const up = mask & UP, right = mask & RIGHT, down = mask & DOWN, left = mask & LEFT;
  const L = -0.5 + (left ? bevel : 0), R = 0.5 - (right ? bevel : 0);
  const T = 0.5 - (up ? bevel : 0), B = -0.5 + (down ? bevel : 0);
  const rtl = up && left ? radius : 0, rtr = up && right ? radius : 0;
  const rbr = down && right ? radius : 0, rbl = down && left ? radius : 0;

  const s = new THREE.Shape();
  s.moveTo(L, B + rbl);
  s.lineTo(L, T - rtl);
  if (rtl) s.absarc(L + rtl, T - rtl, rtl, Math.PI, Math.PI / 2, true);
  s.lineTo(R - rtr, T);
  if (rtr) s.absarc(R - rtr, T - rtr, rtr, Math.PI / 2, 0, true);
  s.lineTo(R, B + rbr);
  if (rbr) s.absarc(R - rbr, B + rbr, rbr, 0, -Math.PI / 2, true);
  s.lineTo(L + rbl, B);
  if (rbl) s.absarc(L + rbl, B + rbl, rbl, -Math.PI / 2, -Math.PI, true);

  const g = new THREE.ExtrudeGeometry(s, {
    depth: 1 - 2 * thickness, bevelEnabled: true, bevelThickness: thickness, bevelSize: bevel,
    bevelSegments: segments, curveSegments: 5,
  });
  g.translate(0, 0, -0.5 + thickness);
  return g;
}

// ---------- Tunnelrand (entspricht den "Tunnel0..14"-Grafiken des Originals) ----------
// Ein leeres Feld wird in ein 3x3-Raster aus Rand-, Eck- und Mittelstücken geteilt (Randbreite RIM).
// Randstück fest, wenn der Nachbar auf dieser Seite fest ist; Eckstück fest, wenn eine der beiden
// angrenzenden Seiten oder der diagonale Nachbar fest ist; die Mitte ist immer Hohlraum.
export const RIM = 0.14;
const RIM_ROUND = 0.09;

// Nachbarn als Bits: 0 oben-links, 1 oben, 2 oben-rechts, 3 links, 4 rechts, 5 unten-links, 6 unten, 7 unten-rechts
export function rimPattern(n) {
  const tl = n & 1, t = n & 2, tr = n & 4, l = n & 8, r = n & 16, bl = n & 32, b = n & 64, br = n & 128;
  // Raster: Index = row * 3 + col, row 0 = unten (three.js: y nach oben)
  const g = [
    bl || b || l, b, br || b || r,
    l, 0, r,
    tl || t || l, t, tr || t || r,
  ];
  let key = 0;
  g.forEach((v, i) => { if (v) key |= 1 << i; });
  return key;
}

// Umriss(e) der festen Rasterzellen verfolgen, Ecken im Feldinneren abrunden, mit Fase extrudieren
export function rimGeometry(key, { bevel = 0.05, thickness = 0.07 } = {}) {
  const solid = (c, r) => c >= 0 && c < 3 && r >= 0 && r < 3 && (key >> (r * 3 + c)) & 1;
  const coord = [-0.5, -0.5 + RIM, 0.5 - RIM, 0.5];
  // Randkanten gegen den Uhrzeigersinn um jede feste Zelle (feste Seite links der Kante)
  const next = new Map();
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    if (!solid(c, r)) continue;
    if (!solid(c, r - 1)) next.set(`${c},${r}`, `${c + 1},${r}`);
    if (!solid(c + 1, r)) next.set(`${c + 1},${r}`, `${c + 1},${r + 1}`);
    if (!solid(c, r + 1)) next.set(`${c + 1},${r + 1}`, `${c},${r + 1}`);
    if (!solid(c - 1, r)) next.set(`${c},${r + 1}`, `${c},${r}`);
  }
  const loops = [];
  while (next.size) {
    const start = next.keys().next().value;
    const loop = [];
    let k = start;
    do {
      const [c, r] = k.split(',').map(Number);
      loop.push(new THREE.Vector2(coord[c], coord[r]));
      const n = next.get(k);
      next.delete(k);
      k = n;
    } while (k !== start && k !== undefined);
    // kollineare Punkte entfernen
    const pts = loop.filter((p, i) => {
      const a = loop[(i - 1 + loop.length) % loop.length], b = loop[(i + 1) % loop.length];
      return Math.abs((p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x)) > 1e-9;
    });
    loops.push(pts);
  }

  const inner = (p) => Math.abs(p.x) < 0.5 - 1e-6 && Math.abs(p.y) < 0.5 - 1e-6;
  const trace = (path, pts) => {
    pts.forEach((p, i) => {
      const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length];
      if (inner(p)) {
        const rr = Math.min(RIM_ROUND, p.distanceTo(a) / 2, p.distanceTo(b) / 2);
        const pin = p.clone().add(a.clone().sub(p).setLength(rr));
        const pout = p.clone().add(b.clone().sub(p).setLength(rr));
        if (i === 0) path.moveTo(pin.x, pin.y); else path.lineTo(pin.x, pin.y);
        path.quadraticCurveTo(p.x, p.y, pout.x, pout.y);
      } else if (i === 0) path.moveTo(p.x, p.y);
      else path.lineTo(p.x, p.y);
    });
    path.closePath();
    return path;
  };
  const area = (pts) => pts.reduce((s, p, i) => {
    const q = pts[(i + 1) % pts.length];
    return s + p.x * q.y - q.x * p.y;
  }, 0);
  const outers = loops.filter((l) => area(l) > 0).map((l) => trace(new THREE.Shape(), l));
  const holes = loops.filter((l) => area(l) < 0);
  // Ein Loch gibt es nur beim rundum geschlossenen Feld (ein einziger Außenumriss)
  for (const h of holes) outers[0]?.holes.push(trace(new THREE.Path(), h));
  if (!outers.length) return null;

  const g = new THREE.ExtrudeGeometry(outers, {
    depth: 1 - 2 * thickness, bevelEnabled: true, bevelThickness: thickness, bevelSize: bevel,
    bevelSegments: 3, curveSegments: 5,
  });
  g.translate(0, 0, -0.5 + thickness);
  return g;
}

// ---------- Felsbrocken (Tile 25..27) ----------
// Ein Brocken besteht aus mehreren verbeulten, facettierten Stücken: ein großer Kern, darum Schollen und vorne
// kleine Splitter. Sie überlappen sich, dazwischen bleiben Spalten – so wirkt der Fels zerklüftet. Beim Sprengen
// fliegen genau diese Stücke auseinander (Renderer.blastDebris). BOULDER_VARIANTS Formen, je Tile per Zufall.
export const BOULDER_VARIANTS = 4;

// Ecken abhängig von ihrer Position verschieben: gleiche Ecke -> gleicher Versatz, keine Risse im Stück
function roughen(geo, amount, seed) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const h = Math.abs(Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed) * 43758.5453) % 1;
    const k = 1 + amount * (h - 0.5) * 2;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

// Stücke einer Variante: [{ geo (um die eigene Mitte), pos (Lage im Tile, Tile = 1) }]
export function boulderFragments(variant) {
  let seed = 4711 + variant * 977;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const frags = [];
  const K = 1.18; // Gesamtgröße in der Bildebene: der Brocken füllt das Tile fast aus, einzelne Schollen ragen leicht hinaus
  const add = (x, y, z, r, detail, stretch) => {
    x *= K; y *= K; r *= K;
    const geo = roughen(new THREE.IcosahedronGeometry(r, detail), 0.16, variant * 13 + frags.length);
    geo.scale(...stretch);
    geo.rotateZ(rnd() * Math.PI * 2);
    frags.push({ geo, pos: new THREE.Vector3(x, y, z) });
  };
  // Kern, leicht abgeflacht und schräg
  add((rnd() - 0.5) * 0.06, (rnd() - 0.5) * 0.06, 0.0, 0.36, 1, [1.05 + rnd() * 0.1, 0.9 + rnd() * 0.1, 0.85]);
  // Schollen rundherum
  const n = 5 + Math.floor(rnd() * 2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.7;
    const d = 0.22 + rnd() * 0.07;
    add(Math.cos(a) * d, Math.sin(a) * d, 0.02 + rnd() * 0.12, 0.15 + rnd() * 0.07, 0,
      [1 + rnd() * 0.4, 0.8 + rnd() * 0.3, 0.8 + rnd() * 0.3]);
  }
  // Splitter vorne auf dem Kern
  for (let i = 0; i < 2; i++) {
    add((rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.4, 0.18 + rnd() * 0.05, 0.08 + rnd() * 0.05, 0, [1.2, 0.8, 0.7]);
  }
  return frags;
}

// Alle Stücke einer Variante zu einer Geometrie (für die instanzierte Darstellung im Gestein)
export function boulderGeometry(variant = 0) {
  const geos = boulderFragments(variant).map(({ geo, pos }) => geo.clone().translate(pos.x, pos.y, pos.z));
  return mergeGeometries(geos, false);
}

// Magmaeinschluss: unregelmäßig runde, leicht gewölbte Blase, die vorne in ein Erd-Tile eingelassen ist.
// variant wählt eine von mehreren Formen, radius ist der mittlere Radius (Tile = 1). Die Vorderseite liegt
// bei z = front, damit sie knapp vor der Vorderfläche des Erd-Tiles (z = 0.5) sitzt.
export function lavaPocketGeometry(variant, { radius = 0.33, front = 0.515, dome = 0.025 } = {}) {
  let seed = 977 + variant * 131;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const a2 = 0.06 + rnd() * 0.06, p2 = rnd() * 6.3, a3 = 0.04 + rnd() * 0.05, p3 = rnd() * 6.3;
  const a5 = 0.02 + rnd() * 0.03, p5 = rnd() * 6.3;
  const pts = [];
  for (let i = 0; i < 28; i++) {
    const t = (i / 28) * Math.PI * 2;
    const r = radius * (1 + a2 * Math.sin(2 * t + p2) + a3 * Math.sin(3 * t + p3) + a5 * Math.sin(5 * t + p5));
    pts.push(new THREE.Vector2(Math.cos(t) * r, Math.sin(t) * r));
  }
  const s = new THREE.Shape();
  s.moveTo(pts[0].x, pts[0].y);
  s.splineThru([...pts.slice(1), pts[0]]);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: 0.04, bevelEnabled: true, bevelThickness: dome, bevelSize: 0.03, bevelSegments: 4, curveSegments: 3,
  });
  g.translate(0, 0, front - 0.04 - dome);
  return g;
}

// Texturkoordinaten aus der Weltposition statt pro Block: Erdreich wirkt durchgehend
// und nicht wie gekachelte, identische Tiles. scale = Texturwiederholungen pro Tile,
// offsetY verschiebt die Textur vertikal, topV (optional) legt fest, welche Texturzeile Oberseiten zeigen.
export function worldUV(material, scale = 0.5, { offsetY = 0, topV = -1 } = {}) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWorldUVScale = { value: scale };
    shader.uniforms.uWorldUVOffsetY = { value: offsetY };
    shader.uniforms.uWorldUVTopV = { value: topV };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>',
        '#include <common>\nuniform float uWorldUVScale;\nuniform float uWorldUVOffsetY;\nuniform float uWorldUVTopV;')
      .replace('#include <project_vertex>', `#include <project_vertex>
      {
        vec4 wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
        #endif
        wp = modelMatrix * wp;
        vec3 an = abs(objectNormal);
        vec2 wuv = an.z >= max(an.x, an.y) ? wp.xy : (an.y >= an.x ? vec2(wp.x, wp.z) : vec2(wp.z, wp.y));
        wuv *= uWorldUVScale;
        wuv.y += uWorldUVOffsetY;
        if (uWorldUVTopV >= 0.0 && objectNormal.y > 0.5) wuv.y = uWorldUVTopV;
        #ifdef USE_MAP
          vMapUv = wuv;
        #endif
        #ifdef USE_BUMPMAP
          vBumpMapUv = wuv;
        #endif
        #ifdef USE_EMISSIVEMAP
          vEmissiveMapUv = wuv;
        #endif
      }`);
  };
  material.customProgramCacheKey = () => `worldUV${scale}/${offsetY}/${topV}`;
  return material;
}
