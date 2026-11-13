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
/** …and within two frames moving at most this fast: a stop against something, not a hand slowing in the air. */
const MAX_OUT = 0.12;
/** A knock from the side has to come in at least this fast. */
const SIDE_IN = 0.8;
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
    tr.push(p.x, p.y, p.z, t);
    if (tr.n < 4) return null;
    const a = tr.at(0);
    const b = tr.at(1);
    const c = tr.at(2);
    const d = tr.at(3);
    const sp = (i: number, j: number) => {
      const dt = Math.max(1e-3, tr.t[i] - tr.t[j]);
      return Math.hypot(tr.x[i] - tr.x[j], tr.y[i] - tr.y[j], tr.z[i] - tr.z[j]) / dt;
    };
    const now = sp(a, b);
    const s1 = sp(c, d);
    const s2 = sp(b, c);
    const before = Math.max(s1, s2);
    // a real approach is a steady motion over the frames before, at a human speed (a tracking jump is one huge step)
    const steady = s2 >= MIN_IN * 0.5 && before <= 4;
    // re-armed once it has moved 4 cm from where it last stopped
    if (!tr.armed && Math.hypot(p.x - tr.lastStop.x, p.y - tr.lastStop.y, p.z - tr.lastStop.z) > 0.04) tr.armed = true;
    if (!tr.armed || !steady || before < MIN_IN || now > MAX_OUT) return null;
    // which way it was going (the frames before the stop)
    const dx = tr.x[b] - tr.x[d];
    const dy = tr.y[b] - tr.y[d];
    const dz = tr.z[b] - tr.z[d];
    const len = Math.hypot(dx, dy, dz) || 1;
    // from the side (a seat back, a wall the scan missed) it takes a firmer knock: hands stop in the air sideways a lot
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
    o.t = t;
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
 * What a found thing plays. `above` is its height over the table it's on (m, negative below it), `facing` which way
 * its face points. A low flat thing (a book, a phone) is a wood block; a cup or a bottle a bell, deeper the taller;
 * something below the table (your knees) congas; a face in front of you (a seat back) a frame drum.
 */
export function touchVoice(above: number, up: number): { family: 'block' | 'bell' | 'congas' | 'frame' | 'tubular' | 'slit'; size: number; what: string } {
  if (up < 0.6) return { family: 'frame', size: 0.4, what: 'that' };
  if (above < -0.08) return { family: 'congas', size: 0.5, what: 'your lap' };
  if (above < 0.055) return { family: 'block', size: Math.min(1, Math.max(0, above / 0.055)), what: 'that' };
  if (above < 0.26) return { family: 'bell', size: Math.min(1, Math.max(0, (above - 0.055) / 0.2)), what: 'that' };
  return { family: 'tubular', size: Math.min(1, (above - 0.26) / 0.2), what: 'that' };
}
