/**
 * Hits on surfaces in the air (a drum head on its stand, a key top, a kick's front head): a tracked point (a
 * fingertip, the palm, a stick's tip) crossing the surface the way you strike it, fast enough, mostly along its
 * normal. Loudness from the crossing speed, measured over three frames (one frame's difference is mostly tracking
 * noise). A point that has played stays "through" every surface until it comes back out by 2 cm: a hand resting on
 * the keys, or jittering on a head, plays once. A crossing too slow to be a hit isn't the end of it: for six frames,
 * while the point is still in, it plays as soon as it's moving fast enough (a gentle press that speeds up, or one the
 * tracking caught early). Keys fire a couple of millimetres in (`confirm`) instead of smoothing the height, so a
 * fingertip's shake can't press one and a press isn't delayed. Measured in tests/air-feel.test.ts.
 * Pure: kit-local coordinates in, hits out; no scene, no audio.
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
  /** Fire only this far through (m; default 0): keys, so a fingertip's tracking shake at the top can't press one. */
  confirm?: number;
  /** A disc tipped toward the player: its normal (unit; default straight up). Only for 'up' discs. */
  nx?: number;
  ny?: number;
  nz?: number;
}

export interface AirHit {
  surface: number;
  point: number;
  /** Crossing speed (m/s) and loudness 0..1. */
  speed: number;
  gain: number;
  /** How far through the surface it is on the frame it played (m): the point that led a slap is deepest. */
  depth: number;
  /** How long ago (s) it crossed: the moment of the hit, between this frame and the last (judge by it). */
  ago: number;
}

/**
 * Below `minSpeed` it's a touch or tracking noise, not a hit (m/s; a face-on surface, struck by reaching, needs
 * `frontSpeed`); `rearm` back out re-arms a point (m); the motion along the normal must be at least `along` of the
 * whole motion (a hand sliding past grazes nothing).
 */
export const AIR = { minSpeed: 0.2, frontSpeed: 0.6, fullSpeed: 1.4, rearm: 0.02, along: 0.6, keyMin: 0.08, stickMin: 0.4 } as const;
/** Frames a too-slow crossing is watched for (while still in) before it's let go. */
const WATCH = 6;

/** How hard a crossing at `speed` m/s sounds (0.15 soft to 1 at `full`). */
export function airGain(speed: number, full: number = AIR.fullSpeed): number {
  return Math.max(0.15, Math.min(1, 0.15 + (0.85 * (speed - 0.3)) / Math.max(0.1, full - 0.3)));
}

function inside(s: AirSurface, x: number, y: number, z: number): boolean {
  // (the crossing point, on the surface: a disc by its distance from the centre in its own plane)
  if (s.r !== undefined) return s.r >= 0 && Math.hypot(x - s.x, y - s.y, z - s.z) <= s.r;
  const b = s.face === 'up' ? z - s.z : y - s.y;
  return Math.abs(x - s.x) <= (s.w ?? 0) / 2 && Math.abs(b) <= (s.d ?? 0) / 2;
}

/** The depth of a point through a surface (+: in front of or above it, −: through it). */
function side(s: AirSurface, x: number, y: number, z: number): number {
  if (s.face === 'up' && s.nx !== undefined) return (x - s.x) * s.nx + (y - s.y) * (s.ny ?? 1) + (z - s.z) * (s.nz ?? 0);
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
  /** Per point and surface id: frames left watching a crossing that was too slow (0: not watching). */
  private slow: Uint8Array;

  constructor(readonly points: number) {
    this.prev = new Float32Array(points * 3);
    this.prev2 = new Float32Array(points * 3);
    this.prevDt = new Float32Array(points);
    this.seen = new Uint8Array(points);
    this.through = new Uint8Array(points * IDS);
    this.slow = new Uint8Array(points * IDS);
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
      if (!this.seen[p])
        for (const s of surfaces) {
          this.through[p * IDS + s.id] = side(s, x, y, z) < 0 ? 1 : 0;
          this.slow[p * IDS + s.id] = 0;
        }
      this.seen[p]++;
      return 0;
    }
    const moved = Math.hypot(x - px, y - py, z - pz);
    for (const s of surfaces) {
      const t = p * IDS + s.id;
      const now = side(s, x, y, z);
      if (this.through[t]) {
        if (now > (s.rearm ?? AIR.rearm)) {
          this.through[t] = 0;
          this.slow[t] = 0;
        }
        continue;
      }
      const c = s.confirm ?? 0;
      const was = side(s, px, py, pz);
      const crossed = was + c > 0 && now + c <= 0;
      let watching = this.slow[t] > 0;
      // (back out without having played: free to cross again)
      if (watching && now > 0) {
        this.slow[t] = 0;
        watching = false;
      }
      if (!crossed && !watching) continue;
      // where it crossed, on the surface (watching: where it is)
      const f = crossed ? (was + c) / (was - now) : 1;
      const cx = px + (x - px) * f;
      const cy = py + (y - py) * f;
      const cz = pz + (z - pz) * f;
      if (!inside(s, cx, cy, cz)) {
        this.slow[t] = 0;
        continue;
      }
      // the speed into it over the last two frames
      const span = dt + qdt;
      const speed = span > 0 ? (side(s, qx, qy, qz) - now) / span : 0;
      if (speed < (s.face === 'front' ? Math.max(min, AIR.frontSpeed) : min)) {
        // too slow yet: watched a few frames while it's still in (then it's resting, and plays nothing)
        if (!watching) this.slow[t] = WATCH;
        else if (--this.slow[t] === 0) this.through[t] = 1;
        continue;
      }
      // most of the motion must be into it, not across (a hand sliding past grazes nothing)
      if (moved > 0 && was - now < (s.along ?? AIR.along) * moved) {
        this.through[t] = 1;
        this.slow[t] = 0;
        continue;
      }
      out.push({ surface: s.id, point: p, speed, gain: airGain(speed, full), depth: -now, ago: crossed ? (1 - f) * dt : 0 });
      // one note per finger: nothing under it plays until it comes back out
      for (const q of surfaces) {
        this.through[p * IDS + q.id] = 1;
        this.slow[p * IDS + q.id] = 0;
      }
      return 1;
    }
    return 0;
  }
}
