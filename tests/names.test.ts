import { describe, expect, it } from 'vitest';
import { ADJECTIVES, BANDS, PLAYERS, bandName, playerName, randomWords, readWords, shuffleWord } from '../src/play/names.js';
import { cleanName } from '../functions/_lib/scores';

describe('names on the boards', () => {
  it('forty words in each list, no repeats', () => {
    for (const l of [ADJECTIVES, PLAYERS, BANDS]) {
      expect(l.length).toBe(40);
      expect(new Set(l).size).toBe(40);
    }
  });
  it('every name fits (32 letters) and the server keeps it as it is', () => {
    for (let a = 0; a < 40; a++)
      for (let b = 0; b < 40; b++) {
        for (const n of [playerName([a, b]), bandName([a, b])]) {
          expect(n.length).toBeLessThanOrEqual(32);
          expect(cleanName(n)).toBe(n);
        }
      }
  });
  it('a shuffle changes only that word, and always to another', () => {
    const w: [number, number] = [5, 9];
    for (let k = 0; k < 50; k++) {
      const s = shuffleWord(w, 0, Math.random);
      expect(s[1]).toBe(9);
      expect(s[0]).not.toBe(5);
    }
  });
  it('words from storage: only real places in the lists', () => {
    expect(readWords([3, 39])).toEqual([3, 39]);
    expect(readWords([3, 40])).toBeNull();
    expect(readWords(['a', 1])).toBeNull();
    expect(readWords(randomWords())).not.toBeNull();
  });
});
