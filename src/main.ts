import '@fontsource/pixelify-sans/latin-500.css';
import '@fontsource/pixelify-sans/latin-700.css';
import './style.css';
import { Dir, type Look } from './character';
import { ACCESSORIES } from './horses';
import { ALBUM_REWARDS, ALBUM_TOTAL, DECO, SEED_PACK, SELL, SELL_NAMES, albumCount, boatOut, decoById, horseOffers, merchantHere, type SellItem } from './shop';
import { bookIcon, coinIcon, decoArt } from './decoart';
import { BREEDS, RARE_BREEDS, islandDay, STABLE_BREEDS, FOAL_GROW_MS, MAX_LOVE, PADDOCK_COST, STABLE_COST, STABLE_SPACE, TRUST, breedById, horsePose, isFoal, pasture, type HorsePose } from './horses';
import { hayIcon, heartIcon, paddockIcon, scythe, stable as stableArt } from './horseart';
import { Ground, H, TILE, W, generate } from './island';
import { setScene, sfx, unlockAudio } from './audio';
import { FURNITURE } from './furniture';
import { DOOR, ROOM_H, furnitureIcon, nearSpot, roomFree } from './interior';
import { Player } from './player';
import { httpApi, syncIsland } from './cloud';
import { CAN_GOAL, Farm, RIPE, key as plotKey } from './farm';
import { applyOp, farmUnder as farmUnderOf, link, tileFree as tileFreeOf, type Op } from './ops';
import { PERKS, levelProgress, questAt } from './progress';
import { newClock, timeOf, type TimeOfDay } from './time';
import { campfire, mealIcon, axe, bucket, hoe, house, logIcon, seedBag, toUrl, turnipIcon, wateringCan } from './props';
import { MAX_SLOTS, activeSlot, addSlot, loadSave, removeSlot, writeSave, type Save, type Slot } from './save';
import { PROTOCOL, Room, cleanCode, type Action, type Fx, type Msg, type PlayerState } from './net/room';
import { showCoop, showCustomize, showHud, showMenu, showSettings, showSlots, showWait, textScale, type Hud, type ToolId, type TradeData } from './ui';
import { BUILDS, FIRE_COST, HOUSE_COST, World, type BuildKind } from './world';
import { View } from './three/view';
import { horsePhoto } from './three/portrait';
import { warmHorse } from './three/horse';

const screen = document.querySelector<HTMLCanvasElement>('#screen')!;
const ctx = screen.getContext('2d')!;

const island = generate();

// ---------- Spielfigur & was sich auf der Insel ändert ----------
let save: Save = loadSave();
/** aktuelle eigene Insel (Spielstand) */
const mySlot = () => activeSlot(save);
const world = new World(island, mySlot().world);
const farm = new Farm(island, mySlot().farm);
link(world, farm);
/** 3D-Ansicht (liegt unter der Schrift-Ebene) */
const view = new View(island, world, farm, document.body);
const START = { x: 176, y: 172 };
const player = new Player(island, world, START.x, START.y);
/** neue/alte Insel ohne Uhr: es ist 7 Uhr morgens */
const ensureClock = () => {
  if (!world.clock && role !== 'guest') world.clock = newClock(Date.now());
};
{
  const pos = mySlot().pos;
  if (pos && player.free(pos.x, pos.y)) Object.assign(player, pos);
}

/** im Haus Nummer … (-1 = draußen), Position vor der Tür */
let inside = -1;
let outsidePos = { x: 0, y: 0 };
/** reite gerade Pferd Nummer … (-1 = zu Fuß) */
let riding = -1;
/** Lieblingspferd gerufen: folgt der Figur eine Weile */
let called: { i: number; x: number; y: number; dir: number; moving: boolean; until: number } | null = null;
const CALL_MS = 60_000;
/** gerade gestreichelt */
let petting: { i: number; until: number } | null = null;
/** Herzchen über Pferden */
const loveHearts = (x: number, y: number, n: number) => view.heartsAt(x, y, n, 2.4);
/** abgestiegen: Pferd läuft von hier gemütlich zurück zur Weide */
const released = new Map<number, { x: number; y: number; at: number }>();
const pastureFree = pasture(island, (x, y) => world.blocked(x, y, 6, 2));
const dirTo = (dx: number, dy: number) => (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? Dir.Right : Dir.Left) : dy > 0 ? Dir.Down : Dir.Up);
/** Wo ist Pferd i gerade? (null = gibt es nicht oder jemand reitet es) */
function horseAt(i: number, now = Date.now()): HorsePose | null {
  const h = world.horses[i];
  const st = h && world.stables[h.stable];
  if (!h || !st || i === riding || (mate && (mate.in ?? -1) === -1 && mate.rh === i)) return null;
  let slot = 0;
  for (let k = 0; k < i; k++) if (world.horses[k].stable === h.stable) slot++;
  // gerufen: läuft dir hinterher; gestreichelt: schaut dich an
  if (called?.i === i) return { x: called.x, y: called.y, dir: called.dir, moving: called.moving, graze: false };
  const p = horsePose(h, slot, st, now, pastureFree, !!tod?.night, world.paddockOf(h.stable));
  if (petting?.i === i && now < petting.until) return { ...p, dir: dirTo(player.x - p.x, 0), moving: false, graze: false };
  const rel = released.get(i);
  if (!rel) return p;
  const k = (now - rel.at) / 4000;
  if (k >= 1) {
    released.delete(i);
    return p;
  }
  const e = k * k * (3 - 2 * k);
  return { x: rel.x + (p.x - rel.x) * e, y: rel.y + (p.y - rel.y) * e, dir: dirTo(p.x - rel.x, p.y - rel.y), moving: Math.hypot(p.x - rel.x, p.y - rel.y) > 2, graze: false };
}
type Mode = 'menu' | 'custom' | 'play';
let mode: Mode = 'menu';

// Bilder für Knöpfe und Fenster
const houseImg = house();
const axeImg = axe();
const logImg = logIcon();
const hoeImg = hoe();
const bucketImg = bucket();
const canImg = wateringCan();
const turnipImg = turnipIcon();
const stableImg = stableArt();
const decoImgs = new Map(DECO.map((d) => [d.id as string, decoArt(d.id)]));
const scytheImg = scythe();
/** Pferd fürs Fenster und den Knopf: Foto vom 3D-Modell */
function horseIcon(id: string, foal = false, acc = '') {
  return horsePhoto(breedById(id) ?? BREEDS[0], acc, foal);
}
const hearts: [string, string] = [toUrl(heartIcon(true)), toUrl(heartIcon(false))];
const icons = {
  log: toUrl(logImg),
  axe: toUrl(axeImg),
  house: toUrl(houseImg.img),
  hoe: toUrl(hoeImg),
  seeds: toUrl(seedBag()),
  bucket: toUrl(bucketImg),
  can: toUrl(canImg),
  turnip: toUrl(turnipImg),
  fire: toUrl(campfire(0).img),
  meal: toUrl(mealIcon()),
  stable: toUrl(stableImg.img),
  horse: horseIcon('haflinger'),
  scythe: toUrl(scytheImg),
  hay: toUrl(hayIcon()),
  paddock: toUrl(paddockIcon()),
  coin: toUrl(coinIcon()),
  book: toUrl(bookIcon()),
};
const decoIcon = (id: string) => toUrl(decoImgs.get(id)!.img);

// ---------- Holzfällen ----------
let hud: Hud | null = null;
let actHeld = false;
let chopTarget = -1;
let tool: ToolId = 'axe';
/** Schwung (Sekunden, läuft rückwärts); swingTool = was gerade benutzt wird */
let swing = 0;
const SWING = 0.34;
let swingTool: ToolId | 'harvest' | 'refill' | 'cook' | 'rake' = 'axe';
let swingTile: [number, number] = [0, 0];
const shake = new Map<number, number>();
/** schwebende Texte („+4 Holz“): Welt-Pixel + Höhe (Einheiten) */
const floats: { x: number; y: number; h: number; text: string; life: number }[] = [];
const burst = (x: number, y: number, z: number, n: number, cols: string[], speed = 30) => view.burst(x, y, z, n, cols, speed);
// ---------- Aktionen (allein oder als Gastgeber ausgeführt, Effekte auch beim Gast) ----------
const CHIPS = ['#c8925a', '#8c6440', '#e8c890'];
const LEAVES = ['#2a6630', '#3f8640', '#68a85a', '#163c1e'];
const FX_SOUND: Partial<Record<Fx['k'], Parameters<typeof sfx>[0]>> = {
  chop: 'chop',
  fell: 'fell',
  till: 'hoe',
  seed: 'seed',
  water: 'water',
  refill: 'refill',
  harvest: 'harvest',
  build: 'build',
  quest: 'quest',
  level: 'level',
  cook: 'cook',
  furnish: 'build',
  sleep: 'sleep',
  horse: 'neigh',
  feed: 'eat',
  brush: 'brush',
  foal: 'neigh',
  mow: 'mow',
  rake: 'harvest',
  trade: 'coin',
};
/** wie hoch der Text über dem Boden schwebt (Einheiten) */
const FX_H: Partial<Record<Fx['k'], number>> = { fell: 3.6, build: 3, horse: 2.8, feed: 2.8, brush: 2.8, foal: 2.6, trade: 2.4, can: 2.6, cook: 2.2 };
function playFx(fx: Fx) {
  const snd = FX_SOUND[fx.k];
  if (snd) sfx(snd);
  if (fx.k === 'chop') {
    if (fx.tree !== undefined) shake.set(fx.tree, 1);
    burst(fx.x, fx.y, 6, 7, CHIPS);
  } else if (fx.k === 'fell') {
    // Blätter rieseln, Holz fliegt in den Rucksack
    burst(fx.x, fx.y, 24, 26, LEAVES, 40);
  } else if (fx.k === 'till') burst(fx.x, fx.y, 2, 10, ['#8a5e3a', '#6a4428', '#a87a50']);
  else if (fx.k === 'seed') burst(fx.x, fx.y, 3, 5, ['#e8c890', '#f4dcb0']);
  else if (fx.k === 'water') burst(fx.x, fx.y, 6, 12, ['#4a8ad0', '#9fd8f0', '#e6f7ff'], 18);
  else if (fx.k === 'refill') burst(fx.x, fx.y, 2, 8, ['#9fd8f0', '#e6f7ff'], 25);
  else if (fx.k === 'harvest') burst(fx.x, fx.y, 4, 10, ['#4f9a44', '#8a5e3a', '#b05a9a']);
  else if (fx.k === 'build') burst(fx.x, fx.y, 2, 30, ['#e8dcc8', '#c8b498', '#ffffff'], 45);
  else if (fx.k === 'can') hud?.toast('Belohnung: Eisen-Gießkanne!');
  else if (fx.k === 'mow') burst(fx.x, fx.y, 3, 10, ['#5a9a3a', '#7ab84a', '#a8d870'], 22);
  else if (fx.k === 'rake') burst(fx.x, fx.y, 3, 8, ['#e0b84a', '#f4d878', '#b08a2a'], 18);
  else if (fx.k === 'brush') burst(fx.x, fx.y, 12, 10, ['#ffffff', '#fff3a0', '#ffd23f'], 14);
  else if (fx.k === 'feed' || fx.k === 'horse' || fx.k === 'foal') burst(fx.x, fx.y, 14, 8, ['#e0485a', '#ff9aa8', '#ffffff'], 16);
  else if (fx.k === 'cook') burst(fx.x, fx.y, 6, 8, ['#ffd23f', '#ff9a2a', '#ffffff'], 18);
  else if (fx.k === 'quest') hud?.toast(fx.text ?? 'Aufgabe geschafft!');
  else if (fx.k === 'level' && fx.n) hud?.levelUp(fx.n, PERKS.find((p) => p.level === fx.n)?.text);
  if (fx.k === 'quest' || fx.k === 'level') return;
  if (fx.text) floats.push({ x: fx.x, y: fx.y, h: FX_H[fx.k] ?? 1.6, text: fx.text, life: fx.k === 'can' ? 2.2 : 1.5 });
}
function emit(fx: Fx) {
  playFx(fx);
  if (role === 'host') room?.send({ t: 'fx', fx });
}
/** Aktion ausführen (nur allein oder beim Gastgeber); liefert einen Hinweis bei Fehlschlag */
function perform(a: Action, actor: { x: number; y: number }): string | null {
  const op: Op = { a, x: Math.round(actor.x), y: Math.round(actor.y), t: Date.now() };
  const res = applyOp(world, farm, op);
  const c = a.c ?? 0;
  const r = a.r ?? 0;
  const cx = c * TILE + 4;
  const cy = r * TILE + 4;
  if (a.kind === 'axe') {
    const d = island.decor[a.tree ?? -1];
    if (d) emit({ k: 'chop', x: d.x + (actor.x < d.x ? -3 : 3), y: d.y - 2, tree: a.tree });
    if (d && res.felled) emit({ k: 'fell', x: d.x, y: d.y, text: `+${res.wood} Holz` });
  } else if (res.done) {
    if (a.kind === 'hoe') emit({ k: 'till', x: cx, y: cy });
    else if (a.kind === 'seeds') emit({ k: 'seed', x: cx, y: cy });
    else if (a.kind === 'refill') emit({ k: 'refill', x: actor.x, y: actor.y + 6, text: 'Voll!' });
    else if (a.kind === 'water') emit({ k: 'water', x: cx, y: cy });
    else if (a.kind === 'harvest' && res.harvest) {
      emit({ k: 'harvest', x: cx, y: cy, text: `+1 Rübe  +${res.harvest.seeds} Samen` });
      if (res.harvest.gotCan) emit({ k: 'can', x: actor.x, y: actor.y, text: 'Eisen-Gießkanne!' });
    } else if (a.kind === 'build') emit({ k: 'build', x: a.x ?? 0, y: a.y ?? 0, text: a.what === 'fire' ? 'Lagerfeuer!' : a.what === 'stable' ? 'Pferdestall!' : a.what === 'paddock' ? 'Koppel!' : a.what === 'deco' ? `${decoById(a.item ?? '')?.name ?? 'Deko'} steht!` : 'Haus gebaut!' });
    else if (a.kind === 'adopt') {
      const st = world.stables[a.house ?? -1];
      const h = world.horses[world.horses.length - 1];
      if (st && h) emit({ k: 'horse', x: st.x, y: st.y + 4, text: `${h.name} zieht ein!` });
    } else if (a.kind === 'feed' || a.kind === 'brush') {
      const p = horseAt(a.horse ?? -1) ?? actor;
      emit({ k: a.kind, x: p.x, y: p.y, text: a.kind === 'brush' ? 'Glänzt! +1 Vertrauen' : a.item === 'turnip' ? 'Lecker! +1 Vertrauen' : 'Mampf! +1 Vertrauen' });
    } else if (a.kind === 'foal') {
      const h = world.horses[world.horses.length - 1];
      const p = horseAt(a.horse ?? -1) ?? actor;
      if (h) emit({ k: 'foal', x: p.x, y: p.y, text: `${h.name} ist geboren!` });
    } else if (a.kind === 'mow') emit({ k: 'mow', x: cx, y: cy });
    else if (a.kind === 'rake') emit({ k: 'rake', x: cx, y: cy, text: `+${res.hay ?? 0} Heu` });
    else if (a.kind === 'sell') emit({ k: 'trade', x: actor.x, y: actor.y, text: `+${res.coins ?? 0} Münzen` });
    else if (a.kind === 'buy') {
      const it = a.item ?? '';
      const h = world.horses[world.horses.length - 1];
      const text = it.startsWith('horse:') && h ? `${h.name} zieht in den Stall!` : it === 'seeds' ? `+${SEED_PACK.n} Samen` : `${decoById(it.slice(5))?.name ?? 'Deko'} gekauft – im Bau-Menü aufstellen`;
      emit({ k: 'trade', x: actor.x, y: actor.y, text });
      if (it.startsWith('horse:')) emit({ k: 'horse', x: actor.x, y: actor.y });
    }
    else if (a.kind === 'cook') emit({ k: 'cook', x: actor.x, y: actor.y, text: '+1 Ofenrübe' });
  }
  // Aufgaben & Stufen
  for (const q of res.gain?.quests ?? []) {
    const reward = [q.seeds ? `+${q.seeds} Samen` : '', q.wood ? `+${q.wood} Holz` : '', `+${q.xp} EP`].filter(Boolean).join(' ');
    emit({ k: 'quest', x: actor.x, y: actor.y, text: `Aufgabe geschafft: ${q.text}! ${reward}` });
  }
  for (const n of res.gain?.levels ?? []) emit({ k: 'level', x: actor.x, y: actor.y, n });
  for (const al of res.album ?? []) emit({ k: 'quest', x: actor.x, y: actor.y, text: `Sammelalbum: ${al.at} Einträge! +${al.coins} Münzen` });
  // gemeinsame Insel: Aktion für den Abgleich merken (beim Fällen nur das Umfallen)
  if (cloudOn() && (a.kind === 'axe' ? res.felled : res.done)) {
    const sl = mySlot();
    (sl.pending ??= []).push(a.kind === 'axe' ? { ...op, a: { ...a, fell: true } } : op);
  }
  syncHud();
  persist();
  return res.err;
}
/** eigene Aktion: allein/Gastgeber gleich ausführen, als Gast an den Gastgeber schicken */
function doAction(a: Action) {
  if (role === 'guest') {
    room?.send({ t: 'do', a });
    return null;
  }
  return perform(a, player);
}

// ---------- Ackerbau ----------
/** Kachel vor der Figur */
function frontTile(): [number, number] {
  const off: Record<Dir, [number, number]> = { [Dir.Down]: [0, 7], [Dir.Up]: [0, -7], [Dir.Right]: [8, -2], [Dir.Left]: [-8, -2] };
  const [dx, dy] = off[player.dir];
  return Farm.tileAt(player.x + dx, player.y + dy);
}
const tileFree = (c: number, r: number, actor: { x: number; y: number } = player) => tileFreeOf(world, c, r, actor);
/** Wasser vor der Figur (zum Auffüllen)? */
function facingWater() {
  const off: Record<Dir, [number, number]> = { [Dir.Down]: [0, 10], [Dir.Up]: [0, -8], [Dir.Right]: [10, 0], [Dir.Left]: [-10, 0] };
  const [dx, dy] = off[player.dir];
  for (let k = 0.6; k <= 1.6; k += 0.5) {
    const x = Math.round(player.x + dx * k);
    const y = Math.round(player.y + dy * k);
    if (x < 0 || y < 0 || x >= W || y >= H || island.ground[y * W + x] === Ground.Water) return true;
  }
  return false;
}
type Intent = ToolId | 'harvest' | 'refill' | 'cook' | 'rake' | 'trade' | 'enter' | 'exit' | 'sleep' | 'chest' | 'furnish' | 'stable' | 'horse' | 'dismount' | null;
/** Was würde der Aktions-Knopf jetzt tun? */
/** Haustür vor der Figur? (Index des Hauses) */
function doorAhead() {
  if (player.dir !== Dir.Up) return -1;
  return world.houses.findIndex((h) => Math.abs(player.x - h.x) < 6 && player.y > h.y && player.y < h.y + 10);
}
// ---------- Händler-Boot ----------
/** Liegeplatz rechts am Ende des Stegs */
const BOAT = { x: island.dock.x + island.dock.w + 15, y: island.dock.y + island.dock.h - 2 };
function boatNear() {
  return merchantHere(world.clock, Date.now()) && Math.abs(player.x - (island.dock.x + island.dock.w - 6)) < 12 && player.y > BOAT.y - 26 && player.y < BOAT.y + 4;
}
let tradeUI: { update(d: TradeData): void } | null = null;
function tradeData(): TradeData {
  const now = Date.now();
  const offers = horseOffers(islandDay(world.clock, now), world.album.horses.length);
  return {
    coins: world.coins,
    have: { turnip: farm.turnips, meal: farm.meals, wood: world.wood, hay: farm.hay },
    sell: (Object.keys(SELL) as SellItem[]).map((id) => ({ id, name: SELL_NAMES[id], price: SELL[id], img: id === 'wood' ? icons.log : id === 'meal' ? icons.meal : id === 'hay' ? icons.hay : icons.turnip })),
    seeds: { n: SEED_PACK.n, price: SEED_PACK.price, img: icons.seeds },
    deco: DECO.map((d) => ({ id: d.id, name: d.name, price: d.price, img: decoIcon(d.id), owned: world.album.deco.includes(d.id) })),
    horses: offers.map((id) => {
      const b = breedById(id)!;
      return { id, name: b.name, text: b.text, price: b.rare ?? 0, img: horseIcon(id) };
    }),
    horseBlock: !world.stables.length ? 'Für Pferde brauchst du zuerst einen Pferdestall.' : world.freeStable() < 0 ? 'Alle Ställe sind voll – bau noch einen.' : null,
  };
}
function openTrade() {
  sfx('coin');
  const act = (a: Action) => {
    const err = doAction(a);
    if (err) hud?.toast(err);
    // als Gast kommt der neue Stand gleich vom Gastgeber
    if (role === 'guest') setTimeout(() => tradeUI?.update(tradeData()), 500);
  };
  tradeUI =
    hud?.openTrade(
      tradeData(),
      {
        sell: (id, n) => act({ kind: 'sell', item: id, n }),
        buy: (id) => {
          if (!id.startsWith('horse:')) return act({ kind: 'buy', item: id });
          const b = breedById(id.slice(6))!;
          hud?.askName(b.name, horseIcon(b.id), b.text, b.names[Math.floor(Math.random() * b.names.length)], `Kaufen · ${b.rare} Münzen`, (name) => act({ kind: 'buy', item: id, name }));
        },
      },
      () => (tradeUI = null),
    ) ?? null;
}
function openAlbum() {
  const pic = (id: string) => horseIcon(id);
  hud?.openAlbum({
    sections: [
      { title: 'Pferderassen', items: STABLE_BREEDS.map((b) => ({ name: b.name, img: pic(b.id), has: world.album.horses.includes(b.id) })) },
      { title: 'Seltene Pferde', items: RARE_BREEDS.map((b) => ({ name: b.name, img: pic(b.id), has: world.album.horses.includes(b.id), rare: true })) },
      { title: 'Deko', items: DECO.map((d) => ({ name: d.name, img: decoIcon(d.id), has: world.album.deco.includes(d.id) })) },
    ],
    count: albumCount(world.album),
    total: ALBUM_TOTAL,
    rewards: ALBUM_REWARDS.map((r, i) => ({ ...r, got: i < world.albumClaimed })),
  });
}

/** Stalltür vor der Figur? */
function stableDoorAhead() {
  if (player.dir !== Dir.Up) return -1;
  return world.stables.findIndex((h) => Math.abs(player.x - h.x) < 10 && player.y > h.y && player.y < h.y + 10);
}
/** Pferd direkt vor/neben der Figur (Nummer) */
function horseNear() {
  let best = -1;
  let bestD = 13;
  world.horses.forEach((_, i) => {
    const p = horseAt(i);
    if (!p) return;
    const d = Math.hypot(p.x - player.x, (p.y - player.y) * 1.5);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}
function intent(): { kind: Intent; tree: number; tile: [number, number] } {
  const tile = frontTile();
  if (inside >= 0) {
    const sp = nearSpot(player.x, player.y, world.houses[inside]?.furn);
    const k = sp ? (sp.kind === 'bed' ? 'sleep' : sp.kind === 'door' ? 'exit' : sp.kind === 'chest' ? 'chest' : 'furnish') : null;
    return { kind: k, tree: sp?.kind === 'slot' ? sp.slot : -1, tile };
  }
  if (riding >= 0) return { kind: 'dismount', tree: riding, tile };
  if (doorAhead() >= 0) return { kind: 'enter', tree: doorAhead(), tile };
  if (boatNear()) return { kind: 'trade', tree: -1, tile };
  const sd = stableDoorAhead();
  if (sd >= 0) return { kind: 'stable', tree: sd, tile };
  const hn = horseNear();
  if (hn >= 0) return { kind: 'horse', tree: hn, tile };
  const p = farm.plot(...tile);
  if (p?.crop && p.crop.stage >= RIPE) return { kind: 'harvest', tree: -1, tile };
  // trockenes Heu liegt vor einem: einsammeln
  if (farm.mown(...tile, Date.now()) === 'dry') return { kind: 'rake', tree: -1, tile };
  // am Lagerfeuer mit Rüben im Gepäck: braten
  if (farm.turnips > 0 && world.fireNear(player.x, player.y, 20) >= 0) return { kind: 'cook', tree: -1, tile };
  if (tool === 'axe') {
    const tr = world.target(player.x, player.y);
    return { kind: tr >= 0 ? 'axe' : null, tree: tr, tile };
  }
  if (tool === 'hoe') return { kind: !p && tileFree(...tile) ? 'hoe' : null, tree: -1, tile };
  if (tool === 'scythe') {
    const [c, r] = tile;
    const grass = island.ground[(r * TILE + 4) * W + c * TILE + 4] === Ground.Grass;
    return { kind: grass && !p && !farm.meadow.has(plotKey(c, r)) && tileFree(c, r) ? 'scythe' : null, tree: -1, tile };
  }
  if (tool === 'seeds') return { kind: p && !p.crop && farm.seeds > 0 ? 'seeds' : null, tree: -1, tile };
  if (facingWater() && farm.water < farm.capacity) return { kind: 'refill', tree: -1, tile };
  return { kind: p && !p.wetAt && farm.water > 0 ? 'water' : null, tree: -1, tile };
}
const toolHint: Record<ToolId, string> = {
  axe: 'Geh näher an einen Baum',
  hoe: 'Stell dich vor ein freies Stück Wiese',
  seeds: 'Stell dich vor ein leeres Feld',
  water: 'Stell dich vor ein trockenes Feld',
  scythe: 'Stell dich vor ein Stück Wiese zum Mähen',
};
// ---------- Energie ----------
/** Energie kostet jede Arbeit; Essen und Schlafen füllen sie auf */
const COST: Partial<Record<Action['kind'], number>> = { axe: 2, hoe: 3, seeds: 1, water: 1, build: 5, mow: 2 };
const FOOD = { raw: 12, cooked: 40 };
const energy = () => save.energy ?? 100;
function setEnergy(v: number) {
  save.energy = Math.max(0, Math.min(100, Math.round(v * 10) / 10));
  hud?.setEnergy(save.energy);
  player.speedMul = save.energy < 15 ? 0.6 : 1;
}
/** genug Kraft? sonst Hinweis */
function spend(kind: Action['kind']) {
  const c = COST[kind] ?? 0;
  if (!c) return true;
  if (energy() < c) {
    actHeld = false;
    hud?.toast('Du bist erschöpft – iss eine Rübe oder schlaf im Haus');
    return false;
  }
  setEnergy(energy() - c);
  return true;
}
function eat(cooked: boolean) {
  const have = cooked ? farm.meals : farm.turnips;
  if (have <= 0) return hud?.toast(cooked ? 'Keine Ofenrüben – brat Rüben am Lagerfeuer' : 'Keine Rüben – ernte erst welche');
  if (energy() >= 100) return hud?.toast('Du bist satt');
  const err = doAction({ kind: 'eat', cooked });
  if (err) return hud?.toast(err);
  setEnergy(energy() + (cooked ? FOOD.cooked : FOOD.raw));
  sfx('eat');
  floats.push({ x: player.x, y: player.y, h: 2.3, text: `+${cooked ? FOOD.cooked : FOOD.raw} Energie`, life: 1.3 });
  writeSave(save);
}

function useTool() {
  const [c, r] = swingTile;
  const kind = swingTool === 'scythe' ? 'mow' : swingTool;
  if (!spend(kind)) return;
  // nach Ernten/Auffüllen nicht gleich weitermachen – erst loslassen
  if (swingTool === 'harvest' || swingTool === 'refill' || swingTool === 'cook' || swingTool === 'rake') actHeld = false;
  const err = doAction({ kind, c, r, tree: chopTarget });
  if (err) hud?.toast(err);
}
function syncHud() {
  if (!hud) return;
  hud.setInv(world.wood, farm.turnips, farm.meals);
  hud.setEnergy(energy());
  hud.setSlots(farm.seeds, farm.water, farm.capacity, farm.hasCan, farm.hay);
  hud.setCoins(world.coins);
  tradeUI?.update(tradeData());
  const q = questAt(world.prog.quests);
  const have = Math.min(q.goal, world.prog.stats[q.stat] ?? 0);
  const reward = [q.seeds ? `${q.seeds} Samen` : '', q.wood ? `${q.wood} Holz` : '', `${q.xp} EP`].filter(Boolean).join(', ');
  const can = farm.hasCan ? '' : `\nErnte ${CAN_GOAL} Rüben → Eisen-Gießkanne (${farm.harvested}/${CAN_GOAL})`;
  hud.setGoal(`Aufgabe: ${q.text} (${have}/${q.goal})\nBelohnung: ${reward}${can}`);
  hud.setLevel(world.level, levelProgress(world.prog.xp));
  if (tod) hud.setClock(`Tag ${tod.day} · ${tod.label}${tod.rain ? ' · Regen' : ''}`);
}

// ---------- Haus platzieren ----------
let placing = false;
let placeKind: BuildKind = 'house';
/** welche Deko gerade aufgestellt wird */
let placeDeco = '';
let ghost = { x: 0, y: 0, ok: false };
function ghostSpot() {
  const px = Math.round(player.x / 2) * 2;
  const py = Math.round(player.y / 2) * 2;
  if (placeKind === 'paddock') {
    // Koppel: Tor zeigt zur Figur
    if (player.dir === Dir.Down) return { x: px, y: py + 52 };
    if (player.dir === Dir.Up) return { x: px, y: py - 6 };
    if (player.dir === Dir.Right) return { x: px + 42, y: py + 20 };
    return { x: px - 42, y: py + 20 };
  }
  const k = placeKind === 'fire' || placeKind === 'deco' ? 0.5 : placeKind === 'stable' ? 1.3 : 1;
  if (player.dir === Dir.Down) return { x: px, y: py + Math.round(22 * k) };
  if (player.dir === Dir.Up) return { x: px, y: py - Math.round(6 * k) - (k < 1 ? 4 : 0) };
  if (player.dir === Dir.Right) return { x: px + Math.round(28 * k), y: py + 6 };
  return { x: px - Math.round(28 * k), y: py + 6 };
}

// ---------- Kamera ----------
// ---------- Grafik-Qualität: Auflösung passt sich schwachen Handys an ----------
export type Gfx = 'auto' | 'high' | 'low';
const GFX_KEY = 'cozyisland.gfx';
const CAP_KEY = 'cozyisland.dprcap3d';
/** 3D: Auflösungs-Stufen (Bildpunkte pro CSS-Pixel) */
const CAPS = [2, 1.5, 1.25, 1];
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* egal */
    }
  },
};
let gfx: Gfx = (['auto', 'high', 'low'] as const).find((g) => g === store.get(GFX_KEY)) ?? 'auto';
let autoCap = CAPS.includes(Number(store.get(CAP_KEY))) ? Number(store.get(CAP_KEY)) : 2;
const dprCap = () => (gfx === 'high' ? 2 : gfx === 'low' ? 1 : autoCap);
function setGfx(g: Gfx) {
  gfx = g;
  store.set(GFX_KEY, g);
  if (g === 'auto') {
    autoCap = 2;
    store.set(CAP_KEY, '2');
  }
  resize();
}
/** Bildzeiten messen; ruckelt es dauerhaft, eine Stufe weniger Pixel (ganz unten ohne Schatten) */
const perf = { sum: 0, n: 0 };
function watchPerf(ms: number) {
  if (gfx !== 'auto' || mode !== 'play' || document.visibilityState !== 'visible' || ms > 250) return;
  perf.sum += ms;
  perf.n++;
  if (perf.n < 120) return;
  const avg = perf.sum / perf.n;
  perf.sum = perf.n = 0;
  const i = CAPS.indexOf(autoCap);
  if (avg > 26 && i < CAPS.length - 1) {
    autoCap = CAPS[i + 1];
    store.set(CAP_KEY, String(autoCap));
    resize();
  }
}

/** eigene Zoom-Stufe (mit zwei Fingern) merken */
const ZOOM_KEY = 'cozyisland.zoom3d';
view.setZoom(Number(store.get(ZOOM_KEY)) || 1);
function setZoom(z: number) {
  view.setZoom(z);
  if (mode === 'play' && inside < 0) store.set(ZOOM_KEY, view.zoom.toFixed(2));
}
function resize() {
  // Schrift-Ebene scharf, 3D je nach Gerät
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  screen.width = Math.round(innerWidth * dpr);
  screen.height = Math.round(innerHeight * dpr);
  screen.style.width = `${innerWidth}px`;
  screen.style.height = `${innerHeight}px`;
  const cap = Math.min(dprCap(), window.devicePixelRatio || 1);
  view.setQuality({ dpr: cap, shadows: gfx === 'low' || (gfx === 'auto' && autoCap <= 1) ? 0 : gfx === 'high' ? 2 : 1 });
}
addEventListener('resize', resize);
resize();

// ---------- Steuerung: Daumen-Joystick, Tastatur, zwei Finger = zoomen ----------
const pointers = new Map<number, { x: number; y: number }>();
let stick: { id: number; ox: number; oy: number; x: number; y: number } | null = null;
let pinch0 = 0;
let zoom0 = 1;
const STICK_R = 46; // CSS-Pixel bis Vollgas
const hint = document.querySelector<HTMLElement>('.hint')!;

screen.addEventListener('pointerdown', (e) => {
  if (mode !== 'play') return;
  screen.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
  if (pointers.size === 2) {
    stick = null;
    const [a, b] = [...pointers.values()];
    pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
    zoom0 = view.zoom;
  }
  hint.classList.add('gone');
});
screen.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  p.x = e.clientX;
  p.y = e.clientY;
  if (stick && stick.id === e.pointerId) {
    stick.x = e.clientX;
    stick.y = e.clientY;
    // Daumen zu weit weg → Mittelpunkt zieht mit (wie bei Handyspielen üblich)
    const dx = stick.x - stick.ox;
    const dy = stick.y - stick.oy;
    const d = Math.hypot(dx, dy);
    if (d > STICK_R * 1.6) {
      stick.ox = stick.x - (dx / d) * STICK_R * 1.6;
      stick.oy = stick.y - (dy / d) * STICK_R * 1.6;
    }
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    setZoom(zoom0 * (Math.hypot(a.x - b.x, a.y - b.y) / pinch0));
  }
});
const up = (e: PointerEvent) => {
  pointers.delete(e.pointerId);
  if (stick?.id === e.pointerId) stick = null;
};
screen.addEventListener('pointerup', up);
screen.addEventListener('pointercancel', up);
screen.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    if (mode === 'play') setZoom(view.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
  },
  { passive: false },
);
const keys = new Set<string>();
addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  keys.add(e.key.toLowerCase());
  if (mode !== 'play') return;
  if (e.key === 'Escape') {
    if (placing) {
      placing = false;
      hud?.setPlacing(false);
    } else openMenu();
  }
  if (e.key === 'Enter' && placing) confirmBuild();
  if ((e.key === ' ' || e.key.toLowerCase() === 'e') && !placing) {
    e.preventDefault();
    actHeld = true;
  }
  if (e.key.toLowerCase() === 'b' && !placing) hud?.openBuild(world.wood);
  const tk = (['axe', 'hoe', 'seeds', 'water'] as const)[Number(e.key) - 1];
  if (tk) {
    tool = tk;
    hud?.setTool(tk);
  }
});
addEventListener('keyup', (e) => {
  keys.delete(e.key.toLowerCase());
  if (e.key === ' ' || e.key.toLowerCase() === 'e') actHeld = false;
});
addEventListener('blur', () => keys.clear());

function input(): [number, number] {
  let x = 0;
  let y = 0;
  if (keys.has('a') || keys.has('arrowleft')) x -= 1;
  if (keys.has('d') || keys.has('arrowright')) x += 1;
  if (keys.has('w') || keys.has('arrowup')) y -= 1;
  if (keys.has('s') || keys.has('arrowdown')) y += 1;
  if (x || y) return [x, y];
  if (stick) return [(stick.x - stick.ox) / STICK_R, (stick.y - stick.oy) / STICK_R];
  return [0, 0];
}

// ---------- Menüs ----------
/** Stand der Insel beim letzten Speichern – „zuletzt gespielt“ zählt nur echte Änderungen */
let savedVersion = '';
const versionNow = () => `${world.version}/${farm.version}`;
function persist() {
  const now = Date.now();
  const changed = versionNow() !== savedVersion;
  savedVersion = versionNow();
  const pos = inside >= 0 ? { ...outsidePos } : { x: Math.round(player.x), y: Math.round(player.y) };
  if (role === 'guest') {
    // als Gast: eigene Kopie der gemeinsamen Insel mitschreiben (die eigene Insel bleibt unberührt)
    if (!hostSlot) return writeSave(save);
    let copy = save.slots.find((x) => x.id === hostSlot!.id);
    if (!copy) {
      // „Meine Insel“ des Freundes heißt bei mir „Insel von …“
      const title = hostSlot.title === 'Meine Insel' ? `Insel von ${mate?.name ?? 'Freund'}`.slice(0, 20) : hostSlot.title;
      copy = { id: hostSlot.id, title, createdAt: now, updatedAt: now };
      save.slots.push(copy);
    }
    Object.assign(copy, { shared: { with: mate?.name ?? copy.shared?.with ?? 'Freund' }, pos, world: world.toSave(), farm: farm.toSave() });
    if (changed) copy.updatedAt = now;
  } else {
    const sl = mySlot();
    Object.assign(sl, { pos, world: world.toSave(), farm: farm.toSave() });
    if (changed) sl.updatedAt = now;
    if (role === 'host' && mate) sl.shared = { with: mate.name };
  }
  writeSave(save);
}
/** Insel wechseln: Stand aus dem Spielstand laden */
function applySlot(sl: Slot) {
  save.active = sl.id;
  world.apply(sl.world ?? {});
  farm.apply(sl.farm ?? {});
  ensureClock();
  const pos = sl.pos && player.free(sl.pos.x, sl.pos.y) ? sl.pos : START;
  player.x = pos.x;
  player.y = pos.y;
  shake.clear();
  floats.length = 0;
  savedVersion = versionNow();
  writeSave(save);
}
function openSlots() {
  hud = null;
  mode = 'custom';
  showSlots(
    save,
    {
      play: (id) => {
        const sl = save.slots.find((x) => x.id === id);
        if (!sl) return;
        if (sl.id !== save.active) {
          persist();
          applySlot(sl);
        }
        startPlay();
      },
      create: () => {
        persist();
        const sl = addSlot(save);
        if (!sl) return;
        applySlot(sl);
        startPlay();
      },
      remove: (id) => {
        const wasActive = id === save.active;
        removeSlot(save, id);
        if (!save.slots.length) addSlot(save);
        if (wasActive) applySlot(mySlot());
        writeSave(save);
        openSlots();
      },
      rename: (id, title) => {
        const sl = save.slots.find((x) => x.id === id);
        if (sl) sl.title = title;
        writeSave(save);
      },
      back: openMenu,
    },
    !!room,
  );
}
function openMenu() {
  if (inside >= 0) leaveHouse();
  riding = -1;
  hud = null;
  if (mode === 'play') persist();
  mode = 'menu';
  stick = null;
  pointers.clear();
  hint.classList.add('gone');
  showMenu(save, {
    settings: openSettings,
    play: startPlay,
    slots: openSlots,
    look: () => openCustom(false),
    coop: () => openCoop(),
    leave: room ? () => (leaveCoop(), openMenu()) : undefined,
    coopText: room ? (role === 'host' ? `Deine Insel ist offen – Code ${room.code}` : `Zu Besuch bei ${mate?.name || 'deinem Freund'}`) : undefined,
    // gemeinsame Inseln direkt im Menü (ohne Umweg über Spielstände)
    shared: room ? [] : save.slots.filter((x) => x.shared && x.id !== save.active).map((x) => ({ id: x.id, title: x.title })),
    playSlot: (id) => {
      const sl = save.slots.find((x) => x.id === id);
      if (!sl) return;
      applySlot(sl);
      startPlay();
    },
    note: linkNote,
  });
  linkNote = '';
}
// ---------- Als App (PWA) ----------
let installPrompt: (Event & { prompt: () => Promise<void> }) | null = null;
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e as typeof installPrompt;
});
const standalone = () => matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || (navigator as { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (import.meta.env.PROD && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) void navigator.serviceWorker.register('./sw.js').catch(() => {});
function openSettings() {
  hud = null;
  mode = 'custom';
  showSettings({
    gfx,
    setGfx,
    install: standalone()
      ? { kind: 'done' }
      : installPrompt
        ? {
            kind: 'prompt',
            run: () => {
              const p = installPrompt;
              installPrompt = null;
              void p?.prompt().finally(openSettings);
            },
          }
        : { kind: isIos() ? 'ios' : 'none' },
    back: openMenu,
  });
}
function openCustom(first: boolean) {
  hud = null;
  mode = 'custom';
  showCustomize(
    save,
    (s) => {
      save = s;
      writeSave(save);
      room?.send({ t: 'look', name: save.name, look: save.look });
      if (pendingJoin) {
        const code = pendingJoin;
        pendingJoin = '';
        joinRoom(code);
      } else if (first) startPlay();
      else openMenu();
    },
    { first },
  );
}
function startPlay() {
  if (!save.created) return openCustom(true);
  mode = 'play';
  view.snap();
  placing = false;
  hud = showHud(
    {
      menu: openMenu,
      act: (down) => {
        actHeld = down;
        if (down && !intent().kind) hud?.toast(tool === 'water' && farm.water <= 0 ? 'Leer – am Wasser auffüllen' : toolHint[tool]);
      },
      tool: (t) => {
        tool = t;
        hud?.setTool(t);
      },
      place: (what, item) => {
        placing = true;
        placeKind = what;
        placeDeco = item ?? '';
        hud?.setPlacing(true);
      },
      eat,
      decoList: () =>
        Object.entries(world.decoInv)
          .filter(([, n]) => n > 0)
          .map(([id, n]) => ({ id, name: decoById(id)?.name ?? id, img: decoIcon(id), n })),
      album: openAlbum,
      call: callFav,
      confirm: confirmBuild,
      cancel: () => {
        placing = false;
        hud?.setPlacing(false);
      },
    },
    icons,
    { house: HOUSE_COST, fire: FIRE_COST, stable: STABLE_COST, paddock: PADDOCK_COST },
  );
  hud.setTool(tool);
  syncHud();
  updateCoopChip();
  void cloudSync();
  hint.classList.remove('gone');
  setTimeout(() => hint.classList.add('gone'), 6000);
}
/** Liegt ein Feld unter der Haus-Grundfläche? */
function farmUnder(x: number, y: number) {
  return farmUnderOf(farm, x, y, placeKind);
}
function confirmBuild() {
  if (!placing) return;
  if (farmUnder(ghost.x, ghost.y)) return hud?.toast('Hier ist ein Feld im Weg');
  if (!ghost.ok) return hud?.toast('Hier ist kein Platz');
  if (world.wood < BUILDS[placeKind].cost) return hud?.toast('Zu wenig Holz');
  if (placeKind !== 'deco' && !spend('build')) return;
  placing = false;
  hud?.setPlacing(false);
  const err = doAction({ kind: 'build', x: ghost.x, y: ghost.y, what: placeKind, ...(placeKind === 'deco' ? { item: placeDeco } : {}) });
  if (err) hud?.toast(err);
}

// ---------- Koop ----------
type Role = 'solo' | 'host' | 'guest';
let role: Role = 'solo';
let room: Room | null = null;
let pendingJoin = '';
interface Mate {
  name: string;
  look: Look;
  x: number;
  y: number;
  tx: number;
  ty: number;
  d: Dir;
  f: number;
  s: number;
  tl: string;
  in?: number;
  /** reitet Pferd … */
  rh?: number;
  /** zuletzt bewegt (fürs Laufen) */
  movedAt: number;
}
let mate: Mate | null = null;
/** als Gast: welche Insel wir besuchen */
let hostSlot: { id: string; title: string; updatedAt: number } | null = null;
let guestSaveTimer = 0;
let lastPos = 0;
let lastState = 0;
let sentVersion = '';
const myState = (): PlayerState => ({
  x: Math.round(player.x * 10) / 10,
  y: Math.round(player.y * 10) / 10,
  d: player.dir,
  f: swing > 0 ? (swing > SWING / 2 ? 1 : 3) : player.frame,
  s: swing > 0 ? Math.round((1 - swing / SWING) * 100) / 100 : 0,
  tl: swing > 0 ? swingTool : '',
  in: inside,
  ...(riding >= 0 ? { rh: riding } : {}),
});
function makeMate(name: string, look: Look, p: PlayerState): Mate {
  return { name: name || 'Freund', look, x: p.x, y: p.y, tx: p.x, ty: p.y, d: p.d as Dir, f: p.f, s: p.s, tl: p.tl, rh: p.rh, movedAt: 0 };
}
const islandState = () => ({ world: world.toSave(), farm: farm.toSave() });
function updateCoopChip() {
  if (!hud) return;
  if (!room) {
    const sh = mySlot().shared;
    return hud.setCoop(sh ? `Gemeinsam mit ${sh.with}${cloudState === 'offline' ? ' · offline' : ''}` : null);
  }
  if (role === 'host') hud.setCoop(mate ? `Koop: ${mate.name} ist da` : `Raum ${room.code} · wartet …`);
  else hud.setCoop(`Zu Besuch bei ${mate?.name ?? '…'}`);
}
function coopLink(code: string) {
  return `${location.origin}${location.pathname}?join=${code}`;
}
/** fester Link zur eigenen Insel: der Freund spielt jederzeit mit, auch offline */
async function shareIsland(): Promise<string> {
  const sl = mySlot();
  sl.shared ??= { with: 'Freund' };
  persist();
  void cloudSync();
  const url = `${location.origin}${location.pathname}?insel=${sl.id}&von=${encodeURIComponent(save.name || 'Freund')}`;
  const text = `Spiel mit mir auf meiner Insel „${sl.title}“ in Cozy Island – jederzeit, auch wenn ich offline bin!`;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Cozy Island', text, url });
      return 'Link geschickt!';
    }
    await navigator.clipboard.writeText(`${text} ${url}`);
    return 'Link kopiert – schick ihn deinem Freund';
  } catch {
    return '';
  }
}
async function share(code: string) {
  const url = coopLink(code);
  const text = `Komm auf meine Insel in Cozy Island! Code: ${code}`;
  try {
    if (navigator.share) return await navigator.share({ title: 'Cozy Island', text, url });
    await navigator.clipboard.writeText(`${text} ${url}`);
    hud?.toast('Link kopiert');
  } catch {
    /* abgebrochen */
  }
}
function openCoop(code = '') {
  hud = null;
  mode = 'custom';
  showCoop({ host: hostRoom, join: (c) => joinRoom(c), back: openMenu, island: shareIsland }, code, mySlot().title);
}
function newRoom(host: boolean) {
  leaveCoop();
  const r = new Room(host);
  room = r;
  role = host ? 'host' : 'guest';
  r.onMsg = (m) => room === r && onNet(m);
  r.onError = (text) => {
    if (room !== r) return;
    leaveCoop();
    mode = 'custom';
    hud = null;
    showWait('Hoppla!', `<p>${text}</p>`, { back: openMenu });
  };
  r.onClose = () => {
    if (room !== r) return;
    if (role === 'host') {
      if (mate) hud?.toast(`${mate.name} hat deine Insel verlassen`);
      mate = null;
      // hängende Verbindung lösen, damit der Freund wieder beitreten kann
      const c = r.conn;
      r.conn = null;
      c?.close();
      updateCoopChip();
    } else {
      leaveCoop();
      hud?.toast('Die Verbindung zur Insel ist weg');
      if (mode === 'play') startPlay();
    }
  };
  return r;
}
function hostRoom() {
  if (!save.created) return openCustom(true);
  void cloudSync();
  const r = newRoom(true);
  mode = 'custom';
  hud = null;
  showWait('Insel wird geöffnet …', '<div class="code-big"><span>…</span></div>', { back: () => (leaveCoop(), openMenu()) });
  void r.create().then((code) => {
    if (room !== r || mode !== 'custom') return;
    showWait(
      'Deine Insel ist offen!',
      `<div class="code-big">${[...code].map((ch) => `<span>${ch}</span>`).join('')}</div>
       <p>Sag deinem Freund den Code oder schick ihm den Link. Du kannst schon spielen – er kommt dazu, sobald er beitritt.</p>`,
      { share: () => void share(code), play: startPlay, back: () => (leaveCoop(), openMenu()) },
    );
  });
}
function joinRoom(code: string) {
  if (!save.created) {
    pendingJoin = code;
    return openCustom(true);
  }
  const r = newRoom(false);
  mode = 'custom';
  hud = null;
  showWait('Verbinde …', `<p>mit der Insel <b>${code}</b></p>`, { back: () => (leaveCoop(), openMenu()) });
  r.onTry = (n) => n > 1 && room === r && mode === 'custom' && showWait('Verbinde …', `<p>Direkt klappt es nicht – verbinde über die Website mit <b>${code}</b> …</p>`, { back: () => (leaveCoop(), openMenu()) });
  r.onOpen = () => r.send({ t: 'hi', v: PROTOCOL, name: save.name, look: save.look });
  r.join(code);
}
function leaveCoop() {
  const wasGuest = role === 'guest';
  room?.close();
  room = null;
  mate = null;
  role = 'solo';
  if (wasGuest) {
    // Kopie der gemeinsamen Insel sichern, dann zurück auf die eigene Insel
    role = 'guest';
    persist();
    role = 'solo';
    // auf der gemeinsamen Insel bleiben (allein weiterspielen, Cloud gleicht ab) –
    // die eigene Insel ist weiter unter „Spielstände“
    const copy = hostSlot && save.slots.find((x) => x.id === hostSlot!.id);
    hostSlot = null;
    applySlot(copy ?? mySlot());
    if (copy) {
      setTimeout(() => hud?.toast(`Du spielst auf „${copy.title}“ weiter – alles bleibt gespeichert`), 600);
      void cloudSync();
    }
  }
  syncHud();
  updateCoopChip();
}
/** wann zuletzt etwas vom Mitspieler kam – bleibt es aus, ist er weg (App zu, Netz weg) */
let lastHeard = 0;
const SILENT_MS = 15_000;
setInterval(() => {
  const r = room;
  if (!r || !mate || document.visibilityState !== 'visible') return;
  if (Date.now() - lastHeard > SILENT_MS) r.onClose();
}, 2000);
// nach dem Zurückholen der App kurz Zeit geben, bis wieder Nachrichten kommen
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') lastHeard = Date.now();
});
addEventListener('pagehide', () => room?.connected && room.send({ t: 'bye' }));
function onNet(m: Msg) {
  const r = room!;
  lastHeard = Date.now();
  switch (m.t) {
    // ----- beim Gastgeber -----
    case 'hi':
      if (role !== 'host') return;
      if (m.v !== PROTOCOL) {
        const text = 'Ihr habt verschiedene Spiel-Versionen – bitte beide die Seite neu laden.';
        r.send({ t: 'msg', text });
        hud?.toast(text);
        return;
      }
      mate = makeMate(m.name, m.look, { x: player.x + 12, y: player.y, d: Dir.Down, f: 0, s: 0, tl: '' });
      persist();
      r.send({
        t: 'welcome',
        v: PROTOCOL,
        name: save.name,
        look: save.look,
        state: islandState(),
        p: myState(),
        slot: { id: mySlot().id, title: mySlot().title, updatedAt: mySlot().updatedAt },
      });
      sentVersion = '';
      hud?.toast(`${mate.name} besucht deine Insel!`);
      updateCoopChip();
      if (mode === 'custom') startPlay();
      break;
    case 'do':
      if (role !== 'host' || !mate) return;
      {
        const err = perform(m.a, { x: mate.tx, y: mate.ty });
        if (err) r.send({ t: 'msg', text: err });
      }
      break;
    // ----- beim Gast -----
    case 'welcome': {
      if (role !== 'guest') return;
      if (m.v !== PROTOCOL) {
        leaveCoop();
        mode = 'custom';
        hud = null;
        showWait('Andere Version', '<p>Dein Freund hat noch eine ältere Version von Cozy Island. Bitte beide die Seite neu laden (oder die App neu öffnen) und nochmal versuchen.</p>', { back: openMenu });
        return;
      }
      // eigenen (neueren) Stand dieser gemeinsamen Insel mitbringen?
      // (gemeinsame Inseln gleichen sich über die Cloud ab – der Gastgeber hat den neuesten Stand)
      const mine = save.slots.find((x) => x.id === m.slot.id);
      hostSlot = m.slot;
      world.apply(m.state.world);
      farm.apply(m.state.farm);
      savedVersion = versionNow();
      mate = makeMate(m.name, m.look, m.p);
      {
        // Kopie anlegen bzw. auf den Stand des Gastgebers bringen
        role = 'guest';
        persist();
        const copy = save.slots.find((x) => x.id === m.slot.id);
        if (copy) {
          copy.updatedAt = Math.max(m.slot.updatedAt, mine?.updatedAt ?? 0);
          // eigene Kopie holt sich beim nächsten Alleinspielen den Cloud-Stand;
          // noch nicht abgeglichene eigene Aktionen bleiben gemerkt und kommen dann dazu
          copy.rev = 0;
        }
        writeSave(save);
      }
      // neben dem Gastgeber auftauchen
      const spots = [[12, 0], [-12, 0], [0, 10], [0, -10], [18, 6]];
      const spot = spots.find(([dx, dy]) => player.free(m.p.x + dx, m.p.y + dy)) ?? [0, 0];
      player.x = m.p.x + spot[0];
      player.y = m.p.y + spot[1];
      startPlay();
      hud?.toast(`Willkommen auf der Insel von ${mate.name}!`);
      break;
    }
    case 'state':
      if (role !== 'guest') return;
      world.apply(m.state.world);
      farm.apply(m.state.farm);
      syncHud();
      // Kopie der gemeinsamen Insel ab und zu sichern
      if (!guestSaveTimer)
        guestSaveTimer = window.setTimeout(() => {
          guestSaveTimer = 0;
          if (role === 'guest') persist();
        }, 2000);
      break;
    case 'newer':
      if (role !== 'host' || m.updatedAt <= mySlot().updatedAt) return;
      world.apply(m.state.world);
      farm.apply(m.state.farm);
      persist();
      mySlot().updatedAt = m.updatedAt;
      writeSave(save);
      syncHud();
      hud?.toast(`Neuerer Stand von ${mate?.name ?? 'deinem Freund'} übernommen`);
      break;
    case 'fx':
      playFx(m.fx);
      break;
    case 'msg':
      hud?.toast(m.text);
      break;
    // ----- beide -----
    case 'p':
      if (!mate) return;
      // Raumwechsel: nicht durchs Bild gleiten
      if ((m.p.in ?? -1) !== (mate.in ?? -1)) Object.assign(mate, { x: m.p.x, y: m.p.y });
      // Freund steigt ab: Pferd läuft von dort zurück
      if (mate.rh !== undefined && mate.rh !== m.p.rh) released.set(mate.rh, { x: mate.x, y: mate.y, at: Date.now() });
      if (Math.hypot(m.p.x - mate.tx, m.p.y - mate.ty) > 0.2) mate.movedAt = Date.now();
      Object.assign(mate, { tx: m.p.x, ty: m.p.y, d: m.p.d, f: m.p.f, s: m.p.s, tl: m.p.tl, in: m.p.in ?? -1, rh: m.p.rh });
      break;
    case 'look':
      if (!mate) return;
      mate.name = m.name || mate.name;
      mate.look = m.look;
      updateCoopChip();
      break;
    case 'bye':
      r.onClose();
      break;
  }
}
/** jedes Bild: Position schicken, als Gastgeber den Insel-Stand */
function netTick(now: number) {
  if (!room?.connected) return;
  if (now - lastPos > 100) {
    lastPos = now;
    room.send({ t: 'p', p: myState() });
  }
  if (role === 'host' && mate) {
    const v = `${world.version}/${farm.version}`;
    if ((v !== sentVersion && now - lastState > 120) || now - lastState > 4000) {
      sentVersion = v;
      lastState = now;
      room.send({ t: 'state', state: islandState() });
    }
  }
}
// ---------- Gemeinsame Insel: Abgleich über island.php ----------
const cloud = httpApi();
let syncing = false;
let cloudState: 'ok' | 'offline' | '' = '';
/** eigene Insel ist gemeinsam und wird von hier aus abgeglichen (nicht als Gast) */
function cloudOn() {
  return role !== 'guest' && !!mySlot().shared;
}
async function cloudSync() {
  if (!cloudOn() || syncing) return;
  syncing = true;
  const sl = mySlot();
  try {
    const res = await syncIsland(cloud, sl.id, island, { rev: sl.rev ?? 0, pending: sl.pending ?? [] }, islandState, !!sl.pull);
    if (mySlot() !== sl || !cloudOn()) return;
    if (!res) {
      cloudState = 'offline';
      if (sl.pull && mode === 'play') hud?.toast('Die gemeinsame Insel lädt noch – ist das Internet an?');
      return;
    }
    if (sl.pull) {
      if (!res.state) {
        if (mode === 'play') hud?.toast(`Die Insel ist noch nicht in der Cloud – ${sl.shared?.with ?? 'dein Freund'} muss sie einmal öffnen`);
        return;
      }
      delete sl.pull;
      if (mode === 'play') setTimeout(() => hud?.toast(`Willkommen auf „${sl.title}“!`), 300);
    }
    cloudState = 'ok';
    sl.rev = res.rev;
    const rest = (sl.pending ?? []).slice(res.consumed);
    sl.pending = rest;
    if (res.state) {
      // was der Freund inzwischen gemacht hat (plus eigene Aktionen von eben)
      const before = world.wood + farm.turnips + farm.plots.size + world.houses.length + world.felled.size;
      world.apply(res.state.world);
      farm.apply(res.state.farm);
      for (const op of rest) applyOp(world, farm, op);
      const after = world.wood + farm.turnips + farm.plots.size + world.houses.length + world.felled.size;
      if (after !== before && mode === 'play') hud?.toast(`Insel aktualisiert – ${sl.shared?.with ?? 'dein Freund'} war fleißig`);
      syncHud();
    }
    persist();
  } finally {
    syncing = false;
    updateCoopChip();
  }
}
setInterval(() => void cloudSync(), 8000);
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void cloudSync());

// Ton erst nach der ersten Berührung (Browser-Regel); Klick-Geräusch für Knöpfe
addEventListener('pointerdown', unlockAudio, { capture: true });
addEventListener('keydown', unlockAudio, { capture: true });
addEventListener(
  'click',
  (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (b && !b.matches('[data-act=use]')) sfx(b.disabled ? 'nope' : 'click');
  },
  { capture: true },
);
let stepT = 0;

// Insel-Link ?insel=ID&von=NAME: gemeinsame Insel dazuholen – geht auch, wenn der Freund offline ist
let linkNote = '';
{
  const q = new URLSearchParams(location.search);
  const id = q.get('insel') ?? '';
  const from = (q.get('von') ?? '').replace(/[<>&"]/g, '').trim().slice(0, 12) || 'Freund';
  if (/^[a-z0-9]{8,40}$/.test(id)) {
    q.delete('insel');
    q.delete('von');
    history.replaceState(null, '', location.pathname + (q.size ? `?${q}` : ''));
    let sl = save.slots.find((x) => x.id === id);
    if (!sl && save.slots.length < MAX_SLOTS) {
      const now = Date.now();
      sl = { id, title: `Insel von ${from}`.slice(0, 20), shared: { with: from }, createdAt: now, updatedAt: 0, rev: 0, pull: true };
      save.slots.push(sl);
    }
    if (sl) {
      applySlot(sl);
      linkNote = `„${sl.title}“ ist jetzt bei deinen Spielständen – ihr spielt gemeinsam darauf, auch wenn einer offline ist.`;
    } else linkNote = `Du hast schon ${MAX_SLOTS} Inseln – lösch eine unter „Spielstände“ und öffne den Link nochmal.`;
  }
}
// Einladungs-Link ?join=CODE
{
  const q = new URLSearchParams(location.search);
  const code = cleanCode(q.get('join') ?? '');
  if (code.length === 4) {
    q.delete('join');
    history.replaceState(null, '', location.pathname + (q.size ? `?${q}` : ''));
    pendingJoin = code;
  }
}
addEventListener('pagehide', () => mode === 'play' && persist());
setInterval(() => mode === 'play' && persist(), 10_000);
ensureClock();
savedVersion = versionNow();
if (pendingJoin) {
  const code = pendingJoin;
  pendingJoin = '';
  joinRoom(code);
} else openMenu();
// Pferde-Modelle und -Fotos nach und nach im Leerlauf vorbereiten (kein Ruckeln später)
{
  const idle = (fn: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 800));
  const jobs: (() => void)[] = [0, 2, 3].map((s) => () => warmHorse(s as 0 | 2 | 3));
  for (const h of world.horses) jobs.push(() => void horseIcon(h.breed, isFoal(h, Date.now()), h.acc));
  for (const id of world.album.horses) jobs.push(() => void horseIcon(id));
  const next = () => {
    const job = jobs.shift();
    if (!job) return;
    job();
    setTimeout(() => idle(next), 300);
  };
  setTimeout(() => idle(next), 2500);
}

// ---------- Bild für Bild ----------
let last = performance.now();
/** Joystick-Richtung (die Figur dreht sich weich dorthin) */
let moveIn: [number, number] = [0, 0];
function frame(now: number) {
  requestAnimationFrame(frame);
  watchPerf(now - last);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = (window as unknown as { __t?: number }).__t ?? now / 1000;

  moveIn = [0, 0];
  if (mode === 'play') {
    const [mx, my] = input();
    moveIn = [mx, my];
    if (riding >= 0 && !world.horses[riding]) riding = -1;
    const rb = riding >= 0 ? breedById(world.horses[riding].breed) : undefined;
    // je mehr Vertrauen, desto flotter (bis +20 %)
    player.speedMul = rb ? rb.speed * (1 + world.horses[riding].love * 0.02) : energy() < 15 ? 0.6 : 1;
    // beim Schlagen bleibt man stehen
    if (swing > 0) player.update(0, 0, dt);
    else player.update(mx, my, dt);
    if (player.moving) {
      stepT -= dt;
      if (stepT <= 0) {
        stepT = rb ? 0.17 : 0.3 / player.speedMul;
        sfx(rb ? 'hoof' : 'step');
      }
    }
    // Werkzeug benutzen
    if (!placing) {
      const it = intent();
      hud?.setAction(!!it.kind, it.kind === 'trade' ? icons.coin : it.kind === 'stable' ? icons.stable : it.kind === 'horse' || it.kind === 'dismount' ? horseIcon(world.horses[it.tree]?.breed ?? '', !!world.horses[it.tree] && isFoal(world.horses[it.tree], Date.now())) : it.kind && ROOM_ACTS.has(it.kind) ? icons.house : it.kind === 'cook' ? icons.meal : it.kind === 'harvest' ? icons.turnip : it.kind === 'rake' ? icons.hay : it.kind === 'refill' ? (farm.hasCan ? icons.can : icons.bucket) : icons[tool === 'water' ? (farm.hasCan ? 'can' : 'bucket') : tool]);
      if (actHeld && swing <= 0 && it.kind && ROOM_ACTS.has(it.kind)) {
        actHeld = false;
        roomAction(it.kind, it.tree);
      } else if (actHeld && swing <= 0 && it.kind) {
        swingTool = it.kind as typeof swingTool;
        swingTile = it.tile;
        if (it.kind === 'axe') {
          chopTarget = it.tree;
          const d = island.decor[it.tree];
          // zum Baum drehen
          const dx = d.x - player.x;
          const dy = d.y - player.y;
          player.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? Dir.Right : Dir.Left) : dy > 0 ? Dir.Down : Dir.Up;
        }
        swing = it.kind === 'seeds' || it.kind === 'harvest' || it.kind === 'rake' ? SWING * 0.7 : SWING;
      }
    }
    if (swing > 0) {
      const before = swing;
      swing -= dt;
      if (before > SWING / 2 && swing <= SWING / 2) useTool();
    }
    if (placing) {
      const g = ghostSpot();
      ghost = { ...g, ok: world.canPlace(g.x, g.y, player, placeKind) && !farmUnder(g.x, g.y) };
      hud?.setPlacing(true, ghost.ok && world.wood >= BUILDS[placeKind].cost);
    }
    if (role !== 'guest' && Math.floor(now / 1000) !== Math.floor((now - dt * 1000) / 1000)) {
      world.grow(Date.now(), player);
      farm.update(Date.now(), tod?.rain);
    }
  }
  netTick(now);
  if (mode === 'play') horseLife(dt, now);
  if (mate) {
    const k = 1 - Math.exp(-dt * 12);
    mate.x += (mate.tx - mate.x) * k;
    mate.y += (mate.ty - mate.y) * k;
  }
  // Gastgeber im Menü: Insel läuft weiter (Bäume wachsen, Freund spielt)
  if (role === 'host' && mode !== 'play' && Math.floor(now / 1000) !== Math.floor((now - dt * 1000) / 1000)) {
    world.grow(Date.now(), player);
    farm.update(Date.now());
  }

  tod = world.clock ? timeOf(world.clock, Date.now()) : null;
  {
    const fi = world.fires.length ? Math.min(...world.fires.map((f) => Math.hypot(f.x - player.x, f.y - player.y))) : 999;
    setScene({ night: tod?.dark ?? 0, rain: !!tod?.rain, fire: mode === 'play' && inside < 0 ? Math.max(0, 1 - fi / 70) : 0, menu: mode !== 'play', inside: inside >= 0 });
  }
  if (mode === 'play' && hud && tod) hud.setClock(`Tag ${tod.day} · ${tod.label}${tod.rain ? ' · Regen' : ''}`);
  for (const [i, v] of shake) {
    const nv = v - dt * 3;
    if (nv <= 0) shake.delete(i);
    else shake.set(i, nv);
  }
  const nowMs = Date.now();
  const play = mode === 'play';
  view.render({
    mode,
    t,
    dt,
    now: nowMs,
    tod,
    me: play
      ? {
          x: player.x,
          y: player.y,
          dir: player.dir,
          moving: player.moving,
          swing: swing > 0 ? 1 - swing / SWING : 0,
          tool: swing > 0 ? swingTool : '',
          rides: riding,
          in: inside,
          look: save.look,
          mx: moveIn[0],
          my: moveIn[1],
          speed: player.speedMul,
        }
      : null,
    mate:
      play && mate
        ? { x: mate.x, y: mate.y, dir: mate.d, moving: nowMs - mate.movedAt < 220, swing: mate.s, tool: mate.tl, rides: mate.rh ?? -1, in: mate.in ?? -1, look: mate.look }
        : null,
    canTool: farm.hasCan,
    horseAt: (i) => horseAt(i, nowMs),
    petting: petting && nowMs < petting.until ? petting.i : -1,
    shake,
    boatOut: boatOut(world.clock, nowMs),
    boat: BOAT,
    ghost: play && placing ? { kind: placeKind, deco: placeDeco, x: ghost.x, y: ghost.y, ok: ghost.ok && world.wood >= BUILDS[placeKind].cost } : null,
    marker: play && !placing && tool !== 'axe' && riding < 0 ? frontTile() : null,
    inside,
  });
  drawOverlay(t, dt, nowMs);
}
requestAnimationFrame(frame);

// ---------- Schrift über der 3D-Welt: Namen, „+4 Holz“, Joystick ----------
const tmpP = { x: 0, y: 0 };
function pill(text: string, x: number, y: number, size: number, bg: string) {
  const dpr = screen.width / innerWidth;
  ctx.font = `700 ${Math.round(size * dpr * textScale)}px 'Pixelify Sans', sans-serif`;
  ctx.textAlign = 'center';
  const w = ctx.measureText(text).width + 12 * dpr;
  const hh = (size + 7) * dpr * textScale;
  ctx.fillStyle = bg;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x * dpr - w / 2, y * dpr - hh * 0.78, w, hh, hh / 2);
  else ctx.rect(x * dpr - w / 2, y * dpr - hh * 0.78, w, hh);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(text, x * dpr, y * dpr);
}
/** Höhe des Pferdekopfs (für Namen und „z z z“) */
const horseTop = (breed: string, foal: boolean) => {
  const b = breedById(breed);
  return foal || b?.size === 3 ? 1.55 : b?.size === 0 ? 2.1 : b?.size === 2 ? 2.75 : 2.45;
};
function drawOverlay(t: number, dt: number, nowMs: number) {
  const dpr = screen.width / innerWidth;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, screen.width, screen.height);
  // Name über dem Mitspieler
  if (mode === 'play' && mate && (mate.in ?? -1) === inside) {
    const rides = mate.rh !== undefined && (mate.in ?? -1) < 0 && world.horses[mate.rh];
    const p = view.project(mate.x, mate.y, rides ? horseTop(rides.breed, false) + 1.3 : 2.2, tmpP);
    if (p) pill(mate.name, p.x, p.y, 14, 'rgba(20,40,60,0.65)');
  }
  // Pferdenamen in der Nähe, nachts „z z z“
  if (mode === 'play' && inside < 0 && world.horses.length) {
    world.horses.forEach((h, i) => {
      const p = horseAt(i, nowMs);
      if (!p) return;
      const top = horseTop(h.breed, isFoal(h, nowMs));
      if (Math.hypot(p.x - player.x, p.y - player.y) < 34) {
        const q = view.project(p.x, p.y, top + 0.45, tmpP);
        if (q) pill((mySlot().fav === i ? '♥ ' : '') + h.name, q.x, q.y, 12, 'rgba(120,40,80,0.6)');
      }
      if (tod?.night && !p.moving) {
        const q = view.project(p.x, p.y, top, tmpP);
        if (!q) return;
        ctx.font = `700 ${Math.round(13 * dpr * textScale)}px 'Pixelify Sans', sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(230,240,255,0.9)';
        for (let k = 0; k < 3; k++) {
          const ph = (t * 0.5 + k / 3 + i * 0.37) % 1;
          ctx.globalAlpha = Math.sin(ph * Math.PI);
          ctx.fillText('z', (q.x + 14 + ph * 16) * dpr, (q.y - 6 - ph * 26) * dpr);
        }
        ctx.globalAlpha = 1;
      }
    });
  }
  // „+4 Holz“
  if (floats.length) {
    ctx.font = `700 ${Math.round(20 * dpr * textScale)}px 'Pixelify Sans', sans-serif`;
    ctx.textAlign = 'center';
    for (let k = floats.length - 1; k >= 0; k--) {
      const f = floats[k];
      f.life -= dt;
      if (f.life <= 0) {
        floats.splice(k, 1);
        continue;
      }
      const p = view.project(f.x, f.y, f.h + (1.4 - f.life) * 0.9, tmpP);
      if (!p) continue;
      const sx = p.x * dpr;
      const sy = p.y * dpr;
      ctx.globalAlpha = Math.min(1, f.life * 2);
      ctx.fillStyle = '#2a1a10';
      for (const [ax, ay] of [[-2, 0], [2, 0], [0, -2], [0, 2], [2, 2]]) ctx.fillText(f.text, sx + ax * dpr, sy + ay * dpr);
      ctx.fillStyle = '#ffe08a';
      ctx.fillText(f.text, sx, sy);
    }
    ctx.globalAlpha = 1;
  }
  // Joystick
  if (mode === 'play' && stick) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#0e2a3a';
    ctx.beginPath();
    ctx.arc(stick.ox, stick.oy, STICK_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#f6e7c1';
    const dx = stick.x - stick.ox;
    const dy = stick.y - stick.oy;
    const d = Math.min(STICK_R, Math.hypot(dx, dy));
    const a = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.arc(stick.ox + Math.cos(a) * d, stick.oy + Math.sin(a) * d, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// ---------- Tag & Nacht ----------
let tod: TimeOfDay | null = null;

// ---------- Im Haus ----------
const ROOM_ACTS = new Set<Intent>(['enter', 'exit', 'sleep', 'chest', 'furnish', 'stable', 'horse', 'dismount', 'trade']);
function mount(i: number) {
  const p = horseAt(i);
  if (!p) return;
  riding = i;
  released.delete(i);
  if (called?.i === i) called = null;
  if (player.free(p.x, p.y)) Object.assign(player, { x: p.x, y: p.y });
  sfx('neigh');
  hud?.toast(`Du reitest ${world.horses[i].name} – Knopf rechts zum Absteigen`);
}
const favIndex = () => mySlot().fav;
/** Lieblingspferd rufen: trabt herbei und folgt eine Minute lang */
function callFav() {
  const i = favIndex();
  if (i === undefined || !world.horses[i] || riding >= 0) return;
  const p = horseAt(i);
  if (!p && called?.i !== i) return hud?.toast('Dein Liebling ist gerade unterwegs');
  sfx('whistle');
  const from = called?.i === i ? called : p!;
  called = { i, x: from.x, y: from.y, dir: from.dir, moving: true, until: Date.now() + CALL_MS };
  released.delete(i);
  setTimeout(() => sfx('neigh'), 500);
}
let greetT = 0;
/** Pferde-Leben: Gerufenes folgt, vertraute Pferde grüßen mit Herzchen, Rufen-Knopf */
function horseLife(dt: number, now: number) {
  void now;
  const ms = Date.now();
  if (called) {
    const h = world.horses[called.i];
    if (!h || ms > called.until || inside >= 0) {
      if (h) released.set(called.i, { x: called.x, y: called.y, at: ms });
      called = null;
    } else {
      // neben die Figur, nicht drauf
      const tx = player.x + (called.x < player.x ? -13 : 13);
      const ty = player.y + 2;
      const dx = tx - called.x;
      const dy = ty - called.y;
      const d = Math.hypot(dx, dy);
      called.moving = d > 3;
      if (called.moving) {
        const v = Math.min(d, (d > 40 ? 70 : 40) * dt);
        const nx = called.x + (dx / d) * v;
        const ny = called.y + (dy / d) * v;
        called.x = nx;
        called.y = ny;
        called.dir = dirTo(dx, dy * 0.8);
      } else called.dir = dirTo(player.x - called.x, 0);
    }
  }
  // Begrüßung: vertraute Pferde in der Nähe schicken ab und zu ein Herzchen
  greetT -= dt;
  if (greetT <= 0) {
    greetT = 0.7;
    world.horses.forEach((h, i) => {
      if (h.love < 4) return;
      const p = horseAt(i, ms);
      if (p && Math.hypot(p.x - player.x, p.y - player.y) < 24 && Math.random() < 0.12) loveHearts(p.x, p.y - 16, 1);
    });
  }
  const fi = favIndex();
  const fh = fi !== undefined ? world.horses[fi] : undefined;
  hud?.setCall(fh && riding < 0 && inside < 0 && !isFoal(fh, ms) ? horseIcon(fh.breed, false, fh.acc) : fh && riding < 0 && inside < 0 ? horseIcon(fh.breed, true, fh.acc) : null);
}
function dismount() {
  if (riding < 0) return;
  released.set(riding, { x: player.x, y: player.y, at: Date.now() });
  riding = -1;
  // neben das Pferd steigen
  for (const dx of [-9, 9]) if (player.free(player.x + dx, player.y)) {
    player.x += dx;
    break;
  }
}
function enterHouse(i: number) {
  const h = world.houses[i];
  if (!h) return;
  outsidePos = { x: Math.round(player.x), y: Math.round(player.y) };
  inside = i;
  player.collide = (x, y) => roomFree(x, y, world.houses[inside]?.furn);
  player.x = DOOR.x;
  player.y = ROOM_H - 7;
  player.dir = Dir.Up;
  placing = false;
  hud?.setInside(true);
  hint.classList.add('gone');
  sfx('door');
}
function leaveHouse() {
  const h = world.houses[inside];
  inside = -1;
  player.collide = null;
  player.x = h ? h.x : outsidePos.x;
  player.y = h ? h.y + 7 : outsidePos.y;
  player.dir = Dir.Down;
  hud?.setInside(false);
  view.snap();
  sfx('door');
}
function roomAction(kind: Intent, slot: number) {
  if (kind === 'dismount') return dismount();
  if (kind === 'trade') return openTrade();
  if (kind === 'stable') {
    const mine = world.horses.filter((h) => h.stable === slot).map((h) => h.name);
    const breeds = STABLE_BREEDS.map((b) => ({ id: b.id, name: b.name, text: b.text, cost: b.cost, level: b.level, img: horseIcon(b.id), names: b.names }));
    sfx('door');
    return hud?.openStable({ breeds, turnips: farm.turnips, level: world.level, mine, space: STABLE_SPACE }, (id, name) => {
      const err = doAction({ kind: 'adopt', house: slot, item: id, name });
      if (err) hud?.toast(err);
    });
  }
  if (kind === 'horse') {
    const h = world.horses[slot];
    const b = h && breedById(h.breed);
    if (!h || !b) return;
    const now = Date.now();
    const foal = isFoal(h, now);
    sfx('neigh');
    const care = (a: Action) => {
      const err = doAction(a);
      if (err) hud?.toast(err);
    };
    const grows = foal ? ` Wird in ${Math.max(1, Math.ceil((h.foal! + FOAL_GROW_MS - now) / 60_000))} Min. groß.` : '';
    return hud?.openHorse(
      {
        name: h.name,
        breed: foal ? `${b.name}-Fohlen` : b.name,
        text: b.text + grows,
        img: horseIcon(b.id, foal),
        love: h.love,
        maxLove: MAX_LOVE,
        canRide: !foal && h.love >= TRUST,
        foal,
        fed: world.doneToday(slot, 'fed', now),
        treat: world.doneToday(slot, 'treat', now),
        brushed: world.doneToday(slot, 'brushed', now),
        showFoal: !foal && h.love >= MAX_LOVE,
        foalBlock: world.foalBlock(slot, now, farm.hay),
        acc: h.acc ?? '',
        accs: ACCESSORIES.map((x) => ({ id: x.id, name: x.name, hearts: Math.ceil(x.love / 2), open: h.love >= x.love, img: horseIcon(b.id, foal, x.id) })),
        fav: favIndex() === slot,
      },
      { turnips: farm.turnips, hay: farm.hay },
      hearts,
      {
        feed: () => care({ kind: 'feed', horse: slot, item: 'hay' }),
        treat: () => care({ kind: 'feed', horse: slot, item: 'turnip' }),
        brush: () => care({ kind: 'brush', horse: slot }),
        ride: () => mount(slot),
        pet: () => {
          const p = horseAt(slot);
          if (!p) return;
          petting = { i: slot, until: Date.now() + 1800 };
          loveHearts(p.x, p.y - 14, 5);
          sfx('nicker');
        },
        fav: () => {
          const sl = mySlot();
          sl.fav = sl.fav === slot ? undefined : slot;
          writeSave(save);
          hud?.toast(sl.fav === slot ? `${h.name} ist dein Liebling – mit „Rufen“ kommt es zu dir` : `${h.name} ist nicht mehr Liebling`);
        },
        dress: (id) => {
          const err = doAction({ kind: 'dress', horse: slot, item: id });
          if (err) return hud?.toast(err);
          const p = horseAt(slot);
          if (p) loveHearts(p.x, p.y - 14, 3);
          sfx('nicker');
        },
        foal: () =>
          hud?.askName('Ein Fohlen!', horseIcon(b.id, true), `${h.name} bekommt ein ${b.name}-Fohlen. Wie soll es heißen?`, b.names[Math.floor(Math.random() * b.names.length)], 'Willkommen!', (name) =>
            care({ kind: 'foal', horse: slot, name }),
          ),
      },
    );
  }
  if (kind === 'enter') return enterHouse(slot);
  if (kind === 'exit') return leaveHouse();
  if (kind === 'chest')
    return hud?.openChest([
      ['Holz', world.wood],
      ['Samen', farm.seeds],
      ['Rüben', farm.turnips],
      ['Ofenrüben', farm.meals],
    ]);
  if (kind === 'furnish')
    return hud?.openFurnish(
      FURNITURE.map((f) => ({ id: f.id, name: f.name, cost: f.cost, img: toUrl(furnitureIcon(f.id)!) })),
      world.wood,
      (item) => {
        const err = doAction({ kind: 'furnish', house: inside, slot, item });
        if (err) hud?.toast(err);
        else sfx('build');
      },
    );
  if (kind === 'sleep') {
    const night = tod ? tod.hour >= 17 || tod.hour < 6 : true;
    hud?.sleep(night ? 'Gute Nacht …' : 'Ein kleines Nickerchen …', () => {
      const err = doAction({ kind: 'sleep' });
      if (err) return hud?.toast(err);
      setEnergy(night ? 100 : energy() + 40);
      writeSave(save);
      hud?.toast(night ? `Guten Morgen! Ein neuer Tag beginnt.` : 'Ausgeruht! +40 Energie');
    });
    sfx('sleep');
  }
}
// zum Testen von außen
(window as unknown as { __game?: unknown }).__game = {
  player,
  world,
  farm,
  syncHud,
  view,
  mount,
  enterHouse,
  leaveHouse,
  /** Mitspieler vortäuschen (Tests) */
  fakeMate: (look: Look, x: number, y: number) => (mate = makeMate('Lena', look, { x, y, d: Dir.Down, f: 0, s: 0, tl: '' })),
  swingNow: (tl: typeof swingTool) => ((swingTool = tl), (swing = SWING * 0.5)), get mode() { return mode; }, get mate() { return mate; }, get room() { return room; }, horsePos: (i: number) => horseAt(i), get riding() { return riding; } };
