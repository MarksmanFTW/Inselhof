import { describe, expect, it } from 'vitest';
import { RECIPES, craftBlock, fullBag, newBag } from '../src/craft';
import { Farm } from '../src/farm';
import { FISH, fishById, rollFish } from '../src/fish';
import { generate } from '../src/island';
import { applyOp, link } from '../src/ops';
import { questAt } from '../src/progress';
import { ALBUM_TOTAL, SELL, albumCount } from '../src/shop';
import { DAY_MS, newClock } from '../src/time';
import { World } from '../src/world';

const isl = generate();
function setup() {
  const w = new World(isl);
  const f = new Farm(isl);
  link(w, f);
  return { w, f };
}
const op = (w: World, f: Farm, a: object, t = 1000) => applyOp(w, f, { a: a as never, x: 0, y: 0, t });
/** fester Zufall */
const seq = (seed: number) => {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};
const count = (o: { night: boolean; dock: boolean }, n = 20000) => {
  const r = seq(7);
  const c: Record<string, number> = {};
  for (let k = 0; k < n; k++) {
    const id = rollFish(r, o).id;
    c[id] = (c[id] ?? 0) + 1;
  }
  return c;
};

describe('Angeln', () => {
  it('Angel wird gebastelt (3 Stöcke, 1 Stein); alte Spielstände haben sie nicht geschenkt', () => {
    const rod = RECIPES.find((r) => r.id === 'rod')!;
    expect([rod.sticks, rod.stones, rod.wood]).toEqual([3, 1, 0]);
    expect(craftBlock({ ...newBag(), sticks: 3, stones: 1 }, 'rod', 0)).toBeNull();
    expect(fullBag().tools).not.toContain('rod');
  });

  it('häufige Fische oft, seltene selten; Mondfisch nur nachts, Schwertfisch fast nur am Steg', () => {
    const day = count({ night: false, dock: false });
    const night = count({ night: true, dock: false });
    const dock = count({ night: false, dock: true });
    expect(day.hering).toBeGreaterThan(day.lachs);
    expect(day.lachs).toBeGreaterThan(day.goldfisch ?? 0);
    expect(day.mondfisch).toBeUndefined();
    expect(night.mondfisch).toBeGreaterThan(200);
    expect(dock.schwertfisch).toBeGreaterThan((day.schwertfisch ?? 0) * 5);
    // alle Arten sind erreichbar
    for (const f of FISH) expect((day[f.id] ?? 0) + (night[f.id] ?? 0) + (dock[f.id] ?? 0)).toBeGreaterThan(0);
  });

  it('Fang kommt in den Vorrat und ins Album, zählt für die Aufgaben', () => {
    const { w, f } = setup();
    w.prog.quests = 11; // „Fang 3 Fische“
    expect(questAt(w.prog.quests).text).toBe('Fang 3 Fische');
    const a = op(w, f, { kind: 'fish', item: 'hering' });
    expect(a.caught).toEqual({ id: 'hering', first: true });
    expect(op(w, f, { kind: 'fish', item: 'hering' }).caught?.first).toBe(false);
    op(w, f, { kind: 'fish', item: 'goldfisch' });
    expect(w.fish).toEqual({ hering: 2, goldfisch: 1 });
    expect(w.album.fish).toEqual(['hering', 'goldfisch']);
    expect(w.prog.stats.species).toBe(2);
    expect(questAt(w.prog.quests).text).toBe('Bastle eine Sense');
    expect(op(w, f, { kind: 'fish', item: 'gibtsnicht' }).done).toBe(false);
    expect(albumCount(w.album)).toBe(2);
    expect(ALBUM_TOTAL).toBeGreaterThanOrEqual(FISH.length + 6);
    // bleibt beim Speichern erhalten
    const again = new World(isl, JSON.parse(JSON.stringify(w.toSave())));
    expect([again.fish, again.album.fish]).toEqual([w.fish, w.album.fish]);
  });

  it('braten am Lagerfeuer (nicht die seltenen), essen, verkaufen', () => {
    const { w, f } = setup();
    op(w, f, { kind: 'fish', item: 'goldfisch' });
    op(w, f, { kind: 'fish', item: 'makrele' });
    w.fires.push({ x: 100, y: 100 });
    const at = (a: object) => applyOp(w, f, { a: a as never, x: 100, y: 108, t: 1000 });
    expect(at({ kind: 'cook', item: 'fish' }).err).toBeNull();
    expect(w.grilled).toBe(1);
    expect(w.fish).toEqual({ goldfisch: 1 });
    expect(at({ kind: 'cook', item: 'fish' }).err).toMatch(/Kein Fisch/); // Goldfisch ist zu schade
    expect(w.prog.stats.cooked).toBe(1);
    expect(op(w, f, { kind: 'eat', item: 'grilled' }).err).toBeNull();
    expect(w.grilled).toBe(0);
    // Händler
    w.clock = newClock(0);
    const noon = (5 * DAY_MS) / 24;
    expect(op(w, f, { kind: 'sell', item: 'fish:goldfisch', n: 1 }, noon).coins).toBe(fishById('goldfisch')!.price);
    expect(w.fish).toEqual({});
    expect(op(w, f, { kind: 'sell', item: 'fish:goldfisch', n: 1 }, noon).err).toMatch(/So viel/);
    expect(SELL).not.toHaveProperty('fish');
  });

  it('Aufgabenliste v3 → v4: Angel-Aufgaben kommen dazu, keiner verliert seine Aufgabe', () => {
    const at = (quests: number, v: number) => questAt(new World(isl, { wood: 0, felled: {}, houses: [], prog: { xp: 0, stats: {}, quests, v } }).prog.quests).text;
    expect(at(9, 3)).toBe('Bau dein erstes Haus');
    expect(at(10, 3)).toBe('Bastle eine Sense');
    expect(at(19, 3)).toBe('Ernte 25 Rüben');
    expect(at(20, 3)).toBe('Bau ein zweites Haus');
    expect(at(21, 3)).toBe(at(24, 4));
    expect(at(10, 4)).toBe('Bastle eine Angel');
  });
});
