/**
 * Calm motion (accessibility): less confetti, smaller hops and bounces, no drifting
 * light. On when the player turns it on in the settings, or by default when their
 * system asks for reduced motion. Read by the effects each frame (one shared flag).
 */
export const motion = {
  calm: false,
  /** Scale for an amplitude: 1 normally, small when calm. */
  get k(): number {
    return this.calm ? 0.35 : 1;
  },
};

/** The system's reduced-motion preference (false when it can't be read). */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
