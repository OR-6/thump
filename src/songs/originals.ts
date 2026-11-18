/**
 * Three originals produced as records are, each from scratch (pure data, no system or DOM): a disco-funk cut, an
 * amapiano groove and a pop-punk song. Each has its own drummer, bass player and rhythm part written out bar by bar,
 * section by section, alongside its melody and chords, so nothing about one is shared with the others (nor with the
 * style grooves in src/songs/arrange.ts, which every other original is played in). tools/stems/arrange-stems.ts
 * renders their recordings from exactly these parts, and src/songs/score.ts makes every instrument's chart from the
 * same ones (the drums and congas from the drum part, the handpan from the bass, the guitar from the rhythm part, the
 * piano and marimba from the melody), so every note you're asked to play is one the recording has.
 *
 * A section's parts are patterns of sixteen steps a bar (`|` between bars, which cycle through the section), and `at`
 * gives a bar of its own (by its index in the section; −1 the last): a fill, a stop, a part coming in. Drums: `X` an
 * accent, `x` a hit, `-` soft, `o` a ghost, `F` `f` a fill's hits (loud, soft), `.` a rest. Congas: the zone (0/1 the
 * low drum's open tone and slap, 2/3 the high one's). Bass: `1` the chord's root, `2` `3` `4` `5` `6` `7` `8` `9` its
 * second, third, fourth, fifth, sixth, flat seventh, octave and ninth, `v` the fifth below, `b` a semitone under the
 * next chord's root, `o` a dead note, `-` held. Rhythm part: `X` a chord struck hard, `x` struck, `v` brushed
 * lightly, `o` a muted scratch (the strings damped: no note to play), `-` held. It's charted as a chart's author
 * would: Easy strums the `X`s, Normal the `x`s too, Hard the `v`s as well. A bass note or a chord is held through
 * its `-`s, then rings into the rest after it as far as the production's `hold` says.
 */
import type { SectionKind, Style, Tune } from './tunes.js';

/** One bar's parts (a lane left out: whatever the section plays; '' silences it). */
export interface Lanes {
  kick?: string;
  snare?: string;
  clap?: string;
  rim?: string;
  hat?: string;
  pedal?: string;
  open?: string;
  ride?: string;
  crash?: string;
  tom?: string;
  hitom?: string;
  floor?: string;
  congas?: string;
  shaker?: string;
  tamb?: string;
  cowbell?: string;
  bass?: string;
  comp?: string;
}
export interface ProdSection {
  /** What it is, and its name in the arrangement ('verse 2', 'last chorus'): the recording's extra parts go by it. */
  kind: SectionKind;
  name: string;
  melody: string;
  chords: string;
  band: Lanes;
  at?: Record<number, Lanes>;
}
export interface Production {
  id: string;
  name: string;
  bpm: number;
  key: string;
  /** The nearest of the game's own styles: only for its synthesised band's mix (src/songs/arrange.ts). */
  style: Style;
  /** The off-sixteenths lean late (0.5 straight). */
  swing: number;
  /** Seconds the backbeat (snare, clap, rim) sits behind the beat. */
  laid: number;
  /** The bass's roots sit from this MIDI note up an octave. */
  bassLo: number;
  /** How much of the rest after a bass note, and after a chord of the rhythm part, it rings through (1 to the next). */
  hold: { bass: number; comp: number };
  sections: ProdSection[];
}

const STEPS = 16;

// ------------------------------------------------------------------ Velvet Rope: disco-funk

// (four on the floor, the closed hat on the beat with its sixteenths ghosted, the open hat on every "and")
const FOUR = 'X...X...X...X...';
const BACK = '....X.......X...';
const DISCO_HAT = 'x-.-x-.-x-.-x-.-';
const DISCO_OPEN = '..x...x...x...x.';
const DISCO_CONGAS = '..2..3.2..2.0.0.';
const DISCO_OCTAVES = '1.8.1.8.1.8.1.8.|1.8.1.8.1.8.5.7.';
const DISCO_CHANK = 'v.x.o.X.v.x.o.X.|v.x.o.X.o.x.v.X.';
const DISCO_REST: Lanes = { kick: '', snare: '', clap: '', hat: '', open: '', tom: '', floor: '', congas: '', tamb: '', shaker: '', bass: '', comp: '' };

const VR_VERSE: ProdSection = {
  kind: 'verse',
  name: 'verse',
  melody: 'A2 z A c A G A | z2 E G A2 z2 | A2 z A c A G A | z2 c d e2 d2 | e2 z e d c A c | z2 A G A2 z2 | F2 A2 c3 A | B2 ^G2 E4',
  chords: 'Am7 | D7 | Am7 | D7 | Am7 | D7 | F | E7',
  band: { kick: FOUR, snare: '....X.......X...|....X.......X..o', hat: DISCO_HAT, open: DISCO_OPEN, comp: DISCO_CHANK, bass: DISCO_OCTAVES, congas: DISCO_CONGAS },
  at: {
    3: { snare: '....X.......X.x.', open: '..x...x...x...X.' },
    6: { bass: '1.8.1.8.1.8.1.8.' },
    7: { bass: '1.8.1.8.1.8.3.5.', snare: '....X.......ffFF' },
  },
};
const VR_PRE: ProdSection = {
  kind: 'bridge',
  name: 'pre-chorus',
  melody: 'd2 d2 c d- d2 | e2 e2 d e- e2 | f2 f2 e f- f e | e2 ^g2 b4',
  chords: 'Dm7 | Em7 | F | E7',
  band: { kick: FOUR, snare: BACK, hat: 'x.x.x.x.x.x.x.x.', comp: 'X---x---X---x---', bass: '1---1---1---1---', congas: '..2...2...2...2.' },
  at: {
    2: { snare: 'X...X...X...X...', comp: 'X.x.X.x.X.x.X.x.', bass: '1.1.1.1.1.1.1.1.' },
    3: { snare: 'X.x.X.x.ffffFFFF', hat: '', comp: 'X.x.X.x.X.x.X.x.', bass: '1.1.1.1.1.1.1.1.' },
  },
};
const VR_CHORUS: ProdSection = {
  kind: 'chorus',
  name: 'chorus',
  melody: "a2 a2 g a- a2 | b2 a g- g4 | g2 g2 e g- g2 | a e- e4 z2 | a2 a2 g a- a2 | b2 a g- g2 a b | c'4 b2 ^g2 | a6 z2",
  chords: 'F | G | Em7 | Am7 | F | G | F E7 | Am7',
  band: { kick: FOUR, snare: BACK, clap: '....X.......X...', hat: DISCO_HAT, open: '..X...X...X...X.', tamb: '-.x.-.x.-.x.-.x.', comp: 'X.o.x.X.v.x.o.X.|X.o.x.X.v.x.o.Xo', bass: '1..81.8.1..81.8.|1..81.8.1..81.85', congas: '0.2..3.2..2.0.3.' },
  at: {
    0: { crash: 'X...............' },
    3: { snare: '....X.......X.xx' },
    4: { crash: 'X...............' },
    7: { snare: '....X...F.f.....', tom: '............FF..', floor: '..............FF', open: '..X...X.........' },
  },
};
const VELVET_ROPE: Production = {
  id: 'velvet-rope',
  name: 'Velvet Rope',
  bpm: 120,
  key: 'Am',
  style: 'funk',
  swing: 0.52,
  laid: 0.006,
  bassLo: 33,
  hold: { bass: 0.55, comp: 0.5 },
  sections: [
    {
      // the guitar's chank, the hats and a handclap alone over a Rhodes, then the floor drops with the strings' riff
      kind: 'intro',
      name: 'intro',
      melody: 'z8 | z8 | z8 | z8 | z e z e g a z e | d c A c4 z | z e z e g a b a | a e d e- e4',
      chords: 'Am7 | D7 | Am7 | D7 | Am7 | D7 | Am7 | D7',
      band: { kick: FOUR, snare: BACK, clap: '....x.......x...', hat: DISCO_HAT, open: DISCO_OPEN, comp: DISCO_CHANK, bass: DISCO_OCTAVES, congas: DISCO_CONGAS },
      at: {
        0: { kick: '', snare: '', bass: '', congas: '' },
        1: { kick: '', snare: '', bass: '', congas: '' },
        2: { kick: '', snare: '', bass: '', congas: '' },
        3: { kick: '', snare: '............ffFF', clap: '....x...........', bass: '', congas: '' },
        4: { crash: 'X...............' },
        7: { snare: '....X...........', tom: '............FF..', floor: '..............FF' },
      },
    },
    VR_VERSE,
    VR_PRE,
    VR_CHORUS,
    { ...VR_VERSE, name: 'verse 2', band: { ...VR_VERSE.band, tamb: '....x.......x...' } },
    { ...VR_PRE, name: 'pre-chorus 2' },
    { ...VR_CHORUS, name: 'chorus 2' },
    {
      // the breakdown: the bass alone with the claps and congas, then everything builds back on a snare roll
      kind: 'break',
      name: 'breakdown',
      melody: 'f4 e4 | c6 z2 | f4 e4 | A6 z2 | A2 c2 f2 a2 | b2 a2 g2 d2 | e2 ^g2 b2 ^g2 | b6 z2',
      chords: 'Dm7 | Am7 | Dm7 | Am7 | F | G | E7 | E7',
      band: { kick: '', snare: '', clap: '....X.......X...', bass: '1...8.1.7.8.5.3.|1...8.1.5.7.8.5.', congas: DISCO_CONGAS },
      at: {
        4: { kick: FOUR, snare: 'x...x...x...x...', hat: 'x.x.x.x.x.x.x.x.', comp: 'X.v.x.v.X.v.x.v.', bass: '1.1.1.1.1.1.1.1.' },
        5: { kick: FOUR, snare: 'x.x.x.x.x.x.x.x.', hat: 'x.x.x.x.x.x.x.x.', comp: 'X.v.x.v.X.v.x.v.', bass: '1.1.1.1.1.1.1.1.' },
        6: { kick: FOUR, snare: 'fffffffffffffffF', hat: 'x.x.x.x.x.x.x.x.', open: DISCO_OPEN, comp: 'X.x.X.x.X.x.X.x.', bass: '1.1.1.1.1.1.1.1.' },
        7: { kick: 'X...X...X.......', snare: 'FFFFFFFFFFFF....', open: DISCO_OPEN, comp: 'X.x.X.x.X.x.....', bass: '1.1.1.1.1.......' },
      },
    },
    { ...VR_CHORUS, name: 'last chorus', band: { ...VR_CHORUS.band, tamb: 'x-x-x-x-x-x-x-x-' } },
    {
      kind: 'outro',
      name: 'outro',
      melody: "a2 a2 g a- a2 | b2 a g- g4 | c'4 b2 ^g2 | a8",
      chords: 'F | G | F E7 | Am7',
      band: { ...VR_CHORUS.band, tamb: 'x-x-x-x-x-x-x-x-' },
      at: { 2: { snare: '....X...F.f.F.F.' }, [-1]: { ...DISCO_REST, kick: 'X...............', crash: 'X...............', bass: '1---------------', comp: 'X---------------' } },
    },
  ],
};

// ------------------------------------------------------------------ Night Market: amapiano

// (the kick on one and three in a verse, four on the floor in a chorus; the hat leaning on its off-sixteenths; the
// log drum's figure: a long note on one, then three late in the bar)
const LOG = '1-.....1..1.8.5.|1-.....1..5.1-8.';
const AMA_HAT = 'x-X-x-X-x-X-x-X-';
const AMA_SHAKER = 'x-x-x-x-x-x-x-x-';
const AMA_CONGAS = '..2..3..0.2..3..|..2..3..0.2.3.3.';
const AMA_STABS = 'X..v..x...x.X...|..X..v..X.x..v..';
const AMA_REST: Lanes = { kick: '', snare: '', clap: '', rim: '', hat: '', open: '', congas: '', shaker: '', bass: '', comp: '' };

const NM_VERSE: ProdSection = {
  kind: 'verse',
  name: 'verse',
  melody: 'z D D F- F D C D | z2 D C D2 B,2 | z C C E- E C A, C | z2 A G A2 F2 | z D D F- F D C D | z2 D C D2 F2 | G2 F E- E2 C2 | ^C2 E2 A,4',
  chords: 'Dm7 | Gm7 | C | F | Dm7 | Gm7 | C | A7',
  band: { kick: 'X.......X.......|X.......X.....x.', clap: '....x.......x...', hat: AMA_HAT, shaker: AMA_SHAKER, bass: LOG, comp: AMA_STABS },
  at: {
    0: { comp: '' },
    1: { comp: '' },
    2: { comp: '' },
    3: { comp: '', clap: '....x.......x.x.' },
    7: { clap: '....x.......ffff' },
  },
};
const NM_PRE: ProdSection = {
  kind: 'bridge',
  name: 'pre-chorus',
  melody: 'B2 B B B2 A G | c2 c c c2 B A | d2 d d d2 c B | e2 e e d4',
  chords: 'Gm7 | C7 | Bb | C',
  band: { clap: '....x.......x...', hat: 'x-x-x-x-x-x-x-x-', shaker: AMA_SHAKER, bass: '1-------1-------', comp: '..X...X...X...X.' },
  at: {
    2: { clap: 'x...x...x...x...', rim: '..x...x...x...x.' },
    3: { kick: 'X...X...X...X...', clap: 'x.x.x.x.ffffFFFF', bass: '1-..1-..1-..1-..' },
  },
};
const NM_CHORUS: ProdSection = {
  kind: 'chorus',
  name: 'chorus',
  melody: 'f2 d f- f2 d c | e2 c G- G4 | e2 c e- e2 d c | d2 A F- F4 | f2 d f- f2 d c | e2 c e- e2 d e | f4 e2 ^c2 | d6 z2',
  chords: 'Bb | C | Am7 | Dm7 | Bb | C | Bb A7 | Dm7',
  band: { kick: FOUR, clap: '....X.......X...', hat: AMA_HAT, shaker: AMA_SHAKER, congas: AMA_CONGAS, bass: LOG, comp: AMA_STABS },
  at: {
    0: { crash: '-...............' },
    3: { clap: '....X.......X.x.' },
    7: { kick: 'X...X...X.......', clap: '....X.......ffFF' },
  },
};
const NIGHT_MARKET: Production = {
  id: 'night-market',
  name: 'Night Market',
  bpm: 112,
  key: 'Dm',
  style: 'dance',
  swing: 0.56,
  laid: 0.004,
  bassLo: 33,
  hold: { bass: 0.9, comp: 0.3 },
  sections: [
    {
      // the Rhodes alone over a shaker, a call from the lead, and the claps' pickup: the log drum comes in with the verse
      kind: 'intro',
      name: 'intro',
      melody: 'z8 | z8 | z2 A2 c2 d c | A6 z2',
      chords: 'Dm7 | Gm7 | C | F',
      band: { shaker: AMA_SHAKER },
      at: { 3: { clap: '............f.F.' } },
    },
    NM_VERSE,
    NM_PRE,
    NM_CHORUS,
    { ...NM_VERSE, name: 'verse 2', band: { ...NM_VERSE.band, congas: AMA_CONGAS }, at: { 3: { clap: '....x.......x.x.' }, 7: { clap: '....x.......ffff' } } },
    { ...NM_PRE, name: 'pre-chorus 2' },
    { ...NM_CHORUS, name: 'chorus 2' },
    {
      // the log drum's break: it plays alone over the shaker and claps, then the kick and the congas come back
      kind: 'bridge',
      name: 'log drum break',
      melody: 'z4 d2 B2 | G6 z2 | z4 c2 A2 | F6 z2 | z2 F G B2 d2 | f4 d4 | e2 ^c2 e2 A2 | ^c4 E4',
      chords: 'Gm7 | Gm7 | Dm7 | Dm7 | Bb | Bb | A7 | A7',
      band: { kick: 'X.......X.......', clap: '....x.......x...', hat: AMA_HAT, shaker: AMA_SHAKER, congas: AMA_CONGAS, bass: LOG, comp: AMA_STABS },
      at: {
        0: { kick: '', hat: '', congas: '', comp: '', bass: '1-.1..8-..5.1.8.' },
        1: { kick: '', hat: '', congas: '', comp: '', bass: '1-.1..8-.1.15.8-' },
        2: { kick: '', hat: '', congas: '', comp: '', bass: '1-.1..8-..5.1.8.' },
        3: { kick: '', hat: '', congas: '', comp: '', bass: '1-.1..8-.1.15.8-', clap: '....x.......x.x.' },
        6: { clap: 'x...x...x...x...' },
        7: { kick: FOUR, clap: 'x.x.x.x.ffffFFFF', bass: '1-..1-..1-..1-..' },
      },
    },
    { ...NM_CHORUS, name: 'last chorus' },
    {
      kind: 'outro',
      name: 'outro',
      melody: 'f2 d f- f2 d c | e2 c G- G4 | f4 e2 ^c2 | d8',
      chords: 'Bb | C | Bb A7 | Dm7',
      band: NM_CHORUS.band,
      at: { 2: { clap: '....X.......ffFF' }, [-1]: { ...AMA_REST, kick: 'X...............', crash: '-...............', bass: '1---------------', comp: 'x...............' } },
    },
  ],
};

// ------------------------------------------------------------------ Skinned Knees: pop-punk

// (eighths on the hat in a verse, the open hat bashed in a chorus, the kick pushing the "and" of two; a post-chorus
// on the polka beat, the kick on every beat and the snare between; a half-time bridge)
const PP_EIGHTHS = 'x.x.x.x.x.x.x.x.';
const PP_POWER = 'X.x.X.x.X.x.X.x.';
const PP_CHUGS = 'X.v.x.v.X.v.x.v.';
const PP_PUMP = '1.1.1.1.1.1.1.1.';
const PP_FILL: Lanes = { kick: 'X...............', snare: '....X...F.f.....', tom: '............F...', floor: '..............F.', hat: 'x.x.x.x.........', open: '' };
const PP_REST: Lanes = { kick: '', snare: '', hat: '', open: '', ride: '', tom: '', floor: '', tamb: '', bass: '', comp: '' };

const PP_PRE: ProdSection = {
  kind: 'bridge',
  name: 'pre-chorus',
  melody: 'c2 c c c2 B A | B2 B B B2 A G | A2 A A A2 B c | B2 c d e4',
  chords: 'F#m | E | D | E',
  band: { kick: 'X...X...X...X...', snare: BACK, floor: 'x.x.x.x.x.x.x.x.', bass: PP_PUMP, comp: PP_CHUGS },
  at: {
    2: { snare: 'x.x.x.x.x.x.x.x.', floor: '' },
    3: { snare: 'X.x.X.x.F.F.F.F.', floor: '', comp: 'X.x.X.x.X.x.X.x.' },
  },
};
const PP_CHORUS: ProdSection = {
  kind: 'chorus',
  name: 'chorus',
  melody: 'f2 f2 e f- f2 | g2 f e- e4 | e2 e2 c e- e2 | f2 e c- c4 | f2 f2 e f- f2 | g2 f g- g2 a2 | a8 | z2 e f e c B2',
  chords: 'D | E | C#m | F#m | D | E | A | A',
  band: { kick: 'X.....x.X.x.....|X.....x.X.....x.', snare: BACK, open: PP_POWER, bass: '1.1.1.1.1.1.1.1.|1.1.1.1.1.1.8.8.', comp: PP_CHUGS },
  at: {
    0: { crash: 'X...............' },
    3: { snare: '....X.......X.X.' },
    4: { crash: 'X...............' },
    6: { crash: 'X...............' },
    7: PP_FILL,
  },
};
const PP_POST: ProdSection = {
  kind: 'chorus',
  name: 'post-chorus',
  melody: 'f2 e f- f2 e c | e2 B e- e4 | f2 e f- f2 a2 | g4 e4',
  chords: 'D | E | F#m | E',
  band: { kick: FOUR, snare: '..X...X...X...X.', ride: 'X...X...X...X...', tamb: '..x...x...x...x.', bass: '1.5.1.5.1.5.8.5.', comp: PP_CHUGS },
  at: { 0: { crash: 'X...............' }, 3: { snare: '..X...X.F.f.F.F.' } },
};
const PP_VERSE: ProdSection = {
  kind: 'verse',
  name: 'verse',
  melody: 'z2 A A c2 B A | B2 c E- E4 | z2 A A d2 c B | B2 G B- B4 | z2 A A c2 B A | B2 c e- e4 | f2 e d- d2 c B | c2 B G- G2 E2',
  chords: 'A | C#m | D | E | A | C#m | D | E',
  band: { kick: 'X.......X.X.....|X.....X.X.......', snare: BACK, hat: PP_EIGHTHS, bass: PP_PUMP, comp: PP_CHUGS },
  at: {
    // (the first half bass and drums alone, the guitar letting one chord ring a bar; the palm-muted chugs from the fifth)
    0: { comp: 'X---------------', kick: 'X.......X.X.....' },
    1: { comp: 'X---------------', kick: 'X.......X.X.....' },
    2: { comp: 'X---------------', kick: 'X.......X.X.....' },
    3: { comp: 'X---------------', kick: 'X.......X.X.....', snare: '....X.......X.X.' },
    7: PP_FILL,
  },
};
const SKINNED_KNEES: Production = {
  id: 'skinned-knees',
  name: 'Skinned Knees',
  bpm: 150,
  key: 'A',
  style: 'punk',
  swing: 0.5,
  laid: -0.002,
  bassLo: 28,
  hold: { bass: 0.9, comp: 0.95 },
  sections: [
    {
      // the whole band from the first beat, on the hook, and a stop: the verse starts on bass and drums alone
      kind: 'intro',
      name: 'intro',
      melody: 'f2 e f- f2 e c | e2 B e- e4 | f2 e f- f2 a2 | g2 z6',
      chords: 'D | E | F#m | E',
      band: { kick: 'X.....X.X.......|X.....X.X...X...', snare: BACK, open: PP_POWER, bass: PP_PUMP, comp: PP_CHUGS },
      at: { 0: { crash: 'X...............' }, 3: { kick: 'X...............', snare: '............f.F.', open: '', crash: 'X...............', bass: '1-..............', comp: 'X-..............' } },
    },
    PP_VERSE,
    PP_PRE,
    PP_CHORUS,
    PP_POST,
    { ...PP_VERSE, name: 'verse 2', band: { ...PP_VERSE.band, kick: 'X.......X.X.....|X.....X.X...X...' }, at: { 3: { snare: '....X.......X.X.' }, 7: PP_FILL } },
    { ...PP_PRE, name: 'pre-chorus 2' },
    { ...PP_CHORUS, name: 'chorus 2' },
    { ...PP_POST, name: 'post-chorus 2', at: { 0: { crash: 'X...............' }, 3: { snare: '..X...X.F.F.F.F.' } } },
    {
      // half time: the guitar rings over the ride, then the band comes in heavy, the snare on three
      kind: 'break',
      name: 'half-time bridge',
      melody: 'c4 e4 | f6 e2 | e4 c4 | B6 z2 | c4 e4 | f4 a4 | g4 f4 | g2 g g g2 g g',
      chords: 'F#m | D | A | E | F#m | D | E | E',
      band: { kick: 'X.....X...X.....', snare: '........X.......', hat: PP_EIGHTHS, bass: '1.......1.....5.', comp: 'X.......X...x...' },
      at: {
        0: { kick: 'X...............', snare: '', hat: '', ride: 'x...x...x...x...', bass: '1-------5-------', comp: 'X---------------' },
        1: { kick: 'X...............', snare: '', hat: '', ride: 'x...x...x...x...', bass: '1-------5-------', comp: 'X---------------' },
        2: { kick: 'X...............', snare: '', hat: '', ride: 'x...x...x...x...', bass: '1-------5-------', comp: 'X---------------' },
        3: { kick: 'X...............', snare: '............f.F.', hat: '', ride: 'x...x...x.......', bass: '1-------5-------', comp: 'X---------------' },
        4: { crash: 'X...............' },
        7: { kick: 'X.....X.X...X...', snare: '........X.X.F.F.' },
      },
    },
    { ...PP_PRE, name: 'pre-chorus 3' },
    { ...PP_CHORUS, name: 'last chorus' },
    {
      kind: 'outro',
      name: 'outro',
      melody: 'f2 e f- f2 e c | e2 B e- e4 | f2 e f- f2 e c | a8',
      chords: 'D | E | D | A',
      band: PP_POST.band,
      at: { 0: { crash: 'X...............' }, 2: { snare: '..X...X.F.f.F.F.' }, [-1]: { ...PP_REST, kick: 'X...............', crash: 'X...............', bass: '1---------------', comp: 'X---------------' } },
    },
  ],
};

export const PRODUCTIONS: Record<string, Production> = { [VELVET_ROPE.id]: VELVET_ROPE, [NIGHT_MARKET.id]: NIGHT_MARKET, [SKINNED_KNEES.id]: SKINNED_KNEES };

export function productionOf(id: string): Production | undefined {
  return PRODUCTIONS[id];
}

/** A production as one of the game's tunes: its melody and chords in full, and where each section starts. */
function tuneOf(p: Production, comment: { by: string }): Tune {
  const sections: { bar: number; kind: SectionKind }[] = [];
  let bar = 0;
  for (const x of p.sections) {
    const n = x.melody.split('|').length;
    if (x.chords.split('|').length !== n) throw new Error(`${p.id} ${x.name}: ${n} bars of tune, ${x.chords.split('|').length} of chords`);
    sections.push({ bar, kind: x.kind });
    bar += n;
  }
  return {
    id: p.id,
    name: p.name,
    by: comment.by,
    bpm: p.bpm,
    key: p.key,
    style: p.style,
    original: true,
    passes: 1,
    melody: p.sections.map((x) => x.melody).join(' | '),
    chords: p.sections.map((x) => x.chords).join(' | '),
    sections,
  };
}

/** The three as the song list has them. */
export const PRODUCED_TUNES: readonly Tune[] = [tuneOf(SKINNED_KNEES, { by: 'Original' }), tuneOf(NIGHT_MARKET, { by: 'Original' }), tuneOf(VELVET_ROPE, { by: 'Original' })];

// ------------------------------------------------------------------ the parts, played out

/** Each bar of a production: where it starts, its section, and the parts it plays. */
export interface ProdBar {
  beat: number;
  /** Its section (index), its bar in it, and how many bars the section has. */
  sec: number;
  k: number;
  n: number;
  kind: SectionKind;
  name: string;
  lanes: Lanes;
}

const barCache = new Map<string, ProdBar[]>();
export function prodBars(p: Production): ProdBar[] {
  const hit = barCache.get(p.id);
  if (hit) return hit;
  const out: ProdBar[] = [];
  let bar = 0;
  p.sections.forEach((x, si) => {
    const n = x.melody.split('|').length;
    for (let k = 0; k < n; k++) {
      const lanes: Lanes = {};
      for (const [lane, pat] of Object.entries(x.band) as [keyof Lanes, string][]) lanes[lane] = barOfPattern(pat, k, `${p.id} ${x.name} ${lane}`);
      const own = x.at?.[k] ?? (k === n - 1 ? x.at?.[-1] : undefined);
      if (own) for (const [lane, pat] of Object.entries(own) as [keyof Lanes, string][]) lanes[lane] = barOfPattern(pat, 0, `${p.id} ${x.name} bar ${k + 1} ${lane}`);
      out.push({ beat: bar * 4, sec: si, k, n, kind: x.kind, name: x.name, lanes });
      bar++;
    }
  });
  barCache.set(p.id, out);
  return out;
}
function barOfPattern(pat: string, k: number, where: string): string {
  if (!pat) return '';
  const bars = pat.split('|');
  const b = bars[k % bars.length];
  if (b.length !== STEPS) throw new Error(`${where}: a bar of ${b.length} steps, not ${STEPS}`);
  return b;
}

/** A step's beat in its bar, swung. */
function stepBeat(p: Production, i: number): number {
  return i * 0.25 + (i % 2 === 1 ? (p.swing - 0.5) * 0.5 : 0);
}

/** A repeatable wobble (the same every time, hashed from where it falls). */
function wob(beat: number, salt: number, amount: number): number {
  let h = Math.imul(Math.round(beat * 96) + 0x2545f491, 0x85ebca6b) ^ Math.imul(salt + 3, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x27d4eb2f);
  h ^= h >>> 13;
  return (((h >>> 0) % 10000) / 10000 - 0.5) * 2 * amount;
}

/** How hard each section plays. */
const ENERGY: Record<SectionKind, number> = { intro: 0.88, verse: 0.88, bridge: 0.93, chorus: 1, break: 0.86, solo: 0.9, outro: 1 };
const DVEL: Record<string, number> = { X: 1, x: 0.8, '-': 0.56, o: 0.32, F: 0.95, f: 0.7 };

/** The drums a lane plays: its General MIDI note, and which of the player's drums it is (none: not yours). */
export const DRUM_LANES: Record<string, { note: number; lane: 'KICK' | 'SNARE' | 'HAT' | null; drum: string; key: string }> = {
  kick: { note: 36, lane: 'KICK', drum: 'kick', key: 'kit:kick' },
  snare: { note: 38, lane: 'SNARE', drum: 'snare', key: 'kit:snare' },
  clap: { note: 39, lane: 'SNARE', drum: 'clap', key: 'clap:0' },
  rim: { note: 37, lane: 'SNARE', drum: 'rim', key: 'kit:rim' },
  tom: { note: 47, lane: 'SNARE', drum: 'tom', key: 'kit:tom' },
  hitom: { note: 50, lane: 'SNARE', drum: 'tom', key: 'kit:tom' },
  floor: { note: 43, lane: 'SNARE', drum: 'floor', key: 'kit:floor' },
  hat: { note: 42, lane: 'HAT', drum: 'hat', key: 'kit:hat' },
  pedal: { note: 44, lane: 'HAT', drum: 'hat', key: 'kit:hat' },
  open: { note: 46, lane: 'HAT', drum: 'open', key: 'kit:open' },
  ride: { note: 51, lane: 'HAT', drum: 'ride', key: 'kit:ride' },
  crash: { note: 49, lane: 'HAT', drum: 'crash', key: 'kit:crash' },
};
/** The percussion player's (its own stem: yours on the congas). */
const PERC_NOTES: Record<string, number> = { shaker: 82, tamb: 54, cowbell: 56 };
const CONGA_NOTE = [64, 62, 63, 62];

export interface ProdHit {
  beat: number;
  /** General MIDI drum note. */
  note: number;
  vel: number;
  /** Seconds off the beat (the feel; never the chart's). */
  late: number;
  /** Which of the player's drums (none: a percussion part's), its mark (X x - o, f a fill's, c a crash), the drum, and
   * where in its bar (beats, unswung). */
  lane: 'KICK' | 'SNARE' | 'HAT' | null;
  mark: string;
  drum: string;
  key: string;
  at: number;
}

const kitCache = new Map<string, ProdHit[]>();
/** The drummer's part, every hit (the crashes and toms too), to the last hit. */
export function prodDrums(p: Production, end: number): ProdHit[] {
  const id = `${p.id}:${end}`;
  const hit = kitCache.get(id);
  if (hit) return hit;
  const out: ProdHit[] = [];
  for (const b of prodBars(p)) {
    const e = ENERGY[b.kind];
    for (const [lane, info] of Object.entries(DRUM_LANES)) {
      const pat = b.lanes[lane as keyof Lanes];
      if (!pat) continue;
      for (let i = 0; i < STEPS; i++) {
        const ch = pat[i];
        const v = DVEL[ch];
        if (v === undefined) continue;
        const beat = b.beat + stepBeat(p, i);
        if (beat >= end - 1e-6) continue;
        const back = info.lane === 'SNARE' && info.drum !== 'tom' && info.drum !== 'floor' ? p.laid : 0;
        const drift = lane === 'kick' ? 0.0015 : v < 0.4 ? 0.006 : 0.004;
        // (the hats a step back in the kit, as a drummer keeps them under the backbeat)
        const level = info.lane === 'HAT' && lane !== 'crash' ? 0.84 : 1;
        const mark = lane === 'crash' ? 'c' : ch === 'F' || ch === 'f' || info.drum === 'tom' || info.drum === 'floor' ? 'f' : ch;
        out.push({ beat, note: info.note, vel: Math.min(1, v * e * level * (1 + wob(beat, info.note, 0.07))), late: back + wob(beat, info.note + 50, drift), lane: info.lane, mark, drum: info.drum, key: info.key, at: i * 0.25 });
      }
    }
  }
  out.sort((a, b) => a.beat - b.beat);
  kitCache.set(id, out);
  return out;
}

/** The drummer's part as the player's chart sees a drummer (arrange.ts's drumHits shape, on the grid). */
export function prodKit(p: Production, end: number): Record<'KICK' | 'SNARE' | 'HAT', { beat: number; key: string; vel: number; late: number; drum: string; mark: string; at: number }[]> {
  const out: Record<'KICK' | 'SNARE' | 'HAT', { beat: number; key: string; vel: number; late: number; drum: string; mark: string; at: number }[]> = { KICK: [], SNARE: [], HAT: [] };
  for (const h of prodDrums(p, end)) if (h.lane) out[h.lane].push({ beat: h.beat, key: h.key, vel: h.vel, late: h.late, drum: h.drum, mark: h.mark, at: h.at });
  return out;
}

/** The percussion player: congas (as the player's zones, `congas:N`), shaker, tambourine, cowbell. */
export function prodPerc(p: Production, end: number): ProdHit[] {
  const out: ProdHit[] = [];
  for (const b of prodBars(p)) {
    const e = ENERGY[b.kind];
    const cg = b.lanes.congas;
    if (cg)
      for (let i = 0; i < STEPS; i++) {
        const z = cg[i];
        if (z < '0' || z > '3') continue;
        const beat = b.beat + stepBeat(p, i);
        if (beat >= end - 1e-6) continue;
        // (accents on the beat and on the slaps)
        const v = (i % 4 === 0 ? 0.92 : i % 2 === 0 ? 0.8 : 0.68) * (z === '1' || z === '3' ? 1.05 : 1) * e;
        out.push({ beat, note: CONGA_NOTE[Number(z)], vel: Math.min(1, v * (1 + wob(beat, 70 + Number(z), 0.08))), late: wob(beat, 75, 0.005), lane: null, mark: 'x', drum: 'congas', key: `congas:${z}`, at: i * 0.25 });
      }
    for (const lane of ['shaker', 'tamb', 'cowbell'] as const) {
      const pat = b.lanes[lane];
      if (!pat) continue;
      for (let i = 0; i < STEPS; i++) {
        const v = DVEL[pat[i]];
        if (v === undefined) continue;
        const beat = b.beat + stepBeat(p, i);
        if (beat >= end - 1e-6) continue;
        out.push({ beat, note: PERC_NOTES[lane], vel: Math.min(1, v * e * (1 + wob(beat, 80 + i, 0.1))), late: wob(beat, 85, 0.006), lane: null, mark: pat[i], drum: lane, key: lane, at: i * 0.25 });
      }
    }
  }
  return out.sort((a, b) => a.beat - b.beat);
}

/** A chord through the song (from score.ts's spans). */
export interface ProdChord {
  beat: number;
  len: number;
  semis: number;
  minor: boolean;
}
const IV: Record<string, (minor: boolean) => number> = { '1': () => 0, '2': () => 2, '3': (m) => (m ? 3 : 4), '4': () => 5, '5': () => 7, '6': () => 9, '7': () => 10, '8': () => 12, '9': () => 14, v: () => -5, o: () => 0 };

export interface ProdNote {
  beat: number;
  midi: number;
  len: number;
  vel: number;
  late: number;
  /** A dead note (no pitch to play) or a muted scratch. */
  ghost: boolean;
}

/** The bass player's part, every note at its pitch (roots from the production's `bassLo`). */
export function prodBass(p: Production, spans: readonly ProdChord[], keyPc: number, end: number): ProdNote[] {
  const chordAt = (b: number) => spans.find((x) => b >= x.beat - 1e-6 && b < x.beat + x.len - 1e-6) ?? spans[spans.length - 1];
  const root = (c: ProdChord) => p.bassLo + ((((keyPc + c.semis - p.bassLo) % 12) + 12) % 12);
  const out: ProdNote[] = [];
  for (const b of prodBars(p)) {
    const pat = b.lanes.bass;
    if (!pat) continue;
    const e = ENERGY[b.kind];
    for (let i = 0; i < STEPS; i++) {
      const ch = pat[i];
      if (ch === '.' || ch === '-') continue;
      let k = i + 1;
      while (k < STEPS && pat[k] === '-') k++;
      let z = k;
      while (z < STEPS && pat[z] === '.') z++;
      const beat = b.beat + stepBeat(p, i);
      if (beat >= end - 1e-6) continue;
      const c = chordAt(beat);
      let midi: number;
      if (ch === 'b') {
        const next = chordAt(Math.min(b.beat + 4, end - 1e-3));
        midi = root(next) - (next === c ? 2 : 1);
      } else midi = root(c) + (IV[ch]?.(c.minor) ?? 0);
      const ghost = ch === 'o';
      // (held over its `-`s, and then through the rest to the next note as far as the part's hold says; the downbeat
      // leaning in, the off-beats lighter)
      const len = (k - i + (z - k) * p.hold.bass) * 0.25 * 0.95 * (ghost ? 0.3 : 1);
      const v = (i === 0 ? 0.95 : i % 4 === 0 ? 0.86 : i % 2 === 0 ? 0.78 : 0.72) * (ghost ? 0.45 : 1) * e;
      out.push({ beat, midi, len: Math.max(0.1, len), vel: Math.min(1, v * (1 + wob(beat, 90, 0.06))), late: wob(beat, 91, 0.003), ghost });
    }
  }
  return out;
}

export interface ProdHitChord {
  beat: number;
  len: number;
  vel: number;
  ghost: boolean;
  /** Which levels it's on: 2 every level (`X`), 1 Normal and Hard (`x`), 0 Hard only (`v`, a lighter strum; and the
   * muted scratches, which are no one's). */
  weight: number;
  late: number;
  /** Where in its bar (beats, unswung). */
  at: number;
}
const CWEIGHT: Record<string, number> = { X: 2, x: 1, v: 0, o: -1 };
const CVEL: Record<string, number> = { X: 1, x: 0.84, v: 0.72, o: 0.4 };
/** The rhythm part: each chord struck (its length to the next or a rest), and the muted scratches between. */
export function prodComp(p: Production, end: number): ProdHitChord[] {
  const out: ProdHitChord[] = [];
  for (const b of prodBars(p)) {
    const pat = b.lanes.comp;
    if (!pat) continue;
    const e = ENERGY[b.kind];
    for (let i = 0; i < STEPS; i++) {
      const ch = pat[i];
      const weight = CWEIGHT[ch];
      if (weight === undefined) continue;
      let k = i + 1;
      while (k < STEPS && pat[k] === '-') k++;
      let z = k;
      while (z < STEPS && pat[z] === '.') z++;
      const beat = b.beat + stepBeat(p, i);
      if (beat >= end - 1e-6) continue;
      const ghost = ch === 'o';
      out.push({ beat, len: ghost ? 0.12 : (k - i + (z - k) * p.hold.comp) * 0.25 * 0.95, vel: Math.min(1, CVEL[ch] * e * (1 + wob(beat, 95, 0.06))), ghost, weight, late: wob(beat, 96, 0.004), at: i * 0.25 });
    }
  }
  return out;
}
