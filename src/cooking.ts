/**
 * Kochen am Lagerfeuer: Rezepte verbinden Felder, Obst und Angeln. Drei kennt man
 * von Anfang an, sechs weitere gibt es als Belohnung am Bestellbrett. Gerichte geben
 * viel Kraft und bringen beim Händler mehr als die Zutaten. Reine Logik.
 */
import type { Farm } from './farm';
import { DISH_IDS, storeGive, storeHasAll, storeTake, type DishId, type StoreItem } from './store';
import type { World } from './world';

export interface Recipe {
  /** was dabei herauskommt (Ofenrübe = 'meal', Bratfisch = 'grilled', sonst ein Gericht) */
  id: 'meal' | 'grilled' | DishId;
  name: string;
  text: string;
  need: Partial<Record<StoreItem, number>>;
  energy: number;
  price: number;
  /** von Anfang an bekannt */
  known?: boolean;
}
export const COOK: Recipe[] = [
  { id: 'meal', name: 'Ofenrübe', text: 'Eine Rübe in der Glut gebacken.', need: { turnip: 1 }, energy: 40, price: 10, known: true },
  { id: 'grilled', name: 'Bratfisch', text: 'Knusprig über dem Feuer.', need: { fish: 1 }, energy: 30, price: 8, known: true },
  { id: 'obstsalat', name: 'Obstsalat', text: 'Frische Äpfel und Beeren.', need: { apple: 2, berry: 2 }, energy: 35, price: 10, known: true },
  { id: 'fischsuppe', name: 'Fischsuppe', text: 'Wärmt von innen – mit Rüben und Fisch.', need: { fish: 1, turnip: 2 }, energy: 60, price: 18 },
  { id: 'apfelkuchen', name: 'Apfelkuchen', text: 'Süß, saftig und duftet über die ganze Insel.', need: { apple: 4, berry: 1, turnip: 1 }, energy: 70, price: 22 },
  { id: 'marmelade', name: 'Beerenmarmelade', text: 'Ein ganzes Glas voller Sommer.', need: { berry: 6 }, energy: 25, price: 16 },
  { id: 'karottenkuchen', name: 'Karottenkuchen', text: 'Saftig, mit Zuckerguss obendrauf.', need: { carrot: 3, apple: 2 }, energy: 50, price: 20 },
  { id: 'erdbeertorte', name: 'Erdbeertorte', text: 'Rot, süß und ein bisschen festlich.', need: { strawberry: 6, apple: 1 }, energy: 60, price: 26 },
  { id: 'kuerbissuppe', name: 'Kürbissuppe', text: 'Cremig und orange – wärmt an kalten Tagen.', need: { pumpkin: 1, turnip: 1 }, energy: 70, price: 30 },
];
export const recipeById = (id: string) => COOK.find((r) => r.id === id);
/** Rezepte, die man am Bestellbrett bekommt – in dieser Reihenfolge */
export const LEARNABLE = COOK.filter((r) => !r.known).map((r) => r.id as DishId);
export const knows = (w: World, id: string) => !!recipeById(id)?.known || w.recipes.includes(id);
export const isDish = (id: string): id is DishId => DISH_IDS.includes(id as DishId);

/** Kochen am Feuer (Fehlertext oder null) */
export function cook(w: World, f: Farm, id: string) {
  const r = recipeById(id);
  if (!r) return 'Gibt es nicht';
  if (!knows(w, id)) return 'Dieses Rezept kennst du noch nicht';
  if (!storeHasAll(w, f, r.need)) return 'Dafür fehlen noch Zutaten';
  for (const [k, n] of Object.entries(r.need) as [StoreItem, number][]) storeTake(w, f, k, n);
  storeGive(w, f, r.id, 1);
  return null;
}
