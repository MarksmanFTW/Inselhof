/**
 * Die Start-Insel: Höhenfeld in Pixeln (rund, leicht unregelmäßig),
 * daraus Wasser, Strand und Wiese, plus Bäume, Palmen, Büsche, Steine
 * und kleine Details. Alles aus einem Seed → immer dieselbe Insel.
 */
export const W = 640;
export const H = 640;

export const enum Ground {
  Deep = 0,
  Shallow = 1,
  Sand = 2,
  Grass = 3,
  Meadow = 4,
}
/** Höhen-Schwellen */
export const SHALLOW = -0.22;
export const SAND = 0;
export const GRASS = 0.09;
export const MEADOW = 0.55;

export type DecorKind = 'oak' | 'pine' | 'palm' | 'bush' | 'rock';
export interface Decor {
  kind: DecorKind;
  /** Fußpunkt in Welt-Pixeln */
  x: number;
  y: number;
  variant: number;
  phase: number;
}
export type DetailKind = 'tuft' | 'flower' | 'shell' | 'star' | 'pebble' | 'clover';
export interface Detail {
  kind: DetailKind;
  x: number;
  y: number;
  variant: number;
}

export interface Island {
  height: Float32Array;
  ground: Uint8Array;
  decor: Decor[];
  details: Detail[];
}

export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** glatte Wertrausch-Funktion */
function valueNoise(seed: number) {
  const hash = (x: number, y: number) => {
    let h = (x * 374761393 + y * 668265263 + seed * 144665) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const sm = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = sm(x - xi);
    const fy = sm(y - yi);
    const a = hash(xi, yi);
    const b = hash(xi + 1, yi);
    const c = hash(xi, yi + 1);
    const d = hash(xi + 1, yi + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}
export function fbm(seed: number) {
  const n = [valueNoise(seed), valueNoise(seed + 1), valueNoise(seed + 2), valueNoise(seed + 3)];
  return (x: number, y: number) => n[0](x, y) * 0.5 + n[1](x * 2, y * 2) * 0.25 + n[2](x * 4, y * 4) * 0.15 + n[3](x * 8, y * 8) * 0.1 - 0.5;
}

export function generate(seed = 7): Island {
  const height = new Float32Array(W * H);
  const ground = new Uint8Array(W * H);
  const shape = fbm(seed);
  const cx = W / 2;
  const cy = H / 2;
  const R = 205;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = (x - cx) / R;
      const dy = (y - cy) / (R * 0.92);
      const d = Math.sqrt(dx * dx + dy * dy);
      // runde Grundform, Ränder durch Rauschen „knubbelig“
      const h = 1 - d + shape(x / 70, y / 70) * 0.55;
      const i = y * W + x;
      height[i] = h;
      ground[i] = h < SHALLOW ? Ground.Deep : h < SAND ? Ground.Shallow : h < GRASS ? Ground.Sand : h < MEADOW ? Ground.Grass : Ground.Meadow;
    }

  const r = rng(seed * 31 + 5);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : height[(y | 0) * W + (x | 0)]);
  const decor: Decor[] = [];
  const free = (x: number, y: number, min: number) => decor.every((d) => Math.hypot(d.x - x, (d.y - y) * 1.4) >= min);
  const place = (kind: DecorKind, tries: number, ok: (h: number, x: number, y: number) => boolean, min: number, variants: number) => {
    for (let k = 0; k < tries; k++) {
      const x = Math.round(cx + (r() - 0.5) * 2 * R * 1.1);
      const y = Math.round(cy + (r() - 0.5) * 2 * R * 1.1);
      const h = at(x, y);
      if (!ok(h, x, y) || !free(x, y, min)) continue;
      decor.push({ kind, x, y, variant: Math.floor(r() * variants), phase: r() * 6.28 });
    }
  };
  // Palmen säumen den Strand
  place('palm', 900, (h, x, y) => h > SAND + 0.03 && h < GRASS + 0.04 && at(x, y + 6) > SAND, 26, 2);
  // kleines Wäldchen auf der Wiese, freie Lichtung in der Mitte für später
  place('oak', 110, (h, x, y) => h > GRASS + 0.06 && Math.hypot(x - cx, y - cy) > 95, 36, 3);
  place('pine', 40, (h, x, y) => h > MEADOW && Math.hypot(x - cx, y - cy) > 80, 30, 2);
  place('bush', 70, (h) => h > GRASS + 0.04, 26, 3);
  place('rock', 60, (h) => h > SAND + 0.015, 34, 3);
  decor.sort((a, b) => a.y - b.y);

  // kleine Details (werden in den Boden gezeichnet)
  const details: Detail[] = [];
  for (let k = 0; k < 9000; k++) {
    const x = Math.round(cx + (r() - 0.5) * 2 * R * 1.1);
    const y = Math.round(cy + (r() - 0.5) * 2 * R * 1.1);
    const h = at(x, y);
    if (h < SAND) continue;
    const v = Math.floor(r() * 4);
    if (h > GRASS + 0.015) {
      const p = r();
      if (p < 0.55) details.push({ kind: 'tuft', x, y, variant: v });
      else if (p < 0.75) details.push({ kind: 'clover', x, y, variant: v });
      else if (p < 0.9) details.push({ kind: 'flower', x, y, variant: v });
    } else if (h > SAND + 0.012 && h < GRASS - 0.012) {
      const p = r();
      if (p < 0.035) details.push({ kind: 'shell', x, y, variant: v });
      else if (p < 0.05) details.push({ kind: 'star', x, y, variant: v });
      else if (p < 0.12) details.push({ kind: 'pebble', x, y, variant: v });
    }
  }
  return { height, ground, decor, details };
}

/** Größe der Landfläche und ob sie zusammenhängt (für Tests) */
export function landInfo(isl: Island) {
  let land = 0;
  let start = -1;
  for (let i = 0; i < isl.ground.length; i++)
    if (isl.ground[i] >= Ground.Sand) {
      land++;
      if (start < 0 || Math.abs((i % W) - W / 2) + Math.abs(Math.floor(i / W) - H / 2) < Math.abs((start % W) - W / 2) + Math.abs(Math.floor(start / W) - H / 2)) start = i;
    }
  // Flutfüllung vom Mittelpunkt aus
  const seen = new Uint8Array(isl.ground.length);
  const stack = [start];
  seen[start] = 1;
  let reached = 0;
  while (stack.length) {
    const i = stack.pop()!;
    reached++;
    const x = i % W;
    for (const n of [i - 1, i + 1, i - W, i + W]) {
      if (n < 0 || n >= isl.ground.length || seen[n] || isl.ground[n] < Ground.Sand) continue;
      if ((n === i - 1 && x === 0) || (n === i + 1 && x === W - 1)) continue;
      seen[n] = 1;
      stack.push(n);
    }
  }
  return { land, main: reached };
}
