/**
 * Spiel-Aktionen als reine Logik auf World + Farm. Dieselbe Funktion läuft beim
 * Spielen und beim Abgleich einer gemeinsamen Insel: Aktionen, die jemand allein
 * gemacht hat, werden auf den neuesten Stand aus der Cloud nochmal angewendet.
 */
import { Farm } from './farm';
import { TILE } from './island';
import type { Action } from './net/room';
import { HOUSE_COST, HOUSE_FOOT, type World } from './world';

/**
 * eine gemachte Aktion mit Ort und Zeit (für den Abgleich).
 * Beim Fällen wird nur das Umfallen gemerkt (a.fell), nicht jeder Schlag.
 */
export interface Op {
  a: Action;
  x: number;
  y: number;
  t: number;
}

export interface OpResult {
  err: string | null;
  /** was passiert ist – für Effekte und Anzeigen */
  wood?: number;
  felled?: boolean;
  harvest?: { seeds: number; gotCan: boolean };
  built?: boolean;
  done: boolean;
}

export function tileFree(world: World, c: number, r: number, actor: { x: number; y: number }) {
  const cx = c * TILE + 4;
  const cy = r * TILE + 4;
  return !world.blocked(cx, cy, 4, 4) && !(Math.abs(actor.x - cx) < 4 && Math.abs(actor.y - cy) < 4);
}

/** Liegt ein Feld unter der Haus-Grundfläche? */
export function farmUnder(farm: Farm, x: number, y: number) {
  const [c0, r0] = Farm.tileAt(x + HOUSE_FOOT.left, y + HOUSE_FOOT.top - 6);
  const [c1, r1] = Farm.tileAt(x + HOUSE_FOOT.right, y + HOUSE_FOOT.bottom);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (farm.plot(c, r)) return true;
  return false;
}

export function applyOp(world: World, farm: Farm, op: Op): OpResult {
  const { a, t } = op;
  const actor = { x: op.x, y: op.y };
  const c = a.c ?? 0;
  const r = a.r ?? 0;
  let err: string | null = null;
  if (a.kind === 'axe') {
    if (!world.isl.decor[a.tree ?? -1]) return { err: null, done: false };
    if (a.fell) {
      const wood = world.fell(a.tree!, t);
      return { err: null, done: wood > 0, felled: wood > 0, wood };
    }
    const res = world.chop(a.tree!, t);
    return { err: null, done: true, felled: res.felled, wood: res.wood };
  }
  if (a.kind === 'hoe') err = farm.till(c, r, tileFree(world, c, r, actor));
  else if (a.kind === 'seeds') err = farm.plant(c, r);
  else if (a.kind === 'refill') farm.refill();
  else if (a.kind === 'water') err = farm.pour(c, r, t);
  else if (a.kind === 'harvest') {
    // Samen-Zufall aus der Zeit → beim Abgleich auf jedem Gerät gleich
    const res = farm.harvest(c, r, () => ((t * 9301 + 49297) % 233280) / 233280);
    return { err: null, done: !!res, harvest: res ?? undefined };
  } else if (a.kind === 'build') {
    const x = a.x ?? 0;
    const y = a.y ?? 0;
    if (farmUnder(farm, x, y)) err = 'Hier ist ein Feld im Weg';
    else if (world.build(x, y, actor)) return { err: null, done: true, built: true };
    else err = world.wood < HOUSE_COST ? 'Zu wenig Holz' : 'Hier ist kein Platz';
  }
  return { err, done: !err };
}
