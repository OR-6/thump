import { describe, expect, it } from 'vitest';
import { TRACKS, assign, played, quantise, steps, LOOP_BEATS } from '../src/play/build.js';

const kick = steps('X.....x.|x...x...');

describe('build: making a part', () => {
  it('reads a two-bar pattern', () => {
    expect(kick.map((s) => s.beat)).toEqual([0, 3, 4, 6]);
    expect(kick[0].vel).toBe(1);
    expect(steps('2.3..4..|3...2...').map((s) => s.degree)).toEqual([2, 3, 4, 3, 2]);
  });
  it('a sloppy take comes out on the grid, as loud as it was played', () => {
    const hits = [
      { beat: 0.12, key: 'kit:kick', vel: 0.9 },
      { beat: 2.9, key: 'kit:kick', vel: 0.5 },
      { beat: 4.05, key: 'kit:kick', vel: 0.7 },
      { beat: 6.2, key: 'kit:kick', vel: 0.8 },
    ];
    const n = quantise(kick, hits, () => 'kit:kick');
    expect(n.map((x) => x.beat)).toEqual([0, 3, 4, 6]);
    expect(n[1].vel).toBeCloseTo(0.5);
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
