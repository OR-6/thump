/**
 * The desk instruments as the real things, each laid out from its zones (kit-local: x right, zone z away from you,
 * metres) and moving when played. A piano: a black lacquered case with a red felt strip and a nameboard, ivory keys
 * that sink when pressed, ebony keys behind them, a wide ebony chord key. A guitar lying flat: a spruce top with a
 * soundhole and rosette, a bridge, a rosewood neck with frets and its three chord positions, six strings that shimmer
 * when strummed. A handpan: a nitrided steel shell with its tone fields and raised ding. A marimba: rosewood bars
 * that bounce, on a frame. Deterministic: the same in the app and the editor.
 */
import { BoxGeometry, CircleGeometry, CylinderGeometry, ExtrudeGeometry, Group, LatheGeometry, Mesh, MeshStandardMaterial, RingGeometry, Shape, TorusGeometry, Vector2 } from '@iwsdk/core';
import type { Zone } from '../../room/zones.js';

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

export class PianoModel implements DeskModel {
  readonly root = named(new Group(), 'Piano');
  private keys: Mesh[] = [];
  private keyY: number[] = [];
  private spring = new Springs(8);
  private case_: Mesh;
  private felt: Mesh;
  private board: Mesh;
  private blacks = named(new Group(), 'BlackKeys');
  private readonly ivory = mat('Ivory', 0xf4ecda, 0.35);
  private readonly ebony = mat('Ebony', 0x15131a, 0.3);
  private readonly lacquer = mat('Lacquer', 0x0b0b0d, 0.18, 0.1);

  constructor() {
    const box = new BoxGeometry(1, 1, 1);
    this.case_ = named(new Mesh(box, this.lacquer), 'Case');
    this.felt = named(new Mesh(box, mat('Felt', 0x7a1418, 0.95)), 'Felt');
    this.board = named(new Mesh(box, this.lacquer), 'Nameboard');
    this.root.add(this.case_, this.felt, this.board, this.blacks);
    for (let i = 0; i < 7; i++) {
      const k = named(new Mesh(box, i === 6 ? this.ebony : this.ivory), i === 6 ? 'ChordKey' : `Key${i}`);
      this.keys.push(k);
      this.root.add(k);
    }
  }

  layout(zones: readonly Zone[]): void {
    let x0 = Infinity;
    let x1 = -Infinity;
    let zf = Infinity;
    let zb = -Infinity;
    for (const q of zones) {
      x0 = Math.min(x0, q.x - q.w / 2);
      x1 = Math.max(x1, q.x + q.w / 2);
      zf = Math.min(zf, q.z - q.h / 2);
      zb = Math.max(zb, q.z + q.h / 2);
    }
    const H = 0.012;
    // the case: a low slab under the keys and a raised back with the nameboard
    this.case_.scale.set(x1 - x0 + 0.02, 0.008, zb - zf + 0.045);
    this.case_.position.set((x0 + x1) / 2, 0.004, -((zf + zb) / 2 + 0.0125));
    this.board.scale.set(x1 - x0 + 0.02, 0.03, 0.022);
    this.board.position.set((x0 + x1) / 2, 0.015, -(zb + 0.021));
    this.felt.scale.set(x1 - x0, 0.003, 0.006);
    this.felt.position.set((x0 + x1) / 2, H + 0.002, -(zb + 0.006));
    zones.forEach((q, i) => {
      const k = this.keys[i];
      if (!k) return;
      k.scale.set(q.w * 0.94, H - 0.002, q.h);
      this.keyY[i] = 0.008 + (H - 0.002) / 2;
      k.position.set(q.x, this.keyY[i], -q.z);
    });
    // ebony keys between the ivory ones, at the back, the way a keyboard looks (two, a gap, three)
    this.blacks.clear();
    const box = new BoxGeometry(1, 1, 1);
    const white = zones.filter((q) => q.degree >= 0);
    for (let i = 0; i < white.length - 1; i++) {
      if (i === 2) continue;
      const a = white[i];
      const b = white[i + 1];
      const m = named(new Mesh(box, this.ebony), `Black${i}`);
      m.scale.set(0.018, 0.012, a.h * 0.55);
      m.position.set((a.x + b.x) / 2, 0.008 + H + 0.003, -(a.z + a.h * 0.225));
      this.blacks.add(m);
    }
  }

  struck(i: number, gain: number): void {
    this.spring.kick(i, 0.12 + 0.25 * gain);
  }

  update(dt: number): void {
    this.spring.step(dt);
    for (let i = 0; i < this.keys.length; i++) {
      const k = this.keys[i];
      if (this.keyY[i] === undefined) continue;
      // a key sinks (up to 6 mm) and comes back on its spring
      k.position.y = this.keyY[i] + Math.max(-0.006, Math.min(0.001, this.spring.x[i]));
    }
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
  private readonly steel = mat('Steel', 0x4a3a2c, 0.32, 0.85);
  private readonly field = mat('Field', 0x5c4a38, 0.22, 0.9);

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
      const m = named(new Mesh(g, this.field), i === 0 ? 'Ding' : `Field${i}`);
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
  }

  update(dt: number): void {
    this.spring.step(dt, 1400, 18);
    this.fields.forEach((m, i) => {
      // a struck field rings: it swells and the shimmer runs round it
      const s = 1 + Math.abs(this.spring.x[i]) * 12;
      m.scale.set(s, i === 0 ? 1 : s, s);
    });
  }
}

export class MarimbaModel implements DeskModel {
  readonly root = named(new Group(), 'Marimba');
  private bars: Mesh[] = [];
  private barY = 0.0085;
  private spring = new Springs(8);
  private readonly wood = mat('Rosewood', 0x7a3a1e, 0.42);
  private readonly frame = mat('Frame', 0x3b2416, 0.5);
  private readonly cord = mat('Cord', 0x1e1c1b, 0.9);
  private readonly brass = mat('Brass', 0xc8a050, 0.3, 1);

  layout(zones: readonly Zone[]): void {
    this.root.clear();
    this.bars = [];
    if (!zones.length) return;
    const box = new BoxGeometry(1, 1, 1);
    const x0 = zones[0].x - zones[0].w / 2 - 0.012;
    const x1 = zones[zones.length - 1].x + zones[zones.length - 1].w / 2 + 0.012;
    const zc = zones[0].z;
    const reach = zones[0].h / 2 + 0.012;
    // the frame: two rails under the bar ends, with a cord along each, and brass resonator caps peeking out behind
    for (const s of [-1, 1]) {
      const rail = named(new Mesh(box, this.frame), 'Rail');
      rail.scale.set(x1 - x0, 0.006, 0.012);
      rail.position.set((x0 + x1) / 2, 0.003, -(zc + s * reach * 0.62));
      const c = named(new Mesh(box, this.cord), 'Cord');
      c.scale.set(x1 - x0, 0.002, 0.003);
      c.position.set((x0 + x1) / 2, 0.0068, -(zc + s * reach * 0.62));
      this.root.add(rail, c);
    }
    for (const s of [x0 - 0.006, x1 + 0.006]) {
      const end = named(new Mesh(box, this.frame), 'End');
      end.scale.set(0.012, 0.012, reach * 1.5);
      end.position.set(s, 0.006, -zc);
      this.root.add(end);
    }
    zones.forEach((q, i) => {
      const bar = named(new Mesh(box, this.wood), `Bar${i}`);
      bar.scale.set(q.w, 0.009, q.h);
      bar.position.set(q.x, this.barY, -q.z);
      this.bars.push(bar);
      // a brass resonator cap behind each bar, longer under the low ones
      const cap = named(new Mesh(new CylinderGeometry(0.01, 0.01, 0.004, 20), this.brass), `Resonator${i}`);
      cap.position.set(q.x, 0.002, -(q.z + q.h / 2 + 0.014));
      this.root.add(bar, cap);
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
