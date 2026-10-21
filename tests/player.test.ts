import { describe, expect, it } from 'vitest';
import { generate } from '../src/island';
import { Player, SPEED } from '../src/player';

describe('Spielfigur', () => {
  const isl = generate();
  it('startet auf freiem Boden und läuft', () => {
    const p = new Player(isl, 176, 172);
    expect(p.free(p.x, p.y)).toBe(true);
    for (let i = 0; i < 30; i++) p.update(1, 0, 1 / 30);
    expect(p.x).toBeGreaterThan(176 + SPEED * 0.9);
    expect(p.dir).toBe(2); // rechts
  });
  it('bleibt am Ufer stehen', () => {
    const p = new Player(isl, 176, 172);
    for (let i = 0; i < 600; i++) p.update(-1, 0, 1 / 30);
    expect(p.x).toBeGreaterThan(30);
    expect(p.free(p.x, p.y)).toBe(true);
  });
  it('kommt nicht durch Baumstämme, darf aber auf den Steg', () => {
    const p = new Player(isl, 227, 140);
    for (let i = 0; i < 90; i++) p.update(0, -1, 1 / 30);
    expect(p.y).toBeGreaterThan(122);
    const d = isl.dock;
    expect(p.free(d.x + d.w / 2, d.y + 20)).toBe(true);
    expect(p.free(d.x - 6, d.y + 30)).toBe(false);
  });
});
