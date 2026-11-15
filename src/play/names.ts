/**
 * Names on the world's boards: yours when you play alone ("Velvet Snare"), and your band's when you play together
 * ("The Midnight Coffee Rings"). Each is two words from these lists, kept as their places in them, shuffled one word
 * at a time on the name page: no typing in the headset, and nothing rude or personal can reach a public board. Forty
 * of each: 1,600 names apiece, so two people rarely share one. Every name fits in 32 letters.
 */

export const ADJECTIVES = [
  'Velvet', 'Midnight', 'Quiet', 'Loud', 'Golden', 'Electric', 'Neon', 'Rusty', 'Lucky', 'Sleepy',
  'Wild', 'Gentle', 'Brave', 'Cosmic', 'Copper', 'Silver', 'Crimson', 'Indigo', 'Amber', 'Hollow',
  'Sunny', 'Rainy', 'Late', 'Early', 'Tiny', 'Mighty', 'Restless', 'Steady', 'Groovy', 'Fuzzy',
  'Polished', 'Wandering', 'Humming', 'Secret', 'Northern', 'Southern', 'Lazy', 'Swift', 'Patient', 'Bright',
] as const;

/** Yours: what you are when you play. */
export const PLAYERS = [
  'Snare', 'Thunder', 'Groove', 'Echo', 'Metronome', 'Cymbal', 'Drummer', 'Pianist', 'Strummer', 'Tempo',
  'Rhythm', 'Backbeat', 'Downbeat', 'Encore', 'Riff', 'Chord', 'Melody', 'Harmony', 'Mallet', 'Drumstick',
  'Bassline', 'Crescendo', 'Solo', 'Duet', 'Keys', 'Strings', 'Rimshot', 'Shuffle', 'Swing', 'Waltz',
  'Ballad', 'Busker', 'Conductor', 'Composer', 'Soloist', 'Virtuoso', 'Stomp', 'Clap', 'Beat', 'Tune',
] as const;

/** A band's: the things on a desk (or a tray table) it was born on. */
export const BANDS = [
  'Coffee Rings', 'Paper Clips', 'Desk Lamps', 'Sticky Notes', 'Late Shifts', 'Tray Tables', 'Window Seats', 'Overheads', 'Seatbelts', 'Second Drawers',
  'Highlighters', 'Staplers', 'Spreadsheets', 'Deadlines', 'Mugs', 'Keyboards', 'Office Plants', 'Rubber Bands', 'Swivel Chairs', 'Notebooks',
  'Pencils', 'Erasers', 'Headphones', 'Monitors', 'Tea Bags', 'Biscuits', 'Lanyards', 'Paper Planes', 'Rulers', 'Calculators',
  'Cables', 'Coasters', 'Bookends', 'Clipboards', 'Desk Fans', 'Inkwells', 'Thumbtacks', 'Index Cards', 'Night Owls', 'Early Birds',
] as const;

/** Two words' places in their lists. */
export type Words = readonly [number, number];

const at = <T extends readonly string[]>(list: T, i: number) => list[((Math.floor(i) % list.length) + list.length) % list.length];

export function playerName(w: Words): string {
  return `${at(ADJECTIVES, w[0])} ${at(PLAYERS, w[1])}`;
}
export function bandName(w: Words): string {
  return `The ${at(ADJECTIVES, w[0])} ${at(BANDS, w[1])}`;
}

/** Two words at random (`r` for tests). */
export function randomWords(r: () => number = Math.random): [number, number] {
  return [Math.floor(r() * ADJECTIVES.length), Math.floor(r() * PLAYERS.length)];
}

/** One word of the two changed for another (never the same one again). */
export function shuffleWord(w: Words, which: 0 | 1, r: () => number = Math.random, n = which === 0 ? ADJECTIVES.length : PLAYERS.length): [number, number] {
  const out: [number, number] = [w[0], w[1]];
  out[which] = (w[which] + 1 + Math.floor(r() * (n - 1))) % n;
  return out;
}

/** Valid words from storage (else null). */
export function readWords(v: unknown): [number, number] | null {
  return Array.isArray(v) && v.length === 2 && v.every((x) => Number.isInteger(x) && x >= 0 && x < 40) ? [v[0], v[1]] : null;
}
