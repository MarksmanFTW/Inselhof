import { describe, expect, it } from 'vitest';
import { absorb, opId, request, type CloudApi, type LoggedOp, type Other, type Presence, type Shared, type SyncReq, type SyncRes } from '../src/cloud';
import { DEFAULT_LOOK } from '../src/character';
import { Farm, GROW_MS, RIPE, START_TURNIPS } from '../src/farm';
import { generate } from '../src/island';
import type { IslandState } from '../src/net/types';
import { applyOp, link, type Op } from '../src/ops';
import { World } from '../src/world';
import { ALL_TOOLS } from '../src/craft';

/** Server im Speicher – macht dasselbe wie island.php (do=sync) */
function fakeServer(compactAt = 150) {
  const cur = { rev: 0, srev: 0, state: null as IslandState | null, ops: [] as LoggedOp[], seen: new Set<string>() };
  const here = new Map<string, Presence & { t: number }>();
  let online = true;
  let clock = 0;
  const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
  const api: CloudApi = {
    sync: async (_id, req: SyncReq): Promise<SyncRes | null> => {
      if (!online) return null;
      clock += 100;
      req = clone(req);
      if (!cur.state && req.init) {
        cur.state = req.init;
        cur.rev = cur.srev = 1;
      }
      const ack: string[] = [];
      if (cur.state)
        for (const { id, ...op } of req.ops) {
          ack.push(id);
          if (cur.seen.has(id)) continue;
          cur.ops.push({ r: ++cur.rev, id, by: req.pid, op });
          cur.seen.add(id);
        }
      if (req.snap && req.snap.rev > cur.srev && req.snap.rev <= cur.rev) {
        cur.state = req.snap.state;
        cur.srev = req.snap.rev;
        cur.ops = cur.ops.filter((o) => o.r > req.snap!.rev);
      }
      let since = req.since;
      const out: SyncRes = { rev: cur.rev, srev: cur.srev, ops: [], ack, others: [] };
      if (!cur.state) out.state = null;
      else if (since < cur.srev) {
        out.state = clone(cur.state);
        since = cur.srev;
      }
      out.ops = clone(cur.ops.filter((o) => o.r > since));
      if (cur.ops.length > compactAt) out.compact = true;
      if (req.me) here.set(req.pid, { ...req.me, t: clock });
      else here.delete(req.pid);
      out.others = [...here].filter(([k, p]) => k !== req.pid && clock - p.t < 8000).map(([pid, p]) => ({ ...p, pid, age: clock - p.t }) as Other);
      return out;
    },
    leave: (_id, pid) => void here.delete(pid),
  };
  return { api, cur, setOnline: (v: boolean) => (online = v), tick: (ms: number) => (clock += ms) };
}

const isl = generate();
const trees = isl.decor.map((d, i) => [d.kind, i] as const).filter(([k]) => k === 'tree').map(([, i]) => i);
const me = (x = 100): Presence => ({ n: 'A', l: DEFAULT_LOOK, x, y: 100, d: 0, m: 0, sw: 0, tl: '', rh: -1, in: -1, sp: 1 });

/** ein Spieler mit eigener Insel auf seinem Gerät */
function client(pid: string, owner = false, fresh = false) {
  const world = new World(isl);
  const farm = new Farm(isl);
  link(world, farm);
  // Tutorial schon geschafft
  if (!fresh) {
    world.tools = new Set(ALL_TOOLS);
    farm.seeds = 6;
  }
  let sh: Shared = { base: null, rev: 0, pending: [] };
  let compact = false;
  let others: Other[] = [];
  const act = (op: Op) => {
    const res = applyOp(world, farm, op);
    if (op.a.kind === 'axe') {
      if (res.felled) sh.pending.push({ ...op, a: { ...op.a, fell: true }, id: opId(pid) });
    } else if (res.done) sh.pending.push({ ...op, id: opId(pid) });
    return res;
  };
  const state = (): IslandState => ({ world: world.toSave(), farm: farm.toSave() });
  const sync = async (api: CloudApi, here: Presence | null = null, now = 0) => {
    const res = await api.sync('test', request(sh, pid, here, { init: owner ? state() : undefined, compact }));
    if (!res) return false;
    const got = absorb(isl, sh, res, pid, now);
    sh = got.shared;
    compact = !!res.compact;
    others = res.others;
    if (got.current) {
      world.apply(got.current.world);
      farm.apply(got.current.farm);
    }
    return true;
  };
  return { world, farm, act, sync, get sh() { return sh; }, get others() { return others; } };
}

const chop = (tree: number, t: number): Op[] => Array.from({ length: 5 }, (_, k) => ({ a: { kind: 'axe', tree }, x: 0, y: 0, t: t + k }));
const sameIsland = (a: { world: World; farm: Farm }, b: { world: World; farm: Farm }) => {
  expect(a.world.toSave()).toEqual(b.world.toSave());
  expect(a.farm.toSave()).toEqual(b.farm.toSave());
};

describe('Gemeinsame Insel: Protokoll auf dem Server', () => {
  it('beide spielen gleichzeitig – beide sehen alles, nichts geht verloren', async () => {
    const srv = fakeServer();
    const a = client('pa', true);
    const b = client('pb');
    await a.sync(srv.api); // Marcel teilt seine Insel
    await b.sync(srv.api); // Freundin holt sie
    for (const op of chop(trees[0], 1000)) a.act(op);
    for (const op of chop(trees[1], 2000)) b.act(op);
    b.act({ a: { kind: 'hoe', c: 22, r: 21 }, x: 100, y: 100, t: 3000 });
    await a.sync(srv.api);
    await b.sync(srv.api);
    await a.sync(srv.api);
    for (const c of [a, b]) {
      expect(c.world.wood).toBe(8);
      expect(c.world.felled.has(trees[0]) && c.world.felled.has(trees[1])).toBe(true);
      expect(c.farm.plots.size).toBe(1);
      expect(c.sh.pending).toHaveLength(0);
    }
    sameIsland(a, b);
  });

  it('wer zuerst erntet, bekommt die Rübe – beide sind sich einig', async () => {
    const srv = fakeServer();
    const a = client('pa', true);
    const b = client('pb');
    a.act({ a: { kind: 'hoe', c: 22, r: 21 }, x: 100, y: 100, t: 1000 });
    a.act({ a: { kind: 'seeds', c: 22, r: 21 }, x: 100, y: 100, t: 1001 });
    await a.sync(srv.api);
    await b.sync(srv.api);
    // drei Mal gießen und wachsen lassen
    let t = 2000;
    for (let k = 0; k < RIPE; k++) {
      a.act({ a: { kind: 'water', c: 22, r: 21 }, x: 100, y: 100, t });
      t += GROW_MS + 10;
      a.farm.update(t);
    }
    await a.sync(srv.api, null, t);
    await b.sync(srv.api, null, t);
    expect(a.farm.plot(22, 21)?.crop?.stage).toBe(RIPE);
    expect(b.farm.plot(22, 21)?.crop?.stage).toBe(RIPE);
    // beide ernten gleichzeitig dieselbe Rübe
    a.act({ a: { kind: 'harvest', c: 22, r: 21 }, x: 100, y: 100, t: t + 5 });
    b.act({ a: { kind: 'harvest', c: 22, r: 21 }, x: 100, y: 100, t: t + 6 });
    await a.sync(srv.api, null, t + 10);
    await b.sync(srv.api, null, t + 10);
    await a.sync(srv.api, null, t + 10);
    expect(a.farm.turnips).toBe(START_TURNIPS + 1);
    expect(b.farm.turnips).toBe(START_TURNIPS + 1);
    sameIsland(a, b);
  });

  it('nacheinander spielen: die Freundin macht weiter, Marcel sieht es später', async () => {
    const srv = fakeServer();
    const a = client('pa', true);
    for (const op of chop(trees[2], 500)) a.act(op);
    await a.sync(srv.api);
    // Marcel ist weg, die Freundin kommt über den Insel-Link
    const b = client('pb');
    await b.sync(srv.api);
    expect(b.world.felled.has(trees[2])).toBe(true);
    // freien Platz fürs Lagerfeuer suchen
    let spot = [0, 0];
    for (let x = 100; x < 300 && !spot[0]; x += 6) for (let y = 100; y < 250; y += 6) if (b.world.canPlace(x, y, undefined, 'fire')) spot = [x, y];
    expect(b.act({ a: { kind: 'build', x: spot[0], y: spot[1], what: 'fire' }, x: spot[0], y: spot[1] + 20, t: 9000 }).done).toBe(true);
    await b.sync(srv.api);
    // Marcel kommt wieder
    await a.sync(srv.api);
    expect(a.world.fires).toHaveLength(1);
    sameIsland(a, b);
  });

  it('offline: Aktionen bleiben gemerkt und kommen später dazu', async () => {
    const srv = fakeServer();
    const a = client('pa', true);
    const b = client('pb');
    await a.sync(srv.api);
    await b.sync(srv.api);
    srv.setOnline(false);
    for (const op of chop(trees[3], 5000)) b.act(op);
    expect(await b.sync(srv.api)).toBe(false);
    expect(b.sh.pending).toHaveLength(1);
    srv.setOnline(true);
    await b.sync(srv.api);
    await a.sync(srv.api);
    expect(a.world.felled.has(trees[3])).toBe(true);
    expect(b.sh.pending).toHaveLength(0);
    sameIsland(a, b);
  });

  it('doppelt geschickt (Antwort ging verloren) zählt nur einmal', async () => {
    const srv = fakeServer();
    const a = client('pa', true);
    await a.sync(srv.api);
    for (const op of chop(trees[4], 7000)) a.act(op);
    const lost = request(a.sh, 'pa', null);
    await srv.api.sync('test', lost); // kommt an, Antwort verloren
    await a.sync(srv.api); // schickt dieselbe Aktion nochmal
    expect(srv.cur.ops).toHaveLength(1);
    expect(a.world.wood).toBe(4);
  });

  it('langes Protokoll wird gekürzt – wer neu dazukommt, bekommt trotzdem alles', async () => {
    const srv = fakeServer(5);
    const a = client('pa', true);
    await a.sync(srv.api);
    for (let k = 0; k < 8; k++) {
      a.act({ a: { kind: 'hoe', c: 15 + k, r: 21 }, x: 100, y: 100, t: 1000 + k });
      await a.sync(srv.api);
    }
    await a.sync(srv.api); // schickt den Gesamtstand
    expect(srv.cur.srev).toBeGreaterThan(1);
    expect(srv.cur.ops.length).toBeLessThan(8);
    const b = client('pb');
    await b.sync(srv.api);
    expect(b.farm.plots.size).toBe(a.farm.plots.size);
    sameIsland(a, b);
  });

  it('wer gleichzeitig da ist, sieht den anderen – wer geht, verschwindet', async () => {
    const srv = fakeServer();
    const a = client('pa', true);
    const b = client('pb');
    await a.sync(srv.api, me(120));
    await b.sync(srv.api, me(200));
    expect(b.others.map((o) => [o.pid, o.x])).toEqual([['pa', 120]]);
    await a.sync(srv.api, me(130));
    expect(a.others.map((o) => o.pid)).toEqual(['pb']);
    // A geht zurück ins Menü
    await a.sync(srv.api, null);
    await b.sync(srv.api, me(200));
    expect(b.others).toHaveLength(0);
    // B schließt die App, ohne sich abzumelden: nach ein paar Sekunden weg
    await b.sync(srv.api, me(210));
    srv.tick(9000);
    await a.sync(srv.api, me(130));
    expect(a.others).toHaveLength(0);
  });

  it('Tutorial zu zweit: beide sammeln, der Vorrat und die Werkzeuge gehören der Insel', async () => {
    const srv = fakeServer();
    const a = client('pa', true, true);
    const b = client('pb', false, true);
    await a.sync(srv.api);
    await b.sync(srv.api);
    const of = (kind: string) => isl.pickups.map((p, i) => [p.kind, i] as const).filter(([k]) => k === kind).map(([, i]) => i);
    const [s0, s1, s2, s3] = of('stick');
    const [t0, t1, t2] = of('stone');
    a.act({ a: { kind: 'pick', tree: s0 }, x: 0, y: 0, t: 1000 });
    a.act({ a: { kind: 'pick', tree: s1 }, x: 0, y: 0, t: 1001 });
    b.act({ a: { kind: 'pick', tree: s1 }, x: 0, y: 0, t: 1002 }); // gleichzeitig denselben Stock
    b.act({ a: { kind: 'pick', tree: s2 }, x: 0, y: 0, t: 1003 });
    b.act({ a: { kind: 'pick', tree: s3 }, x: 0, y: 0, t: 1004 });
    for (const i of [t0, t1, t2]) b.act({ a: { kind: 'pick', tree: i }, x: 0, y: 0, t: 1010 });
    await a.sync(srv.api);
    await b.sync(srv.api);
    await a.sync(srv.api);
    for (const c of [a, b]) expect([c.world.sticks, c.world.stones, c.world.prog.quests]).toEqual([4, 3, 2]);
    a.act({ a: { kind: 'craft', item: 'axe' }, x: 0, y: 0, t: 2000 });
    b.act({ a: { kind: 'craft', item: 'hoe' }, x: 0, y: 0, t: 2001 });
    await a.sync(srv.api);
    await b.sync(srv.api);
    await a.sync(srv.api);
    for (const c of [a, b]) {
      expect([...c.world.tools].sort()).toEqual(['axe', 'hoe']);
      expect(c.farm.seeds).toBe(3);
    }
    sameIsland(a, b);
  });

  it('Regen lässt Felder auf jedem Gerät gleich wachsen, egal wie oft gerechnet wird', () => {
    const f1 = new Farm(isl);
    const f2 = new Farm(isl);
    for (const f of [f1, f2]) {
      f.seeds = 1;
      f.till(22, 21, true);
      f.plant(22, 21);
    }
    const rain = 100_000;
    for (let t = rain; t < rain + GROW_MS * 3 + 5000; t += 1000) f1.update(t, rain);
    f2.update(rain + GROW_MS * 3 + 4000, rain);
    expect(f1.toSave()).toEqual(f2.toSave());
    expect(f1.plot(22, 21)?.crop?.stage).toBe(3);
  });
});
