/**
 * 3D-Grundlagen: Maßstab (8 Welt-Pixel = 1 Einheit), gewölbter Horizont wie ein
 * rollender Baumstamm, geteilte Materialien und ein Baukasten, der viele
 * Grundformen zu einem einzigen Modell mit Farben pro Ecke verschmilzt
 * (wenige Zeichenaufrufe – wichtig für alte Handys).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** Welt-Pixel → 3D-Einheiten */
export const U = 1 / 8;

/** Stärke der Wölbung und ab wo (Welt-z) sich der Boden wegbiegt */
export const CURVE = { value: 0.011 };
export const FOCUS = { value: 0 };

const curved = new WeakSet<THREE.Material>();
/** Material biegt sich mit dem Horizont (auch instanzierte Modelle) */
export function curve<T extends THREE.Material>(m: T): T {
  if (curved.has(m)) return m;
  curved.add(m);
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    sh.uniforms.uCurve = CURVE;
    sh.uniforms.uFocus = FOCUS;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uCurve;\nuniform float uFocus;').replace(
      '#include <project_vertex>',
      `vec4 cw = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  cw = instanceMatrix * cw;
#endif
  cw = modelMatrix * cw;
  float cz = min(0.0, cw.z - uFocus);
  cw.y -= cz * cz * uCurve;
  vec4 mvPosition = viewMatrix * cw;
  gl_Position = projectionMatrix * mvPosition;`,
    );
  };
  // eigener Schlüssel, damit three das geänderte Programm nicht mit dem normalen teilt
  m.customProgramCacheKey = () => 'curved';
  return m;
}

export interface MatOpts {
  rough?: number;
  emissive?: string;
  glow?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
}
const mats = new Map<string, THREE.MeshStandardMaterial>();
/** einfarbiges Material (geteilt) */
export function mat(color: THREE.ColorRepresentation, o: MatOpts = {}) {
  const c = new THREE.Color(color).getHexString();
  const k = `${c}|${o.rough ?? 0.8}|${o.emissive ?? ''}|${o.glow ?? 0.9}|${o.opacity ?? 1}|${o.side ?? 0}`;
  let m = mats.get(k);
  if (!m) {
    m = curve(
      new THREE.MeshStandardMaterial({
        color,
        roughness: o.rough ?? 0.8,
        metalness: 0,
        ...(o.emissive ? { emissive: o.emissive, emissiveIntensity: o.glow ?? 0.9 } : {}),
        ...(o.transparent || (o.opacity ?? 1) < 1 ? { transparent: true, opacity: o.opacity ?? 1, depthWrite: false } : {}),
        side: o.side ?? THREE.FrontSide,
      }),
    );
    mats.set(k, m);
  }
  return m;
}
const vcMats = new Map<string, THREE.MeshStandardMaterial>();
/** Material, das die Farben aus dem Modell nimmt */
export function vcMat(rough = 0.8, o: { side?: THREE.Side } = {}) {
  const k = `${rough}|${o.side ?? 0}`;
  let m = vcMats.get(k);
  if (!m) {
    m = curve(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: 0, side: o.side ?? THREE.FrontSide }));
    vcMats.set(k, m);
  }
  return m;
}

export const sphere = (r: number, d = 16) => new THREE.SphereGeometry(r, d, Math.max(6, Math.round(d * 0.7)));
/** ganz einfache Kugel für Kleinkram (wenige Dreiecke) */
export const dot = (r: number) => new THREE.SphereGeometry(r, 6, 4);
export const rbox = (w: number, h: number, d: number, r = 0.06, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2.01, h / 2.01, d / 2.01));
export const cyl = (rt: number, rb: number, h: number, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg);
export const cone = (r: number, h: number, seg = 10) => new THREE.ConeGeometry(r, h, seg);

type V3 = readonly [number, number, number];
export interface Place {
  p?: V3;
  r?: V3;
  s?: V3 | number;
}
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();

/**
 * Baukasten: Grundformen mit Farbe und Lage sammeln, am Ende ein Modell.
 * color darf auch eine Funktion der Position sein (Muster, Verläufe).
 */
export class Build {
  private parts: THREE.BufferGeometry[] = [];
  add(g: THREE.BufferGeometry, color: THREE.ColorRepresentation | ((x: number, y: number, z: number, out: THREE.Color) => void), at: Place = {}) {
    const geo = g.clone();
    for (const n of Object.keys(geo.attributes)) if (n !== 'position' && n !== 'normal') geo.deleteAttribute(n);
    if (!geo.index) {
      const n = geo.attributes.position.count;
      const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n);
      for (let i = 0; i < n; i++) idx[i] = i;
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
    }
    const s = at.s ?? 1;
    tmpS.set(...(typeof s === 'number' ? ([s, s, s] as const) : s));
    tmpQ.setFromEuler(tmpE.set(...(at.r ?? ([0, 0, 0] as const))));
    tmpM.compose(tmpV.set(...(at.p ?? ([0, 0, 0] as const))), tmpQ, tmpS);
    geo.applyMatrix4(tmpM);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    if (typeof color === 'function') {
      for (let i = 0; i < pos.count; i++) {
        color(pos.getX(i), pos.getY(i), pos.getZ(i), tmpC);
        col[i * 3] = tmpC.r;
        col[i * 3 + 1] = tmpC.g;
        col[i * 3 + 2] = tmpC.b;
      }
    } else {
      tmpC.set(color);
      for (let i = 0; i < pos.count; i++) {
        col[i * 3] = tmpC.r;
        col[i * 3 + 1] = tmpC.g;
        col[i * 3 + 2] = tmpC.b;
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // Indizes einheitlich (32 bit), sonst lässt sich nicht verschmelzen
    if (!(geo.index!.array instanceof Uint32Array)) geo.setIndex(new THREE.BufferAttribute(Uint32Array.from(geo.index!.array), 1));
    this.parts.push(geo);
    return this;
  }
  get empty() {
    return !this.parts.length;
  }
  geometry() {
    const g = mergeGeometries(this.parts, false)!;
    for (const p of this.parts) p.dispose();
    this.parts = [];
    g.computeBoundingSphere();
    return g;
  }
  /** fertiges Modell (Schatten an) */
  mesh(rough = 0.8, shadow = true) {
    const m = new THREE.Mesh(this.geometry(), vcMat(rough));
    m.castShadow = shadow;
    m.receiveShadow = true;
    return m;
  }
}

/** einfarbiges Teil */
export function part(g: THREE.BufferGeometry, color: THREE.ColorRepresentation, o: MatOpts & { shadow?: boolean } = {}) {
  const m = new THREE.Mesh(g, mat(color, o));
  m.castShadow = o.shadow !== false;
  m.receiveShadow = true;
  return m;
}
export const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => (o.position.set(x, y, z), o);

/** Farbe aufhellen (+) oder abdunkeln (−) */
export function tint(hex: THREE.ColorRepresentation, f: number) {
  const c = new THREE.Color(hex);
  if (f >= 0) c.lerp(new THREE.Color('#ffffff'), f);
  else c.multiplyScalar(1 + f);
  return c;
}

/** fester Zufall für Modelle */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** weiche Röhre entlang einer Kurve, zur Spitze dünner (Mähne, Schweif, Gras) */
export function strand(pts: readonly V3[], r: number, taper = 0.75, segs = 10, radial = 6) {
  const c = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const geo = new THREE.TubeGeometry(c, segs, r, radial, false);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const p = c.getPointAt(i / segs);
    const k = 1 - (i / segs) * taper;
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j;
      if (idx >= pos.count) continue;
      v.fromBufferAttribute(pos, idx).sub(p).multiplyScalar(k).add(p);
      pos.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();
  return geo;
}
