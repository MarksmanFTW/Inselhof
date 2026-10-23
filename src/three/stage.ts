/**
 * Kleine Bühne fürs Menü und „Aussehen“: die 3D-Figur auf einem Grasfleck,
 * dreht sich und läuft auf der Stelle. Eigene kleine Leinwand, die beim Wechsel
 * zwischen Menüs weiterverwendet wird (nur ein zusätzlicher WebGL-Kontext).
 */
import * as THREE from 'three';
import type { Look } from '../character';
import { CURVE, sphere } from './engine';
import { makeKid, type Kid } from './kid';

let shared: { r: THREE.WebGLRenderer; scene: THREE.Scene; cam: THREE.PerspectiveCamera } | null = null;
function world() {
  if (shared) return shared;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.shadowMap.enabled = true;
  r.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff6e0', '#6aa860', 1.35));
  const sun = new THREE.DirectionalLight('#fff0d0', 2.0);
  sun.position.set(-2, 5, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(512, 512);
  Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 0.5, far: 12 });
  scene.add(sun);
  // Grasfleck
  const patch = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.0, 0.16, 32), new THREE.MeshStandardMaterial({ color: '#7ccf6a', roughness: 0.95 }));
  patch.position.y = -0.08;
  patch.receiveShadow = true;
  scene.add(patch);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + 0.3;
    const f = new THREE.Mesh(sphere(0.05, 6), new THREE.MeshStandardMaterial({ color: ['#f48fc0', '#ffffff', '#ffd84a'][k % 3] }));
    f.position.set(Math.cos(a) * 0.75, 0.04, Math.sin(a) * 0.55);
    scene.add(f);
  }
  const cam = new THREE.PerspectiveCamera(30, 28 / 30, 0.1, 30);
  cam.position.set(0, 1.6, 4.6);
  cam.lookAt(0, 0.82, 0);
  shared = { r, scene, cam };
  return shared;
}

/** Blickrichtung wie im Spiel: 0 runter (zu dir), 1 hoch, 2 rechts, 3 links */
const YAW = [0, Math.PI, Math.PI / 2, -Math.PI / 2];

export class Stage3D {
  readonly canvas: HTMLCanvasElement;
  dir = 0;
  walking = true;
  private kid: Kid | null = null;
  private key = '';
  private raf = 0;
  private yaw = 0;
  constructor(readonly scale: number) {
    const w = world();
    this.canvas = w.r.domElement;
    this.canvas.className = 'stage-canvas';
    const cw = 28 * scale;
    const ch = 30 * scale;
    w.r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    w.r.setSize(cw, ch);
  }
  set(look: Look) {
    const k = JSON.stringify(look);
    if (k === this.key) return;
    this.key = k;
    const w = world();
    if (this.kid) {
      w.scene.remove(this.kid.g);
      this.kid.dispose();
    }
    this.kid = makeKid(look);
    w.scene.add(this.kid.g);
  }
  start() {
    const w = world();
    const t0 = performance.now();
    let last = t0;
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = (now - t0) / 1000;
      if (!this.kid) return;
      let d = YAW[this.dir] - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 6);
      this.kid.g.rotation.y = this.yaw;
      this.kid.pose({ walk: t * 9, moving: this.walking, swing: 0, tool: '', ride: false, t });
      // die Bühne ist nicht gewölbt
      const c = CURVE.value;
      CURVE.value = 0;
      w.r.render(w.scene, w.cam);
      CURVE.value = c;
    };
    this.raf = requestAnimationFrame(tick);
  }
  stop() {
    cancelAnimationFrame(this.raf);
  }
}
