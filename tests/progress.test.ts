import { describe, expect, it } from 'vitest';
import { Farm } from '../src/farm';
import { generate } from '../src/island';
import { applyOp, link } from '../src/ops';
import { levelOf, questAt, xpFor } from '../src/progress';
import { World } from '../src/world';

describe('Fortschritt', () => {
  it('Stufen-Schwellen', () => {
    expect(levelOf(0)).toBe(1);
    expect(levelOf(xpFor(2))).toBe(2);
    expect(levelOf(xpFor(5) - 1)).toBe(4);
    expect(questAt(100).goal).toBeGreaterThan(questAt(20).goal);
  });
  it('erste Aufgabe, Stufe 2 macht das Fällen schneller', () => {
    const isl = generate();
    const w = new World(isl);
    const f = new Farm(isl);
    link(w, f);
    const trees = isl.decor.map((d, i) => [d.kind, i] as const).filter(([k]) => k === 'tree').map(([, i]) => i);
    let res = applyOp(w, f, { a: { kind: 'axe', tree: trees[0], fell: true }, x: 0, y: 0, t: 1 });
    expect(res.gain?.quests[0].text).toMatch(/ersten Baum/);
    expect(f.seeds).toBe(6 + 2);
    expect(w.prog.quests).toBe(1);
    // genug XP für Stufe 2
    w.prog.xp = xpFor(2);
    expect(w.level).toBe(2);
    let hits = 0;
    do {
      res = applyOp(w, f, { a: { kind: 'axe', tree: trees[1] }, x: 0, y: 0, t: 2 });
      hits++;
    } while (!res.felled && hits < 10);
    expect(hits).toBe(4);
    // bleibt beim Speichern erhalten
    expect(new World(isl, JSON.parse(JSON.stringify(w.toSave()))).prog.quests).toBe(w.prog.quests);
  });
});
