/**
 * Timing judge (pure). Notes are timed in song seconds; a hit on a lane takes the nearest unjudged
 * note of that lane inside the good window. No miss penalty beyond the crowd going quieter: a
 * note never hit is simply 'miss' once its window has passed. Stars from the share of perfect and
 * good notes (PLAN §3.5).
 */
import { TIMING, type Lane } from '../config.js';
import type { Note } from './chart.js';

export type Grade = 'perfect' | 'good' | 'miss';

export interface JudgedNote {
  beat: number;
  lane: Lane;
  vel: number;
  /** Song seconds. */
  t: number;
  grade: Grade | null;
  /** Seconds early (−) or late (+). */
  offset: number;
}

export interface Windows {
  perfect: number;
  good: number;
}

export function windows(slow: boolean): Windows {
  const k = slow ? TIMING.slowWiden : 1;
  return { perfect: TIMING.perfectS * k, good: TIMING.goodS * k };
}

export interface HitResult {
  grade: Grade;
  index: number;
  offset: number;
}

export interface Summary {
  perfect: number;
  good: number;
  miss: number;
  total: number;
  /** Share of notes good or better. */
  share: number;
  stars: 1 | 2 | 3;
}

export function starsFor(share: number): 1 | 2 | 3 {
  return share >= TIMING.threeStars ? 3 : share >= TIMING.twoStars ? 2 : 1;
}

export class NoteJudge {
  readonly notes: JudgedNote[] = [];
  private cursor = 0;
  private readonly res: HitResult = { grade: 'miss', index: -1, offset: 0 };

  constructor(
    notes: readonly Note[],
    private spb: number,
    public win: Windows = windows(false),
  ) {
    this.add(notes);
  }

  /** Add notes (an answer written live); kept sorted by time. */
  add(notes: readonly Note[]): void {
    for (const n of notes) this.notes.push({ beat: n.beat, lane: n.lane, vel: n.vel, t: n.beat * this.spb, grade: null, offset: 0 });
    this.notes.sort((a, b) => a.t - b.t);
    // a note added behind the cursor must still be judged
    this.cursor = 0;
    while (this.cursor < this.notes.length && this.notes[this.cursor].grade !== null) this.cursor++;
  }

  /**
   * A hit on `lane` at song time `t` (already corrected by the calibration offset).
   * @returns the graded note (a reused object), or null for a hit no note wanted.
   */
  hit(lane: Lane, t: number): HitResult | null {
    let best = -1;
    let bestD = Infinity;
    for (let i = this.cursor; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.t - t > this.win.good) break;
      if (n.grade !== null || n.lane !== lane) continue;
      const d = Math.abs(t - n.t);
      if (d <= this.win.good && d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0) return null;
    const n = this.notes[best];
    n.offset = t - n.t;
    n.grade = bestD <= this.win.perfect ? 'perfect' : 'good';
    this.res.grade = n.grade;
    this.res.index = best;
    this.res.offset = n.offset;
    this.advance();
    return this.res;
  }

  /** Notes whose window has passed by song time `t` become misses; calls `onMiss` for each. */
  sweep(t: number, onMiss?: (n: JudgedNote, i: number) => void): void {
    for (let i = this.cursor; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.t + this.win.good >= t) break;
      if (n.grade === null) {
        n.grade = 'miss';
        onMiss?.(n, i);
      }
    }
    this.advance();
  }

  private advance(): void {
    while (this.cursor < this.notes.length && this.notes[this.cursor].grade !== null) this.cursor++;
  }

  /** All notes judged? */
  get done(): boolean {
    return this.cursor >= this.notes.length;
  }

  summary(): Summary {
    let perfect = 0;
    let good = 0;
    let miss = 0;
    for (const n of this.notes) {
      if (n.grade === 'perfect') perfect++;
      else if (n.grade === 'good') good++;
      else miss++;
    }
    const total = this.notes.length;
    const share = total ? (perfect + good) / total : 1;
    return { perfect, good, miss, total, share, stars: starsFor(share) };
  }
}

/** Copy mode passes when this many of the pattern's notes landed (3 of 4, PLAN §3.5). */
export function copyNeeds(n: number): number {
  return Math.max(1, Math.ceil(n * 0.75));
}

/**
 * Tap-along calibration: the median gap between each tap and its nearest click (s, + = late).
 * Null with fewer than 3 usable taps. Clamped to ±0.25 s.
 */
export function estimateOffset(clicks: readonly number[], taps: readonly number[]): number | null {
  const gaps: number[] = [];
  for (const t of taps) {
    let best = Infinity;
    for (const c of clicks) if (Math.abs(t - c) < Math.abs(best)) best = t - c;
    if (Math.abs(best) <= 0.3) gaps.push(best);
  }
  if (gaps.length < 3) return null;
  gaps.sort((a, b) => a - b);
  const m = gaps.length % 2 ? gaps[(gaps.length - 1) / 2] : (gaps[gaps.length / 2 - 1] + gaps[gaps.length / 2]) / 2;
  return Math.max(-0.25, Math.min(0.25, m));
}
