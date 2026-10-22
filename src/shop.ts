/**
 * Händler-Boot, Münzen, Deko und Sammelalbum – reine Logik.
 * Das Boot legt jeden Inseltag von 8 bis 18 Uhr am Steg an. Was es an
 * seltenen Pferden dabeihat, hängt vom Tag ab (auf jedem Gerät gleich).
 */
import { RARE_BREEDS, STABLE_BREEDS } from './horses';
import { timeOf, type Clock } from './time';

/** Verkaufspreise in Münzen pro Stück */
export const SELL = { turnip: 4, meal: 10, wood: 1, hay: 2 } as const;
export type SellItem = keyof typeof SELL;
export const SELL_NAMES: Record<SellItem, string> = { turnip: 'Rübe', meal: 'Ofenrübe', wood: 'Holz', hay: 'Heu' };
/** Samen gibt es im Päckchen */
export const SEED_PACK = { n: 5, price: 8 };

/** Deko für draußen */
export const DECO = [
  { id: 'flowers', name: 'Blumenbeet', price: 15 },
  { id: 'birdhouse', name: 'Vogelhaus', price: 20 },
  { id: 'bench', name: 'Gartenbank', price: 25 },
  { id: 'lantern', name: 'Laterne', price: 30 },
  { id: 'gnome', name: 'Gartenzwerg', price: 35 },
  { id: 'well', name: 'Brunnen', price: 60 },
] as const;
export type DecoId = (typeof DECO)[number]['id'];
export const decoById = (id: string) => DECO.find((d) => d.id === id);
export interface Deco {
  x: number;
  y: number;
  id: string;
}
/** Grundfläche jeder Deko (klein) */
export const DECO_FOOT = { left: -6, right: 6, top: -3, bottom: 1 };

/** Händler da? (mit kleinem Puffer fürs An- und Ablegen) */
export const BOAT_FROM = 8;
export const BOAT_TO = 18;
export function merchantHere(clock: Clock | null, t: number) {
  if (!clock) return false;
  const h = timeOf(clock, t).hour;
  return h >= BOAT_FROM + 0.5 && h < BOAT_TO - 0.5;
}
/** Boot fährt ein/aus: 0 = am Steg, 1 = weit draußen, null = nicht da */
export function boatOut(clock: Clock | null, t: number): number | null {
  if (!clock) return null;
  const h = timeOf(clock, t).hour;
  if (h < BOAT_FROM || h >= BOAT_TO) return null;
  if (h < BOAT_FROM + 0.5) return 1 - (h - BOAT_FROM) / 0.5;
  if (h >= BOAT_TO - 0.5) return (h - (BOAT_TO - 0.5)) / 0.5;
  return 0;
}

/** Einhorn kommt erst zu Sammlern mit so vielen Rassen im Album */
export const UNICORN_AFTER = 12;
/** Seltene Pferde, die das Boot heute dabeihat */
export function horseOffers(day: number, albumHorses: number): string[] {
  const normal = RARE_BREEDS.filter((b) => !b.horn);
  const out = [normal[((day % normal.length) + normal.length) % normal.length].id];
  if (albumHorses >= UNICORN_AFTER) out.push('einhorn');
  return out;
}

// ---------- Sammelalbum ----------
export interface Album {
  horses: string[];
  deco: string[];
}
export const ALBUM_TOTAL = STABLE_BREEDS.length + RARE_BREEDS.length + DECO.length;
/** Belohnungen: ab so vielen Einträgen gibt es Münzen */
export const ALBUM_REWARDS = [
  { at: 5, coins: 20 },
  { at: 10, coins: 40 },
  { at: 15, coins: 60 },
  { at: 20, coins: 100 },
  { at: ALBUM_TOTAL, coins: 250 },
];
export const albumCount = (a: Album) => a.horses.length + a.deco.length;
export function cleanAlbum(a: Partial<Album> | undefined): Album {
  const ok = (l: unknown) => (Array.isArray(l) ? [...new Set(l.filter((x): x is string => typeof x === 'string'))] : []);
  return { horses: ok(a?.horses), deco: ok(a?.deco) };
}
