/**
 * Gemeinsame Inseln in der „Cloud“ (island.php auf der eigenen Website).
 * Jeder Spieler merkt sich seine Aktionen seit dem letzten Abgleich. Beim Abgleich
 * werden sie auf den neuesten Stand vom Server angewendet und zurückgeschrieben –
 * so geht nichts verloren, auch wenn beide gleichzeitig allein gespielt haben.
 */
import { Farm } from './farm';
import type { Island } from './island';
import type { IslandState } from './net/room';
import { applyOp, link, type Op } from './ops';
import { World } from './world';

export interface CloudIsland {
  rev: number;
  updatedAt: number;
  state: IslandState | null;
}
export interface CloudApi {
  get(id: string): Promise<CloudIsland | null>;
  post(id: string, baseRev: number, state: IslandState): Promise<({ ok: boolean } & CloudIsland) | null>;
}

/** island.php liegt neben dem Spiel; zum Testen: ?cloud=http://localhost:8088/island.php */
export function httpApi(): CloudApi {
  const custom = new URLSearchParams(location.search).get('cloud');
  const base = custom && custom.startsWith('http') ? custom : new URL('island.php', location.href).href;
  const call = async (id: string, init?: RequestInit) => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(`${base}?id=${id}`, { cache: 'no-store', signal: ctrl.signal, ...init });
      clearTimeout(timer);
      return r.ok ? await r.json() : null;
    } catch {
      return null; // offline → später nochmal
    }
  };
  return {
    get: (id) => call(id),
    post: (id, baseRev, state) => call(id, { method: 'POST', body: JSON.stringify({ baseRev, state }), headers: { 'Content-Type': 'text/plain' } }),
  };
}

export interface SyncResult {
  /** neuer Stand zum Übernehmen (fehlt, wenn der eigene schon stimmt) */
  state?: IslandState;
  rev: number;
  /** so viele der gemerkten Aktionen sind jetzt in der Cloud */
  consumed: number;
}

/**
 * Ein Abgleich. local.rev = Stand, auf dem die eigene Insel beruht;
 * current() = eigener Stand jetzt (enthält die gemerkten Aktionen schon).
 */
export async function syncIsland(
  api: CloudApi,
  id: string,
  isl: Island,
  local: { rev: number; pending: Op[] },
  current: () => IslandState,
): Promise<SyncResult | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const srv = await api.get(id);
    if (!srv) return null;
    const n = local.pending.length;
    if (!n && srv.rev !== 0) {
      // nichts Eigenes zu melden: höchstens den neueren Stand übernehmen
      return srv.rev > local.rev && srv.state ? { state: srv.state, rev: srv.rev, consumed: 0 } : { rev: Math.max(local.rev, srv.rev), consumed: 0 };
    }
    let state: IslandState;
    let rebased = false;
    if (srv.rev === local.rev || !srv.state) state = current();
    else {
      // jemand war inzwischen weiter: eigene Aktionen auf seinen Stand anwenden
      const w = new World(isl, srv.state.world);
      const f = new Farm(isl, srv.state.farm);
      link(w, f);
      for (const op of local.pending.slice(0, n)) applyOp(w, f, op);
      state = { world: w.toSave(), farm: f.toSave() };
      rebased = true;
    }
    const res = await api.post(id, srv.rev, state);
    if (!res) return null;
    if (res.ok) return { state: rebased ? state : undefined, rev: res.rev, consumed: n };
    // jemand hat genau jetzt gespeichert → nochmal
  }
  return null;
}
