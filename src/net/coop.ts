/**
 * Playing together over WebRTC (PeerJS, loaded on demand): one headset hosts a 4-letter code, up to three more join
 * it, and the host passes each player's notes on to the others. The only part of Thump that talks to the network,
 * and only after a player starts or joins. Signalling goes through PeerJS's public broker; game data
 * flows peer-to-peer (or via PeerJS's TURN relay if direct fails).
 * No accounts, no voice, no personal data: room codes are random.
 */
import type { Transport } from './transport.js';

/** host: the headset with the kit; caller: a phone playing an instrument (the bass); guest: reserved. */
export type CoopRole = 'host' | 'guest' | 'caller';
export interface CoopStatus {
  state: 'idle' | 'hosting' | 'joining' | 'connected' | 'error' | 'closed';
  role?: CoopRole;
  code?: string;
  message?: string;
  /** Headsets in the band, this one included. */
  players?: number;
}

/** A band is at most this many headsets. */
export const MAX_PLAYERS = 4;

/** No vowels (no accidental words), no look-alikes (0/O, 1/I). */
export const CODE_ALPHABET = 'CDFHJKMNPRTVWXY';
const PREFIX = 'thump-v1-';
/** How long to wait for the connection service before saying it can't be reached. */
const OPEN_TIMEOUT_MS = 12000;
/** PeerJS errors worth one quiet retry. */
const NETWORK_ERRORS = new Set(['network', 'server-error', 'socket-error', 'socket-closed']);

export function randomCode(): string {
  const b = new Uint8Array(4);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join('');
}

export function normaliseCode(raw: string): string | null {
  const c = raw.trim().toUpperCase();
  return /^[CDFHJKMNPRTVWXY]{4}$/.test(c) ? c : null;
}

type PeerLike = { destroy(): void; on(ev: string, cb: (...a: unknown[]) => void): void; connect(id: string, o?: object): ConnLike; reconnect?(): void; destroyed?: boolean };
type ConnLike = { send(d: unknown): void; on(ev: string, cb: (...a: unknown[]) => void): void; close(): void; open: boolean };

class CoopSession {
  status: CoopStatus = { state: 'idle' };
  transport: Transport | null = null;
  private peer: PeerLike | null = null;
  private conn: ConnLike | null = null;
  /** Bumped on every host/join/leave; stale async work and handlers check it. */
  private gen = 0;

  private set(s: CoopStatus): void {
    this.status = s;
    window.dispatchEvent(new CustomEvent('thump:coop', { detail: s }));
  }

  private async newPeer(id?: string): Promise<PeerLike> {
    const { Peer } = await import('peerjs');
    return (id ? new Peer(id, { debug: 0 }) : new Peer({ debug: 0 })) as unknown as PeerLike;
  }

  /** Everyone this headset talks to: the host's guests, or a guest's host. */
  private conns: ConnLike[] = [];
  private listeners: Array<(m: unknown) => void> = [];

  private attach(conn: ConnLike, role: CoopRole, code: string, gen: number): void {
    if (gen !== this.gen) return conn.close();
    this.conn = conn;
    this.conns.push(conn);
    const live = () => this.gen === gen && this.conns.includes(conn);
    conn.on('data', (d) => {
      if (!live()) return;
      // the host passes a guest's notes on to the other guests
      if (role === 'host') for (const c of this.conns) if (c !== conn && c.open) c.send(d);
      this.listeners.forEach((cb) => cb(d));
    });
    const gone = (why: string) => {
      if (!live()) return;
      this.conns = this.conns.filter((c) => c !== conn);
      // a guest leaving the host's band: the others play on; the host leaving ends it for a guest
      if (role === 'host' && this.conns.length) this.set({ state: 'connected', role, code, players: this.conns.length + 1, message: 'Someone left' });
      else if (role === 'host') this.set({ state: 'hosting', role, code, players: 1, message: 'Waiting for friends' });
      else this.closed(why);
    };
    conn.on('close', () => gone('Your friend left'));
    conn.on('error', () => gone('Connection lost'));
    if (!this.transport)
      this.transport = {
        send: (m) => {
          for (const c of this.conns) if (c.open) c.send(m);
        },
        onMessage: (cb) => this.listeners.push(cb),
      };
    this.set({ state: 'connected', role, code, players: role === 'host' ? this.conns.length + 1 : 2 });
  }

  async host(tries = 3): Promise<void> {
    this.leave(true);
    const gen = this.gen;
    const code = randomCode();
    this.set({ state: 'hosting', role: 'host', code, message: 'Connecting…' });
    try {
      const peer = await this.newPeer(PREFIX + code);
      if (gen !== this.gen) return peer.destroy(); // left while loading
      this.peer = peer;
      // the public connection service can be slow or down: never sit on "Connecting…" for ever
      let opened = false;
      window.setTimeout(() => {
        if (!opened && gen === this.gen) this.fail("Can't reach the connection service. Try again in a minute");
      }, OPEN_TIMEOUT_MS);
      peer.on('open', () => {
        opened = true;
        if (gen === this.gen) this.set({ state: 'hosting', role: 'host', code, message: 'Waiting for a friend' });
      });
      // the signalling link dropped (headset asleep, a Wi-Fi blip): re-register the code, so the friend can still join
      peer.on('disconnected', () => {
        if (gen === this.gen && !peer.destroyed) peer.reconnect?.();
      });
      peer.on('connection', (c) => {
        const conn = c as ConnLike;
        if (this.conns.length >= MAX_PLAYERS - 1 || gen !== this.gen) return conn.close(); // the band is full
        conn.on('open', () => this.attach(conn, 'host', code, gen));
      });
      peer.on('error', (e) => {
        if (gen !== this.gen) return;
        const type = (e as { type?: string }).type;
        if (type === 'unavailable-id' && tries > 0) void this.host(tries - 1);
        // a network hiccup: one more go after a moment, then say so
        else if (NETWORK_ERRORS.has(type ?? '') && tries > 1) window.setTimeout(() => gen === this.gen && void this.host(1), 1500);
        else this.fail("Can't reach the connection service. Try again in a minute");
      });
    } catch {
      this.set({ state: 'error', message: "This browser can't join a jam" });
    }
  }

  /** `as`: 'guest' (a second headset) or 'caller' (a phone: 2D card and lever buttons). */
  async join(raw: string, as: 'guest' | 'caller' = 'guest'): Promise<void> {
    const code = normaliseCode(raw);
    if (!code) {
      this.set({ state: 'error', message: "Type the 4 letters on your friend's drum module" });
      return;
    }
    this.leave(true);
    const gen = this.gen;
    this.set({ state: 'joining', role: as, code, message: 'Connecting…' });
    try {
      const peer = await this.newPeer();
      if (gen !== this.gen) return peer.destroy();
      this.peer = peer;
      let joined = false;
      window.setTimeout(() => {
        if (!joined && gen === this.gen) this.fail('Could not reach the headset. Check the code and try again');
      }, OPEN_TIMEOUT_MS);
      peer.on('open', () => {
        if (gen !== this.gen) return;
        const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
        conn.on('open', () => (joined = true));
        conn.on('open', () => {
          this.attach(conn, as, code, gen);
          if (as === 'caller') this.transport?.send({ k: 'hi', who: 'caller' }); // tell the headset a phone joined
        });
      });
      peer.on('error', (e) => {
        if (gen !== this.gen) return;
        const type = (e as { type?: string }).type;
        this.fail(type === 'peer-unavailable' ? "No headset has that code. Check the 4 letters" : "Can't reach the connection service. Try again in a minute");
      });
    } catch {
      this.set({ state: 'error', message: "This browser can't join a jam" });
    }
  }

  /** Give up on this attempt: tear the peer down so nothing half-open lingers, and say why. */
  private fail(message: string): void {
    this.gen++;
    this.conn?.close();
    this.conn = null;
    this.transport = null;
    for (const c of this.conns) c.close();
    this.conns = [];
    this.listeners = [];
    this.peer?.destroy();
    this.peer = null;
    this.set({ state: 'error', message });
  }

  private closed(message: string): void {
    this.gen++;
    this.conn = null;
    this.transport = null;
    for (const c of this.conns) c.close();
    this.conns = [];
    this.listeners = [];
    this.peer?.destroy();
    this.peer = null;
    this.set({ state: 'closed', message });
  }

  leave(silent = false): void {
    this.gen++;
    this.conn?.close();
    this.conn = null;
    this.transport = null;
    for (const c of this.conns) c.close();
    this.conns = [];
    this.listeners = [];
    this.peer?.destroy();
    this.peer = null;
    if (!silent) this.set({ state: 'idle' });
  }
}

export const coop = new CoopSession();
