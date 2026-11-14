import { describe, expect, it } from 'vitest';
import { PIANO_CHORD, scaleById, scaleMidi } from '../src/kit/shelf.js';
import { SONG_TRACKS } from '../src/play/build.js';
import { SCORES, beatKey, chordAt, chordMidi, melodyRoot, parseChords, parseMelody, scoreBed, scoreChart, scoreParts, zoneOf, type Level, type Score } from '../src/songs/score.js';
import { TUNES } from '../src/songs/tunes.js';

const INSTS = ['drums', 'piano', 'marimba', 'guitar', 'congas', 'handpan'];
const LEVELS: Level[] = ['easy', 'normal', 'hard'];
const chart = (s: Score, inst: string, level: Level) => scoreChart(s, inst, level, 0, 1e9, s.solos, { tom: true });
/** Every zone each instrument has (the kit's pads by name). */
const ZONES: Record<string, (z: string) => boolean> = {
  drums: (z) => ['kick', 'snare', 'hat', 'tom'].includes(z),
  piano: (z) => (Number(z) >= 0 && Number(z) < 15) || Number(z) === PIANO_CHORD,
  marimba: (z) => Number(z) >= 0 && Number(z) < 8,
  handpan: (z) => Number(z) >= 0 && Number(z) < 9,
  guitar: (z) => ['0', '1', '2', '9'].includes(z),
  congas: (z) => Number(z) >= 0 && Number(z) < 4,
};
/** The melody's notes as note names in C (to check the transcriptions against the tunes as people know them). */
const names = (s: Score, n: number) => s.melody.slice(0, n).map((x) => 'CDEFGAB'[((x.degree % 7) + 7) % 7]).join(' ');

describe('the songs: familiar tunes, written out', () => {
  it('eight of them, easiest first, each opening after the one before', () => {
    expect(TUNES.map((t) => t.name)).toEqual(["Mary's Lamb", 'Twinkle Twinkle', 'Ode to Joy', 'When the Saints', 'Jingle Bells', 'Oh! Susanna', 'Drunken Sailor', 'Can-can']);
    expect(SONG_TRACKS.map((t) => t.id)).toEqual(TUNES.map((t) => t.id));
    expect(new Set(TUNES.map((t) => t.id)).size).toBe(TUNES.length);
    // quicker and busier as you go
    const busy = SCORES.map((s) => (chart(s, 'piano', 'normal').notes.length / s.end) * s.tune.bpm);
    expect(busy[busy.length - 1]).toBeGreaterThan(busy[0] * 2);
  });

  it('every bar holds four beats and has its chords; a bar that does not is refused', () => {
    for (const s of SCORES) {
      expect(s.chords[s.chords.length - 1].beat + s.chords[s.chords.length - 1].len).toBe(s.bars * 4);
      expect(s.bars).toBeGreaterThanOrEqual(8);
    }
    expect(() => parseMelody('C2 D2 E2 | C2', 0)).toThrow(/beats/);
    expect(() => parseMelody('C2 ^D2 E2 F2', 0)).toThrow();
    expect(() => parseChords('C | H', 0, scaleById('major').steps)).toThrow();
  });

  it('the tunes as people know them', () => {
    const by = (id: string) => SCORES.find((s) => s.tune.id === id)!;
    expect(names(by('mary'), 13)).toBe('E D C D E E E D D D E G G');
    expect(names(by('twinkle'), 14)).toBe('C C G G A A G F F E E D D C');
    expect(names(by('ode-to-joy'), 15)).toBe('E E F G G F E D C C D E E D D');
    expect(names(by('saints'), 8)).toBe('C E F G C E F G');
    expect(names(by('jingle-bells'), 11)).toBe('E E E E E E E G C D E');
    expect(names(by('oh-susanna'), 10)).toBe('C D E G G A G E C D');
    // (Dorian on D: the white keys from D, so its sixth is B, not B flat)
    expect(names(by('drunken-sailor'), 12)).toBe('A A A A A A A D F A G G');
    expect(by('drunken-sailor').melody.some((n) => n.degree === 6)).toBe(true);
    expect(names(by('can-can'), 11)).toBe('C D F E D G G G A E F');
    // rhythm too: Ode to Joy's dotted fourth bar, Jingle Bells' long fourth
    expect(by('ode-to-joy').melody.slice(12, 15).map((n) => n.len)).toEqual([1.5, 0.5, 2]);
    expect(by('jingle-bells').melody[10].len).toBe(4);
  });

  it('every note is in its scale and in reach of the piano; the marimba misses at most a few (the band plays those)', () => {
    for (const s of SCORES) {
      const sc = scaleById(s.tune.scale);
      for (const n of s.melody) {
        const midi = scaleMidi(melodyRoot(s.tune.key), sc, n.degree);
        expect(sc.steps).toContain((((midi - s.tune.key) % 12) + 12) % 12);
        expect(zoneOf('piano', s.tune.scale, n.degree)).toBeGreaterThanOrEqual(0);
      }
      const out = s.melody.filter((n) => zoneOf('marimba', s.tune.scale, n.degree) < 0);
      expect(out.length).toBeLessThanOrEqual(2);
    }
  });

  it('every song ends on its home chord, and its last note is that chord', () => {
    for (const s of SCORES) {
      const last = s.melody[s.melody.length - 1];
      expect((((last.degree % 7) + 7) % 7)).toBe(s.home.degree);
      expect(s.end).toBe(s.starts[s.starts.length - 1] + last.beat);
      expect(chordAt(s, s.end + 1)).toBe(s.home);
      // a solo bar between each time through, on its own chord
      expect(s.solos.length).toBe(s.tune.passes - 1);
      for (const [a, z] of s.solos) {
        expect(z - a).toBe(4);
        expect(chordAt(s, a + 1)).toBe(s.soloChord);
      }
      // 40 seconds to a minute and a quarter
      const secs = (s.end * 60) / s.tune.bpm;
      expect(secs).toBeGreaterThan(40);
      expect(secs).toBeLessThan(80);
    }
  });

  it('a part for every instrument at every level, on zones it has: two notes at once at most, never two on one zone', () => {
    for (const s of SCORES)
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
    for (const s of SCORES)
      for (const inst of INSTS) {
        const [e, n, h] = LEVELS.map((lv) => chart(s, inst, lv).notes);
        expect(e.length, `${s.tune.id} ${inst}`).toBeLessThanOrEqual(n.length);
        expect(n.length, `${s.tune.id} ${inst}`).toBeLessThanOrEqual(h.length);
        // (at least 0.4 s from one Easy note to the next)
        const beats = [...new Set(e.map((x) => beatKey(x.beat)))].sort((a, b) => a - b);
        for (let i = 1; i < beats.length; i++) expect(((beats[i] - beats[i - 1]) / 24) * (60 / s.tune.bpm), `${s.tune.id} ${inst}`).toBeGreaterThanOrEqual(0.399);
      }
  });

  it('the melody on Easy is its notes on 1 and 3; Normal the whole tune; Hard adds the chord key on the piano', () => {
    const s = SCORES[2];
    const easy = chart(s, 'piano', 'easy').notes;
    expect(easy.every((n) => n.beat % 2 === 0)).toBe(true);
    const normal = chart(s, 'piano', 'normal').notes;
    // (every note of each time through but the last, which is the last hit)
    expect(normal.length).toBe(s.melody.length * s.tune.passes - 1);
    const hard = chart(s, 'piano', 'hard').notes;
    expect(hard.filter((n) => n.key === `piano:${PIANO_CHORD}`).length).toBeGreaterThan(20);
    // the drums: Easy kick and snare, Normal the hat too, Hard a fill into every fourth bar
    expect(new Set(chart(s, 'drums', 'easy').notes.map((n) => n.key))).toEqual(new Set(['kit:kick', 'kit:snare']));
    expect(new Set(chart(s, 'drums', 'normal').notes.map((n) => n.key))).toEqual(new Set(['kit:kick', 'kit:snare', 'kit:hat']));
    expect(chart(s, 'drums', 'hard').notes.some((n) => n.key === 'kit:tom')).toBe(true);
    // the guitar changes chord on the neck from Normal (I, IV and V on their own positions)
    expect(chart(s, 'guitar', 'easy').notes.every((n) => n.key === 'guitar:9')).toBe(true);
    expect(new Set(chart(s, 'guitar', 'normal').notes.filter((n) => n.key !== 'guitar:9').map((n) => n.key))).toEqual(new Set(['guitar:0', 'guitar:2']));
  });

  it("the band plays the tune's notes you don't: yours are left out, the rest go on", () => {
    for (const s of SCORES) {
      const keys = scoreParts(s).find((p) => p.name === 'KEYS')!.notes;
      for (const inst of ['piano', 'marimba'])
        for (const lv of LEVELS) {
          const c = chart(s, inst, lv);
          const mine = c.cover.get('band:melody')!;
          // each note of yours is a note of the tune, and the band leaves exactly those out
          const tune = new Set(keys.map((n) => beatKey(n.beat)));
          for (const b of mine) expect(tune.has(b)).toBe(true);
          const melodic = c.notes.filter((n) => n.key !== `piano:${PIANO_CHORD}`);
          expect(new Set(melodic.map((n) => beatKey(n.beat)))).toEqual(mine);
        }
      // the drums and the congas are wholly yours when they're out
      expect(chart(s, 'drums', 'easy').live).toEqual(['kit:kick', 'kit:snare', 'kit:hat']);
      expect(chart(s, 'congas', 'easy').live).toEqual(['congas:0']);
    }
  });

  it('the band: its melody is the tune at its pitch, its bass on each chord, its chords held through the solos', () => {
    const s = SCORES[0];
    const parts = scoreParts(s);
    const keys = parts.find((p) => p.name === 'KEYS')!.notes;
    // (Mary in C: E D C D, a pluck an octave under, which the band's pluck sounds an octave up)
    expect(keys.slice(0, 4).map((n) => n.midi! + 12)).toEqual([76, 74, 72, 74]);
    const bass = parts.find((p) => p.name === 'BASS')!.notes;
    expect(bass[0]).toMatchObject({ beat: 0, midi: 36 });
    // the kit keeps time in the solo; nothing else does
    expect(parts.find((p) => p.name === 'KICK')!.notes.some((n) => n.beat >= 32 && n.beat < 36)).toBe(true);
    expect(keys.some((n) => n.beat >= 32 && n.beat < 36)).toBe(false);
    const bed = scoreBed(s);
    expect(bed.filter((e) => e.voice === 'shaker').map((e) => e.beat)).toEqual([-4, -3, -2, -1]);
    expect(bed.find((e) => e.voice === 'chord' && e.beat === 32)).toMatchObject({ midi: 67, minor: false });
    expect(bed.find((e) => e.voice === 'chord' && e.beat === 8)).toMatchObject({ midi: chordMidi(chordAt(s, 8), 0) });
  });

  it('names fit their tiles', () => {
    for (const t of TUNES) {
      expect(t.name.length).toBeLessThanOrEqual(16);
      expect(t.by.length).toBeLessThanOrEqual(18);
      expect(`After ${t.short}`.length).toBeLessThanOrEqual(18);
    }
  });
});
