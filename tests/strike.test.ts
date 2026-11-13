import { describe, expect, it } from 'vitest';
import { StrikeDetector, speedToGain, type HandSample, type Point } from '../src/kit/strike.js';
import { kitLayout, pickPad, settleSpot } from '../src/kit/layout.js';

const DT = 1 / 72;

/** A flat hand: palm centre at (x, y, z) with its bottom 2 cm below; index and middle tips level with it, 8 cm ahead. */
function hand(x: number, y: number, z: number, tracked = true, pinching = false): HandSample {
  const points: Point[] = [
    { x, y, z, r: 0.02 },
    { x: x - 0.01, y: y - 0.012, z: z - 0.08, r: 0.008 },
    { x: x + 0.01, y: y - 0.012, z: z - 0.08, r: 0.008 },
  ];
  return { tracked, pinching, points };
}

/** Palm-bottom height path → frames; returns the strikes seen. */
function play(det: StrikeDetector, path: (t: number) => { y: number; x?: number; z?: number; pinching?: boolean }, seconds: number, side: 0 | 1 = 1, t0 = 0, noise = 0) {
  const hits: { t: number; speed: number; gain: number; kind: string }[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const g = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  for (let t = 0; t <= seconds; t += DT) {
    const p = path(t);
    const y = p.y + 0.02 + (noise ? g() * noise : 0); // palm centre = bottom + radius
    const s = det.update(side, hand((p.x ?? 0) + (noise ? g() * noise : 0), y, p.z ?? 0, true, p.pinching ?? false), t0 + t, DT);
    if (s) hits.push({ t: t0 + t, speed: s.speed, gain: s.gain, kind: s.kind });
  }
  return hits;
}

/** Down from `from` at `speed` until the real table stops it at `floor`, then held there. */
const slap = (from: number, speed: number, floor = 0, start = 0.3) => (t: number) => ({
  y: t < start ? from : Math.max(floor, from - (t - start) * speed),
});

describe('strike detection', () => {
  it('a slap is one hit, loud', () => {
    const det = new StrikeDetector();
    const hits = play(det, slap(0.1, 1.2), 1.2);
    expect(hits).toHaveLength(1);
    expect(hits[0].gain).toBeGreaterThan(0.75);
  });

  it('a slap that tracking reports 8 mm above the table still hits (the stop)', () => {
    const det = new StrikeDetector();
    const hits = play(det, slap(0.1, 1.0, 0.008), 1.2);
    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe('stop');
  });

  it('a soft fingertip tap is a quiet hit', () => {
    const det = new StrikeDetector();
    const hits = play(det, slap(0.05, 0.4), 1.0);
    expect(hits).toHaveLength(1);
    expect(hits[0].gain).toBeLessThan(0.65);
    expect(hits[0].gain).toBeGreaterThanOrEqual(0.4);
  });

  it('lowering a hand slowly onto the table is silent, and it then rests', () => {
    const det = new StrikeDetector();
    expect(play(det, slap(0.1, 0.15), 2)).toHaveLength(0);
    expect(det.isResting(1)).toBe(true);
  });

  it('a resting hand must lift 2 cm before it plays again', () => {
    const det = new StrikeDetector();
    play(det, () => ({ y: 0 }), 1);
    expect(det.isResting(1)).toBe(true);
    // lift 1 cm and come down hard: still resting
    const small = play(det, (t) => ({ y: t < 0.1 ? t * 0.1 : Math.max(0, 0.01 - (t - 0.1) * 1.2) }), 0.5, 1, 1);
    expect(small).toHaveLength(0);
    // lift 4 cm, then slap
    const big = play(det, (t) => ({ y: t < 0.2 ? t * 0.2 : Math.max(0, 0.04 - (t - 0.2) * 1.2) }), 0.6, 1, 2);
    expect(big).toHaveLength(1);
  });

  it('a hand reaching across the table is not a hit', () => {
    const det = new StrikeDetector();
    // mostly sideways at 1 m/s, sinking at 0.4 m/s onto the table
    const hits = play(det, (t) => ({ y: Math.max(0, 0.06 - t * 0.4), x: -0.3 + t * 1.0 }), 0.6);
    expect(hits).toHaveLength(0);
  });

  it('a pinching hand never hits', () => {
    const det = new StrikeDetector();
    const hits = play(det, (t) => ({ ...slap(0.1, 1.2)(t), pinching: true }), 1);
    expect(hits).toHaveLength(0);
  });

  it('a hand just found by tracking does nothing for its first frames', () => {
    const det = new StrikeDetector();
    // appears 3 cm up, already moving down fast
    const hits = play(det, (t) => ({ y: Math.max(0, 0.03 - t * 1.5) }), 0.3);
    expect(hits).toHaveLength(0);
  });

  it('two slaps 250 ms apart are two hits; a bounce is not', () => {
    const det = new StrikeDetector();
    const twice = (t: number) => {
      const k = t % 0.25; // down 60 ms at 1 m/s, up again
      return { y: k < 0.06 ? 0.06 - k * 1.0 : k < 0.12 ? 0 : Math.min(0.06, (k - 0.12) * 0.6) };
    };
    const hits = play(det, (t) => (t < 0.3 ? { y: 0.06 } : twice(t - 0.3)), 0.3 + 0.5);
    expect(hits).toHaveLength(2);
    // a 4 mm bounce right after a hit does not re-trigger
    const det2 = new StrikeDetector();
    const bounce = play(det2, (t) => ({ y: t < 0.3 ? 0.08 : t < 0.38 ? Math.max(0, 0.08 - (t - 0.3) * 1.2) : t < 0.42 ? 0.004 : 0 }), 0.8);
    expect(bounce).toHaveLength(1);
  });

  it('a table 2 cm higher than placed still plays, and the surface learns it', () => {
    const det = new StrikeDetector();
    const first = play(det, slap(0.12, 1.2, 0.02), 0.8);
    expect(first).toHaveLength(1);
    expect(det.surfaceY).toBeGreaterThan(0.003);
    // keep slapping: the surface settles near the real table and medium hits land
    let all = 0;
    for (let k = 0; k < 6; k++) all += play(det, slap(0.12, 0.8, 0.02, 0.1), 0.6, 1, 1 + k).length;
    expect(all).toBe(6);
    expect(det.surfaceY).toBeGreaterThan(0.012);
  });

  it('jitter on a resting or hovering hand never plays', () => {
    const det = new StrikeDetector();
    expect(play(det, () => ({ y: 0 }), 3, 1, 0, 0.0015)).toHaveLength(0);
    const det2 = new StrikeDetector();
    expect(play(det2, () => ({ y: 0.03 }), 3, 1, 0, 0.0015)).toHaveLength(0);
  });

  it('both hands are independent (a flam is two strikes, joined by the kit)', () => {
    const det = new StrikeDetector();
    const a = play(det, slap(0.1, 1.2, 0, 0.3), 0.6, 0);
    const b = play(det, slap(0.1, 1.2, 0, 0.32), 0.6, 1);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it('louder for faster, never silent', () => {
    expect(speedToGain(0.1)).toBeCloseTo(0.4);
    expect(speedToGain(0.8)).toBeGreaterThan(speedToGain(0.5));
    expect(speedToGain(5)).toBe(1);
  });
});

describe('pad layout and picking', () => {
  const pads = kitLayout(['kick', 'snare', 'hat'], { handed: 'right', oneHand: null });

  it('zones are at least 9 cm across and pads at least 4 cm apart', () => {
    for (const p of kitLayout(['kick', 'snare', 'hat', 'tom'], { handed: 'right', oneHand: null })) expect(p.zone * 2).toBeGreaterThanOrEqual(0.09);
    for (const oneHand of [null, 'left', 'right'] as const) {
      const all = kitLayout(['kick', 'snare', 'hat', 'tom'], { handed: 'right', oneHand });
      for (const a of all) for (const b of all) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual((a.size + b.size) / 2 + 0.04 - 1e-6);
    }
  });

  it('the palm over the kick picks the kick, a fingertip on the hat picks the hat', () => {
    const k = pads.findIndex((p) => p.lane === 'kick');
    expect(pickPad(hand(pads[k].x, 0.02, pads[k].z + 0.06).points, 0, 0, pads)).toBe(k);
    const h = pads.findIndex((p) => p.lane === 'hat');
    // only the index tip is down, over the hat
    const pts: Point[] = [
      { x: pads[h].x, y: 0.06, z: pads[h].z + 0.08, r: 0.02 },
      { x: pads[h].x, y: 0.008, z: pads[h].z, r: 0.008 },
    ];
    expect(pickPad(pts, 0, 0, pads)).toBe(h);
  });

  it('bare table is -1', () => {
    expect(pickPad(hand(0, 0.02, 0.3).points, 0, 0, pads)).toBe(-1);
  });

  it('a left-handed kit is the mirror', () => {
    const l = kitLayout(['hat'], { handed: 'left', oneHand: null })[0];
    expect(l.x).toBeLessThan(0);
  });

  it('a one-handed kit sits on the playing side', () => {
    const r = kitLayout(['kick', 'snare', 'hat', 'tom'], { handed: 'right', oneHand: 'right' });
    const mean = r.reduce((s, p) => s + p.x, 0) / r.length;
    expect(mean).toBeGreaterThan(0.05);
  });

  it('a dragged pad settles clear of the others and within reach', () => {
    const s = settleSpot('hat', pads[0].x + 0.01, pads[0].z, pads);
    for (const o of pads) if (o.lane !== 'hat') expect(Math.hypot(s.x - o.x, s.z - o.z)).toBeGreaterThanOrEqual((0.09 + o.size) / 2 + 0.039);
    const far = settleSpot('hat', 2, 0, pads);
    expect(Math.hypot(far.x, far.z)).toBeLessThanOrEqual(0.3 + 1e-9);
  });
});
