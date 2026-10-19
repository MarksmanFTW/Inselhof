/**
 * Pixel-Grafiken, selbst erzeugt: runde Formen werden wie gemalt schattiert
 * (Licht von links oben), mit dunkler Umrandung und leichtem Rauschen.
 */
import { rng } from './island';

export interface Sprite {
  img: HTMLCanvasElement;
  /** Fußpunkt im Bild */
  ox: number;
  oy: number;
  /** Zeile, ab der nach oben gewippt wird (Krone) */
  split: number;
}

type Pal = { outline: string; dark: string; mid: string; light: string; hi: string };
const LEAF: Pal[] = [
  { outline: '#1f4a35', dark: '#2f7a45', mid: '#43a04f', light: '#68c15a', hi: '#9be27a' },
  { outline: '#1f4a35', dark: '#2a6e48', mid: '#3c9355', light: '#5db863', hi: '#8fd97e' },
  { outline: '#3a3a1c', dark: '#5f7d2a', mid: '#7fa534', light: '#a3c943', hi: '#d1ea6b' },
];
const ROCK: Pal = { outline: '#3b3a4a', dark: '#6b6b7e', mid: '#8d8fa0', light: '#b4b6c4', hi: '#dfe1ea' };

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Klumpen aus Kreisen, schattiert und umrandet */
function blob(g: CanvasRenderingContext2D, w: number, h: number, circles: [number, number, number][], pal: Pal, seed: number, outline = true) {
  const r = rng(seed);
  const inside = new Int16Array(w * h).fill(-1);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      circles.forEach(([cx, cy, cr], k) => {
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= cr * cr) inside[y * w + x] = k;
      });
  const noise = Array.from({ length: w * h }, () => r() - 0.5);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = inside[y * w + x];
      if (k < 0) {
        if (!outline) continue;
        const nb = [inside[y * w + x - 1], inside[y * w + x + 1], inside[(y - 1) * w + x], inside[(y + 1) * w + x]];
        if ((x > 0 && nb[0] >= 0) || (x < w - 1 && nb[1] >= 0) || (y > 0 && nb[2] >= 0) || (y < h - 1 && nb[3] >= 0)) {
          g.fillStyle = pal.outline;
          g.fillRect(x, y, 1, 1);
        }
        continue;
      }
      const [cx, cy, cr] = circles[k];
      const nx = (x + 0.5 - cx) / cr;
      const ny = (y + 0.5 - cy) / cr;
      // Licht von links oben, plus Pixel-Rauschen für Blätter-Struktur
      const s = -nx * 0.55 - ny * 0.8 + noise[y * w + x] * 0.55;
      g.fillStyle = s > 0.62 ? pal.hi : s > 0.18 ? pal.light : s > -0.38 ? pal.mid : pal.dark;
      g.fillRect(x, y, 1, 1);
    }
}

function px(g: CanvasRenderingContext2D, color: string, pts: [number, number][]) {
  g.fillStyle = color;
  for (const [x, y] of pts) g.fillRect(x, y, 1, 1);
}

function oak(v: number): Sprite {
  const w = 26;
  const h = 32;
  const c = canvas(w, h);
  const g = c.getContext('2d')!;
  // Stamm
  g.fillStyle = '#3d2616';
  g.fillRect(10, 18, 6, 13);
  g.fillStyle = '#7a4b2a';
  g.fillRect(11, 18, 4, 13);
  g.fillStyle = '#9b6539';
  g.fillRect(11, 18, 1, 12);
  px(g, '#3d2616', [[9, 30], [16, 30], [12, 24], [13, 27]]);
  const layouts: [number, number, number][][] = [
    [[13, 11, 9.5], [7, 15, 6], [19, 15, 6], [13, 17, 7]],
    [[11, 10, 8], [17, 12, 8], [8, 17, 6], [18, 18, 6], [13, 17, 7]],
    [[13, 9, 8], [8, 13, 6.5], [18, 13, 6.5], [13, 16, 8]],
  ];
  blob(g, w, 25, layouts[v % 3], LEAF[v % 2], 11 + v);
  // ein paar Äpfel am ersten Baum
  if (v === 0) px(g, '#e8433b', [[8, 12], [18, 9], [15, 17], [10, 19]]);
  return { img: c, ox: 13, oy: 31, split: 19 };
}

function pine(v: number): Sprite {
  const w = 22;
  const h = 34;
  const c = canvas(w, h);
  const g = c.getContext('2d')!;
  g.fillStyle = '#3d2616';
  g.fillRect(9, 26, 4, 7);
  g.fillStyle = '#7a4b2a';
  g.fillRect(10, 26, 2, 7);
  const pal = LEAF[1];
  // Stockwerke aus Dreiecken
  const tiers = [
    [11, 2, 4, 9],
    [11, 7, 7, 15],
    [11, 13, 10, 22],
    [11, 18, 10.5, 28],
  ];
  for (const [cx, top, half, bottom] of tiers) {
    for (let y = top; y <= bottom; y++) {
      const k = (y - top) / (bottom - top);
      const hw = Math.round(half * k);
      for (let x = cx - hw; x <= cx + hw; x++) {
        const edge = x === cx - hw || x === cx + hw || y === bottom;
        const s = (cx - x) / (half + 1) - k * 0.6 + ((x * 7 + y * 3) % 5) * 0.06;
        g.fillStyle = edge ? pal.outline : s > 0.35 ? pal.light : s > -0.1 ? pal.mid : pal.dark;
        g.fillRect(x, y, 1, 1);
      }
    }
  }
  if (v === 1) px(g, '#ffffff', [[8, 12], [14, 18], [7, 22]]);
  return { img: c, ox: 11, oy: 33, split: 26 };
}

function palm(v: number): Sprite {
  const w = 34;
  const h = 40;
  const c = canvas(w, h);
  const g = c.getContext('2d')!;
  // gebogener Stamm mit Ringen
  const bend = v ? -1 : 1;
  for (let y = 12; y < 39; y++) {
    const k = (39 - y) / 27;
    const x = Math.round(17 + bend * Math.sin(k * 1.4) * 5);
    g.fillStyle = '#5a3a20';
    g.fillRect(x - 2, y, 5, 1);
    g.fillStyle = y % 3 === 0 ? '#8a5a32' : '#b7834c';
    g.fillRect(x - 1, y, 3, 1);
    if (y % 3 !== 0) px(g, '#d3a066', [[x - 1, y]]);
  }
  const topX = Math.round(17 + bend * Math.sin(1.4) * 5);
  // Wedel: Bögen, die nach außen hängen
  const fronds = [-2.6, -1.9, -1.1, -0.35, 0.35, 1.1, 1.9, 2.6];
  fronds.forEach((a, i) => {
    const len = 12 + (i % 2) * 3;
    for (let s = 0; s < len; s++) {
      const t = s / len;
      const x = topX + Math.sin(a) * s * 1.05;
      const y = 11 - Math.cos(a) * s * 0.55 + t * t * 9;
      const thick = Math.max(0, Math.round((1 - t) * 2.2));
      for (let d = -thick; d <= thick; d++) {
        g.fillStyle = Math.abs(d) === thick ? '#1f4a35' : d < 0 ? '#8fd96a' : '#4aa04a';
        g.fillRect(Math.round(x), Math.round(y + d), 1, 1);
      }
    }
  });
  // Kokosnüsse
  px(g, '#5a3a1c', [[topX - 1, 13], [topX + 1, 13], [topX, 14]]);
  px(g, '#8a5a2c', [[topX - 1, 12], [topX + 1, 12]]);
  return { img: c, ox: 17, oy: 39, split: 16 };
}

function bush(v: number): Sprite {
  const w = 18;
  const h = 13;
  const c = canvas(w, h);
  const g = c.getContext('2d')!;
  blob(g, w, h, [[6, 8, 4.5], [11, 7, 5], [14, 9, 3.5], [9, 9, 4.5]], LEAF[v === 2 ? 2 : 0], 31 + v);
  if (v === 0) px(g, '#e8433b', [[5, 6], [10, 5], [13, 8], [8, 9]]);
  if (v === 1) px(g, '#fff7d6', [[6, 6], [11, 4], [14, 8], [9, 9], [4, 9]]);
  return { img: c, ox: 9, oy: 12, split: 4 };
}

function rock(v: number): Sprite {
  const w = 16;
  const h = 11;
  const c = canvas(w, h);
  const g = c.getContext('2d')!;
  const layouts: [number, number, number][][] = [
    [[8, 7, 5.5], [5, 8, 3.5], [11, 8, 3.8]],
    [[7, 7, 4.5], [10, 8, 3.5]],
    [[8, 6.5, 5], [4, 8, 3]],
  ];
  blob(g, w, h, layouts[v % 3], ROCK, 51 + v);
  // Moos oben auf
  if (v === 2) px(g, '#6fb54f', [[6, 2], [7, 2], [8, 2], [9, 2], [7, 3], [8, 3], [5, 3]]);
  return { img: c, ox: 8, oy: 10, split: 99 };
}

export type SpriteSet = Record<'oak' | 'pine' | 'palm' | 'bush' | 'rock', Sprite[]>;
export function makeSprites(): SpriteSet {
  return {
    oak: [0, 1, 2].map(oak),
    pine: [0, 1].map(pine),
    palm: [0, 1].map(palm),
    bush: [0, 1, 2].map(bush),
    rock: [0, 1, 2].map(rock),
  };
}

/** Kleine Tiere: je zwei Bilder (Flügel oben/unten) */
function frames(rows: string[][], pal: Record<string, string>) {
  return rows.map((r) => {
    const c = canvas(r[0].length, r.length);
    const g = c.getContext('2d')!;
    r.forEach((line, y) =>
      [...line].forEach((ch, x) => {
        if (pal[ch]) {
          g.fillStyle = pal[ch];
          g.fillRect(x, y, 1, 1);
        }
      }),
    );
    return c;
  });
}
export const gull = () =>
  frames(
    [
      ['k.......k', '.kw...wk.', '..wwwww..', '....o....'],
      ['.........', 'kwwwwwwwk', '..wwwww..', '....o....'],
    ],
    { k: '#4a4f63', w: '#ffffff', o: '#ffb347' },
  );
export const butterfly = (color: string) =>
  frames(
    [
      ['c.c', 'cbc', 'c.c'],
      ['...', 'cbc', '...'],
    ],
    { c: color, b: '#3a2a2a' },
  );
