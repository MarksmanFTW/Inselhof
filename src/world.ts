/**
 * Was sich auf der Insel verändert: gefällte Bäume (wachsen nach), Holz im
 * Rucksack, gebaute Häuser. Reine Logik ohne Zeichnen – lässt sich testen.
 */
import { Ground, H, W, type Decor, type Island } from './island';
import { STABLE_COST, STABLE_SPACE, MAX_LOVE, breedById, cleanHorses, cleanName, type Horse, type Stable } from './horses';
import { cleanProgress, levelOf, newProgress, perks, type Progress } from './progress';
import type { Clock } from './time';

/** Schläge bis zum Fallen und Holz-Ertrag */
export const CHOP: Partial<Record<Decor['kind'], { hits: number; wood: number }>> = {
  tree: { hits: 5, wood: 4 },
  palm: { hits: 3, wood: 2 },
};
export const HOUSE_COST = 10;
export const FIRE_COST = 3;
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
  /** Möbel drinnen: Platz → Möbelstück */
  furn?: Record<number, string>;
}
export interface Fire {
  x: number;
  y: number;
}
export type BuildKind = 'house' | 'fire' | 'stable';
/** Grundfläche des Lagerfeuers */
export const FIRE_FOOT = { left: -6, right: 6, top: -4, bottom: 1 };
/** Grundfläche des Pferdestalls */
export const STABLE_FOOT = { left: -24, right: 24, top: -14, bottom: 1 };
export const BUILDS: Record<BuildKind, { cost: number; foot: typeof HOUSE_FOOT }> = {
  house: { cost: HOUSE_COST, foot: HOUSE_FOOT },
  fire: { cost: FIRE_COST, foot: FIRE_FOOT },
  stable: { cost: STABLE_COST, foot: STABLE_FOOT },
};

export interface WorldSave {
  wood: number;
  /** Index in island.decor → Zeitpunkt des Fällens */
  felled: Record<number, number>;
  houses: House[];
  /** Erfahrung, Statistik, Aufgaben der Insel */
  prog?: Progress;
  fires?: Fire[];
  /** Uhrzeit der Insel */
  clock?: Clock;
  stables?: Stable[];
  horses?: Horse[];
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
  fires: Fire[] = [];
  stables: Stable[] = [];
  horses: Horse[] = [];
  clock: Clock | null = null;
  prog: Progress = newProgress();
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
      this.prog = cleanProgress(save.prog);
      this.fires = (save.fires ?? []).filter((h) => typeof h?.x === 'number' && typeof h?.y === 'number');
      this.stables = (save.stables ?? []).filter((h) => typeof h?.x === 'number' && typeof h?.y === 'number');
      this.horses = cleanHorses(save.horses, this.stables.length);
      const c = save.clock;
      this.clock = c && typeof c.offset === 'number' && typeof c.day0 === 'number' ? { offset: c.offset, day0: c.day0 } : null;
    }
  }

  /** Stand vom Gastgeber übernehmen (Koop) */
  apply(save: Partial<WorldSave>) {
    const w = new World(this.isl, save);
    this.wood = w.wood;
    this.felled = w.felled;
    this.houses = w.houses;
    this.prog = w.prog;
    this.fires = w.fires;
    this.clock = w.clock;
    this.stables = w.stables;
    this.horses = w.horses;
    this.version++;
  }

  toSave(): WorldSave {
    return {
      wood: this.wood,
      felled: Object.fromEntries(this.felled),
      houses: this.houses.map((h) => ({ ...h, ...(h.furn ? { furn: { ...h.furn } } : {}) })),
      fires: this.fires.map((f) => ({ ...f })),
      ...(this.stables.length ? { stables: this.stables.map((f) => ({ ...f })), horses: this.horses.map((h) => ({ ...h })) } : {}),
      ...(this.clock ? { clock: { ...this.clock } } : {}),
      prog: { xp: this.prog.xp, stats: { ...this.prog.stats }, quests: this.prog.quests },
    };
  }

  get level() {
    return levelOf(this.prog.xp);
  }
  get perks() {
    return perks(this.level);
  }

  stage(i: number, now = Date.now()): TreeStage {
    const t = this.felled.get(i);
    if (t === undefined) return 'tree';
    return now - t < SPROUT_MS * this.perks.regrowMul ? 'stump' : 'sapling';
  }

  /** Bäume nachwachsen lassen – aber nicht, wenn jemand genau dort steht */
  grow(now: number, standing?: { x: number; y: number }) {
    for (const [i, t] of this.felled) {
      if (now - t < REGROW_MS * this.perks.regrowMul) continue;
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
    for (const [list, f] of [
      [this.houses, HOUSE_FOOT],
      [this.fires, FIRE_FOOT],
      [this.stables, STABLE_FOOT],
    ] as const)
      for (const h of list) if (x + fw > h.x + f.left && x - fw < h.x + f.right && y + fh > h.y + f.top && y - fh < h.y + f.bottom) return true;
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
    const hits = Math.max(1, c.hits - this.perks.chopFaster);
    if (n < hits) {
      this.hits.set(i, n);
      return { felled: false, wood: 0, left: hits - n };
    }
    this.hits.delete(i);
    this.felled.set(i, now);
    const wood = c.wood + this.perks.extraWood;
    this.wood += wood;
    this.version++;
    return { felled: true, wood, left: 0 };
  }

  /** Baum gilt als gefällt (Abgleich einer gemeinsamen Insel) */
  fell(i: number, now = Date.now()) {
    const c = CHOP[this.isl.decor[i]?.kind];
    if (!c || this.felled.has(i)) return 0;
    this.hits.delete(i);
    this.felled.set(i, now);
    const wood = c.wood + this.perks.extraWood;
    this.wood += wood;
    this.version++;
    return wood;
  }

  /** Darf hier ein Haus stehen? Ganz auf Land, nichts im Weg, nicht auf dem Steg */
  canPlace(x: number, y: number, player?: { x: number; y: number }, kind: BuildKind = 'house') {
    const f = BUILDS[kind].foot;
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
    // Abstand zu Häusern und Feuern (Grundflächen + Luft)
    for (const [list, g] of [
      [this.houses, HOUSE_FOOT],
      [this.fires, FIRE_FOOT],
      [this.stables, STABLE_FOOT],
    ] as const)
      for (const h of list)
        if (x + f.right + 4 > h.x + g.left && x + f.left - 4 < h.x + g.right && y + f.bottom + 4 > h.y + g.top - 6 && y + f.top - 8 < h.y + g.bottom) return false;
    if (player && player.x + 4 > x + f.left && player.x - 4 < x + f.right && player.y + 2 > y + f.top && player.y - 2 < y + f.bottom) return false;
    return true;
  }

  build(x: number, y: number, player?: { x: number; y: number }, kind: BuildKind = 'house') {
    const cost = BUILDS[kind].cost;
    if (this.wood < cost || !this.canPlace(x, y, player, kind)) return false;
    this.wood -= cost;
    (kind === 'fire' ? this.fires : kind === 'stable' ? this.stables : this.houses).push({ x: Math.round(x), y: Math.round(y) });
    this.version++;
    return true;
  }

  /** Möbelstück in ein Haus stellen (Platz frei, genug Holz) */
  furnish(house: number, slot: number, item: string, cost: number) {
    const h = this.houses[house];
    if (!h) return 'Dieses Haus gibt es nicht';
    if (h.furn?.[slot]) return 'Hier steht schon etwas';
    if (this.wood < cost) return 'Zu wenig Holz';
    this.wood -= cost;
    h.furn = { ...h.furn, [slot]: item };
    this.version++;
    return null;
  }

  /** Pferde in einem Stall */
  horsesIn(stable: number) {
    return this.horses.filter((h) => h.stable === stable).length;
  }

  /** Pferd im Stall aufnehmen; bezahlt wird mit Rüben (pay prüft und zieht ab) */
  adopt(stable: number, breed: string, name: string, t: number, pay: (cost: number) => boolean) {
    const b = breedById(breed);
    if (!this.stables[stable]) return 'Diesen Stall gibt es nicht';
    if (!b) return 'Unbekannte Rasse';
    if (this.level < b.level) return `${b.name} gibt es ab Insel-Stufe ${b.level}`;
    if (this.horsesIn(stable) >= STABLE_SPACE) return 'Der Stall ist voll – bau noch einen';
    if (!pay(b.cost)) return 'Zu wenig Rüben';
    this.horses.push({ breed: b.id, name: cleanName(name) || b.names[0], stable, t, love: 0 });
    this.version++;
    return null;
  }

  /** Pferd füttern → mehr Vertrauen */
  feed(horse: number) {
    const h = this.horses[horse];
    if (!h) return false;
    h.love = Math.min(MAX_LOVE, h.love + 1);
    this.version++;
    return true;
  }

  /** Feuer in der Nähe (zum Kochen) */
  fireNear(x: number, y: number, r = 16) {
    return this.fires.findIndex((f) => Math.hypot(f.x - x, (f.y - y) * 1.4) < r);
  }
}
