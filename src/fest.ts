/**
 * Feste auf der Insel (Halloween, Winterfest): jeden Inseltag liegen ein paar
 * Fundstücke (Kürbisse bzw. Geschenke) herum, die Bewohner verschenken einmal am Tag
 * Süßes, und im Festladen gibt es Deko und einen Hut. Gehört der Insel (Koop: zusammen).
 * Welches Fest gerade ist, bestimmt das Gerät (Datum) und schickt es in der Aktion mit.
 * Reine Logik.
 */
import { islandDay } from './horses';
import { Ground, H, W, rng, type Island } from './island';
import { festById, type FestId } from './season';
import { timeOf } from './time';
import type { World } from './world';

export interface FestState {
  /** Fest-Währung (Bonbons, Plätzchen) */
  coins: Partial<Record<FestId, number>>;
  /** heute schon aufgehobene Fundstücke */
  found: { day: number; list: number[] };
  /** heute schon besuchte Bewohner */
  visits: { day: number; list: string[] };
}
export const newFest = (): FestState => ({ coins: {}, found: { day: -1, list: [] }, visits: { day: -1, list: [] } });
export function cleanFest(f: Partial<FestState> | undefined): FestState {
  const out = newFest();
  if (!f || typeof f !== 'object') return out;
  for (const [k, v] of Object.entries(f.coins ?? {})) if (festById(k) && typeof v === 'number' && v > 0) out.coins[k as FestId] = Math.floor(v);
  const ints = (l: unknown) => (Array.isArray(l) ? l.filter((x): x is number => Number.isInteger(x) && x >= 0 && x < 50) : []);
  if (f.found && typeof f.found.day === 'number') out.found = { day: Math.floor(f.found.day), list: ints(f.found.list) };
  if (f.visits && typeof f.visits.day === 'number') out.visits = { day: Math.floor(f.visits.day), list: Array.isArray(f.visits.list) ? f.visits.list.filter((x): x is string => typeof x === 'string') : [] };
  return out;
}

/** mögliche Plätze für Fundstücke: Wiese, frei von Bäumen & Co (einmal je Insel berechnet) */
const spotCache = new WeakMap<Island, { x: number; y: number }[]>();
export function festSpots(isl: Island) {
  let s = spotCache.get(isl);
  if (s) return s;
  s = [];
  const gAt = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? Ground.Water : isl.ground[(y | 0) * W + (x | 0)]);
  const dk = isl.dock;
  for (let y = 20; y < H - 20; y += 9)
    for (let x = 20; x < W - 20; x += 9) {
      const px = x + ((y * 7) % 5);
      if (![[0, 0], [8, 0], [-8, 0], [0, 6], [0, -6]].every(([dx, dy]) => gAt(px + dx, y + dy) === Ground.Grass)) continue;
      if (isl.decor.some((d) => d.kind !== 'grass' && Math.hypot(d.x - px, (d.y - y) * 1.6) < 14)) continue;
      if (isl.pickups.some((p) => Math.hypot(p.x - px, p.y - y) < 10)) continue;
      if (px > dk.x - 10 && px < dk.x + dk.w + 10 && y > dk.y - 16) continue;
      s.push({ x: px, y });
    }
  spotCache.set(isl, s);
  return s;
}
/** wo die Fundstücke des Tages liegen (auf jedem Gerät gleich) */
export function festFinds(isl: Island, fest: FestId, day: number) {
  const spots = festSpots(isl);
  const f = festById(fest)!;
  const r = rng(day * 4111 + (fest === 'halloween' ? 7 : 19));
  const out: { x: number; y: number }[] = [];
  for (let k = 0; k < 200 && out.length < f.find.perDay && spots.length; k++) {
    const s = spots[Math.floor(r() * spots.length)];
    if (out.every((o) => Math.hypot(o.x - s.x, o.y - s.y) > 30)) out.push(s);
  }
  return out;
}
/** liegt Fundstück i heute noch da? */
export const festFindLeft = (w: World, fest: FestId, i: number, day: number) => {
  void fest;
  return !(w.fest.found.day === day && w.fest.found.list.includes(i));
};

/** Fundstück aufheben → Fest-Währung */
export function festFind(w: World, fest: FestId, i: number, t: number): string | null {
  const f = festById(fest);
  if (!f) return 'Gerade ist kein Fest';
  const day = islandDay(w.clock, t);
  if (i < 0 || i >= f.find.perDay) return 'Gibt es nicht';
  if (w.fest.found.day !== day) w.fest.found = { day, list: [] };
  if (w.fest.found.list.includes(i)) return 'Schon aufgehoben';
  const p = festFinds(w.isl, fest, day)[i];
  if (!p || w.builtAt(p.x, p.y, 2, 2)) return 'Gibt es nicht';
  w.fest.found.list.push(i);
  w.fest.coins[fest] = (w.fest.coins[fest] ?? 0) + f.find.gives;
  w.version++;
  return null;
}

/** Bewohner besuchen (Halloween: nur nachts) → Fest-Währung, einmal am Tag je Bewohner */
export function festVisit(w: World, fest: FestId, who: string, t: number): string | null {
  const f = festById(fest);
  if (!f) return 'Gerade ist kein Fest';
  if (!w.villagers.some((v) => v.id === who)) return 'Diesen Bewohner gibt es nicht';
  if (f.visit.night && !(w.clock && timeOf(w.clock, t).night)) return 'Das geht erst, wenn es dunkel ist';
  const day = islandDay(w.clock, t);
  if (w.fest.visits.day !== day) w.fest.visits = { day, list: [] };
  if (w.fest.visits.list.includes(who)) return 'Heute warst du schon da';
  w.fest.visits.list.push(who);
  w.fest.coins[fest] = (w.fest.coins[fest] ?? 0) + f.visit.gives;
  w.version++;
  return null;
}
/** heute schon besucht? */
export const festVisited = (w: World, who: string, day: number) => w.fest.visits.day === day && w.fest.visits.list.includes(who);

/** im Festladen kaufen; Deko kommt ins Lager, Hüte schaltet das Gerät für die Figur frei */
export function festBuy(w: World, fest: FestId, id: string): { err: string | null; kind?: 'deco' | 'hat' } {
  const f = festById(fest);
  const it = f?.shop.find((s) => s.id === id);
  if (!f || !it) return { err: 'Gibt es nicht' };
  if ((w.fest.coins[fest] ?? 0) < it.price) return { err: `Zu wenig ${f.coin.name}` };
  w.fest.coins[fest]! -= it.price;
  if (it.kind === 'deco') w.decoInv[id] = (w.decoInv[id] ?? 0) + 1;
  w.albumAdd('deco', id);
  w.version++;
  return { err: null, kind: it.kind };
}

/** wo der Festladen steht: am Strand links vom Steg (dort wird nicht gebaut) */
export const stallSpot = (isl: Island) => ({ x: isl.dock.x - 6, y: isl.dock.y - 6 });
