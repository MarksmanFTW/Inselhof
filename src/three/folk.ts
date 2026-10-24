/**
 * Die Bewohner in 3D: sechs knuffige Tiere (großer Kopf, kleiner Körper, Halstuch
 * in der Farbe ihres Dachs) und ihr Häuschen. Ursprung = Fußpunkt, +z = vorn.
 */
import * as THREE from 'three';
import { villagerById } from '../villagers';
import { Build, U, cone, cyl, rbox, sphere, tint, vcMat } from './engine';
import { glowMats } from './models';

export interface Animal {
  g: THREE.Group;
  /** Laufen (Hüpfen/Watscheln), freut sich (Hüpfer), Zeit */
  pose(p: { walk: number; moving: boolean; happy: number; t: number; sleep: boolean }): void;
  dispose(): void;
}

const EYE = '#2a1a16';
const CHEEK = '#ff9aa8';
/** Fell, Bauch/Schnauze, Nase */
const FUR: Record<string, [string, string, string]> = {
  hase: ['#f4ede4', '#ffffff', '#f48fb1'],
  fuchs: ['#f08a3a', '#fff6ec', '#3a2420'],
  baer: ['#a8744a', '#e8c8a0', '#3a2420'],
  katze: ['#b4b0c4', '#f4f0f6', '#f48fb1'],
  ente: ['#fffaf0', '#fffaf0', '#ff9a3a'],
  schaf: ['#fffaf4', '#f2dcc8', '#8a5a5a'],
};

const geoCache = new Map<string, { body: THREE.BufferGeometry; tail: THREE.BufferGeometry | null }>();
function geos(id: string) {
  const hit = geoCache.get(id);
  if (hit) return hit;
  const def = villagerById(id);
  const [fur, light, nose] = FUR[id] ?? FUR.hase;
  const scarf = def?.roof ?? '#e8607a';
  const b = new Build();
  const duck = id === 'ente';
  const sheep = id === 'schaf';
  // Füße, Körper, Bauch, Ärmchen
  for (const x of [-1, 1]) b.add(sphere(0.11, 10), duck ? '#ff9a3a' : tint(fur, -0.12), { p: [x * 0.14, 0.06, 0.05], s: duck ? [1.3, 0.45, 1.6] : [1, 0.7, 1.3] });
  b.add(sphere(0.3, 18), fur, { p: [0, 0.36, 0], s: [1, 1.05, 0.92] });
  b.add(sphere(0.2, 14), light, { p: [0, 0.33, 0.13], s: [1, 1.1, 0.6] });
  for (const x of [-1, 1]) b.add(sphere(duck ? 0.13 : 0.085, 10), duck ? tint(fur, -0.06) : fur, { p: [x * 0.29, 0.4, 0.02], s: duck ? [0.45, 0.9, 1.3] : [1, 1.4, 1], r: [0, 0, x * 0.4] });
  // Halstuch
  b.add(new THREE.TorusGeometry(0.2, 0.06, 8, 18), scarf, { p: [0, 0.6, 0], r: [Math.PI / 2, 0, 0], s: [1, 1, 0.8] });
  b.add(cone(0.09, 0.16, 6), scarf, { p: [0.06, 0.53, 0.2], r: [-0.3, 0, Math.PI] });
  // Kopf
  const hy = 0.92;
  b.add(sphere(0.36, 22), fur, { p: [0, hy, 0], s: [1.05, 0.95, 0.95] });
  // Augen mit Glanz, Bäckchen
  for (const x of [-1, 1]) {
    b.add(sphere(0.055, 10), EYE, { p: [x * 0.13, hy + 0.04, 0.31], s: [0.9, 1.15, 0.6] });
    b.add(sphere(0.02, 6), '#ffffff', { p: [x * 0.13 + 0.02, hy + 0.075, 0.345] });
    b.add(sphere(0.06, 8), CHEEK, { p: [x * 0.22, hy - 0.07, 0.27], s: [1.2, 0.7, 0.5] });
  }
  if (duck) {
    // flacher Schnabel und ein Federbüschel
    b.add(sphere(0.13, 12), nose, { p: [0, hy - 0.06, 0.33], s: [1.2, 0.4, 0.9] });
    b.add(sphere(0.1, 10), tint(nose, -0.1), { p: [0, hy - 0.1, 0.32], s: [1.1, 0.3, 0.8] });
    for (const a of [-0.35, 0, 0.35]) b.add(sphere(0.05, 8), '#fffaf0', { p: [Math.sin(a) * 0.08, hy + 0.38, -0.02], s: [0.6, 1.8, 0.6], r: [0, 0, -a] });
    b.add(sphere(0.07, 8), scarf, { p: [0.18, hy + 0.27, 0.05] });
  } else {
    // Schnauze mit Näschen und Lächeln
    const muzzle = sheep ? light : light;
    b.add(sphere(0.13, 12), muzzle, { p: [0, hy - 0.08, 0.27], s: [1.25, 0.8, 0.8] });
    b.add(sphere(0.045, 8), nose, { p: [0, hy - 0.03, 0.37], s: [1.3, 0.9, 0.8] });
    b.add(new THREE.TorusGeometry(0.045, 0.012, 5, 10, Math.PI), '#6a3a2a', { p: [0, hy - 0.11, 0.36], r: [0, 0, Math.PI] });
  }
  if (id === 'hase') {
    for (const x of [-1, 1]) {
      b.add(sphere(0.085, 12), fur, { p: [x * 0.12, hy + 0.48, -0.04], s: [1, 3.2, 0.7], r: [0, 0, -x * 0.12] });
      b.add(sphere(0.05, 10), '#ffc4d4', { p: [x * 0.12, hy + 0.48, 0.0], s: [1, 4.2, 0.4], r: [0, 0, -x * 0.12] });
    }
    for (const x of [-1, 1]) b.add(rbox(0.035, 0.05, 0.02, 0.01), '#ffffff', { p: [x * 0.022, hy - 0.11, 0.37] });
  }
  if (id === 'fuchs' || id === 'katze') {
    for (const x of [-1, 1]) {
      b.add(cone(0.12, 0.24, 8), fur, { p: [x * 0.2, hy + 0.32, -0.02], r: [0, 0, -x * 0.35] });
      b.add(cone(0.07, 0.14, 8), id === 'fuchs' ? '#3a2420' : '#ffc4d4', { p: [x * 0.2 + x * 0.015, hy + 0.32 + (id === 'fuchs' ? 0.06 : -0.02), 0.03], r: [0, 0, -x * 0.35] });
    }
    if (id === 'fuchs') b.add(sphere(0.12, 10), light, { p: [0, hy - 0.12, 0.2], s: [1.6, 0.7, 0.8] });
    if (id === 'katze') {
      // Schnurrhaare und Streifen
      for (const x of [-1, 1]) for (const r of [-0.12, 0.12]) b.add(rbox(0.2, 0.012, 0.01, 0.004), '#6a6478', { p: [x * 0.24, hy - 0.06 + r * 0.3, 0.32], r: [0, -x * 0.3, r * x] });
      for (const x of [-0.08, 0, 0.08]) b.add(rbox(0.04, 0.12, 0.04, 0.015), tint(fur, -0.2), { p: [x, hy + 0.3, 0.12], r: [-0.5, 0, 0] });
    }
  }
  if (id === 'baer') {
    for (const x of [-1, 1]) {
      b.add(sphere(0.12, 12), fur, { p: [x * 0.27, hy + 0.27, -0.03], s: [1, 1, 0.6] });
      b.add(sphere(0.07, 10), light, { p: [x * 0.27, hy + 0.27, 0.02], s: [1, 1, 0.4] });
    }
  }
  if (sheep) {
    // Wolle: auf dem Körper und als Löckchen auf dem Kopf, Ohren seitlich
    const wool = '#ffffff';
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      b.add(sphere(0.14, 10), wool, { p: [Math.cos(a) * 0.24, 0.38 + Math.sin(k * 1.7) * 0.1, Math.sin(a) * 0.2 - 0.02] });
    }
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      b.add(sphere(0.12, 10), wool, { p: [Math.cos(a) * 0.16, hy + 0.28, Math.sin(a) * 0.14 - 0.04] });
    }
    for (const x of [-1, 1]) b.add(sphere(0.08, 10), '#5a4a48', { p: [x * 0.37, hy + 0.08, -0.02], s: [1.8, 0.7, 0.9], r: [0, 0, -x * 0.3] });
  }
  const body = b.geometry();
  // Schwanz (wedelt)
  const tb = new Build();
  if (id === 'hase') tb.add(sphere(0.1, 10), '#ffffff');
  else if (id === 'fuchs') {
    tb.add(sphere(0.13, 12), fur, { p: [0, 0.08, -0.12], s: [1, 1, 2] });
    tb.add(sphere(0.09, 10), '#fff6ec', { p: [0, 0.16, -0.36], s: [1, 1, 1.3] });
  } else if (id === 'katze') {
    tb.add(cyl(0.035, 0.045, 0.45, 8), fur, { p: [0, 0.2, -0.06], r: [-0.35, 0, 0] });
    tb.add(sphere(0.045, 8), tint(fur, -0.2), { p: [0, 0.42, -0.14] });
  } else if (id === 'ente') tb.add(cone(0.08, 0.14, 6), '#fffaf0', { p: [0, 0.04, -0.05], r: [-1.9, 0, 0] });
  else if (id === 'baer') tb.add(sphere(0.07, 8), fur);
  const tail = tb.empty ? null : tb.geometry();
  const out = { body, tail };
  geoCache.set(id, out);
  return out;
}

/** ein Bewohner zum Hinstellen (Fotos und Insel) */
export function makeAnimal(id: string): Animal {
  const { body, tail } = geos(id);
  const g = new THREE.Group();
  const rig = new THREE.Group();
  g.add(rig);
  const m = new THREE.Mesh(body, vcMat(0.75));
  m.castShadow = true;
  rig.add(m);
  let t: THREE.Mesh | null = null;
  if (tail) {
    t = new THREE.Mesh(tail, vcMat(0.8));
    t.castShadow = true;
    t.position.set(0, 0.3, -0.27);
    rig.add(t);
  }
  const hop = id === 'hase' || id === 'schaf';
  return {
    g,
    pose({ walk, moving, happy, t: time, sleep }) {
      // Hase und Schaf hüpfen, die anderen watscheln
      const step = Math.abs(Math.sin(walk));
      rig.position.y = moving ? (hop ? step * 0.16 : step * 0.05) : happy > 0 ? Math.abs(Math.sin(time * 12)) * 0.18 * happy : 0;
      rig.rotation.z = moving && !hop ? Math.sin(walk) * 0.12 : 0;
      rig.rotation.x = sleep ? 0.12 : 0;
      const breathe = 1 + Math.sin(time * (sleep ? 1.6 : 2.4)) * 0.02;
      rig.scale.set(1 / Math.sqrt(breathe), breathe, 1 / Math.sqrt(breathe));
      if (t) t.rotation.y = Math.sin(time * (moving || happy > 0 ? 9 : 2.5)) * (id === 'katze' ? 0.35 : 0.25);
    },
    dispose() {
      (m.material as THREE.Material).dispose();
      if (t) (t.material as THREE.Material).dispose();
    },
  };
}

/** Häuschen eines Bewohners (Dachfarbe nach Bewohner) */
export const HUT_Z = -5 * U;
const hutCache = new Map<string, THREE.BufferGeometry>();
export function hut(id: string) {
  const roof = villagerById(id)?.roof ?? '#e0705a';
  let geo = hutCache.get(roof);
  if (!geo) {
    const b = new Build();
    const z = HUT_Z;
    b.add(rbox(2.9, 0.22, 1.75, 0.07), '#aaa6b6', { p: [0, 0.11, z] });
    b.add(rbox(2.6, 1.45, 1.5, 0.12), '#fff6e6', { p: [0, 0.95, z] });
    // rundes Dach (halbe Röhre) mit Überstand
    b.add(new THREE.CylinderGeometry(1.0, 1.0, 2.95, 22, 1, false, 0, Math.PI), roof, { p: [0, 1.6, z], r: [0, 0, Math.PI / 2], s: [0.78, 1, 0.98] });
    b.add(rbox(3.0, 0.1, 0.14, 0.04), tint(roof, -0.18), { p: [0, 1.62, z + 0.95] });
    b.add(sphere(0.12, 10), tint(roof, -0.18), { p: [0, 2.38, z] });
    // runde Tür, Klinke, Stufe
    b.add(rbox(0.66, 0.8, 0.1, 0.05), '#a8743f', { p: [0, 0.62, z + 0.76] });
    b.add(cyl(0.33, 0.33, 0.1, 16), '#a8743f', { p: [0, 1.02, z + 0.76], r: [Math.PI / 2, 0, 0] });
    b.add(sphere(0.05, 8), '#ffd84a', { p: [0.2, 0.7, z + 0.83] });
    b.add(rbox(0.9, 0.1, 0.36, 0.04), '#b8b4c2', { p: [0, 0.05, z + 0.95] });
    // rundes Fenster mit Blumenkasten
    b.add(new THREE.TorusGeometry(0.24, 0.05, 8, 18), '#8a5a32', { p: [0.82, 1.08, z + 0.76] });
    b.add(rbox(0.6, 0.14, 0.2, 0.04), '#9a6a40', { p: [0.82, 0.76, z + 0.84] });
    for (let k = 0; k < 4; k++) b.add(sphere(0.07, 8), ['#f48fc0', '#ffffff', '#ffd84a', '#b48af0'][k], { p: [0.66 + k * 0.11, 0.88, z + 0.86] });
    // Briefkasten
    b.add(cyl(0.035, 0.035, 0.7, 6), '#8a5a32', { p: [-1.05, 0.35, z + 1.05] });
    b.add(rbox(0.22, 0.18, 0.3, 0.06), roof, { p: [-1.05, 0.75, z + 1.05] });
    geo = b.geometry();
    hutCache.set(roof, geo);
  }
  const g = new THREE.Group();
  const m = new THREE.Mesh(geo, vcMat(0.8));
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  const win = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16), glowMats.window);
  win.position.set(0.82, 1.08, HUT_Z + 0.78);
  g.add(win);
  return g;
}
