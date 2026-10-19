/**
 * Boden einmal malen (Strand, Wiese mit dunkler Kante, Kleinkram, Schatten, Steg).
 * Meer: Wellenmuster als Kachel, die langsam treibt; am Ufer ein heller Saum
 * mit pulsierendem Schaum (jedes Bild neu).
 */
import { Ground, H, W, hash, type Island } from './island';

/** '#rrggbb' → Pixelwert für Uint32 (ABGR, little endian) */
function rgba(hex: string, a = 255) {
  const n = parseInt(hex.slice(1), 16);
  return ((a << 24) | ((n & 0xff) << 16) | (n & 0xff00) | (n >> 16)) >>> 0;
}

const C = {
  sand: rgba('#d9be87'),
  sandDot: rgba('#c9ac74'),
  sandHi: rgba('#e9d4a2'),
  sandShade: rgba('#c2a26b'),
  sandWet: rgba('#cdb27c'),
  grass: rgba('#4d9331'),
  grassLight: rgba('#58a038'),
  grassDark: rgba('#43852b'),
  rim: rgba('#2c6222'),
  rim2: rgba('#3c7a29'),
};

/** glattes Rauschen 0..1 */
function smooth(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const sm = (t: number) => t * t * (3 - 2 * t);
  const u = sm(x - xi);
  const v = sm(y - yi);
  const a = hash(xi, yi, 21);
  const b = hash(xi + 1, yi, 21);
  const c = hash(xi, yi + 1, 21);
  const d = hash(xi + 1, yi + 1, 21);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function paintLand(isl: Island): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  const px = new Uint32Array(img.data.buffer);
  const gr = isl.ground;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? Ground.Water : gr[y * W + x]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const k = gr[i];
      if (k === Ground.Water) continue;
      if (k === Ground.Sand) {
        let col = C.sand;
        // Schatten direkt unter der Graskante
        if (at(x, y - 1) === Ground.Grass || at(x, y - 2) === Ground.Grass || at(x, y - 3) === Ground.Grass) col = C.sandShade;
        else if (at(x - 1, y) === Ground.Water || at(x + 1, y) === Ground.Water || at(x, y + 1) === Ground.Water || at(x, y - 1) === Ground.Water) col = C.sandWet;
        else {
          const r = hash(x, y);
          if (r < 0.04) col = C.sandDot;
          else if (r < 0.06) col = C.sandHi;
        }
        px[i] = col;
        continue;
      }
      // Wiese: dunkle Umrandung (2 px), innen ruhig mit leichten Flecken
      let edge = 9;
      for (let d = 1; d <= 3 && edge === 9; d++)
        if (at(x - d, y) !== Ground.Grass || at(x + d, y) !== Ground.Grass || at(x, y - d) !== Ground.Grass || at(x, y + d) !== Ground.Grass) edge = d;
      if (edge === 1) px[i] = C.rim;
      else if (edge === 2) px[i] = at(x, y + 2) !== Ground.Grass ? C.rim : C.rim2;
      else {
        // weiche, runde Flecken statt Kacheln; am Rand gerastert
        const p = smooth(x / 22, y / 22) + ((x + y) % 2 ? 0.04 : -0.04);
        px[i] = p > 0.7 ? C.grassLight : p < 0.27 ? C.grassDark : C.grass;
      }
    }
  g.putImageData(img, 0, 0);

  const dot = (x: number, y: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(x, y, 1, 1);
  };
  const dots = (x: number, y: number, col: string, pts: [number, number][]) => pts.forEach(([a, b]) => dot(x + a, y + b, col));
  for (const d of isl.details) {
    const { x, y, variant: v } = d;
    switch (d.kind) {
      case 'blade':
        dots(x, y, '#2f6a24', [[0, 0], [2, -1], [1, 0]]);
        dot(x + 1, y - 1, '#6fb84a');
        break;
      case 'clover':
        dots(x, y, '#3a7a28', [[0, 0], [1, 0], [0, 1], [1, 1]]);
        dot(x, y, '#64ad44');
        break;
      case 'flower': {
        const col = ['#ffffff', '#ffe066', '#ff9fc4', '#ffffff'][v];
        dots(x, y, col, [[0, -1], [-1, 0], [1, 0], [0, 1]]);
        dot(x, y, '#f0a020');
        break;
      }
      case 'shell':
        dots(x, y, '#6b4a3a', [[-1, 1], [2, 1], [0, 2], [1, 2]]);
        dots(x, y, '#f4c6c8', [[0, 0], [1, 0], [0, 1], [1, 1]]);
        dot(x, y, '#ffffff');
        break;
      case 'pebble':
        dots(x, y, '#8a8070', [[0, 0], [1, 0]]);
        dot(x, y - 1, '#b5ab98');
        break;
      case 'stick':
        for (let k = 0; k < 9; k++) dot(x + k, y + Math.round(k * (v ? -0.4 : 0.35)), k % 3 ? '#7a5230' : '#4e321c');
        break;
      case 'star':
        dots(x, y, '#9a3c1c', [[0, -2], [-2, 0], [2, 0], [-1, 2], [1, 2]]);
        dots(x, y, '#ff8a4a', [[0, -1], [-1, 0], [1, 0], [0, 0], [-1, 1], [1, 1]]);
        break;
      case 'bone':
        // Knochen schräg im Sand
        for (let k = 0; k < 9; k++) {
          dot(x + k, y - Math.round(k * 0.4) + 1, '#7a7466');
          dot(x + k, y - Math.round(k * 0.4), '#f2efe2');
        }
        dots(x, y, '#f2efe2', [[-1, -1], [-1, 1], [9, -5], [9, -3]]);
        dots(x, y, '#7a7466', [[-2, 0], [-1, 2], [10, -4], [9, -2]]);
        break;
      case 'skull':
        g.fillStyle = '#7a7466';
        g.fillRect(x - 1, y - 1, 8, 7);
        g.fillStyle = '#f2efe2';
        g.fillRect(x, y, 6, 4);
        g.fillRect(x + 1, y + 4, 4, 1);
        dots(x, y, '#3a352c', [[1, 1], [4, 1], [2, 3], [3, 3]]);
        break;
    }
  }
  return c;
}

/** Schatten unter Bäumen & Co (pixelige Ellipsen) */
export function paintShadows(g: CanvasRenderingContext2D, isl: Island) {
  const size: Record<string, [number, number]> = { tree: [17, 5], palm: [12, 4], bush: [14, 4], rock: [8, 2.5], boulder: [13, 3], grass: [0, 0], stump: [8, 2.5] };
  for (const d of isl.decor) {
    const [rx, ry] = size[d.kind];
    if (!rx) continue;
    const sx = d.kind === 'palm' ? d.x + (d.flip ? -6 : 6) : d.x + 2;
    for (let y = -Math.ceil(ry); y <= ry; y++)
      for (let x = -rx; x <= rx; x++) {
        if ((x / rx) ** 2 + (y / ry) ** 2 > 1) continue;
        const gx = sx + x;
        const gy = d.y + y;
        const onGrass = isl.ground[gy * W + gx] === Ground.Grass;
        g.fillStyle = onGrass ? 'rgba(20,55,20,0.38)' : 'rgba(110,80,40,0.32)';
        g.fillRect(gx, gy, 1, 1);
      }
  }
}

/** Holzsteg ins Wasser */
export function paintDock(g: CanvasRenderingContext2D, isl: Island) {
  const { x, y, w, h } = isl.dock;
  // Pfosten unten im Wasser
  for (const px of [x - 1, x + w - 3])
    for (const py of [y + h - 10, y + h - 1]) {
      g.fillStyle = '#2a170c';
      g.fillRect(px, py, 4, 5);
      g.fillStyle = '#5a381e';
      g.fillRect(px + 1, py, 2, 4);
    }
  // Seitenbalken
  g.fillStyle = '#2a170c';
  g.fillRect(x - 1, y, 1, h);
  g.fillRect(x + w, y, 1, h);
  // Bretter quer
  for (let row = 0; row < h; row += 5) {
    g.fillStyle = '#2a170c';
    g.fillRect(x, y + row, w, 1);
    g.fillStyle = (row / 5) % 2 ? '#9a6a3a' : '#a8763f';
    g.fillRect(x, y + row + 1, w, 3);
    g.fillStyle = '#c99357';
    g.fillRect(x, y + row + 1, w, 1);
    g.fillStyle = '#6e4524';
    g.fillRect(x, y + row + 4, w, 1);
    // Nägel
    g.fillStyle = '#3a2a1e';
    g.fillRect(x + 2, y + row + 2, 1, 1);
    g.fillRect(x + w - 3, y + row + 2, 1, 1);
  }
}

/** Wellenmuster (16×16 Kachel): helle Bögen wie Fischschuppen */
export function waveTile(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1c737a';
  g.fillRect(0, 0, 16, 16);
  const arc = [3, 2, 2, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 3];
  for (let row = 0; row < 2; row++)
    for (let u = 0; u < 16; u++) {
      const x = (u + row * 8) % 16;
      const y = row * 8 + arc[u] + 2;
      g.fillStyle = '#6ec5cc';
      g.fillRect(x, y, 1, 1);
      g.fillStyle = '#2d8a91';
      g.fillRect(x, y + 1, 1, 1);
      g.fillStyle = '#146b72';
      if (u > 3 && u < 12) g.fillRect(x, y + 3, 1, 1);
    }
  return c;
}

/** Ufersaum: heller Streifen und Schaum, der vor und zurück atmet */
export class Shore {
  readonly canvas = document.createElement('canvas');
  private g: CanvasRenderingContext2D;
  private img: ImageData;
  private px: Uint32Array;
  private idx: Int32Array;
  private dist: Uint8Array;

  constructor(isl: Island) {
    this.canvas.width = W;
    this.canvas.height = H;
    this.g = this.canvas.getContext('2d')!;
    this.img = this.g.createImageData(W, H);
    this.px = new Uint32Array(this.img.data.buffer);
    const idx: number[] = [];
    const dist: number[] = [];
    for (let i = 0; i < isl.shore.length; i++)
      if (isl.shore[i] <= 12) {
        idx.push(i);
        dist.push(isl.shore[i]);
      }
    this.idx = Int32Array.from(idx);
    this.dist = Uint8Array.from(dist);
  }

  update(t: number) {
    const { px, idx, dist } = this;
    const foam = rgba('#e8fbf6');
    const light = rgba('#6ec5cc');
    const mid = rgba('#3d9ea5');
    px.fill(0);
    for (let k = 0; k < idx.length; k++) {
      const i = idx[k];
      const d = dist[k];
      const x = i % W;
      const y = (i / W) | 0;
      // Schaum kommt und geht (je Uferstück leicht versetzt)
      const reach = Math.round(1 + Math.sin(t * 1.4 + (x + y) * 0.05));
      if (d <= reach && (d < reach || (x + y) % 2 === 0)) px[i] = foam;
      else if (d <= 6) px[i] = light;
      else if (d <= 9) px[i] = (x + y) % 2 ? mid : light;
      else if ((x + y) % 2 === 0 && (x % 4 === 0 || y % 4 === 0)) px[i] = mid;
    }
    this.g.putImageData(this.img, 0, 0);
  }
}
