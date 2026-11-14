/**
 * A song's points (pure): every note you hit scores, more in a streak; the streak's multiplier climbs every ten notes
 * in a row to ×4 and a miss takes it back to ×1. Accuracy weighs a Perfect fully and a Good at 60 %. The grade is
 * from accuracy (S, A, B, C, D), with Full Combo (no miss) and All Perfect on top. No fail: every song finishes.
 */
export type Letter = 'S' | 'A' | 'B' | 'C' | 'D';

export const POINTS = { perfect: 100, good: 50 } as const;
/** Notes in a row for each step of the multiplier (×2 at 10, ×3 at 20, ×4 at 30). */
export const STEP = 10;
export const MAX_MULT = 4;
/** Runs worth a shout as you reach them. */
export const MILESTONES = [25, 50, 100, 150, 200, 300, 400, 500] as const;
/** A run this long breaking is worth a sound. */
export const BREAK_AT = 10;
/** How much a Good counts toward accuracy. */
export const GOOD_WEIGHT = 0.6;

export const multFor = (combo: number) => Math.min(MAX_MULT, 1 + Math.floor(combo / STEP));

export function letterFor(acc: number): Letter {
  return acc >= 0.95 ? 'S' : acc >= 0.88 ? 'A' : acc >= 0.78 ? 'B' : acc >= 0.65 ? 'C' : 'D';
}

/** What one judged note did. */
export interface ScoreEvent {
  /** Points it added (0 for a miss). */
  points: number;
  /** The multiplier now, and whether this note raised it. */
  mult: number;
  multUp: boolean;
  /** A run milestone just reached (0: none), or the length of a run that just broke (0: none worth telling). */
  milestone: number;
  broke: number;
}

export interface ScoreSummary {
  score: number;
  perfect: number;
  good: number;
  miss: number;
  total: number;
  maxCombo: number;
  /** 0..1. */
  accuracy: number;
  letter: Letter;
  fullCombo: boolean;
  allPerfect: boolean;
}

export class ScoreKeeper {
  score = 0;
  combo = 0;
  maxCombo = 0;
  perfect = 0;
  good = 0;
  miss = 0;
  private readonly ev: ScoreEvent = { points: 0, mult: 1, multUp: false, milestone: 0, broke: 0 };

  reset(): void {
    this.score = this.combo = this.maxCombo = this.perfect = this.good = this.miss = 0;
  }

  get mult(): number {
    return multFor(this.combo);
  }

  /** A note hit. The returned event is reused: read it before the next call. */
  hit(grade: 'perfect' | 'good'): ScoreEvent {
    const before = this.mult;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    if (grade === 'perfect') this.perfect++;
    else this.good++;
    const mult = this.mult;
    const e = this.ev;
    e.points = POINTS[grade] * mult;
    this.score += e.points;
    e.mult = mult;
    e.multUp = mult > before;
    e.milestone = (MILESTONES as readonly number[]).includes(this.combo) ? this.combo : 0;
    e.broke = 0;
    return e;
  }

  /** A note let go by. */
  missed(): ScoreEvent {
    const e = this.ev;
    e.broke = this.combo >= BREAK_AT ? this.combo : 0;
    this.combo = 0;
    this.miss++;
    e.points = 0;
    e.mult = 1;
    e.multUp = false;
    e.milestone = 0;
    return e;
  }

  /** Accuracy over the notes judged so far (1 before any). */
  get accuracy(): number {
    const n = this.perfect + this.good + this.miss;
    return n ? (this.perfect + GOOD_WEIGHT * this.good) / n : 1;
  }

  /** The song's result; `total` is every note the song asked for (any never judged count as missed). */
  summary(total: number): ScoreSummary {
    const judged = this.perfect + this.good + this.miss;
    const miss = this.miss + Math.max(0, total - judged);
    const n = Math.max(total, judged);
    const accuracy = n ? (this.perfect + GOOD_WEIGHT * this.good) / n : 0;
    return {
      score: this.score,
      perfect: this.perfect,
      good: this.good,
      miss,
      total: n,
      maxCombo: this.maxCombo,
      accuracy,
      letter: letterFor(accuracy),
      fullCombo: n > 0 && miss === 0,
      allPerfect: n > 0 && miss === 0 && this.good === 0,
    };
  }
}

/** The most a song of `n` notes can score (every note Perfect in one run). */
export function maxScore(n: number): number {
  let s = 0;
  for (let c = 1; c <= n; c++) s += POINTS.perfect * multFor(c);
  return s;
}

/** A best kept per song and level. */
export interface BestRun {
  score: number;
  accuracy: number;
  letter: Letter;
  fullCombo: boolean;
}

/** Keep the better of two runs (by score); says whether the new one beat the old. */
export function keepBest(old: BestRun | undefined, run: ScoreSummary): { best: BestRun; better: boolean } {
  const mine: BestRun = { score: run.score, accuracy: Math.round(run.accuracy * 1000) / 1000, letter: run.letter, fullCombo: run.fullCombo };
  if (!old) return { best: mine, better: false };
  if (run.score > old.score) return { best: { ...mine, fullCombo: mine.fullCombo || old.fullCombo }, better: true };
  return { best: { ...old, fullCombo: old.fullCombo || mine.fullCombo }, better: false };
}

const NEXT: Record<Letter, Letter | null> = { S: null, A: 'S', B: 'A', C: 'B', D: 'C' };
const FLOOR: Record<Letter, number> = { S: 0.95, A: 0.88, B: 0.78, C: 0.65, D: 0 };
const n0 = (v: number) => Math.round(v).toLocaleString('en-GB');
/** One line that makes you want one more go: how far past your best, how far short of it, or what the next grade needs. */
export function hookFor(run: ScoreSummary, prev: BestRun | undefined, better: boolean): string {
  if (better && prev) return `New best, up ${n0(run.score - prev.score)}`;
  if (prev && run.score < prev.score) return `${n0(prev.score - run.score)} short of your best`;
  const next = NEXT[run.letter];
  if (next) return `${Math.max(1, Math.ceil((FLOOR[next] - run.accuracy) * 100))}% more for ${next}`;
  if (!run.fullCombo) return run.miss === 1 ? 'One miss from a full combo' : `${run.miss} misses from a full combo`;
  return run.allPerfect ? 'Every note perfect' : 'Full combo';
}
