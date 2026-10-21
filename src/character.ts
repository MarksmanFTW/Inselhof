/**
 * Spielfigur im Pixelstil der Insel: großer Kopf, kleine Statur, fast schwarze
 * Umrandung, Licht von links oben. Alle Teile werden aus Farbflächen gemalt und
 * danach automatisch umrandet – so lassen sich Haut, Frisur, Kleidung und Hut frei
 * kombinieren. Pro Aussehen entstehen 3 Richtungen × 4 Lauf-Bilder (links = gespiegelt).
 */

export interface Look {
  skin: number;
  hair: number;
  hairColor: number;
  shirt: number;
  pants: number;
  hat: number;
}

export const SKINS = ['#ffe0c8', '#f4c9a2', '#dba67a', '#b07a50', '#7a4b2e'];
export const HAIR_COLORS = ['#5a3a22', '#2a2026', '#e8c25a', '#c8582c', '#eae4dc', '#e07aa8', '#4a8ad0'];
export const SHIRTS = ['#e0564a', '#4a8ad0', '#f2c14e', '#5fae63', '#f4f0e6', '#9a6ad0', '#f08ab0', '#3a3a4a'];
export const PANTS = ['#4a6a9a', '#6a4a32', '#3a3a44', '#7a8a52', '#c8b088', '#8a3a3a'];
export const HAIRS = ['Kurz', 'Wuschel', 'Lang', 'Zopf', 'Glatt', 'Glatze'];
export const HATS = ['Keiner', 'Strohhut', 'Mütze', 'Kopftuch', 'Blume'];
export const PARTS = [
  { key: 'skin', label: 'Haut', count: SKINS.length },
  { key: 'hair', label: 'Frisur', count: HAIRS.length, names: HAIRS },
  { key: 'hairColor', label: 'Haarfarbe', count: HAIR_COLORS.length },
  { key: 'shirt', label: 'Oberteil', count: SHIRTS.length },
  { key: 'pants', label: 'Hose', count: PANTS.length },
  { key: 'hat', label: 'Hut', count: HATS.length, names: HATS },
] as const;

export const DEFAULT_LOOK: Look = { skin: 1, hair: 0, hairColor: 0, shirt: 0, pants: 0, hat: 1 };

export function randomLook(r = Math.random): Look {
  const pick = (n: number) => Math.floor(r() * n);
  return {
    skin: pick(SKINS.length),
    hair: pick(HAIRS.length - 1),
    hairColor: pick(HAIR_COLORS.length),
    shirt: pick(SHIRTS.length),
    pants: pick(PANTS.length),
    hat: r() < 0.5 ? 0 : 1 + pick(HATS.length - 1),
  };
}

/** Bildgröße eines Lauf-Bildes; der Fußpunkt liegt unten in der Mitte */
export const CW = 16;
export const CH = 24;
export const FOOT_X = 8;
export const FOOT_Y = 22;

export const enum Dir {
  Down = 0,
  Up = 1,
  Right = 2,
  Left = 3,
}

const OUTLINE = '#1a1210';
const EYE = '#2a1a16';
const SHOE = '#4a3020';
const STRAW = '#e8c870';
const BAND = '#c8582c';

function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => ch(v).toString(16).padStart(2, '0')).join('')}`;
}

/** Malgrund: Farbe je Pixel, Umrandung kommt am Ende */
class Px {
  c: (string | null)[] = new Array(CW * CH).fill(null);
  set(x: number, y: number, col: string) {
    if (x >= 0 && y >= 0 && x < CW && y < CH) this.c[y * CW + x] = col;
  }
  rect(x: number, y: number, w: number, h: number, col: string) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, col);
  }
  get(x: number, y: number) {
    return x >= 0 && y >= 0 && x < CW && y < CH ? this.c[y * CW + x] : null;
  }
  /** Fläche mit Licht oben links, Schatten unten rechts */
  lit(x: number, y: number, w: number, h: number, col: string, round = false) {
    for (let yy = 0; yy < h; yy++)
      for (let xx = 0; xx < w; xx++) {
        if (round && (yy === 0 || yy === h - 1) && (xx === 0 || xx === w - 1)) continue;
        let c = col;
        if (xx === w - 1 || yy === h - 1) c = shade(col, -0.22);
        else if ((xx === 0 && yy < h - 1) || yy === 0) c = shade(col, 0.18);
        this.set(x + xx, y + yy, c);
      }
  }
  render(): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = CW;
    cv.height = CH;
    const g = cv.getContext('2d')!;
    for (let y = 0; y < CH; y++)
      for (let x = 0; x < CW; x++) {
        const col = this.get(x, y);
        if (col) {
          g.fillStyle = col;
          g.fillRect(x, y, 1, 1);
        } else if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) {
          g.fillStyle = OUTLINE;
          g.fillRect(x, y, 1, 1);
        }
      }
    return cv;
  }
}

/** Ein Lauf-Bild malen. frame 0..3: 0/2 Stand, 1/3 Schritt (Körper hüpft 1 px) */
function draw(look: Look, dir: Dir.Down | Dir.Up | Dir.Right, frame: number): HTMLCanvasElement {
  const p = new Px();
  const skin = SKINS[look.skin];
  const hair = HAIR_COLORS[look.hairColor];
  const shirt = SHIRTS[look.shirt];
  const pants = PANTS[look.pants];
  const step = frame % 2 === 1;
  const lead = frame === 1 ? -1 : frame === 3 ? 1 : 0; // welches Bein vorn
  const bob = step ? -1 : 0;
  const side = dir === Dir.Right;

  // --- Beine & Schuhe (y 17..21) ---
  if (side) {
    // Seitenansicht: Beine schwingen vor und zurück
    const a = lead === 0 ? 0 : 2;
    p.rect(6 - a / 2, 17 + bob, 2, 3, shade(pants, -0.15));
    p.rect(9 + a / 2, 17 + bob, 2, 3, pants);
    p.rect(6 - a / 2, 20 + bob, 2, 1, SHOE);
    p.rect(9 + a / 2, 20 + bob, 3, 1, SHOE);
  } else {
    const lUp = lead === -1 ? 1 : 0;
    const rUp = lead === 1 ? 1 : 0;
    p.rect(5, 17 + bob, 2, 3 - lUp, pants);
    p.rect(9, 17 + bob, 2, 3 - rUp, shade(pants, -0.15));
    p.rect(5, 20 + bob - lUp, 2, 1, SHOE);
    p.rect(9, 20 + bob - rUp, 2, 1, SHOE);
  }

  // --- Körper (y 11..16) ---
  const by = 11 + bob;
  if (side) {
    p.lit(6, by, 5, 4, shirt);
    p.lit(6, by + 4, 5, 2, pants);
    // Arm schwingt gegen das vordere Bein
    const sw = lead === 0 ? 0 : lead;
    p.rect(7 - sw, by + 1, 2, 3, shade(shirt, -0.12));
    p.set(7 - sw, by + 4, skin);
    p.set(8 - sw, by + 4, shade(skin, -0.15));
  } else {
    p.lit(5, by, 6, 4, shirt);
    p.lit(5, by + 4, 6, 2, pants);
    if (dir === Dir.Down) {
      // Kragen
      p.set(7, by, shade(shirt, -0.3));
      p.set(8, by, shade(shirt, -0.3));
    }
    // Arme schwingen beim Gehen
    const la = lead === -1 ? -1 : lead === 1 ? 1 : 0;
    p.rect(4, by - la, 1, 3, shade(shirt, 0.08));
    p.rect(11, by + la, 1, 3, shade(shirt, -0.2));
    p.set(4, by + 3 - la, skin);
    p.set(11, by + 3 + la, shade(skin, -0.15));
  }

  // --- Kopf (y 1..10), groß wie bei Pixel-RPGs ---
  const hy = 1 + bob;
  if (side) p.lit(4, hy, 9, 10, skin, true);
  else p.lit(3, hy, 10, 10, skin, true);

  // Gesicht
  if (dir === Dir.Down) {
    p.rect(5, hy + 5, 1, 2, EYE);
    p.rect(10, hy + 5, 1, 2, EYE);
    p.set(4, hy + 7, shade('#f08a8a', 0.3));
    p.set(11, hy + 7, shade('#f08a8a', 0.3));
    p.set(7, hy + 8, shade(skin, -0.3));
    p.set(8, hy + 8, shade(skin, -0.3));
  } else if (side) {
    p.rect(10, hy + 5, 1, 2, EYE);
    p.set(10, hy + 7, shade('#f08a8a', 0.3));
    p.set(12, hy + 6, shade(skin, -0.12)); // Nase
  }

  drawHair(p, look.hair, hair, dir, hy);
  drawHat(p, look.hat, dir, hy);
  return p.render();
}

function drawHair(p: Px, style: number, col: string, dir: Dir, hy: number) {
  const dark = shade(col, -0.25);
  const hi = shade(col, 0.25);
  const side = dir === Dir.Right;
  const back = dir === Dir.Up;
  const x0 = side ? 4 : 3;
  const w = side ? 9 : 10;
  if (style === 5) return; // Glatze

  // Haube oben (alle Frisuren)
  p.rect(x0, hy, w, 3, col);
  p.rect(x0 + 1, hy, w - 3, 1, hi);
  if (back) {
    // Hinterkopf ganz bedeckt
    p.rect(x0, hy + 3, w, style === 2 ? 8 : 5, col);
    p.rect(x0, hy + 7, w, 1, dark);
    if (style === 2) p.rect(x0 + 1, hy + 10, w - 2, 2, dark);
  } else if (side) {
    // Hinterkopf links, Stirn rechts frei
    p.rect(x0, hy + 3, 4, style === 2 ? 9 : 5, col);
    p.rect(x0, hy + 3, 1, style === 2 ? 9 : 5, dark);
    p.set(x0 + 7, hy + 3, col); // Pony
  } else {
    // vorne: Pony und Seiten
    p.rect(x0, hy + 3, 1, style === 2 ? 9 : 4, col);
    p.rect(x0 + w - 1, hy + 3, 1, style === 2 ? 9 : 4, dark);
    if (style === 4) p.rect(x0 + 1, hy + 3, w - 4, 1, col); // glatter Seitenscheitel
    else {
      p.set(x0 + 2, hy + 3, col);
      p.set(x0 + 5, hy + 3, col);
      p.set(x0 + 6, hy + 3, col);
    }
  }
  if (style === 1) {
    // Wuschel: Buckel oben
    for (let x = x0; x < x0 + w; x += 2) p.set(x, hy - 1, x % 4 ? col : hi);
    if (!side) {
      p.set(x0 - 1, hy + 2, col);
      p.set(x0 + w, hy + 2, dark);
    }
  }
  if (style === 2 && !back && !side) {
    // lange Haare fallen außen bis zu den Schultern
    p.rect(x0 - 1, hy + 4, 1, 7, col);
    p.rect(x0 + w, hy + 4, 1, 7, dark);
  }
  if (style === 3) {
    // Zopf: Dutt oben, im Profil hinten
    if (side) {
      p.rect(x0 - 2, hy + 2, 2, 3, col);
      p.set(x0 - 2, hy + 2, hi);
    } else {
      p.rect(x0 + 4, hy - 2, 2, 2, col);
      p.set(x0 + 4, hy - 2, hi);
    }
  }
}

function drawHat(p: Px, hat: number, dir: Dir, hy: number) {
  const side = dir === Dir.Right;
  const x0 = side ? 4 : 3;
  const w = side ? 9 : 10;
  if (hat === 1) {
    // Strohhut mit breiter Krempe und rotem Band
    p.rect(x0 - 2, hy + 2, w + 4, 1, shade(STRAW, -0.15));
    p.rect(x0 - 1, hy + 1, w + 2, 1, STRAW);
    p.rect(x0 + 1, hy - 2, w - 2, 3, STRAW);
    p.rect(x0 + 2, hy - 2, w - 5, 1, shade(STRAW, 0.3));
    p.rect(x0 + 1, hy, w - 2, 1, BAND);
  } else if (hat === 2) {
    // Strickmütze mit Bommel
    const c = '#4a8ad0';
    p.rect(x0, hy - 1, w, 4, c);
    p.rect(x0, hy + 2, w, 1, shade(c, -0.25));
    for (let x = x0 + 1; x < x0 + w; x += 2) p.set(x, hy, shade(c, 0.25));
    p.rect(x0 + Math.floor(w / 2) - 1, hy - 3, 2, 2, '#f4f0e6');
  } else if (hat === 3) {
    // Kopftuch
    const c = '#e0564a';
    p.rect(x0, hy, w, 3, c);
    p.rect(x0, hy + 2, w, 1, shade(c, -0.2));
    p.set(x0 + 2, hy + 1, '#f4f0e6');
    p.set(x0 + 6, hy + 1, '#f4f0e6');
    if (dir !== Dir.Down) p.rect(side ? x0 - 2 : x0 + 3, hy + 3, 2, 2, c);
  } else if (hat === 4) {
    // Blume im Haar
    const fx = side ? x0 + 1 : x0 + w - 3;
    p.set(fx, hy, '#ff9fc4');
    p.set(fx + 2, hy, '#ff9fc4');
    p.set(fx + 1, hy - 1, '#ff9fc4');
    p.set(fx + 1, hy + 1, '#ff9fc4');
    p.set(fx + 1, hy, '#ffd23f');
  }
}

export type CharSheet = HTMLCanvasElement[][]; // [Richtung][Bild]

/** Alle Bilder für ein Aussehen */
export function makeCharacter(look: Look): CharSheet {
  const sheet: CharSheet = [];
  for (const d of [Dir.Down, Dir.Up, Dir.Right] as const) sheet[d] = [0, 1, 2, 3].map((f) => draw(look, d, f));
  sheet[Dir.Left] = sheet[Dir.Right].map((img) => {
    const m = document.createElement('canvas');
    m.width = CW;
    m.height = CH;
    const g = m.getContext('2d')!;
    g.translate(CW, 0);
    g.scale(-1, 1);
    g.drawImage(img, 0, 0);
    return m;
  });
  return sheet;
}
