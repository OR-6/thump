/**
 * The game's flow: the first ten minutes (PLAN §2) and everything after.
 *
 *   first kick → snare slides in → copy "boom · tak · boom · tak" → a groove loops under you →
 *   the hat → copy "boom · tss · tak · tss" → the crowd arrives → Porch Step → stars → the tom →
 *   Kitchen Clock → the gong → the bandmate → Call & Answer → arrange your kit, the phone → the
 *   song list on the desk.
 *
 * Nothing waits on text: a pad lights, you hit it. The flow never deadlocks: a copy that doesn't
 * land after three tries passes anyway, a pad asking for a hit moves on after a while, and every
 * song plays to its end (no fail state).
 *
 * Time is the game clock (seconds; the audio clock while audio runs). The flow talks to the world
 * only through `Stage`, so unit tests drive it with a fake stage and synthetic hits.
 */
import { TIMING, type Lane } from '../config.js';
import { grid, secPerBeat, type BedEvent, type Note, type Song } from '../songs/chart.js';
import { EventCursor, SongClock } from '../songs/sequencer.js';
import { NoteJudge, copyNeeds, windows, type Grade, type Summary } from '../songs/judge.js';
import { SONGS } from '../songs/songs.js';
import { Bandmate } from '../bandmate/bandmate.js';
import { FIRST_LANES, UNLOCK_AFTER, lanesFor, type Unlock } from './progression.js';
import { dayKey, type Progress } from '../persistence/progress.js';

export interface Stage {
  /** A pad appears: 'fade' at the start, 'slide' when it's new (it slides onto the table). */
  showPad(lane: Lane, how: 'fade' | 'slide'): void;
  /** Light a pad for this frame (0..1; the stage keeps the brightest asked for and fades it). */
  glow(lane: Lane, k: number): void;
  /** A demo note: the pad plays itself at game time `at` (sound and squash). */
  demo(lane: Lane, vel: number, at: number): void;
  /** The backing band: one event at game time `at`. */
  band(e: BedEvent, at: number, spb: number): void;
  /** The crowd: how many, and how lively (0..1). */
  crowd(count: number, energy: number): void;
  /** Crowd moments. */
  cheer(big: boolean): void;
  /** A felt card on the desk with a song's name (null: put it away). */
  title(song: Song | null): void;
  /** The ribbon with stars after a song (null: put it away). */
  stars(n: number | null, gold: boolean): void;
  /** A short paper tag on the table (≤ 6 words), or null. */
  hint(text: string | null): void;
  /** The bandmate: arrives, plays a note on its tiny drum (lane's voice) at `at`, or reacts. */
  bandmate(event: 'arrive' | 'happy' | 'turn' | 'listen', lane?: Lane, at?: number, vel?: number): void;
  /** The song cards on the desk (P0: after the third song). */
  songList(show: boolean): void;
  /** Something new to say about progress was saved. */
  save(p: Progress): void;
  /** Unlock beyond the pads: the arrange hint, the toy phone. */
  unlock(u: Unlock): void;
}

export type Phase =
  | 'idle'
  | 'first-kick'
  | 'meet'
  | 'copy-count'
  | 'copy-demo'
  | 'copy-turn'
  | 'groove'
  | 'title'
  | 'play'
  | 'results'
  | 'list';

/** A travelling note for the view: lane, how far along (0 at birth → 1 on the beat), and how it went. */
export interface ChipView {
  lane: Lane;
  /** Beats until due (+) or since (−). */
  ahead: number;
  grade: Grade | null;
  /** The bandmate's note (drawn on its side, not yours to hit). */
  theirs: boolean;
}

const MAX_CHIPS = 48;
const INTRO_BPM = 80;

/** One step of the plan the flow works through. */
type Step =
  | { kind: 'first-kick' }
  | { kind: 'meet'; lane: Lane }
  | { kind: 'copy'; pattern: Note[]; bpm: number; afterGroove: number; crowd?: boolean; song?: Song }
  | { kind: 'song'; index: number; song: Song }
  | { kind: 'unlock'; u: Unlock }
  | { kind: 'list' };

export interface FlowOptions {
  /** Tempo scale (slow mode 0.6–1). */
  tempo: number;
  /** Seconds the player's hits arrive late (+) by (tap-along or learned); subtracted before judging. */
  offset: number;
}

export class Flow {
  phase: Phase = 'idle';
  /** Pads on the table now. */
  readonly lanes: Lane[] = [];
  readonly chips: ChipView[] = Array.from({ length: MAX_CHIPS }, () => ({ lane: 'kick' as Lane, ahead: 0, grade: null, theirs: false }));
  chipCount = 0;
  /** The current song, while one is up. */
  song: Song | null = null;
  readonly clock = new SongClock();
  judge: NoteJudge | null = null;
  last: Summary | null = null;
  bandmate: Bandmate | null = null;
  /** Crowd size and liveliness (energy follows how you're doing; it never shames you). */
  crowd = 0;
  energy = 0.5;
  /** Debug/E2E: copy attempts on the current pattern, graded hits this song. */
  attempts = 0;
  readonly graded = { perfect: 0, good: 0, extra: 0 };
  /** Hits seen in the current copy turn, and its judge. */
  private turnJudge: NoteJudge | null = null;
  private turnLanes: Lane[] = [];
  private steps: Step[] = [];
  private stepT = 0;
  private t = 0;
  private bedCursor: EventCursor<BedEvent> | null = null;
  private demoCursor: EventCursor<Note> | null = null;
  private patternNotes: Note[] = [];
  private grooveUntil = 0;
  private grooveBed: BedEvent[] = [];
  private waitHit: Lane | null = null;
  private hitSeen = false;
  private callIdx = 0;
  private answerFrom = -1;
  private answerTo = -1;
  private theirNotes: Note[] = [];
  /** Offsets of hits in copy turns and songs, for learning the player's timing (s). */
  readonly offsets: number[] = [];
  private copyPassed = false;

  constructor(
    private stage: Stage,
    public progress: Progress,
    public opts: FlowOptions = { tempo: 1, offset: 0 },
  ) {}

  /** Unlocks as a set. */
  get unlocks(): Set<Unlock> {
    return new Set(this.progress.unlocks);
  }

  /** Start once the kit is on the table. */
  start(t: number): void {
    this.t = t;
    this.lanes.length = 0;
    this.steps = [];
    if (!this.progress.introDone) {
      this.addLane('kick', 'fade');
      this.steps.push(
        { kind: 'first-kick' },
        { kind: 'meet', lane: 'snare' },
        { kind: 'copy', pattern: grid({ kick: 'x...x...', snare: '..x...x.' }), bpm: INTRO_BPM, afterGroove: 2 },
        { kind: 'meet', lane: 'hat' },
        { kind: 'copy', pattern: grid({ kick: 'x.......', hat: '..x...x.', snare: '....x...' }), bpm: INTRO_BPM, afterGroove: 2, crowd: true },
      );
      this.queueSongsFrom(0);
    } else {
      for (const l of lanesFor(this.unlocks)) this.addLane(l, 'fade');
      this.crowd = this.progress.crowd;
      this.stage.crowd(this.crowd, this.energy);
      for (const u of this.progress.unlocks) if (u === 'arrange' || u === 'phone' || u === 'bandmate') this.stage.unlock(u);
      if (this.unlocks.has('bandmate')) this.stage.bandmate('arrive');
      this.queueSongsFrom(this.progress.next);
    }
    this.nextStep();
  }

  /** The guided order runs through the first three songs; after that you pick from the cards. */
  private guided = true;
  private turnSaid = false;

  private queueSongsFrom(i: number): void {
    this.guided = true;
    if (i < 3) this.steps.push({ kind: 'song', index: i, song: SONGS[i] });
    else this.steps.push({ kind: 'list' });
  }

  /** Play a song now (poked on the song list). */
  pickSong(index: number): void {
    const song = SONGS[index];
    if (!song || this.phase === 'play' || this.phase === 'title') return;
    this.stage.songList(false);
    this.guided = false;
    this.steps = [{ kind: 'song', index, song }];
    this.nextStep();
  }

  private addLane(lane: Lane, how: 'fade' | 'slide'): void {
    if (this.lanes.includes(lane)) return;
    this.lanes.push(lane);
    this.stage.showPad(lane, how);
  }

  private nextStep(): void {
    const s = this.steps.shift();
    this.stepT = this.t;
    this.song = null;
    this.judge = null;
    this.bedCursor = null;
    this.demoCursor = null;
    this.chipCount = 0;
    this.waitHit = null;
    this.hitSeen = false;
    if (!s) {
      this.phase = 'list';
      this.stage.songList(true);
      return;
    }
    this.current = s;
    switch (s.kind) {
      case 'first-kick':
        this.phase = 'first-kick';
        this.waitHit = 'kick';
        break;
      case 'meet':
        this.phase = 'meet';
        this.addLane(s.lane, 'slide');
        this.waitHit = s.lane;
        break;
      case 'copy':
        this.attempts = 0;
        this.beginCopy(s, true);
        break;
      case 'song':
        this.phase = 'title';
        this.song = s.song;
        this.stage.title(s.song);
        this.stage.stars(null, false);
        break;
      case 'unlock':
        this.applyUnlock(s.u);
        break;
      case 'list':
        this.phase = 'list';
        this.stage.songList(true);
        this.stage.hint('Poke a song to play');
        this.hintUntil = this.t + 4;
        break;
    }
  }
  private current: Step | null = null;
  private hintUntil = -1;

  private applyUnlock(u: Unlock): void {
    if (!this.progress.unlocks.includes(u)) this.progress.unlocks.push(u);
    this.stage.save(this.progress);
    if (u === 'tom' || u === 'gong') {
      this.phase = 'meet';
      this.addLane(u, 'slide');
      this.waitHit = u;
      return;
    }
    this.phase = 'meet';
    this.stage.unlock(u);
    if (u === 'bandmate') {
      this.stage.bandmate('arrive');
    } else if (u === 'arrange') {
      this.stage.hint('Pinch a pad to move it');
      this.hintUntil = this.t + 5;
    } else if (u === 'phone') {
      this.stage.hint("A friend's phone plays bass");
      this.hintUntil = this.t + 5;
    }
  }

  // ---------------------------------------------------------------- copy mode

  private beginCopy(s: Extract<Step, { kind: 'copy' }>, count: boolean): void {
    const spb = secPerBeat(s.bpm, this.opts.tempo);
    // bar −1: a count (four shaker ticks), bar 0: the pads play it, bar 1: your turn
    const start = this.t + 0.35 + (count ? 4 * spb : 0);
    this.clock.set(start, spb);
    this.patternNotes = s.pattern;
    this.demoCursor = new EventCursor(s.pattern);
    this.demoCursor.seek(0);
    const ticks: BedEvent[] = [];
    for (let b = count ? -1 : 0; b < 2; b++) for (let k = 0; k < 4; k++) ticks.push({ beat: b * 4 + k, voice: 'shaker', midi: 0, len: 0.25, vel: k === 0 ? 0.9 : 0.55 });
    this.bedCursor = new EventCursor(ticks);
    this.bedCursor.seek(-4);
    const turn = s.pattern.map((n) => ({ ...n, beat: n.beat + 4 }));
    const w = windows(this.opts.tempo < 0.95);
    this.turnJudge = new NoteJudge(turn, spb, { perfect: w.perfect * 1.5, good: w.good * 1.6 });
    this.turnLanes = [];
    this.phase = count ? 'copy-count' : 'copy-demo';
  }

  private tickCopy(): void {
    const s = this.current as Extract<Step, { kind: 'copy' }>;
    const beat = this.clock.beatAt(this.t);
    const spb = this.clock.spb;
    const ahead = TIMING.lookAheadS / spb;
    this.bedCursor?.pull(beat + ahead, (e) => this.stage.band(e, this.clock.timeAt(e.beat), spb));
    this.demoCursor?.pull(beat + ahead, (n) => this.stage.demo(n.lane, n.vel, this.clock.timeAt(n.beat)));
    if (this.phase === 'copy-count' && beat >= 0) this.phase = 'copy-demo';
    if (this.phase === 'copy-demo' && beat >= 4 - 0.15) this.phase = 'copy-turn';
    // the demo lights each pad as it plays; on a second try the pads also glow on your turn, as a guide
    for (const n of this.patternNotes) {
      const d = beat - n.beat;
      if (d > -0.15 && d < 0.6) this.stage.glow(n.lane, 1 - Math.max(0, d) / 0.6);
      if (this.attempts >= 1) {
        const dt = beat - (n.beat + 4);
        if (dt > -0.5 && dt < 0.3) this.stage.glow(n.lane, 0.45 * (1 - Math.abs(dt) / 0.5));
      }
    }
    if (this.phase === 'copy-turn' && beat >= 8 + this.turnJudge!.win.good / spb) {
      const j = this.turnJudge!;
      j.sweep(Infinity);
      const sum = j.summary();
      const got = sum.perfect + sum.good;
      const need = copyNeeds(this.patternNotes.length);
      // the right pads in the right order also pass, from the second try (the timing comes with the groove)
      const inOrder = this.attempts >= 1 && subsequence(this.patternNotes.map((n) => n.lane), this.turnLanes) >= need;
      const played = this.turnLanes.length > 0;
      if (got >= need || inOrder || this.attempts >= 2) {
        this.copyPassed = true;
        if (got >= need) this.stage.cheer(false);
        if (s.crowd) {
          this.crowd = Math.max(3, this.progress.crowd);
          this.stage.crowd(this.crowd, 0.7);
          this.stage.cheer(true);
        }
        if (s.song) {
          this.beginSong(s.song);
          return;
        }
        this.beginGroove(s.afterGroove);
        return;
      }
      // an empty turn doesn't count as a try: show it again, with the guide lights
      if (played) this.attempts++;
      else this.attempts = Math.max(1, this.attempts);
      this.beginCopy(s, false);
    }
  }

  /** The groove that loops under you once a copy lands: bass, chords and shaker for `bars` bars. */
  private beginGroove(bars: number): void {
    const spb = secPerBeat(INTRO_BPM, this.opts.tempo);
    const start = this.clock.timeAt(8);
    this.clock.set(start, spb);
    this.grooveBed = [];
    const roots = [60, 57];
    for (let b = 0; b < bars; b++) {
      const r = roots[b % 2];
      this.grooveBed.push({ beat: b * 4, voice: 'bass', midi: r - 24, len: 0.9, vel: 0.9 });
      this.grooveBed.push({ beat: b * 4 + 2, voice: 'bass', midi: r - 17, len: 0.9, vel: 0.7 });
      this.grooveBed.push({ beat: b * 4 + 1, voice: 'chord', midi: r, len: 0.4, vel: 0.45, minor: b % 2 === 1 });
      this.grooveBed.push({ beat: b * 4 + 3, voice: 'chord', midi: r, len: 0.4, vel: 0.45, minor: b % 2 === 1 });
      for (let k = 0; k < 8; k++) this.grooveBed.push({ beat: b * 4 + k / 2, voice: 'shaker', midi: 0, len: 0.1, vel: k % 2 ? 0.35 : 0.55 });
    }
    this.grooveBed.sort((a, b) => a.beat - b.beat);
    this.bedCursor = new EventCursor(this.grooveBed);
    this.bedCursor.seek(0);
    this.grooveUntil = bars * 4;
    this.phase = 'groove';
  }

  // ---------------------------------------------------------------- songs

  private beginSong(song: Song): void {
    const spb = secPerBeat(song.bpm, this.opts.tempo);
    this.song = song;
    this.clock.set(this.t + 0.3 + 4 * spb, spb);
    this.bedCursor = new EventCursor(song.bed);
    this.bedCursor.seek(-4);
    this.judge = new NoteJudge(song.notes, spb, windows(this.opts.tempo < 0.95));
    this.graded.perfect = this.graded.good = this.graded.extra = 0;
    this.theirNotes = [];
    this.callIdx = 0;
    this.answerFrom = this.answerTo = -1;
    this.bandmate = song.calls ? new Bandmate(this.lanes.filter((l) => l !== 'gong')) : null;
    this.energy = 0.5;
    this.phase = 'play';
    if (this.crowd < 3) {
      this.crowd = 3;
      this.stage.crowd(this.crowd, this.energy);
    }
  }

  private tickSong(): void {
    const song = this.song!;
    const beat = this.clock.beatAt(this.t);
    const spb = this.clock.spb;
    const ahead = TIMING.lookAheadS / spb;
    this.bedCursor?.pull(beat + ahead, (e) => this.stage.band(e, this.clock.timeAt(e.beat), spb));
    // call and answer: the bandmate plays its call (two bars), then you answer it
    if (song.calls && this.bandmate) {
      const c = song.calls[this.callIdx];
      if (c !== undefined && beat >= c * 4 - TIMING.travelBeats - 1) {
        const call = this.bandmate.call(c);
        for (const n of call) this.theirNotes.push(n);
        this.demoCursor = new EventCursor(this.theirNotes.slice().sort((a, b) => a.beat - b.beat));
        this.demoCursor.seek(beat);
        const ans = Bandmate.answer(call);
        this.judge!.add(ans);
        this.answerFrom = (c + 2) * 4;
        this.answerTo = (c + 4) * 4;
        this.turnSaid = false;
        this.callIdx++;
      }
      this.demoCursor?.pull(beat + ahead, (n) => this.stage.bandmate('listen', n.lane, this.clock.timeAt(n.beat), n.vel));
      if (this.answerTo > 0 && beat >= this.answerTo + 0.5) {
        let ok = 0;
        let all = 0;
        for (const n of this.judge!.notes) if (n.beat >= this.answerFrom && n.beat < this.answerTo) {
          all++;
          if (n.grade === 'perfect' || n.grade === 'good') ok++;
        }
        const share = all ? ok / all : 1;
        this.bandmate.report({ share });
        this.stage.bandmate(share >= 0.7 ? 'happy' : 'turn');
        this.answerTo = -1;
      }
      // "your turn": a chirp as each answer begins
      if (!this.turnSaid && this.answerFrom > 0 && beat >= this.answerFrom - 0.5 && beat < this.answerFrom) {
        this.stage.bandmate('turn');
        this.turnSaid = true;
      }
    }
    // a pad glows one beat before its note, brightest on the beat
    const j = this.judge!;
    j.sweep(this.t - this.opts.offset - this.clock.start, () => {
      this.energy = Math.max(0.15, this.energy - 0.06);
    });
    let k = 0;
    for (const n of j.notes) {
      const d = n.beat - beat;
      if (d > TIMING.travelBeats + 0.01) break;
      if (d < -0.6) continue;
      if (n.grade === null && d <= TIMING.glowBeats && d > -0.3) this.stage.glow(n.lane, 1 - Math.max(0, d) / TIMING.glowBeats);
      if (k < MAX_CHIPS) {
        const c = this.chips[k++];
        c.lane = n.lane;
        c.ahead = d;
        c.grade = n.grade;
        c.theirs = false;
      }
    }
    for (const n of this.theirNotes) {
      const d = n.beat - beat;
      if (d > TIMING.travelBeats || d < -0.4 || k >= MAX_CHIPS) continue;
      const c = this.chips[k++];
      c.lane = n.lane;
      c.ahead = d;
      c.grade = null;
      c.theirs = true;
    }
    this.chipCount = k;
    this.energy += (0.5 - this.energy) * 0.002; // settles back toward easy-going
    if (beat >= song.bars * 4 + 1) this.endSong();
  }

  private endSong(): void {
    const song = this.song!;
    const s = (this.last = this.judge!.summary());
    const p = this.progress;
    const i = SONGS.indexOf(song);
    const first = !(song.id in p.stars);
    p.stars[song.id] = Math.max(p.stars[song.id] ?? 0, s.stars);
    if (s.stars === 3 && this.opts.tempo >= 0.999) p.gold[song.id] = true;
    p.crowd = Math.max(p.crowd, Math.min(12, this.crowd));
    const today = dayKey();
    if (!p.days.includes(today)) p.days.push(today);
    if (i >= 0 && i + 1 > p.next) p.next = i + 1;
    p.introDone = true;
    this.learnOffset();
    this.stage.save(p);
    this.stage.stars(s.stars, !!p.gold[song.id] && s.stars === 3);
    this.stage.cheer(s.stars >= 2);
    this.phase = 'results';
    this.chipCount = 0;
    this.judge = null;
    // what comes next: first-time unlocks, then the next song in the guided order (or the cards)
    const after: Step[] = [];
    if (first) for (const u of UNLOCK_AFTER[song.id] ?? []) if (!p.unlocks.includes(u)) after.push({ kind: 'unlock', u });
    if (this.steps.length === 0) {
      if (this.guided && i >= 0 && i + 1 < 3) after.push({ kind: 'song', index: i + 1, song: SONGS[i + 1] });
      else after.push({ kind: 'list' });
    }
    this.steps.unshift(...after);
  }

  /** Learn a steady lateness (the headset's latency) from good hits, slowly, within ±150 ms. */
  private learnOffset(): void {
    if (this.offsets.length < 8) return;
    const o = this.offsets.slice().sort((a, b) => a - b);
    const med = o[Math.floor(o.length / 2)];
    this.opts.offset = Math.max(-0.15, Math.min(0.15, this.opts.offset + med * 0.5));
    this.offsets.length = 0;
  }

  // ---------------------------------------------------------------- input and time

  /** The player hit a pad at game time `t` (gain 0..1). */
  hit(lane: Lane, t: number, gain: number): Grade | 'extra' | null {
    void gain;
    const at = t - this.opts.offset;
    if (this.waitHit && lane === this.waitHit) this.hitSeen = true;
    if (this.phase === 'copy-turn' || this.phase === 'copy-demo') {
      if (this.phase === 'copy-turn' || this.clock.beatAt(at) > 3.5) {
        this.turnLanes.push(lane);
        const r = this.turnJudge?.hit(lane, at - this.clock.start);
        if (r) this.offsets.push(r.offset);
        return r?.grade ?? 'extra';
      }
      return null;
    }
    if (this.phase === 'play' && this.judge) {
      const r = this.judge.hit(lane, at - this.clock.start);
      this.bandmate?.hear({ lane, beat: this.clock.beatAt(at), vel: gain, offset: r?.offset ?? null });
      if (!r) {
        this.graded.extra++;
        return 'extra';
      }
      this.graded[r.grade === 'perfect' ? 'perfect' : 'good']++;
      this.offsets.push(r.offset);
      this.energy = Math.min(1, this.energy + (r.grade === 'perfect' ? 0.05 : 0.03));
      // the crowd grows with the song: one more friend every eight good notes
      const target = Math.min(12, Math.max(3, this.progress.crowd) + Math.floor((this.graded.perfect + this.graded.good) / 8));
      if (target > this.crowd) {
        this.crowd = target;
        this.stage.cheer(false);
      }
      this.stage.crowd(this.crowd, this.energy);
      return r.grade;
    }
    return null;
  }

  /** Advance to game time `t`. */
  tick(t: number): void {
    const dt = Math.max(0, t - this.t);
    this.t = t;
    if (this.hintUntil > 0 && t >= this.hintUntil) {
      this.hintUntil = -1;
      this.stage.hint(null);
    }
    switch (this.phase) {
      case 'idle':
      case 'list':
        return;
      case 'first-kick':
      case 'meet': {
        // the new pad lights twice, in time, every two bars, until it's hit (PLAN §2 0:15)
        const since = t - this.stepT;
        const lane = this.waitHit;
        if (lane) {
          const spb = secPerBeat(INTRO_BPM);
          const ph = (since - 0.6) / spb; // beats into the pulse cycle
          const inCycle = ((ph % 8) + 8) % 8;
          for (const b of [0, 1]) {
            const d = inCycle - b;
            if (ph > 0 && d > -0.1 && d < 0.6) this.stage.glow(lane, 1 - Math.max(0, d) / 0.6);
          }
        }
        // hit: a moment to enjoy it, then on. Not hit: move on after a while (never stuck).
        if (this.hitSeen) {
          if (this.doneAt < 0) this.doneAt = t + (this.phase === 'first-kick' ? 1.6 : 0.9);
        } else if (since > (lane ? 25 : 2.5)) this.doneAt = t;
        if (this.doneAt > 0 && t >= this.doneAt) {
          this.doneAt = -1;
          this.nextStep();
        }
        return;
      }
      case 'copy-count':
      case 'copy-demo':
      case 'copy-turn':
        this.tickCopy();
        return;
      case 'groove': {
        const beat = this.clock.beatAt(t);
        const spb = this.clock.spb;
        this.bedCursor?.pull(beat + TIMING.lookAheadS / spb, (e) => this.stage.band(e, this.clock.timeAt(e.beat), spb));
        if (beat >= this.grooveUntil - 0.2) this.nextStep();
        return;
      }
      case 'title':
        if (t - this.stepT >= 2.2) {
          this.stage.title(null);
          const song = this.song!;
          const idx = SONGS.indexOf(song);
          // each song after the first opens with its pattern to copy, the first time you play it
          if (idx > 0 && !(song.id in this.progress.stars)) {
            this.current = { kind: 'copy', pattern: song.copy, bpm: song.bpm, afterGroove: 0, song };
            this.attempts = 0;
            this.beginCopy(this.current, true);
          } else this.beginSong(song);
        }
        return;
      case 'play':
        this.tickSong();
        return;
      case 'results':
        if (t - this.stepT >= 0 && this.resultsAt < 0) this.resultsAt = t;
        if (t - this.resultsAt >= 4) {
          this.resultsAt = -1;
          this.stage.stars(null, false);
          this.nextStep();
        }
        void dt;
        return;
    }
  }
  private doneAt = -1;
  private resultsAt = -1;

  /** Seconds a pause lasted: the song waits, then a two-beat count-in brings it back (PLAN §3.12). */
  resumeAfterPause(t: number): void {
    this.t = t;
    if (this.phase === 'play' || this.phase === 'groove' || this.phase.startsWith('copy')) {
      const twoBeats = 2 * this.clock.spb;
      this.clock.delay(twoBeats);
      // two count-in ticks
      const now = this.clock.beatAt(t);
      this.stage.band({ beat: now, voice: 'shaker', midi: 0, len: 0.2, vel: 0.9 }, t + 0.02, this.clock.spb);
      this.stage.band({ beat: now + 1, voice: 'shaker', midi: 0, len: 0.2, vel: 0.9 }, t + 0.02 + this.clock.spb, this.clock.spb);
    }
  }

  /** Notes due between game times `a` and `b` (the autoplayer for tests and filming only). */
  dueBetween(a: number, b: number, fn: (lane: Lane) => void): void {
    const j = this.phase === 'play' ? this.judge : this.phase === 'copy-turn' || this.phase === 'copy-demo' ? this.turnJudge : null;
    if (!j) return;
    for (const n of j.notes) {
      if (n.grade !== null) continue;
      const due = n.t + this.clock.start + this.opts.offset;
      if (due > a && due <= b) fn(n.lane);
    }
  }

  /** The pad asking for a hit now, if any. */
  get waiting(): Lane | null {
    return this.waitHit;
  }

  /** Did the last copy pass? (debug/E2E) */
  get copied(): boolean {
    return this.copyPassed;
  }

  /** Every pad the flow knows (first lanes always). */
  static firstLanes(): readonly Lane[] {
    return FIRST_LANES;
  }
}

/** How many of `want` appear, in order, within `got`. */
function subsequence(want: readonly Lane[], got: readonly Lane[]): number {
  let k = 0;
  for (const g of got) if (k < want.length && g === want[k]) k++;
  return k;
}
