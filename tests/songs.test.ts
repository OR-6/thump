import { describe, expect, it } from 'vitest';
import { bed, grid, oneHanded, secPerBeat } from '../src/songs/chart.js';
import { SONGS } from '../src/songs/songs.js';
import { NoteJudge, copyNeeds, estimateOffset, starsFor, windows } from '../src/songs/judge.js';
import { EventCursor, SongClock } from '../src/songs/sequencer.js';
import { cast, noteKey, wants } from '../src/songs/cast.js';
import { Bandmate } from '../src/bandmate/bandmate.js';

describe('notation', () => {
  it('reads drum eighths and bars', () => {
    const n = grid({ kick: 'x...x...|X.......', snare: '..x...x.' });
    expect(n.map((x) => `${x.part}@${x.beat}`)).toEqual(['kick@0', 'snare@1', 'kick@2', 'snare@3', 'kick@4']);
    expect(n[4].vel).toBe(1);
  });
  it('reads melodic degrees', () => {
    const n = grid({ melody: '0.2.4...' });
    expect(n.map((x) => `${x.degree}@${x.beat}`)).toEqual(['0@0', '2@1', '4@2']);
  });
  it('the bed has a count-in bar before bar 0', () => {
    const b = bed({ roots: [60], bass: 'x.......', chord: 'hold', shaker: false }, 2);
    expect(b[0].beat).toBe(-4);
    expect(b.filter((e) => e.voice === 'bass').map((e) => e.beat)).toEqual([0, 4]);
  });
});

describe('one hand', () => {
  it('never two notes at once; a pitched note wins over a drum', () => {
    const n = grid({ kick: 'x...x...', melody: '0...2.4.' });
    const o = oneHanded(n);
    expect(o.map((x) => `${x.part}@${x.beat}`)).toEqual(['melody@0', 'melody@2', 'melody@3']);
    SONGS.forEach((s) => {
      const f = oneHanded(s.notes);
      for (let k = 1; k < f.length; k++) expect(f[k].beat).toBeGreaterThan(f[k - 1].beat);
    });
  });
});

describe('charts', () => {
  SONGS.forEach((s) => {
    it(`${s.name}: notes use its parts, inside the song`, () => {
      const end = s.bars * 4;
      for (const n of s.notes) {
        expect(s.parts).toContain(n.part);
        expect(n.beat).toBeGreaterThanOrEqual(0);
        expect(n.beat).toBeLessThan(end);
      }
      for (const e of s.bed) expect(e.beat).toBeLessThan(end);
      expect(s.mood.split(' ').length).toBeLessThanOrEqual(3);
      expect(s.bpm).toBeGreaterThanOrEqual(72);
      expect(s.bpm).toBeLessThanOrEqual(124);
    });
    it(`${s.name}: playable with two hands (never 3 notes at once, a part never faster than eighths)`, () => {
      const byPart = new Map<string, number[]>();
      for (const n of s.notes) (byPart.get(n.part) ?? byPart.set(n.part, []).get(n.part)!).push(n.beat);
      for (const beats of byPart.values()) for (let k = 1; k < beats.length; k++) expect(beats[k] - beats[k - 1]).toBeGreaterThanOrEqual(0.5 - 1e-9);
      const at = new Map<number, number>();
      for (const n of s.notes) at.set(n.beat, (at.get(n.beat) ?? 0) + 1);
      for (const c of at.values()) expect(c).toBeLessThanOrEqual(2);
    });
    it(`${s.name}: lasts 40–100 s`, () => {
      const sec = (s.bars + 1) * 4 * secPerBeat(s.bpm);
      expect(sec).toBeGreaterThan(40);
      expect(sec).toBeLessThan(100);
    });
  });
  it('cast onto a bare table, no two notes land on the same pad or bar at once', () => {
    for (const s of SONGS) {
      const c = cast(s.parts, []);
      const seen = new Set<string>();
      for (const n of s.notes) {
        const k = `${noteKey(n, c, (_id, d) => d % 8)}@${n.beat}`;
        expect(seen.has(k), `${s.name}: ${k}`).toBe(false);
        seen.add(k);
      }
    }
  });
  it('early songs ask for fewer instruments', () => {
    expect(wants(SONGS[0].parts)).toBe(1);
    expect(wants(SONGS[SONGS.length - 1].parts)).toBeGreaterThanOrEqual(2);
  });
});

describe('casting a song onto a room', () => {
  const door = { id: 'p1', family: 'marimba' as const, zones: 8 };
  const window = { id: 'p2', family: 'glock' as const, zones: 8 };
  const wall = { id: 'p3', family: 'gong' as const, zones: 1 };
  it('drums go to the kit; the melody to the door', () => {
    const c = cast(['kick', 'snare', 'melody'], [door, window]);
    expect(c.kick?.surface).toBe('kit');
    expect(c.melody?.surface).toBe('p1');
  });
  it('a chime takes the window when the door has the melody', () => {
    const c = cast(['melody', 'chime'], [door, window]);
    expect(c.melody?.surface).toBe('p1');
    expect(c.chime?.surface).toBe('p2');
  });
  it('a room with nothing but the table: the edge keys play the melody, the kit the gong', () => {
    const c = cast(['melody', 'gong', 'kick'], []);
    expect(c.melody?.surface).toBe('keys');
    expect(c.gong?.surface).toBe('kit');
  });
  it('the gong goes on the wall', () => expect(cast(['gong'], [wall, door]).gong?.surface).toBe('p3'));
  it('note keys: a pitched note goes to the zone the room gives its degree; drums to the kit', () => {
    const c = cast(['melody'], [door]);
    const zones = (id: string, d: number) => d % (id === 'keys' ? 5 : 8);
    expect(noteKey({ beat: 0, part: 'melody', degree: 3, vel: 1 }, c, zones)).toBe('p1:3');
    const k = cast(['melody'], []);
    expect(noteKey({ beat: 0, part: 'melody', degree: 7, vel: 1 }, k, zones)).toBe('keys:2');
    expect(noteKey({ beat: 0, part: 'snare', degree: -1, vel: 1 }, k, zones)).toBe('kit:snare');
  });
  SONGS.forEach((s) => {
    for (const room of [[], [door], [door, window, wall]]) {
      it(`${s.name} casts onto a room with ${room.length} instruments`, () => {
        const c = cast(s.parts, room);
        for (const p of s.parts) expect(c[p]).toBeDefined();
      });
    }
  });
});

describe('timing judge', () => {
  const notes = grid({ kick: 'x...x...', snare: '..x...x.' }).map((n) => ({ beat: n.beat, lane: n.part, vel: n.vel })); // beats 0,1,2,3
  const spb = secPerBeat(80);

  it('perfect, good, and a stray hit', () => {
    const j = new NoteJudge(notes, spb);
    expect(j.hit('kick', 0.02)?.grade).toBe('perfect');
    expect(j.hit('snare', spb + 0.1)?.grade).toBe('good');
    expect(j.hit('snare', spb * 1.5)).toBeNull(); // between notes
    expect(j.hit('kick', 2 * spb - 0.05)?.grade).toBe('perfect');
  });

  it('a note is hit once; the wrong pad does not take it', () => {
    const j = new NoteJudge(notes, spb);
    expect(j.hit('snare', 0)).toBeNull();
    expect(j.hit('kick', 0)?.grade).toBe('perfect');
    expect(j.hit('kick', 0.01)).toBeNull();
  });

  it('passed notes become misses, and stars follow the share', () => {
    const j = new NoteJudge(notes, spb);
    j.hit('kick', 0);
    j.hit('snare', spb);
    j.hit('kick', 2 * spb);
    let missed = 0;
    j.sweep(10, () => missed++);
    expect(missed).toBe(1);
    const s = j.summary();
    expect(s.share).toBeCloseTo(0.75);
    expect(s.stars).toBe(2);
    expect(j.done).toBe(true);
  });

  it('slow mode widens the windows', () => {
    const j = new NoteJudge(notes, spb, windows(true));
    expect(j.hit('kick', 0.15)?.grade).toBe('good');
    expect(windows(true).good).toBeCloseTo(0.18);
  });

  it('notes added live (an answer) are judged', () => {
    const j = new NoteJudge([], spb);
    j.add(grid({ tom: 'x.......' }, 2).map((n) => ({ beat: n.beat, lane: n.part, vel: n.vel })));
    expect(j.hit('tom', 8 * spb)?.grade).toBe('perfect');
  });

  it('stars: 1 finished, 2 at 70%, 3 at 90%', () => {
    expect(starsFor(0.2)).toBe(1);
    expect(starsFor(0.7)).toBe(2);
    expect(starsFor(0.9)).toBe(3);
  });

  it('copy needs 3 of 4', () => {
    expect(copyNeeds(4)).toBe(3);
    expect(copyNeeds(3)).toBe(3);
    expect(copyNeeds(6)).toBe(5);
  });

  it('calibration: the median tap offset, ignoring strays', () => {
    const clicks = [0, 0.75, 1.5, 2.25];
    expect(estimateOffset(clicks, [0.05, 0.81, 1.54, 2.3, 1.1])).toBeCloseTo(0.05, 2);
    expect(estimateOffset(clicks, [0.05])).toBeNull();
  });
});

describe('sequencer', () => {
  it('maps the audio clock to beats and back', () => {
    const c = new SongClock();
    c.set(10, 0.5);
    expect(c.beatAt(11)).toBe(2);
    expect(c.timeAt(-4)).toBe(8);
    c.delay(1);
    expect(c.beatAt(11)).toBe(0);
  });
  it('hands out each event once, in order', () => {
    const cur = new EventCursor([{ beat: -4 }, { beat: 0 }, { beat: 1 }, { beat: 2 }]);
    cur.seek(-4);
    const got: number[] = [];
    cur.pull(0.5, (e) => got.push(e.beat));
    cur.pull(0.5, (e) => got.push(e.beat));
    cur.pull(5, (e) => got.push(e.beat));
    expect(got).toEqual([-4, 0, 1, 2]);
    expect(cur.done).toBe(true);
  });
});

describe('bandmate', () => {
  it('calls are two bars of degrees on its instrument', () => {
    const c = new Bandmate().call(4);
    expect(c.length).toBeGreaterThanOrEqual(3);
    for (const n of c) {
      expect(n.beat).toBeGreaterThanOrEqual(16);
      expect(n.beat).toBeLessThan(24);
      expect(n.degree).toBeGreaterThanOrEqual(0);
    }
  });
  it('gets busier when you answer well, simpler when you struggle', () => {
    const b = new Bandmate();
    const n0 = b.call(0).length;
    b.report(1);
    b.report(1);
    expect(b.level).toBe(2);
    expect(b.call(0).length).toBeGreaterThanOrEqual(n0);
    b.report(0.2);
    expect(b.level).toBe(1);
  });
  it('your answer is its call, two bars later', () => {
    const call = new Bandmate().call(4);
    expect(Bandmate.answer(call).map((n) => n.beat - 8)).toEqual(call.map((n) => n.beat));
  });
  it('echoes your own phrase back once, quantised, when you played enough', () => {
    const b = new Bandmate();
    for (const [beat, d] of [[8.04, 0], [9.0, 2], [10.52, 4], [11.0, 2]]) b.hear({ beat, degree: d, vel: 0.8 });
    const e = b.echo(8, 16, 4)!;
    expect(e.map((n) => n.beat)).toEqual([16, 17, 18.5, 19]);
    expect(e.map((n) => n.degree)).toEqual([0, 2, 4, 2]);
    expect(b.echo(8, 16, 8)).toBeNull();
    expect(new Bandmate().echo(0, 8, 0)).toBeNull();
  });
  it('notices when you have gone quiet', () => {
    const b = new Bandmate();
    b.hear({ beat: 8, degree: 0, vel: 0.8 });
    expect(b.idle(8 + 16)).toBe(true);
    expect(b.idle(8 + 4)).toBe(false);
  });
});
