/**
 * Frame-time guard (pure). Compares a smoothed frame interval with the
 * session's target interval. Sustained misses step quality down; sustained
 * headroom steps it back up. Hysteresis avoids flapping.
 */
export interface FrameGuardConfig {
  /** Degrade when smoothed interval > target × this. */
  overRatio: number;
  /** Recover when smoothed interval < target × this. */
  underRatio: number;
  degradeAfterS: number;
  recoverAfterS: number;
  maxLevel: number;
}

export const FRAME_GUARD: FrameGuardConfig = {
  overRatio: 1.07, // a few dropped frames in a hundred already show as judder
  underRatio: 1.04,
  degradeAfterS: 2,
  recoverAfterS: 10,
  maxLevel: 2,
};

export class FrameGuard {
  level = 0;
  ema = 0;
  private over = 0;
  private under = 0;
  /** Seconds since the last recovery; a degrade soon after one doubles the next wait (no flapping). */
  private sinceRecover = Infinity;
  private recoverWait: number;

  constructor(private cfg: FrameGuardConfig = FRAME_GUARD) {
    this.recoverWait = cfg.recoverAfterS;
  }

  /** @returns the new level when it changed, else null. */
  sample(delta: number, targetHz: number): number | null {
    if (!(delta > 0) || delta > 0.5) return null; // pauses, tab switches
    const target = 1 / targetHz;
    this.ema = this.ema === 0 ? delta : this.ema + (delta - this.ema) * 0.08;
    this.sinceRecover += delta;
    if (this.ema > target * this.cfg.overRatio) {
      this.over += delta;
      this.under = 0;
      if (this.over >= this.cfg.degradeAfterS && this.level < this.cfg.maxLevel) {
        this.level++;
        this.over = 0;
        // dropped again soon after coming back up: wait longer next time (up to 2 minutes), then stop trying
        if (this.sinceRecover < 30) this.recoverWait = Math.min(120, this.recoverWait * 2);
        return this.level;
      }
    } else if (this.ema < target * this.cfg.underRatio) {
      this.under += delta;
      this.over = 0;
      if (this.under >= this.recoverWait && this.level > 0 && this.recoverWait < 120) {
        this.level--;
        this.under = 0;
        this.sinceRecover = 0;
        return this.level;
      }
    } else {
      this.over = 0;
      this.under = 0;
    }
    return null;
  }
}
