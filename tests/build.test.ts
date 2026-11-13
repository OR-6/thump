import { describe, expect, it } from 'vitest';
import { TRACKS, assign, ownBar, played, quantise, steps, LOOP_BEATS } from '../src/play/build.js';

const kick = steps('X.....x.|x...x...');

describe('build: making a part', () => {
  it('reads a two-bar pattern', () => {
    expect(kick.map((s) => s.beat)).toEqual([0, 3, 4, 6]);
    expect(kick[0].vel).toBe(1);
    expect(steps('2.3..4..|3...2...').map((s) => s.degree)).toEqual([2, 3, 4, 3, 2]);
  });
  it('a sloppy take comes out on the grid, keeping a little of your feel, as loud as it was played', () => {
    const hits = [
      { beat: 0.12, key: 'kit:kick', vel: 0.9 },
      { beat: 2.9, key: 'kit:kick', vel: 0.5 },
      { beat: 4.05, key: 'kit:kick', vel: 0.7 },
      { beat: 6.2, key: 'kit:kick', vel: 0.8 },
    ];
    const n = quantise(kick, hits, () => 'kit:kick');
    expect(n.map((x) => x.at ?? x.beat)).toEqual([0, 3, 4, 6]);
    // a third of how early or late you were stays (your pocket), never more than a 32nd
    expect(n[0].beat).toBeCloseTo(0.04, 2);
    expect(n[1].beat).toBeCloseTo(3 - 0.033, 2);
    expect(n.every((x) => Math.abs(x.beat - (x.at ?? x.beat)) <= 0.125 + 1e-9)).toBe(true);
    // loudness against your loudest hit (0.9 here): 0.5 sits between, never down with the filled notes
    expect(n[1].vel).toBeCloseTo(0.55 + 0.45 * (0.5 / 0.9));
    expect(n[0].vel).toBeCloseTo(1);
    expect(n.every((x) => !x.filled)).toBe(true);
    expect(played(n, kick)).toBe(1);
  });
  it('missed notes are filled in softly: a part is never broken', () => {
    const n = quantise(kick, [{ beat: 0, key: 't2:0', vel: 1 }], () => 't2:0');
    expect(n).toHaveLength(4);
    expect(n.filter((x) => x.filled)).toHaveLength(3);
    expect(n.find((x) => x.filled)!.vel).toBeLessThan(0.35);
    expect(played(n, kick)).toBeCloseTo(0.25);
  });
  it('an extra note of your own lands on the nearest eighth', () => {
    const n = quantise(kick, [{ beat: 1.4, key: 'kit:kick', vel: 0.8 }], () => 'kit:kick');
    expect(n.some((x) => x.beat === 1.5 && !x.filled)).toBe(true);
  });
  it('a hit just before the loop wraps counts for the first note', () => {
    const n = quantise(kick, [{ beat: LOOP_BEATS - 0.1, key: 'kit:kick', vel: 0.9 }], () => 'kit:kick');
    expect(n[0].filled).toBe(false);
  });
  it('a pitched part keeps the keys you chose (everything is in key)', () => {
    const keys = steps('2.3..4..|3...2...');
    const n = quantise(keys, [{ beat: 0, key: 'keys:5', vel: 0.8 }], (s) => `keys:${s.degree}`);
    expect(n[0].key).toBe('keys:5');
    expect(n[1].key).toBe('keys:3');
  });
  it('KEYS on a thing with no notes go to the desk bars instead', () => {
    const part = TRACKS[0].parts.find((p) => p.name === 'KEYS')!;
    expect(assign(part, 't3:0', () => 1)).toEqual({ surface: 'keys', key: 'keys:0', moved: true });
    expect(assign(part, 't4:2', () => 8).surface).toBe('t4');
    const hat = TRACKS[0].parts.find((p) => p.name === 'HAT')!;
    expect(assign(hat, 't3:0', () => 1)).toEqual({ surface: 't3', key: 't3:0', moved: false });
  });
  it('track 1 is six parts, two bars each, playable with one hand per part', () => {
    const t = TRACKS[0];
    expect(t.parts.map((p) => p.name)).toEqual(['KICK', 'SNARE', 'HAT', 'PERC', 'KEYS', 'BASS']);
    for (const p of t.parts) {
      const s = steps(p.pattern);
      expect(s.every((x) => x.beat >= 0 && x.beat < LOOP_BEATS)).toBe(true);
      for (let k = 1; k < s.length; k++) expect(s[k].beat - s[k - 1].beat).toBeGreaterThanOrEqual(0.5);
    }
  });
});

describe('perform: fills and Tight %', async () => {
  const { fillScore, tightPercent } = await import('../src/play/game.js');
  it('a fill is good with six or more eighths, mostly on the grid', () => {
    expect(fillScore([0, 0.5, 1, 1.5, 2, 2.5]).good).toBe(true);
    expect(fillScore([0, 0.5, 1]).good).toBe(false);
    expect(fillScore([0.2, 0.7, 1.3, 1.8, 2.2, 2.7, 3.3]).good).toBe(false);
  });
  it('Tight % is 100 minus the median error in ms', () => {
    expect(tightPercent([0.01, -0.02, 0.03])).toBe(80);
    expect(tightPercent([0.2, 0.3])).toBe(0);
    expect(tightPercent([])).toBe(0);
  });
});

describe('every track', () => {
  it('parts two bars, never faster than eighths, gates rising, names like a sample pack', () => {
    let prev = -1;
    for (const t of TRACKS) {
      expect(t.parts.length).toBeGreaterThanOrEqual(6);
      expect(t.parts.length).toBeLessThanOrEqual(8);
      expect(t.needs).toBeGreaterThanOrEqual(prev);
      prev = t.needs;
      for (const p of t.parts) {
        const s = steps(p.pattern);
        expect(s.every((x) => x.beat >= 0 && x.beat < LOOP_BEATS)).toBe(true);
        for (let k = 1; k < s.length; k++) expect(s[k].beat - s[k - 1].beat).toBeGreaterThanOrEqual(0.5);
        if (p.pitched !== 'no') expect(s.every((x) => x.degree >= 0)).toBe(true);
      }
    }
    expect(TRACKS.map((t) => t.name)).toEqual(['Kick Start', 'Two Step', 'Boom Bap 88', 'Lowrider', 'Night Shift']);
  });
});

describe('build: close notes', () => {
  it('an early hit on the next step is never taken by the step before it', () => {
    // hats on 0, 0.5, 1: the 0.5 played early at 0.3, the 1 played early at 0.75
    const hat = steps('xxx.....|........');
    const n = quantise(hat, [{ beat: 0, key: 'h', vel: 0.8 }, { beat: 0.3, key: 'h', vel: 0.8 }, { beat: 0.75, key: 'h', vel: 0.8 }], () => 'h');
    expect(n.filter((x) => x.filled)).toHaveLength(0);
  });
});

describe('build: gentle hands', () => {
  it('a take of soft taps comes out as a full part, its accents kept', () => {
    const kick = steps('X.....x.|x...x...');
    const n = quantise(kick, kick.map((s, i) => ({ beat: s.beat, key: 'k', vel: i === 0 ? 0.3 : 0.18 })), () => 'k');
    expect(n[0].vel).toBeCloseTo(1);
    expect(Math.min(...n.map((x) => x.vel))).toBeGreaterThan(0.75);
  });
});

describe('build: your own bar', () => {
  it('what you play with the lights off is kept on the 16ths, one note each, your accents kept', () => {
    const n = ownBar(
      [
        { beat: 4.02, key: 'k', vel: 0.9 },
        { beat: 4.74, key: 'k', vel: 0.4 },
        { beat: 4.77, key: 'k', vel: 0.6 },
        { beat: 6.49, key: 'k', vel: 0.1 },
      ],
      0.9,
    );
    expect(n.map((x) => x.beat)).toEqual([4, 4.75]);
    expect(n[0].vel).toBeCloseTo(1);
    expect(n[1].vel).toBeCloseTo(0.55 + 0.45 * (0.6 / 0.9));
  });
});

describe('build: the tracks sound like songs', () => {
  it('a backbeat: the smack on 2 and 4 in the first track, never on top of the boom', () => {
    const t = TRACKS[0];
    const kick = steps(t.parts.find((p) => p.name === 'KICK')!.pattern).map((s) => s.beat);
    const snare = steps(t.parts.find((p) => p.name === 'SNARE')!.pattern).map((s) => s.beat);
    expect(snare).toEqual([1, 3, 5, 7]);
    expect(kick.some((b) => snare.includes(b))).toBe(false);
  });
  it('every track has a chord a bar, and swing pushes the off-beats late', () => {
    for (const t of TRACKS) expect(t.chords.length).toBe(2);
    expect(steps('xx......|........', 0.58).map((s) => s.beat)).toEqual([0, 0.58]);
    expect(TRACKS.find((t) => t.id === 'boom-bap-88')!.swing).toBeGreaterThan(0.5);
  });
});

