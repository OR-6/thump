/**
 * Audio: one AudioContext (latency hint 'interactive'), created on the first gesture.
 *
 * Every drum is synthesised (PLAN §3.3): no samples, no licences, instant. Each voice takes a
 * velocity (louder and brighter when harder) and a pan (from where its pad lies). Hits play at
 * once (scheduled for the current audio time on the frame they're seen); the backing band and the
 * beat light are scheduled ahead on the same clock.
 *
 * Mix: drums → master; a short room reverb (0.4 s, −18 dB) glues everything but the hat; a master
 * compressor (−10 dB, 3:1) so flams and two-handed hits never clip; the backing band and the
 * click have their own quiet buses.
 */
import type { Lane } from '../config.js';
import type { BedEvent } from '../songs/chart.js';

export type Voice = Lane | 'knock' | 'rim' | 'clap' | 'block' | 'bell';

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class Engine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private drums!: GainNode;
  private bedBus!: GainNode;
  private clickBus!: GainNode;
  private send!: GainNode;
  private noise!: AudioBuffer;
  private paused = false;
  /** Backing band on/off (the drums always play). */
  bedOn = true;
  /** Hits played (debug/E2E): per voice, and the last one's gain. */
  readonly played: Record<string, number> = {};
  lastGain = 0;
  lastVoice = '';
  /** Audio time of the last drum hit played (debug: hit-to-sound is this minus the frame's hit time). */
  lastAt = 0;

  /** Create/resume the context. Call from a user gesture path. */
  resume(): void {
    try {
      if (!this.ctx) this.build();
      if (this.ctx && this.ctx.state === 'suspended' && !this.paused) void this.ctx.resume();
    } catch {
      /* no audio: every hit still has its visual twin */
    }
  }

  setPaused(p: boolean): void {
    this.paused = p;
    if (!this.ctx) return;
    if (p) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  get running(): boolean {
    return !!this.ctx && this.ctx.state === 'running' && !this.paused;
  }

  /** The audio clock (s); 0 before audio starts. */
  now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** What the browser says sits between scheduling and the speaker (s). */
  outputLatency(): number {
    const c = this.ctx as (AudioContext & { outputLatency?: number }) | null;
    return c ? (c.baseLatency ?? 0) + (c.outputLatency ?? 0) : 0;
  }

  setReverb(on: boolean): void {
    if (this.send) this.send.gain.value = on ? 0.126 : 0; // −18 dB
  }

  private build(): void {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 3;
    comp.attack.value = 0.003;
    comp.release.value = 0.12;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp).connect(ctx.destination);
    this.drums = ctx.createGain();
    this.drums.connect(this.master);
    this.bedBus = ctx.createGain();
    this.bedBus.gain.value = this.bedOn ? 0.55 : 0;
    this.bedBus.connect(this.master);
    this.clickBus = ctx.createGain();
    this.clickBus.gain.value = 0.25;
    this.clickBus.connect(this.master);
    const conv = ctx.createConvolver();
    conv.buffer = impulse(ctx, 0.4, 3);
    this.send = ctx.createGain();
    this.send.gain.value = 0.126;
    this.send.connect(conv).connect(this.master);
    this.bedBus.connect(this.send);
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setBed(on: boolean): void {
    this.bedOn = on;
    if (this.bedBus) this.bedBus.gain.value = on ? 0.55 : 0;
  }

  private ready(): AudioContext | null {
    if (!this.ctx) this.resume();
    const c = this.ctx;
    if (c && c.state !== 'running' && !this.paused) void c.resume().catch(() => {});
    return c && c.state === 'running' && !this.paused ? c : null;
  }

  /** A gain → (pan) → bus chain; returns the gain to feed. */
  private out(ctx: AudioContext, bus: AudioNode, pan: number, wet: number, when: number, level: number): GainNode {
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, when);
    let node: AudioNode = g;
    if (pan !== 0 && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p);
      node = p;
    }
    node.connect(bus);
    if (wet > 0) {
      const w = ctx.createGain();
      w.gain.value = wet;
      node.connect(w).connect(this.send);
    }
    return g;
  }

  private noiseSrc(ctx: AudioContext, when: number, dur: number): AudioBufferSourceNode {
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    // a different slice of the noise each time, so no two hats are identical
    s.start(when, Math.random() * 0.8, dur + 0.05);
    return s;
  }

  private env(param: AudioParam, when: number, peak: number, attack: number, decay: number): void {
    param.setValueAtTime(0.0001, when);
    param.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + attack);
    param.exponentialRampToValueAtTime(0.0001, when + attack + decay);
  }

  /**
   * A drum. `vel` 0..1 (harder: louder, brighter, a sharper attack); `pan` −1..1 from the pad's spot;
   * `size` > 1 for a pad on a big surface (a wall): lower, longer, more room.
   */
  drum(voice: Voice, vel: number, pan = 0, when = 0, size = 1): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = Math.max(ctx.currentTime, when || ctx.currentTime);
    const v = Math.max(0.05, Math.min(1, vel));
    this.played[voice] = (this.played[voice] ?? 0) + 1;
    this.lastGain = v;
    this.lastVoice = voice;
    this.lastAt = t;
    const big = Math.max(1, size);
    switch (voice) {
      case 'kick': {
        const o = ctx.createOscillator();
        o.type = 'sine';
        const f0 = (130 + 40 * v) / Math.sqrt(big);
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(48 / Math.sqrt(big), t + 0.06);
        const g = this.out(ctx, this.drums, pan, 0.4, t, 1);
        this.env(g.gain, t, 0.95 * v, 0.002, 0.32 + 0.15 * v);
        o.connect(g);
        o.start(t);
        o.stop(t + 0.6);
        // the beater's click: a short bright tick, louder on a hard hit
        const n = this.noiseSrc(ctx, t, 0.012);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 1800;
        const cg = this.out(ctx, this.drums, pan, 0, t, 1);
        this.env(cg.gain, t, 0.25 * v * v + 0.04, 0.001, 0.012);
        n.connect(hp).connect(cg);
        break;
      }
      case 'snare': {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.setValueAtTime(190, t);
        o.frequency.exponentialRampToValueAtTime(165, t + 0.08);
        const g = this.out(ctx, this.drums, pan, 1, t, 1);
        this.env(g.gain, t, 0.5 * v, 0.002, 0.1);
        o.connect(g);
        o.start(t);
        o.stop(t + 0.2);
        const n = this.noiseSrc(ctx, t, 0.2);
        const bp = ctx.createBiquadFilter();
        bp.type = 'highpass';
        bp.frequency.value = 900 + 900 * (1 - v);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 4500 + 6000 * v;
        const ng = this.out(ctx, this.drums, pan, 1, t, 1);
        this.env(ng.gain, t, 0.55 * v, 0.001, 0.15);
        n.connect(bp).connect(lp).connect(ng);
        break;
      }
      case 'hat': {
        const n = this.noiseSrc(ctx, t, 0.06);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 9000 + 2000 * v;
        bp.Q.value = 0.9;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 6500;
        const g = this.out(ctx, this.drums, pan, 0, t, 1); // no reverb on the hat
        this.env(g.gain, t, 0.42 * v, 0.001, 0.04 + 0.02 * v);
        n.connect(bp).connect(hp).connect(g);
        break;
      }
      case 'tom': {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime((120 + 25 * v) / Math.sqrt(big), t);
        o.frequency.exponentialRampToValueAtTime(82 / Math.sqrt(big), t + 0.22);
        const g = this.out(ctx, this.drums, pan, 1, t, 1);
        this.env(g.gain, t, 0.85 * v, 0.003, 0.42);
        o.connect(g);
        o.start(t);
        o.stop(t + 0.6);
        const n = this.noiseSrc(ctx, t, 0.03);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1500 + 1500 * v;
        const ng = this.out(ctx, this.drums, pan, 0, t, 1);
        this.env(ng.gain, t, 0.12 * v, 0.001, 0.03);
        n.connect(lp).connect(ng);
        break;
      }
      case 'gong': {
        // inharmonic partials with a slow bloom and a long tail (PLAN §3.3)
        const base = 98 / Math.sqrt(big);
        const parts = [1, 2.4, 3.9, 5.1];
        const amps = [0.5, 0.32, 0.2, 0.12];
        const g = this.out(ctx, this.drums, pan, 3, t, 1);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.7 * v + 0.05, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6 * Math.min(1.5, big));
        parts.forEach((p, i) => {
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.setValueAtTime(base * p * (1 + (Math.random() - 0.5) * 0.004), t);
          // the shimmer: partials drift a little as it rings
          o.frequency.linearRampToValueAtTime(base * p * (1 - 0.006), t + 2.5);
          const pg = ctx.createGain();
          pg.gain.value = amps[i] * (i === 0 ? 1 : 0.6 + 0.6 * v);
          o.connect(pg).connect(g);
          o.start(t);
          o.stop(t + 4);
        });
        const n = this.noiseSrc(ctx, t, 0.05);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 2500;
        const ng = this.out(ctx, this.drums, pan, 1, t, 1);
        this.env(ng.gain, t, 0.12 * v, 0.002, 0.05);
        n.connect(bp).connect(ng);
        break;
      }
      case 'rim': {
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = 1700;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1900;
        bp.Q.value = 6;
        const g = this.out(ctx, this.drums, pan, 0.6, t, 1);
        this.env(g.gain, t, 0.45 * v, 0.001, 0.025);
        o.connect(bp).connect(g);
        o.start(t);
        o.stop(t + 0.06);
        break;
      }
      case 'clap': {
        const g = this.out(ctx, this.drums, pan, 1.5, t, 1);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1200;
        bp.Q.value = 1.2;
        bp.connect(g);
        for (let k = 0; k < 3; k++) {
          const n = this.noiseSrc(ctx, t + k * 0.01, 0.012);
          const ng = ctx.createGain();
          this.env(ng.gain, t + k * 0.01, 0.6 * v, 0.001, 0.012);
          n.connect(ng).connect(bp);
        }
        const tail = this.noiseSrc(ctx, t + 0.03, 0.15);
        const tg = ctx.createGain();
        this.env(tg.gain, t + 0.03, 0.4 * v, 0.002, 0.12);
        tail.connect(tg).connect(bp);
        break;
      }
      case 'block': {
        for (const [f, a] of [
          [800, 0.5],
          [2080, 0.15],
        ] as const) {
          const o = ctx.createOscillator();
          o.frequency.value = f;
          const g = this.out(ctx, this.drums, pan, 0.5, t, 1);
          this.env(g.gain, t, a * v, 0.001, 0.03);
          o.connect(g);
          o.start(t);
          o.stop(t + 0.08);
        }
        break;
      }
      case 'bell': {
        for (const [p, a] of [
          [1, 0.3],
          [2.76, 0.12],
          [5.4, 0.05],
        ] as const) {
          const o = ctx.createOscillator();
          o.frequency.value = 880 * p;
          const g = this.out(ctx, this.drums, pan, 1.5, t, 1);
          this.env(g.gain, t, a * v, 0.002, 1.2 / p);
          o.connect(g);
          o.start(t);
          o.stop(t + 1.4);
        }
        break;
      }
      case 'knock': {
        // the bare table: a faint, dull knock (every surface is a drum, never silence)
        const o = ctx.createOscillator();
        o.frequency.setValueAtTime(190, t);
        o.frequency.exponentialRampToValueAtTime(120, t + 0.04);
        const g = this.out(ctx, this.drums, pan, 0.3, t, 1);
        this.env(g.gain, t, 0.22 * v, 0.001, 0.06);
        o.connect(g);
        o.start(t);
        o.stop(t + 0.12);
        const n = this.noiseSrc(ctx, t, 0.02);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 900;
        const ng = this.out(ctx, this.drums, pan, 0, t, 1);
        this.env(ng.gain, t, 0.12 * v, 0.001, 0.02);
        n.connect(lp).connect(ng);
        break;
      }
    }
  }

  /** One event of the backing band, at audio time `when`; `spb` seconds per beat. */
  band(e: BedEvent, when: number, spb: number): void {
    const ctx = this.ready();
    if (!ctx || !this.bedOn) return;
    const t = Math.max(ctx.currentTime, when);
    const len = e.len * spb;
    switch (e.voice) {
      case 'bass': {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = midiHz(e.midi);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 520;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.5 * e.vel, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.12, len));
        o.connect(lp).connect(g).connect(this.bedBus);
        o.start(t);
        o.stop(t + len + 0.1);
        break;
      }
      case 'chord': {
        const third = e.minor ? 3 : 4;
        const g = ctx.createGain();
        const hold = len > spb * 1.5;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.09 * e.vel, t + (hold ? 0.15 : 0.012));
        g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.15, len));
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = hold ? 900 : 1600;
        lp.connect(g).connect(this.bedBus);
        for (const s of [0, third, 7, 12]) {
          const o = ctx.createOscillator();
          o.type = 'triangle';
          o.frequency.value = midiHz(e.midi + s - 12);
          o.detune.value = (Math.random() - 0.5) * 8;
          o.connect(lp);
          o.start(t);
          o.stop(t + len + 0.2);
        }
        break;
      }
      case 'shaker': {
        const n = this.noiseSrc(ctx, t, 0.05);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 6000;
        bp.Q.value = 1.5;
        const g = ctx.createGain();
        this.env(g.gain, t, 0.16 * e.vel, 0.006, 0.035);
        n.connect(bp).connect(g).connect(this.bedBus);
        break;
      }
      case 'pluck': {
        // a soft kalimba-ish pluck: sine with a fast-fading bright partial
        const o = ctx.createOscillator();
        o.frequency.value = midiHz(e.midi + 12);
        const o2 = ctx.createOscillator();
        o2.type = 'triangle';
        o2.frequency.value = midiHz(e.midi + 24);
        const g = ctx.createGain();
        this.env(g.gain, t, 0.16 * e.vel, 0.003, 0.5);
        const g2 = ctx.createGain();
        this.env(g2.gain, t, 0.05 * e.vel, 0.002, 0.08);
        o.connect(g).connect(this.bedBus);
        o2.connect(g2).connect(this.bedBus);
        o.start(t);
        o2.start(t);
        o.stop(t + 0.6);
        o2.stop(t + 0.2);
        break;
      }
    }
  }

  /** A metronome tick (its own quiet bus). */
  click(when = 0, accent = false): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = Math.max(ctx.currentTime, when);
    const o = ctx.createOscillator();
    o.frequency.value = accent ? 1600 : 1200;
    const g = ctx.createGain();
    this.env(g.gain, t, accent ? 0.5 : 0.35, 0.001, 0.03);
    o.connect(g).connect(this.clickBus);
    o.start(t);
    o.stop(t + 0.06);
  }

  /** A felt pad sliding onto the table: a soft brushed whoosh, rising. */
  whoosh(pan = 0): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const n = this.noiseSrc(ctx, t, 0.45);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(2400, t + 0.4);
    const g = this.out(ctx, this.master, pan, 0.5, t, 1);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    n.connect(bp).connect(g);
  }

  /** The crowd cheering: a patter of tiny claps and a happy "ooh", by size (3–12). */
  cheer(size: number, big = false): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const claps = Math.round((big ? 14 : 5) + size * (big ? 2 : 0.6));
    for (let k = 0; k < claps; k++) {
      const at = t + Math.random() * (big ? 1.4 : 0.5);
      const n = this.noiseSrc(ctx, at, 0.02);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1400 + Math.random() * 1600;
      bp.Q.value = 2;
      const g = this.out(ctx, this.master, (Math.random() - 0.5) * 0.6, 0.6, at, 1);
      this.env(g.gain, at, 0.05 + Math.random() * 0.05, 0.001, 0.018);
      n.connect(bp).connect(g);
    }
    if (big) this.chime([72, 76, 79, 84], 0.12);
  }

  /** A little rising chime (stars, an unlock). */
  chime(notes: readonly number[], step = 0.1, level = 1): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    notes.forEach((m, i) => {
      const at = t + i * step;
      const o = ctx.createOscillator();
      o.frequency.value = midiHz(m);
      const g = this.out(ctx, this.master, 0, 1, at, 1);
      this.env(g.gain, at, 0.14 * level, 0.003, 0.6);
      o.connect(g);
      o.start(at);
      o.stop(at + 0.7);
    });
  }

  /** The bandmate's chirp (happy: up; your turn: up-down). */
  chirp(kind: 'happy' | 'turn' | 'hello'): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    const f = kind === 'happy' ? [1700, 2600] : kind === 'turn' ? [2200, 1500] : [1500, 2300];
    o.frequency.setValueAtTime(f[0], t);
    o.frequency.exponentialRampToValueAtTime(f[1], t + 0.09);
    if (kind !== 'happy') o.frequency.exponentialRampToValueAtTime(f[0], t + 0.18);
    const g = this.out(ctx, this.master, 0, 0.5, t, 1);
    this.env(g.gain, t, 0.12, 0.01, 0.17);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.25);
  }

  /** A soft card tap (choosing a song, a setting). */
  tick(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const n = this.noiseSrc(ctx, t, 0.02);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2200;
    const g = this.out(ctx, this.master, 0, 0.2, t, 1);
    this.env(g.gain, t, 0.18, 0.001, 0.025);
    n.connect(bp).connect(g);
  }
}

function impulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

export const audio = new Engine();
