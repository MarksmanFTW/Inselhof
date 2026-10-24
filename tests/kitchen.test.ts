import { describe, expect, it } from 'vitest';
import { COOK, LEARNABLE, knows } from '../src/cooking';
import { Farm } from '../src/farm';
import { generate } from '../src/island';
import { applyOp, link } from '../src/ops';
import { makeOrders, ordersToday } from '../src/orders';
import { storeGive, storeHas, type StoreItem } from '../src/store';
import { DAY_MS, newClock } from '../src/time';
import { World } from '../src/world';

const isl = generate();
function setup() {
  const w = new World(isl);
  const f = new Farm(isl);
  link(w, f);
  w.clock = newClock(0);
  w.fires.push({ x: 100, y: 100 });
  return { w, f };
}
/** Aktion am Lagerfeuer */
const at = (w: World, f: Farm, a: object, t = 1000) => applyOp(w, f, { a: a as never, x: 100, y: 108, t });

describe('Kochen', () => {
  it('drei Rezepte kennt man, drei muss man sich verdienen', () => {
    const { w } = setup();
    expect(COOK.filter((r) => knows(w, r.id)).map((r) => r.id)).toEqual(['meal', 'grilled', 'obstsalat']);
    expect(LEARNABLE).toEqual(['fischsuppe', 'apfelkuchen', 'marmelade']);
  });

  it('Zutaten werden verbraucht, das Gericht kommt in den Vorrat', () => {
    const { w, f } = setup();
    w.apples = 3;
    w.berries = 2;
    expect(at(w, f, { kind: 'cook', item: 'obstsalat' }).cooked).toBe('obstsalat');
    expect([w.apples, w.berries, w.dishes.obstsalat]).toEqual([1, 0, 1]);
    expect(at(w, f, { kind: 'cook', item: 'obstsalat' }).err).toMatch(/Zutaten/);
    expect(at(w, f, { kind: 'cook', item: 'fischsuppe' }).err).toMatch(/kennst du noch nicht/);
    // Ofenrübe und Bratfisch wie früher
    f.turnips = 1;
    w.fish = { goldfisch: 1, hering: 1 };
    at(w, f, { kind: 'cook', item: 'meal' });
    at(w, f, { kind: 'cook', item: 'grilled' });
    expect([f.turnips, f.meals, w.grilled, w.fish]).toEqual([0, 1, 1, { goldfisch: 1 }]);
    expect(w.prog.stats.cooked).toBe(3);
    // weit weg vom Feuer geht nichts
    expect(applyOp(w, f, { a: { kind: 'cook', item: 'meal' }, x: 300, y: 300, t: 1 }).err).toMatch(/Lagerfeuer/);
    // essen und verkaufen
    expect(at(w, f, { kind: 'eat', item: 'obstsalat' }).err).toBeNull();
    expect(w.dishes).toEqual({});
    storeGive(w, f, 'marmelade', 2);
    const noon = (5 * DAY_MS) / 24;
    expect(at(w, f, { kind: 'sell', item: 'dish:marmelade', n: 2 }, noon).coins).toBe(32);
    // ältere Aktionen (vor den Rezepten) gehen weiter
    f.turnips = 1;
    expect(at(w, f, { kind: 'cook' }).err).toBeNull();
    expect(f.meals).toBe(2);
  });
});

describe('Bestellbrett', () => {
  it('drei Bestellungen pro Tag, auf jedem Gerät gleich, am nächsten Tag neue', () => {
    const { w } = setup();
    const a = makeOrders(5, w);
    expect(a).toHaveLength(3);
    expect(makeOrders(5, new World(isl))).toEqual(a);
    expect(makeOrders(6, w)).not.toEqual(a);
    expect(Object.keys(a[0].need)).toHaveLength(1);
    expect(Object.keys(a[2].need).length).toBeGreaterThanOrEqual(2);
    expect(a[2].recipe).toBe('fischsuppe');
    // am Anfang nur, was es schon gibt
    const items = new Set(a.flatMap((o) => Object.keys(o.need)));
    for (const it of items) expect(['wood', 'apple', 'berry']).toContain(it);
  });

  it('später werden auch Fische, Heu und Gerichte bestellt', () => {
    const { w } = setup();
    Object.assign(w.prog.stats, { harvested: 5, fish: 3, hay: 6, cooked: 2 });
    w.recipes.push('fischsuppe');
    const seen = new Set<string>();
    for (let d = 0; d < 60; d++) for (const o of makeOrders(d, w)) Object.keys(o.need).forEach((k) => seen.add(k));
    for (const it of ['turnip', 'fish', 'hay', 'meal', 'grilled', 'obstsalat', 'fischsuppe']) expect(seen.has(it)).toBe(true);
    expect(seen.has('apfelkuchen')).toBe(false); // kennt man noch nicht
  });

  it('liefern: Vorrat weg, Münzen und Rezept bekommen, nur einmal', () => {
    const { w, f } = setup();
    const t = 1000;
    const today = ordersToday(w, t);
    const big = today.list[2];
    for (const [k, n] of Object.entries(big.need)) storeGive(w, f, k as StoreItem, n);
    const coins = w.coins;
    const r = at(w, f, { kind: 'order', n: 2 }, t);
    expect(r.err).toBeNull();
    expect(w.coins - coins).toBe(big.coins);
    expect(w.recipes).toEqual(['fischsuppe']);
    expect(knows(w, 'fischsuppe')).toBe(true);
    for (const k of Object.keys(big.need)) expect(storeHas(w, f, k as StoreItem)).toBe(0);
    expect(at(w, f, { kind: 'order', n: 2 }, t).err).toMatch(/Schon/);
    expect(at(w, f, { kind: 'order', n: 0 }, t).err).toMatch(/fehlt/);
    expect(w.prog.stats.orders).toBe(1);
    // Liste steht fest, auch wenn sich die Insel weiterentwickelt
    w.prog.stats.fish = 9;
    expect(ordersToday(w, t).list).toEqual(today.list);
    // nächster Tag: neue Liste, nichts erledigt
    const next = ordersToday(w, t + DAY_MS);
    expect(next.done).toEqual([]);
    expect(next.list[2].recipe).toBe('apfelkuchen');
    // bleibt beim Speichern erhalten
    const again = new World(isl, JSON.parse(JSON.stringify(w.toSave())));
    expect([again.orders, again.recipes]).toEqual([w.orders, w.recipes]);
  });
});
