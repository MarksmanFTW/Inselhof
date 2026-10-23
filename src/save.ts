/**
 * Spielstände im Browser. Die Figur (Aussehen, Name) gilt für alle Inseln;
 * jede Insel ist ein eigener Spielstand mit Holz, Feldern, Häusern und Position.
 * Gemeinsame Inseln (Koop) haben bei beiden Spielern dieselbe id und werden über
 * island.php abgeglichen (Aktions-Protokoll, siehe cloud.ts) – allein, nacheinander oder gleichzeitig.
 */
import { DEFAULT_LOOK, PARTS, type Look } from './character';
import type { FarmSave } from './farm';
import type { IslandState } from './net/types';
import type { Op } from './ops';
import type { WorldSave } from './world';
import { cleanBag, fullBag, newBag, TUTORIAL, type Bag } from './craft';

export interface Slot {
  id: string;
  title: string;
  /** gemeinsame Insel: mit wem */
  shared?: { with: string };
  createdAt: number;
  updatedAt: number;
  pos?: { x: number; y: number };
  world?: Partial<WorldSave>;
  farm?: Partial<FarmSave>;
  /** gemeinsame Insel: letzter bestätigter Stand aus der Cloud und seine Nummer */
  base?: IslandState;
  rev?: number;
  /** eigene Aktionen, die der Server noch nicht bestätigt hat (mit Kennung; ältere ohne) */
  pending?: (Op & { id?: string })[];
  /** über einen Insel-Link dazugekommen: erst den Stand aus der Cloud holen, nie leer hochladen */
  pull?: boolean;
  /** Lieblingspferd (nur auf diesem Handy) */
  fav?: number;
  /** Energie der Figur auf dieser Insel (0..100, fehlt = ausgeruht) */
  energy?: number;
  /** Begrüßung (Tutorial) schon gesehen */
  intro?: boolean;
  /** eigener Rucksack auf dieser Insel: Stöcke, Steine, Werkzeuge, Tutorial */
  bag?: Bag;
}

export interface Save {
  look: Look;
  name: string;
  /** schon einmal angepasst (sonst zeigt „Spielen“ zuerst das Aussehen) */
  created: boolean;
  slots: Slot[];
  active: string;
}

const KEY = 'cozyisland.save';
export const MAX_SLOTS = 5;

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function makeSlot(title: string, now = Date.now()): Slot {
  return { id: newId(), title, createdAt: now, updatedAt: now, bag: newBag() };
}

/** neue Insel mit freiem Namen („Insel 2“, …) */
export function addSlot(s: Save): Slot | null {
  if (s.slots.length >= MAX_SLOTS) return null;
  let n = s.slots.length + 1;
  while (s.slots.some((x) => x.title === `Insel ${n}`)) n++;
  const slot = makeSlot(s.slots.length ? `Insel ${n}` : 'Meine Insel');
  s.slots.push(slot);
  return slot;
}

export function activeSlot(s: Save): Slot {
  let slot = s.slots.find((x) => x.id === s.active);
  if (!slot) {
    slot = s.slots[0] ?? addSlot(s)!;
    s.active = slot.id;
  }
  return slot;
}

export function removeSlot(s: Save, id: string) {
  s.slots = s.slots.filter((x) => x.id !== id);
  if (s.active === id) s.active = s.slots[0]?.id ?? '';
}

export function loadSave(): Save {
  let out: Save = { look: { ...DEFAULT_LOOK }, name: '', created: false, slots: [], active: '' };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as
      | (Partial<Save> & { pos?: Slot['pos']; world?: Slot['world']; farm?: Slot['farm'] })
      | null;
    if (raw && typeof raw === 'object') {
      const look = { ...DEFAULT_LOOK, ...raw.look };
      // Werte außerhalb der Auswahl (ältere Versionen) zurücksetzen
      for (const p of PARTS) if (!(look[p.key] >= 0 && look[p.key] < p.count)) look[p.key] = DEFAULT_LOOK[p.key];
      out = { look, name: String(raw.name ?? '').slice(0, 12), created: !!raw.created, slots: [], active: String(raw.active ?? '') };
      if (Array.isArray(raw.slots)) {
        out.slots = raw.slots
          .filter((x) => x && typeof x.id === 'string')
          .slice(0, 20)
          .map((x) => ({ ...x, title: String(x.title ?? 'Insel').slice(0, 20), createdAt: Number(x.createdAt) || 0, updatedAt: Number(x.updatedAt) || 0, energy: typeof x.energy === 'number' ? x.energy : undefined }));
      } else if (raw.world || raw.farm || raw.pos) {
        // alter Spielstand (vor den Inseln) wird zu „Meine Insel“
        const slot = makeSlot('Meine Insel');
        Object.assign(slot, { pos: raw.pos, world: raw.world, farm: raw.farm, bag: undefined });
        out.slots = [slot];
        out.active = slot.id;
      }
      // ältere Versionen: Energie galt für alle Inseln → gehört jetzt zur zuletzt gespielten
      const old = (raw as { energy?: unknown }).energy;
      const act = out.slots.find((x) => x.id === out.active) ?? out.slots[0];
      if (typeof old === 'number' && act && act.energy === undefined) act.energy = old;
    }
    // jeder Spielstand bekommt seinen Rucksack (ältere Stände: umziehen)
    for (const sl of out.slots) sl.bag = bagOf(sl);
  } catch {
    /* kaputt oder gesperrt → neu */
  }
  activeSlot(out);
  return out;
}

/**
 * Rucksack eines Spielstands. Ältere Stände: wer vor dem Tutorial schon gespielt hat,
 * hat alle Werkzeuge; kurz lag der Rucksack in der Insel selbst (world.tools) → hierher.
 */
export function bagOf(sl: Partial<Slot>): Bag {
  if (sl.bag) return cleanBag(sl.bag);
  const w = sl.world;
  if (!w || typeof w.wood !== 'number') return newBag();
  if (!Array.isArray(w.tools)) return w.prog?.v === undefined ? fullBag() : newBag();
  const b = cleanBag({ sticks: w.sticks, stones: w.stones, tools: w.tools });
  const st = w.prog?.stats as Record<string, number> | undefined;
  b.got = { sticks: st?.sticks ?? b.sticks, stones: st?.stones ?? b.stones };
  b.tut = Math.min(TUTORIAL.length, w.prog?.quests ?? 0);
  // in v2 gab es die Samen mit dem dritten Schritt
  if (b.tut >= TUTORIAL.length) b.paid = true;
  return b;
}

export function writeSave(s: Save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* privater Modus: dann eben nur für diese Sitzung */
  }
}
