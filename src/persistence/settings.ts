/** Accessibility, comfort and timing settings (the 2D page and the felt tag by the kit), persisted. */
import { load, save } from './storage.js';
import { TUNE_ITEMS, type StrikeTune } from '../room/tuning.js';

export type HandPref = 'auto' | 'left' | 'right';
/** How much of a song is yours: the main line, more, or all of it. */
export type Level = 'easy' | 'normal' | 'hard';

/** An instrument's own settings: its scale, sound, octave, key (pitch class of its lowest note) and, for the
 * drums, which pieces are out. */
export interface ShelfCfg {
  scale: string;
  sound: string;
  oct?: number;
  key?: number;
  pieces?: 'small' | 'full';
}

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
  /** The instrument on the desk in free play, and each instrument's scale and sound. */
  inst: string;
  shelf: Record<string, ShelfCfg>;
  /** Songs: Easy or Normal. */
  level: Level;
  /** Where you moved the panel to (kit-local, m); unset: where it stands by itself. */
  panelAt?: { x: number; y: number; z: number };
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
    // (words in the room are opt-in: names and prompts live on the panel)
    noWords: s.noWords !== false,
    lookToPlay: s.lookToPlay === true,
    band: s.band !== false,
    pendulum: s.pendulum === true,
    offset: num(s.offset, -0.25, 0.25, 0),
    calibrateNext: s.calibrateNext === true,
    placeFresh: s.placeFresh === true,
    tune: readTune(s.tune),
    inst: typeof s.inst === 'string' && /^[a-z]{1,12}$/.test(s.inst) ? s.inst : 'drums',
    shelf: readShelf(s.shelf),
    level: s.level === 'normal' || s.level === 'hard' ? s.level : 'easy',
    ...(s.panelAt && typeof s.panelAt === 'object' && [s.panelAt.x, s.panelAt.y, s.panelAt.z].every((v) => typeof v === 'number' && Number.isFinite(v))
      ? { panelAt: { x: num(s.panelAt.x, -0.8, 0.8, 0), y: num(s.panelAt.y, 0.1, 0.8, 0.3), z: num(s.panelAt.z, -0.8, 0.5, -0.2) } }
      : {}),
  };
}

function readShelf(v: unknown): Record<string, ShelfCfg> {
  const out: Record<string, ShelfCfg> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (!/^[a-z]{1,12}$/.test(k) || !x || typeof x !== 'object') continue;
    const { scale, sound, oct, key, pieces } = x as { scale?: unknown; sound?: unknown; oct?: unknown; key?: unknown; pieces?: unknown };
    if (typeof scale === 'string' && typeof sound === 'string' && scale.length < 16 && sound.length < 16)
      out[k] = { scale, sound, ...(oct === -1 || oct === 1 ? { oct } : {}), ...(typeof key === 'number' && Number.isInteger(key) && key >= 0 && key < 12 ? { key } : {}), ...(pieces === 'small' || pieces === 'full' ? { pieces } : {}) };
  }
  return out;
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
