/**
 * How much a chart repeats itself: for each song, instrument and level, the share of bars that are the same as the
 * bar before (the same notes on the same keys at the same places), and how many different bars the whole song has.
 * VARIETY=1 prints the table; the floors are asserted.
 */
import { describe, expect, it } from 'vitest';
import { TUNES } from '../src/songs/tunes.js';
import { scoreChart, scoreOf } from '../src/songs/score.js';

const INSTS = ['drums', 'piano', 'marimba', 'guitar', 'handpan', 'congas'] as const;
const LEVELS = ['easy', 'normal', 'hard'] as const;

export function variety() {
  const rows: { song: string; inst: string; level: string; bars: number; same: number; kinds: number }[] = [];
  for (const tune of TUNES) {
    if (tune.lesson) continue;
    const s = scoreOf(tune);
    const end = s.end;
    for (const inst of INSTS)
      for (const level of LEVELS) {
        const c = scoreChart(s, inst, level, 0, end, s.solos);
        const bars = new Map<number, string[]>();
        for (const n of c.notes) {
          const b = Math.floor(n.beat / s.meter + 1e-6);
          let l = bars.get(b);
          if (!l) bars.set(b, (l = []));
          l.push(`${(n.beat - b * s.meter).toFixed(2)}${n.key}`);
        }
        const keys = [...bars.keys()].sort((a, b) => a - b);
        let same = 0;
        let prev = '';
        const kinds = new Set<string>();
        for (const b of keys) {
          const sig = bars.get(b)!.sort().join(' ');
          if (sig === prev) same++;
          prev = sig;
          kinds.add(sig);
        }
        rows.push({ song: tune.id, inst, level, bars: keys.length, same: keys.length ? same / keys.length : 0, kinds: kinds.size });
      }
  }
  return rows;
}

describe('charts vary', () => {
  const rows = variety();
  if (process.env.VARIETY) {
    const byInst = new Map<string, number[]>();
    for (const r of rows) {
      const k = `${r.inst} ${r.level}`;
      byInst.set(k, [...(byInst.get(k) ?? []), r.same]);
    }
    console.log('\nshare of bars the same as the bar before (mean, worst song) by instrument and level');
    for (const [k, v] of byInst) console.log(`${k.padEnd(16)} mean ${Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100)}%  worst ${Math.round(Math.max(...v) * 100)}%`);
    const worst = [...rows].sort((a, b) => b.same - a.same).slice(0, 12);
    console.log('\nworst:');
    for (const r of worst) console.log(`${r.song.padEnd(18)} ${r.inst.padEnd(8)} ${r.level.padEnd(7)} ${Math.round(r.same * 100)}% same, ${r.kinds} kinds of bar in ${r.bars}`);
  }
  it('measures', () => expect(rows.length).toBeGreaterThan(0));
  // (the drums, congas and guitar used to repeat one bar the whole song: 93-99% of bars the same as the one before)
  for (const inst of ['drums', 'congas', 'guitar'])
    it(`${inst}: no song repeats the bar before more than 60% of the time, at any level`, () => {
      for (const r of rows) if (r.inst === inst && r.bars > 8) expect(r.same, `${r.song} ${r.level}`).toBeLessThanOrEqual(0.6);
    });
});
