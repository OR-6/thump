/**
 * Song charts (data only) and the little notations they are written in.
 *
 * Songs are written in **parts** (the kit's drums, and melody, bass, chime, shake and gong), not for a
 * particular room: when a song starts it is cast onto the instruments your room has (src/songs/cast.ts).
 * A chart's notes are what the player plays; its bed is what the synth band plays under them. Beats
 * are quarter notes from the first bar of play (bar 0); a song has one count-in bar before it.
 *
 * Drum grid: one string per part, bars separated by `|`, each bar split into as many equal steps as
 * it has characters. `x` a note, `X` an accent, `o` a soft note, `.` a rest.
 * Melodic line: the same, with digits for scale degrees (0 = the key's root in the instrument's
 * register, 1–4 up the major pentatonic, 5 = the octave…).
 */
export type DrumPart = 'kick' | 'snare' | 'hat' | 'tom' | 'rim';
export type TonalPart = 'melody' | 'bass' | 'chime' | 'shake' | 'gong';
export type Part = DrumPart | TonalPart;
export const DRUMS: readonly DrumPart[] = ['kick', 'snare', 'hat', 'tom', 'rim'];

export interface Note {
  beat: number;
  part: Part;
  /** Scale degree for a pitched part, −1 when unpitched. */
  degree: number;
  vel: number;
}

export type BedVoice = 'bass' | 'chord' | 'shaker' | 'pluck';

export interface BedEvent {
  beat: number;
  voice: BedVoice;
  /** MIDI note (bass, pluck) or the chord's root (chord). */
  midi: number;
  /** Length in beats. */
  len: number;
  vel: number;
  /** Chord quality (chord voice): 'maj' or 'min'. */
  minor?: boolean;
}

export interface Song {
  id: string;
  name: string;
  /** Three words for the felt card. */
  mood: string;
  bpm: number;
  bars: number;
  beatsPerBar: 4;
  /** The key's pitch class (0 = C). */
  key: number;
  /** The parts it uses (cast onto the room when it starts). */
  parts: Part[];
  notes: Note[];
  bed: BedEvent[];
}

const VEL: Record<string, number> = { x: 0.85, X: 1, o: 0.55 };

/** Notes from a grid of parts, starting at `bar` (see the notations above). Digits are scale degrees. */
export function grid(parts: Partial<Record<Part, string>>, bar = 0, beatsPerBar = 4): Note[] {
  const out: Note[] = [];
  for (const [part, text] of Object.entries(parts) as [Part, string][]) {
    const bars = text.split('|');
    bars.forEach((b, i) => {
      const steps = b.length;
      for (let k = 0; k < steps; k++) {
        const ch = b[k];
        const deg = ch >= '0' && ch <= '9' ? Number(ch) : -1;
        const v = deg >= 0 ? 0.85 : VEL[ch];
        if (v === undefined) continue;
        out.push({ beat: (bar + i) * beatsPerBar + (k * beatsPerBar) / steps, part, degree: deg, vel: v });
      }
    });
  }
  return out.sort((a, b) => a.beat - b.beat || a.part.localeCompare(b.part));
}

/** The same bar(s) of grid, `times` times over, from `bar`. */
export function repeat(lanes: Partial<Record<Part, string>>, bar: number, times: number): Note[] {
  const one = grid(lanes, 0);
  const span = Math.max(1, ...Object.values(lanes).map((t) => (t ?? '').split('|').length));
  const out: Note[] = [];
  for (let i = 0; i < times; i++) for (const n of one) out.push({ ...n, beat: n.beat + (bar + i * span) * 4 });
  return out;
}

export interface BedStyle {
  /** Chord roots, one per bar (MIDI), looped over the song. */
  roots: number[];
  /** Minor chords at these positions in `roots`. */
  minor?: number[];
  /** Bass rhythm per bar in eighths (`x` plays the root, `5` the fifth, `8` the octave). */
  bass: string;
  /** Chord stabs per bar in eighths (`x`), or a held chord ('hold'). */
  chord: string;
  shaker: boolean;
  /** A plucked melody line per bar: semitones above the root per eighth, `.` a rest (looped). */
  melody?: string[];
}

const DEG: Record<string, number> = { x: 0, '5': 7, '8': 12, '3': 4, '6': 9 };

/** The backing band for `bars` bars (plus the count-in bar, at bar −1). */
export function bed(style: BedStyle, bars: number): BedEvent[] {
  const out: BedEvent[] = [];
  for (let b = -1; b < bars; b++) {
    const i = ((b % style.roots.length) + style.roots.length) % style.roots.length;
    const root = style.roots[i];
    const minor = style.minor?.includes(i) ?? false;
    const base = b * 4;
    if (b === -1) {
      // the count-in: four soft shaker clicks and a held chord, so the tempo is in your body before bar 0
      for (let k = 0; k < 4; k++) out.push({ beat: base + k, voice: 'shaker', midi: 0, len: 0.25, vel: k === 0 ? 0.9 : 0.6 });
      out.push({ beat: base, voice: 'chord', midi: root, len: 4, vel: 0.35, minor });
      continue;
    }
    for (let k = 0; k < 8; k++) {
      const c = style.bass[k % style.bass.length];
      if (c in DEG) out.push({ beat: base + k / 2, voice: 'bass', midi: root - 24 + DEG[c], len: 0.45, vel: k === 0 ? 0.9 : 0.7 });
    }
    if (style.chord === 'hold') out.push({ beat: base, voice: 'chord', midi: root, len: 4, vel: 0.4, minor });
    else for (let k = 0; k < 8; k++) if (style.chord[k % style.chord.length] === 'x') out.push({ beat: base + k / 2, voice: 'chord', midi: root, len: 0.4, vel: 0.45, minor });
    if (style.shaker) for (let k = 0; k < 8; k++) out.push({ beat: base + k / 2, voice: 'shaker', midi: 0, len: 0.12, vel: k % 2 ? 0.35 : 0.55 });
    const mel = style.melody?.[b % style.melody.length];
    if (mel) for (let k = 0; k < Math.min(8, mel.length); k++) {
      const d = parseInt(mel[k], 36);
      if (!Number.isNaN(d)) out.push({ beat: base + k / 2, voice: 'pluck', midi: root + d, len: 0.5, vel: 0.55 });
    }
  }
  return out.sort((a, b) => a.beat - b.beat);
}

/** Seconds per beat at a tempo, with the slow-mode scale (0.6–1). */
export function secPerBeat(bpm: number, tempo = 1): number {
  return 60 / (bpm * tempo);
}

/** One hand: where two notes fall together, keep one (a pitched note over a drum, else the louder). */
export function oneHanded(notes: readonly Note[]): Note[] {
  const out: Note[] = [];
  for (const n of [...notes].sort((a, b) => a.beat - b.beat)) {
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev.beat - n.beat) < 1e-6) {
      const better = (n.degree >= 0 ? 1 : 0) - (prev.degree >= 0 ? 1 : 0) || n.vel - prev.vel;
      if (better > 0) out[out.length - 1] = n;
      continue;
    }
    out.push(n);
  }
  return out;
}
