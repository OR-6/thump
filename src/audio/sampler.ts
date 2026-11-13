/**
 * Recorded instruments: each family's clips (src/audio/sample-map.ts, CC0 recordings), loaded once audio starts.
 * A hit picks the loudness layer from how hard it was, the clip nearest its note (re-pitched the rest of the
 * way), or for a drum set the drum it landed on, and never the same clip twice running where there's a choice.
 * Until a family's clips have loaded (or if they fail), the synthesised voice plays instead.
 */
import { SAMPLES, type Sample } from './sample-map.js';

export interface SampleHit {
  /** Target note (pitched instruments), or null. */
  midi: number | null;
  /** 0..1 */
  vel: number;
  /** Which drum of a set (unpitched sets). */
  tone: number;
  /** 0 small/high .. 1 big/low: shifts unpitched instruments (a big wall's gong is deeper). */
  size: number;
}

export interface Chosen {
  buffer: AudioBuffer;
  rate: number;
}

const BASE = `${import.meta.env?.BASE_URL ?? './'}sounds/`;

export class Sampler {
  private buffers = new Map<string, AudioBuffer>();
  private loading = false;
  private last = new Map<string, string>();

  private prefetched = new Map<string, Promise<Response>>();

  /** Start downloading the kit's clips as soon as the page loads (decoding waits for audio to start). */
  prefetch(): void {
    if (typeof fetch === 'undefined' || this.prefetched.size) return;
    for (const k of ['kit:kick', 'kit:snare', 'kit:hat', 'kit:tom', 'kit:rim', 'keys']) for (const s of SAMPLES[k] ?? []) this.prefetched.set(s.file, fetch(BASE + s.file).catch(() => new Response(null, { status: 404 })));
  }

  /** Fetch and decode every clip (about 5 MB), a few at a time. */
  load(ctx: BaseAudioContext): void {
    if (this.loading) return;
    this.loading = true;
    // what you hear first loads first: the kit, the desk's bars, the band, then the rest of the room
    const first = ['kit:kick', 'kit:snare', 'kit:hat', 'kit:tom', 'kit:rim', 'keys', 'band:piano'];
    const keys = [...first.filter((k) => SAMPLES[k]), ...Object.keys(SAMPLES).filter((k) => !first.includes(k))];
    const files: string[] = [];
    for (const k of keys) for (const s of SAMPLES[k]) files.push(s.file);
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < files.length) {
        const f = files[next++];
        try {
          const res = await (this.prefetched.get(f) ?? fetch(BASE + f));
          if (!res.ok) continue;
          const buf = await ctx.decodeAudioData(await res.clone().arrayBuffer());
          this.buffers.set(f, buf);
        } catch {
          /* that clip stays synthesised */
        }
      }
    };
    for (let i = 0; i < 6; i++) void worker();
  }

  /** Is this family (or kit voice, 'kit:snare') playable from recordings yet? */
  has(key: string): boolean {
    const list = SAMPLES[key];
    return !!list && list.some((s) => this.buffers.has(s.file));
  }

  /** How many clips have loaded (debug). */
  get loaded(): number {
    return this.buffers.size;
  }

  /** The clip for a hit and the playback rate that puts it on its note. Null: none loaded for it. */
  pick(key: string, hit: SampleHit): Chosen | null {
    const list = SAMPLES[key];
    if (!list) return null;
    const ready = list.filter((s) => this.buffers.has(s.file));
    if (!ready.length) return null;
    // the drum of a set it landed on
    const tones = new Set(ready.map((s) => s.tone));
    let pool = ready;
    if (tones.size > 1) {
      const want = Math.min(Math.max(...tones), Math.max(0, Math.round(hit.tone)));
      pool = pool.filter((s) => s.tone === want);
      if (!pool.length) pool = ready;
    }
    // the loudness layer from how hard it was hit
    const layers = [...new Set(pool.map((s) => s.layer))].sort((a, b) => a - b);
    const top = layers.length - 1;
    const li = Math.min(top, Math.floor(Math.max(0, Math.min(0.999, hit.vel)) * (top + 1)));
    pool = pool.filter((s) => s.layer === layers[li]);
    // pitched: the nearest note; else any (never the one played last when there's another)
    let s: Sample;
    if (hit.midi !== null && pool[0].midi !== null) {
      let best = pool[0];
      for (const c of pool) if (Math.abs((c.midi ?? 0) - hit.midi) < Math.abs((best.midi ?? 0) - hit.midi)) best = c;
      // two clips equally near (round robin): alternate
      const near = pool.filter((c) => Math.abs((c.midi ?? 0) - (best.midi ?? 0)) < 0.5);
      s = near.length > 1 ? (near.find((c) => c.file !== this.last.get(key)) ?? best) : best;
    } else {
      const others = pool.filter((c) => c.file !== this.last.get(key));
      const from = others.length ? others : pool;
      s = from[Math.floor(Math.random() * from.length)];
    }
    this.last.set(key, s.file);
    const buffer = this.buffers.get(s.file)!;
    let rate: number;
    if (hit.midi !== null && s.midi !== null) rate = Math.pow(2, (hit.midi - s.midi) / 12);
    else rate = Math.pow(2, (-(Math.min(1, Math.max(0, hit.size)) - 0.5) * 7) / 12) * (1 + (Math.random() - 0.5) * 0.02);
    return { buffer, rate: Math.min(4, Math.max(0.25, rate)) };
  }
}
