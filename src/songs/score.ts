/**
 * A song written out bar by bar (src/songs/tunes.ts): its melody, its chords, and from them its bass line and a drum
 * groove in its style. A performance plays the tune through `passes` times with a one-bar solo between each, and
 * ends on its last note: the band holds the chord before it and waits for you (the last hit).
 *
 * From the score come what the band plays (`scoreParts`, `scoreBed`) and what you play on each instrument at each
 * level (`scoreChart`): the melody on the piano and the marimba, the chords on the guitar, the groove on the drums,
 * percussion on the congas, the bass (and on Hard the melody's strong notes) on the handpan. Every note is on a
 * zone the instrument has; two at once at most, never two on one zone. Pure, unit-tested.
 */
import { PIANO_CHORD, instZones, scaleById, scaleMidi, type InstId } from '../kit/shelf.js';
import type { BedEvent } from './chart.js';
import { TUNES, type Style, type Tune } from './tunes.js';

export type Level = 'easy' | 'normal' | 'hard';

/** A melody note: when in the tune (beats from its first bar), how long, and its scale degree (0 = the tonic). */
export interface MelNote {
  beat: number;
  len: number;
  degree: number;
}

/** A chord: from when, for how long; its root as a scale degree and in semitones above the tonic; minor or not. */
export interface Chord {
  beat: number;
  len: number;
  degree: number;
  semis: number;
  minor: boolean;
  /** Its quality isn't the scale's own on that degree (a D7 in C): only its root and fifth are safe to add. */
  borrowed: boolean;
}

export interface Score {
  tune: Tune;
  /** Bars in one pass. */
  bars: number;
  /** One pass of the melody and its chords. */
  melody: MelNote[];
  chords: Chord[];
  /** Where each pass starts (beats from the song's first bar). */
  starts: number[];
  /** The solos: a bar between passes. */
  solos: [number, number][];
  /** The solo bar's chord. */
  soloChord: Chord;
  /** The home chord (the last one). */
  home: Chord;
  /** The last note's beat: the band holds there and waits for your last hit. */
  end: number;
  /** The last time through (the progress bar's second half). */
  last: [number, number];
}

const LETTERS = 'CDEFGAB';

/** The melody's notes, and how many bars (each must hold exactly four beats). `tonic`: the letter of degree 0. */
export function parseMelody(text: string, tonic: number): { notes: MelNote[]; bars: number } {
  const notes: MelNote[] = [];
  const bars = text.split('|');
  bars.forEach((bar, b) => {
    let at = 0;
    const re = /([A-Ga-gz])([,']*)(\d*)(?:\/(\d+))?/g;
    const body = bar.replace(/\s+/g, '');
    let used = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body))) {
      if (m.index !== used) throw new Error(`bar ${b + 1}: can't read "${body.slice(used, m.index)}"`);
      used = m.index + m[0].length;
      const len = ((m[3] ? Number(m[3]) : 1) / (m[4] ? Number(m[4]) : 1)) / 2;
      if (m[1] !== 'z') {
        const up = m[1] === m[1].toLowerCase() ? 1 : 0;
        const oct = up + (m[2].match(/'/g)?.length ?? 0) - (m[2].match(/,/g)?.length ?? 0);
        const degree = LETTERS.indexOf(m[1].toUpperCase()) - tonic + 7 * oct;
        notes.push({ beat: b * 4 + at, len, degree });
      }
      at += len;
    }
    if (used !== body.length) throw new Error(`bar ${b + 1}: can't read "${body.slice(used)}"`);
    if (Math.abs(at - 4) > 1e-6) throw new Error(`bar ${b + 1} has ${at} beats, not 4`);
  });
  return { notes, bars: bars.length };
}

/** A chord name (C, Dm, G7, D7) as degrees from the tonic letter, in the scale. */
function chordOf(name: string, tonic: number, steps: readonly number[], beat: number, len: number): Chord {
  const m = /^([A-G])(m?)(7?)$/.exec(name);
  if (!m) throw new Error(`can't read chord "${name}"`);
  const degree = (LETTERS.indexOf(m[1]) - tonic + 7) % 7;
  const semis = steps[degree];
  const minor = m[2] === 'm';
  // the scale's own triad on that degree: minor when its third is three semitones
  const third = (steps[(degree + 2) % 7] - semis + 12) % 12;
  return { beat, len, degree, semis, minor, borrowed: minor !== (third === 3) };
}

/** The chords, bar by bar (one, two or four to a bar; `.` keeps the one before). */
export function parseChords(text: string, tonic: number, steps: readonly number[]): Chord[] {
  const out: Chord[] = [];
  text.split('|').forEach((bar, b) => {
    const names = bar.trim().split(/\s+/);
    if (![1, 2, 4].includes(names.length)) throw new Error(`bar ${b + 1}: ${names.length} chords`);
    const each = 4 / names.length;
    names.forEach((n, k) => {
      const beat = b * 4 + k * each;
      const prev = out[out.length - 1];
      if (n === '.') {
        if (!prev || k === 0) throw new Error(`bar ${b + 1} starts with "."`);
        prev.len += each;
        return;
      }
      out.push(chordOf(n, tonic, steps, beat, each));
    });
  });
  return out;
}

/** A tune, laid out as a performance. */
export function scoreOf(tune: Tune): Score {
  const tonic = tune.scale === 'minor' ? 5 : 0;
  const steps = scaleById(tune.scale).steps;
  const { notes, bars } = parseMelody(tune.melody, tonic);
  const chords = parseChords(tune.chords, tonic, steps);
  const span = bars * 4;
  if (chords.length && chords[chords.length - 1].beat + chords[chords.length - 1].len !== span) throw new Error(`${tune.id}: ${chords.length} chords for ${bars} bars`);
  const starts: number[] = [];
  const solos: [number, number][] = [];
  for (let p = 0; p < tune.passes; p++) {
    starts.push(p * (span + 4));
    if (p > 0) solos.push([p * (span + 4) - 4, p * (span + 4)]);
  }
  const home = chords[chords.length - 1];
  const lastStart = starts[starts.length - 1];
  const end = lastStart + notes[notes.length - 1].beat;
  // the solo holds the five chord (major), unless the tune says otherwise
  const soloChord = tune.solo ? chordOf(tune.solo, tonic, steps, 0, 4) : { beat: 0, len: 4, degree: (home.degree + 4) % 7, semis: (home.semis + 7) % 12, minor: false, borrowed: false };
  return { tune, bars, melody: notes, chords, starts, solos, soloChord, home, end, last: [lastStart, end] };
}

export const SCORES: readonly Score[] = TUNES.map(scoreOf);

/** MIDI of the melody's tonic: where the piano's tune sits (its root between F4 and E5, as the room sets it). */
export function melodyRoot(key: number): number {
  return 65 + ((key + 7) % 12);
}

/** The chord sounding at song beat `b` (the solo's in a solo; the home chord before the start and after the end). */
export function chordAt(s: Score, b: number): Chord {
  if (b < 0 || b >= s.end) return s.home;
  for (const [a, z] of s.solos) if (b >= a && b < z) return s.soloChord;
  let p = s.starts.length - 1;
  while (p > 0 && s.starts[p] > b) p--;
  const t = b - s.starts[p];
  for (let i = s.chords.length - 1; i >= 0; i--) if (s.chords[i].beat <= t + 1e-6) return s.chords[i];
  return s.home;
}

/** A chord's root as MIDI in the octave from middle C, in key `key`. */
export function chordMidi(c: Chord, key: number): number {
  return 60 + ((key + c.semis) % 12);
}

// ------------------------------------------------------------------ the grooves

interface Groove {
  /** One bar of eighths each: `x` a hit, `X` an accent. Easy plays `kick` and `snare`; Normal adds `hat`. */
  kick: string;
  snare: string;
  hat: string;
  /** Hard (and the band's drummer). */
  hardKick: string;
  hardSnare: string;
  hardHat: string;
  /** The bass in a bar of one chord: `1` its root, `5` its fifth, per beat. */
  bass: string;
}

const GROOVES: Record<Style, Groove> = {
  // soft: boom on 1 and 3, the smack on 2 and 4
  lullaby: { kick: 'X...x...', snare: '..x...x.', hat: 'x.x.x.x.', hardKick: 'X...x.x.', hardSnare: '..x...x.', hardHat: 'xxxxxxxx', bass: '1.1.' },
  // a steady anthem: a kick that pushes into 3
  anthem: { kick: 'X...x...', snare: '..x...x.', hat: 'x.x.x.x.', hardKick: 'X..xx...', hardSnare: '..x...x.', hardHat: 'xxxxxxxx', bass: '1.5.' },
  // the street march: bass drum on 1 and 3, a snare that drags into the next beat
  march: { kick: 'X...x...', snare: '..x...x.', hat: 'x.x.x.x.', hardKick: 'X...x...', hardSnare: '..x..xx.', hardHat: 'x.x.x.x.', bass: '1.5.' },
  // sleigh bells on the eighths
  sleigh: { kick: 'X...x...', snare: '..x...x.', hat: 'x.x.x.x.', hardKick: 'X...x.x.', hardSnare: '..x...x.', hardHat: 'xxxxxxxx', bass: '1.5.' },
  // boom-chick: the hat on the off-beats
  polka: { kick: 'X...x...', snare: '..x...x.', hat: '.x.x.x.x', hardKick: 'X...x...', hardSnare: '..x...xx', hardHat: '.x.x.x.x', bass: '1.5.' },
  // stamp and clap
  shanty: { kick: 'X...x...', snare: '..x...x.', hat: 'x.x.x.x.', hardKick: 'X..xX...', hardSnare: '..x...x.', hardHat: 'x.x.x.x.', bass: '1.5.' },
  // the galop: oom on every beat, pah on every off-beat
  galop: { kick: 'X...x...', snare: '..x...x.', hat: 'x.x.x.x.', hardKick: 'X.x.X.x.', hardSnare: '.x.x.x.x', hardHat: 'x...x...', bass: '1515' },
};

/** The congas, a bar of eighths: 0/1 the low drum's middle and edge, 2/3 the high drum's. */
const CONGAS: Record<Level, string> = { easy: '0.3.0.3.', normal: '0.320.32', hard: '01320132' };

function bar(pattern: string): { at: number; vel: number; ch: string }[] {
  const out: { at: number; vel: number; ch: string }[] = [];
  for (let k = 0; k < pattern.length; k++) if (pattern[k] !== '.') out.push({ at: k / 2, vel: pattern[k] === 'X' ? 1 : 0.8, ch: pattern[k] });
  return out;
}

// ------------------------------------------------------------------ zones

const zoneCache = new Map<string, number[]>();
/** The zone of an instrument that plays scale degree `d` (−1: it has none). */
export function zoneOf(inst: 'piano' | 'marimba' | 'handpan', scale: string, d: number): number {
  const id = `${inst}:${scale}`;
  let degs = zoneCache.get(id);
  if (!degs) {
    degs = instZones(inst as InstId, 60, scaleById(scale)).map((z) => (z.i === PIANO_CHORD && inst === 'piano' ? -99 : z.degree));
    zoneCache.set(id, degs);
  }
  // (a note past either end of the instrument folds an octave in, as a player would take it)
  const i = degs.indexOf(d);
  if (i >= 0) return i;
  const lo = degs.indexOf(d - 7);
  return lo >= 0 ? lo : degs.indexOf(d + 7);
}

/** The handpan's note for a degree: its ding for the tonic in the bass, else the rim note of that name nearest it. */
function handpanZone(scale: string, d: number, bass: boolean): number {
  if (bass && ((d % 7) + 7) % 7 === 0) return 0;
  let best = -1;
  let bd = Infinity;
  for (let k = 4; k <= 11; k++) {
    if ((((k - d) % 7) + 7) % 7 !== 0) continue;
    const z = zoneOf('handpan', scale, k);
    if (z >= 0 && Math.abs(k - d) < bd) {
      bd = Math.abs(k - d);
      best = z;
    }
  }
  return best;
}

// ------------------------------------------------------------------ the song, laid out

/** Each pass's melody notes on the song's timeline (the last note, the last hit, left out). */
function melodyNotes(s: Score): MelNote[] {
  const out: MelNote[] = [];
  for (const st of s.starts) for (const n of s.melody) if (st + n.beat < s.end - 1e-6) out.push({ beat: st + n.beat, len: n.len, degree: n.degree });
  return out;
}

/** Each pass's chords on the song's timeline (to the end). */
function chordSpans(s: Score): Chord[] {
  const out: Chord[] = [];
  for (const st of s.starts) for (const c of s.chords) if (st + c.beat < s.end - 1e-6) out.push({ ...c, beat: st + c.beat, len: Math.min(c.len, s.end - st - c.beat) });
  return out;
}

/** Each bar of the passes (its first beat, and which bar of the tune it is), to the end. */
function passBars(s: Score): { beat: number; bar: number }[] {
  const out: { beat: number; bar: number }[] = [];
  for (const st of s.starts) for (let b = 0; b < s.bars; b++) if (st + b * 4 < s.end - 1e-6) out.push({ beat: st + b * 4, bar: b });
  return out;
}

export interface BandNote {
  beat: number;
  /** A voice key ('kit:kick', 'congas:0'), or for a band line its part's key. */
  key: string;
  vel: number;
  /** A band line (melody, bass): its MIDI note and length in beats. */
  midi?: number;
  len?: number;
}
export interface BandPart {
  name: 'KICK' | 'SNARE' | 'HAT' | 'PERC' | 'KEYS' | 'BASS';
  key: string;
  notes: BandNote[];
}

/**
 * The band's parts through the whole song: the drummer's groove (Hard's), the congas (Normal's), the melody (a
 * plucked lead, its MIDI an octave under where it sounds: the bed's pluck plays an octave up) and the bass on each
 * chord.
 */
export function scoreParts(s: Score): BandPart[] {
  const t = s.tune;
  const g = GROOVES[t.style];
  const sc = scaleById(t.scale);
  const bars = passBars(s).map((b) => b.beat);
  // (the drummer keeps time through the solos too: the game plays it soft there, unless the drums are yours)
  const kit = [...bars, ...s.solos.map(([a]) => a)].sort((a, b) => a - b);
  const drum = (pat: string, key: string, scale: number): BandNote[] => kit.flatMap((b) => bar(pat).map((h) => ({ beat: b + h.at, key, vel: h.vel * scale }))).filter((n) => n.beat < s.end - 1e-6);
  const perc = bars.flatMap((b) => bar(CONGAS.normal).map((h) => ({ beat: b + h.at, key: `congas:${h.ch}`, vel: 0.6 }))).filter((n) => n.beat < s.end - 1e-6);
  const root = melodyRoot(t.key);
  const keys = melodyNotes(s).map((n) => ({ beat: n.beat, key: 'band:melody', vel: n.beat % 2 === 0 ? 0.95 : 0.85, midi: scaleMidi(root, sc, n.degree) - 12, len: n.len }));
  const bass: BandNote[] = [];
  for (const c of chordSpans(s)) {
    const r = 36 + ((t.key + c.semis) % 12);
    for (let k = 0; k < c.len; k++) {
      const ch = c.len >= 4 ? g.bass[k] : k === 0 ? '1' : '.';
      if (ch === '1' || ch === '5') bass.push({ beat: c.beat + k, key: 'band:bass', vel: k === 0 ? 0.8 : 0.65, midi: r + (ch === '5' ? 7 : 0), len: 0.9 });
    }
  }
  return [
    { name: 'KICK', key: 'kit:kick', notes: drum(g.hardKick, 'kit:kick', 1) },
    { name: 'SNARE', key: 'kit:snare', notes: drum(g.hardSnare, 'kit:snare', 0.9) },
    { name: 'HAT', key: 'kit:hat', notes: drum(g.hardHat, 'kit:hat', 0.7) },
    { name: 'PERC', key: 'congas:0', notes: perc },
    { name: 'KEYS', key: 'band:melody', notes: keys },
    { name: 'BASS', key: 'band:bass', notes: bass },
  ];
}

/** The bed: the count-in (four clicks over the home chord), then the chords, a held one each, and each solo's. */
export function scoreBed(s: Score): BedEvent[] {
  const key = s.tune.key;
  const out: BedEvent[] = [];
  for (let k = 0; k < 4; k++) out.push({ beat: -4 + k, voice: 'shaker', midi: 0, len: 0.25, vel: k === 0 ? 0.9 : 0.6 });
  out.push({ beat: -4, voice: 'chord', midi: chordMidi(s.home, key), len: 4, vel: 0.3, minor: s.home.minor });
  for (const c of chordSpans(s)) out.push({ beat: c.beat, voice: 'chord', midi: chordMidi(c, key), len: c.len, vel: 0.4, minor: c.minor });
  for (const [a] of s.solos) out.push({ beat: a, voice: 'chord', midi: chordMidi(s.soloChord, key), len: 4, vel: 0.3, minor: s.soloChord.minor });
  return out.sort((a, b) => a.beat - b.beat);
}

// ------------------------------------------------------------------ your part

export interface ChartNote {
  beat: number;
  /** The zone it's on ('piano:7', 'kit:snare', 'guitar:9' a strum, 'guitar:1' a chord on the neck). */
  key: string;
  vel: number;
}

export interface ScoreChart {
  notes: ChartNote[];
  /** Band parts that are yours: the band leaves them out. */
  live: string[];
  /** Band parts you play some notes of: the band leaves out just those (beat keys: `beatKey`). */
  cover: Map<string, Set<number>>;
}

/** A beat as a whole number (to a 24th of a beat), for matching your notes with the band's. */
export function beatKey(b: number): number {
  return Math.round(b * 24);
}

/** On a strong beat (1 or 3 of the bar). */
const strong = (b: number) => Math.abs(b / 2 - Math.round(b / 2)) < 1e-6;

/** The guitar's three positions on the neck (its scale's I, IV and V): which one each chord goes on. */
function padsFor(s: Score): Map<Chord, number> {
  const sc = scaleById(s.tune.scale);
  const roots = sc.chords.map((c) => c[0] % 12);
  const out = new Map<Chord, number>();
  const taken = new Map<string, number>();
  let free = [0, 1, 2];
  const id = (c: Chord) => `${c.semis}${c.minor ? 'm' : ''}`;
  // the scale's own chords on their own positions first, then the others on what's left (the five's, when full)
  const all = [...s.chords, s.soloChord];
  for (const c of all) {
    const i = roots.indexOf(c.semis);
    if (i >= 0 && !c.borrowed && !taken.has(id(c))) {
      taken.set(id(c), i);
      free = free.filter((x) => x !== i);
    }
  }
  for (const c of all) {
    if (!taken.has(id(c))) {
      const p = free.length ? free.shift()! : 2;
      taken.set(id(c), p);
    }
    out.set(c, taken.get(id(c))!);
  }
  return out;
}

/**
 * What you play on an instrument at a level, from beat `from` to `to`, leaving out the solos (`fills`: anything
 * goes there). Notes are in time order; never two on one zone at once, never more than two at once.
 */
export function scoreChart(s: Score, inst: string, level: Level, from: number, to: number, fills: readonly (readonly [number, number])[], opts: { tom?: boolean } = {}): ScoreChart {
  const t = s.tune;
  const out: (ChartNote & { rank: number })[] = [];
  const cover = new Map<string, Set<number>>();
  const live: string[] = [];
  const g = GROOVES[t.style];
  const ok = (b: number) => b >= from - 1e-6 && b < to - 1e-6 && b < s.end - 1e-6 && !fills.some(([a, z]) => b >= a - 1e-6 && b < z - 1e-6);
  const add = (beat: number, key: string, vel: number, rank: number, covers?: string) => {
    if (!ok(beat)) return;
    out.push({ beat, key, vel, rank });
    if (covers) {
      let set = cover.get(covers);
      if (!set) cover.set(covers, (set = new Set()));
      set.add(beatKey(beat));
    }
  };
  const mel = melodyNotes(s);
  const chords = chordSpans(s);
  const bars = passBars(s);
  if (inst === 'piano' || inst === 'marimba') {
    for (const n of mel) {
      // Easy: the notes on 1 and 3 (the band plays the rest of the tune); out of the instrument's reach: the band's
      if (level === 'easy' && !strong(n.beat)) continue;
      const z = zoneOf(inst, t.scale, n.degree);
      if (z >= 0) add(n.beat, `${inst}:${z}`, strong(n.beat) ? 0.9 : 0.8, 0, 'band:melody');
      // Hard on the marimba: the other mallet a chord tone under a long note on a strong beat
      if (level === 'hard' && inst === 'marimba' && z >= 0 && n.len >= 1.5 && strong(n.beat)) {
        const c = chords.find((x) => n.beat >= x.beat && n.beat < x.beat + x.len) ?? s.home;
        const tones = c.borrowed ? [c.degree, c.degree + 4] : [c.degree, c.degree + 2, c.degree + 4];
        for (let d = n.degree - 1; d >= n.degree - 4; d--) {
          if (!tones.some((x) => (((x - d) % 7) + 7) % 7 === 0)) continue;
          const h = zoneOf('marimba', t.scale, d);
          if (h >= 0) add(n.beat, `marimba:${h}`, 0.7, 1);
          break;
        }
      }
    }
    // Hard on the piano: your other hand on the chord key as each chord comes in
    if (level === 'hard' && inst === 'piano') for (const c of chords) add(c.beat, `piano:${PIANO_CHORD}`, 0.7, 1);
  } else if (inst === 'handpan') {
    // the bass: each chord's root as it comes in; Normal adds its fifth on 3; Hard the tune's notes on 1 and 3 above it
    for (const c of chords) {
      const r = handpanZone(t.scale, c.degree, true);
      if (r >= 0) add(c.beat, `handpan:${r}`, 0.9, 0, 'band:bass');
      if (level !== 'easy' && c.len >= 4) {
        const f = handpanZone(t.scale, c.degree + 4, true);
        if (f >= 0) add(c.beat + 2, `handpan:${f}`, 0.75, 0, 'band:bass');
      }
    }
    if (level === 'hard') for (const n of mel) if (strong(n.beat)) {
      const z = handpanZone(t.scale, n.degree, false);
      if (z >= 0) add(n.beat, `handpan:${z}`, 0.8, 1);
    }
  } else if (inst === 'guitar') {
    // strums on 1 and 3 (Easy), every beat (Normal), the strum pattern (Hard); from Normal your other hand moves
    // to each new chord on the neck as it comes in
    const fast = t.bpm >= 130;
    const offs = level === 'easy' ? [0, 2] : level === 'normal' ? [0, 1, 2, 3] : fast ? [0, 1, 2, 3, 3.5] : [0, 1, 1.5, 2.5, 3, 3.5];
    for (const { beat: b } of bars) for (const o of offs) add(b + o, 'guitar:9', o % 1 ? 0.6 : o === 0 ? 0.9 : 0.75, 0);
    if (level !== 'easy') {
      const pads = padsFor(s);
      let was = -1;
      for (const c of chords) {
        const base = s.chords.find((x) => x.semis === c.semis && x.minor === c.minor) ?? c;
        const p = pads.get(base) ?? 0;
        if (p !== was) add(c.beat, `guitar:${p}`, 0.7, 1);
        was = p;
      }
    }
  } else if (inst === 'congas') {
    live.push('congas:0');
    for (const { beat: b } of bars) for (const h of bar(CONGAS[level])) add(b + h.at, `congas:${h.ch}`, h.ch === '3' || h.ch === '1' ? 0.85 : 0.75, 0);
  } else {
    // the drums: Easy the kick and the snare, Normal the hat too, Hard the full groove and a fill into each fourth bar
    live.push('kit:kick', 'kit:snare', 'kit:hat');
    for (const { beat: b, bar: n } of bars) {
      const fill = level === 'hard' && n % 4 === 3;
      const kick = bar(level === 'hard' ? g.hardKick : g.kick);
      const snare = bar(level === 'hard' ? g.hardSnare : g.snare);
      const hat = level === 'easy' ? [] : bar(level === 'hard' ? g.hardHat : g.hat);
      for (const h of kick) if (!(fill && h.at >= 2)) add(b + h.at, 'kit:kick', h.vel, 0);
      for (const h of snare) if (!(fill && h.at >= 2)) add(b + h.at, 'kit:snare', h.vel, 0);
      for (const h of hat) if (!(fill && h.at >= 2)) add(b + h.at, 'kit:hat', 0.6, 1);
      if (fill) for (const [o, key] of [[2, 'kit:snare'], [2.5, 'kit:snare'], [3, opts.tom ? 'kit:tom' : 'kit:snare'], [3.5, opts.tom ? 'kit:tom' : 'kit:snare']] as const) add(b + o, key, o === 2 ? 0.9 : 0.75, 0);
    }
  }
  // in time order; one note per zone per moment, and two hands: the third at once goes (the lower-ranked first)
  out.sort((a, b) => a.beat - b.beat || a.rank - b.rank);
  const notes: ChartNote[] = [];
  for (let i = 0; i < out.length; i++) {
    const n = out[i];
    const same = notes.filter((m) => Math.abs(m.beat - n.beat) < 1e-6);
    if (same.some((m) => m.key === n.key) || same.length >= 2) continue;
    notes.push({ beat: n.beat, key: n.key, vel: n.vel });
  }
  return { notes, live, cover };
}

/** Where the last hit lights on each instrument: the tonic (or the kick and snare, the low conga, the strum). */
export function finalKeys(s: Score, inst: string): string[] {
  if (inst === 'piano' || inst === 'marimba') return [`${inst}:${Math.max(0, zoneOf(inst, s.tune.scale, 0))}`];
  if (inst === 'handpan') return ['handpan:0'];
  if (inst === 'guitar') return ['guitar:9'];
  if (inst === 'congas') return ['congas:0', 'congas:2'];
  return ['kit:kick', 'kit:snare'];
}
