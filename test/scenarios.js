// Katalog der Testszenarien für das Menü im Startbildschirm. Jedes Szenario ist eine Kombination der
// URL-Parameter von index.html (siehe README); "params" wird an ?autostart angehängt.
export const SCENARIO_GROUPS = [
  {
    title: 'Storyline (Funksprüche)',
    items: [
      { name: '0 · Start', desc: 'Abwurf durch das Mothership, Startdialog von Mr. Husk', params: '' },
      { name: '1 · 500 ft', desc: 'Mr. Husk lobt, $1.000 Bonus', params: 'checkpoint=1' },
      { name: '2 · 1.000 ft', desc: '$3.000 Bonus, Warnung vor Beben und gestörtem Funk', params: 'checkpoint=2' },
      { name: '3 · 1.750 ft', desc: 'Unbekannte Quelle: „Diese Augen …!“', params: 'checkpoint=3' },
      { name: '4 · 2.100 ft', desc: 'Bergmann #3422-2 freut sich auf die Rente', params: 'checkpoint=4' },
      { name: '5 · 2.500 ft', desc: 'Unbekannte Quelle: Hilferuf', params: 'checkpoint=5' },
      { name: '6 · 3.100 ft', desc: 'Bergmann: Tipp zum Kühler', params: 'checkpoint=6' },
      { name: '7 · 3.500 ft', desc: '$25.000 Bonus, Gastaschen, „bei 6.000 ft umkehren“', params: 'checkpoint=7' },
      { name: '8 · 4.100 ft', desc: 'Bergmann: letzter Funkspruch', params: 'checkpoint=8' },
      { name: '9 · 4.500 ft', desc: 'Pod #10043 findet die Motherload …', params: 'checkpoint=9' },
      { name: '10 · 6.200 ft', desc: 'Mr. Husk: Vertragsverstoß, umkehren!', params: 'checkpoint=10' },
      { name: '11 · 7.000 ft', desc: 'Mr. Husk droht mit „Entlassung“', params: 'checkpoint=11' },
      { name: '12 · Kern', desc: 'Einfahrt in den Kern: „Wir sehen uns in der Hölle!“', params: 'checkpoint=12' },
      { name: '13 · Wahre Gestalt', desc: 'Satan zeigt sich (im Original während des Endkampfs)', params: 'checkpoint=13' },
    ],
  },
  {
    title: 'Bohren & Terrain',
    items: [
      { name: 'Goldium-Tile', desc: 'Pod steht auf einem Goldium-Tile im Erdreich', params: 'scene=gem' },
      { name: 'Erdbeben', desc: 'Gerader Schacht, dann sofort ein Beben: alle Reihen ab 11 verrutschen (Zickzack)', params: 'scene=shaft&quake' },
      { name: 'Erster Fels', desc: 'Pod zwischen Felsbrocken: nach links bohren (in Fels) zeigt den Hinweis „Bohrer blockiert“', params: 'scene=boulders' },
      { name: 'Säule', desc: 'Pod auf einem einzelnen Block im Hohlraum', params: 'scene=pillar' },
      { name: 'Vorsprung', desc: 'Seitwärts bohren, darüber und darunter Hohlraum', params: 'scene=ledge' },
      { name: 'Lichtleck', desc: 'Scheinwerfer darf nicht durch Fels in die Höhle scheinen', params: 'scene=leak' },
      { name: 'Tief unten', desc: 'Gänge, Schacht und Höhle bei −5.600 ft (Rückwandlicht)', params: 'scene=deep' },
      { name: 'Magma', desc: 'Magmaeinschlüsse (Blasen, Fließen) neben einem Gang', params: 'scene=lava&zoom=5' },
      { name: 'Mineralien', desc: 'Alle 14 Sorten nebeneinander (oben)', params: 'scene=minerals&zoom=10' },
      { name: 'Mineralien tief', desc: 'Alle Sorten in 6.000 ft Tiefe', params: 'scene=minerals&row=400&zoom=10' },
      { name: 'Mineralien & Sonderfunde', desc: 'Alle 10 Mineralien und 4 Sonderfunde in einer Reihe zum Anbohren (größerer Laderaum und Tank)', params: 'scene=finds' },
    ],
  },
  {
    title: 'Oberfläche & Shops',
    items: [
      { name: 'Startdialog', desc: 'Funkspruch von Mr. Husk nach der Landung', params: 'scene=upgradeView&talk=0' },
      { name: 'Satan-Porträt', desc: 'Startdialog mit dem Satan-Porträt (für den Schluss-Funkspruch)', params: 'scene=upgradeView&talk=0&portrait=satan' },
      { name: 'Upgrade-Werkstatt', desc: 'Pod vor der Upgrade-Werkstatt', params: 'scene=upgradeView' },
      { name: 'Reparaturwerkstatt', desc: 'Pod vor der Reparaturwerkstatt', params: 'scene=repairView' },
      { name: 'Save-Pod', desc: 'Pod schwebt neben dem Save-Pod; nach rechts fliegen öffnet den Speicherdialog', params: 'scene=savePod' },
      { name: 'Oberfläche bei Nacht', desc: 'Gebäude, Sterne und Scheinwerfer um Mitternacht', params: 'scene=upgradeView&time=2160' },
      { name: 'Upgrade-Shop', desc: 'Shop direkt geöffnet', params: 'scene=upgradeView&shop=upgrade' },
      { name: 'Item-Shop', desc: 'Reparaturwerkstatt mit Items direkt geöffnet', params: 'scene=repairView&shop=repair' },
      { name: 'Tankstelle', desc: 'Tankstelle direkt geöffnet (eigene Musik)', params: 'scene=upgradeView&shop=fuel' },
      { name: 'Mineralverarbeitung', desc: 'Laderaum voller Mineralien, Verkauf direkt geöffnet', params: 'scene=cargo&shop=sell' },
    ],
  },
  {
    title: 'Items (werden sofort eingesetzt)',
    items: [
      { name: 'Reservetank', desc: '+25 L, Flasche dockt an', params: 'scene=gem&give=3&use=0' },
      { name: 'Nanobots', desc: '+30 HP, Schwarm um den Pod', params: 'scene=gem&give=3&use=1' },
      { name: 'Dynamit', desc: '3×3 Tiles, 31 Frames Pause', params: 'scene=gem&give=3&use=2' },
      { name: 'C4', desc: '5×5 Tiles, 47 Frames Pause', params: 'scene=gem&give=3&use=3' },
      { name: 'Dynamit im Fels', desc: 'Felsbrocken rundum, 3×3 brechen auseinander', params: 'scene=boulders&give=3&use=2' },
      { name: 'C4 im Fels', desc: 'Felsbrocken rundum, 5×5 brechen auseinander', params: 'scene=boulders&give=3&use=3' },
      { name: 'Quantenteleporter', desc: 'Zufälliger Sprung über die Oberfläche', params: 'scene=deep&give=3&use=4' },
      { name: 'Materietransmitter', desc: 'Sicher zurück an die Oberfläche', params: 'scene=deep&give=3&use=5' },
    ],
  },
  {
    title: 'Upgrades am Pod',
    items: [
      { name: 'Stufe 3', desc: 'Emerald-Bohrer, Stahl-Hülle', params: 'scene=gem&zoom=3&up=drill:3,hull:3' },
      { name: 'Stufe 5', desc: 'Diamant-Bohrer, Einsteinium-Hülle', params: 'scene=gem&zoom=3&up=drill:5,hull:5' },
      { name: 'Stufe 6', desc: 'Amazonite-Bohrer, Energieschild', params: 'scene=gem&zoom=3&up=drill:6,hull:6' },
    ],
  },
  {
    title: 'Endkampf',
    items: [
      // Alle mit typischer Endkampf-Ausstattung (endgameLoadout in test/scenes.js): Stufe 5 fast überall, 120 HP,
      // 100-L-Tank zu 60 % voll, einige Items, wertvolle Fracht
      { name: 'Kern erreichen', desc: 'Einfahrt in den Kern, Funkspruch, dann Phase 1 (Endkampf-Ausstattung)', params: 'checkpoint=12' },
      { name: 'Phase 1', desc: 'Mr. Husk: Stab und Laser-Monokel (Endkampf-Ausstattung)', params: 'battle=1' },
      { name: 'Satans Ausbruch', desc: 'Satan bricht aus dem Boden, danach Funkspruch 13', params: 'battle=breakout' },
      { name: 'Phase 2', desc: 'Satan: Faustschlag und Feuerbälle (Endkampf-Ausstattung)', params: 'battle=2' },
      { name: 'Sieg', desc: 'Beute-Auszahlung und neue Runde', params: 'battle=win' },
    ],
  },
  {
    title: 'Pod-Explosion',
    items: [
      { name: 'An der Oberfläche', desc: 'Pod zerbricht vor der Reparaturwerkstatt', params: 'scene=repairView&kill' },
      { name: 'In der Höhle', desc: 'Trümmer prallen von den Tunnelwänden ab', params: 'scene=deep&kill' },
    ],
  },
];

// Zuschaltbare Optionen, gelten für jedes Szenario
export const SCENARIO_OPTIONS = [
  { id: 'cash', label: 'Testgeld ($1.000.000)', params: 'cash=1000000' },
  { id: 'give', label: 'Alle Items ×5', params: 'give=5' },
  { id: 'up', label: 'Alle Upgrades maximal', params: 'up=drill:6,hull:6,engine:6,fuelTank:6,radiator:5,bay:5' },
  { id: 'night', label: 'Nacht', params: 'time=2160' },
];
