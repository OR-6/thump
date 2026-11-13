/**
 * The songs, in the order they unlock. All original, composed for these instruments (no licences).
 * Written in parts, cast onto your room when they start: early songs use two instruments, later ones
 * more (DESIGN.md §3.6).
 */
import { bed, grid, repeat, type Note, type Song } from './chart.js';

function cat(...parts: Note[][]): Note[] {
  return parts.flat().sort((a, b) => a.beat - b.beat || a.part.localeCompare(b.part));
}

/**
 * Two instruments: the kit and one melody. The hook first, on its own (E G, a push to A, back to G), then the
 * kit joins under it: A A′ B A over C, Em, F and a bittersweet F minor, home to C at the end.
 */
export const PORCH_STEP: Song = {
  id: 'porch-step',
  name: 'Porch Step',
  mood: 'slow and sunny',
  bpm: 80,
  bars: 16,
  beatsPerBar: 4,
  key: 0,
  parts: ['kick', 'snare', 'melody'],
  notes: cat(
    // A: the hook alone (on your room's most melodic instrument)
    grid({ melody: '2.3..4.3|2...3...|2.3..4.5|3.......' }, 0),
    // A′: the kit joins, boom on one, tak on three, a push on the and of four
    grid({ kick: 'x.....x.|x.......|x.....x.|x.......', snare: '....x...|....x...|....x...|....x...', melody: '2.3..4.3|3.2.1...|0..3..2.|0.......' }, 4),
    // B: the drums move, the tune climbs and comes back down
    grid({ kick: 'x...x...|x...x...|x...x...|x...x...', snare: '..x...x.|..x...x.|..x...x.|..x.....', melody: '5...4...|3...2.3.|4...3...|1.......' }, 8),
    // A: the hook again, home
    grid({ kick: 'x.....x.|x.......|x.....x.|X.......', snare: '....x...|....x...|....x...|........', melody: '2.3..4.3|3.2.1...|2.3..4.5|5.......' }, 12),
  ),
  bed: bed({ roots: [60, 64, 65, 65, 60, 64, 65, 65, 57, 64, 65, 67, 60, 64, 65, 60], minor: [1, 3, 5, 7, 8, 9, 13], bass: 'x...5...', chord: 'hold', shaker: false }, 16),
};

/** The kit with the hat, and a bass line (the lowest notes your room has). */
export const KITCHEN_CLOCK: Song = {
  id: 'kitchen-clock',
  name: 'Kitchen Clock',
  mood: 'tick tock bass',
  bpm: 92,
  bars: 16,
  beatsPerBar: 4,
  key: 2,
  parts: ['kick', 'snare', 'hat', 'bass'],
  notes: cat(
    repeat({ kick: 'x...x...', snare: '..x...x.' }, 0, 2),
    repeat({ kick: 'x...x...', snare: '..x...x.', hat: '.x...x..' }, 2, 2),
    grid({ bass: '0...0...|3...3...|0...0...|2...3...' }, 4),
    repeat({ hat: '.x.x.x.x' }, 4, 4),
    grid({ kick: 'x...x...|x...x...|x...x...|x...x...', snare: '..x...x.|..x...x.|..x...x.|..x...x.', bass: '0.......|3.......|0.......|2...3...' }, 8),
    grid({ kick: 'x...x...|x...x...|x...x...|X.......', snare: '..x...x.|..x...x.|..x...x.|........', hat: '.x...x..|.x...x..|........|........', bass: '0...0...|3...3...|2...2...|0.......' }, 12),
  ),
  bed: bed({ roots: [62, 62, 67, 69], bass: 'x.......', chord: '.x.x.x.x', shaker: true }, 16),
};

/** Three instruments: the kit, a melody and a chime high above it. */
export const NIGHT_BUS: Song = {
  id: 'night-bus',
  name: 'Night Bus',
  mood: 'late night offbeats',
  bpm: 104,
  bars: 18,
  beatsPerBar: 4,
  key: 5,
  parts: ['kick', 'snare', 'hat', 'melody', 'chime'],
  notes: cat(
    repeat({ kick: 'x..x....', snare: '..x...x.' }, 0, 4),
    grid({ melody: '2.4.....|5.4.2...|2.4.....|5.7.5...' }, 4),
    repeat({ kick: 'x..x....', snare: '..x...x.' }, 4, 4),
    grid({ chime: '.......5|....7...|.......5|....9...' }, 8),
    grid({ melody: '2.4.....|5.4.2...|4.2.....|0.......' }, 8),
    repeat({ kick: 'x..x....', snare: '..x...x.', hat: '.x...x.x' }, 8, 4),
    grid({ melody: '2.4.5.4.|2.......|2.4.5.7.|5.......', chime: '........|....7...|........|....9...' }, 12),
    repeat({ kick: 'x..x.x..', snare: '..x...x.' }, 12, 4),
    grid({ kick: 'x..x....|X.......', snare: '..x...x.|........', melody: '4...2...|0.......', chime: '........|....5...' }, 16),
  ),
  bed: bed({ roots: [53, 57, 50, 48], minor: [1, 2], bass: 'x..x..5.', chord: '.x...x..', shaker: true }, 18),
};

/** The big one: the gong (your wall), a melody, and the kit. */
export const BIG_ROOM: Song = {
  id: 'big-room',
  name: 'Big Room',
  mood: 'slow and huge',
  bpm: 76,
  bars: 16,
  beatsPerBar: 4,
  key: 7,
  parts: ['kick', 'snare', 'tom', 'gong', 'melody'],
  notes: cat(
    ...[0, 4, 8, 12].map((b) =>
      cat(
        grid({ gong: 'X.......', kick: '....x...', snare: '......x.' }, b),
        repeat({ kick: 'x...x...', snare: '..x...x.' }, b + 1, 2),
        grid({ tom: b === 12 ? 'x.x.x.x.' : 'x.x.x...' }, b + 3),
      ),
    ),
    grid({ melody: '0.......|2.......|4.......|2...0...' }, 4),
    grid({ melody: '5.......|4.......|2.......|0.......' }, 12),
  ),
  bed: bed({ roots: [55, 55, 48, 50], bass: 'x.......', chord: 'hold', shaker: false }, 16),
};

/** Today's song: the same for everyone on a day, different every day (a seeded arrangement). */
export function dailySong(day: string): Song {
  let seed = 7;
  for (const ch of day) seed = (seed * 31 + ch.charCodeAt(0)) % 2147483647;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
  const grooves = [
    { kick: 'x...x...', snare: '..x...x.' },
    { kick: 'x..x....', snare: '..x...x.' },
    { kick: 'x...x.x.', snare: '..x...x.' },
  ];
  const lines = ['0.2.4.2.', '4.2.0...', '0...4.5.', '2.4.5.4.', '5.4.2.0.', '0.2.0.4.', '4...2...'];
  const g = pick(grooves);
  const mel = Array.from({ length: 4 }, () => pick(lines)).join('|');
  const mel2 = Array.from({ length: 4 }, () => pick(lines)).join('|');
  const key = Math.floor(rnd() * 12);
  const bpm = 84 + Math.floor(rnd() * 5) * 4;
  // a progression (semitones from the key, and which chords are minor), and a name of its own
  const progs = [
    { r: [0, 5, 9, 7], m: [2] },
    { r: [0, 4, 5, 5], m: [1] },
    { r: [9, 5, 0, 7], m: [0] },
    { r: [0, 2, 5, 0], m: [1] },
  ];
  const prog = pick(progs);
  const first = ['Paper', 'Kettle', 'Tin', 'Window', 'Sunday', 'Hallway', 'Velvet', 'Lamp', 'Copper', 'Attic', 'Porch', 'Ferry'];
  const second = ['Lanterns', 'Rain', 'Steps', 'Radio', 'Garden', 'Tide', 'Bells', 'Hours', 'Weather', 'Parade', 'Letters', 'Lights'];
  const name = `${pick(first)} ${pick(second)}`;
  return {
    id: `day-${day}`,
    name,
    mood: 'new every day',
    bpm,
    bars: 16,
    beatsPerBar: 4,
    key,
    parts: ['kick', 'snare', 'hat', 'melody', 'chime'],
    notes: cat(
      repeat(g, 0, 4),
      grid({ melody: mel }, 4),
      repeat({ ...g, hat: '.x...x..' }, 8, 4),
      grid({ melody: mel2 }, 8),
      repeat(g, 12, 3),
      grid({ chime: '....5...|....7...|....5...' }, 12),
      grid({ kick: 'X.......', melody: '..0.....' }, 15),
    ),
    bed: bed({ roots: prog.r.map((r) => 60 + key + (r > 7 ? r - 12 : r)), minor: prog.m, bass: 'x...5...', chord: '..x...x.', shaker: true }, 16),
  };
}

/** In order of unlocking. */
export const SONGS: readonly Song[] = [PORCH_STEP, KITCHEN_CLOCK, NIGHT_BUS, BIG_ROOM];

export function songById(id: string): Song | undefined {
  return SONGS.find((s) => s.id === id);
}
