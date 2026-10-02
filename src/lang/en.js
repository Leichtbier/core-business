// Englische Texte (Standardsprache). Jeder Schlüssel, den das Spiel verwendet, muss hier stehen; de.js übersetzt sie.
// Funktionen erhalten die Werte, die in den Text eingesetzt werden.
import { MINERALS, UPGRADES, ITEMS } from '../constants.js';

const P = (...parts) => parts.join('\n\n');
const HUSK = 'Mr. Husk', UNKNOWN = 'Unknown source', MINER = 'Mars Mining Pod #3422-2';

export default {
  locale: 'en-US',

  // Ladebildschirm
  loading: 'Loading models and sounds …',
  loadingPct: (pct) => `Loading models and sounds … ${pct} %`,
  preparing: 'Preparing graphics …',
  loadError: (msg) => 'Error while loading: ' + msg,

  // Startbildschirm
  tagline: 'A three.js remake of Motherload, the Flash classic by XGen Studios',
  start: 'START GAME',
  load: 'CONTINUE GAME',
  keysDrive: 'Drive · drill sideways · fly',
  keysUp: 'Rotor: take off and fly',
  keysDown: 'Drill down',
  keysItems: 'Items: reserve tank, nanobots, dynamite, C4, quantum teleporter, matter transmitter',
  keysPause: 'Pause · music on/off',
  keysSaveLabel: 'Save pod',
  keysSave: 'Save the game: fly into the hovering save pod above the surface',
  intro: 'Dig up minerals, sell them at the surface, refuel and upgrade your pod. '
    + 'You can\'t drill upward. Keep an eye on fuel and hull!',
  startHints: '<span><kbd>↑</kbd><kbd>↓</kbd> select</span><span><kbd>Enter</kbd> confirm</span><span><kbd>L</kbd> continue</span>',
  noSave: 'No saved game found!',
  saveInfo: (when, cash, level) => `Saved game from ${when} · ${cash} · Level ${level}`,
  volumeTitle: 'Volume',
  pauseTitle: 'Pause',
  musicLabel: 'MUSIC',
  sfxLabel: 'EFFECTS',
  musicMuteTitle: 'Music on/off (N)',
  sfxMuteTitle: 'Effects on/off',

  // Pause und Todesbildschirm
  resume: 'RESUME',
  mainMenu: 'MAIN MENU',
  pauseHints: '<span><kbd>Enter</kbd> confirm</span><span><kbd>P</kbd> <kbd>Esc</kbd> resume</span>',
  podDestroyed: 'POD DESTROYED',
  loadLast: 'LOAD LAST SAVE',
  newGame: 'NEW GAME',
  menuHints: '<span><kbd>↑</kbd><kbd>↓</kbd> select</span><span><kbd>Enter</kbd> confirm</span>',
  deathCrash: 'You hit the ground too hard.',
  deathLava: 'You drilled into lava.',
  deathGas: 'A gas pocket exploded.',
  deathHusk: 'Mr. Husk got you.',
  deathSatan: 'Satan got you.',
  deathFuel: 'The tank ran dry.',
  deathHull: 'The hull gave out.',
  deathTest: 'Test scenario',
  deathStats: (score, depth) => `Score ${score} · max. depth ${depth} ft`,

  // Sieg
  victory: 'VICTORY!',
  victorySub: 'Satan is defeated, Mars is free. The loot is yours:',
  balance: 'BALANCE',
  victoryHint: 'On to level <b id="nextLevel"></b>: everything is defended more fiercely, minerals are worth less. '
    + 'Upgrades and items are gone, your money stays.',
  nextRound: 'NEXT ROUND',
  victoryHints: '<span><kbd>Enter</kbd> continue</span>',

  // Funksprüche, Fundberichte, Hinweise
  transHead: 'INCOMING TRANSMISSION',
  transEnd: '*** End of transmission *** · ↑↓ scroll · any other key to continue',
  continue: 'CONTINUE',
  roleCeo: 'CEO · Husk Heavy Industries',
  roleMiner: 'Mining pilot',
  roleStatic: 'Signal disrupted',
  findHead: 'SPECIAL FIND RECOVERED',
  findRole: 'On-board computer · find analysis',
  credit: (value) => `Credited: ${value}`,
  noticeRole: 'On-board computer · drilling analysis',

  // Save-Pod
  saveAsk: 'Do you want to save your game?<br><span class="note">(Saving resets your current score)</span>',
  saved: 'Game saved!',
  savedOver: '<br><span class="note">(Previous save overwritten)</span>',
  saveFailed: 'Saving failed:<br><span class="note">The browser doesn\'t allow this page to use local storage.</span>',
  saveYes: 'YES, SAVE',
  saveNo: 'NO',
  saveHints: '<span><kbd>←</kbd><kbd>→</kbd> select</span><span><kbd>Enter</kbd> confirm</span><span><kbd>Y</kbd> yes</span><span><kbd>N</kbd> <kbd>Esc</kbd> no</span>',

  // Shops
  leave: 'LEAVE',
  shopHints: {
    fuel: '<span><kbd>←</kbd><kbd>→</kbd> amount</span><span><kbd>Enter</kbd> refuel</span><span><kbd>Esc</kbd> leave</span>',
    sell: '<span><kbd>Enter</kbd> sell</span><span><kbd>Esc</kbd> leave</span>',
    repair: '<span><kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> select</span><span><kbd>Enter</kbd> repair / buy</span><span><kbd>Esc</kbd> leave</span>',
    upgrade: '<span><kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> select</span><span><kbd>Q</kbd><kbd>E</kbd> category</span><span><kbd>Enter</kbd> buy</span><span><kbd>Esc</kbd> leave</span>',
  },
  fuelMeter: 'TANK · $1 per liter',
  fillUp: 'FILL UP',
  hullMeter: 'HULL · $15 per HP',
  repairAll: 'FULL REPAIR',
  itemKey: 'Key',
  colMineral: 'MINERAL',
  colQty: 'QTY',
  colPrice: 'PRICE',
  colValue: 'VALUE',
  total: 'TOTAL',
  bayEmpty: 'The cargo bay is empty.',
  sellAll: 'SELL ALL',
  lessHeat: (pct) => `${pct}% less heat damage`,
  drillSpeed: (v) => `Drill speed ${v}`,
  slots: 'slots',
  installed: 'INSTALLED',
  nextLevel: 'NEXT LEVEL',
  shopTitles: { fuel: 'FUEL STATION', sell: 'MINERAL PROCESSING', repair: 'REPAIR SHOP', upgrade: 'UPGRADES' },
  itemsHead: 'ITEMS',

  // Meldungen der Shops (src/sim.js), Wortlaut wie im Original
  noCash: 'Not enough cash!',
  itemBought: (name, key) => `${name} purchased. ('${key}' to use)`,
  tankFull: 'Tank is Full!',
  fuelBought: (cost, full) => `$${cost} of fuel purchased.` + (full ? ' (Tank Full)' : ''),
  noDamage: 'No damage to repair!',
  repaired: (cost, full) => `$${cost} of repairs performed.` + (full ? ' (Hull 100%)' : ''),
  nothingToSell: 'You have no minerals to sell!',
  soldAll: (total) => `Sold all minerals for $${total}`,
  upgradeOwned: 'Upgrade already installed!',
  upgradeBought: (name) => `${name} installed!`,

  // HUD und Einblendungen am Pod
  hudFuel: 'FUEL',
  hudHull: 'HULL',
  hudCargo: 'CARGO',
  lowFuel: 'LOW FUEL!',
  outOfFuel: 'OUT OF FUEL!',
  score: 'Score',
  bayFull: 'CARGO BAY FULL!',
  wow: 'Wow!',
  itemUsed: (name) => 'Used ' + name,
  itemEmpty: (name) => `No ${name}!`,

  // Namen wie im Original (src/constants.js)
  minerals: MINERALS.map((m) => m.name),
  items: ITEMS.map(({ name, desc }) => ({ name, desc })),
  upgrades: Object.fromEntries(Object.entries(UPGRADES).map(([k, u]) => [k, { title: u.title, unit: u.unit, names: u.names }])),

  // Funksprüche, Index wie TRANSMISSIONS in src/constants.js
  transmissions: [
    {
      sender: HUSK,
      msg: P(
        'Welcome to Mars! One small hitch in the plan: nobody thought about your tank during the flight. '
          + 'First thing, drive left to the fuel station and fill it up.',
        'Ever since these strange things started happening down here, hardly anyone wants to dig for me anymore. That\'s '
          + 'why I\'m paying you a decent premium. The pod I left for you is basic equipment, but it does its job.',
        'From now on you\'re on your own: the settlers who got out in time are long gone. The shops still run fully '
          + 'automatically, though. That\'s where you sell minerals, refuel, upgrade and buy equipment.',
        'Your job is simple: mine minerals and bring them to the surface. The deeper you dig, the more they\'re worth.',
        'And don\'t forget to refuel. Good luck down there!'),
    },
    {
      sender: HUSK,
      msg: P('Very good! You seem to have gotten used to Martian soil quickly.',
        'Here\'s a small token of appreciation to keep things moving.'),
    },
    {
      sender: HUSK,
      msg: P('Congratulations on reaching 1,000 feet! I\'ve wired you a bonus for the strong performance.',
        'Our sensors are picking up heavy tremors from the planet\'s core. They seem to be triggering earthquakes and '
          + 'interfering with radio traffic as well. If garbled or misrouted messages reach you: just ignore them.',
        'Keep it up!'),
    },
    {
      sender: UNKNOWN,
      msg: P('… those eyes … oh God, THOSE EYES!!!'),
    },
    {
      sender: MINER,
      msg: P('Didn\'t think I\'d still pick up a signal down here. For three years I\'ve been the last digger '
        + 'who hasn\'t vanished without a trace.',
      'Next week I\'m done: my wife, our three daughters and I are retiring rich to one of Jupiter\'s moons.'),
    },
    {
      sender: UNKNOWN,
      msg: P('Can anyone hear me?! I need help, now!! I can\'t feel my legs anymore – oh God, he\'s coming back …',
        'NO!! PLEASE, HELP ME!!! AAAHHHGK…'),
    },
    {
      sender: MINER,
      msg: P('How\'s it going, rookie? A tip between colleagues: don\'t skimp on the radiator.',
        'I just broke into a lava pocket, but my dual turbines got rid of the heat and the hull barely took a scratch. '
          + 'That probably saved my life.'),
    },
    {
      sender: HUSK,
      msg: P('Congratulations yet again! You\'ve made it further than I ever expected …',
        'Anyway, the next bonus is on its way. Watch out for natural gas pockets: you can\'t see them, and they go off '
          + 'like nothing else.',
        'One more thing: your altimeter is only rated to about 6,000 feet. That\'s where you turn back, at the latest. '
          + 'Really – any deeper is simply too dangerous.'),
    },
    {
      sender: MINER,
      msg: P('Stuck … in a rock crevice.', 'The quake wrecked my drill, and the tank is empty.',
        'This is probably my last transmission.', 'Tell my girls … that I love them … I –',
        'what? YOU?! What are you doing down he– AAARGH!'),
    },
    {
      sender: 'Mars Mining Pod #10043',
      msg: P('YES!!! THIS IS IT!!! I FOUND THE MOTHERLOAD!!! I\'m rich, FILTHY RICH!!',
        'Wait, what the …?! NO! THAT CAN\'T BE!!! OH GOD!!'),
    },
    {
      sender: HUSK,
      msg: P('You are in breach of your employment contract! Turn back at once!'),
    },
    {
      sender: HUSK,
      msg: P('Return to the surface immediately, or you will be … eliminated.', 'Er … dismissed, I mean!'),
    },
    {
      sender: HUSK,
      msg: P('HAHAHA!! YOU FOOL!!!',
        'I warned you … now I have no choice but to finish you off. You\'ve served my factories well, but now I\'m '
          + 'taking back my machine, my money – and your miserable life.',
        'SEE YOU IN HELL!!!'),
    },
    {
      sender: HUSK,
      msg: P('MWAHAHAHA! You simpleton!!', 'Do you really think you can defeat me?',
        'I am the lord of all EVIL!', 'BEHOLD MY TRUE FORM!!!'),
    },
  ],

  // Fundberichte beim Bergen eines Sonderfunds, Index wie MINERALS (10..13)
  finds: {
    10: {
      title: 'Fossil Bones',
      msg: 'Fossil bones recovered.\n\nAnalysis: femur and vertebrae of a large reptilian creature, about 70 million years old. So Mars was once home to life bigger than a mining pod.\n\nA natural history museum on Earth is buying the find.',
    },
    11: {
      title: 'Treasure Chest',
      msg: 'Locked chest recovered.\n\nContents: gold coins and cut stones of unknown origin; the minting matches no known colony. Someone was here before the settlers – and was apparently in a hurry to hide this.\n\nThe contents are credited at the price of gold.',
    },
    12: {
      title: 'Martian Skeleton',
      msg: 'Skeleton recovered.\n\nThe skull matches no known species: a high cranium, huge eye sockets. Oddly, the scratch marks on the bone look fresh.\n\nThe Husk Heavy Industries lab is taking over the find and asks for discretion.',
    },
    13: {
      title: 'Religious Artifact',
      msg: 'Artifact recovered.\n\nA violet crystal in a gold setting, covered in symbols that keep turning up in the deeper layers. It is warm, although the rock around it is cold. And it seems to hum quietly.\n\nA collector is offering a large sum – anonymously.',
    },
  },

  // Hinweise des Bordcomputers
  notices: {
    rock: {
      head: 'DRILL BLOCKED',
      title: 'Hard rock',
      msg: 'Drilling aborted: hard rock.\n\nThe drill head slips off as if it were made of butter. This rock is harder than anything you could fit into a drill – even a better one would only strike sparks here.\n\nSo the only option is to dig around it … Or is there another way after all? You\'d just have to apply a little pressure.',
    },
  },
};
