/**
 * One drum of the desk kit, as a real drum (src/scene-assets/lib/drums.ts): a white coated head, a lacquered shell,
 * a chrome hoop with lugs; the hat is a hi-hat. A hit dents the head and sends a ripple across it, and the hoop
 * glints. A ring of light on the desk round it is the song's note: it glows a beat before the note and flashes on
 * the hit (the light is the music, not the drum).
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
import { DRUM_H, blackMetal, buildCymbal, buildDrum, buildECymbal, buildEPad, buildFloorDrum, buildFloorTom, buildHiHat, drumStand, tripod, type DrumLook, type KitStyle } from '../scene-assets/lib/drums.js';
import { PADS, type Lane } from '../config.js';
import { motion } from '../ui/motion.js';
import { contactShadow } from '../art/lighting.js';

/** Low on the table: the real wood stops your hand, a centimetre and a half under the head. */
const HEIGHT = DRUM_H;
/**
 * Real drums, cut to a desk, every head facing up for your hands: the snare on a short stand with its head 13 cm up,
 * the rack tom 18 cm, the hi-hat's top cymbal 17 cm on its rod, the bass drum lying flat on its feet (10 cm), the
 * floor tom 12 cm, the crash 23 cm and the ride 21 cm on their stands.
 */
export const HEAD_Y: Record<Lane, number> = { snare: 0.12, tom: 0.18, hat: 0.16, kick: 0.12, floor: 0.13, crash: 0.22, ride: 0.2, gong: 0.02 };
/** How far each piece tips toward the player (rad), as a drummer sets a kit: the rack tom and the crash most, the
 * snare a little, the bass drum and floor tom flat. */
export const TILT: Record<Lane, number> = { snare: 0.08, tom: 0.3, hat: 0.05, kick: 0, floor: 0.04, crash: 0.3, ride: 0.15, gong: 0 };
/** Where the player's eyes are, kit-local (the pieces turn to face them). */
export const PLAYER_Z = 0.36;
/** (kept for anything still reading the old kick's depth) */
export const KICK_DEPTH = 0.14;
const DEPTH: Partial<Record<Lane, number>> = { snare: 0.06, tom: 0.09, kick: 0.114, floor: 0.1 };
/** Each drum's look in a kit style: its shell, head and hardware. */
function lookFor(lane: Lane, style: KitStyle): DrumLook {
  if (style === 'electronic') return { shell: 0x1b1b1e, finish: 'matte', skin: 'mesh', black: true };
  // a jazz kit: natural maple showing its grain, calf heads, black-nickel hardware
  if (style === 'jazz') return { shell: 0x9a6a3e, finish: 'natural', skin: 'calf', blackNickel: true, throwOff: lane === 'snare', woodHoops: lane === 'kick' };
  // the acoustic kit in wine-red lacquer with a chrome snare; the bass drum's hoops are wood
  return { shell: 0x8e1a14, chromeShell: lane === 'snare', throwOff: lane === 'snare', woodHoops: lane === 'kick' };
}
/** An e-kit pad's depth (its top is the head, at HEAD_Y). */
export const EPAD_DEPTH: Partial<Record<Lane, number>> = { kick: 0.045, floor: 0.04 };
function buildELane(lane: Lane, size: number): Group {
  const g = new Group();
  if (lane === 'hat' || lane === 'crash' || lane === 'ride') {
    // rubber cymbal pads: the hi-hat on its own stand, the crash and ride held by the rack's arms
    const c = buildECymbal(size, lane === 'crash' ? 0.24 : lane === 'ride' ? 0.12 : 0.04);
    c.position.y = HEAD_Y[lane] - 0.009;
    if (lane === 'hat') {
      const m = blackMetal();
      const rod = new Mesh(new CylinderGeometry(0.0026, 0.0026, HEAD_Y.hat - 0.012, 12), m);
      rod.position.y = (HEAD_Y.hat - 0.012) / 2;
      g.add(tripod(0.06, m), rod);
    }
    g.add(c);
    return g;
  }
  const depth = EPAD_DEPTH[lane] ?? 0.035;
  const pad = buildEPad(size, depth);
  pad.position.y = HEAD_Y[lane] - depth;
  g.add(pad);
  return g;
}
function buildLane(lane: Lane, size: number, style: KitStyle): Group {
  if (style === 'electronic') return buildELane(lane, size);
  if (lane === 'hat') return buildHiHat(size, HEAD_Y.hat - 0.006, style);
  if (lane === 'crash' || lane === 'ride') return buildCymbal(size, HEAD_Y[lane], lane === 'crash' ? 0.24 : 0.12, lane, style);
  const depth = DEPTH[lane] ?? 0.05;
  const look = { ...lookFor(lane, style), depth };
  if (lane === 'floor') return buildFloorTom(size, look);
  if (lane === 'kick') return buildFloorDrum(size, look);
  const g = new Group();
  const stand = drumStand(HEAD_Y[lane] - depth, size / 2);
  const drum = buildDrum(size, look);
  drum.position.y = HEAD_Y[lane] - depth;
  g.add(stand, drum);
  return g;
}
const SQUASH_S = 0.14;

/** Each drum's LED colour. */
export const LED: Record<Lane, number> = { kick: 0xff4a3a, snare: 0xf4f1ea, hat: 0x5cd6ff, tom: 0xffa630, floor: 0x7aa8ff, crash: 0xffd76a, ride: 0xffe9b0, gong: 0xfff1d0 };

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
  private hoopMat: MeshStandardMaterial | undefined;
  private led: MeshBasicMaterial;
  private ledGlow: MeshBasicMaterial;
  /** Three rings that run out across the head on a hit, 80 ms apart, each fainter. */
  private ripples: Mesh[] = [];
  private rippleAge = [9, 9, 9];
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

  /** The ring at its foot and its glow on the desk: drawn only while lit. */
  private ledMesh: Mesh | null = null;
  private glowMesh: Mesh | null = null;
  /** What a hit squashes (the drum, not its stand), and the head's height above the desk. */
  private squashed: import('@iwsdk/core').Object3D = new Group();
  headY = 0;
  private topCymbal: import('@iwsdk/core').Object3D | null = null;
  private wobble = 0;
  private model: Group;
  private depth = 0.05;
  /** How it is aimed: turned to face the player (yaw) and tipped toward them (tilt), radians. */
  yaw = 0;
  tilt = 0;
  /** Turn it to face the player at (0, PLAYER_Z) from where it stands, tipped by its own tilt, pivoting at the head's
   * centre (the stand follows the drum's foot). */
  aim(): void {
    const lane = this.lane;
    this.tilt = TILT[lane];
    this.yaw = Math.atan2(-this.x, PLAYER_Z - this.z);
    const t = this.tilt;
    const ps = this.yaw;
    // the ripple rings lie on the head as it is tipped
    for (const rp of this.ripples) {
      rp.rotation.order = 'YXZ';
      rp.rotation.set(-Math.PI / 2 + t, ps, 0);
    }
    const cym = this.model.getObjectByName('Cymbals');
    if (lane === 'hat' || lane === 'crash' || lane === 'ride') {
      if (cym) {
        cym.rotation.order = 'YXZ';
        cym.rotation.set(t, ps, 0);
        if (this.topCymbal === cym) {
          this.cymRX = t;
          this.cymRZ = 0;
        }
      }
      return;
    }
    if (lane === 'kick' || lane === 'floor' || t === 0) return;
    // the drum (or the e-kit pad): the model's child that holds the head
    let node = this.model.getObjectByName('Drum') ?? null;
    while (node && node.parent && node.parent !== this.model) node = node.parent;
    if (!node) return;
    const d = this.depth;
    node.rotation.order = 'YXZ';
    node.rotation.set(t, ps, 0);
    node.position.set(-d * Math.sin(t) * Math.sin(ps), HEAD_Y[lane] - d * Math.cos(t), -d * Math.sin(t) * Math.cos(ps));
    const stand = this.model.getObjectByName('Stand');
    if (stand) stand.position.set(node.position.x, 0, node.position.z);
  }
  private glowMats: MeshStandardMaterial[] = [];
  private cymRX = 0;
  private cymRZ = 0;
  private wobbleT = 0;

  constructor(readonly lane: Lane, hc = false, readonly style: KitStyle = 'acoustic') {
    const spec = PADS[lane];
    this.radius = spec.size / 2;
    const R = this.radius;
    this.group.name = `Pad-${lane}`;
    this.base.setHex(LED[lane]);
    // the drum itself (the hat: a hi-hat), its head the part a hit dents
    const model = buildLane(lane, spec.size, style);
    this.model = model;
    this.depth = style === 'electronic' ? (EPAD_DEPTH[lane] ?? 0.035) : (DEPTH[lane] ?? 0.05);
    const cym = lane === 'hat' || lane === 'crash' || lane === 'ride';
    const headMesh = model.getObjectByName(cym ? 'Top' : 'Head') as Mesh | undefined;
    this.head = (headMesh?.material as MeshStandardMaterial | undefined) ?? new MeshStandardMaterial();
    this.hoopMat = ((model.getObjectByName('Hoop') ?? model.getObjectByName('Clutch')) as Mesh | undefined)?.material as MeshStandardMaterial | undefined;
    // (an electronic pad's LED strip flares on a hit)
    model.traverse((o) => {
      const mm = (o as Mesh).material as MeshStandardMaterial | undefined;
      if (o.name === 'Glow' && mm) this.glowMats.push(mm);
    });
    this.body.add(model);
    this.group.add(this.body);
    // (a hit squashes the drum, not its stand)
    this.squashed = model.getObjectByName('Drum') ?? model.getObjectByName('Cymbals') ?? model;
    this.headY = HEAD_Y[lane];
    this.topCymbal = cym ? (model.getObjectByName(lane === 'hat' ? 'Top' : 'Cymbals') ?? null) : null;
    this.cymRX = this.topCymbal?.rotation.x ?? 0;
    this.cymRZ = this.topCymbal?.rotation.z ?? 0;
    // it sits on the desk: a soft shadow under it
    // (the drums that stand on the desk itself, the bass drum and floor tom, sit in a tighter, darker shadow)
    const onDesk = lane === 'kick' || lane === 'floor';
    this.group.add(contactShadow(spec.size * (onDesk ? 1.2 : 1.5), spec.size * (onDesk ? 1.2 : 1.5), onDesk ? 1 : 0.9));
    // the LED ring round the base, and its glow on the table
    // (the ring at its foot is off at rest: it lights only when a song asks for this drum)
    this.led = new MeshBasicMaterial({ color: 0x000000, toneMapped: false, transparent: true, opacity: 0 });
    const led = new Mesh(new RingGeometry(R * 1.04, R * 1.1, 64), this.led);
    led.rotation.x = -Math.PI / 2;
    led.position.y = 0.0015;
    this.ledGlow = asLight(new MeshBasicMaterial({ color: this.base, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    const glow = new Mesh(new RingGeometry(R * 1.0, R * 1.55, 64), this.ledGlow);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.001;
    glow.renderOrder = 3;
    // ripple rings that spread across the head on a hit
    const ringGeo = new RingGeometry(0.9, 1, 48);
    for (let k = 0; k < 3; k++) {
      const rp = new Mesh(ringGeo, asLight(new MeshBasicMaterial({ color: this.base.clone(), transparent: true, opacity: 0, depthWrite: false, toneMapped: false })));
      rp.rotation.x = -Math.PI / 2;
      rp.position.y = HEAD_Y[lane] + 0.0008;
      rp.renderOrder = 4;
      rp.visible = false;
      this.ripples.push(rp);
    }
    const shadow = new Mesh(flatPlane(), new MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
    shadow.scale.setScalar(R * 2.8);
    shadow.position.y = 0.0006;
    shadow.renderOrder = 1;
    this.ledMesh = led;
    this.glowMesh = glow;
    this.group.add(led, glow, ...this.ripples, shadow);
    this.group.visible = false;
  }

  setContrast(hc: boolean): void {
    void hc;
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
    if (this.topCymbal) {
      this.wobble = Math.max(this.wobble, (0.05 + 0.08 * gain) * (motion.calm ? 0.4 : 1));
      this.wobbleT = 0;
    }
    this.squashT = 0;
    this.squashK = gain;
    this.flash = Math.max(this.flash, 0.4 + 0.6 * gain);
    for (let k = 0; k < 3; k++) this.rippleAge[k] = -0.08 * k;
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
      // dents at once, eases back
      const env = k < 0.12 ? k / 0.12 : Math.pow((1 - k) / 0.88, 2);
      const amp = (0.04 + 0.08 * this.squashK) * (motion.calm ? 0.5 : 1);
      sy = 1 - amp * env;
      sxz = 1 + amp * 0.3 * env;
    }
    this.body.scale.setScalar(s);
    this.squashed.scale.set(sxz, sy, sxz);
    for (let k = 0; k < 3; k++) {
      if (this.rippleAge[k] > 0.15) continue;
      this.rippleAge[k] += dt;
      const rp = this.ripples[k];
      const u = Math.max(0, Math.min(1, this.rippleAge[k] / 0.15));
      rp.visible = this.rippleAge[k] >= 0 && u < 1;
      const r = 1 - Math.pow(1 - u, 2);
      rp.scale.setScalar(this.radius * (0.15 + 0.85 * r));
      (rp.material as MeshBasicMaterial).opacity = 0.6 * (1 - 0.3 * k) * (0.4 + 0.6 * this.squashK) * Math.pow(1 - u, 2);
      rp.position.y = this.headY + 0.0008;
    }
    this.flash = Math.max(0, this.flash - dt * 4);
    this.white = Math.max(0, this.white - dt * 3);
    this.dim = Math.max(0, this.dim - dt * 2.5);
    const target = Math.max(this.ask * 0.8, this.flash, this.white);
    // up at once (the frame you hit it), down smoothly
    if (target > this.shown) this.shown = target;
    else this.shown += (target - this.shown) * Math.min(1, dt * 12);
    this.ask = 0;
    const lit = this.shown * (1 - 0.7 * this.dim);
    this.led.color.copy(this.base).multiplyScalar(lit * (1 - 0.6 * this.dim)).lerp(_white, this.white * 0.8);
    this.led.opacity = Math.min(1, lit * 1.5);
    this.ledGlow.opacity = lit * 0.9;
    const on = lit > 0.01 || this.white > 0.01;
    if (this.ledMesh) this.ledMesh.visible = on;
    if (this.glowMesh) this.glowMesh.visible = on;
    // the hoop glints on a hit
    if (this.hoopMat) this.hoopMat.emissive.setScalar(this.flash * 0.35);
    for (const g of this.glowMats) g.emissiveIntensity = 0.3 + this.flash * 2.4;
    // a cymbal swings on its clutch and settles
    if (this.topCymbal && this.wobble > 0.001) {
      this.wobbleT += dt;
      this.wobble *= Math.exp(-dt * 5);
      // (a crash swings wider and slower than the hat's tight pair)
      const a = this.wobble * Math.sin(this.wobbleT * (this.lane === 'hat' ? 34 : 22)) * (this.lane === 'crash' ? 2.2 : this.lane === 'ride' ? 1.2 : 1);
      this.topCymbal.rotation.x = this.cymRX + a;
      this.topCymbal.rotation.z = this.cymRZ + a * 0.6;
    }
  }

  get light(): number {
    return this.shown;
  }
}
