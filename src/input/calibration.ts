/**
 * "Fit to my hands" calibration (pure). Feed raw per-frame samples:
 * thumb–index distance and the raw pinch midpoint.
 *  1. three pinches → comfortable closed aperture (min distance per pinch)
 *     and open aperture;
 *  2. a 2 s still pinch → positional jitter (σ of the midpoint);
 * then derive thresholds, smoothing and a target-radius multiplier.
 * Not validated with disabled players (see README).
 */
export type CalStep = 'pinches' | 'hold' | 'done';

export interface CalResult {
  /** Multiplier for pinch engage/release thresholds (1 = 2.0/3.5 cm). */
  pinchScale: number;
  /** Grab/hover/poke radius multiplier, 1.0–1.8. */
  radiusMul: number;
  /** One-Euro minCutoff (lower = smoother, more lag). */
  minCutoff: number;
  closedMm: number;
  openMm: number;
  jitterMm: number;
}

const ENGAGE = 0.045; // generous: a pinch that can't close far still counts (it's what this is for)
const RELEASE = 0.06;
/** A hold survives a brief opening (a tremor) shorter than this. */
const HOLD_GRACE_S = 0.3;
const HOLD_S = 2;

export class Calibrator {
  step: CalStep = 'pinches';
  pinches = 0;
  holdProgress = 0;
  private openT = 0;
  result: CalResult | null = null;
  private inPinch = false;
  private minThis = Infinity;
  private closed: number[] = [];
  private openMax = 0;
  private holdT = 0;
  private pts: number[][] = [];

  update(distance: number | null, mid: { x: number; y: number; z: number } | null, dt: number): CalStep {
    if (this.step === 'done' || distance === null || !mid) return this.step;
    if (this.step === 'pinches') {
      this.openMax = Math.max(this.openMax, distance);
      if (!this.inPinch && distance < ENGAGE) {
        this.inPinch = true;
        this.minThis = distance;
      } else if (this.inPinch) {
        this.minThis = Math.min(this.minThis, distance);
        if (distance > RELEASE) {
          this.inPinch = false;
          this.closed.push(this.minThis);
          this.pinches++;
          if (this.pinches >= 3) this.step = 'hold';
        }
      }
      return this.step;
    }
    // hold: a pinch held still for HOLD_S seconds
    if (distance < ENGAGE) {
      this.openT = 0;
      this.holdT += dt;
      this.pts.push([mid.x, mid.y, mid.z]);
      this.holdProgress = Math.min(1, this.holdT / HOLD_S);
      if (this.holdT >= HOLD_S) this.finish();
    } else if ((this.openT += dt) > HOLD_GRACE_S) {
      this.holdT = 0;
      this.holdProgress = 0;
      this.pts.length = 0;
    }
    return this.step;
  }

  private finish(): void {
    const closed = this.closed.reduce((a, b) => a + b, 0) / this.closed.length;
    const n = this.pts.length;
    const mean = [0, 1, 2].map((k) => this.pts.reduce((a, p) => a + p[k], 0) / n);
    const varSum = this.pts.reduce(
      (a, p) => a + (p[0] - mean[0]) ** 2 + (p[1] - mean[1]) ** 2 + (p[2] - mean[2]) ** 2,
      0,
    );
    const sigma = Math.sqrt(varSum / n / 3);
    this.result = deriveCalibration(closed, this.openMax, sigma);
    this.step = 'done';
  }
}

export function deriveCalibration(closedM: number, openM: number, jitterM: number): CalResult {
  const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
  // Engage a little above the user's comfortable closed aperture.
  const engage = clamp(closedM + 0.01, 0.015, 0.036);
  const pinchScale = clamp(engage / 0.02, 0.75, 1.8);
  const radiusMul = clamp(1 + (jitterM - 0.0015) / 0.004, 1, 1.8);
  const minCutoff = clamp(1.5 - (jitterM - 0.0015) * 250, 0.5, 1.5);
  return {
    pinchScale,
    radiusMul,
    minCutoff,
    closedMm: Math.round(closedM * 1000),
    openMm: Math.round(openM * 1000),
    jitterMm: Math.round(jitterM * 10000) / 10,
  };
}
