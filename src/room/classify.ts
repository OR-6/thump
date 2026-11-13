/**
 * Physics → instrument (pure). A surface's measured shape decides its instrument family, and its size
 * decides the voice within it (DESIGN.md §3.3). No object recognition: the inputs are geometry (orientation,
 * size, height, a volume behind it, curvature, how a hand sinks into it). Quest's room-scan labels
 * (wall, door frame, window frame, storage, couch…) are scene-understanding hints that fill in what
 * geometry alone can't see (glass, a hollow door), and are always overruled by a measurement.
 */

export type Family =
  | 'kit'
  | 'gong'
  | 'timpani'
  | 'frame'
  | 'marimba'
  | 'xylophone'
  | 'glock'
  | 'harp'
  | 'tubular'
  | 'tongue'
  | 'slit'
  | 'bowl'
  | 'bell'
  | 'triangle'
  | 'block'
  | 'congas'
  | 'cajon'
  | 'shaker'
  | 'tambourine'
  | 'stomp'
  | 'keys';

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
  gong: { name: 'gong', color: 0xe8a44a, melodic: false, order: 1 },
  timpani: { name: 'timpani', color: 0xd4703a, melodic: true, order: 2 },
  frame: { name: 'frame drum', color: 0xc9a27a, melodic: false, order: 3 },
  marimba: { name: 'marimba', color: 0xffc14d, melodic: true, order: 4 },
  xylophone: { name: 'xylophone', color: 0xfff07a, melodic: true, order: 5 },
  glock: { name: 'glockenspiel', color: 0x8fd8ff, melodic: true, order: 6 },
  harp: { name: 'harp', color: 0x6fa8ff, melodic: true, order: 7 },
  tubular: { name: 'tubular bells', color: 0xb8c4ff, melodic: true, order: 8 },
  tongue: { name: 'kalimba', color: 0x2ad1b5, melodic: true, order: 9 },
  slit: { name: 'slit drum', color: 0x5fbf8f, melodic: false, order: 10 },
  bowl: { name: 'vibraphone', color: 0xb28dff, melodic: true, order: 11 },
  bell: { name: 'chimes', color: 0x9ef0e0, melodic: true, order: 12 },
  triangle: { name: 'triangle', color: 0xe6f6ff, melodic: false, order: 13 },
  block: { name: 'wood block', color: 0xff8a3c, melodic: false, order: 14 },
  congas: { name: 'congas', color: 0xff7aa2, melodic: false, order: 15 },
  cajon: { name: 'cajón', color: 0xd9608a, melodic: false, order: 16 },
  shaker: { name: 'shaker', color: 0x7ee07a, melodic: false, order: 17 },
  tambourine: { name: 'tambourine', color: 0xc2f06a, melodic: false, order: 18 },
  stomp: { name: 'bass drum', color: 0xff4d6a, melodic: false, order: 19 },
  keys: { name: 'balafon', color: 0xffa630, melodic: true, order: 20 },
};

/** "a marimba", "an …", or just "timpani" (said the way a player would). */
export function withArticle(f: Family): string {
  const name = FAMILIES[f].name;
  if (f === 'timpani' || f === 'tubular' || f === 'bell' || f === 'congas') return name;
  return `${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name}`;
}

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
  if (/chair|stool/.test(f.label)) return { family: 'cajon', size: norm(f.area, 0.1, 0.4), why: 'a seat (you sit on a cajón)' };
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
    if (f.area >= 0.25 && f.elevation >= 0.4 && f.elevation <= 1.2) return { family: 'congas', size: norm(f.area, 0.25, 2), why: 'another table top: hand drums' };
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
  marimba: ['xylophone', 'harp', 'tubular', 'bowl', 'glock', 'tongue', 'slit'],
  xylophone: ['marimba', 'glock', 'harp', 'bowl', 'tongue'],
  glock: ['harp', 'triangle', 'bell', 'tubular', 'bowl', 'xylophone', 'marimba'],
  harp: ['glock', 'marimba', 'bowl', 'tongue', 'xylophone'],
  tubular: ['bell', 'bowl', 'glock', 'gong'],
  tongue: ['slit', 'cajon', 'xylophone', 'marimba', 'bowl', 'congas'],
  slit: ['tongue', 'block', 'cajon', 'congas'],
  bowl: ['bell', 'tubular', 'glock', 'harp', 'tongue', 'triangle'],
  bell: ['bowl', 'triangle', 'glock', 'tubular'],
  triangle: ['bell', 'glock', 'tambourine'],
  gong: ['timpani', 'frame', 'tubular', 'stomp'],
  timpani: ['gong', 'frame', 'stomp'],
  frame: ['timpani', 'gong', 'congas', 'cajon'],
  stomp: ['timpani', 'frame', 'cajon', 'gong'],
  congas: ['cajon', 'frame', 'slit', 'tongue', 'marimba', 'xylophone', 'block'],
  cajon: ['congas', 'frame', 'slit', 'block'],
  shaker: ['tambourine', 'congas', 'cajon', 'block'],
  tambourine: ['shaker', 'triangle', 'congas'],
  block: ['slit', 'congas', 'cajon', 'triangle', 'tambourine', 'shaker'],
  kit: [],
  keys: ['marimba', 'xylophone', 'bowl', 'tongue', 'harp', 'glock'],
};

/** What a surface can be swapped to: what its physics says first, then the neighbours that suit it (never the kit or the desk keys). */
export function swapsFor(natural: Family): Family[] {
  return [natural, ...NEIGHBOURS[natural].filter((f) => f !== 'kit' && f !== 'keys')];
}

/** The next instrument in a surface's swap cycle (back to its own after the last). */
export function nextSwap(natural: Family, current: Family): Family {
  const l = swapsFor(natural);
  return l[(l.indexOf(current) + 1) % l.length];
}


/**
 * An orchestra, not a row of the same instrument: surfaces whose physics say the same thing get the instruments
 * that suit it in turn (the biggest wall a gong, the next a timpani, then a frame drum…). Pure: give it the room's
 * undiscovered surfaces; it returns the instrument each should play. Deterministic (by size, then id), so a room
 * plays the same way every visit.
 */
export function orchestrate(surfaces: readonly { id: string; natural: Family; area: number }[], taken: Iterable<Family> = []): Map<string, Family> {
  const out = new Map<string, Family>();
  const used = new Map<Family, number>();
  for (const f of taken) used.set(f, (used.get(f) ?? 0) + 1);
  const sorted = [...surfaces].sort((a, b) => b.area - a.area || (a.id < b.id ? -1 : 1));
  for (const s of sorted) {
    const options = swapsFor(s.natural);
    // the first option nobody plays yet, else the least played (ties: physics' own order)
    let best = options[0];
    let bestN = Infinity;
    for (const f of options) {
      const n = used.get(f) ?? 0;
      if (n < bestN) {
        bestN = n;
        best = f;
      }
      if (n === 0) break;
    }
    used.set(best, (used.get(best) ?? 0) + 1);
    out.set(s.id, best);
  }
  return out;
}
