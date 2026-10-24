import { describe, expect, it } from 'vitest';
import { bagCraft, cleanBag, newBag, type Bag } from '../src/craft';
import { Farm, GROW_MS } from '../src/farm';
import { generate } from '../src/island';
import { applyOp, link } from '../src/ops';
import { cleanProgress, questAt } from '../src/progress';
import { bagUpgrade, upLevel, upgradeBlock, UPGRADES } from '../src/upgrades';
import { BEET_COST, ENLARGE, World, beetTiles } from '../src/world';

const isl = generate();
function setup() {
  const w = new World(isl);
  const f = new Farm(isl);
  link(w, f);
  return { w, f };
}
const op = (w: World, f: Farm, a: object, x = 0, y = 0, t = 1000) => applyOp(w, f, { a: a as never, x, y, t });
/** freier Platz für etwas mit dieser Art */
function spot(w: World, f: Farm, kind: 'beet' | 'coach' | 'house') {
  for (let y = 60; y < 300; y += 8)
    for (let x = 60; x < 600; x += 8) {
      const p = kind === 'beet' ? { x: x + 4, y } : { x, y };
      if (w.canPlace(p.x, p.y, undefined, kind) && !beetTiles(p).some(([c, r]) => f.plot(c, r))) return p;
    }
  throw new Error('kein Platz');
}

describe('Werkzeug verbessern', () => {
  const bag = (): Bag => {
    const b = newBag();
    b.stones = 20;
    for (const t of ['axe', 'hoe', 'water', 'scythe', 'rod'] as const) bagCraft(b, t);
    b.stones = 20;
    return b;
  };
  it('Eisen, dann Gold; kostet Münzen, Holz und Steine; Gold erst ab Stufe 4', () => {
    const { w, f } = setup();
    const b = bag();
    w.coins = 200;
    w.wood = 50;
    const have = () => ({ coins: w.coins, wood: w.wood, level: w.level });
    expect(upgradeBlock(b, 'axe', have())).toBeNull();
    expect(op(w, f, { kind: 'upgrade', item: 'axe', n: 1 }).err).toBeNull();
    bagUpgrade(b, 'axe');
    expect([upLevel(b, 'axe'), w.coins, b.stones]).toEqual([1, 175, 16]);
    // Gold: Insel-Stufe zu niedrig
    expect(upgradeBlock(b, 'axe', have())).toMatch(/Stufe 4/);
    expect(op(w, f, { kind: 'upgrade', item: 'axe', n: 2 }).err).toMatch(/Stufe 4/);
    w.prog.xp = 400;
    expect(upgradeBlock(b, 'axe', have())).toBeNull();
    bagUpgrade(b, 'axe');
    expect(upgradeBlock(b, 'axe', have())).toMatch(/ganz verbessert/);
    // ohne Werkzeug geht nichts, ohne Münzen auch nicht
    const empty = newBag();
    expect(upgradeBlock(empty, 'hoe', have())).toMatch(/Werkzeug/);
    expect(upgradeBlock(empty, 'shoes', { coins: 0, wood: 50, level: 9 })).toMatch(/Münzen/);
    expect(w.prog.stats.upgrades).toBe(1);
  });

  it('Stufen bleiben im Rucksack gespeichert, Unsinn fliegt raus', () => {
    const b = cleanBag(JSON.parse(JSON.stringify({ ...bag(), up: { axe: 2, shoes: 1, drache: 3, hoe: 9 } })));
    expect(b.up).toEqual({ axe: 2, hoe: 2, shoes: 1 });
    expect(cleanBag({ ...newBag() }).up).toBeUndefined();
    expect(UPGRADES).toHaveLength(7);
  });

  it('Eisenaxt fällt schneller, Goldaxt gibt mehr Holz – auch beim Abgleich', () => {
    const { w, f } = setup();
    const tree = isl.decor.findIndex((d) => d.kind === 'tree');
    const hits = (axe: number) => {
      const w2 = new World(isl);
      let n = 0;
      while (!w2.felled.has(tree) && n < 20) {
        w2.chop(tree, 1, axe);
        n++;
      }
      return [n, w2.wood];
    };
    expect(hits(0)).toEqual([5, 4]);
    expect(hits(1)).toEqual([4, 4]);
    expect(hits(2)).toEqual([3, 5]);
    // Abgleich: das Umfallen wird mit der Stufe gemerkt
    expect(op(w, f, { kind: 'axe', tree, fell: true, n: 2 }).wood).toBe(5);
  });
});

describe('Hochbeet', () => {
  it('sechs fertige Felder, Rüben wachsen doppelt so schnell', () => {
    const { w, f } = setup();
    w.wood = 30;
    const p = spot(w, f, 'beet');
    const r = op(w, f, { kind: 'build', what: 'beet', x: p.x + 3, y: p.y + 2 }, p.x, p.y + 40);
    expect(r.err).toBeNull();
    expect(w.wood).toBe(30 - BEET_COST);
    const b = w.beets[0];
    const tiles = beetTiles(b);
    expect(tiles).toHaveLength(6);
    for (const [c, rr] of tiles) expect(f.plot(c, rr)).toBeTruthy();
    expect(w.onBeet(...tiles[0])).toBe(true);
    expect(w.prog.stats.beets).toBe(1);
    // gleich säen und gießen
    f.seeds = 2;
    const [c, rr] = tiles[0];
    f.plant(c, rr);
    f.pour(c, rr, 1);
    // normales Feld daneben zum Vergleich
    f.plots.set('1,1', { wetAt: 1, crop: { stage: 0 } });
    f.update(GROW_MS / 2 + 10);
    expect(f.plot(c, rr)!.crop!.stage).toBe(1);
    expect(f.plot(1, 1)!.crop!.stage).toBe(0);
    // auf dem Beet laufen geht nicht, und dort baut man nichts mehr
    expect(w.blocked(b.x, b.y - 8, 2, 2)).toBe(true);
    expect(op(w, f, { kind: 'build', what: 'beet', x: b.x, y: b.y }, b.x, b.y + 40).err).toBeTruthy();
    // gespeichert
    const again = new World(isl, JSON.parse(JSON.stringify(w.toSave())));
    expect(again.beets).toEqual(w.beets);
  });
});

describe('Haus ausbauen und Kutschenhalt', () => {
  it('ausbauen kostet Holz und Münzen, nur einmal; mehr Möbelplätze', () => {
    const { w, f } = setup();
    w.wood = 60;
    w.coins = 50;
    const p = spot(w, f, 'house');
    op(w, f, { kind: 'build', what: 'house', x: p.x, y: p.y }, p.x, p.y + 40);
    expect(op(w, f, { kind: 'furnish', house: 0, slot: 6, item: 'chair' }).err).toMatch(/Unbekannt/);
    expect(op(w, f, { kind: 'enlarge', house: 0 }).err).toBeNull();
    expect([w.wood, w.coins, w.houses[0].big]).toEqual([60 - 10 - ENLARGE.wood, 50 - ENLARGE.coins, true]);
    expect(op(w, f, { kind: 'enlarge', house: 0 }).err).toMatch(/schon/);
    expect(op(w, f, { kind: 'furnish', house: 0, slot: 6, item: 'chair' }).err).toBeNull();
    const again = new World(isl, JSON.parse(JSON.stringify(w.toSave())));
    expect(again.houses[0]).toEqual(w.houses[0]);
  });

  it('Kutschenhalt wird gebaut und gespeichert', () => {
    const { w, f } = setup();
    w.wood = 30;
    const p = spot(w, f, 'coach');
    expect(op(w, f, { kind: 'build', what: 'coach', x: p.x, y: p.y }, p.x, p.y + 40).err).toBeNull();
    expect(w.coaches).toEqual([{ x: p.x, y: p.y }]);
    expect(new World(isl, JSON.parse(JSON.stringify(w.toSave()))).coaches).toEqual(w.coaches);
  });

  it('neue Aufgaben hinten dran, ältere Stände rechnen richtig um', () => {
    expect([questAt(27).stat, questAt(28).stat]).toEqual(['upgrades', 'beets']);
    expect(cleanProgress({ xp: 0, stats: {}, quests: 27, v: 5 }).quests).toBe(27);
    expect(cleanProgress({ xp: 0, stats: {}, quests: 28, v: 5 }).quests).toBe(30);
    // v4 mitten in den endlosen Aufgaben: beide Umrechnungen
    expect(cleanProgress({ xp: 0, stats: {}, quests: 25, v: 4 }).quests).toBe(30);
    expect(cleanProgress({ xp: 0, stats: {}, quests: 24, v: 4 }).quests).toBe(24);
  });
});
