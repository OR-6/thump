/**
 * What the kit holds at each point of the journey (pure). Every unlock is physical: the new pad
 * slides onto the table and asks for one hit (PLAN §3.6). The first steps (before song 1) teach
 * the kick, the snare and the hat by copying; the crowd arrives with the hat.
 */
import type { Lane } from '../config.js';
import { SONGS } from '../songs/songs.js';

export type Unlock = 'tom' | 'gong' | 'bandmate' | 'arrange' | 'phone';

/** Unlocked by finishing each song (any stars). */
export const UNLOCK_AFTER: Record<string, Unlock[]> = {
  'porch-step': ['tom'],
  'kitchen-clock': ['gong', 'bandmate'],
  'call-and-answer': ['arrange', 'phone'],
  'two-hands': [],
  'big-room': [],
  'night-bus': [],
};

/** Pads the first steps teach, in order. */
export const FIRST_LANES: readonly Lane[] = ['kick', 'snare', 'hat'];

/** Every unlock earned before song `i` begins. */
export function unlocksBefore(i: number): Set<Unlock> {
  const out = new Set<Unlock>();
  for (let k = 0; k < Math.min(i, SONGS.length); k++) for (const u of UNLOCK_AFTER[SONGS[k].id] ?? []) out.add(u);
  return out;
}

/** The pads on the table when song `i` begins. */
export function lanesBefore(i: number): Lane[] {
  const u = unlocksBefore(i);
  const lanes: Lane[] = [...FIRST_LANES];
  if (u.has('tom')) lanes.push('tom');
  if (u.has('gong')) lanes.push('gong');
  return lanes;
}

/** Pads unlocked given a set of unlocks. */
export function lanesFor(u: ReadonlySet<Unlock>): Lane[] {
  const lanes: Lane[] = [...FIRST_LANES];
  if (u.has('tom')) lanes.push('tom');
  if (u.has('gong')) lanes.push('gong');
  return lanes;
}
