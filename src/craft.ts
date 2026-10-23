/**
 * Basteln: Zu Beginn hat man nichts. Stöcke (Wiese) und Steine (Strand) aufsammeln
 * und daraus die ersten Werkzeuge bauen; später kommen Holz-Werkzeuge dazu.
 * Werkzeuge gehören der Insel (bei gemeinsamen Inseln teilt man sie).
 */

/** Werkzeuge, die man besitzen kann ('water' = Kübel zum Gießen) */
export type ToolKind = 'axe' | 'hoe' | 'water' | 'scythe';
export const ALL_TOOLS: ToolKind[] = ['axe', 'hoe', 'water', 'scythe'];
export const isTool = (x: unknown): x is ToolKind => ALL_TOOLS.includes(x as ToolKind);

export interface Recipe {
  id: ToolKind;
  name: string;
  text: string;
  sticks: number;
  stones: number;
  wood: number;
}
export const RECIPES: Recipe[] = [
  { id: 'axe', name: 'Steinaxt', text: 'Bäume fällen', sticks: 2, stones: 2, wood: 0 },
  { id: 'hoe', name: 'Hacke', text: 'Felder anlegen', sticks: 2, stones: 1, wood: 0 },
  { id: 'water', name: 'Holzkübel', text: 'Wasser schöpfen und gießen', sticks: 0, stones: 0, wood: 4 },
  { id: 'scythe', name: 'Sense', text: 'Wiese mähen für Heu', sticks: 2, stones: 2, wood: 2 },
];
export const recipeOf = (id: string) => RECIPES.find((r) => r.id === id);

/** was beim Aktions-Knopf fehlt, wenn das Werkzeug noch nicht gebastelt ist */
export const TOOL_NAME: Record<ToolKind, string> = { axe: 'Axt', hoe: 'Hacke', water: 'Holzkübel', scythe: 'Sense' };

/** aufgesammelte Stöcke/Steine liegen nach so langer Zeit wieder da (ms) */
export const PICK_REGROW_MS = 150_000;
