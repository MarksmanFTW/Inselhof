import '@fontsource/pixelify-sans/latin-500.css';
import '@fontsource/pixelify-sans/latin-700.css';
import './style.css';
import { CH, CW, FOOT_X, FOOT_Y, makeCharacter } from './character';
import { Ground, H, W, generate, rng } from './island';
import { Shore, paintDock, paintLand, paintShadows, waveTile } from './paint';
import { Player } from './player';
import { loadSave, writeSave, type Save } from './save';
import { butterfly, gull, makeSprites } from './sprites';
import { showCustomize, showHud, showMenu } from './ui';

const screen = document.querySelector<HTMLCanvasElement>('#screen')!;
const ctx = screen.getContext('2d')!;

const island = generate();
const sprites = makeSprites();
const land = paintLand(island);
const lg = land.getContext('2d')!;
paintShadows(lg, island);
paintDock(lg, island);
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

// ---------- Spielfigur ----------
let save: Save = loadSave();
const START = { x: 176, y: 172 };
const player = new Player(island, START.x, START.y);
if (save.pos && player.free(save.pos.x, save.pos.y)) Object.assign(player, save.pos);
let sheet = makeCharacter(save.look);

type Mode = 'menu' | 'custom' | 'play';
let mode: Mode = 'menu';

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
  if (e.key === 'Escape' && mode === 'play') openMenu();
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
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
  showHud(openMenu);
  hint.classList.remove('gone');
  setTimeout(() => hint.classList.add('gone'), 6000);
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
    player.update(mx, my, dt);
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

  // Bäume, Palmen, Büsche, Steine, hohes Gras und die Figur – von hinten nach vorn
  const showPlayer = mode === 'play';
  let drawn = !showPlayer;
  const drawPlayer = () => {
    const px = Math.round(player.x);
    const py = Math.round(player.y);
    // Schatten
    const onGrass = island.ground[py * W + px] === Ground.Grass;
    ctx.fillStyle = onGrass ? 'rgba(8,40,10,0.45)' : 'rgba(100,70,35,0.38)';
    ctx.fillRect(px - 4, py - 1, 9, 2);
    ctx.fillRect(px - 3, py + 1, 7, 1);
    ctx.drawImage(sheet[player.dir][player.frame], px - FOOT_X, py - FOOT_Y, CW, CH);
    drawn = true;
  };
  for (const d of island.decor) {
    if (!drawn && d.y > player.y) drawPlayer();
    const s = sprites[d.kind][d.variant % sprites[d.kind].length];
    const img = d.flip ? mirror(s.img) : s.img;
    const fx = d.flip ? s.img.width - s.ox : s.ox;
    const x = d.x - fx;
    const y = d.y - s.oy;
    const amp = d.kind === 'palm' ? 1.3 : d.kind === 'grass' ? 1 : d.kind === 'tree' || d.kind === 'bush' ? 0.6 : 0;
    const sway = Math.round(Math.sin(t * (d.kind === 'grass' ? 1.6 : 0.9) + d.phase) * amp);
    if (sway === 0 || s.split >= img.height) ctx.drawImage(img, x, y);
    else {
      ctx.drawImage(img, 0, s.split, img.width, img.height - s.split, x, y + s.split, img.width, img.height - s.split);
      ctx.drawImage(img, 0, 0, img.width, s.split, x + sway, y, img.width, s.split);
    }
  }
  if (!drawn) drawPlayer();

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

// zum Testen von außen
(window as unknown as { __game?: unknown }).__game = { player, get mode() { return mode; } };
