/** Accessibility, comfort and timing settings (the 2D page and the felt tag by the kit), persisted. */
import { load, save } from './storage.js';
import { TUNE_ITEMS, type StrikeTune } from '../room/tuning.js';

export type HandPref = 'auto' | 'left' | 'right';

export interface Settings {
  highContrast: boolean;
  /** Calm motion; undefined: follow the system's reduced-motion preference. */
  calmMotion?: boolean;
  /** Which hand leads (the hat side); 'auto' = the hand you placed the kit with. */
  hand: HandPref;
  /** One-handed kit: every pad within the leading hand's sweep, charts folded to one hand. */
  oneHand: boolean;
  /** Slow mode: songs at this share of their tempo (0.6–1); stars are the same. */
  tempo: number;
  /** No words in the headset (felt tags hidden; shapes and lights only). */
  noWords: boolean;
  /** Look to play: look at a pad for half a second to sound it. */
  lookToPlay: boolean;
  /** The backing band in songs (the drums always play). */
  band: boolean;
  /** A visual metronome (a felt pendulum) in songs. */
  pendulum: boolean;
  /** Seconds your hits arrive late by (tap-along calibration, then learned as you play). */
  offset: number;
  /** Run the tap-along timing check on the next entry. */
  calibrateNext: boolean;
  /** Find the table afresh on the next entry (instead of the kit coming back where it was). */
  placeFresh: boolean;
  /** Strike thresholds tuned in the headset (device sessions); unset: the defaults. */
  tune: StrikeTune;
}

const KEY = 'settings.v1';

export function loadSettings(): Settings {
  const raw = load<unknown>(KEY, {});
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<Settings>;
  const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  return {
    highContrast: s.highContrast === true,
    calmMotion: typeof s.calmMotion === 'boolean' ? s.calmMotion : undefined,
    hand: s.hand === 'left' || s.hand === 'right' ? s.hand : 'auto',
    oneHand: s.oneHand === true,
    tempo: num(s.tempo, 0.6, 1, 1),
    noWords: s.noWords === true,
    lookToPlay: s.lookToPlay === true,
    band: s.band !== false,
    pendulum: s.pendulum === true,
    offset: num(s.offset, -0.25, 0.25, 0),
    calibrateNext: s.calibrateNext === true,
    placeFresh: s.placeFresh === true,
    tune: readTune(s.tune),
  };
}

/** Saved strike tuning, each value kept inside the page's range. */
function readTune(v: unknown): StrikeTune {
  const out: StrikeTune = {};
  if (!v || typeof v !== 'object') return out;
  for (const item of TUNE_ITEMS) {
    if (item.key === 'offset' || item.key === 'defaults') continue;
    const n = (v as Record<string, unknown>)[item.key];
    if (typeof n === 'number' && Number.isFinite(n)) out[item.key] = Math.min(item.max / item.scale, Math.max(item.min / item.scale, n));
  }
  return out;
}

export function saveSettings(s: Settings): void {
  save(KEY, s);
}
