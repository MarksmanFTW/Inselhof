/**
 * Himmel: Farbverlauf je Tageszeit, ziehende Wolken, Sonnenglühen am Morgen und
 * Abend, nachts Mond und funkelnde Sterne. Eine große Kugel um die Kamera mit
 * einem kleinen Shader (kein Bild, kostet kaum etwas). Liefert die Farbe am
 * Horizont, damit Nebel und Meer in der Ferne dazu passen.
 */
import * as THREE from 'three';
import { CURVE, FOCUS } from './engine';

const C = (hex: string) => new THREE.Color(hex);
const PAL = {
  day: { top: C('#4aa6e2'), hor: C('#c4ecf6'), lit: C('#ffffff'), dark: C('#d4e2f0') },
  dusk: { top: C('#5a6cb8'), hor: C('#ffbe92'), lit: C('#ffdcc4'), dark: C('#b88aa4') },
  night: { top: C('#0a1330'), hor: C('#24366a'), lit: C('#41528a'), dark: C('#1c2650') },
  rain: { top: C('#7d94a8'), hor: C('#c2ced6'), lit: C('#e4eaee'), dark: C('#9eacb8') },
};
const GLOW = C('#ff8a58');

export class Sky {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  /** Farbe am Horizont (für Nebel und Meer) */
  readonly horizon = new THREE.Color();
  private tmp = new THREE.Color();

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color() },
        uHor: { value: new THREE.Color() },
        uGlow: { value: new THREE.Color() },
        uLit: { value: new THREE.Color() },
        uDark: { value: new THREE.Color() },
        uSun: { value: new THREE.Vector3(0, 1, 0) },
        uMoon: { value: new THREE.Vector3(0.45, 0.2, -1).normalize() },
        uSunAmt: { value: 0 },
        uMoonAmt: { value: 0 },
        uStars: { value: 0 },
        uCloud: { value: 0.5 },
        uTime: { value: 0 },
        uUp: { value: new THREE.Vector3(0, 1, 0) },
        uFwd: { value: new THREE.Vector3(0, 0, -1) },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = position;
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: `
        uniform vec3 uTop, uHor, uGlow, uLit, uDark, uSun, uMoon;
        uniform float uSunAmt, uMoonAmt, uStars, uCloud, uTime;
        uniform vec3 uUp, uFwd;
        varying vec3 vDir;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        float fbm(vec2 p) {
          float s = 0.0, a = 0.5;
          for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 1.7; a *= 0.5; }
          return s;
        }
        void main() {
          vec3 d = normalize(vDir);
          // Höhe über dem sichtbaren Horizont (die Welt ist gewölbt: der Horizont liegt tiefer)
          float h = dot(d, uUp);
          float fz = dot(d, uFwd);
          vec3 col = mix(uHor, uTop, smoothstep(0.0, 0.24, h));
          // Glühen um die tief stehende Sonne
          float sd = max(dot(d, uSun), 0.0);
          col += uGlow * (pow(sd, 5.0) * 0.5 + pow(sd, 48.0) * 0.7);
          col = mix(col, vec3(1.0, 0.95, 0.82), smoothstep(0.9983, 0.9991, sd) * uSunAmt);
          // Mond mit sanftem Schein
          float md = max(dot(d, uMoon), 0.0);
          col += vec3(0.55, 0.65, 1.0) * pow(md, 60.0) * 0.35 * uMoonAmt;
          col = mix(col, vec3(0.96, 0.96, 0.9), smoothstep(0.99915, 0.99945, md) * uMoonAmt);
          // Sterne (funkeln)
          if (uStars > 0.01) {
            vec2 sp = vec2(atan(d.x, fz) * 70.0, h * 160.0);
            vec2 cell = floor(sp);
            float r = hash(cell);
            vec2 off = vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5;
            float st = step(0.965, r) * smoothstep(0.32, 0.0, length(fract(sp) - 0.5 - off * 0.5));
            st *= 0.55 + 0.45 * sin(uTime * (1.5 + r * 4.0) + r * 60.0);
            col += vec3(1.0, 0.97, 0.88) * st * uStars * smoothstep(0.0, 0.08, h) * (1.0 - smoothstep(0.9985, 0.9995, md));
          }
          // Wolken: flach über dem Meer, ziehen langsam
          if (h > -0.01) {
            vec2 uv = vec2(d.x, fz) / (h + 0.07) * 0.45 + vec2(uTime * 0.01, uTime * 0.003);
            float n = fbm(uv);
            float lo = 0.6 - uCloud * 0.22;
            float c = smoothstep(lo, lo + 0.1, n);
            float edge = n - fbm(uv + vec2(0.0, 0.06));
            vec3 cc = mix(uDark, uLit, clamp(0.55 + edge * 5.0, 0.0, 1.0));
            cc += uGlow * pow(sd, 3.0) * 0.35;
            col = mix(col, cc, c * 0.94 * smoothstep(-0.005, 0.03, h));
          }
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(200, 32, 18), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }

  /** Farben nach Tageszeit; dark 0..1, glow 0..1 (Morgen/Abend), hour 0..24 */
  update(camPos: THREE.Vector3, t: number, dark: number, glow: number, rain: number, hour: number, winter: boolean) {
    this.mesh.position.copy(camPos);
    const u = this.mat.uniforms;
    // Blickstrahl, der die gewölbte Welt gerade noch streift (y = -k·(z-f)², Kamera bei zc/yc)
    const k = Math.max(1e-5, CURVE.value);
    const zc = Math.max(0, camPos.z - FOCUS.value);
    const yc = Math.max(0.5, camPos.y);
    const m = -2 * k * zc + 2 * Math.sqrt(k * k * zc * zc + k * yc);
    (u.uUp.value as THREE.Vector3).set(0, 1, -m).normalize();
    (u.uFwd.value as THREE.Vector3).set(0, -m, -1).normalize();
    const up = u.uUp.value as THREE.Vector3;
    const fwd = u.uFwd.value as THREE.Vector3;
    /** Richtung in Horizont-Koordinaten (x rechts, y hoch, z nach vorn) */
    const dir = (out: THREE.Vector3, x: number, y: number, z: number) => out.set(x, 0, 0).addScaledVector(up, y).addScaledVector(fwd, z).normalize();
    const mixPal = (k: 'top' | 'hor' | 'lit' | 'dark', out: THREE.Color) => {
      out.copy(PAL.day[k]);
      if (winter) out.lerp(PAL.rain[k], 0.25);
      out.lerp(PAL.rain[k], rain * 0.75).lerp(PAL.dusk[k], glow * 0.85 * (1 - rain * 0.6)).lerp(PAL.night[k], dark);
      return out;
    };
    mixPal('top', u.uTop.value as THREE.Color);
    mixPal('hor', u.uHor.value as THREE.Color);
    mixPal('lit', u.uLit.value as THREE.Color);
    mixPal('dark', u.uDark.value as THREE.Color);
    this.horizon.copy(u.uHor.value as THREE.Color);
    (u.uGlow.value as THREE.Color).copy(GLOW).multiplyScalar(glow * (1 - rain * 0.7) * (1 - dark * 0.6));
    // Sonne: morgens rechts, abends links tief über dem Meer, tagsüber hoch oben
    const morning = hour < 12;
    const low = glow > 0.02 ? 1 : 0;
    const sun = u.uSun.value as THREE.Vector3;
    if (low) dir(sun, morning ? 0.55 : -0.5, 0.03 + (1 - glow) * 0.06, 1);
    else dir(sun, -0.3, 0.9, 0.3);
    dir(u.uMoon.value as THREE.Vector3, 0.42, 0.11, 1);
    u.uSunAmt.value = low ? glow * (1 - dark) * (1 - rain) : 0;
    u.uMoonAmt.value = Math.max(0, dark - 0.3) / 0.7 * (1 - rain * 0.8);
    u.uStars.value = Math.max(0, dark - 0.45) / 0.55 * (1 - rain);
    u.uCloud.value = 0.35 + rain * 0.6;
    u.uTime.value = t;
  }
  get color() {
    return this.tmp.copy(this.horizon);
  }
}
