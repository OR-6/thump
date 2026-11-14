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
  /**
   * A lesson: the instrument it teaches, and its steps from a bar on: a word for the moment, what to do, the level its
   * notes are written at, and (optionally) only these targets.
   */
  lesson?: { inst: string; steps: readonly { bar: number; title: string; say: string; level: 'easy' | 'normal' | 'hard'; only?: readonly string[] }[] };
}

/** One lesson per instrument: a slow original, its moves one at a time (bars 0, 4, 8, 12). */
const C_TUNE = 'C2 E2 G2 E2 | F2 A2 G4 | E2 G2 c2 G2 | F2 E2 D4 | C2 E2 G2 E2 | F2 A2 c4 | B2 G2 A2 B2 | c8 | ';
const C_CHORDS = 'C | F | C | G | C | F | G | C | ';
const KEYS_TUNE = 'C8 | E8 | G8 | c8 | C2 D2 E2 F2 | G2 F2 E2 D2 | C2 D2 E2 F2 | G8 | E2 E2 F2 G2 | G2 F2 E2 D2 | C2 C2 D2 E2 | E4 D4 | E2 E2 F2 G2 | G2 F2 E2 D2 | C2 C2 D2 E2 | D4 C4';
const KEYS_CHORDS = 'C | C | C | C | C | G | C | G | C | G | C | G | C | G | C | C';
const keysSteps = (first: string) => [
  { bar: 0, title: 'One note', say: first, level: 'normal' as const },
  { bar: 4, title: 'Walk up', say: 'Walk up the notes, then back down', level: 'normal' as const },
  { bar: 8, title: 'A tune', say: 'A tune you know: Ode to Joy', level: 'normal' as const },
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
    melody: C_TUNE + C_TUNE.trimEnd().replace(/\|\s*$/, ''),
    chords: C_CHORDS + C_CHORDS.trimEnd().replace(/\|\s*$/, ''),
    lesson: {
      inst: 'drums',
      steps: [
        { bar: 0, title: 'Snare', say: 'Hit the snare in the middle as it lights', level: 'normal', only: ['kit:snare'] },
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
    lesson: { inst: 'piano', steps: keysSteps('Press the lit key with one fingertip') },
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
    lesson: { inst: 'marimba', steps: keysSteps('Make fists: they are your mallets. Hit the lit bar') },
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
    melody: 'G2 B2 d2 B2 | c2 e2 d4 | A2 c2 B2 A2 | G8 | G2 B2 d2 B2 | c2 e2 d4 | A2 c2 B2 A2 | G8 | B2 d2 g2 d2 | e2 c2 d4 | c2 B2 A2 F2 | G8 | B2 d2 g2 d2 | e2 c2 d4 | c2 B2 A2 F2 | G8',
    chords: 'G | C | D | G | G | C | D | G | G | C | D | G | G | C | D | G',
    lesson: {
      inst: 'guitar',
      steps: [
        { bar: 0, title: 'Strum', say: 'Brush down across the strings as they light', level: 'easy' },
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
        { bar: 8, title: 'The tune', say: 'Fingertips on the lit notes: the tune', level: 'hard' },
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
    melody: C_TUNE + C_TUNE.trimEnd().replace(/\|\s*$/, ''),
    chords: C_CHORDS + C_CHORDS.trimEnd().replace(/\|\s*$/, ''),
    lesson: {
      inst: 'congas',
      steps: [
        { bar: 0, title: 'Two sounds', say: 'Palm in the middle, fingers on the edge', level: 'easy' },
        { bar: 4, title: 'Both drums', say: 'Now both drums, as they light', level: 'normal' },
        { bar: 8, title: 'All four', say: 'Middle and edge of each drum', level: 'hard' },
        { bar: 12, title: 'Your turn', say: 'All of it: keep the groove', level: 'hard' },
      ],
    },
  },
];

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
    passes: 2,
    melody:
      'F2 F2 G2 A2 | A2 G2 F2 E2 | D2 D2 E2 F2 | F3 E E4 | F2 F2 G2 A2 | A2 G2 F2 E2 | D2 D2 E2 F2 | E3 D D4 | ' +
      'E2 E2 F2 D2 | E2 F G F2 D2 | E2 F G F2 E2 | D2 E2 A,4 | F2 F2 G2 A2 | A2 G2 F2 E2 | D2 D2 E2 F2 | E3 D D4',
    chords: 'D | A | D | A | D | A | D | A D | A | A D | A | D A | D | A | D | A D',
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
    passes: 2,
    melody:
      'C4 D F E D | G2 G2 G A E F | D2 D2 D F E D | C c B A G F E D | C4 D F E D | G2 G2 G A E F | D2 D2 D F E D | C G D E C2 z2 | ' +
      'C4 D F E D | G2 G2 G A E F | D2 D2 D F E D | C c B A G F E D | C4 D F E D | G2 G2 G A E F | D2 D2 D F E D | C G D E C2 z2',
    chords: 'C G | C | G | C G | C G | C | G | C G C . | C G | C | G | C G | C G | C | G | C G C .',
  },
  {
    // the sea shanty, Dorian on D (the white keys from D), a verse and the chorus; checked against a session tunebook
    id: 'drunken-sailor',
    name: 'Drunken Sailor',
    by: 'Shanty',
    bpm: 132,
    key: 'C',
    style: 'rock',
    passes: 2,
    octave: -1,
    solo: 'C',
    melody:
      'A2 A A A2 A A | A2 D2 F2 A2 | G2 G G G2 G G | G2 C2 E2 G2 | A2 A A A2 A A | A2 B2 c2 d2 | c2 A2 G2 E2 | D4 D2 z2 | ' +
      'A4 A3 A | A2 D2 F2 A2 | G4 G3 G | G2 C2 E2 G2 | A4 A3 A | A2 B2 c2 d2 | c2 A2 G2 E2 | D4 D2 z2',
    chords: 'Dm | Dm | C | C | Dm | Dm | C | Dm | Dm | Dm | C | C | Dm | Dm | C | Dm',
  },
  {
    // the traditional spiritual; checked against a published lead sheet
    id: 'saints',
    name: 'When the Saints',
    by: 'Trad., ska',
    bpm: 120,
    key: 'C',
    style: 'ska',
    passes: 2,
    melody:
      'z2 C2 E2 F2 | G8 | z2 C2 E2 F2 | G8 | z2 C2 E2 F2 | G4 E4 | C4 E4 | D8 | ' +
      'z2 E2 E2 D2 | C8 | E4 G4 | G2 F6 | z4 E2 F2 | G4 E4 | C4 D4 | C8',
    chords: 'C | C | C | C | C | C | C | G | G | C | C | F | F | C | F G | C',
  },
  {
    // the Russian folk song (1861), checked against a session transcription: its tune twice through
    id: 'korobeiniki',
    name: 'Korobeiniki',
    by: 'Folk dance',
    bpm: 136,
    key: 'Em',
    style: 'dance',
    passes: 2,
    melody:
      'B2 F G A2 G F | E2 E G B2 A G | F3 G A2 B2 | G2 E2 E2 z2 | A2- A c e2 d c | B3 G B2 A G | F2 F G A2 B2 | G2 E2 E2 z2 | ' +
      'B2 F G A2 G F | E2 E G B2 A G | F3 G A2 B2 | G2 E2 E2 z2 | A2- A c e2 d c | B3 G B2 A G | F2 F G A2 B2 | G2 E2 E2 z2',
    chords: 'Em B | Em | B | Em | Am | Em | B | Em | Em B | Em | B | Em | Am | Em | B | Em',
  },
  {
    // Peer Gynt (1875): its theme, twice, landing home (from memory; not checked against a score)
    id: 'mountain-king',
    name: 'Mountain King',
    by: 'Grieg, rock',
    bpm: 120,
    key: 'Bm',
    style: 'rock',
    passes: 3,
    melody: 'B c d e f d f2 | ^e c ^e2 =e =c e2 | B c d e f d f b | a f d f a4 | B c d e f d f2 | ^e c ^e2 =e =c e2 | B c d e f d f b | a f d f a4 | B8',
    chords: 'Bm | F# C | Bm | D | Bm | F# C | Bm | D | Bm',
  },
  {
    // the first strain (1902), checked against a published transcription
    id: 'entertainer',
    name: 'The Entertainer',
    by: 'Joplin',
    bpm: 108,
    key: 'C',
    style: 'funk',
    passes: 2,
    octave: -1,
    melody:
      'z6 D ^D | E c- c E c2 E c- | c4- c c d ^d | e c d e- e B d2 | c6 D ^D | E c- c E c2 E c- | c4- c2 A G | ^F A c e- e d c A | ' +
      'd6 D ^D | E c- c E c2 E c- | c4- c c d ^d | e c d e- e B d2 | c6 c d | e c d e- e c d c | e c d e- e c d c | e c d e- e B d2 | c6 z2',
    chords: 'C | C | F C | C G7 | C | C | F C | D7 | G | C | F C | C G7 | C | C | F Fm | C G7 | C',
  },
  {
    // its famous opening (1810), checked against a published transcription: a bar of 3/8 is two beats here, its
    // sixteenths triplets over a swung beat
    id: 'fur-elise',
    name: 'Für Elise',
    by: 'Beethoven',
    bpm: 84,
    key: 'Am',
    style: 'shufflehop',
    passes: 2,
    meter: 2,
    unit: 1 / 3,
    melody:
      'z4 e ^d | e ^d e B =d c | A2 z C E A | B2 z E ^G B | c2 z E e ^d | e ^d e B =d c | A2 z C E A | B2 z E c B | A2 z2 e ^d | ' +
      'e ^d e B =d c | A2 z C E A | B2 z E ^G B | c2 z E e ^d | e ^d e B =d c | A2 z C E A | B2 z E c B | A4 z2',
    chords: 'Am | E | Am | E | Am | E | Am | E | Am | E | Am | E | Am | E | Am | E | Am',
  },
  {
    // the overture's finale (1829), checked against an 1844 tune book: its sixteenths are eighths here
    id: 'william-tell',
    name: 'William Tell',
    by: 'Rossini',
    bpm: 150,
    key: 'D',
    style: 'rock',
    passes: 2,
    octave: -1,
    melody:
      'z6 A A | A2 A A A2 A A | d2 e2 f2 A A | A2 A A d2 f2 | e2 c2 A2 A A | A2 A A A2 A A | d2 e2 f2 d3/2 f/2 | a3 a a g f e | d2 f2 d2 f f | ' +
      'f2 f f f2 f f | f2 b2 f2 b2 | f2 b2 f2 e2 | d e c d B2 f f | f2 f f f2 f f | f2 b2 f2 b2 | f2 b2 a2 ^g2 | a2 ^g2 a2 A A | ' +
      'A2 A A A2 A A | d2 e2 f2 A A | A2 A A d2 f2 | e2 c2 A2 A A | A2 A A A2 A A | d2 e2 f2 d3/2 f/2 | a3 a a g f e | d2 f2 d2 z2',
    chords: 'D | D | D | D | A | D | D | A | D | Bm | Bm | Bm | Bm | Bm | Bm | Bm E | A | D | D | D | A | D | D | A | D',
  },
  {
    // the canon's tune (about 1700), checked against a published transcription: its first two lines in half notes,
    // then its line in quarters, over its eight chords
    id: 'canon',
    name: 'Canon in D',
    by: 'Pachelbel',
    bpm: 84,
    key: 'D',
    style: 'ballad',
    passes: 2,
    melody: 'F4 E4 | D4 C4 | B,4 A,4 | B,4 C4 | D4 C4 | B,4 A,4 | G,4 F,4 | G,4 E,4 | D,2 F,2 A,2 G,2 | F,2 D,2 F,2 E,2 | G,4 F,4 | G,4 E,4 | D,8',
    chords: 'D A | Bm F#m | G D | G A | D A | Bm F#m | G D | G A | D A | Bm F#m | G D | G A | D',
  },
  {
    // Rondo alla turca (1783): its theme, its middle and its close, checked against a published transcription
    // (Mozart's sixteenths are eighths here)
    id: 'turkish-march',
    name: 'Turkish March',
    by: 'Mozart',
    bpm: 116,
    key: 'Am',
    style: 'funk',
    passes: 2,
    melody:
      'z4 B A ^G A | c4 d c B c | e4 f e ^d e | b a ^g a b a ^g a | c\'4 a2 c\'2 | b2 a2 g2 a2 | b2 a2 g2 a2 | b2 a2 g2 ^f2 | e4 e2 f2 | ' +
      'g2 g2 a g f e | d4 c2 d2 | e2 e2 f e d c | B4 B A ^G A | c4 d c B c | e4 f e ^d e | b a ^g a b a ^g a | c\'4 a2 b2 | c\'2 b2 a2 ^g2 | a2 e2 f2 d2 | c4 B4 | A4 z4',
    chords: 'Am | Am | Am | E | Am | Em | Em | Em B | Em | C | G | C | E | Am | Am | E | Am | Am E | Am Dm | Am E | Am',
  },
  {
    // the hymn tune New Britain (1835), checked against a session tunebook; in three
    id: 'amazing-grace',
    name: 'Amazing Grace',
    by: 'Hymn, soul',
    bpm: 84,
    key: 'G',
    style: 'three',
    passes: 2,
    meter: 3,
    melody: 'z4 D2 | G4 B G | B4 A2 | G4 E2 | D4 D2 | G4 B G | B4 A B | d6- | d2 z2 B2 | d4 B G | B4 A2 | G4 E2 | D4 D2 | G4 (3B A G | B4 A2 | G6- | G4 z2',
    chords: 'G | G | G | C | G | G | G | D | D | G | G | C | G | Em | D | G | G',
  },
  {
    // the English ballad, Dorian on E, checked against a session tunebook; in three
    id: 'scarborough-fair',
    name: 'Scarborough Fair',
    by: 'Trad. folk',
    bpm: 96,
    key: 'D',
    style: 'three',
    passes: 2,
    meter: 3,
    octave: -1,
    melody: 'E4 E2 | B4 B2 | F3 G F2 | E6- | E2 B2 d2 | e4 d2 | B2 c2 A2 | B6- | B4 e2 | e4 e2 | d4 B2 | B2 A2 G2 | F2 D4- | D6 | E4 B2 | A4 G2 | F2 E2 D2 | E6',
    chords: 'Em | Em | D | Em | Em | Em | A | Em | Em | Em | G | G | D | D | Em | D . G | D | Em',
    solo: 'D',
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
    passes: 2,
    octave: -1,
    original: true,
    melody:
      'c2 B c- c2 G2 | B2 A B- B2 D2 | c2 B c- c2 e2 | d c A2 c4 | c2 B c- c2 G2 | B2 A B- B2 G A | c2 d c- c2 B A | A4 G4 | ' +
      'e2 e2 e d c2 | d2 d2 d c B2 | c2 c2 c B A2 | A G A c- c4 | e2 e2 e d c2 | d2 d2 d e f2 | e2 d2 c2 A2 | B2 d2 c4',
    chords: 'C | G | Am | F | C | G | Am | F G | C | G | Am | F | C | G | Am F | G C',
  },
  {
    // hip-hop: a piano riff over boom-bap, a hook an octave up
    id: 'late-bus',
    name: 'Late Bus',
    by: 'Original',
    bpm: 88,
    key: 'Am',
    style: 'hiphop',
    passes: 2,
    original: true,
    melody:
      'e2 c2 A c B A | z2 c2 A2 G2 | e2 c2 G c B G | z2 B2 d2 B2 | e2 c2 A c B A | z2 c2 A2 c2 | d2 f2 e d c A | B4 ^G4 | ' +
      'a2 a2 g e- e2 | f2 f2 e c- c2 | e2 e2 d c- c2 | d2 B2 G2 B2 | a2 a2 g e- e2 | f2 e2 c2 A2 | d2 c2 B2 ^G2 | A8',
    chords: 'Am | F | C | G | Am | F | Dm | E | Am | F | C | G | Am | F | Dm E | Am',
  },
  {
    // reggaeton: a sung line over the dembow, a chorus that falls into place
    id: 'mango-season',
    name: 'Mango Season',
    by: 'Original',
    bpm: 94,
    key: 'G',
    style: 'reggaeton',
    passes: 2,
    original: true,
    melody:
      'B2 B2 B A G2 | E2 G2 A4 | B2 B2 B A G2 | A2 G2 F4 | B2 B2 B A G2 | E2 G2 A2 c2 | B2 A2 G2 E2 | D4 z4 | ' +
      'e2 d B- B2 G2 | e2 d B- B4 | d2 B G- G2 E2 | D2 E2 F2 A2 | e2 d B- B2 G2 | e2 d B- B2 A2 | G2 A2 B2 A2 | G8',
    chords: 'Em | C | G | D | Em | C | G | D | Em | C | G | D | Em | C | G D | G',
  },
  {
    // funk in E Dorian: a riff that bounces off its low E, then a line that lifts
    id: 'cold-brew',
    name: 'Cold Brew',
    by: 'Original',
    bpm: 100,
    key: 'D',
    style: 'funk',
    passes: 2,
    octave: -1,
    original: true,
    solo: 'A',
    melody:
      'E E G E A G E D | E4 z D E G | E E G E A G E D | E4 z G A B | d2 B d- d B A G | A2 F E- E4 | d2 B d- d B A G | A2 B2 c4 | ' +
      'E E G E A G E D | E4 z D E G | E E G E A G E D | E4 z G A B | e2 d B- B2 A G | A2 B A- A2 F2 | G2 F2 E2 D2 | E8',
    chords: 'Em | A | Em | A | Em | A | Em | A | Em | A | Em | A | Em | A | Em D | Em',
  },
  {
    // a dance-floor hook: bright, then a chorus that rings out on the top note
    id: 'kite-hill',
    name: 'Kite Hill',
    by: 'Original',
    bpm: 124,
    key: 'F',
    style: 'dance',
    passes: 2,
    original: true,
    melody:
      'c2 A2 c2 d2 | c2 A2 G4 | A2 F2 A2 B2 | A2 G2 F4 | c2 A2 c2 f2 | e2 d2 c4 | d2 c2 A2 F2 | G4 z4 | ' +
      'f2 f2 e c- c2 | e2 e2 d c- c2 | d2 d2 c A- A2 | B2 A2 G4 | f2 f2 e c- c2 | e2 e2 d c- c2 | d2 c2 B2 G2 | F8',
    chords: 'F | C | Dm | Bb | F | C | Dm | Bb C | F | C | Dm | Bb | F | C | Bb C | F',
  },
  {
    // reggae: a one-drop, a melody that takes its time
    id: 'low-tide',
    name: 'Low Tide',
    by: 'Original',
    bpm: 84,
    key: 'D',
    style: 'reggae',
    passes: 2,
    original: true,
    melody:
      'F2 A2 A2 B A | G2 B2 A4 | E2 A2 A2 B A | F4 z4 | d2 c B- B2 F2 | G2 B2 A4 | E2 F2 G2 E2 | D4 z4 | ' +
      'd2 d2 c B- B2 | B2 B2 A G- G2 | A2 A2 B c- c2 | d4 F4 | d2 d2 c B- B2 | B2 B2 A G- G2 | A2 G2 F2 E2 | D8',
    chords: 'D | G | A | D | Bm | G | A | D | D | G | A | D | Bm | G | A | D',
  },
];
