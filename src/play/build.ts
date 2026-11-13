/**
 * Build: you make a music machine out of the things on your desk. A track is a list of parts (KICK, SNARE, HAT, PERC,
 * KEYS, BASS). For each part you hit the thing that should play it, then play two bars along with the lights; what
 * you played is snapped to the grid (your loudness kept), anything you missed is filled in softly so a part is never
 * broken, and it loops. When every part is in, the desk plays the track by itself. Pure logic, unit-tested.
 */

export type PartName = 'KICK' | 'SNARE' | 'HAT' | 'PERC' | 'KEYS' | 'BASS';

export interface PartDef {
  name: PartName;
  /** Two bars of eighths: 'x' a hit, 'X' an accent, a digit a scale degree (pitched parts), '.' a rest; '|' between bars. */
  pattern: string;
  /** Needs a thing with notes (KEYS); BASS takes notes where the thing has them, else plays the rhythm. */
  pitched: 'yes' | 'if-it-can' | 'no';
}

export interface TrackDef {
  id: string;
  name: string;
  bpm: number;
  /** Pitch class of the key (0 = C). */
  key: number;
  parts: PartDef[];
}

/** Beats in the loop: two bars. */
export const LOOP_BEATS = 8;

export const TRACKS: readonly TrackDef[] = [
  {
    id: 'kick-start',
    name: 'Kick Start',
    bpm: 92,
    key: 0,
    parts: [
      { name: 'KICK', pattern: 'X.....x.|x...x...', pitched: 'no' },
      { name: 'SNARE', pattern: '....X...|....X...', pitched: 'no' },
      { name: 'HAT', pattern: 'x.x.x.x.|x.x.x.x.', pitched: 'no' },
      { name: 'PERC', pattern: '...x..x.|.x....x.', pitched: 'no' },
      { name: 'KEYS', pattern: '2.3..4..|3...2...', pitched: 'yes' },
      { name: 'BASS', pattern: '0.....0.|3.....2.', pitched: 'if-it-can' },
    ],
  },
];

export interface Step {
  beat: number;
  degree: number;
  vel: number;
}

/** A part's pattern as steps (beat within the loop, degree or −1, velocity). */
export function steps(pattern: string): Step[] {
  const out: Step[] = [];
  const bars = pattern.split('|');
  bars.forEach((bar, b) => {
    for (let k = 0; k < bar.length; k++) {
      const c = bar[k];
      if (c === '.') continue;
      const beat = b * 4 + k / 2;
      if (c === 'x' || c === 'X') out.push({ beat, degree: -1, vel: c === 'X' ? 1 : 0.8 });
      else if (/[0-9]/.test(c)) out.push({ beat, degree: Number(c), vel: 0.8 });
    }
  });
  return out;
}

/** A note of the machine: which thing (a judge key, "surface:zone"), when in the loop, how loud. */
export interface MachineNote {
  key: string;
  beat: number;
  vel: number;
  /** Filled in because you didn't play it (shown and played softer). */
  filled: boolean;
}

export interface RawHit {
  /** Beat within the recorded loop (0..8). */
  beat: number;
  key: string;
  vel: number;
}

/**
 * What a recorded part plays: each pattern note you hit near (within a third of a beat) is played where the pattern
 * puts it, as loud as you hit it, on the bar or key you hit (pitched parts keep your choice: everything is in key).
 * Pattern notes you missed are filled in softly. Extra hits you added land on the nearest eighth if it's free.
 * `keyFor` gives the key a missed pattern note plays on (a pitched part: the zone for its degree).
 */
export function quantise(pattern: readonly Step[], hits: readonly RawHit[], keyFor: (s: Step) => string): MachineNote[] {
  const used = new Set<number>();
  const out: MachineNote[] = [];
  for (const st of pattern) {
    let best = -1;
    let bd = 0.34;
    hits.forEach((h, i) => {
      if (used.has(i)) return;
      const d = Math.min(Math.abs(h.beat - st.beat), Math.abs(h.beat - st.beat - LOOP_BEATS), Math.abs(h.beat - st.beat + LOOP_BEATS));
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    if (best >= 0) {
      used.add(best);
      out.push({ key: hits[best].key, beat: st.beat, vel: Math.max(0.3, Math.min(1, hits[best].vel)), filled: false });
    } else out.push({ key: keyFor(st), beat: st.beat, vel: 0.3 * st.vel, filled: true });
  }
  // your own extra notes, on the nearest eighth, where nothing else is
  hits.forEach((h, i) => {
    if (used.has(i) || h.vel < 0.25) return;
    const beat = (Math.round(h.beat * 2) / 2) % LOOP_BEATS;
    if (out.some((n) => Math.abs(n.beat - beat) < 0.01)) return;
    out.push({ key: h.key, beat, vel: Math.min(1, h.vel) * 0.9, filled: false });
  });
  return out.sort((a, b) => a.beat - b.beat);
}

/** How much of a part you actually played (0..1): the share of pattern notes that weren't filled in. */
export function played(notes: readonly MachineNote[], pattern: readonly Step[]): number {
  if (!pattern.length) return 1;
  return notes.filter((n) => !n.filled && pattern.some((s) => Math.abs(s.beat - n.beat) < 0.01)).length / pattern.length;
}

/**
 * Which thing a part goes on, given what was hit. A KEYS part needs a thing with notes; hit one without and it goes on
 * the desk's bars instead (and says so). `zones(surface)` is how many notes a thing has.
 */
export function assign(part: PartDef, hitKey: string, zones: (surface: string) => number): { surface: string; key: string; moved: boolean } {
  const surface = hitKey.slice(0, hitKey.indexOf(':'));
  if (part.pitched === 'yes' && zones(surface) < 4) return { surface: 'keys', key: 'keys:0', moved: true };
  return { surface, key: hitKey, moved: false };
}
