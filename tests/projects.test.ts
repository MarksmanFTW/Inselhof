import { describe, expect, it } from 'vitest';
import { Farm, GROW_MS } from '../src/farm';
import { generate } from '../src/island';
import { applyOp, link } from '../src/ops';
import { FEST_COINS, PROJECTS, pickSite, projProgress, siteOf } from '../src/projects';
import { DAY_MS, newClock } from '../src/time';
import { World } from '../src/world';

const isl = generate();
function setup() {
  const w = new World(isl);
  const f = new Farm(isl);
  link(w, f);
  return { w, f };
}
const op = (w: World, f: Farm, a: object, t = 1000) => applyOp(w, f, { a: a as never, x: 0, y: 0, t });
/** alles für Projekt k in den Vorrat legen (Stöcke/Steine zählt der Rucksack selbst) */
function stock(w: World, f: Farm, k: number) {
  const need = PROJECTS[k].need;
  w.wood += need.wood ?? 0;
  f.turnips += need.turnip ?? 0;
  w.apples += need.apple ?? 0;
  w.berries += need.berry ?? 0;
  f.hay += need.hay ?? 0;
  f.meals += need.meal ?? 0;
  w.grilled += need.grilled ?? 0;
  w.coins += need.coins ?? 0;
  if (need.fish) w.fish.hering = (w.fish.hering ?? 0) + need.fish;
}
const finish = (w: World, f: Farm, k: number) => {
  stock(w, f, k);
  let res;
  for (const [item, n] of Object.entries(PROJECTS[k].need)) res = op(w, f, { kind: 'donate', item, n });
  return res!;
};

describe('Insel-Projekte', () => {
  it('jeder Bauplatz ist auf einer frischen Insel frei, keiner überschneidet sich', () => {
    const { w, f } = setup();
    const sites = PROJECTS.map((_, k) => pickSite(w, f, k));
    PROJECTS.forEach((p, k) => expect(sites[k]).toEqual(p.sites[0]));
    for (let a = 0; a < sites.length; a++) for (let b = a + 1; b < sites.length; b++) expect(Math.hypot(sites[a][0] - sites[b][0], sites[a][1] - sites[b][1])).toBeGreaterThan(30);
  });

  it('abgeben: Vorrat wird weniger, zu viel wird gekappt, fertig → nächstes Projekt', () => {
    const { w, f } = setup();
    w.wood = 20;
    const r = op(w, f, { kind: 'donate', item: 'wood', n: 50 });
    expect(r.donated).toEqual({ item: 'wood', n: 12 });
    expect(w.wood).toBe(8);
    expect(op(w, f, { kind: 'donate', item: 'wood', n: 1 }).err).toMatch(/nicht mehr/);
    expect(op(w, f, { kind: 'donate', item: 'apple', n: 1 }).err).toMatch(/nicht mehr/); // braucht der Brunnen gar nicht
    expect(w.proj.sites[0]).toEqual(PROJECTS[0].sites[0]);
    // Steine/Stöcke kommen aus dem Rucksack – die Insel zieht nichts ab
    op(w, f, { kind: 'donate', item: 'stones', n: 8 });
    expect(projProgress(w.proj)).toBeCloseTo(20 / 24);
    const done = op(w, f, { kind: 'donate', item: 'sticks', n: 4 });
    expect(done.finished).toBe('well');
    expect(w.proj.n).toBe(1);
    expect(w.proj.got).toEqual({});
    expect(w.proj.sites[1]).toEqual(PROJECTS[1].sites[0]);
    expect(w.prog.stats.projects).toBe(1);
    // fertige Projekte stehen im Weg
    const [x, y] = w.proj.sites[0]!;
    expect(w.blocked(x, y - 3, 2, 2)).toBe(true);
    expect(w.canPlace(x, y)).toBe(false);
    // bleibt beim Speichern erhalten
    const again = new World(isl, JSON.parse(JSON.stringify(w.toSave())));
    expect(again.proj).toEqual(w.proj);
  });

  it('zu wenig im Vorrat: nichts passiert', () => {
    const { w, f } = setup();
    w.wood = 3;
    expect(op(w, f, { kind: 'donate', item: 'wood', n: 5 }).err).toMatch(/Zu wenig Holz/);
    expect(w.wood).toBe(3);
    expect(w.proj.got).toEqual({});
  });

  it('Belohnungen: Markt verkauft rund um die Uhr, Gewächshaus lässt schneller wachsen, Fest gibt Münzen', () => {
    const { w, f } = setup();
    w.clock = newClock(0);
    const night = (14 * DAY_MS) / 24; // 21 Uhr – Boot ist weg
    f.turnips = 3;
    expect(op(w, f, { kind: 'sell', item: 'turnip', n: 1 }, night).err).toMatch(/Boot/);
    finish(w, f, 0);
    expect(finish(w, f, 1).finished).toBe('market');
    expect(op(w, f, { kind: 'sell', item: 'turnip', n: 1 }, night).err).toBeNull();
    expect(op(w, f, { kind: 'buy', item: 'seeds' }, night).err).toMatch(/Boot/); // kaufen nur beim Boot
    const before = w.perks.growMul;
    expect(finish(w, f, 2).finished).toBe('greenhouse');
    expect(w.perks.growMul).toBeCloseTo(before * 0.75);
    // Rübe wächst schneller
    f.till(22, 21, true);
    f.seeds = 1;
    f.plant(22, 21);
    f.pour(22, 21, 1000);
    f.update(1000 + GROW_MS * 0.76);
    expect(f.plot(22, 21)?.crop?.stage).toBe(1);
    expect(finish(w, f, 3).finished).toBe('lighthouse');
    const coins = w.coins;
    expect(finish(w, f, 4).finished).toBe('pavilion');
    // stock() legt die Münzen fürs Projekt dazu, abgegeben werden sie wieder – übrig bleibt die Fest-Belohnung
    expect(w.coins - coins).toBe(FEST_COINS);
    expect(w.proj.n).toBe(PROJECTS.length);
    expect(op(w, f, { kind: 'donate', item: 'wood', n: 1 }).err).toMatch(/Alle Projekte/);
    expect(projProgress(w.proj)).toBe(1);
  });

  it('Bauplatz belegt (Haus steht da): nächster freier Platz', () => {
    const { w, f } = setup();
    const [x, y] = PROJECTS[0].sites[0];
    w.houses.push({ x, y });
    const s = siteOf(w, f, 0);
    expect(s).not.toEqual([x, y]);
    expect(w.canPlaceFoot(s[0], s[1], PROJECTS[0].foot)).toBe(true);
    // Feld im Weg
    const g = setup();
    const [c, r] = Farm.tileAt(PROJECTS[0].sites[0][0], PROJECTS[0].sites[0][1] - 2);
    g.f.till(c, r, true);
    expect(pickSite(g.w, g.f, 0)).not.toEqual(PROJECTS[0].sites[0]);
    // gleiche Wahl auf jedem Gerät
    expect(pickSite(g.w, g.f, 0)).toEqual(pickSite(g.w, g.f, 0));
  });
});
