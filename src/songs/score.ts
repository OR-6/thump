/**
 * A song written out bar by bar (src/songs/tunes.ts): its melody, its chords, and from them its bass line and a drum
 * groove in its style. A performance plays the tune through `passes` times with a solo between each, and ends on
 * its last note: the band holds the chord before it and waits for you (the last hit).
 *
 * From the score come what the band plays (`scoreParts`, `scoreBed`) and what you play on each instrument at each
 * level (`scoreChart`): the melody on the piano (its black keys for the notes outside the scale) and the marimba,
 * the chords on the guitar, the groove on the drums, percussion on the congas, the bass (and on Hard the melody's
 * strong notes) on the handpan. A note an instrument hasn't got is the band's. Every note is on a zone the
 * instrument has; two at once at most, never two on one zone. Pure, unit-tested.
 */
import { PIANO_BLACK, PIANO_CHORD, instZones, pianoBlacks, scaleById, scaleMidi, type InstId } from '../kit/shelf.js';
import { BAND_STYLES, bassLine, compEvents, congaHits, drumHits, pick, planBars, type BandStyle, type ChordSpan } from './arrange.js';
import type { BedEvent } from './chart.js';
import { classicKit } from './classic-kit.js';
import { LESSONS, TUNES, type SectionKind, type Style, type Tune } from './tunes.js';

export type Level = 'easy' | 'normal' | 'hard';

/** A melody note: when in the tune (beats from its first bar), how long, its scale degree (0 = the tonic) and how
 * many semitones it sits off that degree (a note outside the scale: ±1). */
export interface MelNote {
  beat: number;
  len: number;
  degree: number;
  acc: number;
}

/** A chord: from when, for how long; its root as a scale degree and in semitones above the tonic; minor or not. */
export interface Chord {
  beat: number;
  len: number;
  degree: number;
  semis: number;
  minor: boolean;
  /** Not the scale's own chord on that degree (a D7 in C, a C in B minor): only its root and fifth are safe. */
  borrowed: boolean;
}

export interface Score {
  tune: Tune;
  /** The instruments' key: the tonic's pitch class, and its scale. */
  keyPc: number;
  scale: 'major' | 'minor';
  /** Beats in a bar, and bars in one pass. */
  meter: number;
  bars: number;
  /** One pass of the melody and its chords. */
  melody: MelNote[];
  chords: Chord[];
  /** Where each pass starts (beats from the song's first bar). */
  starts: number[];
  /** The solos between passes. */
  solos: [number, number][];
  /** The solo's chord. */
  soloChord: Chord;
  /** A song in its whole form: where each section starts (bars), and what it is. */
  sections: readonly { bar: number; kind: SectionKind }[] | null;
  /** The home chord (the last one). */
  home: Chord;
  /** The last note's beat: the band holds there and waits for your last hit. */
  end: number;
  /** The last time through (the progress bar's second half). */
  last: [number, number];
  /** How hard it is to play (Normal's notes a second on the melody, with the tempo), and its word. */
  rating: number;
  difficulty: 'Easy' | 'Medium' | 'Hard';
}

const LETTERS = 'CDEFGAB';
const NATURAL = [0, 2, 4, 5, 7, 9, 11];

/** A key by its name ('C', 'Am', 'Em', 'Bb', 'F#m'): its tonic's letter and pitch class, and its scale. */
export function keyOf(name: string): { letter: number; pc: number; scale: 'major' | 'minor'; sig: number[] } {
  const m = /^([A-G])([#b]?)(m?)$/.exec(name);
  if (!m) throw new Error(`can't read key "${name}"`);
  const letter = LETTERS.indexOf(m[1]);
  const pc = (NATURAL[letter] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  const scale = m[3] ? 'minor' : 'major';
  const steps = scaleById(scale).steps;
  // the key signature: how far each letter sits from its natural (F sharp in G: +1 on F)
  const sig = [0, 0, 0, 0, 0, 0, 0];
  for (let k = 0; k < 7; k++) {
    const l = (letter + k) % 7;
    sig[l] = ((((pc + steps[k] - NATURAL[l]) % 12) + 18) % 12) - 6;
  }
  return { letter, pc, scale, sig };
}

/**
 * The melody's notes, and how many bars (each must hold exactly `meter` beats). The notation is ABC's: notes with
 * the key's signature, `^` `_` `=` accidentals lasting to the end of the bar, `-` a tie, `(3` a triplet; `unit` is
 * the beats a note of length 1 lasts.
 */
export function parseMelody(text: string, key: string, meter = 4, unit = 0.5, octave = 0): { notes: MelNote[]; bars: number } {
  const k = keyOf(key);
  const sc = scaleById(k.scale);
  const tonic = 60 + k.pc;
  const notes: (MelNote & { id: string; tie: boolean })[] = [];
  const bars = text.split('|');
  let beat = 0;
  bars.forEach((bar, b) => {
    const body = bar.replace(/\s+/g, '');
    const re = /(\(3)|(\^\^|\^|__|_|=)?([A-Ga-gz])([,']*)(\d*)(?:\/(\d*))?(-)?/g;
    const held = new Map<string, number>();
    let at = 0;
    let used = 0;
    let trip = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body))) {
      if (m.index !== used || !m[0]) throw new Error(`bar ${b + 1}: can't read "${body.slice(used)}"`);
      used = m.index + m[0].length;
      if (m[1]) {
        trip = 3;
        continue;
      }
      let len = (m[5] ? Number(m[5]) : 1) / (m[6] !== undefined ? (m[6] ? Number(m[6]) : 2) : 1);
      if (trip > 0) {
        len *= 2 / 3;
        trip--;
      }
      len *= unit;
      if (m[3] !== 'z') {
        const L = LETTERS.indexOf(m[3].toUpperCase());
        const oct = 4 + octave + (m[3] === m[3].toLowerCase() ? 1 : 0) + (m[4].match(/'/g)?.length ?? 0) - (m[4].match(/,/g)?.length ?? 0);
        const id = `${L}:${oct}`;
        if (m[2]) held.set(id, m[2] === '^' ? 1 : m[2] === '^^' ? 2 : m[2] === '_' ? -1 : m[2] === '__' ? -2 : 0);
        const midi = 12 * (oct + 1) + NATURAL[L] + (held.get(id) ?? k.sig[L]);
        const prev = notes[notes.length - 1];
        // (a tie holds the note on, its accidental too, across the bar line)
        if (prev?.tie && prev.id === id && Math.abs(prev.beat + prev.len - (beat + at)) < 1e-6) {
          prev.len += len;
          prev.tie = !!m[7];
        } else {
          const degree = L + 7 * oct - (k.letter + 7 * 4);
          notes.push({ beat: beat + at, len, degree, acc: midi - scaleMidi(tonic, sc, degree), id, tie: !!m[7] });
        }
      }
      at += len;
    }
    if (used !== body.length) throw new Error(`bar ${b + 1}: can't read "${body.slice(used)}"`);
    if (Math.abs(at - meter) > 1e-6) throw new Error(`bar ${b + 1} has ${Math.round(at * 1000) / 1000} beats, not ${meter}`);
    beat += meter;
  });
  return { notes: notes.map((n) => ({ beat: n.beat, len: n.len, degree: n.degree, acc: n.acc })), bars: bars.length };
}

/** A chord name (C, Dm, G7, F#m, Bb, Em7) in a key. */
function chordOf(name: string, key: string, beat: number, len: number): Chord {
  const m = /^([A-G])([#b]?)(m?)(7?)$/.exec(name);
  if (!m) throw new Error(`can't read chord "${name}"`);
  const k = keyOf(key);
  const steps = scaleById(k.scale).steps;
  const L = LETTERS.indexOf(m[1]);
  const pc = (NATURAL[L] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  const degree = (L - k.letter + 7) % 7;
  const semis = (pc - k.pc + 12) % 12;
  const minor = m[3] === 'm';
  // the scale's own triad on that degree: minor when its third is three semitones
  const third = (steps[(degree + 2) % 7] - steps[degree] + 12) % 12;
  return { beat, len, degree, semis, minor, borrowed: semis !== steps[degree] || minor !== (third === 3) };
}

/** The chords, bar by bar (one, two, three or four to a bar, evenly; `.` keeps the one before). */
export function parseChords(text: string, key: string, meter = 4): Chord[] {
  const out: Chord[] = [];
  text.split('|').forEach((bar, b) => {
    const names = bar.trim().split(/\s+/);
    if (!names.length || names.length > 4 || (meter / names.length) % 0.5 !== 0) throw new Error(`bar ${b + 1}: ${names.length} chords`);
    const each = meter / names.length;
    names.forEach((n, k) => {
      const beat = b * meter + k * each;
      const prev = out[out.length - 1];
      if (n === '.') {
        if (!prev || k === 0) throw new Error(`bar ${b + 1} starts with "."`);
        prev.len += each;
        return;
      }
      out.push(chordOf(n, key, beat, each));
    });
  });
  return out;
}

/** A tune, laid out as a performance. */
export function scoreOf(tune: Tune): Score {
  const k = keyOf(tune.key);
  const meter = tune.meter ?? 4;
  const { notes, bars } = parseMelody(tune.melody, tune.key, meter, tune.unit ?? 0.5, tune.octave ?? 0);
  const chords = parseChords(tune.chords, tune.key, meter);
  const span = bars * meter;
  const lastChord = chords[chords.length - 1];
  if (lastChord.beat + lastChord.len !== span) throw new Error(`${tune.id}: chords for ${(lastChord.beat + lastChord.len) / meter} bars, the tune has ${bars}`);
  // (a solo is a bar; two when the bars are short)
  const solo = meter >= 3 ? meter : 2 * meter;
  const starts: number[] = [];
  const solos: [number, number][] = [];
  for (let p = 0; p < tune.passes; p++) {
    starts.push(p * (span + solo));
    if (p > 0) solos.push([p * (span + solo) - solo, p * (span + solo)]);
  }
  const home = lastChord;
  const lastStart = starts[starts.length - 1];
  const end = lastStart + notes[notes.length - 1].beat;
  // the solo holds the five chord (major), unless the tune says otherwise
  let soloChord: Chord = tune.solo ? chordOf(tune.solo, tune.key, 0, solo) : { beat: 0, len: solo, degree: (home.degree + 4) % 7, semis: (home.semis + 7) % 12, minor: false, borrowed: false };
  // a song in its whole form: its solos are its solo sections (on their own chord), its last time through its last chorus
  const sec = tune.sections ?? null;
  let last: [number, number] = [lastStart, end];
  if (sec) {
    sec.forEach((x, i) => {
      if (x.kind !== 'solo') return;
      const a = x.bar * meter;
      solos.push([a, (sec[i + 1]?.bar ?? bars) * meter]);
      const c = chords.find((y) => Math.abs(y.beat - a) < 1e-6);
      if (c) soloChord = { ...c, beat: 0, len: solos[solos.length - 1][1] - a };
    });
    const lc = [...sec].reverse().find((x) => x.kind === 'chorus');
    if (lc) last = [lc.bar * meter, end];
  }
  const s: Score = { tune, keyPc: k.pc, scale: k.scale, meter, bars, melody: notes, chords, starts, solos, soloChord, sections: sec, home, end, last, rating: 0, difficulty: 'Easy' };
  // how hard: the whole melody's notes a second, a little more for a quick tempo
  const n = melodyNotes(s).length;
  s.rating = (n / ((end * 60) / tune.bpm)) * (0.75 + tune.bpm / 400);
  s.difficulty = s.rating < 1.75 ? 'Easy' : s.rating < 2.6 ? 'Medium' : 'Hard';
  return s;
}

/** The songs, easiest first. */
/** (the lessons first, one per instrument, then the songs) */
/**
 * The songs in the order the list shows them: the ones that play most naturally first (measured: how much of what you
 * play the band's own accents mark, and the band doubling your off-beats; Mango Season best), so the first thing anyone
 * picks shows the game at its best. Any song not named here goes after, easiest first.
 */
export const SONG_ORDER: readonly string[] = ['mango-season', 'rooftop', 'drunken-sailor', 'saints', 'ode-to-joy', 'kite-hill', 'low-tide', 'korobeiniki', 'can-can', 'entertainer', 'william-tell', 'late-bus', 'amazing-grace', 'cold-brew', 'mountain-king', 'scarborough-fair', 'turkish-march', 'fur-elise', 'canon'];
const orderOf = (id: string) => {
  const i = SONG_ORDER.indexOf(id);
  return i < 0 ? SONG_ORDER.length : i;
};
// (the lessons, then the songs, best first)
export const SCORES: readonly Score[] = [...LESSONS.map(scoreOf), ...TUNES.map(scoreOf).sort((a, b) => orderOf(a.tune.id) - orderOf(b.tune.id) || a.rating - b.rating)];

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

/** A chord's root as MIDI in the octave from middle C, in key `key` (a pitch class). */
export function chordMidi(c: Chord, key: number): number {
  return 60 + ((key + c.semis) % 12);
}

// ------------------------------------------------------------------ the grooves

/**
 * A style's drums, bass and congas over `cycle` beats (four, or three for a song in three): each a string split
 * evenly over the cycle (8 characters: eighths; 12: triplet eighths; 16: sixteenths). Drums: `x` a hit, `X` an
 * accent. Bass: `1` the chord's root, `5` its fifth, `8` the octave. Congas: the zone (0/1 the low drum's middle and
 * edge, 2/3 the high one's). Easy plays `easy` (kick and snare on the beat), Normal the kick, snare and hat, Hard and
 * the band's drummer the `hard` ones.
 */
interface Groove {
  cycle: number;
  easy: [string, string];
  kick: string;
  snare: string;
  hat: string;
  hardKick: string;
  hardSnare: string;
  hardHat: string;
  bass: string;
  congas: [string, string, string];
  /** The off-beats lean late (a shuffle): where the guitar's up-strums fall. */
  swing?: boolean;
}

const CONGAS4: [string, string, string] = ['0.3.0.3.', '0.320.32', '01320132'];
const BACKBEAT: [string, string] = ['X...x...', '..x...x.'];
const GROOVES: Record<Style, Groove> = {
  // a straight rock beat: eighths on the hat, the bass pumping eighths
  rock: { cycle: 4, easy: BACKBEAT, kick: 'X...x...', snare: '..x...x.', hat: 'x.x.x.x.', hardKick: 'X..xX.x.', hardSnare: '..x...x.', hardHat: 'xxxxxxxx', bass: '11111111', congas: CONGAS4 },
  // a big, steady anthem: the kick pushing into three
  anthem: { cycle: 4, easy: BACKBEAT, kick: 'X...x...', snare: '..x...x.', hat: 'x.x.x.x.', hardKick: 'X..xX...', hardSnare: '..x...x.', hardHat: 'xxxxxxxx', bass: '1.1.1.15', congas: CONGAS4 },
  // punk: oom on every beat, pah on every off-beat
  punk: { cycle: 4, easy: BACKBEAT, kick: 'X...x...', snare: '..x...x.', hat: 'x.x.x.x.', hardKick: 'X.x.X.x.', hardSnare: '.x.x.x.x', hardHat: 'x...x...', bass: '11111111', congas: CONGAS4 },
  // ska: the hat on the off-beats, a walking bass
  ska: { cycle: 4, easy: BACKBEAT, kick: 'X...x...', snare: '..x...x.', hat: '.x.x.x.x', hardKick: 'X..xx...', hardSnare: '..x..xx.', hardHat: '.x.x.x.x', bass: '1.5.8.5.', congas: CONGAS4 },
  // a dance floor: the kick on every beat, an open hat and the bass between
  dance: { cycle: 4, easy: BACKBEAT, kick: 'X.x.X.x.', snare: '..x...x.', hat: '.x.x.x.x', hardKick: 'X.x.X.x.', hardSnare: '..x...x.', hardHat: 'xxxxxxxx', bass: '.1.1.1.1', congas: CONGAS4 },
  // synth-pop: four on the floor, a pulsing eighth bass
  synthpop: { cycle: 4, easy: BACKBEAT, kick: 'X...x...', snare: '..x...x.', hat: '.x.x.x.x', hardKick: 'X.x.X.x.', hardSnare: '..x...x.', hardHat: 'xxxxxxxx', bass: '11111111', congas: CONGAS4 },
  // funk: a sixteenth-note kick and ghosted snare, the hat on eighths
  funk: { cycle: 4, easy: BACKBEAT, kick: 'X.......x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', hardKick: 'X.....x...x.....', hardSnare: '....x..x.x..x...', hardHat: 'x.x.x.x.x.x.x.x.', bass: '1.....1...5.8...', congas: CONGAS4 },
  // boom-bap: the kick late in two, the snare on two and four
  hiphop: { cycle: 4, easy: BACKBEAT, kick: 'X.......x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', hardKick: 'X......x..x.....', hardSnare: '....x.......x...', hardHat: 'x.x.x.x.x.x.x.x.', bass: '1......1..1.....', congas: CONGAS4 },
  // boom-bap with a shuffle: the hat on the swung eighths
  shufflehop: { cycle: 4, easy: BACKBEAT, kick: 'X.....x.....', snare: '...x.....x..', hat: 'x.xx.xx.xx.x', hardKick: 'X....xx.....', hardSnare: '...x.....x.x', hardHat: 'x.xx.xx.xx.x', bass: '1.....1....5', congas: ['0..3..0..3..', '0..3.20..3.2', '0.13.20.13.2'], swing: true },
  // reggaeton's dembow: the kick on every beat, the snare's three-three-two
  reggaeton: { cycle: 4, easy: BACKBEAT, kick: 'X...x...x...x...', snare: '...x..x....x..x.', hat: 'x.x.x.x.x.x.x.x.', hardKick: 'X...x...x...x...', hardSnare: '...x..x....x..x.', hardHat: 'x.xxx.xxx.xxx.xx', bass: '1..1..1.1..1..1.', congas: ['0.3.0.3.', '0..30.3.', '01.30.32'] },
  // reggae's one drop: kick and rim together on three, the skank on the off-beats
  reggae: { cycle: 4, easy: ['....X...', '..x...x.'], kick: '....X...', snare: '....x...', hat: 'x.x.x.x.', hardKick: '....X...', hardSnare: '..x.x.x.', hardHat: 'xxxxxxxx', bass: '1..5.1..', congas: CONGAS4 },
  // a pop ballad: a soft kick, the snare on two and four
  ballad: { cycle: 4, easy: BACKBEAT, kick: 'X....x..', snare: '..x...x.', hat: 'x.x.x.x.', hardKick: 'X....xx.', hardSnare: '..x...x.', hardHat: 'xxxxxxxx', bass: '1...1.5.', congas: CONGAS4 },
  // a song in three, played as a slow modern groove: the kick on one, the snare on three
  three: { cycle: 3, easy: ['X.....', '....x.'], kick: 'X.....', snare: '....x.', hat: 'x.x.x.', hardKick: 'X..x..', hardSnare: '....x.', hardHat: 'xxxxxx', bass: '1...5.', congas: ['0.3.3.', '0.32.3', '013232'] },
};

function hits(pattern: string, cycle: number): { at: number; vel: number; ch: string }[] {
  const out: { at: number; vel: number; ch: string }[] = [];
  for (let k = 0; k < pattern.length; k++) if (pattern[k] !== '.') out.push({ at: (k * cycle) / pattern.length, vel: pattern[k] === 'X' ? 1 : 0.8, ch: pattern[k] });
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

const pianoCache = new Map<string, Map<number, number>>();
/**
 * The piano key for a note: the white key of its degree, or for a note outside the scale the black key with that
 * pitch (zone PIANO_BLACK + j); an octave in when it's past the keyboard; −1 if none has it.
 */
export function pianoKey(scale: string, degree: number, acc: number, fold = true): number {
  let byMidi = pianoCache.get(scale);
  if (!byMidi) {
    byMidi = new Map();
    const zones = instZones('piano', 60, scaleById(scale));
    for (const z of zones) if (z.i < PIANO_CHORD) byMidi.set(z.midi, z.i);
    pianoBlacks(zones).forEach((b, j) => {
      const m = zones[b.a].midi + 1;
      if (!byMidi!.has(m)) byMidi!.set(m, PIANO_BLACK + j);
    });
    pianoCache.set(scale, byMidi);
  }
  const midi = scaleMidi(60, scaleById(scale), degree) + acc;
  return byMidi.get(midi) ?? (fold ? (byMidi.get(midi - 12) ?? byMidi.get(midi + 12)) : undefined) ?? -1;
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
  for (const st of s.starts) for (const n of s.melody) if (st + n.beat < s.end - 1e-6) out.push({ beat: st + n.beat, len: n.len, degree: n.degree, acc: n.acc });
  return out;
}

/** Each pass's chords on the song's timeline (to the end). */
function chordSpans(s: Score): Chord[] {
  const out: Chord[] = [];
  for (const st of s.starts) for (const c of s.chords) if (st + c.beat < s.end - 1e-6) out.push({ ...c, beat: st + c.beat, len: Math.min(c.len, s.end - st - c.beat) });
  return out;
}

/** The groove's cycles through the passes (their first beat, and which cycle of the pass), to the end. */
function cycles(s: Score, g: Groove): { beat: number; n: number }[] {
  const out: { beat: number; n: number }[] = [];
  const span = s.bars * s.meter;
  for (const st of s.starts) for (let c = 0; c * g.cycle < span - 1e-6; c++) if (st + c * g.cycle < s.end - 1e-6) out.push({ beat: st + c * g.cycle, n: c });
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
  /** Seconds off the beat it's on (the band's feel: never your notes). */
  late?: number;
  /** A band line's sound (its style's bass, its lead). */
  sound?: string;
}
export interface BandPart {
  name: 'KICK' | 'SNARE' | 'HAT' | 'PERC' | 'KEYS' | 'BASS';
  key: string;
  notes: BandNote[];
}

/** A song's groove (its style's, in three for a song in three). */
function grooveOf(s: Score): Groove {
  return s.meter === 3 ? GROOVES.three : GROOVES[s.tune.style];
}

/** How the band plays a song (its style's arrangement; a song in three plays the one for three). */
export function bandStyle(s: Score): BandStyle {
  return s.meter === 3 ? BAND_STYLES.three : BAND_STYLES[s.tune.style];
}

const spansOf = (s: Score): ChordSpan[] => chordSpans(s).map((c) => ({ beat: c.beat, len: c.len, semis: c.semis, minor: c.minor }));

/**
 * The band's parts through the whole song (src/songs/arrange.ts): the drummer in the song's style, verse and chorus
 * and the fills between, through the solos too; its congas; the melody (a lead in the style's sound, its MIDI an
 * octave under where it sounds: the bed's pluck plays an octave up); and the bass line on each chord.
 */
export function scoreParts(s: Score): BandPart[] {
  const st = bandStyle(s);
  const sc = scaleById(s.scale);
  // (the drummer keeps time through the solos too: the game plays it soft there, unless the drums are yours)
  const plan = planBars(s);
  const kit = drumHits(st, plan, s.meter, s.end);
  const drum = (hs: typeof kit.KICK): BandNote[] => hs.map((h) => ({ beat: h.beat, key: h.key, vel: h.vel, late: h.late }));
  const perc = drum(congaHits(st, plan, s.meter, s.end));
  const root = melodyRoot(s.keyPc);
  const keys = melodyNotes(s).map((n) => ({ beat: n.beat, key: 'band:melody', vel: n.beat % 2 === 0 ? 0.95 : 0.85, midi: scaleMidi(root, sc, n.degree) + n.acc - 12, len: n.len, sound: st.lead }));
  const bass = bassLine(st, plan, s.meter, spansOf(s), s.keyPc, s.end).map((n) => ({ beat: n.beat, key: 'band:bass', vel: n.vel, midi: n.midi, len: n.len, late: n.late, sound: st.bass.sound }));
  return [
    { name: 'KICK', key: 'kit:kick', notes: drum(kit.KICK) },
    { name: 'SNARE', key: 'kit:snare', notes: drum(kit.SNARE) },
    { name: 'HAT', key: 'kit:hat', notes: drum(kit.HAT) },
    { name: 'PERC', key: 'congas:0', notes: perc },
    { name: 'KEYS', key: 'band:melody', notes: keys },
    { name: 'BASS', key: 'band:bass', notes: bass },
  ];
}

/**
 * The bed: the count-in (four clicks over the home chord), then the keys in the style's comping rhythm over a held
 * chord, the shaker or tambourine, and each solo's chord held.
 */
export function scoreBed(s: Score): BedEvent[] {
  const key = s.keyPc;
  const st = bandStyle(s);
  const out: BedEvent[] = [];
  for (let k = 0; k < 4; k++) out.push({ beat: -4 + k, voice: 'shaker', midi: 0, len: 0.25, vel: k === 0 ? 0.9 : 0.6 });
  out.push({ beat: -4, voice: 'chord', midi: chordMidi(s.home, key), len: 4, vel: 0.3, minor: s.home.minor });
  const solo = { beat: 0, len: s.meter, semis: s.soloChord.semis, minor: s.soloChord.minor };
  out.push(...compEvents(st, planBars(s), s.meter, spansOf(s), solo, key, s.end));
  return out.sort((a, b) => a.beat - b.beat);
}

// ------------------------------------------------------------------ your part

export interface ChartNote {
  beat: number;
  /** The zone it's on ('piano:7', 'piano:52' a black key, 'kit:snare', 'guitar:9' a strum, 'guitar:1' a chord). */
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

/** The closest Easy notes may come (seconds): anything quicker is a beginner's miss. */
export const EASY_GAP = 0.4;
/** And Normal's on a tune (the piano, the marimba, the handpan): a quarter of a second apart is the quickest it asks. */
export const NORMAL_GAP = 0.25;
/** And Hard's, on the drums: a sixteenth at 100 bpm and no quicker. */
export const HARD_GAP = 0.14;

/** The guitar's three positions on the neck (its scale's I, IV and V): which one each chord goes on. */
function padsFor(s: Score): (c: Chord) => number {
  const roots = scaleById(s.scale).chords.map((c) => c[0] % 12);
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
  for (const c of all) if (!taken.has(id(c))) taken.set(id(c), free.length ? free.shift()! : 2);
  return (c) => taken.get(id(c)) ?? 0;
}

/**
 * What you play on an instrument at a level, from beat `from` to `to`, leaving out the solos (`fills`: anything
 * goes there). Notes are in time order; never two on one zone at once, never more than two at once; on Easy never
 * closer than EASY_GAP.
 */
export function scoreChart(s: Score, inst: string, level: Level, from: number, to: number, fills: readonly (readonly [number, number])[], opts: { tom?: boolean } = {}): ScoreChart {
  // a lesson on its own instrument: each step its own level (and maybe only some targets), whatever level is set
  const ls = s.tune.lesson;
  if (!ls || ls.inst !== inst) return chartAt(s, inst, level, from, to, fills, opts);
  const out: ScoreChart = { notes: [], live: [], cover: new Map() };
  ls.steps.forEach((st, i) => {
    const a = s.starts[0] + st.bar * s.meter;
    const b = i + 1 < ls.steps.length ? s.starts[0] + ls.steps[i + 1].bar * s.meter : Infinity;
    const c = chartAt(s, inst, st.level, Math.max(from, a), Math.min(to, b), fills, opts);
    for (const n of c.notes) if (!st.only || st.only.includes(n.key)) out.notes.push(n);
    for (const l of c.live) if (!out.live.includes(l)) out.live.push(l);
    for (const [k, set] of c.cover) {
      let o = out.cover.get(k);
      if (!o) out.cover.set(k, (o = new Set()));
      for (const x of set) o.add(x);
    }
  });
  return out;
}

function chartAt(s: Score, inst: string, level: Level, from: number, to: number, fills: readonly (readonly [number, number])[], opts: { tom?: boolean } = {}): ScoreChart {
  const t = s.tune;
  const out: (ChartNote & { rank: number; covers?: string })[] = [];
  const live: string[] = [];
  const g = grooveOf(s);
  const ok = (b: number) => b >= from - 1e-6 && b < to - 1e-6 && b < s.end - 1e-6 && !fills.some(([a, z]) => b >= a - 1e-6 && b < z - 1e-6);
  const add = (beat: number, key: string, vel: number, rank: number, covers?: string) => {
    if (ok(beat)) out.push({ beat, key, vel, rank, covers });
  };
  const barOf = (b: number) => {
    let p = s.starts.length - 1;
    while (p > 0 && s.starts[p] > b + 1e-6) p--;
    return b - s.starts[p];
  };
  // strong beats: 1 and 3 of a bar of four, the first of a shorter bar
  const strong = (b: number) => {
    const x = barOf(b) % s.meter;
    return s.meter === 4 ? Math.abs(x / 2 - Math.round(x / 2)) < 1e-6 : Math.abs(x) < 1e-6;
  };
  const onBeat = (b: number) => {
    const x = barOf(b);
    return Math.abs(x - Math.round(x)) < 1e-6;
  };
  const mel = melodyNotes(s);
  const chords = chordSpans(s);
  const cyc = cycles(s, g);
  // a song in its whole form: the verses (and the intro, the breaks, the outro) a step lighter than the choruses and
  // bridges, and a fill into each section from Normal
  const plan = s.sections ? planBars(s) : null;
  const barAt = (b: number) => plan?.find((p) => b >= p.beat - 1e-6 && b < p.beat + s.meter - 1e-6);
  const calm = (b: number) => {
    const k = barAt(b)?.kind;
    return !!k && k !== 'chorus' && k !== 'bridge';
  };
  const step = (b: number): Level | 'light' => (!plan || level === 'easy' || !calm(b) ? level : level === 'hard' ? 'normal' : 'light');
  if (inst === 'piano' || inst === 'marimba') {
    // Easy and Normal: the notes a listener would hum, most telling first (a phrase's first note, the downbeats, the
    // long notes, then the strong beats; on Normal every beat and any note held a beat or more), kept while they're
    // no closer than the level's gap to one already kept; Hard all of them (the band plays the rest of the tune)
    const keepMel = new Set<number>();
    if (level !== 'hard') {
      const spb = 60 / t.bpm;
      const gapS = level === 'easy' ? EASY_GAP : NORMAL_GAP;
      const rank = (n: MelNote, i: number) => {
        const prev = mel[i - 1];
        const starts = !prev || prev.beat + prev.len <= n.beat - 1 + 1e-6;
        const down = Math.abs(barOf(n.beat) % s.meter) < 1e-6;
        if (starts) return 5;
        if (down) return 4;
        if (n.len >= 1.5 - 1e-6) return 3;
        if (strong(n.beat)) return 2;
        if (level === 'normal' && (onBeat(n.beat) || n.len >= 1 - 1e-6)) return 1;
        return 0;
      };
      const order = mel.map((n, i) => ({ i, r: rank(n, i) })).filter((x) => x.r > (level === 'easy' ? 1 : 0)).sort((a, b) => b.r - a.r || mel[a.i].beat - mel[b.i].beat);
      const kept: number[] = [];
      for (const { i } of order) if (kept.every((b) => Math.abs(b - mel[i].beat) * spb >= gapS - 1e-6)) {
        kept.push(mel[i].beat);
        keepMel.add(i);
      }
    }
    for (let mi = 0; mi < mel.length; mi++) {
      const n = mel[mi];
      if (level !== 'hard' && !keepMel.has(mi)) continue;
      // (a note the instrument hasn't got, the marimba having no notes outside the scale, is the band's)
      const z = inst === 'piano' ? pianoKey(s.scale, n.degree, n.acc) : n.acc === 0 ? zoneOf('marimba', s.scale, n.degree) : -1;
      if (z >= 0) add(n.beat, `${inst}:${z}`, strong(n.beat) ? 0.9 : 0.8, 0, 'band:melody');
      // Hard on the marimba: the other mallet a chord tone under a long note on a strong beat
      if (level === 'hard' && inst === 'marimba' && z >= 0 && n.len >= 1.5 && strong(n.beat)) {
        const c = chords.find((x) => n.beat >= x.beat && n.beat < x.beat + x.len) ?? s.home;
        const tones = c.borrowed ? [c.degree, c.degree + 4] : [c.degree, c.degree + 2, c.degree + 4];
        for (let d = n.degree - 1; d >= n.degree - 4; d--) {
          if (!tones.some((x) => (((x - d) % 7) + 7) % 7 === 0)) continue;
          const h = zoneOf('marimba', s.scale, d);
          if (h >= 0 && h !== z) add(n.beat, `marimba:${h}`, 0.7, 1);
          break;
        }
      }
    }
    // Hard on the piano: your other hand on the chord key as each chord comes in
    if (level === 'hard' && inst === 'piano') for (const c of chords) add(c.beat, `piano:${PIANO_CHORD}`, 0.7, 1);
    // (where the tune leaves you two bars or more with nothing, an intro above all: the chords, as the band's keys play
    // them, their root on each downbeat and from Normal their fifth halfway, so nobody waits with nothing to play)
    {
      // (the tune's own rests: measured on all of its notes, not just the ones a level keeps)
      const kept = mel.map((n) => n.beat).sort((a, b) => a - b);
      const keyOf = (d: number) => (inst === 'piano' ? pianoKey(s.scale, d, 0) : zoneOf('marimba', s.scale, d));
      const fillGap = (a: number, z: number) => {
        for (let b = Math.ceil((a + 1e-6) / s.meter) * s.meter; b < z - s.meter + 1e-6; b += s.meter) {
          if (barOf(b) % s.meter > 1e-6) continue;
          const c = chords.find((x) => b >= x.beat - 1e-6 && b < x.beat + x.len - 1e-6);
          if (!c || c.semis !== scaleById(s.scale).steps[c.degree]) continue;
          const r = keyOf(c.degree);
          if (r >= 0) add(b, `${inst}:${r}`, 0.8, 0);
          const f = keyOf(c.degree + 4);
          if (level !== 'easy' && s.meter >= 3 && f >= 0) add(b + Math.floor(s.meter / 2), `${inst}:${f}`, 0.7, 0);
        }
      };
      const gap = 2 * s.meter;
      let prev = 0;
      for (const b of [...kept, s.end]) {
        if (b - prev >= gap + 1e-6) fillGap(prev, b);
        prev = b;
      }
    }
    // (a solo's bars, played through: the tune rests there, so the solo's chord on each downbeat, its fifth halfway from
    // Normal; the melody's band line doesn't cover these)
    if (!fills.length)
      for (const [a, z] of s.solos)
        for (let b = a; b < z - 1e-6; b += s.meter) {
          const deg = s.soloChord.degree;
          const key = (d: number) => (inst === 'piano' ? pianoKey(s.scale, d, 0) : zoneOf('marimba', s.scale, d));
          const r = key(deg);
          if (r >= 0) add(b, `${inst}:${r}`, 0.85, 0);
          const f = key(deg + 4);
          if (level !== 'easy' && s.meter >= 3 && f >= 0) add(b + Math.floor(s.meter / 2), `${inst}:${f}`, 0.75, 0);
        }
  } else if (inst === 'handpan') {
    // the bass player's part (the handpan stands in for it): an original's bass line as its band plays it; a classic's
    // its own arrangement's bass, a bar at a time on its chords (a tuba's root and fifth); else each chord's root as it
    // comes in, its fifth halfway. Each note on the handpan's field for it (a note outside its scale is the band's).
    // Easy the downbeats, Normal the beats and each chord as it comes in, Hard all of it, each thinned by time
    const sc = scaleById(s.scale);
    type B = { beat: number; degree: number; strong: number };
    const bs: B[] = [];
    const posOf = (b: number) => barOf(b) % s.meter;
    const strongness = (b: number, isChord: boolean) => {
      const x = posOf(b);
      return Math.abs(x) < 1e-6 ? 3 : isChord ? 2 : Math.abs(x - Math.round(x)) < 1e-6 ? (s.meter === 4 && Math.abs(x - 2) < 1e-6 ? 2 : 1) : 0;
    };
    const chordStart = (b: number) => chords.some((c) => Math.abs(c.beat - b) < 1e-6);
    if (t.bass) {
      const steps = t.bass.length;
      for (const st of s.starts)
        for (let b = 0; b < s.bars; b++)
          for (let i = 0; i < steps; i++) {
            const ch = t.bass[i];
            if (ch !== '1' && ch !== '5' && ch !== '8') continue;
            const at = st + b * s.meter + (i * s.meter) / steps;
            const c = chords.find((x) => at >= x.beat - 1e-6 && at < x.beat + x.len - 1e-6);
            if (!c || c.semis !== sc.steps[c.degree]) continue;
            bs.push({ beat: at, degree: c.degree + (ch === '5' ? 4 : ch === '8' ? 7 : 0), strong: strongness(at, chordStart(at)) });
          }
    } else if (t.original) {
      for (const n of bassLine(bandStyle(s), planBars(s), s.meter, spansOf(s), s.keyPc, s.end)) {
        const d = sc.steps.indexOf((((n.midi - s.keyPc) % 12) + 12) % 12);
        if (d < 0) continue;
        bs.push({ beat: n.beat, degree: d, strong: strongness(n.beat, chordStart(n.beat)) });
      }
    } else
      for (const c of chords) {
        if (c.semis !== sc.steps[c.degree]) continue;
        bs.push({ beat: c.beat, degree: c.degree, strong: 3 });
        const half = Math.floor(c.len / 2);
        if (half >= 1) bs.push({ beat: c.beat + half, degree: c.degree + 4, strong: 1 });
      }
    // (the strongest first, then what fits round them: none closer than the level's gap)
    const need = level === 'easy' ? 2 : level === 'normal' ? 1 : 0;
    const gapS = level === 'easy' ? EASY_GAP : level === 'normal' ? NORMAL_GAP : HARD_GAP;
    const spb = 60 / t.bpm;
    const kept: B[] = [];
    for (const n of [...bs].filter((x) => x.strong >= need).sort((a, b) => b.strong - a.strong || a.beat - b.beat))
      if (kept.every((k) => Math.abs(k.beat - n.beat) * spb >= gapS - 1e-6)) kept.push(n);
    for (const n of kept) {
      const z = handpanZone(s.scale, n.degree, true);
      if (z >= 0) add(n.beat, `handpan:${z}`, n.strong >= 2 ? 0.9 : 0.75, 0, 'band:bass');
    }
  } else if (inst === 'guitar') {
    // strums on the strong beats (Easy), every beat (Normal), a strum pattern (Hard); from Normal your other hand
    // moves to each new chord on the neck as it comes in
    const up = g.swing ? 2 / 3 : 0.5;
    const pattern = s.meter === 4 ? (t.bpm >= 130 ? [0, 1, 2, 3, 3 + up] : [0, 1, 1 + up, 2 + up, 3, 3 + up]) : s.meter === 3 ? [0, 1, 1 + up, 2, 2 + up] : [0, 1, 1 + up];
    const offsAt = (lv: Level | 'light') => (lv === 'easy' || lv === 'light' ? (s.meter === 4 ? [0, 2] : [0]) : lv === 'normal' ? Array.from({ length: s.meter }, (_, i) => i) : pattern);
    // (a phrase of four bars ends on one strum left to ring; on Easy a verse is a strum a bar, its chorus two)
    const bands = planBars(s);
    // the song's own rhythm part, where it has one (a classic's recording, an original's band comping): strums where it
    // plays, the downbeats first, then the beats, then the rest, a level's gap apart; a fill bar rings out on its one
    const bst = bandStyle(s);
    const own = t.rhythm ?? (t.original ? '' : undefined);
    if (own !== undefined) {
      type R = { beat: number; r: number };
      const cands: R[] = [];
      bands.forEach((p, n) => {
        if (p.solo) return;
        if (p.fill) {
          cands.push({ beat: p.beat, r: 3 });
          return;
        }
        // (Hard keeps time as a guitarist does: a strum on every beat as well as the part's own)
        if (level === 'hard') for (let k = 1; k < s.meter; k++) cands.push({ beat: p.beat + k, r: 2 });
        const pat = own || pick(p.chorus ? bst.comp.chorus : bst.comp.verse, n);
        for (let i = 0; i < pat.length; i++) {
          if (pat[i] !== 'x' && pat[i] !== 'X') continue;
          const off = (i * s.meter) / pat.length;
          cands.push({ beat: p.beat + off, r: off === 0 ? 3 : Math.abs(off - Math.round(off)) < 1e-6 ? 2 : 1 });
        }
      });
      const spb = 60 / t.bpm;
      const gapS = level === 'easy' ? EASY_GAP : level === 'normal' ? NORMAL_GAP : HARD_GAP;
      // (Easy keeps to the beats, unless a bar's part is all off-beats: a skank on Easy is still a skank)
      const kept: R[] = [];
      for (const c of [...cands].sort((a, b) => b.r - a.r || a.beat - b.beat))
        if (kept.every((k) => Math.abs(k.beat - c.beat) * spb >= gapS - 1e-6)) kept.push(c);
      for (const c of kept) add(c.beat, 'guitar:9', c.r === 3 ? 0.9 : c.r === 2 ? 0.75 : 0.65, 0);
    } else
      for (const st of s.starts)
        for (let b = 0; b < s.bars; b++) {
          const at = st + b * s.meter;
          // (the ring-out on the band's own phrase ends: where its drummer fills)
          const ends = bands.some((p) => p.fill && Math.abs(p.beat - at) < 1e-6);
          const offs = ends ? [0] : level === 'easy' && plan && calm(at) ? [0] : offsAt(step(at));
          for (const o of offs) add(at + o, 'guitar:9', o % 1 ? 0.6 : o === 0 ? 0.9 : 0.75, 0);
        }
    // your other hand moves to each new chord on the neck as it comes in (on Easy too: getting there early counts)
    {
      const pad = padsFor(s);
      let was = -1;
      for (const c of chords) {
        const p = pad(c);
        if (p !== was) add(c.beat, `guitar:${p}`, 0.7, 1);
        was = p;
      }
    }
  } else if (inst === 'congas') {
    live.push('congas:0');
    // the band's own conga player's part where it has one; else the drummer's, on the two drums: the low drum where the
    // kick is, the high drum on the backbeat, a slap on the accented off-beats (Hard). So what you play is what the
    // music already says; Easy keeps the beats, Normal the eighths, Hard all of it
    // (a classic's recording has no conga player: its congas follow its own drums, src/songs/classic-kit.ts)
    const ck = classicKit(s);
    const own = ck ? [] : congaHits(bandStyle(s), planBars(s), s.meter, s.end);
    const keep = (at: number) => (level === 'easy' ? Math.abs(at - Math.round(at)) < 1e-6 : level === 'normal' ? Math.abs(at * 2 - Math.round(at * 2)) < 1e-6 : true);
    // (Easy: the drummer's beats, always there; the conga player's part from Normal, if it has enough on the grid)
    // (the conga player's own notes where it plays them, thinned by time between them: Normal a quarter of a second,
    // Hard a sixteenth at 100 bpm; in four only: a pattern of sixteen steps squeezed into a bar of two is all off-beats)
    const cg = (level === 'normal' ? NORMAL_GAP : HARD_GAP) * (t.bpm / 60);
    let lastC = -Infinity;
    void lastC;
    // (Easy too: the conga player's notes on the beat first, then the ones that fit round them, a beginner's gap apart)
    const gapC = level === 'easy' ? (EASY_GAP * t.bpm) / 60 : cg;
    const onB = (h: (typeof own)[number]) => h.at !== undefined && Math.abs(h.at - Math.round(h.at)) < 1e-6;
    const mine: typeof own = [];
    if (s.meter === 4) {
      const order = [...own].sort((a, b) => Number(onB(b)) - Number(onB(a)) || a.beat - b.beat);
      for (const h of order) if (mine.every((k) => Math.abs(k.beat - h.beat) >= gapC - 1e-6)) mine.push(h);
      mine.sort((a, b) => a.beat - b.beat);
    }
    if (mine.length >= s.bars * s.starts.length * (level === 'easy' ? 1.2 : 0.75)) {
      for (const h of mine) add(h.beat, h.key, Number(h.key.slice(7)) % 2 ? 0.85 : 0.75, 0);
      // (and the low drum on the drummer's downbeats under it, so it's never sparser than Easy)
      for (const h of drumHits(bandStyle(s), planBars(s), s.meter, s.end).KICK) if (h.at !== undefined && h.mark === 'X' && Math.abs(h.at - Math.round(h.at)) < 1e-6) add(h.beat, 'congas:0', 0.8, 1);
    } else {
      const kit = ck ?? drumHits(bandStyle(s), planBars(s), s.meter, s.end);
      if (ck) for (const b of restingChords(s, ck, chords)) add(b, 'congas:0', 0.8, 0);
      for (const h of kit.KICK) if (h.at !== undefined && h.mark !== 'o' && keep(h.at) && (level !== 'easy' || h.mark === 'X' || h.mark === 'c')) add(h.beat, 'congas:0', 0.8, 0);
      for (const h of kit.SNARE) {
        if (h.at === undefined || h.mark === 'o' || h.mark === '-' || !keep(h.at)) continue;
        add(h.beat, h.mark === 'f' ? (Math.round(h.at * 2) % 2 ? 'congas:0' : 'congas:2') : 'congas:2', 0.8, 0);
      }
      if (level === 'hard') for (const h of kit.HAT) if (h.at !== undefined && h.mark === 'X' && Math.abs(h.at - Math.round(h.at)) > 1e-6 && keep(h.at)) add(h.beat, 'congas:3', 0.85, 1);
    }
  } else {
    // the drums: what the band's drummer plays (the very part your hits stand in for), at the places it plays them (a
    // dembow's snare on the 16ths that make it, an open hat off the beat): thinned by time between notes, not snapped
    // to a grid. Easy its downbeat kicks and its backbeat; Normal its kicks and snares a quarter of a second apart at
    // least, and a hat a beat where it marks one; Hard all but its ghost notes. Its fills where it fills, on its own
    // phrase ends
    live.push('kit:kick', 'kit:snare', 'kit:hat');
    // (a classic: the drummer on its own recording, src/songs/classic-kit.ts; where it rests, a kick with each new
    // chord, as its bass comes in)
    const ck = classicKit(s);
    const kit = ck ?? drumHits(bandStyle(s), planBars(s), s.meter, s.end);
    const spb = 60 / t.bpm;
    const beatOf = (at: number) => Math.abs(at - Math.round(at)) < 1e-6;
    type C = { beat: number; key: string; vel: number; rank: number };
    const ks: C[] = [];
    for (const h of kit.KICK) {
      if (h.at === undefined || h.mark === 'o') continue;
      if (level === 'easy' && !((h.mark === 'X' || h.mark === 'c') && beatOf(h.at))) continue;
      ks.push({ beat: h.beat, key: 'kit:kick', vel: h.mark === 'X' ? 0.9 : 0.75, rank: 0 });
    }
    for (const h of kit.SNARE) {
      if (h.at === undefined || h.mark === 'o' || (level !== 'hard' && h.mark === '-')) continue;
      // (Easy: the backbeat, and a fill's notes on the beat)
      if (level === 'easy' && h.mark === 'f' && !beatOf(h.at)) continue;
      const tom = h.drum === 'tom' || h.drum === 'floor';
      ks.push({ beat: h.beat, key: tom && opts.tom && level === 'hard' ? 'kit:tom' : 'kit:snare', vel: h.mark === 'X' || h.mark === 'f' ? 0.9 : 0.75, rank: 0 });
    }
    // (kicks first, then the snares that fit round them: none closer than the level's gap to a kept note, unless
    // together; so a dembow on Easy keeps its kicks on 1 and 3 and the snares that sit between)
    const gapS = level === 'easy' ? EASY_GAP : level === 'normal' ? NORMAL_GAP : HARD_GAP;
    const kept: C[] = [];
    // (the kick and the snare are two hands: from Normal up the gap is kept within each, so a dembow's snare a
    // sixteenth after its kick stays; Easy keeps it between them too)
    const fits = (c: C) => kept.every((k) => (level !== 'easy' && (k.key === 'kit:kick') !== (c.key === 'kit:kick')) || Math.abs(k.beat - c.beat) < 1e-6 || Math.abs(k.beat - c.beat) * spb >= gapS - 1e-6);
    if (ck) for (const b of restingChords(s, ck, chords)) ks.push({ beat: b, key: 'kit:kick', vel: 0.8, rank: 0 });
    ks.sort((a, b) => a.beat - b.beat);
    for (const pass of ['kit:kick', 'snare'] as const)
      for (const c of ks) if ((pass === 'kit:kick') === (c.key === 'kit:kick') && fits(c)) kept.push(c);
    kept.sort((a, b) => a.beat - b.beat);
    // the hats: Hard all of them (soft ones on the eighths); Normal one a beat, where the pattern marks it (an open hat
    // off the beat, for a dance groove); Easy only when its kick and backbeat leave a bar near empty (a ballad)
    const sparse = kept.length < s.bars * s.starts.length * 1.5;
    const hats: C[] = [];
    let beatSeen = -1;
    for (const h of kit.HAT) {
      if (h.at === undefined || h.mark === 'o' || h.mark === 'c') continue;
      if (level === 'hard') {
        if (h.mark === '-' && Math.abs(h.at * 2 - Math.round(h.at * 2)) > 1e-6) continue;
      } else if (level === 'normal') {
        // (where its recording keeps time on the beat, not with the style's drummer: its hats on the beat)
        if ((h.mark === '-' || t.hatsOnBeat) && !beatOf(h.at)) continue;
        const b = Math.floor(h.beat + 1e-6);
        if (b === beatSeen) continue;
        beatSeen = b;
      } else if (!sparse || !beatOf(h.at)) continue;
      hats.push({ beat: h.beat, key: 'kit:hat', vel: 0.6, rank: 1 });
    }
    // (a hat that would come a hair before or after a kept kick or snare goes: together, or apart by the gap)
    const near = (b: number) => kept.some((k) => Math.abs(k.beat - b) > 1e-6 && Math.abs(k.beat - b) * spb < gapS * 0.6);
    for (const c of kept) add(c.beat, c.key, c.vel, c.rank);
    for (const c of hats) if (!near(c.beat)) add(c.beat, c.key, c.vel, c.rank);
  }
  // (the drums and congas rest until the recording's drums come in)
  if ((inst === 'drums' || inst === 'congas') && t.drumsFrom && !classicKit(s)) {
    const from = s.starts[0] + t.drumsFrom * s.meter;
    for (let i = out.length - 1; i >= 0; i--) if (out[i].beat < from - 1e-6) out.splice(i, 1);
  }
  // in time order; one note per zone per moment, and two hands: the third at once goes (the lower-ranked first);
  // on Easy nothing closer than EASY_GAP to the note before
  out.sort((a, b) => a.beat - b.beat || a.rank - b.rank);
  // (Normal's gap only for a tune: a groove's eighths are what Normal is)
  const tuneGap = inst === 'piano' || inst === 'marimba' || inst === 'handpan';
  const gap = ((level === 'easy' ? EASY_GAP : NORMAL_GAP) * t.bpm) / 60 - 1e-6;
  const notes: ChartNote[] = [];
  const cover = new Map<string, Set<number>>();
  let lastAt = -Infinity;
  for (const n of out) {
    const same = notes.filter((m) => Math.abs(m.beat - n.beat) < 1e-6);
    if (same.some((m) => m.key === n.key) || same.length >= 2) continue;
    if ((level === 'easy' || (level === 'normal' && tuneGap)) && !same.length && n.beat - lastAt < gap) continue;
    notes.push({ beat: n.beat, key: n.key, vel: n.vel });
    lastAt = n.beat;
    if (n.covers) {
      let set = cover.get(n.covers);
      if (!set) cover.set(n.covers, (set = new Set()));
      set.add(beatKey(n.beat));
    }
  }
  return { notes, live, cover };
}

/** The chords that come in where a classic's recorded drums rest (a bar of theirs with no hit): their beats. */
function restingChords(s: Score, kit: Record<'KICK' | 'SNARE' | 'HAT', { beat: number }[]>, chords: readonly Chord[]): number[] {
  const busy = new Set<number>();
  for (const lane of [kit.KICK, kit.SNARE, kit.HAT]) for (const h of lane) busy.add(Math.floor((h.beat + 1e-6) / s.meter));
  return chords.filter((c) => c.beat < s.end - 1e-6 && !busy.has(Math.floor((c.beat + 1e-6) / s.meter))).map((c) => c.beat);
}

/** Where the last hit lights on each instrument: the tonic (or the kick and snare, the low conga, the strum). */
export function finalKeys(s: Score, inst: string): string[] {
  if (inst === 'piano') return [`piano:${Math.max(0, pianoKey(s.scale, 0, 0))}`];
  if (inst === 'marimba') return [`marimba:${Math.max(0, zoneOf('marimba', s.scale, 0))}`];
  if (inst === 'handpan') return ['handpan:0'];
  if (inst === 'guitar') return ['guitar:9'];
  if (inst === 'congas') return ['congas:0', 'congas:2'];
  return ['kit:kick', 'kit:snare'];
}
