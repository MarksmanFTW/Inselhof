/**
 * Was sich auf der Insel verändert: gefällte Bäume (wachsen nach), Holz im
 * Rucksack, gebaute Häuser. Reine Logik ohne Zeichnen – lässt sich testen.
 */
import { Ground, H, W, type Decor, type Island } from './island';
import { accById, FOAL_HAY, FOAL_PAUSE_DAYS, GATE, MAX_LOVE, PADDOCK_COST, PADDOCK_FOOT, PADDOCK_REACH, STABLE_COST, STABLE_SPACE, breedById, cleanHorses, cleanName, isFoal, islandDay, type Care, type Horse, type Paddock, type Stable } from './horses';
import { ALBUM_REWARDS, DECO_FOOT, albumCount, cleanAlbum, decoById, type Album, type Deco } from './shop';
import { cleanProgress, levelOf, newProgress, perks, type Progress } from './progress';
import { PICK_REGROW_MS, type ToolKind } from './craft';
import { FISH, fishById } from './fish';
import { PROJECTS, cleanProj, newProj, type Foot, type ProjState } from './projects';
import { cleanOrders, newOrders, type OrderState } from './orders';
import { DISH_IDS } from './store';
import { cleanVillagers, nextVillager, type Villager } from './villagers';
import type { PickKind } from './island';
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
/** Obst: so viel fällt beim Schütteln herunter, so lange dauert es, bis wieder etwas dran ist (ms) */
export const FRUIT = { tree: 3, bush: 4 } as const;
export const FRUIT_MS = 240_000;
/** Beeren wachsen nur an den Beerenbüschen (jede zweite Sorte) */
export const berryBush = (d: Decor) => d.kind === 'bush' && d.variant % 2 === 1;

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
export type BuildKind = 'house' | 'fire' | 'stable' | 'paddock' | 'deco' | 'hut';
/** Grundfläche des Lagerfeuers */
export const FIRE_FOOT = { left: -6, right: 6, top: -4, bottom: 1 };
/** Grundfläche des Pferdestalls */
export const STABLE_FOOT = { left: -24, right: 24, top: -14, bottom: 1 };
/** Bewohnerhaus: kleines Häuschen für ein Tier */
export const HUT_FOOT = { left: -12, right: 12, top: -10, bottom: 1 };
export const HUT_COST = 12;
export const BUILDS: Record<BuildKind, { cost: number; foot: typeof HOUSE_FOOT }> = {
  house: { cost: HOUSE_COST, foot: HOUSE_FOOT },
  fire: { cost: FIRE_COST, foot: FIRE_FOOT },
  stable: { cost: STABLE_COST, foot: STABLE_FOOT },
  paddock: { cost: PADDOCK_COST, foot: PADDOCK_FOOT },
  deco: { cost: 0, foot: DECO_FOOT },
  hut: { cost: HUT_COST, foot: HUT_FOOT },
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
  paddocks?: Paddock[];
  coins?: number;
  decos?: Deco[];
  /** gekaufte, noch nicht aufgestellte Deko */
  decoInv?: Record<string, number>;
  album?: Album;
  /** so viele Album-Belohnungen sind abgeholt */
  albumClaimed?: number;
  /** nur noch zum Umziehen: so lag der Rucksack kurz in der Insel (jetzt im Spielstand jedes Spielers) */
  sticks?: number;
  stones?: number;
  tools?: ToolKind[];
  /** Index in island.pickups → Zeitpunkt des Aufhebens */
  picked?: Record<number, number>;
  /** Obst im Vorrat und wann welcher Baum/Busch (Index in island.decor) geschüttelt wurde */
  apples?: number;
  berries?: number;
  shaken?: Record<number, number>;
  /** gefangene Fische (Art → Anzahl) und gebratene */
  fish?: Record<string, number>;
  grilled?: number;
  /** Insel-Projekte (Brunnen, Marktstand …) */
  proj?: ProjState;
  /** gekochte Gerichte, gelernte Rezepte, Bestellbrett */
  dishes?: Record<string, number>;
  recipes?: string[];
  orders?: OrderState;
  /** eingezogene Bewohner (jeder wohnt in seinem Häuschen) */
  villagers?: Villager[];
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
  paddocks: Paddock[] = [];
  coins = 0;
  decos: Deco[] = [];
  decoInv: Record<string, number> = {};
  album: Album = { horses: [], deco: [] };
  albumClaimed = 0;
  clock: Clock | null = null;
  prog: Progress = newProgress();
  picked = new Map<number, number>();
  apples = 0;
  berries = 0;
  shaken = new Map<number, number>();
  fish: Record<string, number> = {};
  grilled = 0;
  proj: ProjState = newProj();
  dishes: Record<string, number> = {};
  recipes: string[] = [];
  orders: OrderState = newOrders();
  villagers: Villager[] = [];
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
      this.fires = (save.fires ?? []).filter((h) => typeof h?.x === 'number' && typeof h?.y === 'number');
      this.stables = (save.stables ?? []).filter((h) => typeof h?.x === 'number' && typeof h?.y === 'number');
      // Spielstand von vor dem Tutorial (ursprüngliche Aufgabenliste): umrechnen
      const legacy = typeof save.wood === 'number' && save.prog?.v === undefined;
      this.prog = cleanProgress(save.prog, legacy ? { fires: this.fires.length, stables: this.stables.length } : undefined);
      for (const [k, v] of Object.entries(save.picked ?? {})) {
        const i = Number(k);
        if (isl.pickups[i] && typeof v === 'number') this.picked.set(i, v);
      }
      for (const [k, v] of Object.entries(save.fish ?? {})) if (fishById(k) && typeof v === 'number' && v > 0) this.fish[k] = Math.floor(v);
      this.grilled = Math.max(0, Math.floor(save.grilled ?? 0));
      this.proj = cleanProj(save.proj);
      for (const [k, v] of Object.entries(save.dishes ?? {})) if (DISH_IDS.includes(k as never) && typeof v === 'number' && v > 0) this.dishes[k] = Math.floor(v);
      this.recipes = (save.recipes ?? []).filter((r) => DISH_IDS.includes(r as never));
      this.orders = cleanOrders(save.orders);
      this.villagers = cleanVillagers(save.villagers);
      this.apples = Math.max(0, Math.floor(save.apples ?? 0));
      this.berries = Math.max(0, Math.floor(save.berries ?? 0));
      for (const [k, v] of Object.entries(save.shaken ?? {})) {
        const i = Number(k);
        if (isl.decor[i] && typeof v === 'number') this.shaken.set(i, v);
      }
      this.horses = cleanHorses(save.horses, this.stables.length);
      this.paddocks = (save.paddocks ?? []).filter((h) => typeof h?.x === 'number' && typeof h?.y === 'number');
      this.coins = Math.max(0, Math.floor(save.coins ?? 0));
      this.decos = (save.decos ?? []).filter((h) => typeof h?.x === 'number' && typeof h?.y === 'number' && !!decoById(h.id));
      for (const [k, v] of Object.entries(save.decoInv ?? {})) if (decoById(k) && typeof v === 'number' && v > 0) this.decoInv[k] = Math.floor(v);
      this.album = cleanAlbum(save.album);
      this.albumClaimed = Math.max(0, Math.floor(save.albumClaimed ?? 0));
      // ältere Spielstände: eigene Pferde stehen schon im Album
      for (const h of this.horses) if (!this.album.horses.includes(h.breed)) this.album.horses.push(h.breed);
      for (const v of this.villagers) this.albumAdd('folk', v.id);
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
    this.paddocks = w.paddocks;
    this.coins = w.coins;
    this.decos = w.decos;
    this.decoInv = w.decoInv;
    this.album = w.album;
    this.albumClaimed = w.albumClaimed;
    this.picked = w.picked;
    this.apples = w.apples;
    this.berries = w.berries;
    this.shaken = w.shaken;
    this.fish = w.fish;
    this.grilled = w.grilled;
    this.proj = w.proj;
    this.dishes = w.dishes;
    this.recipes = w.recipes;
    this.orders = w.orders;
    this.villagers = w.villagers;
    this.version++;
  }

  toSave(): WorldSave {
    return {
      wood: this.wood,
      felled: Object.fromEntries(this.felled),
      houses: this.houses.map((h) => ({ ...h, ...(h.furn ? { furn: { ...h.furn } } : {}) })),
      fires: this.fires.map((f) => ({ ...f })),
      ...(this.stables.length ? { stables: this.stables.map((f) => ({ ...f })), horses: this.horses.map((h) => ({ ...h })) } : {}),
      ...(this.paddocks.length ? { paddocks: this.paddocks.map((f) => ({ ...f })) } : {}),
      ...(this.coins || this.decos.length || albumCount(this.album) || Object.keys(this.decoInv).length
        ? { coins: this.coins, decos: this.decos.map((d) => ({ ...d })), decoInv: { ...this.decoInv }, album: { horses: [...this.album.horses], deco: [...this.album.deco], ...(this.album.fish ? { fish: [...this.album.fish] } : {}), ...(this.album.folk ? { folk: [...this.album.folk] } : {}) }, albumClaimed: this.albumClaimed }
        : {}),
      ...(this.clock ? { clock: { ...this.clock } } : {}),
      prog: { xp: this.prog.xp, stats: { ...this.prog.stats }, quests: this.prog.quests, v: this.prog.v },
      ...(this.picked.size ? { picked: Object.fromEntries(this.picked) } : {}),
      ...(this.apples || this.berries || this.shaken.size ? { apples: this.apples, berries: this.berries, shaken: Object.fromEntries(this.shaken) } : {}),
      ...(Object.keys(this.fish).length || this.grilled ? { fish: { ...this.fish }, grilled: this.grilled } : {}),
      ...(Object.keys(this.dishes).length || this.recipes.length || this.orders.list
        ? { dishes: { ...this.dishes }, recipes: [...this.recipes], orders: { day: this.orders.day, list: this.orders.list ? this.orders.list.map((o) => ({ ...o, need: { ...o.need } })) : null, done: [...this.orders.done] } }
        : {}),
      ...(this.villagers.length ? { villagers: this.villagers.map((v) => ({ ...v })) } : {}),
      ...(this.proj.n || this.proj.sites.length || Object.keys(this.proj.got).length ? { proj: { n: this.proj.n, got: { ...this.proj.got }, sites: this.proj.sites.map((s) => (s ? [s[0], s[1]] : null)) as ProjState['sites'] } } : {}),
    };
  }

  get level() {
    return levelOf(this.prog.xp);
  }
  get perks() {
    const p = perks(this.level);
    // Gewächshaus fertig: Rüben wachsen ein Viertel schneller
    if (this.proj.n >= 3) p.growMul *= 0.75;
    return p;
  }

  /** Projekt fertig? (Nummer in PROJECTS) */
  projDone(k: number) {
    return this.proj.n > k;
  }
  /** Bauplätze, die schon feststehen (fertige Projekte und die Baustelle des aktuellen) */
  projSites(): { x: number; y: number; foot: Foot; k: number }[] {
    const out: { x: number; y: number; foot: Foot; k: number }[] = [];
    this.proj.sites.forEach((s, k) => {
      if (s && k <= this.proj.n && PROJECTS[k]) out.push({ x: s[0], y: s[1], foot: PROJECTS[k].foot, k });
    });
    return out;
  }

  stage(i: number, now = Date.now()): TreeStage {
    const t = this.felled.get(i);
    if (t === undefined) return 'tree';
    return now - t < SPROUT_MS * this.perks.regrowMul ? 'stump' : 'sapling';
  }

  /** Bäume nachwachsen lassen – aber nicht, wenn jemand genau dort steht */
  grow(now: number, standing?: { x: number; y: number }) {
    // aufgehobene Stöcke und Steine liegen wieder da, Obst wächst nach
    for (const [i, t] of this.picked)
      if (now - t >= PICK_REGROW_MS) {
        this.picked.delete(i);
        this.version++;
      }
    for (const [i, t] of this.shaken)
      if (now - t >= FRUIT_MS) {
        this.shaken.delete(i);
        this.version++;
      }
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
    if (this.builtAt(x, y, fw, fh)) return true;
    for (const p of this.paddocks) if (this.onFence(p, x, y, fw, fh)) return true;
    return false;
  }

  /** Steht hier etwas Gebautes (Haus, Feuer, Stall, Deko)? */
  builtAt(x: number, y: number, fw: number, fh: number) {
    for (const [list, f] of [
      [this.houses, HOUSE_FOOT],
      [this.fires, FIRE_FOOT],
      [this.stables, STABLE_FOOT],
      [this.decos, DECO_FOOT],
      [this.villagers, HUT_FOOT],
    ] as const)
      for (const h of list) if (x + fw > h.x + f.left && x - fw < h.x + f.right && y + fh > h.y + f.top && y - fh < h.y + f.bottom) return true;
    for (const h of this.projSites()) if (x + fw > h.x + h.foot.left && x - fw < h.x + h.foot.right && y + fh > h.y + h.foot.top && y - fh < h.y + h.foot.bottom) return true;
    return false;
  }

  /** Hängt an diesem Baum/Busch gerade Obst? */
  hasFruit(i: number, now = Date.now()) {
    const d = this.isl.decor[i];
    if (!d || !(d.kind === 'tree' || berryBush(d))) return false;
    if (d.kind === 'tree' && this.felled.has(i)) return false;
    const t = this.shaken.get(i);
    return t === undefined || now - t >= FRUIT_MS;
  }

  /** Nächster Baum/Busch mit Obst in Reichweite (Index in island.decor, -1 = keiner) */
  fruitTarget(x: number, y: number, now = Date.now()) {
    let best = -1;
    let bestD = Infinity;
    this.isl.decor.forEach((d, i) => {
      if (d.kind !== 'tree' && d.kind !== 'bush') return;
      const dist = Math.hypot(d.x - x, (d.y - y) * 1.6);
      if (dist >= (d.kind === 'bush' ? REACH + 4 : REACH) || dist >= bestD || !this.hasFruit(i, now)) return;
      bestD = dist;
      best = i;
    });
    return best;
  }

  /** Baum schütteln / Beeren pflücken: Obst kommt in den Vorrat der Insel */
  shake(i: number, now = Date.now()): { apples: number; berries: number } | null {
    if (!this.hasFruit(i, now)) return null;
    const tree = this.isl.decor[i].kind === 'tree';
    this.shaken.set(i, now);
    const got = { apples: tree ? FRUIT.tree : 0, berries: tree ? 0 : FRUIT.bush };
    this.apples += got.apples;
    this.berries += got.berries;
    this.version++;
    return got;
  }

  /** Liegt dieser Stock/Stein gerade da? (nicht aufgehoben, nicht überbaut) */
  pickable(i: number) {
    const p = this.isl.pickups[i];
    return !!p && !this.picked.has(i) && !this.builtAt(p.x, p.y, 2, 2);
  }

  /** Stock oder Stein aufheben (er kommt in den Rucksack dessen, der ihn aufhebt) */
  pick(i: number, now = Date.now()): PickKind | null {
    if (!this.pickable(i)) return null;
    this.picked.set(i, now);
    this.version++;
    return this.isl.pickups[i].kind;
  }

  /** Koppel-Zaun: nur die Ränder sperren, innen ist Wiese, unten ein Tor */
  onFence(p: Paddock, x: number, y: number, fw: number, fh: number) {
    const f = PADDOCK_FOOT;
    const hit = (x0: number, x1: number, y0: number, y1: number) => x + fw > x0 && x - fw < x1 && y + fh > y0 && y - fh < y1;
    const L = p.x + f.left;
    const R = p.x + f.right;
    const T = p.y + f.top;
    const B = p.y;
    return (
      hit(L, R, T - 1, T + 1) ||
      hit(L - 1, L + 1, T, B + 1) ||
      hit(R - 1, R + 1, T, B + 1) ||
      hit(L, p.x - GATE, B - 1, B + 1) ||
      hit(p.x + GATE, R, B - 1, B + 1)
    );
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
    return this.canPlaceFoot(x, y, BUILDS[kind].foot, player);
  }
  /** Darf hier etwas mit dieser Grundfläche stehen? */
  canPlaceFoot(x: number, y: number, f: Foot, player?: { x: number; y: number }) {
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
      [this.paddocks, PADDOCK_FOOT],
      [this.decos, DECO_FOOT],
      [this.villagers, HUT_FOOT],
    ] as const)
      for (const h of list)
        if (x + f.right + 4 > h.x + g.left && x + f.left - 4 < h.x + g.right && y + f.bottom + 4 > h.y + g.top - 6 && y + f.top - 8 < h.y + g.bottom) return false;
    for (const h of this.projSites()) {
      const g = h.foot;
      if (x + f.right + 4 > h.x + g.left && x + f.left - 4 < h.x + g.right && y + f.bottom + 4 > h.y + g.top - 6 && y + f.top - 8 < h.y + g.bottom) return false;
    }
    if (player && player.x + 4 > x + f.left && player.x - 4 < x + f.right && player.y + 2 > y + f.top && player.y - 2 < y + f.bottom) return false;
    return true;
  }

  build(x: number, y: number, player?: { x: number; y: number }, kind: BuildKind = 'house') {
    const cost = BUILDS[kind].cost;
    if (this.wood < cost || !this.canPlace(x, y, player, kind)) return false;
    if (kind === 'hut') {
      // ins neue Häuschen zieht der nächste Bewohner ein
      const v = nextVillager(this);
      if (!v) return false;
      this.wood -= cost;
      this.villagers.push({ id: v.id, x: Math.round(x), y: Math.round(y), hearts: 0, wished: -1, gifted: -1 });
      this.albumAdd('folk', v.id);
      this.version++;
      return true;
    }
    this.wood -= cost;
    (kind === 'fire' ? this.fires : kind === 'stable' ? this.stables : kind === 'paddock' ? this.paddocks : this.houses).push({ x: Math.round(x), y: Math.round(y) });
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
    if (!b || b.rare) return 'Unbekannte Rasse';
    if (this.level < b.level) return `${b.name} gibt es ab Insel-Stufe ${b.level}`;
    if (this.horsesIn(stable) >= STABLE_SPACE) return 'Der Stall ist voll – bau noch einen';
    if (!pay(b.cost)) return 'Zu wenig Rüben';
    this.horses.push({ breed: b.id, name: cleanName(name) || b.names[0], stable, t, love: 0 });
    this.albumAdd('horses', b.id);
    this.version++;
    return null;
  }

  /** Stall mit freiem Platz (für Pferde vom Händler) */
  freeStable() {
    return this.stables.findIndex((_, i) => this.horsesIn(i) < STABLE_SPACE);
  }

  /** seltenes Pferd vom Händler (Münzen werden hier abgezogen) */
  buyHorse(breed: string, name: string, t: number) {
    const b = breedById(breed);
    if (!b?.rare) return 'Unbekannte Rasse';
    const st = this.freeStable();
    if (st < 0) return this.stables.length ? 'Alle Ställe sind voll' : 'Bau zuerst einen Pferdestall';
    if (this.coins < b.rare) return 'Zu wenig Münzen';
    this.coins -= b.rare;
    this.horses.push({ breed: b.id, name: cleanName(name) || b.names[0], stable: st, t, love: 0 });
    this.albumAdd('horses', b.id);
    this.version++;
    return null;
  }

  buyDeco(id: string) {
    const d = decoById(id);
    if (!d) return 'Gibt es nicht';
    if (this.coins < d.price) return 'Zu wenig Münzen';
    this.coins -= d.price;
    this.decoInv[id] = (this.decoInv[id] ?? 0) + 1;
    this.albumAdd('deco', id);
    this.version++;
    return null;
  }

  /** gekaufte Deko aufstellen */
  placeDeco(x: number, y: number, id: string, player?: { x: number; y: number }) {
    if (!(this.decoInv[id] > 0)) return 'Diese Deko hast du nicht';
    if (!this.canPlace(x, y, player, 'deco')) return 'Hier ist kein Platz';
    if (--this.decoInv[id] <= 0) delete this.decoInv[id];
    this.decos.push({ x: Math.round(x), y: Math.round(y), id });
    this.version++;
    return null;
  }

  albumAdd(kind: keyof Album, id: string) {
    const list = (this.album[kind] ??= []);
    if (list.includes(id)) return false;
    list.push(id);
    return true;
  }

  /** Fisch gefangen: in den Vorrat und ins Album; true = zum ersten Mal */
  catchFish(id: string) {
    if (!fishById(id)) return null;
    this.fish[id] = (this.fish[id] ?? 0) + 1;
    const first = this.albumAdd('fish', id);
    this.version++;
    return first;
  }

  /** einen Fisch zum Braten nehmen (der häufigste zuerst; seltene nicht) */
  takeCookable() {
    const f = FISH.find((x) => x.cook && (this.fish[x.id] ?? 0) > 0);
    if (!f) return false;
    if (--this.fish[f.id] <= 0) delete this.fish[f.id];
    this.grilled++;
    this.version++;
    return true;
  }

  /** neu erreichte Album-Belohnungen auszahlen */
  claimAlbum() {
    const got: { at: number; coins: number }[] = [];
    while (this.albumClaimed < ALBUM_REWARDS.length && albumCount(this.album) >= ALBUM_REWARDS[this.albumClaimed].at) {
      const r = ALBUM_REWARDS[this.albumClaimed++];
      this.coins += r.coins;
      got.push(r);
    }
    if (got.length) this.version++;
    return got;
  }

  /** Koppel des Stalls (die nächste in Reichweite) */
  paddockOf(stable: number) {
    const st = this.stables[stable];
    if (!st) return undefined;
    let best: Paddock | undefined;
    let bestD = PADDOCK_REACH;
    for (const p of this.paddocks) {
      const d = Math.hypot(p.x - st.x, p.y + PADDOCK_FOOT.top / 2 - st.y);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  /** Schmuck anlegen ('' = ohne); nur was das Vertrauen schon freigeschaltet hat */
  dress(horse: number, acc: string) {
    const h = this.horses[horse];
    if (!h) return 'Dieses Pferd gibt es nicht';
    if (acc) {
      const a = accById(acc);
      if (!a) return 'Gibt es nicht';
      if (h.love < a.love) return `${a.name} gibt es ab ${Math.ceil(a.love / 2)} Herzen`;
      h.acc = acc;
    } else delete h.acc;
    this.version++;
    return null;
  }

  /** Was heute bei diesem Pferd schon erledigt ist */
  doneToday(horse: number, what: Care, t: number) {
    return this.horses[horse]?.[what] === islandDay(this.clock, t);
  }

  /**
   * Pflege: Heu füttern, Leckerli (Rübe) oder bürsten – je einmal am Tag, jedes gibt Vertrauen.
   * pay prüft und zieht das Futter ab.
   */
  care(horse: number, what: Care, t: number, pay: () => boolean) {
    const h = this.horses[horse];
    if (!h) return 'Dieses Pferd gibt es nicht';
    if (this.doneToday(horse, what, t)) return what === 'brushed' ? `${h.name} glänzt schon` : what === 'fed' ? `${h.name} ist satt` : `${h.name} hatte heute schon ein Leckerli`;
    if (!pay()) return what === 'fed' ? 'Kein Heu – mäh die Wiese mit der Sense' : 'Keine Rüben';
    h[what] = islandDay(this.clock, t);
    h.love = Math.min(MAX_LOVE, h.love + 1);
    this.version++;
    return null;
  }

  /** Warum (noch) kein Fohlen? null = geht */
  foalBlock(horse: number, t: number, hay: number) {
    const h = this.horses[horse];
    if (!h) return 'Dieses Pferd gibt es nicht';
    if (isFoal(h, t)) return 'Noch selbst ein Fohlen';
    if (h.love < MAX_LOVE) return 'Braucht volles Vertrauen';
    if (h.bred !== undefined && islandDay(this.clock, t) - h.bred < FOAL_PAUSE_DAYS) return 'Braucht noch ein paar Tage Pause';
    if (!this.horses.some((o, i) => i !== horse && o.stable === h.stable && !isFoal(o, t) && o.love >= MAX_LOVE)) return 'Braucht ein zweites Pferd mit vollem Vertrauen im Stall';
    if (this.horsesIn(h.stable) >= STABLE_SPACE) return 'Der Stall ist voll';
    if (hay < FOAL_HAY) return `Braucht ${FOAL_HAY} Heu`;
    return null;
  }

  /** Fohlen kommt zur Welt (pay zieht das Heu ab) */
  foal(horse: number, name: string, t: number, hay: number, pay: () => void) {
    const err = this.foalBlock(horse, t, hay);
    if (err) return err;
    const h = this.horses[horse];
    pay();
    h.bred = islandDay(this.clock, t);
    this.horses.push({ breed: h.breed, name: cleanName(name) || breedById(h.breed)!.names[0], stable: h.stable, t, love: 2, foal: t });
    this.version++;
    return null;
  }

  /** Feuer in der Nähe (zum Kochen) */
  fireNear(x: number, y: number, r = 16) {
    return this.fires.findIndex((f) => Math.hypot(f.x - x, (f.y - y) * 1.4) < r);
  }
}
