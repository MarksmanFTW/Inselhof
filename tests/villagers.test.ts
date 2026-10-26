import { describe, expect, it } from 'vitest';
import { Farm } from '../src/farm';
import { generate } from '../src/island';
import { applyOp, link } from '../src/ops';
import { cleanProgress, questAt } from '../src/progress';
import { storeGive, storeHas } from '../src/store';
import { DAY_MS, newClock } from '../src/time';
import { BEST_FRIEND_COINS, MAX_HEARTS, SURPRISE, VILLAGERS, fulfill, nextVillager, wishOf } from '../src/villagers';
import { World } from '../src/world';

const isl = generate();
function setup() {
  const w = new World(isl);
  const f = new Farm(isl);
  link(w, f);
  w.clock = newClock(0);
  return { w, f };
}
/** freien Bauplatz für ein Bewohnerhaus suchen */
function spot(w: World, f: Farm, skip = 0) {
  for (let y = 60; y < 300; y += 6)
    for (let x = 60; x < 600; x += 6)
      if (w.canPlace(x, y, undefined, 'hut') && skip-- <= 0) {
        void f;
        return { x, y };
      }
  throw new Error('kein Platz');
}
const build = (w: World, f: Farm, p: { x: number; y: number }) => applyOp(w, f, { a: { kind: 'build', what: 'hut', x: p.x, y: p.y }, x: p.x - 40, y: p.y + 30, t: 1000 });
/** Wunsch von Bewohner i heute erfüllen (Sachen werden vorher hingelegt) */
function grant(w: World, f: Farm, i: number, t: number) {
  const wish = wishOf(w, i, Math.floor(t / DAY_MS));
  storeGive(w, f, wish.item, wish.n);
  return applyOp(w, f, { a: { kind: 'wish', n: i, item: wish.item }, x: 0, y: 0, t });
}

describe('Bewohner', () => {
  it('pro Häuschen zieht der Nächste ein, nach sechs ist Schluss', () => {
    const { w, f } = setup();
    w.wood = 200;
    for (let k = 0; k < VILLAGERS.length; k++) {
      const r = build(w, f, spot(w, f));
      expect(r.err).toBeNull();
      expect(r.movedIn).toBe(VILLAGERS[k].id);
    }
    expect(w.villagers.map((v) => v.id)).toEqual(VILLAGERS.map((v) => v.id));
    expect(w.album.folk).toHaveLength(VILLAGERS.length);
    expect(nextVillager(w)).toBeNull();
    expect(build(w, f, spot(w, f)).err).toMatch(/schon eingezogen/);
    expect(w.wood).toBe(200 - 12 * VILLAGERS.length);
    expect(w.prog.stats.villagers).toBe(VILLAGERS.length);
    // Häuschen stehen im Weg
    const v = w.villagers[0];
    expect(w.blocked(v.x, v.y - 4, 2, 2)).toBe(true);
    expect(w.canPlace(v.x, v.y, undefined, 'house')).toBe(false);
  });

  it('Wunsch des Tages: auf jedem Gerät gleich, am nächsten Tag ein anderer', () => {
    const { w, f } = setup();
    w.wood = 50;
    build(w, f, spot(w, f));
    const a = wishOf(w, 0, 3);
    const other = new World(isl, JSON.parse(JSON.stringify(w.toSave())));
    expect(wishOf(other, 0, 3)).toEqual(a);
    const seen = new Set<string>();
    for (let d = 0; d < 40; d++) seen.add(JSON.stringify(wishOf(w, 0, d)));
    expect(seen.size).toBeGreaterThan(5);
    // am Anfang nur, was es schon gibt
    for (let d = 0; d < 40; d++) expect(['wood', 'apple', 'berry']).toContain(wishOf(w, 0, d).item);
  });

  it('erfüllen: Sachen weg, Münzen und Herzen, Lieblingssache doppelt, einmal am Tag', () => {
    const { w, f } = setup();
    w.wood = 50;
    build(w, f, spot(w, f));
    w.prog.stats.harvested = 1; // Rüben gibt es schon → Hoppel wünscht sich gern Rüben
    let fav = -1;
    for (let d = 0; d < 30 && fav < 0; d++) if (wishOf(w, 0, d).fav) fav = d;
    expect(fav).toBeGreaterThanOrEqual(0);
    const t = fav * DAY_MS + 1000;
    const wish = wishOf(w, 0, fav);
    expect(wish.item).toBe('turnip');
    expect(applyOp(w, f, { a: { kind: 'wish', n: 0, item: wish.item }, x: 0, y: 0, t }).err).toMatch(/zu wenig/);
    storeGive(w, f, 'turnip', wish.n);
    const coins = w.coins;
    const r = applyOp(w, f, { a: { kind: 'wish', n: 0, item: wish.item }, x: 0, y: 0, t });
    expect(r.err).toBeNull();
    expect(r.wish?.hearts).toBe(2);
    expect(w.villagers[0].hearts).toBe(2);
    expect(w.coins - coins).toBeGreaterThanOrEqual(wish.coins);
    expect(storeHas(w, f, 'turnip')).toBe(0);
    expect(grant(w, f, 0, t).err).toMatch(/schon gefreut/);
    expect(w.prog.stats.wishes).toBe(1);
    // anderer Wunsch angezeigt als jetzt gilt (Koop): lieber nichts tun
    expect(fulfill(w, f, 0, t + DAY_MS, 'stiefel').err).toMatch(/geändert/);
  });

  it('3 Herzen: Überraschung, ab 6: Tagesgeschenk, 10: beste Freunde', () => {
    const { w, f } = setup();
    w.wood = 50;
    build(w, f, spot(w, f));
    const seeds = f.seeds;
    let got3 = false;
    let got10 = false;
    let coins = 0;
    for (let d = 0; w.villagers[0].hearts < MAX_HEARTS; d++) {
      const t = d * DAY_MS + 500;
      // vor 6 Herzen gibt es kein Geschenk
      if (w.villagers[0].hearts < 6) expect(applyOp(w, f, { a: { kind: 'present', n: 0 }, x: 0, y: 0, t }).err).toMatch(/6 Herzen/);
      const before = w.coins;
      const r = grant(w, f, 0, t);
      expect(r.err).toBeNull();
      if (r.wish?.milestone === 3) {
        got3 = true;
        expect(f.seeds - seeds).toBeGreaterThanOrEqual(SURPRISE.seeds);
      }
      if (r.wish?.milestone === MAX_HEARTS) {
        got10 = true;
        coins = w.coins - before;
      }
    }
    expect(got3 && got10).toBe(true);
    expect(coins).toBeGreaterThanOrEqual(BEST_FRIEND_COINS);
    const t = 99 * DAY_MS;
    const turnips = f.turnips;
    expect(applyOp(w, f, { a: { kind: 'present', n: 0 }, x: 0, y: 0, t }).err).toBeNull();
    expect(f.turnips - turnips).toBe(VILLAGERS[0].presentN);
    expect(applyOp(w, f, { a: { kind: 'present', n: 0 }, x: 0, y: 0, t: t + 1000 }).err).toMatch(/schon ein Geschenk/);
    expect(applyOp(w, f, { a: { kind: 'present', n: 0 }, x: 0, y: 0, t: t + DAY_MS }).err).toBeNull();
  });

  it('bleibt beim Speichern erhalten, Unsinn im Spielstand fliegt raus', () => {
    const { w, f } = setup();
    w.wood = 50;
    build(w, f, spot(w, f));
    build(w, f, spot(w, f));
    grant(w, f, 1, 2000);
    const save = JSON.parse(JSON.stringify(w.toSave()));
    const again = new World(isl, save);
    expect(again.villagers).toEqual(w.villagers);
    expect(again.album.folk).toEqual(['hase', 'fuchs']);
    save.villagers.push({ id: 'drache', x: 1, y: 1 }, { id: 'hase', x: 5, y: 5 }, { id: 'katze' });
    save.villagers[0].hearts = 99;
    const odd = new World(isl, save);
    expect(odd.villagers.map((v) => v.id)).toEqual(['hase', 'fuchs']);
    expect(odd.villagers[0].hearts).toBe(MAX_HEARTS);
  });

  it('neue Aufgaben hinten an der Liste; wer schon weiter ist, behält seine Aufgabe', () => {
    expect(questAt(24).stat).toBe('villagers');
    expect(questAt(25).stat).toBe('wishes');
    expect(cleanProgress({ xp: 0, stats: {}, quests: 20, v: 4 }).quests).toBe(20);
    expect(cleanProgress({ xp: 0, stats: {}, quests: 24, v: 4 }).quests).toBe(24);
    expect(cleanProgress({ xp: 0, stats: {}, quests: 30, v: 4 }).quests).toBe(40);
    expect(cleanProgress({ xp: 0, stats: {}, quests: 30, v: 6 }).quests).toBe(35);
    expect(cleanProgress({ xp: 0, stats: {}, quests: 29, v: 6 }).quests).toBe(29);
    expect(cleanProgress({ xp: 0, stats: {}, quests: 35, v: 7 }).quests).toBe(35);
  });
});
