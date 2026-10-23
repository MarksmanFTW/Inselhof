/**
 * Symbole für Knöpfe und Fenster als kleine Fotos der 3D-Modelle (statt Pixelbilder):
 * Werkzeuge, Vorräte, Bauten, Deko und Möbel. Werden erst beim ersten Gebrauch
 * gerendert und dann gemerkt.
 */
import * as THREE from 'three';
import { Build, cone, cyl, rbox, sphere, vcMat } from './engine';
import { furniture } from './interior3d';
import { toolGeo } from './kid';
import * as M from './models';
import { photo } from './portrait';

const meshOf = (g: THREE.BufferGeometry) => new THREE.Mesh(g, vcMat(0.6));

function tool(id: string) {
  const g = new THREE.Group();
  const m = meshOf(toolGeo(id));
  // Stiel schräg nach oben rechts, Kopf oben
  if (id === 'axe' || id === 'hoe' || id === 'scythe') {
    // erst Stiel quer (nach +x), dann schräg hochkippen
    m.rotation.order = 'ZYX';
    m.rotation.set(0, Math.PI / 2, 0.85);
  }
  g.add(m);
  return g;
}
function logs() {
  const b = new Build();
  for (const [x, y] of [[-0.21, 0], [0.21, 0], [0, 0.36]] as const) {
    b.add(cyl(0.2, 0.2, 1.0, 14), '#a8743f', { p: [x, y, 0], r: [Math.PI / 2, 0, 0] });
    b.add(cyl(0.17, 0.17, 0.02, 14), '#e8c890', { p: [x, y, 0.5], r: [Math.PI / 2, 0, 0] });
    b.add(cyl(0.08, 0.08, 0.025, 10), '#d4a870', { p: [x, y, 0.505], r: [Math.PI / 2, 0, 0] });
  }
  return meshOf(b.geometry());
}
function turnip() {
  const b = new Build();
  b.add(sphere(0.42, 18), '#f6f0f2', { p: [0, 0, 0], s: [1, 0.9, 1] });
  b.add(sphere(0.41, 18), '#b05a9a', { p: [0, 0.14, 0], s: [1.02, 0.55, 1.02] });
  b.add(cone(0.1, 0.32, 8), '#f6f0f2', { p: [0, -0.48, 0], r: [Math.PI, 0, 0] });
  for (const a of [-0.55, -0.2, 0.15, 0.5]) b.add(sphere(0.16, 10), a > 0 ? '#5fae4e' : '#4f9a44', { p: [Math.sin(a) * 0.3, 0.62, 0], r: [0, 0, -a * 1.2], s: [0.55, 1.9, 0.35] });
  return meshOf(b.geometry());
}
function meal() {
  const b = new Build();
  b.add(cyl(0.62, 0.5, 0.1, 24), '#f4f0e6', { p: [0, -0.32, 0] });
  b.add(cyl(0.5, 0.5, 0.02, 24), '#e4dccc', { p: [0, -0.26, 0] });
  b.add(sphere(0.34, 16), '#d8863a', { p: [0, 0.0, 0], s: [1, 0.85, 1] });
  b.add(sphere(0.33, 16), '#9a4a6a', { p: [0, 0.1, 0], s: [1.02, 0.5, 1.02] });
  for (const z of [-0.12, 0.05, 0.2]) b.add(rbox(0.5, 0.03, 0.04, 0.01), '#6a3418', { p: [0, 0.22, z], r: [0, 0.3, 0] });
  return meshOf(b.geometry());
}
function hay() {
  const b = new Build();
  b.add(cyl(0.5, 0.5, 0.8, 20), '#ecc860', { r: [0, 0, Math.PI / 2] });
  b.add(cyl(0.36, 0.36, 0.82, 18), '#d8b048', { r: [0, 0, Math.PI / 2] });
  for (const x of [-0.2, 0.2]) b.add(new THREE.TorusGeometry(0.505, 0.025, 4, 22), '#c89a3a', { p: [x, 0, 0], r: [0, Math.PI / 2, 0] });
  return meshOf(b.geometry());
}
function coin() {
  const b = new Build();
  b.add(cyl(0.5, 0.5, 0.14, 28), '#f2c14e', { r: [Math.PI / 2 - 0.25, 0, 0] });
  b.add(new THREE.TorusGeometry(0.44, 0.04, 6, 28), '#e0a830', { p: [0, 0.02, 0.07], r: [-0.25, 0, 0] });
  b.add(new THREE.TorusGeometry(0.22, 0.035, 6, 20), '#ffe08a', { p: [0, 0.02, 0.075], r: [-0.25, 0, 0] });
  return meshOf(b.geometry());
}
function book() {
  const b = new Build();
  b.add(rbox(0.95, 1.2, 0.26, 0.06), '#5a9a4a', {});
  b.add(rbox(0.86, 1.12, 0.2, 0.03), '#fffaf0', { p: [0.07, 0, 0] });
  b.add(rbox(0.1, 1.22, 0.28, 0.04), '#3e7a34', { p: [-0.46, 0, 0] });
  b.add(sphere(0.13, 10), '#f06aa8', { p: [-0.06, 0.12, 0.13], s: [1, 1, 0.3] });
  b.add(sphere(0.13, 10), '#f06aa8', { p: [0.14, 0.12, 0.13], s: [1, 1, 0.3] });
  b.add(cone(0.2, 0.25, 4), '#f06aa8', { p: [0.04, -0.06, 0.13], r: [Math.PI, Math.PI / 4, 0], s: [1, 1, 0.35] });
  return meshOf(b.geometry());
}
function paddockMini() {
  const b = new Build();
  for (let k = 0; k < 4; k++) b.add(rbox(0.12, 0.7, 0.12, 0.03), '#a8743f', { p: [-0.75 + k * 0.5, 0.35, 0] });
  for (const y of [0.3, 0.55]) b.add(rbox(1.7, 0.08, 0.06, 0.02), '#c8945a', { p: [0, y, 0.05] });
  b.add(sphere(0.12, 8), '#5fae4e', { p: [-0.5, 0.06, 0.3], s: [1.4, 0.6, 1] });
  b.add(sphere(0.1, 8), '#5fae4e', { p: [0.4, 0.05, 0.3], s: [1.4, 0.6, 1] });
  return meshOf(b.geometry());
}

function apple() {
  const b = new Build();
  b.add(sphere(0.45, 20), '#e0483e', { s: [1.05, 0.95, 1.05] });
  b.add(sphere(0.12, 10), '#ff8a7a', { p: [-0.18, 0.2, 0.33], s: [1, 0.8, 0.5] });
  b.add(cyl(0.035, 0.045, 0.28, 6), '#7a5228', { p: [0.02, 0.48, 0], r: [0, 0, -0.2] });
  b.add(sphere(0.14, 10), '#5fae4e', { p: [0.18, 0.52, 0], r: [0, 0, -0.7], s: [1.4, 0.45, 0.8] });
  return meshOf(b.geometry());
}
function berries() {
  const b = new Build();
  const pts: [number, number, number][] = [[0, 0, 0.1], [0.28, 0.06, 0], [-0.27, 0.04, 0.02], [0.13, 0.3, -0.05], [-0.14, 0.28, 0], [0.05, -0.25, 0.05], [0.32, -0.2, -0.05], [-0.3, -0.22, 0]];
  pts.forEach(([x, y, z], k) => {
    b.add(sphere(0.17, 12), k % 2 ? '#9a6ad0' : '#b884e8', { p: [x, y, z] });
    b.add(sphere(0.045, 6), '#efe2ff', { p: [x - 0.05, y + 0.07, z + 0.14] });
  });
  b.add(sphere(0.16, 10), '#5fae4e', { p: [0.05, 0.52, -0.1], r: [0, 0, 0.5], s: [1.5, 0.45, 0.9] });
  return meshOf(b.geometry());
}

/** Basteln: Steinhammer mit Schnur */
function craftTool() {
  const b = new Build();
  b.add(cyl(0.07, 0.08, 1.3, 10), '#a8743f', { p: [0, 0, 0], r: [0, 0, -0.6] });
  b.add(new THREE.DodecahedronGeometry(0.3, 1), '#a9a6b2', { p: [0.36, 0.5, 0], s: [1.3, 0.85, 0.9], r: [0, 0, -0.6] });
  for (const k of [-0.08, 0.04]) b.add(new THREE.TorusGeometry(0.1, 0.03, 5, 12), '#e8d090', { p: [0.3 + k * 0.6, 0.42 + k, 0], r: [Math.PI / 2, 0.6, 0] });
  b.add(sphere(0.07, 8), '#e4e2ea', { p: [0.3, 0.68, 0.18], s: [1.5, 0.5, 1] });
  return meshOf(b.geometry());
}

/** alle Symbole des Spiels (Namen wie bisher) – werden beim ersten Zugriff gerendert */
const MAKERS = {
  log: () => photo('i:log', logs, { yaw: -0.6 }),
  axe: () => photo('i:axe', () => tool('axe'), { yaw: 0, tilt: 0.25, fill: 0.5 }),
  hoe: () => photo('i:hoe', () => tool('hoe'), { yaw: 0, tilt: 0.25, fill: 0.5 }),
  scythe: () => photo('i:scythe', () => tool('scythe'), { yaw: 0, tilt: 0.25, fill: 0.5 }),
  seeds: () => photo('i:seeds', () => tool('seeds'), { yaw: 0.3 }),
  bucket: () => photo('i:bucket', () => tool('bucket'), { yaw: 0.3, tilt: 0.45 }),
  can: () => photo('i:can', () => tool('can'), { yaw: -1.2, tilt: 0.35 }),
  turnip: () => photo('i:turnip', turnip, { yaw: 0, tilt: 0.25 }),
  meal: () => photo('i:meal', meal, { yaw: 0, tilt: 0.55 }),
  hay: () => photo('i:hay', hay, { yaw: -0.5 }),
  coin: () => photo('i:coin', coin, { yaw: 0, tilt: 0.2, fill: 0.52 }),
  book: () => photo('i:book', book, { yaw: 0.35, tilt: 0.2 }),
  house: () => photo('i:house', M.house, { yaw: -0.5, tilt: 0.42 }),
  stable: () => photo('i:stable', M.stable, { yaw: -0.45, tilt: 0.42 }),
  fire: () => photo('i:fire', () => M.campfire().g, { yaw: 0, tilt: 0.6 }),
  paddock: () => photo('i:paddock', paddockMini, { yaw: -0.3, tilt: 0.4 }),
  stick: () => photo('i:stick', () => M.stick(0), { yaw: 0.5, tilt: 0.7 }),
  stone: () => photo('i:stone', () => M.pebble(0), { yaw: 0.3, tilt: 0.45 }),
  craft: () => photo('i:craft', craftTool, { yaw: 0, tilt: 0.2 }),
  apple: () => photo('i:apple', apple, { yaw: 0.3, tilt: 0.25 }),
  berry: () => photo('i:berry', berries, { yaw: 0, tilt: 0.2 }),
} satisfies Record<string, () => string>;

/** Symbole als Objekt mit Eigenschaften, die erst beim Lesen entstehen */
export function lazyIcons<K extends string>(extra: Record<K, () => string>) {
  const out = {} as Record<string, string>;
  for (const [k, make] of Object.entries({ ...MAKERS, ...extra }) as [string, () => string][]) {
    let v = '';
    Object.defineProperty(out, k, { get: () => (v ||= make()), enumerable: true });
  }
  return out as Record<keyof typeof MAKERS | K, string>;
}

export const decoPhoto = (id: string) => photo(`d:${id}`, () => M.deco(id), { yaw: -0.4, tilt: 0.42 });
export const furniturePhoto = (id: string) => photo(`f:${id}`, () => furniture(id) ?? new THREE.Group(), { yaw: -0.5, tilt: 0.5 });

/** weiche Herzen (voll/leer) für die Vertrauens-Anzeige */
export function heartUrl(full: boolean) {
  const c = document.createElement('canvas');
  c.width = 54;
  c.height = 48;
  const x = c.getContext('2d')!;
  const path = () => {
    x.beginPath();
    x.moveTo(27, 44);
    x.bezierCurveTo(2, 28, 3, 6, 27, 14);
    x.bezierCurveTo(51, 6, 52, 28, 27, 44);
    x.closePath();
  };
  path();
  if (full) {
    const g = x.createLinearGradient(0, 4, 0, 44);
    g.addColorStop(0, '#ff8aa4');
    g.addColorStop(1, '#e8406a');
    x.fillStyle = g;
    x.fill();
    x.fillStyle = 'rgba(255,255,255,0.7)';
    x.beginPath();
    x.ellipse(17, 17, 5, 3.5, -0.6, 0, Math.PI * 2);
    x.fill();
  } else {
    x.fillStyle = '#f2e2cc';
    x.fill();
    x.lineWidth = 3;
    x.strokeStyle = '#d8b8a0';
    path();
    x.stroke();
  }
  return `${c.toDataURL('image/png')}#foto`;
}
