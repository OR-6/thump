/**
 * Seeing each other in a band, the scene's side: 18 times a second this headset sends where its head and hands are,
 * in its instruments' own frame (pose.ts); friends' poses come in, are checked and rate-limited, and each frame every
 * friend's seat is given theirs, smoothed, or told they've gone quiet. Nothing is made per frame.
 */
import { Matrix4, Quaternion, Vector3, type Object3D } from '@iwsdk/core';
import { hands, type HandState } from '../input/hands.js';
import { HAND_POINTS, POSE_HZ, PoseBuffer, PoseFlood, encodePose, newFrame, validPose, type PoseFrame } from '../net/pose.js';
import type { Transport } from '../net/transport.js';

/** A seat that can show a friend (FriendSeat). */
export interface PoseSeat {
  pose(f: PoseFrame | null): void;
}

/** Friends followed at once (a band is four). */
const MAX_FRIENDS = 3;
/** A friend's poses kept this long after they go quiet (s), in case they come back. */
const FORGET_S = 12;

const _inv = new Matrix4();
const _v = new Vector3();
const _qr = new Quaternion();
const _qh = new Quaternion();
const nowS = () => performance.now() / 1000;

export class FriendPresence {
  private tr: Transport | null = null;
  private live = false;
  private bufs = new Map<string, PoseBuffer>();
  private flood = new PoseFlood(undefined, MAX_FRIENDS + 1);
  private frame = newFrame();
  private sendT = 0;
  private head = new Float32Array(7);
  private left = new Float32Array(HAND_POINTS * 3);
  private right = new Float32Array(HAND_POINTS * 3);
  /** Poses sent and shown (for the debug readout). */
  sent = 0;
  got = 0;

  constructor(private readonly me: () => string) {}

  /** The band is up (the link stays wired across a friend leaving and another joining). */
  start(tr: Transport): void {
    if (tr !== this.tr) {
      this.tr = tr;
      tr.onMessage((m) => this.receive(m));
    }
    this.live = true;
  }

  stop(): void {
    this.live = false;
    this.bufs.clear();
  }

  receive(m: unknown): void {
    if (!this.live || !validPose(m) || m.p === this.me()) return;
    const now = nowS();
    if (!this.flood.ok(m.p, now)) return;
    let b = this.bufs.get(m.p);
    if (!b) {
      if (this.bufs.size >= MAX_FRIENDS) for (const [k, x] of this.bufs) if (now - x.lastAt > FORGET_S) this.bufs.delete(k);
      if (this.bufs.size >= MAX_FRIENDS) return;
      b = new PoseBuffer();
      this.bufs.set(m.p, b);
    }
    if (b.push(m, m.t / 1000, now)) this.got++;
  }

  /**
   * Each frame: send ours now and then (`root`: the instruments' layer, `head`: the viewer; only once the kit is
   * placed), and show each friend's at their seat (the band's own players, 'band:' seats, have none).
   */
  tick(dt: number, root: Object3D, head: Object3D, seats: Map<string, PoseSeat>, placed: boolean): void {
    if (!this.live) return;
    this.sendT -= dt;
    if (placed && this.sendT <= 0 && this.tr) {
      this.sendT += 1 / POSE_HZ;
      if (this.sendT < 0) this.sendT = 0;
      this.send(root, head);
    }
    const now = nowS();
    for (const [k, s] of seats) {
      if (k.startsWith('band:')) continue;
      const b = this.bufs.get(k);
      s.pose(b && b.sample(now, this.frame) ? this.frame : null);
    }
  }

  private send(root: Object3D, head: Object3D): void {
    _inv.copy(root.matrixWorld).invert();
    head.getWorldPosition(_v).applyMatrix4(_inv);
    root.getWorldQuaternion(_qr).invert();
    head.getWorldQuaternion(_qh).premultiply(_qr);
    const h = this.head;
    h[0] = _v.x;
    h[1] = _v.y;
    h[2] = _v.z;
    h[3] = _qh.x;
    h[4] = _qh.y;
    h[5] = _qh.z;
    h[6] = _qh.w;
    const l = this.points(hands.left, this.left);
    const r = this.points(hands.right, this.right);
    this.tr!.send(encodePose(this.me(), performance.now(), h, l, r));
    this.sent++;
  }

  /** A hand's seven points in the instruments' frame (a controller: all at its tip), or null untracked. */
  private points(hs: HandState, out: Float32Array): Float32Array | null {
    if (!hs.tracked) return null;
    for (let i = 0; i < HAND_POINTS; i++) {
      _v.copy(hs.controller ? hs.indexTip : pick(hs, i)).applyMatrix4(_inv);
      out[i * 3] = _v.x;
      out[i * 3 + 1] = _v.y;
      out[i * 3 + 2] = _v.z;
    }
    return out;
  }
}

/** A hand's point by its place on the wire: wrist, palm, thumb, index, middle, ring, pinky tips. */
function pick(h: HandState, i: number): Vector3 {
  return i === 0 ? h.wrist : i === 1 ? h.palm : i === 2 ? h.thumbTip : i === 3 ? h.indexTip : i === 4 ? h.middleTip : i === 5 ? h.ringTip : h.pinkyTip;
}
