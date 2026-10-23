/**
 * Pferde in 3D: Rumpf, Hals, Kopf und Beine sind EINE glatte Haut (aus weich
 * verschmolzenen Grundformen, „Surface Nets“), die über ein Skelett bewegt wird –
 * Beine knicken in den Gelenken, der Hals senkt sich zum Grasen. Fell, Abzeichen
 * (Blesse, Schecken, Tupfen, Apfelschimmel, Aalstrich), Socken und Mähne kommen als
 * Farben auf die Haut. Größen: Pony, Pferd, Kaltblut, Fohlen/Mini.
 */
import * as THREE from 'three';
import { accById, type Breed } from '../horses';
import { hash } from '../island';
import { Build, cone, cyl, rbox, sphere, strand, tint, vcMat } from './engine';

type V3 = [number, number, number];

// ---------- Abstandsfunktionen ----------
interface Prim {
  /** Ellipsoid (c, r) oder abgerundeter Kegel (a → b, r1 → r2) */
  e?: { c: V3; r: V3 };
  k?: { a: V3; b: V3; r1: number; r2: number; zs?: number };
  /** Knochen-Gruppe */
  g: number;
  role: 'coat' | 'mane' | 'muzzle';
  /** Verschmelz-Radius in das bisher Gebaute */
  blend: number;
}
function sdEll(px: number, py: number, pz: number, c: V3, r: V3) {
  const x = (px - c[0]) / r[0];
  const y = (py - c[1]) / r[1];
  const z = (pz - c[2]) / r[2];
  const k0 = Math.sqrt(x * x + y * y + z * z);
  const x2 = x / r[0];
  const y2 = y / r[1];
  const z2 = z / r[2];
  const k1 = Math.sqrt(x2 * x2 + y2 * y2 + z2 * z2);
  return k1 < 1e-9 ? -Math.min(r[0], r[1], r[2]) : (k0 * (k0 - 1)) / k1;
}
/** abgerundeter Kegel zwischen a und b (nach Inigo Quilez) */
function sdCone(px: number, py: number, pz: number, a: V3, b: V3, r1: number, r2: number, zs = 1) {
  const bx = b[0] - a[0];
  const by = b[1] - a[1];
  const bz = (b[2] - a[2]) * zs;
  const l2 = bx * bx + by * by + bz * bz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const qx = px - a[0];
  const qy = py - a[1];
  const qz = (pz - a[2]) * zs;
  const y = qx * bx + qy * by + qz * bz;
  const z = y - l2;
  const vx = qx * l2 - bx * y;
  const vy = qy * l2 - by * y;
  const vz = qz * l2 - bz * y;
  const x2 = vx * vx + vy * vy + vz * vz;
  const y2 = y * y * l2;
  const z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}
const primD = (p: Prim, x: number, y: number, z: number) => (p.e ? sdEll(x, y, z, p.e.c, p.e.r) : sdCone(x, y, z, p.k!.a, p.k!.b, p.k!.r1, p.k!.r2, p.k!.zs));
function smin(a: number, b: number, k: number) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

// ---------- Gestalt je Größe ----------
interface Shape {
  prims: Prim[];
  by: number;
  /** Hals-Ansatz, Hals-Ende (Genick), Schweif-Ansatz */
  neck: V3;
  poll: V3;
  tail: V3;
  hb: number;
  legs: { hip: V3; knee: V3; foot: V3; hind: boolean }[];
  kneeY: number;
  min: V3;
  max: V3;
  ry: number;
  rz: number;
  t: number;
  muzzle: { a: V3; b: V3 };
}
const SIZES = {
  0: { s: 0.84, leg: 0.78, thick: 1.12, head: 1.12, neck: 0.86, body: 1.02, wide: 1.06 },
  1: { s: 1, leg: 1, thick: 1, head: 1, neck: 1, body: 1, wide: 1 },
  2: { s: 1.1, leg: 0.96, thick: 1.28, head: 1.04, neck: 0.95, body: 1.08, wide: 1.12 },
  3: { s: 0.6, leg: 1.12, thick: 0.86, head: 1.32, neck: 0.88, body: 0.9, wide: 0.92 },
} as const;
/** Gelenk-Gruppen → Knochen: 0 Rumpf, 1 Hals, 2 Kopf, 3–6 Oberschenkel, 7–10 Unterschenkel */
function shapeOf(size: 0 | 1 | 2 | 3): Shape {
  const S = SIZES[size];
  const ry = 0.41 * S.body;
  const rz = 0.36 * S.wide;
  const by = 0.72 * S.leg + ry;
  const T = S.thick;
  const HB = S.head;
  const prims: Prim[] = [];
  const ell = (c: V3, r: V3, g: number, blend: number, role: Prim['role'] = 'coat') => prims.push({ e: { c, r }, g, role, blend });
  const kon = (a: V3, b: V3, r1: number, r2: number, g: number, blend: number, role: Prim['role'] = 'coat', zs = 1) => prims.push({ k: { a, b, r1, r2, zs }, g, role, blend });
  // Rumpf
  ell([0, by, 0], [0.78, ry, rz], 0, 0);
  ell([0.48, by - 0.02, 0], [0.36, ry * 1.03, rz * 0.95], 0, 0.14);
  ell([-0.52, by + 0.04, 0], [0.42, ry * 1.0, rz * 1.03], 0, 0.14);
  ell([0.33, by + 0.28, 0], [0.32, 0.16, 0.17 * S.wide], 0, 0.12);
  ell([-0.92, by + 0.2, 0], [0.13, 0.13, 0.11], 0, 0.1);
  // Hals
  const neck: V3 = [0.6, by + 0.12, 0];
  const poll: V3 = [0.6 + 0.37 * S.neck, by + 0.12 + 0.68 * S.neck, 0];
  kon(neck, poll, 0.26 * S.wide, 0.155, 1, 0.16);
  // Kopf
  const N = poll;
  const h = (dx: number, dy: number, dz = 0): V3 => [N[0] + dx * HB, N[1] + dy * HB, dz * HB];
  ell(h(0.07, 0.05), [0.25 * HB, 0.23 * HB, 0.2 * HB], 2, 0.1);
  ell(h(0.02, -0.08), [0.2 * HB, 0.15 * HB, 0.17 * HB], 2, 0.08);
  const mA = h(0.17, -0.02);
  const mB = h(0.45, -0.23);
  kon(mA, mB, 0.165 * HB, 0.135 * HB, 2, 0.08);
  // Mähnenkamm und Schopf
  kon([0.36, by + 0.34, 0], [N[0] - 0.12, N[1] + 0.14, 0], 0.09, 0.075, 1, 0.04, 'mane', 1.7);
  ell(h(0.1, 0.27), [0.11 * HB, 0.08 * HB, 0.12 * HB], 2, 0.03, 'mane');
  // Beine
  const legs: Shape['legs'] = [];
  const kneeY = 0.44 * S.leg;
  for (const hind of [false, true])
    for (const side of [1, -1]) {
      const z = 0.19 * S.wide * side;
      const gi = (hind ? 2 : 0) + (side > 0 ? 0 : 1);
      if (!hind) {
        const hip: V3 = [0.5, by - 0.1, z];
        const knee: V3 = [0.53, kneeY, z];
        const foot: V3 = [0.52, 0.11, z];
        kon(hip, knee, 0.155 * T, 0.1 * T, 3 + gi, 0.1);
        ell(knee, [0.1 * T, 0.1 * T, 0.095 * T], 7 + gi, 0.05);
        kon(knee, foot, 0.086 * T, 0.076 * T, 7 + gi, 0.04);
        ell(foot, [0.088 * T, 0.078 * T, 0.083 * T], 7 + gi, 0.04);
        legs.push({ hip, knee, foot, hind });
      } else {
        const hip: V3 = [-0.56, by - 0.12, z];
        const knee: V3 = [-0.67, kneeY + 0.07, z];
        const foot: V3 = [-0.6, 0.11, z];
        ell([-0.56, by - 0.24, z * 0.92], [0.25, 0.34, 0.16 * T], 3 + gi, 0.14);
        kon([-0.57, by - 0.32, z], knee, 0.13 * T, 0.09 * T, 3 + gi, 0.08);
        ell(knee, [0.095 * T, 0.095 * T, 0.09 * T], 7 + gi, 0.05);
        kon(knee, foot, 0.084 * T, 0.076 * T, 7 + gi, 0.04);
        ell(foot, [0.088 * T, 0.078 * T, 0.083 * T], 7 + gi, 0.04);
        legs.push({ hip, knee, foot, hind });
      }
    }
  return {
    prims,
    by,
    neck,
    poll,
    tail: [-0.97, by + 0.24, 0],
    hb: HB,
    legs,
    kneeY,
    min: [-1.2, -0.02, -0.5 * S.wide - 0.05],
    max: [N[0] + 0.72 * HB, N[1] + 0.48 * HB, 0.5 * S.wide + 0.05],
    ry,
    rz,
    t: T,
    muzzle: { a: mA, b: mB },
  };
}
function sdf(sh: Shape, x: number, y: number, z: number) {
  let d = 1e9;
  for (const p of sh.prims) d = smin(d, primD(p, x, y, z), p.blend);
  return d;
}

// ---------- Oberfläche (Surface Nets) ----------
interface Skin {
  geo: THREE.BufferGeometry;
  /** je Ecke: Rolle (0 Fell, 1 Mähne, 2 Maul) und Abstand entlang des Mauls */
  role: Uint8Array;
  muz: Float32Array;
  shape: Shape;
}
const BONES = 12;
function buildSkin(size: 0 | 1 | 2 | 3): Skin {
  const sh = shapeOf(size);
  const step = 0.048;
  const [x0, y0, z0] = sh.min;
  const nx = Math.ceil((sh.max[0] - x0) / step) + 1;
  const ny = Math.ceil((sh.max[1] - y0) / step) + 1;
  const nz = Math.ceil((sh.max[2] - z0) / step) + 1;
  const val = new Float32Array(nx * ny * nz);
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) val[i + nx * (j + ny * k)] = sdf(sh, x0 + i * step, y0 + j * step, z0 + k * step);
  const cx = nx - 1;
  const cy = ny - 1;
  const cellVert = new Int32Array(cx * cy * (nz - 1)).fill(-1);
  const pos: number[] = [];
  const corner = [0, 0, 0, 0, 0, 0, 0, 0];
  const EDGES = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 2], [1, 3], [4, 6], [5, 7],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let n = 0; n < 8; n++) {
          const v = val[i + (n & 1) + nx * (j + ((n >> 1) & 1) + ny * (k + ((n >> 2) & 1)))];
          corner[n] = v;
          if (v < 0) mask |= 1 << n;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let cnt = 0;
        for (const [a, b] of EDGES) {
          const va = corner[a];
          const vb = corner[b];
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          sx += (a & 1) + ((b & 1) - (a & 1)) * t;
          sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
          sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t;
          cnt++;
        }
        cellVert[i + cx * (j + cy * k)] = pos.length / 3;
        pos.push(x0 + (i + sx / cnt) * step, y0 + (j + sy / cnt) * step, z0 + (k + sz / cnt) * step);
      }
  const idx: number[] = [];
  const cell = (i: number, j: number, k: number) => cellVert[i + cx * (j + cy * k)];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, c, b, a, d, c);
    else idx.push(a, b, c, a, c, d);
  };
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const v0 = val[i + nx * (j + ny * k)];
        // Kante entlang x: Zellen rundherum in (y, z)
        if (i < nx - 1 && j > 0 && k > 0 && j < ny - 1 && k < nz - 1) {
          const v1 = val[i + 1 + nx * (j + ny * k)];
          if (v0 < 0 !== v1 < 0) quad(cell(i, j - 1, k - 1), cell(i, j, k - 1), cell(i, j, k), cell(i, j - 1, k), v0 >= 0);
        }
        if (j < ny - 1 && i > 0 && k > 0 && i < nx - 1 && k < nz - 1) {
          const v1 = val[i + nx * (j + 1 + ny * k)];
          if (v0 < 0 !== v1 < 0) quad(cell(i - 1, j, k - 1), cell(i - 1, j, k), cell(i, j, k), cell(i, j, k - 1), v0 >= 0);
        }
        if (k < nz - 1 && i > 0 && j > 0 && i < nx - 1 && j < ny - 1) {
          const v1 = val[i + nx * (j + ny * (k + 1))];
          if (v0 < 0 !== v1 < 0) quad(cell(i - 1, j - 1, k), cell(i, j - 1, k), cell(i, j, k), cell(i - 1, j, k), v0 >= 0);
        }
      }
  const n = pos.length / 3;
  const P = new Float32Array(pos);
  const Nn = new Float32Array(n * 3);
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  const role = new Uint8Array(n);
  const muz = new Float32Array(n);
  const e = 0.004;
  const groupD = new Float32Array(BONES);
  const ma = sh.muzzle.a;
  const mb = sh.muzzle.b;
  const ml = Math.hypot(mb[0] - ma[0], mb[1] - ma[1]);
  for (let v = 0; v < n; v++) {
    const x = P[v * 3];
    const y = P[v * 3 + 1];
    const z = P[v * 3 + 2];
    // Normale aus dem Gefälle der Abstandsfunktion: ganz glatte Schattierung
    let gx = sdf(sh, x + e, y, z) - sdf(sh, x - e, y, z);
    let gy = sdf(sh, x, y + e, z) - sdf(sh, x, y - e, z);
    let gz = sdf(sh, x, y, z + e) - sdf(sh, x, y, z - e);
    const gl = Math.hypot(gx, gy, gz) || 1;
    gx /= gl;
    gy /= gl;
    gz /= gl;
    Nn[v * 3] = gx;
    Nn[v * 3 + 1] = gy;
    Nn[v * 3 + 2] = gz;
    // Gewichte der Knochen nach Nähe zu ihren Teilen
    groupD.fill(1e9);
    let best = 1e9;
    let bestRole: Prim['role'] = 'coat';
    for (const p of sh.prims) {
      const d = primD(p, x, y, z);
      if (d < groupD[p.g]) groupD[p.g] = d;
      if (d < best) {
        best = d;
        bestRole = p.role;
      }
    }
    const ws: [number, number][] = [];
    for (let g = 0; g < 11; g++) if (groupD[g] < 0.5) ws.push([g, 1 / (0.03 + Math.max(0, groupD[g])) ** 3]);
    ws.sort((a, b) => b[1] - a[1]);
    const top = ws.slice(0, 4);
    const sum = top.reduce((s, w) => s + w[1], 0);
    top.forEach(([g, w], q) => {
      si[v * 4 + q] = g;
      sw[v * 4 + q] = w / sum;
    });
    role[v] = bestRole === 'mane' ? 1 : 0;
    // Maul: wie weit vorn entlang der Schnauze (0..1)
    const t = ((x - ma[0]) * (mb[0] - ma[0]) + (y - ma[1]) * (mb[1] - ma[1])) / (ml * ml);
    muz[v] = groupD[2] < 0.05 ? t : -1;
  }
  // Dreiecke so drehen, dass sie nach außen zeigen (an der Normale prüfen)
  for (let q = 0; q < idx.length; q += 3) {
    const a = idx[q] * 3;
    const b = idx[q + 1] * 3;
    const c = idx[q + 2] * 3;
    const ux = P[b] - P[a];
    const uy = P[b + 1] - P[a + 1];
    const uz = P[b + 2] - P[a + 2];
    const wx = P[c] - P[a];
    const wy = P[c + 1] - P[a + 1];
    const wz = P[c + 2] - P[a + 2];
    const fx = uy * wz - uz * wy;
    const fy = uz * wx - ux * wz;
    const fz = ux * wy - uy * wx;
    if (fx * Nn[a] + fy * Nn[a + 1] + fz * Nn[a + 2] < 0) {
      const tmp = idx[q + 1];
      idx[q + 1] = idx[q + 2];
      idx[q + 2] = tmp;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(Nn, 3));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return { geo, role, muz, shape: sh };
}
const skins = new Map<number, Skin>();
const skinOf = (size: 0 | 1 | 2 | 3) => {
  let s = skins.get(size);
  if (!s) skins.set(size, (s = buildSkin(size)));
  return s;
};

// ---------- Fell und Abzeichen ----------
function vnoise(x: number, y: number, z: number, seed: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const f = (t: number) => t * t * (3 - 2 * t);
  const u = f(x - xi);
  const v = f(y - yi);
  const w = f(z - zi);
  let s = 0;
  for (let c = 0; c < 8; c++) {
    const dx = c & 1;
    const dy = (c >> 1) & 1;
    const dz = (c >> 2) & 1;
    s += hash(xi + dx + (zi + dz) * 131, yi + dy, seed) * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
  }
  return s;
}
/** Abstand zum nächsten Zellpunkt (für Tupfen und Apfelschimmel) */
function cells(x: number, y: number, z: number, size: number, seed: number) {
  const gx = Math.floor(x / size);
  const gy = Math.floor(y / size);
  const gz = Math.floor(z / size);
  let best = 9;
  for (let a = -1; a <= 1; a++)
    for (let b = -1; b <= 1; b++)
      for (let c = -1; c <= 1; c++) {
        const cx = gx + a;
        const cy = gy + b;
        const cz = gz + c;
        const px = (cx + hash(cx, cy + cz * 71, seed)) * size;
        const py = (cy + hash(cx + 13, cy + cz * 71, seed + 1)) * size;
        const pz = (cz + hash(cx + 29, cy + cz * 71, seed + 2)) * size;
        best = Math.min(best, Math.hypot(x - px, y - py, z - pz));
      }
  return best / size;
}
const ssf = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const colored = new Map<string, THREE.BufferGeometry>();
function coatGeo(b: Breed, size: 0 | 1 | 2 | 3) {
  const key = `${b.id}|${size}`;
  let g = colored.get(key);
  if (g) return g;
  const sk = skinOf(size);
  const sh = sk.shape;
  const P = sk.geo.attributes.position;
  const col = new Float32Array(P.count * 3);
  const coat = new THREE.Color(b.coat);
  const shade = new THREE.Color(b.shade);
  const mane = new THREE.Color(b.mane);
  const mark = new THREE.Color(b.mark ?? '#f6f0e6');
  const legs = b.legs ? new THREE.Color(b.legs) : null;
  // dunkle Pferde bekommen nur ein leicht helleres Maul
  const lum = coat.r * 0.3 + coat.g * 0.59 + coat.b * 0.11;
  const muzzleCol = coat.clone().lerp(new THREE.Color('#f4dccc'), lum < 0.12 ? 0.18 : 0.5);
  const c = new THREE.Color();
  const seed = [...b.id].reduce((s, ch) => s * 31 + ch.charCodeAt(0), 7) & 0xffff;
  for (let v = 0; v < P.count; v++) {
    const x = P.getX(v);
    const y = P.getY(v);
    const z = P.getZ(v);
    if (sk.role[v] === 1) {
      c.copy(mane).lerp(tint(b.mane, 0.25), vnoise(x * 9, y * 9, z * 9, 3) * 0.5);
    } else {
      c.copy(coat);
      // Bauch etwas dunkler, Rücken heller: wirkt runder
      c.lerp(shade, 0.4 * (1 - ssf(sh.by - sh.ry * 0.95, sh.by - sh.ry * 0.1, y)) * (y > sh.kneeY + 0.1 ? 1 : 0.3));
      c.lerp(tint(b.coat, 0.12), 0.5 * ssf(sh.by + sh.ry * 0.3, sh.by + sh.ry, y) * (x < sh.neck[0] + 0.1 ? 1 : 0));
      // Abzeichen
      if (b.pattern === 'pinto') {
        const n = vnoise(x * 2.3 + 5, y * 2.3, z * 2.3 + seed * 0.01, seed);
        c.lerp(mark, ssf(0.54, 0.6, n));
      } else if (b.pattern === 'spots') {
        const d = cells(x, y, z, 0.17, seed);
        const where = b.id === 'appaloosa' ? ssf(0.4, -0.2, x) : 1;
        c.lerp(mark, ssf(0.42, 0.3, d) * where);
      } else if (b.pattern === 'dapple') {
        const d = cells(x, y, z, 0.13, seed);
        c.lerp(mark, ssf(0.5, 0.25, d) * 0.85 * ssf(sh.kneeY, sh.kneeY + 0.3, y));
        c.lerp(shade, ssf(sh.kneeY + 0.15, sh.kneeY - 0.1, y) * 0.6);
      } else if (b.pattern === 'dun') {
        const top = ssf(sh.by + sh.ry * 0.82, sh.by + sh.ry * 0.95, y) * ssf(0.06, 0.035, Math.abs(z)) * (x < 0.45 && x > -0.95 ? 1 : 0);
        c.lerp(mark, top);
      }
      // Beine unten (Socken bzw. dunkle Beine)
      if (legs) c.lerp(legs, ssf(sh.kneeY + 0.02, sh.kneeY - 0.1, y));
      // Maul heller, Blesse
      const m = sk.muz[v];
      if (m > 0.35) c.lerp(muzzleCol, ssf(0.4, 0.85, m));
      if (b.pattern === 'blaze' && m > -1) {
        const N = sh.poll;
        const up = (y - N[1]) - (x - N[0]) * -0.75;
        const front = x > N[0] + 0.1 * sh.hb && Math.abs(z) < 0.075 * sh.hb && up > -0.35 * sh.hb;
        if (front) c.lerp(mark, ssf(0.075 * sh.hb, 0.05 * sh.hb, Math.abs(z)));
      }
    }
    col[v * 3] = c.r;
    col[v * 3 + 1] = c.g;
    col[v * 3 + 2] = c.b;
  }
  g = new THREE.BufferGeometry();
  for (const n of ['position', 'normal', 'skinIndex', 'skinWeight']) g.setAttribute(n, sk.geo.attributes[n]);
  g.setIndex(sk.geo.index);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.boundingSphere = sk.geo.boundingSphere;
  colored.set(key, g);
  return g;
}

// ---------- Kleinteile ----------
const parts = new Map<string, THREE.BufferGeometry>();
function partGeo(key: string, make: (b: Build) => void) {
  let g = parts.get(key);
  if (!g) {
    const b = new Build();
    make(b);
    parts.set(key, (g = b.geometry()));
  }
  return g;
}

export interface HorseAnim {
  /** Laufphase (rad) */
  walk: number;
  moving: boolean;
  /** 0..1 Kopf unten */
  graze: number;
  t: number;
  sleep: boolean;
  /** gestreichelt 0..1 */
  pet: number;
  ridden: boolean;
}
export interface HorseModel {
  g: THREE.Group;
  /** Sitzhöhe für den Reiter (lokal) */
  seat: THREE.Vector3;
  pose(a: HorseAnim): void;
  dispose(): void;
}

export function makeHorse(b: Breed, acc = '', foal = false): HorseModel {
  const size = (foal ? 3 : b.size) as 0 | 1 | 2 | 3;
  const sk = skinOf(size);
  const sh = sk.shape;
  const S = SIZES[size];
  const g = new THREE.Group();
  const inner = new THREE.Group();
  inner.scale.setScalar(S.s);
  g.add(inner);
  // Skelett
  const bone = (x: number, y: number, z: number, parent?: THREE.Bone) => {
    const bn = new THREE.Bone();
    if (parent) {
      const pw = parent.userData.w as V3;
      bn.position.set(x - pw[0], y - pw[1], z - pw[2]);
      parent.add(bn);
    } else bn.position.set(x, y, z);
    bn.userData.w = [x, y, z];
    return bn;
  };
  const body = bone(0, sh.by, 0);
  const neckB = bone(sh.neck[0] - 0.05, sh.neck[1], 0, body);
  const headB = bone(sh.poll[0], sh.poll[1], 0, neckB);
  const uppers: THREE.Bone[] = [];
  const lowers: THREE.Bone[] = [];
  for (const l of sh.legs) {
    const u = bone(l.hip[0], l.hip[1], l.hip[2], body);
    const lo = bone(l.knee[0], l.knee[1], l.knee[2], u);
    uppers.push(u);
    lowers.push(lo);
  }
  const tailB = bone(sh.tail[0], sh.tail[1], 0, body);
  const bones = [body, neckB, headB, ...uppers, ...lowers, tailB];
  const mesh = new THREE.SkinnedMesh(coatGeo(b, size), vcMat(0.55));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.add(body);
  inner.add(mesh);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  const attach = (bn: THREE.Bone, geo: THREE.BufferGeometry, rough = 0.6) => {
    const m = new THREE.Mesh(geo, vcMat(rough));
    const w = bn.userData.w as V3;
    m.position.set(-w[0], -w[1], -w[2]);
    m.castShadow = true;
    bn.add(m);
    return m;
  };
  const HB = sh.hb;
  const N = sh.poll;
  const hp = (dx: number, dy: number, dz = 0): [number, number, number] => [N[0] + dx * HB, N[1] + dy * HB, dz * HB];
  // Augen, Ohren, Nüstern (am Kopf)
  const eyeKey = `eyes${size}`;
  const eyesOpen = attach(
    headB,
    partGeo(eyeKey, (p) => {
      for (const s of [1, -1]) {
        p.add(sphere(0.09 * HB, 12), '#1e1414', { p: hp(0.14, 0.1, 0.165 * s), s: [0.85, 1.1, 0.55], r: [0, s * 0.5, 0] });
        p.add(sphere(0.03 * HB, 8), '#ffffff', { p: hp(0.18, 0.15, 0.205 * s) });
        p.add(sphere(0.014 * HB, 6), '#ffffff', { p: hp(0.13, 0.06, 0.21 * s) });
        for (let k = 0; k < 3; k++) p.add(new THREE.BoxGeometry(0.07 * HB, 0.016, 0.016), '#1e1414', { p: hp(0.09 + k * 0.035, 0.19 + k * 0.01, (0.17 + k * 0.005) * s), r: [0, 0, 0.5 - k * 0.35] });
      }
    }),
    0.15,
  );
  const eyesShut = attach(
    headB,
    partGeo(`shut${size}`, (p) => {
      for (const s of [1, -1]) p.add(new THREE.TorusGeometry(0.06 * HB, 0.014, 5, 10, Math.PI), '#1e1414', { p: hp(0.14, 0.1, 0.18 * s), r: [0, s * 0.5, Math.PI] });
    }),
  );
  eyesShut.visible = false;
  const earKey = `ears${b.id}|${size}`;
  const ears = attach(
    headB,
    partGeo(earKey, (p) => {
      for (const s of [1, -1]) {
        p.add(cone(0.075 * HB, 0.26 * HB, 12), b.coat, { p: hp(-0.03, 0.31, 0.11 * s), r: [s * 0.32, 0, 0.12], s: [1, 1, 0.55] });
        p.add(cone(0.042 * HB, 0.17 * HB, 10), '#f2b8b0', { p: hp(-0.01, 0.3, 0.12 * s), r: [s * 0.32, 0, 0.12], s: [1, 1, 0.4] });
      }
      for (const s of [1, -1]) p.add(sphere(0.03 * HB, 8), tint(b.coat, -0.45), { p: hp(0.56, -0.23, 0.07 * s), s: [1.2, 0.8, 0.6] });
    }),
  );
  void ears;
  // Mähnen-Strähnen (fallen zur Seite) und Schopf
  attach(
    neckB,
    partGeo(`mane${b.id}|${size}`, (p) => {
      const a: V3 = [0.36, sh.by + 0.35, 0];
      const e: V3 = [N[0] - 0.1, N[1] + 0.16, 0];
      const n = size === 0 || size === 2 ? 16 : 13;
      const r = (k: number) => hash(k, size, 41);
      for (let k = 0; k < n; k++) {
        const t = (k + 0.3 + r(k) * 0.4) / n;
        const bx = a[0] + (e[0] - a[0]) * t;
        const by = a[1] + (e[1] - a[1]) * t;
        const len = ((size === 0 ? 0.46 : 0.36) - t * 0.12) * (0.8 + r(k + 50) * 0.4);
        // zwei Lagen: hinten am Kamm kurz, vorn lang über die Halsseite
        const z0 = (k % 2 ? 0.02 : 0.07) + r(k + 9) * 0.02;
        p.add(
          strand([[bx + 0.02, by + 0.04, z0 * 0.4], [bx - 0.06, by - len * 0.3, z0 + 0.11], [bx - 0.05, by - len * 0.75, z0 + 0.15], [bx - 0.02, by - len, z0 + 0.13]], 0.07 + r(k + 3) * 0.015, 0.75, 6, 6),
          new THREE.Color(b.mane).lerp(tint(b.mane, 0.22), r(k + 7)),
        );
      }
    }),
    0.7,
  );
  attach(
    headB,
    partGeo(`forelock${b.id}|${size}`, (p) => {
      for (const [dz, dy] of [[0.03, 0], [-0.04, -0.02], [0.08, -0.03]] as const) p.add(strand([hp(0.05, 0.3, dz), hp(0.17, 0.24, dz * 1.4), hp(0.24, 0.1 + dy, dz * 1.6)], 0.045 * HB, 0.7, 5, 5), b.mane);
      if (b.horn) {
        p.add(cone(0.06 * HB, 0.42 * HB, 14), '#ffe9b0', { p: hp(0.2, 0.42), r: [0, 0, -0.55] });
        for (let k = 0; k < 4; k++) p.add(new THREE.TorusGeometry((0.05 - k * 0.01) * HB, 0.008, 4, 10), '#f4c8e8', { p: hp(0.13 + k * 0.045, 0.31 + k * 0.07), r: [Math.PI / 2, 0.55, 0] });
      }
    }),
    0.5,
  );
  // Schweif
  const tailG = new THREE.Group();
  tailB.add(tailG);
  tailG.add(
    new THREE.Mesh(
      partGeo(`tail${b.id}|${size}`, (p) => {
        const len = size === 3 ? 0.55 : size === 2 ? 1.05 : 0.95;
        // dicker Strang in der Mitte, Strähnen rundherum (voll, nicht flach)
        p.add(strand([[0, 0.02, 0], [-0.15, -0.06, 0], [-0.25, -len * 0.42, 0], [-0.2, -len * 0.95, 0]], 0.12, 0.6, 12, 10), b.mane);
        const n = size === 2 ? 9 : 7;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2;
          const oz = Math.cos(a) * 0.07;
          const ox = Math.sin(a) * 0.06;
          const l = len * (0.88 + hash(k, 3, 17) * 0.22);
          p.add(strand([[ox * 0.3, 0, oz * 0.3], [-0.15 + ox, -0.07, oz], [-0.25 + ox * 1.3, -l * 0.45, oz * 1.4], [-0.19 + ox * 1.5, -l, oz * 1.7]], 0.065, 0.7, 10, 7), new THREE.Color(b.mane).lerp(tint(b.mane, 0.2), hash(k, 5, 11)));
        }
      }),
      vcMat(0.7),
    ),
  );
  tailG.children[0].castShadow = true;
  // Hufe (und Behang)
  lowers.forEach((lo, i) => {
    const l = sh.legs[i];
    const w = lo.userData.w as V3;
    const hoof = attach(
      lo,
      partGeo(`hoof${size}${b.feather ? 'f' : ''}${b.legs ?? ''}`, (p) => {
        p.add(cyl(0.085 * sh.t, 0.102 * sh.t, 0.12, 14), '#3a2c26', { p: [0, 0.06, 0] });
        if (b.feather)
          {
            // Behang: weicher, ausgestellter Haarkranz über dem Huf
            const fc = b.legs ?? b.mane;
            p.add(cyl(0.095 * sh.t, 0.15 * sh.t, 0.22, 16), fc, { p: [0, 0.17, 0] });
            for (let k = 0; k < 10; k++) {
              const a = (k / 10) * Math.PI * 2;
              p.add(sphere(0.05 * sh.t, 7), tint(fc, k % 2 ? 0.12 : -0.05), { p: [Math.cos(a) * 0.135 * sh.t, 0.08, Math.sin(a) * 0.135 * sh.t], s: [1, 0.8, 1] });
            }
          }
      }),
      0.4,
    );
    // Huf sitzt unter dem Fesselgelenk
    hoof.position.set(l.foot[0] - w[0], -w[1], l.foot[2] - w[2]);
  });
  // Schmuck
  const a = accById(acc);
  if (a?.id.startsWith('bow')) {
    attach(
      headB,
      partGeo(`bow${a.id}${size}`, (p) => {
        for (const s of [1, -1]) p.add(sphere(0.08 * HB, 10), a.col, { p: hp(-0.02, 0.36, 0.09 * s), r: [s * 0.6, 0, 0], s: [0.8, 0.65, 1.4] });
        p.add(sphere(0.045 * HB, 8), a.col2, { p: hp(-0.02, 0.36) });
        for (const s of [1, -1]) p.add(rbox(0.05, 0.16 * HB, 0.03, 0.01), a.col, { p: hp(-0.06, 0.27, 0.04 * s), r: [s * 0.3, 0, 0.3] });
      }),
      0.35,
    );
  } else if (a?.id === 'flowers') {
    attach(
      headB,
      partGeo(`crown${size}`, (p) => {
        // Kranz liegt hinter den Ohren rund um den Kopf, vorn über der Stirn
        const ring = (t: number): V3 => hp(0.03 + Math.cos(t) * 0.17, 0.2 - Math.cos(t) * 0.06, Math.sin(t) * 0.2);
        for (let k = 0; k < 14; k++) p.add(sphere(0.03 * HB, 6), '#5fae4e', { p: ring((k / 14) * Math.PI * 2), s: [1.4, 0.8, 1.4] });
        const cols = ['#ffffff', '#ffd23f', '#f48fc0', '#ffffff', '#b48af0', '#ffd23f', '#ff8c6a'];
        for (let k = 0; k < 7; k++) {
          const q = ring((k / 7) * Math.PI * 2 + 0.2);
          p.add(sphere(0.048 * HB, 8), cols[k], { p: [q[0], q[1] + 0.02, q[2]] });
          p.add(sphere(0.022 * HB, 6), cols[k] === '#ffd23f' ? '#ff9a3a' : '#ffd23f', { p: [q[0] + 0.03, q[1] + 0.04, q[2] * 1.08] });
        }
      }),
      0.6,
    );
  } else if (a?.id.startsWith('blanket')) {
    attach(
      body,
      partGeo(`blanket${a.id}${size}`, (p) => {
        // Halbschale über dem Rücken (Achse entlang des Pferdes), Borten vorn und hinten
        const geo = new THREE.CylinderGeometry(1, 1, 1, 28, 1, true, -Math.PI * 0.58, Math.PI * 1.16);
        p.add(geo, a.col, { p: [0.02, sh.by + 0.01, 0], r: [-Math.PI / 2, 0, -Math.PI / 2], s: [sh.rz * 1.13, 0.8, sh.ry * 1.16] });
        for (const x of [-0.38, 0.42]) p.add(new THREE.TorusGeometry(1, 0.035, 5, 28, Math.PI * 1.16), a.col2, { p: [x, sh.by + 0.01, 0], r: [0, Math.PI / 2, -Math.PI * 0.08], s: [sh.rz * 1.15, sh.ry * 1.18, 1] });
      }),
      0.9,
    ).material = vcMat(0.9, { side: THREE.DoubleSide });
  }
  // Sattel (nur beim Reiten)
  const saddle = attach(
    body,
    partGeo(`saddle${size}`, (p) => {
      p.add(rbox(0.55, 0.06, sh.rz * 2.1, 0.03, 1), '#c8945a', { p: [0.06, sh.by + sh.ry * 0.96, 0], r: [0, 0, 0] });
      p.add(rbox(0.42, 0.12, sh.rz * 1.2, 0.05, 1), '#7a4a2a', { p: [0.06, sh.by + sh.ry + 0.04, 0] });
      p.add(rbox(0.1, 0.14, sh.rz * 1.0, 0.04, 1), '#6a3a22', { p: [0.27, sh.by + sh.ry + 0.1, 0] });
      for (const s of [1, -1]) {
        p.add(rbox(0.03, 0.4, 0.03, 0.01, 1), '#5a3a26', { p: [0.06, sh.by + sh.ry * 0.5, sh.rz * 1.08 * s] });
        p.add(new THREE.TorusGeometry(0.06, 0.015, 4, 8), '#c8c8d0', { p: [0.06, sh.by - sh.ry * 0.15, sh.rz * 1.1 * s], r: [0, Math.PI / 2, 0] });
      }
    }),
    0.7,
  );
  saddle.visible = false;
  const seat = new THREE.Vector3(0.04 * S.s, (sh.by + sh.ry + 0.08) * S.s, 0);
  const geos = [mesh];

  let blinkT = 2 + Math.random() * 3;
  return {
    g,
    seat,
    pose(p) {
      const sw = p.moving ? Math.sin(p.walk) : 0;
      // Trab: diagonale Beinpaare gemeinsam
      uppers.forEach((u, i) => {
        const ph = i === 0 || i === 3 ? sw : -sw;
        u.rotation.set(0, 0, ph * 0.45);
        const lift = Math.max(0, -ph);
        lowers[i].rotation.set(0, 0, p.moving ? lift * (sh.legs[i].hind ? 0.55 : -0.85) : 0);
      });
      body.position.y = sh.by + (p.moving ? Math.abs(Math.cos(p.walk)) * 0.035 : Math.sin(p.t * 1.8) * 0.006);
      body.rotation.z = p.moving ? Math.sin(p.walk * 2) * 0.012 : 0;
      // Hals: grasen, schlafen, beim Streicheln nicken
      const nod = p.pet > 0 ? Math.sin(p.t * 9) * 0.1 * p.pet : 0;
      const down = p.sleep ? 0.45 : p.graze;
      neckB.rotation.set(0, Math.sin(p.t * 0.35 + sh.by) * 0.08 * (1 - down), 0.04 - down * 1.0 + nod + (p.moving ? Math.sin(p.walk * 2) * 0.03 : 0));
      headB.rotation.set(0, 0, -down * 0.35 + (p.pet > 0 ? 0.15 * p.pet : 0));
      tailB.rotation.set(Math.sin(p.t * 2.1 + sh.by * 3) * 0.3, Math.sin(p.t * 1.3) * 0.15, p.moving ? -0.25 : -0.05);
      // blinzeln, beim Schlafen und Streicheln Augen zu
      blinkT -= 1 / 60;
      if (blinkT < -0.12) blinkT = 2 + Math.random() * 4;
      const shut = p.sleep || p.pet > 0.3 || blinkT < 0;
      eyesOpen.visible = !shut;
      eyesShut.visible = shut;
      saddle.visible = p.ridden;
    },
    dispose() {
      for (const m of geos) m.skeleton.dispose();
    },
  };
}

/** Vorab bauen (Ladezeit verteilen): eine Größe 0 Pony, 1 Pferd, 2 Kaltblut, 3 Fohlen */
export function warmHorse(size: 0 | 1 | 2 | 3) {
  skinOf(size);
}
