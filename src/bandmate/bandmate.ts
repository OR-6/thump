/**
 * The bandmate (pure): a rule-based musical agent. It is not an AI model; it listens and answers by
 * rules (DESIGN.md §3.8):
 *
 * - **Claims** one of your room's instruments (the most melodic one you've found) and plays it.
 * - **Calls:** a two-bar phrase on its instrument; you answer it in the next two bars.
 * - **Listens:** keeps your hits (when, which note, how hard). Answer well and its next call is a step
 *   busier; struggle and it plays a simpler one.
 * - **Echoes:** once you've answered with enough notes, it plays your own phrase back to you as its call.
 * - **Waits:** stop for a whole call and answer and it plays a soft count-in to bring you back.
 */
import { grid, type Note } from '../songs/chart.js';

/** Calls by level: two bars of scale degrees on its instrument (eighths). */
const CALLS: readonly string[][] = [
  ['0...2...|4.......', '4...2...|0.......', '0...4...|2.......'],
  ['0.2.4...|2...0...', '4.2.0...|2.4.....', '2.4.5...|4.......'],
  ['0.2.4.5.|4.2.....', '5.4.2...|0.2.4...', '0.4.2.5.|4...2...'],
  ['0.24.5..|7.5.4.2.', '7.5.42..|0.2.4...', '2.45.4.2|0...4.5.'],
];

export interface Heard {
  /** Beat (song clock) of the hit. */
  beat: number;
  /** The scale degree it played (−1 when not on a pitched instrument). */
  degree: number;
  vel: number;
}

export class Bandmate {
  /** How busy its calls are (0–3). */
  level = 0;
  private variant = 0;
  /** Your hits, newest last (the last four bars). */
  readonly heard: Heard[] = [];
  private echoed = false;
  /** Beat of your last hit. */
  lastHitBeat = -Infinity;

  /** You played. */
  hear(h: Heard): void {
    this.heard.push(h);
    while (this.heard.length && this.heard[0].beat < h.beat - 16) this.heard.shift();
    this.lastHitBeat = h.beat;
  }

  /** How your answer went (share of its notes you matched in time): busier after a good one, simpler after a hard one. */
  report(share: number): void {
    if (share >= 0.8) this.level = Math.min(CALLS.length - 1, this.level + 1);
    else if (share < 0.45) this.level = Math.max(0, this.level - 1);
    this.variant++;
  }

  /** The two-bar call starting at `bar` (absolute beats), as degrees on its instrument. */
  call(bar: number): Note[] {
    const pool = CALLS[this.level];
    return grid({ melody: pool[this.variant % pool.length] }, bar);
  }

  /**
   * Your own phrase from beats [from, to), quantised to eighths and moved to start at `bar`, once a jam,
   * when you played at least three notes: it plays your groove back to you.
   */
  echo(from: number, to: number, bar: number): Note[] | null {
    if (this.echoed) return null;
    const seen = new Set<number>();
    const out: Note[] = [];
    for (const h of this.heard) {
      if (h.beat < from - 0.1 || h.beat >= to) continue;
      const q = Math.round((h.beat - from) * 2) / 2;
      if (q < 0 || q >= to - from || seen.has(q)) continue;
      seen.add(q);
      out.push({ beat: bar * 4 + q, part: 'melody', degree: Math.max(0, h.degree), vel: Math.min(1, Math.max(0.5, h.vel)) });
    }
    if (out.length < 3) return null;
    this.echoed = true;
    return out.sort((a, b) => a.beat - b.beat);
  }

  /** Your answer to a call: the same notes, two bars later. */
  static answer(call: readonly Note[]): Note[] {
    return call.map((n) => ({ ...n, beat: n.beat + 8 }));
  }

  /** You've played nothing for a whole call and answer (16 beats). */
  idle(nowBeat: number): boolean {
    return nowBeat - this.lastHitBeat >= 16;
  }
}
