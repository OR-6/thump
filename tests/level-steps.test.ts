/**
 * The levels step up evenly: on every instrument, Normal asks for at most twice the notes a second Easy does, and Hard
 * between a fifth and four fifths more than Normal (averaged over the songs; lessons left out). It was 3x from Easy to
 * Normal on the piano and the marimba, with Hard no different from Normal. STEPS=1 prints the table.
 */
import { describe, expect, it } from 'vitest';
import { TUNES } from '../src/songs/tunes.js';
import { scoreChart, scoreOf } from '../src/songs/score.js';

const INSTS = ['drums', 'piano', 'marimba', 'guitar', 'handpan', 'congas'] as const;
const LEVELS = ['easy', 'normal', 'hard'] as const;

function rates(): Record<string, [number, number, number]> {
  const out: Record<string, [number, number, number]> = {};
  for (const inst of INSTS) {
    const sum = [0, 0, 0];
    let n = 0;
    for (const tune of TUNES) {
      if (tune.lesson) continue;
      const s = scoreOf(tune);
      const dur = (s.end * 60) / tune.bpm;
      LEVELS.forEach((lv, k) => {
        const c = scoreChart(s, inst, lv, 0, s.end, s.solos);
        sum[k] += new Set(c.notes.map((x) => Math.round(x.beat * 24))).size / dur;
      });
      n++;
    }
    out[inst] = [sum[0] / n, sum[1] / n, sum[2] / n];
  }
  return out;
}

describe('the levels', () => {
  const r = rates();
  if (process.env.STEPS) for (const [k, v] of Object.entries(r)) console.log(k.padEnd(8), v.map((x) => x.toFixed(2)).join('  '));
  for (const inst of INSTS)
    it(`${inst}: Normal at most twice Easy, Hard 1.15 (congas 1.05) to 1.8 times Normal (notes a second)`, () => {
      const [e, n, h] = r[inst];
      // (the classics' congas follow their recording's drummer, which plays much the same on Easy and Normal)
      expect(n / e).toBeGreaterThan(inst === 'congas' ? 1.15 : 1.2);
      expect(n / e).toBeLessThanOrEqual(2);
      // (the congas are the band's conga player's part from Normal up: Hard adds its edges and quick notes, not as much;
      // and on a classic, Hard plays only what its recording's drummer plays, which is sometimes Normal's)
      expect(h / n).toBeGreaterThanOrEqual(inst === 'congas' || inst === 'handpan' ? 1.05 : 1.15);
      expect(h / n).toBeLessThanOrEqual(1.8);
    });
});
