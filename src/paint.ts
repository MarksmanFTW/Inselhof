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
  grass: rgba('#4f9733'),
  grassAlt: rgba('#4c9634'),
  outline: rgba('#3e5e12'),
  outline2: rgba('#4c7a22'),
  rimHi: rgba('#86c45e'),
  rimLight: rgba('#64ac46'),
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
      // Wiese wie auf der Vorlage: olivgrüne Kante, dann heller Saum (rundum), dann Gras
      let edge = 9;
      for (let d = 1; d <= 5 && edge === 9; d++)
        if (at(x - d, y) !== Ground.Grass || at(x + d, y) !== Ground.Grass || at(x, y - d) !== Ground.Grass || at(x, y + d) !== Ground.Grass) edge = d;
      if (edge === 1) px[i] = C.outline;
      else if (edge === 2) px[i] = C.outline2;
      else if (edge === 3) px[i] = C.rimHi;
      else if (edge === 4) px[i] = (x + y) % 3 ? C.rimHi : C.rimLight;
      else if (edge === 5) px[i] = (x + y) % 2 ? C.rimLight : C.grass;
      else {
        const n = smooth(x / 16, y / 16) + ((x + y) % 2 ? 0.05 : -0.05);
        px[i] = n > 0.78 ? C.rimLight : n > 0.66 ? C.grassAlt : C.grass;
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
        if (v === 0) {
          // großes, ausgeblichenes Treibholz schräg im Sand
          for (let k = 0; k < 22; k++) {
            const yy = y - Math.round(k * 0.45);
            dot(x + k, yy - 2, '#3e3a34');
            dot(x + k, yy + 3, '#3e3a34');
            for (let d = -1; d <= 2; d++) dot(x + k, yy + d, d < 0 ? '#e4e0d4' : d < 2 ? '#c4beb0' : '#9a9488');
            dot(x + k, yy - 2, '#3e3a34');
            if (k % 5 === 2) dot(x + k, yy, '#a8a296');
          }
          // Astgabeln an den Enden
          dots(x, y, '#3e3a34', [[-2, -3], [-1, -4], [-2, 2], [-3, 3], [22, -13], [23, -14], [21, -7], [23, -7]]);
          dots(x, y, '#e4e0d4', [[-1, -3], [-2, -2], [-1, 2], [-2, 3], [22, -12], [21, -12], [22, -8], [21, -8]]);
          break;
        }
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
  const size: Record<string, [number, number]> = { tree: [20, 7], palm: [11, 5], bush: [15, 4], rock: [7, 2.2], boulder: [12, 3], grass: [0, 0], stump: [6, 2] };
  for (const d of isl.decor) {
    const [rx, ry] = size[d.kind];
    if (!rx) continue;
    const sx = d.kind === 'palm' ? d.x : d.x + 2;
    for (let y = -Math.ceil(ry); y <= ry; y++)
      for (let x = -rx; x <= rx; x++) {
        if ((x / rx) ** 2 + (y / ry) ** 2 > 1) continue;
        const gx = sx + x;
        const gy = d.y + y;
        const onGrass = isl.ground[gy * W + gx] === Ground.Grass;
        g.fillStyle = onGrass ? 'rgba(8,40,10,0.5)' : 'rgba(100,70,35,0.4)';
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
  for (let row = 0; row + 4 <= h; row += 4) {
    rect('#6a4c34', x, y + row + 1, w, 3);
    rect('#8a6a4c', x, y + row + 1, w, 2);
    rect('#b09070', x + ((row * 7) % 9), y + row + 1, 6, 1);
    rect('#3a2618', x + ((row * 5) % 17) + 3, y + row + 2, 4, 1);
  }
  // Längsbalken links und rechts
  rect('#2a180c', x + 2, y, 1, h);
  rect('#2a180c', x + w - 3, y, 1, h);
  // Pfosten oben und unten
  for (const px of [x - 3, x + w - 1])
    for (const py of [y - 3, y + h - 7]) {
      rect('#1e0c04', px, py, 5, 8);
      rect('#5e4430', px + 1, py + 1, 3, 6);
      rect('#9c846c', px + 1, py + 1, 3, 1);
    }
}

/** Wassermuster (8×8 Kachel): schräg versetzte helle Striche wie gewebt */
export function waveTile(): HTMLCanvasElement {
  // 24×12 Kachel: kurze helle Striche, reihenweise versetzt wie Ziegel → schräges Mosaik
  const c = document.createElement('canvas');
  c.width = 24;
  c.height = 12;
  const g = c.getContext('2d')!;
  const cols = ['#0c606c', '#186c78', '#247884', '#54a8b4', '#6cc0cc'];
  for (let y = 0; y < 12; y++)
    for (let x = 0; x < 24; x++) {
      const row = y >> 1;
      const cell = Math.floor((x + (row % 2) * 3 + ((row >> 1) % 2)) / 3);
      const light = cell % 2 === 0;
      // obere Zeile eines hellen Strichs am hellsten, Ränder etwas dunkler
      let v = light ? (y % 2 === 0 ? 3.8 : 3.1) : y % 2 === 0 ? 1.5 : 1.0;
      v += (hash(x, y, 41) - 0.5) * 1.5;
      g.fillStyle = cols[Math.max(0, Math.min(4, Math.round(v)))];
      g.fillRect(x, y, 1, 1);
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
      if (isl.shore[i] <= 22) {
        idx.push(i);
        dist.push(isl.shore[i]);
      }
    this.idx = Int32Array.from(idx);
    this.dist = Uint8Array.from(dist);
  }

  update(t: number) {
    const { px, idx, dist } = this;
    const edge = rgba('#86d2d8');
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
        // breiter heller Ring wie auf der Vorlage, nach außen auslaufend
        const a = Math.max(0, Math.round(150 * Math.min(1, 1.25 - d / 18)));
        px[i] = rgba('#56bcc4', d > 16 && (x + y) % 2 ? Math.round(a * 0.5) : a);
      }
    }
    this.g.putImageData(this.img, 0, 0);
  }
}
