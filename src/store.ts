/**
 * Der Vorrat der Insel an einer Stelle: Holz, Rüben, Obst, Heu, Fische, Gerichte,
 * Münzen. Projekte, Kochen und Bestellungen fragen hier, wie viel da ist, und
 * nehmen hier weg. (Stöcke und Steine trägt jeder Spieler selbst im Rucksack.)
 */
import type { Farm } from './farm';
import { FISH } from './fish';
import type { World } from './world';

/** Gerichte (gekocht am Lagerfeuer); Ofenrübe und Bratfisch gab es schon vorher */
export type DishId = 'obstsalat' | 'fischsuppe' | 'apfelkuchen' | 'marmelade';
export const DISH_IDS: DishId[] = ['obstsalat', 'fischsuppe', 'apfelkuchen', 'marmelade'];
export type StoreItem = 'wood' | 'turnip' | 'apple' | 'berry' | 'hay' | 'fish' | 'meal' | 'grilled' | 'coins' | DishId;

export const STORE_NAMES: Record<StoreItem, string> = {
  wood: 'Holz',
  turnip: 'Rüben',
  apple: 'Äpfel',
  berry: 'Beeren',
  hay: 'Heu',
  fish: 'Fische',
  meal: 'Ofenrüben',
  grilled: 'Bratfisch',
  coins: 'Münzen',
  obstsalat: 'Obstsalat',
  fischsuppe: 'Fischsuppe',
  apfelkuchen: 'Apfelkuchen',
  marmelade: 'Beerenmarmelade',
};
/** was ein Stück wert ist (für Belohnungen) */
export const STORE_VALUE: Record<StoreItem, number> = { wood: 1, turnip: 4, apple: 1, berry: 1, hay: 2, fish: 3, meal: 10, grilled: 8, coins: 1, obstsalat: 10, fischsuppe: 18, apfelkuchen: 22, marmelade: 16 };

/** Fische für Projekte, Kochen und Bestellungen: nur die häufigen (seltene sind zu schade) */
export const plainFish = (w: World) => FISH.filter((f) => f.cook).reduce((s, f) => s + (w.fish[f.id] ?? 0), 0);

export function storeHas(w: World, f: Farm, item: StoreItem): number {
  switch (item) {
    case 'wood':
      return w.wood;
    case 'turnip':
      return f.turnips;
    case 'apple':
      return w.apples;
    case 'berry':
      return w.berries;
    case 'hay':
      return f.hay;
    case 'fish':
      return plainFish(w);
    case 'meal':
      return f.meals;
    case 'grilled':
      return w.grilled;
    case 'coins':
      return w.coins;
    default:
      return w.dishes[item] ?? 0;
  }
}
/** wegnehmen (vorher mit storeHas geprüft) */
export function storeTake(w: World, f: Farm, item: StoreItem, n: number) {
  if (item === 'wood') w.wood -= n;
  else if (item === 'turnip') f.turnips -= n;
  else if (item === 'apple') w.apples -= n;
  else if (item === 'berry') w.berries -= n;
  else if (item === 'hay') f.hay -= n;
  else if (item === 'meal') f.meals -= n;
  else if (item === 'grilled') w.grilled -= n;
  else if (item === 'coins') w.coins -= n;
  else if (item === 'fish')
    for (const fi of FISH.filter((x) => x.cook))
      while (n > 0 && (w.fish[fi.id] ?? 0) > 0) {
        if (--w.fish[fi.id] <= 0) delete w.fish[fi.id];
        n--;
      }
  else if ((w.dishes[item] = (w.dishes[item] ?? 0) - n) <= 0) delete w.dishes[item];
  w.version++;
  f.version++;
}
/** dazulegen */
export function storeGive(w: World, f: Farm, item: StoreItem, n: number) {
  if (item === 'wood') w.wood += n;
  else if (item === 'turnip') f.turnips += n;
  else if (item === 'apple') w.apples += n;
  else if (item === 'berry') w.berries += n;
  else if (item === 'hay') f.hay += n;
  else if (item === 'meal') f.meals += n;
  else if (item === 'grilled') w.grilled += n;
  else if (item === 'coins') w.coins += n;
  else if (item === 'fish') w.fish.hering = (w.fish.hering ?? 0) + n;
  else w.dishes[item] = (w.dishes[item] ?? 0) + n;
  w.version++;
  f.version++;
}
/** reicht der Vorrat für alles? */
export const storeHasAll = (w: World, f: Farm, need: Partial<Record<StoreItem, number>>) => (Object.entries(need) as [StoreItem, number][]).every(([k, n]) => storeHas(w, f, k) >= n);
