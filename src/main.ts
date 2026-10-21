import '@fontsource/pixelify-sans/latin-500.css';
import '@fontsource/pixelify-sans/latin-700.css';
import './style.css';
import { CH, CW, Dir, FOOT_X, FOOT_Y, makeCharacter } from './character';
import { Ground, H, W, generate, rng } from './island';
import { Shore, paintDock, paintLand, paintShadows, waveTile } from './paint';
import { Player } from './player';
import { axe, house, logIcon, sapling, toUrl, treeStump } from './props';
import { loadSave, writeSave, type Save } from './save';
import { butterfly, gull, makeSprites } from './sprites';
import { showCustomize, showHud, showMenu, type Hud } from './ui';
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
const world = new World(island, save.world);
const START = { x: 176, y: 172 };
const player = new Player(island, world, START.x, START.y);
if (save.pos && player.free(save.pos.x, save.pos.y)) Object.assign(player, save.pos);
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
const icons = { log: toUrl(logImg), axe: toUrl(axeImg), house: toUrl(houseImg.img) };

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
let chopHeld = false;
let chopTarget = -1;
/** Schwung der Axt (Sekunden, läuft rückwärts) */
let swing = 0;
const SWING = 0.34;
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
function hit() {
  const i = chopTarget;
  if (i < 0) return;
  const d = island.decor[i];
  const res = world.chop(i);
  shake.set(i, 1);
  burst(d.x + (player.x < d.x ? -3 : 3), d.y - 2, 6, 6, ['#c8925a', '#8c6440', '#e8c890']);
  if (res.felled) {
    // Blätter rieseln, Holz fliegt in den Rucksack
    burst(d.x, d.y - 26, 24, 26, ['#2a6630', '#3f8640', '#68a85a', '#163c1e'], 40);
    floats.push({ x: d.x, y: d.y - 20, text: `+${res.wood} Holz`, life: 1.4 });
    hud?.setWood(world.wood);
    persist();
  }
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
    chopHeld = true;
  }
  if (e.key.toLowerCase() === 'b' && !placing) hud?.openBuild(world.wood);
});
addEventListener('keyup', (e) => {
  keys.delete(e.key.toLowerCase());
  if (e.key === ' ' || e.key.toLowerCase() === 'e') chopHeld = false;
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
function persist() {
  save.pos = { x: Math.round(player.x), y: Math.round(player.y) };
  save.world = world.toSave();
  writeSave(save);
}
function openMenu() {
  if (mode === 'play') persist();
  mode = 'menu';
  stick = null;
  pointers.clear();
  hint.classList.add('gone');
  zoom = minZoom;
  showMenu(save, { play: startPlay, look: () => openCustom(false) });
}
function openCustom(first: boolean) {
  mode = 'custom';
  showCustomize(
    save,
    (s) => {
      save = s;
      sheet = makeCharacter(save.look);
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
  zoom = playZoom;
  cam.x = player.x;
  cam.y = player.y - 10;
  placing = false;
  hud = showHud(
    {
      menu: openMenu,
      chop: (down) => {
        chopHeld = down;
        if (down && world.target(player.x, player.y) < 0) hud?.toast('Geh näher an einen Baum');
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
  hud.setWood(world.wood);
  hint.classList.remove('gone');
  setTimeout(() => hint.classList.add('gone'), 6000);
}
function confirmBuild() {
  if (!placing) return;
  if (world.build(ghost.x, ghost.y, player)) {
    placing = false;
    hud?.setPlacing(false);
    hud?.setWood(world.wood);
    hud?.toast('Dein Haus steht!');
    burst(ghost.x, ghost.y, 2, 30, ['#e8dcc8', '#c8b498', '#ffffff'], 45);
    persist();
  } else hud?.toast(world.wood < HOUSE_COST ? 'Zu wenig Holz' : 'Hier ist kein Platz');
}
addEventListener('pagehide', () => mode === 'play' && persist());
setInterval(() => mode === 'play' && persist(), 10_000);
openMenu();

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
    // Axt
    if (!placing) {
      const tgt = world.target(player.x, player.y);
      hud?.setTarget(tgt >= 0);
      if (chopHeld && swing <= 0 && tgt >= 0) {
        chopTarget = tgt;
        const d = island.decor[tgt];
        // zum Baum drehen
        const dx = d.x - player.x;
        const dy = d.y - player.y;
        player.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? Dir.Right : Dir.Left) : dy > 0 ? Dir.Down : Dir.Up;
        swing = SWING;
      }
    }
    if (swing > 0) {
      const before = swing;
      swing -= dt;
      if (before > SWING / 2 && swing <= SWING / 2) hit();
    }
    if (placing) {
      const g = ghostSpot();
      ghost = { ...g, ok: world.canPlace(g.x, g.y, player) };
      hud?.setPlacing(true, ghost.ok && world.wood >= HOUSE_COST);
    }
    if (Math.floor(now / 1000) !== Math.floor((now - dt * 1000) / 1000)) world.grow(Date.now(), player);
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

  // Bäume, Palmen, Büsche, Steine, hohes Gras, Häuser und die Figur – von hinten nach vorn
  const showPlayer = mode === 'play';
  const nowMs = Date.now();
  const items: { y: number; draw: () => void }[] = [];
  island.decor.forEach((d, i) => items.push({ y: d.y, draw: () => drawDecor(i, t, nowMs) }));
  for (const h of world.houses) items.push({ y: h.y, draw: () => ctx.drawImage(houseImg.img, h.x - houseImg.ox, h.y - houseImg.oy) });
  if (showPlayer) items.push({ y: player.y, draw: drawPlayer });
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

function drawAxe(px: number, py: number) {
  // Schwung: von hinten oben nach vorn unten
  const k = 1 - Math.max(0, swing) / SWING;
  const a = -1.9 + k * 2.6;
  const side = player.dir === Dir.Left ? -1 : 1;
  const hx = player.dir === Dir.Right ? px + 3 : player.dir === Dir.Left ? px - 3 : px + 4;
  const hy = py - 9;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.scale(side, 1);
  ctx.rotate(a);
  ctx.drawImage(axeImg, -1, -9);
  ctx.restore();
}

function drawPlayer() {
  const px = Math.round(player.x);
  const py = Math.round(player.y);
  // Schatten
  const onGrass = island.ground[py * W + px] === Ground.Grass;
  ctx.fillStyle = onGrass ? 'rgba(8,40,10,0.45)' : 'rgba(100,70,35,0.38)';
  ctx.fillRect(px - 4, py - 1, 9, 2);
  ctx.fillRect(px - 3, py + 1, 7, 1);
  const swinging = swing > 0;
  if (swinging && player.dir === Dir.Up) drawAxe(px, py);
  // beim Schlagen: Schritt-Bild als „Ausholen“
  const f = swinging ? (swing > SWING / 2 ? 1 : 3) : player.frame;
  ctx.drawImage(sheet[player.dir][f], px - FOOT_X, py - FOOT_Y, CW, CH);
  if (swinging && player.dir !== Dir.Up) drawAxe(px, py);
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
(window as unknown as { __game?: unknown }).__game = { player, world, get mode() { return mode; } };
