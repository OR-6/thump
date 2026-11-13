/**
 * Travelling notes as light (DESIGN.md §3.6): each note is a mote with a short trail that leaves the module
 * and flies in a low arc across your real room to the exact pad, bar or key that will play it, arriving
 * on the beat; in its last beat a ring closes onto the target. Hit on time, it vanishes into the target;
 * missed, it fades where it landed. Two draws for all of them.
 */
import { Color, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, RingGeometry, SphereGeometry, Vector3 } from '@iwsdk/core';
import { asLight } from '../art/light.js';
import { TIMING } from '../config.js';
import type { MoteView } from '../play/game.js';

const MAX = 40;
/** Beads per note: a bright head and a tapering tail ~15 cm long (and, once it lands, its sparks). */
const TRAIL = 9;
const SPARKS = 6;
const _white = new Color(0xffffff);
const _m = new Matrix4();
const _look = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _c = new Color();
const _base = new Color();
const _to = new Vector3();
const _up = new Vector3(0, 1, 0);

export class Motes {
  readonly mesh: InstancedMesh;
  readonly rings: InstancedMesh;

  constructor() {
    this.mesh = new InstancedMesh(new SphereGeometry(1, 10, 6), asLight(new MeshBasicMaterial({ toneMapped: false })), MAX * TRAIL);
    this.mesh.name = 'Motes';
    this.rings = new InstancedMesh(new RingGeometry(0.82, 1, 40), asLight(new MeshBasicMaterial({ toneMapped: false })), MAX);
    this.rings.name = 'MoteRings';
    for (const m of [this.mesh, this.rings]) {
      m.frustumCulled = false;
      m.count = 0;
      m.renderOrder = 6;
    }
    for (let i = 0; i < MAX * TRAIL; i++) this.mesh.setColorAt(i, _c.setHex(0xffffff));
    for (let i = 0; i < MAX; i++) this.rings.setColorAt(i, _c.setHex(0xffffff));
    this.mesh.add(this.rings);
  }

  /**
   * @param from world point the motes leave from (the module)
   * @param head the viewer (rings face it)
   * @param resolve a key's world target and colour; false when it has none
   */
  update(motes: readonly MoteView[], count: number, from: Vector3, head: Vector3, resolve: (key: string, out: Vector3, col: Color) => boolean): void {
    let k = 0;
    let r = 0;
    for (let i = 0; i < count && k < MAX * TRAIL; i++) {
      const m = motes[i];
      const hit = m.grade === 'perfect' || m.grade === 'good';
      if (!resolve(m.key, _to, _base)) continue;
      if (m.ahead < 0 && hit) {
        // played: it bursts into sparks on the target, facing you, gone in a moment
        const age = -m.ahead;
        if (age > 0.5 || k + SPARKS > MAX * TRAIL) continue;
        const e = 1 - Math.pow(1 - age / 0.5, 2);
        _look.lookAt(head, _to, _up);
        _q.setFromRotationMatrix(_look);
        for (let q = 0; q < SPARKS; q++) {
          const a = (q / SPARKS) * Math.PI * 2 + i;
          _p.set(Math.cos(a) * (0.02 + 0.07 * e), Math.sin(a) * (0.02 + 0.07 * e), 0).applyQuaternion(_q).add(_to);
          _m.compose(_p, _q.identity(), _s.setScalar(0.006 * (1 - e) + 0.001));
          this.mesh.setMatrixAt(k, _m);
          this.mesh.setColorAt(k, _c.copy(_base).lerp(_white, 0.5 * (1 - e)).multiplyScalar(1 - e));
          k++;
          _q.setFromRotationMatrix(_look);
        }
        continue;
      }
      const span = from.distanceTo(_to);
      const arc = Math.min(0.25, span * 0.35);
      // the tail is about 15 cm long whatever the distance
      const step = Math.min(0.06, 0.15 / Math.max(0.2, span) / (TRAIL - 1));
      for (let t = 0; t < TRAIL; t++) {
        // the head (white-hot at its core), then a tail that tapers and fades behind it
        const lag = t * step;
        const s = Math.min(1, Math.max(0, 1 - m.ahead / TIMING.travelBeats - lag));
        _p.lerpVectors(from, _to, s);
        _p.y += Math.sin(s * Math.PI) * arc;
        const taper = 1 - t / TRAIL;
        let size = (t === 0 ? 0.013 + 0.004 * s : (0.007 + 0.003 * s) * taper);
        let bright = (0.55 + 0.45 * s) * (t === 0 ? 1 : 0.8 * taper * taper);
        if (m.ahead < 0) {
          const f = Math.max(0, 1 + m.ahead / 0.6);
          size *= f;
          bright *= f * 0.6;
        }
        if (s < 0.05) size *= s / 0.05;
        if (size <= 0.0005) continue;
        _m.compose(_p, _q.identity(), _s.setScalar(size));
        this.mesh.setMatrixAt(k, _m);
        this.mesh.setColorAt(k, (t === 0 ? _c.copy(_base).lerp(_white, 0.45) : _c.copy(_base)).multiplyScalar(bright));
        k++;
      }
      // its last beat: a ring closes onto the target, facing you
      if (m.ahead >= 0 && m.ahead <= 1 && r < MAX) {
        _look.lookAt(head, _to, _up);
        _q.setFromRotationMatrix(_look);
        _m.compose(_to, _q, _s.setScalar(0.018 + 0.05 * m.ahead));
        this.rings.setMatrixAt(r, _m);
        this.rings.setColorAt(r, _c.copy(_base).multiplyScalar(0.35 + 0.65 * (1 - m.ahead)));
        r++;
      }
    }
    this.mesh.count = k;
    this.rings.count = r;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.rings.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
  }
}
