/**
 * Grafiken fürs Bauen und Holzfällen im Stil der Insel: Häuschen, Baumstumpf,
 * Setzling, Axt und Holz-Symbol. Gemalt aus Farbflächen, dunkel umrandet.
 */

const OUTLINE = '#1a1008';

class Grid {
  c: (string | null)[];
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.c = new Array(w * h).fill(null);
  }
  set(x: number, y: number, col: string) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.c[y * this.w + x] = col;
  }
  rect(x: number, y: number, w: number, h: number, col: string) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, col);
  }
  get(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.c[y * this.w + x] : null;
  }
  render(outline = true) {
    const cv = document.createElement('canvas');
    cv.width = this.w;
    cv.height = this.h;
    const g = cv.getContext('2d')!;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const col = this.get(x, y);
        if (col) {
          g.fillStyle = col;
          g.fillRect(x, y, 1, 1);
        } else if (outline && (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1))) {
          g.fillStyle = OUTLINE;
          g.fillRect(x, y, 1, 1);
        }
      }
    return cv;
  }
}

export interface Prop {
  img: HTMLCanvasElement;
  /** Fußpunkt im Bild */
  ox: number;
  oy: number;
}

/** Kleines Holzhaus: Bretterwand, Schindeldach, Kamin, Tür und zwei Fenster */
export function house(): Prop {
  const W = 46;
  const H = 48;
  const g = new Grid(W, H);
  // Kamin (hinter dem Dach)
  g.rect(31, 3, 5, 10, '#8a8690');
  g.rect(31, 3, 5, 1, '#b4b0ba');
  g.rect(35, 4, 1, 9, '#66626c');
  g.rect(32, 6, 3, 1, '#66626c');
  // Wand aus waagrechten Brettern
  const wx = 6;
  const wy = 24;
  const ww = 34;
  const wh = 19;
  for (let y = 0; y < wh; y++)
    for (let x = 0; x < ww; x++) {
      let c = y % 4 === 0 ? '#8a5a32' : y % 4 === 1 ? '#c8925a' : '#b07a48';
      if (x >= ww - 3 && y % 4 !== 0) c = '#946238'; // rechts im Schatten
      if (x < 2 && y % 4 !== 0) c = '#c99a64';
      // Brett-Fugen versetzt
      if (y % 4 !== 0 && (x + Math.floor(y / 4) * 11) % 17 === 0) c = '#8a5a32';
      g.set(wx + x, wy + y, c);
    }
  // Eckbalken
  g.rect(wx, wy, 1, wh, '#6a4228');
  g.rect(wx + ww - 1, wy, 1, wh, '#5a361e');
  // Schatten unter dem Dach
  g.rect(wx, wy, ww, 2, '#6a4228');
  // Dach: Trapez mit Überstand, Schindelreihen
  const top = 6;
  const bottom = 25;
  for (let y = top; y <= bottom; y++) {
    const k = (y - top) / (bottom - top);
    const half = 11 + k * 11.5;
    const x0 = Math.round(23 - half);
    const x1 = Math.round(23 + half);
    for (let x = x0; x < x1; x++) {
      const row = Math.floor((y - top) / 3);
      let c = '#c0503c';
      if ((y - top) % 3 === 2) c = '#8a3428'; // Schindel-Unterkante
      else if ((y - top) % 3 === 0) c = '#d8705a';
      if ((y - top) % 3 !== 2 && (x + row * 3) % 6 === 0) c = '#8a3428'; // Fuge
      if (x - x0 < 2) c = (y - top) % 3 === 2 ? '#9a4030' : '#d8705a'; // Licht links
      if (x1 - x <= 2) c = '#7a2c22'; // rechts dunkel
      g.set(x, y, c);
    }
  }
  // First oben
  g.rect(12, top - 1, 22, 1, '#e08a70');
  // Tür
  g.rect(19, 30, 8, 13, '#5a361e');
  g.rect(20, 31, 6, 12, '#7a4a2a');
  g.rect(20, 31, 6, 1, '#9a6a40');
  g.rect(22, 31, 1, 12, '#6a3e22');
  g.set(24, 37, '#f2c14e');
  // Fenster mit Kreuz und Glanz
  for (const fx of [9, 30]) {
    g.rect(fx, 29, 7, 6, '#5a361e');
    g.rect(fx + 1, 30, 5, 4, '#9fd8f0');
    g.set(fx + 1, 30, '#e6f7ff');
    g.set(fx + 2, 30, '#e6f7ff');
    g.rect(fx + 3, 30, 1, 4, '#5a361e');
    g.rect(fx + 1, 32, 5, 1, '#5a361e');
    // Blumenkasten
    g.rect(fx, 35, 7, 2, '#8a5a32');
    g.set(fx + 1, 34, '#ff9fc4');
    g.set(fx + 3, 34, '#ffd23f');
    g.set(fx + 5, 34, '#ff9fc4');
  }
  // Steinsockel
  for (let x = 5; x < 41; x++) g.set(x, 43, x % 4 === 0 ? '#6a6670' : '#9a96a2');
  g.rect(5, 44, 36, 1, '#6a6670');
  // Stufe vor der Tür
  g.rect(18, 44, 10, 2, '#a4a2ac');
  g.rect(18, 44, 10, 1, '#c8c6ce');
  return { img: g.render(), ox: 23, oy: 45 };
}

/** Baumstumpf mit Jahresringen (nach dem Fällen) */
export function treeStump(big: boolean): Prop {
  const w = big ? 14 : 10;
  const h = big ? 11 : 9;
  const g = new Grid(w, h);
  const cx = w / 2;
  const rw = big ? 5 : 3.5;
  // Seite
  for (let y = 3; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      if (Math.abs(x + 0.5 - cx) > rw) continue;
      g.set(x, y, x + 0.5 < cx - rw / 2 ? '#8c6440' : x + 0.5 > cx + rw / 2 ? '#5a3a20' : '#6a4628');
    }
  // Wurzeln
  g.set(1, h - 2, '#6a4628');
  g.set(w - 2, h - 2, '#5a3a20');
  // Schnittfläche oben (Ellipse) mit Ringen
  for (let y = 0; y < 5; y++)
    for (let x = 0; x < w; x++) {
      const d = ((x + 0.5 - cx) / rw) ** 2 + ((y + 0.5 - 2.5) / 2.3) ** 2;
      if (d > 1) continue;
      g.set(x, y, d > 0.65 ? '#b08050' : d > 0.3 ? '#e8c890' : d > 0.12 ? '#d0a870' : '#e8c890');
    }
  return { img: g.render(), ox: Math.round(cx), oy: h - 1 };
}

/** Setzling: dünner Stamm, zwei Blätter */
export function sapling(): Prop {
  const g = new Grid(11, 13);
  g.rect(5, 5, 1, 7, '#6a4628');
  g.rect(1, 3, 4, 3, '#4f9a44');
  g.rect(2, 3, 2, 1, '#7cc460');
  g.rect(6, 1, 4, 3, '#56a648');
  g.rect(7, 1, 2, 1, '#8ad070');
  g.rect(4, 0, 3, 2, '#4f9a44');
  return { img: g.render(), ox: 5, oy: 12 };
}

/** Axt (Kopf oben rechts) – wird beim Schlagen gedreht gezeichnet */
export function axe(): HTMLCanvasElement {
  const g = new Grid(10, 10);
  for (let i = 0; i < 8; i++) g.set(1 + i, 8 - i, i < 2 ? '#5a3a20' : '#8c6440');
  g.rect(6, 1, 3, 4, '#a4a2ac');
  g.rect(6, 1, 1, 4, '#d8d6de');
  g.set(9, 2, '#a4a2ac');
  g.set(9, 3, '#7a7884');
  return g.render();
}

/** Holzstück (für die Anzeige und fliegende Stücke) */
export function logIcon(): HTMLCanvasElement {
  const g = new Grid(14, 10);
  g.rect(1, 2, 11, 6, '#8c6440');
  g.rect(1, 2, 11, 1, '#ad8458');
  g.rect(1, 7, 11, 1, '#6a4628');
  g.rect(3, 4, 5, 1, '#6a4628');
  // Schnittfläche rechts
  g.rect(11, 2, 2, 6, '#e8c890');
  g.set(12, 4, '#b08050');
  g.set(12, 5, '#b08050');
  return g.render();
}

/** Bild als CSS-Hintergrund (für Knöpfe und Anzeigen) */
export const toUrl = (c: HTMLCanvasElement) => c.toDataURL();

/** Hacke (Klinge oben rechts, wie die Axt geschwungen) */
export function hoe(): HTMLCanvasElement {
  const g = new Grid(10, 10);
  for (let i = 0; i < 8; i++) g.set(1 + i, 8 - i, i < 2 ? '#5a3a20' : '#8c6440');
  g.rect(6, 0, 4, 2, '#a4a2ac');
  g.rect(6, 0, 4, 1, '#d8d6de');
  g.rect(9, 2, 1, 2, '#7a7884');
  return g.render();
}

/** Samentüte mit Rüben-Bild */
export function seedBag(): HTMLCanvasElement {
  const g = new Grid(10, 12);
  g.rect(1, 3, 8, 8, '#e8c890');
  g.rect(1, 3, 1, 8, '#f4dcb0');
  g.rect(8, 3, 1, 8, '#c8a470');
  g.rect(2, 1, 6, 2, '#c8a470');
  g.rect(3, 0, 4, 1, '#b08050');
  // Rübe drauf
  g.rect(4, 6, 3, 3, '#f0e6f0');
  g.set(4, 6, '#b05a9a');
  g.set(6, 6, '#b05a9a');
  g.set(5, 9, '#d8c8d8');
  g.set(5, 5, '#4f9a44');
  g.set(4, 4, '#4f9a44');
  g.set(6, 4, '#4f9a44');
  return g.render();
}

/** Holzkübel (Anfang) */
export function bucket(): HTMLCanvasElement {
  const g = new Grid(12, 11);
  g.rect(2, 3, 8, 7, '#a87a48');
  g.rect(2, 3, 2, 7, '#c8925a');
  g.rect(8, 3, 2, 7, '#7a5232');
  g.rect(1, 3, 10, 1, '#8a5a32');
  g.rect(2, 5, 8, 1, '#5a5660'); // Eisenring
  g.rect(2, 8, 8, 1, '#5a5660');
  g.rect(3, 4, 6, 1, '#4a8ad0'); // Wasser
  // Henkel
  g.set(2, 1, '#6a4628');
  g.set(3, 0, '#6a4628');
  g.rect(4, 0, 4, 1, '#6a4628');
  g.set(8, 0, '#6a4628');
  g.set(9, 1, '#6a4628');
  g.set(1, 2, '#6a4628');
  g.set(10, 2, '#6a4628');
  return g.render();
}

/** Eisen-Gießkanne (Belohnung) */
export function wateringCan(): HTMLCanvasElement {
  const g = new Grid(14, 11);
  g.rect(3, 3, 7, 7, '#9aa2ac');
  g.rect(3, 3, 2, 7, '#c4ccd4');
  g.rect(8, 3, 2, 7, '#6a7280');
  g.rect(3, 6, 7, 1, '#7a828e');
  // Tülle nach rechts oben
  g.set(10, 6, '#9aa2ac');
  g.set(11, 5, '#9aa2ac');
  g.set(12, 4, '#9aa2ac');
  g.rect(12, 2, 2, 2, '#c4ccd4');
  // Griff
  g.rect(4, 0, 5, 1, '#6a7280');
  g.set(3, 1, '#6a7280');
  g.set(9, 1, '#6a7280');
  g.set(2, 4, '#6a7280');
  g.set(1, 5, '#6a7280');
  g.set(1, 6, '#6a7280');
  return g.render();
}

/** Rübe (geerntet) */
export function turnipIcon(): HTMLCanvasElement {
  const g = new Grid(10, 12);
  // Blätter
  g.rect(3, 0, 1, 3, '#4f9a44');
  g.rect(5, 0, 2, 3, '#3a7d32');
  g.set(2, 1, '#6cb45a');
  g.set(7, 1, '#6cb45a');
  // Knolle: oben lila, unten weiß
  g.rect(2, 3, 6, 6, '#f4eef4');
  g.rect(2, 3, 6, 2, '#b05a9a');
  g.rect(2, 3, 1, 2, '#c87ab2');
  g.rect(7, 5, 1, 4, '#d8c8d8');
  g.rect(3, 9, 4, 1, '#e8dce8');
  g.set(4, 10, '#d8c8d8');
  g.set(4, 11, '#c8b8c8');
  return g.render();
}

/** Ackerboden-Kachel (8×8): Furchen; nass = dunkler */
export function soilTile(wet: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 8;
  const g = c.getContext('2d')!;
  const base = wet ? '#4a3020' : '#8a5e3a';
  const dark = wet ? '#2e1c12' : '#6a4428';
  const hi = wet ? '#5e3e2a' : '#a87a50';
  g.fillStyle = base;
  g.fillRect(0, 0, 8, 8);
  for (const y of [1, 4, 7]) {
    g.fillStyle = dark;
    g.fillRect(0, y, 8, 1);
    g.fillStyle = hi;
    g.fillRect(1, y - 1, 6, 1);
  }
  // Rand etwas dunkler, damit Felder als Kacheln erkennbar sind
  g.fillStyle = 'rgba(30,15,5,0.35)';
  g.fillRect(0, 7, 8, 1);
  g.fillRect(7, 0, 1, 8);
  return c;
}

/** Rübe auf dem Feld: 0 Samen, 1 Keim, 2 Pflänzchen, 3 reif */
export function cropStage(stage: number): Prop {
  const g = new Grid(10, 12);
  if (stage === 0) {
    g.set(3, 10, '#e8c890');
    g.set(6, 9, '#e8c890');
    g.set(5, 11, '#e8c890');
    return { img: g.render(false), ox: 5, oy: 11 };
  }
  if (stage === 1) {
    g.rect(4, 8, 1, 3, '#4f9a44');
    g.set(3, 8, '#6cb45a');
    g.set(5, 7, '#6cb45a');
    g.set(6, 7, '#7cc460');
    return { img: g.render(), ox: 5, oy: 11 };
  }
  if (stage === 2) {
    g.rect(4, 6, 1, 5, '#3a7d32');
    g.rect(1, 5, 3, 3, '#4f9a44');
    g.rect(5, 4, 3, 3, '#56a648');
    g.set(2, 5, '#7cc460');
    g.set(6, 4, '#8ad070');
    return { img: g.render(), ox: 5, oy: 11 };
  }
  // reif: lila Knolle schaut aus der Erde
  g.rect(3, 1, 1, 5, '#3a7d32');
  g.rect(6, 1, 1, 5, '#3a7d32');
  g.rect(0, 2, 3, 3, '#4f9a44');
  g.rect(7, 1, 3, 3, '#56a648');
  g.rect(4, 0, 2, 4, '#4f9a44');
  g.set(1, 2, '#7cc460');
  g.set(8, 1, '#8ad070');
  g.rect(2, 6, 6, 4, '#f4eef4');
  g.rect(2, 6, 6, 2, '#b05a9a');
  g.rect(2, 6, 1, 2, '#c87ab2');
  g.rect(7, 8, 1, 2, '#d8c8d8');
  return { img: g.render(), ox: 5, oy: 11 };
}
