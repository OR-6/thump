/**
 * The bandmate (pure): a rule-based musical agent, a felt bird with a tiny drum. It is not "AI";
 * it listens and answers by rules (PLAN §3.9):
 *
 * - **Listens:** keeps your hits (pad, beat, how hard) from the last two bars and how your last
 *   answer went.
 * - **Answers:** in a call-and-response song it plays a two-bar call you then echo. Answer well
 *   and its next call is a step busier (it adds a hat, moves the kick); struggle and it plays a
 *   simpler one. It never plays a pad you haven't unlocked.
 * - **Nudges:** keep hitting a pad late and it plays that pad a beat early, twice, as a hint.
 * - **Waits:** stop for four bars and it plays a soft count-in to bring you back.
 */
import type { Lane } from '../config.js';
import { grid, type Note } from '../songs/chart.js';

/** Calls by level, two bars each (eighths). Lanes a player hasn't unlocked are dropped. */
const CALLS: readonly Partial<Record<Lane, string>>[][] = [
  // 0: quarter-note talk
  [
    { kick: 'x...x...|x...x...', snare: '..x...x.|..x...x.' },
    { kick: 'x.......|x...x...', snare: '..x.x...|..x...x.' },
  ],
  // 1: a hat joins
  [
    { kick: 'x...x...|x...x...', snare: '..x...x.|..x.....', hat: '........|......x.' },
    { kick: 'x...x...|x.......', snare: '..x...x.|....x...', hat: '.x...x..|..x...x.' },
  ],
  // 2: the kick moves, a tom answers
  [
    { kick: 'x..x....|x..x....', snare: '..x...x.|..x.....', tom: '........|....x.x.' },
    { kick: 'x...x.x.|x.......', snare: '..x.....|..x.x...', hat: '.x.x.x.x|........', tom: '........|......xx' },
  ],
  // 3: busy
  [
    { kick: 'x..x.x..|x..x....', snare: '..x...x.|..x...x.', hat: '.x...x.x|.x...x..', tom: '........|.......x' },
    { kick: 'x.x...x.|x..x....', snare: '....x...|..x.x.x.', hat: 'x.x.x.x.|x.x.....' },
  ],
];

export interface AnswerReport {
  /** Share of the answer's notes you got good or better. */
  share: number;
}

export interface Heard {
  lane: Lane;
  beat: number;
  vel: number;
  /** Seconds late (+) or early (−) against the note it matched, if any. */
  offset: number | null;
}

export class Bandmate {
  /** How busy its calls are (0–3). */
  level = 0;
  private variant = 0;
  /** Your hits from the last two bars. */
  readonly heard: Heard[] = [];
  /** Late streak per pad: consecutive late hits (> 40 ms). */
  private late = new Map<Lane, number>();
  /** Beat of your last hit. */
  lastHitBeat = -Infinity;

  constructor(public unlocked: readonly Lane[]) {}

  /** You hit a pad. */
  hear(h: Heard): void {
    this.heard.push(h);
    while (this.heard.length && this.heard[0].beat < h.beat - 8) this.heard.shift();
    this.lastHitBeat = h.beat;
    if (h.offset !== null) this.late.set(h.lane, h.offset > 0.04 ? (this.late.get(h.lane) ?? 0) + 1 : 0);
  }

  /** Your tempo feel: hits per bar over the last two bars. */
  density(nowBeat: number): number {
    let n = 0;
    for (const h of this.heard) if (h.beat >= nowBeat - 8) n++;
    return n / 2;
  }

  /** How your last answer went: busier calls after a good one, simpler after a hard one. */
  report(r: AnswerReport): void {
    if (r.share >= 0.85) this.level = Math.min(CALLS.length - 1, this.level + 1);
    else if (r.share < 0.5) this.level = Math.max(0, this.level - 1);
    this.variant++;
  }

  /** The two-bar call starting at `bar` (its notes, absolute beats), using only unlocked pads. */
  call(bar: number): Note[] {
    const pool = CALLS[this.level];
    const pick = pool[this.variant % pool.length];
    const lanes: Partial<Record<Lane, string>> = {};
    for (const [lane, text] of Object.entries(pick) as [Lane, string][]) if (this.unlocked.includes(lane)) lanes[lane] = text;
    return grid(lanes, bar);
  }

  /** Your answer to a call: the same notes, two bars later. */
  static answer(call: readonly Note[]): Note[] {
    return call.map((n) => ({ ...n, beat: n.beat + 8 }));
  }

  /** A pad you keep hitting late (3 in a row), or null: it plays that pad a beat early, twice. */
  nudge(): Lane | null {
    for (const [lane, n] of this.late) if (n >= 3) {
      this.late.set(lane, 0);
      return lane;
    }
    return null;
  }

  /** You've stopped for four bars: time for a soft count-in. */
  idle(nowBeat: number): boolean {
    return nowBeat - this.lastHitBeat >= 16;
  }
}
