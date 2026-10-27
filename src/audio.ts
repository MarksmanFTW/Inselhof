/**
 * Töne und Musik. Alle Klänge werden beim Start einmal berechnet (sound/dsp.ts) und
 * dann abgespielt: Geräusche mit leichten Abweichungen (klingt nie zweimal gleich),
 * Umgebung (Meer, Wind, Vögel, Grillen, Regen, Feuer) je nach Ort und Tageszeit,
 * und je Tageszeit ein eigenes Musikstück (sound/songs.ts), mit Raumhall.
 */
import { SR, VARIANTS, drum, makeSfx, renderNote, reverbIR, rainLoop, seaLoop, cricketLoop, windLoop, fireLoop, rng, type Drum, type Inst, type Sfx as Snd } from './sound/dsp';
import { SONGS, melodyMap, parseChord, parseMelody, songById, songEighths, stepEvents, type Song } from './sound/songs';

/** Geräusche, die das Spiel auslösen kann */
type Sfx =
  | 'nicker'
  | 'whistle'
  | 'coin'
  | 'mow'
  | 'brush'
  | 'neigh'
  | 'hoof'
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
  | 'level'
  | 'quest'
  | 'eat'
  | 'cook'
  | 'step'
  | 'click'
  | 'open'
  | 'sleep'
  | 'door'
  | 'nope';

const PREF_KEY = 'cozyisland.audio';
export const prefs = (() => {
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') as { music?: boolean; sound?: boolean; musicVol?: number; soundVol?: number };
    const vol = (v: unknown) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : 0.8);
    return { music: p.music !== false, sound: p.sound !== false, musicVol: vol(p.musicVol), soundVol: vol(p.soundVol) };
  } catch {
    return { music: true, sound: true, musicVol: 0.8, soundVol: 0.8 };
  }
})();
export function setPrefs(p: Partial<typeof prefs>) {
  Object.assign(prefs, p);
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  } catch {
    /* egal */
  }
  applyVolumes();
}
/** Lautstärken (an/aus × Regler) auf die Kanäle */
function applyVolumes() {
  if (!ac) return;
  const t = ac.currentTime;
  musicBus?.gain.setTargetAtTime(prefs.music ? 0.42 * prefs.musicVol : 0, t, 0.05);
  sfxBus?.gain.setTargetAtTime(prefs.sound ? prefs.soundVol : 0, t, 0.05);
  ambBus?.gain.setTargetAtTime(prefs.sound ? 0.8 * prefs.soundVol : 0, t, 0.05);
}

let ac: AudioContext | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let musicFade: GainNode | null = null;
let ambBus: GainNode | null = null;
let ambMuffle: BiquadFilterNode | null = null;
let revIn: GainNode | null = null;

/** beim ersten Tippen starten (Browser erlauben Ton erst nach einer Berührung) */
export function unlockAudio() {
  if (ac) {
    if (ac.state === 'suspended') void ac.resume();
    return;
  }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  // Kette: alles → leichter Kompressor (klingt runder, nichts übersteuert) → Lautsprecher
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 12;
  comp.ratio.value = 3;
  comp.attack.value = 0.01;
  comp.release.value = 0.25;
  const master = ac.createGain();
  master.gain.value = 0.95;
  master.connect(comp);
  comp.connect(ac.destination);
  sfxBus = ac.createGain();
  musicBus = ac.createGain();
  musicFade = ac.createGain();
  ambBus = ac.createGain();
  ambMuffle = ac.createBiquadFilter();
  ambMuffle.type = 'lowpass';
  ambMuffle.frequency.value = 18000;
  sfxBus.connect(master);
  musicFade.connect(musicBus);
  musicBus.connect(master);
  ambBus.connect(ambMuffle);
  ambMuffle.connect(master);
  // Raumhall (Musik und manche Geräusche schicken etwas davon hinein)
  // (der Hall muss die Abtastrate des Geräts haben → umrechnen)
  const k = ac.sampleRate / SR;
  const irData = reverbIR(2.4);
  const ir = ac.createBuffer(2, Math.round(irData[0].length * k), ac.sampleRate);
  irData.forEach((ch, c) => {
    const o = new Float32Array(ir.length);
    for (let i = 0; i < o.length; i++) {
      const p = i / k;
      const j = Math.floor(p);
      o[i] = (ch[j] ?? 0) + ((ch[j + 1] ?? 0) - (ch[j] ?? 0)) * (p - j);
    }
    ir.copyToChannel(o, c);
  });
  const conv = ac.createConvolver();
  conv.buffer = ir;
  revIn = ac.createGain();
  const revOut = ac.createGain();
  revOut.gain.value = 0.6;
  revIn.connect(conv);
  conv.connect(revOut);
  revOut.connect(master);
  applyVolumes();
  document.addEventListener('visibilitychange', () => {
    if (!ac) return;
    if (document.hidden) void ac.suspend();
    else void ac.resume();
  });
  // Umgebung und Musik nach und nach vorbereiten (ruckelt nicht)
  queue(startAmbience);
  queue(() => prepare(songById(wantSong())));
  musicTimer = window.setInterval(scheduleMusic, 60);
  ambTimer = window.setInterval(ambience, 250);
  // häufige Geräusche schon mal berechnen
  for (const s of ['click', 'stepGrass', 'stepSand', 'chop', 'coin', 'harvest', 'water', 'hoe', 'seed', 'quest'] as Snd[]) queue(() => void sample(s, 0));
}

// ---------- Vorbereiten in kleinen Häppchen ----------
const jobs: (() => void)[] = [];
let jobTimer = 0;
function queue(job: () => void) {
  jobs.push(job);
  if (!jobTimer) jobTimer = window.setTimeout(runJobs, 0);
}
function runJobs() {
  jobTimer = 0;
  const end = performance.now() + 8;
  while (jobs.length && performance.now() < end) jobs.shift()!();
  if (jobs.length) jobTimer = window.setTimeout(runJobs, 16);
}

// ---------- Klänge ----------
const bufs = new Map<string, AudioBuffer>();
function toBuf(data: Float32Array) {
  const b = ac!.createBuffer(1, data.length, SR);
  b.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
  return b;
}
function sample(name: Snd, v: number) {
  const k = `s:${name}:${v}`;
  let b = bufs.get(k);
  if (!b) bufs.set(k, (b = toBuf(makeSfx(name, v))));
  return b;
}
/**
 * Instrument-Ton: wie bei einem Sampler nur jeder dritte Halbton wird berechnet, die
 * Töne dazwischen entstehen durch leicht schnelleres/langsameres Abspielen (spart Speicher).
 */
function instBuf(inst: Inst, midi: number, dur = 1): { buf: AudioBuffer; rate: number } {
  const base = Math.round((midi - 1) / 3) * 3 + 1;
  // gehaltene Klänge (Fläche, Okarina) gibt es in ein paar Längen
  const db = inst === 'pad' || inst === 'ocarina' ? Math.max(1, Math.round(dur * 4)) / 4 : 1;
  const k = `i:${inst}:${base}:${db}`;
  let b = bufs.get(k);
  if (!b) bufs.set(k, (b = toBuf(renderNote(inst, base, db))));
  return { buf: b, rate: 2 ** ((midi - base) / 12) };
}
function drumBuf(d: Drum, v = 0) {
  const k = `d:${d}:${v}`;
  let b = bufs.get(k);
  if (!b) bufs.set(k, (b = toBuf(drum(d, v + 1))));
  return b;
}
function play(buf: AudioBuffer, o: { at?: number; gain?: number; rate?: number; pan?: number; bus?: AudioNode; rev?: number }) {
  if (!ac) return;
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = o.rate ?? 1;
  const g = ac.createGain();
  g.gain.value = o.gain ?? 1;
  src.connect(g);
  let out: AudioNode = g;
  if (o.pan && ac.createStereoPanner) {
    const p = ac.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, o.pan));
    g.connect(p);
    out = p;
  }
  out.connect(o.bus ?? sfxBus!);
  if (o.rev && revIn) {
    const s = ac.createGain();
    s.gain.value = o.rev;
    out.connect(s);
    s.connect(revIn);
  }
  src.start(o.at ?? ac.currentTime);
}

/** Grund-Lautstärke und Hall je Geräusch */
const MIX: Partial<Record<Snd, { g: number; rev?: number; pitch?: number }>> = {
  chop: { g: 0.75, rev: 0.12, pitch: 0.08 },
  fell: { g: 0.85, rev: 0.15 },
  hoe: { g: 0.6, pitch: 0.1 },
  seed: { g: 0.5, pitch: 0.1 },
  water: { g: 0.55, pitch: 0.06 },
  refill: { g: 0.55 },
  splash: { g: 0.6, rev: 0.1 },
  harvest: { g: 0.6, rev: 0.1, pitch: 0.04 },
  pick: { g: 0.5, pitch: 0.06 },
  build: { g: 0.7, rev: 0.15 },
  coin: { g: 0.45, rev: 0.15 },
  click: { g: 0.45, pitch: 0.05 },
  open: { g: 0.35 },
  nope: { g: 0.5 },
  quest: { g: 0.55, rev: 0.25 },
  level: { g: 0.6, rev: 0.25 },
  eat: { g: 0.55, pitch: 0.08 },
  cook: { g: 0.5, rev: 0.1 },
  stepGrass: { g: 0.22, pitch: 0.15 },
  stepSand: { g: 0.2, pitch: 0.15 },
  stepWood: { g: 0.28, pitch: 0.1 },
  hoof: { g: 0.35, pitch: 0.08 },
  nicker: { g: 0.5, rev: 0.1, pitch: 0.06 },
  neigh: { g: 0.45, rev: 0.15, pitch: 0.06 },
  whistle: { g: 0.45, rev: 0.15 },
  brush: { g: 0.45 },
  mow: { g: 0.5, pitch: 0.08 },
  door: { g: 0.5, rev: 0.05 },
  sleep: { g: 0.5, rev: 0.3 },
};
const rnd = rng(Date.now() % 100000);
let stepFlip = 0;

export function sfx(name: Sfx) {
  if (!ac || !prefs.sound) return;
  const s: Snd = name === 'step' ? (scene.ground === 'sand' ? 'stepSand' : scene.ground === 'wood' ? 'stepWood' : 'stepGrass') : name;
  if (name === 'step' || name === 'hoof') stepFlip++;
  const n = VARIANTS[s] ?? 1;
  const v = Math.floor(rnd() * n);
  const m = MIX[s] ?? { g: 0.5 };
  const pitch = m.pitch ? 1 + (rnd() - 0.5) * m.pitch : 1;
  const pan = name === 'step' || name === 'hoof' ? (stepFlip % 2 ? -0.12 : 0.12) : 0;
  play(sample(s, v), { gain: m.g, rate: pitch, pan, rev: m.rev });
}

// ---------- Umgebung ----------
interface Scene {
  night: number;
  rain: boolean;
  fire: number;
  inside: boolean;
  menu: boolean;
  /** Uhrzeit 0..24 (für die Musik) */
  hour: number;
  /** wie nah das Meer ist 0..1 */
  sea: number;
  /** Untergrund für Schritte */
  ground: 'grass' | 'sand' | 'wood';
  /** Fest gerade (Winterfest: Schlittenglöckchen in der Musik) */
  fest: 'halloween' | 'winter' | null;
}
const scene: Scene = { night: 0, rain: false, fire: 0, inside: false, menu: true, hour: 9, sea: 0.5, ground: 'grass', fest: null };
export function setScene(s: Partial<Scene>) {
  const wasInside = scene.inside;
  Object.assign(scene, s);
  if (ac && ambMuffle && wasInside !== scene.inside) ambMuffle.frequency.setTargetAtTime(scene.inside ? 700 : 18000, ac.currentTime, 0.15);
}

const loops: Record<'sea' | 'wind' | 'rain' | 'crickets' | 'fire', GainNode | null> = { sea: null, wind: null, rain: null, crickets: null, fire: null };
let ambTimer = 0;
function startAmbience() {
  if (!ac) return;
  const make = (key: keyof typeof loops, data: () => Float32Array) =>
    queue(() => {
      const src = ac!.createBufferSource();
      src.buffer = toBuf(data());
      src.loop = true;
      const g = ac!.createGain();
      g.gain.value = 0;
      src.connect(g);
      g.connect(ambBus!);
      src.start(ac!.currentTime, Math.random() * 2);
      loops[key] = g;
    });
  make('sea', () => seaLoop(16));
  make('wind', () => windLoop(10));
  make('crickets', () => cricketLoop(6));
  make('rain', () => rainLoop(6));
  make('fire', () => fireLoop(4));
}
function ambience() {
  if (!ac || !prefs.sound || ac.state !== 'running') return;
  const t = ac.currentTime;
  const set = (k: keyof typeof loops, v: number) => loops[k]?.gain.setTargetAtTime(v, t, 0.6);
  const out = !scene.menu;
  set('sea', scene.menu ? 0.16 : 0.07 + scene.sea * 0.22);
  set('wind', out ? 0.05 + (scene.rain ? 0.08 : 0) + (scene.inside ? 0 : 0.03) : 0.04);
  set('rain', scene.rain ? 0.3 : 0);
  set('crickets', out && !scene.inside && !scene.rain ? Math.max(0, scene.night - 0.4) * 0.22 : 0);
  set('fire', out && !scene.inside ? scene.fire * 0.35 : 0);
  if (scene.inside || scene.menu) return;
  const day = scene.night < 0.4 && !scene.rain;
  const pan = () => (rnd() - 0.5) * 1.4;
  if (day && rnd() < 0.07) play(sample('bird', Math.floor(rnd() * 6)), { gain: 0.1 + rnd() * 0.1, pan: pan(), rate: 0.9 + rnd() * 0.25, bus: ambBus!, rev: 0.25 });
  if (day && scene.hour < 11 && rnd() < 0.008) play(sample('dove', 0), { gain: 0.18, pan: pan(), bus: ambBus!, rev: 0.2 });
  if (day && scene.sea > 0.35 && rnd() < 0.018) play(sample('gull', Math.floor(rnd() * 2)), { gain: 0.12, pan: pan(), rate: 0.95 + rnd() * 0.1, bus: ambBus!, rev: 0.3 });
  if (scene.night > 0.7 && !scene.rain && rnd() < 0.006) play(sample('owl', 0), { gain: 0.14, pan: pan(), bus: ambBus!, rev: 0.35 });
  if (scene.night > 0.6 && scene.sea > 0.2 && rnd() < 0.015) play(sample('frog', 0), { gain: 0.1, pan: pan(), rate: 0.9 + rnd() * 0.2, bus: ambBus!, rev: 0.15 });
}

// ---------- Musik ----------
let musicTimer = 0;
let cur: Song | null = null;
let melody: Map<number, [number, number]> = new Map();
let step = 0;
let loopN = 0;
let nextAt = 0;
let switchAt = 0;
const ready = new Set<string>();
const preparing = new Set<string>();

function wantSong(): Song['id'] {
  if (scene.menu) return 'morning';
  if (scene.inside) return 'home';
  const h = scene.hour;
  return h >= 5 && h < 11 ? 'morning' : h >= 11 && h < 17 ? 'noon' : h >= 17 && h < 21 ? 'evening' : 'night';
}
/** alle Noten eines Lieds vorab berechnen (in Häppchen) */
function prepare(s: Song) {
  if (ready.has(s.id) || preparing.has(s.id)) return;
  preparing.add(s.id);
  const todo: (() => void)[] = [];
  const mel = parseMelody(s.melody);
  const e8 = 60 / s.bpm / 2;
  for (const [m, d] of mel) if (m >= 0) for (const inst of [s.lead, s.lead2]) todo.push(() => void instBuf(inst, m, d * e8));
  for (const c of s.chords) {
    const { root, tones } = parseChord(c);
    for (const tn of tones) {
      todo.push(() => void instBuf(s.compInst, root + 12 + tn, s.beats * 2 * e8));
      todo.push(() => void instBuf(s.compInst, root + 24 + tn, s.beats * 2 * e8));
      if (s.pad) todo.push(() => void instBuf('pad', root + 12 + tn, s.beats * 2 * e8));
    }
    todo.push(() => void instBuf('bass', root - 12));
    todo.push(() => void instBuf('bass', root - 5));
  }
  for (const d of ['shaker', 'kick', 'clave', 'jingle'] as Drum[]) todo.push(() => void drumBuf(d));
  for (const j of todo) queue(j);
  queue(() => {
    preparing.delete(s.id);
    ready.add(s.id);
  });
}
function begin(s: Song) {
  cur = s;
  melody = melodyMap(s);
  step = 0;
  loopN = 0;
  nextAt = ac!.currentTime + 0.15;
  musicFade!.gain.cancelScheduledValues(ac!.currentTime);
  musicFade!.gain.setTargetAtTime(1, ac!.currentTime, 0.4);
}
function scheduleMusic() {
  if (!ac || !musicFade || ac.state !== 'running') return;
  const now = ac.currentTime;
  const want = songById(wantSong());
  if (!ready.has(want.id)) prepare(want);
  // anderes Lied: erst leise ausblenden, dann wechseln
  if (cur?.id !== want.id) {
    if (!cur) {
      if (ready.has(want.id)) begin(want);
      return;
    }
    if (!switchAt) {
      switchAt = now + 2.2;
      musicFade.gain.setTargetAtTime(0, now, 0.5);
    }
    if (now >= switchAt && ready.has(want.id)) {
      switchAt = 0;
      begin(want);
    }
    if (switchAt) return;
  }
  if (!prefs.music || !cur) {
    nextAt = now + 0.1;
    return;
  }
  const s = cur;
  const e8 = 60 / s.bpm / 2;
  const total = songEighths(s);
  if (nextAt < now) nextAt = now + 0.05;
  while (nextAt < now + 0.3) {
    playStep(s, step, nextAt);
    nextAt += e8;
    step++;
    if (step >= total) {
      step = 0;
      loopN++;
    }
  }
}
function playStep(s: Song, st: number, at: number) {
  for (const e of stepEvents(s, melody, st, loopN, { rnd, rain: scene.rain, winter: scene.fest === 'winter' })) {
    const { buf, rate } = e.drum ? { buf: drumBuf(e.drum), rate: 1 } : instBuf(e.inst!, e.midi!, e.len ?? 1);
    play(buf, { at: at + e.dt, gain: e.gain, rate, pan: e.pan, rev: e.rev, bus: musicFade! });
  }
}

/** für Tests/Aufräumen */
export function stopAudio() {
  clearInterval(musicTimer);
  clearInterval(ambTimer);
  void ac?.close();
  ac = null;
}
/** zum Ausprobieren: alle Lieder */
export const SONG_IDS = SONGS.map((s) => s.id);
/** für Tests: Zustand der Ton-Engine */
export const audioInfo = () => ({ state: ac?.state ?? 'none', buffers: bufs.size, song: cur?.id ?? null, ready: [...ready], loops: Object.entries(loops).filter(([, g]) => g).map(([k]) => k) });
