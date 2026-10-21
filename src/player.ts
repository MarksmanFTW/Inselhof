/**
 * Spielfigur auf der Insel: läuft in 4 Richtungen, bleibt an Wasser, Baumstämmen,
 * Steinen, Büschen und Häusern hängen (gleitet an ihnen entlang), darf auf den Steg.
 */
import { Dir } from './character';
import { Ground, H, W, type Island } from './island';
import type { World } from './world';

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
  /** müde = langsamer */
  speedMul = 1;
  /** eigene Kollision (z. B. im Haus); sonst Insel */
  collide: ((x: number, y: number) => boolean) | null = null;

  constructor(
    readonly isl: Island,
    readonly world: World,
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
    if (this.collide) return this.collide(x, y);
    for (const [dx, dy] of [
      [-FOOT_W, -FOOT_H],
      [FOOT_W, -FOOT_H],
      [-FOOT_W, FOOT_H],
      [FOOT_W, FOOT_H],
    ])
      if (!this.ground(x + dx, y + dy)) return false;
    if (this.world.blocked(x, y, FOOT_W, FOOT_H)) return false;
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
    const vx = (mx / len) * k * SPEED * this.speedMul * dt;
    const vy = (my / len) * k * SPEED * this.speedMul * dt;
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
