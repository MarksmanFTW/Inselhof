import { describe, expect, it } from 'vitest';
import { BEACH_PER_DAY, BOTTLE, LETTERS, SHELLS, beachSpots, beachToday } from '../src/beach';
import { CALENDAR, cleanDaily, dailyDone, dailyIndex, weeklyDeco } from '../src/daily';
import { Farm } from '../src/farm';
import { festFinds, festSpots } from '../src/fest';
import { generate } from '../src/island';
import { applyOp, link } from '../src/ops';
import { FESTS, dayKey, festAt, seasonAt } from '../src/season';
import { ALBUM_TOTAL, albumCount } from '../src/shop';
import { DAY_MS, newClock, timeOf } from '../src/time';
import { World } from '../src/world';

const isl = generate();
function setup() {
  const w = new World(isl);
  const f = new Farm(isl);
  link(w, f);
  w.clock = newClock(0);
  return { w, f };
}
const op = (w: World, f: Farm, a: object, t = 1000) => applyOp(w, f, { a: a as never, x: 0, y: 0, t });

describe('Jahreszeiten und Feste', () => {
  it('Jahreszeit und Fest nach Datum', () => {
    const d = (s: string) => new Date(`${s}T12:00:00`);
    expect(seasonAt(d('2026-04-02'))).toBe('spring');
    expect(seasonAt(d('2026-07-20'))).toBe('summer');
    expect(seasonAt(d('2026-10-26'))).toBe('autumn');
    expect(seasonAt(d('2027-01-05'))).toBe('winter');
    expect(festAt(d('2026-10-26'))?.id).toBe('halloween');
    expect(festAt(d('2026-11-02'))?.id).toBe('halloween');
    expect(festAt(d('2026-11-03'))).toBeNull();
    expect(festAt(d('2026-12-24'))?.id).toBe('winter');
    expect(festAt(d('2026-06-01'))).toBeNull();
    expect(dayKey(d('2026-03-07'))).toBe('2026-03-07');
  });

  it('Fundstücke: jeden Tag woanders, auf jedem Gerät gleich, einmal aufheben', () => {
    const { w, f } = setup();
    expect(festSpots(isl).length).toBeGreaterThan(30);
    const a = festFinds(isl, 'halloween', 3);
    expect(a).toHaveLength(FESTS[0].find.perDay);
    expect(festFinds(isl, 'halloween', 3)).toEqual(a);
    expect(festFinds(isl, 'halloween', 4)).not.toEqual(a);
    expect(op(w, f, { kind: 'festfind', item: 'halloween', n: 0 }).err).toBeNull();
    expect(op(w, f, { kind: 'festfind', item: 'halloween', n: 0 }).err).toMatch(/Schon/);
    expect(w.fest.coins.halloween).toBe(1);
    // nächster Inseltag: wieder alles da
    expect(op(w, f, { kind: 'festfind', item: 'halloween', n: 0 }, 1000 + DAY_MS).err).toBeNull();
    expect(w.fest.coins.halloween).toBe(2);
    expect(op(w, f, { kind: 'festfind', item: 'ostern', n: 0 }).err).toMatch(/kein Fest/);
  });

  it('Süßes oder Saures nur nachts, je Bewohner einmal; Festladen', () => {
    const { w, f } = setup();
    w.villagers.push({ id: 'hase', x: 200, y: 150, hearts: 0, wished: -1, gifted: -1 });
    // Zeitpunkte nach der Insel-Uhr suchen
    let night = 0;
    while (!timeOf(w.clock!, night).night) night += 5000;
    let noon = 0;
    while (Math.abs(timeOf(w.clock!, noon).hour - 12) > 0.5) noon += 5000;
    expect(op(w, f, { kind: 'festvisit', item: 'halloween', arg: 'hase' }, noon).err).toMatch(/dunkel/);
    expect(op(w, f, { kind: 'festvisit', item: 'halloween', arg: 'hase' }, night).err).toBeNull();
    expect(op(w, f, { kind: 'festvisit', item: 'halloween', arg: 'hase' }, night + 1000).err).toMatch(/schon da/);
    expect(op(w, f, { kind: 'festvisit', item: 'halloween', arg: 'fuchs' }, night).err).toMatch(/gibt es nicht/);
    // Winterfest: auch tagsüber
    expect(op(w, f, { kind: 'festvisit', item: 'winter', arg: 'hase' }, noon + DAY_MS).err).toBeNull();
    expect(w.fest.coins).toEqual({ halloween: 2, winter: 2 });
    // kaufen
    expect(op(w, f, { kind: 'festbuy', item: 'halloween', arg: 'witch' }).err).toMatch(/Zu wenig Bonbons/);
    w.fest.coins.halloween = 30;
    expect(op(w, f, { kind: 'festbuy', item: 'halloween', arg: 'jackolantern' }).err).toBeNull();
    const hat = op(w, f, { kind: 'festbuy', item: 'halloween', arg: 'witch' });
    expect(hat.festItem).toEqual({ id: 'witch', kind: 'hat' });
    expect(w.fest.coins.halloween).toBe(0);
    expect(w.decoInv).toEqual({ jackolantern: 1 });
    expect(w.album.deco).toEqual(['jackolantern', 'witch']);
    // beim Händler gibt es Fest-Deko nicht für Münzen
    w.coins = 999;
    expect(w.buyDeco('jackolantern')).toMatch(/Gibt es nicht/);
    // gespeichert
    const again = new World(isl, JSON.parse(JSON.stringify(w.toSave())));
    expect(again.fest.coins).toEqual({ winter: 2 });
    expect(again.fest.visits).toEqual(w.fest.visits);
  });
});

describe('Strandgut und Flaschenpost', () => {
  it('jeden Tag Schätze und eine Flaschenpost, auf jedem Gerät gleich', () => {
    expect(beachSpots(isl).length).toBeGreaterThan(20);
    const a = beachToday(isl, 7);
    expect(a).toHaveLength(BEACH_PER_DAY + 1);
    expect(a[BOTTLE].id).toBe('bottle');
    expect(beachToday(isl, 7)).toEqual(a);
    expect(beachToday(isl, 8)).not.toEqual(a);
    const seen = new Set<string>();
    for (let d = 0; d < 300; d++) for (const x of beachToday(isl, d)) seen.add(x.id);
    for (const s of SHELLS) expect(seen.has(s.id)).toBe(true);
  });

  it('aufheben: Schatz ins Album, Treibholz wird Holz, Flaschenpost mit Brief und Geschenk', () => {
    const { w, f } = setup();
    const t = 7 * DAY_MS + 500;
    const today = beachToday(isl, 7);
    for (let i = 0; i < BEACH_PER_DAY; i++) expect(op(w, f, { kind: 'beach', n: i }, t).err).toBeNull();
    const shells = today.slice(0, BEACH_PER_DAY).filter((x) => x.id !== 'treibholz');
    expect(Object.values(w.treasures).reduce((a, b) => a + b, 0)).toBe(shells.length);
    expect(w.album.sea?.length).toBe(new Set(shells.map((x) => x.id)).size);
    const coins = w.coins;
    const r = op(w, f, { kind: 'beach', n: BOTTLE }, t);
    expect(r.beach?.id).toBe('bottle');
    expect(r.beach?.letter).toBe(0);
    expect(LETTERS[r.beach!.letter!].text.length).toBeGreaterThan(10);
    expect(w.coins + f.seeds + w.wood).toBeGreaterThan(coins);
    expect(op(w, f, { kind: 'beach', n: BOTTLE }, t).err).toMatch(/Schon/);
    expect(w.prog.stats.letters).toBe(1);
    // verkaufen (Boot ist mittags da)
    const id = Object.keys(w.treasures)[0];
    if (id) {
      const noon = 7 * DAY_MS + (5 * DAY_MS) / 24;
      expect(op(w, f, { kind: 'sell', item: `sea:${id}`, n: 1 }, noon).err).toBeNull();
    }
    expect(albumCount(w.album)).toBeLessThanOrEqual(ALBUM_TOTAL);
  });
});

describe('Tagesgeschenk', () => {
  it('7-Tage-Kalender, ohne Strafe; Deko am 7. Tag wechselt jede Woche', () => {
    const d = cleanDaily(undefined);
    expect(dailyDone(d, '2026-10-26')).toBe(false);
    expect(dailyIndex(d)).toBe(0);
    d.total = 6;
    expect(CALENDAR[dailyIndex(d)].deco).toBe(true);
    const deco1 = weeklyDeco(d);
    d.total = 13;
    expect(weeklyDeco(d)).not.toBe(deco1);
    d.last = '2026-10-26';
    expect(dailyDone(d, '2026-10-26')).toBe(true);
    expect(cleanDaily({ last: 5 as never, total: -3 })).toEqual({ last: '', total: 0 });
  });

  it('Geschenk landet auf der Insel', () => {
    const { w, f } = setup();
    op(w, f, { kind: 'daily', n: 0 });
    op(w, f, { kind: 'daily', n: 4 });
    op(w, f, { kind: 'daily', n: 6, arg: 'bench' });
    expect([w.coins, w.dishes.apfelkuchen, w.decoInv.bench]).toEqual([15 + 40, 1, 1]);
    expect(op(w, f, { kind: 'daily', n: 9 }).err).toBeTruthy();
  });
});
