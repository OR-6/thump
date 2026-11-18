/**
 * How much a chart repeats itself: for each song, instrument and level, the share of bars that are the same as the
 * bar before (the same notes on the same keys at the same places), and how many different bars the whole song has.
 * VARIETY=1 prints the table; the floors are asserted.
 */
import { describe, expect, it } from 'vitest';
import { TUNES } from '../src/songs/tunes.js';
import { bandStyle, scoreChart, scoreOf } from '../src/songs/score.js';
import { drumHits, planBars } from '../src/songs/arrange.js';
import { CLASSIC_KITS, classicKit } from '../src/songs/classic-kit.js';

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
  // (the guitar used to repeat one bar the whole song: 93-99% of bars the same as the one before)
  it('guitar: no song repeats the bar before more than 60% of the time, at any level', () => {
    for (const r of rows) if (r.inst === 'guitar' && r.bars > 8) expect(r.same, `${r.song} ${r.level}`).toBeLessThanOrEqual(0.6);
  });
  // (the drums and congas are the band's own drummer's part now: they change where the band changes, verse to chorus
  // and its fills; from Normal up no song repeats the bar before more than 72% of the time on the drums: a dance groove repeats, as its band does)
  // (a classic's drums are its own recording's drummer, src/songs/classic-kit.ts, who may well keep one pattern: the
  // can-can's orchestra drum is a galop's kick on one and three all through, and its chart plays what you hear)
  it('drums from Normal up: no song repeats the bar before more than 72% of the time', () => {
    for (const r of rows) if (r.inst === 'drums' && r.level !== 'easy' && r.bars > 8 && !CLASSIC_KITS[r.song]) expect(r.same, `${r.song} ${r.level}`).toBeLessThanOrEqual(0.72);
  });
  // (it used to be the groove's drummer, not the recording's, and a third to a half of Normal's and Hard's drums had
  // nothing in the music under them)
  it("a classic's drums and congas are its recording's drummer: every note on one of its hits, or a chord coming in where it rests", () => {
    for (const tune of TUNES) {
      if (!CLASSIC_KITS[tune.id]) continue;
      const s = scoreOf(tune);
      const kit = classicKit(s)!;
      const at = new Set([...kit.KICK, ...kit.SNARE, ...kit.HAT].map((h) => Math.round(h.beat * 24)));
      for (const c of s.starts.flatMap((st) => s.chords.map((x) => st + x.beat))) at.add(Math.round(c * 24));
      for (const inst of ['drums', 'congas'])
        for (const level of LEVELS) for (const n of scoreChart(s, inst, level, 0, s.end, []).notes) expect(at.has(Math.round(n.beat * 24)), `${tune.id} ${inst} ${level} beat ${n.beat}`).toBe(true);
    }
  });
});

describe('the drums are the band\'s own drummer', () => {
  // what you play on the drums is what the recorded drummer plays (its part is the one left out for you): every note of
  // yours lands on one of its hits, so it sounds whole when you play it, and feels like part of the song
  it('every drum note, at every level, is on a hit of the band\'s drummer', () => {
    for (const tune of TUNES) {
      if (tune.lesson) continue;
      const s = scoreOf(tune);
      const kit = drumHits(bandStyle(s), planBars(s), s.meter, s.end);
      const band = new Set([...kit.KICK, ...kit.SNARE, ...kit.HAT].map((h) => Math.round(h.beat * 48)));
      for (const level of ['easy', 'normal', 'hard'] as const) {
        const c = scoreChart(s, 'drums', level, 0, s.end, s.solos);
        const off = c.notes.filter((n) => !band.has(Math.round(n.beat * 48)));
        expect(off.length, `${tune.id} ${level}`).toBe(0);
      }
    }
  });
});
