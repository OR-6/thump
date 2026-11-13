/**
 * The game (DESIGN.md §2, §3.5–3.7): Discover is where you start and free play is always on (anything you
 * hit plays its instrument); songs are chosen on the module and cast onto your room's instruments;
 * results give stars and unlocks, then it's back to playing your room.
 *
 * Time is the game clock (seconds; the audio clock while audio runs). The game talks to the world only
 * through `GameStage` and `Room`, so unit tests drive it with fakes and a bot.
 */
import { TIMING } from '../config.js';
import { oneHanded, secPerBeat, type BedEvent, type Note, type Song } from '../songs/chart.js';
import { EventCursor, SongClock } from '../songs/sequencer.js';
import { NoteJudge, windows, type Grade, type JudgeNote, type Summary } from '../songs/judge.js';
import { SONGS, dailySong } from '../songs/songs.js';
import { cast, noteKey, wants, type Cast, type RoomInstrument } from '../songs/cast.js';
import { bed } from '../songs/chart.js';
import { Bandmate } from '../bandmate/bandmate.js';
import { Looper } from './looper.js';
import { LOOP_BEATS, TRACKS, assign, ownBar, played, quantise, steps, type MachineNote, type PartDef, type RawHit, type Step, type TrackDef } from './build.js';
import { FAMILIES, type Family } from '../room/classify.js';
import { dayKey, type Progress } from '../persistence/progress.js';
import type { Display, ModuleKey } from '../ui/module.js';

export type Unlock = 'tom' | 'jam' | 'loops' | 'swaps';
/** Unlocked by finishing each song the first time. */
export const UNLOCK_AFTER: Record<string, Unlock[]> = {
  'porch-step': ['tom', 'jam', 'swaps'],
  'kitchen-clock': ['loops'],
  'night-bus': [],
  'big-room': [],
  'open-house': [],
};

export interface GameStage {
  /** The backing band: one event at game time `at`. */
  band(e: BedEvent, at: number, spb: number): void;
  /** Light the target `key` ("surface:zone") this frame (0..1). */
  light(key: string, k: number): void;
  /** A celebration: a light sweep across every instrument, a note per star. */
  celebrate(stars: number): void;
  /** Re-pitch the room's melodic instruments into a key (pitch class). */
  retune(keyPc: number): void;
  save(p: Progress): void;
  /** Something new: the tom slides onto the table, JAM lights up… */
  unlock(u: Unlock): void;
  /** The bandmate plays target `key` at game time `at` (sound and light on its instrument). */
  voice(key: string, at: number, vel: number, mate?: boolean): void;
  /** A song was cast (which instruments it uses: the table keys brighten when they're in it). */
  casting(c: Cast): void;
  /** A note went by unplayed: its target dims for a moment. */
  missed(key: string): void;
  /** Slow mode switched in the headset (tempo 0.6–1), to be saved. */
  tempo(t: number): void;
  /** In-headset settings: read and switch (saved by the stage). */
  setting(name: 'oneHand' | 'contrast' | 'words', flip: boolean): boolean;
  /** The bandmate: claims an instrument (by surface id), is pleased, or simplifies. */
  bandmate(event: 'claim' | 'happy' | 'simpler' | 'leave' | 'turn', surface?: string): void;
  /** A good fill: a light sweep over every ring on the desk (no sound: the fill was the sound). */
  flourish?(): void;
  /** Everything comes in at once (the machine dropping back in, a big fill landing): every thing rings and lights. */
  drop?(): void;
  /** Tape on each thing in the machine saying which part it plays (keys of the parts, and their names). */
  labels?(parts: readonly { key: string; name: string }[]): void;
  /** ◀ ▶ on the pad last hit: the next sound in the bank on it; its name, or null when there's no pad. */
  changeSound?(dir: 1 | -1): string | null;
  /** The tuning page: act on a key (null: just read), and what the page shows. */
  tune(k: ModuleKey | null): { line: string; sub: string; labels: string[] };
}

/** The room as the game sees it. */
export interface Room {
  /** Discovered instruments (surface id + family + zone count), the kit excluded. */
  instruments(): RoomInstrument[];
  /** Zone count of a surface ('keys' and room surfaces). */
  zones(surface: string): number;
  /** The zone of a surface that plays a song's scale degree. */
  zoneFor(surface: string, degree: number): number;
  /** The scale degree a zone of a surface plays. */
  degreeOf(surface: string, zone: number): number;
  /** Every instrument found, near or far (the ones that accompany a song). */
  everything?(): RoomInstrument[];
  /** The zone of a surface that sounds one of these pitch classes (a chord tone), or −1. */
  chordZone?(surface: string, pcs: readonly number[]): number;
  /** How many things on the desk you've found and kept (the gate for the next track). */
  things?(): number;
  /** A hand is resting over this thing: its part in the machine is silent. */
  muted?(surface: string): boolean;
  /** What a thing is, in a word a person would use ('cup', 'knee'), when that's known; else null. */
  wordFor?(surface: string): string | null;
}

export type Mode = 'discover' | 'count' | 'play' | 'results' | 'jam' | 'build';

export interface MoteView {
  key: string;
  /** Beats until due (+) or since (−). */
  ahead: number;
  grade: Grade | null;
}

export interface GameOptions {
  /** Device sessions (?debug=1): the settings page says how to reach tuning. */
  debug?: boolean;
  tempo: number;
  offset: number;
}

const MAX_MOTES = 40;

export class Game {
  mode: Mode = 'discover';
  /** Instrument families found, in the order found (the kit first). */
  readonly found: Family[] = [];
  /** How many instrument surfaces the room has within reach (the room map's total). */
  roomTotal = 0;
  selected = 0;
  song: Song | null = null;
  cast: Cast = {};
  readonly clock = new SongClock();
  judge: NoteJudge | null = null;
  last: Summary | null = null;
  readonly motes: MoteView[] = Array.from({ length: MAX_MOTES }, () => ({ key: '', ahead: 0, grade: null }));
  moteCount = 0;
  /** 0..1 how well it's going (the applause meter). */
  energy = 0.5;
  readonly graded = { perfect: 0, good: 0, extra: 0 };
  readonly offsets: number[] = [];
  /** What the module shows now. */
  readonly display: Display = { line: 'Hit something', sub: 'The desk, a mug, anything', found: [], total: 0, meter: -1, stars: -1, pulse: null, count: 0, day: 0, gold: false, code: '', keyLabels: null, locked: [] };
  /** The settings page is up on the module (tap ◀ twice; ▶ closes it). */
  settingsOpen = false;
  /** A pad was just hit: its sound shows on the module and ◀ ▶ change it, for a few seconds. */
  private pad = { name: '', until: -1 };
  /** The tuning page is up (in Settings, tap ◀ twice; ▶ closes it). */
  tuneOpen = false;
  private tuneShownAt = 0;
  /** The songs to choose from: the four, and today's. */
  readonly list: Song[] = [...SONGS, dailySong(dayKey())];
  /** A phone-jam code to show on the display ('' for none). */
  code = '';
  /** The key now (pitch class): a song's, the jam's, or C. */
  get keyPc(): number {
    return this.mode === 'jam' ? 9 : this.song && (this.mode === 'play' || this.mode === 'count') ? this.song.key : 0;
  }
  /** The beat now (song or jam), or NaN outside music. */
  get beatNow(): number {
    return this.mode === 'play' || this.mode === 'count' || this.mode === 'jam' ? this.clock.beatAt(this.t) : Number.NaN;
  }
  /** BPM now (for the phone's light). */
  get bpmNow(): number {
    return this.mode === 'jam' ? 96 * this.opts.tempo : (this.song?.bpm ?? 80) * this.opts.tempo;
  }
  private lastTap: Record<string, number> = {};
  private stopAsked = -1;
  private weakRuns = 0;
  private t = 0;
  private modeT = 0;
  private bedCursor: EventCursor<BedEvent> | null = null;
  private tempoAtStart = 1;
  private lastFound: { family: Family; label: string } | null = null;
  private offered = false;
  private newUnlocks: Unlock[] = [];
  private kitAt = -1;
  /** Has a jam been played (the JAM key stops pulsing). */
  get jammed(): boolean {
    return (this.progress.bandLevel ?? -1) >= 0;
  }

  constructor(
    private stage: GameStage,
    public progress: Progress,
    private room: Room,
    public opts: GameOptions = { tempo: 1, offset: 0 },
  ) {
    // songs finished before an unlock was added to them still grant it
    for (const [id, us] of Object.entries(UNLOCK_AFTER)) if (id in progress.stars) for (const u of us) if (!(progress.unlocks as string[]).includes(u)) (progress.unlocks as string[]).push(u);
    this.selected = Math.min(this.available() - 1, Math.max(0, progress.next));
  }

  /** How many songs you can choose (the next one unlocks as you finish each). */
  available(): number {
    let n = 1;
    for (let i = 0; i < SONGS.length - 1; i++) if (SONGS[i].id in this.progress.stars) n = i + 2;
    // today's song joins once you've played one
    return SONGS[0].id in this.progress.stars ? n + 1 : n;
  }

  /** Song `i` of the choosable list (the daily song last). */
  private songAt(i: number): Song {
    const n = this.available();
    return i === n - 1 && SONGS[0].id in this.progress.stars ? this.list[this.list.length - 1] : this.list[i];
  }

  start(t: number): void {
    this.t = this.modeT = t;
    this.mode = 'discover';
    this.refreshDisplay();
  }

  // ---------------------------------------------------------------- build

  /** The track being built (or running: all its parts recorded). */
  private bld: {
    track: TrackDef;
    part: number;
    phase: 'assign' | 'count' | 'rec' | 'run';
    target: { surface: string; key: string } | null;
    moved: boolean;
    recStart: number;
    hits: RawHit[];
    parts: { def: PartDef; surface: string; key: string; notes: MachineNote[] }[];
    /** The machine's notes are scheduled up to this beat. */
    sched: number;
    /** The last count-in click scheduled. */
    clicked: number;
    /** After a part goes in, hits don't pick the next thing until this beat (you're still playing along). */
    guard: number;
    /** The part just put in, and how much of it you played (shown during the guard). */
    verdict: { name: string; hit: number; of: number } | null;
    /** This part was already played once more (a take with almost nothing in it gets one retry). */
    retried: boolean;
    /** A thing already in the machine was hit while picking: a second hit on it picks it. */
    pending: { key: string; t: number } | null;
    /** The finished machine goes quiet for the bar before this beat, then everything drops in. */
    dropAt: number;
  } | null = null;

  /** The first track not built yet that the things you've found open, or −1. */
  nextTrack(): number {
    const have = this.room.things?.() ?? 0;
    for (let i = 0; i < TRACKS.length; i++) if (!this.built(TRACKS[i].id)) return have >= TRACKS[i].needs ? i : -1;
    return -1;
  }

  /** Things still to find before the next track opens (0: none, or nothing left to open). */
  gate(): number {
    const have = this.room.things?.() ?? 0;
    const t = TRACKS.find((x) => !this.built(x.id));
    return t ? Math.max(0, t.needs - have) : 0;
  }

  performed(id: string): boolean {
    return id in this.progress.stars;
  }

  /** The part the module is asking for a thing for (the autoplayer), or null. */
  buildAsks(): string | null {
    const b = this.bld;
    // (not while the part that just went in is still being shown: hits pick nothing then)
    return b?.phase === 'assign' && this.clock.beatAt(this.t) >= b.guard ? b.track.parts[b.part].name : null;
  }

  buildRunning(): boolean {
    const b = this.bld;
    return b?.phase === 'run' && this.clock.beatAt(this.t) >= b.dropAt;
  }

  /** The tape on your things: which part each one plays (the machine's parts, and the one being picked). */
  private pushLabels(): void {
    if (!this.stage.labels) return;
    const b = this.bld;
    const parts = b ? b.parts : this.machine?.parts ?? [];
    const out = parts.map((p) => ({ key: p.key, name: p.def.name }));
    if (b?.target && (b.phase === 'count' || b.phase === 'rec')) out.push({ key: b.target.key, name: b.track.parts[b.part].name });
    this.stage.labels(out);
  }

  /** Can a hand resting on this thing mute it? Only a part of the machine you're not playing right now. */
  coverable(surface: string): boolean {
    if (this.bld?.target?.surface === surface) return false;
    if (this.perf && [...this.perf.live].some((k) => k.startsWith(surface + ':'))) return false;
    return !!(this.bld?.parts.some((p) => p.surface === surface) || this.machine?.parts.some((p) => p.surface === surface));
  }

  /** Does the machine (or the track being built) use this thing? (Such a thing is kept, never faded.) */
  uses(surface: string): boolean {
    if (this.bld?.target?.surface === surface || this.bld?.parts.some((p) => p.surface === surface)) return true;
    return !!this.machine?.parts.some((p) => p.surface === surface);
  }

  /** Has this track been built (its machine kept)? */
  built(id: string): boolean {
    return (this.progress.built ?? []).includes(id);
  }

  beginBuild(i: number): void {
    const track = TRACKS[i];
    if (!track) return;
    this.looper.clear();
    if (this.mode === 'jam') this.endJam();
    this.mode = 'build';
    this.modeT = this.t;
    this.song = null;
    const spb = secPerBeat(track.bpm, this.opts.tempo);
    this.clock.set(this.t + 0.3, spb);
    this.bld = { track, part: 0, phase: 'assign', target: null, moved: false, recStart: 0, hits: [], parts: [], sched: 0, clicked: -99, guard: -99, verdict: null, retried: false, pending: null, dropAt: -99 };
    this.stage.retune(track.key);
    this.moteCount = 0;
    this.pushLabels();
    this.refreshDisplay();
  }

  /** Stop building or stop the machine; back to playing freely. */
  private endBuild(): void {
    this.bld = null;
    this.pushLabels();
    this.mode = 'discover';
    this.moteCount = 0;
    this.stage.retune(0);
    this.refreshDisplay();
  }

  private buildKey(k: ModuleKey, twice: boolean): void {
    const b = this.bld;
    if (!b) return;
    if (k === 'play') {
      // ▶ while the machine runs: perform on it; ▶ twice while building stops
      if (b.phase === 'run') this.beginPerform();
      else if (twice) this.endBuild();
      else {
        this.stopAsked = this.t;
        this.display.sub = 'Tap ▶ again to stop';
      }
      return;
    }
    if (k === 'prev' && b.parts.length && (b.phase === 'assign' || b.phase === 'run')) {
      // back a part: it comes out of the machine and you pick and play it again
      b.parts.pop();
      b.part = b.parts.length;
      b.phase = 'assign';
      b.target = null;
      b.verdict = null;
      b.guard = -99;
      b.retried = false;
      this.pushLabels();
      this.refreshDisplay();
    }
  }

  /** What the module is suggesting right now (the autoplayer follows it, as a player following the glow would). */
  suggestion(): string | null {
    const ask = this.buildAsks();
    return ask ? this.suggestFor(ask) : null;
  }

  /** Where the module suggests a part should go (lit softly while it asks): a key, or null. */
  private suggestFor(name: string): string | null {
    const b = this.bld!;
    if (name === 'CLAP') return null;
    const used = (id: string) => b.parts.some((p) => p.surface === id);
    const free = this.room.instruments().filter((x) => !used(x.id));
    // your own things first: the hat on something that rings (the mug), the snare on something that knocks (the book)
    const rings = free.find((x) => x.zones < 4 && RINGS.has(x.family));
    const knocks = free.find((x) => x.zones < 4 && KNOCKS.has(x.family));
    if (name === 'KICK') return 'kit:kick';
    if (name === 'SNARE') return knocks ? `${knocks.id}:0` : 'kit:snare';
    if (name === 'HAT') return rings ? `${rings.id}:0` : 'kit:hat';
    if (name.startsWith('KEYS')) {
      const k = free.find((x) => x.zones >= 4);
      return k ? `${k.id}:3` : 'keys:3';
    }
    if (name === 'BASS') {
      const k = free.find((x) => x.family === 'congas') ?? free.find((x) => x.zones >= 4);
      return k ? `${k.id}:0` : 'keys:0';
    }
    return free.length ? `${free[0].id}:0` : (this.progress.unlocks as string[]).includes('tom') ? 'kit:tom' : 'keys:5';
  }

  /** The key a pattern note plays on for a target (pitched parts: the zone with its degree). */
  private keyFor(surface: string, key: string, s: Step): string {
    if (s.degree < 0) return key;
    const z = this.room.zoneFor(surface, s.degree);
    return `${surface}:${Math.max(0, z)}`;
  }

  private hitBuild(key: string, t: number, gain: number): Grade | 'extra' | null {
    const b = this.bld;
    if (!b) return null;
    const beat = this.clock.beatAt(t - this.opts.offset);
    if (b.phase === 'assign') {
      // still playing along with the part that just went in: that's not picking the next thing
      if (beat < b.guard) return null;
      const def = b.track.parts[b.part];
      // a thing already in the machine picks this part too only on a second hit (a stray tap along with the loop doesn't)
      const surface = key.slice(0, key.indexOf(':'));
      // (the desk's bars are a keyboard: several parts share them happily)
      if (surface !== 'keys' && b.parts.some((p) => p.key === key || (p.surface === surface && surface !== 'kit'))) {
        if (!b.pending || b.pending.key !== key || t - b.pending.t > 0.6) {
          b.pending = { key, t };
          return null;
        }
      }
      b.pending = null;
      const a = assign(def, key, (sfc) => this.room.zones(sfc));
      b.target = { surface: a.surface, key: a.key };
      b.moved = a.moved;
      // recording starts on the next bar at least four beats away (the count-in); the take runs two bars from there
      b.recStart = Math.ceil((beat + 4) / 4) * 4;
      b.hits = [];
      b.clicked = Math.floor(beat);
      b.phase = 'count';
      this.pushLabels();
      this.refreshDisplay();
      return null;
    }
    if ((b.phase === 'count' || b.phase === 'rec') && b.target && key.startsWith(b.target.surface + ':')) {
      const rel = beat - b.recStart;
      if (rel < -0.4 || rel > LOOP_BEATS) return null;
      // (unpitched parts: only the thing you chose; pitched: any of its keys)
      const def = b.track.parts[b.part];
      if (def.pitched === 'no' && key !== b.target.key && b.target.surface === 'kit') return null;
      // where in the machine's two-bar loop this hit falls
      const phase = ((beat % LOOP_BEATS) + LOOP_BEATS) % LOOP_BEATS;
      b.hits.push({ beat: phase, key, vel: gain });
      // a grade for the light: close to a pattern note is a perfect
      const st = steps(def.pattern);
      const d = Math.min(...st.map((s) => Math.min(Math.abs(s.beat - phase), LOOP_BEATS - Math.abs(s.beat - phase))));
      return d * this.clock.spb < 0.06 ? 'perfect' : d * this.clock.spb < 0.13 ? 'good' : 'extra';
    }
    return null;
  }

  private tickBuild(t: number): void {
    const b = this.bld;
    if (!b) return;
    if (this.stopAsked > 0 && t - this.stopAsked > 1.2) {
      this.stopAsked = -1;
      this.refreshDisplay();
    }
    const beat = this.clock.beatAt(t);
    const spb = this.clock.spb;
    const ahead = beat + TIMING.lookAheadS / spb;
    // the machine: every recorded part, looping
    if (ahead > b.sched) {
      for (let L = Math.floor(b.sched / LOOP_BEATS); L * LOOP_BEATS <= ahead; L++) {
        for (const p of b.parts) {
          if (this.room.muted?.(p.surface)) continue;
          for (const n of p.notes) {
            const at = L * LOOP_BEATS + n.beat;
            // (the bar before the drop is silent)
            if (at >= b.dropAt - 4 && at < b.dropAt) continue;
            if (at > b.sched && at <= ahead && at >= 0) this.stage.voice(n.key, this.clock.timeAt(at), n.filled ? n.vel * 0.85 : n.vel);
          }
        }
      }
      b.sched = ahead;
    }
    this.moteCount = 0;
    if (b.phase === 'run' && b.dropAt > 0) {
      const left = Math.ceil(b.dropAt - beat);
      if (beat >= b.dropAt) {
        b.dropAt = -1;
        this.stage.drop?.();
        this.refreshDisplay();
      } else if (left <= 4 && left !== this.display.count) this.refreshDisplay();
    }
    if (b.phase === 'assign') {
      if (b.verdict && beat >= b.guard) {
        b.verdict = null;
        this.refreshDisplay();
      }
      // the module's suggestion breathes on the beat (anything else works too)
      const sug = beat >= b.guard ? this.suggestFor(b.track.parts[b.part].name) : null;
      if (sug) this.stage.light(sug, 0.25 + 0.35 * Math.pow(1 - (beat - Math.floor(beat)), 2));
    }
    if (b.phase === 'count' || b.phase === 'rec') {
      const def = b.track.parts[b.part];
      const target = b.target!;
      // the count-in: a soft click on every beat until recording, the downbeat of the take's bar louder
      const nextClick = Math.ceil(beat);
      const ownClick = !b.parts.length && nextClick >= b.recStart + 4 && nextClick < b.recStart + LOOP_BEATS;
      if ((nextClick < b.recStart || ownClick) && nextClick > b.clicked && nextClick - beat < TIMING.lookAheadS / spb + 0.05) {
        b.clicked = nextClick;
        this.stage.band({ beat: nextClick, voice: 'shaker', midi: 0, len: 0.2, vel: nextClick === b.recStart - 4 ? 0.9 : 0.6 }, this.clock.timeAt(nextClick), spb);
      }
      // the part's notes light on your thing a beat ahead and fly to it from the module
      let k = 0;
      for (const s of steps(def.pattern)) {
        const rel = (s.beat - (b.recStart % LOOP_BEATS) + LOOP_BEATS) % LOOP_BEATS;
        // the take's second bar is yours: no lights
        if (rel >= 4) continue;
        const at = b.recStart + rel;
        const d = at - beat;
        const key = this.keyFor(target.surface, target.key, s);
        if (d <= TIMING.glowBeats && d > -0.3) this.stage.light(key, 1 - Math.max(0, d) / TIMING.glowBeats);
        if (d <= TIMING.travelBeats && d > -0.6 && k < this.motes.length) {
          const m = this.motes[k++];
          m.key = key;
          m.ahead = d;
          m.grade = null;
        }
      }
      this.moteCount = k;
      if (b.phase === 'count') {
        const n = Math.max(0, Math.min(8, Math.ceil(b.recStart - beat)));
        if (beat >= b.recStart) {
          b.phase = 'rec';
          this.refreshDisplay();
        } else if (n !== this.display.count) this.refreshDisplay();
      } else if (beat >= b.recStart + 4 && beat < b.recStart + 4.2 && this.display.sub !== 'Your bar') {
        this.refreshDisplay();
      } else if (beat >= b.recStart + LOOP_BEATS + 0.35) {
        // the part is in: the lit bar snapped and filled, your own bar as you played it (on the 16ths), looping
        const pat = steps(def.pattern);
        const off = b.recStart % LOOP_BEATS;
        const relOf = (x: number) => (x - off + LOOP_BEATS) % LOOP_BEATS;
        const inOwn = (x: number) => {
          const r = relOf(x);
          return r >= 3.66 && r < LOOP_BEATS - 0.4;
        };
        const mine = b.hits.filter((h) => inOwn(h.beat));
        let notes: MachineNote[];
        let own = false;
        if (mine.length >= 2) {
          own = true;
          const loud = Math.max(...b.hits.map((h) => h.vel));
          const lit = pat.filter((s) => relOf(s.beat) < 4);
          notes = [...quantise(lit, b.hits.filter((h) => !inOwn(h.beat)), (s) => this.keyFor(target.surface, target.key, s)), ...ownBar(mine, loud)];
          notes.sort((x, y) => (x.at ?? x.beat) - (y.at ?? y.beat));
        } else notes = quantise(pat, b.hits, (s) => this.keyFor(target.surface, target.key, s));
        const share = own ? Math.max(0.5, played(notes, pat.filter((s) => relOf(s.beat) < 4)) ) : played(notes, pat);
        // almost nothing played: once more, straight away (only once; then it goes in filled)
        if (share < 0.34 && !b.retried) {
          b.retried = true;
          b.recStart = Math.ceil((beat + 4) / 4) * 4;
          b.hits = [];
          b.clicked = Math.floor(beat);
          b.phase = 'count';
          this.refreshDisplay();
          return;
        }
        b.retried = false;
        b.parts.push({ def, surface: target.surface, key: target.key, notes });
        b.verdict = { name: def.name, hit: own ? -1 : Math.round(share * pat.length), of: pat.length };
        b.guard = Math.ceil(beat) + 4;
        // the new part's notes already inside the scheduled window go out now, once
        const base = Math.floor(beat / LOOP_BEATS) * LOOP_BEATS;
        for (const n of notes) {
          let at = base + n.beat;
          if (at <= beat - 0.02) at += LOOP_BEATS;
          if (at <= b.sched && !(at >= b.dropAt - 4 && at < b.dropAt)) this.stage.voice(n.key, this.clock.timeAt(at), n.filled ? n.vel * 0.85 : n.vel);
        }
        b.part++;
        b.target = null;
        this.pushLabels();
        if (b.part >= b.track.parts.length) {
          b.phase = 'run';
          this.machine = { track: b.track, parts: b.parts.slice() };
          const list = this.progress.built ?? (this.progress.built = []);
          if (!list.includes(b.track.id)) list.push(b.track.id);
          this.stage.save(this.progress);
          // every part is in: one bar of nothing, then the whole machine drops in together
          b.dropAt = Math.ceil((beat + 5) / LOOP_BEATS) * LOOP_BEATS;
          b.verdict = null;
          b.guard = -99;
        } else b.phase = 'assign';
        this.refreshDisplay();
      }
    }
  }

  private buildDisplay(d: Display): void {
    const b = this.bld!;
    const n = b.track.parts.length;
    const def = b.track.parts[b.part];
    d.pulse = null;
    if (b.phase === 'run') {
      d.line = b.track.name;
      const left = Math.ceil(b.dropAt - this.clock.beatAt(this.t));
      if (b.dropAt > 0 && left <= 4) {
        // the silent bar before everything drops in
        d.count = Math.max(1, left);
        d.sub = 'All of it, on the one';
        return;
      }
      d.sub = b.dropAt > 0 ? `${n} parts in` : 'Your track. Perform? ▶';
      d.pulse = b.dropAt > 0 ? null : 'play';
      return;
    }
    d.line = `${b.part + 1}/${n}  ${def.name}`;
    if (b.phase === 'assign') {
      if (b.verdict) {
        // what just went in, and what's next (hits pick nothing for this bar)
        const v = b.verdict;
        d.line = v.hit < 0 ? `${v.name}: yours` : v.hit >= v.of ? `${v.name}: every note` : `${v.name}: ${v.hit} of ${v.of}`;
        d.sub = `Next: ${def.name}`;
        return;
      }
      d.sub = ASK[def.name];
      return;
    }
    if (b.phase === 'count') {
      d.count = Math.max(1, Math.min(8, Math.ceil(b.recStart - this.clock.beatAt(this.t))));
      d.sub = b.retried ? 'Once more' : b.moved ? 'Play this one on the keys' : 'Play along';
      d.line = def.name;
      return;
    }
    // the take's second bar: no lights, play what you like
    d.sub = this.clock.beatAt(this.t) >= b.recStart + 4 ? 'Your bar' : 'Play along';
  }

  // ---------------------------------------------------------------- perform

  /** The machine you built this session (its parts on your things). */
  private machine: { track: TrackDef; parts: { def: PartDef; surface: string; key: string; notes: MachineNote[] }[] } | null = null;
  private perf: {
    track: TrackDef;
    /** Parts you play live (the chart); the rest is the bed. */
    live: Set<string>;
    fills: [number, number][];
    fillHits: number[];
    fillsJudged: number;
    goodFills: number;
    holdFrom: number;
    sched: number;
    /** A good fill just landed: the module says so until this beat. */
    big: number;
    /** The part on your own thing, which joins the chart at bar 5 (announced the bar before), or ''. */
    joins: string;
  } | null = null;

  /** Perform on the machine: it drops to a bed, the kit parts are yours to play on your own things. */
  beginPerform(): void {
    const m = this.machine;
    if (!m) return;
    const t = m.track;
    this.bld = null;
    // you play the kick, the snare and the part on a thing you found (your cup, your book); the rest is the bed
    const found = m.parts.find((p) => p.surface !== 'kit' && p.surface !== 'keys' && p.def.name !== 'KICK' && p.def.name !== 'SNARE' && !p.def.name.startsWith('KEYS') && p.def.name !== 'BASS');
    const live = m.parts.filter((p) => p.def.name === 'KICK' || p.def.name === 'SNARE' || p === found);
    const rank = (key: string) => {
      const i = live.findIndex((p) => p.key === key);
      return i >= 0 ? i : live.findIndex((p) => p.surface !== 'kit' && key.startsWith(p.surface + ':'));
    };
    // 16 bars with a fill in bars 7–8 and 15–16, then 4 bars of hold it (scored, never shown)
    const bars = 20;
    const fills: [number, number][] = [
      [24, 32],
      [56, 64],
    ];
    const holdFrom = 64;
    const notes: Note[] = [];
    for (const p of live)
      for (let L = 0; L < bars / 2; L++)
        for (const n of p.notes) {
          // what you made (your own bar included), on the grid, on the bar or pad you played it on
          const beat = L * LOOP_BEATS + (n.at ?? n.beat);
          if (fills.some(([a, z]) => beat >= a && beat < z)) continue;
          // an arc: kick and snare first; your own thing joins at bar 5
          if (p === found && beat < 16) continue;
          notes.push({ beat, part: n.key as never, degree: -1, vel: Math.max(0.6, n.vel) });
        }
    notes.sort((a, b) => a.beat - b.beat || rank(a.part as string) - rank(b.part as string));
    // two hands: never more than two things at once (the later part's note goes back to the bed)
    for (let i = notes.length - 1; i >= 2; i--) if (Math.abs(notes[i].beat - notes[i - 2].beat) < 0.01) notes.splice(i, 1);
    const song: Song = { id: t.id, name: t.name, mood: 'yours', bpm: t.bpm, bars, beatsPerBar: 4, key: t.key, parts: [], notes, bed: [] };
    this.perf = { track: t, live: new Set(live.map((p) => p.key)), fills, fillHits: [], fillsJudged: 0, goodFills: 0, holdFrom, sched: -0.01, big: -1, joins: found && live.includes(found) ? found.def.name : '' };
    // the song engine, with each note on the thing you chose
    this.looper.clear();
    this.song = song;
    this.cast = {};
    this.accompanists = [];
    this.played.length = 0;
    this.encore.length = 0;
    this.encoreAt = -1;
    this.stage.retune(t.key);
    const spb = secPerBeat(t.bpm, this.opts.tempo);
    this.tempoAtStart = this.opts.tempo;
    this.clock.set(this.t + 0.4 + 4 * spb, spb);
    this.bedCursor = new EventCursor([0, 1, 2, 3].map((k) => ({ beat: k - 4, voice: 'shaker' as const, midi: 0, len: 0.2, vel: k === 0 ? 0.9 : 0.6 })));
    this.bedCursor.seek(-4);
    const chart = this.stage.setting('oneHand', false) ? oneHanded(notes) : notes;
    this.judge = new NoteJudge(chart.map((n) => ({ beat: n.beat, lane: n.part as string, vel: n.vel })), spb, windows(this.opts.tempo < 0.95));
    this.graded.perfect = this.graded.good = this.graded.extra = 0;
    this.energy = 0.5;
    this.mode = 'count';
    this.modeT = this.t;
    this.refreshDisplay();
  }

  /** The machine's bed under the performance, and each fill judged as it closes. */
  private tickPerform(beat: number): void {
    const p = this.perf!;
    const m = this.machine!;
    const ahead = beat + TIMING.lookAheadS / this.clock.spb;
    const end = (this.song?.bars ?? 20) * 4;
    if (ahead > p.sched) {
      // the machine follows you: louder and fuller as you lock in; when you lose it the perc and keys drop out
      // until you're back. In a fill it steps right back so you're heard
      const thin = this.energy < 0.35 && ahead < p.holdFrom;
      for (let L = Math.max(0, Math.floor(p.sched / LOOP_BEATS)); L * LOOP_BEATS <= Math.min(ahead, end); L++)
        for (const part of m.parts) {
          if (p.live.has(part.key) || this.room.muted?.(part.surface)) continue;
          if (thin && (part.def.name.startsWith('PERC') || part.def.name.startsWith('KEYS'))) continue;
          for (const n of part.notes) {
            const at = L * LOOP_BEATS + n.beat;
            if (at <= p.sched || at > ahead || at >= end) continue;
            const inFill = p.fills.some(([a, z]) => at >= a && at < z);
            // the last bars: the whole machine back at full under you, lights down
            const level = inFill ? 0.22 : at >= p.holdFrom ? 0.95 : 0.25 + 0.6 * this.energy;
            this.stage.voice(n.key, this.clock.timeAt(at), (n.filled ? n.vel * 0.85 : n.vel) * level);
          }
        }
      p.sched = ahead;
    }
    // a fill just closed: was it a good one?
    const f = p.fills[p.fillsJudged];
    if (f && beat >= f[1]) {
      p.fillsJudged++;
      const r = fillScore(p.fillHits.filter((b) => b >= f[0] - 0.25 && b < f[1]));
      if (r.good) {
        p.goodFills++;
        p.big = f[1] + 4;
        this.energy = Math.min(1, this.energy + 0.15);
        if (this.stage.drop) this.stage.drop();
        else this.stage.flourish?.();
      }
      this.refreshDisplay();
    }
    // the display follows: Fill!, Big fill, Hold it
    const key = p.fills.some(([a, z]) => beat >= a && beat < z) ? 1 : beat < p.big ? 3 : beat >= p.holdFrom ? 2 : p.joins && beat >= 12 && beat < 16 ? 4 : 0;
    if (key !== this.perfShown) {
      this.perfShown = key;
      this.refreshDisplay();
    }
  }
  private perfShown = 0;

  private endPerform(): void {
    const p = this.perf!;
    const j = this.judge!;
    const s = j.summary();
    // three stars needs a good fill and a held groove, not only accuracy
    const hidden = j.notes.filter((n) => n.beat >= p.holdFrom);
    const held = hidden.length ? hidden.filter((n) => n.grade === 'perfect' || n.grade === 'good').length / hidden.length : 1;
    let stars = s.stars;
    if (stars === 3 && (p.goodFills < 1 || held < 0.6)) stars = 2;
    const tight = tightPercent(j.notes.filter((n) => n.grade === 'perfect' || n.grade === 'good').map((n) => n.offset));
    this.last = { ...s, stars };
    this.lastTight = tight;
    this.lastLean = lean(j.notes.filter((n) => n.grade === 'perfect' || n.grade === 'good').map((n) => n.offset));
    this.fromPerform = true;
    this.resultsStage = -1;
    this.carried = this.whoCarried(j.notes, p.live);
    this.learnOffset();
    const pr = this.progress;
    pr.stars[p.track.id] = Math.max(pr.stars[p.track.id] ?? 0, stars);
    if (stars === 3 && this.tempoAtStart >= 0.999) pr.gold[p.track.id] = true;
    const today = dayKey();
    if (!pr.days.includes(today)) pr.days.push(today);
    pr.introDone = true;
    this.newUnlocks = [];
    for (const u of ['tom', 'jam', 'swaps', 'loops'] as Unlock[]) if (!(pr.unlocks as string[]).includes(u)) {
      (pr.unlocks as string[]).push(u);
      this.newUnlocks.push(u);
    }
    this.stage.save(pr);
    this.stage.celebrate(stars);
    for (const u of this.newUnlocks) this.stage.unlock(u);
    // the machine plays two loops through at full, from the next downbeat (your bow)
    const now = this.clock.beatAt(this.t);
    const from = Math.ceil((now + 1) / LOOP_BEATS) * LOOP_BEATS;
    this.lap = { from, sched: from - 0.01, dropped: false };
    this.perf = null;
    this.mode = 'results';
    this.modeT = this.t;
    this.moteCount = 0;
    this.judge = null;
    this.refreshDisplay();
    this.display.stars = 0;
  }
  /** Tight %, last performance. */
  lastTight = -1;
  /** After a performance: the machine's two loops at full (from beat `from`). */
  private lap: { from: number; sched: number; dropped: boolean } | null = null;
  private tickLap(t: number): void {
    const l = this.lap;
    const m = this.machine;
    if (!l || !m) return;
    const beat = this.clock.beatAt(t);
    const end = l.from + 2 * LOOP_BEATS;
    if (!l.dropped && beat >= l.from) {
      l.dropped = true;
      this.stage.drop?.();
    }
    const ahead = Math.min(end, beat + TIMING.lookAheadS / this.clock.spb);
    if (ahead > l.sched) {
      for (let L = Math.floor(Math.max(l.from, l.sched) / LOOP_BEATS); L * LOOP_BEATS <= ahead; L++)
        for (const part of m.parts)
          for (const n of part.notes) {
            if (this.room.muted?.(part.surface)) break;
            const at = L * LOOP_BEATS + n.beat;
            if (at > l.sched && at <= ahead && at >= l.from && at < end) this.stage.voice(n.key, this.clock.timeAt(at), n.filled ? n.vel * 0.85 : n.vel);
          }
      l.sched = ahead;
    }
    if (beat >= end) this.lap = null;
  }
  /** Ahead of the beat (−1), behind it (+1) or on it (0), last performance. */
  private lastLean = 0;
  /** The results on screen came from performing your machine (▶ again plays it again). */
  private fromPerform = false;
  /** 0 counting up, 1 the score, 2 the thing that carried it, 3 what's new, 4 again / next. */
  private resultsStage = -1;
  /** A line about your own thing in the performance ("Your cup never missed"), or ''. */
  private carried = '';
  private whoCarried(notes: readonly { lane: string; grade: Grade | null }[], live: ReadonlySet<string>): string {
    let best = '';
    for (const key of live) {
      const surface = key.slice(0, key.indexOf(':'));
      if (surface === 'kit' || surface === 'keys') continue;
      let n = 0;
      let got = 0;
      for (const x of notes)
        if (x.lane.startsWith(surface + ':')) {
          n++;
          if (x.grade === 'perfect' || x.grade === 'good') got++;
        }
      if (n < 4) continue;
      const part = this.machine?.parts.find((p) => p.surface === surface)?.def.name.toLowerCase() ?? 'part';
      const word = this.room.wordFor?.(surface);
      const who = word ? `Your ${word}` : `The ${part}`;
      const share = got / n;
      best = share >= 1 ? `${who} never missed` : share >= 0.75 ? `${who} carried it` : share < 0.5 ? `${who} wants another go` : '';
      if (best) break;
    }
    return best;
  }

  /** A pad on a thing was hit: show its sound, with ◀ ▶ to change it. */
  focusPad(name: string, t: number): void {
    if (!name || this.mode !== 'discover') return;
    this.pad = { name, until: t + 6 };
    this.refreshDisplay();
  }

  /** A surface's instrument was found (its first hit). */
  discovered(family: Family, label: string, t: number): void {
    if (family === 'keys') return;
    this.lastFound = { family, label };
    if (!this.found.includes(family)) this.found.push(family);
    if (family === 'kit' && this.kitAt < 0) this.kitAt = t;
    this.refreshDisplay();
  }

  /** A surface's instrument changed (it turned out soft): the old family goes from the map if nothing else plays it. */
  rediscovered(from: Family, stillHas: boolean): void {
    if (!stillHas) {
      const i = this.found.indexOf(from);
      if (i >= 0) this.found.splice(i, 1);
    }
    this.refreshDisplay();
  }

  /** A module key was tapped. */
  key(k: ModuleKey): void {
    const twice = this.t - (this.lastTap[k] ?? -9) < 0.9;
    this.lastTap[k] = this.t;
    if (this.mode === 'results' && this.fromPerform && this.machine && (k === 'play' || k === 'next')) {
      const next = this.nextTrack();
      this.leaveResults();
      if (k === 'next' && next >= 0) this.beginBuild(next);
      else this.beginPerform();
      return;
    }
    if (this.mode === 'results') this.leaveResults();
    if (this.tuneOpen) {
      // ◀ ▶▶ choose, − + change, ▶ closes
      if (k === 'play') this.tuneOpen = false;
      else this.stage.tune(k);
      this.lastTap[k] = -9;
      this.refreshDisplay();
      return;
    }
    if (this.settingsOpen) {
      // each key switches the setting written over it; ▶ closes the page; ◀ twice opens tuning
      if (k === 'play') this.settingsOpen = false;
      else if (k === 'prev') {
        this.opts.tempo = this.opts.tempo < 0.95 ? 1 : 0.75;
        this.stage.tempo(this.opts.tempo);
        if (twice && this.opts.debug) {
          // the second tap undid the first; open the tuning page (device sessions only: ?debug=1)
          this.settingsOpen = false;
          this.tuneOpen = true;
          this.lastTap[k] = -9;
        }
        this.refreshDisplay();
        return;
      } else if (k === 'next') this.stage.setting('oneHand', true);
      else if (k === 'jam') this.stage.setting('contrast', true);
      else this.stage.setting('words', true);
      this.lastTap[k] = -9;
      this.refreshDisplay();
      return;
    }
    if (this.mode === 'build') {
      this.buildKey(k, twice);
      return;
    }
    // (not while a pad's sound is up: then ◀ ◀ is stepping through sounds)
    if (k === 'prev' && twice && this.mode !== 'play' && this.mode !== 'count' && this.mode !== 'jam' && this.t >= this.pad.until) {
      // tap ◀ twice: the settings page (and the first tap's step back is undone)
      if (this.mode === 'discover') this.selected = (this.selected + 1) % this.available();
      this.settingsOpen = true;
      this.lastTap[k] = -9;
      this.refreshDisplay();
      return;
    }
    // a pad was just hit: ◀ ▶ step its sound through the bank
    if ((k === 'prev' || k === 'next') && this.mode === 'discover' && this.t < this.pad.until) {
      const name = this.stage.changeSound?.(k === 'next' ? 1 : -1);
      if (name) {
        this.focusPad(name, this.t);
        return;
      }
    }
    if (k === 'prev' || k === 'next') {
      if (this.mode === 'play' || this.mode === 'count') return;
      const n = this.available();
      this.selected = (this.selected + (k === 'next' ? 1 : n - 1)) % n;
      this.refreshDisplay();
      return;
    }
    if (k === 'play' && this.mode === 'discover') {
      const next = this.nextTrack();
      if (next >= 0 && (!this.machine || this.performed(this.machine.track.id))) this.beginBuild(next);
      else if (this.machine) this.beginPerform();
      else this.beginBuild(0);
      this.lastTap.play = -9;
      return;
    }
    if (k === 'play') {
      if (this.mode === 'play' || this.mode === 'count') {
        // stopping a song takes two taps (a stray hit never ends it)
        if (twice) this.stop();
        else {
          this.stopAsked = this.t;
          this.display.sub = 'Tap ▶ again to stop';
        }
      } else {
        if (this.mode === 'jam') this.endJam();
        this.begin(this.selected);
        this.lastTap.play = -9;
      }
      return;
    }
    if (k === 'loop') {
      if (this.mode === 'play' || this.mode === 'count' || this.mode === 'jam') return;
      if (!(this.progress.unlocks as string[]).includes('loops')) {
        this.display.sub = 'Perform a track first';
        return;
      }
      if (twice) {
        this.recPending = -1;
        this.looper.clear();
        this.lastTap[k] = -9;
        this.refreshDisplay();
        this.display.sub = 'Loops cleared';
        return;
      }
      if (this.looper.state === 'off') this.startTake();
      else this.recPending = this.t; // a layer, unless a second tap clears them
      return;
    }
    if (k === 'jam') {
      if (this.mode === 'jam') this.endJam();
      else if (!(this.progress.unlocks as string[]).includes('jam')) this.display.sub = 'Perform a track first';
      else if (this.mode !== 'play' && this.mode !== 'count') this.beginJam();
    }
  }

  // ---------------------------------------------------------------- jam

  /** A REC tap while looping waits this long for a second tap (which clears) before laying a layer. */
  private recPending = -1;

  private startTake(): void {
    if (this.looper.state === 'off') this.loopClock.set(this.t + 0.15, secPerBeat(96, this.opts.tempo));
    this.looper.rec(this.loopClock.beatAt(this.t));
    // a bar of count before a take
    const from = this.looper.recStart - 4;
    for (let i = 0; i < 4; i++) this.stage.band({ beat: from + i, voice: 'shaker', midi: 0, len: 0.2, vel: i ? 0.6 : 0.9 }, this.loopClock.timeAt(from + i), this.loopClock.spb);
    this.refreshDisplay();
  }

  readonly looper = new Looper();
  readonly loopClock = new SongClock();
  private onLoop = (key: string, atBeat: number, gain: number): void => this.stage.voice(key, this.loopClock.timeAt(atBeat), gain);

  /** The bandmate in a jam (null outside one), the surface it claimed, and the jam's cycle. */
  mate: Bandmate | null = null;
  jamSurface = '';
  private jamZones = 0;
  private jamCycle = 0;
  private jamCalls: { beat: number; degree: number; vel: number }[] = [];
  private jamAnswer: { beat: number; degree: number; hit: boolean; key: string }[] = [];
  /** The cycle whose call has been decided, and a count-in owed to the next call. */
  private jamDecided = -1;
  private jamCountIn = false;
  private jamPhase: 'listen' | 'turn' = 'listen';
  /** Answers scored (debug/E2E): the share of each. */
  readonly jamShares: number[] = [];

  /** JAM: the bandmate claims your most melodic instrument and trades two-bar phrases with you. */
  beginJam(): void {
    this.looper.clear();
    const order: Family[] = ['marimba', 'glock', 'tongue', 'bowl', 'bell'];
    const inst = this.room.instruments();
    const pick = order.map((f) => inst.find((i) => i.family === f)).find(Boolean);
    this.jamSurface = pick ? pick.id : 'keys';
    this.jamZones = pick ? pick.zones : this.room.zones('keys');
    this.mate = new Bandmate();
    this.mate.level = Math.min(3, this.progress.bandLevel ?? 0);
    this.jamCycle = 0;
    this.jamCalls = [];
    this.jamAnswer = [];
    this.jamShares.length = 0;
    this.jamPhase = 'listen';
    this.jamDecided = -1;
    this.jamCountIn = false;
    const spb = secPerBeat(96, this.opts.tempo);
    this.clock.set(this.t + 0.4 + 4 * spb, spb);
    this.stage.retune(9);
    this.bedCursor = new EventCursor(bed({ roots: [57, 53, 60, 55], minor: [0], bass: 'x..x5...', chord: 'hold', shaker: true }, 4 * 8));
    this.bedCursor.seek(-4);
    this.mode = 'jam';
    this.modeT = this.t;
    this.stage.bandmate('claim', this.jamSurface);
    this.refreshDisplay();
  }

  endJam(): void {
    if (this.mode !== 'jam') return;
    this.progress.bandLevel = this.mate?.level ?? 0;
    this.stage.save(this.progress);
    this.stage.bandmate('leave', this.jamSurface);
    this.mate = null;
    this.bedCursor = null;
    this.moteCount = 0;
    this.mode = 'discover';
    this.stage.retune(0);
    this.refreshDisplay();
  }

  private jamKey(degree: number): string {
    return `${this.jamSurface}:${this.jamZones > 1 ? this.room.zoneFor(this.jamSurface, degree) : 0}`;
  }

  private tickJam(t: number): void {
    const beat = this.clock.beatAt(t);
    const spb = this.clock.spb;
    this.bedCursor?.pull(beat + TIMING.lookAheadS / spb, this.onBed);
    const cycleStart = this.jamCycle * 16;
    // just before each cycle: decide its call (an echo of your last answer once, else a call by level)
    if (this.jamDecided !== this.jamCycle && beat >= cycleStart - 0.5 && this.jamCycle < 8) {
      this.jamDecided = this.jamCycle;
      const mate = this.mate!;
      const bar = this.jamCycle * 4;
      const echo = this.jamCycle >= 2 ? mate.echo(cycleStart - 8, cycleStart, bar) : null;
      const call = echo ?? mate.call(bar);
      this.jamCalls = call.map((n) => ({ beat: n.beat, degree: n.degree, vel: n.vel }));
      for (const n of this.jamCalls) this.stage.voice(this.jamKey(n.degree), this.clock.timeAt(n.beat), n.vel * 0.85, true);
      this.jamAnswer = this.jamCalls.map((n) => ({ beat: n.beat + 8, degree: n.degree, hit: false, key: this.jamKey(n.degree) }));
      // you'd gone quiet: a soft count-in under the call brings you back
      if (this.jamCountIn) for (let i = 0; i < 4; i++) this.stage.band({ beat: cycleStart + i, voice: 'shaker', midi: 0, len: 0.2, vel: 0.9 }, this.clock.timeAt(cycleStart + i), spb);
      this.jamCountIn = false;
      this.jamPhase = 'listen';
      this.refreshDisplay();
    }
    if (this.jamPhase === 'listen' && beat >= cycleStart + 8 - 0.5 && this.jamDecided === this.jamCycle) {
      this.jamPhase = 'turn';
      // the handover: a run of light across its bars toward you, as it leaves the space for your answer
      this.stage.bandmate('turn', this.jamSurface);
      this.refreshDisplay();
    }
    // your turn: the notes to answer light a beat ahead and fly from the module
    let k = 0;
    if (this.jamPhase === 'turn') {
      for (const n of this.jamAnswer) {
        const d = n.beat - beat;
        if (d > TIMING.travelBeats || d < -0.6 || k >= MAX_MOTES) continue;
        if (!n.hit && d <= TIMING.glowBeats && d > -0.3) this.stage.light(n.key, 1 - Math.max(0, d) / TIMING.glowBeats);
        const m = this.motes[k++];
        m.key = n.key;
        m.ahead = d;
        m.grade = n.hit ? 'perfect' : null;
      }
    }
    this.moteCount = k;
    // the answer is over (its last note's window has passed, before the next downbeat): how did it go?
    if (this.jamDecided === this.jamCycle && beat >= cycleStart + 15.75) {
      const share = this.jamAnswer.length ? this.jamAnswer.filter((n) => n.hit).length / this.jamAnswer.length : 0;
      const mate = this.mate!;
      this.jamCountIn = mate.idle(beat);
      mate.report(share);
      this.jamShares.push(share);
      this.stage.bandmate(share >= 0.7 ? 'happy' : 'simpler', this.jamSurface);
      this.jamCycle++;
      if (this.jamCycle >= 8) {
        // the jam ends together: its goodbye, then the whole room's last chord
        this.stage.bandmate('leave', this.jamSurface);
        const avg = this.jamShares.reduce((a, b) => a + b, 0) / Math.max(1, this.jamShares.length);
        this.stage.celebrate(avg >= 0.9 ? 3 : avg >= 0.6 ? 2 : 1);
        this.endJam();
      } else this.refreshDisplay();
    }
  }

  /** A hit during a jam: any note on its instrument close to an answer note counts (the rhythm is the answer). */
  private hitJam(key: string, t: number, gain: number): Grade | 'extra' | null {
    const mate = this.mate!;
    const beat = this.clock.beatAt(t - this.opts.offset);
    const onIt = key.startsWith(this.jamSurface + ':');
    const zone = onIt ? Number(key.slice(this.jamSurface.length + 1)) : -1;
    mate.hear({ beat, degree: zone >= 0 ? this.room.degreeOf(this.jamSurface, zone) : -1, vel: gain });
    if (this.jamPhase !== 'turn' || !onIt) return 'extra';
    const win = windows(this.opts.tempo < 0.95).good * 1.4;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < this.jamAnswer.length; i++) {
      const n = this.jamAnswer[i];
      if (n.hit) continue;
      const d = Math.abs(beat - n.beat) * this.clock.spb;
      if (d <= win && d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0) return 'extra';
    this.jamAnswer[best].hit = true;
    return bestD <= windows(false).perfect ? 'perfect' : 'good';
  }

  /** Start song `i`, cast onto the room as it is now. */
  begin(i: number): void {
    const song = this.songAt(i);
    if (!song) return;
    this.perf = null;
    this.perfShown = 0;
    this.lastTight = -1;
    this.looper.clear();
    this.song = song;
    this.selected = i;
    this.offered = true;
    this.cast = cast(song.parts, this.room.instruments());
    const casted = new Set(Object.values(this.cast).map((c) => c?.surface));
    this.accompanists = (this.room.everything?.() ?? []).filter((r) => !casted.has(r.id));
    this.accompBar = -1;
    // a song that opens on its tune alone keeps that opening to itself
    this.opensAlone = !song.notes.some((n) => n.beat < 16 && n.degree < 0);
    this.played.length = 0;
    this.encore.length = 0;
    this.encoreAt = -1;
    this.stage.casting(this.cast);
    this.stage.retune(song.key);
    const chart = this.stage.setting('oneHand', false) ? oneHanded(song.notes) : song.notes;
    const notes: JudgeNote[] = chart.map((n) => ({ beat: n.beat, lane: noteKey(n, this.cast, (s, d) => this.room.zoneFor(s, d)), vel: n.vel }));
    const spb = secPerBeat(song.bpm, this.opts.tempo);
    this.tempoAtStart = this.opts.tempo;
    this.clock.set(this.t + 0.4 + 4 * spb, spb);
    this.bedCursor = new EventCursor(song.bed);
    this.bedCursor.seek(-4);
    this.judge = new NoteJudge(notes, spb, windows(this.opts.tempo < 0.95));
    this.graded.perfect = this.graded.good = this.graded.extra = 0;
    this.energy = 0.5;
    this.mode = 'count';
    this.modeT = this.t;
    this.refreshDisplay();
  }

  /** Stop the song now (no stars). */
  stop(): void {
    this.perf = null;
    this.perfShown = 0;
    this.stage.casting({});
    this.mode = 'discover';
    this.song = null;
    this.judge = null;
    this.bedCursor = null;
    this.moteCount = 0;
    this.stage.retune(0);
    this.refreshDisplay();
  }

  /** The player hit target `key` at game time `t`. */
  /** Your hits in this song (for the encore). */
  private played: { key: string; beat: number; gain: number }[] = [];
  private encore: { key: string; beat: number; gain: number }[] = [];
  private encoreAt = -1;
  private encoreNext = 0;

  hit(key: string, t: number, gain: number): Grade | 'extra' | null {
    // (playing along with the machine's replay just plays; once it's done and the choice is up, a hit moves on)
    if (this.mode === 'results' && t - this.modeT > 4 && !this.lap && this.resultsStage >= 4) this.leaveResults();
    if (this.mode === 'jam' && this.mate) return this.hitJam(key, t, gain);
    if (this.mode === 'build') return this.hitBuild(key, t, gain);
    if (this.mode === 'discover' && this.looper.recording) this.looper.hear(this.loopClock.beatAt(t - this.opts.offset), key, gain);
    if ((this.mode !== 'play' && this.mode !== 'count') || !this.judge) return null;
    if (this.perf) {
      const b = this.clock.beatAt(t - this.opts.offset);
      if (this.perf.fills.some(([a, z]) => b >= a - 0.25 && b < z)) {
        this.perf.fillHits.push(b);
        const off = Math.abs(b * 2 - Math.round(b * 2)) / 2;
        return off < 0.08 ? 'perfect' : 'good';
      }
    }
    const at = t - this.opts.offset - this.clock.start;
    const r = this.judge.hit(key, at);
    if (!r) {
      this.graded.extra++;
      return 'extra';
    }
    this.graded[r.grade === 'perfect' ? 'perfect' : 'good']++;
    this.offsets.push(r.offset);
    // what you played, kept for the encore (the beat as you played it, a little loose like a person)
    if (this.played.length < 400) this.played.push({ key, beat: this.clock.beatAt(t - this.opts.offset), gain });
    this.energy = Math.min(1, this.energy + (r.grade === 'perfect' ? 0.05 : 0.03));
    return r.grade;
  }

  tick(t: number): void {
    this.t = t;
    if (this.pad.until > 0 && t >= this.pad.until) {
      this.pad.until = -1;
      this.refreshDisplay();
    }
    // the tuning page's readouts follow the hits
    if (this.tuneOpen && t - this.tuneShownAt > 0.25) this.refreshDisplay();
    if (this.recPending > 0 && t - this.recPending > 0.9) {
      this.recPending = -1;
      if (this.mode === 'discover') this.startTake();
    }
    if (this.mode === 'discover' && this.looper.state !== 'off') {
      const b = this.loopClock.beatAt(t);
      const was = this.looper.state;
      const wasRec = this.looper.recording;
      this.looper.tick(b, b + TIMING.lookAheadS / this.loopClock.spb, this.onLoop);
      const count = this.looper.state === 'count' ? Math.max(1, Math.min(4, Math.ceil(this.looper.recStart - b))) : 0;
      if (was !== this.looper.state || wasRec !== this.looper.recording || count !== this.display.count) this.refreshDisplay();
    }
    if (this.mode === 'discover') {
      // the first song is offered once there are two instruments (or the table alone has had a while)
      if (!this.offered && ((this.room.things?.() ?? 0) >= 2 || (this.kitAt >= 0 && t - this.kitAt > 40) || (!this.room.things && this.found.length >= 2))) {
        this.offered = true;
        this.refreshDisplay();
      }
      return;
    }
    if (this.mode === 'jam') {
      this.tickJam(t);
      return;
    }
    if (this.mode === 'build') {
      this.tickBuild(t);
      return;
    }
    if (this.mode === 'results') {
      // the notes you played count up, the stars fill one at a time, and the score stays; then what's new, then
      // again / next. The results stay until you play on (or a while passes)
      const el = t - this.modeT;
      const c = this.fromPerform && this.carried ? 2.5 : 0;
      const stage = el < 1.3 ? 0 : el < 4 ? 1 : el < 4 + c ? 2 : el < 7 + c && this.newUnlocks.length ? 3 : 4;
      if (stage !== this.resultsStage) {
        this.resultsStage = stage;
        this.refreshDisplay();
      }
      this.display.stars = Math.min(this.last?.stars ?? 0, Math.floor(el / 0.45));
      if (stage === 0 && this.last) {
        const k = Math.min(1, el / 1.1);
        this.display.line = `${Math.round((this.last.perfect + this.last.good) * (1 - Math.pow(1 - k, 3)))} of ${this.last.total}`;
      }
      this.tickEncore(t);
      this.tickLap(t);
      if (el >= 20) this.leaveResults();
      return;
    }
    if (this.stopAsked > 0 && t - this.stopAsked > 1.2) {
      this.stopAsked = -1;
      this.refreshDisplay();
    }
    const song = this.song!;
    const beat = this.clock.beatAt(t);
    const spb = this.clock.spb;
    this.bedCursor?.pull(beat + TIMING.lookAheadS / spb, this.onBed);
    if (this.mode === 'count' && beat >= 0) {
      this.mode = 'play';
      this.refreshDisplay();
    } else if (this.mode === 'count' && Math.ceil(-beat) !== this.display.count) this.refreshDisplay();
    const j = this.judge!;
    j.sweep(t - this.opts.offset - this.clock.start, this.onMiss);
    let k = 0;
    for (const n of j.notes) {
      const d = n.beat - beat;
      if (d > TIMING.travelBeats + 0.01) break;
      if (d < -0.6) continue;
      // in the last bars the lights go dim (you keep it going) and nothing flies in
      const dim = !!this.perf && n.beat >= this.perf.holdFrom;
      if (n.grade === null && d <= TIMING.glowBeats && d > -0.3) this.stage.light(n.lane, (1 - Math.max(0, d) / TIMING.glowBeats) * (dim ? 0.22 : 1));
      if (dim) continue;
      if (k < MAX_MOTES) {
        const m = this.motes[k++];
        m.key = n.lane;
        m.ahead = d;
        m.grade = n.grade;
      }
    }
    this.moteCount = k;
    this.energy += (0.5 - this.energy) * 0.002;
    this.display.meter = this.energy;
    if (this.perf) this.tickPerform(beat);
    if (beat >= song.bars * 4 + 1) {
      if (this.perf) this.endPerform();
      else this.end();
    }
  }

  private leaveResults(): void {
    this.encoreAt = -1;
    this.lap = null;
    this.mode = 'discover';
    this.song = null;
    this.stage.retune(0);
    this.refreshDisplay();
  }

  private onBed = (e: BedEvent): void => {
    this.stage.band(e, this.clock.timeAt(e.beat), this.clock.spb);
    if (e.voice === 'chord' && this.song && this.mode !== 'jam' && e.beat >= 0) this.accompany(e);
  };

  /**
   * The rest of the orchestra: every instrument you found that has no part in this song plays along softly, lit as it
   * sounds. Pitched ones ring a tone of the chord every other bar; drums and gongs mark each four-bar phrase.
   */
  private accompanists: RoomInstrument[] = [];
  private accompBar = -1;
  private opensAlone = false;
  private accompany(e: BedEvent): void {
    const bar = Math.floor(e.beat / 4);
    if (bar === this.accompBar || !this.accompanists.length) return;
    this.accompBar = bar;
    const at = this.clock.timeAt(bar * 4);
    const third = e.minor ? 3 : 4;
    const pcs = [e.midi % 12, (e.midi + third) % 12, (e.midi + 7) % 12];
    const half = this.song ? Math.floor(this.song.bars / 2) : -1;
    this.accompanists.forEach((r, k) => {
      const melodic = FAMILIES[r.family].melodic;
      // pitched ones ring the chord quietly every other bar (not under a melody-alone opening)
      if (melodic && bar % 2 === 0 && !(bar < 4 && this.opensAlone)) {
        const z = this.room.chordZone?.(r.id, [pcs[k % 3], ...pcs]) ?? -1;
        if (z >= 0) this.stage.voice(`${r.id}:${z}`, at + k * 0.015, 0.22);
      } else if (!melodic && bar === half) this.stage.voice(`${r.id}:0`, at, 0.25);
      // drums and gongs keep themselves for the last chord (the whole room plays that)
    });
  }
  private onMiss = (n: { lane: string }): void => {
    this.energy = Math.max(0.15, this.energy - 0.05);
    this.stage.missed(n.lane);
  };

  private end(): void {
    const song = this.song!;
    const s = (this.last = this.judge!.summary());
    const p = this.progress;
    const i = SONGS.indexOf(song);
    const first = !(song.id in p.stars);
    this.stage.casting({});
    p.stars[song.id] = Math.max(p.stars[song.id] ?? 0, s.stars);
    if (s.stars === 3 && this.tempoAtStart >= 0.999) p.gold[song.id] = true;
    const today = dayKey();
    if (!p.days.includes(today)) p.days.push(today);
    if (i + 1 > p.next) p.next = Math.min(SONGS.length - 1, i + 1);
    p.introDone = true;
    // unlocks are granted (and saved) now, not after the results: closing the page can't lose them
    this.newUnlocks = [];
    if (first) for (const u of UNLOCK_AFTER[song.id] ?? []) if (!(p.unlocks as string[]).includes(u)) {
      (p.unlocks as string[]).push(u);
      this.newUnlocks.push(u);
    }
    this.learnOffset();
    this.fromPerform = false;
    this.resultsStage = -1;
    this.stage.save(p);
    this.stage.celebrate(s.stars);
    this.startEncore(s.stars, song);
    for (const u of this.newUnlocks) this.stage.unlock(u);
    this.mode = 'results';
    this.modeT = this.t;
    this.moteCount = 0;
    this.judge = null;
    this.weakRuns = s.stars <= 1 ? this.weakRuns + 1 : 0;
    this.selected = i >= 0 ? Math.min(this.available() - 1, i + 1) : this.selected;
    this.refreshDisplay();
    this.display.stars = 0;
  }

  /**
   * The encore: after a song with two stars or more, your room plays your last four bars back to you, the way you
   * played them, on the instruments you hit, lit as they sound. Stops the moment you do anything.
   */
  private startEncore(stars: number, song: Song): void {
    this.encore.length = 0;
    this.encoreAt = -1;
    if (stars < 2 || !this.played.length) return;
    const from = (song.bars - 4) * 4;
    for (const p of this.played) if (p.beat >= from - 0.25) this.encore.push({ key: p.key, beat: p.beat - from, gain: p.gain });
    if (this.encore.length < 4) {
      this.encore.length = 0;
      return;
    }
    // it starts after the stars have landed, at the song's tempo
    this.encoreAt = this.t + 2.4;
    this.encoreNext = 0;
  }
  private tickEncore(t: number): void {
    if (this.encoreAt < 0) return;
    const spb = this.clock.spb;
    // schedule a little ahead, like the band
    while (this.encoreNext < this.encore.length) {
      const n = this.encore[this.encoreNext];
      const when = this.encoreAt + n.beat * spb;
      if (when > t + TIMING.lookAheadS) break;
      if (when >= t - 0.05) this.stage.voice(n.key, when, Math.max(0.25, n.gain * 0.85));
      this.encoreNext++;
    }
    if (this.encoreNext >= this.encore.length) this.encoreAt = -1;
  }

  private learnOffset(): void {
    if (this.offsets.length < 8) return;
    const o = this.offsets.slice().sort((a, b) => a - b);
    const med = o[Math.floor(o.length / 2)];
    this.opts.offset = Math.max(-0.15, Math.min(0.15, this.opts.offset + med * 0.5));
    this.offsets.length = 0;
  }

  /** The module's display for the current state (≤ 6 words a line). */
  refreshDisplay(): void {
    const d = this.display;
    d.found = this.found.slice();
    d.total = Math.max(this.roomTotal, this.found.length);
    d.stars = -1;
    d.meter = -1;
    d.pulse = null;
    const sel = this.songAt(this.selected);
    d.count = 0;
    d.day = this.progress.days.length;
    d.gold = !!this.progress.gold[sel.id];
    d.code = this.code;
    d.keyLabels = null;
    const un = this.progress.unlocks as string[];
    d.locked = un.includes('jam') ? (un.includes('loops') ? NO_KEYS : LOOP_LOCKED) : un.includes('loops') ? JAM_LOCKED : BOTH_LOCKED;
    if (this.tuneOpen) {
      const p = this.stage.tune(null);
      d.line = p.line;
      d.sub = p.sub;
      d.keyLabels = p.labels;
      d.pulse = 'play';
      this.tuneShownAt = this.t;
      return;
    }
    if (this.settingsOpen) {
      const on = (b: boolean) => (b ? 'on' : 'off');
      d.line = 'Settings';
      d.sub = this.opts.debug ? 'Tune hits: tap ◀ twice' : '';
      d.keyLabels = [`Slow\n${on(this.opts.tempo < 0.95)}`, 'Done', `One hand\n${on(this.stage.setting('oneHand', false))}`, `Contrast\n${on(this.stage.setting('contrast', false))}`, `Words\n${on(this.stage.setting('words', false))}`];
      d.pulse = 'play';
      return;
    }
    if (this.mode === 'discover' && this.looper.state !== 'off') {
      const l = this.looper;
      const b = this.loopClock.beatAt(this.t);
      d.line = l.layers.length ? `Loop · ${l.layers.length} layer${l.layers.length === 1 ? '' : 's'}` : 'Loop';
      if (l.state === 'count') d.count = Math.max(1, Math.min(4, Math.ceil(l.recStart - b)));
      d.sub = l.recording ? `Recording layer ${l.layers.length + 1}` : 'REC to add, twice to clear';
      d.pulse = 'loop';
      return;
    }
    if (this.mode === 'discover' && this.t < this.pad.until) {
      d.line = this.pad.name;
      d.sub = 'Arrows change the sound';
      d.keyLabels = null;
      return;
    }
    if (this.mode === 'build' && this.bld) {
      this.buildDisplay(d);
      return;
    }
    const nextT = this.nextTrack();
    if (this.mode === 'discover' && this.offered && nextT >= 0 && this.machine && this.performed(this.machine.track.id)) {
      d.line = `Build ${TRACKS[nextT].name}?`;
      d.sub = `${TRACKS[nextT].parts.length} parts · Tap ▶`;
      d.pulse = 'play';
      return;
    }
    if (this.mode === 'discover' && this.offered && this.machine) {
      d.line = this.machine.track.name;
      const gate = this.gate();
      d.sub = gate > 0 && this.performed(this.machine.track.id) ? `Find ${gate} more thing${gate === 1 ? '' : 's'}` : 'Your track. Perform? ▶';
      d.pulse = 'play';
      d.stars = this.progress.stars[this.machine.track.id] ?? 0;
      return;
    }
    if (this.mode === 'discover' && this.offered) {
      d.line = 'Build a track?';
      d.sub = this.lastFound && this.found.length < 2 ? found(this.lastFound) : 'Tap ▶';
      d.pulse = 'play';
      return;
    }
    switch (this.mode) {
      case 'discover':
        if (!this.offered) {
          d.line = 'Hit something';
          d.sub = this.lastFound ? found(this.lastFound) : 'The desk, a mug, anything';
        } else {
          d.line = sel.name;
          const need = wants(sel.parts);
          const have = this.found.filter((f) => f !== 'kit').length;
          const jamNew = un.includes('jam') && !this.jammed;
          d.sub = this.lastFound && this.found.length < 2
            ? found(this.lastFound)
            : jamNew
              ? 'Tap JAM'
              : this.weakRuns >= 2 && this.opts.tempo > 0.95
                ? 'Slower? Tap ◀ twice'
                : have < need
                  ? 'Tap ▶ to play'
                  : 'Tap ▶ to play';
          d.pulse = jamNew ? 'jam' : 'play';
          d.stars = this.progress.stars[sel.id] ?? 0;
        }
        break;
      case 'count':
        if (this.perf) {
          d.line = this.song!.name;
          d.sub = 'Hit what lights up';
          d.count = Math.max(1, Math.min(4, Math.ceil(-this.clock.beatAt(this.t))));
          break;
        }
        d.line = this.song!.name;
        d.sub = this.song!.id in this.progress.stars ? `${Math.round(this.song!.bpm * this.opts.tempo)} bpm` : 'Hit what lights up';
        d.count = Math.max(1, Math.min(4, Math.ceil(-this.clock.beatAt(this.t))));
        break;
      case 'play':
        if (this.perf) {
          const b = this.clock.beatAt(this.t);
          const inFill = this.perf.fills.some(([a, z]) => b >= a && b < z);
          const big = b < this.perf.big;
          const joins = !!this.perf.joins && b >= 12 && b < 16;
          d.line = inFill ? 'Fill!' : big ? 'Big fill' : b >= this.perf.holdFrom ? 'Keep it going' : this.song!.name;
          d.sub = inFill ? 'Anything counts' : big ? 'Back in' : b >= this.perf.holdFrom ? 'Lights down' : joins ? `${this.perf.joins} comes in next` : `${Math.round(this.song!.bpm * this.opts.tempo)} bpm`;
          d.meter = this.energy;
          break;
        }
        d.line = this.song!.name;
        d.sub = this.song!.id in this.progress.stars ? `${Math.round(this.song!.bpm * this.opts.tempo)} bpm` : 'Hit what lights up';
        d.meter = this.energy;
        break;
      case 'jam':
        d.line = 'Jam';
        d.sub = this.jamPhase === 'turn' ? 'Your turn' : this.jamCycle === 0 ? (this.code ? "Friend's phone: or-6.github.io/thump" : 'Listen') : 'Listen';
        d.pulse = 'jam';
        d.meter = this.jamShares.length ? this.jamShares[this.jamShares.length - 1] : -1;
        break;
      case 'results': {
        const s = this.last!;
        const st = this.resultsStage;
        d.line = `${s.perfect + s.good} of ${s.total}`;
        d.stars = s.stars;
        // how it felt in time: a number when it was close, a word that says which way when it wasn't
        const feel = this.lastTight >= 70 ? `Tight ${this.lastTight}%` : this.lastLean < 0 ? 'A bit ahead of the beat' : this.lastLean > 0 ? 'A bit behind the beat' : 'Loose';
        const fresh = this.newUnlocks.length > 1 ? (this.newUnlocks.includes('jam') ? 'New: JAM and REC' : unlockLine(this.newUnlocks[this.newUnlocks.length - 1])) : this.newUnlocks.length ? unlockLine(this.newUnlocks[0]) : '';
        const next = this.fromPerform && this.nextTrack() >= 0 && !this.built(TRACKS[this.nextTrack()].id);
        if (st <= 1) d.sub = this.fromPerform && this.lastTight >= 0 ? feel : s.stars < 3 ? 'Again? Tap ▶' : `${s.perfect + s.good} of ${s.total}`;
        else if (st === 2 && this.fromPerform && this.carried) d.sub = this.carried;
        else if (st <= 3 && fresh) d.sub = fresh;
        else d.sub = this.fromPerform ? (next ? 'Again ▶   Next track >' : 'Again? Tap ▶') : 'Again? Tap ▶';
        if (st <= 2 && this.fromPerform) d.pulse = null;
        else d.pulse = next && st >= 4 ? 'next' : 'play';
        break;
      }
    }
  }

  /** Notes due between game times a and b (the autoplayer, for tests and filming only). */
  dueBetween(a: number, b: number, fn: (key: string) => void): void {
    if (this.mode === 'build') {
      const bl = this.bld;
      if (!bl || (bl.phase !== 'count' && bl.phase !== 'rec') || !bl.target) return;
      for (const s of steps(bl.track.parts[bl.part].pattern)) {
        const due = this.clock.timeAt(bl.recStart + ((s.beat - (bl.recStart % LOOP_BEATS) + LOOP_BEATS) % LOOP_BEATS)) + this.opts.offset;
        if (due > a && due <= b) fn(this.keyFor(bl.target.surface, bl.target.key, s));
      }
      return;
    }
    if (this.mode === 'jam') {
      if (this.jamPhase !== 'turn') return;
      for (const n of this.jamAnswer) {
        const due = this.clock.timeAt(n.beat) + this.opts.offset;
        if (!n.hit && due > a && due <= b) fn(n.key);
      }
      return;
    }
    if (!this.judge) return;
    // (performing: the autoplayer fills on the eighths when a fill window is open)
    if (this.perf) {
      const live = [...this.perf.live];
      for (const [fa, fz] of this.perf.fills)
        for (let x = fa; x < fz; x += 0.5) {
          const due = this.clock.timeAt(x) + this.opts.offset;
          if (due > a && due <= b) fn(live[Math.round(x * 2) % live.length]);
        }
    }
    for (const n of this.judge.notes) {
      if (n.grade !== null) continue;
      const due = n.t + this.clock.start + this.opts.offset;
      if (due > a && due <= b) fn(n.lane);
    }
  }

  /** Back from a pause (headset off and on): the song waits, then two clicks bring it back. */
  resumed(t: number): void {
    this.t = t;
    if (this.mode !== 'play' && this.mode !== 'count') return;
    const spb = this.clock.spb;
    this.clock.delay(2 * spb);
    const beat = this.clock.beatAt(t);
    this.stage.band({ beat, voice: 'shaker', midi: 0, len: 0.2, vel: 0.9 }, t + 0.05, spb);
    this.stage.band({ beat: beat + 1, voice: 'shaker', midi: 0, len: 0.2, vel: 0.9 }, t + 0.05 + spb, spb);
  }

  /** Mode and seconds in it (debug). */
  get since(): number {
    return this.t - this.modeT;
  }
}

function found(f: { family: Family; label: string }): string {
  // "Door: marimba"; something found by touch is just what it plays
  return f.label && f.label !== 'that' && f.label !== 'your lap' ? `${cap(f.label)}: ${FAMILIES[f.family].name}` : cap(FAMILIES[f.family].name);
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** A fill: how many of its sixteen eighths you hit, and how many of your hits were on the grid. Good: six or more, mostly on it. */
export function fillScore(beats: readonly number[]): { slots: number; onGrid: number; good: boolean } {
  const slots = new Set(beats.map((b) => Math.round(b * 2))).size;
  const on = beats.filter((b) => Math.abs(b * 2 - Math.round(b * 2)) < 0.25).length;
  const onGrid = beats.length ? on / beats.length : 0;
  return { slots, onGrid, good: slots >= 6 && onGrid >= 0.6 };
}

/** Which way you leaned against the beat (offsets in seconds, + late): −1 ahead, +1 behind, 0 on it (within 25 ms). */
export function lean(offsets: readonly number[]): number {
  if (!offsets.length) return 0;
  const o = offsets.slice().sort((a, b) => a - b);
  const med = o[Math.floor(o.length / 2)];
  return med < -0.025 ? -1 : med > 0.025 ? 1 : 0;
}

/** Tight %: 100 minus the median timing error in milliseconds (offsets in seconds), never below 0. */
export function tightPercent(offsets: readonly number[]): number {
  if (!offsets.length) return 0;
  const a = offsets.map((o) => Math.abs(o) * 1000).sort((x, y) => x - y);
  const med = a[Math.floor(a.length / 2)];
  return Math.max(0, Math.round(100 - med));
}

/** Things that ring (a hat on them sounds right) and things that knock (a snare). */
const RINGS = new Set<string>(['bell', 'tubular', 'glock', 'triangle', 'ride', 'cowbell', 'bowl', 'tongue']);
const KNOCKS = new Set<string>(['block', 'clave', 'slit', 'cajon', 'frame', 'congas', 'snare']);

/** What the module asks for each part. */
const ASK: Record<string, string> = {
  KICK: 'Hit what plays the kick',
  SNARE: 'Hit what plays the snare',
  HAT: 'Hit what plays the hat',
  PERC: 'Anything new: a cup, a book',
  KEYS: 'Hit what plays the keys',
  BASS: 'Low keys, or anything',
  'PERC 2': 'Hit something else for perc',
  CLAP: 'Clap, or hit what claps',
  'KEYS 2': 'Hit what plays the high keys',
};

const NO_KEYS: ModuleKey[] = [];
const LOOP_LOCKED: ModuleKey[] = ['loop'];
const JAM_LOCKED: ModuleKey[] = ['jam'];
const BOTH_LOCKED: ModuleKey[] = ['jam', 'loop'];

function unlockLine(u: Unlock): string {
  return u === 'tom' ? 'New: a tom on the desk' : u === 'loops' ? 'New: REC loops what you play' : u === 'swaps' ? 'New: pinch and hold to change' : 'New: JAM with a bandmate';
}
