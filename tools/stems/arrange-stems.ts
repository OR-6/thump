/**
 * The songs' backing tracks, arranged (run by tools/stems/make-stems.mjs through vite-node): for each song, its
 * stems as General MIDI tracks, written from the game's own score (src/songs/score.ts) so every note of every stem
 * falls on the beats the charts are judged on. The classics each get an arrangement that suits the piece (Für Elise a
 * piano piece, the Entertainer ragtime piano, William Tell and the Can-can orchestral galops, the Canon strings, and
 * so on); the originals and lessons are arranged in their styles (src/songs/arrange.ts), each with its own sounds.
 *
 * Stems: `drums`, `perc` (congas, shakers: yours on the congas), `bass` (yours on the handpan), `lead` (the tune:
 * yours on the piano or marimba), `guitar` (yours on the guitar), and `keys` / `strings` / `brass` (always the band's).
 * Writes artifacts/stems/<id>/<stem>.mid and artifacts/stems/<id>/plan.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { scaleById, scaleMidi } from '../../src/kit/shelf.js';
import { BAND_STYLES, bassLine, compEvents, congaHits, drumHits, type BandStyle, type BarPlan, type ChordSpan } from '../../src/songs/arrange.js';
import { CLASSIC_KITS, arrangedPlan } from '../../src/songs/classic-kit.js';
import { PRODUCTIONS, prodBars, prodBass, prodComp, prodDrums, prodPerc, type Production } from '../../src/songs/originals.js';
import { SCORES, bandStyle, melodyRoot, parseMelody, type Score } from '../../src/songs/score.js';

interface N {
  beat: number;
  len: number;
  midi: number;
  vel: number;
}
interface Track {
  name: string;
  program: number;
  drums?: boolean;
  notes: N[];
  vol?: number;
  pan?: number;
  rev?: number;
  cho?: number;
  /** Sustain pedal down from..to (beats). */
  pedal?: [number, number][];
}
type StemId = 'drums' | 'perc' | 'bass' | 'lead' | 'guitar' | 'keys' | 'strings' | 'brass';
type Stems = Partial<Record<StemId, Track[]>>;

// ------------------------------------------------------------------ the song, as the arranger sees it

interface Ctx {
  s: Score;
  plan: BarPlan[];
  /** Every chord through the song, the solos' too. */
  spans: ChordSpan[];
  /** The tune (the last hit left out: that's yours, and the band waits for it), at the piano's pitch. */
  mel: N[];
  end: number;
  meter: number;
  key: number;
}

function ctxOf(s: Score): Ctx {
  const sc = scaleById(s.scale);
  const root = melodyRoot(s.keyPc);
  const mel: N[] = [];
  for (const st of s.starts)
    for (const n of s.melody) {
      const beat = st + n.beat;
      if (beat >= s.end - 1e-6) continue;
      mel.push({ beat, len: n.len, midi: scaleMidi(root, sc, n.degree) + n.acc, vel: 0.8 });
    }
  const spans: ChordSpan[] = [];
  for (const st of s.starts) for (const c of s.chords) if (st + c.beat < s.end - 1e-6) spans.push({ beat: st + c.beat, len: Math.min(c.len, s.end - st - c.beat), semis: c.semis, minor: c.minor });
  for (const [a, z] of s.solos) spans.push({ beat: a, len: z - a, semis: s.soloChord.semis, minor: s.soloChord.minor });
  spans.sort((a, b) => a.beat - b.beat);
  // (a song in its whole form: its sections in three stages, early, middle and late, for the arrangements that build)
  const plan = arrangedPlan(s);
  return { s, plan, spans, mel, end: s.end, meter: s.meter, key: s.keyPc };
}

const chordAt = (c: Ctx, b: number): ChordSpan => c.spans.find((x) => b >= x.beat - 1e-6 && b < x.beat + x.len - 1e-6) ?? { beat: b, len: c.meter, semis: c.s.home.semis, minor: c.s.home.minor };
const pcOf = (c: Ctx, ch: ChordSpan) => (c.key + ch.semis) % 12;
/** The chord's root at or above `lo`. */
const rootFrom = (c: Ctx, ch: ChordSpan, lo: number) => lo + ((pcOf(c, ch) - lo + 120) % 12);
const third = (ch: ChordSpan) => (ch.minor ? 3 : 4);

/** A triad voiced inside lo..lo+18, led smoothly from the last one this voicer made. */
function voicer(lo: number, notes = 3): (c: Ctx, ch: ChordSpan) => number[] {
  let was: number[] = [];
  return (c, ch) => {
    const pcs = [0, third(ch), 7].map((x) => (pcOf(c, ch) + x) % 12);
    let best: number[] = [];
    let cost = Infinity;
    for (let inv = 0; inv < 3; inv++)
      for (let base = lo; base < lo + 12; base++) {
        if (base % 12 !== pcs[inv]) continue;
        const v = [base];
        for (let k = 1; k < notes; k++) {
          let m = v[k - 1] + 1;
          while (m % 12 !== pcs[(inv + k) % 3]) m++;
          v.push(m);
        }
        const k = was.length ? v.reduce((a, m, i) => a + Math.abs(m - (was[i] ?? m)), 0) : Math.abs(v[0] - lo - 6);
        if (k < cost) {
          cost = k;
          best = v;
        }
      }
    was = best;
    return best;
  };
}

/** Each step of a bar's pattern (`a|b` alternating bars): its beat, its character. */
function eachStep(c: Ctx, b: BarPlan, n: number, pattern: string | undefined, steps: number, fn: (beat: number, ch: string, i: number) => void): void {
  if (!pattern) return;
  const bars = pattern.split('|');
  const p = bars[n % bars.length];
  for (let i = 0; i < p.length; i++) {
    if (p[i] === '.' || p[i] === '-') continue;
    const beat = b.beat + (i * c.meter) / steps;
    if (beat < c.end - 1e-6) fn(beat, p[i], i);
  }
}
const VEL: Record<string, number> = { X: 1, x: 0.78, '-': 0.55, o: 0.3 };
/** A step held over the `-` after it: its length in steps. */
function held(pattern: string, i: number): number {
  let k = i + 1;
  while (k < pattern.length && pattern[k] === '-') k++;
  return k - i;
}

/** A tiny, repeatable wobble (players are never exactly on the grid, nor exactly as loud). */
function wob(beat: number, salt: number, amount: number): number {
  let h = Math.imul(Math.round(beat * 96) + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt + 7, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x27d4eb2f);
  h ^= h >>> 13;
  return (((h >>> 0) % 10000) / 10000 - 0.5) * 2 * amount;
}

// ------------------------------------------------------------------ parts

/** The tune on an instrument, `oct` octaves off the piano's pitch, `legato` of each note's length; accents on the
 * bar's strong beats. Only in the bars `when` allows. */
function tune(c: Ctx, oct = 0, legato = 0.92, when: (b: BarPlan) => boolean = () => true, vel = 0.82): N[] {
  const out: N[] = [];
  for (const n of c.mel) {
    const b = barOf(c, n.beat);
    if (!b || !when(b)) continue;
    const inBar = n.beat - b.beat;
    const strong = Math.abs(inBar) < 1e-6 ? 1 : Math.abs(inBar - Math.round(inBar)) < 1e-6 ? 0.92 : 0.84;
    out.push({ beat: n.beat + wob(n.beat, 1, 0.006), len: Math.max(0.08, n.len * legato), midi: n.midi + 12 * oct, vel: Math.min(1, vel * strong * (0.9 + 0.1 * b.level) + wob(n.beat, 2, 0.04)) });
  }
  return out;
}
const barOf = (c: Ctx, beat: number) => c.plan.find((b) => beat >= b.beat - 1e-6 && beat < b.beat + c.meter - 1e-6);

/** A held chord per chord (a pad), voiced from `lo`, with its root under it if `root`. */
function pad(c: Ctx, lo: number, vel: number, when: (b: BarPlan) => boolean, root = false): N[] {
  const v = voicer(lo);
  const out: N[] = [];
  for (const ch of c.spans) {
    const b = barOf(c, ch.beat);
    if (!b || !when(b)) continue;
    const len = Math.min(ch.len, c.end - ch.beat);
    for (const m of v(c, ch)) out.push({ beat: ch.beat, len: len * 0.98, midi: m, vel: vel * (0.85 + 0.15 * b.level) });
    if (root) out.push({ beat: ch.beat, len: len * 0.98, midi: rootFrom(c, ch, lo - 12), vel: vel * 0.9 });
  }
  return out;
}

/** Chord hits on a pattern (drum characters), each `len` steps long, voiced from `lo`. */
function hits(c: Ctx, steps: number, pat: (b: BarPlan) => string | undefined, lo: number, len: number, vel: number): N[] {
  const v = voicer(lo);
  const out: N[] = [];
  c.plan.forEach((b, n) => {
    const p = pat(b);
    eachStep(c, b, n, p, steps, (beat, ch, i) => {
      const k = VEL[ch];
      if (k === undefined) return;
      const chd = chordAt(c, beat);
      const l = Math.min((len * c.meter) / steps, chd.beat + chd.len - beat) * 0.95;
      for (const m of v(c, chd)) out.push({ beat: beat + wob(beat, 3 + m, 0.004), len: l, midi: m, vel: vel * k * (0.85 + 0.15 * b.level) + wob(beat, 4, 0.03) });
      void i;
    });
  });
  return out;
}

/** Broken chords: each step a chord tone (`r` the root, `t` the third over it, `5` the fifth, `8` the octave, `3`
 * the third an octave up, `f` the fifth an octave up, `o` two octaves up), from the root at or above `lo`. */
const TONE: Record<string, (minor: boolean) => number> = { r: () => 0, t: (m) => (m ? 3 : 4), '5': () => 7, '8': () => 12, '3': (m) => (m ? 15 : 16), f: () => 19, o: () => 24 };
function arp(c: Ctx, steps: number, pat: (b: BarPlan) => string | undefined, lo: number, vel: number, ring = 1.6): N[] {
  const out: N[] = [];
  c.plan.forEach((b, n) => {
    const p = pat(b);
    if (!p) return;
    eachStep(c, b, n, p, steps, (beat, ch) => {
      const f = TONE[ch];
      if (!f) return;
      const chd = chordAt(c, beat);
      out.push({ beat: beat + wob(beat, 5, 0.004), len: (ring * c.meter) / steps, midi: rootFrom(c, chd, lo) + f(chd.minor), vel: vel * (0.85 + 0.15 * b.level) + wob(beat, 6, 0.04) });
    });
  });
  return out;
}

/** A bass on a pattern (`1` root, `5` fifth, `8` octave, `3` third, `v` fifth below, `-` held), from `lo`. */
function bassPat(c: Ctx, steps: number, pat: (b: BarPlan) => string | undefined, lo: number, vel: number, hold = 0.9): N[] {
  const out: N[] = [];
  c.plan.forEach((b, n) => {
    const p0 = pat(b);
    if (!p0) return;
    const bars = p0.split('|');
    const p = bars[n % bars.length];
    eachStep(c, b, n, p0, steps, (beat, ch, i) => {
      const chd = chordAt(c, beat);
      const r = rootFrom(c, chd, lo);
      const iv = ch === '5' ? 7 : ch === '8' ? 12 : ch === '3' ? third(chd) : ch === 'v' ? -5 : 0;
      const first = Math.abs(beat - chd.beat) < 1e-6;
      out.push({ beat, len: ((held(p, i) * c.meter) / steps) * hold, midi: first ? r : r + iv, vel: vel * (first ? 1 : 0.85) * (0.85 + 0.15 * b.level) + wob(beat, 7, 0.03) });
    });
  });
  return out;
}

/** GM drum notes for the arranger's drum keys. */
const GM: Record<string, number> = { 'kit:kick': 36, 'kit:snare': 38, 'kit:hat': 42, 'kit:open': 46, 'kit:ride': 51, 'kit:rim': 37, 'clap:0': 39, 'kit:tom': 47, 'kit:floor': 43, 'kit:crash': 49, 'congas:0': 64, 'congas:1': 62, 'congas:2': 63, 'congas:3': 62 };
/** A style's drummer, as GM drum notes (`scale` how hard, `only` the bars it plays). */
function drummer(c: Ctx, st: BandStyle, scale = 1, only: (b: BarPlan) => boolean = () => true): N[] {
  const plan = c.plan.filter(only);
  const d = drumHits(st, plan, c.meter, c.end);
  const spb = 60 / c.s.tune.bpm;
  return [...d.KICK, ...d.SNARE, ...d.HAT].map((h) => ({ beat: Math.max(0, h.beat + h.late / spb), len: 0.25, midi: GM[h.key] ?? 38, vel: Math.min(1, h.vel * scale) }));
}
function congas(c: Ctx, st: BandStyle, scale = 1): N[] {
  return congaHits(st, c.plan, c.meter, c.end).map((h) => ({ beat: h.beat, len: 0.2, midi: GM[h.key] ?? 63, vel: Math.min(1, h.vel * 2.6 * scale) }));
}
/** Drum hits from a pattern per drum (GM note per key of `kit`). */
function beat(c: Ctx, steps: number, kit: Record<number, (b: BarPlan) => string | undefined>, scale = 1): N[] {
  const out: N[] = [];
  for (const [note, pat] of Object.entries(kit))
    c.plan.forEach((b, n) =>
      eachStep(c, b, n, pat(b), steps, (bt, ch) => {
        const k = VEL[ch];
        if (k !== undefined) out.push({ beat: Math.max(0, bt + wob(bt, Number(note), 0.006)), len: 0.25, midi: Number(note), vel: Math.min(1, k * scale * (0.86 + 0.14 * b.level) + wob(bt, 9, 0.04)) });
      }),
    );
  return out;
}
/** A crash (and a kick) on each section's first beat; a fill of `kind` into each section. */
function crashes(c: Ctx, vel = 0.8, note = 49): N[] {
  return c.plan.filter((b) => b.crash).map((b) => ({ beat: b.beat, len: 1, midi: note, vel: vel * (0.8 + 0.2 * b.level) }));
}
function rolls(c: Ctx, vel = 0.6, note = 38, beats = 1): N[] {
  const out: N[] = [];
  for (const b of c.plan) {
    if (b.fill !== 2) continue;
    const n = beats * 4;
    for (let k = 0; k < n; k++) {
      const bt = b.beat + c.meter - beats + k / 4;
      if (bt < c.end - 1e-6) out.push({ beat: bt, len: 0.2, midi: note, vel: vel * (0.5 + (0.5 * k) / n) });
    }
  }
  return out;
}

/** A classic's drums stem (src/songs/classic-kit.ts: the player's drums and congas chart is the same part). */
function kitTracks(c: Ctx): Track[] {
  return (CLASSIC_KITS[c.s.tune.id] ?? []).map((t) =>
    kit(
      t.name,
      t.program,
      t.parts.flatMap((p) => ('beat' in p ? beat(c, p.beat.steps, p.beat.notes, p.beat.scale) : 'drummer' in p ? drummer(c, BAND_STYLES[p.drummer.style], p.drummer.scale, p.drummer.only) : 'crashes' in p ? crashes(c, p.crashes.vel, p.crashes.note) : rolls(c, p.rolls.vel, p.rolls.note, p.rolls.beats))),
      { rev: t.rev, vol: t.vol },
    ),
  );
}

// ------------------------------------------------------------------ the arrangements

const all = () => true;
const pass = (p: number) => (b: BarPlan) => b.pass === p;
const fromPass = (p: number) => (b: BarPlan) => b.pass >= p;
const chorus = (b: BarPlan) => b.chorus;
const notSolo = (b: BarPlan) => !b.solo;

const tr = (name: string, program: number, notes: N[], o: Partial<Track> = {}): Track => ({ name, program, notes, vol: 100, pan: 64, rev: 40, cho: 0, ...o });
const kit = (name: string, program: number, notes: N[], o: Partial<Track> = {}): Track => ({ name, program, drums: true, notes, vol: 100, pan: 64, rev: 30, ...o });

/** The sounds an original (or a lesson) is played with, by its style. */
const SOUNDS: Record<string, { kit: number; bass: number; comp: number; pad: number; lead: number; lead2?: number; guitar?: number; perc: number }> = {
  rock: { kit: 8, bass: 34, comp: 0, pad: 16, lead: 0, guitar: 29, perc: 54 },
  anthem: { kit: 8, bass: 33, comp: 0, pad: 48, lead: 61, perc: 54 },
  punk: { kit: 16, bass: 34, comp: 0, pad: 16, lead: 56, guitar: 30, perc: 54 },
  ska: { kit: 0, bass: 33, comp: 0, pad: 16, lead: 56, guitar: 27, perc: 82 },
  dance: { kit: 26, bass: 38, comp: 0, pad: 89, lead: 81, perc: 82 },
  synthpop: { kit: 24, bass: 38, comp: 90, pad: 89, lead: 81, lead2: 80, perc: 82 },
  funk: { kit: 0, bass: 36, comp: 7, pad: 16, lead: 65, perc: 54 },
  hiphop: { kit: 25, bass: 38, comp: 4, pad: 89, lead: 11, perc: 82 },
  shufflehop: { kit: 25, bass: 38, comp: 4, pad: 89, lead: 4, perc: 82 },
  reggaeton: { kit: 25, bass: 39, comp: 90, pad: 89, lead: 114, perc: 82 },
  reggae: { kit: 0, bass: 33, comp: 0, pad: 16, lead: 22, guitar: 27, perc: 82 },
  ballad: { kit: 40, bass: 33, comp: 0, pad: 49, lead: 0, perc: 82 },
  three: { kit: 40, bass: 33, comp: 0, pad: 49, lead: 0, perc: 82 },
};

/** An original or a lesson: its style's band (src/songs/arrange.ts) on its style's sounds. */
function styled(c: Ctx, lead?: number): Stems {
  const st = bandStyle(c.s);
  const snd = SOUNDS[c.s.meter === 3 ? 'three' : c.s.tune.style];
  const bass = bassLine(st, c.plan, c.meter, c.spans.filter((x) => !c.s.solos.some(([a]) => Math.abs(a - x.beat) < 1e-6)), c.key, c.end).map((n) => ({ beat: n.beat, len: n.len, midi: n.midi, vel: n.vel * 0.9 }));
  const bed = compEvents(st, c.plan, c.meter, c.spans, null, c.key, c.end);
  const v = voicer(st.comp.sound === 'skank' ? 60 : 55);
  const pv = voicer(55);
  const comp: N[] = [];
  const padN: N[] = [];
  const percN: N[] = [];
  for (const e of bed) {
    if (e.voice === 'perc') {
      percN.push({ beat: e.beat, len: 0.2, midi: e.sound === 'tambourine' ? 54 : 82, vel: e.vel });
      continue;
    }
    const ch = chordAt(c, e.beat);
    const isPad = e.sound === 'pad' || e.sound === 'strings' || e.sound === 'organ';
    for (const m of (isPad ? pv : v)(c, ch)) (isPad ? padN : comp).push({ beat: e.beat, len: e.len * 0.95, midi: m, vel: Math.min(1, e.vel * 1.6) });
  }
  const out: Stems = {
    drums: [kit('kit', snd.kit, drummer(c, st))],
    bass: [tr('bass', snd.bass, bass, { rev: 5, vol: 108 })],
    lead: [tr('lead', lead ?? snd.lead, tune(c, snd.lead === 81 || snd.lead === 80 ? 0 : 0), { rev: 50, vol: 112 })],
    keys: [tr('comp', snd.comp, comp, { rev: 45, vol: 92, pan: 50 }), tr('pad', snd.pad, padN, { rev: 70, vol: 82, pan: 78, cho: 40 })],
  };
  if (snd.lead2) out.lead!.push(tr('lead2', snd.lead2, tune(c, 0, 0.9, (b) => b.chorus, 0.6), { rev: 55, vol: 80, pan: 40 }));
  if (snd.guitar) out.guitar = [tr('guitar', snd.guitar, hits(c, st.steps, (b) => (b.solo ? undefined : b.chorus ? '8.......8.......'.replace(/8/g, 'x') : undefined), 52, 6, 0.75), { rev: 30, vol: 84, pan: 30 })];
  const pc = [...percN, ...congas(c, st)];
  if (pc.length) out.perc = [kit('perc', snd.kit, pc, { rev: 35, vol: 90, pan: 84 })];
  return out;
}


// ------------------------------------------------------------------ the originals produced from scratch

/** A chord of a produced original, as its chart names it: its root's pitch class, minor or not, and its seventh (the
 * semitones over the root: 10 a flat seventh, 11 a major one; none: a triad). */
interface Named extends ChordSpan {
  pc: number;
  seventh: number | null;
}
const PCS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** Its chords by name, bar by bar; `maj7` colours its plain major chords with a major seventh (a disco or house
 * band's voicing). */
function namedChords(p: Production, maj7: boolean): Named[] {
  const out: Named[] = [];
  let bar = 0;
  const key = PCS[p.key[0]] + (p.key[1] === '#' ? 1 : p.key[1] === 'b' ? -1 : 0);
  for (const x of p.sections)
    for (const text of x.chords.split('|')) {
      const names = text.trim().split(/\s+/);
      names.forEach((n, k) => {
        const each = 4 / names.length;
        if (n === '.') {
          out[out.length - 1].len += each;
          return;
        }
        const m = /^([A-G])([#b]?)(m?)(7?)$/.exec(n)!;
        const pc = (PCS[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
        const minor = m[3] === 'm';
        const seventh = m[4] ? (minor ? 10 : 10) : !minor && maj7 ? 11 : null;
        out.push({ beat: bar * 4 + k * each, len: each, semis: (pc - key + 12) % 12, minor, pc, seventh });
      });
      bar++;
    }
  return out;
}
const namedAt = (ch: readonly Named[], b: number) => ch.find((x) => b >= x.beat - 1e-6 && b < x.beat + x.len - 1e-6) ?? ch[ch.length - 1];

/** A voicer for named chords: its tones (`ext` adds the seventh, `nine` the ninth), inside lo..lo+14, led smoothly. */
function leader(lo: number, opts: { ext?: boolean; nine?: boolean; size?: number } = {}): (ch: Named) => number[] {
  let was: number[] = [];
  return (ch) => {
    const iv = [0, ch.minor ? 3 : 4, 7];
    if (opts.ext && ch.seventh !== null) iv.push(ch.seventh);
    if (opts.nine) iv.push(14);
    const pcs = iv.map((x) => (ch.pc + x) % 12);
    const size = Math.min(opts.size ?? pcs.length, pcs.length);
    let best: number[] = [];
    let cost = Infinity;
    for (let inv = 0; inv < pcs.length; inv++)
      for (let base = lo; base < lo + 12; base++) {
        if (base % 12 !== pcs[inv]) continue;
        const v = [base];
        for (let j = 1; j < size; j++) {
          let m = v[j - 1] + 1;
          while (m % 12 !== pcs[(inv + j) % pcs.length]) m++;
          v.push(m);
        }
        const k = was.length ? v.reduce((a, m, i) => a + Math.abs(m - (was[i] ?? m)), 0) : Math.abs(v[0] - lo - 5);
        if (k < cost) {
          cost = k;
          best = v;
        }
      }
    was = best;
    return best;
  };
}

/** Which section a beat is in (its name), in a produced original. */
const secAt = (p: Production, beat: number) => prodBars(p)[Math.max(0, Math.floor(beat / 4 + 1e-6))]?.name ?? '';
const secKind = (p: Production, beat: number) => prodBars(p)[Math.max(0, Math.floor(beat / 4 + 1e-6))]?.kind ?? 'verse';

/** The drummer's part (and the percussion player's), as General MIDI drum notes, each on its feel. */
function prodKitNotes(c: Ctx, p: Production): N[] {
  const spb = 60 / p.bpm;
  return prodDrums(p, c.end).map((h) => ({ beat: Math.max(0, h.beat + h.late / spb), len: h.note === 49 ? 1.5 : 0.25, midi: h.note, vel: h.vel }));
}
function prodPercNotes(c: Ctx, p: Production, scale = 1): N[] {
  const spb = 60 / p.bpm;
  return prodPerc(p, c.end).map((h) => ({ beat: Math.max(0, h.beat + h.late / spb), len: 0.2, midi: h.note, vel: Math.min(1, h.vel * scale) }));
}
/** The bass player's part (a dead note short and soft), `oct` octaves up. */
function prodBassNotes(c: Ctx, p: Production, oct = 0, scale = 1): N[] {
  const spb = 60 / p.bpm;
  return prodBass(p, c.spans, c.key, c.end).map((n) => ({ beat: Math.max(0, n.beat + n.late / spb), len: n.len, midi: n.midi + 12 * oct, vel: Math.min(1, n.vel * scale) }));
}
/** The rhythm part, voiced: `strums` the chords struck, `muted` the scratches; `len` scales each chord's length. */
function prodCompNotes(c: Ctx, p: Production, ch: readonly Named[], voice: (x: Named) => number[], o: { muted?: boolean; when?: (beat: number) => boolean; len?: (beat: number) => number; vel?: number; roll?: number } = {}): N[] {
  const spb = 60 / p.bpm;
  const out: N[] = [];
  for (const h of prodComp(p, c.end)) {
    if (h.ghost !== !!o.muted || (o.when && !o.when(h.beat))) continue;
    const x = namedAt(ch, h.beat);
    const ms = voice(x);
    const len = Math.min(h.len * (o.len?.(h.beat) ?? 1), x.beat + x.len - h.beat + 0.05);
    // (struck down, low string first, a few milliseconds apart; the up-strokes from the top)
    const up = Math.round(h.at * 2) % 2 === 1;
    ms.forEach((m, i) => out.push({ beat: Math.max(0, h.beat + h.late / spb + (up ? ms.length - 1 - i : i) * (o.roll ?? 0.012)), len: Math.max(0.06, len), midi: m, vel: Math.min(1, h.vel * (o.vel ?? 1) * (1 - 0.04 * i) + wob(h.beat, 60 + i, 0.03)) }));
  }
  return out;
}
/** The tune in the sections `when` allows, `oct` octaves off the piano's pitch, each note `legato` of its length. */
function prodTune(c: Ctx, p: Production, when: (name: string) => boolean, oct = 0, legato = 0.92, vel = 0.82): N[] {
  const out: N[] = [];
  for (const n of c.mel) {
    if (!when(secAt(p, n.beat))) continue;
    const inBar = n.beat % 4;
    const strong = Math.abs(inBar) < 1e-6 ? 1 : Math.abs(inBar - Math.round(inBar)) < 1e-6 ? 0.93 : 0.86;
    out.push({ beat: n.beat + wob(n.beat, 1, 0.006), len: Math.max(0.1, n.len * legato), midi: n.midi + 12 * oct, vel: Math.min(1, vel * strong + wob(n.beat, 2, 0.04)) });
  }
  return out;
}
/** A line of its own (ABC in the song's key, a unit an eighth), from bar `bar`, at the piano's pitch `oct` octaves off. */
function prodLine(c: Ctx, p: Production, abc: string, bar: number, oct = 0, vel = 0.6, legato = 0.95): N[] {
  const sc = scaleById(c.s.scale);
  const root = melodyRoot(c.key);
  return parseMelody(abc, p.key).notes.map((n) => ({ beat: bar * 4 + n.beat + wob(n.beat, 3, 0.005), len: n.len * legato, midi: scaleMidi(root, sc, n.degree) + n.acc + 12 * oct, vel: vel + wob(n.beat + bar, 4, 0.04) })).filter((n) => n.beat < c.end - 1e-6);
}
/** The tune a diatonic third over itself (a second guitar's harmony), in the sections `when` allows. */
function prodThirds(c: Ctx, p: Production, when: (name: string) => boolean, oct = 0, vel = 0.55): N[] {
  const sc = scaleById(c.s.scale);
  const root = melodyRoot(c.key);
  const out: N[] = [];
  for (const st of c.s.starts)
    for (const n of c.s.melody) {
      const beat = st + n.beat;
      if (beat >= c.end - 1e-6 || !when(secAt(p, beat))) continue;
      out.push({ beat: beat + wob(beat, 5, 0.006), len: n.len * 0.9, midi: scaleMidi(root, sc, n.degree + 2) + 12 * oct, vel: vel + wob(beat, 6, 0.04) });
    }
  return out;
}
/** Held chords through the sections `when` allows (a pad, a string section), voiced by `voice`. */
function prodPad(c: Ctx, p: Production, ch: readonly Named[], voice: (x: Named) => number[], when: (name: string) => boolean, vel: number): N[] {
  const out: N[] = [];
  for (const x of ch) {
    if (x.beat >= c.end - 1e-6 || !when(secAt(p, x.beat))) continue;
    const len = Math.min(x.len, c.end - x.beat);
    for (const m of voice(x)) out.push({ beat: x.beat + wob(x.beat, m, 0.01), len: len * 0.97, midi: m, vel: vel + wob(x.beat, m + 1, 0.03) });
  }
  return out;
}
/** Chord stabs on a bar's pattern (drum characters) in the sections `when` allows. */
function prodStabs(c: Ctx, p: Production, ch: readonly Named[], voice: (x: Named) => number[], pat: (name: string, k: number) => string | undefined, len: number, vel: number): N[] {
  const out: N[] = [];
  for (const b of prodBars(p)) {
    const pt = pat(b.name, b.k);
    if (!pt) continue;
    for (let i = 0; i < pt.length; i++) {
      const v = VEL[pt[i]];
      if (v === undefined) continue;
      const beat = b.beat + (i * 4) / pt.length;
      if (beat >= c.end - 1e-6) continue;
      const x = namedAt(ch, beat);
      for (const m of voice(x)) out.push({ beat: beat + wob(beat, m + 9, 0.004), len, midi: m, vel: vel * v + wob(beat, 8, 0.03) });
    }
  }
  return out;
}

const PRODUCED: Record<string, (c: Ctx) => Stems> = {
  // Velvet Rope, disco-funk: a room kit, a fingered bass in octaves, a clean guitar's chank with its muted scratches,
  // a string section on the intro's riff, strings and brass answering the chorus, a high string descant over the
  // last chorus, a Rhodes under the verses
  'cold-brew': (c) => {
    const p = PRODUCTIONS['cold-brew'];
    const ch = namedChords(p, true);
    const chorus = (s: string) => s.includes('chorus') && !s.startsWith('pre');
    const notIntro = (s: string) => s !== 'intro';
    return {
      drums: [kit('kit', 8, prodKitNotes(c, p), { rev: 22, vol: 104 })],
      perc: [kit('perc', 8, prodPercNotes(c, p), { rev: 30, vol: 92, pan: 84 })],
      bass: [tr('bass', 33, prodBassNotes(c, p), { rev: 4, vol: 112 })],
      lead: [tr('riff', 48, prodTune(c, p, (s) => s === 'intro', 0, 0.8, 0.85), { rev: 45, vol: 108, pan: 60 }), tr('sax', 65, prodTune(c, p, notIntro, -1, 0.9, 0.86), { rev: 42, vol: 114 }), tr('sax 8va', 65, prodTune(c, p, (s) => s === 'last chorus' || s === 'outro', 0, 0.85, 0.5), { rev: 50, vol: 80, pan: 52 })],
      keys: [
        tr('guitar', 27, prodCompNotes(c, p, ch, leader(60, { ext: true, size: 4 })), { rev: 22, vol: 98, pan: 38 }),
        tr('scratch', 28, prodCompNotes(c, p, ch, leader(60, { size: 3 }), { muted: true, vel: 0.9 }), { rev: 18, vol: 84, pan: 38 }),
        tr('rhodes', 4, prodPad(c, p, ch, leader(55, { ext: true, size: 4 }), (s) => s === 'intro' || s.startsWith('verse') || s === 'breakdown', 0.34), { rev: 50, vol: 84, pan: 70, cho: 40 }),
        tr('strings', 49, [
          ...prodPad(c, p, ch, leader(64, { size: 3 }), (s) => chorus(s) || s === 'breakdown' || s === 'outro', 0.3),
          ...[20, 40, 56].flatMap((bar) => prodLine(c, p, 'z8 | z8 | z8 | z4 z e g a | z8 | z8 | z8 | z4 z e g a', bar, 1, 0.5)),
          ...prodLine(c, p, "c'8 | d'8 | b8 | c'8 | c'8 | d'8 | e'4 d'4 | c'8", 56, 0, 0.4, 1),
        ], { rev: 70, vol: 88, pan: 82 }),
        tr('brass', 61, prodStabs(c, p, ch, leader(58, { size: 3 }), (s, k) => (chorus(s) || s === 'outro') && k % 4 !== 3 ? 'x.....X.........' : s.startsWith('pre') && k === 3 ? 'X.X.X.X.X.......' : undefined, 0.3, 0.55), { rev: 40, vol: 86, pan: 50 }),
      ],
    };
  },
  // Night Market, amapiano: an 808 kit, the log drum (a knocking low tom over a sub), a Rhodes on sevenths from the
  // first bar, a clean guitar's stabs, a flute on the tune (voices an octave under it in the choruses), a vocal pad in
  // the choruses, a whistle's descant at the end
  'kite-hill': (c) => {
    const p = PRODUCTIONS['kite-hill'];
    const ch = namedChords(p, true);
    const chorus = (s: string) => s.includes('chorus') && !s.startsWith('pre');
    return {
      drums: [kit('kit', 26, prodKitNotes(c, p), { rev: 25, vol: 104 })],
      perc: [kit('perc', 26, prodPercNotes(c, p), { rev: 35, vol: 92, pan: 80 })],
      bass: [tr('log', 117, prodBassNotes(c, p, 1), { rev: 12, vol: 108 }), tr('sub', 38, prodBassNotes(c, p, 0, 0.8), { rev: 0, vol: 100 })],
      lead: [tr('flute', 73, prodTune(c, p, () => true, 0, 0.9, 0.85), { rev: 50, vol: 114 }), tr('oohs', 53, prodTune(c, p, chorus, -1, 0.95, 0.5), { rev: 60, vol: 86, pan: 50 })],
      keys: [
        tr('rhodes', 4, prodPad(c, p, ch, leader(55, { ext: true, size: 4 }), () => true, 0.55), { rev: 55, vol: 104, pan: 56, cho: 40 }),
        tr('stabs', 27, prodCompNotes(c, p, ch, leader(62, { ext: true, size: 3 }), { roll: 0.006 }), { rev: 35, vol: 88, pan: 30 }),
        tr('voices', 54, prodPad(c, p, ch, leader(62, { size: 3 }), (s) => chorus(s) || s === 'outro', 0.32), { rev: 75, vol: 84, pan: 90 }),
        tr('whistle', 78, prodLine(c, p, 'f8 | e8 | e8 | d4 F4 | f8 | g8 | f4 e4 | d8', 52, -1, 0.42, 1), { rev: 65, vol: 78, pan: 70 }),
      ],
    };
  },
  // Skinned Knees, pop-punk: a power kit, a picked bass, two distorted guitars left and right (palm-muted in the
  // verses, a clean one ringing through the bridge's first half), the tune on an overdriven lead, a glockenspiel and a
  // choir on the post-chorus hook, a harmony a third over the tune in the last chorus
  rooftop: (c) => {
    const p = PRODUCTIONS.rooftop;
    const ch = namedChords(p, false);
    const power = (lo: number) => (x: Named) => {
      const r = lo + ((x.pc - lo + 120) % 12);
      return [r, r + 7, r + 12];
    };
    const muted = (b: number) => secKind(p, b) === 'verse';
    const clean = (b: number) => secAt(p, b) === 'half-time bridge' && b < prodBars(p).findIndex((x) => x.name === 'half-time bridge') * 4 + 16;
    const gtr = (prog: number, lo: number, pan: number, late: number) =>
      tr(`guitar ${pan}`, prog, prodCompNotes(c, p, ch, power(lo), { when: (b) => !clean(b), len: (b) => (muted(b) ? 0.35 : 1), roll: 0.008 }).map((n) => ({ ...n, beat: n.beat + late, vel: muted(n.beat - late) ? n.vel * 0.85 : n.vel })), { rev: 18, vol: 92, pan });
    return {
      drums: [kit('kit', 16, prodKitNotes(c, p), { rev: 20, vol: 106 })],
      perc: [kit('perc', 16, prodPercNotes(c, p), { rev: 30, vol: 88, pan: 76 })],
      bass: [tr('bass', 34, prodBassNotes(c, p), { rev: 4, vol: 112 })],
      lead: [tr('lead', 29, prodTune(c, p, () => true, -1, 0.95, 0.86), { rev: 35, vol: 112 })],
      keys: [
        gtr(30, 40, 22, 0),
        gtr(29, 40, 106, 0.012),
        tr('clean', 27, prodCompNotes(c, p, ch, leader(52, { size: 4 }), { when: clean, roll: 0.05 }), { rev: 45, vol: 96, pan: 64 }),
        tr('glock', 9, prodTune(c, p, (s) => s.startsWith('post') || s === 'outro', 0, 0.5, 0.5), { rev: 50, vol: 74, pan: 84 }),
        tr('choir', 52, prodTune(c, p, (s) => s.startsWith('post') || s === 'last chorus' || s === 'outro', -1, 1, 0.5), { rev: 60, vol: 82, pan: 44 }),
        tr('harmony', 29, prodThirds(c, p, (s) => s === 'last chorus', -1, 0.5), { rev: 40, vol: 84, pan: 96 }),
      ],
    };
  },
};

const ARR: Record<string, (c: Ctx) => Stems> = {
  ...PRODUCED,
  // Für Elise as Beethoven wrote it: the right hand's tune (the lead) and everything else of the score, both hands,
  // with the pedal changed on each harmony
  'fur-elise': (c) => {
    const sc = scoreOf(c);
    return {
      lead: [tr('piano', 0, sc.lead, { rev: 50, vol: 112, pedal: pedals(c) })],
      keys: [tr('piano', 0, [...sc.voice('left'), ...sc.voice('right (rest)')], { rev: 50, vol: 104, pedal: pedals(c) })],
    };
  },
  // Pachelbel as written for three violins and bass: the first violin's line the lead, the second and third
  // following it, the cello's ground with a double bass under it once it's going, a harp on the chords and a soft
  // string pad in the fuller variations
  canon: (c) => {
    const sc = scoreOf(c);
    const cello = sc.voice('cello');
    return {
      lead: [tr('violin I', 40, [...sc.lead, ...sc.voice('violin1')], { rev: 70, vol: 110, pan: 50 })],
      strings: [tr('violin II', 40, sc.voice('violin2'), { rev: 70, vol: 96, pan: 78 }), tr('violin III', 41, sc.voice('violin3'), { rev: 70, vol: 92, pan: 34 }), tr('pad', 49, pad(c, 55, 0.3, (b) => b.chorus), { rev: 80, vol: 66 })],
      bass: [tr('cello', 42, cello, { rev: 55, vol: 100 }), tr('double bass', 43, cello.filter((n) => n.beat >= 8 * c.meter).map((n) => ({ ...n, midi: n.midi - 12, vel: n.vel * 0.7 })), { rev: 45, vol: 80 })],
      keys: [tr('harp', 46, arp(c, 8, (b) => (b.chorus ? 'r58358f5' : b.kind === 'verse' ? 'r5835...' : undefined), 50, 0.42, 2), { rev: 65, vol: 80, pan: 44 })],
    };
  },
  // Joplin's rag as written (the tune the lead, the rest of both hands the keys); brushes from the first strain and an
  // upright bass doubling the left hand's bass notes from the second
  entertainer: (c) => {
    const sc = scoreOf(c);
    const left = sc.voice('left');
    const lows = left.filter((n) => n.midi < 50 && n.beat >= 20 * c.meter);
    return {
      lead: [tr('piano', 0, sc.lead, { rev: 30, vol: 112 })],
      keys: [tr('piano', 0, [...left, ...sc.voice('right (rest)')], { rev: 30, vol: 104 })],
      bass: [tr('upright', 32, lows.map((n) => ({ ...n, len: Math.min(n.len, 0.9), vel: n.vel * 0.8 })), { rev: 15, vol: 92 })],
      drums: kitTracks(c),
    };
  },
  // Mozart's rondo as written; in its A major marches a light Turkish band: bass drum, cymbal and triangle
  'turkish-march': (c) => {
    const sc = scoreOf(c);
    return {
      lead: [tr('piano', 0, sc.lead, { rev: 35, vol: 112 })],
      keys: [tr('piano', 0, [...sc.voice('left'), ...sc.voice('right (rest)')], { rev: 35, vol: 104 })],
      drums: kitTracks(c),
    };
  },
  'william-tell': (c) => ({
    lead: [tr('trumpet', 56, tune(c, 0, 0.8), { rev: 45, vol: 114 }), tr('strings', 48, tune(c, 0, 0.8, fromPass(1), 0.62), { rev: 55, vol: 86, pan: 80 })],
    strings: [tr('off-beats', 48, hits(c, 4, (b) => (b.solo ? undefined : '.x.x'), 55, 0.8, 0.6), { rev: 50, vol: 84, pan: 76 })],
    bass: [tr('tuba', 58, bassPat(c, 4, (b) => (b.solo ? '1...' : '1.5.'), 36, 0.8, 0.5), { rev: 25, vol: 104 })],
    drums: kitTracks(c),
    brass: [tr('horns', 60, pad(c, 53, 0.4, (b) => b.chorus), { rev: 55, vol: 80 })],
  }),
  // the galop infernal: violins and piccolo on the tune, oom-pah under it (the tuba on the beat, the brass on the
  // off-beat), bass drum and cymbals, and the trumpets join the second time
  'can-can': (c) => ({
    lead: [tr('violins', 40, tune(c, 0, 0.75), { rev: 45, vol: 112 }), tr('piccolo', 72, tune(c, 1, 0.75, all, 0.55), { rev: 50, vol: 80, pan: 84 }), tr('trumpet', 56, tune(c, 0, 0.75, fromPass(1), 0.6), { rev: 45, vol: 84, pan: 44 })],
    bass: [tr('tuba', 58, bassPat(c, 8, (b) => (b.solo ? '1.......' : '1.5.1.5.'), 36, 0.8, 0.6), { rev: 20, vol: 104 })],
    brass: [tr('pah', 61, hits(c, 8, (b) => (b.solo ? undefined : '.x.x.x.x'), 55, 0.7, 0.55), { rev: 40, vol: 84, pan: 76 })],
    drums: kitTracks(c),
  }),
  // the Ninth's theme: strings the first time, the brass and a choir the second, timpani, and a big kit at the last
  'ode-to-joy': (c) => ({
    lead: [tr('strings', 48, tune(c, 0, 0.98, pass(0)), { rev: 65, vol: 112 }), tr('brass', 61, tune(c, 0, 0.95, fromPass(1)), { rev: 60, vol: 110 }), tr('violins', 48, tune(c, 1, 0.95, fromPass(1), 0.55), { rev: 70, vol: 80 })],
    strings: [tr('pad', 49, pad(c, 50, 0.4, all), { rev: 75, vol: 80 }), tr('choir', 52, pad(c, 55, 0.4, fromPass(1)), { rev: 80, vol: 82, pan: 80 })],
    bass: [tr('basses', 43, bassPat(c, 4, (b) => (b.pass >= 1 ? '1.1.' : '1...'), 38, 0.75, 0.9), { rev: 50, vol: 100 })],
    drums: kitTracks(c),
  }),
  'mountain-king': (c) => ({
    lead: [tr('bassoon', 70, tune(c, -1, 0.7, pass(0)), { rev: 45, vol: 112 }), tr('clarinet', 71, tune(c, 0, 0.75, pass(1)), { rev: 45, vol: 108 }), tr('strings', 48, tune(c, 0, 0.8, fromPass(1), 0.55), { rev: 55, vol: 84 }), tr('lead guitar', 29, tune(c, 0, 0.8, pass(2), 0.8), { rev: 40, vol: 100 })],
    strings: [tr('pizzicato', 45, hits(c, 4, (b) => (b.pass === 0 ? 'x.x.' : b.pass === 1 ? 'xxxx' : undefined), 50, 0.5, 0.6), { rev: 50, vol: 90 })],
    brass: [tr('horns', 60, pad(c, 50, 0.45, fromPass(1)), { rev: 55, vol: 84 })],
    bass: [tr('cello pizz', 45, bassPat(c, 4, (b) => (b.pass === 0 ? '1.1.' : undefined), 38, 0.7, 0.4), { rev: 35, vol: 100 }), tr('bass', 34, bassPat(c, 8, (b) => (b.pass >= 1 ? '11111111' : undefined), 38, 0.75, 0.7), { rev: 10, vol: 104 })],
    guitar: [tr('power chords', 30, power(c, 8, (b) => (b.pass === 2 ? 'x.x.x.x.' : undefined), 40, 0.7), { rev: 25, vol: 88 })],
    drums: kitTracks(c),
  }),
  // folk: a steel-string guitar picking each chord, the flute on the tune (then the fiddle); strings, a soft bass and a frame drum the second time
  'scarborough-fair': (c) => ({
    lead: [tr('flute', 73, tune(c, 0, 0.95, pass(0)), { rev: 65, vol: 112 }), tr('fiddle', 40, tune(c, 0, 0.95, fromPass(1)), { rev: 60, vol: 110 })],
    guitar: [tr('steel', 25, arp(c, 6, (b) => (b.solo ? 'r5835.' : 'r58358'), 40, 0.58, 2.4), { rev: 50, vol: 100, pan: 44 })],
    strings: [tr('strings', 49, pad(c, 52, 0.34, fromPass(1)), { rev: 80, vol: 72, pan: 84 })],
    bass: [tr('bass', 32, bassPat(c, 6, (b) => (b.pass >= 1 ? '1-----' : undefined), 36, 0.6, 0.95), { rev: 20, vol: 92 })],
    drums: kitTracks(c),
  }),
  // the hymn: a church organ and a choir under the piano's tune, the basses on each chord; a soft brushed pulse the
  // second time, the strings doubling the tune
  'amazing-grace': (c) => ({
    lead: [tr('piano', 0, tune(c, 0, 1), { rev: 60, vol: 112, pedal: pedals(c) }), tr('strings', 48, tune(c, 0, 0.98, fromPass(1), 0.55), { rev: 70, vol: 82 })],
    keys: [tr('organ', 19, pad(c, 52, 0.42, all), { rev: 70, vol: 82 })],
    strings: [tr('choir', 52, pad(c, 57, 0.42, fromPass(1)), { rev: 85, vol: 84, pan: 80 })],
    bass: [tr('basses', 43, c.spans.map((x) => ({ beat: x.beat, len: x.len * 0.95, midi: rootFrom(c, x, 36), vel: 0.62 })), { rev: 50, vol: 96 })],
    drums: kitTracks(c),
  }),
  // a New Orleans street band: the trumpet on the tune, the clarinet over it the second time, the banjo on two and
  // four, the tuba on one and three, a jazz kit
  saints: (c) => ({
    lead: [tr('trumpet', 56, tune(c, 0, 0.92), { rev: 45, vol: 114 }), tr('clarinet', 71, tune(c, 1, 0.9, fromPass(1), 0.5), { rev: 50, vol: 82, pan: 84 })],
    guitar: [tr('banjo', 105, hits(c, 4, (b) => (b.solo ? 'x...' : '.x.x'), 55, 0.7, 0.7), { rev: 30, vol: 92, pan: 40 })],
    bass: [tr('tuba', 58, bassPat(c, 4, (b) => (b.solo ? '1...' : '1.5.'), 36, 0.8, 0.75), { rev: 25, vol: 104 })],
    brass: [tr('trombone', 57, pad(c, 48, 0.4, (b) => b.chorus), { rev: 45, vol: 76 })],
    drums: kitTracks(c),
  }),
  // a sea shanty: the accordion on the tune (the fiddle with it the second time), a strummed guitar, the bass on the
  // beat, stomps and claps and a tambourine
  'drunken-sailor': (c) => ({
    lead: [tr('accordion', 21, tune(c, 0, 0.9), { rev: 40, vol: 112 }), tr('fiddle', 110, tune(c, 0, 0.85, fromPass(1), 0.6), { rev: 45, vol: 86, pan: 84 })],
    guitar: [tr('guitar', 25, hits(c, 8, (b) => (b.solo ? 'x.......' : 'X.x.X.x.'), 52, 1.6, 0.6), { rev: 30, vol: 92, pan: 40 })],
    bass: [tr('bass', 32, bassPat(c, 4, (b) => (b.solo ? '1...' : '1.5.'), 36, 0.8, 0.7), { rev: 15, vol: 104 })],
    drums: kitTracks(c),
  }),
  // the Russian dance (and Tetris): the accordion first, oom-pah under it; the second time four on the floor, a
  // synth bass and the square-wave lead on top
  korobeiniki: (c) => ({
    lead: [tr('accordion', 21, tune(c, 0, 0.85), { rev: 40, vol: 110 }), tr('square', 80, tune(c, 0, 0.8, fromPass(1), 0.62), { rev: 40, vol: 86, pan: 40 })],
    keys: [tr('pah', 21, hits(c, 8, (b) => (b.solo ? undefined : '.x.x.x.x'), 55, 0.6, 0.5), { rev: 35, vol: 82, pan: 80 }), tr('pad', 89, pad(c, 52, 0.4, fromPass(1)), { rev: 70, vol: 76 })],
    bass: [tr('oom', 32, bassPat(c, 8, (b) => (b.pass === 0 ? '1.5.1.5.' : undefined), 36, 0.8, 0.6), { rev: 15, vol: 104 }), tr('synth bass', 38, bassPat(c, 8, (b) => (b.pass >= 1 ? '18181818' : undefined), 36, 0.75, 0.5), { rev: 10, vol: 98 })],
    drums: kitTracks(c),
  }),
};

/** Power chords (root, fifth, octave) on a pattern, from the root at or above `lo`. */
function power(c: Ctx, steps: number, pat: (b: BarPlan) => string | undefined, lo: number, vel: number): N[] {
  const out: N[] = [];
  c.plan.forEach((b, n) =>
    eachStep(c, b, n, pat(b), steps, (bt, ch) => {
      const k = VEL[ch];
      if (k === undefined) return;
      const r = rootFrom(c, chordAt(c, bt), lo);
      for (const m of [r, r + 7, r + 12]) out.push({ beat: bt, len: (c.meter / steps) * 0.9, midi: m, vel: vel * k });
    }),
  );
  return out;
}

/** A piece brought in from its score (tools/stems/scores/<id>.json, made by tools/stems/import-score.ts): its tune as
 * written (the lead) and its other voices, on the song's beats, to the last hit (that's yours, and its chord is the
 * game's once you've hit it). */
function scoreOf(c: Ctx): { lead: N[]; voice: (name: string) => N[] } {
  const j = JSON.parse(readFileSync(`tools/stems/scores/${c.s.tune.id}.json`, 'utf8')) as { lead: number[][]; voices: Record<string, number[][]> };
  const conv = (a: number[][]) => a.filter(([beat]) => beat < c.end - 1e-6).map(([beat, len, midi, vel]) => ({ beat: Math.max(0, beat + wob(beat, midi, 0.004)), len, midi, vel: Math.min(1, 0.08 + 0.9 * vel + wob(beat, midi + 1, 0.03)) }));
  return { lead: conv(j.lead), voice: (name) => conv(j.voices[name] ?? []) };
}

/** A bar of Für Elise that opens on a held note (the left hand plays under those). */
function barStartsLong(c: Ctx, b: BarPlan): boolean {
  return c.mel.some((n) => Math.abs(n.beat - b.beat) < 1e-6 && n.len >= 1);
}
/** The piano's sustain pedal, changed with each chord. */
function pedals(c: Ctx): [number, number][] {
  return c.spans.map((x) => [x.beat + 0.02, x.beat + x.len - 0.03] as [number, number]);
}

// ------------------------------------------------------------------ MIDI out

const PPQ = 480;
function vlq(n: number): number[] {
  const out = [n & 0x7f];
  while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
  return out;
}
function smf(bpm: number, tracks: Track[]): Buffer {
  const chunk = (id: string, data: number[]) => Buffer.concat([Buffer.from(id), Buffer.from([(data.length >>> 24) & 255, (data.length >>> 16) & 255, (data.length >>> 8) & 255, data.length & 255]), Buffer.from(data)]);
  const us = Math.round(60000000 / bpm);
  const tempo = chunk('MTrk', [0, 0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255, 0, 0xff, 0x2f, 0]);
  let chan = 0;
  const trks = tracks.map((t) => {
    if (!t.drums && chan === 9) chan++;
    const ch = t.drums ? 9 : chan++;
    const ev: { tick: number; order: number; bytes: number[] }[] = [];
    const at = (b: number) => Math.max(0, Math.round(b * PPQ));
    ev.push({ tick: 0, order: 0, bytes: [0xb0 | ch, 0, 0] }, { tick: 0, order: 0, bytes: [0xc0 | ch, t.program & 127] });
    ev.push({ tick: 0, order: 0, bytes: [0xb0 | ch, 7, t.vol ?? 100] }, { tick: 0, order: 0, bytes: [0xb0 | ch, 10, t.pan ?? 64] }, { tick: 0, order: 0, bytes: [0xb0 | ch, 91, t.rev ?? 40] }, { tick: 0, order: 0, bytes: [0xb0 | ch, 93, t.cho ?? 0] });
    for (const [a, z] of t.pedal ?? []) ev.push({ tick: at(a), order: 2, bytes: [0xb0 | ch, 64, 127] }, { tick: at(z), order: 1, bytes: [0xb0 | ch, 64, 0] });
    for (const n of t.notes) {
      if (n.midi < 0 || n.midi > 127) continue;
      const v = Math.max(1, Math.min(127, Math.round(12 + n.vel * 112)));
      ev.push({ tick: at(n.beat), order: 3, bytes: [0x90 | ch, n.midi, v] }, { tick: Math.max(at(n.beat) + 1, at(n.beat + n.len)), order: 1, bytes: [0x80 | ch, n.midi, 0] });
    }
    ev.sort((a, b) => a.tick - b.tick || a.order - b.order);
    const data: number[] = [];
    let last = 0;
    for (const e of ev) {
      data.push(...vlq(e.tick - last), ...e.bytes);
      last = e.tick;
    }
    data.push(0, 0xff, 0x2f, 0);
    return chunk('MTrk', data);
  });
  const head = Buffer.from([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, trks.length + 1, PPQ >> 8, PPQ & 255]);
  return Buffer.concat([head, tempo, ...trks]);
}

// ------------------------------------------------------------------ main

const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
/** The count-in bar is the track's intro: the stems start four beats before the song's beat 0. */
const INTRO = 4;
/** Pieces that begin as they are written, nothing before them (a piano piece's pickup is its own intro). */
const BARE = new Set(['fur-elise', 'turkish-march', 'entertainer']);
for (const s of SCORES) {
  const id = s.tune.id;
  if (only.length && !only.includes(id)) continue;
  const c = ctxOf(s);
  const stems = (ARR[id] ?? ((x: Ctx) => styled(x)))(c);
  // the intro (over the count-in): the home chord swelling on the pad or keys, and the drummer's pickup into bar one
  // (the originals produced from scratch open as their own arrangements say, on their own first bar)
  if (!BARE.has(id) && !PRODUCED[id]) {
    const holder = stems.strings?.[0] ?? stems.keys?.find((t) => t.name.includes('pad') || t.name === 'organ') ?? stems.keys?.[0] ?? stems.guitar?.[0];
    if (holder) {
      const home = { beat: -INTRO, len: INTRO, semis: s.home.semis, minor: s.home.minor };
      for (const m of voicer(55)(c, home)) for (let k = 0; k < 4; k++) holder.notes.push({ beat: -INTRO + k, len: k === 3 ? 1.05 : 1, midi: m, vel: 0.3 + 0.08 * k });
    }
    const dr = stems.drums?.[stems.drums.length - 1];
    if (dr) {
      const hard = c.plan[0]?.level ?? 0.6;
      for (let k = 0; k < 4; k++) dr.notes.push({ beat: -1 + k / 4, len: 0.2, midi: 38, vel: (0.35 + 0.15 * k) * (0.7 + 0.3 * hard) });
      dr.notes.push({ beat: 0, len: 1, midi: 49, vel: 0.7 }, { beat: 0, len: 0.3, midi: 36, vel: 0.85 });
    }
  }
  // every note moved on by the intro (MIDI time 0 is beat -4)
  for (const tracks of Object.values(stems))
    for (const t of tracks ?? []) {
      for (const n of t.notes) n.beat = Math.max(0, n.beat + INTRO);
      t.pedal = t.pedal?.map(([x, y]) => [x + INTRO, y + INTRO] as [number, number]);
    }
  const dir = `artifacts/stems/${id}`;
  mkdirSync(dir, { recursive: true });
  const list: { id: string; notes: number; gm: boolean; grand: boolean }[] = [];
  for (const [stem, tracks] of Object.entries(stems) as [StemId, Track[]][]) {
    const ts = tracks.filter((t) => t.notes.length);
    if (!ts.length) continue;
    // (the piano is a real concert grand, from its own SoundFont: those tracks go in a file of their own)
    const grand = ts.filter((t) => !t.drums && t.program === 0);
    const gm = ts.filter((t) => !grand.includes(t));
    if (gm.length) writeFileSync(`${dir}/${stem}.mid`, smf(s.tune.bpm, gm));
    // (played into its brighter layers: the grand's softest are very dark; the mix sets the level, not the touch)
    if (grand.length) writeFileSync(`${dir}/${stem}.grand.mid`, smf(s.tune.bpm, grand.map((t) => ({ ...t, notes: t.notes.map((n) => ({ ...n, vel: Math.min(1, 0.3 + 0.8 * n.vel) })) }))));
    list.push({ id: stem, notes: ts.reduce((a, t) => a + t.notes.length, 0), gm: gm.length > 0, grand: grand.length > 0 });
  }
  // the kick on its own (not a stem: what the bass and the keys duck under)
  const kicks = (stems.drums ?? []).flatMap((t) => t.notes.filter((n) => n.midi === 36));
  if (kicks.length) writeFileSync(`${dir}/kick.key.mid`, smf(s.tune.bpm, [kit('kick', 0, kicks)]));
  // the length to render: the intro, to the last hit, and two bars for the band's last notes to ring out
  const seconds = ((INTRO + s.end + s.meter * 2) * 60) / s.tune.bpm;
  writeFileSync(`${dir}/plan.json`, JSON.stringify({ id, bpm: s.tune.bpm, meter: s.meter, end: s.end, start: -INTRO, seconds, key: kicks.length > 0, stems: list }));
  console.log(`${id.padEnd(18)} ${list.map((x) => `${x.id}:${x.notes}`).join(' ')}`);
}
