/**
 * Spiel-Aktionen als reine Logik auf World + Farm. Dieselbe Funktion läuft beim
 * Spielen und beim Abgleich einer gemeinsamen Insel: Aktionen, die jemand allein
 * gemacht hat, werden auf den neuesten Stand aus der Cloud nochmal angewendet.
 */
import { Farm } from './farm';
import { SLOT_COUNT, furnitureById } from './furniture';
import { FOAL_HAY } from './horses';
import { SEED_PACK, SELL, decoById, horseOffers, merchantHere, type SellItem } from './shop';
import { islandDay } from './horses';
import { gain, type Gain, type Stat } from './progress';
import { napOffset, newClock, sleepOffset, sleepyHour, timeOf } from './time';
import { TILE } from './island';
import type { Action } from './net/types';
import { BUILDS, type BuildKind, type World } from './world';
import { TUT_SEEDS, recipeOf, type ToolKind } from './craft';
import { fishById } from './fish';
import { FEST_COINS, PROJECTS, PROJ_ITEMS, islandHas, islandTake, pickSite, type ProjItem } from './projects';
import { cook, isDish, recipeById } from './cooking';
import { deliver, type Order } from './orders';
import type { PickKind } from './island';

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
  /** eingesammeltes Heu */
  hay?: number;
  /** Händler: Münzen bekommen; Album-Belohnungen */
  coins?: number;
  album?: { at: number; coins: number }[];
  /** geschlafen: ganze Nacht oder Nickerchen */
  slept?: 'night' | 'nap';
  done: boolean;
  /** erledigte Aufgaben / neue Stufen durch diese Aktion */
  gain?: Gain;
  /** aufgehoben / gebastelt / geschüttelt */
  picked?: PickKind;
  crafted?: ToolKind;
  fruit?: { apples: number; berries: number };
  /** gefangener Fisch; first = neue Art fürs Album */
  caught?: { id: string; first: boolean };
  /** fürs Projekt abgegeben (so viel wurde genommen); finished = Projekt fertig */
  donated?: { item: ProjItem; n: number };
  finished?: string;
  /** Bestellung geliefert / gekocht */
  delivered?: Order;
  cooked?: string;
}

/** Ackerbau kennt die Fähigkeiten der Insel-Stufe */
export function link(world: World, farm: Farm) {
  farm.perks = () => world.perks;
}

const STAT: Partial<Record<Action['kind'], Stat>> = { hoe: 'tilled', seeds: 'planted', water: 'watered', harvest: 'harvested', adopt: 'adopted', foal: 'adopted', mow: 'mowed', feed: 'cared', brush: 'cared', cook: 'cooked' };
/** Bauen: was zählt wofür (Deko und Koppel zählen nicht) */
const BUILT: Partial<Record<BuildKind, Stat>> = { house: 'built', fire: 'fire', stable: 'stable' };


/** Aktion ausführen und Fortschritt verbuchen */
export function applyOp(world: World, farm: Farm, op: Op): OpResult {
  const res = run(world, farm, op);
  const give = (r: { seeds?: number; wood?: number; coins?: number }) => {
    if (r.seeds) farm.seeds += r.seeds;
    if (r.wood) world.wood += r.wood;
    if (r.coins) world.coins += r.coins;
  };
  const merge = (g: Gain) => {
    res.gain = { quests: [...(res.gain?.quests ?? []), ...g.quests], levels: [...(res.gain?.levels ?? []), ...g.levels] };
  };
  if (res.felled) {
    merge(gain(world.prog, 'felled', 1, give));
    merge(gain(world.prog, 'wood', res.wood ?? 0, give));
  } else if (res.done) {
    const a = op.a;
    if (a.kind === 'pick' && res.picked) merge(gain(world.prog, res.picked === 'stick' ? 'sticks' : 'stones', 1, give));
    else if (a.kind === 'shake' && res.fruit) merge(gain(world.prog, 'fruit', res.fruit.apples + res.fruit.berries, give));
    else if (a.kind === 'donate' && res.finished) merge(gain(world.prog, 'projects', 1, give));
    else if (a.kind === 'order' && res.delivered) merge(gain(world.prog, 'orders', 1, give));
    else if (a.kind === 'fish' && res.caught) {
      merge(gain(world.prog, 'fish', 1, give));
      if (res.caught.first) merge(gain(world.prog, 'species', 1, give));
    }
    else if (a.kind === 'craft' && res.crafted) {
      merge(gain(world.prog, 'crafted', 1, give));
      if (res.crafted === 'water') merge(gain(world.prog, 'bucket', 1, give));
      if (res.crafted === 'scythe') merge(gain(world.prog, 'scythe', 1, give));
      if (res.crafted === 'rod') merge(gain(world.prog, 'rod', 1, give));
    } else if (a.kind === 'rake') merge(gain(world.prog, 'hay', res.hay ?? 0, give));
    else {
      // „gebaut“ zählt nur Häuser; Lagerfeuer und Stall haben eigene Aufgaben
      const stat = a.kind === 'build' ? BUILT[a.what ?? 'house'] : STAT[a.kind];
      if (stat) merge(gain(world.prog, stat, 1, give));
    }
  }
  const album = world.claimAlbum();
  if (album.length) res.album = album;
  if (res.gain && (res.gain.quests.length || res.gain.levels.length)) {
    world.version++;
    farm.version++;
  }
  return res;
}

export function tileFree(world: World, c: number, r: number, actor: { x: number; y: number }) {
  const cx = c * TILE + 4;
  const cy = r * TILE + 4;
  return !world.blocked(cx, cy, 4, 4) && !(Math.abs(actor.x - cx) < 4 && Math.abs(actor.y - cy) < 4);
}

/** Liegt ein Feld unter der Haus-Grundfläche? */
export function farmUnder(farm: Farm, x: number, y: number, kind: BuildKind = 'house') {
  const f = BUILDS[kind].foot;
  const [c0, r0] = Farm.tileAt(x + f.left, y + f.top - (kind === 'house' ? 6 : 0));
  const [c1, r1] = Farm.tileAt(x + f.right, y + f.bottom);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (farm.plot(c, r)) return true;
  return false;
}

function run(world: World, farm: Farm, op: Op): OpResult {
  const { a, t } = op;
  const actor = { x: op.x, y: op.y };
  const c = a.c ?? 0;
  const r = a.r ?? 0;
  let err: string | null = null;
  // Werkzeuge, Stöcke und Steine trägt jeder Spieler selbst (Rucksack im Spielstand);
  // auf der Insel landet nur, was alle betrifft: der Stock ist weg, das Holz ist verbraucht
  if (a.kind === 'pick') {
    const got = world.pick(a.tree ?? -1, t);
    return { err: got ? null : 'Schon aufgehoben', done: !!got, picked: got ?? undefined };
  }
  if (a.kind === 'craft') {
    const r = recipeOf(a.item ?? '');
    if (!r) return { err: 'Gibt es nicht', done: false };
    if (world.wood < r.wood) return { err: 'Zu wenig Holz', done: false };
    world.wood -= r.wood;
    world.version++;
    return { err: null, done: true, crafted: r.id };
  }
  if (a.kind === 'shake') {
    const got = world.shake(a.tree ?? -1, t);
    return { err: got ? null : 'Hier hängt gerade nichts', done: !!got, fruit: got ?? undefined };
  }
  if (a.kind === 'fish') {
    // was gebissen hat, steht in der Aktion (gewürfelt auf dem Gerät, das geangelt hat)
    const first = world.catchFish(a.item ?? '');
    return { err: first === null ? 'Unbekannter Fisch' : null, done: first !== null, caught: first === null ? undefined : { id: a.item!, first } };
  }
  if (a.kind === 'order') {
    const r = deliver(world, farm, Math.floor(a.n ?? -1), t);
    return { err: r.err, done: !r.err, delivered: r.order };
  }
  if (a.kind === 'donate') return donate(world, farm, a.item as ProjItem, Math.max(1, Math.floor(a.n ?? 1)));
  if (a.kind === 'tut') {
    // Tutorial geschafft: Rübensamen für die Insel
    farm.seeds += TUT_SEEDS;
    farm.version++;
    return { err: null, done: true };
  }
  if (a.kind === 'axe') {
    if (!world.isl.decor[a.tree ?? -1]) return { err: null, done: false };
    if (a.fell) {
      const wood = world.fell(a.tree!, t);
      return { err: null, done: wood > 0, felled: wood > 0, wood };
    }
    const res = world.chop(a.tree!, t);
    return { err: null, done: true, felled: res.felled, wood: res.wood };
  }
  if (a.kind === 'hoe') {
    err = farm.till(c, r, tileFree(world, c, r, actor));
    const p = farm.plot(c, r);
    if (!err && p) p.dry = t;
  }
  else if (a.kind === 'seeds') err = farm.plant(c, r);
  else if (a.kind === 'refill') farm.refill();
  else if (a.kind === 'water') err = farm.pour(c, r, t);
  else if (a.kind === 'harvest') {
    // Samen-Zufall aus der Zeit → beim Abgleich auf jedem Gerät gleich
    const res = farm.harvest(c, r, () => ((t * 9301 + 49297) % 233280) / 233280);
    const p = farm.plot(c, r);
    if (res && p) p.dry = t;
    return { err: null, done: !!res, harvest: res ?? undefined };
  } else if (a.kind === 'sell' || a.kind === 'buy') {
    // Verkaufen geht auch am Marktstand (Projekt 2), Kaufen nur beim Boot
    if (!merchantHere(world.clock, t) && !(a.kind === 'sell' && world.projDone(1))) return { err: 'Das Händler-Boot ist gerade nicht da', done: false };
    if (a.kind === 'sell') {
      const item = a.item as SellItem;
      const n = Math.max(1, Math.floor(a.n ?? 1));
      if (item.startsWith('dish:')) {
        // Gerichte: Preis aus dem Rezept
        const r = recipeById(item.slice(5));
        if (!r || !isDish(r.id)) return { err: 'Das kauft der Händler nicht', done: false };
        if ((world.dishes[r.id] ?? 0) < n) return { err: 'So viel hast du nicht', done: false };
        if ((world.dishes[r.id] -= n) <= 0) delete world.dishes[r.id];
        world.coins += r.price * n;
        world.version++;
        return { err: null, done: true, coins: r.price * n };
      }
      if (item.startsWith('fish:')) {
        // Fische: Preis je Art
        const f = fishById(item.slice(5));
        if (!f || !f.price) return { err: 'Das kauft der Händler nicht', done: false };
        if ((world.fish[f.id] ?? 0) < n) return { err: 'So viel hast du nicht', done: false };
        if ((world.fish[f.id] -= n) <= 0) delete world.fish[f.id];
        world.coins += f.price * n;
        world.version++;
        return { err: null, done: true, coins: f.price * n };
      }
      const price = SELL[item];
      if (!price) return { err: 'Das kauft der Händler nicht', done: false };
      const have = item === 'wood' ? world.wood : item === 'turnip' ? farm.turnips : item === 'meal' ? farm.meals : item === 'apple' ? world.apples : item === 'berry' ? world.berries : farm.hay;
      if (have < n) return { err: 'So viel hast du nicht', done: false };
      if (item === 'wood') world.wood -= n;
      else if (item === 'turnip') farm.turnips -= n;
      else if (item === 'meal') farm.meals -= n;
      else if (item === 'apple') world.apples -= n;
      else if (item === 'berry') world.berries -= n;
      else farm.hay -= n;
      world.coins += price * n;
      world.version++;
      farm.version++;
      return { err: null, done: true, coins: price * n };
    }
    const item = a.item ?? '';
    if (item === 'seeds') {
      if (world.coins < SEED_PACK.price) err = 'Zu wenig Münzen';
      else {
        world.coins -= SEED_PACK.price;
        farm.seeds += SEED_PACK.n;
        world.version++;
        farm.version++;
      }
    } else if (item.startsWith('deco:')) err = world.buyDeco(item.slice(5));
    else if (item.startsWith('horse:')) {
      const breed = item.slice(6);
      if (!horseOffers(islandDay(world.clock, t), world.album.horses.length).includes(breed)) err = 'Dieses Pferd hat das Boot heute nicht dabei';
      else err = world.buyHorse(breed, a.name ?? '', t);
    } else err = 'Gibt es nicht';
  } else if (a.kind === 'build' && a.what === 'deco') {
    if (!decoById(a.item ?? '')) err = 'Gibt es nicht';
    else if (farmUnder(farm, a.x ?? 0, a.y ?? 0, 'deco')) err = 'Hier ist ein Feld im Weg';
    else err = world.placeDeco(a.x ?? 0, a.y ?? 0, a.item!, actor);
    if (!err) return { err: null, done: true, built: true };
  } else if (a.kind === 'build') {
    const x = a.x ?? 0;
    const y = a.y ?? 0;
    const what = a.what ?? 'house';
    if (farmUnder(farm, x, y, what)) err = 'Hier ist ein Feld im Weg';
    else if (world.build(x, y, actor, what)) return { err: null, done: true, built: true };
    else err = world.wood < BUILDS[what].cost ? 'Zu wenig Holz' : 'Hier ist kein Platz';
  } else if (a.kind === 'sleep') {
    world.clock ??= newClock(t);
    const night = sleepyHour(timeOf(world.clock, t).hour);
    world.clock.offset = night ? sleepOffset(world.clock, t) : napOffset(world.clock);
    world.version++;
    return { err: null, done: true, slept: night ? 'night' : 'nap' };
  } else if (a.kind === 'eat' && isDish(a.item ?? '')) {
    if (!((world.dishes[a.item!] ?? 0) > 0)) err = `Kein ${recipeById(a.item!)?.name ?? 'Essen'} mehr`;
    else {
      if (--world.dishes[a.item!] <= 0) delete world.dishes[a.item!];
      world.version++;
    }
  } else if (a.kind === 'eat' && a.item === 'grilled') {
    if (world.grilled <= 0) err = 'Kein Bratfisch mehr';
    else {
      world.grilled--;
      world.version++;
    }
  } else if (a.kind === 'eat' && (a.item === 'apple' || a.item === 'berry')) {
    // Obst aus dem Insel-Vorrat
    if (a.item === 'apple' ? world.apples <= 0 : world.berries <= 0) err = a.item === 'apple' ? 'Keine Äpfel mehr' : 'Keine Beeren mehr';
    else {
      if (a.item === 'apple') world.apples--;
      else world.berries--;
      world.version++;
    }
  } else if (a.kind === 'eat') {
    if (!farm.eat(!!a.cooked)) err = a.cooked ? 'Keine Ofenrüben mehr' : 'Keine Rüben mehr';
  } else if (a.kind === 'cook') {
    if (world.fireNear(actor.x, actor.y, 22) < 0) err = 'Kochen geht nur am Lagerfeuer';
    else if (a.item && recipeById(a.item)) {
      err = cook(world, farm, a.item);
      if (!err) return { err: null, done: true, cooked: a.item };
    } else if (a.item === 'fish') {
      // ältere Aktion (vor den Rezepten)
      if (!world.takeCookable()) err = 'Kein Fisch zum Braten';
    } else if (!farm.cook()) err = 'Keine Rüben zum Kochen';
  } else if (a.kind === 'adopt') {
    err = world.adopt(a.house ?? -1, a.item ?? '', a.name ?? '', t, (cost) => {
      if (farm.turnips < cost) return false;
      farm.turnips -= cost;
      farm.version++;
      return true;
    });
  } else if (a.kind === 'feed' || a.kind === 'brush') {
    // Heu (Standard), Leckerli = Apfel oder Rübe, Bürsten kostet nichts
    const what = a.kind === 'brush' ? 'brushed' : a.item === 'turnip' || a.item === 'apple' ? 'treat' : 'fed';
    err = world.care(a.horse ?? -1, what, t, () => {
      if (what === 'brushed') return true;
      if (a.item === 'apple') {
        if (world.apples <= 0) return false;
        world.apples--;
        return true;
      }
      if (what === 'treat' ? farm.turnips <= 0 : farm.hay <= 0) return false;
      if (what === 'treat') farm.turnips--;
      else farm.hay--;
      farm.version++;
      return true;
    });
  } else if (a.kind === 'dress') {
    err = world.dress(a.horse ?? -1, a.item ?? '');
  } else if (a.kind === 'foal') {
    err = world.foal(a.horse ?? -1, a.name ?? '', t, farm.hay, () => {
      farm.hay -= FOAL_HAY;
      farm.version++;
    });
  } else if (a.kind === 'mow') {
    err = farm.mow(c, r, tileFree(world, c, r, actor), t);
  } else if (a.kind === 'rake') {
    const got = farm.rake(c, r, t);
    return { err: null, done: got > 0, hay: got };
  } else if (a.kind === 'furnish') {
    const f = furnitureById(a.item ?? '');
    if (!f || (a.slot ?? -1) < 0 || (a.slot ?? 0) >= SLOT_COUNT) err = 'Unbekanntes Möbelstück';
    else err = world.furnish(a.house ?? -1, a.slot!, f.id, f.cost);
  }
  return { err, done: !err };
}

/**
 * Für das aktuelle Insel-Projekt abgeben. Stöcke und Steine kommen aus dem Rucksack
 * (zieht das Gerät selbst ab), alles andere aus dem Vorrat der Insel.
 */
function donate(world: World, farm: Farm, item: ProjItem, want: number): OpResult {
  const k = world.proj.n;
  const p = PROJECTS[k];
  if (!p) return { err: 'Alle Projekte sind fertig', done: false };
  if (!(item in PROJ_ITEMS)) return { err: 'Gibt es nicht', done: false };
  const left = (p.need[item] ?? 0) - (world.proj.got[item] ?? 0);
  if (left <= 0) return { err: `${PROJ_ITEMS[item].name} braucht ${p.name} nicht mehr`, done: false };
  const n = Math.min(left, want);
  if (!PROJ_ITEMS[item].bag) {
    if (islandHas(world, farm, item) < n) return { err: `Zu wenig ${PROJ_ITEMS[item].name}`, done: false };
    islandTake(world, farm, item, n);
  }
  // Bauplatz steht ab der ersten Abgabe fest
  world.proj.sites[k] ??= pickSite(world, farm, k);
  world.proj.got[item] = (world.proj.got[item] ?? 0) + n;
  world.version++;
  const complete = Object.entries(p.need).every(([key, v]) => (world.proj.got[key as ProjItem] ?? 0) >= v);
  if (!complete) return { err: null, done: true, donated: { item, n } };
  world.proj.n++;
  world.proj.got = {};
  if (p.id === 'pavilion') world.coins += FEST_COINS;
  // die nächste Baustelle bekommt gleich ihren Platz
  if (PROJECTS[world.proj.n]) world.proj.sites[world.proj.n] ??= pickSite(world, farm, world.proj.n);
  return { err: null, done: true, donated: { item, n }, finished: p.id };
}
