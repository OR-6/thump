/**
 * The desk instruments as the real things, each laid out from its zones (kit-local: x right, zone z away from you,
 * metres) and moving when played. A piano: a black lacquered case with a red felt strip and a nameboard, ivory keys
 * that sink when pressed, ebony keys behind them, a wide ebony chord key. A guitar lying flat: a spruce top with a
 * soundhole and rosette, a bridge, a rosewood neck with frets and its three chord positions, six strings that shimmer
 * when strummed. A handpan: a nitrided steel shell with its tone fields and raised ding. A marimba: rosewood bars
 * that bounce, on a frame. Deterministic: the same in the app and the editor.
 */
import { BoxGeometry, CircleGeometry, DoubleSide, MeshBasicMaterial, CylinderGeometry, ExtrudeGeometry, Group, LatheGeometry, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, RingGeometry, Shape, TorusGeometry, Vector2 } from '@iwsdk/core';
import type { Zone } from '../../room/zones.js';
import { CONGA, KEYBOARD, PIANO_CHORD } from '../../kit/shelf.js';
import { KEY, buildPiano, isBlack } from './piano.js';
import { fineNormal, woodGrain } from './surfaces.js';

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
  update(dt: number): void;
}

/** A spring that kicks on a hit and settles (key dips, bar bounces). */
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
    const h = Math.min(dt, 1 / 30);
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
  private readonly rubber = mat('Rubber', 0xc8261c, 0.55);

  layout(zones: readonly Zone[]): void {
    this.root.clear();
    this.keys = [];
    this.blacks = [];
    const whites = zones.filter((q) => q.i < PIANO_CHORD);
    if (!whites.length) return;
    const parts = buildPiano({ low: 48, octaves: 2 });
    // its centre where the zones' keys are centred; its front edge at the zones' front
    const cx = (whites[0].x + whites[whites.length - 1].x) / 2;
    parts.root.position.set(cx, 0, -KEYBOARD.front);
    this.root.add(parts.root);
    const mids = [...parts.keys.keys()].sort((a, b) => a - b);
    for (const m of mids) (isBlack(m) ? this.blacks : this.keys).push(parts.keys.get(m)!);
    // the chord button: a red rubber dome on a lacquered pod, left of the keyboard, as tall as the keys
    const chord = zones.find((q) => q.i === PIANO_CHORD);
    if (chord) {
      const podH = KEYBOARD.top - 0.006;
      const pod = named(new Mesh(new BoxGeometry(chord.w * 2 + 0.016, podH, chord.w * 2 + 0.03), this.lacquer), 'ButtonPod');
      pod.position.set(chord.x, podH / 2, -chord.z);
      const dome = named(new Mesh(new CylinderGeometry(chord.w * 0.92, chord.w, 0.008, 40), this.rubber), 'ChordButton');
      this.buttonY = podH + 0.004;
      dome.position.set(chord.x, this.buttonY, -chord.z);
      this.root.add(pod, dome);
      this.button = dome;
    }
  }

  /** Key i (the white keys; 15 the chord button; 30 and up the black keys) goes down. */
  struck(i: number, gain: number): void {
    this.spring.kick(i, 0.3 + 0.3 * gain);
  }

  update(dt: number): void {
    // down in about 40 ms, back over about 160 (critically damped, no bounce)
    this.spring.step(dt, 1600, 80);
    const press = (k: Group, x: number) => (k.rotation.x = KEY.press * Math.min(1, Math.max(0, -x / 0.008)));
    for (let i = 0; i < this.keys.length; i++) press(this.keys[i], this.spring.x[i]);
    for (let j = 0; j < this.blacks.length; j++) press(this.blacks[j], this.spring.x[30 + j]);
    if (this.button) this.button.position.y = this.buttonY + Math.max(-0.004, Math.min(0, this.spring.x[PIANO_CHORD]));
  }
}

/** A guitar's outline (top view, x along the body, y across it): two bouts and a waist. */
function guitarShape(len: number, wid: number): Shape {
  const s = new Shape();
  const L = len / 2;
  const W = wid / 2;
  s.moveTo(-L, 0);
  s.bezierCurveTo(-L, W * 0.9, -L * 0.45, W * 1.02, -L * 0.15, W * 0.72);
  s.bezierCurveTo(0, W * 0.6, L * 0.1, W * 0.62, L * 0.25, W * 0.82);
  s.bezierCurveTo(L * 0.55, W * 1.08, L, W * 0.9, L, 0);
  s.bezierCurveTo(L, -W * 0.9, L * 0.55, -W * 1.08, L * 0.25, -W * 0.82);
  s.bezierCurveTo(L * 0.1, -W * 0.62, 0, -W * 0.6, -L * 0.15, -W * 0.72);
  s.bezierCurveTo(-L * 0.45, -W * 1.02, -L, -W * 0.9, -L, 0);
  return s;
}

export class GuitarModel implements DeskModel {
  readonly root = named(new Group(), 'Guitar');
  private strings: Mesh[] = [];
  private shake = 0;
  private t = 0;
  private body = named(new Group(), 'Body');
  private neck = named(new Group(), 'Neck');
  private posMarks: Mesh[] = [];
  private spring = new Springs(3);
  private readonly spruce = mat('Spruce', 0xd9b47a, 0.45);
  private readonly side = mat('Mahogany', 0x5a2c16, 0.4);
  private readonly rosewood = mat('Rosewood', 0x3a2016, 0.55);
  private readonly nickel = mat('Nickel', 0xd8d6d0, 0.25, 1);
  private readonly bone = mat('Bone', 0xeee6d2, 0.4);

  constructor() {
    this.root.add(this.body, this.neck);
  }

  layout(zones: readonly Zone[]): void {
    this.body.clear();
    this.neck.clear();
    this.strings = [];
    this.posMarks = [];
    const pads = zones.filter((q) => q.degree >= 0);
    const strs = zones.filter((q) => q.degree < 0);
    if (!strs.length || !pads.length) return;
    const zc = strs.reduce((a, q) => a + q.z, 0) / strs.length;
    const bx0 = strs[0].x - strs[0].w / 2;
    const bx1 = strs[0].x + strs[0].w / 2;
    const len = bx1 - bx0 + 0.05;
    const cx = (bx0 + bx1) / 2 + 0.01;
    // the body: a spruce top on mahogany sides, lying on the desk
    const top = new Mesh(new ExtrudeGeometry(guitarShape(len, 0.17), { depth: 0.012, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 2, curveSegments: 24 }), [this.spruce, this.side]);
    named(top, 'Top');
    top.rotation.x = -Math.PI / 2;
    top.position.set(cx, 0.002, -zc);
    // the soundhole and rosette, under the strum
    const hole = named(new Mesh(new CircleGeometry(0.03, 40), mat('Soundhole', 0x0b0806, 0.9)), 'Soundhole');
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(cx - len * 0.12, 0.0165, -zc);
    const rose = named(new Mesh(new RingGeometry(0.032, 0.038, 48), this.rosewood), 'Rosette');
    rose.rotation.x = -Math.PI / 2;
    rose.position.set(hole.position.x, 0.0166, -zc);
    const bridge = named(new Mesh(new BoxGeometry(0.014, 0.004, 0.07), this.rosewood), 'Bridge');
    bridge.position.set(cx + len * 0.28, 0.0175, -zc);
    const saddle = named(new Mesh(new BoxGeometry(0.003, 0.003, 0.06), this.bone), 'Saddle');
    saddle.position.set(bridge.position.x - 0.003, 0.0205, -zc);
    this.body.add(top, hole, rose, bridge, saddle);
    // the neck: rosewood with nickel frets, running left to the nut; the chord positions sit on it
    const nx0 = Math.min(...pads.map((q) => q.x - q.w / 2)) - 0.03;
    const nx1 = bx0 + 0.01;
    const fb = named(new Mesh(new BoxGeometry(nx1 - nx0, 0.008, 0.05), this.rosewood), 'Fretboard');
    fb.position.set((nx0 + nx1) / 2, 0.012, -zc);
    const heel = named(new Mesh(new BoxGeometry(nx1 - nx0, 0.008, 0.044), this.side), 'NeckBack');
    heel.position.set((nx0 + nx1) / 2, 0.004, -zc);
    const nut = named(new Mesh(new BoxGeometry(0.004, 0.005, 0.05), this.bone), 'Nut');
    nut.position.set(nx0 + 0.002, 0.0175, -zc);
    const head = named(new Mesh(new BoxGeometry(0.05, 0.01, 0.056), this.side), 'Headstock');
    head.position.set(nx0 - 0.026, 0.008, -zc);
    this.neck.add(fb, heel, nut, head);
    const fretGeo = new BoxGeometry(0.0016, 0.0016, 0.05);
    for (let x = nx0 + 0.022; x < nx1; x += 0.024) {
      const f = named(new Mesh(fretGeo, this.nickel), 'Fret');
      f.position.set(x, 0.0168, -zc);
      this.neck.add(f);
    }
    // the chord positions: a pearl inlay each (coloured), lit when picked
    const inlay = new CircleGeometry(0.008, 24);
    const colours = [0xffa630, 0x6fa8ff, 0x2ad1b5];
    pads.forEach((q, i) => {
      const m = named(new Mesh(inlay, mat(`Inlay${i}`, colours[i % 3], 0.3)), `Chord${i}`);
      m.rotation.x = -Math.PI / 2;
      m.position.set(q.x, 0.0168, -q.z);
      this.neck.add(m);
      this.posMarks.push(m);
    });
    // six strings from the bridge to the nut, low (thick) to high (thin)
    strs.forEach((q, i) => {
      const r = 0.0009 - i * 0.00008;
      const s = named(new Mesh(new CylinderGeometry(r, r, bridge.position.x - nx0, 6), this.nickel), `String${i}`);
      s.rotation.z = Math.PI / 2;
      s.position.set((bridge.position.x + nx0) / 2, 0.0215, -(zc + (i - 2.5) * 0.008));
      this.neck.add(s);
      this.strings.push(s);
    });
  }

  struck(i: number, gain: number): void {
    if (i < 3) this.spring.kick(i, 0.2);
    else this.shake = Math.max(this.shake, 0.5 + 0.5 * gain);
  }

  update(dt: number): void {
    this.t += dt;
    this.spring.step(dt);
    this.shake = Math.max(0, this.shake - dt * 1.6);
    // strummed strings blur: a fast shimmer across, dying away
    this.strings.forEach((s, i) => {
      const a = this.shake * 0.0012 * Math.sin(this.t * (90 + i * 13));
      s.position.y = 0.0215 + a;
      s.scale.x = 1 + this.shake * 0.6;
      s.scale.z = 1 + this.shake * 0.6;
    });
    this.posMarks.forEach((m, i) => {
      m.position.y = 0.0168 + Math.max(-0.002, Math.min(0, this.spring.x[i] * 0.3));
      m.scale.setScalar(1 + Math.max(0, -this.spring.x[i]) * 30);
    });
  }
}

export class HandpanModel implements DeskModel {
  readonly root = named(new Group(), 'Handpan');
  private fields: Mesh[] = [];
  private spring = new Springs(10);
  private shell: Mesh | null = null;
  // (both sides drawn: the lathe's faces turn inward, and from above the shell vanished)
  private readonly steel = new MeshStandardMaterial({ name: 'Steel', color: 0x4a3a2c, roughness: 0.32, metalness: 0.85, side: DoubleSide });
  private readonly field = mat('Field', 0x5c4a38, 0.22, 0.9);
  private glow: number[] = [];

  layout(zones: readonly Zone[]): void {
    this.root.clear();
    this.fields = [];
    if (!zones.length) return;
    const ding = zones[0];
    let R = 0;
    for (const q of zones) R = Math.max(R, Math.hypot(q.x - ding.x, q.z - ding.z) + q.w);
    R += 0.012;
    // the shell: a low steel dome with a rolled rim (a handpan's lens shape, seen from above)
    // (low: your hand lands on the real desk under it, so it stays a lens, not a dome)
    const H = 0.016;
    const pts: Vector2[] = [];
    for (let k = 0; k <= 16; k++) {
      const a = (k / 16) * (Math.PI / 2);
      pts.push(new Vector2(Math.cos(a) * R + 0.0001, 0.006 + Math.sin(a) * H * Math.cos(a * 0.3)));
    }
    pts.reverse();
    pts.push(new Vector2(R + 0.004, 0.004), new Vector2(R + 0.002, 0));
    this.shell = named(new Mesh(new LatheGeometry(pts, 64), this.steel), 'Shell');
    this.shell.position.set(ding.x, 0, -ding.z);
    this.root.add(this.shell);
    // tone fields: shallow dimples on the shell, the ding raised in the middle
    zones.forEach((q, i) => {
      const r = q.w;
      const d = Math.hypot(q.x - ding.x, q.z - ding.z) / R;
      const y = 0.006 + H * Math.sqrt(Math.max(0, 1 - d * d)) * 0.98;
      const g = i === 0 ? new CylinderGeometry(r * 0.75, r, 0.006, 40) : new TorusGeometry(r * 0.82, 0.0022, 8, 40);
      // (each field its own material, so a struck one can glow)
      const m = named(new Mesh(g, this.field.clone()), i === 0 ? 'Ding' : `Field${i}`);
      if (i !== 0) m.rotation.x = -Math.PI / 2;
      m.position.set(q.x, y + (i === 0 ? 0.003 : 0.001), -q.z);
      // tilted with the dome under it
      if (i !== 0) {
        // tilted with the dome under it
        m.rotation.z = -((q.x - ding.x) / R) * 0.25;
        m.rotation.x = -Math.PI / 2 - ((q.z - ding.z) / R) * 0.25;
      }
      this.fields.push(m);
      this.root.add(m);
    });
  }

  struck(i: number, gain: number): void {
    this.spring.kick(i, 0.1 + 0.2 * gain);
    this.glow[i] = 0.6 + 0.6 * gain;
  }

  update(dt: number): void {
    this.spring.step(dt, 1400, 18);
    this.fields.forEach((m, i) => {
      // a struck field rings: it swells and glows warm, fading in about a sixth of a second
      const s = 1 + Math.abs(this.spring.x[i]) * 12;
      m.scale.set(s, i === 0 ? 1 : s, s);
      const g = (this.glow[i] = Math.max(0, (this.glow[i] ?? 0) - dt * 6));
      (m.material as MeshStandardMaterial).emissive.setHex(0xffc27a).multiplyScalar(g);
    });
  }
}

export class MarimbaModel implements DeskModel {
  readonly root = named(new Group(), 'Marimba');
  private bars: Mesh[] = [];
  private barY = 0.0085;
  private spring = new Springs(8);
  private readonly wood = (() => {
    const map = woodGrain(41).clone();
    map.needsUpdate = true;
    map.repeat.set(18, 5);
    map.rotation = Math.PI / 2;
    return new MeshPhysicalMaterial({ name: 'Rosewood', color: 0x8a3f20, map, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.22 });
  })();
  private readonly frame = new MeshPhysicalMaterial({ name: 'Frame', color: 0x3b2416, map: woodGrain(43), roughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.3 });
  private readonly cord = mat('Cord', 0x26211c, 0.9);
  private readonly brass = mat('Brass', 0xc8a050, 0.3, 1);
  private readonly chrome = mat('Chrome', 0xe2e5ea, 0.16, 1);

  layout(zones: readonly Zone[]): void {
    this.root.clear();
    this.bars = [];
    if (!zones.length) return;
    const box = new BoxGeometry(1, 1, 1);
    const first = zones[0];
    const last = zones[zones.length - 1];
    const x0 = first.x - first.w / 2 - 0.014;
    const x1 = last.x + last.w / 2 + 0.014;
    const zc = first.z;
    // the bars rest on cords through their nodes (22% in from each end): the rails follow that line, closing in
    // toward the short high bars, as on a real frame
    const node = (h: number) => h * 0.28;
    for (const s of [-1, 1]) {
      const a = { x: x0, z: zc + s * node(first.h) };
      const b = { x: x1, z: zc + s * node(last.h) };
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const ang = Math.atan2(b.z - a.z, b.x - a.x);
      const rail = named(new Mesh(box, this.frame), 'Rail');
      rail.scale.set(len, 0.006, 0.012);
      rail.position.set((a.x + b.x) / 2, 0.003, -(a.z + b.z) / 2);
      rail.rotation.y = ang;
      const c = named(new Mesh(new CylinderGeometry(0.0011, 0.0011, len, 8), this.cord), 'Cord');
      c.rotation.set(0, ang, Math.PI / 2);
      c.position.set((a.x + b.x) / 2, 0.0072, -(a.z + b.z) / 2);
      this.root.add(rail, c);
      // brass posts between the bars, holding the cord
      for (let k = 0; k <= zones.length; k++) {
        const px = k === 0 ? first.x - first.w / 2 - 0.004 : k === zones.length ? last.x + last.w / 2 + 0.004 : (zones[k - 1].x + zones[k].x) / 2;
        const t = (px - a.x) / (b.x - a.x);
        const post = named(new Mesh(new CylinderGeometry(0.0013, 0.0013, 0.012, 8), this.brass), 'Post');
        post.position.set(px, 0.009, -(a.z + (b.z - a.z) * t));
        this.root.add(post);
      }
    }
    // the end blocks
    for (const [sx, h] of [[x0 - 0.007, first.h], [x1 + 0.007, last.h]] as const) {
      const end = named(new Mesh(box, this.frame), 'End');
      end.scale.set(0.014, 0.013, node(h) * 2 + 0.03);
      end.position.set(sx, 0.0065, -zc);
      this.root.add(end);
    }
    zones.forEach((q, i) => {
      // a rosewood bar: rounded corners, a soft edge, the grain along its length
      const r = Math.min(0.008, q.w * 0.3);
      const shape = new Shape();
      const w = q.w / 2;
      const h = q.h / 2;
      shape.moveTo(-w + r, -h);
      shape.lineTo(w - r, -h);
      shape.quadraticCurveTo(w, -h, w, -h + r);
      shape.lineTo(w, h - r);
      shape.quadraticCurveTo(w, h, w - r, h);
      shape.lineTo(-w + r, h);
      shape.quadraticCurveTo(-w, h, -w, h - r);
      shape.lineTo(-w, -h + r);
      shape.quadraticCurveTo(-w, -h, -w + r, -h);
      const g = new ExtrudeGeometry(shape, { depth: 0.007, bevelEnabled: true, bevelThickness: 0.001, bevelSize: 0.001, bevelSegments: 2, curveSegments: 4 });
      g.rotateX(-Math.PI / 2);
      g.translate(0, -0.0035, 0);
      const bar = named(new Mesh(g, this.wood), `Bar${i}`);
      bar.position.set(q.x, this.barY, -q.z);
      this.bars.push(bar);
      // its resonator: a chrome tube lying behind it, longer for the low bars, capped
      const tl = 0.024 + 0.026 * (1 - i / Math.max(1, zones.length - 1));
      const tube = named(new Mesh(new CylinderGeometry(0.0075, 0.0075, tl, 20, 1, false), this.chrome), `Resonator${i}`);
      tube.rotation.x = Math.PI / 2;
      tube.position.set(q.x, 0.0078, -(q.z + q.h / 2 + 0.012 + tl / 2));
      this.root.add(bar, tube);
    });
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
  private readonly crown = mat('Crown', 0x1d1d20, 0.35, 0.8);
  private readonly lug = mat('Lug', 0xcfd3d8, 0.2, 1);
  /** The heads' height: a conga's barrel, cut down to a desk, still a barrel (12 cm). */
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
      // the shell: a conga's barrel, narrow at the foot, swelling to its belly two fifths up, in to the head
      const rAt = (y: number) => {
        const t = Math.max(0, Math.min(1, y / (H - 0.004)));
        return R * (0.86 + 0.17 * Math.sin(Math.PI * Math.pow(t, 0.75)) + 0.1 * t);
      };
      const pts: Vector2[] = [];
      for (let k = 0; k <= 16; k++) pts.push(new Vector2(rAt((k / 16) * (H - 0.004)), (k / 16) * (H - 0.004)));
      const shell = named(new Mesh(new LatheGeometry(pts, 48), this.wood), 'Shell');
      const band = named(new Mesh(new CylinderGeometry(rAt(H * 0.62) + 0.0008, rAt(H * 0.56) + 0.0008, 0.006, 48, 1, true), this.stripe), 'Stripe');
      band.position.y = H * 0.59;
      // staves: twelve seams following the barrel's curve, each a short segment hugging it
      const staves = named(new Group(), 'Staves');
      const sg = new BoxGeometry(0.0012, 1, 0.0008);
      const segs = 8;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        for (let k = 0; k < segs; k++) {
          const y0 = (k / segs) * (H - 0.006);
          const y1 = ((k + 1) / segs) * (H - 0.006);
          const r0 = rAt(y0) + 0.0005;
          const r1 = rAt(y1) + 0.0005;
          const s = new Mesh(sg, this.stripe);
          s.scale.y = Math.hypot(y1 - y0, r1 - r0);
          s.position.set(Math.cos(a) * (r0 + r1) / 2, (y0 + y1) / 2, Math.sin(a) * (r0 + r1) / 2);
          s.rotation.set(0, -a, 0);
          s.rotateZ(-Math.atan2(r1 - r0, y1 - y0));
          staves.add(s);
        }
      }
      // the head: rawhide, the low drum a shade darker, its own material so it can glow
      const hide = new MeshStandardMaterial({ name: 'Rawhide', color: d === 0 ? 0xe2c79a : 0xe8d0a6, roughness: 0.82 });
      const head = named(new Mesh(new CylinderGeometry(R * 0.985, R * 0.985, 0.002, 48), hide), 'Head');
      head.position.y = H - 0.002;
      // the slap zone: nothing painted on the hide; a ring of light that shows only when the edge is played
      const ringMat = new MeshBasicMaterial({ name: 'Edge', color: 0xfff0c0, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
      const ring = named(new Mesh(new RingGeometry(inner.w, R * 0.96, 48), ringMat), 'EdgeLight');
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = H - 0.0008;
      // the crown hoop: a black rolled rim over the head's edge
      const crown = named(new Mesh(new TorusGeometry(R * 1.0, 0.0028, 10, 56), this.crown), 'Crown');
      crown.rotation.x = -Math.PI / 2;
      crown.position.y = H - 0.0005;
      // side plates and lugs: four on the low drum, four on the high, each a plate on the shell with a rod to the rim
      const lugs = named(new Group(), 'Lugs');
      const plate = new BoxGeometry(0.006, 0.01, 0.0016);
      const rod = new CylinderGeometry(0.001, 0.001, H * 0.16, 8);
      for (let i = 0; i < 6; i++) {
        const a = ((i + 0.5) / 6) * Math.PI * 2;
        const l = named(new Group(), `Lug${i}`);
        const p = new Mesh(plate, this.lug);
        p.position.set(rAt(H * 0.78) + 0.0012, H * 0.78, 0);
        const r = new Mesh(rod, this.lug);
        r.position.set(rAt(H * 0.9) + 0.0014, H * 0.9, 0);
        l.add(p, r);
        l.rotation.y = a;
        lugs.add(l);
      }
      drum.add(shell, band, staves, head, ring, crown, lugs);
      this.root.add(drum);
      this.heads.push(head);
      this.marks.push(ring);
    }
  }

  struck(i: number, gain: number): void {
    const d = i >> 1;
    this.spring.kick(d, 0.06 + 0.12 * gain);
    this.glow[i & 3] = 0.5 + 0.6 * gain;
  }

  update(dt: number): void {
    this.spring.step(dt, 1800, 30);
    this.heads.forEach((h, d) => {
      // the head gives under the hand and comes back
      h.position.y = CongaModel.H - 0.002 + Math.max(-0.002, this.spring.x[d] * 0.02);
      const open = (this.glow[d * 2] = Math.max(0, this.glow[d * 2] - dt * 6));
      const slap = (this.glow[d * 2 + 1] = Math.max(0, this.glow[d * 2 + 1] - dt * 8));
      (h.material as MeshStandardMaterial).emissive.setHex(0xffb060).multiplyScalar(open * 0.5);
      (this.marks[d].material as MeshBasicMaterial).opacity = Math.min(0.7, slap * 0.8);
    });
  }
}
