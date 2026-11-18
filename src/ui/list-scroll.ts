/**
 * A list that scrolls under a finger, as on a phone: drag it and it follows one for one (a little past either end,
 * with resistance), let go moving and it carries on and slows, let go past an end and it settles back. Pure (no
 * three, no DOM): the panel feeds it a pointer's position along the list, in canvas pixels, and reads `offset`.
 */
export class ListScroll {
  /** How far down the list is scrolled (px: 0 the top, `max` the bottom). */
  offset = 0;
  /** How far it can go (the list's height less the window's). */
  max = 0;
  private vel = 0;
  private held = -1;
  private grabY = 0;
  private grabOff = 0;
  private lastY = 0;
  private moved = 0;
  /** Easing to a place (keeping the chosen row in view), or NaN. */
  private goal = NaN;

  get holding(): boolean {
    return this.held >= 0;
  }

  /** How far the pointer has moved since it took hold (px). */
  get travel(): number {
    return this.moved;
  }

  setMax(max: number): void {
    this.max = Math.max(0, max);
    if (this.held < 0 && Number.isNaN(this.goal)) this.offset = Math.min(this.offset, this.max);
  }

  /** Pointer `id` takes hold at `y` (canvas px, down the panel). */
  grab(id: number, y: number): void {
    this.held = id;
    this.grabY = this.lastY = y;
    this.grabOff = this.offset;
    this.vel = 0;
    this.moved = 0;
    this.goal = NaN;
  }

  /** The holding pointer is at `y` now, `dt` seconds after it was last seen. */
  drag(id: number, y: number, dt: number): void {
    if (id !== this.held) return;
    this.moved = Math.max(this.moved, Math.abs(y - this.grabY));
    const want = this.grabOff - (y - this.grabY);
    // (past an end it goes a third as far, up to a row's height: you feel the end of the list)
    this.offset = want < 0 ? -Math.min(80, -want / 3) : want > this.max ? this.max + Math.min(80, (want - this.max) / 3) : want;
    if (dt > 0) {
      const v = -(y - this.lastY) / dt;
      // (smoothed: hand tracking's frame-to-frame steps are noisy)
      this.vel += (v - this.vel) * Math.min(1, dt / 0.05);
    }
    this.lastY = y;
  }

  /** The pointer let go; true when it had moved enough to be a drag (not a tap). */
  release(id: number, tap = 24): boolean {
    if (id !== this.held) return false;
    this.held = -1;
    // (a slow drag ends where you left it; a flick carries on)
    if (Math.abs(this.vel) < 120) this.vel = 0;
    this.vel = Math.max(-4000, Math.min(4000, this.vel));
    return this.moved >= tap;
  }

  /** Bring rows `top`..`bottom` (px down the list) into the `view`-px-tall window: at once, or eased. */
  show(top: number, bottom: number, view: number, now = false): void {
    if (this.held >= 0) return;
    let to = this.offset;
    if (top < to) to = top;
    else if (bottom > to + view) to = bottom - view;
    to = Math.max(0, Math.min(this.max, to));
    if (now) {
      this.offset = to;
      this.vel = 0;
      this.goal = NaN;
    } else if (Math.abs(to - this.offset) > 0.5) {
      this.goal = to;
      this.vel = 0;
    }
  }

  /** Back to the top at once (a new list). */
  reset(): void {
    this.offset = 0;
    this.vel = 0;
    this.goal = NaN;
    this.held = -1;
  }

  /** One frame: a flick slowing, an end springing back, an ease to a place. True when the offset moved. */
  update(dt: number): boolean {
    if (this.held >= 0 || dt <= 0) return false;
    const was = this.offset;
    if (!Number.isNaN(this.goal)) {
      this.offset += (this.goal - this.offset) * Math.min(1, dt / 0.08);
      if (Math.abs(this.goal - this.offset) < 0.5) {
        this.offset = this.goal;
        this.goal = NaN;
      }
      return this.offset !== was;
    }
    if (this.vel !== 0) {
      this.offset += this.vel * dt;
      // (it slows as a phone's list does: most of the way in half a second)
      this.vel *= Math.exp(-dt * 4.5);
      // (running past an end: it stops there hard, then the spring brings it back)
      if (this.offset < 0 || this.offset > this.max) this.vel *= Math.exp(-dt * 30);
      if (Math.abs(this.vel) < 15) this.vel = 0;
    }
    if (this.vel === 0 || this.offset < -80 || this.offset > this.max + 80) {
      const end = this.offset < 0 ? 0 : this.offset > this.max ? this.max : this.offset;
      if (end !== this.offset) {
        this.vel = 0;
        this.offset += (end - this.offset) * Math.min(1, dt / 0.07);
        if (Math.abs(end - this.offset) < 0.5) this.offset = end;
      }
    }
    return this.offset !== was;
  }
}
