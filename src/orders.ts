/**
 * Bestellbrett am Steg: jeden Inseltag drei Bestellungen (klein, mittel, groß).
 * Wer liefert, bekommt Münzen; die große Bestellung bringt ein neues Rezept
 * (sonst Samen). Was bestellt wird, richtet sich danach, was die Insel schon kann.
 * Auf jedem Gerät gleich (hängt nur vom Tag und vom Stand der Insel ab). Reine Logik.
 */
import { LEARNABLE, knows } from './cooking';
import type { Farm } from './farm';
import { islandDay } from './horses';
import { rng, type Island } from './island';
import { DISH_IDS, STORE_NAMES, STORE_VALUE, storeHasAll, storeTake, type DishId, type StoreItem } from './store';
import type { World } from './world';

export interface Order {
  need: Partial<Record<StoreItem, number>>;
  coins: number;
  /** große Bestellung: neues Rezept oder Samen */
  recipe?: DishId;
  seeds?: number;
}
export interface OrderState {
  /** Inseltag, für den die Liste gilt */
  day: number;
  /** steht ab der ersten Lieferung des Tages fest */
  list: Order[] | null;
  /** schon geliefert (Nummern) */
  done: number[];
}
export const newOrders = (): OrderState => ({ day: -1, list: null, done: [] });
export const SIZES = ['Klein', 'Mittel', 'Groß'];
/** wo das Brett steht: am Strand gleich rechts vom Steg-Anfang (dort darf nichts gebaut werden) */
export const boardSpot = (isl: Island) => ({ x: isl.dock.x + isl.dock.w - 3, y: isl.dock.y - 6 });
/** wer bestellt (nur für die Anzeige) */
export const CUSTOMERS = ['Kapitänin Frieda', 'Fischer Ole', 'Oma Rosi', 'Bäcker Paul', 'Lina vom Leuchtturm', 'Gärtner Jo'];

export function cleanOrders(o: Partial<OrderState> | undefined): OrderState {
  const out = newOrders();
  if (!o || typeof o !== 'object') return out;
  out.day = typeof o.day === 'number' ? Math.floor(o.day) : -1;
  out.done = Array.isArray(o.done) ? o.done.filter((i) => Number.isInteger(i) && i >= 0 && i < 3) : [];
  if (Array.isArray(o.list))
    out.list = o.list.slice(0, 3).map((x) => {
      const need: Partial<Record<StoreItem, number>> = {};
      for (const [k, v] of Object.entries(x?.need ?? {})) if (k in STORE_NAMES && typeof v === 'number' && v > 0) need[k as StoreItem] = Math.floor(v);
      return { need, coins: Math.max(0, Math.floor(x?.coins ?? 0)), ...(x?.recipe && DISH_IDS.includes(x.recipe) ? { recipe: x.recipe } : {}), ...(x?.seeds ? { seeds: Math.floor(x.seeds) } : {}) };
    });
  return out;
}

/** was die Insel schon liefern kann */
function pool(w: World): StoreItem[] {
  const st = w.prog.stats;
  const p: StoreItem[] = ['wood', 'apple', 'berry'];
  if ((st.harvested ?? 0) > 0) p.push('turnip');
  if ((st.fish ?? 0) > 0) p.push('fish');
  if ((st.hay ?? 0) > 0) p.push('hay');
  if ((st.cooked ?? 0) > 0) {
    p.push('meal', 'obstsalat');
    if ((st.fish ?? 0) > 0) p.push('grilled');
    for (const d of LEARNABLE) if (knows(w, d)) p.push(d);
  }
  return p;
}
const AMOUNT: Partial<Record<StoreItem, [number, number]>> = {
  wood: [4, 10],
  apple: [3, 6],
  berry: [3, 7],
  turnip: [2, 5],
  fish: [1, 3],
  hay: [3, 6],
  meal: [1, 2],
  grilled: [1, 2],
  obstsalat: [1, 2],
  fischsuppe: [1, 1],
  apfelkuchen: [1, 1],
  marmelade: [1, 1],
};

/** die drei Bestellungen eines Tages */
export function makeOrders(day: number, w: World): Order[] {
  const r = rng(day * 7919 + 17);
  const pl = pool(w);
  return [1, 2, 3].map((kinds, size) => {
    const items: StoreItem[] = [];
    const left = [...pl];
    for (let k = 0; k < Math.min(kinds, left.length); k++) items.push(...left.splice(Math.floor(r() * left.length), 1));
    const need: Partial<Record<StoreItem, number>> = {};
    let value = 0;
    for (const it of items) {
      const [lo, hi] = AMOUNT[it] ?? [1, 1];
      const n = Math.max(1, Math.round((lo + Math.floor(r() * (hi - lo + 1))) * (size === 2 ? 1.4 : 1)));
      need[it] = n;
      value += n * STORE_VALUE[it];
    }
    const o: Order = { need, coins: Math.round(value * [1.6, 2, 2.4][size]) + [3, 8, 15][size] };
    if (size === 2) {
      const rec = LEARNABLE.find((d) => !w.recipes.includes(d));
      if (rec) o.recipe = rec;
      else o.seeds = 5;
    }
    return o;
  });
}

/** Bestellungen von heute (feste Liste, sobald heute schon geliefert wurde) */
export function ordersToday(w: World, t: number): OrderState & { list: Order[] } {
  const day = islandDay(w.clock, t);
  if (w.orders.day === day && w.orders.list) return w.orders as OrderState & { list: Order[] };
  return { day, list: makeOrders(day, w), done: w.orders.day === day ? w.orders.done : [] };
}

/** Bestellung Nummer i liefern */
export function deliver(w: World, f: Farm, i: number, t: number): { err: string | null; order?: Order } {
  const st = ordersToday(w, t);
  const o = st.list[i];
  if (!o) return { err: 'Diese Bestellung gibt es nicht' };
  if (st.done.includes(i)) return { err: 'Schon geliefert' };
  if (!storeHasAll(w, f, o.need)) return { err: 'Dafür fehlt noch etwas' };
  for (const [k, n] of Object.entries(o.need) as [StoreItem, number][]) storeTake(w, f, k, n);
  w.coins += o.coins;
  if (o.recipe && !w.recipes.includes(o.recipe)) w.recipes.push(o.recipe);
  if (o.seeds) f.seeds += o.seeds;
  w.orders = { day: st.day, list: st.list, done: [...st.done, i] };
  w.version++;
  return { err: null, order: o };
}
