import { describe, expect, it } from 'vitest';
import { Object3D, Vector3 } from '@iwsdk/core';
import { HAND_POINTS, PoseBuffer, PoseFlood, SEAT_STAGE, decodePose, encodePose, lerpFrame, newFrame, toSeat, validPose, type PoseMsg } from '../src/net/pose.js';

const hand = (x: number) => Float32Array.from({ length: HAND_POINTS * 3 }, (_, i) => x + i * 0.001);
const HEAD = [0.01, 0.42, 0.4, 0, 0, 0, 1];
const msg = (t: number, x = 0, left = true): PoseMsg => encodePose('ab12', t, [x, 0.42, 0.4, 0, 0, 0, 1], left ? hand(x) : null, hand(-x));
const wire = (m: unknown) => JSON.parse(JSON.stringify(m));

describe('seeing each other: the pose on the wire', () => {
  it('goes out as whole millimetres and comes back to within one', () => {
    const m = wire(encodePose('ab12', 1234.6, HEAD, hand(0.1), null));
    expect(validPose(m)).toBe(true);
    expect(m.h.slice(0, 3)).toEqual([10, 420, 400]);
    expect(m.l).toHaveLength(21);
    expect(m.r).toEqual([]);
    expect(m.t).toBe(1235);
    const f = decodePose(m, newFrame());
    expect(f.leftOn).toBe(true);
    expect(f.rightOn).toBe(false);
    for (let i = 0; i < 21; i++) expect(Math.abs(f.left[i] - hand(0.1)[i])).toBeLessThan(0.0006);
    expect(f.head[6]).toBeCloseTo(1, 4);
    expect(JSON.stringify(m).length).toBeLessThan(260);
  });
  it('a turn and its negative are sent the same way', () => {
    const a = encodePose('x', 0, [0, 0, 0, 0, 0.6, 0, -0.8], null, null);
    expect(a.h.slice(3)).toEqual([0, -6000, 0, 8000]);
  });
  it('holds positions to a seated reach (3 m)', () => {
    const m = encodePose('x', 0, [99, -99, 0, 0, 0, 0, 1], null, null);
    expect(m.h.slice(0, 3)).toEqual([3000, -3000, 0]);
    expect(validPose(m)).toBe(true);
  });
  it('lets nothing else through', () => {
    const ok = wire(msg(100));
    const bad = (f: (m: Record<string, unknown>) => void) => {
      const m = wire(ok);
      f(m);
      return validPose(m);
    };
    expect(validPose(ok)).toBe(true);
    expect(validPose(null)).toBe(false);
    expect(validPose({ k: 'n' })).toBe(false);
    expect(bad((m) => (m.k = 'posee'))).toBe(false);
    expect(bad((m) => (m.p = 'Robert); DROP'))).toBe(false);
    expect(bad((m) => (m.p = 'x'.repeat(13)))).toBe(false);
    expect(bad((m) => (m.t = -1))).toBe(false);
    expect(bad((m) => (m.t = 1.5))).toBe(false);
    expect(bad((m) => ((m.h as number[])[0] = 3001))).toBe(false);
    expect(bad((m) => ((m.h as number[])[1] = 0.5))).toBe(false);
    expect(bad((m) => ((m.h as unknown[])[2] = 'x'))).toBe(false);
    expect(bad((m) => ((m.h as unknown[])[2] = null))).toBe(false); // (NaN and Infinity arrive as null in JSON)
    expect(bad((m) => (m.h = (m.h as number[]).slice(0, 6)))).toBe(false);
    expect(bad((m) => (m.h = [0, 0, 0, 0, 0, 0, 0]))).toBe(false); // no turn at all
    expect(bad((m) => (m.h = [0, 0, 0, 10000, 10000, 0, 0]))).toBe(false); // not a unit turn
    expect(bad((m) => (m.l = (m.l as number[]).slice(1)))).toBe(false);
    expect(bad((m) => (m.l = [...(m.l as number[]), 0]))).toBe(false);
    expect(bad((m) => (m.r = 'lots'))).toBe(false);
    expect(bad((m) => (m.r = new Array(100000).fill(0)))).toBe(false);
    expect(bad((m) => ((m.r as number[])[4] = 1e9))).toBe(false);
    expect(validPose({ ...ok, h: [Number.NaN, 0, 0, 0, 0, 0, 10000] })).toBe(false);
    expect(validPose({ ...ok, h: [Infinity, 0, 0, 0, 0, 0, 10000] })).toBe(false);
  });
});

describe('seeing each other: smoothing', () => {
  it('in between two poses, half way; the turn goes the short way round', () => {
    const a = newFrame();
    const b = newFrame();
    a.head.set([0, 0, 0, 0, 0, 0, 1]);
    // the same turn as a, written as its negative: half way is still no turn
    b.head.set([1, 0, 0, 0, 0, 0, -1]);
    const o = lerpFrame(a, b, 0.5, newFrame());
    expect(o.head[0]).toBeCloseTo(0.5);
    expect(Math.abs(o.head[6])).toBeCloseTo(1);
  });
  it('a hand coming into view appears with the later pose, not dragged in from nowhere', () => {
    const a = decodePose(msg(0, 0, false), newFrame());
    const b = decodePose(msg(50, 0.2, true), newFrame());
    expect(lerpFrame(a, b, 0.3, newFrame()).leftOn).toBe(false);
    const o = lerpFrame(a, b, 0.7, newFrame());
    expect(o.leftOn).toBe(true);
    expect(o.left[0]).toBeCloseTo(0.2, 3);
  });
  it('shows them a tenth of a second behind their latest, between the poses either side', () => {
    const buf = new PoseBuffer(0.1);
    // their clock is 500 s ahead of ours; poses every 50 ms, arriving 20 ms later
    for (let i = 0; i <= 10; i++) buf.push(msg(0, i * 0.01), 500 + i * 0.05, i * 0.05 + 0.02);
    const out = newFrame();
    // now (ours) 0.52: their latest was sent at 0.5 (500.5 theirs); shown: 0.4, the pose with x 0.08
    expect(buf.sample(0.52, out)).toBe(true);
    expect(out.head[0]).toBeCloseTo(0.08, 3);
    // half way between two
    expect(buf.sample(0.545, out)).toBe(true);
    expect(out.head[0]).toBeCloseTo(0.085, 3);
  });
  it('a late arrival does not shift where they are shown; only a quicker one does', () => {
    const buf = new PoseBuffer(0.1);
    buf.push(msg(0, 0), 0, 1.0);
    buf.push(msg(0, 0.05), 0.05, 1.05);
    // this one took 150 ms longer
    buf.push(msg(0, 0.1), 0.1, 1.25);
    const out = newFrame();
    buf.sample(1.25, out);
    // shown at their 0.15 minus a little drift: holds the latest (x 0.1), not 0.0
    expect(out.head[0]).toBeGreaterThan(0.09);
  });
  it('drops a pose older than the last', () => {
    const buf = new PoseBuffer();
    expect(buf.push(msg(0, 0.1), 1, 1)).toBe(true);
    expect(buf.push(msg(0, 0.2), 0.9, 1.01)).toBe(false);
    expect(buf.push(msg(0, 0.2), 1, 1.02)).toBe(false);
  });
  it('holds the latest rather than guessing ahead', () => {
    const buf = new PoseBuffer(0.1);
    buf.push(msg(0, 0), 0, 0);
    buf.push(msg(0, 0.3), 0.05, 0.05);
    const out = newFrame();
    buf.sample(0.5, out);
    expect(out.head[0]).toBeCloseTo(0.3, 3);
  });
  it('a friend gone quiet for over a second goes', () => {
    const buf = new PoseBuffer();
    const out = newFrame();
    expect(buf.sample(0, out)).toBe(false);
    buf.push(msg(0), 10, 10);
    expect(buf.stale(10.9)).toBe(false);
    expect(buf.sample(10.9, out)).toBe(true);
    expect(buf.stale(11.01)).toBe(true);
    expect(buf.sample(11.01, out)).toBe(false);
    buf.clear();
    expect(buf.stale(10)).toBe(true);
  });
  it('the ring keeps the newest eight', () => {
    const buf = new PoseBuffer(0);
    for (let i = 0; i < 30; i++) buf.push(msg(0, i * 0.01), i * 0.05, i * 0.05);
    const out = newFrame();
    // far in the past: the oldest kept is pose 22
    buf.sample(1.45, out);
    expect(out.head[0]).toBeCloseTo(0.29, 3);
  });
});

describe('seeing each other: rate limits', () => {
  it('each friend at most so many a second, and only four followed', () => {
    const f = new PoseFlood(30, 4);
    let ok = 0;
    for (let i = 0; i < 100; i++) if (f.ok('a', i * 0.005)) ok++;
    expect(ok).toBe(30);
    expect(f.ok('b', 0.5)).toBe(true);
    expect(f.ok('a', 1.2)).toBe(true);
    expect(f.ok('c', 0.5)).toBe(true);
    expect(f.ok('d', 0.5)).toBe(true);
    expect(f.ok('e', 0.5)).toBe(false);
    // one gone quiet makes room
    expect(f.ok('e', 8)).toBe(true);
  });
});

describe('seeing each other: their desk at their seat', () => {
  it('turns them round to face you (a turn, not a mirror)', () => {
    const o = toSeat([0, 0, 0]);
    // their head, above and behind their instruments (towards them, +z) is beyond their small instrument from you
    const head = toSeat([0, 0.4, 0.4]);
    expect(head[2]).toBeLessThan(o[2]);
    expect(head[1]).toBeGreaterThan(o[1]);
    // their "in front of me" (−z) comes towards you (+z)
    expect(toSeat([0, 0, -0.3])[2]).toBeGreaterThan(o[2]);
    // their right hand is on your left, as for anyone facing you
    expect(toSeat([0.2, 0, 0])[0]).toBeLessThan(0);
    // at a third of the size
    expect(Math.abs(toSeat([0.2, 0, 0])[0])).toBeCloseTo(0.2 * SEAT_STAGE.scale);
  });
  it('the seat stage the avatar sits in does exactly the same', () => {
    const stage = new Object3D();
    stage.position.set(0, SEAT_STAGE.y, 0);
    stage.rotation.set(SEAT_STAGE.tilt, Math.PI, 0);
    stage.scale.setScalar(SEAT_STAGE.scale);
    stage.updateMatrix();
    for (const p of [
      [0, 0, 0],
      [0.1, 0.2, 0.3],
      [-0.25, 0.05, -0.15],
    ]) {
      const v = new Vector3(p[0], p[1], p[2]).applyMatrix4(stage.matrix);
      const w = toSeat(p);
      expect(v.x).toBeCloseTo(w[0], 6);
      expect(v.y).toBeCloseTo(w[1], 6);
      expect(v.z).toBeCloseTo(w[2], 6);
    }
  });
});
