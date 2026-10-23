/**
 * Modelle der Insel aus Grundformen im Knubbel-Stil: Bäume, Palmen, Büsche,
 * Steine, Gras, Stümpfe, Häuser, Stall, Koppelzaun, Lagerfeuer, Deko und das
 * Händler-Boot. Der Ursprung jedes Modells ist sein Fußpunkt (wie im Spiel),
 * +z zeigt nach vorn (Süden, zur Kamera).
 */
import * as THREE from 'three';
import { GATE, PADDOCK_FOOT } from '../horses';
import { Build, U, cone, curve, cyl, dot, mat, rbox, seeded, sphere, strand, tint, vcMat } from './engine';

const cache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry) {
  let g = cache.get(key);
  if (!g) cache.set(key, (g = make()));
  return g;
}
function meshOf(geo: THREE.BufferGeometry, rough = 0.8, shadow = true) {
  const m = new THREE.Mesh(geo, vcMat(rough));
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

/** Leuchtendes (Fenster, Laternen, Feuer): Stärke folgt der Nacht */
export const glowMats = {
  window: curve(new THREE.MeshStandardMaterial({ color: '#ffe8a8', emissive: '#ffb84a', emissiveIntensity: 0.25, roughness: 0.4 })),
  lamp: curve(new THREE.MeshStandardMaterial({ color: '#fff2c0', emissive: '#ffc860', emissiveIntensity: 0.3, roughness: 0.4 })),
  flame: curve(new THREE.MeshBasicMaterial({ color: '#ffb02e' })),
  flame2: curve(new THREE.MeshBasicMaterial({ color: '#ffe680' })),
};

// ---------- Natur ----------
const GREENS = ['#5fb35a', '#6cc46a', '#58a85a', '#4fa04f'];
const FRUIT = ['#e0483e', '#ff9a3a', '#f4d04a'];

/** Baum: Stamm und Krone getrennt (die Krone wiegt sich im Wind) */
export function tree(variant: number) {
  const v = variant % 3;
  const g = new THREE.Group();
  const trunk = meshOf(
    cached(`trunk${v}`, () => {
      const b = new Build();
      b.add(cyl(0.2, 0.32, 1.9, 10), '#9a6a40', { p: [0, 0.95, 0] });
      b.add(sphere(0.2, 8), '#8a5a34', { p: [0.24, 0.08, 0.05], s: [1.3, 0.5, 0.8] });
      b.add(sphere(0.2, 8), '#8a5a34', { p: [-0.2, 0.08, -0.12], s: [1.2, 0.5, 0.8] });
      b.add(cyl(0.07, 0.1, 0.7, 6), '#9a6a40', { p: [0.32, 1.65, 0], r: [0, 0, -0.8] });
      return b.geometry();
    }),
    0.9,
  );
  const crown = new THREE.Group();
  crown.position.y = 1.8;
  crown.add(
    meshOf(
      cached(`crown${v}`, () => {
        const r = seeded(11 + v * 7);
        const b = new Build();
        const blobs: [number, number, number, number][] = [
          [0, 0.75, 0, 1.2],
          [0.75, 0.35, 0.25, 0.85],
          [-0.7, 0.4, -0.2, 0.88],
          [0.15, 1.45, -0.1, 0.8],
          [-0.2, 0.55, 0.7, 0.8],
          [0.3, 0.6, -0.7, 0.78],
        ];
        for (const [x, y, z, s] of blobs) b.add(sphere(s, 13), GREENS[Math.floor(r() * GREENS.length)], { p: [x, y, z] });
        for (let k = 0; k < 9; k++) {
          const a = r() * Math.PI * 2;
          const y = 0.2 + r() * 1.1;
          const rad = 1.0 + (1 - Math.abs(y - 0.7)) * 0.25;
          b.add(dot(0.13), FRUIT[v], { p: [Math.cos(a) * rad, y, Math.sin(a) * rad] });
        }
        return b.geometry();
      }),
      0.92,
    ),
  );
  g.add(trunk, crown);
  return { g, crown };
}

export function palm(variant: number) {
  const g = new THREE.Group();
  const lean = variant % 2 ? -1 : 1;
  const trunk = meshOf(
    cached(`palmtrunk${variant % 2}`, () => {
      const b = new Build();
      for (let k = 0; k < 8; k++) b.add(cyl(0.17 - k * 0.01, 0.21 - k * 0.01, 0.46, 9), k % 2 ? '#b08455' : '#c89a64', { p: [lean * k * k * 0.012, 0.23 + k * 0.42, 0], r: [0, 0, -lean * k * 0.03] });
      return b.geometry();
    }),
    0.9,
  );
  const crown = new THREE.Group();
  crown.position.set(lean * 0.6, 3.35, 0);
  crown.add(
    meshOf(
      cached(`palmcrown`, () => {
        const b = new Build();
        for (let f = 0; f < 8; f++) {
          const a = (f / 8) * Math.PI * 2 + 0.2;
          const leaf = new THREE.SphereGeometry(1, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2);
          b.add(leaf, f % 2 ? '#58a85a' : '#4f9a50', { p: [Math.cos(a) * 0.85, -0.2, Math.sin(a) * 0.85], r: [0, -a, -0.38], s: [1.35, 0.13, 0.4] });
        }
        for (let k = 0; k < 3; k++) b.add(sphere(0.15, 10), '#7a5228', { p: [(k - 1) * 0.18, -0.2, 0.12 * (k % 2 ? 1 : -1)] });
        return b.geometry();
      }),
      0.85,
    ),
  );
  g.add(trunk, crown);
  return { g, crown };
}

export function bush(variant: number) {
  return meshOf(
    cached(`bush${variant % 2}`, () => {
      const r = seeded(31 + variant);
      const b = new Build();
      for (const [x, z, s] of [
        [0, 0, 0.62],
        [0.5, 0.12, 0.48],
        [-0.48, 0.05, 0.46],
        [0.1, -0.3, 0.45],
      ] as const)
        b.add(sphere(s, 11), GREENS[Math.floor(r() * 4)], { p: [x, s * 0.72, z] });
      if (variant % 2) for (let k = 0; k < 7; k++) b.add(dot(0.075), k % 2 ? '#9a6ad0' : '#b884e8', { p: [(r() - 0.5) * 1.1, 0.35 + r() * 0.45, 0.32 + r() * 0.25] });
      return b.geometry();
    }),
    0.92,
  );
}

export function rock(big: boolean, variant = 0) {
  return meshOf(
    cached(`rock${big ? 'b' : ''}${variant % 2}`, () => {
      const b = new Build();
      const r = seeded(51 + variant + (big ? 9 : 0));
      if (big) {
        b.add(new THREE.DodecahedronGeometry(0.75, 1), '#b9b6c2', { p: [0, 0.35, 0], s: [1.2, 0.75, 0.95], r: [0, r() * 6, 0] });
        b.add(new THREE.DodecahedronGeometry(0.45, 1), '#a9a5b4', { p: [0.75, 0.2, 0.25], s: [1, 0.7, 1], r: [0, r() * 6, 0] });
        b.add(sphere(0.18, 8), '#7cb46a', { p: [-0.3, 0.82, 0.1], s: [1.5, 0.45, 1.2] });
      } else {
        b.add(new THREE.DodecahedronGeometry(0.4, 1), variant % 2 ? '#c4c0cc' : '#b4b0bc', { p: [0, 0.18, 0], s: [1.25, 0.65, 1], r: [0, r() * 6, 0] });
        b.add(new THREE.DodecahedronGeometry(0.2, 0), '#aaa6b2', { p: [0.38, 0.08, 0.15], r: [0, r() * 6, 0] });
      }
      return b.geometry();
    }),
    0.9,
  );
}

export function tallGrass(variant: number) {
  return meshOf(
    cached(`tall${variant % 3}`, () => {
      const r = seeded(71 + variant);
      const b = new Build();
      for (let k = 0; k < 7; k++) {
        const a = r() * Math.PI * 2;
        const d = r() * 0.22;
        const h = 0.45 + r() * 0.35;
        const tip: [number, number, number] = [Math.cos(a) * (d + 0.18), h, Math.sin(a) * (d + 0.18)];
        b.add(strand([[Math.cos(a) * d, 0, Math.sin(a) * d], [Math.cos(a) * (d + 0.05), h * 0.5, Math.sin(a) * (d + 0.05)], tip], 0.04, 0.9, 3, 3), k % 3 ? '#3f8a3a' : '#4f9e44');
      }
      return b.geometry();
    }),
    0.95,
    false,
  );
}

export function stump(big: boolean) {
  return meshOf(
    cached(`stump${big ? 'b' : ''}`, () => {
      const b = new Build();
      const s = big ? 1 : 0.75;
      b.add(cyl(0.3 * s, 0.36 * s, 0.4 * s, 12), '#9a6a40', { p: [0, 0.2 * s, 0] });
      b.add(cyl(0.27 * s, 0.27 * s, 0.03, 12), '#e8c890', { p: [0, 0.4 * s + 0.01, 0] });
      b.add(cyl(0.15 * s, 0.15 * s, 0.035, 10), '#d4a870', { p: [0, 0.4 * s + 0.015, 0] });
      for (const a of [0.3, 2.4, 4.4]) b.add(sphere(0.12 * s, 7), '#8a5a34', { p: [Math.cos(a) * 0.32 * s, 0.05, Math.sin(a) * 0.32 * s], s: [1.6, 0.6, 1] });
      return b.geometry();
    }),
    0.9,
  );
}

export function sapling() {
  return meshOf(
    cached('sapling', () => {
      const b = new Build();
      b.add(cyl(0.04, 0.06, 0.6, 6), '#8a5a34', { p: [0, 0.3, 0] });
      b.add(sphere(0.22, 10), '#6cc46a', { p: [0, 0.7, 0] });
      b.add(sphere(0.15, 8), '#5fb35a', { p: [0.16, 0.56, 0.05] });
      b.add(sphere(0.14, 8), '#78d070', { p: [-0.14, 0.6, -0.04] });
      return b.geometry();
    }),
    0.9,
  );
}

// ---------- Bauten ----------
/** Prisma fürs Satteldach (First entlang x) */
function roofGeo(len: number, depth: number, height: number, over = 0.12) {
  const s = new THREE.Shape([new THREE.Vector2(-depth / 2, 0), new THREE.Vector2(depth / 2, 0), new THREE.Vector2(0, height)]);
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: true, bevelSize: over, bevelThickness: 0.08, bevelSegments: 2 });
  g.translate(0, 0, -len / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

export const HOUSE_Z = -7 * U;
/** Wohnhaus: Fußpunkt vorn in der Mitte */
export function house() {
  const g = new THREE.Group();
  g.add(
    meshOf(
      cached('house', () => {
        const b = new Build();
        const z = HOUSE_Z;
        b.add(rbox(4.3, 0.32, 2.35, 0.08), '#aaa6b6', { p: [0, 0.16, z] });
        b.add(rbox(4.0, 2.0, 2.05, 0.12), '#fff3dc', { p: [0, 1.3, z] });
        // Holzbalken an den Ecken
        for (const x of [-1.95, 1.95]) b.add(rbox(0.16, 2.0, 0.16, 0.04), '#c8945a', { p: [x, 1.3, z + 1.0] });
        b.add(roofGeo(4.5, 2.75, 1.45), '#e0705a', { p: [0, 2.28, z] });
        b.add(rbox(4.7, 0.12, 0.2, 0.05), '#c85a48', { p: [0, 2.3, z + 1.38] });
        b.add(rbox(0.45, 1.05, 0.45, 0.06), '#b8b4c2', { p: [1.1, 3.2, z - 0.4] });
        b.add(rbox(0.55, 0.12, 0.55, 0.04), '#9a96a4', { p: [1.1, 3.75, z - 0.4] });
        // Tür mit Vordach und Stufe
        b.add(rbox(0.85, 1.35, 0.12, 0.05), '#a8743f', { p: [0, 0.98, z + 1.04] });
        b.add(rbox(0.12, 1.25, 0.03, 0.02), '#8a5a32', { p: [0, 0.98, z + 1.11] });
        b.add(sphere(0.06, 8), '#ffd84a', { p: [0.27, 0.95, z + 1.13] });
        b.add(rbox(1.25, 0.1, 0.45, 0.04), '#c85a48', { p: [0, 1.8, z + 1.2], r: [0.25, 0, 0] });
        b.add(rbox(1.1, 0.12, 0.45, 0.04), '#b8b4c2', { p: [0, 0.06, z + 1.25] });
        for (const wx of [-1.25, 1.25]) {
          b.add(rbox(0.78, 0.78, 0.1, 0.04), '#8a5a32', { p: [wx, 1.45, z + 1.04] });
          // Fensterläden
          for (const sx of [-0.52, 0.52]) b.add(rbox(0.22, 0.74, 0.06, 0.03), '#7ab0d8', { p: [wx + sx, 1.45, z + 1.07] });
          b.add(rbox(0.85, 0.18, 0.24, 0.04), '#9a6a40', { p: [wx, 0.98, z + 1.16] });
          for (let k = 0; k < 5; k++) b.add(sphere(0.08, 8), ['#f48fc0', '#ffffff', '#ff7a6a', '#ffd84a', '#b48af0'][k], { p: [wx - 0.3 + k * 0.15, 1.12, z + 1.18] });
        }
        return b.geometry();
      }),
      0.8,
    ),
  );
  for (const wx of [-1.25, 1.25]) {
    const w = new THREE.Mesh(cached('win', () => new THREE.BoxGeometry(0.6, 0.6, 0.05)), glowMats.window);
    w.position.set(wx, 1.45, HOUSE_Z + 1.1);
    g.add(w);
    const bar = meshOf(
      cached('winbar', () => {
        const b = new Build();
        b.add(new THREE.BoxGeometry(0.05, 0.6, 0.03), '#8a5a32');
        b.add(new THREE.BoxGeometry(0.6, 0.05, 0.03), '#8a5a32');
        return b.geometry();
      }),
    );
    bar.position.set(wx, 1.45, HOUSE_Z + 1.13);
    g.add(bar);
  }
  return g;
}
/** Rauch aus dem Kamin (relativ zum Haus) */
export const CHIMNEY = new THREE.Vector3(1.1, 3.85, HOUSE_Z - 0.4);

export const STABLE_Z = -7 * U;
export function stable() {
  const g = new THREE.Group();
  g.add(
    meshOf(
      cached('stable', () => {
        const b = new Build();
        const z = STABLE_Z;
        const red = '#c8584a';
        b.add(rbox(5.9, 0.26, 2.4, 0.08), '#a8a4b4', { p: [0, 0.13, z] });
        b.add(rbox(5.6, 2.0, 2.15, 0.1), red, { p: [0, 1.25, z] });
        // weiße Kanten und Bretter
        for (const x of [-2.78, 2.78]) b.add(rbox(0.16, 2.0, 0.16, 0.04), '#fff6ec', { p: [x, 1.25, z + 1.06] });
        for (let x = -2.4; x <= 2.41; x += 0.4) if (Math.abs(x) > 1.1) b.add(new THREE.BoxGeometry(0.04, 1.9, 0.02), tint(red, -0.15), { p: [x, 1.25, z + 1.08] });
        b.add(rbox(5.7, 0.14, 0.18, 0.04), '#fff6ec', { p: [0, 2.25, z + 1.06] });
        b.add(roofGeo(6.1, 2.9, 1.5), '#7a5a4a', { p: [0, 2.24, z] });
        b.add(rbox(6.3, 0.12, 0.2, 0.05), '#5e4438', { p: [0, 2.26, z + 1.45] });
        // Giebel vorn: Heuboden-Luke mit Heu
        b.add(rbox(0.8, 0.6, 0.1, 0.04), '#fff6ec', { p: [0, 2.8, z + 0.75] });
        b.add(rbox(0.62, 0.42, 0.1, 0.03), '#5a3a26', { p: [0, 2.8, z + 0.78] });
        b.add(sphere(0.25, 8), '#ecc860', { p: [0, 2.7, z + 0.82], s: [1.1, 0.55, 0.5] });
        // großes Doppeltor mit X-Streben
        b.add(rbox(2.0, 1.7, 0.1, 0.04), '#8a4a3a', { p: [0, 0.98, z + 1.1] });
        for (const s of [-1, 1]) {
          const cx = s * 0.5;
          b.add(rbox(0.94, 0.08, 0.04, 0.02), '#fff6ec', { p: [cx, 1.78, z + 1.17] });
          b.add(rbox(0.94, 0.08, 0.04, 0.02), '#fff6ec', { p: [cx, 0.2, z + 1.17] });
          b.add(rbox(0.08, 1.66, 0.04, 0.02), '#fff6ec', { p: [s * 0.95, 0.98, z + 1.17] });
          for (const r of [0.98, -0.98]) b.add(rbox(1.75, 0.07, 0.035, 0.02), '#fff6ec', { p: [cx, 0.98, z + 1.17], r: [0, 0, r * 1.06] });
        }
        // Hufeisen über dem Tor
        b.add(new THREE.TorusGeometry(0.16, 0.035, 6, 12, Math.PI * 1.3), '#c8c8d0', { p: [0, 2.0, z + 1.12], r: [0, 0, -Math.PI * 0.15 + Math.PI] });
        // Heuballen und Futtertrog daneben
        b.add(cyl(0.42, 0.42, 0.7, 16), '#ecc860', { p: [-3.4, 0.43, z + 0.6], r: [0, 0, Math.PI / 2] });
        b.add(cyl(0.3, 0.3, 0.72, 14), '#d8b048', { p: [-3.4, 0.43, z + 0.6], r: [0, 0, Math.PI / 2], s: [1, 1.02, 1.42] });
        b.add(rbox(1.0, 0.35, 0.45, 0.06), '#9a6a40', { p: [3.3, 0.3, z + 0.7] });
        b.add(rbox(0.86, 0.06, 0.32, 0.03), '#78b4d8', { p: [3.3, 0.45, z + 0.7] });
        return b.geometry();
      }),
      0.85,
    ),
  );
  return g;
}

/** Koppelzaun (Fußpunkt = Mitte vorn wie im Spiel), Tor vorn in der Mitte */
export function paddock() {
  return meshOf(
    cached('paddock', () => {
      const b = new Build();
      const f = PADDOCK_FOOT;
      const L = f.left * U;
      const R = f.right * U;
      const T = f.top * U;
      const B = 0;
      const gate = GATE * U;
      const run = (x0: number, z0: number, x1: number, z1: number) => {
        const len = Math.hypot(x1 - x0, z1 - z0);
        const n = Math.max(1, Math.round(len / 1.05));
        const ang = Math.atan2(z1 - z0, x1 - x0);
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          b.add(rbox(0.17, 0.9, 0.17, 0.05), '#a8743f', { p: [x0 + (x1 - x0) * t, 0.45, z0 + (z1 - z0) * t] });
          b.add(sphere(0.1, 8), '#b8844a', { p: [x0 + (x1 - x0) * t, 0.92, z0 + (z1 - z0) * t], s: [1, 0.5, 1] });
        }
        for (const y of [0.42, 0.75]) b.add(rbox(len, 0.1, 0.07, 0.03), '#c8945a', { p: [(x0 + x1) / 2, y, (z0 + z1) / 2], r: [0, -ang, 0] });
      };
      run(L, T, R, T);
      run(L, T, L, B);
      run(R, T, R, B);
      run(L, B, -gate, B);
      run(gate, B, R, B);
      // Tränke in der Ecke
      b.add(rbox(1.0, 0.32, 0.5, 0.06), '#9a6a40', { p: [R - 0.9, 0.16, T + 0.6] });
      b.add(rbox(0.86, 0.06, 0.36, 0.03), '#78b4d8', { p: [R - 0.9, 0.3, T + 0.6] });
      return b.geometry();
    }),
    0.85,
  );
}

/** Lagerfeuer: Steinkreis, Scheite, Flammen (Flammen flackern einzeln) */
export function campfire() {
  const g = new THREE.Group();
  g.add(
    meshOf(
      cached('fire', () => {
        const b = new Build();
        const r = seeded(5);
        for (let k = 0; k < 9; k++) {
          const a = (k / 9) * Math.PI * 2;
          b.add(new THREE.DodecahedronGeometry(0.15, 0), k % 2 ? '#a8a4b0' : '#bcb8c4', { p: [Math.cos(a) * 0.5, 0.09, Math.sin(a) * 0.4], r: [r(), r(), r()] });
        }
        for (const a of [0.4, 1.5, 2.6]) b.add(cyl(0.07, 0.08, 0.75, 7), '#8a5a32', { p: [0, 0.14, 0], r: [Math.PI / 2 - 0.25, a, 0] });
        b.add(sphere(0.2, 8), '#3a2418', { p: [0, 0.04, 0], s: [1.3, 0.3, 1] });
        return b.geometry();
      }),
      0.9,
    ),
  );
  const flames: THREE.Mesh[] = [];
  for (const [x, z, s, m] of [
    [0, 0, 1, glowMats.flame],
    [0.1, 0.06, 0.6, glowMats.flame2],
    [-0.12, -0.04, 0.55, glowMats.flame2],
  ] as const) {
    const f = new THREE.Mesh(cached('flame', () => cone(0.2, 0.6, 8).translate(0, 0.3, 0)), m);
    f.position.set(x, 0.12, z);
    f.scale.setScalar(s);
    g.add(f);
    flames.push(f);
  }
  return { g, flames };
}

// ---------- Deko ----------
export function deco(id: string) {
  const g = new THREE.Group();
  const b = new Build();
  if (id === 'flowers') {
    b.add(rbox(1.5, 0.22, 0.75, 0.05), '#a8743f', { p: [0, 0.11, -0.2] });
    b.add(rbox(1.36, 0.05, 0.62, 0.03), '#6a4428', { p: [0, 0.22, -0.2] });
    const cols = ['#f48fc0', '#ffffff', '#ff7a6a', '#ffd84a', '#b48af0'];
    for (let k = 0; k < 10; k++) {
      const x = -0.58 + (k % 5) * 0.29;
      const z = -0.36 + Math.floor(k / 5) * 0.3;
      b.add(cyl(0.02, 0.02, 0.2, 5), '#3e8a3a', { p: [x, 0.32, z] });
      b.add(sphere(0.085, 8), cols[k % 5], { p: [x, 0.44, z] });
      b.add(sphere(0.035, 6), '#ffd84a', { p: [x, 0.47, z + 0.05] });
    }
  } else if (id === 'birdhouse') {
    b.add(cyl(0.06, 0.07, 1.3, 8), '#8a5a32', { p: [0, 0.65, -0.2] });
    b.add(rbox(0.5, 0.48, 0.45, 0.05), '#f2c86a', { p: [0, 1.5, -0.2] });
    b.add(roofGeo(0.62, 0.62, 0.32, 0.05), '#e0705a', { p: [0, 1.73, -0.2], r: [0, Math.PI / 2, 0] });
    b.add(cyl(0.08, 0.08, 0.04, 12), '#3a2418', { p: [0, 1.52, 0.03], r: [Math.PI / 2, 0, 0] });
    b.add(cyl(0.015, 0.015, 0.14, 5), '#8a5a32', { p: [0, 1.36, 0.08], r: [Math.PI / 2, 0, 0] });
    b.add(sphere(0.09, 8), '#4a8ad0', { p: [0.12, 1.86, -0.15] });
    b.add(cone(0.03, 0.06, 5), '#f2b040', { p: [0.21, 1.87, -0.15], r: [0, 0, -Math.PI / 2] });
  } else if (id === 'bench') {
    for (const x of [-0.6, 0.6]) {
      b.add(rbox(0.1, 0.4, 0.45, 0.03), '#6a4428', { p: [x, 0.2, -0.2] });
      b.add(rbox(0.08, 0.5, 0.08, 0.03), '#6a4428', { p: [x, 0.6, -0.42] });
    }
    for (const z of [-0.32, -0.18, -0.04]) b.add(rbox(1.5, 0.06, 0.12, 0.02), '#c8945a', { p: [0, 0.42, z] });
    for (const y of [0.62, 0.8]) b.add(rbox(1.5, 0.1, 0.05, 0.02), '#c8945a', { p: [0, y, -0.44] });
  } else if (id === 'lantern') {
    b.add(cyl(0.07, 0.09, 1.5, 8), '#3a3a44', { p: [0, 0.75, -0.15] });
    b.add(cyl(0.18, 0.2, 0.08, 8), '#3a3a44', { p: [0, 0.04, -0.15] });
    b.add(cone(0.24, 0.2, 4), '#3a3a44', { p: [0, 1.93, -0.15], r: [0, Math.PI / 4, 0] });
    b.add(sphere(0.05, 6), '#3a3a44', { p: [0, 2.06, -0.15] });
    for (const [x, z] of [
      [-0.15, -0.15],
      [0.15, -0.15],
      [-0.15, 0.15],
      [0.15, 0.15],
    ])
      b.add(rbox(0.03, 0.36, 0.03, 0.01), '#3a3a44', { p: [x, 1.65, z - 0.15] });
    const glass = new THREE.Mesh(cached('lampglass', () => new THREE.BoxGeometry(0.27, 0.32, 0.27)), glowMats.lamp);
    glass.position.set(0, 1.65, -0.15);
    g.add(glass);
  } else if (id === 'gnome') {
    b.add(sphere(0.22, 12), '#3a7ad8', { p: [0, 0.25, -0.1], s: [1, 1.1, 0.95] });
    b.add(cyl(0.08, 0.1, 0.1, 8), '#6a4428', { p: [-0.09, 0.05, -0.04] });
    b.add(cyl(0.08, 0.1, 0.1, 8), '#6a4428', { p: [0.09, 0.05, -0.04] });
    b.add(sphere(0.17, 12), '#ffd9bc', { p: [0, 0.55, -0.08] });
    b.add(cone(0.18, 0.5, 12), '#e04848', { p: [0, 0.88, -0.1], r: [-0.15, 0, 0] });
    b.add(sphere(0.16, 10), '#ffffff', { p: [0, 0.42, 0.02], s: [1, 1.2, 0.6] });
    b.add(sphere(0.045, 8), '#ff9a8a', { p: [0, 0.55, 0.09] });
    for (const x of [-0.06, 0.06]) b.add(sphere(0.022, 6), '#2a1a16', { p: [x, 0.6, 0.07] });
    b.add(cyl(0.02, 0.02, 0.5, 5), '#8a5a32', { p: [0.24, 0.3, 0], r: [0, 0, -0.1] });
    b.add(sphere(0.06, 8), '#ff9a3a', { p: [0.26, 0.58, 0] });
  } else if (id === 'well') {
    b.add(cyl(0.62, 0.66, 0.6, 16), '#b9b6c2', { p: [0, 0.3, -0.25] });
    b.add(cyl(0.5, 0.5, 0.05, 16), '#5aa0d0', { p: [0, 0.5, -0.25] });
    b.add(new THREE.TorusGeometry(0.62, 0.07, 6, 18), '#a9a5b4', { p: [0, 0.6, -0.25], r: [Math.PI / 2, 0, 0] });
    for (const x of [-0.58, 0.58]) b.add(rbox(0.1, 1.2, 0.1, 0.03), '#8a5a32', { p: [x, 1.05, -0.25] });
    b.add(roofGeo(1.4, 1.1, 0.5, 0.06), '#e0705a', { p: [0, 1.62, -0.25] });
    b.add(cyl(0.04, 0.04, 1.2, 6), '#6a4428', { p: [0, 1.4, -0.25], r: [0, 0, Math.PI / 2] });
    b.add(cyl(0.12, 0.1, 0.18, 10), '#9a6a40', { p: [0, 0.95, -0.25] });
  }
  if (!b.empty) g.add(meshOf(b.geometry(), 0.8));
  return g;
}

/** Händler-Boot (fährt waagrecht, Bug nach Osten) */
export function boat() {
  const g = new THREE.Group();
  const b = new Build();
  const hull = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  b.add(hull, '#9a5a32', { p: [0, 0.35, 0], s: [2.1, 0.75, 0.95] });
  b.add(new THREE.TorusGeometry(1, 0.06, 6, 28), '#f4efe4', { p: [0, 0.33, 0], r: [Math.PI / 2, 0, 0], s: [2.1, 0.95, 1] });
  b.add(rbox(3.6, 0.06, 1.4, 0.03), '#c8945a', { p: [0, 0.3, 0] });
  b.add(cyl(0.06, 0.07, 2.6, 8), '#8a5a32', { p: [-0.2, 1.6, 0] });
  // gestreiftes Segel
  for (let k = 0; k < 4; k++) b.add(rbox(0.05, 0.42, 1.2 - k * 0.12, 0.02), k % 2 ? '#ffffff' : '#e0564a', { p: [0.1, 2.55 - k * 0.42, 0], s: [1, 1, 1] });
  b.add(cone(0.1, 0.25, 4), '#f2c14e', { p: [-0.2, 3.0, 0] });
  // Kisten und Fässchen
  b.add(rbox(0.5, 0.45, 0.5, 0.05), '#c8945a', { p: [1.1, 0.55, 0.15] });
  b.add(rbox(0.4, 0.35, 0.4, 0.05), '#b8844a', { p: [1.15, 0.95, 0.1] });
  b.add(cyl(0.2, 0.2, 0.5, 12), '#9a6a40', { p: [-1.2, 0.55, -0.2] });
  b.add(sphere(0.16, 10), '#ff9a3a', { p: [1.5, 0.5, -0.3] });
  b.add(sphere(0.14, 10), '#e0483e', { p: [1.6, 0.5, 0.0] });
  // Händlerin: Mantel, Kopf, Mütze, Schnauzbart
  b.add(sphere(0.3, 12), '#4a6a9a', { p: [-0.75, 0.75, 0.2], s: [1, 1.2, 1] });
  b.add(sphere(0.27, 14), '#f4c9a2', { p: [-0.75, 1.25, 0.2] });
  b.add(cyl(0.2, 0.26, 0.2, 12), '#e0564a', { p: [-0.75, 1.5, 0.2] });
  b.add(sphere(0.06, 8), '#ffffff', { p: [-0.75, 1.62, 0.2] });
  b.add(sphere(0.09, 8), '#6a4a32', { p: [-0.75, 1.17, 0.45], s: [1.6, 0.5, 0.6] });
  for (const z of [0.1, 0.3]) b.add(sphere(0.03, 6), '#2a1a16', { p: [-0.55, 1.3, z] });
  g.add(meshOf(b.geometry(), 0.8));
  // Wimpel mit Münze
  const flag = meshOf(
    cached('boatflag', () => {
      const f = new Build();
      f.add(cyl(0.02, 0.02, 0.6, 5), '#8a5a32', { p: [0, 0.3, 0] });
      f.add(rbox(0.5, 0.3, 0.03, 0.02), '#f2c14e', { p: [0.27, 0.45, 0] });
      f.add(cyl(0.08, 0.08, 0.04, 10), '#c8902a', { p: [0.27, 0.45, 0.02], r: [Math.PI / 2, 0, 0] });
      return f.geometry();
    }),
  );
  flag.position.set(1.6, 0.6, 0.4);
  g.add(flag);
  return g;
}

// ---------- Acker ----------
/** Feld (Erde): weiß, Farbe kommt pro Feld (trocken/nass) */
export const soilGeo = () =>
  cached('soil', () => {
    const b = new Build();
    b.add(rbox(0.96, 0.1, 0.96, 0.05), '#ffffff', { p: [0, 0.02, 0] });
    for (const z of [-0.25, 0.05, 0.35]) b.add(rbox(0.82, 0.06, 0.1, 0.03), '#dcdcdc', { p: [0, 0.08, z - 0.05] });
    return b.geometry();
  });
export function cropGeo(stage: number) {
  return cached(`crop${stage}`, () => {
    const b = new Build();
    if (stage === 0) for (const [x, z] of [[-0.15, -0.1], [0.12, 0.05], [-0.02, 0.2]] as const) b.add(sphere(0.05, 6), '#e8c890', { p: [x, 0.1, z], s: [1, 0.5, 1] });
    else {
      const n = stage === 1 ? 2 : stage === 2 ? 4 : 5;
      const len = stage === 1 ? 0.18 : stage === 2 ? 0.3 : 0.38;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + 0.5;
        b.add(sphere(0.1, 8), k % 2 ? '#5fae4e' : '#4f9a44', { p: [Math.cos(a) * len * 0.45, 0.1 + len * 0.55, Math.sin(a) * len * 0.45], r: [Math.sin(a) * 0.6, -a, Math.cos(a) * 0.6], s: [len * 3.2, 0.3, len * 1.6] });
      }
      if (stage === 3) {
        b.add(sphere(0.2, 12), '#f6f0f2', { p: [0, 0.14, 0], s: [1, 0.85, 1] });
        b.add(sphere(0.19, 12), '#b05a9a', { p: [0, 0.22, 0], s: [1.02, 0.5, 1.02] });
        b.add(cone(0.05, 0.15, 6), '#f6f0f2', { p: [0, 0.0, 0], r: [Math.PI, 0, 0] });
      }
    }
    return b.geometry();
  });
}
/** gemähte Wiese: frisch (grüne Schwaden), trocken (goldenes Heu), Stoppeln */
export function hayGeo(stage: 'fresh' | 'dry' | 'stubble') {
  return cached(`hay-${stage}`, () => {
    const b = new Build();
    const base = stage === 'stubble' ? '#a8c86a' : stage === 'dry' ? '#c8c070' : '#8ac860';
    b.add(rbox(0.98, 0.05, 0.98, 0.02), base, { p: [0, 0.0, 0] });
    if (stage === 'stubble') {
      const r = seeded(3);
      for (let k = 0; k < 10; k++) b.add(cyl(0.015, 0.02, 0.08, 4), '#c8c070', { p: [(r() - 0.5) * 0.8, 0.06, (r() - 0.5) * 0.8] });
    } else {
      const c = stage === 'dry' ? '#ecc860' : '#6cb848';
      for (const z of [-0.22, 0.22]) b.add(cyl(0.13, 0.13, 0.9, 10), c, { p: [0, 0.05, z], r: [0, 0, Math.PI / 2], s: [1, 1, 0.65] });
    }
    return b.geometry();
  });
}

/** Modell durchsichtig machen (Vorschau beim Bauen) */
export function ghostOf(o: THREE.Object3D, ok: boolean) {
  const m = curve(new THREE.MeshStandardMaterial({ color: ok ? '#c8f0b8' : '#f4a8a0', transparent: true, opacity: 0.55, depthWrite: false, roughness: 0.8 }));
  o.traverse((c) => {
    if (c instanceof THREE.Mesh) {
      c.material = m;
      c.castShadow = false;
    }
  });
  return m;
}
export { mat };
