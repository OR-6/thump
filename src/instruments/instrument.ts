/**
 * What every instrument on the desk is (docs/GAME-V3.md): a model in kit-local space that unfolds when it's picked,
 * the places on it your hands play (zones, in kit-local zone coordinates: x right, z away from you), how a hit on
 * each sounds, and how it shows a song's note coming to one of them. The drums, the keys, the marimba, the guitar
 * and the handpan all sit behind this one shape, so the stand, free mode, songs and the band treat them alike.
 */
import type { Group } from '@iwsdk/core';
import type { Zone } from '../room/zones.js';

export type InstrumentId = 'drums' | 'piano' | 'marimba' | 'guitar' | 'handpan';

/** How the player plays it: hit (drums, bars, fields), press (keys), strum (strings). */
export type Gesture = 'hit' | 'press' | 'strum';

/** Easy folds it to the song's key and makes it big; Pro shows all of it. */
export type Layout = 'easy' | 'pro';

export interface Instrument {
  readonly id: InstrumentId;
  /** One word, on the stand and the module. */
  readonly name: string;
  readonly gesture: Gesture;
  /** Its model, added under the kit's root (kit-local: origin on the desk, +Y up, −Z away from you). */
  readonly root: Group;
  /** Where it's played, laid out for the current notes and layout. */
  zones(): readonly Zone[];
  /** Lay it out for `root` (MIDI of its lowest note), a scale (semitones), and a layout. */
  layout(root: number, scale: readonly number[], mode: Layout): void;
  /** Show it: it unfolds onto the desk over about half a second. */
  unfold(): void;
  /** Put it away (it folds back). */
  fold(): void;
  /** A hit on zone `i` at loudness 0..1: the model moves (a head ripples, a key sinks, a bar bounces). */
  struck(i: number, gain: number): void;
  /** A song note is coming to zone `i`: `k` 0..1 as it nears (the target glows). */
  ask(i: number, k: number): void;
  /** A note on zone `i` went by unplayed. */
  missed(i: number): void;
  /** Every frame. */
  update(dt: number): void;
}
