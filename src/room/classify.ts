/**
 * Physics → instrument (pure). A surface's measured shape decides its instrument family, and its size
 * decides the voice within it (PLAN §3.3). No object recognition: the inputs are geometry (orientation,
 * size, height, a volume behind it, curvature, how a hand sinks into it). Quest's room-scan labels
 * (wall, door frame, window frame, storage, couch…) are scene-understanding hints that fill in what
 * geometry alone can't see (glass, a hollow door), and are always overruled by a measurement.
 */

export type Family = 'kit' | 'gong' | 'marimba' | 'tongue' | 'glock' | 'bowl' | 'bell' | 'block' | 'shaker' | 'stomp' | 'keys';

export interface FamilyInfo {
  /** Instrument name as shown (one word). */
  name: string;
  /** Accent colour of its light overlay. */
  color: number;
  /** Plays notes (has pitch zones). */
  melodic: boolean;
  /** Its order in the room map (discovery order of a typical room). */
  order: number;
}

export const FAMILIES: Record<Family, FamilyInfo> = {
  kit: { name: 'drum kit', color: 0xff5a3c, melodic: false, order: 0 },
  gong: { name: 'gong', color: 0xfff1d0, melodic: false, order: 1 },
  marimba: { name: 'marimba', color: 0xffa630, melodic: true, order: 2 },
  glock: { name: 'glockenspiel', color: 0x8fd8ff, melodic: true, order: 3 },
  tongue: { name: 'tongue drum', color: 0x2ad1b5, melodic: true, order: 4 },
  bell: { name: 'bell', color: 0xffd34d, melodic: true, order: 5 },
  bowl: { name: 'singing bowl', color: 0xb28dff, melodic: true, order: 6 },
  shaker: { name: 'shaker', color: 0x7ee07a, melodic: false, order: 7 },
  block: { name: 'wood block', color: 0xff8a3c, melodic: false, order: 8 },
  stomp: { name: 'stomp', color: 0xff4d6a, melodic: false, order: 9 },
  keys: { name: 'table keys', color: 0xffa630, melodic: true, order: 10 },
};

/** What a surface's measurements say. Lengths in metres, all features 0..1. */
export interface Features {
  /** 'up' faces the ceiling (a table top), 'down' faces the floor, 'vertical' is a wall-like face. */
  facing: 'up' | 'down' | 'vertical';
  /** Extent across (horizontal) and along (up the surface for vertical faces; depth for horizontal ones). */
  width: number;
  length: number;
  area: number;
  /** Height of its centre above the floor (m). */
  elevation: number;
  /** A volume or face behind it within 2–60 cm, or a box: it rings hollow. */
  hollow: number;
  /** A pane framed in a wall. */
  glass: number;
  /** The hand sinks in and stops slowly (measured from hits), or a soft-furniture hint. */
  soft: number;
  /** A curved shell (mesh normals spread). */
  curved: number;
  /** A bump standing on a table (a mug, a book), from the room mesh. */
  bump: boolean;
  /** Room-scan label, lower case ('' when none). */
  label: string;
}

export interface Voice {
  family: Family;
  /** Size within the family's range, 0 (small, high) .. 1 (big, low). */
  size: number;
  /** Why (for the debug tag). */
  why: string;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const norm = (x: number, lo: number, hi: number) => clamp01((x - lo) / (hi - lo));

/** The hints a room-scan label gives (only where geometry can't measure it). */
export function labelHints(label: string): Partial<Pick<Features, 'hollow' | 'glass' | 'soft' | 'curved'>> {
  const l = label.toLowerCase();
  if (/window/.test(l)) return { glass: 1 };
  if (/screen|picture|wall art/.test(l)) return { glass: 0.6 };
  if (/door/.test(l)) return { hollow: 0.8 };
  if (/storage|cabinet|cupboard|drawer|shelf/.test(l)) return { hollow: 0.9 };
  if (/couch|sofa|bed|cushion|chair/.test(l)) return { soft: 0.9 };
  if (/lamp|plant/.test(l)) return { curved: 0.7 };
  return {};
}

/**
 * Decide a surface's instrument. `isKitTable` marks the table the kit was placed on (always the kit).
 * Returns null for surfaces that aren't played (ceilings, tiny slivers).
 */
export function classify(f: Features, isKitTable = false): Voice | null {
  const h = { ...f, ...mergeHints(f) };
  if (/invisible/.test(f.label)) return null; // a boundary Quest drew, not a real surface
  if (isKitTable) return { family: 'kit', size: norm(f.area, 0.3, 2), why: 'the table the kit is on' };
  if (f.facing === 'down') return null;
  if (f.area < 0.01 && !f.bump) return null;
  if (f.facing === 'up' && f.elevation < 0.15) return { family: 'stomp', size: 1, why: 'the floor' };
  if (h.soft >= 0.5) return { family: 'shaker', size: norm(f.area, 0.2, 3), why: f.soft >= 0.5 ? 'soft: the hand sinks in' : 'soft furniture (room scan)' };
  if (f.bump) {
    if (h.curved >= 0.5) return { family: 'bowl', size: norm(f.width, 0.08, 0.35), why: 'a curved shell on the table' };
    if (f.length >= f.width * 0.9) return { family: 'bell', size: norm(f.length, 0.06, 0.25), why: 'a small tall bump' };
    return { family: 'block', size: norm(f.area, 0.01, 0.1), why: 'a small flat bump' };
  }
  if (h.glass >= 0.5) return { family: 'glock', size: norm(f.width, 0.3, 2), why: f.glass >= 0.5 ? 'a pane set into a wall' : 'glass (room scan)' };
  if (f.facing === 'up') {
    if (h.hollow >= 0.5) return { family: 'tongue', size: norm(f.area, 0.1, 1), why: 'the top of a hollow box' };
    if (h.curved >= 0.5) return { family: 'bowl', size: norm(f.width, 0.1, 0.6), why: 'a curved top' };
    if (f.area >= 0.25 && f.elevation >= 0.4 && f.elevation <= 1.2) return { family: 'tongue', size: norm(f.area, 0.25, 2), why: 'another table top' };
    return { family: 'block', size: norm(f.area, 0.02, 0.25), why: 'a small solid top' };
  }
  // vertical faces
  if (h.hollow >= 0.5 && f.length >= 1.5 && f.width >= 0.5 && f.width <= 1.8) return { family: 'marimba', size: norm(f.length * f.width, 1, 3.2), why: f.hollow >= 0.5 ? 'door-sized, set into a wall' : 'a door (room scan)' };
  if (h.hollow >= 0.5) return { family: 'tongue', size: norm(f.area, 0.1, 1.5), why: 'a hollow box front' };
  if (h.curved >= 0.5) return { family: 'bowl', size: norm(f.width, 0.1, 0.6), why: 'a curved face' };
  if (f.area >= 0.8) return { family: 'gong', size: norm(f.area, 0.8, 12), why: 'large and solid' };
  return { family: 'block', size: norm(f.area, 0.05, 0.8), why: 'small and solid' };
}

function mergeHints(f: Features): Pick<Features, 'hollow' | 'glass' | 'soft' | 'curved'> {
  const hint = labelHints(f.label);
  // a measurement always wins; a hint only raises what wasn't measured
  return {
    hollow: Math.max(f.hollow, hint.hollow ?? 0),
    glass: Math.max(f.glass, hint.glass ?? 0),
    soft: Math.max(f.soft, hint.soft ?? 0),
    curved: Math.max(f.curved, hint.curved ?? 0),
  };
}

/** Families that can stand in for each other when a song needs one you haven't found. */
export const NEIGHBOURS: Record<Family, Family[]> = {
  marimba: ['glock', 'tongue', 'bell', 'bowl', 'keys'],
  glock: ['bell', 'marimba', 'bowl', 'tongue', 'keys'],
  tongue: ['marimba', 'bowl', 'glock', 'keys'],
  bowl: ['bell', 'glock', 'tongue', 'keys'],
  bell: ['glock', 'bowl', 'marimba', 'keys'],
  gong: ['stomp', 'tongue', 'kit'],
  stomp: ['gong', 'kit'],
  shaker: ['block', 'kit'],
  block: ['shaker', 'kit'],
  kit: [],
  keys: [],
};
