import { describe, expect, it } from 'vitest';
import { ALL_TOOLS, PICK_REGROW_MS, RECIPES } from '../src/craft';
import { Farm } from '../src/farm';
import { EAST_X, Ground, W, generate } from '../src/island';
import { applyOp, link } from '../src/ops';
import { TUTORIAL, levelOf, questAt, xpFor } from '../src/progress';
import { World } from '../src/world';

const isl = generate();
const trees = isl.decor.map((d, i) => [d.kind, i] as const).filter(([k]) => k === 'tree').map(([, i]) => i);
/** Stöcke/Steine auf der Start-Insel (Nummern) */
const near = (kind: 'stick' | 'stone') => isl.pickups.map((p, i) => [p, i] as const).filter(([p]) => p.kind === kind && p.x < EAST_X).map(([, i]) => i);
function fresh() {
  const w = new World(isl);
  const f = new Farm(isl);
  link(w, f);
  return { w, f };
}
const op = (w: World, f: Farm, a: object, t = 1) => applyOp(w, f, { a: a as never, x: 0, y: 0, t });

describe('Fortschritt', () => {
  it('Stufen-Schwellen', () => {
    expect(levelOf(0)).toBe(1);
    expect(levelOf(xpFor(2))).toBe(2);
    expect(levelOf(xpFor(5) - 1)).toBe(4);
    expect(questAt(100).goal).toBeGreaterThan(questAt(20).goal);
  });

  it('Stöcke liegen auf der Wiese, Steine am Strand – genug auf der Start-Insel', () => {
    for (const p of isl.pickups) expect(isl.ground[p.y * W + p.x]).toBe(p.kind === 'stick' ? Ground.Grass : Ground.Sand);
    expect(near('stick').length).toBeGreaterThanOrEqual(6);
    expect(near('stone').length).toBeGreaterThanOrEqual(5);
    // immer gleich (Spielstände merken sich die Nummern)
    expect(generate().pickups).toEqual(isl.pickups);
  });

  it('Tutorial: ohne alles starten, sammeln, basteln, 3 Samen bekommen', () => {
    const { w, f } = fresh();
    expect(w.tools.size).toBe(0);
    expect(f.seeds).toBe(0);
    expect(f.turnips).toBe(0);
    expect(questAt(w.prog.quests).stat).toBe('sticks');
    // ohne Axt kein Baum
    expect(op(w, f, { kind: 'axe', tree: trees[0] }).err).toMatch(/Axt/);
    expect(op(w, f, { kind: 'craft', item: 'axe' }).err).toMatch(/fehlt/);
    const sticks = near('stick');
    for (let k = 0; k < 4; k++) expect(op(w, f, { kind: 'pick', tree: sticks[k] }).picked).toBe('stick');
    expect(op(w, f, { kind: 'pick', tree: sticks[0] }).done).toBe(false); // schon weg
    expect(w.prog.quests).toBe(1);
    for (const i of near('stone').slice(0, 3)) op(w, f, { kind: 'pick', tree: i });
    expect(w.prog.quests).toBe(2);
    expect([w.sticks, w.stones]).toEqual([4, 3]);
    expect(op(w, f, { kind: 'craft', item: 'axe' }).crafted).toBe('axe');
    expect(op(w, f, { kind: 'craft', item: 'axe' }).err).toMatch(/schon/);
    const res = op(w, f, { kind: 'craft', item: 'hoe' });
    expect(res.gain?.quests[0].text).toMatch(/Axt und eine Hacke/);
    expect(w.prog.quests).toBe(TUTORIAL);
    expect(f.seeds).toBe(3);
    expect(w.level).toBe(1); // genau die 3 Samen, kein Aufstieg dazwischen
    expect([w.sticks, w.stones]).toEqual([0, 0]);
    expect(questAt(w.prog.quests).text).toMatch(/ersten Baum/);
    // Kübel braucht Holz
    expect(op(w, f, { kind: 'water', c: 22, r: 21 }).err).toMatch(/Holzkübel/);
    op(w, f, { kind: 'axe', tree: trees[0], fell: true });
    expect(w.wood).toBe(4);
    expect(op(w, f, { kind: 'craft', item: 'water' }).err).toBeNull();
    expect(w.tools.has('water')).toBe(true);
    // bleibt beim Speichern erhalten (und gilt nicht als alter Spielstand)
    const again = new World(isl, JSON.parse(JSON.stringify(w.toSave())));
    expect([...again.tools].sort()).toEqual(['axe', 'hoe', 'water']);
    expect(again.prog.quests).toBe(w.prog.quests);
  });

  it('aufgehobene Stöcke liegen nach einer Weile wieder da, nicht unter Häusern', () => {
    const { w, f } = fresh();
    const i = near('stick')[0];
    op(w, f, { kind: 'pick', tree: i }, 1000);
    expect(w.pickable(i)).toBe(false);
    w.grow(1000 + PICK_REGROW_MS - 1);
    expect(w.pickable(i)).toBe(false);
    w.grow(1000 + PICK_REGROW_MS);
    expect(w.pickable(i)).toBe(true);
    const p = isl.pickups[i];
    w.houses.push({ x: p.x, y: p.y + 4 });
    expect(w.pickable(i)).toBe(false);
  });

  it('alte Spielstände (vor dem Tutorial) behalten Werkzeuge und ihre Aufgabe', () => {
    // war bei „Gieße 5-mal“ (alte Nr. 3)
    const old = new World(isl, { wood: 3, felled: {}, houses: [], prog: { xp: 40, stats: { watered: 2 }, quests: 3 } });
    expect([...old.tools].sort()).toEqual([...ALL_TOOLS].sort());
    expect(questAt(old.prog.quests).text).toBe('Gieße 5-mal');
    // ganz alter Stand ohne Aufgaben: Tutorial überspringen
    expect(questAt(new World(isl, { wood: 0, felled: {}, houses: [] }).prog.quests).text).toMatch(/ersten Baum/);
    // nach der Liste: gleiche Endlos-Aufgabe wie vorher
    expect(questAt(new World(isl, { wood: 0, felled: {}, houses: [], prog: { xp: 0, stats: {}, quests: 13 } }).prog.quests).text).toBe('Sammle 80 Holz');
    // neue Aufgabe „Bau einen Pferdestall“ zählt den vorhandenen Stall
    const st = new World(isl, { wood: 0, felled: {}, houses: [], stables: [{ x: 100, y: 100 }], prog: { xp: 0, stats: { harvested: 30, felled: 9 }, quests: 8 } });
    const f = new Farm(isl, { seeds: 5 });
    link(st, f);
    expect(questAt(st.prog.quests).text).toBe('Fäll 8 Bäume');
    applyOp(st, f, { a: { kind: 'axe', tree: trees[0], fell: true }, x: 0, y: 0, t: 1 });
    expect(questAt(st.prog.quests).text).toBe('Nimm dein erstes Pferd auf');
    // einmal umgerechnet, bleibt es dabei
    expect(new World(isl, JSON.parse(JSON.stringify(old.toSave()))).prog.quests).toBe(old.prog.quests);
  });

  it('Rezepte kosten, was dransteht', () => {
    const { w, f } = fresh();
    w.sticks = 10;
    w.stones = 10;
    w.wood = 10;
    for (const r of RECIPES) {
      const before = [w.sticks, w.stones, w.wood];
      expect(op(w, f, { kind: 'craft', item: r.id }).err).toBeNull();
      expect([before[0] - w.sticks, before[1] - w.stones, before[2] - w.wood]).toEqual([r.sticks, r.stones, r.wood]);
    }
    expect(w.tools.size).toBe(ALL_TOOLS.length);
  });

  it('Stufe 2 macht das Fällen schneller', () => {
    const { w, f } = fresh();
    w.tools = new Set(ALL_TOOLS);
    w.prog.xp = xpFor(2);
    expect(w.level).toBe(2);
    let hits = 0;
    let res;
    do {
      res = op(w, f, { kind: 'axe', tree: trees[1] }, 2);
      hits++;
    } while (!res.felled && hits < 10);
    expect(hits).toBe(4);
  });
});
