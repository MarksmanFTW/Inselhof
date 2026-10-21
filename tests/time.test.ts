import { describe, expect, it } from 'vitest';
import { Farm } from '../src/farm';
import { generate } from '../src/island';
import { applyOp, link } from '../src/ops';
import { DAY_MS, newClock, timeOf } from '../src/time';
import { World } from '../src/world';

describe('Tag, Nacht, Essen, Möbel', () => {
  it('neue Insel beginnt um 7 Uhr an Tag 1, Nacht wird dunkel', () => {
    const now = 1_700_000_123_456;
    const c = newClock(now);
    const t = timeOf(c, now);
    expect(t.day).toBe(1);
    expect(t.label).toBe('07:00');
    expect(t.dark).toBe(0);
    expect(timeOf(c, now + (16 / 24) * DAY_MS).night).toBe(true); // 23 Uhr
    expect(timeOf(c, now + DAY_MS).day).toBe(2);
  });
  it('Schlafen springt zum Morgen, am Tag nur Nickerchen', () => {
    const isl = generate();
    const w = new World(isl);
    const f = new Farm(isl);
    link(w, f);
    const now = 1_700_000_000_000;
    w.clock = newClock(now);
    const late = now + (15 / 24) * DAY_MS; // 22 Uhr
    expect(applyOp(w, f, { a: { kind: 'sleep' }, x: 0, y: 0, t: late }).slept).toBe('night');
    const after = timeOf(w.clock, late);
    expect(after.label).toBe('06:00');
    expect(after.day).toBe(2);
    expect(applyOp(w, f, { a: { kind: 'sleep' }, x: 0, y: 0, t: late }).slept).toBe('nap');
  });
  it('Lagerfeuer bauen, kochen, essen; Möbel kosten Holz', () => {
    const isl = generate();
    const w = new World(isl);
    const f = new Farm(isl);
    link(w, f);
    w.wood = 30;
    f.turnips = 2;
    expect(applyOp(w, f, { a: { kind: 'cook' }, x: 176, y: 180, t: 1 }).err).toMatch(/Lagerfeuer/);
    expect(applyOp(w, f, { a: { kind: 'build', what: 'fire', x: 176, y: 172 }, x: 176, y: 186, t: 1 }).done).toBe(true);
    expect(w.fires).toHaveLength(1);
    expect(w.prog.stats.built ?? 0).toBe(0); // Feuer ist kein Haus
    expect(applyOp(w, f, { a: { kind: 'cook' }, x: 176, y: 182, t: 2 }).done).toBe(true);
    expect([f.turnips, f.meals]).toEqual([1, 1]);
    expect(applyOp(w, f, { a: { kind: 'eat', cooked: true }, x: 0, y: 0, t: 3 }).done).toBe(true);
    expect(f.meals).toBe(0);
    // Haus + Möbel
    let spot: [number, number] | null = null;
    for (let y = 120; y < 230 && !spot; y += 4) for (let x = 90; x < 250 && !spot; x += 4) if (w.canPlace(x, y)) spot = [x, y];
    applyOp(w, f, { a: { kind: 'build', x: spot![0], y: spot![1] }, x: 0, y: 0, t: 4 });
    const wood = w.wood;
    expect(applyOp(w, f, { a: { kind: 'furnish', house: 0, slot: 0, item: 'table' }, x: 0, y: 0, t: 5 }).done).toBe(true);
    expect(w.wood).toBe(wood - 4);
    expect(applyOp(w, f, { a: { kind: 'furnish', house: 0, slot: 0, item: 'chair' }, x: 0, y: 0, t: 6 }).err).toMatch(/schon/);
    expect(new World(isl, JSON.parse(JSON.stringify(w.toSave()))).houses[0].furn).toEqual({ 0: 'table' });
  });
});
