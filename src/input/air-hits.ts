/**
 * Hits on surfaces in the air (a drum head on its stand, a key top, a kick's front head): a tracked point (a
 * fingertip, the palm, a stick's tip) crossing the surface the way you strike it, fast enough, mostly along its
 * normal. Loudness from the crossing speed, measured over three frames (one frame's difference is mostly tracking
 * noise). A point that has played stays "through" every surface until it comes back out by 2 cm: a hand resting on
 * the keys, or jittering on a head, plays once. A crossing too slow to be a hit isn't the end of it: for six frames,
 * while the point is still in, it plays as soon as it's moving fast enough (a gentle press that speeds up, or one the
 * tracking caught early). Keys fire a couple of millimetres in (`confirm`) instead of smoothing the height, so a
 * fingertip's shake can't press one and a press isn't delayed. Measured in tests/air-feel.test.ts.
 *
 * A key (`key`: the piano's keys, the marimba's bars) is played differently, as a key is: it goes down when a point
 * is in it, at any speed (a slow press plays, softly), including a finger sliding into it sideways (a glissando
 * plays every key it crosses); it comes back up when the point leaves it, rises out above it, or lifts partway (a
 * quick repeated note lifts a finger a centimetre, not out past the top), and goes down again as the point comes
 * back down; never quieter than KEY.minGain (a slow press is soft, not silent). One key down per point. Measured in tests/air-repeat.test.ts.
 * Pure: kit-local coordinates in, hits out; no scene, no audio.
 */

/** A surface to strike: a disc or a rectangle lying flat at height `y` (struck downward), or a disc standing facing
 * the player at `z` (struck away from you). Kit-local metres: x right, y up, z toward the player. `id` < 64. */
export interface AirSurface {
  id: number;
  face: 'up' | 'front';
  x: number;
  y: number;
  z: number;
  /** Disc radius (when set), else a rectangle `w` wide and `d` deep (up) or `d` tall (front). */
  r?: number;
  w?: number;
  d?: number;
  /** How much of the motion must be into it (default AIR.along; a strum brushes across, so less). */
  along?: number;
  /** How far back out a point must come before it can play it again (default AIR.rearm). */
  rearm?: number;
  /** Fire only this far through (m; default 0): keys, so a fingertip's tracking shake at the top can't press one. */
  confirm?: number;
  /** Played as a key (see above): `confirm` is how far in it goes down; `lift` how far up from its deepest lets it up
   * (default KEY.lift; a mallet shakes more than a fingertip, so a bar takes more), and down again by 0.6 of that. */
  key?: boolean;
  lift?: number;
  /** A key set into a table: only a tap goes down (a hand lowered onto the desk to rest presses nothing; the desk stops
   * every real press, quickly). */
  tap?: boolean;
  /**
   * A struck surface (not a key) played again without coming back out above it (m; default none): a point that has
   * played and risen this far from the deepest it went strikes again as it comes down by most of that, fast enough
   * (a quick second stroke lifts a hand or a stick a centimetre or two, not out past its 2 cm re-arm).
   */
  relift?: number;
  /** A disc tipped toward the player: its normal (unit; default straight up). Only for 'up' discs. */
  nx?: number;
  ny?: number;
  nz?: number;
}

export interface AirHit {
  surface: number;
  point: number;
  /** Crossing speed (m/s) and loudness 0..1. */
  speed: number;
  gain: number;
  /** How far through the surface it is on the frame it played (m): the point that led a slap is deepest. */
  depth: number;
  /** How long ago (s) it crossed: the moment of the hit, between this frame and the last (judge by it). */
  ago: number;
}

/**
 * Below `minSpeed` it's a touch or tracking noise, not a hit (m/s; a face-on surface, struck by reaching, needs
 * `frontSpeed`); `rearm` back out re-arms a point (m); the motion along the normal must be at least `along` of the
 * whole motion (a hand sliding past grazes nothing).
 */
export const AIR = { minSpeed: 0.2, frontSpeed: 0.6, fullSpeed: 1.4, rearm: 0.02, along: 0.6, keyMin: 0.08, stickMin: 0.4 } as const;
/** Frames a too-slow crossing is watched for (while still in) before it's let go. */
const WATCH = 6;
/**
 * Keys: a key comes up as its point rises KEY.lift from the deepest it went (on a lightly smoothed depth, within
 * `liftFrames`), or KEY.out above its top, or leaves it by `edge`; it goes down again as the point comes down by
 * 0.6 of the lift (within `dropFrames`: a slow drift isn't a press), or at once if it had come out above or from the side. A
 * point more than `deep` under a key isn't playing it (it's under the keyboard). Leaves a key only `edge` past it, so
 * a finger on the line between two keys doesn't flicker between them.
 */
export const KEY = { lift: 0.005, out: 0.004, minGain: 0.3, tapMin: 0.25, edge: 0.002, deep: 0.06, liftFrames: 18, dropFrames: 9 } as const;

/** How hard a crossing at `speed` m/s sounds (0.15 soft to 1 at `full`). */
export function airGain(speed: number, full: number = AIR.fullSpeed): number {
  return Math.max(0.15, Math.min(1, 0.15 + (0.85 * (speed - 0.3)) / Math.max(0.1, full - 0.3)));
}

function inside(s: AirSurface, x: number, y: number, z: number, grow = 0): boolean {
  // (the crossing point, on the surface: a disc by its distance from the centre in its own plane)
  if (s.r !== undefined) return s.r >= 0 && Math.hypot(x - s.x, y - s.y, z - s.z) <= s.r + grow;
  const b = s.face === 'up' ? z - s.z : y - s.y;
  return Math.abs(x - s.x) <= (s.w ?? 0) / 2 + grow && Math.abs(b) <= (s.d ?? 0) / 2 + grow;
}
/** Where a key's footprint is, from above: in a flat surface's rectangle or disc, whatever the height. */
function over(s: AirSurface, x: number, z: number, grow: number): boolean {
  if (s.r !== undefined) return s.r >= 0 && Math.hypot(x - s.x, z - s.z) <= s.r + grow;
  return Math.abs(x - s.x) <= (s.w ?? 0) / 2 + grow && Math.abs(z - s.z) <= (s.d ?? 0) / 2 + grow;
}
const BIG = 1;
/** Frames after sliding off a key that one slid onto plays (a glissando crosses the gap between keys in a frame or two). */
const SLIDE_FRAMES = 6;

/** The depth of a point through a surface (+: in front of or above it, −: through it). */
function side(s: AirSurface, x: number, y: number, z: number): number {
  if (s.face === 'up' && s.nx !== undefined) return (x - s.x) * s.nx + (y - s.y) * (s.ny ?? 1) + (z - s.z) * (s.nz ?? 0);
  return s.face === 'up' ? y - s.y : z - s.z;
}

const IDS = 64;

export class AirHits {
  private prev: Float32Array;
  private prev2: Float32Array;
  private prevDt: Float32Array;
  private seen: Uint8Array;
  /** Per point and surface id: through it now (waiting to come back out). */
  private through: Uint8Array;
  /** Per point and surface id: frames left watching a crossing that was too slow (0: not watching). */
  private slow: Uint8Array;
  /** Keys, per point and surface: down; the smoothed depth; the deepest while down, the highest while up; frames since. */
  private down: Uint8Array;
  private sm: Float32Array;
  private ext: Float32Array;
  private age: Uint8Array;
  /** Per point: the key it holds down (-1: none); frames left of a slide off one (a glissando's next key plays). */
  private held: Int16Array;
  private slid: Uint8Array;
  /** Struck surfaces with `relift`, per point and surface: lifted from the deepest, now watching for a stroke down. */
  private rel: Uint8Array;

  constructor(readonly points: number) {
    this.prev = new Float32Array(points * 3);
    this.prev2 = new Float32Array(points * 3);
    this.prevDt = new Float32Array(points);
    this.seen = new Uint8Array(points);
    this.through = new Uint8Array(points * IDS);
    this.slow = new Uint8Array(points * IDS);
    this.down = new Uint8Array(points * IDS);
    this.sm = new Float32Array(points * IDS);
    this.ext = new Float32Array(points * IDS);
    this.age = new Uint8Array(points * IDS);
    this.held = new Int16Array(points).fill(-1);
    this.slid = new Uint8Array(points);
    this.rel = new Uint8Array(points * IDS);
  }

  /** A struck surface it's through now: it waits to come out (or, with `relift`, to lift and come down again). */
  private through1(t: number, now: number): void {
    this.through[t] = 1;
    this.slow[t] = 0;
    this.sm[t] = now;
    this.ext[t] = now;
    this.age[t] = 0;
    this.rel[t] = 0;
  }

  /** Forget a point (it went untracked, isn't in use, or changed meaning: a stick appeared). */
  forget(p: number): void {
    this.seen[p] = 0;
  }

  /**
   * Point `p` is now at (x, y, z) after `dt` s. Each surface it crossed the right way, fast enough, inside, is a hit
   * pushed to `out` (at most one: one note per finger). Returns how many were added.
   */
  update(p: number, x: number, y: number, z: number, dt: number, surfaces: readonly AirSurface[], out: AirHit[], full: number = AIR.fullSpeed, min: number = AIR.minSpeed): number {
    const i = p * 3;
    const px = this.prev[i];
    const py = this.prev[i + 1];
    const pz = this.prev[i + 2];
    const qx = this.prev2[i];
    const qy = this.prev2[i + 1];
    const qz = this.prev2[i + 2];
    const qdt = this.prevDt[p];
    this.prev2[i] = px;
    this.prev2[i + 1] = py;
    this.prev2[i + 2] = pz;
    this.prev[i] = x;
    this.prev[i + 1] = y;
    this.prev[i + 2] = z;
    this.prevDt[p] = dt;
    if (this.seen[p] < 2) {
      // (where it starts, or comes back: through a surface already counts as having played it)
      if (!this.seen[p]) {
        this.held[p] = -1;
        for (const s of surfaces) {
          const t = p * IDS + s.id;
          const d = side(s, x, y, z);
          if (d < 0 && !s.key) this.through1(t, d);
          else this.through[t] = 0;
          this.slow[t] = 0;
          // (a key it starts in is held, not played; one it's over waits for a press)
          this.sm[t] = d;
          this.age[t] = 0;
          this.down[t] = 0;
          this.ext[t] = BIG;
          if (s.key && over(s, x, z, 0) && d > -KEY.deep) {
            if (d < 0 && this.held[p] < 0) {
              this.down[t] = 1;
              this.ext[t] = d;
              this.held[p] = s.id;
            } else this.ext[t] = d;
          }
        }
      }
      this.seen[p]++;
      return 0;
    }
    const moved = Math.hypot(x - px, y - py, z - pz);
    // keys first: the one held let up (or not), then any it's come into
    let keys = false;
    // (a key let go lately by sliding off it: a key it comes onto was slid into, a glissando)
    if (this.slid[p] > 0) this.slid[p]--;
    // (the top of the highest key it's inside, under its top: keys lower than that, under it, can't be pressed from
    // there; a finger in a black key isn't on the white keys beneath it)
    let shadow = -Infinity;
    for (const s of surfaces) {
      if (!s.key) continue;
      keys = true;
      const t = p * IDS + s.id;
      const now = side(s, x, y, z);
      const m = (this.sm[t] += (now - this.sm[t]) * 0.4);
      if (this.age[t] < 255) this.age[t]++;
      if (now < 0 && now > -KEY.deep && s.y > shadow && over(s, x, z, 0)) shadow = s.y;
      if (!this.down[t]) continue;
      // (held: the deepest it's been lately; up as it lifts from there, rises out, or leaves)
      if (m < this.ext[t] || this.age[t] > KEY.liftFrames) {
        this.ext[t] = Math.min(m, this.ext[t] + (this.age[t] > KEY.liftFrames ? 0.0005 : 0));
        if (m <= this.ext[t]) this.age[t] = 0;
      }
      const gone = !over(s, x, z, KEY.edge);
      if (gone || now < -KEY.deep || now > KEY.out || m - this.ext[t] > (s.lift ?? KEY.lift)) {
        this.down[t] = 0;
        this.held[p] = -1;
        // (out of it, to the side or above: in again plays at once; lifted, or gone under it: it has to come down)
        this.ext[t] = gone || now > KEY.out ? BIG : m;
        // (let up by a lift: a repeat may follow; any other way, it has to come from above again)
        this.rel[t] = !gone && now <= KEY.out && now >= -KEY.deep ? 1 : 0;
        this.age[t] = 0;
        if (gone) this.slid[p] = SLIDE_FRAMES;
      }
    }
    if (keys)
      for (const s of surfaces) {
        if (!s.key) continue;
        const t = p * IDS + s.id;
        if (this.down[t]) continue;
        const now = side(s, x, y, z);
        const m = this.sm[t];
        // (crossed its top this frame, from above: judged where it crossed, however deep it is now; a fast mallet goes
        // from over a bar to well under it in one frame, and on along its arc, off the bar)
        const c0 = s.confirm ?? 0;
        const was0 = side(s, px, py, pz);
        const crossed = was0 > -c0 && now <= -c0 && was0 > now && this.held[p] < 0;
        let ox = x;
        let oz = z;
        if (crossed) {
          const f = (was0 + c0) / (was0 - now);
          ox = px + (x - px) * f;
          oz = pz + (z - pz) * f;
        }
        if (now < -KEY.deep && !crossed) {
          this.ext[t] = m;
          continue;
        }
        if (!over(s, ox, oz, -KEY.edge / 4)) {
          // (off it: coming onto it from above plays at once; from the side, under its top, only in a glissando)
          if (!over(s, ox, oz, KEY.edge)) this.ext[t] = m > 0 ? BIG : m;
          continue;
        }
        if (crossed && this.ext[t] < BIG && this.ext[t] < 0 && was0 > 0) this.ext[t] = BIG;
        // (over it while holding another down, a black key over this white one: it waits for a stroke of its own, so
        // letting the black key up, still below this one's top, doesn't press it; slid into from one let go this
        // frame: in from the side)
        if (this.held[p] >= 0 || s.y < shadow - 0.003) {
          this.ext[t] = m;
          this.age[t] = 0;
          continue;
        }
        if (this.slid[p] > 0 && this.ext[t] < BIG && this.ext[t] < 0) this.ext[t] = BIG;
        // (up and over it: the highest it's been lately)
        // (from under it, gone stale: it starts again from here, so a slow drift never adds up to a press; from above, it
        // stays from above until it's pressed or left)
        if (m > this.ext[t] || (this.ext[t] <= 0 && this.age[t] > KEY.dropFrames)) {
          this.ext[t] = this.age[t] > KEY.dropFrames && this.ext[t] <= 0 ? m : Math.max(m, this.ext[t]);
          if (m >= this.ext[t]) this.age[t] = 0;
        }
        const c = s.confirm ?? 0;
        if (now > -c || this.held[p] >= 0) continue;
        // in: from above (or the side) it goes down as it passes `confirm` (fast: at once; slow: once its smoothed
        // depth is there too, so a shake at the top can't press it); a repeat once it's come down KEY.drop again
        const span = dt + qdt;
        const speed = span > 0 ? (side(s, qx, qy, qz) - now) / span : 0;
        const fromAbove = this.ext[t] > 0;
        // (a repeat moves down, too: the smoothed depth lags, and goes on falling a moment after a deep stroke turns back up)
        // (set into a table: a tap, as it comes through the top, or nothing; a finger resting under it never goes down)
        if (s.tap && fromAbove && (speed < Math.max(min, KEY.tapMin) || side(s, qx, qy, qz) <= -c)) continue;
        // (a repeat only after a lift from a press: a finger that never pressed it, lowered and resting, isn't one)
        if (!fromAbove && !this.rel[t]) continue;
        if (fromAbove ? speed < min && m > -c : this.ext[t] - m < (s.lift ?? KEY.lift) * 0.6 || speed < min * 0.5) continue;
        const was = side(s, px, py, pz);
        const lat = dt > 0 ? Math.sqrt(Math.max(0, moved * moved - (was - now) * (was - now))) / dt : 0;
        const v = Math.max(speed, 0.5 * lat, 0);
        const f = was + c > 0 && was > now ? (was + c) / (was - now) : 1;
        out.push({ surface: s.id, point: p, speed: v, gain: Math.max(KEY.minGain, airGain(v, full)), depth: -now, ago: (1 - Math.min(1, f)) * dt });
        this.down[t] = 1;
        this.rel[t] = 0;
        this.held[p] = s.id;
        this.ext[t] = m;
        this.age[t] = 0;
        // (every other key it's in waits for a press of its own)
        for (const q of surfaces) {
          if (!q.key || q === s) continue;
          const u = p * IDS + q.id;
          if (this.ext[u] < BIG) this.ext[u] = this.sm[u];
        }
        return 1;
      }
    for (const s of surfaces) {
      if (s.key) continue;
      const t = p * IDS + s.id;
      const now = side(s, x, y, z);
      if (this.through[t]) {
        if (now > (s.rearm ?? AIR.rearm)) {
          this.through[t] = 0;
          this.slow[t] = 0;
          continue;
        }
        const rl = s.relift;
        if (!rl) continue;
        // (the deepest it's been lately, then once it's lifted, the highest: a quick lift and a quick stroke)
        const m = (this.sm[t] += (now - this.sm[t]) * 0.4);
        const a = this.age[t] < 255 ? ++this.age[t] : 255;
        if (!this.rel[t]) {
          if (m < this.ext[t] || a > KEY.liftFrames) {
            this.ext[t] = Math.min(m, this.ext[t] + (a > KEY.liftFrames ? 0.0005 : 0));
            if (m <= this.ext[t]) this.age[t] = 0;
          } else if (m - this.ext[t] > rl) {
            this.rel[t] = 1;
            this.ext[t] = m;
            this.age[t] = 0;
          }
          continue;
        }
        if (m > this.ext[t] || a > KEY.dropFrames) {
          this.ext[t] = a > KEY.dropFrames ? m : Math.max(m, this.ext[t]);
          if (m >= this.ext[t]) this.age[t] = 0;
          continue;
        }
        if (this.ext[t] - m < rl * 0.6 || !inside(s, x, y, z)) continue;
        const span = dt + qdt;
        const speed = span > 0 ? (side(s, qx, qy, qz) - now) / span : 0;
        const was = side(s, px, py, pz);
        if (speed < min || (moved > 0 && was - now < (s.along ?? AIR.along) * moved)) continue;
        out.push({ surface: s.id, point: p, speed, gain: airGain(speed, full), depth: -now, ago: 0 });
        for (const q of surfaces) if (!q.key) this.through1(p * IDS + q.id, side(q, x, y, z));
        return 1;
      }
      const c = s.confirm ?? 0;
      const was = side(s, px, py, pz);
      const crossed = was + c > 0 && now + c <= 0;
      let watching = this.slow[t] > 0;
      // (back out without having played: free to cross again)
      if (watching && now > 0) {
        this.slow[t] = 0;
        watching = false;
      }
      if (!crossed && !watching) continue;
      // where it crossed, on the surface (watching: where it is)
      const f = crossed ? (was + c) / (was - now) : 1;
      const cx = px + (x - px) * f;
      const cy = py + (y - py) * f;
      const cz = pz + (z - pz) * f;
      if (!inside(s, cx, cy, cz)) {
        this.slow[t] = 0;
        continue;
      }
      // the speed into it over the last two frames
      const span = dt + qdt;
      const speed = span > 0 ? (side(s, qx, qy, qz) - now) / span : 0;
      if (speed < (s.face === 'front' ? Math.max(min, AIR.frontSpeed) : min)) {
        // too slow yet: watched a few frames while it's still in (then it's resting, and plays nothing)
        if (!watching) this.slow[t] = WATCH;
        else if (--this.slow[t] === 0) this.through1(t, now);
        continue;
      }
      // most of the motion must be into it, not across (a hand sliding past grazes nothing)
      if (moved > 0 && was - now < (s.along ?? AIR.along) * moved) {
        this.through1(t, now);
        continue;
      }
      out.push({ surface: s.id, point: p, speed, gain: airGain(speed, full), depth: -now, ago: crossed ? (1 - f) * dt : 0 });
      // one note per finger: nothing under it plays until it comes back out
      for (const q of surfaces) if (!q.key) this.through1(p * IDS + q.id, side(q, x, y, z));
      return 1;
    }
    return 0;
  }
}
