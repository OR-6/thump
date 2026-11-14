import { describe, expect, it } from 'vitest';
import { ScoreKeeper, keepBest, letterFor, maxScore, multFor, traceAt } from '../src/songs/scoring';

describe('points', () => {
  it('a streak multiplies: ×2 from ten in a row, up to ×4', () => {
    expect([0, 9, 10, 19, 20, 30, 99].map(multFor)).toEqual([1, 1, 2, 2, 3, 4, 4]);
    const k = new ScoreKeeper();
    for (let i = 0; i < 9; i++) k.hit('perfect');
    expect(k.score).toBe(900);
    const e = k.hit('perfect');
    expect(e.multUp).toBe(true);
    expect(e.points).toBe(200);
    expect(k.hit('good').points).toBe(100);
  });
  it('a miss takes the multiplier back and says how long the run was', () => {
    const k = new ScoreKeeper();
    for (let i = 0; i < 24; i++) k.hit('perfect');
    expect(k.missed().broke).toBe(24);
    expect(k.mult).toBe(1);
    expect(k.missed().broke).toBe(0);
    expect(k.maxCombo).toBe(24);
  });
  it('runs of 25 and 50 are milestones', () => {
    const k = new ScoreKeeper();
    const ms: number[] = [];
    for (let i = 0; i < 60; i++) {
      const e = k.hit('perfect');
      if (e.milestone) ms.push(e.milestone);
    }
    expect(ms).toEqual([25, 50]);
  });
});

describe('the result', () => {
  it('accuracy weighs a Good at 60 %, and notes never judged count as missed', () => {
    const k = new ScoreKeeper();
    for (let i = 0; i < 8; i++) k.hit('perfect');
    k.hit('good');
    k.hit('good');
    const s = k.summary(10);
    expect(s.accuracy).toBeCloseTo(0.92, 5);
    expect(s.letter).toBe('A');
    expect(s.fullCombo).toBe(true);
    expect(s.allPerfect).toBe(false);
    const t = k.summary(12);
    expect(t.miss).toBe(2);
    expect(t.fullCombo).toBe(false);
  });
  it('grades from accuracy', () => {
    expect([1, 0.95, 0.9, 0.8, 0.7, 0.3].map(letterFor)).toEqual(['S', 'S', 'A', 'B', 'C', 'D']);
  });
  it('all perfect is the most a song can score', () => {
    const k = new ScoreKeeper();
    for (let i = 0; i < 45; i++) k.hit('perfect');
    expect(k.score).toBe(maxScore(45));
    expect(k.summary(45).allPerfect).toBe(true);
  });
  it('keeps the better run, and says when you beat it', () => {
    const a = new ScoreKeeper();
    for (let i = 0; i < 5; i++) a.hit('good');
    const first = keepBest(undefined, a.summary(5));
    expect(first.better).toBe(false);
    const b = new ScoreKeeper();
    for (let i = 0; i < 5; i++) b.hit('perfect');
    const second = keepBest(first.best, b.summary(5));
    expect(second.better).toBe(true);
    expect(second.best.score).toBe(500);
    expect(keepBest(second.best, a.summary(5)).better).toBe(false);
  });
});

describe('the spotlight and your best', () => {
  it('the spotlight doubles a note on top of the streak', () => {
    const k = new ScoreKeeper();
    for (let i = 0; i < 10; i++) k.hit('perfect');
    k.boost = 2;
    expect(k.hit('perfect').points).toBe(400);
  });
  it('your best is kept bar by bar, and raced between bars', () => {
    const a = new ScoreKeeper();
    for (let i = 0; i < 5; i++) a.hit('perfect');
    const kept = keepBest(undefined, a.summary(5), [0, 200, 500]).best;
    expect(kept.trace).toEqual([0, 200, 500]);
    expect(traceAt(kept.trace!, 0.5)).toBe(100);
    expect(traceAt(kept.trace!, 1.5)).toBe(350);
    expect(traceAt(kept.trace!, 9)).toBe(500);
  });
});
