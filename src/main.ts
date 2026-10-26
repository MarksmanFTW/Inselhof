import '@fontsource/fredoka/latin-400.css';
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import './style.css';
import { Dir, type Look } from './character';
import { ACCESSORIES } from './horses';
import { ALBUM_REWARDS, ALBUM_TOTAL, DECO, STAR_DECO, SEED_PACK, SELL, SELL_NAMES, albumCount, boatOut, decoById, horseOffers, merchantHere, type SellItem } from './shop';
import { BREEDS, RARE_BREEDS, islandDay, STABLE_BREEDS, FOAL_GROW_MS, MAX_LOVE, PADDOCK_COST, STABLE_COST, STABLE_SPACE, TRUST, breedById, horsePose, isFoal, pasture, type HorsePose } from './horses';
import { Ground, H, TILE, W, generate } from './island';
import { setScene, sfx, unlockAudio } from './audio';
import { FURNITURE } from './furniture';
import { ROOM_H, doorOf, nearSpot, roomFree } from './interior';
import { Player } from './player';
import { absorb, httpApi, newPid, opId, request, type Other, type PendingOp, type Presence, type Shared } from './cloud';
import { CAN_GOAL, CROPS, Farm, RIPE, cropById, key as plotKey, type CropId } from './farm';
import { applyOp, farmUnder as farmUnderOf, link, tileFree as tileFreeOf, type Op } from './ops';
import { PERKS, levelProgress, questAt } from './progress';
import { BITE_WINDOW, FISH, GRILLED_ENERGY, biteDelay, rollFish, type Fish } from './fish';
import { RECIPES, TOOL_NAME, TUTORIAL, TUT_SEEDS, bagCraft, bagPick, craftBlock, newBag, recipeOf, tutAdvance, type ToolKind } from './craft';
import { newClock, rainSince, timeOf, type TimeOfDay } from './time';
import { MAX_SLOTS, activeSlot, addSlot, loadSave, removeSlot, writeSave, type Save, type Slot } from './save';
import type { Action, Fx } from './net/types';
import { showCoop, showCustomize, showHud, showMenu, showSettings, showSlots, textScale, type CraftData, type FestShopData, type Hud, type InvData, type KitchenData, type Need, type OrdersData, type ProjData, type ToolId, type TradeData, type VillagerData, type AlbumTab } from './ui';
import { PROJECTS, PROJ_ITEMS, islandHas, projProgress, siteOf, type ProjItem } from './projects';
import { COOK, knows, recipeById, isDish } from './cooking';
import { CUSTOMERS, SIZES, boardSpot, ordersToday } from './orders';
import { STORE_NAMES, storeHas, storeHasAll, storeName, DISH_IDS, type StoreItem } from './store';
import { BEET_COST, BUILDS, COACH_COST, ENLARGE, FIRE_COST, HOUSE_COST, HUT_COST, World, beetSnap, type BuildKind } from './world';
import { HOOF_SPEED, ROD_DELAY, ROD_WINDOW, SHOE_SPEED, UPGRADES, bagUpgrade, nextLevel, upLevel, upgradeBlock, type UpgradeId } from './upgrades';
import { BEST_FRIEND_COINS, MAX_HEARTS, SURPRISE, VILLAGERS, nextVillager, villagerById, wishOf, type Villager } from './villagers';
import { View } from './three/view';
import { horsePhoto } from './three/portrait';
import { decoPhoto, fishPhoto, furniturePhoto, hatPhoto, heartUrl, lazyIcons, seaPhoto, villagerPhoto } from './three/icons';
import { FEST_HAT, HATS } from './character';
import { FESTS, dayKey, festAt, seasonAt, today, type Fest } from './season';
import { festFindLeft, festFinds, festVisited, stallSpot } from './fest';
import { ALBUM_SHELLS, LETTERS, SHELLS, beachLeft, beachToday, shellById } from './beach';
import { CALENDAR, cleanDaily, dailyDone, dailyIndex, weeklyDeco, type DailyGift } from './daily';
import { warmHorse } from './three/horse';
import { STAR_AT, STAR_REWARDS, starParts, starScore, starsOf, type StarReward } from './stars';
import { ACHIEVEMENTS, TIERS, TIER_COINS, achievementById, goalText } from './achievements';

const screen = document.querySelector<HTMLCanvasElement>('#screen')!;
const ctx = screen.getContext('2d')!;

const island = generate();

// ---------- Spielfigur & was sich auf der Insel ändert ----------
let save: Save = loadSave();
/** aktuelle eigene Insel (Spielstand) */
const mySlot = () => activeSlot(save);
/** eigener Rucksack auf dieser Insel (Stöcke, Steine, Werkzeuge, Tutorial) */
const bag = () => (mySlot().bag ??= newBag());
const hasTool = (t: string) => t === 'seeds' || bag().tools.includes(t as ToolKind);
const world = new World(island, mySlot().world);
const farm = new Farm(island, mySlot().farm);
link(world, farm);
/** 3D-Ansicht (liegt unter der Schrift-Ebene) */
/** Jahreszeit (Aussehen der Insel) und Fest – nach dem Datum des Geräts */
const SEASON = seasonAt(today());
let curFest: Fest | null = festAt(today());
setInterval(() => (curFest = festAt(today())), 60_000);
const view = new View(island, world, farm, document.body, SEASON);
const START = { x: 176, y: 172 };
const player = new Player(island, world, START.x, START.y);
/** neue/alte Insel ohne Uhr: es ist 7 Uhr morgens */
const ensureClock = () => {
  if (!world.clock) world.clock = newClock(Date.now());
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
  if (!h || !st || i === riding || [...mates.values()].some((m) => m.in === -1 && m.rh === i)) return null;
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

// Bilder für Knöpfe und Fenster: Fotos der 3D-Modelle (entstehen beim ersten Gebrauch)
/** Pferd fürs Fenster und den Knopf */
function horseIcon(id: string, foal = false, acc = '') {
  return horsePhoto(breedById(id) ?? BREEDS[0], acc, foal);
}
const hearts: [string, string] = [heartUrl(true), heartUrl(false)];
const icons = lazyIcons({ horse: () => horseIcon('haflinger') });
const decoIcon = (id: string) => decoPhoto(id);

// ---------- Holzfällen ----------
let hud: Hud | null = null;
let actHeld = false;
let chopTarget = -1;
let tool: ToolId = 'axe';
/** Schwung (Sekunden, läuft rückwärts); swingTool = was gerade benutzt wird */
let swing = 0;
const SWING = 0.34;
let swingTool: ToolId | 'harvest' | 'refill' | 'cook' | 'rake' | 'pick' | 'shake' | 'beach' | 'festfind' = 'axe';
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
  pick: 'seed',
  craft: 'build',
  fruit: 'harvest',
  fish: 'water',
  project: 'level',
};
/** wie hoch der Text über dem Boden schwebt (Einheiten) */
const FX_H: Partial<Record<Fx['k'], number>> = { fell: 3.6, build: 3, horse: 2.8, feed: 2.8, brush: 2.8, foal: 2.6, trade: 2.4, can: 2.6, cook: 2.2, pick: 1.2, craft: 2.6, fruit: 3.2 };
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
  else if (fx.k === 'pick') burst(fx.x, fx.y, 1, 6, ['#fff3a0', '#ffffff', '#c8925a'], 16);
  else if (fx.k === 'project') {
    burst(fx.x, fx.y, 10, 40, ['#ffd23f', '#ff5a7a', '#6ad0ff', '#7cf08a', '#ffffff'], 50);
    view.firework(fx.x, fx.y - 6);
  } else if (fx.k === 'fish') burst(fx.x, fx.y, 1, 10, ['#ffffff', '#9fd8f0', '#4a8ad0'], 22);
  else if (fx.k === 'fruit') {
    // Baum/Busch wackelt, Obst purzelt herunter
    if (fx.tree !== undefined) shake.set(fx.tree, 1);
    const d = island.decor[fx.tree ?? -1];
    const bushy = d?.kind === 'bush';
    burst(fx.x, fx.y, bushy ? 6 : 20, bushy ? 8 : 10, bushy ? ['#9a6ad0', '#b884e8', '#5fae4e'] : [['#e0483e', '#ff9a3a', '#f4d04a'][(d?.variant ?? 0) % 3], '#5fae4e', '#6cc46a'], 22);
  }
  else if (fx.k === 'craft') burst(fx.x, fx.y, 8, 16, ['#ffd23f', '#ffffff', '#a9a6b2', '#c8925a'], 26);
  else if (fx.k === 'quest') hud?.toast(fx.text ?? 'Aufgabe geschafft!');
  else if (fx.k === 'level' && fx.n) hud?.levelUp(fx.n, PERKS.find((p) => p.level === fx.n)?.text);
  if (fx.k === 'quest' || fx.k === 'level') return;
  if (fx.text) floats.push({ x: fx.x, y: fx.y, h: FX_H[fx.k] ?? 1.6, text: fx.text, life: fx.k === 'can' ? 2.2 : 1.5 });
}
function emit(fx: Fx) {
  playFx(fx);
}
/** Aktion ausführen; liefert einen Hinweis bei Fehlschlag */
function perform(a: Action, actor: { x: number; y: number }): string | null {
  const op: Op = { a, x: Math.round(actor.x), y: Math.round(actor.y), t: Date.now() };
  const res = applyOp(world, farm, op);
  // was man aufhebt oder bastelt, landet im eigenen Rucksack
  if (a.kind === 'pick' && res.picked) bagPick(bag(), res.picked);
  if (a.kind === 'craft' && res.crafted) bagCraft(bag(), res.crafted);
  if (a.kind === 'upgrade' && res.done) bagUpgrade(bag(), a.item as UpgradeId);
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
      const cd = cropById(res.harvest.kind)!;
      emit({ k: 'harvest', x: cx, y: cy, text: `+${res.harvest.n} ${res.harvest.n === 1 ? cd.name : cd.plural}  +${res.harvest.seeds} Samen` });
      if (res.harvest.gotCan) emit({ k: 'can', x: actor.x, y: actor.y, text: 'Eisen-Gießkanne!' });
    } else if (a.kind === 'build') emit({ k: 'build', x: a.x ?? 0, y: a.y ?? 0, text: a.what === 'hut' ? `${villagerById(res.movedIn ?? '')?.name ?? 'Jemand'} zieht ein!` : a.what === 'beet' ? 'Hochbeet!' : a.what === 'coach' ? 'Kutschenhalt!' : a.what === 'fire' ? 'Lagerfeuer!' : a.what === 'stable' ? 'Pferdestall!' : a.what === 'paddock' ? 'Koppel!' : a.what === 'deco' ? `${decoById(a.item ?? '')?.name ?? 'Deko'} steht!` : 'Haus gebaut!' });
    else if (a.kind === 'adopt') {
      const st = world.stables[a.house ?? -1];
      const h = world.horses[world.horses.length - 1];
      if (st && h) emit({ k: 'horse', x: st.x, y: st.y + 4, text: `${h.name} zieht ein!` });
    } else if (a.kind === 'feed' || a.kind === 'brush') {
      const p = horseAt(a.horse ?? -1) ?? actor;
      emit({ k: a.kind, x: p.x, y: p.y, text: a.kind === 'brush' ? 'Glänzt! +1 Vertrauen' : a.item === 'turnip' || a.item === 'apple' ? 'Lecker! +1 Vertrauen' : 'Mampf! +1 Vertrauen' });
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
      const text = it.startsWith('horse:') && h ? `${h.name} zieht in den Stall!` : it === 'seeds' ? `+${SEED_PACK.n} Samen` : it.startsWith('seeds:') ? `+${cropById(it.slice(6))?.pack.n ?? 0} ${cropById(it.slice(6))?.seedName ?? 'Samen'}` : `${decoById(it.slice(5))?.name ?? 'Deko'} gekauft – im Bau-Menü aufstellen`;
      emit({ k: 'trade', x: actor.x, y: actor.y, text });
      if (it.startsWith('horse:')) emit({ k: 'horse', x: actor.x, y: actor.y });
    }
    else if (a.kind === 'cook') emit({ k: 'cook', x: actor.x, y: actor.y, text: `+1 ${recipeById(a.item ?? '')?.name ?? (a.item === 'fish' ? 'Bratfisch' : 'Ofenrübe')}` });
    else if (a.kind === 'pick' && res.picked) {
      const p = island.pickups[a.tree ?? -1];
      if (p) emit({ k: 'pick', x: p.x, y: p.y, text: res.picked === 'stick' ? '+1 Stock' : '+1 Stein' });
    } else if (a.kind === 'craft' && res.crafted) emit({ k: 'craft', x: actor.x, y: actor.y, text: `${recipeOf(res.crafted)?.name ?? 'Werkzeug'} gebastelt!` });
    else if (a.kind === 'beach' && res.beach) {
      const b = beachToday(island, islandDay(world.clock, op.t))[a.n ?? -1];
      const sh = shellById(res.beach.id);
      if (b) emit({ k: 'pick', x: b.x, y: b.y, text: res.beach.id === 'bottle' ? 'Flaschenpost!' : sh?.wood ? `+${sh.wood} Holz` : `${sh?.name ?? 'Schatz'}!` });
      if (res.beach.id === 'bottle' && res.beach.letter !== undefined) showLetter(res.beach.letter, res.beach.gift);
      else if (sh && !sh.wood && (world.treasures[sh.id] ?? 0) === 1 && sh.price >= 5) hud?.toast(`Neu im Album: ${sh.name}!`);
    } else if (a.kind === 'festfind' && curFest) {
      const p = festFinds(island, curFest.id, islandDay(world.clock, op.t))[a.n ?? -1];
      if (p) emit({ k: 'fruit', x: p.x, y: p.y, text: `+${curFest.find.gives} ${curFest.find.gives === 1 ? curFest.coin.one : curFest.coin.name}` });
    } else if (a.kind === 'shake' && res.fruit) {
      const d = island.decor[a.tree ?? -1];
      if (d) emit({ k: 'fruit', x: d.x, y: d.y, tree: a.tree, text: res.fruit.apples ? `+${res.fruit.apples} Äpfel` : `+${res.fruit.berries} Beeren` });
    }
  }
  // Aufgaben & Stufen
  for (const q of res.gain?.quests ?? []) {
    const reward = [q.seeds ? `+${q.seeds} Samen` : '', q.wood ? `+${q.wood} Holz` : '', q.coins ? `+${q.coins} Münzen` : '', `+${q.xp} EP`].filter(Boolean).join(' ');
    emit({ k: 'quest', x: actor.x, y: actor.y, text: `Aufgabe geschafft: ${q.text}! ${reward}` });
  }
  for (const n of res.gain?.levels ?? []) emit({ k: 'level', x: actor.x, y: actor.y, n });
  for (const al of res.album ?? []) emit({ k: 'quest', x: actor.x, y: actor.y, text: `Sammelalbum: ${al.at} Einträge! +${al.coins} Münzen` });
  // Erfolge: einzeln feiern, viele auf einmal (rückwirkend) zusammen
  const ach = res.achieved ?? [];
  if (ach.length > 3) emit({ k: 'quest', x: actor.x, y: actor.y, text: `${ach.length} Erfolge geschafft! +${ach.reduce((s, x) => s + TIER_COINS[x.tier - 1], 0)} Münzen – schau ins Album` });
  else for (const x of ach) emit({ k: 'quest', x: actor.x, y: actor.y, text: `Erfolg „${achievementById(x.id)?.name}“ – ${TIERS[x.tier - 1]}! +${TIER_COINS[x.tier - 1]} Münzen` });
  if (res.stars?.length) starCard(res.stars[res.stars.length - 1], res.stars);
  // gemeinsame Insel: Aktion fürs Protokoll merken (beim Fällen nur das Umfallen) und bald schicken
  if (cloudOn() && (a.kind === 'axe' ? res.felled : res.done)) {
    const sl = mySlot();
    (sl.pending ??= []).push({ ...(a.kind === 'axe' ? { ...op, a: { ...a, fell: true } } : op), id: opId(pid) });
    syncSoon = true;
  }
  syncHud();
  persist();
  if (res.picked || res.crafted) tutorialStep();
  if (res.movedIn) folkWelcome(res.movedIn);
  if (res.festItem?.kind === 'hat') unlockHat(res.festItem.id);
  return res.err;
}
/** neuer Insel-Stern: feiern und zeigen, was es gibt */
function starCard(n: number, all: number[]) {
  const rw = all.map((k) => STAR_REWARDS[k - 1]);
  const deco = rw.find((r) => r.deco)?.deco;
  setTimeout(() => {
    sfx('quest');
    hud?.intro(
      {
        title: `${'★'.repeat(n)} Deine Insel hat ${n === 1 ? 'einen Stern' : `${n} Sterne`}!`,
        text: n >= 5 ? 'Alle fünf Sterne – deine Insel ist ein Traum!' : 'Deine Insel wird immer schöner. Tipp auf die Sterne oben, um zu sehen, was noch fehlt.',
        steps: [{ img: deco ? decoIcon(deco) : icons.coin, text: `Geschenk: ${rw.map(starRewardText).join(', ')}${deco ? ' – im Bau-Menü aufstellen' : ''}` }],
        ok: 'Juhu!',
      },
      () => sfx('click'),
    );
  }, 900);
}
/** eigenes Tutorial weiterzählen; am Ende 3 Rübensamen für die Insel */
function tutorialStep() {
  const b = bag();
  const steps = tutAdvance(b);
  if (steps.length) writeSave(save);
  for (const n of steps) {
    sfx('quest');
    if (n < TUTORIAL.length - 1) hud?.toast(`Geschafft: ${TUTORIAL[n].text}! Weiter: ${TUTORIAL[n + 1].text}`);
  }
  if (b.tut < TUTORIAL.length || b.paid) return syncHud();
  b.paid = true;
  doAction({ kind: 'tut' });
  floats.push({ x: player.x, y: player.y, h: 2.6, text: `+${TUT_SEEDS} Rübensamen`, life: 2.2 });
  hud?.intro(
    {
      title: 'Super gemacht!',
      text: `Du hast dir dein erstes Werkzeug gebastelt. Als Belohnung bekommst du ${TUT_SEEDS} Rübensamen.`,
      steps: [
        { img: icons.axe, text: 'Mit der Axt fällst du Bäume – das gibt Holz zum Bauen.' },
        { img: icons.hoe, text: 'Mit der Hacke legst du Felder an.' },
        { img: icons.seeds, text: 'Dann säst du deine Rüben. Oben steht immer die nächste Aufgabe der Insel.' },
        { img: icons.craft, text: 'Darunter steht das Insel-Projekt: Bring Holz, Steine & Co. und bau die Insel Stück für Stück aus.' },
      ],
      ok: 'Weiter',
    },
    () => sfx('click'),
  );
}
/** eigene Aktion gleich ausführen (bei gemeinsamen Inseln kommt sie ins Protokoll) */
function doAction(a: Action) {
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
type Intent = ToolId | 'harvest' | 'refill' | 'cook' | 'rake' | 'pick' | 'shake' | 'beach' | 'festfind' | 'fest' | 'fish' | 'project' | 'orders' | 'villager' | 'coach' | 'trade' | 'enter' | 'exit' | 'sleep' | 'chest' | 'furnish' | 'stable' | 'horse' | 'dismount' | null;
/** Stock/Stein direkt bei der Figur (Nummer in island.pickups) */
/** Strandgut direkt bei der Figur (Nummer des Tages, -1 = nichts) */
function beachNear() {
  const day = islandDay(world.clock, Date.now());
  let best = -1;
  let bestD = 12;
  beachToday(island, day).forEach((b, i) => {
    const d = Math.hypot(b.x - player.x, (b.y - player.y) * 1.4);
    if (d >= bestD || !beachLeft(world, i, day) || world.builtAt(b.x, b.y, 2, 2)) return;
    bestD = d;
    best = i;
  });
  return best;
}
/** Kürbis/Geschenk direkt bei der Figur */
function festNear() {
  if (!curFest) return -1;
  const day = islandDay(world.clock, Date.now());
  let best = -1;
  let bestD = 13;
  festFinds(island, curFest.id, day).forEach((p, i) => {
    const d = Math.hypot(p.x - player.x, (p.y - player.y) * 1.4);
    if (d >= bestD || !festFindLeft(world, curFest!.id, i, day) || world.builtAt(p.x, p.y, 2, 2)) return;
    bestD = d;
    best = i;
  });
  return best;
}
function pickNear() {
  let best = -1;
  let bestD = 11;
  island.pickups.forEach((p, i) => {
    const d = Math.hypot(p.x - player.x, (p.y - player.y) * 1.4);
    if (d >= bestD || !world.pickable(i) || farm.plot(...Farm.tileAt(p.x, p.y))) return;
    bestD = d;
    best = i;
  });
  return best;
}
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
    have: { ...Object.fromEntries(CROPS.map((cd) => [`crop:${cd.id}`, farm.cropsOf(cd.id)])), turnip: farm.turnips, meal: farm.meals, wood: world.wood, hay: farm.hay, apple: world.apples, berry: world.berries, ...Object.fromEntries(FISH.map((f) => [`fish:${f.id}`, world.fish[f.id] ?? 0])), ...Object.fromEntries(DISH_IDS.map((id) => [`dish:${id}`, world.dishes[id] ?? 0])), ...Object.fromEntries(SHELLS.map((x) => [`sea:${x.id}`, world.treasures[x.id] ?? 0])) },
    sell: [
      ...(Object.keys(SELL) as SellItem[]).map((id) => ({ id, name: SELL_NAMES[id], price: SELL[id], img: id === 'wood' ? icons.log : id === 'meal' ? icons.meal : id === 'hay' ? icons.hay : id === 'apple' ? icons.apple : id === 'berry' ? icons.berry : icons.turnip })),
      // Fische und Gerichte nur, wenn man welche hat
      ...FISH.filter((f) => f.price && world.fish[f.id]).map((f) => ({ id: `fish:${f.id}`, name: f.name, price: f.price, img: fishPhoto(f.id) })),
      ...DISH_IDS.filter((id) => world.dishes[id]).map((id) => ({ id: `dish:${id}`, name: recipeById(id)!.name, price: recipeById(id)!.price, img: icons[id] })),
      ...SHELLS.filter((x) => x.price && world.treasures[x.id]).map((x) => ({ id: `sea:${x.id}`, name: x.name, price: x.price, img: seaPhoto(x.id) })),
      ...CROPS.filter((cd) => cd.id !== 'turnip' && farm.cropsOf(cd.id)).map((cd) => ({ id: `crop:${cd.id}`, name: cd.name, price: cd.price, img: storeImg(cd.id as StoreItem) })),
    ],
    seeds: CROPS.map((cd) => ({
      id: cd.id === 'turnip' ? 'seeds' : `seeds:${cd.id}`,
      name: `${cd.pack.n} ${cd.seedName}`,
      text: cd.id === 'turnip' ? 'Rüben – die gute alte Sorte.' : cropText(cd.id),
      price: cd.id === 'turnip' ? SEED_PACK.price : cd.pack.price,
      img: seedImg(cd.id),
      block: world.level < cd.level ? `ab Insel-Stufe ${cd.level}` : null,
    })),
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
/** Bild zu einem Erfolg */
const ACH_IMG: Record<string, () => string> = {
  felled: () => icons.axe,
  harvest: () => icons.turnip,
  water: () => icons.can,
  kinds: () => icons.carrot,
  fruit: () => icons.apple,
  hay: () => icons.hay,
  fish: () => fishPhoto('hering'),
  species: () => fishPhoto('goldfisch'),
  cook: () => icons.meal,
  orders: () => icons.board,
  care: () => icons.horse,
  wishes: () => villagerPhoto('hase'),
  friends: () => villagerPhoto('baer'),
  beach: () => seaPhoto('seestern'),
  letters: () => icons.bottle,
  projects: () => icons.craft,
  album: () => icons.book,
  fest: () => icons.candy,
  stars: () => decoIcon('starstatue'),
};
function starRewardText(r: StarReward) {
  return [`${r.coins} Münzen`, r.wood ? `${r.wood} Holz` : '', r.deco ? decoById(r.deco)?.name ?? '' : ''].filter(Boolean).join(' + ');
}
function openAlbum(tab?: AlbumTab) {
  const pic = (id: string) => horseIcon(id);
  const score = starScore(world, farm);
  const n = starsOf(score);
  hud?.openAlbum({
    sections: [
      { title: 'Pferderassen', items: STABLE_BREEDS.map((b) => ({ name: b.name, img: pic(b.id), has: world.album.horses.includes(b.id) })) },
      { title: 'Seltene Pferde', items: RARE_BREEDS.map((b) => ({ name: b.name, img: pic(b.id), has: world.album.horses.includes(b.id), rare: true })) },
      { title: 'Deko', items: [...DECO, ...STAR_DECO].map((d) => ({ name: d.name, img: decoIcon(d.id), has: world.album.deco.includes(d.id), rare: STAR_DECO.some((x) => x.id === d.id) })) },
      { title: 'Fische', items: FISH.map((f) => ({ name: f.name, img: fishPhoto(f.id), has: (world.album.fish ?? []).includes(f.id), rare: !f.cook && f.price > 0 })) },
      { title: 'Bewohner', items: VILLAGERS.map((v) => ({ name: v.name, img: villagerPhoto(v.id), has: (world.album.folk ?? []).includes(v.id) })) },
      { title: 'Ernte', items: CROPS.map((cd) => ({ name: cd.name, img: storeImg(cd.id as StoreItem), has: (world.album.crops ?? []).includes(cd.id) })) },
      { title: 'Strandgut', items: ALBUM_SHELLS.map((x) => ({ name: x.name, img: seaPhoto(x.id), has: (world.album.sea ?? []).includes(x.id), rare: x.price >= 10 })) },
      ...FESTS.map((f) => ({
        title: f.name,
        items: f.shop.map((it) => {
          const no = Number(Object.entries(FEST_HAT).find(([, h]) => h === it.id)?.[0] ?? -1);
          return { name: it.name, img: it.kind === 'hat' ? hatPhoto(no) : decoIcon(it.id), has: world.album.deco.includes(it.id), rare: it.kind === 'hat' };
        }),
      })),
    ],
    count: albumCount(world.album),
    total: ALBUM_TOTAL,
    rewards: ALBUM_REWARDS.map((r, i) => ({ ...r, got: i < world.albumClaimed })),
    ach: ACHIEVEMENTS.map((a) => {
      const tier = world.achieved[a.id] ?? 0;
      return { name: a.name, text: goalText(a, tier), img: ACH_IMG[a.id]?.() ?? icons.book, tier, value: a.value(world, farm), goal: a.goals[Math.min(2, tier)] };
    }),
    stars: {
      n,
      score,
      next: STAR_AT[n] ?? null,
      parts: starParts(world, farm),
      rewards: STAR_REWARDS.map((r, i) => ({ n: i + 1, text: starRewardText(r), img: r.deco ? decoIcon(r.deco) : icons.coin, got: i < world.starsClaimed })),
    },
  }, tab);
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
    const sp = nearSpot(player.x, player.y, world.houses[inside]?.furn, !!world.houses[inside]?.big);
    const k = sp ? (sp.kind === 'bed' ? 'sleep' : sp.kind === 'door' ? 'exit' : sp.kind === 'chest' ? 'chest' : 'furnish') : null;
    return { kind: k, tree: sp?.kind === 'slot' ? sp.slot : -1, tile };
  }
  if (riding >= 0) return { kind: 'dismount', tree: riding, tile };
  if (doorAhead() >= 0) return { kind: 'enter', tree: doorAhead(), tile };
  if (boatNear()) return { kind: 'trade', tree: -1, tile };
  // Insel-Projekte: Baustelle (abgeben), fertiger Marktstand (verkaufen), Brunnen (Kübel füllen)
  const ps = projectNear();
  if (ps === world.proj.n && PROJECTS[ps]) return { kind: 'project', tree: ps, tile };
  if (ps === 1 && world.projDone(1)) return { kind: 'trade', tree: -1, tile };
  if (ps === 0 && world.projDone(0) && tool === 'water' && hasTool('water') && farm.water < farm.capacity) return { kind: 'refill', tree: -1, tile };
  const sd = stableDoorAhead();
  if (sd >= 0) return { kind: 'stable', tree: sd, tile };
  const hn = horseNear();
  if (hn >= 0) return { kind: 'horse', tree: hn, tile };
  const vn = villagerNear();
  if (vn >= 0) return { kind: 'villager', tree: vn, tile };
  const cn = coachNear();
  if (cn >= 0) return { kind: 'coach', tree: cn, tile };
  const p = farm.plot(...tile);
  if (p?.crop && p.crop.stage >= RIPE) return { kind: 'harvest', tree: -1, tile };
  // trockenes Heu liegt vor einem: einsammeln
  if (farm.mown(...tile, Date.now()) === 'dry') return { kind: 'rake', tree: -1, tile };
  // am Lagerfeuer: Kochfenster
  if (world.fireNear(player.x, player.y, 20) >= 0) return { kind: 'cook', tree: -1, tile };
  // am Bestellbrett
  if (Math.hypot(BOARD.x - player.x, (BOARD.y - player.y) * 1.3) < 14) return { kind: 'orders', tree: -1, tile };
  // Festladen am Steg
  if (curFest) {
    const sp = stallSpot(island);
    if (Math.hypot(sp.x - player.x, (sp.y - player.y) * 1.2) < 19) return { kind: 'fest', tree: -1, tile };
  }
  // Strandgut und Fest-Fundstücke vor den Füßen
  const bn = beachNear();
  if (bn >= 0) return { kind: 'beach', tree: bn, tile };
  const fn = festNear();
  if (fn >= 0) return { kind: 'festfind', tree: fn, tile };
  // Stock oder Stein vor den Füßen: aufheben
  const pk = pickNear();
  if (pk >= 0) return { kind: 'pick', tree: pk, tile };
  // Obstbaum oder Beerenbusch mit Früchten: schütteln/pflücken (auch ohne Werkzeug)
  const ft = world.fruitTarget(player.x, player.y);
  if (ft >= 0) return { kind: 'shake', tree: ft, tile };
  // mit der Angel am Wasser (Kübel auffüllen geht vor, wenn er in der Hand und nicht voll ist)
  if (hasTool('rod') && !(tool === 'water' && hasTool('water') && farm.water < farm.capacity) && bobberSpot()) return { kind: 'fish', tree: -1, tile };
  if (!hasTool(tool)) return { kind: null, tree: -1, tile };
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
  if (tool === 'seeds') return { kind: p && !p.crop && farm.seedsOf(seedKind) > 0 ? 'seeds' : null, tree: -1, tile };
  if (facingWater() && farm.water < farm.capacity) return { kind: 'refill', tree: -1, tile };
  return { kind: p && !p.wetAt && farm.water > 0 ? 'water' : null, tree: -1, tile };
}
// ---------- Samen-Sorten ----------
/** welche Sorte gerade gesät wird (gehört dem Gerät) */
let seedKind: CropId = 'turnip';
const seedImg = (k: CropId) => (k === 'carrot' ? icons.seedsCarrot : k === 'strawberry' ? icons.seedsStrawberry : k === 'pumpkin' ? icons.seedsPumpkin : icons.seeds);
/** kurz erklärt: wie schnell, wie viel */
function cropText(k: CropId) {
  const cd = cropById(k)!;
  const speed = cd.grow < 0.9 ? 'Wächst schnell' : cd.grow > 1.4 ? 'Braucht lange' : 'Wächst normal';
  return `${speed}${cd.yield > 1 ? `, gibt ${cd.yield} auf einmal` : ''} – Händler zahlt ${cd.price} Münzen${cd.yield > 1 ? ' pro Stück' : ''}.`;
}
/** Sorten, die man hat oder schon mal hatte */
const seedKinds = () => CROPS.map((cd) => cd.id).filter((k) => k === 'turnip' || farm.seedsOf(k) > 0 || (world.album.crops ?? []).includes(k));
function openSeeds() {
  sfx('click');
  hud?.openSeeds(
    seedKinds().map((k) => ({ id: k, name: cropById(k)!.seedName, img: seedImg(k), n: farm.seedsOf(k), text: k === 'turnip' ? 'Die gute alte Rübe.' : cropText(k), on: k === seedKind })),
    (id) => {
      seedKind = id as CropId;
      hud?.setTool('seeds');
      syncHud();
    },
  );
}
const toolHint: Record<ToolId, string> = {
  axe: 'Geh näher an einen Baum',
  hoe: 'Stell dich vor ein freies Stück Wiese',
  seeds: 'Stell dich vor ein leeres Feld',
  water: 'Stell dich vor ein trockenes Feld',
  scythe: 'Stell dich vor ein Stück Wiese zum Mähen',
};
// ---------- Energie ----------
/** Energie kostet jede Arbeit; Ausruhen, Essen und Schlafen füllen sie auf (Bauen kostet nur Holz) */
const COST: Partial<Record<Action['kind'], number>> = { axe: 1, hoe: 2, seeds: 1, water: 1, mow: 1, fish: 1 };
/** so viele Sekunden ausruhen (stehen bleiben) für +1 Energie; beim Laufen langsamer */
const REST_STEP = 2;
let restT = 0;
let workAt = 0;
const FOOD = { raw: 12, cooked: 40, apple: 8, berry: 4, grilled: GRILLED_ENERGY, carrot: cropById('carrot')!.energy, strawberry: cropById('strawberry')!.energy };
type Food = keyof typeof FOOD;
/** Kraft je Gericht (aus den Rezepten) */
const dishEnergy = (id: string) => recipeById(id)?.energy ?? 20;
/** Energie gehört zur Insel: neue oder gelöschte Insel = wieder ausgeruht */
const energy = () => mySlot().energy ?? 100;
function setEnergy(v: number) {
  const e = Math.max(0, Math.min(100, Math.round(v * 10) / 10));
  mySlot().energy = e;
  hud?.setEnergy(e);
  player.speedMul = e < 15 ? 0.6 : 1;
}
/** genug Kraft? sonst Hinweis */
function spend(kind: Action['kind']) {
  const c = COST[kind] ?? 0;
  if (!c) return true;
  if (energy() < c) {
    actHeld = false;
    hud?.toast('Du bist erschöpft – kurz stehen bleiben und ausruhen, Obst oder eine Rübe essen oder im Haus schlafen');
    return false;
  }
  workAt = performance.now();
  setEnergy(energy() - c);
  return true;
}
function eat(what: Food | string) {
  if (isDish(what)) {
    if (!((world.dishes[what] ?? 0) > 0)) return hud?.toast(`Kein ${recipeById(what)?.name ?? 'Essen'} mehr`);
    if (energy() >= 100) return hud?.toast('Du bist satt');
    const err = doAction({ kind: 'eat', item: what });
    if (err) return hud?.toast(err);
    setEnergy(energy() + dishEnergy(what));
    sfx('eat');
    floats.push({ x: player.x, y: player.y, h: 2.3, text: `+${dishEnergy(what)} Energie`, life: 1.3 });
    return writeSave(save);
  }
  if (!(what in FOOD)) return;
  const have = { raw: farm.turnips, cooked: farm.meals, apple: world.apples, berry: world.berries, grilled: world.grilled, carrot: farm.cropsOf('carrot'), strawberry: farm.cropsOf('strawberry') }[what as Food];
  const none = {
    raw: 'Keine Rüben – ernte erst welche',
    cooked: 'Keine Ofenrüben – brat Rüben am Lagerfeuer',
    apple: 'Keine Äpfel – rüttel an einem Obstbaum',
    berry: 'Keine Beeren – pflück welche vom Beerenbusch',
    grilled: 'Kein Bratfisch – brat einen Fisch am Lagerfeuer',
    carrot: 'Keine Karotten – ernte erst welche',
    strawberry: 'Keine Erdbeeren – ernte erst welche',
  };
  if (have <= 0) return hud?.toast(none[what as Food]);
  if (energy() >= 100) return hud?.toast('Du bist satt');
  const f = what as Food;
  const err = doAction(f === 'raw' || f === 'cooked' ? { kind: 'eat', cooked: f === 'cooked' } : { kind: 'eat', item: f });
  if (err) return hud?.toast(err);
  setEnergy(energy() + FOOD[f]);
  sfx('eat');
  floats.push({ x: player.x, y: player.y, h: 2.3, text: `+${FOOD[f]} Energie`, life: 1.3 });
  writeSave(save);
}

function useTool() {
  const [c, r] = swingTile;
  const kind = swingTool === 'scythe' ? 'mow' : swingTool;
  if (!spend(kind)) return;
  // nach Ernten/Auffüllen nicht gleich weitermachen – erst loslassen
  if (swingTool === 'harvest' || swingTool === 'refill' || swingTool === 'cook' || swingTool === 'rake' || swingTool === 'shake' || swingTool === 'beach' || swingTool === 'festfind') actHeld = false;
  if (kind === 'beach') return void doAction({ kind: 'beach', n: chopTarget });
  if (kind === 'festfind') {
    if (!curFest) return;
    return void doAction({ kind: 'festfind', item: curFest.id, n: chopTarget });
  }
  // Axt: ihre Stufe fällt schneller (wird beim Abgleich mitgeschickt)
  const err = doAction({ kind, c, r, tree: chopTarget, ...(kind === 'axe' ? { n: upLevel(bag(), 'axe') } : {}), ...(kind === 'seeds' && seedKind !== 'turnip' ? { item: seedKind } : {}) });
  if (err) return hud?.toast(err);
  // verbesserte Hacke, Brause und Sense schaffen mehrere Felder auf einmal
  for (const [ec, er] of extraTiles(kind, c, r)) {
    if (kind === 'hoe' && (farm.plot(ec, er) || !tileFree(ec, er))) continue;
    if (kind === 'water') {
      const p = farm.plot(ec, er);
      if (!p || p.wetAt || (p.crop && p.crop.stage >= RIPE)) continue;
      if (farm.water <= 0) break;
    }
    if (kind === 'mow' && (farm.plot(ec, er) || farm.meadow.has(plotKey(ec, er)))) continue;
    doAction({ kind, c: ec, r: er });
  }
}
/** Kacheln, die ein verbessertes Werkzeug zusätzlich schafft (Hacke/Gießen: weiter nach vorn, Sense: daneben) */
function extraTiles(kind: Action['kind'], c: number, r: number): [number, number][] {
  const step: Record<Dir, [number, number]> = { [Dir.Down]: [0, 1], [Dir.Up]: [0, -1], [Dir.Right]: [1, 0], [Dir.Left]: [-1, 0] };
  const [dx, dy] = step[player.dir];
  const out: [number, number][] = [];
  if (kind === 'hoe' || kind === 'water') {
    const lv = upLevel(bag(), kind);
    for (let k = 1; k <= lv; k++) out.push([c + dx * k, r + dy * k]);
  } else if (kind === 'mow') {
    const lv = upLevel(bag(), 'scythe');
    if (lv >= 1) out.push([c - dy, r - dx], [c + dy, r + dx]);
    if (lv >= 2) out.push([c + dx, r + dy], [c + dx - dy, r + dy - dx], [c + dx + dy, r + dy + dx]);
  }
  return out;
}

// ---------- Angeln ----------
/** Pose im Wasser; bite = wann es zuckt; fish = was beißt (beim Auswerfen gewürfelt) */
let fishing: { x: number; y: number; bite: number; bit: boolean; fish: Fish } | null = null;
function onDock() {
  const d = island.dock;
  return player.x > d.x - 2 && player.x < d.x + d.w + 2 && player.y > d.y - 4;
}
/** wohin die Pose fliegt (vor der Figur ins Wasser), null = kein Wasser */
function bobberSpot() {
  if (inside >= 0 || riding >= 0) return null;
  const off: Record<Dir, [number, number]> = { [Dir.Down]: [0, 1], [Dir.Up]: [0, -1], [Dir.Right]: [1, 0], [Dir.Left]: [-1, 0] };
  const [dx, dy] = off[player.dir];
  for (const d of [26, 20, 15]) {
    const x = Math.round(player.x + dx * d);
    const y = Math.round(player.y + dy * d - (dy ? 0 : 2));
    const water = x < 0 || y < 0 || x >= W || y >= H || island.ground[y * W + x] === Ground.Water;
    // auf dem Steg selbst nicht
    const dk = island.dock;
    const onPlanks = x > dk.x && x < dk.x + dk.w && y > dk.y && y < dk.y + dk.h;
    if (water && !onPlanks) return { x, y };
  }
  return null;
}
function cast() {
  const spot = bobberSpot();
  if (!spot) return hud?.toast('Stell dich direkt ans Wasser');
  if (!spend('fish')) return;
  const night = !!tod && tod.dark > 0.5;
  const rod = upLevel(bag(), 'rod');
  fishing = { ...spot, bite: Date.now() + biteDelay(Math.random, !!tod?.rain) * ROD_DELAY[rod], bit: false, fish: rollFish(Math.random, { night, dock: onDock() || world.projDone(3), lucky: rod >= 2 }) };
  workAt = performance.now();
  sfx('water');
  burst(spot.x, spot.y, 0, 6, ['#ffffff', '#9fd8f0'], 12);
}
function stopFishing(msg?: string) {
  fishing = null;
  hud?.setBite(false);
  if (msg) hud?.toast(msg);
}
function reel() {
  const f = fishing!;
  if (Date.now() < f.bite) {
    sfx('nope');
    return stopFishing('Zu früh – es hat noch nichts gebissen');
  }
  stopFishing();
  const first = !(world.album.fish ?? []).includes(f.fish.id);
  const err = doAction({ kind: 'fish', item: f.fish.id });
  if (err) return hud?.toast(err);
  burst(f.x, f.y, 2, 16, ['#ffffff', '#9fd8f0', f.fish.colors[0]], 30);
  floats.push({ x: player.x, y: player.y, h: 2.6, text: f.fish.id === 'stiefel' ? 'Ein alter Stiefel …' : `${f.fish.name}!`, life: 1.8 });
  sfx(first ? 'quest' : 'harvest');
  if (first)
    hud?.intro(
      {
        title: f.fish.id === 'stiefel' ? 'Oh, ein Stiefel!' : `Neuer Fisch: ${f.fish.name}!`,
        text: f.fish.text,
        steps: [{ img: fishPhoto(f.fish.id), text: f.fish.cook ? 'Steht jetzt im Sammelalbum. Am Lagerfeuer kannst du Fische braten.' : 'Steht jetzt im Sammelalbum. Der Händler zahlt gut dafür!' }],
        ok: 'Super',
      },
      () => sfx('click'),
    );
}
/** Tippen auf den grünen Knopf: auswerfen bzw. einholen (true = erledigt) */
function fishTap() {
  if (fishing) {
    reel();
    return true;
  }
  if (mode === 'play' && !placing && swing <= 0 && intent().kind === 'fish') {
    cast();
    return true;
  }
  return false;
}
function updateFishing(now: number) {
  if (!fishing) return;
  if (Math.hypot(moveIn[0], moveIn[1]) > 0.3 || inside >= 0 || riding >= 0 || mode !== 'play') return stopFishing();
  if (!fishing.bit && now >= fishing.bite) {
    fishing.bit = true;
    hud?.setBite(true);
    sfx('water');
    navigator.vibrate?.(80);
    burst(fishing.x, fishing.y, 0, 8, ['#ffffff', '#9fd8f0'], 18);
  }
  if (fishing.bit && now > fishing.bite + BITE_WINDOW + ROD_WINDOW[upLevel(bag(), 'rod')]) stopFishing('Weggeschwommen … wirf nochmal aus!');
}
// ---------- Rucksack (Inventar) ----------
let invUI: { update(d: InvData): void; close(): void } | null = null;
const TOOL_TEXT: Record<ToolKind, string> = {
  axe: 'Bäume fällen – das gibt Holz.',
  hoe: 'Aus Wiese Felder hacken.',
  water: 'Felder gießen; am Wasser auffüllen.',
  scythe: 'Wiese mähen – trocknet zu Heu.',
  rod: 'Am Wasser auswerfen, beim Zucken schnell tippen.',
};
function invData(): InvData {
  const b = bag();
  const food = (id: Food, name: string, img: string, n: number, text: string) => ({ id: `food:${id}`, name, img, n, text: `${text} +${FOOD[id]} Kraft.`, acts: [{ id: 'eat', label: 'Essen' }] });
  const tools = RECIPES.filter((r) => b.tools.includes(r.id)).map((r) => ({
    id: `tool:${r.id}`,
    name: (r.id === 'water' && farm.hasCan ? 'Eisen-Gießkanne' : r.name) + (upLevel(b, r.id) ? ` · ${UPGRADES.find((u) => u.id === r.id)!.levels[upLevel(b, r.id) - 1].name}` : ''),
    img: r.id === 'water' ? (farm.hasCan ? icons.can : icons.bucket) : icons[r.id],
    text: TOOL_TEXT[r.id] + (r.id === 'water' ? ` Gerade ${farm.water}/${farm.capacity} voll.` : ''),
    acts: r.id === 'rod' ? [] : [{ id: 'hold', label: tool === r.id ? 'In der Hand' : 'In die Hand' }],
    on: tool === r.id,
  }));
  const mat = [
    { id: 'mat:wood', name: 'Holz', img: icons.log, n: world.wood, text: 'Zum Bauen und Basteln.', acts: [] },
    { id: 'mat:sticks', name: 'Stöcke', img: icons.stick, n: b.sticks, text: 'Zum Basteln. Liegen auf der Wiese.', acts: [] },
    { id: 'mat:stones', name: 'Steine', img: icons.stone, n: b.stones, text: 'Zum Basteln. Liegen am Strand.', acts: [] },
    ...CROPS.map((cd) => ({ id: `seed:${cd.id}`, name: cd.seedName, img: seedImg(cd.id), n: farm.seedsOf(cd.id), text: `Auf gehackte Felder säen.${cd.id === 'turnip' ? '' : ` ${cropText(cd.id)}`}`, acts: [{ id: 'hold', label: tool === 'seeds' && seedKind === cd.id ? 'In der Hand' : 'In die Hand' }], on: tool === 'seeds' && seedKind === cd.id })),
    { id: 'mat:hay', name: 'Heu', img: icons.hay, n: farm.hay, text: 'Pferdefutter – von gemähter, getrockneter Wiese.', acts: [] },
  ].filter((i) => i.n > 0);
  const foods = [
    food('raw', 'Rübe', icons.turnip, farm.turnips, 'Roh essen oder am Lagerfeuer braten.'),
    food('cooked', 'Ofenrübe', icons.meal, farm.meals, 'Am Lagerfeuer gebraten.'),
    food('apple', 'Apfel', icons.apple, world.apples, 'Frisch vom Baum – Pferde lieben Äpfel.'),
    food('berry', 'Beeren', icons.berry, world.berries, 'Süß und klein.'),
    food('grilled', 'Bratfisch', icons.grilled, world.grilled, 'Am Lagerfeuer gebraten.'),
    food('carrot', 'Karotten', icons.carrot, farm.cropsOf('carrot'), 'Knackig – roh essen oder zu Karottenkuchen backen.'),
    food('strawberry', 'Erdbeeren', icons.strawberry, farm.cropsOf('strawberry'), 'Süß und rot – für die Erdbeertorte.'),
    ...(farm.cropsOf('pumpkin') ? [{ id: 'crop:pumpkin', name: 'Kürbisse', img: icons.pumpkin, n: farm.cropsOf('pumpkin'), text: 'Zu groß zum Abbeißen – koch eine Kürbissuppe oder verkauf ihn teuer.', acts: [] }] : []),
    ...DISH_IDS.map((id) => ({ id: `dish:${id}`, name: recipeById(id)!.name, img: icons[id], n: world.dishes[id] ?? 0, text: `${recipeById(id)!.text} +${dishEnergy(id)} Kraft.`, acts: [{ id: 'eat', label: 'Essen' }] })),
  ].filter((i) => i.n > 0);
  const fish = FISH.filter((f) => world.fish[f.id]).map((f) => ({
    id: `fish:${f.id}`,
    name: f.name,
    img: fishPhoto(f.id),
    n: world.fish[f.id],
    text: `${f.text}${f.cook ? ' Am Lagerfeuer braten.' : ''}${f.price ? ` Händler zahlt ${f.price} Münzen.` : ''}`,
    acts: [],
  }));
  const sea = SHELLS.filter((x) => world.treasures[x.id]).map((x) => ({
    id: `sea:${x.id}`,
    name: x.name,
    img: seaPhoto(x.id),
    n: world.treasures[x.id],
    text: `${x.text} Händler zahlt ${x.price} Münzen.`,
    acts: [],
  }));
  // Fest-Währung (Bonbons, Plätzchen) – auch nach dem Fest
  for (const f of FESTS)
    if (world.fest.coins[f.id])
      sea.push({ id: `fest:${f.id}`, name: f.coin.name, img: f.id === 'winter' ? icons.cookie : icons.candy, n: world.fest.coins[f.id]!, text: `Zum Eintauschen am Stand beim Steg (${f.name}).`, acts: [] });
  const decos = Object.entries(world.decoInv)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => ({ id: `deco:${id}`, name: decoById(id)?.name ?? id, img: decoIcon(id), n, text: 'Gekauft beim Händler – stell es auf deiner Insel auf.', acts: [{ id: 'place', label: 'Aufstellen' }] }));
  const sl = mySlot();
  return {
    head: `Kraft ${Math.round(energy())}/100 · ${world.coins} Münzen`,
    note: sl.shared ? 'Werkzeug, Stöcke und Steine gehören dir – alles andere teilt ihr euch auf der Insel.' : undefined,
    sections: [
      { title: 'Werkzeug', empty: 'Noch keins – tipp auf „Basteln“.', items: tools },
      { title: 'Essen', empty: 'Nichts zu essen – rüttel an Obstbäumen oder pflück Beeren.', items: foods },
      { title: 'Material', empty: 'Noch nichts gesammelt.', items: mat },
      ...(fish.length ? [{ title: 'Fische', items: fish }] : []),
      ...(sea.length ? [{ title: 'Strandgut', items: sea }] : []),
      ...(decos.length ? [{ title: 'Deko', items: decos }] : []),
    ],
  };
}
function openInventory() {
  sfx('click');
  invUI = hud?.openInventory(invData(), (item, action) => {
    const [kind, id] = item.split(':');
    if (action === 'eat') eat(id);
    else if (action === 'hold') {
      const t = (kind === 'seed' ? 'seeds' : id) as ToolId;
      if (kind === 'seed') seedKind = id as CropId;
      tool = t;
      hud?.setTool(t);
      sfx('click');
      invUI?.close();
    } else if (action === 'place') {
      invUI?.close();
      startPlacing('deco', id);
    }
    invUI?.update(invData());
  }) ?? null;
}

// ---------- Kochen & Bestellbrett ----------
const BOARD = boardSpot(island);
let kitchenUI: { update(d: KitchenData): void } | null = null;
let ordersUI: { update(d: OrdersData): void } | null = null;
/** Bild zu einer Ware */
const storeImg = (item: StoreItem): string =>
  item === 'wood' ? icons.log : item === 'turnip' ? icons.turnip : item === 'fish' ? fishPhoto('hering') : item === 'meal' ? icons.meal : item === 'coins' ? icons.coin : icons[item];
const needOf = (need: Partial<Record<StoreItem, number>>): Need[] => (Object.entries(need) as [StoreItem, number][]).map(([k, n]) => ({ name: STORE_NAMES[k], img: storeImg(k), n, have: storeHas(world, farm, k) }));
function kitchenData(): KitchenData {
  return {
    list: COOK.map((r) => ({
      id: r.id,
      name: r.name,
      text: r.text,
      img: r.id === 'meal' ? icons.meal : r.id === 'grilled' ? icons.grilled : icons[r.id],
      energy: r.energy,
      price: r.price,
      need: needOf(r.need),
      known: knows(world, r.id),
      have: storeHas(world, farm, r.id),
    })),
  };
}
function openKitchen() {
  sfx('click');
  kitchenUI =
    hud?.openKitchen(kitchenData(), (id) => {
      const err = doAction({ kind: 'cook', item: id });
      if (err) hud?.toast(err);
    }) ?? null;
}
function ordersData(): OrdersData {
  const st = ordersToday(world, Date.now());
  return {
    day: `Tag ${tod?.day ?? 1}`,
    list: st.list.map((o, i) => ({
      who: CUSTOMERS[(st.day * 3 + i) % CUSTOMERS.length],
      size: SIZES[i],
      need: needOf(o.need),
      coins: o.coins,
      extra: o.recipe ? { img: icons[o.recipe], text: `Rezept „${recipeById(o.recipe)!.name}“` } : o.seeds ? { img: icons.seeds, text: `${o.seeds} Samen` } : undefined,
      done: st.done.includes(i),
    })),
  };
}
function openOrders() {
  sfx('click');
  ordersUI =
    hud?.openOrders(ordersData(), (i) => {
      const o = ordersToday(world, Date.now()).list[i];
      if (!o || !storeHasAll(world, farm, o.need)) return hud?.toast('Dafür fehlt noch etwas');
      const err = doAction({ kind: 'order', n: i });
      if (err) return hud?.toast(err);
      sfx('coin');
      floats.push({ x: player.x, y: player.y, h: 2.6, text: `+${o.coins} Münzen`, life: 1.8 });
      if (o.recipe) {
        const r = recipeById(o.recipe)!;
        hud?.intro({ title: `Neues Rezept: ${r.name}!`, text: r.text, steps: [{ img: icons[o.recipe], text: `Am Lagerfeuer kochen: ${needOf(r.need).map((x) => `${x.n} ${x.name}`).join(', ')}. Gibt +${r.energy} Kraft.` }], ok: 'Lecker!' }, () => sfx('click'));
      }
    }) ?? null;
}

// ---------- Bewohner ----------
/** wo jeder Bewohner gerade herumläuft (nur auf diesem Gerät, nicht gespeichert) */
interface Walker {
  x: number;
  y: number;
  tx: number;
  ty: number;
  wait: number;
  yaw: number;
  moving: boolean;
  /** freut sich noch so lange (s) */
  happy: number;
}
const walkers = new Map<string, Walker>();
/** so weit laufen sie von ihrem Häuschen weg */
const FOLK_R = 34;
const homeOf = (v: Villager) => ({ x: v.x, y: v.y + 7 });
/** dort darf ein Bewohner hin: Land, nichts im Weg, keine Felder zertrampeln */
const folkFree = (x: number, y: number) =>
  x > 4 && y > 4 && x < W - 4 && y < H - 4 && island.ground[(y | 0) * W + (x | 0)] !== Ground.Water && !world.blocked(x, y, 3, 2) && !farm.plot(...Farm.tileAt(x, y));
function folkTarget(v: Villager) {
  const h = homeOf(v);
  for (let k = 0; k < 8; k++) {
    const a = Math.random() * Math.PI * 2;
    const r = 8 + Math.random() * FOLK_R;
    const x = h.x + Math.cos(a) * r;
    const y = h.y + Math.sin(a) * r * 0.7;
    if (folkFree(x, y)) return { x, y };
  }
  return h;
}
/** Bewohner spazieren um ihr Häuschen, bleiben bei dir stehen und schauen dich an; nachts sind sie drinnen */
function folkLife(dt: number) {
  const night = !!tod?.night;
  for (const v of world.villagers) {
    let s = walkers.get(v.id);
    if (!s) {
      const h = homeOf(v);
      const t = folkTarget(v);
      s = { x: h.x, y: h.y, tx: t.x, ty: t.y, wait: 0.3 + Math.random() * 1.5, yaw: 0, moving: false, happy: 0 };
      walkers.set(v.id, s);
    }
    s.happy = Math.max(0, s.happy - dt);
    s.moving = false;
    if (night) {
      const h = homeOf(v);
      Object.assign(s, { x: h.x, y: h.y, tx: h.x, ty: h.y, yaw: 0 });
      continue;
    }
    if (inside < 0 && Math.hypot(player.x - s.x, (player.y - s.y) * 1.3) < 20) {
      s.yaw = Math.atan2(player.x - s.x, player.y - s.y);
      continue;
    }
    if (s.wait > 0) {
      s.wait -= dt;
      continue;
    }
    const dx = s.tx - s.x;
    const dy = s.ty - s.y;
    const d = Math.hypot(dx, dy);
    if (d < 1.5) {
      s.wait = 1.5 + Math.random() * 3;
      const t = folkTarget(v);
      s.tx = t.x;
      s.ty = t.y;
      continue;
    }
    const step = Math.min(d, 13 * dt);
    const nx = s.x + (dx / d) * step;
    const ny = s.y + (dy / d) * step;
    // steht etwas im Weg: anderes Ziel (steckt er selbst fest, darf er raus)
    if (!folkFree(nx, ny) && folkFree(s.x, s.y)) {
      const t = folkTarget(v);
      s.tx = t.x;
      s.ty = t.y;
      s.wait = 0.6;
      continue;
    }
    s.x = nx;
    s.y = ny;
    s.moving = true;
    s.yaw = Math.atan2(dx, dy);
  }
  for (const id of walkers.keys()) if (!world.villagers.some((v) => v.id === id)) walkers.delete(id);
}
function folkFrame(now: number) {
  const day = islandDay(world.clock, now);
  const out = [];
  for (const v of world.villagers) {
    const s = walkers.get(v.id);
    if (s) out.push({ id: v.id, x: s.x, y: s.y, yaw: s.yaw, moving: s.moving, wish: v.wished !== day, happy: s.happy, hidden: !!tod?.night });
  }
  return out;
}
/** Bewohner direkt bei der Figur (nachts: an seiner Tür) */
function villagerNear() {
  if (inside >= 0 || riding >= 0) return -1;
  let best = -1;
  let bestD = 13;
  world.villagers.forEach((v, i) => {
    const p = tod?.night ? homeOf(v) : walkers.get(v.id);
    if (!p) return;
    const d = Math.hypot(p.x - player.x, (p.y - player.y) * 1.4);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}
let folkUI: { update(d: VillagerData): void } | null = null;
let folkOpen = -1;
function villagerData(i: number): VillagerData {
  const v = world.villagers[i];
  const def = villagerById(v.id)!;
  const day = islandDay(world.clock, Date.now());
  const w = v.wished === day ? null : wishOf(world, i, day);
  return {
    name: def.name,
    animal: def.animal,
    text: def.text,
    img: villagerPhoto(v.id),
    line: tod?.night ? 'Gähn … ich bin schon im Schlafanzug. Aber für dich mach ich gern auf!' : v.hearts >= MAX_HEARTS ? 'Wir sind jetzt beste Freunde – für immer!' : def.lines[(day + i) % def.lines.length],
    hearts: v.hearts,
    max: MAX_HEARTS,
    wish: w ? { name: storeName(w.item, w.n), img: storeImg(w.item), n: w.n, have: storeHas(world, farm, w.item), coins: w.coins, fav: w.fav } : null,
    fav: { name: STORE_NAMES[def.fav], img: storeImg(def.fav) },
    present: { name: storeName(def.present, def.presentN), img: storeImg(def.present), n: def.presentN, state: v.hearts < 6 ? 'locked' : v.gifted === day ? 'taken' : 'ready' },
    steps: [
      { at: 3, text: `Überraschung (${SURPRISE.coins} Münzen + ${SURPRISE.seeds} Samen)`, got: v.hearts >= 3 },
      { at: 6, text: 'jeden Tag ein Geschenk', got: v.hearts >= 6 },
      { at: MAX_HEARTS, text: `beste Freunde (+${BEST_FRIEND_COINS} Münzen)`, got: v.hearts >= MAX_HEARTS },
    ],
    night: !!tod?.night,
    fest: curFest
      ? {
          title: curFest.visit.say,
          text: `${def.name} schenkt dir ${curFest.visit.gives} ${curFest.coin.name}.`,
          img: curFest.id === 'winter' ? icons.cookie : icons.candy,
          can: !festVisited(world, v.id, day) && (!curFest.visit.night || !!tod?.night),
          why: festVisited(world, v.id, day) ? 'Heute warst du schon da – morgen wieder!' : 'Komm wieder, wenn es dunkel ist!',
        }
      : undefined,
  };
}
function openVillager(i: number) {
  if (!world.villagers[i]) return;
  sfx('click');
  folkOpen = i;
  folkUI = hud?.openVillager(villagerData(i), hearts, { give: () => giveWish(i), present: () => takeGift(i), fest: () => festKnock(i) }) ?? null;
}
/** sich freuen: Herzchen und ein Hüpfer */
function folkCheer(id: string, n: number) {
  const s = walkers.get(id);
  if (!s) return;
  s.happy = 1.6;
  view.heartsAt(s.x, s.y, n, 1.5);
}
function giveWish(i: number) {
  const v = world.villagers[i];
  const def = villagerById(v.id)!;
  const wish = wishOf(world, i, islandDay(world.clock, Date.now()));
  const before = v.hearts;
  const err = doAction({ kind: 'wish', n: i, item: wish.item });
  if (err) return hud?.toast(err);
  sfx('coin');
  const after = world.villagers[i].hearts;
  folkCheer(v.id, 1 + (after - before) * 2);
  const s = walkers.get(v.id) ?? player;
  floats.push({ x: s.x, y: s.y, h: 2, text: `+${wish.coins} Münzen  +${after - before} ♥`, life: 1.8 });
  folkUI?.update(villagerData(i));
  const card = (title: string, text: string, img: string, line: string) => {
    sfx('quest');
    hud?.intro({ title, text, steps: [{ img, text: line }], ok: 'Juhu!' }, () => sfx('click'));
  };
  if (before < MAX_HEARTS && after >= MAX_HEARTS) card('Beste Freunde!', `${def.name} und du seid jetzt beste Freunde.`, villagerPhoto(v.id), `Als Dankeschön: ${BEST_FRIEND_COINS} Münzen!`);
  else if (before < 6 && after >= 6) card(`${def.name} mag dich richtig gern!`, 'Ab jetzt bekommst du jeden Tag ein kleines Geschenk.', storeImg(def.present), `Jeden Tag: ${def.presentN} ${storeName(def.present, def.presentN)} – einfach im Bewohner-Fenster abholen.`);
  else if (before < 3 && after >= 3) card(`${def.name} hat eine Überraschung für dich!`, 'Danke, dass du so lieb zu mir bist!', icons.coin, `${SURPRISE.coins} Münzen und ${SURPRISE.seeds} Rübensamen.`);
}
function takeGift(i: number) {
  const v = world.villagers[i];
  const def = villagerById(v.id)!;
  const err = doAction({ kind: 'present', n: i });
  if (err) return hud?.toast(err);
  sfx('coin');
  folkCheer(v.id, 2);
  hud?.toast(`${def.name} schenkt dir ${def.presentN} ${storeName(def.present, def.presentN)}!`);
  folkUI?.update(villagerData(i));
}
/** ein neuer Bewohner ist da: kurz vorstellen */
function folkWelcome(id: string) {
  const d = villagerById(id);
  if (!d) return;
  setTimeout(() => folkCheer(id, 4), 300);
  sfx('quest');
  hud?.intro(
    {
      title: `${d.name} zieht ein!`,
      text: `${d.animal} ${d.name}: ${d.text}`,
      steps: [
        { img: villagerPhoto(id), text: `Siehst du ein „!“ über dem Kopf? Dann wünscht sich ${d.name} heute etwas – geh hin und tipp.` },
        { img: storeImg(d.fav), text: `Am liebsten mag ${d.name} ${STORE_NAMES[d.fav]} – das gibt doppelt Herzen.` },
        { img: hearts[0], text: '3 Herzen: eine Überraschung · 6 Herzen: jeden Tag ein Geschenk · 10 Herzen: beste Freunde!' },
      ],
      ok: 'Willkommen!',
    },
    () => sfx('click'),
  );
}

// ---------- Feste, Strandgut, Tagesgeschenk ----------
/** Bild zu einem Strandgut */
const beachImg = (id: string) => (id === 'bottle' ? icons.bottle : seaPhoto(id));
const festCoinImg = () => (curFest?.id === 'winter' ? icons.cookie : icons.candy);
/** Süßes oder Saures beim Bewohner */
function festKnock(i: number) {
  const v = world.villagers[i];
  if (!curFest || !v) return;
  const err = doAction({ kind: 'festvisit', item: curFest.id, arg: v.id });
  if (err) return hud?.toast(err);
  sfx('coin');
  folkCheer(v.id, 2);
  const s = walkers.get(v.id);
  floats.push({ x: s?.x ?? v.x, y: s?.y ?? v.y + 7, h: 2.2, text: `+${curFest.visit.gives} ${curFest.coin.name}`, life: 1.8 });
  hud?.toast(`${villagerById(v.id)?.name}: „${curFest.visit.say}“`);
  folkUI?.update(villagerData(i));
}
let festUI: { update(d: FestShopData): void } | null = null;
function festShopData(): FestShopData | null {
  const f = curFest;
  if (!f) return null;
  return {
    title: f.id === 'winter' ? 'Festtagsstand' : 'Kürbisstand',
    text: f.hello,
    coin: { name: f.coin.name, img: festCoinImg(), n: world.fest.coins[f.id] ?? 0 },
    items: f.shop.map((it) => {
      const hatNo = Number(Object.entries(FEST_HAT).find(([, id]) => id === it.id)?.[0] ?? -1);
      return { id: it.id, name: it.name, text: it.text, img: it.kind === 'hat' ? hatPhoto(hatNo) : decoIcon(it.id), price: it.price, have: world.decoInv[it.id] ?? 0, hat: it.kind === 'hat', owned: (save.hats ?? []).includes(it.id) };
    }),
  };
}
function openFestShop() {
  const d = festShopData();
  if (!d || !curFest) return;
  sfx('coin');
  const fest = curFest;
  festUI =
    hud?.openFestShop(d, (id) => {
      const err = doAction({ kind: 'festbuy', item: fest.id, arg: id });
      if (err) return hud?.toast(err);
      sfx('quest');
      const it = fest.shop.find((x) => x.id === id);
      if (it?.kind === 'deco') hud?.toast(`${it.name} gekauft – im Bau-Menü aufstellen`);
      const nd = festShopData();
      if (nd) festUI?.update(nd);
    }) ?? null;
}
/** Fest-Hut gekauft: für die Figur freischalten und gleich aufsetzen? */
function unlockHat(id: string) {
  const no = Number(Object.entries(FEST_HAT).find(([, h]) => h === id)?.[0] ?? -1);
  if (no < 0) return;
  save.hats = [...new Set([...(save.hats ?? []), id])];
  writeSave(save);
  hud?.intro(
    { title: `${HATS[no]} freigeschaltet!`, text: 'Du findest ihn jetzt auch im Menü unter „Aussehen“.', steps: [{ img: hatPhoto(no), text: 'Soll deine Figur ihn gleich aufsetzen?' }], ok: 'Aufsetzen!' },
    () => {
      save.look = { ...save.look, hat: no };
      writeSave(save);
      sfx('quest');
    },
  );
}
/** Brief aus der Flaschenpost zeigen */
function showLetter(n: number, gift?: { coins?: number; seeds?: number; wood?: number }) {
  const L = LETTERS[n % LETTERS.length];
  const g = gift ? [gift.coins ? `${gift.coins} Münzen` : '', gift.seeds ? `${gift.seeds} Samen` : '', gift.wood ? `${gift.wood} Holz` : ''].filter(Boolean).join(', ') : '';
  setTimeout(() => {
    sfx('quest');
    hud?.openLetter({ from: L.from, text: L.text, gift: g, img: icons.bottle }, () => sfx('click'));
  }, 450);
}
/** Bild und Text zu einem Feld im Tageskalender */
function dailyCell(g: DailyGift, deco: string): { img: string; label: string } {
  if (g.deco) return { img: decoIcon(deco), label: `${g.coins} Münzen + ${decoById(deco)?.name ?? 'Deko'}` };
  if (g.coins) return { img: icons.coin, label: `${g.coins} Münzen` };
  if (g.seeds) return { img: icons.seeds, label: `${g.seeds} Samen` };
  if (g.wood) return { img: icons.log, label: `${g.wood} Holz` };
  if (g.dish) return { img: icons[g.dish as 'apfelkuchen'], label: recipeById(g.dish)?.name ?? 'Leckerei' };
  return { img: icons.apple, label: `${g.apples} Äpfel` };
}
/** einmal am Tag: Tagesgeschenk anbieten (danach weiter mit next) */
function maybeDaily(next: () => void) {
  const d = cleanDaily(save.daily);
  const key = dayKey(today());
  if (!hud || dailyDone(d, key) || bag().tut < TUTORIAL.length) return next();
  const idx = dailyIndex(d);
  const deco = weeklyDeco(d);
  hud.openDaily(
    {
      note: d.total ? `Schön, dass du wieder da bist! Schon ${d.total} Geschenke abgeholt.` : 'Jeden Tag, an dem du spielst, wartet ein Geschenk. Am 7. Tag gibt es etwas ganz Besonderes!',
      cells: CALENDAR.map((g, i) => ({ ...dailyCell(g, deco), state: i < idx ? 'got' : i === idx ? 'today' : 'next' })),
    },
    () => {
      const g = CALENDAR[idx];
      const err = doAction({ kind: 'daily', n: idx, ...(g.deco ? { arg: deco } : {}) });
      if (err) return hud?.toast(err);
      save.daily = { last: key, total: d.total + 1 };
      writeSave(save);
      sfx('quest');
      const c = dailyCell(g, deco);
      floats.push({ x: player.x, y: player.y, h: 2.6, text: `+${c.label}`, life: 2.2 });
      if (g.deco) hud?.toast(`${decoById(deco)?.name} liegt im Bau-Menü zum Aufstellen bereit`);
      setTimeout(next, 1000);
    },
  );
}
/** „Was ist neu?“ – einmal pro Version (wer gerade erst anfängt, bekommt es nicht) */
const NEWS = 'news-2026-10b';
function maybeNews(next: () => void) {
  if (!hud || (save.seen ?? []).includes(NEWS)) return next();
  save.seen = [...(save.seen ?? []), NEWS];
  writeSave(save);
  if (bag().tut < TUTORIAL.length) return next();
  sfx('quest');
  hud.intro(
    {
      title: 'Neu auf deiner Insel!',
      text: 'Es gibt jetzt noch mehr zu entdecken:',
      steps: [
        { img: icons.carrot, text: 'Karotten, Erdbeeren und Kürbisse – Samen beim Händler-Boot. Tipp zweimal auf die Samen, um die Sorte zu wählen.' },
        { img: decoIcon('starstatue'), text: 'Insel-Sterne: Je schöner deine Insel, desto mehr Sterne – jeder bringt ein Geschenk. Tipp oben auf ★.' },
        { img: icons.book, text: 'Erfolge in Bronze, Silber und Gold – im Album unter „Erfolge“.' },
        { img: icons.bottle, text: 'Jeden Tag: Schätze und Flaschenpost am Strand und ein Tagesgeschenk. Dazu Feste zu Halloween und im Dezember.' },
      ],
      ok: 'Los geht’s!',
    },
    () => {
      sfx('click');
      next();
    },
  );
}
/** Fest beginnt: einmal pro Jahr begrüßen */
function maybeFestHello() {
  const f = curFest;
  if (!hud || !f || bag().tut < TUTORIAL.length) return;
  const key = `${f.id}-${today().getFullYear()}`;
  if ((save.seen ?? []).includes(key)) return;
  save.seen = [...(save.seen ?? []), key];
  writeSave(save);
  sfx('quest');
  hud.intro(
    {
      title: f.id === 'winter' ? 'Das Winterfest ist da!' : 'Halloween auf der Insel!',
      text: f.hello,
      steps: [
        { img: f.id === 'winter' ? icons.gift : icons.pumpkin, text: `Jeden Tag liegen ${f.find.perDay} ${f.id === 'winter' ? 'Geschenke' : 'Kürbisse'} auf der Insel – je ${f.find.gives} ${f.coin.one}.` },
        { img: festCoinImg(), text: `${f.visit.night ? 'Nachts' : 'Jeden Tag'} bei deinen Bewohnern klopfen: „${f.visit.say}“` },
        { img: f.id === 'winter' ? icons.stallWinter : icons.stall, text: `Am Stand beim Steg tauschst du ${f.coin.name} gegen Deko und einen Hut.` },
      ],
      ok: 'Juhu!',
    },
    () => sfx('click'),
  );
}

// ---------- Kutsche & Haus ausbauen ----------
/** steht die Figur an einem Kutschenhalt? (Nummer, -1 = nein) */
function coachNear() {
  if (inside >= 0) return -1;
  return world.coaches.findIndex((c) => Math.abs(player.x - c.x) < 13 && player.y > c.y - 12 && player.y < c.y + 12);
}
/** Name eines Halts nach dem, was in der Nähe steht */
function coachName(i: number) {
  const c = world.coaches[i];
  const spots: [string, number, number][] = [
    ['am Steg', BOARD.x, BOARD.y],
    ...world.houses.map((h, k): [string, number, number] => [k ? `beim ${k + 1}. Haus` : 'bei deinem Haus', h.x, h.y]),
    ...world.stables.map((h): [string, number, number] => ['beim Pferdestall', h.x, h.y]),
    ...world.villagers.map((v): [string, number, number] => [`bei ${villagerById(v.id)?.name}`, v.x, v.y]),
    ...world.fires.map((f): [string, number, number] => ['am Lagerfeuer', f.x, f.y]),
    ...world.beets.map((b): [string, number, number] => ['beim Hochbeet', b.x, b.y]),
    ...PROJECTS.filter((_, k) => world.projDone(k)).map((p, k): [string, number, number] => {
      const [x, y] = siteOf(world, farm, k);
      return [`${p.id === 'lighthouse' || p.id === 'pavilion' ? 'beim' : 'am'} ${p.name}`, x, y];
    }),
  ];
  let best = '';
  let bd = 70;
  for (const [name, x, y] of spots) {
    const d = Math.hypot(x - c.x, y - c.y);
    if (d < bd) {
      bd = d;
      best = name;
    }
  }
  if (best) return best;
  const dx = c.x - W / 2;
  const dy = c.y - H / 2;
  return Math.abs(dx) > Math.abs(dy) * 1.5 ? (dx > 0 ? 'im Osten' : 'im Westen') : dy > 0 ? 'im Süden' : 'im Norden';
}
function openCoach(i: number) {
  sfx('click');
  const others = world.coaches.map((c, k) => ({ k, c })).filter((o) => o.k !== i);
  const block = !world.horses.length ? 'Für die Kutsche brauchst du ein Pferd – bau einen Stall und nimm eins auf.' : !others.length ? 'Bau noch einen Kutschenhalt woanders auf der Insel, dann kannst du hinfahren.' : null;
  hud?.openTravel(
    {
      here: coachName(i),
      block,
      list: others.map((o) => ({ id: o.k, name: coachName(o.k), sub: `${Math.max(1, Math.round(Math.hypot(o.c.x - player.x, o.c.y - player.y) / 45))} s zu Fuß gespart` })),
    },
    (k) => travel(k),
  );
}
/** mit der Kutsche zu Halt k fahren */
function travel(k: number) {
  const c = world.coaches[k];
  if (!c) return;
  stopFishing();
  sfx('hoof');
  const clop = setInterval(() => sfx('hoof'), 260);
  hud?.sleep(`Die Kutsche rattert los … nach ${coachName(k)}`, () => {
    clearInterval(clop);
    player.x = c.x;
    player.y = c.y + 10;
    player.dir = Dir.Down;
    unstick();
    view.snap();
    sfx('neigh');
  });
}
/** Haus ausbauen: das nächste noch kleine Haus bekommt ein Obergeschoss */
function enlargeHouse() {
  let best = -1;
  let bd = Infinity;
  world.houses.forEach((h, i) => {
    const d = Math.hypot(h.x - player.x, h.y - player.y);
    if (!h.big && d < bd) {
      bd = d;
      best = i;
    }
  });
  if (best < 0) return hud?.toast(world.houses.length ? 'Alle Häuser sind schon ausgebaut' : 'Bau zuerst ein Haus');
  if (world.wood < ENLARGE.wood) return hud?.toast('Zu wenig Holz');
  if (world.coins < ENLARGE.coins) return hud?.toast('Zu wenig Münzen');
  if (!spend('build')) return;
  const err = doAction({ kind: 'enlarge', house: best });
  if (err) return hud?.toast(err);
  const h = world.houses[best];
  emit({ k: 'build', x: h.x, y: h.y, text: 'Ausgebaut!' });
  view.firework(h.x, h.y - 30);
  hud?.intro(
    {
      title: 'Dein Haus ist ausgebaut!',
      text: 'Oben gibt es jetzt ein zweites Stockwerk, und drinnen ist viel mehr Platz.',
      steps: [
        { img: icons.bighouse, text: 'Drinnen warten 3 neue Plätze für Möbel – und ein gemütlicher Kamin.' },
        { img: icons.house, text: 'Geh durch die Tür hinein und richte alles ein.' },
      ],
      ok: 'Juhu!',
    },
    () => sfx('click'),
  );
}

// ---------- Insel-Projekte ----------
let projUI: { update(d: ProjData): void } | null = null;
/** Pfeil zur Baustelle bis … */
let guideSiteUntil = 0;
const PROJ_IMG: Record<ProjItem, () => string> = {
  wood: () => icons.log,
  stones: () => icons.stone,
  sticks: () => icons.stick,
  turnip: () => icons.turnip,
  apple: () => icons.apple,
  berry: () => icons.berry,
  hay: () => icons.hay,
  fish: () => fishPhoto('hering'),
  meal: () => icons.meal,
  grilled: () => icons.grilled,
  coins: () => icons.coin,
};
/** wie viel davon hat der Spieler (Stöcke/Steine im Rucksack, sonst Insel-Vorrat) */
const projHave = (item: ProjItem) => (item === 'stones' ? bag().stones : item === 'sticks' ? bag().sticks : islandHas(world, farm, item));
function projData(): ProjData {
  const k = world.proj.n;
  const p = PROJECTS[k];
  const steps = PROJECTS.map((q, i) => ({ name: q.name, state: (i < k ? 'done' : i === k ? 'now' : 'next') as 'done' | 'now' | 'next' }));
  if (!p) return { title: '', step: '', text: 'Brunnen, Marktstand, Gewächshaus, Leuchtturm und Festpavillon stehen – eure Insel ist fertig! Jeden Abend gibt es Feuerwerk.', reward: '', rows: [], steps, done: true };
  return {
    title: p.name,
    step: `Projekt ${k + 1} von ${PROJECTS.length}`,
    text: p.text,
    reward: p.reward,
    rows: (Object.entries(p.need) as [ProjItem, number][]).map(([item, need]) => ({ id: item, name: PROJ_ITEMS[item].name, img: PROJ_IMG[item](), got: world.proj.got[item] ?? 0, need, have: projHave(item) })),
    steps,
    done: false,
  };
}
function openProject() {
  sfx('click');
  projUI =
    hud?.openProject(projData(), {
      give: giveProject,
      show: () => {
        guideSiteUntil = Date.now() + 90_000;
        hud?.toast('Folge dem gelben Pfeil zur Baustelle');
      },
    }) ?? null;
}
function giveProject(id: string) {
  const item = id as ProjItem;
  const p = PROJECTS[world.proj.n];
  if (!p) return;
  const left = (p.need[item] ?? 0) - (world.proj.got[item] ?? 0);
  const n = Math.min(left, projHave(item));
  if (n <= 0) return hud?.toast(`Du hast keine ${PROJ_ITEMS[item].name}`);
  const before = world.proj.n;
  const err = doAction({ kind: 'donate', item, n });
  if (err) return hud?.toast(err);
  // Stöcke und Steine kommen aus dem eigenen Rucksack
  const b = bag();
  if (item === 'stones') b.stones -= n;
  if (item === 'sticks') b.sticks -= n;
  writeSave(save);
  sfx('build');
  syncHud();
  if (world.proj.n > before) projectDone(before);
}
/** Projekt fertig: feiern */
function projectDone(k: number) {
  const p = PROJECTS[k];
  const [x, y] = siteOf(world, farm, k);
  emit({ k: 'project', x, y, text: `${p.name} ist fertig!` });
  const next = PROJECTS[k + 1];
  guideSiteUntil = 0;
  hud?.intro(
    {
      title: `${p.name} ist fertig!`,
      text: p.reward,
      steps: next ? [{ img: icons.craft, text: `Nächstes Projekt: ${next.name} – ${next.text}` }] : [{ img: icons.coin, text: 'Das war das letzte Projekt. Heute Abend gibt es das große Feuerwerk!' }],
      ok: 'Juhu!',
    },
    () => sfx('click'),
  );
}
/** steht die Figur an einem Projekt? (Nummer, -1 = nein) */
function projectNear() {
  if (inside >= 0 || riding >= 0) return -1;
  for (let k = 0; k <= Math.min(world.proj.n, PROJECTS.length - 1); k++) {
    const [x, y] = siteOf(world, farm, k);
    const f = PROJECTS[k].foot;
    const dx = Math.max(x + f.left - player.x, 0, player.x - (x + f.right));
    const dy = Math.max(y + f.top - player.y, 0, player.y - (y + f.bottom));
    if (Math.hypot(dx, dy) < 12) return k;
  }
  return -1;
}

// ---------- Basteln ----------
let craftUI: { update(d: CraftData): void } | null = null;
function craftData(): CraftData {
  return {
    have: { sticks: bag().sticks, stones: bag().stones, wood: world.wood, coins: world.coins },
    recipes: RECIPES.map((r) => ({ ...r, img: icons[r.id === 'water' ? 'bucket' : r.id], owned: hasTool(r.id) })),
    ups: UPGRADES.map((u) => {
      const lv = upLevel(bag(), u.id);
      return {
        id: u.id,
        img: upImg(u.id),
        what: u.id === 'shoes' ? 'Schuhe' : u.id === 'hooves' ? 'Hufeisen' : TOOL_NAME[u.id as ToolKind],
        now: lv ? u.levels[lv - 1].name : '',
        lv,
        next: nextLevel(bag(), u.id),
        block: upgradeBlock(bag(), u.id, { coins: world.coins, wood: world.wood, level: world.level }),
      };
    }),
  };
}
function openCraft() {
  sfx('click');
  craftUI = hud?.openCraft(craftData(), (id) => {
    const block = craftBlock(bag(), id, world.wood);
    if (block) return hud?.toast(block);
    const err = doAction({ kind: 'craft', item: id });
    if (err) return hud?.toast(err);
    // gleich in die Hand nehmen (die Angel braucht man nicht auszuwählen)
    if (id === 'rod') return hud?.toast('Stell dich ans Wasser und tipp auf den grünen Knopf');
    tool = id as ToolId;
    hud?.setTool(tool);
  }, improve) ?? null;
}
/** Bild zu einer Verbesserung */
const upImg = (id: UpgradeId) => (id === 'shoes' ? icons.shoes : id === 'hooves' ? icons.hooves : id === 'water' ? (farm.hasCan ? icons.can : icons.bucket) : icons[id]);
/** Werkzeug verbessern (im Basteln-Fenster) */
function improve(id: string) {
  const uid = id as UpgradeId;
  const block = upgradeBlock(bag(), uid, { coins: world.coins, wood: world.wood, level: world.level });
  if (block) return hud?.toast(block);
  const next = nextLevel(bag(), uid)!;
  const err = doAction({ kind: 'upgrade', item: uid, n: upLevel(bag(), uid) + 1 });
  if (err) return hud?.toast(err);
  writeSave(save);
  sfx('quest');
  emit({ k: 'craft', x: player.x, y: player.y, text: `${next.name}!` });
  craftUI?.update(craftData());
  hud?.intro({ title: `${next.name}!`, text: next.text, steps: [{ img: upImg(uid), text: upLevel(bag(), uid) >= 2 ? 'Ganz verbessert – besser geht es nicht!' : 'Später gibt es noch die Gold-Stufe (ab Insel-Stufe 4).' }], ok: 'Super' }, () => sfx('click'));
}
/** „Basteln“ hüpft, wenn das Tutorial oder die Aufgabe ein Werkzeug will und man es bauen kann */
function tutorialNudge() {
  const stat = questAt(world.prog.quests).stat;
  const can = RECIPES.some((r) => !craftBlock(bag(), r.id, world.wood));
  hud?.nudge(can && (bag().tut === 2 || (bag().tut >= TUTORIAL.length && (stat === 'bucket' || stat === 'scythe'))) ? 'craft' : null);
}
/** Tutorial: Pfeil über dem nächsten Stock bzw. Stein, den man noch braucht */
function guideTarget(): { x: number; y: number } | null {
  if (Date.now() < guideSiteUntil && PROJECTS[world.proj.n]) {
    const [x, y] = siteOf(world, farm, world.proj.n);
    if (Math.hypot(x - player.x, y - player.y) < 26) guideSiteUntil = 0;
    else return { x, y: y - 6 };
  }
  const q = bag().tut;
  if (q >= 2) return null;
  const want = q === 0 ? 'stick' : 'stone';
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  island.pickups.forEach((p, i) => {
    if (p.kind !== want || !world.pickable(i)) return;
    const d = Math.hypot(p.x - player.x, p.y - player.y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  });
  return best;
}

function syncHud() {
  if (!hud) return;
  hud.setInv(world.wood, farm.turnips, farm.meals);
  invUI?.update(invData());
  const cp = PROJECTS[world.proj.n];
  // erst nach dem eigenen Tutorial (sonst zu viel auf einmal)
  hud.setProject(cp && bag().tut >= TUTORIAL.length ? `Projekt: ${cp.name} · ${Math.round(projProgress(world.proj) * 100)} %` : null, projProgress(world.proj));
  projUI?.update(projData());
  kitchenUI?.update(kitchenData());
  const od = ordersData();
  ordersUI?.update(od);
  if (folkUI && world.villagers[folkOpen]) folkUI.update(villagerData(folkOpen));
  hud.setOrders(od.list.filter((o) => !o.done && o.need.every((x) => x.have >= x.n)).length);
  hud.setFest(curFest && bag().tut >= TUTORIAL.length ? `${curFest.name} · ${world.fest.coins[curFest.id] ?? 0} ${curFest.coin.name}` : null, festCoinImg());
  const fd = festShopData();
  if (fd) festUI?.update(fd);
  hud.setEnergy(energy());
  hud.setSlots(farm.seedsOf(seedKind), farm.water, farm.capacity, farm.hasCan, farm.hay, seedImg(seedKind));
  hud.setCoins(world.coins);
  hud.setStars(starsOf(starScore(world, farm)));
  tradeUI?.update(tradeData());
  hud.setOwned(bag().tools);
  craftUI?.update(craftData());
  tutorialNudge();
  const b = bag();
  if (b.tut < TUTORIAL.length) {
    // eigenes Tutorial zuerst
    const T = TUTORIAL[b.tut];
    hud.setGoal(`Aufgabe: ${T.text} (${Math.min(T.goal, T.have(b))}/${T.goal})\n${T.hint}\nSchritt ${b.tut + 1}/${TUTORIAL.length} · am Ende: ${TUT_SEEDS} Rübensamen`);
  } else {
    const q = questAt(world.prog.quests);
    const have = Math.min(q.goal, world.prog.stats[q.stat] ?? 0);
    const reward = [q.seeds ? `${q.seeds} Samen` : '', q.wood ? `${q.wood} Holz` : '', q.coins ? `${q.coins} Münzen` : '', `${q.xp} EP`].filter(Boolean).join(', ');
    const can = farm.hasCan || !hasTool('water') ? '' : `\nErnte ${CAN_GOAL} Rüben → Eisen-Gießkanne (${farm.harvested}/${CAN_GOAL})`;
    hud.setGoal(`Aufgabe: ${q.text} (${have}/${q.goal})${q.hint ? `\n${q.hint}` : ''}\nBelohnung: ${reward}${can}`);
  }
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
  const k = placeKind === 'fire' || placeKind === 'deco' ? 0.5 : placeKind === 'stable' ? 1.3 : placeKind === 'hut' || placeKind === 'beet' || placeKind === 'coach' ? 0.75 : 1;
  const g =
    player.dir === Dir.Down
      ? { x: px, y: py + Math.round(22 * k) }
      : player.dir === Dir.Up
        ? { x: px, y: py - Math.round(6 * k) - (k < 1 ? 4 : 0) }
        : player.dir === Dir.Right
          ? { x: px + Math.round(28 * k), y: py + 6 }
          : { x: px - Math.round(28 * k), y: py + 6 };
  // Hochbeet liegt genau auf dem Feld-Raster
  return placeKind === 'beet' ? beetSnap(g.x, g.y + 8) : g;
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
  // 3D je nach Gerät, Schrift-Ebene scharf (beide füllen per CSS den Bildschirm)
  const cap = Math.min(dprCap(), window.devicePixelRatio || 1);
  view.setQuality({ dpr: cap, shadows: gfx === 'low' || (gfx === 'auto' && autoCap <= 1) ? 0 : gfx === 'high' ? 2 : 1 });
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(view.w * dpr);
  const h = Math.round(view.h * dpr);
  if (screen.width !== w || screen.height !== h) {
    screen.width = w;
    screen.height = h;
  }
  screen.style.height = `${view.h}px`;
}
addEventListener('resize', resize);
// Browser-Leisten (z. B. Samsung Internet, Safari) und Hintergrund in der Farbe des
// unteren Bildrands – sonst taucht dort manchmal ein farbiger (früher blauer) Streifen auf
const themeMeta = document.querySelector<HTMLMetaElement>('meta[name=theme-color]');
let edgeShown = '';
setInterval(() => {
  const c = view.edgeColor;
  if (!c || c === edgeShown) return;
  edgeShown = c;
  themeMeta?.setAttribute('content', c);
  document.documentElement.style.background = c;
  document.body.style.background = c;
}, 700);
// langes Drücken öffnet kein Menü (Bild speichern …), außer in Eingabefeldern
addEventListener('contextmenu', (e) => {
  if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) e.preventDefault();
});
// fängt auch das Ein-/Ausblenden von Browser-Leisten und Drehen ab
new ResizeObserver(() => resize()).observe(view.renderer.domElement);
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
    if (e.repeat) return;
    if (fishTap()) return;
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
  const sl = mySlot();
  Object.assign(sl, { pos, world: world.toSave(), farm: farm.toSave() });
  if (changed) sl.updatedAt = now;
  writeSave(save);
}
/** Insel wechseln: Stand aus dem Spielstand laden */
function applySlot(sl: Slot) {
  // die alte gemeinsame Insel verlassen (dort verschwindet man)
  leaveShared();
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
  );
}
function openMenu() {
  if (inside >= 0) leaveHouse();
  riding = -1;
  hud = null;
  if (mode === 'play') persist();
  // im Menü ist man nicht auf der Insel – der Freund sieht einen nicht mehr
  if (mode === 'play') leaveShared();
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
    // gemeinsame Inseln direkt im Menü (ohne Umweg über Spielstände)
    shared: save.slots.filter((x) => x.shared && x.id !== save.active).map((x) => ({ id: x.id, title: x.title })),
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
      if (first) startPlay();
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
        if (down && fishTap()) return void (actHeld = false);
        actHeld = down;
        if (down && !intent().kind)
          hud?.toast(
            bag().tut < 2
              ? bag().tut === 0
                ? 'Geh zu einem Stock – der gelbe Pfeil zeigt dir einen'
                : 'Geh zu einem Stein am Strand – der gelbe Pfeil zeigt dir einen'
              : !hasTool(tool)
                ? `${TOOL_NAME[tool as ToolKind]} hast du noch nicht – tipp auf „Basteln“`
                : tool === 'water' && farm.water <= 0
                  ? 'Leer – am Wasser auffüllen'
                  : tool === 'seeds' && farm.seedsOf(seedKind) <= 0
                    ? `Keine ${cropById(seedKind)!.seedName} mehr – ${seedKinds().length > 1 ? 'tipp nochmal auf die Samen für eine andere Sorte' : 'neue gibt es beim Händler-Boot'}`
                    : toolHint[tool],
          );
      },
      tool: (t) => {
        if (!hasTool(t)) {
          sfx('nope');
          return hud?.toast(`${TOOL_NAME[t as ToolKind]} hast du noch nicht – tipp auf „Basteln“`);
        }
        // Samen nochmal antippen: Sorte wählen (sobald es mehr als Rüben gibt)
        if (t === 'seeds' && tool === 'seeds' && seedKinds().length > 1) return openSeeds();
        if (t === 'seeds' && !farm.seedsOf(seedKind)) seedKind = seedKinds().find((k) => farm.seedsOf(k) > 0) ?? seedKind;
        tool = t;
        hud?.setTool(t);
      },
      craft: openCraft,
      bag: openInventory,
      project: openProject,
      orders: openOrders,
      fest: openFestShop,
      place: (what, item) => startPlacing(what, item),
      houses: () => ({ small: world.houses.filter((h) => !h.big).length, total: world.houses.length, coins: world.coins }),
      enlarge: enlargeHouse,
      nextFolk: () => {
        const n = nextVillager(world);
        return n ? { name: n.name, animal: n.animal, img: villagerPhoto(n.id) } : null;
      },
      eat,
      decoList: () =>
        Object.entries(world.decoInv)
          .filter(([, n]) => n > 0)
          .map(([id, n]) => ({ id, name: decoById(id)?.name ?? id, img: decoIcon(id), n })),
      album: () => openAlbum(),
      stars: () => openAlbum('stars'),
      call: callFav,
      confirm: confirmBuild,
      cancel: () => {
        placing = false;
        hud?.setPlacing(false);
      },
    },
    icons,
    { house: HOUSE_COST, fire: FIRE_COST, stable: STABLE_COST, paddock: PADDOCK_COST, hut: HUT_COST, beet: BEET_COST, coach: COACH_COST, enlarge: ENLARGE },
  );
  // neue Insel: noch nichts gebastelt → das erste eigene Werkzeug in die Hand
  if (!hasTool(tool)) tool = (['axe', 'hoe', 'water', 'scythe'] as const).find(hasTool) ?? tool;
  hud.setTool(tool);
  syncHud();
  updateCoopChip();
  void cloudSync();
  const sl = mySlot();
  if (bag().tut === 0 && !bag().got.sticks && !sl.intro) {
    hud.intro(
      {
        title: sl.shared ? 'Willkommen auf eurer Insel!' : 'Willkommen auf deiner Insel!',
        text: sl.shared ? 'Hier bastelt sich jeder sein eigenes Werkzeug. So geht es für dich los:' : 'Du bist hier ganz ohne Gepäck angekommen. So geht es los:',
        steps: [
          { img: icons.stick, text: 'Sammle 4 Stöcke auf der Wiese – der gelbe Pfeil zeigt dir, wo einer liegt.' },
          { img: icons.stone, text: 'Hol dir 3 Steine aus dem Sand am Strand.' },
          { img: icons.craft, text: 'Tipp auf „Basteln“ und bau dir eine Axt und eine Hacke.' },
          { img: icons.seeds, text: 'Dafür bekommst du 3 Rübensamen – dann geht es mit den Aufgaben weiter.' },
          { img: icons.apple, text: 'Hunger? Rüttel an Obstbäumen und pflück Beeren – gegessen wird im Rucksack (oben).' },
        ],
        ok: "Los geht's!",
      },
      () => {
        sl.intro = true;
        writeSave(save);
        hint.classList.remove('gone');
        setTimeout(() => hint.classList.add('gone'), 6000);
      },
    );
    return;
  }
  hint.classList.remove('gone');
  setTimeout(() => hint.classList.add('gone'), 6000);
  maybeNews(() => maybeDaily(maybeFestHello));
}
function startPlacing(what: BuildKind, item?: string) {
  placing = true;
  placeKind = what;
  // Bewohnerhaus: Vorschau mit dem Dach dessen, der einzieht
  placeDeco = what === 'hut' ? (nextVillager(world)?.id ?? 'hase') : (item ?? '');
  hud?.setPlacing(true);
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

// ---------- Gemeinsame Insel: Abgleich über island.php ----------
/*
 * Gemeinsame Inseln liegen auf der Website. Jeder spielt auf seinem Gerät sofort
 * weiter; die eigenen Aktionen kommen ins gemeinsame Protokoll, die des Freundes
 * kommen dazu (cloud.ts). Wer gerade auf der Insel ist, meldet seine Position –
 * so sieht man sich, wenn beide gleichzeitig spielen.
 */
const cloud = httpApi();
/** Kennung dieses Geräts (eigene Aktionen und Anwesenheit erkennen) */
const pid = (() => {
  let p = store.get('cozyisland.pid') ?? '';
  if (!/^[a-z0-9]{6,24}$/.test(p)) {
    p = newPid();
    store.set('cozyisland.pid', p);
  }
  return p;
})();
interface Mate {
  pid: string;
  name: string;
  look: Look;
  x: number;
  y: number;
  tx: number;
  ty: number;
  d: Dir;
  /** im Haus (−1 draußen), reitet Pferd (−1 nein) */
  in: number;
  rh: number;
  /** zuletzt bewegt (fürs Laufen) */
  movedAt: number;
  /** letzter Werkzeug-Schwung (seine Zeit) und wann er hier begann */
  sw: number;
  swingAt: number;
  tl: string;
  sp: number;
}
/** wer außer mir gerade auf der Insel ist */
const mates = new Map<string, Mate>();
let syncing = false;
let syncSoon = false;
let lastSync = -1e9;
let compactNext = false;
let cloudState: 'ok' | 'offline' | '' = '';
/** eigener letzter Werkzeug-Schwung (für die Anzeige beim Freund) */
let swingAt = 0;
let swingTl = '';
const islandState = () => ({ world: world.toSave(), farm: farm.toSave() });
/** aktive Insel ist gemeinsam */
function cloudOn() {
  return !!mySlot().shared;
}
/** Stand der gemeinsamen Insel aus dem Spielstand (ältere Stände bekommen Kennungen) */
function sharedOf(sl: Slot): Shared {
  const pending = (sl.pending ?? []).map((p) => ('id' in p && typeof p.id === 'string' ? (p as PendingOp) : { ...p, id: opId(pid) }));
  sl.pending = pending;
  return { base: sl.base ?? null, rev: sl.base ? (sl.rev ?? 0) : 0, pending };
}
/** wo ich gerade bin (null = nicht auf der Insel) */
function presence(): Presence | null {
  if (mode !== 'play' || document.visibilityState !== 'visible') return null;
  return {
    n: save.name || 'Freund',
    l: save.look,
    x: Math.round(player.x * 10) / 10,
    y: Math.round(player.y * 10) / 10,
    d: player.dir,
    m: player.moving ? 1 : 0,
    sw: swingAt,
    tl: swingTl,
    rh: riding,
    in: inside,
    sp: Math.round(player.speedMul * 100) / 100,
  };
}
function updateCoopChip() {
  if (!hud) return;
  const sh = mySlot().shared;
  if (!sh) return hud.setCoop(null);
  const here = [...mates.values()].map((m) => m.name);
  hud.setCoop(here.length ? `Gemeinsam · ${here.join(', ')} ${here.length > 1 ? 'sind' : 'ist'} da` : `Gemeinsam mit ${sh.with}${cloudState === 'offline' ? ' · offline' : ''}`);
}
/** gemeinsame Insel verlassen: beim Freund verschwinden */
function leaveShared() {
  const sl = mySlot();
  if (sl.shared) cloud.leave(sl.id, pid);
  for (const m of mates.values()) if (m.rh >= 0) released.set(m.rh, { x: m.x, y: m.y, at: Date.now() });
  mates.clear();
  compactNext = false;
}
async function cloudSync() {
  if (!cloudOn() || syncing) return;
  syncing = true;
  syncSoon = false;
  lastSync = performance.now();
  const sl = mySlot();
  try {
    const res = await cloud.sync(sl.id, request(sharedOf(sl), pid, presence(), { init: sl.pull ? undefined : islandState(), compact: compactNext }));
    if (mySlot() !== sl || !cloudOn()) return;
    if (!res) {
      cloudState = 'offline';
      if (sl.pull && mode === 'play') hud?.toast('Die gemeinsame Insel lädt noch – ist das Internet an?');
      return;
    }
    cloudState = 'ok';
    compactNext = !!res.compact;
    // was inzwischen dazukam (eigene neue Aktionen bleiben erhalten)
    const got = absorb(island, sharedOf(sl), res, pid, Date.now());
    if (got.empty) {
      if (sl.pull && mode === 'play') hud?.toast(`Die Insel ist noch nicht in der Cloud – ${sl.shared?.with ?? 'dein Freund'} muss sie einmal öffnen`);
    } else {
      if (sl.pull && got.shared.base) {
        delete sl.pull;
        if (mode === 'play') setTimeout(() => hud?.toast(`Willkommen auf „${sl.title}“!`), 300);
      }
      sl.base = got.shared.base ?? undefined;
      sl.rev = got.shared.rev;
      sl.pending = got.shared.pending;
      if (got.current) {
        const projBefore = world.proj.n;
        const folkBefore = world.villagers.length;
        world.apply(got.current.world);
        farm.apply(got.current.farm);
        unstick();
        syncHud();
        // der andere hat ein Projekt fertig gemacht: mitfeiern
        if (mode === 'play') for (let k = projBefore; k < world.proj.n; k++) projectDone(k);
        if (mode === 'play') for (const v of world.villagers.slice(folkBefore)) hud?.toast(`${villagerById(v.id)?.name} ist auf eure Insel gezogen!`);
      }
      for (const o of got.remote) {
        remoteFx(o.op);
        // geschlafen: die Uhr der Insel ist für beide weitergesprungen
        if (o.op.a.kind === 'sleep' && mode === 'play') hud?.toast(`${mates.get(o.by)?.name ?? sl.shared?.with ?? 'Dein Freund'} hat geschlafen – die Zeit ist weitergesprungen`);
      }
    }
    updateMates(res.others);
    persist();
  } finally {
    syncing = false;
    updateCoopChip();
  }
}
/** wer gerade da ist: neu dazu, bewegt sich, ist gegangen */
function updateMates(list: Other[]) {
  const now = Date.now();
  const seen = new Set<string>();
  if (mode === 'play')
    for (const o of list) {
      if (!o || typeof o.pid !== 'string' || o.age > 7000 || typeof o.x !== 'number') continue;
      seen.add(o.pid);
      let m = mates.get(o.pid);
      if (!m) {
        m = { pid: o.pid, name: o.n || 'Freund', look: o.l, x: o.x, y: o.y, tx: o.x, ty: o.y, d: o.d as Dir, in: o.in ?? -1, rh: o.rh ?? -1, movedAt: 0, sw: o.sw, swingAt: 0, tl: '', sp: 1 };
        mates.set(o.pid, m);
        hud?.toast(`${m.name} ist auf der Insel!`);
        // mit wem die Insel geteilt ist, steht jetzt fest
        const sl = mySlot();
        if (sl.shared && sl.shared.with === 'Freund' && m.name !== 'Freund') sl.shared.with = m.name;
      }
      // Haus betreten/verlassen: nicht durchs Bild gleiten
      if ((o.in ?? -1) !== m.in) Object.assign(m, { x: o.x, y: o.y });
      // steigt ab: Pferd läuft von dort zurück
      if (m.rh >= 0 && m.rh !== (o.rh ?? -1)) released.set(m.rh, { x: m.x, y: m.y, at: now });
      if (o.m || Math.hypot(o.x - m.tx, o.y - m.ty) > 0.3) m.movedAt = now;
      if (o.sw && o.sw !== m.sw) {
        m.swingAt = performance.now();
        m.tl = o.tl;
      }
      Object.assign(m, { name: o.n || m.name, look: o.l ?? m.look, tx: o.x, ty: o.y, d: o.d as Dir, in: o.in ?? -1, rh: o.rh ?? -1, sw: o.sw, sp: o.sp || 1 });
    }
  for (const [k, m] of mates)
    if (!seen.has(k)) {
      mates.delete(k);
      if (m.rh >= 0) released.set(m.rh, { x: m.x, y: m.y, at: now });
      if (mode === 'play') hud?.toast(`${m.name} hat die Insel verlassen`);
    }
}
/** was der Freund gemacht hat: kurz zeigen (nur in der Nähe, mit Ton) */
function remoteFx(op: Op) {
  const a = op.a;
  const cx = (a.c ?? 0) * TILE + 4;
  const cy = (a.r ?? 0) * TILE + 4;
  const fx: Fx | null =
    a.kind === 'axe' && a.fell && island.decor[a.tree ?? -1]
      ? { k: 'fell', x: island.decor[a.tree!].x, y: island.decor[a.tree!].y }
      : a.kind === 'hoe'
        ? { k: 'till', x: cx, y: cy }
        : a.kind === 'seeds'
          ? { k: 'seed', x: cx, y: cy }
          : a.kind === 'water'
            ? { k: 'water', x: cx, y: cy }
            : a.kind === 'harvest'
              ? { k: 'harvest', x: cx, y: cy }
              : a.kind === 'mow'
                ? { k: 'mow', x: cx, y: cy }
                : a.kind === 'build'
                  ? { k: 'build', x: a.x ?? 0, y: a.y ?? 0 }
                  : a.kind === 'pick' && island.pickups[a.tree ?? -1]
                    ? { k: 'pick', x: island.pickups[a.tree!].x, y: island.pickups[a.tree!].y }
                    : a.kind === 'craft'
                      ? { k: 'craft', x: op.x, y: op.y }
                      : a.kind === 'fish'
                        ? { k: 'fish', x: op.x, y: op.y + 14 }
                        : a.kind === 'shake' && island.decor[a.tree ?? -1]
                        ? { k: 'fruit', x: island.decor[a.tree!].x, y: island.decor[a.tree!].y, tree: a.tree }
                        : null;
  if (fx && mode === 'play' && inside < 0 && Math.hypot(fx.x - player.x, fx.y - player.y) < 160) playFx(fx);
}
/** steckt die Figur nach dem Abgleich fest (z. B. ein Baum ist nachgewachsen)? → daneben stellen */
function unstick() {
  if (inside >= 0 || player.free(player.x, player.y)) return;
  for (let r = 4; r < 60; r += 4)
    for (let k = 0; k < 12; k++) {
      const x = player.x + Math.cos((k / 12) * Math.PI * 2) * r;
      const y = player.y + Math.sin((k / 12) * Math.PI * 2) * r;
      if (player.free(x, y)) return Object.assign(player, { x, y });
    }
}
// Takt: zu zweit schnell (man sieht sich laufen), allein ab und zu (Freund kommt dazu?), im Menü selten
setInterval(() => {
  if (!cloudOn() || syncing || document.visibilityState !== 'visible') return;
  const wait = mode !== 'play' ? 8000 : mates.size ? 350 : syncSoon ? 500 : 2500;
  if (performance.now() - lastSync >= wait) void cloudSync();
}, 100);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void cloudSync();
  else if (cloudOn()) {
    persist();
    leaveShared();
  }
});
addEventListener('pagehide', () => cloudOn() && cloud.leave(mySlot().id, pid));
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
      return 'Link geschickt! Sobald dein Freund ihn öffnet, ist die Insel bei euch beiden.';
    }
    await navigator.clipboard.writeText(`${text} ${url}`);
    return 'Link kopiert – schick ihn deinem Freund';
  } catch {
    return '';
  }
}
function openCoop() {
  hud = null;
  mode = 'custom';
  const sl = mySlot();
  showCoop(
    {
      island: shareIsland,
      back: openMenu,
      play: (id) => {
        const other = save.slots.find((x) => x.id === id);
        if (!other) return;
        if (other.id !== save.active) {
          persist();
          applySlot(other);
        }
        startPlay();
      },
    },
    { title: sl.title, sharedWith: sl.shared?.with, shared: save.slots.filter((x) => x.shared).map((x) => ({ id: x.id, title: x.title, with: x.shared!.with })) },
  );
}

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
      sl = { id, title: `Insel von ${from}`.slice(0, 20), shared: { with: from }, createdAt: now, updatedAt: 0, rev: 0, pull: true, bag: newBag() };
      save.slots.push(sl);
    }
    if (sl) {
      applySlot(sl);
      linkNote = `„${sl.title}“ ist jetzt bei deinen Spielständen – ihr spielt gemeinsam darauf, auch wenn einer offline ist.`;
    } else linkNote = `Du hast schon ${MAX_SLOTS} Inseln – lösch eine unter „Spielstände“ und öffne den Link nochmal.`;
  }
}
// alte Einladung ?join=CODE (vor den gemeinsamen Inseln)
{
  const q = new URLSearchParams(location.search);
  if (q.has('join')) {
    q.delete('join');
    history.replaceState(null, '', location.pathname + (q.size ? `?${q}` : ''));
    linkNote = 'Diese Einladung ist von einer älteren Version. Bitte deinen Freund, dir den Insel-Link zu schicken (Menü → Gemeinsam spielen).';
  }
}
addEventListener('pagehide', () => mode === 'play' && persist());
setInterval(() => mode === 'play' && persist(), 10_000);
ensureClock();
savedVersion = versionNow();
openMenu();
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
  /** echte Zeit (fürs Ausruhen auch auf langsamen Handys) */
  const realDt = Math.min(0.5, (now - last) / 1000);
  last = now;
  const t = (window as unknown as { __t?: number }).__t ?? now / 1000;

  moveIn = [0, 0];
  if (mode === 'play') {
    const [mx, my] = input();
    moveIn = [mx, my];
    if (riding >= 0 && !world.horses[riding]) riding = -1;
    const rb = riding >= 0 ? breedById(world.horses[riding].breed) : undefined;
    // je mehr Vertrauen, desto flotter (bis +20 %)
    player.speedMul = rb ? rb.speed * (1 + world.horses[riding].love * 0.02) * HOOF_SPEED[upLevel(bag(), 'hooves')] : (energy() < 15 ? 0.6 : 1) * SHOE_SPEED[upLevel(bag(), 'shoes')];
    updateFishing(Date.now());
    // beim Schlagen und Angeln bleibt man stehen
    if (swing > 0 || fishing) player.update(0, 0, dt);
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
      hud?.setAction(!!it.kind || !!fishing, fishing ? icons.rod : it.kind === 'trade' ? icons.coin : it.kind === 'project' ? icons.craft : it.kind === 'cook' ? icons.meal : it.kind === 'orders' ? icons.board : it.kind === 'villager' ? villagerPhoto(world.villagers[it.tree]?.id ?? 'hase') : it.kind === 'coach' ? icons.coach : it.kind === 'fest' ? (curFest?.id === 'winter' ? icons.stallWinter : icons.stall) : it.kind === 'festfind' ? (curFest?.id === 'winter' ? icons.gift : icons.pumpkin) : it.kind === 'beach' ? beachImg(beachToday(island, islandDay(world.clock, Date.now()))[it.tree]?.id ?? 'muschel') : it.kind === 'stable' ? icons.stable : it.kind === 'horse' || it.kind === 'dismount' ? horseIcon(world.horses[it.tree]?.breed ?? '', !!world.horses[it.tree] && isFoal(world.horses[it.tree], Date.now())) : it.kind && ROOM_ACTS.has(it.kind) ? icons.house : it.kind === 'harvest' ? storeImg((farm.plot(...it.tile)?.crop?.kind ?? 'turnip') as StoreItem) : it.kind === 'rake' ? icons.hay : it.kind === 'pick' ? (island.pickups[it.tree]?.kind === 'stone' ? icons.stone : icons.stick) : it.kind === 'shake' ? (island.decor[it.tree]?.kind === 'bush' ? icons.berry : icons.apple) : it.kind === 'fish' || fishing ? icons.rod : it.kind === 'refill' ? (farm.hasCan ? icons.can : icons.bucket) : tool === 'seeds' ? seedImg(seedKind) : icons[tool === 'water' ? (farm.hasCan ? 'can' : 'bucket') : tool]);
      if (actHeld && swing <= 0 && it.kind && ROOM_ACTS.has(it.kind)) {
        actHeld = false;
        roomAction(it.kind, it.tree);
      } else if (actHeld && swing <= 0 && it.kind) {
        swingTool = it.kind as typeof swingTool;
        swingTile = it.tile;
        if (it.kind === 'pick' || it.kind === 'shake' || it.kind === 'beach' || it.kind === 'festfind') chopTarget = it.tree;
        if (it.kind === 'axe') {
          chopTarget = it.tree;
          const d = island.decor[it.tree];
          // zum Baum drehen
          const dx = d.x - player.x;
          const dy = d.y - player.y;
          player.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? Dir.Right : Dir.Left) : dy > 0 ? Dir.Down : Dir.Up;
        }
        swing = it.kind === 'seeds' || it.kind === 'harvest' || it.kind === 'rake' || it.kind === 'pick' || it.kind === 'shake' || it.kind === 'beach' || it.kind === 'festfind' ? SWING * 0.7 : SWING;
        swingAt = Date.now();
        swingTl = it.kind;
      }
    }
    if (swing > 0) {
      const before = swing;
      swing -= dt;
      if (before > SWING / 2 && swing <= SWING / 2) useTool();
    }
    // ausruhen: wer gerade nicht arbeitet, kommt langsam wieder zu Kräften (im Haus schneller)
    if (swing <= 0 && now - workAt > 2500 && energy() < 100) {
      restT += realDt * (player.moving ? 0.35 : 1) * (inside >= 0 ? 2 : 1);
      if (restT >= REST_STEP) {
        restT = 0;
        setEnergy(energy() + 1);
      }
    }
    if (placing) {
      const g = ghostSpot();
      ghost = { ...g, ok: world.canPlace(g.x, g.y, player, placeKind) && !farmUnder(g.x, g.y) };
      hud?.setPlacing(true, ghost.ok && world.wood >= BUILDS[placeKind].cost);
    }
    if (Math.floor(now / 1000) !== Math.floor((now - dt * 1000) / 1000)) {
      world.grow(Date.now(), player);
      farm.update(Date.now(), rainSince(world.clock, Date.now()));
    }
  }
  if (mode === 'play') {
    horseLife(dt, now);
    folkLife(dt);
  }
  // Mitspieler gleiten weich zur gemeldeten Stelle
  for (const m of mates.values()) {
    const k = 1 - Math.exp(-dt * 9);
    m.x += (m.tx - m.x) * k;
    m.y += (m.ty - m.y) * k;
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
          // beim Angeln hält die Figur die Angel (Wert 0.5 = ruhig, bei Biss zuckt sie)
          swing: fishing ? (fishing.bit ? 0.5 + Math.sin(t * 40) * 0.08 : 0.5) : swing > 0 ? 1 - swing / SWING : 0,
          tool: fishing ? 'rod' : swing > 0 ? swingTool : '',
          rides: riding,
          in: inside,
          look: save.look,
          mx: moveIn[0],
          my: moveIn[1],
          speed: player.speedMul,
        }
      : null,
    mates: play
      ? [...mates.values()].map((m) => {
          const k = (now - m.swingAt) / (SWING * 1000);
          return { key: m.pid, x: m.x, y: m.y, dir: m.d, moving: nowMs - m.movedAt < 450, swing: k > 0 && k < 1 ? k : 0, tool: k > 0 && k < 1 ? m.tl : '', rides: m.rh, in: m.in, look: m.look, speed: m.sp };
        })
      : [],
    canTool: farm.hasCan,
    horseAt: (i) => horseAt(i, nowMs),
    petting: petting && nowMs < petting.until ? petting.i : -1,
    shake,
    boatOut: boatOut(world.clock, nowMs),
    boat: BOAT,
    ghost: play && placing ? { kind: placeKind, deco: placeDeco, x: ghost.x, y: ghost.y, ok: ghost.ok && world.wood >= BUILDS[placeKind].cost } : null,
    marker: play && !placing && tool !== 'axe' && hasTool(tool) && riding < 0 && !fishing ? frontTile() : null,
    guide: play && !placing ? guideTarget() : null,
    fishing: play && fishing ? { x: fishing.x, y: fishing.y, bite: fishing.bit } : null,
    folk: play ? folkFrame(nowMs) : [],
    day: islandDay(world.clock, nowMs),
    fest: curFest?.id ?? null,
    inside,
  });
  drawOverlay(t, dt, nowMs);
}
requestAnimationFrame(frame);

// ---------- Schrift über der 3D-Welt: Namen, „+4 Holz“, Joystick ----------
const tmpP = { x: 0, y: 0 };
function pill(text: string, x: number, y: number, size: number, bg: string) {
  const dpr = screen.width / view.w;
  ctx.font = `700 ${Math.round(size * dpr * textScale)}px 'Fredoka', sans-serif`;
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
  const dpr = screen.width / view.w;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, screen.width, screen.height);
  // Namen über den Mitspielern
  if (mode === 'play')
    for (const m of mates.values()) {
      if (m.in !== inside) continue;
      const rides = m.rh >= 0 && m.in < 0 && world.horses[m.rh];
      const p = view.project(m.x, m.y, rides ? horseTop(rides.breed, false) + 1.3 : 2.2, tmpP);
      if (p) pill(m.name, p.x, p.y, 14, 'rgba(20,40,60,0.65)');
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
        ctx.font = `700 ${Math.round(13 * dpr * textScale)}px 'Fredoka', sans-serif`;
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
  // Bewohner in der Nähe: Name; nachts „z z z“ über dem Häuschen
  if (mode === 'play' && inside < 0)
    world.villagers.forEach((v, i) => {
      const s = walkers.get(v.id);
      const def = villagerById(v.id);
      if (!s || !def) return;
      if (tod?.night) {
        if (Math.hypot(v.x - player.x, v.y - player.y) > 80) return;
        const q = view.project(v.x, v.y - 4, 2.7, tmpP);
        if (!q) return;
        ctx.font = `700 ${Math.round(13 * dpr * textScale)}px 'Fredoka', sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(230,240,255,0.9)';
        for (let k = 0; k < 3; k++) {
          const ph = (t * 0.5 + k / 3 + i * 0.29) % 1;
          ctx.globalAlpha = Math.sin(ph * Math.PI);
          ctx.fillText('z', (q.x + 10 + ph * 14) * dpr, (q.y - ph * 24) * dpr);
        }
        ctx.globalAlpha = 1;
        return;
      }
      if (Math.hypot(s.x - player.x, s.y - player.y) < 34) {
        const q = view.project(s.x, s.y, 2.45, tmpP);
        if (q) pill(`${def.name}${v.hearts ? ` ♥${v.hearts}` : ''}`, q.x, q.y, 12, 'rgba(60,100,50,0.62)');
      }
    });
  // Tutorial: liegt das Ziel außerhalb des Bildes, zeigt ein Pfeil am Rand die Richtung
  const gd = mode === 'play' && inside < 0 && !placing ? guideTarget() : null;
  if (gd) {
    const me = view.project(player.x, player.y, 1, { x: 0, y: 0 });
    const q = view.project(gd.x, gd.y, 0.8, tmpP);
    const top = 300;
    const bottom = view.h - 150;
    const off = !q || q.x < 24 || q.x > view.w - 24 || q.y < top || q.y > bottom;
    if (off && me) {
      const a = q ? Math.atan2(q.y - me.y, q.x - me.x) : Math.atan2(gd.y - player.y, gd.x - player.x);
      // vom Spieler aus bis an den Rand des freien Bereichs
      const cx = me.x;
      const cy = Math.min(bottom - 10, Math.max(top + 10, me.y));
      const kx = Math.cos(a);
      const ky = Math.sin(a);
      const tx = kx > 0 ? (view.w - 34 - cx) / kx : kx < 0 ? (34 - cx) / kx : Infinity;
      const ty = ky > 0 ? (bottom - cy) / ky : ky < 0 ? (top - cy) / ky : Infinity;
      const d = Math.max(0, Math.min(tx, ty));
      const bob = Math.sin(t * 6) * 4;
      const ex = (cx + kx * (d + bob)) * dpr;
      const ey = (cy + ky * (d + bob)) * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, ex, ey);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(-4, -14);
      ctx.lineTo(-4, -6);
      ctx.lineTo(-16, -6);
      ctx.lineTo(-16, 6);
      ctx.lineTo(-4, 6);
      ctx.lineTo(-4, 14);
      ctx.closePath();
      ctx.lineJoin = 'round';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#7a4a10';
      ctx.stroke();
      ctx.fillStyle = '#ffd23f';
      ctx.fill();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
  }
  // „+4 Holz“
  if (floats.length) {
    ctx.font = `700 ${Math.round(20 * dpr * textScale)}px 'Fredoka', sans-serif`;
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
const ROOM_ACTS = new Set<Intent>(['enter', 'exit', 'sleep', 'chest', 'furnish', 'stable', 'horse', 'dismount', 'trade', 'project', 'cook', 'orders', 'villager', 'coach', 'fest']);
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
  player.collide = (x, y) => roomFree(x, y, world.houses[inside]?.furn, !!world.houses[inside]?.big);
  player.x = doorOf(h.big).x;
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
        img: horseIcon(b.id, foal, h.acc),
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
      { turnips: farm.turnips + world.apples, hay: farm.hay, treatImg: world.apples > 0 ? icons.apple : icons.turnip },
      hearts,
      {
        feed: () => care({ kind: 'feed', horse: slot, item: 'hay' }),
        treat: () => care({ kind: 'feed', horse: slot, item: world.apples > 0 ? 'apple' : 'turnip' }),
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
  if (kind === 'project') return openProject();
  if (kind === 'cook') return openKitchen();
  if (kind === 'orders') return openOrders();
  if (kind === 'villager') return openVillager(slot);
  if (kind === 'coach') return openCoach(slot);
  if (kind === 'fest') return openFestShop();
  if (kind === 'chest')
    return hud?.openChest([
      ['Holz', world.wood],
      ['Stöcke (deine)', bag().sticks],
      ['Steine (deine)', bag().stones],
      ['Samen', farm.seeds],
      ['Rüben', farm.turnips],
      ['Ofenrüben', farm.meals],
      ['Äpfel', world.apples],
      ['Beeren', world.berries],
      ['Bratfisch', world.grilled],
      ...DISH_IDS.filter((id) => world.dishes[id]).map((id) => [recipeById(id)!.name, world.dishes[id]] as [string, number]),
      ...FISH.filter((f) => world.fish[f.id]).map((f) => [f.name, world.fish[f.id]] as [string, number]),
    ]);
  if (kind === 'furnish')
    return hud?.openFurnish(
      FURNITURE.map((f) => ({ id: f.id, name: f.name, cost: f.cost, img: furniturePhoto(f.id) })),
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
  fakeMate: (look: Look, x: number, y: number) => updateMates([{ pid: 'ptest', n: 'Lena', l: look, x, y, d: 0, m: 0, sw: 0, tl: '', rh: -1, in: -1, sp: 1, age: 0 }]),
  swingNow: (tl: typeof swingTool) => ((swingTool = tl), (swing = SWING * 0.5)),
  fishing: () => fishing,
  folk: () => walkers,
  debugFinds: () => {
    const day = islandDay(world.clock, Date.now());
    return { beach: beachToday(island, day), fest: curFest ? festFinds(island, curFest.id, day) : [] };
  },
  doAction, get mode() { return mode; }, get mates() { return mates; }, cloudSync, pid, horsePos: (i: number) => horseAt(i), get riding() { return riding; } };
