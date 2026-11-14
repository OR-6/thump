import { describe, expect, it } from 'vitest';
import { CONGA, PIANO_CHORD, pianoBlacks, SCALES, SHELF, STRUM, congaZones, guitarZones, handpanZones, percVoice, pianoZones, scaleById, scaleMidi, stepShelf, strumNotes } from '../src/kit/shelf.js';

describe('the instrument shelf', () => {
  it('steps through drums, piano, marimba, guitar, congas, handpan and wraps', () => {
    expect(SHELF.map((d) => d.id)).toEqual(['drums', 'piano', 'marimba', 'guitar', 'congas', 'handpan']);
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
  it('the piano: two octaves of real keys (23.5 mm apart, 150 mm long), climbing, in the scale; it fits a tray', () => {
    const z = pianoZones(60, scaleById('happy'));
    const keys = z.slice(0, PIANO_CHORD);
    expect(keys).toHaveLength(15);
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i].midi).toBeGreaterThan(keys[i - 1].midi);
      expect(keys[i].x - keys[i - 1].x).toBeCloseTo(0.0235, 4);
    }
    for (const k of keys) expect(k.h).toBeCloseTo(0.15, 4);
    const left = Math.min(...z.map((k) => k.x - (k.shape === 'disc' ? k.w : k.w / 2)));
    const right = Math.max(...z.map((k) => k.x + (k.shape === 'disc' ? k.w : k.w / 2)));
    expect(right - left).toBeLessThan(0.46);
    // the tune's first note is in the middle (the sixth key)
    expect(keys[5].degree).toBe(0);
  });
  it('black keys where a keyboard has them: two over C D E, three over F G A B, 11 by 95 mm, each playing its two neighbours', () => {
    const z = pianoZones(60, scaleById('happy'));
    const bl = pianoBlacks(z);
    expect(bl).toHaveLength(10);
    expect(bl.map((b) => b.a)).toEqual([0, 1, 3, 4, 5, 7, 8, 10, 11, 12]);
    for (const k of bl) {
      expect(k.b).toBe(k.a + 1);
      expect(k.x).toBeGreaterThan(z[k.a].x);
      expect(k.x).toBeLessThan(z[k.b].x);
      expect(k.w).toBeCloseTo(0.011, 4);
      expect(k.h).toBeCloseTo(0.095, 4);
    }
  });
  it('the congas: two drums apart, each a middle inside its edge; the middle is open, the edge slaps', () => {
    const z = congaZones();
    expect(z).toHaveLength(4);
    // the drums don't touch
    expect(Math.abs(z[0].x - z[2].x)).toBeGreaterThan(z[1].w + z[3].w);
    for (const d of [0, 2]) {
      expect(z[d].x).toBe(z[d + 1].x);
      expect(z[d].w).toBeLessThan(z[d + 1].w);
    }
    expect(z[1].w).toBe(CONGA.r[0]);
    // the low drum lower, the edge a slap, the cajon's edge its high slap
    expect(percVoice('congas', 0).tone).toBe(0);
    expect(percVoice('congas', 2).tone).toBe(2);
    expect(percVoice('congas', 1).slap).toBe(true);
    expect(percVoice('congas', 0).slap).toBe(false);
    expect(percVoice('cajon', 1).tone).toBe(1);
    expect(percVoice('cajon', 2).size).toBeLessThan(percVoice('cajon', 0).size);
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
