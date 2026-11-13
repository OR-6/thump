/**
 * The phone jam, headset side: host a code (shown on the module), and once a friend's phone joins, it is the bass.
 * Its notes play in the song's key, rate-limited and validated; the beat goes back to the phone's light.
 */
import { audio } from '../audio/engine.js';
import { coop, type CoopStatus } from '../net/coop.js';
import { RateLimit, bassNote, validFromPhone, type JamToPhone } from '../jam/protocol.js';
import type { Game } from '../play/game.js';

export interface PhoneLinkContext {
  game(): Game;
  /** Game time (s). */
  now(): number;
  debug(): { phone?: string; phoneNotes?: number };
  /** A phone joined (say so). */
  connected(): void;
}

export class PhoneLink {
  private wired: ((e: Event) => void) | null = null;
  private lastBeat = -1;
  private limit = new RateLimit(12, 1);

  constructor(private readonly ctx: PhoneLinkContext) {}

  /** Show a code and wait for a phone (once hosting or joined, nothing more). */
  open(): void {
    if (coop.status.state === 'hosting' || coop.status.state === 'connected') return;
    if (!this.wired) {
      this.wired = (e: Event) => {
        const st = (e as CustomEvent<CoopStatus>).detail;
        const game = this.ctx.game();
        this.ctx.debug().phone = st.state;
        game.code = st.state === 'hosting' && st.code ? st.code : '';
        if (st.state === 'connected' && coop.transport) {
          coop.transport.onMessage((m) => this.onPhone(m));
          coop.transport.send({ k: 'part', part: 'bass' } satisfies JamToPhone);
          this.ctx.connected();
        }
        game.refreshDisplay();
      };
      window.addEventListener('thump:coop', this.wired);
    }
    void coop.host();
  }

  private onPhone(m: unknown): void {
    if (!validFromPhone(m) || m.k !== 'note') return;
    if (!this.limit.ok(this.ctx.now())) return;
    audio.bass(bassNote(60 + this.ctx.game().keyPc, m.n), m.v, -0.3);
    const d = this.ctx.debug();
    d.phoneNotes = (d.phoneNotes ?? 0) + 1;
  }

  /** The beat, to the phone's light (each beat while music plays; a rest when it stops). */
  beat(): void {
    const tr = coop.transport;
    if (!tr || coop.status.state !== 'connected') return;
    const game = this.ctx.game();
    const b = Math.floor(game.beatNow);
    if (Number.isNaN(b)) {
      if (this.lastBeat !== -1) tr.send({ k: 'rest' } satisfies JamToPhone);
      this.lastBeat = -1;
      return;
    }
    if (b === this.lastBeat) return;
    this.lastBeat = b;
    tr.send({ k: 'beat', b, bpm: game.bpmNow, root: 60 + game.keyPc, song: game.mode === 'jam' ? 'Jam' : (game.song?.name ?? '') } satisfies JamToPhone);
  }

  dispose(): void {
    if (this.wired) window.removeEventListener('thump:coop', this.wired);
    this.wired = null;
  }
}
