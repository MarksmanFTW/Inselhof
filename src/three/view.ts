/**
 * Die 3D-Ansicht der Insel. Liest den Spielzustand (Welt, Acker, Pferde, Figuren)
 * und stellt ihn dar – die Spiellogik bleibt unverändert in Welt-Pixeln, hier wird
 * nur umgerechnet (8 px = 1 Einheit). Kamera folgt der Figur von schräg oben,
 * der Horizont wölbt sich weg. Tag und Nacht, Regen, Rauch, Funken, Herzchen.
 */
import * as THREE from 'three';
import type { Look } from '../character';
import type { CropId, Farm } from '../farm';
import { key as plotKey } from '../farm';
import { BREEDS, PADDOCK_FOOT, breedById, isFoal, type HorsePose } from '../horses';
import type { Island } from '../island';
import { H, TILE, W } from '../island';
import { DECO_FOOT } from '../shop';
import type { TimeOfDay } from '../time';
import { BEET_FOOT, COACH_FOOT, FIRE_FOOT, HOUSE_FOOT, HUT_FOOT, STABLE_FOOT, type BuildKind, type World } from '../world';
import { PROJECTS, siteOf } from '../projects';
import { boardSpot } from '../orders';
import { Build, CURVE, FOCUS, U, cone, curve, cyl, mat, rbox, sphere, vcMat } from './engine';
import { makeHorse, type HorseModel } from './horse';
import { Interior } from './interior3d';
import { makeKid, type Kid } from './kid';
import { hut, makeAnimal, type Animal } from './folk';
import { bat, beachItem, festFind, festStall } from './festart';
import { BOTTLE, beachLeft, beachToday } from '../beach';
import { festFindLeft, festFinds, stallSpot } from '../fest';
import type { FestId, Season } from '../season';
import * as M from './models';
import { DOCK_Y, WATER_Y, buildTerrain, type Terrain } from './terrain';
import { Sky } from './sky';
import { merchantBoat } from './boat';

export interface Actor {
  x: number;
  y: number;
  /** 0 runter, 1 hoch, 2 rechts, 3 links */
  dir: number;
  moving: boolean;
  /** Schwung 0..1 und Werkzeug */
  swing: number;
  tool: string;
  /** reitet Pferd Nummer … */
  rides: number;
  /** im Haus Nummer … (-1 draußen) */
  in: number;
  look: Look;
  /** Laufrichtung vom Joystick (für weiche Drehung) */
  mx?: number;
  my?: number;
  /** Tempo-Faktor (Reiten schneller) */
  speed?: number;
}
export interface Frame {
  mode: 'menu' | 'custom' | 'play';
  t: number;
  dt: number;
  now: number;
  tod: TimeOfDay | null;
  me: Actor | null;
  /** wer sonst noch auf der Insel ist */
  mates: (Actor & { key: string })[];
  canTool: boolean;
  horseAt: (i: number) => HorsePose | null;
  petting: number;
  shake: ReadonlyMap<number, number>;
  boatOut: number | null;
  boat: { x: number; y: number };
  ghost: { kind: BuildKind; deco: string; x: number; y: number; ok: boolean } | null;
  marker: [number, number] | null;
  /** Tutorial: Pfeil über diesem Ziel (Welt-Pixel) */
  guide: { x: number; y: number } | null;
  /** Angeln: Pose im Wasser (Welt-Pixel), bite = es zuckt */
  fishing: { x: number; y: number; bite: boolean } | null;
  /** Bewohner: wo sie gerade sind; wish = „!“ (wünscht sich heute etwas), happy = freut sich (s) */
  folk: { id: string; x: number; y: number; yaw: number; moving: boolean; wish: boolean; happy: number; hidden: boolean }[];
  /** Inseltag (Strandgut) und laufendes Fest */
  day: number;
  fest: FestId | null;
  inside: number;
}

export type Quality = { dpr: number; shadows: 0 | 1 | 2 };

/** halb durchsichtig (für Verdeckendes vor der Figur) */
const fadeMat = curve(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, transparent: true, opacity: 0.3, depthWrite: false }));
const fadeGlow = curve(new THREE.MeshStandardMaterial({ color: '#ffe8a8', emissive: '#ffb84a', emissiveIntensity: 0.6, transparent: true, opacity: 0.3, depthWrite: false }));

const angTo = (from: number, to: number) => {
  let d = to - from;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return d;
};
/** Blickrichtung (Spiel) → Drehung um y (Modell schaut nach +z) */
const DIR_YAW = [0, Math.PI, Math.PI / 2, -Math.PI / 2];

interface DecorObj {
  root: THREE.Object3D;
  crown?: THREE.Object3D;
  tree?: THREE.Object3D;
  stump?: THREE.Object3D;
  sapling?: THREE.Object3D;
  /** Äpfel bzw. Beeren (weg nach dem Schütteln) */
  fruit?: THREE.Object3D;
  state: string;
  phase: number;
  /** Grasbüschel: wiegt sich im Wind */
  sway?: THREE.Object3D;
}
interface HorseSlot {
  key: string;
  m: HorseModel;
  x: number;
  y: number;
  yaw: number;
  walk: number;
  graze: number;
  pet: number;
  seen: boolean;
}
interface FolkSlot {
  a: Animal;
  bubble: THREE.Sprite;
  yaw: number;
  walk: number;
}
interface KidSlot {
  key: string;
  kid: Kid;
  yaw: number;
  walk: number;
  lx: number;
  ly: number;
}

export class View {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 260);
  /** Größe der Bildfläche in CSS-Pixeln (gemessen, nicht innerHeight: das ist auf
   *  manchen Handys kleiner als der Bildschirm → sonst bleibt unten ein Streifen frei) */
  w = innerWidth;
  h = innerHeight;
  private hemi = new THREE.HemisphereLight('#fff6e0', '#6aa860', 1.25);
  private sun = new THREE.DirectionalLight('#fff0d0', 2.1);
  private lampLight = new THREE.PointLight('#ffb060', 0, 7, 1.6);
  private fireLight = new THREE.PointLight('#ff9a40', 0, 9, 1.4);
  private terrain: Terrain;
  private decor: DecorObj[] = [];
  private built = new Map<string, THREE.Object3D>();
  private fires: { flames: THREE.Mesh[]; x: number; y: number; glow: THREE.Sprite }[] = [];
  private smoke: { m: THREE.Mesh; base: THREE.Vector3; ph: number }[] = [];
  private horses: HorseSlot[] = [];
  private kids = new Map<string, KidSlot>();
  private folk = new Map<string, FolkSlot>();
  private bubbleTex: THREE.Texture;
  private sparkTex: THREE.Texture;
  /** Strandgut und Fest-Fundstücke (Schlüssel: Art:Tag:Nummer) */
  private finds = new Map<string, { o: THREE.Object3D; spark: THREE.Sprite; x: number; y: number; ph: number; check: () => boolean }>();
  private findsKey = '';
  private stall: THREE.Object3D | null = null;
  private stallFest: FestId | null = null;
  private bats: { g: THREE.Group; wings: THREE.Mesh[]; ph: number; r: number; h: number }[] = [];
  /** Halloween: Laternen vor Häusern und Hütten */
  private lanterns = new THREE.Group();
  private lanternKey = '';
  private snow: THREE.Points | null = null;
  private hovers: THREE.Object3D[] = [];
  private worldVer = -1;
  private farmVer = -1;
  private farmT = 0;
  private soil!: THREE.InstancedMesh;
  /** Pflanzen je Sorte und Stufe (Stufe 0 = Samen, für alle Sorten gleich) */
  private crops = new Map<string, THREE.InstancedMesh>();
  private hay: Record<'fresh' | 'dry' | 'stubble', THREE.InstancedMesh>;
  private boatM = merchantBoat();
  private boat = this.boatM.g;
  private ghost: { key: string; o: THREE.Object3D; foot: THREE.Mesh; mat: THREE.MeshStandardMaterial } | null = null;
  private marker: THREE.Mesh;
  /** Stöcke und Steine zum Aufheben */
  private pickups: THREE.Object3D[] = [];
  private guide = M.guideArrow();
  /** Leuchtturm-Licht (dreht sich nachts) und Festpavillon (Feuerwerk) */
  private beam: THREE.Object3D | null = null;
  private fest: { x: number; y: number } | null = null;
  private fireworkIn = 0;
  private sparks: { m: THREE.InstancedMesh; list: { p: THREE.Vector3; v: THREE.Vector3; life: number; c: THREE.Color }[] } | null = null;
  /** Angeln: Pose und Schnur */
  private bobber: THREE.Group;
  private line: THREE.Line;
  private linePos = new Float32Array(10 * 3);
  private bits: { m: THREE.InstancedMesh; list: { p: THREE.Vector3; v: THREE.Vector3; life: number; c: THREE.Color }[] };
  private hearts: { s: THREE.Sprite; v: number; life: number; delay: number }[] = [];
  private heartTex: THREE.Texture;
  private glowTex: THREE.Texture;
  private flies: { g: THREE.Group; wings: THREE.Mesh[]; x: number; y: number; ph: number }[] = [];
  private gulls: { g: THREE.Group; wings: THREE.Mesh[]; r: number; speed: number; ph: number; dir: number }[] = [];
  private rain: THREE.LineSegments;
  private rainPos: Float32Array;
  private fireflies: THREE.Points;
  private interior: Interior | null = null;
  private zoomK = 1;
  private target = new THREE.Vector3();
  private camPos = new THREE.Vector3();
  private quality: Quality = { dpr: 2, shadows: 1 };
  private firstFrame = true;
  private insideNow = false;
  private menuT = 0;
  private coveredKey = '';
  private skyDome = new Sky();
  private screenFx = document.createElement('div');
  /** Lichtschein um Laternen (nachts) */
  private lampGlows: THREE.Sprite[] = [];
  private dockLamps: [number, number, number][] = [];
  /** Blätter (Herbst), Blüten (Frühling) oder Pusteblumen-Samen (Sommer) in der Luft */
  private drift: { m: THREE.InstancedMesh; p: Float32Array; fall: number; d: THREE.Object3D } | null = null;

  constructor(
    readonly isl: Island,
    readonly world: World,
    readonly farm: Farm,
    host: HTMLElement,
    readonly season: Season = 'summer',
  ) {
    M.setSeason(season);
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.domElement.className = 'world3d';
    host.prepend(r.domElement);
    // Unschärfe zum Horizont hin (wie ein Miniatur-Foto) und weiche Bildränder
    this.screenFx.className = 'screenfx';
    r.domElement.after(this.screenFx);
    this.renderer = r;
    const s = this.scene;
    s.background = new THREE.Color('#c4ecf6');
    s.fog = new THREE.Fog('#c4ecf6', 40, 110);
    s.add(this.skyDome.mesh);
    s.add(this.hemi);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    s.add(this.sun, this.sun.target, this.lampLight, this.fireLight);

    // Gelände und Natur
    this.terrain = buildTerrain(isl, season);
    s.add(this.terrain.group);
    isl.decor.forEach((d, i) => this.decor.push(this.makeDecor(d.kind, d.variant, d.x, d.y, d.flip, i)));
    for (const p of isl.pickups) {
      const o = p.kind === 'stick' ? M.stick(p.variant) : M.pebble(p.variant);
      o.position.set(p.x * U, this.groundY(p.x, p.y), p.y * U);
      o.rotation.y = p.rot;
      if (p.kind === 'stick') o.scale.setScalar(1.25);
      s.add(o);
      this.pickups.push(o);
    }
    this.guide.visible = false;
    s.add(this.guide);
    // Bestellbrett am Steg
    {
      const bp = boardSpot(isl);
      const board = M.orderBoard();
      board.position.set(bp.x * U, this.groundY(bp.x, bp.y), bp.y * U);
      board.rotation.y = -0.25;
      s.add(board);
    }
    // Steg: Laternen an Land und am Ende, Rettungsring, Taurolle, Kisten
    {
      const dk = isl.dock;
      const g = new THREE.Group();
      const b = new Build();
      const x0 = dk.x * U;
      const x1 = (dk.x + dk.w) * U;
      const zEnd = (dk.y + dk.h) * U - 0.3;
      const zStart = (dk.y - 2) * U;
      const lampSpots: [number, number, number][] = [];
      const lamps: [number, number, number][] = [
        [x0 - 0.25, this.groundY(dk.x - 2, dk.y - 2), zStart],
        [x1 + 0.25, this.groundY(dk.x + dk.w + 2, dk.y - 2), zStart],
        [x1 + 0.12, DOCK_Y, zEnd],
      ];
      for (const [x, y, z] of lamps) {
        b.add(cyl(0.06, 0.08, 1.6, 8), '#3a3a44', { p: [x, y + 0.8, z] });
        b.add(cyl(0.16, 0.18, 0.08, 8), '#3a3a44', { p: [x, y + 0.04, z] });
        b.add(cone(0.2, 0.16, 4), '#3a3a44', { p: [x, y + 1.98, z], r: [0, Math.PI / 4, 0] });
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.2), M.glowMats.lamp);
        lamp.position.set(x, y + 1.74, z);
        g.add(lamp);
        lampSpots.push([x, y + 1.74, z]);
      }
      // Rettungsring an einem Pfosten, Taurolle, Kisten
      b.add(new THREE.TorusGeometry(0.22, 0.065, 8, 20), (x, y, _z, out) => out.set(Math.floor((Math.atan2(y - (DOCK_Y + 0.55), x - (x0 - 0.05)) / Math.PI) * 4 + 8) % 2 ? '#ffffff' : '#e0483e'), { p: [x0 - 0.05, DOCK_Y + 0.55, zEnd - 1.6], r: [0, Math.PI / 2, 0] });
      b.add(cyl(0.07, 0.08, 0.9, 8), '#8a5a32', { p: [x0 - 0.05, DOCK_Y + 0.3, zEnd - 1.6 - 0.05] });
      for (let k = 0; k < 3; k++) b.add(new THREE.TorusGeometry(0.18 - k * 0.05, 0.045, 6, 16), '#d8c08a', { p: [x1 - 0.35, DOCK_Y + 0.05 + k * 0.05, zEnd - 0.4], r: [Math.PI / 2, 0, 0] });
      b.add(rbox(0.42, 0.36, 0.42, 0.04), '#c8945a', { p: [x0 - 0.55, this.groundY(dk.x - 4, dk.y - 6) + 0.18, zStart - 0.5], r: [0, 0.3, 0] });
      b.add(rbox(0.32, 0.28, 0.32, 0.04), '#b8844a', { p: [x0 - 0.55, this.groundY(dk.x - 4, dk.y - 6) + 0.5, zStart - 0.5], r: [0, -0.2, 0] });
      b.add(cyl(0.18, 0.18, 0.44, 12), '#9a6a40', { p: [x0 - 0.95, this.groundY(dk.x - 7, dk.y - 6) + 0.22, zStart - 0.2] });
      g.add(b.mesh(0.85));
      s.add(g);
      this.dockLamps = lampSpots;
    }
    {
      const b = new Build();
      b.add(sphere(0.13, 12), '#ffffff', { p: [0, 0, 0] });
      b.add(sphere(0.135, 12), '#e0483e', { p: [0, 0.04, 0], s: [1, 0.6, 1] });
      b.add(rbox(0.03, 0.16, 0.03, 0.01), '#e0483e', { p: [0, 0.18, 0] });
      this.bobber = new THREE.Group();
      this.bobber.add(new THREE.Mesh(b.geometry(), curve(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 }))));
      this.bobber.visible = false;
      s.add(this.bobber);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3));
      this.line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: '#f4f4f4', transparent: true, opacity: 0.85 }));
      this.line.frustumCulled = false;
      this.line.visible = false;
      s.add(this.line);
    }

    // Acker (instanziert)
    this.soil = this.inst(M.soilGeo(), 300, 0.95);
    this.hay = { fresh: this.inst(M.hayGeo('fresh'), 300, 0.95), dry: this.inst(M.hayGeo('dry'), 300, 0.95), stubble: this.inst(M.hayGeo('stubble'), 300, 0.95) };
    s.add(this.boat);
    this.boat.visible = false;

    // Ziel-Kachel
    {
      const b = new Build();
      for (const [x, z, w, d] of [[0, -0.45, 0.9, 0.08], [0, 0.45, 0.9, 0.08], [-0.45, 0, 0.08, 0.98], [0.45, 0, 0.08, 0.98]] as const) b.add(rbox(w, 0.04, d, 0.02), '#fff8e6', { p: [x, 0, z] });
      this.marker = new THREE.Mesh(b.geometry(), new THREE.MeshBasicMaterial({ color: '#fff8e6', transparent: true, opacity: 0.7, depthWrite: false }));
      this.marker.material = curve(this.marker.material as THREE.Material);
      this.marker.visible = false;
      s.add(this.marker);
    }
    // Splitter, Blätter, Tropfen
    {
      const m = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), curve(new THREE.MeshStandardMaterial({ roughness: 0.8 })), 320);
      m.count = 0;
      m.frustumCulled = false;
      s.add(m);
      this.bits = { m, list: [] };
    }
    this.heartTex = this.canvasTex(64, (x) => {
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
    });
    // Glitzern über Strandgut und Fundstücken
    this.sparkTex = this.canvasTex(64, (x) => {
      const g = x.createRadialGradient(32, 32, 0, 32, 32, 30);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.25, 'rgba(255,250,210,0.7)');
      g.addColorStop(1, 'rgba(255,240,180,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 64, 64);
      x.fillStyle = 'rgba(255,255,255,0.95)';
      x.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const r = k % 2 ? 6 : 30;
        x.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
      }
      x.fill();
    });
    s.add(this.lanterns);
    // Winter: es schneit leise
    if (season === 'winter') {
      const n = 500;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) pos.set([Math.random() * 40 - 20, Math.random() * 16, Math.random() * 36 - 18], i * 3);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const flake = this.canvasTex(32, (x) => {
        const gr = x.createRadialGradient(16, 16, 0, 16, 16, 15);
        gr.addColorStop(0, 'rgba(255,255,255,1)');
        gr.addColorStop(0.5, 'rgba(255,255,255,0.8)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = gr;
        x.fillRect(0, 0, 32, 32);
      });
      this.snow = new THREE.Points(g, new THREE.PointsMaterial({ map: flake, size: 0.22, transparent: true, depthWrite: false, opacity: 0.9 }));
      this.snow.frustumCulled = false;
      s.add(this.snow);
    }
    // Sprechblase mit „!“ über Bewohnern, die sich heute etwas wünschen
    this.bubbleTex = this.canvasTex(64, (x) => {
      x.fillStyle = '#ffffff';
      x.strokeStyle = '#e8a03a';
      x.lineWidth = 4;
      x.beginPath();
      x.ellipse(32, 28, 24, 22, 0, 0, Math.PI * 2);
      x.moveTo(24, 46);
      x.lineTo(30, 60);
      x.lineTo(38, 47);
      x.fill();
      x.beginPath();
      x.ellipse(32, 28, 24, 22, 0, 0.5 * Math.PI + 0.35, 0.5 * Math.PI - 0.35 + Math.PI * 2);
      x.stroke();
      x.fillStyle = '#ff8a2a';
      x.fillRect(28, 13, 8, 18);
      x.beginPath();
      x.arc(32, 13, 4, 0, Math.PI * 2);
      x.arc(32, 31, 4, 0, Math.PI * 2);
      x.fill();
      x.beginPath();
      x.arc(32, 39, 4.5, 0, Math.PI * 2);
      x.fill();
    });
    this.glowTex = this.canvasTex(64, (x) => {
      const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,200,120,1)');
      g.addColorStop(0.4, 'rgba(255,150,60,0.45)');
      g.addColorStop(1, 'rgba(255,120,40,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 64, 64);
    });
    // Schmetterlinge über der Wiese, Möwen über dem Meer
    {
      const r = (n: number) => ((Math.sin(n * 91.7) * 43758.5) % 1 + 1) % 1;
      const cols = ['#ffffff', '#ffd23f', '#ff9fc4', '#9ad0ff'];
      let k = 0;
      for (let n = 0; this.flies.length < 9 && n < 400; n++) {
        const x = 60 + r(n) * (W - 120);
        const y = 60 + r(n + 0.5) * (H - 120);
        if (isl.ground[(y | 0) * W + (x | 0)] !== 2) continue;
        const g = new THREE.Group();
        const wings: THREE.Mesh[] = [];
        for (const s2 of [1, -1]) {
          const w = new THREE.Mesh(new THREE.CircleGeometry(0.13, 8).translate(0.12, 0, 0), curve(new THREE.MeshBasicMaterial({ color: cols[k % 4], side: THREE.DoubleSide })));
          w.scale.x = s2;
          w.rotation.x = -Math.PI / 2;
          g.add(w);
          wings.push(w);
        }
        s.add(g);
        this.flies.push({ g, wings, x, y, ph: n * 1.7 });
        k++;
      }
      for (let i = 0; i < 3; i++) {
        const g = new THREE.Group();
        const body = new THREE.Mesh(sphere(0.16, 10).scale(1.8, 0.8, 0.8), mat('#ffffff', { rough: 0.6 }));
        g.add(body);
        const wings: THREE.Mesh[] = [];
        for (const s2 of [1, -1]) {
          const w = new THREE.Mesh(rbox(0.25, 0.03, 0.9, 0.02).translate(0, 0, 0.45), mat('#f4f4f8', { rough: 0.6 }));
          w.scale.z = s2;
          g.add(w);
          wings.push(w);
        }
        g.add(new THREE.Mesh(sphere(0.05, 6).translate(0.32, 0.02, 0), mat('#f2b040')));
        s.add(g);
        this.gulls.push({ g, wings, r: 26 + i * 6, speed: 0.1 + i * 0.03, ph: i * 2.1, dir: i % 2 ? -1 : 1 });
      }
    }
    // Regen
    {
      const n = 500;
      this.rainPos = new Float32Array(n * 6);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
      this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#d8ecff', transparent: true, opacity: 0.55 }));
      this.rain.frustumCulled = false;
      this.rain.visible = false;
      s.add(this.rain);
    }
    // Glühwürmchen
    {
      const n = 60;
      const p = new Float32Array(n * 3);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      this.fireflies = new THREE.Points(g, new THREE.PointsMaterial({ color: '#eaff8a', size: 0.22, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, map: this.glowTex }));
      this.fireflies.frustumCulled = false;
      this.fireflies.visible = false;
      s.add(this.fireflies);
      this.initDrift();
      for (const [x, y, z] of this.dockLamps) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: '#ffd890', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
        sp.position.set(x, y, z);
        sp.scale.setScalar(1.6);
        s.add(sp);
        this.lampGlows.push(sp);
      }
    }
    this.resize();
  }

  // ---------- Hilfen ----------
  private canvasTex(size: number, draw: (x: CanvasRenderingContext2D) => void) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d')!);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  private inst(geo: THREE.BufferGeometry, n: number, rough: number, shadow = false) {
    const m = new THREE.InstancedMesh(geo, vcMat(rough), n);
    m.count = 0;
    m.castShadow = shadow;
    m.receiveShadow = true;
    m.frustumCulled = false;
    this.scene.add(m);
    return m;
  }
  /** Boden unter einem Welt-Pixel */
  groundY(x: number, y: number) {
    return this.terrain.heightAt(x, y);
  }
  private pos(o: THREE.Object3D, x: number, y: number, dy = 0) {
    o.position.set(x * U, this.groundY(x, y) + dy, y * U);
  }

  // ---------- Natur ----------
  private makeDecor(kind: string, variant: number, x: number, y: number, flip = false, i = 0): DecorObj {
    const root = new THREE.Group();
    this.pos(root, kind === 'palm' ? x : x + 1, y);
    const yaw = (flip ? Math.PI : 0) + ((i * 2.399) % 1) * 0.6 - 0.3;
    const o: DecorObj = { root, state: '', phase: (x * 0.37 + y * 0.11) % 6.28 };
    if (kind === 'tree' || kind === 'palm') {
      const t = kind === 'tree' ? M.tree(variant) : M.palm(variant);
      t.g.rotation.y = kind === 'tree' ? yaw * 3 : flip ? Math.PI : 0;
      o.tree = t.g;
      o.crown = t.crown;
      if ('fruit' in t) o.fruit = t.fruit as THREE.Object3D;
      o.stump = M.stump(kind === 'tree');
      o.sapling = M.sapling();
      root.add(t.g, o.stump, o.sapling);
      o.stump.visible = o.sapling.visible = false;
    } else if (kind === 'bush') {
      const b = M.bush(variant);
      b.g.rotation.y = yaw;
      root.add(b.g);
      // wiegt sich leicht und wackelt beim Pflücken
      o.crown = b.g;
      if (b.berries) o.fruit = b.berries;
    }
    else if (kind === 'rock' || kind === 'boulder') root.add(M.rock(kind === 'boulder', variant)).rotation.y = yaw * 4;
    else if (kind === 'grass') {
      o.tree = M.tallGrass(variant);
      o.sway = o.tree;
      root.add(o.tree);
    } else if (kind === 'stump') root.add(M.stump(true)).rotation.y = yaw * 5;
    this.scene.add(root);
    return o;
  }
  private syncDecor(now: number) {
    const w = this.world;
    this.isl.decor.forEach((d, i) => {
      const o = this.decor[i];
      if (o.fruit) o.fruit.visible = w.hasFruit(i, now);
      if (!o.stump) {
        if (d.kind === 'grass' && o.tree) o.tree.visible = !this.farm.meadow.has(plotKey(Math.floor(d.x / TILE), Math.floor(d.y / TILE)));
        return;
      }
      const st = w.felled.has(i) ? w.stage(i, now) : 'tree';
      if (st === o.state) return;
      o.state = st;
      o.tree!.visible = st === 'tree';
      o.stump.visible = st === 'stump';
      o.sapling!.visible = st === 'sapling';
    });
  }

  /** nachts: Leuchtturm-Licht dreht sich, über dem Festpavillon gibt es Feuerwerk */
  private nightShow(fr: Frame) {
    const dark = fr.tod?.dark ?? 0;
    const outside = fr.mode !== 'custom' && fr.inside < 0;
    if (this.beam) {
      this.beam.visible = outside && dark > 0.25;
      this.beam.rotation.y += fr.dt * 0.9;
      (((this.beam.children[0] as THREE.Mesh).material) as THREE.MeshBasicMaterial).opacity = 0.08 + dark * 0.2;
    }
    if (this.fest && outside && dark > 0.5) {
      this.fireworkIn -= fr.dt;
      if (this.fireworkIn <= 0) {
        this.fireworkIn = 0.9 + Math.random() * 1.2;
        this.firework(this.fest.x + (Math.random() - 0.5) * 40, this.fest.y - 10 - Math.random() * 20);
      }
    }
    // Funken fliegen
    const sp = this.sparks;
    if (!sp) return;
    const d = new THREE.Object3D();
    let n = 0;
    for (let k = sp.list.length - 1; k >= 0; k--) {
      const q = sp.list[k];
      q.life -= fr.dt;
      if (q.life <= 0) {
        sp.list.splice(k, 1);
        continue;
      }
      q.v.y -= 2.2 * fr.dt;
      q.v.multiplyScalar(1 - fr.dt * 0.8);
      q.p.addScaledVector(q.v, fr.dt);
    }
    for (const q of sp.list) {
      d.position.copy(q.p);
      d.scale.setScalar(Math.min(1, q.life * 1.6));
      d.updateMatrix();
      sp.m.setMatrixAt(n, d.matrix);
      sp.m.setColorAt(n, q.c);
      n++;
    }
    sp.m.count = n;
    sp.m.instanceMatrix.needsUpdate = true;
    if (sp.m.instanceColor) sp.m.instanceColor.needsUpdate = true;
  }
  /** eine Feuerwerks-Rakete platzt (Welt-Pixel) */
  firework(x: number, y: number) {
    if (!this.sparks) {
      const m = new THREE.InstancedMesh(sphere(0.12, 6), new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 600);
      m.count = 0;
      m.frustumCulled = false;
      this.scene.add(m);
      this.sparks = { m, list: [] };
    }
    const cols = [['#ff5a7a', '#ffd23f'], ['#6ad0ff', '#ffffff'], ['#b884e8', '#ff9af0'], ['#7cf08a', '#ffd23f']][Math.floor(Math.random() * 4)];
    const base = new THREE.Vector3(x * U, this.groundY(x, y) + 7 + Math.random() * 2, y * U);
    for (let i = 0; i < 64 && this.sparks.list.length < 600; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(3.2 + Math.random() * 1.0);
      this.sparks.list.push({ p: base.clone(), v, life: 1.1 + Math.random() * 0.6, c: new THREE.Color(cols[i % 2]) });
    }
  }

  /** Angeln: Pose schaukelt auf dem Wasser (taucht bei Biss), Schnur von der Angelspitze */
  private syncFishing(fr: Frame) {
    const f = fr.fishing;
    const me = fr.me;
    if (!f || !me || fr.inside >= 0) {
      this.bobber.visible = this.line.visible = false;
      return;
    }
    // gekrümmte Welt: hinten liegt alles etwas tiefer
    const bend = (z: number) => {
      const cz = Math.min(0, z - FOCUS.value);
      return cz * cz * CURVE.value;
    };
    const bx = f.x * U;
    const bz = f.y * U;
    const dip = f.bite ? -0.1 - Math.abs(Math.sin(fr.t * 18)) * 0.08 : Math.sin(fr.t * 2.4) * 0.03;
    const by = WATER_Y + 0.05 + dip;
    this.bobber.visible = true;
    this.bobber.position.set(bx, by, bz);
    this.bobber.rotation.z = f.bite ? Math.sin(fr.t * 25) * 0.4 : Math.sin(fr.t * 1.7) * 0.15;
    // Angelspitze: vor der Figur, hoch oben
    const yaw = DIR_YAW[me.dir] ?? 0;
    const tx = me.x * U + Math.sin(yaw) * 1.5;
    const tz = me.y * U + Math.cos(yaw) * 1.5;
    const ty = this.groundY(me.x, me.y) + 1.95 - bend(tz);
    const by2 = by + 0.08 - bend(bz);
    const n = this.linePos.length / 3;
    for (let k = 0; k < n; k++) {
      const a = k / (n - 1);
      // leicht durchhängend (straff beim Biss)
      const sag = (f.bite ? 0.05 : 0.35) * Math.sin(a * Math.PI);
      this.linePos.set([tx + (bx - tx) * a, ty + (by2 - ty) * a - sag, tz + (bz - tz) * a], k * 3);
    }
    this.line.geometry.attributes.position.needsUpdate = true;
    this.line.visible = true;
  }

  /** Stöcke/Steine: aufgehoben, überbaut oder unter einem Feld → weg */
  private syncPickups() {
    this.isl.pickups.forEach((p, i) => {
      this.pickups[i].visible = this.world.pickable(i) && !this.farm.plot(Math.floor(p.x / TILE), Math.floor(p.y / TILE));
    });
  }

  // ---------- Bauten ----------
  private syncBuilt() {
    const w = this.world;
    const want = new Map<string, () => THREE.Object3D>();
    w.houses.forEach((h) => want.set(`house:${h.big ? 'big:' : ''}${h.x},${h.y}`, () => this.placeAt(M.house(h.big), h.x, h.y, true)));
    w.beets.forEach((h) =>
      want.set(`beet:${h.x},${h.y}`, () => {
        // wie die Felder darin: Boden in der Mitte des Beets
        const o = this.placeAt(M.beet(), h.x, h.y, false);
        o.position.y = this.groundY(h.x, h.y - 8);
        return o;
      }),
    );
    w.coaches.forEach((h) => want.set(`coach:${h.x},${h.y}`, () => this.placeAt(M.coachStop(), h.x, h.y, true)));
    w.stables.forEach((h) => want.set(`stable:${h.x},${h.y}`, () => this.placeAt(M.stable(), h.x, h.y, true)));
    w.paddocks.forEach((h) => want.set(`paddock:${h.x},${h.y}`, () => this.placeAt(M.paddock(), h.x, h.y, true)));
    w.fires.forEach((h) => want.set(`fire:${h.x},${h.y}`, () => this.placeAt(M.campfire().g, h.x, h.y, false)));
    w.decos.forEach((h) => want.set(`deco:${h.id}:${h.x},${h.y}`, () => this.placeAt(M.deco(h.id), h.x, h.y, false)));
    w.villagers.forEach((v) => want.set(`hut:${v.id}:${v.x},${v.y}`, () => this.placeAt(hut(v.id), v.x, v.y, true)));
    // Insel-Projekte: fertige Gebäude und die Baustelle des aktuellen
    PROJECTS.forEach((p, k) => {
      if (k > w.proj.n) return;
      const [x, y] = siteOf(w, this.farm, k);
      if (k < w.proj.n) want.set(`proj:${p.id}:${x},${y}`, () => this.placeAt(M.projectModel(p.id), x, y, true));
      else want.set(`site:${p.id}:${x},${y}`, () => this.placeAt(M.constructionSite(p.id, p.foot), x, y, true));
    });
    for (const [k, o] of this.built)
      if (!want.has(k)) {
        this.scene.remove(o);
        this.built.delete(k);
      }
    for (const [k, make] of want) if (!this.built.has(k)) this.built.set(k, make());
    this.beam = null;
    this.fest = null;
    this.hovers = [];
    for (const [k, o] of this.built) {
      if (k.startsWith('deco:ghost')) {
        o.userData.baseY ??= o.position.y;
        this.hovers.push(o);
      }
      if (k.startsWith('proj:lighthouse')) this.beam = o.userData.beam as THREE.Object3D;
      if (k.startsWith('proj:pavilion')) this.fest = { x: o.position.x / U, y: o.position.z / U };
    }
    // Feuer und Rauch neu einsammeln
    this.fires = [];
    this.smoke = [];
    for (const [k, o] of this.built) {
      if (k.startsWith('fire:')) {
        const flames = o.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh && (c.material === M.glowMats.flame || c.material === M.glowMats.flame2));
        let glow = o.userData.glow as THREE.Sprite | undefined;
        if (!glow) {
          glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }));
          glow.scale.setScalar(2.4);
          glow.position.y = 0.5;
          o.add(glow);
          o.userData.glow = glow;
        }
        this.fires.push({ flames, x: o.position.x / U, y: o.position.z / U, glow });
      }
      if (k.startsWith('house:')) {
        let puffs = o.userData.puffs as THREE.Mesh[] | undefined;
        if (!puffs) {
          puffs = [];
          for (let n = 0; n < 5; n++) {
            const p = new THREE.Mesh(sphere(0.2, 10), curve(new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, roughness: 1, depthWrite: false })));
            o.add(p);
            puffs.push(p);
          }
          o.userData.puffs = puffs;
        }
        puffs.forEach((m, n) => this.smoke.push({ m, base: (o.userData.chimney as THREE.Vector3) ?? M.CHIMNEY, ph: n / puffs!.length + o.position.x * 0.1 }));
      }
    }
  }
  private placeAt(o: THREE.Object3D, x: number, y: number, flat: boolean) {
    // Bauten stehen gerade: auf der niedrigsten Stelle der Grundfläche
    let h = this.groundY(x, y);
    if (flat) for (const [dx, dy] of [[-16, 0], [16, 0], [0, -12], [-16, -12], [16, -12]]) h = Math.min(h, this.groundY(x + dx, y + dy));
    o.position.set(x * U, h, y * U);
    this.scene.add(o);
    return o;
  }

  // ---------- Acker ----------
  private syncFarm(now: number) {
    const f = this.farm;
    const d = new THREE.Object3D();
    const dry = new THREE.Color('#9a6a42');
    const wet = new THREE.Color('#5e4028');
    const grow = (m: THREE.InstancedMesh, n: number) => {
      if (n <= m.instanceMatrix.count) return m;
      const bigger = new THREE.InstancedMesh(m.geometry, m.material, Math.ceil(n * 1.5));
      bigger.castShadow = m.castShadow;
      bigger.receiveShadow = true;
      bigger.frustumCulled = false;
      this.scene.remove(m);
      this.scene.add(bigger);
      return bigger;
    };
    this.soil = grow(this.soil, f.plots.size);
    let n = 0;
    const cc = new Map<string, number>();
    const cropMesh = (kind: CropId, st: number) => {
      const key = st === 0 ? 'seed' : `${kind}${st}`;
      let m = this.crops.get(key);
      if (!m) this.crops.set(key, (m = this.inst(M.cropGeo(st, kind), Math.max(40, f.plots.size), 0.7, true)));
      else if (!cc.has(key)) this.crops.set(key, (m = grow(m, f.plots.size)));
      const i = cc.get(key) ?? 0;
      cc.set(key, i + 1);
      return { m, i };
    };
    for (const [k, p] of f.plots) {
      const [c, r] = k.split(',').map(Number);
      const x = c * TILE + 4;
      const y = r * TILE + 4;
      // im Hochbeet liegt die Erde höher
      const h = this.groundY(x, y) + (this.world.beets.length && this.world.onBeet(c, r) ? M.BEET_LIFT : 0);
      d.position.set(x * U, h, y * U);
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(1);
      d.updateMatrix();
      this.soil.setMatrixAt(n, d.matrix);
      this.soil.setColorAt(n, p.wetAt ? wet : dry);
      n++;
      if (p.crop) {
        const st = Math.min(3, p.crop.stage);
        d.position.y = h + 0.04 + (st >= 3 ? Math.abs(Math.sin(now / 400 + c)) * 0.03 : 0);
        d.rotation.y = (c * 1.7 + r) % 6;
        d.updateMatrix();
        const { m, i } = cropMesh(p.crop.kind ?? 'turnip', st);
        m.setMatrixAt(i, d.matrix);
      }
    }
    this.soil.count = n;
    this.soil.instanceMatrix.needsUpdate = true;
    if (this.soil.instanceColor) this.soil.instanceColor.needsUpdate = true;
    for (const [key, m] of this.crops) {
      m.count = cc.get(key) ?? 0;
      m.instanceMatrix.needsUpdate = true;
    }
    const hc = { fresh: 0, dry: 0, stubble: 0 };
    for (const s of ['fresh', 'dry', 'stubble'] as const) this.hay[s] = grow(this.hay[s], f.meadow.size);
    for (const k of f.meadow.keys()) {
      const [c, r] = k.split(',').map(Number);
      const st = f.mown(c, r, now);
      if (!st) continue;
      const x = c * TILE + 4;
      const y = r * TILE + 4;
      d.position.set(x * U, this.groundY(x, y) + 0.01, y * U);
      d.rotation.set(0, 0, 0);
      d.updateMatrix();
      this.hay[st].setMatrixAt(hc[st]++, d.matrix);
    }
    for (const s of ['fresh', 'dry', 'stubble'] as const) {
      this.hay[s].count = hc[s];
      this.hay[s].instanceMatrix.needsUpdate = true;
    }
  }
  /** Kleinkram unter Bauten und Feldern ausblenden */
  private syncCovered() {
    const w = this.world;
    const f = this.farm;
    const k = `${w.houses.length}|${w.stables.length}|${w.fires.length}|${w.decos.length}|${w.paddocks.length}|${w.villagers.length}|${w.beets.length}|${w.coaches.length}|${f.plots.size}|${f.meadow.size}`;
    if (k === this.coveredKey) return;
    this.coveredKey = k;
    const boxes: [number, number, number, number][] = [];
    const add = (list: { x: number; y: number }[], ft: { left: number; right: number; top: number; bottom: number }, m = 3) => {
      for (const h of list) boxes.push([h.x + ft.left - m, h.x + ft.right + m, h.y + ft.top - m * 3, h.y + ft.bottom + m]);
    };
    add(w.houses, HOUSE_FOOT);
    add(w.stables, STABLE_FOOT);
    add(w.fires, FIRE_FOOT);
    add(w.decos, DECO_FOOT);
    add(w.villagers, HUT_FOOT);
    add(w.beets, BEET_FOOT);
    add(w.coaches, COACH_FOOT);
    this.terrain.hideDetails((x, y) => {
      if (boxes.some(([a, b, c, d]) => x > a && x < b && y > c && y < d)) return true;
      const key = plotKey(Math.floor(x / TILE), Math.floor(y / TILE));
      return f.plots.has(key) || f.meadow.has(key);
    });
  }

  // ---------- Pferde & Figuren ----------
  private syncHorses(fr: Frame) {
    const w = this.world;
    const now = fr.now;
    while (this.horses.length > w.horses.length) {
      const h = this.horses.pop()!;
      this.scene.remove(h.m.g);
      h.m.dispose();
    }
    const riders = new Map<number, Actor>();
    for (const a of [fr.me, ...fr.mates]) if (a && a.rides >= 0 && a.in < 0) riders.set(a.rides, a);
    w.horses.forEach((h, i) => {
      const b = breedById(h.breed) ?? BREEDS[0];
      const foal = isFoal(h, now);
      const key = `${b.id}|${h.acc ?? ''}|${foal}`;
      let s = this.horses[i];
      if (!s || s.key !== key) {
        if (s) {
          this.scene.remove(s.m.g);
          s.m.dispose();
        }
        const m = makeHorse(b, h.acc ?? '', foal);
        this.scene.add(m.g);
        s = this.horses[i] = { key, m, x: 0, y: 0, yaw: 0, walk: 0, graze: 0, pet: 0, seen: false };
      }
      const rider = riders.get(i);
      const p = rider ? null : fr.horseAt(i);
      if (!rider && !p) {
        s.m.g.visible = false;
        s.seen = false;
        return;
      }
      s.m.g.visible = fr.inside < 0;
      const x = rider ? rider.x : p!.x;
      const y = rider ? rider.y : p!.y;
      const dx = x - s.x;
      const dy = y - s.y;
      const dist = Math.hypot(dx, dy);
      const moving = rider ? rider.moving : p!.moving;
      if (!s.seen) {
        s.yaw = rider ? DIR_YAW[rider.dir] : p!.dir === 2 ? Math.PI / 2 : p!.dir === 3 ? -Math.PI / 2 : p!.dir === 1 ? Math.PI : 0;
        s.seen = true;
      } else if (dist > 0.05 && dist < 30) {
        const want = Math.atan2(dx, dy);
        s.yaw += angTo(s.yaw, want) * Math.min(1, fr.dt * (rider ? 10 : 5));
      } else if (rider && rider.mx !== undefined && (rider.mx || rider.my)) s.yaw += angTo(s.yaw, Math.atan2(rider.mx!, rider.my!)) * Math.min(1, fr.dt * 10);
      if (fr.petting === i && fr.me) s.yaw += angTo(s.yaw, Math.atan2(fr.me.x - x, fr.me.y - y)) * Math.min(1, fr.dt * 4);
      s.x = x;
      s.y = y;
      s.walk += moving ? Math.min(dist * 0.55, fr.dt * 17) + fr.dt * 2 : 0;
      s.graze += ((p?.graze && !moving ? 1 : 0) - s.graze) * Math.min(1, fr.dt * 2.5);
      s.pet = fr.petting === i ? Math.min(1, s.pet + fr.dt * 3) : Math.max(0, s.pet - fr.dt * 2);
      this.pos(s.m.g, x, y);
      s.m.g.rotation.y = s.yaw - Math.PI / 2;
      s.m.pose({ walk: s.walk, moving, graze: s.graze, t: fr.t + i * 1.7, sleep: !!fr.tod?.night && !moving && !rider, pet: s.pet, ridden: !!rider });
    });
  }
  /** Bewohner: laufen, hüpfen vor Freude, „!“ über dem Kopf */
  private syncFolk(fr: Frame) {
    const seen = new Set<string>();
    for (const v of fr.folk) {
      seen.add(v.id);
      let s = this.folk.get(v.id);
      if (!s) {
        const a = makeAnimal(v.id);
        const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.bubbleTex, transparent: true, depthWrite: false }));
        bubble.scale.setScalar(0.62);
        this.scene.add(a.g, bubble);
        s = { a, bubble, yaw: v.yaw, walk: 0 };
        this.folk.set(v.id, s);
      }
      const show = fr.mode === 'play' && fr.inside < 0 && !v.hidden;
      s.a.g.visible = show;
      s.bubble.visible = show && v.wish;
      if (!show) continue;
      s.yaw += angTo(s.yaw, v.yaw) * Math.min(1, fr.dt * 8);
      if (v.moving) s.walk += fr.dt * 12;
      this.pos(s.a.g, v.x, v.y);
      s.a.g.rotation.y = s.yaw;
      s.a.pose({ walk: s.walk, moving: v.moving, happy: Math.min(1, v.happy), t: fr.t + v.x * 0.1, sleep: false });
      if (s.bubble.visible) {
        // Sprites wölben sich nicht mit: von Hand nach unten ziehen wie die Welt
        const p = s.a.g.position;
        const cz = Math.min(0, p.z - FOCUS.value);
        s.bubble.position.set(p.x, p.y + 1.72 + Math.sin(fr.t * 3 + v.x) * 0.06 - cz * cz * CURVE.value, p.z);
      }
    }
    for (const [id, s] of this.folk)
      if (!seen.has(id)) {
        this.scene.remove(s.a.g, s.bubble);
        s.a.dispose();
        s.bubble.material.dispose();
        this.folk.delete(id);
      }
  }
  /** Strandgut und Fest-Fundstücke des Tages, mit Glitzern */
  private syncFinds(fr: Frame) {
    const key = `${fr.day}|${fr.fest ?? ''}`;
    if (key !== this.findsKey) {
      this.findsKey = key;
      for (const f of this.finds.values()) this.scene.remove(f.o);
      this.finds.clear();
      beachToday(this.isl, fr.day).forEach((b, i) => {
        const o = beachItem(b.id);
        this.addFind(`beach:${i}`, o, b.x, b.y, i === BOTTLE ? 0.5 : 0.3, () => beachLeft(this.world, i, fr.day));
        o.rotation.y = (i * 1.7) % 6;
      });
      if (fr.fest) {
        const fest = fr.fest;
        festFinds(this.isl, fest, fr.day).forEach((p, i) => {
          const o = festFind(fest);
          o.rotation.y = (i * 2.3) % 6;
          this.addFind(`fest:${i}`, o, p.x, p.y, 0.7, () => festFindLeft(this.world, fest, i, fr.day));
        });
      }
    }
    const show = fr.mode === 'play' && fr.inside < 0;
    for (const f of this.finds.values()) {
      const on = show && f.check() && !this.world.builtAt(f.x, f.y, 2, 2);
      f.o.visible = on;
      if (!on) continue;
      const k = Math.sin(fr.t * 2.6 + f.ph);
      f.spark.material.opacity = Math.max(0, k) * 0.9;
      f.spark.scale.setScalar(0.35 + Math.max(0, k) * 0.35);
    }
  }
  private addFind(key: string, o: THREE.Object3D, x: number, y: number, h: number, check: () => boolean) {
    this.pos(o, x, y);
    const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    spark.position.set(0.15, h, 0.1);
    o.add(spark);
    this.scene.add(o);
    this.finds.set(key, { o, spark, x, y, ph: x * 0.37 + y * 0.11, check });
  }
  /** Fest: Laden am Steg, Laternen vor den Häusern, Fledermäuse in der Nacht */
  private syncFest(fr: Frame) {
    const fest = fr.mode === 'play' ? fr.fest : null;
    if (fest !== this.stallFest) {
      this.stallFest = fest;
      if (this.stall) this.scene.remove(this.stall);
      this.stall = null;
      if (fest) {
        const sp = stallSpot(this.isl);
        this.stall = festStall(fest);
        this.pos(this.stall, sp.x, sp.y);
        this.stall.rotation.y = 0.25;
        this.scene.add(this.stall);
      }
    }
    if (this.stall) this.stall.visible = fr.inside < 0;
    // Kürbislaternen vor jedem Haus und jeder Hütte
    const w = this.world;
    const lk = fest === 'halloween' ? `${w.houses.map((h) => `${h.x},${h.y}`).join(';')}|${w.villagers.map((v) => `${v.x},${v.y}`).join(';')}` : '';
    if (lk !== this.lanternKey) {
      this.lanternKey = lk;
      this.lanterns.clear();
      if (lk)
        for (const [x, y] of [...w.houses.map((h) => [h.x + 13, h.y + 5]), ...w.villagers.map((v) => [v.x + 9, v.y + 4])]) {
          const o = M.deco('jackolantern');
          o.scale.setScalar(0.62);
          this.pos(o, x, y);
          this.lanterns.add(o);
        }
    }
    this.lanterns.visible = fr.inside < 0;
    // Fledermäuse
    const night = fest === 'halloween' && (fr.tod?.dark ?? 0) > 0.45 && fr.inside < 0;
    if (night && !this.bats.length)
      for (let k = 0; k < 5; k++) {
        const b = bat();
        this.scene.add(b.g);
        this.bats.push({ ...b, ph: k * 1.3, r: 3 + (k % 3) * 1.4, h: 3 + (k % 2) * 1.2 });
      }
    for (const b of this.bats) {
      b.g.visible = night;
      if (!night) continue;
      const a = fr.t * (0.6 + b.r * 0.05) + b.ph;
      b.g.position.set(this.target.x + Math.cos(a) * b.r, this.target.y + b.h + Math.sin(fr.t * 2 + b.ph) * 0.3, this.target.z - 2 + Math.sin(a) * b.r * 0.7);
      b.g.rotation.y = -a;
      const f = Math.sin(fr.t * 18 + b.ph) * 0.8;
      b.wings[0].rotation.z = f;
      b.wings[1].rotation.z = -f;
    }
    // Gespenster schweben
    for (const o of this.hovers) o.position.y = (o.userData.baseY as number) + 0.15 + Math.sin(fr.t * 1.6 + o.position.x) * 0.12;
  }
  private syncKid(which: string, a: Actor | null, fr: Frame) {
    let s = this.kids.get(which);
    const visible = !!a && fr.mode === 'play' && (a.in === fr.inside);
    if (!a || !visible) {
      if (s) s.kid.g.visible = false;
      return;
    }
    const key = JSON.stringify(a.look);
    if (!s || s.key !== key) {
      if (s) {
        s.kid.g.parent?.remove(s.kid.g);
        s.kid.dispose();
      }
      s = { key, kid: makeKid(a.look), yaw: DIR_YAW[a.dir], walk: 0, lx: a.x, ly: a.y };
      this.kids.set(which, s);
    }
    const g = s.kid.g;
    const parent = fr.inside >= 0 && this.interior ? this.interior.scene : this.scene;
    if (g.parent !== parent) parent.add(g);
    g.visible = true;
    const dx = a.x - s.lx;
    const dy = a.y - s.ly;
    s.lx = a.x;
    s.ly = a.y;
    // Drehung: beim Laufen in Laufrichtung, im Stand nach der Blickrichtung des Spiels
    let want = DIR_YAW[a.dir];
    if (a.moving) {
      if (a.mx !== undefined && (a.mx || a.my)) want = Math.atan2(a.mx, a.my!);
      else if (Math.hypot(dx, dy) > 0.05) want = Math.atan2(dx, dy);
    }
    s.yaw += angTo(s.yaw, want) * Math.min(1, fr.dt * 12);
    if (a.moving) s.walk += fr.dt * 11 * Math.min(1.6, a.speed ?? 1);
    const ride = a.rides >= 0 && a.in < 0 && this.horses[a.rides]?.m;
    if (ride) {
      const hs = this.horses[a.rides];
      const seat = hs.m.seat.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), hs.m.g.rotation.y);
      g.position.copy(hs.m.g.position).add(seat);
      g.position.y += -0.36 + (a.moving ? Math.abs(Math.cos(hs.walk)) * 0.035 : 0);
      g.rotation.y = hs.yaw;
    } else if (fr.inside >= 0) {
      g.position.set(a.x * U, 0, a.y * U);
      g.rotation.y = s.yaw;
    } else {
      this.pos(g, a.x, a.y);
      g.rotation.y = s.yaw;
    }
    s.kid.pose({ walk: s.walk, moving: a.moving, swing: a.swing, tool: a.tool, can: fr.canTool, ride: !!ride, t: fr.t });
  }

  // ---------- Effekte ----------
  /** Splitter/Blätter/Tropfen an einem Welt-Pixel (z = Höhe in Pixeln wie im Spiel) */
  burst(x: number, y: number, z: number, n: number, cols: string[], speed = 30) {
    const base = new THREE.Vector3(x * U, this.groundY(x, y) + z * U + 0.1, y * U);
    for (let i = 0; i < n && this.bits.list.length < 320; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * U * (0.4 + Math.random()) * 0.9;
      this.bits.list.push({ p: base.clone(), v: new THREE.Vector3(Math.cos(a) * v, 2.5 + Math.random() * 3.5, Math.sin(a) * v * 0.8), life: 0.6 + Math.random() * 0.6, c: new THREE.Color(cols[i % cols.length]) });
    }
  }
  /** kleine Staubwolke beim Laufen (Sand) */
  puff(x: number, y: number, cols: string[], n = 2) {
    const base = new THREE.Vector3(x * U, this.groundY(x, y) + 0.06, y * U);
    for (let i = 0; i < n && this.bits.list.length < 320; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 0.5 + Math.random() * 0.5;
      this.bits.list.push({ p: base.clone(), v: new THREE.Vector3(Math.cos(a) * v, 1.4 + Math.random() * 0.8, Math.sin(a) * v * 0.6), life: 0.22 + Math.random() * 0.15, c: new THREE.Color(cols[i % cols.length]) });
    }
  }
  /** Herzchen über einem Welt-Pixel (h = Höhe in Einheiten) */
  heartsAt(x: number, y: number, n: number, h = 2.2) {
    for (let k = 0; k < n; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.heartTex, transparent: true, depthWrite: false }));
      s.scale.setScalar(0.38 + Math.random() * 0.14);
      s.position.set(x * U + (Math.random() - 0.5) * 0.9, this.groundY(x, y) + h + Math.random() * 0.3, y * U + (Math.random() - 0.5) * 0.6);
      s.visible = false;
      this.scene.add(s);
      this.hearts.push({ s, v: 0.8 + Math.random() * 0.5, life: 1.4, delay: k * 0.15 });
    }
  }
  private stepEffects(fr: Frame) {
    const dt = fr.dt;
    const b = this.bits;
    const d = new THREE.Object3D();
    let n = 0;
    for (let k = b.list.length - 1; k >= 0; k--) {
      const q = b.list[k];
      q.life -= dt;
      if (q.life <= 0) {
        b.list.splice(k, 1);
        continue;
      }
      q.v.y -= 14 * dt;
      q.p.addScaledVector(q.v, dt);
      const gy = this.groundY(q.p.x / U, q.p.z / U) + 0.04;
      if (q.p.y < gy) {
        q.p.y = gy;
        q.v.multiplyScalar(0.5);
        q.v.y = 0;
      }
    }
    for (const q of b.list) {
      d.position.copy(q.p);
      d.rotation.set(q.life * 7, q.life * 5, 0);
      d.scale.setScalar(Math.min(1, q.life * 2.5));
      d.updateMatrix();
      b.m.setMatrixAt(n, d.matrix);
      b.m.setColorAt(n, q.c);
      n++;
    }
    b.m.count = n;
    b.m.instanceMatrix.needsUpdate = true;
    if (b.m.instanceColor) b.m.instanceColor.needsUpdate = true;
    for (let k = this.hearts.length - 1; k >= 0; k--) {
      const h = this.hearts[k];
      if (h.delay > 0) {
        h.delay -= dt;
        continue;
      }
      h.s.visible = true;
      h.life -= dt;
      h.s.position.y += h.v * dt;
      h.s.material.opacity = Math.min(1, h.life * 1.5);
      if (h.life <= 0) {
        this.scene.remove(h.s);
        h.s.material.dispose();
        this.hearts.splice(k, 1);
      }
    }
  }

  // ---------- Treibende Blätter und Blüten ----------
  private initDrift() {
    const season = this.season;
    if (season === 'winter') return;
    const n = season === 'summer' ? 26 : 40;
    const geo = season === 'summer' ? new THREE.IcosahedronGeometry(0.03, 0) : new THREE.CircleGeometry(0.1, 5).scale(1, 0.55, 1);
    const cols = season === 'autumn' ? ['#e8702a', '#f2a03a', '#d84a2a', '#f2c14e', '#c85a2a'] : season === 'spring' ? ['#f8c0d8', '#ffffff', '#f4a8c8', '#ffe0ec'] : ['#ffffff', '#fffbe8', '#f4f8ff'];
    const m = new THREE.InstancedMesh(geo, curve(new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide, emissive: season === 'summer' ? '#ffffff' : '#000000', emissiveIntensity: season === 'summer' ? 0.12 : 0 })), n);
    m.frustumCulled = false;
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) m.setColorAt(i, c.set(cols[i % cols.length]));
    // x, y, z, Phase, Tempo je Stück
    const p = new Float32Array(n * 5);
    for (let i = 0; i < n; i++) {
      p[i * 5 + 1] = -999;
      p[i * 5 + 3] = i * 1.37;
      p[i * 5 + 4] = 0.7 + ((i * 0.618) % 1) * 0.6;
    }
    this.drift = { m, p, fall: season === 'autumn' ? 0.75 : season === 'spring' ? 0.45 : 0.12, d: new THREE.Object3D() };
    this.scene.add(m);
  }
  private stepDrift(fr: Frame, gust: number) {
    const dr = this.drift;
    if (!dr) return;
    dr.m.visible = fr.inside < 0;
    if (!dr.m.visible) return;
    const c = this.target;
    const p = dr.p;
    const n = p.length / 5;
    const dt = Math.min(0.1, fr.dt);
    for (let i = 0; i < n; i++) {
      const k = i * 5;
      if (p[k + 1] < c.y - 0.5 || Math.abs(p[k] - c.x) > 16 || p[k + 2] < c.z - 18 || p[k + 2] > c.z + 8) {
        // neu oben im Bild (eher links, der Wind weht nach rechts)
        p[k] = c.x - 14 + Math.random() * 24;
        p[k + 1] = c.y + 1 + Math.random() * (dr.fall < 0.2 ? 2.5 : 6);
        p[k + 2] = c.z - 16 + Math.random() * 22;
      }
      const ph = p[k + 3];
      const sp = p[k + 4];
      p[k] += (0.55 * gust + Math.sin(fr.t * 0.9 + ph) * 0.35) * sp * dt;
      p[k + 1] -= dr.fall * sp * dt * (1 + Math.sin(fr.t * 1.7 + ph) * 0.5);
      p[k + 2] += Math.sin(fr.t * 0.6 + ph * 2) * 0.3 * dt;
      dr.d.position.set(p[k], p[k + 1], p[k + 2]);
      dr.d.rotation.set(fr.t * 1.9 * sp + ph, fr.t * 1.3 + ph, Math.sin(fr.t * 2.3 + ph) * 1.2);
      dr.d.updateMatrix();
      dr.m.setMatrixAt(i, dr.d.matrix);
    }
    dr.m.instanceMatrix.needsUpdate = true;
  }

  // ---------- Licht, Tag & Nacht ----------
  private light(fr: Frame) {
    const T = fr.tod;
    const dark = T ? T.dark : 0;
    const glow = T ? T.glow : 0;
    const rain = T?.rain ? 1 : 0;
    this.skyDome.update(this.camera.position, fr.t, dark, glow, rain, T?.hour ?? 12, this.season === 'winter');
    const sky = this.skyDome.horizon;
    (this.scene.background as THREE.Color).copy(sky);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(sky);
    this.hemi.color.set('#fff6e0').lerp(new THREE.Color('#ffd0b0'), glow * 0.6).lerp(new THREE.Color('#7080c8'), dark);
    this.hemi.groundColor.set('#6aa860').lerp(new THREE.Color('#283048'), dark);
    this.hemi.intensity = (1.25 - dark * 0.62) * (1 - rain * 0.12);
    this.sun.color.set('#fff0d0').lerp(new THREE.Color('#ff9a60'), glow * 0.8).lerp(new THREE.Color('#9ab0ff'), dark);
    this.sun.intensity = (2.1 - dark * 1.6) * (1 - rain * 0.55);
    M.glowMats.window.emissiveIntensity = 0.2 + dark * 1.8;
    M.glowMats.lamp.emissiveIntensity = 0.25 + dark * 2.4;
    for (const g of this.lampGlows) g.material.opacity = Math.max(0, dark - 0.2) * 0.75 * (0.95 + Math.sin(fr.t * 2.1) * 0.05);
    M.glowMats.pumpkin.emissiveIntensity = 0.5 + dark * 2.6;
    M.glowMats.potion.emissiveIntensity = 0.4 + dark * 1.6;
    M.glowMats.bulbs.emissiveIntensity = 0.3 + dark * 1.8 + Math.sin(fr.t * 3) * 0.15 * dark;
    const wm = this.terrain.waterMat.uniforms;
    (wm.uTint.value as THREE.Color).setRGB(1, 1, 1).lerp(new THREE.Color('#5a6aa8'), dark * 0.8).lerp(new THREE.Color('#c8b0a0'), glow * 0.3);
    (wm.uFog.value as THREE.Color).copy(fog.color);
    wm.uSpark.value = 1 - dark * 0.7;
    // Lichter: Lampe der Figur und nächstes Lagerfeuer (nur nachts)
    const me = fr.me;
    if (me && fr.inside < 0 && dark > 0.05) {
      this.lampLight.intensity = dark * 2.2;
      this.lampLight.position.set(me.x * U, this.groundY(me.x, me.y) + 1.6, me.y * U + 0.3);
    } else this.lampLight.intensity = 0;
    let best: { x: number; y: number } | null = null;
    let bd = 1e9;
    for (const f of this.fires) {
      const dd = me ? Math.hypot(f.x - me.x, f.y - me.y) : 0;
      if (dd < bd) {
        bd = dd;
        best = f;
      }
    }
    if (best && fr.inside < 0) {
      this.fireLight.intensity = (0.8 + dark * 4) * (0.9 + Math.sin(fr.t * 13) * 0.08 + Math.sin(fr.t * 7.3) * 0.06);
      this.fireLight.position.set(best.x * U, this.groundY(best.x, best.y) + 0.9, best.y * U);
    } else this.fireLight.intensity = 0;
    for (const f of this.fires) {
      f.flames.forEach((m, i) => {
        const k = 1 + Math.sin(fr.t * (11 + i * 3) + i) * 0.14;
        m.scale.set(m.scale.x, (i ? 0.6 : 1) * k, m.scale.z);
        m.rotation.y = fr.t * (i ? -2 : 1.5);
      });
      f.glow.material.opacity = 0.25 + dark * 0.55;
    }
    // Regen und Glühwürmchen
    this.rain.visible = !!rain && fr.inside < 0 && this.season !== 'winter';
    if (this.rain.visible) {
      const p = this.rainPos;
      const c = this.target;
      for (let i = 0; i < p.length; i += 6) {
        if (p[i + 1] <= c.y - 1 || Math.abs(p[i] - c.x) > 22 || Math.abs(p[i + 2] - c.z) > 22) {
          p[i] = c.x + (Math.random() - 0.5) * 40;
          p[i + 1] = c.y + 4 + Math.random() * 14;
          p[i + 2] = c.z + (Math.random() - 0.5) * 36;
        }
        p[i] -= fr.dt * 3;
        p[i + 1] -= fr.dt * 22;
        p[i + 3] = p[i] + 0.12;
        p[i + 4] = p[i + 1] + 0.55;
        p[i + 5] = p[i + 2];
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
    if (this.snow) {
      this.snow.visible = fr.inside < 0;
      const p = this.snow.geometry.attributes.position as THREE.BufferAttribute;
      const c = this.target;
      const fall = rain ? 2.2 : 0.9;
      for (let i = 0; i < p.count; i++) {
        let x = p.getX(i);
        let y = p.getY(i) - fr.dt * fall * (0.7 + (i % 5) * 0.12);
        let z = p.getZ(i);
        x += Math.sin(fr.t * 0.8 + i) * fr.dt * 0.4;
        if (y < c.y - 1 || Math.abs(x - c.x) > 22 || Math.abs(z - c.z) > 20) {
          x = c.x + (Math.random() - 0.5) * 40;
          y = c.y + 6 + Math.random() * 12;
          z = c.z + (Math.random() - 0.5) * 36;
        }
        p.setXYZ(i, x, y, z);
      }
      p.needsUpdate = true;
    }
    this.fireflies.visible = dark > 0.45 && fr.inside < 0;
    if (this.fireflies.visible) {
      const p = this.fireflies.geometry.attributes.position as THREE.BufferAttribute;
      const c = this.target;
      for (let i = 0; i < p.count; i++) {
        const bx = c.x + ((i * 7.31) % 24) - 12;
        const bz = c.z + ((i * 3.77) % 20) - 12;
        const x = bx + Math.sin(fr.t * 0.6 + i) * 1.5;
        const z = bz + Math.cos(fr.t * 0.45 + i * 1.3) * 1.2;
        p.setXYZ(i, x, this.groundY(x / U, z / U) + 0.5 + Math.sin(fr.t * 1.1 + i) * 0.3, z);
      }
      p.needsUpdate = true;
      (this.fireflies.material as THREE.PointsMaterial).opacity = 0.5 + Math.sin(fr.t * 2.3) * 0.3;
    }
  }

  // ---------- Kamera ----------
  setZoom(k: number) {
    this.zoomK = Math.max(0.55, Math.min(2.2, k));
  }
  get zoom() {
    return this.zoomK;
  }
  private cameraFor(fr: Frame) {
    const aspect = this.camera.aspect;
    const portrait = aspect < 1;
    this.camera.fov = portrait ? 46 : 36;
    const k = 1 - Math.exp(-fr.dt * 5);
    if (fr.mode === 'play' && fr.me) {
      const me = fr.me;
      const want = new THREE.Vector3(me.x * U, this.groundY(me.x, me.y), me.y * U);
      if (this.firstFrame) this.target.copy(want);
      else this.target.lerp(want, k);
      const D = (portrait ? 23 : 21) / this.zoomK;
      const pitch = 0.82 + (1 / this.zoomK - 1) * 0.12;
      const cam = new THREE.Vector3(this.target.x, this.target.y + Math.sin(pitch) * D, this.target.z + Math.cos(pitch) * D);
      if (this.firstFrame) this.camPos.copy(cam);
      else this.camPos.lerp(cam, k * 1.4);
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.target.x, this.target.y + 0.6, this.target.z - 2);
      FOCUS.value = this.target.z - 3;
      CURVE.value = 0.011;
      (this.scene.fog as THREE.Fog).near = D + 12;
      (this.scene.fog as THREE.Fog).far = D + 70;
    } else {
      // Menü: Kamera schwebt langsam über die Insel
      this.menuT += fr.dt;
      const t = this.menuT;
      const cx = (W * U) / 2 + Math.sin(t * 0.05) * 14;
      const cz = (H * U) / 2 + Math.cos(t * 0.05) * 3 + 2;
      this.target.set(cx, 0, cz);
      const D = portrait ? 62 : 46;
      const lx = cx + (portrait ? 0 : -12);
      const lz = cz + (portrait ? 15 : 2);
      this.camera.position.set(lx, D * 0.66, lz + D * 0.75);
      this.camera.lookAt(lx, 0, lz);
      FOCUS.value = cz - 8;
      CURVE.value = 0.006;
      (this.scene.fog as THREE.Fog).near = 80;
      (this.scene.fog as THREE.Fog).far = 190;
    }
    this.camera.updateProjectionMatrix();
    const sz = this.quality.shadows === 2 ? 22 : 18;
    const sc = this.sun.shadow.camera;
    if (sc.right !== sz) {
      Object.assign(sc, { left: -sz, right: sz, top: sz, bottom: -sz, near: 1, far: 70 });
      sc.updateProjectionMatrix();
    }
    this.sun.position.set(this.target.x - 10, this.target.y + 22, this.target.z + 8);
    this.sun.target.position.copy(this.target);
  }

  // ---------- Bild ----------
  setQuality(q: Quality) {
    const changed = q.shadows !== this.quality.shadows;
    // Tiefenunschärfe kostet etwas – nur, wenn das Gerät auch Schatten schafft
    this.screenFx.classList.toggle('dof', q.shadows > 0);
    this.quality = q;
    this.renderer.setPixelRatio(q.dpr);
    this.sun.castShadow = q.shadows > 0;
    if (changed && this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
    this.sun.shadow.mapSize.set(q.shadows === 2 ? 2048 : 1024, q.shadows === 2 ? 2048 : 1024);
    this.resize();
  }
  resize() {
    // die Leinwand füllt per CSS den ganzen Bildschirm; hier nur die Pixel anpassen
    const el = this.renderer.domElement;
    el.style.height = '';
    const r = el.getBoundingClientRect();
    this.w = Math.max(1, Math.round(r.width || innerWidth));
    this.h = Math.max(1, Math.round(r.height || innerHeight));
    // iPhone-Home-Bildschirm: dort sind 100 % manchmal um die Statusleiste zu kurz
    if ((navigator as { standalone?: boolean }).standalone) {
      const full = Math.round(matchMedia('(orientation: portrait)').matches ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height));
      if (full > this.h && full - this.h < 120) {
        this.h = full;
        el.style.height = `${full}px`;
      }
    }
    this.renderer.setSize(this.w, this.h, false);
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
    this.interior?.resize(this.w, this.h);
  }

  render(fr: Frame) {
    const now = fr.now;
    if (this.world.version !== this.worldVer) {
      this.worldVer = this.world.version;
      this.syncBuilt();
      this.syncDecor(now);
      this.syncPickups();
    }
    this.farmT -= fr.dt;
    if (this.farm.version !== this.farmVer || this.farmT <= 0) {
      this.farmVer = this.farm.version;
      this.farmT = 0.25;
      this.syncFarm(now);
      this.syncDecor(now);
      this.syncPickups();
      this.syncCovered();
    }
    this.fadeBlockers(fr);
    // Wind und getroffene Bäume
    // Wind: kommt in sanften Böen, die über die Insel wandern
    const gust = 0.6 + 0.4 * Math.sin(fr.t * 0.37) * Math.sin(fr.t * 0.23 + 1.3) + (fr.tod?.rain ? 0.5 : 0);
    for (const [i, o] of this.decor.entries()) {
      if (o.sway) {
        if (!o.sway.visible) continue;
        o.sway.rotation.z = Math.sin(fr.t * 1.7 + o.phase * 2) * 0.07 * gust + 0.03 * gust;
        o.sway.rotation.x = Math.cos(fr.t * 1.3 + o.phase) * 0.04 * gust;
        continue;
      }
      if (!o.crown) continue;
      const sh = fr.shake.get(i) ?? 0;
      o.crown.rotation.z = Math.sin(fr.t * 0.9 + o.phase) * 0.025 * gust + (sh ? Math.sin(fr.t * 50) * sh * 0.09 : 0);
      o.crown.rotation.x = Math.cos(fr.t * 0.7 + o.phase) * 0.015 * gust;
    }
    this.stepDrift(fr, gust);
    for (const s of this.smoke) {
      const p = (fr.t * 0.3 + s.ph) % 1;
      s.m.position.set(s.base.x + p * 0.7, s.base.y + p * 2.6, s.base.z - p * 0.3);
      s.m.scale.setScalar(0.5 + p * 1.8);
      (s.m.material as THREE.MeshStandardMaterial).opacity = 0.5 * (1 - p) * (fr.tod?.rain ? 0.6 : 1);
    }
    this.syncHorses(fr);
    this.syncFolk(fr);
    this.syncFinds(fr);
    this.syncFest(fr);
    // Boot
    if (fr.boatOut !== null) {
      this.boat.visible = true;
      const out = fr.boatOut;
      const bx = fr.boat.x + out * 140;
      // morgens kommt es mit dem Bug voran und dreht kurz vor dem Steg, abends fährt es hinaus
      const arriving = (fr.tod?.hour ?? 12) < 12;
      const turn = arriving ? Math.PI * Math.min(1, out / 0.18) : 0;
      this.boat.position.set(bx * U, WATER_Y + 0.02 + Math.sin(fr.t * 1.8) * 0.05, fr.boat.y * U);
      this.boat.rotation.set(Math.sin(fr.t * 1.3) * 0.03, turn, Math.sin(fr.t * 1.1) * 0.02 + (out > 0 && out < 1 ? 0.03 : 0));
      const bm = this.boatM;
      bm.flag.rotation.y = Math.sin(fr.t * 3.1) * 0.25 + 0.15;
      bm.flag.rotation.z = Math.sin(fr.t * 4.3) * 0.05;
      bm.pennants.rotation.x = Math.sin(fr.t * 2.2) * 0.04;
      const fs = 1 + Math.sin(fr.t * 2.4) * 0.04 + (out > 0 && out < 1 ? 0.12 : 0);
      bm.foam.scale.set(2.35 * fs, 0.95 * fs, 1);
      (bm.foam.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(fr.t * 2.4) * 0.12;
      // Kapitänin winkt ab und zu (leichtes Wippen)
      bm.captain.rotation.y = Math.sin(fr.t * 0.6) * 0.35;
      bm.captain.position.y = 0.16 + Math.abs(Math.sin(fr.t * 2.2)) * 0.02;
    } else this.boat.visible = false;
    // Schmetterlinge & Möwen
    for (const f of this.flies) {
      const x = f.x + Math.sin(fr.t * 0.7 + f.ph) * 18 + Math.sin(fr.t * 1.9 + f.ph) * 5;
      const y = f.y + Math.cos(fr.t * 0.5 + f.ph) * 12;
      f.g.position.set(x * U, this.groundY(x, y) + 0.7 + Math.abs(Math.sin(fr.t * 3 + f.ph)) * 0.4, y * U);
      f.g.rotation.y = fr.t * 0.7 + f.ph;
      const a = Math.sin(fr.t * 18 + f.ph) * 0.9;
      f.wings[0].rotation.y = a;
      f.wings[1].rotation.y = -a;
      f.g.visible = !fr.tod || fr.tod.dark < 0.6;
    }
    for (const gl of this.gulls) {
      const a = gl.ph + fr.t * gl.speed * gl.dir;
      const cx = (W * U) / 2;
      const cz = (H * U) / 2;
      gl.g.position.set(cx + Math.cos(a) * gl.r * 1.5, 7 + Math.sin(fr.t * 0.7 + gl.ph) * 0.6, cz + Math.sin(a) * gl.r * 0.8);
      gl.g.rotation.y = -a - (gl.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      const fl = Math.sin(fr.t * 5 + gl.ph) * 0.4;
      gl.wings[0].rotation.x = fl;
      gl.wings[1].rotation.x = -fl;
    }
    // Bau-Vorschau und Ziel-Kachel
    this.syncGhost(fr);
    if (fr.marker && fr.mode === 'play' && fr.inside < 0) {
      const [c, r] = fr.marker;
      const x = c * TILE + 4;
      const y = r * TILE + 4;
      this.marker.visible = true;
      this.marker.position.set(x * U, this.groundY(x, y) + 0.08, y * U);
      (this.marker.material as THREE.MeshBasicMaterial).opacity = 0.45 + Math.sin(fr.t * 6) * 0.25;
    } else this.marker.visible = false;
    if (fr.guide && fr.mode === 'play' && fr.inside < 0) {
      const { x, y } = fr.guide;
      this.guide.visible = true;
      this.guide.position.set(x * U, this.groundY(x, y) + 0.45 + Math.abs(Math.sin(fr.t * 3.2)) * 0.35, y * U);
      this.guide.rotation.y = Math.sin(fr.t * 1.6) * 0.5;
    } else this.guide.visible = false;
    this.syncFishing(fr);
    this.nightShow(fr);
    this.stepEffects(fr);
    this.light(fr);

    if (fr.inside >= 0) {
      const h = this.world.houses[fr.inside];
      this.interior ??= new Interior();
      if (!this.insideNow) this.interior.resize(this.w, this.h);
      this.interior.update(h?.furn ?? {}, fr.tod, fr.t, !!h?.big);
      if (fr.me) this.interior.follow(fr.me.x * U, !this.insideNow);
    }
    this.syncKid('me', fr.me, fr);
    const keys = new Set(['me']);
    for (const m of fr.mates) {
      keys.add(`m:${m.key}`);
      this.syncKid(`m:${m.key}`, m, fr);
    }
    // gegangen: Figur weg
    for (const [k, s] of this.kids)
      if (!keys.has(k)) {
        s.kid.g.parent?.remove(s.kid.g);
        s.kid.dispose();
        this.kids.delete(k);
      }
    this.insideNow = fr.inside >= 0 && !!this.interior;
    if (this.screenFx.hidden !== this.insideNow) this.screenFx.hidden = this.insideNow;
    if (this.insideNow) {
      // drinnen ist nichts gewölbt
      CURVE.value = 0;
      this.renderer.render(this.interior!.scene, this.interior!.camera);
    } else {
      this.cameraFor(fr);
      this.renderer.render(this.scene, this.camera);
    }
    this.firstFrame = false;
    // ab und zu die Farbe am unteren Bildrand messen (gleich nach dem Zeichnen)
    const real = performance.now();
    if (real - this.edgeAt > 1000) {
      this.edgeAt = real;
      this.measureEdge();
    }
  }

  /** Farbe am unteren Bildrand (für Browser-Leisten und Hintergrund, damit kein farbiger Streifen auffällt) */
  edgeColor = '';
  private edgeAt = 0;
  private edgePx = new Uint8Array(4);
  private measureEdge() {
    const gl = this.renderer.getContext();
    const w = gl.drawingBufferWidth;
    let r = 0;
    let g = 0;
    let b = 0;
    for (const f of [0.12, 0.5, 0.88]) {
      gl.readPixels(Math.round(w * f), 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.edgePx);
      r += this.edgePx[0];
      g += this.edgePx[1];
      b += this.edgePx[2];
    }
    const hex = (v: number) => Math.round(v / 3).toString(16).padStart(2, '0');
    this.edgeColor = `#${hex(r)}${hex(g)}${hex(b)}`;
  }

  /** Bäume und Häuser zwischen Kamera und Figur werden durchsichtig */
  private fadeBlockers(fr: Frame) {
    const play = fr.mode === 'play' && fr.inside < 0;
    const tx = this.target.x;
    const tz = this.target.z;
    const check = (o: THREE.Object3D, w: number, depth: number) => {
      const dx = o.position.x - tx;
      const dz = o.position.z - tz;
      const block = play && dz > 0.4 && dz < depth / this.zoomK ** 0.3 && Math.abs(dx) < w;
      if (block === !!o.userData.faded) return;
      o.userData.faded = block;
      o.traverse((c) => {
        if (!(c instanceof THREE.Mesh) || c instanceof THREE.InstancedMesh) return;
        if (block) {
          c.userData.orig ??= c.material;
          c.material = c.userData.orig === M.glowMats.window ? fadeGlow : fadeMat;
        } else if (c.userData.orig) c.material = c.userData.orig;
      });
    };
    for (const o of this.decor) if (o.tree && o.crown) check(o.root, 2.8, 8);
    for (const [k, o] of this.built) if (k.startsWith('house:') || k.startsWith('stable:') || k.startsWith('hut:')) check(o, k.startsWith('stable') ? 3.4 : k.startsWith('hut') ? 2 : 2.7, k.startsWith('hut') ? 3.4 : 4.2);
  }

  /** wieder ganz nah an der Figur anfangen (Menü → Spiel, Haus verlassen) */
  snap() {
    this.firstFrame = true;
  }

  private syncGhost(fr: Frame) {
    const g = fr.mode === 'play' && fr.inside < 0 ? fr.ghost : null;
    const key = g ? `${g.kind}:${g.deco}` : '';
    if (!g) {
      if (this.ghost) this.ghost.o.visible = this.ghost.foot.visible = false;
      return;
    }
    if (!this.ghost || this.ghost.key !== key) {
      if (this.ghost) this.scene.remove(this.ghost.o, this.ghost.foot);
      const o = g.kind === 'house' ? M.house() : g.kind === 'stable' ? M.stable() : g.kind === 'paddock' ? M.paddock() : g.kind === 'fire' ? M.campfire().g : g.kind === 'hut' ? hut(g.deco) : g.kind === 'beet' ? M.beet() : g.kind === 'coach' ? M.coachStop() : M.deco(g.deco);
      const m = M.ghostOf(o, true);
      const foot = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), curve(new THREE.MeshBasicMaterial({ color: '#78e66e', transparent: true, opacity: 0.4, depthWrite: false })));
      this.scene.add(o, foot);
      this.ghost = { key, o, foot, mat: m };
    }
    const gh = this.ghost;
    gh.o.visible = gh.foot.visible = true;
    gh.mat.color.set(g.ok ? '#c8f0b8' : '#f4a8a0');
    (gh.foot.material as THREE.MeshBasicMaterial).color.set(g.ok ? '#78e66e' : '#f0463c');
    this.pos(gh.o, g.x, g.y);
    const f = g.kind === 'house' ? HOUSE_FOOT : g.kind === 'stable' ? STABLE_FOOT : g.kind === 'paddock' ? PADDOCK_FOOT : g.kind === 'fire' ? FIRE_FOOT : g.kind === 'hut' ? HUT_FOOT : g.kind === 'beet' ? BEET_FOOT : g.kind === 'coach' ? COACH_FOOT : DECO_FOOT;
    gh.foot.scale.set((f.right - f.left) * U, 1, (f.bottom - f.top) * U);
    gh.foot.position.set((g.x + (f.left + f.right) / 2) * U, this.groundY(g.x, g.y) + 0.06, (g.y + (f.top + f.bottom) / 2) * U);
  }

  /** Welt-Pixel (+ Höhe in Einheiten) → Bildschirm (CSS-Pixel), null wenn hinter der Kamera */
  project(x: number, y: number, h: number, out = { x: 0, y: 0 }) {
    const inside = this.insideNow;
    const cam = inside ? this.interior!.camera : this.camera;
    const v = new THREE.Vector3(x * U, (inside ? 0 : this.groundY(x, y)) + h, y * U);
    if (!inside) {
      const cz = Math.min(0, v.z - FOCUS.value);
      v.y -= cz * cz * CURVE.value;
    }
    v.project(cam);
    if (v.z > 1) return null;
    out.x = (v.x * 0.5 + 0.5) * this.w;
    out.y = (-v.y * 0.5 + 0.5) * this.h;
    return out;
  }
}

