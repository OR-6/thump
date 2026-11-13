/**
 * Single source of truth for Thump's geometry and tuning. Units: metres and seconds.
 *
 * Kit-local axes: origin on the real table top at the kit's centre, +X to the player's right,
 * +Y up from the table, +Z toward the player. Every number a device session may want to change
 * lives here (docs/DEVICE-SESSION.md names them).
 */

export type Lane = 'kick' | 'snare' | 'hat' | 'tom' | 'gong';
export const LANES: readonly Lane[] = ['kick', 'snare', 'hat', 'tom', 'gong'];

export interface PadSpec {
  lane: Lane;
  /** Felt diameter (m). The hit zone is ZONE_SCALE larger. */
  size: number;
  /** Default spot, right-handed (mirrored in x for a left-handed or one-handed-left kit). */
  x: number;
  z: number;
  color: number;
  /** Shape cue (kept in high contrast): what sets the pad apart besides its colour. */
  mark: 'none' | 'stripe' | 'notch' | 'ring' | 'brass';
}

/** Accent colours. */
export const PALETTE = {
  tomato: 0xe2563b,
  mustard: 0xf2b632,
  teal: 0x2a9d8f,
  navy: 0x3d5a80,
  plum: 0x7b5bb8,
  cream: 0xfff1d6,
  brass: 0xc9a14a,
  walnut: 0x6b3e26,
} as const;

/**
 * The kit as it lies on the table (PLAN §4: kick and snare side by side nearest the hands' natural
 * landing, hat out right and a little nearer, tom out left). z = 0 is where the palm rested.
 */
export const PADS: Record<Lane, PadSpec> = {
  kick: { lane: 'kick', size: 0.14, x: -0.09, z: 0, color: PALETTE.tomato, mark: 'none' },
  snare: { lane: 'snare', size: 0.12, x: 0.09, z: 0, color: PALETTE.mustard, mark: 'stripe' },
  hat: { lane: 'hat', size: 0.09, x: 0.235, z: 0.06, color: PALETTE.teal, mark: 'notch' },
  tom: { lane: 'tom', size: 0.11, x: -0.245, z: 0.06, color: PALETTE.plum, mark: 'ring' },
  // the gong goes on a real wall within reach when there is one; this is the table-edge fallback
  gong: { lane: 'gong', size: 0.16, x: 0.36, z: -0.1, color: PALETTE.brass, mark: 'brass' },
};

/** Hit zones are this much larger than the felt (fingertips land wide at speed). */
export const ZONE_SCALE = 1.2;
/** Zones never shrink below this diameter (PLAN §3.2). */
export const MIN_ZONE = 0.09;

/** Strike detection (PLAN §3.2). Tuned on the device: see docs/DEVICE-SESSION.md. */
export const STRIKE = {
  /** A strike at this approach speed or more (m/s). */
  minSpeed: 0.35,
  /** Near the surface, a stop this sharp counts too (m/s², the drop in approach speed per second). */
  minDecel: 12,
  /** "Near the surface": the lowest point within this height of it (tracking loses the last centimetre). */
  nearM: 0.018,
  /** One slap is one hit: a hand cannot hit the same surface again for this long. */
  latchS: 0.12,
  /** After a hit, the hand must lift this far before it can hit again (a natural rebound is 1–3 cm). */
  rearmM: 0.022,
  /** A hand resting on the surface must lift this far before it plays. */
  restLiftM: 0.025,
  /** A hand just found by tracking does nothing for this long (its first frames jump). */
  freshS: 0.15,
  /** Tracking lost for up to this long keeps the hand's state (fast slaps blur the cameras). */
  dropoutS: 0.12,
  /** The motion must be mostly toward the surface: approach speed at least this share of the sideways speed. */
  downShare: 0.6,
  /** The learned surface may drift this far from its estimate (m). */
  surfaceDriftM: 0.03,
  /** How fast the learned surface follows observed contacts (0..1 per contact). */
  surfaceLearn: 0.25,
  /** The speed of a hard slap (full loudness), m/s. */
  hardSpeed: 1.4,
  /** Two hands on one pad within this long are one note (played once, at the louder of the two). */
  flamS: 0.025,
} as const;

/** Song timing (PLAN §3.2, §4). */
export const TIMING = {
  perfectS: 0.06,
  goodS: 0.12,
  /** Slow mode widens the windows by this. */
  slowWiden: 1.5,
  /** Stars: share of notes good or better. */
  twoStars: 0.7,
  threeStars: 0.9,
  /** Look-ahead for scheduling the backing (s). */
  lookAheadS: 0.12,
  /** A travelling note appears this many beats before it is due. */
  travelBeats: 2,
  /** A pad glows this many beats before its note. */
  glowBeats: 1,
} as const;

/** Placement (PLAN §3.1). */
export const PLACE = {
  /** Kit centre this far ahead of the head (horizontal) when nothing better is known. */
  forward: 0.34,
  /** A palm-placed kit centre is clamped to this band ahead of the head. */
  minForward: 0.26,
  maxForward: 0.42,
  /** and this far either side of straight ahead. */
  maxLateral: 0.1,
  defaultDrop: 0.45,
  stillSeconds: 0.8,
  stillRadiusM: 0.012,
  flatDot: 0.75,
  planeSnapM: 0.05,
  /** A table is 25–62 cm below seated eyes (85 cm if a detected plane under the palm agrees). */
  minDrop: 0.25,
  maxDrop: 0.62,
  maxDropWithPlane: 0.85,
  /** No hands at all: a default height after this long. */
  noHandTimeoutS: 8,
  /** Hands seen but no flat palm: a default height after this long. */
  palmTimeoutS: 15,
  /** A table plane found straight ahead places the kit at once (after this long for planes to arrive). */
  planeWaitS: 0.6,
  /** Default-height nudge arrows: 2 cm a poke. */
  nudgeStep: 0.02,
} as const;

/** Pinch / grab tuning (scaled by calibration multiplier). */
export const PINCH = {
  engageM: 0.02,
  releaseM: 0.035,
  grabRadiusM: 0.03,
  hoverRadiusM: 0.035,
  trackingLossS: 0.15,
  oneEuro: { minCutoff: 1.5, beta: 4, dCutoff: 1.0 },
} as const;

/** Poke tuning (felt cards, the move plate, nudge arrows). */
export const POKE = {
  radiusM: 0.02,
  minDownSpeed: 0.12,
  rearmM: 0.03,
} as const;

/** The crowd at the back of the table (PLAN §3.4). */
export const CROWD = {
  z: -0.25,
  start: 3,
  max: 12,
  spacing: 0.058,
} as const;

/** Seated reach limit (the airplane seat test: everything within 2 ft of the player). */
export const MAX_REACH_M = 0.61;
