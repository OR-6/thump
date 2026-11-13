/**
 * The sound bank: every sound any object can play, in the order ◀ ▶ steps through them. Drum kit pieces, hand
 * percussion, bells and mallets, keys. Any sound on any object: your mug can be a kick if you want it to be.
 */
import type { Lane } from '../config.js';
import type { Family } from '../room/classify.js';

export interface Sound {
  id: string;
  /** One word on the module and the tag. */
  name: string;
  /** A kit piece (played by the drum voice) or an instrument family (recorded clips, re-pitched). */
  drum?: Lane | 'rim' | 'open';
  family?: Family;
  /** Has notes (a pad of it plays in key). */
  pitched: boolean;
  color: number;
}

export const BANK: readonly Sound[] = [
  { id: 'kick', name: 'Kick', drum: 'kick', pitched: false, color: 0xff5a3c },
  { id: 'snare', name: 'Snare', drum: 'snare', pitched: false, color: 0xf4f1ea },
  { id: 'hat', name: 'Hat', drum: 'hat', pitched: false, color: 0x2ad1d1 },
  { id: 'tom', name: 'Tom', drum: 'tom', pitched: false, color: 0xffa630 },
  { id: 'rim', name: 'Rim', drum: 'rim', pitched: false, color: 0xd9d4c7 },
  { id: 'clap', name: 'Clap', family: 'clap', pitched: false, color: 0xff9e7a },
  { id: 'cowbell', name: 'Cowbell', family: 'cowbell', pitched: false, color: 0xe0b85a },
  { id: 'clave', name: 'Clave', family: 'clave', pitched: false, color: 0xd99a5b },
  { id: 'block', name: 'Block', family: 'block', pitched: false, color: 0xff8a3c },
  { id: 'slit', name: 'Slit drum', family: 'slit', pitched: false, color: 0x5fbf8f },
  { id: 'ride', name: 'Ride', family: 'ride', pitched: false, color: 0xd6e2ea },
  { id: 'shaker', name: 'Shaker', family: 'shaker', pitched: false, color: 0x7ee07a },
  { id: 'tambourine', name: 'Tambourine', family: 'tambourine', pitched: false, color: 0xc2f06a },
  { id: 'triangle', name: 'Triangle', family: 'triangle', pitched: false, color: 0xe6f6ff },
  { id: 'congas', name: 'Congas', family: 'congas', pitched: false, color: 0xff7aa2 },
  { id: 'cajon', name: 'Cajón', family: 'cajon', pitched: false, color: 0xd9608a },
  { id: 'frame', name: 'Frame drum', family: 'frame', pitched: false, color: 0xc9a27a },
  { id: 'bell', name: 'Bell', family: 'bell', pitched: true, color: 0x9ef0e0 },
  { id: 'chime', name: 'Chime', family: 'tubular', pitched: true, color: 0xb8c4ff },
  { id: 'glock', name: 'Glock', family: 'glock', pitched: true, color: 0x8fd8ff },
  { id: 'kalimba', name: 'Kalimba', family: 'tongue', pitched: true, color: 0x2ad1b5 },
  { id: 'marimba', name: 'Marimba', family: 'marimba', pitched: true, color: 0xffc14d },
  { id: 'xylo', name: 'Xylo', family: 'xylophone', pitched: true, color: 0xfff07a },
  { id: 'vibes', name: 'Vibes', family: 'bowl', pitched: true, color: 0xb28dff },
  { id: 'keys', name: 'Keys', family: 'keys', pitched: true, color: 0xffa630 },
  { id: 'harp', name: 'Harp', family: 'harp', pitched: true, color: 0x6fa8ff },
  { id: 'timpani', name: 'Timpani', family: 'timpani', pitched: true, color: 0xd4703a },
  { id: 'gong', name: 'Gong', family: 'gong', pitched: false, color: 0xe8a44a },
];

export function soundById(id: string | null | undefined): Sound | undefined {
  return id ? BANK.find((s) => s.id === id) : undefined;
}

/** The sound a family plays by default (what physics picked), as a bank id. */
export function soundOfFamily(f: Family): string {
  return BANK.find((s) => s.family === f)?.id ?? 'block';
}

/** One step through the bank from `id` (wrapping). */
export function stepSound(id: string, dir: 1 | -1): string {
  const i = BANK.findIndex((s) => s.id === id);
  const n = BANK.length;
  return BANK[(((i < 0 ? 0 : i) + dir) % n + n) % n].id;
}
