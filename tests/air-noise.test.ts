/**
 * The hit detector at the tracking noise a headset really has: fingertips shaking 2 mm a frame (the other benches use
 * 1.2 mm), that shake correlated from frame to frame (a hand's fitted skeleton wobbles, it doesn't just flicker), and a
 * stick's tip shaking 4 mm (the hand's turn shake, through 28 cm of stick). Floors are set a little under what it does
 * now: they guard against getting worse, and say how good it is (NOISE=1 prints the numbers).
 */
import { describe, expect, it } from 'vitest';
import { AIR, AirHits, TURN, type AirHit, type AirSurface } from '../src/input/air-hits.js';

const DT = 1 / 72;
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r());
/** Noise of sd `s` per frame, correlated `a` from one frame to the next (0: white). */
function noise(r: () => number, s: number, a: number): () => number {
  let v = 0;
  return a ? () => (v = a * v + Math.sqrt(1 - a * a) * s * gauss(r)) : () => s * gauss(r);
}
const say = (s: string) => {
  if (process.env.NOISE) console.log(s);
};

describe('a piano key, at a headset’s fingertip shake', () => {
  const key = (): AirSurface[] => [{ id: 0, face: 'up', x: 0, y: 0, z: 0, w: 0.0221, d: 0.175, confirm: 0.002, key: true, along: 0.45 }];
  /** Hits per trial for a fingertip at height y(t) over the key (its pad; the key top at 0). */
  function hits(y: (t: number) => number, dur: number, sd: number, a: number, seed: number, trials = 150): number[] {
    const r = rng(seed);
    const counts: number[] = [];
    for (let k = 0; k < trials; k++) {
      const surf = key();
      const air = new AirHits(1);
      const out: AirHit[] = [];
      const nx = noise(r, sd, a), ny = noise(r, sd, a), nz = noise(r, sd, a);
      let n = 0;
      for (let t = r() * DT; t < dur; t += DT) {
        out.length = 0;
        air.update(0, nx(), y(t) + ny(), nz(), DT, surf, out, 1, AIR.keyMin);
        n += out.length;
      }
      counts.push(n);
    }
    return counts;
  }
  const share = (c: number[], want: number) => c.filter((n) => n === want).length / c.length;
  const mean = (c: number[]) => c.reduce((a, b) => a + b, 0) / c.length;
  const held = (t: number) => (t < 0.1 ? 0.03 - 0.3 * t : Math.max(-0.01, 0.03 - 0.3 * t));
  const restOver = (t: number) => (t < 0.1 ? 0.01 - 0.09 * t : 0.001);
  const reps = (n: number, rate: number, lo: number, hi: number) => (t: number) => {
    if (t < 0.1) return 0.03 - (0.03 - lo) * t / 0.1;
    const u = Math.min(t - 0.1, (n - 0.5) / rate);
    return (lo + hi) / 2 - ((hi - lo) / 2) * Math.cos(2 * Math.PI * u * rate);
  };
  // [name, noise sd, correlation, how often a 4 s hold plays exactly once at least]
  const cases: [string, number, number, number][] = [
    ['2 mm', 0.002, 0, 0.95],
    ['2 mm correlated', 0.002, 0.7, 0.85],
    ['3 mm correlated', 0.003, 0.7, 0.4],
  ];
  for (const [name, sd, a, floor] of cases)
    it(`a note held 4 s plays once (${name})`, () => {
      const c = hits(held, 4, sd, a, 11 + name.length);
      say(`held 4 s, ${name}: once ${share(c, 1)}, mean ${mean(c).toFixed(2)}`);
      expect(share(c, 1)).toBeGreaterThanOrEqual(floor);
    });
  // (it should play nothing; it still plays about one note in 4 s at this shake, once: 8.6 before KEY.out was 8 mm)
  for (const [name, sd, a, most] of [['2 mm', 0.002, 0, 1.3], ['2 mm correlated', 0.002, 0.7, 1.7]] as const)
    it(`a fingertip resting 1 mm over a key plays at most a note or so in 4 s (${name})`, () => {
      const c = hits(restOver, 4, sd, a, 23 + name.length);
      say(`resting 1 mm over, ${name}: mean ${mean(c).toFixed(2)} notes in 4 s`);
      expect(mean(c)).toBeLessThanOrEqual(most);
    });
  for (const [name, sd, a, floor] of [['2 mm', 0.002, 0, 0.45], ['2 mm correlated', 0.002, 0.7, 0.38]] as const)
    it(`six repeats at 5 a second, 1 cm strokes (${name})`, () => {
      const c = hits(reps(6, 5, -0.008, 0.002), 1.5, sd, a, 31 + name.length);
      say(`repeats 5/s, ${name}: exactly 6 ${share(c, 6)}, mean ${mean(c).toFixed(2)}`);
      expect(share(c, 6)).toBeGreaterThanOrEqual(floor);
    });
  it('a gentle press plays once at 2 mm', () => {
    const c = hits((t) => Math.max(-0.01, 0.02 - 0.2 * t), 1, 0.002, 0, 41);
    expect(share(c, 1)).toBeGreaterThanOrEqual(0.97);
  });
});

describe('sticks on a head, the tip shaking 4 mm (correlated)', () => {
  const SD = 0.004;
  /**
   * Eight strokes, `P` s apart, each bottoming at its own height (mean `mu`, sd `sd`, m over the head: no head stops a
   * stick in the air), rebounding up `A`. Returns the share of strokes that played exactly once.
   */
  function strokes(P: number, A: number, mu: number, sd: number, turn: number, seed: number, trials = 150): number {
    const r = rng(seed);
    let once = 0;
    const N = 8;
    for (let k = 0; k < trials; k++) {
      const surf: AirSurface[] = [{ id: 0, face: 'up', x: 0, y: 0, z: 0, r: 0.12, along: 0.5, relift: 0.012 }];
      const air = new AirHits(1);
      const out: AirHit[] = [];
      const bots = Array.from({ length: N }, () => mu + sd * gauss(r));
      const nx = noise(r, SD, 0.6), ny = noise(r, SD, 0.6), nz = noise(r, SD, 0.6);
      const got: number[] = [];
      for (let t = -0.3 + r() * DT; t < N * P + 0.3; t += DT) {
        let y = A + 0.02;
        let x = 0;
        if (t >= 0) {
          const j = Math.min(N - 1, Math.floor((t + P / 2) / P));
          const s = Math.sin(Math.PI * Math.max(-0.5, Math.min(0.5, (t - j * P) / P)));
          y = t > (N - 0.5) * P ? bots[N - 1] + A * 0.88 : bots[j] + A * (Math.sqrt(s * s + 0.0144) - 0.12);
          x = 0.18 * (y - bots[j]);
        }
        out.length = 0;
        air.update(0, x + nx(), y + ny(), nz(), DT, surf, out, 6.5, AIR.stickMin, turn);
        if (out.length) got.push(t - out[0].ago);
      }
      for (let j = 0; j < N; j++) if (got.filter((h) => Math.abs(h - j * P) < P / 2).length === 1) once++;
    }
    return once / (trials * N);
  }
  /** False notes a minute from a stick moving at y(t) over the head. */
  function phantoms(y: (t: number) => number, turn: number, seed: number, trials = 60): number {
    const r = rng(seed);
    let n = 0;
    for (let k = 0; k < trials; k++) {
      const surf: AirSurface[] = [{ id: 0, face: 'up', x: 0, y: 0, z: 0, r: 0.12, along: 0.5, relift: 0.012 }];
      const air = new AirHits(1);
      const out: AirHit[] = [];
      const nx = noise(r, SD, 0.6), ny = noise(r, SD, 0.6), nz = noise(r, SD, 0.6);
      for (let t = r() * DT; t < 10; t += DT) {
        out.length = 0;
        air.update(0, nx(), y(t) + ny(), nz(), DT, surf, out, 6.5, AIR.stickMin, turn);
        n += out.length;
      }
    }
    return (n / trials) * 6;
  }
  const air = (bot: number, A: number) => (t: number) => {
    const s = Math.sin((Math.PI * t) / 0.25);
    return bot + A * (Math.sqrt(s * s + 0.0144) - 0.12);
  };
  it('a stroke that swings through the head plays, with or without the turn', () => {
    const a = strokes(0.25, 0.2, -0.03, 0.01, 0, 5);
    const b = strokes(0.25, 0.2, -0.03, 0.01, TURN.zone, 5);
    say(`swings through: ${a} without the turn, ${b} with it`);
    expect(a).toBeGreaterThanOrEqual(0.97);
    expect(b).toBeGreaterThanOrEqual(0.97);
  });
  it('a drummer’s stroke that stops at the head (±1.5 cm) plays more often with the turn', () => {
    const a = strokes(0.25, 0.2, 0, 0.015, 0, 7);
    const b = strokes(0.25, 0.2, 0, 0.015, TURN.zone, 7);
    say(`stops at the head: ${a} without the turn, ${b} with it`);
    // (about 45% without; it can't be near 100%: the strokes that stop over 1 cm up still miss)
    expect(b).toBeGreaterThanOrEqual(0.62);
    expect(b - a).toBeGreaterThanOrEqual(0.15);
  });
  it('one that stops near the head (1 cm in, ±1.2 cm) plays nine in ten with the turn', () => {
    const b = strokes(0.25, 0.2, -0.01, 0.012, TURN.zone, 9);
    say(`stops near the head, with the turn: ${b}`);
    expect(b).toBeGreaterThanOrEqual(0.86);
  });
  it('the turn adds no notes for a stick hovering, or keeping time 3 cm over the head', () => {
    const hover = phantoms(() => 0.02, TURN.zone, 13);
    const timeKeeping = phantoms(air(0.03, 0.16), TURN.zone, 17);
    say(`phantoms a minute with the turn: hovering 2 cm ${hover.toFixed(2)}, air strokes 3 cm over ${timeKeeping.toFixed(2)}`);
    expect(hover).toBeLessThanOrEqual(0.3);
    expect(timeKeeping).toBeLessThanOrEqual(0.3);
  });
});
