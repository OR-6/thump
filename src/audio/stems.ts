/**
 * A song's backing track: its stems (public/songs/<id>/stems.json, rendered offline by tools/stems/make-stems.mjs:
 * drums, bass, the tune, keys, strings…), fetched and decoded when the song is picked and played in sync on the audio
 * clock from the song's beat 0. Each stem has its own level, so the one you're playing can be muted: your part is
 * yours. Decoded at 32 kHz, or 24 kHz for a long song with many stems (under about 140 MB of samples; the bass, the
 * tune and the percussion are mono). One song is held at a time. Until a song's stems are in (or if they fail) the
 * game's own band plays it.
 */
export interface StemFile {
  id: string;
  file: string;
  /** Its channels (1: mono). */
  ch?: number;
}

const BASE = `${import.meta.env?.BASE_URL ?? './'}songs/`;
/** What a song's decoded stems may take (bytes): its rate is the highest that keeps it under this. */
const BUDGET = 140e6;

export class StemPlayer {
  /** The song whose stems are decoded, and they. */
  private id = '';
  private bufs = new Map<string, AudioBuffer>();
  private loading = '';
  private failed = new Set<string>();
  private playing: { stem: string; src: AudioBufferSourceNode; g: GainNode }[] = [];
  private gains = new Map<string, number>();
  /** Where the stems' time 0 is from the song's beat 0 (s; negative: they start with the count-in, the intro). */
  private lead = 0;
  /** Audio time of beat 0 of what's playing (−1: nothing is). */
  zero = -1;

  /** Fetch and decode a song's stems (once; a song already in, or on its way, isn't fetched again). */
  load(ctx: BaseAudioContext, id: string): void {
    if (!id || this.id === id || this.loading === id || this.failed.has(id) || typeof fetch === 'undefined') return;
    this.loading = id;
    // (what's held now goes: one song at a time)
    if (this.id && !this.playing.length) {
      this.bufs = new Map();
      this.id = '';
    }
    void (async () => {
      try {
        const r = await fetch(`${BASE}${id}/stems.json`);
        if (!r.ok) throw new Error(String(r.status));
        const m = (await r.json()) as { stems: StemFile[]; start?: number; bpm?: number; seconds?: number };
        const chans = m.stems.reduce((a, s) => a + (s.ch ?? 2), 0);
        const rate = chans * ((m.seconds ?? 180) + 3) * 32000 * 4 <= BUDGET ? 32000 : 24000;
        const dec: BaseAudioContext = typeof OfflineAudioContext !== 'undefined' ? new OfflineAudioContext(2, 1, rate) : ctx;
        const got = new Map<string, AudioBuffer>();
        await Promise.all(
          m.stems.map(async (s) => {
            const a = await fetch(`${BASE}${id}/${s.file}`);
            if (!a.ok) throw new Error(String(a.status));
            got.set(s.id, await dec.decodeAudioData(await a.arrayBuffer()));
          }),
        );
        // (another song asked for meanwhile: that one wins, these go)
        if (this.loading !== id) return;
        this.bufs = got;
        this.id = id;
        this.lead = ((m.start ?? 0) * 60) / (m.bpm || 120);
      } catch {
        this.failed.add(id);
      } finally {
        if (this.loading === id) this.loading = '';
      }
    })();
  }

  ready(id: string): boolean {
    return this.id === id && this.bufs.size > 0;
  }

  /** Play song `id`'s stems with the song's beat 0 at audio time `zero`, from audio time `from` (the right way into
   * them; not before they start, with the intro over the count-in). */
  play(ctx: AudioContext, out: AudioNode, id: string, zero: number, from: number): void {
    this.stop(ctx, 0.01);
    if (!this.ready(id)) return;
    const t0 = zero + this.lead;
    const at = Math.max(from, t0, ctx.currentTime + 0.01);
    for (const [stem, buf] of this.bufs) {
      const off = at - t0;
      if (off >= buf.duration) continue;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = this.gains.get(stem) ?? 1;
      src.connect(g).connect(out);
      src.start(at, Math.max(0, off));
      this.playing.push({ stem, src, g });
    }
    this.zero = zero;
  }

  /** Stop (fading over about `fade` seconds). */
  stop(ctx: BaseAudioContext | null, fade = 0.03): void {
    const now = ctx?.currentTime ?? 0;
    for (const p of this.playing) {
      p.g.gain.cancelScheduledValues(now);
      p.g.gain.setTargetAtTime(0, now, fade);
      try {
        p.src.stop(now + fade * 8);
      } catch {
        /* already stopped */
      }
    }
    this.playing = [];
    this.zero = -1;
  }

  /** A stem's level (0 mutes it), from now. */
  level(ctx: BaseAudioContext | null, stem: string, v: number): void {
    this.gains.set(stem, v);
    const now = ctx?.currentTime ?? 0;
    for (const p of this.playing) if (p.stem === stem) p.g.gain.setTargetAtTime(v, now, 0.04);
  }

  /** The stems the song has (once in). */
  get names(): string[] {
    return [...this.bufs.keys()];
  }
}
