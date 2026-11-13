/**
 * The game (DESIGN.md §2, §3.5–3.7): Discover is where you start and free play is always on (anything you
 * hit plays its instrument); songs are chosen on the module and cast onto your room's instruments;
 * results give stars and unlocks, then it's back to playing your room.
 *
 * Time is the game clock (seconds; the audio clock while audio runs). The game talks to the world only
 * through `GameStage` and `Room`, so unit tests drive it with fakes and a bot.
 */
import { TIMING } from '../config.js';
import { oneHanded, secPerBeat, type BedEvent, type Song } from '../songs/chart.js';
import { EventCursor, SongClock } from '../songs/sequencer.js';
import { NoteJudge, windows, type Grade, type JudgeNote, type Summary } from '../songs/judge.js';
import { SONGS, dailySong } from '../songs/songs.js';
import { cast, noteKey, wants, type Cast, type RoomInstrument } from '../songs/cast.js';
import { bed } from '../songs/chart.js';
import { Bandmate } from '../bandmate/bandmate.js';
import { Looper } from './looper.js';
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
}

export type Mode = 'discover' | 'count' | 'play' | 'results' | 'jam';

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
  readonly display: Display = { line: 'Hit anything', sub: 'Your room is an orchestra', found: [], total: 0, meter: -1, stars: -1, pulse: null, count: 0, day: 0, gold: false, code: '', keyLabels: null, locked: [] };
  /** The settings page is up on the module (tap ◀ twice; ▶ closes it). */
  settingsOpen = false;
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
    if (k === 'prev' && twice && this.mode !== 'play' && this.mode !== 'count' && this.mode !== 'jam') {
      // tap ◀ twice: the settings page (and the first tap's step back is undone)
      if (this.mode === 'discover') this.selected = (this.selected + 1) % this.available();
      this.settingsOpen = true;
      this.lastTap[k] = -9;
      this.refreshDisplay();
      return;
    }
    if (k === 'prev' || k === 'next') {
      if (this.mode === 'play' || this.mode === 'count') return;
      const n = this.available();
      this.selected = (this.selected + (k === 'next' ? 1 : n - 1)) % n;
      this.refreshDisplay();
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
        this.display.sub = 'After Kitchen Clock';
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
      else if (!(this.progress.unlocks as string[]).includes('jam')) this.display.sub = 'After Porch Step';
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
    if (this.mode === 'results' && t - this.modeT > 4) this.leaveResults();
    if (this.mode === 'jam' && this.mate) return this.hitJam(key, t, gain);
    if (this.mode === 'discover' && this.looper.recording) this.looper.hear(this.loopClock.beatAt(t - this.opts.offset), key, gain);
    if ((this.mode !== 'play' && this.mode !== 'count') || !this.judge) return null;
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
      if (!this.offered && (this.found.length >= 2 || (this.kitAt >= 0 && t - this.kitAt > 25))) {
        this.offered = true;
        this.refreshDisplay();
      }
      return;
    }
    if (this.mode === 'jam') {
      this.tickJam(t);
      return;
    }
    if (this.mode === 'results') {
      // the stars fill one at a time; the results stay until you play on (or a while passes)
      const shown = Math.min(this.last?.stars ?? 0, Math.floor((t - this.modeT) / 0.45));
      if (shown !== this.display.stars) {
        this.display.stars = shown;
      }
      // the notes you played count up under it for the first second
      if (t - this.modeT < 1.3 && this.last) {
        const k = Math.min(1, (t - this.modeT) / 1.1);
        const n = Math.round((this.last.perfect + this.last.good) * (1 - Math.pow(1 - k, 3)));
        this.display.sub = `${n} of ${this.last.total}`;
      } else if (this.display.sub.endsWith(` of ${this.last?.total ?? -1}`) && t - this.modeT < 1.6) {
        const st = this.display.stars;
        this.refreshDisplay();
        this.display.stars = st;
      }
      this.tickEncore(t);
      if (t - this.modeT >= 15) this.leaveResults();
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
      if (n.grade === null && d <= TIMING.glowBeats && d > -0.3) this.stage.light(n.lane, 1 - Math.max(0, d) / TIMING.glowBeats);
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
    if (beat >= song.bars * 4 + 1) this.end();
  }

  private leaveResults(): void {
    this.encoreAt = -1;
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
    switch (this.mode) {
      case 'discover':
        if (!this.offered) {
          d.line = 'Hit anything';
          d.sub = this.lastFound ? found(this.lastFound) : 'Your room is an orchestra';
        } else {
          d.line = sel.name;
          const need = wants(sel.parts);
          const have = this.found.filter((f) => f !== 'kit').length;
          const jamNew = un.includes('jam') && !this.jammed;
          d.sub = this.lastFound && this.found.length < 2
            ? found(this.lastFound)
            : jamNew
              ? 'Tap JAM: a bandmate joins'
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
        d.line = this.song!.name;
        d.sub = this.song!.id in this.progress.stars ? `${Math.round(this.song!.bpm * this.opts.tempo)} bpm` : 'Hit what lights up';
        d.count = Math.max(1, Math.min(4, Math.ceil(-this.clock.beatAt(this.t))));
        break;
      case 'play':
        d.line = this.song!.name;
        d.sub = this.song!.id in this.progress.stars ? `${Math.round(this.song!.bpm * this.opts.tempo)} bpm` : 'Hit what lights up';
        d.meter = this.energy;
        break;
      case 'jam':
        d.line = 'Jam';
        d.sub = this.jamPhase === 'turn' ? 'Your turn' : this.jamCycle === 0 ? (this.code ? "Friend's phone: or-6.github.io/thump" : 'Listen first') : 'Listen';
        d.pulse = 'jam';
        d.meter = this.jamShares.length ? this.jamShares[this.jamShares.length - 1] : -1;
        break;
      case 'results': {
        const s = this.last!;
        d.line = s.stars === 3 ? 'In the pocket' : s.stars === 2 ? 'Nearly there' : 'Once more?';
        d.stars = s.stars;
        const next = this.selected < this.available() ? this.songAt(this.selected) : null;
        d.sub = this.newUnlocks.length > 1 ? (this.newUnlocks.includes('jam') ? 'A tom, a bandmate, and swaps' : unlockLine(this.newUnlocks[this.newUnlocks.length - 1])) : this.newUnlocks.length ? unlockLine(this.newUnlocks[0]) : next && next !== this.song ? `Next: ${next.name}` : `${s.perfect + s.good} of ${s.total} notes`;
        break;
      }
    }
  }

  /** Notes due between game times a and b (the autoplayer, for tests and filming only). */
  dueBetween(a: number, b: number, fn: (key: string) => void): void {
    if (this.mode === 'jam') {
      if (this.jamPhase !== 'turn') return;
      for (const n of this.jamAnswer) {
        const due = this.clock.timeAt(n.beat) + this.opts.offset;
        if (!n.hit && due > a && due <= b) fn(n.key);
      }
      return;
    }
    if (!this.judge) return;
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
  return f.label ? `${cap(f.label)}: ${FAMILIES[f.family].name}` : cap(FAMILIES[f.family].name);
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const NO_KEYS: ModuleKey[] = [];
const LOOP_LOCKED: ModuleKey[] = ['loop'];
const JAM_LOCKED: ModuleKey[] = ['jam'];
const BOTH_LOCKED: ModuleKey[] = ['jam', 'loop'];

function unlockLine(u: Unlock): string {
  return u === 'tom' ? 'New: a tom on your table' : u === 'loops' ? 'New: REC loops what you play' : u === 'swaps' ? 'New: pinch and hold to change a sound' : 'New: JAM with a bandmate';
}
