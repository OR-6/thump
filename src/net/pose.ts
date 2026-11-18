/**
 * Seeing each other in a band: each headset sends where its head and hands are, a few times a second, measured in
 * its own instruments' frame (the kit's instrument layer: x to the player's right, y up, z towards the player). The
 * others put that pose at the friend's seat across the desk, small, behind their small instrument, turned round to
 * face them. Pure: the wire format, its checks, the smoothing buffer and the seat mapping; no scene, no network.
 *
 * On the wire (JSON, integers so it stays small, about 250 bytes):
 *   { k: 'pose', p: band id, t: sender ms, h: [x, y, z (mm), qx, qy, qz, qw (×10000)],
 *     l: [] or 7 points × 3 (mm), r: the same }   (points: wrist, palm, thumb, index, middle, ring, pinky tips)
 */

/** Points per hand: the wrist, the palm, then the five fingertips (thumb to pinky). */
export const HAND_POINTS = 7;
const HAND_LEN = HAND_POINTS * 3;
/** How far from its own instruments a head or hand can be (mm): a seated player's reach, with room to spare. */
const MAX_MM = 3000;
const Q = 10000;
/** Sends a second (each headset); and how many a second we take from one friend (some slack for bunching). */
export const POSE_HZ = 18;
export const POSE_MAX_PER_S = 30;
/** How far behind a friend's latest pose we show them (s): two sends' worth, so a late one doesn't stutter. */
export const POSE_DELAY = 0.1;
/** No pose for this long (s): they've gone (or their tracking has), their head and hands go. */
export const POSE_STALE = 1;

export interface PoseMsg {
  k: 'pose';
  p: string;
  t: number;
  h: number[];
  l: number[];
  r: number[];
}

/** One pose, decoded: the head (position m, quaternion), and each hand's points (m) when it's tracked. */
export interface PoseFrame {
  head: Float32Array; // x y z qx qy qz qw
  left: Float32Array; // HAND_POINTS × xyz
  right: Float32Array;
  leftOn: boolean;
  rightOn: boolean;
}

export function newFrame(): PoseFrame {
  return { head: new Float32Array([0, 0, 0, 0, 0, 0, 1]), left: new Float32Array(HAND_LEN), right: new Float32Array(HAND_LEN), leftOn: false, rightOn: false };
}

const mm = (x: number) => Math.max(-MAX_MM, Math.min(MAX_MM, Math.round(x * 1000))) || 0;

/**
 * A pose to send. `head` x y z qx qy qz qw (instrument frame, m); a hand's points, or null when it isn't tracked.
 * (Sending: one array per message, made at 18 Hz, not per frame.)
 */
export function encodePose(p: string, tMs: number, head: ArrayLike<number>, left: ArrayLike<number> | null, right: ArrayLike<number> | null): PoseMsg {
  // a quaternion and its negative are one turn: send the one with w ≥ 0
  const s = head[6] < 0 ? -1 : 1;
  const h = [mm(head[0]), mm(head[1]), mm(head[2])];
  for (let i = 3; i < 7; i++) h.push(Math.max(-Q, Math.min(Q, Math.round(head[i] * s * Q))) || 0);
  const hand = (a: ArrayLike<number> | null) => {
    if (!a) return [];
    const out: number[] = new Array(HAND_LEN);
    for (let i = 0; i < HAND_LEN; i++) out[i] = mm(a[i]);
    return out;
  };
  return { k: 'pose', p, t: Math.round(tMs), h, l: hand(left), r: hand(right) };
}

const int = (x: unknown, lo: number, hi: number) => typeof x === 'number' && Number.isInteger(x) && x >= lo && x <= hi;
const ints = (a: unknown, n: number, lo: number, hi: number) => Array.isArray(a) && a.length === n && a.every((x) => int(x, lo, hi));

/** Is this a pose we'd send ourselves (whole numbers in range, the right lengths, a real turn)? Nothing else is shown. */
export function validPose(m: unknown): m is PoseMsg {
  if (!m || typeof m !== 'object') return false;
  const n = m as Record<string, unknown>;
  if (n.k !== 'pose' || typeof n.p !== 'string' || !/^[a-z0-9]{1,12}$/.test(n.p)) return false;
  if (!int(n.t, 0, 1e12)) return false;
  if (!Array.isArray(n.h) || n.h.length !== 7) return false;
  if (!ints(n.h.slice(0, 3), 3, -MAX_MM, MAX_MM) || !ints(n.h.slice(3), 4, -Q, Q)) return false;
  const [, , , x, y, z, w] = n.h as number[];
  // (a turn has length 1: a rounded one is near it; all zeros is no turn at all)
  const len = Math.hypot(x, y, z, w) / Q;
  if (len < 0.9 || len > 1.1) return false;
  for (const hand of [n.l, n.r]) if (!(Array.isArray(hand) && (hand.length === 0 || ints(hand, HAND_LEN, -MAX_MM, MAX_MM)))) return false;
  return true;
}

/** Into `out` (no allocation): metres, a unit quaternion. */
export function decodePose(m: PoseMsg, out: PoseFrame): PoseFrame {
  for (let i = 0; i < 3; i++) out.head[i] = m.h[i] / 1000;
  const l = Math.hypot(m.h[3], m.h[4], m.h[5], m.h[6]) || 1;
  for (let i = 3; i < 7; i++) out.head[i] = m.h[i] / l;
  out.leftOn = m.l.length === HAND_LEN;
  out.rightOn = m.r.length === HAND_LEN;
  if (out.leftOn) for (let i = 0; i < HAND_LEN; i++) out.left[i] = m.l[i] / 1000;
  if (out.rightOn) for (let i = 0; i < HAND_LEN; i++) out.right[i] = m.r[i] / 1000;
  return out;
}

/** `out` = between frames a and b (u 0..1): positions straight, the head's turn the short way round. */
export function lerpFrame(a: PoseFrame, b: PoseFrame, u: number, out: PoseFrame): PoseFrame {
  for (let i = 0; i < 3; i++) out.head[i] = a.head[i] + (b.head[i] - a.head[i]) * u;
  // nlerp (close enough at 18 Hz): flip b if it's the long way round
  const dot = a.head[3] * b.head[3] + a.head[4] * b.head[4] + a.head[5] * b.head[5] + a.head[6] * b.head[6];
  const s = dot < 0 ? -1 : 1;
  let len = 0;
  for (let i = 3; i < 7; i++) {
    out.head[i] = a.head[i] + (b.head[i] * s - a.head[i]) * u;
    len += out.head[i] * out.head[i];
  }
  len = Math.sqrt(len) || 1;
  for (let i = 3; i < 7; i++) out.head[i] /= len;
  const hand = (pa: Float32Array, pb: Float32Array, onA: boolean, onB: boolean, o: Float32Array): boolean => {
    if (onA && onB) {
      for (let i = 0; i < HAND_LEN; i++) o[i] = pa[i] + (pb[i] - pa[i]) * u;
      return true;
    }
    // a hand coming or going: the nearer frame's say
    const near = u < 0.5 ? onA : onB;
    if (near) o.set(u < 0.5 ? pa : pb);
    return near;
  };
  out.leftOn = hand(a.left, b.left, a.leftOn, b.leftOn, out.left);
  out.rightOn = hand(a.right, b.right, a.rightOn, b.rightOn, out.right);
  return out;
}

function copyFrame(a: PoseFrame, out: PoseFrame): PoseFrame {
  out.head.set(a.head);
  out.left.set(a.left);
  out.right.set(a.right);
  out.leftOn = a.leftOn;
  out.rightOn = a.rightOn;
  return out;
}

/**
 * One friend's poses, smoothed: shown a tenth of a second behind their latest, between the two either side of that
 * moment. Their clock and ours differ: the gap is learnt from arrivals (the quickest one so far, drifting up slowly in
 * case their clock runs slow), so no clock sync is needed. A pose older than the last is dropped.
 */
export class PoseBuffer {
  private static readonly N = 8;
  private frames: PoseFrame[] = Array.from({ length: PoseBuffer.N }, newFrame);
  private times = new Float64Array(PoseBuffer.N);
  private count = 0;
  private head = 0; // next write
  /** Our clock minus theirs (s), from arrivals. */
  private gap = 0;
  private gapAt = 0;
  /** When (our clock, s) the last one came. */
  lastAt = -Infinity;

  constructor(readonly delay = POSE_DELAY) {}

  /** A pose arrived at `now` (our clock, s); sent at `t` (theirs, s). False if out of order (dropped). */
  push(m: PoseMsg, t: number, now: number): boolean {
    if (this.count) {
      const newest = this.times[(this.head + PoseBuffer.N - 1) % PoseBuffer.N];
      if (t <= newest) return false;
      // a quicker arrival is the truer gap; slower ones only nudge it up (10 ms a second, for a clock that runs slow)
      this.gap = Math.min(now - t, this.gap + 0.01 * Math.max(0, now - this.gapAt));
    } else this.gap = now - t;
    this.gapAt = now;
    decodePose(m, this.frames[this.head]);
    this.times[this.head] = t;
    this.head = (this.head + 1) % PoseBuffer.N;
    this.count = Math.min(PoseBuffer.N, this.count + 1);
    this.lastAt = now;
    return true;
  }

  /** Gone quiet (no pose for a second)? */
  stale(now: number): boolean {
    return !this.count || now - this.lastAt > POSE_STALE;
  }

  /** The pose to show at `now` (our clock), into `out`; false if there's nothing (or it's stale). */
  sample(now: number, out: PoseFrame): boolean {
    if (this.stale(now)) return false;
    const want = now - this.gap - this.delay;
    const N = PoseBuffer.N;
    const at = (k: number) => (this.head + N - this.count + k) % N; // k: 0 the oldest
    const first = at(0);
    const last = at(this.count - 1);
    if (want <= this.times[first]) {
      copyFrame(this.frames[first], out);
      return true;
    }
    if (want >= this.times[last]) {
      // (no guessing ahead: hold the latest)
      copyFrame(this.frames[last], out);
      return true;
    }
    for (let k = this.count - 1; k > 0; k--) {
      const a = at(k - 1);
      if (this.times[a] <= want) {
        const b = at(k);
        lerpFrame(this.frames[a], this.frames[b], (want - this.times[a]) / (this.times[b] - this.times[a]), out);
        return true;
      }
    }
    copyFrame(this.frames[first], out);
    return true;
  }

  clear(): void {
    this.count = 0;
    this.lastAt = -Infinity;
  }
}

/** At most `n` poses a second from each friend, and at most `ids` friends followed (a band is four). */
export class PoseFlood {
  private seen = new Map<string, { at: number; n: number }>();
  constructor(private readonly n = POSE_MAX_PER_S, private readonly ids = 4) {}
  ok(p: string, now: number): boolean {
    let s = this.seen.get(p);
    if (!s) {
      if (this.seen.size >= this.ids) {
        // make room only by forgetting one gone quiet
        for (const [k, v] of this.seen) if (now - v.at > 5) this.seen.delete(k);
        if (this.seen.size >= this.ids) return false;
      }
      s = { at: now, n: 0 };
      this.seen.set(p, s);
    }
    if (now - s.at >= 1) {
      s.at = now;
      s.n = 0;
    }
    if (s.n >= this.n) return false;
    s.n++;
    return true;
  }
  forget(p: string): void {
    this.seen.delete(p);
  }
}

/**
 * Their desk, at their seat: how a point in a friend's instrument frame lands in the seat's frame. They sit across
 * from you, so their frame is turned half round (a turn, not a mirror: their right hand is on your left, as it would
 * be for someone facing you), made small to match their small instrument, tipped back a little so you see their
 * hands on it, and set just under the seat's light. The seat's `stage` group carries exactly this transform.
 */
export const SEAT_STAGE = { scale: 0.3, tilt: 0.35, y: -0.075 } as const;

/** `out` = where their point `p` (x y z, their instrument frame) sits in the seat's frame. */
export function toSeat(p: ArrayLike<number>, out: number[] = [0, 0, 0]): number[] {
  const { scale: s, tilt, y: dy } = SEAT_STAGE;
  // half a turn about up: x → −x, z → −z
  const x = -p[0] * s;
  const y = p[1] * s;
  const z = -p[2] * s;
  // tipped about x (the far side up, towards you)
  const c = Math.cos(tilt);
  const sn = Math.sin(tilt);
  out[0] = x;
  out[1] = y * c - z * sn + dy;
  out[2] = y * sn + z * c;
  return out;
}
