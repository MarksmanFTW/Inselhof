/**
 * Insel-Sterne: wie schön und lebendig die Insel ist (Häuser, Bewohner, Deko,
 * Projekte, Felder, Pferde, Album). Für jeden neuen Stern gibt es einmal eine
 * Belohnung, beim dritten und fünften eine besondere Deko. Hängt nur vom Stand der
 * Insel ab (Koop: auf jedem Gerät gleich). Reine Logik.
 */
import type { Farm } from './farm';
import { PROJECTS } from './projects';
import { albumCount } from './shop';
import type { World } from './world';

export interface StarPart {
  id: string;
  name: string;
  /** was hilft */
  tip: string;
  pts: number;
  max: number;
}
const cap = (v: number, max: number) => Math.min(max, v);
/** Punkte je Bereich */
export function starParts(w: World, f: Farm): StarPart[] {
  const big = w.houses.filter((h) => h.big).length;
  return [
    { id: 'homes', name: 'Häuser', tip: 'Bau Häuser und bau sie aus (Bauen → Haus ausbauen).', pts: cap(w.houses.length * 6, 24) + cap(big * 4, 8), max: 32 },
    { id: 'folk', name: 'Bewohner', tip: 'Jedes Bewohnerhaus bringt ein neues Tier.', pts: cap(w.villagers.length * 5, 30), max: 30 },
    { id: 'deco', name: 'Deko', tip: 'Stell Deko auf: Blumenbeete, Bänke, Laternen …', pts: cap(w.decos.length * 2, 30), max: 30 },
    { id: 'proj', name: 'Insel-Projekte', tip: 'Bring die großen Projekte am Steg zu Ende.', pts: cap(w.proj.n * 6, PROJECTS.length * 6), max: PROJECTS.length * 6 },
    { id: 'farm', name: 'Felder', tip: 'Mehr Felder (je 4 ein Punkt) und Hochbeete.', pts: cap(Math.floor(f.plots.size / 4), 10) + cap(w.beets.length * 2, 6), max: 16 },
    { id: 'horses', name: 'Pferde', tip: 'Nimm Pferde im Stall auf.', pts: cap(w.horses.length * 3, 18), max: 18 },
    { id: 'album', name: 'Sammelalbum', tip: 'Sammle Fische, Muscheln, Deko und mehr (je 2 ein Punkt).', pts: cap(Math.floor(albumCount(w.album) / 2), 30), max: 30 },
  ];
}
export const starScore = (w: World, f: Farm) => starParts(w, f).reduce((a, p) => a + p.pts, 0);
/** ab so vielen Punkten gibt es den 1.–5. Stern */
export const STAR_AT = [15, 40, 75, 115, 160];
export const starsOf = (score: number) => STAR_AT.filter((a) => score >= a).length;
export interface StarReward {
  coins: number;
  wood?: number;
  deco?: string;
}
export const STAR_REWARDS: StarReward[] = [{ coins: 20 }, { coins: 40, wood: 10 }, { coins: 80, deco: 'flowerarch' }, { coins: 120, wood: 20 }, { coins: 200, deco: 'starstatue' }];

/** neu erreichte Sterne belohnen (jeden nur einmal); gibt die neuen Sterne zurück */
export function claimStars(w: World, f: Farm): number[] {
  const n = starsOf(starScore(w, f));
  const got: number[] = [];
  while (w.starsClaimed < n) {
    const r = STAR_REWARDS[w.starsClaimed++];
    w.coins += r.coins;
    if (r.wood) w.wood += r.wood;
    if (r.deco) {
      w.decoInv[r.deco] = (w.decoInv[r.deco] ?? 0) + 1;
      w.albumAdd('deco', r.deco);
    }
    got.push(w.starsClaimed);
  }
  if (got.length) w.version++;
  return got;
}
