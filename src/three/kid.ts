/**
 * Spielfigur in 3D: großer Kopf, kleiner Körper (knuffig), mit allen Teilen des
 * Aussehens aus dem Spiel: Haut, Frisur, Haarfarbe, Oberteil, Hose, Hut.
 * Kopf samt Haaren und Hut ist ein einziges Modell; Arme und Beine bewegen sich.
 */
import * as THREE from 'three';
import { HAIR_COLORS, PANTS, SHIRTS, SKINS, type Look } from '../character';
import { Build, cone, cyl, rbox, sphere, tint, vcMat } from './engine';

export interface KidPose {
  /** Laufphase (rad); 0 und moving=false = steht */
  walk: number;
  moving: boolean;
  /** Werkzeug-Schwung 0..1 (0 = keiner) */
  swing: number;
  tool: string;
  /** Eisen-Gießkanne statt Kübel */
  can?: boolean;
  ride: boolean;
  t: number;
  /** schläft (im Bett) */
  sleep?: boolean;
}

export interface Kid {
  g: THREE.Group;
  pose(p: KidPose): void;
  dispose(): void;
}

const SHOE = '#4a3020';
const STRAW = '#e8c870';
const BAND = '#e8607a';

function headGeo(look: Look) {
  const skin = SKINS[look.skin] ?? SKINS[0];
  const hair = HAIR_COLORS[look.hairColor] ?? HAIR_COLORS[0];
  const b = new Build();
  b.add(sphere(0.4, 24), skin);
  for (const x of [-1, 1]) b.add(sphere(0.08, 8), tint(skin, -0.06), { p: [x * 0.39, -0.02, 0], s: [0.6, 1, 0.9] });
  // Gesicht: Kulleraugen mit Glanz, Bäckchen, Näschen, Lächeln
  for (const x of [-1, 1]) {
    b.add(sphere(0.062, 12), '#2a1a16', { p: [x * 0.135, 0.0, 0.345], s: [0.9, 1.15, 0.6] });
    b.add(sphere(0.022, 6), '#ffffff', { p: [x * 0.135 + 0.022, 0.035, 0.38] });
    b.add(sphere(0.065, 8), '#ff9aa8', { p: [x * 0.23, -0.1, 0.3], s: [1.2, 0.7, 0.5] });
  }
  b.add(sphere(0.03, 6), tint(skin, -0.12), { p: [0, -0.06, 0.4] });
  b.add(new THREE.TorusGeometry(0.06, 0.014, 5, 10, Math.PI), '#9a4a3a', { p: [0, -0.13, 0.37], r: [0, 0, Math.PI] });
  // Frisur
  const cap = (s = 1.07, len = 0.52) => new THREE.SphereGeometry(0.4 * s, 22, 12, 0, Math.PI * 2, 0, Math.PI * len);
  const style = look.hair;
  // Mütze und Kopftuch bedecken den Haaransatz: dann keine Fransen und Locken obendrauf
  const covered = look.hat === 2 || look.hat === 3;
  if (style !== 5) {
    b.add(cap(), hair, { p: [0, 0.02, -0.03], r: [-0.25, 0, 0] });
    // Stirnfransen
    if (!covered) for (const [x, s] of [[-0.18, 0.13], [0, 0.14], [0.18, 0.13]] as const) b.add(sphere(s, 10), hair, { p: [x, 0.2, 0.28], s: [1.1, 0.7, 0.6] });
  }
  if (style === 1 && !covered)
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      b.add(sphere(0.14, 10), hair, { p: [Math.cos(a) * 0.26, 0.3 + (k % 2) * 0.05, Math.sin(a) * 0.26 - 0.05] });
    }
  if (style === 2) {
    b.add(sphere(0.36, 16), hair, { p: [0, -0.18, -0.16], s: [1.15, 1.3, 0.7] });
    for (const x of [-1, 1]) b.add(sphere(0.14, 10), hair, { p: [x * 0.33, -0.22, 0.02], s: [0.7, 1.9, 0.9] });
  }
  if (style === 3) {
    b.add(sphere(0.09, 8), '#f06aa8', { p: [0, 0.12, -0.42] });
    for (let k = 0; k < 4; k++) b.add(sphere(0.12 - k * 0.015, 10), hair, { p: [0, 0.05 - k * 0.15, -0.5 - k * 0.04] });
  }
  if (style === 4) {
    // glatter Bob: Seiten und Hinterkopf, vorn fürs Gesicht offen
    b.add(new THREE.SphereGeometry(0.44, 22, 12, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, 0, Math.PI * 0.68), hair, { p: [0, 0.03, -0.04], r: [-0.12, 0, 0] });
    b.add(rbox(0.7, 0.08, 0.12, 0.04), hair, { p: [0, 0.22, 0.31] });
  }
  // Hut
  const hat = look.hat;
  if (hat === 1) {
    b.add(cyl(0.66, 0.66, 0.05, 28), STRAW, { p: [0, 0.3, 0], r: [-0.12, 0, 0] });
    b.add(cyl(0.31, 0.37, 0.24, 22), STRAW, { p: [0, 0.43, -0.02], r: [-0.12, 0, 0] });
    b.add(cyl(0.375, 0.38, 0.075, 22), BAND, { p: [0, 0.35, -0.01], r: [-0.12, 0, 0] });
  } else if (hat === 2) {
    b.add(new THREE.SphereGeometry(0.43, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), '#4a8ad0', { p: [0, 0.06, -0.02], r: [-0.15, 0, 0], s: [1, 1.05, 1] });
    b.add(new THREE.TorusGeometry(0.41, 0.07, 8, 24), '#3a72b8', { p: [0, 0.1, 0.0], r: [Math.PI / 2 - 0.15, 0, 0] });
    b.add(sphere(0.11, 10), '#f4f0e6', { p: [0, 0.52, -0.08] });
  } else if (hat === 3) {
    b.add(new THREE.SphereGeometry(0.43, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), '#e0564a', { p: [0, 0.04, -0.04], r: [-0.3, 0, 0] });
    for (const [x, y, z] of [[-0.2, 0.3, 0.2], [0.15, 0.35, 0.18], [0, 0.4, -0.1], [-0.25, 0.2, -0.25], [0.28, 0.22, -0.2]] as const) b.add(sphere(0.035, 6), '#f4f0e6', { p: [x, y, z] });
    b.add(sphere(0.1, 8), '#e0564a', { p: [0, -0.05, -0.43] });
    for (const x of [-1, 1]) b.add(cone(0.06, 0.2, 6), '#e0564a', { p: [x * 0.07, -0.18, -0.45], r: [0.3, 0, x * 0.4] });
  } else if (hat === 4) {
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      b.add(sphere(0.06, 8), '#ff9fc4', { p: [0.3 + Math.cos(a) * 0.06, 0.26 + Math.sin(a) * 0.06, 0.18], s: [1, 1, 0.5] });
    }
    b.add(sphere(0.04, 6), '#ffd23f', { p: [0.3, 0.26, 0.21] });
  }
  return b.geometry();
}

// ---------- Werkzeuge (in der rechten Hand, Stiel nach vorn) ----------
const tools = new Map<string, THREE.BufferGeometry>();
function toolGeo(id: string) {
  let g = tools.get(id);
  if (g) return g;
  const b = new Build();
  const handle = (len: number) => b.add(cyl(0.032, 0.036, len, 7), '#a8743f', { p: [0, 0, len / 2 - 0.05], r: [Math.PI / 2, 0, 0] });
  if (id === 'axe') {
    handle(0.7);
    b.add(rbox(0.06, 0.24, 0.16, 0.02), '#9aa2ae', { p: [0, -0.06, 0.62] });
    b.add(rbox(0.065, 0.06, 0.18, 0.02), '#d8dde4', { p: [0, -0.18, 0.62] });
  } else if (id === 'hoe') {
    handle(0.95);
    b.add(rbox(0.22, 0.2, 0.04, 0.02), '#9aa2ae', { p: [0, -0.09, 0.88] });
  } else if (id === 'scythe') {
    handle(1.05);
    b.add(new THREE.TorusGeometry(0.32, 0.03, 4, 14, Math.PI * 0.7), '#c8ced6', { p: [0.0, -0.05, 0.98], r: [Math.PI / 2, 0, Math.PI * 0.9], s: [1, 1, 0.4] });
  } else if (id === 'can') {
    b.add(cyl(0.13, 0.15, 0.24, 14), '#7a8a9a', { p: [0, -0.16, 0.12] });
    b.add(cyl(0.025, 0.04, 0.34, 6), '#7a8a9a', { p: [0, -0.1, 0.33], r: [Math.PI / 2 - 0.6, 0, 0] });
    b.add(cyl(0.05, 0.03, 0.04, 8), '#9aa2ae', { p: [0, 0.03, 0.47], r: [Math.PI / 2 - 0.6, 0, 0] });
    b.add(new THREE.TorusGeometry(0.1, 0.02, 5, 10, Math.PI), '#5a6a7a', { p: [0, -0.03, 0.06], r: [0, Math.PI / 2, 0] });
  } else if (id === 'bucket') {
    b.add(cyl(0.15, 0.12, 0.24, 14), '#a8743f', { p: [0, -0.2, 0.05] });
    b.add(new THREE.TorusGeometry(0.155, 0.015, 4, 14), '#5a3a26', { p: [0, -0.13, 0.05], r: [Math.PI / 2, 0, 0] });
    b.add(new THREE.TorusGeometry(0.14, 0.012, 4, 10, Math.PI), '#5a5a64', { p: [0, -0.09, 0.05], r: [0, Math.PI / 2, 0] });
    b.add(cyl(0.135, 0.135, 0.02, 12), '#6ab4e0', { p: [0, -0.1, 0.05] });
  } else if (id === 'seeds') {
    b.add(sphere(0.13, 10), '#e8d0a0', { p: [0, -0.1, 0.08], s: [1, 1.2, 0.9] });
    b.add(cyl(0.05, 0.07, 0.06, 8), '#c8a870', { p: [0, 0.04, 0.08] });
  } else if (id === 'turnip') {
    b.add(sphere(0.12, 10), '#f6f0f2', { p: [0, -0.06, 0.1] });
    b.add(sphere(0.115, 10), '#b05a9a', { p: [0, -0.02, 0.1], s: [1, 0.5, 1] });
    for (const a of [-0.5, 0, 0.5]) b.add(sphere(0.06, 6), '#5fae4e', { p: [Math.sin(a) * 0.06, 0.1, 0.1], s: [0.6, 2, 0.4], r: [0, 0, a] });
  } else if (id === 'hay') {
    b.add(sphere(0.16, 8), '#ecc860', { p: [0, -0.05, 0.12], s: [1.2, 0.8, 1] });
  }
  g = b.empty ? new THREE.BufferGeometry() : b.geometry();
  tools.set(id, g);
  return g;
}
/** welches Werkzeugmodell zum Schwung gehört */
const toolFor = (tl: string, can: boolean) => (tl === 'water' || tl === 'refill' ? (can ? 'can' : 'bucket') : tl === 'harvest' ? 'turnip' : tl === 'rake' ? 'hay' : tl === 'cook' ? 'turnip' : tl);

export function makeKid(look: Look): Kid {
  const skin = SKINS[look.skin] ?? SKINS[0];
  const shirt = SHIRTS[look.shirt] ?? SHIRTS[0];
  const pants = PANTS[look.pants] ?? PANTS[0];
  const own: THREE.BufferGeometry[] = [];
  const m = (geo: THREE.BufferGeometry, rough = 0.7) => {
    own.push(geo);
    const x = new THREE.Mesh(geo, vcMat(rough));
    x.castShadow = true;
    x.receiveShadow = true;
    return x;
  };
  const g = new THREE.Group();
  const rig = new THREE.Group();
  g.add(rig);
  // Rumpf: Hose unten, Oberteil oben
  {
    const b = new Build();
    b.add(sphere(0.24, 16), pants, { p: [0, 0.42, 0], s: [1, 0.62, 0.9] });
    b.add(new THREE.CapsuleGeometry(0.25, 0.2, 6, 16), shirt, { p: [0, 0.66, 0], s: [1, 1, 0.88] });
    b.add(new THREE.TorusGeometry(0.15, 0.04, 6, 14), tint(shirt, 0.35), { p: [0, 0.89, 0.02], r: [Math.PI / 2, 0, 0] });
    b.add(sphere(0.035, 6), tint(shirt, 0.5), { p: [0, 0.72, 0.23] });
    b.add(sphere(0.035, 6), tint(shirt, 0.5), { p: [0, 0.6, 0.235] });
    rig.add(m(b.geometry()));
  }
  const head = new THREE.Group();
  head.position.y = 1.24;
  head.add(m(headGeo(look), 0.6));
  rig.add(head);
  const limb = (side: number, arm: boolean) => {
    const pivot = new THREE.Group();
    const b = new Build();
    if (arm) {
      pivot.position.set(side * 0.29, 0.8, 0);
      b.add(new THREE.CapsuleGeometry(0.078, 0.1, 4, 10), shirt, { p: [0, -0.08, 0] });
      b.add(new THREE.CapsuleGeometry(0.066, 0.1, 4, 10), skin, { p: [0, -0.21, 0] });
      b.add(sphere(0.078, 10), skin, { p: [0, -0.31, 0.01] });
    } else {
      pivot.position.set(side * 0.11, 0.36, 0);
      b.add(new THREE.CapsuleGeometry(0.088, 0.16, 4, 10), pants, { p: [0, -0.14, 0] });
      b.add(rbox(0.17, 0.11, 0.24, 0.05), SHOE, { p: [0, -0.3, 0.035] });
    }
    pivot.add(m(b.geometry()));
    rig.add(pivot);
    return pivot;
  };
  const armL = limb(-1, true);
  const armR = limb(1, true);
  const legL = limb(-1, false);
  const legR = limb(1, false);
  const hand = new THREE.Group();
  hand.position.set(0, -0.31, 0.02);
  armR.add(hand);
  const tool = new THREE.Mesh(new THREE.BufferGeometry(), vcMat(0.6));
  tool.castShadow = true;
  hand.add(tool);
  let toolId = '';
  const ease = (k: number) => k * k * (3 - 2 * k);

  return {
    g,
    pose(p) {
      const sw = p.moving ? Math.sin(p.walk) : 0;
      rig.position.set(0, 0, 0);
      rig.rotation.set(0, 0, 0);
      head.rotation.set(0, 0, 0);
      armL.rotation.set(0, 0, -0.18);
      armR.rotation.set(0, 0, 0.18);
      legL.rotation.set(0, 0, 0);
      legR.rotation.set(0, 0, 0);
      hand.rotation.set(0, 0, 0);
      const want = p.swing > 0 && p.tool ? toolFor(p.tool, !!p.can) : '';
      if (want !== toolId) {
        toolId = want;
        tool.geometry = want ? toolGeo(want) : new THREE.BufferGeometry();
        // lange Werkzeuge zeigen leicht nach unten vorn
        tool.rotation.x = want === 'axe' || want === 'hoe' || want === 'scythe' ? 0.5 : 0;
      }
      if (p.sleep) {
        rig.rotation.x = -Math.PI / 2;
        rig.position.set(0, 0.25, 0.6);
        head.rotation.x = 0.2;
        return;
      }
      if (p.ride) {
        legL.rotation.set(-1.1, 0, -0.55);
        legR.rotation.set(-1.1, 0, 0.55);
        armL.rotation.set(-0.85, 0, -0.1);
        armR.rotation.set(-0.85, 0, 0.1);
        rig.position.y = Math.abs(sw) * 0.06;
        head.rotation.z = sw * 0.04;
        return;
      }
      // Atmen und Laufen
      rig.position.y = p.moving ? Math.abs(sw) * 0.06 : Math.sin(p.t * 2.2) * 0.008;
      legL.rotation.x = sw * 0.75;
      legR.rotation.x = -sw * 0.75;
      armL.rotation.x = -sw * 0.6;
      armR.rotation.x = sw * 0.6;
      if (p.moving) rig.rotation.x = 0.06;
      if (p.swing > 0) {
        const k = p.swing;
        if (toolId === 'axe' || toolId === 'hoe' || toolId === 'scythe') {
          // ausholen, dann kräftig nach vorn unten
          const a = k < 0.45 ? -2.7 * ease(k / 0.45) : -2.7 + 2.2 * ease((k - 0.45) / 0.55);
          armR.rotation.set(a, 0, 0.1);
          armL.rotation.set(a * 0.7, 0, -0.1);
          rig.rotation.x = k < 0.45 ? -0.08 * ease(k / 0.45) : 0.18 * ease((k - 0.45) / 0.55);
          if (toolId === 'scythe') rig.rotation.y = (k - 0.5) * 0.8;
        } else if (toolId === 'can' || toolId === 'bucket') {
          armR.rotation.set(-1.15, 0, 0.1);
          hand.rotation.x = 1.15 + ease(Math.min(1, k * 1.6)) * 0.8;
        } else {
          const a = -0.4 - Math.sin(k * Math.PI) * 0.9;
          armR.rotation.set(a, 0, 0.1);
          armL.rotation.set(a, 0, -0.1);
          hand.rotation.x = -a;
          rig.rotation.x = Math.sin(k * Math.PI) * 0.25;
        }
      }
    },
    dispose() {
      for (const o of own) o.dispose();
    },
  };
}
