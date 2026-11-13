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
    tune: () => ({ line: 'Speed', sub: '', labels: [] }),
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
  it('starts with "Hit something", and offers to build a track once two things are found', () => {
    const g = new Game(stage([]), freshProgress(), room([]));
    g.start(0);
    expect(g.display.line).toBe('Tap the desk');
    g.discovered('kit', 'table', 1);
    expect(g.display.pulse).toBeNull();
    g.discovered('marimba', 'door', 2);
    g.tick(2.1);
    expect(g.display.pulse).toBe('play');
    expect(g.display.line).toBe('Play a song?');
    expect(g.display.found).toEqual(['kit', 'marimba']);
  });

  it('a lone desk still gets a track after a while', () => {
    const g = new Game(stage([]), freshProgress(), room([]));
    g.start(0);
    g.discovered('kit', 'table', 1);
    g.tick(30);
    expect(g.display.pulse).toBeNull();
    g.tick(42);
    expect(g.display.pulse).toBe('play');
  });

  it('perform: on the machine you built, the kit parts on your things, fills, hold it, stars and Tight %', () => {
    const voiced: string[] = [];
    const st = { ...stage([]), voice: (key: string) => voiced.push(key) };
    const p = freshProgress();
    const g = new Game(st, p, room([{ id: 't1', family: 'bell', zones: 1 }]));
    g.start(0);
    g.discovered('kit', 'table', 0);
    g.tick(45);
    g.beginBuild(0);
    let t = 45.1;
    for (const key of ['kit:kick', 'kit:snare', 't1:0', 'keys:0', 'keys:2', 'kit:tom']) {
      g.tick(t);
      g.hit(key, t, 0.8);
      for (let k = 0; k < 600 && g.buildAsks() === null && !g.buildRunning(); k++) {
        t += 1 / 30;
        g.tick(t);
        g.dueBetween(t - 1 / 30, t, (kk) => g.hit(kk, t, 0.8));
      }
    }
    expect(g.buildRunning()).toBe(true);
    // ▶: perform
    g.key('play');
    expect(g.mode).toBe('count');
    expect(g.display.sub).toBe('Hit what lights up');
    let sawFill = false;
    let sawHold = false;
    const before = voiced.length;
    for (let k = 0; k < 4000 && g.mode !== 'results'; k++) {
      t += 1 / 30;
      g.tick(t);
      g.dueBetween(t - 1 / 30, t, (kk) => g.hit(kk, t + 0.004, 0.8));
      if (g.display.line === 'Go wild!') sawFill = true;
      if (g.display.line === 'Keep it going') sawHold = true;
    }
    expect(g.mode).toBe('results');
    expect(sawFill && sawHold).toBe(true);
    expect(g.last?.stars).toBe(3);
    // (hits land up to a 30 fps frame after the note here, so not 100)
    expect(g.lastTight).toBeGreaterThan(60);
    // the score first and it stays: notes played, then how it sat in time
    g.tick((t += 1.6));
    expect(g.display.line).toMatch(/^\d+ of \d+ notes$/);
    expect(g.display.sub).toMatch(/On time \d+%|ahead|behind|Loose/);
    expect(g.display.stars).toBe(3);
    // the machine played under it: the parts you don't play live (perc, keys, bass), never the ones you do
    expect(voiced.slice(before).some((k) => k.startsWith('keys:'))).toBe(true);
    expect(voiced.slice(before).some((k) => k === 'kit:kick' || k.startsWith('t1:'))).toBe(false);
    expect(p.unlocks).toContain('jam');
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

  it('the gear: the settings page; ◀ there switches slow mode (saved); ▶ closes it', () => {
    let saved = 0;
    const flips: string[] = [];
    const st = { ...stage([]), tempo: (t: number) => (saved = t), setting: (n: 'oneHand' | 'contrast' | 'words', f: boolean) => (f && flips.push(n), false) };
    const g = new Game(st, freshProgress(), room([]));
    g.start(0);
    g.tick(1);
    g.openSettings();
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

  it('with ?debug=1, in Settings, tap ◀ twice: the tuning page (slow mode unchanged); its keys go to the stage; ▶ closes it', () => {
    const keys: (string | null)[] = [];
    const st = { ...stage([]), tune: (k: string | null) => (keys.push(k), { line: 'Speed 0.35 m/s', sub: 'x', labels: ['◀', 'Done', '▶', '−', '+'] }) };
    const g = new Game(st as never, freshProgress(), room([]), { tempo: 1, offset: 0, debug: true });
    g.start(0);
    g.tick(1);
    g.openSettings();
    expect(g.settingsOpen).toBe(true);
    g.tick(3);
    g.key('prev');
    g.tick(3.3);
    g.key('prev');
    expect(g.tuneOpen).toBe(true);
    expect(g.settingsOpen).toBe(false);
    expect(g.opts.tempo).toBe(1);
    expect(g.display.line).toBe('Speed 0.35 m/s');
    g.key('loop');
    g.key('next');
    expect(keys).toContain('loop');
    expect(keys).toContain('next');
    g.key('play');
    expect(g.tuneOpen).toBe(false);
  });

  it('a song finished before its unlock existed still grants it (swaps after Porch Step)', () => {
    const p = freshProgress();
    p.introDone = true;
    p.stars['porch-step'] = 3;
    p.unlocks = ['tom', 'jam'];
    new Game(stage([]), p, room([]));
    expect(p.unlocks).toContain('swaps');
  });

  it('the encore: after a good song your last four bars play back on what you hit; a hit stops it', () => {
    const voiced: { key: string; at: number }[] = [];
    const st = { ...stage([]), voice: (key: string, at: number) => voiced.push({ key, at }) };
    const g = new Game(st, freshProgress(), room([]));
    g.start(0);
    g.begin(0);
    const t = play(g, 0, 120, 0.01, (x) => x.mode === 'results');
    expect(g.last?.stars).toBe(3);
    const before = voiced.length;
    for (let k = 1; k <= 60; k++) g.tick(t + k * 0.1);
    const encore = voiced.slice(before);
    expect(encore.length).toBeGreaterThan(4);
    expect(encore.every((v) => v.at >= t + 2.3)).toBe(true);
    expect(encore.some((v) => v.key.startsWith('kit:'))).toBe(true);
  });

  it('build: ▶ asks for a thing per part; hit one, play two bars along, it loops; six parts and the desk plays it', () => {
    const voiced: string[] = [];
    const st = { ...stage([]), voice: (key: string) => voiced.push(key) };
    const p = freshProgress();
    const g = new Game(st, p, room([{ id: 't1', family: 'bell', zones: 1 }]));
    g.start(0);
    g.discovered('kit', 'table', 0);
    g.tick(45);
    expect(g.display.line).toBe('Play a song?');
    g.beginBuild(0);
    expect(g.mode).toBe('build');
    expect(g.display.sub).toBe('Pick the big boom');
    let t = 45.1;
    const parts = ['kit:kick', 'kit:snare', 't1:0', 'keys:0', 'keys:2', 'kit:tom'];
    for (const key of parts) {
      g.tick(t);
      expect(g.buildAsks()).not.toBeNull();
      g.hit(key, t, 0.8);
      // play every lit note on time, until the module asks for the next part
      for (let k = 0; k < 600 && g.buildAsks() === null && !g.buildRunning(); k++) {
        t += 1 / 30;
        g.tick(t);
        g.dueBetween(t - 1 / 30, t, (kk) => g.hit(kk, t, 0.8));
      }
    }
    expect(g.buildRunning()).toBe(true);
    expect(p.built).toContain('kick-start');
    // the machine plays every part on its things
    const before = voiced.length;
    for (let k = 0; k < 120; k++) g.tick((t += 1 / 30));
    const played = voiced.slice(before);
    expect(played.some((k) => k === 'kit:kick')).toBe(true);
    expect(played.some((k) => k.startsWith('t1:'))).toBe(true);
    expect(played.some((k) => k.startsWith('keys:'))).toBe(true);
  });

  it('build: a stray tap right after a part goes in picks nothing; the module says what went in and what is next', () => {
    const g = new Game(stage([]), freshProgress(), room([{ id: 't1', family: 'bell', zones: 1 }]));
    g.start(0);
    g.discovered('kit', 'table', 0);
    g.tick(45);
    g.beginBuild(0);
    let t = 45.1;
    g.tick(t);
    g.hit('kit:kick', t, 0.8);
    for (let k = 0; k < 600 && g.display.sub !== 'Next: SMACK'; k++) {
      t += 1 / 30;
      g.tick(t);
      g.dueBetween(t - 1 / 30, t, (kk) => g.hit(kk, t, 0.8));
    }
    expect(g.display.line).toMatch(/^BOOM: (yours|every note|\d+ of \d+)$/);
    // still tapping along on the kick: nothing is picked
    g.hit('kit:kick', t, 0.8);
    expect(g.buildAsks()).toBeNull();
    for (let k = 0; k < 120 && g.buildAsks() === null; k++) g.tick((t += 1 / 30));
    expect(g.buildAsks()).toBe('SNARE');
    // the kick again, once: still nothing; twice quickly: it plays the snare too
    g.hit('kit:kick', t, 0.8);
    expect(g.buildAsks()).toBe('SNARE');
    g.hit('kit:kick', t + 0.2, 0.8);
    expect(g.buildAsks()).toBeNull();
  });

  it('perform: never three things at once, and ▶ on the results plays your machine again', () => {
    const g = new Game(stage([]), freshProgress(), room([{ id: 't1', family: 'bell', zones: 1 }]));
    g.start(0);
    g.discovered('kit', 'table', 0);
    g.tick(45);
    g.beginBuild(0);
    let t = 45.1;
    for (const key of ['kit:kick', 'kit:snare', 't1:0', 'keys:0', 'keys:2', 'kit:tom']) {
      g.tick(t);
      g.hit(key, t, 0.8);
      for (let k = 0; k < 900 && g.buildAsks() === null && !g.buildRunning(); k++) {
        t += 1 / 30;
        g.tick(t);
        g.dueBetween(t - 1 / 30, t, (kk) => g.hit(kk, t, 0.8));
      }
    }
    g.key('play');
    const at = new Map<number, number>();
    for (let k = 0; k < 4000 && g.mode !== 'results'; k++) {
      t += 1 / 30;
      g.tick(t);
      g.dueBetween(t - 1 / 30, t, (kk) => {
        const ms = Math.round(t * 1000);
        at.set(ms, (at.get(ms) ?? 0) + 1);
        g.hit(kk, t, 0.8);
      });
    }
    expect(g.mode).toBe('results');
    expect(Math.max(...at.values())).toBeLessThanOrEqual(2);
    // a few seconds in, the results name the thing of yours that carried it
    g.tick((t += 4.5));
    expect(g.display.sub).toBe('The tick never missed');
    g.key('play');
    expect(g.mode).toBe('count');
  });

  it('the finished machine goes quiet for a bar, then drops in; after a performance it plays twice through', () => {
    const log: string[] = [];
    const voiced: number[] = [];
    let now = 0;
    const st = { ...stage(log), drop: () => log.push('drop'), voice: () => voiced.push(now) };
    const g = new Game(st, freshProgress(), room([{ id: 't1', family: 'bell', zones: 1 }]));
    g.start(0);
    g.discovered('kit', 'table', 0);
    g.tick(45);
    g.beginBuild(0);
    let t = 45.1;
    for (const key of ['kit:kick', 'kit:snare', 't1:0', 'keys:0', 'keys:2', 'kit:tom']) {
      g.tick(t);
      g.hit(key, t, 0.8);
      for (let k = 0; k < 900 && g.buildAsks() === null && !g.buildRunning(); k++) {
        t += 1 / 30;
        now = t;
        g.tick(t);
        if (g.display.sub === 'Everything, in…') log.push('silent');
        g.dueBetween(t - 1 / 30, t, (kk) => g.hit(kk, t, 0.8));
      }
    }
    expect(log).toContain('silent');
    expect(log.filter((x) => x === 'drop')).toHaveLength(1);
    expect(log).not.toContain('celebrate 3');
    g.key('play');
    for (let k = 0; k < 4000 && g.mode !== 'results'; k++) {
      t += 1 / 30;
      now = t;
      g.tick(t);
      g.dueBetween(t - 1 / 30, t, (kk) => g.hit(kk, t, 0.8));
    }
    const end = t;
    for (let k = 0; k < 600 && g.mode === 'results'; k++) {
      t += 1 / 30;
      now = t;
      g.tick(t);
    }
    expect(log.filter((x) => x === 'drop').length).toBeGreaterThanOrEqual(2);
    expect(voiced.filter((x) => x > end).length).toBeGreaterThan(20);
  });

  it('a hand resting on a thing silences its part in the machine; lifting it brings it back', () => {
    const voiced: string[] = [];
    const labels: string[][] = [];
    let cover = false;
    const st = { ...stage([]), voice: (k: string) => voiced.push(k), labels: (l: readonly { key: string; name: string }[]) => labels.push(l.map((x) => `${x.name}@${x.key}`)) };
    const rm = { ...room([{ id: 't1', family: 'bell', zones: 1 }]), muted: (s: string) => cover && s === 't1' };
    const g = new Game(st, freshProgress(), rm);
    g.start(0);
    g.discovered('kit', 'table', 0);
    g.tick(45);
    g.beginBuild(0);
    let t = 45.1;
    for (const key of ['kit:kick', 'kit:snare', 't1:0', 'keys:0', 'keys:2', 'kit:tom']) {
      g.tick(t);
      g.hit(key, t, 0.8);
      for (let k = 0; k < 900 && g.buildAsks() === null && !g.buildRunning(); k++) {
        t += 1 / 30;
        g.tick(t);
        g.dueBetween(t - 1 / 30, t, (kk) => g.hit(kk, t, 0.8));
      }
    }
    // the tape says what each thing plays
    expect(labels[labels.length - 1]).toContain('TICK@t1:0');
    cover = true;
    let from = voiced.length;
    for (let k = 0; k < 180; k++) g.tick((t += 1 / 30));
    expect(voiced.slice(from).some((k) => k.startsWith('t1:'))).toBe(false);
    expect(voiced.slice(from).some((k) => k === 'kit:kick')).toBe(true);
    cover = false;
    from = voiced.length;
    for (let k = 0; k < 180; k++) g.tick((t += 1 / 30));
    expect(voiced.slice(from).some((k) => k.startsWith('t1:'))).toBe(true);
  });

  it('free play on the panel: a tab puts an instrument out; NOTES and SOUND change it; < > browse songs; a build brings the drums back', () => {
    const order = ['drums', 'piano', 'guitar', 'handpan'];
    let i = 0;
    let scale = 'Happy';
    const used: (string | null)[] = [];
    const view = () => ({ id: order[i], name: order[i][0].toUpperCase() + order[i].slice(1), how: 'how', scale, sound: 'Grand' });
    const st = {
      ...stage([]),
      shelf: (d: 1 | -1 | 0) => {
        i = (i + d + 4) % 4;
        return view();
      },
      shelfSet: (w: 'scale' | 'sound') => {
        if (w === 'scale') scale = 'Sad';
        return view();
      },
      useInstrument: (id: string | null) => used.push(id),
    };
    const p = freshProgress();
    p.stars['kick-start'] = 2;
    const g = new Game(st, p, room([]));
    g.start(0);
    g.discovered('kit', 'table', 0);
    g.tick(1);
    // (the room puts the piano out when its tab is pressed, then tells the game)
    i = 1;
    g.shelfPicked(view());
    expect(g.display.screen).toBe('home');
    expect(g.display.inst?.name).toBe('Piano');
    expect(g.display.keys).toEqual(['<', 'PLAY', '>', 'NOTES', 'SOUND']);
    g.tick(2);
    g.key('jam');
    expect(g.display.inst?.detail).toBe('Notes: Sad');
    // the song card: < > browse what's open (Kick Start played, so Two Step is open too)
    expect(g.display.songCard?.name).toBe('Kick Start');
    g.key('next');
    expect(g.display.songCard?.name).toBe('Two Step');
    g.key('prev');
    expect(g.display.songCard?.name).toBe('Kick Start');
    g.tick(45);
    g.beginBuild(0);
    expect(g.mode).toBe('build');
    expect(used).toContain('drums');
  });

  it('chords under the track: in Build from the first part with notes, and all through Perform', () => {
    const chords: { mode: string; midi: number; minor: boolean }[] = [];
    let g!: Game;
    const st = { ...stage([]), band: (e: { voice: string; midi: number; minor?: boolean }) => e.voice === 'chord' && chords.push({ mode: g.mode, midi: e.midi, minor: !!e.minor }) };
    g = new Game(st, freshProgress(), room([{ id: 't1', family: 'bell', zones: 1 }]));
    g.start(0);
    g.discovered('kit', 'table', 0);
    g.tick(45);
    g.beginBuild(0);
    let t = 45.1;
    for (const [n, key] of ['kit:kick', 'kit:snare', 't1:0', 'keys:0', 'keys:2', 'kit:tom'].entries()) {
      g.tick(t);
      if (n === 4) expect(chords.filter((c) => c.mode === 'build')).toHaveLength(0);
      g.hit(key, t, 0.8);
      for (let k = 0; k < 900 && g.buildAsks() === null && !g.buildRunning(); k++) {
        t += 1 / 30;
        g.tick(t);
        g.dueBetween(t - 1 / 30, t, (kk) => g.hit(kk, t, 0.8));
      }
    }
    expect(chords.filter((c) => c.mode === 'build').length).toBeGreaterThan(3);
    // Kick Start: C then A minor, a bar each
    expect(chords.some((c) => c.midi === 60 && !c.minor)).toBe(true);
    expect(chords.some((c) => c.midi === 57 && c.minor)).toBe(true);
    g.key('play');
    const before = chords.length;
    for (let k = 0; k < 4000 && g.mode !== 'results'; k++) {
      t += 1 / 30;
      g.tick(t);
    }
    expect(chords.length - before).toBeGreaterThanOrEqual(20);
  });

  it('performing: ▶ switches to the piano at the next loop; a bar to find it, then the tune is yours to play', () => {
    const used: (string | null)[] = [];
    const st = { ...stage([]), useInstrument: (id: string | null) => used.push(id) };
    const rm = { ...room([{ id: 't1', family: 'bell', zones: 1 }]), zones: (id: string) => (id === 'keys' || id === 'piano' ? 7 : id === 't1' ? 1 : 0) };
    const g = new Game(st, freshProgress(), rm);
    g.start(0);
    g.discovered('kit', 'table', 0);
    g.tick(45);
    g.beginBuild(0);
    let t = 45.1;
    for (const key of ['kit:kick', 'kit:snare', 't1:0', 'keys:0', 'piano:2', 'piano:0']) {
      g.tick(t);
      g.hit(key, t, 0.8);
      for (let k = 0; k < 900 && g.buildAsks() === null && !g.buildRunning(); k++) {
        t += 1 / 30;
        g.tick(t);
        g.dueBetween(t - 1 / 30, t, (kk) => g.hit(kk, t, 0.8));
      }
    }
    // the tune and the low notes were built on the piano (its instrument came out for them)
    expect(used).toContain('piano');
    g.key('play');
    for (let k = 0; k < 200; k++) g.tick((t += 1 / 30));
    g.key('next');
    expect(g.display.sub).toBe('Piano next');
    const due: string[] = [];
    for (let k = 0; k < 4000 && g.mode !== 'results'; k++) {
      t += 1 / 30;
      g.tick(t);
      g.dueBetween(t - 1 / 30, t, (kk) => {
        due.push(kk);
        g.hit(kk, t, 0.8);
      });
    }
    expect(used[used.length - 1] === 'piano' || used.includes('piano')).toBe(true);
    expect(due.some((k) => k.startsWith('piano:'))).toBe(true);
    expect(g.mode).toBe('results');
    expect(g.last!.stars).toBeGreaterThanOrEqual(2);
  });

  it('free play: your first note brings a soft band in under you; two quiet bars and it lets go', () => {
    const band: string[] = [];
    const voiced: string[] = [];
    const st = {
      ...stage([]),
      band: (e: { voice: string }) => band.push(e.voice),
      voice: (k: string) => voiced.push(k),
      freeHarmony: () => ({ inst: 'piano', root: 48, chords: [[0, 4, 7], [9, 12, 16], [5, 9, 12]] }),
    };
    const g = new Game(st, freshProgress(), room([]));
    g.start(0);
    g.discovered('kit', 'table', 0);
    let t = 1;
    g.tick(t);
    expect(g.harmony()).toBeNull();
    g.hit('piano:2', t, 0.7);
    for (let k = 0; k < 90; k++) {
      t += 1 / 30;
      if (k % 20 === 0) g.hit('piano:3', t, 0.7);
      g.tick(t);
    }
    expect(band).toContain('chord');
    expect(band).toContain('bass');
    expect(voiced).toContain('kit:kick');
    // its chord is the one the chord pad and the strums follow, in your scale (not a song's)
    expect(g.harmony()?.song).toBe(false);
    expect(g.harmony()?.chord).toBe(48);
    const n = band.length;
    for (let k = 0; k < 300; k++) g.tick((t += 1 / 30));
    expect(g.harmony()).toBeNull();
    const after = band.length;
    for (let k = 0; k < 60; k++) g.tick((t += 1 / 30));
    expect(band.length).toBe(after);
    expect(after).toBeGreaterThan(n);
  });

  it('play a song: ▶ plays Kick Start as written on the drums; > after it makes it your own', () => {
    const g = new Game(stage([]), freshProgress(), room([]));
    g.start(0);
    g.discovered('kit', 'table', 0);
    g.tick(45);
    expect(g.display.sub).toBe('Kick Start: tap ▶');
    g.key('play');
    expect(g.mode).toBe('count');
    let t = 45;
    const due: string[] = [];
    for (let k = 0; k < 4000 && g.mode !== 'results'; k++) {
      t += 1 / 30;
      g.tick(t);
      g.dueBetween(t - 1 / 30, t, (kk) => {
        due.push(kk);
        g.hit(kk, t, 0.8);
      });
    }
    expect(g.mode).toBe('results');
    expect(due.every((k) => k.startsWith('kit:'))).toBe(true);
    expect(g.last!.stars).toBe(3);
    g.tick((t += 8));
    // the results: again, the next song, or make this one your own
    expect(g.display.page?.items.map((i) => i.id)).toEqual(['again', 'next', 'make', 'nav:main']);
    g.act('make');
    expect(g.mode).toBe('build');
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

  it('REC: locked until Kitchen Clock; then records what you play anywhere and plays it back', () => {
    const voiced: string[] = [];
    const st = { ...stage([]), voice: (key: string) => voiced.push(key) };
    const p = freshProgress();
    const g = new Game(st, p, room([{ id: 'p1', family: 'marimba', zones: 8 }]));
    g.start(0);
    g.tick(1);
    g.key('loop');
    expect(g.display.sub).toMatch(/Perform a track first/);
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

  it('the gear opens settings without moving the song choice; the count-in counts 4 3 2 1', () => {
    const p = freshProgress();
    p.stars['porch-step'] = 2;
    p.stars['kitchen-clock'] = 2;
    const g = new Game(stage([]), p, room([]));
    g.start(0);
    g.selected = 1;
    g.tick(1);
    g.openSettings();
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
