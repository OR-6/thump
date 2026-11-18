/**
 * The classics' recorded percussion (pure data, no system or DOM): what the drummer plays on each classic's own
 * recording (tools/stems/arrange-stems.ts renders its drums stem from exactly these), and that same part as the
 * player's drums and congas chart (src/songs/score.ts), so every drum you're asked to hit is one the recording has.
 * Before this, a classic's drums chart came from its groove's drummer while its recording had its own (Saints' jazz
 * kit, the shanty's stomp and clap, the hymn's brushes from its third verse), and a third to a half of the notes on
 * Normal and Hard had nothing in the music under them.
 */
import { BAND_STYLES, drumHits, planBars, type BarPlan, type Hit, type SongShape } from './arrange.js';
import type { Style } from './tunes.js';

type Pat = (b: BarPlan) => string | undefined;

/** A pattern per GM drum note over `steps` a bar (VEL's characters), at `scale`. */
interface Beat {
  beat: { steps: number; notes: Record<number, Pat>; scale: number };
}
/** A style's drummer (src/songs/arrange.ts) in the bars `only` allows. */
interface Drummer {
  drummer: { style: Style; scale: number; only: (b: BarPlan) => boolean };
}
/** A crash on each section's first beat. */
interface Crashes {
  crashes: { vel: number; note: number };
}
/** A snare roll into each section (a fill of 2), over its last `beats`. */
interface Rolls {
  rolls: { vel: number; note: number; beats: number };
}
export type KitPart = Beat | Drummer | Crashes | Rolls;
export interface KitTrack {
  name: string;
  /** Its General MIDI drum kit. */
  program: number;
  rev: number;
  vol: number;
  parts: KitPart[];
}

/** Each classic's drums stem, track by track. A classic not here (Für Elise, the Canon) has no drums. */
export const CLASSIC_KITS: Record<string, KitTrack[]> = {
  entertainer: [{ name: 'brushes', program: 40, rev: 35, vol: 80, parts: [{ beat: { steps: 8, scale: 0.5, notes: { 38: (b) => (b.bar >= 4 ? '..x...x.' : undefined), 42: (b) => (b.bar >= 4 ? 'x.x.x.x.' : undefined), 36: (b) => (b.bar >= 20 ? 'x...x...' : undefined) } } }] }],
  'turkish-march': [{ name: 'janissary', program: 48, rev: 45, vol: 82, parts: [{ beat: { steps: 4, scale: 0.55, notes: { 36: (b) => (b.chorus ? 'x.x.' : undefined), 81: (b) => (b.chorus ? '.x.x' : undefined), 57: (b) => (b.chorus && b.bar % 2 === 0 ? 'x...' : undefined) } } }] }],
  'william-tell': [{ name: 'orchestra', program: 48, rev: 45, vol: 92, parts: [{ beat: { steps: 8, scale: 0.62, notes: { 38: (b) => (b.solo ? 'x...x...' : 'x.xxx.xx'), 36: () => 'x...x...' } } }, { crashes: { vel: 0.75, note: 49 } }] }],
  'can-can': [{ name: 'orchestra', program: 48, rev: 45, vol: 92, parts: [{ beat: { steps: 8, scale: 0.7, notes: { 36: () => 'x...x...', 38: (b) => (b.chorus ? '..x...x.' : undefined) } } }, { crashes: { vel: 0.8, note: 49 } }, { rolls: { vel: 0.6, note: 38, beats: 1 } }] }],
  'ode-to-joy': [
    { name: 'timpani', program: 48, rev: 55, vol: 86, parts: [{ beat: { steps: 4, scale: 0.7, notes: { 36: (b) => (b.chorus || b.pass >= 1 ? 'x.x.' : 'x...') } } }, { crashes: { vel: 0.7, note: 49 } }] },
    { name: 'kit', program: 8, rev: 40, vol: 86, parts: [{ drummer: { style: 'anthem', scale: 0.75, only: (b) => b.pass >= 1 } }] },
  ],
  'mountain-king': [
    { name: 'timpani', program: 48, rev: 50, vol: 88, parts: [{ beat: { steps: 4, scale: 0.7, notes: { 41: (b) => (b.pass === 1 ? 'x.x.' : undefined) } } }] },
    { name: 'rock kit', program: 16, rev: 30, vol: 92, parts: [{ drummer: { style: 'rock', scale: 0.9, only: (b) => b.pass === 2 } }] },
  ],
  'scarborough-fair': [{ name: 'frame drum', program: 48, rev: 55, vol: 80, parts: [{ beat: { steps: 6, scale: 0.5, notes: { 45: (b) => (b.pass >= 1 ? 'x.....' : undefined), 82: (b) => (b.pass >= 1 ? '-.x.x.' : undefined) } } }] }],
  'amazing-grace': [{ name: 'brushes', program: 40, rev: 45, vol: 82, parts: [{ beat: { steps: 6, scale: 0.5, notes: { 36: (b) => (b.pass >= 1 ? 'x.....' : undefined), 38: (b) => (b.pass >= 1 ? '....x.' : undefined), 42: (b) => (b.pass >= 1 ? 'x.x.x.' : undefined) } } }] }],
  saints: [{ name: 'jazz kit', program: 32, rev: 35, vol: 88, parts: [{ beat: { steps: 8, scale: 0.62, notes: { 36: () => 'x...x...', 38: () => '..x...x.', 44: () => '..x...x.', 51: (b) => (b.pass >= 1 || b.chorus ? 'x.x.x.x.' : undefined) } } }, { crashes: { vel: 0.6, note: 49 } }] }],
  'drunken-sailor': [{ name: 'stomp and clap', program: 8, rev: 35, vol: 92, parts: [{ beat: { steps: 8, scale: 0.75, notes: { 36: () => 'x...x...', 39: () => '..x...x.', 54: (b) => (b.pass >= 1 || b.chorus ? 'x-x-x-x-' : undefined) } } }, { crashes: { vel: 0.55, note: 49 } }] }],
  korobeiniki: [
    { name: 'folk', program: 8, rev: 35, vol: 88, parts: [{ beat: { steps: 8, scale: 0.7, notes: { 36: (b) => (b.pass === 0 ? 'x...x...' : undefined), 54: (b) => (b.pass === 0 ? '..x...x.' : undefined) } } }] },
    { name: 'dance kit', program: 26, rev: 30, vol: 92, parts: [{ drummer: { style: 'dance', scale: 0.85, only: (b) => b.pass >= 1 } }] },
  ],
};

/** The bars as a classic's arrangement sees them: a song in its whole form has its sections in three stages (early,
 * middle and late: `pass` 0, 1, 2), for the arrangements that build. */
export function arrangedPlan(s: SongShape): BarPlan[] {
  const plan = planBars(s);
  if (s.sections) for (const b of plan) b.pass = Math.min(2, Math.floor((3 * b.pass) / s.sections.length));
  return plan;
}

/** Each step of a bar's pattern (`a|b` alternating bars) that plays: its beat, its character, its step. */
export function eachStep(plan: BarPlan, n: number, pattern: string | undefined, steps: number, meter: number, end: number, fn: (beat: number, ch: string, i: number) => void): void {
  if (!pattern) return;
  const bars = pattern.split('|');
  const p = bars[n % bars.length];
  for (let i = 0; i < p.length; i++) {
    if (p[i] === '.' || p[i] === '-') continue;
    const beat = plan.beat + (i * meter) / steps;
    if (beat < end - 1e-6) fn(beat, p[i], i);
  }
}

/** Which of the player's drums a GM drum note is (the crashes are left to the band: one always sits on a kick). */
const LANE: Record<number, 'KICK' | 'SNARE' | 'HAT'> = { 35: 'KICK', 36: 'KICK', 41: 'KICK', 45: 'KICK', 37: 'SNARE', 38: 'SNARE', 39: 'SNARE', 40: 'SNARE', 42: 'HAT', 44: 'HAT', 46: 'HAT', 51: 'HAT', 54: 'HAT', 81: 'HAT', 82: 'HAT' };
const KEY = { KICK: 'kit:kick', SNARE: 'kit:snare', HAT: 'kit:hat' } as const;

/**
 * A classic's recorded drums as the player's chart sees a drummer's part (drumHits' shape, on the grid): a kick on a
 * beat is an accent (`X`, what Easy keeps), a roll a fill (`f`). Null for a song whose recording is its groove's own
 * drummer (an original, a lesson) or has no drums.
 */
export function classicKit(s: SongShape & { tune: { id: string } }): Record<'KICK' | 'SNARE' | 'HAT', Hit[]> | null {
  const kit = CLASSIC_KITS[s.tune.id];
  if (!kit) return null;
  const plan = arrangedPlan(s);
  const out: Record<'KICK' | 'SNARE' | 'HAT', Hit[]> = { KICK: [], SNARE: [], HAT: [] };
  const onBeat = (x: number) => Math.abs(x - Math.round(x)) < 1e-6;
  for (const t of kit)
    for (const part of t.parts) {
      if ('beat' in part) {
        for (const [note, pat] of Object.entries(part.beat.notes)) {
          const lane = LANE[Number(note)];
          if (!lane) continue;
          plan.forEach((b, n) =>
            eachStep(b, n, pat(b), part.beat.steps, s.meter, s.end, (beat, ch) => {
              if (ch !== 'X' && ch !== 'x' && ch !== 'o') return;
              const at = beat - b.beat;
              out[lane].push({ beat, key: KEY[lane], vel: ch === 'X' ? 1 : 0.78, late: 0, drum: lane.toLowerCase(), mark: lane === 'KICK' && onBeat(at) ? 'X' : ch, at });
            }),
          );
        }
      } else if ('drummer' in part) {
        const d = drumHits(BAND_STYLES[part.drummer.style], plan.filter(part.drummer.only), s.meter, s.end);
        // (a drummer played softer than its style's own: its soft hats are ghosts there, too quiet to play to)
        const ghost = (h: Hit) => (part.drummer.scale < 0.8 && h.mark === '-' ? 'o' : h.mark);
        for (const lane of ['KICK', 'SNARE', 'HAT'] as const) out[lane].push(...d[lane].map((h) => ({ ...h, late: 0, mark: ghost(h) })));
      } else if ('rolls' in part) {
        const { beats, note } = part.rolls;
        if (LANE[note] !== 'SNARE') continue;
        for (const b of plan) {
          if (b.fill !== 2) continue;
          for (let k = 0; k < beats * 4; k++) {
            const beat = b.beat + s.meter - beats + k / 4;
            if (beat < s.end - 1e-6) out.SNARE.push({ beat, key: KEY.SNARE, vel: 0.6, late: 0, drum: 'snare', mark: 'f', at: beat - b.beat });
          }
        }
      }
    }
  for (const lane of ['KICK', 'SNARE', 'HAT'] as const) out[lane].sort((a, b) => a.beat - b.beat);
  return out;
}
