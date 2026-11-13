/**
 * Finding things by touch. Quest's room scan sees walls and tables, not your cup, your book or your knees. Your hand
 * does: when it comes in fast and stops dead somewhere that isn't a known surface, something is there. Tap the same
 * spot twice and it's an instrument. Pure logic over hand points (world space), unit-tested.
 */

export interface P3 {
  x: number;
  y: number;
  z: number;
}

/** Where the hand stopped, which way it was going, and whether it's the second tap there (a find). */
export interface Touch {
  at: P3;
  /** Unit vector the hand was moving along (so the thing faces −dir). */
  dir: P3;
  speed: number;
  t: number;
  found: boolean;
}

const FRAMES = 6;

/** Coming in at least this fast (m/s)… */
const MIN_IN = 0.45;
/** …and over the last two frames moving at most this fast: a stop against something (tracking jitters ~1 mm a frame). */
const MAX_OUT = 0.25;
/** A knock from the side has to come in at least this fast (a laptop lid takes soft taps; a hand stops sideways a lot). */
const SIDE_IN = 0.55;
/** …and of that, at most this fast still on the way it was going (m/s). */
const MAX_ON = 0.1;
/** A sample that moved less than this (m) is the tracker repeating itself, not a hand standing still. */
const SAME_M = 0.0002;
/** The second tap must land this close to the first (m), within this long (s). */
const SAME_SPOT = 0.035;
const WITHIN_S = 20;

class Track {
  // centre of the hand's leading points, the last few frames
  readonly x = new Float64Array(FRAMES);
  readonly y = new Float64Array(FRAMES);
  readonly z = new Float64Array(FRAMES);
  readonly t = new Float64Array(FRAMES);
  n = 0;
  i = 0;
  /** Lifted away since the last stop (a resting or holding hand never taps twice). */
  armed = true;
  lastStop: P3 = { x: 0, y: 0, z: 0 };
  push(x: number, y: number, z: number, t: number): void {
    this.x[this.i] = x;
    this.y[this.i] = y;
    this.z[this.i] = z;
    this.t[this.i] = t;
    this.i = (this.i + 1) % FRAMES;
    if (this.n < FRAMES) this.n++;
  }
  /** k frames back (0 = newest). */
  at(k: number): number {
    return (this.i - 1 - k + FRAMES * 2) % FRAMES;
  }
  reset(): void {
    this.n = 0;
    this.armed = true;
  }
}

export class TouchFinder {
  private tracks = [new Track(), new Track()];
  private candidates: { at: P3; dir: P3; t: number }[] = [];
  private readonly out: Touch = { at: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 0, z: 0 }, speed: 0, t: 0, found: false };

  /**
   * One frame for one hand: its leading point (a fingertip or the palm, whichever is further along its motion),
   * or null when it isn't tracked or is pinching. Returns a touch on the frame it stops, else null.
   */
  update(hand: 0 | 1, p: P3 | null, t: number): Touch | null {
    const tr = this.tracks[hand];
    if (!p) {
      tr.reset();
      return null;
    }
    // the tracker running slower than the frame repeats a sample: skip it (a real hand is never perfectly still),
    // unless it's held long enough that the hand really has stopped
    if (tr.n > 0) {
      const l = tr.at(0);
      if (Math.abs(p.x - tr.x[l]) + Math.abs(p.y - tr.y[l]) + Math.abs(p.z - tr.z[l]) < SAME_M && t - tr.t[l] < 0.04) return null;
    }
    tr.push(p.x, p.y, p.z, t);
    if (tr.n < 6) return null;
    // a, b, c: the newest three (stopped); d: the last frame still moving; e, f: the approach
    const a = tr.at(0);
    const c = tr.at(2);
    const d = tr.at(3);
    const e = tr.at(4);
    const f = tr.at(5);
    const sp = (i: number, j: number) => {
      const dt = Math.max(1e-3, tr.t[i] - tr.t[j]);
      return Math.hypot(tr.x[i] - tr.x[j], tr.y[i] - tr.y[j], tr.z[i] - tr.z[j]) / dt;
    };
    // coming in: the two frames before contact (the frame it touched in is partly stopped, so it's left out), still
    // fast on the last of them (a hand easing to a halt in the air has already slowed by then)
    const s1 = sp(e, f);
    const s2 = sp(d, e);
    const before = Math.max(s1, s2);
    // a real approach is a steady motion over the frames before, at a human speed (a tracking jump is one huge step)
    const steady = Math.min(s1, s2) >= MIN_IN * 0.5 && s2 >= MIN_IN * 0.9 && before <= 4;
    // re-armed once it has lifted 1.5 cm from where it last stopped (a tap's natural lift is 1–3 cm)
    if (!tr.armed && Math.hypot(p.x - tr.lastStop.x, p.y - tr.lastStop.y, p.z - tr.lastStop.z) > 0.015) tr.armed = true;
    if (!tr.armed || !steady || before < MIN_IN) return null;
    // which way it was going (the frames before the stop)
    const dx = tr.x[d] - tr.x[f];
    const dy = tr.y[d] - tr.y[f];
    const dz = tr.z[d] - tr.z[f];
    const len = Math.hypot(dx, dy, dz) || 1;
    // stopped: over the last two frames it hardly moved (one frame alone is mostly tracking noise), and in particular
    // not still creeping on the way it was going (that's a hand slowing in the air)
    const span = Math.max(1e-3, tr.t[a] - tr.t[c]);
    const ax = tr.x[a] - tr.x[c];
    const ay = tr.y[a] - tr.y[c];
    const az = tr.z[a] - tr.z[c];
    if (Math.hypot(ax, ay, az) / span > MAX_OUT || (ax * dx + ay * dy + az * dz) / len / span > MAX_ON) return null;
    // a hand lifting and pausing is not hitting anything above it: things are found coming down or from the front
    if (dy / len > 0.3) return null;
    // from the side (a seat back, a laptop lid) it takes a firmer knock: hands stop in the air sideways a lot
    if (dy / len > -0.6 && before < SIDE_IN) return null;
    tr.armed = false;
    tr.lastStop = { x: p.x, y: p.y, z: p.z };
    const o = this.out;
    o.at.x = p.x;
    o.at.y = p.y;
    o.at.z = p.z;
    o.dir.x = dx / len;
    o.dir.y = dy / len;
    o.dir.z = dz / len;
    o.speed = before;
    // it touched between the last moving frame and the first stopped one
    o.t = tr.t[d] + (tr.t[c] - tr.t[d]) * 0.5;
    o.found = false;
    // the second tap on the same spot, coming the same way: something is there
    for (let k = this.candidates.length - 1; k >= 0; k--) {
      const cnd = this.candidates[k];
      if (t - cnd.t > WITHIN_S) {
        this.candidates.splice(k, 1);
        continue;
      }
      const near = Math.hypot(cnd.at.x - p.x, cnd.at.y - p.y, cnd.at.z - p.z) < SAME_SPOT;
      const same = cnd.dir.x * o.dir.x + cnd.dir.y * o.dir.y + cnd.dir.z * o.dir.z > 0.6;
      if (near && same && t - cnd.t > 0.15) {
        o.found = true;
        // where it is: between the two taps
        o.at.x = (o.at.x + cnd.at.x) / 2;
        o.at.y = (o.at.y + cnd.at.y) / 2;
        o.at.z = (o.at.z + cnd.at.z) / 2;
        this.candidates.splice(k, 1);
        return o;
      }
    }
    if (this.candidates.length > 12) this.candidates.shift();
    this.candidates.push({ at: { ...o.at }, dir: { ...o.dir }, t });
    return o;
  }

  /** Forget the first taps (a song started, the session ended). */
  clear(): void {
    this.candidates.length = 0;
    for (const t of this.tracks) t.reset();
  }
}

/**
 * What a thing plays, from where it is (no object recognition). `above` is its height over the desk (m, negative
 * below it), `up` how much its face points up (1 a top, 0 a face toward you), `lateral` how far it is to your side
 * (m, + right). The table in DIRECTION-13NOV-B.md: low things knock (a book, a phone), cups ring (lower the taller),
 * bottles chime, a laptop lid is a ride (soft taps only), your knees are congas (left low, right high), the chair's
 * arms a cowbell. Returns null for somewhere nothing should be (high in the air).
 */
export function touchVoice(above: number, up: number, lateral = 0): { sound: string; size: number; tone: number; what: string } | null {
  if (up < 0.6) {
    // a face toward you: the side of a mug (a bell), higher a lid or a screen (a ride, soft), below the desk's
    // front or a drawer
    if (above > 0.04 && above < 0.12) return { sound: 'bell', size: Math.min(1, (above - 0.04) / 0.08), tone: 0, what: 'cup' };
    return above >= 0.12 ? { sound: 'ride', size: 0.5, tone: 0, what: 'lid' } : { sound: 'cowbell', size: 0.5, tone: 0, what: 'edge' };
  }
  if (above < -0.08) {
    // under the desk: in front of you your knees, out to the side the chair's arms
    if (Math.abs(lateral) < 0.25) return { sound: 'congas', size: 0.5, tone: lateral < 0 ? 0 : 2, what: 'knee' };
    return { sound: 'cowbell', size: 0.5, tone: lateral < 0 ? 0 : 1, what: 'arm' };
  }
  if (above < 0.04) return { sound: 'block', size: Math.min(1, Math.max(0, above / 0.04)), tone: 0, what: 'flat' };
  if (above < 0.12) return { sound: 'bell', size: Math.min(1, (above - 0.04) / 0.08), tone: 0, what: 'cup' };
  if (above < 0.36) return { sound: 'chime', size: Math.min(1, (above - 0.12) / 0.24), tone: 0, what: 'tall' };
  return null;
}

export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** A pad's footprint after a hit at (x, z) on it (its frame): it grows to cover where you hit, plus `r`. Null if it didn't grow. */
export function grow(b: Box, x: number, z: number, r = 0.04): Box | null {
  if (x - r >= b.minX && x + r <= b.maxX && z - r >= b.minZ && z + r <= b.maxZ) return null;
  return { minX: Math.min(b.minX, x - r), maxX: Math.max(b.maxX, x + r), minZ: Math.min(b.minZ, z - r), maxZ: Math.max(b.maxZ, z + r) };
}

/** A low flat thing that turns out wider than 25 cm (a keyboard, a tray) is keys. */
export function becomesKeys(b: Box, top: boolean, sound: string | null, what: string): boolean {
  return top && sound === 'block' && what === 'flat' && b.maxX - b.minX > 0.25;
}

/** Two palms meeting fast: a clap (distance now and a frame ago, m; dt, s). */
export function isClap(d: number, dPrev: number, dt: number): boolean {
  return Number.isFinite(dPrev) && d < 0.07 && dt > 0 && (dPrev - d) / dt > 0.7;
}

/** How long until palms closing at this speed (m/s) from this distance meet (palm centres touch at ~3.5 cm), capped. */
export function clapIn(d: number, speed: number): number {
  return Math.max(0, Math.min(0.05, (d - 0.035) / Math.max(speed, 0.1)));
}
