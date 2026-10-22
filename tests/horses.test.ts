import { describe, expect, it } from 'vitest';
import { Farm } from '../src/farm';
import { BREEDS, STABLE_COST, STABLE_SPACE, horsePose, pasture } from '../src/horses';
import { generate } from '../src/island';
import { applyOp, link } from '../src/ops';
import { xpFor } from '../src/progress';
import { World } from '../src/world';

const isl = generate();
function setup() {
  const w = new World(isl);
  const f = new Farm(isl);
  link(w, f);
  let spot: [number, number] | null = null;
  for (let y = 120; y < 230 && !spot; y += 4) for (let x = 90; x < 250 && !spot; x += 4) if (w.canPlace(x, y, undefined, 'stable')) spot = [x, y];
  expect(spot).not.toBeNull();
  w.wood = STABLE_COST;
  const res = applyOp(w, f, { a: { kind: 'build', x: spot![0], y: spot![1], what: 'stable' }, x: 0, y: 0, t: 1 });
  expect(res.err).toBeNull();
  return { w, f };
}

describe('Pferde & Stall', () => {
  it('alle Rassen sind eindeutig und haben Namen', () => {
    expect(BREEDS.length).toBeGreaterThanOrEqual(15);
    expect(new Set(BREEDS.map((b) => b.id)).size).toBe(BREEDS.length);
    for (const b of BREEDS) expect(b.names.length).toBeGreaterThan(0);
  });

  it('Stall kostet Holz, zählt nicht als Haus', () => {
    const { w } = setup();
    expect(w.stables).toHaveLength(1);
    expect(w.wood).toBe(0);
    expect(w.prog.stats.built ?? 0).toBe(0);
    // Stall versperrt den Weg
    expect(w.blocked(w.stables[0].x, w.stables[0].y - 4, 3, 1)).toBe(true);
  });

  it('Pferd aufnehmen kostet Rüben, Stufe und Platz zählen', () => {
    const { w, f } = setup();
    const t = 5;
    f.turnips = 2;
    expect(applyOp(w, f, { a: { kind: 'adopt', house: 0, item: 'haflinger', name: 'Goldi' }, x: 0, y: 0, t }).err).toBe('Zu wenig Rüben');
    f.turnips = 50;
    expect(applyOp(w, f, { a: { kind: 'adopt', house: 0, item: 'friese', name: 'Nero' }, x: 0, y: 0, t }).err).toMatch(/Stufe 4/);
    const res = applyOp(w, f, { a: { kind: 'adopt', house: 0, item: 'haflinger', name: '  Goldi<b>  ' }, x: 0, y: 0, t });
    expect(res.err).toBeNull();
    expect(f.turnips).toBe(46);
    expect(w.horses[0]).toMatchObject({ breed: 'haflinger', name: 'Goldib', stable: 0, love: 0 });
    expect(w.prog.stats.adopted).toBe(1);
    w.prog.xp = xpFor(5);
    for (let i = 1; i < STABLE_SPACE; i++) expect(applyOp(w, f, { a: { kind: 'adopt', house: 0, item: 'clydesdale', name: '' }, x: 0, y: 0, t }).err).toBeNull();
    expect(w.horses[1].name).toBe('Hamish');
    expect(applyOp(w, f, { a: { kind: 'adopt', house: 0, item: 'shetland', name: 'X' }, x: 0, y: 0, t }).err).toMatch(/voll/);
  });

  it('Füttern gibt Vertrauen, alles bleibt beim Speichern erhalten', () => {
    const { w, f } = setup();
    f.turnips = 5;
    applyOp(w, f, { a: { kind: 'adopt', house: 0, item: 'shetland', name: 'Krümel' }, x: 0, y: 0, t: 9 });
    expect(applyOp(w, f, { a: { kind: 'feed', horse: 0 }, x: 0, y: 0, t: 10 }).err).toBeNull();
    expect(f.turnips).toBe(1);
    expect(w.horses[0].love).toBe(1);
    const again = new World(isl, JSON.parse(JSON.stringify(w.toSave())));
    expect(again.stables).toHaveLength(1);
    expect(again.horses).toEqual(w.horses);
    // alter Spielstand ohne Ställe
    const old = new World(isl, { wood: 3, felled: {}, houses: [] });
    expect(old.horses).toEqual([]);
    expect(old.toSave().horses).toBeUndefined();
  });

  it('Pferde grasen vor ihrem Stall – auf beiden Geräten gleich', () => {
    const { w, f } = setup();
    f.turnips = 5;
    applyOp(w, f, { a: { kind: 'adopt', house: 0, item: 'haflinger', name: 'A' }, x: 0, y: 0, t: 123456 });
    const st = w.stables[0];
    const free = pasture(isl, (x, y) => w.blocked(x, y, 6, 2));
    for (let t = 1e9; t < 1e9 + 120_000; t += 1700) {
      const p = horsePose(w.horses[0], 0, st, t, free);
      expect(p).toEqual(horsePose(w.horses[0], 0, st, t, free));
      expect(Math.abs(p.x - st.x)).toBeLessThanOrEqual(40);
      expect(p.y).toBeGreaterThan(st.y);
      expect(p.y).toBeLessThan(st.y + 40);
    }
    // nachts stehen sie beim Stall
    const n = horsePose(w.horses[0], 0, st, 1e9 + 33_333, free, true);
    expect(n.moving).toBe(false);
    expect(Math.abs(n.y - st.y)).toBeLessThan(15);
  });
});
