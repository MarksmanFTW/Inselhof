/**
 * Angeln: mit der Angel ans Wasser (am Steg beißen die seltenen besser), Pose
 * auswerfen, warten – wenn es zuckt, schnell tippen. Gefangene Fische kommen in
 * den Vorrat der Insel und ins Sammelalbum; man brät sie am Lagerfeuer oder
 * verkauft sie dem Händler. Reine Logik.
 */

export interface Fish {
  id: string;
  name: string;
  /** Farben fürs Modell: Rücken, Bauch, Flossen */
  colors: [string, string, string];
  /** Länge (Modell) */
  size: number;
  /** wie oft (relativ) */
  weight: number;
  /** Händler zahlt */
  price: number;
  /** am Lagerfeuer braten (seltene sind zu schade dafür) */
  cook: boolean;
  /** nur nachts / am Steg häufiger */
  night?: boolean;
  dock?: boolean;
  text: string;
}

export const FISH: Fish[] = [
  { id: 'hering', name: 'Hering', colors: ['#5a7a9a', '#e4ecf4', '#8aa4bc'], size: 0.8, weight: 30, price: 2, cook: true, text: 'Kommt oft in großen Schwärmen.' },
  { id: 'makrele', name: 'Makrele', colors: ['#3a7a6a', '#e8f0e8', '#6aa08a'], size: 0.9, weight: 26, price: 3, cook: true, text: 'Gestreift und flink.' },
  { id: 'dorade', name: 'Dorade', colors: ['#b0a8a0', '#f4ece0', '#e0b050'], size: 0.85, weight: 14, price: 5, cook: true, text: 'Hat einen goldenen Streifen auf der Stirn.' },
  { id: 'lachs', name: 'Lachs', colors: ['#7a8aa0', '#f0a890', '#5a6a80'], size: 1.05, weight: 11, price: 6, cook: true, text: 'Kräftig und lecker.' },
  { id: 'kugelfisch', name: 'Kugelfisch', colors: ['#e0c060', '#f8f0d0', '#c09040'], size: 0.7, weight: 4, price: 12, cook: false, dock: true, text: 'Bläst sich auf, wenn er sich erschreckt.' },
  { id: 'schwertfisch', name: 'Schwertfisch', colors: ['#3a5a8a', '#d0dcec', '#2a4a7a'], size: 1.3, weight: 2.5, price: 18, cook: false, dock: true, text: 'Nur draußen am Steg, wo das Wasser tief ist.' },
  { id: 'mondfisch', name: 'Mondfisch', colors: ['#a8b8d8', '#eef2ff', '#8898c8'], size: 1.0, weight: 4, price: 15, cook: false, night: true, text: 'Zeigt sich nur nachts im Mondlicht.' },
  { id: 'goldfisch', name: 'Goldfisch', colors: ['#f0a020', '#ffd870', '#ff7a20'], size: 0.6, weight: 0.8, price: 40, cook: false, text: 'Ganz, ganz selten. Bringt Glück!' },
  { id: 'stiefel', name: 'Alter Stiefel', colors: ['#6a4a30', '#8a6a48', '#4a3020'], size: 0.8, weight: 5, price: 0, cook: false, text: 'Kein Fisch … aber fürs Album zählt er!' },
];
export const fishById = (id: string) => FISH.find((f) => f.id === id);

/** Bratfisch gibt so viel Kraft */
export const GRILLED_ENERGY = 30;

/** Wartezeit bis zum Biss (ms) und wie lange man zum Tippen hat */
export const BITE_MIN = 2200;
export const BITE_MAX = 6500;
export const BITE_WINDOW = 1500;

/** was beißt? rand: 0..1 (zweimal benutzt) */
export function rollFish(rand: () => number, o: { night: boolean; dock: boolean }) {
  const pool = FISH.filter((f) => !f.night || o.night).map((f) => ({ f, w: f.weight * (o.dock && (f.dock || !f.cook) ? 1.8 : !o.dock && f.dock ? 0.15 : 1) }));
  let r = rand() * pool.reduce((s, p) => s + p.w, 0);
  for (const p of pool) if ((r -= p.w) <= 0) return p.f;
  return pool[0].f;
}

/** Wartezeit bis zum Biss; bei Regen beißen sie schneller */
export const biteDelay = (rand: () => number, rain: boolean) => (BITE_MIN + rand() * (BITE_MAX - BITE_MIN)) * (rain ? 0.7 : 1);
