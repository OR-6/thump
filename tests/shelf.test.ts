import { describe, expect, it } from 'vitest';
import { PIANO_CHORD, SCALES, SHELF, STRUM, guitarZones, handpanZones, pianoZones, scaleById, scaleMidi, stepShelf, strumNotes } from '../src/kit/shelf.js';

describe('the instrument shelf', () => {
  it('steps through drums, piano, guitar, handpan and wraps', () => {
    expect(SHELF.map((d) => d.id)).toEqual(['drums', 'piano', 'guitar', 'handpan']);
    expect(stepShelf('drums', 1)).toBe('piano');
    expect(stepShelf('drums', -1)).toBe('handpan');
    expect(stepShelf('handpan', 1)).toBe('drums');
  });
  it('every note on the piano and the handpan is in the scale', () => {
    for (const sc of SCALES) {
      for (const z of pianoZones(60, sc).slice(0, PIANO_CHORD)) expect(sc.steps).toContain((((z.midi - 60) % 12) + 12) % 12);
      for (const z of handpanZones(50, sc)) expect(sc.steps).toContain((((z.midi - 50) % 12) + 12) % 12);
    }
  });
  it('the piano climbs left to right, keys at least 5 cm wide, and it fits a tray', () => {
    const z = pianoZones(60, scaleById('happy'));
    const keys = z.slice(0, PIANO_CHORD);
    for (let i = 1; i < keys.length; i++) expect(keys[i].midi).toBeGreaterThan(keys[i - 1].midi);
    for (const k of keys) expect(k.w).toBeGreaterThanOrEqual(0.05);
    const left = Math.min(...z.map((k) => k.x - k.w / 2));
    const right = Math.max(...z.map((k) => k.x + k.w / 2));
    expect(right - left).toBeLessThan(0.46);
    // nothing overlaps
    for (const a of z) for (const b of z) if (a !== b) expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual((a.w + b.w) / 2);
  });
  it('handpan notes never overlap each other or the ding', () => {
    const z = handpanZones(50, scaleById('sad'));
    for (const a of z) for (const b of z) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(a.w + b.w);
  });
  it('a strum is a guitar shape: the root on a low string, then chord tones only, climbing', () => {
    expect(strumNotes(57, [0, 3, 7])).toEqual([45, 52, 57, 60, 64, 69]);
    for (const sc of SCALES)
      for (const ch of sc.chords) {
        const n = strumNotes(60, ch);
        expect(n.length).toBeGreaterThanOrEqual(5);
        expect(n[0]).toBeGreaterThanOrEqual(40);
        expect(n[0]).toBeLessThanOrEqual(51);
        expect(n[0] % 12).toBe((60 + ch[0]) % 12);
        const pcs = ch.map((c) => (60 + c) % 12);
        for (let i = 1; i < n.length; i++) {
          expect(n[i]).toBeGreaterThan(n[i - 1]);
          expect(pcs).toContain(n[i] % 12);
        }
      }
  });
  it('the guitar has three chord pads left of the strum band', () => {
    const z = guitarZones(60, scaleById('happy'));
    const pads = z.slice(0, 3);
    for (const p of pads) expect(p.x + p.w / 2).toBeLessThan(STRUM.x0);
  });
  it('scale degrees wrap into octaves', () => {
    const s = scaleById('happy');
    expect(scaleMidi(60, s, 5)).toBe(72);
    expect(scaleMidi(60, s, -1)).toBe(57);
  });
});
