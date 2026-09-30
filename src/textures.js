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

export const concreteTexture = () => canvasTexture(128, (g, s, r) => {
  g.fillStyle = '#8b8b8e';
  g.fillRect(0, 0, s, s);
  speckle(g, s, r, 250, ['#7c7c80', '#9a9a9e', '#707074'], 1, 3);
  g.fillStyle = '#e0b020';
  for (let x = 0; x < s; x += 32) g.fillRect(x, 6, 16, 6);
  g.strokeStyle = 'rgba(40,40,45,0.6)';
  g.strokeRect(1, 1, s - 2, s - 2);
}, 19);

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
