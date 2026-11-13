/**
 * The bandmate's look: a round felt bird with a tiny drum, sitting at the far edge of the table.
 * It hops in when it arrives, bobs to the beat, strikes its drum with a wing on each of its notes,
 * tilts its head "your turn", and hops on a good answer. Kit-local, about 6 cm tall.
 */
import { Color, ConeGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry } from '@iwsdk/core';
import { FELT } from '../config.js';
import { feltTexture } from '../art/textures.js';
import { motion } from '../ui/motion.js';

export class Bird {
  readonly root = new Group();
  private body: Mesh;
  private head: Group;
  private wing: Mesh;
  private drum: Mesh;
  private drumTop: MeshStandardMaterial;
  private inT = 1;
  private shown = false;
  private hop = 0;
  private hopV = 0;
  private strikeT = 1;
  private tilt = 0;
  private tiltT = 0;
  /** Debug/E2E: notes it played. */
  played = 0;

  constructor() {
    this.root.name = 'Bandmate';
    const felt = feltTexture();
    const blue = new MeshStandardMaterial({ color: 0x4e7fc4, roughness: 0.95, map: felt });
    const cream = new MeshStandardMaterial({ color: FELT.cream, roughness: 0.95, map: felt });
    const ink = new MeshStandardMaterial({ color: 0x1f1714, roughness: 0.6 });
    const beakMat = new MeshStandardMaterial({ color: FELT.mustard, roughness: 0.9 });
    const sphere = new SphereGeometry(1, 20, 14);
    this.body = new Mesh(sphere, blue);
    this.body.scale.set(0.022, 0.024, 0.02);
    this.body.position.y = 0.024;
    const belly = new Mesh(sphere, cream);
    belly.scale.set(0.015, 0.017, 0.01);
    belly.position.set(0, 0.021, 0.012);
    this.head = new Group();
    this.head.position.set(0, 0.05, 0.004);
    const head = new Mesh(sphere, blue);
    head.scale.setScalar(0.015);
    const beak = new Mesh(new ConeGeometry(0.0045, 0.011, 10), beakMat);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, -0.002, 0.016);
    const tuft = new Mesh(sphere, blue);
    tuft.scale.set(0.004, 0.008, 0.004);
    tuft.position.set(0, 0.016, -0.002);
    tuft.rotation.x = -0.4;
    this.head.add(head, beak, tuft);
    for (const s of [-1, 1]) {
      const eye = new Mesh(sphere, ink);
      eye.scale.setScalar(0.0026);
      eye.position.set(s * 0.0065, 0.004, 0.0128);
      this.head.add(eye);
    }
    this.wing = new Mesh(sphere, blue);
    this.wing.scale.set(0.006, 0.015, 0.011);
    this.wing.position.set(-0.021, 0.028, 0.006);
    const tail = new Mesh(sphere, blue);
    tail.scale.set(0.009, 0.004, 0.014);
    tail.position.set(0, 0.014, -0.022);
    tail.rotation.x = 0.5;
    // the tiny drum, in front of it
    this.drumTop = new MeshStandardMaterial({ color: FELT.cream, roughness: 0.9, emissive: new Color(0) });
    const shell = new MeshStandardMaterial({ color: FELT.tomato, roughness: 0.9, map: felt });
    this.drum = new Mesh(new CylinderGeometry(0.014, 0.014, 0.016, 24), [shell, this.drumTop, shell]);
    this.drum.position.set(-0.012, 0.008, 0.03);
    for (const s of [-1, 1]) {
      const foot = new Mesh(sphere, beakMat);
      foot.scale.set(0.005, 0.0025, 0.007);
      foot.position.set(s * 0.008, 0.002, 0.006);
      this.root.add(foot);
    }
    this.root.add(this.body, belly, this.head, this.wing, tail, this.drum);
    this.root.visible = false;
  }

  arrive(): void {
    if (this.shown) return;
    this.shown = true;
    this.root.visible = true;
    this.inT = 0;
    this.hopV = 0.5;
    this.hop = 0.0001;
  }

  get here(): boolean {
    return this.shown;
  }

  /** It strikes its drum (a note of its call). */
  strike(): void {
    this.strikeT = 0;
    this.played++;
  }

  happy(): void {
    this.hopV = motion.calm ? 0.2 : 0.38;
    this.hop = 0.0001;
  }

  /** Head tilt: "your turn". */
  turn(): void {
    this.tiltT = 0.9;
  }

  update(dt: number, beat: number): void {
    if (!this.shown) return;
    if (this.inT < 1) this.inT = Math.min(1, this.inT + dt / 0.5);
    if (this.hop > 0) {
      this.hopV -= 9.8 * dt;
      this.hop += this.hopV * dt;
      if (this.hop <= 0) this.hop = this.hopV = 0;
    }
    const s = 0.4 + 0.6 * (1 - Math.pow(1 - this.inT, 3));
    this.root.scale.setScalar(s);
    this.root.position.y = this.hop;
    const f = Number.isNaN(beat) ? 0 : beat - Math.floor(beat);
    this.head.position.y = 0.05 + (Number.isNaN(beat) ? 0 : Math.sin(f * Math.PI) * 0.0025);
    if (this.tiltT > 0) this.tiltT -= dt;
    this.tilt += ((this.tiltT > 0 ? 0.45 : 0) - this.tilt) * Math.min(1, dt * 10);
    this.head.rotation.z = this.tilt;
    // a wing strike: down onto the drum and back
    if (this.strikeT < 0.16) this.strikeT += dt;
    const k = Math.min(1, this.strikeT / 0.16);
    this.wing.rotation.x = -Math.sin(k * Math.PI) * 0.9;
    this.drumTop.emissive.setRGB(1, 0.85, 0.6).multiplyScalar(Math.max(0, 1 - k) * 0.6);
  }
}
