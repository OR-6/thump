/**
 * Travelling notes: felt chips that slide along the real table from behind a pad toward it,
 * arriving on the beat (PLAN §3.5). Hit on time, a chip pops into its pad; missed, it slides on
 * past the pad's front and drops off, a little sad. One instanced mesh, coloured per lane.
 */
import { Color, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, SphereGeometry, Vector3 } from '@iwsdk/core';
import { PADS, TIMING, type Lane } from '../config.js';
import type { ChipView } from '../play/flow.js';
import { feltTexture } from '../art/textures.js';

/** How far behind its pad a chip starts (m). */
export const TRAVEL = 0.24;
const MAX = 48;
const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _c = new Color();

export class Chips {
  readonly mesh: InstancedMesh;

  constructor() {
    const mat = new MeshStandardMaterial({ roughness: 0.95, map: feltTexture() });
    this.mesh = new InstancedMesh(new SphereGeometry(1, 16, 8), mat, MAX);
    this.mesh.name = 'Chips';
    this.mesh.frustumCulled = false; // its bounding sphere is computed once, lazily, while empty
    this.mesh.count = 0;
    for (let i = 0; i < MAX; i++) this.mesh.setColorAt(i, _c.setHex(0xffffff));
  }

  /**
   * Lay out the chips the flow says are travelling. `spot(lane)` gives a pad's kit-local x/z, or null
   * when that pad isn't on the table (the wall gong shows its notes as a closing ring instead).
   */
  update(chips: readonly ChipView[], count: number, spot: (lane: Lane) => { x: number; z: number } | null, contrast: boolean): void {
    let k = 0;
    for (let i = 0; i < count && k < MAX; i++) {
      const c = chips[i];
      if (c.theirs) continue;
      const at = spot(c.lane);
      if (!at) continue;
      const hit = c.grade === 'perfect' || c.grade === 'good';
      if (c.ahead < 0 && hit) continue; // popped into its pad
      const along = c.ahead / TIMING.travelBeats; // 1 at birth → 0 on the beat → negative after
      let y = 0.0045;
      let scale = 1;
      const z = at.z - TRAVEL * along;
      if (along > 0.82) scale = Math.max(0, (1 - along) / 0.18); // grows out of the table as it sets off
      if (along < 0) {
        // missed: it slides past the pad and drops off its front edge
        const past = -along * TRAVEL;
        const edge = PADS[c.lane].size / 2;
        if (past > edge) y -= (past - edge) * 0.6;
        scale = Math.max(0, 1 + along * 2.2);
      }
      if (scale <= 0.01) continue;
      const r = 0.0125;
      _p.set(at.x, y, z);
      _m.compose(_p, _q.identity(), _s.set(r * scale, 0.0048 * scale, r * scale));
      this.mesh.setMatrixAt(k, _m);
      _c.setHex(contrast ? 0x111111 : PADS[c.lane].color);
      if (along < 0 && !hit) _c.lerp(_grey, 0.45);
      this.mesh.setColorAt(k, _c);
      k++;
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
const _grey = new Color(0x9a9088);
