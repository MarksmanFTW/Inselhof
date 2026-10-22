import { describe, expect, it } from 'vitest';
import { Farm } from '../src/farm';
import { BREEDS, FOAL_GROW_MS, FOAL_HAY, MAX_LOVE, PADDOCK_COST, STABLE_COST, STABLE_SPACE, horsePose, isFoal, paddockArea, pasture } from '../src/horses';
import { HAY_DRY_MS, HAY_PER_TILE, MEADOW_REGROW_MS } from '../src/farm';
import { DAY_MS } from '../src/time';
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
    expect(applyOp(w, f, { a: { kind: 'feed', horse: 0, item: 'turnip' }, x: 0, y: 0, t: 10 }).err).toBeNull();
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

  it('Pflege: Heu, Leckerli, Bürsten je einmal am Tag', () => {
    const { w, f } = setup();
    f.turnips = 10;
    applyOp(w, f, { a: { kind: 'adopt', house: 0, item: 'haflinger', name: 'A' }, x: 0, y: 0, t: 1 });
    const op = (a: object, t: number) => applyOp(w, f, { a: a as never, x: 0, y: 0, t });
    expect(op({ kind: 'feed', horse: 0, item: 'hay' }, 2).err).toMatch(/Kein Heu/);
    f.hay = 3;
    expect(op({ kind: 'feed', horse: 0, item: 'hay' }, 2).err).toBeNull();
    expect(op({ kind: 'feed', horse: 0, item: 'hay' }, 3).err).toMatch(/satt/);
    expect(op({ kind: 'feed', horse: 0, item: 'turnip' }, 3).err).toBeNull();
    expect(op({ kind: 'brush', horse: 0 }, 4).err).toBeNull();
    expect(op({ kind: 'brush', horse: 0 }, 5).err).toMatch(/glänzt/);
    expect(w.horses[0].love).toBe(3);
    expect(f.hay).toBe(2);
    // nächster Inseltag: wieder möglich
    expect(op({ kind: 'brush', horse: 0 }, DAY_MS + 10).err).toBeNull();
    expect(w.prog.stats.cared).toBe(4);
  });

  it('Fohlen: zwei Pferde mit vollem Vertrauen und Heu', () => {
    const { w, f } = setup();
    f.turnips = 20;
    applyOp(w, f, { a: { kind: 'adopt', house: 0, item: 'haflinger', name: 'A' }, x: 0, y: 0, t: 1 });
    applyOp(w, f, { a: { kind: 'adopt', house: 0, item: 'noriker', name: 'B' }, x: 0, y: 0, t: 1 });
    w.horses[0].love = MAX_LOVE;
    f.hay = FOAL_HAY;
    expect(applyOp(w, f, { a: { kind: 'foal', horse: 0, name: 'Kleine' }, x: 0, y: 0, t: 100 }).err).toMatch(/zweites Pferd/);
    w.horses[1].love = MAX_LOVE;
    expect(applyOp(w, f, { a: { kind: 'foal', horse: 0, name: 'Kleine' }, x: 0, y: 0, t: 100 }).err).toBeNull();
    expect(f.hay).toBe(0);
    const foal = w.horses[2];
    expect(foal).toMatchObject({ breed: 'haflinger', name: 'Kleine', stable: 0, foal: 100 });
    expect(isFoal(foal, 100 + FOAL_GROW_MS - 1)).toBe(true);
    expect(isFoal(foal, 100 + FOAL_GROW_MS)).toBe(false);
    // gleich nochmal: Pause
    f.hay = FOAL_HAY;
    expect(w.foalBlock(0, 200, f.hay)).toMatch(/Pause/);
  });

  it('Koppel: Zaun sperrt, Tor ist offen, Pferde grasen drin', () => {
    const { w, f } = setup();
    const st = w.stables[0];
    let spot: [number, number] | null = null;
    for (let y = st.y + 50; y < st.y + 120 && !spot; y += 2) for (let x = st.x - 60; x < st.x + 60 && !spot; x += 2) if (w.canPlace(x, y, undefined, 'paddock')) spot = [x, y];
    if (!spot) for (let y = st.y - 120; y < st.y && !spot; y += 2) for (let x = st.x - 60; x < st.x + 60 && !spot; x += 2) if (w.canPlace(x, y, undefined, 'paddock')) spot = [x, y];
    expect(spot).not.toBeNull();
    w.wood = PADDOCK_COST;
    expect(applyOp(w, f, { a: { kind: 'build', x: spot![0], y: spot![1], what: 'paddock' }, x: 0, y: 0, t: 1 }).err).toBeNull();
    const pd = w.paddocks[0];
    expect(w.blocked(pd.x - 20, pd.y, 3, 1)).toBe(true); // Zaun vorn
    expect(w.blocked(pd.x, pd.y, 3, 1)).toBe(false); // Tor
    expect(w.blocked(pd.x, pd.y - 20, 3, 1)).toBe(false); // innen Wiese
    expect(w.paddockOf(0)).toBe(pd);
    f.turnips = 5;
    applyOp(w, f, { a: { kind: 'adopt', house: 0, item: 'haflinger', name: 'A' }, x: 0, y: 0, t: 1 });
    const free = pasture(isl, (x, y) => w.blocked(x, y, 6, 2));
    const ar = paddockArea(pd);
    for (let t = 5e8; t < 5e8 + 60_000; t += 900) {
      const p = horsePose(w.horses[0], 0, st, t, free, false, pd);
      expect(p.x).toBeGreaterThanOrEqual(ar.x0 - 0.01);
      expect(p.x).toBeLessThanOrEqual(ar.x1 + 0.01);
      expect(p.y).toBeGreaterThanOrEqual(ar.y0 - 0.01);
      expect(p.y).toBeLessThanOrEqual(ar.y1 + 0.01);
    }
  });

  it('Heu: mähen, trocknen lassen, einsammeln, Wiese wächst nach', () => {
    const { w, f } = setup();
    let tile: [number, number] | null = null;
    for (let r = 10; r < 40 && !tile; r++) for (let c = 10; c < 40 && !tile; c++) if (!f.mow(c, r, true, 0)) tile = [c, r];
    expect(tile).not.toBeNull();
    f.meadow.clear();
    const op = (kind: string, t: number) => applyOp(w, f, { a: { kind, c: tile![0], r: tile![1] } as never, x: 0, y: 0, t });
    expect(op('mow', 1000).err).toBeNull();
    expect(op('mow', 1000).err).toMatch(/schon gemäht/);
    expect(f.mown(...tile!, 1000)).toBe('fresh');
    expect(op('rake', 1000).done).toBe(false);
    expect(op('rake', 1000 + HAY_DRY_MS).hay).toBe(HAY_PER_TILE);
    expect(f.hay).toBe(HAY_PER_TILE);
    expect(f.mown(...tile!, 1000 + HAY_DRY_MS)).toBe('stubble');
    const again = new Farm(isl, JSON.parse(JSON.stringify(f.toSave())));
    expect(again.hay).toBe(HAY_PER_TILE);
    expect(again.mown(...tile!, 0)).toBe('stubble');
    f.update(1000 + HAY_DRY_MS + MEADOW_REGROW_MS);
    expect(f.mown(...tile!, 0)).toBeNull();
    expect(w.prog.stats.mowed).toBe(1);
  });
});
