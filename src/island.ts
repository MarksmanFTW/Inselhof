/**
 * Die Start-Insel, von Hand angelegt wie eine RPG-Karte:
 * Raster aus 16-px-Feldern (Wasser, Sand, Wiese), weich gerundet zu einer
 * Pixel-Form. Bäume, Palmen, Büsche, Steg und Kleinkram sind fest platziert,
 * Gras und Strand-Krümel kommen aus einem Seed (immer gleich).
 */
export const TILE = 16;
const MAP = [
  '~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~ssssssss~~~~~~~~~',
  '~~~~~~ssssssssssssssss~~~~',
  '~~~~~sssggggggggggggss~~~~',
  '~~~~ssgggggggggggggggss~~~',
  '~~~~ssgggggggggggggggss~~~',
  '~~~sssggggggggggggggggss~~',
  '~~~ssgggggggggggggggggss~~',
  '~~~ssggggggggggggggggsss~~',
  '~~~ssggggggggggggggggss~~~',
  '~~~sssgggggggggggggggss~~~',
  '~~~~ssgggggggggggggggsss~~',
  '~~~~ssggggggggggggggggss~~',
  '~~~sssgggggggggggggggsss~~',
  '~~~ssssggggggggggggssss~~~',
  '~~~~sssssggggggggsssss~~~~',
  '~~~~~ssssssssssssssss~~~~~',
  '~~~~~~~sssssssssss~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~',
];
export const COLS = MAP[0].length;
export const ROWS = MAP.length;
export const W = COLS * TILE;
export const H = ROWS * TILE;

export const enum Ground {
  Water = 0,
  Sand = 1,
  Grass = 2,
}

export type DecorKind = 'tree' | 'palm' | 'bush' | 'rock' | 'boulder' | 'grass' | 'stump';
export interface Decor {
  kind: DecorKind;
  /** Fußpunkt in Welt-Pixeln */
  x: number;
  y: number;
  variant: number;
  phase: number;
  flip?: boolean;
}
export type DetailKind = 'bone' | 'shell' | 'stick' | 'pebble' | 'flower' | 'clover' | 'blade' | 'skull' | 'star';
export interface Detail {
  kind: DetailKind;
  x: number;
  y: number;
  variant: number;
}

export interface Island {
  ground: Uint8Array;
  /** Abstand (px, grob) vom Wasser zum Strand – für die helle Uferzone */
  shore: Uint8Array;
  decor: Decor[];
  details: Detail[];
  dock: { x: number; y: number; w: number; h: number };
}

export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
export const hash = (x: number, y: number, s = 0) => {
  let h = (x * 73856093) ^ (y * 19349663) ^ (s * 83492791);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const tileVal = (c: number, r: number) => {
  if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return 0;
  const ch = MAP[r][c];
  return ch === 'g' ? 2 : ch === 's' ? 1 : 0;
};

/** Feld-Raster → weiche Form: zwischen Feldmitten geglättet, gerundete Ecken */
function field(x: number, y: number) {
  const fx = x / TILE - 0.5;
  const fy = y / TILE - 0.5;
  const c = Math.floor(fx);
  const r = Math.floor(fy);
  const s = (t: number) => t * t * (3 - 2 * t);
  const u = s(fx - c);
  const v = s(fy - r);
  const a = tileVal(c, r);
  const b = tileVal(c + 1, r);
  const d = tileVal(c, r + 1);
  const e = tileVal(c + 1, r + 1);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + d * (1 - u) * v + e * u * v;
}

export function generate(seed = 7): Island {
  const ground = new Uint8Array(W * H);
  // Rand in 2-px-Stufen, damit er gestuft wirkt wie in alten RPGs
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const sx = x - (x % 2);
      const sy = y - (y % 2);
      // über Nachbarpunkte gemittelt → runde Ecken wie auf der Vorlage
      const f =
        (field(sx, sy) * 2 + field(sx - 7, sy - 7) + field(sx + 7, sy - 7) + field(sx - 7, sy + 7) + field(sx + 7, sy + 7)) / 6 +
        (hash(sx >> 2, sy >> 2, seed) - 0.5) * 0.12;
      ground[y * W + x] = f > 1.5 ? Ground.Grass : f > 0.5 ? Ground.Sand : Ground.Water;
    }
  // Uferzone im Wasser (0 = am Strand, bis 12 px)
  const shore = new Uint8Array(W * H).fill(255);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (ground[y * W + x] !== Ground.Water) continue;
      let best = 255;
      for (let dy = -12; dy <= 12; dy += 2)
        for (let dx = -12; dx <= 12; dx += 2) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H || ground[yy * W + xx] === Ground.Water) continue;
          best = Math.min(best, Math.round(Math.hypot(dx, dy)));
        }
      shore[y * W + x] = best;
    }

  const decor: Decor[] = [];
  const add = (kind: DecorKind, c: number, r: number, variant = 0, flip = false, ox = 0, oy = 0) => {
    decor.push({ kind, x: c * TILE + 8 + ox, y: r * TILE + 8 + oy, variant, phase: hash(c, r, 3 + decor.length) * 6.28, flip });
  };
  // drei große Obstbäume
  add('tree', 11, 5, 0, false, 0, 4);
  add('tree', 18, 7, 1, true, 0, 2);
  add('tree', 8, 11, 0, false, 0, 4);
  // Palmen am Rand
  add('palm', 5, 8, 0, false, 0, 8);
  add('palm', 11, 15, 1, true, 4, 6);
  add('palm', 19, 13, 0, true, 2, 8);
  // runde Büsche
  add('bush', 8, 6, 0, false, 0, 0);
  add('bush', 14, 6, 1, false, 0, 2);
  add('bush', 6, 10, 0, true, 2, 0);
  add('bush', 15, 10, 1, false, 0, 0);
  add('bush', 7, 14, 1, false, 0, 0);
  // Steine
  add('boulder', 5, 16, 0, false, 0, -2);
  add('rock', 20, 10, 1);
  add('rock', 15, 16, 2);
  add('stump', 16, 13, 0);
  // hohes Gras in Büscheln
  const rr = rng(seed + 11);
  const tufts: [number, number][] = [
    [9, 8], [13, 8], [12, 12], [17, 11], [10, 13], [14, 14], [6, 12], [16, 5], [19, 9], [9, 4], [7, 9], [13, 13],
  ];
  for (const [c, r] of tufts)
    for (let k = 0; k < 2 + Math.floor(rr() * 3); k++) add('grass', c, r, Math.floor(rr() * 3), rr() < 0.5, Math.round((rr() - 0.5) * 14), Math.round((rr() - 0.5) * 10));
  decor.sort((a, b) => a.y - b.y);

  // Steg unten links
  const dock = { x: 9 * TILE + 2, y: 17 * TILE + 6, w: 26, h: 44 };

  // Kleinkram
  const details: Detail[] = [];
  const r = rng(seed * 13 + 1);
  const gAt = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? Ground.Water : ground[(y | 0) * W + (x | 0)]);
  for (let k = 0; k < 2600; k++) {
    const x = Math.floor(r() * W);
    const y = Math.floor(r() * H);
    const g = gAt(x, y);
    const v = Math.floor(r() * 4);
    // Abstand zu Bäumen & Co lassen
    if (decor.some((d) => d.kind !== 'grass' && Math.abs(d.x - x) < 14 && y > d.y - 10 && y < d.y + 4)) continue;
    if (g === Ground.Grass && gAt(x, y + 5) === Ground.Grass) {
      const p = r();
      if (p < 0.08) details.push({ kind: 'flower', x, y, variant: v });
      else if (p < 0.2) details.push({ kind: 'clover', x, y, variant: v });
      else if (p < 0.42) details.push({ kind: 'blade', x, y, variant: v });
    } else if (g === Ground.Sand && gAt(x + 6, y + 6) === Ground.Sand && gAt(x - 6, y - 6) === Ground.Sand && gAt(x, y - 8) !== Ground.Grass) {
      const p = r();
      if (p < 0.012) details.push({ kind: 'shell', x, y, variant: v });
      else if (p < 0.03) details.push({ kind: 'pebble', x, y, variant: v });
    }
  }
  // fest platzierte Fundstücke am Strand
  details.push({ kind: 'bone', x: 19 * TILE + 4, y: 15 * TILE + 6, variant: 0 });
  details.push({ kind: 'skull', x: 4 * TILE + 10, y: 11 * TILE + 2, variant: 0 });
  details.push({ kind: 'stick', x: 12 * TILE, y: 17 * TILE + 4, variant: 0 });
  details.push({ kind: 'stick', x: 6 * TILE + 4, y: 3 * TILE + 10, variant: 1 });
  details.push({ kind: 'star', x: 16 * TILE + 6, y: 18 * TILE + 2, variant: 0 });
  details.push({ kind: 'shell', x: 3 * TILE + 12, y: 14 * TILE + 8, variant: 2 });
  return { ground, shore, decor, details, dock };
}

/** Größe der Landfläche und ob sie zusammenhängt (für Tests) */
export function landInfo(isl: Island) {
  let land = 0;
  let start = -1;
  for (let i = 0; i < isl.ground.length; i++)
    if (isl.ground[i] !== Ground.Water) {
      land++;
      if (start < 0) start = i;
    }
  const seen = new Uint8Array(isl.ground.length);
  const stack = [start];
  seen[start] = 1;
  let reached = 0;
  while (stack.length) {
    const i = stack.pop()!;
    reached++;
    const x = i % W;
    for (const n of [i - 1, i + 1, i - W, i + W]) {
      if (n < 0 || n >= isl.ground.length || seen[n] || isl.ground[n] === Ground.Water) continue;
      if ((n === i - 1 && x === 0) || (n === i + 1 && x === W - 1)) continue;
      seen[n] = 1;
      stack.push(n);
    }
  }
  return { land, main: reached };
}
