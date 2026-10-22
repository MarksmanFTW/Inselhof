import { describe, expect, it } from 'vitest';
import { generate, landInfo, W, H, EAST_X } from '../src/island';
import v1 from './fixtures/decor-v1.json';

describe('Insel', () => {
  const isl = generate();
  it('ist eine zusammenhängende Insel mitten im Meer', () => {
    const { land, main } = landInfo(isl);
    expect(land / (W * H)).toBeGreaterThan(0.25);
    expect(land / (W * H)).toBeLessThan(0.7);
    expect(main).toBe(land);
    for (let x = 0; x < W; x += 8) {
      expect(isl.ground[x]).toBe(0);
      expect(isl.ground[(H - 1) * W + x]).toBe(0);
    }
  });
  it('alte Bäume, Steine & Steg sind unverändert (alte Spielstände passen)', () => {
    expect(isl.decor.slice(0, v1.decor.length)).toEqual(v1.decor);
    expect(isl.dock).toEqual(v1.dock);
  });
  it('Ostland hat Wald, Palmen, Büsche, Steine und Gras', () => {
    const east = isl.decor.slice(v1.decor.length);
    const count = (k: string) => east.filter((d) => d.kind === k).length;
    expect(count('tree')).toBeGreaterThanOrEqual(10);
    expect(count('palm')).toBeGreaterThanOrEqual(4);
    expect(count('bush')).toBeGreaterThanOrEqual(6);
    expect(count('grass')).toBeGreaterThan(14);
    for (const d of east) expect(d.x).toBeGreaterThanOrEqual(EAST_X);
    for (const d of isl.decor) expect(isl.ground[d.y * W + d.x]).toBeGreaterThan(0);
    expect(isl.details.some((d) => d.kind === 'bone')).toBe(true);
  });
  it('ist doppelt so groß wie früher', () => {
    const { land } = landInfo(isl);
    // alte Insel: rund 49 000 Land-Pixel
    expect(land).toBeGreaterThan(2 * 49_000);
  });
  it('ist immer gleich', () => {
    expect(generate().decor).toEqual(isl.decor);
  });
});
