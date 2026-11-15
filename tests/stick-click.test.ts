import { describe, expect, it } from 'vitest';
import { ClapWatch, StickClick, segDist } from '../src/input/stick-click.js';

const DT = 1 / 72;

describe('segDist', () => {
  it('crossing sticks: the gap between them', () => {
    expect(segDist(-0.2, 0, 0, 0.2, 0, 0, 0, 0.03, -0.2, 0, 0.03, 0.2)).toBeCloseTo(0.03, 5);
  });
  it('parallel, side by side', () => {
    expect(segDist(0, 0, 0, 0.4, 0, 0, 0, 0.05, 0, 0.4, 0.05, 0)).toBeCloseTo(0.05, 5);
  });
  it('end to end, apart: tip to tip', () => {
    expect(segDist(0, 0, 0, 0.4, 0, 0, 0.5, 0, 0, 0.9, 0, 0)).toBeCloseTo(0.1, 5);
  });
});

describe('two sticks knocked together', () => {
  /** Two crossing sticks, the gap closing at `v` m/s from 15 cm to `stop` (then apart again). */
  function knock(v: number, stop: number, frames = 60): number {
    const c = new StickClick();
    let n = 0;
    let gap = 0.15;
    let dir = -1;
    for (let k = 0; k < frames; k++) {
      gap += dir * v * DT;
      if (gap <= stop) {
        gap = stop;
        dir = 1;
      }
      const d = segDist(-0.2, 0, 0, 0.2, 0, 0, 0, gap, -0.2, 0, gap, 0.2);
      if (c.update(d, DT)) n++;
    }
    return n;
  }
  it('a click: once', () => expect(knock(1.2, 0.012)).toBe(1));
  it('a light click still clicks', () => expect(knock(0.5, 0.015)).toBe(1));
  it('sticks brought together slowly, or resting crossed, do not', () => expect(knock(0.15, 0.012)).toBe(0));
  it('passing near without touching does not', () => expect(knock(1.2, 0.035)).toBe(0));
  it('two clicks: twice', () => {
    const c = new StickClick();
    let n = 0;
    const seq = [0.1, 0.07, 0.04, 0.015, 0.06, 0.09, 0.06, 0.03, 0.012];
    for (const d of seq) if (c.update(d, DT)) n++;
    expect(n).toBe(2);
  });
});

describe('a clap', () => {
  it('palms meeting: once', () => {
    const w = new ClapWatch();
    let n = 0;
    for (const d of [0.3, 0.25, 0.2, 0.15, 0.1, 0.06, 0.04, 0.04, 0.08, 0.15]) if (w.update(d, DT)) n++;
    expect(n).toBe(1);
  });
  it('lost by the tracking at contact, closing fast: still a clap', () => {
    const w = new ClapWatch();
    let n = 0;
    for (const d of [0.3, 0.26, 0.22, 0.18, 0.13, Infinity, Infinity]) if (w.update(d, DT)) n++;
    expect(n).toBe(1);
  });
  it('a hand lost while far apart, or moving slowly: nothing', () => {
    const w = new ClapWatch();
    let n = 0;
    for (const d of [0.3, 0.29, 0.28, Infinity, 0.2, 0.195, 0.19, Infinity]) if (w.update(d, DT)) n++;
    expect(n).toBe(0);
  });
  it('hands held together: once, not again until apart', () => {
    const w = new ClapWatch();
    let n = 0;
    for (const d of [0.2, 0.12, 0.05, 0.04, 0.045, 0.04, 0.05, 0.04]) if (w.update(d, DT)) n++;
    expect(n).toBe(1);
  });
});
