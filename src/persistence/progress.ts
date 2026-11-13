/**
 * What the player has earned and where their kit is, saved locally (DESIGN.md §3.6, §3.12).
 * Every field is validated on load: a corrupt or old save falls back field by field, never whole.
 */
import { LANES, type Lane } from '../config.js';
import { load, save } from './storage.js';
import type { Unlock } from '../play/game.js';

const UNLOCKS: readonly Unlock[] = ['tom', 'jam', 'loops', 'swaps'];

export interface SavedKit {
  /** IWSDK's persistent room-anchor handle the pose is relative to. */
  uuid: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/** An instrument found in a room, saved relative to that room's persistent anchor. */
export interface SavedInstrument {
  family: string;
  /** Where its zones were centred (anchor-local metres). */
  x: number;
  y: number;
  z: number;
}

export interface Progress {
  /** The first steps (kick, snare, hat, the crowd) are done. */
  introDone: boolean;
  unlocks: Unlock[];
  /** Best stars per song id (1–3). */
  stars: Record<string, number>;
  /** 3 stars at full tempo: the gold felt ribbon. */
  gold: Record<string, boolean>;
  /** Index of the next song to play in order. */
  next: number;
  /** The crowd remembers its size between sessions. */
  crowd: number;
  /** Pads the player moved (kit-local). */
  moved: Partial<Record<Lane, { x: number; z: number }>>;
  /** Days a song was played (yyyy-mm-dd), for the tally (never a streak to lose). */
  days: string[];
  kit?: SavedKit;
  /** Instruments found per room (keyed by the room anchor's handle); the kit counts as 'kit'. */
  rooms: Record<string, SavedInstrument[]>;
  /** The bandmate's level (how busy its calls get), kept between jams; unset until the first jam. */
  bandLevel?: number;
}

const KEY = 'progress.v1';

export function freshProgress(): Progress {
  return { introDone: false, unlocks: [], stars: {}, gold: {}, next: 0, crowd: 3, moved: {}, days: [], rooms: {} };
}

export function loadProgress(): Progress {
  const raw = load<unknown>(KEY, {});
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const p = freshProgress();
  p.introDone = r.introDone === true;
  if (Array.isArray(r.unlocks)) p.unlocks = r.unlocks.filter((u): u is Unlock => UNLOCKS.includes(u as Unlock));
  p.stars = numRecord(r.stars, 1, 3);
  if (r.gold && typeof r.gold === 'object') for (const [k, v] of Object.entries(r.gold)) if (v === true) p.gold[k] = true;
  if (typeof r.next === 'number' && Number.isInteger(r.next) && r.next >= 0 && r.next < 100) p.next = r.next;
  if (typeof r.crowd === 'number' && r.crowd >= 3 && r.crowd <= 12) p.crowd = Math.round(r.crowd);
  if (r.moved && typeof r.moved === 'object') {
    for (const [lane, v] of Object.entries(r.moved as Record<string, unknown>)) {
      const xz = v as { x?: unknown; z?: unknown };
      if (LANES.includes(lane as Lane) && typeof xz?.x === 'number' && typeof xz?.z === 'number' && Math.hypot(xz.x, xz.z) < 0.5) p.moved[lane as Lane] = { x: xz.x, z: xz.z };
    }
  }
  if (Array.isArray(r.days)) p.days = r.days.filter((d): d is string => typeof d === 'string' && /^\d{4}-\d\d-\d\d$/.test(d)).slice(-400);
  const k = r.kit as SavedKit | undefined;
  if (k && typeof k.uuid === 'string' && [k.x, k.y, k.z, k.yaw].every((n) => typeof n === 'number' && Number.isFinite(n))) p.kit = { uuid: k.uuid, x: k.x, y: k.y, z: k.z, yaw: k.yaw };
  if (typeof r.bandLevel === 'number' && r.bandLevel >= 0 && r.bandLevel <= 3) p.bandLevel = Math.round(r.bandLevel);
  if (r.rooms && typeof r.rooms === 'object') {
    for (const [uuid, list] of Object.entries(r.rooms as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue;
      const ok = list.filter((i): i is SavedInstrument => !!i && typeof i.family === 'string' && [i.x, i.y, i.z].every((n: unknown) => typeof n === 'number' && Number.isFinite(n))).slice(-40);
      if (ok.length) p.rooms[uuid.slice(0, 80)] = ok;
    }
  }
  if (!p.introDone) {
    // an interrupted first session starts the first steps again (they take a minute)
    p.unlocks = [];
    p.next = 0;
  }
  return p;
}

export function saveProgress(p: Progress): void {
  // the rooms you played in most recently (eight at most)
  const ids = Object.keys(p.rooms);
  if (ids.length > 8) for (const id of ids.slice(0, ids.length - 8)) delete p.rooms[id];
  save(KEY, p);
}

function numRecord(v: unknown, lo: number, hi: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) if (typeof n === 'number' && n >= lo && n <= hi) out[k] = Math.round(n);
  return out;
}

/** Local calendar day, yyyy-mm-dd. */
export function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
