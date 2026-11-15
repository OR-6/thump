/**
 * Audio: one AudioContext (latency hint 'interactive'), created on the first gesture.
 *
 * Instruments are recorded clips (src/audio/sampler.ts: CC0, the Versilian Community Sample Library), picked by
 * how hard you hit and re-pitched to the note; synthesised voices stand in until they've loaded. Each hit takes a
 * velocity (louder and brighter when harder) and a pan (from where it lies). Hits play at once (scheduled for the
 * current audio time on the frame they're seen); the band and the beat light are scheduled ahead on the same clock.
 *
 * Mix: everything → master; a 1.9 s room reverb on a send; a soft limiter with four times the headroom (a curve, no
 * look-ahead: no added latency) so two hands and the band together round off rather than clip.
 */
import type { Lane } from '../config.js';
import type { BedEvent } from '../songs/chart.js';
import type { Family } from '../room/classify.js';
import { MODAL } from './modal.js';
import { Sampler } from './sampler.js';
import { StemPlayer } from './stems.js';

export type Voice = Lane | 'knock' | 'rim' | 'clap' | 'block' | 'bell';

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class Engine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private drums!: GainNode;
  private bedBus!: GainNode;
  /** The band in a song (whatever's scheduled ahead, not what you play this moment), through a filter your playing
   * opens and your misses close. */
  private bandBus!: GainNode;
  private bandTone!: BiquadFilterNode;
  private grooveCut = 20000;
  private clickBus!: GainNode;
  /** The band's keys (high-passed: the low end is the bass's and the kick's) and its bass (dry: no room on it), each
   * through a gain the band's kick dips (the pump); the bed's room send. */
  private compBus!: GainNode;
  private compDuck!: GainNode;
  private bassBus!: GainNode;
  private bassDuck!: GainNode;
  private bedWet!: GainNode;
  /** The song's mix (its style's: src/songs/arrange.ts): how far the held parts dip under the kick, how much room. */
  private duckDepth = 0;
  private roomSend = 0.16;
  private reverbOn = true;
  private send!: GainNode;
  /** A song's recorded backing track (src/audio/stems.ts), into the band's bus. */
  readonly stems = new StemPlayer();
  private stemBus!: GainNode;
  private noise!: AudioBuffer;
  private paused = false;
  /** Backing band on/off (the drums always play). */
  bedOn = true;
  /** Hits played (debug/E2E): per voice, and the last one's gain. */
  readonly played: Record<string, number> = {};
  /** Recorded instruments (CC0), used once loaded; the synthesised voices stand in until then. */
  readonly sampler = new Sampler();
  lastGain = 0;
  lastVoice = '';
  /** Audio time of the last drum hit played (debug: hit-to-sound is this minus the frame's hit time). */
  lastAt = 0;

  /** Create/resume the context. Call from a user gesture path. */
  resume(): void {
    try {
      if (!this.ctx) this.build();
      if (this.ctx && this.ctx.state === 'suspended' && !this.paused) void this.ctx.resume().catch(() => {});
    } catch {
      /* no audio: every hit still has its visual twin */
    }
  }

  setPaused(p: boolean): void {
    this.paused = p;
    if (!this.ctx) return;
    if (p) void this.ctx.suspend().catch(() => {});
    else void this.ctx.resume().catch(() => {});
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
    this.reverbOn = on;
    if (this.send) this.send.gain.value = on ? this.roomSend : 0;
  }

  /** A song's mix: how far its held parts dip under the kick (0..1) and its room (the reverb send); null, the default. */
  mix(m: { duck: number; room: number } | null): void {
    this.duckDepth = m ? Math.max(0, Math.min(0.8, m.duck)) : 0;
    this.roomSend = m ? m.room : 0.16;
    if (this.send) this.send.gain.value = this.reverbOn ? this.roomSend : 0;
  }

  private build(): void {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.wire(ctx);
    this.sampler.load(ctx);
  }

  /** The mix's buses on a context (the live one, or an offline one for a render). */
  private wire(ctx: BaseAudioContext): void {
    const clip = ctx.createWaveShaper();
    clip.curve = softClip();
    clip.oversample = '2x';
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    // the shaper only sees −1..1: feed it a quarter, and its curve reads that as −4..4 (two hard hands and the
    // band together round off smoothly instead of hitting a wall)
    const pad = ctx.createGain();
    pad.gain.value = 1 / CLIP_RANGE;
    this.master.connect(pad).connect(clip).connect(ctx.destination);
    this.drums = ctx.createGain();
    this.drums.connect(this.master);
    // the fill's echo: a dotted-eighth delay on what's played, opened only during a solo
    this.echoSend = ctx.createGain();
    this.echoSend.gain.value = 0;
    this.echoDelay = ctx.createDelay(2);
    const fb = (this.echoFb = ctx.createGain());
    fb.gain.value = 0;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 3800;
    // (no kick body in the repeats: they'd smear the low end)
    const thin = ctx.createBiquadFilter();
    thin.type = 'highpass';
    thin.frequency.value = 350;
    this.drums.connect(this.echoSend).connect(thin).connect(this.echoDelay).connect(tone).connect(this.master);
    tone.connect(fb).connect(this.echoDelay);
    this.bandTone = ctx.createBiquadFilter();
    this.bandTone.type = 'lowpass';
    this.bandTone.frequency.value = 20000;
    this.bandTone.Q.value = 0.8;
    this.bandBus = ctx.createGain();
    this.bandBus.connect(this.bandTone).connect(this.master);
    // (the stems are mastered to about −14 LUFS: under the master's gain they sit about −21 LUFS out, under your part)
    this.stemBus = ctx.createGain();
    this.stemBus.gain.value = this.bedOn ? STEM_LEVEL : 0;
    this.stemBus.connect(this.bandBus);
    this.bedBus = ctx.createGain();
    this.bedBus.gain.value = this.bedOn ? 0.55 : 0;
    this.bedBus.connect(this.master);
    this.compBus = ctx.createGain();
    const lowCut = ctx.createBiquadFilter();
    lowCut.type = 'highpass';
    lowCut.frequency.value = 140;
    lowCut.Q.value = 0.6;
    this.compDuck = ctx.createGain();
    this.compBus.connect(lowCut).connect(this.compDuck).connect(this.bedBus);
    this.bassBus = ctx.createGain();
    this.bassBus.gain.value = this.bedOn ? 0.55 : 0;
    this.bassDuck = ctx.createGain();
    this.bassBus.connect(this.bassDuck).connect(this.master);
    this.clickBus = ctx.createGain();
    this.clickBus.gain.value = 0.25;
    this.clickBus.connect(this.master);
    const conv = ctx.createConvolver();
    conv.buffer = room(ctx, 1.9);
    this.send = ctx.createGain();
    this.send.gain.value = this.reverbOn ? this.roomSend : 0;
    this.send.connect(conv).connect(this.master);
    this.bedWet = ctx.createGain();
    this.bedWet.gain.value = 0.7;
    this.bedBus.connect(this.bedWet).connect(this.send);
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  private echoSend: GainNode | null = null;
  private echoDelay: DelayNode | null = null;
  private echoFb: GainNode | null = null;
  /** Open (or close) the fill's echo, a dotted eighth at this tempo (seconds per beat). */
  echo(on: boolean, spb: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.echoSend || !this.echoDelay) return;
    const t = ctx.currentTime;
    this.echoDelay.delayTime.setTargetAtTime(Math.min(1.9, 0.75 * spb), t, 0.01);
    this.echoSend.gain.setTargetAtTime(on ? 0.32 : 0, t, 0.05);
    // closing, the repeats die quickly too (they'd fall over the drop otherwise)
    this.echoFb?.gain.setTargetAtTime(on ? 0.3 : 0, t, on ? 0.05 : 0.08);
  }

  setBed(on: boolean): void {
    this.bedOn = on;
    if (this.bedBus) this.bedBus.gain.value = on ? 0.55 : 0;
    if (this.bassBus) this.bassBus.gain.value = on ? 0.55 : 0;
    if (this.stemBus) this.stemBus.gain.value = on ? STEM_LEVEL : 0;
  }

  /** Fetch and decode a song's backing track (its stems), if it has one. */
  stemLoad(id: string): void {
    if (!this.ctx) this.resume();
    if (this.ctx) this.stems.load(this.ctx, id);
  }
  stemReady(id: string): boolean {
    return this.stems.ready(id);
  }
  /** Play song `id`'s stems, beat 0 at audio time `zero`, from audio time `from`. False: audio isn't running yet. */
  stemPlay(id: string, zero: number, from: number): boolean {
    const ctx = this.ready();
    if (!ctx || this.offline || zero <= 0) return false;
    this.stems.play(ctx, this.stemBus, id, zero, from);
    return true;
  }
  stemStop(fade = 0.03): void {
    this.stems.stop(this.ctx, fade);
  }
  stemLevel(stem: string, v: number, tau?: number): void {
    this.stems.level(this.ctx, stem, v, tau);
  }

  /** The band's kick: the held parts dip under it and swell back (the pump), as deep as the song's style asks. */
  private duckAt(t: number): void {
    const d = this.duckDepth;
    if (!d || !this.compDuck) return;
    for (const [g, k] of [
      [this.compDuck, 1],
      [this.bassDuck, 0.6],
    ] as const) {
      g.gain.setTargetAtTime(1 - d * k, t, 0.004);
      g.gain.setTargetAtTime(1, t + 0.05, 0.07 + 0.08 * d);
    }
  }

  /** Rendering offline (tools/render-song.mjs): everything plays into that context, now. */
  private offline = false;

  /**
   * Debug (tools/render-song.mjs): `seconds` of whatever `play` schedules (from audio time `t0`), rendered offline
   * through this same mix, from the clips already loaded. The live context is untouched.
   */
  async render(seconds: number, play: (t0: number) => void, rate = 44100): Promise<AudioBuffer | null> {
    const Off = globalThis.OfflineAudioContext;
    if (!Off) return null;
    const off = new Off(2, Math.ceil(seconds * rate), rate);
    const keep = { ctx: this.ctx, master: this.master, drums: this.drums, bedBus: this.bedBus, bandBus: this.bandBus, bandTone: this.bandTone, clickBus: this.clickBus, send: this.send, noise: this.noise, echoSend: this.echoSend, echoDelay: this.echoDelay, echoFb: this.echoFb, voices: this.voices, voiced: this.voiced, grooveCut: this.grooveCut, compBus: this.compBus, compDuck: this.compDuck, stemBus: this.stemBus, bassBus: this.bassBus, bassDuck: this.bassDuck, bedWet: this.bedWet, organWave: this.organWave };
    this.voiced = new Map();
    this.organWave = null;
    this.ctx = off as unknown as AudioContext;
    this.offline = true;
    this.voices = [];
    this.grooveCut = 20000;
    try {
      this.wire(off);
      play(0.05);
    } finally {
      this.offline = false;
      Object.assign(this, keep);
    }
    return off.startRendering();
  }

  private ready(): AudioContext | null {
    if (this.offline) return this.ctx;
    if (!this.ctx) this.resume();
    const c = this.ctx;
    if (c && c.state !== 'running' && !this.paused) void c.resume().catch(() => {});
    return c && c.state === 'running' && !this.paused ? c : null;
  }

  /** A gain → (pan) → bus chain; returns the gain to feed. */
  private out(ctx: AudioContext, bus: AudioNode, pan: number, wet: number, when: number, level: number): GainNode {
    // (the band: anything scheduled ahead goes through the band's filter; what you play now goes straight out)
    if (this.bandBus && (bus === this.master || bus === this.drums) && when > ctx.currentTime + 0.012) bus = this.bandBus;
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
  /** The kit's sound: recorded acoustic drums, the same played softer in a bigger room (jazz), or synthesised
   * (electronic). */
  kitStyle: 'acoustic' | 'jazz' | 'electronic' = 'acoustic';

  drum(voice: Voice, vel: number, pan = 0, when = 0, size = 1): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = Math.max(ctx.currentTime, when || ctx.currentTime);
    const v0 = Math.max(0.05, Math.min(1, vel));
    // (a jazz kit is played lighter: a softer kick, everything a touch quieter, more of the room)
    const jazz = this.kitStyle === 'jazz';
    const v = jazz ? v0 * (voice === 'kick' ? 0.7 : 0.88) : v0;
    this.played[voice] = (this.played[voice] ?? 0) + 1;
    this.lastGain = v;
    this.lastVoice = voice;
    this.lastAt = t;
    // (the band's held parts dip under a kick)
    if (voice === 'kick') this.duckAt(t);
    // the floor tom is the tom, bigger and lower
    if (voice === 'floor') size = Math.max(size, 2.2);
    const big = Math.max(1, size);
    const key = voice === 'floor' ? 'kit:tom' : voice === 'ride' ? 'ride' : `kit:${voice}`;
    const electronic = this.kitStyle === 'electronic' && (voice === 'kick' || voice === 'snare' || voice === 'hat' || voice === 'tom' || voice === 'floor' || voice === 'crash' || voice === 'ride');
    if (!electronic && this.sampler.has(key)) {
      // a big surface's drum (a wall) is a little lower and roomier
      this.playSample(ctx, key, null, v, 0, Math.min(1, (big - 1) / 2) * 0.6 + 0.5, pan, (voice === 'hat' ? 0.25 : 0.45) + (jazz ? 0.2 : 0), DRUM_LEVEL[voice] ?? 0.8, t, key);
      // the cajon's bass tone gets a sub underneath: a kick you feel
      if (voice !== 'kick') return;
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(90 / Math.sqrt(big), t);
      o.frequency.exponentialRampToValueAtTime(45 / Math.sqrt(big), t + 0.08);
      const g = this.out(ctx, this.drums, pan, 0, t, 1);
      this.env(g.gain, t, 0.55 * v, 0.003, 0.22);
      o.connect(g);
      o.start(t);
      o.stop(t + 0.35);
      return;
    }
    switch (voice === 'floor' ? 'tom' : voice) {
      case 'crash':
      case 'ride': {
        // a cymbal: bright noise, high-passed, a long ring (the ride shorter, with a bell ping on top)
        const ride = voice === 'ride';
        const n = this.noiseSrc(ctx, t, ride ? 1.2 : 2.2);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = ride ? 5200 : 3800;
        const g = this.out(ctx, this.drums, pan, 0.6, t, 1);
        this.env(g.gain, t, (ride ? 0.22 : 0.4) * v, 0.002, ride ? 0.9 : 1.9);
        n.connect(hp).connect(g);
        if (ride) {
          const o = ctx.createOscillator();
          o.type = 'square';
          o.frequency.value = 2400;
          const og = this.out(ctx, this.drums, pan, 0.4, t, 1);
          this.env(og.gain, t, 0.05 * v, 0.001, 0.35);
          o.connect(og);
          o.start(t);
          o.stop(t + 0.5);
        }
        break;
      }
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
        // a second harmonic and a short body tone: small speakers can't play 50 Hz, they can play these
        const o2 = ctx.createOscillator();
        o2.type = 'triangle';
        o2.frequency.setValueAtTime(f0 * 2, t);
        o2.frequency.exponentialRampToValueAtTime(130 / Math.sqrt(big), t + 0.05);
        const g2 = this.out(ctx, this.drums, pan, 0.3, t, 1);
        this.env(g2.gain, t, 0.38 * v, 0.002, 0.12);
        o2.connect(g2);
        o2.start(t);
        o2.stop(t + 0.2);
        const body = ctx.createOscillator();
        body.frequency.value = 240;
        const gb = this.out(ctx, this.drums, pan, 0, t, 1);
        this.env(gb.gain, t, 0.16 * v, 0.001, 0.03);
        body.connect(gb);
        body.start(t);
        body.stop(t + 0.06);
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
        // its second and third harmonics carry it on small speakers
        const h2 = ctx.createOscillator();
        h2.type = 'triangle';
        h2.frequency.setValueAtTime(((120 + 25 * v) / Math.sqrt(big)) * 2, t);
        h2.frequency.exponentialRampToValueAtTime((82 / Math.sqrt(big)) * 2, t + 0.22);
        const gh = this.out(ctx, this.drums, pan, 0.5, t, 1);
        this.env(gh.gain, t, 0.3 * v, 0.003, 0.25);
        h2.connect(gh);
        h2.start(t);
        h2.stop(t + 0.4);
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
        // inharmonic partials with a slow bloom and a long tail (DESIGN.md §3.3)
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

  /**
   * A tuned instrument from the room (DESIGN.md §3.4): `midi` its note, `vel` 0..1, `size` 0..1 the surface's
   * size within its family (bigger: lower partial decay, longer ring).
   */
  modal(family: Family, midi: number, vel: number, pan = 0, when = 0, size = 0.5, owner = '', tone = 0, hold = false): void {
    const sctx = this.ready();
    if (sctx && this.sampler.has(family)) {
      const t = Math.max(sctx.currentTime, when || sctx.currentTime);
      const v = Math.max(0.05, Math.min(1, vel));
      this.played[family] = (this.played[family] ?? 0) + 1;
      this.lastGain = v;
      this.lastVoice = family;
      this.lastAt = t;
      const pitched = !UNPITCHED.has(family);
      const wet = MODAL[family]?.wet ?? MODAL[ALIAS[family] ?? 'marimba']?.wet ?? 1;
      this.playSample(sctx, family, pitched ? midi : null, v, tone, size, pan, wet, FAMILY_LEVEL[family] ?? 0.7, t, owner || family, this.drums, hold);
      return;
    }
    if (family === 'stomp') return this.stomp(vel, pan, when);
    if (family === 'shaker' || family === 'tambourine') return this.shake(vel, pan, when, size);
    const pre = MODAL[family] ?? MODAL[ALIAS[family] ?? 'marimba'];
    const ctx = this.ready();
    if (!pre || !ctx) return;
    const t = Math.max(ctx.currentTime, when || ctx.currentTime);
    const v = Math.max(0.05, Math.min(1, vel));
    this.played[family] = (this.played[family] ?? 0) + 1;
    this.lastGain = v;
    this.lastVoice = family;
    this.lastAt = t;
    const f0 = midiHz(midi);
    const long = 0.75 + 0.6 * Math.min(1, Math.max(0, size));
    // every family peaks at about the same level, however many partials it has
    let sum = 0;
    for (const m of pre.modes) sum += m.amp * 0.5 * (m.beat ? 1 : 1);
    const norm = 0.6 / Math.max(0.6, sum);
    // no two hits quite alike: ±1 dB, ±6 cents, ±8% ring
    const life = 1 + (Math.random() - 0.5) * 0.16;
    const lvl = Math.pow(10, ((Math.random() - 0.5) * 2) / 20);
    const cents = (Math.random() - 0.5) * 12;
    const g = this.out(ctx, this.drums, pan, pre.wet, t, pre.level * norm * (0.1 + 0.9 * v) * lvl);
    let into: AudioNode = g;
    if (pre.lowpass > 0) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = pre.lowpass * (0.7 + 0.6 * v);
      lp.connect(g);
      into = lp;
    }
    let end = t;
    const oscs: OscillatorNode[] = [];
    for (let k = 0; k < pre.modes.length; k++) {
      const m = pre.modes[k];
      const f = f0 * m.ratio;
      if (f > 16000) continue;
      // a harder hit brings up the upper partials
      const amp = m.amp * (k === 0 ? 1 : 0.35 + 0.65 * v);
      const dec = m.decay * long * life;
      // a gong blooms: its upper modes come in one after another
      const at = t + (pre.stagger ?? 0) * k;
      const twins = m.beat ? 2 : 1;
      for (let w = 0; w < twins; w++) {
        const o = ctx.createOscillator();
        o.frequency.value = w === 0 ? f : f + m.beat!;
        o.detune.value = cents;
        // and its fundamental sags a little as it rings
        if (k === 0 && pre.sag) o.detune.linearRampToValueAtTime(cents + pre.sag, at + dec);
        const pg = ctx.createGain();
        pg.gain.value = 0;
        this.env(pg.gain, at, (amp * 0.5) / twins, pre.attack, dec);
        o.connect(pg).connect(into);
        o.start(t);
        o.stop(at + pre.attack + dec + 0.05);
        oscs.push(o);
      }
      end = Math.max(end, at + dec);
    }
    const n = this.noiseSrc(ctx, t, pre.noise.dur);
    const nf = ctx.createBiquadFilter();
    nf.type = pre.noise.type;
    nf.frequency.value = pre.noise.freq;
    nf.Q.value = pre.noise.q;
    const ng = ctx.createGain();
    this.env(ng.gain, t, pre.noise.amp * v * 1.6, 0.001, pre.noise.dur);
    n.connect(nf).connect(ng).connect(g);
    this.claimVoice(owner || family, g, t, end, oscs);
  }

  /** A recorded clip: on its note, louder and brighter with the hit (soft hits are darker), through the room. */
  /**
   * `hold`: a key held down (the piano). The recording plays, then crossfades in phase into a seamless loop of its own
   * middle, which fades as a held piano note does (about 8 s), until `release(owner)` lifts the key. Without it, the
   * recording plays to its end as before.
   */
  private playSample(ctx: AudioContext, key: string, midi: number | null, v: number, tone: number, size: number, pan: number, wet: number, level: number, t: number, owner: string, bus: AudioNode = this.drums, hold = false): void {
    const c = this.sampler.pick(key, { midi, vel: v, tone, size });
    if (!c) return;
    const src = ctx.createBufferSource();
    src.buffer = c.buffer;
    src.playbackRate.value = c.rate * Math.pow(2, ((Math.random() - 0.5) * 8) / 1200);
    const g = this.out(ctx, bus, pan, wet, t, level * (0.12 + 0.88 * v));
    // a soft hit is darker as well as quieter (the recordings have 2–3 layers; this fills between them)
    let dst: AudioNode = g;
    if (v < 0.75) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2500 + 15000 * v * v;
      lp.connect(g);
      dst = lp;
    }
    const rate = src.playbackRate.value;
    let end = t + c.buffer.duration / rate;
    const loop = hold && owner ? this.loopOf(ctx, c.buffer) : null;
    if (!loop) {
      src.connect(dst);
      src.start(t);
      src.stop(end + 0.02);
      if (owner) this.claimVoice(owner, g, t, end, [src]);
      return;
    }
    // the hand-over, where the loop's own samples are the recording's (so the two are in phase): 40 ms crossfade
    const gm = ctx.createGain();
    const gl = ctx.createGain();
    src.connect(gm).connect(dst);
    const ls = ctx.createBufferSource();
    ls.buffer = loop.buf;
    ls.loop = true;
    ls.playbackRate.value = rate;
    ls.connect(gl).connect(dst);
    const at = t + loop.at / rate;
    gm.gain.setValueAtTime(1, at);
    gm.gain.linearRampToValueAtTime(0, at + 0.04);
    gl.gain.setValueAtTime(0, at);
    gl.gain.linearRampToValueAtTime(1, at + 0.04);
    // (held, a piano note fades slowly: about 60% gone in 2.5 s; silent by 15 s)
    gl.gain.setTargetAtTime(0, at + 0.04, 2.5);
    src.start(t);
    src.stop(Math.min(end, at + 0.06) + 0.02);
    ls.start(at, loop.off);
    end = t + 15;
    ls.stop(end);
    this.claimVoice(owner, g, t, end, [src, ls]);
    const mine = this.voices[this.voices.length - 1];
    if (mine?.g === g) {
      mine.t = t;
      mine.held = true;
    }
  }

  /**
   * A held key lifted: its notes damp, as a piano's damper falls (not before 0.2 s after the strike, so a quick tap is
   * still a note, then gone in about half a second).
   */
  release(owner: string): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const v of this.voices) {
      if (v.owner !== owner || !v.held) continue;
      v.held = false;
      const at = Math.max(now, (v.t ?? now) + 0.2);
      const gp = v.g.gain as AudioParam & { cancelAndHoldAtTime?: (t: number) => void };
      if (gp.cancelAndHoldAtTime) gp.cancelAndHoldAtTime(at);
      else {
        gp.cancelScheduledValues(at);
        gp.setValueAtTime(gp.value, at);
      }
      gp.setTargetAtTime(0, at, 0.12);
      v.end = at + 0.8;
      if (v.oscs) for (const o of v.oscs) try { o.stop(v.end); } catch { /* already stopped */ }
    }
  }

  /**
   * A recording made into a seamless loop, once per recording: about 0.3 s from 0.12 s in, its decay taken out (a
   * straight line in dB fitted to it, so the loop neither pulses nor wobbles), its length chosen so its end runs on
   * into its start in phase, and the two crossfaded. Levelled to where it takes over from the recording, so the hand-
   * over doesn't jump. `at`: where in the recording (s) it takes over; `off`: where in the loop that is.
   */
  private loops = new WeakMap<AudioBuffer, { buf: AudioBuffer; at: number; off: number } | null>();
  private loopOf(ctx: AudioContext, b: AudioBuffer): { buf: AudioBuffer; at: number; off: number } | null {
    if (this.loops.has(b)) return this.loops.get(b)!;
    const sr = b.sampleRate;
    const A = Math.floor(0.12 * sr);
    const L = Math.min(Math.floor(0.32 * sr), b.length - A - Math.floor(0.03 * sr));
    const X = Math.floor(0.05 * sr);
    if (L < Math.floor(0.15 * sr)) {
      this.loops.set(b, null);
      return null;
    }
    const chs = b.numberOfChannels;
    const data: Float32Array[] = [];
    for (let ch = 0; ch < chs; ch++) data.push(b.getChannelData(ch));
    // the decay: dB over 10 ms blocks, smoothed over 70 ms (it follows the bend of a note's early decay, and is too
    // slow to ripple with the pitch)
    const B = Math.floor(0.01 * sr);
    const nb = Math.floor(L / B);
    const raw = new Float32Array(nb);
    for (let k = 0; k < nb; k++) {
      let e = 0;
      for (const d of data) for (let i = A + k * B; i < A + (k + 1) * B; i++) e += d[i] * d[i];
      raw[k] = 10 * Math.log10(e / (B * chs) + 1e-12);
    }
    const env = new Float32Array(nb);
    for (let k = 0; k < nb; k++) {
      let sum = 0, n = 0;
      for (let j = Math.max(0, k - 3); j <= Math.min(nb - 1, k + 3); j++) {
        sum += raw[j];
        n++;
      }
      env[k] = sum / n;
    }
    const dbAt = (i: number) => {
      const f = Math.max(0, Math.min(nb - 1, i / B - 0.5));
      const k = Math.floor(f);
      const k2 = Math.min(nb - 1, k + 1);
      return env[k] + (env[k2] - env[k]) * (f - k);
    };
    // the gain that holds the level where the loop takes over (index X), at most 40 dB up
    const ref = dbAt(X);
    const gain = (i: number) => Math.min(100, Math.pow(10, (ref - dbAt(i)) / 20));
    const flat = (d: Float32Array, i: number) => d[A + i] * gain(i);
    // the loop's length: the end that best continues into the start (correlated over 20 ms), within its last 25 ms
    const W = Math.floor(0.02 * sr);
    const d0 = data[0];
    let N = L - X;
    let best = -2;
    for (let n = L - X - Math.floor(0.025 * sr); n <= L - X; n++) {
      let ab = 0, aa = 0, bb = 0;
      for (let j = 0; j < W; j++) {
        const a = flat(d0, j), c = flat(d0, n + j);
        ab += a * c; aa += a * a; bb += c * c;
      }
      const r = ab / Math.sqrt(aa * bb + 1e-12);
      if (r > best) {
        best = r;
        N = n;
      }
    }
    const out = ctx.createBuffer(chs, N, sr);
    const lin = best > 0.6;
    for (let ch = 0; ch < chs; ch++) {
      const d = data[ch];
      const o = out.getChannelData(ch);
      for (let i = 0; i < N; i++) {
        const a = flat(d, i);
        if (i >= X) {
          o[i] = a;
          continue;
        }
        // (in phase, a straight crossfade; else equal power: the loop's last sample runs on into its first)
        const w = i / X;
        const c = flat(d, N + i);
        o[i] = lin ? a * w + c * (1 - w) : a * Math.sin(w * Math.PI * 0.5) + c * Math.cos(w * Math.PI * 0.5);
      }
    }
    const r = { buf: out, at: (A + X) / sr, off: X / sr };
    this.loops.set(b, r);
    return r;
  }

  /**
   * Plucked strings, made once per note and kind: a burst of noise in a tuned loop. The nylon guitar's own voice, and
   * the acoustic's stand-in until its recordings (a real steel-string, CC0) have loaded.
   */
  private strings = new Map<string, AudioBuffer>();
  private stringBuffer(ctx: AudioContext, midi: number, kind: 'nylon' | 'steel'): AudioBuffer {
    const id = `${kind}:${midi}`;
    let b = this.strings.get(id);
    if (b) return b;
    const sr = ctx.sampleRate;
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const steel = kind === 'steel';
    // (the two-tap average delays the loop by 1 − w samples: take it off, or the top strings ring flat. A plain
    // average, w a half, loses the highs fastest: an acoustic's brightness is gone in a moment, an electric's stays)
    const w = 0.5;
    const n = Math.max(2, sr / f - (1 - w));
    const N = Math.floor(n);
    const frac = n - N;
    // the string: each pass averages neighbours (losing highs first) and loses a little, tuned by a fractional tap; an
    // acoustic's low E is down 60 dB in under three seconds, its top strings in under one (nylon a little longer up top)
    const t60 = steel ? Math.max(0.8, Math.min(3, 2.8 * Math.pow(82 / f, 0.7))) : Math.max(1, Math.min(4, 3.2 * Math.pow(82 / f, 0.5)));
    const len = Math.floor(sr * (steel ? Math.min(3, t60 + 0.4) : 1.9));
    b = ctx.createBuffer(1, len, sr);
    const y = b.getChannelData(0);
    // the pluck: noise, softened (a fingertip on nylon; a soft pick on steel, no brighter)
    let lp = 0;
    const soft = steel ? 0.35 : 0.45;
    for (let i = 0; i < N + 1 && i < len; i++) {
      lp += soft * (Math.random() * 2 - 1 - lp);
      y[i] = lp;
    }
    // (where it's picked, a fifth of the way from the bridge, over the soundhole: the harmonics with a node there go
    // quiet, as on a real string; it is what makes it a guitar, not a harp)
    const P = Math.max(1, Math.round(N * (steel ? 0.2 : 0.18)));
    const e = y.slice(0, N + 1);
    // (the comb can nearly double a peak: scaled back, so six strings at once don't clip)
    for (let i = 0; i <= N && i < len; i++) y[i] = (steel ? 0.9 : 0.62) * (e[i] - 0.9 * e[(i - P + N + 1) % (N + 1)]);
    const loss = Math.pow(0.001, 1 / (t60 * f));
    for (let i = N + 1; i < len; i++) {
      const a0 = y[i - N];
      const a1 = y[i - N - 1];
      const d = a0 + (a1 - a0) * frac;
      const d2 = i - N - 2 >= 0 ? y[i - N - 1] + (y[i - N - 2] - y[i - N - 1]) * frac : d;
      y[i] = loss * (w * d + (1 - w) * d2);
    }
    // the box answers every pluck: a short knock of its air (about 100 Hz), its top (about 200) and the boxy ring
    // round 470 Hz, gone in a tenth of a second
    if (steel)
      for (let i = 0, end = Math.min(len, Math.floor(sr * 0.5)); i < end; i++) {
        const t = i / sr;
        const on = Math.min(1, t / 0.0015);
        y[i] += on * (0.16 * Math.exp(-t / 0.09) * Math.sin(2 * Math.PI * 102 * t) + 0.12 * Math.exp(-t / 0.05) * Math.sin(2 * Math.PI * 204 * t) + 0.07 * Math.exp(-t / 0.022) * Math.sin(2 * Math.PI * 470 * t));
      }
    if (this.strings.size > 64) this.strings.delete(this.strings.keys().next().value as string);
    this.strings.set(id, b);
    return b;
  }

  /**
   * Make a guitar's strings ahead of time (every note a strum can use), one a frame from `idle()`, so the first strum
   * of a chord doesn't stop the frame to build them.
   */
  prepareStrings(kind: 'nylon' | 'steel'): void {
    // (the acoustic plays its recordings once they're in)
    if (kind === 'steel' && this.sampler.has('guitar')) return;
    for (let m = 40; m <= 81; m++) if (!this.strings.has(`${kind}:${m}`)) this.stringQueue.push(m, kind === 'steel' ? 1 : 0);
  }
  private stringQueue: number[] = [];
  /** A little background work, once a frame. */
  idle(): void {
    const ctx = this.ctx;
    if (!ctx || this.stringQueue.length < 2) return;
    const m = this.stringQueue.shift()!;
    const k = this.stringQueue.shift()!;
    this.stringBuffer(ctx, m, k ? 'steel' : 'nylon');
  }

  /**
   * One plucked string (the guitar): `midi`, loudness 0..1, at audio time `when`. `owner` (a string of the guitar):
   * a new note on it stops the last, as a string does.
   */
  pluck(midi: number, vel: number, pan = 0, when = 0, kind: 'nylon' | 'steel' = 'nylon', owner = ''): void {
    const ctx = this.ready();
    if (!ctx) return;
    if (kind === 'steel' && this.pluckRecorded(ctx, midi, vel, pan, when, owner)) return;
    const buf = this.stringBuffer(ctx, midi, kind);
    // (the time read after the string is made: a fresh one takes a moment, and it mustn't land in the past)
    const t = Math.max(ctx.currentTime, when || ctx.currentTime);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    // (a few cents apart string to string: no two strings of a strum agree exactly)
    src.playbackRate.value = Math.pow(2, ((Math.random() - 0.5) * 6) / 1200);
    const v = Math.max(0.05, Math.min(1, vel));
    const level = 0.9 * (0.15 + 0.85 * v);
    const g = this.out(ctx, this.drums, pan, 0.5, t, level);
    const dur = src.buffer.duration;
    // let it fade out rather than stop dead at the end of the buffer
    g.gain.setValueAtTime(level, t + dur - 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    // the body: a nylon guitar's warm box; a steel-string dreadnought's air (about 100 Hz) and top (about 205) that
    // give it its boom, and the boxiness round 500 Hz (no presence lift: that brightness is what read as electric)
    const peak = (hz: number, db: number, q: number) => {
      const f = ctx.createBiquadFilter();
      f.type = 'peaking';
      f.frequency.value = hz;
      f.gain.value = db;
      f.Q.value = q;
      return f;
    };
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 70;
    // a soft pluck is darker as well as quieter
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = kind === 'steel' ? 1000 + 3500 * v : 1500 + 7000 * v;
    if (kind === 'steel') src.connect(hp).connect(peak(100, 4, 1.4)).connect(peak(205, 3, 1.4)).connect(peak(500, 2.5, 1.1)).connect(lp).connect(g);
    else src.connect(hp).connect(peak(180, 5, 1)).connect(lp).connect(g);
    src.start(t);
    src.stop(t + dur);
    if (owner) this.claimVoice(owner, g, t, t + dur, [src], 1);
    this.lastGain = v;
    this.lastAt = t;
  }

  /**
   * The acoustic from its recordings (a Martin steel-string, CC0: src/audio/sample-map.ts), the nearest of fifteen notes
   * re-pitched the rest of the way. False until they've loaded (the synthesised string plays instead).
   */
  private pluckRecorded(ctx: AudioContext, midi: number, vel: number, pan: number, when: number, owner: string): boolean {
    const v = Math.max(0.05, Math.min(1, vel));
    const c = this.sampler.pick('guitar', { midi, vel: v, tone: 0, size: 0.5 });
    if (!c) return false;
    const t = Math.max(ctx.currentTime, when || ctx.currentTime);
    const src = ctx.createBufferSource();
    src.buffer = c.buffer;
    // (a few cents apart string to string: no two strings of a strum agree exactly)
    src.playbackRate.value = c.rate * Math.pow(2, ((Math.random() - 0.5) * 6) / 1200);
    // (a touch louder than the synthesised string: it is darker, and would otherwise sound quieter beside it)
    const level = 0.15 + 0.85 * v;
    const g = this.out(ctx, this.drums, pan, 0.4, t, level);
    // a soft pluck is darker as well as quieter (the thumb, not the pick)
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400 + 12000 * v * v;
    lp.Q.value = -3;
    src.connect(lp).connect(g);
    const end = t + c.buffer.duration / c.rate;
    src.start(t);
    src.stop(end + 0.02);
    if (owner) this.claimVoice(owner, g, t, end, [src], 1);
    this.lastGain = v;
    this.lastAt = t;
    return true;
  }

  /** Each chord sound's last voicing: every chord leads smoothly from its own sound's last one. */
  private voiced = new Map<string, number[]>();

  /** A triad (`root` a MIDI note of its pitch class) in whichever inversion moves least from `id`'s last chord, its
   * lowest note in lo..lo+12 and its highest by lo+18. */
  private voice3(id: string, root: number, minor: boolean, lo: number): number[] {
    const third = minor ? 3 : 4;
    const pcs = [0, third, 7].map((s) => (((root + s) % 12) + 12) % 12);
    const was = this.voiced.get(id) ?? [lo + 8, lo + 12, lo + 15];
    let best = was;
    let bestCost = Infinity;
    for (let inv = 0; inv < 3; inv++) {
      for (let base = lo; base <= lo + 12; base++) {
        if (base % 12 !== pcs[inv]) continue;
        const v = [base];
        for (let k = 1; k < 3; k++) {
          const pc = pcs[(inv + k) % 3];
          let m = v[k - 1] + 1;
          while (m % 12 !== pc) m++;
          v.push(m);
        }
        if (v[2] > lo + 18) continue;
        let cost = 0;
        for (let k = 0; k < 3; k++) cost += Math.abs(v[k] - was[k]);
        if (cost < bestCost) {
          bestCost = cost;
          best = v;
        }
      }
    }
    this.voiced.set(id, best);
    return best;
  }

  /** One note of the band's piano (a recording), let go at the end of its length, into `bus`. */
  private pianoNote(ctx: AudioContext, midi: number, vel: number, dur: number, level: number, pan: number, t: number, bus: AudioNode): void {
    const c = this.sampler.pick('band:piano', { midi, vel, tone: 0, size: 0.5 });
    if (!c) return;
    const src = ctx.createBufferSource();
    src.buffer = c.buffer;
    src.playbackRate.value = c.rate;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level * (0.25 + 0.75 * vel), t);
    // let go at the end of its length (a held chord rings on a little)
    const off = t + Math.min(c.buffer.duration / c.rate, Math.max(0.12, dur));
    g.gain.setTargetAtTime(0, off, 0.08);
    let node: AudioNode = g;
    if (pan !== 0 && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      node = p;
    }
    node.connect(bus);
    src.connect(g);
    src.start(t);
    src.stop(off + 0.5);
  }

  /**
   * The band's bass, dry and under the kick's pump: a played electric (`finger`: a rounded saw whose pluck closes
   * quickly), a synth (`synth`: brighter, a resonant filter that snaps shut), an 808-style sub (`sub`: a sine that
   * knocks down onto its note, with an octave over it so a small speaker still says the note), or the piano's low
   * notes with a sine under them (`piano`, and anything without a sound of its own).
   */
  private bandBass(ctx: AudioContext, e: BedEvent, t: number, len: number, spb: number): void {
    const v = Math.max(0.05, Math.min(1, e.vel));
    const sound = e.sound ?? 'piano';
    if (sound === 'piano' && this.sampler.has('band:piano')) {
      this.pianoNote(ctx, e.midi, v, len, 0.5, 0, t, this.bassBus);
      // a sine an octave under: felt more than heard (phone and Quest speakers lose the piano's lowest partials)
      const o = ctx.createOscillator();
      o.frequency.value = midiHz(e.midi - 12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.15 * v, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.18, Math.min(len, spb * 2)));
      o.connect(g).connect(this.bassBus);
      o.start(t);
      o.stop(t + len + 0.2);
      return;
    }
    const f = midiHz(e.midi);
    const dur = Math.max(0.09, len);
    const sub = sound === 'sub';
    const syn = sound === 'synth';
    const peak = (sub ? 0.32 : syn ? 0.22 : 0.21) * (0.55 + 0.45 * v);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
    g.gain.setTargetAtTime(peak * (sub ? 0.8 : 0.6), t + 0.02, sub ? 0.5 : 0.2);
    g.gain.setTargetAtTime(0.0001, t + dur, sub ? 0.05 : 0.025);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    if (sub) {
      o1.type = 'sine';
      o1.frequency.setValueAtTime(f * 1.5, t);
      o1.frequency.exponentialRampToValueAtTime(f, t + 0.03);
      o2.type = 'triangle';
      o2.frequency.value = f * 2;
      g2.gain.value = 0.3;
      lp.frequency.value = 900;
    } else {
      o1.type = 'sawtooth';
      o1.frequency.value = f;
      o2.type = syn ? 'square' : 'sine';
      o2.frequency.value = f;
      o2.detune.value = syn ? 9 : 0;
      g2.gain.value = syn ? 0.5 : 0.9;
      lp.Q.value = syn ? 5 : 0.7;
      lp.frequency.setValueAtTime(syn ? 600 + 2600 * v : 380 + 1500 * v, t);
      lp.frequency.setTargetAtTime(syn ? 320 : 400, t + 0.005, syn ? 0.12 : 0.09);
    }
    o1.connect(lp);
    o2.connect(g2).connect(lp);
    lp.connect(g).connect(this.bassBus);
    const end = t + dur + 0.3;
    o1.start(t);
    o2.start(t);
    o1.stop(end);
    o2.stop(end);
  }

  private organWave: PeriodicWave | null = null;

  /**
   * The band's keys: the piano (a recording) close-voiced and led smoothly, short or held (`piano`, and anything
   * without a sound of its own); a reggae or ska skank (`skank`: the piano high and short); a synth stab (`stab`: saws
   * through a filter that snaps shut); a pad (`pad`: soft detuned saws; `strings`: brighter and slower to come in);
   * an organ (`organ`: drawbars). All of it high-passed and under the kick's pump.
   */
  private bandChord(ctx: AudioContext, e: BedEvent, t: number, len: number, spb: number): void {
    const v = Math.max(0.05, Math.min(1, e.vel));
    const sound = e.sound ?? 'piano';
    if ((sound === 'piano' || sound === 'skank') && this.sampler.has('band:piano')) {
      const skank = sound === 'skank';
      const notes = this.voice3(sound, e.midi, !!e.minor, skank ? 60 : 52);
      const hold = len > spb * 1.5;
      // a held chord rolls very slightly, low to high, like a hand on the keys
      notes.forEach((m, k) => this.pianoNote(ctx, m, v * (k === 2 ? 0.9 : 0.8), skank ? Math.min(len, 0.16) : len, skank ? 0.6 : hold ? 0.45 : 0.5, (k - 1) * 0.25, t + (hold ? k * 0.018 : 0), this.compBus));
      return;
    }
    const pad = sound === 'pad' || sound === 'strings';
    const organ = sound === 'organ';
    const stab = !pad && !organ;
    const notes = this.voice3(sound, e.midi, !!e.minor, stab ? 60 : 55);
    if (pad) {
      // (the root under it)
      let r = 48 + ((e.midi % 12) + 12) % 12;
      while (r >= notes[0]) r -= 12;
      notes.unshift(r);
    }
    const atk = sound === 'strings' ? 0.35 : pad ? 0.12 : organ ? 0.012 : 0.003;
    const rel = pad ? 0.3 : organ ? 0.05 : 0.04;
    const dur = Math.max(atk + 0.05, len);
    const lvl = (sound === 'strings' ? 0.08 : pad ? 0.085 : organ ? 0.12 : 0.15) * (0.4 + 0.6 * v);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(lvl, t + atk);
    if (stab) g.gain.setTargetAtTime(lvl * 0.5, t + atk, 0.08);
    g.gain.setTargetAtTime(0, t + dur, rel / 3);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    if (stab) {
      lp.Q.value = 2;
      lp.frequency.setValueAtTime(900 + 4200 * v, t);
      lp.frequency.setTargetAtTime(800, t + 0.005, 0.07);
    } else lp.frequency.value = sound === 'strings' ? 2600 : pad ? 1200 : 3200;
    lp.connect(g).connect(this.compBus);
    if (organ && !this.organWave) {
      // drawbars: the fundamental, its octave and twelfth, a little of the two above
      const real = new Float32Array([0, 1, 0.75, 0.5, 0.3, 0, 0.18, 0, 0.12]);
      this.organWave = ctx.createPeriodicWave(real, new Float32Array(real.length));
    }
    const end = t + dur + rel * 3 + 0.05;
    for (const m of notes) {
      const twins = pad ? [-1, 1] : [0];
      for (const w of twins) {
        const o = ctx.createOscillator();
        if (organ && this.organWave) o.setPeriodicWave(this.organWave);
        else o.type = 'sawtooth';
        o.frequency.value = midiHz(m);
        o.detune.value = w * (sound === 'strings' ? 10 : 7) + (stab ? (Math.random() - 0.5) * 8 : 0);
        o.connect(lp);
        o.start(t);
        o.stop(end);
      }
    }
  }

  /**
   * The band's lead (the tune when it isn't yours), an octave over its note: the tongue drum (`tongue`, and anything
   * without a sound of its own), the piano (`keys`), the marimba, a bell (the glockenspiel), a synth lead (`lead`: two
   * oscillators, a touch of vibrato on a long note) or a reed (`reed`: a melodica's nasal buzz).
   */
  private lead(ctx: AudioContext, e: BedEvent, t: number, len: number): void {
    const sound = e.sound ?? 'tongue';
    const midi = e.midi + 12;
    const v = Math.max(0.05, Math.min(1, e.vel));
    const fam = sound === 'keys' ? 'keys' : sound === 'marimba' ? 'marimba' : sound === 'bell' ? 'glock' : sound === 'tongue' ? 'tongue' : '';
    if (fam && this.sampler.has(fam)) {
      const level = sound === 'keys' ? 1.6 : sound === 'marimba' ? 1.6 : sound === 'bell' ? 0.9 : 1.1;
      this.playSample(ctx, fam, midi, 0.5 * v + 0.2, 0, 0.5, -0.15, fam === 'tongue' ? 0.6 : 0.3, level, t, 'band:lead', this.bedBus);
      return;
    }
    if (sound === 'lead' || sound === 'reed') {
      const reed = sound === 'reed';
      const f = midiHz(midi);
      const dur = Math.max(0.1, len * 0.92);
      const lvl = (reed ? 0.32 : 0.27) * (0.5 + 0.5 * v);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(lvl, t + (reed ? 0.025 : 0.006));
      g.gain.setTargetAtTime(lvl * 0.72, t + 0.04, 0.18);
      g.gain.setTargetAtTime(0, t + dur, 0.05);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = reed ? 3 : 0.8;
      lp.frequency.setValueAtTime(reed ? 2400 : 1800 + 3200 * v, t);
      lp.frequency.setTargetAtTime(reed ? 1500 : 2200, t + 0.01, 0.15);
      let node: AudioNode = g;
      if (ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = -0.1;
        g.connect(p);
        node = p;
      }
      lp.connect(g);
      node.connect(this.bedBus);
      const end = t + dur + 0.3;
      const oscs: OscillatorNode[] = [];
      for (const [type, det, a] of [
        ['sawtooth', 0, 1],
        [reed ? 'square' : 'square', reed ? 0 : 7, reed ? 0.6 : 0.45],
      ] as const) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f;
        o.detune.value = det;
        const og = ctx.createGain();
        og.gain.value = a;
        o.connect(og).connect(lp);
        o.start(t);
        o.stop(end);
        oscs.push(o);
      }
      // a long note sings: a little vibrato comes in after it starts
      if (dur > 0.5) {
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 5.3;
        const depth = ctx.createGain();
        depth.gain.setValueAtTime(0, t);
        depth.gain.linearRampToValueAtTime(0, t + 0.25);
        depth.gain.linearRampToValueAtTime(14, t + 0.6);
        lfo.connect(depth);
        for (const o of oscs) depth.connect(o.detune);
        lfo.start(t);
        lfo.stop(end);
      }
      return;
    }
    // a soft kalimba-ish pluck: sine with a fast-fading bright partial
    const o = ctx.createOscillator();
    o.frequency.value = midiHz(midi);
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = midiHz(midi + 12);
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
  }
  /** Ringing voices (gongs, bowls): at most 3 per surface and 24 in all; the oldest fades out to make room. */
  private voices: { owner: string; g: GainNode; end: number; oscs: AudioScheduledSourceNode[] | null; t?: number; held?: boolean }[] = [];
  private claimVoice(owner: string, g: GainNode, t: number, end: number, oscs: AudioScheduledSourceNode[] | null = null, max = 3): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    for (let i = this.voices.length - 1; i >= 0; i--) if (this.voices[i].end < now) this.voices.splice(i, 1);
    let mine = 0;
    for (const v of this.voices) if (v.owner === owner) mine++;
    while (mine >= max || this.voices.length >= 24) {
      const i = mine >= max ? this.voices.findIndex((v) => v.owner === owner) : 0;
      if (i < 0) break;
      const old = this.voices[i];
      // (the same owner's old note stops when the new one starts, not now: a scheduled strum isn't cut early)
      const at = old.owner === owner ? Math.max(now, t) : now;
      const gp = old.g.gain as AudioParam & { cancelAndHoldAtTime?: (t: number) => void };
      if (gp.cancelAndHoldAtTime) gp.cancelAndHoldAtTime(at);
      else {
        gp.cancelScheduledValues(at);
        gp.setValueAtTime(gp.value, at);
      }
      gp.setTargetAtTime(0, at, 0.006);
      // and its partials stop once faded (a gong has a dozen; left running they'd load the audio thread)
      if (old.oscs) for (const o of old.oscs) try { o.stop(at + 0.05); } catch { /* already stopped */ }
      this.voices.splice(i, 1);
      if (old.owner === owner) mine--;
    }
    this.voices.push({ owner, g, end: Math.max(end, t), oscs });
  }

  /** The floor: a low thump you feel. */
  private stomp(vel: number, pan: number, when: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = Math.max(ctx.currentTime, when || ctx.currentTime);
    const v = Math.max(0.05, Math.min(1, vel));
    this.played.stomp = (this.played.stomp ?? 0) + 1;
    this.lastVoice = 'stomp';
    this.lastGain = v;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g = this.out(ctx, this.drums, pan, 0.6, t, 1);
    this.env(g.gain, t, 0.9 * v, 0.003, 0.35);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.5);
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.setValueAtTime(190, t);
    o2.frequency.exponentialRampToValueAtTime(90, t + 0.1);
    const g2 = this.out(ctx, this.drums, pan, 0.3, t, 1);
    this.env(g2.gain, t, 0.3 * v, 0.002, 0.14);
    o2.connect(g2);
    o2.start(t);
    o2.stop(t + 0.2);
  }

  /** A shaker: two quick bursts of bright filtered noise (a bigger cushion: duller and longer). */
  private shake(vel: number, pan: number, when: number, size: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = Math.max(ctx.currentTime, when || ctx.currentTime);
    const v = Math.max(0.05, Math.min(1, vel));
    this.played.shaker = (this.played.shaker ?? 0) + 1;
    this.lastVoice = 'shaker';
    this.lastGain = v;
    for (let k = 0; k < 2; k++) {
      const at = t + k * 0.045;
      const n = this.noiseSrc(ctx, at, 0.09);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 7000 - 2500 * size;
      bp.Q.value = 1.3;
      const g = this.out(ctx, this.drums, pan, 0.8, at, 1);
      this.env(g.gain, at, (k ? 0.3 : 0.45) * v, 0.012, 0.07 + 0.04 * size);
      n.connect(bp).connect(g);
    }
  }

  /** One event of the backing band, at audio time `when`; `spb` seconds per beat. */
  band(e: BedEvent, when: number, spb: number): void {
    const ctx = this.ready();
    if (!ctx || !this.bedOn) return;
    const t = Math.max(ctx.currentTime, when);
    const len = e.len * spb;
    switch (e.voice) {
      case 'bass':
        return this.bandBass(ctx, e, t, len, spb);
      case 'chord': {
        const sampled = !e.sound || e.sound === 'piano' || e.sound === 'skank';
        if (!sampled || this.sampler.has('band:piano')) return this.bandChord(ctx, e, t, len, spb);
        // (until the piano's in: a soft synth chord)
        const third = e.minor ? 3 : 4;
        const g = ctx.createGain();
        const hold = len > spb * 1.5;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.09 * e.vel, t + (hold ? 0.15 : 0.012));
        g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.15, len));
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = hold ? 900 : 1600;
        lp.connect(g).connect(this.compBus);
        for (const s of [0, third, 7, 12]) {
          const o = ctx.createOscillator();
          o.type = 'triangle';
          o.frequency.value = midiHz(e.midi + s);
          o.detune.value = (Math.random() - 0.5) * 8;
          o.connect(lp);
          o.start(t);
          o.stop(t + len + 0.2);
        }
        return;
      }
      case 'perc': {
        // the band's shaker or tambourine, off to either side
        const fam = e.sound === 'tambourine' ? 'tambourine' : 'shaker';
        if (this.sampler.has(fam)) this.playSample(ctx, fam, null, 0.3 + 0.6 * e.vel, 0, 0.5, fam === 'shaker' ? 0.4 : -0.4, 0.25, fam === 'shaker' ? 0.55 : 0.5, t, '', this.bedBus);
        return;
      }
      case 'shaker': {
        // a real shaker when its clips are in (soft, off to one side, like a player next to you)
        if (this.sampler.has('shaker')) {
          this.playSample(ctx, 'shaker', null, 0.35 + 0.4 * e.vel, 0, 0.6, 0.35, 0.15, 0.32, t, '', this.bedBus);
          break;
        }
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
      case 'pluck':
        return this.lead(ctx, e, t, len);
    }
  }
  /** Sustained shakers, one per soft surface: a looping noise whose level follows how fast the hand brushes. */
  private sustains = new Map<string, { g: GainNode; bp: BiquadFilterNode; src: AudioBufferSourceNode; pan: StereoPannerNode | null }>();
  sustain(id: string, level: number, pan = 0, size = 0.5): void {
    const ctx = this.ready();
    if (!ctx) return;
    let v = this.sustains.get(id);
    if (!v) {
      if (level <= 0.01) return;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1.2;
      const g = ctx.createGain();
      g.gain.value = 0;
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      src.connect(bp).connect(g);
      if (p) g.connect(p).connect(this.drums);
      else g.connect(this.drums);
      const w = ctx.createGain();
      w.gain.value = 0.6;
      (p ?? g).connect(w).connect(this.send);
      src.start();
      v = { g, bp, src, pan: p };
      this.sustains.set(id, v);
    }
    const t = ctx.currentTime;
    if (v.pan) v.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.05);
    v.bp.frequency.setTargetAtTime(6500 - 2500 * size + 1500 * level, t, 0.03);
    v.g.gain.setTargetAtTime(0.28 * Math.min(1, level), t, level > 0.01 ? 0.03 : 0.08);
  }

  /** Stop a shaker's loop (its surface went away), or all of them. */
  stopSustain(id?: string): void {
    const ctx = this.ctx;
    for (const [k, v] of this.sustains) {
      if (id !== undefined && k !== id) continue;
      if (ctx) {
        v.g.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
        v.src.stop(ctx.currentTime + 0.2);
      }
      this.sustains.delete(k);
    }
  }

  /** The phone's bass: a round plucked low note, from where the phone is. */
  bass(midi: number, vel: number, pan = 0): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const v = Math.max(0.2, Math.min(1, vel));
    this.played.phone = (this.played.phone ?? 0) + 1;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = midiHz(midi);
    const o2 = ctx.createOscillator();
    o2.frequency.value = midiHz(midi + 12);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(400 + 900 * v, t);
    lp.frequency.exponentialRampToValueAtTime(220, t + 0.3);
    const g = this.out(ctx, this.drums, pan, 0.4, t, 1);
    this.env(g.gain, t, 0.7 * v, 0.004, 0.55);
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    o.connect(lp);
    o2.connect(g2).connect(lp);
    lp.connect(g);
    o.start(t);
    o2.start(t);
    o.stop(t + 0.7);
    o2.stop(t + 0.7);
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

  /** The bar before a drop: noise rising through a narrowing band, louder to the end (`dur` seconds from now). */
  riser(dur: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const n = this.noiseSrc(ctx, t, Math.min(0.95, dur));
    // (the noise buffer is a second long: loop it for a long bar)
    n.loop = true;
    n.stop(t + dur + 0.05);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2.5;
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(6000, t + dur);
    const g = this.out(ctx, this.master, 0, 0.6, t, 1);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + dur * 0.97);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.04);
    n.connect(bp).connect(g);
  }

  /** The band drops out (the drums go on) now, and comes back at audio time `back`. */
  bandDrop(back: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.bedBus || !this.bedOn) return;
    const t = ctx.currentTime;
    const gain = this.bedBus.gain;
    gain.cancelScheduledValues(t);
    gain.setValueAtTime(gain.value, t);
    gain.linearRampToValueAtTime(0, t + 0.06);
    gain.setValueAtTime(0, Math.max(t + 0.07, back - 0.01));
    gain.linearRampToValueAtTime(0.55, Math.max(t + 0.08, back));
  }

  /** More room on everything (from audio time `at`), or back to the usual. Nothing while the room is off (the low levels). */
  wetter(on: boolean, at = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.send || this.send.gain.value === 0) return;
    this.send.gain.setTargetAtTime(on ? 0.3 : 0.16, Math.max(ctx.currentTime, at), 0.08);
  }

  /** The one after a drop: a crash (bright noise ringing out) and a sub thump you feel. */
  crash(vel = 1): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const n = this.noiseSrc(ctx, t, 0.95);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 5200;
    const g = this.out(ctx, this.master, 0.15, 0.8, t, 1);
    this.env(g.gain, t, 0.3 * vel, 0.004, 1.6);
    n.connect(hp).connect(g);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.35);
    const s = this.out(ctx, this.master, 0, 0, t, 1);
    this.env(s.gain, t, 0.7 * vel, 0.005, 0.55);
    o.connect(s);
    o.start(t);
    o.stop(t + 0.7);
  }

  /**
   * How the band sounds with you (0..1): all there and bright when you're on it, muffled and quieter as you miss
   * (the filter falls from 20 kHz toward 600 Hz, the level to 60 %).
   */
  groove(health: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.bandTone) return;
    const h = Math.max(0, Math.min(1, health));
    this.grooveCut = 600 * Math.pow(2, h * 5.05);
    const t = ctx.currentTime;
    this.bandTone.frequency.cancelScheduledValues(t);
    this.bandTone.frequency.setTargetAtTime(this.grooveCut, t, 0.18);
    this.bandBus.gain.cancelScheduledValues(t);
    this.bandBus.gain.setTargetAtTime(0.6 + 0.4 * h, t, 0.18);
  }
  /**
   * A miss: the band dips for a moment (its filter halfway down toward where your misses are taking it, and back over
   * a tenth of a second), at most twice a second: a run of misses is one dip, not a stutter.
   */
  bandDip(): void {
    const ctx = this.ctx;
    if (!ctx || !this.bandTone) return;
    const t = ctx.currentTime;
    if (t - this.dipAt < 0.5) return;
    this.dipAt = t;
    const f = this.bandTone.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(Math.min(f.value, this.grooveCut), t);
    f.exponentialRampToValueAtTime(Math.max(1400, this.grooveCut * 0.3), t + 0.04);
    f.setTargetAtTime(this.grooveCut, t + 0.06, 0.1);
  }
  private dipAt = -9;
  private fx: { ctx: AudioContext; master: GainNode; send: GainNode } | null = null;
  /** The game's own sounds' way out (src/audio/sfx.ts): the running context, the master and the room's send. */
  fxOut(): { ctx: AudioContext; master: GainNode; send: GainNode } | null {
    const ctx = this.ready();
    if (!ctx) return null;
    if (this.fx?.ctx !== ctx) this.fx = { ctx, master: this.master, send: this.send };
    return this.fx;
  }
}

/** Families whose clips aren't on a note (they shift with the surface's size instead). */
const UNPITCHED = new Set<string>(['gong', 'shaker', 'stomp', 'block', 'congas', 'cajon', 'frame', 'slit', 'triangle', 'tambourine', 'ride', 'cowbell', 'clap', 'clave']);
/** A synthesised stand-in for families without their own preset. */
const ALIAS: Partial<Record<string, Family>> = { ride: 'glock', cowbell: 'bell', clap: 'shaker', clave: 'block', xylophone: 'marimba', harp: 'keys', tubular: 'bell', timpani: 'gong', frame: 'gong', congas: 'tongue', cajon: 'tongue', slit: 'tongue', triangle: 'glock', tambourine: 'shaker' };
/** Recorded clips are peak-normalised: these set each family's place in the mix. */
const FAMILY_LEVEL: Partial<Record<string, number>> = {
  marimba: 0.75, keys: 0.7, xylophone: 0.6, glock: 0.42, harp: 0.7, tongue: 0.7, bowl: 0.55, bell: 0.5, tubular: 0.5,
  gong: 0.8, timpani: 0.85, frame: 0.8, congas: 0.75, cajon: 0.8, slit: 0.75, block: 0.6, triangle: 0.4, tambourine: 0.55, shaker: 0.5, stomp: 0.9,
  ride: 0.45, cowbell: 0.55, clap: 0.7, clave: 0.6,
};
const DRUM_LEVEL: Partial<Record<string, number>> = { kick: 0.95, snare: 1.2, hat: 0.45, open: 0.4, tom: 0.75, floor: 0.8, crash: 0.6, ride: 0.5, rim: 0.6 };

/** The stems' level into the band's bus. */
const STEM_LEVEL = 0.7;

/** The shaper's input −1..1 stands for −CLIP_RANGE..CLIP_RANGE. */
const CLIP_RANGE = 4;

/** A soft knee: unity below 0.6, rounding peaks off toward 1 above it (no look-ahead, no low-level boost). */
function softClip(): Float32Array<ArrayBuffer> {
  const n = 4096;
  const c = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = ((i / (n - 1)) * 2 - 1) * CLIP_RANGE;
    const a = Math.abs(x);
    const y = a < 0.6 ? a : 0.6 + 0.4 * Math.tanh((a - 0.6) / 0.4);
    c[i] = Math.sign(x) * y;
  }
  return c;
}

/**
 * A room's tail: 20 ms of pre-delay, two early reflections, then decorrelated noise in each ear that decays and
 * darkens as it goes (9 kHz at the start to about 1.2 kHz at the end), like sound soaking into a furnished room.
 */
function room(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, len, sr);
  const pre = Math.floor(sr * 0.02);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    d[Math.floor(sr * (ch ? 0.013 : 0.011))] = 0.5;
    d[Math.floor(sr * (ch ? 0.017 : 0.019))] = 0.35;
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const k = (i - pre) / (len - pre);
      const cut = 9000 * Math.pow(1200 / 9000, k);
      const a = 1 - Math.exp((-2 * Math.PI * cut) / sr);
      lp += a * (Math.random() * 2 - 1 - lp);
      d[i] += lp * Math.pow(1 - k, 2.2) * 0.9;
    }
  }
  return buf;
}

export function impulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

export const audio = new Engine();
