/**
 * Bilder aus den 3D-Modellen für Knöpfe und Fenster (Stall, Album, Pferde-Karte):
 * ein kleines Foto vom Pferd bzw. der Figur, einmal gerendert und gemerkt.
 */
import * as THREE from 'three';
import type { Breed } from '../horses';
import { CURVE } from './engine';
import { makeHorse } from './horse';

let snap: { r: THREE.WebGLRenderer; scene: THREE.Scene; cam: THREE.PerspectiveCamera } | null = null;
function studio() {
  if (snap) return snap;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.setClearColor(0x000000, 0);
  r.setPixelRatio(1);
  r.setSize(200, 168, false);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff6e0', '#8ab878', 1.5));
  const sun = new THREE.DirectionalLight('#fff0d0', 1.9);
  sun.position.set(-3, 6, 5);
  scene.add(sun);
  const cam = new THREE.PerspectiveCamera(26, 200 / 168, 0.1, 50);
  snap = { r, scene, cam };
  return snap;
}

const shots = new Map<string, string>();

/**
 * Foto eines beliebigen Modells (Symbole für Knöpfe): Blick leicht von oben vorn,
 * Modell füllt das Bild. yaw dreht das Modell, w×h = Bildgröße.
 */
export function photo(key: string, make: () => THREE.Object3D, o: { yaw?: number; tilt?: number; fill?: number; w?: number; h?: number } = {}) {
  const hit = shots.get(key);
  if (hit) return hit;
  const s = studio();
  const w = o.w ?? 128;
  const h = o.h ?? 128;
  s.r.setSize(w, h, false);
  s.cam.aspect = w / h;
  s.cam.updateProjectionMatrix();
  const obj = make();
  const holder = new THREE.Group();
  holder.add(obj);
  obj.rotation.y += o.yaw ?? -0.45;
  s.scene.add(holder);
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder, true);
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const tilt = o.tilt ?? 0.5;
  const r = (Math.max(size.x, size.y, size.z) * (o.fill ?? 0.56)) / Math.min(1, s.cam.aspect);
  const dist = r / Math.tan((s.cam.fov * Math.PI) / 360) + size.z * 0.5;
  s.cam.position.set(c.x, c.y + Math.sin(tilt) * dist, c.z + Math.cos(tilt) * dist);
  s.cam.lookAt(c);
  const cv = CURVE.value;
  CURVE.value = 0;
  s.r.render(s.scene, s.cam);
  CURVE.value = cv;
  const url = `${s.r.domElement.toDataURL('image/png')}#foto`;
  s.scene.remove(holder);
  // Pferde-Fotos haben ihr eigenes Format
  s.r.setSize(200, 168, false);
  s.cam.aspect = 200 / 168;
  s.cam.updateProjectionMatrix();
  shots.set(key, url);
  return url;
}
/** Foto eines Pferdes (Seitenansicht, leicht von vorn), als data-URL */
export function horsePhoto(b: Breed, acc = '', foal = false) {
  const key = `${b.id}|${acc}|${foal}`;
  const hit = shots.get(key);
  if (hit) return hit;
  const s = studio();
  const h = makeHorse(b, acc, foal);
  h.pose({ walk: 0, moving: false, graze: 0, t: 0.6, sleep: false, pet: 0, ridden: false });
  h.g.rotation.y = -0.55;
  s.scene.add(h.g);
  // Rahmen: ganzes Pferd im Bild, Größe nach Rasse
  h.g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(h.g, true);
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const r = Math.max(size.x, size.y * 1.15, size.z) * 0.5;
  const dist = r / Math.tan((s.cam.fov * Math.PI) / 360) + 0.4;
  s.cam.position.set(c.x + 0.4, c.y + dist * 0.28, c.z + dist);
  s.cam.lookAt(c.x, c.y - size.y * 0.02, c.z);
  const cv = CURVE.value;
  CURVE.value = 0;
  s.r.render(s.scene, s.cam);
  CURVE.value = cv;
  // „#foto“: Fotos weich skalieren (Pixelbilder bleiben scharfkantig, siehe style.css)
  const url = `${s.r.domElement.toDataURL('image/png')}#foto`;
  s.scene.remove(h.g);
  h.dispose();
  shots.set(key, url);
  return url;
}
