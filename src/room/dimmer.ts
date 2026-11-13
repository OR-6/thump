/**
 * Lights down: during Go wild! your real room goes dark around the desk (a black shell between you and the room,
 * eased in over a beat), and every hit throws a burst of its instrument's colour into the dark. When the fill lands
 * ("Huge!") the room comes back up. The desk and everything on it stay lit (the shell is behind them).
 */
import { BackSide, Color, Mesh, MeshBasicMaterial, SphereGeometry, Vector3 } from '@iwsdk/core';

const _c = new Color();

export class Dimmer {
  readonly mesh: Mesh;
  private mat: MeshBasicMaterial;
  private dark = 0;
  private want = 0;
  private burst = 0;
  private burstColor = new Color();

  constructor() {
    this.mat = new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: BackSide, depthWrite: false, toneMapped: false });
    this.mesh = new Mesh(new SphereGeometry(2.4, 32, 16), this.mat);
    this.mesh.name = 'LightsDown';
    // drawn first: everything on the desk draws over it
    this.mesh.renderOrder = -10;
    this.mesh.visible = false;
  }

  /** Dark (a fill) or not. */
  set(on: boolean): void {
    this.want = on ? 0.78 : 0;
  }

  /** A hit in the dark: a flash of its colour. */
  hit(color: number, gain: number): void {
    if (this.dark < 0.1) return;
    this.burstColor.setHex(color);
    this.burst = Math.max(this.burst, 0.35 + 0.4 * gain);
  }

  update(dt: number, head: Vector3, calm: boolean): void {
    // down over about half a second, back up quicker
    const rate = this.want > this.dark ? 2.2 : 4;
    this.dark += Math.sign(this.want - this.dark) * Math.min(Math.abs(this.want - this.dark), dt * rate * (calm ? 0.5 : 1));
    this.burst = Math.max(0, this.burst - dt * 5);
    this.mesh.visible = this.dark > 0.01;
    if (!this.mesh.visible) return;
    this.mesh.position.copy(head);
    this.mat.opacity = this.dark;
    _c.copy(this.burstColor).multiplyScalar(this.burst * 0.55);
    this.mat.color.copy(_c);
  }
}
