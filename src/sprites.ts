/**
 * Pixel-Grafiken im RPG-Stil der Vorlage, selbst erzeugt: dunkle, buckelige
 * Baumkronen („Blumenkohl“) mit fast schwarzer Umrandung, jeder Buckel
 * von links oben beleuchtet; Hecken-Büsche, spitzes hohes Gras, Palmen.
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
// Farben nach der Vorlage: sehr dunkles Laub, nur oben links heller
const TREE: Pal = { outline: '#0a2410', dark: '#163e20', mid: '#245c2c', light: '#357a3a', hi: '#5a9e4e' };
const BUSH: Pal = { outline: '#0a2410', dark: '#22582a', mid: '#347a34', light: '#4c9a40', hi: '#72bc58' };
const STONE: Pal = { outline: '#24222a', dark: '#5c5966', mid: '#86838f', light: '#aeabb6', hi: '#d6d4dc' };
const BROWN: Pal = { outline: '#24140a', dark: '#6a4628', mid: '#8c6440', light: '#ad8458', hi: '#cba676' };

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/**
 * Klumpen aus Kreisen: jeder Kreis eigener Buckel mit Licht oben links,
 * leichte Blatt-Struktur, dunkle Umrandung (auch zwischen den Buckeln).
 */
function blob(g: CanvasRenderingContext2D, w: number, h: number, circles: [number, number, number][], pal: Pal, seed: number, texture = 0.35) {
  const r = rng(seed);
  const inside = new Uint8Array(w * h);
  let minX = w, maxX = 0, minY = h, maxY = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (circles.some(([cx, cy, cr]) => (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= cr * cr)) {
        inside[y * w + x] = 1;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
  // Licht für die ganze Krone von links oben (wie die Vorlage), nicht je Buckel
  const gcx = (minX + maxX) / 2;
  const gcy = (minY + maxY) / 2;
  const gr = Math.max(maxX - minX, maxY - minY) / 2 + 1;
  const isIn = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && inside[y * w + x] === 1;
  // Blattbüschel: kleine Gruppen mit hellem Bogen oben und dunkler Kante unten
  const shade = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!inside[y * w + x]) continue;
      const nx = (x + 0.5 - gcx) / gr;
      const ny = (y + 0.5 - gcy) / gr;
      // Kante unten/rechts dunkler, Rand allgemein etwas dunkler
      const edge = isIn(x, y + 2) && isIn(x + 2, y) && isIn(x - 1, y) && isIn(x, y - 1) ? 0 : -0.25;
      shade[y * w + x] = -nx * 0.6 - ny * 0.9 + edge;
    }
  for (let k = 0; k < (w * h) / 9; k++) {
    const x = Math.floor(r() * w);
    const y = Math.floor(r() * h);
    if (!isIn(x, y)) continue;
    // Büschel: Bogen hell, darunter dunkel
    const d = texture * (0.8 + r() * 0.6);
    for (const [ax, ay, v] of [[0, 0, d], [1, 0, d], [-1, 1, d * 0.6], [2, 1, d * 0.6], [0, 2, -d], [1, 2, -d], [-1, 2, -d * 0.6], [2, 2, -d * 0.6]] as const)
      if (isIn(x + ax, y + ay)) shade[(y + ay) * w + x + ax] += v;
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!inside[y * w + x]) {
        if (isIn(x - 1, y) || isIn(x + 1, y) || isIn(x, y - 1) || isIn(x, y + 1)) {
          g.fillStyle = pal.outline;
          g.fillRect(x, y, 1, 1);
        }
        continue;
      }
      const sv = shade[y * w + x];
      g.fillStyle = sv > 0.85 ? pal.hi : sv > 0.25 ? pal.light : sv > -0.45 ? pal.mid : pal.dark;
      g.fillRect(x, y, 1, 1);
    }
}

function px(g: CanvasRenderingContext2D, color: string, pts: [number, number][]) {
  g.fillStyle = color;
  for (const [x, y] of pts) g.fillRect(x, y, 1, 1);
}

/** dicker Stamm mit Wurzeln und dunkler Umrandung */
function trunk(g: CanvasRenderingContext2D, cx: number, top: number, bottom: number, half: number) {
  for (let y = top; y <= bottom; y++) {
    const k = (y - top) / (bottom - top);
    const hw = Math.round(half + (k > 0.65 ? (k - 0.65) * 16 : 0));
    for (let x = cx - hw - 1; x <= cx + hw + 1; x++) {
      const edge = x === cx - hw - 1 || x === cx + hw + 1 || y === bottom;
      const rel = (x - (cx - hw)) / (2 * hw + 1);
      g.fillStyle = edge ? '#1e1008' : rel < 0.25 ? '#8c6038' : rel < 0.65 ? '#6a4426' : '#4a2c16';
      g.fillRect(x, y, 1, 1);
    }
    if (y % 5 === 2 && y < bottom - 3) px(g, '#36200e', [[cx - 1, y], [cx, y + 1], [cx + 2, y]]);
  }
}

/** Buckel rund um eine Grundform (wirkt wie Blumenkohl) */
function lumps(cx: number, cy: number, rx: number, ry: number, n: number, rr: number, seed: number): [number, number, number][] {
  const r = rng(seed);
  const out: [number, number, number][] = [[cx, cy + ry * 0.15, Math.min(rx, ry) * 0.95]];
  for (let i = 0; i < n; i++) {
    const a = Math.PI * 1.05 + (i / (n - 1)) * Math.PI * 0.9 * 2 - Math.PI * 0.05;
    out.push([cx + Math.cos(a) * rx * 0.72, cy + Math.sin(a) * ry * 0.72, rr * (0.85 + r() * 0.3)]);
  }
  // vordere, untere Buckel zuletzt (liegen vorne)
  out.push([cx - rx * 0.35, cy + ry * 0.45, rr * 1.05]);
  out.push([cx + rx * 0.35, cy + ry * 0.45, rr]);
  return out;
}

function fruitTree(v: number): Sprite {
  const w = 64;
  const h = 70;
  const c = canvas(w, h);
  const g = c.getContext('2d')!;
  trunk(g, 32, 42, 68, 5);
  const circles = lumps(32, 26, 27, 22, 9, 11, 17 + v * 5);
  blob(g, w, 54, circles, TREE, 11 + v * 7);
  const r = rng(91 + v);
  const inCanopy = (x: number, y: number) => circles.some(([cx, cy, cr]) => (x - cx) ** 2 + (y - cy) ** 2 < (cr - 3) ** 2);
  if (v === 0) {
    // blassgrüne runde Früchte
    for (let k = 0; k < 12; k++) {
      const x = 10 + Math.floor(r() * 44);
      const y = 8 + Math.floor(r() * 34);
      if (!inCanopy(x, y)) continue;
      px(g, '#0e2a12', [[x - 1, y], [x + 2, y], [x, y - 1], [x + 1, y - 1], [x, y + 2], [x + 1, y + 2]]);
      px(g, '#a8d47c', [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]);
      px(g, '#e2f5b8', [[x, y]]);
    }
  } else if (v === 1) {
    // Bananen-Stauden (gelb) seitlich
    for (const [bx, by] of [[42, 38], [47, 31]] as const) {
      // gebogene Bananen-Hand
      for (let k = 0; k < 3; k++) {
        const x = bx + k * 2;
        px(g, '#2a1e06', [[x - 1, by + k], [x + 2, by + k], [x, by + 5 + k], [x + 1, by + 5 + k]]);
        px(g, '#f2d040', [[x, by + k], [x + 1, by + k], [x, by + 1 + k], [x + 1, by + 2 + k], [x, by + 3 + k], [x + 1, by + 4 + k]]);
        px(g, '#fff3a0', [[x, by + k]]);
        px(g, '#b8901e', [[x + 1, by + 3 + k], [x, by + 4 + k]]);
      }
    }
  } else {
    // kleine gelbe Früchte
    for (let k = 0; k < 10; k++) {
      const x = 10 + Math.floor(r() * 44);
      const y = 10 + Math.floor(r() * 32);
      if (!inCanopy(x, y)) continue;
      px(g, '#061a0c', [[x - 1, y], [x + 2, y], [x, y + 2], [x + 1, y + 2], [x, y - 1], [x + 1, y - 1]]);
      px(g, '#f0c838', [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]);
      px(g, '#fff2a0', [[x, y]]);
    }
  }
  return { img: c, ox: 32, oy: 68, split: 46 };
}

function palm(v: number): Sprite {
  const w = 64;
  const h = 70;
  const c = canvas(w, h);
  const g = c.getContext('2d')!;
  const bend = v ? -1 : 1;
  // gebogener, geringelter Stamm
  for (let y = 20; y < 69; y++) {
    const k = (69 - y) / 49;
    const x = Math.round(32 + bend * Math.sin(k * 1.6) * 10);
    const ring = y % 4 === 0;
    for (let d = -4; d <= 4; d++) {
      const edge = Math.abs(d) === 4;
      g.fillStyle = edge ? '#1e1008' : ring ? '#7a5434' : d < -1 ? '#d8aa70' : d < 2 ? '#b88654' : '#8a6038';
      g.fillRect(x + d, y, 1, 1);
    }
  }
  const topX = Math.round(32 + bend * Math.sin(1.6) * 10);
  const fronds: [number, number][] = [
    [-0.35, 13], [0.35, 13], [-1.0, 17], [1.0, 17], [-2.9, 15], [2.9, 15], [-1.7, 20], [1.7, 20], [-2.35, 20], [2.35, 20], [-1.25, 19], [1.25, 19],
  ];
  // hintere Wedel dunkler, vordere heller (wie Vorlage: blaugrün)
  for (const [a, len] of fronds) {
    const back = Math.abs(a) < 1.1;
    const [ol, mid, rib, light2] = back ? ['#0a2414', '#1f5a3e', '#3a7a56', '#2a6a48'] : ['#0a2414', '#2f7650', '#6ab07a', '#47915e'];
    for (let s = 0; s < len; s++) {
      const t = s / len;
      const x = topX + Math.sin(a) * s * 1.15;
      const y = 19 - Math.cos(a) * s * 0.55 + t * t * 15;
      const thick = Math.max(0, Math.round(Math.sin(Math.min(1, t * 1.3 + 0.15) * Math.PI) * 4 + 0.6));
      for (let d = -thick; d <= thick; d++) {
        g.fillStyle = Math.abs(d) === thick ? ol : d === 0 ? rib : d < 0 ? light2 : mid;
        g.fillRect(Math.round(x), Math.round(y + d), 1, 1);
      }
      if (s % 3 === 1 && t > 0.15) px(g, ol, [[Math.round(x), Math.round(y + thick + 1)]]);
    }
  }
  return { img: c, ox: 32, oy: 69, split: 26 };
}

function bush(v: number): Sprite {
  const w = 42;
  const h = 32;
  const c = canvas(w, h);
  const g = c.getContext('2d')!;
  // breite Hecke mit buckeliger Oberkante
  const circles: [number, number, number][] = [
    [21, 19, 13],
    [9, 16, 7.5], [16, 11, 8], [25, 10, 8.5], [33, 15, 7.5],
    [11, 23, 8], [21, 24, 8.5], [31, 23, 8],
  ];
  blob(g, w, h, circles, BUSH, 31 + v, 0.25);
  return { img: c, ox: 21, oy: 31, split: 10 };
}

/** spitzes hohes Gras (dunkle Blätter mit hellen Spitzen) */
function tallGrass(v: number): Sprite {
  const w = 16;
  const h = 14;
  const c = canvas(w, h);
  const g = c.getContext('2d')!;
  const r = rng(61 + v);
  const leaves: { x: number; top: number; lean: number }[] = [];
  for (let b = 0; b < 4 + v; b++) leaves.push({ x: 3 + Math.floor(r() * 10), top: 2 + Math.floor(r() * 5), lean: (r() - 0.5) * 0.7 });
  // erst Umriss, dann Füllung → jedes Blatt hat eine schwarze Kante
  for (const pass of [0, 1])
    for (const l of leaves)
      for (let y = l.top; y <= 13; y++) {
        const t = (y - l.top) / (13 - l.top);
        const half = Math.round(t * 2.2);
        const cx = Math.round(l.x + l.lean * (13 - y));
        for (let x = cx - half - 1; x <= cx + half + 1; x++) {
          const edge = x === cx - half - 1 || x === cx + half + 1;
          if (pass === 0 && edge) px(g, '#061a0c', [[x, y]]);
          if (pass === 1 && !edge) px(g, t < 0.3 ? '#6aa84c' : x < cx ? '#3f7a30' : '#285a24', [[x, y]]);
        }
        if (pass === 0) px(g, '#061a0c', [[cx, l.top - 1]]);
      }
  return { img: c, ox: 8, oy: 13, split: 7 };
}

function rock(v: number): Sprite {
  const w = 18;
  const h = 12;
  const c = canvas(w, h);
  const g = c.getContext('2d')!;
  const layouts: [number, number, number][][] = [
    [[6, 7, 4], [11, 8, 3.5], [14, 9, 2.5]],
    [[7, 7, 4.2], [12, 8, 3.2]],
  ];
  blob(g, w, h, layouts[v % 2], STONE, 51 + v, 0.1);
  return { img: c, ox: 9, oy: 11, split: 99 };
}

function boulder(): Sprite {
  const w = 34;
  const h = 22;
  const c = canvas(w, h);
  const g = c.getContext('2d')!;
  blob(g, w, h, [[11, 11, 8.5], [22, 13, 8], [16, 15, 6]], BROWN, 71, 0.15);
  return { img: c, ox: 17, oy: 21, split: 99 };
}

function stump(): Sprite {
  const w = 18;
  const h = 14;
  const c = canvas(w, h);
  const g = c.getContext('2d')!;
  trunk(g, 9, 4, 13, 4);
  g.fillStyle = '#1e1008';
  g.fillRect(4, 2, 11, 4);
  g.fillStyle = '#d2ae76';
  g.fillRect(5, 3, 9, 2);
  px(g, '#9c7444', [[7, 3], [8, 4], [9, 3], [10, 4], [11, 3]]);
  return { img: c, ox: 9, oy: 13, split: 99 };
}

export type SpriteSet = Record<'tree' | 'palm' | 'bush' | 'rock' | 'boulder' | 'grass' | 'stump', Sprite[]>;
export function makeSprites(): SpriteSet {
  return {
    tree: [0, 1, 2].map(fruitTree),
    palm: [0, 1].map(palm),
    bush: [0, 1].map(bush),
    grass: [0, 1, 2].map(tallGrass),
    rock: [0, 1].map(rock),
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
