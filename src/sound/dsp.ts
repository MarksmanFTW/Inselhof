/**
 * Klang-Baukasten ohne Dateien: Instrumente (Kalimba, Marimba, Spieluhr, E-Piano,
 * gezupfte Gitarre, Bass, Okarina, Fläche), Geräusche (Holz, Erde, Wasser, Gras …)
 * und Umgebung (Wellen, Vögel, Grillen, Regen) werden einmal als Klangdaten
 * berechnet und dann nur noch abgespielt. Reine Rechnung (läuft auch in Tests).
 */

/** Abtastrate der berechneten Klänge (der Browser rechnet beim Abspielen um) */
export const SR = 32000;
const TAU = Math.PI * 2;

/** fester Zufall (gleicher Klang bei gleichem Startwert) */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
export const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);
const len = (sec: number) => Math.max(1, Math.round(sec * SR));

/** Filter (Tiefpass, Hochpass, Bandpass) nach dem bekannten RBJ-Kochbuch */
export class BQ {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  constructor(
    private type: 'lp' | 'hp' | 'bp',
    f: number,
    q = 0.707,
  ) {
    this.set(f, q);
  }
  set(f: number, q = 0.707) {
    const w = (TAU * Math.min(Math.max(f, 10), SR * 0.45)) / SR;
    const cs = Math.cos(w);
    const al = Math.sin(w) / (2 * q);
    const a0 = 1 + al;
    let b0: number, b1: number, b2: number;
    if (this.type === 'lp') [b0, b1, b2] = [(1 - cs) / 2, 1 - cs, (1 - cs) / 2];
    else if (this.type === 'hp') [b0, b1, b2] = [(1 + cs) / 2, -(1 + cs), (1 + cs) / 2];
    else [b0, b1, b2] = [al, 0, -al];
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = (-2 * cs) / a0;
    this.a2 = (1 - al) / a0;
  }
  run(x: number) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** Hüllkurve: Anstieg a, dann exponentiell abklingend (Zeitkonstante d) */
const ad = (t: number, a: number, d: number) => (t < a ? t / a : Math.exp(-(t - a) / d));
/** Lautstärke angleichen (Spitze = peak) */
export function norm(b: Float32Array, peak = 0.9) {
  let m = 0;
  for (let i = 0; i < b.length; i++) m = Math.max(m, Math.abs(b[i]));
  if (m > 0) for (let i = 0; i < b.length; i++) b[i] *= peak / m;
  return b;
}
/** sanft ausblenden (keine Knackser am Ende) */
function tail(b: Float32Array, sec = 0.02) {
  const n = Math.min(b.length, len(sec));
  for (let i = 0; i < n; i++) b[b.length - 1 - i] *= i / n;
  return b;
}
/** b in out mischen ab Zeitpunkt at (Sekunden) */
function mix(out: Float32Array, b: Float32Array, at = 0, gain = 1) {
  const o = len(at);
  for (let i = 0; i < b.length && o + i < out.length; i++) out[o + i] += b[i] * gain;
  return out;
}

/** gedämpfte Schwingungen (Holz, Metall, Klangstäbe): [Frequenz, Lautstärke, Abklingzeit] */
export function modal(dur: number, parts: [number, number, number][], attack = 0.002) {
  const n = len(dur);
  const out = new Float32Array(n);
  const na = Math.max(1, len(attack));
  for (const [f, a, d] of parts) {
    if (f >= SR / 2) continue;
    // gedämpfter Sinus a·rⁿ·sin(wn) als Rekursion (schnell): s[n] = 2r·cos(w)·s[n-1] − r²·s[n-2]
    const w = (TAU * f) / SR;
    const r = Math.exp(-1 / (d * SR));
    const c1 = 2 * r * Math.cos(w);
    const c2 = r * r;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < n; i++) {
      const y = i === 0 ? 0 : i === 1 ? a * r * Math.sin(w) : c1 * y1 - c2 * y2;
      y2 = y1;
      y1 = y;
      out[i] += (i < na ? i / na : 1) * y;
    }
  }
  return tail(out);
}
/** gefiltertes Rauschen mit Hüllkurve; f darf sich über die Zeit ändern */
export function noise(dur: number, o: { type?: 'lp' | 'hp' | 'bp'; f?: number | ((t: number) => number); q?: number; a?: number; d?: number; seed?: number; env?: (t: number) => number }) {
  const n = len(dur);
  const out = new Float32Array(n);
  const r = rng(o.seed ?? 7);
  const fAt = typeof o.f === 'function' ? o.f : () => (o.f as number) ?? 2000;
  const flt = new BQ(o.type ?? 'bp', fAt(0), o.q ?? 1);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if (typeof o.f === 'function' && i % 32 === 0) flt.set(fAt(t), o.q ?? 1);
    const e = o.env ? o.env(t) : ad(t, o.a ?? 0.002, o.d ?? 0.05);
    out[i] = flt.run(r() * 2 - 1) * e;
  }
  return tail(out);
}
/** Sinus mit gleitender Tonhöhe (Blubb, Plopp, Zirpen) */
export function glide(dur: number, f0: number, f1: number, o: { a?: number; d?: number; curve?: number; h2?: number; env?: (t: number) => number } = {}) {
  const n = len(dur);
  const out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const k = Math.pow(t / dur, o.curve ?? 1);
    const f = f0 * Math.pow(f1 / f0, k);
    ph += (TAU * f) / SR;
    const e = o.env ? o.env(t) : ad(t, o.a ?? 0.003, o.d ?? dur / 3);
    out[i] = (Math.sin(ph) + (o.h2 ?? 0) * Math.sin(2 * ph)) * e;
  }
  return tail(out);
}
/** Glocke (FM): Münzen, Erfolge */
export function bell(f: number, dur = 1.2, ratio = 3.5, index = 2.5, decay = 0.5) {
  const n = len(dur);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const mi = index * Math.exp(-t / 0.25);
    out[i] = Math.sin(TAU * f * t + mi * Math.sin(TAU * f * ratio * t)) * ad(t, 0.002, decay);
  }
  return tail(out);
}

// ---------- Instrumente (je eine Note) ----------
export type Inst = 'kalimba' | 'marimba' | 'musicbox' | 'epiano' | 'pluck' | 'bass' | 'ocarina' | 'pad' | 'bells';

/** gezupfte Saite (Karplus-Strong) */
function pluck(f: number, dur: number, bright = 0.55, seed = 3) {
  const n = len(dur);
  const out = new Float32Array(n);
  const N = Math.max(2, SR / f);
  const Ni = Math.floor(N);
  const fr = N - Ni;
  const size = Ni + 2;
  const d = new Float32Array(size);
  const r = rng(seed);
  // Anschlag: weiches Rauschen
  let lp = 0;
  for (let i = 0; i < size; i++) {
    lp += (r() * 2 - 1 - lp) * bright;
    d[i] = lp;
  }
  let w = 0;
  let prev = 0;
  const damp = 0.996 + Math.min(0.0035, f / 400000);
  for (let i = 0; i < n; i++) {
    const a = d[(w + size - Ni) % size];
    const b = d[(w + size - Ni - 1) % size];
    const y = a * (1 - fr) + b * fr;
    const v = (y + prev) * 0.5 * damp;
    prev = y;
    d[w] = v;
    w = (w + 1) % size;
    out[i] = v;
  }
  // Körper der Gitarre: leichte Resonanz
  const body = new BQ('bp', 220, 0.8);
  for (let i = 0; i < n; i++) out[i] = out[i] * 0.85 + body.run(out[i]) * 0.5;
  return tail(out, 0.05);
}

/** eine Note eines Instruments (dur = Länge der Note in Sekunden, nur für gehaltene Klänge) */
const noteCache = new Map<string, Float32Array>();
/** eine Note (gemerkt – Jingles und Lieder brauchen dieselben Töne oft) */
export function note(inst: Inst, midi: number, dur = 1): Float32Array {
  const k = `${inst}:${midi}:${inst === 'pad' || inst === 'ocarina' ? dur : 1}`;
  let b = noteCache.get(k);
  if (!b) noteCache.set(k, (b = renderNote(inst, midi, dur)));
  return b;
}
/** eine Note neu berechnen (ohne Merken – die Musik speichert selbst) */
export function renderNote(inst: Inst, midi: number, dur: number): Float32Array {
  const f = mtof(midi);
  switch (inst) {
    case 'kalimba': {
      const b = modal(1.4, [
        [f, 1, 0.8],
        [f * 2.01, 0.06, 0.3],
        [f * 5.93, 0.1, 0.08],
        [f * 11.8, 0.03, 0.025],
      ]);
      mix(b, noise(0.012, { type: 'bp', f: 2600, q: 0.8, d: 0.004, seed: midi }), 0, 0.25);
      return norm(b, 0.8);
    }
    case 'marimba': {
      const k = Math.min(1.4, 300 / f + 0.35);
      const b = modal(0.95, [
        [f, 1, 0.5 * k],
        [f * 3.93, 0.32, 0.12 * k],
        [f * 9.2, 0.08, 0.04],
      ], 0.004);
      mix(b, noise(0.01, { type: 'lp', f: 1800, d: 0.004, seed: midi }), 0, 0.3);
      return norm(b, 0.8);
    }
    case 'musicbox': {
      const b = modal(1.6, [
        [f, 1, 0.9],
        [f * 3.98, 0.3, 0.35],
        [f * 7.8, 0.12, 0.12],
        [f * 12.2, 0.05, 0.05],
      ], 0.001);
      return norm(b, 0.75);
    }
    case 'epiano': {
      const n = len(1.7);
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        const idx = 1.6 * Math.exp(-t / 0.5) + 0.25;
        const e = ad(t, 0.004, 0.75);
        out[i] = Math.sin(TAU * f * t + idx * Math.sin(TAU * f * t)) * e + 0.06 * Math.sin(TAU * f * 14 * t) * Math.exp(-t / 0.03);
      }
      // weich abrunden
      const lp = new BQ('lp', 3800);
      for (let i = 0; i < n; i++) out[i] = lp.run(out[i]);
      return norm(tail(out, 0.1), 0.7);
    }
    case 'pluck':
      return norm(pluck(f, 1.5, f > 400 ? 0.7 : 0.5, midi), 0.75);
    case 'bass': {
      const n = len(0.85);
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        const e = ad(t, 0.006, 0.35);
        out[i] = (Math.sin(TAU * f * t) + 0.35 * Math.sin(TAU * 2 * f * t) * Math.exp(-t / 0.12) + 0.12 * Math.sin(TAU * 3 * f * t) * Math.exp(-t / 0.06)) * e;
      }
      return norm(tail(out, 0.08), 0.85);
    }
    case 'ocarina': {
      const d = Math.max(0.15, dur);
      const n = len(d + 0.15);
      const out = new Float32Array(n);
      const r = rng(midi);
      const bp = new BQ('bp', f * 2, 2);
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        const vib = 1 + 0.005 * Math.sin(TAU * 5.2 * t) * Math.min(1, t / 0.25);
        ph += (TAU * f * vib) / SR;
        const e = Math.min(1, t / 0.05) * (t > d ? Math.exp(-(t - d) / 0.05) : 1) * (1 - 0.15 * Math.min(1, t / 0.6));
        out[i] = (Math.sin(ph) + 0.08 * Math.sin(2 * ph) + 0.03 * Math.sin(3 * ph) + bp.run(r() * 2 - 1) * 0.05) * e;
      }
      return norm(tail(out), 0.7);
    }
    case 'pad': {
      const d = Math.max(0.5, dur);
      const n = len(d + 0.7);
      const out = new Float32Array(n);
      const lp = new BQ('lp', 1400, 0.6);
      const det = [0.996, 1, 1.004];
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        let v = 0;
        for (const k of det) {
          // weiches Dreieck
          const p = (f * k * t) % 1;
          v += 1 - 4 * Math.abs(p - 0.5);
        }
        const e = Math.min(1, t / 0.7) * (t > d ? Math.exp(-(t - d) / 0.25) : 1);
        out[i] = lp.run(v / 3) * e;
      }
      return norm(tail(out, 0.1), 0.5);
    }
    case 'bells':
      return norm(bell(f, 1.6, 3.5, 1.5, 0.6), 0.6);
  }
}

// ---------- Schlagzeug (leise, für Schwung) ----------
export type Drum = 'shaker' | 'kick' | 'clave' | 'brush' | 'jingle';
export function drum(d: Drum, seed = 1): Float32Array {
  switch (d) {
    case 'shaker':
      return norm(noise(0.09, { type: 'hp', f: 6500, q: 0.7, env: (t) => (t < 0.015 ? t / 0.015 : Math.exp(-(t - 0.015) / 0.025)), seed }), 0.5);
    case 'kick':
      return norm(glide(0.22, 110, 45, { a: 0.002, d: 0.08, curve: 0.4 }), 0.8);
    case 'clave':
      return norm(modal(0.12, [
        [2200, 1, 0.025],
        [3400, 0.3, 0.012],
      ]), 0.5);
    case 'brush':
      return norm(noise(0.18, { type: 'bp', f: 3000, q: 0.6, a: 0.01, d: 0.06, seed }), 0.45);
    case 'jingle': {
      const b = new Float32Array(len(0.4));
      const r = rng(seed);
      for (let k = 0; k < 5; k++) mix(b, bell(3200 + r() * 1600, 0.35, 2.7, 1.2, 0.08), r() * 0.03, 0.3);
      mix(b, noise(0.2, { type: 'hp', f: 7000, d: 0.05, seed }), 0, 0.2);
      return norm(b, 0.5);
    }
  }
}

// ---------- Geräusche ----------
export type Sfx =
  | 'chop'
  | 'fell'
  | 'hoe'
  | 'seed'
  | 'water'
  | 'refill'
  | 'splash'
  | 'harvest'
  | 'pick'
  | 'build'
  | 'coin'
  | 'click'
  | 'open'
  | 'nope'
  | 'quest'
  | 'level'
  | 'eat'
  | 'cook'
  | 'stepGrass'
  | 'stepSand'
  | 'stepWood'
  | 'hoof'
  | 'nicker'
  | 'neigh'
  | 'whistle'
  | 'brush'
  | 'mow'
  | 'door'
  | 'sleep'
  | 'bubble'
  | 'gull'
  | 'bird'
  | 'dove'
  | 'frog'
  | 'owl';

/** so viele Spielarten je Geräusch (zufällig gewählt, damit es nicht immer gleich klingt) */
export const VARIANTS: Partial<Record<Sfx, number>> = { chop: 3, hoe: 3, seed: 2, water: 2, harvest: 2, pick: 2, eat: 2, stepGrass: 4, stepSand: 4, stepWood: 4, hoof: 2, click: 2, bird: 6, bubble: 3, gull: 2 };

/** Arpeggio aus Instrument-Noten (Jingles) */
function jingle(inst: Inst, notes: [number, number][], dur: number, gain = 0.7) {
  const out = new Float32Array(len(dur));
  for (const [m, at] of notes) mix(out, note(inst, m), at, gain);
  return out;
}

export function makeSfx(name: Sfx, v = 0): Float32Array {
  const r = rng(1000 + v * 77 + name.length * 13);
  const j = (x: number) => 1 + (r() - 0.5) * x;
  switch (name) {
    case 'chop': {
      // Axt in Holz: hohles „Tock“ mit Splittern
      const f = 190 * j(0.2);
      const b = modal(0.4, [
        [f, 1, 0.09],
        [f * 2.37, 0.6, 0.05],
        [f * 3.9, 0.35, 0.03],
        [f * 5.6, 0.2, 0.02],
      ], 0.001);
      mix(b, noise(0.05, { type: 'bp', f: 2800, q: 0.9, d: 0.012, seed: v + 1 }), 0, 0.9);
      mix(b, glide(0.12, 120, 60, { d: 0.04 }), 0, 0.6);
      return norm(b, 0.95);
    }
    case 'fell': {
      const b = new Float32Array(len(2.2));
      // Knarzen (Holz gibt nach)
      const cr = new Float32Array(len(0.7));
      const rr = rng(11);
      const bp = new BQ('bp', 700, 4);
      let ph = 0;
      for (let i = 0; i < cr.length; i++) {
        const t = i / SR;
        const f = 95 - t * 40 + (rr() - 0.5) * 30;
        ph += f / SR;
        const pulse = ph % 1 < 0.08 ? 1 : 0;
        cr[i] = bp.run(pulse) * Math.min(1, t / 0.1) * (1 - t / 0.7) * 3;
      }
      mix(b, cr, 0, 0.6);
      // Rauschen der Blätter beim Fallen
      mix(b, noise(1.1, { type: 'bp', f: (t) => 2500 + t * 2500, q: 0.5, env: (t) => Math.sin(Math.min(1, t / 1.1) * Math.PI) * 0.8, seed: 5 }), 0.5, 0.7);
      // Aufschlag
      mix(b, glide(0.5, 70, 38, { a: 0.003, d: 0.18 }), 1.45, 1.1);
      mix(b, noise(0.4, { type: 'lp', f: 600, a: 0.002, d: 0.1, seed: 9 }), 1.45, 0.9);
      mix(b, noise(0.6, { type: 'bp', f: 4000, q: 0.5, a: 0.01, d: 0.18, seed: 13 }), 1.47, 0.35);
      return norm(b, 0.95);
    }
    case 'hoe': {
      // Hacke in Erde: dumpfes Knirschen
      const b = new Float32Array(len(0.35));
      mix(b, noise(0.25, { type: 'lp', f: 900 * j(0.3), a: 0.003, d: 0.05, seed: v + 3 }), 0, 1);
      const rr = rng(v + 40);
      for (let k = 0; k < 14; k++) mix(b, noise(0.012, { type: 'bp', f: 1200 + rr() * 2500, q: 2, d: 0.003, seed: k + v * 20 }), 0.01 + rr() * 0.12, 0.35);
      mix(b, glide(0.1, 130, 70, { d: 0.03 }), 0, 0.5);
      return norm(b, 0.85);
    }
    case 'seed': {
      // Samen rieseln in die Erde
      const b = new Float32Array(len(0.4));
      mix(b, noise(0.15, { type: 'lp', f: 1200, a: 0.01, d: 0.04, seed: v + 5 }), 0, 0.5);
      const rr = rng(v + 9);
      for (let k = 0; k < 5; k++) mix(b, modal(0.03, [[3500 + rr() * 2500, 1, 0.006]]), 0.05 + k * 0.045 + rr() * 0.02, 0.3);
      return norm(b, 0.6);
    }
    case 'water': {
      // Gießen: plätschernder Strahl mit Blubbern
      const b = new Float32Array(len(0.9));
      mix(b, noise(0.8, { type: 'bp', f: (t) => 1800 + Math.sin(t * 40) * 400, q: 0.7, env: (t) => Math.min(1, t / 0.06) * Math.exp(-Math.max(0, t - 0.45) / 0.12) * (0.75 + 0.25 * Math.sin(t * 57)), seed: v + 2 }), 0, 0.55);
      const rr = rng(v + 31);
      for (let k = 0; k < 18; k++) {
        const f = 500 + rr() * 900;
        mix(b, glide(0.035 + rr() * 0.03, f, f * 1.6, { a: 0.002, d: 0.012 }), 0.04 + rr() * 0.6, 0.35);
      }
      return norm(b, 0.8);
    }
    case 'refill': {
      // Kübel ins Wasser tauchen: Platsch, dann füllt er sich (Ton steigt)
      const b = new Float32Array(len(0.9));
      mix(b, noise(0.25, { type: 'bp', f: 1400, q: 0.6, a: 0.003, d: 0.07, seed: 4 }), 0, 0.8);
      mix(b, noise(0.6, { type: 'bp', f: (t) => 500 + t * 1500, q: 3, env: (t) => Math.sin((t / 0.6) * Math.PI) * 0.6, seed: 6 }), 0.12, 0.8);
      const rr = rng(8);
      for (let k = 0; k < 10; k++) mix(b, glide(0.05, 700 + k * 80, 1100 + k * 90, { d: 0.015 }), 0.15 + k * 0.05 + rr() * 0.02, 0.25);
      return norm(b, 0.8);
    }
    case 'splash': {
      const b = new Float32Array(len(0.7));
      mix(b, noise(0.4, { type: 'bp', f: (t) => 2200 - t * 2000, q: 0.5, a: 0.002, d: 0.08, seed: 21 }), 0, 1);
      mix(b, noise(0.2, { type: 'lp', f: 500, a: 0.002, d: 0.04, seed: 22 }), 0, 0.6);
      const rr = rng(23);
      for (let k = 0; k < 8; k++) mix(b, glide(0.04, 600 + rr() * 700, 1300 + rr() * 600, { d: 0.012 }), 0.08 + rr() * 0.35, 0.25);
      return norm(b, 0.85);
    }
    case 'bubble': {
      const f = 500 + v * 180;
      return norm(glide(0.08, f, f * 2.1, { a: 0.002, d: 0.025, curve: 0.6 }), 0.5);
    }
    case 'harvest': {
      // Herausziehen: „Plopp“ + Blätterrascheln + kleines Glöckchen
      const b = new Float32Array(len(0.9));
      mix(b, glide(0.09, 260 * j(0.2), 720, { a: 0.003, d: 0.03, curve: 0.5 }), 0, 0.9);
      mix(b, noise(0.18, { type: 'bp', f: 4500, q: 0.6, a: 0.01, d: 0.05, seed: v + 12 }), 0.02, 0.35);
      mix(b, note('kalimba', v ? 84 : 83), 0.08, 0.35);
      mix(b, note('kalimba', 88), 0.16, 0.3);
      return norm(b, 0.8);
    }
    case 'pick': {
      const b = new Float32Array(len(0.4));
      mix(b, noise(0.1, { type: 'bp', f: 3800, q: 0.8, a: 0.005, d: 0.03, seed: v + 30 }), 0, 0.5);
      mix(b, glide(0.07, 500, 900, { d: 0.02 }), 0.01, 0.5);
      mix(b, note('kalimba', v ? 81 : 79), 0.05, 0.3);
      return norm(b, 0.6);
    }
    case 'build': {
      // drei Hammerschläge auf Holz, dann ein fröhliches „Fertig!“
      const b = new Float32Array(len(1.6));
      for (let k = 0; k < 3; k++) {
        const f = 420 + k * 25;
        mix(b, modal(0.25, [[f, 1, 0.05], [f * 2.6, 0.5, 0.025], [f * 5.1, 0.2, 0.012]], 0.001), k * 0.18, 0.8);
        mix(b, noise(0.03, { type: 'bp', f: 3000, d: 0.008, seed: k }), k * 0.18, 0.4);
      }
      mix(b, jingle('marimba', [[72, 0], [76, 0.08], [79, 0.16], [84, 0.24]], 1.0), 0.6, 0.6);
      return norm(b, 0.85);
    }
    case 'coin': {
      // Münze: zwei helle Glockentöne
      const b = new Float32Array(len(1.0));
      mix(b, bell(1976, 0.5, 3.5, 1.8, 0.12), 0, 0.6);
      mix(b, bell(2637, 0.9, 3.5, 1.8, 0.28), 0.07, 0.7);
      return norm(b, 0.6);
    }
    case 'click': {
      // weiches Holz-„Tok“
      const f = v ? 980 : 860;
      return norm(modal(0.09, [[f, 1, 0.022], [f * 2.3, 0.4, 0.01]], 0.001), 0.5);
    }
    case 'open': {
      const b = new Float32Array(len(0.35));
      mix(b, noise(0.2, { type: 'bp', f: (t) => 800 + t * 6000, q: 0.8, env: (t) => Math.sin(Math.min(1, t / 0.2) * Math.PI) * 0.4, seed: 2 }), 0, 0.6);
      mix(b, glide(0.12, 600, 1000, { d: 0.04 }), 0.05, 0.4);
      return norm(b, 0.5);
    }
    case 'nope': {
      // zweimal dumpf „Bonk“ (etwas tiefer)
      const b = new Float32Array(len(0.35));
      mix(b, modal(0.15, [[330, 1, 0.04], [760, 0.3, 0.02]]), 0, 0.8);
      mix(b, modal(0.15, [[262, 1, 0.05], [600, 0.3, 0.02]]), 0.11, 0.8);
      return norm(b, 0.55);
    }
    case 'quest':
      return norm(jingle('kalimba', [[72, 0], [76, 0.1], [79, 0.2], [84, 0.3], [88, 0.42]], 1.9, 0.6), 0.75);
    case 'level': {
      const b = jingle('marimba', [[60, 0], [64, 0.12], [67, 0.24], [72, 0.36], [67, 0.6], [72, 0.72], [76, 0.84]], 2.6, 0.55);
      mix(b, jingle('bells', [[84, 0.84], [88, 0.96], [91, 1.08]], 2.0, 0.35), 0);
      mix(b, note('pad', 60, 1.3), 0.84, 0.25);
      mix(b, note('pad', 64, 1.3), 0.84, 0.2);
      mix(b, note('pad', 67, 1.3), 0.84, 0.2);
      return norm(b, 0.85);
    }
    case 'eat': {
      // knackiges Abbeißen und Kauen
      const b = new Float32Array(len(0.7));
      const rr = rng(v + 50);
      for (let k = 0; k < 3; k++) {
        const at = k * 0.2;
        mix(b, noise(0.09, { type: 'bp', f: 1800 + rr() * 900, q: 1.2, a: 0.004, d: 0.03, seed: k + v * 9 }), at, k ? 0.5 : 0.9);
        for (let c = 0; c < 6; c++) mix(b, noise(0.008, { type: 'bp', f: 3000 + rr() * 2500, q: 3, d: 0.002, seed: c + k * 10 }), at + rr() * 0.06, 0.25);
      }
      return norm(b, 0.7);
    }
    case 'cook': {
      // Brutzeln und Blubbern
      const b = new Float32Array(len(1.4));
      mix(b, noise(1.3, { type: 'hp', f: 3500, q: 0.6, env: (t) => Math.min(1, t / 0.2) * Math.exp(-Math.max(0, t - 0.9) / 0.15) * (0.6 + 0.4 * Math.sin(t * 31) * Math.sin(t * 17)), seed: 33 }), 0, 0.45);
      const rr = rng(34);
      for (let k = 0; k < 30; k++) mix(b, noise(0.006, { type: 'hp', f: 4000, d: 0.002, seed: k + 100 }), rr() * 1.2, 0.5);
      for (let k = 0; k < 6; k++) mix(b, glide(0.06, 300 + rr() * 200, 600 + rr() * 200, { d: 0.02 }), 0.2 + rr() * 0.9, 0.3);
      mix(b, jingle('kalimba', [[79, 0], [84, 0.1]], 0.9, 0.4), 0.9);
      return norm(b, 0.7);
    }
    case 'stepGrass': {
      const b = new Float32Array(len(0.14));
      mix(b, noise(0.12, { type: 'bp', f: 2600 * j(0.3), q: 0.6, a: 0.008, d: 0.03, seed: v + 60 }), 0, 0.7);
      const rr = rng(v + 61);
      for (let c = 0; c < 4; c++) mix(b, noise(0.01, { type: 'bp', f: 3500 + rr() * 3000, q: 2, d: 0.003, seed: c + v * 7 }), rr() * 0.06, 0.25);
      return norm(b, 0.35);
    }
    case 'stepSand':
      return norm(noise(0.16, { type: 'lp', f: 1700 * j(0.3), q: 0.5, a: 0.02, d: 0.04, seed: v + 70 }), 0.3);
    case 'stepWood': {
      const f = 170 * j(0.15);
      const b = modal(0.16, [[f, 1, 0.035], [f * 2.6, 0.5, 0.02], [f * 4.3, 0.2, 0.01]], 0.002);
      mix(b, noise(0.02, { type: 'bp', f: 2500, d: 0.005, seed: v + 80 }), 0, 0.4);
      return norm(b, 0.4);
    }
    case 'hoof': {
      const f = v ? 640 : 520;
      const b = modal(0.12, [[f, 1, 0.025], [f * 2.4, 0.4, 0.012]], 0.001);
      mix(b, noise(0.04, { type: 'lp', f: 900, d: 0.012, seed: v + 90 }), 0, 0.6);
      return norm(b, 0.45);
    }
    case 'nicker': {
      // zufriedenes Schnauben: Luft durch die Nüstern, leicht flatternd
      const b = noise(0.7, { type: 'bp', f: (t) => 900 - t * 300, q: 1.2, env: (t) => Math.min(1, t / 0.05) * Math.exp(-t / 0.3) * (0.6 + 0.4 * Math.sin(t * TAU * 22)), seed: 95 });
      mix(b, noise(0.5, { type: 'lp', f: 300, a: 0.03, d: 0.15, seed: 96 }), 0.02, 0.6);
      return norm(b, 0.6);
    }
    case 'neigh': {
      // Wiehern: Stimme steigt, zittert und fällt (Formanten wie ein Vokal)
      const n = len(1.25);
      const out = new Float32Array(n);
      const f1 = new BQ('bp', 750, 3);
      const f2 = new BQ('bp', 1350, 4);
      const f3 = new BQ('bp', 2600, 5);
      const rr = rng(97);
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        const k = t / 1.25;
        const base = k < 0.15 ? 420 + k * 4000 : 1020 - (k - 0.15) * 620;
        const f = base * (1 + 0.06 * Math.sin(TAU * 28 * t) * Math.min(1, k * 4));
        ph += f / SR;
        const saw = 2 * (ph % 1) - 1;
        const src = saw * 0.8 + (rr() * 2 - 1) * 0.25;
        const e = Math.min(1, t / 0.05) * Math.exp(-Math.max(0, t - 0.8) / 0.15);
        out[i] = (f1.run(src) + f2.run(src) * 0.7 + f3.run(src) * 0.35) * e;
      }
      mix(out, noise(0.4, { type: 'bp', f: 600, q: 1, a: 0.02, d: 0.12, seed: 98 }), 0.95, 0.5);
      return norm(tail(out, 0.05), 0.6);
    }
    case 'whistle': {
      // Pfiff: zwei Töne mit Luft
      const b = new Float32Array(len(0.75));
      const w = (f0: number, f1: number, d: number) => {
        const n2 = len(d);
        const o = new Float32Array(n2);
        let ph = 0;
        for (let i = 0; i < n2; i++) {
          const t = i / SR;
          const f = f0 + (f1 - f0) * Math.min(1, t / (d * 0.6)) + Math.sin(t * TAU * 6) * 15;
          ph += (TAU * f) / SR;
          o[i] = Math.sin(ph) * Math.sin(Math.min(1, t / d) * Math.PI);
        }
        return o;
      };
      mix(b, w(1500, 2200, 0.25), 0, 0.6);
      mix(b, w(2200, 1700, 0.35), 0.3, 0.6);
      mix(b, noise(0.65, { type: 'bp', f: 2000, q: 1, env: (t) => 0.08 * Math.sin(Math.min(1, t / 0.65) * Math.PI), seed: 99 }), 0, 1);
      return norm(b, 0.55);
    }
    case 'brush': {
      const b = new Float32Array(len(0.9));
      for (let k = 0; k < 3; k++) mix(b, noise(0.22, { type: 'bp', f: (t) => 3000 + t * 6000, q: 0.7, env: (t) => Math.sin(Math.min(1, t / 0.22) * Math.PI), seed: k + 120 }), k * 0.24, 0.5);
      mix(b, note('kalimba', 91), 0.72, 0.2);
      return norm(b, 0.55);
    }
    case 'mow': {
      // Sense: Schwung und abgeschnittenes Gras
      const b = noise(0.35, { type: 'bp', f: (t) => 1200 + t * 9000, q: 0.8, env: (t) => Math.sin(Math.min(1, t / 0.3) * Math.PI), seed: 130 });
      const rr = rng(131);
      for (let c = 0; c < 10; c++) mix(b, noise(0.01, { type: 'hp', f: 3000, d: 0.003, seed: c + 140 }), 0.12 + rr() * 0.18, 0.3);
      return norm(b, 0.6);
    }
    case 'door': {
      // Holztür: kurzes Knarren, dann leises Zuklappen
      const b = new Float32Array(len(0.7));
      const cr = new Float32Array(len(0.35));
      const bp = new BQ('bp', 1100, 6);
      let ph = 0;
      for (let i = 0; i < cr.length; i++) {
        const t = i / SR;
        ph += (140 + t * 120) / SR;
        cr[i] = bp.run(ph % 1 < 0.1 ? 1 : 0) * Math.sin((t / 0.35) * Math.PI) * 2;
      }
      mix(b, cr, 0, 0.35);
      mix(b, modal(0.25, [[150, 1, 0.05], [380, 0.5, 0.03]]), 0.38, 0.8);
      mix(b, noise(0.05, { type: 'lp', f: 1500, d: 0.01, seed: 150 }), 0.38, 0.5);
      return norm(b, 0.6);
    }
    case 'sleep':
      return norm(jingle('musicbox', [[84, 0], [79, 0.35], [76, 0.7], [72, 1.05], [67, 1.4], [72, 1.75]], 3.5, 0.5), 0.6);
    // ---- Umgebung: Tiere ----
    case 'bird': {
      // sechs verschiedene Rufe
      const b = new Float32Array(len(0.9));
      const base = 2600 + r() * 1400;
      if (v % 3 === 0) for (let k = 0; k < 3; k++) mix(b, glide(0.07, base * 1.25, base * 0.85, { a: 0.004, d: 0.03 }), k * 0.13, 0.7);
      else if (v % 3 === 1) {
        // Triller
        const n = len(0.45);
        const o = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          const t = i / SR;
          o[i] = Math.sin(TAU * base * t + 3 * Math.sin(TAU * 24 * t)) * (0.5 + 0.5 * Math.sin(TAU * 26 * t)) * Math.sin((t / 0.45) * Math.PI);
        }
        mix(b, o, 0, 0.6);
      } else {
        mix(b, glide(0.12, base * 0.8, base * 1.4, { a: 0.01, d: 0.06 }), 0, 0.6);
        mix(b, glide(0.18, base * 1.3, base, { a: 0.01, d: 0.08 }), 0.18, 0.6);
      }
      return norm(b, 0.5);
    }
    case 'dove': {
      // Taube: „Huu-huu-hu“
      const b = new Float32Array(len(1.6));
      for (const [at, d] of [[0, 0.35], [0.5, 0.25], [0.85, 0.5]] as const) mix(b, glide(d, 480, 420, { env: (t) => Math.sin(Math.min(1, t / d) * Math.PI), h2: 0.15 }), at, 0.6);
      const lp = new BQ('lp', 900);
      for (let i = 0; i < b.length; i++) b[i] = lp.run(b[i]);
      return norm(b, 0.4);
    }
    case 'gull': {
      // Möwe: „Kjaa“
      const b = new Float32Array(len(0.9));
      for (let k = 0; k < 2 + v; k++) {
        const n2 = len(0.22);
        const o = new Float32Array(n2);
        const f1 = new BQ('bp', 1800, 3);
        let ph = 0;
        for (let i = 0; i < n2; i++) {
          const t = i / SR;
          const f = 900 + Math.sin((t / 0.22) * Math.PI) * 500;
          ph += f / SR;
          o[i] = f1.run(2 * (ph % 1) - 1) * Math.sin((t / 0.22) * Math.PI);
        }
        mix(b, o, k * 0.28, 0.7);
      }
      return norm(b, 0.35);
    }
    case 'frog': {
      // Frosch: kurzes Quaken (schnelle Pulse durch einen Hohlraum)
      const n = len(0.3);
      const o = new Float32Array(n);
      const f1 = new BQ('bp', 520, 4);
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        const p = (t * 85) % 1 < 0.25 ? 1 : 0;
        o[i] = f1.run(p) * Math.sin((t / 0.3) * Math.PI);
      }
      return norm(o, 0.4);
    }
    case 'owl': {
      const b = new Float32Array(len(1.4));
      mix(b, glide(0.3, 400, 380, { env: (t) => Math.sin(Math.min(1, t / 0.3) * Math.PI) }), 0, 0.6);
      mix(b, glide(0.6, 420, 360, { env: (t) => Math.sin(Math.min(1, t / 0.6) * Math.PI) }), 0.45, 0.6);
      return norm(b, 0.35);
    }
  }
}

// ---------- Umgebung als Schleifen ----------
/** Meer: Wellen, die anrollen und mit Schaum auslaufen (nahtlos wiederholbar) */
export function seaLoop(sec = 16): Float32Array {
  const n = len(sec);
  const out = new Float32Array(n);
  const r = rng(201);
  const lp = new BQ('lp', 500, 0.5);
  const hp = new BQ('hp', 2500, 0.5);
  const lp2 = new BQ('lp', 6000, 0.5);
  // Wellen: alle paar Sekunden eine, gleichmäßig verteilt (für die Schleife)
  const waves: { at: number; size: number }[] = [];
  for (let at = 0.3; at < sec; at += 3.6 + r() * 1.2) waves.push({ at, size: 0.7 + r() * 0.3 });
  const envAt = (t: number) => {
    let roll = 0;
    let fizz = 0;
    for (const w of waves)
      for (const off of [0, sec, -sec]) {
        const d = t - w.at - off;
        if (d > -1.6 && d < 0) roll += w.size * Math.pow(1 + d / 1.6, 2);
        if (d >= 0 && d < 3) {
          roll += w.size * Math.exp(-d / 0.5);
          fizz += w.size * Math.exp(-d / 1.1) * Math.min(1, d / 0.1);
        }
      }
    return [roll, fizz];
  };
  // Hüllkurve nur alle 64 Abtastwerte rechnen (dazwischen gerade Linie) – viel schneller
  let [r0, f0] = envAt(0);
  let [r1, f1] = envAt(64 / SR);
  for (let i = 0; i < n; i++) {
    if (i % 64 === 0 && i) {
      [r0, f0] = [r1, f1];
      [r1, f1] = envAt((i + 64) / SR);
    }
    const k = (i % 64) / 64;
    const x = r() * 2 - 1;
    out[i] = lp.run(x) * (0.35 + (r0 + (r1 - r0) * k) * 0.9) + lp2.run(hp.run(x)) * (f0 + (f1 - f0) * k) * 0.35;
  }
  return norm(out, 0.8);
}
/** Regen: Rauschen und einzelne Tropfen */
export function rainLoop(sec = 6): Float32Array {
  const n = len(sec);
  const out = new Float32Array(n);
  const r = rng(301);
  const lp = new BQ('lp', 3500, 0.5);
  const hp = new BQ('hp', 400);
  for (let i = 0; i < n; i++) out[i] = lp.run(hp.run(r() * 2 - 1)) * 0.5;
  for (let k = 0; k < sec * 60; k++) mix(out, noise(0.01, { type: 'bp', f: 2500 + r() * 4000, q: 2, d: 0.003, seed: k + 400 }), r() * (sec - 0.02), 0.25 + r() * 0.3);
  return norm(out, 0.7);
}
/** Grillen: viele kleine Zirp-Folgen (nahtlos) */
export function cricketLoop(sec = 6): Float32Array {
  const n = len(sec);
  const out = new Float32Array(n);
  const r = rng(501);
  for (let c = 0; c < 3; c++) {
    const f = 4200 + c * 350 + r() * 200;
    const rate = 1.6 + r() * 1.2;
    for (let at = r() * 0.5; at < sec - 0.2; at += 1 / rate + (r() - 0.5) * 0.05) {
      const chirp = new Float32Array(len(0.12));
      for (let i = 0; i < chirp.length; i++) {
        const t = i / SR;
        const pulse = Math.max(0, Math.sin(TAU * 32 * t));
        chirp[i] = Math.sin(TAU * f * t) * pulse * Math.sin((t / 0.12) * Math.PI);
      }
      mix(out, chirp, at, 0.3 / (c + 1));
    }
  }
  return norm(out, 0.5);
}
/** Wind in den Blättern: leises, wogendes Rauschen */
export function windLoop(sec = 10): Float32Array {
  const n = len(sec);
  const out = new Float32Array(n);
  const r = rng(601);
  const bp = new BQ('bp', 700, 0.4);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if (i % 64 === 0) bp.set(600 + 300 * Math.sin((TAU * t) / sec) + 200 * Math.sin((TAU * 3 * t) / sec), 0.4);
    const e = 0.55 + 0.45 * Math.sin((TAU * t) / sec) * Math.sin((TAU * 2 * t) / sec + 1);
    out[i] = bp.run(r() * 2 - 1) * e;
  }
  return norm(out, 0.6);
}
/** knisterndes Feuer */
export function fireLoop(sec = 4): Float32Array {
  const n = len(sec);
  const out = new Float32Array(n);
  const r = rng(701);
  const lp = new BQ('lp', 400, 0.5);
  for (let i = 0; i < n; i++) out[i] = lp.run(r() * 2 - 1) * 0.25;
  for (let k = 0; k < sec * 25; k++) mix(out, noise(0.006 + r() * 0.01, { type: 'bp', f: 2000 + r() * 4000, q: 1.5, d: 0.003, seed: k + 800 }), r() * (sec - 0.03), 0.4 + r() * 0.6);
  return norm(out, 0.7);
}
/** Hall: abklingendes Rauschen (Stereo-Impulsantwort für den Raumklang) */
export function reverbIR(sec = 2.2, seed = 901): [Float32Array, Float32Array] {
  const n = len(sec);
  const l = new Float32Array(n);
  const rr = new Float32Array(n);
  const r = rng(seed);
  const lpL = new BQ('lp', 6000);
  const lpR = new BQ('lp', 6000);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const e = Math.exp(-t / (sec / 5)) * Math.min(1, t / 0.01);
    if (i % 128 === 0) {
      lpL.set(6000 * Math.exp(-t / 0.8) + 600);
      lpR.set(6000 * Math.exp(-t / 0.8) + 600);
    }
    l[i] = lpL.run(r() * 2 - 1) * e;
    rr[i] = lpR.run(r() * 2 - 1) * e;
  }
  return [l, rr];
}
