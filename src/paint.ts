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
  sand: rgba('#dcbc8a'),
  sandDot: rgba('#c9a874'),
  sandHi: rgba('#e4c696'),
  sandShade: rgba('#bf9a64'),
  sandEdge: rgba('#ccad7c'),
  grass: rgba('#489030'),
  grassAlt: rgba('#4c9634'),
  outline: rgba('#1f4e14'),
  rimLight: rgba('#6fb043'),
  rimDark: rgba('#2f6a22'),
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
        // dunkle Kante zum Wasser, Schatten unter der Graskante, Sandkörner
        if (at(x - 1, y) === Ground.Water || at(x + 1, y) === Ground.Water || at(x, y + 1) === Ground.Water || at(x, y - 1) === Ground.Water) col = C.sandEdge;
        else if (at(x, y - 1) === Ground.Grass || at(x, y - 2) === Ground.Grass || at(x, y - 3) === Ground.Grass || at(x - 1, y) === Ground.Grass) col = C.sandShade;
        else {
          const r = hash(x, y);
          if (r < 0.05) col = C.sandDot;
          else if (r < 0.07) col = C.sandHi;
        }
        px[i] = col;
        continue;
      }
      // Wiese wie ein erhöhtes Beet: schwarze Kante, oben/links heller Rand, unten/rechts dunkler
      if (at(x - 1, y) !== Ground.Grass || at(x + 1, y) !== Ground.Grass || at(x, y - 1) !== Ground.Grass || at(x, y + 1) !== Ground.Grass) {
        px[i] = C.outline;
        continue;
      }
      let rim = 0;
      for (let d = 2; d <= 3 && !rim; d++) {
        if (at(x, y - d) !== Ground.Grass || at(x - d, y) !== Ground.Grass) rim = 1;
        else if (at(x, y + d) !== Ground.Grass || at(x + d, y) !== Ground.Grass) rim = 2;
      }
      if (rim === 1) px[i] = C.rimLight;
      else if (rim === 2) px[i] = C.rimDark;
      else px[i] = smooth(x / 18, y / 18) + ((x + y) % 2 ? 0.05 : -0.05) > 0.72 ? C.grassAlt : C.grass;
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
        dots(x, y, '#2f6a22', [[0, 0], [2, -1], [1, 0]]);
        break;
      case 'clover':
        // helle kleine Pflänzchen wie auf der Vorlage
        if (v < 2) {
          dots(x, y, '#2a5e1c', [[-1, 1], [3, 1], [1, 3]]);
          dots(x, y, '#7cc858', [[0, 0], [2, 0], [1, 1], [1, 2]]);
          dot(x, y, '#b6e68a');
        } else dots(x, y, '#3c7e28', [[0, 0], [1, 0], [0, 1], [1, 1]]);
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
  const size: Record<string, [number, number]> = { tree: [22, 6], palm: [13, 4], bush: [19, 4.5], rock: [8, 2.5], boulder: [15, 3.5], grass: [0, 0], stump: [8, 2.5] };
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
        g.fillStyle = onGrass ? 'rgba(8,40,10,0.45)' : 'rgba(100,70,35,0.38)';
        g.fillRect(gx, gy, 1, 1);
      }
  }
}

/** Holzsteg ins Wasser: Bretter quer, Pfosten an den Ecken */
export function paintDock(g: CanvasRenderingContext2D, isl: Island) {
  const { x, y, w, h } = isl.dock;
  const rect = (c: string, a: number, b: number, ww: number, hh: number) => {
    g.fillStyle = c;
    g.fillRect(a, b, ww, hh);
  };
  // Schatten aufs Wasser
  rect('rgba(6,40,46,0.45)', x + 3, y + 4, w, h);
  rect('#1e0c04', x - 1, y, w + 2, h);
  for (let row = 0; row + 6 <= h; row += 6) {
    rect('#5e4430', x, y + row + 1, w, 5);
    rect('#7e624a', x, y + row + 1, w, 3);
    rect('#9c846c', x, y + row + 1, w, 1);
    // Fugen zwischen zwei Brettern versetzt
    rect('#3a2618', x + ((row / 6) % 2 ? 9 : 19), y + row + 1, 1, 5);
  }
  // Pfosten oben und unten
  for (const px of [x - 3, x + w - 1])
    for (const py of [y - 2, y + h - 8]) {
      rect('#1e0c04', px, py, 5, 9);
      rect('#6c543c', px + 1, py + 1, 3, 7);
      rect('#9c846c', px + 1, py + 1, 3, 1);
    }
}

/** Wassermuster (8×8 Kachel): schräg versetzte helle Striche wie gewebt */
export function waveTile(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 8;
  const g = c.getContext('2d')!;
  // Netz aus hellen Zickzack-Linien um dunklere Zellen (Licht im Wasser)
  const rows = ['LL....LL', '..L..L..', '...LL...', 'dd.ss.dd', '..LLLL..'.replace(/L/g, '.').replace('....', '.LL.'), '.L....L.', 'L......L', '.s.dd.s.'];
  const col: Record<string, string> = { L: '#7cd0d8', s: '#4fb0ba', d: '#1a7480', '.': '#2b8e99' };
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    g.fillStyle = col[ch];
    g.fillRect(x, y, 1, 1);
  }));
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
      if (isl.shore[i] <= 22) {
        idx.push(i);
        dist.push(isl.shore[i]);
      }
    this.idx = Int32Array.from(idx);
    this.dist = Uint8Array.from(dist);
  }

  update(t: number) {
    const { px, idx, dist } = this;
    const edge = rgba('#7ccdd4');
    px.fill(0);
    for (let k = 0; k < idx.length; k++) {
      const i = idx[k];
      const d = dist[k];
      const x = i % W;
      const y = (i / W) | 0;
      // heller Saum direkt am Strand (atmet sanft), dahinter heller werdendes Flachwasser
      const reach = 1 + Math.round(0.8 + Math.sin(t * 1.3 + (x + y) * 0.04));
      if (d <= reach) px[i] = edge;
      else {
        const a = Math.max(0, Math.round(150 * (1 - d / 22)));
        px[i] = rgba('#9fe0e4', a);
      }
    }
    this.g.putImageData(this.img, 0, 0);
  }
}
