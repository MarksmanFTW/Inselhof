import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, TIER_COINS, claimAchievements, cleanAchieved, tierOf } from '../src/achievements';
import { Farm } from '../src/farm';
import { generate } from '../src/island';
import { applyOp, link } from '../src/ops';
import { STAR_AT, STAR_REWARDS, claimStars, starParts, starScore, starsOf } from '../src/stars';
import { newClock } from '../src/time';
import { World } from '../src/world';

const isl = generate();
function setup() {
  const w = new World(isl);
  const f = new Farm(isl);
  link(w, f);
  w.clock = newClock(0);
  return { w, f };
}

describe('Insel-Sterne', () => {
  it('Punkte aus Häusern, Bewohnern, Deko … – höchstens fünf Sterne', () => {
    const { w, f } = setup();
    expect(starScore(w, f)).toBe(0);
    expect(starsOf(0)).toBe(0);
    const max = starParts(w, f).reduce((a, p) => a + p.max, 0);
    expect(max).toBeGreaterThanOrEqual(STAR_AT[4]);
    expect(starsOf(max)).toBe(5);
    w.houses.push({ x: 100, y: 100 }, { x: 140, y: 100, big: true });
    w.villagers.push({ id: 'hase', x: 200, y: 150, hearts: 0, wished: -1, gifted: -1 });
    expect(starScore(w, f)).toBe(6 * 2 + 4 + 5);
    expect(starsOf(starScore(w, f))).toBe(1);
  });

  it('jeder neue Stern wird einmal belohnt, Deko beim 3. und 5.', () => {
    const { w, f } = setup();
    for (let k = 0; k < 4; k++) w.houses.push({ x: 100 + k * 40, y: 100, big: k < 2 });
    for (const id of ['hase', 'fuchs', 'baer', 'katze', 'ente', 'schaf']) w.villagers.push({ id, x: 200, y: 150, hearts: 0, wished: -1, gifted: -1 });
    for (let k = 0; k < 10; k++) w.decos.push({ x: 50 + k * 10, y: 250, id: 'flowers' });
    // 32 + 30 + 20 = 82 Punkte → 3 Sterne
    expect(starsOf(starScore(w, f))).toBe(3);
    const coins = w.coins;
    expect(claimStars(w, f)).toEqual([1, 2, 3]);
    expect(w.coins - coins).toBe(STAR_REWARDS[0].coins + STAR_REWARDS[1].coins + STAR_REWARDS[2].coins);
    expect(w.decoInv.flowerarch).toBe(1);
    expect(w.album.deco).toContain('flowerarch');
    expect(claimStars(w, f)).toEqual([]);
    // weniger Punkte: Sterne bleiben belohnt, nichts doppelt
    w.decos = [];
    expect(claimStars(w, f)).toEqual([]);
    expect(w.starsClaimed).toBe(3);
    // gespeichert
    const again = new World(isl, JSON.parse(JSON.stringify(w.toSave())));
    expect(again.starsClaimed).toBe(3);
  });

  it('kommt über jede Aktion (auch im Koop gleich)', () => {
    const { w, f } = setup();
    for (let k = 0; k < 3; k++) w.houses.push({ x: 100 + k * 40, y: 100 });
    const r = applyOp(w, f, { a: { kind: 'tut' }, x: 0, y: 0, t: 1000 });
    expect(r.stars).toEqual([1]);
  });
});

describe('Erfolge', () => {
  it('Bronze, Silber, Gold – rückwirkend und nur einmal', () => {
    const { w, f } = setup();
    const felled = ACHIEVEMENTS.find((a) => a.id === 'felled')!;
    expect(tierOf(felled, 9)).toBe(0);
    expect(tierOf(felled, 50)).toBe(2);
    w.prog.stats.felled = 60;
    const coins = w.coins;
    const got = claimAchievements(w, f);
    expect(got).toEqual([
      { id: 'felled', tier: 1 },
      { id: 'felled', tier: 2 },
    ]);
    expect(w.coins - coins).toBe(TIER_COINS[0] + TIER_COINS[1]);
    expect(claimAchievements(w, f)).toEqual([]);
    w.prog.stats.felled = 200;
    expect(claimAchievements(w, f)).toEqual([{ id: 'felled', tier: 3 }]);
    const again = new World(isl, JSON.parse(JSON.stringify(w.toSave())));
    expect(again.achieved).toEqual({ felled: 3 });
    expect(cleanAchieved({ felled: 9, quatsch: 2, harvest: -1 })).toEqual({ felled: 3 });
  });

  it('jeder Erfolg hat drei steigende Ziele', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.goals[0]).toBeLessThan(a.goals[1]);
      expect(a.goals[1]).toBeLessThanOrEqual(a.goals[2]);
    }
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });
});
