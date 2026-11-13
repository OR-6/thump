/**
 * Build: you make a music machine out of the things on your desk. A track is a list of parts (KICK, SNARE, HAT, PERC,
 * KEYS, BASS). For each part you hit the thing that should play it, then play two bars along with the lights; what
 * you played is snapped to the grid (your loudness kept), anything you missed is filled in softly so a part is never
 * broken, and it loops. When every part is in, the desk plays the track by itself. Pure logic, unit-tested.
 */

export type PartName = 'KICK' | 'SNARE' | 'HAT' | 'PERC' | 'PERC 2' | 'CLAP' | 'KEYS' | 'KEYS 2' | 'BASS';

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
  /** Things you must have found on the desk to build it (the only gate in the game). */
  needs: number;
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
    needs: 0,
  },
  {
    id: 'two-step',
    name: 'Two Step',
    bpm: 100,
    key: 7,
    needs: 1,
    parts: [
      { name: 'KICK', pattern: 'X...x...|X...x...', pitched: 'no' },
      { name: 'SNARE', pattern: '....X...|....X...', pitched: 'no' },
      { name: 'HAT', pattern: '.x.x.x.x|.x.x.x.x', pitched: 'no' },
      { name: 'PERC', pattern: 'x..x..x.|..x..x..', pitched: 'no' },
      { name: 'PERC 2', pattern: '......x.|...x....', pitched: 'no' },
      { name: 'KEYS', pattern: '0.2.3...|4.3.2.0.', pitched: 'yes' },
      { name: 'BASS', pattern: '0...0...|3...4...', pitched: 'if-it-can' },
    ],
  },
  {
    id: 'boom-bap-88',
    name: 'Boom Bap 88',
    bpm: 88,
    key: 9,
    needs: 3,
    parts: [
      { name: 'KICK', pattern: 'X.....x.|..x.x...', pitched: 'no' },
      { name: 'SNARE', pattern: '....X...|....X...', pitched: 'no' },
      { name: 'HAT', pattern: 'x.x.x.x.|x.x.x.xx', pitched: 'no' },
      { name: 'CLAP', pattern: '....x...|....x...', pitched: 'no' },
      { name: 'PERC', pattern: '.x......|.x....x.', pitched: 'no' },
      { name: 'PERC 2', pattern: '...x....|.......x', pitched: 'no' },
      { name: 'KEYS', pattern: '0..2..4.|3.......', pitched: 'yes' },
      { name: 'BASS', pattern: '0.....0.|2...3...', pitched: 'if-it-can' },
    ],
  },
  {
    id: 'lowrider',
    name: 'Lowrider',
    bpm: 80,
    key: 2,
    needs: 4,
    parts: [
      { name: 'KICK', pattern: 'X..x....|X..x..x.', pitched: 'no' },
      { name: 'SNARE', pattern: '....X...|....X...', pitched: 'no' },
      { name: 'HAT', pattern: 'x.x.x.x.|x.x.x.x.', pitched: 'no' },
      { name: 'PERC', pattern: '..x...x.|..x.....', pitched: 'no' },
      { name: 'KEYS', pattern: '0.2.4...|5.4.2...', pitched: 'yes' },
      { name: 'KEYS 2', pattern: '....7...|....5...', pitched: 'yes' },
      { name: 'BASS', pattern: '0..0..3.|2..2..0.', pitched: 'if-it-can' },
    ],
  },
  {
    id: 'night-shift',
    name: 'Night Shift',
    bpm: 110,
    key: 5,
    needs: 5,
    parts: [
      { name: 'KICK', pattern: 'X..x..x.|X..x....', pitched: 'no' },
      { name: 'SNARE', pattern: '....X...|....X...', pitched: 'no' },
      { name: 'HAT', pattern: 'x.xxx.x.|x.xxx.xx', pitched: 'no' },
      { name: 'CLAP', pattern: '....x...|....x..x', pitched: 'no' },
      { name: 'PERC', pattern: '.x...x..|.x...x..', pitched: 'no' },
      { name: 'KEYS', pattern: '2.3.4.3.|2...0...', pitched: 'yes' },
      { name: 'KEYS 2', pattern: '7.......|5...4...', pitched: 'yes' },
      { name: 'BASS', pattern: '0.0...3.|2.2...0.', pitched: 'if-it-can' },
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
  /** The pattern step it belongs to, when your timing moved it off it (the pocket). */
  at?: number;
}

/** How far your own timing may move a recorded note off the grid (beats: a 32nd). */
export const POCKET = 0.125;

export interface RawHit {
  /** Beat within the recorded loop (0..8). */
  beat: number;
  key: string;
  vel: number;
}

/**
 * What a recorded part plays: each pattern note you hit near (within a third of a beat) is played where the pattern
 * puts it, as loud as you hit it next to your loudest hit in the take, on the bar or key you hit (pitched parts keep your choice: everything is in key).
 * Pattern notes you missed are filled in softly. Extra hits you added land on the nearest eighth if it's free.
 * `keyFor` gives the key a missed pattern note plays on (a pitched part: the zone for its degree).
 */
export function quantise(pattern: readonly Step[], hits: readonly RawHit[], keyFor: (s: Step) => string): MachineNote[] {
  const used = new Set<number>();
  const out: MachineNote[] = [];
  const n = pattern.length;
  // loudness is yours relative to your own loudest hit in the take: gentle taps on a tray make a full part too
  let loud = 0.05;
  for (const h of hits) if (h.vel > loud) loud = h.vel;
  const level = (v: number) => Math.min(1, 0.55 + 0.45 * Math.max(0, v) / loud);
  for (let k = 0; k < n; k++) {
    const st = pattern[k];
    // a hit belongs to this step if it's within a third of a beat, and nearer this step than its neighbours
    const prev = n > 1 ? (st.beat - pattern[(k - 1 + n) % n].beat + LOOP_BEATS) % LOOP_BEATS || LOOP_BEATS : LOOP_BEATS;
    const next = n > 1 ? (pattern[(k + 1) % n].beat - st.beat + LOOP_BEATS) % LOOP_BEATS || LOOP_BEATS : LOOP_BEATS;
    let best = -1;
    let bd = Math.min(0.34, prev / 2 + 1e-6, next / 2 + 1e-6);
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
      // your pocket: a little of where you actually put it stays (a third of it, never more than a 32nd)
      let off = hits[best].beat - st.beat;
      if (off > LOOP_BEATS / 2) off -= LOOP_BEATS;
      if (off < -LOOP_BEATS / 2) off += LOOP_BEATS;
      const feel = Math.max(-POCKET, Math.min(POCKET, off * 0.33));
      out.push({ key: hits[best].key, beat: (st.beat + feel + LOOP_BEATS) % LOOP_BEATS, vel: level(hits[best].vel), filled: false, at: st.beat });
    } else out.push({ key: keyFor(st), beat: st.beat, vel: 0.3 * st.vel, filled: true });
  }
  // your own extra notes, on the nearest eighth, where nothing else is
  hits.forEach((h, i) => {
    if (used.has(i) || h.vel < 0.25) return;
    const beat = (Math.round(h.beat * 2) / 2) % LOOP_BEATS;
    if (out.some((n) => Math.abs((n.at ?? n.beat) - beat) < 0.01)) return;
    out.push({ key: h.key, beat, vel: level(h.vel) * 0.9, filled: false });
  });
  return out.sort((a, b) => (a.at ?? a.beat) - (b.at ?? b.beat));
}

/**
 * Your own bar: what you played with the lights off, on the 16th grid, loudness against your loudest hit (`loud`), one
 * note per 16th (the loudest). Beats are loop phase (0..8).
 */
export function ownBar(hits: readonly RawHit[], loud: number): MachineNote[] {
  const top = Math.max(0.05, loud);
  const by = new Map<number, RawHit>();
  for (const h of hits) {
    if (h.vel < 0.15) continue;
    const g = (Math.round(h.beat * 4) / 4) % LOOP_BEATS;
    const was = by.get(g);
    if (!was || h.vel > was.vel) by.set(g, h);
  }
  return [...by.entries()].map(([beat, h]) => ({ key: h.key, beat, vel: Math.min(1, 0.55 + 0.45 * h.vel / top), filled: false })).sort((a, b) => a.beat - b.beat);
}

/** How much of a part you actually played (0..1): the share of pattern notes that weren't filled in. */
export function played(notes: readonly MachineNote[], pattern: readonly Step[]): number {
  if (!pattern.length) return 1;
  return notes.filter((n) => !n.filled && pattern.some((s) => Math.abs(s.beat - (n.at ?? n.beat)) < 0.01)).length / pattern.length;
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
