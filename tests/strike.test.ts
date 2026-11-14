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
    expect(hits[0].gain).toBeGreaterThan(0.7);
  });

  it('a slap that tracking reports 8 mm above the table still hits (the stop)', () => {
    const det = new StrikeDetector();
    const hits = play(det, slap(0.1, 1.0, 0.008), 1.2);
    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe('stop');
  });

  it('a stop spread over 40 ms still hits', () => {
    const det = new StrikeDetector();
    // 1 m/s, easing to zero over the last 40 ms (the hand compresses on the table)
    const path = (t: number) => {
      if (t < 0.3) return { y: 0.1 };
      const k = t - 0.3;
      const tEnd = 0.08;
      if (k < tEnd) return { y: Math.max(0.005, 0.1 - k * 1.0) };
      const e = Math.min(1, (k - tEnd) / 0.04);
      return { y: Math.max(0.004, 0.02 - 0.02 * (1 - (1 - e) * (1 - e)) - 0.0) };
    };
    expect(play(det, path, 1)).toHaveLength(1);
  });

  it('a soft fingertip tap is a quieter hit, a hard slap ~10 dB louder (a tray never needs pounding)', () => {
    const det = new StrikeDetector();
    const soft = play(det, slap(0.05, 0.4), 1.0);
    expect(soft).toHaveLength(1);
    const det2 = new StrikeDetector();
    const hard = play(det2, slap(0.12, 1.6), 1.0);
    const db = 20 * Math.log10(hard[0].gain / soft[0].gain);
    expect(db).toBeGreaterThan(7);
    expect(db).toBeLessThan(13);
  });

  it('lowering a hand slowly onto the table is silent, and it then rests', () => {
    const det = new StrikeDetector();
    expect(play(det, slap(0.1, 0.15), 2)).toHaveLength(0);
    expect(det.isResting(1)).toBe(true);
  });

  it('resting is found under real jitter (1 mm), and a lean set-down after a small lift is silent', () => {
    const det = new StrikeDetector();
    play(det, () => ({ y: 0 }), 1, 1, 0, 0.001);
    expect(det.isResting(1)).toBe(true);
    // lift 1.5 cm and set it down at 0.4 m/s
    const lean = play(det, (t) => ({ y: t < 0.1 ? t * 0.15 : Math.max(0, 0.015 - (t - 0.1) * 0.4) }), 0.5, 1, 1, 0.001);
    expect(lean).toHaveLength(0);
    // lift 4 cm, then slap
    const big = play(det, (t) => ({ y: t < 0.2 ? t * 0.2 : Math.max(0, 0.04 - (t - 0.2) * 1.2) }), 0.6, 1, 2);
    expect(big).toHaveLength(1);
  });

  it('a hand hovering that stops sharply 2.5 cm above the table is silent, and does not move the surface', () => {
    const det = new StrikeDetector();
    expect(play(det, slap(0.12, 0.6, 0.025), 1)).toHaveLength(0);
    expect(Math.abs(det.surfaceY)).toBeLessThan(0.001);
  });

  it('a hand reaching across the table is not a hit', () => {
    const det = new StrikeDetector();
    const hits = play(det, (t) => ({ y: Math.max(0, 0.06 - t * 0.4), x: -0.3 + t * 1.0 }), 0.6);
    expect(hits).toHaveLength(0);
  });

  it('a pinching (holding) hand never hits', () => {
    const det = new StrikeDetector();
    const hits = play(det, (t) => ({ ...slap(0.1, 1.2)(t), pinching: true }), 1);
    expect(hits).toHaveLength(0);
  });

  it('a hand just found by tracking does nothing for its first frames', () => {
    const det = new StrikeDetector();
    const hits = play(det, (t) => ({ y: Math.max(0, 0.03 - t * 1.5) }), 0.3);
    expect(hits).toHaveLength(0);
  });

  it('two slaps 250 ms apart are two hits', () => {
    const det = new StrikeDetector();
    const twice = (t: number) => {
      const k = t % 0.25;
      return { y: k < 0.06 ? 0.06 - k * 1.0 : k < 0.12 ? 0 : Math.min(0.06, (k - 0.12) * 0.6) };
    };
    expect(play(det, (t) => (t < 0.3 ? { y: 0.06 } : twice(t - 0.3)), 0.8)).toHaveLength(2);
  });

  for (const up of [0.008, 0.015, 0.02, 0.03]) {
    it(`a natural ${up * 1000} mm rebound after a slap is not a second hit`, () => {
      const det = new StrikeDetector();
      // 1.2 m/s down, contact at 0.383 s, then a ballistic bounce of height `up`
      const v0 = Math.sqrt(2 * 9.8 * up);
      const path = (t: number) => {
        if (t < 0.3) return { y: 0.1 };
        const c = 0.3 + 0.1 / 1.2;
        if (t < c) return { y: 0.1 - (t - 0.3) * 1.2 };
        const k = t - c;
        return { y: Math.max(0, v0 * k - 4.9 * k * k) };
      };
      // a real hand is never frozen: 0.3 mm of tracking jitter
      expect(play(det, path, 1, 1, 0, 0.0003)).toHaveLength(1);
    });
  }

  it('a one-frame dropout mid-slap still hits', () => {
    const det = new StrikeDetector();
    const hits: number[] = [];
    for (let t = 0, i = 0; t <= 1; t += DT, i++) {
      const y = (t < 0.3 ? 0.1 : Math.max(0, 0.1 - (t - 0.3) * 1.2)) + 0.02;
      const lost = Math.abs(t - 0.36) < DT / 2;
      if (det.update(1, hand(0, y, 0, !lost), t, DT)) hits.push(t);
    }
    expect(hits).toHaveLength(1);
  });

  it('a 60 ms dropout right at contact still hits (late), once', () => {
    const det = new StrikeDetector();
    const hits: string[] = [];
    const contact = 0.3 + 0.1 / 1.2;
    for (let t = 0; t <= 1; t += DT) {
      const y = (t < 0.3 ? 0.1 : Math.max(0, 0.1 - (t - 0.3) * 1.2)) + 0.02;
      const lost = t > contact - 0.03 && t < contact + 0.03;
      const s = det.update(1, hand(0, y, 0, !lost), t, DT);
      if (s) hits.push(s.kind);
    }
    expect(hits).toHaveLength(1);
  });

  it('a 200 ms dropout at contact, the hand already bounced 3 cm up when it comes back: still the hit (late)', () => {
    const det = new StrikeDetector();
    const hits: string[] = [];
    const contact = 0.3 + 0.1 / 1.2;
    for (let t = 0; t <= 1; t += DT) {
      // down at 1.2 m/s, then back up at 0.3 m/s after contact
      const bottom = t < 0.3 ? 0.1 : t < contact ? 0.1 - (t - 0.3) * 1.2 : Math.min(0.03, (t - contact) * 0.3);
      const lost = t > contact - 0.05 && t < contact + 0.15;
      const s = det.update(1, hand(0, bottom + 0.02, 0, !lost), t, DT);
      if (s) hits.push(s.kind);
    }
    expect(hits).toEqual(['late']);
  });

  it('a hand back from a short loss plays at once (no settling wait)', () => {
    const det = new StrikeDetector();
    let t = 0;
    for (; t < 0.5; t += DT) det.update(1, hand(0, 0.12, 0), t, DT);
    for (; t < 0.8; t += DT) det.update(1, hand(0, 0.12, 0, false), t, DT);
    const hits: number[] = [];
    // back, and slapping straight away
    for (let k = 0; k < 40; k++, t += DT) {
      const s = det.update(1, hand(0, Math.max(0, 0.1 - k * DT * 1.2) + 0.02, 0), t, DT);
      if (s) hits.push(t);
    }
    expect(hits).toHaveLength(1);
  });

  it('a frame hitch at the moment of contact still plays the hit', () => {
    const det = new StrikeDetector();
    const hits: string[] = [];
    let t = 0;
    for (; t < 0.4; t += DT) det.update(1, hand(0, 0.1, 0), t, DT);
    let y = 0.1;
    for (let k = 0; k < 5; k++) {
      t += DT;
      y -= 1.2 * DT;
      const s = det.update(1, hand(0, y + 0.02, 0), t, DT);
      if (s) hits.push(s.kind);
    }
    // 80 ms without frames: it reached the table
    t += 0.08;
    const s = det.update(1, hand(0, 0.02, 0), t, 0.08);
    if (s) hits.push(s.kind);
    for (let k = 0; k < 20; k++) {
      t += DT;
      const q = det.update(1, hand(0, 0.02, 0), t, DT);
      if (q) hits.push(q.kind);
    }
    expect(hits).toEqual(['late']);
  });

  it('an accent then a soft note 10 cm away 150 ms later: both play (only a rebound in place is ignored)', () => {
    const det = new StrikeDetector();
    const hits: number[] = [];
    let t = 0;
    for (; t < 0.3; t += DT) det.update(1, hand(0, 0.12, 0), t, DT);
    let y = 0.1;
    while (y > 0) {
      t += DT;
      y = Math.max(0, y - 1.5 * DT);
      const s = det.update(1, hand(0, y + 0.02, 0), t, DT);
      if (s) hits.push(s.speed);
    }
    // lift 4 cm while moving 10 cm across, then a soft tap
    for (let k = 0; k < 6; k++) {
      t += DT;
      det.update(1, hand(0.1 * ((k + 1) / 6), 0.04 * ((k + 1) / 6) + 0.02, 0), t, DT);
    }
    y = 0.04;
    while (y > 0) {
      t += DT;
      y = Math.max(0, y - 0.6 * DT);
      const s = det.update(1, hand(0.1, y + 0.02, 0), t, DT);
      if (s) hits.push(s.speed);
    }
    expect(hits).toHaveLength(2);
  });

  it('a plane estimated 3 cm above the real table: a slap through it teaches the surface where the table is', () => {
    const det = new StrikeDetector({ surfaceDriftM: 0.05 });
    for (let n = 0; n < 4; n++) play(det, slap(0.1, 1.2, -0.03), 0.9, 1, n);
    expect(det.surfaceY).toBeLessThan(-0.01);
  });

  it('samples repeated at 30 Hz under a 72 Hz frame: one hit, speed not inflated', () => {
    const det = new StrikeDetector();
    let held = 0.12;
    let last = -1;
    const hits: number[] = [];
    for (let t = 0; t <= 1; t += DT) {
      const tick = Math.floor(t * 30);
      if (tick !== last) {
        last = tick;
        held = (t < 0.3 ? 0.1 : Math.max(0, 0.1 - (t - 0.3) * 0.8)) + 0.02;
      }
      const s = det.update(1, hand(0, held, 0), t, DT);
      if (s) hits.push(s.speed);
    }
    expect(hits).toHaveLength(1);
    expect(hits[0]).toBeLessThan(1.3);
  });

  it('a frame hitch does not read as a huge speed', () => {
    const det = new StrikeDetector();
    const hits: number[] = [];
    let t = 0;
    for (; t < 0.4; t += DT) det.update(1, hand(0, 0.08, 0), t, DT);
    // 120 ms with no frames while the hand drifted down 3 cm, then it carries on slowly
    t += 0.12;
    const s0 = det.update(1, hand(0, 0.05, 0), t, 0.12);
    if (s0) hits.push(s0.speed);
    for (let k = 0; k < 60; k++) {
      t += DT;
      const s = det.update(1, hand(0, Math.max(0.02, 0.05 - k * 0.002), 0), t, DT);
      if (s) hits.push(s.speed);
    }
    expect(hits).toHaveLength(0);
  });

  it('works the same at 90 and 120 Hz', () => {
    for (const hz of [90, 120]) {
      const det = new StrikeDetector();
      let n = 0;
      for (let t = 0; t <= 1; t += 1 / hz) if (det.update(1, hand(0, (t < 0.3 ? 0.1 : Math.max(0.006, 0.1 - (t - 0.3) * 1.0)) + 0.02, 0), t, 1 / hz)) n++;
      expect(n).toBe(1);
    }
  });

  it('strike times are back-dated to the contact (within a frame)', () => {
    const det = new StrikeDetector();
    const hits = play(det, slap(0.1, 1.0, 0, 0.3), 1);
    const contact = 0.3 + 0.1 / 1.0;
    expect(Math.abs(hits[0].t - contact)).toBeLessThan(DT * 1.01);
  });

  it('a table 1.2 cm higher than placed plays, and the surface learns it', () => {
    const det = new StrikeDetector();
    let all = 0;
    for (let k = 0; k < 6; k++) all += play(det, slap(0.12, 1.0, 0.012, 0.1), 0.6, 1, k).length;
    expect(all).toBe(6);
    expect(det.surfaceY).toBeGreaterThan(0.006);
  });

  it('jitter on a resting or hovering hand never plays', () => {
    const det = new StrikeDetector();
    expect(play(det, () => ({ y: 0 }), 3, 1, 0, 0.0015)).toHaveLength(0);
    const det2 = new StrikeDetector();
    expect(play(det2, () => ({ y: 0.03 }), 3, 1, 0, 0.0015)).toHaveLength(0);
  });

  it('both hands are independent', () => {
    const det = new StrikeDetector();
    expect(play(det, slap(0.1, 1.2, 0, 0.3), 0.6, 0)).toHaveLength(1);
    expect(play(det, slap(0.1, 1.2, 0, 0.32), 0.6, 1)).toHaveLength(1);
  });

  it('a stop-only surface (a doorway, a box face) ignores a hand passing through, still takes a stop', () => {
    const det = new StrikeDetector();
    det.stopOnly = true;
    // straight through at 1 m/s, no stop
    expect(play(det, (t) => ({ y: 0.1 - t * 1.0 }), 0.5)).toHaveLength(0);
    const det2 = new StrikeDetector();
    det2.stopOnly = true;
    expect(play(det2, slap(0.1, 1.0, 0.006), 1)).toHaveLength(1);
  });

  it('louder for faster, never silent', () => {
    expect(speedToGain(0.2)).toBeCloseTo(Math.pow(10, -12 / 20), 3);
    expect(speedToGain(0.8)).toBeGreaterThan(speedToGain(0.5));
    expect(speedToGain(5)).toBe(1);
  });
});

describe('pad layout and picking', () => {
  const pads = kitLayout(['kick', 'snare', 'hat'], { handed: 'right', oneHand: null });

  it('the full kit: seven pieces, none within 4 cm of another seen from above', () => {
    const all = kitLayout(['kick', 'snare', 'hat', 'tom', 'floor', 'crash', 'ride'], { handed: 'right', oneHand: null });
    for (const a of all) for (const b of all) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual((a.size + b.size) / 2 + 0.04 - 1e-6);
  });

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

  it("a left-handed kit is the mirror (a right-hander's hi-hat is on the left)", () => {
    const r = kitLayout(['hat'], { handed: 'right', oneHand: null })[0];
    const l = kitLayout(['hat'], { handed: 'left', oneHand: null })[0];
    expect(r.x).toBeLessThan(0);
    expect(l.x).toBeCloseTo(-r.x, 6);
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
