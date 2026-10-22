/**
 * Cozy Island 3D – Probeentwurf (getrennt vom Spiel).
 * Knubbel-Stil: alle Modelle aus Grundformen gebaut, weiches Licht, gewölbter
 * Horizont wie bei einem rollenden Baumstamm. Laufen, Pferde streicheln und reiten.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// ---------- Grundgerüst ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#8fdcef');
scene.fog = new THREE.Fog('#a8e4f0', 26, 60);
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 120);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// Licht: warmer Nachmittag
scene.add(new THREE.HemisphereLight('#fff6e0', '#6aa860', 1.25));
const sun = new THREE.DirectionalLight('#fff0d0', 2.1);
sun.position.set(-8, 14, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 40 });
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

// ---------- gewölbter Horizont (wie ein rollender Baumstamm) ----------
const CURVE = { value: 0.016 };
/** ab hier (Welt-z) biegt sich der Boden weg – folgt der Figur */
const FOCUS = { value: 0 };
const curved = new Set<THREE.Material>();
function curve<T extends THREE.Material>(m: T): T {
  if (curved.has(m)) return m;
  curved.add(m);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uCurve = CURVE;
    sh.uniforms.uFocus = FOCUS;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uCurve;\nuniform float uFocus;')
      .replace(
        '#include <project_vertex>',
        `vec4 cw = modelMatrix * vec4(transformed, 1.0);
  float cz = min(0.0, cw.z - uFocus);
  cw.y -= cz * cz * uCurve;
  vec4 mvPosition = viewMatrix * cw;
  gl_Position = projectionMatrix * mvPosition;`,
      );
  };
  return m;
}
const mats = new Map<string, THREE.MeshStandardMaterial>();
const mat = (color: string, o: { rough?: number; emissive?: string } = {}) => {
  const k = `${color}|${o.rough ?? 0.85}|${o.emissive ?? ''}`;
  let m = mats.get(k);
  if (!m) {
    m = curve(new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.85, metalness: 0, ...(o.emissive ? { emissive: o.emissive, emissiveIntensity: 0.9 } : {}) }));
    mats.set(k, m);
  }
  return m;
};
function mesh(g: THREE.BufferGeometry, color: string, o: { rough?: number; emissive?: string; shadow?: boolean } = {}) {
  const m = new THREE.Mesh(g, mat(color, o));
  m.castShadow = o.shadow !== false;
  m.receiveShadow = true;
  return m;
}
const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => (o.position.set(x, y, z), o);

// ---------- Zufall (fest) ----------
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// ---------- Insel ----------
const R = 15;
const radius = (a: number) => R * (1 + Math.sin(a * 3) * 0.06 + Math.sin(a * 5 + 1) * 0.04 + Math.cos(a * 2 + 2) * 0.05);
function islandShape(extra: number) {
  const s = new THREE.Shape();
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    const r = radius(a) + extra;
    // Shape liegt in XY, wird auf XZ gedreht (y → -z)
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return s;
}
function slab(extra: number, depth: number, bevel: number, color: string, y: number) {
  const g = new THREE.ExtrudeGeometry(islandShape(extra), { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 4, curveSegments: 4 });
  g.rotateX(-Math.PI / 2);
  const m = mesh(g, color, { shadow: false });
  m.position.y = y - depth;
  return m;
}
scene.add(slab(2.6, 0.6, 0.5, '#f2d9a6', -0.1)); // Strand
scene.add(slab(0, 0.7, 0.35, '#7ccf6a', 0.32)); // Wiese
/** liegt (x, z) auf der Wiese bzw. auf Land? */
const polar = (x: number, z: number) => ({ r: Math.hypot(x, z), a: Math.atan2(-z, x) });
const onGrass = (x: number, z: number, m = 0) => polar(x, z).r < radius(polar(x, z).a) - m;
const onLand = (x: number, z: number) => polar(x, z).r < radius(polar(x, z).a) + 2.4;

// Wasser mit sanften Wellen und Farbverlauf zum Ufer
const waterMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uCurve: CURVE, uFocus: FOCUS },
  vertexShader: `
    uniform float uTime; uniform float uCurve; uniform float uFocus; varying vec2 vXZ;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      wp.y += sin(wp.x * 0.6 + uTime * 1.2) * 0.05 + cos(wp.z * 0.5 + uTime) * 0.05;
      vXZ = wp.xz;
      float cz = min(0.0, wp.z - uFocus);
      wp.y -= cz * cz * uCurve;
      vec4 mv = viewMatrix * wp;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform float uTime; varying vec2 vXZ;
    void main() {
      float d = length(vXZ);
      float shore = smoothstep(${(R + 2).toFixed(1)}, ${(R + 14).toFixed(1)}, d);
      vec3 shallow = vec3(0.47, 0.88, 0.86), deep = vec3(0.16, 0.55, 0.80);
      vec3 col = mix(shallow, deep, shore);
      float sparkle = step(0.985, sin(vXZ.x * 2.3 + uTime * 1.7) * sin(vXZ.y * 2.9 - uTime * 1.3));
      float foam = smoothstep(0.6, 0.0, abs(d - ${(R + 2.9).toFixed(1)} - sin(uTime * 1.4 + atan(vXZ.y, vXZ.x) * 6.0) * 0.25));
      col = mix(col, vec3(1.0), max(sparkle * 0.7, foam * 0.75));
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`,
});
const water = new THREE.Mesh(new THREE.PlaneGeometry(140, 140, 70, 70).rotateX(-Math.PI / 2), waterMat);
water.position.y = -0.35;
scene.add(water);

// ---------- Hindernisse ----------
const blockers: { x: number; z: number; r: number }[] = [];
const walls: { x0: number; x1: number; z0: number; z1: number }[] = [];
const block = (x: number, z: number, r: number) => blockers.push({ x, z, r });

// ---------- Modelle aus Grundformen ----------
const sphere = (r: number, d = 20) => new THREE.SphereGeometry(r, d, Math.round(d * 0.7));
function tree(x: number, z: number, s = 1, fruit = '') {
  const g = new THREE.Group();
  const trunk = mesh(new THREE.CylinderGeometry(0.18 * s, 0.26 * s, 1.3 * s, 10), '#9a6a40');
  trunk.position.y = 0.65 * s;
  g.add(trunk);
  const greens = ['#5fb35a', '#6cc46a', '#58a85a'];
  for (const [dx, dy, dz, r] of [[0, 1.9, 0, 0.95], [0.55, 1.55, 0.2, 0.7], [-0.5, 1.6, -0.15, 0.72], [0.1, 2.35, -0.1, 0.62]] as const) g.add(at(mesh(sphere(r * s), greens[Math.floor(rnd() * 3)], { rough: 0.95 }), dx * s, dy * s, dz * s));
  if (fruit) for (let k = 0; k < 6; k++) {
    const a = rnd() * Math.PI * 2;
    g.add(at(mesh(sphere(0.12 * s, 10), fruit, { rough: 0.5 }), Math.cos(a) * 0.85 * s, (1.5 + rnd() * 0.8) * s, Math.sin(a) * 0.85 * s));
  }
  g.rotation.y = rnd() * 6;
  scene.add(at(g, x, 0.3, z));
  block(x, z, 0.45 * s);
}
function bush(x: number, z: number, berries = '') {
  const g = new THREE.Group();
  for (const [dx, dz, r] of [[0, 0, 0.55], [0.45, 0.1, 0.42], [-0.42, 0.05, 0.4]] as const) g.add(at(mesh(sphere(r), '#4fa04f', { rough: 0.95 }), dx, r * 0.75, dz));
  if (berries) for (let k = 0; k < 5; k++) g.add(at(mesh(sphere(0.07, 8), berries, { rough: 0.4 }), (rnd() - 0.5) * 1, 0.4 + rnd() * 0.4, 0.35 + rnd() * 0.2));
  scene.add(at(g, x, 0.3, z));
  block(x, z, 0.6);
}
function rock(x: number, z: number, s = 1, y = 0.3) {
  const r = mesh(new THREE.DodecahedronGeometry(0.45 * s, 1), '#b9b6c2', { rough: 0.9 });
  r.scale.y = 0.6;
  r.rotation.y = rnd() * 6;
  scene.add(at(r, x, y + 0.15 * s, z));
  block(x, z, 0.4 * s);
}
function flower(x: number, z: number, color: string) {
  const g = new THREE.Group();
  g.add(at(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 5), '#3e8a3a', { shadow: false }), 0, 0.15, 0));
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    g.add(at(mesh(sphere(0.06, 8), color, { shadow: false }), Math.cos(a) * 0.07, 0.31, Math.sin(a) * 0.07));
  }
  g.add(at(mesh(sphere(0.05, 8), '#ffd84a', { shadow: false }), 0, 0.33, 0));
  scene.add(at(g, x, 0.3, z));
}
function palm(x: number, z: number) {
  const g = new THREE.Group();
  for (let k = 0; k < 7; k++) g.add(at(mesh(new THREE.CylinderGeometry(0.16 - k * 0.01, 0.19 - k * 0.01, 0.42, 8), k % 2 ? '#b08455' : '#c89a64'), k * 0.07, 0.21 + k * 0.4, 0));
  const top = new THREE.Vector3(0.45, 2.9, 0);
  for (let f = 0; f < 7; f++) {
    const leaf = mesh(new THREE.SphereGeometry(0.9, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#58a85a', { rough: 0.9 });
    leaf.scale.set(1.3, 0.12, 0.38);
    const a = (f / 7) * Math.PI * 2;
    leaf.position.copy(top).add(new THREE.Vector3(Math.cos(a) * 0.75, -0.15, Math.sin(a) * 0.75));
    leaf.rotation.set(0, -a, -0.35);
    g.add(leaf);
  }
  for (let k = 0; k < 3; k++) g.add(at(mesh(sphere(0.13, 10), '#7a5228'), top.x + (k - 1) * 0.16, top.y - 0.2, 0.1));
  scene.add(at(g, x, 0.1, z));
  block(x, z, 0.35);
}

// Häuschen
function house(x: number, z: number) {
  const g = new THREE.Group();
  g.add(at(mesh(new RoundedBoxGeometry(3.2, 0.3, 2.6, 3, 0.08), '#a8a4b4'), 0, 0.15, 0));
  g.add(at(mesh(new RoundedBoxGeometry(3, 1.9, 2.4, 3, 0.12), '#fff3dc'), 0, 1.25, 0));
  // Dach (Prisma)
  const roofShape = new THREE.Shape([new THREE.Vector2(-1.95, 0), new THREE.Vector2(1.95, 0), new THREE.Vector2(0, 1.35)]);
  const roofG = new THREE.ExtrudeGeometry(roofShape, { depth: 3, bevelEnabled: true, bevelSize: 0.1, bevelThickness: 0.1, bevelSegments: 2 });
  roofG.translate(0, 0, -1.5);
  roofG.rotateY(Math.PI / 2);
  g.add(at(mesh(roofG, '#e0705a', { rough: 0.7 }), 0, 2.15, 0));
  g.add(at(mesh(new RoundedBoxGeometry(0.4, 1, 0.4, 2, 0.05), '#b8b4c2'), 0.8, 2.9, -0.4)); // Kamin
  g.add(at(mesh(new RoundedBoxGeometry(0.7, 1.2, 0.12, 3, 0.05), '#a8743f'), 0, 0.9, 1.22)); // Tür
  g.add(at(mesh(sphere(0.05, 8), '#ffd84a', { rough: 0.3 }), 0.22, 0.9, 1.3));
  for (const wx of [-0.95, 0.95]) {
    g.add(at(mesh(new RoundedBoxGeometry(0.62, 0.62, 0.1, 2, 0.04), '#8a5a32'), wx, 1.45, 1.22));
    g.add(at(mesh(new THREE.BoxGeometry(0.48, 0.48, 0.05), '#ffe49a', { emissive: '#ffb84a' }), wx, 1.45, 1.27));
    const box = mesh(new RoundedBoxGeometry(0.7, 0.16, 0.2, 2, 0.04), '#9a6a40');
    g.add(at(box, wx, 1.05, 1.35));
    for (let k = 0; k < 4; k++) g.add(at(mesh(sphere(0.07, 8), ['#f48fc0', '#ffffff', '#ff7a6a', '#ffd84a'][k]), wx - 0.24 + k * 0.16, 1.18, 1.36));
  }
  scene.add(at(g, x, 0.3, z));
  walls.push({ x0: x - 1.7, x1: x + 1.7, z0: z - 1.4, z1: z + 1.35 });
  return g;
}
const smoke: THREE.Mesh[] = [];

// Weg aus Trittsteinen
function stepStone(x: number, z: number) {
  const s = mesh(new THREE.CylinderGeometry(0.32 + rnd() * 0.1, 0.36, 0.08, 14), '#e2cfa8', { shadow: false });
  scene.add(at(s, x, 0.33, z));
}

// Zaun
function fence(x0: number, z0: number, x1: number, z1: number, gate?: [number, number]) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.round(len / 1.1);
  const ang = Math.atan2(z1 - z0, x1 - x0);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t;
    const z = z0 + (z1 - z0) * t;
    const inGate = gate && t > gate[0] && t < gate[1];
    if (!inGate || i === 0) scene.add(at(mesh(new RoundedBoxGeometry(0.16, 0.85, 0.16, 2, 0.04), '#a8743f'), x, 0.72, z));
    if (i < n) {
      const tm = (i + 0.5) / n;
      if (gate && tm > gate[0] && tm < gate[1]) continue;
      for (const y of [0.55, 0.9]) {
        const rail = mesh(new RoundedBoxGeometry(len / n, 0.09, 0.07, 2, 0.03), '#c8945a');
        rail.rotation.y = -ang;
        scene.add(at(rail, x + ((x1 - x0) / n) * 0.5, y, z + ((z1 - z0) / n) * 0.5));
      }
    }
  }
  // Kollision (Tor bleibt frei)
  const seg = (a: number, b: number) => {
    const ax = x0 + (x1 - x0) * a, az = z0 + (z1 - z0) * a, bx = x0 + (x1 - x0) * b, bz = z0 + (z1 - z0) * b;
    walls.push({ x0: Math.min(ax, bx) - 0.12, x1: Math.max(ax, bx) + 0.12, z0: Math.min(az, bz) - 0.12, z1: Math.max(az, bz) + 0.12 });
  };
  if (gate) {
    seg(0, gate[0]);
    seg(gate[1], 1);
  } else seg(0, 1);
}

// Steg
function dock(x: number, z0: number, z1: number) {
  for (let z = z0; z < z1; z += 0.5) {
    const p = mesh(new RoundedBoxGeometry(1.6, 0.12, 0.44, 2, 0.04), z % 1 ? '#c8945a' : '#b8844a');
    scene.add(at(p, x, 0.12, z));
  }
  for (const zz of [z0 + 1, z1 - 0.5]) for (const dx of [-0.75, 0.75]) scene.add(at(mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.2, 8), '#8a5a32'), x + dx, -0.25, zz));
}

// ---------- Figur (knuffig: großer Kopf, kleiner Körper) ----------
function makeKid() {
  const g = new THREE.Group();
  const body = at(mesh(new THREE.CapsuleGeometry(0.26, 0.28, 6, 14), '#f08ac0'), 0, 0.58, 0);
  const head = at(mesh(sphere(0.38, 24), '#ffd9bc', { rough: 0.6 }), 0, 1.18, 0);
  const hair = at(mesh(new THREE.SphereGeometry(0.41, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), '#e07a3a', { rough: 0.7 }), 0, 1.22, -0.03);
  const hat = new THREE.Group();
  hat.add(at(mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 24), '#f2d27a', { rough: 0.8 }), 0, 0, 0));
  hat.add(at(mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.22, 20), '#f2d27a', { rough: 0.8 }), 0, 0.12, 0));
  hat.add(at(mesh(new THREE.CylinderGeometry(0.365, 0.365, 0.07, 20), '#f06aa8'), 0, 0.05, 0));
  hat.position.set(0, 1.5, 0);
  hat.rotation.x = -0.12;
  const eyeL = at(mesh(sphere(0.05, 10), '#2a1a16', { rough: 0.2, shadow: false }), -0.13, 1.2, 0.34);
  const eyeR = at(mesh(sphere(0.05, 10), '#2a1a16', { rough: 0.2, shadow: false }), 0.13, 1.2, 0.34);
  const cheekL = at(mesh(sphere(0.06, 8), '#ff9aa8', { shadow: false }), -0.22, 1.1, 0.3);
  const cheekR = at(mesh(sphere(0.06, 8), '#ff9aa8', { shadow: false }), 0.22, 1.1, 0.3);
  const legL = at(mesh(new THREE.CapsuleGeometry(0.08, 0.18, 4, 8), '#4a6a9a'), -0.11, 0.2, 0);
  const legR = at(mesh(new THREE.CapsuleGeometry(0.08, 0.18, 4, 8), '#4a6a9a'), 0.11, 0.2, 0);
  const armL = at(mesh(new THREE.CapsuleGeometry(0.065, 0.2, 4, 8), '#ffd9bc'), -0.32, 0.62, 0);
  const armR = at(mesh(new THREE.CapsuleGeometry(0.065, 0.2, 4, 8), '#ffd9bc'), 0.32, 0.62, 0);
  armL.rotation.z = 0.3;
  armR.rotation.z = -0.3;
  g.add(body, head, hair, hat, eyeL, eyeR, cheekL, cheekR, legL, legR, armL, armR);
  return { g, legL, legR, armL, armR, head };
}

// ---------- Pferd (knuffig) ----------
interface HorseLook {
  coat: string;
  mane: string;
  blaze?: boolean;
  socks?: string;
  bow?: string;
  blanket?: string;
}
function makeHorse(l: HorseLook) {
  const g = new THREE.Group();
  const body = mesh(new THREE.CapsuleGeometry(0.42, 0.75, 8, 18), l.coat, { rough: 0.6 });
  body.rotation.z = Math.PI / 2;
  body.position.y = 1.05;
  g.add(body);
  const neck = new THREE.Group();
  neck.position.set(0.55, 1.25, 0);
  const neckM = mesh(new THREE.CapsuleGeometry(0.22, 0.45, 6, 14), l.coat, { rough: 0.6 });
  neckM.rotation.z = -0.6;
  neckM.position.set(0.15, 0.25, 0);
  neck.add(neckM);
  const head = new THREE.Group();
  head.position.set(0.42, 0.62, 0);
  const skull = mesh(new RoundedBoxGeometry(0.62, 0.36, 0.36, 4, 0.16), l.coat, { rough: 0.6 });
  skull.rotation.z = -0.35;
  head.add(skull);
  head.add(at(mesh(new RoundedBoxGeometry(0.28, 0.24, 0.3, 4, 0.1), '#e8c8a8', { rough: 0.6 }), 0.3, -0.12, 0)); // Maul
  if (l.blaze) {
    const bl = mesh(new RoundedBoxGeometry(0.5, 0.06, 0.12, 2, 0.03), '#fff8ec');
    bl.rotation.z = -0.35;
    head.add(at(bl, 0.05, 0.17, 0));
  }
  for (const s of [-1, 1]) {
    head.add(at(mesh(sphere(0.055, 10), '#1a1010', { rough: 0.2, shadow: false }), 0.02, 0.06, s * 0.18));
    head.add(at(mesh(sphere(0.02, 6), '#ffffff', { shadow: false }), 0.04, 0.08, s * 0.21));
    const ear = mesh(new THREE.ConeGeometry(0.07, 0.2, 8), l.coat);
    ear.position.set(-0.2, 0.25, s * 0.1);
    ear.rotation.x = s * 0.25;
    head.add(ear);
  }
  for (let k = 0; k < 6; k++) {
    const m = mesh(new RoundedBoxGeometry(0.14, 0.2, 0.1, 2, 0.04), l.mane);
    m.position.set(-0.05 - k * 0.08, 0.15 - k * 0.12 + 0.12, 0);
    m.rotation.z = -0.6;
    neck.add(m);
  }
  head.add(at(mesh(new RoundedBoxGeometry(0.16, 0.14, 0.14, 2, 0.05), l.mane), -0.12, 0.24, 0)); // Schopf
  if (l.bow) {
    for (const s of [-1, 1]) head.add(at(mesh(sphere(0.08, 10), l.bow, { rough: 0.4 }), -0.22, 0.32, s * 0.09));
    head.add(at(mesh(sphere(0.045, 8), '#ffffff'), -0.22, 0.32, 0));
  }
  neck.add(head);
  g.add(neck);
  const tail = new THREE.Group();
  tail.position.set(-0.85, 1.2, 0);
  const tailM = mesh(new THREE.CapsuleGeometry(0.1, 0.55, 4, 10), l.mane);
  tailM.position.set(-0.1, -0.3, 0);
  tailM.rotation.z = -0.35;
  tail.add(tailM);
  g.add(tail);
  if (l.blanket) {
    const bk = mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.55, 18, 1, true, -Math.PI * 0.5, Math.PI), l.blanket, { rough: 0.9 });
    bk.rotation.x = Math.PI / 2;
    bk.rotation.z = Math.PI / 2;
    (bk.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    g.add(at(bk, 0.05, 1.08, 0));
  }
  const legs: THREE.Group[] = [];
  for (const [lx, lz] of [[0.45, 0.2], [0.45, -0.2], [-0.45, 0.2], [-0.45, -0.2]] as const) {
    const leg = new THREE.Group();
    leg.position.set(lx, 0.85, lz);
    leg.add(at(mesh(new THREE.CapsuleGeometry(0.1, 0.45, 4, 10), l.coat, { rough: 0.6 }), 0, -0.35, 0));
    if (l.socks) leg.add(at(mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.2, 10), l.socks), 0, -0.62, 0));
    leg.add(at(mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.1, 10), '#3a2a24'), 0, -0.78, 0));
    g.add(leg);
    legs.push(leg);
  }
  g.scale.setScalar(1.05);
  return { g, neck, head, tail, legs };
}

// ---------- Herzchen ----------
const heartTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  x.fillStyle = '#ff5a7a';
  x.beginPath();
  x.moveTo(32, 56);
  x.bezierCurveTo(4, 36, 6, 8, 32, 20);
  x.bezierCurveTo(58, 8, 60, 36, 32, 56);
  x.fill();
  x.fillStyle = '#ffffffaa';
  x.beginPath();
  x.arc(22, 22, 6, 0, 7);
  x.fill();
  return new THREE.CanvasTexture(c);
})();
const hearts: { s: THREE.Sprite; v: number; life: number }[] = [];
function burstHearts(p: THREE.Vector3, n = 5) {
  for (let k = 0; k < n; k++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthWrite: false }));
    s.scale.setScalar(0.35 + Math.random() * 0.15);
    s.position.copy(p).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, Math.random() * 0.3, (Math.random() - 0.5) * 0.6));
    scene.add(s);
    hearts.push({ s, v: 0.8 + Math.random() * 0.5, life: 1.4 + k * 0.12 });
  }
}

// ---------- Insel einrichten ----------
const HOUSE = { x: -2.5, z: -5.5 };
house(HOUSE.x, HOUSE.z);
for (let k = 0; k < 6; k++) smoke.push(at(mesh(sphere(0.18, 10), '#ffffff', { shadow: false }), HOUSE.x + 0.8, 3.6 + k * 0.4, HOUSE.z - 0.4));
smoke.forEach((m) => ((m.material = curve(new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, roughness: 1 }))), scene.add(m)));
// Trittsteine zur Tür und zum Steg
for (let k = 0; k < 13; k++) {
  const t = k / 12;
  stepStone(HOUSE.x + Math.sin(t * 2.4) * 1.2 + t * 4.6, HOUSE.z + 2.2 + t * 12.2);
}
// Koppel rechts
const PAD = { x0: 3.5, x1: 10, z0: -4.5, z1: 2.5 };
fence(PAD.x0, PAD.z0, PAD.x1, PAD.z0);
fence(PAD.x1, PAD.z0, PAD.x1, PAD.z1);
fence(PAD.x0, PAD.z1, PAD.x1, PAD.z1, [0.25, 0.48]);
fence(PAD.x0, PAD.z0, PAD.x0, PAD.z1);
// Heuballen
const hay = mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.7, 18), '#ecc860', { rough: 0.95 });
hay.rotation.z = Math.PI / 2;
scene.add(at(hay, 9.2, 0.75, -3.6));
block(9.2, -3.6, 0.5);
// Steg nach Süden
dock(1.6, R + 1.2, R + 8);
// Bäume, Büsche, Steine, Blumen
const free = (x: number, z: number, m: number) =>
  onGrass(x, z, 1.4) &&
  !(x > PAD.x0 - m && x < PAD.x1 + m && z > PAD.z0 - m && z < PAD.z1 + m) &&
  Math.hypot(x - HOUSE.x, z - HOUSE.z) > 3 + m &&
  blockers.every((b) => Math.hypot(b.x - x, b.z - z) > b.r + m + 0.6) &&
  !(Math.abs(x - 1) < 2.2 && z > HOUSE.z + 1.5); // Weg frei
const place = (n: number, m: number, fn: (x: number, z: number) => void) => {
  for (let k = 0, tries = 0; k < n && tries < 600; tries++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * R;
    const x = Math.cos(a) * r;
    const z = -Math.sin(a) * r;
    if (!free(x, z, m)) continue;
    fn(x, z);
    k++;
  }
};
place(9, 1.2, (x, z) => tree(x, z, 0.95 + rnd() * 0.35, rnd() < 0.5 ? '#e0483e' : rnd() < 0.5 ? '#ff9a3a' : ''));
place(8, 0.6, (x, z) => bush(x, z, rnd() < 0.5 ? (rnd() < 0.5 ? '#e0485a' : '#9a6ad0') : ''));
place(5, 0.4, (x, z) => rock(x, z, 0.8 + rnd() * 0.6));
for (let k = 0; k < 70; k++) {
  const a = rnd() * Math.PI * 2;
  const r = Math.sqrt(rnd()) * (R - 1.5);
  const x = Math.cos(a) * r;
  const z = -Math.sin(a) * r;
  if (free(x, z, 0)) flower(x, z, ['#f48fc0', '#ffffff', '#b48af0', '#ff8c6a', '#ffd84a'][k % 5]);
}
for (const a of [0.5, 2.4, 3.6, 5.2]) {
  const r = radius(a) + 1.4;
  palm(Math.cos(a) * r, -Math.sin(a) * r);
}
for (const a of [1.2, 4.1]) rock(Math.cos(a) * (radius(a) + 2), -Math.sin(a) * (radius(a) + 2), 1.2, -0.05);

// ---------- Figur und Pferde ----------
const kid = makeKid();
scene.add(kid.g);
const player = { x: 0.5, z: 2, dir: 0, speed: 0, walk: 0 };
interface Horse {
  m: ReturnType<typeof makeHorse>;
  x: number;
  z: number;
  dir: number;
  tx: number;
  tz: number;
  wait: number;
  walk: number;
  pet: number;
  name: string;
}
const horses: Horse[] = [
  { m: makeHorse({ coat: '#d08a44', mane: '#f6ead0', blaze: true, socks: '#fff8ec', bow: '#f06aa8' }), x: 6, z: -1, dir: 0, tx: 6, tz: -1, wait: 1, walk: 0, pet: 0, name: 'Goldi' },
  { m: makeHorse({ coat: '#3a3440', mane: '#1e1a24', blanket: '#9a5ad8' }), x: 8.5, z: -3, dir: 2, tx: 8.5, tz: -3, wait: 2, walk: 0, pet: 0, name: 'Nero' },
];
for (const h of horses) scene.add(h.m.g);
let riding: Horse | null = null;

// ---------- Steuerung ----------
const keys = new Set<string>();
addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
const stickEl = document.querySelector<HTMLElement>('.stick')!;
let stick: { id: number; ox: number; oy: number; x: number; y: number } | null = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
  Object.assign(stickEl.style, { display: 'block', left: `${e.clientX - 55}px`, top: `${e.clientY - 55}px` });
  document.querySelector<HTMLElement>('.hint')!.style.opacity = '0';
});
addEventListener('pointermove', (e) => {
  if (!stick || e.pointerId !== stick.id) return;
  stick.x = e.clientX;
  stick.y = e.clientY;
  const dx = Math.max(-40, Math.min(40, stick.x - stick.ox));
  const dy = Math.max(-40, Math.min(40, stick.y - stick.oy));
  stickEl.querySelector('i')!.style.transform = `translate(${dx}px, ${dy}px)`;
});
for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, (e) => {
  if (stick && (e as PointerEvent).pointerId === stick.id) {
    stick = null;
    stickEl.style.display = 'none';
  }
});
function input() {
  let x = 0;
  let y = 0;
  if (keys.has('a') || keys.has('arrowleft')) x -= 1;
  if (keys.has('d') || keys.has('arrowright')) x += 1;
  if (keys.has('w') || keys.has('arrowup')) y -= 1;
  if (keys.has('s') || keys.has('arrowdown')) y += 1;
  if (stick) {
    x = (stick.x - stick.ox) / 40;
    y = (stick.y - stick.oy) / 40;
  }
  const l = Math.hypot(x, y);
  return l > 1 ? [x / l, y / l] : l < 0.15 ? [0, 0] : [x, y];
}
const petBtn = document.querySelector<HTMLButtonElement>('[data-act=pet]')!;
const rideBtn = document.querySelector<HTMLButtonElement>('[data-act=ride]')!;
const nearHorse = () => {
  let best: Horse | null = null;
  let bd = 2.4;
  for (const h of horses) {
    const d = Math.hypot(h.x - player.x, h.z - player.z);
    if (d < bd) {
      bd = d;
      best = h;
    }
  }
  return best;
};
petBtn.addEventListener('click', () => {
  const h = nearHorse();
  if (!h) return;
  h.pet = 1.8;
  h.wait = 2;
  h.dir = Math.atan2(-(player.z - h.z), player.x - h.x);
  burstHearts(new THREE.Vector3(h.x, 2.3, h.z), 6);
});
rideBtn.addEventListener('click', () => {
  if (riding) {
    riding.x = player.x;
    riding.z = player.z;
    riding.tx = riding.x;
    riding.tz = riding.z;
    riding.wait = 3;
    riding = null;
    player.x += Math.cos(player.dir + Math.PI / 2) * 1.1;
    player.z -= Math.sin(player.dir + Math.PI / 2) * 1.1;
    return;
  }
  const h = nearHorse();
  if (!h) return;
  riding = h;
  player.x = h.x;
  player.z = h.z;
  player.dir = h.dir;
  burstHearts(new THREE.Vector3(h.x, 2.6, h.z), 3);
});

// ---------- Bewegung & Kollision ----------
function freeAt(x: number, z: number, r: number) {
  if (!onLand(x, z)) return false;
  if (blockers.some((b) => Math.hypot(b.x - x, b.z - z) < b.r + r)) return false;
  if (walls.some((w) => x + r > w.x0 && x - r < w.x1 && z + r > w.z0 && z - r < w.z1)) return false;
  return true;
}
const onDock = (x: number, z: number) => Math.abs(x - 1.6) < 0.75 && z > R && z < R + 8;
function move(o: { x: number; z: number }, dx: number, dz: number, r: number) {
  const ok = (x: number, z: number) => freeAt(x, z, r) || onDock(x, z);
  if (ok(o.x + dx, o.z)) o.x += dx;
  if (ok(o.x, o.z + dz)) o.z += dz;
}
const groundY = (x: number, z: number) => (onDock(x, z) && !onGrass(x, z) ? 0.18 : onGrass(x, z) ? 0.32 : 0.02);

// ---------- Schleife ----------
const clock = new THREE.Clock();
const camPos = new THREE.Vector3(0.5, 11.5, 13);
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;
  waterMat.uniforms.uTime.value = t;

  // Figur / Reiten
  const [ix, iy] = input();
  const moving = ix !== 0 || iy !== 0;
  const speed = riding ? 6.5 : 3.6;
  if (moving) {
    const want = Math.atan2(-iy, ix);
    let d = want - player.dir;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    player.dir += d * Math.min(1, dt * 12);
    move(player, ix * speed * dt, iy * speed * dt, riding ? 0.55 : 0.3);
    player.walk += dt * (riding ? 11 : 10);
  } else player.walk = 0;
  const gy = groundY(player.x, player.z);
  if (riding) {
    const h = riding;
    h.x = player.x;
    h.z = player.z;
    h.dir = player.dir;
    h.walk = player.walk;
    kid.g.position.set(player.x, gy + 1.05 + Math.abs(Math.sin(player.walk)) * 0.08, player.z);
    kid.legL.rotation.x = kid.legR.rotation.x = 0;
    kid.legL.rotation.z = 0.9;
    kid.legR.rotation.z = -0.9;
  } else {
    const sw = Math.sin(player.walk) * 0.7;
    kid.g.position.set(player.x, gy + Math.abs(Math.sin(player.walk)) * 0.06, player.z);
    kid.legL.rotation.set(sw, 0, 0);
    kid.legR.rotation.set(-sw, 0, 0);
    kid.armL.rotation.x = -sw * 0.8;
    kid.armR.rotation.x = sw * 0.8;
  }
  kid.g.rotation.y = player.dir + Math.PI / 2;

  // Pferde: in der Koppel grasen und schlendern
  for (const h of horses) {
    if (h !== riding) {
      h.pet = Math.max(0, h.pet - dt);
      h.wait -= dt;
      const dx = h.tx - h.x;
      const dz = h.tz - h.z;
      const d = Math.hypot(dx, dz);
      if (h.wait > 0 || d < 0.1) {
        h.walk = 0;
        if (h.wait <= 0) {
          // neues Ziel in der Koppel (oder dort, wo man abgestiegen ist, zurück)
          h.tx = PAD.x0 + 1 + rnd() * (PAD.x1 - PAD.x0 - 2);
          h.tz = PAD.z0 + 1 + rnd() * (PAD.z1 - PAD.z0 - 2);
          h.wait = 0;
          if (Math.hypot(h.tx - h.x, h.tz - h.z) < 1.5) h.wait = 2 + rnd() * 3;
        }
      } else {
        const sp = 1.3 * dt;
        h.dir = Math.atan2(-dz, dx);
        const inside = h.x > PAD.x0 && h.x < PAD.x1 && h.z > PAD.z0 && h.z < PAD.z1;
        if (inside) {
          h.x += (dx / d) * sp;
          h.z += (dz / d) * sp;
        } else move(h, (dx / d) * sp, (dz / d) * sp, 0.5);
        h.walk += dt * 8;
        if (d < 0.2) h.wait = 2 + rnd() * 4;
      }
    }
    const m = h.m;
    m.g.position.set(h.x, groundY(h.x, h.z), h.z);
    m.g.rotation.y = h.dir;
    const sw = Math.sin(h.walk);
    m.legs.forEach((l, i) => (l.rotation.z = (i === 0 || i === 3 ? sw : -sw) * 0.45));
    // Kopf: grasen, beim Streicheln nicken
    const graze = h !== riding && h.walk === 0 && h.pet <= 0 && Math.sin(t * 0.4 + h.x) > 0.2;
    const nod = h.pet > 0 ? Math.sin(t * 9) * 0.12 : 0;
    m.neck.rotation.z += ((graze ? -0.9 : 0.05 + nod) - m.neck.rotation.z) * Math.min(1, dt * 4);
    m.tail.rotation.x = Math.sin(t * 2.2 + h.z) * 0.35;
  }

  // Herzchen
  for (let k = hearts.length - 1; k >= 0; k--) {
    const hh = hearts[k];
    hh.life -= dt;
    hh.s.position.y += hh.v * dt;
    hh.s.material.opacity = Math.min(1, hh.life * 1.5);
    if (hh.life <= 0) {
      scene.remove(hh.s);
      hearts.splice(k, 1);
    }
  }
  // Rauch
  smoke.forEach((s, i) => {
    const p = (t * 0.35 + i / smoke.length) % 1;
    s.position.set(HOUSE.x + 0.8 + p * 0.6, 3.5 + p * 2.4, HOUSE.z - 0.4);
    s.scale.setScalar(0.6 + p * 1.6);
    (s.material as THREE.MeshStandardMaterial).opacity = 0.55 * (1 - p);
  });

  // Knöpfe
  const nh = riding ? null : nearHorse();
  petBtn.hidden = !nh;
  if (nh) petBtn.textContent = `${nh.name} streicheln`;
  rideBtn.hidden = !nh && !riding;
  rideBtn.textContent = riding ? 'Absteigen' : 'Reiten';

  // Kamera folgt weich von schräg oben (wie Animal Crossing)
  const target = new THREE.Vector3(player.x, 0, player.z);
  camPos.lerp(new THREE.Vector3(player.x, 11.5, player.z + 11), 1 - Math.exp(-dt * 4));
  camera.position.copy(camPos);
  camera.lookAt(target.x, 0.5, target.z - 2.2);
  FOCUS.value = camPos.z - 13;
  sun.position.set(player.x - 8, 14, player.z + 6);
  sun.target.position.set(player.x, 0, player.z);
  renderer.render(scene, camera);
}
frame();
// zum Testen
(window as unknown as { __proto3d: unknown }).__proto3d = { player, horses, get riding() { return riding; } };
