/**
 * Tagesgeschenk: an jedem echten Tag, an dem man spielt, gibt es ein Geschenk aus
 * einem 7-Tage-Kalender, am 7. Tag etwas Besonderes (Deko). Wer einen Tag auslässt,
 * verliert nichts – es geht einfach beim nächsten Feld weiter. Der Stand gehört dem
 * Gerät (Spieler), das Geschenk landet auf der gerade gespielten Insel. Reine Logik.
 */
import { DECO } from './shop';

export interface DailyGift {
  coins?: number;
  seeds?: number;
  wood?: number;
  apples?: number;
  /** Gericht */
  dish?: string;
  /** Deko (wechselt jede Woche) */
  deco?: boolean;
}
export const CALENDAR: DailyGift[] = [{ coins: 15 }, { seeds: 5 }, { wood: 12 }, { coins: 25 }, { dish: 'apfelkuchen' }, { seeds: 8 }, { coins: 40, deco: true }];

export interface DailyState {
  /** zuletzt abgeholt am (JJJJ-MM-TT) */
  last: string;
  /** so viele Geschenke insgesamt */
  total: number;
}
export function cleanDaily(d: Partial<DailyState> | undefined): DailyState {
  return { last: typeof d?.last === 'string' ? d.last : '', total: Math.max(0, Math.floor(d?.total ?? 0)) };
}
/** heute schon abgeholt? */
export const dailyDone = (d: DailyState, today: string) => d.last === today;
/** welches Feld im Kalender heute dran ist (0–6) */
export const dailyIndex = (d: DailyState) => d.total % CALENDAR.length;
/** Deko am 7. Tag: jede Woche eine andere */
export const weeklyDeco = (d: DailyState) => DECO[Math.floor(d.total / CALENDAR.length) % DECO.length].id;
