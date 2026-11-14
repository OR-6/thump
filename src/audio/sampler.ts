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
    const first = ['kit:kick', 'kit:snare', 'kit:hat', 'kit:tom', 'kit:crash', 'ride', 'kit:rim', 'keys', 'band:piano'];
    const keys = [...first.filter((k) => SAMPLES[k]), ...Object.keys(SAMPLES).filter((k) => !first.includes(k))];
    const files: string[] = [];
    for (const k of keys)
      for (const s of SAMPLES[k]) {
        files.push(s.file);
        this.keyOfFile.set(s.file, k);
      }
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < files.length) {
        const f = files[next++];
        try {
          const res = await (this.prefetched.get(f) ?? fetch(BASE + f));
          if (!res.ok) continue;
          const buf = await ctx.decodeAudioData(await res.clone().arrayBuffer());
          this.buffers.set(f, buf);
          // that instrument's grouping includes it from now on
          const k = this.keyOfFile.get(f);
          if (k) this.groups.delete(k);
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

  /**
   * Per instrument, what's loaded, grouped once: by drum of a set, then by loudness layer (soft to hard). Rebuilt when
   * one of its clips arrives, so a note itself does no sorting or filtering.
   */
  private groups = new Map<string, { tones: number[]; byTone: Map<number, Sample[][]> }>();
  private keyOfFile = new Map<string, string>();

  private group(key: string): { tones: number[]; byTone: Map<number, Sample[][]> } | null {
    let g = this.groups.get(key);
    if (g) return g;
    const list = SAMPLES[key];
    if (!list) return null;
    const byTone = new Map<number, Sample[][]>();
    for (const s of list) {
      if (!this.buffers.has(s.file)) continue;
      let t = byTone.get(s.tone);
      if (!t) byTone.set(s.tone, (t = []));
      t.push([s]);
    }
    if (!byTone.size) return null;
    // within a drum, one array per layer, soft first
    for (const [tone, singles] of byTone) {
      const layers = new Map<number, Sample[]>();
      for (const [s] of singles) (layers.get(s.layer) ?? layers.set(s.layer, []).get(s.layer)!).push(s);
      byTone.set(tone, [...layers.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]));
    }
    g = { tones: [...byTone.keys()].sort((a, b) => a - b), byTone };
    this.groups.set(key, g);
    return g;
  }

  /** The clip for a hit and the playback rate that puts it on its note. Null: none loaded for it. */
  pick(key: string, hit: SampleHit): Chosen | null {
    const g = this.group(key);
    if (!g) return null;
    // the drum of a set it landed on
    const tones = g.tones;
    let tone = tones[0];
    const want = Math.max(0, Math.round(hit.tone));
    for (let k = 0; k < tones.length; k++) if (tones[k] <= want) tone = tones[k];
    const layers = g.byTone.get(tone)!;
    // the loudness layer from how hard it was hit
    const li = Math.min(layers.length - 1, Math.floor(Math.max(0, Math.min(0.999, hit.vel)) * layers.length));
    const pool = layers[li];
    const last = this.last.get(key);
    let s = pool[0];
    if (hit.midi !== null && pool[0].midi !== null) {
      // the nearest note; of two equally near (round robin), not the one played last
      let bd = Infinity;
      for (const c of pool) {
        const d = Math.abs((c.midi ?? 0) - hit.midi) + (c.file === last ? 0.01 : 0);
        if (d < bd) {
          bd = d;
          s = c;
        }
      }
    } else if (pool.length > 1) {
      // any, never the same twice running
      const k = Math.floor(Math.random() * (pool.length - 1));
      const lastIdx = pool.findIndex((c) => c.file === last);
      s = pool[lastIdx >= 0 && k >= lastIdx ? k + 1 : k];
    }
    this.last.set(key, s.file);
    const buffer = this.buffers.get(s.file)!;
    let rate: number;
    if (hit.midi !== null && s.midi !== null) rate = Math.pow(2, (hit.midi - s.midi) / 12);
    else rate = Math.pow(2, (-(Math.min(1, Math.max(0, hit.size)) - 0.5) * 7) / 12) * (1 + (Math.random() - 0.5) * 0.02);
    return { buffer, rate: Math.min(4, Math.max(0.25, rate)) };
  }
}
