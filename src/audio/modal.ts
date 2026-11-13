/**
 * Modal voices (data): every melodic or tuned instrument is a handful of decaying partials (a ratio to
 * the fundamental, a level, a decay time) struck by a short filtered noise burst (DESIGN.md §3.4). A harder
 * hit brings up the upper partials and the strike noise; a bigger surface rings lower and longer.
 */
import type { Family } from '../room/classify.js';

export interface Mode {
  ratio: number;
  amp: number;
  /** Seconds to fall 60 dB-ish (exponential ramp end). */
  decay: number;
  /** Detuned twin (Hz) for beating partials (bowls, gongs); 0 for none. */
  beat?: number;
}

export interface ModalPreset {
  modes: Mode[];
  /** The strike: a burst of filtered noise. */
  noise: { type: BiquadFilterType; freq: number; q: number; dur: number; amp: number };
  /** Seconds to reach full level (a gong blooms). */
  attack: number;
  /** A lowpass over the body (Hz), or 0 for none (a tongue drum's hollow formant). */
  lowpass: number;
  /** Send to the room reverb. */
  wet: number;
  /** Seconds between one mode's onset and the next (a gong's shimmer swells in); 0 for all at once. */
  stagger?: number;
  /** Cents the fundamental sags over its ring (a gong). */
  sag?: number;
  level: number;
}

export const MODAL: Partial<Record<Family, ModalPreset>> = {
  marimba: {
    modes: [
      { ratio: 1, amp: 1, decay: 0.55 },
      { ratio: 3.93, amp: 0.28, decay: 0.16 },
      { ratio: 9.2, amp: 0.08, decay: 0.06 },
    ],
    noise: { type: 'bandpass', freq: 2600, q: 1.2, dur: 0.008, amp: 0.18 },
    attack: 0.002,
    lowpass: 0,
    wet: 1,
    level: 0.55,
  },
  keys: {
    modes: [
      { ratio: 1, amp: 1, decay: 0.45 },
      { ratio: 3.93, amp: 0.3, decay: 0.14 },
      { ratio: 9.2, amp: 0.1, decay: 0.05 },
    ],
    noise: { type: 'bandpass', freq: 3000, q: 1.2, dur: 0.006, amp: 0.15 },
    attack: 0.002,
    lowpass: 0,
    wet: 1,
    level: 0.5,
  },
  glock: {
    modes: [
      { ratio: 1, amp: 1, decay: 1.6 },
      { ratio: 2.76, amp: 0.32, decay: 0.7 },
      { ratio: 5.4, amp: 0.16, decay: 0.3 },
      { ratio: 8.93, amp: 0.07, decay: 0.15 },
    ],
    noise: { type: 'highpass', freq: 6000, q: 0.7, dur: 0.004, amp: 0.12 },
    attack: 0.001,
    lowpass: 0,
    wet: 1.6,
    level: 0.32,
  },
  gong: {
    modes: [
      { ratio: 1, amp: 0.9, decay: 3.4, beat: 0.6 },
      { ratio: 1.52, amp: 0.55, decay: 2.8, beat: 0.9 },
      { ratio: 2.0, amp: 0.4, decay: 2.4 },
      { ratio: 2.41, amp: 0.38, decay: 2.1, beat: 1.3 },
      { ratio: 2.93, amp: 0.25, decay: 1.6 },
      { ratio: 3.9, amp: 0.2, decay: 1.3, beat: 1.7 },
      { ratio: 5.1, amp: 0.12, decay: 0.9 },
    ],
    noise: { type: 'bandpass', freq: 1400, q: 0.8, dur: 0.05, amp: 0.2 },
    attack: 0.025,
    stagger: 0.11,
    sag: -20,
    lowpass: 0,
    wet: 3,
    level: 0.5,
  },
  tongue: {
    modes: [
      { ratio: 1, amp: 1, decay: 1.0 },
      { ratio: 2.0, amp: 0.3, decay: 0.4 },
      { ratio: 3.01, amp: 0.12, decay: 0.2 },
    ],
    noise: { type: 'lowpass', freq: 900, q: 0.8, dur: 0.015, amp: 0.25 },
    attack: 0.003,
    lowpass: 1900,
    wet: 1.4,
    level: 0.6,
  },
  bowl: {
    modes: [
      { ratio: 1, amp: 0.8, decay: 4.2, beat: 1.4 },
      { ratio: 2.71, amp: 0.32, decay: 2.4, beat: 2.2 },
      { ratio: 5.13, amp: 0.1, decay: 1.2 },
    ],
    noise: { type: 'bandpass', freq: 2000, q: 1, dur: 0.01, amp: 0.08 },
    attack: 0.015,
    lowpass: 0,
    wet: 2,
    level: 0.42,
  },
  bell: {
    modes: [
      { ratio: 1, amp: 1, decay: 1.5 },
      { ratio: 2.0, amp: 0.5, decay: 1.0 },
      { ratio: 2.4, amp: 0.32, decay: 0.75 },
      { ratio: 3.0, amp: 0.2, decay: 0.5 },
      { ratio: 4.2, amp: 0.1, decay: 0.3 },
    ],
    noise: { type: 'highpass', freq: 5000, q: 0.7, dur: 0.004, amp: 0.1 },
    attack: 0.001,
    lowpass: 0,
    wet: 1.6,
    level: 0.32,
  },
  block: {
    modes: [
      { ratio: 1, amp: 1, decay: 0.07 },
      { ratio: 2.6, amp: 0.4, decay: 0.035 },
    ],
    noise: { type: 'bandpass', freq: 2200, q: 1.5, dur: 0.006, amp: 0.25 },
    attack: 0.001,
    lowpass: 0,
    wet: 0.6,
    level: 0.6,
  },
};
