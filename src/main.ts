import './style.css';
import { Ground, H, W, generate, rng } from './island';
import { Shore, paintDock, paintLand, paintShadows, waveTile } from './paint';
import { butterfly, gull, makeSprites } from './sprites';

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
const gulls = [0, 1].map((i) => ({ r: 150 + i * 30, speed: 0.12 + i * 0.04, ph: i * 2.6, dir: i % 2 ? -1 : 1 }));
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

// ---------- Kamera ----------
/** sichtbarer Teil der Insel (Welt-Pixel) */
const VIEW = { w: 360, h: 300 };
let cw = 0;
let ch = 0;
let zoom = 0;
let minZoom = 1;
const cam = { x: W / 2, y: H / 2 - 8 };
function resize() {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  cw = screen.width = Math.round(innerWidth * dpr);
  ch = screen.height = Math.round(innerHeight * dpr);
  screen.style.width = `${innerWidth}px`;
  screen.style.height = `${innerHeight}px`;
  // ganze Insel im Bild, in ganzen Pixel-Stufen (bleibt scharf)
  minZoom = Math.max(1, Math.floor(Math.min(cw / VIEW.w, ch / VIEW.h)));
  zoom = Math.max(minZoom, zoom || minZoom);
  clampCam();
}
function clampCam() {
  // Insel bleibt immer im Bild
  cam.x = Math.max(40, Math.min(W - 40, cam.x));
  cam.y = Math.max(40, Math.min(H - 40, cam.y));
}
function setZoom(z: number, fx = cw / 2, fy = ch / 2) {
  z = Math.max(minZoom, Math.min(minZoom * 3, Math.round(z)));
  if (z === zoom) return;
  const wx = cam.x + (fx - cw / 2) / zoom;
  const wy = cam.y + (fy - ch / 2) / zoom;
  zoom = z;
  cam.x = wx - (fx - cw / 2) / zoom;
  cam.y = wy - (fy - ch / 2) / zoom;
  clampCam();
}
addEventListener('resize', resize);
resize();

// Ziehen = umsehen, zwei Finger = zoomen
const pointers = new Map<number, { x: number; y: number }>();
let pinch0 = 0;
let zoom0 = zoom;
const dprNow = () => cw / innerWidth;
const hint = document.querySelector<HTMLElement>('.hint')!;
screen.addEventListener('pointerdown', (e) => {
  screen.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
    zoom0 = zoom;
  }
  hint.classList.add('gone');
});
screen.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x;
  const dy = e.clientY - p.y;
  p.x = e.clientX;
  p.y = e.clientY;
  if (pointers.size === 1) {
    cam.x -= (dx * dprNow()) / zoom;
    cam.y -= (dy * dprNow()) / zoom;
    clampCam();
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    setZoom(zoom0 * (Math.hypot(a.x - b.x, a.y - b.y) / pinch0), ((a.x + b.x) / 2) * dprNow(), ((a.y + b.y) / 2) * dprNow());
  }
});
const up = (e: PointerEvent) => pointers.delete(e.pointerId);
screen.addEventListener('pointerup', up);
screen.addEventListener('pointercancel', up);
screen.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    setZoom(zoom + (e.deltaY < 0 ? 1 : -1), e.clientX * dprNow(), e.clientY * dprNow());
  },
  { passive: false },
);
setTimeout(() => hint.classList.add('gone'), 6000);

// ---------- Zeichnen ----------
function frame(now: number) {
  requestAnimationFrame(frame);
  const t = (window as unknown as { __t?: number }).__t ?? now / 1000;
  shore.update(t);
  ctx.imageSmoothingEnabled = false;
  const ox = Math.round(cw / 2 - cam.x * zoom);
  const oy = Math.round(ch / 2 - cam.y * zoom);
  ctx.setTransform(zoom, 0, 0, zoom, ox, oy);
  // Meer: Wellenmuster treibt langsam schräg
  const drift = Math.floor(t * 3) % 16;
  sea.setTransform(new DOMMatrix([1, 0, 0, 1, drift, Math.round(Math.sin(t * 0.8) * 1.5)]));
  ctx.fillStyle = sea;
  ctx.fillRect(-ox / zoom - 16, -oy / zoom - 16, cw / zoom + 32, ch / zoom + 32);
  ctx.drawImage(shore.canvas, 0, 0);
  ctx.drawImage(land, 0, 0);

  // Bäume, Palmen, Büsche, Steine, hohes Gras (von hinten nach vorn); Kronen wiegen im Wind
  for (const d of island.decor) {
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
}
requestAnimationFrame(frame);
