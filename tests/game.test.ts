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
    setting: () => false,
    bandmate: (e, s) => log.push(`bandmate ${e} ${s}`),
  };
}

function room(list: RoomInstrument[]): Room {
  const n = (id: string) => (id === 'keys' ? 5 : (list.find((x) => x.id === id)?.zones ?? 0));
  // zones start at scale degree 2 (as a real register would), so degree ≠ zone index
  const D0 = 2;
  return {
    instruments: () => list,
    zones: n,
    zoneFor: (id, d) => (n(id) <= 1 || d < 0 ? 0 : (((d - D0) % n(id)) + n(id)) % n(id)),
    degreeOf: (id, z) => (n(id) <= 1 ? -1 : z + D0),
  };
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

  it('tap ◀ twice: the settings page; ◀ there switches slow mode (saved); ▶ closes it', () => {
    let saved = 0;
    const flips: string[] = [];
    const st = { ...stage([]), tempo: (t: number) => (saved = t), setting: (n: 'oneHand' | 'contrast' | 'words', f: boolean) => (f && flips.push(n), false) };
    const g = new Game(st, freshProgress(), room([]));
    g.start(0);
    g.tick(1);
    g.key('prev');
    g.tick(1.3);
    g.key('prev');
    expect(g.settingsOpen).toBe(true);
    expect(g.display.keyLabels?.length).toBe(5);
    g.key('prev');
    expect(g.opts.tempo).toBe(0.75);
    expect(saved).toBe(0.75);
    g.key('jam');
    expect(flips).toEqual(['contrast']);
    g.key('play');
    expect(g.settingsOpen).toBe(false);
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

  it('REC: locked until Night Bus; then records what you play anywhere and plays it back', () => {
    const voiced: string[] = [];
    const st = { ...stage([]), voice: (key: string) => voiced.push(key) };
    const p = freshProgress();
    const g = new Game(st, p, room([{ id: 'p1', family: 'marimba', zones: 8 }]));
    g.start(0);
    g.tick(1);
    g.key('loop');
    expect(g.display.sub).toMatch(/Night Bus/);
    p.unlocks.push('loops');
    g.tick(5);
    g.key('loop');
    expect(g.looper.state).toBe('count');
    const t0 = g.loopClock.timeAt(g.looper.recStart);
    for (let t = 5; t < t0; t += 1 / 72) g.tick(t);
    g.hit('kit:kick', t0 + 0.01, 0.9);
    g.hit('p1:2', t0 + g.loopClock.spb * 2, 0.8);
    for (let t = t0; t < t0 + 16 * g.loopClock.spb + 3; t += 1 / 72) g.tick(t);
    expect(g.looper.state).toBe('play');
    expect(voiced).toContain('kit:kick');
    expect(voiced).toContain('p1:2');
    g.begin(0);
    expect(g.looper.state).toBe('off');
  });

  it('JAM: calls start on their downbeat, and the echo plays back the notes you played', () => {
    const calls: { key: string; at: number }[] = [];
    const st = { ...stage([]), voice: (key: string, at: number) => calls.push({ key, at }) };
    const p = freshProgress();
    p.unlocks.push('jam');
    const g = new Game(st, p, room([{ id: 'p1', family: 'marimba', zones: 8 }]));
    g.start(0);
    g.key('jam');
    const dt = 1 / 72;
    let answeredWith: { key: string; t: number }[] = [];
    for (let t = 0; t < 60 && g.mode === 'jam'; t += dt) {
      g.tick(t);
      // answer every call with the same zones, a little late
      g.dueBetween(t - dt - 0.02, t - 0.02, (key) => {
        g.hit(key, t, 0.8);
        answeredWith.push({ key, t });
      });
    }
    // every call's first note sits exactly on its cycle's downbeat
    const spb = g.clock.spb;
    for (let c = 0; c < 3; c++) {
      const want = g.clock.timeAt(c * 16);
      expect(calls.some((x) => Math.abs(x.at - want) < 1e-6)).toBe(true);
    }
    // the third call is your own answer played back: the same zones
    const third = calls.filter((x) => x.at >= g.clock.timeAt(32) - 1e-6 && x.at < g.clock.timeAt(40)).map((x) => x.key);
    const secondAnswer = answeredWith.filter((a) => a.t >= g.clock.timeAt(24) - 0.2 && a.t < g.clock.timeAt(32)).map((a) => a.key);
    expect(third.length).toBeGreaterThanOrEqual(3);
    expect(new Set(third)).toEqual(new Set(secondAnswer));
    void spb;
    answeredWith = [];
  });

  it('◀◀ opens settings without moving the song choice; the count-in counts 4 3 2 1', () => {
    const p = freshProgress();
    p.stars['porch-step'] = 2;
    p.stars['kitchen-clock'] = 2;
    const g = new Game(stage([]), p, room([]));
    g.start(0);
    g.selected = 1;
    g.tick(1);
    g.key('prev');
    g.tick(1.2);
    g.key('prev');
    expect(g.settingsOpen).toBe(true);
    expect(g.selected).toBe(1);
    g.key('play');
    g.begin(0);
    const seen = new Set<number>();
    for (let t = 1.3; g.mode === 'count'; t += 1 / 72) {
      g.tick(t);
      if (g.display.count) seen.add(g.display.count);
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4]);
  });
});
