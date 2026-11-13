/**
 * A friend in the band, across the desk: a soft light where they'd sit, in their instrument's colour, that swells
 * with every note they play, and their instrument's name on tape under it. Kit-local, beyond the panel.
 */
import { Group, Mesh, MeshBasicMaterial, SphereGeometry, Vector3 } from '@iwsdk/core';
import { asLight } from '../art/light.js';
import { Tag } from '../ui/tag.js';

/** Where each friend sits: left, across, right (kit-local x, height, z). */
const PLACES: readonly [number, number, number][] = [
  [-0.42, 0.26, -0.42],
  [0, 0.34, -0.62],
  [0.42, 0.26, -0.42],
];

export class FriendSeat {
  readonly root = new Group();
  private orb: Mesh;
  private halo: Mesh;
  private tag = new Tag(0.12, 0.03);
  private k = 0;
  private name = '';
  private color = 0xfff2dc;
  private faceT = 0;

  constructor(i: number) {
    this.root.name = 'FriendSeat';
    const [x, y, z] = PLACES[i % PLACES.length];
    this.root.position.set(x, y, z);
    this.orb = new Mesh(new SphereGeometry(0.022, 20, 14), asLight(new MeshBasicMaterial({ color: 0xfff2dc, toneMapped: false })));
    this.halo = new Mesh(new SphereGeometry(0.05, 20, 14), asLight(new MeshBasicMaterial({ color: 0xfff2dc, toneMapped: false, opacity: 0.25 })));
    this.root.add(this.orb, this.halo, this.tag.mesh);
    this.tag.mesh.visible = false;
  }

  /** What they're playing. */
  set(name: string, color: number): void {
    this.name = name;
    this.color = color;
    (this.orb.material as MeshBasicMaterial).color.setHex(color);
    (this.halo.material as MeshBasicMaterial).color.setHex(color);
    this.faceT = 0;
  }

  /** They played a note. */
  pulse(vel: number): void {
    this.k = Math.max(this.k, 0.4 + 0.6 * vel);
  }

  update(dt: number, head: Vector3): void {
    this.k = Math.max(0, this.k - dt * 4);
    this.orb.scale.setScalar(1 + this.k * 0.6);
    this.halo.scale.setScalar(1 + this.k * 1.4);
    (this.halo.material as MeshBasicMaterial).opacity = 0.18 + 0.5 * this.k;
    this.faceT -= dt;
    if (this.faceT <= 0 && this.name) {
      this.faceT = 0.5;
      const at = this.root.getWorldPosition(new Vector3()).add(new Vector3(0, -0.06, 0));
      this.tag.pin(this.name.toUpperCase(), this.color, at, head);
      // (the tag is a child of the seat: put it back in the seat's own frame)
      this.root.worldToLocal(this.tag.mesh.position.copy(at));
    }
  }
}
