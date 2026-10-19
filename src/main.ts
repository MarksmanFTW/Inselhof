import './style.css';
import { H, MEADOW, W, generate, rng } from './island';
import { Water, paintLand, paintShadows } from './paint';
import { butterfly, gull, makeSprites } from './sprites';

const screen = document.querySelector<HTMLCanvasElement>('#screen')!;
const ctx = screen.getContext('2d')!;

const island = generate();
const sprites = makeSprites();
const land = paintLand(island);
paintShadows(land.getContext('2d')!, island);
const water = new Water(island);

// ---------- Wolkenschatten ----------
const cloud = (() => {
  const w = 120;
  const h = 56;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0b2a3a';
  const blobs: [number, number, number][] = [
    [40, 32, 22],
    [64, 24, 24],
    [88, 32, 20],
    [60, 36, 22],
  ];
  // gerastert, damit es pixelig bleibt
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (blobs.some(([cx, cy, r]) => (x - cx) ** 2 + ((y - cy) * 1.4) ** 2 < r * r)) g.fillRect(x, y, 1, 1);
  return c;
})();
const clouds = [
  { x: 40, y: 120, s: 1.3, v: 4 },
  { x: 360, y: 420, s: 1, v: 3 },
  { x: -200, y: 300, s: 1.6, v: 3.5 },
];

// ---------- Möwen & Schmetterlinge ----------
const gullImg = gull();
const gulls = [0, 1, 2].map((i) => ({ r: 250 + i * 25, speed: 0.13 + i * 0.03, ph: i * 2.2, dir: i % 2 ? -1 : 1 }));
const bfColors = ['#ffd23f', '#ffffff', '#ff8fb8', '#9fd3ff'];
const bfImgs = bfColors.map(butterfly);
const flies = (() => {
  const r = rng(77);
  const out: { x: number; y: number; ph: number; c: number }[] = [];
  while (out.length < 6) {
    const x = W / 2 + (r() - 0.5) * 260;
    const y = H / 2 + (r() - 0.5) * 240;
    if (island.height[(y | 0) * W + (x | 0)] > MEADOW - 0.25) out.push({ x, y, ph: r() * 9, c: out.length % 4 });
  }
  return out;
})();

// ---------- Kamera ----------
let cw = 0;
let ch = 0;
let zoom = 2;
let minZoom = 1;
const cam = { x: W / 2, y: H / 2 };
function resize() {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  cw = screen.width = Math.round(innerWidth * dpr);
  ch = screen.height = Math.round(innerHeight * dpr);
  screen.style.width = `${innerWidth}px`;
  screen.style.height = `${innerHeight}px`;
  // ganze Insel sichtbar, in ganzen Pixel-Stufen
  minZoom = Math.max(1, Math.floor(Math.min(cw, ch) / 470));
  zoom = Math.max(minZoom, zoom === 2 && !resized ? minZoom : zoom);
  resized = true;
  clampCam();
}
let resized = false;
function clampCam() {
  const hw = cw / zoom / 2;
  const hh = ch / zoom / 2;
  cam.x = Math.max(Math.min(hw, W / 2), Math.min(W - Math.min(hw, W / 2), cam.x));
  cam.y = Math.max(Math.min(hh, H / 2), Math.min(H - Math.min(hh, H / 2), cam.y));
}
function setZoom(z: number, fx = cw / 2, fy = ch / 2) {
  z = Math.max(minZoom, Math.min(minZoom * 4, Math.round(z)));
  if (z === zoom) return;
  // Punkt unter dem Finger bleibt stehen
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
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    setZoom(zoom0 * (d / pinch0), ((a.x + b.x) / 2) * dprNow(), ((a.y + b.y) / 2) * dprNow());
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

const hint = document.querySelector<HTMLElement>('.hint')!;
setTimeout(() => hint.classList.add('gone'), 6000);

// ---------- Zeichnen ----------
function frame(now: number) {
  requestAnimationFrame(frame);
  const t = (window as unknown as { __t?: number }).__t ?? now / 1000;
  water.update(t);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = water.deepColor;
  ctx.fillRect(0, 0, cw, ch);
  ctx.imageSmoothingEnabled = false;
  const ox = Math.round(cw / 2 - cam.x * zoom);
  const oy = Math.round(ch / 2 - cam.y * zoom);
  ctx.setTransform(zoom, 0, 0, zoom, ox, oy);
  ctx.drawImage(water.canvas, 0, 0);
  ctx.drawImage(land, 0, 0);

  // Bäume, Palmen, Büsche, Steine (von hinten nach vorn); Kronen wiegen im Wind
  for (const d of island.decor) {
    const s = sprites[d.kind][d.variant];
    const x = d.x - s.ox;
    const y = d.y - s.oy;
    const sway = d.kind === 'rock' ? 0 : Math.round(Math.sin(t * (d.kind === 'palm' ? 1.1 : 0.8) + d.phase) * (d.kind === 'palm' ? 1.2 : 0.7));
    if (sway === 0 || s.split >= s.img.height) {
      ctx.drawImage(s.img, x, y);
    } else {
      ctx.drawImage(s.img, 0, s.split, s.img.width, s.img.height - s.split, x, y + s.split, s.img.width, s.img.height - s.split);
      ctx.drawImage(s.img, 0, 0, s.img.width, s.split, x + sway, y, s.img.width, s.split);
    }
  }

  // Schmetterlinge
  for (const f of flies) {
    const x = Math.round(f.x + Math.sin(t * 0.7 + f.ph) * 22 + Math.sin(t * 1.9 + f.ph) * 6);
    const y = Math.round(f.y + Math.cos(t * 0.5 + f.ph) * 16 - Math.abs(Math.sin(t * 3 + f.ph)) * 3);
    ctx.drawImage(bfImgs[f.c][Math.floor(t * 8 + f.ph) % 2], x, y);
  }

  // Wolkenschatten ziehen langsam übers Bild
  ctx.globalAlpha = 0.08;
  for (const c of clouds) {
    const x = Math.round(((c.x + t * c.v + 300) % (W + 600)) - 300);
    ctx.drawImage(cloud, x, c.y, cloud.width * c.s, cloud.height * c.s);
  }
  ctx.globalAlpha = 1;

  // Möwen kreisen über dem Meer (mit Schatten aufs Wasser)
  for (const gl of gulls) {
    const a = gl.ph + t * gl.speed * gl.dir;
    const x = Math.round(W / 2 + Math.cos(a) * gl.r);
    const y = Math.round(H / 2 + Math.sin(a) * gl.r * 0.8);
    const img = gullImg[Math.floor(t * 4 + gl.ph) % 2];
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#0b2a3a';
    ctx.fillRect(x + 2, y + 18, 5, 1);
    ctx.globalAlpha = 1;
    ctx.drawImage(img, x, y);
  }
}
requestAnimationFrame(frame);
