import { describe, expect, it } from 'vitest';
import { generate, landInfo, W, H } from '../src/island';

describe('Insel', () => {
  const isl = generate();
  it('ist eine zusammenhängende, kleine Insel mitten im Meer', () => {
    const { land, main } = landInfo(isl);
    expect(land / (W * H)).toBeGreaterThan(0.15);
    expect(land / (W * H)).toBeLessThan(0.45);
    // fast alles Land hängt zusammen (kleine Felsinselchen erlaubt)
    expect(main / land).toBeGreaterThan(0.95);
    // Rand ist Meer
    for (let x = 0; x < W; x += 16) {
      expect(isl.ground[x]).toBe(0);
      expect(isl.ground[(H - 1) * W + x]).toBe(0);
    }
  });
  it('hat Bäume, Palmen, Büsche, Steine und Details', () => {
    const count = (k: string) => isl.decor.filter((d) => d.kind === k).length;
    expect(count('oak')).toBeGreaterThan(8);
    expect(count('palm')).toBeGreaterThan(5);
    expect(count('bush')).toBeGreaterThan(5);
    expect(count('rock')).toBeGreaterThan(3);
    expect(isl.details.length).toBeGreaterThan(500);
  });
  it('ist immer gleich', () => {
    const b = generate();
    expect(b.decor).toEqual(isl.decor);
  });
});
