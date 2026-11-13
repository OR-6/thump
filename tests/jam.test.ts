import { describe, expect, it } from 'vitest';
import { RateLimit, bassNote, validFromPhone, validToPhone } from '../src/jam/protocol.js';

describe('phone jam messages', () => {
  it('accepts what the phone sends and nothing else', () => {
    expect(validFromPhone({ k: 'hi', who: 'caller' })).toBe(true);
    expect(validFromPhone({ k: 'note', n: 0, v: 0.8 })).toBe(true);
    expect(validFromPhone({ k: 'note', n: 3, v: 0.8 })).toBe(false);
    expect(validFromPhone({ k: 'note', n: 1, v: 2 })).toBe(false);
    expect(validFromPhone({ k: 'note', n: 1, v: NaN })).toBe(false);
    expect(validFromPhone('note')).toBe(false);
    expect(validFromPhone(null)).toBe(false);
  });
  it('accepts what the headset sends and nothing else', () => {
    expect(validToPhone({ k: 'beat', b: 3, bpm: 80, root: 60, song: 'Porch Step' })).toBe(true);
    expect(validToPhone({ k: 'beat', b: 3, bpm: 1000, root: 60, song: '' })).toBe(false);
    expect(validToPhone({ k: 'rest' })).toBe(true);
    expect(validToPhone({ k: 'part', part: 'drums' })).toBe(false);
  });
  it('the bass follows the chord: root, fifth, octave, two octaves down', () => {
    expect(bassNote(60, 0)).toBe(36);
    expect(bassNote(60, 1)).toBe(43);
    expect(bassNote(60, 2)).toBe(48);
  });
  it('a flood of taps is capped', () => {
    const r = new RateLimit(12, 1);
    let ok = 0;
    for (let i = 0; i < 100; i++) if (r.ok(i * 0.01)) ok++;
    expect(ok).toBe(12);
    expect(r.ok(2)).toBe(true);
  });
});
