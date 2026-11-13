/**
 * Pinch detector on thumb-tip ↔ index-tip distance with hysteresis and a
 * tracking-loss grace window. Pure logic: feed it one sample per frame.
 */
export interface PinchConfig {
  engageM: number;
  releaseM: number;
  trackingLossS: number;
}

export type PinchEdge = 'none' | 'start' | 'end';

export class PinchDetector {
  pinching = false;
  /** Seconds since the last tracked sample. */
  untrackedFor = 0;
  constructor(public cfg: PinchConfig, public scale = 1) {}

  /**
   * @param distance thumb–index distance in metres, or null when the hand
   *   (or either joint) is not tracked this frame.
   */
  update(distance: number | null, dt: number): PinchEdge {
    if (distance === null) {
      this.untrackedFor += dt;
      if (this.pinching && this.untrackedFor > this.cfg.trackingLossS) {
        this.pinching = false;
        return 'end';
      }
      return 'none';
    }
    this.untrackedFor = 0;
    if (!this.pinching && distance < this.cfg.engageM * this.scale) {
      this.pinching = true;
      return 'start';
    }
    if (this.pinching && distance > this.cfg.releaseM * this.scale) {
      this.pinching = false;
      return 'end';
    }
    return 'none';
  }

  reset(): void {
    this.pinching = false;
    this.untrackedFor = 0;
  }
}
