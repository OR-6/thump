/**
 * Song charts (data only) and the little grid notation they are written in.
 *
 * A chart's notes are what the player plays; its bed is what the synth band plays under them
 * (bass, chords, shaker). Beats are quarter notes from the first bar of play (bar 0); a song has
 * one count-in bar before it.
 *
 * Grid notation: one string per lane, bars separated by `|`, each bar split into as many equal
 * steps as it has characters. `x` a note, `X` an accent, `o` a soft note, `.` a rest.
 * `grid({ kick: 'x...x...', snare: '..x...x.' })` is "boom · tak · boom · tak" in eighths.
 */
import type { Lane } from '../config.js';

export interface Note {
  beat: number;
  lane: Lane;
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
  lanes: Lane[];
  notes: Note[];
  /** The one-bar pattern the pads play first and the player copies (beats within the bar). */
  copy: Note[];
  bed: BedEvent[];
  /** Call and answer with the bandmate: it plays these bars, you answer in the next two (notes made live). */
  calls?: number[];
  /** The card's icon, drawn in the card renderer. */
  icon: 'porch' | 'clock' | 'birds' | 'hands' | 'gong' | 'bus';
}

const VEL: Record<string, number> = { x: 0.85, X: 1, o: 0.55 };

/** Notes from a grid, starting at `bar` (see the notation above). */
export function grid(lanes: Partial<Record<Lane, string>>, bar = 0, beatsPerBar = 4): Note[] {
  const out: Note[] = [];
  for (const [lane, text] of Object.entries(lanes) as [Lane, string][]) {
    const bars = text.split('|');
    bars.forEach((b, i) => {
      const steps = b.length;
      for (let k = 0; k < steps; k++) {
        const v = VEL[b[k]];
        if (v === undefined) continue;
        out.push({ beat: (bar + i) * beatsPerBar + (k * beatsPerBar) / steps, lane, vel: v });
      }
    });
  }
  return out.sort((a, b) => a.beat - b.beat || a.lane.localeCompare(b.lane));
}

/** The same bar(s) of grid, `times` times over, from `bar`. */
export function repeat(lanes: Partial<Record<Lane, string>>, bar: number, times: number): Note[] {
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
