/**
 * The song clock and event cursor (pure). The song clock maps the audio clock to beats: beat 0 is
 * the first bar of play, the count-in bar is beats −4..0. Pausing the AudioContext stops its clock,
 * so a paused song simply waits. The cursor hands out events in beat order as the look-ahead
 * window reaches them, each exactly once.
 */
export class SongClock {
  /** Audio-clock time of beat 0. */
  start = 0;
  /** Seconds per beat (tempo scale applied). */
  spb = 0.75;

  set(start: number, spb: number): void {
    this.start = start;
    this.spb = spb;
  }

  beatAt(t: number): number {
    return (t - this.start) / this.spb;
  }

  timeAt(beat: number): number {
    return this.start + beat * this.spb;
  }

  /** Hold the song while `seconds` went by unplayed (a pause): everything after now moves later. */
  delay(seconds: number): void {
    this.start += seconds;
  }
}

export class EventCursor<T extends { beat: number }> {
  private i = 0;
  constructor(public events: readonly T[]) {}

  /** Start handing out events from `beat` on. */
  seek(beat: number): void {
    this.i = 0;
    while (this.i < this.events.length && this.events[this.i].beat < beat) this.i++;
  }

  /** Every not-yet-handed event with beat < untilBeat, in order. */
  pull(untilBeat: number, fn: (e: T) => void): void {
    while (this.i < this.events.length && this.events[this.i].beat < untilBeat) fn(this.events[this.i++]);
  }

  get done(): boolean {
    return this.i >= this.events.length;
  }
}
