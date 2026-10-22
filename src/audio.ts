/**
 * Töne und Musik – alles live erzeugt (Web Audio), keine Dateien.
 * Effekte für jede Aktion, ruhige Chiptune-Musik (nachts langsamer und sanfter),
 * Umgebung: Meeresrauschen, Vögel am Tag, Grillen in der Nacht, Regen, knisterndes Feuer.
 */

type Sfx =
  | 'neigh'
  | 'hoof'
  | 'chop'
  | 'fell'
  | 'hoe'
  | 'seed'
  | 'water'
  | 'refill'
  | 'harvest'
  | 'build'
  | 'level'
  | 'quest'
  | 'eat'
  | 'cook'
  | 'step'
  | 'click'
  | 'sleep'
  | 'door'
  | 'nope';

const PREF_KEY = 'cozyisland.audio';
export const prefs = (() => {
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') as { music?: boolean; sound?: boolean };
    return { music: p.music !== false, sound: p.sound !== false };
  } catch {
    return { music: true, sound: true };
  }
})();
export function setPrefs(p: Partial<typeof prefs>) {
  Object.assign(prefs, p);
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  } catch {
    /* egal */
  }
  if (musicBus) musicBus.gain.value = prefs.music ? 0.32 : 0;
  if (sfxBus) sfxBus.gain.value = prefs.sound ? 0.8 : 0;
  if (ambBus) ambBus.gain.value = prefs.sound ? 0.55 : 0;
}

let ac: AudioContext | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let ambBus: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

/** beim ersten Tippen starten (Browser erlauben Ton erst nach einer Berührung) */
export function unlockAudio() {
  if (ac) {
    if (ac.state === 'suspended') void ac.resume();
    return;
  }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  const master = ac.createGain();
  master.gain.value = 0.9;
  master.connect(ac.destination);
  sfxBus = ac.createGain();
  musicBus = ac.createGain();
  ambBus = ac.createGain();
  for (const b of [sfxBus, musicBus, ambBus]) b.connect(master);
  // sanftes Echo für die Musik
  const delay = ac.createDelay();
  delay.delayTime.value = 0.33;
  const fb = ac.createGain();
  fb.gain.value = 0.25;
  const wet = ac.createGain();
  wet.gain.value = 0.3;
  musicIn = ac.createGain();
  musicIn.connect(musicBus);
  musicIn.connect(delay);
  delay.connect(fb);
  fb.connect(delay);
  delay.connect(wet);
  wet.connect(musicBus);
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  setPrefs({});
  startAmbience();
  musicTimer = window.setInterval(scheduleMusic, 100);
  document.addEventListener('visibilitychange', () => {
    if (!ac) return;
    if (document.hidden) void ac.suspend();
    else void ac.resume();
  });
}
let musicIn: GainNode | null = null;

// ---------- Bausteine ----------
function tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; to?: number; at?: number; bus?: AudioNode; attack?: number } = {}) {
  if (!ac) return;
  const t = opts.at ?? ac.currentTime;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = opts.type ?? 'square';
  o.frequency.setValueAtTime(freq, t);
  if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
  const v = opts.vol ?? 0.2;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + (opts.attack ?? 0.008));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(opts.bus ?? sfxBus!);
  o.start(t);
  o.stop(t + dur + 0.02);
}
function noise(dur: number, opts: { freq?: number; type?: BiquadFilterType; vol?: number; at?: number; q?: number; bus?: AudioNode; attack?: number } = {}) {
  if (!ac || !noiseBuf) return;
  const t = opts.at ?? ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ac.createBiquadFilter();
  f.type = opts.type ?? 'lowpass';
  f.frequency.value = opts.freq ?? 1500;
  f.Q.value = opts.q ?? 0.8;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(opts.vol ?? 0.3, t + (opts.attack ?? 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(opts.bus ?? sfxBus!);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.05);
}

let stepAlt = false;
export function sfx(name: Sfx) {
  if (!ac || !prefs.sound) return;
  const t = ac.currentTime;
  switch (name) {
    case 'chop':
      noise(0.09, { freq: 1100, type: 'bandpass', vol: 0.5, q: 1.5 });
      tone(150, 0.12, { to: 80, type: 'square', vol: 0.12 });
      break;
    case 'fell':
      noise(0.18, { freq: 2500, type: 'highpass', vol: 0.4 });
      noise(0.9, { freq: 2200, vol: 0.25, at: t + 0.1, attack: 0.2 });
      tone(70, 0.4, { to: 40, type: 'sine', vol: 0.5, at: t + 0.45 });
      break;
    case 'hoe':
      noise(0.12, { freq: 500, vol: 0.5 });
      tone(120, 0.1, { to: 70, type: 'triangle', vol: 0.2 });
      break;
    case 'seed':
      tone(900, 0.07, { to: 1300, type: 'sine', vol: 0.12 });
      tone(1300, 0.06, { to: 1700, type: 'sine', vol: 0.08, at: t + 0.06 });
      break;
    case 'water':
      noise(0.45, { freq: 2600, type: 'bandpass', vol: 0.25, q: 0.6, attack: 0.05 });
      for (let i = 0; i < 4; i++) tone(500 + Math.random() * 500, 0.05, { type: 'sine', vol: 0.06, at: t + 0.08 + i * 0.08 });
      break;
    case 'refill':
      for (let i = 0; i < 6; i++) tone(300 + i * 90 + Math.random() * 60, 0.06, { to: 600 + i * 90, type: 'sine', vol: 0.1, at: t + i * 0.06 });
      break;
    case 'harvest':
      tone(280, 0.08, { to: 560, type: 'square', vol: 0.12 });
      tone(1047, 0.18, { type: 'triangle', vol: 0.12, at: t + 0.07 });
      tone(1319, 0.25, { type: 'triangle', vol: 0.1, at: t + 0.14 });
      break;
    case 'build':
      for (let i = 0; i < 3; i++) {
        noise(0.05, { freq: 1800, type: 'bandpass', vol: 0.45, at: t + i * 0.16 });
        tone(200, 0.07, { to: 120, type: 'square', vol: 0.1, at: t + i * 0.16 });
      }
      break;
    case 'level':
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.28, { type: 'square', vol: 0.09, at: t + i * 0.09 }));
      tone(1568, 0.6, { type: 'triangle', vol: 0.1, at: t + 0.45 });
      break;
    case 'quest':
      tone(784, 0.16, { type: 'triangle', vol: 0.14 });
      tone(1175, 0.3, { type: 'triangle', vol: 0.12, at: t + 0.12 });
      break;
    case 'eat':
      for (let i = 0; i < 3; i++) noise(0.06, { freq: 1600, type: 'bandpass', vol: 0.35, q: 2, at: t + i * 0.12 });
      break;
    case 'cook':
      noise(0.8, { freq: 3500, type: 'highpass', vol: 0.18, attack: 0.1 });
      tone(660, 0.12, { type: 'triangle', vol: 0.08, at: t + 0.5 });
      break;
    case 'step':
      stepAlt = !stepAlt;
      noise(0.04, { freq: stepAlt ? 700 : 550, vol: 0.06 });
      break;
    case 'neigh':
      // Wiehern: hoher Ton mit schnellem Zittern, fällt ab
      for (let i = 0; i < 9; i++) tone(900 - i * 55 + (i % 2) * 120, 0.07, { type: 'sawtooth', vol: 0.06, at: t + i * 0.055 });
      noise(0.5, { freq: 1800, type: 'bandpass', vol: 0.08, q: 2, at: t + 0.05 });
      tone(260, 0.25, { to: 180, type: 'square', vol: 0.05, at: t + 0.5 });
      break;
    case 'hoof':
      // Klapp-klapp
      stepAlt = !stepAlt;
      tone(stepAlt ? 520 : 430, 0.035, { type: 'square', vol: 0.05 });
      noise(0.03, { freq: stepAlt ? 1400 : 1100, type: 'bandpass', vol: 0.18, q: 3 });
      break;
    case 'click':
      tone(700, 0.04, { type: 'square', vol: 0.06 });
      break;
    case 'sleep':
      [784, 659, 523, 392].forEach((f, i) => tone(f, 0.5, { type: 'triangle', vol: 0.1, at: t + i * 0.35, attack: 0.05 }));
      break;
    case 'door':
      tone(320, 0.35, { to: 210, type: 'sawtooth', vol: 0.04 });
      noise(0.06, { freq: 900, type: 'bandpass', vol: 0.3, at: t + 0.3 });
      break;
    case 'nope':
      tone(200, 0.12, { to: 150, type: 'square', vol: 0.08 });
      break;
  }
}

// ---------- Umgebung ----------
interface Scene {
  night: number;
  rain: boolean;
  fire: number;
  inside: boolean;
  menu: boolean;
}
const scene: Scene = { night: 0, rain: false, fire: 0, inside: false, menu: true };
let rainGain: GainNode | null = null;
let seaGain: GainNode | null = null;
let ambTimer = 0;
function loopNoise(freq: number, type: BiquadFilterType) {
  const src = ac!.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ac!.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = ac!.createGain();
  g.gain.value = 0;
  src.connect(f);
  f.connect(g);
  g.connect(ambBus!);
  src.start();
  return g;
}
function startAmbience() {
  rainGain = loopNoise(1300, 'lowpass');
  seaGain = loopNoise(500, 'lowpass');
  ambTimer = window.setInterval(() => {
    if (!ac || !prefs.sound) return;
    const t = ac.currentTime;
    // Meer: langsames An- und Abschwellen
    seaGain!.gain.setTargetAtTime((scene.inside ? 0.02 : 0.07) * (0.6 + 0.4 * Math.sin(t * 0.5)), t, 0.8);
    rainGain!.gain.setTargetAtTime(scene.rain ? (scene.inside ? 0.12 : 0.3) : 0, t, 1);
    if (scene.inside || scene.menu) return;
    // Vögel am Tag, Grillen in der Nacht
    if (scene.night < 0.4 && !scene.rain && Math.random() < 0.12) {
      const base = 2200 + Math.random() * 1400;
      for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++)
        tone(base, 0.07, { to: base * 1.3, type: 'sine', vol: 0.04, at: t + i * 0.11, bus: ambBus! });
    }
    if (scene.night > 0.6 && Math.random() < 0.5)
      for (let i = 0; i < 3; i++) tone(4300, 0.03, { type: 'sine', vol: 0.025, at: t + i * 0.06, bus: ambBus! });
    // Feuer knistert
    for (let i = 0; i < Math.round(scene.fire * 4); i++)
      if (Math.random() < 0.6) noise(0.02, { freq: 3000 + Math.random() * 2000, type: 'bandpass', vol: 0.12 * scene.fire, at: t + Math.random() * 0.2, bus: ambBus! });
  }, 250);
}

export function setScene(s: Partial<Scene>) {
  Object.assign(scene, s);
}

// ---------- Musik ----------
let musicTimer = 0;
let nextBeat = 0;
let beat = 0;
const DAY_CHORDS = [
  [48, 52, 55],
  [45, 48, 52],
  [41, 45, 48],
  [43, 47, 50],
]; // C Am F G
const NIGHT_CHORDS = [
  [45, 48, 52],
  [41, 45, 48],
  [48, 52, 55],
  [43, 47, 50],
]; // Am F C G
const PENTA = [0, 2, 4, 7, 9];
const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);
let melodyNote = 2;
function scheduleMusic() {
  if (!ac || !musicIn || !prefs.music) {
    if (ac) nextBeat = ac.currentTime + 0.1;
    return;
  }
  const night = scene.night > 0.5;
  const bpm = night ? 64 : 84;
  const step = 60 / bpm / 2; // Achtel
  if (nextBeat < ac.currentTime) nextBeat = ac.currentTime + 0.05;
  while (nextBeat < ac.currentTime + 0.3) {
    const bar = Math.floor(beat / 8);
    const inBar = beat % 8;
    const chords = night ? NIGHT_CHORDS : DAY_CHORDS;
    const chord = chords[bar % 4];
    const vol = scene.menu ? 0.8 : 1;
    // Bass auf 1 und 5
    if (inBar === 0 || inBar === 4) tone(mtof(chord[0] - 12), step * 3.5, { type: 'triangle', vol: 0.18 * vol, at: nextBeat, bus: musicIn, attack: 0.02 });
    // weiche Akkord-Fläche am Taktanfang
    if (inBar === 0) for (const n of chord) tone(mtof(n + 12), step * 7.5, { type: 'sine', vol: 0.035 * vol, at: nextBeat, bus: musicIn, attack: 0.3 });
    // Melodie: Pentatonik, kleine Schritte, Pausen
    const rest = night ? 0.55 : 0.35;
    if (Math.random() > rest) {
      melodyNote = Math.max(0, Math.min(9, melodyNote + Math.floor(Math.random() * 5) - 2));
      const n = 72 + PENTA[melodyNote % 5] + 12 * Math.floor(melodyNote / 5) - (night ? 12 : 0);
      tone(mtof(n), step * (night ? 1.8 : 1.2), { type: night ? 'triangle' : 'square', vol: (night ? 0.05 : 0.035) * vol, at: nextBeat, bus: musicIn, attack: 0.01 });
    }
    nextBeat += step;
    beat++;
  }
}

/** für Tests/Aufräumen */
export function stopAudio() {
  clearInterval(musicTimer);
  clearInterval(ambTimer);
  void ac?.close();
  ac = null;
}
