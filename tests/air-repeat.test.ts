/**
 * Repeated notes: a finger pressing the same key again and again, lifting only a centimetre (not out past the key
 * top), and a mallet bouncing on one bar, through the real hit detector at 72 fps with tracking noise. Every press
 * should play once; a finger resting on a key (or trembling on it) plays once in all. REPEAT=1 prints the numbers.
 * (Strokes under a centimetre, a finger never leaving the key, are at the edge of what tracking noise allows: their
 * floors only guard against getting worse.)
 */
import { describe, expect, it } from 'vitest';
import { AIR, AirHits, type AirHit, type AirSurface } from '../src/input/air-hits.js';

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

interface Case {
  name: string;
  /** Height above the surface (m) at time t. */
  y: (t: number) => number;
  dur: number;
  noise: number;
  /** How many hits it should make. */
  want: number;
  /** The share of trials that must make exactly that many (default 0.9 for presses, 0.99 for one). */
  floor?: number;
  kind: 'key' | 'mallet';
}

/** Comes down from 3 cm at `v`, then presses `n` times between `lo` and `hi` at `rate` a second. */
function presses(n: number, rate: number, lo: number, hi: number, v = 0.4): { y: (t: number) => number; dur: number } {
  // (from high enough that the detector has seen it above, however fast it comes)
  const top = 0.03 + v * 0.03;
  const t0 = (top - lo) / v;
  const mid = (lo + hi) / 2;
  const amp = (hi - lo) / 2;
  const P = 1 / rate;
  return {
    dur: t0 + n * P + 0.3,
    y: (t) => {
      if (t < t0) return top - v * t;
      const u = Math.min(t - t0, (n - 0.5) * P);
      // (starts at the bottom: the first press is the approach)
      return mid - amp * Math.cos(2 * Math.PI * u * rate);
    },
  };
}

const TIP = 0.0012;
const STICK = 0.002;
const CASES: Case[] = [
  { name: 'key: 6 presses, 5/s, 1 cm lift', ...presses(6, 5, -0.008, 0.002), noise: TIP, want: 6, kind: 'key', floor: 0.7 },
  { name: 'key: 6 presses, 6/s, to the key top', ...presses(6, 6, -0.008, 0), noise: TIP, want: 6, kind: 'key', floor: 0.25 },
  { name: 'key: 6 presses, 4/s, 1.2 cm lift', ...presses(6, 4, -0.008, 0.004), noise: TIP, want: 6, kind: 'key' },
  { name: 'key: 8 presses, 7/s, 9 mm lift', ...presses(8, 7, -0.007, 0.002), noise: TIP, want: 8, kind: 'key', floor: 0 },
  { name: 'key: in the air, 6/s, 1.8 cm', ...presses(6, 6, -0.015, 0.003), noise: TIP, want: 6, kind: 'key' },
  { name: 'key: in the air, 8/s, 1.5 cm', ...presses(8, 8, -0.012, 0.003), noise: TIP, want: 8, kind: 'key' },
  { name: 'key: held 3 s', y: (t) => (t < 0.1 ? 0.03 - 0.4 * t : -0.01), dur: 3, noise: TIP, want: 1, kind: 'key' },
  { name: 'key: held 3 s, shakier tracking', y: (t) => (t < 0.1 ? 0.03 - 0.4 * t : -0.01), dur: 3, noise: TIP * 1.6, want: 1, kind: 'key', floor: 0.85 },
  { name: 'key: held, trembling 1 mm', y: (t) => (t < 0.1 ? 0.03 - 0.4 * t : -0.006 + 0.001 * Math.sin(t * 50)), dur: 3, noise: TIP, want: 1, kind: 'key' },
  { name: 'key: held, drifting 4 mm', y: (t) => (t < 0.1 ? 0.03 - 0.4 * t : -0.008 + 0.002 * Math.sin(t * 6)), dur: 3, noise: TIP, want: 1, kind: 'key' },
  { name: 'mallet: 6 hits, 5/s, 3.5 cm', ...presses(6, 5, -0.01, 0.025, 1), noise: STICK, want: 6, kind: 'mallet' },
  { name: 'mallet: 6 hits, 6/s, 3 cm', ...presses(6, 6, -0.01, 0.02, 1), noise: STICK, want: 6, kind: 'mallet' },
  { name: 'mallet: resting on a bar', y: (t) => (t < 0.05 ? 0.04 - 1 * t : -0.008), dur: 3, noise: STICK, want: 1, kind: 'mallet' },
];

function run(c: Case, trials = 200): { exact: number; mean: number } {
  const r = rng(99 + c.name.length * 13);
  let exact = 0;
  let sum = 0;
  for (let k = 0; k < trials; k++) {
    const keys = c.kind === 'key';
    const surf: AirSurface[] = [{ id: 0, face: 'up', x: 0, y: 0, z: 0, w: 0.2, d: 0.2, along: keys ? 0.45 : 0.4, confirm: 0.002, key: true, lift: keys ? undefined : 0.01 }];
    const air = new AirHits(1);
    const out: AirHit[] = [];
    let n = 0;
    for (let t = r() * DT; t < c.dur; t += DT) {
      out.length = 0;
      air.update(0, gauss(r) * c.noise, c.y(t) + gauss(r) * c.noise, gauss(r) * c.noise, DT, surf, out, keys ? 1 : 6.5, keys ? AIR.keyMin : AIR.stickMin);
      n += out.length;
    }
    if (n === c.want) exact++;
    sum += n;
  }
  return { exact: exact / trials, mean: sum / trials };
}

describe('repeated notes', () => {
  for (const c of CASES)
    it(c.name, () => {
      const res = run(c);
      if (process.env.REPEAT) console.log(`${c.name.padEnd(36)} exactly ${c.want}: ${Math.round(res.exact * 100)}%  mean ${res.mean.toFixed(2)}`);
      expect(res.exact).toBeGreaterThanOrEqual(c.floor ?? (c.want === 1 ? 0.99 : 0.9));
    });
});

describe('slides and slow presses', () => {
  // five white keys side by side, 2.35 cm apart
  const keys: AirSurface[] = Array.from({ length: 5 }, (_, i) => ({ id: i, face: 'up' as const, x: (i - 2) * 0.0235, y: 0, z: 0, w: 0.0221, d: 0.15, confirm: 0.002, key: true }));
  function slide(v: number, depth: number, noise: number, seed: number): number[] {
    const r = rng(seed);
    const air = new AirHits(1);
    const out: AirHit[] = [];
    const played: number[] = [];
    // (comes down onto the first key, then slides along to the last)
    for (let t = r() * DT; t < 0.25 + 0.12 / v; t += DT) {
      const x = t < 0.25 ? -0.047 : -0.047 + v * (t - 0.25);
      const y = t < 0.1 ? 0.02 - 0.3 * t : t < 0.25 ? Math.max(-depth, 0.02 - 0.3 * t) : -depth;
      out.length = 0;
      air.update(0, x + gauss(r) * noise, y + gauss(r) * noise, gauss(r) * noise, DT, keys, out, 1, AIR.keyMin);
      for (const h of out) played.push(h.surface);
    }
    return played;
  }
  it('a finger sliding across the keys plays each one once, in order (97 slides in 100 at least)', () => {
    for (const [v, depth] of [
      [0.2, 0.005],
      [0.5, 0.008],
      [0.8, 0.006],
    ] as const)
      {
        let ok = 0;
        for (let k = 0; k < 100; k++) if (slide(v, depth, TIP, 7 + k).join() === '0,1,2,3,4') ok++;
        expect(ok).toBeGreaterThanOrEqual(97);
      }
  });
  it('a very slow press plays (softly)', () => {
    const r = rng(3);
    const air = new AirHits(1);
    const out: AirHit[] = [];
    let n = 0;
    let gain = 1;
    for (let t = 0; t < 1.5; t += DT) {
      out.length = 0;
      air.update(0, gauss(r) * TIP, 0.01 - 0.02 * t + gauss(r) * TIP, 0, DT, keys, out, 1, AIR.keyMin);
      n += out.length;
      if (out.length) gain = out[0].gain;
    }
    expect(n).toBe(1);
    expect(gain).toBeLessThan(0.35);
  });
});

describe('a key struck deep', () => {
  it('a stroke 8 cm through a key (under the keyboard) plays once, coming back up included', () => {
    const k: AirSurface[] = [{ id: 0, face: 'up', x: 0, y: 0, z: 0, w: 0.05, d: 0.2, confirm: 0.002, key: true, lift: 0.01 }];
    const air = new AirHits(1);
    const out: AirHit[] = [];
    let n = 0;
    for (let t = 0; t < 0.6; t += DT) {
      const y = t < 0.2 ? 0.04 - 0.6 * t : -0.08 + 0.6 * (t - 0.2);
      out.length = 0;
      air.update(0, 0, Math.min(0.04, y), 0, DT, k, out, 6.5, AIR.stickMin);
      n += out.length;
    }
    expect(n).toBe(1);
  });
});

describe('repeated strikes on drums, congas and the handpan', () => {
  const HAND = 0.0015;
  const cases: { name: string; y: (t: number) => number; dur: number; noise: number; want: number; min: number; floor?: number }[] = [
    { name: 'hands: 6 slaps, 5/s, lifting 1.5 cm', ...presses(6, 5, -0.02, 0.015, 1), noise: HAND, want: 6, min: AIR.minSpeed },
    { name: 'hands: 8 taps, 7/s, lifting 1 cm', ...presses(8, 7, -0.015, 0.01, 1), noise: HAND, want: 8, min: AIR.minSpeed },
    { name: 'sticks: 8 hits, 8/s, lifting 1 cm', ...presses(8, 8, -0.03, 0.01, 2), noise: STICK, want: 8, min: AIR.stickMin },
    { name: 'sticks: 6 hits, 5/s, lifting 3 cm', ...presses(6, 5, -0.03, 0.03, 2), noise: STICK, want: 6, min: AIR.stickMin },
    { name: 'a hand resting on a head', y: (t) => (t < 0.05 ? 0.04 - 1 * t : -0.01), dur: 3, noise: HAND, want: 1, min: AIR.minSpeed, floor: 0.99 },
    { name: 'a hand resting, trembling 1 mm', y: (t) => (t < 0.05 ? 0.04 - 1 * t : -0.01 + 0.001 * Math.sin(t * 50)), dur: 3, noise: HAND, want: 1, min: AIR.minSpeed, floor: 0.99 },
    { name: 'a stick resting on a head', y: (t) => (t < 0.05 ? 0.04 - 1 * t : -0.01), dur: 3, noise: STICK, want: 1, min: AIR.stickMin, floor: 0.99 },
  ];
  for (const c of cases)
    it(c.name, () => {
      const r = rng(5 + c.name.length);
      let exact = 0;
      let sum = 0;
      for (let k = 0; k < 200; k++) {
        const air = new AirHits(1);
        const out: AirHit[] = [];
        const surf: AirSurface[] = [{ id: 0, face: 'up', x: 0, y: 0, z: 0, r: 0.1, relift: process.env.NORELIFT ? undefined : 0.012 }];
        let n = 0;
        for (let t = r() * DT; t < c.dur; t += DT) {
          out.length = 0;
          air.update(0, gauss(r) * c.noise, c.y(t) + gauss(r) * c.noise, gauss(r) * c.noise, DT, surf, out, 2.5, c.min);
          n += out.length;
        }
        if (n === c.want) exact++;
        sum += n;
      }
      if (process.env.REPEAT) console.log(`${c.name.padEnd(40)} exactly ${c.want}: ${Math.round((exact / 200) * 100)}%  mean ${(sum / 200).toFixed(2)}`);
      expect(exact / 200).toBeGreaterThanOrEqual(c.floor ?? 0.9);
    });
});

describe('a black key over two white ones', () => {
  // two white keys (top at 0) and a black key between them at the back, 1 cm higher, reaching over both
  const keys: AirSurface[] = [
    { id: 30, face: 'up', x: 0, y: 0.0105, z: -0.05, w: 0.0185, d: 0.105, confirm: 0.002, key: true },
    { id: 0, face: 'up', x: -0.0118, y: 0, z: 0, w: 0.0225, d: 0.175, confirm: 0.002, key: true },
    { id: 1, face: 'up', x: 0.0118, y: 0, z: 0, w: 0.0225, d: 0.175, confirm: 0.002, key: true },
  ];
  it('pressing it deep and repeating it plays only it, never the white keys under it', () => {
    let whites = 0;
    let blacks = 0;
    for (let k = 0; k < 100; k++) {
      const r = rng(300 + k);
      const air = new AirHits(1);
      const out: AirHit[] = [];
      // (from 3 cm over it, down 2.5 cm past its top: below the white keys' tops; then four repeats, lifting 1.5 cm)
      const pr = presses(5, 5, -0.025, -0.01, 0.4);
      for (let t = r() * DT; t < pr.dur; t += DT) {
        out.length = 0;
        air.update(0, gauss(r) * TIP, 0.0105 + pr.y(t) + gauss(r) * TIP, -0.05 + gauss(r) * TIP, DT, keys, out, 1, AIR.keyMin);
        for (const h of out) h.surface === 30 ? blacks++ : whites++;
      }
    }
    expect(whites).toBe(0);
    expect(blacks / 100).toBeGreaterThanOrEqual(4.8);
  });
});
