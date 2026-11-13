/**
 * The songs, in the order they are met. All original, composed for the synth kit (no licences).
 * Each introduces one thing (PLAN §3.5). Unlocks between songs are in src/play/progression.ts.
 */
import { bed, grid, repeat, type Note, type Song } from './chart.js';

const KS = { kick: 'x...x...', snare: '..x...x.' }; // boom · tak · boom · tak
const KHSH = { kick: 'x.......', hat: '..x...x.', snare: '....x...' }; // boom · tss · tak · tss

function cat(...parts: Note[][]): Note[] {
  return parts.flat().sort((a, b) => a.beat - b.beat || a.lane.localeCompare(b.lane));
}

export const PORCH_STEP: Song = {
  id: 'porch-step',
  name: 'Porch Step',
  mood: 'slow and sunny',
  bpm: 80,
  bars: 16,
  beatsPerBar: 4,
  lanes: ['kick', 'snare', 'hat'],
  copy: grid(KS),
  notes: cat(
    repeat(KS, 0, 4),
    repeat(KHSH, 4, 4),
    repeat(KS, 8, 3),
    grid({ kick: 'x...x.x.', snare: '..x...x.' }, 11),
    repeat(KHSH, 12, 3),
    grid({ kick: 'x.......', snare: '....x.xX' }, 15),
  ),
  bed: bed({ roots: [60, 57, 53, 55], minor: [1], bass: 'x...5...', chord: '..x...x.', shaker: false, melody: ['4...7...', '3...0...', '5...4...', '2...7...'] }, 16),
  icon: 'porch',
};

export const KITCHEN_CLOCK: Song = {
  id: 'kitchen-clock',
  name: 'Kitchen Clock',
  mood: 'tick tock tom',
  bpm: 92,
  bars: 18,
  beatsPerBar: 4,
  lanes: ['kick', 'snare', 'hat', 'tom'],
  copy: grid({ kick: 'x.......', snare: '..x.....', tom: '....x.x.' }),
  notes: cat(
    repeat(KS, 0, 3),
    grid({ kick: 'x.......', tom: '..x.x.x.' }, 3),
    repeat({ ...KS, hat: '.x.x.x.x' }, 4, 3),
    grid({ kick: 'x.......', tom: '..x.x.xx' }, 7),
    repeat(KS, 8, 3),
    grid({ kick: 'x.......', tom: '..x.x.x.' }, 11),
    repeat({ ...KS, hat: '.x.x.x.x' }, 12, 3),
    grid({ kick: 'x.......', tom: '..x.xxxx' }, 15),
    grid({ kick: 'x...x...|X.......', snare: '..x...x.|........' }, 16),
  ),
  bed: bed({ roots: [62, 62, 67, 69], bass: 'x.x.5.x.', chord: '.x.x.x.x', shaker: true }, 18),
  icon: 'clock',
};

/** Call and answer: the bandmate plays two bars, you answer them in the next two (notes made live). */
export const CALL_AND_ANSWER: Song = {
  id: 'call-and-answer',
  name: 'Call & Answer',
  mood: 'it listens back',
  bpm: 96,
  bars: 21,
  beatsPerBar: 4,
  lanes: ['kick', 'snare', 'hat', 'tom', 'gong'],
  copy: grid(KS),
  calls: [0, 4, 8, 12, 16],
  // the answers are written live from the bandmate's calls (src/bandmate/bandmate.ts); the last bar is yours
  notes: grid({ gong: 'X.......' }, 20),
  bed: bed({ roots: [57, 53, 60, 55], minor: [0], bass: 'x..x5...', chord: 'hold', shaker: true }, 21),
  icon: 'birds',
};

export const TWO_HANDS: Song = {
  id: 'two-hands',
  name: 'Two Hands',
  mood: 'left, right, together',
  bpm: 104,
  bars: 17,
  beatsPerBar: 4,
  lanes: ['kick', 'snare', 'hat'],
  copy: grid({ hat: 'x.x.x.x.', kick: 'x...x...', snare: '..x...x.' }),
  notes: cat(
    repeat({ hat: 'x.x.x.x.', ...KS }, 0, 8),
    repeat({ hat: 'xxxxxxxx', ...KS }, 8, 7),
    grid({ hat: 'xxxx....', kick: 'x...x...', snare: '..x.....' }, 15),
    grid({ hat: 'X.......', kick: 'X.......', snare: 'X.......' }, 16),
  ),
  bed: bed({ roots: [64, 60, 67, 62], minor: [0], bass: 'x.x.x.x.', chord: '..x...x.', shaker: false }, 17),
  icon: 'hands',
};

export const BIG_ROOM: Song = {
  id: 'big-room',
  name: 'Big Room',
  mood: 'slow and huge',
  bpm: 76,
  bars: 17,
  beatsPerBar: 4,
  lanes: ['kick', 'snare', 'tom', 'gong'],
  copy: grid({ gong: 'X.......', kick: '....x...', snare: '......x.' }),
  notes: cat(
    ...[0, 4, 8, 12].map((b) =>
      cat(
        grid({ gong: 'X.......', kick: '....x...', snare: '......x.' }, b),
        repeat(KS, b + 1, 2),
        grid({ tom: b === 12 ? 'x.x.xxxx' : 'x.x.x.x.' }, b + 3),
      ),
    ),
    grid({ gong: 'X.......' }, 16),
  ),
  bed: bed({ roots: [55, 52, 48, 50], minor: [1], bass: 'x.......', chord: 'hold', shaker: false, melody: ['7.......', '.....3..', '4.......', '2...0...'] }, 17),
  icon: 'gong',
};

export const NIGHT_BUS: Song = {
  id: 'night-bus',
  name: 'Night Bus',
  mood: 'late night offbeats',
  bpm: 110,
  bars: 21,
  beatsPerBar: 4,
  lanes: ['kick', 'snare', 'hat', 'tom'],
  copy: grid({ kick: 'x..x....', snare: '..x...x.' }),
  notes: cat(
    repeat({ kick: 'x..x....', snare: '..x...x.' }, 0, 4),
    repeat({ kick: 'x..x....', snare: '..x...x.', hat: '.x...x.x' }, 4, 3),
    grid({ kick: 'x.......', tom: '..x.x.xx' }, 7),
    repeat({ kick: 'x..x.x..', snare: '..x...x.' }, 8, 4),
    repeat({ kick: 'x..x.x..', snare: '..x...x.', hat: '.x...x.x' }, 12, 3),
    grid({ kick: 'x.......', tom: '..xxx.x.' }, 15),
    repeat({ kick: 'x..x.x..', snare: '..x...x.', hat: '.x...x.x' }, 16, 3),
    grid({ kick: 'x.......', tom: 'x.x.xxxx' }, 19),
    grid({ kick: 'X.......', snare: 'X.......' }, 20),
  ),
  bed: bed({ roots: [57, 60, 62, 55], minor: [0, 2], bass: 'x..x..5.', chord: '.x...x..', shaker: true }, 21),
  icon: 'bus',
};

/** In order of play. */
export const SONGS: readonly Song[] = [PORCH_STEP, KITCHEN_CLOCK, CALL_AND_ANSWER, TWO_HANDS, BIG_ROOM, NIGHT_BUS];

export function songById(id: string): Song | undefined {
  return SONGS.find((s) => s.id === id);
}
