import { describe, expect, it } from 'vitest';
import { Farm } from '../src/farm';
import { STABLE_COST } from '../src/horses';
import { generate } from '../src/island';
import { applyOp, link } from '../src/ops';
import { SELL } from '../src/shop';
import { DAY_MS, newClock } from '../src/time';
import { FRUIT, FRUIT_MS, World, berryBush } from '../src/world';

const isl = generate();
const trees = isl.decor.map((d, i) => [d, i] as const).filter(([d]) => d.kind === 'tree').map(([, i]) => i);
const berries = isl.decor.map((d, i) => [d, i] as const).filter(([d]) => berryBush(d)).map(([, i]) => i);
const plain = isl.decor.findIndex((d) => d.kind === 'bush' && !berryBush(d));
function setup() {
  const w = new World(isl);
  const f = new Farm(isl);
  link(w, f);
  return { w, f };
}
const op = (w: World, f: Farm, a: object, t = 1000) => applyOp(w, f, { a: a as never, x: 0, y: 0, t });

describe('Obst', () => {
  it('jeder Obstbaum trägt Äpfel, Beerenbüsche Beeren – auch auf der Start-Insel', () => {
    const { w } = setup();
    expect(trees.length).toBeGreaterThan(3);
    expect(berries.length).toBeGreaterThanOrEqual(2);
    for (const i of [...trees, ...berries]) expect(w.hasFruit(i)).toBe(true);
    expect(w.hasFruit(plain)).toBe(false);
    // neben dem Baum stehend findet man ihn
    const d = isl.decor[trees[0]];
    expect(w.fruitTarget(d.x + 6, d.y + 3)).toBe(trees[0]);
  });

  it('schütteln gibt Obst, danach ist der Baum leer, später wächst es nach', () => {
    const { w, f } = setup();
    const res = op(w, f, { kind: 'shake', tree: trees[0] }, 1000);
    expect(res.fruit).toEqual({ apples: FRUIT.tree, berries: 0 });
    expect(w.apples).toBe(FRUIT.tree);
    expect(op(w, f, { kind: 'shake', tree: trees[0] }, 1001).done).toBe(false);
    expect(op(w, f, { kind: 'shake', tree: berries[0] }, 1002).fruit).toEqual({ apples: 0, berries: FRUIT.bush });
    w.grow(1000 + FRUIT_MS - 1);
    expect(w.hasFruit(trees[0], 1000 + FRUIT_MS - 1)).toBe(false);
    w.grow(1000 + FRUIT_MS);
    expect(w.hasFruit(trees[0], 1000 + FRUIT_MS)).toBe(true);
    expect(w.shaken.has(trees[0])).toBe(false);
    // gefällte Bäume tragen nichts
    w.fell(trees[1], 2000);
    expect(w.hasFruit(trees[1], 2000)).toBe(false);
    // bleibt beim Speichern erhalten
    const again = new World(isl, JSON.parse(JSON.stringify(w.toSave())));
    expect([again.apples, again.berries, again.hasFruit(berries[0], 1500)]).toEqual([w.apples, w.berries, false]);
  });

  it('essen, dem Pferd als Leckerli geben, verkaufen', () => {
    const { w, f } = setup();
    op(w, f, { kind: 'shake', tree: trees[0] });
    op(w, f, { kind: 'shake', tree: berries[0] });
    expect(op(w, f, { kind: 'eat', item: 'apple' }).err).toBeNull();
    expect(op(w, f, { kind: 'eat', item: 'berry' }).err).toBeNull();
    expect([w.apples, w.berries]).toEqual([FRUIT.tree - 1, FRUIT.bush - 1]);
    // Pferd mag Äpfel
    let spot: [number, number] | null = null;
    for (let y = 120; y < 230 && !spot; y += 4) for (let x = 90; x < 250 && !spot; x += 4) if (w.canPlace(x, y, undefined, 'stable')) spot = [x, y];
    w.wood = STABLE_COST;
    op(w, f, { kind: 'build', x: spot![0], y: spot![1], what: 'stable' });
    w.horses.push({ breed: 'haflinger', name: 'Fanny', stable: 0, t: 0, love: 0 });
    expect(op(w, f, { kind: 'feed', horse: 0, item: 'apple' }).err).toBeNull();
    expect(w.horses[0].love).toBe(1);
    expect(w.apples).toBe(FRUIT.tree - 2);
    // Händler kauft Obst (mittags ist er da)
    w.clock = newClock(0);
    const noon = (5 * DAY_MS) / 24;
    const coins = w.coins;
    expect(op(w, f, { kind: 'sell', item: 'berry', n: 2 }, noon).err).toBeNull();
    expect(w.coins - coins).toBe(2 * SELL.berry);
    expect(op(w, f, { kind: 'eat', item: 'berry' }).err).toBeNull();
    expect(op(w, f, { kind: 'eat', item: 'berry' }).err).toMatch(/Keine Beeren/);
  });
});
