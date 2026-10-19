/**
 * Boden einmal malen (Strand, Wiese, Details, Schatten) und das Wasser
 * jedes Bild neu: Wellen laufen zum Strand, Schaum pulsiert, Glitzern.
 */
import { GRASS, H, MEADOW, SAND, W, fbm, type Island } from './island';

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);
const bayer = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)];

/** '#rrggbb' → Pixelwert für Uint32 (ABGR, little endian) */
function rgba(hex: string, a = 255) {
  const n = parseInt(hex.slice(1), 16);
  return ((a << 24) | ((n & 0xff) << 16) | (n & 0xff00) | (n >> 16)) >>> 0;
}
const hash = (x: number, y: number, s = 0) => {
  let h = (x * 73856093) ^ (y * 19349663) ^ (s * 83492791);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const C = {
  wetSand: rgba('#dcc185'),
  sand: rgba('#f2dca0'),
  sandDot: rgba('#e3c98a'),
  sandHi: rgba('#fff2c8'),
  sandShade: rgba('#cfb172'),
  lip: rgba('#4f9a3e'),
  lipHi: rgba('#63b14c'),
  grass: [rgba('#71c152'), rgba('#7fcf5b'), rgba('#8edb66')],
  meadow: [rgba('#64b54c'), rgba('#70c055'), rgba('#7fcb5e')],
  grassDot: rgba('#5ead45'),
};

export function paintLand(isl: Island): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  const px = new Uint32Array(img.data.buffer);
  const patch = fbm(99);
  const { height } = isl;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const h = height[i];
      if (h < SAND) continue;
      if (h < GRASS) {
        // Strand: nass am Wasser, Schatten unter der Graskante, Sandkörner
        let col = h < SAND + 0.012 + bayer(x, y) * 0.008 ? C.wetSand : C.sand;
        if (h > GRASS - 0.006) col = C.sandShade;
        else {
          const r = hash(x, y);
          if (r < 0.05) col = C.sandDot;
          else if (r < 0.07) col = C.sandHi;
        }
        px[i] = col;
        continue;
      }
      // Graskante zum Strand
      if (h < GRASS + 0.007) {
        px[i] = h < GRASS + 0.0035 ? C.lip : C.lipHi;
        continue;
      }
      // Wiese mit weichen hellen/dunklen Flecken (gerastert wie Pixel-Art)
      const p = patch(x / 38, y / 38) * 2.2 + bayer(x, y) * 0.5;
      const pal = h > MEADOW ? C.meadow : C.grass;
      px[i] = p < -0.25 ? pal[0] : p > 0.3 ? pal[2] : pal[1];
      if (hash(x, y, 3) < 0.025) px[i] = C.grassDot;
    }
  g.putImageData(img, 0, 0);

  // Details
  const dot = (x: number, y: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(x, y, 1, 1);
  };
  const FLOWER = ['#ffffff', '#ffe066', '#ff8fb8', '#c9a3ff'];
  for (const d of isl.details) {
    const { x, y, variant: v } = d;
    if (d.kind === 'tuft') {
      dot(x, y, '#4e9c3d');
      dot(x + 2, y, '#4e9c3d');
      dot(x + 1, y + 1, '#4e9c3d');
      dot(x + 1, y, '#9be27a');
    } else if (d.kind === 'clover') {
      dot(x, y, '#5aa84a');
      dot(x + 1, y, '#5aa84a');
      dot(x, y + 1, '#5aa84a');
    } else if (d.kind === 'flower') {
      const c2 = FLOWER[v];
      dot(x, y - 1, c2);
      dot(x - 1, y, c2);
      dot(x + 1, y, c2);
      dot(x, y + 1, c2);
      dot(x, y, v === 1 ? '#f08a24' : '#ffd23f');
    } else if (d.kind === 'shell') {
      dot(x, y, '#ffd6e0');
      dot(x + 1, y, '#ffffff');
      dot(x, y + 1, '#e8a9b8');
      dot(x + 1, y + 1, '#ffd6e0');
    } else if (d.kind === 'star') {
      for (const [a, b] of [[0, 0], [-1, 0], [1, 0], [0, -1], [-1, 1], [1, 1]]) dot(x + a, y + b, '#ff9a4a');
      dot(x, y, '#ffcf8a');
    } else {
      dot(x, y, '#a9a7a0');
      dot(x + 1, y, '#8d8b85');
    }
  }
  return c;
}

/** Schatten unter Bäumen & Co (pixelige Ellipsen) */
export function paintShadows(g: CanvasRenderingContext2D, isl: Island) {
  const size: Record<string, [number, number]> = { oak: [11, 4], pine: [8, 3], palm: [9, 3], bush: [8, 2.5], rock: [7, 2.2] };
  g.fillStyle = 'rgba(25,60,45,0.28)';
  for (const d of isl.decor) {
    const [rx, ry] = size[d.kind];
    // Palmen werfen den Schatten der Krone etwas zur Seite
    const sx = d.kind === 'palm' ? d.x + (d.variant ? -4 : 4) : d.x + 1;
    for (let y = -Math.ceil(ry); y <= ry; y++)
      for (let x = -rx; x <= rx; x++) if ((x / rx) ** 2 + (y / ry) ** 2 <= 1) g.fillRect(sx + x, d.y + y, 1, 1);
  }
}

/** Wasser: Grundfarben fest, Schaum und Glitzern jedes Bild */
export class Water {
  readonly canvas = document.createElement('canvas');
  private g: CanvasRenderingContext2D;
  private img: ImageData;
  private px: Uint32Array;
  private base: Uint32Array;
  private near: Int32Array;
  private nearD: Float32Array;
  private nearN: Float32Array;
  private deep: Int32Array;
  readonly deepColor = '#2a7fbd';

  constructor(isl: Island) {
    this.canvas.width = W;
    this.canvas.height = H;
    this.g = this.canvas.getContext('2d')!;
    this.img = this.g.createImageData(W, H);
    this.px = new Uint32Array(this.img.data.buffer);
    this.base = new Uint32Array(W * H);
    const bands = ['#93e8dc', '#64d2d6', '#45b9d1', '#339bc8', '#2a7fbd'].map((c) => rgba(c));
    const edges = [0.035, 0.12, 0.27, 0.46];
    const near: number[] = [];
    const deep: number[] = [];
    const nd: number[] = [];
    const nn: number[] = [];
    const wob = fbm(7);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const h = isl.height[i];
        if (h >= SAND) continue;
        const d = Math.min(1, (SAND - h) / 0.62);
        const dd = d + bayer(x, y) * 0.035;
        let b = 0;
        while (b < edges.length && dd > edges[b]) b++;
        this.base[i] = bands[b];
        if (d < 0.2) {
          near.push(i);
          nd.push(d);
          nn.push(wob(x / 30, y / 30) * 6);
        } else deep.push(i);
      }
    this.near = Int32Array.from(near);
    this.nearD = Float32Array.from(nd);
    this.nearN = Float32Array.from(nn);
    this.deep = Int32Array.from(deep);
  }

  update(t: number) {
    const { px, base, near, nearD, nearN } = this;
    px.set(base);
    const foam = rgba('#ffffff');
    const crest = rgba('#d6fbf5');
    const shine = rgba('#b8f2ec');
    for (let k = 0; k < near.length; k++) {
      const i = near[k];
      const d = nearD[k];
      const x = i % W;
      const y = (i / W) | 0;
      // Schaumsaum am Ufer: atmet langsam vor und zurück
      const reach = 0.012 + 0.01 * Math.sin(t * 1.3 + nearN[k] * 0.6);
      if (d < reach) {
        px[i] = foam;
        continue;
      }
      // Wellenkämme, die zum Strand laufen
      const w = Math.sin(d * 85 + t * 2.1 + nearN[k]);
      if (w > 0.94 && d < 0.16 && bayer(x, y) > -0.3) px[i] = d < 0.08 ? crest : shine;
    }
    // Glitzern auf dem tiefen Wasser
    const tick = Math.floor(t * 5);
    const deep = this.deep;
    for (let k = 0; k < 90; k++) {
      const i = deep[Math.floor(hash(k, tick, 5) * deep.length)];
      px[i] = foam;
      if (hash(k, tick, 6) < 0.5 && i + 1 < px.length) px[i + 1] = shine;
    }
    this.g.putImageData(this.img, 0, 0);
  }
}
