/** Spielstand im Browser: Aussehen, Name und wo die Figur zuletzt stand */
import { DEFAULT_LOOK, PARTS, type Look } from './character';

export interface Save {
  look: Look;
  name: string;
  /** schon einmal angepasst (sonst zeigt „Spielen“ zuerst das Aussehen) */
  created: boolean;
  pos?: { x: number; y: number };
}

const KEY = 'cozyisland.save';

export function loadSave(): Save {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Save> | null;
    if (raw && typeof raw === 'object') {
      const look = { ...DEFAULT_LOOK, ...raw.look };
      // Werte außerhalb der Auswahl (ältere Versionen) zurücksetzen
      for (const p of PARTS) if (!(look[p.key] >= 0 && look[p.key] < p.count)) look[p.key] = DEFAULT_LOOK[p.key];
      return { look, name: String(raw.name ?? '').slice(0, 12), created: !!raw.created, pos: raw.pos };
    }
  } catch {
    /* kaputt oder gesperrt → neu */
  }
  return { look: { ...DEFAULT_LOOK }, name: '', created: false };
}

export function writeSave(s: Save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* privater Modus: dann eben nur für diese Sitzung */
  }
}
