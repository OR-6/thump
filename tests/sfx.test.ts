import { describe, expect, it } from 'vitest';
import { chordTone, pentaTone, type Music } from '../src/audio/sfx';

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const pc = (n: number) => ((n % 12) + 12) % 12;
const music = (tonic: number, minor: boolean, chord: number, chordMinor: boolean): Music => ({ tonic, minor, chord, chordMinor });

describe("the game's own sounds are in the music", () => {
  it("a step's bell is a note of the chord playing under it, in the voice's range", () => {
    for (let chord = 0; chord < 12; chord++)
      for (const minor of [false, true]) {
        const m = music(0, false, chord, minor);
        const tones = [chord, chord + (minor ? 3 : 4), chord + 7].map(pc);
        for (let d = 0; d <= 6; d++) {
          const n = chordTone(m, d);
          expect(tones).toContain(pc(n));
          // (G4 to F#7 at most: never a whistle)
          expect(n).toBeGreaterThanOrEqual(67);
          expect(n).toBeLessThan(67 + 12 + 24);
        }
        // the root sits between G4 and F#5
        expect(chordTone(m, 0)).toBeGreaterThanOrEqual(67);
        expect(chordTone(m, 0)).toBeLessThanOrEqual(78);
      }
  });

  it("the results ring the key's own chord", () => {
    const m = music(2, false, 7, false);
    expect(pc(chordTone(m, 0, 0, true))).toBe(2);
    expect(pc(chordTone(m, 1, 0, true))).toBe(6);
    const am = music(9, true, 5, false);
    expect(pc(chordTone(am, 1, 0, true))).toBe(0);
  });

  it("the count-up climbs the key's pentatonic, every step a note of the key", () => {
    for (let tonic = 0; tonic < 12; tonic++)
      for (const minor of [false, true]) {
        const m = music(tonic, minor, tonic, minor);
        const scale = (minor ? MINOR : MAJOR).map((x) => pc(x + tonic));
        let prev = -1;
        for (let i = 0; i < 12; i++) {
          const n = pentaTone(m, i);
          expect(scale).toContain(pc(n));
          expect(n).toBeGreaterThan(prev);
          prev = n;
        }
        expect(pc(pentaTone(m, 0))).toBe(tonic);
      }
  });
});
