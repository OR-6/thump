/**
 * "Find the table" placement state machine (pure).
 *
 * Feed it palm samples each frame. When a palm is flat (wrist +Y close to
 * world up) and still for `stillSeconds`, it proposes a desk height from the
 * palm height minus the palm-to-surface offset, snapped to a detected
 * horizontal plane within ±planeSnapM.
 */
import { PLACE } from '../config.js';

export interface PalmSample {
  /** Palm centre (middle-finger metacarpal), world metres. */
  x: number;
  y: number;
  z: number;
  /** Joint radius ≈ palm half-thickness, metres. */
  radius: number;
  /** wrist +Y · world up (1 = back of hand straight up = palm down). */
  upDot: number;
}

export type PlacementPhase = 'waiting' | 'steadying' | 'placed';

export class Placement {
  /** When a flat palm was last turned down for its height (ms, performance.now()). */
  rejectedAt = -1e9;
  phase: PlacementPhase = 'waiting';
  /** 0..1 progress of the stillness hold, for the hint ring. */
  progress = 0;
  deskY: number | null = null;
  source: 'palm' | 'plane' | 'default' | 'fixed' | null = null;
  private stillFor = 0;
  /** Anchor of the current stillness window and a smoothed palm. */
  private ax = 0;
  private ay = 0;
  private az = 0;
  private sx = 0;
  private sy = 0;
  private sz = 0;
  private has = false;
  /** Where the palm rested when placed (for kitPose). */
  palmX = 0;
  palmZ = 0;

  constructor(private cfg = PLACE) {}

  /**
   * @param palm  palm sample, or null when no hand is tracked.
   * @param planeYs  heights of detected horizontal planes (table/desk).
   */
  update(
    palm: PalmSample | null,
    planeYs: readonly number[],
    dt: number,
    headY: number = Number.NaN,
  ): boolean {
    if (this.phase === 'placed') return false;
    // A desk is 25–62 cm below the eyes when seated (85 cm if a detected
    // table plane under the palm agrees). Rejects palms held up in the air
    // and palms resting on a lap.
    const drop = headY - (palm?.y ?? 0);
    const planeAgrees =
      !!palm && planeYs.some((y) => Math.abs(y - (palm.y - palm.radius)) <= this.cfg.planeSnapM);
    const maxDrop = planeAgrees ? this.cfg.maxDropWithPlane : this.cfg.maxDrop;
    const plausible = Number.isNaN(headY) || (drop >= this.cfg.minDrop && drop <= maxDrop);
    if (!palm || palm.upDot < this.cfg.flatDot || !plausible) {
      // a flat palm at an unlikely height (on a lap, or standing at a low table): remember it, to say why
      this.rejectedAt = palm && palm.upDot >= this.cfg.flatDot && !plausible ? performance.now() : this.rejectedAt;
      this.reset();
      return false;
    }
    // Smooth the palm a little, then require it to stay inside a small circle
    // around where the hold started; jitter can't break that, movement can.
    if (!this.has) {
      this.sx = this.ax = palm.x;
      this.sy = this.ay = palm.y;
      this.sz = this.az = palm.z;
      this.stillFor = 0;
      this.has = true;
    } else {
      const k = Math.min(1, dt * 12);
      this.sx += (palm.x - this.sx) * k;
      this.sy += (palm.y - this.sy) * k;
      this.sz += (palm.z - this.sz) * k;
      const drift = Math.hypot(this.sx - this.ax, this.sy - this.ay, this.sz - this.az);
      if (drift > this.cfg.stillRadiusM) {
        this.ax = this.sx;
        this.ay = this.sy;
        this.az = this.sz;
        this.stillFor = 0;
      } else {
        this.stillFor += dt;
      }
    }
    this.phase = 'steadying';
    this.progress = Math.min(1, this.stillFor / this.cfg.stillSeconds);
    if (this.stillFor >= this.cfg.stillSeconds) {
      this.palmX = this.sx;
      this.palmZ = this.sz;
      const fromPalm = this.sy - palm.radius;
      const snap = nearest(planeYs, fromPalm);
      if (snap !== null && Math.abs(snap - fromPalm) <= this.cfg.planeSnapM) {
        this.place(snap, 'plane');
      } else {
        this.place(fromPalm, 'palm');
      }
      return true;
    }
    return false;
  }

  place(y: number, source: NonNullable<Placement['source']>): void {
    this.deskY = y;
    this.source = source;
    this.phase = 'placed';
    this.progress = 1;
  }

  /** Fallback: no hand → default desk height below the head. */
  placeDefault(headY: number): void {
    this.place(headY - this.cfg.defaultDrop, 'default');
  }

  private reset(): void {
    this.phase = 'waiting';
    this.stillFor = 0;
    this.progress = 0;
    this.has = false;
  }
}

function nearest(values: readonly number[], v: number): number | null {
  let best: number | null = null;
  for (const x of values) if (best === null || Math.abs(x - v) < Math.abs(best - v)) best = x;
  return best;
}

/**
 * Kit pose: centred where the palm rested when known (clamped to seated reach), otherwise straight
 * ahead. The kit faces the player. Pure: shared by the kit system and the reach test.
 */
export function kitPose(
  head: { x: number; z: number },
  fwd: { x: number; z: number },
  deskY: number,
  palm: { x: number; z: number } | null = null,
  cfg = PLACE,
): { x: number; y: number; z: number; yaw: number } {
  // right = fwd × up = (-fwd.z, 0, fwd.x)
  const rx = -fwd.z;
  const rz = fwd.x;
  let ahead: number = cfg.forward;
  let lateral = 0;
  if (palm) {
    const dx = palm.x - head.x;
    const dz = palm.z - head.z;
    ahead = Math.min(cfg.maxForward, Math.max(cfg.minForward, dx * fwd.x + dz * fwd.z));
    lateral = Math.min(cfg.maxLateral, Math.max(-cfg.maxLateral, dx * rx + dz * rz));
  }
  return {
    x: head.x + fwd.x * ahead + rx * lateral,
    y: deskY,
    z: head.z + fwd.z * ahead + rz * lateral,
    yaw: Math.atan2(-fwd.x, -fwd.z),
  };
}
