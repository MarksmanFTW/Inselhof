import { describe, expect, it } from 'vitest';
import { type CloudApi, type CloudIsland, syncIsland } from '../src/cloud';
import { Farm } from '../src/farm';
import { generate } from '../src/island';
import type { IslandState } from '../src/net/room';
import { applyOp, link, type Op } from '../src/ops';
import { World } from '../src/world';

/** Server im Speicher, verhält sich wie island.php */
function fakeServer() {
  let cur: CloudIsland = { rev: 0, updatedAt: 0, state: null };
  const api: CloudApi = {
    get: async () => JSON.parse(JSON.stringify(cur)),
    post: async (_id, baseRev, state) => {
      if (baseRev !== cur.rev) return { ok: false, ...JSON.parse(JSON.stringify(cur)) };
      cur = { rev: cur.rev + 1, updatedAt: Date.now(), state: JSON.parse(JSON.stringify(state)) };
      return { ok: true, rev: cur.rev, updatedAt: cur.updatedAt, state: null };
    },
  };
  return { api, get: () => cur };
}

const isl = generate();
const trees = isl.decor.map((d, i) => [d.kind, i] as const).filter(([k]) => k === 'tree').map(([, i]) => i);

/** ein Spieler mit eigener Kopie der Insel */
function client() {
  const c = { world: new World(isl), farm: new Farm(isl), rev: 0, pending: [] as Op[] };
  link(c.world, c.farm);
  const act = (op: Op) => {
    const res = applyOp(c.world, c.farm, op);
    if (op.a.kind === 'axe') {
      if (res.felled) c.pending.push({ ...op, a: { ...op.a, fell: true } });
    } else if (res.done) c.pending.push(op);
  };
  const state = (): IslandState => ({ world: c.world.toSave(), farm: c.farm.toSave() });
  const sync = async (api: CloudApi) => {
    const res = await syncIsland(api, 'test', isl, { rev: c.rev, pending: c.pending }, state);
    if (!res) return;
    c.rev = res.rev;
    const rest = c.pending.slice(res.consumed);
    c.pending = rest;
    if (res.state) {
      c.world.apply(res.state.world);
      c.farm.apply(res.state.farm);
      for (const op of rest) applyOp(c.world, c.farm, op);
    }
  };
  return { ...c, get: () => c, act, sync };
}

const chop = (tree: number, t: number): Op[] => Array.from({ length: 5 }, (_, k) => ({ a: { kind: 'axe', tree }, x: 0, y: 0, t: t + k }));

describe('Gemeinsame Insel in der Cloud', () => {
  it('beide spielen gleichzeitig allein – beim Abgleich zählt alles', async () => {
    const srv = fakeServer();
    const a = client();
    const b = client();
    await a.sync(srv.api); // Insel anlegen
    await b.sync(srv.api);
    // gleichzeitig: A fällt Baum 1, B fällt Baum 2 und hackt ein Feld
    for (const op of chop(trees[0], 1000)) a.act(op);
    for (const op of chop(trees[1], 2000)) b.act(op);
    b.act({ a: { kind: 'hoe', c: 22, r: 21 }, x: 100, y: 100, t: 3000 });
    await a.sync(srv.api);
    await b.sync(srv.api); // B muss auf A's Stand aufbauen
    await a.sync(srv.api); // A holt B's Stand
    for (const c of [a.get(), b.get()]) {
      expect(c.world.wood).toBe(8);
      expect(c.world.felled.has(trees[0]) && c.world.felled.has(trees[1])).toBe(true);
      expect(c.farm.plots.size).toBe(1);
      expect(c.pending).toHaveLength(0);
    }
    expect(srv.get().rev).toBe(3);
  });

  it('offline: Aktionen bleiben gemerkt', async () => {
    const off: CloudApi = { get: async () => null, post: async () => null };
    const a = client();
    for (const op of chop(trees[2], 5000)) a.act(op);
    await a.sync(off);
    expect(a.get().pending).toHaveLength(1); // nur das Umfallen zählt
    const srv = fakeServer();
    await a.sync(srv.api);
    expect(a.get().pending).toHaveLength(0);
    expect(srv.get().state!.world.wood).toBe(4);
  });
});
