import { describe, expect, it } from 'vitest';
import { generate } from '../src/island';
import { HOUSE_COST, REGROW_MS, World } from '../src/world';

describe('Holz & Häuser', () => {
  const isl = generate();
  const treeIdx = isl.decor.findIndex((d) => d.kind === 'tree');
  const palmIdx = isl.decor.findIndex((d) => d.kind === 'palm');

  it('Baum fällt nach 5 Schlägen und gibt Holz', () => {
    const w = new World(isl);
    const t = isl.decor[treeIdx];
    expect(w.target(t.x, t.y + 8)).toBe(treeIdx);
    for (let i = 0; i < 4; i++) expect(w.chop(treeIdx, 0).felled).toBe(false);
    expect(w.chop(treeIdx, 0)).toMatchObject({ felled: true, wood: 4 });
    expect(w.wood).toBe(4);
    expect(w.target(t.x, t.y + 8)).not.toBe(treeIdx);
    // Palme: 3 Schläge, 2 Holz
    for (let i = 0; i < 3; i++) w.chop(palmIdx, 0);
    expect(w.wood).toBe(6);
  });

  it('Baum wächst nach, Stand bleibt beim Speichern erhalten', () => {
    const w = new World(isl);
    for (let i = 0; i < 5; i++) w.chop(treeIdx, 1000);
    expect(w.stage(treeIdx, 1000)).toBe('stump');
    expect(w.stage(treeIdx, 1000 + 70_000)).toBe('sapling');
    const again = new World(isl, JSON.parse(JSON.stringify(w.toSave())));
    expect(again.wood).toBe(4);
    expect(again.stage(treeIdx, 1000)).toBe('stump');
    again.grow(1000 + REGROW_MS + 1);
    expect(again.stage(treeIdx)).toBe('tree');
  });

  it('Haus nur mit genug Holz und auf freiem Land', () => {
    const w = new World(isl);
    // freie Stelle auf der Wiese suchen
    let spot: [number, number] | null = null;
    for (let y = 120; y < 230 && !spot; y += 4) for (let x = 90; x < 250 && !spot; x += 4) if (w.canPlace(x, y)) spot = [x, y];
    expect(spot).not.toBeNull();
    expect(w.canPlace(10, 10)).toBe(false); // Wasser
    expect(w.build(spot![0], spot![1])).toBe(false); // kein Holz
    w.wood = HOUSE_COST + 1;
    expect(w.build(spot![0], spot![1])).toBe(true);
    expect(w.wood).toBe(1);
    expect(w.blocked(spot![0], spot![1] - 4, 3, 1)).toBe(true);
    expect(w.canPlace(spot![0], spot![1])).toBe(false); // schon belegt
  });
});
