/**
 * Pferde und Ställe: die gängigen Rassen (Farbe, Abzeichen, Größe), Adoption
 * mit Rüben im Stall, Füttern und Reiten. Wo ein Pferd gerade grast, wird aus
 * der Zeit berechnet – so sehen beide Spieler im Koop dieselbe Herde, ohne dass
 * Positionen übers Netz gehen. Reine Logik.
 */
import { Ground, H, W, type Island } from './island';
import { DAY_MS, type Clock } from './time';

export type Pattern = 'none' | 'blaze' | 'pinto' | 'spots' | 'dapple' | 'dun';

export interface Breed {
  id: string;
  name: string;
  /** kurzer Text im Stall */
  text: string;
  coat: string;
  shade: string;
  mane: string;
  /** Beine unten (Socken, Kaltblut-Behang, schwarze Beine beim Braunen) */
  legs?: string;
  pattern: Pattern;
  /** Farbe der Flecken/Abzeichen */
  mark?: string;
  /** langer Behang an den Hufen (Kaltblut) */
  feather?: boolean;
  /** 0 = Pony, 1 = Pferd, 2 = großes Kaltblut, 3 = Fohlen */
  size: 0 | 1 | 2 | 3;
  /** Preis in Rüben */
  cost: number;
  /** ab Insel-Stufe */
  level: number;
  /** Tempo beim Reiten (× Laufen) */
  speed: number;
  names: string[];
  /** seltene Rasse: nur beim Händler, Preis in Münzen */
  rare?: number;
  /** Einhorn */
  horn?: boolean;
}

export const BREEDS: Breed[] = [
  { id: 'haflinger', name: 'Haflinger', text: 'Goldfuchs mit heller Mähne aus Tirol – freundlich und brav.', coat: '#c8803a', shade: '#9a5a26', mane: '#f4e6c4', pattern: 'blaze', mark: '#f8f0e0', size: 1, cost: 4, level: 1, speed: 1.9, names: ['Goldi', 'Sunny', 'Honig', 'Karamell'] },
  { id: 'noriker', name: 'Noriker', text: 'Starkes Kaltblut aus den österreichischen Alpen.', coat: '#5e3c26', shade: '#40281a', mane: '#24160e', legs: '#2c1c12', pattern: 'none', size: 2, cost: 5, level: 1, speed: 1.7, names: ['Bruno', 'Alpi', 'Hias', 'Resi'] },
  { id: 'shetland', name: 'Shetlandpony', text: 'Klein, wuschelig und frech – von den Shetland-Inseln.', coat: '#7a4a2c', shade: '#5a321c', mane: '#efe6d6', pattern: 'pinto', mark: '#f4efe6', size: 0, cost: 3, level: 1, speed: 1.55, names: ['Krümel', 'Flocke', 'Pünktchen', 'Toffee'] },
  { id: 'islandpferd', name: 'Islandpferd', text: 'Robust, mit dicker Mähne und Aalstrich. Kann Tölt!', coat: '#c9a86c', shade: '#a2834c', mane: '#3a2a1c', legs: '#5a4026', pattern: 'dun', mark: '#4a3420', size: 0, cost: 4, level: 1, speed: 1.8, names: ['Freyja', 'Odin', 'Sölvi', 'Hekla'] },
  { id: 'quarter', name: 'Quarter Horse', text: 'Das schnelle Westernpferd mit weißen Socken.', coat: '#b4582c', shade: '#8a3e1c', mane: '#8a3a1a', legs: '#f4ece0', pattern: 'blaze', mark: '#f8f0e6', size: 1, cost: 5, level: 2, speed: 2.1, names: ['Dakota', 'Rusty', 'Cody', 'Sierra'] },
  { id: 'mustang', name: 'Mustang', text: 'Wildpferd aus der Prärie – falbfarben mit schwarzen Beinen.', coat: '#d4a462', shade: '#a87c44', mane: '#26201c', legs: '#2c2420', pattern: 'none', size: 1, cost: 5, level: 2, speed: 2.1, names: ['Spirit', 'Wildfang', 'Dusty', 'Navajo'] },
  { id: 'tinker', name: 'Tinker', text: 'Gescheckt mit viel Behang – der gemütliche Kumpel.', coat: '#2a2628', shade: '#16131a', mane: '#f0ece6', legs: '#f4f0ea', pattern: 'pinto', mark: '#f4f0ea', feather: true, size: 2, cost: 6, level: 2, speed: 1.75, names: ['Domino', 'Oreo', 'Panda', 'Lucky'] },
  { id: 'araber', name: 'Araber', text: 'Edler Schimmel mit feinem Kopf – ausdauernd und flink.', coat: '#e0dedc', shade: '#b4b2b8', mane: '#9a98a2', pattern: 'none', size: 1, cost: 6, level: 3, speed: 2.25, names: ['Amira', 'Sultan', 'Jasmin', 'Shadi'] },
  { id: 'appaloosa', name: 'Appaloosa', text: 'Weiß mit dunklen Tupfen – ein echter Hingucker.', coat: '#ece8e0', shade: '#c4beb4', mane: '#4a3226', legs: '#6a4a36', pattern: 'spots', mark: '#5a3a28', size: 1, cost: 6, level: 3, speed: 2.05, names: ['Tupfi', 'Domino', 'Pepper', 'Dalmi'] },
  { id: 'paint', name: 'Paint Horse', text: 'Fuchs mit großen weißen Platten – bunt wie ein Bild.', coat: '#b0602c', shade: '#84421c', mane: '#7a3618', pattern: 'pinto', mark: '#f6f0e6', size: 1, cost: 6, level: 3, speed: 2.05, names: ['Picasso', 'Patch', 'Cookie', 'Calico'] },
  { id: 'friese', name: 'Friese', text: 'Rabenschwarz mit wallender Mähne und Behang.', coat: '#26222c', shade: '#141118', mane: '#0e0c12', legs: '#1a161e', pattern: 'none', feather: true, size: 2, cost: 7, level: 4, speed: 1.95, names: ['Nero', 'Onyx', 'Lakritz', 'Zorro'] },
  { id: 'lipizzaner', name: 'Lipizzaner', text: 'Der weiße Tänzer der Spanischen Hofreitschule in Wien.', coat: '#f2eee8', shade: '#cac6c4', mane: '#e2ded8', pattern: 'none', size: 1, cost: 7, level: 4, speed: 2, names: ['Pluto', 'Maestoso', 'Favory', 'Schneeweiß'] },
  { id: 'andalusier', name: 'Andalusier', text: 'Apfelschimmel aus Spanien mit üppiger Mähne.', coat: '#b6b6c0', shade: '#8e8e9a', mane: '#ececf2', pattern: 'dapple', mark: '#d6d6de', size: 1, cost: 7, level: 4, speed: 2.05, names: ['Bonito', 'Lucero', 'Paloma', 'Duende'] },
  { id: 'hannoveraner', name: 'Hannoveraner', text: 'Großes Warmblut, brauner Turnierstar mit Blesse.', coat: '#8c4a26', shade: '#663418', mane: '#1e1612', legs: '#1e1612', pattern: 'blaze', mark: '#f6f0e6', size: 1, cost: 8, level: 5, speed: 2.2, names: ['Champion', 'Donnerhall', 'Bella', 'Ronja'] },
  { id: 'vollblut', name: 'Englisches Vollblut', text: 'Das schnellste Pferd der Insel – ein Rennpferd!', coat: '#7a3a1a', shade: '#58260e', mane: '#4a1e0c', legs: '#f2ece2', pattern: 'blaze', mark: '#f6f0e6', size: 1, cost: 8, level: 5, speed: 2.5, names: ['Blitz', 'Comet', 'Rocket', 'Flash'] },
  { id: 'clydesdale', name: 'Clydesdale', text: 'Riesiges Kaltblut aus Schottland mit weißem Behang.', coat: '#6c3a22', shade: '#4c2614', mane: '#2a1810', legs: '#f2ece2', pattern: 'blaze', mark: '#f6f0e6', feather: true, size: 2, cost: 9, level: 5, speed: 1.8, names: ['Hamish', 'Big Ben', 'Duncan', 'Moira'] },
  // ---- seltene Rassen: nur beim Händler-Boot ----
  { id: 'akhal', name: 'Akhal-Tekkiner', text: 'Goldglänzendes Wüstenpferd – eines der seltensten der Welt.', coat: '#dcb45c', shade: '#b08a3a', mane: '#c4964a', legs: '#a07a34', pattern: 'none', size: 1, cost: 0, level: 1, speed: 2.35, names: ['Goldstaub', 'Sahara', 'Topas', 'Aurora'], rare: 80 },
  { id: 'knabstrupper', name: 'Knabstrupper', text: 'Dänisches Tigerpferd mit Tupfen am ganzen Körper.', coat: '#f2eee6', shade: '#c8c2b8', mane: '#3a2a22', legs: '#3a2a22', pattern: 'spots', mark: '#3a2a22', size: 1, cost: 0, level: 1, speed: 2.1, names: ['Tiger', 'Konfetti', 'Pixel', 'Sprenkel'], rare: 70 },
  { id: 'falabella', name: 'Falabella', text: 'Das kleinste Pferd der Welt – kaum größer als ein Hund!', coat: '#8a5a3a', shade: '#6a3e24', mane: '#f2ece2', pattern: 'pinto', mark: '#f6f0e6', size: 3, cost: 0, level: 1, speed: 1.5, names: ['Mini', 'Knopf', 'Zwerg', 'Bonbon'], rare: 60 },
  { id: 'einhorn', name: 'Einhorn', text: 'Ein echtes Einhorn! Kommt nur zu Sammlern mit vielen Rassen.', coat: '#fafaff', shade: '#d4d0ee', mane: '#f08ac8', legs: '#fafaff', pattern: 'none', size: 1, cost: 0, level: 1, speed: 2.7, names: ['Glitzer', 'Regenbogen', 'Sternchen', 'Luna'], rare: 200, horn: true },
];
/** im Stall aufnehmbar (nicht die seltenen) */
export const STABLE_BREEDS = BREEDS.filter((b) => !b.rare);
export const RARE_BREEDS = BREEDS.filter((b) => b.rare);
export const breedById = (id: string) => BREEDS.find((b) => b.id === id);

export const STABLE_COST = 15;
/** Pferde pro Stall */
export const STABLE_SPACE = 4;
/** so oft füttern bis zum Aufsitzen */
export const TRUST = 1;
export const MAX_LOVE = 10;
export const NAME_MAX = 12;
/** Fohlen: Heu-Preis, wächst so lange, nächstes erst nach … Inseltagen */
export const FOAL_HAY = 5;
export const FOAL_GROW_MS = 2 * DAY_MS;
export const FOAL_PAUSE_DAYS = 3;

/** Koppel: Zaun rund um eine Wiese, Tor unten in der Mitte */
export interface Paddock {
  x: number;
  y: number;
}
export const PADDOCK_FOOT = { left: -34, right: 34, top: -40, bottom: 1 };
export const PADDOCK_COST = 8;
/** halbe Breite des Tors */
export const GATE = 7;
/** Koppel gehört zum Stall, wenn sie so nah ist */
export const PADDOCK_REACH = 110;

export interface Stable {
  x: number;
  y: number;
}
export interface Horse {
  breed: string;
  name: string;
  /** Stall-Nummer */
  stable: number;
  /** Zeitpunkt der Adoption (auch Zufalls-Samen fürs Grasen) */
  t: number;
  /** wie oft gefüttert (Vertrauen) */
  love: number;
  /** Inseltag: zuletzt Heu bekommen, Leckerli, gebürstet, Fohlen bekommen */
  fed?: number;
  treat?: number;
  brushed?: number;
  bred?: number;
  /** Fohlen: geboren um … */
  foal?: number;
}
export type Care = 'fed' | 'treat' | 'brushed';

/** Inseltag zur Zeit t (für „einmal am Tag“) */
export const islandDay = (clock: Clock | null, t: number) => Math.floor((t + (clock?.offset ?? 0)) / DAY_MS);
export const isFoal = (h: Horse, now: number) => h.foal !== undefined && now - h.foal < FOAL_GROW_MS;
/** Fohlen haben eigene (kleine) Bilder */
export const foalBreed = (b: Breed): Breed => ({ ...b, id: `${b.id}~fohlen`, size: 3 });

export function cleanHorses(list: unknown, stables: number): Horse[] {
  if (!Array.isArray(list)) return [];
  const out: Horse[] = [];
  for (const h of list as Partial<Horse>[]) {
    if (!h || !breedById(h.breed ?? '') || typeof h.stable !== 'number' || h.stable < 0 || h.stable >= stables) continue;
    out.push({
      breed: h.breed!,
      name: cleanName(h.name ?? '') || breedById(h.breed!)!.names[0],
      stable: Math.floor(h.stable),
      t: typeof h.t === 'number' ? h.t : 0,
      love: Math.max(0, Math.min(MAX_LOVE, Math.floor(h.love ?? 0))),
      ...Object.fromEntries((['fed', 'treat', 'brushed', 'bred', 'foal'] as const).filter((k) => typeof h[k] === 'number').map((k) => [k, h[k]])),
    });
  }
  return out;
}
export const cleanName = (s: string) => s.replace(/[<>&"]/g, '').trim().slice(0, NAME_MAX);

// ---------- Grasen rund um den Stall ----------
/** neues Ziel alle … ms */
export const WANDER_MS = 7000;
const WALK = 12; // Pixel pro Sekunde
const RANGE = { x: 34, y: 22 };

function hash(a: number, b: number) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Platz vor dem Stall, wo das Pferd nachts steht */
export function homeSpot(st: Stable, slot: number) {
  return { x: st.x - 15 + (slot % STABLE_SPACE) * 10, y: st.y + 9 + (slot % 2) * 3 };
}

export interface HorsePose {
  x: number;
  y: number;
  /** wie Dir: 0 runter, 1 hoch, 2 rechts, 3 links */
  dir: number;
  moving: boolean;
  /** Kopf unten zum Grasen */
  graze: boolean;
}

/** Wo steht/läuft das Pferd zur Zeit t? free(x, y) = darf dort stehen */
export interface Area {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
/** Innenfläche einer Koppel (mit Abstand zum Zaun) */
export const paddockArea = (p: Paddock): Area => ({ x0: p.x + PADDOCK_FOOT.left + 9, x1: p.x + PADDOCK_FOOT.right - 9, y0: p.y + PADDOCK_FOOT.top + 6, y1: p.y - 5 });
/** Weide vor dem Stall */
const frontArea = (st: Stable): Area => ({ x0: st.x - RANGE.x, x1: st.x + RANGE.x, y0: st.y + 12, y1: st.y + 12 + RANGE.y });

/**
 * Wo steht/läuft das Pferd zur Zeit t? free(x, y) = darf dort stehen.
 * Mit Koppel grasen die Pferde darin (und schlafen dort), sonst vor dem Stall.
 */
export function horsePose(h: Horse, slot: number, st: Stable, t: number, free: (x: number, y: number) => boolean, night = false, paddock?: Paddock): HorsePose {
  const area = paddock ? paddockArea(paddock) : frontArea(st);
  const home = paddock ? { x: Math.round(area.x0 + 6 + (slot % 5) * 11), y: Math.round(area.y1 - 2 - (slot % 2) * 6) } : homeSpot(st, slot);
  const seed = Math.floor(h.t / 1000) + slot * 7919;
  const target = (k: number) => {
    if (night) return home;
    for (let n = 0; n < 4; n++) {
      const x = Math.round(area.x0 + hash(seed, k * 4 + n) * (area.x1 - area.x0));
      const y = Math.round(area.y0 + hash(seed + 1, k * 4 + n) * (area.y1 - area.y0));
      if (free(x, y)) return { x, y };
    }
    return home;
  };
  const k = Math.floor(t / WANDER_MS);
  const a = target(k - 1);
  const b = target(k);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const walkMs = (dist / WALK) * 1000;
  const into = t - k * WANDER_MS;
  const p = walkMs > 0 ? Math.min(1, into / walkMs) : 1;
  const moving = p < 1 && dist > 1;
  // Blick: in Laufrichtung, beim Grasen meist seitlich
  let dir = Math.abs(dx) > Math.abs(dy) * 0.8 || dist < 1 ? (dx >= 0 ? 2 : 3) : dy > 0 ? 0 : 1;
  if (!moving && dist >= 1 && Math.abs(dx) <= Math.abs(dy) * 0.8) dir = hash(seed, k) < 0.5 ? 2 : 3;
  return { x: a.x + dx * p, y: a.y + dy * p, dir, moving, graze: !moving && !night && hash(seed + 2, k) < 0.7 };
}

/** Standard-Prüfung für Weideplätze: Land, nicht im Wasser */
export function pasture(isl: Island, blocked: (x: number, y: number) => boolean) {
  return (x: number, y: number) => {
    for (const [ax, ay] of [
      [-8, 0],
      [8, 0],
      [0, -3],
      [0, 3],
    ]) {
      const xx = x + ax;
      const yy = y + ay;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H || isl.ground[yy * W + xx] === Ground.Water) return false;
    }
    return !blocked(x, y);
  };
}
