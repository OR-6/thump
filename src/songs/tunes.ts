/**
 * The songs: famous classics (public domain everywhere: traditional, or by a composer who died more than seventy
 * years ago) set to modern grooves, and originals written for the game. Each is its own arrangement here, without
 * words. src/songs/score.ts orders them by how hard they are.
 *
 * Melodies are written in ABC, in the song's key (`key`: its signature applies): a bar per `|`, notes C D E F G A B
 * from middle C, c d e… an octave up, `,` an octave down and `'` up; `^` `_` `=` a sharp, flat or natural to the end
 * of the bar; a number after a note its length in units (none: one; `3/2`, `/2`), `-` a tie, `(3` a triplet; `z` a
 * rest. A unit is an eighth unless `unit` says otherwise; every bar holds `meter` beats (four unless it says). A
 * tune with a pickup starts on a bar of rests that ends with it. `octave` moves the whole tune (to sit on the keys).
 *
 * Chords are a bar per `|`: one per bar, or two, three or four evenly through it (`.` keeps the one before).
 *
 * Sources: where a melody was checked against a published transcription, it says so.
 */
/** A song's sections: how big the band plays (and how busy your part is) through each. */
export type SectionKind = 'intro' | 'verse' | 'chorus' | 'bridge' | 'break' | 'solo' | 'outro';

export type Style = 'rock' | 'anthem' | 'punk' | 'ska' | 'dance' | 'synthpop' | 'funk' | 'hiphop' | 'shufflehop' | 'reggaeton' | 'reggae' | 'ballad' | 'three';

export interface Tune {
  id: string;
  name: string;
  /** Who wrote it, and the groove it's in (the tile's line, after how hard it is). */
  by: string;
  bpm: number;
  /** The key, as ABC names it ('C', 'Am', 'Bm'): the instruments play its scale, and the melody its signature. */
  key: string;
  style: Style;
  melody: string;
  chords: string;
  /** Times through the tune (a solo between each). */
  passes: number;
  /** Beats in a bar (4 unless it says), and in a unit of the notation (an eighth unless it says). */
  meter?: number;
  unit?: number;
  /** Octaves to move the written melody. */
  octave?: number;
  /** The chord the band holds in a solo, when it isn't the home chord's five. */
  solo?: string;
  /** Written for the game. */
  original?: boolean;
  /** The bar the drums come in on its recording (before it, the drums and congas parts rest: no drummer to play to). */
  drumsFrom?: number;
  /** Its recording's drummer keeps time on the beat (a street band's ride and pedal hat), not the style's off-beats. */
  hatsOnBeat?: boolean;
  /** Where each section starts (bars from the first): a song in its whole form (a `solo` section is a solo: its bars
   * are rests, anything goes). Without them, each pass's first half is its verse and its second half its chorus. */
  sections?: readonly { bar: number; kind: SectionKind }[];
  /**
   * A lesson: the instrument it teaches, and its steps from a bar on: a word for the moment, what to do, the level its
   * notes are written at, and (optionally) only these targets.
   */
  lesson?: { inst: string; steps: readonly { bar: number; title: string; say: string; level: 'easy' | 'normal' | 'hard'; only?: readonly string[] }[] };
}

/** A song in its sections, one after another: its melody and chords in full, and where each section starts. */
function form(...parts: readonly (readonly [SectionKind, string, string])[]): { melody: string; chords: string; sections: { bar: number; kind: SectionKind }[] } {
  const sections: { bar: number; kind: SectionKind }[] = [];
  let bar = 0;
  for (const [kind, m, c] of parts) {
    const n = m.split('|').length;
    if (c.split('|').length !== n) throw new Error(`a ${kind} of ${n} bars has chords for ${c.split('|').length}`);
    sections.push({ bar, kind });
    bar += n;
  }
  return { melody: parts.map((p) => p[1]).join(' | '), chords: parts.map((p) => p[2]).join(' | '), sections };
}

/** One lesson per instrument: a slow original, its moves one at a time (bars 0, 4, 8, 12). */
// (the drum and conga lessons' band: a hook over the four chords half the radio uses, Am F C G, with a lift in the
// second half; the keys and marimba lesson: a tune on the eight notes a marimba has, C to c, over C Am F G, that
// starts with slow notes and ends on a syncopated hook)
const C_TUNE = 'e2 e c d2 c A | c2 A2 c3 d | e2 g e d2 c2 | d4 B2 G2 | e2 e c d2 c A | c2 A2 F3 G | E2 G c e2 d2 | B2 d2 g4 | a2 g e d2 c2 | c2 d e f2 e2 | g3 e c2 G2 | B2 c d B4 | e2 e c d2 c A | c2 A2 c3 d | B2 d2 B2 G2 | A8';
const C_CHORDS = 'Am | F | C | G | Am | F | C | G | Am | F | C | G | Am | F | G | Am';
const KEYS_TUNE = 'E4 G4 | A4 E4 | F4 A4 | G8 | C2 D2 E2 G2 | A2 G2 E2 C2 | F2 G2 A2 c2 | B4 G4 | E2 G2 A3 G | E2 D2 C4 | E2 G2 A2 c2 | B6 G2 | c2 B2 A2 G2 | A2 G2 E4 | F2 E2 D2 E2 | C8';
const KEYS_CHORDS = 'C | Am | F | G | C | Am | F | G | C | Am | F | G | C | Am | G | C';
const keysSteps = (first: string) => [
  { bar: 0, title: 'Slow notes', say: first, level: 'normal' as const },
  { bar: 4, title: 'Walk', say: 'Walk along the notes, one after the next', level: 'normal' as const },
  { bar: 8, title: 'The hook', say: 'The hook: it skips ahead, then lands', level: 'normal' as const },
  { bar: 12, title: 'Your turn', say: 'All of it: keep with the band', level: 'normal' as const },
];
export const LESSONS: readonly Tune[] = [
  {
    id: 'learn-drums',
    name: 'Learn drums',
    by: 'Lesson',
    bpm: 80,
    key: 'C',
    style: 'rock',
    passes: 1,
    original: true,
    melody: C_TUNE,
    chords: C_CHORDS,
    lesson: {
      inst: 'drums',
      steps: [
        { bar: 0, title: 'Snare', say: 'Fists for sticks: hit the snare as its ring closes', level: 'normal', only: ['kit:snare'] },
        { bar: 4, title: 'Kick', say: 'Now the big drum in front: the kick', level: 'normal', only: ['kit:kick'] },
        { bar: 8, title: 'Kick, snare', say: 'Both now: kick, snare, kick, snare', level: 'easy' },
        { bar: 12, title: 'Add the hat', say: 'Add the hi-hat with your other hand', level: 'normal' },
      ],
    },
  },
  {
    id: 'learn-piano',
    name: 'Learn keys',
    by: 'Lesson',
    bpm: 76,
    key: 'C',
    style: 'ballad',
    passes: 1,
    original: true,
    melody: KEYS_TUNE,
    chords: KEYS_CHORDS,
    lesson: { inst: 'piano', steps: keysSteps('Press each key with one fingertip as its ring closes') },
  },
  {
    id: 'learn-marimba',
    name: 'Learn marimba',
    by: 'Lesson',
    bpm: 76,
    key: 'C',
    style: 'ballad',
    passes: 1,
    original: true,
    melody: KEYS_TUNE,
    chords: KEYS_CHORDS,
    lesson: { inst: 'marimba', steps: keysSteps('Fists are mallets: hit each bar as its ring closes') },
  },
  {
    id: 'learn-guitar',
    name: 'Learn guitar',
    by: 'Lesson',
    bpm: 80,
    key: 'G',
    style: 'ballad',
    passes: 1,
    original: true,
    melody: 'B2 d2 g3 d | e2 c2 G4 | A4 F2 A2 | B2 d2 g4 | B2 d2 g3 a | g2 e2 c4 | d2 c2 A2 F2 | G8 | g2 f g a2 g2 | e2 d e c4 | d4 A2 F2 | G2 B2 d4 | B2 d2 g3 d | e2 c2 G4 | A2 F2 A2 c2 | G8',
    chords: 'G | C | D | G | G | C | D | G | G | C | D | G | G | C | D | G',
    lesson: {
      inst: 'guitar',
      steps: [
        { bar: 0, title: 'Strum', say: 'Brush down across the strings as the ring closes', level: 'easy' },
        { bar: 4, title: 'Change chord', say: 'Left hand: move to the lit chord on the neck', level: 'normal' },
        { bar: 8, title: 'Down and up', say: 'Follow the arrows: down, and back up', level: 'hard' },
        { bar: 12, title: 'Your turn', say: 'All of it: strum and change with the band', level: 'hard' },
      ],
    },
  },
  {
    id: 'learn-handpan',
    name: 'Learn handpan',
    by: 'Lesson',
    bpm: 76,
    key: 'Dm',
    style: 'ballad',
    passes: 1,
    original: true,
    melody: 'D2 F2 A2 F2 | G2 F2 E4 | D2 F2 A2 c2 | A8 | D2 F2 A2 F2 | B2 A2 G4 | F2 E2 D2 E2 | D8 | A2 c2 d2 c2 | B2 A2 G4 | F2 G2 A2 E2 | D8 | A2 c2 d2 c2 | B2 A2 G4 | F2 E2 C2 E2 | D8',
    chords: 'Dm | C | Dm | Dm | Dm | Bb | C | Dm | Dm | Bb | C | Dm | Dm | Bb | C | Dm',
    lesson: {
      inst: 'handpan',
      steps: [
        { bar: 0, title: 'The middle', say: 'Tap the deep note in the middle', level: 'easy' },
        { bar: 4, title: 'The rim', say: 'Now the notes around the rim', level: 'normal' },
        { bar: 8, title: 'The tune', say: 'Fingertips on each note as its ring closes', level: 'hard' },
        { bar: 12, title: 'Your turn', say: 'All of it, softly', level: 'hard' },
      ],
    },
  },
  {
    id: 'learn-congas',
    name: 'Learn congas',
    by: 'Lesson',
    bpm: 84,
    key: 'C',
    style: 'funk',
    passes: 1,
    original: true,
    melody: C_TUNE,
    chords: C_CHORDS,
    lesson: {
      inst: 'congas',
      steps: [
        { bar: 0, title: 'Two sounds', say: 'Palm in the middle, fingers on the edge', level: 'easy' },
        { bar: 4, title: 'Both drums', say: 'Now both drums, as their rings close', level: 'normal' },
        { bar: 8, title: 'All four', say: 'Middle and edge of each drum', level: 'hard' },
        { bar: 12, title: 'Your turn', say: 'All of it: keep the groove', level: 'hard' },
      ],
    },
  },
];

// (the sections the songs below are made of)
const ODE_TO_JOY_VERSE = 'F2 F2 G2 A2 | A2 G2 F2 E2 | D2 D2 E2 F2 | F3 E E4 | F2 F2 G2 A2 | A2 G2 F2 E2 | D2 D2 E2 F2 | E3 D D4 | E2 E2 F2 D2 | E2 F G F2 D2 | E2 F G F2 E2 | D2 E2 A,4 | F2 F2 G2 A2 | A2 G2 F2 E2 | D2 D2 E2 F2 | E3 D D4';
const ODE_TO_JOY_VERSE_CHORDS = 'D | A | D | A | D | A | D | A D | A | A D | A | D A | D | A | D | A D';
const CAN_CAN_VERSE = 'C4 D F E D | G2 G2 G A E F | D2 D2 D F E D | C c B A G F E D | C4 D F E D | G2 G2 G A E F | D2 D2 D F E D | C G D E C2 z2 | C4 D F E D | G2 G2 G A E F | D2 D2 D F E D | C c B A G F E D | C4 D F E D | G2 G2 G A E F | D2 D2 D F E D | C G D E C2 z2';
const CAN_CAN_VERSE_CHORDS = 'C G | C | G | C G | C G | C | G | C G C . | C G | C | G | C G | C G | C | G | C G C .';
const DRUNKEN_SAILOR_VERSE = 'A2 A A A2 A A | A2 D2 F2 A2 | G2 G G G2 G G | G2 C2 E2 G2 | A2 A A A2 A A | A2 B2 c2 d2 | c2 A2 G2 E2 | D4 D2 z2';
const DRUNKEN_SAILOR_VERSE_CHORDS = 'Dm | Dm | C | C | Dm | Dm | C | Dm';
const DRUNKEN_SAILOR_CHORUS = 'A4 A3 A | A2 D2 F2 A2 | G4 G3 G | G2 C2 E2 G2 | A4 A3 A | A2 B2 c2 d2 | c2 A2 G2 E2 | D4 D2 z2';
const SAINTS_VERSE = 'z2 C2 E2 F2 | G8 | z2 C2 E2 F2 | G8 | z2 C2 E2 F2 | G4 E4 | C4 E4 | D8 | z2 E2 E2 D2 | C6 C2 | E4 G4 | G2 F6 | z4 E2 F2 | G4 E4 | C4 D4 | C8';
const SAINTS_VERSE_CHORDS = 'C | C | C | C | C | C | C | G | G | C | C | F | F | C | F G | C';
const KOROBEINIKI_VERSE = 'B2 F G A2 G F | E2 E G B2 A G | F3 G A2 B2 | G2 E2 E2 z2 | z A2 c e2 d c | B3 G B2 A G | F2 F G A2 B2 | G2 E2 E2 z2 | B2 F G A2 G F | E2 E G B2 A G | F3 G A2 B2 | G2 E2 E2 z2 | z A2 c e2 d c | B3 G B2 A G | F2 F G A2 B2 | G2 E2 E2 z2';
const KOROBEINIKI_VERSE_CHORDS = 'Em B | Em | B | Em | Am | Em | B | Em | Em B | Em | B | Em | Am | Em | B | Em';
const MOUNTAIN_KING_INTRO = 'B c d e f d f2 | ^e c ^e2 =e =c e2 | B c d e f d f b | a f d f a4 | B c d e f d f2 | ^e c ^e2 =e =c e2 | B c d e f d f b | a f d f a4';
const MOUNTAIN_KING_INTRO_CHORDS = 'Bm | F# C | Bm | D | Bm | F# C | Bm | D';
const WILLIAM_TELL_VERSE = 'z6 A A | A2 A A A2 A A | d2 e2 f2 A A | A2 A A d2 f2 | e2 c2 A2 A A | A2 A A A2 A A | d2 e2 f2 d3/2 f/2 | a3 a a g f e | d2 f2 d2 f f | f2 f f f2 f f | f2 b2 f2 b2 | f2 b2 f2 e2 | d e c d B2 f f | f2 f f f2 f f | f2 b2 f2 b2 | f2 b2 a2 ^g2 | a2 ^g2 a2 A A | A2 A A A2 A A | d2 e2 f2 A A | A2 A A d2 f2 | e2 c2 A2 A A | A2 A A A2 A A | d2 e2 f2 d3/2 f/2 | a3 a a g f e | d2 f2 d2 z2';
const WILLIAM_TELL_VERSE_CHORDS = 'D | D | D | D | A | D | D | A | D | Bm | Bm | Bm | Bm | Bm | Bm | Bm E | A | D | D | D | A | D | D | A | D';
const AMAZING_GRACE_VERSE = 'z4 D2 | G4 B G | B4 A2 | G4 E2 | D4 D2 | G4 B G | B4 A B | d6- | d2 z2 B2 | d4 B G | B4 A2 | G4 E2 | D4 D2 | G4 (3B A G | B4 A2 | G6- | G4 z2';
const AMAZING_GRACE_VERSE_CHORDS = 'G | G | G | C | G | G | G | D | D | G | G | C | G | Em | D | G | G';
const SCARBOROUGH_FAIR_VERSE = 'E4 E2 | B4 B2 | F3 G F2 | E6- | E2 B2 d2 | e4 d2 | B2 c2 A2 | B6- | B4 e2 | e4 e2 | d4 B2 | B2 A2 G2 | F2 D4- | D6 | E4 B2 | A4 G2 | F2 E2 D2 | E6';
const SCARBOROUGH_FAIR_VERSE_CHORDS = 'Em | Em | D | Em | Em | Em | A | Em | Em | Em | G | G | D | D | Em | D . G | D | Em';
const ROOFTOP_VERSE = 'c2 B c- c2 G2 | B2 A B- B2 D2 | c2 B c- c2 e2 | d c A2 c4 | c2 B c- c2 G2 | B2 A B- B2 G A | c2 d c- c2 B A | A4 G4';
const ROOFTOP_VERSE_CHORDS = 'C | G | Am | F | C | G | Am | F G';
const ROOFTOP_CHORUS = 'e2 e2 e d c2 | d2 d2 d c B2 | c2 c2 c B A2 | A G A c- c4 | e2 e2 e d c2 | d2 d2 d e f2 | e2 d2 c2 A2 | B2 d2 c4';
const ROOFTOP_CHORUS_CHORDS = 'C | G | Am | F | C | G | Am F | G C';
const LATE_BUS_VERSE = 'e2 c2 A c B A | z2 c2 A2 G2 | e2 c2 G c B G | z2 B2 d2 B2 | e2 c2 A c B A | z2 c2 A2 c2 | d2 f2 e d c A | B4 ^G4';
const LATE_BUS_VERSE_CHORDS = 'Am | F | C | G | Am | F | Dm | E';
const LATE_BUS_CHORUS = 'a2 a2 g e- e2 | f2 f2 e c- c2 | e2 e2 d c- c2 | d2 B2 G2 B2 | a2 a2 g e- e2 | f2 e2 c2 A2 | d2 c2 B2 ^G2 | A8';
const LATE_BUS_CHORUS_CHORDS = 'Am | F | C | G | Am | F | Dm E | Am';
const MANGO_SEASON_VERSE = 'B2 B2 B A G2 | E2 G2 A4 | B2 B2 B A G2 | A2 G2 F4 | B2 B2 B A G2 | E2 G2 A2 c2 | B2 A2 G2 E2 | D4 z4';
const MANGO_SEASON_VERSE_CHORDS = 'Em | C | G | D | Em | C | G | D';
const MANGO_SEASON_CHORUS = 'e2 d B- B2 G2 | e2 d B- B4 | d2 B G- G2 E2 | D2 E2 F2 A2 | e2 d B- B2 G2 | e2 d B- B2 A2 | G2 A2 B2 A2 | G8';
const MANGO_SEASON_CHORUS_CHORDS = 'Em | C | G | D | Em | C | G D | G';
const COLD_BREW_VERSE = 'E E G E A G E D | E4 z D E G | E E G E A G E D | E4 z G A B | d2 B d- d B A G | A2 F E- E4 | d2 B d- d B A G | A2 B2 c4';
const COLD_BREW_VERSE_CHORDS = 'Em | A | Em | A | Em | A | Em | A';
const COLD_BREW_CHORUS = 'E E G E A G E D | E4 z D E G | E E G E A G E D | E4 z G A B | e2 d B- B2 A G | A2 B A- A2 F2 | G2 F2 E2 D2 | E8';
const COLD_BREW_CHORUS_CHORDS = 'Em | A | Em | A | Em | A | Em D | Em';
const KITE_HILL_VERSE = 'c2 A2 c2 d2 | c2 A2 G4 | A2 F2 A2 B2 | A2 G2 F4 | c2 A2 c2 f2 | e2 d2 c4 | d2 c2 A2 F2 | G4 z4';
const KITE_HILL_VERSE_CHORDS = 'F | C | Dm | Bb | F | C | Dm | Bb C';
const KITE_HILL_CHORUS = 'f2 f2 e c- c2 | e2 e2 d c- c2 | d2 d2 c A- A2 | B2 A2 G4 | f2 f2 e c- c2 | e2 e2 d c- c2 | d2 c2 B2 G2 | F8';
const KITE_HILL_CHORUS_CHORDS = 'F | C | Dm | Bb | F | C | Bb C | F';
const LOW_TIDE_VERSE = 'F2 A2 A2 B A | G2 B2 A4 | E2 A2 A2 B A | F4 z4 | d2 c B- B2 F2 | G2 B2 A4 | E2 F2 G2 E2 | D4 z4';
const LOW_TIDE_VERSE_CHORDS = 'D | G | A | D | Bm | G | A | D';
const LOW_TIDE_CHORUS = 'd2 d2 c B- B2 | B2 B2 A G- G2 | A2 A2 B c- c2 | d4 F4 | d2 d2 c B- B2 | B2 B2 A G- G2 | A2 G2 F2 E2 | D8';

export const TUNES: readonly Tune[] = [
  // ---------------------------------------------------------------- the classics
  {
    // Symphony No. 9 (1824), the theme as it's usually sung
    id: 'ode-to-joy',
    name: 'Ode to Joy',
    by: 'Beethoven',
    bpm: 108,
    key: 'D',
    style: 'anthem',
    passes: 1,
    // (4 times through, each its own arrangement)
    ...form(
      ['verse', ODE_TO_JOY_VERSE, ODE_TO_JOY_VERSE_CHORDS],
      ['solo', 'z8', 'A'],
      ['verse', ODE_TO_JOY_VERSE, ODE_TO_JOY_VERSE_CHORDS],
      ['chorus', ODE_TO_JOY_VERSE, ODE_TO_JOY_VERSE_CHORDS],
      ['solo', 'z8', 'A'],
      ['chorus', ODE_TO_JOY_VERSE, ODE_TO_JOY_VERSE_CHORDS],
    ),
  },
  {
    // Galop infernal from Orpheus in the Underworld (1858), its famous theme, checked against a violin transcription
    // (which opens on two Cs; the orchestral first bar is one held C, as here)
    id: 'can-can',
    name: 'Can-can',
    by: 'Offenbach',
    bpm: 150,
    key: 'C',
    style: 'punk',
    passes: 1,
    // (5 times through, each its own arrangement)
    ...form(
      ['verse', CAN_CAN_VERSE, CAN_CAN_VERSE_CHORDS],
      ['solo', 'z8', 'G'],
      ['chorus', CAN_CAN_VERSE, CAN_CAN_VERSE_CHORDS],
      ['bridge', CAN_CAN_VERSE, CAN_CAN_VERSE_CHORDS],
      ['solo', 'z8', 'G'],
      ['chorus', CAN_CAN_VERSE, CAN_CAN_VERSE_CHORDS],
      ['chorus', CAN_CAN_VERSE, CAN_CAN_VERSE_CHORDS],
    ),
  },
  {
    // the sea shanty, Dorian on D (the white keys from D), a verse and the chorus; checked against a session tunebook
    id: 'drunken-sailor',
    name: 'Drunken Sailor',
    by: 'Shanty',
    bpm: 132,
    key: 'C',
    style: 'rock',
    octave: -1,
    passes: 1,
    // (five verses, each with its chorus)
    ...form(
      ['verse', DRUNKEN_SAILOR_VERSE, DRUNKEN_SAILOR_VERSE_CHORDS],
      ['chorus', DRUNKEN_SAILOR_CHORUS, DRUNKEN_SAILOR_VERSE_CHORDS],
      ['verse', DRUNKEN_SAILOR_VERSE, DRUNKEN_SAILOR_VERSE_CHORDS],
      ['chorus', DRUNKEN_SAILOR_CHORUS, DRUNKEN_SAILOR_VERSE_CHORDS],
      ['solo', 'z8', 'A'],
      ['verse', DRUNKEN_SAILOR_VERSE, DRUNKEN_SAILOR_VERSE_CHORDS],
      ['chorus', DRUNKEN_SAILOR_CHORUS, DRUNKEN_SAILOR_VERSE_CHORDS],
      ['verse', DRUNKEN_SAILOR_VERSE, DRUNKEN_SAILOR_VERSE_CHORDS],
      ['chorus', DRUNKEN_SAILOR_CHORUS, DRUNKEN_SAILOR_VERSE_CHORDS],
      ['solo', 'z8', 'A'],
      ['verse', DRUNKEN_SAILOR_VERSE, DRUNKEN_SAILOR_VERSE_CHORDS],
      ['chorus', DRUNKEN_SAILOR_CHORUS, DRUNKEN_SAILOR_VERSE_CHORDS],
    ),
  },
  {
    // the traditional spiritual; checked against a published lead sheet
    id: 'saints',
    hatsOnBeat: true,
    name: 'When the Saints',
    by: 'Trad., ska',
    bpm: 120,
    key: 'C',
    style: 'ska',
    passes: 1,
    // (5 times through, each its own arrangement)
    ...form(
      ['verse', SAINTS_VERSE, SAINTS_VERSE_CHORDS],
      ['solo', 'z8', 'G'],
      ['chorus', SAINTS_VERSE, SAINTS_VERSE_CHORDS],
      ['bridge', SAINTS_VERSE, SAINTS_VERSE_CHORDS],
      ['solo', 'z8', 'G'],
      ['chorus', SAINTS_VERSE, SAINTS_VERSE_CHORDS],
      ['chorus', SAINTS_VERSE, SAINTS_VERSE_CHORDS],
    ),
  },
  {
    // the Russian folk song (1861), checked against a session transcription: its tune twice through
    id: 'korobeiniki',
    name: 'Korobeiniki',
    by: 'Folk dance',
    bpm: 136,
    key: 'Em',
    style: 'dance',
    passes: 1,
    // (5 times through, each its own arrangement)
    ...form(
      ['verse', KOROBEINIKI_VERSE, KOROBEINIKI_VERSE_CHORDS],
      ['solo', 'z8', 'B'],
      ['chorus', KOROBEINIKI_VERSE, KOROBEINIKI_VERSE_CHORDS],
      ['bridge', KOROBEINIKI_VERSE, KOROBEINIKI_VERSE_CHORDS],
      ['solo', 'z8', 'B'],
      ['chorus', KOROBEINIKI_VERSE, KOROBEINIKI_VERSE_CHORDS],
      ['chorus', KOROBEINIKI_VERSE, KOROBEINIKI_VERSE_CHORDS],
    ),
  },
  {
    // Peer Gynt (1875): its theme, twice, landing home (from memory; not checked against a score)
    id: 'mountain-king',
    name: 'Mountain King',
    by: 'Grieg, rock',
    bpm: 120,
    key: 'Bm',
    style: 'rock',
    passes: 1,
    // (its theme eight times over, growing as Grieg's does, then home)
    ...form(
      ['intro', MOUNTAIN_KING_INTRO, MOUNTAIN_KING_INTRO_CHORDS],
      ['verse', MOUNTAIN_KING_INTRO, MOUNTAIN_KING_INTRO_CHORDS],
      ['verse', MOUNTAIN_KING_INTRO, MOUNTAIN_KING_INTRO_CHORDS],
      ['chorus', MOUNTAIN_KING_INTRO, MOUNTAIN_KING_INTRO_CHORDS],
      ['solo', 'z8', 'F#'],
      ['chorus', MOUNTAIN_KING_INTRO, MOUNTAIN_KING_INTRO_CHORDS],
      ['bridge', MOUNTAIN_KING_INTRO, MOUNTAIN_KING_INTRO_CHORDS],
      ['chorus', MOUNTAIN_KING_INTRO, MOUNTAIN_KING_INTRO_CHORDS],
      ['chorus', MOUNTAIN_KING_INTRO, MOUNTAIN_KING_INTRO_CHORDS],
      ['outro', 'B8', 'Bm'],
    ),
  },
  {
    // The Entertainer (1902), its whole form: the intro, A, B, A, C (in F), the interlude and D, the repeats cut;
    // its notes from the Mutopia Project's public-domain edition (Mutopia-2016/11/25-263), its right hand's top line
    // (Joplin's "Not fast" 2/4 is about 68 a quarter: its sixteenths, the eighths here, at 136)
    id: 'entertainer',
    name: 'The Entertainer',
    by: 'Joplin',
    key: 'C',
    style: 'funk',
    bpm: 136,
    passes: 1,
    sections: [{ bar: 0, kind: 'intro' }, { bar: 4, kind: 'verse' }, { bar: 20, kind: 'chorus' }, { bar: 36, kind: 'verse' }, { bar: 52, kind: 'bridge' }, { bar: 68, kind: 'break' }, { bar: 72, kind: 'chorus' }],
    melody: 'D E C A,2 B, G,2 | D E C A,2 B, G,2 | D, E, C, z5 | z4 G,2 D, ^D, | E, C2 E, C2 E, C- | C5 C D ^D | E C D E2 B, D2 | C6 D, ^D, | E, C2 E, C2 E, C- | C6 A, G, | ^F, A, C E2 D C A, | D6 D, ^D, | E, C2 E, C2 E, C- | C5 C D ^D | E C D E2 B, D2 | C6 C D | E C D E2 C D C | E C D E2 C D C | E C D E2 B, D2 | C5 E, F, ^F, | G,2 A, G,2 E, F, ^F, | G,2 A, G,2 E C G, | A, B, C D E D C D | G, E F G A G E F | G,2 A, G,2 E, F, ^F, | G,2 A, G,2 G A ^A | B B2 B2 A ^F D | G5 E, F, ^F, | G,2 A, G,2 E, F, ^F, | G,2 A, G,2 E C G, | A, B, C D E D C D | C5 G, ^F, G, | C2 A, C2 A, C A, | G, C E G2 E C G, | A,2 C2 E D2 C- | C6 D, ^D, | E, C2 E, C2 E, C- | C5 C D ^D | E C D E2 B, D2 | C6 D, ^D, | E, C2 E, C2 E, C- | C6 A, G, | ^F, A, C E2 D C A, | D6 D, ^D, | E, C2 E, C2 E, C- | C5 C D ^D | E C D E2 B, D2 | C6 C D | E C D E2 C D C | E C D E2 C D C | E C D E2 B, D2 | C4 C2 z2 | A ^G A4 c2 | D2 ^A, =A, ^A, C D2 | F E F4 A2 | ^A2 G, ^F, G, A, ^A, G | D2 G D2 G D2 | C4 F4 | E ^G B E2 D B c | A4 ^A4 | A ^G A4 c2 | D2 ^A, =A, ^A, C D2 | F E F4 A2 | ^A2 G, ^F, G, A, ^A, G | D2 G D2 G D2 | C4 F3 F | A, C2 G2 C D E | F2 z2 F2 z2 | C2 A, C2 A, C A, | G, C E G2 E C G, | A,2 C2 E D2 C- | C4 C2 z2 | F,2 E, F,2 E, F,2 | z A, D A, C D C A, | G,2 ^F, G,2 F, G,2 | z C E C D E D C | D2 ^C D2 C D2 | z F A F G A G F | C C C4 A2 | G2 G, G, G,2 G,2 | F,2 E, F,2 E, F,2 | z A, D A, C D C A, | G,2 ^F, G,2 F, G,2 | z C E C D E D C | A, ^G, A, G2 F2 C | E ^D E A2 c G E | C2 C2 E D2 C- | C4 C2 z2',
    chords: 'Am G | Am G | Am | G | C | F C | C G | C | C | F C | D | G | C | F C | C G | C | C | Am Fm | C G | C | C | C | F | C | C | C | G D | Em | C | C | F | C | F | C | D G | C | C | F C | C G | C | C | F C | D | G | C | F C | C G | C | C | Am Fm | C G | C | F | A# | Dm | Gm | Gm | F Dm | E | Am C | F | A# | Dm | Gm | Gm | F C# | F C | F | F | C | D G | C | Dm | F | C | C | G | G | Cm | C | Dm | F | C | C | Dm | C | D G | C',
  },
  {
    // Bagatelle WoO 59 (1810), whole: A, the C major episode, A, the F major one, A, the pedal-A section, A; its
    // notes from the Mutopia Project's public-domain edition (Mutopia-2015/08/18-931), its right hand's top line
    // (the 32nd-note runs are the band's). In its own 3/8: a beat here is an eighth (Poco moto, about 126 a minute)
    id: 'fur-elise',
    name: 'Für Elise',
    by: 'Beethoven',
    key: 'Am',
    style: 'shufflehop',
    bpm: 126,
    passes: 1,
    meter: 3,
    unit: 0.5,
    sections: [{ bar: 0, kind: 'verse' }, { bar: 8, kind: 'chorus' }, { bar: 15, kind: 'verse' }, { bar: 23, kind: 'bridge' }, { bar: 31, kind: 'break' }, { bar: 39, kind: 'verse' }, { bar: 46, kind: 'chorus' }, { bar: 53, kind: 'verse' }, { bar: 61, kind: 'bridge' }, { bar: 79, kind: 'break' }, { bar: 85, kind: 'verse' }],
    melody: 'z4 e ^d | e ^d e B =d c | A2 z C E A | B2 z E ^G B | c2 z E e ^d | e ^d e B =d c | A2 z C E A | B2 z E c B | A2 z B c d | e3 G f e | d3 F e d | c3 E d c | B2 z E e z | z e e z2 ^d | e2 z ^d e d | e ^d e B =d c | A2 z C E A | B2 z E ^G B | c2 z E e ^d | e ^d e B =d c | A2 z C E A | B2 z E c B | A2 z B c d | A2 z c c z | c4 f3/2 z1/2 | e2 d2 ^a3/2 z1/2 | a g f e d c | ^A2 =A2 z2 | c4 d ^d | e3 e f A | c4 d3/2 z1/2 | z6 | z6 | z6 | z6 | z6 | e3 B e ^d | e3 B e ^d | e ^d e d e d | e ^d e B =d c | A2 z C E A | B2 z E ^G B | c2 z E e ^d | e ^d e B =d c | A2 z C E A | B2 z E c B | A2 z B c d | e3 G f e | d3 F e d | c3 E d c | B2 z E e z | z e e z2 ^d | e z2 ^d e d | e ^d e B =d c | A2 z C E A | B2 z E ^G B | c2 z E e ^d | e ^d e B =d c | A2 z C E A | B2 z E c B | A2 z4 | ^c6 | d4 e f | f4 f2 | e6 | d4 c B | A4 A2 | A2 c2 B2 | A6 | ^c6 | d4 e f | f4 f2 | f6 | ^d4 =d c | ^A4 =A2 | ^G4 G2 | A4 z2 | B2 z4 | z6 | z6 | z6 | z6 | z6 | e ^d e B =d c | A2 z C E A | B2 z E ^G B | c2 z E e ^d | e ^d e B =d c | A2 z C E A | B2 z E c B | A2 z B c d | e3 G f e | d3 F e d | c3 E d c | B2 z E e z | z e e z2 ^d | e z2 ^d e d | e ^d e B =d c | A2 z C E A | B2 z E ^G B | c2 z E e ^d | e ^d e B =d c | A2 z C E A | B2 z E c B | A2 z4',
    chords: 'C | C | Am | Em | Am | C | Am | Em | Am | C | G | Am | Em | C | C | C | Am | Em | Am | C | Am | Em | Am | Am | F | A# | F | F | F | Am | C | C | C | C | C | Em | Em | Em | C | C | Am | Em | Am | C | Am | Em | Am | C | G | Am | Em | C | C | C | Am | Em | Am | C | Am | Em | Am | A | Dm | Dm | Am | Dm | F | Am | Am | A | Dm | Dm | A# | D# | A# | G | Am | Em | Am | Am | Am | Am | Am | C | Am | Em | Am | C | Am | Em | Am | C | G | Am | Em | C | C | C | Am | Em | Am | C | Am | Em | Am',
  },
  {
    // the overture's finale (1829), checked against an 1844 tune book
    id: 'william-tell',
    name: 'William Tell',
    by: 'Rossini',
    // (in its own 2/4, its sixteenths sixteenths: a gallop at 104 a quarter, under the Allegro vivace's 150 or so but
    // twice what it was; transposed from E to D for the instruments)
    bpm: 104,
    key: 'D',
    style: 'rock',
    meter: 2,
    unit: 0.25,
    octave: -1,
    passes: 1,
    // (4 times through, each its own arrangement)
    ...form(
      ['verse', WILLIAM_TELL_VERSE, WILLIAM_TELL_VERSE_CHORDS],
      ['solo', 'z8 | z8', 'A | A'],
      ['chorus', WILLIAM_TELL_VERSE, WILLIAM_TELL_VERSE_CHORDS],
      ['bridge', WILLIAM_TELL_VERSE, WILLIAM_TELL_VERSE_CHORDS],
      ['solo', 'z8 | z8', 'A | A'],
      ['chorus', WILLIAM_TELL_VERSE, WILLIAM_TELL_VERSE_CHORDS],
    ),
  },
  {
    // Canon per 3 violini e basso (about 1700), the whole canon over its ground: the first violin's line (its 32nd
    // notes are the band's), from the Mutopia Project's edition (Mutopia-2015/09/02-2047, typeset by Michael Fischer
    // v. Mollard, CC BY 4.0); its chords the ground's, one a beat
    id: 'canon',
    name: 'Canon in D',
    by: 'Pachelbel',
    key: 'D',
    style: 'ballad',
    bpm: 66,
    passes: 1,
    sections: [{ bar: 0, kind: 'intro' }, { bar: 2, kind: 'verse' }, { bar: 10, kind: 'chorus' }, { bar: 14, kind: 'verse' }, { bar: 18, kind: 'chorus' }, { bar: 22, kind: 'break' }, { bar: 26, kind: 'chorus' }, { bar: 38, kind: 'verse' }, { bar: 42, kind: 'chorus' }, { bar: 50, kind: 'verse' }, { bar: 56, kind: 'outro' }],
    melody: 'z8 | z8 | F2 E2 D2 C2 | B,2 A,2 B,2 C2 | D2 C2 B,2 A,2 | G,2 F,2 G,2 E,2 | D, F, A, G, F, D, F, E, | D, B, D, A, G, B, A, G, | F, D, E, C D F A A, | B, G, A, F, D, D D3/2 C1/2 | D1/2 C1/2 D1/2 D,1/2 C1/2 A,1/2 E,1/2 F,1/2 D,1/2 D1/2 C1/2 B,1/2 C1/2 F1/2 A1/2 B1/2 | G1/2 F1/2 E1/2 G1/2 F1/2 E1/2 D1/2 C1/2 B,1/2 A,1/2 G,1/2 F,1/2 E,1/2 G,1/2 F,1/2 E,1/2 | D,1/2 E,1/2 F,1/2 G,1/2 A,1/2 E,1/2 A,1/2 G,1/2 F,1/2 B,1/2 A,1/2 G,1/2 A,1/2 G,1/2 F,1/2 E,1/2 | D,1/2 B,1/2 B,1/2 C1/2 D1/2 C1/2 B,1/2 A,1/2 G,1/2 F,1/2 E,1/2 B,1/2 A,1/2 B,1/2 A,1/2 G,1/2 | F, F E2 z D F2 | B2 A2 B2 c2 | d D C2 z B, D2 | D3 D D G E A | A1/2 F1/2 A1/2 F1/2 A1/2 B,1/2 D1/2 F1/2 G1/2 D1/2 F1/2 F,1/2 A,1/2 B,1/2 A,1/2 G,1/2 | A,1/2 B,1/2 A,1/2 F,1/2 F,1/2 E,1/2 F,1/2 A,1/2 B,1/2 B,1/2 B,1/2 C1/2 D1/2 C1/2 E1/2 G1/2 | A1/2 D1/2 F1/2 E1/2 E1/2 D1/2 F1/2 E1/2 D1/2 B,1/2 D1/2 D,1/2 F,1/2 G,1/2 F,1/2 D1/2 | D1/2 D1/2 C1/2 A,1/2 A,1/2 G,1/2 A,1/2 C1/2 D1/2 D1/2 D1/2 C1/2 C1/2 E1/2 D1/2 D1/2 | D z C z B, z D z | D, z D, z D, z E, z | z A, z A, z F, z A, | z G, z F, z G, z E | F1/2 F,1/2 G,1/2 F,1/2 E,1/2 E1/2 F1/2 E1/2 D1/2 F,1/2 D,1/2 B,1/2 A,1/2 A,1/2 G,1/2 A,1/2 | B,1/2 B,1/2 C1/2 B,1/2 A,1/2 A,1/2 G,1/2 A,1/2 B,1/2 B,1/2 A,1/2 B,1/2 C1/2 C1/2 B,1/2 C1/2 | D,1/2 D1/2 E1/2 D1/2 C1/2 C1/2 D,1/2 C1/2 B,1/2 B,1/2 A,1/2 B,1/2 C1/2 C1/2 F,1/2 E,1/2 | D,1/2 D1/2 E1/2 G1/2 F1/2 F,1/2 A,1/2 F1/2 D1/2 G1/2 F1/2 G1/2 E1/2 A,1/2 G,1/2 A,1/2 | F,1/2 A,1/2 A,1/2 A,1/2 A,1/2 A,1/2 A,1/2 A,1/2 F,1/2 F,1/2 F,1/2 F,1/2 F,1/2 F,1/2 A,1/2 A,1/2 | G,1/2 G,1/2 G,1/2 D1/2 D1/2 D1/2 D1/2 D1/2 D1/2 D1/2 B,1/2 B,1/2 A,1/2 A,1/2 E1/2 C1/2 | A,1/2 F1/2 F1/2 F1/2 E1/2 E1/2 E1/2 E1/2 D1/2 D1/2 D1/2 D1/2 A1/2 A1/2 A1/2 A1/2 | B1/2 B1/2 B1/2 B1/2 A1/2 A1/2 A1/2 A1/2 B1/2 B1/2 B1/2 B1/2 c1/2 C1/2 C1/2 C1/2 | D1/2 D,1/2 F,1/2 D,1/2 C1/2 C1/2 E1/2 C1/2 B,1/2 B,1/2 D,1/2 B,1/2 C1/2 A,1/2 G,1/2 E,1/2 | D,1/2 G,1/2 F,1/2 G,1/2 F,1/2 D,1/2 F,1/2 A,1/2 G,1/2 B,1/2 A,1/2 F,1/2 E,1/2 A,1/2 G,1/2 E,1/2 | F,1/2 D1/2 D1/2 F,1/2 A,1/2 A,1/2 C1/2 A,1/2 F,1/2 D1/2 F1/2 D1/2 F1/2 F1/2 E1/2 C1/2 | B,1/2 B,1/2 B,1/2 C1/2 D1/2 F1/2 E1/2 F1/2 G1/2 D1/2 C1/2 B,1/2 A,1/2 E,1/2 A,1/2 A,1/2 | A,3 A, D,3 A, | G,2 A,2 G, D, D,3/2 C1/2 | D, D C2 B,2 A,2 | D,3/2 E,1/2 F,2 B,2 E,3/2 E,1/2 | F,3/2 F1/2 F1/2 G1/2 F1/2 E1/2 D3/2 D1/2 D1/2 E1/2 D1/2 C1/2 | B,2 D2 D1/2 =C1/2 B,1/2 C1/2 A,3/2 A,1/2 | A,3/2 A1/2 A1/2 B1/2 A1/2 G1/2 F3/2 F1/2 F1/2 G1/2 F1/2 E1/2 | D1/2 =C1/2 B,1/2 C1/2 A,3/2 A,1/2 G, D ^C3/2 C1/2 | D D2 C2 B,2 A,- | A, G,2 F,5/2 E,1/2 E,2 | F, F2 E D d2 =c | B2 d A B2 A2 | A2 A,3/2 G,1/2 F,2 F3/2 E1/2 | D3 D D2 C2 | D D, C C B, B, A, A, | G, G F F, E, B, E, E | F F, E, E D D, C C | B, B A A, G,3/2 E1/2 A, A, | D2 z6',
    chords: 'D A Bm F#m | G D G A | D A Bm F#m | G D G A | D A Bm F#m | G D G A | D A Bm F#m | G D G A | D A Bm F#m | G D G A | D A Bm F#m | G D G A | D A Bm F#m | G D G A | D A Bm F#m | G D G A | D A Bm F#m | G D G A | D A Bm F#m | G D G A | D A Bm F#m | G D G A | D A Bm F#m | G D G A | D A Bm F#m | G D G A | D A Bm F#m | G D G A | D A Bm F#m | G D G A | D A Bm F#m | G D G A | D A Bm F#m | G D G A | D A Bm F#m | G D G A | D A Bm F#m | G D G A | D A Bm F#m | G D G A | D A Bm F#m | G D G A | D A Bm F#m | G D G A | D A Bm F#m | G D G A | D A Bm F#m | G D G A | D A Bm F#m | G D G A | D A Bm F#m | G D G A | D A Bm F#m | G D G A | D A Bm F#m | G D G A | D',
  },
  {
    // Rondo alla turca (Sonata K. 331, 1783), the whole movement; its notes from the Mutopia Project's public-domain
    // edition (Mutopia-2015/08/13-108), its right hand's top line. In its own 2/4, its sixteenths sixteenths, at a
    // steady Allegretto
    id: 'turkish-march',
    name: 'Turkish March',
    by: 'Mozart',
    key: 'Am',
    style: 'funk',
    bpm: 100,
    passes: 1,
    meter: 2,
    unit: 0.25,
    sections: [{ bar: 0, kind: 'verse' }, { bar: 24, kind: 'chorus' }, { bar: 32, kind: 'bridge' }, { bar: 56, kind: 'chorus' }, { bar: 64, kind: 'verse' }, { bar: 88, kind: 'bridge' }, { bar: 96, kind: 'chorus' }, { bar: 122, kind: 'outro' }],
    melody: "z4 B A ^G A | c2 z2 d c B c | e2 z2 f e ^d e | b a ^g a b a g a | c'4 a2 c'2 | b2 a2 g2 a2 | b2 a2 g2 a2 | b2 a2 g2 ^f2 | e4 e2 f2 | g2 g2 a g f e | d2 G2 e2 f2 | g2 g2 a g f e | d4 c2 d2 | e2 e2 f e d c | B2 E2 c2 d2 | e2 e2 f e d c | B4 B A ^G A | c2 z2 d c B c | e2 z2 f e ^d e | b a ^g a b a g a | c'2 z2 a2 b2 | c'2 b2 a2 ^g2 | a2 e2 f2 d2 | c4 B3 z | A4 A2 B2 | ^c4 A2 B2 | ^c2 B2 A2 ^G2 | ^F2 ^G2 A2 B2 | ^G2 E2 A2 B2 | ^c4 A2 B2 | ^c2 B2 A2 ^G2 | ^F2 B2 ^G2 E2 | A4 ^c d c b | a b a ^g ^f a g f | f ^f ^g =f ^c ^d f c | ^f =f ^f ^g a g a b | ^c c' c c' c d c b | a b a ^g ^f a g f | e ^f ^g e ^c ^d e c | ^d e ^f d c ^c d =c | ^c4 e d c B | A B ^c d e ^f ^g a | a ^g ^f e e d ^c B | A B ^c d e ^f ^g a | ^a2 b2 e d ^c B | A B ^c d e ^f ^g a | a ^g ^f e e d ^c B | ^c e A c B d ^G B | A4 ^c d c b | a b a ^g ^f a g f | f ^f ^g =f ^c ^d f c | ^f =f ^f ^g a g a b | ^c c' c c' c c' c ^a | d ^c d c d c d c | d ^c b a ^g a b g | a b ^c ^f =f ^f ^g =f | ^f4 A2 B2 | ^c4 A2 B2 | ^c2 B2 A2 ^G2 | ^F2 ^G2 A2 B2 | ^G2 E2 A2 B2 | ^c4 A2 B2 | ^c2 B2 A2 ^G2 | ^F2 B2 ^G2 E2 | A4 B A ^G A | c2 z2 d c B c | e2 z2 f e ^d e | b a ^g a b a g a | c'4 a2 c'2 | b2 a2 g2 a2 | b2 a2 g2 a2 | b2 a2 g2 ^f2 | e4 e2 f2 | g2 g2 a g f e | d2 G2 e2 f2 | g2 g2 a g f e | d4 c2 d2 | e2 e2 f e d c | B2 E2 c2 d2 | e2 e2 f e d c | B4 B A ^G A | c2 z2 d c B c | e2 z2 f e ^d e | b a ^g a b a g a | c'2 z2 a2 b2 | c'2 b2 a2 ^g2 | a2 e2 f2 d2 | c4 B3 z | A4 A a B b | ^c c z2 A a B b | ^c c B b A a ^G ^g | ^F ^f ^G ^g A a B b | ^G ^g E e A a B b | ^c c z2 A a B b | ^c c B b A a ^G ^g | ^F ^f B b ^G ^g E e | A7/2 z1/2 A4 | ^c3 c c4- | ^c4 c4- | ^c4 d c b c | d ^c b c d4- | d7/2 z1/2 ^c3/2 z1/2 c3/2 z1/2 | ^c3/2 z1/2 c2 b4- | b2 e2 ^c4- | ^c4 c4- | ^c4 d c b c | d ^c b c d4- | d7/2 z1/2 ^c4- | ^c7/2 z1/2 b3/2 z1/2 b3/2 z1/2 | b3/2 z1/2 b2 a4 | ^c3 c c4- | ^c4 c4- | ^c4 d c b c | d ^c b c d4- | d7/2 z1/2 ^c3/2 z1/2 c3/2 z1/2 | ^c3/2 z1/2 c2 b4- | b2 e2 ^c4- | ^c4 c4- | ^c4 d c b c | d ^c b c d4- | d7/2 z1/2 ^c4- | ^c7/2 z1/2 b3/2 z1/2 b3/2 z1/2 | b3/2 z1/2 b2 A4- | A2 ^c2 A4- | A2 e2 A4- | A2 ^c2 A2 c2 | A2 e2 A4 | A4 A4",
    chords: 'Dm | Am | Am | Am | Am | Em | Em | Em | C | C | G | C | G | Am | Em | Am | E | Am | Am | Am | F | Dm | Dm | Am | Am | A | F#m | G#m | E | A | F#m | E | Am | F#m | C# | F#m | C# | F#m | C#m | D#m | C#m | A | E | A | E | A | E | Dm | Am | F#m | C# | F#m | C# | Bm | E | F#m | F#m | A | F#m | G#m | E | A | F#m | E | Am | Am | Am | Am | Am | Em | Em | Em | C | C | G | C | G | Am | Em | Am | E | Am | Am | Am | F | Dm | Dm | Am | Am | Am | Dm | Dm | Am | Am | Dm | Em | Am | A | A | A | D | D | A | A | A | A | D | D | A | E | A | A | A | Dm | Dm | Em | A | A | A | D | D | A | A | A | Am | A | Am | A',
  },
  {
    // the hymn tune New Britain (1835), checked against a session tunebook; in three
    id: 'amazing-grace',
    drumsFrom: 18,
    name: 'Amazing Grace',
    by: 'Hymn, soul',
    bpm: 84,
    key: 'G',
    style: 'three',
    meter: 3,
    passes: 1,
    // (4 times through, each its own arrangement)
    ...form(
      ['verse', AMAZING_GRACE_VERSE, AMAZING_GRACE_VERSE_CHORDS],
      ['solo', 'z6', 'D'],
      ['verse', AMAZING_GRACE_VERSE, AMAZING_GRACE_VERSE_CHORDS],
      ['chorus', AMAZING_GRACE_VERSE, AMAZING_GRACE_VERSE_CHORDS],
      ['solo', 'z6', 'D'],
      ['chorus', AMAZING_GRACE_VERSE, AMAZING_GRACE_VERSE_CHORDS],
    ),
  },
  {
    // the English ballad, Dorian on E, checked against a session tunebook; in three
    id: 'scarborough-fair',
    drumsFrom: 19,
    name: 'Scarborough Fair',
    by: 'Trad. folk',
    bpm: 96,
    key: 'D',
    style: 'three',
    meter: 3,
    octave: -1,
    passes: 1,
    // (5 times through, each its own arrangement)
    ...form(
      ['verse', SCARBOROUGH_FAIR_VERSE, SCARBOROUGH_FAIR_VERSE_CHORDS],
      ['solo', 'z6', 'B'],
      ['verse', SCARBOROUGH_FAIR_VERSE, SCARBOROUGH_FAIR_VERSE_CHORDS],
      ['chorus', SCARBOROUGH_FAIR_VERSE, SCARBOROUGH_FAIR_VERSE_CHORDS],
      ['solo', 'z6', 'B'],
      ['bridge', SCARBOROUGH_FAIR_VERSE, SCARBOROUGH_FAIR_VERSE_CHORDS],
      ['chorus', SCARBOROUGH_FAIR_VERSE, SCARBOROUGH_FAIR_VERSE_CHORDS],
    ),
  },
  // ---------------------------------------------------------------- the originals
  {
    // synth-pop: a hook that answers itself, then a chorus that climbs to it
    id: 'rooftop',
    name: 'Rooftop',
    by: 'Original',
    bpm: 116,
    key: 'C',
    style: 'synthpop',
    octave: -1,
    original: true,
    passes: 1,
    // (intro, verse, chorus, verse, chorus, a bridge, the chorus again, and out on its last line)
    ...form(
      ['intro', 'z8 | z8 | z8 | z8', 'C | G | Am | F'],
      ['verse', ROOFTOP_VERSE, ROOFTOP_VERSE_CHORDS],
      ['chorus', ROOFTOP_CHORUS, ROOFTOP_CHORUS_CHORDS],
      ['verse', ROOFTOP_VERSE, ROOFTOP_VERSE_CHORDS],
      ['chorus', ROOFTOP_CHORUS, ROOFTOP_CHORUS_CHORDS],
      ['solo', 'z8', 'G'],
      ['bridge', 'A2 c2 e2 a2 | g2 f2 e2 c2 | e2 g2 e2 c2 | d4 B4 | A2 c2 e2 a2 | g2 f2 a2 f2 | e2 d2 c2 A2 | B4 d4', 'Am | F | C | G | Am | F | Dm | G'],
      ['chorus', ROOFTOP_CHORUS, ROOFTOP_CHORUS_CHORDS],
      ['outro', 'e2 e2 e d c2 | d2 d2 d e f2 | e2 d2 c2 A2 | B2 d2 c4', 'C | G | Am F | G C'],
    ),
  },
  {
    // hip-hop: a piano riff over boom-bap, a hook an octave up
    id: 'late-bus',
    name: 'Late Bus',
    by: 'Original',
    bpm: 88,
    key: 'Am',
    style: 'hiphop',
    original: true,
    passes: 1,
    // (intro, verse, chorus, verse, chorus, a bridge, the chorus again, and out on its last line)
    ...form(
      ['intro', 'z8 | z8 | z8 | z8', 'Am | F | C | G'],
      ['verse', LATE_BUS_VERSE, LATE_BUS_VERSE_CHORDS],
      ['chorus', LATE_BUS_CHORUS, LATE_BUS_CHORUS_CHORDS],
      ['verse', LATE_BUS_VERSE, LATE_BUS_VERSE_CHORDS],
      ['chorus', LATE_BUS_CHORUS, LATE_BUS_CHORUS_CHORDS],
      ['solo', 'z8', 'E'],
      ['bridge', 'c2 c2 c B A2 | d2 d2 d c B2 | e2 e2 d c B2 | c2 A2 A4 | c2 c2 c B A2 | d2 d2 d e f2 | e2 d2 c2 B2 | B4 ^G4', 'F | G | Em | Am | F | G | Dm | E'],
      ['chorus', LATE_BUS_CHORUS, LATE_BUS_CHORUS_CHORDS],
      ['outro', 'a2 a2 g e- e2 | f2 e2 c2 A2 | d2 c2 B2 ^G2 | A8', 'Am | F | Dm E | Am'],
    ),
  },
  {
    // reggaeton: a sung line over the dembow, a chorus that falls into place
    id: 'mango-season',
    name: 'Mango Season',
    by: 'Original',
    bpm: 94,
    key: 'G',
    style: 'reggaeton',
    original: true,
    passes: 1,
    // (intro, verse, chorus, verse, chorus, a bridge, the chorus again, and out on its last line)
    ...form(
      ['intro', 'z8 | z8 | z8 | z8', 'Em | C | G | D'],
      ['verse', MANGO_SEASON_VERSE, MANGO_SEASON_VERSE_CHORDS],
      ['chorus', MANGO_SEASON_CHORUS, MANGO_SEASON_CHORUS_CHORDS],
      ['verse', MANGO_SEASON_VERSE, MANGO_SEASON_VERSE_CHORDS],
      ['chorus', MANGO_SEASON_CHORUS, MANGO_SEASON_CHORUS_CHORDS],
      ['solo', 'z8', 'D'],
      ['bridge', 'c2 c2 c B A2 | d2 d2 d c B2 | B2 A2 B d- d2 | e2 d2 B4 | c2 c2 c B A2 | d2 d2 d e f2 | e2 d2 c2 A2 | A4 D4', 'C | D | Bm | Em | C | D | Am | D'],
      ['chorus', MANGO_SEASON_CHORUS, MANGO_SEASON_CHORUS_CHORDS],
      ['outro', 'e2 d B- B2 G2 | e2 d B- B2 A2 | G2 A2 B2 A2 | G8', 'Em | C | G D | G'],
    ),
  },
  {
    // funk in E Dorian: a riff that bounces off its low E, then a line that lifts
    id: 'cold-brew',
    name: 'Cold Brew',
    by: 'Original',
    bpm: 100,
    key: 'D',
    style: 'funk',
    octave: -1,
    original: true,
    passes: 1,
    // (intro, verse, chorus, verse, chorus, a bridge, the chorus again, and out on its last line)
    ...form(
      ['intro', 'z8 | z8 | z8 | z8', 'Em | A | Em | A'],
      ['verse', COLD_BREW_VERSE, COLD_BREW_VERSE_CHORDS],
      ['chorus', COLD_BREW_CHORUS, COLD_BREW_CHORUS_CHORDS],
      ['verse', COLD_BREW_VERSE, COLD_BREW_VERSE_CHORDS],
      ['chorus', COLD_BREW_CHORUS, COLD_BREW_CHORUS_CHORDS],
      ['solo', 'z8', 'B'],
      ['bridge', 'B2 d2 e2 d B | A2 c2 e4 | B2 d2 g2 f e | e2 d2 c2 A2 | B2 d2 e2 d B | A2 c2 e2 g2 | f2 e2 d2 B2 | A4 F4', 'G | A | Em | A | G | A | Bm | D'],
      ['chorus', COLD_BREW_CHORUS, COLD_BREW_CHORUS_CHORDS],
      ['outro', 'e2 d B- B2 A G | A2 B A- A2 F2 | G2 F2 E2 D2 | E8', 'Em | A | Em D | Em'],
    ),
  },
  {
    // a dance-floor hook: bright, then a chorus that rings out on the top note
    id: 'kite-hill',
    name: 'Kite Hill',
    by: 'Original',
    bpm: 124,
    key: 'F',
    style: 'dance',
    original: true,
    passes: 1,
    // (intro, verse, chorus, verse, chorus, a bridge, the chorus again, and out on its last line)
    ...form(
      ['intro', 'z8 | z8 | z8 | z8', 'F | C | Dm | Bb'],
      ['verse', KITE_HILL_VERSE, KITE_HILL_VERSE_CHORDS],
      ['chorus', KITE_HILL_CHORUS, KITE_HILL_CHORUS_CHORDS],
      ['verse', KITE_HILL_VERSE, KITE_HILL_VERSE_CHORDS],
      ['chorus', KITE_HILL_CHORUS, KITE_HILL_CHORUS_CHORDS],
      ['solo', 'z8', 'C'],
      ['bridge', 'A2 d2 f2 d2 | d2 c2 B2 F2 | A2 c2 f2 c2 | e4 c4 | A2 d2 f2 d2 | e2 f2 d2 B2 | B2 A2 G2 B2 | c4 z4', 'Dm | Bb | F | C | Dm | Bb | Gm | C'],
      ['chorus', KITE_HILL_CHORUS, KITE_HILL_CHORUS_CHORDS],
      ['outro', 'f2 f2 e c- c2 | e2 e2 d c- c2 | d2 c2 B2 G2 | F8', 'F | C | Bb C | F'],
    ),
  },
  {
    // reggae: a one-drop, a melody that takes its time
    id: 'low-tide',
    name: 'Low Tide',
    by: 'Original',
    bpm: 84,
    key: 'D',
    style: 'reggae',
    original: true,
    passes: 1,
    // (intro, verse, chorus, verse, chorus, a bridge, the chorus again, and out on its last line)
    ...form(
      ['intro', 'z8 | z8 | z8 | z8', 'D | G | A | D'],
      ['verse', LOW_TIDE_VERSE, LOW_TIDE_VERSE_CHORDS],
      ['chorus', LOW_TIDE_CHORUS, LOW_TIDE_VERSE_CHORDS],
      ['verse', LOW_TIDE_VERSE, LOW_TIDE_VERSE_CHORDS],
      ['chorus', LOW_TIDE_CHORUS, LOW_TIDE_VERSE_CHORDS],
      ['solo', 'z8', 'A'],
      ['bridge', 'B2 d2 d2 c B | c2 d2 A4 | c2 A2 A2 B c | d4 B4 | B2 d2 d2 c B | c2 d2 c2 A2 | F2 E2 D2 F2 | E4 z4', 'G | A | F#m | Bm | G | A | Em | A'],
      ['chorus', LOW_TIDE_CHORUS, LOW_TIDE_VERSE_CHORDS],
      ['outro', 'd2 d2 c B- B2 | B2 B2 A G- G2 | A2 G2 F2 E2 | D8', 'Bm | G | A | D'],
    ),
  },
];
