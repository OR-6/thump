/**
 * The guitar you hold: a real one's measures, how it rests against you at the desk, and how your hands play it.
 *
 * Its own frame (metres): x along the strings (the nut at −x, the saddle at +x), y out of the top toward you, z across
 * the strings (the low E at −z, the side toward the ceiling as it is held). The origin is on the top under the
 * fretboard's end; the soundhole is just past it (HG.hole). Held, the body rests against the desk's edge at your right, its top tipped back toward your eyes, the neck
 * rising out to your left; your hands stay above the desk.
 *
 * Playing it: every string sounds as a fingertip crosses it, the way a real string does, so a sweep down or up is a
 * down- or up-strum with its strings fanned out in time, and a slow finger picks one string. Fingertips on the neck
 * fret it: by default the frets are three chord places that always fit (the key's, or the song's); with real frets,
 * each fingertip stops the string under it at its fret, in standard tuning. Pure maths, no DOM, no scene.
 */
import { Matrix4, Vector3 } from '@iwsdk/core';

export const HG = {
  /** The nut and the scale (nut to saddle: a steel-string's 645 mm). */
  nut: -0.45,
  scale: 0.645,
  /** Where the neck meets the body (the 14th fret), and the body's far end. */
  join: -0.088,
  tail: 0.412,
  /** The body: 50 cm long, 38 across the lower bout, 10 deep. */
  bodyLen: 0.5,
  bodyWid: 0.38,
  depth: 0.1,
  /** The fretboard's face over the top, and the strings over it. */
  board: 0.007,
  strings: 0.013,
  /** The neck's width at the nut and at the body; the strings' spacing at the nut and at the saddle. */
  nutW: 0.043,
  joinW: 0.056,
  nutSp: 0.0072,
  saddleSp: 0.0104,
  /** The soundhole's centre and radius: its edge meets the fretboard's end, as on a dreadnought. */
  hole: 0.052,
  holeR: 0.05,
  /** Where a strum is read: from the neck's end over the soundhole to past the bridge. */
  strumX0: -0.06,
  strumX1: 0.2,
  /** The line strums are timed to in a song (over the soundhole, toward the bridge). */
  strikeX: 0.085,
} as const;

export const SADDLE_X = HG.nut + HG.scale;
/** Standard tuning, low to high (E2 A2 D3 G3 B3 E4). */
export const OPEN = [40, 45, 50, 55, 59, 64] as const;
/** The three chord places along the neck (frets, inclusive). */
export const ZONE_FRETS = [
  [1, 3],
  [4, 6],
  [7, 10],
] as const;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** Fret n's wire (0: the nut). */
export const fretX = (n: number) => HG.nut + HG.scale * (1 - Math.pow(2, -n / 12));
/** String i's z at x (the strings fan out from the nut to the saddle). */
export const stringZ = (i: number, x: number) => (i - 2.5) * (HG.nutSp + (HG.saddleSp - HG.nutSp) * clamp01((x - HG.nut) / HG.scale));
/** The neck's width at x. */
export const neckW = (x: number) => HG.nutW + (HG.joinW - HG.nutW) * clamp01((x - HG.nut) / (HG.join - HG.nut));
/** The fret a fingertip at x stops (1 between the nut and the first wire; 0 off the neck toward the headstock). */
export function fretAt(x: number): number {
  if (x < HG.nut) return 0;
  for (let n = 1; n < 22; n++) if (x < fretX(n)) return n;
  return 22;
}
/** The chord place a fret is in. */
export const zoneOfFret = (n: number) => (n <= ZONE_FRETS[0][1] ? 0 : n <= ZONE_FRETS[1][1] ? 1 : 2);
/** The middle of chord place c along the neck. */
export const zoneX = (c: number) => (fretX(ZONE_FRETS[c][0] - 1) + fretX(ZONE_FRETS[c][1])) / 2;

/** The body's outline (from the neck end, u 0..1 along it): its half-width as a share of the lower bout's. */
export const OUTLINE: readonly (readonly [number, number])[] = [
  [0, 0.3], [0.03, 0.58], [0.1, 0.73], [0.2, 0.76], [0.3, 0.7], [0.4, 0.63], [0.5, 0.7], [0.6, 0.86], [0.72, 0.98], [0.82, 1], [0.91, 0.9], [0.97, 0.66], [1, 0.3],
];
/** The body's half-width at x, 0 off the body. */
export function bodyHalfW(x: number): number {
  const u = (x - HG.join) / HG.bodyLen;
  if (u < 0 || u > 1) return 0;
  for (let k = 1; k < OUTLINE.length; k++)
    if (u <= OUTLINE[k][0]) {
      const [u0, w0] = OUTLINE[k - 1];
      const [u1, w1] = OUTLINE[k];
      const f = (u - u0) / (u1 - u0);
      return (HG.bodyWid / 2) * (w0 + (w1 - w0) * (0.5 - 0.5 * Math.cos(Math.PI * f)));
    }
  return 0;
}

/** How it is held (kit frame: the desk's top y = 0, you toward +z): where the soundhole is, and its angles. */
export const HOLD = {
  x: 0.12,
  z: 0.13,
  /** The neck rising toward your left, and turned a little away from you, as a seated player holds it. */
  rise: 0.27,
  yaw: 0.16,
  /** The top tipped back toward your eyes from upright. */
  tilt: 0.62,
  /** What the body's lowest point clears the desk by. */
  clear: 0.012,
} as const;

const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _p = new Vector3();
/** The guitar's frame in the kit's (its body resting just over the desk). */
export function heldMatrix(out: Matrix4): Matrix4 {
  const { rise, yaw, tilt } = HOLD;
  // x points from the headstock to the bridge: right, falling a little, toward you a little
  _x.set(Math.cos(rise) * Math.cos(yaw), -Math.sin(rise), Math.cos(rise) * Math.sin(yaw)).normalize();
  // the top faces you, tipped up
  _y.set(0, Math.sin(tilt), Math.cos(tilt));
  _y.addScaledVector(_x, -_y.dot(_x)).normalize();
  _z.crossVectors(_x, _y);
  out.makeBasis(_x, _y, _z);
  // lifted until the body's lowest point (its back edge) clears the desk
  let minY = Infinity;
  for (let k = 0; k <= 40; k++) {
    const x = HG.join + (HG.bodyLen * k) / 40;
    const w = bodyHalfW(x);
    for (const z of [-w, w])
      for (const y of [0, -HG.depth]) {
        _p.set(x, y, z).applyMatrix4(out);
        minY = Math.min(minY, _p.y);
      }
  }
  out.setPosition(HOLD.x, HOLD.clear - minY, HOLD.z);
  return out;
}

/** A string sounding: which, how hard, which way the finger went (+1 down toward the high E), when (s, clock). */
export interface Pluck {
  string: number;
  vel: number;
  dir: 1 | -1;
  t: number;
  side: 0 | 1;
}

/** Fingertips per hand that strum (index, middle, ring, thumb: a pick between thumb and index is the thumb's). */
export const STRUM_TIPS = 4;
/** Fingertips per hand that fret (index, middle, ring, little). */
export const FRET_TIPS = 4;

/**
 * Both hands on the guitar, in its own frame, each frame: the strings crossed (plucks), what the neck is stopping.
 */
export class GuitarHands {
  private prev = Array.from({ length: 2 * STRUM_TIPS }, () => new Vector3());
  private prevOk = new Array<boolean>(2 * STRUM_TIPS).fill(false);
  private lastPluck = new Float64Array(6).fill(-1);
  /** Each string's fret now (0 open), with real frets. */
  readonly frets = new Int8Array(6);
  private fretT = -1;
  /** The chord place the neck hand is on (-1 none yet), and whether a finger is on the neck now. */
  zone = -1;
  onNeck = false;
  /** The lowest fret any finger stops now (0 none). */
  lowFret = 0;
  private candidate = -1;
  private candidateT = 0;
  /** A finger on each string at its fret now (for the dots that show it), -1 none. */
  readonly pressed = new Int8Array(6).fill(-1);

  /** A hand lost or a song restarted: no stale finger crosses anything from where it was. */
  forget(side?: 0 | 1): void {
    for (let k = 0; k < this.prevOk.length; k++) if (side === undefined || Math.floor(k / STRUM_TIPS) === side) this.prevOk[k] = false;
  }

  /**
   * One hand's strumming fingertips this frame (guitar frame; null: not tracked): every string any of them crossed
   * since the last frame, in the order they were crossed, pushed to `out`.
   */
  strum(side: 0 | 1, tips: readonly (Vector3 | null)[], t: number, dt: number, out: Pluck[]): void {
    const from = out.length;
    for (let k = 0; k < STRUM_TIPS; k++) {
      const j = side * STRUM_TIPS + k;
      const p = tips[k];
      if (!p) {
        this.prevOk[j] = false;
        continue;
      }
      const q = this.prev[j];
      const was = this.prevOk[j];
      this.prevOk[j] = true;
      if (!was || dt <= 0) {
        q.copy(p);
        continue;
      }
      const dz = p.z - q.z;
      const jump = Math.hypot(p.x - q.x, p.y - q.y, dz);
      // (a tracking jump is not a strum; a hand drifting across slowly is resting, not playing)
      const vz = dz / dt;
      const inBand = (v: Vector3) => v.x > HG.strumX0 - 0.02 && v.x < HG.strumX1 + 0.02 && v.y < HG.strings + 0.014 && v.y > -0.05;
      if (jump < 0.15 && Math.abs(vz) > 0.1 && (inBand(p) || inBand(q))) {
        const xm = (p.x + q.x) / 2;
        for (let i = 0; i < 6; i++) {
          const zi = stringZ(i, xm);
          const a0 = q.z - zi;
          const a1 = p.z - zi;
          if (!((a0 < 0 && a1 >= 0) || (a0 > 0 && a1 <= 0))) continue;
          const f = (zi - q.z) / dz;
          // (the finger is at the strings' height where it crosses this one)
          const y = q.y + (p.y - q.y) * f;
          if (y > HG.strings + 0.014 || y < -0.05) continue;
          const at = t - dt * (1 - f);
          if (at - this.lastPluck[i] < 0.05) continue;
          this.lastPluck[i] = at;
          out.push({ string: i, vel: Math.max(0.2, Math.min(1, Math.abs(vz) / 1.4)), dir: dz > 0 ? 1 : -1, t: at, side });
        }
      }
      q.copy(p);
    }
    // (in the order the strings were crossed)
    if (out.length - from > 1) {
      const mine = out.splice(from).sort((a, b) => a.t - b.t);
      out.push(...mine);
    }
  }

  /**
   * The fretting fingertips of both hands this frame (guitar frame; null: not tracked or not fretting): the chord
   * place they're on (held a moment before it changes), and each string's fret. Returns the new chord place when it
   * just changed, else -1.
   */
  fret(tips: readonly (Vector3 | null)[], t: number): number {
    this.pressed.fill(-1);
    let low = 0;
    const frets = [0, 0, 0, 0, 0, 0];
    let any = false;
    for (const p of tips) {
      if (!p) continue;
      if (p.x < HG.nut - 0.005 || p.x > HG.join + 0.004) continue;
      if (Math.abs(p.z) > neckW(p.x) / 2 + 0.01) continue;
      if (p.y < HG.board - 0.03 || p.y > HG.strings + 0.012) continue;
      const n = Math.max(1, fretAt(p.x));
      const sp = HG.nutSp + (HG.saddleSp - HG.nutSp) * clamp01((p.x - HG.nut) / HG.scale);
      const s = Math.max(0, Math.min(5, Math.round(p.z / sp + 2.5)));
      frets[s] = Math.max(frets[s], n);
      this.pressed[s] = Math.max(this.pressed[s], n);
      low = low ? Math.min(low, n) : n;
      any = true;
    }
    this.onNeck = any;
    this.lowFret = low;
    // (real frets: what the fingers stop; a hand lost for a moment keeps its shape a little while)
    if (any) {
      for (let i = 0; i < 6; i++) this.frets[i] = frets[i];
      this.fretT = t;
    } else if (t - this.fretT > 0.15) this.frets.fill(0);
    if (!any) {
      this.candidate = -1;
      return -1;
    }
    const z = zoneOfFret(low);
    if (z === this.zone) {
      this.candidate = -1;
      return -1;
    }
    // (the hand settles on a new place for 40 ms before it counts: sliding past one isn't choosing it)
    if (z !== this.candidate) {
      this.candidate = z;
      this.candidateT = t;
    }
    if (t - this.candidateT >= 0.04 || this.zone < 0) {
      this.zone = z;
      this.candidate = -1;
      return z;
    }
    return -1;
  }

  /** Real frets: what each string sounds now (MIDI). */
  realNotes(out: number[]): number[] {
    for (let i = 0; i < 6; i++) out[i] = OPEN[i] + this.frets[i];
    return out;
  }
}

/** A chord's six strings for the assisted guitar (low to high; null: the string is left silent), from its voicing. */
export function stringsOf(voicing: readonly number[]): (number | null)[] {
  const out: (number | null)[] = [null, null, null, null, null, null];
  const off = 6 - voicing.length;
  for (let k = 0; k < voicing.length && k + off < 6; k++) out[k + off] = voicing[k];
  return out;
}
