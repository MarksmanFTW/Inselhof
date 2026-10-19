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
const TREE: Pal = { outline: '#08200e', dark: '#163c1e', mid: '#2a6630', light: '#3f8640', hi: '#68a85a' };
const BUSH: Pal = { outline: '#0a2410', dark: '#2a6a2e', mid: '#3e8a3a', light: '#56a648', hi: '#7cc460' };
const STONE: Pal = { outline: '#2a2830', dark: '#7a7884', mid: '#a4a2ac', light: '#c8c6ce', hi: '#eceaf0' };
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
      shade[y * w + x] = -nx * 0.75 - ny * 1.05 + edge;
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
  // rechter Baum der Vorlage: Krone höher, langer sichtbarer Stamm; die anderen fast ohne Stamm
  const h = v === 1 ? 62 : 56;
  const w = 56;
  const c = canvas(w, h);
  const g = c.getContext('2d')!;
  trunk(g, 28, v === 1 ? 26 : 34, h - 2, 4);
  const [rx, ry, cy] = v === 1 ? [20, 17, 20] : [24, 21, 26];
  const circles = lumps(28, cy, rx, ry, 9, 9.5, 17 + v * 5);
  blob(g, w, v === 1 ? 40 : 54, circles, TREE, 11 + v * 7);
  const r = rng(91 + v);
  const inCanopy = (x: number, y: number) => circles.some(([cx, cy, cr]) => (x - cx) ** 2 + (y - cy) ** 2 < (cr - 3) ** 2);
  if (v === 0) {
    // blassgrüne runde Früchte
    for (let k = 0; k < 12; k++) {
      const x = 8 + Math.floor(r() * 40);
      const y = 6 + Math.floor(r() * 34);
      if (!inCanopy(x, y)) continue;
      px(g, '#0e2a12', [[x - 1, y], [x + 2, y], [x, y - 1], [x + 1, y - 1], [x, y + 2], [x + 1, y + 2]]);
      px(g, '#a8d47c', [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]);
      px(g, '#e2f5b8', [[x, y]]);
    }
  } else if (v === 1) {
    // Bananen-Stauden (gelb) seitlich
    for (const [bx, by] of [[19, 40], [32, 46]] as const) {
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
      const x = 8 + Math.floor(r() * 40);
      const y = 8 + Math.floor(r() * 32);
      if (!inCanopy(x, y)) continue;
      px(g, '#061a0c', [[x - 1, y], [x + 2, y], [x, y + 2], [x + 1, y + 2], [x, y - 1], [x + 1, y - 1]]);
      px(g, '#f0c838', [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]);
      px(g, '#fff2a0', [[x, y]]);
    }
  }
  return { img: c, ox: 28, oy: h - 2, split: 40 };
}

function palm(v: number): Sprite {
  const w = 48;
  const h = 56;
  const c = canvas(w, h);
  const g = c.getContext('2d')!;
  const bend = v ? -1 : 1;
  // dicker, hell-brauner, gebogener Stamm
  for (let y = 22; y < 55; y++) {
    const k = (55 - y) / 33;
    const x = Math.round(24 + bend * Math.sin(k * 1.5) * 6);
    for (let d = -3; d <= 3; d++) {
      const edge = Math.abs(d) === 3;
      g.fillStyle = edge ? '#2a170c' : y % 5 === 0 ? '#8a6038' : d < 0 ? '#c99a62' : d < 2 ? '#a87a4a' : '#7c5432';
      g.fillRect(x + d, y, 1, 1);
    }
  }
  const cx = Math.round(24 + bend * Math.sin(1.5) * 6);
  const cy = 18;
  // Kuppel aus hängenden Wedeln: erst hinten (dunkel), dann vorne (hell)
  const fronds: number[] = [];
  for (let k = 0; k < 11; k++) fronds.push(Math.PI + (k / 10) * Math.PI); // obere Hälfte (hinten)
  for (let k = 0; k < 6; k++) fronds.push(0.25 + (k / 5) * (Math.PI - 0.5)); // untere Hälfte (vorne)
  const col = ['', '#24452c', '#3c6440', '#5a8a5c', '#86ae84'];
  fronds.forEach((a, i) => {
    const front = Math.sin(a) > 0;
    const len = front ? 13 : 15 + (i % 2) * 2;
    const fill = new Map<number, number>();
    for (let s2 = 0; s2 <= len; s2++) {
      const t = s2 / len;
      const x = cx + Math.cos(a) * s2;
      const y = cy + Math.sin(a) * s2 * 0.55 + t * t * 11;
      const half = Math.max(0.6, (1 - t) * 3.2);
      for (let d = -Math.ceil(half); d <= Math.ceil(half); d++) {
        const xx = Math.round(x - Math.sin(a) * d * 0.4);
        const yy = Math.round(y + d * 0.8);
        if (xx < 1 || yy < 1 || xx >= w - 1 || yy >= h - 1) continue;
        const tone = d === 0 && s2 % 2 === 0 ? 4 : d < 0 ? (front ? 3 : 2) : front ? 2 : 1;
        fill.set(yy * w + xx, tone);
      }
    }
    // erst die Kante dieses Wedels, dann seine Füllung → Wedel heben sich voneinander ab
    g.fillStyle = '#0c2a14';
    for (const k of fill.keys()) {
      const x = k % w;
      const y = (k / w) | 0;
      for (const n of [k - 1, k + 1, k - w, k + w]) if (!fill.has(n)) g.fillRect(n % w, (n / w) | 0, 1, 1);
      void x;
      void y;
    }
    for (const [k, tone] of fill) {
      g.fillStyle = col[tone];
      g.fillRect(k % w, (k / w) | 0, 1, 1);
    }
  });
  return { img: c, ox: 24, oy: 55, split: 28 };
}

function bush(v: number): Sprite {
  const w = 34;
  const h = 26;
  const c = canvas(w, h);
  const g = c.getContext('2d')!;
  // breite Hecke mit buckeliger Oberkante
  const circles: [number, number, number][] = [
    [17, 15, 10.5],
    [7, 13, 6], [13, 9, 6.5], [20, 8, 7], [27, 12, 6],
    [9, 19, 6.5], [17, 19.5, 7], [25, 19, 6.5],
  ];
  blob(g, w, h, circles, BUSH, 31 + v, 0.25);
  return { img: c, ox: 17, oy: 25, split: 8 };
}

/** Farn-Büschel: spitze Blätter fächern vom Boden aus (dunkel, mit hellen Spitzen) */
function tallGrass(v: number): Sprite {
  const w = 22;
  const h = 17;
  const c = canvas(w, h);
  const g = c.getContext('2d')!;
  const angles = v === 0 ? [-1.2, -0.6, 0, 0.6, 1.2] : v === 1 ? [-1.0, -0.35, 0.3, 0.95, -1.45, 1.4] : [-0.8, -0.1, 0.55, 1.2];
  const fill = new Uint8Array(w * h);
  angles.forEach((a, i) => {
    const len = 11 + ((i * 3 + v) % 4);
    for (let s2 = 0; s2 < len; s2++) {
      const t = s2 / len;
      const x = 11 + Math.sin(a) * s2;
      const y = 16 - Math.cos(a) * s2 * 0.9;
      const half = Math.sin(Math.min(1, t * 1.2 + 0.1) * Math.PI) * 2.2;
      for (let d = -Math.ceil(half); d <= Math.ceil(half); d++) {
        const px2 = Math.round(x + Math.cos(a) * d);
        const py2 = Math.round(y + Math.sin(a) * d * 0.6);
        if (px2 < 0 || py2 < 0 || px2 >= w || py2 >= h) continue;
        fill[py2 * w + px2] = t > 0.65 ? 3 : d < 0 ? 2 : 1;
      }
    }
  });
  const col = ['', '#163e18', '#2a6224', '#4f8e3a'];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const f = fill[y * w + x];
      if (f) px(g, col[f], [[x, y]]);
      else if (fill[y * w + x - 1] || fill[y * w + x + 1] || (y > 0 && fill[(y - 1) * w + x]) || (y < h - 1 && fill[(y + 1) * w + x])) px(g, '#08200e', [[x, y]]);
    }
  return { img: c, ox: 11, oy: 16, split: 7 };
}

function rock(v: number): Sprite {
  const w = 18;
  const h = 12;
  const c = canvas(w, h);
  const g = c.getContext('2d')!;
  const layouts: [number, number, number][][] = [
    [[4, 8, 2.6], [9, 6, 2.8], [13, 9, 2.4], [8, 10, 2]],
    [[5, 7, 2.8], [10, 9, 2.6], [14, 7, 2.2]],
  ];
  blob(g, w, h, layouts[v % 2], STONE, 51 + v, 0.1);
  return { img: c, ox: 9, oy: 11, split: 99 };
}

function boulder(): Sprite {
  const w = 34;
  const h = 22;
  const c = canvas(w, h);
  const g = c.getContext('2d')!;
  blob(g, w, h, [[10, 10, 6.5], [19, 14, 6.5]], BROWN, 71, 0.12);
  return { img: c, ox: 15, oy: 21, split: 99 };
}

/** kleiner brauner Stein im Gras */
function stump(): Sprite {
  const w = 10;
  const h = 9;
  const c = canvas(w, h);
  const g = c.getContext('2d')!;
  blob(g, w, h, [[5, 4.5, 3.6]], BROWN, 81, 0.08);
  return { img: c, ox: 5, oy: 8, split: 99 };
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
