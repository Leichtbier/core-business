// Steuerung für Tablet und Smartphone: Steuerkreuz unten rechts, Items durch Antippen der Item-Leiste,
// Pause-Knopf über dem Steuerkreuz. Menüs, Shops und Dialoge bedient man ohnehin durch Antippen der Knöpfe.
// Sichtbar ist das alles nur im Touch-Modus (Klasse "touch" am <body>): an, sobald ein Finger den Bildschirm
// berührt (oder das Gerät nur Touch kennt), aus bei der ersten Taste auf einer Tastatur.
//
// Steuerkreuz: Der Finger zeigt vom Mittelpunkt aus die Richtung, acht Sektoren zu je 45° (schräg = zwei
// Richtungen zugleich, z. B. fliegen und seitwärts). In der Mitte ruht alles. Der Finger darf den Kreis
// verlassen, die Richtung gilt weiter, bis er losgelassen wird.

const DEAD = 0.22; // Ruhezone in der Mitte, Anteil am Radius
const DIAG = Math.cos((67.5 * Math.PI) / 180); // Achsanteil, ab dem eine Richtung mitzählt (45°-Sektoren)

const $ = (id) => document.getElementById(id);

// input: dasselbe Objekt wie für die Tastatur; canSteer(): darf das Spiel gerade Eingaben bekommen;
// useItem(i), pause(): Aktionen; wake(): Ton nach der ersten Berührung freischalten
export function setupTouch({ input, canSteer, useItem, pause, wake, force = false }) {
  const body = document.body;
  const setTouch = (on) => body.classList.toggle('touch', on);
  setTouch(force || matchMedia('(hover: none) and (pointer: coarse)').matches);
  window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') setTouch(true); }, true);
  window.addEventListener('keydown', () => { if (!force) setTouch(false); }, true);

  const pad = $('touchPad'), knob = $('touchKnob');
  const arrows = Object.fromEntries(['up', 'down', 'left', 'right'].map((k) => [k, pad.querySelector('.' + k)]));
  let finger = null, dir = {};

  // Richtung merken und anwenden, solange das Spiel Eingaben bekommen darf
  const set = (d) => {
    dir = d;
    const ok = canSteer();
    for (const k of Object.keys(arrows)) {
      const on = ok && !!dir[k];
      input[k] = on;
      arrows[k].classList.toggle('on', on);
    }
  };
  const release = () => {
    finger = null;
    knob.style.transform = '';
    pad.classList.remove('held');
    set({});
  };
  const track = (e) => {
    const r = pad.getBoundingClientRect(), rad = r.width / 2;
    let x = (e.clientX - r.left - rad) / rad, y = (e.clientY - r.top - rad) / rad;
    const len = Math.hypot(x, y);
    // Knopf folgt dem Finger, bleibt aber im Kreis
    const k = len > 0.62 ? 0.62 / len : 1;
    knob.style.transform = `translate(${x * k * rad}px, ${y * k * rad}px)`;
    if (len < DEAD) { set({}); return; }
    x /= len; y /= len;
    set({ left: x < -DIAG, right: x > DIAG, up: y < -DIAG, down: y > DIAG });
  };

  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    wake();
    finger = e.pointerId;
    try { pad.setPointerCapture(e.pointerId); } catch { /* künstliche Ereignisse (Tests) */ }
    pad.classList.add('held');
    track(e);
  });
  pad.addEventListener('pointermove', (e) => { if (e.pointerId === finger) track(e); });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    pad.addEventListener(type, (e) => { if (e.pointerId === finger) release(); });
  }
  // Bei jedem Bild neu anwenden: Öffnet sich ein Shop oder Dialog, während der Finger liegt, ruht der Pod;
  // danach fährt er weiter, ohne dass der Finger neu ansetzen muss (wie eine gehaltene Taste)
  const refresh = () => { if (finger !== null) set(dir); requestAnimationFrame(refresh); };
  requestAnimationFrame(refresh);

  // Items: Antippen eines Feldes der Item-Leiste
  [...$('itemBar').children].forEach((slot, i) => {
    slot.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      wake();
      if (canSteer()) useItem(i);
    });
  });

  $('touchPause').addEventListener('click', (e) => { e.currentTarget.blur(); pause(); });
}
