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
import { fishById } from '../fish';
import { hut, makeAnimal } from './folk';

const meshOf = (g: THREE.BufferGeometry) => new THREE.Mesh(g, vcMat(0.6));

function tool(id: string) {
  const g = new THREE.Group();
  const m = meshOf(toolGeo(id));
  // Stiel schräg nach oben rechts, Kopf oben
  if (id === 'axe' || id === 'hoe' || id === 'scythe' || id === 'rod') {
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

/** Bratfisch auf dem Teller */
function grilled() {
  const g = new THREE.Group();
  const b = new Build();
  b.add(cyl(0.66, 0.54, 0.1, 24), '#f4f0e6', { p: [0, -0.32, 0] });
  b.add(cyl(0.54, 0.54, 0.02, 24), '#e4dccc', { p: [0, -0.26, 0] });
  b.add(sphere(0.1, 8), '#f4d04a', { p: [0.42, -0.2, 0.18], s: [1, 0.5, 1] });
  b.add(sphere(0.07, 8), '#5fae4e', { p: [-0.4, -0.22, 0.22], s: [1.4, 0.4, 0.8] });
  g.add(meshOf(b.geometry()));
  const f = M.fishModel('grill', ['#c8843a', '#e8b060', '#a8642a'], 0.85);
  f.position.y = -0.1;
  f.rotation.x = -Math.PI / 2 + 0.15;
  g.add(f);
  return g;
}

/** Schüssel (Obstsalat, Fischsuppe) */
function bowl(fill: (b: Build) => void) {
  const b = new Build();
  b.add(new THREE.SphereGeometry(0.55, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), '#f4f0e6', { p: [0, 0.05, 0] });
  b.add(new THREE.TorusGeometry(0.55, 0.04, 6, 24), '#e4dccc', { p: [0, 0.05, 0], r: [Math.PI / 2, 0, 0] });
  b.add(cyl(0.2, 0.24, 0.08, 16), '#e4dccc', { p: [0, -0.5, 0] });
  fill(b);
  return meshOf(b.geometry());
}
function fruitSalad() {
  return bowl((b) => {
    b.add(cyl(0.5, 0.5, 0.04, 20), '#f4e0a0', { p: [0, 0.0, 0] });
    const cols = ['#e0483e', '#9a6ad0', '#ff9a3a', '#b884e8', '#f4d04a', '#e0483e', '#5fae4e'];
    for (let k = 0; k < 9; k++) {
      const a = k * 2.4;
      const r = 0.12 + (k % 3) * 0.13;
      b.add(sphere(k % 2 ? 0.1 : 0.13, 10), cols[k % cols.length], { p: [Math.cos(a) * r, 0.08, Math.sin(a) * r] });
    }
  });
}
function fishSoup() {
  return bowl((b) => {
    b.add(cyl(0.5, 0.5, 0.04, 20), '#f0b060', { p: [0, 0.0, 0] });
    for (let k = 0; k < 5; k++) b.add(sphere(0.07, 8), k % 2 ? '#f6f0f2' : '#5fae4e', { p: [Math.cos(k * 1.3) * 0.28, 0.04, Math.sin(k * 1.3) * 0.28] });
    b.add(sphere(0.12, 10), '#d8dcec', { p: [0.05, 0.06, -0.05], s: [2.2, 0.6, 0.9] });
    for (const x of [-0.2, 0.05, 0.3]) b.add(sphere(0.06, 6), '#ffffff', { p: [x, 0.45 + Math.abs(x) * 0.4, 0], s: [0.8, 1.8, 0.8] });
  });
}
function applePie() {
  const b = new Build();
  b.add(cyl(0.66, 0.56, 0.1, 24), '#f4f0e6', { p: [0, -0.3, 0] });
  b.add(cyl(0.55, 0.5, 0.26, 24), '#d89a48', { p: [0, -0.12, 0] });
  b.add(cyl(0.53, 0.55, 0.06, 24), '#e8b060', { p: [0, 0.03, 0] });
  for (let k = 0; k < 4; k++) b.add(rbox(1.0, 0.04, 0.08, 0.02), '#c8843a', { p: [0, 0.07, -0.3 + k * 0.2] });
  for (let k = 0; k < 4; k++) b.add(rbox(0.08, 0.04, 1.0, 0.02), '#c8843a', { p: [-0.3 + k * 0.2, 0.09, 0] });
  b.add(sphere(0.08, 8), '#e0483e', { p: [0.18, 0.13, 0.08] });
  b.add(sphere(0.06, 8), '#5fae4e', { p: [0.26, 0.13, 0.05], s: [1.4, 0.4, 0.8] });
  return meshOf(b.geometry());
}
function jam() {
  const g = new THREE.Group();
  const b = new Build();
  b.add(cyl(0.36, 0.38, 0.7, 20), '#7a3a8a', { p: [0, -0.1, 0] });
  b.add(cyl(0.3, 0.3, 0.08, 20), '#e8e0d0', { p: [0, 0.29, 0] });
  b.add(cyl(0.42, 0.42, 0.06, 20), '#e0485a', { p: [0, 0.34, 0] });
  for (let k = 0; k < 8; k++) b.add(sphere(0.05, 6), '#ffffff', { p: [Math.cos(k * 0.78) * 0.38, 0.33, Math.sin(k * 0.78) * 0.38] });
  b.add(rbox(0.42, 0.26, 0.04, 0.03), '#fff6dc', { p: [0, -0.08, 0.37] });
  b.add(sphere(0.06, 8), '#9a6ad0', { p: [-0.07, -0.08, 0.4] });
  b.add(sphere(0.06, 8), '#b884e8', { p: [0.07, -0.06, 0.4] });
  g.add(meshOf(b.geometry()));
  const glass = new THREE.Mesh(cyl(0.38, 0.4, 0.74, 20).translate(0, -0.1, 0), new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.25, roughness: 0.1 }));
  g.add(glass);
  return g;
}
/** Wanderschuh mit Schnürsenkeln */
function shoe() {
  const b = new Build();
  b.add(rbox(0.5, 0.75, 0.55, 0.2, 3), '#a8743f', { p: [-0.15, 0.1, 0] });
  b.add(rbox(1.05, 0.36, 0.6, 0.18, 3), '#a8743f', { p: [0.12, -0.18, 0] });
  b.add(rbox(1.12, 0.12, 0.64, 0.05), '#5a3a26', { p: [0.13, -0.38, 0] });
  b.add(rbox(0.54, 0.14, 0.6, 0.06), '#c85a48', { p: [-0.15, 0.46, 0] });
  for (let k = 0; k < 3; k++) b.add(rbox(0.3, 0.04, 0.05, 0.02), '#fff6dc', { p: [-0.02 + k * 0.08, 0.25 - k * 0.15, 0.29], r: [0, 0, -0.5] });
  return meshOf(b.geometry());
}
/** Hufeisen mit Nägeln, Öffnung nach unten */
function horseshoe() {
  const b = new Build();
  const rot = -0.175 * Math.PI;
  b.add(new THREE.TorusGeometry(0.42, 0.12, 10, 22, Math.PI * 1.35), '#b8bcc8', { r: [0, 0, rot] });
  for (let k = 0; k < 6; k++) {
    const a = rot + (0.08 + (k / 5) * 0.84) * Math.PI * 1.35;
    b.add(sphere(0.035, 6), '#5a5a68', { p: [Math.cos(a) * 0.42, Math.sin(a) * 0.42, 0.11] });
  }
  return meshOf(b.geometry());
}
/** Bestellbrett mit drei Zetteln */
function boardIcon() {
  return M.orderBoard();
}

/** Rucksack: Leinensack mit Klappe, Riemen und Schnalle */
function backpack() {
  const b = new Build();
  b.add(rbox(0.85, 1.0, 0.5, 0.2, 3), '#c8945a', { p: [0, -0.05, 0] });
  b.add(rbox(0.88, 0.42, 0.54, 0.18, 3), '#a8743f', { p: [0, 0.32, 0.02] });
  b.add(rbox(0.5, 0.36, 0.12, 0.08, 2), '#b8844a', { p: [0, -0.22, 0.28] });
  for (const x of [-0.22, 0.22]) b.add(rbox(0.09, 0.62, 0.04, 0.02), '#6a4428', { p: [x, 0.12, 0.29] });
  b.add(rbox(0.13, 0.11, 0.05, 0.02), '#e8c860', { p: [0, 0.14, 0.31] });
  b.add(new THREE.TorusGeometry(0.16, 0.04, 6, 14, Math.PI), '#6a4428', { p: [0, 0.55, 0] });
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
  bag: () => photo('i:bag', backpack, { yaw: 0.35, tilt: 0.2 }),
  board: () => photo('i:board', boardIcon, { yaw: 0.2, tilt: 0.1, fill: 0.62 }),
  obstsalat: () => photo('i:obstsalat', fruitSalad, { yaw: 0, tilt: 0.6 }),
  fischsuppe: () => photo('i:fischsuppe', fishSoup, { yaw: 0, tilt: 0.6 }),
  apfelkuchen: () => photo('i:apfelkuchen', applePie, { yaw: 0.3, tilt: 0.55 }),
  marmelade: () => photo('i:marmelade', jam, { yaw: 0.2, tilt: 0.25 }),
  apple: () => photo('i:apple', apple, { yaw: 0.3, tilt: 0.25 }),
  rod: () => photo('i:rod', () => tool('rod'), { yaw: 0, tilt: 0.25, fill: 0.5 }),
  grilled: () => photo('i:grilled', grilled, { yaw: 0, tilt: 0.55 }),
  berry: () => photo('i:berry', berries, { yaw: 0, tilt: 0.2 }),
  hut: () => photo('i:hut', () => hut('hase'), { yaw: -0.45, tilt: 0.42 }),
  bighouse: () => photo('i:bighouse', () => M.house(true), { yaw: -0.5, tilt: 0.36 }),
  beet: () => photo('i:beet', M.beet, { yaw: -0.3, tilt: 0.7 }),
  coach: () => photo('i:coach', M.coachStop, { yaw: -0.35, tilt: 0.4 }),
  shoes: () => photo('i:shoes', shoe, { yaw: 0.5, tilt: 0.2 }),
  hooves: () => photo('i:hooves', horseshoe, { yaw: 0, tilt: 0.1, fill: 0.5 }),
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

/** Fisch fürs Album und den Händler */
export function fishPhoto(id: string) {
  const f = fishById(id);
  return photo(`fish:${id}`, () => M.fishModel(id, f?.colors ?? ['#888', '#ccc', '#666'], f?.size ?? 0.8), { yaw: id === 'stiefel' ? 0.5 : 0.15, tilt: 0.2, fill: 0.8 });
}

/** Bewohner fürs Fenster, den Knopf und das Album (Kopf und Halstuch groß im Bild) */
export function villagerPhoto(id: string) {
  return photo(
    `folk:${id}`,
    () => {
      const a = makeAnimal(id);
      a.pose({ walk: 0, moving: false, happy: 0, t: 0, sleep: false });
      return a.g;
    },
    { yaw: -0.3, tilt: 0.18, fill: 0.46 },
  );
}
