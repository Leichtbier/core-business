// Deutsche Texte. Schlüssel wie in en.js; fehlt einer, gilt der englische (src/i18n.js).
// Funktionen erhalten die Werte, die in den Text eingesetzt werden.
const P = (...parts) => parts.join('\n\n');
const HUSK = 'Mr. Husk', UNKNOWN = 'Unbekannte Quelle', MINER = 'Mars-Grabpod #3422-2';

export default {
  locale: 'de-DE',
  langButton: 'SPRACHE: DEUTSCH',

  // Ladebildschirm
  loading: 'Lade Modelle und Sounds …',
  loadingPct: (pct) => `Lade Modelle und Sounds … ${pct} %`,
  preparing: 'Bereite Grafik vor …',
  loadError: (msg) => 'Fehler beim Laden: ' + msg,

  // Startbildschirm
  tagline: 'Eine three.js-Neuauflage von Motherload, dem Flash-Klassiker von XGen Studios',
  start: 'SPIEL STARTEN',
  load: 'SPIEL LADEN',
  keysDrive: 'Fahren · seitwärts bohren · fliegen',
  keysUp: 'Rotor: abheben und fliegen',
  keysDown: 'Nach unten bohren',
  keysItems: 'Items: Reservetank, Nanobots, Dynamit, C4, Quantenteleporter, Materietransmitter',
  keysPause: 'Pause · Musik an/aus',
  keysSaveLabel: 'Save-Pod',
  keysSave: 'Spielstand speichern: den schwebenden Save-Pod über der Oberfläche anfliegen',
  intro: 'Grabe Mineralien aus, verkaufe sie an der Oberfläche, tanke nach und rüste deinen Pod auf. '
    + 'Nach oben bohren geht nicht. Behalte Tank und Hülle im Blick!',
  startHints: '<span><kbd>↑</kbd><kbd>↓</kbd> Auswahl</span><span><kbd>Enter</kbd> bestätigen</span><span><kbd>L</kbd> laden</span>',
  noSave: 'Kein gespeicherter Spielstand vorhanden!',
  saveInfo: (when, cash, level) => `Gespeicherter Spielstand vom ${when} · ${cash} · Level ${level}`,
  volumeTitle: 'Lautstärke',
  musicLabel: 'MUSIK',
  sfxLabel: 'EFFEKTE',
  musicMuteTitle: 'Musik an/aus (N)',
  sfxMuteTitle: 'Effekte an/aus',

  // Pause und Todesbildschirm
  resume: 'FORTSETZEN',
  mainMenu: 'STARTMENÜ',
  pauseHints: '<span><kbd>Enter</kbd> bestätigen</span><span><kbd>P</kbd> <kbd>Esc</kbd> weiterspielen</span>',
  podDestroyed: 'POD ZERSTÖRT',
  loadLast: 'LETZTEN SPIELSTAND LADEN',
  newGame: 'NEUES SPIEL',
  menuHints: '<span><kbd>↑</kbd><kbd>↓</kbd> Auswahl</span><span><kbd>Enter</kbd> bestätigen</span>',
  deathCrash: 'Zu hart aufgeschlagen.',
  deathLava: 'In Lava gebohrt.',
  deathGas: 'Eine Gastasche ist explodiert.',
  deathHusk: 'Mr. Husk hat dich erwischt.',
  deathSatan: 'Satan hat dich erwischt.',
  deathFuel: 'Der Tank ist leer.',
  deathHull: 'Die Hülle hat versagt.',
  deathTest: 'Testszenario',
  deathStats: (score, depth) => `Score ${score} · maximale Tiefe ${depth} ft`,

  // Sieg
  victory: 'SIEG!',
  victorySub: 'Satan ist besiegt, der Mars ist befreit. Die Beute gehört dir:',
  balance: 'GUTHABEN',
  victoryHint: 'Weiter geht es auf Level <b id="nextLevel"></b>: alles wird wertvoller verteidigt, Mineralien bringen weniger. '
    + 'Upgrades und Items sind weg, dein Geld bleibt.',
  nextRound: 'NEUE RUNDE',
  victoryHints: '<span><kbd>Enter</kbd> weiter</span>',

  // Funksprüche, Fundberichte, Hinweise
  transHead: 'FUNKSPRUCH EMPFANGEN',
  transEnd: '*** Übertragung beendet *** · ↑↓ blättern · weiter mit anderer Taste',
  continue: 'WEITER',
  roleCeo: 'CEO · Husk Heavy Industries',
  roleMiner: 'Bergbaupilot',
  roleStatic: 'Signal gestört',
  findHead: 'SONDERFUND GEBORGEN',
  findRole: 'Bordcomputer · Fundanalyse',
  credit: (value) => `Gutschrift: ${value}`,
  noticeRole: 'Bordcomputer · Bohranalyse',

  // Save-Pod
  saveAsk: 'Möchtest du deinen Spielstand speichern?<br><span class="note">(Speichern setzt deinen aktuellen Score zurück)</span>',
  saved: 'Spielstand gespeichert!',
  savedOver: '<br><span class="note">(Vorheriger Spielstand überschrieben)</span>',
  saveFailed: 'Speichern fehlgeschlagen:<br><span class="note">Der Browser erlaubt dieser Seite keinen lokalen Speicher.</span>',
  saveYes: 'JA, SPEICHERN',
  saveNo: 'NEIN',
  saveHints: '<span><kbd>←</kbd><kbd>→</kbd> Auswahl</span><span><kbd>Enter</kbd> bestätigen</span><span><kbd>J</kbd> ja</span><span><kbd>N</kbd> <kbd>Esc</kbd> nein</span>',

  // Shops
  leave: 'VERLASSEN',
  shopHints: {
    fuel: '<span><kbd>←</kbd><kbd>→</kbd> Menge</span><span><kbd>Enter</kbd> tanken</span><span><kbd>Esc</kbd> verlassen</span>',
    sell: '<span><kbd>Enter</kbd> verkaufen</span><span><kbd>Esc</kbd> verlassen</span>',
    repair: '<span><kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> Auswahl</span><span><kbd>Enter</kbd> reparieren / kaufen</span><span><kbd>Esc</kbd> verlassen</span>',
    upgrade: '<span><kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> Auswahl</span><span><kbd>Q</kbd><kbd>E</kbd> Kategorie</span><span><kbd>Enter</kbd> kaufen</span><span><kbd>Esc</kbd> verlassen</span>',
  },
  fuelMeter: 'TANK · $1 pro Liter',
  fillUp: 'VOLLTANKEN',
  hullMeter: 'HÜLLE · $15 pro HP',
  repairAll: 'KOMPLETT',
  itemKey: 'Taste',
  colMineral: 'MINERAL',
  colQty: 'MENGE',
  colPrice: 'PREIS',
  colValue: 'WERT',
  total: 'GESAMT',
  bayEmpty: 'Der Laderaum ist leer.',
  sellAll: 'ALLES VERKAUFEN',
  lessHeat: (pct) => `${pct}% weniger Hitzeschaden`,
  drillSpeed: (v) => `Bohrtempo ${v}`,
  slots: 'Plätze',
  installed: 'INSTALLIERT',
  nextLevel: 'NÄCHSTE STUFE',
  shopTitles: { fuel: 'TANKSTELLE', sell: 'MINERALIENANKAUF', repair: 'REPARATURWERKSTATT', upgrade: 'UPGRADES' },
  itemsHead: 'ITEMS',

  // Meldungen der Shops (src/sim.js)
  noCash: 'Nicht genug Geld!',
  itemBought: (name, key) => `${name} gekauft. (Einsatz mit »${key}«)`,
  tankFull: 'Der Tank ist voll!',
  fuelBought: (cost, full) => `Für $${cost} getankt.` + (full ? ' (Tank voll)' : ''),
  noDamage: 'Keine Schäden zu reparieren!',
  repaired: (cost, full) => `Reparaturen für $${cost} ausgeführt.` + (full ? ' (Hülle 100 %)' : ''),
  nothingToSell: 'Du hast keine Mineralien zum Verkaufen!',
  soldAll: (total) => `Alle Mineralien für $${total} verkauft`,
  upgradeOwned: 'Dieses Upgrade ist schon eingebaut!',
  upgradeBought: (name) => `${name} eingebaut!`,

  // HUD und Einblendungen am Pod
  hudFuel: 'TANK',
  hudHull: 'HÜLLE',
  hudCargo: 'LADUNG',
  lowFuel: 'TANK FAST LEER!',
  outOfFuel: 'TANK LEER!',
  score: 'Score',
  bayFull: 'LADERAUM VOLL!',
  wow: 'Wow!',
  itemUsed: (name) => name + ' eingesetzt',
  itemEmpty: (name) => `${name}: nichts mehr da!`,

  // Namen, Index wie MINERALS in src/constants.js; die erfundenen Metalle behalten ihren Namen
  minerals: [
    'Ironium', 'Bronzium', 'Silverium', 'Goldium', 'Platinium', 'Einsteinium', 'Smaragd', 'Rubin', 'Diamant', 'Amazonit',
    'Dinosaurierknochen', 'Schatz', 'Marsianisches Skelett', 'Religiöses Artefakt',
    'Mr. Husks Kevlaranzug', 'Mr. Husks Höllenstab', 'Mr. Husks Lasermonokel', 'Satans Hufe', 'Satans Hörner',
    'Satans böses Auge (rechts)', 'Satans böses Auge (links)', 'Satans Kessel der ewigen Höllenfeuer',
    'Belohnung der Marsianer für den wiederhergestellten Frieden', '250.000 Aktien der Husk HI Inc.',
  ],
  // Index wie ITEMS
  items: [
    { name: 'Reservetank', desc: 'Tragbarer Vorrat – füllt sofort bis zu 25 Liter nach.' },
    { name: 'Reparatur-Nanobots', desc: 'Reparieren jederzeit und überall bis zu 30 Schadenspunkte.' },
    { name: 'Dynamit', desc: 'Sprengt einen kleinen Bereich um deinen Pod frei.' },
    { name: 'Plastiksprengstoff', desc: 'Eine gewaltige Explosion, die einen großen Bereich um deinen Pod freiräumt.' },
    { name: 'Quantenteleporter', desc: 'Teleportiert dich irgendwohin über die Oberfläche. (Ergebnis kann abweichen)' },
    { name: 'Materietransmitter', desc: 'Bringt dich sicher und genau zurück an die Oberfläche.' },
  ],
  // Schlüssel und Stufen wie UPGRADES
  upgrades: {
    drill: {
      title: 'BOHRER', unit: 'ft/s',
      names: ['Standardbohrer', 'Silvide-Bohrer', 'Goldium-Bohrer', 'Smaragdbohrer', 'Rubinbohrer', 'Diamantbohrer', 'Amazonitbohrer'],
    },
    hull: {
      title: 'HÜLLE', unit: 'HP',
      names: ['Standardhülle', 'Ironium-Hülle', 'Bronzium-Hülle', 'Stahlhülle', 'Platinium-Hülle', 'Einsteinium-Hülle', 'Energieschild-Hülle'],
    },
    engine: {
      title: 'MOTOR', unit: 'PS',
      names: ['Standardmotor', 'V4 1600 cm³', 'V4 2,0 l Turbo', 'V6 3,8 l', 'V8 5,0 l Kompressor', 'V12 6,0 l', 'V16 Jag-Motor'],
    },
    fuelTank: {
      title: 'TANK', unit: 'L',
      names: ['Mikrotank', 'Mitteltank', 'Großtank', 'Riesentank', 'Titanentank', 'Leviathantank', 'Flüssigkompressionstank'],
    },
    radiator: {
      title: 'KÜHLER', unit: '%',
      names: ['Standardlüfter', 'Doppellüfter', 'Einzelturbine', 'Doppelturbine', 'Puron-Kühlung', 'Freon-Dreifachturbine'],
    },
    bay: {
      title: 'LADERAUM', unit: 'slots',
      names: ['Mikro-Laderaum', 'Mittlerer Laderaum', 'Großer Laderaum', 'Riesiger Laderaum', 'Titanischer Laderaum', 'Leviathan-Laderaum'],
    },
  },

  // Funksprüche, Index wie TRANSMISSIONS in src/constants.js. Texte sinngemäß nach dem Original, nicht wörtlich.
  transmissions: [
    {
      sender: HUSK,
      msg: P(
        'Willkommen auf dem Mars! Kleiner Schönheitsfehler im Ablauf: Auf dem Flug hat niemand an deinen Tank gedacht. '
          + 'Fahr als Erstes nach links zur Tankstelle und mach ihn voll.',
        'Seit hier unten diese merkwürdigen Dinge passieren, will kaum noch jemand für mich graben. Deshalb zahle ich dir '
          + 'einen ordentlichen Aufschlag. Der Pod, den ich dir hingestellt habe, ist Grundausstattung, aber er tut, was er soll.',
        'Ab jetzt bist du auf dich allein gestellt: Die Siedler, die es rechtzeitig geschafft haben, sind längst weg. '
          + 'Die Läden laufen aber vollautomatisch weiter. Dort verkaufst du Mineralien, tankst, rüstest auf und kaufst Ausrüstung.',
        'Dein Auftrag ist einfach: Mineralien abbauen und an die Oberfläche bringen. Je tiefer du gräbst, desto wertvoller wird es.',
        'Und vergiss das Tanken nicht. Viel Erfolg da unten!'),
    },
    {
      sender: HUSK,
      msg: P('Sehr gut! Du hast dich offenbar schnell an den Marsboden gewöhnt.',
        'Hier eine kleine Anerkennung, damit es weiter vorangeht.'),
    },
    {
      sender: HUSK,
      msg: P('Glückwunsch zu 1000 Fuß Tiefe! Für die starke Leistung habe ich dir einen Bonus überwiesen.',
        'Unsere Sensoren messen heftige Erschütterungen aus dem Planetenkern. Sie lösen offenbar Erdbeben aus und stören '
          + 'obendrein den Funkverkehr. Falls bei dir verstümmelte oder fehlgeleitete Nachrichten ankommen: einfach ignorieren.',
        'Weiter so!'),
    },
    {
      sender: UNKNOWN,
      msg: P('… diese Augen … oh Gott, DIESE AUGEN!!!'),
    },
    {
      sender: MINER,
      msg: P('Hätte nicht gedacht, hier unten noch ein Signal zu empfangen. Seit drei Jahren bin ich der letzte Gräber, '
        + 'der nicht spurlos verschwunden ist.',
      'Nächste Woche ist Schluss: Dann setze ich mich mit meiner Frau und unseren drei Töchtern reich auf einem '
        + 'Jupitermond zur Ruhe.'),
    },
    {
      sender: UNKNOWN,
      msg: P('Hört mich jemand?! Ich brauche dringend Hilfe!! Ich spüre meine Beine nicht mehr – oh Gott, er kommt zurück …',
        'NEIN!! BITTE, HELFT MIR!!! AAAHHHGK…'),
    },
    {
      sender: MINER,
      msg: P('Wie läuft\'s, Neuling? Ein Tipp unter Kollegen: Spar nicht am Kühler.',
        'Ich bin eben in eine Lavatasche gebrochen, aber meine Doppelturbine hat die Hitze weggeschafft, und der Rumpf hat '
          + 'kaum etwas abbekommen. Das hat mir wahrscheinlich das Leben gerettet.'),
    },
    {
      sender: HUSK,
      msg: P('Schon wieder Glückwunsch! Du bist weiter gekommen, als ich je erwartet hätte …',
        'Wie auch immer, der nächste Bonus ist unterwegs. Vorsicht vor Erdgastaschen: Man sieht sie nicht, und sie gehen '
          + 'hoch wie nichts.',
        'Und noch etwas: Dein Höhenmesser ist nur bis etwa 6000 Fuß ausgelegt. Spätestens dann kehrst du um. '
          + 'Wirklich – tiefer ist es einfach zu gefährlich.'),
    },
    {
      sender: MINER,
      msg: P('Festgesteckt … in einer Felsspalte.', 'Das Beben hat meinen Bohrer zerlegt, und der Tank ist leer.',
        'Das wird wohl mein letzter Funkspruch.', 'Sagt meinen Mädchen … dass ich sie lieb habe … ich –',
        'was? DU?! Was machst du denn hier unt– AAARGH!'),
    },
    {
      sender: 'Mars-Grabpod #10043',
      msg: P('JA!!! DAS IST ES!!! ICH HAB DIE MOTHERLOAD GEFUNDEN!!! Ich bin reich, STINKREICH!!',
        'Moment, was zum …?! NEIN! DAS KANN NICHT SEIN!!! OH GOTT!!'),
    },
    {
      sender: HUSK,
      msg: P('Du verstößt gegen deinen Arbeitsvertrag! Kehr sofort um!'),
    },
    {
      sender: HUSK,
      msg: P('Komm sofort an die Oberfläche zurück, oder du wirst … beseitigt.', 'Äh … entlassen, meine ich!'),
    },
    {
      sender: HUSK,
      msg: P('HAHAHA!! DU NARR!!!',
        'Ich habe dich gewarnt … jetzt bleibt mir keine Wahl, als dich zu erledigen. Du hast meinen Fabriken gute Dienste '
          + 'geleistet, aber jetzt nehme ich mir meine Maschine, mein Geld – und dein erbärmliches Leben.',
        'WIR SEHEN UNS IN DER HÖLLE!!!'),
    },
    {
      sender: HUSK,
      msg: P('MWAHAHAHA! Du Einfaltspinsel!!', 'Glaubst du wirklich, du kannst mich besiegen?',
        'Ich bin der Herr allen BÖSEN!', 'SIEH MEINE WAHRE GESTALT!!!'),
    },
  ],

  // Fundberichte beim Bergen eines Sonderfunds (nicht im Original, dort nur "Wow!"): Index wie MINERALS (10..13).
  // Der Wert wird im Text ergänzt; er entspricht MINERALS[i].value und wird sofort gutgeschrieben.
  finds: {
    10: {
      title: 'Fossile Knochen',
      msg: 'Fossile Knochen geborgen.\n\nAnalyse: Oberschenkel und Wirbel eines großen Echsenwesens, rund 70 Millionen Jahre alt. Auf dem Mars gab es also einmal Leben, das größer war als ein Grabpod.\n\nEin Naturkundemuseum auf der Erde kauft den Fund.',
    },
    11: {
      title: 'Schatztruhe',
      msg: 'Verschlossene Truhe geborgen.\n\nInhalt: Goldmünzen und geschliffene Steine unbekannter Herkunft, die Prägung passt zu keiner Kolonie. Jemand war vor den Siedlern hier – und hatte es offenbar eilig, das hier zu verstecken.\n\nDer Inhalt wird zum Goldpreis verrechnet.',
    },
    12: {
      title: 'Marsianisches Skelett',
      msg: 'Skelett geborgen.\n\nDer Schädel passt zu keiner bekannten Art: hoher Hirnschädel, riesige Augenhöhlen. Seltsam sind die Kratzspuren am Knochen – sie sehen frisch aus.\n\nDas Labor von Husk Heavy Industries übernimmt den Fund und bittet um Diskretion.',
    },
    13: {
      title: 'Religiöses Artefakt',
      msg: 'Artefakt geborgen.\n\nEin violetter Kristall in einer Fassung aus Gold, übersät mit Zeichen, die in den tieferen Schichten immer wieder auftauchen. Es ist warm, obwohl das Gestein hier kalt ist. Und es scheint leise zu summen.\n\nEin Sammler bietet einen hohen Betrag – anonym.',
    },
  },

  // Hinweise des Bordcomputers (nicht im Original), erscheinen einmal im Fenster der Funksprüche
  notices: {
    rock: {
      head: 'BOHRER BLOCKIERT',
      title: 'Hartgestein',
      msg: 'Bohrversuch abgebrochen: Hartgestein.\n\nDer Bohrkopf rutscht ab, als wäre er aus Butter. Dieses Gestein ist härter als alles, was sich in einen Bohrer einspannen lässt – auch ein besserer würde hier nur Funken schlagen.\n\nBleibt also nur, außen herum zu graben … Oder gibt es vielleicht doch eine andere Möglichkeit? Man müsste nur ein wenig Druck machen.',
    },
  },
};
