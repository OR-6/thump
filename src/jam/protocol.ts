/**
 * The phone jam's messages (pure, validated both ways). A friend's phone joins the headset with the
 * 4-letter code on the toy telephone and becomes the bass: tap the big felt pad and the headset
 * plays a bass note in the song's chord, from where the phone is. The headset sends the beat so
 * the phone's light pulses in time.
 */
export type JamToPhone =
  /** Each beat while music plays: beat number, tempo, the chord root (MIDI), and a song name or ''. */
  | { k: 'beat'; b: number; bpm: number; root: number; song: string }
  /** No music right now (between songs): the phone's light rests. */
  | { k: 'rest' }
  /** The headset says hello: which part the phone plays. */
  | { k: 'part'; part: 'bass' };

export type JamFromPhone =
  /** A phone joined. */
  | { k: 'hi'; who: 'caller' }
  /** A tap on one of the phone's pads: 0 the root, 1 the fifth, 2 the octave; v loudness 0..1. */
  | { k: 'note'; n: 0 | 1 | 2; v: number };

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

export function validToPhone(m: unknown): m is JamToPhone {
  const o = m as Record<string, unknown>;
  if (!o || typeof o !== 'object') return false;
  if (o.k === 'beat') return finite(o.b) && finite(o.bpm) && o.bpm > 20 && o.bpm < 300 && finite(o.root) && typeof o.song === 'string' && o.song.length < 40;
  if (o.k === 'rest') return true;
  if (o.k === 'part') return o.part === 'bass';
  return false;
}

export function validFromPhone(m: unknown): m is JamFromPhone {
  const o = m as Record<string, unknown>;
  if (!o || typeof o !== 'object') return false;
  if (o.k === 'hi') return o.who === 'caller';
  if (o.k === 'note') return (o.n === 0 || o.n === 1 || o.n === 2) && finite(o.v) && o.v >= 0 && o.v <= 1;
  return false;
}

/** The bass note (MIDI) for a phone pad over a chord root. */
export function bassNote(root: number, n: 0 | 1 | 2): number {
  return root - 24 + (n === 0 ? 0 : n === 1 ? 7 : 12);
}

/** Phone taps are rate-limited (a stuck finger or a flood of messages never machine-guns the headset). */
export class RateLimit {
  private times: number[] = [];
  constructor(private max = 12, private perS = 1) {}
  ok(t: number): boolean {
    while (this.times.length && this.times[0] <= t - this.perS) this.times.shift();
    if (this.times.length >= this.max) return false;
    this.times.push(t);
    return true;
  }
}
