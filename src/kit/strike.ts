/**
 * Strike detection (pure; the heart of the game). Fed one hand sample per frame in a surface's own
 * frame (y = height above the surface along its normal: a table, a wall, a door, a window), it reports
 * a strike on the first frame that either holds:
 *
 * - **cross:** the hand's lowest point passes through the surface moving toward it at minSpeed or more;
 * - **stop:** the lowest point is within nearM of the surface and its approach speed collapses
 *   (deceleration ≥ minDecel). Hand tracking often loses the last centimetre, so the stop is what
 *   usually fires on a headset: the real surface stops the real hand.
 *
 * Hardened for real tracking:
 * - a dropout of up to `dropoutS` keeps the hand's state; a hand that comes back at the surface after
 *   coming down fast is a (late) strike, not nothing;
 * - samples the tracker repeats (30 Hz under a 72 Hz frame) are skipped; speeds use the time since the
 *   last sample that changed, so they never read high;
 * - a frame hitch (dt over 50 ms) skips detection for that frame instead of reading a huge speed;
 * - resting is the height staying within a few millimetres over a time window (not frame speed, which
 *   jitter dominates);
 * - one slap is one hit: a latch, a lift to re-arm, and soon after a hit only a genuinely new strike
 *   (at least 70% of its speed) counts, so a natural rebound never doubles;
 * - no hit from a hand that only hovers, however sharply it stops above the surface.
 *
 * The surface height is learned from where hands actually stop (within surfaceDriftM of the estimate).
 * Strike times are back-dated to the contact. Allocation-free per frame.
 */
import { STRIKE } from '../config.js';

/** A tracked point on the hand (surface-local metres); r is its joint radius (its bottom is y − r). */
export interface Point {
  x: number;
  y: number;
  z: number;
  r: number;
}

export interface HandSample {
  tracked: boolean;
  /** A hand holding something (moving a pad, a tile) never strikes. */
  pinching: boolean;
  /** Palm centre first, then fingertips and knuckles. Same length every frame. */
  points: readonly Point[];
}

export type StrikeKind = 'cross' | 'stop' | 'late';

export interface Strike {
  kind: StrikeKind;
  /** Peak approach speed just before contact (m/s). */
  speed: number;
  /** Loudness 0..1 from the speed (about 24 dB from the softest to the hardest). */
  gain: number;
  /** Index of the lowest point at contact (into HandSample.points). */
  point: number;
  /** The lowest point's height above the learned surface at contact (m). */
  height: number;
  /** When it touched (the caller's clock, back-dated from the frame that saw it). */
  t: number;
}

export type StrikeConfig = { -readonly [K in keyof typeof STRIKE]: number };

const MAX_POINTS = 8;
/** Seconds of height history used for resting and stillness. */
const WINDOW_S = 0.36;
const HIST = 48;
/** A strike must have come down at least this far within the last 110 ms (jitter is a millimetre or two). */
const MIN_DESCENT = 0.008;
/** A sample is a repeat when no point moved more than this since the last one. */
const SAME_M = 0.0001;

class HandTrack {
  have = false;
  trackedFor = 0;
  /** Seconds since tracking was lost (0 while tracked). */
  lostFor = 0;
  readonly prevY = new Float64Array(MAX_POINTS);
  readonly prevX = new Float64Array(MAX_POINTS);
  readonly prevZ = new Float64Array(MAX_POINTS);
  /** Seconds since the last sample that changed. */
  sinceSample = 0;
  /** Approach speed of the lowest point over the last samples (m/s, + = toward the surface). */
  down0 = 0;
  down1 = 0;
  down2 = 0;
  side1 = 0;
  prevH = Infinity;
  /** History ring: time, lowest height, x, z. */
  readonly ht = new Float64Array(HIST);
  readonly hh = new Float64Array(HIST);
  readonly hx = new Float64Array(HIST);
  readonly hz = new Float64Array(HIST);
  hn = 0;
  hi = 0;
  armed = false;
  resting = false;
  lastHitT = -Infinity;
  lastHitSpeed = 0;
  /** Approach speed just before tracking was lost. */
  fallingWhenLost = 0;
  readonly out: Strike = { kind: 'stop', speed: 0, gain: 0, point: 0, height: 0, t: 0 };

  reset(): void {
    this.have = false;
    this.trackedFor = 0;
    this.lostFor = 0;
    this.sinceSample = 0;
    this.down0 = this.down1 = this.down2 = 0;
    this.side1 = 0;
    this.prevH = Infinity;
    this.hn = 0;
    this.armed = false;
    this.resting = false;
    this.fallingWhenLost = 0;
  }

  push(t: number, h: number, x: number, z: number): void {
    this.ht[this.hi] = t;
    this.hh[this.hi] = h;
    this.hx[this.hi] = x;
    this.hz[this.hi] = z;
    this.hi = (this.hi + 1) % HIST;
    if (this.hn < HIST) this.hn++;
  }
}

/** Loudness from approach speed: about 24 dB from the softest strike to a hard slap. */
export function speedToGain(speed: number, cfg: Pick<StrikeConfig, 'minSpeed' | 'hardSpeed'> = STRIKE): number {
  const lo = cfg.minSpeed * 0.8;
  const k = Math.min(1, Math.max(0, (speed - lo) / (cfg.hardSpeed - lo)));
  return Math.pow(10, (-(1 - Math.pow(k, 0.6)) * 24) / 20);
}

export class StrikeDetector {
  /** Learned surface height in surface-local y (0 = the estimate). */
  surfaceY = 0;
  /**
   * Only a stop counts, never passing through (a door frame that may be an open doorway, the face of a
   * room-scan box): a hand going through it is reaching, not hitting.
   */
  stopOnly = false;
  readonly cfg: StrikeConfig;
  private tracks: [HandTrack, HandTrack] = [new HandTrack(), new HandTrack()];
  /** Strikes reported, per kind (debug). */
  readonly counts = { cross: 0, stop: 0, late: 0 };

  constructor(cfg: Partial<StrikeConfig> = {}) {
    this.cfg = { ...STRIKE, ...cfg };
  }

  /** Forget the learned surface (the kit moved). */
  resetSurface(y = 0): void {
    this.surfaceY = y;
  }

  /** Forget a hand (it went out of range of this surface). */
  forget(hand: 0 | 1): void {
    this.tracks[hand].reset();
  }

  isResting(hand: 0 | 1): boolean {
    return this.tracks[hand].resting;
  }

  isArmed(hand: 0 | 1): boolean {
    return this.tracks[hand].armed;
  }

  /**
   * @param hand 0 = left, 1 = right
   * @param t the caller's clock (s), the same one hits are timed on
   * @param dt the real time since the last frame (s)
   * @returns this hand's Strike (a reused object) on a strike frame, else null
   */
  update(hand: 0 | 1, s: HandSample, t: number, dt: number): Strike | null {
    const tr = this.tracks[hand];
    const cfg = this.cfg;
    const n = Math.min(s.points.length, MAX_POINTS);
    if (!s.tracked || n === 0) {
      if (tr.have) {
        if (tr.lostFor === 0) tr.fallingWhenLost = Math.max(tr.down0, tr.down1);
        tr.lostFor += dt;
        if (tr.lostFor > cfg.dropoutS) tr.reset();
      }
      return null;
    }
    // the lowest point and its height above the learned surface
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
    if (!tr.have) {
      this.store(tr, s, n);
      tr.have = true;
      tr.trackedFor = 0;
      tr.sinceSample = 0;
      tr.prevH = lowH;
      tr.push(t, lowH, p.x, p.z);
      tr.armed = lowH > cfg.rearmM;
      return null;
    }
    // back from a short dropout: if it was coming down fast and is now at the surface, that was the hit
    if (tr.lostFor > 0) {
      const gap = tr.lostFor;
      tr.lostFor = 0;
      const falling = tr.fallingWhenLost;
      this.store(tr, s, n);
      tr.prevH = lowH;
      tr.sinceSample = 0;
      tr.down0 = tr.down1 = tr.down2 = 0;
      tr.push(t, lowH, p.x, p.z);
      if (tr.armed && !s.pinching && falling >= cfg.minSpeed && lowH <= cfg.nearM && t - tr.lastHitT >= cfg.latchS) return this.fire(tr, 'late', falling, low, lowH, t - gap * 0.5);
      return null;
    }
    tr.trackedFor += dt;
    if (dt > 0.05) {
      // a hitch: speeds over this gap mean nothing; start measuring afresh
      this.store(tr, s, n);
      tr.prevH = lowH;
      tr.sinceSample = 0;
      tr.down0 = tr.down1 = tr.down2 = 0;
      tr.push(t, lowH, p.x, p.z);
      return null;
    }
    tr.sinceSample += dt;
    // a repeated sample (the tracker runs slower than the frame): nothing new to measure
    let moved = 0;
    for (let i = 0; i < n; i++) {
      const q = s.points[i];
      const m = Math.abs(q.y - tr.prevY[i]) + Math.abs(q.x - tr.prevX[i]) + Math.abs(q.z - tr.prevZ[i]);
      if (m > moved) moved = m;
    }
    // (a real hand is never perfectly still: an unchanged sample for longer than a 30 Hz tick has truly stopped)
    if (moved < SAME_M && tr.sinceSample < 0.04) return null;
    const span = Math.max(dt, tr.sinceSample);
    const down = (tr.prevY[low] - p.y) / span;
    const side = Math.hypot(p.x - tr.prevX[low], p.z - tr.prevZ[low]) / span;
    const wasH = tr.prevH;
    this.store(tr, s, n);
    tr.sinceSample = 0;
    tr.down2 = tr.down1;
    tr.down1 = tr.down0;
    tr.down0 = down;
    const side1 = tr.side1;
    tr.side1 = side;
    tr.prevH = lowH;
    // history: the highest point of the last 110 ms, and the spread over the rest window
    let recentMax = -Infinity;
    let wMin = Infinity;
    let wMax = -Infinity;
    let xMin = Infinity;
    let xMax = -Infinity;
    let zMin = Infinity;
    let zMax = -Infinity;
    let oldest = t;
    for (let k = 0; k < tr.hn; k++) {
      const age = t - tr.ht[k];
      if (age > WINDOW_S) continue;
      if (age <= 0.11 && tr.hh[k] > recentMax) recentMax = tr.hh[k];
      if (tr.ht[k] < oldest) oldest = tr.ht[k];
      if (tr.hh[k] < wMin) wMin = tr.hh[k];
      if (tr.hh[k] > wMax) wMax = tr.hh[k];
      if (tr.hx[k] < xMin) xMin = tr.hx[k];
      if (tr.hx[k] > xMax) xMax = tr.hx[k];
      if (tr.hz[k] < zMin) zMin = tr.hz[k];
      if (tr.hz[k] > zMax) zMax = tr.hz[k];
    }
    tr.push(t, lowH, p.x, p.z);

    if (tr.trackedFor < cfg.freshS) {
      tr.armed = tr.armed || lowH > cfg.rearmM;
      return null;
    }
    if (s.pinching) {
      tr.armed = false;
      return null;
    }
    // resting: on the surface and still over the window (a judge leaning on the desk)
    const still = t - oldest > WINDOW_S * 0.8 && wMax - wMin < 0.004 && xMax - xMin < 0.006 && zMax - zMin < 0.006;
    if (Math.abs(lowH) < 0.02 && still) {
      tr.resting = true;
      tr.armed = false;
    }
    const lift = tr.resting ? cfg.restLiftM : cfg.rearmM;
    if (lowH > lift) {
      tr.armed = true;
      tr.resting = false;
    }
    if (!tr.armed || t - tr.lastHitT < cfg.latchS) return null;
    if (recentMax - lowH < MIN_DESCENT) return null;
    const peak = Math.max(tr.down1, tr.down2, down);
    // soon after a hit only a genuinely new strike counts (a rebound falls back slower)
    // (`span` back-dates a stop seen only after the samples stopped changing)
    if (t - span - tr.lastHitT < 0.2 && peak < tr.lastHitSpeed * 0.7) return null;
    if (peak < cfg.minSpeed || peak < cfg.downShare * side1) return null;
    if (!this.stopOnly && wasH > 0 && lowH <= 0) {
      // back-date to where it passed through the surface
      const k = wasH / Math.max(1e-6, wasH - lowH);
      return this.fire(tr, 'cross', peak, low, lowH, t - dt * (1 - k));
    }
    const prior = Math.max(tr.down1, tr.down2);
    if (lowH <= cfg.nearM && prior >= cfg.minSpeed && (prior - down) / Math.max(dt, 1e-3) >= cfg.minDecel) {
      this.learn(lowH, cfg.surfaceLearn);
      return this.fire(tr, 'stop', prior, low, lowH, t - span);
    }
    return null;
  }

  private store(tr: HandTrack, s: HandSample, n: number): void {
    for (let i = 0; i < n; i++) {
      tr.prevY[i] = s.points[i].y;
      tr.prevX[i] = s.points[i].x;
      tr.prevZ[i] = s.points[i].z;
    }
  }

  private fire(tr: HandTrack, kind: StrikeKind, speed: number, point: number, height: number, t: number): Strike {
    tr.lastHitT = t;
    tr.lastHitSpeed = speed;
    tr.armed = false;
    tr.resting = false;
    this.counts[kind]++;
    const o = tr.out;
    o.kind = kind;
    o.speed = speed;
    o.gain = speedToGain(speed, this.cfg);
    o.point = point;
    o.height = height;
    o.t = t;
    return o;
  }

  /** Move the learned surface toward a contact seen `h` above it (by share k), within the drift limit. */
  private learn(h: number, k: number): void {
    const d = this.cfg.surfaceDriftM;
    this.surfaceY = Math.min(d, Math.max(-d, this.surfaceY + h * k));
  }
}
