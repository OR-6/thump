/** The game clock: the audio clock while audio runs, frame time otherwise, continuous across the switch. */
export class GameClock {
  t = 0;
  private base = 0;
  private wasRunning = false;
  tick(dt: number, running: boolean, audioNow: number): void {
    if (running) {
      if (!this.wasRunning) this.base = this.t - audioNow;
      this.t = audioNow + this.base;
    } else this.t += dt;
    this.wasRunning = running;
  }
  toAudio(t: number): number {
    return this.wasRunning ? t - this.base : 0;
  }
}
