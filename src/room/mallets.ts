/**
 * The bandmate's mallets: two sticks of light that rest crossed on the module, fly in an arc to the bar or drum
 * the bandmate plays, strike it exactly on the note (a quick dip into the surface and back), and settle home
 * between phrases. They make the bandmate someone at the table, not a voice from nowhere.
 */
import { Color, Group, Matrix4, Mesh, MeshBasicMaterial, Quaternion, SphereGeometry, CylinderGeometry, Vector3 } from '@iwsdk/core';
import { asLight } from '../art/light.js';

/** Seconds a mallet takes to fly to its next note (it leaves this long before the note). */
const FLY_S = 0.32;
/** How long after its last note a mallet waits before going home. */
const HOME_AFTER_S = 0.9;
const MAX_QUEUE = 24;

interface Strike {
  t: number;
  at: Vector3;
  /** The surface's normal there (the mallet comes in along it). */
  n: Vector3;
}

const _a = new Vector3();
const _b = new Vector3();
const _up = new Vector3(0, 1, 0);
const _q = new Quaternion();
const _m = new Matrix4();

class Mallet {
  readonly group = new Group();
  readonly head: Mesh;
  readonly pos = new Vector3();
  /** Where it was when it set off for the next note. */
  private from = new Vector3();
  private fromT = 0;
  queue: Strike[] = [];
  private lastHit: Strike | null = null;
  private lastHitT = -9;

  constructor(color: number, shaftGeo: CylinderGeometry, headGeo: SphereGeometry) {
    const mat = asLight(new MeshBasicMaterial({ color: new Color(color).multiplyScalar(0.55), toneMapped: false, transparent: true }));
    const shaft = new Mesh(shaftGeo, mat);
    // the shaft runs back from the head toward you (the head leads, along +z)
    shaft.position.z = -0.06;
    shaft.rotation.x = Math.PI / 2;
    this.head = new Mesh(headGeo, asLight(new MeshBasicMaterial({ color, toneMapped: false })));
    this.group.add(shaft, this.head);
    this.group.visible = false;
  }

  /** Where it is at time t, flying from its last place to the next note's spot, striking on the note. */
  private placed = false;
  /** Turned this far from the module's line at rest (the two lie crossed). */
  restYaw = 0;
  update(t: number, rest: Vector3, restDir: Vector3, head: Vector3): void {
    // the first time: they start where they rest
    if (!this.placed) {
      this.placed = true;
      this.pos.copy(rest);
      this.from.copy(rest);
    }
    // drop notes already struck
    while (this.queue.length && this.queue[0].t < t - 0.12) {
      this.lastHit = this.queue.shift()!;
      this.lastHitT = this.lastHit.t;
      this.from.copy(this.pos);
      this.fromT = t;
    }
    const next = this.queue[0];
    if (next) {
      const start = next.t - FLY_S;
      if (t < start) {
        // waiting: hover a little above where it last struck (or at rest)
        if (!this.lastHit || t - this.lastHitT > HOME_AFTER_S) this.goHome(t, rest);
        else this.hover(this.lastHit, t);
      } else {
        if (this.fromT < start) {
          this.from.copy(this.pos);
          this.fromT = start;
        }
        const k = Math.min(1, (t - start) / FLY_S);
        // an arc out from the surface, coming in along its normal; a quick dip into it on the note
        const e = k * k * (3 - 2 * k);
        _a.copy(next.at).addScaledVector(next.n, 0.06);
        this.pos.lerpVectors(this.from, _a, e);
        this.pos.y += Math.sin(Math.PI * e) * Math.min(0.25, this.from.distanceTo(_a) * 0.3);
        const dt = t - next.t;
        if (Math.abs(dt) < 0.07) this.pos.copy(next.at).addScaledVector(next.n, 0.06 * (Math.abs(dt) / 0.07) + 0.004);
      }
      this.group.visible = true;
    } else if (this.lastHit && t - this.lastHitT < HOME_AFTER_S) {
      this.hover(this.lastHit, t);
    } else this.goHome(t, rest);
    // point the head at what it's about to hit (or along the module at rest), the shaft trailing back toward you
    this.group.position.copy(this.pos);
    const resting = !next && (!this.lastHit || t - this.lastHitT > HOME_AFTER_S);
    if (resting) _b.copy(restDir).applyAxisAngle(_up, this.restYaw);
    else _b.copy(next ? next.at : this.pos).sub(head).setY(0);
    if (_b.lengthSq() < 1e-6) _b.copy(restDir);
    _m.lookAt(_a.copy(this.pos).add(_b.normalize()), this.pos, _up);
    _q.setFromRotationMatrix(_m);
    this.group.quaternion.slerp(_q, 0.35);
  }

  private hover(s: Strike, t: number): void {
    _a.copy(s.at).addScaledVector(s.n, 0.07 + 0.01 * Math.sin(t * 3));
    this.pos.lerp(_a, 0.15);
  }

  private goHome(t: number, rest: Vector3): void {
    this.pos.lerp(rest, 0.08);
    void t;
  }
}

export class Mallets {
  readonly group = new Group();
  private m: [Mallet, Mallet];
  private turn = 0;
  private restA = new Vector3();
  private restB = new Vector3();
  private restDir = new Vector3(1, 0, 0);
  private shown = false;

  constructor() {
    const shaft = new CylinderGeometry(0.0035, 0.0035, 0.12, 8);
    const head = new SphereGeometry(0.011, 12, 8);
    this.m = [new Mallet(0xfff2dc, shaft, head), new Mallet(0xfff2dc, shaft, head)];
    this.m[0].restYaw = 0.4;
    this.m[1].restYaw = -0.4 + Math.PI;
    for (const x of this.m) this.group.add(x.group);
    this.group.name = 'Mallets';
  }

  /** The bandmate plays a note at time t, at world point `at` on a surface facing `n`. */
  strike(t: number, at: Vector3, n: Vector3): void {
    // alternate hands, unless one is already busy right then
    const a = this.m[this.turn];
    const b = this.m[1 - this.turn];
    const free = (x: Mallet) => !x.queue.length || x.queue[x.queue.length - 1].t < t - FLY_S;
    const use = free(a) ? a : free(b) ? b : a;
    this.turn = use === a ? 1 - this.turn : this.turn;
    if (use.queue.length >= MAX_QUEUE) return;
    use.queue.push({ t, at: at.clone(), n: n.clone() });
    this.shown = true;
  }

  /** Clear (the jam ended). They go home. */
  clear(): void {
    for (const x of this.m) x.queue.length = 0;
  }

  /** Hide them altogether (a song, the settings). */
  hide(): void {
    this.clear();
    this.shown = false;
    for (const x of this.m) x.group.visible = false;
  }

  /** Rest crossed on the module (`left`/`right` world points along its top, `dir` along it). */
  update(t: number, left: Vector3, right: Vector3, dir: Vector3, head: Vector3): void {
    if (!this.shown) return;
    this.restA.copy(left);
    this.restB.copy(right);
    this.restDir.copy(dir);
    this.m[0].update(t, this.restA, this.restDir, head);
    this.m[1].update(t, this.restB, this.restDir, head);
    for (const x of this.m) x.group.visible = true;
  }
}
