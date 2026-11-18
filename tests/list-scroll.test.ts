import { describe, expect, it } from 'vitest';
import { ListScroll } from '../src/ui/list-scroll.js';

const run = (s: ListScroll, secs: number) => {
  for (let t = 0; t < secs; t += 1 / 72) s.update(1 / 72);
};

describe('the song list scrolls under a finger', () => {
  it('a drag moves it one for one; a small one is a tap', () => {
    const s = new ListScroll();
    s.setMax(900);
    s.grab(0, 500);
    s.drag(0, 480, 1 / 72);
    expect(s.release(0)).toBe(false);
    expect(s.offset).toBe(20);
    s.grab(0, 500);
    for (let k = 1; k <= 20; k++) s.drag(0, 500 - k * 10, 0.2);
    expect(s.offset).toBe(220);
    expect(s.release(0)).toBe(true);
    // (a slow drag stops where it was left)
    run(s, 1);
    expect(s.offset).toBe(220);
  });

  it('a flick carries on and slows; past an end it settles back', () => {
    const s = new ListScroll();
    s.setMax(900);
    s.grab(1, 600);
    for (let k = 1; k <= 6; k++) s.drag(1, 600 - k * 30, 1 / 72);
    const at = s.offset;
    s.release(1);
    run(s, 0.3);
    expect(s.offset).toBeGreaterThan(at + 100);
    run(s, 3);
    expect(s.offset).toBeLessThanOrEqual(900);
    // pulled down past the top: it gives a little, then comes back to 0
    s.reset();
    s.grab(0, 300);
    s.drag(0, 600, 0.5);
    expect(s.offset).toBeLessThan(0);
    expect(s.offset).toBeGreaterThanOrEqual(-80);
    s.release(0);
    run(s, 1);
    expect(s.offset).toBe(0);
  });

  it('keeps a row in view: at once for a new list, eased for a new choice', () => {
    const s = new ListScroll();
    s.setMax(1000);
    s.show(800, 880, 480, true);
    expect(s.offset).toBe(400);
    s.show(80, 160, 480);
    run(s, 1);
    expect(s.offset).toBe(80);
    // (already in view: it stays)
    s.show(200, 280, 480);
    run(s, 1);
    expect(s.offset).toBe(80);
  });
});
