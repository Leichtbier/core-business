// Steuerung für Tablet und Smartphone: Steuerkreuz unten rechts, Items durch Antippen der Item-Leiste,
// Pause-Knopf über dem Steuerkreuz, Leertasten-Knopf am linken Rand. Menüs, Shops und Dialoge bedient man ohnehin durch Antippen der Knöpfe.
// Sichtbar ist das alles nur im Touch-Modus (Klasse "touch" am <body>): an, sobald ein Finger den Bildschirm
// berührt (oder das Gerät nur Touch kennt), aus bei der ersten Taste auf einer Tastatur.
//
// Steuerkreuz: analog, die Spiellogik kennt aber nur gedrückt/nicht gedrückt (wie die Pfeiltasten). Daher
// wird der Ausschlag je Achse in einen Tastgrad 0..1 übersetzt und pro Spielschritt (42 Hz) per Sigma-Delta-
// Modulation in ein Tastenmuster verwandelt: Bei 40 % Ausschlag ist die Richtung in 40 % der Schritte
// gedrückt, so fein verteilt wie möglich. Geschwindigkeit und Spritverbrauch mitteln das wie beim schnellen
// Antippen einer Taste. Waagerecht und nach oben gilt das, nach unten nur ein Schwellwert (unten wird nur
// gebohrt, das lässt sich nicht dosieren). In der Mitte ruht alles. Der Finger darf den Kreis verlassen,
// die Richtung gilt weiter, bis er losgelassen wird.

const DEAD = 0.22; // Ruhezone je Achse, Anteil am Radius (auch gegen Übersprechen: gerade hoch fliegt nicht seitwärts)
const FULL = 0.85; // ab hier Vollschub (dauernd gedrückt wie eine Taste)
const CURVE = 1.5; // Kennlinie: leicht progressiv, feiner dosierbar bei kleinem Ausschlag
const DOWN = 0.5; // Schwelle für "runter"

const $ = (id) => document.getElementById(id);

// Tastgrad 0..1 aus dem Ausschlag einer Achse (Anteil am Radius, darf über 1 liegen)
export function duty(v) {
  const t = (Math.abs(v) - DEAD) / (FULL - DEAD);
  return t <= 0 ? 0 : t >= 1 ? 1 : t ** CURVE;
}

// input: dasselbe Objekt wie für die Tastatur; canSteer(): darf das Spiel gerade Eingaben bekommen;
// useItem(i), pause(): Aktionen; wake(): Ton nach der ersten Berührung freischalten.
// Liefert tick(): vor jedem Spielschritt aufrufen (setzt die Richtungen für diesen Schritt)
export function setupTouch({ input, canSteer, useItem, pause, wake, force = false }) {
  const body = document.body;
  const setTouch = (on) => body.classList.toggle('touch', on);
  setTouch(force || matchMedia('(hover: none) and (pointer: coarse)').matches);
  window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') setTouch(true); }, true);
  let emulating = false; // eigene Tastenereignisse des Leertasten-Knopfs schalten den Touch-Modus nicht aus
  window.addEventListener('keydown', () => { if (!force && !emulating) setTouch(false); }, true);

  const pad = $('touchPad'), knob = $('touchKnob');
  const DIRS = ['up', 'down', 'left', 'right'];
  const arrows = Object.fromEntries(DIRS.map((k) => [k, pad.querySelector('.' + k)]));
  const want = { up: 0, down: 0, left: 0, right: 0 }; // Tastgrad je Richtung
  const acc = { up: 0, down: 0, left: 0, right: 0 }; // Sigma-Delta-Akkumulator je Richtung
  let finger = null;

  const show = () => {
    const ok = canSteer();
    for (const k of DIRS) {
      arrows[k].classList.toggle('on', ok && want[k] > 0);
      arrows[k].style.fillOpacity = ok && want[k] > 0 ? 0.4 + 0.6 * want[k] : '';
    }
  };
  // Neuer Tastgrad; eine Richtung, die gerade erst einsetzt, wirkt gleich im nächsten Schritt
  const aim = (d) => {
    for (const k of DIRS) {
      if (d[k] > 0 && !(want[k] > 0)) acc[k] = 1;
      want[k] = d[k];
    }
    show();
  };
  const release = () => {
    finger = null;
    knob.style.transform = '';
    pad.classList.remove('held');
    aim({ up: 0, down: 0, left: 0, right: 0 });
    for (const k of DIRS) input[k] = false;
  };
  const track = (e) => {
    const r = pad.getBoundingClientRect(), rad = r.width / 2;
    const x = (e.clientX - r.left - rad) / rad, y = (e.clientY - r.top - rad) / rad;
    const len = Math.hypot(x, y);
    // Knopf folgt dem Finger, bleibt aber im Kreis
    const k = len > 0.62 ? 0.62 / len : 1;
    knob.style.transform = `translate(${x * k * rad}px, ${y * k * rad}px)`;
    aim({ left: x < 0 ? duty(x) : 0, right: x > 0 ? duty(x) : 0, up: y < 0 ? duty(y) : 0, down: y > DOWN ? 1 : 0 });
  };

  // Pro Spielschritt: Akkumulator um den Tastgrad erhöhen, ab 1 ist die Richtung in diesem Schritt gedrückt.
  // Öffnet sich ein Shop oder Dialog, während der Finger liegt, ruht der Pod; danach fährt er weiter, ohne
  // dass der Finger neu ansetzen muss (wie eine gehaltene Taste). Ohne Finger bleibt die Tastatur unberührt.
  const tick = () => {
    if (finger === null) return;
    const ok = canSteer();
    for (const k of DIRS) {
      let on = false;
      if (ok && want[k] > 0) {
        acc[k] += want[k];
        if (acc[k] >= 1) { acc[k] -= 1; on = true; }
      }
      input[k] = on;
    }
    show();
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

  // Items: Antippen eines Feldes der Item-Leiste
  [...$('itemBar').children].forEach((slot, i) => {
    slot.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      wake();
      if (canSteer()) useItem(i);
    });
  });

  $('touchPause').addEventListener('click', (e) => { e.currentTarget.blur(); pause(); });

  // Leertaste: Drücken und Loslassen des Knopfs gehen als Tastenereignisse ans Fenster und wirken damit
  // genau wie die echte Taste (z. B. Auswahl in Menüs bestätigen, Funkspruch weiterschalten)
  const space = $('touchSpace');
  const key = (type) => {
    emulating = true;
    try { window.dispatchEvent(new KeyboardEvent(type, { code: 'Space', key: ' ', bubbles: true, cancelable: true })); }
    finally { emulating = false; }
  };
  let spaceFinger = null;
  space.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    wake();
    if (spaceFinger !== null) return;
    spaceFinger = e.pointerId;
    try { space.setPointerCapture(e.pointerId); } catch { /* künstliche Ereignisse (Tests) */ }
    space.classList.add('on');
    key('keydown');
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    space.addEventListener(type, (e) => {
      if (e.pointerId !== spaceFinger) return;
      spaceFinger = null;
      space.classList.remove('on');
      key('keyup');
    });
  }

  return { tick, duty: () => ({ ...want }) };
}
