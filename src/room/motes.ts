/**
 * Travelling notes as light (PLAN §3.6): each note is a small mote that leaves the module and flies in
 * a low arc across your real room to the exact pad, bar or key that will play it, arriving on the beat.
 * Hit on time, it vanishes into its target; missed, it fades where it landed. One draw for all of them.
 */
import { Color, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, SphereGeometry, Vector3 } from '@iwsdk/core';
import { asLight } from '../art/light.js';
import { TIMING } from '../config.js';
import type { MoteView } from '../play/game.js';

const MAX = 40;
const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _c = new Color();
const _to = new Vector3();

export class Motes {
  readonly mesh: InstancedMesh;

  constructor() {
    this.mesh = new InstancedMesh(new SphereGeometry(1, 12, 8), asLight(new MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false })), MAX);
    this.mesh.name = 'Motes';
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 6;
    for (let i = 0; i < MAX; i++) this.mesh.setColorAt(i, _c.setHex(0xffffff));
  }

  /**
   * @param from world point the motes leave from (the module)
   * @param resolve a key's world target and colour; false when it has none
   */
  update(motes: readonly MoteView[], count: number, from: Vector3, resolve: (key: string, out: Vector3, col: Color) => boolean): void {
    let k = 0;
    for (let i = 0; i < count && k < MAX; i++) {
      const m = motes[i];
      const hit = m.grade === 'perfect' || m.grade === 'good';
      if (m.ahead < 0 && hit) continue;
      if (!resolve(m.key, _to, _c)) continue;
      const s = Math.min(1, Math.max(0, 1 - m.ahead / TIMING.travelBeats)); // 0 at the module → 1 on the beat
      _p.lerpVectors(from, _to, s);
      const arc = Math.min(0.25, from.distanceTo(_to) * 0.35);
      _p.y += Math.sin(s * Math.PI) * arc;
      let r = 0.007 + 0.004 * s;
      let bright = 0.5 + 0.5 * s;
      if (m.ahead < 0) {
        // missed: it fades where it landed
        const f = Math.max(0, 1 + m.ahead / 0.6);
        r *= f;
        bright *= f * 0.6;
      }
      if (s < 0.05) r *= s / 0.05;
      if (r <= 0.0005) continue;
      _m.compose(_p, _q, _s.setScalar(r));
      this.mesh.setMatrixAt(k, _m);
      this.mesh.setColorAt(k, _c.multiplyScalar(bright));
      k++;
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
