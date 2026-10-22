/**
 * Pixel-Pferde in allen Rassen (4 Richtungen × 4 Lauf-Bilder + Grasen) und der
 * Pferdestall. Gemalt aus Farbflächen mit dunklem Rand wie der Rest der Insel.
 */
import { Grid, type Prop } from './props';
import { accById, type Breed } from './horses';

export const HW = 34;
export const HH = 30;
/** Fußpunkt im Bild */
export const HOX = 17;
export const HOY = 28;
const G = HOY; // Boden-Zeile unter den Hufen
const HOOF = '#3a2c24';

function dims(b: Breed) {
  return [
    { L: 12, BH: 6, LEG: 4, NECK: 3, HEADW: 5, HEADH: 4, LW: 2, CW: 8 },
    { L: 16, BH: 7, LEG: 6, NECK: 4, HEADW: 6, HEADH: 4, LW: 2, CW: 9 },
    { L: 18, BH: 8, LEG: 6, NECK: 4, HEADW: 6, HEADH: 5, LW: 3, CW: 11 },
    // Fohlen: klein, mit langen Beinen
    { L: 9, BH: 5, LEG: 5, NECK: 3, HEADW: 4, HEADH: 3, LW: 1, CW: 6 },
  ][b.size];
}

/** kleiner fester Zufall je Pixel (für Tupfen) */
const px = (x: number, y: number) => (((x * 73856093) ^ (y * 19349663)) >>> 0) % 100;

/** Fell mit Abzeichen an Stelle (x, y); rel = Lage im Körper 0..1 */
function coatAt(b: Breed, x: number, y: number, rx: number, ry: number) {
  const m = b.mark ?? '#f4efe6';
  if (b.pattern === 'pinto') {
    // große weiße Platten
    const blob = (cx: number, cy: number, r: number) => (rx - cx) ** 2 + ((ry - cy) * 0.8) ** 2 < r * r;
    if (blob(0.25, 0.55, 0.26) || blob(0.72, 0.3, 0.2) || blob(0.55, 1, 0.22)) return m;
  } else if (b.pattern === 'spots') {
    if (px(x, y) < 22 && (x + y) % 2 === 0) return m;
  } else if (b.pattern === 'dapple') {
    if (px(x, y) < 30 && ry > 0.15) return m;
  }
  return ry > 0.8 ? b.shade : b.coat;
}

/** Bein (oben Fell, unten Socken/Behang, Huf) */
function leg(g: Grid, b: Breed, x: number, top: number, h: number, w: number, dx: number, lift: number, far: boolean) {
  const up = far ? b.shade : b.coat;
  const low = b.legs ?? up;
  for (let y = 0; y < h - lift; y++) {
    const shift = y >= h / 2 ? dx : 0;
    const col = y === h - lift - 1 ? HOOF : y >= h / 2 - 1 ? (far && !b.legs ? b.shade : low) : up;
    for (let k = 0; k < w; k++) g.set(x + k + shift, top + y, col);
    // Kaltblut-Behang: unten breiter
    if (b.feather && y >= h - lift - 3 && y < h - lift - 1) {
      g.set(x - 1 + shift, top + y, low);
      g.set(x + w + shift, top + y, low);
    }
  }
}

/** Seitenansicht nach rechts. frame 0..3 laufen, 4 grasen */
function side(b: Breed, frame: number, acc = ''): HTMLCanvasElement {
  const d = dims(b);
  const g = new Grid(HW, HH);
  const bx0 = HOX - Math.floor(d.L / 2);
  const bx1 = bx0 + d.L - 1;
  const bot = G - d.LEG; // Bauch
  const top = bot - d.BH;
  const walk = frame < 4 && frame % 2 === 1;
  const sw = frame === 1 ? 1 : frame === 3 ? -1 : 0;
  const bob = walk ? -1 : 0;
  const longMane = b.size === 2 || ['islandpferd', 'andalusier', 'friese', 'shetland', 'lipizzaner'].includes(b.id);
  // ferne Beine (dunkler)
  leg(g, b, bx0 + 3, bot + bob, d.LEG - bob, d.LW, -sw, 0, true);
  leg(g, b, bx1 - 1 - d.LW + 1, bot + bob, d.LEG - bob, d.LW, sw, 0, true);
  // Schweif
  const tailSw = frame < 4 ? [0, 1, 0, -1][frame] : 0;
  for (let y = 0; y < d.BH + 3; y++) {
    const x = bx0 - 1 - (y > 2 ? 1 : 0) + (y > 4 ? tailSw : 0);
    g.set(x, top + 1 + y + bob, b.mane);
    if (y > 0 && y < d.BH + 1) g.set(x + 1, top + 1 + y + bob, b.mane);
  }
  // Körper (abgerundet)
  for (let y = 0; y < d.BH; y++)
    for (let x = 0; x < d.L; x++) {
      if ((y === 0 || y === d.BH - 1) && (x === 0 || x === d.L - 1)) continue;
      g.set(bx0 + x, top + y + bob, coatAt(b, bx0 + x, y, x / (d.L - 1), y / (d.BH - 1)));
    }
  if (b.pattern === 'dun') for (let x = 1; x < d.L - 1; x++) g.set(bx0 + x, top + bob, b.mark!);
  const A = accById(acc);
  if (A && acc.startsWith('blanket')) blanket(g, bx0 + 3, bx1 - 3, top + bob, Math.min(4, d.BH - 2), A.col, A.col2);
  // Hals & Kopf
  if (frame === 4) {
    // grasen: Hals nach vorn unten, Maul im Gras
    const hx = bx1 + 2;
    const hy = G - d.HEADW - 1;
    for (let y = top; y < hy + 2; y++) {
      const k = y - top;
      const x = bx1 - 2 + Math.min(3, Math.floor(k / 2));
      for (let j = 0; j < 4; j++) g.set(x + j, y, k === 0 && j < 3 ? b.mane : b.coat);
    }
    for (let y = 0; y < d.HEADW; y++)
      for (let x = 0; x < d.HEADH - 1; x++) g.set(hx + x, hy + y, y >= d.HEADW - 2 ? b.shade : b.coat);
    if (b.pattern === 'blaze') for (let y = 1; y < d.HEADW - 1; y++) g.set(hx + d.HEADH - 2, hy + y, b.mark!);
    g.set(hx - 1, hy, b.coat);
    g.set(hx - 1, hy - 1, b.coat); // Ohr
    g.set(hx + 1, hy + 1, '#1a1210'); // Auge
    if (longMane) for (let k = 0; k < 3; k++) g.set(bx1 - 1 + k, top + 1, b.mane);
    headAcc(g, acc, hx, hy - 1, d.HEADH);
  } else {
    const nx = bx1 - 3;
    for (let j = 1; j <= d.NECK; j++) {
      const off = Math.floor(j / 2);
      for (let k = 0; k < 4; k++) g.set(nx + off + k, top - j + bob, b.coat);
      g.set(nx + off - 1, top - j + bob + 1, b.mane);
      if (longMane) g.set(nx + off - 2, top - j + bob + 2, b.mane);
    }
    const hx = nx + Math.floor(d.NECK / 2);
    const hy = top - d.NECK - d.HEADH + 1 + bob;
    for (let y = 0; y < d.HEADH; y++)
      for (let x = 0; x < d.HEADW; x++) {
        if (y === d.HEADH - 1 && x < 2) continue; // Kinn
        g.set(hx + x, hy + y, x >= d.HEADW - 2 && y >= d.HEADH - 2 ? b.shade : b.coat);
      }
    if (b.pattern === 'blaze') for (let x = 2; x < d.HEADW; x++) g.set(hx + x, hy, b.mark!);
    if (b.pattern === 'blaze') g.set(hx + d.HEADW - 1, hy + 1, b.mark!);
    g.set(hx + 1, hy - 1, b.coat); // Ohr
    g.set(hx + 1, hy - 2, b.shade);
    g.set(hx, hy, b.mane); // Schopf
    g.set(hx - 1, hy + 1, b.mane);
    g.set(hx + 2, hy + 1, '#1a1210'); // Auge
    g.set(hx + d.HEADW - 1, hy + d.HEADH - 2, '#5a3a32'); // Nüster
    if (b.horn) {
      g.set(hx + 3, hy - 1, '#f4c430');
      g.set(hx + 4, hy - 2, '#ffe680');
      g.set(hx + 4, hy - 3, '#f4c430');
      g.set(hx + 5, hy - 4, '#ffe680');
    }
    headAcc(g, acc, hx - 1, hy - 1, d.HEADW - 1);
  }
  // nahe Beine
  leg(g, b, bx0 + 1, bot + bob, d.LEG - bob, d.LW, sw, frame === 1 ? 1 : 0, false);
  leg(g, b, bx1 - 2 - d.LW + 1, bot + bob, d.LEG - bob, d.LW, -sw, frame === 3 ? 1 : 0, false);
  return g.render();
}

/** von vorn (runter) oder hinten (hoch) */
function frontBack(b: Breed, frame: number, back: boolean, acc = ''): HTMLCanvasElement {
  const d = dims(b);
  const g = new Grid(HW, HH);
  const w = d.CW;
  const x0 = HOX - Math.floor(w / 2);
  const bot = G - d.LEG;
  const top = bot - d.BH;
  const walk = frame % 2 === 1;
  const bob = walk ? -1 : 0;
  const liftL = frame === 1 ? 1 : 0;
  const liftR = frame === 3 ? 1 : 0;
  // Beine
  leg(g, b, x0 + 1, bot + bob, d.LEG - bob, d.LW, 0, liftL, false);
  leg(g, b, x0 + w - 1 - d.LW, bot + bob, d.LEG - bob, d.LW, 0, liftR, false);
  // Rumpf
  for (let y = 0; y < d.BH; y++)
    for (let x = 0; x < w; x++) {
      if (y === 0 && (x === 0 || x === w - 1)) continue;
      g.set(x0 + x, top + y + bob, coatAt(b, x0 + x, y, x / (w - 1), y / (d.BH - 1)));
    }
  const A = accById(acc);
  if (A && acc.startsWith('blanket')) blanket(g, x0 + 1, x0 + w - 2, top + bob, 3, A.col, A.col2);
  if (back) {
    // Hals und Ohren hinter dem Rumpf, Schweif in der Mitte
    const nx = HOX - 2;
    for (let y = 1; y <= d.NECK + 1; y++) for (let k = 0; k < 4; k++) g.set(nx + k, top - y + bob, k === 1 || k === 2 ? b.mane : b.coat);
    g.set(nx, top - d.NECK - 2 + bob, b.coat);
    g.set(nx + 3, top - d.NECK - 2 + bob, b.coat);
    headAcc(g, acc, nx, top - d.NECK - 2 + bob, 4);
    if (b.pattern === 'dun') for (let y = 0; y < d.BH - 2; y++) g.set(HOX, top + y + bob, b.mark!);
    const ts = frame === 1 ? -1 : frame === 3 ? 1 : 0;
    for (let y = 1; y < d.BH + 3; y++) {
      g.set(HOX - 1 + (y > 4 ? ts : 0), top + y + bob, b.mane);
      g.set(HOX + (y > 4 ? ts : 0), top + y + bob, b.mane);
    }
  } else {
    // Kopf vor der Brust
    const hw = d.HEADW - 1;
    const hx = HOX - Math.floor(hw / 2);
    const hy = top - 4 + bob;
    const hh = d.HEADH + 3;
    for (let y = 0; y < hh; y++)
      for (let x = 0; x < hw; x++) {
        if (y === hh - 1 && (x === 0 || x === hw - 1)) continue;
        g.set(hx + x, hy + y, y >= hh - 2 ? b.shade : b.coat);
      }
    if (b.pattern === 'blaze') for (let y = 1; y < hh - 1; y++) g.set(hx + Math.floor(hw / 2), hy + y, b.mark!);
    g.set(hx, hy - 1, b.coat); // Ohren
    g.set(hx + hw - 1, hy - 1, b.coat);
    g.set(hx + Math.floor(hw / 2), hy, b.mane); // Schopf
    if (hw > 4) g.set(hx + Math.floor(hw / 2) - 1, hy, b.mane);
    g.set(hx, hy + 2, '#1a1210'); // Augen
    g.set(hx + hw - 1, hy + 2, '#1a1210');
    g.set(hx + 1, hy + hh - 2, '#5a3a32');
    g.set(hx + hw - 2, hy + hh - 2, '#5a3a32');
    if (b.horn) for (let k = 1; k <= 3; k++) g.set(hx + Math.floor(hw / 2), hy - k, k % 2 ? '#f4c430' : '#ffe680');
    headAcc(g, acc, hx, hy - 1, hw);
  }
  return g.render();
}

function flip(img: HTMLCanvasElement) {
  const m = document.createElement('canvas');
  m.width = img.width;
  m.height = img.height;
  const c = m.getContext('2d')!;
  c.translate(img.width, 0);
  c.scale(-1, 1);
  c.drawImage(img, 0, 0);
  return m;
}

/** Satteldecke: farbige Fläche über dem Rücken mit hellem Saum */
function blanket(g: Grid, x0: number, x1: number, y: number, h: number, col: string, trim: string) {
  for (let yy = 0; yy < h; yy++) for (let x = x0; x <= x1; x++) g.set(x, y + yy, yy === h - 1 || x === x0 || x === x1 ? trim : col);
}
/** Schleife oder Blumenkranz am Kopf: (x, y) = links über dem Kopf, w = Kopfbreite */
function headAcc(g: Grid, acc: string, x: number, y: number, w: number) {
  const A = accById(acc);
  if (!A || acc.startsWith('blanket')) return;
  if (acc === 'flowers') {
    // Kranz: Blüten in zwei Reihen mit grünen Blättchen
    const cols = ['#ffffff', '#ffd23f', '#f06aa8', '#9ac4f4'];
    const n = Math.max(4, w + 1);
    for (let k = 0; k < n; k++) {
      g.set(x - 1 + k, y, k % 2 ? '#5fae63' : cols[(k / 2) % cols.length]);
      if (k % 2 === 1) g.set(x - 1 + k, y - 1, cols[(k + 1) % cols.length]);
    }
    return;
  }
  // Schleife: zwei Schlaufen und ein Knoten
  const c = x + Math.floor(w / 2);
  for (const [dx, dy, col] of [
    [-2, -1, A.col],
    [-1, -1, A.col2],
    [1, -1, A.col2],
    [2, -1, A.col],
    [-1, 0, A.col],
    [0, 0, A.col2],
    [1, 0, A.col],
    [-1, 1, A.col],
    [1, 1, A.col],
  ] as const)
    g.set(c + dx, y + dy, col);
}

/** [Richtung wie Dir][Bild 0..3 laufen, 4 grasen] */
export type HorseSheet = HTMLCanvasElement[][];
const sheets = new Map<string, HorseSheet>();
export function horseSheet(b: Breed, acc = ''): HorseSheet {
  const key = `${b.id}|${acc}`;
  let s = sheets.get(key);
  if (!s) {
    const right = [0, 1, 2, 3, 4].map((f) => side(b, f, acc));
    const down = [0, 1, 2, 3].map((f) => frontBack(b, f, false, acc));
    const up = [0, 1, 2, 3].map((f) => frontBack(b, f, true, acc));
    s = [[...down, down[0]], [...up, up[0]], right, right.map(flip)];
    sheets.set(key, s);
  }
  return s;
}

/** Sattel: wo der Reiter sitzt (relativ zum Fußpunkt) */
export function saddle(b: Breed, dir: number) {
  const d = dims(b);
  const y = -d.LEG - d.BH + 1;
  if (dir === 2) return { x: -1, y };
  if (dir === 3) return { x: 1, y };
  // von vorn sitzt man hinter dem Pferdekopf – Gesicht bleibt sichtbar
  return { x: 0, y: y - (dir === 0 ? 4 : 0) };
}

/** Pferdestall: rote Bretterwand, Schindeldach mit Heuluke, Stalltür mit weißem Kreuz */
export function stable(): Prop {
  const W = 56;
  const H = 48;
  const g = new Grid(W, H);
  const wx = 4;
  const wy = 22;
  const ww = 48;
  const wh = 24;
  // Wand: senkrechte rote Bretter
  for (let y = 0; y < wh; y++)
    for (let x = 0; x < ww; x++) {
      let c = x % 4 === 0 ? '#8a3424' : '#b04a32';
      if (x >= ww - 3 && x % 4 !== 0) c = '#943c28';
      if (y < 2) c = '#6e2a1c';
      g.set(wx + x, wy + y, c);
    }
  // weiße Eckbalken und Sockel
  g.rect(wx, wy + 2, 2, wh - 2, '#efe6d6');
  g.rect(wx + ww - 2, wy + 2, 2, wh - 2, '#d8cebe');
  g.rect(wx, wy + wh - 1, ww, 1, '#7a6a5a');
  // Stalltür (zwei Flügel mit Kreuz)
  const dx = 19;
  const dy = 29;
  const dw = 18;
  const dh = 17;
  g.rect(dx - 1, dy - 1, dw + 2, dh + 1, '#efe6d6');
  for (const [ox, w] of [
    [0, dw / 2],
    [dw / 2, dw / 2],
  ]) {
    g.rect(dx + ox, dy, w, dh, ox ? '#7a3a22' : '#8a4228');
    for (let t = 0; t < dh; t++) {
      const k = Math.round((t / (dh - 1)) * (w - 1));
      g.set(dx + ox + k, dy + t, '#efe6d6');
      g.set(dx + ox + w - 1 - k, dy + t, '#efe6d6');
    }
    g.rect(dx + ox, dy + Math.floor(dh / 2), w, 1, '#efe6d6');
  }
  g.rect(dx + dw / 2, dy, 1, dh, '#efe6d6');
  // Fensterchen links und rechts
  for (const fx of [9, 40]) {
    g.rect(fx, 30, 7, 6, '#efe6d6');
    g.rect(fx + 1, 31, 5, 4, '#3a2418');
    g.rect(fx + 1, 33, 5, 2, '#e8c860'); // Heu im Fenster
    g.set(fx + 3, 31, '#efe6d6');
  }
  // Dach: Schindeln, Giebel
  for (let j = 0; j <= 18; j++) {
    const y = 4 + j;
    const half = 8 + Math.round(j * 1.1);
    for (let x = -half; x <= half; x++) {
      const xx = 28 + x;
      let c = j % 3 === 0 ? '#4e3426' : (xx + Math.floor(j / 3) * 3) % 6 === 0 ? '#5a3c2c' : '#6e4c38';
      if (x === -half || x === half) c = '#4e3426';
      if (j === 18) c = '#3e281c';
      g.set(xx, y, c);
    }
  }
  // Heuluke im Giebel
  g.rect(24, 9, 9, 7, '#efe6d6');
  g.rect(25, 10, 7, 5, '#3a2418');
  g.rect(25, 13, 7, 2, '#e8c860');
  g.set(26, 12, '#e8c860');
  g.set(29, 12, '#d8b44a');
  // Hufeisen über der Tür
  g.rect(26, 24, 1, 3, '#e8c25a');
  g.rect(30, 24, 1, 3, '#e8c25a');
  g.rect(27, 27, 3, 1, '#e8c25a');
  // Heuballen rechts vorn
  g.rect(45, 40, 8, 6, '#e0b84a');
  g.rect(45, 40, 8, 1, '#f0d070');
  g.rect(45, 42, 8, 1, '#b88a2a');
  g.rect(49, 40, 1, 6, '#b88a2a');
  return { img: g.render(), ox: 28, oy: 45 };
}

/** Herz fürs Vertrauen (voll oder leer) */
export function heartIcon(full: boolean): HTMLCanvasElement {
  const g = new Grid(9, 8);
  const rows = ['.XX...XX.', 'XXXX.XXXX', 'XXXXXXXXX', 'XXXXXXXXX', '.XXXXXXX.', '..XXXXX..', '...XXX...', '....X....'];
  rows.forEach((r, y) => [...r].forEach((c, x) => c === 'X' && g.set(x, y, full ? (y < 2 && x % 4 === 1 ? '#ff9aa8' : '#e0485a') : '#d8c8b0')));
  return g.render(false);
}

/** Sense (Klinge oben, wie die Axt geschwungen) */
export function scythe(): HTMLCanvasElement {
  const g = new Grid(12, 11);
  for (let i = 0; i < 9; i++) g.set(1 + i, 9 - i, i < 2 ? '#5a3a20' : '#8c6440');
  g.set(4, 7, '#5a3a20'); // Griff
  g.set(5, 8, '#5a3a20');
  // gebogene Klinge nach links
  for (const [x, y] of [[9, 0], [8, 0], [7, 0], [6, 0], [5, 1], [4, 1], [3, 2], [2, 3]]) g.set(x, y, '#c8c6d0');
  for (const [x, y] of [[8, 1], [7, 1], [6, 1], [5, 2], [4, 2]]) g.set(x, y, '#8a8894');
  g.set(10, 1, '#5a3a20');
  return g.render();
}

/** Heubündel für die Anzeige */
export function hayIcon(): HTMLCanvasElement {
  const g = new Grid(14, 11);
  g.rect(1, 2, 12, 8, '#e0b84a');
  g.rect(1, 2, 12, 1, '#f4d878');
  for (const x of [3, 6, 9, 11]) g.rect(x, 3, 1, 6, '#c89a34');
  g.rect(1, 9, 12, 1, '#a87a24');
  g.rect(4, 2, 1, 8, '#a0522d'); // Schnur
  g.rect(9, 2, 1, 8, '#a0522d');
  g.set(0, 4, '#e8c860');
  g.set(13, 6, '#e8c860');
  return g.render();
}

/** gemähte Wiese: frisches Gras im Schwad, trockenes Heu, Stoppeln */
export function hayTile(stage: 'fresh' | 'dry' | 'stubble'): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 8;
  const g = c.getContext('2d')!;
  // kurze Stoppeln
  g.fillStyle = 'rgba(230,240,150,0.28)';
  g.fillRect(0, 0, 8, 8);
  g.fillStyle = 'rgba(190,210,110,0.7)';
  for (const [x, y] of [[1, 1], [5, 2], [3, 5], [6, 6], [0, 6], [4, 0]]) g.fillRect(x, y, 1, 1);
  if (stage === 'stubble') return c;
  const [main, hi, dark] = stage === 'fresh' ? ['#8cc85a', '#b4e478', '#2e6a24'] : ['#e0b84a', '#f4d878', '#b08a2a'];
  // Schwad: zwei Reihen gemähtes Gras
  for (const y of [2, 5]) {
    g.fillStyle = dark;
    g.fillRect(0, y + 1, 8, 1);
    g.fillStyle = main;
    g.fillRect(0, y, 8, 1);
    g.fillStyle = hi;
    for (let x = (y % 2) * 1; x < 8; x += 3) g.fillRect(x, y - 1, 2, 1);
  }
  return c;
}

/** Zaunpfosten (Koppel) */
export const FENCE = { post: '#6a4428', postHi: '#8c6440', rail: '#b88a58', railDark: '#7a5432' };

/** kleine Koppel fürs Bau-Menü */
export function paddockIcon(): HTMLCanvasElement {
  const g = new Grid(30, 22);
  g.rect(2, 4, 26, 15, '#6dbb5a');
  for (const y of [6, 18]) {
    g.rect(1, y - 3, 28, 1, FENCE.rail);
    g.rect(1, y - 1, 28, 1, FENCE.rail);
  }
  g.rect(12, 16, 6, 3, '#6dbb5a'); // Tor
  for (let x = 1; x < 30; x += 7) for (const y of [2, 14]) g.rect(x, y, 2, 6, FENCE.post);
  g.rect(1, 2, 1, 18, FENCE.rail);
  g.rect(28, 2, 1, 18, FENCE.rail);
  return g.render();
}
