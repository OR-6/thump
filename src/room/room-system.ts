/**
 * RoomSystem: finds the table, lays the kit on it, turns every surface of your room into an
 * instrument, and runs the game.
 *
 * Each frame: hands (from HandTrackerSystem, world space) → each surface near a hand, in that
 * surface's own frame → its StrikeDetector → the nearest surface's strike → its instrument (a drum by
 * position on the table, a bar on the door, a key on the window…) sounds at once on the audio clock,
 * its overlay flashes, and the Game judges it. A surface's first hit discovers it: its overlay draws
 * itself and the module's room map fills.
 *
 * Placement: a table plane straight ahead places the kit at once; else a palm resting flat for 0.8 s;
 * else a default height after 8 s with no hands. The kit is held by IWSDK's persistent room anchor.
 */
import { reportFrameError } from '../app/safe.js';
import {
  createSystem,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
  VisibilityState,
  XRAnchor,
  XRMesh,
  XRPlane,
  SceneUnderstandingSystem,
  type Entity,
  type Object3D,
} from '@iwsdk/core';
import { PADS, PLACE, STRIKE, type Lane } from '../config.js';
import { hands, type Side } from '../input/hands.js';
import { Placement, kitPose } from '../app/placement.js';
import { FrameGuard } from '../app/frame-guard.js';
import { occluderState } from '../input/occluders.js';
import type { HandSample, Point, Strike } from '../kit/strike.js';
import { kitLayout, pickPad, type PadSpot } from '../kit/layout.js';
import { KitView, KIT_ZONE } from '../kit/kit-view.js';
import { LED } from '../kit/pad-view.js';
import { MODULE, Module, KEYS, type ModuleKey } from '../ui/module.js';
import { Tag, DebugBoard } from '../ui/tag.js';
import { audio } from '../audio/engine.js';
import { loadProgress, saveProgress, freshProgress, type Progress } from '../persistence/progress.js';
import { loadSettings, saveSettings, type Settings } from '../persistence/settings.js';
import { motion, prefersReducedMotion } from '../ui/motion.js';
import { Game, type GameStage, type Room, type Unlock } from '../play/game.js';
import { Surface, isGlass, surfaceName, swappable } from './surface.js';
import { SurfaceBuilder, insidePolygon, tuneStrike } from './surface-builder.js';
import { GameClock } from './game-clock.js';
import { ACTIVE_M, AUTOPLAY, DEBUG, FIXED_DESK, params, NEAR_MAX, NEAR_MIN, SEATED_M, STRIKE_CFG, SWAP_NEAR_M, URL_STRIKE } from './params.js';
import { SwapGesture } from './swaps.js';
import { HitLog, TUNE_ITEMS, current, fmt, stepValue, type StrikeTune } from './tuning.js';
import { Overlay, Sheen } from './overlay.js';
import { Motes } from './motes.js';
import { FAMILIES, NEIGHBOURS, nextSwap, orchestrate, type Family } from './classify.js';
import { retune, zoneAt, zoneForDegree, type Zone } from './zones.js';
import type { RoomInstrument } from '../songs/cast.js';
import { PhoneLink } from './phone-link.js';
import { coop } from '../net/coop.js';

const ANCHOR_KEY = 'iwsdk_scene_anchor_uuid';
const RESUME_WINDOW_S = 4;
const FOVEATION = [0.5, 0.75, 1];
const SIDES = ['left', 'right'] as const;
const HOLD_DOTS = 20;

/** Where a song's target key points: a pad, an edge key, or a zone on a room surface. */
interface KeyRef {
  surface: Surface | null;
  kind: 'pad' | 'keys' | 'zone';
  lane: Lane;
  zone: number;
}

export interface RoomDebug {
  phase: string;
  deskY: number | null;
  deskSource: string | null;
  kitOrigin: number[] | null;
  anchored: boolean;
  resumed: boolean;
  hits: number;
  lastHit: { surface: string; family: string; zone: number; gain: number; speed: number; kind: string; grade: string | null } | null;
  surfaces: { id: string; label: string; family: string | null; discovered: boolean; reach: number; area: number; hollow: number; glass: number; soft: number; why: string }[];
  planes: number;
  meshes: number;
  mode: string;
  found: string[];
  audio: boolean;
  offsetMs: number;
  degrade: number;
  fps: number;
  fpsMin: number;
  tag: string;
  errors: number;
  phone?: string;
  phoneNotes?: number;
}

export class RoomSystem extends createSystem({ planes: { required: [XRPlane] }, meshes: { required: [XRMesh] } }) {
  kit!: KitView;
  game!: Game;
  progress!: Progress;
  settings!: Settings;
  placement = new Placement();
  readonly clock = new GameClock();
  debug!: RoomDebug;
  private kitEntity!: Entity;
  private kitHome: Object3D | null = null;
  private worldRoot = new Group();
  private head = new Vector3();
  private fwd = new Vector3();
  private tmp = new Vector3();
  private tmp2 = new Vector3();
  private planeInv = new Matrix4();
  private planeYs: number[] = [];
  private sessionTime = 0;
  private placedHand: Side = 'right';
  private paused = false;
  private xrBlurred = false;
  private pageHidden = false;
  private resumePending = false;
  private hint!: Tag;
  private holdRing!: InstancedMesh;
  private guard = new FrameGuard();
  private kitSaved = false;
  private needPalm = false;
  /** The surfaces: the kit's table, the module, and the room's. */
  surfaces: Surface[] = [];
  private kitSurface!: Surface;
  private moduleSurface!: Surface;
  private bySource = new Map<object, Surface[]>();
  private overlays = new Map<Surface, Overlay>();
  private holders = new Map<Surface, Group>();
  private sheens = new Map<Surface, Sheen>();
  private kitSheen: Sheen | null = null;
  private keyRefs = new Map<string, KeyRef>();
  private spots: PadSpot[] = [];
  private motes = new Motes();
  private tag = new Tag();
  private board: DebugBoard | null = null;
  private builder = new SurfaceBuilder({
    head: this.head,
    forward: (out) => this.forwardFlat(out),
    kitWorld: () => this.kit.root.matrixWorld,
    others: () => this.bySource.values(),
  });
  private surfT = 0;
  private reachT = 0;
  /** Hand points (world) and a buffer of surface-local points, per hand. */
  private sample: HandSample = { tracked: false, pinching: false, points: mkPoints() };
  private hitAt = { x: 0, z: 0, lane: 'kick' as Lane, pad: -1 };
  private padPts: Point[] = mkPoints();
  private hitTimes: number[] = [];
  private hudT = 0;
  private hudFrames = 0;
  private hudMin = Infinity;
  private audioSession: XRSession | null = null;
  private forcedDegrade = Number(params.get('degrade') ?? NaN);
  private lastWorld = new Vector3();

  init() {
    this.progress = loadProgress();
    const desk = this.progress.desk as Family | undefined;
    if (desk && (NEIGHBOURS.keys as string[]).includes(desk)) this.deskFamily = desk;
    // ?unlock=all (filming): JAM, the tom, swaps and loops without playing the songs first
    if (params.get('unlock') === 'all') {
      this.progress.introDone = true;
      for (const u of ['tom', 'jam', 'swaps', 'loops'] as Unlock[]) if (!(this.progress.unlocks as string[]).includes(u)) (this.progress.unlocks as string[]).push(u);
    }
    this.settings = loadSettings();
    // thresholds tuned in the headset last time (the address's overrides win)
    for (const [k, v] of Object.entries(this.settings.tune) as [keyof StrikeTune, number][]) if (!(k in URL_STRIKE)) STRIKE_CFG[k] = v;
    motion.calm = this.settings.calmMotion ?? prefersReducedMotion();
    audio.setBed(this.settings.band);
    this.kit = new KitView();
    this.kit.setContrast(this.settings.highContrast);
    this.kitEntity = this.world.createTransformEntity(this.kit.root);
    this.kitHome = this.kit.root.parent;
    this.worldRoot.name = 'RoomOverlays';
    this.world.createTransformEntity(this.worldRoot);
    this.worldRoot.add(this.motes.mesh, this.tag.mesh);
    this.hint = new Tag(0.24, 0.036);
    this.worldRoot.add(this.hint.mesh);
    const dot = new SphereGeometry(0.0035, 8, 6);
    this.holdRing = new InstancedMesh(dot, new MeshBasicMaterial({ color: 0xf2efe6 }), HOLD_DOTS);
    this.holdRing.frustumCulled = false;
    this.holdRing.count = 0;
    const m = new Matrix4();
    for (let i = 0; i < HOLD_DOTS; i++) {
      const a = (i / HOLD_DOTS) * Math.PI * 2;
      m.makeTranslation(Math.cos(a) * 0.075, 0, Math.sin(a) * 0.075);
      this.holdRing.setMatrixAt(i, m);
    }
    this.worldRoot.add(this.holdRing);
    if (DEBUG) {
      this.board = new DebugBoard();
      this.board.mesh.position.set(0, 0.16, -0.36);
      this.board.mesh.rotation.x = -0.3;
      this.kit.root.add(this.board.mesh);
    }
    // the kit's table and the module's keys are surfaces like any other
    this.kitSurface = new Surface('kit', 'kit', 'table', STRIKE_CFG);
    this.moduleSurface = new Surface('module', 'module', 'module', STRIKE_CFG);
    this.game = new Game(this.stage, this.progress, this.room, { tempo: this.settings.tempo, offset: this.settings.offset, debug: DEBUG });
    this.debug = {
      phase: 'waiting', deskY: null, deskSource: null, kitOrigin: null, anchored: false, resumed: false, hits: 0, lastHit: null, surfaces: [],
      planes: 0, meshes: 0, mode: 'discover', found: [], audio: false, offsetMs: Math.round(this.settings.offset * 1000), degrade: 0, fps: 0, fpsMin: 0, tag: '', errors: 0,
    };
    (window as unknown as { __thump: unknown }).__thump = { debug: this.debug, game: this, hands, audio, targets: () => this.targets() };
    this.cleanupFuncs.push(
      this.visibilityState.subscribe((s) => {
        this.xrBlurred = s === VisibilityState.VisibleBlurred || s === VisibilityState.Hidden;
        this.setPaused(this.xrBlurred || this.pageHidden);
        if (s === VisibilityState.Visible) {
          const sess = this.world.session;
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
    const onReset = () => this.resetProgress();
    window.addEventListener('thump:reset', onReset);
    this.cleanupFuncs.push(() => window.removeEventListener('thump:reset', onReset));
    this.cleanupFuncs.push(() => this.phone.dispose());
  }

  // ------------------------------------------------------------------ the game's view of the world

  private room: Room = {
    instruments: () => {
      const out: RoomInstrument[] = [];
      for (const s of this.surfaces) if (s.discovered && s.voice && s.source !== 'kit' && s.source !== 'module') out.push({ id: s.id, family: s.voice.family, zones: s.zones.length });
      return out;
    },
    zones: (id) => (id === 'keys' ? this.kit.keyZones.length : (this.surfaces.find((s) => s.id === id)?.zones.length ?? 0)),
    zoneFor: (id, degree) => zoneForDegree(id === 'keys' ? this.kit.keyZones : (this.surfaces.find((s) => s.id === id)?.zones ?? []), degree),
    degreeOf: (id, zone) => (id === 'keys' ? this.kit.keyZones : (this.surfaces.find((s) => s.id === id)?.zones ?? []))[zone]?.degree ?? 0,
  };

  private stage: GameStage = {
    band: (e, at, spb) => audio.band(e, this.clock.toAudio(at), spb),
    light: (key, k) => {
      const r = this.ref(key);
      if (!r) return;
      if (r.kind === 'pad') this.kit.pad(r.lane)?.setGlow(k);
      else if (r.kind === 'keys') this.kit.keys.light(r.zone, k);
      else if (r.surface) this.overlays.get(r.surface)?.light(r.zone, k);
    },
    celebrate: (stars) => {
      // a light sweep across every instrument, the kit's LEDs in order, and a note for each star as it fills
      for (const o of this.overlays.values()) o.sweep();
      this.kit.keys.sweep();
      let k = 0;
      for (const p of this.kit.pads.values()) if (p.visible) this.later(this.clock.t + 0.08 * k++, () => p.hit(0.7));
      // each star lands as a note of the song's own chord, on its melody instrument (the tonic, the third, the fifth, then the ninth)
      const fam = this.melodyFamily();
      const root = 72 + this.game.keyPc;
      const notes = [0, 4, 7, 14];
      for (let i = 0; i < stars; i++) this.later(this.clock.t + 0.45 * (i + 1), () => audio.modal(fam, root + notes[i], 0.75, (i - 1) * 0.3, 0, 0.4, 'stars'));
      if (stars === 3) this.later(this.clock.t + 1.8, () => audio.modal(fam, root + notes[3], 0.6, 0, 0, 0.4, 'stars'));
      this.afterFirstSong();
    },
    casting: (c) => {
      // the table marimba glows brighter when a song uses it
      const used = Object.values(c).some((t) => t?.surface === 'keys');
      this.kit.keys.rest = used ? 0.55 : 0.35;
    },
    missed: (key) => {
      const r = this.ref(key);
      if (!r) return;
      if (r.kind === 'pad') this.kit.pad(r.lane)?.miss();
      else if (r.kind === 'keys') this.kit.keys.miss(r.zone);
      else if (r.surface) this.overlays.get(r.surface)?.miss(r.zone);
    },
    tempo: (t) => {
      this.settings = { ...this.settings, tempo: t };
      saveSettings(this.settings);
    },
    tune: (k) => this.tunePage(k),
    setting: (name, flip) => {
      const s = this.settings;
      const cur = name === 'oneHand' ? s.oneHand : name === 'contrast' ? s.highContrast : !s.noWords;
      if (!flip) return cur;
      const next = { ...s };
      if (name === 'oneHand') next.oneHand = !cur;
      else if (name === 'contrast') next.highContrast = !cur;
      else next.noWords = cur;
      saveSettings(next);
      this.applySettings(next);
      audio.tick();
      return !cur;
    },
    retune: (pc) => {
      for (const s of this.surfaces) if (s.discovered && s.voice && FAMILIES[s.voice.family].melodic) retune(s.zones, s.voice.family, s.voice.size, pc);
      retune(this.kit.keyZones, 'keys', 0.5, pc);
    },
    save: (p) => {
      saveProgress(p);
      if (Math.abs(this.game.opts.offset - this.settings.offset) > 0.001) {
        this.settings = { ...this.settings, offset: this.game.opts.offset };
        saveSettings(this.settings);
        this.debug.offsetMs = Math.round(this.settings.offset * 1000);
      }
    },
    unlock: (u: Unlock) => {
      if (u === 'swaps') this.later(this.clock.t + 7, () => this.tellSwaps());
      if (u === 'tom') {
        this.layout();
        this.kit.pad('tom')?.appear('slide');
        audio.whoosh(-0.4);
      }
    },
    voice: (key, at, vel) => {
      const r = this.ref(key);
      if (!r) return;
      const when = this.clock.toAudio(at);
      if (r.kind === 'pad') {
        const p = this.kit.pad(r.lane);
        audio.drum(r.lane, vel, p ? Math.max(-0.8, Math.min(0.8, p.x / 0.4)) : 0, when);
        this.later(at, () => p?.hit(vel * 0.8));
        return;
      } else if (r.kind === 'keys') {
        const q = this.kit.keyZones[r.zone];
        if (q) audio.modal(this.deskFamily, q.midi, vel, 0, when, 0.5, 'desk', 0);
      } else if (r.kind === 'zone' && r.surface?.voice) {
        const z = r.surface.zones[r.zone];
        if (z) {
          this.lastWorld.set(z.x, 0, -z.z).applyMatrix4(r.surface.world);
          audio.modal(r.surface.voice.family, z.midi, vel, this.panOf(this.lastWorld), when, r.surface.voice.size, r.surface.id, r.zone);
        }
      }
      // its note lights where it plays, when it plays
      this.pendingLights.push({ at, key, vel });
    },
    bandmate: (event, surface) => {
      const s = surface === 'keys' ? null : this.surfaces.find((x) => x.id === surface);
      const o = s ? this.overlays.get(s) : this.kit.keys;
      if (event === 'claim') {
        this.phone.open();
        o?.sweep();
        audio.chirp('hello');
        if (!this.settings.noWords) {
          if (s) this.tmp.set(s.anchor.x, 0.05, -s.anchor.z - 0.12).applyMatrix4(s.world);
          else this.tmp.set(0, 0.06, -0.12).applyMatrix4(this.kit.root.matrixWorld);
          this.tag.show('Your bandmate plays this', 0xf2efe6, this.tmp, this.head, 3);
        }
      } else if (event === 'happy') {
        audio.chirp('happy');
      } else if (event === 'simpler') {
        audio.chirp('turn');
      }
    },
  };
  /** The phone jam: a code on the module; a friend's phone becomes the bass. */
  private phone = new PhoneLink({
    game: () => this.game,
    now: () => this.clock.t,
    debug: () => this.debug,
    connected: () => {
      if (this.settings.noWords) return;
      this.tmp.set(0, 0.12, -0.2).applyMatrix4(this.kit.root.matrixWorld);
      this.tag.show("A friend's phone is the bass", 0x2ad1b5, this.tmp, this.head, 3);
    },
  });

  /** The bandmate's notes, lit when they play. */
  private pendingLights: { at: number; key: string; vel: number }[] = [];
  private timed: { at: number; fn: () => void }[] = [];
  private later(at: number, fn: () => void): void {
    this.timed.push({ at, fn });
  }
  private farTold = false;

  /** Same-kind surfaces get different instruments (an orchestra, not five gongs); found ones keep theirs. */
  private orchestrate(): void {
    this.orchTaken.length = 0;
    this.orchFree.length = 0;
    for (const s of this.surfaces) {
      if (s.source !== 'plane' && s.source !== 'volume') continue;
      if (s.discovered && s.voice) this.orchTaken.push(s.voice.family);
      else if (s.natural && !s.as) this.orchFree.push({ id: s.id, natural: s.natural, area: s.features?.area ?? 0, s });
    }
    if (!this.orchFree.length) return;
    const plan = orchestrate(this.orchFree, this.orchTaken);
    for (const f of this.orchFree) {
      const want = plan.get(f.id) ?? f.natural;
      const auto = want === f.natural ? null : want;
      if (auto === f.s.auto) continue;
      f.s.auto = auto;
      f.s.setFeatures(f.s.features);
      tuneStrike(f.s);
    }
  }
  private orchTaken: Family[] = [];
  private orchFree: { id: string; natural: Family; area: number; s: Surface }[] = [];

  /** The instrument carrying the melody in the song just played (for its stars), else the table keys. */
  private melodyFamily(): Family {
    const f = this.game.cast?.melody?.family as Family | undefined;
    return f && f !== 'kit' && f !== 'keys' && FAMILIES[f]?.melodic ? f : this.deskFamily;
  }

  // ------------------------------------------------------------------ tuning (device sessions)

  private tuneAt = 0;
  readonly hitLog = new HitLog();
  private lastSide: Side = 'right';
  private pinchHeld = [0, 0];

  /** The tuning page: ◀ ▶▶ choose a threshold, − + change it (applied at once, saved), with readouts from the last hits. */
  private tunePage(k: ModuleKey | null): { line: string; sub: string; labels: string[] } {
    const n = TUNE_ITEMS.length;
    if (k === 'prev' || k === 'next') this.tuneAt = (this.tuneAt + (k === 'next' ? 1 : n - 1)) % n;
    const item = TUNE_ITEMS[this.tuneAt];
    if (k === 'jam' || k === 'loop') {
      const dir = k === 'loop' ? 1 : -1;
      const tune = { ...this.settings.tune };
      if (item.key === 'defaults') {
        if (dir > 0) {
          for (const key of Object.keys(tune) as (keyof StrikeTune)[]) delete tune[key];
          this.setStrike(tune, 0);
          this.hitLog.reset();
        }
      } else if (item.key === 'offset') {
        this.setStrike(tune, stepValue(item, this.game.opts.offset, dir));
      } else {
        tune[item.key] = stepValue(item, current(STRIKE_CFG, item.key), dir);
        this.setStrike(tune, this.game.opts.offset);
      }
      audio.tick();
    }
    const value = item.key === 'defaults' ? '' : item.key === 'offset' ? fmt(item, this.game.opts.offset) : fmt(item, current(STRIKE_CFG, item.key));
    return {
      line: `${item.name}${value ? ' ' + value : ''}`,
      sub: this.hitLog.readout(item, this.debug.fps, Math.round(this.game.opts.offset * 1000)),
      labels: ['◀', 'Done', '▶', '−', '+'],
    };
  }

  /** Apply strike tuning (the address's overrides still win) and a timing offset, to every surface at once, and save. */
  private setStrike(tune: StrikeTune, offset: number): void {
    for (const key of ['minSpeed', 'minDecel', 'nearM', 'latchS', 'rearmM'] as const) {
      if (key in URL_STRIKE) continue;
      if (tune[key] === undefined) delete STRIKE_CFG[key];
      else STRIKE_CFG[key] = tune[key];
    }
    for (const s of [this.kitSurface, this.moduleSurface]) Object.assign(s.detector.cfg, STRIKE, STRIKE_CFG);
    for (const list of this.bySource.values()) for (const s of list) tuneStrike(s);
    this.game.opts.offset = offset;
    this.settings = { ...this.settings, tune, offset };
    saveSettings(this.settings);
    this.debug.offsetMs = Math.round(offset * 1000);
  }

  // ------------------------------------------------------------------ swaps

  /** Pinch and hold an instrument (after Kitchen Clock): it changes to the next that suits it. Off during songs and jams. */
  private watchSwaps(): void {
    const on = (this.progress.unlocks as string[]).includes('swaps') && (this.game.mode === 'discover' || this.game.mode === 'results') && this.game.looper.state === 'off';
    const s = this.swaps.update(this.bothHands, on, this.clock.t, this.swapTarget, this.swapStarted);
    if (s === 'desk') this.swapDesk();
    else if (s) this.swap(s);
  }
  private swaps = new SwapGesture<Surface | 'desk'>();
  private bothHands = [hands.left, hands.right];
  /** The found instrument a pinch here would change: the nearest within 6 cm. */
  private swapTarget = (p: Vector3): Surface | 'desk' | null => {
    // the desk's bars (a seated player's melody: the airplane test)
    if (this.kit.keys.group.visible) {
      this.tmp.copy(p);
      this.kit.root.worldToLocal(this.tmp);
      for (const q of this.kit.keyZones) {
        if (Math.abs(this.tmp.x - q.x) <= q.w / 2 + 0.02 && Math.abs(this.tmp.z + q.z) <= q.h / 2 + 0.02 && Math.abs(this.tmp.y) < SWAP_NEAR_M) return 'desk';
      }
    }
    let best: Surface | null = null;
    let bd = SWAP_NEAR_M;
    for (const s of this.surfaces) {
      if (!s.discovered || !swappable(s)) continue;
      const d = s.distanceTo(p);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  };
  private swapStarted = (s: Surface | 'desk'): void => {
    if (s === 'desk') this.kit.keys.sweep();
    else this.overlays.get(s)?.sweep();
    audio.tick();
  };

  /** What the desk's bars play; pinch and hold them to change it (saved). */
  private deskFamily: Family = 'keys';
  private deskNamed = false;
  private swapDesk(): void {
    const order: Family[] = ['keys', ...NEIGHBOURS.keys];
    this.deskFamily = order[(order.indexOf(this.deskFamily) + 1) % order.length];
    if (this.deskFamily === 'keys') delete this.progress.desk;
    else this.progress.desk = this.deskFamily;
    saveProgress(this.progress);
    this.kit.keys.recolor(FAMILIES[this.deskFamily].color);
    this.kit.keys.reveal();
    this.swapTold = true;
    this.nameDesk();
    // the new instrument introduces itself: its lowest bar, then a fifth up
    const q = this.kit.keyZones[0];
    if (q) {
      audio.modal(this.deskFamily, q.midi, 0.6, 0, 0, 0.5, 'desk');
      audio.modal(this.deskFamily, q.midi + 7, 0.45, 0, audio.now() + 0.22, 0.5, 'desk');
    }
  }
  private nameDesk(): void {
    this.deskNamed = true;
    if (this.settings.noWords) return;
    const q = this.kit.keyZones[3];
    this.tmp.set(q ? q.x : 0, 0.07, q ? -q.z : -0.16);
    this.kit.root.localToWorld(this.tmp);
    this.tag.show(`Table · ${FAMILIES[this.deskFamily].name}`, FAMILIES[this.deskFamily].color, this.tmp, this.head);
  }

  /** The surface plays the next instrument that suits it; the room map and the saved room follow. */
  private swap(s: Surface): void {
    const from = s.voice?.family;
    // the surface may have been replaced while the pinch was held (Quest re-reported its plane)
    if (!from || !s.natural || !this.surfaces.includes(s)) return;
    const to = nextSwap(s.natural, from);
    if (to === from) return;
    s.as = to === s.natural ? null : to;
    s.auto = null;
    s.setFeatures(s.features);
    tuneStrike(s);
    this.hitAt.x = s.anchor.x;
    this.hitAt.z = s.anchor.z;
    // a shaker's brushed sound stops with it
    audio.stopSustain(s.id);
    this.brushPrev.delete(s);
    s.discovered = false;
    this.dropOverlay(s);
    this.keyRefs.clear();
    this.discover(s);
    this.game.rediscovered(from, this.surfaces.some((x) => x !== s && x.discovered && x.voice?.family === from));
    this.swapTold = true;
    if (DEBUG) console.log(`[thump] ${s.id} swapped ${from} → ${s.voice?.family}`);
  }
  private swapTold = false;

  /** Once, when swaps unlock: say how, at a found instrument in reach. */
  private tellSwaps(): void {
    if (this.swapTold || this.settings.noWords) return;
    // the nearest found instrument within a seated reach, else the desk's bars (always there)
    const s = this.surfaces.filter((x) => x.discovered && swappable(x) && x.reach <= SEATED_M).sort((a, b) => a.reach - b.reach)[0];
    this.swapTold = true;
    if (s) {
      this.tmp.set(s.anchor.x, 0.06, -s.anchor.z).applyMatrix4(s.world);
      this.tmp.y = Math.min(this.tmp.y, this.head.y);
      this.tag.show(`${surfaceName(s)}: pinch and hold to swap`, FAMILIES[s.voice!.family].color, this.tmp, this.head, 6);
      return;
    }
    if (!this.kit.keys.group.visible) return;
    const q = this.kit.keyZones[3];
    this.tmp.set(q ? q.x : 0, 0.07, q ? -q.z : -0.16).applyMatrix4(this.kit.root.matrixWorld);
    this.tag.show('Bars: pinch and hold to swap', FAMILIES[this.deskFamily].color, this.tmp, this.head, 6);
    this.kit.keys.sweep();
  }

  /** After the first song: if the room has instruments beyond a seated reach, say where. */
  private afterFirstSong(): void {
    if (this.farTold || this.settings.noWords) return;
    const far = this.surfaces.find((s) => !s.discovered && s.voice && FAMILIES[s.voice.family].melodic && s.reach > SEATED_M && s.reach <= ACTIVE_M);
    if (!far) return;
    this.farTold = true;
    this.later(this.clock.t + 5, () => {
      this.tmp.set((far.bounds.minX + far.bounds.maxX) / 2, 0.06, -(far.bounds.minZ + far.bounds.maxZ) / 2).applyMatrix4(far.world);
      this.tmp.y = Math.min(this.tmp.y, this.head.y);
      this.tag.show(`Stand up · try the ${surfaceName(far).toLowerCase()}`, FAMILIES[far.voice!.family].color, this.tmp, this.head, 6);
    });
  }

  /** Resolve a target key ("surface:zone"), cached. */
  private ref(key: string): KeyRef | null {
    let r = this.keyRefs.get(key);
    if (r) return r;
    const i = key.indexOf(':');
    const sid = key.slice(0, i);
    const rest = key.slice(i + 1);
    if (sid === 'kit') r = { surface: this.kitSurface, kind: 'pad', lane: rest as Lane, zone: 0 };
    else if (sid === 'keys') r = { surface: this.kitSurface, kind: 'keys', lane: 'kick', zone: Number(rest) };
    else {
      const s = this.surfaces.find((x) => x.id === sid);
      if (!s) return null;
      r = { surface: s, kind: 'zone', lane: 'kick', zone: Number(rest) };
    }
    this.keyRefs.set(key, r);
    return r;
  }

  // ------------------------------------------------------------------ settings

  applySettings(s: Settings): void {
    const was = this.settings;
    this.settings = s;
    motion.calm = s.calmMotion ?? prefersReducedMotion();
    audio.setBed(s.band);
    this.game.opts.tempo = s.tempo;
    this.game.opts.offset = s.offset;
    this.debug.offsetMs = Math.round(s.offset * 1000);
    if (was.highContrast !== s.highContrast) {
      this.kit.setContrast(s.highContrast);
      this.kit.keys.recolor(FAMILIES[this.deskFamily].color);
      for (const [surf, o] of this.overlays) o.build(surf.zones, s.highContrast);
    }
    if (was.oneHand !== s.oneHand || was.hand !== s.hand) this.layout();
    if (s.noWords) this.tag.show('', 0, null, null);
  }

  /** "Start over" on the page: forget progress here too (the kit stays where it is). */
  private resetProgress(): void {
    const kitPose = this.progress.kit;
    this.progress = { ...freshProgress(), kit: kitPose, rooms: {} };
    saveProgress(this.progress);
    this.game.endJam();
    this.game.looper.clear();
    this.game = new Game(this.stage, this.progress, this.room, { tempo: this.settings.tempo, offset: this.settings.offset, debug: DEBUG });
    this.game.code = coop.status.state === 'hosting' && coop.status.code ? coop.status.code : '';
    audio.stopSustain();
    this.brushPrev.clear();
    this.pendingLights.length = 0;
    this.timed.length = 0;
    this.farTold = false;
    this.unsaved.length = 0;
    this.kit.keys.rest = 0.35;
    for (const o of this.orphans) this.dropSurface(o.s);
    this.orphans.length = 0;
    for (const o of this.overlays.values()) o.dispose();
    for (const s of this.surfaces) {
      s.discovered = false;
      // swaps are forgotten with everything else: each surface plays what it is again
      if (s.as || s.auto) {
        s.as = null;
        s.auto = null;
        s.setFeatures(s.features);
        tuneStrike(s);
      }
    }
    this.swapTold = false;
    for (const g of this.holders.values()) g.removeFromParent();
    this.overlays.clear();
    this.holders.clear();
    this.kitSurface.discovered = false;
    this.moduleSurface.discovered = true;
    for (const p of this.kit.pads.values()) p.hide();
    this.kit.keys.group.visible = false;
    if (this.placement.phase === 'placed') {
      this.game.start(this.clock.t);
      this.rebuildSheens();
    }
  }

  private handed(): 'left' | 'right' {
    return this.settings.hand === 'auto' ? this.placedHand : this.settings.hand;
  }

  /** The kit's pads: kick, snare, hat, and the tom once unlocked. */
  private lanes(): Lane[] {
    const l: Lane[] = ['kick', 'snare', 'hat'];
    if ((this.progress.unlocks as string[]).includes('tom')) l.push('tom');
    return l;
  }

  private layout(): void {
    const handed = this.handed();
    this.spots = kitLayout(this.lanes(), { handed, oneHand: this.settings.oneHand ? handed : null });
    for (const s of this.spots) {
      const p = this.kit.pad(s.lane)!;
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
      reportFrameError('RoomSystem', e);
    }
  }

  private step(delta: number) {
    if (this.paused) return;
    const dt = Math.min(delta, 0.1);
    this.watchFrames(delta);
    this.clock.tick(Math.min(dt, 0.05), audio.running, audio.now());
    this.debug.audio = audio.running;
    if (this.resumePending && audio.running) {
      this.resumePending = false;
      this.game.resumed(this.clock.t);
    }
    const immersive = this.visibilityState.peek() !== VisibilityState.NonImmersive;
    this.player.head.getWorldPosition(this.head);
    this.tag.update(dt);
    this.hint.update(dt);
    if (this.placement.phase !== 'placed') {
      if (!immersive) return;
      this.sessionTime += dt;
      this.updatePlacement(Math.min(dt, 0.05));
      return;
    }
    this.kit.root.updateMatrixWorld();
    // the anchor may nudge the kit: its surfaces follow
    this.kitSurface.world.copy(this.kit.root.matrixWorld);
    this.kitSurface.inv.copy(this.kitSurface.world).invert();
    this.kit.module.root.updateMatrixWorld();
    this.moduleSurface.world.copy(this.kit.module.root.matrixWorld).multiply(this.modLift);
    this.moduleSurface.inv.copy(this.moduleSurface.world).invert();
    // the room's surfaces come and go as Quest finds them
    this.surfT -= dt;
    if (this.surfT <= 0) {
      this.surfT = 1;
      this.syncSurfaces();
    }
    this.reachT -= dt;
    if (this.reachT <= 0) {
      this.reachT = 0.5;
      this.updateReach();
    }
    this.readHands(delta);
    this.watchSwaps();
    this.brushShakers(delta);
    if (AUTOPLAY) this.autoplay();
    this.game.tick(this.clock.t);
    for (let i = this.timed.length - 1; i >= 0; i--) {
      if (this.timed[i].at <= this.clock.t) {
        const f = this.timed[i].fn;
        this.timed.splice(i, 1);
        f();
      }
    }
    for (let i = this.pendingLights.length - 1; i >= 0; i--) {
      const p = this.pendingLights[i];
      const d = this.clock.t - p.at;
      if (d >= 0) {
        const r = this.ref(p.key);
        if (r?.kind === 'keys') this.kit.keys.hit(r.zone, p.vel);
        else if (r?.surface) this.overlays.get(r.surface)?.hit(r.zone, p.vel);
        this.pendingLights.splice(i, 1);
      }
    }
    this.phone.beat();
    this.kit.module.set(this.game.display);
    this.debug.mode = this.game.mode;
    if (this.debug.found.length !== this.game.found.length) this.debug.found = this.game.found.slice();
    this.kit.update(dt);
    for (const o of this.overlays.values()) o.update(dt);
    for (const sh of this.sheens.values()) sh.update(dt);
    this.kitSheen?.update(dt);
    this.kit.module.root.updateMatrixWorld();
    this.kit.module.root.getWorldPosition(this.tmp2);
    this.tmp2.y += 0.06;
    this.motes.update(this.game.motes, this.game.moteCount, this.tmp2, this.head, this.resolveMote);
    this.debug.anchored = this.kitEntity.hasComponent(XRAnchor) && this.kitEntity.getValue(XRAnchor, 'attached') === true;
    if (this.debug.anchored) this.saveKitPose();
    if (this.unsaved.length && this.roomAnchor()) {
      const list = this.unsaved.splice(0);
      for (const u of list) if (u.discovered) this.remember(u);
    }
  }

  private resolveMote = (key: string, out: Vector3, col: Color): boolean => {
    const r = this.ref(key);
    if (!r) return false;
    if (r.kind === 'pad') {
      const p = this.kit.pad(r.lane);
      if (!p || !p.visible) return false;
      out.set(p.x, 0.022, p.z);
      this.kit.root.localToWorld(out);
      col.setHex(LED[r.lane]);
      return true;
    }
    if (r.kind === 'keys') {
      const z = this.kit.keyZones[r.zone];
      if (!z) return false;
      out.set(z.x, 0.01, -z.z);
      this.kit.root.localToWorld(out);
      col.setHex(FAMILIES.keys.color);
      return true;
    }
    const s = r.surface!;
    const z = s.zones[r.zone];
    if (!z || !s.voice) return false;
    out.set(z.x, 0.012, -z.z).applyMatrix4(s.world);
    col.setHex(FAMILIES[s.voice.family].color);
    return true;
  };

  /** Hands → each surface near them → strikes; the nearest surface's strike plays. */
  private readHands(delta: number): void {
    const t = this.clock.t;
    const inv = this.tmpM.copy(this.kit.root.matrixWorld).invert();
    for (let i = 0; i < 2; i++) {
      const side = SIDES[i];
      const h = hands[side];
      const hand = i as 0 | 1;
      if (h.tracked) {
        // the hand's shadow on the table
        this.tmp.copy(h.palm).applyMatrix4(inv);
        this.kit.setHandShadow(i, this.tmp.x, this.tmp.y - h.palmRadius - this.kitSurface.detector.surfaceY, this.tmp.z);
        this.untracked[i] = 0;
      } else {
        this.kit.setHandShadow(i, 0, Infinity, 0);
        this.untracked[i] += delta;
      }
      this.sample.tracked = h.tracked;
      // a hand holding a pinch (to swap an instrument) is reaching, not hitting
      this.pinchHeld[i] = h.tracked && h.pinch.pinching ? this.pinchHeld[i] + delta : 0;
      this.sample.pinching = this.swaps.holding(i) || (this.pinchHeld[i] > 0.15 && (this.progress.unlocks as string[]).includes('swaps'));
      for (let k = 0; k < this.surfaces.length; k++) {
        const s = this.surfaces[k];
        if (!s.voice && s.source !== 'module') continue;
        if (s.reach > ACTIVE_M && s.source !== 'kit' && s.source !== 'module') continue;
        if (!h.tracked) {
          // tracking lost: keep feeding the gap to the surfaces it was near (a late hit is still a hit), then let go
          if (s.near[i]) {
            s.detector.update(hand, NOT_TRACKED, t, delta);
            if (this.untracked[i] > 0.3) {
              s.detector.forget(hand);
              s.near[i] = false;
            }
          }
          continue;
        }
        s.toZone(h.palm, this.o);
        // a hand is followed from well out (so a fast first slap has a history), struck only near
        const near = this.o.y > NEAR_MIN && this.o.y < NEAR_MAX && s.over(this.o.x, this.o.z, 0.08);
        if (!near) {
          if (s.near[i]) {
            s.detector.forget(hand);
            s.near[i] = false;
          }
          continue;
        }
        s.near[i] = true;
        this.fill(h, s);
        const strike = s.detector.update(hand, this.sample, t, delta);
        if (!strike) continue;
        this.cands.push(s);
        this.candHits.push(strike);
      }
      // one slap is one hit, whichever surfaces it crossed: the same hand can't strike again for a latch.
      // Candidates in order: the module's keys over the table, the kit over a room surface, then the closest contact.
      if (this.cands.length && t - this.handLatch[i] >= (STRIKE_CFG.latchS ?? STRIKE.latchS)) {
        for (let pass = 0; pass < this.cands.length; pass++) {
          let bi = -1;
          for (let c = 0; c < this.cands.length; c++) {
            if (!this.cands[c]) continue;
            if (bi < 0 || this.better(c, bi)) bi = c;
          }
          if (bi < 0) break;
          const s = this.cands[bi]!;
          const strike = this.candHits[bi];
          this.cands[bi] = null;
          this.aim(h, s, strike);
          const target = this.preferInset(s);
          // a hand passing through the wall's plane where a door or a window is set in (walking through a doorway,
          // reaching for a handle) is not a hit on it: those only take a hand that stops
          if (strike.kind === 'cross' && target !== s && target.detector.stopOnly) continue;
          this.handLatch[i] = t;
          this.onHit(target, side, strike);
          this.watchSink(i, target);
          break;
        }
      }
      this.cands.length = 0;
      this.candHits.length = 0;
      this.trackSink(i, h);
    }
  }
  private cands: (Surface | null)[] = [];
  private candHits: Strike[] = [];
  private rank(x: Surface): number {
    return x === this.moduleSurface ? 2 : x === this.kitSurface ? 1 : 0;
  }
  private better(a: number, b: number): boolean {
    const sa = this.cands[a]!;
    const sb = this.cands[b]!;
    const ra = this.rank(sa);
    const rb = this.rank(sb);
    return ra > rb || (ra === rb && Math.abs(this.candHits[a].height) < Math.abs(this.candHits[b].height));
  }

  /** Where a strike landed on a surface (zone coordinates, and the pad on the kit): the middle of the points touching. */
  private aim(h: (typeof hands)['left'], s: Surface, strike: Strike): void {
    this.fill(h, s);
    let sx = 0;
    let sz = 0;
    let n = 0;
    const low = this.sample.points[strike.point];
    const lowH = low.y - low.r;
    for (const q of this.sample.points) {
      if (q.y - q.r - lowH > 0.01) continue;
      sx += q.x;
      sz += q.z;
      n++;
    }
    this.hitAt.x = sx / n;
    this.hitAt.z = sz / n;
    if (s === this.kitSurface) {
      // which pad: kit-local points (zone z is −kit z)
      for (let q = 0; q < this.sample.points.length; q++) {
        const a = this.sample.points[q];
        const b = this.padPts[q];
        b.x = a.x;
        b.y = a.y;
        b.z = -a.z;
        b.r = a.r;
      }
      const visible = this.visibleSpots();
      const pi = pickPad(this.padPts, s.detector.surfaceY, strike.height, visible);
      this.hitAt.pad = pi;
      this.hitAt.lane = pi >= 0 ? visible[pi].lane : 'kick';
    }
  }

  /**
   * A window or a door is set into its wall: the hand meets the wall's plane first, but a strike that
   * lands inside a smaller surface set into that one (nearly parallel, within 12 cm) belongs to it.
   */
  private preferInset(s: Surface): Surface {
    if (s === this.kitSurface || s === this.moduleSurface || !s.features) return s;
    this.lastWorld.set(this.hitAt.x, 0, -this.hitAt.z).applyMatrix4(s.world);
    let best = s;
    for (const t of this.surfaces) {
      if (t === s || !t.voice || !t.features || t.source === 'kit' || t.source === 'module') continue;
      if (t.features.area >= best.features.area || Math.abs(t.normal.dot(s.normal)) < 0.95) continue;
      t.toZone(this.lastWorld, this.o);
      if (Math.abs(this.o.y) > 0.12 || !t.over(this.o.x, this.o.z, 0.01)) continue;
      best = t;
      this.hitAt.x = this.o.x;
      this.hitAt.z = this.o.z;
    }
    return best;
  }
  /** Soft surfaces (shakers) keep sounding while a hand brushes across them, louder the faster. */
  private brushPrev = new Map<Surface, Float64Array>();
  private brushLevel = [0, 0];
  private brushShakers(dt: number): void {
    if (dt <= 0 || dt > 0.1) return;
    for (const s of this.surfaces) {
      if (!s.discovered || s.voice?.family !== 'shaker') continue;
      let prev = this.brushPrev.get(s);
      if (!prev) this.brushPrev.set(s, (prev = new Float64Array([NaN, NaN, NaN, NaN, 0, 0])));
      let level = 0;
      for (let i = 0; i < 2; i++) {
        const h = hands[SIDES[i]];
        if (!h.tracked) {
          prev[i * 2] = NaN;
          continue;
        }
        s.toZone(h.palm, this.o);
        const on = this.o.y - h.palmRadius < 0.04 && this.o.y > -0.08 && s.over(this.o.x, this.o.z, 0.02);
        const px = prev[i * 2];
        const pz = prev[i * 2 + 1];
        prev[4 + i] += dt;
        if (!on) {
          prev[i * 2] = NaN;
          continue;
        }
        const moved = Number.isNaN(px) ? 0 : Math.hypot(this.o.x - px, this.o.z - pz);
        // the tracker repeats samples: measure over the time since the hand last really moved
        if (Number.isNaN(px) || moved > 0.0002) {
          const speed = Number.isNaN(px) ? 0 : moved / Math.max(dt, prev[4 + i]);
          prev[i * 2] = this.o.x;
          prev[i * 2 + 1] = this.o.z;
          prev[4 + i] = 0;
          this.brushLevel[i] = Math.min(1, Math.max(0, (speed - 0.12) / 0.6));
        } else if (prev[4 + i] > 0.08) this.brushLevel[i] = 0;
        level = Math.max(level, this.brushLevel[i]);
      }
      this.lastWorld.set(s.anchor.x, 0, -s.anchor.z).applyMatrix4(s.world);
      audio.sustain(s.id, level, this.panOf(this.lastWorld), s.voice.size);
      if (level > 0.05) this.overlays.get(s)?.light(0, level);
    }
  }

  private prevFamily: Family | null = null;
  private untracked = [0, 0];
  private handLatch = [-Infinity, -Infinity];
  /** Softness from the hand: after a hit, how far the hand goes on past the surface, per hand. */
  private sinkWatch: ({ s: Surface; until: number; deepest: number } | null)[] = [null, null];

  private watchSink(i: number, s: Surface): void {
    if (s.source !== 'plane' && s.source !== 'volume') return;
    this.sinkWatch[i] = { s, until: this.clock.t + 0.15, deepest: 0 };
  }

  /** A surface the hand sinks into (a cushion, a bed) is soft: after a few hits it becomes a shaker. */
  private trackSink(i: number, h: (typeof hands)['left']): void {
    const w = this.sinkWatch[i];
    if (!w || !h.tracked) return;
    w.s.toZone(h.palm, this.o);
    // only while the palm is over it (following through past an edge is not sinking in), at most 4 cm a hit
    const depth = Math.min(0.04, -(this.o.y - h.palmRadius - w.s.detector.surfaceY));
    if (depth > w.deepest && w.s.over(this.o.x, this.o.z, 0)) w.deepest = depth;
    if (this.clock.t < w.until) return;
    this.sinkWatch[i] = null;
    const s = w.s;
    s.sink = s.sink * 0.6 + w.deepest * 0.4;
    s.hits++;
    if (s.hits >= 3 && s.sink > 0.035 && s.voice && s.voice.family !== 'shaker' && s.features.soft < 0.5) {
      this.prevFamily = s.voice.family;
      const f = { ...s.features, soft: Math.min(1, s.sink / 0.04) };
      s.setFeatures(f);
      // still the same instrument (a floor stays a stomp; a swap holds): nothing to redraw
      if (s.voice?.family === this.prevFamily) return;
      tuneStrike(s);
      if (DEBUG) console.log(`[thump] ${s.id} is soft (sinks ${Math.round(s.sink * 1000)} mm): now ${s.voice?.family}`);
      if (s.discovered) {
        // re-draw it as what it really is; the room map swaps its old instrument for the new one
        const from = this.prevFamily;
        s.discovered = false;
        this.dropOverlay(s);
        this.discover(s);
        if (from) this.game.rediscovered(from, this.surfaces.some((x) => x !== s && x.discovered && x.voice?.family === from));
      }
    }
  }

  private o = { x: 0, y: 0, z: 0 };
  private tmpM = new Matrix4();
  private modLift = new Matrix4().makeTranslation(0, MODULE.h + 0.008, 0);
  private spotBuf: PadSpot[] = [];

  private visibleSpots(): PadSpot[] {
    this.spotBuf.length = 0;
    for (const s of this.spots) if (this.kit.pad(s.lane)?.visible) this.spotBuf.push(s);
    return this.spotBuf;
  }

  /** The hand's six points in a surface's zone frame (y = height along its normal). */
  private fill(h: (typeof hands)['left'], s: Surface): void {
    const pts = this.sample.points as Point[];
    this.put(pts[0], h.palm, h.palmRadius, s);
    this.put(pts[1], h.indexTip, h.tipRadius, s);
    this.put(pts[2], h.middleTip, h.tipRadius, s);
    this.put(pts[3], h.ringTip, h.tipRadius, s);
    this.put(pts[4], h.knuckleIndex, 0.011, s);
    this.put(pts[5], h.knucklePinky, 0.011, s);
  }

  private put(p: Point, w: Vector3, r: number, s: Surface): void {
    s.toZone(w, this.o);
    p.x = this.o.x;
    p.y = this.o.y;
    p.z = this.o.z;
    p.r = r;
  }

  /** A strike on a surface: discover it (the first time), sound it, show it, judge it. */
  private onHit(s: Surface, side: Side, st: Strike): void {
    this.lastSide = side;
    const t = st.t;
    const gain = st.gain;
    this.debug.hits++;
    this.hitTimes.push(performance.now());
    if (this.hitTimes.length > 64) this.hitTimes.splice(0, 32);
    if (s === this.moduleSurface) {
      const k = zoneAt(s.zones, this.hitAt.x, this.hitAt.z);
      if (k >= 0) {
        this.kit.module.pressKey(k);
        audio.tick();
        this.game.key(KEYS[k]);
        this.record(s, k, gain, st, null);
      }
      return;
    }
    if (!s.discovered) this.discover(s);
    if (s === this.kitSurface) return this.hitKit(side, gain, st, t);
    const z = zoneAt(s.zones, this.hitAt.x, this.hitAt.z);
    const zone = s.zones[z];
    if (!zone || !s.voice) return;
    this.lastWorld.set(zone.x, 0, -zone.z).applyMatrix4(s.world);
    // glass is for taps: a hard hit plays no louder than a gentle one
    const g0 = isGlass(s) ? Math.min(gain, 0.55) : gain;
    audio.modal(s.voice.family, zone.midi, g0, this.panOf(this.lastWorld), 0, s.voice.size, s.id, z);
    this.overlays.get(s)?.hit(z, gain);
    const grade = this.game.hit(`${s.id}:${z}`, t, gain);
    if (grade === 'perfect') {
      this.overlays.get(s)?.perfect(z);
    }
    this.record(s, z, gain, st, grade);
  }

  private hitKit(side: Side, gain: number, st: Strike, t: number): void {
    void side;
    const x = this.hitAt.x;
    const kz = -this.hitAt.z; // kit-local z (toward the player)
    // an edge key?
    if (this.kit.keys.group.visible) {
      for (let i = 0; i < this.kit.keyZones.length; i++) {
        const q = this.kit.keyZones[i];
        if (Math.abs(x - q.x) <= q.w / 2 + 0.012 && Math.abs(-kz - q.z) <= q.h / 2 + 0.014) {
          this.lastWorld.set(q.x, 0, -q.z);
          this.kit.root.localToWorld(this.lastWorld);
          audio.modal(this.deskFamily, q.midi, gain, this.panOf(this.lastWorld), 0, 0.5, 'desk', i);
          this.kit.keys.hit(i, gain);
          if (!this.deskNamed) this.nameDesk();
          const g = this.game.hit(`keys:${i}`, t, gain);
          if (g === 'perfect') {
            this.kit.keys.perfect(i);
          }
          this.record(this.kitSurface, i, gain, st, g, 'keys');
          return;
        }
      }
    }
    // a pad, or a drum by where on the table: left kick, centre snare, right hat, the edges a rim
    let lane: Lane | 'rim' = this.hitAt.pad >= 0 ? this.hitAt.lane : this.drumAt(x, kz);
    if (lane !== 'rim' && !this.kit.pad(lane)?.visible) lane = 'snare';
    const pan = Math.max(-0.8, Math.min(0.8, x / 0.4));
    audio.drum(lane, gain, pan, 0, 1);
    if (lane !== 'rim') this.kit.pad(lane)?.hit(gain);
    const g = this.game.hit(`kit:${lane === 'rim' ? 'snare' : lane}`, t, gain);
    if (g === 'perfect' && lane !== 'rim') {
      this.kit.pad(lane)?.perfect();
    }
    this.record(this.kitSurface, 0, gain, st, g, lane);
  }

  /** Off the pads, the table still plays: by where you hit it. */
  private drumAt(x: number, z: number): Lane | 'rim' {
    const hx = this.handed() === 'left' ? -x : x;
    // the real table's edge is a rim; without it, the kit area's edge is
    if (this.tableOutline ? this.toTableEdge(x, z) < 0.04 : Math.abs(x) > KIT_ZONE.halfX || z > KIT_ZONE.front || z < KIT_ZONE.back) return 'rim';
    if (hx < -0.17) return this.lanes().includes('tom') ? 'tom' : 'kick';
    if (hx < 0) return 'kick';
    if (hx < 0.17) return 'snare';
    return 'hat';
  }

  private record(s: Surface, zone: number, gain: number, st: Strike, grade: string | null, what = ''): void {
    const f = s.features;
    this.hitLog.add({ t: st.t, speed: st.speed, kind: st.kind, heightMm: st.height * 1000, surface: s.id, side: this.lastSide });
    this.debug.lastHit = { surface: s.id, family: what || (s.voice?.family ?? 'module'), zone, gain: r3(gain), speed: r3(st.speed), kind: st.kind, grade };
    if (DEBUG && f) {
      console.log(`[thump] hit ${s.id} '${s.label}' ${s.voice?.family ?? '-'} zone ${zone} · ${st.kind} ${st.speed.toFixed(2)} m/s gain ${gain.toFixed(2)} · area ${f.area.toFixed(2)} hollow ${f.hollow} glass ${f.glass} soft ${f.soft} · out ${Math.round(audio.outputLatency() * 1000)} ms`);
    }
  }

  private panOf(p: Vector3): number {
    // left/right of where the player faces
    this.forwardFlat(this.fwd);
    this.tmp.copy(p).sub(this.head).setY(0);
    const len = this.tmp.length();
    if (len < 1e-4) return 0;
    const right = -this.fwd.z * this.tmp.x + this.fwd.x * this.tmp.z;
    return Math.max(-0.9, Math.min(0.9, right / len));
  }

  // ------------------------------------------------------------------ discovery

  /** Save a found instrument under the room's anchor, so it's there next time in this room. */
  private remember(s: Surface): void {
    const a = this.roomAnchor();
    if (!s.voice) return;
    if (!a) {
      if (!this.unsaved.includes(s)) this.unsaved.push(s);
      return;
    }
    const list = (this.progress.rooms[a.uuid] ??= []);
    if (s === this.kitSurface) {
      if (!list.some((i) => i.family === 'kit')) list.push({ family: 'kit', x: 0, y: 0, z: 0 });
    } else {
      a.group.updateMatrixWorld(true);
      const w = this.tmp2.set(s.anchor.x, 0, -s.anchor.z).applyMatrix4(s.world);
      const local = w.applyMatrix4(this.tmpM2.copy(a.group.matrixWorld).invert());
      // one entry per place: a surface found again as something else replaces its old entry
      const near = list.findIndex((x) => x.family !== 'kit' && Math.hypot(x.x - local.x, x.y - local.y, x.z - local.z) < 0.15);
      const plays = s.voice.family !== s.natural ? s.voice.family : null;
      const entry = { family: s.natural ?? s.voice.family, x: r4(local.x), y: r4(local.y), z: r4(local.z), ...(plays ? { as: plays } : {}) };
      if (near >= 0) list[near] = entry;
      else list.push(entry);
    }
    saveProgress(this.progress);
  }
  private tmpM2 = new Matrix4();
  /** Found before the room anchor existed: saved once it does. */
  private unsaved: Surface[] = [];

  /** Instruments found here before come back already drawn (no tag, no chime; the room map counts them). */
  private restore(s: Surface): boolean {
    const a = this.roomAnchor();
    const list = a ? this.progress.rooms[a.uuid] : undefined;
    if (!a || !list || !s.voice || s.discovered) return false;
    a.group.updateMatrixWorld(true);
    if (s === this.kitSurface) {
      if (!list.some((i) => i.family === 'kit')) return false;
      this.restoring = true;
      this.discover(s);
      this.restoring = false;
      return true;
    }
    for (const i of list) {
      if (i.family !== s.natural) continue;
      const w = this.tmp2.set(i.x, i.y, i.z).applyMatrix4(a.group.matrixWorld);
      s.toZone(w, this.o);
      if (Math.abs(this.o.y) > 0.1 || !s.over(this.o.x, this.o.z, 0.05)) continue;
      if (i.as && i.as in FAMILIES) {
        s.as = i.as as Family;
        s.setFeatures(s.features);
        tuneStrike(s);
      }
      this.hitAt.x = this.o.x;
      this.hitAt.z = this.o.z;
      this.restoring = true;
      this.discover(s);
      this.restoring = false;
      return true;
    }
    return false;
  }
  private restoring = false;

  /** A surface's first hit: its instrument draws itself in, named for two seconds; the room map fills. */
  private discover(s: Surface): void {
    s.discovered = true;
    const v = s.voice;
    if (!v) return;
    if (s === this.kitSurface) {
      this.layout();
      this.kit.reveal(this.lanes());
      this.kit.keys.recolor(FAMILIES[this.deskFamily].color);
      this.kitSheen?.group.removeFromParent();
      this.kitSheen = null;
    } else {
      s.layZones({ x: this.hitAt.x, z: this.hitAt.z }, this.game.keyPc);
      const holder = new Group();
      holder.matrixAutoUpdate = false;
      holder.matrix.copy(s.world);
      const o = new Overlay(v.family, Math.max(1, s.zones.length));
      o.build(s.zones, this.settings.highContrast);
      o.reveal();
      holder.add(o.group);
      this.worldRoot.add(holder);
      this.overlays.set(s, o);
      this.holders.set(s, holder);
      const sh = this.sheens.get(s);
      if (sh) {
        sh.group.parent?.removeFromParent();
        sh.dispose();
        this.sheens.delete(s);
      }
    }
    if (!this.restoring && s !== this.kitSurface) {
      // the instrument answers itself, a fifth up, softly: no generic ding over its first note
      const z = s.zones[zoneAt(s.zones, this.hitAt.x, this.hitAt.z)] ?? s.zones[0];
      if (z && FAMILIES[v.family].melodic) audio.modal(v.family, z.midi + 7, 0.4, this.panOf(this.tmp.set(z.x, 0, -z.z).applyMatrix4(s.world)), audio.now() + 0.25, v.size, s.id);
    }
    if (!this.settings.noWords && !this.restoring) {
      const name = `${surfaceName(s)} · ${FAMILIES[v.family].name}${isGlass(s) ? ' · tap gently' : ''}`;
      // the tag stands just off the surface where it was hit, facing you
      this.tmp.set(this.hitAt.x, 0.05, -this.hitAt.z).applyMatrix4(s.world);
      if (s === this.kitSurface) this.tmp.set(0, 0.1, 0.05).applyMatrix4(s.world);
      else this.tmp.y += 0.07;
      this.tag.show(name, FAMILIES[v.family].color, this.tmp, this.head);
      this.debug.tag = name;
    }
    if (DEBUG) console.log(`[thump] discovered ${s.id} '${s.label}' → ${v.family} (${v.why}) size ${v.size.toFixed(2)}`);
    if (!this.restoring) this.remember(s);
    if (!this.restoring && !this.swapTold && swappable(s) && (this.progress.unlocks as string[]).includes('swaps')) this.later(this.clock.t + 2.5, () => this.tellSwaps());
    this.game.discovered(v.family, s === this.kitSurface ? 'table' : surfaceName(s).toLowerCase(), this.clock.t);
    this.refreshDebugSurfaces();
  }

  // ------------------------------------------------------------------ the room's surfaces

  /** Planes and room-scan volumes → surfaces; kept stable across frames (discoveries survive). */
  private syncSurfaces(): void {
    this.seenSrc.clear();
    let planes = 0;
    let meshes = 0;
    let changed = false;
    const kitY = this.kit.root.getWorldPosition(this.kitC).y;
    const created: Surface[] = [];
    for (const e of this.queries.planes.entities) {
      const pl = e.getValue(XRPlane, '_plane') as (XRPlane & { semanticLabel?: string; polygon?: DOMPointReadOnly[] }) | undefined;
      const obj = e.object3D;
      if (!pl || !obj) continue;
      planes++;
      this.seenSrc.add(pl);
      const had = this.bySource.get(pl);
      obj.updateMatrixWorld();
      if (had && !this.moved(pl, obj)) continue;
      // new, or Quest moved it (a recentre, a better fit): build it afresh, keeping what was found on it
      const s = this.builder.fromPlane(pl, obj, kitY, this.kitC);
      this.srcPose.set(pl, obj.matrixWorld.clone());
      if (had) for (const old of had) this.orphan(old);
      this.bySource.set(pl, s ? [s] : []);
      if (s) created.push(s);
      changed = true;
    }
    for (const e of this.queries.meshes.entities) {
      const mesh = e.getValue(XRMesh, '_mesh') as object | undefined;
      const obj = e.object3D;
      if (!mesh || !obj) continue;
      meshes++;
      this.seenSrc.add(mesh);
      const had = this.bySource.get(mesh);
      obj.updateMatrixWorld();
      // a box's faces are picked from where you stand: walk a metre away and they're picked again
      const stale = had && had.every((x) => !x.discovered) && this.volumeHead.get(mesh)!.distanceTo(this.head) > 1;
      if (had && !stale && !this.moved(mesh, obj)) continue;
      let list: Surface[] = [];
      if (e.getValue(XRMesh, 'isBounded3D')) {
        const label = String(e.getValue(XRMesh, 'semanticLabel') ?? '').toLowerCase();
        list = this.builder.fromVolume(label, obj, e.getVectorView(XRMesh, 'min'), e.getVectorView(XRMesh, 'max'));
      }
      this.srcPose.set(mesh, obj.matrixWorld.clone());
      this.volumeHead.set(mesh, this.head.clone());
      if (had) for (const old of had) this.orphan(old);
      this.bySource.set(mesh, list);
      created.push(...list);
      changed = true;
    }
    for (const [src, list] of this.bySource) {
      if (this.seenSrc.has(src)) continue;
      for (const old of list) this.orphan(old);
      this.bySource.delete(src);
      this.srcPose.delete(src);
      changed = true;
    }
    // a replaced or moved surface keeps its instrument, its id and where its notes are
    for (const s of created) this.adopt(s);
    const now = this.clock.t;
    for (let k = this.orphans.length - 1; k >= 0; k--) {
      if (now - this.orphans[k].at > 4) {
        this.dropSurface(this.orphans[k].s);
        this.orphans.splice(k, 1);
      }
    }
    if (changed) {
      // what's inset in what may have changed (a window appears after its wall)
      for (const list of this.bySource.values())
        for (const s of list) {
          if (s.discovered || s.source !== 'plane' || s.features.facing !== 'vertical') continue;
          const f = { ...s.features, hollow: 0, glass: 0 };
          this.builder.measure(s, f);
          s.setFeatures(f);
          tuneStrike(s);
        }
    }
    this.debug.planes = planes;
    this.debug.meshes = meshes;
    this.surfaces.length = 0;
    this.surfaces.push(this.kitSurface, this.moduleSurface);
    for (const list of this.bySource.values()) for (const s of list) this.surfaces.push(s);
    for (const s of this.surfaces) if (!s.discovered && s.source !== 'module') this.restore(s);
    this.orchestrate();
    this.updateReach();
    if (changed) this.rebuildSheens();
  }
  private seenSrc = new Set<object>();
  private srcPose = new Map<object, Matrix4>();
  private volumeHead = new Map<object, Vector3>();
  private kitC = new Vector3();
  private orphans: { s: Surface; at: number }[] = [];

  /** Has a plane or box moved more than a centimetre or a degree since it was built? */
  private moved(src: object, obj: Object3D): boolean {
    const was = this.srcPose.get(src);
    if (!was) return true;
    const a = was.elements;
    const b = obj.matrixWorld.elements;
    if (Math.hypot(a[12] - b[12], a[13] - b[13], a[14] - b[14]) > 0.01) return true;
    for (let k = 0; k < 11; k++) if (k !== 3 && k !== 7 && Math.abs(a[k] - b[k]) > 0.0175) return true;
    return false;
  }

  /** A surface that went away: kept a few seconds in case its replacement arrives. */
  private orphan(s: Surface): void {
    if (s.discovered) this.orphans.push({ s, at: this.clock.t });
    else this.dropSurface(s);
  }

  /** A new surface where a found one was (same instrument, coplanar within 5 cm): it takes over. */
  private adopt(s: Surface): void {
    if (!s.voice) return;
    for (let k = 0; k < this.orphans.length; k++) {
      const o = this.orphans[k].s;
      // what the hand learned (it's soft) carries over to the replacement
      if (o.features.soft >= 0.5 && s.features.soft < 0.5 && Math.abs(o.normal.dot(s.normal)) > 0.95) {
        s.setFeatures({ ...s.features, soft: o.features.soft });
        s.sink = o.sink;
        tuneStrike(s);
      }
      if (o.natural !== s.natural || Math.abs(o.normal.dot(s.normal)) < 0.95) continue;
      const w = this.tmp.set(o.anchor.x, 0, -o.anchor.z).applyMatrix4(o.world);
      s.toZone(w, this.o);
      if (Math.abs(this.o.y) > 0.05 || !s.over(this.o.x, this.o.z, 0.1)) continue;
      this.orphans.splice(k, 1);
      this.dropSurface(o);
      s.id = o.id;
      if (o.as || o.auto) {
        s.as = o.as ?? o.auto;
        s.setFeatures(s.features);
        tuneStrike(s);
      }
      this.hitAt.x = this.o.x;
      this.hitAt.z = this.o.z;
      this.restoring = true;
      this.discover(s);
      this.restoring = false;
      return;
    }
  }


  private dropOverlay(s: Surface): void {
    this.overlays.get(s)?.dispose();
    this.holders.get(s)?.removeFromParent();
    this.holders.delete(s);
    this.overlays.delete(s);
  }

  private dropSurface(s: Surface): void {
    this.dropOverlay(s);
    audio.stopSustain(s.id);
    this.brushPrev.delete(s);
    const sh = this.sheens.get(s);
    if (sh) {
      sh.group.parent?.removeFromParent();
      sh.dispose();
      this.sheens.delete(s);
    }
    for (const [k, r] of this.keyRefs) if (r.surface === s) this.keyRefs.delete(k);
  }

  private updateReach(): void {
    let fams = new Set<Family>();
    for (const s of this.surfaces) {
      s.reach = s.source === 'kit' || s.source === 'module' ? 0 : s.distanceTo(this.head);
      if (s.voice && s.source !== 'module' && (s.reach <= SEATED_M || s.discovered)) fams.add(s.voice.family);
    }
    fams = new Set([...fams].filter((f) => f !== 'keys'));
    if (this.game.roomTotal !== fams.size) {
      this.game.roomTotal = fams.size;
      this.game.refreshDisplay();
    }
  }

  /** A sheen on every undiscovered instrument in reach (and on the kit's table until it's hit). */
  private rebuildSheens(): void {
    for (const s of this.surfaces) {
      if (s.source === 'module' || s.source === 'kit') continue;
      const want = !s.discovered && !!s.voice && s.reach <= SEATED_M;
      const has = this.sheens.get(s);
      if (want && !has) {
        const sh = new Sheen(s);
        const holder = new Group();
        holder.matrixAutoUpdate = false;
        holder.matrix.copy(s.world);
        holder.add(sh.group);
        this.worldRoot.add(holder);
        this.sheens.set(s, sh);
      } else if (!want && has) {
        has.group.parent?.removeFromParent();
        has.dispose();
        this.sheens.delete(s);
      }
    }
    if (!this.kitSurface.discovered && !this.kitSheen) {
      this.kitSheen = new Sheen(this.kitSurface);
      this.kit.root.add(this.kitSheen.group);
    }
    this.refreshDebugSurfaces();
  }

  private refreshDebugSurfaces(): void {
    this.debug.surfaces = this.surfaces
      .filter((s) => s.source !== 'module')
      .map((s) => ({ id: s.id, label: s.label, family: s.voice?.family ?? null, discovered: s.discovered, reach: r3(s.reach), area: r3(s.features?.area ?? 0), hollow: s.features?.hollow ?? 0, glass: s.features?.glass ?? 0, soft: s.features?.soft ?? 0, why: s.voice?.why ?? '' }));
  }

  // ------------------------------------------------------------------ placement

  private updatePlacement(dt: number) {
    if (FIXED_DESK !== null && Number.isFinite(Number(FIXED_DESK))) {
      this.placement.place(Number(FIXED_DESK), 'fixed');
      this.placeKit();
      return;
    }
    this.forwardFlat(this.fwd);
    // last session's kit, if the same room anchor came back (plane placement waits for it a moment)
    const mayResume = !!this.progress.kit && !this.settings.placeFresh && !this.needPalm;
    if (mayResume && this.sessionTime < RESUME_WINDOW_S && this.tryResume()) return;
    if (!this.needPalm && this.sessionTime > (mayResume ? RESUME_WINDOW_S : PLACE.planeWaitS) && this.placement.phase === 'waiting') {
      const y = this.tableAhead();
      if (y !== null) {
        this.placement.place(y, 'plane');
        this.placeKit();
        return;
      }
    }
    this.tmp.copy(this.head).addScaledVector(this.fwd, PLACE.forward + 0.05);
    this.tmp.y = this.head.y - 0.28;
    if (!this.settings.noWords) {
      const low = performance.now() - this.placement.rejectedAt < 1500;
      this.hint.show(low ? 'Sit at a table, palm flat' : 'Rest your palm on the table', 0xf2efe6, this.tmp, this.head, 0.5);
    }
    let placed = false;
    // one hand at a time: the one already steadying keeps the hold (a second hand never resets it)
    for (const side of this.steadyFirst()) {
      const h = hands[side];
      if (!h.tracked) continue;
      this.planesUnder(h.palm);
      if (this.placement.update({ x: h.palm.x, y: h.palm.y, z: h.palm.z, radius: h.palmRadius, upDot: h.upDot }, this.planeYs, dt, this.head.y)) {
        this.placedHand = side;
        placed = true;
        break;
      }
      if (this.placement.phase === 'steadying') {
        this.steadyHand = side;
        this.holdRing.position.set(h.palm.x, h.palm.y - h.palmRadius + 0.004, h.palm.z);
        break;
      }
    }
    this.holdRing.count = this.placement.phase === 'steadying' && !placed ? Math.ceil(this.placement.progress * HOLD_DOTS) : 0;
    const noHands = !hands.left.tracked && !hands.right.tracked;
    if (!placed && noHands) this.placement.update(null, [], dt);
    if (!placed && ((noHands && this.sessionTime > PLACE.noHandTimeoutS) || this.sessionTime > PLACE.palmTimeoutS)) {
      this.placement.placeDefault(this.head.y);
      placed = true;
    }
    this.debug.phase = this.placement.phase;
    if (placed) this.placeKit();
  }
  private steadyHand: Side = 'right';
  private steadyOrder: Side[] = ['right', 'left'];
  private steadyFirst(): Side[] {
    this.steadyOrder[0] = this.steadyHand;
    this.steadyOrder[1] = this.steadyHand === 'right' ? 'left' : 'right';
    return this.steadyOrder;
  }

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
    out.negate();
    out.y = 0;
    if (out.lengthSq() < 1e-6) out.set(0, 0, -1);
    return out.normalize();
  }

  private placeKit(resume = false) {
    const root = this.kit.root;
    if (!resume) {
      // a fresh placement is in world space: take the kit back from last session's anchor group first
      if (this.kitHome && root.parent !== this.kitHome) this.kitHome.add(root);
      this.forwardFlat(this.fwd);
      const palm = this.placement.source === 'palm' || (this.placement.source === 'plane' && this.placement.palmX !== 0) ? { x: this.placement.palmX, z: this.placement.palmZ } : null;
      const pose = kitPose(this.head, this.fwd, this.placement.deskY!, palm);
      root.position.set(pose.x, pose.y, pose.z);
      root.rotation.set(0, pose.yaw, 0);
      root.updateMatrixWorld(true);
      this.fitToTable();
    }
    root.visible = true;
    root.updateMatrixWorld(true);
    this.hint.show('', 0, null, null);
    this.holdRing.count = 0;
    this.needPalm = false;
    this.debug.phase = 'placed';
    this.debug.deskY = r3(this.placement.deskY!);
    this.debug.deskSource = resume ? 'resumed' : this.placement.source;
    this.debug.kitOrigin = root.getWorldPosition(this.tmp).toArray().map(r3);
    this.kitSaved = false;
    if (this.world.session?.enabledFeatures?.includes('anchors') && !this.kitEntity.hasComponent(XRAnchor)) this.kitEntity.addComponent(XRAnchor);
    // the kit's surface and the module's keys
    this.kitSurface.setFrame(root.getWorldPosition(this.tmp), new Vector3(0, 1, 0), this.forwardFlat(this.fwd).clone());
    this.kitSurface.bounds = { minX: -KIT_ZONE.halfX - 0.06, maxX: KIT_ZONE.halfX + 0.06, minZ: -KIT_ZONE.front - 0.04, maxZ: -KIT_ZONE.back + 0.04 };
    if (this.tableOutline) {
      // the whole real table plays (within arm's reach)
      const b = this.kitSurface.bounds;
      for (const q of this.tableOutline) {
        b.minX = Math.max(-0.9, Math.min(b.minX, q.x));
        b.maxX = Math.min(0.9, Math.max(b.maxX, q.x));
        b.minZ = Math.max(-0.7, Math.min(b.minZ, -q.z));
        b.maxZ = Math.min(0.7, Math.max(b.maxZ, -q.z));
      }
    }
    this.kitSurface.outline = [
      { x: -KIT_ZONE.halfX, z: -KIT_ZONE.front },
      { x: KIT_ZONE.halfX, z: -KIT_ZONE.front },
      { x: KIT_ZONE.halfX, z: -KIT_ZONE.back },
      { x: -KIT_ZONE.halfX, z: -KIT_ZONE.back },
    ];
    // the kit's frame must match the kit root exactly (yaw included), so take the root's matrix
    this.kitSurface.world.copy(root.matrixWorld);
    this.kitSurface.inv.copy(root.matrixWorld).invert();
    this.kitSurface.detector.resetSurface(0);
    this.kitSurface.setFeatures({ facing: 'up', width: 0.8, length: 0.5, area: 0.6, elevation: root.position.y, hollow: 0, glass: 0, soft: 0, curved: 0, bump: false, label: 'table' }, true);
    const mod = this.kit.module.root;
    mod.updateMatrixWorld(true);
    this.moduleSurface.world.copy(mod.matrixWorld).multiply(this.modLift);
    this.moduleSurface.inv.copy(this.moduleSurface.world).invert();
    this.moduleSurface.bounds = { minX: -MODULE.w / 2, maxX: MODULE.w / 2, minZ: -0.06, maxZ: 0.0 };
    this.moduleSurface.features = { facing: 'up', width: MODULE.w, length: MODULE.d, area: 0.02, elevation: 0, hollow: 0, glass: 0, soft: 0, curved: 0, bump: false, label: 'module' };
    this.moduleSurface.zones = KEYS.map((_, i) => {
      const k = Module.keyAt(i);
      return { i, shape: 'rect' as const, x: k.x, z: -k.z, w: MODULE.keyW, h: MODULE.keyD, degree: -1, midi: 0 } satisfies Zone;
    });
    this.moduleSurface.discovered = true;
    this.moduleSurface.detector.resetSurface(0);
    this.layout();
    // the kit and room come back as they were when you return within the session
    if (this.kitSurface.discovered) this.kit.reveal(this.lanes());
    this.surfT = 0;
    this.warmShaders();
    try {
      this.renderer.xr.setFoveation(FOVEATION[0]);
    } catch {
      /* unsupported */
    }
    if (this.game.mode === 'discover' && this.game.found.length === 0) {
      this.game.start(this.clock.t);
      // the first words, at hand height over the table (the module says it too)
      if (!this.settings.noWords && !this.kitSurface.discovered) {
        this.tmp.set(0, 0.12, 0.02).applyMatrix4(root.matrixWorld);
        this.tag.show('Hit the table. Then anything that glows.', 0xff5a3c, this.tmp, this.head, 6);
      }
    }
    if (this.placement.source === 'default') this.stage && this.game.refreshDisplay();
  }

  /** The real table's outline in kit-local x/z, when Quest found it (the rim is its edge). */
  private tableOutline: { x: number; z: number }[] | null = null;

  /**
   * When the table plane is known: slide the kit away from you until its front sits 3 cm inside the
   * real edge (nothing over your lap), and remember the outline so the whole table plays.
   */
  private fitToTable(): void {
    this.tableOutline = null;
    const root = this.kit.root;
    const y = root.position.y;
    for (const e of this.queries.planes.entities) {
      const pl = e.getValue(XRPlane, '_plane') as (XRPlane & { semanticLabel?: string; polygon?: DOMPointReadOnly[] }) | undefined;
      const obj = e.object3D;
      if (!pl || !obj || pl.orientation !== 'horizontal' || !pl.polygon || pl.polygon.length < 3) continue;
      obj.updateMatrixWorld();
      obj.getWorldPosition(this.tmp);
      if (Math.abs(this.tmp.y - y) > 0.05) continue;
      this.planeInv.copy(obj.matrixWorld).invert();
      const at = (lx: number, lz: number) => this.tmp2.set(lx, 0, lz).applyMatrix4(root.matrixWorld).applyMatrix4(this.planeInv);
      const c = at(0, 0);
      if (!insidePolygon(pl.polygon, c.x, c.z, 0.05)) continue;
      // step back from you, a centimetre at a time, until the kit's front edge is on the table
      const away = this.tmp.set(0, 0, -1).transformDirection(root.matrixWorld).setY(0).normalize();
      for (let k = 0; k < 25; k++) {
        const f = at(0, KIT_ZONE.front + 0.03);
        const l = at(-KIT_ZONE.halfX * 0.6, KIT_ZONE.front + 0.03);
        const r = at(KIT_ZONE.halfX * 0.6, KIT_ZONE.front + 0.03);
        if (insidePolygon(pl.polygon, f.x, f.z, 0) && insidePolygon(pl.polygon, l.x, l.z, 0) && insidePolygon(pl.polygon, r.x, r.z, 0)) break;
        root.position.addScaledVector(away, 0.01);
        root.updateMatrixWorld(true);
      }
      const inv = this.tmpM2.copy(root.matrixWorld).invert();
      this.tableOutline = pl.polygon.map((p) => {
        const w = new Vector3(p.x, 0, p.z).applyMatrix4(obj.matrixWorld).applyMatrix4(inv);
        return { x: w.x, z: w.z };
      });
      break;
    }
  }

  /** Distance from a kit-local point to the real table's edge (Infinity when unknown). */
  private toTableEdge(x: number, z: number): number {
    const p = this.tableOutline;
    if (!p) return Infinity;
    let d = Infinity;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const ax = p[i].x;
      const az = p[i].z;
      const ex = p[j].x - ax;
      const ez = p[j].z - az;
      const l2 = ex * ex + ez * ez || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
      d = Math.min(d, Math.hypot(x - (ax + t * ex), z - (az + t * ez)));
    }
    return d;
  }

  /** Compile every shader while the kit appears, so the first hit, overlay or mote doesn't hitch. */
  private warmShaders(): void {
    try {
      const r = this.renderer as unknown as { compileAsync?: (s: unknown, c: unknown) => Promise<unknown>; compile?: (s: unknown, c: unknown) => void };
      const hidden: Object3D[] = [];
      this.kit.root.traverse((o) => {
        if (!o.visible) {
          hidden.push(o);
          o.visible = true;
        }
      });
      // compile synchronously while they're shown, then hide them again in the same frame
      r.compile?.(this.world.scene, this.world.camera);
      for (const o of hidden) o.visible = false;
    } catch {
      /* compiled on first use */
    }
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

  private tryResume(): boolean {
    const saved = this.progress.kit;
    if (!saved) return false;
    const a = this.roomAnchor();
    if (!a || a.uuid !== saved.uuid) return false;
    a.group.updateMatrixWorld(true);
    const at = this.tmp2.set(saved.x, saved.y, saved.z).applyMatrix4(a.group.matrixWorld);
    const ahead = Math.hypot(at.x - this.head.x, at.z - this.head.z);
    const drop = this.head.y - at.y;
    if (ahead > 0.6 || drop < PLACE.minDrop || drop > PLACE.maxDropWithPlane) return false;
    this.placement.place(at.y, 'palm');
    const root = this.kit.root;
    a.group.add(root);
    root.position.set(saved.x, saved.y, saved.z);
    root.rotation.set(0, saved.yaw, 0);
    root.updateMatrixWorld(true);
    this.debug.resumed = true;
    this.placeKit(true);
    return true;
  }

  private saveKitPose(): void {
    if (this.kitSaved) return;
    const a = this.roomAnchor();
    const root = this.kit.root;
    if (!a || root.parent !== a.group) return;
    this.kitSaved = true;
    this.progress.kit = { uuid: a.uuid, x: r4(root.position.x), y: r4(root.position.y), z: r4(root.position.z), yaw: r4(root.rotation.y) };
    if (this.settings.placeFresh) {
      this.settings = { ...this.settings, placeFresh: false };
      saveSettings(this.settings);
    }
    saveProgress(this.progress);
  }

  // ------------------------------------------------------------------ tests and filming

  private autoT = 0;
  private autoNext = 0;
  /** ?autoplay=1: discovers each surface in reach in turn, presses play when offered, hits every note on time. */
  private autoplay(): void {
    const t = this.clock.t;
    const from = this.autoT || t;
    this.autoT = t;
    if (this.game.mode === 'discover' && t >= this.autoNext) {
      this.autoNext = t + 1.2;
      const next = this.surfaces.find((s) => !s.discovered && s.voice && s.reach <= ACTIVE_M && s.source !== 'module');
      if (next) {
        // a strike in the middle of it (or on the kit's snare)
        this.hitAt.x = next === this.kitSurface ? 0.09 : (next.bounds.minX + next.bounds.maxX) / 2;
        this.hitAt.z = next === this.kitSurface ? 0 : (next.bounds.minZ + next.bounds.maxZ) / 2;
        this.hitAt.pad = next === this.kitSurface ? 1 : -1;
        this.hitAt.lane = 'snare';
        this.onHit(next, 'right', fakeStrike(t));
      } else if (this.game.display.pulse === 'play') {
        this.game.key('play');
      }
    }
    if (this.game.mode === 'play' || this.game.mode === 'count' || this.game.mode === 'jam') {
      this.game.dueBetween(from, t, (key) => this.autoHit(key, t));
    }
  }

  private autoHit(key: string, t: number): void {
    const r = this.ref(key);
    if (!r) return;
    if (r.kind === 'pad' || r.kind === 'keys') {
      if (r.kind === 'pad') {
        const p = this.kit.pad(r.lane);
        this.hitAt.x = p?.x ?? 0;
        this.hitAt.z = -(p?.z ?? 0);
        this.hitAt.pad = 0;
        this.hitAt.lane = r.lane;
      } else {
        const q = this.kit.keyZones[r.zone];
        this.hitAt.x = q.x;
        this.hitAt.z = q.z;
        this.hitAt.pad = -1;
      }
      this.onHit(this.kitSurface, 'left', fakeStrike(t));
      return;
    }
    const z = r.surface!.zones[r.zone];
    if (!z) return;
    this.hitAt.x = z.x;
    this.hitAt.z = z.z;
    this.onHit(r.surface!, 'right', fakeStrike(t));
  }

  // ------------------------------------------------------------------ session, pause, frames

  private setPaused(p: boolean): void {
    if (p === this.paused) return;
    this.paused = p;
    audio.setPaused(p);
    // the count-in waits until the audio is really running again
    if (!p) this.resumePending = true;
  }

  private endSession(): void {
    this.sessionTime = 0;
    if (this.placement.phase !== 'placed') return;
    if (this.game.mode === 'play' || this.game.mode === 'count') this.game.stop();
    // nothing keeps playing while you're out of the headset (and nothing catches up all at once on return)
    this.game.endJam();
    this.game.looper.clear();
    audio.stopSustain();
    this.brushPrev.clear();
    this.pendingLights.length = 0;
    this.timed.length = 0;
    if (this.kitEntity.hasComponent(XRAnchor)) this.kitEntity.removeComponent(XRAnchor);
    this.placement = new Placement();
    this.kit.root.visible = false;
    for (const s of [...this.bySource.values()].flat()) this.dropSurface(s);
    for (const o of this.orphans) this.dropSurface(o.s);
    this.orphans.length = 0;
    this.bySource.clear();
    this.srcPose.clear();
    this.volumeHead.clear();
    this.tableOutline = null;
    this.surfaces = [this.kitSurface, this.moduleSurface];
    this.debug.phase = 'waiting';
    this.debug.anchored = false;
  }

  private watchFrames(delta: number): void {
    this.hudT += delta;
    this.hudFrames++;
    if (this.hudT >= 0.5) {
      const fps = Math.round(this.hudFrames / this.hudT);
      if (this.placement.phase === 'placed') this.hudMin = Math.min(this.hudMin, fps);
      this.debug.fps = fps;
      this.debug.fpsMin = Number.isFinite(this.hudMin) ? this.hudMin : fps;
      this.hudT = 0;
      this.hudFrames = 0;
      if (this.board && this.placement.phase === 'placed') {
        const now = performance.now();
        let n = 0;
        for (const x of this.hitTimes) if (now - x < 1000) n++;
        const lh = this.debug.lastHit;
        const s = lh ? this.surfaces.find((x) => x.id === lh.surface) : null;
        const f = s?.features;
        const c = this.kitSurface.detector.cfg;
        this.board.set([
          `${fps} fps (min ${this.debug.fpsMin}) · ${n} hits/s · q${this.debug.degrade} · out ${Math.round(audio.outputLatency() * 1000)} ms · offset ${this.debug.offsetMs} ms`,
          `${this.debug.planes} planes · ${this.debug.meshes} meshes · ${this.surfaces.length - 2} surfaces · table ${Math.round(this.kitSurface.detector.surfaceY * 1000)} mm · ${c.minSpeed}/${Math.round(c.nearM * 1000)}/${c.minDecel}`,
          lh && f ? `last: ${lh.surface} ${s?.label || '-'} → ${lh.family} z${lh.zone} · ${lh.kind} ${lh.speed.toFixed(2)} m/s · ${f.area.toFixed(2)} m² hol ${f.hollow} gl ${f.glass} soft ${f.soft}` : 'last: -',
        ]);
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

  /** World positions of what a test can touch. */
  targets(): Record<string, number[]> {
    const out: Record<string, number[]> = {};
    if (this.placement.phase !== 'placed') return out;
    const root = this.kit.root;
    root.updateMatrixWorld(true);
    for (const [lane, p] of this.kit.pads) if (p.visible) out[lane] = root.localToWorld(this.tmp.set(p.x, 0.018, p.z)).toArray().map(r4);
    out.table = root.localToWorld(this.tmp.set(0, 0, 0)).toArray().map(r4);
    KEYS.forEach((k, i) => {
      const z = this.moduleSurface.zones[i];
      if (z) out[`key-${k}`] = this.tmp.set(z.x, 0, -z.z).applyMatrix4(this.moduleSurface.world).toArray().map(r4);
    });
    this.kit.keyZones.forEach((z, i) => (out[`edge${i}`] = root.localToWorld(this.tmp.set(z.x, 0, -z.z)).toArray().map(r4)));
    for (const s of this.surfaces) {
      if (s.source !== 'plane' && s.source !== 'volume') continue;
      const cx = (s.bounds.minX + s.bounds.maxX) / 2;
      const cz = (s.bounds.minZ + s.bounds.maxZ) / 2;
      out[`surface-${s.id}`] = this.tmp.set(cx, 0, -cz).applyMatrix4(s.world).toArray().map(r4);
      out[`normal-${s.id}`] = s.normal.toArray().map(r4);
    }
    out.head = this.head.toArray().map(r4);
    return out;
  }
}

const NOT_TRACKED: HandSample = { tracked: false, pinching: false, points: [] };

function fakeStrike(t: number): Strike {
  return { kind: 'stop', speed: 0.9, gain: 0.75, point: 0, height: 0, t };
}

function mkPoints(): Point[] {
  return Array.from({ length: 6 }, () => ({ x: 0, y: 1, z: 0, r: 0.01 }));
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

void PADS;
