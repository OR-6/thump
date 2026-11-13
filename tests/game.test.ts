import { describe, expect, it } from 'vitest';
import { Game, type GameStage, type Room } from '../src/play/game.js';
import { freshProgress } from '../src/persistence/progress.js';
import type { RoomInstrument } from '../src/songs/cast.js';

function stage(log: string[]): GameStage {
  return {
    band: () => {},
    light: () => {},
    celebrate: (n) => log.push(`celebrate ${n}`),
    retune: (pc) => log.push(`retune ${pc}`),
    save: () => log.push('save'),
    unlock: (u) => log.push(`unlock ${u}`),
    voice: () => {},
    casting: () => {},
    tempo: () => {},
    missed: () => {},
    bandmate: (e, s) => log.push(`bandmate ${e} ${s}`),
  };
}

function room(list: RoomInstrument[]): Room {
  return { instruments: () => list, zones: (id) => (id === 'keys' ? 5 : (list.find((x) => x.id === id)?.zones ?? 0)) };
}

/** A player who hits every note `late` s after it's due. */
function play(g: Game, t0: number, seconds: number, late = 0.01, stopAt?: (g: Game) => boolean): number {
  const dt = 1 / 72;
  let t = t0;
  for (; t < t0 + seconds; t += dt) {
    g.tick(t);
    if (stopAt?.(g)) break;
    g.dueBetween(t - dt - late, t - late, (key) => g.hit(key, t, 0.8));
  }
  return t;
}

describe('the game', () => {
  it('starts with "Hit anything", and offers a song once two instruments are found', () => {
    const g = new Game(stage([]), freshProgress(), room([]));
    g.start(0);
    expect(g.display.line).toBe('Hit anything');
    g.discovered('kit', 'table', 1);
    expect(g.display.sub).toMatch(/drum kit/);
    expect(g.display.pulse).toBeNull();
    g.discovered('marimba', 'door', 2);
    g.tick(2.1);
    expect(g.display.pulse).toBe('play');
    expect(g.display.found).toEqual(['kit', 'marimba']);
  });

  it('a lone table still gets a song after a while', () => {
    const g = new Game(stage([]), freshProgress(), room([]));
    g.start(0);
    g.discovered('kit', 'table', 1);
    g.tick(20);
    expect(g.display.pulse).toBeNull();
    g.tick(27);
    expect(g.display.pulse).toBe('play');
  });

  it('PLAY casts the song onto the room, a good player gets 3 stars and the tom, and the next song unlocks', () => {
    const log: string[] = [];
    const p = freshProgress();
    const g = new Game(stage(log), p, room([{ id: 'p1', family: 'marimba', zones: 8 }]));
    g.start(0);
    g.discovered('kit', 'table', 0);
    g.discovered('marimba', 'door', 0);
    g.tick(0.1);
    g.key('play');
    expect(g.mode).toBe('count');
    expect(g.cast.melody?.surface).toBe('p1');
    play(g, 0.2, 120, 0.01, (x) => x.mode === 'results');
    expect(g.mode).toBe('results');
    expect(g.last?.stars).toBe(3);
    expect(p.stars['porch-step']).toBe(3);
    expect(p.unlocks).toContain('tom');
    expect(log).toContain('unlock tom');
    expect(g.available()).toBe(3); // Kitchen Clock, and today's song
    expect(g.selected).toBe(1);
    // back to free play after the results
    g.tick(200);
    expect(g.mode).toBe('discover');
  });

  it('a song with no hits ends with one star, never a failure', () => {
    const g = new Game(stage([]), freshProgress(), room([]));
    g.start(0);
    g.begin(0);
    for (let t = 0; t < 120 && g.mode !== 'results'; t += 1 / 72) g.tick(t);
    expect(g.mode).toBe('results');
    expect(g.last?.stars).toBe(1);
  });

  it('◀ ▶ choose among unlocked songs (and today\'s); PLAY twice during a song stops it, once does not', () => {
    const p = freshProgress();
    p.stars['porch-step'] = 2;
    const g = new Game(stage([]), p, room([]));
    g.start(0);
    expect(g.available()).toBe(3);
    g.tick(1);
    g.key('next');
    g.tick(3);
    g.key('next');
    expect(g.selected).toBe(2);
    g.begin(0);
    g.tick(4);
    g.key('play');
    expect(g.mode).toBe('count');
    g.tick(4.3);
    g.key('play');
    expect(g.mode).toBe('discover');
  });

  it('tap ◀ twice: slow mode, saved', () => {
    let saved = 0;
    const st = { ...stage([]), tempo: (t: number) => (saved = t) };
    const g = new Game(st, freshProgress(), room([]));
    g.start(0);
    g.tick(1);
    g.key('prev');
    g.tick(1.3);
    g.key('prev');
    expect(g.opts.tempo).toBe(0.75);
    expect(saved).toBe(0.75);
  });

  it('learns a steady lateness', () => {
    const g = new Game(stage([]), freshProgress(), room([]));
    g.start(0);
    g.begin(0);
    play(g, 0, 120, 0.08, (x) => x.mode === 'results');
    expect(g.opts.offset).toBeGreaterThan(0.03);
  });

  it('a pause mid-song: the song waits two beats', () => {
    const g = new Game(stage([]), freshProgress(), room([]));
    g.start(0);
    g.begin(0);
    g.tick(5);
    const before = g.clock.start;
    g.resumed(5);
    expect(g.clock.start - before).toBeCloseTo(2 * g.clock.spb);
  });

  it('JAM: the bandmate claims your most melodic instrument, calls, you answer, it adapts and remembers', () => {
    const log: string[] = [];
    const p = freshProgress();
    p.unlocks.push('jam');
    const g = new Game(stage(log), p, room([{ id: 'p2', family: 'gong', zones: 1 }, { id: 'p1', family: 'marimba', zones: 8 }]));
    g.start(0);
    g.key('jam');
    expect(g.mode).toBe('jam');
    expect(g.jamSurface).toBe('p1');
    expect(log).toContain('bandmate claim p1');
    play(g, 0, 200, 0.01, (x) => x.mode !== 'jam');
    expect(g.jamShares.length).toBe(8);
    expect(g.jamShares.every((x) => x === 1)).toBe(true);
    expect(g.mode).toBe('discover');
    expect(p.bandLevel).toBe(3);
  });

  it('JAM with nobody answering: it goes simpler, and never errors', () => {
    const p = freshProgress();
    p.unlocks.push('jam');
    p.bandLevel = 2;
    const g = new Game(stage([]), p, room([]));
    g.start(0);
    g.key('jam');
    expect(g.jamSurface).toBe('keys');
    for (let t = 0; t < 40; t += 1 / 72) g.tick(t);
    expect(g.mate!.level).toBeLessThan(2);
  });
});
