/**
 * How the instruments feel, measured: strikes played through the real hit detector at the headset's frame rate,
 * with hand-tracking noise, many times each at random frame phases. For each kind of stroke: how often it plays,
 * how late it plays after the true moment of contact, how loud; and how often a hovering or stopping hand plays
 * when it shouldn't. Printed as a table (FEEL=1 for the table), with floors asserted.
 */
import { describe, expect, it } from 'vitest';
import { AIR, AirHits, airGain, type AirHit, type AirSurface } from '../src/input/air-hits.js';

const FPS = 72;
const DT = 1 / FPS;

/** A seeded random (repeatable runs). */
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
function gauss(r: () => number): number {
  return Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r());
}

interface Stroke {
  name: string;
  /** Speed at contact (m/s), down. */
  v: number;
  /** How far past the surface it stops (m; < 0: stops above it, never touching). */
  stop: number;
  /** After stopping: 'hold' there, or 'up' (comes back up). */
  after: 'hold' | 'up';
  /** Sideways speed (m/s): a slanting stroke (a stick's arc). */
  side?: number;
  /** Tracking noise, 1 sd per frame per axis (m). */
  noise: number;
  /** Should it play? */
  plays: boolean;
}

interface Inst {
  name: string;
  min: number;
  full: number;
  along?: number;
  rearm?: number;
  strokes: Stroke[];
}

const HAND = 0.0015;
const TIP = 0.0012;
const STICK = 0.002;
const INSTS: Inst[] = [
  {
    name: 'drums (hands)',
    min: AIR.minSpeed,
    full: 2.5,
    strokes: [
      { name: 'slap', v: 2, stop: 0.03, after: 'up', noise: HAND, plays: true },
      { name: 'soft tap', v: 0.45, stop: 0.02, after: 'up', noise: HAND, plays: true },
      { name: 'gentle tap', v: 0.25, stop: 0.015, after: 'up', noise: HAND, plays: true },
      { name: 'stops 2 cm above', v: 0.8, stop: -0.02, after: 'hold', noise: HAND, plays: false },
      { name: 'hover 1 cm above', v: 0, stop: -0.01, after: 'hold', noise: HAND, plays: false },
    ],
  },
  {
    name: 'drums (sticks)',
    min: 0.6,
    full: 6.5,
    strokes: [
      { name: 'hit', v: 4, stop: 0.04, after: 'up', side: 1.2, noise: STICK, plays: true },
      { name: 'soft hit', v: 1.0, stop: 0.03, after: 'up', side: 0.4, noise: STICK, plays: true },
      { name: 'ghost note', v: 0.6, stop: 0.02, after: 'up', side: 0.2, noise: STICK, plays: true },
      { name: 'stops 3 cm above', v: 1.5, stop: -0.03, after: 'hold', noise: STICK, plays: false },
      { name: 'rest 1 cm above', v: 0, stop: -0.01, after: 'hold', noise: STICK, plays: false },
    ],
  },
  {
    name: 'piano',
    min: AIR.minSpeed,
    full: 1.0,
    rearm: 0.012,
    along: 0.45,
    strokes: [
      { name: 'firm press', v: 0.6, stop: 0.012, after: 'hold', noise: TIP, plays: true },
      { name: 'press', v: 0.35, stop: 0.01, after: 'hold', noise: TIP, plays: true },
      { name: 'gentle press', v: 0.2, stop: 0.01, after: 'hold', noise: TIP, plays: true },
      { name: 'very slow press', v: 0.12, stop: 0.012, after: 'hold', noise: TIP, plays: true },
      { name: 'slanted press', v: 0.35, stop: 0.01, after: 'hold', side: 0.3, noise: TIP, plays: true },
      { name: 'stops 8 mm above', v: 0.4, stop: -0.008, after: 'hold', noise: TIP, plays: false },
      { name: 'rest 3 mm above', v: 0, stop: -0.003, after: 'hold', noise: TIP, plays: false },
    ],
  },
  {
    name: 'marimba (mallets)',
    min: 0.6,
    full: 6.5,
    along: 0.4,
    strokes: [
      { name: 'hit', v: 3, stop: 0.03, after: 'up', side: 1.5, noise: STICK, plays: true },
      { name: 'soft hit', v: 0.9, stop: 0.02, after: 'up', side: 0.6, noise: STICK, plays: true },
      { name: 'stops 3 cm above', v: 1.5, stop: -0.03, after: 'hold', noise: STICK, plays: false },
    ],
  },
];

/**
 * Where a stroke's point is (above the surface at y = 0) at time t; contact at t = 0. It comes in at speed v
 * (straight, slanting sideways by `side`), then slows to a stop `stop` past the surface (constant deceleration), then
 * holds or comes back up at a third of its speed.
 */
function at(s: Stroke, t: number): [number, number] {
  const x = (s.side ?? 0) * Math.min(t, 0.03);
  if (s.v === 0) return [0, -s.stop];
  if (s.stop < 0) {
    // (stopping above: it slows from v to 0 over the last part, never reaching it)
    const d = 0.03;
    const tStop = (2 * d) / s.v;
    const t0 = -tStop;
    if (t < t0) return [x, -s.stop + d + s.v * (t0 - t)];
    const u = Math.min(t - t0, tStop);
    return [x, -s.stop + d - (s.v * u - (s.v * s.v * u * u) / (4 * d))];
  }
  if (t <= 0) return [x, -s.v * t];
  const tStop = (2 * s.stop) / s.v;
  const u = Math.min(t, tStop);
  const y = -(s.v * u - (s.v * s.v * u * u) / (4 * s.stop));
  if (t <= tStop || s.after === 'hold') return [x, y];
  return [x, y + (s.v / 3) * (t - tStop)];
}

interface Result {
  inst: string;
  stroke: string;
  plays: boolean;
  /** Share of trials that played (exactly once). */
  rate: number;
  /** Share that played twice or more. */
  doubled: number;
  /** Delay after true contact (ms): median and 90th percentile. */
  med: number;
  p90: number;
  gain: number;
}

export type Detector = (inst: Inst) => {
  reset(): void;
  /** One frame: the point at (x, y) after dt; returns a hit or null. */
  step(x: number, y: number, dt: number): AirHit | null;
};

/** The detector as the room drives it: raw heights, keys fire 2 mm in, the room's minimum speeds. */
const current: Detector = (inst) => {
  const keys = inst.name.startsWith('piano');
  const stick = inst.name.includes('sticks') || inst.name.includes('mallets');
  const surf: AirSurface[] = [{ id: 0, face: 'up', x: 0, y: 0, z: 0, w: 0.2, d: 0.2, along: inst.along, rearm: inst.rearm, confirm: keys ? 0.002 : undefined }];
  const air = new AirHits(1);
  const out: AirHit[] = [];
  const min = stick ? AIR.stickMin : keys ? AIR.keyMin : AIR.minSpeed;
  return {
    reset() {
      air.forget(0);
    },
    step(x, y, dt) {
      out.length = 0;
      air.update(0, x, y, 0, dt, surf, out, inst.full, min);
      return out[0] ?? null;
    },
  };
};

export function measure(det: Detector, trials = 400): Result[] {
  const rows: Result[] = [];
  for (const inst of INSTS) {
    const d = det(inst);
    for (const s of inst.strokes) {
      const r = rng(1234 + s.name.length * 77 + inst.name.length);
      const delays: number[] = [];
      let once = 0;
      let twice = 0;
      let gain = 0;
      for (let k = 0; k < trials; k++) {
        d.reset();
        // from 0.25 s before contact to 0.4 s after, frames at a random phase
        const phase = r() * DT;
        let n = 0;
        let first = NaN;
        for (let t = -0.25 + phase; t < 0.4; t += DT) {
          const [x, y] = at(s, t);
          const hit = d.step(x + gauss(r) * s.noise, y + gauss(r) * s.noise, DT);
          if (hit) {
            n++;
            if (n === 1) {
              first = t;
              gain += hit.gain;
            }
          }
        }
        if (n === 1) once++;
        if (n >= 2) twice++;
        if (n >= 1) delays.push(first * 1000);
      }
      delays.sort((a, b) => a - b);
      rows.push({
        inst: inst.name,
        stroke: s.name,
        plays: s.plays,
        rate: once / trials,
        doubled: twice / trials,
        med: delays.length ? delays[Math.floor(delays.length / 2)] : NaN,
        p90: delays.length ? delays[Math.floor(delays.length * 0.9)] : NaN,
        gain: delays.length ? gain / delays.length : 0,
      });
    }
  }
  return rows;
}

export function table(rows: Result[]): string {
  const pct = (v: number) => `${Math.round(v * 100)}%`.padStart(5);
  const ms = (v: number) => (Number.isNaN(v) ? '   -' : `${Math.round(v)}`.padStart(4));
  return rows
    .map((r) => `${r.inst.padEnd(18)} ${r.stroke.padEnd(18)} ${r.plays ? 'should play' : 'should not'}  played ${pct(r.rate + r.doubled)}  twice ${pct(r.doubled)}  late ${ms(r.med)} ms (p90 ${ms(r.p90)})  gain ${r.gain.toFixed(2)}`)
    .join('\n');
}

describe('how the instruments feel', () => {
  const rows = measure(current);
  if (process.env.FEEL) console.log(`\n${table(rows)}`);
  for (const r of rows)
    it(`${r.inst}, ${r.stroke}: ${r.plays ? 'plays, once' : 'plays nothing'}`, () => {
      if (r.plays) {
        expect(r.rate).toBeGreaterThanOrEqual(0.9);
        expect(r.doubled).toBeLessThanOrEqual(0.01);
      } else expect(r.rate + r.doubled).toBeLessThanOrEqual(0.01);
    });
  it('a key press plays within 20 ms of touching (median)', () => {
    for (const r of rows) if (r.inst === 'piano' && r.plays && r.stroke !== 'very slow press') expect(r.med).toBeLessThanOrEqual(20);
  });
});
