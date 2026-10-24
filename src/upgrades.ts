/**
 * Verbesserungen für Münzen und Material: jedes Werkzeug gibt es in Eisen und Gold,
 * dazu Wanderschuhe (schneller laufen) und Hufeisen (schneller reiten). Gehören wie
 * die Werkzeuge dem Spieler selbst (Rucksack); bezahlt wird mit Münzen und Holz der
 * Insel und Steinen aus dem eigenen Rucksack. Reine Logik.
 */
import type { Bag, ToolKind } from './craft';

export type UpgradeId = ToolKind | 'shoes' | 'hooves';
export interface UpLevel {
  name: string;
  text: string;
  coins: number;
  stones: number;
  wood: number;
  /** ab dieser Insel-Stufe */
  level: number;
}
export interface Upgrade {
  id: UpgradeId;
  /** braucht dieses Werkzeug */
  tool?: ToolKind;
  levels: [UpLevel, UpLevel];
}
const iron = (name: string, text: string, coins = 25, stones = 4, wood = 0): UpLevel => ({ name, text, coins, stones, wood, level: 1 });
const gold = (name: string, text: string, coins = 80, stones = 8, wood = 6): UpLevel => ({ name, text, coins, stones, wood, level: 4 });
export const UPGRADES: Upgrade[] = [
  { id: 'axe', tool: 'axe', levels: [iron('Eisenaxt', 'Bäume fallen einen Schlag schneller.'), gold('Goldaxt', 'Noch ein Schlag schneller und +1 Holz pro Baum.')] },
  { id: 'hoe', tool: 'hoe', levels: [iron('Eisenhacke', 'Hackt 2 Felder auf einmal.'), gold('Goldhacke', 'Hackt 3 Felder auf einmal.')] },
  { id: 'water', tool: 'water', levels: [iron('Brause', 'Gießt 2 Felder auf einmal.', 20, 2, 2), gold('Regenbrause', 'Gießt 3 Felder auf einmal.', 70, 6, 6)] },
  { id: 'scythe', tool: 'scythe', levels: [iron('Eisensense', 'Mäht 3 Stück Wiese nebeneinander.'), gold('Goldsense', 'Mäht 6 Stück Wiese auf einmal.')] },
  { id: 'rod', tool: 'rod', levels: [iron('Profi-Angel', 'Fische beißen schneller, und du hast länger Zeit zum Tippen.', 30, 2, 2), gold('Goldangel', 'Seltene Fische beißen viel öfter.', 90, 4, 6)] },
  { id: 'shoes', levels: [iron('Wanderschuhe', 'Du läufst schneller.', 30, 2, 4), gold('Siebenmeilenstiefel', 'Du läufst noch schneller.', 90, 6, 8)] },
  { id: 'hooves', levels: [iron('Hufeisen', 'Pferde laufen schneller, wenn du reitest.', 35, 6, 0), gold('Goldene Hufeisen', 'Pferde laufen noch schneller.', 100, 10, 0)] },
];
export const upgradeById = (id: string) => UPGRADES.find((u) => u.id === id);
export const MAX_UP = 2;

/** Stufe eines Spielers (0 = normal, 1 = Eisen, 2 = Gold) */
export const upLevel = (b: Bag, id: UpgradeId) => b.up?.[id] ?? 0;

/** Tempo-Faktoren */
export const SHOE_SPEED = [1, 1.15, 1.3];
export const HOOF_SPEED = [1, 1.15, 1.3];
/** Angel: Wartezeit bis zum Biss und Zeit zum Tippen */
export const ROD_DELAY = [1, 0.6, 0.6];
export const ROD_WINDOW = [0, 600, 600];

/** Warum (noch) nicht? null = geht. coins/wood = Insel-Vorrat, level = Insel-Stufe */
export function upgradeBlock(b: Bag, id: string, have: { coins: number; wood: number; level: number }): string | null {
  const u = upgradeById(id);
  if (!u) return 'Gibt es nicht';
  const lv = upLevel(b, u.id);
  if (lv >= MAX_UP) return 'Schon ganz verbessert';
  if (u.tool && !b.tools.includes(u.tool)) return 'Dafür brauchst du erst das Werkzeug';
  const next = u.levels[lv];
  if (have.level < next.level) return `Ab Insel-Stufe ${next.level}`;
  if (have.coins < next.coins) return 'Zu wenig Münzen';
  if (have.wood < next.wood) return 'Zu wenig Holz';
  if (b.stones < next.stones) return 'Zu wenig Steine';
  return null;
}
/** was die nächste Stufe kostet (null = fertig) */
export const nextLevel = (b: Bag, id: UpgradeId) => {
  const u = upgradeById(id);
  return u ? (u.levels[upLevel(b, id)] ?? null) : null;
};
/** Verbessert: Steine abziehen, Stufe hoch (Münzen und Holz zieht die Insel-Aktion ab) */
export function bagUpgrade(b: Bag, id: UpgradeId) {
  const next = nextLevel(b, id);
  if (!next) return;
  b.stones -= next.stones;
  b.up = { ...b.up, [id]: upLevel(b, id) + 1 };
}
