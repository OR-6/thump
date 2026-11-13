/**
 * The instrument shelf: what you can put on the desk and play with your hands. Drums, a piano, a guitar (pick a
 * chord with one hand, strum with the other), a handpan. Every one is locked to a scale or to chords that fit, so
 * there are no wrong notes. Each has a few sounds, and the pitched ones a choice of scale with plain names.
 * Pure: layouts in kit-local zone coordinates (x right, z away from you, metres), sized for an airplane tray.
 */
import type { Family } from '../room/classify.js';
import type { Zone } from '../room/zones.js';

export type InstId = 'drums' | 'piano' | 'guitar' | 'handpan';

export interface InstSound {
  id: string;
  name: string;
  /** A sampled family (piano, handpan), or a plucked string kind (guitar). */
  family?: Family;
  string?: 'nylon' | 'steel';
}

export interface InstDef {
  id: InstId;
  name: string;
  /** How to play it, on the module (≤ 5 words). */
  how: string;
  sounds: readonly InstSound[];
  /** Has a scale choice. */
  scales: boolean;
  /** The colour of its light on the desk. */
  color: number;
}

export const SHELF: readonly InstDef[] = [
  { id: 'drums', name: 'Drums', how: 'Hit the pads', sounds: [{ id: 'kit', name: 'Kit' }], scales: false, color: 0xff5a3c },
  {
    id: 'piano',
    name: 'Piano',
    how: 'Every key fits',
    sounds: [
      { id: 'piano', name: 'Grand', family: 'keys' },
      { id: 'vibes', name: 'Vibes', family: 'bowl' },
      { id: 'marimba', name: 'Marimba', family: 'marimba' },
      { id: 'glock', name: 'Glock', family: 'glock' },
    ],
    scales: true,
    color: 0xffa630,
  },
  {
    id: 'guitar',
    name: 'Guitar',
    how: 'Tap a square, then strings',
    sounds: [
      { id: 'nylon', name: 'Nylon', string: 'nylon' },
      { id: 'steel', name: 'Steel', string: 'steel' },
      { id: 'harp', name: 'Harp', family: 'harp' },
    ],
    scales: true,
    color: 0x6fa8ff,
  },
  {
    id: 'handpan',
    name: 'Handpan',
    how: 'Tap anywhere on it',
    sounds: [
      { id: 'steel', name: 'Steel', family: 'tongue' },
      { id: 'glass', name: 'Glass', family: 'bowl' },
      { id: 'bells', name: 'Bells', family: 'bell' },
    ],
    scales: true,
    color: 0x2ad1b5,
  },
];

export function instDef(id: InstId): InstDef {
  return SHELF.find((d) => d.id === id) ?? SHELF[0];
}

/** One step along the shelf (wrapping). */
export function stepShelf(id: InstId, dir: 1 | -1): InstId {
  const i = SHELF.findIndex((d) => d.id === id);
  const n = SHELF.length;
  return SHELF[(((i < 0 ? 0 : i) + dir) % n + n) % n].id;
}

export interface Scale {
  id: string;
  /** Plain words, not theory. */
  name: string;
  /** Semitones above the root, one octave. */
  steps: readonly number[];
  /** Three chords that fit (semitones above the root), for the guitar's pads and the piano's chord pad. */
  chords: readonly (readonly number[])[];
}

export const SCALES: readonly Scale[] = [
  // major pentatonic; I vi IV
  { id: 'happy', name: 'Happy', steps: [0, 2, 4, 7, 9], chords: [[0, 4, 7], [9, 12, 16], [5, 9, 12]] },
  // minor pentatonic; i VI VII
  { id: 'sad', name: 'Sad', steps: [0, 3, 5, 7, 10], chords: [[0, 3, 7], [8, 12, 15], [10, 14, 17]] },
  // the blues scale; I7 IV7 V7
  { id: 'bluesy', name: 'Bluesy', steps: [0, 3, 5, 6, 7, 10], chords: [[0, 4, 7, 10], [5, 9, 12, 15], [7, 11, 14, 17]] },
  // lydian; Imaj7 II vi
  { id: 'dreamy', name: 'Dreamy', steps: [0, 2, 4, 6, 7, 9, 11], chords: [[0, 4, 7, 11], [2, 6, 9, 12], [9, 12, 16, 19]] },
];

export function scaleById(id: string | undefined): Scale {
  return SCALES.find((s) => s.id === id) ?? SCALES[0];
}

/** The MIDI note of scale degree `d` (0 = root, may be negative or past an octave) above `root`. */
export function scaleMidi(root: number, scale: Scale, d: number): number {
  const n = scale.steps.length;
  const oct = Math.floor(d / n);
  return root + oct * 12 + scale.steps[((d % n) + n) % n];
}

/** Index of the piano's chord pad (after its six keys). */
export const PIANO_CHORD = 6;

/**
 * The piano: six big keys for the right hand (low to high, every one in the scale, the root first) and one wide pad
 * for the left that plays a whole chord. 44 cm across, keys 5 cm wide (fingertips land within ~1.5 cm).
 */
export function pianoZones(root: number, scale: Scale): Zone[] {
  const out: Zone[] = [];
  for (let i = 0; i < 6; i++) out.push({ i, shape: 'rect', x: -0.085 + i * 0.056, z: 0.03, w: 0.05, h: 0.12, degree: i, midi: scaleMidi(root, scale, i) });
  out.push({ i: PIANO_CHORD, shape: 'rect', x: -0.175, z: 0.03, w: 0.09, h: 0.12, degree: -1, midi: root - 12 });
  return out;
}

/** The handpan: a low ding in the middle (9 cm), eight notes round it (6 cm), climbing in a zig-zag left and right. */
export function handpanZones(root: number, scale: Scale): Zone[] {
  const out: Zone[] = [{ i: 0, shape: 'disc', x: 0, z: 0.02, w: 0.045, h: 0, degree: 0, midi: scaleMidi(root, scale, 0) }];
  // around the rim, alternating sides as the notes climb (alternate hands and you walk up the scale)
  const order = [0, 7, 1, 6, 2, 5, 3, 4];
  for (let k = 0; k < 8; k++) {
    const a = -Math.PI / 2 + ((order[k] + 0.5) / 8) * Math.PI * 2;
    out.push({ i: k + 1, shape: 'disc', x: Math.cos(a) * 0.11, z: 0.02 - Math.sin(a) * 0.09, w: 0.03, h: 0, degree: k + 1, midi: scaleMidi(root, scale, k + 1) });
  }
  return out;
}

/** Where the guitar's strum band is (x from, x to, z from, z to): hit or brush down anywhere here to strum. */
export const STRUM = { x0: 0.0, x1: 0.2, z0: -0.07, z1: 0.14 } as const;

/** The guitar: three chord pads for the left hand (0–2, unnamed, coloured), then six strings across the strum band (3–8). */
export function guitarZones(root: number, scale: Scale): Zone[] {
  const out: Zone[] = [];
  for (let c = 0; c < 3; c++) out.push({ i: c, shape: 'rect', x: -0.15, z: 0.105 - c * 0.07, w: 0.09, h: 0.06, degree: c, midi: root + scale.chords[c][0] });
  for (let s = 0; s < 6; s++) out.push({ i: 3 + s, shape: 'rect', x: (STRUM.x0 + STRUM.x1) / 2, z: STRUM.z1 - 0.02 - s * 0.034, w: STRUM.x1 - STRUM.x0, h: 0.006, degree: -1, midi: 0 });
  return out;
}

/**
 * A chord as a guitar plays it: six strings, the root low in the bass (E2–A2 range), then chord tones climbing
 * through the octave above, each at least two semitones from the last. `root` is the key's root (any octave).
 */
export function strumNotes(root: number, chord: readonly number[]): number[] {
  const pcs = chord.map((c) => (((root + c) % 12) + 12) % 12);
  let bass = 40 + ((pcs[0] - 40 % 12 + 12) % 12);
  if (bass > 46) bass -= 12;
  const out = [bass];
  let n = bass;
  for (let k = 1; out.length < 6 && k < 40; k++) {
    n++;
    if (pcs.includes(n % 12) && n - out[out.length - 1] >= 3) out.push(n);
  }
  return out;
}
