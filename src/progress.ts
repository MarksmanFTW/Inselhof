/**
 * Fortschritt der Insel: Erfahrung (XP) für jede Aktion, Insel-Stufen mit neuen
 * Fähigkeiten und eine Kette von Aufgaben mit Belohnungen. Gehört zur Insel
 * (bei gemeinsamen Inseln levelt man also zusammen) und ist reine Logik.
 */

export type Stat =
  | 'felled'
  | 'tilled'
  | 'planted'
  | 'watered'
  | 'harvested'
  | 'built'
  | 'wood'
  | 'adopted'
  | 'mowed'
  | 'cared'
  // seit dem Tutorial: aufsammeln, basteln, Lagerfeuer, kochen, Heu, Stall
  | 'sticks'
  | 'stones'
  | 'crafted'
  | 'bucket'
  | 'scythe'
  | 'fire'
  | 'cooked'
  | 'hay'
  | 'stable'
  // Obst gesammelt (Stück)
  | 'fruit';

export interface Progress {
  xp: number;
  stats: Partial<Record<Stat, number>>;
  /** so viele Aufgaben sind erledigt */
  quests: number;
  /**
   * Version der Aufgabenliste: fehlt = ursprüngliche Liste, 2 = mit Tutorial am
   * Anfang (kurz im Oktober 2026), 3 = ausgebaut, Tutorial gehört jedem Spieler selbst
   */
  v?: number;
}

export const QUEST_V = 3;
export const newProgress = (): Progress => ({ xp: 0, stats: {}, quests: 0, v: QUEST_V });

/**
 * Fortschritt aus dem Spielstand; ältere Aufgabenlisten werden umgerechnet.
 * legacy = Spielstand von vor dem Tutorial (hatte alle Werkzeuge, Lagerfeuer/Stall zählen).
 */
export function cleanProgress(p: Partial<Progress> | undefined, legacy?: { fires: number; stables: number }): Progress {
  const stats: Partial<Record<Stat, number>> = {};
  for (const [k, v] of Object.entries(p?.stats ?? {})) if (typeof v === 'number' && v >= 0) stats[k as Stat] = Math.floor(v);
  const out: Progress = { xp: Math.max(0, Math.floor(p?.xp ?? 0)), stats, quests: Math.max(0, Math.floor(p?.quests ?? 0)), v: QUEST_V };
  const n = out.quests;
  if (p?.v === 2) out.quests = Math.max(0, n - V2_TUTORIAL);
  else if (p?.v === undefined && legacy) {
    out.quests = n < OLD_TO_NEW.length ? OLD_TO_NEW[n] : n - OLD_TO_NEW.length + QUESTS.length;
    // was man damals schon hatte, zählt als erledigt
    const atLeast = (k: Stat, v: number) => (stats[k] = Math.max(stats[k] ?? 0, v));
    atLeast('crafted', 4);
    atLeast('bucket', 1);
    atLeast('scythe', 1);
    atLeast('fire', legacy.fires);
    atLeast('stable', legacy.stables);
  }
  return out;
}

/** XP je Aktion */
export const XP: Record<Exclude<Stat, 'wood'>, number> = {
  felled: 5,
  tilled: 2,
  planted: 1,
  watered: 1,
  harvested: 4,
  built: 25,
  adopted: 20,
  mowed: 1,
  cared: 2,
  sticks: 0,
  stones: 0,
  crafted: 2,
  bucket: 0,
  scythe: 0,
  fire: 10,
  cooked: 2,
  hay: 0,
  stable: 20,
  fruit: 0,
};

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
  /** Münzen für den Händler */
  coins?: number;
  /** Erklärung (beim Antippen der Aufgabe) */
  hint?: string;
}
const QUESTS: Quest[] = [
  // (vorher macht jeder Spieler sein eigenes Tutorial, siehe craft.ts)
  { text: 'Fäll deinen ersten Baum', stat: 'felled', goal: 1, xp: 15, seeds: 2, hint: 'Wähl die Axt, stell dich an einen Baum und halte den grünen Knopf.' },
  { text: 'Hacke 3 Felder', stat: 'tilled', goal: 3, xp: 15, seeds: 2, hint: 'Wähl die Hacke und stell dich vor ein freies Stück Wiese.' },
  { text: 'Säe 3 Rüben', stat: 'planted', goal: 3, xp: 10, hint: 'Wähl die Samen und stell dich vor ein gehacktes Feld.' },
  { text: 'Bastle einen Holzkübel', stat: 'bucket', goal: 1, xp: 15, hint: 'Unter „Basteln“ – kostet 4 Holz. Damit schöpfst du am Wasser und gießt deine Felder.' },
  { text: 'Gieße 5-mal', stat: 'watered', goal: 5, xp: 10, hint: 'Pflanzen wachsen nur, wenn ihr Feld gegossen ist. Leer? Stell dich ans Wasser.' },
  { text: 'Bau ein Lagerfeuer', stat: 'fire', goal: 1, xp: 15, hint: 'Unter „Bauen“ – kostet 3 Holz. Daran kannst du Rüben braten.' },
  { text: 'Ernte 3 Rüben', stat: 'harvested', goal: 3, xp: 25, seeds: 3, coins: 5, hint: 'Nach dreimal Gießen ist eine Rübe reif. Rüben kannst du essen, wenn du müde bist.' },
  { text: 'Brate 2 Ofenrüben', stat: 'cooked', goal: 2, xp: 15, hint: 'Stell dich mit Rüben ans Lagerfeuer. Ofenrüben geben viel mehr Kraft.' },
  { text: 'Sammle 10 Holz', stat: 'wood', goal: 10, xp: 25 },
  { text: 'Bau dein erstes Haus', stat: 'built', goal: 1, xp: 50, seeds: 3, coins: 10, hint: 'Unter „Bauen“ – kostet 10 Holz. Im Bett schläfst du dich wieder fit.' },
  { text: 'Bastle eine Sense', stat: 'scythe', goal: 1, xp: 15, hint: 'Unter „Basteln“: 2 Stöcke, 2 Steine und 2 Holz.' },
  { text: 'Mähe 6 Stück Wiese', stat: 'mowed', goal: 6, xp: 15, hint: 'Gemähtes Gras trocknet zu Heu.' },
  { text: 'Sammle 6 Heu', stat: 'hay', goal: 6, xp: 20, coins: 5, hint: 'Wenn das gemähte Gras gelb ist, sammelst du es ein. Pferde lieben Heu.' },
  { text: 'Ernte 10 Rüben', stat: 'harvested', goal: 10, xp: 50, seeds: 4 },
  { text: 'Fäll 8 Bäume', stat: 'felled', goal: 8, xp: 50, seeds: 2 },
  { text: 'Bau einen Pferdestall', stat: 'stable', goal: 1, xp: 40, coins: 10, hint: 'Unter „Bauen“. Dort ziehen deine Pferde ein.' },
  { text: 'Nimm dein erstes Pferd auf', stat: 'adopted', goal: 1, xp: 30, hint: 'Geh an die Stalltür – Pferde kosten Rüben.' },
  { text: 'Hacke 12 Felder', stat: 'tilled', goal: 12, xp: 50 },
  { text: 'Kümmere dich 5-mal um deine Pferde', stat: 'cared', goal: 5, xp: 40, coins: 10, hint: 'Füttern, Leckerli geben oder bürsten – jedes einmal am Tag.' },
  { text: 'Ernte 25 Rüben', stat: 'harvested', goal: 25, xp: 80, seeds: 5, coins: 15 },
  { text: 'Bau ein zweites Haus', stat: 'built', goal: 2, xp: 100, wood: 5 },
];
/** ursprüngliche Liste: Aufgabe Nr. n → Nummer in der neuen Liste */
const OLD_TO_NEW = [0, 1, 2, 4, 6, 8, 9, 13, 14, 17, 19, 20];
/** Liste v2 hatte vorne drei Tutorial-Aufgaben */
const V2_TUTORIAL = 3;
/** n-te Aufgabe; nach der Liste geht es mit immer größeren Ernte-/Holz-Zielen weiter */
export function questAt(n: number): Quest {
  if (n < QUESTS.length) return QUESTS[n];
  const k = n - QUESTS.length + 1;
  return k % 2
    ? { text: `Ernte ${25 + k * 15} Rüben`, stat: 'harvested', goal: 25 + k * 15, xp: 80 + k * 20, seeds: 5, coins: 10 }
    : { text: `Sammle ${40 + k * 20} Holz`, stat: 'wood', goal: 40 + k * 20, xp: 80 + k * 20, seeds: 3, coins: 10 };
}
export interface Gain {
  quests: Quest[];
  levels: number[];
}

/**
 * Aktion verbuchen: Statistik + XP, dann fertige Aufgaben einlösen und Aufstiege melden.
 * give() schreibt Belohnungen (Samen, Holz, Münzen) gut.
 */
export function gain(p: Progress, stat: Stat, amount: number, give: (r: { seeds?: number; wood?: number; coins?: number }) => void): Gain {
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
