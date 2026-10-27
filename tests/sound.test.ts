import { describe, expect, it } from 'vitest';
import { SR, VARIANTS, drum, makeSfx, note, seaLoop, type Inst, type Sfx } from '../src/sound/dsp';
import { SONGS, melodyMap, parseChord, songEighths, stepEvents } from '../src/sound/songs';

const ok = (b: Float32Array) => {
  let peak = 0;
  let bad = 0;
  for (const x of b) {
    if (!Number.isFinite(x)) bad++;
    peak = Math.max(peak, Math.abs(x));
  }
  expect(bad).toBe(0);
  return peak;
};

describe('Musikstücke', () => {
  it('jeder Takt der Melodie passt genau, Akkorde sind lesbar', () => {
    for (const s of SONGS) {
      const bars = s.melody.split('|').map((b) => b.trim().split(/\s+/).filter(Boolean).reduce((a, t) => a + Number(t.split('/')[1]), 0));
      expect(bars, s.id).toHaveLength(s.chords.length);
      for (const n of bars) expect(n, s.id).toBe(s.beats * 2);
      for (const c of s.chords) expect(parseChord(c).tones.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('jedes Achtel ergibt gültige Töne, nicht zu laut', () => {
    for (const s of SONGS) {
      const mel = melodyMap(s);
      let notes = 0;
      for (let st = 0; st < songEighths(s); st++) {
        const ev = stepEvents(s, mel, st, st % 2, { rnd: Math.random, rain: false, winter: true });
        const sum = ev.reduce((a, e) => a + e.gain, 0);
        expect(sum, `${s.id} ${st}`).toBeLessThan(1.6);
        for (const e of ev) {
          if (e.inst) expect(e.midi! >= 24 && e.midi! <= 96, `${s.id} ${e.midi}`).toBe(true);
          notes++;
        }
      }
      expect(notes).toBeGreaterThan(songEighths(s) / 2);
    }
  });
});

describe('Klänge', () => {
  it('Geräusche sind sauber (keine Fehlwerte, nicht übersteuert) und schnell berechnet', () => {
    const t0 = performance.now();
    const names: Sfx[] = ['chop', 'fell', 'hoe', 'seed', 'water', 'refill', 'splash', 'harvest', 'pick', 'build', 'coin', 'click', 'open', 'nope', 'quest', 'level', 'eat', 'cook', 'stepGrass', 'stepSand', 'stepWood', 'hoof', 'nicker', 'neigh', 'whistle', 'brush', 'mow', 'door', 'sleep', 'bubble', 'gull', 'bird', 'dove', 'frog', 'owl'];
    for (const n of names)
      for (let v = 0; v < (VARIANTS[n] ?? 1); v++) {
        const b = makeSfx(n, v);
        expect(b.length, n).toBeGreaterThan(SR * 0.05);
        const peak = ok(b);
        expect(peak, n).toBeGreaterThan(0.05);
        expect(peak, n).toBeLessThanOrEqual(1);
      }
    expect(performance.now() - t0).toBeLessThan(4000);
  }, 20000);
  it('Instrumente und Schlagzeug', () => {
    for (const i of ['kalimba', 'marimba', 'musicbox', 'epiano', 'pluck', 'bass', 'ocarina', 'pad', 'bells'] as Inst[]) expect(ok(note(i, 60, 0.5))).toBeLessThanOrEqual(1);
    for (const d of ['shaker', 'kick', 'clave', 'brush', 'jingle'] as const) expect(ok(drum(d))).toBeLessThanOrEqual(1);
    expect(ok(seaLoop(4))).toBeLessThanOrEqual(1);
  });
});
