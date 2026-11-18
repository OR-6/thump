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
  /** The guitar's frets: three chord places that always fit (easy), or every fingertip stopping its string (real). */
  frets?: 'easy' | 'real';
}

export interface Settings {
  highContrast: boolean;
  /** Calm motion; undefined: follow the system's reduced-motion preference. */
  calmMotion?: boolean;
  /** Which hand leads (the hat side); 'auto' = the hand you placed the kit with. */
  hand: HandPref;
  /** One-handed kit: every pad within the leading hand's sweep, charts folded to one hand. */
  oneHand: boolean;
  /** The guitar held facing you over the desk, as it first was (unset: in your lap, facing away, as it's really held). */
  guitarDesk?: boolean;
  /** The instruments set into the desk (Settings: On the table), so every hit lands on its wood; off, they stand on
   * it as they always have. */
  table?: boolean;
  /** The timing's first guess has been made (the headset's sound delay and its hand tracking's), once, ever. */
  offsetSeeded?: boolean;
  /** Where you put the guitar in your lap (the kit's frame: its soundhole), when you've moved it. */
  guitarAt?: { x: number; y: number; z: number };
  /** Slow mode: songs at this share of their tempo (0.6–1); stars are the same. */
  tempo: number;
  /** No words in the headset (felt tags hidden; shapes and lights only). */
  noWords: boolean;
  /** Look to play: look at a pad for half a second to sound it. */
  lookToPlay: boolean;
  /** The backing band in songs (the drums always play). */
  band: boolean;
  /** Free play: light sent off what you play (rings spreading, bars rising). */
  freeLight: boolean;
  /** A visual metronome (a felt pendulum) in songs. */
  pendulum: boolean;
  /** Seconds your hits arrive late by (tap-along calibration, then learned as you play). */
  offset: number;
  /** Run the tap-along timing check on the next entry. */
  calibrateNext: boolean;
  /** Find the table afresh on the next entry (instead of the kit coming back where it was). */
  placeFresh: boolean;
  /** How far below the eyes the desk was last found (m): the kit comes out there next time. */
  deskDrop?: number;
  /** Strike thresholds tuned in the headset (device sessions); unset: the defaults. */
  tune: StrikeTune;
  /** The instrument on the desk in free play, and each instrument's scale and sound. */
  inst: string;
  shelf: Record<string, ShelfCfg>;
  /** Songs: Easy or Normal. */
  level: Level;
  /** Where you moved the panel to (kit-local, m); unset: where it stands by itself. */
  panelAt?: { x: number; y: number; z: number };
  /** How far the first steps have got (0: play it, 1: poke the screen, 2: start a lesson, 3: done). */
  coach?: number;
  /** The instruments whose how-to the HUD has shown. */
  taught?: string[];
  /** Where you moved the instruments to, from where they'd stand by themselves (m: further ahead, to the right). */
  /** Your move of the instruments from where they stood by themselves: ahead, left, and up (m). */
  /** `h2`: the height was saved after the fix for moves made in a resumed session (before it, every such move saved
   * the most it could, 25 cm up; those heights are dropped). */
  kitNudge?: { a: number; l: number; h?: number; h2?: true };
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
    freeLight: s.freeLight !== false,
    pendulum: s.pendulum === true,
    offset: num(s.offset, -0.25, 0.25, 0),
    calibrateNext: s.calibrateNext === true,
    placeFresh: s.placeFresh === true,
    ...(typeof s.deskDrop === 'number' && Number.isFinite(s.deskDrop) && s.deskDrop >= 0.2 && s.deskDrop <= 0.85 ? { deskDrop: s.deskDrop } : {}),
    tune: readTune(s.tune),
    inst: typeof s.inst === 'string' && /^[a-z]{1,12}$/.test(s.inst) ? s.inst : 'drums',
    shelf: readShelf(s.shelf),
    level: s.level === 'normal' || s.level === 'hard' ? s.level : 'easy',
    ...(s.panelAt && typeof s.panelAt === 'object' && [s.panelAt.x, s.panelAt.y, s.panelAt.z].every((v) => typeof v === 'number' && Number.isFinite(v))
      ? { panelAt: { x: num(s.panelAt.x, -0.8, 0.8, 0), y: num(s.panelAt.y, 0.1, 0.8, 0.3), z: num(s.panelAt.z, -0.8, 0.5, -0.2) } }
      : {}),
    ...(typeof s.coach === 'number' && Number.isFinite(s.coach) ? { coach: Math.max(0, Math.min(3, Math.round(s.coach))) } : {}),
    ...(Array.isArray(s.taught) ? { taught: s.taught.filter((x): x is string => typeof x === 'string' && /^[a-z]{1,12}$/.test(x)).slice(0, 12) } : {}),
    ...(s.kitNudge && typeof s.kitNudge === 'object' && [s.kitNudge.a, s.kitNudge.l].every((v) => typeof v === 'number' && Number.isFinite(v))
      ? { kitNudge: { a: num(s.kitNudge.a, -0.3, 0.3, 0), l: num(s.kitNudge.l, -0.5, 0.5, 0), ...(s.kitNudge.h2 === true && typeof s.kitNudge.h === 'number' && Number.isFinite(s.kitNudge.h) && s.kitNudge.h !== 0 ? { h: num(s.kitNudge.h, -0.2, 0.25, 0), h2: true as const } : {}) } }
      : {}),
    ...(s.guitarDesk === true ? { guitarDesk: true } : {}),
    ...(s.table === true ? { table: true } : {}),
    ...(s.guitarAt && typeof s.guitarAt === 'object' && [s.guitarAt.x, s.guitarAt.y, s.guitarAt.z].every((v) => typeof v === 'number' && Number.isFinite(v))
      ? { guitarAt: { x: num(s.guitarAt.x, -0.6, 0.6, 0.1), y: num(s.guitarAt.y, -0.5, 0.4, 0), z: num(s.guitarAt.z, -0.4, 0.8, 0.2) } }
      : {}),
    ...(s.offsetSeeded === true ? { offsetSeeded: true } : {}),
  };
}

function readShelf(v: unknown): Record<string, ShelfCfg> {
  const out: Record<string, ShelfCfg> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (!/^[a-z]{1,12}$/.test(k) || !x || typeof x !== 'object') continue;
    const { scale, sound, oct, key, pieces, frets } = x as { scale?: unknown; sound?: unknown; oct?: unknown; key?: unknown; pieces?: unknown; frets?: unknown };
    if (typeof scale === 'string' && typeof sound === 'string' && scale.length < 16 && sound.length < 16)
      out[k] = { scale, sound, ...(oct === -1 || oct === 1 ? { oct } : {}), ...(typeof key === 'number' && Number.isInteger(key) && key >= 0 && key < 12 ? { key } : {}), ...(pieces === 'small' || pieces === 'full' ? { pieces } : {}), ...(frets === 'easy' || frets === 'real' ? { frets } : {}) };
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
