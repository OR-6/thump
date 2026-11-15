import { describe, expect, it } from 'vitest';
import { SONG_TRACKS } from '../src/play/build.js';
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
    // (the backing band is on, as by default)
    setting: (n: string) => n === 'band',
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
    // (Normal: its last four bars are the hold-it, no lights)
    g.act('level:normal');
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
      if (g.display.line === 'Solo!') sawFill = true;
      if (g.display.line === 'No lights: keep going') sawHold = true;
    }
    expect(g.mode).toBe('results');
    // (every note keeps its cue to the end now: no bars played from memory)
    expect(sawFill).toBe(true);
    expect(sawHold).toBe(false);
    expect(g.last?.stars).toBe(3);
    // (hits land up to a 30 fps frame after the note here, so not 100)
    expect(g.lastTight).toBeGreaterThan(60);
    // your replay first; then the score, and it stays: the song and its %, then how it sat in time
    const songEnd = voiced.length;
    for (let k = 0; k < 900 && g.display.line === 'That was you'; k++) g.tick((t += 1 / 30));
    // (the score counts up and the grade lands first: the stars after 2.1 s)
    g.tick((t += 1.6));
    // (the results name the song; the score, grade and accuracy are on the medal)
    expect(g.display.line).not.toBe('That was you');
    expect(g.display.result).toBeTruthy();
    expect(g.display.sub).toMatch(/on the beat|ahead|behind|Listen first/);
    g.tick((t += 1.6));
    expect(g.display.stars).toBe(3);
    expect(g.display.result?.letter).toMatch(/[SABCD]/);
    expect(g.display.result?.score).toBeGreaterThan(0);
    // the machine played under it: the parts you don't play live (perc, keys, bass), never the ones you do
    expect(voiced.slice(before, songEnd).some((k) => k.startsWith('keys:'))).toBe(true);
    expect(voiced.slice(before, songEnd).some((k) => k === 'kit:kick' || k.startsWith('t1:'))).toBe(false);
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

  it('no encore: after a good song nothing of yours is played back over the results', () => {
    const voiced: { key: string; at: number }[] = [];
    const st = { ...stage([]), voice: (key: string, at: number) => voiced.push({ key, at }) };
    const g = new Game(st, freshProgress(), room([]));
    g.start(0);
    g.begin(0);
    const t = play(g, 0, 120, 0.01, (x) => x.mode === 'results');
    expect(g.last?.stars).toBe(3);
    const before = voiced.length;
    for (let k = 1; k <= 60; k++) g.tick(t + k * 0.1);
    expect(voiced.slice(before).length).toBe(0);
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
    expect(g.display.sub).toBe('Hit a drum for BOOM');
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
    // straight to the results (no replay of your bars first): they name the song; the score, grade and accuracy are on the medal
    g.tick((t += 1 / 30));
    expect(g.display.line).not.toBe('That was you');
    expect(g.display.stars).not.toBe(-1);
    expect(g.display.result).toBeTruthy();
    g.tick((t += 6.6));
    expect(g.display.sub).toBe('The tick never missed');
    g.key('play');
    expect(g.mode).toBe('count');
  });

  it('the finished machine goes quiet for a bar, then drops in; after a performance it goes straight to the results', () => {
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
    const subs: string[] = [];
    for (let k = 0; k < 600 && g.mode === 'results'; k++) {
      t += 1 / 30;
      now = t;
      g.tick(t);
      subs.push(g.display.line);
    }
    // (the song ends on the results: nothing of yours is played back)
    expect(log.filter((x) => x === 'drop').length).toBeGreaterThanOrEqual(1);
    expect(subs).not.toContain('That was you');
    void end;
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
    p.stars[SONG_TRACKS[0].id] = 2;
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
    // the song card: < > browse the songs
    expect(g.display.songCard?.name).toBe(SONG_TRACKS[0].name);
    g.key('next');
    expect(g.display.songCard?.name).toBe(SONG_TRACKS[1].name);
    g.key('prev');
    expect(g.display.songCard?.name).toBe(SONG_TRACKS[0].name);
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

  it('free play is yours: steady notes bring no band in behind you', () => {
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
    for (let k = 0; k < 120; k++) {
      t += 1 / 30;
      if (k % 15 === 0) g.hit('piano:2', t, 0.7);
      g.tick(t);
    }
    expect(band).toEqual([]);
    expect(voiced).toEqual([]);
    expect(g.harmony()).toBeNull();
  });

  it('a lesson holds still for you: each step to read (its drum goes on, after a moment, unscored), then its first notes at their moment (their own hit, right on time)', () => {
    const holds: boolean[] = [];
    const g = new Game({ ...stage([]), holdSong: (on) => holds.push(on) }, freshProgress(), room([]));
    g.start(0);
    g.discovered('kit', 'table', 0);
    g.tick(45);
    expect(g.tracks[0].id).toBe('learn-drums');
    g.key('play');
    // (the room holds the clock while held: here, the test does)
    let t = 45;
    for (let k = 0; k < 600 && !g.hold; k++) g.tick((t += 1 / 30));
    expect(g.hold?.kind).toBe('read');
    expect(holds).toEqual([true]);
    // (a moment to read it: a hit at once doesn't go on; nor, after, a drum other than the one it names)
    expect(g.hit('kit:snare', t, 0.8)).toBeNull();
    expect(g.hold?.kind).toBe('read');
    for (let k = 0; k < 30; k++) g.tick((t += 1 / 30));
    expect(g.hit('kit:kick', t, 0.8)).toBeNull();
    expect(g.hold?.kind).toBe('read');
    expect(g.hit('kit:snare', t, 0.8)).toBeNull();
    expect(g.hold).toBeNull();
    expect(holds).toEqual([true, false]);
    // the first note's moment: it waits for the snare; another drum doesn't let it go
    for (let k = 0; k < 900 && !g.hold; k++) g.tick((t += 1 / 30));
    expect(g.hold?.kind).toBe('note');
    expect(g.hold?.key).toBe('kit:snare');
    const held = t;
    for (let k = 0; k < 10; k++) g.tick(held);
    expect(g.hit('kit:kick', held, 0.8)).toBeNull();
    expect(g.hold).not.toBeNull();
    expect(g.hit('kit:snare', held, 0.8)).toBe('perfect');
    expect(g.hold).toBeNull();
  });

  it('play a song: ▶ plays the first song on the drums; the results offer it again, the next song, or the menu', () => {
    const g = new Game(stage([]), freshProgress(), room([]));
    g.start(0);
    g.discovered('kit', 'table', 0);
    g.tick(45);
    expect(g.display.sub).toBe(`${SONG_TRACKS[0].name}: tap ▶`);
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
    // the results: again, the next song, or the menu (a written-out song has no loop of its own to build)
    expect(g.display.page?.items.map((i) => i.id)).toEqual(['nav:main', 'next', 'again']);
    g.act('next');
    expect(g.mode).toBe('count');
    expect(g.song?.name).toBe(SONG_TRACKS[1].name);
    // Make a track still builds the loop tracks, the first first
    g.stop();
    g.act('nav:build');
    expect(g.mode).toBe('build');
    expect(g.display.line).toMatch(/BOOM/);
  });

  it("a song on the piano: Easy is the tune's notes on 1 and 3, and the band plays the rest of it", () => {
    const band: { voice: string; beat: number; midi: number }[] = [];
    const st = { ...stage([]), band: (e: { voice: string; beat: number; midi: number }) => band.push(e), shelf: () => ({ id: 'piano', name: 'Piano', how: '', scale: 'Major', sound: 'Grand' }) };
    const g = new Game(st, freshProgress(), room([]));
    g.start(0);
    g.discovered('kit', 'table', 0);
    g.act('nav:songs');
    g.act(`song:${SONG_TRACKS.findIndex((x) => x.id === 'ode-to-joy')}`);
    g.act('play');
    // the instruments play the song's own scale, the full major
    expect(g.harmony()?.scale).toBe('major');
    let t = 0;
    const due: { key: string; beat: number }[] = [];
    for (let k = 0; k < 6000 && g.mode !== 'results'; k++) {
      t += 1 / 30;
      g.tick(t);
      g.dueBetween(t - 1 / 30, t, (kk) => {
        due.push({ key: kk, beat: g.clock.beatAt(t) });
        g.hit(kk, t, 0.8);
      });
      if (g.display.line === 'Bring it home') g.hit('piano:5', t, 0.8);
    }
    expect(g.mode).toBe('results');
    expect(due.length).toBeGreaterThan(30);
    expect(due.every((d) => d.key.startsWith('piano:'))).toBe(true);
    // (Ode to Joy: F# F# G A; you play the first F# and the G, the band plucks the others)
    const lead = band.filter((e) => e.voice === 'pluck' && e.beat < 4).map((e) => e.beat);
    expect(lead).toEqual([1, 3]);
    expect(band.some((e) => e.voice === 'bass' && e.beat === 0)).toBe(true);
  });

  it('a song puts its instrument out in its own key and scale (Ode to Joy: D major)', () => {
    const seen: string[] = [];
    const p = freshProgress();
    let g: Game;
    const st = { ...stage([]), useInstrument: (id: string | null) => seen.push(`${id} ${g.keyPc} ${g.harmony()?.scale}`), shelf: () => ({ id: 'marimba', name: 'Marimba', how: '', scale: 'Major', sound: 'Marimba' }) };
    g = new Game(st, p, room([]));
    g.start(0);
    g.discovered('kit', 'table', 0);
    g.act('nav:songs');
    g.act(`song:${SONG_TRACKS.findIndex((x) => x.id === 'ode-to-joy')}`);
    g.act('play');
    expect(g.song?.name).toBe('Ode to Joy');
    expect(seen[seen.length - 1]).toBe('marimba 2 major');
  });

  it('the songs page: a library, every song open, six to a page; how hard each is; all, the classics or the originals', () => {
    const g = new Game(stage([]), freshProgress(), room([]));
    g.start(0);
    g.discovered('kit', 'table', 0);
    g.act('nav:songs');
    const items = () => g.display.page?.items ?? [];
    const tiles = () => items().filter((i) => i.id.startsWith('song:'));
    const n = g.tracks.length;
    // (All songs: the drums' lesson first, then every song; the other lessons on their own page)
    const songs = g.tracks.map((t, i) => (t.score?.tune.lesson ? -1 : i)).filter((i) => i >= 0);
    const all = [0, ...songs];
    const pages = Math.ceil(all.length / 4);
    expect(tiles().map((i) => i.label)).toEqual(all.slice(0, 4).map((i) => SONG_TRACKS[i].name));
    // (each row is its name and best grade; what it is shows on the chosen one's card)
    expect(g.display.page?.card?.meta).toBe('Start here');
    expect(tiles()[1].grade).toBe('—');
    expect(tiles().some((i) => i.off)).toBe(false);
    expect(items().find((i) => i.id === 'songs:more')?.sub).toBe(`1 of ${pages}`);
    // every page in turn, then back to the first; every song on one of them, the last one today's
    const seen: string[] = [];
    for (let p = 0; p < pages; p++) {
      seen.push(...tiles().map((i) => i.id));
      g.act('songs:more');
    }
    expect(seen).toEqual(all.map((i) => `song:${i}`));
    expect(tiles()[0].id).toBe('song:0');
    // any song can be picked, the hardest too
    g.act(`song:${n - 2}`);
    expect(g.songSel).toBe(n - 2);
    // the originals alone, then the classics alone
    const lit = () => items().find((i) => i.id.startsWith('songs:filter:') && i.on)?.label;
    g.act('songs:filter');
    expect(lit()).toBe('Classics');
    g.act('songs:filter:originals');
    expect(lit()).toBe('Originals');
    expect(tiles().map((i) => g.tracks[Number(i.id.slice(5))].score?.tune.original)).toEqual(tiles().map(() => true));
    g.act('songs:filter');
    expect(lit()).toBe('Lessons');
    expect(tiles().length).toBe(4);
    g.act('songs:filter:all');
    expect(lit()).toBe('All');
  });

  it('listen first: the song plays itself (your part too), nothing scored, then straight into your turn', () => {
    const voiced: string[] = [];
    const g = new Game({ ...stage([]), voice: (k: string) => voiced.push(k) }, freshProgress(), room([]));
    g.start(0);
    g.discovered('kit', 'table', 0);
    g.act('nav:songs');
    g.act('listen');
    expect(g.mode).toBe('count');
    let t = 0;
    for (let k = 0; k < 2000 && g.listening; k++) g.tick((t += 1 / 30));
    expect(g.listening).toBe(false);
    expect(g.mode).toBe('count');
    expect(g.display.sub).toBe('Your turn');
    // the drums you'd play were played for you
    expect(voiced.filter((k) => k === 'kit:kick').length).toBeGreaterThan(4);
    expect(g.performed('kick-start')).toBe(false);
  });

  it('the last hit: the band waits for it, then lands with you; or ends by itself', () => {
    let drops = 0;
    const g = new Game({ ...stage([]), drop: () => drops++ }, freshProgress(), room([]));
    g.start(0);
    g.discovered('kit', 'table', 0);
    g.act('nav:songs');
    g.act('play');
    let t = 0;
    for (let k = 0; k < 6000 && g.display.line !== 'Bring it home'; k++) g.tick((t += 1 / 30));
    expect(g.display.line).toBe('Bring it home');
    expect(g.mode).toBe('play');
    const before = drops;
    g.tick((t += 0.5));
    expect(g.mode).toBe('play');
    g.hit('kit:snare', t, 0.8);
    expect(g.mode).toBe('results');
    expect(drops).toBe(before + 1);
    // again, and nobody hits it: it ends on its own
    g.act('again');
    for (let k = 0; k < 9000 && g.mode !== 'results'; k++) g.tick((t += 1 / 30));
    expect(g.mode).toBe('results');
  });

  it("a song's recorded band: its stems play from beat 0 on the song's clock, yours muted; the game's own band only counts in", () => {
    const band: { voice: string; beat: number }[] = [];
    const voiced: string[] = [];
    const plays: { id: string; zero: number; from: number }[] = [];
    const levels = new Map<string, number>();
    let stops = 0;
    let ready = false;
    const loads: string[] = [];
    const g = new Game(
      {
        ...stage([]),
        voice: (k: string) => voiced.push(k),
        band: (e: { voice: string; beat: number }) => band.push(e),
        stems: { load: (id) => loads.push(id), ready: () => ready, play: (id, zero, from) => (plays.push({ id, zero, from }), true), stop: () => stops++, synced: (z) => plays.length > 0 && Math.abs(plays[plays.length - 1].zero - z) < 0.004, level: (st, v) => levels.set(st, v) },
      },
      freshProgress(),
      room([]),
    );
    g.start(0);
    g.discovered('kit', 'table', 0);
    g.act('nav:songs');
    ready = true;
    g.act('play');
    expect(loads.length).toBeGreaterThan(0);
    let t = 0;
    for (let k = 0; k < 600; k++) g.tick((t += 1 / 30));
    expect(g.stemsOn).toBe(true);
    expect(plays.length).toBe(1);
    expect(plays[0].zero).toBeCloseTo(g.clock.timeAt(0), 6);
    // (you're on the drums: their stem is yours; the rest of the band plays)
    expect(levels.get('drums')).toBe(0);
    expect(levels.get('lead')).toBeGreaterThan(0.5);
    // the game's own band only counts in: nothing of it from beat 0 on
    expect(band.some((e) => e.beat >= 0 && e.voice !== 'chord' && e.voice !== 'bass')).toBe(false);
    expect(band.filter((e) => e.beat < 0).length).toBeGreaterThan(0);
    expect(voiced.length).toBe(0);
    // a pause stops them; back from it, they pick up where the song is
    g.paused = true;
    g.tick((t += 1 / 30));
    expect(stops).toBeGreaterThan(0);
    g.paused = false;
    g.resumed(t);
    g.tick((t += 1 / 30));
    expect(plays.length).toBe(2);
    expect(plays[1].zero).toBeCloseTo(g.clock.timeAt(0), 6);
  });

  it("a friend playing the tune live in the same song: this headset's band leaves out just that part", () => {
    const voiced: string[] = [];
    const band: { voice: string }[] = [];
    const g = new Game({ ...stage([]), voice: (k: string) => voiced.push(k), band: (e: { voice: string }) => band.push(e) }, freshProgress(), room([]));
    g.start(0);
    g.discovered('kit', 'table', 0);
    g.friendParts.add('KEYS');
    g.act('nav:songs');
    g.act('play');
    let t = 0;
    for (let k = 0; k < 900; k++) g.tick((t += 1 / 30));
    // (the tune is the friend's: no lead here; the bass and the percussion still play: in this rock lesson the
    // band's percussion is a tambourine on the bed, not congas)
    expect(band.some((e) => e.voice === 'pluck')).toBe(false);
    expect(band.some((e) => e.voice === 'bass')).toBe(true);
    expect(band.some((e) => e.voice === 'perc') || voiced.some((k) => k.startsWith('congas:'))).toBe(true);
  });

  it("a song's chords follow it bar by bar, and the solo holds the five", () => {
    const g = new Game(stage([]), freshProgress(), room([]));
    g.start(0);
    g.discovered('kit', 'table', 0);
    const i = SONG_TRACKS.findIndex((x) => x.id === 'ode-to-joy');
    g.act('nav:songs');
    g.act(`song:${i}`);
    g.act('play');
    let t = 0;
    const chordAt: number[] = [];
    for (let k = 0; k < 2400 && g.mode !== 'results'; k++) {
      g.tick((t += 1 / 30));
      const b = Math.floor(g.clock.beatAt(t) / 4);
      if (b >= 0 && chordAt[b] === undefined && g.mode === 'play') chordAt[b] = g.harmony()!.chord;
    }
    // Ode to Joy in D: D A D A D A D (A, D), then the second part from A; the solo bar after sixteen, on A
    expect(chordAt.slice(0, 9)).toEqual([62, 69, 62, 69, 62, 69, 62, 69, 69]);
    expect(chordAt[16]).toBe(69);
  });

  it("today's song (a loop track): its second half changes chords (IV–ii in major, VI–VII in minor) and comes home", () => {
    const band: { voice: string; midi: number; beat: number }[] = [];
    const g = new Game({ ...stage([]), band: (e: { voice: string; midi: number; beat: number }) => band.push(e) }, freshProgress(), room([]));
    g.start(0);
    g.discovered('kit', 'table', 0);
    const daily = g.tracks.length - 1;
    g.act('nav:songs');
    g.act(`song:${daily}`);
    g.act('play');
    const tr = g.tracks[daily];
    const up = tr.minor ? [8, 10] : [5, 2];
    let t = 0;
    const chordAt: number[] = [];
    for (let k = 0; k < 2400 && g.mode !== 'results'; k++) {
      g.tick((t += 1 / 30));
      const b = Math.floor(g.clock.beatAt(t) / 4);
      if (b >= 0 && chordAt[b] === undefined && g.mode === 'play') chordAt[b] = g.harmony()!.chord;
    }
    expect(chordAt[8]).toBe(tr.chords[0] + up[0]);
    expect(chordAt[9]).toBe(tr.chords[0] + up[1]);
    expect(chordAt[12]).toBe(tr.chords[0]);
    // the bed's chord and its bass in bar 9 are its first change
    expect(band.some((e) => e.voice === 'chord' && e.beat === 32 && e.midi === tr.chords[0] + up[0])).toBe(true);
    expect(band.some((e) => e.voice === 'bass' && e.beat === 32 && e.midi === tr.chords[0] + up[0] - 24)).toBe(true);
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

import { nearKeys } from '../src/play/game.js';
describe('forgiving where it is hard to see', () => {
  it('a conga counts anywhere on the right drum on Easy and Normal, not on Hard', () => {
    expect(nearKeys('congas:0', 'easy')).toEqual(['congas:1']);
    expect(nearKeys('congas:3', 'normal')).toEqual(['congas:2']);
    expect(nearKeys('congas:0', 'hard')).toEqual([]);
  });
  it('a handpan field stands for the fields beside it on Easy only (the ding for none)', () => {
    const n = nearKeys('handpan:1', 'easy');
    expect(n.length).toBe(2);
    expect(n.every((k) => /^handpan:[1-8]$/.test(k) && k !== 'handpan:1')).toBe(true);
    expect(nearKeys('handpan:0', 'easy')).toEqual([]);
    expect(nearKeys('handpan:1', 'normal')).toEqual([]);
  });
});

describe('stars are each instrument\'s own', () => {
  it('three stars on one instrument show on it, not on another; the song still counts as played', () => {
    let out = 'drums';
    const st = { ...stage([]), shelf: () => ({ id: out }) } as unknown as GameStage;
    const p = freshProgress();
    const g = new Game(st, p, room([]));
    g.start(0);
    g.begin(0);
    play(g, 0, 120, 0.01, (x) => x.mode === 'results');
    const id = Object.keys(p.stars)[0];
    expect(id).toBeTruthy();
    const on = (g as unknown as { starsOn(id: string): number }).starsOn.bind(g);
    const inst = Object.keys(p.istars ?? {})[0]?.split(':')[1];
    expect(inst).toBeTruthy();
    out = inst!;
    expect(on(id)).toBe(p.stars[id]);
    out = inst === 'piano' ? 'drums' : 'piano';
    expect(on(id)).toBe(0);
    // (what unlocks the next songs is having played it at all)
    expect(id in p.stars).toBe(true);
  });
});

describe("the song card says where the world's board stands", () => {
  it('its best, once the board is in; nothing changes with no server', () => {
    const asked: string[] = [];
    const st = {
      ...stage([]),
      shelf: () => ({ id: 'drums' }),
      boardTop: (board: string, done: (b: { top: { name: string; score: number }[]; total: number; rank: number; mine: boolean } | null) => void) => {
        asked.push(board);
        done({ top: [{ name: 'Night Owls', score: 52000 }], total: 3, rank: 0, mine: false });
      },
    } as unknown as GameStage;
    const g = new Game(st, freshProgress(), room([]));
    g.start(0);
    g.discovered('kit', 'table', 0);
    g.menu = 'songs';
    const i = g.tracks.findIndex((t) => t.score && !t.score.tune.lesson);
    g.songSel = i;
    g.refreshDisplay();
    g.refreshDisplay();
    expect(asked.length).toBe(1);
    expect(asked[0]).toMatch(/:drums:easy$/);
    expect(g.display.page?.card?.meta).toBe('World best 52,000 · Night Owls');
    // (no server: the card keeps its own line)
    const g2 = new Game({ ...stage([]), shelf: () => ({ id: 'drums' }) } as unknown as GameStage, freshProgress(), room([]));
    g2.start(0);
    g2.discovered('kit', 'table', 0);
    g2.menu = 'songs';
    g2.songSel = i;
    g2.refreshDisplay();
    expect(g2.display.page?.card?.meta).not.toMatch(/World/);
  });
});
