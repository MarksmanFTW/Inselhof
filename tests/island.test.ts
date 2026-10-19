import { describe, expect, it } from 'vitest';
import { generate, landInfo, W, H } from '../src/island';

describe('Insel', () => {
  const isl = generate();
  it('ist eine zusammenhängende, kleine Insel mitten im Meer', () => {
    const { land, main } = landInfo(isl);
    expect(land / (W * H)).toBeGreaterThan(0.25);
    expect(land / (W * H)).toBeLessThan(0.6);
    expect(main).toBe(land);
    for (let x = 0; x < W; x += 16) {
      expect(isl.ground[x]).toBe(0);
      expect(isl.ground[(H - 1) * W + x]).toBe(0);
    }
  });
  it('hat Obstbäume, Palmen, Büsche, Steine, Gras und Fundstücke', () => {
    const count = (k: string) => isl.decor.filter((d) => d.kind === k).length;
    expect(count('tree')).toBe(3);
    expect(count('palm')).toBe(3);
    expect(count('bush')).toBeGreaterThanOrEqual(4);
    expect(count('grass')).toBeGreaterThan(20);
    expect(isl.details.some((d) => d.kind === 'bone')).toBe(true);
    // alles steht auf Land
    for (const d of isl.decor) expect(isl.ground[d.y * W + d.x]).toBeGreaterThan(0);
  });
  it('ist immer gleich', () => {
    expect(generate().decor).toEqual(isl.decor);
  });
});
