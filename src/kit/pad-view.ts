/**
 * One felt pad on the table: a thick felt disc with a rolled, stitched edge, its own colour and
 * shape cue, a soft contact shadow, and a ring of light around it on the table (the beat light,
 * and the flash when it's hit). A hit squashes it (12% at full force, ~100 ms).
 *
 * Pad-local: origin on the table at the pad's centre, +Y up out of the surface (for the wall gong,
 * the group is turned so +Y is the wall's normal).
 */
import {
  AdditiveBlending,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  TorusGeometry,
  BoxGeometry,
} from '@iwsdk/core';
import { PADS, type Lane } from '../config.js';
import { blobTexture, glowTexture, padTopTexture } from '../art/felt.js';
import { feltTexture } from '../art/textures.js';
import { motion } from '../ui/motion.js';

const HEIGHT = 0.016;
const SQUASH_S = 0.11;

let planeGeo: PlaneGeometry | null = null;
function plane(): PlaneGeometry {
  if (!planeGeo) {
    planeGeo = new PlaneGeometry(1, 1);
    planeGeo.rotateX(-Math.PI / 2);
  }
  return planeGeo;
}

export class PadView {
  readonly group = new Group();
  /** The squashing part (body + rim), scaled about the table. */
  readonly felt = new Group();
  readonly body: Mesh;
  private rim: Mesh;
  private top: MeshStandardMaterial;
  private side: MeshStandardMaterial;
  private glowMat: MeshBasicMaterial;
  private glow: Mesh;
  private shadow: Mesh;
  private base = new Color();
  private squashT = 1;
  private squashK = 0;
  private flash = 0;
  private ask = 0;
  private shown = 0;
  private appearT = 1;
  private appearHow: 'fade' | 'slide' = 'fade';
  /** Where it slides in from (pad-local x offset), when sliding. */
  private slideFrom = 0;
  readonly radius: number;
  /** The pad's spot (kit-local x, z) it settles at. */
  x = 0;
  z = 0;
  /** Lifted while being moved (pinched). */
  lift = 0;

  constructor(readonly lane: Lane, hc = false) {
    const spec = PADS[lane];
    this.radius = spec.size / 2;
    const R = this.radius;
    this.group.name = `Pad-${lane}`;
    this.base.setHex(spec.color);
    const brass = spec.mark === 'brass';
    this.top = new MeshStandardMaterial({ map: padTopTexture(spec, hc), roughness: brass ? 0.35 : 0.95, metalness: brass ? 0.6 : 0, emissive: new Color(0x000000) });
    this.side = new MeshStandardMaterial({ color: hc ? 0xfff4dc : new Color(spec.color).multiplyScalar(0.82), roughness: brass ? 0.4 : 0.95, metalness: brass ? 0.55 : 0, map: brass ? null : feltTexture() });
    const h = brass ? 0.008 : HEIGHT;
    const geo = new CylinderGeometry(R * 0.94, R, h, 48, 1, false);
    geo.translate(0, h / 2, 0);
    this.body = new Mesh(geo, [this.side, this.top, this.side]);
    this.body.name = `PadBody-${lane}`;
    this.body.castShadow = false;
    // a rolled felt edge: a soft torus round the rim (brass: a thin lip)
    const tube = brass ? 0.003 : 0.0055;
    this.rim = new Mesh(new TorusGeometry(R * 0.97, tube, 10, 48), this.side);
    this.rim.rotation.x = -Math.PI / 2;
    this.rim.position.y = h - tube * 0.6;
    this.felt.add(this.body, this.rim);
    if (brass) {
      // the gong's felt hanger strap above it
      const strap = new Mesh(new BoxGeometry(0.018, 0.004, 0.06), new MeshStandardMaterial({ color: 0x8b3a2a, roughness: 0.95, map: feltTexture() }));
      strap.position.set(0, 0.002, -R - 0.025);
      this.felt.add(strap);
    }
    this.group.add(this.felt);
    this.glowMat = new MeshBasicMaterial({ map: glowTexture(), color: new Color(spec.color).lerp(new Color(0xffffff), 0.35), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    this.glow = new Mesh(plane(), this.glowMat);
    this.glow.scale.setScalar(R * 3.2);
    this.glow.position.y = 0.0012;
    this.glow.renderOrder = 3;
    this.group.add(this.glow);
    this.shadow = new Mesh(plane(), new MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.85 }));
    this.shadow.scale.setScalar(R * 2.7);
    this.shadow.position.y = 0.0006;
    this.shadow.renderOrder = 1;
    this.group.add(this.shadow);
    this.group.visible = false;
  }

  /** Restyle for high contrast (pads become cream with black marks). */
  setContrast(hc: boolean): void {
    const spec = PADS[this.lane];
    this.top.map?.dispose();
    this.top.map = padTopTexture(spec, hc);
    this.top.needsUpdate = true;
    this.side.color.set(hc ? 0xfff4dc : new Color(spec.color).multiplyScalar(0.82));
  }

  /** Appear: 'fade' (grows in place) or 'slide' (slides onto the table from the outside). */
  appear(how: 'fade' | 'slide'): void {
    this.appearHow = how;
    this.appearT = 0;
    this.slideFrom = how === 'slide' ? Math.sign(this.x || 1) * 0.16 : 0;
    this.group.visible = true;
  }

  hide(): void {
    this.group.visible = false;
    this.appearT = 1;
  }

  get visible(): boolean {
    return this.group.visible;
  }

  /** Struck with loudness `gain` 0..1. */
  hit(gain: number): void {
    this.squashT = 0;
    this.squashK = gain;
    this.flash = Math.max(this.flash, 0.55 + 0.45 * gain);
  }

  /** Ask for light this frame (the brightest ask wins). */
  setGlow(k: number): void {
    if (k > this.ask) this.ask = k;
  }

  update(dt: number): void {
    if (!this.group.visible) return;
    // appear
    let ax = 0;
    let s = 1;
    if (this.appearT < 1) {
      this.appearT = Math.min(1, this.appearT + dt / (this.appearHow === 'slide' ? 0.65 : 0.5));
      const e = 1 - Math.pow(1 - this.appearT, 3);
      if (this.appearHow === 'slide') ax = this.slideFrom * (1 - e);
      else {
        // a little overshoot as it settles
        const b = this.appearT - 1;
        s = 0.3 + 0.7 * (1 + 2.2 * b * b * b + 1.2 * b * b);
      }
    }
    this.group.position.set(this.x + ax, this.lift, this.z);
    // squash and spring back
    let sy = 1;
    let sxz = 1;
    if (this.squashT < SQUASH_S) {
      this.squashT += dt;
      const k = Math.min(1, this.squashT / SQUASH_S);
      const env = Math.sin(k * Math.PI) * (1 - k * 0.3);
      const amp = (0.04 + 0.08 * this.squashK) * (motion.calm ? 0.5 : 1);
      sy = 1 - amp * env;
      sxz = 1 + amp * 0.45 * env;
    }
    this.felt.scale.set(s * sxz, s * sy, s * sxz);
    this.shadow.scale.setScalar(this.radius * 2.7 * s);
    // light: the beat glow asked for this frame, or a hit's flash fading
    this.flash = Math.max(0, this.flash - dt * 4.5);
    const target = Math.max(this.ask * 0.85, this.flash);
    this.shown += (target - this.shown) * Math.min(1, dt * 30);
    this.ask = 0;
    this.glowMat.opacity = this.shown;
    this.glow.scale.setScalar(this.radius * (3.0 + 0.5 * this.flash) * s);
    this.top.emissive.copy(this.base).multiplyScalar(this.shown * 0.45);
  }

  /** World-less helper: the pad's light level now (debug/E2E). */
  get light(): number {
    return this.shown;
  }
}

/** A small flat felt disc helper for markers (the move plate, nudge arrows). */
export function feltDisc(radius: number, color: number): Mesh {
  const m = new Mesh(new CircleGeometry(radius, 32), new MeshStandardMaterial({ color, roughness: 0.95, map: feltTexture() }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.002;
  return m;
}
