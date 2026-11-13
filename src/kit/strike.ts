/**
 * Strike detection (pure; the heart of the game). Fed one hand sample per frame in kit-local
 * space (y = height above the kit's table plane), it reports a strike on the first frame that
 * either holds:
 *
 * - **cross:** the hand's lowest point crosses the table plane downward at minSpeed or more;
 * - **stop:** the lowest point is within nearM of the table and its downward speed collapses
 *   (deceleration ≥ minDecel). Hand tracking often loses the last centimetre, so the stop is
 *   what usually fires on a headset: the real desk stops the real hand.
 *
 * One slap is one hit (a per-hand latch plus a lift to re-arm). Pinching hands, hands just found
 * by tracking, hands moving mostly sideways (reaching) and hands resting flat never hit.
 *
 * The table's height is learned as you play: every stop and every rest nudges the surface toward
 * where the hand actually stopped (within surfaceDriftM of where the kit was placed), so a plane
 * or palm estimate a centimetre or two off still plays.
 *
 * Allocation-free per frame: each hand reuses its own Strike object.
 */
import { STRIKE } from '../config.js';

/** A tracked point on the hand (kit-local metres); r is its joint radius (its bottom is y − r). */
export interface Point {
  x: number;
  y: number;
  z: number;
  r: number;
}

export interface HandSample {
  tracked: boolean;
  /** A pinching hand is grabbing (moving a pad), never striking. */
  pinching: boolean;
  /** Palm centre first, then fingertips. Same length every frame. */
  points: readonly Point[];
}

export type StrikeKind = 'cross' | 'stop';

export interface Strike {
  kind: StrikeKind;
  /** Peak downward speed just before contact (m/s). */
  speed: number;
  /** Loudness 0..1 from the speed. */
  gain: number;
  /** Index of the lowest point at contact (into HandSample.points). */
  point: number;
  /** The lowest point's height above the learned surface at contact (m). */
  height: number;
  /** Time of the strike (the caller's clock, s). */
  t: number;
}

export type StrikeConfig = { -readonly [K in keyof typeof STRIKE]: number };

const MAX_POINTS = 8;
/** Frames of height history (about 110 ms at 72 Hz). */
const RECENT = 8;
/** A strike must come down at least this far within the recent frames (jitter is a millimetre or two). */
const MIN_DESCENT = 0.008;

class HandTrack {
  have = false;
  trackedFor = 0;
  readonly prevY = new Float64Array(MAX_POINTS);
  readonly prevX = new Float64Array(MAX_POINTS);
  readonly prevZ = new Float64Array(MAX_POINTS);
  /** Downward speed of the lowest point this frame and the two before (m/s, + = down). */
  down0 = 0;
  down1 = 0;
  down2 = 0;
  /** Horizontal speed of the lowest point, last frame. */
  side1 = 0;
  prevH = Infinity;
  /** The lowest point's recent heights (a ring of RECENT frames): a strike needs a real descent, not jitter. */
  readonly recent = new Float64Array(RECENT).fill(-Infinity);
  recentAt = 0;
  armed = false;
  resting = false;
  restFor = 0;
  lastHitT = -Infinity;
  readonly out: Strike = { kind: 'stop', speed: 0, gain: 0, point: 0, height: 0, t: 0 };

  reset(): void {
    this.have = false;
    this.trackedFor = 0;
    this.down0 = this.down1 = this.down2 = 0;
    this.side1 = 0;
    this.prevH = Infinity;
    this.recent.fill(-Infinity);
    this.armed = false;
    this.resting = false;
    this.restFor = 0;
  }
}

/** Loudness from downward speed: soft taps still sound (a child's tap counts). */
export function speedToGain(speed: number, cfg: Pick<StrikeConfig, 'softSpeed' | 'hardSpeed' | 'minGain'> = STRIKE): number {
  const k = Math.min(1, Math.max(0, (speed - cfg.softSpeed) / (cfg.hardSpeed - cfg.softSpeed)));
  // a gentle curve: most of the range is in the soft-to-medium hits people actually play
  return cfg.minGain + (1 - cfg.minGain) * Math.sqrt(k);
}

export class StrikeDetector {
  /** Learned table height in kit-local y (0 = where the kit was placed). */
  surfaceY = 0;
  readonly cfg: StrikeConfig;
  private tracks: [HandTrack, HandTrack] = [new HandTrack(), new HandTrack()];
  /** Strikes reported, per kind (debug). */
  readonly counts = { cross: 0, stop: 0 };

  constructor(cfg: Partial<StrikeConfig> = {}) {
    this.cfg = { ...STRIKE, ...cfg };
  }

  /** Forget the learned surface (the kit moved). */
  resetSurface(y = 0): void {
    this.surfaceY = y;
  }

  /** Is this hand resting flat on the table (no hits until it lifts)? */
  isResting(hand: 0 | 1): boolean {
    return this.tracks[hand].resting;
  }

  /** Is this hand armed (lifted since its last hit)? */
  isArmed(hand: 0 | 1): boolean {
    return this.tracks[hand].armed;
  }

  /**
   * @param hand 0 = left, 1 = right
   * @param t the caller's clock (s), the same one hits are timed on
   * @returns this hand's Strike (reused object) on a strike frame, else null
   */
  update(hand: 0 | 1, s: HandSample, t: number, dt: number): Strike | null {
    const tr = this.tracks[hand];
    const cfg = this.cfg;
    const n = Math.min(s.points.length, MAX_POINTS);
    if (!s.tracked || n === 0) {
      tr.reset();
      return null;
    }
    // the lowest point, its height above the learned surface, and its velocity
    let low = 0;
    let lowH = Infinity;
    for (let i = 0; i < n; i++) {
      const p = s.points[i];
      const h = p.y - p.r - this.surfaceY;
      if (h < lowH) {
        lowH = h;
        low = i;
      }
    }
    const p = s.points[low];
    let down = 0;
    let side = 0;
    if (tr.have && dt > 0) {
      down = (tr.prevY[low] - p.y) / dt;
      side = Math.hypot(p.x - tr.prevX[low], p.z - tr.prevZ[low]) / dt;
    }
    const wasH = tr.prevH;
    const fresh = !tr.have;
    for (let i = 0; i < n; i++) {
      tr.prevY[i] = s.points[i].y;
      tr.prevX[i] = s.points[i].x;
      tr.prevZ[i] = s.points[i].z;
    }
    tr.have = true;
    tr.trackedFor += dt;
    tr.down2 = tr.down1;
    tr.down1 = tr.down0;
    tr.down0 = down;
    const side1 = tr.side1;
    tr.side1 = side;
    tr.prevH = lowH;
    let recentMax = -Infinity;
    for (let i = 0; i < RECENT; i++) if (tr.recent[i] > recentMax) recentMax = tr.recent[i];
    tr.recent[tr.recentAt] = lowH;
    tr.recentAt = (tr.recentAt + 1) % RECENT;

    if (fresh || tr.trackedFor < cfg.freshS) {
      // just found: its first frames jump; it may start armed only if it is clear of the table
      tr.armed = lowH > cfg.rearmM;
      return null;
    }
    if (s.pinching) {
      tr.armed = false; // a grab ends with the hand on the pad: lift before it plays
      tr.restFor = 0;
      return null;
    }

    // resting: flat and still near the table (a judge leaning on the desk). It also tells us where the table is.
    const still = Math.abs(down) < cfg.restSpeed && side < cfg.restSpeed;
    if (lowH < 0.03 && still) {
      tr.restFor += dt;
      if (tr.restFor >= cfg.restS) {
        if (!tr.resting) this.learn(lowH, 0.5);
        tr.resting = true;
        tr.armed = false;
      }
    } else tr.restFor = 0;

    // re-arm by lifting
    const lift = tr.resting ? cfg.restLiftM : cfg.rearmM;
    if (lowH > lift) {
      tr.armed = true;
      tr.resting = false;
    }
    if (!tr.armed || t - tr.lastHitT < cfg.latchS) return null;
    if (recentMax - lowH < MIN_DESCENT) return null;

    // the peak downward speed over the last frames (the contact frame itself has often slowed already)
    const peak = Math.max(tr.down1, tr.down2);
    const mostlyDown = (sp: number) => sp >= cfg.downShare * side1;
    let kind: StrikeKind | null = null;
    let speed = 0;
    if (wasH > 0 && lowH <= 0 && Math.max(down, peak) >= cfg.minSpeed && mostlyDown(Math.max(down, peak))) {
      kind = 'cross';
      speed = Math.max(down, peak);
    } else if (peak >= cfg.minSpeed && mostlyDown(peak) && dt > 0) {
      const decel = (peak - down) / dt;
      // a stop at the table, or a very sharp stop a little above it (the table is higher than we thought)
      const near = lowH <= cfg.nearM;
      const sharpHigh = lowH <= cfg.nearM + 0.015 && decel >= cfg.minDecel * 3 && peak >= cfg.minSpeed * 1.5;
      if ((near || sharpHigh) && decel >= cfg.minDecel) {
        kind = 'stop';
        speed = peak;
      }
    }
    if (!kind) return null;
    tr.lastHitT = t;
    tr.armed = false;
    tr.resting = false;
    tr.restFor = 0;
    // where a hand stops is where the table is
    if (kind === 'stop') this.learn(lowH, cfg.surfaceLearn);
    this.counts[kind]++;
    const o = tr.out;
    o.kind = kind;
    o.speed = speed;
    o.gain = speedToGain(speed, cfg);
    o.point = low;
    o.height = lowH;
    o.t = t;
    return o;
  }

  /** Move the learned surface toward a contact seen `h` above it (by share k), within the drift limit. */
  private learn(h: number, k: number): void {
    const d = this.cfg.surfaceDriftM;
    this.surfaceY = Math.min(d, Math.max(-d, this.surfaceY + h * k));
  }
}
