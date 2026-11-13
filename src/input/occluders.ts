/**
 * Hand occluders: invisible, depth-only spheres on every hand joint (plus
 * midpoints along each bone) so virtual threads pass *behind* the player's
 * real fingers in passthrough. Two draw calls (one InstancedMesh per hand).
 *
 * Also hides IWSDK's own hand mesh on device (you see your real hand in
 * passthrough; the spec asks for only a pinch glow). The emulator keeps it.
 */
import { reportFrameError } from '../app/safe.js';
import {
  createSystem,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from '@iwsdk/core';

const FINGERS = ['thumb', 'index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'] as const;
const CHAIN = ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'];

/** Bone pairs (joint names) whose midpoints also get a sphere. */
export const BONES: Array<[string, string]> = (() => {
  const pairs: Array<[string, string]> = [];
  for (const f of FINGERS) {
    const chain = CHAIN.filter((j) => !(f === 'thumb' && j === 'phalanx-intermediate')).map((j) => `${f}-${j}`);
    pairs.push(['wrist', chain[0]]);
    for (let i = 0; i + 1 < chain.length; i++) pairs.push([chain[i], chain[i + 1]]);
  }
  return pairs;
})();

/** A real headset's browser (a dev build opened on a Quest must hide the hand model too). */
const ON_HEADSET = typeof navigator !== 'undefined' && /OculusBrowser|Quest|Pico/i.test(navigator.userAgent);

const JOINTS = 25;
/** Metres the wrist may move between two frames before it counts as a tracking jump. */
const SIDES = ['left', 'right'] as const;
const JUMP = 0.12;
/** Frames a hand's occluders stay off after a jump. */
const HOLD_FRAMES = 8;
const COUNT = JOINTS + BONES.length;

export const occluderState = { enabled: true };

export class HandOccluderSystem extends createSystem({}) {
  private meshes: Record<'left' | 'right', InstancedMesh> = {} as never;
  private m = new Matrix4();
  private q = new Quaternion();
  private p = new Vector3();
  private s = new Vector3();
  private pos = new Map<string, Vector3>();
  private rad = new Map<string, number>();
  private valid = new Set<string>();
  private seen = { left: false, right: false };
  /** Last wrist position per hand, and frames left with that hand's occluders off after a tracking jump. */
  private lastWrist = { left: new Vector3(), right: new Vector3() };
  private hadWrist = { left: false, right: false };
  private hold = { left: 0, right: 0 };

  init() {
    const geo = new SphereGeometry(1, 10, 8);
    // Depth only: writes depth, never colour; drawn before the kit.
    const mat = new MeshBasicMaterial({ colorWrite: false, depthWrite: true });
    for (const side of ['left', 'right'] as const) {
      const mesh = new InstancedMesh(geo, mat, COUNT);
      mesh.name = `HandOccluder-${side}`;
      mesh.renderOrder = -10;
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.meshes[side] = mesh;
      this.world.createTransformEntity(mesh);
    }
    (window as unknown as { __occluders: unknown }).__occluders = { meshes: this.meshes, state: occluderState };
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
    if (occluderState.enabled && frame?.session && ref && frame.getJointPose) {
      for (const src of frame.session.inputSources) {
        if (!src.hand || (src.handedness !== 'left' && src.handedness !== 'right')) continue;
        const side = src.handedness;
        this.valid.clear();
        let i = 0;
        const mesh = this.meshes[side];
        // In dim light hand tracking can jump: a hand that moved further in one frame than a real hand
        // can keeps its occluders off for a moment, so they never punch holes where the hand isn't.
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
        const fill = (frame as XRFrame & { fillPoses?: (s: XRSpace[], b: XRSpace, out: Float32Array) => boolean; fillJointRadii?: (s: XRJointSpace[], out: Float32Array) => boolean });
        const batched = !!fill.fillPoses && !!fill.fillJointRadii && fill.fillPoses(spaces, ref, this.poseBuf[side]!) && fill.fillJointRadii(spaces as XRJointSpace[], this.radBuf[side]!);
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
          this.rad.set(name, r); // the joint's own size: a bigger sphere eats the pads beside a finger
          this.valid.add(name);
          this.write(mesh, i++, v, r);
        }
        for (const [a, b] of BONES) {
          if (!this.valid.has(a) || !this.valid.has(b)) continue;
          const pa = this.pos.get(a);
          const pb = this.pos.get(b);
          if (!pa || !pb) continue;
          this.p.addVectors(pa, pb).multiplyScalar(0.5);
          this.write(mesh, i++, this.p, ((this.rad.get(a) ?? 0.008) + (this.rad.get(b) ?? 0.008)) / 2);
        }
        mesh.count = i;
        mesh.instanceMatrix.needsUpdate = true;
        seen[src.handedness] = i > 0;
      }
    }
    for (const side of SIDES) if (!seen[side]) this.meshes[side].count = 0;
  }

  private spaces: Record<string, XRSpace[] | undefined> = {};
  private names: Record<string, string[]> = { left: [], right: [] };
  private spaceOf: Record<string, unknown> = {};
  private poseBuf: Record<string, Float32Array | undefined> = {};
  private radBuf: Record<string, Float32Array | undefined> = {};

  private write(mesh: InstancedMesh, i: number, at: Vector3, r: number) {
    this.m.compose(at, this.q.identity(), this.s.setScalar(r));
    mesh.setMatrixAt(i, this.m);
  }

  /**
   * Real device: hide IWSDK's hand mesh (passthrough shows the real hand). IWSDK sets the model's
   * `visible` back to true every frame and makes a new model whenever tracking reconnects, and it
   * nudges the model off surfaces it touches, so on a headset a stiff white outline drifted beside
   * the real hand and its depth-writing inner mesh cut holes in the pads. Take every model off all
   * render layers instead (IWSDK never touches layers), checking each frame for new ones.
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
