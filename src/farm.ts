/**
 * Ackerbau: Felder (8×8-Kacheln) mit der Hacke anlegen, Rüben säen, gießen, ernten.
 * Eine Pflanze wächst nur, wenn ihr Feld gegossen ist – je Gießen eine Stufe.
 * Gießen geht mit dem Holzkübel (klein) oder der Eisen-Gießkanne (groß);
 * beide füllt man am Wasser auf. Reine Logik, Zeit in ms (Date.now()).
 */
import { Ground, TILE, W, type Island } from './island';

export const GROW_MS = 40_000; // gegossen → nächste Stufe
export const DRY_MS = 90_000; // leeres Feld trocknet wieder
export const RIPE = 3; // Stufe 3 = erntereif
export const START_SEEDS = 6;
/** Ernten bis zur Eisen-Gießkanne */
export const CAN_GOAL = 5;
export const CAPACITY = { bucket: 4, can: 15 } as const;
/** ab Insel-Stufe 4 */
export const CAPACITY_BIG = { bucket: 6, can: 20 } as const;
/** was die Insel-Stufe am Ackerbau ändert (kommt von World.perks) */
export interface FarmPerks {
  bigWater: boolean;
  growMul: number;
  twoSeeds: boolean;
}
const NO_PERKS: FarmPerks = { bigWater: false, growMul: 1, twoSeeds: false };

export interface Plot {
  /** gegossen seit (0 = trocken) */
  wetAt: number;
  crop?: { stage: number };
}

export interface FarmSave {
  plots: Record<string, Plot>;
  seeds: number;
  turnips: number;
  water: number;
  hasCan: boolean;
  harvested: number;
}

export type Tool = 'axe' | 'hoe' | 'seeds' | 'water';

export const key = (c: number, r: number) => `${c},${r}`;

export class Farm {
  plots = new Map<string, Plot>();
  seeds = START_SEEDS;
  turnips = 0;
  water: number = CAPACITY.bucket;
  hasCan = false;
  harvested = 0;
  version = 0;
  /** Fähigkeiten der Insel-Stufe (wird mit der World verbunden) */
  perks: () => FarmPerks = () => NO_PERKS;

  constructor(
    readonly isl: Island,
    save?: Partial<FarmSave>,
  ) {
    if (!save) return;
    for (const [k, p] of Object.entries(save.plots ?? {}))
      if (/^\d+,\d+$/.test(k) && p && typeof p.wetAt === 'number')
        this.plots.set(k, { wetAt: p.wetAt, crop: p.crop ? { stage: Math.max(0, Math.min(RIPE, Math.floor(p.crop.stage))) } : undefined });
    this.seeds = Math.max(0, Math.floor(save.seeds ?? START_SEEDS));
    this.turnips = Math.max(0, Math.floor(save.turnips ?? 0));
    this.hasCan = !!save.hasCan;
    // Grenze erst nach dem Verbinden mit der Insel-Stufe bekannt → hier großzügig
    const max = this.hasCan ? CAPACITY_BIG.can : CAPACITY_BIG.bucket;
    this.water = Math.max(0, Math.min(max, Math.floor(save.water ?? this.capacity)));
    this.harvested = Math.max(0, Math.floor(save.harvested ?? 0));
  }

  get capacity() {
    const cap = this.perks().bigWater ? CAPACITY_BIG : CAPACITY;
    return this.hasCan ? cap.can : cap.bucket;
  }

  /** Stand vom Gastgeber übernehmen (Koop) */
  apply(save: Partial<FarmSave>) {
    const f = new Farm(this.isl, save);
    this.plots = f.plots;
    this.seeds = f.seeds;
    this.turnips = f.turnips;
    this.water = f.water;
    this.hasCan = f.hasCan;
    this.harvested = f.harvested;
    this.version++;
  }

  toSave(): FarmSave {
    return {
      plots: Object.fromEntries([...this.plots].map(([k, p]) => [k, { wetAt: p.wetAt, ...(p.crop ? { crop: { ...p.crop } } : {}) }])),
      seeds: this.seeds,
      turnips: this.turnips,
      water: this.water,
      hasCan: this.hasCan,
      harvested: this.harvested,
    };
  }

  /** Kachel unter einem Welt-Punkt */
  static tileAt(x: number, y: number): [number, number] {
    return [Math.floor(x / TILE), Math.floor(y / TILE)];
  }

  private groundOk(c: number, r: number) {
    // ganze Kachel muss Wiese sein
    for (let y = r * TILE; y < r * TILE + TILE; y += 2)
      for (let x = c * TILE; x < c * TILE + TILE; x += 2) if (this.isl.ground[y * W + x] !== Ground.Grass) return false;
    return true;
  }

  plot(c: number, r: number) {
    return this.plots.get(key(c, r));
  }

  /** Wachsen und Austrocknen nachholen */
  update(now: number) {
    for (const p of this.plots.values()) {
      if (!p.wetAt) continue;
      if (p.crop && p.crop.stage < RIPE) {
        if (now - p.wetAt >= GROW_MS * this.perks().growMul) {
          p.crop.stage++;
          p.wetAt = 0;
          this.version++;
        }
      } else if (now - p.wetAt >= DRY_MS) {
        p.wetAt = 0;
        this.version++;
      }
    }
  }

  /** free: liegt dort nichts (Baum, Stein, Haus)? → vom Aufrufer geprüft */
  till(c: number, r: number, free: boolean): string | null {
    if (this.plot(c, r)) return 'Hier ist schon ein Feld';
    if (!free || !this.groundOk(c, r)) return 'Hier kann man nicht hacken';
    this.plots.set(key(c, r), { wetAt: 0 });
    this.version++;
    return null;
  }

  plant(c: number, r: number): string | null {
    const p = this.plot(c, r);
    if (!p) return 'Erst mit der Hacke ein Feld machen';
    if (p.crop) return 'Hier wächst schon etwas';
    if (this.seeds <= 0) return 'Keine Samen mehr';
    this.seeds--;
    p.crop = { stage: 0 };
    this.version++;
    return null;
  }

  /** Gießen; leer → Hinweis */
  pour(c: number, r: number, now: number): string | null {
    const p = this.plot(c, r);
    if (!p) return 'Hier ist kein Feld';
    if (this.water <= 0) return 'Leer – am Wasser auffüllen';
    if (p.wetAt) return 'Schon gegossen';
    if (p.crop && p.crop.stage >= RIPE) return 'Reif – jetzt ernten!';
    this.water--;
    p.wetAt = now;
    this.version++;
    return null;
  }

  refill() {
    this.water = this.capacity;
    this.version++;
  }

  /** Ernte: Rübe + 1–2 Samen; ab CAN_GOAL Ernten gibt es die Eisen-Gießkanne */
  harvest(c: number, r: number, rand = Math.random): { seeds: number; gotCan: boolean } | null {
    const p = this.plot(c, r);
    if (!p?.crop || p.crop.stage < RIPE) return null;
    p.crop = undefined;
    p.wetAt = 0;
    this.turnips++;
    const seeds = this.perks().twoSeeds ? 2 : 1 + (rand() < 0.5 ? 1 : 0);
    this.seeds += seeds;
    this.harvested++;
    let gotCan = false;
    if (!this.hasCan && this.harvested >= CAN_GOAL) {
      this.hasCan = true;
      this.water = this.capacity;
      gotCan = true;
    }
    this.version++;
    return { seeds, gotCan };
  }
}
