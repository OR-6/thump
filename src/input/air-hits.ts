/**
 * Hits on surfaces in the air (a drum head on its stand, a key top, a kick's front head): a tracked point (a
 * fingertip, the palm, a stick's tip) crossing the surface the way you strike it, fast enough, mostly along its
 * normal. Loudness from the crossing speed, measured over three frames (one frame's difference is mostly tracking
 * noise). A point that has played stays "through" every surface until it comes back out by 2 cm: a hand resting on
 * the keys, or jittering on a head, plays once. Pure: kit-local coordinates in, hits out; no scene, no audio.
 */

/** A surface to strike: a disc or a rectangle lying flat at height `y` (struck downward), or a disc standing facing
 * the player at `z` (struck away from you). Kit-local metres: x right, y up, z toward the player. `id` < 64. */
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
  /** How much of the motion must be into it (default AIR.along; a strum brushes across, so less). */
  along?: number;
  /** How far back out a point must come before it can play it again (default AIR.rearm). */
  rearm?: number;
}

export interface AirHit {
  surface: number;
  point: number;
  /** Crossing speed (m/s) and loudness 0..1. */
  speed: number;
  gain: number;
  /** How far through the surface it is on the frame it played (m): the point that led a slap is deepest. */
  depth: number;
}

/**
 * Below `minSpeed` it's a touch or tracking noise, not a hit (m/s; a face-on surface, struck by reaching, needs
 * `frontSpeed`); `rearm` back out re-arms a point (m); the motion along the normal must be at least `along` of the
 * whole motion (a hand sliding past grazes nothing).
 */
export const AIR = { minSpeed: 0.3, frontSpeed: 0.6, fullSpeed: 1.4, rearm: 0.02, along: 0.6 } as const;

/** How hard a crossing at `speed` m/s sounds (0.15 soft to 1 at `full`). */
export function airGain(speed: number, full: number = AIR.fullSpeed): number {
  return Math.max(0.15, Math.min(1, 0.15 + (0.85 * (speed - AIR.minSpeed)) / Math.max(0.1, full - AIR.minSpeed)));
}

function inside(s: AirSurface, a: number, b: number): boolean {
  // (a, b): the crossing point in the surface's own two directions
  const cb = s.face === 'up' ? s.z : s.y;
  if (s.r !== undefined) return s.r >= 0 && Math.hypot(a - s.x, b - cb) <= s.r;
  return Math.abs(a - s.x) <= (s.w ?? 0) / 2 && Math.abs(b - cb) <= (s.d ?? 0) / 2;
}

/** The depth of a point through a surface (+: in front of or above it, −: through it). */
function side(s: AirSurface, x: number, y: number, z: number): number {
  return s.face === 'up' ? y - s.y : z - s.z;
}

const IDS = 64;

export class AirHits {
  private prev: Float32Array;
  private prev2: Float32Array;
  private prevDt: Float32Array;
  private seen: Uint8Array;
  /** Per point and surface id: through it now (waiting to come back out). */
  private through: Uint8Array;

  constructor(readonly points: number) {
    this.prev = new Float32Array(points * 3);
    this.prev2 = new Float32Array(points * 3);
    this.prevDt = new Float32Array(points);
    this.seen = new Uint8Array(points);
    this.through = new Uint8Array(points * IDS);
  }

  /** Forget a point (it went untracked, isn't in use, or changed meaning: a stick appeared). */
  forget(p: number): void {
    this.seen[p] = 0;
  }

  /**
   * Point `p` is now at (x, y, z) after `dt` s. Each surface it crossed the right way, fast enough, inside, is a hit
   * pushed to `out` (at most one: one note per finger). Returns how many were added.
   */
  update(p: number, x: number, y: number, z: number, dt: number, surfaces: readonly AirSurface[], out: AirHit[], full: number = AIR.fullSpeed, min: number = AIR.minSpeed): number {
    const i = p * 3;
    const px = this.prev[i];
    const py = this.prev[i + 1];
    const pz = this.prev[i + 2];
    const qx = this.prev2[i];
    const qy = this.prev2[i + 1];
    const qz = this.prev2[i + 2];
    const qdt = this.prevDt[p];
    this.prev2[i] = px;
    this.prev2[i + 1] = py;
    this.prev2[i + 2] = pz;
    this.prev[i] = x;
    this.prev[i + 1] = y;
    this.prev[i + 2] = z;
    this.prevDt[p] = dt;
    if (this.seen[p] < 2) {
      // (where it starts, or comes back: through a surface already counts as having played it)
      if (!this.seen[p]) for (const s of surfaces) this.through[p * IDS + s.id] = side(s, x, y, z) < 0 ? 1 : 0;
      this.seen[p]++;
      return 0;
    }
    const moved = Math.hypot(x - px, y - py, z - pz);
    for (const s of surfaces) {
      const t = p * IDS + s.id;
      const now = side(s, x, y, z);
      if (this.through[t]) {
        if (now > (s.rearm ?? AIR.rearm)) this.through[t] = 0;
        continue;
      }
      const was = side(s, px, py, pz);
      if (!(was > 0 && now <= 0)) continue;
      // where it crossed, on the surface
      const f = was / (was - now);
      const cx = px + (x - px) * f;
      const cy = py + (y - py) * f;
      const cz = pz + (z - pz) * f;
      if (!inside(s, cx, s.face === 'up' ? cz : cy)) continue;
      this.through[t] = 1;
      // the speed into it over the last two frames; and most of the motion must be into it, not across
      const span = dt + qdt;
      const speed = span > 0 ? (side(s, qx, qy, qz) - now) / span : 0;
      if (speed < (s.face === 'front' ? Math.max(min, AIR.frontSpeed) : min) || (moved > 0 && was - now < (s.along ?? AIR.along) * moved)) continue;
      out.push({ surface: s.id, point: p, speed, gain: airGain(speed, full), depth: -now });
      // one note per finger: nothing under it plays until it comes back out
      for (const q of surfaces) this.through[p * IDS + q.id] = 1;
      return 1;
    }
    return 0;
  }
}
