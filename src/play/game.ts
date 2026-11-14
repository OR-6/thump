/**
 * The game (DESIGN.md §2, §3.5–3.7): Discover is where you start and free play is always on (anything you
 * hit plays its instrument); songs are chosen on the module and cast onto your room's instruments;
 * results give stars and unlocks, then it's back to playing your room.
 *
 * Time is the game clock (seconds; the audio clock while audio runs). The game talks to the world only
 * through `GameStage` and `Room`, so unit tests drive it with fakes and a bot.
 */
import { TIMING } from '../config.js';
import { PIANO_CHORD, PIANO_LOW } from '../kit/shelf.js';
import { oneHanded, secPerBeat, type BedEvent, type Note, type Song, bed as chordBed } from '../songs/chart.js';
import { EventCursor, SongClock } from '../songs/sequencer.js';
import { NoteJudge, windows, type Grade, type JudgeNote, type Summary } from '../songs/judge.js';
import { SONGS, dailySong } from '../songs/songs.js';
import { cast, noteKey, wants, type Cast, type RoomInstrument } from '../songs/cast.js';
import { bed } from '../songs/chart.js';
import { Bandmate } from '../bandmate/bandmate.js';
import { Looper } from './looper.js';
import { beatKey, chordAt, chordMidi, finalKeys, scoreBed, scoreChart, scoreParts } from '../songs/score.js';
import { LOOP_BEATS, SONG_TRACKS, TRACKS, assign, dailyTrack, songDay, ownBar, played, quantise, steps, type MachineNote, type PartDef, type RawHit, type Step, type TrackDef } from './build.js';
import { FAMILIES, type Family } from '../room/classify.js';
import { dayKey, type Progress } from '../persistence/progress.js';
import type { Display, ModuleKey } from '../ui/module.js';
import { buildPage, type PageId } from '../ui/menu.js';

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
  /** Star `i` (0-based) of `of` just landed on the results. */
  starLanded?(i: number, of: number): void;
  /** Re-pitch the room's melodic instruments into a key (pitch class), in its minor or major. */
  retune(keyPc: number, minor?: boolean): void;
  save(p: Progress): void;
  /** Lights down (a solo) or back up. */
  lightsDown?(on: boolean): void;
  /** Something new: the tom slides onto the table, JAM lights up… */
  unlock(u: Unlock): void;
  /** The bandmate plays target `key` at game time `at` (sound and light on its instrument). */
  /** A count-in click (beat −4..−1): played as the band's drummer's sticks from their seat. False: not handled. */
  countIn?(beat: number, at: number, vel: number): boolean;
  /** (`you`: one of your own notes played back, which flashes gold.) */
  voice(key: string, at: number, vel: number, mate?: boolean, you?: boolean): void;
  /** A song was cast (which instruments it uses: the table keys brighten when they're in it). */
  casting(c: Cast): void;
  /** A note went by unplayed: its target dims for a moment. */
  missed(key: string): void;
  /** Slow mode switched in the headset (tempo 0.6–1), to be saved. */
  tempo(t: number): void;
  /** In-headset settings: read and switch (saved by the stage). */
  setting(name: 'oneHand' | 'contrast' | 'words' | 'band' | 'light', flip: boolean): boolean;
  /** Playing together: the link's state and how many are in the band. */
  bandState?(): { state: string; players: number; message?: string };
  /** Easy or Normal changed (saved). */
  saveLevel?(level: 'easy' | 'normal' | 'hard'): void;
  /** The bandmate: claims an instrument (by surface id), is pleased, or simplifies. */
  bandmate(event: 'claim' | 'happy' | 'simpler' | 'leave' | 'turn', surface?: string): void;
  /** A good fill: a light sweep over every ring on the desk (no sound: the fill was the sound). */
  flourish?(): void;
  /** Everything comes in at once (the machine dropping back in, a big fill landing): every thing rings and lights. */
  drop?(): void;
  /** The bar before a drop: a rising sweep, `seconds` long. */
  riser?(seconds: number): void;
  /** Tape on each thing in the machine saying which part it plays (keys of the parts, and their names). */
  labels?(parts: readonly { key: string; name: string }[]): void;
  /** ◀ ▶ on the pad last hit: the next sound in the bank on it; its name, or null when there's no pad. */
  changeSound?(dir: 1 | -1): string | null;
  /** The instrument shelf: step to the next instrument on the desk (0: just read). What's out, its scale and sound. */
  shelf?(dir: 1 | -1 | 0): ShelfView;
  /** Change the instrument's scale or sound; the new view. */
  shelfSet?(which: 'scale' | 'sound'): ShelfView;
  /** Put this instrument on the desk for a song or a build (null: back to the one chosen in free play). */
  useInstrument?(id: string | null): void;
  /**
   * Playing together: a song is about to start here. 'wait' when this headset is a guest (it has asked the band's
   * host, who starts it for everyone); otherwise it starts here.
   */
  bandSong?(i: number): 'local' | 'wait';
  /** A song started here (the host tells the band when beat 0 is). */
  songStarted?(i: number, beat0: number): void;
  /** Free play: the instrument on the desk, its key's root (MIDI, near C3) and the three chords of its scale. */
  freeHarmony?(): { inst: string; root: number; chords: readonly (readonly number[])[] };
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

/** What the shelf says about the instrument on the desk. */
export interface ShelfView {
  id: string;
  name: string;
  how: string;
  /** Plain names ('' when it has no choice). */
  scale: string;
  sound: string;
  /** Octaves up or down from its own register. */
  oct?: number;
  /** Its key's name ('C', 'D'...; '' for the drums), and the drums' pieces. */
  key?: string;
  pieces?: 'small' | 'full';
  frets?: 'easy' | 'real';
}

export interface MoteView {
  key: string;
  /** Beats until due (+) or since (−). */
  ahead: number;
  grade: Grade | null;
  /** Beats since you hit it (−1: not hit yet). */
  since?: number;
  /** In the no-lights bars: drawn faint (still there, so it doesn't look like the song stopped). */
  faint?: boolean;
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
  readonly display: Display = { line: 'Tap the desk', sub: 'Anywhere, with your hand', found: [], total: 0, meter: -1, stars: -1, pulse: null, count: 0, day: 0, gold: false, code: '', keyLabels: null, locked: [] };
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
    /** The last bar whose chord is scheduled (the chords come in with the first part that has notes). */
    chordAt: number;
    /** The instrument on the desk for it. */
    inst: string;
    /** The riser before the drop has started. */
    rose: boolean;
  } | null = null;

  /** The first track not built yet that the things you've found open, or −1. */
  nextTrack(): number {
    // the next one opens once you've performed the one before it
    for (let i = 0; i < TRACKS.length; i++) if (!this.built(TRACKS[i].id)) return i === 0 || this.performed(TRACKS[i - 1].id) ? i : -1;
    return -1;
  }

  /** Things still to find before the next track opens (0: none, or nothing left to open). */
  gate(): number {
    return 0;
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
    const out = parts.map((p) => ({ key: p.key, name: say(p.def.name) }));
    if (b?.target && (b.phase === 'count' || b.phase === 'rec')) out.push({ key: b.target.key, name: say(b.track.parts[b.part].name) });
    this.stage.labels(out);
  }

  /**
   * The harmony right now, for the shelf's instruments: inside a track its scale and the chord under this bar (a MIDI
   * root, minor or not); null in free play (the instrument's own notes).
   */
  harmony(at = this.t): { minor: boolean; chord: number; chordMinor: boolean; song: boolean; scale?: string } | null {
    // (a quarter beat early still counts as the next bar: beginners rush the 1)
    const beat = this.clock.beatAt(at) + 0.25;
    const track = this.bld?.track ?? this.perf?.track ?? (this.mode === 'results' && this.fromPerform ? this.machine?.track : null);
    if (!track) {
      // free play with the band along: the chord under this bar, in your instrument's own scale
      const g = this.groove;
      if (!g || this.mode !== 'discover') return null;
      const c = g.chords[GROOVE[Math.max(0, Math.floor(beat / 4)) % 4] % g.chords.length];
      return { minor: false, chord: g.root + c[0], chordMinor: c[1] - c[0] === 3, song: false };
    }
    if (track.score) {
      // a written-out song: its chord at this beat (in the replay after it, the chord of the bars replayed)
      const l = this.lap;
      const b = !this.perf && l ? l.base + ((((beat - l.from) % LOOP_BEATS) + LOOP_BEATS) % LOOP_BEATS) : beat;
      const c = chordAt(track.score, b);
      return { minor: !!track.minor, chord: chordMidi(c, track.key), chordMinor: c.minor, song: true, scale: track.score.scale };
    }
    const c = songChord(track, Math.max(0, Math.floor(beat / 4)), !!this.perf);
    return { minor: !!track.minor, chord: c.root, chordMinor: c.minor, song: true };
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
    const track = this.buildTracks[i];
    if (!track) return;
    this.looper.clear();
    if (this.mode === 'jam') this.endJam();
    this.mode = 'build';
    this.modeT = this.t;
    this.song = null;
    const spb = secPerBeat(track.bpm, this.opts.tempo);
    this.clock.set(this.t + 0.3, spb);
    this.stage.useInstrument?.('drums');
    this.groove = null;
    this.bld = { track, part: 0, phase: 'assign', target: null, moved: false, recStart: 0, hits: [], parts: [], sched: 0, clicked: -99, guard: -99, verdict: null, retried: false, pending: null, dropAt: -99, chordAt: -99, inst: 'drums', rose: false };
    this.stage.retune(track.key, track.minor);
    this.moteCount = 0;
    this.pushLabels();
    this.refreshDisplay();
  }

  /** Stop building or stop the machine; back to playing freely. */
  private endBuild(): void {
    this.bld = null;
    this.stage.useInstrument?.(null);
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
        this.display.sub = 'Tap Stop again to stop';
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
    // the tune on the piano's middle keys, the low notes on its left, the extra on the handpan
    if (name.startsWith('KEYS')) return 'piano:2';
    if (name === 'BASS') return 'piano:0';
    return 'handpan:1';
  }

  /** The key a pattern note plays on for a target (pitched parts: the zone with its degree). */
  private keyFor(surface: string, key: string, s: Step): string {
    if (s.degree < 0) return key;
    const z = this.room.zoneFor(surface, s.degree);
    // the bass on the piano plays its keys two octaves down (zone + PIANO_LOW)
    return `${surface}:${Math.max(0, z) + this.lowFor(surface)}`;
  }
  /** The piano's low octave right now (10 while the bass part is being built on it), else 0. */
  pianoLow(): number {
    return this.lowFor('piano');
  }
  /** The piano's low octave for the bass part being built (10), else 0. */
  private lowFor(surface: string): number {
    const b = this.bld;
    return b && surface === 'piano' && b.track.parts[b.part]?.name === 'BASS' ? PIANO_LOW : 0;
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
      // (the desk's bars and the shelf's instruments are keyboards: several parts share them happily)
      if (surface !== 'keys' && !(surface in INST_NAME) && b.parts.some((p) => p.key === key || (p.surface === surface && surface !== 'kit'))) {
        if (!b.pending || b.pending.key !== key || t - b.pending.t > 0.6) {
          b.pending = { key, t };
          return null;
        }
      }
      b.pending = null;
      const a = assign(def, key, (sfc) => this.room.zones(sfc));
      const lo = this.lowFor(a.surface);
      b.target = { surface: a.surface, key: lo ? `${a.surface}:${Number(a.key.slice(a.key.indexOf(':') + 1)) + lo}` : a.key };
      b.moved = a.moved;
      // recording starts on the next bar at least four beats away (the count-in); the take runs two bars from there
      b.recStart = Math.ceil((beat + 2) / 4) * 4;
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
      // where in the machine's two-bar loop this hit falls (the bass on the piano: its low octave)
      const phase = ((beat % LOOP_BEATS) + LOOP_BEATS) % LOOP_BEATS;
      const lo = this.lowFor(b.target.surface);
      b.hits.push({ beat: phase, key: lo ? `${b.target.surface}:${Number(key.slice(key.indexOf(':') + 1)) + lo}` : key, vel: gain });
      // a grade for the light: close to a pattern note is a perfect
      const st = steps(def.pattern, b.track.swing);
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
    // the chords under it, from the first part with notes on (a held chord a bar, the way a band's keys would)
    const tune = b.parts.some((p) => p.def.pitched !== 'no') || (b.phase !== 'assign' && b.track.parts[b.part]?.pitched !== 'no') || b.phase === 'run';
    const nb = Math.ceil(beat / 4 - 1e-6) * 4;
    if (tune && nb > b.chordAt && nb - beat < TIMING.lookAheadS / spb + 0.05 && !(nb >= b.dropAt - 4 && nb < b.dropAt)) {
      b.chordAt = nb;
      const i = (nb / 4) % b.track.chords.length;
      this.stage.band({ beat: nb, voice: 'chord', midi: b.track.chords[i], len: 4, vel: 0.32, minor: b.track.minorChords?.includes(i) }, this.clock.timeAt(nb), spb);
    }
    this.moteCount = 0;
    if (b.phase === 'run' && b.dropAt > 0) {
      const left = Math.ceil(b.dropAt - beat);
      if (beat >= b.dropAt - 4 && !b.rose) {
        b.rose = true;
        this.stage.riser?.((b.dropAt - beat) * spb);
      }
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
      // the part's instrument comes out, and the module's suggestion breathes on the beat (anything else works too)
      const want = beat >= b.guard ? (PART_INST[b.track.parts[b.part].name] ?? 'drums') : null;
      if (want && want !== b.inst) {
        b.inst = want;
        this.stage.useInstrument?.(want);
      }
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
      for (const s of steps(def.pattern, b.track.swing)) {
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
        const pat = steps(def.pattern, b.track.swing);
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
          notes = [...quantise(lit, b.hits.filter((h) => !inOwn(h.beat)), (s) => this.keyFor(target.surface, target.key, s)), ...ownBar(mine, loud, b.track.swing)];
          notes.sort((x, y) => (x.at ?? x.beat) - (y.at ?? y.beat));
        } else notes = quantise(pat, b.hits, (s) => this.keyFor(target.surface, target.key, s));
        const share = own ? Math.max(0.5, played(notes, pat.filter((s) => relOf(s.beat) < 4)) ) : played(notes, pat);
        // almost nothing played: once more, straight away (only once; then it goes in filled)
        if (share < 0.34 && !b.retried) {
          b.retried = true;
          b.recStart = Math.ceil((beat + 2) / 4) * 4;
          b.hits = [];
          b.clicked = Math.floor(beat);
          b.phase = 'count';
          this.refreshDisplay();
          return;
        }
        b.retried = false;
        b.parts.push({ def, surface: target.surface, key: target.key, notes });
        // (you copied the lit bar and left your own empty: it's in, filled from the pattern; not a score)
        const copied = !own && played(notes, pat.filter((s) => relOf(s.beat) < 4)) >= 0.75;
        b.verdict = { name: say(def.name), hit: own ? -1 : copied ? -2 : Math.round(share * pat.length), of: pat.length };
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
        d.sub = 'Everything, in…';
        return;
      }
      d.sub = b.dropAt > 0 ? `${n} parts in` : 'Your track: press Perform it';
      d.pulse = b.dropAt > 0 ? null : 'play';
      return;
    }
    d.line = `${b.part + 1}/${n}  ${say(def.name)}`;
    if (b.phase === 'assign') {
      if (b.verdict) {
        // what just went in, and what's next (hits pick nothing for this bar)
        const v = b.verdict;
        d.line = v.hit === -2 ? `${v.name}: in` : v.hit < 0 ? `${v.name}: yours` : v.hit >= v.of ? `${v.name}: every note` : `${v.name}: ${v.hit} of ${v.of}`;
        d.sub = `Next: ${say(def.name)}`;
        return;
      }
      d.sub = ASK[def.name];
      return;
    }
    if (b.phase === 'count') {
      d.count = Math.max(1, Math.min(8, Math.ceil(b.recStart - this.clock.beatAt(this.t))));
      d.sub = b.retried ? 'Once more' : b.moved ? 'This one goes on the keys' : 'Hit when it glows';
      d.line = say(def.name);
      return;
    }
    // the take's second bar: no lights, play what you like
    d.sub = this.clock.beatAt(this.t) >= b.recStart + 4 ? 'Your turn: play anything' : 'Hit when it glows';
  }

  // ---------------------------------------------------------------- perform

  /** The machine you built this session (its parts on your things). */
  private machine: { track: TrackDef; parts: { def: PartDef; surface: string; key: string; notes: MachineNote[] }[]; written?: boolean; len?: number } | null = null;
  private perf: {
    track: TrackDef;
    /** Parts you play live (the chart); the rest is the bed. */
    live: Set<string>;
    /** A written-out song: band parts you play some notes of, and those notes' beats (beatKey): just those are left out. */
    cover: Map<string, Set<number>> | null;
    /** The progress bar's second half; where the last hit lights (a written-out song's tonic), or null. */
    second: readonly [number, number];
    final: string[] | null;
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
    /** The instrument you're playing; the one ◀ ▶ asked for next and the beat it takes over; its unscored bar ends. */
    inst: string;
    queued: string | null;
    switchAt: number;
    graceTo: number;
  } | null = null;

  /**
   * What you play live on an instrument, between two beats: the notes (two at most at once) and the machine's parts
   * they take over (the rest stays in the bed). Drums: the kick, the snare and the part on a thing you found (from bar
   * 5). Piano: the tune and the low notes. Handpan: the extra, walked round its notes. Guitar: a strum on 1 and 3
   * of every bar (it follows the track's chords), over the whole machine.
   */
  private chartFor(inst: string, from: number, to: number, fills: readonly (readonly [number, number])[]): { notes: Note[]; live: Set<string>; found: string; cover?: Map<string, Set<number>> } {
    const m = this.machine!;
    if (m.track.score) {
      // a written-out song: your part of it, by instrument and level (src/songs/score.ts)
      const c = scoreChart(m.track.score, inst, this.level, from, to, fills, { tom: (this.progress.unlocks as string[]).includes('tom') });
      return { notes: c.notes.map((n) => ({ beat: n.beat, part: n.key as never, degree: -1, vel: n.vel })), live: new Set(c.live), found: '', cover: c.cover };
    }
    const notes: Note[] = [];
    const live = new Set<string>();
    const inFill = (b: number) => fills.some(([a, z]) => b >= a && b < z);
    const loops = Math.ceil(to / LOOP_BEATS);
    let foundName = '';
    if (inst === 'guitar') {
      // bars 1–8 a strum on every beat; then it moves: on Easy down, down, down-up (one up-strum, after the third),
      // on Normal down, down-up, up, down-up, and your other hand changes chord on the neck as the song does
      const VEL = [0.9, 0.6, 0.8, 0.6];
      const LATER = [0, 1, 1.5, 2.5, 3, 3.5];
      const EASY_LATER = [0, 2, 2.5, 3];
      const n = m.track.chords.length;
      for (let bar = Math.floor(from / 4); bar * 4 < to; bar++) {
        // (Hard: the moving rhythm and the chord changes from the start)
        const offs = bar < (this.level === 'hard' ? 0 : 8) ? [0, 1, 2, 3] : this.level === 'easy' ? EASY_LATER : LATER;
        for (const o of offs) {
          // (the up-strums sit where the song swings them)
          const b = bar * 4 + Math.floor(o) + (o % 1 ? (m.track.swing ?? 0.5) : 0);
          if (b < from || b >= to || inFill(b)) continue;
          notes.push({ beat: b, part: 'guitar:9' as never, degree: -1, vel: o % 1 ? 0.6 : VEL[o] ?? 0.7 });
        }
        // the chord change, on the neck (the pads are the song's chords in turn)
        const b = bar * 4;
        if (this.level !== 'easy' && bar >= (this.level === 'hard' ? 0 : 8) && n > 1 && b >= from && b < to && !inFill(b)) notes.push({ beat: b, part: `guitar:${b >= CHANGE[0] && b < CHANGE[1] ? (m.track.minor ? 1 + (bar % 2) : bar % 2 ? 1 : 2) : (bar % n) % 3}` as never, degree: -1, vel: 0.7 });
      }
      notes.sort((a, b) => a.beat - b.beat);
      return { notes, live, found: '' };
    }
    let parts: typeof m.parts = [];
    let found: (typeof m.parts)[number] | undefined;
    if (inst === 'drums') {
      // (never the clap: you can't clap and hit the snare on the same beat)
      found = m.parts.find((p) => p.surface !== 'kit' && p.surface !== 'keys' && PART_INST[p.def.name] === 'drums' && p.def.name !== 'KICK' && p.def.name !== 'SNARE' && p.def.name !== 'CLAP');
      // Normal: the hat too (two hands still: the third note at once goes back to the band)
      // (Easy: the hat joins after the first solo; Normal: from the start)
      parts = m.parts.filter((p) => p.def.name === 'KICK' || p.def.name === 'SNARE' || p === found || p.def.name === 'HAT');
      // Hard: the extra percussion too, on the tom (once you have it)
      if (this.level === 'hard' && (this.progress.unlocks as string[]).includes('tom')) parts.push(...m.parts.filter((p) => p.def.name === 'PERC'));
      if (found) foundName = say(found.def.name);
    } else if (inst === 'congas') {
      // the congas: the song's extra percussion (its PERC lines), and on Normal the hat's eighths too, as a tumbao
      // (Easy: a slap with the snare on 2 and 4 too; the band keeps its snare)
      parts = m.parts.filter((p) => p.def.name.startsWith('PERC') || (this.level !== 'easy' && p.def.name === 'HAT') || (this.level !== 'normal' && p.def.name === 'SNARE'));
    } else if (inst === 'handpan' && this.level !== 'normal') {
      // Easy handpan: the bass line on its notes (on the beat, the low middle mostly), not the off-beat extras
      // (Hard: the bass and the extra both)
      parts = m.parts.filter((p) => p.def.name === 'BASS' || (this.level === 'hard' && p.def.name.startsWith('PERC')));
    } else {
      parts = m.parts.filter((p) => PART_INST[p.def.name] === (inst === 'marimba' ? 'piano' : inst) && p.def.name !== 'BASS');
      // Easy: the main line only (the tune)
      if (this.level === 'easy' && parts.length > 1) parts = parts.slice(0, 1);
    }
    const rank = (key: string) => {
      // (the left hand's chord and the tom are extras: they're what goes when both hands are busy)
      if (key === `piano:${PIANO_CHORD}` || key === 'kit:tom') return 99;
      const i = parts.findIndex((p) => p.key === key);
      if (i >= 0) return i;
      const j = parts.findIndex((p) => p.surface !== 'kit' && key.startsWith(p.surface + ':'));
      return j >= 0 ? j : parts.length;
    };
    for (const p of parts) {
      if (!(inst === 'congas' && p.def.name === 'SNARE')) live.add(p.key);
      // the second half: a tune moves up two notes, whole (its shape kept), if the instrument has room above it
      let up = 0;
      if (p.def.name.startsWith('KEYS') && TOP[inst] !== undefined) {
        let top = -1;
        p.notes.forEach((n, k) => {
          const key = this.onInst(inst, n.key, k, p.def.name);
          top = Math.max(top, Number(key.slice(key.indexOf(':') + 1)));
        });
        up = Math.min(2, TOP[inst] - top);
      }
      for (let L = Math.floor(from / LOOP_BEATS); L < loops; L++)
        p.notes.forEach((n, k) => {
          // what you made (your own bar included), on the grid, on the bar or pad you played it on
          const beat = L * LOOP_BEATS + (n.at ?? n.beat);
          if (beat < from || beat >= to || inFill(beat)) return;
          // an arc: kick and snare first; your own thing joins at bar 5
          if (p === found && beat < 16) return;
          if (p.def.name === 'HAT' && this.level === 'easy' && beat < 32) return;
          // (the bass line was written for the home chords: in the change it's the band's)
          if (p.def.name === 'BASS' && beat >= CHANGE[0] && beat < CHANGE[1]) return;
          let part = inst === 'congas' ? congaAt(n.at ?? n.beat, m.track.id === 'night-shift') : inst === 'drums' && p.def.name === 'PERC' ? 'kit:tom' : this.onInst(inst, n.key, k, p.def.name);
          if (up > 0 && beat >= SECOND[0] && beat < SECOND[1]) part = lift(part, up);
          notes.push({ beat, part: part as never, degree: -1, vel: Math.max(0.6, n.vel) });
        });
    }
    // Hard on the piano: your left hand on the CHORD key as each bar's chord comes in
    if (inst === 'piano' && this.level === 'hard')
      for (let bar = Math.ceil(from / 4); bar * 4 < to; bar++) if (!inFill(bar * 4)) notes.push({ beat: bar * 4, part: `piano:${PIANO_CHORD}` as never, degree: -1, vel: 0.7 });
    notes.sort((a, b) => a.beat - b.beat || rank(a.part as string) - rank(b.part as string));
    // two hands: never more than two things at once (the later part's note goes back to the bed)
    // the same note twice on one beat (two parts landing on one drum): one hit is one note, so it's one note
    for (let i = notes.length - 1; i >= 1; i--) for (let j = i - 1; j >= 0 && notes[i].beat - notes[j].beat < 0.01; j--) if (notes[j].part === notes[i].part) {
      notes.splice(i, 1);
      break;
    }
    for (let i = notes.length - 1; i >= 2; i--) if (Math.abs(notes[i].beat - notes[i - 2].beat) < 0.01) notes.splice(i, 1);
    return { notes, live, found: foundName };
  }

  /** A recorded note's key, moved onto an instrument (the piano's same scale note; the handpan walked round). */
  private onInst(inst: string, key: string, k: number, part = ''): string {
    // the congas: the first extra on the low drum (middle, then edge), the second a slap on the high one, the hat's
    // eighths on the high drum (open, slap); anything else by what it was on the kit
    if (inst === 'congas') {
      if (key.startsWith('congas:')) return key;
      if (part === 'PERC') return `congas:${k % 2}`;
      if (part === 'PERC 2') return 'congas:3';
      if (part === 'HAT' || key === 'kit:hat') return `congas:${2 + (k % 2)}`;
      return key === 'kit:kick' ? 'congas:0' : 'congas:3';
    }
    if (inst === 'drums' || key.startsWith(inst + ':')) {
      // (the bass's low octave on the piano is played on the same key)
      return inst === 'piano' && key.startsWith('piano:') ? `piano:${Number(key.slice(6)) % PIANO_LOW}` : key;
    }
    // (an unpitched extra on the handpan walks its notes; a line with notes keeps its scale degrees)
    if (inst === 'handpan' && (key.startsWith('kit:') || key.startsWith('clap:') || key.startsWith('handpan:'))) return key.startsWith('handpan:') ? key : `handpan:${1 + (k % 8)}`;
    const i = key.indexOf(':');
    const degree = this.room.degreeOf(key.slice(0, i), Number(key.slice(i + 1)));
    return `${inst}:${Math.max(0, this.room.zoneFor(inst, degree)) % PIANO_LOW}`;
  }

  /** Perform on the machine: it drops to a bed, the kit parts are yours to play on your own things. */
  /**
   * A song, ready to play: the track's parts as written (the beat on the drums, the tune and the bass on the piano,
   * the extra on the handpan), and you play your part on the instrument that's out; the band plays the rest.
   */
  playSong(i: number, beat0 = -1): void {
    const track = this.tracks[i];
    if (!track) return;
    // in a band, a guest asks the host; the host's start is everyone's
    if (beat0 < 0 && !this.listening && this.stage.bandSong?.(i) === 'wait') {
      this.bandWait = this.t;
      this.refreshDisplay();
      return;
    }
    const parts: { def: PartDef; surface: string; key: string; notes: MachineNote[] }[] = [];
    // a written-out song: the band's parts run its whole length (the machine plays them once, not as a loop)
    if (track.score)
      for (const p of scoreParts(track.score)) parts.push({ def: { name: p.name, pattern: '', pitched: 'no' }, surface: p.key.slice(0, p.key.indexOf(':')), key: p.key, notes: p.notes.map((n) => ({ ...n, filled: false })) });
    for (const def of track.parts) {
      const st = steps(def.pattern, track.swing);
      const keyOf = (s: Step, k: number): string => {
        if (def.name === 'KICK') return 'kit:kick';
        if (def.name === 'SNARE') return 'kit:snare';
        if (def.name === 'HAT') return 'kit:hat';
        if (def.name === 'CLAP') return 'clap:0';
        if (def.name.startsWith('PERC')) return `handpan:${1 + ((k * 3) % 8)}`;
        const z = Math.max(0, this.room.zoneFor('piano', Math.max(0, s.degree)));
        return `piano:${z + (def.name === 'BASS' ? PIANO_LOW : 0)}`;
      };
      const notes = st.map((s, k) => ({ key: keyOf(s, k), beat: s.beat, vel: s.vel, filled: false }));
      const key = notes[0]?.key ?? 'kit:kick';
      parts.push({ def, surface: key.slice(0, key.indexOf(':')), key, notes });
    }
    this.machine = { track, parts, written: true, len: track.score ? track.score.end + 4 : LOOP_BEATS };
    const out = this.stage.shelf?.(0).id ?? 'drums';
    this.beginPerform(out, beat0);
    // (listening is this headset's own: it doesn't start the band's song)
    if (!this.listening) this.stage.songStarted?.(i, this.clock.start);
  }

  /** When this guest asked the host to start a song (the Songs page says so for a few seconds). */
  bandWait = -9;
  /** The song being played now (its id), or '' (listening counts as not playing: it's this headset's own). */
  get perfTrack(): string {
    return this.perf && !this.listening && (this.mode === 'play' || this.mode === 'count') ? this.perf.track.id : '';
  }
  /** The parts this headset is playing live now (their names: 'KICK', 'KEYS'), for friends' backing to leave out. */
  get perfParts(): string[] {
    if (!this.perfTrack || !this.machine || !this.perf) return [];
    const live = this.perf.live;
    const cover = this.perf.cover;
    return this.machine.parts.filter((p) => live.has(p.key) || !!cover?.has(p.key)).map((p) => p.def.name);
  }
  /** Parts friends in the band are playing live in this same song (they don't play in this headset's backing). */
  readonly friendParts = new Set<string>();

  /**
   * Listen first: the song plays itself once through (eight bars) on the instrument that's out: your part too, the
   * keys moving and the notes falling, nothing scored. Then it's your turn.
   */
  listening = false;
  listenSong(i: number): void {
    this.listening = true;
    // (on this headset only: it doesn't start the band's song)
    this.playSong(i, this.t + 0.4 + 4 * secPerBeat(this.tracks[i]?.bpm ?? 90, this.opts.tempo));
  }
  private endListen(): void {
    this.listening = false;
    this.stop();
    this.menu = 'songs';
    // and straight into it: your turn (the count-in says so)
    this.afterListen = true;
    // (in a band, starting it would start it for everyone: back to the songs, your turn when you press PLAY)
    if (this.stage.bandState?.().state === 'connected') {
      this.display.sub = 'Your turn';
      this.refreshDisplay();
      return;
    }
    this.playSong(this.songSel);
  }
  /** The song just played itself: the count-in says it's your turn. */
  private afterListen = false;

  /** The songs: the familiar ones, and today's (a new loop track each day). */
  get tracks(): readonly TrackDef[] {
    this.today();
    return this.dailyList;
  }
  /** What Make a track builds: the loop tracks, and today's. */
  get buildTracks(): readonly TrackDef[] {
    this.today();
    return this.buildList;
  }
  private today(): void {
    const day = songDay();
    if (this.dailyFor === day) return;
    this.dailyFor = day;
    const daily = dailyTrack(day);
    this.dailyList = [...SONG_TRACKS, daily];
    this.buildList = [...TRACKS, daily];
  }
  private dailyFor = '';
  private dailyList: TrackDef[] = [...SONG_TRACKS];
  private buildList: TrackDef[] = [...TRACKS];
  /** The track Make a track starts on: the next one that's open, else the first. */
  private nextBuild(): number {
    return Math.max(0, this.nextTrack());
  }

  /** The songs the page shows (by the filter: all, the classics, or the originals), as indices into `tracks`. */
  private shownSongs(): number[] {
    const f = this.songFilter;
    const out: number[] = [];
    this.tracks.forEach((t, i) => {
      const orig = !!t.score?.tune.original;
      if (f === 'all' || (t.score && (f === 'originals') === orig)) out.push(i);
    });
    return out;
  }
  /** The page of songs showing now (six to a page): the one asked for, else the one with the song picked. */
  private shownPage(): number {
    const shown = this.shownSongs();
    const pages = Math.max(1, Math.ceil(shown.length / SONGS_A_PAGE));
    const at = this.songPage >= 0 ? this.songPage : Math.max(0, Math.floor(shown.indexOf(this.songSel) / SONGS_A_PAGE));
    return Math.min(pages - 1, at);
  }

  /** The next song to play: the first you haven't played, else the last. */
  nextSong(): number {
    const i = SONG_TRACKS.findIndex((t) => !this.performed(t.id));
    return i < 0 ? SONG_TRACKS.length - 1 : i;
  }

  beginPerform(inst = 'drums', beat0 = -1): void {
    const m = this.machine;
    if (!m) return;
    this.groove = null;
    // (the guitar plays over any song; another instrument needs a part of the song on it)
    const has = (i: string) => i === 'drums' || i === 'guitar' || m.parts.some((p) => plays(i, p.def.name) && p.def.name !== 'BASS');
    if (!has(inst)) inst = 'drums';
    this.stage.useInstrument?.(inst);
    this.combo = 0;
    this.bestRun = 0;
    this.finalWait = -1;
    this.domSent = false;
    const t = m.track;
    this.bld = null;
    // 16 bars with a fill in bars 7–8 and 15–16, then 4 bars of hold it (scored, never shown)
    // (a written-out song: its passes with a solo bar between, to its last note: its "bars" can end mid-bar)
    const sc = t.score;
    const bars = sc ? sc.end / 4 : 20;
    const fills: [number, number][] = sc
      ? sc.solos.map(([a, z]) => [a, z] as [number, number])
      : [
          [28, 32],
          [52, 56],
        ];
    // (Easy keeps its lights to the end: the last two bars go dark on Normal, the last four on Hard)
    const holdFrom = this.level === 'easy' ? 999 : this.level === 'hard' ? bars * 4 - 16 : bars * 4 - 8;
    const listen = this.listening;
    const first = this.chartFor(inst, 0, (listen ? 8 : bars) * 4, listen ? [] : fills);
    const notes = first.notes;
    const found = first.found;
    const song: Song = { id: t.id, name: t.name, mood: 'yours', bpm: t.bpm, bars: listen ? 8 : bars, beatsPerBar: 4, key: t.key, parts: [], notes, bed: [] };
    // listening: your part plays itself on your instrument (the keys move by themselves), the band the rest
    this.listenNotes = listen ? notes.slice() : [];
    this.perf = { track: t, live: first.live, cover: first.cover ?? null, fills: listen ? [] : fills, fillHits: [], fillsJudged: 0, goodFills: 0, holdFrom: listen ? 999 : holdFrom, sched: -0.01, big: -1, joins: listen ? '' : found, inst, queued: null, switchAt: -1, graceTo: -1, second: sc ? sc.last : SECOND, final: sc ? finalKeys(sc, inst) : null };
    // the song engine, with each note on the thing you chose
    this.looper.clear();
    this.song = song;
    this.cast = {};
    this.accompanists = [];
    this.played.length = 0;
    this.encore.length = 0;
    this.encoreAt = -1;
    this.stage.retune(t.key, t.minor);
    const spb = secPerBeat(t.bpm, this.opts.tempo);
    this.tempoAtStart = this.opts.tempo;
    this.clock.set(beat0 >= 0 ? beat0 : this.t + 0.4 + 4 * spb, spb);
    // the count-in, then the track's chords under everything (held, one a bar)
    // (one chord a bar: the song's two, then the second half's change, then home)
    const prog = Array.from({ length: bars }, (_, b) => songChord(t, b, true));
    this.bedCursor = new EventCursor(sc ? scoreBed(sc) : chordBed({ roots: prog.map((c) => c.root), minor: prog.flatMap((c, b) => (c.minor ? [b] : [])), bass: '........', chord: 'hold', shaker: false }, bars));
    this.bedCursor.seek(-4);
    const chart = this.stage.setting('oneHand', false) ? oneHanded(notes) : notes;
    this.judge = new NoteJudge(chart.map((n) => ({ beat: n.beat, lane: n.part as string, vel: n.vel })), spb, windows(this.opts.tempo < 0.95));
    this.graded.perfect = this.graded.good = this.graded.extra = 0;
    this.energy = 0.5;
    this.mode = 'count';
    this.modeT = this.t;
    // (once more now the song is on: the instrument is laid out in its key and scale, which it reads from here)
    this.stage.useInstrument?.(inst);
    this.refreshDisplay();
  }

  /**
   * One of the machine's notes at song beat `at`: on its thing, or (a written-out song's melody and bass) in the
   * band's own voices, the tune a plucked lead (the bed's pluck sounds an octave over its note) that never drops
   * below most of its level.
   */
  private sound(n: MachineNote, at: number, vel: number): void {
    if (n.midi === undefined) return this.stage.voice(n.key, this.clock.timeAt(at), vel);
    const bass = n.key === 'band:bass';
    this.stage.band({ beat: at, voice: bass ? 'bass' : 'pluck', midi: n.midi, len: n.len ?? 1, vel: Math.max(vel, 0.75 * n.vel) }, this.clock.timeAt(at), this.clock.spb);
  }

  /** The machine's bed under the performance, and each fill judged as it closes. */
  private tickPerform(beat: number): void {
    const p = this.perf!;
    const m = this.machine!;
    // a switch lands: the new instrument comes out, its notes start a bar later (that bar is yours to find it)
    if (p.queued && beat >= p.switchAt) {
      const inst = p.queued;
      p.queued = null;
      p.inst = inst;
      p.graceTo = p.switchAt + 4;
      p.joins = '';
      this.stage.useInstrument?.(inst);
      const c = this.chartFor(inst, p.graceTo, (this.song?.bars ?? 20) * 4, p.fills);
      const chart = this.stage.setting('oneHand', false) ? oneHanded(c.notes) : c.notes;
      this.judge?.dropFrom(p.switchAt);
      this.judge?.add(chart.map((n) => ({ beat: n.beat, lane: n.part as string, vel: n.vel })));
      p.live = c.live;
      p.cover = c.cover ?? null;
      if (m.track.score) p.final = finalKeys(m.track.score, inst);
      if (this.listening) this.listenNotes = this.listenNotes.filter((n) => n.beat < p.switchAt).concat(c.notes);
      this.refreshDisplay();
    }
    if (p.graceTo > 0 && beat >= p.graceTo) {
      p.graceTo = -1;
      this.refreshDisplay();
    }
    const ahead = beat + TIMING.lookAheadS / this.clock.spb;
    const end = (this.song?.bars ?? 20) * 4;
    if (ahead > p.sched) {
      // the machine follows you: louder and fuller as you lock in; when you lose it the perc and keys drop out
      // until you're back. In a fill it steps right back so you're heard
      const thin = this.energy < 0.35 && ahead < p.holdFrom;
      // BACKING BAND off: just you (the chords go quiet in the engine, the other parts here)
      const backing = this.stage.setting('band', false);
      const len = m.len ?? LOOP_BEATS;
      const scored = !!m.track.score;
      for (let L = Math.max(0, Math.floor(p.sched / len)); L * len <= Math.min(ahead, end); L++)
        for (const part of m.parts) {
          if (p.live.has(part.key) || this.room.muted?.(part.surface) || !backing) continue;
          // a friend in the band is playing this part live: theirs is the one you hear
          if (this.friendParts.has(part.def.name)) continue;
          // (losing the beat drops the extra percussion, never the tune: it's how you find your way back)
          if (thin && part.def.name.startsWith('PERC')) continue;
          const mine = p.cover?.get(part.key);
          for (const n of part.notes) {
            const at = L * len + n.beat;
            if (at <= p.sched || at > ahead || at >= end) continue;
            // (the notes of it you're playing are yours)
            if (mine?.has(beatKey(at))) continue;
            // (the second half's chords have their own bass, below)
            if (!scored && part.def.name === 'BASS' && at >= CHANGE[0] && at < CHANGE[1]) continue;
            const inFill = within(p.fills, at, 0);
            // the last bars: the whole machine back at full under you, lights down
            // (in a solo the band steps back; the kit keeps time under you unless you're the drummer)
            const keepsTime = p.inst !== 'drums' && (part.def.name === 'KICK' || part.def.name === 'SNARE' || part.def.name === 'HAT');
            const level = inFill ? (keepsTime ? 0.55 : 0.22) : at >= p.holdFrom ? 0.95 : 0.25 + 0.6 * this.energy;
            this.sound(n, at, (n.filled ? n.vel * 0.85 : n.vel) * level);
          }
        }
      // the end: the band holds the five chord on the last downbeat, waiting for your hit to take it home
      if (ahead >= end && !this.domSent && !this.listening && this.stage.bandState?.().state !== 'connected') {
        this.domSent = true;
        this.stage.band({ beat: end, voice: 'chord', midi: p.track.chords[0] + 7, len: 12, vel: 0.5, minor: false }, this.clock.timeAt(end), this.clock.spb);
        this.stage.band({ beat: end, voice: 'bass', midi: p.track.chords[0] + 7 - 24, len: 12, vel: 0.7 }, this.clock.timeAt(end), this.clock.spb);
      }
      // the second half's change: the band's bass on its roots, on 1 and 3
      if (backing && !scored)
        for (let b = Math.floor(p.sched) + 1; b <= ahead; b++)
          // (not if the bass is someone's live part: theirs is the one)
          if (b >= CHANGE[0] && b < CHANGE[1] && b % 2 === 0 && !this.friendParts.has('BASS') && !m.parts.some((q) => q.def.name === 'BASS' && p.live.has(q.key))) {
            const c = songChord(p.track, Math.floor(b / 4), true);
            this.stage.band({ beat: b, voice: 'bass', midi: c.root - 24, len: 0.9, vel: b % 4 === 0 ? 0.75 : 0.6 }, this.clock.timeAt(b), this.clock.spb);
          }
      // listening: your part, played for you on the instrument that's out
      if (this.listening)
        for (const n of this.listenNotes) {
          // (a chord change on the guitar's neck is shown, not strummed twice)
          if (n.beat <= p.sched || n.beat > ahead || n.beat >= end || (p.inst === 'guitar' && n.part !== 'guitar:9')) continue;
          this.stage.voice(n.part as string, this.clock.timeAt(n.beat), n.vel * 0.8);
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
    const key = within(p.fills, beat, 0) ? 1 : beat < p.big ? 3 : beat >= p.holdFrom ? 2 : p.joins && beat >= 12 && beat < 16 ? 4 : 0;
    if (key !== this.perfShown) {
      // the room goes dark for the fill, and comes back up when it lands (not when listening)
      this.stage.lightsDown?.(key === 1 && !this.listening);
      this.perfShown = key;
      this.refreshDisplay();
    }
  }
  private perfShown = 0;
  /** Listening: your part's notes, played for you. */
  private listenNotes: { beat: number; part: unknown; vel: number }[] = [];
  /** The longest run of notes hit in a row this song, and whether the stars beat your best. */
  private bestRun = 0;
  private lastBest = { run: 0, better: false, song: '', pct: 0, perfect: 0, good: 0, wasEasy3: false };
  /** When the results start counting (after your replay). */
  private resultsT0 = 0;
  /** Your best two bars are playing back: the panel gives them the stage. */
  private get replaying(): boolean {
    return this.mode === 'results' && this.fromPerform && !!this.lap && this.lap.mine.length >= 3;
  }

  private endPerform(): void {
    this.stage.lightsDown?.(false);
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
    this.perfInst = p.inst;
    this.carried = this.whoCarried(j.notes, p.live);
    this.learnOffset();
    const pr = this.progress;
    this.afterListen = false;
    // a number to beat: the share of notes you played, best kept per song and level
    const pct = s.total ? Math.round(((s.perfect + s.good) / s.total) * 100) : 0;
    const bk = `${p.track.id}:${this.level}`;
    pr.best ??= {};
    const before = pr.best[bk];
    pr.best[bk] = Math.max(before ?? 0, pct);
    this.lastBest = { run: this.bestRun, better: before !== undefined && pct > before, song: p.track.name, pct, perfect: s.perfect, good: s.good, wasEasy3: this.level !== 'hard' && stars === 3 };
    this.resultsT0 = this.t;
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
    const from = Math.ceil((now + 0.5) / LOOP_BEATS) * LOOP_BEATS;
    // your best two bars (the most notes you hit), played back in your part's place
    let bestW = 0;
    let bestN = -1;
    for (let w = 0; w + LOOP_BEATS <= (this.song?.bars ?? 20) * 4; w += LOOP_BEATS) {
      let n = 0;
      for (const h of this.played) if (h.beat >= w - 0.25 && h.beat < w + LOOP_BEATS - 0.25) n++;
      if (n > bestN) {
        bestN = n;
        bestW = w;
      }
    }
    // (an early downbeat stays a downbeat, a hair early; each hit pulled halfway to its sixteenth, as a band would)
    let loud = 0.3;
    for (const h of this.played) loud = Math.max(loud, h.gain);
    const mine = this.played
      .filter((h) => h.beat >= bestW - 0.25 && h.beat < bestW + LOOP_BEATS - 0.25)
      .map((h) => {
        const b = h.beat - bestW;
        return { key: h.key, beat: (b + Math.round(b * 4) / 4) / 2, gain: 0.55 + (0.45 * h.gain) / loud };
      });
    // (a written-out song plays those same two bars of itself under them; a loop is the same every two bars)
    this.lap = { from, sched: from - 0.3, dropped: false, mine, live: mine.length >= 3 ? new Set(p.live) : new Set<string>(), cover: mine.length >= 3 ? p.cover : null, base: p.track.score ? bestW : 0 };
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
  /** The instrument the last performance ended on (Again plays it on that). */
  private perfInst = 'drums';
  /** After a performance: the machine's two loops at full (from beat `from`). */
  private lap: { from: number; sched: number; dropped: boolean; mine: { key: string; beat: number; gain: number }[]; live: Set<string>; cover: Map<string, Set<number>> | null; base: number } | null = null;
  private tickLap(t: number): void {
    const l = this.lap;
    const m = this.machine;
    if (!l || !m) return;
    const beat = this.clock.beatAt(t);
    const end = l.from + 2 * LOOP_BEATS;
    if (!l.dropped && beat >= l.from) {
      l.dropped = true;
      this.stage.drop?.();
      this.refreshDisplay();
    }
    const ahead = Math.min(end, beat + TIMING.lookAheadS / this.clock.spb);
    if (ahead > l.sched) {
      // (loops counted from the replay's own start: your first bar first)
      for (let L = Math.max(0, Math.floor((Math.max(l.from, l.sched) - l.from) / LOOP_BEATS)); l.from + L * LOOP_BEATS <= ahead; L++)
        {
          for (const part of m.parts) {
            // (your part is you: the band plays the rest, if there's a band)
            if (l.live.has(part.key) || !this.stage.setting('band', false)) continue;
            const yours = l.cover?.get(part.key);
            for (const n of part.notes) {
              if (this.room.muted?.(part.surface)) break;
              const rel = n.beat - l.base;
              if (rel < 0 || rel >= LOOP_BEATS || yours?.has(beatKey(n.beat))) continue;
              const at = l.from + L * LOOP_BEATS + rel;
              if (at > l.sched && at <= ahead && at >= l.from && at < end) this.sound(n, at, (n.filled ? n.vel * 0.85 : n.vel) * 0.75);
            }
          }
          // the band's chords under it, as they change (the bed ended with the song)
          const sc = m.track.score;
          if (sc && this.stage.setting('band', false))
            for (let b = 0; b < LOOP_BEATS; b++) {
              const at = l.from + L * LOOP_BEATS + b;
              const c = chordAt(sc, l.base + b);
              if (at <= l.sched || at > ahead || at >= end || (b % 4 > 0 && chordAt(sc, l.base + b - 1) === c)) continue;
              let n = 1;
              while (b + n < LOOP_BEATS && (b + n) % 4 > 0 && chordAt(sc, l.base + b + n) === c) n++;
              this.stage.band({ beat: at, voice: 'chord', midi: chordMidi(c, m.track.key), len: n, vel: 0.4, minor: c.minor }, this.clock.timeAt(at), this.clock.spb);
            }
          else if (this.stage.setting('band', false))
            for (let bar = 0; bar < 2; bar++) {
              const at = l.from + L * LOOP_BEATS + bar * 4;
              if (at <= l.sched || at > ahead || at >= end) continue;
              const c = songChord(m.track, bar, false);
              this.stage.band({ beat: at, voice: 'chord', midi: c.root, len: 4, vel: 0.4, minor: c.minor }, this.clock.timeAt(at), this.clock.spb);
            }
          for (const h of l.mine) {
            // (a chord change on the guitar's neck isn't strummed again)
            if (h.key === 'guitar:0' || h.key === 'guitar:1' || h.key === 'guitar:2') continue;
            const at = l.from + L * LOOP_BEATS + h.beat;
            if (at > l.sched && at <= ahead && at >= l.from - 0.25 && at < end) this.stage.voice(h.key, this.clock.timeAt(at), Math.min(1, h.gain), false, true);
          }
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
      const part = say(this.machine?.parts.find((p) => p.surface === surface)?.def.name ?? 'part').toLowerCase();
      const word = this.room.wordFor?.(surface);
      const who = word ? `Your ${word}` : `The ${part}`;
      const share = got / n;
      best = share >= 1 ? `${who} never missed` : share >= 0.75 ? `${who} carried it` : share < 0.5 ? `${who} wants another go` : '';
      if (best) break;
    }
    return best;
  }

  /**
   * Free play's band: your first note on an instrument starts a soft groove at 90 under you (a beat, a held chord a
   * bar and the bass; with the drums out, just chords and bass, you're the drummer; with the handpan, its low middle
   * and a shaker). The chord pad and strums follow its chords. Two quiet bars and it lets go.
   */
  private groove: { root: number; chords: readonly (readonly number[])[]; inst: string; sched: number; last: number } | null = null;
  private groovePlayed(key: string, t: number): void {
    const f = this.stage.freeHarmony?.();
    if (!this.stage.setting('band', false)) return;
    if (!f || !(key.startsWith('piano:') || key.startsWith('guitar:') || key.startsWith('handpan:') || key.startsWith('congas:') || key.startsWith('kit:') || key.startsWith('keys:'))) return;
    if (this.groove) {
      this.groove.last = t;
      // and keeps following you: a note a little off the band's eighths nudges the band a little toward it
      const spb = this.clock.spb;
      const beat = this.clock.beatAt(t - this.opts.offset);
      const off = beat - Math.round(beat * 2) / 2;
      if (Math.abs(off) < 0.2) this.clock.set(this.clock.start + off * spb * 0.15, spb);
      return;
    }
    // the band takes your tempo from your first three notes (steady ones: two gaps within a quarter of each other;
    // quick ones are eighths); unsteady, or a pause, and it plays at 90
    const taps = this.grooveTaps;
    if (taps.length && t - taps[taps.length - 1] > 1.6) taps.length = 0;
    taps.push(t);
    if (taps.length < 3) return;
    const a = taps[1] - taps[0];
    const b = taps[2] - taps[1];
    let spb = Math.abs(a - b) <= 0.25 * Math.max(a, b) ? (a + b) / 2 : 60 / 90;
    if (spb < 0.42) spb *= 2;
    else if (spb > 0.84) spb /= 2;
    spb = Math.max(60 / 126, Math.min(60 / 72, spb));
    taps.length = 0;
    // the band comes in a beat later: your note was the 4 before its 1
    this.clock.set(t + spb, spb);
    this.groove = { root: f.root, chords: f.chords, inst: f.inst, sched: -0.01, last: t };
    this.refreshDisplay();
  }
  private grooveTaps: number[] = [];
  private tickGroove(t: number): void {
    const g = this.groove;
    if (!g) return;
    const beat = this.clock.beatAt(t);
    const f = this.stage.freeHarmony?.();
    if (t - g.last > 8 * this.clock.spb || (f && f.inst !== g.inst)) {
      this.groove = null;
      this.refreshDisplay();
      return;
    }
    if (f) {
      g.root = f.root;
      g.chords = f.chords;
    }
    const ahead = beat + TIMING.lookAheadS / this.clock.spb;
    const spb = this.clock.spb;
    for (let b = Math.floor(g.sched * 2 + 1) / 2; b <= ahead; b += 0.5) {
      if (b <= g.sched || b < 0) continue;
      const at = this.clock.timeAt(b);
      const inBar = ((b % 4) + 4) % 4;
      const bar = Math.floor(b / 4);
      const c = g.chords[GROOVE[bar % 4] % g.chords.length];
      const minor = c[1] - c[0] === 3;
      const root = g.root + c[0];
      if (inBar === 0) this.stage.band({ beat: b, voice: 'chord', midi: root + 12, len: 4, vel: 0.28, minor }, at, spb);
      if (g.inst !== 'handpan' && (inBar === 0 || inBar === 2)) this.stage.band({ beat: b, voice: 'bass', midi: root - 12, len: 0.9, vel: inBar === 0 ? 0.7 : 0.55 }, at, spb);
      if (g.inst === 'handpan' && inBar === 0 && bar % 2 === 0) this.stage.voice('handpan:0', at, 0.4);
      if (g.inst !== 'drums') this.stage.band({ beat: b, voice: 'shaker', midi: 0, len: 0.1, vel: b % 1 ? 0.25 : 0.4 }, at, spb);
      if (g.inst !== 'drums' && g.inst !== 'handpan' && g.inst !== 'congas') {
        if (inBar === 0 || inBar === 2) this.stage.voice('kit:kick', at, 0.45);
        if (inBar === 1 || inBar === 3) this.stage.voice('kit:rim', at, 0.3);
      }
    }
    g.sched = Math.max(g.sched, Math.floor(ahead * 2) / 2);
  }

  /** An instrument was picked on the stand: say what it is. */
  shelfPicked(v: ShelfView): void {
    this.shelfShown = v;
    this.shelfWhat = '';
    this.tried.add(v.id);
    this.shelfUntil = this.t + 6;
    this.refreshDisplay();
  }

  /** Performing: switch to this instrument at the next loop (the stand's tile, or ◀ ▶). */
  switchTo(id: string): void {
    if (!this.perf || !this.machine || this.perf.queued || id === this.perf.inst) return;
    if (id !== 'drums' && id !== 'guitar' && !this.machine.parts.some((p) => PART_INST[p.def.name] === (id === 'marimba' ? 'piano' : id))) return;
    const beat = this.clock.beatAt(this.t);
    const when = Math.max(0, Math.ceil((beat + 2) / LOOP_BEATS) * LOOP_BEATS);
    if (when >= (this.song?.bars ?? 20) * 4 - 4) return;
    this.perf.queued = id;
    this.perf.switchAt = when;
    this.refreshDisplay();
  }

  /** The shelf on the module for a few seconds after a change (and which setting was just changed). */
  private shelfShown: ShelfView | null = null;
  private shelfUntil = -1;
  private shelfWhat: 'scale' | 'sound' | '' = '';
  /** Instruments put on the desk this session (two, and it offers to build a track). */
  private readonly tried = new Set<string>();

  /** A pad on a thing was hit: show its sound, with ◀ ▶ to change it. */
  focusPad(name: string, t: number): void {
    if (!name || this.mode !== 'discover') return;
    this.pad = { name, until: t + 6 };
    this.refreshDisplay();
  }

  /** A surface's instrument was found (its first hit). */
  discovered(family: Family, label: string, t: number): void {
    if (family === 'keys') return;
    // the first tap on the desk: the drums are out, free play
    if (family === 'kit' && this.menu === 'main' && this.mode === 'discover') this.menu = 'free';
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
      const m = this.machine;
      const inst = this.perfInst;
      if (k === 'play' && this.lastBest.wasEasy3 && this.level !== 'hard') {
        this.level = this.level === 'easy' ? 'normal' : 'hard';
        this.stage.saveLevel?.(this.level);
      }
      this.leaveResults();
      if (k === 'play') this.beginPerform(inst);
      // > after a song: make it your own (build it); after your own, or a written-out song: the next song
      else if (m.written && !m.track.score) this.beginBuild(this.buildTracks.indexOf(m.track));
      else this.playSong(m.track.score ? (this.tracks.indexOf(m.track) + 1) % this.tracks.length : this.nextSong());
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
    if (k === 'prev' && twice && this.mode !== 'play' && this.mode !== 'count' && this.mode !== 'jam' && this.mode !== 'discover' && this.t >= this.pad.until && !(this.shelfShown && this.t < this.shelfUntil)) {
      // tap ◀ twice: the settings page (the gear on the panel opens it too)
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
    // free play: ◀ ▶ swap the instrument on the desk; with one out, the last two keys pick its scale and sound
    if (this.mode === 'discover' && this.stage.shelf) {
      if (k === 'prev' || k === 'next') {
        const n = this.tracks.length;
        this.songSel = (this.songSel + (k === 'next' ? 1 : n - 1)) % n;
        this.shelfShown = null;
        this.refreshDisplay();
        return;
      }
      const cur = this.shelfShown ?? this.stage.shelf(0);
      if ((k === 'jam' || k === 'loop') && cur.id !== 'drums' && this.stage.shelfSet) {
        this.shelfShown = this.stage.shelfSet(k === 'jam' ? 'scale' : 'sound');
        this.shelfWhat = k === 'jam' ? 'scale' : 'sound';
        this.shelfUntil = this.t + 6;
        this.refreshDisplay();
        return;
      }
    }
    // performing: ◀ ▶ switch what you play (it takes over at the next loop; the part you leave goes back in the machine)
    if ((k === 'prev' || k === 'next') && this.perf && this.machine && (this.mode === 'play' || this.mode === 'count') && !this.perf.queued) {
      const m = this.machine;
      const order = SWITCH_ORDER.filter((i) => i === 'drums' || i === 'guitar' || m.parts.some((p) => plays(i, p.def.name)));
      const at = Math.max(0, order.indexOf(this.perf.inst));
      const next = order[(at + (k === 'next' ? 1 : -1) + order.length) % order.length];
      const beat = this.clock.beatAt(this.t);
      const when = Math.max(0, Math.ceil((beat + 2) / LOOP_BEATS) * LOOP_BEATS);
      if (next !== this.perf.inst && when < (this.song?.bars ?? 20) * 4 - 4) {
        this.perf.queued = next;
        this.perf.switchAt = when;
        this.refreshDisplay();
      }
      return;
    }
    if (k === 'prev' || k === 'next') {
      if (this.mode === 'play' || this.mode === 'count') return;
      const n = this.available();
      this.selected = (this.selected + (k === 'next' ? 1 : n - 1)) % n;
      this.refreshDisplay();
      return;
    }
    if (k === 'play' && this.mode === 'discover') {
      this.playSong(this.songSel);
      this.lastTap.play = -9;
      return;
    }
    if (k === 'play') {
      if (this.mode === 'play' || this.mode === 'count') {
        // stopping a song takes two taps (a stray hit never ends it)
        if (twice) this.stop();
        else {
          this.stopAsked = this.t;
          this.display.sub = 'Tap Stop again to stop';
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
  /** What free play's recorder is doing, for the panel's line ('' when it's off). */
  private loopLine(): string {
    const l = this.looper;
    const n = l.layers.length;
    if (l.state === 'count') return 'Four bars, after the count';
    if (l.recording) return `Recording layer ${n + 1}`;
    if (l.state === 'play') return `Looping ${n} layer${n === 1 ? '' : 's'}`;
    return '';
  }

  /** You paused the song (the panel's Pause): the panel shows Resume, Restart and Songs. */
  paused = false;
  /** The song now, from its start again. */
  restartSong(): void {
    const i = this.machine ? this.tracks.indexOf(this.machine.track) : this.songSel;
    if (i < 0) return;
    this.stop();
    this.playSong(i);
  }

  stop(): void {
    this.stage.lightsDown?.(false);
    this.listening = false;
    this.finalWait = -1;
    this.afterListen = false;
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

  hit(key: string, t: number, gain: number): Grade | 'extra' | 'early' | 'late' | null {
    // (playing along with the machine's replay just plays; once it's done and the choice is up, a hit moves on)
    if (this.mode === 'results' && t - this.modeT > 4 && !this.lap && this.resultsStage >= 4) this.leaveResults();
    if (this.mode === 'jam' && this.mate) return this.hitJam(key, t, gain);
    if (this.mode === 'build') return this.hitBuild(key, t, gain);
    if (this.mode === 'discover' && this.looper.recording) this.looper.hear(this.loopClock.beatAt(t - this.opts.offset), key, gain);
    if (this.mode === 'discover' && this.looper.state === 'off') this.groovePlayed(key, t);
    if ((this.mode !== 'play' && this.mode !== 'count') || !this.judge) return null;
    // listening: you can play along, nothing's scored
    if (this.listening) return null;
    // the band's waiting for your last hit
    if (this.finalWait >= 0 && this.perf) {
      if (gain < 0.2) return null;
      this.landLastHit();
      return 'perfect';
    }
    if (this.perf) {
      const b = this.clock.beatAt(t - this.opts.offset);
      if (within(this.perf.fills, b, 0.25)) {
        this.perf.fillHits.push(b);
        // (your solo is yours: it can come back round in the replay)
        if (this.played.length < 400) this.played.push({ key, beat: b, gain });
        const off = Math.abs(b * 2 - Math.round(b * 2)) / 2;
        return off < 0.08 ? 'perfect' : 'good';
      }
    }
    const at = t - this.opts.offset - this.clock.start;
    const r = this.judge.hit(key, at);
    if (!r) {
      this.graded.extra++;
      // (near a note but outside its window: say which way)
      const off = this.judge.near(key, at, 0.25 * this.clock.spb);
      return off === null ? 'extra' : off < 0 ? 'early' : 'late';
    }
    this.graded[r.grade === 'perfect' ? 'perfect' : 'good']++;
    this.combo++;
    if (this.combo > this.bestRun) this.bestRun = this.combo;
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
    if (this.shelfShown && t >= this.shelfUntil) {
      this.shelfShown = null;
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
      this.tickGroove(t);
      // the first song is offered once there are two instruments (or the table alone has had a while)
      if (!this.offered && (this.tried.size >= 2 || (this.room.things?.() ?? 0) >= 2 || (this.kitAt >= 0 && t - this.kitAt > 40) || (!this.room.things && this.found.length >= 2))) {
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
      // (the results wait for your replay: it plays first, on its own)
      if (this.replaying || this.resultsT0 < this.modeT) this.resultsT0 = t;
      const el = t - this.resultsT0;
      const c = this.fromPerform && this.carried ? 2.5 : 0;
      const stage = el < 1.3 ? 0 : el < 4 ? 1 : el < 4 + c ? 2 : el < 7 + c && this.newUnlocks.length ? 3 : 4;
      if (stage !== this.resultsStage) {
        this.resultsStage = stage;
        this.refreshDisplay();
      }
      // the stars land one by one, 200 ms apart, each with its note (after your replay)
      const lit = this.replaying ? -1 : Math.min(this.last?.stars ?? 0, Math.floor(el / 0.2));
      // (every star that landed since the last frame: a slow frame mustn't swallow one's note)
      if (lit > this.display.stars && lit > 0) for (let s = Math.max(0, this.display.stars); s < lit; s++) this.stage.starLanded?.(s, this.last?.stars ?? 0);
      this.display.stars = lit;
      if (stage === 0 && this.last && !this.fromPerform) {
        const k = Math.min(1, el / 1.1);
        this.display.line = `${Math.round((this.last.perfect + this.last.good) * (1 - Math.pow(1 - k, 3)))} of ${this.last.total} notes`;
      }
      this.tickEncore(t);
      const wasReplay = this.replaying;
      this.tickLap(t);
      if (wasReplay && !this.replaying) this.refreshDisplay();
      if (el >= 45 && !this.lap) this.leaveResults();
      return;
    }
    if (this.stopAsked > 0 && t - this.stopAsked > 1.2) {
      this.stopAsked = -1;
      this.refreshDisplay();
    }
    const song = this.song!;
    const beat = this.clock.beatAt(t);
    const spb = this.clock.spb;
    // the progress bar and the run of notes move every frame (the rest of the panel only when it changes)
    this.display.progress = Math.max(0, beat / (song.bars * 4));
    this.display.combo = this.combo;
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
      if (d < -0.6 && !(n.grade === 'perfect' || n.grade === 'good')) continue;
      if (d < -1) continue;
      // in the last bars the lights go dim and the notes fall faint (you keep it going; it hasn't stopped)
      const dim = !!this.perf && n.beat >= this.perf.holdFrom;
      if (n.grade === null && d <= TIMING.glowBeats && d > -0.3) this.stage.light(n.lane, (1 - Math.max(0, d) / TIMING.glowBeats) * (dim ? 0.22 : 1));
      if (k < MAX_MOTES) {
        const m = this.motes[k++];
        m.faint = dim;
        m.key = n.lane;
        m.ahead = d;
        m.grade = n.grade;
        m.since = n.grade === 'perfect' || n.grade === 'good' ? beat - (n.beat + n.offset / this.clock.spb) : -1;
      }
    }
    this.moteCount = k;
    this.energy += (0.5 - this.energy) * 0.002;
    this.display.meter = this.energy;
    if (this.perf) this.tickPerform(beat);
    // (the last hit waits from the last downbeat)
    if (this.perf && !this.listening && beat >= song.bars * 4 - 0.25 && this.lastHit(t)) return;
    if (beat >= song.bars * 4 + 1) {
      if (this.perf && this.listening) this.endListen();
      else if (this.perf) this.endPerform();
      else this.end();
    }
  }

  /**
   * The last hit: the song's over and the band holds its chord, waiting for you (your instrument's light pulses): hit
   * it and the band lands on it with you. Up to five seconds, then it ends by itself. (Not in a band: friends' songs
   * end on the band's clock.) True while it waits.
   */
  private finalWait = -1;
  /** The held five chord at the end has been sent. */
  private domSent = false;
  private lastHit(t: number): boolean {
    const p = this.perf!;
    if (this.finalWait < 0) {
      if (!this.domSent) return false;
      this.finalWait = t;
      this.refreshDisplay();
    }
    if (t - this.finalWait > 4) {
      // nobody hit it: the band takes it home anyway
      const tr = p.track;
      const at = this.clock.timeAt(this.clock.beatAt(t));
      this.stage.band({ beat: 0, voice: 'chord', midi: tr.chords[0], len: 4, vel: 0.45, minor: !!tr.minorChords?.includes(0) }, at, this.clock.spb);
      this.stage.band({ beat: 0, voice: 'bass', midi: tr.chords[0] - 24, len: 4, vel: 0.6 }, at, this.clock.spb);
      this.finalWait = -1;
      return false;
    }
    const pulse = 0.55 + 0.45 * Math.sin((t - this.finalWait) * 9);
    for (const k of p.final ?? FINAL_KEYS[p.inst] ?? FINAL_KEYS.drums) this.stage.light(k, pulse);
    return true;
  }
  private landLastHit(): void {
    this.finalWait = -1;
    const tr = this.perf!.track;
    const at = this.clock.timeAt(this.clock.beatAt(this.t));
    this.stage.drop?.();
    this.stage.band({ beat: 0, voice: 'chord', midi: tr.chords[0], len: 4, vel: 0.6, minor: !!tr.minorChords?.includes(0) }, at, this.clock.spb);
    this.stage.band({ beat: 0, voice: 'bass', midi: tr.chords[0] - 24, len: 4, vel: 0.8 }, at, this.clock.spb);
    // your hit is a downbeat: the replay comes in one bar after it
    const bars = (this.song?.bars ?? 20) * 4 + 4;
    this.clock.set(this.t - bars * this.clock.spb, this.clock.spb);
    this.endPerform();
  }

  private leaveResults(): void {
    this.encoreAt = -1;
    this.lap = null;
    this.songSel = this.nextSong();
    this.songPage = -1;
    this.stage.useInstrument?.(null);
    this.mode = 'discover';
    this.song = null;
    this.stage.retune(0);
    this.refreshDisplay();
  }

  private onBed = (e: BedEvent): void => {
    // the count-in: the band's drummer counts you in on sticks, from across the desk (when there's a seat for them)
    if (e.beat < 0 && e.voice === 'shaker' && this.perf && this.stage.countIn?.(e.beat, this.clock.timeAt(e.beat), e.vel)) return;
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
    if (this.listening) return;
    this.combo = 0;
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
  /** Notes hit in a row (a miss starts it again). */
  private combo = 0;
  /** The song the panel's card shows (◀ ▶ browse; PLAY plays it). */
  songSel = 0;
  /** The page of songs on the panel (six to a page), or −1: the page with the one picked. */
  private songPage = -1;
  /** Which songs the page shows. */
  songFilter: 'all' | 'classics' | 'originals' = 'all';
  /** The gear on the panel: the settings page. */
  openSettings(): void {
    if (this.mode !== 'discover' && this.mode !== 'results') return;
    if (this.mode === 'results') this.leaveResults();
    this.settingsOpen = !this.settingsOpen;
    this.refreshDisplay();
  }

  refreshDisplay(): void {
    this.fillDisplay();
    this.panelFields();
  }

  /** The page the panel shows in free play (the others follow the mode). */
  menu: PageId = 'main';
  /** Where Instruments was opened from (picking one goes back there). */
  instFrom: PageId = 'free';
  /** Easy (the beat, the tune) or Normal (more of each part). */
  level: 'easy' | 'normal' | 'hard' = 'easy';

  /** Something on the panel was pressed (an item's action id). */
  act(id: string): void {
    if (id.startsWith('key:')) return this.key(id.slice(4) as ModuleKey);
    if (id === 'back') {
      if (this.tuneOpen) this.tuneOpen = false;
      else if (this.settingsOpen) this.settingsOpen = false;
      else {
        const up: Record<string, PageId> = { inst: 'instruments', instruments: this.instFrom === 'songs' ? 'songs' : this.found.includes('kit') ? 'free' : 'main', songs: 'main', band: 'main', free: 'main', main: 'main' };
        this.menu = up[this.menu] ?? 'main';
      }
      this.refreshDisplay();
      return;
    }
    if (id.startsWith('nav:')) {
      const to = id.slice(4);
      if (this.mode === 'results') this.leaveResults();
      if (to === 'settings') this.settingsOpen = true;
      else if (to === 'build') this.beginBuild(this.nextBuild());
      else {
        if (to === 'instruments' && this.menu !== 'instruments') this.instFrom = this.menu === 'songs' ? 'songs' : 'free';
        // (the songs open on the page with the one picked)
        if (to === 'songs') this.songPage = -1;
        this.menu = to as PageId;
      }
      this.refreshDisplay();
      return;
    }
    if (id === 'songs:more') {
      // the songs page shows six at a time: the next six, or back to the first
      const pages = Math.max(1, Math.ceil(this.shownSongs().length / SONGS_A_PAGE));
      this.songPage = (this.shownPage() + 1) % pages;
      this.refreshDisplay();
      return;
    }
    if (id === 'songs:filter') {
      // all of them, the classics, the originals
      this.songFilter = this.songFilter === 'all' ? 'classics' : this.songFilter === 'classics' ? 'originals' : 'all';
      this.songPage = 0;
      this.refreshDisplay();
      return;
    }
    if (id.startsWith('song:')) {
      // (every song is open: it's a library, not a ladder)
      const i = Number(id.slice(5));
      if (i >= 0 && i < this.tracks.length) this.songSel = i;
      this.refreshDisplay();
      return;
    }
    if (id === 'play') return this.playSong(this.songSel);
    if (id === 'listen') return this.listenSong(this.songSel);
    if (id === 'stop') {
      // two presses: a stray arm in a fill never ends the song
      if (!(this.stopAsked > 0 && this.t - this.stopAsked < 2)) {
        this.stopAsked = this.t;
        this.refreshDisplay();
        return;
      }
      this.stopAsked = -1;
      if (this.mode === 'build') this.endBuild();
      else if (this.mode === 'play' || this.mode === 'count') this.stop();
      this.menu = 'songs';
      this.refreshDisplay();
      return;
    }
    // (three stars: again is a level up; key('play') does it)
    if (id === 'again') return this.key('play');
    if (id === 'next') {
      // the next song as written (after any)
      const i = this.machine ? (this.tracks.indexOf(this.machine.track) + 1) % this.tracks.length : this.nextSong();
      this.leaveResults();
      this.songSel = i;
      return this.playSong(i);
    }
    if (id === 'make') {
      // (a written-out song has no loop to build: Make a track starts the next loop track)
      const i = this.machine ? this.buildTracks.indexOf(this.machine.track) : -1;
      this.leaveResults();
      return this.beginBuild(i >= 0 ? i : this.nextBuild());
    }
    if (id === 'level' || id.startsWith('level:')) {
      // (the songs page has one button that steps through them)
      if (id === 'level') this.level = this.level === 'easy' ? 'normal' : this.level === 'normal' ? 'hard' : 'easy';
      else this.level = id === 'level:normal' ? 'normal' : id === 'level:hard' ? 'hard' : 'easy';
      this.stage.saveLevel?.(this.level);
      this.refreshDisplay();
      return;
    }
    if (id.startsWith('loop:')) {
      // free play's recorder (no unlock needed)
      if (this.mode !== 'discover') return;
      if (id === 'loop:rec') {
        if (this.looper.state === 'count' || this.looper.recording) return;
        this.startTake();
      } else if (id === 'loop:stop') this.looper.stop();
      else if (id === 'loop:play') this.looper.play(this.loopClock.beatAt(this.t));
      else if (id === 'loop:clear') this.looper.clear();
      this.refreshDisplay();
      return;
    }
    if (id.startsWith('set:')) {
      const k: Record<string, ModuleKey> = { 'set:slow': 'prev', 'set:onehand': 'next', 'set:contrast': 'jam', 'set:words': 'loop' };
      if (k[id]) this.key(k[id]);
      else if (id === 'set:backing') this.stage.setting('band', true);
      else if (id === 'set:light') this.stage.setting('light', true);
      this.refreshDisplay();
    }
  }

  /** What the panel needs beyond the lines: its screen, its buttons, the song card, what's on the desk, the song so far. */
  private panelFields(): void {
    const d = this.display;
    const page = this.settingsOpen || this.tuneOpen;
    d.screen = page ? 'page' : this.mode === 'discover' ? 'home' : this.mode === 'results' ? 'results' : 'song';
    d.songCard = null;
    d.inst = null;
    d.progress = -1;
    d.combo = 0;
    // a song's map for its progress bar (not when it's playing itself to you)
    d.map = this.perf && this.song && !this.listening && (this.mode === 'play' || this.mode === 'count') ? { beats: this.song.bars * 4, wild: this.perf.fills, second: this.perf.second } : null;
    if (d.screen === 'home') {
      const v = this.stage.shelf?.(0);
      this.songSel = Math.max(0, Math.min(this.songSel, this.tracks.length - 1));
      const tr = this.tracks[this.songSel];
      d.songCard = { name: tr.name, meta: `${tr.bpm} BPM${tr.minor ? ', minor' : ''}`, pos: `${this.songSel + 1}/${this.tracks.length}`, stars: this.progress.stars[tr.id] ?? 0 };
      const pitched = !!v && v.id !== 'drums';
      d.inst = v ? { id: v.id, name: v.name, detail: this.shelfWhat === 'scale' ? `Notes: ${v.scale}` : this.shelfWhat === 'sound' ? `Sound: ${v.sound}` : pitched ? `${v.scale} notes, ${v.sound}` : v.how } : null;
      d.keys = ['<', 'PLAY', '>', pitched ? 'NOTES' : '', pitched ? 'SOUND' : ''];
      d.keyLabels = null;
      if (this.found.includes('kit')) d.pulse = this.offered ? 'play' : d.pulse;
    } else if (d.screen === 'song') {
      d.keys = this.mode === 'build' ? ['BACK', 'STOP', '', '', ''] : this.mode === 'jam' ? ['', 'STOP', '', '', ''] : ['', 'STOP', '', '', ''];
      if (this.song && (this.mode === 'play' || this.mode === 'count')) d.progress = Math.max(0, this.clock.beatAt(this.t) / (this.song.bars * 4));
      d.combo = this.combo;
    } else if (d.screen === 'results') {
      d.keys = ['', 'AGAIN', this.fromPerform ? (this.machine?.written && !this.machine.track.score ? 'MAKE IT\nYOURS' : 'NEXT\nSONG') : '', '', ''];
    }
    // the page
    const v = this.stage.shelf?.(0) ?? { id: 'drums', name: 'Drums', how: '', scale: '', sound: '', oct: 0 };
    const pageId: PageId = this.tuneOpen ? 'tune' : this.settingsOpen ? 'settings' : this.mode === 'discover' ? this.menu : this.mode === 'build' ? 'build' : this.mode === 'results' ? 'results' : this.paused && (this.mode === 'play' || this.mode === 'count') ? 'pause' : 'song';
    const band = this.stage.bandState?.() ?? { state: 'idle', players: 1 };
    const sw = this.machine ? SWITCH_ORDER.filter((i) => i === 'drums' || i === 'guitar' || this.machine!.parts.some((p) => plays(i, p.def.name) && p.def.name !== 'BASS')) : [];
    d.page = buildPage({
      page: pageId,
      line: pageId === 'free' ? (this.loopLine() || (this.groove ? `The band's with you, ${Math.round(60 / this.clock.spb)} bpm` : this.offered && this.found.includes('kit') ? 'Ready? Try Songs' : '')) : pageId === 'main' ? (this.found.includes('kit') ? "Play what's on the desk, or pick a song" : 'Tap the desk to start') : d.line,
      // (the songs page's line: your turn after a listen, or the band being asked)
      sub: pageId === 'songs' ? (this.t - this.bandWait < 4 ? 'Asking the band to start it' : this.afterListen ? 'Your turn' : '') : d.sub,
      inst: { id: v.id, name: v.name, scale: v.scale, sound: v.sound, oct: v.oct ?? 0, how: v.how, key: v.key ?? '', pieces: v.pieces ?? 'full' },
      // (each tile: its name, then how hard it is and who wrote it, in what groove; the first says start here)
      songs: this.tracks.map((t, i) => ({ name: t.name, meta: i === 0 && !this.performed(t.id) ? 'Start here' : t.score ? `${t.score.difficulty} · ${t.score.tune.by}` : 'New every day', stars: this.progress.stars[t.id] ?? 0, locked: false })),
      songSel: this.songSel,
      songShown: this.shownSongs(),
      songPage: this.shownPage(),
      songFilter: this.songFilter,
      level: this.level,
      band: { state: band.state, code: this.code, players: band.players, message: band.message },
      loop: { state: this.looper.state, layers: this.looper.layers.length, recording: this.looper.recording },
      settings: { slow: this.opts.tempo < 0.95, oneHand: this.stage.setting('oneHand', false), contrast: this.stage.setting('contrast', false), words: this.stage.setting('words', false), backing: this.stage.setting('band', false), light: this.stage.setting('light', false) },
      next: this.fromPerform ? 'Next\nsong' : '',
      make: this.fromPerform && !!this.machine?.written && !this.machine.track.score,
      harder: this.mode === 'results' && this.fromPerform && this.lastBest.wasEasy3 && this.level !== 'hard' ? (this.level === 'easy' ? 'NORMAL' : 'HARD') : '',
      perform: this.mode === 'build' && !!this.bld && this.bld.phase === 'run' && this.bld.dropAt <= 0,
      sure: this.stopAsked > 0 && this.t - this.stopAsked < 2,
      switchable: sw,
      tune: d.keyLabels ?? undefined,
    });
    d.focus = pageId === 'songs' ? 'play' : (pageId === 'main' || pageId === 'free') && this.found.includes('kit') && this.offered ? 'nav:songs' : pageId === 'results' && this.resultsStage >= 4 ? 'again' : undefined;
  }

  private fillDisplay(): void {
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
      d.sub = '';
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
    // the shelf just changed: what's on the desk now (and its notes or sound)
    if (this.mode === 'discover' && this.shelfShown && this.t < this.shelfUntil) {
      const v = this.shelfShown;
      d.line = v.name;
      d.sub = this.shelfWhat === 'scale' ? `Notes: ${v.scale}` : this.shelfWhat === 'sound' ? `Sound: ${v.sound}` : v.how;
      d.keyLabels = v.id === 'drums' ? null : ['', '', '', 'NOTES', 'SOUND'];
      return;
    }
    this.shelfWhat = '';
    if (this.mode === 'discover' && this.stage.shelf && this.found.includes('kit') && this.stage.shelf(0).id !== 'drums') d.keyLabels = ['', '', '', 'NOTES', 'SOUND'];
    if (this.mode === 'discover' && this.offered) {
      const song = this.tracks[this.nextSong()];
      d.line = 'Play a song?';
      d.sub = `${song.name}: tap ▶`;
      d.pulse = 'play';
      d.stars = this.progress.stars[song.id] ?? 0;
      return;
    }
    switch (this.mode) {
      case 'discover':
        if (!this.offered) {
          // first the desk; once the drums are out, what's on the desk and how to get more
          const out = this.found.includes('kit') && this.stage.shelf ? this.stage.shelf(0) : null;
          d.line = out ? out.name : this.found.includes('kit') ? 'Hit something' : this.stage.shelf ? 'Pick one' : 'Tap the desk';
          d.sub = out ? 'Instruments swaps it for another' : 'Tap the desk with your hand';
        } else {
          d.line = sel.name;
          const need = wants(sel.parts);
          const have = this.found.filter((f) => f !== 'kit').length;
          const jamNew = un.includes('jam') && !this.jammed;
          d.sub = this.lastFound && this.found.length < 2
            ? found(this.lastFound)
            : this.weakRuns >= 2 && this.opts.tempo > 0.95
              ? 'Slower? Settings, Slower songs'
              : have < need
                ? 'Songs, then Play'
                : 'Songs, then Play';
          d.pulse = jamNew ? 'jam' : 'play';
          d.stars = this.progress.stars[sel.id] ?? 0;
        }
        break;
      case 'count':
        if (this.perf) {
          d.line = this.song!.name;
          d.sub = this.listening ? 'Just listen' : this.afterListen ? 'Your turn' : 'Hit what lights up';
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
          const inFill = within(this.perf.fills, b, 0);
          const big = b < this.perf.big;
          const joins = !!this.perf.joins && b >= 12 && b < 16;
          if (this.perf.queued || this.perf.graceTo > 0) {
            // a switch: what's coming, then a bar to find it
            const nm = INST_NAME[this.perf.queued ?? this.perf.inst] ?? '';
            d.line = this.perf.queued ? this.song!.name : nm;
            d.sub = this.perf.queued ? `${nm} next` : 'Find it, then join in';
            d.meter = this.energy;
            break;
          }
          if (this.listening) {
            d.line = this.song!.name;
            d.sub = 'Listen, then it\'s your turn';
            break;
          }
          if (this.finalWait >= 0) {
            d.line = 'Bring it home';
            d.sub = 'One big hit on the glowing one';
            break;
          }
          d.line = inFill ? 'Solo!' : big ? "Band's back in" : b >= this.perf.holdFrom ? 'No lights: keep going' : this.song!.name;
          d.sub = inFill ? "They've dropped out. Hit lots, anything" : big ? 'Follow the lights' : b >= this.perf.holdFrom ? this.perf.track.score && this.perf.inst !== 'drums' ? 'You know how it goes' : 'Keep the beat going, any drum' : joins ? `${this.perf.joins} comes in next` : 'Hit what glows';
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
        d.line = this.fromPerform ? `${this.lastBest.song}: ${this.lastBest.pct}%` : `${s.perfect + s.good} of ${s.total} notes`;
        d.stars = s.stars;
        d.best = this.fromPerform ? this.lastBest : null;
        if (this.replaying) {
          // your best two bars come back round with the band: that's all the panel says until they're done
          d.line = 'That was you';
          d.sub = 'Your best two bars, with the band';
          d.stars = -1;
          d.best = null;
          d.pulse = null;
          break;
        }
        d.map = null;
        // how it felt in time: a number when it was close, a word that says which way when it wasn't
        const feel = this.lastTight >= 70 ? 'Nicely on the beat' : this.lastLean < 0 ? 'A bit ahead of the beat' : this.lastLean > 0 ? 'A bit behind the beat' : 'Try Listen first next time';
        // (only what you can see: a tom on the kit; the rest is the old box's and stays quiet)
        const fresh = this.newUnlocks.includes('tom') ? unlockLine('tom') : '';
        const next = this.fromPerform;
        if (st <= 1) d.sub = this.fromPerform && this.lastTight >= 0 ? feel : '';
        else if (st === 2 && this.fromPerform && this.carried) d.sub = this.carried;
        else if (st <= 3 && fresh) d.sub = fresh;
        else d.sub = '';
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
      for (const s of steps(bl.track.parts[bl.part].pattern, bl.track.swing)) {
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
      // (on a song's melody nothing is wholly yours: its solo goes on the tonic)
      const live = this.perf.live.size ? [...this.perf.live] : (this.perf.final ?? ['kit:kick']);
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
  // (a solo is one bar: five of its eight eighths, mostly on them)
  return { slots, onGrid, good: slots >= 4 && onGrid >= 0.4 };
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

/** The free-play band's chords, a bar each: the scale's first chord twice, then its second and third. */
const GROOVE = [0, 0, 1, 2];

const INST_NAME: Record<string, string> = { drums: 'Drums', piano: 'Piano', marimba: 'Marimba', handpan: 'Handpan', guitar: 'Guitar', congas: 'Congas' };

/** Which instrument each part is played on (it comes out on the desk when the part is asked for). */
const PART_INST: Record<string, string> = { KICK: 'drums', SNARE: 'drums', HAT: 'drums', CLAP: 'drums', PERC: 'handpan', 'PERC 2': 'handpan', KEYS: 'piano', 'KEYS 2': 'piano', BASS: 'piano' };
/** Is beat b inside one of these stretches (from `early` beats before each)? (A plain loop: it runs every frame.) */
function within(spans: readonly (readonly [number, number])[], b: number, early: number): boolean {
  for (let i = 0; i < spans.length; i++) if (b >= spans[i][0] - early && b < spans[i][1]) return true;
  return false;
}
/** Bars 9–12 (beats 32–48): the song's chords change (IV–ii in major, VI–VII in minor), then it comes home. */
const CHANGE = [32, 48] as const;
/**
 * A song's chord in bar `bar`: its own two in turn, and in a performance the second half's change, all major (the
 * pentatonic tune fits over every one), back home on bar 13.
 */
function songChord(t: TrackDef, bar: number, perform: boolean): { root: number; minor: boolean } {
  if (perform && bar * 4 >= CHANGE[0] && bar * 4 < CHANGE[1]) return { root: t.chords[0] + (t.minor ? [8, 10] : [5, 2])[bar % 2], minor: !t.minor && bar % 2 === 1 };
  const i = bar % t.chords.length;
  return { root: t.chords[i], minor: !!t.minorChords?.includes(i) };
}
/** The song's second half (the tune two notes up, every other time round): bars 9–12, before the second solo. */
const SECOND = [32, 48] as const;
/** Where the last hit lights: the instrument's biggest note. */
const FINAL_KEYS: Record<string, readonly string[]> = { drums: ['kit:kick', 'kit:snare'], piano: ['piano:0'], marimba: ['marimba:0'], guitar: ['guitar:9'], handpan: ['handpan:0'], congas: ['congas:0', 'congas:2'] };
/**
 * The congas, by where the note falls in the bar: the backbeat (2 and 4) a slap on the high drum, 1 and 3 its open
 * tone, anything between on the low drum. The same place, the same stroke, every bar.
 */
function congaAt(b: number, halfTime = false): string {
  const x = ((b % 4) + 4) % 4;
  // (a half-time song's backbeat is on 3)
  if (Math.abs(x - Math.round(x)) < 0.1) return (halfTime ? Math.round(x) === 2 : Math.round(x) % 2 === 1) ? 'congas:3' : 'congas:2';
  return 'congas:0';
}
/** A note `by` steps up its instrument (turning back down at the top), for the B section. */
const TOP: Record<string, number> = { piano: 13, marimba: 7, handpan: 8 };
function lift(key: string, by: number): string {
  const i = key.indexOf(':');
  const inst = key.slice(0, i);
  const top = TOP[inst];
  const z = Number(key.slice(i + 1));
  if (top === undefined || !(z >= 0 && z <= top)) return key;
  const up = z + by <= top ? z + by : z - by;
  // (the handpan's ding, zone 0, stays the ding)
  return `${inst}:${inst === 'handpan' ? Math.max(1, up) : Math.max(0, up)}`;
}
/** Which instruments a song can be switched to mid-song, in order, and whether one plays a written part. */
/** Songs on a page of the panel (two across, three down). */
const SONGS_A_PAGE = 6;
const SWITCH_ORDER = ['drums', 'piano', 'marimba', 'handpan', 'congas', 'guitar'];
const plays = (inst: string, part: string): boolean => (inst === 'congas' ? part.startsWith('PERC') : PART_INST[part] === (inst === 'marimba' ? 'piano' : inst));

/** Things that ring (a hat on them sounds right) and things that knock (a snare). */
const RINGS = new Set<string>(['bell', 'tubular', 'glock', 'triangle', 'ride', 'cowbell', 'bowl', 'tongue']);
const KNOCKS = new Set<string>(['block', 'clave', 'slit', 'cajon', 'frame', 'congas', 'snare']);

/** What the module asks for each part. */
const ASK: Record<string, string> = {
  KICK: 'Hit a drum for BOOM',
  SNARE: 'Pick the smack',
  HAT: 'Pick the tick',
  PERC: 'Tap the glowing note',
  KEYS: 'Tap the glowing key',
  BASS: 'Pick the low notes',
  'PERC 2': 'Another note on this one',
  CLAP: 'Clap your hands',
  'KEYS 2': 'A high key this time',
};

/** What a part is called where people read it: what it sounds like, not drummer's words. */
const SAY: Record<string, string> = { KICK: 'BOOM', SNARE: 'SMACK', HAT: 'TICK', CLAP: 'CLAP', PERC: 'EXTRA', 'PERC 2': 'EXTRA 2', KEYS: 'TUNE', 'KEYS 2': 'HIGH TUNE', BASS: 'BASS' };
export function say(part: string): string {
  return SAY[part] ?? part;
}

const NO_KEYS: ModuleKey[] = [];
const LOOP_LOCKED: ModuleKey[] = ['loop'];
const JAM_LOCKED: ModuleKey[] = ['jam'];
const BOTH_LOCKED: ModuleKey[] = ['jam', 'loop'];

function unlockLine(u: Unlock): string {
  return u === 'tom' ? 'New: a tom on the desk' : u === 'loops' ? 'New: REC loops what you play' : u === 'swaps' ? 'New: pinch and hold to change' : 'New: JAM with a bandmate';
}
