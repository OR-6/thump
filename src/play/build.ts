/**
 * Build: you make a music machine out of the things on your desk. A track is a list of parts (KICK, SNARE, HAT, PERC,
 * KEYS, BASS). For each part you hit the thing that should play it, then play two bars along with the lights; what
 * you played is snapped to the grid (your loudness kept), anything you missed is filled in softly so a part is never
 * broken, and it loops. When every part is in, the desk plays the track by itself. Pure logic, unit-tested.
 */

import { SCORES, chordMidi, type Score } from '../songs/score.js';

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
  /** Things you must have found on the desk to build it (no longer a gate: tracks open as you perform them). */
  needs: number;
  /** The chords under it, one per bar (MIDI roots), looping with the two-bar machine. */
  chords: readonly number[];
  /** Which of those chords are minor. */
  minorChords?: readonly number[];
  /** Its notes are the minor pentatonic (else the major). */
  minor?: boolean;
  /** Swing: where the off-beat eighth falls between two beats (0.5 straight, 0.58 a lazy shuffle). */
  swing?: number;
  /** A song written out bar by bar (src/songs/score.ts) rather than a two-bar loop: it has no parts to build. */
  score?: Score;
}

/** Beats in the loop: two bars. */
export const LOOP_BEATS = 8;

export const TRACKS: readonly TrackDef[] = [
  // boom on 1 and 3, smack on 2 and 4: one hand then the other, so anyone can keep it
  {
    id: 'kick-start',
    name: 'Kick Start',
    bpm: 92,
    key: 0,
    parts: [
      { name: 'KICK', pattern: 'X...x...|X...x...', pitched: 'no' },
      { name: 'SNARE', pattern: '..X...X.|..X...X.', pitched: 'no' },
      { name: 'HAT', pattern: 'x.x.x.x.|x.x.x.x.', pitched: 'no' },
      { name: 'PERC', pattern: '...x...x|...x...x', pitched: 'no' },
      { name: 'KEYS', pattern: '2.3.4...|4.3.2...', pitched: 'yes' },
      { name: 'BASS', pattern: '0...0...|4...4...', pitched: 'if-it-can' },
    ],
    needs: 0,
    chords: [60, 57],
    minorChords: [1],
  },
  {
    id: 'two-step',
    name: 'Two Step',
    bpm: 100,
    key: 7,
    needs: 1,
    chords: [67, 64],
    minorChords: [1],
    parts: [
      { name: 'KICK', pattern: 'X.x.x.x.|X.x.x.x.', pitched: 'no' },
      { name: 'SNARE', pattern: '..X...X.|..X...X.', pitched: 'no' },
      { name: 'HAT', pattern: '.x.x.x.x|.x.x.x.x', pitched: 'no' },
      { name: 'PERC', pattern: 'x..x..x.|..x..x..', pitched: 'no' },
      { name: 'PERC 2', pattern: '......x.|...x....', pitched: 'no' },
      { name: 'KEYS', pattern: '0.2.3...|4.3.2.0.', pitched: 'yes' },
      { name: 'BASS', pattern: '0...0...|4...3...', pitched: 'if-it-can' },
    ],
  },
  {
    id: 'boom-bap-88',
    name: 'Boom Bap 88',
    bpm: 88,
    key: 9,
    minor: true,
    swing: 0.58,
    needs: 3,
    chords: [57, 62],
    minorChords: [0, 1],
    parts: [
      { name: 'KICK', pattern: 'X..x....|X..x.x..', pitched: 'no' },
      { name: 'SNARE', pattern: '..X...X.|..X...X.', pitched: 'no' },
      { name: 'HAT', pattern: 'x.x.x.x.|x.x.x.xx', pitched: 'no' },
      { name: 'CLAP', pattern: '......x.|......x.', pitched: 'no' },
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
    minor: true,
    swing: 0.58,
    needs: 4,
    chords: [62, 67],
    minorChords: [0],
    parts: [
      { name: 'KICK', pattern: 'X..x....|X..x...x', pitched: 'no' },
      { name: 'SNARE', pattern: '..X...X.|..X...X.', pitched: 'no' },
      { name: 'HAT', pattern: 'x.x.x.x.|x.x.x.x.', pitched: 'no' },
      { name: 'PERC', pattern: '..x...x.|..x.....', pitched: 'no' },
      // (bar 2 is over G major: its tune leans on the G and D, not the C that rubs the B)
      { name: 'KEYS', pattern: '0.2.4...|5.3.2...', pitched: 'yes' },
      { name: 'KEYS 2', pattern: '....5...|....5...', pitched: 'yes' },
      { name: 'BASS', pattern: '0..0..3.|2..2..0.', pitched: 'if-it-can' },
    ],
  },
  // the one half-time track: the smack on 3
  {
    id: 'night-shift',
    name: 'Night Shift',
    bpm: 110,
    key: 5,
    minor: true,
    needs: 5,
    chords: [65, 70],
    minorChords: [0, 1],
    parts: [
      { name: 'KICK', pattern: 'X..x..x.|X..x....', pitched: 'no' },
      { name: 'SNARE', pattern: '....X...|....X...', pitched: 'no' },
      { name: 'HAT', pattern: 'x.xxx.x.|x.xxx.xx', pitched: 'no' },
      { name: 'CLAP', pattern: '....x...|....x..x', pitched: 'no' },
      { name: 'PERC', pattern: '.x...x..|.x...x..', pitched: 'no' },
      { name: 'KEYS', pattern: '2.3.4.3.|2...0...', pitched: 'yes' },
      { name: 'KEYS 2', pattern: '5.......|5...4...', pitched: 'yes' },
      { name: 'BASS', pattern: '0.0...3.|2.2...0.', pitched: 'if-it-can' },
    ],
  },
];

/**
 * The songs to play: classics and originals written out bar by bar (src/songs/tunes.ts), easiest first. The loop
 * tracks above are what Make a track builds.
 */
export const SONG_TRACKS: readonly TrackDef[] = SCORES.map((s) => ({
  id: s.tune.id,
  name: s.tune.name,
  bpm: s.tune.bpm,
  key: s.keyPc,
  parts: [],
  needs: 0,
  // (the home chord: the band's held five at the end, and where your last hit lands)
  chords: [chordMidi(s.home, s.keyPc)],
  minorChords: s.home.minor ? [0] : [],
  minor: s.scale === 'minor',
  score: s,
}));

export interface Step {
  beat: number;
  degree: number;
  vel: number;
}

/** A part's pattern as steps (beat within the loop, degree or −1, velocity); `swing` pushes the off-beat eighths late. */
const stepCache = new Map<string, Step[]>();
/** A pattern's steps (worked out once per pattern and swing: callers read them every frame, never change them). */
export function steps(pattern: string, swing = 0.5): Step[] {
  const id = `${pattern}~${swing}`;
  let got = stepCache.get(id);
  if (!got) {
    got = parseSteps(pattern, swing);
    if (stepCache.size > 256) stepCache.clear();
    stepCache.set(id, got);
  }
  return got;
}
function parseSteps(pattern: string, swing: number): Step[] {
  const out: Step[] = [];
  const bars = pattern.split('|');
  bars.forEach((bar, b) => {
    for (let k = 0; k < bar.length; k++) {
      const c = bar[k];
      if (c === '.') continue;
      const beat = b * 4 + k / 2 + (k % 2 ? swing - 0.5 : 0);
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
  /** A band line in a written-out song (its melody, its bass): played by the band's own voice at this MIDI note. */
  midi?: number;
  /** Its length in beats. */
  len?: number;
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
export function ownBar(hits: readonly RawHit[], loud: number, swing = 0.5): MachineNote[] {
  const top = Math.max(0.05, loud);
  const by = new Map<number, RawHit>();
  for (const h of hits) {
    if (h.vel < 0.15) continue;
    // (on the 16ths; in a swung track the off-beat eighths sit late, where the hats are)
    let g = (Math.round(h.beat * 4) / 4) % LOOP_BEATS;
    if (swing !== 0.5 && Math.abs(g * 2 - Math.round(g * 2)) < 1e-6 && Math.round(g * 2) % 2 === 1) g += swing - 0.5;
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

/**
 * Today's song: a new track every day, the same for everyone that day. Its tempo, key, groove and tune are picked
 * from pools that sit right together (a backbeat always on 2 and 4; a tune that walks the scale; a bass on the chord
 * roots), seeded from the date.
 */
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Today's date (UTC: everyone in a band has the same today), for today's song. */
export function songDay(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function dailyTrack(day: string): TrackDef {
  let seed = 2166136261;
  for (let i = 0; i < day.length; i++) seed = Math.imul(seed ^ day.charCodeAt(i), 16777619) >>> 0;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
  const minor = rnd() < 0.5;
  const key = pick([0, 2, 5, 7, 9]);
  const bpm = pick([84, 88, 92, 96, 100, 104]);
  const r = 48 + key;
  // a tune: two bars of eighths, from a chord tone, walking the scale a step or two at a time (turning back at the
  // ends, as likely down as up), each bar opening on a note, and the second landing on its chord before a rest
  const tune = (): string => {
    let d = pick(minor ? [0, 1, 3] : [0, 2, 3]);
    let out = '';
    for (let b = 0; b < 2; b++) {
      for (let k = 0; k < 8; k++) {
        if (k % 2 === 1 || (k > 0 && rnd() < 0.3) || (b === 1 && k >= 6)) out += '.';
        else if (b === 1 && k === 4) {
          // the cadence: the nearest note of the second chord (vi in major, iv in minor)
          const land = minor ? [2, 5] : [2, 4];
          d = Math.abs(land[0] - d) <= Math.abs(land[1] - d) ? land[0] : land[1];
          out += String(d);
        } else {
          out += String(d);
          d += pick([-2, -1, -1, 1, 1, 2]);
          if (d < 0) d = -d;
          if (d > 5) d = 10 - d;
        }
      }
      if (b === 0) out += '|';
    }
    return out;
  };
  const wd = new Date(`${day}T12:00:00Z`).getUTCDay();
  return {
    id: `daily-${day}`,
    name: `${Number.isFinite(wd) ? WEEKDAYS[wd] : 'Today'}'s song`,
    bpm,
    key,
    minor,
    swing: rnd() < 0.3 ? 0.58 : undefined,
    needs: 0,
    chords: minor ? [r + 12, r + 17] : [r + 12, r + 9],
    minorChords: minor ? [0, 1] : [1],
    parts: [
      { name: 'KICK', pattern: pick(['X...x...|X...x...', 'X..x....|X..x.x..', 'X...x.x.|X...x...']), pitched: 'no' },
      { name: 'SNARE', pattern: '..X...X.|..X...X.', pitched: 'no' },
      { name: 'HAT', pattern: pick(['x.x.x.x.|x.x.x.x.', '.x.x.x.x|.x.x.x.x', 'x.xxx.x.|x.x.x.xx']), pitched: 'no' },
      { name: 'PERC', pattern: pick(['...x...x|...x...x', '..x...x.|..x.....', '.x...x..|.x...x..']), pitched: 'no' },
      { name: 'KEYS', pattern: tune(), pitched: 'yes' },
      // the bass on the roots: the first chord, then the second (in the minor pentatonic iv is degree 2; vi is 4)
      { name: 'BASS', pattern: minor ? '0...0...|2...2...' : '0...0...|4...4...', pitched: 'if-it-can' },
    ],
  };
}
