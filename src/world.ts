/**
 * Was sich auf der Insel verändert: gefällte Bäume (wachsen nach), Holz im
 * Rucksack, gebaute Häuser. Reine Logik ohne Zeichnen – lässt sich testen.
 */
import { Ground, H, W, type Decor, type Island } from './island';

/** Schläge bis zum Fallen und Holz-Ertrag */
export const CHOP: Partial<Record<Decor['kind'], { hits: number; wood: number }>> = {
  tree: { hits: 5, wood: 4 },
  palm: { hits: 3, wood: 2 },
};
export const HOUSE_COST = 10;
/** nach dem Fällen: erst Stumpf, dann Setzling, dann wieder Baum (ms) */
export const SPROUT_MS = 60_000;
export const REGROW_MS = 180_000;
/** Reichweite der Axt (Welt-Pixel vom Fuß zum Stamm) */
export const REACH = 16;

/** Grundfläche des Hauses relativ zum Fußpunkt (Mitte unten) */
export const HOUSE_FOOT = { left: -18, right: 18, top: -14, bottom: 1 };

export interface House {
  x: number;
  y: number;
}

export interface WorldSave {
  wood: number;
  /** Index in island.decor → Zeitpunkt des Fällens */
  felled: Record<number, number>;
  houses: House[];
}

export type TreeStage = 'tree' | 'stump' | 'sapling';

/** Hindernis um einen Fußpunkt (flache Ellipse) */
const BLOCK: Record<string, [number, number]> = {
  tree: [5, 3],
  palm: [3, 2],
  bush: [9, 4],
  boulder: [9, 4],
  rock: [5, 2],
  stump: [4, 2],
};
const STUMP_BLOCK: [number, number] = [4, 2];

export class World {
  wood = 0;
  felled = new Map<number, number>();
  houses: House[] = [];
  /** Treffer am aktuellen Baum (nicht gespeichert) */
  private hits = new Map<number, number>();
  /** wird bei jeder Änderung hochgezählt (Schatten neu malen, speichern) */
  version = 0;

  constructor(
    readonly isl: Island,
    save?: Partial<WorldSave>,
  ) {
    if (save) {
      this.wood = Math.max(0, Math.floor(save.wood ?? 0));
      for (const [k, v] of Object.entries(save.felled ?? {})) {
        const i = Number(k);
        if (CHOP[isl.decor[i]?.kind] && typeof v === 'number') this.felled.set(i, v);
      }
      this.houses = (save.houses ?? []).filter((h) => typeof h?.x === 'number' && typeof h?.y === 'number');
    }
  }

  /** Stand vom Gastgeber übernehmen (Koop) */
  apply(save: Partial<WorldSave>) {
    const w = new World(this.isl, save);
    this.wood = w.wood;
    this.felled = w.felled;
    this.houses = w.houses;
    this.version++;
  }

  toSave(): WorldSave {
    return { wood: this.wood, felled: Object.fromEntries(this.felled), houses: this.houses.map((h) => ({ ...h })) };
  }

  stage(i: number, now = Date.now()): TreeStage {
    const t = this.felled.get(i);
    if (t === undefined) return 'tree';
    return now - t < SPROUT_MS ? 'stump' : 'sapling';
  }

  /** Bäume nachwachsen lassen – aber nicht, wenn jemand genau dort steht */
  grow(now: number, standing?: { x: number; y: number }) {
    for (const [i, t] of this.felled) {
      if (now - t < REGROW_MS) continue;
      const d = this.isl.decor[i];
      if (standing && this.hitsBlock(d, BLOCK[d.kind], standing.x, standing.y, 4, 2)) continue;
      this.felled.delete(i);
      this.version++;
    }
  }

  private hitsBlock(d: Decor, b: [number, number] | undefined, x: number, y: number, fw: number, fh: number) {
    if (!b) return false;
    const cx = d.kind === 'palm' ? d.x : d.x + 1;
    return ((x - cx) / (b[0] + fw)) ** 2 + ((y - d.y) / (b[1] + fh)) ** 2 < 1;
  }

  /** Steht hier etwas im Weg? (für die Figur; fw/fh = halbe Fußgröße) */
  blocked(x: number, y: number, fw: number, fh: number, now = Date.now()) {
    const decor = this.isl.decor;
    for (let i = 0; i < decor.length; i++) {
      const d = decor[i];
      let b = BLOCK[d.kind];
      if (!b) continue;
      if (this.felled.has(i)) {
        if (this.stage(i, now) === 'sapling') continue;
        b = STUMP_BLOCK;
      }
      if (this.hitsBlock(d, b, x, y, fw, fh)) return true;
    }
    for (const h of this.houses)
      if (x + fw > h.x + HOUSE_FOOT.left && x - fw < h.x + HOUSE_FOOT.right && y + fh > h.y + HOUSE_FOOT.top && y - fh < h.y + HOUSE_FOOT.bottom)
        return true;
    return false;
  }

  /** Nächster fällbarer Baum in Reichweite */
  target(x: number, y: number): number {
    let best = -1;
    let bestD = REACH;
    this.isl.decor.forEach((d, i) => {
      if (!CHOP[d.kind] || this.felled.has(i)) return;
      const dist = Math.hypot(d.x - x, (d.y - y) * 1.6);
      if (dist < bestD) {
        bestD = dist;
        best = i;
      }
    });
    return best;
  }

  /** Ein Axtschlag; liefert Holz-Ertrag, wenn der Baum fällt */
  chop(i: number, now = Date.now()): { felled: boolean; wood: number; left: number } {
    const d = this.isl.decor[i];
    const c = d && CHOP[d.kind];
    if (!c || this.felled.has(i)) return { felled: false, wood: 0, left: 0 };
    const n = (this.hits.get(i) ?? 0) + 1;
    if (n < c.hits) {
      this.hits.set(i, n);
      return { felled: false, wood: 0, left: c.hits - n };
    }
    this.hits.delete(i);
    this.felled.set(i, now);
    this.wood += c.wood;
    this.version++;
    return { felled: true, wood: c.wood, left: 0 };
  }

  /** Baum gilt als gefällt (Abgleich einer gemeinsamen Insel) */
  fell(i: number, now = Date.now()) {
    const c = CHOP[this.isl.decor[i]?.kind];
    if (!c || this.felled.has(i)) return 0;
    this.hits.delete(i);
    this.felled.set(i, now);
    this.wood += c.wood;
    this.version++;
    return c.wood;
  }

  /** Darf hier ein Haus stehen? Ganz auf Land, nichts im Weg, nicht auf dem Steg */
  canPlace(x: number, y: number, player?: { x: number; y: number }) {
    const f = HOUSE_FOOT;
    for (let yy = y + f.top - 6; yy <= y + f.bottom; yy += 2)
      for (let xx = x + f.left; xx <= x + f.right; xx += 2) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) return false;
        if (this.isl.ground[(yy | 0) * W + (xx | 0)] === Ground.Water) return false;
      }
    const dk = this.isl.dock;
    if (x + f.right > dk.x - 4 && x + f.left < dk.x + dk.w + 4 && y > dk.y - 8) return false;
    // Bäume (auch nachwachsende), Steine & Co. mit etwas Abstand
    const decor = this.isl.decor;
    for (const d of decor) {
      const b = BLOCK[d.kind];
      if (!b) continue;
      const cx = d.kind === 'palm' ? d.x : d.x + 1;
      if (cx + b[0] + 2 > x + f.left && cx - b[0] - 2 < x + f.right && d.y + b[1] > y + f.top - 4 && d.y - b[1] < y + f.bottom + 2) return false;
    }
    for (const h of this.houses) if (Math.abs(h.x - x) < 40 && Math.abs(h.y - y) < 24) return false;
    if (player && player.x + 4 > x + f.left && player.x - 4 < x + f.right && player.y + 2 > y + f.top && player.y - 2 < y + f.bottom) return false;
    return true;
  }

  build(x: number, y: number, player?: { x: number; y: number }) {
    if (this.wood < HOUSE_COST || !this.canPlace(x, y, player)) return false;
    this.wood -= HOUSE_COST;
    this.houses.push({ x: Math.round(x), y: Math.round(y) });
    this.version++;
    return true;
  }
}
