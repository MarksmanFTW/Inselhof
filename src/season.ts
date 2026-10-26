/**
 * Jahreszeiten und Feste nach dem echten Kalender (Datum des Geräts):
 * Frühling, Sommer, Herbst, Winter verändern das Aussehen der Insel; Halloween und
 * das Winterfest bringen eigene Fundstücke, Besuche bei den Bewohnern und einen
 * Festladen. Zum Testen: ?datum=2026-12-10 in der Adresse. Reine Logik.
 */

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export const SEASON_NAMES: Record<Season, string> = { spring: 'Frühling', summer: 'Sommer', autumn: 'Herbst', winter: 'Winter' };

export type FestId = 'halloween' | 'winter';
export interface FestShopItem {
  id: string;
  name: string;
  text: string;
  price: number;
  /** Deko (kommt ins Deko-Lager) oder Hut (für die Figur) */
  kind: 'deco' | 'hat';
}
export interface Fest {
  id: FestId;
  name: string;
  /** von/bis (Monat, Tag), jedes Jahr */
  from: [number, number];
  to: [number, number];
  /** Fest-Währung */
  coin: { name: string; one: string };
  /** Fundstücke auf der Insel (jeden Inseltag neu) */
  find: { name: string; gives: number; perDay: number };
  /** Besuch bei den Bewohnern: Spruch, wann, wie viel */
  visit: { say: string; night: boolean; gives: number };
  shop: FestShopItem[];
  /** Begrüßung beim ersten Start im Festzeitraum */
  hello: string;
}

export const FESTS: Fest[] = [
  {
    id: 'halloween',
    name: 'Halloween',
    from: [10, 18],
    to: [11, 2],
    coin: { name: 'Bonbons', one: 'Bonbon' },
    find: { name: 'Kürbis', gives: 1, perDay: 5 },
    visit: { say: 'Süßes oder Saures!', night: true, gives: 2 },
    shop: [
      { id: 'jackolantern', name: 'Kürbislaterne', text: 'Leuchtet nachts schaurig-schön.', price: 6, kind: 'deco' },
      { id: 'scarecrow', name: 'Vogelscheuche', text: 'Passt auf deine Felder auf.', price: 10, kind: 'deco' },
      { id: 'cauldron', name: 'Hexenkessel', text: 'Blubbert grün vor sich hin.', price: 14, kind: 'deco' },
      { id: 'ghost', name: 'Kleines Gespenst', text: 'Schwebt freundlich herum. Buh!', price: 18, kind: 'deco' },
      { id: 'witch', name: 'Hexenhut', text: 'Ein spitzer Hut für deine Figur.', price: 24, kind: 'hat' },
    ],
    hello: 'Auf der Insel liegen Kürbisse – sammle sie für Bonbons. Nachts sagen die Bewohner „Süßes oder Saures!“. Am Kürbisstand beim Steg tauschst du Bonbons gegen schaurige Deko.',
  },
  {
    id: 'winter',
    name: 'Winterfest',
    from: [12, 1],
    to: [12, 31],
    coin: { name: 'Plätzchen', one: 'Plätzchen' },
    find: { name: 'Geschenk', gives: 1, perDay: 5 },
    visit: { say: 'Frohes Winterfest! Hier, frisch gebacken.', night: false, gives: 2 },
    shop: [
      { id: 'snowman', name: 'Schneemann', text: 'Mit Karottennase und Schal.', price: 8, kind: 'deco' },
      { id: 'xmastree', name: 'Festtagsbaum', text: 'Mit Lichtern, die nachts funkeln.', price: 16, kind: 'deco' },
      { id: 'giftpile', name: 'Geschenkeberg', text: 'Bunte Päckchen mit Schleifen.', price: 10, kind: 'deco' },
      { id: 'sled', name: 'Schlitten', text: 'Für eine Fahrt durch den Schnee.', price: 14, kind: 'deco' },
      { id: 'santa', name: 'Zipfelmütze', text: 'Rot, warm und mit Bommel.', price: 22, kind: 'hat' },
    ],
    hello: 'Es schneit! Unter den Bäumen liegen Geschenke mit Plätzchen. Die Bewohner backen auch welche für dich. Am Festtagsstand beim Steg gibt es Winter-Deko.',
  },
];
export const festById = (id: string) => FESTS.find((f) => f.id === id);
/** alle Fest-Dinge zum Kaufen (für Album, Deko-Modelle) */
export const FEST_DECO = FESTS.flatMap((f) => f.shop.filter((s) => s.kind === 'deco').map((s) => ({ ...s, fest: f.id })));
export const FEST_HATS = FESTS.flatMap((f) => f.shop.filter((s) => s.kind === 'hat').map((s) => ({ ...s, fest: f.id })));

/** heutiges Datum (zum Testen per ?datum=JJJJ-MM-TT verstellbar) */
export function today(): Date {
  try {
    const q = new URLSearchParams(globalThis.location?.search ?? '').get('datum');
    if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return new Date(`${q}T12:00:00`);
  } catch {
    /* kein Browser */
  }
  return new Date();
}
/** Datum als Schlüssel JJJJ-MM-TT (Ortszeit) */
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function seasonAt(d: Date): Season {
  const m = d.getMonth() + 1;
  return m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter';
}
/** läuft gerade ein Fest? */
export function festAt(d: Date): Fest | null {
  const md = (d.getMonth() + 1) * 100 + d.getDate();
  for (const f of FESTS) {
    const a = f.from[0] * 100 + f.from[1];
    const b = f.to[0] * 100 + f.to[1];
    if (a <= b ? md >= a && md <= b : md >= a || md <= b) return f;
  }
  return null;
}
