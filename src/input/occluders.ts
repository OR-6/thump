/**
 * Your real hands, always seen: the game draws over passthrough, so without this your hand vanishes behind anything
 * virtual (a drum, a key, the screen, the room dimmed for a song). Each tracked hand is drawn last as a smooth
 * hand-shaped mask (a capsule along every bone, a ball at every joint, a palm between the knuckles and the wrist), and
 * where it lies over the game, the game is held to at most a third of its strength: about two thirds of what you see
 * there is your real hand, and the key, pad or drum behind your fingers still shows through faintly (where you are on
 * it matters as much as what's under you). It caps, it doesn't layer: overlapping capsules don't make brighter blobs
 * (MIN blending), so it reads as one hand. What's in front of your hand (a stick through your fist, a mallet) stays
 * in front: it's depth-tested. Never turned off for frame rate (it's six small draws); off on a desktop browser, where
 * there's no passthrough and the emulator draws its own hand (?mask=1 turns it on to test it).
 *
 * Also hides IWSDK's own hand mesh on device (you see your real hand in passthrough).
 */
import { reportFrameError } from '../app/safe.js';
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  createSystem,
  CustomBlending,
  CylinderGeometry,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MinEquation,
  Quaternion,
  SRGBColorSpace,
  SphereGeometry,
  Vector3,
} from '@iwsdk/core';

const FINGERS = ['thumb', 'index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'] as const;
const CHAIN = ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'];

/** Bone pairs (joint names): a capsule along each. */
export const BONES: Array<[string, string]> = (() => {
  const pairs: Array<[string, string]> = [];
  for (const f of FINGERS) {
    const chain = CHAIN.filter((j) => !(f === 'thumb' && j === 'phalanx-intermediate')).map((j) => `${f}-${j}`);
    pairs.push(['wrist', chain[0]]);
    for (let i = 0; i + 1 < chain.length; i++) pairs.push([chain[i], chain[i + 1]]);
  }
  return pairs;
})();

/** The palm's outline, round from the wrist (the fan's rim). */
const PALM = ['wrist', 'thumb-metacarpal', 'thumb-phalanx-proximal', 'index-finger-phalanx-proximal', 'middle-finger-phalanx-proximal', 'ring-finger-phalanx-proximal', 'pinky-finger-phalanx-proximal', 'pinky-finger-metacarpal'];

/** A real headset's browser (a dev build opened on a Quest must hide the hand model too). */
const ON_HEADSET = typeof navigator !== 'undefined' && /OculusBrowser|Quest|Pico/i.test(navigator.userAgent);
const FORCED = typeof location !== 'undefined' && /[?&]mask=1\b/.test(location.search);

const JOINTS = 25;
const SIDES = ['left', 'right'] as const;
/** Metres the wrist may move between two frames before it counts as a tracking jump. */
const JUMP = 0.12;
/** Frames a hand's mask stays off after a jump. */
const HOLD_FRAMES = 8;
/** How much of the game shows over your hand, at most (0..1). */
const SHOW = 0.32;

/** On (the room may turn it off; it no longer does for frame rate). */
export const occluderState = { enabled: true };

export class HandOccluderSystem extends createSystem({}) {
  private balls: Record<'left' | 'right', InstancedMesh> = {} as never;
  private sticks: Record<'left' | 'right', InstancedMesh> = {} as never;
  private palms: Record<'left' | 'right', Mesh> = {} as never;
  private m = new Matrix4();
  private q = new Quaternion();
  private p = new Vector3();
  private d = new Vector3();
  private s = new Vector3();
  private c = new Vector3();
  private static readonly UP = new Vector3(0, 1, 0);
  private pos = new Map<string, Vector3>();
  private rad = new Map<string, number>();
  private valid = new Set<string>();
  private seen = { left: false, right: false };
  /** Last wrist position per hand, and frames left with that hand's mask off after a tracking jump. */
  private lastWrist = { left: new Vector3(), right: new Vector3() };
  private hadWrist = { left: false, right: false };
  private hold = { left: 0, right: 0 };
  private on = ON_HEADSET || FORCED;

  init() {
    // what's drawn over the hand is held to SHOW of its strength (as it would show over your real hand); MIN doesn't
    // add up where capsules overlap. The colour cap is in the output's own (sRGB) terms.
    const mat = new MeshBasicMaterial({
      color: new Color().setRGB(SHOW, SHOW, SHOW, SRGBColorSpace),
      transparent: true,
      opacity: SHOW,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
      side: DoubleSide,
      blending: CustomBlending,
      blendEquation: MinEquation,
      blendEquationAlpha: MinEquation,
    });
    const ball = new SphereGeometry(1, 12, 8);
    const stick = new CylinderGeometry(1, 1, 1, 12, 1, true);
    for (const side of SIDES) {
      const balls = new InstancedMesh(ball, mat, JOINTS);
      const sticks = new InstancedMesh(stick, mat, BONES.length);
      const pg = new BufferGeometry();
      // a fan round the palm's centre: the centre then the rim, closed
      pg.setAttribute('position', new BufferAttribute(new Float32Array((PALM.length + 1) * 3), 3));
      const idx: number[] = [];
      for (let k = 0; k < PALM.length; k++) idx.push(0, 1 + k, 1 + ((k + 1) % PALM.length));
      pg.setIndex(idx);
      const palm = new Mesh(pg, mat);
      for (const [o, n] of [[balls, 'Joints'], [sticks, 'Bones'], [palm, 'Palm']] as const) {
        o.name = `HandMask-${side}-${n}`;
        // (drawn last: over the room's dim, the screen and the desk)
        o.renderOrder = 100000;
        o.frustumCulled = false;
        o.visible = false;
        this.world.createTransformEntity(o);
      }
      balls.count = 0;
      sticks.count = 0;
      this.balls[side] = balls;
      this.sticks[side] = sticks;
      this.palms[side] = palm;
    }
    (window as unknown as { __occluders: unknown }).__occluders = { balls: this.balls, sticks: this.sticks, palms: this.palms, state: occluderState, on: this.on };
  }

  update() {
    try {
      this.step();
    } catch (e) {
      reportFrameError('Occluders', e);
    }
  }

  private step() {
    this.hideIwsdkHands();
    const frame = this.xrFrame;
    const ref = this.renderer.xr.getReferenceSpace();
    const seen = this.seen;
    seen.left = seen.right = false;
    if (this.on && occluderState.enabled && frame?.session && ref && frame.getJointPose) {
      for (const src of frame.session.inputSources) {
        if (!src.hand || (src.handedness !== 'left' && src.handedness !== 'right')) continue;
        const side = src.handedness;
        this.valid.clear();
        // In dim light hand tracking can jump: a hand that moved further in one frame than a real hand can keeps
        // its mask off for a moment, so it never shows where the hand isn't.
        const wristSpace = src.hand.get('wrist');
        const wrist = wristSpace ? frame.getJointPose(wristSpace, ref) : undefined;
        if (!wrist) {
          this.hadWrist[side] = false;
          continue;
        }
        const w = wrist.transform.position;
        this.p.set(w.x, w.y, w.z);
        if (this.hadWrist[side] && this.p.distanceTo(this.lastWrist[side]) > JUMP) this.hold[side] = HOLD_FRAMES;
        this.lastWrist[side].copy(this.p);
        this.hadWrist[side] = true;
        if (this.hold[side] > 0) {
          this.hold[side]--;
          continue;
        }
        // every joint in one call where the browser offers it (Quest does): no pose objects to collect each frame
        let spaces = this.spaces[side];
        if (!spaces || this.spaceOf[side] !== src.hand) {
          spaces = [];
          this.names[side] = [];
          for (const [name, space] of src.hand.entries()) {
            spaces.push(space);
            this.names[side].push(name);
          }
          this.spaces[side] = spaces;
          this.spaceOf[side] = src.hand;
          this.poseBuf[side] = new Float32Array(spaces.length * 16);
          this.radBuf[side] = new Float32Array(spaces.length);
        }
        const names = this.names[side];
        const fill = frame as XRFrame & { fillPoses?: (s: XRSpace[], b: XRSpace, out: Float32Array) => boolean; fillJointRadii?: (s: XRJointSpace[], out: Float32Array) => boolean };
        const batched = !!fill.fillPoses && !!fill.fillJointRadii && fill.fillPoses(spaces, ref, this.poseBuf[side]!) && fill.fillJointRadii(spaces as XRJointSpace[], this.radBuf[side]!);
        const balls = this.balls[side];
        let i = 0;
        for (let k = 0; k < spaces.length; k++) {
          const name = names[k];
          let x: number, y: number, z: number, r: number;
          if (batched) {
            const b = this.poseBuf[side]!;
            x = b[k * 16 + 12];
            y = b[k * 16 + 13];
            z = b[k * 16 + 14];
            r = this.radBuf[side]![k] || 0.008;
            if (Number.isNaN(x)) continue; // a joint the browser didn't track this frame
          } else {
            const pose = frame.getJointPose(spaces[k] as XRJointSpace, ref);
            if (!pose) continue;
            x = pose.transform.position.x;
            y = pose.transform.position.y;
            z = pose.transform.position.z;
            r = pose.radius ?? 0.008;
          }
          let v = this.pos.get(name);
          if (!v) this.pos.set(name, (v = new Vector3())); // once per joint name, then reused
          v.set(x, y, z);
          this.rad.set(name, r);
          this.valid.add(name);
          this.m.compose(v, this.q.identity(), this.s.setScalar(r));
          balls.setMatrixAt(i++, this.m);
        }
        balls.count = i;
        balls.instanceMatrix.needsUpdate = true;
        // a capsule's sides along each bone, as thick as its joints
        const sticks = this.sticks[side];
        let j = 0;
        for (const [a, b] of BONES) {
          if (!this.valid.has(a) || !this.valid.has(b)) continue;
          const pa = this.pos.get(a)!;
          const pb = this.pos.get(b)!;
          this.d.subVectors(pb, pa);
          const len = this.d.length();
          if (len < 1e-4) continue;
          this.p.addVectors(pa, pb).multiplyScalar(0.5);
          this.q.setFromUnitVectors(HandOccluderSystem.UP, this.d.multiplyScalar(1 / len));
          const r = ((this.rad.get(a) ?? 0.008) + (this.rad.get(b) ?? 0.008)) / 2;
          this.m.compose(this.p, this.q, this.s.set(r, len, r));
          sticks.setMatrixAt(j++, this.m);
        }
        sticks.count = j;
        sticks.instanceMatrix.needsUpdate = true;
        // the palm: a fan from its centre round the wrist and the knuckles
        const palm = this.palms[side];
        let ok = true;
        this.c.set(0, 0, 0);
        for (const n of PALM) {
          const v = this.pos.get(n);
          if (!v || !this.valid.has(n)) {
            ok = false;
            break;
          }
          this.c.add(v);
        }
        palm.visible = ok;
        if (ok) {
          this.c.multiplyScalar(1 / PALM.length);
          const at = palm.geometry.getAttribute('position') as BufferAttribute;
          at.setXYZ(0, this.c.x, this.c.y, this.c.z);
          for (let k = 0; k < PALM.length; k++) {
            const v = this.pos.get(PALM[k])!;
            at.setXYZ(1 + k, v.x, v.y, v.z);
          }
          at.needsUpdate = true;
        }
        balls.visible = sticks.visible = i > 0;
        seen[src.handedness] = i > 0;
      }
    }
    for (const side of SIDES)
      if (!seen[side]) {
        this.balls[side].count = this.sticks[side].count = 0;
        this.balls[side].visible = this.sticks[side].visible = this.palms[side].visible = false;
      }
  }

  private spaces: Record<string, XRSpace[] | undefined> = {};
  private names: Record<string, string[]> = { left: [], right: [] };
  private spaceOf: Record<string, unknown> = {};
  private poseBuf: Record<string, Float32Array | undefined> = {};
  private radBuf: Record<string, Float32Array | undefined> = {};

  /**
   * Real device: hide IWSDK's hand mesh (passthrough shows the real hand). IWSDK sets the model's `visible` back to
   * true every frame and makes a new model whenever tracking reconnects, and it nudges the model off surfaces it
   * touches, so on a headset a stiff white outline drifted beside the real hand. Take every model off all render
   * layers instead (IWSDK never touches layers), checking each frame for new ones.
   */
  private hideIwsdkHands() {
    if (import.meta.env.DEV && !ON_HEADSET) return; // the desktop emulator has no real hands to see: keep its hand model
    const ad = this.input.xr.visualAdapters?.hand;
    if (!ad) return;
    for (const a of [ad.left, ad.right]) {
      const model = a.visual?.model;
      if (!model || model.userData.thumpHidden) continue;
      model.userData.thumpHidden = true;
      model.traverse((o) => o.layers.disableAll());
    }
  }
}
