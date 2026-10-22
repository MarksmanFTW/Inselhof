/**
 * Spielstände im Browser. Die Figur (Aussehen, Name) gilt für alle Inseln;
 * jede Insel ist ein eigener Spielstand mit Holz, Feldern, Häusern und Position.
 * Gemeinsame Inseln (Koop) haben bei beiden Spielern dieselbe id und werden über
 * island.php abgeglichen (siehe cloud.ts) – auch wenn jeder allein weiterspielt.
 */
import { DEFAULT_LOOK, PARTS, type Look } from './character';
import type { FarmSave } from './farm';
import type { Op } from './ops';
import type { WorldSave } from './world';

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
  /** gemeinsame Insel: Stand in der Cloud, auf dem diese Kopie beruht */
  rev?: number;
  /** Aktionen seit dem letzten Abgleich */
  pending?: Op[];
  /** über einen Insel-Link dazugekommen: erst den Stand aus der Cloud holen, nie leer hochladen */
  pull?: boolean;
  /** Lieblingspferd (nur auf diesem Handy) */
  fav?: number;
}

export interface Save {
  look: Look;
  name: string;
  /** schon einmal angepasst (sonst zeigt „Spielen“ zuerst das Aussehen) */
  created: boolean;
  slots: Slot[];
  active: string;
  /** Energie der Figur (0..100) */
  energy?: number;
}

const KEY = 'cozyisland.save';
export const MAX_SLOTS = 5;

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function makeSlot(title: string, now = Date.now()): Slot {
  return { id: newId(), title, createdAt: now, updatedAt: now };
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
      out = { look, name: String(raw.name ?? '').slice(0, 12), created: !!raw.created, slots: [], active: String(raw.active ?? ''), energy: typeof raw.energy === 'number' ? raw.energy : 100 };
      if (Array.isArray(raw.slots)) {
        out.slots = raw.slots
          .filter((x) => x && typeof x.id === 'string')
          .slice(0, 20)
          .map((x) => ({ ...x, title: String(x.title ?? 'Insel').slice(0, 20), createdAt: Number(x.createdAt) || 0, updatedAt: Number(x.updatedAt) || 0 }));
      } else if (raw.world || raw.farm || raw.pos) {
        // alter Spielstand (vor den Inseln) wird zu „Meine Insel“
        const slot = makeSlot('Meine Insel');
        Object.assign(slot, { pos: raw.pos, world: raw.world, farm: raw.farm });
        out.slots = [slot];
        out.active = slot.id;
      }
    }
  } catch {
    /* kaputt oder gesperrt → neu */
  }
  activeSlot(out);
  return out;
}

export function writeSave(s: Save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* privater Modus: dann eben nur für diese Sitzung */
  }
}
