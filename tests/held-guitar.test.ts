import { describe, expect, it } from 'vitest';
import { Matrix4, Vector3 } from '@iwsdk/core';
import { GuitarHands, HG, HOLD, OPEN, bodyHalfW, fretAt, fretX, heldMatrix, stringZ, stringsOf, zoneOfFret, zoneX, type Pluck } from '../src/kit/held-guitar';

const M = heldMatrix(new Matrix4());
const kit = (x: number, y: number, z: number) => new Vector3(x, y, z).applyMatrix4(M);

describe('the held guitar', () => {
  it('rests just over the desk, its neck out to your left and up, its top toward you', () => {
    let minY = Infinity;
    for (let x = HG.join; x <= HG.tail; x += 0.01) for (const z of [-bodyHalfW(x), bodyHalfW(x)]) for (const y of [0, -HG.depth]) minY = Math.min(minY, kit(x, y, z).y);
    expect(minY).toBeCloseTo(HOLD.clear, 3);
    const nut = kit(HG.nut, HG.strings, 0);
    const hole = kit(0, HG.strings, 0);
    expect(nut.x).toBeLessThan(hole.x - 0.35);
    expect(nut.y).toBeGreaterThan(hole.y + 0.1);
    // its strings face you (and up): the top's normal points to +z and +y in the kit
    const n = new Vector3(0, 1, 0).transformDirection(M);
    expect(n.z).toBeGreaterThan(0.6);
    expect(n.y).toBeGreaterThan(0.3);
    // the low E is the string nearest the ceiling
    expect(kit(0, HG.strings, stringZ(0, 0)).y).toBeGreaterThan(kit(0, HG.strings, stringZ(5, 0)).y);
    // and everything a hand plays is in a seated reach (within 65 cm of the chest, above the desk)
    for (const p of [nut, hole]) {
      expect(Math.hypot(p.x, p.y - 0.15, p.z - 0.36)).toBeLessThan(0.65);
      expect(p.y).toBeGreaterThan(0.05);
    }
  });

  it('has frets where a real one does', () => {
    expect(fretX(12) - HG.nut).toBeCloseTo(HG.scale / 2, 5);
    expect(fretAt(HG.nut + 0.01)).toBe(1);
    expect(fretAt((fretX(4) + fretX(5)) / 2)).toBe(5);
    expect([1, 3, 4, 6, 7, 12].map(zoneOfFret)).toEqual([0, 0, 1, 1, 2, 2]);
    expect(zoneX(0)).toBeLessThan(zoneX(1));
  });
});

/** A fingertip swept across the strings over the soundhole, from z0 to z1 in n frames. */
function sweep(g: GuitarHands, z0: number, z1: number, n = 6, y = HG.strings, x = 0.03, t0 = 0, side: 0 | 1 = 1): Pluck[] {
  const out: Pluck[] = [];
  const dt = 1 / 72;
  for (let k = 0; k <= n; k++) g.strum(side, [new Vector3(x, y, z0 + ((z1 - z0) * k) / n), null, null, null], t0 + k * dt, dt, out);
  return out;
}

describe('strumming', () => {
  it('a sweep down sounds all six, low to high, fanned in time', () => {
    const p = sweep(new GuitarHands(), -0.04, 0.04);
    expect(p.map((x) => x.string)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(p.every((x) => x.dir === 1)).toBe(true);
    for (let i = 1; i < p.length; i++) expect(p[i].t).toBeGreaterThanOrEqual(p[i - 1].t);
  });
  it('a sweep up sounds them high to low, as an up-strum', () => {
    const p = sweep(new GuitarHands(), 0.04, -0.04);
    expect(p.map((x) => x.string)).toEqual([5, 4, 3, 2, 1, 0]);
    expect(p.every((x) => x.dir === -1)).toBe(true);
  });
  it('a finger crossing one string picks just it', () => {
    const z = stringZ(3, 0.03);
    const p = sweep(new GuitarHands(), z - 0.004, z + 0.004, 2);
    expect(p.map((x) => x.string)).toEqual([3]);
  });
  it('a hand passing well clear of the strings, or creeping, or jumping, plays nothing', () => {
    expect(sweep(new GuitarHands(), -0.04, 0.04, 6, HG.strings + 0.05)).toHaveLength(0);
    expect(sweep(new GuitarHands(), -0.04, 0.04, 200)).toHaveLength(0);
    expect(sweep(new GuitarHands(), -0.04, 0.04, 6, HG.strings, -0.3)).toHaveLength(0);
    const g = new GuitarHands();
    const out: Pluck[] = [];
    g.strum(1, [new Vector3(0.03, HG.strings, -0.2), null, null, null], 0, 1 / 72, out);
    g.strum(1, [new Vector3(0.03, HG.strings, 0.2), null, null, null], 1 / 72, 1 / 72, out);
    expect(out).toHaveLength(0);
  });
  it('a harder strum is louder', () => {
    const soft = sweep(new GuitarHands(), -0.04, 0.04, 20);
    const hard = sweep(new GuitarHands(), -0.04, 0.04, 3);
    expect(hard[0].vel).toBeGreaterThan(soft[0].vel);
  });
});

describe('fretting', () => {
  const on = (fret: number, string: number) => {
    const x = (fretX(fret - 1) + fretX(fret)) / 2;
    return new Vector3(x, HG.board + 0.003, stringZ(string, x));
  };
  it('a hand on the neck picks the chord place it is on, after settling', () => {
    const g = new GuitarHands();
    expect(g.fret([on(2, 1)], 0)).toBe(0);
    expect(g.fret([on(5, 1)], 0.01)).toBe(-1);
    expect(g.fret([on(5, 1)], 0.06)).toBe(1);
    expect(g.zone).toBe(1);
    // (lifting off keeps the chord)
    expect(g.fret([null], 0.1)).toBe(-1);
    expect(g.zone).toBe(1);
  });
  it('with real frets, each fingertip stops its own string', () => {
    const g = new GuitarHands();
    // an E minor shape: the A and D strings at the second fret
    g.fret([on(2, 1), on(2, 2), null, null], 0);
    expect(g.realNotes([])).toEqual([OPEN[0], OPEN[1] + 2, OPEN[2] + 2, OPEN[3], OPEN[4], OPEN[5]]);
  });
  it('an assisted chord leaves a five-note voicing\'s low string silent', () => {
    expect(stringsOf([48, 55, 60, 64, 67])).toEqual([null, 48, 55, 60, 64, 67]);
  });
});
