import { describe, expect, it } from 'vitest';
import { PIANO_BLACK, PIANO_CHORD, instZones, pianoBlacks, scaleById, scaleMidi } from '../src/kit/shelf.js';
import { SONG_TRACKS } from '../src/play/build.js';
import { EASY_GAP, SCORES, beatKey, chordAt, chordMidi, keyOf, parseChords, parseMelody, pianoKey, scoreBed, scoreChart, scoreParts, zoneOf, type Level, type Score } from '../src/songs/score.js';
import { TUNES } from '../src/songs/tunes.js';

/** The songs (the lessons have their own test). */
const SONGS = SCORES.filter((x) => !x.tune.lesson);
const INSTS = ['drums', 'piano', 'marimba', 'guitar', 'congas', 'handpan'];
const LEVELS: Level[] = ['easy', 'normal', 'hard'];
const chart = (s: Score, inst: string, level: Level) => scoreChart(s, inst, level, 0, 1e9, s.solos, { tom: true });
/** Every zone each instrument has (the kit's pads by name; the piano's black keys from PIANO_BLACK). */
const ZONES: Record<string, (z: string) => boolean> = {
  drums: (z) => ['kick', 'snare', 'hat', 'tom'].includes(z),
  piano: (z) => (Number(z) >= 0 && Number(z) < 15) || Number(z) === PIANO_CHORD || (Number(z) >= PIANO_BLACK && Number(z) < PIANO_BLACK + 10),
  marimba: (z) => Number(z) >= 0 && Number(z) < 8,
  handpan: (z) => Number(z) >= 0 && Number(z) < 9,
  guitar: (z) => ['0', '1', '2', '9'].includes(z),
  congas: (z) => Number(z) >= 0 && Number(z) < 4,
};
const NAMES = 'C C# D D# E F F# G G# A A# B'.split(' ');
/** The melody's first notes by name (sharps), to check the transcriptions against the tunes as people know them. */
const names = (s: Score, n: number) => s.melody.slice(0, n).map((x) => NAMES[(((scaleMidi(60 + s.keyPc, scaleById(s.scale), x.degree) + x.acc) % 12) + 12) % 12]).join(' ');
const by = (id: string) => SCORES.find((s) => s.tune.id === id)!;
/** The pitch a piano zone plays, in the layout the scores use (root 60). */
function pianoMidi(scale: string, zone: number): number {
  const zones = instZones('piano', 60, scaleById(scale));
  return zone >= PIANO_BLACK ? zones[pianoBlacks(zones)[zone - PIANO_BLACK].a].midi + 1 : zones[zone].midi;
}

describe('the songs: classics with modern grooves, and originals', () => {
  it('a library of about twenty, easiest first, the classics and the originals', () => {
    expect(SCORES.length).toBeGreaterThanOrEqual(18);
    expect(SONGS.filter((s) => s.tune.original).length).toBe(6);
    expect(new Set(TUNES.map((t) => t.id)).size).toBe(TUNES.length);
    expect(SONG_TRACKS.map((t) => t.id)).toEqual(SCORES.map((s) => s.tune.id));
    for (let i = 1; i < SONGS.length; i++) expect(SONGS[i].rating).toBeGreaterThanOrEqual(SONGS[i - 1].rating);
    // each difficulty has songs in it, in order
    const d = SCORES.map((s) => s.difficulty);
    expect(d[0]).toBe('Easy');
    expect(d[d.length - 1]).toBe('Hard');
    expect(d.includes('Medium')).toBe(true);
    // no nursery rhymes
    for (const gone of ['mary', 'twinkle', 'jingle-bells', 'oh-susanna']) expect(TUNES.some((t) => t.id === gone)).toBe(false);
  });

  it('reads ABC: the key signature, accidentals to the end of the bar, ties, triplets; a bar that does not add up is refused', () => {
    // (in G, F is sharp; a natural holds to the bar line; a tie joins; a triplet takes two beats' room in three)
    const m = parseMelody('F2 =F2 F2 c2- | c2 (3d e f z2 z2', 'G');
    expect(m.notes.map((n) => [n.degree, n.acc, n.len])).toEqual([
      [-1, 0, 1],
      [-1, -1, 1],
      [-1, -1, 1],
      [3, 0, 2],
      [4, 0, 1 / 3],
      [5, 0, 1 / 3],
      [6, 0, 1 / 3],
    ]);
    expect(keyOf('Bm').sig).toEqual([1, 0, 0, 1, 0, 0, 0]);
    expect(() => parseMelody('C2 D2 E2 | C2', 'C')).toThrow(/beats/);
    expect(() => parseMelody('C2 D2 E2 F2 | C2 Q2 C4', 'C')).toThrow();
    expect(() => parseChords('C | H', 'C')).toThrow();
    for (const s of SONGS) {
      expect(s.chords[s.chords.length - 1].beat + s.chords[s.chords.length - 1].len).toBe(s.bars * s.meter);
      expect(s.bars).toBeGreaterThanOrEqual(8);
    }
  });

  it('the tunes as people know them', () => {
    expect(names(by('ode-to-joy'), 15)).toBe('F# F# G A A G F# E D D E F# F# E E');
    expect(names(by('canon'), 8)).toBe('F# E D C# B A B C#');
    expect(names(by('fur-elise'), 9)).toBe('E D# E D# E B D C A');
    expect(names(by('turkish-march'), 9)).toBe('B A G# A C D C B C');
    expect(names(by('mountain-king'), 13)).toBe('B C# D E F# D F# F C# F E C E');
    expect(names(by('entertainer'), 8)).toBe('D D# E C E C E C');
    expect(names(by('korobeiniki'), 12)).toBe('B F# G A G F# E E G B A G');
    expect(names(by('william-tell'), 11)).toBe('A A A A A A A A D E F#');
    expect(names(by('amazing-grace'), 9)).toBe('D G B G B A G E D');
    expect(names(by('scarborough-fair'), 8)).toBe('E E B B F# G F# E');
    expect(names(by('can-can'), 11)).toBe('C D F E D G G G A E F');
    expect(names(by('drunken-sailor'), 12)).toBe('A A A A A A A D F A G G');
    expect(names(by('saints'), 8)).toBe('C E F G C E F G');
    // rhythm too: Ode to Joy's dotted fourth bar; Für Elise's sixteenths as triplets; the Entertainer's tied C
    expect(by('ode-to-joy').melody.slice(12, 15).map((n) => n.len)).toEqual([1.5, 0.5, 2]);
    expect(by('fur-elise').melody[2].len).toBeCloseTo(1 / 3);
    expect(by('entertainer').melody[3].len).toBe(1);
  });

  it('every note is on the keyboard; a note outside the scale is a black key, at its own pitch', () => {
    for (const s of SONGS) {
      for (const n of s.melody) {
        const z = pianoKey(s.scale, n.degree, n.acc, false);
        expect(z, `${s.tune.id} ${n.degree} ${n.acc}`).toBeGreaterThanOrEqual(0);
        expect(pianoMidi(s.scale, z)).toBe(scaleMidi(60, scaleById(s.scale), n.degree) + n.acc);
        if (n.acc !== 0) expect(z).toBeGreaterThanOrEqual(PIANO_BLACK);
        expect(Math.abs(n.acc)).toBeLessThanOrEqual(1);
      }
    }
    // Für Elise's D sharp: a black key on the piano
    const fe = by('fur-elise');
    expect(chart(fe, 'piano', 'normal').notes.filter((n) => Number(n.key.slice(6)) >= PIANO_BLACK).length).toBeGreaterThan(8);
  });

  it('every song ends on its home chord, its last note that chord’s root; a solo between each time through', () => {
    for (const s of SONGS) {
      const last = s.melody[s.melody.length - 1];
      expect(((last.degree % 7) + 7) % 7, s.tune.id).toBe(s.home.degree);
      expect(last.acc).toBe(0);
      expect(s.end).toBe(s.starts[s.starts.length - 1] + last.beat);
      expect(chordAt(s, s.end + 1)).toBe(s.home);
      expect(s.solos.length).toBe(s.tune.passes - 1);
      expect(s.solos.length).toBeGreaterThanOrEqual(1);
      for (const [a, z] of s.solos) {
        expect(z - a).toBeGreaterThanOrEqual(3);
        expect(chordAt(s, a + 1)).toBe(s.soloChord);
      }
      // 40 seconds to a minute and a half or so
      const secs = (s.end * 60) / s.tune.bpm;
      expect(secs, s.tune.id).toBeGreaterThan(40);
      expect(secs, s.tune.id).toBeLessThan(100);
    }
  });

  it('a part for every instrument at every level, on zones it has: two notes at once at most, never two on one zone', () => {
    for (const s of SONGS)
      for (const inst of INSTS)
        for (const lv of LEVELS) {
          const c = chart(s, inst, lv);
          expect(c.notes.length, `${s.tune.id} ${inst} ${lv}`).toBeGreaterThan(16);
          for (const n of c.notes) {
            const [on, z] = n.key.split(':');
            expect(on === inst || (inst === 'drums' && on === 'kit'), n.key).toBe(true);
            expect(ZONES[inst](z), `${s.tune.id} ${inst} ${n.key}`).toBe(true);
            expect(n.beat).toBeLessThan(s.end);
            expect(s.solos.some(([a, b]) => n.beat >= a && n.beat < b)).toBe(false);
          }
          const at = new Map<number, string[]>();
          for (const n of c.notes) at.set(beatKey(n.beat), [...(at.get(beatKey(n.beat)) ?? []), n.key]);
          for (const keys of at.values()) {
            expect(keys.length).toBeLessThanOrEqual(2);
            expect(new Set(keys).size).toBe(keys.length);
          }
          for (let i = 1; i < c.notes.length; i++) expect(c.notes[i].beat).toBeGreaterThanOrEqual(c.notes[i - 1].beat);
        }
  });

  it('Easy is never busier than Normal, nor Normal than Hard; Easy is never too quick for a beginner', () => {
    for (const s of SONGS)
      for (const inst of INSTS) {
        const [e, n, h] = LEVELS.map((lv) => chart(s, inst, lv).notes);
        expect(e.length, `${s.tune.id} ${inst}`).toBeLessThanOrEqual(n.length);
        expect(n.length, `${s.tune.id} ${inst}`).toBeLessThanOrEqual(h.length);
        const beats = [...new Set(e.map((x) => beatKey(x.beat)))].sort((a, b) => a - b);
        for (let i = 1; i < beats.length; i++) expect(((beats[i] - beats[i - 1]) / 24) * (60 / s.tune.bpm), `${s.tune.id} ${inst}`).toBeGreaterThanOrEqual(EASY_GAP - 1e-3);
      }
  });

  it('the melody on Easy is its notes on the strong beats; Normal the whole tune; Hard adds the chord key on the piano', () => {
    const s = by('ode-to-joy');
    expect(chart(s, 'piano', 'easy').notes.every((n) => n.beat % 2 === 0)).toBe(true);
    // (every note of each time through but the last, which is the last hit)
    expect(chart(s, 'piano', 'normal').notes.length).toBe(s.melody.length * s.tune.passes - 1);
    expect(chart(s, 'piano', 'hard').notes.filter((n) => n.key === `piano:${PIANO_CHORD}`).length).toBeGreaterThan(20);
    // the drums: Easy kick and snare, Normal the hat too, Hard a fill into every phrase
    expect(new Set(chart(s, 'drums', 'easy').notes.map((n) => n.key))).toEqual(new Set(['kit:kick', 'kit:snare']));
    expect(new Set(chart(s, 'drums', 'normal').notes.map((n) => n.key))).toEqual(new Set(['kit:kick', 'kit:snare', 'kit:hat']));
    expect(chart(s, 'drums', 'hard').notes.some((n) => n.key === 'kit:tom')).toBe(true);
    // the guitar changes chord on the neck from Normal (I, IV and V on their own positions)
    expect(chart(s, 'guitar', 'easy').notes.every((n) => n.key === 'guitar:9')).toBe(true);
    expect(new Set(chart(s, 'guitar', 'normal').notes.filter((n) => n.key !== 'guitar:9').map((n) => n.key))).toEqual(new Set(['guitar:0', 'guitar:2']));
  });

  it("the band plays the tune's notes you don't, the ones outside the marimba's scale included", () => {
    for (const s of SONGS) {
      const keys = scoreParts(s).find((p) => p.name === 'KEYS')!.notes;
      const tune = new Set(keys.map((n) => beatKey(n.beat)));
      for (const inst of ['piano', 'marimba'])
        for (const lv of LEVELS) {
          const c = chart(s, inst, lv);
          const mine = c.cover.get('band:melody') ?? new Set<number>();
          for (const b of mine) expect(tune.has(b)).toBe(true);
          const melodic = c.notes.filter((n) => n.key !== `piano:${PIANO_CHORD}`);
          expect(new Set(melodic.map((n) => beatKey(n.beat)))).toEqual(mine);
        }
      // the marimba has no notes outside the scale: those stay the band's
      const outside = keys.filter((n, i) => {
        const m = s.melody[i % s.melody.length];
        return m && m.acc !== 0;
      });
      const marimba = chart(s, 'marimba', 'normal').cover.get('band:melody') ?? new Set<number>();
      for (const n of outside) expect(marimba.has(beatKey(n.beat))).toBe(false);
      expect(chart(s, 'drums', 'easy').live).toEqual(['kit:kick', 'kit:snare', 'kit:hat']);
      expect(chart(s, 'congas', 'easy').live).toEqual(['congas:0']);
    }
  });

  it('the band: its melody at the tune’s pitch, chromatic notes too; its bass on each chord; the kit through the solos', () => {
    const fe = by('fur-elise');
    const keys = scoreParts(fe).find((p) => p.name === 'KEYS')!.notes;
    // (Für Elise in A minor: E5 D#5 E5 D#5, a pluck an octave under, which the band's pluck sounds an octave up)
    expect(keys.slice(0, 4).map((n) => n.midi! + 12)).toEqual([76, 75, 76, 75]);
    const s = by('ode-to-joy');
    const parts = scoreParts(s);
    expect(parts.find((p) => p.name === 'BASS')!.notes[0]).toMatchObject({ beat: 0, midi: 38 });
    const [a, z] = s.solos[0];
    expect(parts.find((p) => p.name === 'KICK')!.notes.some((n) => n.beat >= a && n.beat < z)).toBe(true);
    expect(parts.find((p) => p.name === 'KEYS')!.notes.some((n) => n.beat >= a && n.beat < z)).toBe(false);
    const bed = scoreBed(s);
    expect(bed.filter((e) => e.voice === 'shaker').map((e) => e.beat)).toEqual([-4, -3, -2, -1]);
    expect(bed.find((e) => e.voice === 'chord' && e.beat === a)).toMatchObject({ midi: chordMidi(s.soloChord, s.keyPc), minor: false });
    // a song in three keeps its bars of three: Amazing Grace's chords change on the bar
    const ag = by('amazing-grace');
    expect(ag.meter).toBe(3);
    expect(chordAt(ag, 9).semis).toBe(5);
  });

  it('the marimba plays every note of the scale it can reach, folding the rest an octave in', () => {
    for (const s of SONGS)
      for (const n of s.melody) if (n.acc === 0) expect(zoneOf('marimba', s.scale, n.degree), s.tune.id).toBeGreaterThanOrEqual(0);
  });

  it('names and tile lines fit their tiles', () => {
    for (const s of SONGS) {
      expect(s.tune.name.length).toBeLessThanOrEqual(16);
      expect(`${s.difficulty} · ${s.tune.by}`.length, s.tune.id).toBeLessThanOrEqual(18);
    }
  });

  it('a lesson for every instrument: each step its own notes, on that instrument only, slow enough to learn', () => {
    const lessons = SCORES.filter((x) => x.tune.lesson);
    expect(lessons.map((x) => x.tune.lesson!.inst).sort()).toEqual([...INSTS].sort());
    for (const s of lessons) {
      const ls = s.tune.lesson!;
      const c = scoreChart(s, ls.inst, 'hard', 0, s.end + 1, s.solos);
      const prefix = ls.inst === 'drums' ? 'kit:' : `${ls.inst}:`;
      expect(c.notes.every((n) => n.key.startsWith(prefix)), s.tune.id).toBe(true);
      ls.steps.forEach((st, i) => {
        const a = s.starts[0] + st.bar * s.meter;
        const b = i + 1 < ls.steps.length ? s.starts[0] + ls.steps[i + 1].bar * s.meter : Infinity;
        const mine = c.notes.filter((n) => n.beat >= a && n.beat < b);
        expect(mine.length, `${s.tune.id} step ${i}`).toBeGreaterThanOrEqual(3);
        if (st.only) expect(mine.every((n) => st.only!.includes(n.key)), `${s.tune.id} step ${i}`).toBe(true);
        expect(st.say.length).toBeLessThanOrEqual(52);
      });
      expect(s.tune.name.length).toBeLessThanOrEqual(16);
      expect(s.tune.bpm).toBeLessThanOrEqual(84);
    }
  });
});
