/**
 * The tuning page (device sessions): strike thresholds and the timing offset, changed in the headset with the module's
 * keys, applied live and saved, with readouts from the last hits so you can see what a change does.
 */
import { STRIKE } from '../config.js';

export type TuneKey = 'minSpeed' | 'minDecel' | 'nearM' | 'latchS' | 'rearmM' | 'offset' | 'defaults';

export interface TuneItem {
  key: TuneKey;
  name: string;
  unit: string;
  /** Shown value = stored value × scale. */
  scale: number;
  /** Step in shown units. */
  step: number;
  min: number;
  max: number;
  /** What it does, in a few words (the page's second line when no hit has been seen). */
  help: string;
}

export const TUNE_ITEMS: readonly TuneItem[] = [
  { key: 'minSpeed', name: 'Speed', unit: 'm/s', scale: 1, step: 0.05, min: 0.15, max: 1.2, help: 'Lower: softer hits play' },
  { key: 'minDecel', name: 'Stop', unit: 'm/s²', scale: 1, step: 2, min: 4, max: 40, help: 'Lower: a gentle stop plays' },
  { key: 'nearM', name: 'Near', unit: 'mm', scale: 1000, step: 2, min: 6, max: 40, help: 'Higher: stops further above play' },
  { key: 'latchS', name: 'Latch', unit: 'ms', scale: 1000, step: 10, min: 40, max: 250, help: 'Higher: fewer double hits' },
  { key: 'rearmM', name: 'Re-arm', unit: 'mm', scale: 1000, step: 2, min: 8, max: 40, help: 'Lower: fast repeats play' },
  { key: 'offset', name: 'Timing', unit: 'ms', scale: 1000, step: 5, min: -150, max: 150, help: 'Your hits land this late' },
  { key: 'defaults', name: 'Defaults', unit: '', scale: 1, step: 0, min: 0, max: 0, help: 'Tap + to reset all' },
];

export type StrikeTune = Partial<Record<'minSpeed' | 'minDecel' | 'nearM' | 'latchS' | 'rearmM', number>>;

/** One step up or down, in stored units, clamped and rounded to the step. */
export function stepValue(item: TuneItem, cur: number, dir: 1 | -1): number {
  const shown = Math.round((cur * item.scale) / item.step) * item.step + dir * item.step;
  const c = Math.min(item.max, Math.max(item.min, shown));
  return Math.round((c / item.scale) * 1e6) / 1e6;
}

/** The shown value with its unit ("0.35 m/s", "120 ms", "+20 ms"). */
export function fmt(item: TuneItem, v: number): string {
  const s = v * item.scale;
  const n = item.step < 1 ? s.toFixed(2) : String(Math.round(s));
  return `${item.key === 'offset' && s > 0 ? '+' : ''}${n} ${item.unit}`.trim();
}

/** The current value of a strike threshold: what was tuned, else the default. */
export function current(cfg: StrikeTune, key: keyof StrikeTune): number {
  return cfg[key] ?? STRIKE[key];
}

/** A hit, as the readouts need it. */
export interface HitNote {
  t: number;
  speed: number;
  kind: string;
  /** mm above the learned surface at contact. */
  heightMm: number;
  surface: string;
  side: string;
}

/** The last hits and what they say: the softest, how many were stops, how many look like doubles. */
export class HitLog {
  readonly hits: HitNote[] = [];
  doubles = 0;
  add(h: HitNote): void {
    const prev = this.lastOn(h.surface, h.side);
    // a second hit on the same surface by the same hand within 180 ms is very likely a double
    if (prev && h.t - prev.t < 0.18) this.doubles++;
    this.hits.push(h);
    if (this.hits.length > 20) this.hits.shift();
  }
  private lastOn(surface: string, side: string): HitNote | undefined {
    for (let i = this.hits.length - 1; i >= 0; i--) if (this.hits[i].surface === surface && this.hits[i].side === side) return this.hits[i];
    return undefined;
  }
  reset(): void {
    this.hits.length = 0;
    this.doubles = 0;
  }
  /** The page's second line for an item. */
  readout(item: TuneItem, fps: number, learnedMs: number): string {
    const last = this.hits[this.hits.length - 1];
    if (item.key === 'offset') return `Learned ${learnedMs > 0 ? '+' : ''}${learnedMs} ms · ${fps} fps`;
    if (item.key === 'defaults' || !last) return item.help;
    const n = this.hits.length;
    if (item.key === 'minSpeed') return `Last ${last.speed.toFixed(2)} · softest ${Math.min(...this.hits.map((h) => h.speed)).toFixed(2)} m/s`;
    if (item.key === 'minDecel') return `Last: ${last.kind} · ${this.hits.filter((h) => h.kind === 'stop').length} of ${n} stops`;
    if (item.key === 'nearM') return `Last hit ${Math.round(last.heightMm)} mm off the surface`;
    return `Doubles: ${this.doubles} · ${n} hits`;
  }
}
