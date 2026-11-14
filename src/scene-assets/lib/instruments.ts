/**
 * The desk instruments as the real things, each laid out from its zones (kit-local: x right, zone z away from you,
 * metres) and moving when played. A piano: a black lacquered case with a red felt strip and a nameboard, ivory keys
 * that sink when pressed, ebony keys behind them, a wide ebony chord key. A guitar lying flat: a spruce top with a
 * soundhole and rosette, a bridge, a rosewood neck with frets and its three chord positions, six strings that shimmer
 * when strummed. A handpan: a nitrided steel shell with its tone fields and raised ding. A marimba: rosewood bars
 * that bounce, on a frame. Deterministic: the same in the app and the editor.
 */
import { BoxGeometry, CircleGeometry, PlaneGeometry, ShapeGeometry, Path, SphereGeometry, DoubleSide, MeshBasicMaterial, CylinderGeometry, ExtrudeGeometry, Group, LatheGeometry, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, RingGeometry, Shape, TorusGeometry, Vector2, Vector3 } from '@iwsdk/core';
import type { Zone } from '../../room/zones.js';
import { CONGA, GUITAR, HANDPAN, KEYBOARD, MARIMBA, PIANO_CHORD, handpanShape, handpanY } from '../../kit/shelf.js';
import { KEY, buildPiano, isBlack } from './piano.js';
import { fineNormal, hammered, rawhide, straightGrain, tortoiseShell, woodGrain } from './surfaces.js';

const mat = (name: string, color: number, roughness: number, metalness = 0) => new MeshStandardMaterial({ name, color, roughness, metalness });
const named = <T extends { name: string }>(o: T, n: string): T => {
  o.name = n;
  return o;
};

/** Something on the desk that plays: laid out from its zones, moved by hits. */
export interface DeskModel {
  readonly root: Group;
  layout(zones: readonly Zone[]): void;
  struck(i: number, gain: number): void;
  /** Light part i at k (0..1) when a song asks for it, if it lights itself (else the overlay does). */
  light?(i: number, k: number): void;
  update(dt: number): void;
}

/** A spring that kicks on a hit and settles (key dips, bar bounces). */
/** The keyboard's pads light in these as you play. */
const PAD_COLOURS = [0x40c8ff, 0x7a6cff, 0xff5a8a, 0xffa030, 0x40ff90, 0xffe040];

class Springs {
  x: Float32Array;
  v: Float32Array;
  constructor(n: number) {
    this.x = new Float32Array(n);
    this.v = new Float32Array(n);
  }
  kick(i: number, k: number): void {
    if (i >= 0 && i < this.v.length) this.v[i] -= k;
  }
  step(dt: number, stiff = 900, damp = 28): void {
    // (in steps of at most 4 ms: a stiff, damped spring stepped a whole frame at once goes unstable or never moves)
    const total = Math.min(dt, 1 / 30);
    const n = Math.max(1, Math.ceil(total / 0.004));
    const h = total / n;
    for (let k = 0; k < n; k++)
      for (let i = 0; i < this.x.length; i++) {
        this.v[i] += (-stiff * this.x[i] - damp * this.v[i]) * h;
        this.x[i] += this.v[i] * h;
      }
  }
}

/**
 * The keyboard: the real-size keyboard of lib/piano.ts (two octaves and a top C, keys pivoting at their backs, a
 * deep lacquered case), placed where the piano's zones are, and a red rubber chord button on a pod to its left.
 * A key goes down when played and springs back.
 */
export class PianoModel implements DeskModel {
  readonly root = named(new Group(), 'Piano');
  private keys: Group[] = [];
  private blacks: Group[] = [];
  private button: Mesh | null = null;
  private buttonY = 0;
  private spring = new Springs(48);
  private readonly lacquer = new MeshPhysicalMaterial({ name: 'Lacquer', color: 0x0c0c0e, roughness: 0.32, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.08 });
  private readonly satin = new MeshStandardMaterial({ name: 'Satin', color: 0x111113, roughness: 0.55 });
  private readonly wheelMat = new MeshStandardMaterial({ name: 'Wheel', color: 0x1c1c1f, roughness: 0.6 });
  private readonly padMat = new MeshStandardMaterial({ name: 'ChordPad', color: 0x55575e, roughness: 0.8, emissive: 0xffe6b8, emissiveIntensity: 0 });
  private padGlow = 0;

  layout(zones: readonly Zone[]): void {
    this.root.clear();
    this.keys = [];
    this.blacks = [];
    const whites = zones.filter((q) => q.i < PIANO_CHORD);
    if (!whites.length) return;
    // its centre where the zones' keys are centred; its front edge at the zones' front; the case takes in the end
    // panel to the left of the keys, out to just past the chord pad
    const cx = (whites[0].x + whites[whites.length - 1].x) / 2;
    const chord = zones.find((q) => q.i === PIANO_CHORD);
    const keysLeft = cx - (whites.length * KEYBOARD.pitch) / 2;
    const left = chord ? Math.max(0, keysLeft - (chord.x - chord.w * 1.1)) : 0;
    const parts = buildPiano({ low: 48, octaves: 2, left });
    parts.root.position.set(cx, 0, -KEYBOARD.front);
    this.root.add(parts.root);
    // its meter and power light, for the life in update
    this.pads = [];
    parts.root.getObjectByName('Pads')?.children.forEach((c) => this.pads.push((c as Mesh).material as MeshStandardMaterial));
    this.padK = this.pads.map(() => 0);
    this.power = ((parts.root.getObjectByName('Power') as Mesh | undefined)?.material as MeshStandardMaterial | undefined) ?? null;
    const mids = [...parts.keys.keys()].sort((a, b) => a - b);
    for (const m of mids) (isBlack(m) ? this.blacks : this.keys).push(parts.keys.get(m)!);
    // on the end panel, as on a stage keyboard: pitch and mod wheels at the back, and in front of them the chord
    // pad, a square that lights when it plays a chord
    if (chord) {
      const podH = KEYBOARD.top - 0.004;
      const wheel = new CylinderGeometry(0.02, 0.02, 0.009, 32);
      for (const dx of [-0.011, 0.011]) {
        const w = named(new Mesh(wheel, this.wheelMat), 'Wheel');
        w.rotation.z = Math.PI / 2;
        w.position.set(chord.x + dx, podH - 0.008, -chord.z - 0.075);
        this.root.add(w);
      }
      const pad = named(new Mesh(new BoxGeometry(chord.w * 1.7, 0.006, chord.w * 1.7), this.padMat), 'ChordPad');
      this.buttonY = podH + 0.003;
      pad.position.set(chord.x, this.buttonY, -chord.z);
      this.root.add(pad);
      this.button = pad;
    }
  }

  /** Key i (the white keys; 15 the chord button; 30 and up the black keys) goes down. */
  struck(i: number, gain: number): void {
    this.spring.kick(i, 0.35 + 0.3 * gain);
    if (i === PIANO_CHORD) this.padGlow = 0.6 + 0.6 * gain;
    // (a key lights one of the panel's pads in its own colour, the way a controller echoes what you play)
    const k = this.pads.length ? i % this.pads.length : -1;
    if (k >= 0) {
      this.pads[k].emissive.setHex(PAD_COLOURS[i % PAD_COLOURS.length]);
      this.padK[k] = 0.5 + 0.8 * gain;
    }
  }
  private pads: MeshStandardMaterial[] = [];
  private padK: number[] = [];
  private power: MeshStandardMaterial | null = null;
  private life = 0;

  update(dt: number): void {
    // down 4 to 8 mm in about 40 ms, back over about 170 (critically damped, no bounce)
    this.spring.step(dt, 625, 50);
    const press = (k: Group, x: number) => (k.rotation.x = KEY.press * Math.min(1, Math.max(0, -x / 0.008)));
    for (let i = 0; i < this.keys.length; i++) press(this.keys[i], this.spring.x[i]);
    for (let j = 0; j < this.blacks.length; j++) press(this.blacks[j], this.spring.x[30 + j]);
    if (this.button) this.button.position.y = this.buttonY + Math.max(-0.004, Math.min(0, this.spring.x[PIANO_CHORD]));
    // the meter jumps with what you play and falls back; the power light breathes, slowly
    for (let k = 0; k < this.pads.length; k++) {
      if (this.padK[k] <= 0) continue;
      this.padK[k] = Math.max(0, this.padK[k] - dt * 2.5);
      this.pads[k].emissiveIntensity = this.padK[k];
    }
    this.life += dt;
    if (this.power) this.power.emissiveIntensity = 0.45 + 0.35 * Math.sin(this.life * 1.3);
    // (it lights as it plays, 80 ms in, out over a quarter second)
    if (this.padGlow > 0) {
      this.padGlow = Math.max(0, this.padGlow - dt * 4);
      this.padMat.emissiveIntensity = this.padGlow;
    }
  }
}

/**
 * A guitar's outline (top view, x along the body from the neck end, y across it): the upper bout by the neck smaller
 * (0.78 of the width), the waist (0.62) a little toward the neck, the lower bout the widest.
 */
function guitarShape(len: number, wid: number): Shape {
  const s = new Shape();
  const L = len / 2;
  const W = wid / 2;
  s.moveTo(-L, 0);
  s.bezierCurveTo(-L, W * 0.62, -L * 0.62, W * 0.8, -L * 0.32, W * 0.74);
  s.bezierCurveTo(-L * 0.18, W * 0.7, -L * 0.14, W * 0.6, -L * 0.04, W * 0.62);
  s.bezierCurveTo(L * 0.18, W * 0.66, L * 0.3, W * 1.0, L * 0.62, W * 1.0);
  s.bezierCurveTo(L * 0.92, W * 1.0, L, W * 0.62, L, 0);
  s.bezierCurveTo(L, -W * 0.62, L * 0.92, -W * 1.0, L * 0.62, -W * 1.0);
  s.bezierCurveTo(L * 0.3, -W * 1.0, L * 0.18, -W * 0.66, -L * 0.04, -W * 0.62);
  s.bezierCurveTo(-L * 0.14, -W * 0.6, -L * 0.18, -W * 0.7, -L * 0.32, -W * 0.74);
  s.bezierCurveTo(-L * 0.62, -W * 0.8, -L, -W * 0.62, -L, 0);
  return s;
}

/**
 * An acoustic guitar lying on its back on the desk, at a guitar's proportions cut to a tray: a clear-coated spruce
 * top with cream binding, a three-ring rosette and a tortoiseshell pickguard, mahogany sides 4.5 cm deep, a rosewood
 * bridge with six pins and a bone saddle; a rosewood fretboard with frets at their real spacing and pearl dots at
 * 3, 5, 7, 9 and 12; a headstock tipped back with three tuners a side; three bronze strings and three steel. The
 * chord positions on the neck show nothing until a song asks; strummed strings shimmer.
 */
export class GuitarModel implements DeskModel {
  readonly root = named(new Group(), 'Guitar');
  private strings: Mesh[] = [];
  private shake = 0;
  private t = 0;
  private body = named(new Group(), 'Body');
  private neck = named(new Group(), 'Neck');
  private readonly spruce = (() => {
    const map = woodGrain(61).clone();
    map.needsUpdate = true;
    map.repeat.set(9, 30);
    return new MeshPhysicalMaterial({ name: 'Spruce', color: 0xe0bf86, map, roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.12 });
  })();
  private readonly side = new MeshPhysicalMaterial({ name: 'Mahogany', color: 0x5a2c16, map: woodGrain(63), roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.15 });
  private readonly rosewood = mat('Rosewood', 0x2e1810, 0.5);
  private readonly bronze = mat('Bronze', 0xb89a6a, 0.18, 1);
  private readonly steel = mat('Steel', 0xd8d6d0, 0.18, 1);
  private readonly chrome = mat('Chrome', 0xe2e5ea, 0.16, 1);
  private readonly bone = mat('Bone', 0xeee6d2, 0.4);
  private readonly cream = mat('Binding', 0xefe6d0, 0.35);
  private readonly pearl = mat('Pearl', 0xf0ece2, 0.25);
  private readonly tortoise = new MeshPhysicalMaterial({ name: 'Tortoise', color: 0x5a2a14, map: tortoiseShell(), roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.15 });

  constructor() {
    this.root.add(this.body, this.neck);
  }

  layout(zones: readonly Zone[]): void {
    this.body.clear();
    this.neck.clear();
    this.strings = [];
    const pads = zones.filter((q) => q.degree >= 0);
    const strs = zones.filter((q) => q.degree < 0);
    if (!strs.length || !pads.length) return;
    const T = GUITAR.top;
    const zc = strs.reduce((a, q) => a + q.z, 0) / strs.length;
    const bx0 = strs[0].x - strs[0].w / 2 - 0.02;
    const bx1 = strs[0].x + strs[0].w / 2 + 0.05;
    const len = bx1 - bx0;
    // (a body about 0.78 as wide as it is long, like a dreadnought's)
    const wid = Math.min(0.215, len * 0.78);
    const cx = (bx0 + bx1) / 2;
    // the body: spruce top and back on mahogany sides
    const shape = guitarShape(len, wid);
    const box = named(new Mesh(new ExtrudeGeometry(shape, { depth: T - 0.004, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0015, bevelSegments: 2, curveSegments: 28 }), [this.spruce, this.side]), 'Box');
    box.rotation.x = -Math.PI / 2;
    box.position.set(cx, 0.0015, -zc);
    // the binding: a cream line round the top's edge
    const outer = guitarShape(len + 0.003, wid + 0.003);
    const inner = guitarShape(len - 0.003, wid - 0.003);
    outer.holes.push(new Path(inner.getPoints(28).reverse()));
    const binding = named(new Mesh(new ShapeGeometry(outer, 28), this.cream), 'Binding');
    binding.rotation.x = -Math.PI / 2;
    binding.position.set(cx, T + 0.0003, -zc);
    // the soundhole with its rosette (three rings), the pickguard below it
    const hx = cx - len * 0.16;
    const hole = named(new Mesh(new CircleGeometry(0.03, 48), mat('Soundhole', 0x0b0806, 0.9)), 'Soundhole');
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(hx, T + 0.0004, -zc);
    const rings = named(new Group(), 'Rosette');
    for (const [r0, r1, m] of [[0.0315, 0.033, this.rosewood], [0.0345, 0.0375, this.cream], [0.039, 0.0405, this.rosewood]] as const) {
      const ring = new Mesh(new RingGeometry(r0, r1, 56), m);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(hx, T + 0.0005, -zc);
      rings.add(ring);
    }
    // the pickguard: a tortoiseshell teardrop on the treble side, its inner edge following the rosette
    const gs = new Shape();
    const a0 = -0.15;
    const a1 = 1.35;
    gs.absarc(0, 0, 0.043, a0, a1, false);
    gs.quadraticCurveTo(Math.cos(a1) * 0.075, Math.sin(a1) * 0.075, Math.cos((a0 + a1) / 2) * 0.092, Math.sin((a0 + a1) / 2) * 0.092);
    gs.quadraticCurveTo(Math.cos(a0) * 0.08, Math.sin(a0) * 0.08, Math.cos(a0) * 0.043, Math.sin(a0) * 0.043);
    const guard = named(new Mesh(new ShapeGeometry(gs, 24), this.tortoise), 'Pickguard');
    guard.rotation.x = -Math.PI / 2;
    guard.position.set(hx, T + 0.0005, -zc);
    // the bridge with six pins and the saddle
    const brx = cx + len * 0.24;
    const bridge = named(new Mesh(new BoxGeometry(0.016, 0.005, 0.075), this.rosewood), 'Bridge');
    bridge.position.set(brx, T + 0.0025, -zc);
    const saddle = named(new Mesh(new BoxGeometry(0.003, 0.004, 0.062), this.bone), 'Saddle');
    saddle.position.set(brx - 0.004, T + 0.006, -zc);
    this.body.add(box, binding, hole, rings, guard, bridge, saddle);
    const pin = new CylinderGeometry(0.0018, 0.0018, 0.003, 10);
    for (let k = 0; k < 6; k++) {
      const p = new Mesh(pin, this.bone);
      p.position.set(brx + 0.004, T + 0.0055, -(zc + (k - 2.5) * 0.011));
      this.body.add(p);
    }
    // the neck: from the body's upper bout to the nut past the chord positions; the fretboard on it
    const nx0 = Math.min(...pads.map((q) => q.x - q.w / 2)) - 0.035;
    const nx1 = bx0 + 0.02;
    const B = GUITAR.board;
    // a real neck: 34 mm at the nut widening to 42 where it meets the body, the back rounded under it, a heel
    const wN = 0.034;
    const wB = 0.042;
    const widthAt = (x: number) => wN + ((wB - wN) * (x - nx0)) / Math.max(0.01, nx1 - nx0);
    const taper = (x0: number, x1: number, w0: number, w1: number, th: number) => {
      const sh = new Shape();
      sh.moveTo(x0, -w0 / 2);
      sh.lineTo(x1, -w1 / 2);
      sh.lineTo(x1, w1 / 2);
      sh.lineTo(x0, w0 / 2);
      sh.lineTo(x0, -w0 / 2);
      const g = new ExtrudeGeometry(sh, { depth: th, bevelEnabled: true, bevelSize: 0.0012, bevelThickness: 0.0012, bevelSegments: 2 });
      g.rotateX(-Math.PI / 2);
      return g;
    };
    const neckBack = named(new Mesh(taper(nx0, nx1, wN - 0.002, wB - 0.002, 0.014), this.side), 'NeckBack');
    neckBack.position.set(0, B - 0.019, -zc);
    const fb = named(new Mesh(taper(nx0, nx1, wN, wB, 0.004), this.rosewood), 'Fretboard');
    fb.position.set(0, B - 0.004, -zc);
    const nut = named(new Mesh(new BoxGeometry(0.004, 0.006, wN), this.bone), 'Nut');
    nut.position.set(nx0 + 0.002, B + 0.001, -zc);
    const heel = named(new Mesh(new BoxGeometry(0.022, B - 0.006, wB - 0.004), this.side), 'Heel');
    heel.position.set(nx1 - 0.011, (B - 0.006) / 2, -zc);
    this.neck.add(neckBack, fb, nut, heel);
    // frets at their real places: the nut to the saddle is the scale; fret n sits at S·(1 − 2^(−n/12))
    const S = brx - 0.004 - nx0;
    const fretGeo = new BoxGeometry(0.0018, 0.0018, 1);
    const fretX = (n: number) => nx0 + S * (1 - Math.pow(2, -n / 12));
    for (let n = 1; fretX(n) < nx1 - 0.004; n++) {
      const f = named(new Mesh(fretGeo, this.steel), 'Fret');
      f.scale.z = widthAt(fretX(n));
      f.position.set(fretX(n), B + 0.0006, -zc);
      this.neck.add(f);
    }
    const dot = new CircleGeometry(0.0035, 20);
    for (const [n, dz] of [[3, 0], [5, 0], [7, 0], [9, 0], [12, -0.012], [12, 0.012]] as const) {
      const x = (fretX(n - 1) + fretX(n)) / 2;
      if (x > nx1 - 0.004) continue;
      const m = new Mesh(dot, this.pearl);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, B + 0.0003, -(zc + dz));
      this.neck.add(m);
    }
    // the chord positions: nothing at rest; a pressed one dips and glows under the finger
    this.pads = [];
    pads.forEach((q, c) => {
      const m = named(new Mesh(new PlaneGeometry(q.w * 0.8, 0.046), new MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })), `ChordPress${c}`);
      m.rotation.x = -Math.PI / 2;
      m.position.set(q.x, B + 0.0004, -zc);
      this.neck.add(m);
      this.pads.push(m);
    });
    // the headstock, tipped back 13° toward the desk, three tuners a side
    const head = named(new Group(), 'Headstock');
    head.position.set(nx0, B - 0.003, -zc);
    head.rotation.z = -0.23;
    // (11 cm long, flaring from the nut's 42 mm to 50, 9 mm thick, a shallow V at its top)
    const hs = new Shape();
    hs.moveTo(0, -0.021);
    hs.lineTo(-0.11, -0.025);
    hs.lineTo(-0.114, 0);
    hs.lineTo(-0.11, 0.025);
    hs.lineTo(0, 0.021);
    hs.lineTo(0, -0.021);
    const hg = new ExtrudeGeometry(hs, { depth: 0.009, bevelEnabled: true, bevelSize: 0.0012, bevelThickness: 0.0012, bevelSegments: 2 });
    hg.rotateX(-Math.PI / 2);
    const plate = new Mesh(hg, this.side);
    plate.position.y = -0.0045;
    head.add(plate);
    const post = new CylinderGeometry(0.0022, 0.0022, 0.01, 10);
    const shaft = new CylinderGeometry(0.0015, 0.0015, 0.008, 8);
    const button = new CylinderGeometry(0.004, 0.004, 0.003, 16);
    for (let k = 0; k < 3; k++)
      for (const sd of [-1, 1]) {
        const x = -0.025 - k * 0.028;
        const w = 0.021 + (0.004 * (k * 0.028 + 0.025)) / 0.11;
        const p = new Mesh(post, this.chrome);
        p.position.set(x, 0.009, sd * (w - 0.007));
        const sft = new Mesh(shaft, this.chrome);
        sft.rotation.x = Math.PI / 2;
        sft.position.set(x, 0, sd * (w + 0.004));
        const b = new Mesh(button, this.chrome);
        b.rotation.x = Math.PI / 2;
        b.position.set(x, 0, sd * (w + 0.009));
        head.add(p, sft, b);
      }
    this.neck.add(head);
    // six strings from the bridge to the nut: the low three wound bronze, the high three plain steel
    // (5.8 mm apart at the nut, fanning out to 8.5 at the saddle)
    strs.forEach((q, i) => {
      const r = 0.001 - i * 0.00008;
      const a = new Vector3(nx0, GUITAR.strings, -(zc + (i - 2.5) * 0.0058));
      const b = new Vector3(brx, GUITAR.strings, -(zc + (i - 2.5) * 0.0085));
      const s = named(new Mesh(new CylinderGeometry(r, r, a.distanceTo(b), 8), i < 3 ? this.bronze : this.steel), `String${i}`);
      s.position.copy(a).add(b).multiplyScalar(0.5);
      s.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), b.clone().sub(a).normalize());
      this.neck.add(s);
      this.strings.push(s);
    });
  }

  /** The chord positions: a fingertip-sized press on the fretboard that dips and lights. */
  private pads: Mesh[] = [];
  private padK = [0, 0, 0];
  struck(i: number, gain: number): void {
    if (i >= 3) this.shake = Math.max(this.shake, 0.5 + 0.5 * gain);
    else this.padK[i] = 0.6 + 0.4 * gain;
  }

  update(dt: number): void {
    this.t += dt;
    // (eased out, gone in about half a second)
    this.shake *= Math.exp(-dt * 5);
    for (let i = 0; i < this.pads.length; i++) {
      this.padK[i] *= Math.exp(-dt * 9);
      const m = this.pads[i];
      m.position.y = GUITAR.board + 0.0004 - 0.0003 * this.padK[i];
      (m.material as MeshBasicMaterial).opacity = this.padK[i] * 0.8;
    }
    // strummed strings blur: a fast shimmer across, dying away
    for (let i = 0; i < this.strings.length; i++) {
      const s = this.strings[i];
      const a = this.shake * 0.0012 * Math.sin(this.t * (90 + i * 13));
      s.position.y = GUITAR.strings + a;
      s.scale.x = 1 + this.shake * 0.6;
      s.scale.z = 1 + this.shake * 0.6;
    }
  }
}

export class HandpanModel implements DeskModel {
  readonly root = named(new Group(), 'Handpan');
  private fields: Mesh[] = [];
  private spring = new Springs(10);
  private glow: number[] = [];
  // nitrided steel: warm bronze, hammered all over
  private readonly steel = (() => {
    const n = hammered().clone();
    n.needsUpdate = true;
    n.repeat.set(14, 14);
    return new MeshStandardMaterial({ name: 'Steel', color: 0x6b5640, roughness: 0.42, metalness: 1, normalMap: n, side: DoubleSide });
  })();
  private readonly rim = new MeshStandardMaterial({ name: 'Rim', color: 0x6b5640, roughness: 0.32, metalness: 1 });
  // (the tone fields are the shell itself, a touch smoother; a fine groove outlines each)
  private readonly fieldMat = new MeshStandardMaterial({ name: 'Field', color: 0x6b5640, roughness: 0.35, metalness: 1 });
  private readonly groove = new MeshStandardMaterial({ name: 'Groove', color: 0x4e3b2a, roughness: 0.6, metalness: 0.6 });

  layout(zones: readonly Zone[]): void {
    this.root.clear();
    this.fields = [];
    if (!zones.length) return;
    const { x: cx, z: cz, R } = handpanShape(zones);
    // the lens: a top shell rising to the ding, a shallower bottom shell down to the desk (its port underneath),
    // joined at a rolled rim
    const top: Vector2[] = [];
    for (let k = 0; k <= 24; k++) {
      const r = R * (1 - k / 24);
      top.push(new Vector2(Math.max(0.0005, r), handpanY(r, R)));
    }
    const shell = named(new Mesh(new LatheGeometry(top.reverse(), 72), this.steel), 'Shell');
    const bottom: Vector2[] = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12;
      bottom.push(new Vector2(R * (1 - 0.45 * t), HANDPAN.rim * (1 - t * t) + 0.001));
    }
    const under = named(new Mesh(new LatheGeometry(bottom, 72), this.steel), 'Bottom');
    const band = named(new Mesh(new TorusGeometry(R, 0.0028, 10, 96), this.rim), 'Rim');
    band.rotation.x = -Math.PI / 2;
    band.position.y = HANDPAN.rim;
    for (const m of [shell, under, band]) m.position.set(cx, m.position.y, -cz);
    this.root.add(shell, under, band);
    // the ding: a raised dome; the tone fields: sunken ovals (longer along the radius) with a dimple, on the shell
    zones.forEach((q, i) => {
      const dx = q.x - cx;
      const dz = q.z - cz;
      const d = Math.hypot(dx, dz);
      const y = handpanY(d, R);
      const g = new Group();
      g.name = i === 0 ? 'Ding' : `Field${i}`;
      g.position.set(q.x, y, -q.z);
      // tip it with the dome under it
      const slope = (HANDPAN.dome * d) / (R * R * Math.sqrt(Math.max(0.05, 1 - (d / R) * (d / R))));
      // (turned to face out from the centre, in the scene's own axes: z toward you is the zones' −z; then tipped
      // outward with the dome)
      g.rotation.order = 'YXZ';
      g.rotation.y = Math.atan2(dx, -dz);
      g.rotation.x = Math.atan(slope);
      const mat = this.fieldMat.clone();
      const oval = new Mesh(new CircleGeometry(q.w * 0.92, 40), mat);
      oval.rotation.x = -Math.PI / 2;
      oval.scale.set(1, i === 0 ? 1 : 1.3, 1);
      oval.position.y = 0.0006;
      const ring = new Mesh(new RingGeometry(q.w * 0.92, q.w * 0.92 + 0.0015, 48), this.groove);
      ring.rotation.x = -Math.PI / 2;
      ring.scale.copy(oval.scale);
      ring.position.y = 0.0008;
      const dome = new Mesh(new SphereGeometry(q.w * (i === 0 ? 0.62 : 0.42), 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
      dome.scale.y = i === 0 ? 0.32 : 0.25;
      g.add(oval, ring, dome);
      this.fields.push(oval);
      this.root.add(g);
    });
  }

  struck(i: number, gain: number): void {
    this.spring.kick(i, 0.1 + 0.2 * gain);
    this.glow[i] = 0.6 + 0.6 * gain;
  }

  /** A field asked for by a song glows on the shell itself. */
  private asked: number[] = [];
  light(i: number, k: number): void {
    this.asked[i] = Math.max(this.asked[i] ?? 0, k);
  }

  update(dt: number): void {
    this.spring.step(dt, 1400, 18);
    for (let i = 0; i < this.fields.length; i++) {
      const ask = this.asked[i] ?? 0;
      this.asked[i] = 0;
      if (ask > (this.glow[i] ?? 0)) this.glow[i] = ask * 0.9;
      const m = this.fields[i];
      // a struck field rings: it swells a touch and glows warm, fading in about a sixth of a second
      const s = 1 + Math.abs(this.spring.x[i]) * 6;
      m.parent!.scale.setScalar(s);
      const g = (this.glow[i] = Math.max(0, (this.glow[i] ?? 0) - dt * 6));
      (m.material as MeshStandardMaterial).emissive.setHex(0xffc27a).multiplyScalar(g);
    }
  }
}

export class MarimbaModel implements DeskModel {
  readonly root = named(new Group(), 'Marimba');
  private bars: Mesh[] = [];
  private barY = MARIMBA.top - 0.008;
  private spring = new Springs(8);
  private readonly wood = (() => {
    // (each bar's uvs run 0 to 1 along it: one stretch of straight grain per bar)
    const map = straightGrain(41).clone();
    map.needsUpdate = true;
    return new MeshPhysicalMaterial({ name: 'Rosewood', color: 0x5a2416, map, roughness: 0.5, clearcoat: 0.2, clearcoatRoughness: 0.45 });
  })();
  private readonly maple = (() => {
    const map = woodGrain(43).clone();
    map.needsUpdate = true;
    map.repeat.set(6, 2);
    return new MeshPhysicalMaterial({ name: 'Maple', color: 0xe8cfa0, map, roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.3 });
  })();
  private readonly rubber = mat('Rubber', 0x26262a, 0.9);
  private readonly pinMetal = mat('Pin', 0xc8ccd2, 0.25, 1);
  private readonly sleeve = mat('Sleeve', 0x1c1c1e, 0.85);
  private readonly yarn = new MeshStandardMaterial({ name: 'Yarn', color: 0x2f5fc4, normalMap: fineNormal(9, 30), roughness: 0.95 });
  private readonly birch = mat('Birch', 0xd9b98a, 0.5);
  private readonly cord = mat('Cord', 0x26211c, 0.9);
  private readonly brass = mat('Brass', 0xc8a050, 0.3, 1);
  private readonly chrome = mat('Chrome', 0xe2e5ea, 0.16, 1);

  layout(zones: readonly Zone[]): void {
    this.root.clear();
    this.bars = [];
    if (!zones.length) return;
    const first = zones[0];
    const last = zones[zones.length - 1];
    const zc = -first.z;
    // the box: light maple, a resonator in itself, wider front to back under the long bass bars than under the short
    // treble ones (a trapezoid seen from above), its long sides cut away underneath into two feet
    const x0 = first.x - first.w / 2 - 0.022;
    const x1 = last.x + last.w / 2 + 0.022;
    const dL = first.h * 0.8 + 0.025;
    const dR = last.h * 0.8 + 0.02;
    const H = MARIMBA.top - 0.019;
    const T = 0.009;
    const side = (s: number) => {
      // a long side: from the bass end to the treble end, its top edge level, its bottom cut away between two feet
      const sh = new Shape();
      const len = Math.hypot(x1 - x0, (dR - dL) / 2);
      sh.moveTo(0, 0);
      sh.lineTo(0.035, 0);
      sh.quadraticCurveTo(0.042, 0.012, 0.06, 0.012);
      sh.lineTo(len - 0.06, 0.012);
      sh.quadraticCurveTo(len - 0.042, 0.012, len - 0.035, 0);
      sh.lineTo(len, 0);
      sh.lineTo(len, H);
      sh.lineTo(0, H);
      sh.lineTo(0, 0);
      const g = new ExtrudeGeometry(sh, { depth: T, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0015, bevelSegments: 2, curveSegments: 8 });
      g.translate(0, 0, -T / 2);
      const m = named(new Mesh(g, this.maple), s < 0 ? 'SideFront' : 'SideBack');
      const za = zc + s * (dL / 2);
      const zb = zc + s * (dR / 2);
      m.position.set(x0, 0, za);
      m.rotation.y = -Math.atan2(zb - za, x1 - x0);
      this.root.add(m);
    };
    side(1);
    side(-1);
    for (const [x, d] of [[x0, dL], [x1, dR]] as const) {
      const end = named(new Mesh(new BoxGeometry(T * 1.4, H + 0.004, d + T * 1.6), this.maple), 'End');
      end.position.set(x, (H + 0.004) / 2, zc);
      this.root.add(end);
    }
    // the floor of the box, just inside, and a dark inside seen between the bars
    const floor = named(new Mesh(new BoxGeometry(x1 - x0, 0.004, (dL + dR) / 2), mat('Inside', 0x2a1c12, 0.9)), 'Inside');
    floor.position.set((x0 + x1) / 2, H * 0.45, zc);
    this.root.add(floor);
    // the bars rest on rubber strips along the top of the long sides, held apart by pins
    const node = (q: Zone) => q.h * 0.28;
    for (const s of [-1, 1]) {
      const za = zc + s * node(first);
      const zb = zc + s * node(last);
      const len = Math.hypot(x1 - x0, zb - za);
      const strip = named(new Mesh(new BoxGeometry(len - 0.02, 0.003, 0.008), this.rubber), 'Strip');
      strip.position.set((x0 + x1) / 2, H + 0.0015, (za + zb) / 2);
      strip.rotation.y = -Math.atan2(zb - za, x1 - x0);
      // the rail under the strip (where the bars' nodes sit)
      const rail = named(new Mesh(new BoxGeometry(len - 0.01, 0.006, 0.012), this.maple), 'Rail');
      rail.position.set((x0 + x1) / 2, H - 0.002, (za + zb) / 2);
      rail.rotation.y = strip.rotation.y;
      this.root.add(rail, strip);
      for (let k = 0; k <= zones.length; k++) {
        const px = k === 0 ? first.x - first.w / 2 - 0.006 : k === zones.length ? last.x + last.w / 2 + 0.006 : (zones[k - 1].x + zones[k].x) / 2;
        const t = (px - x0) / (x1 - x0);
        const pin = named(new Mesh(new CylinderGeometry(0.002, 0.002, 0.016, 10), this.pinMetal), 'Pin');
        pin.position.set(px, H + 0.008, za + (zb - za) * t);
        const sleeve = new Mesh(new CylinderGeometry(0.0035, 0.0035, 0.008, 12), this.sleeve);
        sleeve.position.set(px, H + 0.007, za + (zb - za) * t);
        this.root.add(pin, sleeve);
      }
    }
    zones.forEach((q, i) => {
      // a rosewood bar: rounded ends, softened edges, the grain along it, a little thicker in the bass
      const k0 = i / Math.max(1, zones.length - 1);
      const w = 0.021;
      const h = q.h / 2;
      const r = Math.min(0.006, w * 0.35);
      const shape = new Shape();
      shape.moveTo(-w + r, -h);
      shape.lineTo(w - r, -h);
      shape.quadraticCurveTo(w, -h, w, -h + r);
      shape.lineTo(w, h - r);
      shape.quadraticCurveTo(w, h, w - r, h);
      shape.lineTo(-w + r, h);
      shape.quadraticCurveTo(-w, h, -w, h - r);
      shape.lineTo(-w, -h + r);
      shape.quadraticCurveTo(-w, -h, -w + r, -h);
      const th = 0.013 - 0.002 * k0;
      const g = new ExtrudeGeometry(shape, { depth: th, bevelEnabled: true, bevelThickness: 0.001, bevelSize: 0.001, bevelSegments: 3, curveSegments: 5 });
      // (uvs: along the bar 0 to 1, across it a narrow band, each bar its own stretch of the grain)
      const pos = g.attributes.position;
      const uv = g.attributes.uv;
      for (let v = 0; v < pos.count; v++) uv.setXY(v, (pos.getY(v) + h) / (2 * h), ((pos.getX(v) + w) / (2 * w)) * 0.22 + i * 0.11);
      uv.needsUpdate = true;
      g.rotateX(-Math.PI / 2);
      g.translate(0, -th + 0.0065, 0);
      const bar = named(new Mesh(g, this.wood), `Bar${i}`);
      bar.position.set(q.x, this.barY, -q.z);
      this.bars.push(bar);
      // the cord holes at the nodes: two small dark dots on the bar's top
      for (const s of [-1, 1]) {
        const hole = new Mesh(new CylinderGeometry(0.0013, 0.0013, 0.0006, 10), mat('Hole', 0x120806, 0.9));
        hole.position.set(0, 0.0068, s * node(q));
        bar.add(hole);
      }
      this.root.add(bar);
    });
    // its two mallets, lying beside it: birch handles, wound blue yarn heads
    for (const dx of [0.022, 0.04]) {
      const m = named(new Group(), 'Mallet');
      const handle = new Mesh(new CylinderGeometry(0.0028, 0.0028, 0.2, 10), this.birch);
      handle.rotation.x = Math.PI / 2;
      const head = new Mesh(new SphereGeometry(0.0125, 20, 14), this.yarn);
      head.scale.set(1, 0.92, 1.08);
      head.position.z = -0.105;
      m.add(handle, head);
      m.position.set(x1 + dx, 0.0125, zc + 0.01);
      m.rotation.y = dx > 0.03 ? -0.06 : 0.04;
      this.root.add(m);
    }
  }

  struck(i: number, gain: number): void {
    this.spring.kick(i, 0.1 + 0.2 * gain);
  }

  update(dt: number): void {
    this.spring.step(dt, 1100, 22);
    this.bars.forEach((b, i) => {
      // a struck bar dips and bounces on its cords, rocking a little
      b.position.y = this.barY + Math.max(-0.004, Math.min(0.002, this.spring.x[i]));
      b.rotation.x = this.spring.x[i] * 2;
    });
  }
}

/**
 * Two congas, cut down so your palm lands on the real desk: a staved wood shell with a dark stripe, a rawhide head
 * (warm, mottled, a faint ring where the edge begins), a black rolled crown hoop and its side plates with lugs. Each
 * head dips where it is hit; the middle glows for an open tone, the edge ring for a slap. Zones 0/1 the low drum,
 * 2/3 the high one (see congaZones).
 */
export class CongaModel implements DeskModel {
  readonly root = named(new Group(), 'Congas');
  private heads: Mesh[] = [];
  private marks: Mesh[] = [];
  private spring = new Springs(4);
  private glow = [0, 0, 0, 0];
  // staves of lacquered wood, alternating a shade (grain running down the barrel), a dark stripe
  private readonly wood = (() => {
    const map = woodGrain(57).clone();
    map.needsUpdate = true;
    map.rotation = Math.PI / 2;
    map.repeat.set(1, 6);
    return new MeshPhysicalMaterial({ name: 'Wood', color: 0x7a3f1c, map, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.1 });
  })();
  private readonly stripe = mat('Stripe', 0x2a140a, 0.4, 0.05);
  private readonly crown = mat('Crown', 0x1d1d20, 0.25, 0.8);
  private readonly seam = mat('Seam', 0x4a2412, 0.5);
  private readonly lug = mat('Lug', 0xcfd3d8, 0.2, 1);
  private readonly wrapHide = mat('HideEdge', 0xa88456, 0.8);
  /** The heads' height: a conga's barrel, cut down to a desk, still a barrel (22 cm). */
  static readonly H = CONGA.top;

  layout(zones: readonly Zone[]): void {
    this.root.clear();
    this.heads = [];
    this.marks = [];
    const H = CongaModel.H;
    for (let d = 0; d * 2 + 1 < zones.length; d++) {
      const inner = zones[d * 2];
      const R = zones[d * 2 + 1].w;
      const drum = named(new Group(), d === 0 ? 'Tumba' : 'Quinto');
      drum.position.set(inner.x, 0, -inner.z);
      // the shell: a conga's barrel, narrow at the foot, swelling to its belly a third of the way up, in to the head
      const rAt = (y: number) => {
        const t = Math.max(0, Math.min(1, y / (H - 0.004)));
        // (a real conga's line: the foot 0.82 of the head, swelling to its belly 1.12 a little past halfway, back in
        // to the head)
        return R * (t < 0.55 ? 0.82 + 0.3 * Math.sin((Math.PI / 2) * (t / 0.55)) : 1.12 - 0.12 * Math.pow((t - 0.55) / 0.45, 2));
      };
      const pts: Vector2[] = [];
      for (let k = 0; k <= 16; k++) pts.push(new Vector2(rAt((k / 16) * (H - 0.004)), (k / 16) * (H - 0.004)));
      const shell = named(new Mesh(new LatheGeometry(pts, 48), this.wood), 'Shell');
      // a black rubber foot ring at the bottom
      const band = named(new Mesh(new CylinderGeometry(rAt(0.01) + 0.0012, rAt(0) + 0.0012, 0.01, 48, 1, true), mat('FootRing', 0x151515, 0.85)), 'FootRing');
      band.position.y = 0.005;
      // staves: twelve seams following the barrel's curve, each a short segment hugging it
      const staves = named(new Group(), 'Staves');
      const sg = new BoxGeometry(0.0006, 1, 0.0005);
      const segs = 4;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        for (let k = 0; k < segs; k++) {
          const y0 = (k / segs) * (H - 0.006);
          const y1 = ((k + 1) / segs) * (H - 0.006);
          const r0 = rAt(y0) + 0.0005;
          const r1 = rAt(y1) + 0.0005;
          const s = new Mesh(sg, this.seam);
          s.scale.y = Math.hypot(y1 - y0, r1 - r0);
          s.position.set(Math.cos(a) * (r0 + r1) / 2, (y0 + y1) / 2, Math.sin(a) * (r0 + r1) / 2);
          s.rotation.set(0, -a, 0);
          s.rotateZ(-Math.atan2(r1 - r0, y1 - y0));
          staves.add(s);
        }
      }
      // the head: rawhide, the low drum a shade darker, its own material so it can glow
      const hide = new MeshStandardMaterial({ name: 'Rawhide', color: d === 0 ? 0xd9bd8c : 0xdfc497, map: rawhide(), roughness: 0.6 });
      const head = named(new Mesh(new CylinderGeometry(R * 0.985, R * 0.985, 0.002, 48), hide), 'Head');
      head.position.y = H - 0.002;
      // (where the hide wraps over the edge it's darker: a centimetre band round it)
      const wrap = named(new Mesh(new RingGeometry(R * 0.985 - 0.015, R * 0.985, 48), this.wrapHide), 'HideEdge');
      wrap.rotation.x = -Math.PI / 2;
      wrap.position.y = 0.0011;
      head.add(wrap);
      // the slap zone: nothing painted on the hide; a ring of light that shows only when the edge is played
      const ringMat = new MeshBasicMaterial({ name: 'Edge', color: 0xfff0c0, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
      const ring = named(new Mesh(new RingGeometry(inner.w, R * 0.96, 48), ringMat), 'EdgeLight');
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = H - 0.0008;
      // the crown hoop: a black rolled rim over the head's edge
      // the crown: a rolled black rim over the head's edge with a skirt below it
      const crown = named(new Mesh(new TorusGeometry(R * 1.0, 0.007, 12, 56), this.crown), 'Crown');
      crown.rotation.x = -Math.PI / 2;
      crown.position.y = H - 0.0005;
      const skirt = named(new Mesh(new CylinderGeometry(R + 0.006, R + 0.006, 0.012, 56, 1, true), this.crown), 'Skirt');
      skirt.position.y = H - 0.008;
      // side plates and lugs: four on the low drum, four on the high, each a plate on the shell with a rod to the rim
      const lugs = named(new Group(), 'Lugs');
      // (chrome side plates 35 mm tall, each with its rod up to the crown)
      // chrome side plates from 62 % to 85 % of the height, each with an L-hook up over the crown and a hex nut
      const plate = new BoxGeometry(0.003, H * 0.23, 0.006);
      const hookUp = new CylinderGeometry(0.0022, 0.0022, 1, 8);
      const hookBend = new TorusGeometry(0.004, 0.0022, 6, 10, Math.PI / 2);
      const nut = new CylinderGeometry(0.003, 0.003, 0.004, 6);
      for (let i = 0; i < 6; i++) {
        const a = ((i + 0.5) / 6) * Math.PI * 2;
        const l = named(new Group(), `Lug${i}`);
        const p = new Mesh(plate, this.lug);
        p.position.set(rAt(H * 0.735) + 0.0018, H * 0.735, 0);
        const ny = H * 0.85 + 0.002;
        const nt = new Mesh(nut, this.lug);
        nt.position.set(rAt(H * 0.85) + 0.004, ny, 0);
        const up = new Mesh(hookUp, this.lug);
        const x = R + 0.0105;
        up.scale.y = H - 0.004 - ny;
        up.position.set(x, (ny + H - 0.004) / 2, 0);
        const r = new Mesh(hookBend, this.lug);
        r.rotation.set(Math.PI / 2, 0, 0);
        r.position.set(x - 0.004, H - 0.004, 0);
        l.add(nt, up);
        l.add(p, r);
        l.rotation.y = a;
        lugs.add(l);
      }
      // (the seams are fine detail: they cast no shadow of their own)
      staves.traverse((o) => (o.userData.noShadow = true));
      drum.add(shell, band, staves, head, ring, crown, skirt, lugs);
      this.root.add(drum);
      this.heads.push(head);
      this.marks.push(ring);
    }
  }

  struck(i: number, gain: number): void {
    const d = i >> 1;
    this.spring.kick(d, 0.12 + 0.2 * gain);
    this.glow[i & 3] = 0.5 + 0.6 * gain;
  }

  update(dt: number): void {
    this.spring.step(dt, 1800, 30);
    this.heads.forEach((h, d) => {
      // the head gives under the hand and comes back
      h.position.y = CongaModel.H - 0.002 + Math.max(-0.003, Math.min(0, this.spring.x[d]));
      const open = (this.glow[d * 2] = Math.max(0, this.glow[d * 2] - dt * 6));
      const slap = (this.glow[d * 2 + 1] = Math.max(0, this.glow[d * 2 + 1] - dt * 8));
      (h.material as MeshStandardMaterial).emissive.setHex(0xffb060).multiplyScalar(open * 0.5);
      (this.marks[d].material as MeshBasicMaterial).opacity = Math.min(0.7, slap * 0.8);
    });
  }
}
