/**
 * Pixel-Grafiken im RPG-Stil, selbst erzeugt: runde Formen werden wie
 * gemalt schattiert (Licht von links oben), mit kräftiger dunkler Umrandung,
 * Blätter-Struktur und hellen Tupfen.
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

type Pal = { outline: string; dark: string; mid: string; light: string; hi: string; dot?: string };
const LEAF: Pal = { outline: '#14301a', dark: '#2a5f28', mid: '#3f8432', light: '#5ea83f', hi: '#86c955', dot: '#c2e889' };
const LEAF2: Pal = { outline: '#14301a', dark: '#2c6530', mid: '#3e8a3e', light: '#5cad4b', hi: '#85cc62', dot: '#bfe7a0' };
const STONE: Pal = { outline: '#2c2a33', dark: '#5f5c68', mid: '#827f8c', light: '#a9a6b2', hi: '#d2d0d8' };
const BROWN: Pal = { outline: '#2a1a10', dark: '#6b4a2e', mid: '#8e6a44', light: '#b08a5c', hi: '#cfae7c' };

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Klumpen aus Kreisen, schattiert, mit Blatt-Rauschen und Umrandung */
function blob(g: CanvasRenderingContext2D, w: number, h: number, circles: [number, number, number][], pal: Pal, seed: number, leafy = true) {
  const r = rng(seed);
  const inside = new Int16Array(w * h).fill(-1);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      circles.forEach(([cx, cy, cr], k) => {
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= cr * cr) inside[y * w + x] = k;
      });
  // grobes Rauschen in 2×2-Klumpen → wirkt wie Blattbüschel
  const clump = Array.from({ length: Math.ceil(w / 2) * Math.ceil(h / 2) }, () => r() - 0.5);
  const cl = (x: number, y: number) => clump[(y >> 1) * Math.ceil(w / 2) + (x >> 1)];
  const isIn = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && inside[y * w + x] >= 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = inside[y * w + x];
      if (k < 0) {
        if (isIn(x - 1, y) || isIn(x + 1, y) || isIn(x, y - 1) || isIn(x, y + 1)) {
          g.fillStyle = pal.outline;
          g.fillRect(x, y, 1, 1);
        }
        continue;
      }
      const [cx, cy, cr] = circles[k];
      const nx = (x + 0.5 - cx) / cr;
      const ny = (y + 0.5 - cy) / cr;
      // Licht von links oben; untere Hälfte des ganzen Klumpens dunkler
      let s = -nx * 0.5 - ny * 0.75 + (leafy ? cl(x, y) * 0.75 : (r() - 0.5) * 0.25);
      s -= (y / h - 0.5) * 0.5;
      // Innenkante zwischen Kreisen leicht abdunkeln
      if (!isIn(x, y + 1) || inside[(y + 1) * w + x] !== k) s -= 0.15;
      g.fillStyle = s > 0.68 ? pal.hi : s > 0.2 ? pal.light : s > -0.35 ? pal.mid : pal.dark;
      g.fillRect(x, y, 1, 1);
    }
  // helle Tupfen oben links
  if (pal.dot)
    for (let k = 0; k < (w * h) / 70; k++) {
      const x = Math.floor(r() * w);
      const y = Math.floor(r() * h * 0.7);
      if (!isIn(x, y) || !isIn(x + 1, y + 1)) continue;
      const [cx, cy, cr] = circles[inside[y * w + x]];
      if ((x - cx) / cr + (y - cy) / cr > 0.1) continue;
      g.fillStyle = pal.dot;
      g.fillRect(x, y, 1, 1);
      if (r() < 0.5) g.fillRect(x + 1, y, 1, 1);
    }
}

function px(g: CanvasRenderingContext2D, color: string, pts: [number, number][]) {
  g.fillStyle = color;
  for (const [x, y] of pts) g.fillRect(x, y, 1, 1);
}

/** Stamm mit Wurzeln */
function trunk(g: CanvasRenderingContext2D, cx: number, top: number, bottom: number, half: number) {
  for (let y = top; y <= bottom; y++) {
    const k = (y - top) / (bottom - top);
    const hw = Math.round(half + (k > 0.7 ? (k - 0.7) * 12 : 0));
    for (let x = cx - hw - 1; x <= cx + hw + 1; x++) {
      const edge = x === cx - hw - 1 || x === cx + hw + 1 || y === bottom;
      const rel = (x - (cx - hw)) / (2 * hw + 1);
      g.fillStyle = edge ? '#2a170c' : rel < 0.3 ? '#a8733f' : rel < 0.7 ? '#80542e' : '#5a381e';
      g.fillRect(x, y, 1, 1);
    }
    // Rindenlinien
    if (y % 4 === 1 && y < bottom - 2) px(g, '#4a2c16', [[cx, y], [cx - 1, y + 1]]);
  }
}

function fruitTree(v: number): Sprite {
  const w = 50;
  const h = 56;
  const c = canvas(w, h);
  const g = c.getContext('2d')!;
  trunk(g, 25, 34, 54, 4);
  const layout: [number, number, number][] =
    v === 0
      ? [[25, 18, 15], [13, 24, 10], [37, 24, 10], [19, 31, 10], [32, 31, 10], [25, 9, 9]]
      : [[24, 17, 14], [12, 24, 10], [36, 22, 11], [22, 31, 11], [34, 31, 9]];
  blob(g, w, 42, layout, v ? LEAF2 : LEAF, 11 + v * 7);
  // Früchte (orange) mit Glanzpunkt
  const r = rng(91 + v);
  const fruit = v === 0 ? '#f0952a' : '#e8c03a';
  for (let k = 0; k < 9; k++) {
    const x = 9 + Math.floor(r() * 32);
    const y = 10 + Math.floor(r() * 26);
    const d = layout.some(([cx, cy, cr]) => (x - cx) ** 2 + (y - cy) ** 2 < (cr - 2) ** 2);
    if (!d) continue;
    px(g, '#7a3c10', [[x, y + 2], [x + 1, y + 2], [x + 2, y + 1]]);
    px(g, fruit, [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1], [x + 2, y]]);
    px(g, '#ffe39a', [[x, y]]);
  }
  return { img: c, ox: 25, oy: 54, split: 36 };
}

function palm(v: number): Sprite {
  const w = 54;
  const h = 58;
  const c = canvas(w, h);
  const g = c.getContext('2d')!;
  const bend = v ? -1 : 1;
  // gebogener, geringelter Stamm
  for (let y = 16; y < 57; y++) {
    const k = (57 - y) / 41;
    const x = Math.round(27 + bend * Math.sin(k * 1.5) * 8);
    const ring = y % 4 === 0;
    for (let d = -3; d <= 3; d++) {
      const edge = Math.abs(d) === 3;
      g.fillStyle = edge ? '#2a170c' : ring ? '#6e4424' : d < -1 ? '#c8935a' : d < 1 ? '#a5713f' : '#7c5230';
      g.fillRect(x + d, y, 1, 1);
    }
  }
  const topX = Math.round(27 + bend * Math.sin(1.5) * 8);
  // Wedel: lange Bögen mit Mittelrippe, die nach außen hängen
  const fronds: [number, number][] = [
    [-2.75, 15], [-2.05, 19], [-1.3, 18], [-0.55, 14], [0.55, 14], [1.3, 18], [2.05, 19], [2.75, 15], [3.14, 10],
  ];
  const leaf = (dark: boolean) => (dark ? ['#173f1c', '#2c6a2c', '#4a9a3a'] : ['#173f1c', '#3a8236', '#6cbb4c']);
  for (const [a, len] of fronds) {
    const [ol, mid, rib] = leaf(Math.abs(a) > 1.6);
    for (let s = 0; s < len; s++) {
      const t = s / len;
      const x = topX + Math.sin(a) * s * 1.15;
      const y = 15 - Math.cos(a) * s * 0.5 + t * t * 13;
      const thick = Math.max(0, Math.round((1 - t) * 3.2 + 0.4));
      for (let d = -thick; d <= thick; d++) {
        g.fillStyle = Math.abs(d) === thick ? ol : d === 0 ? rib : mid;
        g.fillRect(Math.round(x), Math.round(y + d), 1, 1);
      }
      // gezackte Blattspitzen
      if (s % 3 === 0 && t > 0.2) px(g, ol, [[Math.round(x), Math.round(y + thick + 1)]]);
    }
  }
  // Kokosnüsse
  px(g, '#2a170c', [[topX - 3, 15], [topX + 2, 15], [topX - 1, 17], [topX, 17]]);
  px(g, '#6a4220', [[topX - 2, 15], [topX - 2, 16], [topX + 1, 15], [topX + 1, 16], [topX - 1, 16], [topX, 16]]);
  px(g, '#a5713f', [[topX - 2, 15], [topX + 1, 15]]);
  return { img: c, ox: 27, oy: 57, split: 22 };
}

function bush(v: number): Sprite {
  const w = 34;
  const h = 26;
  const c = canvas(w, h);
  const g = c.getContext('2d')!;
  blob(g, w, h, [[10, 15, 8.5], [18, 11, 10], [25, 15, 8], [17, 17, 8]], v ? LEAF2 : LEAF, 31 + v);
  if (v === 1) px(g, '#e8433b', [[10, 12], [20, 8], [24, 14], [14, 17], [7, 17]]);
  return { img: c, ox: 17, oy: 25, split: 8 };
}

function tallGrass(v: number): Sprite {
  const w = 12;
  const h = 12;
  const c = canvas(w, h);
  const g = c.getContext('2d')!;
  const r = rng(61 + v);
  // einzelne Halme, außen dunkel umrandet
  const blades = 5 + v;
  for (let b = 0; b < blades; b++) {
    const x0 = 2 + Math.floor(r() * 8);
    const len = 6 + Math.floor(r() * 5);
    const lean = (r() - 0.5) * 0.9;
    for (let s = 0; s < len; s++) {
      const x = Math.round(x0 + lean * s);
      const y = 11 - s;
      px(g, '#14301a', [[x - 1, y], [x + 1, y]]);
    }
  }
  r();
  const r2 = rng(61 + v);
  for (let b = 0; b < blades; b++) {
    const x0 = 2 + Math.floor(r2() * 8);
    const len = 6 + Math.floor(r2() * 5);
    const lean = (r2() - 0.5) * 0.9;
    for (let s = 0; s < len; s++) {
      const x = Math.round(x0 + lean * s);
      const y = 11 - s;
      px(g, s > len - 3 ? '#8fd15c' : s > len / 2 ? '#5aa53c' : '#3c7f2c', [[x, y]]);
    }
  }
  return { img: c, ox: 6, oy: 11, split: 6 };
}

function rock(v: number): Sprite {
  const w = 18;
  const h = 13;
  const c = canvas(w, h);
  const g = c.getContext('2d')!;
  const layouts: [number, number, number][][] = [
    [[9, 8, 5.5], [6, 9, 4]],
    [[9, 8, 5], [12, 9, 3.5]],
    [[8, 8, 5.5], [12, 9, 4]],
  ];
  blob(g, w, h, layouts[v % 3], STONE, 51 + v, false);
  return { img: c, ox: 9, oy: 12, split: 99 };
}

function boulder(): Sprite {
  const w = 30;
  const h = 18;
  const c = canvas(w, h);
  const g = c.getContext('2d')!;
  blob(g, w, h, [[10, 10, 7], [19, 11, 6], [24, 13, 4]], BROWN, 71, false);
  return { img: c, ox: 15, oy: 17, split: 99 };
}

function stump(): Sprite {
  const w = 18;
  const h = 14;
  const c = canvas(w, h);
  const g = c.getContext('2d')!;
  trunk(g, 9, 4, 13, 4);
  // Schnittfläche mit Jahresringen
  g.fillStyle = '#2a170c';
  g.fillRect(4, 2, 11, 4);
  g.fillStyle = '#d9b77f';
  g.fillRect(5, 3, 9, 2);
  px(g, '#a8814c', [[7, 3], [8, 4], [9, 3], [10, 4], [11, 3]]);
  return { img: c, ox: 9, oy: 13, split: 99 };
}

export type SpriteSet = Record<'tree' | 'palm' | 'bush' | 'rock' | 'boulder' | 'grass' | 'stump', Sprite[]>;
export function makeSprites(): SpriteSet {
  return {
    tree: [0, 1].map(fruitTree),
    palm: [0, 1].map(palm),
    bush: [0, 1].map(bush),
    grass: [0, 1, 2].map(tallGrass),
    rock: [0, 1, 2].map(rock),
    boulder: [boulder()],
    stump: [stump()],
  };
}

/** Kleine Tiere: je zwei Bilder (Flügel oben/unten) */
function frames(rows: string[][], pal: Record<string, string>) {
  return rows.map((rws) => {
    const c = canvas(rws[0].length, rws.length);
    const g = c.getContext('2d')!;
    rws.forEach((line, y) =>
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
    { k: '#3a3f52', w: '#ffffff', o: '#ffb347' },
  );
export const butterfly = (color: string) =>
  frames(
    [
      ['c.c', 'cbc', 'c.c'],
      ['...', 'cbc', '...'],
    ],
    { c: color, b: '#3a2a2a' },
  );
