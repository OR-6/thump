/**
 * Casting (pure): a song is written in parts; your room has instruments. When a song starts, each part
 * goes to the instrument in your room that suits it best: its own family first, then the nearest
 * family, each instrument used once where possible; anything your room lacks falls back to the table
 * (the kit for drums, the table keys for notes). Then each note becomes a target: a pad, a bar or a key.
 */
import type { Family } from '../room/classify.js';
import { DRUMS, type DrumPart, type Note, type Part } from './chart.js';

/** An instrument the room has (discovered), by surface id. */
export interface RoomInstrument {
  id: string;
  family: Family;
  /** Pitch zones it has (0 for unpitched). */
  zones: number;
}

export interface Target {
  /** Surface id ('kit', 'keys', or a room surface). */
  surface: string;
  family: Family;
}

/** Families each part prefers, in order. */
const WANTS: Record<Exclude<Part, DrumPart>, Family[]> = {
  melody: ['marimba', 'glock', 'tongue', 'bowl', 'bell'],
  chime: ['glock', 'bell', 'bowl', 'marimba', 'tongue'],
  bass: ['tongue', 'marimba', 'gong', 'stomp', 'bowl'],
  shake: ['shaker', 'block'],
  gong: ['gong', 'stomp'],
};

/** Where an unmatched part goes on the table. */
const FALLBACK: Record<Exclude<Part, DrumPart>, Target> = {
  melody: { surface: 'keys', family: 'keys' },
  chime: { surface: 'keys', family: 'keys' },
  bass: { surface: 'keys', family: 'keys' },
  shake: { surface: 'kit', family: 'kit' },
  gong: { surface: 'kit', family: 'kit' },
};

export type Cast = Partial<Record<Part, Target>>;

export function cast(parts: readonly Part[], room: readonly RoomInstrument[]): Cast {
  const out: Cast = {};
  const used = new Set<string>();
  for (const p of parts) if ((DRUMS as readonly string[]).includes(p)) out[p] = { surface: 'kit', family: 'kit' };
  // the most particular parts choose first
  const order: Exclude<Part, DrumPart>[] = ['gong', 'shake', 'chime', 'bass', 'melody'];
  const tonal = order.filter((p) => parts.includes(p)).reverse(); // melody first: it matters most
  for (const p of tonal) {
    let pick: RoomInstrument | undefined;
    for (const fam of WANTS[p]) {
      pick = room.find((r) => r.family === fam && !used.has(r.id)) ?? undefined;
      if (pick) break;
    }
    // nothing free: share an instrument that fits rather than fall back
    if (!pick) for (const fam of WANTS[p]) if ((pick = room.find((r) => r.family === fam))) break;
    if (pick) {
      used.add(pick.id);
      out[p] = { surface: pick.id, family: pick.family };
    } else out[p] = FALLBACK[p];
  }
  return out;
}

/** The judge's key for a note under a cast: "surface:zone" (the kit's zones are its drum names). */
export function noteKey(n: Note, c: Cast, zoneFor: (surface: string, degree: number) => number): string {
  const t = c[n.part];
  if (!t) return `kit:${n.part}`;
  if (t.family === 'kit') {
    // a drum part, or a tonal part with nowhere else to go: the kit plays it
    const drum: DrumPart = (DRUMS as readonly string[]).includes(n.part) ? (n.part as DrumPart) : n.part === 'gong' ? 'kick' : 'hat';
    return `kit:${drum === 'rim' ? 'snare' : drum}`;
  }
  return `${t.surface}:${zoneFor(t.surface, n.degree)}`;
}

/** How many distinct instruments (beyond the kit) a song would like: the next song's ask. */
export function wants(parts: readonly Part[]): number {
  return parts.filter((p) => !(DRUMS as readonly string[]).includes(p)).length;
}
