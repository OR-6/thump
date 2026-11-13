/**
 * The table's instrument, in kit-local space (origin on the table at the kit's centre, +X right, +Z
 * toward the player): the drum pads, the table keys (a slim row of light bars that plays any melody
 * your room has no instrument for), the module at the back, and your hands' shadows on the table.
 */
import { DirectionalLight, Group, Mesh, MeshBasicMaterial, PlaneGeometry, CanvasTexture } from '@iwsdk/core';
import { LANES, PADS, type Lane } from '../config.js';
import { PadView } from './pad-view.js';
import { Module } from '../ui/module.js';
import { Overlay } from '../room/overlay.js';
import { zonesFor, type Zone } from '../room/zones.js';

/** The table keys' row (kit-local, between the pads and the module). */
export const KEYS_ROW = { x: 0, z: -0.16 } as const;
/** The kit's playing area (kit-local): the whole table here is the kit. */
export const KIT_ZONE = { halfX: 0.38, back: -0.24, front: 0.14 } as const;

let shadowTex: CanvasTexture | null = null;
function handShadowTexture(): CanvasTexture {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.3)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  shadowTex = new CanvasTexture(c);
  return shadowTex;
}

export class KitView {
  readonly root = new Group();
  readonly pads = new Map<Lane, PadView>();
  readonly module = new Module();
  readonly keys = new Overlay('keys', 8);
  keyZones: Zone[] = [];
  private handShadow: Mesh[] = [];

  constructor() {
    this.root.name = 'Kit';
    // a soft key light from front-left and a cool rim from behind: the pads read against any table
    const key = new DirectionalLight(0xfff6ea, 1.4);
    key.position.set(-0.35, 0.5, 0.35);
    key.target.position.set(0, 0, -0.05);
    const rim = new DirectionalLight(0xdfe8ff, 0.5);
    rim.position.set(0.25, 0.3, -0.45);
    this.root.add(key, key.target, rim, rim.target);
    for (const lane of LANES) {
      if (lane === 'gong') continue;
      const p = new PadView(lane);
      p.x = PADS[lane].x;
      p.z = PADS[lane].z;
      this.pads.set(lane, p);
      this.root.add(p.group);
    }
    // the table keys lie on the table (an overlay on the kit's own surface: zone z is away from you)
    this.keyZones = zonesFor('keys', { minX: -0.3, maxX: 0.3, minZ: -0.1, maxZ: 0.3 }, { x: KEYS_ROW.x, z: -KEYS_ROW.z }, 0.5);
    this.keys.group.visible = false;
    this.keys.rest = 0.35;
    this.root.add(this.keys.group, this.module.root);
    const g = new PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    for (let i = 0; i < 2; i++) {
      const m = new Mesh(g, new MeshBasicMaterial({ map: handShadowTexture(), transparent: true, depthWrite: false, opacity: 0 }));
      m.renderOrder = 2;
      m.visible = false;
      this.handShadow.push(m);
      this.root.add(m);
    }
    this.root.visible = false;
  }

  pad(lane: Lane): PadView | undefined {
    return this.pads.get(lane);
  }

  /** The kit appears (its first hit): the pads you have, and the table keys. */
  reveal(lanes: readonly Lane[]): void {
    for (const l of lanes) this.pads.get(l)?.appear('fade');
    this.keys.build(this.keyZones);
    this.keys.reveal();
    this.keys.group.visible = true;
  }

  /** The bars draw in from a point (kit zone coordinates), as part of the kit's first bloom. */
  revealKeys(fromX: number, fromZ: number): void {
    this.keys.build(this.keyZones);
    this.keys.reveal(fromX, fromZ);
    this.keys.group.visible = true;
  }

  setContrast(hc: boolean): void {
    for (const p of this.pads.values()) p.setContrast(hc);
    if (this.keys.group.visible) this.keys.build(this.keyZones, hc);
  }

  /** The hand's shadow on the table under the palm (kit-local), darker as it nears. */
  setHandShadow(i: number, x: number, h: number, z: number): void {
    const m = this.handShadow[i];
    if (!Number.isFinite(h) || h > 0.3 || h < -0.05 || Math.abs(x) > 0.6 || Math.abs(z) > 0.45) {
      m.visible = false;
      return;
    }
    m.visible = true;
    const k = 1 - Math.max(0, h) / 0.3;
    m.position.set(x, 0.0009, z);
    m.scale.setScalar(0.075 + Math.max(0, h) * 0.25);
    (m.material as MeshBasicMaterial).opacity = 0.12 + 0.45 * k * k;
  }

  update(dt: number): void {
    for (const p of this.pads.values()) p.update(dt);
    this.keys.update(dt);
    this.module.update(dt);
  }
}
