/** Möbel fürs Haus: Name, Holz-Preis. Plätze im Raum siehe interior.ts */
export const FURNITURE = [
  { id: 'table', name: 'Tisch', cost: 4 },
  { id: 'chair', name: 'Stuhl', cost: 2 },
  { id: 'rug', name: 'Teppich', cost: 3 },
  { id: 'plant', name: 'Topfpflanze', cost: 2 },
  { id: 'lamp', name: 'Stehlampe', cost: 3 },
  { id: 'shelf', name: 'Regal', cost: 5 },
] as const;
export type FurnitureId = (typeof FURNITURE)[number]['id'];
export const furnitureById = (id: string) => FURNITURE.find((f) => f.id === id);
/** so viele Plätze hat jedes Haus */
export const SLOT_COUNT = 5;
