import { describe, expect, it } from 'vitest';
import { AirHits, airGain, type AirHit, type AirSurface } from '../src/input/air-hits.js';

const snare: AirSurface = { id: 1, face: 'up', x: 0, y: 0.13, z: 0, r: 0.065 };
const key: AirSurface = { id: 2, face: 'up', x: 0.2, y: 0.06, z: 0, w: 0.0225, d: 0.15 };
const kick: AirSurface = { id: 3, face: 'front', x: -0.1, y: 0.1, z: 0.05, r: 0.1 };

/** Move point 0 from a to b over n frames of 1/72 s. */
function path(h: AirHits, a: number[], b: number[], n: number, surfaces: AirSurface[], out: AirHit[]): void {
  for (let k = 0; k <= n; k++) {
    const f = k / n;
    h.update(0, a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, 1 / 72, surfaces, out);
  }
}

describe('hits in the air', () => {
  it('a stick tip coming down through the snare head plays it, once, louder when faster', () => {
    const h = new AirHits(1);
    const out: AirHit[] = [];
    path(h, [0, 0.25, 0], [0, 0.1, 0], 6, [snare], out);
    expect(out).toHaveLength(1);
    expect(out[0].surface).toBe(1);
    const fast = out[0].gain;
    const h2 = new AirHits(1);
    const out2: AirHit[] = [];
    path(h2, [0, 0.25, 0], [0, 0.1, 0], 30, [snare], out2);
    expect(out2).toHaveLength(1);
    expect(out2[0].gain).toBeLessThan(fast);
    expect(airGain(5)).toBe(1);
  });
  it('outside the head, or coming up through it, or too slow: nothing', () => {
    const out: AirHit[] = [];
    path(new AirHits(1), [0.2, 0.25, 0], [0.2, 0.1, 0], 6, [snare], out);
    path(new AirHits(1), [0, 0.05, 0], [0, 0.25, 0], 6, [snare], out);
    path(new AirHits(1), [0, 0.135, 0], [0, 0.125, 0], 60, [snare], out);
    expect(out).toHaveLength(0);
  });
  it('a finger resting on a key plays once; it plays again only after lifting a centimetre', () => {
    const h = new AirHits(1);
    const out: AirHit[] = [];
    path(h, [0.2, 0.09, 0], [0.2, 0.055, 0], 4, [key], out);
    // resting, wobbling a few millimetres
    path(h, [0.2, 0.055, 0], [0.2, 0.064, 0], 4, [key], out);
    path(h, [0.2, 0.064, 0], [0.2, 0.055, 0], 4, [key], out);
    expect(out).toHaveLength(1);
    path(h, [0.2, 0.055, 0], [0.2, 0.09, 0], 4, [key], out);
    path(h, [0.2, 0.09, 0], [0.2, 0.055, 0], 4, [key], out);
    expect(out).toHaveLength(2);
  });
  it('the kick faces you: struck by pushing through its front head', () => {
    const out: AirHit[] = [];
    path(new AirHits(1), [-0.1, 0.1, 0.2], [-0.1, 0.1, 0.0], 6, [kick], out);
    expect(out.map((o) => o.surface)).toEqual([3]);
  });
  it('a finger resting on a key with 5 mm of tracking jitter plays nothing for a minute', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
    const h = new AirHits(1);
    const out: AirHit[] = [];
    // (it starts resting on the key: that rest is not a press)
    for (let k = 0; k < 72 * 60; k++) h.update(0, 0.2 + rnd() * 0.003, 0.061 + rnd() * 0.005, rnd() * 0.003, 1 / 72, [key], out);
    expect(out.length).toBeLessThanOrEqual(1);
  });
  it('a hand sliding past a drum, mostly sideways, grazes nothing', () => {
    const out: AirHit[] = [];
    path(new AirHits(1), [-0.15, 0.135, 0], [0.15, 0.12, 0], 10, [snare], out);
    expect(out).toHaveLength(0);
  });
  it('a point coming back after a gap (forgotten) does not fire from its old place', () => {
    const h = new AirHits(1);
    const out: AirHit[] = [];
    path(h, [0, 0.25, 0], [0, 0.2, 0], 3, [snare], out);
    h.forget(0);
    // it reappears below the head (the hand moved while unseen)
    h.update(0, 0, 0.1, 0, 1 / 72, [snare], out);
    h.update(0, 0, 0.1, 0, 1 / 72, [snare], out);
    expect(out).toHaveLength(0);
  });
  it('a surface can take a sideways brush (a strum) and re-arm sooner (a repeated key)', () => {
    const strings: AirSurface = { id: 9, face: 'up', x: 0, y: 0.055, z: 0, w: 0.2, d: 0.1 };
    // 60° from straight down: refused at the default, played with along 0.25
    const out: AirHit[] = [];
    path(new AirHits(1), [-0.08, 0.1, 0], [0.08, 0.01, 0], 8, [strings], out);
    expect(out).toHaveLength(0);
    path(new AirHits(1), [-0.08, 0.1, 0], [0.08, 0.01, 0], 8, [{ ...strings, along: 0.25 }], out);
    expect(out).toHaveLength(1);
    // a 1.5 cm lift repeats a key whose rearm is 1.2 cm, not one at the default 2 cm
    for (const [rearm, want] of [[undefined, 1], [0.012, 2]] as const) {
      const h = new AirHits(1);
      const o: AirHit[] = [];
      const k = { ...key, rearm };
      path(h, [0.2, 0.1, 0], [0.2, 0.05, 0], 5, [k], o);
      path(h, [0.2, 0.05, 0], [0.2, 0.075, 0], 5, [k], o);
      path(h, [0.2, 0.075, 0], [0.2, 0.05, 0], 3, [k], o);
      expect(o).toHaveLength(want);
    }
  });
  it('a raised minimum speed: a stick drifting down over a head does not play', () => {
    const o: AirHit[] = [];
    const h = new AirHits(1);
    for (let k = 0; k <= 12; k++) h.update(0, 0, 0.16 - k * 0.005, 0, 1 / 72, [snare], o, 6.5, 1.0);
    expect(o).toHaveLength(0);
    path(h, [0, 0.25, 0], [0, 0.1, 0], 4, [snare], o);
    expect(o).toHaveLength(1);
  });
});
