/**
 * Fortschritt der Insel: Erfahrung (XP) für jede Aktion, Insel-Stufen mit neuen
 * Fähigkeiten und eine Kette von Aufgaben mit Belohnungen. Gehört zur Insel
 * (bei gemeinsamen Inseln levelt man also zusammen) und ist reine Logik.
 */

export type Stat = 'felled' | 'tilled' | 'planted' | 'watered' | 'harvested' | 'built' | 'wood';

export interface Progress {
  xp: number;
  stats: Partial<Record<Stat, number>>;
  /** so viele Aufgaben sind erledigt */
  quests: number;
}

export const newProgress = (): Progress => ({ xp: 0, stats: {}, quests: 0 });

export function cleanProgress(p: Partial<Progress> | undefined): Progress {
  const stats: Partial<Record<Stat, number>> = {};
  for (const [k, v] of Object.entries(p?.stats ?? {})) if (typeof v === 'number' && v >= 0) stats[k as Stat] = Math.floor(v);
  return { xp: Math.max(0, Math.floor(p?.xp ?? 0)), stats, quests: Math.max(0, Math.floor(p?.quests ?? 0)) };
}

/** XP je Aktion */
export const XP: Record<Exclude<Stat, 'wood'>, number> = { felled: 5, tilled: 2, planted: 1, watered: 1, harvested: 4, built: 25 };

/** XP bis Stufe L: 30 · L(L-1)/2 → 30, 90, 180, 300 … */
export const xpFor = (level: number) => (30 * level * (level - 1)) / 2;
export function levelOf(xp: number) {
  let l = 1;
  while (xp >= xpFor(l + 1)) l++;
  return l;
}
/** Fortschritt innerhalb der Stufe 0..1 */
export function levelProgress(xp: number) {
  const l = levelOf(xp);
  return (xp - xpFor(l)) / (xpFor(l + 1) - xpFor(l));
}

/** Was jede Stufe freischaltet (ab dieser Stufe) */
export const PERKS: { level: number; text: string }[] = [
  { level: 2, text: 'Bäume fallen einen Schlag schneller' },
  { level: 3, text: '+1 Holz pro Baum' },
  { level: 4, text: 'Kübel und Gießkanne fassen mehr' },
  { level: 5, text: 'Pflanzen wachsen schneller' },
  { level: 6, text: 'Jede Ernte gibt 2 Samen' },
  { level: 7, text: 'Bäume wachsen doppelt so schnell nach' },
  { level: 8, text: '+1 Holz pro Baum (insgesamt +2)' },
];
export const perks = (level: number) => ({
  chopFaster: level >= 2 ? 1 : 0,
  extraWood: (level >= 3 ? 1 : 0) + (level >= 8 ? 1 : 0),
  bigWater: level >= 4,
  growMul: level >= 5 ? 0.7 : 1,
  twoSeeds: level >= 6,
  regrowMul: level >= 7 ? 0.5 : 1,
});
/** Belohnung pro Stufenaufstieg */
export const LEVEL_SEEDS = 3;

export interface Quest {
  text: string;
  stat: Stat;
  goal: number;
  xp: number;
  seeds?: number;
  wood?: number;
}
const QUESTS: Quest[] = [
  { text: 'Fäll deinen ersten Baum', stat: 'felled', goal: 1, xp: 15, seeds: 2 },
  { text: 'Hacke 3 Felder', stat: 'tilled', goal: 3, xp: 15, seeds: 2 },
  { text: 'Säe 3 Rüben', stat: 'planted', goal: 3, xp: 10 },
  { text: 'Gieße 5-mal', stat: 'watered', goal: 5, xp: 10 },
  { text: 'Ernte 3 Rüben', stat: 'harvested', goal: 3, xp: 25, seeds: 3 },
  { text: 'Sammle 10 Holz', stat: 'wood', goal: 10, xp: 25 },
  { text: 'Bau dein erstes Haus', stat: 'built', goal: 1, xp: 50, seeds: 3 },
  { text: 'Ernte 10 Rüben', stat: 'harvested', goal: 10, xp: 50, seeds: 4 },
  { text: 'Fäll 8 Bäume', stat: 'felled', goal: 8, xp: 50, seeds: 2 },
  { text: 'Hacke 12 Felder', stat: 'tilled', goal: 12, xp: 50 },
  { text: 'Ernte 25 Rüben', stat: 'harvested', goal: 25, xp: 80, seeds: 5 },
  { text: 'Bau ein zweites Haus', stat: 'built', goal: 2, xp: 100, wood: 5 },
];
/** n-te Aufgabe; nach der Liste geht es mit immer größeren Ernte-/Holz-Zielen weiter */
export function questAt(n: number): Quest {
  if (n < QUESTS.length) return QUESTS[n];
  const k = n - QUESTS.length + 1;
  return k % 2
    ? { text: `Ernte ${25 + k * 15} Rüben`, stat: 'harvested', goal: 25 + k * 15, xp: 80 + k * 20, seeds: 5 }
    : { text: `Sammle ${40 + k * 20} Holz`, stat: 'wood', goal: 40 + k * 20, xp: 80 + k * 20, seeds: 3 };
}

export interface Gain {
  quests: Quest[];
  levels: number[];
}

/**
 * Aktion verbuchen: Statistik + XP, dann fertige Aufgaben einlösen und Aufstiege melden.
 * give() schreibt Belohnungen (Samen, Holz) gut.
 */
export function gain(p: Progress, stat: Stat, amount: number, give: (r: { seeds?: number; wood?: number }) => void): Gain {
  const before = levelOf(p.xp);
  p.stats[stat] = (p.stats[stat] ?? 0) + amount;
  if (stat !== 'wood') p.xp += XP[stat] * amount;
  const quests: Quest[] = [];
  for (let q = questAt(p.quests); (p.stats[q.stat] ?? 0) >= q.goal; q = questAt(p.quests)) {
    p.quests++;
    p.xp += q.xp;
    give(q);
    quests.push(q);
  }
  const after = levelOf(p.xp);
  const levels: number[] = [];
  for (let l = before + 1; l <= after; l++) {
    levels.push(l);
    give({ seeds: LEVEL_SEEDS });
  }
  return { quests, levels };
}
