/**
 * Notes falling onto the instrument as light (the waterfall, version 2: docs/UI-13NOV.md). Each note is a glass
 * capsule with a bright core and a fresnel rim, a soft halo and a comet trail, on its way to the key, bar, field,
 * fret or drum that plays it: straight down onto keys, a short arc onto a handpan field or marimba bar, along the
 * neck to a guitar's chord, a bar of light onto the strings for a strum, a lens onto a drum head with a ring closing
 * onto its rim (a crescent for a cymbal). A chord's notes are joined by faint filaments. Behind the lane a slow
 * aurora in the song's colours, with a line of light sweeping up on every beat.
 *
 * A hit bursts: sparks that fall onto the key and skid off its front, a ripple on the landing line, the key flooding
 * with colour (a little into its neighbours), a flash. A miss turns grey and crumbles into ash. The streak changes
 * the look: wider halos at ×10, gold edges and brighter beat lines at ×25, sparks trailing every note and a quicker
 * aurora at ×50; a broken run cools back over one bar. Calm motion halves the movement.
 *
 * Six draws in all (shapes, landing light, halos, streaks, sparks, aurora), a fixed pool of 400 sparks, nothing
 * allocated per frame, no post-processing: the glow is additive sprites, and all of it only adds light.
 */
import {
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type Object3D,
  type ShaderMaterial,
} from '@iwsdk/core';
import type { MoteView } from '../play/game.js';
import { motion } from '../ui/motion.js';
import { FALL_PER_BEAT, NoteMemo, SHOW_BEATS, SparkPool, StreakLook, formOf, notePath, pathOf, type NoteForm, type PathPoint } from './waterfall-fx.js';
import { auroraMaterial, haloMaterial, shapeMaterial, streakMaterial } from './waterfall-shaders.js';

export { FALL_PER_BEAT, SHOW_BEATS };

/** A note's target: its size (m) and whether it's round (where and its colour come with it). */
export interface NoteTarget {
  w: number;
  d: number;
  round: boolean;
  /** The struck surface's normal (world) when it leans (a tipped drum, a conga, the handpan's dome); unset: straight up. */
  nx?: number;
  ny?: number;
  nz?: number;
}

/** What the waterfall reads from the game each frame (the Game fits it). */
export interface WaterfallFeed {
  readonly motes: readonly MoteView[];
  readonly moteCount: number;
  readonly mode: string;
  /** The beat now (NaN outside music). */
  readonly beatNow: number;
  readonly clock: { readonly spb: number };
  readonly display: { readonly combo?: number };
}

export type Resolve = (key: string, at: Vector3, col: Color, t: NoteTarget) => boolean;

const MAX_NOTES = 40;
const SPARKS = 400;
const FX = 32;

const Q_POS: [string, number][] = [
  ['iPos', 3],
  ['iAxis', 3],
  ['iSize', 2],
  ['iCol', 3],
  ['iData', 4],
];
const HALO: [string, number][] = [
  ['iPos', 3],
  ['iSize', 2],
  ['iCol', 3],
];
const STREAK: [string, number][] = [
  ['iA', 3],
  ['iB', 3],
  ['iW', 2],
  ['iCol', 3],
  ['iAl', 2],
];

/** One instanced draw: a base quad and per-instance attributes, filled from 0 each frame. */
class Batch {
  readonly mesh: Mesh;
  readonly f: Float32Array[];
  n = 0;
  private attrs: InstancedBufferAttribute[] = [];
  private geo = new InstancedBufferGeometry();

  constructor(
    name: string,
    base: BufferGeometry,
    layout: [string, number][],
    readonly cap: number,
    mat: ShaderMaterial,
    order: number,
  ) {
    this.geo.index = base.index;
    this.geo.setAttribute('position', base.getAttribute('position'));
    this.f = layout.map(([nm, size]) => {
      const a = new InstancedBufferAttribute(new Float32Array(cap * size), size);
      a.setUsage(DynamicDrawUsage);
      this.geo.setAttribute(nm, a);
      this.attrs.push(a);
      return a.array as Float32Array;
    });
    this.geo.instanceCount = 0;
    this.mesh = new Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = order;
    this.mesh.name = name;
  }

  commit(): void {
    this.geo.instanceCount = this.n;
    if (!this.n) return;
    for (const a of this.attrs) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.n * a.itemSize);
      a.needsUpdate = true;
    }
  }
}

const _p = new Vector3();
const _c = new Color();
const _gold = new Color(0xffd36a);
const _t: NoteTarget = { w: 0, d: 0, round: false };
const _path: PathPoint = { up: 0, along: 0, du: 0, da: 0 };
const _X = new Vector3();
const _U = new Vector3();
const _nrm = new Vector3();
const _Z = new Vector3();
const _dir = new Vector3();
const _head = new Vector3();
const _ctr = new Vector3();
const _prev = new Vector3();
const _tmp = new Vector3();
const _inv = new Matrix4();
const _m = new Matrix4();
const _lm = new Matrix4();
const _q = new Quaternion();
const _s = new Vector3();
const _hsl = { h: 0, s: 0, l: 0 };
const _palA = new Color();
const _palB = new Color();
const _white = new Color(1, 1, 1);
const _ax = new Vector3(1, 0, 0);
const _zero = new Vector3();
const TILT = (-14 * Math.PI) / 180;

/** Landing light (flash, ripple, flood, sweep), each a few hundred ms. */
const enum Fx {
  Flash,
  Ring,
  FloodKey,
  FloodHead,
  Sweep,
}

export class Waterfall {
  /** Everything it draws (add it to the room once). */
  readonly root = new Group();
  readonly sparks = new SparkPool(SPARKS);
  readonly look = new StreakLook();
  private shapes: Batch;
  /** The dark band under the rings (so they read on bright surfaces). */
  private shades: Batch;
  private landing: Batch;
  private halos: Batch;
  private streaks: Batch;
  private sparkDraw: Batch;
  private aurora: Mesh;
  private auroraMat: ShaderMaterial;
  private shapeMats: ShaderMaterial[];
  private burstMemo = new NoteMemo(64);
  private ashMemo = new NoteMemo(32);
  // landing light
  private fxKind = new Uint8Array(FX);
  private fxP = new Float32Array(FX * 3);
  private fxS = new Float32Array(FX * 2);
  private fxC = new Float32Array(FX * 3);
  private fxAge = new Float32Array(FX).fill(9);
  private fxLife = new Float32Array(FX).fill(1);
  private fxNext = 0;
  // the lane's extent, kit-local: what this song's notes reach (target) and what's drawn (eased toward it)
  private want = { x0: 0, x1: 0, y: 0, z: 0, set: false };
  private lane = { x0: -0.15, x1: 0.15, y: 0, z: -0.1 };
  private auroraOp = 0;
  private auroraT = 0;
  private idle = 9;
  private guideKeys: string[] = new Array<string>(MAX_NOTES).fill('');
  private palSeen = false;

  constructor() {
    const quad = new PlaneGeometry(2, 2);
    const strip = new PlaneGeometry(2, 1).translate(0, 0.5, 0);
    const shapeMat = shapeMaterial();
    const landMat = shapeMaterial();
    this.shapeMats = [shapeMat, landMat];
    this.shapes = new Batch('WaterfallNotes', quad, Q_POS, MAX_NOTES * 2, shapeMat, 7);
    this.shades = new Batch('WaterfallShade', quad, Q_POS, MAX_NOTES * 2, shapeMaterial(true), 5);
    this.landing = new Batch('WaterfallLanding', quad, Q_POS, FX, landMat, 7);
    this.halos = new Batch('WaterfallHalos', quad, HALO, MAX_NOTES + FX, haloMaterial(), 6);
    this.streaks = new Batch('WaterfallTrails', strip, STREAK, MAX_NOTES * 3, streakMaterial(), 6);
    this.sparkDraw = new Batch('WaterfallSparks', strip, STREAK, SPARKS, streakMaterial(), 8);
    this.auroraMat = auroraMaterial();
    this.aurora = new Mesh(new PlaneGeometry(1, 1, 1, 12).translate(0, 0.5, 0), this.auroraMat);
    this.aurora.name = 'WaterfallAurora';
    this.aurora.frustumCulled = false;
    this.aurora.matrixAutoUpdate = false;
    this.aurora.renderOrder = 5;
    this.aurora.matrix.makeScale(0, 0, 0);
    this.root.name = 'Waterfall';
    this.root.add(this.aurora, this.shades.mesh, this.streaks.mesh, this.halos.mesh, this.shapes.mesh, this.landing.mesh, this.sparkDraw.mesh);
  }

  /**
   * Draw the song's notes for this frame. `frame` is the instrument's root (notes fall along its up, and the lane
   * stands behind its notes), `resolve` finds a key's target: where (world), its colour and its size.
   */
  /**
   * Free play, the songs' notes turned around: what you play sends light away from it. A round head (a drum, a
   * cymbal, a conga, a handpan field, a chord position) sends a ring spreading out from its edge, at its own lean;
   * a key or a bar sends a bar of light rising off it; a strum, a band of light lifting off the strings. A fixed pool.
   */
  private emits = Array.from({ length: 48 }, () => ({ age: 9, life: 0.6, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, r: 0, w: 0, d: 0, cr: 1, cg: 1, cb: 1, kind: 0, gain: 1 }));
  private emitNext = 0;
  emit(at: Vector3, col: Color, t: NoteTarget, form: NoteForm, gain: number): void {
    const e = this.emits[this.emitNext++ % this.emits.length];
    e.age = 0;
    e.x = at.x;
    e.y = at.y;
    e.z = at.z;
    const n = _nrm.set(t.nx ?? 0, t.ny ?? 0, t.nz ?? 0);
    if (n.lengthSq() < 0.5) n.copy(_U);
    else n.normalize();
    e.nx = n.x;
    e.ny = n.y;
    e.nz = n.z;
    e.cr = col.r;
    e.cg = col.g;
    e.cb = col.b;
    e.gain = Math.max(0.35, Math.min(1, gain));
    e.kind = form === 'ring' || form === 'disc' || form === 'cymbal' || t.round ? 0 : form === 'strum' ? 2 : 1;
    e.r = Math.max(0.012, t.w / 2);
    e.w = t.w;
    e.d = t.d;
    e.life = e.kind === 0 ? 0.55 : 0.9;
  }
  private drawEmits(dt: number, amp: number): void {
    const S = this.shapes;
    for (const e of this.emits) {
      if (e.age >= e.life) continue;
      e.age += dt;
      const u = Math.min(1, e.age / e.life);
      const fade = (1 - u) * (1 - u) * e.gain;
      _nrm.set(e.nx, e.ny, e.nz);
      _tmp.set(e.x, e.y, e.z);
      if (e.kind === 0) {
        // a ring spreading out from the edge, quick, eased out, thinning as it goes
        const rr = e.r * (1 + 1.3 * amp * (1 - Math.pow(1 - u, 3)));
        _tmp.addScaledVector(_nrm, 0.003);
        this.shape(this.shades, _tmp, _nrm, rr * 1.01, rr * 1.01, 1, 1, 1, 3, 0, Math.min(0.5, 0.008 / rr + 0.02), 0);
        this.shape(this.shades, _tmp, _nrm, rr, rr, e.cr, e.cg, e.cb, 3, 0, Math.min(0.5, 0.004 / rr + 0.01), fade);
        this.shape(S, _tmp, _nrm, rr, rr, e.cr * fade * 1.4, e.cg * fade * 1.4, e.cb * fade * 1.4, 3, 0, Math.min(0.5, 0.005 / rr + 0.015), 0);
      } else if (e.kind === 1) {
        // a bar of light rising off the key: up 22 cm, slowing, the colour of the instrument
        const r = Math.min(0.011, Math.max(0.0045, e.w * 0.36));
        const len = 0.018;
        const up = 0.22 * amp * (1 - Math.pow(1 - u, 2)) + len + 0.004;
        _tmp.addScaledVector(_nrm, up);
        this.shape(S, _tmp, _nrm, r, len, e.cr * fade * 1.5, e.cg * fade * 1.5, e.cb * fade * 1.5, 0, 0, 0, 0);
        _ctr.set(e.x, e.y, e.z).addScaledVector(_nrm, 0.004);
        this.streak(this.streaks, _ctr, _tmp, r * 0.5, r * 0.15, e.cr * fade, e.cg * fade, e.cb * fade, 0.45, 0);
      } else {
        // a band of light lifting off the strings
        _tmp.addScaledVector(_nrm, 0.004 + 0.08 * amp * u);
        this.shape(S, _tmp, _Z, 0.006, Math.max(0.03, e.d * 0.8), e.cr * fade, e.cg * fade, e.cb * fade, 0, 0, 0, 0);
      }
    }
  }

  update(dt: number, feed: WaterfallFeed, frame: Object3D, resolve: Resolve): void {
    const calm = motion.calm;
    const amp = calm ? 0.5 : 1;
    const beat = feed.beatNow;
    const spb = feed.clock.spb > 0 ? feed.clock.spb : 0.6;
    frame.updateWorldMatrix(true, false);
    const e = frame.matrixWorld.elements;
    _X.set(e[0], e[1], e[2]).normalize();
    _U.set(e[4], e[5], e[6]).normalize();
    _Z.set(e[8], e[9], e[10]).normalize();
    _inv.copy(frame.matrixWorld).invert();
    for (const m of this.shapeMats) (m.uniforms.uX.value as Vector3).copy(_X);
    this.look.step(feed.display.combo ?? 0, dt, 4 * spb);
    const look = this.look;
    const gold = look.gold;

    const S = this.shapes;
    const H = this.halos;
    const T = this.streaks;
    S.n = H.n = T.n = 0;
    this.shades.n = 0;
    let guides = 0;
    let shown = 0;
    let pr = 0;
    let pg = 0;
    let pb = 0;
    let prevAhead = Number.NaN;
    let wantSet = false;
    const count = Math.min(feed.moteCount, feed.motes.length);
    for (let i = 0; i < count; i++) {
      const n = feed.motes[i];
      if (n.ahead > SHOW_BEATS) continue;
      if (!resolve(n.key, _p, _c, _t)) continue;
      // (a spotlight bar's notes: gold)
      if (n.gold) _c.lerp(_gold, 0.8);
      const form = formOf(n.key, _t.round);
      // the lane reaches every note this song plays (kit-local)
      _tmp.copy(_p).applyMatrix4(_inv);
      if (!wantSet && !this.want.set) {
        this.want.x0 = this.want.x1 = _tmp.x;
        this.want.y = _tmp.y;
        this.want.z = _tmp.z;
        this.want.set = true;
      }
      wantSet = true;
      this.want.x0 = Math.min(this.want.x0, _tmp.x);
      this.want.x1 = Math.max(this.want.x1, _tmp.x);
      this.want.y = Math.min(this.want.y, _tmp.y);
      this.want.z = Math.min(this.want.z, _tmp.z);
      pr += _c.r;
      pg += _c.g;
      pb += _c.b;
      shown++;
      const noteBeat = beat + n.ahead;
      const hit = n.grade === 'perfect' || n.grade === 'good';
      if (hit) {
        // a hit bursts once, where it lands, and the note is gone into it
        if (Number.isFinite(noteBeat) && this.burstMemo.mark(n.key, noteBeat)) this.burst(_p, _c, _t, form, n.grade === 'perfect');
        prevAhead = Number.NaN;
        continue;
      }
      const miss = n.grade === 'miss';
      const ash = miss ? Math.min(1, Math.max(0.08, -n.ahead / 0.55)) : 0;
      if (miss && ash >= 1) continue;
      if (miss && Number.isFinite(noteBeat) && this.ashMemo.mark(n.key, noteBeat)) this.ashes(_p, _t);
      const near = 1 - Math.min(1, Math.max(0, n.ahead) / SHOW_BEATS);
      let k = (0.35 + 0.65 * near) * (n.faint ? 0.3 : 1) * (1 - ash * 0.45);
      if (n.ahead < 0 && !miss) k *= Math.max(0.4, 1 + n.ahead * 2);
      notePath(pathOf(form), n.ahead, _path);
      // the approach: from the back for the arc, from the headstock for the neck
      _head.copy(_p).addScaledVector(_U, _path.up);
      if (form === 'arc') _head.addScaledVector(_Z, -_path.along);
      else if (form === 'neck') _head.addScaledVector(_X, -_path.along);
      if (ash > 0) _head.addScaledVector(_U, -0.012 * ash);
      _dir.copy(_U).multiplyScalar(_path.du);
      if (form === 'arc') _dir.addScaledVector(_Z, -_path.da);
      else if (form === 'neck') _dir.addScaledVector(_X, -_path.da);
      _dir.normalize();
      const cr = k * _c.r;
      const cg = k * _c.g;
      const cb = k * _c.b;
      let r: number;
      let len: number;
      if (form === 'ring') {
        // a ring lying on the surface (at its own lean), closing onto the target's edge on the beat, over a faint
        // disc of where to strike that fills in as it comes
        _nrm.set(_t.nx ?? 0, _t.ny ?? 0, _t.nz ?? 0);
        if (_nrm.lengthSq() < 0.5) _nrm.copy(_U);
        else _nrm.normalize();
        const R = Math.max(0.012, _t.w / 2);
        const a0 = Math.max(0, n.ahead);
        // (only the last two beats: it starts at 1.6 times the target and closes onto its edge on the beat)
        if (a0 > 2) {
          prevAhead = n.ahead;
          continue;
        }
        const rr = R * (1 + 0.6 * amp * (a0 / 2));
        // (brighter, and the core thicker, as it closes: you see it coming from the seat and feel the moment)
        const kr = Math.min(1.6, k * (1.1 + 0.9 * near));
        _ctr.copy(_p).addScaledVector(_nrm, 0.0025);
        // a dark band under it (it reads on any surface), the soft glow round it, then its bright core
        // (painted in its colour, with a dark edge either side, then its light on top)
        _tmp.copy(_ctr).addScaledVector(_nrm, -0.0004);
        this.shape(this.shades, _tmp, _nrm, rr * 1.015, rr * 1.015, 1, 1, 1, 3, ash, Math.min(0.6, 0.011 / rr + 0.04), 0);
        this.shape(this.shades, _ctr, _nrm, rr, rr, _c.r, _c.g, _c.b, 3, ash, Math.min(0.5, (0.004 + 0.003 * near) / rr + 0.02), Math.min(1, 0.55 + 0.45 * near));
        this.shape(S, _ctr, _nrm, rr * 1.04, rr * 1.04, _c.r * kr * 0.18, _c.g * kr * 0.18, _c.b * kr * 0.18, 3, ash, Math.min(0.6, 0.01 / rr + 0.04), 0);
        this.shape(S, _ctr, _nrm, rr, rr, _c.r * kr, _c.g * kr, _c.b * kr, 3, ash, Math.min(0.5, (0.004 + 0.003 * near) / rr + 0.02), gold);
        // the target: where to strike, filling in as it comes, and a bright edge the ring meets
        const fill = (0.05 + 0.18 * near * near) * (n.faint ? 0.3 : 1);
        _tmp.copy(_p).addScaledVector(_nrm, 0.0018);
        this.shape(S, _tmp, _nrm, R * 0.97, R * 0.97, _c.r * fill, _c.g * fill, _c.b * fill, 3, ash, 1, 0);
        this.shape(this.shades, _tmp, _nrm, R * 1.005, R * 1.005, 1, 1, 1, 3, ash, Math.min(0.5, 0.005 / R + 0.02), 0);
        // (the target painted in, its colour coming up to half strength as the ring arrives)
        const tf = 0.06 + 0.22 * near * near;
        this.shape(this.shades, _tmp, _nrm, R * 0.97, R * 0.97, _c.r * tf, _c.g * tf, _c.b * tf, 3, ash, 1, 1);
        this.shape(S, _tmp, _nrm, R, R, _c.r * fill * 1.6, _c.g * fill * 1.6, _c.b * fill * 1.6, 3, ash, Math.min(0.5, 0.0025 / R + 0.01), 0);
        // (a chord of rings: joined to the one before, so two at once read as one moment)
        if (Math.abs(n.ahead - prevAhead) < 0.02 && n.ahead > 0) this.streak(T, _prev, _ctr, 0.0011, 0.0011, cr, cg, cb, 0.4, 0.4);
        prevAhead = n.ahead;
        _prev.copy(_ctr);
        continue;
      }
      if (form === 'disc' || form === 'cymbal') {
        // a lens (or a crescent) facing you as it falls onto the head, and a ring on the head closing onto its rim
        r = Math.min(0.03, Math.max(0.014, (_t.w / 2) * 0.4));
        len = 0;
        _ctr.copy(_head).addScaledVector(_U, r * 0.6);
        this.shape(S, _ctr, _zero, r, r, cr, cg, cb, form === 'disc' ? 1 : 2, ash, 0, gold);
        if (n.ahead < 2.2 && !miss) {
          const rr = (_t.w / 2) * 0.96 * (1 + 0.55 * amp * Math.max(0, n.ahead));
          const a = (1 - Math.max(0, n.ahead) / 2.2) * 0.9;
          _tmp.copy(_p).addScaledVector(_U, 0.002);
          this.shape(S, _tmp, _U, rr, rr, cr * a, cg * a, cb * a, 3, 0, Math.min(0.5, 0.005 / rr + 0.02), 0);
        }
      } else if (form === 'strum') {
        // a bar of light lying across the strings
        r = 0.0055;
        len = Math.max(0.03, _t.d * 0.8);
        _ctr.copy(_head).addScaledVector(_U, r);
        this.shape(S, _ctr, _Z, r, len, cr, cg, cb, 0, ash, 0, gold);
      } else {
        r = form === 'neck' ? 0.0065 : Math.min(0.012, Math.max(0.0045, _t.w * 0.36));
        len = r + 0.013;
        _ctr.copy(_head).addScaledVector(_dir, -len);
        this.shape(S, _ctr, _dir, r, len, cr, cg, cb, 0, ash, 0, gold);
      }
      if (ash > 0) {
        prevAhead = Number.NaN;
        continue;
      }
      // the halo (wider as it nears, and with the streak), the comet trail behind it
      const nearer = near * near;
      const flat = form === 'disc' || form === 'cymbal';
      const hr = (flat ? r * 2.2 : r * 2.6 + 0.008) * (1 + 0.7 * nearer) * look.halo;
      const hk = (0.08 + 0.22 * nearer) * (n.faint ? 0.3 : 1);
      this.halo(_ctr, hr, _c.r * hk, _c.g * hk, _c.b * hk);
      if (n.ahead > 0.04) {
        const tw = flat ? r * 0.5 : form === 'strum' ? r : r * 1.3;
        _tmp.copy(_ctr).addScaledVector(form === 'strum' || flat ? _U : _dir, form === 'strum' || flat ? 0.06 : -(len + 0.06));
        this.streak(T, _ctr, _tmp, tw, tw * 0.3, cr, cg, cb, 0.5, 0);
      }
      // the line down which it falls (once per key)
      if (pathOf(form) === 'fall' && n.ahead > 0.1) {
        let dup = false;
        for (let g = 0; g < guides; g++) if (this.guideKeys[g] === n.key) dup = true;
        if (!dup && guides < MAX_NOTES) {
          this.guideKeys[guides++] = n.key;
          _tmp.copy(_p).addScaledVector(_U, SHOW_BEATS * FALL_PER_BEAT + 0.03);
          this.streak(T, _p, _tmp, 0.0012, 0.0012, _c.r, _c.g, _c.b, 0.09 * (n.faint ? 0.3 : 1), 0);
        }
      }
      // a chord: its notes joined head to head
      if (Math.abs(n.ahead - prevAhead) < 0.02 && n.ahead > 0) this.streak(T, _prev, _ctr, 0.0011, 0.0011, cr, cg, cb, 0.6, 0.6);
      prevAhead = n.ahead;
      _prev.copy(_ctr);
      // ×50: sparks trail every note
      if (look.trail > 0 && n.ahead > 0.1 && Math.random() < dt * 14 * look.trail) {
        const j = 0.05 * amp;
        this.sparks.spawn(_ctr.x, _ctr.y, _ctr.z, (Math.random() - 0.5) * j - _dir.x * 0.05, (Math.random() - 0.5) * j - _dir.y * 0.05, (Math.random() - 0.5) * j - _dir.z * 0.05, _c.r, _c.g, _c.b, 0.35, 0.0016, 0, 0.12);
      }
    }
    this.guideKeys.fill('', 0, guides);
    this.drawEmits(dt, amp);
    this.drawFx(dt, amp);
    this.drawSparks(dt);
    S.commit();
    this.shades.commit();
    H.commit();
    T.commit();
    this.landing.commit();
    this.sparkDraw.commit();
    this.drawAurora(dt, feed, shown, pr, pg, pb, wantSet, amp, frame);
  }

  /** A hit at `at` (world) in `col`, on a target the size of `t`: sparks, a ripple, the key flooding, a flash. */
  burst(at: Vector3, col: Color, t: NoteTarget, form: NoteForm, perfect: boolean): void {
    const amp = motion.calm ? 0.5 : 1;
    const flat = form === 'disc' || form === 'cymbal' || form === 'ring';
    const R = flat ? t.w / 2 : Math.max(t.w, 0.02) / 2;
    // the flash (fake bloom)
    _tmp.copy(at).addScaledVector(_U, 0.012);
    this.fx(Fx.Flash, _tmp, perfect ? 0.065 : 0.045, 0, col, perfect ? 1.4 : 1, 0.18);
    // the ripple: round on a head, spreading along the line on keys
    _tmp.copy(at).addScaledVector(_U, 0.003);
    if (flat) this.fx(Fx.Ring, _tmp, R, R, col, 1.2, 0.42);
    else this.fx(Fx.Ring, _tmp, R * 1.2, Math.min(t.d, 0.06) * 0.4, col, 1.2, 0.42);
    // the key floods (and bleeds into its neighbours); a head floods whole; a strum sweeps the strings
    _tmp.copy(at).addScaledVector(_U, 0.0025);
    if (form === 'strum') this.fx(Fx.Sweep, _tmp, t.w / 2, Math.max(t.d, 0.06) / 2, col, 1.6, 0.2);
    else if (flat || t.round) this.fx(Fx.FloodHead, _tmp, R * 0.98, R * 0.98, col, 0.9, 0.3);
    else this.fx(Fx.FloodKey, _tmp, t.w * 1.5, Math.min(t.d, 0.1) / 2, col, 1, 0.3);
    // sparks onto the key, skidding toward its front edge and off it
    const n = Math.round((perfect ? 20 : 12) * (motion.calm ? 0.5 : 1));
    const floor = flat || t.round ? R : Math.min(t.d, 0.16) / 2;
    const wr = perfect ? 0.55 : 0.25;
    const sr = col.r + (1 - col.r) * wr;
    const sg = col.g + (1 - col.g) * wr;
    const sb = col.b + (1 - col.b) * wr;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const out = (0.06 + Math.random() * 0.22) * amp;
      const up = (0.25 + Math.random() * 0.35) * amp;
      const fw = 0.12 * amp;
      const ox = Math.cos(a) * out;
      const oz = Math.sin(a) * out;
      this.sparks.spawn(
        at.x + _U.x * 0.006,
        at.y + _U.y * 0.006,
        at.z + _U.z * 0.006,
        _X.x * ox + _Z.x * (oz + fw) + _U.x * up,
        _X.y * ox + _Z.y * (oz + fw) + _U.y * up,
        _X.z * ox + _Z.z * (oz + fw) + _U.z * up,
        sr * 1.6,
        sg * 1.6,
        sb * 1.6,
        0.45 + Math.random() * 0.45,
        0.0018 + Math.random() * 0.0016,
        floor,
      );
    }
  }

  /** A miss: a few flakes of ash drift off it and down. */
  private ashes(at: Vector3, t: NoteTarget): void {
    const amp = motion.calm ? 0.5 : 1;
    for (let i = 0; i < (motion.calm ? 3 : 6); i++) {
      const s = (Math.random() - 0.5) * t.w * 0.8;
      this.sparks.spawn(
        at.x + _X.x * s + _U.x * 0.01,
        at.y + _X.y * s + _U.y * 0.01,
        at.z + _X.z * s + _U.z * 0.01,
        (_Z.x * 0.05 + (Math.random() - 0.5) * 0.03) * amp,
        (_Z.y * 0.05 + (Math.random() - 0.5) * 0.03) * amp,
        (_Z.z * 0.05 + (Math.random() - 0.5) * 0.03) * amp,
        0.22,
        0.22,
        0.24,
        0.8 + Math.random() * 0.4,
        0.0022,
        0,
        0.06,
      );
    }
  }

  private shape(b: Batch, p: Vector3, axis: Vector3, sx: number, sy: number, r: number, g: number, bl: number, shape: number, ash: number, z: number, gold: number): void {
    if (b.n >= b.cap) return;
    const i = b.n++;
    const [P, A, Sz, C, D] = b.f;
    P[i * 3] = p.x;
    P[i * 3 + 1] = p.y;
    P[i * 3 + 2] = p.z;
    A[i * 3] = axis.x;
    A[i * 3 + 1] = axis.y;
    A[i * 3 + 2] = axis.z;
    Sz[i * 2] = sx;
    Sz[i * 2 + 1] = sy;
    C[i * 3] = r;
    C[i * 3 + 1] = g;
    C[i * 3 + 2] = bl;
    D[i * 4] = shape;
    D[i * 4 + 1] = ash;
    D[i * 4 + 2] = z;
    D[i * 4 + 3] = gold;
  }

  private halo(p: Vector3, size: number, r: number, g: number, b: number): void {
    const H = this.halos;
    if (H.n >= H.cap) return;
    const i = H.n++;
    const [P, Sz, C] = H.f;
    P[i * 3] = p.x;
    P[i * 3 + 1] = p.y;
    P[i * 3 + 2] = p.z;
    Sz[i * 2] = size;
    Sz[i * 2 + 1] = size;
    C[i * 3] = r;
    C[i * 3 + 1] = g;
    C[i * 3 + 2] = b;
  }

  private streak(b: Batch, a: Vector3, z: Vector3, wa: number, wb: number, r: number, g: number, bl: number, aa: number, ab: number): void {
    this.streakXYZ(b, a.x, a.y, a.z, z.x, z.y, z.z, wa, wb, r, g, bl, aa, ab);
  }

  private streakXYZ(b: Batch, ax: number, ay: number, az: number, bx: number, by: number, bz: number, wa: number, wb: number, r: number, g: number, bl: number, aa: number, ab: number): void {
    if (b.n >= b.cap) return;
    const i = b.n++;
    const [A, B, W, C, Al] = b.f;
    A[i * 3] = ax;
    A[i * 3 + 1] = ay;
    A[i * 3 + 2] = az;
    B[i * 3] = bx;
    B[i * 3 + 1] = by;
    B[i * 3 + 2] = bz;
    W[i * 2] = wa;
    W[i * 2 + 1] = wb;
    C[i * 3] = r;
    C[i * 3 + 1] = g;
    C[i * 3 + 2] = bl;
    Al[i * 2] = aa;
    Al[i * 2 + 1] = ab;
  }

  private fx(kind: Fx, p: Vector3, sx: number, sy: number, col: Color, k: number, life: number): void {
    const i = this.fxNext;
    this.fxNext = (i + 1) % FX;
    this.fxKind[i] = kind;
    this.fxP[i * 3] = p.x;
    this.fxP[i * 3 + 1] = p.y;
    this.fxP[i * 3 + 2] = p.z;
    this.fxS[i * 2] = sx;
    this.fxS[i * 2 + 1] = sy;
    this.fxC[i * 3] = col.r * k;
    this.fxC[i * 3 + 1] = col.g * k;
    this.fxC[i * 3 + 2] = col.b * k;
    this.fxAge[i] = 0;
    this.fxLife[i] = life;
  }

  private drawFx(dt: number, amp: number): void {
    const L = this.landing;
    L.n = 0;
    for (let i = 0; i < FX; i++) {
      if (this.fxAge[i] >= this.fxLife[i]) continue;
      this.fxAge[i] += dt;
      const a = Math.min(1, this.fxAge[i] / this.fxLife[i]);
      const kind = this.fxKind[i];
      _tmp.set(this.fxP[i * 3], this.fxP[i * 3 + 1], this.fxP[i * 3 + 2]);
      let sx = this.fxS[i * 2];
      let sy = this.fxS[i * 2 + 1];
      let k: number;
      let shape: number;
      let z = 0;
      if (kind === Fx.Flash) {
        k = (1 - a) * (1 - a);
        this.halo(_tmp, sx * (0.7 + 0.5 * a), this.fxC[i * 3] * k, this.fxC[i * 3 + 1] * k, this.fxC[i * 3 + 2] * k);
        continue;
      }
      if (kind === Fx.Ring) {
        // spreading out, mostly along the line, and fading
        const e = 1 - Math.pow(1 - a, 2);
        sx += 0.07 * amp * e;
        sy += 0.02 * amp * e;
        k = 1 - a;
        shape = 3;
        z = 0.12;
      } else if (kind === Fx.Sweep) {
        k = 1 - a * a;
        shape = 6;
        z = a;
      } else {
        // full for 120 ms, then away
        const t = this.fxAge[i];
        k = t < 0.12 ? 1 : Math.max(0, 1 - (t - 0.12) / (this.fxLife[i] - 0.12));
        shape = kind === Fx.FloodKey ? 4 : 5;
      }
      this.shape(L, _tmp, _U, sx, sy, this.fxC[i * 3] * k, this.fxC[i * 3 + 1] * k, this.fxC[i * 3 + 2] * k, shape, 0, z, 0);
    }
  }

  private drawSparks(dt: number): void {
    const P = this.sparks;
    P.step(dt, _U.x, _U.y, _U.z);
    const D = this.sparkDraw;
    D.n = 0;
    for (let i = 0; i < P.cap; i++) {
      if (P.age[i] >= P.life[i]) continue;
      const j = i * 3;
      const a = P.age[i] / P.life[i];
      const k = (1 - a) * (1 - a * 0.5);
      // a short streak along its motion (a spark is its own motion blur)
      const s = 0.022;
      this.streakXYZ(D, P.p[j], P.p[j + 1], P.p[j + 2], P.p[j] - P.v[j] * s, P.p[j + 1] - P.v[j + 1] * s, P.p[j + 2] - P.v[j + 2] * s, P.size[i], P.size[i] * 0.3, P.col[j], P.col[j + 1], P.col[j + 2], k, 0);
    }
  }

  private drawAurora(dt: number, feed: WaterfallFeed, shown: number, pr: number, pg: number, pb: number, seen: boolean, amp: number, frame: Object3D): void {
    const u = this.auroraMat.uniforms;
    const playing = feed.mode === 'play' || feed.mode === 'count';
    this.idle = seen || (playing && this.want.set) ? 0 : this.idle + dt;
    // a new song starts the lane afresh
    if (this.idle > 2 && (this.want.set || this.palSeen)) {
      this.want.set = false;
      this.palSeen = false;
      this.look.reset();
      this.burstMemo.clear();
      this.ashMemo.clear();
    }
    const on = this.want.set && this.idle < 1.5;
    this.auroraOp += ((on ? 0.2 + 0.08 * this.look.trail : 0) - this.auroraOp) * Math.min(1, dt * 3);
    if (this.auroraOp < 0.002 || !this.want.set) {
      this.aurora.matrix.makeScale(0, 0, 0);
      return;
    }
    // the lane: as wide as the notes reach (eased, so it grows smoothly), behind the back-most, from the lowest
    const L = this.lane;
    const w = this.want;
    const ease = Math.min(1, dt * 3);
    // (centred on the instrument, so a part on a few keys still gets the whole lane)
    const cx = 0;
    const hw = Math.max(0.22, Math.max(-w.x0, w.x1) + 0.09);
    L.x0 += (cx - hw - L.x0) * ease;
    L.x1 += (cx + hw - L.x1) * ease;
    L.y += (w.y - 0.01 - L.y) * ease;
    L.z += (w.z - 0.09 - L.z) * ease;
    const height = 0.34;
    _q.setFromAxisAngle(_ax, TILT);
    _lm.compose(_tmp.set((L.x0 + L.x1) / 2, L.y, L.z), _q, _s.set(L.x1 - L.x0, height, 1));
    this.aurora.matrix.multiplyMatrices(frame.matrixWorld, _lm);
    this.aurora.matrixWorldNeedsUpdate = true;
    // the song's colours: what's falling, and a neighbour hue (shifting a little each section)
    const beat = feed.beatNow;
    const section = Number.isFinite(beat) ? Math.floor(Math.max(0, beat) / 32) : 0;
    if (shown) {
      _c.setRGB(pr / shown, pg / shown, pb / shown);
      if (!this.palSeen) _palA.copy(_c);
      else _palA.lerp(_c, Math.min(1, dt * 1.5));
      this.palSeen = true;
    }
    // (kept saturated: an even mix of a kit's colours would average to grey fog)
    _palA.getHSL(_hsl);
    _palA.setHSL(_hsl.h, Math.max(0.75, _hsl.s), 0.5);
    _palB.setHSL((_hsl.h + 0.11 + section * 0.035) % 1, 0.8, 0.55);
    _c.copy(_palA).lerp(_white, 0.08);
    (u.uA.value as Vector3).set(_c.r, _c.g, _c.b);
    (u.uB.value as Vector3).set(_palB.r, _palB.g, _palB.b);
    this.auroraT += dt * amp * (1 + 1.4 * this.look.trail);
    u.uT.value = this.auroraT;
    u.uOp.value = this.auroraOp;
    u.uBow.value = height * 0.06 * amp;
    // the beat line (brighter with the streak), the section band, the count-in filling it from the bottom
    u.uBeat.value = Number.isFinite(beat) ? beat : 0;
    u.uLines.value = Number.isFinite(beat) && beat > -4 ? (0.35 + 0.45 * this.look.gold) * (motion.calm ? 0.6 : 1) : 0;
    const inSection = Number.isFinite(beat) && beat >= 0 ? (beat % 32) / 2 : -1;
    u.uBand.value = inSection >= 0 && inSection < 1 && section > 0 ? inSection : -1;
    u.uFill.value = feed.mode === 'count' && Number.isFinite(beat) ? Math.max(0, Math.min(1.1, 1 + beat / 4 + 0.05)) : 1.2;
  }
}
