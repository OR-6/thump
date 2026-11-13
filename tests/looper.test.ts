import { describe, expect, it } from 'vitest';
import { Looper } from '../src/play/looper.js';

function run(l: Looper, from: number, to: number, out: [string, number][]) {
  for (let b = from; b < to; b += 0.05) l.tick(b, b + 0.2, (k, at) => out.push([k, Math.round(at * 100) / 100]));
}

describe('loops', () => {
  it('counts a bar in, records four bars quantised to sixteenths, then plays them back round and round', () => {
    const l = new Looper();
    l.rec(0);
    expect(l.state).toBe('count');
    expect(l.recStart).toBe(4);
    const out: [string, number][] = [];
    run(l, 0, 4, out);
    l.hear(4.02, 'kit:kick', 0.9);
    l.hear(5.97, 'p1:3', 0.7);
    l.hear(7.5, 'kit:snare', 0.8);
    run(l, 4, 20, out);
    expect(l.state).toBe('play');
    expect(l.layers[0].map((h) => h.beat)).toEqual([0, 2, 3.5]);
    run(l, 20, 36, out);
    const kicks = out.filter(([k]) => k === 'kit:kick').map(([, at]) => at);
    expect(kicks).toEqual([20, 36]);
    expect(out.filter(([k]) => k === 'p1:3').map(([, at]) => at)).toEqual([22]);
  });

  it('layers on the next loop boundary, at most three, and clears', () => {
    const l = new Looper();
    l.rec(0);
    run(l, 0, 4, []);
    l.hear(4, 'kit:kick', 1);
    run(l, 4, 21, []);
    l.rec(21);
    expect(l.recStart).toBe(36);
    l.hear(36.5, 'kit:hat', 1);
    run(l, 21, 53, []);
    expect(l.layers.length).toBe(2);
    l.clear();
    expect(l.state).toBe('off');
    expect(l.layers.length).toBe(0);
  });

  it('an empty take records nothing and stops', () => {
    const l = new Looper();
    l.rec(0);
    run(l, 0, 21, []);
    expect(l.state).toBe('off');
  });

  it('keeps three layers at most (the oldest goes only when a new one lands)', () => {
    const l = new Looper();
    l.rec(0);
    run(l, 0, 4, []);
    l.hear(4, 'a', 1);
    run(l, 4, 21, []);
    for (const [k, start] of [['b', 36], ['c', 52], ['d', 68]] as const) {
      l.rec(start - 15);
      l.hear(start, k, 1);
      run(l, start - 15, start + 17, []);
    }
    expect(l.layers.map((x) => x[0].key)).toEqual(['b', 'c', 'd']);
    // an empty take doesn't push anything out
    l.rec(85);
    run(l, 85, 118, []);
    expect(l.layers.length).toBe(3);
  });
});
