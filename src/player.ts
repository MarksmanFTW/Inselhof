/**
 * Spielfigur auf der Insel: läuft in 4 Richtungen, bleibt an Wasser, Baumstämmen,
 * Steinen und Büschen hängen (gleitet an ihnen entlang), darf auf den Steg.
 */
import { Dir } from './character';
import { Ground, H, W, type Island } from './island';

/** Hindernisse: Radius um den Fußpunkt (Welt-Pixel), flach wie der Schatten */
const BLOCK: Record<string, [number, number]> = {
  tree: [5, 3],
  palm: [3, 2],
  bush: [9, 4],
  boulder: [9, 4],
  rock: [5, 2],
  stump: [4, 2],
};

/** Füße sind ein kleines Rechteck */
const FOOT_W = 3;
const FOOT_H = 1;
export const SPEED = 46; // Pixel pro Sekunde

export class Player {
  x: number;
  y: number;
  dir: Dir = Dir.Down;
  moving = false;
  /** Lauf-Animation (0..4) */
  anim = 0;

  constructor(
    readonly isl: Island,
    x: number,
    y: number,
  ) {
    this.x = x;
    this.y = y;
  }

  private ground(x: number, y: number) {
    const d = this.isl.dock;
    // Steg: auf den Brettern zwischen den Längsbalken
    if (x >= d.x + 3 && x <= d.x + d.w - 4 && y >= d.y - 2 && y <= d.y + d.h - 6) return true;
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    return this.isl.ground[(y | 0) * W + (x | 0)] !== Ground.Water;
  }

  /** Darf der Fußpunkt hier stehen? */
  free(x: number, y: number) {
    for (const [dx, dy] of [
      [-FOOT_W, -FOOT_H],
      [FOOT_W, -FOOT_H],
      [-FOOT_W, FOOT_H],
      [FOOT_W, FOOT_H],
    ])
      if (!this.ground(x + dx, y + dy)) return false;
    for (const d of this.isl.decor) {
      const b = BLOCK[d.kind];
      if (!b) continue;
      const cx = d.kind === 'palm' ? d.x : d.x + 1;
      if (((x - cx) / (b[0] + FOOT_W)) ** 2 + ((y - d.y) / (b[1] + FOOT_H)) ** 2 < 1) return false;
    }
    return true;
  }

  /** move: Richtung (-1..1), dt in Sekunden */
  update(mx: number, my: number, dt: number) {
    const len = Math.hypot(mx, my);
    this.moving = len > 0.15;
    if (!this.moving) {
      this.anim = 0;
      return;
    }
    const k = Math.min(1, len);
    const vx = (mx / len) * k * SPEED * dt;
    const vy = (my / len) * k * SPEED * dt;
    // Blickrichtung nach der stärkeren Achse
    this.dir = Math.abs(mx) > Math.abs(my) * 1.1 ? (mx > 0 ? Dir.Right : Dir.Left) : my > 0 ? Dir.Down : Dir.Up;
    // getrennt je Achse → an Hindernissen entlang gleiten
    if (this.free(this.x + vx, this.y)) this.x += vx;
    if (this.free(this.x, this.y + vy)) this.y += vy;
    this.anim = (this.anim + dt * 7 * Math.max(0.5, k)) % 4;
  }

  get frame() {
    return this.moving ? Math.floor(this.anim) : 0;
  }
}
