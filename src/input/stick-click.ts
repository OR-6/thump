/**
 * Two sticks knocked together (a drummer's click): the shafts, each from its butt to its tip, coming within a stick's
 * thickness of each other fast enough. And a clap that the tracking loses at the moment of contact (two hands over
 * each other occlude): palms closing fast and near, then one of them gone, is still a clap. Pure: numbers in, no
 * scene. Measured in tests/stick-click.test.ts.
 */

/** Closer than this (m, between the shafts' centre lines) the sticks touch: two 1.5 cm sticks and a little slack. */
export const CLICK_TOUCH = 0.02;
/** Closing at least this fast (m/s) is a click, not sticks resting crossed. */
export const CLICK_SPEED = 0.25;
/** Apart again by this much (m) before the next click. */
export const CLICK_REARM = 0.04;

/**
 * The closest distance between segments a0–a1 and b0–b1 (each given as x, y, z), no allocation. Also leaves where on
 * each it is (0..1) in `at` if given (for where to put the click's light).
 */
export function segDist(
  a0x: number, a0y: number, a0z: number, a1x: number, a1y: number, a1z: number,
  b0x: number, b0y: number, b0z: number, b1x: number, b1y: number, b1z: number,
  at?: { s: number; t: number },
): number {
  const ux = a1x - a0x, uy = a1y - a0y, uz = a1z - a0z;
  const vx = b1x - b0x, vy = b1y - b0y, vz = b1z - b0z;
  const wx = a0x - b0x, wy = a0y - b0y, wz = a0z - b0z;
  const a = ux * ux + uy * uy + uz * uz;
  const b = ux * vx + uy * vy + uz * vz;
  const c = vx * vx + vy * vy + vz * vz;
  const d = ux * wx + uy * wy + uz * wz;
  const e = vx * wx + vy * wy + vz * wz;
  const den = a * c - b * b;
  let s = den > 1e-12 ? (b * e - c * d) / den : 0;
  s = Math.max(0, Math.min(1, s));
  let t = c > 1e-12 ? (b * s + e) / c : 0;
  if (t < 0) {
    t = 0;
    s = a > 1e-12 ? Math.max(0, Math.min(1, -d / a)) : 0;
  } else if (t > 1) {
    t = 1;
    s = a > 1e-12 ? Math.max(0, Math.min(1, (b - d) / a)) : 0;
  }
  if (at) {
    at.s = s;
    at.t = t;
  }
  const dx = wx + s * ux - t * vx;
  const dy = wy + s * uy - t * vy;
  const dz = wz + s * uz - t * vz;
  return Math.hypot(dx, dy, dz);
}

/** The sticks' click, frame by frame: `update` with the shafts' distance now; true on the frame they knock. */
export class StickClick {
  private prev = Infinity;
  private armed = true;
  reset(): void {
    this.prev = Infinity;
    this.armed = true;
  }
  /** How fast they closed on the frame that clicked (m/s), for how loud. */
  speed = 0;
  update(d: number, dt: number): boolean {
    const prev = this.prev;
    this.prev = d;
    if (d > CLICK_REARM) this.armed = true;
    if (!this.armed || !Number.isFinite(prev) || dt <= 0) return false;
    const closing = (prev - d) / dt;
    if (d <= CLICK_TOUCH && prev > CLICK_TOUCH && closing >= CLICK_SPEED) {
      this.armed = false;
      this.speed = closing;
      return true;
    }
    return false;
  }
}

/**
 * A clap, frame by frame, from the palms' distance (Infinity when either hand isn't tracked). It claps when the palms
 * meet (within 7 cm, closing at 0.7 m/s or more) or when they were closing fast and near (within 15 cm at 1 m/s) on
 * the frame before the tracking lost one of them (hands over each other occlude, right at the moment of contact).
 */
export class ClapWatch {
  private prev = Infinity;
  private closing = 0;
  private armed = true;
  speed = 0;
  /** Seconds until the palms meet (0: now). */
  wait = 0;
  reset(): void {
    this.prev = Infinity;
    this.closing = 0;
    this.armed = true;
  }
  update(d: number, dt: number): boolean {
    const prev = this.prev;
    const was = this.closing;
    this.prev = d;
    if (!Number.isFinite(d)) {
      this.closing = 0;
      // (lost at the moment of contact: it was closing fast and near)
      if (this.armed && Number.isFinite(prev) && prev < 0.15 && was >= 1) {
        this.armed = false;
        this.speed = was;
        this.wait = Math.max(0, Math.min(0.05, (prev - 0.035) / was - dt));
        return true;
      }
      return false;
    }
    if (d > 0.12) this.armed = true;
    if (!Number.isFinite(prev) || dt <= 0) return false;
    this.closing = (prev - d) / dt;
    if (this.armed && d < 0.07 && this.closing > 0.7) {
      this.armed = false;
      this.speed = this.closing;
      this.wait = Math.max(0, Math.min(0.05, (d - 0.035) / Math.max(this.closing, 0.1)));
      return true;
    }
    return false;
  }
}
