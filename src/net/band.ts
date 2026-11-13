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

/** Band control: clock pings, a song starting on the band's clock, asking the host for one, what each plays. */
export type BandCtl =
  | { k: 'ping'; a: number; p: string }
  | { k: 'pong'; a: number; h: number; p: string }
  | { k: 'song'; i: number; at: number }
  | { k: 'ask'; i: number }
  | { k: 'inst'; p: string; id: string };

export function validCtl(m: unknown): m is BandCtl {
  if (!m || typeof m !== 'object') return false;
  const n = m as Record<string, unknown>;
  const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
  const id = typeof n.p === 'string' && n.p.length <= 12;
  if (n.k === 'ping') return num(n.a) && id;
  if (n.k === 'pong') return num(n.a) && num(n.h) && id;
  if (n.k === 'song') return num(n.i) && (n.i as number) >= 0 && (n.i as number) < 32 && num(n.at);
  if (n.k === 'ask') return num(n.i) && (n.i as number) >= 0 && (n.i as number) < 32;
  if (n.k === 'inst') return typeof n.p === 'string' && n.p.length <= 12 && typeof n.id === 'string' && /^[a-z]{1,12}$/.test(n.id);
  return false;
}

/** Sounds a player made (a hit) go to the band; the backing each headset plays for itself stays home. */
let playerDepth = 0;
export function asPlayer<T>(fn: () => T): T {
  playerDepth++;
  try {
    return fn();
  } finally {
    playerDepth--;
  }
}

/** Seconds on this device's steady clock. */
const nowS = () => performance.now() / 1000;

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
      if (replaying || this.depth > 0 || playerDepth === 0) return;
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
    // (the chords under a track stay on this headset: friends' tracks would clash in two keys)
    wrap('band', (() => null) as never);
    tr.onMessage((m) => {
      if (validCtl(m)) this.control(m);
      else this.play(m);
    });
    this.tr = tr;
  }

  /** This player's id in the band, and the link to send on. */
  readonly me = Math.random().toString(36).slice(2, 8);
  private tr: Transport | null = null;
  /** The host's steady clock minus this device's (s), from the quickest ping so far. */
  offset = 0;
  private bestRtt = Infinity;
  /** Control messages for the room (songs, instruments). */
  onCtl: (m: BandCtl) => void = () => {};
  /** Is this headset the band's host (its clock is the band's)? */
  host = false;

  send(m: BandCtl): void {
    this.tr?.send(m);
  }
  /** The band's clock now (the host's steady clock), s. */
  bandNow(): number {
    return nowS() + (this.host ? 0 : this.offset);
  }
  /** A time on the band's clock, as this device's steady clock. */
  toLocal(at: number): number {
    return at - (this.host ? 0 : this.offset);
  }
  /** Measure the clock against the host (a guest sends these now and then). */
  ping(): void {
    if (!this.host) this.send({ k: 'ping', a: nowS(), p: this.me });
  }
  private control(m: BandCtl): void {
    if (m.k === 'ping') {
      if (this.host) this.send({ k: 'pong', a: m.a, h: nowS(), p: m.p });
      return;
    }
    if (m.k === 'pong') {
      // (the host passes pongs to everyone: only mine)
      if (m.p !== this.me) return;
      const rtt = nowS() - m.a;
      if (rtt < 0 || rtt > 2) return;
      // the quickest round trip gives the truest offset
      if (rtt <= this.bestRtt * 1.2) {
        this.bestRtt = Math.min(this.bestRtt, rtt);
        this.offset = m.h + rtt / 2 - nowS();
      }
      return;
    }
    this.onCtl(m);
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
