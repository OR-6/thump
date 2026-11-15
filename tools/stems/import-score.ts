/**
 * Brings a public-domain score (a Mutopia Project MIDI file) into the game (run with vite-node):
 *
 *   npx vite-node tools/stems/import-score.ts <piece> <source.mid>
 *
 * For each piece (PIECES below): the bars to keep (repeats cut to a playable length), its beat (the game's beat is the
 * eighth in Für Elise's 3/8 and the Entertainer's 2/4), the voice that carries the tune. Writes, for the song in
 * src/songs/tunes.ts, its melody in ABC (the tune's top line, only notes a player can take: none shorter than
 * `minLen`) and its chords (read from the harmony bar by bar, or by half bar), and checks the ABC by parsing it back.
 * And for the backing track, every note of the score on the game's beats: tools/stems/scores/<piece>.json (the tune's
 * notes as `lead`, the rest by voice), which tools/stems/arrange-stems.ts plays.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { keyOf, parseMelody, pianoKey } from '../../src/songs/score.js';
import { scaleById, scaleMidi } from '../../src/kit/shelf.js';
// @ts-expect-error (a plain module of the tools)
import { readMidi } from './midi.mjs';

interface Src {
  tick: number;
  dur: number;
  pitch: number;
  vel: number;
  ch: number;
}
interface Piece {
  key: string;
  meter: number;
  /** Game beats per source quarter note. */
  perQuarter: number;
  /** Game beats before the source's tick 0 (a pickup lands in bar 0). */
  shift: number;
  unit: number;
  /** Spans of game beats taken out before anything else (where the source's repeats don't line up with its bars). */
  cuts?: [number, number][];
  /** Source bars to keep (0-based, end excluded), in the game's bars (after the shift and the cuts). */
  keep?: [number, number][];
  /** The track whose top line is the tune; the others are the accompaniment, by name. */
  melody: number;
  voices: Record<number, string>;
  /** The shortest note the tune keeps (game beats). */
  minLen: number;
  /** Two chords a bar where the harmony moves at the half bar. */
  halves?: boolean;
  /** The tune is the top line of these tracks together (a canon's three violins). */
  tuneFrom?: number[];
  /** The chords as written, by bar (a ground bass's), in place of reading them. */
  chordsAt?: (bar: number, bars: number) => string;
}

const PIECES: Record<string, Piece> = {
  // Beethoven, Bagatelle WoO 59: A B A C A, as in the Mutopia Project's public-domain edition (Mutopia-2015/08/18-931)
  // (its MIDI plays the first ending's A, then the second: the first's eighth and its rest are cut, so the bars line up)
  'fur-elise': { key: 'Am', meter: 3, perQuarter: 2, shift: 2, unit: 0.5, melody: 0, voices: { 0: 'right', 1: 'left' }, minLen: 0.5, cuts: [[24, 26]] },
  // Joplin (1902): Intro, A, B, A, C, the interlude and D, repeats cut (Mutopia-2016/11/25-263, public domain)
  // (kept: the intro, A's second time, B's second, A, C's second, the interlude and D's second, which ends it)
  entertainer: { key: 'C', meter: 4, perQuarter: 2, shift: 0, unit: 0.5, melody: 0, voices: { 0: 'right', 1: 'left' }, minLen: 0.5, halves: true, keep: [[0, 4], [20, 36], [52, 84], [100, 120], [136, 152]] },
  // Mozart, Sonata K. 331, Rondo alla turca: the whole movement (Mutopia-2015/08/13-108, public domain)
  'turkish-march': { key: 'Am', meter: 2, perQuarter: 1, shift: 1, unit: 0.25, melody: 0, voices: { 0: 'right', 1: 'left' }, minLen: 0.25 },
  // Pachelbel, Canon per 3 violini e basso: the whole canon over its ground (Mutopia-2015/09/02-2047, CC BY 4.0)
  // (the tune: the first violin's line, which leads; its chords the ground's, one a beat)
  canon: { key: 'D', meter: 4, perQuarter: 1, shift: 0, unit: 0.5, melody: 0, voices: { 0: 'violin1', 1: 'violin2', 2: 'violin3', 3: 'cello' }, minLen: 0.25, tuneFrom: [0], chordsAt: (b, n) => (b === n - 1 ? 'D' : b % 2 ? 'G D G A' : 'D A Bm F#m') },
};

const [, , id, file] = process.argv;
const P = PIECES[id];
if (!P || !file) throw new Error(`usage: import-score.ts <${Object.keys(PIECES).join('|')}> <source.mid>`);
const midi = readMidi(file) as { ppq: number; tracks: { name: string; notes: Src[] }[] };
const raw = (tick: number) => (tick / midi.ppq) * P.perQuarter + P.shift;
/** A source time on the game's beats, the cuts taken out (null: inside one). */
const toBeatOrNull = (tick: number): number | null => {
  let b = raw(tick);
  const at = b;
  for (const [a, z] of P.cuts ?? []) {
    if (at >= a - 1e-6 && at < z - 1e-6) return null;
    if (at >= z - 1e-6) b -= z - a;
  }
  return b;
};
const toBeat = (tick: number) => toBeatOrNull(tick) ?? -1;

// the bars kept, and where each lands
const all = midi.tracks.filter((t) => t.notes.length);
const lastBeat = Math.max(...all.flatMap((t) => t.notes.map((n) => toBeat(n.tick + n.dur))));
const srcBars = Math.ceil(lastBeat / P.meter - 1e-6);
const keep = P.keep ?? [[0, srcBars]];
const barMap = new Map<number, number>();
let nb = 0;
for (const [a, z] of keep) for (let b = a; b < z; b++) barMap.set(b, nb++);
const mapBeat = (beat: number): number | null => {
  const b = Math.floor(beat / P.meter + 1e-9);
  const to = barMap.get(b);
  return to === undefined ? null : to * P.meter + (beat - b * P.meter);
};

interface Note {
  beat: number;
  len: number;
  midi: number;
  vel: number;
}
const voices: Record<string, Note[]> = {};
const q = (x: number, g: number) => Math.round(x / g) * g;
all.forEach((t, i) => {
  const name = P.voices[i] ?? `voice${i}`;
  const out: Note[] = (voices[name] = []);
  for (const n of t.notes) {
    const t0 = toBeatOrNull(n.tick);
    if (t0 === null) continue;
    const b = mapBeat(t0);
    if (b === null) continue;
    out.push({ beat: Math.round(b * 1e4) / 1e4, len: Math.max(0.05, (n.dur / midi.ppq) * P.perQuarter), midi: n.pitch, vel: n.vel / 127 });
  }
});

// the tune: the melody voice's top line, one note an onset, on the grid of half a unit, none shorter than minLen
const mel = P.tuneFrom ? P.tuneFrom.flatMap((i) => voices[P.voices[i]]) : voices[P.voices[P.melody]];
const grid = P.unit / 2;
const onsets = new Map<number, Note>();
const at = new Map<number, Set<number>>();
for (const n of mel) {
  const b = q(n.beat, grid);
  (at.get(b) ?? at.set(b, new Set()).get(b)!).add(n.midi);
  const o = onsets.get(b);
  if (!o || n.midi > o.midi) onsets.set(b, { ...n, beat: b });
}
// (a tune doubled in octaves is the lower one: the octave over it is colour)
for (const [b, n] of onsets) if (at.get(b)!.has(n.midi - 12)) onsets.set(b, { ...n, midi: n.midi - 12 });
const line = [...onsets.values()].sort((a, b) => a.beat - b.beat);
const tune: Note[] = [];
for (let i = 0; i < line.length; i++) {
  const n = line[i];
  const next = line[i + 1]?.beat ?? n.beat + n.len;
  // held to the next note (or its own end, if a rest follows), on the grid
  let len = q(Math.min(next - n.beat, Math.max(n.len, grid)), grid);
  if (next - n.beat - len < grid / 2) len = next - n.beat;
  if (len < P.minLen - 1e-6) continue;
  tune.push({ ...n, len });
}
// what's left of the melody voice (fast runs, inner notes) is accompaniment; with a tune drawn from several voices,
// each keeps its own notes but the one the tune takes
const inTune = new Set(tune.map((n) => `${n.beat}:${n.midi}`));
const taken = new Set<string>();
const rest = (P.tuneFrom ? [] : mel).filter((n) => !inTune.has(`${q(n.beat, grid)}:${n.midi}`));
if (P.tuneFrom)
  for (const i of P.tuneFrom) {
    const v = voices[P.voices[i]];
    voices[P.voices[i]] = v.filter((n) => {
      const id = `${q(n.beat, grid)}:${n.midi}`;
      if (!inTune.has(id) || taken.has(id)) return true;
      taken.add(id);
      return false;
    });
  }

// ------------------------------------------------------------------ the melody in ABC
const k = keyOf(P.key);
const LET = 'CDEFGAB';
const NAT = [0, 2, 4, 5, 7, 9, 11];
const flatKey = k.sig.some((x) => x < 0);
function spell(m: number): { L: number; oct: number; alt: number } {
  const pc = m % 12;
  // the key's own note, else a sharp (a flat in a flat key) of a neighbour
  for (let L = 0; L < 7; L++) if ((NAT[L] + k.sig[L] + 12) % 12 === pc) return { L, oct: Math.floor((m - NAT[L] - k.sig[L]) / 12) - 1, alt: k.sig[L] };
  // (a natural of the key's sharpened or flattened letter before a sharp of another: C natural in D, not B sharp)
  for (let L = 0; L < 7; L++) if (NAT[L] === pc) return { L, oct: Math.floor((m - NAT[L]) / 12) - 1, alt: 0 };
  for (let L = 0; L < 7; L++) {
    const alt = flatKey ? -1 : 1;
    if ((NAT[L] + alt + 12) % 12 === pc) return { L, oct: Math.floor((m - NAT[L] - alt) / 12) - 1, alt };
  }
  throw new Error(`can't spell ${m}`);
}
function len(units: number): string {
  if (Math.abs(units - 1) < 1e-6) return '';
  if (Math.abs(units - Math.round(units)) < 1e-6) return String(Math.round(units));
  if (Math.abs(units * 2 - Math.round(units * 2)) < 1e-6) return `${Math.round(units * 2)}/2`;
  throw new Error(`length ${units}`);
}
// the tune you play sits on the keyboard: a note past either end of it comes an octave in (the band's lead plays it
// where it's written)
const sc0 = scaleById(k.scale);
const onKeys = (m: number): boolean => {
  const sp = spell(m);
  const degree = sp.L + 7 * sp.oct - (k.letter + 7 * 4);
  return pianoKey(k.scale, degree, m - scaleMidi(60 + k.pc, sc0, degree), false) >= 0;
};
// (the whole tune moved by the octaves that put most of it on the keys, the rest folded in one by one)
let shiftBy = 0;
let most = -1;
for (const o of [0, -12, 12, -24, 24]) {
  const on = tune.filter((n) => onKeys(n.midi + o)).length;
  if (on > most) {
    most = on;
    shiftBy = o;
  }
}
const mid = tune.reduce((a, n) => a + n.midi, 0) / Math.max(1, tune.length) + shiftBy;
const played: Note[] = tune.map((n) => {
  let m = n.midi + shiftBy;
  for (let i = 0; i < 4 && !onKeys(m); i++) m += m >= mid ? -12 : 12;
  return { ...n, midi: m };
});
// (the last hit is the home note: the tonic nearest where the tune ends)
{
  const l = played[played.length - 1];
  if (l && (l.midi - k.pc + 120) % 12 !== 0) {
    const d = ((k.pc - l.midi) % 12 + 12) % 12;
    played[played.length - 1] = { ...l, midi: l.midi + (d > 6 ? d - 12 : d) };
  }
}
const bars = nb;
const abcBars: string[] = [];
let ti = 0;
// (a note crossing a bar line is split and tied)
const pieces: Note[] = [];
for (const n of played) {
  let b = n.beat;
  let left = n.len;
  while (left > 1e-6) {
    const barEnd = (Math.floor(b / P.meter + 1e-9) + 1) * P.meter;
    const l = Math.min(left, barEnd - b);
    pieces.push({ ...n, beat: b, len: l, vel: left - l > 1e-6 ? -1 : n.vel });
    b += l;
    left -= l;
  }
}
for (let bar = 0; bar < bars; bar++) {
  const a = bar * P.meter;
  const z = a + P.meter;
  const held = new Map<string, number>();
  let at = a;
  let s = '';
  const rest = (d: number) => {
    // rests in whole units where it can
    let left = d / P.unit;
    while (left > 1e-6) {
      const r = left >= 1 ? Math.floor(left) : left;
      s += `z${len(r)} `;
      left -= r;
    }
  };
  while (ti < pieces.length && pieces[ti].beat < z - 1e-6) {
    const n = pieces[ti++];
    if (n.beat > at + 1e-6) rest(n.beat - at);
    const sp = spell(n.midi);
    const id = `${sp.L}:${sp.oct}`;
    const cur = held.get(id) ?? k.sig[sp.L];
    let acc = '';
    if (cur !== sp.alt) {
      acc = sp.alt === 1 ? '^' : sp.alt === -1 ? '_' : sp.alt === 2 ? '^^' : sp.alt === -2 ? '__' : '=';
      held.set(id, sp.alt);
    }
    const oct = sp.oct - 4;
    const letter = oct >= 1 ? LET[sp.L].toLowerCase() + "'".repeat(oct - 1) : LET[sp.L] + ','.repeat(-oct);
    s += `${acc}${letter}${len(n.len / P.unit)}${n.vel < 0 ? '-' : ''} `;
    at = n.beat + n.len;
  }
  if (z > at + 1e-6) rest(z - at);
  abcBars.push(s.trim());
}
const abc = abcBars.join(' | ');

// ------------------------------------------------------------------ the chords
const NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const allNotes = Object.values(voices).flat();
function chordOver(a: number, z: number): { name: string; score: number } {
  const w = new Array(12).fill(0);
  let low = 999;
  let lowPc = -1;
  for (const n of allNotes) {
    const s = Math.max(a, n.beat);
    const e = Math.min(z, n.beat + n.len);
    if (e <= s) continue;
    w[n.midi % 12] += (e - s) * (n.midi < 55 ? 1.5 : 1);
    if (n.midi < low && n.beat <= a + (z - a) / 2) {
      low = n.midi;
      lowPc = n.midi % 12;
    }
  }
  let best = { name: '', score: -Infinity };
  for (let r = 0; r < 12; r++)
    for (const minor of [false, true]) {
      const tones = [r, (r + (minor ? 3 : 4)) % 12, (r + 7) % 12];
      let sc = 0;
      for (let pc = 0; pc < 12; pc++) sc += tones.includes(pc) ? w[pc] : -0.6 * w[pc];
      if (lowPc === r) sc += 0.4 * (z - a);
      // (the key's own chords are likelier)
      const inKey = tones.every((t) => k.sig.some((x, L) => (NAT[L] + x + 12) % 12 === t));
      // (the key's own chords are likelier; one outside it has to be clearly there)
      if (inKey) sc += 0.15 * (z - a);
      else sc -= 0.45 * (z - a);
      if (sc > best.score) best = { name: (flatKey ? NAMES_FLAT : NAMES_SHARP)[r] + (minor ? 'm' : ''), score: sc };
    }
  return best;
}
const chordBars: string[] = [];
let lastName = '';
for (let bar = 0; bar < bars; bar++) {
  if (P.chordsAt) {
    chordBars.push(P.chordsAt(bar, bars));
    continue;
  }
  const a = bar * P.meter;
  const whole = chordOver(a, a + P.meter);
  let names = [whole.name || lastName || P.key];
  if (P.halves && P.meter % 2 === 0) {
    const x = chordOver(a, a + P.meter / 2);
    const y = chordOver(a + P.meter / 2, a + P.meter);
    if (x.name && y.name && x.name !== y.name && x.score + y.score > whole.score * 1.15) names = [x.name, y.name];
  }
  if (!whole.name && lastName) names = [lastName];
  lastName = names[names.length - 1];
  chordBars.push(names.join(' '));
}
const chords = chordBars.join(' | ');

// ------------------------------------------------------------------ check, and out
const back = parseMelody(abc, P.key, P.meter, P.unit, 0);
if (back.bars !== bars) throw new Error(`${back.bars} bars back, not ${bars}`);
if (back.notes.length !== tune.length) throw new Error(`${back.notes.length} notes back, not ${tune.length}`);
const others: Record<string, Note[]> = {};
for (const [name, ns] of Object.entries(voices)) if (P.tuneFrom || name !== P.voices[P.melody]) others[name] = ns;
if (!P.tuneFrom) others[`${P.voices[P.melody]} (rest)`] = rest;
mkdirSync('tools/stems/scores', { recursive: true });
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
writeFileSync(`tools/stems/scores/${id}.json`, JSON.stringify({ id, bars, meter: P.meter, lead: tune.map((n) => [r4(n.beat), r4(n.len), n.midi, Math.round(n.vel * 100) / 100]), voices: Object.fromEntries(Object.entries(others).map(([name, ns]) => [name, ns.map((n) => [r4(n.beat), r4(n.len), n.midi, Math.round(n.vel * 100) / 100])])) }));
writeFileSync(`artifacts/import-${id}.txt`, `melody:\n${abc}\n\nchords:\n${chords}\n`);
const secs = 0;
void secs;
console.log(`${id}: moved ${shiftBy / 12} octaves, ${tune.filter((n, i) => played[i].midi !== n.midi + shiftBy).length} notes folded; ${bars} bars, ${tune.length} tune notes (${rest.length} of the melody voice left to the band), ${Object.values(voices).flat().length} notes in all`);
console.log(`chords: ${chords}`);
