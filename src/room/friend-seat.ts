/**
 * Someone else in the band, across the desk: a soft light where they'd sit, in their instrument's colour, that swells
 * with every note they play, and their instrument's name on tape under it. A friend's headset in Play together; on
 * your own, the backing band's players during a song. Kit-local, beyond the panel.
 */
import { Group, Mesh, MeshBasicMaterial, SphereGeometry, Vector3 } from '@iwsdk/core';
import { asLight } from '../art/light.js';
import { Tag } from '../ui/tag.js';

/** Where each one sits: left, across, right (kit-local x, height, z); pulled in at a tray (no room across). */
const PLACES: readonly [number, number, number][] = [
  [-0.4, 0.26, -0.42],
  [0, 0.34, -0.6],
  [0.4, 0.26, -0.42],
];
const TRAY = 0.7;

const _at = new Vector3();
const _down = new Vector3(0, -0.06, 0);

export class FriendSeat {
  readonly root = new Group();
  private orb: Mesh;
  private halo: Mesh;
  private tag = new Tag(0.12, 0.03);
  private k = 0;
  private name = '';
  private color = 0xfff2dc;
  private faceT = 0;
  /** Left (−1) to right (+1), for where their sound comes from. */
  readonly pan: number;

  constructor(i: number, tray = false) {
    this.root.name = 'FriendSeat';
    const [x, y, z] = PLACES[i % PLACES.length];
    const s = tray ? TRAY : 1;
    this.root.position.set(x * s, y * (tray ? 0.85 : 1), z * s);
    this.pan = Math.max(-0.7, Math.min(0.7, x / 0.4)) * 0.7;
    this.orb = new Mesh(new SphereGeometry(0.022, 20, 14), asLight(new MeshBasicMaterial({ color: 0xfff2dc, toneMapped: false })));
    this.halo = new Mesh(new SphereGeometry(0.05, 20, 14), asLight(new MeshBasicMaterial({ color: 0xfff2dc, toneMapped: false, opacity: 0.25 })));
    this.root.add(this.orb, this.halo, this.tag.mesh);
    this.tag.mesh.visible = false;
  }

  /** What they're playing. */
  set(name: string, color: number): void {
    if (name === this.name && color === this.color) return;
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
      this.root.getWorldPosition(_at).add(_down);
      this.tag.pin(this.name.toUpperCase(), this.color, _at, head);
      // (the tag is a child of the seat: put it back in the seat's own frame)
      this.root.worldToLocal(this.tag.mesh.position.copy(_at));
    }
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const m of [this.orb, this.halo]) {
      m.geometry.dispose();
      (m.material as MeshBasicMaterial).dispose();
    }
  }
}
