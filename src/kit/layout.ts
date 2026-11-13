/**
 * Where the pads lie on the table (pure). The default kit is right-handed; a left-handed kit is its
 * mirror; a one-handed kit gathers every pad toward the playing hand's side, a little closer
 * together. A pad the player has moved keeps its own spot (arrangement).
 */
import { MIN_ZONE, PADS, ZONE_SCALE, type Lane } from '../config.js';
import type { Point } from './strike.js';

export type Handed = 'right' | 'left';

export interface LayoutOptions {
  handed: Handed;
  /** One-handed play with this hand (null: both hands). */
  oneHand: Handed | null;
  /** Spots the player chose (kit-local x, z), by lane. */
  moved?: Partial<Record<Lane, { x: number; z: number }>>;
}

export interface PadSpot {
  lane: Lane;
  x: number;
  z: number;
  /** Felt diameter. */
  size: number;
  /** Hit-zone radius. */
  zone: number;
}

/** One-handed kit, for the right hand (mirrored for the left): an arc out from the kick. */
const ONE_HAND: Record<Lane, { x: number; z: number }> = {
  kick: { x: 0.02, z: 0 },
  snare: { x: 0.19, z: -0.02 },
  hat: { x: 0.31, z: 0.08 },
  tom: { x: -0.13, z: 0.08 },
  gong: { x: 0.3, z: -0.16 },
};

export function zoneRadius(size: number): number {
  return Math.max(MIN_ZONE, size * ZONE_SCALE) / 2;
}

/** The spot of one pad in kit-local x/z. */
export function padSpot(lane: Lane, o: LayoutOptions): PadSpot {
  const spec = PADS[lane];
  const moved = o.moved?.[lane];
  let x = spec.x;
  let z = spec.z;
  if (o.oneHand) {
    // an arc around the playing hand: everything within one arm's sweep on that side
    const s = o.oneHand === 'right' ? 1 : -1;
    const a = ONE_HAND[lane];
    x = a.x * s;
    z = a.z;
  } else if (o.handed === 'left') x = -x;
  if (moved) {
    x = moved.x;
    z = moved.z;
  }
  return { lane, x, z, size: spec.size, zone: zoneRadius(spec.size) };
}

/** Every unlocked table pad's spot. */
export function kitLayout(lanes: readonly Lane[], o: LayoutOptions): PadSpot[] {
  return lanes.map((l) => padSpot(l, o));
}

/**
 * Which pad a strike landed on. Every point of the hand that was within 2 cm of the lowest one at
 * contact may claim a pad (the palm on the kick, or a fingertip on the hat); the pad whose zone holds
 * a claiming point most centrally wins (nearest-wins on overlap). Returns the index into `pads`, or -1
 * for the bare table (a miss still knocks: every surface is a drum).
 */
export function pickPad(points: readonly Point[], surfaceY: number, lowH: number, pads: readonly PadSpot[]): number {
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const h = p.y - p.r - surfaceY;
    if (h > lowH + 0.02) continue;
    for (let k = 0; k < pads.length; k++) {
      const pad = pads[k];
      const d = Math.hypot(p.x - pad.x, p.z - pad.z);
      if (d > pad.zone) continue;
      const score = d / pad.zone;
      if (score < bestScore) {
        bestScore = score;
        best = k;
      }
    }
  }
  return best;
}

/** Two pads overlap if their felts come closer than this (PLAN §3.2: at least 4 cm apart). */
export const MIN_GAP = 0.04;

/** Nudge a dragged pad's spot so its felt keeps MIN_GAP from every other pad and stays within reach of the kit centre. */
export function settleSpot(lane: Lane, x: number, z: number, others: readonly PadSpot[], reach = 0.3): { x: number; z: number } {
  const size = PADS[lane].size;
  const r0 = Math.hypot(x, z);
  if (r0 > reach) {
    x *= reach / r0;
    z *= reach / r0;
  }
  const ok = (px: number, pz: number) =>
    Math.hypot(px, pz) <= reach + 1e-9 &&
    others.every((o) => o.lane === lane || Math.hypot(px - o.x, pz - o.z) >= (size + o.size) / 2 + MIN_GAP);
  if (ok(x, z)) return { x, z };
  // the nearest free spot: rings around where it was dropped, 1 cm apart
  for (let ring = 1; ring <= 40; ring++) {
    const rad = ring * 0.01;
    const steps = 8 + ring * 2;
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2;
      const px = x + Math.cos(a) * rad;
      const pz = z + Math.sin(a) * rad;
      if (ok(px, pz)) return { x: px, z: pz };
    }
  }
  return { x, z };
}
