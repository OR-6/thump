/**
 * Someone else in the band, across the desk: a soft light where they'd sit, in their instrument's colour, that swells
 * with every note they play, and their instrument's name on tape under it. A friend's headset in Play together; on
 * your own, the backing band's players during a song. Kit-local, beyond the panel.
 */
import { Group, Mesh, MeshBasicMaterial, SphereGeometry, Vector3 } from '@iwsdk/core';
import { asLight } from '../art/light.js';
import { Tag } from '../ui/tag.js';
import { CongaModel, GuitarModel, HandpanModel, MarimbaModel, PianoModel, type DeskModel } from '../scene-assets/lib/instruments.js';
import { buildDrum, buildHiHat } from '../scene-assets/lib/drums.js';
import { congaZones, guitarZones, handpanZones, marimbaZones, pianoZones, scaleById } from '../kit/shelf.js';

/** Their instrument, small (a band across the desk, not dots): a desk model at a third of the size. */
const MINI = 0.3;
export function miniModel(id: string): { root: Group; model: DeskModel | null; n: number } {
  const happy = scaleById('happy');
  const m: DeskModel | null =
    id === 'piano' ? new PianoModel() : id === 'marimba' ? new MarimbaModel() : id === 'guitar' ? new GuitarModel() : id === 'handpan' ? new HandpanModel() : id === 'congas' ? new CongaModel() : null;
  const zones = id === 'piano' ? pianoZones(60, happy) : id === 'marimba' ? marimbaZones(60, happy) : id === 'guitar' ? guitarZones(48, happy) : id === 'handpan' ? handpanZones(48, happy) : id === 'congas' ? congaZones() : [];
  if (m) {
    m.layout(zones);
    return { root: m.root, model: m, n: Math.max(1, Math.min(6, zones.length)) };
  }
  // the drums: a kick, a snare and a hat
  const g = new Group();
  g.name = 'MiniDrums';
  const kick = buildDrum(0.14, { shell: 0x7a1e16, head: 0x2a2624 });
  kick.position.set(-0.07, 0, 0);
  const snare = buildDrum(0.1, { shell: 0xcfd3d8 });
  snare.position.set(0.06, 0, 0.03);
  const hat = buildHiHat(0.09);
  hat.position.set(0.1, 0, -0.06);
  g.add(kick, snare, hat);
  return { root: g, model: null, n: 1 };
}

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

  /** `named`: their instrument's name on tape under the light (with hints in the room on). */
  constructor(i: number, tray = false, private readonly named = false) {
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

  private mini: { root: Group; model: DeskModel | null; n: number } | null = null;
  private miniId = '';
  private hitN = 0;
  private bounce = 0;

  /** What they're playing (its id puts a small one of it under their light). */
  set(name: string, color: number, id = ''): void {
    if (id && id !== this.miniId) {
      this.miniId = id;
      this.mini?.root.removeFromParent();
      this.mini = miniModel(id);
      this.mini.root.scale.setScalar(MINI);
      this.mini.root.position.set(0, -0.075, 0);
      // (tilted a little toward you, so you see it played)
      this.mini.root.rotation.x = 0.35;
      this.root.add(this.mini.root);
    }
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
    this.bounce = Math.max(this.bounce, 0.5 + 0.5 * vel);
    // their instrument plays: a key, a bar, a string (walking round them, so it looks like playing)
    if (this.mini?.model) this.mini.model.struck(this.hitN++ % this.mini.n, vel);
  }

  update(dt: number, head: Vector3): void {
    this.k = Math.max(0, this.k - dt * 4);
    if (this.mini) {
      this.bounce = Math.max(0, this.bounce - dt * 6);
      this.mini.model?.update(dt);
      this.mini.root.scale.setScalar(MINI * (1 + 0.06 * this.bounce));
    }
    this.orb.scale.setScalar(1 + this.k * 0.6);
    this.halo.scale.setScalar(1 + this.k * 1.4);
    (this.halo.material as MeshBasicMaterial).opacity = 0.18 + 0.5 * this.k;
    this.faceT -= dt;
    if (this.faceT <= 0 && this.name && this.named) {
      this.faceT = 0.5;
      this.root.getWorldPosition(_at).add(_down);
      this.tag.pin(this.name.toUpperCase(), this.color, _at, head);
      // (the tag is a child of the seat: put it back in the seat's own frame)
      this.root.worldToLocal(this.tag.mesh.position.copy(_at));
    }
  }

  dispose(): void {
    this.root.removeFromParent();
    this.mini?.root.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.tag.dispose();
    for (const m of [this.orb, this.halo]) {
      m.geometry.dispose();
      (m.material as MeshBasicMaterial).dispose();
    }
  }
}
