/**
 * The band's arrangement of a written-out song (src/songs/score.ts): what its drummer, bassist, keys and percussion
 * play in the song's style, section by section. Each pass is a verse (its first half: the groove lighter, the keys
 * sparer) and a chorus (its second half: fuller, the hats opening, a tambourine or shaker), and the last time through
 * is the biggest; a fill ends each four-bar phrase, a bigger one leads into each section, and a crash lands on its
 * first beat. Drums carry accents and ghost notes, the hats lean into the swing where the style has one, and every
 * band note sits a few milliseconds this side or that of the grid, as players do.
 *
 * None of this is what you play: your notes come from the charts in score.ts (their grooves are separate and
 * unchanged), so judging never moves. Pure and deterministic (the "random" feel is hashed from the beat).
 */
import type { BedEvent } from './chart.js';
import type { SectionKind, Style } from './tunes.js';

/** One bar of a drum: a character a step (`X` an accent, `x` a hit, `-` soft, `o` a ghost, `.` a rest); `|` between
 * bars that alternate. */
export interface Kit {
  kick: string;
  snare: string;
  hat: string;
  open?: string;
  ride?: string;
  rim?: string;
  clap?: string;
}

export type BassSound = 'finger' | 'synth' | 'sub' | 'piano';
export type CompSound = 'piano' | 'stab' | 'organ' | 'skank';
export type PadSound = 'pad' | 'organ' | 'strings';
export type LeadSound = 'tongue' | 'keys' | 'lead' | 'reed' | 'marimba' | 'bell';

export interface BandStyle {
  /** Steps in a bar (16: sixteenths in four; 12: triplet eighths in four, or sixteenths in three). */
  steps: number;
  /** The off-steps lean late: 0.5 straight, 0.58 a light swing. */
  swing?: number;
  verse: Kit;
  chorus: Kit;
  fill: 'toms' | 'snare' | 'roll' | 'soft';
  /** Bass: `1` the chord's root, `3` `5` `6` `7` `8` its third, fifth, sixth, seventh and octave, `4` `2` the fourth
   * and second, `v` the fifth below, `b` a step into the next chord's root; `-` holds, `.` rests. */
  bass: { verse: string; chorus: string; sound: BassSound; hold?: number };
  /** Chord hits (drum characters for their weight), each `len` steps long. */
  comp: { verse: string; chorus: string; sound: CompSound; len: number };
  /** A held chord under it all (in the verse too, or only the chorus). */
  pad?: { sound: PadSound; verse: boolean };
  /** Shaker or tambourine (drum characters). */
  perc?: { verse?: string; chorus?: string; sound: 'shaker' | 'tambourine' };
  /** The band's congas (each step the zone: 0/1 the low drum's middle and edge, 2/3 the high one's). */
  congas?: { verse?: string; chorus?: string };
  /** What plays the tune when it isn't yours. */
  lead: LeadSound;
  /** Seconds the backbeat sits behind the beat (laid back). */
  laid?: number;
  /** How far the band's held parts dip under each kick (0: not at all), and how much room (reverb send). */
  duck: number;
  room: number;
}

const ROCK: BandStyle = {
  steps: 16,
  verse: { kick: 'X.......X.......|X.......X.x.....', snare: '....X.......X...', hat: 'X.-.x.-.x.-.x.-.' },
  chorus: { kick: 'X.....x.X.x.....|X.....x.X.....x.', snare: '....X.......X..o', hat: 'X.x.X.x.X.x.X...', open: '..............x.' },
  fill: 'toms',
  bass: { verse: '1-------1-----1-|1-------1---5-b-', chorus: '1.1.1.1.1.1.1.1.|1.1.1.1.5.5.8.b.', sound: 'finger', hold: 0.85 },
  comp: { verse: 'x.......x.......', chorus: 'x.....x...x.....', sound: 'piano', len: 5 },
  pad: { sound: 'organ', verse: false },
  perc: { chorus: '....x.......x...', sound: 'tambourine' },
  lead: 'lead',
  duck: 0.15,
  room: 0.13,
};

export const BAND_STYLES: Record<Style, BandStyle> = {
  rock: ROCK,
  anthem: {
    steps: 16,
    verse: { kick: 'X.......X.......', snare: '....X.......X...', hat: '-.-.-.-.-.-.-.-.' },
    chorus: { kick: 'X...X...X...X...', snare: '....X.......X...', hat: '', ride: 'X.x.X.x.X.x.X.x.' },
    fill: 'toms',
    bass: { verse: '1-------1-------|1-------5-----b-', chorus: '1.1.1.1.1.1.5.5.', sound: 'finger', hold: 0.9 },
    comp: { verse: 'x...............', chorus: 'x.......x.......', sound: 'piano', len: 8 },
    pad: { sound: 'strings', verse: true },
    perc: { chorus: '-.x.-.x.-.x.-.x.', sound: 'tambourine' },
    lead: 'lead',
    duck: 0.12,
    room: 0.2,
  },
  punk: {
    steps: 16,
    verse: { kick: 'X.......X.x.....', snare: '....X.......X...', hat: 'X.x.X.x.X.x.X.x.' },
    chorus: { kick: 'X...x...X...x...', snare: '..x...x...x...X.', hat: 'X.x.X.x.X.x.X.x.' },
    fill: 'snare',
    bass: { verse: '1.1.1.1.1.1.1.1.', chorus: '1.1.1.1.1.1.1.1.|1.1.1.1.5.5.8.8.', sound: 'finger', hold: 0.7 },
    comp: { verse: 'x.x.x.x.x.x.x.x.', chorus: 'X.x.X.x.X.x.X.x.', sound: 'piano', len: 2 },
    pad: { sound: 'organ', verse: false },
    lead: 'lead',
    duck: 0.1,
    room: 0.09,
  },
  ska: {
    steps: 16,
    verse: { kick: 'X.......X.......', snare: '....x.......x...', hat: '..x...x...x...x.', rim: '' },
    chorus: { kick: 'X.....x.X.......', snare: '....X..o....X.o.', hat: '-.x.-.x.-.x.-.x.', open: '' },
    fill: 'snare',
    bass: { verse: '1...3...5...6...|1...5...8...b...', chorus: '1.1.3.3.5.5.6.6.|8.8.5.5.3.3.b.b.', sound: 'finger', hold: 0.8 },
    comp: { verse: '..x...x...x...x.', chorus: '..X...X...X...X.', sound: 'skank', len: 1 },
    perc: { chorus: '-.x.-.x.-.x.-.x.', sound: 'shaker' },
    lead: 'reed',
    duck: 0.08,
    room: 0.13,
  },
  dance: {
    steps: 16,
    verse: { kick: 'X...X...X...X...', snare: '', hat: '..-...-...-...-.', clap: '....x.......x...' },
    chorus: { kick: 'X...X...X...X...', snare: '....x.......x...', hat: 'o.o.o.o.o.o.o.o.', open: '..x...x...x...x.', clap: '....X.......X...' },
    fill: 'roll',
    bass: { verse: '..1...1...1...1.', chorus: '..1.8.1...1.8.1.|..1.8.1...5.8.b.', sound: 'synth', hold: 0.8 },
    comp: { verse: '...x..x.......x.', chorus: '...x..x....x..x.', sound: 'stab', len: 2 },
    pad: { sound: 'pad', verse: true },
    perc: { chorus: '-x-x-x-x-x-x-x-x', sound: 'shaker' },
    lead: 'lead',
    duck: 0.45,
    room: 0.15,
  },
  synthpop: {
    steps: 16,
    verse: { kick: 'X.......X.......|X.......X.x.....', snare: '....x.......x...', hat: 'x.-.x.-.x.-.x.-.' },
    chorus: { kick: 'X...X...X...X...', snare: '....X.......X...', hat: 'x-x-x-x-x-x-x-x-', open: '' , clap: '....x.......x...' },
    fill: 'roll',
    bass: { verse: '1.1.1.1.1.1.1.1.', chorus: '1.8.1.8.1.8.1.8.|1.8.1.8.5.8.b.8.', sound: 'synth', hold: 0.6 },
    comp: { verse: '', chorus: 'x.....x.....x...', sound: 'stab', len: 3 },
    pad: { sound: 'pad', verse: true },
    perc: { verse: '..x...x...x...x.', chorus: '..x...x...x...x.', sound: 'shaker' },
    lead: 'lead',
    duck: 0.35,
    room: 0.16,
  },
  funk: {
    steps: 16,
    swing: 0.54,
    verse: { kick: 'X.........x..x..|X.....x...x.....', snare: '....X..o.o..X..o', hat: 'x-x-x-x-x-x-x-x-' },
    chorus: { kick: 'X.x.......x..x..|X.....x...x..x.x', snare: '....X..o.o.oX..o', hat: 'x-x-x-x-x-x-x-..', open: '..............x.' },
    fill: 'snare',
    bass: { verse: '1.....1.8..1..5.|1.....1...5.7.8.', chorus: '1..1..8.1.51.7.8|1..1..8.1..5.b.b', sound: 'finger', hold: 0.6 },
    comp: { verse: '....x.......x...', chorus: '..x.x..x..x.x..x', sound: 'stab', len: 1 },
    pad: { sound: 'organ', verse: false },
    perc: { chorus: '-.x.-.x.-.x.-.x.', sound: 'tambourine' },
    congas: { verse: '..3...3...3..23.', chorus: '..3.2.3...3.2.32' },
    lead: 'keys',
    laid: 0.004,
    duck: 0.1,
    room: 0.1,
  },
  hiphop: {
    steps: 16,
    swing: 0.58,
    verse: { kick: 'X.........X.....|X......x..X..x..', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.' },
    chorus: { kick: 'X.........X.....|X......x..X..x..', snare: '....X.......X..o', hat: 'x.xox.x.x.xox.x.', open: '' },
    fill: 'snare',
    bass: { verse: '1---------1-----|1------b1-....5-', chorus: '1---------1---8-|1------b1-..5-8-', sound: 'sub', hold: 0.95 },
    comp: { verse: 'x...............', chorus: 'x.........x.....', sound: 'piano', len: 6 },
    pad: { sound: 'pad', verse: true },
    lead: 'keys',
    laid: 0.008,
    duck: 0.25,
    room: 0.12,
  },
  shufflehop: {
    steps: 12,
    verse: { kick: 'X.....x.....|X....xx.....', snare: '...X.....X..', hat: 'x.-x.-x.-x.-' },
    chorus: { kick: 'X.....x.....|X....xx...x.', snare: '...X.....X.o', hat: 'x.xx.xx.xx.x' },
    fill: 'snare',
    bass: { verse: '1-----1-----|1-----1---5-', chorus: '1-----1--8--|1-----1---b-', sound: 'sub', hold: 0.9 },
    comp: { verse: 'x...........', chorus: 'x.....x.....', sound: 'piano', len: 4 },
    pad: { sound: 'pad', verse: true },
    congas: { chorus: '...3.....3.2' },
    lead: 'keys',
    laid: 0.008,
    duck: 0.2,
    room: 0.14,
  },
  reggaeton: {
    steps: 16,
    verse: { kick: 'X...x...X...x...', snare: '...x..x....x..x.', hat: 'x.-.x.-.x.-.x.-.' },
    chorus: { kick: 'X...x...X...x...', snare: '...X..x....X..x.', hat: 'x.xxx.xxx.xxx.xx', clap: '...x..x....x..x.' },
    fill: 'snare',
    bass: { verse: '1..1..1.1..1..1.', chorus: '1..1..8.1..1..5.', sound: 'sub', hold: 0.75 },
    comp: { verse: '...x..x....x..x.', chorus: 'x..x..x.x..x..x.', sound: 'stab', len: 2 },
    pad: { sound: 'pad', verse: true },
    perc: { chorus: 'x-x-x-x-x-x-x-x-', sound: 'shaker' },
    congas: { verse: '...3..2....3..2.', chorus: '..23.2.3..23.2.3' },
    lead: 'marimba',
    duck: 0.3,
    room: 0.14,
  },
  reggae: {
    steps: 16,
    swing: 0.55,
    verse: { kick: '........X.......', snare: '', hat: 'x.-.x.-.x.-.x.-.', rim: '........x.......' },
    chorus: { kick: '........X.......', snare: '........X.......', hat: 'x-x-x-x-x-x-x-x-', rim: '' },
    fill: 'soft',
    bass: { verse: '1-----5-8---5-1-|1-----5-v---b---', chorus: '1-----5-8---5-1-|1---3---5---b---', sound: 'finger', hold: 0.8 },
    comp: { verse: '....x.......x...', chorus: '....X.......X...', sound: 'skank', len: 1 },
    pad: { sound: 'organ', verse: true },
    perc: { verse: '..x...x...x...x.', chorus: '..x...x...x...x.', sound: 'shaker' },
    congas: { chorus: '..3...3...32..3.' },
    lead: 'reed',
    laid: 0.01,
    duck: 0.06,
    room: 0.2,
  },
  ballad: {
    steps: 16,
    verse: { kick: 'X.......X.......', snare: '', hat: '-.-.-.-.-.-.-.-.', rim: '....x.......x...' },
    chorus: { kick: 'X.......X.x.....', snare: '....X.......X...', hat: 'x.-.x.-.x.-.x.-.' },
    fill: 'soft',
    bass: { verse: '1-------5-------', chorus: '1-------1---5---|1-------5---b---', sound: 'piano', hold: 0.95 },
    comp: { verse: 'x.......x.......', chorus: 'x...x...x...x...', sound: 'piano', len: 8 },
    pad: { sound: 'strings', verse: true },
    perc: { chorus: '-.x.-.x.-.x.-.x.', sound: 'shaker' },
    lead: 'keys',
    duck: 0.05,
    room: 0.24,
  },
  three: {
    steps: 12,
    verse: { kick: 'X...........', snare: '', hat: '-.-.-.-.-.-.', rim: '........x...' },
    chorus: { kick: 'X.....x.....', snare: '........X...', hat: 'x.-.x.-.x.-.' },
    fill: 'soft',
    bass: { verse: '1-------5---', chorus: '1-------5---|1-------b---', sound: 'piano', hold: 0.95 },
    comp: { verse: 'x...x...x...', chorus: 'x...x...x...', sound: 'piano', len: 4 },
    pad: { sound: 'strings', verse: true },
    perc: { chorus: '-.x.x.-.x.x.', sound: 'shaker' },
    lead: 'keys',
    duck: 0.05,
    room: 0.24,
  },
};

const VEL: Record<string, number> = { X: 1, x: 0.78, '-': 0.55, o: 0.3 };

/** A note's feel, hashed from where it falls (the same every time). */
function hash(beat: number, salt: number): number {
  let h = Math.imul(Math.round(beat * 96) + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt + 1, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x27d4eb2f);
  h ^= h >>> 13;
  return ((h >>> 0) % 10000) / 10000;
}
const jitter = (beat: number, salt: number, amount: number) => (hash(beat, salt) * 2 - 1) * amount;

/** One bar of a pattern that may alternate (`a|b`). */
export function pick(pattern: string | undefined, n: number): string {
  if (!pattern) return '';
  const bars = pattern.split('|');
  return bars[n % bars.length];
}

/** Where a bar sits in the song, and how big it plays. */
export interface BarPlan {
  beat: number;
  /** Its bar in the pass (−1: a solo's). */
  bar: number;
  pass: number;
  chorus: boolean;
  solo: boolean;
  /** 0..1: how big the band plays here. */
  level: number;
  /** A fill at its end: 0 none, 1 into the next phrase, 2 into the next section (or the last hit). */
  fill: 0 | 1 | 2;
  /** A crash on its first beat. */
  crash: boolean;
  /** Its section (a song in its whole form). */
  kind?: SectionKind;
}

export interface SongShape {
  meter: number;
  bars: number;
  starts: readonly number[];
  solos: readonly (readonly [number, number])[];
  end: number;
  sections?: readonly { bar: number; kind: SectionKind }[] | null;
}

/** How big the band plays each kind of section (and it grows a little through the song). */
const SECTION_LEVEL: Record<SectionKind, number> = { intro: 0.45, verse: 0.6, chorus: 0.85, bridge: 0.7, break: 0.42, solo: 0.5, outro: 0.55 };

/** The bars the band plays, through each pass and solo, up to the last hit. */
export function planBars(s: SongShape): BarPlan[] {
  const out: BarPlan[] = [];
  const sec = s.sections;
  if (sec?.length) {
    // a song in its whole form: each section as big as its kind, a fill into each, a crash as each starts
    let si = 0;
    for (let k = 0; k < s.bars; k++) {
      const beat = s.starts[0] + k * s.meter;
      if (beat >= s.end - 1e-6) break;
      while (si + 1 < sec.length && sec[si + 1].bar <= k) si++;
      const kind = sec[si].kind;
      const level = Math.min(1, SECTION_LEVEL[kind] + (0.15 * si) / Math.max(1, sec.length - 1));
      const next = sec[si + 1]?.bar ?? s.bars;
      const intoEnd = beat + s.meter >= s.end - 1e-6;
      const fill: 0 | 1 | 2 = kind === 'solo' ? 0 : intoEnd || k + 1 === next ? 2 : (k + 1 - sec[si].bar) % 4 === 0 ? 1 : 0;
      out.push({ beat, bar: k, pass: si, chorus: kind === 'chorus', solo: kind === 'solo', level, fill, crash: k === sec[si].bar && kind !== 'break' && kind !== 'solo', kind });
    }
    return out;
  }
  const half = s.bars >= 8 ? Math.max(4, Math.round(s.bars / 8) * 4) : s.bars;
  const passes = s.starts.length;
  s.starts.forEach((st, p) => {
    const lastPass = passes > 1 && p === passes - 1;
    for (let k = 0; k < s.bars; k++) {
      const beat = st + k * s.meter;
      if (beat >= s.end - 1e-6) break;
      const chorus = k >= half;
      const level = p === 0 ? (chorus ? 0.8 : 0.55) : lastPass ? (chorus ? 1 : 0.75) : chorus ? 0.85 : 0.7;
      const next = k + 1;
      const intoEnd = beat + s.meter >= s.end - 1e-6;
      const fill: 0 | 1 | 2 = intoEnd || next === half || next === s.bars ? 2 : next % 4 === 0 ? 1 : 0;
      out.push({ beat, bar: k, pass: p, chorus, solo: false, level, fill, crash: k === 0 || k === half });
    }
  });
  for (const [a, z] of s.solos) for (let b = a; b < z - 1e-6; b += s.meter) out.push({ beat: b, bar: -1, pass: -1, chorus: false, solo: true, level: 0.5, fill: 0, crash: false });
  return out.sort((x, y) => x.beat - y.beat);
}

export interface Hit {
  beat: number;
  key: string;
  vel: number;
  /** Seconds off the grid (the feel). */
  late: number;
  /** For the player's chart: which drum, its mark in the pattern (X accent, x, - soft, o ghost, f a fill, c a crash), and
   * where in its bar (beats from the bar's start, unswung). */
  drum?: string;
  mark?: string;
  at?: number;
}

const KEY: Record<string, string> = { kick: 'kit:kick', snare: 'kit:snare', hat: 'kit:hat', open: 'kit:open', ride: 'kit:ride', rim: 'kit:rim', clap: 'clap:0', tom: 'kit:tom', floor: 'kit:floor', crash: 'kit:crash' };
/** Which of the band's parts a drum belongs to (you on the drums: all of them are yours). */
export const DRUM_PART: Record<string, 'KICK' | 'SNARE' | 'HAT'> = { kick: 'KICK', snare: 'SNARE', rim: 'SNARE', clap: 'SNARE', tom: 'SNARE', floor: 'SNARE', hat: 'HAT', open: 'HAT', ride: 'HAT', crash: 'HAT' };

/** A step's beat in its bar, swung. */
function stepAt(i: number, steps: number, meter: number, swing: number): number {
  const len = meter / steps;
  return i * len + (i % 2 === 1 && steps === 16 ? (swing - 0.5) * 2 * len : 0);
}

/** The fill over a bar's last `n` steps: [step, drum, velocity]. */
function fillHits(kind: BandStyle['fill'], big: boolean, steps: number, meter: number): [number, string, number][] {
  const beat = steps / meter;
  const n = big ? beat * 2 : beat;
  const at = steps - n;
  const out: [number, string, number][] = [];
  if (kind === 'roll') {
    // a snare roll rising into the drop
    for (let k = 0; k < n; k++) out.push([at + k, 'snare', 0.3 + (0.65 * k) / Math.max(1, n - 1)]);
    return out;
  }
  if (kind === 'snare') {
    for (let k = 0; k < n; k++) if (big || k % 2 === 0 || k === n - 1) out.push([at + k, 'snare', (k === n - 1 ? 0.95 : 0.55) + (0.25 * k) / n]);
    return out;
  }
  if (kind === 'soft') {
    // a light walk round the toms (a cross-stick flick on a short one)
    if (!big) return [[at + n - 2, 'snare', 0.45], [at + n - 1, 'snare', 0.6]];
    for (let k = 0; k < n; k += 2) out.push([at + k, k < n / 2 ? 'tom' : 'floor', 0.5 + (0.2 * k) / n]);
    return out;
  }
  // round the kit: snare, then down the toms
  if (!big) {
    for (let k = 0; k < n; k++) out.push([at + k, 'snare', 0.5 + (0.4 * k) / Math.max(1, n - 1)]);
    return out;
  }
  for (let k = 0; k < n; k++) out.push([at + k, k < n / 4 ? 'snare' : k < (3 * n) / 4 ? 'tom' : 'floor', 0.65 + (0.3 * k) / n]);
  out.push([at, 'kick', 0.85]);
  return out;
}

/** The drummer: every drum's hits through the song, by part. */
export function drumHits(st: BandStyle, plan: readonly BarPlan[], meter: number, end: number): Record<'KICK' | 'SNARE' | 'HAT', Hit[]> {
  const out: Record<'KICK' | 'SNARE' | 'HAT', Hit[]> = { KICK: [], SNARE: [], HAT: [] };
  const swing = st.swing ?? 0.5;
  const steps = st.steps;
  plan.forEach((b, n) => {
    const kit = b.chorus ? st.chorus : st.verse;
    const fill = b.fill ? fillHits(st.fill, b.fill === 2, steps, meter) : [];
    const from = fill.length ? Math.min(...fill.map((f) => f[0])) : steps;
    const scale = 0.84 + 0.16 * b.level;
    const add = (drum: string, i: number, v: number, mark: string) => {
      const beat = b.beat + stepAt(i, steps, meter, swing);
      if (beat >= end - 1e-6) return;
      const salt = drum.length * 7 + drum.charCodeAt(0);
      // the feel: hats and ghosts drift a little, the backbeat sits back where the style lays it, the kick is the grid
      const back = drum === 'snare' || drum === 'clap' || drum === 'rim' ? (st.laid ?? 0) : 0;
      const drift = drum === 'kick' ? 0.0015 : v < 0.4 ? 0.006 : 0.004;
      // (the hats and cymbals a step back in the kit, as a drummer plays them under the backbeat)
      const kitLevel = drum === 'hat' || drum === 'open' || drum === 'ride' ? 0.82 : 1;
      out[DRUM_PART[drum]].push({ beat, key: KEY[drum], vel: Math.min(1, v * kitLevel * scale * (1 + jitter(beat, salt, 0.06))), late: back + jitter(beat, salt + 3, drift), drum, mark, at: (i * meter) / steps });
    };
    for (const drum of ['kick', 'snare', 'hat', 'open', 'ride', 'rim', 'clap'] as const) {
      const pat = pick(kit[drum], b.solo ? 0 : n);
      for (let i = 0; i < pat.length; i++) {
        const v = VEL[pat[i]];
        if (v === undefined) continue;
        // the fill takes over the end of the bar (the hat keeps time through a short one, and a dance kick keeps four
        // on the floor through its roll)
        const keeps = (drum === 'hat' || drum === 'ride') && (b.fill === 1 || st.fill === 'roll');
        if (i >= from && !keeps && !(drum === 'kick' && st.fill === 'roll')) continue;
        // (a crash stands in for the hat on its beat)
        if (i === 0 && b.crash && (drum === 'hat' || drum === 'ride' || drum === 'open')) continue;
        add(drum, i, v, pat[i]);
      }
    }
    if (b.crash) {
      add('crash', 0, 0.62 + 0.3 * b.level, 'c');
      if (!pick(kit.kick, n).startsWith('X')) add('kick', 0, 0.9, 'X');
    }
    for (const [i, drum, v] of fill) add(drum, i, v, 'f');
  });
  for (const k of Object.keys(out) as (keyof typeof out)[]) out[k].sort((a, c) => a.beat - c.beat);
  return out;
}

/** The band's congas (zones as keys 'congas:N'). */
export function congaHits(st: BandStyle, plan: readonly BarPlan[], meter: number, end: number): Hit[] {
  const out: Hit[] = [];
  if (!st.congas) return out;
  plan.forEach((b, n) => {
    if (b.solo) return;
    const pat = pick(b.chorus ? st.congas!.chorus : st.congas!.verse, n);
    for (let i = 0; i < pat.length; i++) {
      const z = pat[i];
      if (z < '0' || z > '3') continue;
      const beat = b.beat + stepAt(i, st.steps, meter, st.swing ?? 0.5);
      if (beat >= end - 1e-6) continue;
      out.push({ beat, key: `congas:${z}`, vel: (z === '1' || z === '3' ? 0.16 : 0.12) * (0.85 + 0.15 * b.level) * (1 + jitter(beat, 11, 0.08)), late: jitter(beat, 12, 0.005), at: (i * meter) / st.steps });
    }
  });
  return out;
}

export interface ChordSpan {
  beat: number;
  len: number;
  semis: number;
  minor: boolean;
}

const INTERVAL: Record<string, (minor: boolean) => number> = { '1': () => 0, '2': () => 2, '3': (m) => (m ? 3 : 4), '4': () => 5, '5': () => 7, '6': () => 9, '7': () => 10, '8': () => 12, v: () => -5 };

export interface BassNote {
  beat: number;
  midi: number;
  len: number;
  vel: number;
  late: number;
}

/**
 * The bass: its style's line on each chord, the root always on a chord's first beat, a step into the next chord where
 * the line asks for one. Roots sit in the octave from C2 (MIDI 36).
 */
export function bassLine(st: BandStyle, plan: readonly BarPlan[], meter: number, spans: readonly ChordSpan[], keyPc: number, end: number): BassNote[] {
  const chordAt = (b: number) => spans.find((x) => b >= x.beat - 1e-6 && b < x.beat + x.len - 1e-6);
  const root = (c: ChordSpan) => 36 + ((keyPc + c.semis) % 12);
  const steps = st.steps;
  const len = meter / steps;
  const out: BassNote[] = [];
  for (let n = 0; n < plan.length; n++) {
    const b = plan[n];
    if (b.solo) continue;
    const pat = pick(b.chorus ? st.bass.chorus : st.bass.verse, n);
    // each onset, with how long until the next one (or a rest)
    const on: { i: number; ch: string; steps: number }[] = [];
    for (let i = 0; i < pat.length; i++) {
      const ch = pat[i];
      if (ch === '.' || ch === '-') continue;
      let k = i + 1;
      while (k < pat.length && pat[k] === '-') k++;
      on.push({ i, ch, steps: k - i });
    }
    for (const o of on) {
      const beat = b.beat + stepAt(o.i, steps, meter, st.swing ?? 0.5);
      if (beat >= end - 1e-6) continue;
      const c = chordAt(beat);
      if (!c) continue;
      let midi: number;
      if (o.ch === 'b') {
        // a step into what comes next: a semitone under the next chord's root (or a tone under this one's)
        const nb = b.beat + meter;
        const next = chordAt(Math.min(nb, end - 1e-3)) ?? c;
        const target = root(next);
        midi = next === c ? target - 2 : target - 1;
        if (midi < 33) midi += 12;
      } else midi = root(c) + (INTERVAL[o.ch]?.(c.minor) ?? 0);
      if (midi < 28) midi += 12;
      const first = Math.abs(beat - c.beat) < 1e-6;
      const onBeat = Math.abs(beat - Math.round(beat)) < 1e-6;
      out.push({ beat, midi: first ? root(c) : midi, len: Math.max(len, o.steps * len * (st.bass.hold ?? 0.85)), vel: first ? 0.95 : onBeat ? 0.84 : 0.7, late: jitter(beat, 21, 0.003) });
    }
  }
  // each chord's root on its first beat, even where the line rests
  for (const c of spans) {
    if (c.beat >= end - 1e-6 || out.some((x) => Math.abs(x.beat - c.beat) < 1e-6)) continue;
    const nextOn = out.filter((x) => x.beat > c.beat).reduce((m, x) => Math.min(m, x.beat), c.beat + c.len);
    out.push({ beat: c.beat, midi: root(c), len: Math.max(0.5, (nextOn - c.beat) * 0.9), vel: 0.9, late: 0 });
  }
  return out.sort((a, c) => a.beat - c.beat);
}

/**
 * The keys (and the shaker or tambourine): each chord's hits in its style's comping rhythm, a held chord under them,
 * the solos held softly. Events for the bed (src/songs/chart.ts), on the song's beats.
 */
export function compEvents(st: BandStyle, plan: readonly BarPlan[], meter: number, spans: readonly ChordSpan[], solo: ChordSpan | null, keyPc: number, end: number): BedEvent[] {
  const out: BedEvent[] = [];
  const midiOf = (c: ChordSpan) => 60 + ((keyPc + c.semis) % 12);
  const chordAt = (b: number) => spans.find((x) => b >= x.beat - 1e-6 && b < x.beat + x.len - 1e-6);
  const steps = st.steps;
  const len = meter / steps;
  // the held chord: one each chord (each solo's too), in the verse only if the style has it there
  if (st.pad)
    for (const c of spans) {
      const b = plan.find((p) => !p.solo && c.beat >= p.beat - 1e-6 && c.beat < p.beat + meter - 1e-6);
      if (!b || (!b.chorus && !st.pad.verse)) continue;
      out.push({ beat: c.beat, voice: 'chord', midi: midiOf(c), len: Math.min(c.len, end - c.beat), vel: 0.3 + 0.12 * b.level, minor: c.minor, sound: st.pad.sound });
    }
  plan.forEach((b, n) => {
    if (b.solo) {
      if (solo) out.push({ beat: b.beat, voice: 'chord', midi: midiOf(solo), len: meter, vel: 0.3, minor: solo.minor, sound: st.pad?.sound ?? 'piano' });
      return;
    }
    const pat = pick(b.chorus ? st.comp.chorus : st.comp.verse, n);
    for (let i = 0; i < pat.length; i++) {
      const v = VEL[pat[i]];
      if (v === undefined) continue;
      const beat = b.beat + stepAt(i, steps, meter, st.swing ?? 0.5);
      if (beat >= end - 1e-6) continue;
      const c = chordAt(beat);
      if (!c) continue;
      const l = Math.min(st.comp.len * len, c.beat + c.len - beat);
      out.push({ beat, voice: 'chord', midi: midiOf(c), len: l, vel: v * (0.32 + 0.14 * b.level), minor: c.minor, sound: st.comp.sound });
    }
    const pp = st.perc && pick(b.chorus ? st.perc.chorus : st.perc.verse, n);
    if (pp)
      for (let i = 0; i < pp.length; i++) {
        const v = VEL[pp[i]];
        if (v === undefined) continue;
        const beat = b.beat + stepAt(i, steps, meter, st.swing ?? 0.5);
        if (beat >= end - 1e-6) continue;
        out.push({ beat, voice: 'perc', midi: 0, len: len, vel: v * (0.7 + 0.3 * b.level) * (1 + jitter(beat, 31, 0.1)), sound: st.perc!.sound });
      }
  });
  return out;
}
