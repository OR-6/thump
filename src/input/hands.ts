/**
 * HandTrackerSystem: reads raw WebXR hand joints every frame (see
 * docs/IWSDK-NOTES.md §a) and publishes filtered, allocation-free per-hand
 * state for the game systems. Runs before every gameplay system.
 *
 * `?noise=1` injects σ≈3 mm jitter and 2% dropouts ≥150 ms (spec §6).
 */
import { reportFrameError } from '../app/safe.js';
import { createSystem, Quaternion, Vector3 } from '@iwsdk/core';
import { PINCH } from '../config.js';
import { OneEuro3 } from './one-euro.js';
import { PinchDetector, type PinchEdge } from './pinch.js';

export type Side = 'left' | 'right';

/** The joints read each frame: thumb tip, index tip, wrist, middle metacarpal, middle tip, ring tip, middle, index and pinky knuckles. */
const JOINTS: XRHandJoint[] = [
  'thumb-tip',
  'index-finger-tip',
  'wrist',
  'middle-finger-metacarpal',
  'middle-finger-tip',
  'ring-finger-tip',
  'middle-finger-phalanx-proximal',
  'index-finger-phalanx-proximal',
  'pinky-finger-phalanx-proximal',
];

export class HandState {
  tracked = false;
  /** Thumb–index distance (m), or null when untracked. */
  pinchDist: number | null = null;
  readonly pinch = new PinchDetector(PINCH);
  edge: PinchEdge = 'none';
  /** Filtered pinch point (thumb/index midpoint), world space. */
  readonly pinchPoint = new Vector3();
  /** Unfiltered thumb/index midpoint, world space. */
  readonly rawPinch = new Vector3();
  readonly indexTip = new Vector3();
  readonly indexVel = new Vector3();
  readonly palm = new Vector3();
  palmRadius = 0.02;
  /** Raw fingertips (world): index is indexTip above; middle and ring for strikes. */
  readonly middleTip = new Vector3();
  readonly ringTip = new Vector3();
  /** Index and pinky knuckles (world): a flat slap lands on these too. */
  readonly knuckleIndex = new Vector3();
  readonly knucklePinky = new Vector3();
  /** Fingertip joint radius (m). */
  tipRadius = 0.008;
  /** wrist +Y · world up. */
  upDot = 0;
  readonly filter = new OneEuro3(PINCH.oneEuro);
  /** Seconds this hand has been tracked continuously. */
  trackedFor = 0;
  /** This side is a controller, not a tracked hand (its tip pokes, its trigger pinches). */
  controller = false;
}

/** How far ahead of a controller's ray origin its "fingertip" sits (m). */
const CONTROLLER_TIP = 0.045;
/** A released trigger reads as a wide-open pinch (beyond the release threshold even at the largest fit). */
const CONTROLLER_OPEN = 0.09;

export const hands: Record<Side, HandState> = {
  left: new HandState(),
  right: new HandState(),
};

/** Calibration multiplier (1.0–1.8); scales pinch thresholds and radii. */
export const calibration = { scale: 1, radiusMul: 1 };

/** Apply a "Fit to my hands" result (or defaults) to live input. */
export function applyCalibration(c?: { pinchScale: number; radiusMul: number; minCutoff: number }): void {
  calibration.scale = c?.pinchScale ?? 1;
  calibration.radiusMul = c?.radiusMul ?? 1;
  const p = { ...PINCH.oneEuro, minCutoff: c?.minCutoff ?? PINCH.oneEuro.minCutoff };
  hands.left.filter.setParams(p);
  hands.right.filter.setParams(p);
}

const NOISE = new URLSearchParams(location.search).get('noise') === '1';

function gauss(): number {
  // Box–Muller
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export class HandTrackerSystem extends createSystem({}) {
  private tmpThumb = new Vector3();
  private tmpIndex = new Vector3();
  private prevIndex = new Vector3();
  private rawVel = new Vector3();
  private q = new Quaternion();
  private up = new Vector3();
  private seen: Record<Side, boolean> = { left: false, right: false };
  private fwd = new Vector3();
  private handSide: Record<Side, boolean> = { left: false, right: false };
  private dropout: Record<Side, number> = { left: 0, right: 0 };

  private jointSpaces: Record<Side, XRJointSpace[]> = { left: [], right: [] };
  private joints: Record<Side, Vector3[]> = { left: JOINTS.map(() => new Vector3()), right: JOINTS.map(() => new Vector3()) };
  private radii: Record<Side, Float32Array> = { left: new Float32Array(JOINTS.length), right: new Float32Array(JOINTS.length) };
  private poses: Record<Side, Float32Array> = { left: new Float32Array(JOINTS.length * 16), right: new Float32Array(JOINTS.length * 16) };
  private wristUp: Record<Side, number> = { left: 0, right: 0 };

  /** Read the joints into `joints`/`radii`/`wristUp`; false if any pose is missing this frame. */
  private readJoints(frame: XRFrame, ref: XRReferenceSpace, side: Side): boolean {
    const sp = this.jointSpaces[side];
    const out = this.joints[side];
    const rad = this.radii[side];
    const f = frame as XRFrame & { fillPoses?: (s: XRSpace[], b: XRSpace, o: Float32Array) => boolean; fillJointRadii?: (s: XRJointSpace[], o: Float32Array) => boolean };
    if (f.fillPoses && f.fillJointRadii) {
      const m = this.poses[side];
      if (f.fillPoses(sp, ref, m) && f.fillJointRadii(sp, rad)) {
        for (let k = 0; k < out.length; k++) out[k].set(m[k * 16 + 12], m[k * 16 + 13], m[k * 16 + 14]);
        // the wrist's up (its matrix's second column), as the world's up sees it
        this.wristUp[side] = m[2 * 16 + 5];
        return true;
      }
    }
    for (let k = 0; k < out.length; k++) {
      const p = frame.getJointPose?.(sp[k], ref);
      if (!p) return false;
      const t = p.transform.position;
      out[k].set(t.x, t.y, t.z);
      rad[k] = p.radius ?? 0;
      if (k === 2) {
        const o = p.transform.orientation;
        this.q.set(o.x, o.y, o.z, o.w);
        this.wristUp[side] = this.up.set(0, 1, 0).applyQuaternion(this.q).y;
      }
    }
    return true;
  }

  update(delta: number) {
    try {
      this.step(delta);
    } catch (e) {
      reportFrameError('HandTracker', e);
    }
  }

  private step(delta: number) {
    const frame = this.xrFrame;
    const session = frame?.session;
    const ref = this.renderer.xr.getReferenceSpace();
    this.seen.left = this.seen.right = false;

    if (frame && session && ref && frame.getJointPose) {
      // a tracked hand on a side always wins over a controller there
      this.handSide.left = this.handSide.right = false;
      for (const src of session.inputSources) if (src.hand && (src.handedness === 'left' || src.handedness === 'right')) this.handSide[src.handedness] = true;
      for (const src of session.inputSources) {
        if (src.handedness !== 'left' && src.handedness !== 'right') continue;
        if (!src.hand) {
          if (src.gamepad && !this.handSide[src.handedness]) this.readController(src, frame, ref, delta);
          continue;
        }
        const side = src.handedness;
        if (NOISE) {
          if (this.dropout[side] > 0) {
            this.dropout[side] -= delta;
            continue;
          }
          if (Math.random() < 0.02 * delta * 72) {
            this.dropout[side] = 0.15 + Math.random() * 0.1;
            continue;
          }
        }
        // the nine joints we use, in one batched read where the browser has it (no objects made per frame),
        // else one pose at a time
        const sp = this.jointSpaces[side];
        let all = true;
        for (let k = 0; k < JOINTS.length; k++) {
          const js = src.hand.get(JOINTS[k]);
          if (!js) all = false;
          else sp[k] = js;
        }
        if (!all) continue;
        if (!this.readJoints(frame, ref, side)) continue;
        const J = this.joints[side];
        const tp = J[0];
        const ip = J[1];
        const mp = J[3];
        const mtp = J[4];
        const rtp = J[5];
        const mkp = J[6];
        const ikp = J[7];
        const pkp = J[8];
        this.seen[side] = true;
        const h = hands[side];
        h.controller = false;
        this.tmpThumb.copy(tp);
        this.tmpIndex.copy(ip);
        if (NOISE) {
          const s = 0.003;
          this.tmpThumb.x += gauss() * s;
          this.tmpThumb.y += gauss() * s;
          this.tmpThumb.z += gauss() * s;
          this.tmpIndex.x += gauss() * s;
          this.tmpIndex.y += gauss() * s;
          this.tmpIndex.z += gauss() * s;
        }
        h.pinchDist = this.tmpThumb.distanceTo(this.tmpIndex);
        h.rawPinch.set(
          (this.tmpThumb.x + this.tmpIndex.x) / 2,
          (this.tmpThumb.y + this.tmpIndex.y) / 2,
          (this.tmpThumb.z + this.tmpIndex.z) / 2,
        );
        this.prevIndex.copy(h.indexTip);
        h.indexTip.copy(this.tmpIndex);
        if (h.tracked && delta > 0) {
          // Smoothed fingertip velocity: raw frame differences are mostly noise.
          this.rawVel.subVectors(h.indexTip, this.prevIndex).divideScalar(delta);
          h.indexVel.lerp(this.rawVel, 0.35);
        } else {
          h.indexVel.set(0, 0, 0);
        }
        // the palm's true centre: halfway from the middle metacarpal (near the wrist) to its knuckle
        h.palm.set((mp.x + mkp.x) / 2, (mp.y + mkp.y) / 2, (mp.z + mkp.z) / 2);
        h.knuckleIndex.copy(ikp);
        h.knucklePinky.copy(pkp);
        h.palmRadius = this.radii[side][3] || 0.02;
        h.tipRadius = this.radii[side][1] || 0.008;
        h.middleTip.copy(mtp);
        h.ringTip.copy(rtp);
        h.upDot = this.wristUp[side];
      }
    }

    for (const side of ['left', 'right'] as const) {
      const h = hands[side];
      if (!this.seen[side]) h.controller = false;
      h.pinch.scale = calibration.scale;
      // a hand put down for a controller (or picked up again): its points jump, so it starts afresh, untracked
      // for a frame, rather than reading the jump as a slap
      const switched = this.seen[side] && h.controller !== this.wasController[side];
      this.wasController[side] = h.controller;
      if (this.seen[side] && !switched) {
        const wasTracked = h.tracked;
        h.trackedFor = h.tracked ? h.trackedFor + delta : 0;
        h.tracked = true;
        h.edge = h.pinch.update(h.pinchDist, delta);
        // On pinch start (or re-acquire) snap the filter to the raw point so
        // grab hit-testing never uses a lagged open-hand position.
        if (h.edge === 'start' || !wasTracked) h.filter.reset();
        const f = h.filter.filter(h.rawPinch.x, h.rawPinch.y, h.rawPinch.z, Math.max(delta, 1e-4));
        h.pinchPoint.set(f[0], f[1], f[2]);
      } else {
        h.tracked = false;
        h.trackedFor = 0;
        h.pinchDist = null;
        h.indexVel.set(0, 0, 0);
        h.edge = h.pinch.update(null, delta);
      }
    }
  }

  /**
   * A controller in hand plays like a hand: a point just ahead of it is the fingertip (pokes) and
   * the pinch point, the trigger closes the "pinch" (through the same hysteresis), and holding the
   * trigger with it resting on the desk counts as a flat palm (to set the kit down).
   */
  private wasController = { left: false, right: false };

  private readController(src: XRInputSource, frame: XRFrame, ref: XRReferenceSpace, delta: number) {
    const side = src.handedness as Side;
    if (this.seen[side]) return; // a tracked hand on that side wins
    const rp = frame.getPose(src.targetRaySpace, ref);
    if (!rp || !src.gamepad) return;
    this.seen[side] = true;
    const h = hands[side];
    const fresh = !h.controller;
    h.controller = true;
    const p = rp.transform.position;
    const o = rp.transform.orientation;
    this.q.set(o.x, o.y, o.z, o.w);
    this.fwd.set(0, 0, -1).applyQuaternion(this.q);
    this.tmpIndex.set(p.x, p.y, p.z).addScaledVector(this.fwd, CONTROLLER_TIP);
    const trigger = src.gamepad.buttons[0]?.value ?? 0;
    h.pinchDist = CONTROLLER_OPEN - (CONTROLLER_OPEN - 0.004) * trigger;
    h.rawPinch.copy(this.tmpIndex);
    if (fresh) {
      // a hand just became a controller: no velocity spike, no lagged filter
      h.indexTip.copy(this.tmpIndex);
      h.filter.reset();
    }
    this.prevIndex.copy(h.indexTip);
    h.indexTip.copy(this.tmpIndex);
    if (h.tracked && delta > 0 && !fresh) {
      this.rawVel.subVectors(h.indexTip, this.prevIndex).divideScalar(delta);
      h.indexVel.lerp(this.rawVel, 0.35);
    } else {
      h.indexVel.set(0, 0, 0);
    }
    h.palm.copy(this.tmpIndex);
    h.middleTip.copy(this.tmpIndex);
    h.ringTip.copy(this.tmpIndex);
    h.knuckleIndex.copy(this.tmpIndex);
    h.knucklePinky.copy(this.tmpIndex);
    h.tipRadius = 0.01;
    h.palmRadius = 0.02; // a resting controller's tip sits a little above the desk (unmeasured: check on a headset)
    h.upDot = trigger > 0.6 ? 1 : 0;
  }
}
