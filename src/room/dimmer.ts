/**
 * Lights down: during a solo the room above the desk goes dim (a dark cap over you, eased in over a beat: the desk,
 * the tray and your hands below eye level stay as they are), and hits throw a soft wash of their instrument's colour
 * into it: at most one every 0.6 s, rising over a tenth of a second and fading over most of a second, so the dark
 * breathes in colour rather than flashing (anything at 3 Hz or more filling the view is a strobe); none at all with
 * calm motion. When the fill lands ("Huge!") the room comes back up.
 */
import { BackSide, Color, Mesh, MeshBasicMaterial, SphereGeometry, Vector3 } from '@iwsdk/core';

const _c = new Color();

export class Dimmer {
  readonly mesh: Mesh;
  private mat: MeshBasicMaterial;
  private dark = 0;
  private want = 0;
  private burst = 0;
  private burstWant = 0;
  private burstColor = new Color();
  private lastBurst = -9;
  private t = 0;
  /** Off at the lower frame-rate levels (a full-view blend costs both eyes). */
  enabled = true;
  calm = false;

  constructor() {
    // (no depth test: the hands' depth-only occluder spheres would cut it, and your hands showed in the dark as a
    // cluster of bright balls; the room dims with your hands in it, and everything on the desk still draws over it)
    this.mat = new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: BackSide, depthWrite: false, depthTest: false, toneMapped: false });
    // a cap: from straight up to a little under eye level (the desk below stays in the real light)
    this.mesh = new Mesh(new SphereGeometry(2.4, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2 + 0.22), this.mat);
    this.mesh.name = 'LightsDown';
    // drawn first: everything on the desk draws over it
    this.mesh.renderOrder = -10;
    this.mesh.visible = false;
  }

  /** Dark (a fill) or not. */
  set(on: boolean): void {
    this.want = on && this.enabled ? 0.65 : 0;
  }

  /** Told of every coloured moment too (Lights Out tints its beam with it). */
  onHit: ((color: number, gain: number) => void) | null = null;

  /** A hit in the dark: a flash of its colour. */
  hit(color: number, gain: number): void {
    this.onHit?.(color, gain);
    if (this.dark < 0.1 || this.calm || this.t - this.lastBurst < 0.6) return;
    this.burstColor.setHex(color);
    // (a near-white colour, the snare's, would read as a flash: it washes in as its warm tint instead)
    const hsl = { h: 0, s: 0, l: 0 };
    this.burstColor.getHSL(hsl);
    if (hsl.s < 0.35) this.burstColor.setHSL(0.09, 0.8, 0.5);
    this.lastBurst = this.t;
    this.burstWant = Math.max(this.burstWant, 0.08 + 0.08 * gain);
  }

  update(dt: number, head: Vector3, calm: boolean): void {
    this.t += dt;
    this.calm = calm;
    // down over about half a second, back up quicker
    const rate = this.want > this.dark ? 2.2 : 4;
    this.dark += Math.sign(this.want - this.dark) * Math.min(Math.abs(this.want - this.dark), dt * rate * (calm ? 0.5 : 1));
    // (in over a tenth of a second, out over most of one)
    if (this.burstWant > this.burst) {
      this.burst = Math.min(this.burstWant, this.burst + dt * 1.6);
      if (this.burst >= this.burstWant) this.burstWant = 0;
    } else {
      this.burstWant = 0;
      this.burst = Math.max(0, this.burst - dt * 0.22);
    }
    this.mesh.visible = this.dark > 0.01;
    if (!this.mesh.visible) return;
    this.mesh.position.copy(head);
    this.mat.opacity = this.dark;
    _c.copy(this.burstColor).multiplyScalar(this.burst);
    this.mat.color.copy(_c);
  }
}
