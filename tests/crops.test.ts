import { describe, expect, it } from 'vitest';
import { CROPS, Farm, GROW_MS, RIPE } from '../src/farm';
import { generate } from '../src/island';
import { applyOp, link } from '../src/ops';
import { orderPool } from '../src/orders';
import { xpFor } from '../src/progress';
import { ALBUM_TOTAL } from '../src/shop';
import { DAY_MS, newClock } from '../src/time';
import { World } from '../src/world';

const isl = generate();
const [c, r] = Farm.tileAt(176, 172);
function setup() {
  const w = new World(isl);
  const f = new Farm(isl);
  link(w, f);
  w.clock = newClock(0);
  return { w, f };
}
const op = (w: World, f: Farm, a: object, t = 1000) => applyOp(w, f, { a: a as never, x: 0, y: 0, t });
/** bis zur Reife gießen und wachsen lassen */
function ripen(f: Farm, t0: number) {
  let now = t0;
  for (let s = 0; s < RIPE; s++) {
    f.pour(c, r, now);
    now += GROW_MS * 2;
    f.update(now);
  }
  return now;
}
const noon = (5 * DAY_MS) / 24;

describe('Neue Pflanzen', () => {
  it('Karotten wachsen schneller, Kürbisse langsamer', () => {
    const f = new Farm(isl);
    f.till(c, r, true);
    f.addSeeds('carrot', 1);
    f.addSeeds('pumpkin', 1);
    expect(f.plant(c, r, 'carrot')).toBeNull();
    f.pour(c, r, 1000);
    f.update(1000 + GROW_MS * 0.75);
    expect(f.plot(c, r)!.crop).toEqual({ stage: 1, kind: 'carrot' });
    const [c2, r2] = [c + 1, r];
    f.till(c2, r2, true);
    expect(f.plant(c2, r2, 'pumpkin')).toBeNull();
    f.pour(c2, r2, 1000);
    f.update(1000 + GROW_MS * 1.5);
    expect(f.plot(c2, r2)!.crop!.stage).toBe(0);
    f.update(1000 + GROW_MS * 1.75);
    expect(f.plot(c2, r2)!.crop!.stage).toBe(1);
    expect(f.plant(c2 + 1, r2, 'strawberry')).toMatch(/Hacke/);
    f.till(c2 + 1, r2, true);
    expect(f.plant(c2 + 1, r2, 'strawberry')).toMatch(/Keine Erdbeersamen/);
  });

  it('säen, ernten, Album, Aufgaben-Zähler, verkaufen und speichern', () => {
    const { w, f } = setup();
    f.till(c, r, true);
    f.addSeeds('strawberry', 2);
    expect(op(w, f, { kind: 'seeds', c, r, item: 'strawberry' }).err).toBeNull();
    expect(f.seedsOf('strawberry')).toBe(1);
    const t = ripen(f, 2000);
    const res = op(w, f, { kind: 'harvest', c, r }, t);
    expect(res.harvest).toMatchObject({ kind: 'strawberry', n: 3 });
    expect(f.cropsOf('strawberry')).toBe(3);
    expect(f.seedsOf('strawberry')).toBeGreaterThanOrEqual(2);
    expect(w.album.crops).toEqual(['strawberry']);
    expect(w.prog.stats.strawberries).toBe(1);
    expect(w.prog.stats.harvested).toBe(1);
    expect(orderPool(w)).toContain('strawberry');
    // Erdbeere roh essen
    expect(op(w, f, { kind: 'eat', item: 'strawberry' }).err).toBeNull();
    expect(f.cropsOf('strawberry')).toBe(2);
    // verkaufen (Boot ist mittags da)
    const coins = w.coins;
    expect(op(w, f, { kind: 'sell', item: 'crop:strawberry', n: 2 }, noon).err).toBeNull();
    expect(w.coins).toBe(coins + 2 * CROPS.find((x) => x.id === 'strawberry')!.price);
    expect(op(w, f, { kind: 'sell', item: 'crop:strawberry', n: 1 }, noon).err).toMatch(/So viel/);
    // gespeichert
    f.addCrop('pumpkin', 2);
    const f2 = new Farm(isl, JSON.parse(JSON.stringify(f.toSave())));
    expect([f2.cropsOf('pumpkin'), f2.seedsOf('strawberry')]).toEqual([2, f.seedsOf('strawberry')]);
    const w2 = new World(isl, JSON.parse(JSON.stringify(w.toSave())));
    expect(w2.album.crops).toContain('strawberry');
    // alte Rüben-Ernten kommen beim Laden ins Album
    expect(w2.album.crops).toContain('turnip');
  });

  it('Samen beim Händler erst ab der Insel-Stufe', () => {
    const { w, f } = setup();
    w.coins = 100;
    expect(op(w, f, { kind: 'buy', item: 'seeds:carrot' }, noon).err).toBeNull();
    expect(f.seedsOf('carrot')).toBe(6);
    expect(op(w, f, { kind: 'buy', item: 'seeds:pumpkin' }, noon).err).toMatch(/Stufe 5/);
    w.prog.xp = xpFor(5);
    expect(op(w, f, { kind: 'buy', item: 'seeds:pumpkin' }, noon).err).toBeNull();
    expect(f.seedsOf('pumpkin')).toBe(3);
    expect(op(w, f, { kind: 'buy', item: 'seeds:turnip' }, noon).err).toMatch(/Gibt es nicht/);
  });

  it('Kürbissuppe kochen', () => {
    const { w, f } = setup();
    w.fires.push({ x: 0, y: 0 });
    w.recipes.push('kuerbissuppe');
    f.addCrop('pumpkin', 1);
    f.turnips = 1;
    expect(op(w, f, { kind: 'cook', item: 'kuerbissuppe' }).err).toBeNull();
    expect([w.dishes.kuerbissuppe, f.cropsOf('pumpkin'), f.turnips]).toEqual([1, 0, 0]);
    expect(ALBUM_TOTAL).toBeGreaterThan(50);
  });
});
