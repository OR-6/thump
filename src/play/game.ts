/**
 * The game (PLAN §2, §3.5–3.7): Discover is where you start and free play is always on (anything you
 * hit plays its instrument); songs are chosen on the module and cast onto your room's instruments;
 * results give stars and unlocks, then it's back to playing your room.
 *
 * Time is the game clock (seconds; the audio clock while audio runs). The game talks to the world only
 * through `GameStage` and `Room`, so unit tests drive it with fakes and a bot.
 */
import { TIMING } from '../config.js';
import { secPerBeat, type BedEvent, type Song } from '../songs/chart.js';
import { EventCursor, SongClock } from '../songs/sequencer.js';
import { NoteJudge, windows, type Grade, type JudgeNote, type Summary } from '../songs/judge.js';
import { SONGS } from '../songs/songs.js';
import { cast, noteKey, wants, type Cast, type RoomInstrument } from '../songs/cast.js';
import { FAMILIES, type Family } from '../room/classify.js';
import { dayKey, type Progress } from '../persistence/progress.js';
import type { Display, ModuleKey } from '../ui/module.js';

export type Unlock = 'tom' | 'jam' | 'loops' | 'swaps';
/** Unlocked by finishing each song the first time. */
export const UNLOCK_AFTER: Record<string, Unlock[]> = {
  'porch-step': ['tom'],
  'kitchen-clock': ['jam'],
  'night-bus': ['loops'],
  'big-room': ['swaps'],
};

export interface GameStage {
  /** The backing band: one event at game time `at`. */
  band(e: BedEvent, at: number, spb: number): void;
  /** Light the target `key` ("surface:zone") this frame (0..1). */
  light(key: string, k: number): void;
  /** A celebration: a light sweep across every instrument (and the crowd of lights on the module). */
  celebrate(stars: number): void;
  /** Re-pitch the room's melodic instruments into a key (pitch class). */
  retune(keyPc: number): void;
  save(p: Progress): void;
  /** Something new: the tom slides onto the table, JAM lights up… */
  unlock(u: Unlock): void;
}

/** The room as the game sees it. */
export interface Room {
  /** Discovered instruments (surface id + family + zone count), the kit excluded. */
  instruments(): RoomInstrument[];
  /** Zone count of a surface ('keys' and room surfaces). */
  zones(surface: string): number;
}

export type Mode = 'discover' | 'count' | 'play' | 'results';

export interface MoteView {
  key: string;
  /** Beats until due (+) or since (−). */
  ahead: number;
  grade: Grade | null;
}

export interface GameOptions {
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
  readonly display: Display = { line: 'Hit anything', sub: 'Your room is an orchestra', found: [], total: 0, meter: -1, stars: -1, pulse: null };
  private t = 0;
  private modeT = 0;
  private bedCursor: EventCursor<BedEvent> | null = null;
  private tempoAtStart = 1;
  private lastFound: { family: Family; label: string } | null = null;
  private offered = false;
  private newUnlocks: Unlock[] = [];
  private kitAt = -1;

  constructor(
    private stage: GameStage,
    public progress: Progress,
    private room: Room,
    public opts: GameOptions = { tempo: 1, offset: 0 },
  ) {
    this.selected = Math.min(this.available() - 1, Math.max(0, progress.next));
  }

  /** How many songs you can choose (the next one unlocks as you finish each). */
  available(): number {
    let n = 1;
    for (let i = 0; i < SONGS.length - 1; i++) if (SONGS[i].id in this.progress.stars) n = i + 2;
    return Math.min(SONGS.length, n);
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

  /** A module key was tapped. */
  key(k: ModuleKey): void {
    if (k === 'prev' || k === 'next') {
      if (this.mode === 'play' || this.mode === 'count') return;
      const n = this.available();
      this.selected = (this.selected + (k === 'next' ? 1 : n - 1)) % n;
      this.refreshDisplay();
      return;
    }
    if (k === 'play') {
      if (this.mode === 'play' || this.mode === 'count') this.stop();
      else this.begin(this.selected);
    }
  }

  /** Start song `i`, cast onto the room as it is now. */
  begin(i: number): void {
    const song = SONGS[i];
    if (!song) return;
    this.song = song;
    this.selected = i;
    this.offered = true;
    this.cast = cast(song.parts, this.room.instruments());
    this.stage.retune(song.key);
    const notes: JudgeNote[] = song.notes.map((n) => ({ beat: n.beat, lane: noteKey(n, this.cast, (s) => this.room.zones(s)), vel: n.vel }));
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
    this.mode = 'discover';
    this.song = null;
    this.judge = null;
    this.bedCursor = null;
    this.moteCount = 0;
    this.stage.retune(0);
    this.refreshDisplay();
  }

  /** The player hit target `key` at game time `t`. */
  hit(key: string, t: number, gain: number): Grade | 'extra' | null {
    void gain;
    if ((this.mode !== 'play' && this.mode !== 'count') || !this.judge) return null;
    const at = t - this.opts.offset - this.clock.start;
    const r = this.judge.hit(key, at);
    if (!r) {
      this.graded.extra++;
      return 'extra';
    }
    this.graded[r.grade === 'perfect' ? 'perfect' : 'good']++;
    this.offsets.push(r.offset);
    this.energy = Math.min(1, this.energy + (r.grade === 'perfect' ? 0.05 : 0.03));
    return r.grade;
  }

  tick(t: number): void {
    this.t = t;
    if (this.mode === 'discover') {
      // the first song is offered once there are two instruments (or the table alone has had a while)
      if (!this.offered && (this.found.length >= 2 || (this.kitAt >= 0 && t - this.kitAt > 25))) {
        this.offered = true;
        this.refreshDisplay();
      }
      return;
    }
    if (this.mode === 'results') {
      if (t - this.modeT >= 5) {
        this.mode = 'discover';
        this.song = null;
        this.stage.retune(0);
        this.refreshDisplay();
      }
      return;
    }
    const song = this.song!;
    const beat = this.clock.beatAt(t);
    const spb = this.clock.spb;
    this.bedCursor?.pull(beat + TIMING.lookAheadS / spb, this.onBed);
    if (this.mode === 'count' && beat >= 0) {
      this.mode = 'play';
      this.refreshDisplay();
    }
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

  private onBed = (e: BedEvent): void => this.stage.band(e, this.clock.timeAt(e.beat), this.clock.spb);
  private onMiss = (): void => {
    this.energy = Math.max(0.15, this.energy - 0.05);
  };

  private end(): void {
    const song = this.song!;
    const s = (this.last = this.judge!.summary());
    const p = this.progress;
    const i = SONGS.indexOf(song);
    const first = !(song.id in p.stars);
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
    for (const u of this.newUnlocks) this.stage.unlock(u);
    this.mode = 'results';
    this.modeT = this.t;
    this.moteCount = 0;
    this.judge = null;
    this.selected = Math.min(this.available() - 1, i + 1);
    this.refreshDisplay();
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
    const sel = SONGS[this.selected];
    switch (this.mode) {
      case 'discover':
        if (!this.offered) {
          d.line = 'Hit anything';
          d.sub = this.lastFound ? found(this.lastFound) : 'Your room is an orchestra';
        } else {
          d.line = sel.name;
          const need = wants(sel.parts);
          const have = this.found.filter((f) => f !== 'kit').length;
          d.sub = this.lastFound && this.found.length < 2 ? found(this.lastFound) : have < need ? `Tap play · find ${need - have} more` : 'Tap play';
          d.pulse = 'play';
          d.stars = this.progress.stars[sel.id] ?? 0;
        }
        break;
      case 'count':
        d.line = this.song!.name;
        d.sub = `${Math.round(this.song!.bpm * this.opts.tempo)} bpm · get ready`;
        break;
      case 'play':
        d.line = this.song!.name;
        d.sub = `${Math.round(this.song!.bpm * this.opts.tempo)} bpm`;
        d.meter = this.energy;
        break;
      case 'results': {
        const s = this.last!;
        d.line = s.stars === 3 ? 'Brilliant' : s.stars === 2 ? 'Lovely' : 'Song done';
        d.stars = s.stars;
        d.sub = this.newUnlocks.length ? unlockLine(this.newUnlocks[0]) : `${s.perfect + s.good} of ${s.total} notes`;
        break;
      }
    }
  }

  /** Notes due between game times a and b (the autoplayer, for tests and filming only). */
  dueBetween(a: number, b: number, fn: (key: string) => void): void {
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
    // the band's look-ahead already handed out may play during the clicks; skip ahead of it
    this.bedCursor?.seek(beat + 2);
    this.stage.band({ beat, voice: 'shaker', midi: 0, len: 0.2, vel: 0.9 }, t + 0.05, spb);
    this.stage.band({ beat: beat + 1, voice: 'shaker', midi: 0, len: 0.2, vel: 0.9 }, t + 0.05 + spb, spb);
  }

  /** Mode and seconds in it (debug). */
  get since(): number {
    return this.t - this.modeT;
  }
}

function found(f: { family: Family; label: string }): string {
  const what = f.label ? `${cap(f.label)} · ` : '';
  return `${what}${FAMILIES[f.family].name}`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function unlockLine(u: Unlock): string {
  return u === 'tom' ? 'New: a tom on your table' : u === 'jam' ? 'New: jam with a bandmate' : u === 'loops' ? 'New: loops' : 'New: move instruments';
}
