/**
 * Uhrzeit und Wetter der Insel. Die Zeit ergibt sich aus der echten Zeit plus einem
 * Versatz, der zur Insel gehört (Schlafen springt zum Morgen) – so sehen bei
 * gemeinsamen Inseln alle dieselbe Uhrzeit. Ein Inseltag dauert 12 Minuten.
 */
import { hash } from './island';

export const DAY_MS = 12 * 60_000;
const HOUR_MS = DAY_MS / 24;

export interface Clock {
  /** Versatz zur echten Zeit (ms) */
  offset: number;
  /** Tag-Nummer, an dem die Insel begann (für „Tag 1, 2, …“) */
  day0: number;
}

/** Uhr für eine neue Insel: es ist gerade 7 Uhr morgens an Tag 1 */
export function newClock(now: number): Clock {
  const target = 7 * HOUR_MS;
  const inDay = ((now % DAY_MS) + DAY_MS) % DAY_MS;
  const offset = target - inDay;
  return { offset, day0: Math.floor((now + offset) / DAY_MS) };
}

export interface TimeOfDay {
  /** 1, 2, … */
  day: number;
  /** 0..24 */
  hour: number;
  /** 0 = hell, 1 = tiefe Nacht */
  dark: number;
  /** Abend-/Morgenrot 0..1 */
  glow: number;
  night: boolean;
  rain: boolean;
  /** „14:20“ */
  label: string;
}

export function timeOf(clock: Clock, now: number): TimeOfDay {
  const t = now + clock.offset;
  const dayIdx = Math.floor(t / DAY_MS);
  const hour = ((((t % DAY_MS) + DAY_MS) % DAY_MS) / DAY_MS) * 24;
  // 19–21 Uhr dunkel werden, 5–7 Uhr hell werden
  let dark = 0;
  if (hour >= 21 || hour < 5) dark = 1;
  else if (hour >= 19) dark = (hour - 19) / 2;
  else if (hour < 7) dark = 1 - (hour - 5) / 2;
  const glow = hour >= 17.5 && hour < 21 ? Math.sin(((hour - 17.5) / 3.5) * Math.PI) : hour >= 5 && hour < 7.5 ? Math.sin(((hour - 5) / 2.5) * Math.PI) * 0.6 : 0;
  const hh = Math.floor(hour);
  const mm = Math.floor((hour - hh) * 6) * 10;
  return {
    day: dayIdx - clock.day0 + 1,
    hour,
    dark,
    glow,
    night: dark > 0.5,
    rain: rainAt(dayIdx, hour),
    label: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
  };
}

/** An manchen Tagen regnet es ein paar Stunden (für alle gleich) */
export function rainAt(dayIdx: number, hour: number) {
  if (hash(dayIdx, 7, 91) > 0.32) return false;
  const start = 8 + hash(dayIdx, 3, 17) * 9;
  const len = 2 + hash(dayIdx, 5, 23) * 3;
  return hour >= start && hour < start + len;
}

/** Schlafen: neuer Versatz, damit es danach 6 Uhr morgens ist */
export function sleepOffset(clock: Clock, now: number): number {
  const t = now + clock.offset;
  const inDay = ((t % DAY_MS) + DAY_MS) % DAY_MS;
  const six = 6 * HOUR_MS;
  const skip = inDay < six ? six - inDay : DAY_MS - inDay + six;
  return clock.offset + skip;
}

/** Nickerchen am Tag: zwei Stunden weiter */
export const napOffset = (clock: Clock) => clock.offset + 2 * HOUR_MS;
export const sleepyHour = (h: number) => h >= 17 || h < 6;
