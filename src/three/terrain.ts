/**
 * Gelände aus der Inselkarte: Wiese als weich gerundetes Plateau, Strand fällt
 * sanft ins Wasser. Die Höhen kommen aus Abstandsfeldern zur Küste bzw. zum
 * Wiesenrand – so passt das Bild genau zur Spiellogik (wo man laufen kann).
 * Dazu das Meer mit Ufer-Schaum, der Steg und Kleinkram (Blumen, Muscheln …).
 */
import * as THREE from 'three';
import { Ground, H, W, hash, type Island } from '../island';
import type { Season } from '../season';
import { Build, CURVE, FOCUS, U, cone, cyl, dot, rbox, seeded, vcMat } from './engine';

export const WATER_Y = -0.35;
export const DOCK_Y = 0.16;
/** Raster des Geländemodells (Welt-Pixel) */
const STEP = 3;

const ss = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** Abstand jedes Pixels innerhalb der Maske zum nächsten Pixel außerhalb (Chamfer, gedeckelt) */
function distance(inside: Uint8Array, cap: number) {
  const d = new Float32Array(W * H);
  for (let i = 0; i < d.length; i++) d[i] = inside[i] ? cap : 0;
  const D = Math.SQRT2;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!d[i]) continue;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 1);
      if (y > 0) {
        v = Math.min(v, d[i - W] + 1);
        if (x > 0) v = Math.min(v, d[i - W - 1] + D);
        if (x < W - 1) v = Math.min(v, d[i - W + 1] + D);
      }
      d[i] = v;
    }
  for (let y = H - 1; y >= 0; y--)
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      if (!d[i]) continue;
      let v = d[i];
      if (x < W - 1) v = Math.min(v, d[i + 1] + 1);
      if (y < H - 1) {
        v = Math.min(v, d[i + W] + 1);
        if (x < W - 1) v = Math.min(v, d[i + W + 1] + D);
        if (x > 0) v = Math.min(v, d[i + W - 1] + D);
      }
      d[i] = v;
    }
  return d;
}

/** weiches Rauschen (Wertrauschen) für Farbflecken */
function noise(x: number, y: number, s: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = ss(x - xi);
  const v = ss(y - yi);
  const a = hash(xi, yi, s);
  const b = hash(xi + 1, yi, s);
  const c = hash(xi, yi + 1, s);
  const d = hash(xi + 1, yi + 1, s);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

export interface Terrain {
  group: THREE.Group;
  /** Bodenhöhe (3D) am Welt-Pixel */
  heightAt(x: number, y: number): number;
  water: THREE.Mesh;
  waterMat: THREE.ShaderMaterial;
  /** Kleinkram unter Bauten/Feldern verstecken */
  hideDetails(covered: (x: number, y: number) => boolean): void;
}

/** Wiese je Jahreszeit: drei Töne + Rand */
const GRASS: Record<Season, [string, string, string, string]> = {
  spring: ['#82d46c', '#6ec45a', '#a0e27e', '#5cae50'],
  summer: ['#7ccf6a', '#68bd58', '#93dc78', '#5aa84e'],
  autumn: ['#a6c25c', '#92ac4c', '#c2c86a', '#84a048'],
  winter: ['#eef4fa', '#e2eaf3', '#f9fbfe', '#c9d6e4'],
};
export function buildTerrain(isl: Island, season: Season = 'summer'): Terrain {
  const g = isl.ground;
  const land = new Uint8Array(W * H);
  const sea = new Uint8Array(W * H);
  const grass = new Uint8Array(W * H);
  for (let i = 0; i < g.length; i++) {
    land[i] = g[i] !== Ground.Water ? 1 : 0;
    sea[i] = 1 - land[i];
    grass[i] = g[i] === Ground.Grass ? 1 : 0;
  }
  const toWater = distance(land, 40);
  const toLand = distance(sea, 48);
  const toEdge = distance(grass, 20);

  // Höhen je Pixel
  const hp = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let h: number;
      if (!land[i]) h = WATER_Y - 0.1 - 0.7 * ss(toLand[i] / 14);
      else {
        h = WATER_Y - 0.05 + 0.4 * ss(toWater[i] / 8);
        if (grass[i]) {
          h += 0.31 * ss(toEdge[i] / 4.5);
          // ganz sanfte Hügel mitten auf der Wiese
          h += (noise(x / 46, y / 46, 5) - 0.5) * 0.12 * ss((toEdge[i] - 5) / 10);
        } else h += (noise(x / 14, y / 14, 9) - 0.5) * 0.04 * ss((toWater[i] - 6) / 6);
      }
      hp[i] = h;
    }
  // weichzeichnen (die Karte ist in 2-px-Stufen)
  const blur = (src: Float32Array, r: number) => {
    const tmp = new Float32Array(src.length);
    const out = new Float32Array(src.length);
    for (let y = 0; y < H; y++) {
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += src[y * W + Math.max(0, Math.min(W - 1, x))];
      for (let x = 0; x < W; x++) {
        tmp[y * W + x] = acc / (2 * r + 1);
        acc += src[y * W + Math.min(W - 1, x + r + 1)] - src[y * W + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < W; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += tmp[Math.max(0, Math.min(H - 1, y)) * W + x];
      for (let y = 0; y < H; y++) {
        out[y * W + x] = acc / (2 * r + 1);
        acc += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x];
      }
    }
    return out;
  };
  const hs = blur(blur(hp, 1), 1);
  const dk = isl.dock;
  const onDock = (x: number, y: number) => x >= dk.x + 1 && x <= dk.x + dk.w - 1 && y >= dk.y - 4 && y <= dk.y + dk.h;
  const raw = (x: number, y: number) => {
    const fx = Math.max(0, Math.min(W - 1.001, x - 0.5));
    const fy = Math.max(0, Math.min(H - 1.001, y - 0.5));
    const xi = fx | 0;
    const yi = fy | 0;
    const u = fx - xi;
    const v = fy - yi;
    const i = yi * W + xi;
    return hs[i] * (1 - u) * (1 - v) + hs[i + 1] * u * (1 - v) + hs[i + W] * (1 - u) * v + hs[i + W + 1] * u * v;
  };
  const heightAt = (x: number, y: number) => {
    const h = raw(x, y);
    return onDock(x, y) ? Math.max(h, DOCK_Y) : h;
  };

  // ---------- Geländemodell ----------
  const cols = Math.floor(W / STEP) + 1;
  const rows = Math.floor(H / STEP) + 1;
  const pos = new Float32Array(cols * rows * 3);
  const col = new Float32Array(cols * rows * 3);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      pos[i * 3] = c * STEP * U;
      pos[i * 3 + 1] = raw(c * STEP, r * STEP);
      pos[i * 3 + 2] = r * STEP * U;
    }
  const idx: number[] = [];
  for (let r = 0; r < rows - 1; r++)
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      const top = Math.max(pos[a * 3 + 1], pos[b * 3 + 1], pos[d * 3 + 1], pos[e * 3 + 1]);
      if (top < WATER_Y - 0.12) continue; // tief unter Wasser: unsichtbar
      idx.push(a, d, b, b, d, e);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  const sand = new THREE.Color('#f4dcaa');
  const sandDark = new THREE.Color('#e6c48e');
  const wet = new THREE.Color('#d2b47e');
  const [g1, g2, g3, rim] = GRASS[season].map((h) => new THREE.Color(h));
  const c = new THREE.Color();
  const tc = new THREE.Color();
  for (let r = 0; r < rows; r++)
    for (let cc = 0; cc < cols; cc++) {
      const i = r * cols + cc;
      const x = cc * STEP;
      const y = r * STEP;
      const h = pos[i * 3 + 1];
      // Sand
      c.copy(sand).lerp(sandDark, noise(x / 18, y / 18, 2) * 0.6);
      c.lerp(wet, ss((WATER_Y + 0.14 - h) / 0.12));
      // Wiese mit Flecken
      const gAmt = ss((h - 0.06) / 0.16);
      if (gAmt > 0) {
        // gedrehte Koordinaten + zwei Lagen: weiche, runde Flecken statt Rechtecke
        const u = x * 0.8 + y * 0.6;
        const v = -x * 0.6 + y * 0.8;
        const n1 = noise(u / 30, v / 30, 3) * 0.65 + noise(v / 13, u / 13, 6) * 0.35;
        const n2 = noise(v / 46, u / 46, 4) * 0.7 + noise(u / 17, v / 17, 8) * 0.3;
        tc.copy(g1).lerp(g2, ss((n1 - 0.35) * 2.2) * 0.8).lerp(g3, ss((n2 - 0.5) * 2.4) * 0.55);
        // Kante (schräg) etwas dunkler – wirkt wie ein weicher Rand
        tc.lerp(rim, Math.min(1, (1 - nrm.getY(i)) * 3.2));
        c.lerp(tc, gAmt);
      }
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  const ground = new THREE.Mesh(geo, vcMat(0.95));
  ground.receiveShadow = true;
  const group = new THREE.Group();
  group.add(ground);

  // ---------- Meer ----------
  const RW = 320;
  const RH = 160;
  const shoreData = new Uint8Array(RW * RH);
  for (let y = 0; y < RH; y++)
    for (let x = 0; x < RW; x++) shoreData[y * RW + x] = Math.min(255, Math.round(toLand[(y * 2 + 1) * W + x * 2 + 1] * 5.5));
  const shoreTex = new THREE.DataTexture(shoreData, RW, RH, THREE.RedFormat, THREE.UnsignedByteType);
  shoreTex.magFilter = THREE.LinearFilter;
  shoreTex.minFilter = THREE.LinearFilter;
  shoreTex.needsUpdate = true;
  const waterMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uCurve: CURVE,
      uFocus: FOCUS,
      uShore: { value: shoreTex },
      uSize: { value: new THREE.Vector2(W * U, H * U) },
      uTint: { value: new THREE.Color('#ffffff') },
      uFog: { value: new THREE.Color('#a8e4f0') },
      uFogR: { value: new THREE.Vector2(30, 70) },
      uSpark: { value: 1 },
    },
    vertexShader: `
      uniform float uTime; uniform float uCurve; uniform float uFocus; varying vec2 vXZ; varying float vDepth;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        wp.y += sin(wp.x * 0.55 + uTime * 1.1) * 0.035 + cos(wp.z * 0.45 + uTime * 0.9) * 0.035;
        vXZ = wp.xz;
        float cz = min(0.0, wp.z - uFocus);
        wp.y -= cz * cz * uCurve;
        vec4 mv = viewMatrix * wp;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uTime; uniform sampler2D uShore; uniform vec2 uSize; uniform vec3 uTint; uniform vec3 uFog; uniform vec2 uFogR; uniform float uSpark;
      varying vec2 vXZ; varying float vDepth;
      void main() {
        float d = texture2D(uShore, vXZ / uSize).r * 255.0 / 5.5; // Abstand zum Land (Welt-Pixel)
        vec3 shallow = vec3(0.50, 0.90, 0.86), mid = vec3(0.30, 0.74, 0.86), deep = vec3(0.17, 0.55, 0.80);
        vec3 col = mix(shallow, mid, smoothstep(2.0, 16.0, d));
        col = mix(col, deep, smoothstep(14.0, 44.0, d));
        // Schaum am Ufer: läuft in Wellen an
        float wave = sin(uTime * 1.3 + vXZ.x * 0.35 + vXZ.y * 0.22) * 1.3;
        float foam = smoothstep(2.4, 0.4, abs(d - 2.2 - wave)) * 0.8 + smoothstep(1.4, 0.0, d) * 0.9;
        float ring = smoothstep(1.0, 0.0, abs(d - 7.0 - wave * 1.6)) * 0.22;
        float sparkle = step(0.986, sin(vXZ.x * 2.3 + uTime * 1.7) * sin(vXZ.y * 2.9 - uTime * 1.3)) * uSpark;
        col = mix(col, vec3(1.0), clamp(max(max(foam, ring), sparkle * 0.7), 0.0, 1.0));
        col *= uTint;
        col = mix(col, uFog, smoothstep(uFogR.x, uFogR.y, vDepth));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const ext = 70;
  const wgeo = new THREE.PlaneGeometry(W * U + ext * 2, H * U + ext * 2, 84, 52).rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(wgeo, waterMat);
  water.position.set((W * U) / 2, WATER_Y, (H * U) / 2);
  group.add(water);

  // ---------- Steg ----------
  {
    const b = new Build();
    const x0 = dk.x * U;
    const w = dk.w * U;
    const z0 = (dk.y - 4) * U;
    const z1 = (dk.y + dk.h) * U;
    const r = seeded(17);
    for (let z = z0; z < z1; z += 0.5) {
      const shade = r() < 0.5 ? '#c8945a' : '#b8844a';
      b.add(rbox(w + 0.1, 0.12, 0.44, 0.04), shade, { p: [x0 + w / 2 + (r() - 0.5) * 0.05, DOCK_Y - 0.06, z + 0.25], r: [0, (r() - 0.5) * 0.03, 0] });
    }
    for (const dx of [0.15, w - 0.15]) {
      b.add(rbox(0.16, 0.14, z1 - z0, 0.04), '#9a6a3c', { p: [x0 + dx, DOCK_Y - 0.18, (z0 + z1) / 2] });
      for (let z = z0 + 1.2; z <= z1 + 0.01; z += 2) b.add(cyl(0.11, 0.12, 1.4, 8), '#8a5a32', { p: [x0 + dx, DOCK_Y - 0.55, z] });
    }
    // Poller am Ende
    for (const dx of [0.2, w - 0.2]) b.add(cyl(0.13, 0.13, 0.45, 10), '#7a4e2a', { p: [x0 + dx, DOCK_Y + 0.18, z1 - 0.25] });
    const m = b.mesh(0.85);
    group.add(m);
  }

  // ---------- Kleinkram (instanziert) ----------
  const kinds = new Map<string, { geo: THREE.BufferGeometry; list: { x: number; y: number; rot: number; s: number }[] }>();
  const flowerGeo = (petal: string) => {
    const b = new Build();
    b.add(cyl(0.018, 0.022, 0.26, 5), '#3e8a3a', { p: [0, 0.13, 0] });
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      b.add(dot(0.055), petal, { p: [Math.cos(a) * 0.065, 0.27, Math.sin(a) * 0.065], s: [1, 0.55, 1] });
    }
    b.add(dot(0.045), '#ffd84a', { p: [0, 0.29, 0] });
    b.add(dot(0.05), '#4f9a44', { p: [0.05, 0.05, 0], s: [1.4, 0.4, 0.7] });
    return b.geometry();
  };
  const PETALS = ['#f48fc0', '#ffffff', '#b48af0', '#ff8c6a', '#ffd84a'];
  PETALS.forEach((p, i) => kinds.set(`flower${i}`, { geo: flowerGeo(p), list: [] }));
  {
    const b = new Build();
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      b.add(dot(0.05), k ? '#5aa84a' : '#4e9a40', { p: [Math.cos(a) * 0.05, 0.03, Math.sin(a) * 0.05], s: [1, 0.35, 1] });
    }
    kinds.set('clover', { geo: b.geometry(), list: [] });
  }
  {
    const b = new Build();
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      b.add(cone(0.025, 0.22 + (k % 2) * 0.08, 4), k % 2 ? '#4f9a44' : '#5fae4e', { p: [Math.cos(a) * 0.04, 0.11, Math.sin(a) * 0.04], r: [Math.sin(a) * 0.3, 0, Math.cos(a) * 0.3] });
    }
    kinds.set('blade', { geo: b.geometry(), list: [] });
  }
  {
    const b = new Build();
    b.add(cone(0.09, 0.07, 9), '#f6d6de', { p: [0, 0.03, 0], s: [1, 1, 0.8] });
    b.add(dot(0.03), '#f2b8c8', { p: [0, 0.06, 0] });
    kinds.set('shell', { geo: b.geometry(), list: [] });
  }
  {
    const b = new Build();
    b.add(dot(0.07), '#c8c4cc', { p: [0, 0.02, 0], s: [1.2, 0.5, 1] });
    b.add(dot(0.045), '#aeaab6', { p: [0.09, 0.015, 0.03], s: [1.2, 0.5, 1] });
    kinds.set('pebble', { geo: b.geometry(), list: [] });
  }
  {
    const b = new Build();
    b.add(cyl(0.03, 0.03, 0.5, 6), '#a07040', { p: [0, 0.03, 0], r: [0, 0, Math.PI / 2] });
    b.add(cyl(0.02, 0.02, 0.18, 5), '#a07040', { p: [0.08, 0.05, 0.05], r: [0.6, 0, Math.PI / 2] });
    kinds.set('stick', { geo: b.geometry(), list: [] });
  }
  {
    const b = new Build();
    b.add(cyl(0.035, 0.035, 0.36, 6), '#f4efe4', { p: [0, 0.04, 0], r: [0, 0, Math.PI / 2] });
    for (const x of [-0.19, 0.19]) for (const z of [-0.035, 0.035]) b.add(dot(0.045), '#f4efe4', { p: [x, 0.04, z] });
    kinds.set('bone', { geo: b.geometry(), list: [] });
  }
  const rr = seeded(99);
  for (const d of isl.details) {
    const k = d.kind === 'flower' ? `flower${d.variant % PETALS.length}` : d.kind;
    const e = kinds.get(k) ?? (d.kind === 'skull' || d.kind === 'star' ? kinds.get('shell') : undefined);
    if (!e) continue;
    // nicht jeder Grashalm braucht ein Modell
    if (d.kind === 'blade' && rr() < 0.45) continue;
    e.list.push({ x: d.x, y: d.y, rot: rr() * Math.PI * 2, s: 0.8 + rr() * 0.5 });
  }
  const inst: { m: THREE.InstancedMesh; list: { x: number; y: number; rot: number; s: number }[] }[] = [];
  const dummy = new THREE.Object3D();
  const place = (m: THREE.InstancedMesh, list: { x: number; y: number; rot: number; s: number }[], hide?: (x: number, y: number) => boolean) => {
    list.forEach((it, i) => {
      dummy.position.set(it.x * U, heightAt(it.x, it.y) - 0.01, it.y * U);
      dummy.rotation.set(0, it.rot, 0);
      dummy.scale.setScalar(hide?.(it.x, it.y) ? 0 : it.s);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  };
  for (const { geo, list } of kinds.values()) {
    if (!list.length) continue;
    const m = new THREE.InstancedMesh(geo, vcMat(0.8), list.length);
    m.receiveShadow = true;
    m.castShadow = false;
    place(m, list);
    m.computeBoundingSphere();
    group.add(m);
    inst.push({ m, list });
  }

  return {
    group,
    heightAt,
    water,
    waterMat,
    hideDetails(covered) {
      for (const { m, list } of inst) place(m, list, covered);
    },
  };
}
