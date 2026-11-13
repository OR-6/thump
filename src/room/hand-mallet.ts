/**
 * A marimba mallet in your hand: it appears when you pinch with the marimba out (a birch shaft from between your
 * thumb and finger, a dark yarn head ten centimetres on), and its head is what strikes the bars.
 */
import { CylinderGeometry, Group, Mesh, MeshStandardMaterial, Quaternion, SphereGeometry, Vector3 } from '@iwsdk/core';

const _up = new Vector3(0, 1, 0);
const _d = new Vector3();
const _q = new Quaternion();

/** How far the head is from the pinch (m), and its radius. */
export const MALLET_LEN = 0.1;
export const MALLET_HEAD_R = 0.012;

export class HandMallet {
  readonly group = new Group();
  private shaft: Mesh;
  private head: Mesh;
  private show = 0;

  constructor() {
    this.group.name = 'HandMallet';
    this.shaft = new Mesh(new CylinderGeometry(0.0028, 0.0034, 1, 10), new MeshStandardMaterial({ name: 'Birch', color: 0xd8c39a, roughness: 0.6 }));
    this.shaft.name = 'Shaft';
    this.head = new Mesh(new SphereGeometry(MALLET_HEAD_R, 18, 12), new MeshStandardMaterial({ name: 'Yarn', color: 0x2b2a30, roughness: 0.95 }));
    this.head.name = 'Head';
    this.group.add(this.shaft, this.head);
    this.group.visible = false;
  }

  /** Where the head is for a hand pinching at `pinch` with its knuckles at `knuckle` and palm at `palm` (world). */
  static tip(pinch: Vector3, knuckle: Vector3, palm: Vector3, out: Vector3): Vector3 {
    _d.subVectors(knuckle, palm);
    if (_d.lengthSq() < 1e-8) _d.set(0, 0, -1);
    _d.normalize();
    // forward from the hand and a little down, the way you'd hold one
    _d.y -= 0.35;
    _d.normalize();
    return out.copy(pinch).addScaledVector(_d, MALLET_LEN);
  }

  /** Draw it from the pinch to the head (or let it go). */
  set(held: boolean, pinch: Vector3, tip: Vector3, dt: number): void {
    this.show = Math.max(0, Math.min(1, this.show + (held ? dt : -dt) * 10));
    this.group.visible = this.show > 0.01;
    if (!this.group.visible) return;
    _d.subVectors(tip, pinch);
    const len = _d.length() || MALLET_LEN;
    this.shaft.position.copy(pinch).addScaledVector(_d, 0.5);
    _q.setFromUnitVectors(_up, _d.normalize());
    this.shaft.quaternion.copy(_q);
    this.shaft.scale.set(1, len * this.show, 1);
    this.head.position.copy(tip);
    this.head.scale.setScalar(this.show);
  }
}
