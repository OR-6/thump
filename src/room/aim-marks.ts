/**
 * Where you're about to hit, shown before you hit it: a real drum tells your stick where it is by touch, and in the
 * air nothing does. So under each hand's striking point (a stick's tip, a mallet's ball, the lowest of an open hand's
 * fingertips and palm), on the head or bar it's over, lies its shadow, as a lamp overhead would throw it: a soft dark
 * spot ringed in the drum's own colour, wide and faint 6 cm up, closing and darkening as the point comes down (a
 * white head shows a dark spot; a dark bar shows the ring). It says which drum you'll hit, and how
 * close you are. Not on the piano (its keys go down under your fingers) or the guitar. Calm motion: the same, it
 * doesn't move on its own. One ring per hand, in the kit's frame; nothing allocated per frame.
 */
import { CircleGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, Quaternion, RingGeometry, Vector3, type Object3D } from '@iwsdk/core';

/** How high above a surface a point starts to show (m). */
export const AIM_FROM = 0.06;

const UP = new Vector3(0, 1, 0);

export class AimMarks {
  private rings: Group[] = [];
  private mats: MeshBasicMaterial[] = [];
  private spots: MeshBasicMaterial[] = [];
  private n = new Vector3();
  private q = new Quaternion();

  constructor(parent: Object3D) {
    // (a ring lying flat; its hole closes as the point comes down)
    const geo = new RingGeometry(0.78, 1, 40).rotateX(-Math.PI / 2);
    const disc = new CircleGeometry(0.8, 32).rotateX(-Math.PI / 2);
    for (let i = 0; i < 2; i++) {
      const g = new Group();
      g.name = 'AimMark';
      g.visible = false;
      const spot = new MeshBasicMaterial({ color: 0x1a0b2e, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: DoubleSide });
      const s = new Mesh(disc, spot);
      s.renderOrder = 7;
      const mat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: DoubleSide });
      const m = new Mesh(geo, mat);
      m.renderOrder = 8;
      g.add(s, m);
      parent.add(g);
      this.rings.push(g);
      this.mats.push(mat);
      this.spots.push(spot);
    }
  }

  /** Hand i's mark off. */
  hide(i: number): void {
    this.rings[i].visible = false;
  }

  /**
   * Hand i's striking point is `h` metres over a surface at `at` (kit frame, on the surface), whose normal is
   * (nx, ny, nz); `color` is the surface's own.
   */
  show(i: number, at: Vector3, nx: number, ny: number, nz: number, h: number, color: number): void {
    const m = this.rings[i];
    if (!(h >= 0 && h < AIM_FROM)) {
      m.visible = false;
      return;
    }
    const k = 1 - h / AIM_FROM;
    m.visible = true;
    // (a hair off the surface along its normal, so it isn't lost in it)
    this.n.set(nx, ny, nz);
    m.position.copy(at).addScaledVector(this.n, 0.0015);
    this.q.setFromUnitVectors(UP, this.n);
    m.quaternion.copy(this.q);
    // 4 cm across 6 cm up, closing to 1 cm; faint to dark, its ring to bright
    m.scale.setScalar(0.005 + 0.015 * (1 - k));
    const mat = this.mats[i];
    mat.color.setHex(color);
    mat.opacity = 0.3 + 0.6 * k;
    this.spots[i].opacity = 0.12 + 0.5 * k * k;
  }
}

