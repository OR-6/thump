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
const TRAIL = 3;
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
    this.mesh = new InstancedMesh(new SphereGeometry(1, 12, 8), asLight(new MeshBasicMaterial({ toneMapped: false })), MAX * TRAIL);
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
      if (m.ahead < 0 && hit) continue;
      if (!resolve(m.key, _to, _base)) continue;
      const span = from.distanceTo(_to);
      const arc = Math.min(0.25, span * 0.35);
      for (let t = 0; t < TRAIL; t++) {
        // the head, then two fading trail points a little behind it
        const lag = t * 0.045;
        const s = Math.min(1, Math.max(0, 1 - m.ahead / TIMING.travelBeats - lag));
        _p.lerpVectors(from, _to, s);
        _p.y += Math.sin(s * Math.PI) * arc;
        let size = (0.009 + 0.004 * s) * (1 - t * 0.3);
        let bright = (0.55 + 0.45 * s) * (1 - t * 0.35);
        if (m.ahead < 0) {
          const f = Math.max(0, 1 + m.ahead / 0.6);
          size *= f;
          bright *= f * 0.6;
        }
        if (s < 0.05) size *= s / 0.05;
        if (size <= 0.0005) continue;
        _m.compose(_p, _q.identity(), _s.setScalar(size));
        this.mesh.setMatrixAt(k, _m);
        this.mesh.setColorAt(k, _c.copy(_base).multiplyScalar(bright));
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
