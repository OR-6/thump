/**
 * KitSystem: finds the table, lays the kit on it, turns hands into strikes, and runs the game.
 *
 * Each frame: hands (from HandTrackerSystem, world space) → kit-local points → StrikeDetector →
 * which pad → sound (scheduled for this instant on the audio clock) + squash/puff → Flow (copy
 * mode, songs, the crowd). Placement: a table plane straight ahead places the kit at once; else a
 * palm resting flat for 0.8 s; else a default height with nudge arrows after 8 s with no hands.
 * The kit is world-locked under IWSDK's persistent room anchor, and comes back where it was.
 */
import { reportFrameError } from '../app/safe.js';
import {
  createSystem,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
  VisibilityState,
  XRAnchor,
  XRPlane,
  SceneUnderstandingSystem,
  type Entity,
  type Object3D,
} from '@iwsdk/core';
import { PLACE, PADS, STRIKE, type Lane } from '../config.js';
import { hands, type Side } from '../input/hands.js';
import { Placement, kitPose } from '../app/placement.js';
import { FrameGuard } from '../app/frame-guard.js';
import { occluderState } from '../input/occluders.js';
import { StrikeDetector, type HandSample, type Point } from './strike.js';
import { kitLayout, pickPad, settleSpot, type PadSpot } from './layout.js';
import { KitView, LIST, NUDGE, PLATE } from './kit-view.js';
import { Flow, type Stage } from '../play/flow.js';
import { audio, type Voice } from '../audio/engine.js';
import { loadProgress, saveProgress, type Progress } from '../persistence/progress.js';
import { loadSettings, saveSettings, type Settings } from '../persistence/settings.js';
import { Label } from '../ui/label.js';
import { motion, prefersReducedMotion } from '../ui/motion.js';
import { SONGS } from '../songs/songs.js';
import { estimateOffset } from '../songs/judge.js';
import { lanesFor } from '../play/progression.js';

const params = new URLSearchParams(location.search);
/** `?debug=1`: a tag behind the kit with fps (now and lowest), hits per second, the last hit, planes, timing. */
const DEBUG = params.get('debug') === '1';
/** `?desk=<y>`: a fixed table height (E2E, filming). */
const FIXED_DESK = params.get('desk');
/** IWSDK keeps its persistent room anchor's handle here. */
const ANCHOR_KEY = 'iwsdk_scene_anchor_uuid';
/** Seconds after entering in which last session's kit may come back. */
const RESUME_WINDOW_S = 4;
const FOVEATION = [0.5, 0.75, 1];
const SIDES = ['left', 'right'] as const;
const HOLD_DOTS = 20;

/**
 * The game clock: the audio clock while audio runs (sample-accurate scheduling), frame time
 * otherwise, continuous across the switch. Stops while paused.
 */
class GameClock {
  t = 0;
  private base = 0;
  private wasRunning = false;
  tick(dt: number, running: boolean, audioNow: number): void {
    if (running) {
      if (!this.wasRunning) this.base = this.t - audioNow;
      this.t = audioNow + this.base;
    } else this.t += dt;
    this.wasRunning = running;
  }
  /** Audio time for game time `t` (0 when audio isn't running: play now). */
  toAudio(t: number): number {
    return this.wasRunning ? t - this.base : 0;
  }
}

interface Timed {
  at: number;
  fn: () => void;
}

export interface ThumpDebug {
  phase: string;
  deskY: number | null;
  deskSource: string | null;
  kitOrigin: number[] | null;
  anchored: boolean;
  hits: number;
  knocks: number;
  lastHit: { lane: string; gain: number; speed: number; kind: string; grade: string | null } | null;
  flow: string;
  lanes: string[];
  crowd: number;
  audio: boolean;
  planes: number;
  offsetMs: number;
  surfaceMm: number;
  degrade: number;
  fps: number;
  fpsMin: number;
  hint: string;
  title: string;
  stars: number | null;
  list: boolean;
  bird: boolean;
  moved: number;
  grabbing: string | null;
  gongOnWall: boolean;
  resumed: boolean;
  calibrating: string;
  errors: number;
}

export class KitSystem extends createSystem({ planes: { required: [XRPlane] } }) {
  view!: KitView;
  flow!: Flow;
  progress!: Progress;
  settings!: Settings;
  readonly detector = new StrikeDetector();
  private gongDet = new StrikeDetector();
  placement = new Placement();
  readonly clock = new GameClock();
  private kitEntity!: Entity;
  private kitHome: Object3D | null = null;
  private head = new Vector3();
  private fwd = new Vector3();
  private inv = new Matrix4();
  private gongInv = new Matrix4();
  private tmp = new Vector3();
  private tmp2 = new Vector3();
  private tmpQ = new Quaternion();
  private planeInv = new Matrix4();
  private planeYs: number[] = [];
  private sessionTime = 0;
  private placedHand: Side = 'right';
  private paused = false;
  private xrBlurred = false;
  private pageHidden = false;
  private hint!: Label;
  private holdRing!: InstancedMesh;
  private guard = new FrameGuard();
  private timed: Timed[] = [];
  private kitSaved = false;
  private resumed = false;
  private bloom = 1;
  /** Pads on the table and where they lie (kit-local), rebuilt when the kit changes. */
  private spots: PadSpot[] = [];
  private gongSpot: PadSpot | null = null;
  /** Each hand's points, kit-local (palm, index, middle, ring) and for the wall gong. */
  private pts: Record<Side, Point[]> = { left: mkPoints(), right: mkPoints() };
  private gpts: Record<Side, Point[]> = { left: mkPoints(), right: mkPoints() };
  private samples: Record<Side, HandSample> = { left: { tracked: false, pinching: false, points: this.pts.left }, right: { tracked: false, pinching: false, points: this.pts.right } };
  private gsamples: Record<Side, HandSample> = { left: { tracked: false, pinching: false, points: this.gpts.left }, right: { tracked: false, pinching: false, points: this.gpts.right } };
  private lastHit: Partial<Record<Lane, { t: number; side: Side }>> = {};
  private hitTimes: number[] = [];
  private hudT = 0;
  private hudFrames = 0;
  private hudMin = Infinity;
  private plateTaps: number[] = [];
  private grab: Record<Side, Lane | null> = { left: null, right: null };
  private nudgeUntil = -1;
  private cal: { clicks: number[]; taps: number[]; end: number } | null = null;
  private audioSession: XRSession | null = null;
  private forcedDegrade = Number(params.get('degrade') ?? NaN);
  debug!: ThumpDebug;

  init() {
    this.progress = loadProgress();
    this.settings = loadSettings();
    motion.calm = this.settings.calmMotion ?? prefersReducedMotion();
    audio.setBed(this.settings.band);
    this.view = new KitView();
    this.view.setTheme(this.settings.highContrast);
    this.kitEntity = this.world.createTransformEntity(this.view.root);
    this.kitHome = this.view.root.parent;
    // placement: a paper tag where the kit will go, and a ring of dots that fills while the palm rests
    this.hint = new Label(0.22, 0.034);
    this.hint.set('Rest your palm on the table');
    this.world.createTransformEntity(this.hint.mesh);
    this.hint.mesh.visible = false;
    const dot = new SphereGeometry(0.0035, 8, 6);
    this.holdRing = new InstancedMesh(dot, new MeshBasicMaterial({ color: 0xf2b632 }), HOLD_DOTS);
    this.holdRing.frustumCulled = false;
    this.holdRing.count = 0;
    const m = new Matrix4();
    for (let i = 0; i < HOLD_DOTS; i++) {
      const a = (i / HOLD_DOTS) * Math.PI * 2;
      m.makeTranslation(Math.cos(a) * 0.075, 0, Math.sin(a) * 0.075);
      this.holdRing.setMatrixAt(i, m);
    }
    this.world.createTransformEntity(this.holdRing);
    this.flow = new Flow(this.stage, this.progress, { tempo: this.settings.tempo, offset: this.settings.offset });
    this.debug = {
      phase: 'waiting', deskY: null, deskSource: null, kitOrigin: null, anchored: false, hits: 0, knocks: 0, lastHit: null,
      flow: 'idle', lanes: [], crowd: 0, audio: false, planes: 0, offsetMs: Math.round(this.settings.offset * 1000), surfaceMm: 0,
      degrade: 0, fps: 0, fpsMin: 0, hint: '', title: '', stars: null, list: false, bird: false, moved: 0, grabbing: null,
      gongOnWall: false, resumed: false, calibrating: '', errors: 0,
    };
    (window as unknown as { __thump: unknown }).__thump = {
      debug: this.debug,
      game: this,
      hands,
      audio,
      flow: () => this.flow,
      targets: () => this.targets(),
    };
    this.cleanupFuncs.push(
      this.visibilityState.subscribe((s) => {
        this.xrBlurred = s === VisibilityState.VisibleBlurred || s === VisibilityState.Hidden;
        this.setPaused(this.xrBlurred || this.pageHidden);
        if (s === VisibilityState.Visible) {
          const sess = this.world.session;
          // XR select events carry user activation: use them to unlock audio
          if (sess && sess !== this.audioSession) {
            this.audioSession = sess;
            sess.addEventListener('selectstart', () => audio.resume());
            sess.addEventListener('squeezestart', () => audio.resume());
          }
          audio.resume();
          if (sess?.updateTargetFrameRate && sess.supportedFrameRates?.includes(72)) sess.updateTargetFrameRate(72).catch(() => {});
        }
        if (s === VisibilityState.NonImmersive) this.endSession();
      }),
    );
    const onVis = () => {
      this.pageHidden = document.visibilityState === 'hidden';
      this.setPaused(this.xrBlurred || this.pageHidden);
    };
    document.addEventListener('visibilitychange', onVis);
    this.cleanupFuncs.push(() => document.removeEventListener('visibilitychange', onVis));
    const onSettings = () => this.applySettings(loadSettings());
    window.addEventListener('thump:settings', onSettings);
    this.cleanupFuncs.push(() => window.removeEventListener('thump:settings', onSettings));
  }

  // ------------------------------------------------------------------ the stage the flow plays on

  private stage: Stage = {
    showPad: (lane, how) => {
      if (lane === 'gong') this.placeGong();
      this.layout();
      this.view.pad(lane)?.appear(how);
      if (how === 'slide') audio.whoosh(this.panOf(lane));
      this.debug.lanes = this.flow.lanes.slice();
    },
    glow: (lane, k) => this.view.pad(lane)?.setGlow(k),
    demo: (lane, vel, at) => {
      audio.drum(lane, vel, this.panOf(lane), this.clock.toAudio(at), lane === 'gong' && this.view.gongOnWall ? 1.4 : 1);
      this.later(at, () => this.view.pad(lane)?.hit(vel * 0.8));
    },
    band: (e, at, spb) => audio.band(e, this.clock.toAudio(at), spb),
    crowd: (count, energy) => {
      this.view.crowd.setCount(count);
      this.view.crowd.energy = energy;
      this.debug.crowd = count;
    },
    cheer: (big) => {
      this.view.crowd.cheer(big);
      audio.cheer(this.view.crowd.count, big);
      if (big) this.view.fx.confetti(0, 0.04, -0.2, 90, 0.8);
    },
    title: (song) => {
      this.view.showTitle(song);
      this.debug.title = song?.name ?? '';
      if (song) audio.tick();
    },
    stars: (n, gold) => {
      this.view.showStars(n, gold, this.flow.song?.name ?? '');
      this.debug.stars = n;
      if (n !== null) {
        audio.chime(n === 3 ? [72, 76, 79, 84] : n === 2 ? [72, 76, 79] : [72, 76], 0.18);
        if (n >= 2) this.view.fx.confetti(0, 0.06, -0.06, n === 3 ? 170 : 100, 1, gold);
      }
    },
    hint: (text) => {
      const t = this.settings.noWords ? '' : (text ?? '');
      this.view.hint.set(t);
      this.debug.hint = t;
    },
    bandmate: (event, lane, at, vel) => {
      const b = this.view.bird;
      if (event === 'arrive') {
        b.arrive();
        audio.chirp('hello');
        this.debug.bird = true;
      } else if (event === 'happy') {
        b.happy();
        audio.chirp('happy');
      } else if (event === 'turn') {
        b.turn();
        audio.chirp('turn');
      } else if (event === 'listen' && lane && at !== undefined) {
        // its call: your pad's voice, played on its tiny drum (from where it sits)
        audio.drum(lane, (vel ?? 0.8) * 0.75, -0.6, this.clock.toAudio(at));
        this.later(at, () => b.strike());
      }
    },
    songList: (show) => {
      this.view.showList(show, this.progress);
      this.debug.list = show;
    },
    save: (p) => {
      saveProgress(p);
      if (Math.abs(this.flow.opts.offset - this.settings.offset) > 0.001) {
        this.settings = { ...this.settings, offset: this.flow.opts.offset };
        saveSettings(this.settings);
        this.debug.offsetMs = Math.round(this.settings.offset * 1000);
      }
    },
    unlock: (u) => {
      if (u === 'bandmate') this.view.bird.arrive();
    },
  };

  /** Run `fn` when the game clock reaches `at` (demo squashes in time with their sound). */
  private later(at: number, fn: () => void): void {
    if (at <= this.clock.t) fn();
    else this.timed.push({ at, fn });
  }

  private panOf(lane: Lane): number {
    const p = this.view.pad(lane);
    return p ? Math.max(-0.8, Math.min(0.8, p.group.position.x / 0.35)) : 0;
  }

  // ------------------------------------------------------------------ settings

  applySettings(s: Settings): void {
    const was = this.settings;
    this.settings = s;
    motion.calm = s.calmMotion ?? prefersReducedMotion();
    audio.setBed(s.band);
    this.flow.opts.tempo = s.tempo;
    this.flow.opts.offset = s.offset;
    this.debug.offsetMs = Math.round(s.offset * 1000);
    if (was.highContrast !== s.highContrast) this.view.setTheme(s.highContrast);
    if (was.oneHand !== s.oneHand || was.hand !== s.hand) this.layout();
    if (s.noWords) this.view.hint.set('');
  }

  private handed(): 'left' | 'right' {
    const h = this.settings.hand;
    return h === 'auto' ? this.placedHand : h;
  }

  /** Lay the unlocked table pads out (handedness, one hand, arrangement). */
  private layout(): void {
    const lanes = (this.flow?.lanes.length ? this.flow.lanes : lanesFor(new Set(this.progress.unlocks))).filter((l) => !(l === 'gong' && this.view.gongOnWall));
    const handed = this.handed();
    this.spots = kitLayout(lanes, { handed, oneHand: this.settings.oneHand ? handed : null, moved: this.progress.moved });
    for (const s of this.spots) {
      const p = this.view.pad(s.lane)!;
      p.x = s.x;
      p.z = s.z;
    }
  }

  // ------------------------------------------------------------------ frame

  update(delta: number) {
    try {
      this.step(delta);
    } catch (e) {
      this.debug.errors++;
      reportFrameError('KitSystem', e);
    }
  }

  private step(delta: number) {
    const dt = Math.min(delta, 0.05);
    if (this.paused) return;
    this.watchFrames(delta);
    this.clock.tick(dt, audio.running, audio.now());
    this.debug.audio = audio.running;
    const immersive = this.visibilityState.peek() !== VisibilityState.NonImmersive;
    this.player.head.getWorldPosition(this.head);
    if (this.placement.phase !== 'placed') {
      if (!immersive) return;
      this.sessionTime += dt;
      this.updatePlacement(dt);
      return;
    }
    const root = this.view.root;
    if (this.bloom < 1) {
      this.bloom = Math.min(1, this.bloom + dt / 0.5);
      root.updateMatrixWorld();
    }
    this.inv.copy(root.matrixWorld).invert();
    // timed visuals (a demo pad squashing in time with its sound)
    for (let i = this.timed.length - 1; i >= 0; i--) {
      if (this.timed[i].at <= this.clock.t) {
        const f = this.timed[i].fn;
        this.timed.splice(i, 1);
        f();
      }
    }
    this.readHands(dt);
    if (this.cal) this.tickCalibration();
    else this.flow.tick(this.clock.t);
    this.debug.flow = this.cal ? 'calibrate' : this.flow.phase;
    const playing = this.flow.phase === 'play' || this.flow.phase === 'groove' || this.flow.phase.startsWith('copy');
    const beat = playing ? this.flow.clock.beatAt(this.clock.t) : Number.NaN;
    this.view.syncChips(this.flow.chips, this.flow.chipCount, this.settings.highContrast);
    this.view.update(dt, beat, this.clock.t);
    if (this.nudgeUntil > 0 && this.clock.t > this.nudgeUntil && this.placement.source !== 'default') {
      this.nudgeUntil = -1;
      this.view.nudges.visible = false;
    }
    this.debug.anchored = this.kitEntity.hasComponent(XRAnchor) && this.kitEntity.getValue(XRAnchor, 'attached') === true;
    if (this.debug.anchored) this.saveKitPose();
    this.debug.surfaceMm = Math.round(this.detector.surfaceY * 1000);
  }

  /** Hands → kit-local points → strikes, pinch-moves and their shadows on the table. */
  private readHands(dt: number): void {
    const t = this.clock.t;
    const gong = this.view.gongOnWall && this.flow.lanes.includes('gong') ? this.view.pad('gong')! : null;
    if (gong) this.gongInv.copy(gong.group.matrixWorld).invert();
    for (let i = 0; i < 2; i++) {
      const side = SIDES[i];
      const h = hands[side];
      const s = this.samples[side];
      s.tracked = h.tracked;
      s.pinching = h.pinch.pinching;
      if (h.tracked) {
        const p = this.pts[side];
        this.toLocal(h.palm, p[0], h.palmRadius, this.inv);
        this.toLocal(h.indexTip, p[1], h.tipRadius, this.inv);
        this.toLocal(h.middleTip, p[2], h.tipRadius, this.inv);
        this.toLocal(h.ringTip, p[3], h.tipRadius, this.inv);
        this.view.setHandShadow(i, p[0].x, p[0].y - p[0].r - this.detector.surfaceY, p[0].z);
      } else this.view.setHandShadow(i, 0, Infinity, 0);
      this.moveByPinch(side, h.pinch.pinching, h.edge);
      const strike = this.detector.update(i as 0 | 1, s, t, dt);
      if (strike) this.onStrike(side, strike.gain, strike.speed, strike.kind, strike.height, this.pts[side]);
      if (gong) {
        const g = this.gsamples[side];
        g.tracked = h.tracked;
        g.pinching = h.pinch.pinching;
        if (h.tracked) {
          const p = this.gpts[side];
          this.toLocal(h.palm, p[0], h.palmRadius, this.gongInv);
          this.toLocal(h.indexTip, p[1], h.tipRadius, this.gongInv);
          this.toLocal(h.middleTip, p[2], h.tipRadius, this.gongInv);
          this.toLocal(h.ringTip, p[3], h.tipRadius, this.gongInv);
        }
        const gs = this.gongDet.update(i as 0 | 1, g, t, dt);
        if (gs && this.gongSpot && pickPad(this.gpts[side], this.gongDet.surfaceY, gs.height, [this.gongSpot]) === 0) this.hitPad('gong', side, gs.gain, gs.speed, gs.kind);
      }
    }
  }

  private toLocal(world: Vector3, out: Point, r: number, inv: Matrix4): void {
    this.tmp.copy(world).applyMatrix4(inv);
    out.x = this.tmp.x;
    out.y = this.tmp.y;
    out.z = this.tmp.z;
    out.r = r;
  }

  private onStrike(side: Side, gain: number, speed: number, kind: string, height: number, pts: Point[]): void {
    // visible table pads (the wall gong has its own detector)
    let k = -1;
    const visible = this.spots.filter((s) => this.view.pad(s.lane)?.visible);
    k = pickPad(pts, this.detector.surfaceY, height, visible);
    if (k >= 0) {
      this.hitPad(visible[k].lane, side, gain, speed, kind);
      return;
    }
    // a card, the move plate, a nudge arrow: tapped
    const p = lowest(pts, this.detector.surfaceY);
    if (this.tapControls(p.x, p.z)) return;
    // the bare table: a faint knock and a ring of dust (every surface is a drum)
    audio.drum('knock', gain, Math.max(-0.8, Math.min(0.8, p.x / 0.35)));
    this.view.fx.ring(p.x, 0, p.z, 0xfff1d6, 0.03 + 0.03 * gain);
    this.debug.knocks++;
  }

  private hitPad(lane: Lane, side: Side, gain: number, speed: number, kind: string): void {
    const t = this.clock.t;
    const pad = this.view.pad(lane)!;
    // two hands on one pad within 25 ms: a flam (one note, the second softer), never a double
    const prev = this.lastHit[lane];
    const flam = !!prev && prev.side !== side && t - prev.t < STRIKE.flamS;
    this.lastHit[lane] = { t, side };
    const size = lane === 'gong' && this.view.gongOnWall ? 1.4 : 1;
    const voice: Voice = lane;
    audio.drum(voice, flam ? gain * 0.5 : gain, this.panOf(lane), 0, size);
    pad.hit(flam ? gain * 0.5 : gain);
    const at = pad.group.position;
    this.view.fx.puff(at.x, at.y + 0.02, at.z, PADS[lane].color, flam ? 2 : 3 + Math.round(gain * 3));
    if (gain > 0.7) this.view.fx.ring(at.x, at.y, at.z, PADS[lane].color, pad.radius * 2.4);
    this.debug.hits++;
    this.hitTimes.push(performance.now());
    let grade: string | null = null;
    if (!flam) {
      if (this.cal) this.cal.taps.push(t);
      else grade = this.flow.hit(lane, t, gain);
    }
    this.debug.lastHit = { lane, gain: round3(gain), speed: round3(speed), kind, grade };
    if (grade === 'perfect') this.view.fx.confetti(at.x, at.y + 0.01, at.z, 6, 0.25, true);
  }

  /** A tap that landed on a control (not a pad). */
  private tapControls(x: number, z: number): boolean {
    const v = this.view;
    if (v.listVisible) {
      for (let i = 0; i < v.cards.length; i++) {
        const c = v.cards[i].mesh.position;
        if (Math.abs(x - c.x) < LIST.w / 2 + 0.008 && Math.abs(z - c.z) < 0.06) {
          audio.tick();
          this.flow.pickSong(i);
          return true;
        }
      }
    }
    if (Math.hypot(x - PLATE.x, z - PLATE.z) < PLATE.r + 0.015) {
      audio.tick();
      const now = this.clock.t;
      this.plateTaps = this.plateTaps.filter((p) => now - p < 0.9);
      this.plateTaps.push(now);
      this.view.fx.ring(PLATE.x, 0, PLATE.z, 0x3d5a80, 0.05);
      if (this.plateTaps.length >= 2) {
        this.plateTaps = [];
        this.moveKit();
      }
      return true;
    }
    if (v.nudges.visible) {
      for (const [zz, dir] of [
        [NUDGE.upZ, 1],
        [NUDGE.downZ, -1],
      ] as const) {
        if (Math.hypot(x - NUDGE.x, z - zz) < NUDGE.r + 0.015) {
          this.nudgeDesk(dir);
          return true;
        }
      }
    }
    return false;
  }

  /** Pinch a pad to move it (once arranging is unlocked); release to set it down. */
  private moveByPinch(side: Side, pinching: boolean, edge: string): void {
    if (!this.progress.unlocks.includes('arrange')) return;
    const h = hands[side];
    const held = this.grab[side];
    if (edge === 'start' && !held && h.tracked) {
      this.tmp.copy(h.pinchPoint).applyMatrix4(this.inv);
      for (const s of this.spots) {
        const pad = this.view.pad(s.lane)!;
        if (!pad.visible || this.grab.left === s.lane || this.grab.right === s.lane) continue;
        if (Math.hypot(this.tmp.x - pad.x, this.tmp.z - pad.z) < pad.radius + 0.02 && this.tmp.y < 0.07) {
          this.grab[side] = s.lane;
          this.debug.grabbing = s.lane;
          audio.tick();
          break;
        }
      }
      return;
    }
    if (held && pinching) {
      this.tmp.copy(h.pinchPoint).applyMatrix4(this.inv);
      const pad = this.view.pad(held)!;
      pad.x = this.tmp.x;
      pad.z = this.tmp.z;
      pad.lift = 0.012;
      return;
    }
    if (held && !pinching) {
      const pad = this.view.pad(held)!;
      const others = this.spots.filter((s) => s.lane !== held);
      const at = settleSpot(held, pad.x, pad.z, others);
      pad.x = at.x;
      pad.z = at.z;
      pad.lift = 0;
      this.progress.moved[held] = { x: round3(at.x), z: round3(at.z) };
      saveProgress(this.progress);
      this.grab[side] = null;
      this.debug.grabbing = null;
      this.debug.moved++;
      this.layout();
      audio.drum('knock', 0.5, this.panOf(held));
      this.view.fx.ring(at.x, 0, at.z, PADS[held].color, pad.radius * 2.2);
    }
  }

  // ------------------------------------------------------------------ the wall gong

  /** The gong goes on a real wall within reach when there is one (PLAN §3.1), else on the table's edge. */
  private placeGong(): void {
    const pad = this.view.pad('gong')!;
    const wall = this.findWall();
    const g = pad.group;
    if (wall) {
      this.tmp.copy(wall.at).applyMatrix4(this.inv);
      pad.x = this.tmp.x;
      pad.z = this.tmp.z;
      // turn the pad so its +Y is the wall's normal (in kit space)
      this.tmp2.copy(wall.n).transformDirection(this.inv);
      g.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), this.tmp2);
      pad.lift = this.tmp.y;
      this.view.gongOnWall = true;
      this.gongSpot = { lane: 'gong', x: 0, z: 0, size: PADS.gong.size, zone: PADS.gong.size * 0.6 };
    } else {
      g.quaternion.identity();
      pad.lift = 0;
      this.view.gongOnWall = false;
      this.gongSpot = null;
    }
    this.debug.gongOnWall = this.view.gongOnWall;
  }

  /** The nearest wall the seated player can reach (the closest point within 0.75 m of the head). */
  private findWall(): { at: Vector3; n: Vector3 } | null {
    let best: { at: Vector3; n: Vector3 } | null = null;
    let bestD = 0.75;
    const c = new Vector3();
    const n = new Vector3();
    const q = new Quaternion();
    const inv = new Matrix4();
    const deskY = this.view.root.position.y;
    for (const e of this.queries.planes.entities) {
      const pl = e.getValue(XRPlane, '_plane') as (XRPlane & { semanticLabel?: string }) | undefined;
      const obj = e.object3D;
      if (!pl || !obj || pl.orientation !== 'vertical') continue;
      if (pl.semanticLabel && !/wall|other/i.test(pl.semanticLabel)) continue;
      obj.updateMatrixWorld();
      obj.getWorldPosition(c);
      n.set(0, 1, 0).applyQuaternion(obj.getWorldQuaternion(q));
      n.y = 0;
      if (n.lengthSq() < 1e-4) continue;
      n.normalize();
      if (n.dot(this.tmp.copy(this.head).sub(c)) < 0) n.negate(); // face the room
      // the closest point of the wall to the head, at shoulder height above the table
      const d = this.tmp.copy(this.head).sub(c).dot(n);
      if (d < 0.15 || d > bestD) continue;
      const at = new Vector3().copy(this.head).addScaledVector(n, -d);
      at.y = deskY + 0.26;
      inv.copy(obj.matrixWorld).invert();
      const local = this.tmp2.copy(at).applyMatrix4(inv);
      if (!insidePolygon(pl.polygon, local.x, local.z, 0.05)) continue;
      // not behind the player
      this.forwardFlat(this.fwd);
      if (this.fwd.dot(this.tmp.copy(at).sub(this.head).setY(0).normalize()) < -0.2) continue;
      bestD = d;
      best = { at: at.addScaledVector(n, 0.012), n: n.clone() };
    }
    return best;
  }

  // ------------------------------------------------------------------ placement

  private updatePlacement(dt: number) {
    if (FIXED_DESK !== null && Number.isFinite(Number(FIXED_DESK))) {
      this.placement.place(Number(FIXED_DESK), 'fixed');
      this.placeKit();
      return;
    }
    this.forwardFlat(this.fwd);
    this.hint.mesh.visible = true;
    this.hint.mesh.position.copy(this.head).addScaledVector(this.fwd, PLACE.forward + 0.05);
    this.hint.mesh.position.y = this.head.y - 0.28;
    this.hint.mesh.lookAt(this.head);
    if (this.sessionTime < RESUME_WINDOW_S && this.tryResume()) return;
    // a table plane straight ahead: the kit goes there at once, no hands needed
    if (this.sessionTime > PLACE.planeWaitS && this.placement.phase === 'waiting') {
      const y = this.tableAhead();
      if (y !== null) {
        this.placement.place(y, 'plane');
        this.placeKit();
        return;
      }
    }
    let placed = false;
    for (const side of ['right', 'left'] as const) {
      const h = hands[side];
      if (!h.tracked) continue;
      this.planesUnder(h.palm);
      if (this.placement.update({ x: h.palm.x, y: h.palm.y, z: h.palm.z, radius: h.palmRadius, upDot: h.upDot }, this.planeYs, dt, this.head.y)) {
        this.placedHand = side;
        placed = true;
        break;
      }
      if (this.placement.phase === 'steadying') {
        this.holdRing.position.set(h.palm.x, h.palm.y - h.palmRadius + 0.004, h.palm.z);
        break;
      }
    }
    this.holdRing.count = this.placement.phase === 'steadying' && !placed ? Math.ceil(this.placement.progress * HOLD_DOTS) : 0;
    const noHands = !hands.left.tracked && !hands.right.tracked;
    if (!placed && noHands) this.placement.update(null, [], dt);
    const lowHand = performance.now() - this.placement.rejectedAt < 1500;
    this.hint.set(lowHand ? 'Sit at a table, palm flat' : 'Rest your palm on the table');
    if (!placed && ((noHands && this.sessionTime > PLACE.noHandTimeoutS) || (this.sessionTime > PLACE.palmTimeoutS && this.placement.phase !== 'steadying'))) {
      this.placement.placeDefault(this.head.y);
      placed = true;
    }
    this.debug.phase = this.placement.phase;
    if (placed) this.placeKit();
  }

  /** Height of a table plane under the spot straight ahead (plausibly a seated table), or null. */
  private tableAhead(): number | null {
    this.forwardFlat(this.fwd);
    const ahead = this.tmp2.copy(this.head).addScaledVector(this.fwd, PLACE.forward);
    let best: number | null = null;
    for (const e of this.queries.planes.entities) {
      const pl = e.getValue(XRPlane, '_plane') as (XRPlane & { semanticLabel?: string }) | undefined;
      const obj = e.object3D;
      if (!pl || !obj || pl.orientation !== 'horizontal') continue;
      if (pl.semanticLabel === 'floor' || pl.semanticLabel === 'ceiling') continue;
      obj.updateMatrixWorld();
      obj.getWorldPosition(this.tmp);
      const drop = this.head.y - this.tmp.y;
      if (drop < PLACE.minDrop || drop > PLACE.maxDropWithPlane) continue;
      this.planeInv.copy(obj.matrixWorld).invert();
      const local = this.tmp.copy(ahead).applyMatrix4(this.planeInv);
      if (!insidePolygon(pl.polygon, local.x, local.z, 0.02)) continue;
      obj.getWorldPosition(this.tmp);
      if (best === null || this.tmp.y > best) best = this.tmp.y;
    }
    return best;
  }

  private planesUnder(p: Vector3) {
    this.planeYs.length = 0;
    for (const e of this.queries.planes.entities) {
      const pl = e.getValue(XRPlane, '_plane') as (XRPlane & { semanticLabel?: string }) | undefined;
      const obj = e.object3D;
      if (!pl || !obj || pl.orientation !== 'horizontal') continue;
      if (pl.semanticLabel === 'floor' || pl.semanticLabel === 'ceiling') continue;
      obj.updateMatrixWorld();
      this.planeInv.copy(obj.matrixWorld).invert();
      this.tmp.copy(p).applyMatrix4(this.planeInv);
      if (!insidePolygon(pl.polygon, this.tmp.x, this.tmp.z, 0.05)) continue;
      obj.getWorldPosition(this.tmp);
      this.planeYs.push(this.tmp.y);
    }
  }

  private forwardFlat(out: Vector3): Vector3 {
    this.player.head.getWorldDirection(out);
    // Object3D.getWorldDirection gives +Z; a camera looks down −Z
    out.negate();
    out.y = 0;
    if (out.lengthSq() < 1e-6) out.set(0, 0, -1);
    return out.normalize();
  }

  private placeKit(resume = false) {
    const root = this.view.root;
    if (this.kitHome && root.parent !== this.kitHome) this.kitHome.add(root);
    this.forwardFlat(this.fwd);
    const palm = this.placement.source === 'palm' || (this.placement.source === 'plane' && this.placement.palmX !== 0) ? { x: this.placement.palmX, z: this.placement.palmZ } : null;
    if (!resume) {
      const pose = kitPose(this.head, this.fwd, this.placement.deskY!, palm);
      root.position.set(pose.x, pose.y, pose.z);
      root.rotation.set(0, pose.yaw, 0);
    }
    root.visible = true;
    root.updateMatrixWorld(true);
    this.hint.mesh.visible = false;
    this.holdRing.count = 0;
    this.bloom = 0;
    this.detector.resetSurface(0);
    this.debug.phase = 'placed';
    this.debug.deskY = round3(this.placement.deskY!);
    this.debug.deskSource = resume ? 'resumed' : this.placement.source;
    this.debug.kitOrigin = root.position.toArray().map(round3);
    this.debug.planes = this.queries.planes.entities.size;
    this.kitSaved = false;
    if (this.world.session?.enabledFeatures?.includes('anchors') && !this.kitEntity.hasComponent(XRAnchor)) this.kitEntity.addComponent(XRAnchor);
    const fallback = this.placement.source === 'default';
    // the height arrows: always for a default height; for a while after a palm placement too (a book under the palm)
    this.nudgeUntil = fallback ? Infinity : resume ? -1 : this.clock.t + 20;
    this.view.nudges.visible = fallback || this.nudgeUntil > 0;
    if (DEBUG) this.view.debug.set('…');
    try {
      this.renderer.xr.setFoveation(FOVEATION[0]);
    } catch {
      /* unsupported */
    }
    this.layout();
    // the flow begins once (moving the kit keeps the game where it was), after the shaders are warm
    const begin = () => {
      if (this.flow.phase === 'idle' && !this.cal) {
        if (this.settings.calibrateNext) this.startCalibration();
        else this.flow.start(this.clock.t);
      }
      this.layout();
      if (fallback) this.stage.hint('Tap the arrows to meet it');
    };
    this.warmShaders(begin);
  }

  /** Compile every shader while the kit appears, so the first hit, chip, cheer or confetti doesn't hitch. */
  private warmShaders(then: () => void): void {
    let called = false;
    const go = () => {
      if (called) return;
      called = true;
      then();
    };
    try {
      const r = this.renderer as unknown as { compileAsync?: (s: unknown, c: unknown) => Promise<unknown> };
      const hidden: Object3D[] = [];
      this.view.root.traverse((o) => {
        if (!o.visible) {
          hidden.push(o);
          o.visible = true;
        }
      });
      const p = r.compileAsync?.(this.world.scene, this.world.camera);
      const done = () => {
        for (const o of hidden) o.visible = false;
        go();
      };
      if (p) p.catch(() => {}).finally(done);
      else done();
    } catch {
      /* compiled on first use */
      go();
    }
    // never wait long for it
    setTimeout(go, 1500);
  }

  /** Move the kit (two taps on the felt plate): it goes, and comes back wherever you rest a palm next. */
  moveKit(): void {
    if (this.placement.phase !== 'placed' || this.flow.phase === 'play') return;
    if (this.kitEntity.hasComponent(XRAnchor)) this.kitEntity.removeComponent(XRAnchor);
    this.placement = new Placement();
    this.view.root.visible = false;
    this.settings = { ...this.settings, placeFresh: true };
    this.sessionTime = RESUME_WINDOW_S;
    this.debug.phase = 'waiting';
    this.debug.anchored = false;
    audio.whoosh(0);
  }

  private nudgeDesk(dir: 1 | -1): void {
    const y = (this.placement.deskY ?? this.view.root.position.y) + dir * PLACE.nudgeStep;
    this.placement.deskY = y;
    this.view.root.position.y += dir * PLACE.nudgeStep;
    this.view.root.updateMatrixWorld(true);
    this.kitSaved = false;
    this.debug.deskY = round3(y);
    this.debug.kitOrigin = this.view.root.position.toArray().map(round3);
    audio.tick();
  }

  private roomAnchor(): { group: Object3D; uuid: string } | null {
    if (!this.world.session?.enabledFeatures?.includes('anchors')) return null;
    const su = this.world.getSystem(SceneUnderstandingSystem) as unknown as { xrAnchor?: unknown; anchoredGroup?: Object3D } | undefined;
    if (!su?.xrAnchor || !su.anchoredGroup) return null;
    let uuid: string | null = null;
    try {
      uuid = localStorage.getItem(ANCHOR_KEY);
    } catch {
      return null;
    }
    return uuid ? { group: su.anchoredGroup, uuid } : null;
  }

  /** Last session's kit, if the same persistent anchor is back and the spot is still a seated table within reach. */
  private tryResume(): boolean {
    const saved = this.progress.kit;
    if (!saved || this.settings.placeFresh) return false;
    const a = this.roomAnchor();
    if (!a || a.uuid !== saved.uuid) return false;
    a.group.updateMatrixWorld(true);
    const at = this.tmp2.set(saved.x, saved.y, saved.z).applyMatrix4(a.group.matrixWorld);
    const ahead = Math.hypot(at.x - this.head.x, at.z - this.head.z);
    const drop = this.head.y - at.y;
    if (ahead > 0.6 || drop < PLACE.minDrop || drop > PLACE.maxDropWithPlane) return false;
    this.placement.place(at.y, 'palm');
    const root = this.view.root;
    a.group.add(root);
    root.position.set(saved.x, saved.y, saved.z);
    root.rotation.set(0, saved.yaw, 0);
    root.updateMatrixWorld(true);
    this.resumed = this.debug.resumed = true;
    this.placeKit(true);
    this.debug.kitOrigin = root.getWorldPosition(this.tmp2).toArray().map(round3);
    return true;
  }

  private saveKitPose(): void {
    if (this.kitSaved) return;
    const a = this.roomAnchor();
    const root = this.view.root;
    if (!a || root.parent !== a.group) return;
    this.kitSaved = true;
    this.progress.kit = { uuid: a.uuid, x: round4(root.position.x), y: round4(root.position.y), z: round4(root.position.z), yaw: round4(root.rotation.y) };
    if (this.settings.placeFresh) {
      this.settings = { ...this.settings, placeFresh: false };
      saveSettings(this.settings);
    }
    saveProgress(this.progress);
  }

  // ------------------------------------------------------------------ tap-along timing check

  private startCalibration(): void {
    const spb = 60 / 90;
    const t0 = this.clock.t + 1;
    const clicks: number[] = [];
    for (let k = 0; k < 8; k++) {
      const at = t0 + k * spb;
      clicks.push(at);
      audio.click(this.clock.toAudio(at), k % 4 === 0);
      this.later(at, () => this.view.pad('kick')?.setGlow(1));
    }
    this.cal = { clicks, taps: [], end: t0 + 8 * spb + 0.4 };
    this.view.pad('kick')?.appear('fade');
    this.stage.hint('Tap the red pad with the clicks');
    this.debug.calibrating = 'tapping';
  }

  private tickCalibration(): void {
    const c = this.cal!;
    for (const at of c.clicks) {
      const d = this.clock.t - at;
      if (d > -0.05 && d < 0.25) this.view.pad('kick')?.setGlow(1 - Math.max(0, d) / 0.25);
    }
    if (this.clock.t < c.end) return;
    // hits arrive late by the headset's latency: the median gap is the offset (clicks are scheduled ahead, exactly)
    const off = estimateOffset(c.clicks, c.taps);
    this.cal = null;
    this.stage.hint(null);
    this.debug.calibrating = off === null ? 'skipped' : `done ${Math.round(off * 1000)} ms`;
    this.settings = { ...this.settings, calibrateNext: false, offset: off ?? this.settings.offset };
    saveSettings(this.settings);
    this.flow.opts.offset = this.settings.offset;
    this.debug.offsetMs = Math.round(this.settings.offset * 1000);
    if (!this.progress.introDone) this.view.pad('kick')?.hide();
    this.flow.start(this.clock.t);
  }

  // ------------------------------------------------------------------ session, pause, frames

  private setPaused(p: boolean): void {
    if (p === this.paused) return;
    this.paused = p;
    audio.setPaused(p);
    if (!p) this.flow?.resumeAfterPause(this.clock.t);
  }

  /** XR ended: drop the anchor; the next entry finds the table again (or resumes the saved spot). */
  private endSession(): void {
    this.sessionTime = 0;
    if (this.placement.phase !== 'placed') return;
    if (this.kitEntity.hasComponent(XRAnchor)) this.kitEntity.removeComponent(XRAnchor);
    this.placement = new Placement();
    this.view.root.visible = false;
    this.debug.phase = 'waiting';
    this.debug.anchored = false;
  }

  private watchFrames(delta: number): void {
    this.hudT += delta;
    this.hudFrames++;
    if (this.hudT >= 0.5) {
      const fps = Math.round(this.hudFrames / this.hudT);
      if (this.sessionTime > 3 || this.placement.phase === 'placed') this.hudMin = Math.min(this.hudMin, fps);
      this.debug.fps = fps;
      this.debug.fpsMin = Number.isFinite(this.hudMin) ? this.hudMin : fps;
      this.hudT = 0;
      this.hudFrames = 0;
      if (DEBUG && this.placement.phase === 'placed') {
        const now = performance.now();
        this.hitTimes = this.hitTimes.filter((x) => now - x < 1000);
        const lh = this.debug.lastHit;
        const lat = Math.round(audio.outputLatency() * 1000);
        this.view.debug.set(
          `${fps} fps (min ${this.debug.fpsMin}) · ${this.hitTimes.length} hits/s · last ${lh ? lh.speed.toFixed(2) : '-'} m/s · ${this.queries.planes.entities.size} planes · offset ${this.debug.offsetMs} ms · out ${lat} ms · q${this.debug.degrade}`,
        );
      }
    }
    const sess = this.world.session;
    if (!sess) return;
    const hz = sess.frameRate ?? 72;
    const forced = Number.isFinite(this.forcedDegrade) ? this.forcedDegrade : null;
    const lvl = forced ?? this.guard.sample(delta, hz);
    if (lvl === null || lvl === this.debug.degrade) return;
    this.debug.degrade = lvl;
    audio.setReverb(lvl < 1);
    occluderState.enabled = lvl < 2;
    try {
      this.renderer.xr.setFoveation(FOVEATION[Math.min(2, lvl)]);
    } catch {
      /* unsupported */
    }
  }

  /** World positions of what a test (or a judge script) can touch. */
  targets(): Record<string, number[]> {
    const out: Record<string, number[]> = {};
    if (this.placement.phase !== 'placed') return out;
    const root = this.view.root;
    root.updateMatrixWorld(true);
    for (const [lane, p] of this.view.pads) {
      if (!p.visible) continue;
      p.group.updateMatrixWorld(true);
      // the top of the felt (the gong: its face)
      out[lane] = p.group.localToWorld(this.tmp.set(0, 0.016, 0)).toArray().map(round4);
    }
    this.view.cards.forEach((c, i) => {
      if (c.mesh.visible) out[`card${i}`] = root.localToWorld(this.tmp.copy(c.mesh.position).setY(0)).toArray().map(round4);
    });
    out.plate = root.localToWorld(this.tmp.set(PLATE.x, 0, PLATE.z)).toArray().map(round4);
    out.nudgeUp = root.localToWorld(this.tmp.set(NUDGE.x, 0, NUDGE.upZ)).toArray().map(round4);
    out.nudgeDown = root.localToWorld(this.tmp.set(NUDGE.x, 0, NUDGE.downZ)).toArray().map(round4);
    out.table = root.localToWorld(this.tmp.set(0.0, 0, 0.12)).toArray().map(round4);
    out.head = this.head.toArray().map(round4);
    void this.tmpQ;
    return out;
  }

  /** Song index for a card (E2E). */
  static songCount(): number {
    return SONGS.length;
  }
}

function mkPoints(): Point[] {
  return [
    { x: 0, y: 1, z: 0, r: 0.02 },
    { x: 0, y: 1, z: 0, r: 0.008 },
    { x: 0, y: 1, z: 0, r: 0.008 },
    { x: 0, y: 1, z: 0, r: 0.008 },
  ];
}

function lowest(pts: readonly Point[], surface: number): Point {
  let best = pts[0];
  for (const p of pts) if (p.y - p.r - surface < best.y - best.r - surface) best = p;
  return best;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

export function insidePolygon(poly: ReadonlyArray<{ x: number; z: number }> | undefined, x: number, z: number, margin: number): boolean {
  if (!poly || poly.length < 3) return false;
  let inside = false;
  let minD = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const l2 = ex * ex + ez * ez || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / l2));
    minD = Math.min(minD, Math.hypot(x - (a.x + t * ex), z - (a.z + t * ez)));
  }
  return inside || minD <= margin;
}
