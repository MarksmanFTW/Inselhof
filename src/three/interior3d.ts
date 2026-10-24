/**
 * Haus von innen in 3D: Holzboden, Bretterwand mit Fenster, Bett, Truhe und die
 * fünf Möbelplätze (Tisch, Stuhl, Teppich, Pflanze, Lampe, Regal). Gleiche
 * Koordinaten wie im Spiel (ROOM_W × ROOM_H Welt-Pixel), Blick wie ins Puppenhaus.
 */
import * as THREE from 'three';
import { BED, CHEST, ROOM_H, ROOM_W, doorOf, roomW, slotsOf } from '../interior';
import type { TimeOfDay } from '../time';
import { Build, U, cone, curve, cyl, rbox, sphere } from './engine';
import { glowMats } from './models';

const WALL_Z = 22 * U;
const RD = ROOM_H * U;

export function furniture(id: string) {
  const b = new Build();
  if (id === 'table') {
    b.add(rbox(2.6, 0.14, 1.3, 0.05), '#c8925a', { p: [0, 0.82, -0.6] });
    for (const [x, z] of [[-1.1, -1.05], [1.1, -1.05], [-1.1, -0.15], [1.1, -0.15]] as const) b.add(rbox(0.14, 0.78, 0.14, 0.04), '#8a5a32', { p: [x, 0.4, z] });
    b.add(cyl(0.12, 0.09, 0.3, 12), '#e8dcc8', { p: [0.4, 1.04, -0.6] });
    b.add(sphere(0.1, 8), '#ff9fc4', { p: [0.4, 1.28, -0.6] });
    b.add(cyl(0.2, 0.2, 0.03, 14), '#f4f0e6', { p: [-0.5, 0.9, -0.55] });
  } else if (id === 'chair') {
    b.add(rbox(0.75, 0.1, 0.7, 0.04), '#c8925a', { p: [0, 0.5, -0.35] });
    b.add(rbox(0.75, 0.75, 0.1, 0.04), '#a87a48', { p: [0, 0.9, -0.68] });
    for (const [x, z] of [[-0.3, -0.05], [0.3, -0.05], [-0.3, -0.65], [0.3, -0.65]] as const) b.add(rbox(0.09, 0.5, 0.09, 0.03), '#7a5232', { p: [x, 0.25, z] });
    b.add(rbox(0.6, 0.08, 0.55, 0.04), '#e0564a', { p: [0, 0.58, -0.35] });
  } else if (id === 'rug') {
    b.add(cyl(1, 1, 0.04, 28), '#8a3a3a', { p: [0, 0.02, -0.5], s: [1.9, 1, 0.8] });
    b.add(cyl(1, 1, 0.045, 28), '#e0564a', { p: [0, 0.025, -0.5], s: [1.55, 1, 0.62] });
    b.add(cyl(1, 1, 0.05, 28), '#f2c14e', { p: [0, 0.03, -0.5], s: [0.8, 1, 0.3] });
  } else if (id === 'plant') {
    b.add(cyl(0.3, 0.22, 0.5, 14), '#b05a3a', { p: [0, 0.25, -0.3] });
    b.add(cyl(0.32, 0.32, 0.06, 14), '#d8784a', { p: [0, 0.5, -0.3] });
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      b.add(sphere(0.2, 10), k % 2 ? '#4f9a44' : '#5fae4e', { p: [Math.cos(a) * 0.2, 0.85 + (k % 3) * 0.12, -0.3 + Math.sin(a) * 0.2], s: [0.7, 1.5, 0.7], r: [Math.sin(a) * 0.4, 0, Math.cos(a) * 0.4] });
    }
  } else if (id === 'lamp') {
    b.add(cyl(0.25, 0.3, 0.08, 14), '#5a3a20', { p: [0, 0.04, -0.25] });
    b.add(cyl(0.04, 0.04, 1.7, 8), '#5a3a20', { p: [0, 0.9, -0.25] });
    b.add(cone(0.45, 0.55, 16), '#f2dca0', { p: [0, 1.9, -0.25] });
  } else if (id === 'shelf') {
    b.add(rbox(2.4, 2.6, 0.6, 0.06), '#8a5a32', { p: [0, 1.3, -0.35] });
    b.add(rbox(2.2, 2.4, 0.5, 0.04), '#6a4228', { p: [0, 1.3, -0.3] });
    for (const y of [0.85, 1.7]) b.add(rbox(2.25, 0.08, 0.5, 0.02), '#a87a48', { p: [0, y, -0.28] });
    const books = ['#e0564a', '#4a8ad0', '#f2c14e', '#5fae63', '#9a6ad0', '#f08ab0'];
    for (let i = 0; i < 7; i++) b.add(rbox(0.22, 0.5 - (i % 3) * 0.06, 0.36, 0.03), books[i % 6], { p: [-0.85 + i * 0.27, 2.0 - (i % 3) * 0.03, -0.25] });
    for (let i = 0; i < 4; i++) b.add(cyl(0.13, 0.13, 0.4, 10), i % 2 ? '#9fd8f0' : '#f4eef4', { p: [-0.75 + i * 0.5, 1.1, -0.25] });
    b.add(rbox(0.9, 0.5, 0.4, 0.05), '#b05a9a', { p: [-0.4, 0.4, -0.2] });
  }
  return b.empty ? null : b.mesh(0.75);
}

export class Interior {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  private furnKey = '';
  private furn = new THREE.Group();
  private lamp = new THREE.PointLight('#ffb060', 0, 12, 1.5);
  private hemi = new THREE.HemisphereLight('#fff4e0', '#8a6a50', 1.1);
  private sun = new THREE.DirectionalLight('#fff0d8', 1.4);
  private pane!: THREE.MeshStandardMaterial;
  private marks: THREE.Mesh[] = [];
  /** Raum (Boden, Wände, Bett, Truhe, Fenster, Platz-Markierungen) */
  private layout = new THREE.Group();
  private big = false;
  private rw = ROOM_W * U;

  constructor() {
    const s = this.scene;
    s.background = new THREE.Color('#20140c');
    s.add(this.hemi, this.lamp);
        this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 30 });
    s.add(this.sun, this.sun.target);
    s.add(this.layout, this.furn);
    this.build(false);
  }

  /** Raum bauen (ausgebaute Häuser sind breiter) */
  private build(big: boolean) {
    this.big = big;
    this.rw = roomW(big) * U;
    const rw = this.rw;
    // Formen und eigene Materialien freigeben (die geteilten Modell-Materialien bleiben)
    this.layout.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.geometry.dispose();
      if (o.material === this.pane || this.marks.includes(o)) (o.material as THREE.Material).dispose();
    });
    this.layout.clear();
    this.marks = [];
    this.furnKey = '';
    this.sun.position.set(rw / 2 - 2, 9, WALL_Z + 9);
    this.sun.target.position.set(rw / 2, 0, RD / 2);
    const b = new Build();
    // Boden aus Dielen
    for (let z = WALL_Z; z < RD; z += 0.75) b.add(rbox(rw, 0.2, 0.72, 0.04), Math.round(z / 0.75) % 2 ? '#c8945a' : '#b8844c', { p: [rw / 2, -0.1, z + 0.37] });
    // Rückwand: unten Holz, oben hell, mit Fenster und Bild
    b.add(rbox(rw + 0.4, 1.2, 0.3, 0.04), '#a8743f', { p: [rw / 2, 0.6, WALL_Z - 0.15] });
    b.add(rbox(rw + 0.4, 2.4, 0.3, 0.04), '#f6e6c8', { p: [rw / 2, 2.4, WALL_Z - 0.15] });
    b.add(rbox(rw + 0.4, 0.16, 0.36, 0.04), '#8a5a32', { p: [rw / 2, 1.22, WALL_Z - 0.1] });
    b.add(rbox(rw + 0.4, 0.2, 0.36, 0.04), '#8a5a32', { p: [rw / 2, 3.6, WALL_Z - 0.1] });
    // Fensterrahmen (Scheibe dazwischen kommt extra, sie leuchtet)
    for (const [x, y, w, h] of [[0, 0.75, 2.2, 0.14], [0, -0.75, 2.3, 0.18], [-1.03, 0, 0.14, 1.6], [1.03, 0, 0.14, 1.6], [0, 0, 0.08, 1.4], [0, 0, 1.9, 0.08]] as const)
      b.add(rbox(w, h, 0.14, 0.03), '#8a5a32', { p: [rw / 2 + x, 2.35 + y, WALL_Z + 0.05] });
    for (const sx of [-1, 1]) b.add(rbox(0.6, 1.9, 0.08, 0.04), '#f08ab0', { p: [rw / 2 + sx * 1.35, 2.35, WALL_Z + 0.12] });
    // Bild mit Pferd
    b.add(rbox(1.3, 1.0, 0.08, 0.03), '#c8945a', { p: [rw / 2 + 4.3, 2.4, WALL_Z + 0.02] });
    b.add(rbox(1.1, 0.8, 0.04, 0.02), '#bfe6f0', { p: [rw / 2 + 4.3, 2.4, WALL_Z + 0.07] });
    b.add(sphere(0.2, 10), '#c8803a', { p: [rw / 2 + 4.25, 2.3, WALL_Z + 0.1], s: [1.3, 0.8, 0.3] });
    b.add(sphere(0.1, 8), '#c8803a', { p: [rw / 2 + 4.55, 2.5, WALL_Z + 0.1], s: [1.2, 1, 0.3] });
    b.add(rbox(1.1, 0.2, 0.04, 0.02), '#7ccf6a', { p: [rw / 2 + 4.3, 2.08, WALL_Z + 0.08] });
    // Seitenwände (halbhoch) und vorn kniehoch mit Tür in der Mitte
    for (const x of [-0.15, rw + 0.15]) b.add(rbox(0.3, 2.2, RD - WALL_Z + 0.3, 0.05), '#a8743f', { p: [x, 1.1, (WALL_Z + RD) / 2] });
    const door = doorOf(big).x * U;
    b.add(rbox(door - 1.1, 0.5, 0.3, 0.05), '#a8743f', { p: [(door - 1.1) / 2, 0.25, RD + 0.15] });
    b.add(rbox(rw - door - 1.1, 0.5, 0.3, 0.05), '#a8743f', { p: [door + 1.1 + (rw - door - 1.1) / 2, 0.25, RD + 0.15] });
    b.add(rbox(1.8, 0.03, 0.8, 0.03), '#c8584a', { p: [door, 0.02, RD - 0.45] });
    // Bett
    const bx = (BED.x + BED.w / 2) * U;
    const bz = (BED.y + BED.h / 2) * U;
    const bw = BED.w * U;
    const bd = BED.h * U;
    b.add(rbox(bw, 0.45, bd, 0.08), '#7a5232', { p: [bx, 0.3, bz] });
    b.add(rbox(bw + 0.1, 1.3, 0.2, 0.08), '#7a5232', { p: [bx, 0.75, bz - bd / 2 + 0.05] });
    b.add(rbox(bw - 0.15, 0.25, bd - 0.25, 0.1), '#f4eef4', { p: [bx, 0.6, bz + 0.05] });
    b.add(rbox(bw - 0.6, 0.22, 0.7, 0.11), '#ffffff', { p: [bx, 0.82, bz - bd / 2 + 0.6] });
    b.add(rbox(bw - 0.05, 0.2, bd * 0.55, 0.09), '#4a8ad0', { p: [bx, 0.72, bz + bd * 0.2] });
    for (let k = 0; k < 4; k++) b.add(sphere(0.08, 8), '#f2c14e', { p: [bx - 0.9 + k * 0.6, 0.83, bz + bd * 0.2], s: [1, 0.3, 1] });
    // Truhe
    const cx = (CHEST.x + CHEST.w / 2) * U;
    const cz = (CHEST.y + CHEST.h / 2) * U;
    b.add(rbox(CHEST.w * U, 0.9, CHEST.h * U, 0.08), '#a87a48', { p: [cx, 0.45, cz] });
    b.add(rbox(CHEST.w * U + 0.05, 0.3, CHEST.h * U + 0.05, 0.08), '#8a5a32', { p: [cx, 0.95, cz] });
    for (const x of [-0.75, 0.75]) b.add(rbox(0.1, 1.15, CHEST.h * U + 0.08, 0.02), '#6a6670', { p: [cx + x, 0.55, cz] });
    b.add(rbox(0.22, 0.3, 0.06, 0.03), '#f2c14e', { p: [cx, 0.75, cz + (CHEST.h * U) / 2 + 0.03] });
    if (big) {
      // neuer Teil rechts: Kamin an der Rückwand mit Holzstapel
      const kx = rw - 2.1;
      const kz = WALL_Z + 0.42;
      b.add(rbox(2.0, 2.0, 0.7, 0.06), '#b8b4c2', { p: [kx, 1.0, kz] });
      b.add(rbox(2.2, 0.18, 0.84, 0.05), '#8a5a32', { p: [kx, 2.05, kz + 0.04] });
      b.add(rbox(1.1, 0.9, 0.06, 0.03), '#3a2a24', { p: [kx, 0.55, kz + 0.36] });
      // Holzscheite in der Feuerstelle
      for (const r of [-0.4, 0.4]) b.add(cyl(0.08, 0.08, 0.7, 8), '#7a4a2a', { p: [kx, 0.16, kz + 0.52], r: [0, 0, Math.PI / 2 + r * 0.3] });
      b.add(rbox(0.9, 1.6, 0.6, 0.06), '#a8a4b4', { p: [kx, 2.9, kz - 0.05] });
      for (const [x, y] of [[-0.28, 0.12], [0.28, 0.12], [0, 0.3]] as const) b.add(cyl(0.12, 0.12, 0.8, 10), '#a8743f', { p: [kx - 1.6 + x, y, kz + 0.5], r: [Math.PI / 2, 0, 0] });
    }
    const room = b.mesh(0.8);
    room.castShadow = true;
    this.layout.add(room);
    if (big) {
      // Flammen vor der dunklen Öffnung
      for (const [x, h, m] of [[0, 0.55, glowMats.flame], [-0.18, 0.35, glowMats.flame2], [0.18, 0.4, glowMats.flame2]] as const) {
        const fl = new THREE.Mesh(cone(0.16, h, 8), m);
        fl.position.set(rw - 2.1 + x, 0.2 + h / 2, WALL_Z + 0.42 + 0.5);
        this.layout.add(fl);
      }
    }
    // Fensterscheibe: tags hell, nachts dunkelblau
    this.pane = curve(new THREE.MeshStandardMaterial({ color: '#cfefff', emissive: '#bfe8ff', emissiveIntensity: 0.6, roughness: 0.3 }));
    const pane = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.35, 0.04), this.pane);
    pane.position.set(rw / 2, 2.35, WALL_Z + 0.02);
    this.layout.add(pane);
    // freie Plätze leicht markieren
    for (const sl of slotsOf(big)) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.55, 24).rotateX(-Math.PI / 2), curve(new THREE.MeshBasicMaterial({ color: '#fff4d6', transparent: true, opacity: 0.35, depthWrite: false })));
      m.position.set(sl.x * U, 0.03, (sl.y - 4) * U);
      this.layout.add(m);
      this.marks.push(m);
    }
  }

  private D = 20;
  private slack = 0;
  private camX = (ROOM_W * U) / 2;
  private vw = 1;
  private vh = 1;
  resize(w: number, h: number) {
    this.vw = w;
    this.vh = h;
    const aspect = w / Math.max(1, h);
    this.camera.aspect = aspect;
    this.camera.fov = aspect < 1 ? 44 : 36;
    // im Hochformat näher dran (Kamera folgt seitlich), sonst der ganze Raum
    const hf = 2 * Math.atan(Math.tan((this.camera.fov * Math.PI) / 360) * aspect);
    const want = aspect < 1 ? 11.2 : this.rw + 1.6;
    this.D = Math.max(13, want / 2 / Math.tan(hf / 2));
    this.slack = Math.max(0, (this.rw + 1.4 - 2 * this.D * Math.tan(hf / 2)) / 2);
    this.camera.updateProjectionMatrix();
    this.follow(this.camX, true);
  }
  /** Kamera seitlich mit der Figur (x in Einheiten) */
  follow(x: number, snap = false) {
    const want = Math.max(this.rw / 2 - this.slack, Math.min(this.rw / 2 + this.slack, x));
    this.camX = snap ? want : this.camX + (want - this.camX) * 0.12;
    const pitch = 0.95;
    const cz = (WALL_Z + RD) / 2 + 0.7;
    this.camera.position.set(this.camX, Math.sin(pitch) * this.D, cz + Math.cos(pitch) * this.D);
    this.camera.lookAt(this.camX, 0.6, cz - 0.5);
  }

  update(furn: Record<number, string>, tod: TimeOfDay | null, t: number, big = false) {
    if (big !== this.big) {
      this.build(big);
      this.resize(this.vw, this.vh);
    }
    const key = JSON.stringify(furn);
    if (key !== this.furnKey) {
      this.furnKey = key;
      this.furn.clear();
      for (const [k, id] of Object.entries(furn)) {
        const sl = slotsOf(this.big)[Number(k)];
        const m = sl && furniture(id);
        if (!m) continue;
        m.position.set(sl.x * U, 0, sl.y * U);
        this.furn.add(m);
        if (id === 'lamp') {
          const shade = new THREE.Mesh(cone(0.45, 0.55, 16), glowMats.lamp);
          shade.position.set(sl.x * U, 1.9, sl.y * U - 0.25);
          shade.scale.setScalar(1.03);
          this.furn.add(shade);
        }
      }
      this.marks.forEach((m, i) => (m.visible = !furn[i]));
    }
    const dark = tod?.dark ?? 0;
    this.pane.color.set('#cfefff').lerp(new THREE.Color('#1c2850'), dark);
    this.pane.emissive.set('#bfe8ff').lerp(new THREE.Color('#2a3a70'), dark);
    this.pane.emissiveIntensity = 0.6 - dark * 0.3;
    this.sun.intensity = 1.4 - dark * 1.1;
    this.hemi.intensity = 1.1 - dark * 0.35;
    this.hemi.color.set('#fff4e0').lerp(new THREE.Color('#ffc890'), dark);
    // abends warmes Licht (Lampe, sonst Deckenlicht)
    const lamp = this.furn.children.find((c) => c instanceof THREE.Mesh && c.material === glowMats.lamp);
    this.lamp.intensity = dark * (lamp ? 5 : 3.5) * (1 + Math.sin(t * 3) * 0.02);
    if (lamp) this.lamp.position.copy(lamp.position).add(new THREE.Vector3(0, -0.2, 0.3));
    else this.lamp.position.set(this.rw / 2, 3.2, RD / 2);
    this.marks.forEach((m) => ((m.material as THREE.MeshBasicMaterial).opacity = 0.25 + Math.sin(t * 3) * 0.12));
  }
}
