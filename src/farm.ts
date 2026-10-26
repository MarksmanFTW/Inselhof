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
/** neue Inseln: man fängt mit nichts an (Samen gibt es im Tutorial) */
export const START_SEEDS = 0;
export const START_TURNIPS = 0;
/** Ernten bis zur Eisen-Gießkanne */
export const CAN_GOAL = 5;
export const CAPACITY = { bucket: 4, can: 15 } as const;
/** ab Insel-Stufe 4 */
export const CAPACITY_BIG = { bucket: 6, can: 20 } as const;
/** Heu: gemähtes Gras trocknet, wird eingesammelt, die Wiese wächst nach (ms) */
export const HAY_DRY_MS = 45_000;
export const MEADOW_REGROW_MS = 120_000;
export const HAY_PER_TILE = 2;
/** Pflanzen: Rübe (wie immer), Karotte (schnell), Erdbeere (drei auf einmal), Kürbis (langsam, wertvoll) */
export type CropId = 'turnip' | 'carrot' | 'strawberry' | 'pumpkin';
export interface CropDef {
  id: CropId;
  name: string;
  plural: string;
  seedName: string;
  /** Wachstumszeit (× Grundzeit) */
  grow: number;
  /** so viele pro Ernte */
  yield: number;
  /** Händler zahlt pro Stück */
  price: number;
  /** Samen beim Händler ab dieser Insel-Stufe */
  level: number;
  pack: { n: number; price: number };
  /** roh essen: so viel Kraft (0 = nicht roh essbar) */
  energy: number;
}
export const CROPS: CropDef[] = [
  { id: 'turnip', name: 'Rübe', plural: 'Rüben', seedName: 'Rübensamen', grow: 1, yield: 1, price: 4, level: 1, pack: { n: 5, price: 8 }, energy: 12 },
  { id: 'carrot', name: 'Karotte', plural: 'Karotten', seedName: 'Karottensamen', grow: 0.7, yield: 1, price: 3, level: 1, pack: { n: 6, price: 8 }, energy: 8 },
  { id: 'strawberry', name: 'Erdbeere', plural: 'Erdbeeren', seedName: 'Erdbeersamen', grow: 1.1, yield: 3, price: 2, level: 3, pack: { n: 5, price: 12 }, energy: 5 },
  { id: 'pumpkin', name: 'Kürbis', plural: 'Kürbisse', seedName: 'Kürbissamen', grow: 1.7, yield: 1, price: 16, level: 5, pack: { n: 3, price: 15 }, energy: 0 },
];
export const cropById = (id: string) => CROPS.find((c) => c.id === id);
/** neue Sorten (nicht Rübe): Samen und Ernte liegen in eigenen Fächern */
export type NewCrop = Exclude<CropId, 'turnip'>;
const isNewCrop = (id: string): id is NewCrop => id !== 'turnip' && !!cropById(id);

/** gemähte Wiesen-Kachel */
export interface Mown {
  /** gemäht um */
  t: number;
  /** Heu eingesammelt um */
  got?: number;
}
export type MownStage = 'fresh' | 'dry' | 'stubble';

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
  /** was wächst (kind fehlt = Rübe) */
  crop?: { stage: number; kind?: NewCrop };
  /** seit wann trocken (für Regen – damit alle Geräte gleich rechnen) */
  dry?: number;
}

export interface FarmSave {
  plots: Record<string, Plot>;
  seeds: number;
  turnips: number;
  /** gekochte Ofenrüben */
  meals?: number;
  water: number;
  hasCan: boolean;
  harvested: number;
  hay?: number;
  meadow?: Record<string, Mown>;
  /** Samen und Ernte der neuen Sorten */
  seedBag?: Partial<Record<NewCrop, number>>;
  produce?: Partial<Record<NewCrop, number>>;
}

export type Tool = 'axe' | 'hoe' | 'seeds' | 'water' | 'scythe';

export const key = (c: number, r: number) => `${c},${r}`;

export class Farm {
  plots = new Map<string, Plot>();
  seeds = START_SEEDS;
  turnips = START_TURNIPS;
  meals = 0;
  water: number = CAPACITY.bucket;
  hasCan = false;
  harvested = 0;
  hay = 0;
  meadow = new Map<string, Mown>();
  seedBag: Partial<Record<NewCrop, number>> = {};
  produce: Partial<Record<NewCrop, number>> = {};
  version = 0;
  /** Fähigkeiten der Insel-Stufe (wird mit der World verbunden) */
  perks: () => FarmPerks = () => NO_PERKS;
  /** Wachstum auf dieser Kachel (Hochbeet: schneller; wird mit der World verbunden) */
  growAt: (c: number, r: number) => number = () => 1;

  constructor(
    readonly isl: Island,
    save?: Partial<FarmSave>,
  ) {
    if (!save) return;
    for (const [k, p] of Object.entries(save.plots ?? {}))
      if (/^\d+,\d+$/.test(k) && p && typeof p.wetAt === 'number')
        this.plots.set(k, {
          wetAt: p.wetAt,
          crop: p.crop ? { stage: Math.max(0, Math.min(RIPE, Math.floor(p.crop.stage))), ...(p.crop.kind && isNewCrop(p.crop.kind) ? { kind: p.crop.kind } : {}) } : undefined,
          ...(typeof p.dry === 'number' ? { dry: p.dry } : {}),
        });
    for (const [k, v] of Object.entries(save.seedBag ?? {})) if (isNewCrop(k) && typeof v === 'number' && v > 0) this.seedBag[k] = Math.floor(v);
    for (const [k, v] of Object.entries(save.produce ?? {})) if (isNewCrop(k) && typeof v === 'number' && v > 0) this.produce[k] = Math.floor(v);
    this.seeds = Math.max(0, Math.floor(save.seeds ?? START_SEEDS));
    this.turnips = Math.max(0, Math.floor(save.turnips ?? START_TURNIPS));
    this.meals = Math.max(0, Math.floor(save.meals ?? 0));
    this.hasCan = !!save.hasCan;
    // Grenze erst nach dem Verbinden mit der Insel-Stufe bekannt → hier großzügig
    const max = this.hasCan ? CAPACITY_BIG.can : CAPACITY_BIG.bucket;
    this.water = Math.max(0, Math.min(max, Math.floor(save.water ?? this.capacity)));
    this.harvested = Math.max(0, Math.floor(save.harvested ?? 0));
    this.hay = Math.max(0, Math.floor(save.hay ?? 0));
    for (const [k, m] of Object.entries(save.meadow ?? {}))
      if (/^\d+,\d+$/.test(k) && m && typeof m.t === 'number') this.meadow.set(k, { t: m.t, ...(typeof m.got === 'number' ? { got: m.got } : {}) });
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
    this.meals = f.meals;
    this.water = f.water;
    this.hasCan = f.hasCan;
    this.harvested = f.harvested;
    this.hay = f.hay;
    this.meadow = f.meadow;
    this.seedBag = f.seedBag;
    this.produce = f.produce;
    this.version++;
  }

  toSave(): FarmSave {
    return {
      plots: Object.fromEntries([...this.plots].map(([k, p]) => [k, { wetAt: p.wetAt, ...(p.crop ? { crop: { ...p.crop } } : {}), ...(p.dry !== undefined ? { dry: p.dry } : {}) }])),
      seeds: this.seeds,
      turnips: this.turnips,
      meals: this.meals,
      water: this.water,
      hasCan: this.hasCan,
      harvested: this.harvested,
      ...(this.hay || this.meadow.size ? { hay: this.hay, meadow: Object.fromEntries([...this.meadow].map(([k, m]) => [k, { ...m }])) } : {}),
      ...(Object.keys(this.seedBag).length || Object.keys(this.produce).length ? { seedBag: { ...this.seedBag }, produce: { ...this.produce } } : {}),
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

  mown(c: number, r: number, now: number): MownStage | null {
    const m = this.meadow.get(key(c, r));
    if (!m) return null;
    return m.got !== undefined ? 'stubble' : now - m.t >= HAY_DRY_MS ? 'dry' : 'fresh';
  }

  /** Sense: Wiese mähen (free = nichts im Weg, vom Aufrufer geprüft) */
  mow(c: number, r: number, free: boolean, now: number): string | null {
    if (this.plot(c, r)) return 'Hier ist ein Feld';
    if (this.meadow.has(key(c, r))) return 'Hier ist schon gemäht';
    if (!free || !this.groundOk(c, r)) return 'Hier wächst kein Gras zum Mähen';
    this.meadow.set(key(c, r), { t: now });
    this.version++;
    return null;
  }

  /** trockenes Heu einsammeln */
  rake(c: number, r: number, now: number): number {
    const m = this.meadow.get(key(c, r));
    if (!m || m.got !== undefined || now - m.t < HAY_DRY_MS) return 0;
    m.got = now;
    this.hay += HAY_PER_TILE;
    this.version++;
    return HAY_PER_TILE;
  }

  /**
   * Wachsen und Austrocknen nachholen; Regen gießt alle Felder. rainSince = seit wann
   * es regnet (fehlt = kein Regen). Alles hängt nur von Zeitpunkten ab, nicht davon,
   * wie oft hier gerechnet wird – so kommen beide Spieler einer Insel aufs Gleiche.
   */
  update(now: number, rainSince?: number) {
    for (const [k, m] of this.meadow)
      if (m.got !== undefined && now - m.got >= MEADOW_REGROW_MS) {
        this.meadow.delete(k);
        this.version++;
      }
    for (const [k, p] of this.plots) {
      const [c, r] = k.split(',').map(Number);
      const grow = GROW_MS * this.perks().growMul * this.growAt(c, r);
      for (let step = 0; step < 6; step++) {
        if (rainSince !== undefined && !p.wetAt && !(p.crop && p.crop.stage >= RIPE)) {
          const at = Math.max(rainSince, p.dry ?? 0);
          if (at > now) break;
          p.wetAt = at || 1;
          this.version++;
        }
        if (!p.wetAt) break;
        if (p.crop && p.crop.stage < RIPE) {
          const at = p.wetAt + grow * (cropById(p.crop.kind ?? 'turnip')?.grow ?? 1);
          if (now < at) break;
          p.crop.stage++;
          p.wetAt = 0;
          p.dry = at;
          this.version++;
        } else {
          const at = p.wetAt + DRY_MS;
          if (now < at) break;
          p.wetAt = 0;
          p.dry = at;
          this.version++;
        }
      }
    }
  }

  /** free: liegt dort nichts (Baum, Stein, Haus)? → vom Aufrufer geprüft */
  till(c: number, r: number, free: boolean): string | null {
    if (this.plot(c, r)) return 'Hier ist schon ein Feld';
    const m = this.meadow.get(key(c, r));
    if (m && m.got === undefined) return 'Hier liegt noch Heu';
    if (!free || !this.groundOk(c, r)) return 'Hier kann man nicht hacken';
    this.plots.set(key(c, r), { wetAt: 0 });
    this.meadow.delete(key(c, r));
    this.version++;
    return null;
  }

  /** Samen einer Sorte */
  seedsOf(kind: CropId) {
    return kind === 'turnip' ? this.seeds : (this.seedBag[kind] ?? 0);
  }
  addSeeds(kind: CropId, n: number) {
    if (kind === 'turnip') this.seeds += n;
    else this.seedBag[kind] = (this.seedBag[kind] ?? 0) + n;
    this.version++;
  }
  /** Ernte einer Sorte im Vorrat */
  cropsOf(kind: CropId) {
    return kind === 'turnip' ? this.turnips : (this.produce[kind] ?? 0);
  }
  takeCrop(kind: CropId, n: number) {
    if (this.cropsOf(kind) < n) return false;
    if (kind === 'turnip') this.turnips -= n;
    else if ((this.produce[kind]! -= n) <= 0) delete this.produce[kind];
    this.version++;
    return true;
  }
  addCrop(kind: CropId, n: number) {
    if (kind === 'turnip') this.turnips += n;
    else this.produce[kind] = (this.produce[kind] ?? 0) + n;
    this.version++;
  }

  plant(c: number, r: number, kind: CropId = 'turnip'): string | null {
    const p = this.plot(c, r);
    if (!p) return 'Erst mit der Hacke ein Feld machen';
    if (p.crop) return 'Hier wächst schon etwas';
    if (!cropById(kind)) return 'Unbekannte Samen';
    if (this.seedsOf(kind) <= 0) return `Keine ${cropById(kind)!.seedName} mehr`;
    if (kind === 'turnip') this.seeds--;
    else if (--this.seedBag[kind]! <= 0) delete this.seedBag[kind];
    p.crop = kind === 'turnip' ? { stage: 0 } : { stage: 0, kind };
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

  /** Rübe essen (roh) oder Ofenrübe; false = nichts da */
  eat(cooked: boolean) {
    if (cooked ? this.meals <= 0 : this.turnips <= 0) return false;
    if (cooked) this.meals--;
    else this.turnips--;
    this.version++;
    return true;
  }

  /** am Lagerfeuer: Rübe → Ofenrübe */
  cook() {
    if (this.turnips <= 0) return false;
    this.turnips--;
    this.meals++;
    this.version++;
    return true;
  }

  refill() {
    this.water = this.capacity;
    this.version++;
  }

  /** Ernte: Frucht + 1–2 Samen derselben Sorte; ab CAN_GOAL Ernten gibt es die Eisen-Gießkanne */
  harvest(c: number, r: number, rand = Math.random): { seeds: number; gotCan: boolean; kind: CropId; n: number } | null {
    const p = this.plot(c, r);
    if (!p?.crop || p.crop.stage < RIPE) return null;
    const kind: CropId = p.crop.kind ?? 'turnip';
    const def = cropById(kind)!;
    p.crop = undefined;
    p.wetAt = 0;
    this.addCrop(kind, def.yield);
    const seeds = this.perks().twoSeeds ? 2 : 1 + (rand() < 0.5 ? 1 : 0);
    this.addSeeds(kind, seeds);
    this.harvested++;
    let gotCan = false;
    if (!this.hasCan && this.harvested >= CAN_GOAL) {
      this.hasCan = true;
      this.water = this.capacity;
      gotCan = true;
    }
    this.version++;
    return { seeds, gotCan, kind, n: def.yield };
  }
}
