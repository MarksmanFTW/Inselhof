/**
 * Bewohner: Für jedes Bewohnerhaus zieht ein Tier ein (der Reihe nach). Jeden
 * Inseltag wünscht sich jeder etwas; wer den Wunsch erfüllt, bekommt Münzen und
 * Herzen (für die Lieblingssache doppelt). Bei 3 Herzen gibt es eine Überraschung,
 * ab 6 Herzen jeden Tag ein Geschenk, bei 10 Herzen ist man beste Freunde.
 * Gehören der Insel (im Koop für beide). Reine Logik.
 */
import type { Farm } from './farm';
import { islandDay } from './horses';
import { rng } from './island';
import { orderPool } from './orders';
import { STORE_VALUE, storeGive, storeHasAll, storeTake, type StoreItem } from './store';
import type { World } from './world';

export interface VillagerDef {
  id: string;
  name: string;
  animal: string;
  text: string;
  /** Lieblingssache: wird oft gewünscht und gibt doppelt Herzen */
  fav: StoreItem;
  /** Tagesgeschenk ab 6 Herzen */
  present: StoreItem;
  presentN: number;
  /** Dachfarbe des Häuschens */
  roof: string;
  lines: string[];
}
export const VILLAGERS: VillagerDef[] = [
  {
    id: 'hase',
    name: 'Hoppel',
    animal: 'Hase',
    text: 'Flink, fröhlich und immer ein bisschen hungrig.',
    fav: 'turnip',
    present: 'turnip',
    presentN: 2,
    roof: '#f48fb1',
    lines: ['Hast du schon mal so eine schöne Rübe gesehen? Ich auch nicht!', 'Ich bin heute schon dreimal um die Insel gehoppelt!', 'Weißt du, was das Beste an der Insel ist? Du!', 'Psst … hinter dem großen Baum wachsen die süßesten Beeren.'],
  },
  {
    id: 'fuchs',
    name: 'Fiete',
    animal: 'Fuchs',
    text: 'Schlau, neugierig und angelt für sein Leben gern.',
    fav: 'fish',
    present: 'fish',
    presentN: 2,
    roof: '#ff9a3a',
    lines: ['Am Steg beißen sie heute bestimmt!', 'Ich hab einen Plan … aber der ist noch geheim.', 'Nachts schwimmt hier ein Fisch, der leuchtet wie der Mond!', 'Ein Fuchs braucht drei Dinge: Fisch, Ruhe und Freunde.'],
  },
  {
    id: 'baer',
    name: 'Brummel',
    animal: 'Bär',
    text: 'Gemütlich, gutmütig und ein großer Naschbär.',
    fav: 'berry',
    present: 'berry',
    presentN: 4,
    roof: '#c8945a',
    lines: ['Mmmh … riechst du das? Beeren!', 'Ein Nickerchen in der Sonne – was gibt es Schöneres?', 'Wenn du mal Hilfe beim Tragen brauchst: Ich bin stark!', 'Marmelade auf allem. Das ist mein Motto.'],
  },
  {
    id: 'katze',
    name: 'Mimi',
    animal: 'Katze',
    text: 'Verschmust, ein bisschen eitel und liebt Gebratenes.',
    fav: 'grilled',
    present: 'coins',
    presentN: 12,
    roof: '#b884e8',
    lines: ['Schnurr … du darfst mich kraulen. Aber nur kurz.', 'Ich habe beschlossen, dass dieser Platz jetzt mir gehört.', 'Hast du zufällig Bratfisch dabei? Rein zufällig?', 'Ich habe eine Münze gefunden. Vielleicht teile ich sie.'],
  },
  {
    id: 'ente',
    name: 'Paula',
    animal: 'Ente',
    text: 'Plappert gern, liebt das Wasser und frische Äpfel.',
    fav: 'apple',
    present: 'apple',
    presentN: 3,
    roof: '#ffd23f',
    lines: ['Quak! Hast du schon gehört? Nein? Dann erzähl ich es dir!', 'Das Meer ist heute sooo schön glitzerig.', 'Ein Apfel am Tag – und man watschelt fröhlich weiter!', 'Ich habe eine neue Feder! Siehst du sie?'],
  },
  {
    id: 'schaf',
    name: 'Wolke',
    animal: 'Schaf',
    text: 'Sanft, flauschig und träumt von duftenden Heuwiesen.',
    fav: 'hay',
    present: 'wood',
    presentN: 4,
    roof: '#6ad0ff',
    lines: ['Mäh … ich hab gerade von einer riesigen Heuwiese geträumt.', 'Zusammen ist alles viel kuscheliger.', 'Ich hab beim Spazieren Holz gesammelt – für dich!', 'Wolken sehen aus wie Schafe. Oder Schafe wie Wolken?'],
  },
];
export const villagerById = (id: string) => VILLAGERS.find((v) => v.id === id);
export const MAX_HEARTS = 10;
/** Belohnungen bei 3 und 10 Herzen */
export const SURPRISE = { coins: 25, seeds: 5 };
export const BEST_FRIEND_COINS = 100;

/** ein eingezogener Bewohner: wohnt im Häuschen bei x/y */
export interface Villager {
  id: string;
  x: number;
  y: number;
  hearts: number;
  /** Inseltag, an dem der Wunsch zuletzt erfüllt wurde */
  wished: number;
  /** Inseltag des letzten Tagesgeschenks */
  gifted: number;
}
export function cleanVillagers(list: unknown): Villager[] {
  if (!Array.isArray(list)) return [];
  const out: Villager[] = [];
  for (const v of list)
    if (v && typeof v === 'object' && villagerById(v.id) && !out.some((o) => o.id === v.id) && typeof v.x === 'number' && typeof v.y === 'number')
      out.push({ id: v.id, x: v.x, y: v.y, hearts: Math.max(0, Math.min(MAX_HEARTS, Math.floor(v.hearts ?? 0))), wished: Math.floor(v.wished ?? -1), gifted: Math.floor(v.gifted ?? -1) });
  return out;
}
/** wer als Nächstes einzieht (null = alle da) */
export const nextVillager = (w: World) => VILLAGERS.find((d) => !w.villagers.some((v) => v.id === d.id)) ?? null;

const WISH_MAX: Partial<Record<StoreItem, number>> = { wood: 6, apple: 4, berry: 5, turnip: 3, fish: 2, hay: 4 };
export interface Wish {
  item: StoreItem;
  n: number;
  coins: number;
  fav: boolean;
}
/** Wunsch des Tages (auf jedem Gerät gleich) */
export function wishOf(w: World, i: number, day: number): Wish {
  const v = w.villagers[i];
  const def = villagerById(v.id)!;
  const r = rng(day * 977 + VILLAGERS.indexOf(def) * 131 + 7);
  const pool = orderPool(w);
  const item = pool.includes(def.fav) && r() < 0.45 ? def.fav : pool[Math.floor(r() * pool.length)];
  const n = 1 + Math.floor(r() * (WISH_MAX[item] ?? 1));
  return { item, n, coins: Math.round(n * STORE_VALUE[item] * 2.5) + 5, fav: item === def.fav };
}

export interface WishResult {
  err: string | null;
  hearts?: number;
  coins?: number;
  /** erreichte Stufe (3, 6 oder 10 Herzen) */
  milestone?: number;
}
/** Wunsch erfüllen (expect = was das Gerät als Wunsch angezeigt hat) */
export function fulfill(w: World, f: Farm, i: number, t: number, expect?: string): WishResult {
  const v = w.villagers[i];
  if (!v) return { err: 'Diesen Bewohner gibt es nicht' };
  const day = islandDay(w.clock, t);
  if (v.wished === day) return { err: `${villagerById(v.id)!.name} hat sich heute schon gefreut` };
  const wish = wishOf(w, i, day);
  if (expect && expect !== wish.item) return { err: 'Der Wunsch hat sich gerade geändert' };
  if (!storeHasAll(w, f, { [wish.item]: wish.n })) return { err: 'Davon hast du noch zu wenig' };
  storeTake(w, f, wish.item, wish.n);
  const before = v.hearts;
  const gain = wish.fav ? 2 : 1;
  v.hearts = Math.min(MAX_HEARTS, v.hearts + gain);
  v.wished = day;
  w.coins += wish.coins;
  let milestone: number | undefined;
  if (before < 3 && v.hearts >= 3) {
    milestone = 3;
    w.coins += SURPRISE.coins;
    f.seeds += SURPRISE.seeds;
  }
  if (before < 6 && v.hearts >= 6) milestone = 6;
  if (before < MAX_HEARTS && v.hearts >= MAX_HEARTS) {
    milestone = MAX_HEARTS;
    w.coins += BEST_FRIEND_COINS;
  }
  w.version++;
  f.version++;
  return { err: null, hearts: v.hearts - before, coins: wish.coins, milestone };
}

/** Tagesgeschenk abholen (ab 6 Herzen) */
export function takePresent(w: World, f: Farm, i: number, t: number): string | null {
  const v = w.villagers[i];
  if (!v) return 'Diesen Bewohner gibt es nicht';
  if (v.hearts < 6) return 'Erst ab 6 Herzen';
  const day = islandDay(w.clock, t);
  if (v.gifted === day) return 'Heute gab es schon ein Geschenk';
  const def = villagerById(v.id)!;
  storeGive(w, f, def.present, def.presentN);
  v.gifted = day;
  w.version++;
  f.version++;
  return null;
}
