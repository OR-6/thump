/**
 * Notes falling onto the instrument (the waterfall): each note in a song drops straight down onto the key, bar, field
 * or drum that plays it, the size and shape of its target (a bar the width of a key, a disc the size of a drum), in
 * its instrument's colour, with a faint beam above it, landing on the beat. Hit, it bursts into the target; missed,
 * it dims where it landed. Three draws for all of them; no allocation per frame.
 */
import { BoxGeometry, Color, CylinderGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from '@iwsdk/core';
import { asLight } from '../art/light.js';
import type { MoteView } from '../play/game.js';

const MAX = 48;
/** How far a note falls per beat (m), and how many beats ahead it shows. */
export const FALL_PER_BEAT = 0.07;
export const SHOW_BEATS = 3;

/** A note's target: where (world), its colour, its size (m) and whether it's round. */
export interface NoteTarget {
  w: number;
  d: number;
  round: boolean;
}

const _m = new Matrix4();
const _p = new Vector3();
const _s = new Vector3();
const _c = new Color();
const _up = new Vector3();
const _white = new Color(0xffffff);
const _t: NoteTarget = { w: 0, d: 0, round: false };

export class Waterfall {
  readonly slabs: InstancedMesh;
  readonly discs: InstancedMesh;
  readonly beams: InstancedMesh;

  constructor() {
    // light that only ever brightens what you see (over passthrough a plain additive blend would darken it)
    const mat = () => asLight(new MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    this.slabs = new InstancedMesh(new BoxGeometry(1, 1, 1), mat(), MAX);
    this.discs = new InstancedMesh(new CylinderGeometry(0.5, 0.5, 1, 28), mat(), MAX);
    this.beams = new InstancedMesh(new BoxGeometry(1, 1, 1), mat(), MAX);
    (this.beams.material as MeshBasicMaterial).opacity = 0.18;
    for (const m of [this.slabs, this.discs, this.beams]) {
      m.frustumCulled = false;
      m.count = 0;
      m.renderOrder = 6;
      m.name = 'Waterfall';
    }
    // (each one's colour buffer made now, so the first falling note doesn't build a new shader mid-song)
    for (const m of [this.slabs, this.discs, this.beams]) m.setColorAt(0, _c.setHex(0xffffff));
    this.slabs.name = 'WaterfallSlabs';
    this.discs.name = 'WaterfallDiscs';
    this.beams.name = 'WaterfallBeams';
  }

  /**
   * Draw the notes. `q` is the desk's orientation (notes fall along its up), `resolve` finds a key's target.
   */
  update(notes: readonly MoteView[], count: number, q: Quaternion, resolve: (key: string, at: Vector3, col: Color, t: NoteTarget) => boolean): void {
    let ns = 0;
    let nd = 0;
    let nb = 0;
    _up.set(0, 1, 0).applyQuaternion(q);
    for (let i = 0; i < count; i++) {
      const n = notes[i];
      const hit = n.grade === 'perfect' || n.grade === 'good';
      if (n.ahead > SHOW_BEATS || (n.ahead < -0.6 && !hit)) continue;
      if (!resolve(n.key, _p, _c, _t)) continue;
      // brighter as it nears; a hit bursts on the frame you hit it (on the target, wider, white, gone in a moment);
      // a miss dims where it landed
      let k = 0.35 + 0.65 * (1 - Math.min(1, Math.max(0, n.ahead) / SHOW_BEATS));
      let grow = 1;
      let landed = false;
      if (hit) {
        const a = Math.min(1, Math.max(0, n.since ?? -n.ahead) / 0.22);
        if (a >= 1) continue;
        k = 1 - a;
        grow = 1 + a * (n.grade === 'perfect' ? 1.0 : 0.4);
        _c.lerp(_white, n.grade === 'perfect' ? 0.85 : 0.4);
        landed = true;
      } else if (n.ahead < -0.2) k *= Math.max(0, 1 + (n.ahead + 0.2) / 0.4) * 0.4;
      if (k <= 0.01) continue;
      _c.multiplyScalar(k);
      const h = landed ? 0.004 : Math.max(0, n.ahead) * FALL_PER_BEAT + 0.004;
      const at = _p.addScaledVector(_up, h);
      const w = _t.w * 0.86 * grow;
      const d = (_t.round ? _t.w : Math.min(_t.d, 0.045)) * 0.86 * grow;
      _m.compose(at, q, _s.set(w, 0.007, d));
      if (_t.round) {
        if (nd < MAX) {
          this.discs.setMatrixAt(nd, _m);
          this.discs.setColorAt(nd++, _c);
        }
      } else if (ns < MAX) {
        this.slabs.setMatrixAt(ns, _m);
        this.slabs.setColorAt(ns++, _c);
      }
      // a faint beam above it, down which it falls
      if (n.ahead > 0.1 && nb < MAX) {
        const len = SHOW_BEATS * FALL_PER_BEAT - h;
        if (len > 0.01) {
          _m.compose(at.addScaledVector(_up, len / 2 + 0.004), q, _s.set(Math.min(w, 0.03) * 0.35, len, Math.min(d, 0.03) * 0.35));
          this.beams.setMatrixAt(nb, _m);
          this.beams.setColorAt(nb++, _c.multiplyScalar(0.6));
        }
      }
    }
    this.slabs.count = ns;
    this.discs.count = nd;
    this.beams.count = nb;
    for (let i = 0; i < 3; i++) {
      const m = i === 0 ? this.slabs : i === 1 ? this.discs : this.beams;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}
