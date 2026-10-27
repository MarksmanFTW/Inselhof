/**
 * Händler-Boot von Kapitänin Frieda: Holzrumpf mit Planken und Zierstreifen,
 * Steuerhaus mit Fenstern, gestreiftes Marktdach über den Waren, Mast mit
 * Wimpelkette, Rettungsring, Laterne und Namensschild. Bug zeigt nach +x.
 */
import * as THREE from 'three';
import { Build, cone, curve, cyl, rbox, sphere, strand } from './engine';
import { makeKid } from './kid';
import { glowMats } from './models';

const L = 4.6;
const B = 1.8;
/** Breite (halb) an der Stelle u (0 = Heck, 1 = Bug) */
const halfW = (u: number) => (B / 2) * (u < 0.4 ? 0.8 + 0.2 * Math.sin((u / 0.4) * (Math.PI / 2)) : Math.pow(Math.max(0, 1 - ((u - 0.4) / 0.6) ** 2), 0.55));
/** Oberkante (Reling) und Kiel */
const topY = (u: number) => 0.55 + 0.32 * Math.max(0, (u - 0.6) / 0.4) ** 2 + 0.1 * Math.max(0, (0.12 - u) / 0.12);
const keelY = (u: number) => -0.42 + 0.3 * Math.max(0, (u - 0.55) / 0.45) ** 1.6;
const xAt = (u: number) => -L / 2 + u * L;
const DECK = 0.16;

/** Rumpf als Schale: Querschnitte vom Heck zum Bug */
function hullGeo() {
  const NU = 28;
  const NV = 18;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= NU; i++) {
    const u = i / NU;
    const w = halfW(u);
    const t = topY(u);
    const k = keelY(u);
    for (let j = 0; j <= NV; j++) {
      const th = (j / NV - 0.5) * Math.PI;
      pos.push(xAt(u), t - (t - k) * Math.pow(Math.cos(th), 0.55), w * Math.sin(th));
    }
  }
  for (let i = 0; i < NU; i++)
    for (let j = 0; j < NV; j++) {
      const a = i * (NV + 1) + j;
      const b = a + NV + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  // Heckspiegel (flach zu)
  const c = pos.length / 3;
  pos.push(xAt(0), (topY(0) + keelY(0)) / 2 + 0.05, 0);
  for (let j = 0; j < NV; j++) idx.push(c, j + 1, j);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Deck: Umriss knapp unter der Reling, Planken längs */
function deckGeo() {
  const shape = new THREE.Shape();
  const N = 24;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const p = [xAt(u), -(halfW(u) - 0.08)] as const;
    if (i === 0) shape.moveTo(p[0], p[1]);
    else shape.lineTo(p[0], p[1]);
  }
  for (let i = N; i >= 0; i--) shape.lineTo(xAt(i / N), halfW(i / N) - 0.08);
  const g = new THREE.ShapeGeometry(shape, 2);
  g.rotateX(Math.PI / 2);
  return g;
}

/** Holz, Zierstreifen und Unterwasserfarbe nach Höhe */
function hullColor(x: number, y: number, z: number, out: THREE.Color) {
  const u = (x + L / 2) / L;
  const t = topY(Math.max(0, Math.min(1, u)));
  // oben ein heller Streifen, darunter blau gestrichene Planken, an der Wasserlinie rot
  if (y > t - 0.09) out.set('#fbf3e4');
  else if (y > t - 0.17) out.set('#e8574a');
  else if (y < 0.04) out.set('#c8503e');
  else out.set(Math.floor((y + 1) / 0.105) % 2 ? '#3d93c4' : '#3584b2');
  void z;
}

function lifeRing() {
  const g = new THREE.TorusGeometry(0.2, 0.06, 8, 20);
  return g;
}

/** Namensschild „FRIEDA“ (Leinwand-Bild) */
function namePlate() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const x = c.getContext('2d')!;
  x.fillStyle = '#f6efe2';
  x.font = 'bold 44px Fredoka, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('FRIEDA', 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), curve(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })));
  return m;
}

export interface MerchantBoat {
  g: THREE.Group;
  /** Schaum rund um den Rumpf */
  foam: THREE.Mesh;
  flag: THREE.Object3D;
  pennants: THREE.Object3D;
  captain: THREE.Object3D;
}

export function merchantBoat(): MerchantBoat {
  const g = new THREE.Group();
  const b = new Build();
  b.add(hullGeo(), hullColor);
  // Deck
  b.add(deckGeo(), (_x, _y, z, out) => out.set(Math.floor((z + 2) / 0.2) % 2 ? '#d8a46a' : '#c8945a'), { p: [0, DECK, 0] });
  // Reling: ein Wulst rundherum
  const rail: [number, number, number][] = [];
  for (let i = 0; i <= 20; i++) rail.push([xAt(i / 20), topY(i / 20) + 0.02, -halfW(i / 20)]);
  for (let i = 20; i >= 0; i--) rail.push([xAt(i / 20), topY(i / 20) + 0.02, halfW(i / 20)]);
  b.add(strand(rail, 0.055, 0, 80, 6), '#f6efe2');
  // Bugspitze mit goldenem Stern
  b.add(sphere(0.09, 10), '#f2c14e', { p: [L / 2 + 0.02, topY(1) + 0.08, 0] });

  // Steuerhaus am Heck
  const cx = -1.45;
  b.add(rbox(1.0, 0.95, 1.1, 0.06), '#f6efe2', { p: [cx, DECK + 0.48, 0] });
  b.add(rbox(1.04, 0.1, 1.14, 0.03), '#3e86b8', { p: [cx, DECK + 0.08, 0] });
  b.add(rbox(1.22, 0.12, 1.32, 0.05), '#d9533f', { p: [cx, DECK + 1.02, 0] });
  b.add(rbox(1.0, 0.1, 1.1, 0.05), '#e8705a', { p: [cx, DECK + 1.12, 0] });
  // Ofenrohr
  b.add(cyl(0.06, 0.06, 0.45, 8), '#5a5a64', { p: [cx - 0.3, DECK + 1.38, -0.3] });
  b.add(cyl(0.09, 0.07, 0.08, 8), '#5a5a64', { p: [cx - 0.3, DECK + 1.62, -0.3] });
  // Fensterrahmen (die Scheiben leuchten nachts, eigenes Material)
  for (const z of [-0.56, 0.56]) b.add(rbox(0.62, 0.42, 0.04, 0.03), '#3e86b8', { p: [cx, DECK + 0.6, z] });
  b.add(rbox(0.04, 0.42, 0.62, 0.03), '#3e86b8', { p: [cx + 0.51, DECK + 0.6, 0] });

  // Marktdach mittschiffs: vier Pfosten, gestreiftes Tuch
  const ax0 = -0.65;
  const ax1 = 0.85;
  for (const x of [ax0, ax1]) for (const z of [-0.62, 0.62]) b.add(cyl(0.035, 0.04, 1.25, 6), '#8a5a32', { p: [x, DECK + 0.62, z] });
  const awn = new THREE.PlaneGeometry(ax1 - ax0 + 0.3, 1.5, 12, 4);
  awn.rotateX(-Math.PI / 2);
  // leicht gewölbt
  const ap = awn.attributes.position;
  for (let i = 0; i < ap.count; i++) ap.setY(i, -0.12 * (ap.getZ(i) / 0.75) ** 2);
  awn.computeVertexNormals();
  b.add(awn, (x, _y, _z, out) => out.set(Math.floor((x + 3) / 0.25) % 2 ? '#ffffff' : '#e0564a'), { p: [(ax0 + ax1) / 2, DECK + 1.3, 0] });
  // Zackenkante vorn und hinten
  for (const z of [-0.76, 0.76])
    for (let k = 0; k < 7; k++) b.add(cone(0.1, 0.16, 3), k % 2 ? '#ffffff' : '#e0564a', { p: [ax0 - 0.12 + k * 0.27, DECK + 1.1, z], r: [Math.PI, 0, 0], s: [1, 1, 0.3] });

  // Waren: Kisten mit Obst, Fass, Säcke, Blumentöpfe
  const crate = (x: number, z: number, fruit: string, fruit2: string) => {
    b.add(rbox(0.46, 0.3, 0.38, 0.04), '#c8945a', { p: [x, DECK + 0.15, z] });
    b.add(rbox(0.48, 0.05, 0.4, 0.02), '#a8743f', { p: [x, DECK + 0.08, z] });
    for (let k = 0; k < 6; k++) b.add(sphere(0.085, 8), k % 2 ? fruit : fruit2, { p: [x - 0.15 + (k % 3) * 0.15, DECK + 0.33, z - 0.08 + Math.floor(k / 3) * 0.16] });
  };
  crate(-0.3, 0.38, '#e0483e', '#f05a48');
  crate(0.25, 0.42, '#ff9a3a', '#ffae4a');
  crate(0.5, -0.4, '#8ac840', '#f2c14e');
  b.add(cyl(0.2, 0.2, 0.5, 12), '#9a6a40', { p: [-0.35, DECK + 0.25, -0.38] });
  for (const y of [0.1, 0.4]) b.add(cyl(0.21, 0.21, 0.04, 12), '#5a5a64', { p: [-0.35, DECK + y, -0.38] });
  b.add(sphere(0.22, 10), '#e8d4a8', { p: [0.05, DECK + 0.18, -0.45], s: [1, 0.9, 0.85] });
  b.add(cyl(0.08, 0.06, 0.14, 8), '#e8d4a8', { p: [0.05, DECK + 0.4, -0.45] });
  for (const [x, col] of [[0.8, '#f48fc0'], [0.95, '#ffd84a']] as const) {
    b.add(cyl(0.08, 0.06, 0.14, 8), '#c8603a', { p: [x, DECK + 0.07, 0.5] });
    for (let k = 0; k < 4; k++) b.add(sphere(0.05, 6), k % 2 ? col : '#ffffff', { p: [x + Math.cos(k * 1.6) * 0.05, DECK + 0.2, 0.5 + Math.sin(k * 1.6) * 0.05] });
    b.add(sphere(0.06, 6), '#5fae4e', { p: [x, DECK + 0.16, 0.5], s: [1.3, 0.6, 1.3] });
  }

  // Mast mit Rahe und eingerolltem Segel
  const mx = 1.35;
  b.add(cyl(0.06, 0.075, 3.0, 8), '#8a5a32', { p: [mx, DECK + 1.5, 0] });
  b.add(cyl(0.035, 0.035, 1.5, 6), '#8a5a32', { p: [mx - 0.1, DECK + 2.3, 0], r: [Math.PI / 2, 0, 0] });
  b.add(cyl(0.1, 0.1, 1.35, 10), '#f4ede0', { p: [mx - 0.1, DECK + 2.2, 0], r: [Math.PI / 2, 0, 0] });
  for (const z of [-0.4, 0, 0.4]) b.add(new THREE.TorusGeometry(0.105, 0.018, 4, 10), '#c89a5a', { p: [mx - 0.1, DECK + 2.2, z] });
  b.add(sphere(0.07, 8), '#f2c14e', { p: [mx, DECK + 3.02, 0] });
  // Ausguck-Leine zum Bug
  b.add(strand([[mx, DECK + 2.95, 0], [mx + 0.6, DECK + 2.0, 0], [L / 2, topY(1) + 0.1, 0]], 0.012, 0, 12, 4), '#8a7a5a');

  // Rettungsring am Steuerhaus
  b.add(lifeRing(), (x, y, _z, out) => out.set(Math.floor((Math.atan2(y - (DECK + 0.62), x - (cx + 0.1)) / Math.PI) * 4 + 8) % 2 ? '#ffffff' : '#e0483e'), { p: [cx + 0.1, DECK + 0.62, 0.6] });

  const hull = new THREE.Mesh(b.geometry(), (() => {
    const m = curve(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide }));
    return m;
  })());
  hull.castShadow = true;
  hull.receiveShadow = true;
  g.add(hull);

  // Fensterscheiben (leuchten nachts)
  const pane = new THREE.BoxGeometry(0.5, 0.3, 0.02);
  for (const z of [-0.575, 0.575]) {
    const w = new THREE.Mesh(pane, glowMats.window);
    w.position.set(cx, DECK + 0.6, z);
    g.add(w);
  }
  const front = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.3, 0.5), glowMats.window);
  front.position.set(cx + 0.525, DECK + 0.6, 0);
  g.add(front);
  // Laterne unter dem Marktdach
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.16), glowMats.lamp);
  lamp.position.set(ax1, DECK + 1.05, 0.62);
  g.add(lamp);
  const lampTop = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.1, 4), glowMats.window);
  lampTop.material = new THREE.MeshStandardMaterial({ color: '#3a3a44' });
  curve(lampTop.material as THREE.Material);
  lampTop.position.set(ax1, DECK + 1.2, 0.62);
  lampTop.rotation.y = Math.PI / 4;
  g.add(lampTop);

  // Namensschild am Bug (zur Kamera hin)
  const plate = namePlate();
  plate.position.set(1.1, 0.32, halfW((1.1 + L / 2) / L) + 0.015);
  plate.rotation.y = 0.18;
  g.add(plate);

  // Wimpelkette vom Mast zum Steuerhaus
  const pennants = new THREE.Group();
  {
    const pb = new Build();
    const a = new THREE.Vector3(mx, DECK + 2.9, 0);
    const c = new THREE.Vector3(cx + 0.3, DECK + 1.15, 0);
    const cols = ['#e0564a', '#f2c14e', '#5fae63', '#4a8ad0', '#f08ab0'];
    const pts: [number, number, number][] = [];
    for (let k = 0; k <= 10; k++) {
      const t = k / 10;
      const p = a.clone().lerp(c, t);
      p.y -= Math.sin(t * Math.PI) * 0.35;
      pts.push([p.x, p.y, p.z]);
      if (k > 0 && k < 10) pb.add(cone(0.08, 0.18, 3), cols[k % cols.length], { p: [p.x, p.y - 0.1, p.z], r: [Math.PI, 0, 0], s: [1, 1, 0.25] });
    }
    pb.add(strand(pts, 0.01, 0, 20, 3), '#8a7a5a');
    const pm = new THREE.Mesh(pb.geometry(), curve(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide })));
    pennants.add(pm);
  }
  g.add(pennants);

  // Flagge oben am Mast (flattert)
  const flag = new THREE.Group();
  {
    const fb = new Build();
    fb.add(rbox(0.55, 0.32, 0.02, 0.01), '#f2c14e', { p: [0.29, 0, 0] });
    fb.add(cyl(0.08, 0.08, 0.03, 12), '#c8902a', { p: [0.29, 0, 0.015], r: [Math.PI / 2, 0, 0] });
    const fm = new THREE.Mesh(fb.geometry(), curve(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide })));
    flag.add(fm);
  }
  flag.position.set(mx, DECK + 2.82, 0);
  g.add(flag);

  // Kapitänin Frieda hinter ihren Waren
  const kid = makeKid({ skin: 1, hair: 3, hairColor: 4, shirt: 1, pants: 0, hat: 0 });
  kid.pose({ walk: 0, moving: false, swing: 0, tool: '', ride: false, t: 0 });
  const captain = kid.g;
  {
    const hb = new Build();
    hb.add(cyl(0.3, 0.27, 0.16, 16), '#ffffff', { p: [0, 0.08, 0] });
    hb.add(cyl(0.34, 0.34, 0.05, 16), '#ffffff', { p: [0, 0.17, 0], s: [1, 1, 1] });
    hb.add(cyl(0.29, 0.29, 0.06, 16), '#2a3a5a', { p: [0, 0.02, 0] });
    hb.add(cyl(0.24, 0.24, 0.03, 12, ), '#2a2a30', { p: [0, -0.01, 0.16], s: [1, 1, 0.7] });
    hb.add(sphere(0.045, 8), '#f2c14e', { p: [0, 0.06, 0.29] });
    const hat = new THREE.Mesh(hb.geometry(), curve(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })));
    hat.position.set(0, 1.56, -0.02);
    hat.rotation.x = -0.12;
    captain.add(hat);
  }
  captain.scale.setScalar(0.85);
  captain.position.set(-0.6, DECK, -0.05);
  g.add(captain);

  // Schaum rund um den Rumpf an der Wasserlinie
  const foam = new THREE.Mesh(
    new THREE.RingGeometry(1.0, 1.16, 40, 1),
    curve(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false })),
  );
  foam.rotation.x = -Math.PI / 2;
  foam.scale.set(L / 2 + 0.05, B / 2 + 0.05, 1);
  foam.position.y = 0.02;
  g.add(foam);
  return { g, foam, flag, pennants, captain };
}
