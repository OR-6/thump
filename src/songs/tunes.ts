/**
 * The songs: eight familiar tunes whose music is public domain everywhere (traditional, or by a composer who died
 * more than seventy years ago), each in its own arrangement here and without words. Easiest first.
 *
 * Each melody is written on the white keys with the tonic on C (a major song) or A (a minor one), so its notes are
 * scale degrees whatever key it is played in; `key` moves it to its real key. The notation is a small piece of ABC:
 * a bar per `|`, notes C D E F G A B from middle C, c d e… an octave up, `,` an octave down and `'` up; a number
 * after a note is its length in eighths (none: one eighth; `3/2` a dotted eighth, `/2` a sixteenth); `z` a rest.
 * Every bar holds four beats. A tune with a pickup starts on a bar of rests that ends with it.
 *
 * Chords are a bar per `|`, one, two (a half bar each) or four (a beat each, `.` keeps the last) per bar.
 *
 * Sources, checked against published lead sheets and folk-tune collections:
 * - Mary Had a Little Lamb: American nursery song (words 1830, the tune from the same years).
 * - Twinkle Twinkle Little Star: the French tune "Ah! vous dirai-je, maman" (1761).
 * - Ode to Joy: Beethoven, Symphony No. 9 (1824), the theme as it is usually sung.
 * - When the Saints Go Marching In: traditional spiritual.
 * - Jingle Bells: James Lord Pierpont (1857), the chorus.
 * - Oh! Susanna: Stephen Foster (1848), a verse and the chorus.
 * - Drunken Sailor: traditional sea shanty, Dorian on D (the white keys from D), a verse and the chorus.
 * - Can-can: Offenbach, the Galop infernal from Orpheus in the Underworld (1858), its famous theme.
 */
export type Style = 'lullaby' | 'anthem' | 'march' | 'sleigh' | 'polka' | 'shanty' | 'galop';

export interface Tune {
  id: string;
  name: string;
  /** Its name in "After …" on a locked tile (a few words). */
  short: string;
  /** The line on its tile: who wrote it and when, or where it's from. */
  by: string;
  bpm: number;
  /** The real key: the tonic's pitch class (0 = C). */
  key: number;
  scale: 'major' | 'minor';
  style: Style;
  melody: string;
  chords: string;
  /** Times through the tune (a one-bar solo between each). */
  passes: number;
  /** The chord the band holds in a solo, when it isn't the home chord's five. */
  solo?: string;
}

export const TUNES: readonly Tune[] = [
  {
    id: 'mary',
    name: "Mary's Lamb",
    short: "Mary's Lamb",
    by: 'Traditional',
    bpm: 100,
    key: 0,
    scale: 'major',
    style: 'lullaby',
    passes: 3,
    melody: 'E2 D2 C2 D2 | E2 E2 E4 | D2 D2 D4 | E2 G2 G4 | E2 D2 C2 D2 | E2 E2 E2 E2 | D2 D2 E2 D2 | C8',
    chords: 'C | C | G | C | C | C | G | C',
  },
  {
    id: 'twinkle',
    name: 'Twinkle Twinkle',
    short: 'Twinkle',
    by: 'French tune, 1761',
    bpm: 100,
    key: 0,
    scale: 'major',
    style: 'lullaby',
    passes: 2,
    melody:
      'C2 C2 G2 G2 | A2 A2 G4 | F2 F2 E2 E2 | D2 D2 C4 | G2 G2 F2 F2 | E2 E2 D4 | G2 G2 F2 F2 | E2 E2 D4 | ' +
      'C2 C2 G2 G2 | A2 A2 G4 | F2 F2 E2 E2 | D2 D2 C4',
    chords: 'C | F C | F C | G C | C G | C G | C G | C G | C | F C | F C | G C',
  },
  {
    id: 'ode-to-joy',
    name: 'Ode to Joy',
    short: 'Ode to Joy',
    by: 'Beethoven, 1824',
    bpm: 108,
    key: 2,
    scale: 'major',
    style: 'anthem',
    passes: 2,
    melody:
      'E2 E2 F2 G2 | G2 F2 E2 D2 | C2 C2 D2 E2 | E3 D D4 | E2 E2 F2 G2 | G2 F2 E2 D2 | C2 C2 D2 E2 | D3 C C4 | ' +
      'D2 D2 E2 C2 | D2 E F E2 C2 | D2 E F E2 D2 | C2 D2 G,4 | E2 E2 F2 G2 | G2 F2 E2 D2 | C2 C2 D2 E2 | D3 C C4',
    chords: 'C | G | C | G | C | G | C | G C | G | G C | G | C G | C | G | C | G C',
  },
  {
    id: 'saints',
    name: 'When the Saints',
    short: 'the Saints',
    by: 'Traditional march',
    bpm: 112,
    key: 10,
    scale: 'major',
    style: 'march',
    passes: 2,
    melody:
      'z2 C2 E2 F2 | G8 | z2 C2 E2 F2 | G8 | z2 C2 E2 F2 | G4 E4 | C4 E4 | D8 | ' +
      'z2 E2 E2 D2 | C8 | E4 G4 | G2 F6 | z4 E2 F2 | G4 E4 | C4 D4 | C8',
    chords: 'C | C | C | C | C | C | C | G | G | C | C | F | F | C | F G | C',
  },
  {
    id: 'jingle-bells',
    name: 'Jingle Bells',
    short: 'Jingle Bells',
    by: 'Pierpont, 1857',
    bpm: 120,
    key: 7,
    scale: 'major',
    style: 'sleigh',
    passes: 2,
    melody:
      'E2 E2 E4 | E2 E2 E4 | E2 G2 C3 D | E8 | F2 F2 F3 F | F2 E2 E2 E E | E2 D2 D2 E2 | D4 G4 | ' +
      'E2 E2 E4 | E2 E2 E4 | E2 G2 C3 D | E8 | F2 F2 F3 F | F2 E2 E2 E E | G2 G2 F2 D2 | C4 z4',
    chords: 'C | C | C | C | F | C | D7 | G7 | C | C | C | C | F | C | G7 | C',
  },
  {
    id: 'oh-susanna',
    name: 'Oh! Susanna',
    short: 'Oh! Susanna',
    by: 'Foster, 1848',
    bpm: 112,
    key: 5,
    scale: 'major',
    style: 'polka',
    passes: 2,
    melody:
      'z6 C D | E2 G2 G3 A | G2 E2 C3 D | E2 E2 D2 C2 | D6 C D | E2 G2 G3 A | G2 E2 C3 D | E2 E2 D2 D2 | C6 C2 | ' +
      'F4 F4 | A2 A4 A2 | G2 G2 E2 C2 | D6 C D | E2 G2 G3 A | G2 E2 C3 D | E2 E2 D2 D2 | C6 z2',
    chords: 'C | C | C | C | G7 | C | C | C G7 | C | F | F | C | G7 | C | C | C G7 | C',
  },
  {
    id: 'drunken-sailor',
    name: 'Drunken Sailor',
    short: 'the Sailor',
    by: 'Sea shanty',
    bpm: 132,
    key: 0,
    scale: 'major',
    style: 'shanty',
    passes: 2,
    solo: 'C',
    melody:
      'A2 A A A2 A A | A2 D2 F2 A2 | G2 G G G2 G G | G2 C2 E2 G2 | A2 A A A2 A A | A2 B2 c2 d2 | c2 A2 G2 E2 | D4 D2 z2 | ' +
      'A4 A3 A | A2 D2 F2 A2 | G4 G3 G | G2 C2 E2 G2 | A4 A3 A | A2 B2 c2 d2 | c2 A2 G2 E2 | D4 D2 z2',
    chords: 'Dm | Dm | C | C | Dm | Dm | C | Dm | Dm | Dm | C | C | Dm | Dm | C | Dm',
  },
  {
    id: 'can-can',
    name: 'Can-can',
    short: 'the Can-can',
    by: 'Offenbach, 1858',
    bpm: 150,
    key: 0,
    scale: 'major',
    style: 'galop',
    passes: 2,
    melody:
      'C4 D F E D | G2 G2 G A E F | D2 D2 D F E D | C c B A G F E D | C4 D F E D | G2 G2 G A E F | D2 D2 D F E D | C G D E C2 z2 | ' +
      'C4 D F E D | G2 G2 G A E F | D2 D2 D F E D | C c B A G F E D | C4 D F E D | G2 G2 G A E F | D2 D2 D F E D | C G D E C2 z2',
    chords: 'C G | C | G | C G | C G | C | G | C G C . | C G | C | G | C G | C G | C | G | C G C .',
  },
];
