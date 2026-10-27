/**
 * Musikstücke der Insel: je Tageszeit ein eigenes Lied (Morgen, Mittag, Abend,
 * Nacht), eins für zu Hause. Noten als kurze Texte: „E5/2“ = Ton E5, zwei Achtel lang,
 * „-/2“ = Pause. Akkorde je Takt. Begleitung, Bass und leises Schlagzeug ergeben
 * sich aus den Akkorden. Reine Daten + Umrechnung.
 */
import type { Drum, Inst } from './dsp';

export interface Song {
  id: 'morning' | 'noon' | 'evening' | 'night' | 'home';
  bpm: number;
  /** Schläge pro Takt (Achtel = 2 je Schlag) */
  beats: 3 | 4;
  /** Swing 0..0.3 (zweite Achtel etwas später) */
  swing: number;
  chords: string[];
  melody: string;
  lead: Inst;
  /** bei jeder zweiten Wiederholung spielt dieses Instrument die Melodie */
  lead2: Inst;
  comp: 'arp' | 'stabs' | 'waltz' | 'sustain' | 'harp';
  compInst: Inst;
  bass: 'root' | 'root5' | 'long';
  drums: 'groove' | 'light' | 'none';
  pad: boolean;
}

export const SONGS: Song[] = [
  {
    id: 'morning',
    bpm: 96,
    beats: 4,
    swing: 0.08,
    chords: ['C', 'G', 'Am', 'F', 'C', 'Dm7', 'G', 'C', 'F', 'G', 'Em', 'Am', 'Dm7', 'G', 'C', 'C'],
    melody: `E5/2 G5/2 C6/2 G5/2 | B5/3 A5/1 G5/4 | A5/2 C6/2 E6/2 C6/2 | A5/4 -/2 G5/1 F5/1 |
             E5/2 G5/2 C6/2 D6/2 | F6/3 E6/1 D6/2 C6/2 | B5/2 D6/2 G5/4 | C6/6 -/2 |
             A5/2 C6/2 F6/2 E6/2 | D6/2 B5/2 G5/4 | G5/2 B5/2 E6/2 D6/2 | C6/3 B5/1 A5/4 |
             F5/2 A5/2 D6/2 C6/2 | B5/2 A5/2 G5/2 D6/2 | E6/3 D6/1 C6/4 | -/8`,
    lead: 'kalimba',
    lead2: 'musicbox',
    comp: 'arp',
    compInst: 'pluck',
    bass: 'root5',
    drums: 'light',
    pad: false,
  },
  {
    id: 'noon',
    bpm: 112,
    beats: 4,
    swing: 0.12,
    chords: ['F', 'F', 'Bb', 'C', 'F', 'Dm', 'Gm7', 'C7', 'Bb', 'C', 'Am', 'Dm', 'Gm7', 'C7', 'F', 'F'],
    melody: `C5/1 F5/1 A5/2 G5/1 F5/1 -/2 | A5/1 C6/1 A5/2 G5/2 F5/2 | D5/2 F5/2 Bb5/2 A5/1 G5/1 | E5/2 G5/2 C6/2 -/2 |
             C5/1 F5/1 A5/2 G5/1 F5/1 -/2 | A5/1 D6/1 C6/2 A5/2 F5/2 | G5/2 Bb5/2 D6/2 C6/1 Bb5/1 | A5/2 G5/2 E5/2 C5/2 |
             D6/2 C6/1 Bb5/1 F5/4 | E6/2 D6/1 C6/1 G5/4 | C6/2 A5/2 E5/2 A5/2 | D6/2 F6/2 E6/1 D6/1 A5/2 |
             Bb5/2 A5/1 G5/1 F5/2 G5/2 | E5/2 G5/2 Bb5/2 C6/2 | A5/4 C6/2 F6/2 | F6/2 -/6`,
    lead: 'marimba',
    lead2: 'kalimba',
    comp: 'stabs',
    compInst: 'epiano',
    bass: 'root5',
    drums: 'groove',
    pad: false,
  },
  {
    id: 'evening',
    bpm: 84,
    beats: 4,
    swing: 0.1,
    chords: ['Gmaj7', 'Em7', 'Cmaj7', 'D', 'Gmaj7', 'Bm7', 'Cmaj7', 'D7', 'Em7', 'Cmaj7', 'Am7', 'D', 'Bm7', 'Em7', 'Am7', 'D7'],
    melody: `D5/2 G5/2 B5/3 A5/1 | G5/2 E5/2 D5/4 | E5/2 G5/2 C6/3 B5/1 | A5/6 -/2 |
             D5/2 G5/2 B5/3 D6/1 | D6/2 B5/2 A5/2 F#5/2 | G5/3 A5/1 B5/2 E5/2 | D5/6 -/2 |
             E5/2 G5/2 B5/2 D6/2 | C6/4 B5/2 G5/2 | A5/2 C6/2 E6/2 D6/2 | D6/6 -/2 |
             B5/2 A5/2 F#5/4 | G5/2 B5/2 E6/4 | C6/2 B5/2 A5/2 E5/2 | F#5/4 A5/4`,
    lead: 'ocarina',
    lead2: 'epiano',
    comp: 'harp',
    compInst: 'pluck',
    bass: 'long',
    drums: 'none',
    pad: true,
  },
  {
    id: 'night',
    bpm: 64,
    beats: 4,
    swing: 0,
    chords: ['Am', 'Fmaj7', 'C', 'G', 'Am', 'Fmaj7', 'Dm7', 'E7'],
    melody: `E6/2 C6/2 A5/4 | A5/2 C6/2 E6/4 | G5/2 C6/2 E6/2 D6/2 | D6/4 B5/4 |
             E6/2 A6/2 G6/2 E6/2 | F6/2 E6/2 C6/4 | D6/2 F6/2 A5/2 C6/2 | B5/4 G#5/4`,
    lead: 'musicbox',
    lead2: 'kalimba',
    comp: 'sustain',
    compInst: 'pad',
    bass: 'long',
    drums: 'none',
    pad: false,
  },
  {
    id: 'home',
    bpm: 80,
    beats: 3,
    swing: 0,
    chords: ['F', 'C', 'Dm', 'Bb', 'F', 'Gm', 'C7', 'F', 'Bb', 'F', 'Gm', 'C', 'Am', 'Dm', 'Gm7', 'C7'],
    melody: `A5/2 C6/2 A5/2 | G5/4 E5/2 | F5/2 A5/2 D6/2 | D6/4 -/2 |
             C6/2 A5/2 F5/2 | Bb5/2 G5/2 D5/2 | E5/2 G5/2 Bb5/2 | A5/4 -/2 |
             D6/2 F6/2 D6/2 | C6/4 A5/2 | Bb5/2 D6/2 G5/2 | E5/4 -/2 |
             C6/2 E6/2 C6/2 | A5/2 D6/2 F6/2 | F6/2 D6/2 Bb5/2 | G5/2 Bb5/2 C6/2`,
    lead: 'kalimba',
    lead2: 'epiano',
    comp: 'waltz',
    compInst: 'epiano',
    bass: 'root',
    drums: 'none',
    pad: false,
  },
];
export const songById = (id: Song['id']) => SONGS.find((s) => s.id === id)!;

const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** „F#5“ → MIDI-Nummer */
export function midiOf(s: string) {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(s);
  if (!m) throw new Error(`Note? ${s}`);
  return NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
}
/** Melodie → Liste aus [MIDI oder -1 für Pause, Länge in Achteln] */
export function parseMelody(s: string): [number, number][] {
  return s
    .split(/[\s|]+/)
    .filter(Boolean)
    .map((tok) => {
      const [n, d] = tok.split('/');
      return [n === '-' ? -1 : midiOf(n), Number(d)] as [number, number];
    });
}
/** Akkord → Grundton (MIDI in Oktave 3) und Töne darüber (Halbtöne) */
export function parseChord(c: string): { root: number; tones: number[] } {
  const m = /^([A-G])(#|b)?(.*)$/.exec(c)!;
  const root = 48 + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  const q = m[3];
  const tones =
    q === 'm' ? [0, 3, 7] : q === '7' ? [0, 4, 7, 10] : q === 'maj7' ? [0, 4, 7, 11] : q === 'm7' ? [0, 3, 7, 10] : q === 'sus' ? [0, 5, 7] : q === 'dim' ? [0, 3, 6] : [0, 4, 7];
  return { root, tones };
}
/** Länge eines Lieds in Achteln */
export const songEighths = (s: Song) => s.chords.length * s.beats * 2;

/** ein Ton zu einem Zeitpunkt (dt = Versatz in Sekunden ab dem Achtel) */
export interface MusicEvent {
  inst?: Inst;
  drum?: Drum;
  midi?: number;
  /** Länge (für gehaltene Klänge) in Sekunden */
  len?: number;
  gain: number;
  pan?: number;
  rev?: number;
  dt: number;
}
/** Melodie eines Lieds nach Achtel-Nummer */
export function melodyMap(s: Song) {
  const m = new Map<number, [number, number]>();
  let at = 0;
  for (const [n, d] of parseMelody(s.melody)) {
    if (n >= 0) m.set(at, [n, d]);
    at += d;
  }
  return m;
}
/**
 * Was im Achtel st eines Lieds erklingt. rnd: Zufall 0..1 (für leichte Unterschiede
 * in Lautstärke und Zeit – klingt lebendiger), rain/winter: Schlagzeug aus bzw. Glöckchen an.
 */
export function stepEvents(s: Song, mel: Map<number, [number, number]>, st: number, loopN: number, o: { rnd: () => number; rain: boolean; winter: boolean }): MusicEvent[] {
  const ev: MusicEvent[] = [];
  const e8 = 60 / s.bpm / 2;
  const per = s.beats * 2;
  const bar = Math.floor(st / per);
  const pos = st % per;
  const { root, tones } = parseChord(s.chords[bar]);
  const sw = pos % 2 ? s.swing * e8 : 0;
  const jit = () => sw + (o.rnd() - 0.5) * 0.012;
  const g8 = () => 0.88 + o.rnd() * 0.24;
  const rev = 0.28;
  const m = mel.get(st);
  if (m) {
    const inst = loopN % 2 ? s.lead2 : s.lead;
    const vol = inst === 'ocarina' ? 0.32 : inst === 'musicbox' ? 0.36 : inst === 'epiano' ? 0.34 : 0.42;
    ev.push({ inst, midi: m[0], len: m[1] * e8, gain: vol * g8(), rev, pan: 0.05, dt: jit() });
  }
  const chordAt = (oct: number) => tones.map((t) => root + oct + t);
  if (s.comp === 'arp') {
    // Zupfmuster: Grundton, Quinte, Terz oben, Quinte, Oktave …
    const c = chordAt(12);
    const seq = [c[0], c[2], c[1] + 12, c[2], c[0] + 12, c[2], c[1] + 12, c[2]];
    ev.push({ inst: s.compInst, midi: seq[pos % 8], gain: (pos === 0 ? 0.24 : 0.17) * g8(), rev, pan: -0.2, dt: jit() });
  } else if (s.comp === 'harp') {
    if (pos % 2 === 0) {
      const c = [...chordAt(12), ...chordAt(24)];
      ev.push({ inst: s.compInst, midi: c[(pos / 2) % c.length], gain: 0.16 * g8(), rev, pan: -0.25, dt: jit() });
    }
  } else if (s.comp === 'stabs') {
    if (pos === 2 || pos === 6) for (const n of chordAt(12)) ev.push({ inst: s.compInst, midi: n, gain: 0.12 * g8(), rev, pan: -0.15, dt: jit() });
  } else if (s.comp === 'waltz') {
    if (pos === 2 || pos === 4) for (const n of chordAt(12)) ev.push({ inst: s.compInst, midi: n, gain: 0.11 * g8(), rev, pan: -0.15, dt: jit() });
  } else if (s.comp === 'sustain') {
    if (pos === 0) for (const n of chordAt(12)) ev.push({ inst: s.compInst, midi: n, len: per * e8, gain: 0.16, rev: 0.4, dt: 0 });
  }
  if (s.pad && pos === 0) for (const n of chordAt(12)) ev.push({ inst: 'pad', midi: n, len: per * e8, gain: 0.07, rev: 0.4, dt: 0 });
  // Bass
  if (s.bass === 'root5') {
    if (pos === 0) ev.push({ inst: 'bass', midi: root - 12, gain: 0.34, dt: 0 });
    if (pos === per / 2) ev.push({ inst: 'bass', midi: root - 5, gain: 0.26, dt: jit() });
  } else if (pos === 0) ev.push({ inst: 'bass', midi: root - 12, gain: s.bass === 'long' ? 0.3 : 0.32, dt: 0 });
  // leises Schlagzeug (bei Regen nicht)
  if (!o.rain && s.drums !== 'none') {
    if (s.drums === 'groove') {
      if (pos === 0 || pos === 4) ev.push({ drum: 'kick', gain: 0.32, dt: 0 });
      if (pos === 2 || pos === 6) ev.push({ drum: 'clave', gain: 0.1, rev: 0.2, dt: jit() });
      ev.push({ drum: 'shaker', gain: (pos % 2 ? 0.1 : 0.06) * g8(), pan: 0.3, dt: jit() });
    } else {
      if (pos === 0) ev.push({ drum: 'kick', gain: 0.2, dt: 0 });
      if (pos % 2) ev.push({ drum: 'shaker', gain: 0.08 * g8(), pan: 0.3, dt: jit() });
    }
  }
  // Winterfest: Schlittenglöckchen bei den fröhlichen Liedern
  if (o.winter && (s.id === 'morning' || s.id === 'noon') && pos % 2 === 0) ev.push({ drum: 'jingle', gain: 0.09 * g8(), pan: 0.35, rev: 0.2, dt: jit() });
  return ev;
}
