/**
 * When to hit, at a glance (as a rhythm game's approach circle): each note coming is a ring in the shape of what plays
 * it (round for a drum, a conga, a handpan note; a rounded rectangle for a key, a bar, the strings) that closes onto
 * it, from nearly twice its size two beats ahead to its exact outline on the beat, brightening as it closes, in the
 * part's colour (gold in a spotlight bar) over a dark edge so it reads on a white head. Then the hit flash (hit-fx.ts)
 * bursts out of that same outline. One mesh for all of them, its vertices rewritten in place: one draw, nothing
 * allocated per frame.
 */
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Mesh, MeshBasicMaterial, Quaternion, Vector3, type Object3D } from '@iwsdk/core';
import type { PartShape } from './hit-fx.js';
import { BRAND, hexNum } from '../ui/theme.js';

/** Beats ahead a ring appears. */
export const LEAD_BEATS = 2;
/** How big it starts (× the part). */
const START = 1.85;
const K = 8;
const P = 4 * (K + 1);
const SLOTS = 14;
/** Per slot: a dark edge band and the ring band, each P quads (2P vertices). */
const VPS = 4 * P;

export interface ApproachNote {
  key: string;
  /** Beats until due (+) or since (−). */
  ahead: number;
  grade: unknown;
  gold?: boolean;
  faint?: boolean;
}
export interface ApproachFeed {
  readonly motes: readonly ApproachNote[];
  readonly moteCount: number;
  readonly mode: string;
}
/** Where and what shape `key` is (world), and its colour; false: nothing to show for it. */
export type ShapeOf = (key: string, s: PartShape, col: Color) => boolean;

const _l = new Vector3();
const _c = new Color();
const GOLD = new Color(0xffd23f);
const EDGE = new Color(hexNum(BRAND.plum));

export class ApproachRings {
  readonly mesh: Mesh;
  private pos: Float32Array;
  private col: Float32Array;
  private shape: PartShape = { at: new Vector3(), q: new Quaternion(), w: 0, d: 0, round: true };
  private used = 0;

  constructor(parent: Object3D) {
    const g = new BufferGeometry();
    this.pos = new Float32Array(SLOTS * VPS * 3);
    this.col = new Float32Array(SLOTS * VPS * 4);
    g.setAttribute('position', new BufferAttribute(this.pos, 3));
    g.setAttribute('color', new BufferAttribute(this.col, 4));
    const idx: number[] = [];
    for (let s = 0; s < SLOTS; s++)
      for (const band of [0, 1]) {
        const b = s * VPS + band * 2 * P;
        for (let i = 0; i < P; i++) {
          const j = (i + 1) % P;
          idx.push(b + i, b + P + i, b + j, b + j, b + P + i, b + P + j);
        }
      }
    g.setIndex(idx);
    this.mesh = new Mesh(g, new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, depthTest: false, toneMapped: false, side: DoubleSide }));
    this.mesh.name = 'ApproachRings';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 11;
    this.mesh.visible = false;
    parent.add(this.mesh);
  }

  /** Write one band (from radius offset o0 to o1 past the part's outline) of slot `s`, in colour `c` at alpha `a`. */
  private band(s: number, band: number, sh: PartShape, hw: number, hd: number, r: number, o0: number, o1: number, c: Color, a: number): void {
    const base = s * VPS + band * 2 * P;
    const cx = [hw - r, -(hw - r), -(hw - r), hw - r];
    const cz = [hd - r, hd - r, -(hd - r), -(hd - r)];
    for (const [row, o] of [[0, o0], [1, o1]] as const) {
      const rr = Math.max(0.0005, r + o);
      let n = base + row * P;
      for (let q = 0; q < 4; q++)
        for (let k = 0; k <= K; k++) {
          const ang = (q + k / K) * (Math.PI / 2);
          _l.set(cx[q] + Math.cos(ang) * rr, 0.0015, cz[q] + Math.sin(ang) * rr).applyQuaternion(sh.q).add(sh.at);
          this.pos[n * 3] = _l.x;
          this.pos[n * 3 + 1] = _l.y;
          this.pos[n * 3 + 2] = _l.z;
          this.col[n * 4] = c.r;
          this.col[n * 4 + 1] = c.g;
          this.col[n * 4 + 2] = c.b;
          this.col[n * 4 + 3] = a;
          n++;
        }
    }
  }

  update(feed: ApproachFeed, shapeOf: ShapeOf, calm: boolean, waitKey = '', t = 0, paused = false): void {
    let s = 0;
    if (feed.mode === 'play' || feed.mode === 'count') {
      const count = Math.min(feed.moteCount, feed.motes.length);
      for (let i = 0; i < count && s < SLOTS; i++) {
        const n = feed.motes[i];
        // (a miss: its ring goes grey and sinks inside the part as it fades; any other grade, it's done)
        const miss = n.grade === 'miss';
        if ((n.grade && !miss) || n.faint || n.ahead > LEAD_BEATS || n.ahead < (miss ? -0.6 : -0.25)) continue;
        if (!shapeOf(n.key, this.shape, _c)) continue;
        if (n.gold) _c.lerp(GOLD, 0.85);
        if (miss) _c.setRGB(0.55, 0.52, 0.6);
        const sh = this.shape;
        const u = Math.max(0, n.ahead) / LEAD_BEATS;
        // (closing: steady in speed, so its last beat reads like a count; past due it holds on the outline and fades)
        const grow = miss && n.ahead < 0 ? Math.max(0.55, 1 + n.ahead * 0.6) : 1 + (START - 1) * u;
        const hw = (sh.w / 2) * grow;
        const hd = ((sh.round ? sh.w : sh.d) / 2) * grow;
        const r = sh.round ? hw : Math.min(hw, hd) * 0.35;
        const a = n.ahead < 0 ? Math.max(0, 1 + n.ahead / (miss ? 0.6 : 0.25)) * (miss ? 0.8 : 1) : 0.3 + 0.7 * (1 - u) * (1 - u * 0.3);
        // thicker as it lands (5.5 → 7 mm), so the moment it meets the edge is the thing you see
        let w = (calm ? 0.005 : 0.0055) + 0.0015 * (1 - u);
        // (the note a lesson is waiting on: its ring sits on the edge and beats, so it's plainly the one)
        if (waitKey && n.key === waitKey && n.ahead <= 0.05) w *= 1.3 + 0.35 * Math.sin(t * 9);
        // (paused: everything waits, quietly)
        const al = paused ? a * 0.25 : a;
        this.band(s, 0, sh, hw, hd, r, -0.0015, w + 0.0015, EDGE, al * 0.6);
        this.band(s, 1, sh, hw, hd, r, 0, w, _c, al);
        s++;
      }
    }
    // the slots left over: nothing (collapsed, clear)
    for (let k = s; k < this.used; k++) {
      this.pos.fill(0, k * VPS * 3, (k + 1) * VPS * 3);
      this.col.fill(0, k * VPS * 4, (k + 1) * VPS * 4);
    }
    if (s || this.used) {
      (this.mesh.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
      (this.mesh.geometry.getAttribute('color') as BufferAttribute).needsUpdate = true;
    }
    this.used = s;
    this.mesh.visible = s > 0;
  }
}
