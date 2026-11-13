/**
 * One drum of the table kit, as an electronic kit's pad (PLAN §3.13): a matte black mesh head on a
 * rubber rim, a thin chrome hoop, and an LED ring that flashes by hit strength and glows a beat before
 * its note. A hit dents the head and sends a ripple across it.
 *
 * Pad-local: origin on the table at the pad's centre, +Y up.
 */
import {
  CanvasTexture,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  SRGBColorSpace,
  TorusGeometry,
} from '@iwsdk/core';
import { asLight } from '../art/light.js';
import { PADS, type Lane } from '../config.js';
import { motion } from '../ui/motion.js';

const HEIGHT = 0.018;
const SQUASH_S = 0.1;

/** Each drum's LED colour. */
export const LED: Record<Lane, number> = { kick: 0xff4a3a, snare: 0xf4f1ea, hat: 0x5cd6ff, tom: 0xffa630, gong: 0xfff1d0 };

let meshTex: CanvasTexture | null = null;
/** The mesh head: charcoal with a fine woven dot pattern and a soft sheen. */
function meshTexture(): CanvasTexture {
  if (meshTex) return meshTex;
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#17171a';
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#26262b';
  for (let y = 0; y < S; y += 6) for (let x = (y / 6) % 2 ? 3 : 0; x < S; x += 6) g.fillRect(x, y, 2, 2);
  const grad = g.createRadialGradient(S * 0.38, S * 0.32, 10, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0.09)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.02)');
  grad.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  meshTex = new CanvasTexture(c);
  meshTex.colorSpace = SRGBColorSpace;
  meshTex.anisotropy = 4;
  return meshTex;
}

let shadowTex: CanvasTexture | null = null;
function shadowTexture(): CanvasTexture {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.6)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.35)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  shadowTex = new CanvasTexture(c);
  return shadowTex;
}

const _white = new Color(0xffffff);
let flat: PlaneGeometry | null = null;
function flatPlane(): PlaneGeometry {
  if (!flat) {
    flat = new PlaneGeometry(1, 1);
    flat.rotateX(-Math.PI / 2);
  }
  return flat;
}

export class PadView {
  readonly group = new Group();
  /** The squashing part (head, rim, hoop). */
  readonly body = new Group();
  private head: MeshStandardMaterial;
  private led: MeshBasicMaterial;
  private ledGlow: MeshBasicMaterial;
  private ripple: Mesh;
  private rippleT = 1;
  private base = new Color();
  private squashT = 1;
  private squashK = 0;
  private flash = 0;
  private ask = 0;
  private shown = 0;
  private appearT = 1;
  readonly radius: number;
  x = 0;
  z = 0;
  lift = 0;

  constructor(readonly lane: Lane, hc = false) {
    const spec = PADS[lane];
    this.radius = spec.size / 2;
    const R = this.radius;
    this.group.name = `Pad-${lane}`;
    this.base.setHex(LED[lane]);
    const rubber = new MeshStandardMaterial({ color: 0x1b1b1e, roughness: 0.92 });
    this.head = new MeshStandardMaterial({ map: meshTexture(), roughness: 0.85, color: hc ? 0x666666 : 0xffffff });
    const body = new Mesh(new CylinderGeometry(R, R * 1.02, HEIGHT, 48), [rubber, this.head, rubber]);
    body.position.y = HEIGHT / 2;
    // the rubber rim and a thin chrome hoop just inside it
    const rim = new Mesh(new TorusGeometry(R * 0.985, 0.0045, 10, 56), rubber);
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = HEIGHT;
    const hoop = new Mesh(new TorusGeometry(R * 1.005, 0.0016, 8, 64), new MeshStandardMaterial({ color: 0xd8dade, metalness: 1, roughness: 0.22 }));
    hoop.rotation.x = -Math.PI / 2;
    hoop.position.y = HEIGHT + 0.0035;
    this.body.add(body, rim, hoop);
    this.group.add(this.body);
    // the LED ring round the base, and its glow on the table
    this.led = new MeshBasicMaterial({ color: this.base.clone().multiplyScalar(0.25), toneMapped: false });
    const led = new Mesh(new RingGeometry(R * 1.04, R * 1.1, 64), this.led);
    led.rotation.x = -Math.PI / 2;
    led.position.y = 0.0015;
    this.ledGlow = asLight(new MeshBasicMaterial({ color: this.base, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    const glow = new Mesh(new RingGeometry(R * 1.0, R * 1.55, 64), this.ledGlow);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.001;
    glow.renderOrder = 3;
    // a ripple ring that spreads across the head on a hit
    this.ripple = new Mesh(new RingGeometry(0.9, 1, 48), asLight(new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })));
    this.ripple.rotation.x = -Math.PI / 2;
    this.ripple.position.y = HEIGHT + 0.0008;
    this.ripple.renderOrder = 4;
    const shadow = new Mesh(flatPlane(), new MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
    shadow.scale.setScalar(R * 2.8);
    shadow.position.y = 0.0006;
    shadow.renderOrder = 1;
    this.group.add(led, glow, this.ripple, shadow);
    this.group.visible = false;
  }

  setContrast(hc: boolean): void {
    this.head.color.setHex(hc ? 0x666666 : 0xffffff);
  }

  appear(how: 'fade' | 'slide'): void {
    void how;
    this.appearT = 0;
    this.group.visible = true;
  }

  hide(): void {
    this.group.visible = false;
  }

  get visible(): boolean {
    return this.group.visible;
  }

  hit(gain: number): void {
    this.squashT = 0;
    this.squashK = gain;
    this.flash = Math.max(this.flash, 0.4 + 0.6 * gain);
    this.rippleT = 0;
  }

  private white = 0;
  private dim = 0;

  /** Hit right on time: a white flash of the ring. */
  perfect(): void {
    this.white = 1;
  }

  /** Its note went by unplayed: the ring dims for a moment. */
  miss(): void {
    this.dim = 1;
  }

  setGlow(k: number): void {
    if (k > this.ask) this.ask = k;
  }

  update(dt: number): void {
    if (!this.group.visible) return;
    let s = 1;
    if (this.appearT < 1) {
      this.appearT = Math.min(1, this.appearT + dt / 0.45);
      const b = this.appearT - 1;
      s = 0.4 + 0.6 * (1 + 2.0 * b * b * b + 1.0 * b * b);
    }
    this.group.position.set(this.x, this.lift, this.z);
    let sy = 1;
    let sxz = 1;
    if (this.squashT < SQUASH_S) {
      this.squashT += dt;
      const k = Math.min(1, this.squashT / SQUASH_S);
      const env = Math.sin(k * Math.PI) * (1 - k * 0.3);
      const amp = (0.04 + 0.08 * this.squashK) * (motion.calm ? 0.5 : 1);
      sy = 1 - amp * env;
      sxz = 1 + amp * 0.3 * env;
    }
    this.body.scale.set(s * sxz, s * sy, s * sxz);
    if (this.rippleT < 1) {
      this.rippleT = Math.min(1, this.rippleT + dt / 0.3);
      this.ripple.scale.setScalar(this.radius * (0.15 + 0.82 * this.rippleT));
      (this.ripple.material as MeshBasicMaterial).opacity = 0.35 * this.squashK * (1 - this.rippleT);
      this.ripple.position.y = HEIGHT * sy + 0.0008;
    }
    this.flash = Math.max(0, this.flash - dt * 4);
    this.white = Math.max(0, this.white - dt * 3);
    this.dim = Math.max(0, this.dim - dt * 2.5);
    const target = Math.max(this.ask * 0.8, this.flash, this.white);
    this.shown += (target - this.shown) * Math.min(1, dt * 30);
    this.ask = 0;
    const lit = this.shown * (1 - 0.7 * this.dim);
    this.led.color.copy(this.base).multiplyScalar((0.22 + 0.78 * lit) * (1 - 0.6 * this.dim)).lerp(_white, this.white * 0.8);
    this.ledGlow.opacity = lit * 0.9;
  }

  get light(): number {
    return this.shown;
  }
}
