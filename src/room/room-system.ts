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
  CanvasTexture,
  Color,
  PlaneGeometry,
  SRGBColorSpace,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Mesh,
  RingGeometry,
  DoubleSide,
  SphereGeometry,
  Shape,
  ShapeGeometry,
  MeshStandardMaterial,
  Vector3,
  VisibilityState,
  XRAnchor,
  XRMesh,
  XRPlane,
  SceneUnderstandingSystem,
  type Entity,
  type Object3D,
  Quaternion,
} from '@iwsdk/core';
import { tortoiseShell } from '../scene-assets/lib/surfaces.js';
import { PADS, PLACE, STRIKE, type Lane } from '../config.js';
import { hands, type HandState, type Side } from '../input/hands.js';
import { KIT_STYLES, type KitStyle } from '../scene-assets/lib/drums.js';
import { AIR, AirHits, type AirHit, type AirSurface } from '../input/air-hits.js';
import { Placement, kitPose } from '../app/placement.js';
import { FrameGuard } from '../app/frame-guard.js';
import { speedToGain, type HandSample, type Point, type Strike } from '../kit/strike.js';
import { kitLayout, pickPad, type PadSpot } from '../kit/layout.js';
import { HUD_AT, HUD_X, KitView, KEYS_ROW, KIT_ZONE } from '../kit/kit-view.js';
import { LED } from '../kit/pad-view.js';
import { KEYS, type ModuleKey } from '../ui/module.js';
import { PANEL, itemZone } from '../ui/panel.js';
import { Tag, DebugBoard } from '../ui/tag.js';
import { audio, type Voice } from '../audio/engine.js';
import { sfx, type Music } from '../audio/sfx.js';
import { bandNameFor, loadProgress, saveProgress, freshProgress, type Progress, type SavedPad } from '../persistence/progress.js';
import { loadSettings, saveSettings, type Settings } from '../persistence/settings.js';
import { motion, prefersReducedMotion } from '../ui/motion.js';
import { Game, type GameStage, type Room, type Unlock } from '../play/game.js';
import { Surface, isGlass, surfaceName, swappable } from './surface.js';
import { SurfaceBuilder, insidePolygon, tuneStrike } from './surface-builder.js';
import { GameClock } from './game-clock.js';
import { ACTIVE_M, AUTOPLAY, DEBUG, FIXED_DESK, params, NEAR_MAX, NEAR_MIN, SEATED_M, STRIKE_CFG, SWAP_NEAR_M, URL_STRIKE, NO_COACH } from './params.js';
import { SwapGesture } from './swaps.js';
import { TouchFinder, becomesKeys, grow, touchVoice, type Touch } from './touch.js';
import { ClapWatch, StickClick, segDist } from '../input/stick-click.js';
import { soundById, stepSound } from '../audio/bank.js';
import { CONGA, GUITAR, HANDPAN, KEYBOARD, KEYS as KEY_NAMES, MARIMBA, NECK, PIANO_BLACK, PIANO_CHORD, PIANO_LOW, SCALES, handpanShape, handpanY, SHELF, STRUM, instDef, instZones, congaNormal, percVoice, pianoBlacks, scaleById, scaleMidi, stepShelf, strumNotes, type InstId } from '../kit/shelf.js';
import type { ShelfView } from '../play/game.js';
import { Mallets } from './mallets.js';
import { HitLog, TUNE_ITEMS, current, fmt, stepValue, type StrikeTune } from './tuning.js';
import { Overlay, Sheen } from './overlay.js';
import { asLight } from '../art/light.js';
import { Motes } from './motes.js';
import { FAMILIES, NEIGHBOURS, nextSwap, orchestrate, type Family } from './classify.js';
import { retune, zoneAt, zoneForDegree, type Zone, setMinor } from './zones.js';
import type { RoomInstrument } from '../songs/cast.js';
import { PhoneLink } from './phone-link.js';
import { coop, normaliseCode, type CoopStatus } from '../net/coop.js';
import { BandLink, asPlayer, type BandCtl } from '../net/band.js';
import { Stand } from '../stand/stand.js';
import { HandMallet, MALLET_HEAD_R, MALLET_LEN, STICK_LEN } from './hand-mallet.js';
import { KICK_DEPTH } from '../kit/pad-view.js';
import { BRAND, INST_LIGHT, hexNum, withAlpha } from '../ui/theme.js';
import { HitFx, type PartShape } from './hit-fx.js';
import { ApproachRings } from './approach-rings.js';
import { Hud, type HudSay } from './hud.js';
import { GuitarHands, HG, SADDLE_X, bodyHalfW, heldMatrix, lapMatrix, stringZ, stringsOf, zoneX, type Pluck } from '../kit/held-guitar.js';
import { GuitarCues, cueSpot } from './guitar-cues.js';
import { boardTop, postScore } from '../net/scores.js';
import { randomWords } from '../play/names.js';
import { letterFor } from '../songs/scoring.js';
import { AIM_FROM, AimMarks } from './aim-marks.js';
import type { HeldGuitarModel } from '../scene-assets/lib/held-guitar-model.js';
import { Waterfall, type NoteTarget } from './waterfall.js';
import { formOf } from './waterfall-fx.js';
import { Dimmer } from './dimmer.js';
import { LightsOut } from './lights-out.js';
import { FriendSeat } from './friend-seat.js';
import { FriendPresence } from './friend-presence.js';
import { Talk, coopDeps } from '../net/voice.js';
import { HitWords } from './hit-words.js';
import { setupLighting } from '../art/lighting.js';
import { makeThumbs } from '../art/thumbs.js';

const ANCHOR_KEY = 'iwsdk_scene_anchor_uuid';
/** The instruments come out this long after you enter (the first poses can still be settling). */
const SPAWN_AFTER_S = 0.35;
/** A palm laid flat on the desk sets the kit's height for this long after it comes out. */
const HEIGHT_PROBE_S = 45;
const FOVEATION = [0.5, 0.75, 1];
const SIDES = ['left', 'right'] as const;
const HOLD_DOTS = 20;
/** Finding things on the desk by touch (cups, books): off unless the address asks for it. */
const FIND_OBJECTS = typeof location !== 'undefined' && new URLSearchParams(location.search).has('objects');
/** What a thing found by touch is, in a word a person would use (only where its position says it plainly). */
const THING_WORD: Record<string, string> = { cup: 'cup', tall: 'bottle', knee: 'knee', lid: 'laptop', arm: 'armrest' };

/** Where a song's target key points: a pad, an edge key, or a zone on a room surface. */
interface KeyRef {
  surface: Surface | null;
  kind: 'pad' | 'keys' | 'zone' | 'clap' | 'inst';
  lane: Lane;
  zone: number;
}

export interface RoomDebug {
  /** Claps, stick clicks and knocks on the guitar heard (for the E2E). */
  claps?: number;
  taps?: number;
  clicks?: number;
  phase: string;
  deskY: number | null;
  deskSource: string | null;
  kitOrigin: number[] | null;
  anchored: boolean;
  resumed: boolean;
  hits: number;
  lastHit: { surface: string; family: string; zone: number; gain: number; speed: number; kind: string; grade: string | null } | null;
  surfaces: { id: string; label: string; family: string | null; discovered: boolean; reach: number; area: number; hollow: number; glass: number; soft: number; why: string; sound?: string; kept?: boolean }[];
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
  /** Friends' notes heard (playing together). */
  friendNotes?: number;
  /** The band's name on the kick. */
  bandName?: string;
  /** Seats across the desk (friends, or the band's players). */
  seats?: number;
}

/** What to call the part a note key plays, in a sentence ("Hit the snare"). */
function partName(key: string): string {
  const [kind, z] = key.split(':');
  if (kind === 'kit') return z === 'hat' ? 'hi-hat' : z === 'tom' ? 'tom' : z ?? 'drum';
  if (kind === 'piano' || kind === 'keys') return 'key';
  if (kind === 'marimba') return 'bar';
  if (kind === 'congas') return 'conga';
  if (kind === 'handpan') return 'note';
  if (kind === 'guitar') return Number(z) >= 3 ? 'strings' : 'chord';
  return 'drum';
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
  private hitFx: HitFx | null = null;
  private approach: ApproachRings | null = null;
  private hud: Hud | null = null;
  /** The part last judged, its shape for the hit flash (and the streak's ring). */
  private lastPart: PartShape = { at: new Vector3(), q: new Quaternion(), w: 0, d: 0, round: true };
  private fxKey = '';
  private partCol = new Color();
  private fxNt: NoteTarget = { w: 0, d: 0, round: false };
  private fxN = new Vector3();
  private fxS = new Vector3();
  private fxQ = new Quaternion();
  private static readonly UP = new Vector3(0, 1, 0);
  /** The game's judge, remembering what was hit (the flash finds its shape from it). */
  private hitGame(key: string, t: number, gain: number) {
    this.fxKey = key;
    return this.game.hit(key, t, gain);
  }
  /** Where `key`'s part is (world), its shape and colour: what the hit flash and the approach rings draw round. */
  private shapeOf = (key: string, s: PartShape, col: Color): boolean => {
    this.kit.root.getWorldQuaternion(s.q);
    if (this.kit.inst === 'guitar' && key.startsWith('guitar:')) {
      // the guitar on your lap: a fret zone on the neck, or the strings over the soundhole
      const z = Number(key.slice(7));
      const zone = z >= 0 && z < 3;
      if (this.guitarLap) {
        // (held facing away: round the cue that stands for it just off the guitar, turned to your eyes)
        cueSpot(zone ? z : 9, this.fxN);
        this.heldWorld(this.fxN.x, this.fxN.y, this.fxN.z, s.at);
        this.fxS.subVectors(this.head, s.at).normalize();
        s.q.setFromUnitVectors(RoomSystem.UP, this.fxS);
        // (just round the tag: the ring lands on its edge, no gap)
        s.w = zone ? 0.066 : 0.054;
        s.d = s.w;
        s.round = true;
        col.setHex(instDef('guitar').color);
        return true;
      }
      this.heldWorld(zone ? zoneX(z) : HG.strikeX, HG.strings + 0.002, 0, s.at);
      this.heldM.decompose(this.fxN, this.fxQ, this.fxS);
      s.q.multiply(this.fxQ);
      s.w = zone ? 0.085 : 0.11;
      s.d = 0.05;
      s.round = false;
      col.setHex(instDef('guitar').color);
      return true;
    }
    // (on Easy and Normal a conga counts anywhere on the drum: its ring goes round the whole drum)
    if (this.kit.inst === 'congas' && this.game.level !== 'hard' && key.startsWith('congas:')) key = CONGA_WHOLE[Number(key.slice(7))] ?? key;
    if (!this.resolveNote(key, s.at, col, this.fxNt)) return false;
    s.w = this.fxNt.w;
    s.d = this.fxNt.d;
    s.round = this.fxNt.round;
    // (the piano's keys: a note slides along its key to the box near its front)
    s.lane = this.kit.inst === 'piano' && key.startsWith('piano:') && !s.round;
    // (a leaning surface: turned from the kit's up to its normal)
    if (this.fxNt.nx || this.fxNt.ny || this.fxNt.nz) {
      this.fxN.set(this.fxNt.nx ?? 0, this.fxNt.ny ?? 1, this.fxNt.nz ?? 0).normalize();
      this.fxS.copy(RoomSystem.UP).applyQuaternion(s.q);
      this.fxQ.setFromUnitVectors(this.fxS, this.fxN);
      s.q.premultiply(this.fxQ);
    }
    return true;
  };
  /**
   * A judged hit lights the part it was on: one ring swells off its outline (a Perfect brighter, with a moment's glow
   * of the part; in a ×4 streak half gold, in the Spotlight all gold). No sound of its own: what you played is the
   * sound.
   */
  private partFx(g: string, at: Vector3): void {
    if (g !== 'perfect' && g !== 'good') return;
    const s = this.lastPart;
    if (!this.shapeOf(this.fxKey, s, this.partCol)) {
      this.kit.root.getWorldQuaternion(s.q);
      s.at.copy(at);
      s.w = s.d = 0.04;
      s.round = true;
      this.partCol.setHex(0xffffff);
    }
    // (the band opens back up as you play: a Perfect more than a Good)
    this.grooveAt(this.groove + (g === 'perfect' ? 0.1 : 0.07));
    if (this.game.display.spot?.active) this.partCol.setHex(0xffd23f);
    else if ((this.game.display.mult ?? 1) >= 4) this.partCol.lerp(RoomSystem.GOLD, 0.5);
    if (g === 'perfect' && !(this.settings.taught ?? []).includes('perfect')) {
      // your first Perfect ever: a moment
      this.settings = { ...this.settings, taught: [...(this.settings.taught ?? []), 'perfect'] };
      saveSettings(this.settings);
      this.hudFirstT = this.uiT;
      sfx.firstPerfect();
      this.dimmer.hit(0xffd36a, 0.9);
      this.kit.module.burst('milestone', 200, 300);
      this.hitFx?.flash('mult', s, 0xffd23f);
    }
    this.hitFx?.flash(g === 'perfect' ? 'perfect' : 'good', s, this.partCol.getHex());
  }
  private static readonly GOLD = new Color(0xffd23f);
  /** The music now, for the game's own sounds: a song's chord, free play's key, the results' song key (they read C). */
  private sfxMusic(o: Music): Music {
    const g = this.game;
    const results = g.mode === 'results';
    const h = results ? null : g.harmony();
    const tonic = results ? this.starRoot : g.mode === 'discover' ? (this.stage.freeHarmony?.().root ?? 0) : g.keyPc;
    o.tonic = ((tonic % 12) + 12) % 12;
    o.minor = results ? this.starMinor : !!h?.minor;
    o.chord = h ? ((h.chord % 12) + 12) % 12 : o.tonic;
    o.chordMinor = h ? h.chordMinor : o.minor;
    return o;
  }
  /** Audio time of the band's next 1/`div` beat (0: no band playing to land with). */
  private sfxGrid(div: number): number {
    const g = this.game;
    if ((g.mode !== 'play' && g.mode !== 'jam') || g.paused || this.lessonHold || this.userPaused) return 0;
    const b = g.clock.beatAt(this.clock.t);
    if (!Number.isFinite(b)) return 0;
    return this.clock.toAudio(g.clock.timeAt(Math.ceil(b * div + 0.05) / div));
  }
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
  /** While the instruments are getting ready (the first time, the drums' and piano's sounds download): said in front. */
  private loadTag!: Tag;
  private loadDone = false;
  private loadingTick(immersive: boolean): void {
    if (this.loadDone || !immersive) return;
    const p = audio.sampler.firstReady;
    const placed = this.placement.phase === 'placed';
    // (done once everything's in and the instruments are out, or after 25 s whatever happens: it never sits there)
    if ((p >= 1 && placed) || this.uiT > 25) {
      this.loadDone = true;
      this.loadTag.show('', 0, null, null);
      return;
    }
    if (p >= 1 && !placed) return this.loadTag.show('', 0, null, null);
    // eye height, 60 cm ahead, wherever you're looking (level)
    this.forwardFlat(this.fwd);
    this.tmp.copy(this.head).addScaledVector(this.fwd, 0.6);
    this.tmp.y = this.head.y - 0.06;
    this.loadTag.show(placed ? `Tuning up... ${Math.round(p * 100)}%` : 'Setting up...', 0xffb547, this.tmp, this.head, 1);
  }
  private holdRing!: InstancedMesh;
  private guard = new FrameGuard();
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
  /** Keys whose surface has gone (until the surfaces change). */
  private refMiss = new Set<string>();
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
    // the instruments' light: a room to reflect, filmic tone mapping
    setupLighting(this.renderer, this.world.scene);
    // pictures of the instruments for their cards (made once, before the headset session)
    makeThumbs(this.renderer, this.world.scene.environment, SHELF.map((d) => d.id));
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
    // (set into the table if you've asked for it: every hit lands on the desk)
    this.kit.setTable(!!this.settings.table);
    this.kitEntity = this.world.createTransformEntity(this.kit.root);
    this.kit.root.add(this.stand.root);
    for (const m of this.handMallets) this.worldRoot.add(m.group);
    this.worldRoot.add(this.waterfall.root, this.dimmer.mesh);
    this.buildLightsOut();
    this.kitHome = this.kit.root.parent;
    this.worldRoot.name = 'RoomOverlays';
    this.world.createTransformEntity(this.worldRoot);
    this.worldRoot.add(this.motes.mesh, this.tag.mesh);
    this.hitWords = new HitWords(this.worldRoot);
    // what you hit answers in its own shape (src/room/hit-fx.ts)
    this.hitFx = new HitFx(this.worldRoot);
    this.approach = new ApproachRings(this.worldRoot);
    this.hud = new Hud(this.kit.root);
    this.buildMovePuck();
    this.hitWords.onShow = (g, at) => this.partFx(g, at);
    // (a Perfect's word only while it's new: a song's first four, a lesson's first dozen; Good, Early and Late always)
    this.hitWords.wants = (g) => g !== 'perfect' || this.game.graded.perfect <= (this.game.inLesson ? 12 : 4);
    // (a Good says which way it was off, in Good's green: early or late, and still counted)
    this.hitWords.lean = () => this.game.lastOffset;
    // the game's own sounds play in the music: the chord under them, landing on the band's grid
    sfx.music = (o) => this.sfxMusic(o);
    sfx.grid = (div) => this.sfxGrid(div);
    this.hint = new Tag(0.36, 0.05);
    this.worldRoot.add(this.hint.mesh);
    this.loadTag = new Tag(0.4, 0.055);
    this.worldRoot.add(this.loadTag.mesh);
    this.lapCues = new GuitarCues(this.worldRoot);
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
    // (?shots=1: the debug hooks without the board, for stills)
    if (DEBUG && !params.has('shots')) {
      this.board = new DebugBoard();
      this.board.mesh.position.set(0, 0.16, -0.36);
      this.board.mesh.rotation.x = -0.3;
      this.kit.root.add(this.board.mesh);
    }
    // the kit's table and the module's keys are surfaces like any other
    this.kitSurface = new Surface('kit', 'kit', 'table', STRIKE_CFG);
    // the panel takes a poke: a fingertip moving into it at a gentle speed, passing through or stopping
    this.moduleSurface = new Surface('module', 'module', 'module', { ...STRIKE_CFG, minSpeed: 0.16, minDecel: 6 });
    this.game = new Game(this.stage, this.progress, this.room, { tempo: this.settings.tempo, offset: this.settings.offset, debug: DEBUG });
    this.game.level = this.settings.level;
    this.debug = {
      phase: 'waiting', deskY: null, deskSource: null, kitOrigin: null, anchored: false, resumed: false, hits: 0, lastHit: null, surfaces: [],
      planes: 0, meshes: 0, mode: 'discover', found: [], audio: false, offsetMs: Math.round(this.settings.offset * 1000), degrade: 0, fps: 0, fpsMin: 0, tag: '', errors: 0,
    };
    (window as unknown as { __thump: unknown }).__thump = { debug: this.debug, game: this, hands, audio, sfx, targets: () => this.targets() };
    this.cleanupFuncs.push(
      this.visibilityState.subscribe((s) => {
        this.onXrVis(s);
        if (s === VisibilityState.Visible) {
          const sess = this.world.session;
          if (sess && sess !== this.audioSession) {
            this.audioSession = sess;
            sess.addEventListener('selectstart', () => audio.resume());
            sess.addEventListener('squeezestart', () => audio.resume());
            // (the headset lifted off: the session goes hidden with no frames, so the world's own state never sees
            // it; the session's event does)
            sess.addEventListener('visibilitychange', () => this.onXrVis(sess.visibilityState as VisibilityState));
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
    const onCoop = (e: Event) => this.onBand((e as CustomEvent<CoopStatus>).detail);
    window.addEventListener('thump:coop', onCoop);
    this.cleanupFuncs.push(() => {
      window.removeEventListener('thump:coop', onCoop);
      this.band.stop();
      this.talk.leave();
    });
    // (Talk: a friend calling is answered or not by it; its changes redraw the panel)
    coop.onCall = (c) => this.talk.incoming(c);
    this.talk.changed = () => this.game.refreshDisplay();
    // (started or joined on the page before entering: pick it up)
    if (coop.status.state !== 'idle') this.onBand(coop.status);
  }

  // ------------------------------------------------------------------ the game's view of the world

  private room: Room = {
    instruments: () => {
      const out: RoomInstrument[] = [];
      // only what you can reach from where you are now (you press ▶ at the table: the door you found standing up
      // stays out of the song rather than taking a part you can't play); the room still accompanies (see `accompany`)
      this.updateReach();
      for (const s of this.surfaces) if (s.discovered && s.voice && s.source !== 'kit' && s.source !== 'module' && s.reach <= PLAY_REACH_M) out.push({ id: s.id, family: s.voice.family, zones: s.zones.length });
      return out;
    },
    muted: (surface) => this.covered[0] === surface || this.covered[1] === surface,
    wordFor: (surface) => {
      const s = this.touched.find((x) => x.id === surface);
      if (!s) return null;
      if (s.sound === 'keys' && s.label === 'flat') return 'keyboard';
      return THING_WORD[s.label] ?? null;
    },
    things: () => {
      // things kept by touch, and anything else in the room you've played (a window, a door)
      // (every thing you've touched counts while it's there; one that's used is kept for good)
      let n = this.touched.length;
      for (const s of this.surfaces) if (s.source !== 'touch' && s !== this.kitSurface && s !== this.moduleSurface && s.voice && s.discovered) n++;
      return n;
    },
    everything: () => {
      // the three nearest found instruments (a room of eight playing along at once is a wall of sound, not an orchestra)
      const list = this.surfaces.filter((s) => s.discovered && s.voice && s.source !== 'kit' && s.source !== 'module').sort((a, b) => a.reach - b.reach);
      return list.slice(0, 3).map((s) => ({ id: s.id, family: s.voice!.family, zones: s.zones.length }));
    },
    chordZone: (id, pcs) => {
      const zones = this.surfaces.find((s) => s.id === id)?.zones ?? [];
      // the first chord tone it has, nearest the middle of the instrument
      for (const pc of pcs) {
        let best = -1;
        for (let i = 0; i < zones.length; i++) if (zones[i].degree >= 0 && zones[i].midi % 12 === pc && (best < 0 || Math.abs(i - zones.length / 2) < Math.abs(best - zones.length / 2))) best = i;
        if (best >= 0) return best;
      }
      return -1;
    },
    zones: (id) => this.zonesOf(id).length,
    zoneFor: (id, degree) => zoneForDegree(this.zonesOf(id), degree),
    degreeOf: (id, zone) => this.zonesOf(id)[zone % PIANO_LOW]?.degree ?? 0,
  };

  private stage: GameStage = {
    band: (e, at, spb) => audio.band(e, this.clock.toAudio(at), spb),
    mix: (m) => audio.mix(m),
    stems: {
      load: (id) => audio.stemLoad(id),
      prefetch: (id) => audio.stemPrefetch(id),
      ready: (id) => audio.stemReady(id),
      play: (id, zero, from) => this.clock.toAudio(zero) > 0 && audio.stemPlay(id, this.clock.toAudio(zero), this.clock.toAudio(from)),
      stop: (fade) => audio.stemStop(fade),
      synced: (zero) => audio.stems.zero > 0 && Math.abs(audio.stems.zero - this.clock.toAudio(zero)) < 0.004,
      level: (stem, v, tau) => audio.stemLevel(stem, v, tau),
    },
    light: (key, k) => {
      const r = this.ref(key);
      if (!r) return;
      // (in a song the approach ring says when; the glow only hints which, softly, so the two don't blur together)
      if (this.game.mode === 'play' || this.game.mode === 'count') k *= this.game.paused ? 0 : 0.2;
      if (r.kind === 'pad') this.kit.pad(r.lane)?.setGlow(k);
      else if (r.kind === 'keys') this.kit.keys.light(r.zone, k);
      else if (r.kind === 'inst') {
        if (!key.startsWith(this.kit.instKey)) return;
        // (the guitar's strum lights its six strings)
        if (this.kit.inst === 'guitar' && r.zone >= 9) this.kit.instLight(9, k);
        else if (r.zone < PIANO_BLACK) this.kit.instLight(r.zone % PIANO_LOW, k);
      } else if (r.surface) this.overlays.get(r.surface)?.light(r.zone, k);
    },
    shelf: (dir) => this.shelfStep(dir),
    bandState: () => ({ state: coop.status.state, players: coop.status.players ?? 1, message: coop.status.message ?? '', host: coop.status.role === 'host', talk: this.talk.menu() }),
    saveLevel: (level) => {
      this.settings = { ...this.settings, level };
      saveSettings(this.settings);
    },
    bandSong: (i) => {
      if (!this.bandOn || this.band.host) return 'local';
      this.band.send({ k: 'ask', i });
      return 'wait';
    },
    songStarted: (i, beat0) => {
      if (!this.bandOn || !this.band.host) return;
      // beat 0 on the band's clock (the host's steady clock)
      this.band.send({ k: 'song', i, at: performance.now() / 1000 + (beat0 - this.clock.t) });
    },
    freeHarmony: () => {
      const id = this.kit.inst;
      const sc = scaleById(id === 'drums' ? 'happy' : (this.settings.shelf[id]?.scale ?? 'happy'));
      return { inst: id, root: 48 + (id === 'drums' ? 0 : this.keyOf(id)), chords: sc.chords };
    },
    useInstrument: (id) => this.useInstrument(id as InstId | null),
    hasPiece: (lane) => this.lanes().includes(lane as Lane),
    shelfSet: (which) => this.shelfChange(which),
    // the game's moments, said over the panel and in the room (src/audio/sfx.ts: in the song's key, on its beat; soft,
    // and success louder than failure)
    holdSong: (on) => {
      // (no sound: the ring beating on the edge and the HUD's Now! say it; a lesson holds a dozen times a minute)
      this.lessonHold = on;
    },
    multUp: (m) => {
      this.hudMult = m;
      this.hudMultT = this.uiT;
      this.kit.module.say(`×${m}`, m >= 4 ? 'gold' : 'white');
      if (this.lastPart.w > 0) this.hitFx?.flash('mult', this.lastPart, m >= 4 ? 0xffd23f : 0xffffff);
      sfx.mult(m);
      this.kit.module.burst('mult', 200, 300);
      this.dimmer.hit(m >= 4 ? 0xffd36a : 0xffffff, 0.6);
    },
    milestone: (run) => {
      this.kit.module.say(`${run} combo`, run >= 100 ? 'gold' : 'white');
      this.hudStreak = run;
      this.hudStreakT = this.uiT;
      sfx.milestone(run);
      this.kit.module.burst('milestone', 200, 300);
      this.dimmer.hit(0xffd36a, 0.8);
    },
    comboBroke: (run) => {
      this.kit.module.say(`Combo ${run} lost`, 'grey');
      // (the miss already thudded: only a long run lost has its own sound)
      sfx.runLost(run);
    },
    gradeStamp: (letter, fullCombo) => {
      this.kit.module.stamp();
      const high = letter === 'S' || letter === 'A';
      sfx.stamp(letter);
      if (high) {
        this.dimmer.hit(letter === 'S' ? 0xffd36a : 0x7be0a0, 1);
        if (letter === 'S') this.lightsOut.fire('curtain');
      }
      void fullCombo;
    },
    // (the count-up's ticks climb the key's own scale as the score does)
    countTick: () => sfx.count(Math.round((this.game.display.result?.t ?? 0) * 8)),
    newBest: () => {
      sfx.record();
      this.kit.module.burst('record', 700, 210);
    },
    fullCombo: (all) => {
      this.kit.module.say(all ? 'All perfect!!' : 'Full combo!', 'gold');
      sfx.fullCombo(all);
      this.kit.module.burst('fullcombo');
    },
    spotGain: (m) => {
      if (m >= 0.5 && !this.spotSaid) {
        this.spotSaid = true;
        this.kit.module.say('Hands up: Spotlight', 'gold');
      } else this.kit.module.say('Spotlight +25%', 'gold');
      // (the meter on the screen fills: a bell a step up the chord, no burst)
      sfx.spotGain(m);
    },
    spotFire: () => {
      this.spotSaid = false;
      this.kit.module.say('Spotlight!', 'gold');
      // (Lights Out is the sound of it: the power going down, the lamp striking, the band blooming back in)
      this.kit.module.burst('spotlight', 500, 552);
      this.dimmer.hit(0xffd36a, 1);
      this.lightsOut.fire('song');
    },
    spotEnd: () => {
      sfx.whoosh(0, true);
      this.lightsOut.end();
    },
    overtake: () => {
      this.kit.module.say('Ahead of your best', 'gold');
      sfx.overtake();
    },
    lessonStep: (title) => {
      this.kit.module.say(title);
      sfx.lessonStep();
    },
    starLanded: (i, of) => {
      // each star lands as a note of the song's own chord on its melody instrument (tonic, third, fifth; the ninth
      // after a third)
      const notes = this.starMinor ? [0, 3, 7, 14] : [0, 4, 7, 14];
      this.kit.module.starLand(i, of === 3 && this.game.display.gold);
      const fam = this.melodyFamily();
      // (the song's key, kept from its last chord: by the results the key reads C)
      const root = this.starRoot;
      audio.modal(fam, root + notes[i], 0.75, (i - 1) * 0.3, 0, 0.4, 'stars');
      if (i === 2 && of === 3) this.later(this.clock.t + 0.35, () => audio.modal(fam, root + notes[3], 0.6, 0, 0, 0.4, 'stars'));
    },
    celebrate: (stars) => {
      // the last chord: every instrument flashes white and a ring of light runs out across the room from the kit;
      // then a light sweep across every instrument, the kit's LEDs in order, and a note for each star as it fills
      for (const o of this.overlays.values()) {
        o.flashAll();
        o.sweep();
      }
      this.kit.keys.flashAll();
      this.tutti(0.75);
      this.kit.keys.sweep();
      let k = 0;
      for (const p of this.kit.pads.values()) if (p.visible) this.later(this.clock.t + 0.08 * k++, () => p.hit(0.7));
      // each star lands as a note of the song's own chord, on its melody instrument (the tonic, the third, the fifth, then the ninth)
      const fam = this.melodyFamily();
      const root = 72 + this.game.keyPc;
      // (a minor song's chord is minor)
      this.starMinor = !!this.game.harmony()?.minor;
      this.starRoot = root;
      // (each star's note sounds as it lands on the results: starLanded; a jam has no results, so its notes play here)
      if (this.game.mode === 'jam') {
        const notes = this.starMinor ? [0, 3, 7, 14] : [0, 4, 7, 14];
        for (let i = 0; i < Math.min(3, stars); i++) this.later(this.clock.t + 0.6 + 0.2 * i, () => audio.modal(fam, root + notes[i], 0.75, (i - 1) * 0.3, 0, 0.4, 'stars'));
      }
    },
    casting: (c) => {
      // the table marimba glows brighter when a song uses it
      const used = Object.values(c).some((t) => t?.surface === 'keys');
      this.kit.keys.rest = used ? 0.55 : 0.35;
    },
    missed: (key) => {
      // you hear it: a dead knock where the note was, the band chokes, and a run of misses muffles it
      sfx.miss(this.shapeOf(key, this.missShape, this.missCol) ? this.panOf(this.missShape.at) : 0);
      this.grooveAt(Math.max(0.35, this.groove - 0.1));
      const r = this.ref(key);
      if (!r) return;
      if (r.kind === 'pad') this.kit.pad(r.lane)?.miss();
      else if (r.kind === 'keys') this.kit.keys.miss(r.zone);
      else if (r.kind === 'inst') {
        if (key.startsWith(this.kit.instKey) && r.zone < PIANO_BLACK) this.kit.instOverlay()?.miss(r.zone % PIANO_LOW);
      }
      else if (r.surface) this.overlays.get(r.surface)?.miss(r.zone);
    },
    tempo: (t) => {
      this.settings = { ...this.settings, tempo: t };
      saveSettings(this.settings);
    },
    tune: (k) => this.tunePage(k),
    lightsDown: (on) => {
      this.dimmer.set(on);
      audio.echo(on, this.game.clock.spb);
    },
    flourish: () => {
      for (const o of this.overlays.values()) o.sweep();
      this.kit.keys.sweep();
      let k = 0;
      for (const p of this.kit.pads.values()) if (p.visible) this.later(this.clock.t + 0.05 * k++, () => p.hit(0.6));
    },
    changeSound: (dir) => this.changeSound(dir),
    // (part names on tape in the room only with hints on: otherwise they're on the panel)
    labels: (parts) => this.setLabels(this.settings.noWords ? [] : parts),
    riser: (sec) => audio.riser(sec),
    drop: () => {
      audio.crash(0.9);
      // everything at once: every ring flashes and sweeps, every pad on the desk thumps, the room answers
      for (const o of this.overlays.values()) {
        o.flashAll();
        o.sweep();
      }
      this.kit.keys.flashAll();
      this.kit.keys.sweep();
      let k = 0;
      for (const p of this.kit.pads.values()) if (p.visible) this.later(this.clock.t + 0.04 * k++, () => p.hit(0.8));
      this.tutti(0.6);
    },
    setting: (name, flip) => {
      const s = this.settings;
      if (name === 'panelMoved') return !!s.panelAt;
      if (name === 'onTable') {
        const on = !!s.table;
        if (!flip) return on;
        this.settings = { ...s, ...(!on ? { table: true } : {}) };
        if (on) delete this.settings.table;
        saveSettings(this.settings);
        sfx.toggle(!on);
        this.kit.setTable(!on);
        this.forgetAir();
        return !on;
      }
      if (name === 'guitarLap') {
        const lap = !s.guitarDesk;
        if (!flip) return lap;
        this.settings = { ...s, guitarDesk: lap };
        saveSettings(this.settings);
        sfx.toggle(!lap);
        // (the guitar out now: held the new way at once)
        if (this.kit.inst === 'guitar') {
          this.instTuning = '';
          this.useInstrument('guitar');
        }
        return !lap;
      }
      const cur = name === 'oneHand' ? s.oneHand : name === 'contrast' ? s.highContrast : name === 'band' ? s.band : name === 'light' ? s.freeLight : !s.noWords;
      if (!flip) return cur;
      const next = { ...s };
      if (name === 'oneHand') next.oneHand = !cur;
      else if (name === 'contrast') next.highContrast = !cur;
      else if (name === 'band') next.band = !cur;
      else if (name === 'light') next.freeLight = !cur;
      else next.noWords = cur;
      saveSettings(next);
      this.applySettings(next);
      sfx.toggle(!cur);
      return !cur;
    },
    retune: (pc, minor) => {
      setMinor(!!minor);
      for (const s of this.surfaces) if (s.discovered && s.voice && FAMILIES[s.voice.family].melodic) retune(s.zones, s.voice.family, s.voice.size, pc);
      retune(this.kit.keyZones, 'keys', 0.5, pc);
    },
    // (the world's boards: never for the autoplayer, which films and tests)
    postScore: (p, done) => {
      if (this.autoOn) return done(null);
      void postScore(p).then(done);
    },
    bandScore: (p, done) => this.bandScoreSend(p, done),
    boardTop: (board, done) => {
      if (this.autoOn) return done(null);
      void boardTop(board).then(done);
    },
    // (a frame later: the game asking is replaced by a new one)
    startOver: () => this.later(this.clock.t, () => this.resetProgress()),
    save: (p) => {
      saveProgress(p);
      if (Math.abs(this.game.opts.offset - this.settings.offset) > 0.001) {
        this.settings = { ...this.settings, offset: this.game.opts.offset };
        saveSettings(this.settings);
        this.debug.offsetMs = Math.round(this.settings.offset * 1000);
      }
    },
    unlock: (u: Unlock) => {
      void u;
      if (u === 'tom' && this.lanes().includes('tom')) {
        this.layout();
        this.kit.pad('tom')?.appear('slide');
        sfx.whoosh(-0.4);
      }
    },
    countIn: (beat, at, vel) => {
      // on your own: sticks clicked from the left, where a drummer would sit (no stand-in drawn: a tiny instrument
      // behind the panel read as a stray object)
      if (this.bandOn || this.placement.phase !== 'placed' || this.kit.inst === 'drums') return false;
      void beat;
      audio.drum('rim', Math.min(1, 0.45 + vel * 0.5), -0.45, this.clock.toAudio(at), 1);
      return true;
    },
    voice: (key, at, vel, mate, you) => {
      const when = this.clock.toAudio(at);
      // a guitar string as it was played ('pluck:string:midi')
      if (key.startsWith('pluck:')) {
        const [, s, m] = key.split(':');
        const snd = instDef('guitar').sounds.find((x) => x.id === this.shelfCfg('guitar').sound) ?? instDef('guitar').sounds[0];
        const st = Number(s);
        const midi = Number(m);
        if (!Number.isFinite(midi)) return;
        if (snd.string) audio.pluck(midi, 0.3 + 0.62 * vel, 0.25, when, snd.string, `string${st}`);
        else audio.modal(snd.family ?? 'harp', midi, 0.3 + 0.62 * vel, 0.25, when, 0.5, `guitar${st}`, st);
        if (this.kit.inst === 'guitar') this.later(at, () => (this.kit.models.get('guitar') as HeldGuitarModel | undefined)?.pluck(st, vel));
        return;
      }
      const r = this.ref(key);
      if (!r) return;
      // the bandmate's own notes: its mallets fly there and strike on the note
      if (mate && !motion.calm) this.malletTo(r, at);
      if (r.kind === 'clap') {
        audio.modal('clap', 60, vel, 0, when, 0.5, 'clap');
        return;
      }
      if (r.kind === 'pad') {
        const p = this.kit.pad(r.lane);
        // (the band's drummer is mixed as a record is, the kick in the middle and the kit half as wide; your own
        // notes played back sit where their drums are)
        const pan = p ? Math.max(-0.8, Math.min(0.8, p.x / 0.4)) : 0;
        audio.drum(r.lane, vel, mate || you ? pan : r.lane === 'kick' ? 0 : pan * 0.5, when);
        this.later(at, () => {
          p?.hit(vel * 0.8);
          if (you) p?.perfect();
          if (this.labelTags.size) this.labelTags.get(key)?.bump();
        });
        return;
      } else if (r.kind === 'inst') {
        this.playInst(key.slice(0, key.indexOf(':')) as InstId, r.zone, vel, 0, when);
      } else if (r.kind === 'keys') {
        const q = this.kit.keyZones[r.zone];
        if (q) audio.modal(this.deskFamily, q.midi, vel, 0, when, 0.5, 'desk', 0);
      } else if (r.kind === 'zone' && r.surface?.voice) {
        const z = r.surface.zones[r.zone];
        if (z) {
          this.lastWorld.set(z.x, 0, -z.z).applyMatrix4(r.surface.world);
          if (r.surface.source === 'touch') this.playPad(r.surface, r.zone, vel, this.panOf(this.lastWorld), when);
          else audio.modal(r.surface.voice.family, z.midi, vel, this.panOf(this.lastWorld), when, r.surface.voice.size, r.surface.id, r.zone);
        }
      }
      // its note lights where it plays, when it plays (and its tape bumps)
      this.pendingLights.push({ at, key, vel, you: !!you });
    },
    bandmate: (event, surface) => {
      const s = surface === 'keys' ? null : this.surfaces.find((x) => x.id === surface);
      const o = s ? this.overlays.get(s) : this.kit.keys;
      // the bandmate speaks through its instrument: a little figure on the notes it plays, never a robot chirp
      const fam: Family = s?.voice?.family ?? this.deskFamily;
      const zones = s ? s.zones : this.kit.keyZones;
      const motif = (degrees: readonly number[], gap: number, vel: number) => {
        degrees.forEach((d, k) => {
          const z = zones[Math.min(zones.length - 1, Math.max(0, d))];
          if (!z) return;
          audio.modal(fam, z.midi, vel, 0, audio.now() + 0.05 + k * gap, s?.voice?.size ?? 0.5, 'mate');
          this.later(this.clock.t + 0.05 + k * gap, () => o?.hit(Math.min(zones.length - 1, d), vel));
        });
      };
      if (event === 'claim') {
        o?.sweep();
        motif([0, 2, 4], 0.11, 0.5);
        if (!this.settings.noWords) {
          if (s) this.tmp.set(s.anchor.x, 0.05, -s.anchor.z - 0.12).applyMatrix4(s.world);
          else this.tmp.set(0, 0.06, -0.12).applyMatrix4(this.kit.root.matrixWorld);
          this.tag.show('Listen, then play it back', 0xf2efe6, this.tmp, this.head, 3);
        }
      } else if (event === 'happy') {
        // pleased: up to the top and back
        motif([2, 4, 5], 0.09, 0.45);
      } else if (event === 'leave') {
        // its goodbye: down the bars and home
        motif([4, 2, 0], 0.14, 0.5);
      } else if (event === 'turn') {
        o?.sweep();
        this.kit.module.pressKey(3);
      } else if (event === 'simpler') {
        // easing off: down, slower
        motif([3, 1], 0.16, 0.4);
      }
    },
  };
  /** Playing together: friends' headsets' sounds play here (to one side), and a light shows they're playing. */
  private band = new BandLink((s, vel) => {
    this.friendHits++;
    this.debug.friendNotes = (this.debug.friendNotes ?? 0) + 1;
    this.friendSeatFor(s)?.pulse(vel);
  });
  /**
   * The others in the band, across the desk: a friend's headset (by its id), or on your own the backing band's
   * players during a song (by 'band:' and the instrument). At most three.
   */
  private seats = new Map<string, FriendSeat>();
  /** Friends' heads and hands at their seats (and ours to them); hearing each other (Talk, opt-in). */
  private presence = new FriendPresence(() => this.band.me);
  private talk = new Talk(coopDeps(coop));
  private seat(key: string, inst: string): FriendSeat | null {
    let s = this.seats.get(key);
    if (!s) {
      if (this.seats.size >= 3) return null;
      const used = new Set([...this.seats.values()].map((x) => x.root.userData.i as number));
      // (the middle seat first, then left and right)
      const i = [1, 0, 2].find((k) => !used.has(k)) ?? 0;
      s = new FriendSeat(i, !this.tableOutline, !this.settings.noWords);
      s.root.userData.i = i;
      this.kit.root.add(s.root);
      this.seats.set(key, s);
      this.debug.seats = this.seats.size;
    }
    const d = SHELF.find((x) => x.id === inst);
    s.set(d?.name ?? inst, d?.color ?? 0xfff2dc, inst);
    return s;
  }
  private dropSeats(band: boolean): void {
    for (const [k, s] of this.seats)
      if (k.startsWith('band:') === band) {
        s.dispose();
        this.seats.delete(k);
        this.debug.seats = this.seats.size;
      }
  }
  /** A friend's sound: which friend's seat (the one whose instrument makes it; the first friend if none does). */
  private friendSeatFor(s: string): FriendSeat | null {
    const [kind, what] = s.split(':');
    let first: FriendSeat | null = null;
    for (const [peer, inst] of this.friendInst) {
      const seat = this.seats.get(peer);
      if (!seat) continue;
      first ??= seat;
      if (kind === 'd' ? inst === 'drums' || inst === 'congas' : kind === 'p' ? inst === 'guitar' : instDef(inst as InstId)?.sounds.some((x) => x.family === what) || (what === 'harp' && inst === 'guitar')) return seat;
    }
    return first;
  }
  private friendHits = 0;
  private friendFlashT = 0;
  private bandSeen = '';
  /** The band's state: start or stop the link, keep the code on the module, say who joined. */
  private onBand(st: CoopStatus): void {
    const playing = st.state === 'connected' && (st.role === 'host' || st.role === 'guest') && !!coop.transport;
    this.band.host = st.role === 'host';
    if (playing) {
      this.band.panOf = (s) => this.friendSeatFor(s)?.pan ?? 0.45;
      this.band.start(coop.transport!);
      this.band.onCtl = (m) => this.onBandCtl(m);
      this.presence.start(coop.transport!);
      this.talk.start(coop.transport!, this.band.me);
      this.bandOn = true;
      this.pingT = 0;
      this.pings = 0;
      this.band.send({ k: 'inst', p: this.band.me, id: this.kit.inst, s: this.game.perfTrack, l: this.game.perfParts });
    } else {
      this.band.stop();
      this.presence.stop();
      this.talk.leave();
      this.bandOn = false;
      this.friendInst.clear();
      this.friendSong.clear();
      this.friendLive.clear();
      this.friendSeen.clear();
      this.game.friendParts.clear();
      this.dropSeats(false);
    }
    this.game.code = (st.state === 'hosting' || st.state === 'connected') && st.role !== 'caller' && st.code ? st.code : '';
    this.game.refreshDisplay();
    const key = `${st.state}:${st.players ?? 0}`;
    if (key === this.bandSeen || this.settings.noWords || this.placement.phase !== 'placed') return;
    const before = this.bandSeen;
    this.bandSeen = key;
    this.tmp.set(0, 0.13, -0.22).applyMatrix4(this.kit.root.matrixWorld);
    if (playing && st.role === 'host') this.tag.show(`${(st.players ?? 2) - 1} playing with you`, 0x2ad1b5, this.tmp, this.head, 3);
    else if (playing) this.tag.show("You're in the band", 0x2ad1b5, this.tmp, this.head, 3);
    else if (before.startsWith('connected') && (st.state === 'closed' || st.state === 'hosting')) this.tag.show(st.message ?? 'Band stopped', 0xfff2dc, this.tmp, this.head, 3);
  }
  private bandOn = false;
  private pingT = 0;
  private pings = 0;
  private friendInst = new Map<string, string>();
  private friendSong = new Map<string, string>();
  private friendLive = new Map<string, string[]>();
  /** When each friend last said what they play (every few seconds while in the band: one gone quiet has left). */
  private friendSeen = new Map<string, number>();
  private instSentT = 0;
  private forget(p: string): void {
    this.friendInst.delete(p);
    this.friendSong.delete(p);
    this.friendLive.delete(p);
    this.friendSeen.delete(p);
    const s = this.seats.get(p);
    if (s) {
      s.dispose();
      this.seats.delete(p);
      this.debug.seats = this.seats.size;
    }
    this.syncFriends();
  }
  /** Friends playing the same song as this headset, on what: their parts drop out of this one's backing. */
  private syncFriends(): void {
    this.game.friendParts.clear();
    const mine = this.game.perfTrack;
    if (!mine) return;
    for (const p of this.friendInst.keys()) if (this.friendSong.get(p) === mine) for (const n of this.friendLive.get(p) ?? []) this.game.friendParts.add(n);
  }
  /** The band's messages: a song starting on the band's clock, a guest asking for one, what each friend plays. */
  private onBandCtl(m: BandCtl): void {
    if (m.k === 'ask' && this.band.host) {
      if (this.game.mode === 'discover' || this.game.mode === 'results') this.game.playSong(m.i);
      return;
    }
    if (m.k === 'song' && !this.band.host) {
      // beat 0 on the band's clock, as this headset's game time
      const local = this.band.toLocal(m.at);
      const beat0 = this.clock.t + (local - performance.now() / 1000);
      if (this.game.mode === 'results' || this.game.mode === 'discover') this.game.playSong(m.i, beat0);
      return;
    }
    if (m.k === 'score') {
      if (this.band.host && m.p !== this.band.me) this.bandCollect(m.p, m.b, m.sc, m.n, m.a, m.f);
      return;
    }
    if (m.k === 'brank') {
      if (!this.band.host && m.b === this.bandBoard && this.bandDone) {
        this.bandDone({ rank: m.r, total: m.t });
        this.bandDone = null;
      }
      return;
    }
    if (m.k === 'inst') {
      if (m.p === this.band.me) return;
      this.friendInst.set(m.p, m.id);
      this.friendSong.set(m.p, m.s ?? '');
      this.friendLive.set(m.p, m.l ?? []);
      this.friendSeen.set(m.p, this.clock.t);
      this.syncFriends();
      // their seat across the desk, in their instrument's colour (the band's own players make room)
      this.dropSeats(true);
      this.seat(m.p, m.id);
    }
  }
  /**
   * A song played together, its scores: each headset sends its own to the band; the host adds them up (everyone's in,
   * or 8 s after its own: one who dropped out doesn't hold it up) and posts the band's score to the song's band board
   * under the band's name, then tells everyone where the band stands. Not for the autoplayer.
   */
  private bandBoard = '';
  private bandDone: ((w: { rank: number; total: number } | null) => void) | null = null;
  private bandScores = new Map<string, { sc: number; n: number; a: number; f: boolean }>();
  private bandScoresFor = '';
  private bandDue = -1;
  private bandScoreSend(p: { board: string; score: number; notes: number; acc: number; fc: boolean }, done: (w: { rank: number; total: number } | null) => void): void {
    if (this.autoOn) return done(null);
    this.bandBoard = p.board;
    this.bandDone = done;
    const sc = Math.round(p.score);
    this.band.send({ k: 'score', p: this.band.me, b: p.board, sc, n: p.notes, a: p.acc, f: p.fc });
    if (this.band.host) {
      this.bandCollect(this.band.me, p.board, sc, p.notes, p.acc, p.fc);
      this.bandDue = this.clock.t + 8;
    }
  }
  private bandCollect(who: string, board: string, sc: number, n: number, a: number, f: boolean): void {
    // (a new song's scores: the last one's go)
    if (board !== this.bandScoresFor) {
      this.bandScores.clear();
      this.bandScoresFor = board;
    }
    this.bandScores.set(who, { sc, n, a, f });
    const players = coop.status.players ?? 1;
    if (this.bandScores.has(this.band.me) && this.bandScores.size >= players) this.bandPost();
  }
  /** The host, each frame: a band's score that's waited long enough for a player who dropped out goes now. */
  private bandTick(): void {
    if (this.bandDue >= 0 && this.clock.t >= this.bandDue && this.bandScores.has(this.band.me)) this.bandPost();
  }
  private bandPost(): void {
    this.bandDue = -1;
    const all = [...this.bandScores.values()];
    const board = this.bandScoresFor;
    this.bandScores.clear();
    this.bandScoresFor = '';
    if (!all.length || !board) return;
    const n = all.reduce((x, e) => x + e.n, 0);
    const score = all.reduce((x, e) => x + e.sc, 0);
    const acc = all.reduce((x, e) => x + e.a * e.n, 0) / n;
    void postScore({ board, name: this.game.bandNameNow(), score, acc, grade: letterFor(acc), fc: all.every((e) => e.f), notes: n }).then((w) => {
      if (!w) return;
      this.band.send({ k: 'brank', b: board, r: w.rank, t: w.total });
      if (board === this.bandBoard && this.bandDone) {
        this.bandDone(w);
        this.bandDone = null;
      }
    });
  }
  /** Keep the clock measured: pings every second at first, then every ten. */
  private tickBand(dt: number): void {
    if (this.band.host) this.bandTick();
    if (!this.bandOn || this.band.host) return;
    this.pingT -= dt;
    if (this.pingT > 0) return;
    this.band.ping();
    this.pings++;
    this.pingT = this.pings < 12 ? 1 : 10;
  }
  private lastSentInst = '';

  /** A friend played: a little light at the module's right, now and then (not every note). */
  private showFriends(): void {
    if (!this.friendHits) return;
    this.friendHits = 0;
    // (a friend with a seat lights it; the flash is for one not seated yet)
    if (this.seats.size && [...this.friendInst.keys()].some((p) => this.seats.has(p))) return;
    if (this.clock.t - this.friendFlashT < 0.12 || this.placement.phase !== 'placed') return;
    this.friendFlashT = this.clock.t;
    this.tmp.set(0.2, 0.06, -0.22).applyMatrix4(this.kit.root.matrixWorld);
    this.flash(this.tmp, 0x2ad1b5);
  }

  /** The phone jam: a code on the module; a friend's phone becomes the bass. */
  private phone = new PhoneLink({
    game: () => this.game,
    now: () => this.clock.t,
    debug: () => this.debug,
    connected: () => {
      if (this.settings.noWords) return;
      this.tmp.set(0, 0.12, -0.2).applyMatrix4(this.kit.root.matrixWorld);
      this.tag.show('Your friend is on bass', 0x2ad1b5, this.tmp, this.head, 3);
    },
  });

  /** The bandmate's notes, lit when they play. */
  private pendingLights: { at: number; key: string; vel: number; you: boolean }[] = [];
  private timed: { at: number; fn: () => void }[] = [];
  private later(at: number, fn: () => void): void {
    this.timed.push({ at, fn });
  }
  // ------------------------------------------------------------------ moving the instruments

  /** Where the instruments stand by themselves (world x, z, yaw) and which way was ahead then. */
  private kitBase = new Vector3();
  /** Where the kit stood by itself in height (the desk found), before any move of yours. */
  private kitBaseY = 0;
  private kitBaseFwd = new Vector3(0, 0, -1);
  /** The move handle: a puck on the desk at the front left; pinch it and the whole setup follows your hand. */
  private movePuck: Mesh | null = null;
  private moveHand = -1;
  private moveOff = new Vector3();
  private moveAt = new Vector3();
  private moveK = 0;
  private moveRot = new Vector3();
  /** The yaw the kit turns to while it's carried (facing you from where it's going). */
  private moveYawT = 0;
  /**
   * Where the kit goes for a pinch at `p` (into moveAt and moveYawT): as far as your hand goes, one for one, and turned
   * to face you from there (its yaw from where it stands, never from your hand's turn: nothing to swing or spin).
   */
  private moveTarget(p: Vector3): void {
    this.moveAt.set(p.x + this.moveOff.x, 0, p.z + this.moveOff.z);
    const dx = this.moveAt.x - this.head.x;
    const dz = this.moveAt.z - this.head.z;
    this.moveYawT = Math.hypot(dx, dz) > 0.12 ? Math.atan2(-dx, -dz) : this.kit.root.rotation.y;
    this.moveAt.y = Math.max(this.kitBaseY - 0.2, Math.min(this.kitBaseY + 0.25, p.y - this.moveOffY));
  }
  /** How far the pinch was above the kit's origin when it was taken. */
  private moveOffY = 0;

  private buildMovePuck(): void {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    // a disc with four short arrows: move me
    // (the brand's plate: plum, its line, off-white)
    g.fillStyle = withAlpha(BRAND.plum, 0.94);
    g.beginPath();
    g.arc(64, 64, 60, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = BRAND.line;
    g.lineWidth = 5;
    g.beginPath();
    g.arc(64, 64, 57, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = BRAND.ink;
    g.lineWidth = 7;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (let k = 0; k < 4; k++) {
      g.save();
      g.translate(64, 64);
      g.rotate((k * Math.PI) / 2);
      g.beginPath();
      g.moveTo(0, -12);
      g.lineTo(0, -38);
      g.moveTo(-10, -28);
      g.lineTo(0, -38);
      g.lineTo(10, -28);
      g.stroke();
      g.restore();
    }
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    const m = new Mesh(new PlaneGeometry(0.05, 0.05), new MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }));
    m.name = 'MoveHandle';
    m.rotation.x = -Math.PI / 2;
    m.position.set(-0.27, 0.003, 0.22);
    m.renderOrder = 8;
    this.kit.root.add(m);
    this.movePuck = m;
  }
  /** Pinch the puck: the instruments (and the screen with them) follow your hand across the desk, turned to you. */
  private kitHandle(dt: number): void {
    const puck = this.movePuck;
    if (!puck) return;
    const placed = this.placement.phase === 'placed';
    const inSong = this.game.mode === 'play' || this.game.mode === 'count';
    puck.visible = placed && !inSong;
    if (!puck.visible) {
      this.moveHand = -1;
      return;
    }
    const root = this.kit.root;
    puck.getWorldPosition(this.moveAt);
    let near = 0;
    for (let i = 0; i < 2; i++) {
      const h = i === 0 ? hands.left : hands.right;
      if (!h.tracked || h.controller) {
        if (this.moveHand === i) this.moveHand = -1;
        continue;
      }
      if (this.moveHand === i) {
        if (!h.pinch.pinching) {
          // let go: the surfaces refit where it stands, and the move is kept (from where it stood by itself)
          this.moveHand = -1;
          // (in the world: the kit may hang from last session's room anchor, whose frame isn't the world's)
          root.getWorldPosition(this.moveAt);
          const dx = this.moveAt.x - this.kitBase.x;
          const dz = this.moveAt.z - this.kitBase.y;
          const f = this.kitBaseFwd;
          const a = dx * f.x + dz * f.z;
          const l = dx * -f.z + dz * f.x;
          const hh = Math.max(-0.2, Math.min(0.25, this.moveAt.y - this.kitBaseY));
          this.settings = { ...this.settings, kitNudge: { a: Math.max(-0.3, Math.min(0.3, a)), l: Math.max(-0.5, Math.min(0.5, l)), ...(Math.abs(hh) > 0.003 ? { h: hh, h2: true as const } : {}) } };
          saveSettings(this.settings);
          sfx.set();
          this.placeKit(true);
          continue;
        }
        // (it goes where the pinch goes and always turns to face you: it never tilts or spins on its own; up or down
        // within 20 cm below and 25 cm above where the desk was found)
        this.moveTarget(h.pinchPoint);
        const k = 1 - Math.exp(-Math.min(dt, 0.05) * 24);
        root.position.lerp(this.moveAt, k);
        let dyaw = this.moveYawT - root.rotation.y;
        dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
        root.rotation.set(0, root.rotation.y + dyaw * k, 0);
        root.updateMatrixWorld(true);
        near = 1;
        continue;
      }
      const d = h.pinchPoint.distanceTo(this.moveAt);
      near = Math.max(near, 1 - Math.min(1, d / 0.08));
      // (a pinch starting within 6 cm of it takes it: tracking puts a pinch a centimetre or two off)
      if (this.moveHand < 0 && h.edge === 'start' && d < 0.06 && !this.dragging[0] && !this.dragging[1]) {
        this.moveHand = i;
        // (from the pinch to the kit's centre, in the world: the kit keeps that as it goes)
        if (this.kitHome && root.parent !== this.kitHome) this.kitHome.attach(root);
        root.updateMatrixWorld(true);
        this.moveOff.copy(root.position).sub(h.pinchPoint);
        this.moveOffY = h.pinchPoint.y - root.position.y;
        sfx.lift();
      }
    }
    this.moveK += (near - this.moveK) * 0.25;
    puck.scale.setScalar(1 + 0.25 * this.moveK);
    (puck.material as MeshBasicMaterial).opacity = 0.65 + 0.35 * this.moveK;
  }

  // ------------------------------------------------------------------ the HUD and the first steps

  /** The streak's last step up (for the HUD), and when (panel time). */
  private hudMult = 0;
  private hudStreak = 0;
  private hudStreakT = -9;
  private hudMultT = -9;
  /** When the count-in ended (panel time): GO shows a moment. */
  private hudGoT = -9;
  private hudWasCount = false;
  /** The instrument whose how-to is showing, and since when. */
  private hudHowInst = '';
  private hudHowT = -9;
  private hudHitsAt = -1;
  private hudSay: HudSay = { kind: 'none' };
  private hudCalcT = -9;
  private ctlSince = -1;
  private spotReadyT = -9;
  private spotWasReady = false;
  /** When a switch of instrument mid-song was refused (too near the end): the HUD says so. */
  switchNoT = -9;
  private hudFirstT = -9;
  private hudSticksT = -9;
  private coachKitT = -1;
  /** In a wait of over 4 s for your next note, until it's nearly due. */
  private waiting = false;
  private longWait(next: number): boolean {
    if (next > 4 && next < 120) this.waiting = true;
    else if (next < 0.4 || next >= 120) this.waiting = false;
    return this.waiting;
  }
  private coachHits = 0;
  private coachGoT = -1;
  private coachSkip = 0;
  /** Where the HUD stands (kit-local): on the desk on your side of the instrument, clear of the kick's front. */
  private hudAt = new Vector3(0, 0.05, 0.24);
  /** Where the HUD's leader points (kit-local): the part `key` plays. */
  private hudTarget = new Vector3();
  private hudTargetOn = false;
  private hudShape: PartShape = { at: new Vector3(), q: new Quaternion(), w: 0, d: 0, round: true };
  private hudCol = new Color();
  private hudPoint(key: string): void {
    if (!this.shapeOf(key, this.hudShape, this.hudCol)) return;
    this.hudTarget.copy(this.hudShape.at);
    this.kit.root.worldToLocal(this.hudTarget);
    this.hudTargetOn = true;
  }
  /** How the band is with you in a song (1: all there; it falls as you miss and comes back as you play). */
  private groove = 1;
  private missShape: PartShape = { at: new Vector3(), q: new Quaternion(), w: 0, d: 0, round: true };
  private missCol = new Color();
  private grooveAt(h: number): void {
    const v = Math.max(0, Math.min(1, h));
    if (Math.abs(v - this.groove) < 1e-3) return;
    this.groove = v;
    audio.groove(v);
  }
  private grooveMode = '';
  private coachTo(n: number): void {
    if ((this.settings.coach ?? 0) >= n) return;
    this.settings = { ...this.settings, coach: n };
    saveSettings(this.settings);
  }
  /** What the HUD says now: the count-in, the one thing to do, the streak; else the first steps; else nothing. */
/** What the sign says while you play (one object, refreshed each frame: nothing allocated). */
  private hudPlay: Extract<HudSay, { kind: 'play' }> = { kind: 'play', run: 0, mult: 1, v: 0, errs: new Float32Array(10), n: 0, i: 0 };
    /**
   * A first song's timing, guessed before it's learned: you hit with what you hear and see, and the headset's sound
   * comes out a little late and your hands are seen a little late, so a hit right on the beat was judged late until
   * the learning caught up (the first song is the one that matters most). Once, ever, when a song first counts in: the
   * sound's own delay plus 30 ms for the tracking, at most 100 ms; a timing already learned is left as it is. Then it's
   * learned as you play (every 16 hits). Not for the autoplayer, which hits by the clock.
   */
  private seedOffset(): void {
    if (this.settings.offsetSeeded || this.autoOn || this.game.mode !== 'count') return;
    if (Math.abs(this.game.opts.offset) < 0.001) this.game.opts.offset = Math.min(0.1, Math.max(0, audio.outputLatency() + 0.03));
    this.settings = { ...this.settings, offsetSeeded: true, offset: this.game.opts.offset };
    saveSettings(this.settings);
    this.debug.offsetMs = Math.round(this.game.opts.offset * 1000);
  }
  private hudTick(dt: number): void {
    const hud = this.hud;
    if (!hud) return;
    // (what it says is worked out 20 times a second, not every frame: it's words, and nothing here needs a frame)
    if (this.uiT - this.hudCalcT < 0.05) {
      hud.update(dt, this.hudAt, this.head, motion.calm, this.hudTargetOn ? this.hudTarget : null);
      return;
    }
    this.hudCalcT = this.uiT;
    this.hudTargetOn = false;
    const placed = this.placement.phase === 'placed';
    const mode = this.game.mode;
    const d = this.game.display;
    const inSong = mode === 'play' || mode === 'count';
    // a song starts with the band all there, and leaves it that way
    if (mode !== this.grooveMode) {
      if (!inSong && this.userPaused) this.clearUserPause();
      // (a new song: the guitar's hand place starts unknown, so the first chord change is an event to hit)
      if (mode === 'count') this.gh.zone = -1;
      if (mode === 'count' || !inSong) {
        this.groove = 0;
        this.grooveAt(1);
      }
      this.grooveMode = mode;
    }
    let say: HudSay = { kind: 'none' };
    if (placed) {
      const ctl = (hands.left.tracked && hands.left.controller) || (hands.right.tracked && hands.right.controller);
      if (inSong && this.hudWasCount && !(mode === 'count' && d.count > 0)) this.hudGoT = this.uiT;
      this.hudWasCount = mode === 'count' && d.count > 0;
      const step = this.game.lessonStepNow();
      const beat = this.game.songBeat;
      const coach = NO_COACH ? 3 : (this.settings.coach ?? 0);
      // (the spotlight's tip says it for a few seconds when it becomes ready, then leaves the HUD to the song)
      const ready = !!(inSong && d.spot?.ready && !d.spot.active);
      if (ready && !this.spotWasReady) this.spotReadyT = this.uiT;
      this.spotWasReady = ready;
      if (this.uiT - this.switchNoT < 1.6) say = { kind: 'tip', big: 'Too late to switch', small: "Song's nearly over" };
      if (ctl && this.ctlSince < 0) this.ctlSince = this.uiT;
      if (!ctl) this.ctlSince = -1;
      if (ctl && !inSong && this.uiT - this.ctlSince < 5) say = { kind: 'tip', big: 'Put the controllers down', small: 'Thump is hands only' };
      else if (inSong && this.game.paused) say = { kind: 'none' };
      else if (inSong && this.game.hold?.kind === 'read') {
        const h = this.game.hold;
        say = { kind: 'tip', big: h.title, small: h.say, foot: h.key ? `Hit the ${partName(h.key)} to go on` : 'Hit anything to go on', icon: this.kit.inst === 'drums' || this.kit.inst === 'marimba' ? 'stick' : undefined };
        if (h.key) this.hudPoint(h.key);
      } else if (this.uiT - this.hudFirstT < 1.1) say = { kind: 'tip', big: 'First Perfect!', small: 'Right on the beat. Keep doing that', gold: true };
      else if (this.uiT - this.hudSticksT < 1.4) say = { kind: 'tip', big: 'Sticks!', small: 'Open your hand to let go', icon: 'stick' };
      else if (inSong && this.game.hold?.kind === 'note') {
        say = { kind: 'tip', big: 'Now', small: `Hit the ${partName(this.game.hold.key)}`, hot: true };
        this.hudPoint(this.game.hold.key);
      }
      else if (d.count > 0 && (mode === 'count' || this.game.looper.state === 'count')) say = { kind: 'count', n: d.count };
      else if (inSong && this.uiT - this.hudGoT < 0.6) say = { kind: 'go' };
      else if (inSong && d.spot?.ready && !d.spot.active && this.uiT - this.spotReadyT < 3.5) say = { kind: 'tip', big: 'Hands up!', small: 'Raise both hands for double points', gold: true };
      else if (inSong && this.uiT - this.hudMultT < 1.5 && this.hudMult > 1) say = { kind: 'mult', n: this.hudMult };
      else if (inSong && this.uiT - this.hudStreakT < 1.5 && this.hudStreak > 0) say = { kind: 'streak', n: this.hudStreak };
      else if (step) say = { kind: 'tip', big: step.title, small: step.say };
      else if (inSong && beat >= 0 && beat < 8 && coach < 3) say = { kind: 'tip', big: 'Hit when the ring closes', small: 'Each ring shrinks onto what you hit' };
      // (an instrument asked for mid-song: which, and when it comes in, so a switch never seems ignored)
      else if (inSong && mode === 'play' && !this.game.paused && this.game.pendingSwitch()) {
        const ps = this.game.pendingSwitch()!;
        say = { kind: 'tip', big: `${instDef(ps.inst as InstId).name} next`, small: `Switching in ${Math.max(1, Math.ceil(ps.inS))}...` };
      }
      // (a long wait for your next note, the band playing on: when you come in, counted down, so nobody wonders if it's
      // stopped working)
      else if (inSong && mode === 'play' && !this.game.paused && !this.game.listening && this.longWait(this.game.nextNoteIn())) {
        const n = Math.max(1, Math.ceil(this.game.nextNoteIn()));
        say = { kind: 'tip', big: n <= 3 ? `In ${n}` : 'Listen', small: n <= 3 ? 'Get ready' : `Sit tight. You're back in ${n}` };
      }
      // (playing a song with nothing else to say: the run, the multiplier, and how your last hits sat in time)
      else if (inSong && mode === 'play' && !this.game.paused && !this.game.listening) {
        const p = this.hudPlay;
        p.run = this.game.run;
        p.errs = this.game.hitErrs;
        p.mult = d.mult ?? 1;
        p.v = this.game.hitV;
        p.n = this.game.hitErrN;
        p.i = this.game.hitErrI;
        say = p;
      }
      else if (coach === 0 && mode === 'discover' && !this.game.paused) {
        // the welcome: tap the desk and the drums arrive, then the first lesson starts by itself
        if (!this.game.found.includes('kit'))
          say = { kind: 'tip', big: 'Welcome to Thump', small: 'Played before? Pinch and hold to skip', foot: 'Hit a drum, or tap the desk' };
        else {
          // (play a little first: the first lesson starts after a few hits, or 12 s, counted in on the sign)
          if (this.coachKitT < 0) {
            this.coachKitT = this.uiT;
            this.coachHits = this.debug.hits;
          }
          const since = this.uiT - this.coachKitT;
          const played = this.debug.hits - this.coachHits;
          if (played >= 8 && this.coachGoT < 0) this.coachGoT = this.uiT;
          const goAt = Math.min(12, this.coachGoT >= 0 ? this.coachGoT - this.coachKitT + 3 : 12);
          const left = Math.ceil(goAt - since);
          say = { kind: 'tip', big: 'Your drums', small: this.kit.onTable ? 'Slap the pads, or make fists for sticks' : 'Make a fist to grab a stick. Hit anything', icon: this.kit.onTable ? undefined : 'stick', ...(left <= 3 ? { foot: `First lesson in ${Math.max(1, left)}` } : {}) };
          if (since > goAt) {
            const i = this.game.tracks.findIndex((t) => t.id === 'learn-drums');
            if (i >= 0) {
              this.coachTo(1);
              this.game.menu = 'songs';
              this.game.refreshDisplay();
              this.panelAction(`song:${i}`);
              this.panelAction('play');
            } else this.coachTo(3);
          }
        }
        // (played before: a pinch held most of a second skips it all)
        for (const h of [hands.left, hands.right]) if (h.tracked && !h.controller && h.pinch.pinching) this.coachSkip += 0.05;
        if (!(hands.left.pinch.pinching || hands.right.pinch.pinching)) this.coachSkip = 0;
        if (this.coachSkip >= 0.8) this.coachTo(3);
      } else if (coach === 1 && !inSong) this.coachTo(2);
      else if (coach === 2 && !inSong) say = { kind: 'tip', big: mode === 'results' ? 'Poke Next on the screen' : 'Poke Songs on the screen', small: `The menu's on your ${this.handed() === 'left' ? 'left' : 'right'}. Poke it with a finger` };
      else if (mode === 'discover' && !this.game.paused) {
        const inst = this.kit.inst;
        // a new instrument out: how to play it, for 7 s, the first time
        if (inst !== this.hudHowInst) {
          this.hudHowInst = inst;
          this.hudHowT = (this.settings.taught ?? []).includes(inst) ? -99 : this.uiT;
          if (this.hudHowT > 0) this.settings = { ...this.settings, taught: [...(this.settings.taught ?? []), inst] };
          if (this.hudHowT > 0) saveSettings(this.settings);
        }
        if (this.uiT - this.hudHowT < 7) say = { kind: 'tip', big: instDef(inst).name, small: instDef(inst).how, icon: inst === 'drums' || inst === 'marimba' ? 'stick' : undefined };
      }
      // the button a newcomer is shown next pulses on the screen
      this.game.coachFocus = coach === 2 ? (mode === 'results' ? 'next' : 'nav:songs') : null;
      if (inSong && coach !== 1) this.coachTo(3);
    }
    hud.set(say);
    this.hudSay = say;
    // (the sign stands behind the instrument, over it: in view while you play, not down by your hands; the guitar in
    // your lap leaves the desk free, and it stands where the instruments would)
    const ha = this.guitarLap && this.kit.inst === 'guitar' ? null : HUD_AT[this.kit.inst];
    if (ha) this.hudAt.set(this.handed() === 'left' ? HUD_X : -HUD_X, Math.max(0.12, ha.y - (this.kit.inst === 'drums' && this.kit.onTable ? 0.15 : this.kit.sink)), ha.z);
    else this.hudAt.set(0, 0.05, this.guitarLap && this.kit.inst === 'guitar' ? 0.02 : 0.24);
    hud.update(dt, this.hudAt, this.head, motion.calm, this.hudTargetOn ? this.hudTarget : null);
  }

  /** The panel's clock (real time, never paused) and what's waiting on it. */
  private uiT = 0;
  private uiTimed: { at: number; fn: () => void }[] = [];
  private uiLater(dt: number, fn: () => void): void {
    this.uiTimed.push({ at: this.uiT + dt, fn });
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

  /** The song's end: a ring of light that runs out from the kit across the room. */
  private finale: Mesh | null = null;
  private finaleT = -1;
  private makeFinale(): Mesh {
    if (!this.finale) {
      const g = new RingGeometry(0.95, 1, 128);
      g.rotateX(-Math.PI / 2);
      this.finale = new Mesh(g, asLight(new MeshBasicMaterial({ color: 0xfff4dc, transparent: true, depthWrite: false, toneMapped: false, side: DoubleSide })));
      this.finale.frustumCulled = false;
      this.finale.renderOrder = 6;
      this.finale.visible = false;
      this.worldRoot.add(this.finale);
    }
    return this.finale;
  }
  private updateFinale(dt: number): void {
    if (this.finaleT < 0) return;
    this.finale = this.makeFinale();
    this.finaleT += dt;
    // the ring travels at the wave's speed (instruments sound as it reaches them), fading as it goes
    const r = 0.2 + this.finaleT * FINALE_SPEED;
    const k = Math.min(1, r / 5);
    this.kit.root.getWorldPosition(this.finale.position);
    this.finale.position.y += 0.01;
    this.finale.scale.setScalar(r);
    (this.finale.material as MeshBasicMaterial).color.setRGB(1, 0.96, 0.86).multiplyScalar((1 - k) * (1 - k));
    this.finale.visible = k < 1;
    if (k >= 1) this.finaleT = -1;
  }

  /** The bandmate's mallets (they rest crossed on the module between phrases). */
  private mallets = new Mallets();
  private malletN = new Vector3();
  private malletL = new Vector3();
  private malletR = new Vector3();
  private malletDir = new Vector3();
  private malletsUntil = -1;
  private malletTo(r: KeyRef, at: number): void {
    if (r.kind === 'keys') {
      const q = this.kit.keyZones[r.zone];
      if (!q) return;
      this.tmp2.set(q.x, 0.004, -q.z);
      this.kit.root.localToWorld(this.tmp2);
      this.malletN.set(0, 1, 0).transformDirection(this.kit.root.matrixWorld);
    } else if (r.kind === 'zone' && r.surface) {
      const z = r.surface.zones[r.zone];
      if (!z) return;
      this.tmp2.set(z.x, 0.004, -z.z).applyMatrix4(r.surface.world);
      this.malletN.copy(r.surface.normal);
    } else return;
    if (!this.mallets.group.parent) this.worldRoot.add(this.mallets.group);
    this.mallets.strike(at, this.tmp2, this.malletN);
  }
  private updateMallets(): void {
    const m = this.kit.module.root;
    m.updateMatrixWorld();
    // crossed at rest on the desk under the panel, behind the instrument
    const k = this.kit.root;
    k.updateMatrixWorld();
    void m;
    this.malletL.set(-0.01, 0.006, -0.18);
    this.malletR.set(0.01, 0.012, -0.18);
    k.localToWorld(this.malletL);
    k.localToWorld(this.malletR);
    this.malletDir.set(1, 0, 0).transformDirection(k.matrixWorld);
    // only around a jam: a song or the settings page has the table to itself
    const mode = this.game.mode;
    if (mode === 'jam') this.malletsUntil = this.clock.t + 2.5;
    if (mode !== 'jam' && (this.clock.t > this.malletsUntil || this.game.settingsOpen || this.game.tuneOpen || mode === 'play' || mode === 'count')) {
      this.mallets.hide();
      return;
    }
    this.mallets.update(this.clock.t, this.malletL, this.malletR, this.malletDir, this.head);
  }

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
      sfx.tick();
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
    sfx.tick();
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
    this.tag.show(cap(FAMILIES[this.deskFamily].name), FAMILIES[this.deskFamily].color, this.tmp, this.head);
  }

  /** The surface plays the next instrument that suits it; the room map and the saved room follow. */
  private swap(s: Surface): void {
    if (s.source === 'touch') {
      this.setPadSound(s, stepSound(s.sound ?? 'block', 1));
      this.focused = s;
      this.game.focusPad(soundById(s.sound)?.name ?? '', this.clock.t);
      return;
    }
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
      this.tag.show('Pinch and hold to change it', FAMILIES[s.voice!.family].color, this.tmp, this.head, 6);
      return;
    }
    if (!this.kit.keys.group.visible) return;
    const q = this.kit.keyZones[3];
    this.tmp.set(q ? q.x : 0, 0.07, q ? -q.z : -0.16).applyMatrix4(this.kit.root.matrixWorld);
    this.tag.show('Pinch and hold to change it', FAMILIES[this.deskFamily].color, this.tmp, this.head, 6);
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
      this.tag.show(`The ${surfaceName(far).toLowerCase()} plays too`, FAMILIES[far.voice!.family].color, this.tmp, this.head, 6);
    });
  }

  /** Resolve a target key ("surface:zone"), cached. */
  private ref(key: string): KeyRef | null {
    // (a note with no key, from a part nothing on the desk plays: nothing to point at)
    if (!key) return null;
    let r = this.keyRefs.get(key);
    if (r) return r;
    const i = key.indexOf(':');
    const sid = key.slice(0, i);
    const rest = key.slice(i + 1);
    if (sid === 'clap') r = { surface: null, kind: 'clap', lane: 'kick', zone: 0 };
    else if (sid === 'piano' || sid === 'marimba' || sid === 'guitar' || sid === 'handpan' || sid === 'congas') r = { surface: null, kind: 'inst', lane: 'kick', zone: Number(rest) };
    else if (sid === 'kit') r = { surface: this.kitSurface, kind: 'pad', lane: rest as Lane, zone: 0 };
    else if (sid === 'keys') r = { surface: this.kitSurface, kind: 'keys', lane: 'kick', zone: Number(rest) };
    else {
      if (this.refMiss.has(key)) return null;
      const s = this.surfaces.find((x) => x.id === sid);
      if (!s) {
        this.refMiss.add(key);
        return null;
      }
      r = { surface: s, kind: 'zone', lane: 'kick', zone: Number(rest) };
    }
    this.keyRefs.set(key, r);
    return r;
  }

  // ------------------------------------------------------------------ settings

  applySettings(s: Settings): void {
    if (!!s.table !== this.kit.onTable) {
      this.kit.setTable(!!s.table);
      this.forgetAir();
    }
    const was = this.settings;
    this.settings = s;
    motion.calm = s.calmMotion ?? prefersReducedMotion();
    audio.setBed(s.band);
    this.game.opts.tempo = s.tempo;
    this.game.opts.offset = s.offset;
    this.game.level = s.level;
    this.debug.offsetMs = Math.round(s.offset * 1000);
    if (was.highContrast !== s.highContrast) {
      this.kit.setContrast(s.highContrast);
      this.kit.keys.recolor(FAMILIES[this.deskFamily].color);
      for (const [surf, o] of this.overlays) o.build(surf.zones, s.highContrast);
    }
    if (was.oneHand !== s.oneHand || was.hand !== s.hand) this.layout();
    if (s.noWords) this.tag.show('', 0, null, null);
  }

  /** "Start over" (on the page, or in Settings): forget progress (the kit stays where it is, and your names on the
   * world's boards stay yours), and the first-time hints come back. */
  private resetProgress(): void {
    // (a song on: it stops first, its band with it)
    if (this.game.mode === 'play' || this.game.mode === 'count') this.game.stop();
    // (and the first-time guide runs again, as on a first go)
    if (this.settings.coach !== undefined) {
      const { coach: _c, ...rest } = this.settings;
      this.settings = rest as typeof this.settings;
      saveSettings(this.settings);
    }
    this.coachKitT = this.coachGoT = -1;
    this.coachSkip = 0;
    this.hudHowInst = '';
    const kitPose = this.progress.kit;
    const { me, bandWords } = this.progress;
    this.progress = { ...freshProgress(), kit: kitPose, rooms: {}, ...(me ? { me } : {}), ...(bandWords ? { bandWords } : {}) };
    if (this.settings.taught?.length) {
      this.settings = { ...this.settings, taught: [] };
      saveSettings(this.settings);
    }
    saveProgress(this.progress);
    this.game.endJam();
    this.game.looper.clear();
    this.game = new Game(this.stage, this.progress, this.room, { tempo: this.settings.tempo, offset: this.settings.offset, debug: DEBUG });
    this.game.level = this.settings.level;
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
    for (const s of this.touched) this.dropSurface(s);
    for (let k = this.surfaces.length - 1; k >= 0; k--) if (this.surfaces[k].source === 'touch') this.surfaces.splice(k, 1);
    this.touched.length = 0;
    this.touchFinder.clear();
    this.clapFound = false;
    this.focused = null;
    this.setLabels([]);
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
    // (and the instruments come out again in front of you, as on a first go: the move you'd made forgotten)
    if (this.settings.kitNudge || this.settings.panelAt) {
      const { kitNudge: _n, panelAt: _p, ...rest } = this.settings;
      this.settings = rest as typeof this.settings;
      saveSettings(this.settings);
    }
    if (this.placement.phase === 'placed') this.recall(true);
  }

  private handed(): 'left' | 'right' {
    return this.settings.hand === 'auto' ? this.placedHand : this.settings.hand;
  }

  /** The kit's pads: kick, snare, hat, and the tom once unlocked. */
  /** The kit's pieces that are out: the full kit (the default), or a small one (kick, snare, hat). */
  private lanes(): Lane[] {
    const l: Lane[] = ['kick', 'snare', 'hat'];
    // (at a tray, with no table found, the small kit unless you asked for the full one: the full one is a metre wide)
    const pieces = this.settings.shelf.drums?.pieces ?? (this.placement.phase === 'placed' && !this.tableOutline ? 'small' : 'full');
    if (pieces === 'small') return l;
    l.push('tom', 'floor', 'crash', 'ride');
    return l;
  }
  /** The kit's style and pieces as set: its look rebuilt if it changed, its sound, and only its pieces shown. */
  private kitStyleNow = '';
  private applyKit(): void {
    const style = (this.settings.shelf.drums?.sound ?? 'acoustic') as KitStyle;
    const want = KIT_STYLES.includes(style) ? style : 'acoustic';
    audio.kitStyle = want;
    if (want !== this.kitStyleNow) {
      this.kitStyleNow = want;
      this.kit.setKitStyle(want);
    }
    this.layout();
    if (this.placement.phase === 'placed') this.kit.showLanes(this.lanes());
  }

  private layout(): void {
    const handed = this.handed();
    this.spots = kitLayout(this.lanes(), { handed, oneHand: this.settings.oneHand ? handed : null });
    for (const s of this.spots) {
      const p = this.kit.pad(s.lane)!;
      p.x = s.x;
      p.z = s.z;
      // (turned to face you and tipped toward you)
      p.aim();
    }
    // (an electronic kit's rack follows its pads)
    this.kit.fitRack(this.lanes());
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

  private partFailed(part: number, e: unknown): void {
    this.debug.errors++;
    reportFrameError(GUARD_NAMES[part], e);
  }

  private step(delta: number) {
    if (this.paused) return;
    const dt = Math.min(delta, 0.1);
    this.watchFrames(delta);
    // (paused by you: the song's clock holds still; you can still use the panel)
    if (!this.userPaused) this.clock.tick(Math.min(dt, 0.05), audio.running, audio.now());
    else this.clock.hold();
    // the panel's own time: it runs while the song is paused (the song's clock stands still then, and a press timed on
    // it would never count)
    this.uiT += dt;
    for (let i = this.uiTimed.length - 1; i >= 0; i--)
      if (this.uiTimed[i].at <= this.uiT) {
        const f = this.uiTimed[i].fn;
        this.uiTimed.splice(i, 1);
        f();
      }
    this.debug.audio = audio.running;
    if (this.resumePending && audio.running && !this.userPaused) {
      this.resumePending = false;
      this.game.resumed(this.clock.t);
    }
    const immersive = this.visibilityState.peek() !== VisibilityState.NonImmersive;
    this.player.head.getWorldPosition(this.head);
    this.tag.update(dt);
    this.hint.update(dt);
    this.loadTag.update(dt);
    this.loadingTick(immersive);
    this.stand.update(dt);
    if (!this.standShown && this.placement.phase === 'placed') this.refreshStand();
    if (this.placement.phase !== 'placed') {
      if (!immersive) return;
      this.sessionTime += dt;
      this.updatePlacement(Math.min(dt, 0.05));
      return;
    }
    this.watchRefSpace();
    this.refineHeight(Math.min(dt, 0.05));
    this.keepWithin(Math.min(dt, 0.05));
    // (just the kit root and its parents: the renderer updates the hundreds of parts under it anyway)
    this.kit.root.updateWorldMatrix(true, false);
    // the anchor may nudge the kit: its surfaces follow
    this.kitSurface.world.copy(this.kit.root.matrixWorld);
    this.kitSurface.inv.copy(this.kitSurface.world).invert();
    this.kit.module.frame.updateMatrixWorld(true);
    this.moduleSurface.world.copy(this.kit.module.frame.matrixWorld);
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
    // each part on its own: a throw in one never stops the others (hits keep playing whatever else fails)
    try {
      this.readHands(delta);
    } catch (e) {
      this.partFailed(0, e);
    }
    try {
      this.watchSwaps();
      this.brushShakers(delta);
      if (this.autoOn) this.autoplay();
      this.seedOffset();
    } catch (e) {
      this.partFailed(1, e);
    }
    try {
      if (!this.userPaused) this.game.tick(this.clock.t);
      this.showBeat();
    } catch (e) {
      this.partFailed(2, e);
    }
    for (let i = this.timed.length - 1; i >= 0; i--) {
      // (one may clear the rest: starting over)
      if (i >= this.timed.length) continue;
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
        else if (r?.kind === 'inst' && p.key.startsWith(this.kit.instKey)) {
          // the band playing it: the keys move by themselves (watch, then play)
          this.kit.instOverlay()?.hit(r.zone % PIANO_LOW, p.vel);
          if (p.you) this.kit.instOverlay()?.perfect(r.zone % PIANO_LOW);
          this.kit.instStruck(this.kit.inst === 'guitar' ? 3 : r.zone % PIANO_LOW, p.vel * 0.6);
        }
        else if (r?.surface) this.overlays.get(r.surface)?.hit(r.zone, p.vel);
        if (this.labelTags.size && r) this.labelTags.get(r.kind === 'keys' ? 'keys' : (r.surface?.id ?? ''))?.bump();
        this.pendingLights.splice(i, 1);
      }
    }
    this.phone.beat();
    this.kit.module.set(this.game.display);
    if (this.kit.module.version !== this.zonesFor) this.panelZones();
    this.debug.mode = this.game.mode;
    if (this.debug.found.length !== this.game.found.length) this.debug.found = this.game.found.slice();
    this.kit.update(dt);
    for (const o of this.overlays.values()) o.update(dt);
    this.updateFinale(dt);
    this.fadePads();
    this.watchClaps(dt);
    this.watchCovers(dt);
    this.showFriends();
    this.hitWords?.update(dt);
    this.hitFx?.update(dt);
    this.hudTick(dt);
    if (this.seats.size) {
      // the band's players leave when the song's over
      if (this.game.mode === 'discover' || this.game.mode === 'build') this.dropSeats(true);
      for (const s of this.seats.values()) s.update(dt, this.head);
    }
    this.panelHandle();
    this.kitHandle(dt);
    this.guitarGrabTick();
    if (!this.kit.module.hidden) this.panelHover();
    else this.kit.module.hover(-1, 0, 0, 0);
    this.tickBand(dt);
    if (this.bandOn) {
      const parts = this.game.perfParts;
      const sig = `${this.kit.inst}|${this.game.perfTrack}|${parts.join(',')}`;
      // what this headset plays, when it changes and every four seconds (so friends know it's still here)
      if (sig !== this.lastSentInst || this.clock.t - this.instSentT > 4) {
        this.lastSentInst = sig;
        this.instSentT = this.clock.t;
        this.band.send({ k: 'inst', p: this.band.me, id: this.kit.inst, s: this.game.perfTrack, l: parts });
        this.syncFriends();
      }
      for (const [p, t] of this.friendSeen) if (this.clock.t - t > 12) this.forget(p);
      this.presence.tick(dt, this.kit.instRoot, this.player.head, this.seats, this.placement.phase === 'placed');
      this.talk.tick(dt, this.seats);
    }
    if (this.labelTags.size) {
      this.labelFaceT -= dt;
      for (const [g, t] of this.labelTags) {
        // a part's tape shows while its instrument is on the desk
        const shown = g.startsWith('kit:') || g === 'keys' ? this.kit.inst === 'drums' : g === 'piano' || g === 'marimba' || g === 'guitar' || g === 'handpan' || g === 'congas' ? this.kit.inst === g : true;
        if (t.mesh.visible !== shown && t.pinnedNow) t.mesh.visible = shown;
        t.update(dt);
        if (this.labelFaceT <= 0) t.face(this.head);
      }
      if (this.labelFaceT <= 0) this.labelFaceT = 0.25;
    }
    this.updateFlash(dt);
    this.updateMallets();
    // two found and a quiet spell: if there's a door or a window beyond reach, say so now (not only after a song)

    // three found and a quiet spell: the one thing no single hit shows you
    if (!this.tuttiTold && this.game.mode === 'discover' && this.game.found.length >= 2 && this.clock.t - this.lastFoundT > 10 && this.clock.t - this.lastTutti > 12 && !this.tag.shownText) {
      this.tuttiTold = true;
      if (!this.settings.noWords) {
        this.tmp.set(0, 0.08, 0.02).applyMatrix4(this.kit.root.matrixWorld);
        this.tag.show('Both hands down, together', 0xff5a3c, this.tmp, this.head, 4);
      }
    }
    for (const sh of this.sheens.values()) sh.update(dt);
    this.kitSheen?.update(dt);
    this.kit.module.root.updateMatrixWorld();
    this.tmp2.set(0, 0.13, -0.05);
    this.kit.module.root.localToWorld(this.tmp2);
    // the song's notes fall onto what plays them
    // (in a song one cue says when: the approach ring; the falling notes are for free play)
    const inSongNow = this.game.mode === 'play' || this.game.mode === 'count';
    this.waterfall.root.visible = !inSongNow;
    if (!inSongNow) this.waterfall.update(dt, this.game, this.kit.root, this.resolveNote);
    // (a ring's warning is about 1.1 s whatever the tempo: 2 beats of a slow song, up to 3 of a fast one)
    const lead = Math.max(2, Math.min(3, 1.1 / Math.max(0.2, this.game.clock.spb)));
    // (the guitar in your lap: what it would show on its top, shown beside it facing you)
    const gm = this.kit.models.get('guitar') as HeldGuitarModel | undefined;
    if (gm && this.lapCues) this.lapCues.update(gm, this.guitarLap && this.kit.inst === 'guitar' && this.placement.phase === 'placed', this.placeHeld, this.head, motion.calm);
    this.approach?.update(this.game, this.shapeOf, motion.calm, this.game.hold?.kind === 'note' ? this.game.hold.key : '', this.uiT, this.game.paused, lead);
    this.dimmer.update(dt, this.head, motion.calm);
    this.lightsOut.update(dt, motion.calm);
    audio.idle();
    if (this.unsaved.length && this.roomAnchor()) {
      const list = this.unsaved.splice(0);
      for (const u of list) if (u.discovered) this.remember(u);
    }
  }

  private waterfall = new Waterfall();
  private dimmer = new Dimmer();
  /** The Spotlight's moment: the room goes dark, a follow spot strikes, your hands' shadows on your wall (src/room/lights-out.ts). */
  private lightsOut!: LightsOut;
  private buildLightsOut(): void {
    const self = this;
    this.lightsOut = new LightsOut(this.renderer, this.world.scene, {
      head: this.head,
      get kit() {
        return self.kit.root;
      },
      get game() {
        return self.game;
      },
      forward: (out) => this.forwardFlat(out),
      frame: () => this.xrFrame ?? undefined,
      refSpace: () => this.renderer.xr.getReferenceSpace(),
      planes: () => this.queries.planes.entities,
      meshes: () => this.queries.meshes.entities,
      paused: () => this.userPaused,
      tasteOk: () => this.placement.phase === 'placed' && (this.game.mode === 'discover' || this.game.mode === 'jam') && !(this.settings.taught ?? []).includes('lightsout'),
      tasted: () => {
        this.settings = { ...this.settings, taught: [...(this.settings.taught ?? []), 'lightsout'] };
        saveSettings(this.settings);
      },
    });
    this.worldRoot.add(this.lightsOut.root);
    this.dimmer.onHit = (c, g) => this.lightsOut.hit(c, g);
  }
  /** Where a note lands (world), its colour, and its target's size and shape. */
  private leanQ = new Quaternion();
  private leanN = new Vector3();
  private resolveNote = (key: string, out: Vector3, col: Color, t: NoteTarget): boolean => {
    const r = this.ref(key);
    if (!r || r.kind === 'clap') return false;
    const root = this.kit.root;
    t.nx = t.ny = t.nz = 0;
    // (a leaning surface's normal, kit-local, into the world)
    const lean = (nx: number, ny: number, nz: number) => {
      root.getWorldQuaternion(this.leanQ);
      this.leanN.set(nx, ny, nz).applyQuaternion(this.leanQ);
      t.nx = this.leanN.x;
      t.ny = this.leanN.y;
      t.nz = this.leanN.z;
    };
    if (r.kind === 'pad') {
      const p = this.kit.pad(r.lane);
      if (!p || !p.visible || this.kit.inst !== 'drums') return false;
      // (on the head, where it's struck, at its tilt)
      out.set(p.x, p.topY + 0.002, p.z);
      root.localToWorld(out);
      col.setHex(LED[r.lane]);
      t.w = p.radius * 2;
      t.d = t.w;
      t.round = true;
      if (p.tilt) lean(Math.sin(p.tilt) * Math.sin(p.yaw), Math.cos(p.tilt), Math.sin(p.tilt) * Math.cos(p.yaw));
      return true;
    }
    if (r.kind === 'keys') {
      const z = this.kit.keyZones[r.zone];
      if (!z || this.kit.inst !== 'drums') return false;
      out.set(z.x, 0.006, -z.z);
      root.localToWorld(out);
      col.setHex(FAMILIES.keys.color);
      t.w = z.w;
      t.d = z.h;
      t.round = false;
      return true;
    }
    if (r.kind === 'inst') {
      if (!key.startsWith(this.kit.instKey)) return false;
      // (the guitar you hold shows a song's chords and strums on itself)
      if (this.kit.inst === 'guitar') return false;
      // (a song's note on a black key lands on that key)
      const bk = this.kit.inst === 'piano' && r.zone >= PIANO_BLACK ? this.blacksNow[r.zone - PIANO_BLACK] : null;
      if (bk) {
        out.set(bk.x, KEYBOARD.blackTop + 0.001, -bk.z);
        this.kit.instRoot.localToWorld(out);
        col.setHex(instDef('piano').color);
        t.round = false;
        t.w = bk.w;
        t.d = bk.h;
        return true;
      }
      const z = this.kit.instZones[r.zone % PIANO_LOW];
      if (!z) return false;
      const hp = this.kit.inst === 'handpan' ? handpanShape(this.kit.instZones) : null;
      out.set(z.x, this.kit.inst === 'marimba' ? MARIMBA.top + 0.002 : hp ? handpanY(Math.hypot(z.x - hp.x, z.z - hp.z), hp.R) + 0.003 : this.kit.inst === 'congas' ? CONGA.top + 0.002 : this.kit.inst === 'piano' ? KEYBOARD.top + 0.001 : 0.013, -z.z);
      this.kit.instRoot.localToWorld(out);
      col.setHex(instDef(this.kit.inst).color);
      t.round = z.shape === 'disc';
      t.w = t.round ? z.w * 2 : z.w;
      t.d = t.round ? t.w : z.h;
      if (this.kit.inst === 'congas') {
        const cn = congaNormal(z.x, -z.z);
        lean(cn.nx, cn.ny, cn.nz);
      } else if (hp) {
        // (the dome's slope under the field: its normal tips outward)
        const d = Math.hypot(z.x - hp.x, z.z - hp.z);
        const slope = (handpanY(d + 0.001, hp.R) - handpanY(Math.max(0, d - 0.001), hp.R)) / 0.002;
        const ux = d > 1e-4 ? (z.x - hp.x) / d : 0;
        const uz = d > 1e-4 ? -(z.z - hp.z) / d : 0;
        lean(-slope * ux, 1, -slope * uz);
      }
      return true;
    }
    const s = r.surface!;
    const z = s.zones[r.zone];
    if (!z || !s.voice) return false;
    out.set(z.x, 0.012, -z.z).applyMatrix4(s.world);
    col.setHex(FAMILIES[s.voice.family].color);
    t.round = z.shape === 'disc';
    t.w = t.round ? z.w * 2 : z.w;
    t.d = t.round ? t.w : z.h;
    return true;
  };

  private resolveMote = (key: string, out: Vector3, col: Color): boolean => {
    const r = this.ref(key);
    if (!r || r.kind === 'clap') return false;
    if (r.kind === 'pad') {
      const p = this.kit.pad(r.lane);
      if (!p || !p.visible) return false;
      out.set(p.x, p.topY + 0.01, p.z);
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
  private instInv = new Matrix4();
  private readHands(delta: number): void {
    const t = this.clock.t;
    const inv = this.tmpM.copy(this.kit.root.matrixWorld).invert();
    // fists and sticks, and the drums' heads struck in the air (in the instruments' own layer: set into the table, it
    // sits lower than the kit)
    this.airTick(delta, this.instInv.copy(this.kit.instRoot.matrixWorld).invert());
    this.spotGesture(delta);
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
      // a pinch on the stand picks an instrument
      const pinched = h.tracked && !h.controller && h.pinch.pinching;
      // a fist holds a stick (the drums) or a mallet (the marimba); its tip is what strikes. An open hand lets go, so
      // fingertips can use the panel; a pinch is the panel's
      const stick = this.kit.inst === 'drums';
      this.malletOn[i] = h.tracked && !h.controller && this.fist[i] && (this.kit.inst === 'marimba' || stick);
      if (this.malletOn[i]) {
        this.handMallets[i].setKind(stick);
        // (drawn resting on what it struck, not sunk through it: hits still read the stick where the hand has it)
        this.restOnSurface(i, inv, stick ? 0.006 : MALLET_HEAD_R);
        this.sample.pinching = false;
      }
      this.handMallets[i].set(this.malletOn[i], this.malletOn[i] ? this.malletButt[i] : h.palm, this.malletTip[i], delta);
      if (pinched && !this.pinchWas[i]) {
        this.pinchStand(h.pinchPoint);
        // with the guitar out, a pinch on the neck holds that chord (the left hand's grip)
      }
      this.pinchWas[i] = pinched;
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
      const struck = this.cands.length > 0;
      this.cands.length = 0;
      this.candHits.length = 0;
      // nothing known was hit: maybe something unknown was (a cup, a book, your knee)
      // (finding things by touch is retired: the instruments are on the shelf; ?objects=1 turns it back on)
      const free = FIND_OBJECTS && (this.game.mode === 'discover' || this.game.mode === 'results' || this.game.mode === 'build');
      // (a hand that just hit something known is still landing on it for a few frames: not a new thing)
      const touch = this.touchFinder.update(hand, h.tracked && !this.sample.pinching && !struck && t - this.handLatch[i] > 0.25 ? h.indexTip : null, t);
      if (touch && free) this.onTouch(touch, side);
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
  private spotBuf: PadSpot[] = [];

  private visibleSpots(): PadSpot[] {
    this.spotBuf.length = 0;
    for (const s of this.spots) if (this.kit.pad(s.lane)?.visible) this.spotBuf.push(s);
    return this.spotBuf;
  }

  /** The hand's six points in a surface's zone frame (y = height along its normal). */
  private fill(h: (typeof hands)['left'], s: Surface): void {
    const pts = this.sample.points as Point[];
    // a mallet in this hand on the marimba: only its head plays
    const mi = h === hands.left ? 0 : 1;
    if (s === this.kitSurface && this.malletOn[mi]) {
      for (const p of pts) this.put(p, this.malletTip[mi], MALLET_HEAD_R, s);
      return;
    }
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
    // (what you play goes to the band; the backing doesn't)
    asPlayer(() => this.onHitNow(s, side, st));
  }
  private onHitNow(s: Surface, side: Side, st: Strike): void {
    this.lastSide = side;
    const t = st.t;
    const gain = st.gain;
    this.debug.hits++;
    this.hitTimes.push(performance.now());
    if (this.hitTimes.length > 64) this.hitTimes.splice(0, 32);
    if (s === this.moduleSurface) {
      const k = this.panelItemAt(this.hitAt.x, this.hitAt.z);
      if (k >= 0) this.pressPanel(k);
      if (k >= 0) this.record(s, k, gain, st, null);
      return;
    }
    // (the room's own walls and furniture aren't instruments any more: the instruments are on the shelf; a hand
    // brushing a wall or a monitor drew rings and bars on it, and cost frames; ?objects=1 turns it back on)
    if (s !== this.kitSurface && !FIND_OBJECTS && !s.discovered) return;
    if (!s.discovered) this.discover(s);
    if (s === this.kitSurface) return this.hitKit(side, gain, st, t);
    const z = zoneAt(s.zones, this.hitAt.x, this.hitAt.z);
    const zone = s.zones[z];
    if (!zone || !s.voice) return;
    if (this.flam(s.id, z, side, t)) return;
    this.lastWorld.set(zone.x, 0, -zone.z).applyMatrix4(s.world);
    // glass is for taps: a hard hit plays no louder than a gentle one
    const g0 = isGlass(s) ? Math.min(gain, 0.55) : gain;
    if (s.source === 'touch') {
      s.lastHitT = this.clock.t;
      this.playPad(s, z, g0, this.panOf(this.lastWorld), 0);
      this.touchedAgain(s);
      this.game.focusPad(soundById(s.sound)?.name ?? '', this.clock.t);
      this.focused = s;
    } else audio.modal(s.voice.family, zone.midi, g0, this.panOf(this.lastWorld), 0, s.voice.size, s.id, z);
    this.overlays.get(s)?.hit(z, gain);
    const grade = this.hitGame(`${s.id}:${z}`, t, gain);
    if (grade === 'perfect') {
      this.overlays.get(s)?.perfect(z);
    }
    this.record(s, z, gain, st, grade);
  }

  private slamT = -9;
  private lastTutti = -9;
  private tuttiTold = false;
  private slamSide: Side = 'left';

  /**
   * The whole orchestra at once: every instrument you've found plays a note of one chord where it stands (the
   * low ones the root, the high ones the third and fifth), each lighting as it sounds, a ring of light running out
   * from the kit. A two-hand slam on the table outside a song, and every song's last chord.
   */
  private tutti(vel: number): void {
    const t0 = audio.now();
    let k = 0;
    // root, third, fifth, octave (as steps of the pentatonic the zones are laid in)
    const chord = [0, 2, 3, 5];
    for (const s of this.surfaces) {
      if (!s.discovered || !s.voice || s === this.kitSurface || s === this.moduleSurface) continue;
      const o = this.overlays.get(s);
      const melodic = FAMILIES[s.voice.family].melodic;
      // pitched instruments take chord tones in their own register; drums just hit
      let zi = 0;
      if (melodic && s.zones.length > 1) {
        const want = chord[k % chord.length];
        zi = zoneForDegree(s.zones, Math.ceil(s.zones[0].degree / 5) * 5 + want);
      }
      const z = s.zones[zi];
      if (!z) continue;
      this.lastWorld.set(z.x, 0, -z.z).applyMatrix4(s.world);
      // a wave out from the kit: each instrument plays as the ring of light reaches it (and a hair apart, like players)
      this.kit.root.getWorldPosition(this.tmp2);
      const delay = motion.calm ? 0.012 * k : this.tmp2.distanceTo(this.lastWorld) / FINALE_SPEED + Math.random() * 0.01;
      audio.modal(s.voice.family, z.midi, vel * (melodic ? 0.8 : 0.9), this.panOf(this.lastWorld), t0 + delay, s.voice.size, s.id, zi);
      this.later(this.clock.t + delay, () => {
        o?.hit(zi, vel);
        o?.flashAll();
      });
      k++;
    }
    // the kit and the bars too
    for (const p of this.kit.pads.values()) if (p.visible) p.hit(vel);
    audio.drum('kick', vel, 0, t0);
    if (this.kit.keys.group.visible) {
      const q = this.kit.keyZones[0];
      if (q) audio.modal(this.deskFamily, q.midi, vel * 0.7, 0, t0 + 0.006, 0.5, 'desk', 0);
      this.kit.keys.flashAll();
    }
    if (!motion.calm) this.finaleT = 0;
  }

  // ------------------------------------------------------------------ things found by touch

  private touchFinder = new TouchFinder();
  /** Things found by touch this session (cups, books, your lap, a seat back). */
  private touched: Surface[] = [];
  private touchId = 1;
  private keepTold = false;
  private lastTouchSide: Side = 'right';

  /**
   * A hand stopped dead somewhere unknown: something is there. It plays at once (the sound physics picks from where it
   * is) and a ring draws round it at that height with its name. Hit it again within 20 s and it's kept (saved with the
   * desk); never again and it fades (a hand stopping in the air: one sound, no harm).
   */
  private onTouch(touch: Touch, side: Side): void {
    // the thing faces back along the way the hand came; the contact is a fingertip's radius below its centre
    const n = this.tmp2.set(-touch.dir.x, -touch.dir.y, -touch.dir.z);
    this.tmp.set(touch.at.x, touch.at.y, touch.at.z).addScaledVector(n, -hands.left.tipRadius);
    // a hand pulled back toward you and stopping is not knocking on anything (things from the side are out in front)
    if (touch.dir.y > -0.6 && touch.dir.x * (this.tmp.x - this.head.x) + touch.dir.z * (this.tmp.z - this.head.z) < 0) return;
    // both hands landing on one new thing together: the first one found it
    const last = this.touched[this.touched.length - 1];
    if (last && side !== this.lastTouchSide && this.clock.t - last.bornT < 0.04 && last.distanceTo(this.tmp) < 0.2) return;
    // the table, the module and every surface already known have their own hits
    this.kitSurface.toZone(this.tmp, this.o);
    const above = this.o.y - this.kitSurface.detector.surfaceY;
    if (this.kitSurface.over(this.o.x, this.o.z, 0.03) && Math.abs(above) < 0.025) return;
    this.moduleSurface.toZone(this.tmp, this.o);
    if (this.moduleSurface.over(this.o.x, this.o.z, 0.04) && Math.abs(this.o.y) < 0.08) return;
    for (const s of this.surfaces) {
      if (s === this.kitSurface || s === this.moduleSurface || !s.voice || s.distanceTo(this.tmp) >= 0.04) continue;
      // a second tap on a thing just found, that its own pad missed (a short lift): it's that thing again
      if (s.source === 'touch') {
        s.toZone(this.tmp, this.o);
        this.hitAt.x = this.o.x;
        this.hitAt.z = this.o.z;
        this.onHit(s, side, { kind: 'stop', speed: touch.speed, gain: speedToGain(touch.speed, s.detector.cfg), point: 0, height: 0, t: touch.t });
      }
      return;
    }
    // to your side or in front (for the knees and the chair's arms)
    this.forwardFlat(this.fwd);
    const lateral = (this.tmp.x - this.head.x) * -this.fwd.z + (this.tmp.z - this.head.z) * this.fwd.x;
    const v = touchVoice(above, n.y, lateral);
    if (!v) return;
    this.makePad(this.tmp, n, v.sound, v.size, v.tone, v.what, false);
    this.lastTouchSide = side;
    const s = this.touched[this.touched.length - 1];
    this.hitAt.x = 0;
    this.hitAt.z = 0;
    this.onHit(s, side, { kind: 'stop', speed: touch.speed, gain: speedToGain(touch.speed, s.detector.cfg), point: 0, height: 0, t: touch.t });
    if (!this.keepTold && !this.settings.noWords) {
      this.keepTold = true;
      this.later(this.clock.t + 1.6, () => {
        if (s.confirmed || !this.touched.includes(s)) return;
        this.tmp.set(0, 0.07, 0).applyMatrix4(s.world);
        this.tag.show('Again to keep it', soundById(s.sound)?.color ?? 0xffffff, this.tmp, this.head, 3);
      });
    }
  }

  /** A pad on a thing: a small surface at the point, facing `n`, playing `sound` (a bank id). */
  private makePad(at: Vector3, n: Vector3, sound: string, size0: number, tone: number, what: string, confirmed: boolean, extent = 0, box?: { minX: number; maxX: number; minZ: number; maxZ: number }): Surface {
    let id = sound;
    let size = size0;
    // no two the same: a second cup rings a different note, a second block is a clave (not for one coming back)
    if (!box) {
      const same = this.touched.filter((x) => x.confirmed && x.sound === id).length;
      if (soundById(id)?.pitched) size = (size + same * 0.27) % 1.0001;
      else if (same && id === 'block') id = 'clave';
      else if (same && id === 'cowbell') id = 'clave';
    }
    const snd = soundById(id) ?? soundById('block')!;
    const up = n.y;
    const s = new Surface(`t${this.touchId++}`, 'touch', what, { ...STRIKE_CFG, rearmM: Math.min(STRIKE_CFG.rearmM ?? STRIKE.rearmM, 0.012) });
    s.setFrame(at, n, this.forwardFlat(this.fwd));
    const r = Math.max(up > 0.6 ? (what === 'knee' ? 0.08 : 0.04) : 0.08, extent / 2);
    s.bounds = box ? { ...box } : { minX: -r, maxX: r, minZ: -r, maxZ: r };
    const b = s.bounds;
    s.outline = [
      { x: b.minX, z: b.minZ },
      { x: b.maxX, z: b.minZ },
      { x: b.maxX, z: b.maxZ },
      { x: b.minX, z: b.maxZ },
    ];
    s.features = { facing: up > 0.6 ? 'up' : 'vertical', width: b.maxX - b.minX, length: b.maxZ - b.minZ, area: (b.maxX - b.minX) * (b.maxZ - b.minZ), elevation: at.y, hollow: 0, glass: what === 'lid' ? 1 : 0, soft: 0, curved: 0, bump: true, label: what };
    s.voice = { family: snd.family ?? 'block', size, why: `${what}, ${Math.round(this.heightOver(at) * 100)} cm over the desk` };
    s.natural = s.voice.family;
    s.sound = snd.id;
    s.tone = tone;
    s.single = true;
    s.singleR = Math.min(r, 0.05);
    s.confirmed = confirmed;
    s.bornT = this.clock.t;
    tuneStrike(s);
    // a thing is solid and small: only a hand that stops on it plays it
    s.detector.stopOnly = true;
    s.reach = s.distanceTo(this.head);
    this.touched.push(s);
    this.surfaces.push(s);
    return s;
  }

  /** A pad's sound: a kit piece or an instrument (pitched ones on their zone's note). */
  private playPad(s: Surface, zone: number, gain: number, pan: number, when: number): void {
    const snd = soundById(s.sound);
    if (snd?.drum) {
      audio.drum(snd.drum as Voice, gain, pan, when, 1);
      return;
    }
    const fam = snd?.family ?? s.voice?.family ?? 'block';
    const z = s.zones[zone] ?? s.zones[0];
    audio.modal(fam, z?.midi ?? 72, gain, pan, when, s.voice?.size ?? 0.5, s.id, s.single ? s.tone : zone);
  }

  /** The pad last hit (◀ ▶ on the module change its sound). */
  private focused: Surface | null = null;

  /** ◀ ▶ while a pad is in focus: the next sound in the bank on it, played once so you hear it. */
  private changeSound(dir: 1 | -1): string | null {
    const s = this.focused;
    if (!s || !this.touched.includes(s)) return null;
    this.setPadSound(s, stepSound(s.sound ?? 'block', dir));
    return soundById(s.sound)?.name ?? null;
  }

  private setPadSound(s: Surface, id: string): void {
    const snd = soundById(id);
    if (!snd) return;
    const from = s.voice?.family;
    s.sound = id;
    s.voice = { ...s.voice!, family: snd.family ?? 'block', why: `changed to ${snd.name}` };
    // keys keep their eight; anything else is one pad the size of the thing
    s.single = id !== 'keys';
    this.dropOverlay(s);
    s.discovered = false;
    this.restoring = true;
    this.hitAt.x = s.anchor.x;
    this.hitAt.z = s.anchor.z;
    this.discover(s);
    this.restoring = false;
    this.overlays.get(s)?.recolor(snd.color);
    this.overlays.get(s)?.flashAll();
    if (from) this.game.rediscovered(from, this.surfaces.some((x) => x !== s && x.discovered && x.voice?.family === from));
    this.playPad(s, 0, 0.7, 0, 0);
    s.confirmed = true;
    this.savePadsSoon();
  }

  private heightOver(p: Vector3): number {
    this.kitSurface.toZone(p, this.o);
    return this.o.y - this.kitSurface.detector.surfaceY;
  }

  /** A hit on a pad: it's kept now, its shape grows to where you hit, a wide flat thing becomes keys. */
  private touchedAgain(s: Surface): void {
    if (!s.confirmed && this.clock.t - s.bornT > 0.15) {
      s.confirmed = true;
      this.savePadsSoon();
    }
    const g = grow(s.bounds, this.hitAt.x, this.hitAt.z);
    if (!g) return;
    s.bounds = g;
    // low and wider than 25 cm (a keyboard, a tray): it's keys, eight across it
    const wide = s.bounds.maxX - s.bounds.minX;
    if (becomesKeys(s.bounds, s.features.facing === 'up', s.sound, s.label)) {
      s.sound = 'keys';
      s.single = false;
      s.voice = { ...s.voice!, family: 'keys', why: `flat and ${Math.round(wide * 100)} cm wide: keys` };
      s.natural = 'keys';
      s.discovered = false;
      this.dropOverlay(s);
      this.hitAt.x = (s.bounds.minX + s.bounds.maxX) / 2;
      this.hitAt.z = (s.bounds.minZ + s.bounds.maxZ) / 2;
      this.discover(s);
      this.savePadsSoon();
    }
  }

  /** Pads never hit a second time fade after 20 s. */
  private fadePads(): void {
    for (let k = this.touched.length - 1; k >= 0; k--) {
      const s = this.touched[k];
      if (s.confirmed || this.clock.t - s.bornT < 20) continue;
      // a part of the machine is kept whether or not you hit it again
      if (this.game.uses(s.id)) {
        s.confirmed = true;
        this.savePadsSoon();
        continue;
      }
      this.forgetPad(s);
    }
  }

  private forgetPad(s: Surface): void {
    const fam = s.voice?.family;
    this.dropSurface(s);
    this.touched.splice(this.touched.indexOf(s), 1);
    const i = this.surfaces.indexOf(s);
    if (i >= 0) this.surfaces.splice(i, 1);
    if (fam) this.game.rediscovered(fam, this.surfaces.some((x) => x.discovered && x.voice?.family === fam));
  }

  /** Save the desk a second from now (several changes, one write; never on the frame of a hit). */
  private saveQueued = false;
  private savePadsSoon(): void {
    if (this.saveQueued) return;
    this.saveQueued = true;
    this.later(this.clock.t + 1, () => {
      this.saveQueued = false;
      this.savePads();
      this.refreshDebugSurfaces();
    });
  }

  /** Kept pads, saved with the desk (in the kit's frame, so they come back where the kit is). */
  private savePads(): void {
    const inv = this.tmpM.copy(this.kit.root.matrixWorld).invert();
    const out: SavedPad[] = [];
    for (const s of this.touched) {
      if (!s.confirmed) continue;
      const c = this.tmp.set(0, 0, 0).applyMatrix4(s.world).applyMatrix4(inv);
      const nn = this.tmp2.copy(s.normal).transformDirection(inv);
      const b = s.bounds;
      out.push({ x: r4(c.x), y: r4(c.y), z: r4(c.z), nx: r4(nn.x), ny: r4(nn.y), nz: r4(nn.z), w: r4(Math.max(b.maxX - b.minX, b.maxZ - b.minZ)), sound: s.sound ?? 'block', size: r4(s.voice?.size ?? 0.5), tone: s.tone, what: s.label, box: [r4(b.minX), r4(b.maxX), r4(b.minZ), r4(b.maxZ)] });
    }
    this.progress.pads = out.slice(-24);
    saveProgress(this.progress);
  }

  /** The desk's pads from last time, drawn again where they were. */
  private restorePads(): void {
    if (!this.progress.pads?.length || this.touched.length) return;
    this.kit.root.updateMatrixWorld(true);
    for (const p of this.progress.pads) {
      const at = new Vector3(p.x, p.y, p.z).applyMatrix4(this.kit.root.matrixWorld);
      const n = new Vector3(p.nx, p.ny, p.nz).transformDirection(this.kit.root.matrixWorld);
      const box = p.box ? { minX: p.box[0], maxX: p.box[1], minZ: p.box[2], maxZ: p.box[3] } : { minX: -p.w / 2, maxX: p.w / 2, minZ: -p.w / 2, maxZ: p.w / 2 };
      const s = this.makePad(at, n, p.sound, p.size, p.tone, p.what, true, 0, box);
      if (p.sound === 'keys') {
        s.single = false;
        s.voice = { ...s.voice!, family: 'keys' };
      }
      this.hitAt.x = 0;
      this.hitAt.z = 0;
      this.restoring = true;
      this.discover(s);
      this.restoring = false;
    }
  }

  // ------------------------------------------------------------------ the machine's tape, and covering a thing

  /** Tape on each thing in the machine (by group: a kit pad, the desk's bars, a thing). */
  private labelTags = new Map<string, Tag>();
  private labelPool: Tag[] = [];
  private labelFaceT = 0;
  private labelGroup(key: string): string {
    const i = key.indexOf(':');
    const sid = key.slice(0, i);
    return sid === 'kit' ? key : sid;
  }
  private setLabels(parts: readonly { key: string; name: string }[]): void {
    const want = new Map<string, string[]>();
    for (const p of parts) {
      const g = this.labelGroup(p.key);
      if (g === 'clap') continue;
      const l = want.get(g) ?? [];
      if (!l.includes(p.name)) l.push(p.name);
      want.set(g, l);
    }
    for (const [g, t] of this.labelTags)
      if (!want.has(g)) {
        t.unpin();
        this.labelTags.delete(g);
        this.labelPool.push(t);
      }
    for (const [g, names] of want) {
      const at = this.labelAt(g);
      if (!at) continue;
      let t = this.labelTags.get(g);
      if (!t) {
        t = this.labelPool.pop() ?? new Tag(0.15, 0.032);
        if (!t.mesh.parent) this.worldRoot.add(t.mesh);
        this.labelTags.set(g, t);
      }
      const r = this.ref(g.includes(':') ? g : `${g}:0`);
      const color = r?.kind === 'pad' ? (PADS[r.lane]?.color ?? 0xffffff) : r?.surface?.sound ? (soundById(r.surface.sound)?.color ?? 0xffffff) : 0xffa630;
      t.pin(names.join(' + '), color, at, this.head);
    }
  }
  /** Where a group's tape goes: just in front of a pad, at the left end of the bars, on top of a thing. */
  private labelAt(g: string): Vector3 | null {
    const root = this.kit.root;
    root.updateMatrixWorld(true);
    if (g.startsWith('kit:')) {
      const p = this.kit.pad(g.slice(4) as Lane);
      if (!p) return null;
      return root.localToWorld(this.tmp.set(p.x, 0.012, p.z + 0.075));
    }
    if (g === 'keys') return root.localToWorld(this.tmp.set(-0.255, 0.02, KEYS_ROW.z));
    if (g === 'piano' || g === 'marimba' || g === 'guitar' || g === 'handpan' || g === 'congas') return root.localToWorld(this.tmp.set(-0.25, 0.02, 0.1));
    const s = this.surfaces.find((x) => x.id === g);
    if (!s) return null;
    return this.tmp.set((s.bounds.minX + s.bounds.maxX) / 2, 0.065, -(s.bounds.minZ + s.bounds.maxZ) / 2).applyMatrix4(s.world);
  }

  /** A palm resting over a thing in the machine: its part goes silent until you lift it (the tape goes pale). */
  private covered: (string | null)[] = [null, null];
  private coverFor = [0, 0];
  private coverCand: (string | null)[] = [null, null];
  private prevPalm = [new Vector3(), new Vector3()];
  private coverTold = false;
  private watchCovers(dt: number): void {
    const on = this.game.mode === 'build' || this.game.mode === 'play' || this.game.mode === 'count' || this.game.mode === 'results';
    for (let i = 0; i < 2; i++) {
      const h = i === 0 ? hands.left : hands.right;
      let hit: string | null = null;
      if (on && h.tracked && !h.controller && dt > 0) {
        const speed = h.palm.distanceTo(this.prevPalm[i]) / dt;
        if (speed < 0.12)
          for (const s of this.touched) {
            // (not what you're playing, and not a hand that just hit it and stayed)
            if (!this.game.coverable(s.id) || this.clock.t - s.lastHitT < 0.5) continue;
            s.toZone(h.palm, this.o);
            const b = s.bounds;
            if (this.o.y > -0.01 && this.o.y < 0.08 && this.o.x > b.minX - 0.02 && this.o.x < b.maxX + 0.02 && this.o.z > b.minZ - 0.02 && this.o.z < b.maxZ + 0.02) {
              hit = s.id;
              break;
            }
          }
      }
      if (h.tracked) this.prevPalm[i].copy(h.palm);
      if (hit && hit === this.coverCand[i]) this.coverFor[i] += dt;
      else {
        this.coverCand[i] = hit;
        this.coverFor[i] = 0;
      }
      const now = hit && this.coverFor[i] >= 0.6 ? hit : null;
      if (now !== this.covered[i]) {
        const was = this.covered[i];
        this.covered[i] = now;
        if (was && was !== this.covered[1 - i]) this.labelTags.get(was)?.dim(false);
        if (now) {
          this.labelTags.get(now)?.dim(true);
          if (!this.coverTold && !this.settings.noWords) {
            this.coverTold = true;
            const at = this.labelAt(now);
            if (at) this.hint.show('Lift your hand and it comes back', 0xfff2dc, at.addScaledVector(this.tmp2.set(0, 1, 0), 0.05), this.head, 2.5);
          }
        }
      }
    }
  }

  /**
   * The beat you can see: in a track, everything on the desk brightens a little on each beat, more on the first of the
   * loop, so there's something to move with before you know the song.
   */
  private beatShown = false;
  private showBeat(): void {
    const m = this.game.mode;
    const on = m === 'build' || m === 'play' || m === 'count';
    const o = this.kit.instOverlay();
    if (!on) {
      if (this.beatShown) {
        this.beatShown = false;
        this.kit.keys.rest = 0.35;
        if (o) o.rest = 0.45;
      }
      return;
    }
    this.beatShown = true;
    const b = this.game.clock.beatAt(this.clock.t);
    if (b < -4) return;
    const f = b - Math.floor(b);
    const first = (((Math.floor(b) % 8) + 8) % 8) === 0;
    const k = Math.exp(-f * 9) * (first ? 1 : 0.55);
    for (const p of this.kit.pads.values()) p.setGlow(0.2 * k);
    this.kit.keys.rest = 0.35 + 0.22 * k;
    if (o) o.rest = 0.45 + 0.3 * k;
  }

  /**
   * Two palms meeting: a hand clap, and a flash of light between them. Also when the tracking loses a hand right at
   * the moment of contact (hands over each other occlude): closing fast and near, then gone, is a clap. Not with a
   * fist (that's a stick: knocking sticks is their own click).
   */
  private clapW = new ClapWatch();
  private clapMid = new Vector3();
  private clapT = -9;
  private clapFound = false;
  private watchClaps(dt: number): void {
    const l = hands.left;
    const r = hands.right;
    if (l.controller || r.controller || this.fist[0] || this.fist[1]) {
      this.clapW.reset();
      return;
    }
    const both = l.tracked && r.tracked;
    if (both) this.clapMid.addVectors(l.palm, r.palm).multiplyScalar(0.5);
    const clap = this.clapW.update(both ? l.palm.distanceTo(r.palm) : Infinity, dt);
    if (!clap || this.clock.t - this.clapT <= 0.2) return;
    this.clapT = this.clock.t;
    const speed = this.clapW.speed;
    const wait = this.clapW.wait;
    audio.modal('clap', 60, Math.min(1, 0.35 + speed * 0.35), this.panOf(this.clapMid), wait > 0 ? audio.now() + wait : 0, 0.5, 'clap');
    this.flash(this.clapMid, 0xff9e7a);
    this.hitGame('clap:0', this.clock.t + wait, 0.8);
    this.debug.claps = (this.debug.claps ?? 0) + 1;
    if (!this.clapFound) {
      this.clapFound = true;
      this.game.discovered('clap', 'hands', this.clock.t);
    }
  }

  /** A quick ring of light at a point, facing you (a clap). */
  private flashMesh: Mesh | null = null;
  private flashT = -1;
  private makeFlash(): Mesh {
    if (!this.flashMesh) {
      const g = new RingGeometry(0.7, 1, 40);
      this.flashMesh = new Mesh(g, asLight(new MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, side: DoubleSide })));
      this.flashMesh.renderOrder = 6;
      this.flashMesh.visible = false;
      this.worldRoot.add(this.flashMesh);
    }
    return this.flashMesh;
  }
  private flash(at: Vector3, color: number): void {
    this.flashMesh = this.makeFlash();
    this.flashMesh.visible = true;
    this.flashMesh.position.copy(at);
    this.flashMesh.lookAt(this.head);
    (this.flashMesh.material as MeshBasicMaterial).color.setHex(color);
    this.flashColor = color;
    this.flashT = 0;
  }
  private flashColor = 0xffffff;
  private updateFlash(dt: number): void {
    if (!this.flashMesh || this.flashT < 0) return;
    this.flashT += dt;
    const k = Math.min(1, this.flashT / 0.35);
    this.flashMesh.scale.setScalar(0.03 + 0.09 * k);
    (this.flashMesh.material as MeshBasicMaterial).color.setHex(this.flashColor).multiplyScalar((1 - k) * (1 - k));
    this.flashMesh.visible = k < 1;
    if (k >= 1) this.flashT = -1;
  }

  /** Both hands on the same pad or bar within 40 ms is one note (a flam reads as a double otherwise). */
  private flamSurface = '';
  private flamZone = -1;
  private flamSide: Side = 'left';
  private flamT = -9;
  private flam(surface: string, zone: number, side: Side, t: number): boolean {
    const same = surface === this.flamSurface && zone === this.flamZone && side !== this.flamSide && t - this.flamT < (STRIKE.flamS ?? 0.025);
    if (!same) {
      this.flamSurface = surface;
      this.flamZone = zone;
      this.flamSide = side;
      this.flamT = t;
    }
    return same;
  }

  private hitKit(side: Side, gain: number, st: Strike, t: number): void {
    this.handHitT[side === 'left' ? 0 : 1] = this.clock.t;
    // both hands slam the table together, outside a song, anywhere on it (pads or bars): the whole orchestra answers
    if (gain > 0.5 && side !== this.slamSide && t - this.slamT < 0.07 && t - this.lastTutti > 4 && (this.game.mode === 'discover' || this.game.mode === 'results') && this.game.looper.state === 'off') {
      this.slamT = -9;
      this.lastTutti = t;
      this.tutti(0.9);
    } else if (gain > 0.5) {
      this.slamT = t;
      this.slamSide = side;
    }
    const x = this.hitAt.x;
    const kz = -this.hitAt.z; // kit-local z (toward the player)
    if (this.kit.inst !== 'drums') return this.hitInstrument(side, gain, st, t);
    // (the drums stand up off the desk now: once they're out, they're struck where their heads are, in the air)
    if (this.kitOutT >= 0 && this.clock.t - this.kitOutT > 1.2) return;
    // an edge key?
    if (this.kit.keys.group.visible) {
      for (let i = 0; i < this.kit.keyZones.length; i++) {
        const q = this.kit.keyZones[i];
        if (Math.abs(x - q.x) <= q.w / 2 + 0.012 && Math.abs(-kz - q.z) <= q.h / 2 + 0.014) {
          if (this.flam('keys', i, side, t)) return;
          this.lastWorld.set(q.x, 0, -q.z);
          this.kit.root.localToWorld(this.lastWorld);
          audio.modal(this.deskFamily, q.midi, gain, this.panOf(this.lastWorld), 0, 0.5, 'desk', i);
          this.kit.keys.hit(i, gain);
          if (!this.deskNamed) this.nameDesk();
          const g = this.hitGame(`keys:${i}`, t, gain);
          if (g === 'perfect') {
            this.kit.keys.perfect(i);
          }
          this.wordAt.set(q.x, 0.01, -q.z);
          this.hitWords?.show(g, this.kit.root.localToWorld(this.wordAt), this.head, LED.snare);
          this.record(this.kitSurface, i, gain, st, g, 'keys');
          return;
        }
      }
    }
    // a pad, or a drum by where on the table: left kick, centre snare, right hat, the edges a rim
    let lane: Lane | 'rim' = this.hitAt.pad >= 0 ? this.hitAt.lane : this.drumAt(x, kz);
    if (lane !== 'rim' && !this.kit.pad(lane)?.visible) lane = 'snare';
    if (this.flam('kit', LANE_INDEX[lane] ?? 9, side, t)) return;
    this.playLane(lane, gain, x, t, st);
  }

  /** A drum sounds and moves, and the song hears it (from the desk or from the air). */
  /** Free play (no song): what you play sends light away from it (the songs' notes, turned around). */
  private fxAt = new Vector3();
  private fxCol = new Color();
  private fxT: NoteTarget = { w: 0, d: 0, round: false };
  private freeFx(key: string, gain: number): void {
    if (this.game.mode !== 'discover' || !this.settings.freeLight) return;
    if (!this.resolveNote(key, this.fxAt, this.fxCol, this.fxT)) return;
    this.waterfall.emit(this.fxAt, this.fxCol, this.fxT, formOf(key, this.fxT.round), gain);
  }

  private playLane(lane: Lane | 'rim', gain: number, x: number, t: number, st: Strike): void {
    const pan = Math.max(-0.8, Math.min(0.8, x / 0.4));
    const g = this.hitGame(`kit:${lane === 'rim' ? 'snare' : lane}`, t, gain);
    audio.drum(lane, this.scoredGain(g, gain), pan, 0, 1);
    this.dimmer.hit(LED[lane === 'rim' ? 'snare' : lane], gain);
    if (lane !== 'rim') this.kit.pad(lane)?.hit(gain);
    if (lane !== 'rim') this.freeFx(`kit:${lane}`, gain);
    if (g === 'perfect' && lane !== 'rim') {
      this.kit.pad(lane)?.perfect();
    }
    const pad = lane !== 'rim' ? this.kit.pad(lane) : undefined;
    if (pad && g) {
      this.wordAt.set(pad.x, pad.topY, pad.z);
      this.hitWords?.show(g, this.kit.root.localToWorld(this.wordAt), this.head, LED[lane as Lane]);
    }
    this.record(this.kitSurface, 0, gain, st, g, lane);
  }

  // ------------------------------------------------------------------ hits in the air (drums on stands, sticks)

  /** When the kit came out (its drums are struck in the air from a moment after). */
  private kitOutT = -1;
  /** Points per hand: three fingertips, the palm, the stick's tip, the thumb and the pinky. */
  private air = new AirHits(AIR_PTS * 2);
  private airInst = '';
  private pinchNear = new Vector3();
  private pinchNear2 = new Vector3();
  private airN = -1;
  private airSong = false;
  private airGap = [0, 0];
  private airLock = [-9, -9];
  private airLockSpeed = [0, 0];
  private fistHold = [0, 0];
  private stickSnap = [false, false];
  /** (light: tracking shake out, the hand's motion kept; at 1.5 Hz the stick trailed the wrist and felt loose) */
  // (firm in the hand: light smoothing at rest, almost none moving)
  private stickFilt = [new OneEuro3(16, 10, 8), new OneEuro3(16, 10, 8)];
  /**
   * The stick (or mallet) as drawn: where the hand has it, unless its tip has gone into a head or a bar, when it pivots
   * at the grip until its tip rests on the surface, as a real one would stop there. Fully resting up to 3 cm in, easing
   * back to the hand by 6 cm (past that the hand is somewhere else, and the stick goes with it). `tipR`: the tip's
   * radius (a mallet's ball rests on its underside). Only what's drawn: hits read the stick where the hand has it.
   */
  private malletButt = [new Vector3(), new Vector3()];
  private restG = new Vector3();
  private restT = new Vector3();
  private restN = new Vector3();
  private restU = new Vector3();
  private restV = new Vector3();
  private restM = new Matrix4();
  private restOnSurface(i: number, inv: Matrix4, tipR: number): void {
    const tip = this.malletTip[i].copy(this.stickTip[i]);
    this.malletButt[i].copy(this.stickButt[i]);
    const G = this.restG.copy(this.stickGrip[i]).applyMatrix4(inv);
    const T = this.restT.copy(tip).applyMatrix4(inv);
    const L = G.distanceTo(T);
    if (L < 0.05) return;
    let best = -1;
    let bestDepth = 0;
    for (let j = 0; j < this.airCount; j++) {
      const q = this.airSurf[j];
      if (q.face !== 'up') continue;
      const nx = q.nx ?? 0, ny = q.ny ?? 1, nz = q.nz ?? 0;
      const depth = (T.x - q.x) * nx + (T.y - q.y) * ny + (T.z - q.z) * nz - tipR;
      if (depth >= 0 || depth < -0.1 || depth > bestDepth) continue;
      // (only over the surface: its disc, or its rectangle, a little wider)
      if (q.r !== undefined) {
        if (q.r < 0 || Math.hypot(T.x - q.x, T.z - q.z) > q.r * 1.05) continue;
      } else if (Math.abs(T.x - q.x) > (q.w ?? 0) / 2 + 0.005 || Math.abs(T.z - q.z) > (q.d ?? 0) / 2 + 0.005) continue;
      // (the grip has to be above it, with room for the stick to reach down onto it)
      const above = (G.x - q.x) * nx + (G.y - q.y) * ny + (G.z - q.z) * nz - tipR;
      if (above <= 0.01 || above >= L) continue;
      best = j;
      bestDepth = depth;
    }
    if (best < 0) return;
    const q = this.airSurf[best];
    const n = this.restN.set(q.nx ?? 0, q.ny ?? 1, q.nz ?? 0);
    const above = (G.x - q.x) * n.x + (G.y - q.y) * n.y + (G.z - q.z) * n.z - tipR;
    // the stick's direction across the surface, then tipped down just enough to touch it: |tip - grip| stays L
    const u = this.restU.subVectors(T, G);
    u.addScaledVector(n, -u.dot(n));
    if (u.lengthSq() < 1e-8) return;
    u.normalize();
    const b = above / L;
    const a = Math.sqrt(1 - b * b);
    u.multiplyScalar(a).addScaledVector(n, -b);
    // fully resting to 6 cm in (a quick stroke goes that far past the bar in the air), then easing back to the hand by 10
    const k = bestDepth > -0.06 ? 1 : Math.max(0, (0.1 + bestDepth) / 0.04);
    T.lerp(this.restV.copy(G).addScaledVector(u, L), k);
    const world = this.restM.copy(this.kit.instRoot.matrixWorld);
    tip.copy(T).applyMatrix4(world);
    // the butt pivots the other way round the grip
    this.malletButt[i].copy(this.stickGrip[i]).addScaledVector(this.restU.subVectors(this.stickGrip[i], tip).normalize(), 0.1);
  }
  /** The grip's working points: the heel of the hand, where the thumb holds it, the hand's frame. */
  private gripB = new Vector3();
  private gripF = new Vector3();
  private gripA = new Vector3();
  /** Each point's height, filtered (keys and bars: a fingertip hovering over them shakes, it isn't pressing). */
  private airY = Array.from({ length: AIR_PTS * 2 }, () => new OneEuro1(2, 6, 1));
  private airLockSurf = [-1, -1];
  /** The piano key each hand point is holding down (its surface id; -1: none), and the point playing a note now. */
  private keyHeld = new Int16Array(AIR_PTS * 2).fill(-1);
  private holdPt = -1;
  /** The point's held key, let go (the finger lifted, slid off, or stopped being tracked). */
  private letGo(p: number): void {
    if (this.keyHeld[p] < 0) return;
    this.kit.keyHold(this.keyHeld[p], 0);
    this.keyHeld[p] = -1;
    audio.release(HOLD_OWNER[p]);
  }
  private forgetPt(p: number): void {
    this.letGo(p);
    this.air.forget(p);
    this.airY[p].reset();
  }
  private airOut: AirHit[] = [];
  /**
   * Where each hand is about to hit (src/room/aim-marks.ts): its striking point's height over the nearest surface
   * under it (Infinity: none within reach), the spot on that surface, its normal and its colour.
   */
  private aimMarks: AimMarks | null = null;
  private aimH = [Infinity, Infinity];
  private aimAt = [new Vector3(), new Vector3()];
  private aimN = [new Vector3(0, 1, 0), new Vector3(0, 1, 0)];
  private aimCol = [0xffffff, 0xffffff];
  /** Hand i's striking point (this.airP, kit frame) against the first `n` surfaces: the lowest it's over is kept. */
  private aimConsider(i: number, n: number): void {
    const P = this.airP;
    for (let j = 0; j < n; j++) {
      const q = this.airSurf[j];
      if (q.face !== 'up') continue;
      const nx = q.nx ?? 0, ny = q.ny ?? 1, nz = q.nz ?? 0;
      const dx = P.x - q.x, dy = P.y - q.y, dz = P.z - q.z;
      const h = dx * nx + dy * ny + dz * nz;
      if (h < -0.01 || h >= AIM_FROM || h >= this.aimH[i]) continue;
      // (over it: inside its disc, or its rectangle, measured in its own plane)
      const px = dx - h * nx, py = dy - h * ny, pz = dz - h * nz;
      if (q.r !== undefined) {
        if (q.r < 0 || Math.hypot(px, py, pz) > q.r) continue;
      } else if (Math.abs(px) > (q.w ?? 0) / 2 || Math.abs(pz) > (q.d ?? 0) / 2) continue;
      this.aimH[i] = Math.max(0, h);
      this.aimAt[i].set(q.x + px, q.y + py, q.z + pz);
      this.aimN[i].set(nx, ny, nz);
      const lane = this.kit.inst === 'drums' ? AIR_LANES[q.id] : undefined;
      this.aimCol[i] = lane ? LED[lane] : instDef(this.kit.inst).color;
    }
  }
  /** The drums' heads as surfaces (kit-local), refreshed each frame from where the pads are. */
  private airSurf: AirSurface[] = Array.from({ length: 32 }, (_, i) => ({ id: i, face: 'up' as const, x: 0, y: 0, z: 0, r: -1 }));
  private airCount = 0;
  /** A fist holds a stick (a mallet with the marimba): per hand, with hysteresis. */
  private fist = [false, false];
  private stickTip = [new Vector3(), new Vector3()];
  private stickGrip = [new Vector3(), new Vector3()];
  private stickButt = [new Vector3(), new Vector3()];
  private stickSide = new Vector3();
  private stickDir = [new Vector3(0, -0.3, -1).normalize(), new Vector3(0, -0.3, -1).normalize()];
  private airP = new Vector3();
  private airStrike: Strike = { kind: 'stop', speed: 0, gain: 0, point: 0, height: 0, t: 0 };
  /**
   * The piano's keys as surfaces (kit-local, z toward you): the black keys first (a finger on one
   * plays it, not the white key under it), then the white key tops, then the chord button. Returns how many.
   */
  private blacksFor: Zone[] | null = null;
  private blacksNow: ReturnType<typeof pianoBlacks> = [];
  private pianoSurfaces(): number {
    const K = KEYBOARD;
    let n = 0;
    const set = (id: number, x: number, y: number, z: number, w: number, d: number) => {
      const s = this.airSurf[n++];
      s.id = id;
      s.face = 'up';
      s.x = x;
      s.y = y;
      s.z = z;
      s.r = undefined;
      s.w = w;
      s.d = d;
      // (played as keys: down 2 mm in, at any speed, sliding in from the side too; up as the finger lifts, so a quick
      // repeated note plays: src/input/air-hits.ts)
      s.key = true;
      // (on the table the wood is the floor: 3 mm up off it lets a key up for the next tap)
      s.lift = this.kit.onTable ? 0.003 : undefined;
      s.confirm = 0.002;
      s.tap = this.kit.onTable;
      return s;
    };
    if (this.blacksFor !== this.kit.instZones) {
      this.blacksFor = this.kit.instZones;
      this.blacksNow = pianoBlacks(this.kit.instZones);
    }
    for (let j = 0; j < this.blacksNow.length; j++) {
      const b = this.blacksNow[j];
      // (the black keys sit at the back, out of reach and narrow: each takes a press 3 mm either side of it and a
      // centimetre behind it, where nothing else is)
      set(30 + j, b.x, K.blackTop, -b.z - 0.005, b.w + 0.006, b.h + 0.01);
    }
    for (const q of this.kit.instZones) {
      // (a white key reaches 2.5 cm past its front edge: a finger pressing the front of a key, or the slip in front of
      // it, comes in at an angle and tracking puts its tip a little nearer you than the pad that touches; and it
      // takes a slanting press, as fingers press a key's front)
      if (q.i < PIANO_CHORD) {
        const s = set(q.i, q.x, K.top, -q.z + 0.0125, q.w + 0.001, q.h + 0.025);
        s.along = 0.45;
      }
      else if (q.i === PIANO_CHORD) {
        const s = set(q.i, q.x, K.top + 0.002, -q.z, 0, 0);
        s.r = q.w + 0.006;
        s.w = undefined;
      }
    }
    return n;
  }
  /** The handpan's field nearest a hit (kit-local x, z): by how far it is outside each field's edge, so the big ding
   * in the middle takes what's closer to it than to a note round it. */
  private nearestField(x: number, z: number, was: number): number {
    let best = was;
    let bd = Infinity;
    for (const q of this.kit.instZones) {
      const d = Math.hypot(x - q.x, z + q.z) - q.w;
      if (d < bd) {
        bd = d;
        best = q.i;
      }
    }
    return best;
  }
  /** Two piano surfaces side by side: white keys next to each other, or a black key and a white key it sits between. */
  private besideKey(a: number, b: number): boolean {
    if (a < 0 || b < 0) return false;
    if (a < 30 && b < 30) return Math.abs(a - b) === 1;
    if (a >= 30 && b >= 30) return false;
    const k = this.blacksNow[(a >= 30 ? a : b) - 30];
    const w = a >= 30 ? b : a;
    return !!k && (k.a === w || k.b === w);
  }
  /** Fingers curled to the palm (mean tip-to-palm distance, m): a fist under 6 cm, open again over 7.5. */
  private curl(h: HandState): number {
    return (h.indexTip.distanceTo(h.palm) + h.middleTip.distanceTo(h.palm) + h.ringTip.distanceTo(h.palm)) / 3;
  }
  private airTick(dt: number, inv: Matrix4): void {
    // (paused: nothing you hit plays or counts; no pick left in the hand)
    if (this.userPaused) {
      this.dropPicks();
      return;
    }
    // (the instruments play from the moment they're out: a drum hit before the desk was ever tapped finds the kit)
    if (this.kitOutT < 0 && (this.game.found.includes('kit') || this.placement.phase === 'placed')) this.kitOutT = this.clock.t;
    const out = this.kitOutT >= 0 && this.placement.phase === 'placed';
    const drums = out && this.kit.inst === 'drums';
    const piano = out && this.kit.inst === 'piano';
    const congas = out && (this.kit.inst === 'congas' || this.kit.inst === 'handpan');
    const isPan = this.kit.inst === 'handpan';
    // the heads, where the pads stand now
    let n = 0;
    for (const q of this.airSurf) {
      q.along = undefined;
      q.confirm = undefined;
      q.rearm = undefined;
      q.key = undefined;
      q.lift = undefined;
      q.tap = undefined;
      // (struck surfaces: a quick second stroke that lifts a centimetre or so plays, not only one back out past 2 cm)
      q.relift = 0.012;
      q.nx = q.ny = q.nz = undefined;
    }
    if (piano) n = this.pianoSurfaces();
    const marimba = out && this.kit.inst === 'marimba';
    if (marimba)
      for (const q of this.kit.instZones) {
        const s = this.airSurf[n++];
        s.id = q.i;
        s.face = 'up';
        s.x = q.x;
        s.y = MARIMBA.top;
        s.z = -q.z;
        s.r = undefined;
        // (the bars as keys: a mallet's stroke plays as it reaches the bar, at any speed, and one dragged along them
        // plays each it crosses; a bar takes its whole slot, gaps and all, so a stroke between two plays one)
        s.w = 0.054 - 0.0045;
        s.d = q.h;
        s.key = true;
        s.lift = 0.01;
        s.confirm = 0.002;
        s.tap = this.kit.onTable;
      }
    // (the guitar you hold reads its own strings and neck: src/kit/held-guitar.ts)
    const guitar = false;
    if (out && this.kit.inst === 'guitar') this.guitarTick(dt, inv);
    else this.dropPicks();
    if (congas)
      if (isPan) {
        // the handpan: each field a disc at its height on the dome
        const sh = handpanShape(this.kit.instZones);
        for (const q of this.kit.instZones) {
          const s = this.airSurf[n++];
          s.id = q.i;
          s.face = 'up';
          s.x = q.x;
          s.y = handpanY(Math.hypot(q.x - sh.x, q.z - sh.z), sh.R);
          s.z = -q.z;
          // (each field reaches over the gaps round it: a hit between fields is the nearest one's, below; nothing on
          // the shell is dead)
          s.r = q.w + 0.02;
          s.w = undefined;
        }
      } else
        // (each conga's middle before its edge: a hand in the middle plays the open tone)
        for (let pass = 0; pass < 2; pass++)
          for (const q of this.kit.instZones) {
            if (q.i % 2 !== pass) continue;
            const s = this.airSurf[n++];
            s.id = q.i;
            s.face = 'up';
            s.x = q.x;
            s.y = CONGA.top;
            s.z = -q.z;
            // (the edge a little past the rim: tracking puts a palm a centimetre off)
            s.r = q.w + (pass ? 0.012 : 0);
            s.w = undefined;
            // (each head tipped toward you, as the drum leans in its stand)
            const cn = congaNormal(q.x, -q.z);
            s.nx = cn.nx;
            s.ny = cn.ny;
            s.nz = cn.nz;
          }
    if (drums)
      for (const lane of AIR_LANES) {
        const p = this.kit.pad(lane);
        if (!p || !p.visible) continue;
        const s = this.airSurf[n++];
        s.id = AIR_LANES.indexOf(lane);
        const r = p.radius;
        // (each head as it is aimed: tipped toward you; a cymbal is struck where it sits, a little wider)
        s.face = 'up';
        s.x = p.x;
        s.y = p.topY;
        s.z = p.z;
        s.r = r * (lane === 'crash' || lane === 'ride' ? 1.15 : 1.1);
        // (a stick comes down in an arc: half of its motion into the head is enough)
        s.along = 0.5;
        if (p.tilt) {
          s.nx = Math.sin(p.tilt) * Math.sin(p.yaw);
          s.ny = Math.cos(p.tilt);
          s.nz = Math.sin(p.tilt) * Math.cos(p.yaw);
        }
      }
    this.airCount = n;
    // (the rest can't be struck: a radius nothing is inside)
    for (let k = n; k < this.airSurf.length; k++) {
      this.airSurf[k].r = -1;
      this.airSurf[k].w = undefined;
    }
    // (the instrument or the piano's song state changed: every point starts afresh, so none fires from where it was)
    const songNow = this.game.mode === 'play' || this.game.mode === 'count';
    if (this.kit.inst !== this.airInst || n !== this.airN || songNow !== this.airSong) {
      this.airInst = this.kit.inst;
      this.airN = n;
      this.airSong = songNow;
      this.forgetAir();
    }
    // (the piano not playable now, picked up or moved: what it held lets go)
    if (!piano) for (let p = 0; p < AIR_PTS * 2; p++) this.letGo(p);
    // (where each hand is about to hit: drums, congas, handpan and marimba)
    this.aimMarks ??= new AimMarks(this.kit.instRoot);
    const aimOn = !this.userPaused && (drums || congas || marimba);
    for (let i = 0; i < 2; i++) {
      const h = i === 0 ? hands.left : hands.right;
      const side: Side = i === 0 ? 'left' : 'right';
      this.aimMarks.hide(i);
      this.aimH[i] = Infinity;
      if (!h.tracked) {
        // a frame or two of lost tracking mid-stroke is not a new start: forget only after a tenth of a second
        this.airGap[i] += dt;
        if (this.airGap[i] > 0.25) this.fist[i] = false;
        // (past 80 ms the hand's points start afresh: a stroke made while it was lost would sound a quarter-second
        // late, which is worse than not at all)
        if (this.airGap[i] > 0.08) for (let k = 0; k < AIR_PTS; k++) this.forgetPt(i * AIR_PTS + k);
        continue;
      }
      const step = dt + (this.airGap[i] <= 0.08 ? this.airGap[i] : 0);
      this.airGap[i] = 0;
      // a fist (not a pinch: that's for the panel) holds a stick; it has to stay a fist (or open) for 80 ms to change
      const c = h.controller ? 1 : this.curl(h);
      const want = this.fist[i] ? c < 0.085 : c < 0.065;
      if (want !== this.fist[i]) {
        this.fistHold[i] += dt;
        if (this.fistHold[i] >= 0.08) {
          this.fist[i] = want;
          this.fistHold[i] = 0;
          if (want && (this.kit.inst === 'drums' || this.kit.inst === 'marimba') && !(this.settings.taught ?? []).includes('sticks')) {
            this.settings = { ...this.settings, taught: [...(this.settings.taught ?? []), 'sticks'] };
            saveSettings(this.settings);
            this.hudSticksT = this.uiT;
          }
          this.forgetPt(i * AIR_PTS + 4);
          this.stickSnap[i] = true;
        }
      } else this.fistHold[i] = 0;
      if (this.fist[i]) {
        // held as a stick is held: in the hand's own frame (its knuckles and wrist: they shake less than fingertips),
        // running forward and across the palm toward the thumb (about 40 degrees in, as a matched grip angles toward
        // the middle), tipped a little toward the palm's side; so a cocked wrist tips it down and a turned hand turns
        // it. Held in the middle of the curled fingers (the hollow of the fist: between the palm, the knuckles and the
        // curled fingertips; nothing of the thumb, which moves about on its own). Barely smoothed (firm in the hand,
        // not trailing it: the fist's hollow, an average of six joints, is steadier than any one); snapped to the hand
        // the moment the fist closes
        this.gripA.subVectors(h.knuckleMiddle, h.wrist);
        this.stickSide.subVectors(h.knuckleIndex, h.knucklePinky);
        if (this.gripA.lengthSq() > 1e-8 && this.stickSide.lengthSq() > 1e-8) {
          this.gripA.normalize();
          this.stickSide.normalize();
          // (out of the palm: the hand's forward x across, its sign by the hand)
          this.gripB.crossVectors(this.gripA, this.stickSide).normalize().multiplyScalar(i === 0 ? 1 : -1);
          this.airP.copy(this.gripA).multiplyScalar(0.77).addScaledVector(this.stickSide, 0.64).addScaledVector(this.gripB, 0.2).normalize();
          if (this.stickSnap[i]) {
            this.stickDir[i].copy(this.airP);
            this.stickFilt[i].reset();
            this.stickSnap[i] = false;
          } else this.stickFilt[i].filter(this.airP, dt, this.stickDir[i]);
          this.stickDir[i].normalize();
          // the grip: the fist's hollow (the palm, the curled index, middle and ring tips, the index and little knuckles)
          this.gripF.copy(h.palm).add(h.indexTip).add(h.middleTip).add(h.ringTip).add(h.knuckleIndex).add(h.knucklePinky).multiplyScalar(1 / 6);
        } else this.gripF.copy(h.knuckleIndex);
        // the butt comes out past the heel of the hand
        this.stickGrip[i].copy(this.gripF);
        this.stickButt[i].copy(this.stickGrip[i]).addScaledVector(this.stickDir[i], -0.1);
        this.stickTip[i].copy(this.stickGrip[i]).addScaledVector(this.stickDir[i], STICK_LEN);
      }
      if (!drums && !piano && !congas && !guitar && !marimba) continue;
      // a hand at the panel (its fingertip within 6 cm of the face, over it or 1.5 cm past its edges) is pressing a
      // button, not playing what's under it
      this.airP.copy(h.indexTip).applyMatrix4(this.moduleSurface.inv);
      if (!this.kit.module.hidden && Math.abs(this.airP.y) < 0.06 && Math.abs(this.airP.x) < PANEL.w / 2 + 0.03 && Math.abs(this.airP.z) < PANEL.h / 2 + 0.015) {
        for (let k = 0; k < AIR_PTS; k++) this.forgetPt(i * AIR_PTS + k);
        continue;
      }
      // the points that can strike: on the piano the five fingertips (a flat hand resting on the keys plays nothing);
      // else three fingertips and the palm (an open hand), or the stick's tip (a fist). A pinching hand is reaching
      // for the panel: only a stick plays
      // (a pinch is reaching for the screen or a handle only near them: a relaxed slap whose thumb lies along the finger
      // reads as a pinch, and its hits were dropped)
      // (near the screen: the fingertip within 10 cm of its face, over it; not just somewhere within 30 cm of its middle,
      // which took in a raised screen's instrument under it)
      const ui = this.pinchNear.copy(h.indexTip).applyMatrix4(this.moduleSurface.inv);
      const nearUi = (!this.kit.module.hidden && Math.abs(ui.y) < 0.1 && Math.abs(ui.x) < PANEL.w / 2 + 0.06 && Math.abs(ui.z) < PANEL.h / 2 + 0.03) || (this.movePuck?.visible && h.pinchPoint.distanceTo(this.movePuck.getWorldPosition(this.pinchNear2)) < 0.12);
      const pinching = h.pinch.pinching && !!nearUi;
      // (one hand's points crossing in the same frame: the one that led, deepest through, is the note, off the piano)
      this.airBest.speed = -1;
      for (let k = 0; k < AIR_PTS; k++) {
        // (a controller: its tip is the one point)
        const use = h.controller ? k === 0 : piano ? k < 3 || k >= 5 : congas || guitar ? k < 4 && !pinching : this.fist[i] ? k === 4 : k < 4 && !pinching;
        const p = i * AIR_PTS + k;
        if (!use) {
          this.forgetPt(p);
          continue;
        }
        const w = k === 0 ? h.indexTip : k === 1 ? h.middleTip : k === 2 ? h.ringTip : k === 3 ? this.airP.copy(h.palm).setY(h.palm.y - h.palmRadius) : k === 4 ? this.stickTip[i] : k === 5 ? h.thumbTip : h.pinkyTip;
        this.airP.copy(w).applyMatrix4(inv);
        // (a mallet strikes with the underside of its ball: the moment you see it touch the bar is the hit, not a
        // centimetre later when its centre would reach it)
        // (a stick the same: its drawn tip rests on the head 6 mm above where its centre is, and that touch is the hit)
        if (k === 4) this.airP.y -= marimba ? MALLET_HEAD_R : 0.006;
        // (a fingertip presses with its pad: the tracked joint is the middle of the finger's end, half a centimetre
        // over the pad you see touch the key; so a key you see touched is pressed, not one pushed a centimetre in)
        // (on the table, all of it: the pad is what meets the wood)
        if ((piano || marimba) && k !== 3 && k !== 4 && !h.controller) this.airP.y -= h.tipRadius * (this.kit.onTable ? 1 : 0.6);
        if (aimOn) this.aimConsider(i, n);
        this.airOut.length = 0;
        // (keys and bars: the height smoothed, so a hovering fingertip's shake isn't a press)
        // (the height smoothed only to tell a key still held down: hits read the raw point, with no lag)
        const heldY = (piano || marimba) && k !== 4 ? this.airY[p].filter(this.airP.y, step) : this.airP.y;
        // (a key held down: still under this finger? lifted 8 mm off it, or slid off its sides, lets it go)
        if (piano && this.keyHeld[p] >= 0) {
          let on = false;
          for (let j = 0; j < n; j++) {
            const q = this.airSurf[j];
            if (q.id !== this.keyHeld[p]) continue;
            const hw = (q.w ?? (q.r ?? 0) * 2) / 2 + 0.008;
            const hd = (q.d ?? (q.r ?? 0) * 2) / 2 + 0.015;
            // (the lower of where it is and its smoothed height: the smoothing lags a firm press by a centimetre or two,
            // and a key let go the frame after it was struck lost its note)
            on = Math.min(heldY, this.airP.y) < q.y + 0.008 && Math.abs(this.airP.x - q.x) < hw && Math.abs(this.airP.z - q.z) < hd;
            // (and the key stays down as far as the finger is in it, its 8 mm of travel)
            if (on) this.kit.keyHold(q.id, (q.y - heldY) / 0.008);
            break;
          }
          if (!on) this.letGo(p);
        }
        // (the loudness range: a stick moves far faster than a fingertip on a key; and a stick resting over a head
        // isn't struck by its shake: it plays from 1 m/s)
        // (an accent in the air is 2 to 3 m/s: that's the loud end)
        const full = k === 4 ? 4.5 : piano ? 1.0 : 2.5;
        this.air.update(p, this.airP.x, this.airP.y, this.airP.z, step, this.airSurf, this.airOut, full, k === 4 ? (marimba ? AIR.stickMin : 0.6) : piano ? AIR.keyMin : AIR.minSpeed);
        for (const hit of this.airOut) {
          if (!piano) {
            if (this.airBest.speed < 0 || hit.depth > this.airBest.depth + 0.002 || (hit.depth > this.airBest.depth - 0.002 && hit.speed > this.airBest.speed)) {
              this.airBest.speed = hit.speed;
              this.airBest.depth = hit.depth;
              this.airBest.surface = hit.surface;
              this.airBest.gain = hit.gain;
              this.airBest.x = this.airP.x;
              this.airBest.z = this.airP.z;
              this.airBest.ago = hit.ago;
            }
            continue;
          }
          this.airPlay(i, side, hit, guitar, congas || marimba, piano);
        }
      }
      if (this.aimH[i] < AIM_FROM) this.aimMarks.show(i, this.aimAt[i], this.aimN[i].x, this.aimN[i].y, this.aimN[i].z, this.aimH[i], this.aimCol[i]);
      if (this.airBest.speed >= 0) {
        this.airHit.surface = congas && isPan ? this.nearestField(this.airBest.x, this.airBest.z, this.airBest.surface) : this.airBest.surface;
        this.airHit.speed = this.airBest.speed;
        this.airHit.gain = this.airBest.gain;
        this.airHit.ago = this.airBest.ago;
        this.airP.x = this.airBest.x;
        this.airPlay(i, side, this.airHit, guitar, congas || marimba, false);
      }
    }
    this.watchSticks(dt, out && (drums || marimba));
  }

  /**
   * Two sticks knocked together: a drummer's click, a real wood click (the clave) where they met, as loud as they
   * were knocked, and a small warm flash. Only with both hands holding sticks (drums or marimba out).
   */
  private stickClick = new StickClick();
  private clickAt = { s: 0, t: 0 };
  private watchSticks(dt: number, sticks: boolean): void {
    if (!sticks || !this.fist[0] || !this.fist[1] || !hands.left.tracked || !hands.right.tracked || hands.left.controller || hands.right.controller) {
      this.stickClick.reset();
      return;
    }
    const a0 = this.stickButt[0], a1 = this.stickTip[0], b0 = this.stickButt[1], b1 = this.stickTip[1];
    const d = segDist(a0.x, a0.y, a0.z, a1.x, a1.y, a1.z, b0.x, b0.y, b0.z, b1.x, b1.y, b1.z, this.clickAt);
    if (!this.stickClick.update(d, dt)) return;
    this.tmp.copy(a0).lerp(a1, this.clickAt.s);
    const v = Math.min(1, 0.3 + this.stickClick.speed * 0.35);
    audio.modal('clave', 60, v, this.panOf(this.tmp), 0, 0.5, 'sticks');
    this.flash(this.tmp, 0xffd9a0);
    this.debug.clicks = (this.debug.clicks ?? 0) + 1;
  }

  /** One hand's hit in the air: one note per slap (chords on the piano), on whatever is out. */
  private airHit: AirHit = { surface: 0, point: 0, speed: 0, gain: 0, depth: 0, ago: 0 };
  private airBest = { speed: -1, depth: 0, surface: 0, gain: 0, x: 0, z: 0, ago: 0 };
  private airPlay(i: number, side: Side, hit: AirHit, guitar: boolean, zone: boolean, piano: boolean): void {
    // one slap is one note: the other points of the same hand land in the same frame or a moment later (not
    // on the piano: chords)
    // (a mallet dragged along the bars plays each: a shorter wait)
    if (!piano && this.clock.t - this.airLock[i] < (zone && this.kit.inst === 'marimba' ? 0.025 : 0.05)) return;
    // on the piano, the finger next to the one that pressed, dipping with it, isn't a press of its own (a black key
    // pressed: the white keys beside it, a moment longer, unless struck harder than it was; in the air there's no key
    // to stop the hand, and the fingers beside go down with it)
    if (piano && this.besideKey(hit.surface, this.airLockSurf[i])) {
      const black = this.airLockSurf[i] >= 30 && hit.surface < 30;
      const since = this.clock.t - this.airLock[i];
      if (since < (black ? 0.15 : 0.08) && hit.speed < (black ? 1 : 0.8) * this.airLockSpeed[i]) return;
    }
    this.airLock[i] = this.clock.t;
    this.airLockSpeed[i] = hit.speed;
    this.airLockSurf[i] = hit.surface;
    this.handHitT[i] = this.clock.t;
    // (judged at the moment it crossed, between this frame and the last: up to a frame's timing jitter gone)
    const t = this.clock.t - Math.max(0, Math.min(0.03, hit.ago));
    this.airStrike.t = t;
    this.airStrike.speed = hit.speed;
    this.airStrike.gain = hit.gain;
    const pan = Math.max(-0.8, Math.min(0.8, this.airP.x / 0.4));
    if (guitar) {
      if (hit.surface === 9) this.playStrum(side, hit.gain, pan, t, this.airStrike);
      else this.playChordPad(hit.surface, side, hit.gain, pan, t, this.airStrike);
      this.debug.hits++;
      return;
    }
    if (zone) {
      this.playZone(this.kit.inst, hit.surface, side, hit.gain, pan, t, this.airStrike);
      this.debug.hits++;
      return;
    }
    if (piano) {
      // (held down, the note sounds on until this finger lifts: a sampled piano's key, like a real keyboard's)
      this.letGo(hit.point);
      this.keyHeld[hit.point] = hit.surface;
      this.holdPt = hit.point;
      if (hit.surface >= 30) this.playBlack(hit.surface - 30, side, hit.gain, pan, t, this.airStrike);
      else this.playZone('piano', hit.surface, side, hit.gain, pan, t, this.airStrike);
      this.holdPt = -1;
      this.debug.hits++;
      return;
    }
    const lane = AIR_LANES[hit.surface];
    if (!lane || this.flam('air', hit.surface, side, t)) return;
    // (the first drum hit, before the desk was tapped: that's the kit found, as a tap would)
    if (!this.kitSurface.discovered) {
      this.hitAt.x = this.airP.x;
      this.hitAt.z = this.airP.z;
      this.quietFind = true;
      this.discover(this.kitSurface);
      this.quietFind = false;
    }
    this.playLane(lane, hit.gain, this.airP.x, t, this.airStrike);
    this.debug.hits++;
  }

  // ------------------------------------------------------------------ the instrument shelf

  /** When a chord pad was last picked (in a track, the guitar follows the track's chords unless you pick). */
  private chordPickedT = -9;
  /** The guitar's chord (0–2) and the piano chord pad's next chord. */
  private guitarChord = 0;
  private chordPadT = -9;
  private pianoChord = 0;
  private shelfCfg(id: InstId): { scale: string; sound: string; oct?: number; frets?: 'easy' | 'real' } {
    const d = instDef(id);
    const c = this.settings.shelf[id] ?? { scale: SCALES[0].id, sound: d.sounds[0].id };
    // inside a track the instruments play its notes (its major or minor), with your sound
    const h = this.game.harmony();
    return h?.song ? { scale: h.scale ?? (h.minor ? 'sad' : 'happy'), sound: c.sound, oct: c.oct, frets: c.frets } : c;
  }
  /** Lowest notes: the piano round middle C, the handpan and guitar an octave down, all in the song's key. */
  /** The key an instrument plays in: the song's in a song, else the one you set for it. */
  private keyOf(id: InstId): number {
    return this.game.harmony()?.song ? this.game.keyPc : (this.settings.shelf[id]?.key ?? 0);
  }
  private instRoot(id: InstId): number {
    const pc = this.keyOf(id);
    // (the piano's tune sits above the band's chords: its root between F4 and E5); your octave on top
    const oct = (this.settings.shelf[id]?.oct ?? 0) * 12;
    // (the marimba carries the tune too: up with the piano's, over the band's chords, not inside them)
    return (id === 'piano' || id === 'marimba' ? 65 + ((pc + 7) % 12) : 48 + pc) + oct;
  }
  private shelfView(): ShelfView {
    const id = this.kit.inst;
    const d = instDef(id);
    const c = this.shelfCfg(id);
    const kc = this.settings.shelf[id]?.key ?? 0;
    return { id, name: d.name, how: d.how, scale: d.scales ? scaleById(c.scale).name : '', sound: d.sounds.find((x) => x.id === c.sound)?.name ?? d.sounds[0].name, oct: c.oct ?? 0, key: id === 'drums' ? '' : (KEY_NAMES.find((k) => k.pc === kc)?.name ?? 'C'), pieces: this.lanes().length > 3 ? 'full' : 'small', frets: c.frets ?? 'easy' };
  }
  /** A song or a build wants this instrument out (null: the one you chose in free play). Not saved. */
  private useInstrument(id: InstId | null): void {
    this.useInstrumentNow(id);
    this.refreshStand();
  }
  private useInstrumentNow(id: InstId | null): void {
    this.kit.unfoldS = this.game.mode === 'play' || this.game.mode === 'count' ? 0.3 : 0.5;
    const want = id ?? ((SHELF.map((d) => d.id) as InstId[]).includes(this.settings.inst as InstId) ? (this.settings.inst as InstId) : 'drums');
    const root = this.instRoot(want);
    const scale = scaleById(this.shelfCfg(want).scale);
    if (want === 'piano') this.kit.pianoScreen(instDef('piano').sounds.find((x) => x.id === this.shelfCfg('piano').sound)?.name ?? '');
    // (already out in this tuning: leave it be)
    const tuning = `${want}:${root}:${scale.id}`;
    if (tuning === this.instTuning) return;
    this.instTuning = tuning;
    // (the guitar comes out where you are now)
    if (want === 'guitar') this.poseGuitar();
    this.kit.setInstrument(want, root, scale);
    if (want === 'piano') this.kit.pianoScreen(instDef('piano').sounds.find((x) => x.id === this.shelfCfg('piano').sound)?.name ?? '');
    // the guitar's strings, made a frame at a time while it unfolds
    if (want === 'guitar') {
      const snd = instDef('guitar').sounds.find((x) => x.id === this.shelfCfg('guitar').sound);
      if (snd?.string) audio.prepareStrings(snd.string);
    }
  }
  private instTuning = '';

  // ------------------------------------------------------------------ the stand

  private stand = new Stand();
  /** A mallet in each hand (the marimba): held while pinching, its head's world position. */
  private handMallets = [new HandMallet(), new HandMallet()];
  private malletOn = [false, false];
  private malletTip = [new Vector3(), new Vector3()];
  private pinchWas = [false, false];
  /** The stand shows what's on the shelf, lit for the one that's out. */
  private refreshStand(): void {
    // (the instruments are on the panel now; the rack stays put away)
    this.stand.root.visible = false;
    this.game.refreshDisplay();
    this.standShown = this.placement.phase === 'placed';
  }
  private standShown = false;
  /** A fingertip near the panel lights the item it's over (before you touch it: you see what you'll press). */
  private rayA = new Vector3();
  private rayB = new Vector3();
  private hoverTickT = -9;
  private panelHover(): void {
    let best = -1;
    let bk = 0;
    if (this.placement.phase === 'placed') {
      for (let i = 0; i < 2; i++) {
        const h = i === 0 ? hands.left : hands.right;
        if (!h.tracked) {
          this.tipOff[i] = 1;
          this.tipArmed[i] = false;
          continue;
        }
        if (h.controller) {
          // a controller points: its ray on the panel hovers, the trigger presses
          this.tipOff[i] = 1;
          this.tipArmed[i] = false;
          this.rayA.copy(h.rayO).applyMatrix4(this.moduleSurface.inv);
          this.rayB.copy(h.rayO).add(h.rayD).applyMatrix4(this.moduleSurface.inv);
          const dy = this.rayB.y - this.rayA.y;
          if (dy >= -1e-4) continue;
          const t = -this.rayA.y / dy;
          if (t < 0 || t > 2) continue;
          const x = this.rayA.x + (this.rayB.x - this.rayA.x) * t;
          const z = this.rayA.z + (this.rayB.z - this.rayA.z) * t;
          const k = this.panelItemAt(x, z);
          if (k < 0) continue;
          if (h.edge === 'start') this.pressPanel(k);
          if (1 > bk) {
            bk = 1;
            best = k;
            this.hoverX = x;
            this.hoverZ = z;
          }
          continue;
        }
        this.moduleSurface.toZone(h.indexTip, this.o);
        const off = this.o.y - h.tipRadius;
        // which way the tip moved: into the panel, or along it (a hand on its way down to the instrument)
        const dIn = this.tipOff[i] - off;
        const dAlong = Math.hypot(this.o.x - this.tipX[i], this.o.z - this.tipZ[i]);
        this.tipX[i] = this.o.x;
        this.tipZ[i] = this.o.z;
        this.tipOff[i] = off;
        if (dAlong > 0.004 && dAlong > dIn * 1.5) this.tipArmed[i] = false;
        // the fingertip came from a centimetre or more in front and reached the face: a press, however slowly
        // (like a touch screen); it re-arms when the finger comes back out
        if (off > 0.012) this.tipArmed[i] = true;
        const fire = this.tipArmed[i] && off <= 0;
        if (off <= 0) this.tipArmed[i] = false;
        if (off < -0.02 || off > 0.05) continue;
        const k = this.panelItemAt(this.o.x, this.o.z);
        if (k < 0) continue;
        // (mid-song, a hand that just hit the instrument is playing, not pressing: a wild fill can't switch you)
        const playing = (this.game.mode === 'play' || this.game.mode === 'count') && !this.userPaused && this.clock.t - this.handHitT[i] < 0.35;
        if (fire && !playing) this.pressPanel(k);
        const near = 1 - Math.max(0, off) / 0.05;
        if (near > bk) {
          bk = near;
          best = k;
          this.hoverX = this.o.x;
          this.hoverZ = this.o.z;
        }
      }
    }
    // a quiet tick as the finger comes over a new control (a finger close to it, not one flickering at the edge of
    // hover range; not more than one every 150 ms; never while a song's playing under the panel)
    if (best !== this.lastHoverItem && (best < 0 || bk > 0.4)) {
      const mode = this.game.mode;
      if (best >= 0 && this.uiT - this.hoverTickT > 0.15 && mode !== 'play' && mode !== 'count') {
        sfx.hover();
        this.hoverTickT = this.uiT;
      }
      this.lastHoverItem = best;
    }
    this.kit.module.hover(best, bk, this.hoverX, this.hoverZ);
  }

  /** The panel's press zones: one per item on the page showing. */
  private zonesFor = -1;
  /** The item whose rectangle holds this panel point (strictly: off the panel is nothing), or −1. */
  private panelItemAt(x: number, z: number): number {
    // inside an item, or within 8 mm of one (the nearest): fingertips land a few millimetres off
    const zs = this.moduleSurface.zones;
    let best = -1;
    let bd = 0.008;
    for (let i = 0; i < zs.length; i++) {
      const q = zs[i];
      const dx = Math.max(0, Math.abs(x - q.x) - q.w / 2);
      const dz = Math.max(0, Math.abs(z - q.z) - q.h / 2);
      const d = Math.hypot(dx, dz);
      if (d === 0) return i;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }
  private pageT = -9;
  private panelZones(): void {
    const p = this.kit.module;
    this.zonesFor = p.version;
    this.pageT = this.uiT;
    this.moduleSurface.zones = (p.page?.items ?? []).map((it, i) => {
      const k = itemZone(it);
      return { i, shape: 'rect' as const, x: k.x, z: k.z, w: k.w, h: k.h, degree: -1, midi: 0 } satisfies Zone;
    });
  }

  /** A pinch (world point) on the panel presses what it's on. */
  private pinchStand(at: Vector3): void {
    if (this.placement.phase !== 'placed') return;
    this.moduleSurface.toZone(at, this.o);
    if (Math.abs(this.o.y) > 0.035) return;
    const k = this.panelItemAt(this.o.x, this.o.z);
    if (k >= 0) this.pressPanel(k);
  }

  private starMinor = false;
  private starRoot = 72;
  /** The word for a hit in a song, next to what was hit. */
  private hitWords: HitWords | null = null;
  private wordAt = new Vector3();
  private lastHoverItem = -1;
  private tipOff = [1, 1];
  private tipArmed = [false, false];
  private tipX = [0, 0];
  private tipZ = [0, 0];
  /** When each hand (left, right) last hit the desk or an instrument. */
  private handHitT = [-9, -9];
  private hoverX = 0;
  private hoverZ = 0;
  private panelPressT = -9;
  /** An item on the panel was pressed. */
  /**
   * The panel's handle: pinch the grab bar and the panel follows your pinch until you let go (it stays there, saved);
   * poke the close dot and it folds into its Menu pill; poke the pill and it comes back.
   */
  private dragging = [false, false];
  private dragOff = [new Vector3(), new Vector3()];
  private handleArmed = [true, true];
  private hGrab = new Vector3();
  private hClose = new Vector3();
  private hPill = new Vector3();
  private hRoot = new Vector3();
  private panelHandle(): void {
    if (this.placement.phase !== 'placed') return;
    const m = this.kit.module;
    m.grabAt(this.hGrab);
    m.closeAt(this.hClose);
    m.pillAt(this.hPill);
    let gk = 0;
    let ck = 0;
    let pk = 0;
    for (let i = 0; i < 2; i++) {
      const h = i === 0 ? hands.left : hands.right;
      if (!h.tracked) {
        this.dragging[i] = false;
        continue;
      }
      if (this.dragging[i]) {
        if (!h.pinch.pinching) {
          this.dragging[i] = false;
          const at = m.movedTo;
          if (at) {
            this.settings = { ...this.settings, panelAt: { x: at.x, y: at.y, z: at.z } };
            saveSettings(this.settings);
          }
          continue;
        }
        // (where the panel's middle goes, in the kit's frame: kept a little off the desk and in reach)
        this.hRoot.copy(h.pinchPoint).add(this.dragOff[i]);
        this.kit.root.worldToLocal(this.hRoot);
        this.hRoot.set(Math.max(-0.7, Math.min(0.7, this.hRoot.x)), Math.max(0.15, Math.min(0.7, this.hRoot.y)), Math.max(-0.7, Math.min(0.3, this.hRoot.z)));
        m.moveTo(this.hRoot);
        gk = 1;
        continue;
      }
      if (!m.hidden) {
        const dg = h.pinchPoint.distanceTo(this.hGrab);
        gk = Math.max(gk, 1 - Math.min(1, dg / 0.06));
        if (h.edge === 'start' && dg < 0.04) {
          this.dragging[i] = true;
          m.root.getWorldPosition(this.dragOff[i]).sub(h.pinchPoint);
          sfx.tick(0.6);
          continue;
        }
      }
      // a poke on the close dot (or, hidden, on the pill)
      const target = m.hidden ? this.hPill : this.hClose;
      const d = h.indexTip.distanceTo(target);
      if (m.hidden) pk = Math.max(pk, 1 - Math.min(1, d / 0.05));
      else ck = Math.max(ck, 1 - Math.min(1, d / 0.05));
      if (d > 0.03) this.handleArmed[i] = true;
      if (this.handleArmed[i] && d < (m.hidden ? 0.02 : 0.014)) {
        this.handleArmed[i] = false;
        m.setHidden(!m.hidden);
        sfx.tick();
      }
    }
    m.handleHover(gk, ck, pk);
  }

  private pressPanel(k: number): void {
    if (this.kit.module.hidden) return;
    const it = this.kit.module.itemAt(k);
    if (!it) return;
    // (a dimmed control answers too, quietly: it's there, it just can't be used yet)
    if (it.off) {
      if (!it.id.startsWith('label:') && this.uiT - this.panelPressT > 0.15) {
        this.panelPressT = this.uiT;
        sfx.denied();
      }
      return;
    }
    // one press per poke (the touch and the strike can both see it), and none just after the page changed (the
    // finger that pressed is still there, over something new)
    if ((k === this.panelPressK && this.uiT - this.panelPressT < 0.15) || this.uiT - this.panelPressT < 0.08 || this.uiT - this.pageT < 0.45) return;
    this.panelPressT = this.uiT;
    this.panelPressK = k;
    if ((this.settings.coach ?? 0) === 2) {
      this.coachTo(3);
      this.game.coachFocus = null;
    }
    this.kit.module.pressKey(k);
    // (a setting's switch sounds where it's flipped: setting())
    if (it.id === 'back' || it.id === 'nav:main') sfx.back();
    else if (!it.id.startsWith('set:') || it.id === 'set:slow' || it.id === 'set:panel') sfx.press();
    // (a page opening: two small bells after the tap)
    if (it.id.startsWith('nav:') || it.id === 'play' || it.id === 'learn') sfx.open();
    // a press that changes the page flashes on what you pressed for a moment first
    const moves = it.id.startsWith('nav:') || it.id === 'back' || it.id === 'play' || it.id === 'again' || it.id === 'next' || it.id === 'make' || it.id.startsWith('inst:') || it.id === 'key:play';
    if (moves) this.uiLater(0.09, () => this.panelAction(it.id));
    else this.panelAction(it.id);
  }
  private panelPressK = -1;

  /** What a panel item does: instruments and their settings and the band here; the rest is the game's. */
  private panelAction(id: string): void {
    const [kind, arg] = [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)];
    if (kind === 'inst') {
      const m = this.game.mode;
      if (m === 'play' || m === 'count') {
        if (!this.game.switchTo(arg)) {
          this.switchNoT = this.uiT;
          sfx.denied();
        }
        return;
      }
      if (m !== 'discover') return;
      if (!this.kitSurface.discovered) {
        this.hitAt.x = 0;
        this.hitAt.z = 0;
        this.discover(this.kitSurface);
      }
      // its miniature flies to the desk as the real one unfolds there
      this.kit.module.flyMini(arg);
      this.putOut(arg as InstId);
      this.game.shelfPicked(this.shelfView());
      // (picked from the songs page: back to the songs, with it)
      this.game.menu = this.game.instFrom === 'songs' ? 'songs' : 'free';
      this.game.refreshDisplay();
      return;
    }
    if (kind === 'scale' || kind === 'sound' || kind === 'oct' || kind === 'key' || kind === 'pieces' || kind === 'frets') {
      this.setShelf(kind, arg);
      this.game.refreshDisplay();
      return;
    }
    if (id === 'pause' || id === 'resume') {
      this.setUserPaused(id === 'pause');
      return;
    }
    if (id === 'pause:restart') {
      this.setUserPaused(false);
      this.game.restartSong();
      // (a restart counts itself in: not the resume's two clicks on top)
      this.resumePending = false;
      return;
    }
    if (id === 'pause:songs') {
      this.setUserPaused(false);
      this.game.stop();
      this.game.menu = 'songs';
      this.game.refreshDisplay();
      return;
    }
    if (id === 'set:panel') {
      // the panel back where it stands by itself
      this.kit.module.moveTo(null);
      const { panelAt: _drop, ...rest } = this.settings;
      void _drop;
      this.settings = rest;
      saveSettings(this.settings);
      return;
    }
    if (id === 'band:start') {
      void coop.host();
      return;
    }
    if (id === 'code:go') {
      // the code typed on the keypad: join that band, and back to the band page to see it connect
      const c = normaliseCode(this.game.typedCode);
      if (!c) return;
      void coop.join(c, 'guest');
      this.game.menu = 'band';
      this.game.refreshDisplay();
      return;
    }
    if (id === 'band:talk') {
      this.talk.toggle();
      this.game.refreshDisplay();
      return;
    }
    if (id === 'band:leave') {
      coop.leave();
      this.game.refreshDisplay();
      return;
    }
    this.game.act(id);
  }

  /** Change the instrument's scale, key, sound, octave or (the drums) pieces, saved, and let it be heard. */
  private setShelf(kind: 'scale' | 'sound' | 'oct' | 'key' | 'pieces' | 'frets', arg: string): void {
    const id = this.kit.inst;
    const c = { ...(this.settings.shelf[id] ?? this.shelfCfg(id)) };
    if (kind === 'scale') c.scale = arg;
    else if (kind === 'sound') c.sound = arg;
    else if (kind === 'key') c.key = Math.max(0, Math.min(11, Number(arg) || 0));
    else if (kind === 'pieces') c.pieces = arg === 'small' ? 'small' : 'full';
    else if (kind === 'frets') c.frets = arg === 'real' ? 'real' : 'easy';
    else c.oct = Math.max(-1, Math.min(1, (c.oct ?? 0) + (arg === '+1' ? 1 : -1)));
    this.settings = { ...this.settings, shelf: { ...this.settings.shelf, [id]: c } };
    saveSettings(this.settings);
    if (id === 'drums') {
      // a new kit (its look and its sound), or more or fewer pieces: rebuilt where it stands, and a fill to hear it
      this.applyKit();
      const t0 = audio.now();
      const fill: Lane[] = ['kick', 'snare', 'tom', 'floor', 'crash'];
      fill.filter((l) => this.lanes().includes(l)).forEach((l, i) => audio.drum(l, 0.7, 0, t0 + i * 0.14));
      return;
    }
    this.putOut(id);
    const t0 = audio.now();
    if (id === 'guitar') this.strum(0, 0.6, 0, t0);
    else for (let i = 0; i < 4; i++) this.playInst(id, id === 'handpan' ? i * 2 : i, 0.55, 0, t0 + i * 0.12);
  }

  private tmp3 = new Vector3();
  private tmp4 = new Vector3();

  /** The zones of a surface, the desk's bars, or a shelf instrument (as it would be laid out now). */
  private zonesOf(id: string): Zone[] {
    if (id === 'keys') return this.kit.keyZones;
    if (id === 'piano' || id === 'marimba' || id === 'guitar' || id === 'handpan' || id === 'congas') {
      if (this.kit.inst === id) return this.kit.instZones;
      const root = this.instRoot(id);
      const scale = scaleById(this.shelfCfg(id).scale);
      return instZones(id, root, scale);
    }
    return this.surfaces.find((s) => s.id === id)?.zones ?? [];
  }

  /** Put an instrument on the desk (saved for next time). */
  private putOut(id: InstId): void {
    this.instTuning = '';
    this.useInstrument(id);
    if (this.settings.inst !== id) {
      this.settings = { ...this.settings, inst: id };
      saveSettings(this.settings);
    }
  }
  private shelfStep(dir: 1 | -1 | 0): ShelfView {
    if (dir !== 0 && this.placement.phase === 'placed') {
      this.putOut(stepShelf(this.kit.inst, dir));
      sfx.tick();
    }
    return this.shelfView();
  }
  private shelfChange(which: 'scale' | 'sound'): ShelfView {
    const id = this.kit.inst;
    const d = instDef(id);
    const c = { ...this.shelfCfg(id) };
    if (which === 'scale') {
      const i = SCALES.findIndex((s) => s.id === c.scale);
      c.scale = SCALES[(i + 1) % SCALES.length].id;
    } else {
      const i = d.sounds.findIndex((s) => s.id === c.sound);
      c.sound = d.sounds[(i + 1) % d.sounds.length].id;
    }
    this.settings = { ...this.settings, shelf: { ...this.settings.shelf, [id]: c } };
    saveSettings(this.settings);
    this.putOut(id);
    // let it be heard: a little run up the new notes, or a strum
    const t0 = audio.now();
    if (id === 'guitar') this.strum(0, 0.6, 0, t0);
    else for (let i = 0; i < 4; i++) this.playInst(id, id === 'handpan' ? i * 2 : i, 0.55, 0, t0 + i * 0.12);
    return this.shelfView();
  }

  /** A note (or the guitar's chord `zone`) on a shelf instrument, at audio time `when` (0: now). */
  private playInst(id: InstId, zone: number, vel: number, pan: number, when: number): void {
    if (id === 'drums') return;
    const c = this.shelfCfg(id);
    const scale = scaleById(c.scale);
    const snd = instDef(id).sounds.find((x) => x.id === c.sound) ?? instDef(id).sounds[0];
    const root = this.instRoot(id);
    if (id === 'guitar') return this.strum(Math.max(0, Math.min(2, zone)), vel, pan, when);
    if (id === 'congas') {
      const v = percVoice(snd.id, zone);
      audio.modal(snd.family ?? 'congas', 0, vel, pan, when, v.size, 'congas', v.tone);
      if (v.slap) audio.drum('rim', vel * 0.3, pan, when, 1);
      return;
    }
    if (id === 'piano' && zone === PIANO_CHORD) {
      // the chord pad: the chord the song is on, else the next of the scale's three
      const h = this.game.harmony();
      const ch = h ? (h.chordMinor ? [0, 3, 7] : [0, 4, 7]) : scale.chords[this.pianoChord % scale.chords.length];
      const base = (h ? h.chord : root) - 12;
      // root, fifth, and the third an octave up (open, not muddy)
      const held = this.holdPt >= 0 && (snd.family ?? 'keys') === 'keys';
      for (const n of [0, 7, 12 + (ch[1] - ch[0])]) audio.modal(snd.family ?? 'keys', base + ch[0] + n, vel * 0.7, pan, when, 0.5, held ? HOLD_OWNER[this.holdPt] : `piano-chord`, n, held);
      return;
    }
    // (a black key in a song: a semitone over the white key left of it)
    if (id === 'piano' && zone >= PIANO_BLACK) {
      const bk = (this.kit.inst === 'piano' ? this.blacksNow : pianoBlacks(instZones('piano', root, scale)))[zone - PIANO_BLACK];
      const a = bk ? (this.kit.inst === 'piano' ? this.kit.instZones : instZones('piano', root, scale))[bk.a] : null;
      const held = this.holdPt >= 0 && (snd.family ?? 'keys') === 'keys';
      if (a) audio.modal(snd.family ?? 'keys', a.midi + 1 + (snd.oct ?? 0) * 12, vel, pan, when, 0.5, held ? HOLD_OWNER[this.holdPt] : 'piano', zone, held);
      return;
    }
    // (zone + PIANO_LOW on the piano: the same key two octaves down, for a bass line)
    const low = id === 'piano' && zone >= PIANO_LOW;
    const zi = low ? zone - PIANO_LOW : zone;
    const z = this.kit.inst === id ? this.kit.instZones[zi] : null;
    const midi = (z?.midi ?? scaleMidi(root, scale, zi)) - (low ? 24 : 0) + (low ? 0 : (snd.oct ?? 0) * 12);
    const fam = low ? 'keys' : (snd.family ?? 'keys');
    const held = id === 'piano' && this.holdPt >= 0 && fam === 'keys';
    audio.modal(fam, midi, vel, pan, when, 0.5, held ? HOLD_OWNER[this.holdPt] : `${id}${low ? 'lo' : ''}`, zi, held);
  }

  /** The guitar: six strings low to high, a hair apart (a slow hand spreads them more), from chord `c`. */
  private strum(c: number, vel: number, pan: number, when: number): void {
    const cfg = this.shelfCfg('guitar');
    const scale = scaleById(cfg.scale);
    const snd = instDef('guitar').sounds.find((x) => x.id === cfg.sound) ?? instDef('guitar').sounds[0];
    // (the chord and the up-strum read at the note's own time, not when it was scheduled)
    const at = this.clock.t + (when ? Math.max(0, when - audio.now()) : 0);
    const h = this.game.harmony(at);
    const notes = h && this.clock.t - this.chordPickedT > 2 ? strumNotes(h.chord, h.chordMinor ? [0, 3, 7] : [0, 4, 7]) : strumNotes(this.instRoot('guitar'), scale.chords[c % scale.chords.length]);
    const t0 = when || audio.now();
    const gap = 0.006 + 0.012 * (1 - Math.min(1, vel));
    // in a track, a strum on an 'and' is an up-strum: the top four strings, high to low, lighter
    const b = h ? this.game.clock.beatAt(at) : 0;
    const up = !!h && Math.abs(b - Math.floor(b) - 0.5) < 0.2;
    const play = up ? notes.slice(-4).reverse() : notes;
    for (let k = 0; k < play.length; k++) {
      const v = vel * (up ? 0.7 : 1) * (0.85 - k * 0.04);
      // (each string its own voice: a new strum damps the last, like a hand on a real guitar)
      if (snd.string) audio.pluck(play[k], v, pan, t0 + k * gap, snd.string, `string${up ? 5 - k : k}`);
      else audio.modal(snd.family ?? 'harp', play[k], v, pan, t0 + k * gap, 0.5, `guitar${k}`, k);
    }
  }

  /** A hit on the instrument on the desk (not the drums). */
  private hitInstrument(side: Side, gain: number, st: Strike, t: number): void {
    const id = this.kit.inst;
    const o = this.kit.instOverlay();
    const x = this.hitAt.x;
    const z = this.hitAt.z;
    const pan = Math.max(-0.8, Math.min(0.8, x / 0.4));
    // (the piano's keys are up in its case: fingertips press them there, src/input/air-hits.ts; the desk under it
    // plays nothing)
    if (id === 'piano' || id === 'congas' || id === 'handpan' || id === 'marimba') return;
    // the nearest zone the hand is on (with a little give round each)
    let best = -1;
    let bd = Infinity;
    const zones = this.kit.instZones;
    for (let i = 0; i < zones.length; i++) {
      const q = zones[i];
      if (q.degree < 0 && id === 'guitar') continue;
      const inside = q.shape === 'disc' ? Math.hypot(x - q.x, z - q.z) <= q.w + 0.012 : Math.abs(x - q.x) <= q.w / 2 + 0.008 && Math.abs(z - q.z) <= q.h / 2 + 0.012;
      if (!inside) continue;
      const d = Math.hypot(x - q.x, z - q.z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    // (the guitar lies on its back, its strings up off the desk: strummed and fretted in the air)
    if (id === 'guitar') return;
    if (best >= 0) {
      this.playZone(id, best, side, gain, pan, t, st);
      return;
    }
    // off the instrument: the desk still knocks, softly
    audio.drum('rim', gain * 0.5, pan, 0, 1);
    this.record(this.kitSurface, 0, gain, st, null, 'rim');
  }

  /** A note of the instrument that's out sounds, moves and lights, and the song hears it (from the desk or the air). */
  private playZone(id: InstId, best: number, side: Side, gain: number, pan: number, t: number, st: Strike): void {
    const o = this.kit.instOverlay();
    if (this.flam(id, best, side, t)) return;
    this.freeFx(`${id}:${best}`, gain);
    // the chord pad: the next chord only after a pause (pumping it on the beat stays on one chord)
    if (id === 'piano' && best === PIANO_CHORD && this.clock.t - this.chordPadT > 1.2 && this.chordPadT > 0) this.pianoChord++;
    if (id === 'piano' && best === PIANO_CHORD) this.chordPadT = this.clock.t;
    const g = this.hitGame(`${id}:${best}`, t, gain);
    // (the bass part being built on the piano is heard where it will play: two octaves down)
    this.playInst(id, best + (id === 'piano' && best !== PIANO_CHORD ? this.game.pianoLow() : 0), this.scoredGain(g, gain), pan, 0);
    this.dimmer.hit(instDef(id).color, gain);
    o?.hit(best, gain);
    this.kit.instStruck(best, gain);
    // the piano's screen: its sound and the note you just played
    if (id === 'piano') {
      const q = this.kit.instZones[best % PIANO_LOW];
      const snd = instDef('piano').sounds.find((x) => x.id === this.shelfCfg('piano').sound)?.name ?? '';
      if (q && q.midi > 0) this.kit.pianoScreen(`${snd}  ${NOTE_NAMES[q.midi % 12]}${Math.floor(q.midi / 12) - 1}`);
    }
    if (g === 'perfect') o?.perfect(best);
    this.wordFor(g, best, id);
    this.record(this.kitSurface, best, gain, st, g, id);
  }
  /**
   * How loud a judged hit sounds: in a song, a hit on time sounds full whatever the stroke (a soft tap right on the beat
   * isn't a weak one), and a Perfect a little fuller and brighter (the louder recordings are brighter). Else as struck.
   */
  private scoredGain(g: string | null, gain: number): number {
    if (g !== 'perfect' && g !== 'good') return gain;
    const v = 0.6 + 0.4 * gain;
    return g === 'perfect' ? Math.min(1, v * 1.15) : v;
  }
  /** The hit word over zone `best` of the instrument out (at its playing height). */
  private wordFor(g: string | null, best: number, id: InstId): void {
    if (g !== 'perfect' && g !== 'good' && g !== 'early' && g !== 'late') return;
    if (id === 'guitar') {
      this.hitWords?.show(g, this.heldWorld(best < 3 ? zoneX(best) : HG.strikeX, HG.strings + 0.012, 0, this.wordAt), this.head, instDef('guitar').color);
      return;
    }
    const q = this.kit.instZones[best % PIANO_LOW];
    if (!q) return;
    const y = id === 'piano' ? KEYBOARD.top : id === 'marimba' ? MARIMBA.top : id === 'congas' ? CONGA.top : id === 'handpan' ? HANDPAN.rim + HANDPAN.dome : 0.03;
    this.wordAt.set(q.x, y, -q.z);
    this.hitWords?.show(g, this.kit.root.localToWorld(this.wordAt), this.head, instDef(id).color);
  }

  // ---- the guitar you hold (src/kit/held-guitar.ts) ----
  private gh = new GuitarHands();
  private heldM = heldMatrix(new Matrix4());
  private heldInv = new Matrix4().copy(this.heldM).invert();
  /** The guitar in your lap (facing away, as it's really held), or facing you over the desk (the setting). */
  private guitarLap = false;
  private lapCues: GuitarCues | null = null;
  /** Put the lap guitar's soundhole at (x, y, z) in the kit's frame, held as it is. */
  private moveGuitarTo(x: number, y: number, z: number): void {
    this.tmp.set(HG.hole, 0, 0).applyMatrix4(this.tmpM2.copy(this.heldM).setPosition(0, 0, 0));
    this.heldM.setPosition(x - this.tmp.x, y - this.tmp.y, z - this.tmp.z);
  }
  /**
   * Moving the guitar in your lap: pinch its headstock (out past the nut, where no chord place is) and carry it; let
   * go and it stays, and comes out there next time. Not in a song (like the desk's handle).
   */
  private guitarHand = -1;
  private guitarOff = new Vector3();
  private guitarPinchWas = [false, false];
  private fxN2 = new Vector3();
  private segV = new Vector3();
  /** How far point p is from the segment a-b. */
  private segDistTo(p: Vector3, a: Vector3, b: Vector3): number {
    this.segV.subVectors(b, a);
    const L = this.segV.lengthSq();
    const k = L > 0 ? Math.max(0, Math.min(1, this.tmp3.subVectors(p, a).dot(this.segV) / L)) : 0;
    return this.tmp3.copy(a).addScaledVector(this.segV, k).distanceTo(p);
  }
  private guitarGrabTick(): void {
    const on = this.guitarLap && this.kit.inst === 'guitar' && this.placement.phase === 'placed' && this.game.mode !== 'play' && this.game.mode !== 'count';
    if (!on) {
      this.guitarHand = -1;
      return;
    }
    const inv = this.tmpM2.copy(this.kit.root.matrixWorld).invert();
    for (let i = 0; i < 2; i++) {
      const h = i === 0 ? hands.left : hands.right;
      if (!h.tracked || h.controller) {
        if (this.guitarHand === i) this.guitarHand = -1;
        continue;
      }
      // the pinch, and the guitar's soundhole, in the kit's frame
      this.tmp.copy(h.pinchPoint).applyMatrix4(inv);
      if (this.guitarHand === i) {
        if (!h.pinch.pinching) {
          this.guitarHand = -1;
          this.heldWorld(HG.hole, 0, 0, this.fxN).applyMatrix4(inv);
          this.settings = { ...this.settings, guitarAt: { x: this.fxN.x, y: this.fxN.y, z: this.fxN.z } };
          saveSettings(this.settings);
          sfx.set();
          continue;
        }
        this.moveGuitarTo(this.tmp.x + this.guitarOff.x, this.tmp.y + this.guitarOff.y, this.tmp.z + this.guitarOff.z);
        this.heldInv.copy(this.heldM).invert();
        (this.kit.models.get('guitar') as HeldGuitarModel | undefined)?.pose(this.heldM);
        continue;
      }
      const started = h.pinch.pinching && !this.guitarPinchWas[i];
      this.guitarPinchWas[i] = h.pinch.pinching;
      if (this.guitarHand >= 0 || !started) continue;
      // (anywhere along its headstock, tipped back 13 degrees from the nut, or the neck's first few centimetres: within
      // 5 cm of that line)
      this.heldWorld(HG.nut + 0.04, HG.board, 0, this.fxN);
      this.heldWorld(HG.nut - 0.18 * Math.cos(0.23), HG.board - 0.18 * Math.sin(0.23), 0, this.fxN2);
      if (this.segDistTo(h.pinchPoint, this.fxN, this.fxN2) > 0.05) continue;
      this.guitarHand = i;
      this.heldWorld(HG.hole, 0, 0, this.fxN).applyMatrix4(inv);
      this.guitarOff.subVectors(this.fxN, this.tmp);
      sfx.tick();
    }
  }
  private readonly placeHeld = (x: number, y: number, z: number, out: Vector3): Vector3 => this.heldWorld(x, y, z, out);
  /**
   * Hold the guitar as the setting says: in your lap, placed from where your eyes are now (seen from the kit), or
   * over the desk. Its model, its hands (the lap's reach is wider: you play it by feel, over its edge) and the desk's
   * shadow follow.
   */
  private poseGuitar(): void {
    this.guitarLap = !this.settings.guitarDesk;
    if (this.guitarLap) {
      this.tmp.copy(this.head).applyMatrix4(this.tmpM2.copy(this.kit.root.matrixWorld).invert());
      lapMatrix(this.heldM, this.tmp, this.handed() === 'left');
      // (where you moved it to, if you have: its soundhole there, held the same way)
      const at = this.settings.guitarAt;
      if (at) this.moveGuitarTo(at.x, at.y, at.z);
    } else heldMatrix(this.heldM);
    this.heldInv.copy(this.heldM).invert();
    this.gh.reach = this.guitarLap ? { strum: 0.03, side: 0.02, over: 0.025 } : { strum: 0.014, side: 0.01, over: 0.012 };
    this.gh.forget();
    const model = this.kit.models.get('guitar') as HeldGuitarModel | undefined;
    if (model) {
      model.pose(this.heldM);
      model.lap = this.guitarLap;
    }
    this.kit.guitarLap = this.guitarLap;
  }
  private gInv = new Matrix4();
  /** Each hand's fingertips in the guitar's frame: index, middle, ring, thumb, little. */
  private gTips = Array.from({ length: 10 }, () => new Vector3());
  private gStrumRefs: (Vector3 | null)[] = [null, null, null, null];
  private gFretRefs: (Vector3 | null)[] = new Array<Vector3 | null>(8).fill(null);
  private plucks: Pluck[] = [];
  /** A run of strings one hand crossed the same way: three or more close together is a strum. */
  private gStrum = [0, 1].map(() => ({ t: -1, last: -9, n: 0, dir: 0, fired: false, vel: 0 }));
  /** Strums you've played (the free-play arrows fade after a few). */
  private guideStrums = 0;
  private gNamesT = 0;
  private gNames = ['', '', ''];
  private gSongNames = ['', '', ''];

  /** A point in the held guitar's frame, in the world. */
  private heldWorld(x: number, y: number, z: number, out: Vector3): Vector3 {
    return this.kit.root.localToWorld(out.set(x, y, z).applyMatrix4(this.heldM));
  }

  /** Both hands on the guitar this frame: strings crossed sound, the neck picks the chord, the model shows it all. */
  private guitarTick(dt: number, inv: Matrix4): void {
    const model = this.kit.models.get('guitar') as HeldGuitarModel | undefined;
    this.gInv.multiplyMatrices(this.heldInv, inv);
    const t = this.clock.t;
    this.plucks.length = 0;
    // (the hand that strums: the right, or the left for a left-handed player)
    const strummer = this.handed() === 'left' ? 0 : 1;
    for (let i = 0; i < 2; i++) {
      const side = i as 0 | 1;
      const h = i === 0 ? hands.left : hands.right;
      // (a hand at the panel is pressing a button, not playing)
      this.airP.copy(h.indexTip).applyMatrix4(this.moduleSurface.inv);
      const atPanel = !this.kit.module.hidden && Math.abs(this.airP.y) < 0.06 && Math.abs(this.airP.x) < PANEL.w / 2 + 0.03 && Math.abs(this.airP.z) < PANEL.h / 2 + 0.015;
      // a pinch with the strumming hand holds a pick (not at the panel, nor moving the guitar by its head)
      const pick = h.tracked && !h.controller && !atPanel && h.pinch.pinching && i === strummer && this.guitarHand !== i;
      // (from fingers to the pick or back: no strum read across the jump between them)
      if (pick !== this.pickOn[i]) this.gh.forget(side);
      this.pickOn[i] = pick;
      if (!h.tracked || atPanel || (h.pinch.pinching && !pick)) {
        this.gh.forget(side);
        for (let k = 0; k < 4; k++) this.gFretRefs[i * 4 + k] = null;
        this.tapForget(i);
        continue;
      }
      const base = i * 5;
      this.gOk[i] = true;
      if (pick) {
        // the pick's tip is the one point that strums
        this.pickAt(i, h);
        this.gTips[base].copy(this.pickTip[i]).applyMatrix4(this.gInv);
        this.gStrumRefs[0] = this.gTips[base];
        this.gStrumRefs[1] = this.gStrumRefs[2] = this.gStrumRefs[3] = null;
        this.gh.strum(side, this.gStrumRefs, t, dt, this.plucks);
        for (let k = 0; k < 4; k++) this.gFretRefs[i * 4 + k] = null;
        this.tapForget(i);
        this.gOk[i] = false;
        continue;
      }
      this.gTips[base].copy(h.indexTip).applyMatrix4(this.gInv);
      this.gTips[base + 1].copy(h.middleTip).applyMatrix4(this.gInv);
      this.gTips[base + 2].copy(h.ringTip).applyMatrix4(this.gInv);
      this.gTips[base + 3].copy(h.thumbTip).applyMatrix4(this.gInv);
      this.gTips[base + 4].copy(h.pinkyTip).applyMatrix4(this.gInv);
      this.bodyTaps(i, h, dt);
      // (a controller: its tip is the one point)
      const one = !!h.controller;
      for (let k = 0; k < 4; k++) this.gStrumRefs[k] = one && k > 0 ? null : this.gTips[base + k];
      this.gh.strum(side, this.gStrumRefs, t, dt, this.plucks);
      this.gFretRefs[i * 4] = this.gTips[base];
      this.gFretRefs[i * 4 + 1] = one ? null : this.gTips[base + 1];
      this.gFretRefs[i * 4 + 2] = one ? null : this.gTips[base + 2];
      this.gFretRefs[i * 4 + 3] = one ? null : this.gTips[base + 4];
    }
    const z = this.gh.fret(this.gFretRefs, t);
    if (z >= 0) this.guitarFret(z);
    for (const p of this.plucks) this.guitarPluck(p, Math.max(0, Math.min(dt, p.t - (t - dt))));
    if (model) this.bowStrings(model);
    this.gOk[0] = this.gOk[1] = false;
    this.showPicks();
    if (!model) return;
    model.zone = this.gh.zone;
    model.onNeck = this.gh.onNeck;
    model.setFingers(this.gh.pressed);
    model.guideK += ((this.guideStrums >= 6 ? 0 : 1) - model.guideK) * Math.min(1, dt * 2);
    this.guitarCues(model, dt);
  }

  /**
   * Strings that give under a fingertip (only what's drawn: plucks and frets read the fingertips as they are). On the
   * neck, a fingertip below a string's height presses it down toward the fret; where you strum, a fingertip coming at
   * a string within 4 mm bows it away until it slips over (the pluck, and the string shakes), and one moving off it
   * doesn't drag it back. One fingertip per string, the one pressing it most; a hand not tracked this frame (or at the
   * panel) bows nothing from where it was.
   */
  private gOk = [false, false];
  private bowSide = new Int8Array(6);
  private bowStrings(model: HeldGuitarModel): void {
    const span = SADDLE_X - HG.nut;
    for (let si = 0; si < 6; si++) {
      let near = 9;
      let px = 0;
      let py = 0;
      let pz = 0;
      let side = 0;
      for (let i = 0; i < 2; i++) {
        if (!this.gOk[i]) continue;
        for (let k = 0; k < 5; k++) {
          const P = this.gTips[i * 5 + k];
          if (P.x < HG.nut + 0.05 || P.x > SADDLE_X - 0.02) continue;
          const f = (P.x - HG.nut) / span;
          const sy = HG.board + 0.0045 + (0.0125 - HG.board - 0.0045) * f;
          const dz = P.z - stringZ(si, P.x);
          const dy = P.y - sy;
          if (Math.abs(dz) > 0.004 || dy > 0.006 || dy < -0.012) continue;
          if (Math.abs(dz) >= near) continue;
          near = Math.abs(dz);
          px = P.x;
          side = dz >= 0 ? 1 : -1;
          // (fretting, on the neck: pressed down; strumming: pushed across)
          const neck = P.x < HG.strikeX - 0.12;
          py = dy < 0.0015 ? dy - 0.0015 : 0;
          pz = neck ? 0 : -side * (0.004 - Math.abs(dz));
        }
      }
      // (across only from the side the fingertip came from, decided while it was still clear of the string: once it's
      // past, the string lets go; a fingertip that turns up on top of a string from nowhere bows nothing)
      if (near >= 9) this.bowSide[si] = 0;
      else if (near > 0.0035) this.bowSide[si] = side;
      if (pz !== 0 && side !== this.bowSide[si]) pz = 0;
      if (near < 9 && (py !== 0 || pz !== 0)) model.press(si, px, py, pz);
    }
  }
  /**
   * A pick: pinch with the strumming hand while the guitar is out and one is between your thumb and index finger, its
   * tip a centimetre and a half out past the pinch, toward your fingers; that tip strums (one clean point, as a pick
   * is). Drawn as a small tortoiseshell pick, flat between thumb and finger. Gone when you open your hand.
   */
  private pickOn = [false, false];
  private pickTip = [new Vector3(), new Vector3()];
  private pickMesh: Mesh[] = [];
  private pickD = new Vector3();
  private pickN = new Vector3();
  private pickY = new Vector3();
  private pickM = new Matrix4();
  private pickAt(i: number, h: typeof hands.left): void {
    // toward the fingers from the middle knuckle; flat across the hand (its faces to the thumb and the finger)
    this.pickD.subVectors(h.pinchPoint, h.knuckleMiddle);
    this.pickN.subVectors(h.knuckleIndex, h.knucklePinky);
    if (this.pickD.lengthSq() < 1e-8 || this.pickN.lengthSq() < 1e-8) {
      this.pickTip[i].copy(h.pinchPoint);
      return;
    }
    this.pickN.normalize();
    this.pickD.addScaledVector(this.pickN, -this.pickD.dot(this.pickN)).normalize();
    this.pickTip[i].copy(h.pinchPoint).addScaledVector(this.pickD, 0.014);
    const m = this.pickMeshFor(i);
    this.pickY.crossVectors(this.pickN, this.pickD);
    this.pickM.makeBasis(this.pickD, this.pickY, this.pickN);
    m.quaternion.setFromRotationMatrix(this.pickM);
    m.position.copy(h.pinchPoint);
  }
  private pickMeshFor(i: number): Mesh {
    if (!this.pickMesh[i]) {
      // a teardrop, its point along +x, 2.8 cm long
      const sh = new Shape();
      sh.moveTo(0.014, 0);
      sh.quadraticCurveTo(0.004, 0.013, -0.009, 0.0095);
      sh.quadraticCurveTo(-0.0145, 0, -0.009, -0.0095);
      sh.quadraticCurveTo(0.004, -0.013, 0.014, 0);
      const m = new Mesh(new ShapeGeometry(sh, 12), new MeshStandardMaterial({ color: 0xc8643a, map: tortoiseShell(), roughness: 0.35, side: DoubleSide }));
      m.name = 'Pick';
      m.visible = false;
      m.renderOrder = 8;
      this.worldRoot.add(m);
      this.pickMesh[i] = m;
    }
    return this.pickMesh[i];
  }
  /** No pick in either hand (the guitar put away, paused, or not on the desk). */
  private dropPicks(): void {
    this.pickOn[0] = this.pickOn[1] = false;
    for (const m of this.pickMesh) if (m) m.visible = false;
  }
  private showPicks(): void {
    for (let i = 0; i < 2; i++) {
      const on = this.pickOn[i] && this.kit.inst === 'guitar';
      if (on || this.pickMesh[i]) this.pickMeshFor(i).visible = on;
      if (!on) this.pickOn[i] = false;
    }
  }

  /**
   * The guitar's body knocked: a fingertip or the heel of the hand striking its top away from the strings (at 0.5 m/s
   * or more, mostly into the wood) sounds a knock through the box, deep by the soundhole and sharper out toward its
   * edges, louder for a harder knock: a percussive player's beat. Once a touch: it comes 1.5 cm off before it knocks
   * again. A strum brushing across the strings isn't a knock.
   */
  private tapPrev = Array.from({ length: 12 }, () => new Vector3());
  private tapOk = new Uint8Array(12);
  private tapArmed = new Uint8Array(12).fill(1);
  private tapP = new Vector3();
  private tapT = [-9, -9];
  private tapForget(i: number): void {
    for (let k = 0; k < 6; k++) this.tapOk[i * 6 + k] = 0;
  }
  private bodyTaps(i: number, h: typeof hands.left, dt: number): void {
    for (let k = 0; k < 6; k++) {
      const j = i * 6 + k;
      const P = k < 5 ? this.gTips[i * 5 + k] : this.tapP.copy(h.palm).applyMatrix4(this.gInv);
      const q = this.tapPrev[j];
      const was = this.tapOk[j] === 1;
      const py = q.y;
      const moved = was ? P.distanceTo(q) : 0;
      q.copy(P);
      this.tapOk[j] = 1;
      if (P.y > 0.015) this.tapArmed[j] = 1;
      if (!was || !this.tapArmed[j] || dt <= 0 || !(py > 0 && P.y <= 0)) continue;
      const v = (py - P.y) / dt;
      // (a tracking jump through the wood isn't a knock; two fingers landing together are one)
      if (v < 0.5 || py - P.y < 0.6 * moved || moved > 0.08 || this.clock.t - this.tapT[i] < 0.06) continue;
      // on the top, inside its outline, off the strings (and not on the neck)
      const hw = bodyHalfW(P.x);
      if (P.x < HG.join + 0.01 || hw < 0.02 || Math.abs(P.z) > hw - 0.005) continue;
      if (P.x < SADDLE_X + 0.015 && Math.abs(P.z) < Math.abs(stringZ(5, P.x)) + 0.012) continue;
      this.tapArmed[j] = 0;
      this.tapT[i] = this.clock.t;
      const deep = Math.hypot(P.x - HG.hole, P.z) < 0.09;
      audio.modal('cajon', 0, Math.min(1, 0.25 + v * 0.35), 0.25, 0, 0.5, 'gbody', deep ? 0 : 1);
      this.dimmer.hit(instDef('guitar').color, Math.min(1, v * 0.4));
      this.debug.taps = (this.debug.taps ?? 0) + 1;
    }
  }

  /** A string sounds: the chord's note on it (or, with real frets, the note your finger stops), and it shakes. */
  private guitarPluck(p: Pluck, offset: number): void {
    const midi = this.guitarString(p.string);
    (this.kit.models.get('guitar') as HeldGuitarModel | undefined)?.pluck(p.string, p.vel);
    // (free play: each string is a note of its own, recorded as it sounded; in a song the strum is what counts)
    if (midi !== null && !this.game.harmony()?.song) this.hitGame(`pluck:${p.string}:${midi}`, p.t, p.vel);
    if (midi !== null) {
      const snd = instDef('guitar').sounds.find((x) => x.id === this.shelfCfg('guitar').sound) ?? instDef('guitar').sounds[0];
      const v = 0.3 + 0.62 * p.vel;
      const when = audio.now() + offset;
      // (the guitar is at your right: a little right in the mix, each string its own voice that a new pluck damps)
      if (snd.string) audio.pluck(midi, v, 0.25, when, snd.string, `string${p.string}`);
      else audio.modal(snd.family ?? 'harp', midi, v, 0.25, when, 0.5, `guitar${p.string}`, p.string);
    }
    // two or more strings crossed the same way within 90 ms of each other: a strum (scored, recorded; a shallow brush
    // over two strings counts, as it does on a real guitar)
    const g = this.gStrum[p.side];
    if (p.t - g.last > 0.09 || p.dir !== g.dir) {
      g.t = p.t;
      g.n = 0;
      g.dir = p.dir;
      g.fired = false;
      g.vel = 0;
    }
    g.last = p.t;
    g.n++;
    g.vel = Math.max(g.vel, p.vel);
    if (g.n >= 2 && !g.fired) {
      g.fired = true;
      this.guitarStrummed(g.vel, g.t);
    }
  }

  /** What string i sounds now (MIDI; null: left silent). */
  private guitarString(i: number): number | null {
    const cfg = this.shelfCfg('guitar');
    if (cfg.frets === 'real') return this.gh.realNotes(this.gNotes)[i];
    const h = this.game.harmony();
    const scale = scaleById(cfg.scale);
    const c = Math.max(0, this.guitarChord) % scale.chords.length;
    const v = h && this.clock.t - this.chordPickedT > 2 ? strumNotes(h.chord, h.chordMinor ? [0, 3, 7] : [0, 4, 7]) : strumNotes(this.instRoot('guitar'), scale.chords[c]);
    const n = stringsOf(v)[i];
    return n === null ? null : n + (h?.song ? 0 : (cfg.oct ?? 0) * 12);
  }
  private gNotes = [0, 0, 0, 0, 0, 0];

  // ---- the spotlight's gesture: both hands up, at your eyes or higher, for a quarter second ----
  private spotSaid = false;
  private handsUpT = 0;
  private spotBeat = -1;
  private spotGesture(dt: number): void {
    const sp = this.game.display.spot;
    // while it's on, the room pulses gold on every beat
    if (sp?.active) {
      const b = Math.floor(this.game.beatNow);
      if (b !== this.spotBeat) {
        this.spotBeat = b;
        this.dimmer.hit(0xffd36a, 0.45);
      }
    }
    if (!sp?.ready || this.userPaused) {
      this.handsUpT = 0;
      this.game.spotRaise = false;
      return;
    }
    const up = (h: typeof hands.left) => h.tracked && h.wrist.y > this.head.y - 0.12;
    // (both hands on their way up to fire it: the notes they leave aren't held against your run)
    const rising = (h: typeof hands.left) => h.tracked && h.wrist.y > this.head.y - 0.22;
    this.game.spotRaise = rising(hands.left) && rising(hands.right);
    this.handsUpT = up(hands.left) && up(hands.right) ? this.handsUpT + dt : 0;
    if (this.handsUpT >= 0.25) {
      this.handsUpT = 0;
      this.game.fireSpotlight();
    }
  }

  /** A strum: scored in a song, recorded in free play, the strum line flashes. */
  private guitarStrummed(vel: number, t: number): void {
    this.guideStrums++;
    this.dimmer.hit(instDef('guitar').color, vel);
    this.kit.instStruck(9, vel);
    // (in free play the strings were each heard already: the strum itself isn't a note of its own)
    const gs = this.game.harmony()?.song ? this.hitGame('guitar:9', t, vel) : null;
    this.wordFor(gs, 9, 'guitar');
    this.airStrike.t = t;
    this.airStrike.speed = vel * 1.4;
    this.airStrike.gain = vel;
    this.record(this.kitSurface, 9, vel, this.airStrike, gs, 'strum');
    this.debug.hits++;
  }

  /** The hand on the neck moved to chord place z: that chord is what the strings play now. */
  private guitarFret(z: number): void {
    this.guitarChord = z;
    this.gh.zone = z;
    if (!this.game.harmony()?.song) this.chordPickedT = this.clock.t;
    this.kit.instStruck(z, 0.6);
    const gc = this.hitGame(`guitar:${z}`, this.clock.t, 0.6);
    this.wordFor(gc, z, 'guitar');
    this.airStrike.t = this.clock.t;
    this.airStrike.speed = 0.5;
    this.airStrike.gain = 0.6;
    this.record(this.kitSurface, z, 0.6, this.airStrike, gc, 'chord');
  }

  /** The autoplayer's strum: all six strings, down on the beat and up off it, a hair apart. */
  private autoStrum(): void {
    const b = this.game.beatNow;
    const fr = b - Math.floor(b);
    const dir: 1 | -1 = fr > 0.3 && fr < 0.85 ? -1 : 1;
    for (let k = 0; k < 6; k++) this.guitarPluck({ string: dir > 0 ? k : 5 - k, vel: 0.8, dir, t: this.clock.t + k * 0.008, side: 1 }, k * 0.008);
  }

  /** The guitar's names and a song's asks: the chord coming to each place, the strums riding in. */
  private guitarCues(model: HeldGuitarModel, dt: number): void {
    const h = this.game.harmony();
    const song = !!h?.song;
    model.song = song;
    // a chord place held as its ring closes counts, judged on its beat: put your hand there as soon as you see it
    // coming and hold it (only changing on the beat counted, so getting there early was a miss)
    if (song && this.gh.onNeck && this.gh.zone >= 0 && this.gh.zone < 3) {
      const key = GUITAR_ZONE_KEYS[this.gh.zone];
      const spb = this.game.clock.spb;
      for (let k = 0; k < this.game.moteCount; k++) {
        const m = this.game.motes[k];
        if (m.grade !== null || m.key !== key || m.ahead > 0.04 || m.ahead < -0.25) continue;
        const gc = this.hitGame(key, this.clock.t + m.ahead * spb, 0.6);
        this.wordFor(gc, this.gh.zone, 'guitar');
        this.kit.instStruck(this.gh.zone, 0.5);
      }
    }
    model.zoneAhead.fill(Number.NaN);
    model.strumAhead.fill(Number.NaN);
    if (song) {
      let a = 0;
      const beatNow = this.game.beatNow;
      for (let k = 0; k < this.game.moteCount; k++) {
        const m = this.game.motes[k];
        if (m.key.length !== 8 || !m.key.startsWith('guitar:')) continue;
        const c = m.key.charCodeAt(7) - 48;
        if (c === 9) {
          if (a >= model.strumAhead.length || m.ahead > 3.2 || m.ahead < -0.3) continue;
          const fr = beatNow + m.ahead - Math.floor(beatNow + m.ahead);
          model.strumAhead[a] = m.ahead;
          model.strumDir[a] = fr > 0.3 && fr < 0.85 ? -1 : 1;
          model.strumHit[a] = m.grade === 'perfect' || m.grade === 'good';
          a++;
        } else if (c >= 0 && c < 3 && m.grade === null && m.ahead > -0.4 && !(model.zoneAhead[c] <= m.ahead)) model.zoneAhead[c] = m.ahead;
      }
    }
    // (the names, four times a second: the key's three chords, or the song's chord coming to each place)
    this.gNamesT -= dt;
    if (this.gNamesT > 0) return;
    this.gNamesT = 0.25;
    const cfg = this.shelfCfg('guitar');
    if (song) {
      const spb = this.game.clock.spb;
      for (let c = 0; c < 3; c++) {
        const ah = model.zoneAhead[c];
        if (!Number.isFinite(ah)) continue;
        const hc = this.game.harmony(this.clock.t + Math.max(0, ah) * spb + 0.01);
        if (hc) this.gSongNames[c] = `${NOTE_NAMES[((hc.chord % 12) + 12) % 12]}${hc.chordMinor ? 'm' : ''}`;
      }
      model.setNames(this.gSongNames);
      this.lapCues?.setNames(this.gSongNames);
      return;
    }
    if (cfg.frets === 'real') {
      this.gNames[0] = this.gNames[1] = this.gNames[2] = '';
    } else {
      const scale = scaleById(cfg.scale);
      const root = this.instRoot('guitar');
      for (let c = 0; c < 3; c++) {
        const ch = scale.chords[c % scale.chords.length];
        const sev = ch.length > 3 ? (ch[3] - ch[0] === 10 ? '7' : 'maj7') : '';
        this.gNames[c] = `${NOTE_NAMES[(((root + ch[0]) % 12) + 12) % 12]}${ch[1] - ch[0] === 3 ? 'm' : ''}${sev}`;
      }
    }
    model.setNames(this.gNames);
    this.lapCues?.setNames(this.gNames);
  }

  /** A chord position on the guitar's neck: that chord, and a soft strum of it so the hand that picks is heard. */
  private playChordPad(best: number, side: Side, gain: number, pan: number, t: number, st: Strike): void {
    const o = this.kit.instOverlay();
    this.freeFx(`guitar:${best}`, gain);
    this.guitarChord = best;
    if (!this.game.harmony()?.song) this.chordPickedT = this.clock.t;
    if (this.flam('guitar', best, side, t)) return;
    this.strum(best, gain * 0.45, pan, 0);
    o?.hit(best, gain);
    this.kit.instStruck(best, gain);
    const gc = this.hitGame(`guitar:${best}`, t, gain);
    this.wordFor(gc, best, 'guitar');
    this.record(this.kitSurface, best, gain, st, gc, 'chord');
  }
  /** A strum through the strings: the chord picked (or the song's). */
  private playStrum(side: Side, gain: number, pan: number, t: number, st: Strike): void {
    const o = this.kit.instOverlay();
    if (this.flam('guitar', 9, side, t)) return;
    this.strum(this.guitarChord, gain, pan, 0);
    this.freeFx('guitar:9', gain);
    this.dimmer.hit(instDef('guitar').color, gain);
    for (let s = 3; s < 9; s++) o?.hit(s, gain * (1 - (s - 3) * 0.08));
    this.kit.instStruck(3, gain);
    // (in a track a strum is just a strum: it plays the chord under the bar)
    const gs = this.hitGame(this.game.harmony() ? 'guitar:9' : `guitar:${this.guitarChord}`, t, gain);
    if (gs) {
      this.wordAt.set((STRUM.x0 + STRUM.x1) / 2, GUITAR.strings, -(STRUM.z0 + STRUM.z1) / 2);
      this.hitWords?.show(gs, this.kit.root.localToWorld(this.wordAt), this.head, instDef('guitar').color);
    }
    this.record(this.kitSurface, 9, gain, st, gs, 'strum');
  }

  /** A black key: in a song its own note (a semitone over the white key left of it); outside one, the white keys either side of it together. */
  private playBlack(j: number, side: Side, gain: number, pan: number, t: number, st: Strike): void {
    const k = pianoBlacks(this.kit.instZones)[j];
    if (!k || this.flam('piano', 30 + j, side, t)) return;
    const o = this.kit.instOverlay();
    const song = !!this.game.harmony()?.song;
    const g = this.hitGame(`piano:${song ? PIANO_BLACK + j : k.a}`, t, gain);
    if (song) this.playInst('piano', PIANO_BLACK + j, this.scoredGain(g, gain) * 0.9, pan, 0);
    else {
      this.playInst('piano', k.a, gain * 0.85, pan, 0);
      this.playInst('piano', k.b, gain * 0.8, pan, audio.now() + 0.012);
      o?.hit(k.a, gain * 0.6);
      o?.hit(k.b, gain * 0.6);
    }
    this.dimmer.hit(instDef('piano').color, gain);
    this.kit.blackStruck(j, gain);
    this.freeFx(`piano:${k.a}`, gain);
    if (!song) this.hitGame(`piano:${k.b}`, t + 0.012, gain);
    this.wordAt.set(k.x, KEYBOARD.blackTop, -k.z);
    this.hitWords?.show(g, this.kit.root.localToWorld(this.wordAt), this.head, instDef('piano').color);
    this.record(this.kitSurface, 30 + j, gain, st, g, 'piano-black');
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
    // (the light on the panel comes from your playing: its edge flashes the instrument's colour)
    this.kit.module.edgeFlash(INST_LIGHT[this.kit.inst] ?? 0xffffff, gain);
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
    if (!s.voice || s.source === 'touch') return;
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
    // (only the kit comes back, unless finding things by touch is on)
    if (s !== this.kitSurface && !FIND_OBJECTS) return false;
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
  /** The kit being found by a drum hit, not a tap on the desk. */
  private quietFind = false;

  /**
   * The kit's first hit: it blooms out from your palm. Each pad lights up as the bloom reaches it, sounding itself
   * softly (a little roll across the table), and the bars light up from the same spot.
   */
  private bloom(lanes: readonly Lane[]): void {
    this.kit.revealKeys(this.hitAt.x, this.hitAt.z);
    const fx = this.hitAt.x;
    const fz = this.hitAt.z;
    const order = lanes
      .map((l) => {
        const p = this.kit.pad(l);
        return { l, d: p ? Math.hypot(p.x - fx, -p.z - fz) : 9 };
      })
      .sort((a, b) => a.d - b.d);
    const t0 = this.clock.t;
    order.forEach(({ l }, k) =>
      this.later(t0 + 0.12 + 0.085 * k, () => {
        const p = this.kit.pad(l);
        if (!p) return;
        p.appear('fade');
        p.hit(0.45);
        audio.drum(l, 0.22, Math.max(-0.8, Math.min(0.8, p.x / 0.4)));
      }),
    );
  }

  /** A surface's first hit: its instrument draws itself in, named for two seconds; the room map fills. */
  private lastFoundT = 0;
  private discover(s: Surface): void {
    s.discovered = true;
    this.lastFoundT = this.clock.t;
    const v = s.voice;
    if (!v) return;
    if (s === this.kitSurface) {
      this.layout();
      const lanes = this.lanes();
      // (found by a drum hit, the drums already out: nothing to unveil, the hit just plays)
      if (this.quietFind) this.kit.revealKeys(this.hitAt.x, this.hitAt.z);
      else if (this.restoring) this.kit.reveal(lanes);
      else this.bloom(lanes);
      // a player coming back finds the instrument they left out
      if (this.restoring && this.settings.inst !== 'drums') this.useInstrument(null);
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
      // the light spreads out from where your hand landed (a room coming back from last time just fades in)
      if (!this.restoring) o.reveal(this.hitAt.x, this.hitAt.z);
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
      // one word, the sound's name (a desk is a Kit; glass says to go gently)
      const name = s.source === 'touch' ? (soundById(s.sound)?.name ?? cap(FAMILIES[v.family].name)) : s === this.kitSurface ? 'Kit' : `${cap(FAMILIES[v.family].name)}${isGlass(s) ? ': hit softly' : ''}`;
      // the tag never covers what it names: above an instrument on a wall, over one on a top, facing you
      if (s === this.kitSurface) this.tmp.set(0, 0.1, 0.05).applyMatrix4(s.world);
      else {
        let minX = Infinity;
        let maxX = -Infinity;
        let maxZ = -Infinity;
        for (const z of s.zones) {
          const hw = z.shape === 'rect' ? z.w / 2 : z.w;
          const hh = z.shape === 'rect' ? z.h / 2 : z.w;
          minX = Math.min(minX, z.x - hw);
          maxX = Math.max(maxX, z.x + hw);
          maxZ = Math.max(maxZ, z.z + hh);
        }
        const cx = Number.isFinite(minX) ? (minX + maxX) / 2 : this.hitAt.x;
        if (s.features?.facing === 'vertical') this.tmp.set(cx, 0.05, -(Number.isFinite(maxZ) ? maxZ + 0.06 : this.hitAt.z + 0.1)).applyMatrix4(s.world);
        else this.tmp.set(cx, 0.14, -this.hitAt.z).applyMatrix4(s.world);
      }
      this.tag.show(name, FAMILIES[v.family].color, this.tmp, this.head);
      this.debug.tag = name;
    }
    if (DEBUG) console.log(`[thump] discovered ${s.id} '${s.label}' → ${v.family} (${v.why}) size ${v.size.toFixed(2)}`);
    if (!this.restoring) this.remember(s);
    void swappable;
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
    for (const s of this.touched) this.surfaces.push(s);
    for (const s of this.surfaces) if (!s.discovered && s.source !== 'module') this.restore(s);
    if (changed) this.refMiss.clear();
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
      const want = FIND_OBJECTS && !s.discovered && !!s.voice && s.reach <= SEATED_M;
      const has = this.sheens.get(s);
      if (want && !has) {
        const sh = new Sheen(s, s.voice ? FAMILIES[s.voice.family].color : 0xffffff);
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
      this.kitSheen = new Sheen(this.kitSurface, FAMILIES.kit.color);
      this.kit.root.add(this.kitSheen.group);
    }
    this.refreshDebugSurfaces();
  }

  private refreshDebugSurfaces(): void {
    this.debug.surfaces = this.surfaces
      .filter((s) => s.source !== 'module')
      .map((s) => ({ id: s.id, label: s.label, family: s.voice?.family ?? null, discovered: s.discovered, reach: r3(s.reach), area: r3(s.features?.area ?? 0), hollow: s.features?.hollow ?? 0, glass: s.features?.glass ?? 0, soft: s.features?.soft ?? 0, why: s.voice?.why ?? '', ...(s.sound ? { sound: s.sound, kept: s.confirmed } : {}) }));
  }

  // ------------------------------------------------------------------ placement

  private updatePlacement(_dt: number) {
    if (FIXED_DESK !== null && Number.isFinite(Number(FIXED_DESK))) {
      this.placement.place(Number(FIXED_DESK), 'fixed');
      this.heightSure = true;
      this.placeKit();
      return;
    }
    // (the first poses after entering can sit at the origin: a third of a second, then the instruments are in front of
    // you, where you're looking; never a wait with nothing there)
    if (this.sessionTime < SPAWN_AFTER_S) return;
    if (this.head.y < 0.5 && this.sessionTime < 1.5) return;
    this.forwardFlat(this.fwd);
    const plane = this.tableAhead();
    const drop = this.settings.deskDrop;
    if (plane !== null) this.placement.place(plane, 'plane');
    else if (drop) this.placement.place(this.head.y - drop, 'remembered');
    else this.placement.placeDefault(this.head.y);
    this.heightSure = plane !== null;
    this.spawnT = this.clock.t;
    this.spawnHeadY = this.head.y;
    this.placeKit();
    // (a first guess at the height: say how to put it right)
    if (this.placement.source === 'default' && !this.settings.noWords) {
      this.tmp.set(0, 0.03, KIT_ZONE.front + 0.06).applyMatrix4(this.kit.root.matrixWorld);
      this.hint.show('Wrong height? Lay a hand flat on the desk', 0xf2efe6, this.tmp, this.head, 8);
    }
  }

  // ------------------------------------------------------------------ the desk's real height, found after the kit is out

  /** The kit stands on a height that was found (a table plane, a resting palm) rather than guessed. */
  private heightSure = false;
  /** When the kit came out (clock time): a palm laid flat on the desk sets its height for a while after. */
  private spawnT = -1e9;
  private spawnHeadY = 0;
  private heightProbe = new Placement();
  /** The kit's height gliding to the desk found under it (NaN: not gliding). */
  private glideY = Number.NaN;
  private planeCheckT = 0;
  /**
   * After the kit is out at a guessed height: a table plane under it, or a palm laid flat on the desk near it, and the
   * kit glides down (or up) onto the real desk. Remembered for next time (as a drop below the eyes).
   */
  private refineHeight(dt: number): void {
    const root = this.kit.root;
    if (!Number.isNaN(this.glideY)) {
      const k = 1 - Math.exp(-dt * 9);
      const y = root.position.y + (this.glideY - root.position.y) * k;
      const done = Math.abs(this.glideY - y) < 0.002;
      this.kitBaseY += (done ? this.glideY : y) - root.position.y;
      root.position.y = done ? this.glideY : y;
      root.updateMatrixWorld(true);
      if (done) {
        this.glideY = Number.NaN;
        this.placeKit(true);
      }
      return;
    }
    if (this.heightSure || this.moveHand >= 0 || this.game.mode === 'play' || this.game.mode === 'count') {
      this.holdRing.count = 0;
      return;
    }
    const since = this.clock.t - this.spawnT;
    // (the first poses can still be settling as it comes out: if your head's height moves a lot in the first seconds,
    // the guessed height keeps its drop below your eyes)
    if (since < 3 && Math.abs(this.head.y - this.spawnHeadY) > 0.08) {
      this.glideY = Math.min(this.head.y - 0.2, root.position.y + (this.head.y - this.spawnHeadY));
      this.spawnHeadY = this.head.y;
      return;
    }
    // a table plane under the kit (they can arrive a second or two after entering)
    this.planeCheckT -= dt;
    if (this.planeCheckT <= 0) {
      this.planeCheckT = 0.5;
      this.planeYs.length = 0;
      root.getWorldPosition(this.tmp4);
      this.planesUnder(this.tmp4);
      const at = this.planeYs.filter((y) => this.head.y - y >= PLACE.minDrop && this.head.y - y <= PLACE.maxDropWithPlane);
      if (at.length) {
        this.settleAt(Math.max(...at));
        return;
      }
    }
    if (since > HEIGHT_PROBE_S) {
      this.holdRing.count = 0;
      return;
    }
    // a hand laid flat on the desk near the kit, still for a moment
    root.getWorldPosition(this.tmp4);
    let steadying = false;
    for (const side of this.steadyFirst()) {
      const h = hands[side];
      if (!h.tracked || h.controller) continue;
      if (Math.hypot(h.palm.x - this.tmp4.x, h.palm.z - this.tmp4.z) > 0.55) continue;
      this.planesUnder(h.palm);
      if (this.heightProbe.update({ x: h.palm.x, y: h.palm.y, z: h.palm.z, radius: h.palmRadius, upDot: h.upDot }, this.planeYs, dt, this.head.y)) {
        this.placedHand = side;
        this.settleAt(this.heightProbe.deskY!);
        this.heightProbe = new Placement();
        return;
      }
      if (this.heightProbe.phase === 'steadying') {
        this.steadyHand = side;
        this.holdRing.position.set(h.palm.x, h.palm.y - h.palmRadius + 0.004, h.palm.z);
        steadying = true;
        break;
      }
    }
    this.holdRing.count = steadying ? Math.ceil(this.heightProbe.progress * HOLD_DOTS) : 0;
  }
  /** The desk is at `y`: the kit glides onto it, and the height is kept for next time. */
  private settleAt(y: number): void {
    this.heightSure = true;
    this.holdRing.count = 0;
    this.placement.deskY = y;
    this.settings = { ...this.settings, deskDrop: Math.round((this.head.y - y) * 1000) / 1000 };
    saveSettings(this.settings);
    const target = y + (this.settings.kitNudge?.h ?? 0);
    if (Math.abs(target - this.kit.root.position.y) > 0.004) {
      this.glideY = Math.min(target, this.head.y - 0.2);
      sfx.set();
    }
  }

  // ------------------------------------------------------------------ bringing the kit back to you

  /** Seconds the kit has been somewhere no seated player could play it. */
  private strayFor = 0;
  /** A check due soon after you come back to the headset (clock time; -1 none) and whether it's a reset. */
  private recallCheckAt = -1;
  private hiddenAt = -1;
  private refSpace: XRReferenceSpace | null = null;
  private onRefReset = () => {
    // Quest recentred (or lost and found its place): the world moved under the kit
    this.recallCheckAt = this.clock.t + 0.35;
  };
  /** Listen for Quest moving the world's origin (a recentre, a headset taken off and put back on). */
  private watchRefSpace(): void {
    let rs: XRReferenceSpace | null = null;
    try {
      rs = this.renderer.xr.getReferenceSpace();
    } catch {
      rs = null;
    }
    if (rs === this.refSpace) return;
    this.refSpace?.removeEventListener('reset', this.onRefReset);
    this.refSpace = rs;
    rs?.addEventListener('reset', this.onRefReset);
  }
  /**
   * The kit stays where a seated player can play it: after a recentre or a return to the headset it comes back in
   * front of you if it's no longer there, and if it ever ends up out of reach (across the room, behind you) for a few
   * seconds, the same.
   */
  private keepWithin(dt: number): void {
    if (this.moveHand >= 0 || !Number.isNaN(this.glideY)) return;
    const root = this.kit.root;
    root.getWorldPosition(this.tmp4);
    const dx = this.tmp4.x - this.head.x;
    const dz = this.tmp4.z - this.head.z;
    const far = Math.hypot(dx, dz);
    const drop = this.head.y - this.tmp4.y;
    this.forwardFlat(this.fwd);
    const ahead = far > 1e-3 ? (dx * this.fwd.x + dz * this.fwd.z) / far : 1;
    if (this.recallCheckAt >= 0 && this.clock.t >= this.recallCheckAt) {
      this.recallCheckAt = -1;
      // where a fresh placement would put it: if it's well off from that, bring it back
      const yawOff = Math.abs(Math.atan2(Math.sin(root.rotation.y - Math.atan2(-this.fwd.x, -this.fwd.z)), Math.cos(root.rotation.y - Math.atan2(-this.fwd.x, -this.fwd.z))));
      if (far > 0.75 || far < 0.1 || ahead < 0.45 || drop < 0.12 || drop > 0.95 || yawOff > 0.9) {
        this.recall();
        return;
      }
    }
    const stray = far > 1.2 || ahead < -0.2 || drop < 0.05 || drop > 1.1;
    this.strayFor = stray ? this.strayFor + dt : 0;
    if (this.strayFor > 4) this.recall();
  }
  /** The kit back in front of you, where you're looking, at the desk's height (and the move you'd made, kept). */
  private recall(quiet = false): void {
    this.strayFor = 0;
    if (this.placement.phase !== 'placed') return;
    const drop = this.head.y - this.kitBaseY;
    const y = drop >= 0.15 && drop <= 0.9 ? this.kitBaseY : this.head.y - (this.settings.deskDrop ?? PLACE.defaultDrop);
    this.forwardFlat(this.fwd);
    const plane = this.tableAhead();
    this.placement.deskY = plane ?? y;
    this.placeKit();
    sfx.set();
    if (!this.settings.noWords && !quiet) {
      this.tmp.set(0, 0.14, 0.02).applyMatrix4(this.kit.root.matrixWorld);
      this.tag.show('Back in front of you', 0xf2efe6, this.tmp, this.head, 2.5);
    }
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
      // (where it stands by itself, kept: a move of yours is saved from there)
      this.kitBase.set(pose.x, pose.z, pose.yaw);
      this.kitBaseY = pose.y;
      this.kitBaseFwd.set(this.fwd.x, 0, this.fwd.z);
      const nu = this.settings.kitNudge;
      if (nu) {
        // (nearer or further and higher or lower, as you last moved it; not to the side: it comes out where you look)
        pose.x += this.fwd.x * nu.a;
        pose.z += this.fwd.z * nu.a;
        // turned to face you from there
        pose.yaw = Math.atan2(-(pose.x - this.head.x), -(pose.z - this.head.z));
        pose.y += nu.h ?? 0;
      }
      // (never at your eyes: at least 20 cm under them, whatever was found or saved)
      pose.y = Math.min(pose.y, this.head.y - 0.2);
      root.position.set(pose.x, pose.y, pose.z);
      root.rotation.set(0, pose.yaw, 0);
      root.updateMatrixWorld(true);
      this.fitToTable();
      // (no table found: a tray, most likely; the panel and the friends' seats come in close)
      this.kit.module.compact(!this.tableOutline);
      this.applyKit();
      // (the panel where you last moved it)
      const pa = this.settings.panelAt;
      this.kit.module.moveTo(pa ? this.hRoot.set(pa.x, pa.y, pa.z) : null);
      // the display stands within reach of where you sit, to the side of your playing hand
      this.kit.module.side(this.handed() === 'left' ? -0.24 : 0.24);
      this.kit.module.seat(Math.hypot(pose.x - this.head.x, pose.z - this.head.z), this.head.y - pose.y);
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
    const mod = this.kit.module.frame;
    mod.updateMatrixWorld(true);
    this.moduleSurface.world.copy(mod.matrixWorld);
    this.moduleSurface.inv.copy(this.moduleSurface.world).invert();
    this.moduleSurface.bounds = { minX: -PANEL.w / 2, maxX: PANEL.w / 2, minZ: -PANEL.h / 2, maxZ: PANEL.h / 2 };
    this.moduleSurface.features = { facing: 'vertical', width: PANEL.w, length: PANEL.h, area: PANEL.w * PANEL.h, elevation: 0, hollow: 0, glass: 0, soft: 0, curved: 0, bump: false, label: 'module' };
    this.panelZones();
    this.moduleSurface.discovered = true;
    this.moduleSurface.detector.resetSurface(0);
    // the kit as you set it (its style and pieces), laid out
    this.applyKit();
    // the kit and room come back as they were when you return within the session
    if (this.kitSurface.discovered) {
      this.kit.reveal(this.lanes());
      this.useInstrument(null);
    }
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
        this.tag.show('Hit a drum', 0xff5a3c, this.tmp, this.head, 6);
      }
    }
    if (this.placement.source === 'default') this.stage && this.game.refreshDisplay();
    // the things on this desk from last time come back where they were
    this.restorePads();
    // your band's name on the kick (chosen the first time, from where you sat: a tray or a desk)
    if (!this.progress.bandName) {
      this.progress.bandName = bandNameFor(!this.tableOutline);
      saveProgress(this.progress);
    }
    // (and your names on the world's boards: two words each, yours and your band's, shuffled on the name page)
    if (!this.progress.me || !this.progress.bandWords) {
      this.progress.me ??= randomWords();
      this.progress.bandWords ??= randomWords();
      saveProgress(this.progress);
    }
    // (no names painted on the instruments: the band's name is the panel's to show)
    this.debug.bandName = this.progress.bandName;
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
      // (the song's effects too: the falling notes, lights down, the clap ring and the end ring, so none of them
      // builds its shader at a musical moment)
      this.makeFlash();
      this.makeFinale();
      for (const root of [this.kit.root, this.worldRoot])
        root.traverse((o) => {
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

  private anchorUuid: string | null = null;
  private anchorReadAt = -Infinity;
  private roomAnchor(): { group: Object3D; uuid: string } | null {
    if (!this.world.session?.enabledFeatures?.includes('anchors')) return null;
    const su = this.world.getSystem(SceneUnderstandingSystem) as unknown as { xrAnchor?: unknown; anchoredGroup?: Object3D } | undefined;
    if (!su?.xrAnchor || !su.anchoredGroup) return null;
    const now = performance.now();
    if (now - this.anchorReadAt > 2000) {
      this.anchorReadAt = now;
      try {
        this.anchorUuid = localStorage.getItem(ANCHOR_KEY);
      } catch {
        this.anchorUuid = null;
      }
    }
    return this.anchorUuid ? { group: su.anchoredGroup, uuid: this.anchorUuid } : null;
  }


  // ------------------------------------------------------------------ tests and filming

  private autoT = 0;
  private autoRunAt = -1;
  private autoNext = 0;
  /** ?autoplay=1: discovers each surface in reach in turn, presses play when offered, hits every note on time. */
  private autoHoldT = -1;
  /** The autoplayer on (?autoplay=1; a test can turn it on later, after what it wants to see by hand). */
  autoOn = AUTOPLAY;
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
    if (this.game.mode === 'build' && t >= this.autoNext) {
      const want = this.game.buildAsks();
      if (want) {
        this.autoNext = t + 0.8;
        // whatever the module suggests (your things first), as a player following the glow would
        this.autoHit(this.game.suggestion() ?? 'keys:2', t);
      } else if (this.game.buildRunning()) {
        // let the machine run a moment, then perform on it
        if (this.autoRunAt < 0) this.autoRunAt = t;
        else if (t - this.autoRunAt > 3) {
          this.autoRunAt = -1;
          this.game.key('play');
        }
      }
    }
    // (a lesson holding: answered after half a second, the held note itself or, to read on, the snare)
    const hold = this.game.hold;
    if (hold) {
      if (this.autoHoldT < 0) this.autoHoldT = this.uiT;
      if (this.uiT - this.autoHoldT > 0.5) {
        this.autoHoldT = -1;
        if (hold.kind === 'note') this.autoHit(hold.key, t);
        else this.hitGame(hold.key || 'kit:snare', t, 0.8);
      }
      return;
    }
    this.autoHoldT = -1;
    // (a lesson's first notes wait for you: the autoplayer lets them, as a newcomer would)
    if (this.game.lessonWaits > 0 && this.game.mode === 'play') return;
    if (this.game.mode === 'play' || this.game.mode === 'count' || this.game.mode === 'jam' || this.game.mode === 'build') {
      this.game.dueBetween(from, t, (key) => this.autoHit(key, t));
    }
  }

  private autoHit(key: string, t: number): void {
    const r = this.ref(key);
    if (!r) return;
    if (r.kind === 'clap') {
      audio.modal('clap', 60, 0.8, 0, 0, 0.5, 'clap');
      this.hitGame('clap:0', t, 0.8);
      return;
    }
    if (r.kind === 'inst') {
      const id = key.slice(0, key.indexOf(':')) as InstId;
      if (id === 'piano' && this.kit.inst === 'piano' && r.zone >= PIANO_BLACK) {
        const st = fakeStrike(t);
        this.playBlack(r.zone - PIANO_BLACK, 'left', st.gain, 0, t, st);
        return;
      }
      // (the guitar: a hand moves to the chord's place, or sweeps the strings, down or up as the beat falls)
      if (id === 'guitar' && this.kit.inst === 'guitar') {
        if (r.zone < 3) this.guitarFret(r.zone);
        else this.autoStrum();
        return;
      }
      const q = this.kit.inst === id ? this.kit.instZones[r.zone % PIANO_LOW] : null;
      // (the piano's keys are pressed in the air: as a finger would)
      if (q && id === 'guitar') {
        const st = fakeStrike(t);
        this.playChordPad(q.i, 'left', st.gain, 0, t, st);
      } else if (q && (id === 'piano' || id === 'congas' || id === 'handpan' || id === 'marimba')) {
        const st = fakeStrike(t);
        this.playZone(id, q.i, 'left', st.gain, 0, t, st);
      } else if (q) {
        this.hitAt.x = q.x;
        this.hitAt.z = q.z;
        this.hitAt.pad = -1;
        this.onHit(this.kitSurface, 'left', fakeStrike(t));
      } else {
        this.playInst(id, r.zone, 0.8, 0, 0);
        this.hitGame(key, t, 0.8);
      }
      return;
    }
    if (r.kind === 'pad' || r.kind === 'keys') {
      if (r.kind === 'pad') {
        // (the drums are struck in the air now: as a stick would)
        const p = this.kit.pad(r.lane);
        const st = fakeStrike(t);
        this.playLane(r.lane, st.gain, p?.x ?? 0, t, st);
        return;
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

  /** Paused by you: the song, the band and scoring hold still; resuming counts you back in. */
  private userPaused = false;
  /** A lesson holding the song still for you (the game holds its own song clock; the room's time runs on). */
  private lessonHold = false;
  private setUserPaused(p: boolean): void {
    if (p === this.userPaused) return;
    const playing = this.game.mode === 'play' || this.game.mode === 'count';
    if (p && !playing) return;
    this.userPaused = p;
    this.game.paused = p;
    this.forgetAir();
    // (the song's clock holds; the sound keeps running so the panel still clicks; what was ringing stops)
    this.clock.hold();
    if (p) audio.stopSustain();
    if (!p) this.resumePending = true;
    // (the panel comes back if you'd hidden it: it's how you resume)
    if (p) this.kit.module.setHidden(false);
    this.game.refreshDisplay();
  }

  /** The song's pause, gone (the song ended or stopped under it): the clock and your hands are free again. */
  private clearUserPause(): void {
    this.userPaused = false;
    this.game.paused = false;
    this.resumePending = false;
    this.forgetAir();
    this.game.refreshDisplay();
  }
  /** Every hand point starts afresh (after a pause or a blur, a hand that moved meanwhile isn't a hit). */
  private forgetAir(): void {
    for (let p = 0; p < AIR_PTS * 2; p++) this.forgetPt(p);
    // (and the sticks' click and the clap: a frame back after a gap isn't a knock)
    this.stickClick.reset();
    this.clapW.reset();
  }
  /** The session's visibility: blurred (the Meta menu) or hidden (the headset off) pauses; back, a check on the kit. */
  private onXrVis(s: VisibilityState): void {
    if (s === VisibilityState.NonImmersive) return;
    this.xrBlurred = s === VisibilityState.VisibleBlurred || s === VisibilityState.Hidden;
    this.setPaused(this.xrBlurred || this.pageHidden);
    if (s === VisibilityState.Hidden && this.hiddenAt < 0) this.hiddenAt = performance.now();
    if (s === VisibilityState.Visible && this.hiddenAt >= 0) {
      // back in the headset: once the poses settle, the kit comes back in front of you if the world moved under it
      if (performance.now() - this.hiddenAt > 1000) this.recallCheckAt = this.clock.t + 0.5;
      this.hiddenAt = -1;
    }
    if (s === VisibilityState.Visible) audio.resume();
  }
  private setPaused(p: boolean): void {
    if (p === this.paused) return;
    this.paused = p;
    audio.setPaused(p);
    this.forgetAir();
    // the count-in waits until the audio is really running again
    if (!p) this.resumePending = true;
  }

  private endSession(): void {
    this.sessionTime = 0;
    // (out of the headset while paused: the pause goes with the song, or you'd come back to a game frozen with no Resume)
    if (this.userPaused) this.clearUserPause();
    if (this.placement.phase !== 'placed') return;
    if (this.game.mode === 'play' || this.game.mode === 'count') this.game.stop();
    // nothing keeps playing while you're out of the headset (and nothing catches up all at once on return)
    this.game.endJam();
    this.game.looper.clear();
    audio.stopSustain();
    this.brushPrev.clear();
    this.pendingLights.length = 0;
    this.timed.length = 0;
    this.sinkWatch[0] = this.sinkWatch[1] = null;
    this.mallets.hide();
    this.handLatch[0] = this.handLatch[1] = -Infinity;
    for (const s of this.surfaces) {
      s.detector.forget(0);
      s.detector.forget(1);
      s.near[0] = s.near[1] = false;
    }
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
    // (your hands stay seen at every level: losing them is worse than any frame it saves)
    // (lights down costs a blend over both eyes: at the lowest levels the fill keeps only its sound and colours)
    this.dimmer.enabled = lvl < 2;
    this.lightsOut.level = lvl;
    for (const sh of this.sheens.values()) sh.group.visible = lvl < 1;
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
    // (each drum's head, or cymbal, where it is struck: all face up)
    for (const [lane, p] of this.kit.pads)
      if (p.visible) out[lane] = root.localToWorld(this.tmp.set(p.x, p.topY, p.z)).toArray().map(r4);
    out.table = root.localToWorld(this.tmp.set(0, 0, 0)).toArray().map(r4);
    KEYS.forEach((k, i) => {
      const z = this.moduleSurface.zones[i];
      if (z) out[`key-${k}`] = this.tmp.set(z.x, 0, -z.z).applyMatrix4(this.moduleSurface.world).toArray().map(r4);
    });
    this.kit.keyZones.forEach((z, i) => (out[`edge${i}`] = root.localToWorld(this.tmp.set(z.x, 0, -z.z)).toArray().map(r4)));
    // the instrument on the desk: each of its notes (and the guitar's strum band)
    // (each where it's struck: the piano's keys are up in its case)
    const top = this.kit.inst === 'piano' ? KEYBOARD.top : this.kit.inst === 'congas' ? CONGA.top : this.kit.inst === 'guitar' ? GUITAR.board : this.kit.inst === 'marimba' ? MARIMBA.top : 0;
    const hp = this.kit.inst === 'handpan' ? handpanShape(this.kit.instZones) : null;
    this.kit.instZones.forEach((z, i) => (out[`inst${i}`] = this.kit.instRoot.localToWorld(this.tmp.set(z.x, hp ? handpanY(Math.hypot(z.x - hp.x, z.z - hp.z), hp.R) : top, -z.z)).toArray().map(r4)));
    if (this.kit.inst === 'guitar') {
      // the held guitar: its three chord places on the fretboard, where a strum crosses the strings, which way is down
      // across them (toward the high E), and which way its top faces
      for (let c = 0; c < 3; c++) out[`inst${c}`] = this.heldWorld(zoneX(c), HG.board + 0.002, 0, this.tmp).toArray().map(r4);
      out.strum = this.heldWorld(HG.strikeX, HG.strings, 0, this.tmp).toArray().map(r4);
      out.strumDown = this.tmp.set(0, 0, 1).transformDirection(this.heldM).transformDirection(root.matrixWorld).toArray().map(r4);
      out.guitarNormal = this.tmp.set(0, 1, 0).transformDirection(this.heldM).transformDirection(root.matrixWorld).toArray().map(r4);
    }
    out.inst = [SHELF.findIndex((d) => d.id === this.kit.inst)];
    for (const it of this.kit.module.page?.items ?? []) {
      const z = itemZone(it);
      out[`ui:${it.id}`] = this.tmp.set(z.x, 0, -z.z).applyMatrix4(this.moduleSurface.world).toArray().map(r4);
    }
    // which way the panel faces (pokes come in against it)
    out.panelNormal = this.tmp.set(0, 1, 0).transformDirection(this.moduleSurface.world).toArray().map(r4);
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

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const GUARD_NAMES = ['RoomSystem.hands', 'RoomSystem.swaps', 'RoomSystem.game'];
/** A found instrument takes a part in a song only if it's this close to your head when the song starts. */
const PLAY_REACH_M = 1.3;
/** How fast the last chord's ring of light crosses the room (m/s); each instrument plays as it arrives. */
const FINALE_SPEED = 2.2;
const LANE_INDEX: Partial<Record<string, number>> = { kick: 0, snare: 1, hat: 2, tom: 3, rim: 4 };
/** Points tracked per hand for hits in the air. */
const AIR_PTS = 7;
/** The guitar's chord places as a song names them (made once, not each frame). */
const GUITAR_ZONE_KEYS = ['guitar:0', 'guitar:1', 'guitar:2'] as const;
/** A conga's whole drum (its edge zone, the full head), by zone. */
const CONGA_WHOLE = ['congas:1', 'congas:1', 'congas:3', 'congas:3'];
/** Each hand point's held piano notes go by its own name, so lifting that finger lets go of just those. */
const HOLD_OWNER = Array.from({ length: AIR_PTS * 2 }, (_, p) => `key${p}`);
/**
 * A One-Euro filter on a direction (or any 3-vector): smooth when it's still, quick when it moves (a stick that has a
 * little weight without lagging a stroke).
 */
/** The One Euro filter on one number. */
class OneEuro1 {
  private x = 0;
  private dx = 0;
  private has = false;
  constructor(
    private readonly minCutoff: number,
    private readonly beta: number,
    private readonly dCutoff = 1,
  ) {}
  reset(): void {
    this.has = false;
  }
  private alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / Math.max(1e-4, dt));
  }
  filter(v: number, dt: number): number {
    if (!this.has) {
      this.x = v;
      this.dx = 0;
      this.has = true;
      return v;
    }
    this.dx += ((v - this.x) / Math.max(1e-4, dt) - this.dx) * this.alpha(this.dCutoff, dt);
    this.x += (v - this.x) * this.alpha(this.minCutoff + this.beta * Math.abs(this.dx), dt);
    return this.x;
  }
}

class OneEuro3 {
  private x = new Vector3();
  private dx = new Vector3();
  private has = false;
  private tmp = new Vector3();
  constructor(
    private readonly minCutoff: number,
    private readonly beta: number,
    private readonly dCutoff = 1,
  ) {}
  reset(): void {
    this.has = false;
  }
  private alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / Math.max(1e-4, dt));
  }
  filter(v: Vector3, dt: number, out: Vector3): Vector3 {
    if (!this.has) {
      this.x.copy(v);
      this.dx.set(0, 0, 0);
      this.has = true;
      return out.copy(v);
    }
    this.tmp.subVectors(v, this.x).divideScalar(Math.max(1e-4, dt));
    this.dx.lerp(this.tmp, this.alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * this.dx.length();
    this.x.lerp(v, this.alpha(cutoff, dt));
    return out.copy(this.x);
  }
}
/** The drums struck in the air, in their surfaces' order. */
const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const AIR_LANES: Lane[] = ['kick', 'snare', 'hat', 'tom', 'floor', 'crash', 'ride'];

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
