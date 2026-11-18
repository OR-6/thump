/**
 * A friend in the band, as you see them across the desk: a rounded head with a dark visor (it shows where they're
 * looking) in their instrument's colour, and two hands, a ball at each joint we're sent and a finger from the palm to
 * each tip. Built life-size in their own instrument frame: the seat's stage shrinks and turns it to sit behind their
 * small instrument, so their fingers land on its keys when they play. Four draws: head, visor, joints, fingers.
 */
import {
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from '@iwsdk/core';
import { HAND_POINTS, type PoseFrame } from '../net/pose.js';

/** Joints per hand drawn as balls (all seven points), and fingers (wrist to palm, then palm or the heel to each tip). */
const BALLS = HAND_POINTS * 2;
const BONES = 6 * 2;
/** Sizes, life-size (the stage makes them a third): a little fat, so they read at a metre. */
const R_WRIST = 0.016;
const R_PALM = 0.028;
const R_TIP = 0.013;
const R_FINGER = 0.009;

const _p = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _d = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
const _m = new Matrix4();
const _up = new Vector3(0, 1, 0);
const _id = new Quaternion();
const _c = new Color();

export class FriendAvatar {
  readonly root = new Group();
  private head = new Group();
  private shell: Mesh;
  private visor: Mesh;
  private balls: InstancedMesh;
  private bones: InstancedMesh;
  private skin: MeshStandardMaterial;
  private hands: MeshStandardMaterial;

  constructor() {
    this.root.name = 'FriendAvatar';
    this.skin = new MeshStandardMaterial({ color: 0xfff2dc, roughness: 0.55, metalness: 0 });
    this.shell = new Mesh(new SphereGeometry(0.095, 24, 16), this.skin);
    this.shell.scale.set(0.92, 1, 1.04);
    // the visor: a dark glossy band round the front (their −z: where they look)
    const vg = new SphereGeometry(0.1, 24, 8, Math.PI * 1.06, Math.PI * 0.88, Math.PI * 0.36, Math.PI * 0.24);
    this.visor = new Mesh(vg, new MeshStandardMaterial({ color: 0x15141a, roughness: 0.18, metalness: 0.4 }));
    this.visor.scale.set(0.92, 1, 1.04);
    // (the pose is the eyes: the head's middle sits a little behind and above them)
    this.shell.position.set(0, 0.012, 0.035);
    this.visor.position.copy(this.shell.position);
    this.head.add(this.shell, this.visor);
    this.hands = new MeshStandardMaterial({ color: 0xfff2dc, roughness: 0.6, emissive: 0xfff2dc, emissiveIntensity: 0.25 });
    this.balls = new InstancedMesh(new SphereGeometry(1, 12, 8), this.hands, BALLS);
    // (an open tube: the balls at its ends round it off)
    this.bones = new InstancedMesh(new CylinderGeometry(1, 1, 1, 8, 1, true), this.hands, BONES);
    // (they move every frame: their bounds would only go stale)
    this.balls.frustumCulled = false;
    this.bones.frustumCulled = false;
    this.root.add(this.head, this.balls, this.bones);
    this.root.visible = false;
  }

  /** Their instrument's colour: the head in it, the hands a paler one. */
  setColor(hex: number): void {
    this.skin.color.setHex(hex);
    this.hands.color.setHex(hex).lerp(_c.setHex(0xffffff), 0.55);
    this.hands.emissive.setHex(hex);
  }

  /** Show this pose (their instrument frame), or hide them (null: gone quiet). */
  show(f: PoseFrame | null): void {
    if (!f) {
      this.root.visible = false;
      return;
    }
    this.root.visible = true;
    const h = f.head;
    this.head.position.set(h[0], h[1], h[2]);
    this.head.quaternion.set(h[3], h[4], h[5], h[6]);
    this.hand(0, f.left, f.leftOn);
    this.hand(1, f.right, f.rightOn);
    this.balls.instanceMatrix.needsUpdate = true;
    this.bones.instanceMatrix.needsUpdate = true;
  }

  private hand(side: number, pts: Float32Array, on: boolean): void {
    const b0 = side * HAND_POINTS;
    const k0 = side * 6;
    if (!on) {
      _m.makeScale(0, 0, 0);
      for (let i = 0; i < HAND_POINTS; i++) this.balls.setMatrixAt(b0 + i, _m);
      for (let i = 0; i < 6; i++) this.bones.setMatrixAt(k0 + i, _m);
      return;
    }
    for (let i = 0; i < HAND_POINTS; i++) {
      const r = i === 0 ? R_WRIST : i === 1 ? R_PALM : R_TIP;
      _p.set(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
      _m.compose(_p, _id, _s.set(r, r, r));
      this.balls.setMatrixAt(b0 + i, _m);
    }
    // wrist to palm; the thumb from the heel of the hand (between them); the fingers from the palm
    this.bone(k0, pts, 0, 1);
    for (let t = 2; t < HAND_POINTS; t++) this.bone(k0 + t - 1, pts, t === 2 ? -2 : 1, t);
  }

  /** A finger from point `i` (−2: halfway wrist to palm) to point `j`. */
  private bone(k: number, pts: Float32Array, i: number, j: number): void {
    if (i === -2) _a.set((pts[0] + pts[3]) / 2, (pts[1] + pts[4]) / 2, (pts[2] + pts[5]) / 2);
    else _a.set(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
    _b.set(pts[j * 3], pts[j * 3 + 1], pts[j * 3 + 2]);
    _d.subVectors(_b, _a);
    const len = _d.length();
    if (len < 1e-4) {
      // (a controller: every point at its tip, no fingers)
      _m.makeScale(0, 0, 0);
      this.bones.setMatrixAt(k, _m);
      return;
    }
    _q.setFromUnitVectors(_up, _d.divideScalar(len));
    _p.addVectors(_a, _b).multiplyScalar(0.5);
    _m.compose(_p, _q, _s.set(R_FINGER, len, R_FINGER));
    this.bones.setMatrixAt(k, _m);
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const m of [this.shell, this.visor, this.balls, this.bones]) m.geometry.dispose();
    this.skin.dispose();
    this.hands.dispose();
    (this.visor.material as MeshStandardMaterial).dispose();
    this.balls.dispose();
    this.bones.dispose();
  }
}
