/**
 * Händler-Boot, Deko für draußen, Münze und Album-Buch – Pixel-Grafiken im Insel-Stil.
 */
import { Grid, type Prop } from './props';

/** Münze */
export function coinIcon(): HTMLCanvasElement {
  const g = new Grid(10, 10);
  const rows = ['..XXXX..', '.XYYYYX.', 'XYYXXYYX', 'XYXYYYYX', 'XYXYYYYX', 'XYYXXYYX', '.XYYYYX.', '..XXXX..'];
  rows.forEach((r, y) => [...r].forEach((c, x) => c !== '.' && g.set(x + 1, y + 1, c === 'X' ? '#c8901c' : '#ffd84a')));
  g.set(3, 3, '#fff3b0');
  return g.render();
}

/** Sammelalbum (Buch mit Hufeisen) */
export function bookIcon(): HTMLCanvasElement {
  const g = new Grid(14, 14);
  g.rect(2, 1, 10, 12, '#a0482e');
  g.rect(2, 1, 1, 12, '#6e2a1c');
  g.rect(11, 2, 1, 11, '#efe6d6');
  g.rect(3, 12, 9, 1, '#efe6d6');
  g.rect(5, 4, 1, 4, '#ffd84a');
  g.rect(9, 4, 1, 4, '#ffd84a');
  g.rect(6, 8, 3, 1, '#ffd84a');
  return g.render();
}

/** Händler-Boot mit Segel, Kisten und der Händlerin */
export function boat(): Prop {
  const W = 44;
  const H = 40;
  const g = new Grid(W, H);
  // Mast und Segel
  g.rect(21, 2, 2, 26, '#6a4428');
  for (let y = 0; y < 18; y++) {
    const w = Math.round(3 + y * 0.8);
    for (let x = 0; x < w; x++) g.set(23 + x, 4 + y, (x + y) % 7 === 0 ? '#e8dcc0' : y % 6 === 5 ? '#d84a3a' : '#fff6e6');
  }
  g.rect(23, 3, 6, 1, '#d84a3a'); // Wimpel
  // Kisten und Fass
  g.rect(8, 22, 7, 6, '#b07a48');
  g.rect(8, 22, 7, 1, '#d8a868');
  g.rect(11, 22, 1, 6, '#8a5a32');
  g.rect(28, 23, 6, 5, '#8a5a32');
  g.rect(28, 25, 6, 1, '#5a3a20');
  // Rüben in der Kiste
  g.set(9, 21, '#b05a9a');
  g.set(12, 21, '#4f9a44');
  // Händlerin
  g.rect(16, 18, 4, 2, '#f4c9a2'); // Gesicht
  g.rect(15, 15, 6, 3, '#3a6ab0'); // Kapitänsmütze
  g.rect(15, 17, 6, 1, '#1e3a6a');
  g.rect(16, 20, 4, 6, '#2a7a8a'); // Jacke
  g.set(17, 19, '#2a1a16');
  g.set(19, 19, '#2a1a16');
  // Rumpf
  for (let y = 0; y < 9; y++) {
    const inset = y < 2 ? 0 : Math.floor((y - 1) / 2) + 1;
    for (let x = inset; x < W - inset - 1; x++) g.set(x, 27 + y, y === 0 ? '#e8c890' : y % 3 === 1 ? '#7a4a2a' : '#9a6038');
  }
  g.rect(4, 30, 35, 1, '#d84a3a'); // Zierstreifen
  return { img: g.render(), ox: 22, oy: 36 };
}

/** Deko-Bilder; Fußpunkt Mitte unten */
export function decoArt(id: string): Prop {
  const g = new Grid(20, 24);
  const foot = (img: HTMLCanvasElement): Prop => ({ img, ox: 10, oy: 22 });
  switch (id) {
    case 'flowers': {
      g.rect(3, 17, 14, 5, '#8a5e3a');
      g.rect(3, 17, 14, 1, '#a87a50');
      g.rect(3, 21, 14, 1, '#6a4428');
      const cols = ['#e0485a', '#ffd23f', '#f08ac8', '#ffffff', '#9a6ad0'];
      for (let i = 0; i < 6; i++) {
        const x = 4 + i * 2 + (i % 2);
        g.rect(x, 13 + (i % 2), 1, 4, '#3f8640');
        g.set(x, 12 + (i % 2), cols[i % cols.length]);
        g.set(x - 1, 13 + (i % 2), cols[i % cols.length]);
        g.set(x + 1, 13 + (i % 2), cols[i % cols.length]);
      }
      break;
    }
    case 'birdhouse':
      g.rect(9, 10, 2, 12, '#6a4428');
      g.rect(5, 5, 10, 7, '#c8925a');
      g.rect(5, 5, 10, 1, '#e0b07a');
      for (let k = 0; k < 4; k++) g.rect(4 + k, 4 - k, 12 - k * 2, 1, '#a0482e');
      g.rect(9, 7, 2, 2, '#2a1a10');
      g.set(10, 10, '#6a4428');
      break;
    case 'bench':
      g.rect(2, 12, 16, 2, '#b07a48'); // Lehne
      g.rect(2, 15, 16, 1, '#b07a48');
      g.rect(2, 17, 16, 2, '#c8925a'); // Sitz
      g.rect(2, 17, 16, 1, '#e0b07a');
      for (const x of [3, 16]) g.rect(x, 12, 1, 10, '#6a4428');
      break;
    case 'lantern':
      g.rect(9, 6, 2, 16, '#3a3a44');
      g.rect(7, 21, 6, 1, '#3a3a44');
      g.rect(7, 1, 6, 6, '#3a3a44');
      g.rect(8, 2, 4, 4, '#ffd87a');
      g.set(8, 2, '#fff3c0');
      g.rect(6, 0, 8, 1, '#3a3a44');
      break;
    case 'gnome':
      for (let k = 0; k < 6; k++) g.rect(10 - Math.floor(k / 2) - 1, 5 + k, 2 + Math.floor(k / 2) * 2, 1, '#d84a3a');
      g.rect(7, 11, 6, 3, '#f4c9a2');
      g.set(8, 12, '#2a1a16');
      g.set(11, 12, '#2a1a16');
      g.rect(7, 13, 6, 3, '#f2ece2'); // Bart
      g.rect(7, 16, 6, 4, '#3a6ab0');
      g.rect(7, 20, 2, 2, '#4a3020');
      g.rect(11, 20, 2, 2, '#4a3020');
      break;
    case 'well':
      g.rect(3, 14, 14, 8, '#8a8690');
      for (let x = 3; x < 17; x += 4) g.rect(x, 14, 1, 8, '#66626c');
      g.rect(3, 14, 14, 1, '#b4b0ba');
      g.rect(4, 15, 12, 1, '#2a4a7a'); // Wasser
      g.rect(3, 4, 1, 10, '#6a4428');
      g.rect(16, 4, 1, 10, '#6a4428');
      for (let k = 0; k < 3; k++) g.rect(2 + k, 3 - k, 16 - k * 2, 1, '#a0482e');
      g.rect(9, 5, 2, 4, '#8a5a32'); // Eimer
      g.rect(10, 4, 1, 1, '#3a3a44');
      break;
  }
  return foot(g.render());
}
