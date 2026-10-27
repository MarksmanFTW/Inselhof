/**
 * Gemeinsame Inseln über island.php auf der eigenen Website.
 *
 * Der Server führt ein Protokoll aller Aktionen (fällen, säen, bauen …) in fester
 * Reihenfolge. Jedes Gerät spielt sofort selbst weiter und schickt seine Aktionen
 * mit; beim Abgleich wird die Insel aus dem letzten bestätigten Stand plus allen
 * Aktionen der Reihe nach neu berechnet, danach kommen die eigenen, noch
 * unbestätigten Aktionen obendrauf. So landen alle beim selben Ergebnis – egal ob
 * gleichzeitig, nacheinander oder offline gespielt wurde.
 *
 * Zusätzlich meldet jeder, wo er gerade ist („Anwesenheit“): Wer gleichzeitig auf
 * der Insel ist, sieht den anderen; wer geht, verschwindet nach wenigen Sekunden.
 */
import type { Look } from './character';
import { Farm } from './farm';
import type { Island } from './island';
import type { IslandState } from './net/types';
import { applyOp, link, type Op } from './ops';
import { rainSince } from './time';
import { World } from './world';

/** eigene Aktion mit Kennung (wird nach dem Abgleich wiedererkannt) */
export interface PendingOp extends Op {
  id: string;
}
/** Aktion im Protokoll des Servers */
export interface LoggedOp {
  r: number;
  id: string;
  by: string;
  op: Op;
}

/** wo und wie die Figur gerade ist */
export interface Presence {
  /** Name, Aussehen */
  n: string;
  l: Look;
  x: number;
  y: number;
  /** Blickrichtung (0 runter, 1 hoch, 2 rechts, 3 links) */
  d: number;
  /** läuft gerade */
  m: number;
  /** Zeitpunkt des letzten Werkzeug-Schwungs und welches Werkzeug */
  sw: number;
  tl: string;
  /** reitet Pferd Nummer … (−1 nein), im Haus Nummer … (−1 draußen) */
  rh: number;
  in: number;
  /** Lauftempo (Reiten schneller) */
  sp: number;
}
export interface Other extends Presence {
  pid: string;
  /** so lange her ist die letzte Meldung (ms) */
  age: number;
}

export interface SyncReq {
  pid: string;
  /** Protokoll ab hier schicken (0 = alles samt Stand) */
  since: number;
  ops: PendingOp[];
  /** null = bin nicht (mehr) auf der Insel */
  me: Presence | null;
  /** Insel wird zum ersten Mal geteilt: so sieht sie aus */
  init?: IslandState;
  /** Protokoll kürzen: das ist der Stand bei rev */
  snap?: { rev: number; state: IslandState };
}
export interface SyncRes {
  rev: number;
  /** Stand-Nummer des gespeicherten Gesamtstands */
  srev: number;
  /** Gesamtstand (nur wenn since < srev); null = Insel noch nicht in der Cloud */
  state?: IslandState | null;
  ops: LoggedOp[];
  /** diese eigenen Aktionen hat der Server (neu oder schon vorher) */
  ack: string[];
  others: Other[];
  /** Protokoll wird lang: bitte einen Gesamtstand schicken */
  compact?: boolean;
}

export interface CloudApi {
  sync(id: string, req: SyncReq): Promise<SyncRes | null>;
  /** Insel verlassen (beim Schließen der Seite) */
  leave(id: string, pid: string): void;
}

/** island.php liegt neben dem Spiel; zum Testen: ?cloud=http://localhost:8088/island.php */
export function httpApi(): CloudApi {
  const custom = new URLSearchParams(location.search).get('cloud');
  const base = custom && custom.startsWith('http') ? custom : new URL('island.php', location.href).href;
  return {
    async sync(id, req) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 9000);
        // text/plain: keine Vorab-Anfrage (CORS) nötig
        const r = await fetch(`${base}?id=${id}&do=sync`, { method: 'POST', cache: 'no-store', signal: ctrl.signal, body: JSON.stringify(req), headers: { 'Content-Type': 'text/plain' } });
        clearTimeout(timer);
        if (!r.ok) return null;
        const res = (await r.json()) as SyncRes;
        return typeof res?.rev === 'number' && Array.isArray(res.ops) ? res : null;
      } catch {
        return null; // offline → später nochmal
      }
    },
    leave(id, pid) {
      const url = `${base}?id=${id}&do=leave&pid=${pid}`;
      try {
        if (navigator.sendBeacon?.(url)) return;
      } catch {
        /* dann eben normal */
      }
      void fetch(url, { method: 'POST', keepalive: true }).catch(() => {});
    },
  };
}

/** Stand einer gemeinsamen Insel auf diesem Gerät */
export interface Shared {
  /** letzter bestätigter Stand vom Server (null = noch keiner) */
  base: IslandState | null;
  rev: number;
  /** eigene Aktionen, die der Server noch nicht bestätigt hat */
  pending: PendingOp[];
}

/** höchstens so viele Aktionen auf einmal schicken */
const BATCH = 60;

export function request(sh: Shared, pid: string, me: Presence | null, o: { init?: IslandState; compact?: boolean } = {}): SyncReq {
  const req: SyncReq = { pid, since: sh.base ? sh.rev : 0, ops: sh.pending.slice(0, BATCH), me };
  if (!sh.base && o.init) req.init = o.init;
  if (o.compact && sh.base && sh.rev > 0) req.snap = { rev: sh.rev, state: sh.base };
  return req;
}

/** Zeit bis zur Aktion nachholen (Wachsen, Regen, Nachwachsen) – auf jedem Gerät gleich */
function catchUp(w: World, f: Farm, t: number) {
  w.grow(t);
  f.update(t, rainSince(w.clock, t));
}
function replay(isl: Island, from: IslandState, ops: Op[], now?: number) {
  const w = new World(isl, from.world);
  const f = new Farm(isl, from.farm);
  link(w, f);
  for (const op of ops) {
    catchUp(w, f, op.t);
    applyOp(w, f, op);
  }
  if (now !== undefined) catchUp(w, f, now);
  return { world: w.toSave(), farm: f.toSave() };
}

export interface Absorbed {
  shared: Shared;
  /** neuer Stand für die Insel auf dem Bildschirm (fehlt = nichts geändert) */
  current?: IslandState;
  /** neue Aktionen der anderen (für Effekte) */
  remote: LoggedOp[];
  /** Insel ist noch nicht in der Cloud */
  empty: boolean;
  /**
   * Der Server kennt die Insel nicht mehr (Daten dort gelöscht), dieses Gerät aber schon:
   * Stand zurückgesetzt – beim nächsten Abgleich schickt das Gerät seine Insel neu hinauf,
   * dann finden alle Freunde sie wieder.
   */
  lost?: boolean;
}

/** Antwort des Servers einarbeiten (now: bis jetzt wachsen lassen) */
export function absorb(isl: Island, sh: Shared, res: SyncRes, pid: string, now = Date.now()): Absorbed {
  let base = sh.base;
  let rev = sh.rev;
  let changed = false;
  if (res.state) {
    // Gesamtstand (erstes Mal oder Protokoll wurde gekürzt)
    if (!base || res.srev > rev || res.srev < rev) {
      base = res.state;
      rev = res.srev;
      changed = true;
    }
  } else if (res.state === null && !base) return { shared: sh, remote: [], empty: true };
  // Server leer, obwohl wir schon geteilt hatten: neu anlegen lassen (eigene Aktionen
  // stecken schon im Stand auf dem Gerät, der hinaufgeschickt wird)
  else if (res.state === null && base) return { shared: { base: null, rev: 0, pending: [] }, remote: [], empty: false, lost: true };
  // Server wurde neu angelegt (Nummer kleiner als unsere): ganzen Stand neu holen, eigene
  // noch nicht bestätigte Aktionen bleiben und kommen danach dazu
  else if (!res.state && base && res.rev < rev) return { shared: { base: null, rev: 0, pending: sh.pending }, remote: [], empty: false, lost: true };
  const fresh = res.ops.filter((o) => o.r > rev).sort((a, b) => a.r - b.r);
  if (base && fresh.length) {
    base = replay(isl, base, fresh.map((o) => o.op));
    rev = fresh[fresh.length - 1].r;
    changed = true;
  }
  const acked = new Set(res.ack);
  const pending = sh.pending.filter((p) => !acked.has(p.id));
  const shared: Shared = { base, rev, pending };
  const remote = fresh.filter((o) => o.by !== pid);
  if (!changed || !base) return { shared, remote, empty: false };
  return { shared, current: replay(isl, base, pending, now), remote, empty: false };
}

/** eindeutige Kennung für dieses Gerät */
export function newPid() {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
let seq = 0;
/** Kennung für eine eigene Aktion */
export const opId = (pid: string) => `${pid}.${Date.now().toString(36)}.${(seq++).toString(36)}`;
