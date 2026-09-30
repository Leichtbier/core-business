import { EARTH_WIDTH, EARTH_HEIGHT, TILE, T } from './constants.js';

// AS2 random(n): ganze Zahl in [0, n)
export const random = (n) => Math.floor(Math.random() * n);

export class World {
  constructor() {
    this.width = EARTH_WIDTH;
    this.height = EARTH_HEIGHT;
    this.tiles = new Int16Array(this.width * this.height);
    this.rot = new Uint8Array(this.width * this.height);
    this.version = 0; // wird bei jeder Änderung erhöht (für den Renderer)
    this.lagSolid = -1; // Index des Tiles, das trotz Bohrbeginn noch als massiv gilt
    this.generate();
  }

  idx(x, y) { return x * this.height + y; }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.width && y < this.height; }

  get(x, y) { return this.inside(x, y) ? this.tiles[this.idx(x, y)] : undefined; }
  set(x, y, v) {
    if (!this.inside(x, y)) return;
    this.tiles[this.idx(x, y)] = v;
    this.version++;
  }
  rotation(x, y) { return this.inside(x, y) ? this.rot[this.idx(x, y)] : 0; }

  // Erdbeben (earthQuake im Original): Reihe y samt Tile-Drehung um ein Feld verschieben, am Rand umbrechen.
  // dir -1: nach links (Feld x übernimmt x+1, das linke Ende kommt rechts wieder herein), +1: nach rechts
  shiftRow(y, dir) {
    const W = this.width, t = [], r = [];
    for (let x = 0; x < W; x++) { t.push(this.tiles[this.idx(x, y)]); r.push(this.rot[this.idx(x, y)]); }
    for (let x = 0; x < W; x++) {
      const from = (x - dir + W) % W;
      this.tiles[this.idx(x, y)] = t[from];
      this.rot[this.idx(x, y)] = r[from];
    }
    this.version++;
  }

  // getTileCollisionName: alles > -100 außer 0 ist massiv.
  // Im Original wird die Kollisionsgrafik eines angebohrten Tiles erst per reloadTile() mitten in der
  // Bohranimation entfernt; bis dahin bleibt es massiv (lagSolid). Ohne das driftet der Pod in Wände.
  solidTile(x, y) {
    if (this.lagSolid !== -1 && this.inside(x, y) && this.idx(x, y) === this.lagSolid) return true;
    const t = this.get(x, y);
    return t !== undefined && t !== 0 && t > -100;
  }

  // Ersatz für earthMC.c.hitTest(px, py): Tiles sind um (x*50, y*50) zentriert
  hit(px, py) {
    return this.solidTile(Math.floor(px / TILE + 0.5), Math.floor(py / TILE + 0.5));
  }

  generate() {
    const H = this.height;
    const mineralRate = 65;
    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < H; y++) {
        const i = this.idx(x, y);
        this.rot[i] = random(4);
        let t;
        if (y < 5) t = 0;
        else if (y === 5) t = random(2) - 2;
        else if (y === H - 12) t = random(2) - 7;
        else if (y >= H - 11 && y < H - 5) t = T.BLANK;
        else if (y === H - 5) t = -(9 + random(4));
        else if (y > H - 5) t = -8;
        else {
          if (random(5) === 0) {
            // Mineral
            const spread = Math.floor(y / mineralRate) + 2;
            if (random(5) === 0) {
              if (random(5) === 0) {
                if (random(4) === 0 && y > 80) {
                  t = random(4) + 16; // Sonderfund
                  if (t === 17) this.rot[i] = 0;
                } else {
                  t = Math.min(random(spread) + 8, 15);
                }
              } else {
                t = Math.min(random(spread) + 7, 15);
              }
            } else {
              t = Math.min(random(spread) + 6, 15);
            }
          } else {
            t = random(5) + 1;
            if (y * 1.5 > H / 3) {
              if (random(Math.floor(((H - y) / H) * 15)) === 0) {
                if ((y / 2) * 1.5 > H / 3 && random(2) === 0) {
                  if ((y / 3) * 1.5 > H / 3 && random(2) === 0) t = T.GAS;
                  else t = 28 + random(3);
                } else {
                  t = 25 + random(3);
                }
              }
            }
          }
          if (random(3) === 0) t = 0;
        }
        this.tiles[i] = t;
      }
    }
    this.tiles[this.idx(this.width - 3, H - 12)] = 0;
    this.tiles[this.idx(this.width - 4, H - 12)] = 0;

    // Gebäude-Kulisse (nicht massiv) und Pflaster davor
    const place = (x, y, v) => { this.tiles[this.idx(x, y)] = v; };
    let id = -125;
    for (let y = 3; y <= 4; y++) for (let x = 3; x <= 5; x++) place(x, y, id--);     // Tankstelle
    id = -110;
    for (let y = 2; y <= 4; y++) for (let x = 10; x <= 13; x++) place(x, y, id--);   // Mineralverarbeitung
    place(25, 2, -101); id = -102;
    for (let y = 3; y <= 4; y++) for (let x = 22; x <= 25; x++) place(x, y, id--);   // Upgrades
    id = -131;
    for (let y = 3; y <= 4; y++) for (let x = 30; x <= 32; x++) place(x, y, id--);   // Reparatur
    const pave = (x0, x1) => {
      place(x0, 5, -3);
      for (let x = x0 + 1; x < x1; x++) place(x, 5, -4);
      place(x1, 5, -5);
    };
    pave(2, 5); pave(9, 14); pave(21, 26); pave(30, 33);
    this.version++;
  }
}
