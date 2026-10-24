/**
 * Insel-Projekte: ein großes Ziel nach dem anderen (Brunnen, Marktstand,
 * Gewächshaus, Leuchtturm, Festpavillon). Jedes braucht Sachen aus allen
 * Bereichen – Holz, Steine, Rüben, Obst, Heu, Fische … – und belohnt mit etwas,
 * das die Insel besser macht. Gehören der Insel (im Koop baut man zusammen).
 * Reine Logik.
 */
import { Farm } from './farm';
import { FISH } from './fish';
import type { World } from './world';

export type ProjItem = 'wood' | 'stones' | 'sticks' | 'turnip' | 'apple' | 'berry' | 'hay' | 'fish' | 'meal' | 'grilled' | 'coins';
/** bag = kommt aus dem eigenen Rucksack (sonst aus dem Insel-Vorrat) */
export const PROJ_ITEMS: Record<ProjItem, { name: string; bag?: boolean }> = {
  wood: { name: 'Holz' },
  stones: { name: 'Steine', bag: true },
  sticks: { name: 'Stöcke', bag: true },
  turnip: { name: 'Rüben' },
  apple: { name: 'Äpfel' },
  berry: { name: 'Beeren' },
  hay: { name: 'Heu' },
  fish: { name: 'Fische' },
  meal: { name: 'Ofenrüben' },
  grilled: { name: 'Bratfisch' },
  coins: { name: 'Münzen' },
};

export interface Foot {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
export interface Project {
  id: 'well' | 'market' | 'greenhouse' | 'lighthouse' | 'pavilion';
  name: string;
  text: string;
  /** was es bringt, wenn es fertig ist */
  reward: string;
  need: Partial<Record<ProjItem, number>>;
  foot: Foot;
  /** Bauplätze (Fußpunkt, Welt-Pixel) – der erste freie wird genommen */
  sites: [number, number][];
}

export const PROJECTS: Project[] = [
  {
    id: 'well',
    name: 'Brunnen',
    text: 'Ein alter Brunnen – mit ein paar Steinen und Holz sprudelt er wieder.',
    reward: 'Am Brunnen kannst du deinen Kübel auffüllen – ganz ohne zum Meer zu laufen.',
    need: { wood: 12, stones: 8, sticks: 4 },
    foot: { left: -10, right: 10, top: -8, bottom: 1 },
    sites: [[200, 150], [232, 150], [175, 132], [215, 176], [250, 120]],
  },
  {
    id: 'market',
    name: 'Marktstand',
    text: 'Ein Stand für frische Sachen von der Insel.',
    reward: 'Am Marktstand verkaufst du rund um die Uhr – nicht nur, wenn das Boot da ist.',
    need: { wood: 20, turnip: 6, apple: 8, berry: 6 },
    foot: { left: -14, right: 14, top: -8, bottom: 1 },
    sites: [[171, 215], [203, 215], [230, 199], [142, 225], [175, 184]],
  },
  {
    id: 'greenhouse',
    name: 'Gewächshaus',
    text: 'Ein Glashaus, in dem es immer schön warm ist.',
    reward: 'Rüben wachsen ein Viertel schneller.',
    need: { wood: 30, stones: 12, turnip: 12, hay: 10 },
    foot: { left: -18, right: 18, top: -14, bottom: 1 },
    sites: [[352, 173], [391, 182], [316, 173], [424, 160], [301, 143]],
  },
  {
    id: 'lighthouse',
    name: 'Leuchtturm',
    text: 'Er leuchtet nachts den Fischen und Booten den Weg.',
    reward: 'Seltene Fische beißen überall so gut wie draußen am Steg – und nachts dreht sich das Licht.',
    need: { wood: 40, stones: 20, fish: 8, meal: 4 },
    foot: { left: -9, right: 9, top: -9, bottom: 1 },
    sites: [[268, 216], [296, 202], [245, 238], [558, 213], [586, 202]],
  },
  {
    id: 'pavilion',
    name: 'Festpavillon',
    text: 'Der Mittelpunkt für das große Inselfest.',
    reward: 'Das Inselfest! 100 Münzen und jeden Abend ein Feuerwerk über dem Pavillon.',
    need: { wood: 50, apple: 12, grilled: 4, coins: 60 },
    foot: { left: -16, right: 16, top: -14, bottom: 1 },
    sites: [[430, 170], [460, 161], [405, 188], [489, 153], [330, 199]],
  },
];
export const projectById = (id: string) => PROJECTS.find((p) => p.id === id);
/** Belohnung fürs Inselfest */
export const FEST_COINS = 100;

/** Stand: so viele sind fertig, was beim aktuellen schon abgegeben ist, gewählte Bauplätze */
export interface ProjState {
  n: number;
  got: Partial<Record<ProjItem, number>>;
  sites: ([number, number] | null)[];
}
export const newProj = (): ProjState => ({ n: 0, got: {}, sites: [] });
export function cleanProj(p: Partial<ProjState> | undefined): ProjState {
  const out = newProj();
  if (!p || typeof p !== 'object') return out;
  out.n = Math.max(0, Math.min(PROJECTS.length, Math.floor(p.n ?? 0)));
  for (const [k, v] of Object.entries(p.got ?? {})) if (k in PROJ_ITEMS && typeof v === 'number' && v > 0) out.got[k as ProjItem] = Math.floor(v);
  out.sites = (Array.isArray(p.sites) ? p.sites : []).slice(0, PROJECTS.length).map((s) => (Array.isArray(s) && typeof s[0] === 'number' && typeof s[1] === 'number' ? [s[0], s[1]] : null));
  return out;
}

/** Fortschritt des aktuellen Projekts 0..1 */
export function projProgress(p: ProjState) {
  const cur = PROJECTS[p.n];
  if (!cur) return 1;
  let need = 0;
  let got = 0;
  for (const [k, v] of Object.entries(cur.need)) {
    need += v;
    got += Math.min(v, p.got[k as ProjItem] ?? 0);
  }
  return need ? got / need : 1;
}

/** Fische für Projekte und Braten: nur die häufigen (seltene sind zu schade) */
export const plainFish = (w: World) => FISH.filter((f) => f.cook).reduce((s, f) => s + (w.fish[f.id] ?? 0), 0);

/** Wie viel davon liegt im Insel-Vorrat? (Stöcke/Steine: im Rucksack, zählt das Gerät selbst) */
export function islandHas(w: World, f: Farm, item: ProjItem) {
  switch (item) {
    case 'wood':
      return w.wood;
    case 'turnip':
      return f.turnips;
    case 'apple':
      return w.apples;
    case 'berry':
      return w.berries;
    case 'hay':
      return f.hay;
    case 'fish':
      return plainFish(w);
    case 'meal':
      return f.meals;
    case 'grilled':
      return w.grilled;
    case 'coins':
      return w.coins;
    default:
      return 0;
  }
}
/** aus dem Insel-Vorrat nehmen (vorher mit islandHas geprüft) */
export function islandTake(w: World, f: Farm, item: ProjItem, n: number) {
  if (item === 'wood') w.wood -= n;
  else if (item === 'turnip') f.turnips -= n;
  else if (item === 'apple') w.apples -= n;
  else if (item === 'berry') w.berries -= n;
  else if (item === 'hay') f.hay -= n;
  else if (item === 'meal') f.meals -= n;
  else if (item === 'grilled') w.grilled -= n;
  else if (item === 'coins') w.coins -= n;
  else if (item === 'fish')
    for (const fi of FISH.filter((x) => x.cook))
      while (n > 0 && (w.fish[fi.id] ?? 0) > 0) {
        if (--w.fish[fi.id] <= 0) delete w.fish[fi.id];
        n--;
      }
  f.version++;
}

/** Liegt ein Feld unter der Fläche? */
function plotUnder(f: Farm, x: number, y: number, foot: Foot) {
  const [c0, r0] = Farm.tileAt(x + foot.left, y + foot.top - 6);
  const [c1, r1] = Farm.tileAt(x + foot.right, y + foot.bottom);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (f.plot(c, r)) return true;
  return false;
}
/** Bauplatz für Projekt k: erster freier aus der Liste, sonst in der Nähe suchen */
export function pickSite(w: World, f: Farm, k: number): [number, number] {
  const p = PROJECTS[k];
  const ok = (x: number, y: number) => w.canPlaceFoot(x, y, p.foot) && !plotUnder(f, x, y, p.foot);
  for (const [x, y] of p.sites) if (ok(x, y)) return [x, y];
  const [cx, cy] = p.sites[0];
  for (let r = 6; r <= 90; r += 6)
    for (let a = 0; a < 16; a++) {
      const x = Math.round(cx + Math.cos((a / 16) * Math.PI * 2) * r);
      const y = Math.round(cy + Math.sin((a / 16) * Math.PI * 2) * r * 0.7);
      if (ok(x, y)) return [x, y];
    }
  return [cx, cy];
}
/** wo das Projekt k steht bzw. stehen wird */
export const siteOf = (w: World, f: Farm, k: number): [number, number] => w.proj.sites[k] ?? pickSite(w, f, k);
