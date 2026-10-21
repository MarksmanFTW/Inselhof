import '@fontsource/pixelify-sans/latin-500.css';
import '@fontsource/pixelify-sans/latin-700.css';
import './style.css';
import { CH, CW, Dir, FOOT_X, FOOT_Y, makeCharacter, type CharSheet, type Look } from './character';
import { Ground, H, TILE, W, generate, rng } from './island';
import { Shore, paintDock, paintLand, paintShadows, waveTile } from './paint';
import { Player } from './player';
import { httpApi, syncIsland } from './cloud';
import { CAN_GOAL, Farm, RIPE } from './farm';
import { applyOp, farmUnder as farmUnderOf, tileFree as tileFreeOf, type Op } from './ops';
import { axe, bucket, cropStage, hoe, house, logIcon, sapling, seedBag, soilTile, toUrl, treeStump, turnipIcon, wateringCan } from './props';
import { activeSlot, addSlot, loadSave, removeSlot, writeSave, type Save, type Slot } from './save';
import { butterfly, gull, makeSprites } from './sprites';
import { Room, cleanCode, type Action, type Fx, type Msg, type PlayerState } from './net/room';
import { showCoop, showCustomize, showHud, showMenu, showSlots, showWait, type Hud, type ToolId } from './ui';
import { HOUSE_COST, HOUSE_FOOT, World } from './world';

const screen = document.querySelector<HTMLCanvasElement>('#screen')!;
const ctx = screen.getContext('2d')!;

const island = generate();
const sprites = makeSprites();
const baseLand = paintLand(island);
const land = document.createElement('canvas');
land.width = baseLand.width;
land.height = baseLand.height;
const shore = new Shore(island);
const sea = ctx.createPattern(waveTile(), 'repeat')!;

// Gespiegelte Bilder (für Abwechslung) einmal vorbereiten
const flipped = new Map<HTMLCanvasElement, HTMLCanvasElement>();
function mirror(img: HTMLCanvasElement) {
  let m = flipped.get(img);
  if (!m) {
    m = document.createElement('canvas');
    m.width = img.width;
    m.height = img.height;
    const g = m.getContext('2d')!;
    g.translate(img.width, 0);
    g.scale(-1, 1);
    g.drawImage(img, 0, 0);
    flipped.set(img, m);
  }
  return m;
}

// ---------- Möwen & Schmetterlinge ----------
const gullImg = gull();
const gulls = [0, 1].map((i) => ({ r: 140 + i * 20, speed: 0.12 + i * 0.04, ph: i * 2.6, dir: i % 2 ? -1 : 1 }));
const bfImgs = ['#ffffff', '#ffd23f', '#ff9fc4'].map(butterfly);
const flies = (() => {
  const r = rng(77);
  const out: { x: number; y: number; ph: number; c: number }[] = [];
  while (out.length < 4) {
    const x = Math.round(W / 2 + (r() - 0.5) * 180);
    const y = Math.round(H / 2 + (r() - 0.5) * 140);
    if (island.ground[y * W + x] === Ground.Grass) out.push({ x, y, ph: r() * 9, c: out.length % 3 });
  }
  return out;
})();

// ---------- Spielfigur & was sich auf der Insel ändert ----------
let save: Save = loadSave();
/** aktuelle eigene Insel (Spielstand) */
const mySlot = () => activeSlot(save);
const world = new World(island, mySlot().world);
const farm = new Farm(island, mySlot().farm);
const START = { x: 176, y: 172 };
const player = new Player(island, world, START.x, START.y);
{
  const pos = mySlot().pos;
  if (pos && player.free(pos.x, pos.y)) Object.assign(player, pos);
}
let sheet = makeCharacter(save.look);

type Mode = 'menu' | 'custom' | 'play';
let mode: Mode = 'menu';

// Bau- und Fäll-Grafiken
const houseImg = house();
const stumpBig = treeStump(true);
const stumpSmall = treeStump(false);
const saplingImg = sapling();
const axeImg = axe();
const logImg = logIcon();
const hoeImg = hoe();
const bucketImg = bucket();
const canImg = wateringCan();
const turnipImg = turnipIcon();
const soilDry = soilTile(false);
const soilWet = soilTile(true);
const crops = [0, 1, 2, 3].map(cropStage);
const icons = {
  log: toUrl(logImg),
  axe: toUrl(axeImg),
  house: toUrl(houseImg.img),
  hoe: toUrl(hoeImg),
  seeds: toUrl(seedBag()),
  bucket: toUrl(bucketImg),
  can: toUrl(canImg),
  turnip: toUrl(turnipImg),
};

/** Boden + Schatten neu malen, wenn Bäume fallen oder Häuser dazukommen */
let landVersion = -1;
function paintWorldLand() {
  landVersion = world.version;
  const g = land.getContext('2d')!;
  g.clearRect(0, 0, land.width, land.height);
  g.drawImage(baseLand, 0, 0);
  // gefällte Bäume werfen nur noch den kleinen Stumpf-Schatten
  const decor = island.decor.map((d, i) => (world.felled.has(i) ? { ...d, kind: 'stump' as const } : d));
  paintShadows(g, { ...island, decor });
  paintDock(g, island);
  // Hausschatten
  for (const h of world.houses) {
    g.fillStyle = 'rgba(8,40,10,0.45)';
    g.fillRect(h.x + HOUSE_FOOT.left + 1, h.y - 2, HOUSE_FOOT.right - HOUSE_FOOT.left + 3, 4);
    g.fillRect(h.x + HOUSE_FOOT.right, h.y - 12, 4, 12);
  }
}
paintWorldLand();

// ---------- Holzfällen ----------
let hud: Hud | null = null;
let actHeld = false;
let chopTarget = -1;
let tool: ToolId = 'axe';
/** Schwung (Sekunden, läuft rückwärts); swingTool = was gerade benutzt wird */
let swing = 0;
const SWING = 0.34;
let swingTool: ToolId | 'harvest' | 'refill' = 'axe';
let swingTile: [number, number] = [0, 0];
const shake = new Map<number, number>();
interface Bit {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  col: string;
}
const bits: Bit[] = [];
const floats: { x: number; y: number; text: string; life: number }[] = [];
function burst(x: number, y: number, z: number, n: number, cols: string[], speed = 30) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random());
    bits.push({ x, y, z, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5, vz: 20 + Math.random() * 40, life: 0.6 + Math.random() * 0.6, col: cols[i % cols.length] });
  }
}
// ---------- Aktionen (allein oder als Gastgeber ausgeführt, Effekte auch beim Gast) ----------
const CHIPS = ['#c8925a', '#8c6440', '#e8c890'];
const LEAVES = ['#2a6630', '#3f8640', '#68a85a', '#163c1e'];
function playFx(fx: Fx) {
  if (fx.k === 'chop') {
    if (fx.tree !== undefined) shake.set(fx.tree, 1);
    burst(fx.x, fx.y, 6, 6, CHIPS);
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
  if (fx.text) floats.push({ x: fx.x, y: fx.y - (fx.k === 'fell' ? -6 : 8), text: fx.text, life: fx.k === 'can' ? 2.2 : 1.5 });
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
    if (d && res.felled) emit({ k: 'fell', x: d.x, y: d.y - 26, text: `+${res.wood} Holz` });
  } else if (res.done) {
    if (a.kind === 'hoe') emit({ k: 'till', x: cx, y: cy });
    else if (a.kind === 'seeds') emit({ k: 'seed', x: cx, y: cy });
    else if (a.kind === 'refill') emit({ k: 'refill', x: actor.x, y: actor.y + 6, text: 'Voll!' });
    else if (a.kind === 'water') emit({ k: 'water', x: cx, y: cy });
    else if (a.kind === 'harvest' && res.harvest) {
      emit({ k: 'harvest', x: cx, y: cy, text: `+1 Rübe  +${res.harvest.seeds} Samen` });
      if (res.harvest.gotCan) emit({ k: 'can', x: actor.x, y: actor.y - 18, text: 'Eisen-Gießkanne!' });
    } else if (a.kind === 'build') emit({ k: 'build', x: a.x ?? 0, y: a.y ?? 0, text: 'Haus gebaut!' });
  }
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
type Intent = ToolId | 'harvest' | 'refill' | null;
/** Was würde der Aktions-Knopf jetzt tun? */
function intent(): { kind: Intent; tree: number; tile: [number, number] } {
  const tile = frontTile();
  const p = farm.plot(...tile);
  if (p?.crop && p.crop.stage >= RIPE) return { kind: 'harvest', tree: -1, tile };
  if (tool === 'axe') {
    const tr = world.target(player.x, player.y);
    return { kind: tr >= 0 ? 'axe' : null, tree: tr, tile };
  }
  if (tool === 'hoe') return { kind: !p && tileFree(...tile) ? 'hoe' : null, tree: -1, tile };
  if (tool === 'seeds') return { kind: p && !p.crop && farm.seeds > 0 ? 'seeds' : null, tree: -1, tile };
  if (facingWater() && farm.water < farm.capacity) return { kind: 'refill', tree: -1, tile };
  return { kind: p && !p.wetAt && farm.water > 0 ? 'water' : null, tree: -1, tile };
}
const toolHint: Record<ToolId, string> = {
  axe: 'Geh näher an einen Baum',
  hoe: 'Stell dich vor ein freies Stück Wiese',
  seeds: 'Stell dich vor ein leeres Feld',
  water: 'Stell dich vor ein trockenes Feld',
};
function useTool() {
  const [c, r] = swingTile;
  // nach Ernten/Auffüllen nicht gleich weitermachen – erst loslassen
  if (swingTool === 'harvest' || swingTool === 'refill') actHeld = false;
  const err = doAction({ kind: swingTool, c, r, tree: chopTarget });
  if (err) hud?.toast(err);
}
function syncHud() {
  if (!hud) return;
  hud.setInv(world.wood, farm.turnips);
  hud.setSlots(farm.seeds, farm.water, farm.capacity, farm.hasCan);
  hud.setGoal(farm.hasCan ? null : `Ernte ${CAN_GOAL} Rüben → Eisen-Gießkanne (${farm.harvested}/${CAN_GOAL})`);
}

// ---------- Haus platzieren ----------
let placing = false;
let ghost = { x: 0, y: 0, ok: false };
function ghostSpot() {
  const px = Math.round(player.x / 2) * 2;
  const py = Math.round(player.y / 2) * 2;
  if (player.dir === Dir.Down) return { x: px, y: py + 22 };
  if (player.dir === Dir.Up) return { x: px, y: py - 6 };
  if (player.dir === Dir.Right) return { x: px + 28, y: py + 6 };
  return { x: px - 28, y: py + 6 };
}

// ---------- Kamera ----------
/** sichtbarer Teil der Insel (Welt-Pixel) */
const VIEW = { w: 300, h: 270 };
/** beim Spielen näher dran */
const PLAY_VIEW = { w: 150, h: 200 };
let cw = 0;
let ch = 0;
let zoom = 0;
let minZoom = 1;
let playZoom = 2;
const cam = { x: W / 2, y: H / 2 };
function resize() {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  cw = screen.width = Math.round(innerWidth * dpr);
  ch = screen.height = Math.round(innerHeight * dpr);
  screen.style.width = `${innerWidth}px`;
  screen.style.height = `${innerHeight}px`;
  // ganze Insel im Bild, in ganzen Pixel-Stufen (bleibt scharf)
  minZoom = Math.max(1, Math.floor(Math.min(cw / VIEW.w, ch / VIEW.h)));
  playZoom = Math.max(minZoom + 1, Math.floor(Math.min(cw / PLAY_VIEW.w, ch / PLAY_VIEW.h)));
  zoom = mode === 'play' ? Math.max(minZoom, zoom || playZoom) : minZoom;
  clampCam();
}
function clampCam() {
  // Insel bleibt immer im Bild
  cam.x = Math.max(40, Math.min(W + (mode === 'play' ? -40 : 200), cam.x));
  cam.y = Math.max(40, Math.min(H + (mode === 'play' ? -40 : 120), cam.y));
}
function setZoom(z: number) {
  zoom = Math.max(minZoom, Math.min(minZoom * 4, Math.round(z)));
}
addEventListener('resize', resize);
resize();

// ---------- Steuerung: Daumen-Joystick, Tastatur, zwei Finger = zoomen ----------
const pointers = new Map<number, { x: number; y: number }>();
let stick: { id: number; ox: number; oy: number; x: number; y: number } | null = null;
let pinch0 = 0;
let zoom0 = zoom;
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
    zoom0 = zoom;
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
    if (mode === 'play') setZoom(zoom + (e.deltaY < 0 ? 1 : -1));
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
  const pos = { x: Math.round(player.x), y: Math.round(player.y) };
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
  const pos = sl.pos && player.free(sl.pos.x, sl.pos.y) ? sl.pos : START;
  player.x = pos.x;
  player.y = pos.y;
  shake.clear();
  bits.length = 0;
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
  hud = null;
  if (mode === 'play') persist();
  mode = 'menu';
  stick = null;
  pointers.clear();
  hint.classList.add('gone');
  zoom = minZoom;
  showMenu(save, {
    play: startPlay,
    slots: openSlots,
    look: () => openCustom(false),
    coop: () => openCoop(),
    leave: room ? () => (leaveCoop(), openMenu()) : undefined,
    coopText: room ? (role === 'host' ? `Deine Insel ist offen – Code ${room.code}` : `Zu Besuch bei ${mate?.name || 'deinem Freund'}`) : undefined,
  });
}
function openCustom(first: boolean) {
  hud = null;
  mode = 'custom';
  showCustomize(
    save,
    (s) => {
      save = s;
      sheet = makeCharacter(save.look);
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
  zoom = playZoom;
  cam.x = player.x;
  cam.y = player.y - 10;
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
      place: () => {
        placing = true;
        hud?.setPlacing(true);
      },
      confirm: confirmBuild,
      cancel: () => {
        placing = false;
        hud?.setPlacing(false);
      },
    },
    icons,
    HOUSE_COST,
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
  return farmUnderOf(farm, x, y);
}
function confirmBuild() {
  if (!placing) return;
  if (farmUnder(ghost.x, ghost.y)) return hud?.toast('Hier ist ein Feld im Weg');
  if (!ghost.ok) return hud?.toast('Hier ist kein Platz');
  if (world.wood < HOUSE_COST) return hud?.toast('Zu wenig Holz');
  placing = false;
  hud?.setPlacing(false);
  const err = doAction({ kind: 'build', x: ghost.x, y: ghost.y });
  if (err) hud?.toast(err);
}

// ---------- Koop ----------
type Role = 'solo' | 'host' | 'guest';
let role: Role = 'solo';
let room: Room | null = null;
let pendingJoin = '';
interface Mate {
  name: string;
  sheet: CharSheet;
  x: number;
  y: number;
  tx: number;
  ty: number;
  d: Dir;
  f: number;
  s: number;
  tl: string;
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
});
function makeMate(name: string, look: Look, p: PlayerState): Mate {
  return { name: name || 'Freund', sheet: makeCharacter(look), x: p.x, y: p.y, tx: p.x, ty: p.y, d: p.d as Dir, f: p.f, s: p.s, tl: p.tl };
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
  showCoop({ host: hostRoom, join: (c) => joinRoom(c), back: openMenu }, code, mySlot().title);
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
  r.onOpen = () => r.send({ t: 'hi', v: 1, name: save.name, look: save.look });
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
    hostSlot = null;
    applySlot(mySlot());
  }
  syncHud();
  updateCoopChip();
}
function onNet(m: Msg) {
  const r = room!;
  switch (m.t) {
    // ----- beim Gastgeber -----
    case 'hi':
      if (role !== 'host') return;
      mate = makeMate(m.name, m.look, { x: player.x + 12, y: player.y, d: Dir.Down, f: 0, s: 0, tl: '' });
      persist();
      r.send({
        t: 'welcome',
        v: 1,
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
      Object.assign(mate, { tx: m.p.x, ty: m.p.y, d: m.p.d, f: m.p.f, s: m.p.s, tl: m.p.tl });
      break;
    case 'look':
      if (!mate) return;
      mate.name = m.name || mate.name;
      mate.sheet = makeCharacter(m.look);
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
    const res = await syncIsland(cloud, sl.id, island, { rev: sl.rev ?? 0, pending: sl.pending ?? [] }, islandState);
    if (mySlot() !== sl || !cloudOn()) return;
    if (!res) {
      cloudState = 'offline';
      return;
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
savedVersion = versionNow();
if (pendingJoin) {
  const code = pendingJoin;
  pendingJoin = '';
  joinRoom(code);
} else openMenu();

// ---------- Zeichnen ----------
let last = performance.now();
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = (window as unknown as { __t?: number }).__t ?? now / 1000;

  if (mode === 'play') {
    const [mx, my] = input();
    // beim Schlagen bleibt man stehen
    if (swing > 0) player.update(0, 0, dt);
    else player.update(mx, my, dt);
    // Werkzeug benutzen
    if (!placing) {
      const it = intent();
      hud?.setAction(!!it.kind, it.kind === 'harvest' ? icons.turnip : it.kind === 'refill' ? (farm.hasCan ? icons.can : icons.bucket) : icons[tool === 'water' ? (farm.hasCan ? 'can' : 'bucket') : tool]);
      if (actHeld && swing <= 0 && it.kind) {
        swingTool = it.kind;
        swingTile = it.tile;
        if (it.kind === 'axe') {
          chopTarget = it.tree;
          const d = island.decor[it.tree];
          // zum Baum drehen
          const dx = d.x - player.x;
          const dy = d.y - player.y;
          player.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? Dir.Right : Dir.Left) : dy > 0 ? Dir.Down : Dir.Up;
        }
        swing = it.kind === 'seeds' || it.kind === 'harvest' ? SWING * 0.7 : SWING;
      }
    }
    if (swing > 0) {
      const before = swing;
      swing -= dt;
      if (before > SWING / 2 && swing <= SWING / 2) useTool();
    }
    if (placing) {
      const g = ghostSpot();
      ghost = { ...g, ok: world.canPlace(g.x, g.y, player) && !farmUnder(g.x, g.y) };
      hud?.setPlacing(true, ghost.ok && world.wood >= HOUSE_COST);
    }
    if (role !== 'guest' && Math.floor(now / 1000) !== Math.floor((now - dt * 1000) / 1000)) {
      world.grow(Date.now(), player);
      farm.update(Date.now());
    }
    // Kamera folgt weich
    const k = 1 - Math.exp(-dt * 6);
    cam.x += (player.x - cam.x) * k;
    cam.y += (player.y - 10 - cam.y) * k;
  } else {
    // Menü: Kamera schwebt langsam über die Insel
    // Hochformat: Insel etwas über der Mitte (Schild unten); Querformat: Insel links, Menü rechts
    const wide = cw > ch * 1.2;
    cam.x = W / 2 + Math.sin(t * 0.07) * 24 + (wide ? (cw * 0.2) / zoom : 0);
    cam.y = H / 2 + Math.cos(t * 0.05) * 16 + (wide ? 0 : (ch * 0.1) / zoom);
  }
  clampCam();
  netTick(now);
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

  if (world.version !== landVersion) paintWorldLand();
  for (const [i, v] of shake) {
    const nv = v - dt * 3;
    if (nv <= 0) shake.delete(i);
    else shake.set(i, nv);
  }
  shore.update(t);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const ox = Math.round(cw / 2 - cam.x * zoom);
  const oy = Math.round(ch / 2 - cam.y * zoom);
  ctx.setTransform(zoom, 0, 0, zoom, ox, oy);
  // Meer: Wellenmuster treibt langsam schräg
  const drift = Math.floor(t * 2) % 24;
  sea.setTransform(new DOMMatrix([1, 0, 0, 1, drift, 0]));
  ctx.fillStyle = sea;
  ctx.fillRect(-ox / zoom - 16, -oy / zoom - 16, cw / zoom + 32, ch / zoom + 32);
  ctx.drawImage(shore.canvas, 0, 0);
  ctx.drawImage(land, 0, 0);
  for (const [k, p] of farm.plots) {
    const [c, r] = k.split(',').map(Number);
    ctx.drawImage(p.wetAt ? soilWet : soilDry, c * TILE, r * TILE);
  }

  // Bäume, Palmen, Büsche, Steine, hohes Gras, Häuser und die Figur – von hinten nach vorn
  const showPlayer = mode === 'play';
  const nowMs = Date.now();
  const items: { y: number; draw: () => void }[] = [];
  island.decor.forEach((d, i) => items.push({ y: d.y, draw: () => drawDecor(i, t, nowMs) }));
  for (const h of world.houses) items.push({ y: h.y, draw: () => ctx.drawImage(houseImg.img, h.x - houseImg.ox, h.y - houseImg.oy) });
  for (const [k, p] of farm.plots) {
    if (!p.crop) continue;
    const [c, r] = k.split(',').map(Number);
    const im = crops[p.crop.stage];
    const ripeBob = p.crop.stage >= RIPE ? Math.round(Math.sin(t * 3 + c) * 0.6) : 0;
    items.push({ y: r * TILE + 6, draw: () => ctx.drawImage(im.img, c * TILE + 4 - im.ox, r * TILE + 7 - im.oy + ripeBob) });
  }
  // Ziel-Kachel markieren (Feld-Werkzeuge)
  if (showPlayer && !placing && tool !== 'axe') {
    const [c, r] = frontTile();
    const blink = 0.5 + Math.sin(t * 6) * 0.25;
    ctx.globalAlpha = blink;
    ctx.fillStyle = '#fff8e6';
    const x0 = c * TILE;
    const y0 = r * TILE;
    for (const [a, b, w, h] of [[0, 0, 3, 1], [0, 0, 1, 3], [5, 0, 3, 1], [7, 0, 1, 3], [0, 7, 3, 1], [0, 5, 1, 3], [5, 7, 3, 1], [7, 5, 1, 3]]) ctx.fillRect(x0 + a, y0 + b, w, h);
    ctx.globalAlpha = 1;
  }
  if (showPlayer) items.push({ y: player.y, draw: drawPlayer });
  const m = mate;
  if (showPlayer && m) items.push({ y: m.y, draw: () => drawChar(m.sheet, m.x, m.y, m.d, m.f, m.s, m.tl) });
  if (showPlayer && placing) items.push({ y: ghost.y, draw: drawGhost });
  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();

  // Splitter & Blätter
  for (let k = bits.length - 1; k >= 0; k--) {
    const b = bits[k];
    b.life -= dt;
    b.vz -= 160 * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z = Math.max(0, b.z + b.vz * dt);
    if (b.z === 0) {
      b.vx *= 0.8;
      b.vy *= 0.8;
    }
    if (b.life <= 0) {
      bits.splice(k, 1);
      continue;
    }
    ctx.globalAlpha = Math.min(1, b.life * 2);
    ctx.fillStyle = b.col;
    ctx.fillRect(Math.round(b.x), Math.round(b.y - b.z), 1, 1);
  }
  ctx.globalAlpha = 1;

  // Schmetterlinge
  for (const f of flies) {
    const x = Math.round(f.x + Math.sin(t * 0.7 + f.ph) * 18 + Math.sin(t * 1.9 + f.ph) * 5);
    const y = Math.round(f.y + Math.cos(t * 0.5 + f.ph) * 12 - Math.abs(Math.sin(t * 3 + f.ph)) * 3);
    ctx.drawImage(bfImgs[f.c][Math.floor(t * 8 + f.ph) % 2], x, y);
  }

  // Möwen kreisen über dem Meer (mit Schatten aufs Wasser)
  for (const gl of gulls) {
    const a = gl.ph + t * gl.speed * gl.dir;
    const x = Math.round(W / 2 + Math.cos(a) * gl.r * 1.2);
    const y = Math.round(H / 2 + Math.sin(a) * gl.r * 0.9);
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#0b2a3a';
    ctx.fillRect(x + 2, y + 16, 5, 1);
    ctx.globalAlpha = 1;
    ctx.drawImage(gullImg[Math.floor(t * 4 + gl.ph) % 2], x, y);
  }

  // Name über dem Mitspieler
  if (mode === 'play' && mate) {
    const dpr = cw / innerWidth;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = `700 ${Math.round(14 * dpr)}px 'Pixelify Sans', sans-serif`;
    ctx.textAlign = 'center';
    const sx = ox + mate.x * zoom;
    const sy = oy + (mate.y - 25) * zoom;
    const w = ctx.measureText(mate.name).width + 12 * dpr;
    ctx.fillStyle = 'rgba(20,40,60,0.65)';
    ctx.fillRect(sx - w / 2, sy - 15 * dpr, w, 20 * dpr);
    ctx.fillStyle = '#fff';
    ctx.fillText(mate.name, sx, sy);
  }
  // „+4 Holz“ (Bildschirm-Pixel, damit die Schrift scharf bleibt)
  if (floats.length) {
    const dpr = cw / innerWidth;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = `700 ${Math.round(20 * dpr)}px 'Pixelify Sans', sans-serif`;
    ctx.textAlign = 'center';
    for (let k = floats.length - 1; k >= 0; k--) {
      const f = floats[k];
      f.life -= dt;
      if (f.life <= 0) {
        floats.splice(k, 1);
        continue;
      }
      const sx = ox + f.x * zoom;
      const sy = oy + (f.y - (1.4 - f.life) * 14) * zoom;
      ctx.globalAlpha = Math.min(1, f.life * 2);
      ctx.fillStyle = '#2a1a10';
      for (const [ax, ay] of [[-2, 0], [2, 0], [0, -2], [0, 2], [2, 2]]) ctx.fillText(f.text, sx + ax * dpr, sy + ay * dpr);
      ctx.fillStyle = '#ffe08a';
      ctx.fillText(f.text, sx, sy);
    }
    ctx.globalAlpha = 1;
  }

  // Joystick anzeigen (Bildschirm-Pixel)
  if (mode === 'play' && stick) {
    const dpr = cw / innerWidth;
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
requestAnimationFrame(frame);

function drawDecor(i: number, t: number, nowMs: number) {
  const d = island.decor[i];
  if (world.felled.has(i)) {
    const p = world.stage(i, nowMs) === 'sapling' ? saplingImg : d.kind === 'tree' ? stumpBig : stumpSmall;
    ctx.drawImage(p.img, d.x - p.ox + (d.kind === 'palm' ? 0 : 1), d.y - p.oy);
    return;
  }
  const s = sprites[d.kind][d.variant % sprites[d.kind].length];
  const img = d.flip ? mirror(s.img) : s.img;
  const fx = d.flip ? s.img.width - s.ox : s.ox;
  const x = d.x - fx;
  const y = d.y - s.oy;
  const amp = d.kind === 'palm' ? 1.3 : d.kind === 'grass' ? 1 : d.kind === 'tree' || d.kind === 'bush' ? 0.6 : 0;
  let sway = Math.round(Math.sin(t * (d.kind === 'grass' ? 1.6 : 0.9) + d.phase) * amp);
  // getroffen: Krone zittert
  const sh = shake.get(i);
  if (sh) sway += Math.round(Math.sin(t * 50) * sh * 2);
  if (sway === 0 || s.split >= img.height) ctx.drawImage(img, x, y);
  else {
    ctx.drawImage(img, 0, s.split, img.width, img.height - s.split, x, y + s.split, img.width, img.height - s.split);
    ctx.drawImage(img, 0, 0, img.width, s.split, x + sway, y, img.width, s.split);
  }
}

/** Werkzeug in der Hand: k = Fortschritt des Schwungs 0..1 */
function drawTool(px: number, py: number, dir: Dir, k: number, tl: string) {
  // Schwung: von hinten oben nach vorn unten
  const a = -1.9 + k * 2.6;
  const side = dir === Dir.Left ? -1 : 1;
  const hx = dir === Dir.Right ? px + 3 : dir === Dir.Left ? px - 3 : px + 4;
  const hy = py - 9;
  const img = tl === 'hoe' ? hoeImg : tl === 'water' || tl === 'refill' ? (farm.hasCan ? canImg : bucketImg) : tl === 'axe' ? axeImg : null;
  if (!img) return;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.scale(side, 1);
  if (img === bucketImg || img === canImg) {
    // Gießen: Gefäß kippt nach vorn
    ctx.rotate(0.5 * k);
    ctx.drawImage(img, 0, -6);
  } else {
    ctx.rotate(a);
    ctx.drawImage(img, -1, -9);
  }
  ctx.restore();
}

/** Figur mit Schatten und Werkzeug zeichnen (ich oder Mitspieler) */
function drawChar(sh: CharSheet, x: number, y: number, dir: Dir, f: number, k: number, tl: string) {
  const px = Math.round(x);
  const py = Math.round(y);
  const onGrass = island.ground[py * W + px] === Ground.Grass;
  ctx.fillStyle = onGrass ? 'rgba(8,40,10,0.45)' : 'rgba(100,70,35,0.38)';
  ctx.fillRect(px - 4, py - 1, 9, 2);
  ctx.fillRect(px - 3, py + 1, 7, 1);
  const swinging = k > 0 && !!tl;
  if (swinging && dir === Dir.Up) drawTool(px, py, dir, k, tl);
  ctx.drawImage(sh[dir][f], px - FOOT_X, py - FOOT_Y, CW, CH);
  if (swinging && dir !== Dir.Up) drawTool(px, py, dir, k, tl);
}

function drawPlayer() {
  const st = myState();
  drawChar(sheet, player.x, player.y, player.dir, st.f, swing > 0 ? 1 - swing / SWING : 0, swing > 0 ? swingTool : '');
}

function drawGhost() {
  const { x, y, ok } = ghost;
  ctx.globalAlpha = 0.7;
  ctx.drawImage(houseImg.img, x - houseImg.ox, y - houseImg.oy);
  ctx.globalAlpha = 1;
  // Grundfläche: grün = passt, rot = geht nicht
  const f = HOUSE_FOOT;
  ctx.fillStyle = ok && world.wood >= HOUSE_COST ? 'rgba(120,230,110,0.45)' : 'rgba(240,70,60,0.5)';
  ctx.fillRect(x + f.left, y + f.top, f.right - f.left, f.bottom - f.top);
  ctx.fillStyle = ok ? '#2a7a2a' : '#a02020';
  ctx.fillRect(x + f.left, y + f.bottom, f.right - f.left, 1);
}

// zum Testen von außen
(window as unknown as { __game?: unknown }).__game = { player, world, farm, get mode() { return mode; }, get mate() { return mate; }, get room() { return room; } };
