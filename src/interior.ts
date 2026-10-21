/**
 * Innenraum der Häuser: Holzboden, Bretterwand mit Fenster, Bett, Truhe und fünf
 * Plätze für Möbel. Eigene kleine Welt mit eigenen Koordinaten (ROOM_W × ROOM_H).
 */
import { furnitureById } from './furniture';
import { Grid } from './props';

export const ROOM_W = 120;
export const ROOM_H = 86;
/** Wand oben bis hier, darunter Boden */
const WALL = 26;
/** Laufbereich der Füße */
const MIN_X = 7;
const MAX_X = ROOM_W - 7;
const MIN_Y = WALL + 6;
const MAX_Y = ROOM_H - 4;

type Rect = { x: number; y: number; w: number; h: number };
export const BED: Rect = { x: 6, y: 22, w: 24, h: 22 };
export const CHEST: Rect = { x: 92, y: 26, w: 18, h: 12 };
export const DOOR = { x: ROOM_W / 2, y: ROOM_H - 2 };
/** Möbel-Plätze (Mitte unten des Möbelstücks) */
export const SLOTS: { x: number; y: number }[] = [
  { x: 60, y: 58 },
  { x: 16, y: 64 },
  { x: 104, y: 60 },
  { x: 20, y: 82 },
  { x: 100, y: 82 },
];
/** Grundfläche eines Möbelstücks (zum Anstoßen) */
const FOOT: Record<string, { w: number; h: number }> = {
  table: { w: 22, h: 6 },
  chair: { w: 8, h: 4 },
  rug: { w: 0, h: 0 },
  plant: { w: 8, h: 4 },
  lamp: { w: 6, h: 4 },
  shelf: { w: 18, h: 5 },
};

const hit = (r: Rect, x: number, y: number, fw = 3, fh = 1) => x + fw > r.x && x - fw < r.x + r.w && y + fh > r.y && y - fh < r.y + r.h;

/** Darf der Fuß hier stehen? */
export function roomFree(x: number, y: number, furn: Record<number, string> = {}) {
  if (x < MIN_X || x > MAX_X || y < MIN_Y || y > MAX_Y) return false;
  if (hit(BED, x, y) || hit(CHEST, x, y)) return false;
  for (const [k, id] of Object.entries(furn)) {
    const s = SLOTS[Number(k)];
    const f = FOOT[id];
    if (!s || !f || !f.w) continue;
    if (hit({ x: s.x - f.w / 2, y: s.y - f.h, w: f.w, h: f.h }, x, y)) return false;
  }
  return true;
}

export type RoomSpot = { kind: 'bed' | 'chest' | 'door' } | { kind: 'slot'; slot: number };
/** Was ist in Reichweite der Füße? */
export function nearSpot(x: number, y: number, furn: Record<number, string> = {}): RoomSpot | null {
  if (Math.abs(x - DOOR.x) < 9 && y > ROOM_H - 10) return { kind: 'door' };
  if (x < BED.x + BED.w + 8 && y < BED.y + BED.h + 8) return { kind: 'bed' };
  if (x > CHEST.x - 8 && y < CHEST.y + CHEST.h + 8) return { kind: 'chest' };
  let best = -1;
  let bd = 16;
  SLOTS.forEach((s, i) => {
    if (furn[i]) return;
    const d = Math.hypot(s.x - x, (s.y - y) * 1.3);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best >= 0 ? { kind: 'slot', slot: best } : null;
}

// ---------- Zeichnen ----------
function furnitureSprite(id: string): { img: HTMLCanvasElement; ox: number; oy: number } | null {
  if (!furnitureById(id)) return null;
  if (id === 'table') {
    const g = new Grid(26, 16);
    g.rect(1, 2, 24, 7, '#a87a48');
    g.rect(1, 2, 24, 2, '#c8925a');
    g.rect(1, 8, 24, 1, '#7a5232');
    g.rect(3, 9, 2, 6, '#7a5232');
    g.rect(21, 9, 2, 6, '#7a5232');
    // Vase mit Blume
    g.rect(11, 0, 3, 3, '#e8dcc8');
    g.set(12, 0, '#ff9fc4');
    return { img: g.render(), ox: 13, oy: 15 };
  }
  if (id === 'chair') {
    const g = new Grid(10, 15);
    g.rect(1, 0, 8, 7, '#a87a48');
    g.rect(2, 1, 6, 1, '#c8925a');
    g.rect(1, 7, 8, 3, '#c8925a');
    g.rect(1, 10, 1, 4, '#7a5232');
    g.rect(8, 10, 1, 4, '#7a5232');
    return { img: g.render(), ox: 5, oy: 14 };
  }
  if (id === 'rug') {
    const g = new Grid(30, 12);
    for (let y = 0; y < 12; y++)
      for (let x = 0; x < 30; x++) {
        const d = ((x - 14.5) / 15) ** 2 + ((y - 5.5) / 6) ** 2;
        if (d > 1) continue;
        g.set(x, y, d > 0.7 ? '#8a3a3a' : d > 0.4 ? '#e0564a' : (x + y) % 4 === 0 ? '#f2c14e' : '#c84a3a');
      }
    return { img: g.render(false), ox: 15, oy: 8 };
  }
  if (id === 'plant') {
    const g = new Grid(12, 18);
    g.rect(3, 11, 6, 6, '#b05a3a');
    g.rect(3, 11, 6, 1, '#d8784a');
    g.rect(1, 3, 4, 6, '#4f9a44');
    g.rect(7, 2, 4, 7, '#3a7d32');
    g.rect(4, 0, 4, 10, '#56a648');
    g.set(5, 1, '#8ad070');
    g.set(2, 4, '#7cc460');
    return { img: g.render(), ox: 6, oy: 17 };
  }
  if (id === 'lamp') {
    const g = new Grid(10, 24);
    g.rect(1, 0, 8, 6, '#f2dca0');
    g.rect(1, 5, 8, 1, '#c8a870');
    g.rect(4, 6, 2, 15, '#5a3a20');
    g.rect(2, 21, 6, 2, '#5a3a20');
    return { img: g.render(), ox: 5, oy: 23 };
  }
  if (id === 'shelf') {
    const g = new Grid(22, 26);
    g.rect(0, 0, 22, 25, '#8a5a32');
    g.rect(1, 1, 20, 23, '#6a4228');
    for (const y of [8, 16]) g.rect(1, y, 20, 2, '#a87a48');
    // Bücher & Gläser
    const books = ['#e0564a', '#4a8ad0', '#f2c14e', '#5fae63', '#9a6ad0'];
    for (let i = 0; i < 6; i++) g.rect(2 + i * 3, 2 + (i % 2), 2, 6 - (i % 2), books[i % 5]);
    for (let i = 0; i < 4; i++) g.rect(3 + i * 5, 11, 3, 5, i % 2 ? '#9fd8f0' : '#f4eef4');
    g.rect(3, 19, 7, 5, '#b05a9a');
    return { img: g.render(), ox: 11, oy: 25 };
  }
  return null;
}

function bedSprite() {
  const g = new Grid(26, 26);
  g.rect(0, 0, 26, 8, '#7a5232'); // Kopfteil
  g.rect(1, 1, 24, 1, '#a87a48');
  g.rect(1, 7, 24, 16, '#f4eef4'); // Laken
  g.rect(3, 8, 9, 5, '#ffffff'); // Kissen
  g.rect(14, 8, 9, 5, '#ffffff');
  g.rect(1, 13, 24, 10, '#4a8ad0'); // Decke
  g.rect(1, 13, 24, 1, '#7ab2ec');
  for (let x = 3; x < 25; x += 6) g.rect(x, 16, 2, 2, '#f2c14e');
  g.rect(0, 23, 26, 2, '#7a5232');
  return g.render();
}
function chestSprite() {
  const g = new Grid(18, 14);
  g.rect(0, 2, 18, 11, '#a87a48');
  g.rect(0, 2, 18, 4, '#8a5a32');
  g.rect(0, 2, 18, 1, '#c8925a');
  g.rect(0, 6, 18, 1, '#5a3a20');
  g.rect(8, 5, 2, 3, '#f2c14e');
  g.rect(2, 2, 1, 11, '#6a6670');
  g.rect(15, 2, 1, 11, '#6a6670');
  return g.render();
}

const cache = new Map<string, HTMLCanvasElement>();
/** fertig gemalter Raum mit Möbeln (zwischengespeichert) */
export function paintRoom(furn: Record<number, string> = {}, night = false, emptyMarks = true): HTMLCanvasElement {
  const key = JSON.stringify(furn) + night + emptyMarks;
  const hitC = cache.get(key);
  if (hitC) return hitC;
  const c = document.createElement('canvas');
  c.width = ROOM_W;
  c.height = ROOM_H + 4;
  const g = c.getContext('2d')!;
  const px = (col: string, x: number, y: number, w: number, h: number) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  // Boden: Dielen
  for (let y = WALL; y < ROOM_H; y += 5)
    for (let x = 0; x < ROOM_W; x += 1) {
      const plank = Math.floor((x + Math.floor(y / 5) * 13) / 24);
      px(plank % 2 ? '#c8925a' : '#bd8650', x, y, 1, 5);
    }
  for (let y = WALL; y < ROOM_H; y += 5) px('#9a6a40', 0, y + 4, ROOM_W, 1);
  // Wand: senkrechte Bretter, Fußleiste
  for (let x = 0; x < ROOM_W; x += 6) {
    px(x % 12 ? '#e8c890' : '#dcb880', x, 0, 6, WALL);
    px('#b08050', x + 5, 0, 1, WALL);
  }
  px('#8a5a32', 0, WALL - 2, ROOM_W, 2);
  px('#5a3a20', 0, 0, ROOM_W, 2);
  // Fenster (nachts dunkelblau mit Sternen)
  px('#5a3a20', 48, 5, 24, 15);
  px(night ? '#1e2a5a' : '#9fd8f0', 50, 7, 20, 11);
  if (night) for (const [sx, sy] of [[53, 9], [63, 8], [58, 13], [67, 14]]) px('#fff8c0', sx, sy, 1, 1);
  else {
    px('#e6f7ff', 51, 8, 4, 1);
    px('#7cc460', 50, 15, 20, 3); // Wiese draußen
  }
  px('#5a3a20', 59, 7, 2, 11);
  px('#5a3a20', 50, 12, 20, 1);
  // Bild an der Wand
  px('#8a5a32', 22, 6, 12, 10);
  px('#9fd8f0', 23, 7, 10, 5);
  px('#5fae63', 23, 11, 10, 4);
  px('#f2c14e', 30, 8, 2, 2);
  // Tür unten
  px('#5a361e', DOOR.x - 8, ROOM_H - 3, 16, 7);
  px('#7a4a2a', DOOR.x - 7, ROOM_H - 2, 14, 6);
  // Bett & Truhe
  g.drawImage(bedSprite(), BED.x - 1, BED.y - 4);
  g.drawImage(chestSprite(), CHEST.x, CHEST.y - 2);
  // Möbel (Teppich zuerst)
  const order = Object.entries(furn).sort(([, a], [, b]) => (a === 'rug' ? -1 : b === 'rug' ? 1 : 0));
  for (const [k, id] of order) {
    const s = SLOTS[Number(k)];
    const sp = furnitureSprite(id);
    if (s && sp) g.drawImage(sp.img, s.x - sp.ox, s.y - sp.oy);
  }
  // freie Plätze gestrichelt markieren
  if (emptyMarks)
    SLOTS.forEach((s, i) => {
      if (furn[i]) return;
      g.fillStyle = 'rgba(90,58,32,0.35)';
      for (let k = -6; k <= 6; k += 3) {
        g.fillRect(s.x + k, s.y - 1, 2, 1);
        g.fillRect(s.x + k, s.y - 9, 2, 1);
      }
      for (let k = -8; k <= 0; k += 3) {
        g.fillRect(s.x - 7, s.y + k, 1, 2);
        g.fillRect(s.x + 7, s.y + k, 1, 2);
      }
    });
  cache.set(key, c);
  if (cache.size > 40) cache.delete(cache.keys().next().value!);
  return c;
}

/** Vorschaubild eines Möbelstücks (für das Auswahl-Fenster) */
export function furnitureIcon(id: string) {
  return furnitureSprite(id)?.img ?? null;
}
