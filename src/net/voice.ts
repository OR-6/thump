/**
 * Talk: hearing each other in a band. Off until a player turns it on (Play together's Talk switch); then the browser
 * asks for the mic (echo cancelling, noise suppressing, level evening), and this headset calls each friend who also
 * has Talk on, over the band's peers (PeerJS media calls). Everyone on Talk hears everyone else on it: the band's data
 * goes through the host, but voice goes straight between each pair, so a guest hears another guest without the host
 * passing it on. Who's on Talk, and their id to call, goes round with the band's messages ('talk'); of each pair, the
 * one with the smaller id calls (so two never call each other at once). A friend's voice plays through an audio
 * element; a meter on it swells their seat's light. Turning Talk off, or leaving the band, stops the mic and hangs up.
 */
import { audio } from '../audio/engine.js';
import type { MediaCallLike } from './coop.js';
import type { Transport } from './transport.js';

/** Who's on Talk, on the wire: their band id, their id with the connection service (to call), on or off. */
export interface TalkMsg {
  k: 'talk';
  p: string;
  id: string;
  on: boolean;
}

export function validTalk(m: unknown): m is TalkMsg {
  if (!m || typeof m !== 'object') return false;
  const n = m as Record<string, unknown>;
  return n.k === 'talk' && typeof n.p === 'string' && /^[a-z0-9]{1,12}$/.test(n.p) && typeof n.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(n.id) && typeof n.on === 'boolean';
}

/** Of two on Talk, the one whose id sorts first calls. */
export function callsFirst(mine: string, theirs: string): boolean {
  return mine < theirs;
}

/** What to say when the mic can't be had. */
export function micMessage(e: unknown): string {
  const name = (e as { name?: string })?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Mic blocked. Allow it for this site, then try again';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No microphone found';
  if (name === 'NotSupportedError') return "This browser can't use the mic here";
  return "Couldn't start the mic. Try again";
}

/** A friend's voice playing here: its loudness now (0..1), and stopping it. */
export interface VoiceOut {
  level(): number;
  stop(): void;
}

export interface VoiceDeps {
  /** This headset's id with the connection service ('' before it has one). */
  peerId(): string;
  call(id: string, s: MediaStream): MediaCallLike | null;
  mic(): Promise<MediaStream>;
  play(s: MediaStream): VoiceOut;
  now(): number;
}

export type TalkState = 'off' | 'asking' | 'on' | 'blocked';

/** Seats that show a voice (FriendSeat). */
export interface TalkSeat {
  talk(level: number): void;
}

/** Say who's on every so often (a friend who joins later learns), and forget one not heard from in this long (s). */
const ANNOUNCE_S = 4;
const FORGET_S = 12;
/** A call that's brought no voice in this long is given up (and tried again later, a few times). */
const CALL_WAIT_S = 10;
const MAX_TRIES = 3;
/** Talk messages a second (they're rare; a flood is dropped). */
const MAX_MSGS = 10;

interface Call {
  mc: MediaCallLike;
  out: VoiceOut | null;
  at: number;
  level: number;
}

export class Talk {
  state: TalkState = 'off';
  /** Why it's off when it was asked to be on ('' fine). */
  message = '';
  /** Called whenever the state or who's on Talk changes (to redraw the panel). */
  changed: () => void = () => {};
  private tr: Transport | null = null;
  private live = false;
  private me = '';
  private stream: MediaStream | null = null;
  /** Friends on Talk (by their connection id): their band id, on or not, when last heard, calls that failed. */
  private roster = new Map<string, { p: string; on: boolean; at: number; tries: number }>();
  private calls = new Map<string, Call>();
  private gen = 0;
  private announceT = 0;
  private meterT = 0;
  private msgs = { at: 0, n: 0 };

  constructor(private readonly deps: VoiceDeps = browserDeps()) {}

  /** The band is up: listen for who's on Talk (the link stays wired across a friend leaving and another joining). */
  start(tr: Transport, me: string): void {
    this.me = me;
    if (tr !== this.tr) {
      this.tr = tr;
      tr.onMessage((m) => this.receive(m));
    }
    this.live = true;
  }

  /** The band's gone: Talk off, the mic stopped, everyone hung up. */
  leave(): void {
    if (this.state !== 'off') this.off(false);
    this.live = false;
    this.roster.clear();
    this.message = '';
  }

  toggle(): void {
    if (this.state === 'on' || this.state === 'asking') this.off(true);
    else void this.on();
  }

  async on(): Promise<void> {
    if (!this.live) return;
    const gen = ++this.gen;
    this.state = 'asking';
    this.message = '';
    this.changed();
    let s: MediaStream;
    try {
      s = await this.deps.mic();
    } catch (e) {
      if (gen !== this.gen) return;
      this.state = 'blocked';
      this.message = micMessage(e);
      this.changed();
      return;
    }
    // (turned off, or the band left, while the browser asked)
    if (gen !== this.gen || !this.live) {
      for (const t of s.getTracks()) t.stop();
      return;
    }
    this.stream = s;
    this.state = 'on';
    this.announce(true);
    this.callAround();
    this.changed();
  }

  off(say = true): void {
    this.gen++;
    for (const id of [...this.calls.keys()]) this.hangUp(id);
    for (const t of this.stream?.getTracks() ?? []) t.stop();
    this.stream = null;
    const was = this.state;
    this.state = 'off';
    this.message = '';
    if (say && was === 'on') this.announce(false);
    this.changed();
  }

  /** Friends on Talk (heard from lately). */
  others(): number {
    const now = this.deps.now();
    let n = 0;
    for (const r of this.roster.values()) if (r.on && now - r.at < FORGET_S) n++;
    return n;
  }

  /** For the panel: the switch, and a line when there's something to say. */
  menu(): { on: boolean; line: string; others: number } {
    const line = this.state === 'asking' ? 'Asking for the mic…' : this.state === 'blocked' ? this.message : '';
    return { on: this.state === 'on' || this.state === 'asking', line, others: this.others() };
  }

  /** A friend calling: answered when we're on Talk, they're in the band, and it's theirs to call. */
  incoming(mc: MediaCallLike): void {
    const me = this.deps.peerId();
    if (this.state !== 'on' || !this.stream || !this.roster.has(mc.peer) || !me || !callsFirst(mc.peer, me)) {
      mc.close();
      return;
    }
    if (this.calls.has(mc.peer)) this.hangUp(mc.peer);
    mc.answer(this.stream);
    this.wire(mc);
  }

  receive(m: unknown): void {
    if (!this.live || !validTalk(m) || m.p === this.me) return;
    const now = this.deps.now();
    if (now - this.msgs.at >= 1) {
      this.msgs.at = now;
      this.msgs.n = 0;
    }
    if (++this.msgs.n > MAX_MSGS) return;
    const known = this.roster.get(m.id);
    if (!known && this.roster.size >= 8) return;
    const fresh = !known || known.on !== m.on;
    this.roster.set(m.id, { p: m.p, on: m.on, at: now, tries: known && known.on === m.on ? known.tries : 0 });
    if (!m.on) this.hangUp(m.id);
    else if (this.state === 'on') {
      // (someone new on Talk: say we're on too, so they can call us if it's theirs to)
      if (fresh) this.announce(true);
      this.callAround();
    }
    if (fresh) this.changed();
  }

  /** Each frame: say we're on now and then, retry a call, meter the voices onto the seats (by band id). */
  tick(dt: number, seats: Map<string, TalkSeat>): void {
    if (!this.live) return;
    const now = this.deps.now();
    this.announceT -= dt;
    if (this.announceT <= 0) {
      this.announceT = ANNOUNCE_S;
      if (this.state === 'on') {
        this.announce(true);
        for (const [id, c] of this.calls)
          if (!c.out && now - c.at > CALL_WAIT_S) {
            const r = this.roster.get(id);
            if (r) r.tries++;
            this.hangUp(id);
          }
        this.callAround();
      }
      let gone = false;
      for (const [id, r] of this.roster)
        if (now - r.at > FORGET_S) {
          this.roster.delete(id);
          this.hangUp(id);
          gone = true;
        }
      if (gone) this.changed();
    }
    // the meters, 15 times a second
    this.meterT -= dt;
    if (this.meterT > 0) return;
    this.meterT = 1 / 15;
    for (const [k, s] of seats) {
      if (k.startsWith('band:')) continue;
      let l = 0;
      for (const [id, c] of this.calls) if (c.out && this.roster.get(id)?.p === k) l = c.level = c.level * 0.5 + c.out.level() * 0.5;
      s.talk(l);
    }
  }

  private announce(on: boolean): void {
    const id = this.deps.peerId();
    if (id && this.tr) this.tr.send({ k: 'talk', p: this.me, id, on } satisfies TalkMsg);
  }

  /** Call each friend on Talk it's ours to call, that we aren't in a call with yet. */
  private callAround(): void {
    const me = this.deps.peerId();
    if (this.state !== 'on' || !this.stream || !me) return;
    for (const [id, r] of this.roster) {
      if (!r.on || this.calls.has(id) || r.tries >= MAX_TRIES || !callsFirst(me, id)) continue;
      const mc = this.deps.call(id, this.stream);
      if (mc) this.wire(mc);
      else r.tries++;
    }
  }

  private wire(mc: MediaCallLike): void {
    const call: Call = { mc, out: null, at: this.deps.now(), level: 0 };
    this.calls.set(mc.peer, call);
    const current = () => this.calls.get(mc.peer) === call;
    mc.on('stream', (s) => {
      // (PeerJS can say so once per track: one voice is enough)
      if (!current() || call.out) return;
      call.out = this.deps.play(s as MediaStream);
      const r = this.roster.get(mc.peer);
      if (r) r.tries = 0;
    });
    const gone = () => {
      if (!current()) return;
      call.out?.stop();
      this.calls.delete(mc.peer);
      const r = this.roster.get(mc.peer);
      if (r) r.tries++;
    };
    mc.on('close', gone);
    mc.on('error', gone);
  }

  private hangUp(id: string): void {
    const c = this.calls.get(id);
    if (!c) return;
    this.calls.delete(id);
    c.out?.stop();
    c.mc.close();
  }
}

/** The browser's mic and speakers. */
function browserDeps(): VoiceDeps {
  return {
    peerId: () => '',
    call: () => null,
    now: () => performance.now() / 1000,
    mic: async () => {
      const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
      if (!md?.getUserMedia) throw Object.assign(new Error('no mic'), { name: 'NotSupportedError' });
      return md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    },
    play: (s) => {
      // (an audio element plays it: a remote stream only into WebAudio stays silent in Chrome)
      const el = new Audio();
      el.autoplay = true;
      el.srcObject = s;
      void el.play().catch(() => {});
      // its meter on the game's audio (heard through the element, not this: the analyser goes nowhere)
      const ctx = audio.ctx;
      let src: MediaStreamAudioSourceNode | null = null;
      let an: AnalyserNode | null = null;
      let buf: Float32Array<ArrayBuffer> | null = null;
      try {
        if (ctx) {
          src = ctx.createMediaStreamSource(s);
          an = ctx.createAnalyser();
          an.fftSize = 512;
          buf = new Float32Array(an.fftSize);
          src.connect(an);
        }
      } catch {
        src = null;
        an = null;
      }
      return {
        level: () => {
          if (!an || !buf) return 0;
          an.getFloatTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
          // a speaking voice is about 0.03 to 0.2 RMS
          return Math.max(0, Math.min(1, (Math.sqrt(sum / buf.length) - 0.01) * 7));
        },
        stop: () => {
          el.pause();
          el.srcObject = null;
          try {
            src?.disconnect();
          } catch {
            /* already */
          }
          for (const t of s.getTracks()) t.stop();
        },
      };
    },
  };
}

/** Talk on the band's peers (coop): its id, its calls. */
export function coopDeps(c: { peerId: string; call(id: string, s: MediaStream): MediaCallLike | null }): VoiceDeps {
  return { ...browserDeps(), peerId: () => c.peerId, call: (id, s) => c.call(id, s) };
}
