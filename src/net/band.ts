/**
 * Playing together: every sound a headset makes (a drum, a note, a strum, the chords under a track) goes to the
 * others in the band as a small message, and theirs come here and play a little to one side. Messages carry the
 * sound and how far ahead it was scheduled, so a strum or a chord keeps its shape; a short buffer evens out the
 * network. Validated and rate-limited: a friend's headset can only ask for sounds this game already makes.
 */
import { audio, type Voice } from '../audio/engine.js';
import type { Family } from '../room/classify.js';
import type { BedEvent, BedVoice } from '../songs/chart.js';
import type { Transport } from './transport.js';

/** One sound, on the wire. */
export interface BandNote {
  k: 'n';
  /** 'd:kick' a drum, 'm:keys' a sampled note, 'p:nylon' a plucked string, 'b:chord' the band under a track. */
  s: string;
  m: number;
  v: number;
  /** Milliseconds after sending that it was due. */
  d: number;
  /** Size (drums, notes), or the band event's length in beats. */
  z?: number;
  /** The band: seconds per beat, and a minor chord. */
  spb?: number;
  mi?: boolean;
}

const VOICES = new Set(['kick', 'snare', 'hat', 'tom', 'rim', 'open', 'gong']);
const FAMILIES = new Set(['kit', 'gong', 'timpani', 'frame', 'marimba', 'xylophone', 'glock', 'harp', 'tubular', 'tongue', 'slit', 'bowl', 'bell', 'triangle', 'block', 'congas', 'cajon', 'shaker', 'tambourine', 'stomp', 'keys', 'ride', 'cowbell', 'clap', 'clave']);
const BED = new Set(['bass', 'chord', 'shaker', 'pluck']);

/** Is this a sound we'd make ourselves (nothing else is played)? */
export function validNote(m: unknown): m is BandNote {
  if (!m || typeof m !== 'object') return false;
  const n = m as Record<string, unknown>;
  if (n.k !== 'n' || typeof n.s !== 'string' || n.s.length > 16) return false;
  const num = (x: unknown, lo: number, hi: number) => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;
  if (!num(n.m, 0, 127) || !num(n.v, 0, 1.5) || !num(n.d, -50, 2000)) return false;
  if (n.z !== undefined && !num(n.z, 0, 16)) return false;
  if (n.spb !== undefined && !num(n.spb, 0.2, 2)) return false;
  const [kind, what] = n.s.split(':');
  if (kind === 'd') return VOICES.has(what);
  if (kind === 'm') return FAMILIES.has(what);
  if (kind === 'p') return what === 'nylon' || what === 'steel';
  if (kind === 'b') return BED.has(what);
  return false;
}

/** At most `n` sounds a second from one link (a stuck loop or a bad actor can't flood the speakers). */
export class Flood {
  private stamps: number[] = [];
  constructor(private readonly n = 60) {}
  ok(t: number): boolean {
    while (this.stamps.length && t - this.stamps[0] > 1) this.stamps.shift();
    if (this.stamps.length >= this.n) return false;
    this.stamps.push(t);
    return true;
  }
}

type Fn = (...a: never[]) => void;

/** A friend's sound is playing (whatever link plays it): nothing it makes goes back out. */
let replaying = false;

/**
 * The link: while it's on, this headset's sounds go out and the band's come in. `onFriend` is told when a friend's
 * sound plays (for a light).
 */
export class BandLink {
  private depth = 0;
  private originals: Partial<Record<'drum' | 'modal' | 'pluck' | 'band', Fn>> = {};
  private flood = new Flood(80);
  /** Friends' sounds play this far to the side (they're sitting next to you). */
  pan = 0.45;

  constructor(private readonly onFriend: (s: string, vel: number) => void = () => {}) {}

  start(tr: Transport): void {
    if (this.originals.drum) return;
    const a = audio as unknown as Record<string, Fn>;
    const send = (n: BandNote) => {
      if (replaying || this.depth > 0) return;
      tr.send(n);
    };
    const ahead = (when: number) => Math.round(Math.max(0, (when || audio.now()) - audio.now()) * 1000);
    const wrap = (name: 'drum' | 'modal' | 'pluck' | 'band', out: (...x: never[]) => BandNote | null) => {
      const orig = a[name].bind(audio) as Fn;
      this.originals[name] = a[name];
      a[name] = ((...x: never[]) => {
        const n = out(...x);
        if (n) send(n);
        this.depth++;
        try {
          orig(...x);
        } finally {
          this.depth--;
        }
      }) as Fn;
    };
    wrap('drum', ((voice: Voice, vel: number, _pan?: number, when?: number, size?: number) => ({ k: 'n', s: `d:${voice}`, m: 0, v: vel, d: ahead(when ?? 0), z: size ?? 1 })) as never);
    wrap('modal', ((family: Family, midi: number, vel: number, _pan?: number, when?: number, size?: number) => ({ k: 'n', s: `m:${family}`, m: midi, v: vel, d: ahead(when ?? 0), z: size ?? 0.5 })) as never);
    wrap('pluck', ((midi: number, vel: number, _pan?: number, when?: number, kind?: string) => ({ k: 'n', s: `p:${kind ?? 'nylon'}`, m: midi, v: vel, d: ahead(when ?? 0) })) as never);
    wrap('band', ((e: BedEvent, when: number, spb: number) => ({ k: 'n', s: `b:${e.voice}`, m: e.midi, v: e.vel, d: ahead(when), z: e.len, spb, mi: e.minor })) as never);
    tr.onMessage((m) => this.play(m));
  }

  /** A friend's sound: play it (a hair later than it was meant, the same for every note, so their timing holds). */
  play(m: unknown): void {
    if (!validNote(m) || !this.flood.ok(performance.now() / 1000)) return;
    const at = audio.now() + 0.06 + m.d / 1000;
    const [kind, what] = m.s.split(':');
    const a = audio as unknown as Record<string, Fn>;
    const call = (name: 'drum' | 'modal' | 'pluck' | 'band', ...x: unknown[]) => (this.originals[name] ?? a[name]).apply(audio, x as never[]);
    replaying = true;
    try {
      if (kind === 'd') call('drum', what, m.v * 0.9, this.pan, at, m.z ?? 1);
      else if (kind === 'm') call('modal', what, m.m, m.v * 0.9, this.pan, at, m.z ?? 0.5, 'friend');
      else if (kind === 'p') call('pluck', m.m, m.v * 0.9, this.pan, at, what);
      else if (kind === 'b') call('band', { beat: 0, voice: what as BedVoice, midi: m.m, len: m.z ?? 1, vel: m.v, minor: m.mi } satisfies BedEvent, at, m.spb ?? 0.6);
    } finally {
      replaying = false;
    }
    if (kind !== 'b') this.onFriend(m.s, m.v);
  }

  stop(): void {
    const a = audio as unknown as Record<string, Fn>;
    for (const [k, f] of Object.entries(this.originals)) if (f) a[k] = f;
    this.originals = {};
  }
}
