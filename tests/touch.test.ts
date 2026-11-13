import { describe, expect, it } from 'vitest';
import { TouchFinder, becomesKeys, clapIn, grow, isClap, touchVoice, type P3 } from '../src/room/touch.js';

const DT = 1 / 72;

/** A fingertip comes down at `speed` onto something at height `top`, stops dead there, holds, then lifts. */
function tap(f: TouchFinder, t0: number, top: number, speed = 0.8, x = 0, hold = 0.12) {
  const out: { t: number; found: boolean; at: P3 }[] = [];
  let t = t0;
  let y = top + 0.12;
  // lifted, then coming down
  for (let k = 0; k < 8; k++, t += DT) f.update(1, { x, y, z: -0.3 }, t);
  while (y > top) {
    y = Math.max(top, y - speed * DT);
    const r = f.update(1, { x, y, z: -0.3 }, t);
    if (r) out.push({ t, found: r.found, at: { ...r.at } });
    t += DT;
  }
  for (let k = 0; k < hold / DT; k++, t += DT) {
    const r = f.update(1, { x, y: top, z: -0.3 }, t);
    if (r) out.push({ t, found: r.found, at: { ...r.at } });
  }
  // and up again
  for (let k = 0; k < 10; k++, t += DT) f.update(1, { x, y: top + k * 0.01, z: -0.3 }, t);
  return { out, t };
}

describe('finding things by touch', () => {
  it('a tap on a cup lights a spot; a second tap there finds it', () => {
    const f = new TouchFinder();
    const a = tap(f, 0, 0.9);
    expect(a.out).toHaveLength(1);
    expect(a.out[0].found).toBe(false);
    const b = tap(f, a.t + 0.4, 0.9);
    expect(b.out).toHaveLength(1);
    expect(b.out[0].found).toBe(true);
    expect(b.out[0].at.y).toBeCloseTo(0.9, 2);
  });
  it('a second tap somewhere else is a new first tap, not a find', () => {
    const f = new TouchFinder();
    const a = tap(f, 0, 0.9);
    const b = tap(f, a.t + 0.4, 0.9, 0.8, 0.1);
    expect(b.out[0].found).toBe(false);
  });
  it('a hand slowing down in the air (over ~100 ms) is not a stop', () => {
    const f = new TouchFinder();
    let t = 0;
    let y = 1.1;
    let v = 0.8;
    let hits = 0;
    for (let k = 0; k < 80; k++, t += DT) {
      v = Math.max(0, v - 8 * DT);
      y -= v * DT;
      if (f.update(1, { x: 0, y, z: -0.3 }, t)) hits++;
    }
    expect(hits).toBe(0);
  });
  it('a resting hand never taps twice; a pinching or lost hand forgets', () => {
    const f = new TouchFinder();
    const a = tap(f, 0, 0.9, 0.8, 0, 2);
    expect(a.out).toHaveLength(1);
    expect(f.update(1, null, a.t + 0.1)).toBeNull();
  });
  it('a tracking jump (one huge step, then still) is never a tap', () => {
    const f = new TouchFinder();
    let t = 0;
    let hits = 0;
    for (let rep = 0; rep < 3; rep++) {
      for (let k = 0; k < 10; k++, t += DT) if (f.update(1, { x: 0.5, y: 1.4, z: 0 }, t)) hits++;
      for (let k = 0; k < 10; k++, t += DT) if (f.update(1, { x: 0.05, y: 0.9, z: -0.3 }, t)) hits++;
    }
    expect(hits).toBe(0);
  });
  it('what a thing plays, from where it is: book, mug, bottle, laptop lid, knees, chair arm, mid-air', () => {
    expect(touchVoice(0.02, 1)?.sound).toBe('block');
    expect(touchVoice(0.09, 1)?.sound).toBe('bell');
    expect(touchVoice(0.11, 1)!.size).toBeGreaterThan(touchVoice(0.06, 1)!.size);
    expect(touchVoice(0.25, 1)?.sound).toBe('chime');
    expect(touchVoice(0.15, 0.1)?.sound).toBe('ride');
    expect(touchVoice(-0.2, 1, -0.1)?.sound).toBe('congas');
    expect(touchVoice(-0.2, 1, -0.1)!.tone).toBeLessThan(touchVoice(-0.2, 1, 0.1)!.tone);
    expect(touchVoice(-0.15, 1, 0.35)?.sound).toBe('cowbell');
    expect(touchVoice(0.5, 1)).toBeNull();
  });
  it('a keyboard: taps swept across a low flat thing grow it, and past 25 cm wide it becomes keys', () => {
    let b = { minX: -0.04, maxX: 0.04, minZ: -0.04, maxZ: 0.04 };
    for (const x of [0.05, 0.1, 0.15, -0.06, -0.1]) b = grow(b, x, 0) ?? b;
    expect(b.maxX - b.minX).toBeGreaterThan(0.25);
    expect(becomesKeys(b, true, 'block', 'flat')).toBe(true);
    // a mug never does, however you hit it
    expect(becomesKeys(b, true, 'bell', 'cup')).toBe(false);
    // a hit inside it changes nothing
    expect(grow(b, 0, 0)).toBeNull();
  });
  it('a clap is two palms meeting fast; hands drifting together are not', () => {
    expect(isClap(0.05, 0.08, 1 / 72)).toBe(true);
    expect(isClap(0.05, 0.052, 1 / 72)).toBe(false);
    expect(isClap(0.12, 0.2, 1 / 72)).toBe(false);
  });
  it('a hand coming back into tracking near the other is not a clap', () => {
    expect(isClap(0.05, Infinity, 1 / 72)).toBe(false);
  });
  it('the clap sounds when the palms meet, not on the way in', () => {
    expect(clapIn(0.035, 1)).toBe(0);
    expect(clapIn(0.065, 1)).toBeCloseTo(0.03, 3);
    expect(clapIn(0.065, 0.01)).toBeLessThanOrEqual(0.05);
  });
  it('a tap still lands through a millimetre of tracking jitter', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.002;
    let found = 0;
    for (let trial = 0; trial < 40; trial++) {
      const f = new TouchFinder();
      let t = trial * 0.003;
      let y = 1.0;
      for (let k = 0; k < 8; k++, t += DT) f.update(1, { x: rnd(), y: y + rnd(), z: -0.3 + rnd() }, t);
      let hit = false;
      for (let k = 0; k < 40; k++, t += DT) {
        y = Math.max(0.9, y - 0.8 * DT);
        if (f.update(1, { x: rnd(), y: y + rnd(), z: -0.3 + rnd() }, t)) hit = true;
      }
      if (hit) found++;
    }
    expect(found).toBeGreaterThanOrEqual(36);
  });
  it('a tracker repeating samples under a faster frame rate neither hides taps nor makes ghosts', () => {
    const f = new TouchFinder();
    let hits = 0;
    let t = 0;
    let y = 1.0;
    // the tracker updates every other frame
    for (let k = 0; k < 60; k++, t += DT) {
      if (k % 2 === 0) y = Math.max(0.9, y - 0.7 * DT * 2);
      if (f.update(1, { x: 0, y, z: -0.3 }, t)) hits++;
    }
    expect(hits).toBe(1);
  });
});
