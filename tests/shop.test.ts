import { describe, expect, it } from 'vitest';
import { Farm } from '../src/farm';
import { STABLE_COST } from '../src/horses';
import { generate } from '../src/island';
import { applyOp, link } from '../src/ops';
import { ALBUM_REWARDS, DECO, SELL, boatOut, horseOffers, merchantHere } from '../src/shop';
import { DAY_MS, newClock } from '../src/time';
import { World } from '../src/world';

const isl = generate();
const HOUR = DAY_MS / 24;
function setup() {
  const w = new World(isl);
  const f = new Farm(isl);
  link(w, f);
  // Uhr: 7 Uhr morgens bei t=0
  w.clock = newClock(0);
  return { w, f, noon: 5 * HOUR };
}
const op = (w: World, f: Farm, a: object, t: number) => applyOp(w, f, { a: a as never, x: 0, y: 0, t });

describe('Händler-Boot & Album', () => {
  it('Boot kommt um 8 und fährt um 18 Uhr', () => {
    const c = newClock(0);
    expect(merchantHere(c, 0)).toBe(false); // 7:00
    expect(boatOut(c, 0)).toBeNull();
    expect(boatOut(c, 1.25 * HOUR)).toBeCloseTo(0.5); // 8:15 fährt ein
    expect(merchantHere(c, 2 * HOUR)).toBe(true); // 9:00
    expect(merchantHere(c, 11.6 * HOUR)).toBe(false); // 18:36
    expect(merchantHere(null, 0)).toBe(false);
  });

  it('verkaufen bringt Münzen, kaufen kostet', () => {
    const { w, f, noon } = setup();
    expect(op(w, f, { kind: 'sell', item: 'turnip', n: 1 }, 0).err).toMatch(/nicht da/);
    f.turnips = 5;
    w.wood = 10;
    expect(op(w, f, { kind: 'sell', item: 'turnip', n: 6 }, noon).err).toMatch(/So viel/);
    expect(op(w, f, { kind: 'sell', item: 'turnip', n: 5 }, noon).coins).toBe(5 * SELL.turnip);
    op(w, f, { kind: 'sell', item: 'wood', n: 10 }, noon);
    expect(w.coins).toBe(5 * SELL.turnip + 10 * SELL.wood);
    expect(f.turnips).toBe(0);
    const seeds = f.seeds;
    expect(op(w, f, { kind: 'buy', item: 'seeds' }, noon).err).toBeNull();
    expect(f.seeds).toBe(seeds + 5);
    expect(op(w, f, { kind: 'buy', item: 'deco:well' }, noon).err).toMatch(/Münzen/);
  });

  it('Deko kaufen, ins Album, aufstellen', () => {
    const { w, f, noon } = setup();
    w.coins = 100;
    expect(op(w, f, { kind: 'buy', item: 'deco:lantern' }, noon).err).toBeNull();
    expect(w.decoInv.lantern).toBe(1);
    expect(w.album.deco).toEqual(['lantern']);
    let spot: [number, number] | null = null;
    for (let y = 120; y < 230 && !spot; y += 4) for (let x = 90; x < 250 && !spot; x += 4) if (w.canPlace(x, y, undefined, 'deco')) spot = [x, y];
    expect(op(w, f, { kind: 'build', what: 'deco', item: 'lantern', x: spot![0], y: spot![1] }, noon).err).toBeNull();
    expect(w.decos).toHaveLength(1);
    expect(w.decoInv.lantern).toBeUndefined();
    expect(op(w, f, { kind: 'build', what: 'deco', item: 'lantern', x: spot![0] + 30, y: spot![1] }, noon).err).toMatch(/nicht/);
    expect(w.blocked(spot![0], spot![1], 3, 1)).toBe(true);
    const again = new World(isl, JSON.parse(JSON.stringify(w.toSave())));
    expect(again.decos).toEqual(w.decos);
    expect(again.coins).toBe(w.coins);
    expect(again.album).toEqual(w.album);
  });

  it('seltene Pferde nur beim Boot, Einhorn erst für Sammler', () => {
    const { w, f, noon } = setup();
    const day = Math.floor((noon + w.clock!.offset) / DAY_MS);
    const offer = horseOffers(day, 0)[0];
    expect(horseOffers(day, 0)).not.toContain('einhorn');
    expect(horseOffers(day, 12)).toContain('einhorn');
    w.coins = 500;
    expect(op(w, f, { kind: 'buy', item: `horse:${offer}`, name: 'X' }, noon).err).toMatch(/Pferdestall/);
    // im Stall gibt es die seltenen nicht
    expect(op(w, f, { kind: 'adopt', house: 0, item: offer }, noon).err).toBeTruthy();
    let spot: [number, number] | null = null;
    for (let y = 120; y < 230 && !spot; y += 4) for (let x = 90; x < 250 && !spot; x += 4) if (w.canPlace(x, y, undefined, 'stable')) spot = [x, y];
    w.wood = STABLE_COST;
    op(w, f, { kind: 'build', what: 'stable', x: spot![0], y: spot![1] }, noon);
    expect(op(w, f, { kind: 'buy', item: 'horse:einhorn', name: 'Luna' }, noon).err).toMatch(/nicht dabei/);
    expect(op(w, f, { kind: 'buy', item: `horse:${offer}`, name: 'Sternchen' }, noon).err).toBeNull();
    expect(w.horses[0]).toMatchObject({ breed: offer, name: 'Sternchen', stable: 0 });
    expect(w.album.horses).toContain(offer);
  });

  it('Album-Belohnungen werden einmal ausgezahlt', () => {
    const { w, f, noon } = setup();
    w.coins = 1000;
    for (const d of DECO.slice(0, 5)) op(w, f, { kind: 'buy', item: `deco:${d.id}` }, noon);
    const spent = DECO.slice(0, 5).reduce((s, d) => s + d.price, 0);
    expect(w.albumClaimed).toBe(1);
    expect(w.coins).toBe(1000 - spent + ALBUM_REWARDS[0].coins);
    op(w, f, { kind: 'buy', item: 'deco:flowers' }, noon);
    expect(w.albumClaimed).toBe(1);
  });
});
