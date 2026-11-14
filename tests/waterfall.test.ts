import { describe, expect, it } from 'vitest';
import { ARC_BACK, ARC_UP, FALL_PER_BEAT, NoteMemo, SHOW_BEATS, SLIDE_PER_BEAT, SparkPool, StreakLook, formOf, notePath, pathOf, streakLevel, type PathPoint } from '../src/room/waterfall-fx.js';

const pt = (): PathPoint => ({ up: 0, along: 0, du: 0, da: 0 });

describe('the note path', () => {
  it('falls straight down onto its target, landing on the beat', () => {
    const p = notePath('fall', 2, pt());
    expect(p.up).toBeCloseTo(2 * FALL_PER_BEAT);
    expect(p.along).toBe(0);
    expect([p.du, p.da]).toEqual([-1, 0]);
    expect(notePath('fall', 0, pt()).up).toBe(0);
    // (past due, it waits on the target)
    expect(notePath('fall', -0.3, pt()).up).toBe(0);
  });

  it('arcs onto a field or bar: from the back and up, down onto it, steepest as it lands', () => {
    const start = notePath('arc', SHOW_BEATS, pt());
    expect(start.up).toBeCloseTo(ARC_UP);
    expect(start.along).toBeCloseTo(ARC_BACK);
    // at its top it's moving forward, not down
    expect(start.du).toBeCloseTo(0);
    expect(start.da).toBeCloseTo(-1);
    const land = notePath('arc', 0, pt());
    expect(land.up).toBe(0);
    expect(land.along).toBe(0);
    expect(land.du).toBeLessThan(-0.8);
    // always above the target on the way, and coming nearer
    let last = Infinity;
    for (let a = SHOW_BEATS; a >= 0; a -= 0.25) {
      const p = notePath('arc', a, pt());
      expect(p.up).toBeGreaterThanOrEqual(0);
      expect(p.along).toBeLessThanOrEqual(last + 1e-9);
      expect(Math.hypot(p.du, p.da)).toBeCloseTo(1);
      last = p.along;
    }
  });

  it('slides along the neck to its fret, just above the board', () => {
    const p = notePath('slide', 2, pt());
    expect(p.along).toBeCloseTo(2 * SLIDE_PER_BEAT);
    expect(p.up).toBeGreaterThan(0);
    expect(p.up).toBeLessThan(0.02);
    expect(notePath('slide', 0, pt()).along).toBe(0);
  });
});

describe('note forms', () => {
  it('each instrument has its form', () => {
    expect(formOf('kit:snare', true)).toBe('ring');
    expect(formOf('kit:kick', true)).toBe('ring');
    expect(formOf('kit:hat', true)).toBe('ring');
    expect(formOf('kit:gong', true)).toBe('ring');
    expect(formOf('piano:4', false)).toBe('fall');
    expect(formOf('keys:2', false)).toBe('fall');
    expect(formOf('handpan:3', true)).toBe('ring');
    expect(formOf('marimba:7', false)).toBe('fall');
    expect(formOf('guitar:0', false)).toBe('ring');
    expect(formOf('guitar:2', false)).toBe('ring');
    expect(formOf('guitar:9', false)).toBe('strum');
    expect(formOf('guitar:5', false)).toBe('fall');
    expect(formOf('congas:1', true)).toBe('ring');
    expect(formOf('s3:1', false)).toBe('fall');
    expect(pathOf('arc')).toBe('arc');
    expect(pathOf('neck')).toBe('slide');
    expect(pathOf('disc')).toBe('fall');
  });
});

describe('the streak look', () => {
  it('has a level at ×10, ×25 and ×50', () => {
    expect([0, 9, 10, 24, 25, 49, 50, 200].map(streakLevel)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });

  it('warms up quickly and cools back over one bar when the run breaks', () => {
    const s = new StreakLook();
    for (let i = 0; i < 90; i++) s.step(60, 1 / 72, 2);
    expect(s.heat).toBe(3);
    expect(s.trail).toBe(1);
    expect(s.gold).toBe(1);
    expect(s.halo).toBeCloseTo(1.6);
    // the run breaks: half a bar later it's partly cooled, after one bar it's cold
    for (let i = 0; i < 72; i++) s.step(0, 1 / 72, 2);
    expect(s.heat).toBeGreaterThan(0.5);
    expect(s.heat).toBeLessThan(2.5);
    for (let i = 0; i < 80; i++) s.step(0, 1 / 72, 2);
    expect(s.heat).toBe(0);
    expect(s.halo).toBe(1);
  });
});

describe('the spark pool', () => {
  it('is fixed: the oldest makes way when it is full', () => {
    const p = new SparkPool(8);
    for (let i = 0; i < 8; i++) {
      p.spawn(i, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0.002, 0);
      p.step(0.01, 0, 1, 0);
    }
    expect(p.alive).toBe(8);
    const i = p.spawn(99, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0.002, 0);
    // the first one spawned (the oldest) was replaced
    expect(i).toBe(0);
    expect(p.p[0]).toBe(99);
    expect(p.alive).toBe(8);
  });

  it('reuses a dead slot before taking a live one', () => {
    const p = new SparkPool(4);
    for (let i = 0; i < 4; i++) p.spawn(0, 0, 0, 0, 0, 0, 1, 1, 1, i === 2 ? 0.05 : 5, 0.002, 0);
    p.step(0.1, 0, 1, 0);
    expect(p.alive).toBe(3);
    expect(p.spawn(0, 0, 0, 0, 0, 0, 1, 1, 1, 5, 0.002, 0)).toBe(2);
  });

  it('lands on its floor, skids, and falls off past the edge', () => {
    const p = new SparkPool(2);
    // up and forward over a 5 cm floor
    p.spawn(0, 0, 0, 0, 0.3, 0.15, 1, 1, 1, 3, 0.002, 0.05);
    let minY = 0;
    let onFloor = false;
    for (let i = 0; i < 300; i++) {
      p.step(1 / 100, 0, 1, 0);
      const z = p.p[2];
      const y = p.p[1];
      if (z < 0.05) {
        expect(y).toBeGreaterThanOrEqual(-1e-6);
        if (i > 20 && Math.abs(y) < 1e-6) onFloor = true;
      }
      minY = Math.min(minY, y);
    }
    expect(onFloor).toBe(true);
    // it went over the edge and fell below the floor
    expect(minY).toBeLessThan(-0.01);
  });
});

describe('the note memory', () => {
  it('lets a note burst once', () => {
    const m = new NoteMemo(4);
    expect(m.mark('piano:3', 12)).toBe(true);
    expect(m.mark('piano:3', 12.01)).toBe(false);
    expect(m.mark('piano:3', 13)).toBe(true);
    expect(m.mark('piano:4', 12)).toBe(true);
    for (let b = 20; b < 24; b++) m.mark('x', b);
    // (only the last few are kept)
    expect(m.has('piano:3', 12)).toBe(false);
    m.clear();
    expect(m.has('x', 23)).toBe(false);
  });
});
