/**
 * The instrument shelf: what you can put on the desk and play with your hands. Drums, a piano, a guitar (pick a
 * chord with one hand, strum with the other), a handpan. Every one is locked to a scale or to chords that fit, so
 * there are no wrong notes. Each has a few sounds, and the pitched ones a choice of scale with plain names.
 * Pure: layouts in kit-local zone coordinates (x right, z away from you, metres), sized for an airplane tray.
 */
import type { Family } from '../room/classify.js';
import type { Zone } from '../room/zones.js';

export type InstId = 'drums' | 'piano' | 'marimba' | 'guitar' | 'handpan' | 'congas';

export interface InstSound {
  id: string;
  name: string;
  /** A sampled family (piano, handpan), or a plucked string kind (guitar). */
  family?: Family;
  string?: 'nylon' | 'steel';
  /** Octaves up from the instrument's own register (a glock sits high). */
  oct?: number;
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
  { id: 'drums', name: 'Drums', how: 'Slap the drum tops, or make fists for sticks', sounds: [{ id: 'acoustic', name: 'Acoustic' }, { id: 'jazz', name: 'Jazz' }, { id: 'electronic', name: 'Electronic' }], scales: false, color: 0xff5a3c },
  {
    id: 'piano',
    name: 'Piano',
    how: 'Press keys with your fingertips. The square on the left plays three at once',
    sounds: [
      { id: 'piano', name: 'Grand', family: 'keys' },
      { id: 'bowl', name: 'Bowl', family: 'bowl' },
      { id: 'marimba', name: 'Marimba', family: 'marimba' },
      { id: 'glock', name: 'Glock', family: 'glock', oct: 1 },
    ],
    scales: true,
    color: 0xffa630,
  },
  {
    id: 'marimba',
    name: 'Marimba',
    how: 'Make fists for mallets, then hit the bars',
    sounds: [
      { id: 'marimba', name: 'Marimba', family: 'marimba' },
      { id: 'xylo', name: 'Xylo', family: 'xylophone', oct: 1 },
      { id: 'glock', name: 'Glock', family: 'glock', oct: 1 },
    ],
    scales: true,
    color: 0xffc14d,
  },
  {
    id: 'guitar',
    name: 'Guitar',
    how: 'Pinch the neck with one hand, sweep the strings with the other',
    sounds: [
      { id: 'nylon', name: 'Nylon', string: 'nylon' },
      { id: 'steel', name: 'Steel', string: 'steel' },
      { id: 'harp', name: 'Harp', family: 'harp' },
    ],
    scales: true,
    color: 0x6fa8ff,
  },
  {
    id: 'congas',
    name: 'Congas',
    how: 'The middle booms, the edge cracks',
    sounds: [
      { id: 'congas', name: 'Congas', family: 'congas' },
      { id: 'cajon', name: 'Cajon', family: 'cajon' },
      { id: 'frame', name: 'Frame drum', family: 'frame' },
    ],
    scales: false,
    color: 0xff7aa2,
  },
  {
    id: 'handpan',
    name: 'Handpan',
    how: 'Tap the round notes. The middle one is low',
    sounds: [
      { id: 'steel', name: 'Steel', family: 'tongue' },
      { id: 'glass', name: 'Glass', family: 'bowl' },
      { id: 'bells', name: 'Bells', family: 'bell', oct: 1 },
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
  // the major blues (its minor third the blue note; no flat fifth: that clashes on a full-size key), over I7 IV7 V7
  { id: 'bluesy', name: 'Bluesy', steps: [0, 2, 3, 4, 7, 9], chords: [[0, 4, 7, 10], [5, 9, 12, 15], [7, 11, 14, 17]] },
  // lydian; Imaj7 II vi
  { id: 'dreamy', name: 'Dreamy', steps: [0, 2, 4, 6, 7, 9, 11], chords: [[0, 4, 7, 11], [2, 6, 9, 12], [9, 12, 16, 19]] },
  // the full major scale (on the piano in C: the white keys); I IV V. Every familiar tune in a major key fits it
  { id: 'major', name: 'Major', steps: [0, 2, 4, 5, 7, 9, 11], chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14]] },
  // the natural minor (in A: the white keys again); i iv v... with the V major, as songs in minor have it
  { id: 'minor', name: 'Minor', steps: [0, 2, 3, 5, 7, 8, 10], chords: [[0, 3, 7], [5, 8, 12], [7, 11, 14]] },
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

/**
 * The keyboard at real key size (src/scene-assets/lib/piano.ts): two octaves and a top C, fifteen white keys 23.5 mm
 * apart and 150 mm long, black keys 11 by 95 mm, the key tops 6 cm up in a deep case.
 */
export const KEYBOARD = { whites: 15, pitch: 0.0235, gap: 0.001, len: 0.15, blackW: 0.011, blackLen: 0.095, front: -0.03, top: 0.042, blackTop: 0.0525, shift: 0.025 } as const;
/** Index of the piano's chord button (after its fifteen keys). */
export const PIANO_CHORD = 15;
/** A piano note's zone plus this is the same key two octaves down (the bass line). */
export const PIANO_LOW = 20;
/** Where the song's tune starts on the keyboard (its first scale note is the sixth white key). */
const TUNE_AT = 5;
/** The keyboard's left edge (kit-local x): centred, a little right to leave room for the chord button. */
const KEYS_X0 = -(KEYBOARD.whites * KEYBOARD.pitch) / 2 + KEYBOARD.shift;

/**
 * The piano: real keys (every white key a note of the scale, low to high; the tune sits in the middle, on the sixth
 * key and up) and a red chord button to their left for the other hand.
 */
export function pianoZones(root: number, scale: Scale): Zone[] {
  const out: Zone[] = [];
  const K = KEYBOARD;
  for (let i = 0; i < K.whites; i++) {
    const d = i - TUNE_AT;
    out.push({ i, shape: 'rect', x: KEYS_X0 + (i + 0.5) * K.pitch, z: K.front + K.len / 2, w: K.pitch - K.gap, h: K.len, degree: d, midi: scaleMidi(root, scale, d) });
  }
  out.push({ i: PIANO_CHORD, shape: 'disc', x: KEYS_X0 - 0.066, z: 0.03, w: 0.022, h: 0, degree: -1, midi: root - 12 });
  return out;
}

/** Each black key's centre from its octave's first white key's left edge, in white-key pitches (as piano.ts). */
const BLACK_AT: readonly [number, number][] = [
  [0, 0.93],
  [1, 2.07],
  [3, 3.9],
  [4, 5.0],
  [5, 6.1],
];

/**
 * The piano's black keys, where a keyboard has them (two over C D E, three over F G A B), at the back between the
 * white keys: each plays the white keys either side of it together (both in the scale, so never a wrong note).
 * Zone coordinates; `a`, `b` the two white keys.
 */
export function pianoBlacks(zones: readonly Zone[]): { a: number; b: number; x: number; z: number; w: number; h: number }[] {
  const K = KEYBOARD;
  const white = zones.filter((q) => q.i < PIANO_CHORD);
  const out: { a: number; b: number; x: number; z: number; w: number; h: number }[] = [];
  for (let o = 0; o * 7 + 7 < white.length; o++)
    for (const [after, at] of BLACK_AT) {
      const a = o * 7 + after;
      if (a + 1 >= white.length) continue;
      const x = white[o * 7].x - K.pitch / 2 + at * K.pitch;
      out.push({ a: white[a].i, b: white[a + 1].i, x, z: K.front + K.len - K.blackLen / 2, w: K.blackW, h: K.blackLen });
    }
  return out;
}

/** The marimba: eight wooden bars across the tray, low and long on the left, 4.8 cm wide, every one in the scale. */
export function marimbaZones(root: number, scale: Scale): Zone[] {
  const out: Zone[] = [];
  for (let i = 0; i < 8; i++) out.push({ i, shape: 'rect', x: (i - 3.5) * 0.054, z: 0.03, w: 0.048, h: 0.14 - i * 0.008, degree: i, midi: scaleMidi(root, scale, i) });
  return out;
}

/** The congas: two drums side by side (the low one left, 15 cm and 13 cm across). Zones 0/1 the low drum's middle and
 * edge, 2/3 the high drum's (a hit lands on whichever its distance from the centre says). */
export const CONGA = { x: [-0.11, 0.105], z: 0.02, r: [0.085, 0.075], open: 0.6, top: 0.26 } as const;
export function congaZones(): Zone[] {
  const out: Zone[] = [];
  for (let d = 0; d < 2; d++) {
    out.push({ i: d * 2, shape: 'disc', x: CONGA.x[d], z: CONGA.z, w: CONGA.r[d] * CONGA.open, h: 0, degree: -1, midi: 0 });
    out.push({ i: d * 2 + 1, shape: 'disc', x: CONGA.x[d], z: CONGA.z, w: CONGA.r[d], h: 0, degree: -1, midi: 0 });
  }
  return out;
}

/** The handpan's lens: its rim this high off the desk, its top shell rising this much more to the ding. */
export const HANDPAN = { rim: 0.026, dome: 0.05 } as const;
/** The handpan's centre and outer radius (from its zones: the ding first, the fields round it). */
export function handpanShape(zones: readonly Zone[]): { x: number; z: number; R: number } {
  const ding = zones[0];
  if (!ding) return { x: 0, z: 0, R: 0.15 };
  let R = 0;
  for (const q of zones) R = Math.max(R, Math.hypot(q.x - ding.x, q.z - ding.z) + q.w);
  return { x: ding.x, z: ding.z, R: R + 0.012 };
}
/** The top shell's height above the desk at distance `d` from the centre. */
export function handpanY(d: number, R: number): number {
  const k = Math.min(1, d / R);
  return HANDPAN.rim + HANDPAN.dome * Math.sqrt(Math.max(0, 1 - k * k));
}

/** The handpan: a low ding in the middle (9 cm), eight notes round it (6 cm), climbing in a zig-zag left and right. */
export function handpanZones(root: number, scale: Scale): Zone[] {
  const out: Zone[] = [{ i: 0, shape: 'disc', x: 0, z: 0.02, w: 0.045, h: 0, degree: 0, midi: scaleMidi(root, scale, 0) }];
  // around the rim, alternating sides as the notes climb (alternate hands and you walk up the scale)
  const order = [0, 7, 1, 6, 2, 5, 3, 4];
  const fifth = Math.max(0, scale.steps.indexOf(7));
  for (let k = 0; k < 8; k++) {
    const a = -Math.PI / 2 + ((order[k] + 0.5) / 8) * Math.PI * 2;
    out.push({ i: k + 1, shape: 'disc', x: Math.cos(a) * 0.11, z: 0.02 - Math.sin(a) * 0.09, w: 0.03, h: 0, degree: k + fifth, midi: scaleMidi(root, scale, k + fifth) });
  }
  return out;
}

/** Where the guitar's strum band is (x from, x to, z from, z to): over the soundhole, hit or brush down to strum. */
export const STRUM = { x0: -0.03, x1: 0.2, z0: -0.04, z1: 0.11 } as const;
/** The marimba's bars stand on their frame, their tops this high off the desk. */
export const MARIMBA = { top: 0.07 } as const;
/** The guitar lying on its back: its top this high off the desk, the strings and the fretboard a little above it. */
export const GUITAR = { top: 0.045, strings: 0.055, board: 0.053 } as const;
/** The neck's line (kit-local zone z) and the three chord positions along it (x), like frets. */
export const NECK = { z: 0.035, x: [-0.205, -0.143, -0.081], w: 0.056, h: 0.07 } as const;

/** The guitar: three chord positions along the neck for the left hand (0–2), then the six strings over the body (3–8). */
export function guitarZones(root: number, scale: Scale): Zone[] {
  const out: Zone[] = [];
  for (let c = 0; c < 3; c++) out.push({ i: c, shape: 'rect', x: NECK.x[c], z: NECK.z, w: NECK.w, h: NECK.h, degree: c, midi: root + scale.chords[c][0] });
  for (let s = 0; s < 6; s++) out.push({ i: 3 + s, shape: 'rect', x: (STRUM.x0 + STRUM.x1) / 2, z: NECK.z + (s - 2.5) * 0.011, w: STRUM.x1 - STRUM.x0, h: 0.003, degree: -1, midi: 0 });
  return out;
}

/**
 * A chord as a guitar plays it: the root on the lowest string that has it (E2 up to D#3), then the shapes a guitarist
 * uses: root, fifth, octave (or the seventh), the third an octave up, the fifth above; a sixth string when the bass is
 * low enough. `root` is the key's root (any octave); `chord` semitones above it.
 */
export function strumNotes(root: number, chord: readonly number[]): number[] {
  const pc = (((root + chord[0]) % 12) + 12) % 12;
  const bass = 40 + ((pc - 4 + 12) % 12);
  const third = chord[1] - chord[0];
  const seventh = chord.length > 3 ? chord[3] - chord[0] : undefined;
  const shape = bass <= 45 ? [0, 7, seventh ?? 12, 12 + third, 19, 24] : [0, 7, seventh ?? 12, 12 + third, 19];
  return shape.map((o) => bass + o);
}

/** The zones of an instrument as it comes out (none for the drums: they are the pads). */
export function instZones(id: InstId, root: number, scale: Scale): Zone[] {
  return id === 'piano' ? pianoZones(root, scale) : id === 'marimba' ? marimbaZones(root, scale) : id === 'guitar' ? guitarZones(root, scale) : id === 'handpan' ? handpanZones(root, scale) : id === 'congas' ? congaZones() : [];
}

/**
 * A hand drum's sound by where it was hit (zone 0/1 the low drum's middle and edge, 2/3 the high one's): which
 * recorded drum, how big (smaller sounds higher), and whether the edge adds a slap's crack.
 */
export function percVoice(sound: string, zone: number): { tone: number; size: number; slap: boolean } {
  const high = zone >= 2;
  const edge = zone % 2 === 1;
  if (sound === 'cajon') return { tone: edge ? 1 : 0, size: high ? 0.3 : 0.6, slap: false };
  if (sound === 'frame') return { tone: high ? 1 : 0, size: edge ? 0.35 : 0.55, slap: edge };
  // congas: the low drum is the tumba, the high one the quinto; the edge is the conga between, with a crack
  return { tone: high ? 2 : edge ? 1 : 0, size: edge ? 0.4 : 0.5, slap: edge };
}

/** The keys you can put an instrument in (its lowest note), by name. */
export const KEYS: readonly { pc: number; name: string }[] = [
  { pc: 0, name: 'C' },
  { pc: 2, name: 'D' },
  { pc: 4, name: 'E' },
  { pc: 5, name: 'F' },
  { pc: 7, name: 'G' },
  { pc: 9, name: 'A' },
  { pc: 10, name: 'B♭' },
];
