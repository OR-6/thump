/**
 * The waterfall's plain logic, kept apart from the drawing so it can be tested: the path a note takes to its target
 * (straight down, a short arc, or along the guitar's neck), which form a note takes on each instrument, the streak's
 * look (×10, ×25, ×50) and how it cools when the run breaks, a fixed pool of sparks, and the memory of which notes
 * already burst (so a hit throws its sparks once). No allocation after construction.
 */

/** How far a note falls per beat (m), and how many beats ahead it shows. */
export const FALL_PER_BEAT = 0.07;
export const SHOW_BEATS = 3;
/** The short arc onto a handpan field or a marimba bar: from this far back (m) and this high at its top. */
export const ARC_BACK = 0.2;
export const ARC_UP = 0.15;
/** Along the guitar's neck: this far per beat (m), a hair above the fretboard. */
export const SLIDE_PER_BEAT = 0.045;
export const SLIDE_LIFT = 0.01;

export type NoteForm = 'fall' | 'arc' | 'neck' | 'strum' | 'disc' | 'cymbal';
export type PathKind = 'fall' | 'arc' | 'slide';

/** A note's form by its key (`kit:hat`, `piano:4`, `guitar:9`…) and whether its target is round. */
export function formOf(key: string, round: boolean): NoteForm {
  if (key.startsWith('kit:')) return key === 'kit:hat' || key === 'kit:gong' ? 'cymbal' : 'disc';
  if (key.startsWith('guitar:')) return key === 'guitar:9' ? 'strum' : key.length === 8 && key.charCodeAt(7) <= 50 ? 'neck' : 'fall';
  if (key.startsWith('handpan:') || key.startsWith('marimba:')) return 'arc';
  if (key.startsWith('piano:') || key.startsWith('keys:')) return 'fall';
  return round ? 'disc' : 'fall';
}

export function pathOf(form: NoteForm): PathKind {
  return form === 'arc' ? 'arc' : form === 'neck' ? 'slide' : 'fall';
}

/** Where a note is on its way, from its target: `up` along the instrument's up, `along` along its approach (m), and the unit direction it moves in. */
export interface PathPoint {
  up: number;
  along: number;
  /** Direction of travel (toward the target), in (up, along) components; a unit vector. */
  du: number;
  da: number;
}

/**
 * The point `ahead` beats before landing. Straight down: `ahead × FALL_PER_BEAT` above. The arc: from `ARC_BACK`
 * behind and `ARC_UP` above (its top) down onto the target, steepest as it lands. The neck: along it, just above.
 */
export function notePath(kind: PathKind, ahead: number, out: PathPoint): PathPoint {
  const a = Math.max(0, ahead);
  if (kind === 'arc') {
    const s = Math.min(1, a / SHOW_BEATS);
    out.up = ARC_UP * s * (2 - s);
    out.along = ARC_BACK * s;
    // d/ds of (up, along), reversed (it travels toward s = 0)
    const u = -ARC_UP * (2 - 2 * s);
    const g = -ARC_BACK;
    const l = Math.hypot(u, g);
    out.du = u / l;
    out.da = g / l;
    return out;
  }
  if (kind === 'slide') {
    out.up = SLIDE_LIFT * Math.min(1, a) + 0.002;
    out.along = a * SLIDE_PER_BEAT;
    out.du = 0;
    out.da = -1;
    return out;
  }
  out.up = a * FALL_PER_BEAT;
  out.along = 0;
  out.du = -1;
  out.da = 0;
  return out;
}

/** The streak's level: 0 below ×10, then 1 (×10), 2 (×25), 3 (×50). */
export function streakLevel(combo: number): number {
  return combo >= 50 ? 3 : combo >= 25 ? 2 : combo >= 10 ? 1 : 0;
}

/**
 * How hot the lane looks, 0–3, following the streak: up to a new level in about a third of a second, and back
 * down over one bar when the run breaks. The looks below read off it.
 */
export class StreakLook {
  heat = 0;
  private from = 0;

  step(combo: number, dt: number, barS: number): void {
    const to = streakLevel(combo);
    if (to >= this.heat) {
      this.heat = Math.min(to, this.heat + dt * 3);
      this.from = this.heat;
    } else {
      // (cools from where it was to the new level in one bar, however far it falls)
      this.heat = Math.max(to, this.heat - (dt * Math.max(0.5, this.from - to)) / Math.max(0.25, barS));
    }
  }
  reset(): void {
    this.heat = 0;
    this.from = 0;
  }
  /** ×10: the halos widen. */
  get halo(): number {
    return 1 + 0.6 * Math.min(1, this.heat);
  }
  /** ×25: a gold edge on the notes, brighter beat lines. */
  get gold(): number {
    return Math.max(0, Math.min(1, this.heat - 1));
  }
  /** ×50: sparks trail every note and the aurora quickens. */
  get trail(): number {
    return Math.max(0, Math.min(1, this.heat - 2));
  }
}

/**
 * A fixed pool of sparks, simulated on the CPU (a few hundred is nothing): each falls under a little gravity, lands
 * on the floor it was born over (the key or head it came from), skids, and drops off past that floor's edge. When
 * the pool is full the oldest spark makes way.
 */
export class SparkPool {
  readonly cap: number;
  readonly p: Float32Array;
  readonly v: Float32Array;
  /** Where it was born (the floor's centre). */
  readonly o: Float32Array;
  readonly col: Float32Array;
  readonly age: Float32Array;
  readonly life: Float32Array;
  readonly size: Float32Array;
  /** The floor's radius (m) round where it was born; 0 for none. */
  readonly floor: Float32Array;
  /** Gravity scale (1 a spark, small for drifting ash). */
  readonly grav: Float32Array;
  private next = 0;

  constructor(cap = 400) {
    this.cap = cap;
    this.p = new Float32Array(cap * 3);
    this.v = new Float32Array(cap * 3);
    this.o = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.age = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.size = new Float32Array(cap);
    this.floor = new Float32Array(cap);
    this.grav = new Float32Array(cap);
  }

  /** How many are alive. */
  get alive(): number {
    let n = 0;
    for (let i = 0; i < this.cap; i++) if (this.age[i] < this.life[i]) n++;
    return n;
  }

  /** A slot for a new spark: a dead one if there is one near the ring's head, else the oldest. */
  alloc(): number {
    let best = this.next;
    let oldest = -1;
    for (let k = 0; k < this.cap; k++) {
      const i = (this.next + k) % this.cap;
      if (this.age[i] >= this.life[i]) {
        best = i;
        oldest = -2;
        break;
      }
      if (this.age[i] / this.life[i] > oldest) {
        oldest = this.age[i] / this.life[i];
        best = i;
      }
    }
    this.next = (best + 1) % this.cap;
    return best;
  }

  spawn(px: number, py: number, pz: number, vx: number, vy: number, vz: number, r: number, g: number, b: number, life: number, size: number, floor: number, grav = 1): number {
    const i = this.alloc();
    const j = i * 3;
    this.p[j] = this.o[j] = px;
    this.p[j + 1] = this.o[j + 1] = py;
    this.p[j + 2] = this.o[j + 2] = pz;
    this.v[j] = vx;
    this.v[j + 1] = vy;
    this.v[j + 2] = vz;
    this.col[j] = r;
    this.col[j + 1] = g;
    this.col[j + 2] = b;
    this.age[i] = 0;
    this.life[i] = life;
    this.size[i] = size;
    this.floor[i] = floor;
    this.grav[i] = grav;
    return i;
  }

  /** Move them all on by `dt`; `ux, uy, uz` is up (gravity pulls the other way, floors face it). */
  step(dt: number, ux: number, uy: number, uz: number): void {
    const G = 2.2;
    for (let i = 0; i < this.cap; i++) {
      if (this.age[i] >= this.life[i]) continue;
      this.age[i] += dt;
      const j = i * 3;
      const g = G * this.grav[i] * dt;
      this.v[j] -= ux * g;
      this.v[j + 1] -= uy * g;
      this.v[j + 2] -= uz * g;
      // a little air drag
      const drag = 1 - 1.6 * dt;
      this.v[j] *= drag;
      this.v[j + 1] *= drag;
      this.v[j + 2] *= drag;
      this.p[j] += this.v[j] * dt;
      this.p[j + 1] += this.v[j + 1] * dt;
      this.p[j + 2] += this.v[j + 2] * dt;
      const f = this.floor[i];
      if (f <= 0) continue;
      const dx = this.p[j] - this.o[j];
      const dy = this.p[j + 1] - this.o[j + 1];
      const dz = this.p[j + 2] - this.o[j + 2];
      const h = dx * ux + dy * uy + dz * uz;
      if (h >= 0) continue;
      // over its floor: it lands and skids (bounces a little, rubs off speed); past the edge it falls on
      const sx = dx - ux * h;
      const sy = dy - uy * h;
      const sz = dz - uz * h;
      if (sx * sx + sy * sy + sz * sz > f * f) continue;
      this.p[j] -= ux * h;
      this.p[j + 1] -= uy * h;
      this.p[j + 2] -= uz * h;
      const vn = this.v[j] * ux + this.v[j + 1] * uy + this.v[j + 2] * uz;
      if (vn < 0) {
        this.v[j] -= ux * vn * 1.3;
        this.v[j + 1] -= uy * vn * 1.3;
        this.v[j + 2] -= uz * vn * 1.3;
      }
      const rub = 1 - 1.2 * dt;
      this.v[j] *= rub;
      this.v[j + 1] *= rub;
      this.v[j + 2] *= rub;
    }
  }

  clear(): void {
    this.age.fill(0);
    this.life.fill(0);
  }
}

/**
 * Which notes already did their thing (burst, or turned to ash): by key and beat, the last `cap` of them. A note
 * shows for a few frames after it's hit; this keeps its burst to the first.
 */
export class NoteMemo {
  private keys: string[];
  private beats: Float64Array;
  private next = 0;

  constructor(cap = 64) {
    this.keys = new Array<string>(cap).fill('');
    this.beats = new Float64Array(cap).fill(Number.NaN);
  }

  has(key: string, beat: number): boolean {
    for (let i = 0; i < this.keys.length; i++) if (this.keys[i] === key && Math.abs(this.beats[i] - beat) < 0.05) return true;
    return false;
  }

  /** Remember it; true if it's new (false if it was already remembered). */
  mark(key: string, beat: number): boolean {
    if (this.has(key, beat)) return false;
    this.keys[this.next] = key;
    this.beats[this.next] = beat;
    this.next = (this.next + 1) % this.keys.length;
    return true;
  }

  clear(): void {
    this.keys.fill('');
    this.beats.fill(Number.NaN);
  }
}
