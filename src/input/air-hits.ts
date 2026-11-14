/**
 * Hits on surfaces in the air (a drum head on its stand, a key top, a kick's front head): a tracked point (a
 * fingertip, the palm, a stick's tip) crossing the surface the way you strike it, fast enough. Loudness from the
 * crossing speed. A point that stays through the surface (a hand resting on the keys) plays once, then nothing until
 * it has come back out by a centimetre. Pure: kit-local coordinates in, hits out; no scene, no audio.
 */

/** A surface to strike: a disc or a rectangle lying flat at height `y` (struck downward), or a disc standing facing
 * the player at `z` (struck away from you). Kit-local metres: x right, y up, z toward the player. */
export interface AirSurface {
  id: number;
  face: 'up' | 'front';
  x: number;
  y: number;
  z: number;
  /** Disc radius (when set), else a rectangle `w` wide and `d` deep (up) or `d` tall (front). */
  r?: number;
  w?: number;
  d?: number;
}

export interface AirHit {
  surface: number;
  point: number;
  /** Crossing speed (m/s) and loudness 0..1. */
  speed: number;
  gain: number;
}

/** Below this it's a touch, not a hit (m/s); and how far back out re-arms a point (m). */
export const AIR = { minSpeed: 0.12, fullSpeed: 1.4, rearm: 0.01 } as const;

/** How hard a crossing at `speed` m/s sounds (0.15 soft to 1). */
export function airGain(speed: number): number {
  return Math.max(0.15, Math.min(1, 0.15 + (0.85 * (speed - AIR.minSpeed)) / (AIR.fullSpeed - AIR.minSpeed)));
}

function inside(s: AirSurface, a: number, b: number): boolean {
  // (a, b): the crossing point in the surface's own two directions
  if (s.r !== undefined) return Math.hypot(a - (s.face === 'up' ? s.x : s.x), b - (s.face === 'up' ? s.z : s.y)) <= s.r;
  const ca = s.x;
  const cb = s.face === 'up' ? s.z : s.y;
  return Math.abs(a - ca) <= (s.w ?? 0) / 2 && Math.abs(b - cb) <= (s.d ?? 0) / 2;
}

/** The depth of a point through a surface (+: in front of or above it, −: through it). */
function side(s: AirSurface, x: number, y: number, z: number): number {
  return s.face === 'up' ? y - s.y : z - s.z;
}

export class AirHits {
  private prev: Float32Array;
  private seen: Uint8Array;
  /** Per point and surface: through it now (waiting to come back out). */
  private through: Uint8Array;

  constructor(readonly points: number, readonly maxSurfaces = 64) {
    this.prev = new Float32Array(points * 3);
    this.seen = new Uint8Array(points);
    this.through = new Uint8Array(points * maxSurfaces);
  }

  /** Forget a point (it went untracked, or changed meaning: a stick appeared). */
  forget(p: number): void {
    this.seen[p] = 0;
    for (let s = 0; s < this.maxSurfaces; s++) this.through[p * this.maxSurfaces + s] = 0;
  }

  /**
   * Point `p` is now at (x, y, z) after `dt` s. Each surface it crossed the right way, fast enough, inside, is a hit
   * pushed to `out`. Returns how many were added.
   */
  update(p: number, x: number, y: number, z: number, dt: number, surfaces: readonly AirSurface[], out: AirHit[]): number {
    const i = p * 3;
    const px = this.prev[i];
    const py = this.prev[i + 1];
    const pz = this.prev[i + 2];
    this.prev[i] = x;
    this.prev[i + 1] = y;
    this.prev[i + 2] = z;
    if (!this.seen[p]) {
      this.seen[p] = 1;
      // (where it starts: through a surface already counts as having played it)
      for (let k = 0; k < surfaces.length && k < this.maxSurfaces; k++) this.through[p * this.maxSurfaces + k] = side(surfaces[k], x, y, z) < 0 ? 1 : 0;
      return 0;
    }
    let n = 0;
    for (let k = 0; k < surfaces.length && k < this.maxSurfaces; k++) {
      const s = surfaces[k];
      const now = side(s, x, y, z);
      const was = side(s, px, py, pz);
      const t = p * this.maxSurfaces + k;
      if (this.through[t]) {
        if (now > AIR.rearm) this.through[t] = 0;
        continue;
      }
      if (!(was > 0 && now <= 0)) continue;
      // where it crossed, on the surface
      const f = was / (was - now);
      const cx = px + (x - px) * f;
      const cy = py + (y - py) * f;
      const cz = pz + (z - pz) * f;
      if (!inside(s, cx, s.face === 'up' ? cz : cy)) continue;
      const speed = dt > 0 ? (was - now) / dt : 0;
      this.through[t] = 1;
      if (speed < AIR.minSpeed) continue;
      out.push({ surface: s.id, point: p, speed, gain: airGain(speed) });
      n++;
      // one note per finger: it has played; nothing under it plays until it comes back out (list what wins first)
      for (let q = 0; q < surfaces.length && q < this.maxSurfaces; q++) this.through[p * this.maxSurfaces + q] = 1;
      break;
    }
    return n;
  }
}
