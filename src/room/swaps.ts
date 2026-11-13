/**
 * The swap gesture: a pinch that starts close to a found instrument and is held still changes it, once per pinch.
 * Pure logic over hand samples (unit-tested); the room decides what "close" is and what a change does.
 */
import { Vector3 } from '@iwsdk/core';
import type { PinchEdge } from '../input/pinch.js';

export interface PinchHand {
  readonly tracked: boolean;
  readonly pinch: { readonly pinching: boolean };
  readonly edge: PinchEdge;
  readonly pinchPoint: Vector3;
}

/** Held this long (s), within this of where it started (m). */
export const SWAP_HOLD_S = 0.7;
export const SWAP_DRIFT_M = 0.05;

export class SwapGesture<T> {
  private holds = [0, 1].map(() => ({ target: null as T | null, t0: 0, at: new Vector3() }));

  /**
   * One frame. `nearest` finds what a pinch starting at a point would change (null: nothing in reach); `started`
   * is told when a hold begins (to show it). Returns what to change this frame, if a hold just completed.
   */
  update(hands: readonly PinchHand[], enabled: boolean, now: number, nearest: (p: Vector3) => T | null, started: (t: T) => void): T | null {
    let done: T | null = null;
    for (let i = 0; i < this.holds.length; i++) {
      const h = hands[i];
      const w = this.holds[i];
      if (!enabled || !h || !h.tracked || !h.pinch.pinching) {
        w.target = null;
        continue;
      }
      if (w.target === null) {
        if (h.edge !== 'start') continue;
        const t = nearest(h.pinchPoint);
        if (t === null) continue;
        w.target = t;
        w.t0 = now;
        w.at.copy(h.pinchPoint);
        started(t);
        continue;
      }
      if (h.pinchPoint.distanceTo(w.at) > SWAP_DRIFT_M) {
        w.target = null;
        continue;
      }
      if (now - w.t0 >= SWAP_HOLD_S) {
        done = w.target;
        // one change per pinch: let go and pinch again for the next
        w.t0 = Infinity;
      }
    }
    return done;
  }
}
