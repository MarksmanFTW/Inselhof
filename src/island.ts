/**
 * Die Start-Insel, angelegt wie eine RPG-Karte nach der Vorlage:
 * Raster aus 8-px-Feldern (Wasser, Sand, Wiese), leicht gerundet zu einer
 * gestuften Pixel-Form. Bäume, Palmen, Büsche, Steg und Fundstücke sitzen
 * fest an ihren Plätzen; Gras und Strand-Krümel kommen aus einem Seed.
 */
export const TILE = 8;
/**
 * Karte: links die ursprüngliche Insel (Kacheln unverändert, damit alte
 * Spielstände passen), rechts das Ostland mit Wald, Teich und Bucht.
 */
const MAP = [
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~sssss~~~~~~sss~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~sssssssssssssss~~~~~~~~~~~~~~~~~~ssssssssssssssssss~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~ssssssssssssssss~~~~~~~~~~~~~~~sssggggggggggggggggss~~~~~~~~~~~~~',
  '~~~~~~~~sssssssssggggggggggggsss~~~~~~~~~sssssssggggggggggggggggggsss~~~~~~~~~~~',
  '~~~~~~~ssssssssgggggggggggggggsss~~~~~~~~ssssssggggggggggggggggggggsss~~~~~~~~~~',
  '~~~~~~sssggggggggggggggggggggggssssssssssssssssgggggggggggggsggggggsss~~~~~~~~~~',
  '~~~~~ssssggggggggggggggggggggggsssssssssssssssgggggggggggsssssssgggssss~~~~~~~~~',
  '~~~~~ssssgggggggggggggggggggggggggggggggggssssggggggggggss~~~~~ssgggssss~~~~~~~~',
  '~~~~~sssggggggggggggggggggggggggggggggggggsggggggggggggss~~~~~~~ssgggsssss~~~~~~',
  '~~~~~sssgggggggggggggggggggggggggggggggggggggggggggggggss~~~~~~~ssggggsssss~~~~~',
  '~~~~~sssgggggggggggggggggggggggggggggggggggggggggggggggss~~~~~~~ssgggggggsss~~~~',
  '~~~~~ssssgggggggggggggggggggggggggggggggggggggggggggggggss~~~~~ssgggggggggsss~~~',
  '~~~~~ssssssggggggggggggggggggggggggggggggggggggggggggggggsssssssgggggggggggss~~~',
  '~~~~~ssssssgggggggggggggggggggggggggggggggggggggggggggggggggsggggggggggggggss~~~',
  '~~~~~ssssssgggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggss~~~~',
  '~~~~~ssssssggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggsss~~~~',
  '~~~~~ssssssggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggsss~~~~',
  '~~~~~ssssssggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggsss~~~~',
  '~~~~~~sssssggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggsss~~~~',
  '~~~~~~~ssssgggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggss~~~~',
  '~~~~~~~ssssgggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggss~~~~',
  '~~~~~~~ssssggggggggggggggggsssgggggggggggggggggggggggggggggggggggggggggggsss~~~~',
  '~~~~~~~ssssggggggggggggggggsssssssssssssgggggggggggggggggggggggggggggggsssss~~~~',
  '~~~~~~~ssssssggggggggggssssssssssssssssssssggggggggggggggggggggsssssssssss~~~~~~',
  '~~~~~~~~sssssgggggggggggsssssssssss~~~~~ssssssggggggggggggggggs~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~ssssssssssssssssssssssss~~~~~~~~~ssssssgggggggggggggs~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~sssssssssssssssssssssss~~~~~~~~~~~~ssssggggggggggggs~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~ssssssssssssssssssss~~~~~~~~~~~~~~~sssggggggggggggs~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~ssssssssssssssssss~~~~~~~~~~~~~~~~~sssgggggggssggs~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~sssggggsssssss~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~sssssssssssss~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~sss~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
];
export const COLS = MAP[0].length;
export const ROWS = MAP.length;
export const W = COLS * TILE;
export const H = ROWS * TILE;
/** ab hier beginnt das Ostland (Welt-Pixel) */
export const EAST_X = 37 * TILE;

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

/** Stöcke und Steine zum Aufsammeln (Basteln) */
export type PickKind = 'stick' | 'stone';
export interface Pickup {
  kind: PickKind;
  x: number;
  y: number;
  variant: number;
  /** Drehung (Bogenmaß) */
  rot: number;
}

export interface Island {
  ground: Uint8Array;
  /** Abstand (px, grob) vom Wasser zum Strand (bis 22) – für die helle Uferzone */
  shore: Uint8Array;
  decor: Decor[];
  details: Detail[];
  dock: { x: number; y: number; w: number; h: number };
  /** feste Plätze; aufgehobene liegen nach einer Weile wieder da (World.picked) */
  pickups: Pickup[];
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
        (field(sx, sy) * 2 + field(sx - 3, sy - 3) + field(sx + 3, sy - 3) + field(sx - 3, sy + 3) + field(sx + 3, sy + 3)) / 6 +
        (hash(sx >> 2, sy >> 2, seed) - 0.5) * 0.06;
      ground[y * W + x] = f > 1.5 ? Ground.Grass : f > 0.5 ? Ground.Sand : Ground.Water;
    }
  // Uferzone im Wasser (0 = am Strand, bis 12 px)
  const shore = new Uint8Array(W * H).fill(255);
  // offenes Meer überspringen: nur Kacheln mit Land in der Nähe genau rechnen
  const near = new Uint8Array(COLS * ROWS);
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      for (let dr = -4; dr <= 4 && !near[r * COLS + c]; dr++) for (let dc = -4; dc <= 4; dc++) if (tileVal(c + dc, r + dr) > 0) near[r * COLS + c] = 1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (ground[y * W + x] !== Ground.Water) continue;
      if (!near[((y / TILE) | 0) * COLS + ((x / TILE) | 0)]) continue;
      let best = 255;
      for (let dy = -22; dy <= 22; dy += 2)
        for (let dx = -22; dx <= 22; dx += 2) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H || ground[yy * W + xx] === Ground.Water) continue;
          best = Math.min(best, Math.round(Math.hypot(dx, dy)));
        }
      shore[y * W + x] = best;
    }

  const decor: Decor[] = [];
  /** Platzieren in Welt-Pixeln (Fußpunkt, wie auf der Vorlage) */
  const put = (kind: DecorKind, x: number, y: number, variant = 0, flip = false) =>
    decor.push({ kind, x, y, variant, phase: hash(x, y, 3) * 6.28, flip });
  // Büsche (hinter den Bäumen)
  put('bush', 127, 90, 0);
  put('bush', 194, 92, 1);
  put('bush', 214, 76, 0);
  put('bush', 97, 118, 0, true);
  put('bush', 140, 150, 1, true);
  // drei große Obstbäume
  put('tree', 163, 82, 0);
  put('tree', 226, 122, 1);
  put('tree', 122, 182, 2);
  // Palmen
  put('palm', 73, 146, 0);
  put('palm', 178, 226, 1);
  put('palm', 244, 210, 0);
  // Steine & Stumpf
  put('boulder', 104, 212);
  put('rock', 113, 239, 0);
  put('rock', 191, 231, 1);
  put('stump', 121, 103);
  put('stump', 163, 143);
  put('stump', 139, 185);
  // hohes Gras (dunkle Büschel)
  const rr = rng(seed + 11);
  const tufts: [number, number][] = [
    [100, 84], [108, 94], [120, 124], [134, 127], [166, 147], [180, 152], [110, 192], [126, 197], [150, 212], [206, 198], [220, 172], [226, 183], [200, 108], [226, 145], [95, 168],
  ];
  for (const [x, y] of tufts)
    for (let k = 0; k < 1 + Math.floor(rr() * 2); k++) put('grass', x + Math.round((rr() - 0.5) * 12), y + Math.round((rr() - 0.5) * 8), Math.floor(rr() * 3), rr() < 0.5);
  decor.sort((a, b) => a.y - b.y);
  // Ostland: kommt hinten dran, damit die Nummern der alten Bäume gleich bleiben
  const east: Decor[] = [];
  const er = rng(seed * 31 + 5);
  const tile = (x: number, y: number) => tileVal(Math.floor(x / TILE), Math.floor(y / TILE));
  /** ringsum ganz auf Wiese bzw. Sand */
  const onAll = (x: number, y: number, v: number, m: number) => [[-m, 0], [m, 0], [0, -m], [0, m], [0, 0]].every(([dx, dy]) => tile(x + dx, y + dy) === v);
  const far = (x: number, y: number, d: number) => east.every((e) => e.kind === 'grass' || Math.hypot(e.x - x, (e.y - y) * 1.4) > d);
  const add = (kind: DecorKind, n: number, v: number, m: number, d: number, area: (x: number, y: number) => boolean, variants: number) => {
    for (let k = 0, tries = 0; k < n && tries < 4000; tries++) {
      const x = Math.round(EAST_X + er() * (W - EAST_X));
      const y = Math.round(er() * H);
      if (!area(x, y) || !onAll(x, y, v, m) || !far(x, y, d)) continue;
      // Baumkronen ragen nach oben – dort auch kein Wasser
      if ((kind === 'tree' || kind === 'palm') && !onAll(x, y - 26, v === 1 ? 1 : 2, 12) && !(kind === 'palm' && tile(x, y - 26) > 0)) continue;
      east.push({ kind, x, y, variant: Math.floor(er() * variants), phase: hash(x, y, 3) * 6.28, flip: er() < 0.5 });
      k++;
    }
  };
  const forest = (x: number, y: number) => x > 380 && x < 520 && y > 50 && y < 120;
  const anywhere = () => true;
  add('tree', 10, 2, 12, 26, forest, 3);
  add('tree', 7, 2, 12, 36, (x) => x > 330, 3);
  add('bush', 10, 2, 9, 22, anywhere, 2);
  add('palm', 7, 1, 5, 30, anywhere, 2);
  add('boulder', 3, 2, 10, 40, anywhere, 1);
  add('rock', 6, 1, 4, 24, anywhere, 2);
  add('stump', 3, 2, 8, 30, anywhere, 1);
  for (let k = 0; k < 18; k++) {
    const before = east.length;
    add('grass', 1, 2, 6, 10, anywhere, 3);
    const g = east[before];
    if (g) for (let j = 0; j < 1 + Math.floor(er() * 2); j++) east.push({ ...g, x: g.x + Math.round((er() - 0.5) * 12), y: g.y + Math.round((er() - 0.5) * 8), variant: Math.floor(er() * 3), flip: er() < 0.5 });
  }
  east.sort((a, b) => a.y - b.y);
  decor.push(...east.filter((e) => tile(e.x, e.y) > 0));

  // Steg unten
  const dock = { x: 123, y: 244, w: 27, h: 46 };

  // Kleinkram
  const details: Detail[] = [];
  const r = rng(seed * 13 + 1);
  const gAt = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? Ground.Water : ground[(y | 0) * W + (x | 0)]);
  for (let k = 0; k < Math.round((900 * W * H) / (336 * 304)); k++) {
    const x = Math.floor(r() * W);
    const y = Math.floor(r() * H);
    const g = gAt(x, y);
    const v = Math.floor(r() * 4);
    // Abstand zu Bäumen & Co lassen
    if (decor.some((d) => d.kind !== 'grass' && Math.abs(d.x - x) < 14 && y > d.y - 10 && y < d.y + 4)) continue;
    if (g === Ground.Grass && gAt(x, y + 5) === Ground.Grass) {
      const p = r();
      if (p < 0.05) details.push({ kind: 'flower', x, y, variant: v });
      else if (p < 0.3) details.push({ kind: 'clover', x, y, variant: v % 2 });
      else if (p < 0.5) details.push({ kind: 'blade', x, y, variant: v });
    } else if (g === Ground.Sand && gAt(x + 6, y + 6) === Ground.Sand && gAt(x - 6, y - 6) === Ground.Sand && gAt(x, y - 8) !== Ground.Grass) {
      const p = r();
      // (früher auch Deko-Kiesel – jetzt gibt es echte Steine zum Aufheben)
      if (p < 0.012) details.push({ kind: 'shell', x, y, variant: v });
    }
  }
  // fest platzierte Fundstücke am Strand (wie Vorlage)
  details.push({ kind: 'bone', x: 266, y: 204, variant: 0 });
  details.push({ kind: 'bone', x: 254, y: 191, variant: 1 });
  details.push({ kind: 'shell', x: 62, y: 161, variant: 2 });
  details.push({ kind: 'shell', x: 261, y: 217, variant: 1 });
  details.push({ kind: 'shell', x: 218, y: 239, variant: 3 });
  details.push({ kind: 'shell', x: 159, y: 247, variant: 1 });
  for (const [x, y] of [[195, 98], [110, 124], [160, 152], [200, 101]] as const) details.push({ kind: 'flower', x, y, variant: 0 });

  // Stöcke (unter Bäumen und auf der Wiese) und Steine (im Sand am Strand)
  const pickups: Pickup[] = [];
  const pr = rng(seed * 17 + 3);
  const around = (x: number, y: number, v: Ground, m: number) => [[-m, 0], [m, 0], [0, -m], [0, m], [0, 0]].every(([dx, dy]) => gAt(x + dx, y + dy) === v);
  const clear = (x: number, y: number) =>
    !decor.some((d) => d.kind !== 'grass' && Math.hypot(d.x - x, (d.y - y) * 1.6) < 12) &&
    pickups.every((p) => Math.hypot(p.x - x, p.y - y) > 16) &&
    !(x > dock.x - 8 && x < dock.x + dock.w + 8 && y > dock.y - 12);
  const drop = (kind: PickKind, x: number, y: number) => pickups.push({ kind, x: Math.round(x), y: Math.round(y), variant: Math.floor(pr() * 3), rot: pr() * Math.PI * 2 });
  for (const d of decor)
    if (d.kind === 'tree')
      for (let tries = 0; tries < 16; tries++) {
        const a = pr() * Math.PI * 2;
        const dist = 14 + pr() * 10;
        const x = d.x + Math.cos(a) * dist;
        const y = d.y + 4 + Math.abs(Math.sin(a)) * dist * 0.6;
        if (around(x, y, Ground.Grass, 5) && clear(x, y)) {
          drop('stick', x, y);
          break;
        }
      }
  const scatter = (kind: PickKind, g: Ground, n: number, x0: number, x1: number) => {
    for (let k = 0, tries = 0; k < n && tries < 4000; tries++) {
      const x = x0 + pr() * (x1 - x0);
      const y = pr() * H;
      if (!around(x, y, g, 6) || !clear(x, y)) continue;
      drop(kind, x, y);
      k++;
    }
  };
  scatter('stick', Ground.Grass, 5, 0, EAST_X);
  scatter('stick', Ground.Grass, 3, EAST_X, W);
  scatter('stone', Ground.Sand, 9, 0, EAST_X);
  scatter('stone', Ground.Sand, 7, EAST_X, W);
  return { ground, shore, decor, details, dock, pickups };
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
