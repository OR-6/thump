/**
 * The songs, in the order they unlock. All original, composed for these instruments (no licences).
 * Written in parts, cast onto your room when they start: early songs use two instruments, later ones
 * more (PLAN §3.6).
 */
import { bed, grid, repeat, type Note, type Song } from './chart.js';

function cat(...parts: Note[][]): Note[] {
  return parts.flat().sort((a, b) => a.beat - b.beat || a.part.localeCompare(b.part));
}

/** Two instruments: the kit and one melody. */
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
    // the kit alone: boom on one, tak on three
    repeat({ kick: 'x.......', snare: '....x...' }, 0, 4),
    // the melody alone, walking up and back
    grid({ melody: '0.2.4.2.|3.2.1.0.|0.2.4.5.|4.2.0...' }, 4),
    // together: a drum and a note on the same beats, one hand each
    grid({ kick: 'x.......|x.......|x.......|x.......', snare: '....x...|....x...|....x...|....x...', melody: '0...4...|2...0...|0...4...|5...4...' }, 8),
    grid({ kick: 'x...x...|x...x...|x...x...|X.......', snare: '..x...x.|..x...x.|..x...x.|........', melody: '4...2...|0...2...|4...5...|0.......' }, 12),
  ),
  bed: bed({ roots: [60, 57, 53, 55], minor: [1], bass: 'x...5...', chord: 'hold', shaker: false }, 16),
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
  bed: bed({ roots: [55, 52, 48, 50], minor: [1], bass: 'x.......', chord: 'hold', shaker: false }, 16),
};

/** In order of unlocking. */
export const SONGS: readonly Song[] = [PORCH_STEP, KITCHEN_CLOCK, NIGHT_BUS, BIG_ROOM];

export function songById(id: string): Song | undefined {
  return SONGS.find((s) => s.id === id);
}
