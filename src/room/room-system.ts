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
  Quaternion,
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
import { MODULE, Module, KEYS } from '../ui/module.js';
import { Tag, DebugBoard } from '../ui/tag.js';
import { audio } from '../audio/engine.js';
import { loadProgress, saveProgress, freshProgress, type Progress } from '../persistence/progress.js';
import { loadSettings, saveSettings, type Settings } from '../persistence/settings.js';
import { motion, prefersReducedMotion } from '../ui/motion.js';
import { Game, type GameStage, type Room, type Unlock } from '../play/game.js';
import { Surface, outlineOf } from './surface.js';
import { Overlay, Sheen } from './overlay.js';
import { Motes } from './motes.js';
import { FAMILIES, type Family, type Features } from './classify.js';
import { retune, zoneAt, type Zone } from './zones.js';
import type { RoomInstrument } from '../songs/cast.js';

const params = new URLSearchParams(location.search);
/** `?debug=1`: a board behind the module (fps, planes, the last hit's surface and how it was measured). */
const DEBUG = params.get('debug') === '1';
/** `?autoplay=1`: a player that discovers your surfaces and hits every note on time (tests and filming only). */
const AUTOPLAY = params.get('autoplay') === '1';
/** `?desk=<y>`: a fixed table height (E2E, filming). */
const FIXED_DESK = params.get('desk');
const ANCHOR_KEY = 'iwsdk_scene_anchor_uuid';
const RESUME_WINDOW_S = 4;
const FOVEATION = [0.5, 0.75, 1];
const SIDES = ['left', 'right'] as const;
const HOLD_DOTS = 20;
/** Surfaces within this of the head are played (stand up and walk to the far ones). */
const ACTIVE_M = 3;
/** Surfaces within this of a seated player's head carry a sheen and count in the room map. */
const SEATED_M = 1.1;
/** A hand this close to a surface (along its normal) is tested against it. */
const NEAR_MIN = -0.12;
const NEAR_MAX = 0.32;

/** Strike tuning from the address (device sessions): ?speed=0.3 &near=20 (mm) &decel=10 &latch=100 (ms) &rearm=18 (mm). */
function strikeOverrides(): Partial<Record<keyof typeof STRIKE, number>> {
  const o: Partial<Record<keyof typeof STRIKE, number>> = {};
  const num = (k: string) => {
    const v = params.get(k);
    const n = v === null ? NaN : Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const sp = num('speed');
  if (sp !== null) o.minSpeed = sp;
  const near = num('near');
  if (near !== null) o.nearM = near / 1000;
  const dc = num('decel');
  if (dc !== null) o.minDecel = dc;
  const la = num('latch');
  if (la !== null) o.latchS = la / 1000;
  const re = num('rearm');
  if (re !== null) o.rearmM = re / 1000;
  return o;
}
const STRIKE_CFG = strikeOverrides();

/** The game clock: the audio clock while audio runs, frame time otherwise, continuous across the switch. */
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
  toAudio(t: number): number {
    return this.wasRunning ? t - this.base : 0;
  }
}

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
  private tmpQ = new Quaternion();
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
  private nextId = 1;
  private measuredCount = 0;
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
    this.settings = loadSettings();
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
    this.game = new Game(this.stage, this.progress, this.room, { tempo: this.settings.tempo, offset: this.settings.offset });
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
  }

  // ------------------------------------------------------------------ the game's view of the world

  private room: Room = {
    instruments: () => {
      const out: RoomInstrument[] = [];
      for (const s of this.surfaces) if (s.discovered && s.voice && s.source !== 'kit' && s.source !== 'module') out.push({ id: s.id, family: s.voice.family, zones: s.zones.length });
      return out;
    },
    zones: (id) => (id === 'keys' ? this.kit.keyZones.length : (this.surfaces.find((s) => s.id === id)?.zones.length ?? 0)),
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
      for (let i = 0; i < stars; i++) this.later(this.clock.t + 0.45 * (i + 1), () => audio.chime([76 + i * 4], 0.1, 0.9));
      this.afterFirstSong();
    },
    casting: (c) => {
      // the table keys sit quiet until a song uses them
      const used = Object.values(c).some((t) => t?.surface === 'keys');
      this.kit.keys.rest = used ? 0.45 : 0.12;
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
      if (r.kind === 'keys') {
        const q = this.kit.keyZones[r.zone];
        if (q) audio.modal('keys', q.midi, vel, 0, when);
      } else if (r.kind === 'zone' && r.surface?.voice) {
        const z = r.surface.zones[r.zone];
        if (z) {
          this.lastWorld.set(z.x, 0, -z.z).applyMatrix4(r.surface.world);
          audio.modal(r.surface.voice.family, z.midi, vel, this.panOf(this.lastWorld), when, r.surface.voice.size);
        }
      }
      // its note lights where it plays, when it plays
      this.pendingLights.push({ at, key, vel });
    },
    bandmate: (event, surface) => {
      const s = surface === 'keys' ? null : this.surfaces.find((x) => x.id === surface);
      const o = s ? this.overlays.get(s) : this.kit.keys;
      if (event === 'claim') {
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
  /** The bandmate's notes, lit when they play. */
  private pendingLights: { at: number; key: string; vel: number }[] = [];
  private timed: { at: number; fn: () => void }[] = [];
  private later(at: number, fn: () => void): void {
    this.timed.push({ at, fn });
  }
  private farTold = false;

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
    this.game = new Game(this.stage, this.progress, this.room, { tempo: this.settings.tempo, offset: this.settings.offset });
    for (const s of this.surfaces) s.discovered = false;
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
    this.kit.module.set(this.game.display);
    this.debug.mode = this.game.mode;
    this.debug.found = this.game.found.slice();
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
      } else this.kit.setHandShadow(i, 0, Infinity, 0);
      let best: Surface | null = null;
      let bestStrike: Strike | null = null;
      this.sample.tracked = h.tracked;
      this.sample.pinching = false;
      for (let k = 0; k < this.surfaces.length; k++) {
        const s = this.surfaces[k];
        if (!s.voice && s.source !== 'module') continue;
        if (s.reach > ACTIVE_M && s.source !== 'kit' && s.source !== 'module') continue;
        let near = false;
        if (h.tracked) {
          s.toZone(h.palm, this.o);
          near = this.o.y > NEAR_MIN && this.o.y < NEAR_MAX && s.over(this.o.x, this.o.z, 0.08);
        }
        if (!near) {
          if (s.near[i]) {
            // a hand leaving a surface: let the detector see the gap (a dropout), then forget it
            s.detector.update(hand, NOT_TRACKED, t, delta);
            s.near[i] = false;
          }
          continue;
        }
        s.near[i] = true;
        this.fill(h, s);
        const strike = s.detector.update(hand, this.sample, t, delta);
        if (strike && (!bestStrike || Math.abs(strike.height) < Math.abs(bestStrike.height))) {
          best = s;
          bestStrike = strike;
          const p = this.sample.points[strike.point];
          this.hitAt.x = p.x;
          this.hitAt.z = p.z;
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
      }
      if (best && bestStrike) this.onHit(this.preferInset(best), side, bestStrike);
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
    const t = st.t;
    const gain = st.gain;
    this.debug.hits++;
    s.hits++;
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
    audio.modal(s.voice.family, zone.midi, gain, this.panOf(this.lastWorld), 0, s.voice.size);
    this.overlays.get(s)?.hit(z, gain);
    const grade = this.game.hit(`${s.id}:${z}`, t, gain);
    if (grade === 'perfect') {
      this.overlays.get(s)?.perfect(z);
      audio.chime([96], 0, 0.25);
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
          audio.modal('keys', q.midi, gain, this.panOf(this.lastWorld));
          this.kit.keys.hit(i, gain);
          const g = this.game.hit(`keys:${i}`, t, gain);
          if (g === 'perfect') {
            this.kit.keys.perfect(i);
            audio.chime([96], 0, 0.25);
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
      audio.chime([96], 0, 0.25);
    }
    this.record(this.kitSurface, 0, gain, st, g, lane);
  }

  /** Off the pads, the table still plays: by where you hit it. */
  private drumAt(x: number, z: number): Lane | 'rim' {
    const hx = this.handed() === 'left' ? -x : x;
    if (Math.abs(x) > KIT_ZONE.halfX || z > KIT_ZONE.front || z < KIT_ZONE.back) return 'rim';
    if (hx < -0.17) return this.lanes().includes('tom') ? 'tom' : 'kick';
    if (hx < 0) return 'kick';
    if (hx < 0.17) return 'snare';
    return 'hat';
  }

  private record(s: Surface, zone: number, gain: number, st: Strike, grade: string | null, what = ''): void {
    const f = s.features;
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
    if (!a || !s.voice) return;
    const list = (this.progress.rooms[a.uuid] ??= []);
    if (s === this.kitSurface) {
      if (!list.some((i) => i.family === 'kit')) list.push({ family: 'kit', x: 0, y: 0, z: 0 });
    } else {
      a.group.updateMatrixWorld(true);
      const w = this.tmp2.set(s.anchor.x, 0, -s.anchor.z).applyMatrix4(s.world);
      const local = w.applyMatrix4(this.tmpM2.copy(a.group.matrixWorld).invert());
      list.push({ family: s.voice.family, x: r4(local.x), y: r4(local.y), z: r4(local.z) });
    }
    saveProgress(this.progress);
  }
  private tmpM2 = new Matrix4();

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
      if (i.family !== s.voice.family) continue;
      const w = this.tmp2.set(i.x, i.y, i.z).applyMatrix4(a.group.matrixWorld);
      s.toZone(w, this.o);
      if (Math.abs(this.o.y) > 0.1 || !s.over(this.o.x, this.o.z, 0.05)) continue;
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
      this.kitSheen?.group.removeFromParent();
      this.kitSheen = null;
    } else {
      s.layZones({ x: this.hitAt.x, z: this.hitAt.z }, this.game.song?.key ?? 0);
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
    if (!this.restoring) audio.chime([84, 91], 0.07, 0.4);
    if (!this.settings.noWords && !this.restoring) {
      const name = `${surfaceName(s)} · ${FAMILIES[v.family].name}`;
      // the tag stands just off the surface where it was hit, facing you
      this.tmp.set(this.hitAt.x, 0.05, -this.hitAt.z).applyMatrix4(s.world);
      if (s === this.kitSurface) this.tmp.set(0, 0.1, 0.05).applyMatrix4(s.world);
      else this.tmp.y += 0.07;
      this.tag.show(name, FAMILIES[v.family].color, this.tmp, this.head);
      this.debug.tag = name;
    }
    if (DEBUG) console.log(`[thump] discovered ${s.id} '${s.label}' → ${v.family} (${v.why}) size ${v.size.toFixed(2)}`);
    if (!this.restoring) this.remember(s);
    this.game.discovered(v.family, s === this.kitSurface ? 'table' : surfaceName(s).toLowerCase(), this.clock.t);
    this.refreshDebugSurfaces();
  }

  // ------------------------------------------------------------------ the room's surfaces

  /** Planes and room-scan volumes → surfaces; kept stable across frames (discoveries survive). */
  private syncSurfaces(): void {
    const seen = new Set<object>();
    let planes = 0;
    let meshes = 0;
    const kitY = this.kit.root.getWorldPosition(this.tmp2).y;
    const kitC = this.tmp2.clone();
    for (const e of this.queries.planes.entities) {
      const pl = e.getValue(XRPlane, '_plane') as (XRPlane & { semanticLabel?: string; polygon?: DOMPointReadOnly[] }) | undefined;
      const obj = e.object3D;
      if (!pl || !obj) continue;
      planes++;
      seen.add(pl);
      if (this.bySource.has(pl)) continue;
      const s = this.fromPlane(pl, obj, kitY, kitC);
      this.bySource.set(pl, s ? [s] : []);
    }
    for (const e of this.queries.meshes.entities) {
      const mesh = e.getValue(XRMesh, '_mesh') as object | undefined;
      const obj = e.object3D;
      if (!mesh || !obj) continue;
      meshes++;
      seen.add(mesh);
      if (this.bySource.has(mesh)) continue;
      if (!e.getValue(XRMesh, 'isBounded3D')) {
        this.bySource.set(mesh, []);
        continue;
      }
      const label = String(e.getValue(XRMesh, 'semanticLabel') ?? '').toLowerCase();
      const min = e.getVectorView(XRMesh, 'min');
      const max = e.getVectorView(XRMesh, 'max');
      this.bySource.set(mesh, this.fromVolume(label, obj, min, max, kitY, kitC));
    }
    if (this.bySource.size !== this.measuredCount) {
      // new planes: what's inset in what may have changed (a window appears after its wall)
      this.measuredCount = this.bySource.size;
      for (const list of this.bySource.values())
        for (const s of list) {
          if (s.discovered || s.source !== 'plane' || s.features.facing !== 'vertical') continue;
          const f = { ...s.features, hollow: 0, glass: 0 };
          this.measure(s, f);
          s.setFeatures(f);
        }
    }
    for (const [src, list] of this.bySource) {
      if (seen.has(src)) continue;
      for (const s of list) this.dropSurface(s);
      this.bySource.delete(src);
    }
    this.debug.planes = planes;
    this.debug.meshes = meshes;
    this.surfaces = [this.kitSurface, this.moduleSurface];
    for (const list of this.bySource.values()) for (const s of list) this.surfaces.push(s);
    for (const s of this.surfaces) if (!s.discovered && s.source !== 'module') this.restore(s);
    this.updateReach();
    this.rebuildSheens();
  }

  private fromPlane(pl: XRPlane & { semanticLabel?: string; polygon?: DOMPointReadOnly[] }, obj: Object3D, kitY: number, kitC: Vector3): Surface | null {
    obj.updateMatrixWorld();
    const label = (pl.semanticLabel ?? '').toLowerCase();
    if (label === 'ceiling') return null;
    const poly = pl.polygon ?? [];
    if (poly.length < 3) return null;
    const centre = obj.getWorldPosition(new Vector3());
    const n = new Vector3(0, 1, 0).applyQuaternion(obj.getWorldQuaternion(this.tmpQ));
    const vertical = Math.abs(n.y) < 0.7;
    if (vertical && n.dot(this.tmp.copy(this.head).sub(centre)) < 0) n.negate();
    if (!vertical && n.y < 0) return null; // a ceiling-like face
    // the kit's own table: the kit already plays it
    if (!vertical && Math.abs(centre.y - kitY) < 0.05) {
      this.planeInv.copy(obj.matrixWorld).invert();
      const k = this.tmp.copy(kitC).applyMatrix4(this.planeInv);
      if (insidePolygon(poly, k.x, k.z, 0.05)) return null;
    }
    const s = new Surface(`p${this.nextId++}`, 'plane', label, STRIKE_CFG);
    this.forwardFlat(this.fwd);
    s.setFrame(centre, n, this.fwd);
    const world = poly.map((p) => new Vector3(p.x, 0, p.z).applyMatrix4(obj.matrixWorld));
    outlineOf(s, world);
    const b = s.bounds;
    const f: Features = {
      facing: vertical ? 'vertical' : 'up',
      width: b.maxX - b.minX,
      length: b.maxZ - b.minZ,
      area: Math.abs(shoelace(s.outline)),
      elevation: centre.y,
      hollow: 0,
      glass: 0,
      soft: 0,
      curved: 0,
      bump: false,
      label,
    };
    this.measure(s, f);
    s.setFeatures(f);
    return s.voice ? s : null;
  }

  /** A room-scan volume (a cupboard, a sofa…): its top, and the face turned toward you. */
  private fromVolume(label: string, obj: Object3D, min: ArrayLike<number>, max: ArrayLike<number>, kitY: number, kitC: Vector3): Surface[] {
    if (/wall|floor|ceiling|table|desk/.test(label)) return [];
    obj.updateMatrixWorld();
    const out: Surface[] = [];
    const m = obj.matrixWorld;
    const cx = (min[0] + max[0]) / 2;
    const cz = (min[2] + max[2]) / 2;
    const corners = (pts: number[][]) => pts.map(([x, y, z]) => new Vector3(x, y, z).applyMatrix4(m));
    const make = (centre: Vector3, n: Vector3, pts: Vector3[], facing: Features['facing']) => {
      const s = new Surface(`v${this.nextId++}`, 'volume', label, STRIKE_CFG);
      this.forwardFlat(this.fwd);
      s.setFrame(centre, n, this.fwd);
      outlineOf(s, pts);
      const b = s.bounds;
      const f: Features = { facing, width: b.maxX - b.minX, length: b.maxZ - b.minZ, area: (b.maxX - b.minX) * (b.maxZ - b.minZ), elevation: centre.y, hollow: /storage|cabinet|drawer/.test(label) ? 0.9 : 0, glass: 0, soft: 0, curved: 0, bump: false, label };
      s.setFeatures(f);
      if (s.voice) out.push(s);
    };
    // the top
    const top = corners([
      [min[0], max[1], min[2]],
      [max[0], max[1], min[2]],
      [max[0], max[1], max[2]],
      [min[0], max[1], max[2]],
    ]);
    const topC = new Vector3(cx, max[1], cz).applyMatrix4(m);
    const up = new Vector3(0, 1, 0).transformDirection(m);
    if (up.y > 0.7 && topC.y > 0.15 && !(Math.abs(topC.y - kitY) < 0.05 && topC.distanceTo(kitC) < 0.6)) make(topC, up, top, 'up');
    // the side facing the head
    const faces: [number[], number[][]][] = [
      [[1, 0, 0], [[max[0], min[1], min[2]], [max[0], min[1], max[2]], [max[0], max[1], max[2]], [max[0], max[1], min[2]]]],
      [[-1, 0, 0], [[min[0], min[1], max[2]], [min[0], min[1], min[2]], [min[0], max[1], min[2]], [min[0], max[1], max[2]]]],
      [[0, 0, 1], [[max[0], min[1], max[2]], [min[0], min[1], max[2]], [min[0], max[1], max[2]], [max[0], max[1], max[2]]]],
      [[0, 0, -1], [[min[0], min[1], min[2]], [max[0], min[1], min[2]], [max[0], max[1], min[2]], [min[0], max[1], min[2]]]],
    ];
    let bestDot = 0.3;
    let best: [Vector3, Vector3[], Vector3] | null = null;
    for (const [nl, pts] of faces) {
      const n = new Vector3(nl[0], nl[1], nl[2]).transformDirection(m);
      const w = corners(pts);
      const c = w.reduce((a, p) => a.add(p), new Vector3()).multiplyScalar(1 / w.length);
      const d = n.dot(this.tmp.copy(this.head).sub(c).normalize());
      if (d > bestDot) {
        bestDot = d;
        best = [c, w, n];
      }
    }
    if (best) make(best[0], best[2], best[1], 'vertical');
    return out;
  }

  /** What geometry says beyond its outline: inset in a wall (a door or a window), a box behind it. */
  private measure(s: Surface, f: Features): void {
    if (f.facing !== 'vertical') return;
    // inset in a bigger wall plane, nearly coplanar: a door (tall) or a window
    for (const list of this.bySource.values()) {
      for (const o of list) {
        if (o === s || o.features.facing !== 'vertical' || o.features.area <= f.area * 1.6) continue;
        if (Math.abs(o.normal.dot(s.normal)) < 0.95) continue;
        this.tmp.copy(s.centre).applyMatrix4(o.inv);
        if (Math.abs(this.tmp.y) > 0.12 || !o.over(this.tmp.x, -this.tmp.z, 0)) continue;
        if (f.length >= 1.5 && f.width >= 0.5 && f.width <= 1.4) f.hollow = Math.max(f.hollow, 0.7);
        else f.glass = Math.max(f.glass, 0.6);
      }
    }
  }

  private dropSurface(s: Surface): void {
    this.holders.get(s)?.removeFromParent();
    this.holders.delete(s);
    this.overlays.delete(s);
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
        this.tag.show('Hit anything', 0xff5a3c, this.tmp, this.head, 6);
      }
    }
    if (this.placement.source === 'default') this.stage && this.game.refreshDisplay();
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
      const next = this.surfaces.find((s) => !s.discovered && s.voice && s.reach <= 1.5);
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
    if (this.kitEntity.hasComponent(XRAnchor)) this.kitEntity.removeComponent(XRAnchor);
    this.placement = new Placement();
    this.kit.root.visible = false;
    for (const s of [...this.bySource.values()].flat()) this.dropSurface(s);
    this.bySource.clear();
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

function surfaceName(s: Surface): string {
  const l = s.label;
  if (/door/.test(l)) return 'Door';
  if (/window/.test(l)) return 'Window';
  if (/storage|cabinet/.test(l)) return 'Cupboard';
  if (/couch|sofa/.test(l)) return 'Sofa';
  if (/bed/.test(l)) return 'Bed';
  if (/screen/.test(l)) return 'Screen';
  if (/wall art|picture/.test(l)) return 'Picture';
  if (/table|desk/.test(l)) return 'Table';
  if (/floor/.test(l)) return 'Floor';
  if (/wall/.test(l)) return 'Wall';
  if (s.source === 'kit') return 'Table';
  return s.features?.facing === 'vertical' ? 'Wall' : 'Top';
}

function shoelace(p: { x: number; z: number }[]): number {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j].x + p[i].x) * (p[j].z - p[i].z);
  return a / 2;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

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

void PADS;
