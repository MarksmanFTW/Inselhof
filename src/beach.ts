/**
 * Strandgut: jeden Inseltag spült das Meer ein paar Schätze an (Muscheln, Seesterne,
 * selten eine Perle, Treibholz) und eine Flaschenpost mit einem Brief und einem kleinen
 * Geschenk. Schätze kommen ins Album und lassen sich beim Händler verkaufen. Gehört der
 * Insel (im Koop findet, wer zuerst da ist). Reine Logik.
 */
import { islandDay } from './horses';
import { Ground, H, W, rng, type Island } from './island';
import type { Farm } from './farm';
import type { World } from './world';

export interface Shell {
  id: string;
  name: string;
  text: string;
  price: number;
  /** wie oft (Gewicht) */
  w: number;
  /** Treibholz: wird zu Holz */
  wood?: number;
}
export const SHELLS: Shell[] = [
  { id: 'muschel', name: 'Herzmuschel', text: 'Eine kleine, gestreifte Muschel.', price: 2, w: 30 },
  { id: 'schnecke', name: 'Schneckenhaus', text: 'Wenn du es ans Ohr hältst, rauscht das Meer.', price: 2, w: 24 },
  { id: 'jakobsmuschel', name: 'Jakobsmuschel', text: 'Wie ein kleiner Fächer.', price: 4, w: 14 },
  { id: 'seestern', name: 'Seestern', text: 'Fünf Arme und ganz rau.', price: 5, w: 11 },
  { id: 'koralle', name: 'Koralle', text: 'Rosa und verzweigt wie ein Bäumchen.', price: 10, w: 5 },
  { id: 'perle', name: 'Perle', text: 'Selten und wunderschön – der Händler zahlt viel dafür.', price: 40, w: 1.5 },
  { id: 'treibholz', name: 'Treibholz', text: 'Vom Meer glatt geschliffen – gibt Holz.', price: 0, w: 10, wood: 3 },
];
export const shellById = (id: string) => SHELLS.find((s) => s.id === id);
/** Schätze, die ins Album kommen (Treibholz nicht) */
export const ALBUM_SHELLS = SHELLS.filter((s) => !s.wood);
/** so viele Schätze pro Tag, dazu die Flaschenpost (Nummer BOTTLE) */
export const BEACH_PER_DAY = 6;
export const BOTTLE = BEACH_PER_DAY;

/** Briefe aus der Flaschenpost (der Reihe nach) */
export const LETTERS: { from: string; text: string }[] = [
  { from: 'Kapitänin Frieda', text: 'Ahoi! Wenn du das liest, ist meine Flasche gut angekommen. Pass gut auf deine Insel auf!' },
  { from: 'ein Seehund', text: 'Ork ork! (Das heißt: Die besten Fische beißen nachts am Steg.)' },
  { from: 'Oma Rosi', text: 'Liebes Inselkind, vergiss nicht zu essen! Ein Apfel am Tag hält dich bei Kräften.' },
  { from: 'Fischer Ole', text: 'Ich habe einmal einen Goldfisch gefangen. Er hat mir zugezwinkert. Ehrlich!' },
  { from: 'ein Pirat', text: 'Arrr! Der größte Schatz ist ein gemütliches Zuhause. Und Kekse.' },
  { from: 'Lina vom Leuchtturm', text: 'Von hier oben sehe ich deine Insel. Sie wird jeden Tag schöner!' },
  { from: 'jemand Unbekanntes', text: 'Psst … Bewohner freuen sich doppelt über ihre Lieblingssache.' },
  { from: 'Gärtner Jo', text: 'Rüben mögen es nass. Gieß sie, dann wachsen sie im Nu!' },
  { from: 'eine Möwe', text: 'Kreisch! Kreisch! Kreeeisch! (Übersetzung: Hast du Fisch?)' },
  { from: 'Bäcker Paul', text: 'Mein Geheimnis für Apfelkuchen: vier Äpfel, eine Beere und viel Liebe.' },
  { from: 'ein Kind von weit weg', text: 'Hallo! Ich wohne auf einer Insel ganz im Norden. Bei uns schneit es oft. Schreibst du zurück?' },
  { from: 'Kapitänin Frieda', text: 'Mein Boot legt jeden Morgen um acht an. Ich habe immer etwas Schönes dabei!' },
  { from: 'ein alter Matrose', text: 'Wer zehn Herzen bei einem Bewohner hat, hat einen Freund fürs Leben.' },
  { from: 'die Meerjungfrau', text: 'Ich habe meine Perle verloren … falls du sie findest, behalte sie ruhig.' },
  { from: 'Fischer Ole', text: 'Mit einer Goldangel beißen die seltenen Fische viel öfter. Spar darauf!' },
  { from: 'ein Pinguin', text: 'Ich bin aus Versehen auf einer Eisscholle eingeschlafen. Grüße von unterwegs!' },
  { from: 'Oma Rosi', text: 'Ein Hochbeet ist was Feines – da wachsen die Rüben doppelt so schnell.' },
  { from: 'jemand Unbekanntes', text: 'Schau nachts mal in den Himmel über dem Festpavillon …' },
];
/** Geschenk in der Flaschenpost (wechselt von Tag zu Tag) */
export const BOTTLE_GIFTS: { coins?: number; seeds?: number; wood?: number }[] = [{ coins: 12 }, { seeds: 3 }, { coins: 20 }, { wood: 6 }, { coins: 15 }, { seeds: 4 }, { coins: 30 }];

export interface BeachState {
  day: number;
  /** heute schon aufgehoben (Nummern, BOTTLE = Flaschenpost) */
  got: number[];
}
export const newBeach = (): BeachState => ({ day: -1, got: [] });
export function cleanBeach(b: Partial<BeachState> | undefined): BeachState {
  if (!b || typeof b.day !== 'number') return newBeach();
  return { day: Math.floor(b.day), got: Array.isArray(b.got) ? b.got.filter((x) => Number.isInteger(x) && x >= 0 && x <= BOTTLE) : [] };
}

/** Sand nahe am Wasser, nicht am Steg (einmal je Insel) */
const cache = new WeakMap<Island, { x: number; y: number }[]>();
export function beachSpots(isl: Island) {
  let s = cache.get(isl);
  if (s) return s;
  s = [];
  const gAt = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? Ground.Water : isl.ground[(y | 0) * W + (x | 0)]);
  const dk = isl.dock;
  for (let y = 10; y < H - 6; y += 6)
    for (let x = 6; x < W - 6; x += 6) {
      if (![[0, 0], [4, 0], [-4, 0], [0, 3], [0, -3]].every(([dx, dy]) => gAt(x + dx, y + dy) === Ground.Sand)) continue;
      // Wasser in der Nähe (unten oder an der Seite)
      if (![[0, 12], [12, 0], [-12, 0], [0, 16], [9, 9], [-9, 9]].some(([dx, dy]) => gAt(x + dx, y + dy) === Ground.Water)) continue;
      if (x > dk.x - 10 && x < dk.x + dk.w + 10 && y > dk.y - 14) continue;
      if (isl.decor.some((d) => d.kind !== 'grass' && Math.hypot(d.x - x, (d.y - y) * 1.6) < 12)) continue;
      if (isl.pickups.some((p) => Math.hypot(p.x - x, p.y - y) < 10)) continue;
      s.push({ x, y });
    }
  cache.set(isl, s);
  return s;
}

export interface BeachFind {
  x: number;
  y: number;
  /** Schatz (bei der Flaschenpost: 'bottle') */
  id: string;
}
/** was heute am Strand liegt (auf jedem Gerät gleich) */
export function beachToday(isl: Island, day: number): BeachFind[] {
  const spots = beachSpots(isl);
  const r = rng(day * 6151 + 29);
  const out: BeachFind[] = [];
  const total = SHELLS.reduce((a, s) => a + s.w, 0);
  for (let k = 0; k < 400 && out.length <= BOTTLE && spots.length; k++) {
    const s = spots[Math.floor(r() * spots.length)];
    if (!out.every((o) => Math.hypot(o.x - s.x, o.y - s.y) > 24)) continue;
    let id = 'bottle';
    if (out.length < BEACH_PER_DAY) {
      let x = r() * total;
      id = SHELLS.find((sh) => (x -= sh.w) <= 0)?.id ?? SHELLS[0].id;
    }
    out.push({ x: s.x, y: s.y, id });
  }
  return out;
}
export const beachLeft = (w: World, i: number, day: number) => !(w.beach.day === day && w.beach.got.includes(i));

/** Schatz oder Flaschenpost aufheben */
export function beachPick(w: World, f: Farm, i: number, t: number): { err: string | null; id?: string; letter?: number; gift?: (typeof BOTTLE_GIFTS)[number] } {
  const day = islandDay(w.clock, t);
  const find = beachToday(w.isl, day)[i];
  if (!find) return { err: 'Hier liegt nichts' };
  if (w.beach.day !== day) w.beach = { day, got: [] };
  if (w.beach.got.includes(i)) return { err: 'Schon aufgehoben' };
  if (w.builtAt(find.x, find.y, 2, 2)) return { err: 'Hier liegt nichts' };
  w.beach.got.push(i);
  w.version++;
  if (find.id === 'bottle') {
    const gift = BOTTLE_GIFTS[((day % BOTTLE_GIFTS.length) + BOTTLE_GIFTS.length) % BOTTLE_GIFTS.length];
    if (gift.coins) w.coins += gift.coins;
    if (gift.wood) w.wood += gift.wood;
    if (gift.seeds) {
      f.seeds += gift.seeds;
      f.version++;
    }
    w.letters++;
    return { err: null, id: 'bottle', letter: (w.letters - 1) % LETTERS.length, gift };
  }
  const sh = shellById(find.id)!;
  if (sh.wood) w.wood += sh.wood;
  else {
    w.treasures[sh.id] = (w.treasures[sh.id] ?? 0) + 1;
    w.albumAdd('sea', sh.id);
  }
  return { err: null, id: sh.id };
}
