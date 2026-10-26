/**
 * Kleine 3D-Modelle für Feste und Strandgut: Kürbis und Geschenk zum Aufheben,
 * Muscheln, Seestern, Koralle, Perle, Treibholz, Flaschenpost, der Festladen am Steg
 * und Fledermäuse für Halloween-Nächte. Ursprung = Fußpunkt.
 */
import * as THREE from 'three';
import { Build, cone, curve, cyl, rbox, sphere, tint, vcMat } from './engine';
import { glowMats, pumpkinInto } from './models';
import type { FestId } from '../season';

const cache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry) {
  let g = cache.get(key);
  if (!g) cache.set(key, (g = make()));
  return g;
}
const meshOf = (g: THREE.BufferGeometry, shadow = true) => {
  const m = new THREE.Mesh(g, vcMat(0.7));
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
};
const glassMat = curve(new THREE.MeshStandardMaterial({ color: '#bfe8d8', transparent: true, opacity: 0.55, roughness: 0.1 }));

/** Fundstück eines Fests: Kürbis (Halloween) oder Geschenk (Winterfest) */
export function festFind(fest: FestId) {
  const g = new THREE.Group();
  if (fest === 'halloween') {
    const b = new Build();
    pumpkinInto(b, g, 0, 0, 0, 1, false);
    g.add(meshOf(b.geometry()));
  } else {
    g.add(
      meshOf(
        cached('gift', () => {
          const b = new Build();
          b.add(rbox(0.5, 0.42, 0.5, 0.05), '#e0485a', { p: [0, 0.21, 0] });
          b.add(rbox(0.52, 0.43, 0.08, 0.01), '#ffd23f', { p: [0, 0.21, 0] });
          b.add(rbox(0.08, 0.43, 0.52, 0.01), '#ffd23f', { p: [0, 0.21, 0] });
          for (const s of [-1, 1]) b.add(sphere(0.09, 8), '#ffd23f', { p: [s * 0.08, 0.47, 0], s: [1.4, 0.7, 0.8], r: [0, 0, s * 0.4] });
          return b.geometry();
        }),
      ),
    );
  }
  return g;
}

/** Strandgut (id aus beach.ts) bzw. Flaschenpost */
export function beachItem(id: string) {
  const g = new THREE.Group();
  if (id === 'bottle') {
    const glass = new THREE.Mesh(cached('bottle-glass', () => cyl(0.13, 0.13, 0.62, 12).rotateZ(Math.PI / 2)), glassMat);
    glass.position.set(0, 0.13, 0);
    glass.rotation.y = 0.5;
    g.add(glass);
    const inner = meshOf(
      cached('bottle-in', () => {
        const b = new Build();
        b.add(cyl(0.07, 0.07, 0.4, 8), '#fff6dc', { r: [0, 0, Math.PI / 2] });
        b.add(cyl(0.075, 0.075, 0.03, 8), '#e0485a', { r: [0, 0, Math.PI / 2] });
        b.add(cyl(0.05, 0.06, 0.18, 8), '#bfe8d8', { p: [0.38, 0, 0], r: [0, 0, Math.PI / 2] });
        b.add(cyl(0.055, 0.055, 0.08, 8), '#a8743f', { p: [0.5, 0, 0], r: [0, 0, Math.PI / 2] });
        return b.geometry();
      }),
      false,
    );
    inner.position.set(0, 0.13, 0);
    inner.rotation.y = 0.5;
    g.add(inner);
    return g;
  }
  g.add(
    meshOf(
      cached(`sea-${id}`, () => {
        const b = new Build();
        if (id === 'muschel') {
          for (let k = 0; k < 7; k++) b.add(rbox(0.07, 0.05, 0.34, 0.02), k % 2 ? '#f6d6de' : '#f0b8c8', { p: [(k - 3) * 0.055, 0.05, 0], r: [0, (k - 3) * 0.16, 0] });
          b.add(sphere(0.2, 10), '#f6d6de', { p: [0, 0.04, 0.02], s: [1, 0.35, 0.9] });
        } else if (id === 'schnecke') {
          for (let k = 0; k < 6; k++) b.add(sphere(0.16 - k * 0.022, 10), k % 2 ? '#e8c8a0' : '#d8a878', { p: [k * 0.035, 0.1 + k * 0.035, k * -0.01] });
          b.add(sphere(0.12, 8), '#f4e2c8', { p: [-0.12, 0.07, 0.02], s: [1.2, 0.7, 0.9] });
        } else if (id === 'jakobsmuschel') {
          for (let k = 0; k < 9; k++) b.add(cone(0.06, 0.3, 4), k % 2 ? '#f4c86a' : '#f8dc98', { p: [Math.sin((k - 4) * 0.22) * 0.15, 0.04, Math.cos((k - 4) * 0.22) * 0.15 - 0.08], r: [Math.PI / 2, (k - 4) * 0.22, 0] });
          b.add(rbox(0.16, 0.05, 0.08, 0.02), '#e8b850', { p: [0, 0.03, -0.12] });
        } else if (id === 'seestern') {
          for (let k = 0; k < 5; k++) {
            const a = (k / 5) * Math.PI * 2;
            b.add(cone(0.08, 0.32, 6), '#ff8a4a', { p: [Math.cos(a) * 0.15, 0.04, Math.sin(a) * 0.15], r: [0, Math.PI - a, Math.PI / 2], s: [0.45, 1, 1] });
          }
          b.add(sphere(0.1, 8), '#ff9a5a', { p: [0, 0.05, 0], s: [1, 0.5, 1] });
        } else if (id === 'koralle') {
          b.add(cyl(0.04, 0.06, 0.3, 6), '#f87aa0', { p: [0, 0.15, 0] });
          for (const [x, z, r] of [[0.1, 0, -0.6], [-0.1, 0.05, 0.6], [0, -0.1, 0.4]] as const) b.add(cyl(0.025, 0.04, 0.24, 6), '#f87aa0', { p: [x, 0.3, z], r: [r * 0.6, 0, r] });
          for (const [x, y, z] of [[0.18, 0.4, 0], [-0.18, 0.4, 0.08], [0, 0.46, -0.14], [0.02, 0.32, 0.02]] as const) b.add(sphere(0.045, 6), '#ffa0bc', { p: [x, y, z] });
        } else if (id === 'perle') {
          b.add(sphere(0.22, 12), '#6a7a9a', { p: [0, 0.05, 0], s: [1, 0.35, 0.9] });
          b.add(sphere(0.21, 12), '#8a9aba', { p: [0, 0.18, -0.1], s: [1, 0.3, 0.85], r: [-0.8, 0, 0] });
          b.add(sphere(0.09, 12), '#fff8f0', { p: [0, 0.13, 0.03] });
        } else if (id === 'treibholz') {
          b.add(cyl(0.07, 0.09, 0.8, 8), '#c8b49a', { p: [0, 0.07, 0], r: [0, 0.3, Math.PI / 2] });
          b.add(cyl(0.035, 0.045, 0.3, 6), '#c8b49a', { p: [0.15, 0.1, 0.1], r: [0.8, 0.3, Math.PI / 2] });
        }
        return b.geometry();
      }),
      false,
    ),
  );
  return g;
}

/** Festladen am Steg (Kürbisstand bzw. Festtagsstand) */
export function festStall(fest: FestId) {
  const g = new THREE.Group();
  const halloween = fest === 'halloween';
  const [a, c] = halloween ? ['#f0862a', '#6a4ab0'] : ['#e0485a', '#ffffff'];
  g.add(
    meshOf(
      cached(`stall-${fest}`, () => {
        const b = new Build();
        b.add(rbox(1.9, 0.75, 0.8, 0.06), '#a8743f', { p: [0, 0.38, -0.4] });
        b.add(rbox(2.0, 0.08, 0.9, 0.03), '#8a5a32', { p: [0, 0.78, -0.4] });
        for (const x of [-0.9, 0.9]) for (const z of [-0.75, -0.05]) b.add(cyl(0.05, 0.05, 1.7, 6), '#8a5a32', { p: [x, 0.85, z] });
        // gestreiftes Dach
        for (let k = 0; k < 6; k++) b.add(rbox(0.34, 0.06, 1.05, 0.02), k % 2 ? c : a, { p: [-0.85 + k * 0.34, 1.75, -0.38], r: [0.25, 0, 0] });
        for (let k = 0; k < 6; k++) b.add(cone(0.17, 0.2, 3), k % 2 ? c : a, { p: [-0.85 + k * 0.34, 1.52, 0.14], r: [Math.PI, 0, 0] });
        // Schild
        b.add(rbox(1.1, 0.3, 0.05, 0.03), '#fff6dc', { p: [0, 1.98, 0.02] });
        if (halloween) {
          for (const x of [-0.6, 0.6]) pumpkinInto(b, new THREE.Group(), x, 0.82, -0.4, 0.7, false);
          for (let k = 0; k < 7; k++) b.add(sphere(0.06, 6), ['#ff5a7a', '#ffd23f', '#7cf08a', '#6ad0ff'][k % 4], { p: [-0.25 + k * 0.08, 0.86, -0.3 + (k % 2) * 0.1] });
          b.add(cone(0.2, 0.36, 10), '#2e2a36', { p: [0.0, 2.32, 0.02] });
          b.add(cyl(0.3, 0.3, 0.03, 12), '#2e2a36', { p: [0, 2.14, 0.02] });
        } else {
          for (const [x, col] of [[-0.6, '#4a8ad0'], [0.55, '#5fae4e']] as const) {
            b.add(rbox(0.3, 0.26, 0.3, 0.03), col, { p: [x, 0.95, -0.4] });
            b.add(rbox(0.32, 0.27, 0.05, 0.01), '#ffd23f', { p: [x, 0.95, -0.4] });
          }
          for (let k = 0; k < 6; k++) b.add(cyl(0.07, 0.07, 0.03, 10), '#d8a060', { p: [-0.2 + k * 0.08, 0.84, -0.35 + (k % 2) * 0.1] });
          for (let k = 0; k < 9; k++) b.add(sphere(0.06, 6), '#3a8a4a', { p: [-0.9 + k * 0.225, 1.47 - Math.sin((k / 8) * Math.PI) * 0.12, 0.16] });
        }
        return b.geometry();
      }),
    ),
  );
  if (!halloween) {
    // Lichterkette
    const l = new Build();
    for (let k = 0; k < 9; k++) l.add(sphere(0.05, 6), ['#ff5a5a', '#ffd23f', '#6ad0ff'][k % 3], { p: [-0.9 + k * 0.225, 1.42 - Math.sin((k / 8) * Math.PI) * 0.12, 0.2] });
    g.add(new THREE.Mesh(l.geometry(), glowMats.bulbs));
  } else {
    const lan = new Build();
    pumpkinInto(lan, g, 0.95, 0, 0.35, 0.8, true);
    g.add(meshOf(lan.geometry()));
  }
  return g;
}

/** Fledermaus: Körper und zwei Flügel (flattern) */
export function bat() {
  const g = new THREE.Group();
  const body = meshOf(
    cached('bat-body', () => {
      const b = new Build();
      b.add(sphere(0.14, 10), '#3a3048', { s: [0.9, 1, 1.1] });
      for (const x of [-1, 1]) b.add(cone(0.05, 0.12, 4), '#3a3048', { p: [x * 0.07, 0.15, 0.04] });
      for (const x of [-1, 1]) b.add(sphere(0.025, 6), '#ffd23f', { p: [x * 0.05, 0.04, 0.13] });
      return b.geometry();
    }),
    false,
  );
  g.add(body);
  const wingGeo = cached('bat-wing', () => {
    const b = new Build();
    b.add(sphere(0.2, 8), tint('#3a3048', 0.1), { p: [0.22, 0, 0], s: [1.2, 0.12, 0.7] });
    b.add(sphere(0.12, 6), tint('#3a3048', 0.1), { p: [0.4, -0.02, -0.08], s: [1, 0.12, 0.7] });
    return b.geometry();
  });
  const wings: THREE.Mesh[] = [];
  for (const s of [1, -1]) {
    const w = meshOf(wingGeo, false);
    w.scale.x = s;
    g.add(w);
    wings.push(w);
  }
  return { g, wings };
}
