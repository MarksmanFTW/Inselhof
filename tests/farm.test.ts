import { describe, expect, it } from 'vitest';
import { CAN_GOAL, CAPACITY, DRY_MS, Farm, GROW_MS, RIPE, START_SEEDS, START_TURNIPS } from '../src/farm';
import { generate } from '../src/island';

describe('Ackerbau', () => {
  const isl = generate();
  // Wiesen-Kachel mitten auf der Insel
  const [c, r] = Farm.tileAt(176, 172);

  it('Hacken, säen, gießen, wachsen, ernten', () => {
    const f = new Farm(isl);
    expect(f.seeds).toBe(START_SEEDS);
    f.seeds = 6;
    expect(f.plant(c, r)).toMatch(/Hacke/);
    expect(f.till(c, r, true)).toBeNull();
    expect(f.till(c, r, true)).not.toBeNull();
    expect(f.plant(c, r)).toBeNull();
    expect(f.seeds).toBe(5);
    let now = 1000;
    for (let s = 0; s < RIPE; s++) {
      expect(f.pour(c, r, now)).toBeNull();
      expect(f.pour(c, r, now)).toMatch(/Schon/);
      f.update(now + GROW_MS - 1);
      expect(f.plot(c, r)!.crop!.stage).toBe(s);
      now += GROW_MS;
      f.update(now);
      expect(f.plot(c, r)!.crop!.stage).toBe(s + 1);
    }
    // ohne Gießen wächst nichts – ist aber reif
    expect(f.harvest(c, r, () => 0.9)).toEqual({ seeds: 1, gotCan: false });
    expect(f.turnips).toBe(START_TURNIPS + 1);
    expect(f.plot(c, r)!.crop).toBeUndefined();
  });

  it('Kübel wird leer, am Wasser voll; nach 5 Ernten gibt es die Eisen-Gießkanne', () => {
    const f = new Farm(isl);
    for (let i = 0; i < 6; i++) f.till(c + i - 2, r, true);
    let n = 0;
    for (let i = 0; i < 6; i++) if (!f.pour(c + i - 2, r, 0)) n++;
    expect(n).toBe(CAPACITY.bucket);
    expect(f.pour(c + 3, r, 0)).toMatch(/Leer/);
    f.refill();
    expect(f.water).toBe(CAPACITY.bucket);
    // ausgetrocknet
    f.update(DRY_MS + 1);
    expect(f.plot(c - 2, r)!.wetAt).toBe(0);
    // Ernten bis zur Kanne
    let got = false;
    for (let k = 0; k < CAN_GOAL; k++) {
      const p = f.plot(c - 2, r)!;
      p.crop = { stage: RIPE };
      got = f.harvest(c - 2, r)!.gotCan || got;
    }
    expect(got).toBe(true);
    expect(f.hasCan).toBe(true);
    expect(f.water).toBe(CAPACITY.can);
    // Speichern & Laden
    const g = new Farm(isl, JSON.parse(JSON.stringify(f.toSave())));
    expect(g.hasCan).toBe(true);
    expect(g.plots.size).toBe(6);
    expect(g.harvested).toBe(CAN_GOAL);
  });

  it('nur auf Wiese hacken', () => {
    const f = new Farm(isl);
    expect(f.till(1, 1, true)).not.toBeNull(); // Wasser
    expect(f.till(c, r, false)).not.toBeNull(); // etwas im Weg
  });
});
