/**
 * The game's own sounds: the screen's taps, the moments of a song, Lights Out. All made here, from the song you're
 * in: every pitched sound is a note of the chord playing under it (or of the key, in the menus), and a moment waits
 * for the band's next eighth or beat, so it lands in the music instead of on top of it.
 *
 * Three weights, and nothing louder than a normal snare hit:
 * - a touch (hover, press, a page, a toggle, the score counting up): a small wooden tap or two, quiet and short;
 * - a step (the streak's ×2/×3/×4, a run's milestone, the Spotlight filling, passing your best): a soft bell on a
 *   chord tone, climbing as the streak does;
 * - a moment (your first Perfect, the grade landing, a new best, a full combo, Lights Out): a chord of bells, a crowd's
 *   applause for the big ones, the lamp's strike and the band coming back in a bloom.
 * A miss is a muted thud where the note was (and the band dips for a moment); a Perfect has no sound of its own: what
 * you played is the sound.
 *
 * Synthesised (sines, a little FM for the bells, filtered noise), so nothing to load and nothing out of tune.
 * Effect sounds have their own bus into the master (a soft top: nothing above 7 kHz) and a share of the room.
 */
import { audio } from './engine.js';

/** What the music is doing now (pitch classes). */
export interface Music {
  /** The key's tonic. */
  tonic: number;
  minor: boolean;
  /** The chord playing now: its root, and whether it's minor. */
  chord: number;
  chordMinor: boolean;
}

/** Each sound's place in the mix (linear, into the effects bus). Set against a snare hit at 0.75 (tools/fx-capture.mjs --board). */
const LEVEL = {
  hover: 0.05,
  press: 0.09,
  page: 0.08,
  toggle: 0.09,
  tap: 0.07,
  count: 0.1,
  step: 0.13,
  milestone: 0.16,
  lost: 0.08,
  miss: 0.3,
  moment: 0.18,
  stamp: 0.35,
  applause: 0.5,
  power: 0.26,
  strike: 0.3,
  bloom: 0.055,
  air: 0.14,
  set: 0.12,
} as const;

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const PENTA_MAJ = [0, 2, 4, 7, 9];
const PENTA_MIN = [0, 3, 5, 7, 10];
const pc = (n: number) => ((n % 12) + 12) % 12;

/**
 * A note of the chord in `m` (`home`: the key's own chord): `deg` 0 root, 1 third, 2 fifth, 3 the octave, 4 the
 * third and 5 the fifth above that, 6 two octaves; the root between G4 and F#5, + `oct` octaves (MIDI).
 */
export function chordTone(m: Music, deg: number, oct = 0, home = false): number {
  const root = 67 + pc((home ? m.tonic : m.chord) - 7);
  const third = (home ? m.minor : m.chordMinor) ? 3 : 4;
  return root + [0, third, 7, 12, 12 + third, 19, 24][Math.max(0, Math.min(6, Math.round(deg)))] + 12 * oct;
}
/** Step `i` (0 up) of the key's pentatonic in `m` (major or minor), from its tonic around C5 (MIDI). */
export function pentaTone(m: Music, i: number): number {
  const sc = m.minor ? PENTA_MIN : PENTA_MAJ;
  const tonic = 67 + pc(m.tonic - 7);
  const k = Math.max(0, Math.round(i));
  return tonic + sc[k % 5] + 12 * Math.floor(k / 5);
}

class Sfx {
  /** The music now (the room fills it in; the menus are in C). */
  music: (out: Music) => Music = (o) => {
    o.tonic = 0;
    o.minor = false;
    o.chord = 0;
    o.chordMinor = false;
    return o;
  };
  /** Audio time of the band's next 1/`div` of a beat (0: no band to land with). */
  grid: (div: number) => number = () => 0;

  private m: Music = { tonic: 0, minor: false, chord: 0, chordMinor: false };
  private ctx: AudioContext | null = null;
  private bus!: GainNode;
  private wet!: GainNode;
  private noise!: AudioBuffer;
  private clap: AudioBuffer | null = null;
  private last: Record<string, number> = {};

  /** The context, the bus made for it the first time. Null with no running audio. */
  private wire(): AudioContext | null {
    const o = audio.fxOut();
    if (!o) return null;
    if (o.ctx !== this.ctx) {
      const ctx = (this.ctx = o.ctx);
      const top = ctx.createBiquadFilter();
      top.type = 'lowpass';
      top.frequency.value = 7000;
      top.Q.value = 0.5;
      this.bus = ctx.createGain();
      this.bus.connect(top).connect(o.master);
      this.wet = ctx.createGain();
      this.wet.gain.value = 1;
      this.wet.connect(o.send);
      const len = ctx.sampleRate;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.clap = null;
    }
    return this.ctx;
  }

  /** At most once per `gap` seconds for `key`. */
  private gate(key: string, gap: number): boolean {
    const t = this.ctx?.currentTime ?? 0;
    if (t - (this.last[key] ?? -9) < gap) return false;
    this.last[key] = t;
    return true;
  }

  /** When: the band's next 1/`div` beat if it's near (a moment lands in time), else now. */
  private when(ctx: AudioContext, div: number): number {
    const now = ctx.currentTime;
    if (!div) return now;
    const t = this.grid(div);
    return t > now && t - now < 0.7 ? t : now;
  }

  /** A note of the chord now (chordTone). */
  private tone(deg: number, oct = 0, home = false): number {
    return chordTone(this.music(this.m), deg, oct, home);
  }
  /** The key's pentatonic, step `i` up from the tonic (pentaTone). */
  private penta(i: number): number {
    return pentaTone(this.music(this.m), i);
  }

  /** A gain → (pan) → bus (+ room) chain, starting at `level`. */
  private out(ctx: AudioContext, pan: number, wet: number): GainNode {
    const g = ctx.createGain();
    g.gain.value = 0;
    let node: AudioNode = g;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p);
      node = p;
    }
    node.connect(this.bus);
    if (wet > 0) {
      const w = ctx.createGain();
      w.gain.value = wet;
      node.connect(w).connect(this.wet);
    }
    return g;
  }
  /** Up to `peak` in `attack`, then away exponentially over `decay`. */
  private env(p: AudioParam, at: number, peak: number, attack: number, decay: number): void {
    p.setValueAtTime(0.0001, at);
    p.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
    p.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  }

  // ------------------------------------------------------------------ voices

  /** A bell: a sine and its FM shimmer that fades faster than the note (bright on the strike, round as it rings). */
  private bell(ctx: AudioContext, midi: number, at: number, level: number, pan = 0, len = 1.1, bright = 1): void {
    const f = hz(midi);
    const o = ctx.createOscillator();
    o.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.frequency.value = f * 3.5;
    const mi = ctx.createGain();
    mi.gain.setValueAtTime(f * 1.2 * bright, at);
    mi.gain.exponentialRampToValueAtTime(Math.max(1, f * 0.05), at + 0.25);
    mod.connect(mi).connect(o.frequency);
    const g = this.out(ctx, pan, 0.45);
    this.env(g.gain, at, level, 0.004, len);
    o.connect(g);
    // (an octave partial, quieter: the bell's body)
    const o2 = ctx.createOscillator();
    o2.frequency.value = f * 2;
    const g2 = ctx.createGain();
    g2.gain.value = 0.18;
    o2.connect(g2).connect(g);
    for (const x of [o, mod, o2]) {
      x.start(at);
      x.stop(at + len + 0.1);
    }
  }

  /** A small wooden tap (a marimba bar's knock): a sine with a quick high partial, a hair sharp as it starts. */
  private tap(ctx: AudioContext, midi: number, at: number, level: number, pan = 0, len = 0.12): void {
    const f = hz(midi);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(f * 1.015, at);
    o.frequency.exponentialRampToValueAtTime(f, at + 0.02);
    const g = this.out(ctx, pan, 0.2);
    this.env(g.gain, at, level, 0.002, len);
    o.connect(g);
    const k = ctx.createOscillator();
    k.frequency.value = f * 3.93;
    const kg = ctx.createGain();
    this.env(kg.gain, at, 0.3, 0.001, 0.03);
    k.connect(kg).connect(g);
    for (const x of [o, k]) {
      x.start(at);
      x.stop(at + len + 0.05);
    }
  }

  /** A felt thump: a low sine falling an octave, soft at the front (no click). */
  private thump(ctx: AudioContext, at: number, level: number, f0 = 110, len = 0.28, pan = 0): void {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(f0, at);
    o.frequency.exponentialRampToValueAtTime(f0 / 2, at + len * 0.6);
    const g = this.out(ctx, pan, 0.1);
    this.env(g.gain, at, level, 0.006, len);
    o.connect(g);
    o.start(at);
    o.stop(at + len + 0.05);
  }

  /** Filtered noise for `dur`: a band from `f0` to `f1` (Q `q`), up over `attack` and away. */
  private air(ctx: AudioContext, at: number, level: number, dur: number, f0: number, f1: number, q = 1, attack = 0.01, pan = 0, type: BiquadFilterType = 'bandpass'): void {
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = type;
    bp.Q.value = q;
    bp.frequency.setValueAtTime(f0, at);
    bp.frequency.exponentialRampToValueAtTime(f1, at + dur);
    const g = this.out(ctx, pan, 0.3);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(level, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    s.connect(bp).connect(g);
    s.start(at, Math.random() * 0.5);
    s.stop(at + dur + 0.05);
  }

  /** A chord swelling in and dying away (two detuned saws a note, through a warm filter that opens and closes). */
  private swell(ctx: AudioContext, notes: readonly number[], at: number, level: number, rise = 0.25, len = 1.6): void {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.7;
    lp.frequency.setValueAtTime(350, at);
    lp.frequency.exponentialRampToValueAtTime(1800, at + rise);
    lp.frequency.exponentialRampToValueAtTime(400, at + rise + len);
    const g = this.out(ctx, 0, 0.6);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(level, at + rise);
    g.gain.exponentialRampToValueAtTime(0.0001, at + rise + len);
    lp.connect(g);
    for (const m of notes)
      for (const d of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = hz(m);
        o.detune.value = d;
        o.connect(lp);
        o.start(at);
        o.stop(at + rise + len + 0.1);
      }
  }

  /** A room's applause (made once): claps from a few dozen hands, swelling in and thinning out. */
  private applauseBuf(ctx: AudioContext): AudioBuffer {
    if (this.clap) return this.clap;
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * 2.6);
    const buf = ctx.createBuffer(2, len, sr);
    let seed = 12345;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      // claps per second over time: in over 0.2 s, held, thinning from 1 s
      const N = 170;
      for (let k = 0; k < N; k++) {
        let t = rnd() * 2.4;
        if (t > 1 && rnd() < (t - 1) / 1.6) t = rnd() * 1.2;
        if (t < 0.2 && rnd() > t / 0.2) t += 0.2;
        const start = Math.floor(t * sr);
        const fc = 900 + rnd() * 1500;
        // RBJ band-pass for this hand
        const w = (2 * Math.PI * fc) / sr;
        const al = Math.sin(w) / (2 * 1.4);
        const b0 = al / (1 + al);
        const a1 = (-2 * Math.cos(w)) / (1 + al);
        const a2 = (1 - al) / (1 + al);
        let x1 = 0;
        let x2 = 0;
        let y1 = 0;
        let y2 = 0;
        const amp = 0.25 + rnd() * 0.5;
        const n = Math.floor(sr * 0.05);
        // (a clap is a few quick bursts as the palms meet)
        const b2 = Math.floor(sr * (0.003 + rnd() * 0.004));
        for (let i = 0; i < n && start + i < len; i++) {
          const e = Math.exp(-i / (sr * 0.012)) + (i >= b2 ? 0.6 * Math.exp(-(i - b2) / (sr * 0.014)) : 0);
          const x = (rnd() * 2 - 1) * e;
          const y = b0 * x - b0 * x2 - a1 * y1 - a2 * y2;
          x2 = x1;
          x1 = x;
          y2 = y1;
          y1 = y;
          d[start + i] += y * amp;
        }
      }
    }
    return (this.clap = buf);
  }
  /** The crowd: `size` 0..1 (how loud, how long). */
  applause(size = 1, at = 0): void {
    const ctx = this.wire();
    if (!ctx) return;
    const t = Math.max(ctx.currentTime, at);
    const s = ctx.createBufferSource();
    s.buffer = this.applauseBuf(ctx);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 4500;
    const g = this.out(ctx, 0, 0.5);
    const lv = LEVEL.applause * (0.35 + 0.65 * size);
    const dur = 1.1 + 1.4 * size;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(lv, t + 0.15);
    g.gain.setValueAtTime(lv, t + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(lp).connect(g);
    s.start(t);
    s.stop(t + dur + 0.05);
  }

  // ------------------------------------------------------------------ the screen

  /** A finger over a new control: a breath of a tap (at most one every 120 ms). */
  hover(): void {
    const ctx = this.wire();
    if (!ctx || !this.gate('hover', 0.12)) return;
    this.tap(ctx, this.tone(2), ctx.currentTime, LEVEL.hover, 0, 0.05);
  }
  /** A press: the chord's root, on wood. */
  press(level = 1): void {
    const ctx = this.wire();
    if (!ctx || !this.gate('press', 0.06)) return;
    this.tap(ctx, this.tone(0), ctx.currentTime, LEVEL.press * level, 0, 0.14);
  }
  /** A page opening (after its press): the third and the fifth, as two small bells. */
  open(level = 1): void {
    const ctx = this.wire();
    if (!ctx || !this.gate('page', 0.1)) return;
    const t = ctx.currentTime + 0.06;
    this.bell(ctx, this.tone(1), t, LEVEL.page * level, 0, 0.35, 0.4);
    this.bell(ctx, this.tone(2), t + 0.06, LEVEL.page * level * 0.8, 0, 0.45, 0.4);
  }
  /** Back: down from the fifth to the root. */
  back(): void {
    const ctx = this.wire();
    if (!ctx || !this.gate('page', 0.1)) return;
    const t = ctx.currentTime;
    this.tap(ctx, this.tone(2), t, LEVEL.page, 0, 0.12);
    this.tap(ctx, this.tone(0), t + 0.07, LEVEL.page * 0.85, 0, 0.16);
  }
  /** A setting switched: up to the third (on) or down to the root (off). */
  toggle(on = true): void {
    const ctx = this.wire();
    if (!ctx || !this.gate('press', 0.06)) return;
    const t = ctx.currentTime;
    this.tap(ctx, this.tone(on ? 1 : 2), t, LEVEL.toggle, 0, 0.1);
    this.tap(ctx, this.tone(on ? 2 : 0), t + 0.05, LEVEL.toggle * 0.8, 0, 0.12);
  }
  /** A small tap (a handle grabbed, a step on a list): `level` 1 normal. */
  tick(level = 1): void {
    const ctx = this.wire();
    if (!ctx || !this.gate('tick', 0.05)) return;
    this.tap(ctx, this.tone(2), ctx.currentTime, LEVEL.tap * level, 0, 0.07);
  }
  /** A control that can't be used yet: a dull low knock. */
  denied(): void {
    const ctx = this.wire();
    if (!ctx || !this.gate('denied', 0.15)) return;
    this.tap(ctx, this.tone(0, -1), ctx.currentTime, LEVEL.tap * 0.8, 0, 0.06);
  }
  /** Something set down where you put it (the kit moved): a soft thump and the root. */
  set(): void {
    const ctx = this.wire();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.thump(ctx, t, LEVEL.set, 140, 0.18);
    this.tap(ctx, this.tone(0), t + 0.01, LEVEL.press * 0.7, 0, 0.12);
  }
  /** Picked up (the kit's handle). */
  lift(): void {
    const ctx = this.wire();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tap(ctx, this.tone(0), t, LEVEL.press * 0.7, 0, 0.1);
    this.tap(ctx, this.tone(2), t + 0.05, LEVEL.press * 0.5, 0, 0.12);
  }
  /** The score counting up: each tick a step up the key's pentatonic (`i` from 0). */
  count(i: number): void {
    const ctx = this.wire();
    if (!ctx) return;
    this.tap(ctx, this.penta(Math.min(12, i)), ctx.currentTime, LEVEL.count * (0.7 + 0.03 * Math.min(10, i)), 0, 0.08);
  }
  /** Something slides onto the desk, or the Spotlight closes: a soft breath of air, rising (or falling). */
  whoosh(pan = 0, down = false): void {
    const ctx = this.wire();
    if (!ctx) return;
    this.air(ctx, ctx.currentTime, LEVEL.air, 0.5, down ? 2200 : 500, down ? 450 : 2000, 1.2, 0.22, pan);
  }

  // ------------------------------------------------------------------ a song's moments

  /** The streak steps up: a bell climbing the chord (×2 the third, ×3 the fifth, ×4 the octave over the fifth), on the band's next eighth. */
  mult(m: number): void {
    const ctx = this.wire();
    if (!ctx) return;
    const t = this.when(ctx, 2);
    if (m >= 4) {
      this.bell(ctx, this.tone(2), t, LEVEL.step * 0.8, -0.2, 1.3);
      this.bell(ctx, this.tone(3), t + 0.03, LEVEL.step, 0.2, 1.5);
    } else this.bell(ctx, this.tone(m >= 3 ? 2 : 1), t, LEVEL.step, 0, 1.1);
  }
  /** A run of 25, 50, 100…: the chord's notes as bells, strummed, on the next beat; from 100 the room claps. */
  milestone(run: number): void {
    const ctx = this.wire();
    if (!ctx) return;
    const t = this.when(ctx, 1);
    const big = run >= 100;
    const notes = big ? [0, 1, 2, 3] : [0, 1, 2];
    notes.forEach((d, i) => this.bell(ctx, this.tone(d), t + i * 0.045, LEVEL.milestone * (1 - i * 0.08), (i - 1) * 0.25, 1.4));
    if (big) this.applause(0.5, t);
  }
  /** A long run lost (25 or more): two soft notes falling, low and muffled. */
  runLost(run: number): void {
    if (run < 25) return;
    const ctx = this.wire();
    if (!ctx || !this.gate('lost', 1)) return;
    const t = ctx.currentTime + 0.08;
    this.tap(ctx, this.tone(1, -1), t, LEVEL.lost, 0, 0.18);
    this.tap(ctx, this.tone(0, -1), t + 0.12, LEVEL.lost * 0.8, 0, 0.3);
  }
  /** A note gone by unplayed: a muted thud where it was, and the band dips for a moment. */
  miss(pan = 0): void {
    const ctx = this.wire();
    if (!ctx) return;
    const t = ctx.currentTime;
    // (two misses at once are one thud)
    if (!this.gate('miss', 0.09)) return;
    this.air(ctx, t, LEVEL.miss * 0.5, 0.07, 320, 180, 0.8, 0.003, pan, 'lowpass');
    this.thump(ctx, t, LEVEL.miss * 0.35, 95, 0.09, pan);
    audio.bandDip();
  }
  /** The Spotlight a quarter fuller: a bell a step up the chord as it fills, on the next eighth. */
  spotGain(meter: number): void {
    const ctx = this.wire();
    if (!ctx) return;
    const t = this.when(ctx, 2);
    const d = meter >= 1 ? 3 : meter >= 0.75 ? 2 : meter >= 0.5 ? 1 : 0;
    this.bell(ctx, this.tone(d), t, LEVEL.step * 0.75, 0.3, 0.9, 0.7);
  }
  /** Passing your best run: the fifth up to the octave, on the next beat. */
  overtake(): void {
    const ctx = this.wire();
    if (!ctx) return;
    const t = this.when(ctx, 1);
    this.bell(ctx, this.tone(2), t, LEVEL.step * 0.8, -0.2, 0.8);
    this.bell(ctx, this.tone(3), t + 0.09, LEVEL.step, 0.2, 1.2);
  }
  /** A lesson's next step comes up. */
  lessonStep(): void {
    this.open(0.9);
  }
  /** Your first Perfect ever: the chord rung together, and a little applause. */
  firstPerfect(): void {
    const ctx = this.wire();
    if (!ctx) return;
    const t = ctx.currentTime + 0.03;
    [0, 1, 2, 3].forEach((d, i) => this.bell(ctx, this.tone(d), t + i * 0.035, LEVEL.moment * 0.8, (i - 1.5) * 0.25, 1.6));
    this.applause(0.3, t + 0.1);
  }
  /** The grade landing (on the beat): a felt thump; a good grade rings the key's chord over it, the best two get applause. */
  stamp(letter: string): void {
    const ctx = this.wire();
    if (!ctx) return;
    const t = ctx.currentTime;
    const high = letter === 'S' || letter === 'A';
    this.thump(ctx, t, LEVEL.stamp * (letter === 'D' ? 0.6 : 1), letter === 'D' ? 90 : 120, 0.3);
    if (letter === 'D' || letter === 'C') return;
    // (the results ring the key's own chord)
    const notes = letter === 'S' ? [0, 2, 3, 4] : high ? [0, 2, 3] : [0, 2];
    notes.forEach((d, i) => this.bell(ctx, this.tone(d, 0, true), t + 0.02 + i * 0.03, LEVEL.moment * (high ? 1 : 0.7), (i - 1) * 0.3, high ? 2 : 1.3));
    if (high) this.applause(letter === 'S' ? 1 : 0.6, t + 0.12);
  }
  /** A new best: the key's chord climbing, four bells. */
  record(): void {
    const ctx = this.wire();
    if (!ctx) return;
    const t = ctx.currentTime;
    [0, 1, 2, 3].forEach((d, i) => this.bell(ctx, this.penta([0, 2, 4, 5][d]), t + i * 0.08, LEVEL.moment * 0.8, (i - 1.5) * 0.2, 1.2));
  }
  /** A full combo (all Perfect: one more note): the key's pentatonic run up and the room claps. */
  fullCombo(all = false): void {
    const ctx = this.wire();
    if (!ctx) return;
    const t = ctx.currentTime;
    const run = all ? [0, 1, 2, 3, 4, 5, 7] : [0, 1, 2, 3, 4, 5];
    run.forEach((s, i) => this.bell(ctx, this.penta(s + 2), t + i * 0.06, LEVEL.moment * (0.7 + i * 0.03), (i / (run.length - 1) - 0.5) * 0.6, i === run.length - 1 ? 1.8 : 0.7, 0.8));
    this.applause(0.8, t + 0.2);
  }

  // ------------------------------------------------------------------ Lights Out

  /** The room's power going down: a low swell sinking away (no buzz). */
  powerDown(): void {
    const ctx = this.wire();
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(34, t + 0.55);
    const g = this.out(ctx, 0, 0.2);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(LEVEL.power, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.65);
    // the house lights' hum sagging with it, soft
    const h = ctx.createOscillator();
    h.type = 'triangle';
    h.frequency.setValueAtTime(110, t);
    h.frequency.exponentialRampToValueAtTime(55, t + 0.38);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(600, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + 0.38);
    const hg = this.out(ctx, 0, 0);
    hg.gain.setValueAtTime(LEVEL.power * 0.12, t);
    hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    h.connect(lp).connect(hg);
    h.start(t);
    h.stop(t + 0.45);
  }
  /** A follow spot striking `delay` seconds from now: the shutter's soft click, the lamp house's iron "chunk", and the lamp's ring on the key's tonic. */
  strike(delay = 0): void {
    const ctx = this.wire();
    if (!ctx) return;
    const t = ctx.currentTime + Math.max(0, delay);
    this.air(ctx, t, LEVEL.strike * 0.35, 0.025, 2400, 1800, 1.6, 0.002);
    const c = t + 0.05;
    this.air(ctx, c, LEVEL.strike * 0.7, 0.14, 700, 300, 0.7, 0.003, 0, 'lowpass');
    this.thump(ctx, c, LEVEL.strike, 120, 0.24);
    const m = this.music(this.m);
    this.bell(ctx, 55 + ((m.tonic - 7 + 120) % 12) + 12, c, LEVEL.strike * 0.12, 0, 0.9, 0.3);
  }
  /** The band coming back in after Lights Out (audio time `at`): the home chord blooms under it. */
  bloom(at: number): void {
    const ctx = this.wire();
    if (!ctx) return;
    const m = this.music(this.m);
    const root = 50 + ((m.tonic - 2 + 120) % 12);
    this.swell(ctx, [root, root + (m.minor ? 3 : 4), root + 7, root + 12], Math.max(ctx.currentTime, at - 0.18), LEVEL.bloom, 0.2, 1.8);
  }

  /** Every sound alone, for the capture tool's board (tools/fx-capture.mjs --board). */
  board(): [string, () => void][] {
    return [
      ['hover', () => this.hover()],
      ['press', () => this.press()],
      ['press + open (a page)', () => (this.press(), this.open())],
      ['back', () => this.back()],
      ['toggle', () => this.toggle(true)],
      ['tick (small tap)', () => this.tick()],
      ['denied', () => this.denied()],
      ['count-up x8', () => [0, 1, 2, 3, 4, 5, 6, 7].forEach((i) => setTimeout(() => this.count(i), i * 90))],
      ['set (kit put down)', () => this.set()],
      ['miss', () => this.miss(0)],
      ['run lost (25+)', () => this.runLost(30)],
      ['mult x2', () => this.mult(2)],
      ['mult x4', () => this.mult(4)],
      ['spotlight +25%', () => this.spotGain(0.5)],
      ['overtake', () => this.overtake()],
      ['milestone 50', () => this.milestone(50)],
      ['milestone 100', () => this.milestone(100)],
      ['first perfect', () => this.firstPerfect()],
      ['stamp D', () => this.stamp('D')],
      ['stamp B', () => this.stamp('B')],
      ['stamp S', () => this.stamp('S')],
      ['new best', () => this.record()],
      ['full combo', () => this.fullCombo(true)],
      ['whoosh', () => this.whoosh(0)],
      ['powerDown + strike', () => (this.powerDown(), this.strike(0.4))],
      ['bloom', () => this.bloom(0)],
    ];
  }
}

export const sfx = new Sfx();
