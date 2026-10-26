/**
 * Erfolge: für alles, was man auf der Insel macht, gibt es Bronze, Silber und Gold
 * (mit ein paar Münzen). Zählt rückwirkend – wer schon viel gespielt hat, bekommt
 * seine Erfolge gleich. Gehört der Insel (Koop: zusammen). Reine Logik.
 */
import type { Farm } from './farm';
import { CROPS } from './farm';
import { FISH } from './fish';
import { LETTERS } from './beach';
import { PROJECTS } from './projects';
import type { Stat } from './progress';
import { albumCount } from './shop';
import { MAX_HEARTS, VILLAGERS } from './villagers';
import type { World } from './world';

export const TIERS = ['Bronze', 'Silber', 'Gold'] as const;
export const TIER_COINS = [10, 25, 60];
export interface Achievement {
  id: string;
  name: string;
  /** Text mit {n} für das Ziel */
  text: string;
  goals: [number, number, number];
  value: (w: World, f: Farm) => number;
}
const stat = (k: Stat) => (w: World) => w.prog.stats[k] ?? 0;
export const ACHIEVEMENTS: Achievement[] = [
  { id: 'felled', name: 'Holzfäller', text: 'Fäll {n} Bäume', goals: [10, 50, 200], value: stat('felled') },
  { id: 'harvest', name: 'Grüner Daumen', text: 'Ernte {n}-mal', goals: [10, 60, 250], value: stat('harvested') },
  { id: 'water', name: 'Wasserträger', text: 'Gieße {n}-mal', goals: [25, 150, 600], value: stat('watered') },
  { id: 'kinds', name: 'Bunte Felder', text: 'Ernte {n} verschiedene Pflanzen', goals: [2, 3, CROPS.length], value: (w) => w.album.crops?.length ?? 0 },
  { id: 'fruit', name: 'Obstpflücker', text: 'Sammle {n} Obst', goals: [20, 100, 400], value: stat('fruit') },
  { id: 'hay', name: 'Heumacher', text: 'Sammle {n} Heu', goals: [20, 100, 400], value: stat('hay') },
  { id: 'fish', name: 'Angler', text: 'Fang {n} Fische', goals: [5, 30, 120], value: stat('fish') },
  { id: 'species', name: 'Fischkenner', text: 'Fang {n} Fischarten', goals: [4, 8, FISH.length], value: (w) => w.album.fish?.length ?? 0 },
  { id: 'cook', name: 'Inselkoch', text: 'Koch {n}-mal', goals: [5, 30, 100], value: stat('cooked') },
  { id: 'orders', name: 'Lieferdienst', text: 'Liefer {n} Bestellungen', goals: [3, 15, 60], value: stat('orders') },
  { id: 'care', name: 'Pferdeflüsterer', text: 'Kümmer dich {n}-mal um Pferde', goals: [10, 60, 250], value: stat('cared') },
  { id: 'wishes', name: 'Gute Nachbarn', text: 'Erfüll {n} Wünsche', goals: [5, 25, 80], value: stat('wishes') },
  { id: 'friends', name: 'Beste Freunde', text: '{n} Bewohner mit allen Herzen', goals: [1, 3, VILLAGERS.length], value: (w) => w.villagers.filter((v) => v.hearts >= MAX_HEARTS).length },
  { id: 'beach', name: 'Strandläufer', text: 'Finde {n} Schätze am Strand', goals: [10, 60, 200], value: stat('shells') },
  { id: 'letters', name: 'Brieffreund', text: 'Lies {n} Flaschenposten', goals: [3, 10, LETTERS.length], value: stat('letters') },
  { id: 'projects', name: 'Baumeister', text: 'Schaff {n} Insel-Projekte', goals: [1, 3, PROJECTS.length], value: (w) => w.proj.n },
  { id: 'album', name: 'Sammler', text: 'Sammle {n} Album-Einträge', goals: [15, 35, 60], value: (w) => albumCount(w.album) },
  { id: 'fest', name: 'Festfreund', text: 'Finde {n} Fest-Überraschungen', goals: [5, 20, 60], value: stat('festfinds') },
  { id: 'stars', name: 'Inselstern', text: 'Erreich {n} Insel-Sterne', goals: [1, 3, 5], value: (w) => w.starsClaimed },
];
export const achievementById = (id: string) => ACHIEVEMENTS.find((a) => a.id === id);
/** erreichte Stufe (0 = noch nichts, 3 = Gold) */
export const tierOf = (a: Achievement, v: number) => a.goals.filter((g) => v >= g).length;
export const goalText = (a: Achievement, tier: number) => a.text.replace('{n}', String(a.goals[Math.min(2, tier)]));

export function cleanAchieved(x: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) if (achievementById(k) && typeof v === 'number' && v > 0) out[k] = Math.min(3, Math.floor(v));
  return out;
}

/** neu erreichte Stufen belohnen; gibt sie zurück */
export function claimAchievements(w: World, f: Farm): { id: string; tier: number }[] {
  const got: { id: string; tier: number }[] = [];
  for (const a of ACHIEVEMENTS) {
    const t = tierOf(a, a.value(w, f));
    while ((w.achieved[a.id] ?? 0) < t) {
      const k = (w.achieved[a.id] = (w.achieved[a.id] ?? 0) + 1);
      w.coins += TIER_COINS[k - 1];
      got.push({ id: a.id, tier: k });
    }
  }
  if (got.length) w.version++;
  return got;
}
