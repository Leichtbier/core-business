import * as THREE from 'three';

// Kleiner deterministischer Zufallsgenerator, damit Texturen bei jedem Start gleich aussehen
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(size, draw, seed = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size, rng(seed));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

// Werbetafel an der Oberfläche: Rekrutierungsplakat von Husk Heavy Industries im Stil alter Propaganda.
// Liefert die Textur und setPortrait(canvas), das Mr. Husk einsetzt, sobald sein Porträt gerendert ist
// (Portrait3D.snapshotRecruiter); bis dahin bleibt der Platz leer.
export function billboardTexture() {
  const W = 2048, H = 896;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const FONT = 'Impact, "Haettenschweiler", "Arial Black", sans-serif';

  const draw = (portrait) => {
    const r = rng(1917);
    // Strahlenkranz hinter Mr. Husk
    const cx = W * 0.74, cy = H * 0.55;
    g.fillStyle = '#c23a1e';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#dc5a2c';
    for (let i = 0; i < 32; i += 2) {
      const a0 = (i / 32) * Math.PI * 2, a1 = ((i + 1) / 32) * Math.PI * 2;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(a0) * W * 2, cy + Math.sin(a0) * W * 2);
      g.lineTo(cx + Math.cos(a1) * W * 2, cy + Math.sin(a1) * W * 2);
      g.closePath();
      g.fill();
    }
    const halo = g.createRadialGradient(cx, cy, 40, cx, cy, H * 0.75);
    halo.addColorStop(0, 'rgba(255, 214, 140, 0.75)');
    halo.addColorStop(1, 'rgba(255, 214, 140, 0)');
    g.fillStyle = halo;
    g.fillRect(0, 0, W, H);
    // Der rote Planet links unten, mit Kratern
    const px = W * 0.2, py = H * 1.22, pr = H * 0.72;
    const planet = g.createRadialGradient(px - pr * 0.3, py - pr * 0.5, pr * 0.1, px, py, pr);
    planet.addColorStop(0, '#f08a4a');
    planet.addColorStop(1, '#7a200e');
    g.fillStyle = planet;
    g.beginPath();
    g.arc(px, py, pr, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(90, 20, 8, 0.45)';
    for (const [dx, dy, rr] of [[-0.35, -0.72, 0.07], [0.1, -0.85, 0.05], [0.42, -0.6, 0.09], [-0.1, -0.62, 0.04]]) {
      g.beginPath();
      g.ellipse(px + dx * pr, py + dy * pr, rr * pr, rr * pr * 0.55, 0, 0, Math.PI * 2);
      g.fill();
    }
    // Mr. Husk
    if (portrait) {
      const ph = H * 0.98, pw = ph * (portrait.width / portrait.height);
      g.drawImage(portrait, W * 0.745 - pw / 2, H * 0.02, pw, ph);
    }
    // Schriftzug, mit dicker Kontur und Schlagschatten
    const text = (s, x, y, size, fill) => {
      g.font = `${size}px ${FONT}`;
      g.lineJoin = 'round';
      g.fillStyle = 'rgba(40, 10, 4, 0.55)';
      g.fillText(s, x + 12, y + 12);
      g.lineWidth = size * 0.07;
      g.strokeStyle = '#2a0c05';
      g.strokeText(s, x, y);
      g.fillStyle = fill;
      g.fillText(s, x, y);
    };
    g.textBaseline = 'alphabetic';
    text('MARS', 96, 290, 300, '#f6e8c6');
    text('NEEDS', 104, 470, 180, '#ffcf4a');
    text('MINERS!', 96, 690, 250, '#f6e8c6');
    // Banner unten
    g.fillStyle = '#1a120e';
    g.fillRect(0, H * 0.83, W, H * 0.17);
    g.fillStyle = '#ffcf4a';
    g.fillRect(0, H * 0.83, W, 8);
    g.font = `78px ${FONT}`;
    g.fillStyle = '#ffcf4a';
    g.fillText('SIGN UP AT HUSK HEAVY INDUSTRIES TODAY!', 96, H * 0.83 + 90);
    g.font = '26px "Arial Narrow", Arial, sans-serif';
    g.fillStyle = '#b8a890';
    g.fillText('*Terms and conditions apply. Contract depth limits are binding. Husk Heavy Industries accepts no liability for lost pods, lives or souls.', 98, H * 0.83 + 132);
    // Verwitterung: Plakatbahnen, Rostschlieren von oben, Staub, abgeplatzte Stellen, abgerissene Ecke
    g.fillStyle = 'rgba(30, 12, 6, 0.22)';
    for (let i = 1; i < 5; i++) g.fillRect((W / 5) * i + (r() - 0.5) * 8, 0, 3, H);
    for (let i = 0; i < 40; i++) {
      const x = r() * W, len = H * (0.1 + r() * 0.45), wdt = 4 + r() * 14;
      const streak = g.createLinearGradient(0, 0, 0, len);
      streak.addColorStop(0, 'rgba(70, 30, 10, 0.35)');
      streak.addColorStop(1, 'rgba(70, 30, 10, 0)');
      g.fillStyle = streak;
      g.fillRect(x, 0, wdt, len);
    }
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = r() < 0.5 ? `rgba(40, 20, 10, ${0.05 + r() * 0.12})` : `rgba(255, 235, 200, ${0.03 + r() * 0.07})`;
      const s = 1 + r() * 4;
      g.fillRect(r() * W, r() * H, s, s);
    }
    for (let i = 0; i < 14; i++) {
      g.fillStyle = 'rgba(210, 200, 185, 0.55)';
      g.beginPath();
      g.ellipse(r() * W, r() * H * 0.8, 6 + r() * 22, 4 + r() * 12, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#6a625a'; // abgerissene Ecke unten rechts: darunter die blanke Tafel
    g.beginPath();
    g.moveTo(W, H * 0.62);
    g.lineTo(W - 70, H * 0.7);
    g.lineTo(W - 150, H * 0.86);
    g.lineTo(W - 250, H);
    g.lineTo(W, H);
    g.closePath();
    g.fill();
    tex.needsUpdate = true;
  };
  draw(null);
  return { texture: tex, setPortrait: draw };
}

function speckle(g, size, r, count, colors, minR, maxR) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = colors[Math.floor(r() * colors.length)];
    const x = r() * size, y = r() * size, rad = minR + r() * (maxR - minR);
    const ry = rad * (0.5 + r() * 0.6), rot = r() * Math.PI;
    // an den Rändern umbrechen, damit die Textur nahtlos kachelt
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      if (x + ox < -maxR || x + ox > size + maxR || y + oy < -maxR || y + oy > size + maxR) continue;
      g.beginPath();
      g.ellipse(x + ox, y + oy, rad, ry, rot, 0, Math.PI * 2);
      g.fill();
    }
  }
}

// Heller Grundton, der per Instanzfarbe eingefärbt wird
export const dirtTexture = () => canvasTexture(256, (g, s, r) => {
  g.fillStyle = '#d4d4d4';
  g.fillRect(0, 0, s, s);
  speckle(g, s, r, 700, ['#bdbdbd', '#e6e6e6', '#a4a4a4', '#c8c8c8'], 1.5, 7);
  speckle(g, s, r, 70, ['#a2a2a2', '#f2f2f2', '#b0b0b0'], 2, 5);
  speckle(g, s, r, 10, ['#b4b4b4', '#e2e2e2'], 6, 11); // eingebettete Steinchen
}, 7);

export const rockTexture = () => canvasTexture(128, (g, s, r) => {
  // Risse dürfen an den Rändern abbrechen, Felsen sind einzelne Brocken
  g.fillStyle = '#6b6560';
  g.fillRect(0, 0, s, s);
  speckle(g, s, r, 120, ['#57514c', '#7d7670', '#4a4541', '#8a837c'], 3, 12);
  g.strokeStyle = 'rgba(30,25,22,0.7)';
  g.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    let x = r() * s, y = r() * s;
    g.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 50; y += (r() - 0.5) * 50; g.lineTo(x, y); }
    g.stroke();
  }
}, 11);

export const lavaTexture = () => canvasTexture(128, (g, s, r) => {
  g.fillStyle = '#b32400';
  g.fillRect(0, 0, s, s);
  speckle(g, s, r, 90, ['#ff6a00', '#ffb300', '#e03a00', '#ffd24a'], 3, 14);
  speckle(g, s, r, 40, ['#5a1200', '#3a0b00'], 3, 9);
}, 13);

// Betonplatten unter den Gebäuden: Atlas mit PAVE_VARIANTS Spalten, oben die Vorderseiten, unten die Oberseiten
// (Fertigteile mit Fugen, Ankerlöchern, Rostfahnen, Rissen, Reifenspuren, Ölflecken, rotem Staub).
// Dazu die Stahlkante: obere Hälfte Warnstreifen mit Bolzen, untere Hälfte blankes, verkratztes Blech.
export const PAVE_VARIANTS = 4;
export function paveTextures() {
  const C = 256, N = PAVE_VARIANTS;
  const c = document.createElement('canvas');
  c.width = C * N;
  c.height = C * 2;
  const g = c.getContext('2d');
  const r = rng(19);
  const streak = (x, y, w, len, rgb, a) => {
    const gr = g.createLinearGradient(0, y, 0, y + len);
    gr.addColorStop(0, `rgba(${rgb}, ${a})`);
    gr.addColorStop(1, `rgba(${rgb}, 0)`);
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(x - w / 2, y);
    g.lineTo(x + w / 2, y);
    g.lineTo(x + w * 0.2, y + len);
    g.lineTo(x - w * 0.2, y + len);
    g.fill();
  };
  const crack = (x, y, dx, dy, steps, len) => {
    const pts = [[x, y]];
    for (let k = 0; k < steps; k++) {
      x += dx * len + (r() - 0.5) * len * 0.9;
      y += dy * len + (r() - 0.5) * len * 0.9;
      pts.push([x, y]);
    }
    for (const [col, off] of [['rgba(230, 225, 215, 0.35)', 1], ['rgba(35, 30, 28, 0.8)', 0]]) {
      g.strokeStyle = col;
      g.lineWidth = off ? 1.2 : 1.4;
      g.beginPath();
      pts.forEach(([px, py], k) => (k ? g.lineTo(px + off, py + off) : g.moveTo(px + off, py + off)));
      g.stroke();
    }
  };
  const blotch = (x, y, rx, ry, rgb, a) => {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    gr.addColorStop(0, `rgba(${rgb}, ${a})`);
    gr.addColorStop(0.6, `rgba(${rgb}, ${a * 0.6})`);
    gr.addColorStop(1, `rgba(${rgb}, 0)`);
    g.save();
    g.translate(x, y);
    g.scale(rx, ry);
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, 1, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };
  const aggregate = (x0, y0, n) => {
    for (let i = 0; i < n; i++) {
      const light = r() < 0.5;
      g.fillStyle = light ? `rgba(215, 210, 200, ${0.15 + r() * 0.25})` : `rgba(50, 46, 42, ${0.12 + r() * 0.25})`;
      g.beginPath();
      g.ellipse(x0 + r() * C, y0 + r() * C, 0.6 + r() * 2.2, 0.5 + r() * 1.6, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
  };

  for (let v = 0; v < N; v++) {
    // ---------- Vorderseite ----------
    const x0 = v * C;
    g.save();
    g.beginPath();
    g.rect(x0, 0, C, C);
    g.clip();
    const base = g.createLinearGradient(0, 0, 0, C);
    base.addColorStop(0, '#9b9892');
    base.addColorStop(0.6, '#8d8983');
    base.addColorStop(1, '#78716a');
    g.fillStyle = base;
    g.fillRect(x0, 0, C, C);
    // Schalungsbild: leicht unterschiedlich getönte Bretterbahnen
    for (let y = 0; y < C; y += 32) {
      g.fillStyle = r() < 0.5 ? `rgba(255, 250, 240, ${r() * 0.06})` : `rgba(40, 35, 30, ${r() * 0.07})`;
      g.fillRect(x0, y, C, 32);
    }
    aggregate(x0, 0, 900);
    // Betonierfuge auf halber Höhe
    const jy = Math.round(C * 0.56);
    g.fillStyle = 'rgba(45, 40, 36, 0.55)';
    g.fillRect(x0, jy, C, 2);
    g.fillStyle = 'rgba(235, 230, 220, 0.3)';
    g.fillRect(x0, jy + 2, C, 1);
    // Ankerlöcher der Schalung, manche mit Rostfahne
    for (const [ax, ay] of [[0.17, 0.3], [0.83, 0.3], [0.17, 0.8], [0.83, 0.8]]) {
      const hx = x0 + ax * C + (r() - 0.5) * 4, hy = ay * C;
      if (r() < 0.55) streak(hx, hy + 3, 5 + r() * 4, 25 + r() * 70, '120, 58, 22', 0.45 + r() * 0.2);
      g.fillStyle = 'rgba(230, 225, 215, 0.45)';
      g.beginPath(); g.arc(hx + 0.8, hy + 0.8, 5.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3a3531';
      g.beginPath(); g.arc(hx, hy, 5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#1c1917';
      g.beginPath(); g.arc(hx - 0.8, hy - 0.8, 2.6, 0, Math.PI * 2); g.fill();
    }
    // Wasserschlieren von der Stahlkante herab
    for (let i = 0; i < 6; i++) streak(x0 + r() * C, 26, 6 + r() * 14, 40 + r() * 120, '55, 48, 42', 0.12 + r() * 0.12);
    if (v === 1 || v === 3) crack(x0 + C * (0.3 + r() * 0.4), jy + 2, (r() - 0.5) * 0.6, 1, 8, 13);
    if (v === 3) crack(x0 + C * 0.95, C * 0.35, -1, 0.35, 6, 12);
    if (v === 2) {
      // abgeplatzte Ecke unten rechts, darin rostige Bewehrung
      g.fillStyle = '#6a635c';
      g.beginPath();
      g.moveTo(x0 + C, C * 0.72);
      g.lineTo(x0 + C * 0.9, C * 0.75);
      g.lineTo(x0 + C * 0.84, C * 0.86);
      g.lineTo(x0 + C * 0.78, C);
      g.lineTo(x0 + C, C);
      g.fill();
      g.strokeStyle = 'rgba(40, 36, 32, 0.8)';
      g.lineWidth = 1.5;
      g.stroke();
      g.strokeStyle = '#7a3d18';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x0 + C * 0.86, C * 0.9); g.lineTo(x0 + C, C * 0.9);
      g.moveTo(x0 + C * 0.93, C * 0.77); g.lineTo(x0 + C * 0.93, C);
      g.stroke();
      streak(x0 + C * 0.9, C * 0.9, 6, 30, '120, 58, 22', 0.5);
    }
    if (v === 0) {
      // aufgesprühte Fertigteilnummer, verblasst
      g.font = 'bold 22px "Arial Narrow", Arial, sans-serif';
      g.fillStyle = 'rgba(40, 36, 34, 0.5)';
      g.fillText(`P-${String(3 + v * 7 + Math.floor(r() * 5)).padStart(2, '0')}`, x0 + C * 0.36, C * 0.44);
      g.fillStyle = 'rgba(200, 150, 30, 0.45)';
      g.fillRect(x0 + C * 0.36, C * 0.46, 46, 3);
    }
    // roter Marsstaub von unten, Spritzer vom Fahrwerk
    const dust = g.createLinearGradient(0, C * 0.6, 0, C);
    dust.addColorStop(0, 'rgba(140, 62, 32, 0)');
    dust.addColorStop(1, 'rgba(140, 62, 32, 0.55)');
    g.fillStyle = dust;
    g.fillRect(x0, C * 0.6, C, C * 0.4);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `rgba(${120 + r() * 40}, ${50 + r() * 20}, 28, ${0.2 + r() * 0.35})`;
      const y = C - Math.pow(r(), 2) * C * 0.45;
      g.beginPath(); g.ellipse(x0 + r() * C, y, 1 + r() * 3, 0.8 + r() * 2, r() * 3, 0, Math.PI * 2); g.fill();
    }
    // Schatten unter der Stahlkante und Fertigteilfugen links und rechts
    const occ = g.createLinearGradient(0, 22, 0, 46);
    occ.addColorStop(0, 'rgba(20, 18, 16, 0.55)');
    occ.addColorStop(1, 'rgba(20, 18, 16, 0)');
    g.fillStyle = occ;
    g.fillRect(x0, 22, C, 24);
    for (const [sx, dir] of [[x0, 1], [x0 + C, -1]]) {
      g.fillStyle = 'rgba(30, 27, 24, 0.85)';
      g.fillRect(dir > 0 ? sx : sx - 3, 0, 3, C);
      g.fillStyle = dir > 0 ? 'rgba(235, 230, 220, 0.35)' : 'rgba(30, 27, 24, 0.3)';
      g.fillRect(dir > 0 ? sx + 3 : sx - 5, 0, 2, C);
    }
    g.restore();

    // ---------- Oberseite (Leinwand oben = hinten, unten = Vorderkante) ----------
    const y0 = C;
    g.save();
    g.beginPath();
    g.rect(x0, y0, C, C);
    g.clip();
    g.fillStyle = '#97938c';
    g.fillRect(x0, y0, C, C);
    aggregate(x0, y0, 700);
    // Besenstrich quer zur Fahrtrichtung
    for (let i = 0; i < 90; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(255, 250, 240, 0.06)' : 'rgba(40, 35, 30, 0.07)';
      g.fillRect(x0 + r() * C, y0, 1 + r() * 2, C);
    }
    // Reifen- und Kufenspuren in Fahrtrichtung
    for (let i = 0; i < 3; i++) {
      const ty = y0 + C * (0.35 + r() * 0.5), th = 10 + r() * 16;
      g.fillStyle = `rgba(30, 26, 22, ${0.08 + r() * 0.1})`;
      g.beginPath();
      g.moveTo(x0, ty);
      g.bezierCurveTo(x0 + C * 0.3, ty + (r() - 0.5) * 12, x0 + C * 0.7, ty + (r() - 0.5) * 12, x0 + C, ty);
      g.lineTo(x0 + C, ty + th);
      g.bezierCurveTo(x0 + C * 0.7, ty + th, x0 + C * 0.3, ty + th, x0, ty + th);
      g.fill();
    }
    if (v !== 1) blotch(x0 + C * (0.25 + r() * 0.5), y0 + C * (0.35 + r() * 0.4), 26 + r() * 22, 14 + r() * 12, '28, 24, 20', 0.4 + r() * 0.2);
    if (v === 1) crack(x0 + C * 0.2, y0 + C * 0.1, 0.4, 1, 10, 16);
    // Staubverwehungen, vor allem hinten
    for (let i = 0; i < 5; i++) blotch(x0 + r() * C, y0 + r() * C * 0.6, 30 + r() * 50, 10 + r() * 22, '150, 70, 36', 0.18 + r() * 0.15);
    // Dehnfugen an den Plattengrenzen
    g.fillStyle = 'rgba(30, 27, 24, 0.8)';
    g.fillRect(x0, y0, 3, C);
    g.fillRect(x0 + C - 3, y0, 3, C);
    g.restore();
  }
  // feines Korn über alles
  const img = g.getImageData(0, 0, c.width, c.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * 22;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  const concrete = new THREE.CanvasTexture(c);
  concrete.colorSpace = THREE.SRGBColorSpace;
  concrete.anisotropy = 8;

  // ---------- Stahlkante ----------
  const s = document.createElement('canvas');
  s.width = 256;
  s.height = 128;
  const h = s.getContext('2d');
  h.fillStyle = '#e0ae1c';
  h.fillRect(0, 0, 256, 64);
  h.fillStyle = '#1b1a18';
  for (let x = -64; x < 256 + 64; x += 64) {
    h.beginPath();
    h.moveTo(x, 64); h.lineTo(x + 32, 64); h.lineTo(x + 32 + 64, 0); h.lineTo(x + 64, 0);
    h.fill();
  }
  // Abrieb: Farbe abgeplatzt, darunter blankes Metall und Rost
  for (let i = 0; i < 160; i++) {
    h.fillStyle = r() < 0.6 ? `rgba(70, 68, 66, ${0.4 + r() * 0.5})` : `rgba(125, 60, 22, ${0.3 + r() * 0.4})`;
    h.beginPath(); h.ellipse(r() * 256, r() * 64, 0.8 + r() * 3.5, 0.6 + r() * 1.5, r() * 3, 0, Math.PI * 2); h.fill();
  }
  const dirt = h.createLinearGradient(0, 0, 0, 64);
  dirt.addColorStop(0, 'rgba(0, 0, 0, 0)');
  dirt.addColorStop(1, 'rgba(110, 50, 25, 0.4)');
  h.fillStyle = dirt;
  h.fillRect(0, 0, 256, 64);
  // Bolzen
  for (const bx of [32, 128, 224]) {
    h.fillStyle = 'rgba(0, 0, 0, 0.5)';
    h.beginPath(); h.arc(bx + 1.5, 33.5, 8, 0, Math.PI * 2); h.fill();
    const bolt = h.createRadialGradient(bx - 2, 30, 1, bx, 32, 8);
    bolt.addColorStop(0, '#c8c4bc');
    bolt.addColorStop(1, '#4a4642');
    h.fillStyle = bolt;
    h.beginPath(); h.arc(bx, 32, 7, 0, Math.PI * 2); h.fill();
  }
  h.fillStyle = 'rgba(0, 0, 0, 0.45)';
  h.fillRect(0, 0, 256, 3);
  h.fillRect(0, 61, 256, 3);
  // blankes, verkratztes Blech
  h.fillStyle = '#56575a';
  h.fillRect(0, 64, 256, 64);
  for (let i = 0; i < 120; i++) {
    h.strokeStyle = r() < 0.6 ? `rgba(200, 200, 205, ${0.08 + r() * 0.15})` : `rgba(20, 20, 22, ${0.1 + r() * 0.2})`;
    h.lineWidth = 0.6 + r();
    const x = r() * 256, y = 64 + r() * 64, l = 6 + r() * 40, a = (r() - 0.5) * 0.4;
    h.beginPath(); h.moveTo(x, y); h.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); h.stroke();
  }
  for (let i = 0; i < 25; i++) {
    h.fillStyle = `rgba(120, 58, 22, ${0.2 + r() * 0.35})`;
    h.beginPath(); h.ellipse(r() * 256, 64 + r() * 64, 1 + r() * 5, 1 + r() * 3, r() * 3, 0, Math.PI * 2); h.fill();
  }
  const steel = new THREE.CanvasTexture(s);
  steel.colorSpace = THREE.SRGBColorSpace;
  steel.anisotropy = 8;
  return { concrete, steel };
}

export const backWallTexture = () => canvasTexture(128, (g, s, r) => {
  g.fillStyle = '#3a2418';
  g.fillRect(0, 0, s, s);
  speckle(g, s, r, 220, ['#2e1c12', '#452c1e', '#26170f', '#50331f'], 2, 9);
}, 23);

export const signTexture = (text, bg, fg = '#fff') => {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 8;
  g.strokeRect(6, 6, 500, 116);
  g.fillStyle = fg;
  g.font = 'bold 56px "Trebuchet MS", Verdana, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = 56;
  while (g.measureText(text).width > 470 && size > 20) { size -= 2; g.font = `bold ${size}px "Trebuchet MS", Verdana, sans-serif`; }
  g.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

// Weiches Rauchwölkchen (weiß, wird per Materialfarbe getönt), aus mehreren überlagerten Kreisen
export const smokeTexture = () => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = rng(29);
  for (let i = 0; i < 9; i++) {
    const x = 64 + (r() - 0.5) * 40, y = 64 + (r() - 0.5) * 40, rad = 22 + r() * 22;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

// Weicher runder Lichtschein (weiß, wird per Instanzfarbe eingefärbt)
export const glowTexture = () => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};
