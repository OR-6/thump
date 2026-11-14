/**
 * Loops (pure): tap REC on the module and four bars of whatever you play, anywhere in your room, are
 * recorded (lightly quantised to sixteenths) and play back on the same surfaces, round and round. Tap
 * REC again to lay another layer on top (up to three); tap it twice quickly to clear them.
 */
export interface LoopHit {
  /** Beat within the loop (0..beats). */
  beat: number;
  key: string;
  gain: number;
}

export type LoopState = 'off' | 'count' | 'rec' | 'play';

export class Looper {
  static readonly BARS = 4;
  readonly beats = Looper.BARS * 4;
  state: LoopState = 'off';
  layers: LoopHit[][] = [];
  private take: LoopHit[] = [];
  /** Loop beat at which the current pass started being scheduled. */
  private scheduledTo = 0;

  /** The REC key: start a take (after a one-bar count), or a new layer while looping. */
  rec(nowBeat: number): void {
    this.take = [];
    // a take always starts on a loop boundary; the first one after a one-bar count
    this.recStart = this.state === 'play' ? this.nextBoundary(nowBeat) : Math.ceil(nowBeat) + 4;
    this.state = this.state === 'play' ? 'play' : 'count';
    this.recording = true;
  }
  /** Beat (song clock) the take starts at. */
  recStart = 0;
  recording = false;

  /** Stop the loop playing (its layers kept). */
  stop(): void {
    this.state = 'off';
    this.recording = false;
    this.take = [];
  }
  /** Play the kept layers again from the next beat. */
  play(nowBeat: number): void {
    if (!this.layers.length) return;
    this.origin = Math.ceil(nowBeat);
    this.scheduledTo = this.origin;
    this.state = 'play';
  }

  clear(): void {
    this.state = 'off';
    this.layers = [];
    this.take = [];
    this.recording = false;
  }

  private nextBoundary(beat: number): number {
    return Math.ceil((beat - this.origin) / this.beats) * this.beats + this.origin;
  }
  /** The song-clock beat where loop beat 0 is. */
  origin = 0;

  /** A hit you played at song-clock `beat`. */
  hear(beat: number, key: string, gain: number): void {
    if (!this.recording || beat < this.recStart - 0.25 || beat >= this.recStart + this.beats - 0.25) return;
    const q = Math.round((beat - this.recStart) * 4) / 4;
    const at = ((q % this.beats) + this.beats) % this.beats;
    // one hit per sixteenth per target
    if (this.take.some((h) => h.beat === at && h.key === key)) return;
    this.take.push({ beat: at, key, gain });
  }

  /**
   * Advance to song-clock `beat`: finish a take when its four bars are up, and hand out the loop's hits
   * due before `until` (look-ahead) to `play(key, atBeat, gain)`.
   */
  tick(beat: number, until: number, play: (key: string, atBeat: number, gain: number) => void): void {
    if (this.state === 'count' && beat >= this.recStart) {
      this.state = 'rec';
      this.origin = this.recStart;
      this.scheduledTo = this.recStart;
    }
    if (this.recording && beat >= this.recStart + this.beats - 0.25) {
      this.recording = false;
      if (this.take.length) {
        if (this.layers.length >= 3) this.layers.shift();
        this.layers.push(this.take.sort((a, b) => a.beat - b.beat));
      }
      this.take = [];
      if (this.state === 'rec') this.state = this.layers.length ? 'play' : 'off';
      if (this.state === 'play' && this.layers.length === 0) this.state = 'off';
    }
    if (this.state !== 'play' && this.state !== 'rec') return;
    if (this.layers.length === 0) {
      this.scheduledTo = Math.max(this.scheduledTo, until);
      return;
    }
    // schedule every layer's hits between scheduledTo and until
    while (this.scheduledTo < until) {
      const passStart = Math.floor((this.scheduledTo - this.origin) / this.beats) * this.beats + this.origin;
      const end = Math.min(until, passStart + this.beats);
      for (const layer of this.layers)
        for (const h of layer) {
          const at = passStart + h.beat;
          if (at >= this.scheduledTo && at < end) play(h.key, at, h.gain);
        }
      this.scheduledTo = end;
    }
  }
}
