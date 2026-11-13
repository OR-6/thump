/**
 * Light overlays on real surfaces (DESIGN.md §3.13): slim, precise bars and keys, rings for drums and
 * bowls, a big ring for a gong, each in its instrument's accent colour, drawn just off the surface.
 * A zone lights a beat before its note and flashes when hit (brighter for a harder hit). On discovery
 * the overlay draws itself in, zone by zone. Undiscovered surfaces in reach carry a faint sheen.
 *
 * Two draws per instrument (the shapes, and their additive glow), whatever its zone count.
 */
import {
  type Material,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineLoop,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  Shape,
  ShapeGeometry,
  Vector3,
} from '@iwsdk/core';
import { asLight } from '../art/light.js';
import { FAMILIES, type Family } from './classify.js';
import type { Zone } from './zones.js';
import type { Surface } from './surface.js';
import { motion } from '../ui/motion.js';

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _c = new Color();
const LIFT = 0.004;

let boxGeo: PlaneGeometry | null = null;
let ringGeo: RingGeometry | null = null;
let discGeo: RingGeometry | null = null;
function geos() {
  if (!boxGeo) {
    boxGeo = new PlaneGeometry(1, 1);
    boxGeo.rotateX(-Math.PI / 2);
    ringGeo = new RingGeometry(0.86, 1, 48);
    ringGeo.rotateX(-Math.PI / 2);
    discGeo = new RingGeometry(0, 1, 40);
    discGeo.rotateX(-Math.PI / 2);
  }
  return { box: boxGeo!, ring: ringGeo!, disc: discGeo! };
}

/** Instruments drawn as bars, keys, strings or tubes (rectangles); the rest are drums and rings (discs). */
const BARS = new Set<Family>(['marimba', 'xylophone', 'glock', 'harp', 'tubular', 'keys', 'slit']);

export class Overlay {
  readonly group = new Group();
  private shapes: InstancedMesh;
  private glow: InstancedMesh;
  /** A dark backing under each shape, so light reads on a white wall or a bright window. */
  private backing: InstancedMesh;
  /** Fine detail: note dots at a bar's ends, a gong's rings and strike spot. */
  private detail: InstancedMesh;
  private dim: Float32Array;
  private white: Float32Array;
  private zones: Zone[] = [];
  private base = new Color();
  /** Light per zone: asked this frame (beat light), and a hit's flash fading. */
  private ask: Float32Array;
  private flash: Float32Array;
  private shown: Float32Array;
  private revealT = 1;
  private sweepT = -1;
  private hc = false;
  /** Brightness at rest (the table keys sit quieter than a door's bars). */
  rest = 0.55;

  constructor(readonly family: Family, max = 12) {
    const g = geos();
    this.group.name = `Overlay-${family}`;
    // drawn in light on the real surface (adds to what you see; the real surface shows through)
    const solid = asLight(new MeshBasicMaterial({ transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false, side: DoubleSide }));
    this.shapes = new InstancedMesh(BARS.has(family) ? g.box : g.ring, solid, max);
    this.glow = new InstancedMesh(BARS.has(family) ? g.box : g.disc, asLight(new MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, side: DoubleSide })), max);
    for (const m of [this.shapes, this.glow]) {
      m.frustumCulled = false;
      m.count = 0;
      m.renderOrder = 4;
      this.group.add(m);
    }
    this.glow.renderOrder = 5;
    // give both an instance colour now, so the shader they'll use is the one compiled up front (no hitch on a discovery)
    this.shapes.setColorAt(0, this.base);
    this.glow.setColorAt(0, this.base);
    const isBar = BARS.has(family);
    this.backing = new InstancedMesh(isBar ? g.box : g.disc, new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false, side: DoubleSide }), max);
    this.backing.renderOrder = 3;
    this.detail = new InstancedMesh(g.ring, new MeshBasicMaterial({ transparent: true, opacity: family === 'gong' ? 0.32 : 0.85, depthWrite: false, toneMapped: false, side: DoubleSide }), max * 4);
    this.detail.renderOrder = 4;
    for (const m of [this.backing, this.detail]) {
      m.frustumCulled = false;
      m.count = 0;
      this.group.add(m);
    }
    this.dim = new Float32Array(max);
    this.white = new Float32Array(max);
    this.ask = new Float32Array(max);
    this.flash = new Float32Array(max);
    this.shown = new Float32Array(max);
    this.base.setHex(FAMILIES[family].color);
  }

  /** Show it as another instrument's colour (the desk's bars after a swap). */
  recolor(hex: number): void {
    if (!this.hc) this.base.setHex(hex);
  }

  /** Lay the shapes out for `zones` (zone coordinates), hidden until revealed. */
  build(zones: Zone[], hc = false): void {
    this.zones = zones;
    this.hc = hc;
    this.base.setHex(hc ? 0xffffff : FAMILIES[this.family].color);
    this.shapes.count = this.glow.count = Math.min(zones.length, this.ask.length);
    this.revealT = 0;
    this.layout(0);
  }

  /** Draw itself in (discovery), zone by zone. */
  reveal(): void {
    this.revealT = 0;
    this.sweepT = 0;
  }

  /** A light sweep across it (a celebration). */
  sweep(): void {
    this.sweepT = 0;
  }

  /** Light zone `i` this frame (0..1; the brightest ask wins). */
  light(i: number, k: number): void {
    if (i >= 0 && i < this.ask.length && k > this.ask[i]) this.ask[i] = k;
  }

  /** Zone `i` was hit right on time: a white flash. */
  perfect(i: number): void {
    if (i >= 0 && i < this.white.length) this.white[i] = 1;
  }

  /** Zone `i`'s note went by unplayed: it dims for a moment. */
  miss(i: number): void {
    if (i >= 0 && i < this.dim.length) this.dim[i] = 1;
  }

  /** Zone `i` was hit with loudness `gain`. */
  hit(i: number, gain: number): void {
    if (i >= 0 && i < this.flash.length) this.flash[i] = Math.max(this.flash[i], 0.5 + 0.5 * gain);
  }

  private layout(reveal: number): void {
    const n = this.shapes.count;
    for (let i = 0; i < n; i++) {
      const z = this.zones[i];
      // each zone draws in after the one before
      const k = Math.min(1, Math.max(0, reveal * (n + 2) - i * 0.9) / 2);
      const e = 1 - Math.pow(1 - k, 3);
      _p.set(z.x, LIFT, -z.z);
      if (z.shape === 'rect') {
        const thick = this.hc ? 1.4 : 1;
        _s.set(z.w * e, 1, z.h * thick);
      } else _s.set(z.w * e, 1, z.w * e);
      _m.compose(_p, _q.identity(), _s);
      this.shapes.setMatrixAt(i, _m);
      _p.y = LIFT * 0.5;
      if (z.shape === 'rect') _s.set(z.w * e * 1.08 + 0.012, 1, z.h * 1.6 + 0.012);
      else _s.set(z.w * e * 1.35, 1, z.w * e * 1.35);
      _m.compose(_p, _q, _s);
      this.glow.setMatrixAt(i, _m);
    }
    // the dark backing, a little larger than each shape
    for (let i = 0; i < n; i++) {
      const z = this.zones[i];
      const k = Math.min(1, Math.max(0, reveal * (n + 2) - i * 0.9) / 2);
      _p.set(z.x, LIFT * 0.4, -z.z);
      if (z.shape === 'rect') _s.set(z.w * k + 0.008, 1, z.h + 0.008);
      else _s.set(z.w * k * 1.08, 1, z.w * k * 1.08);
      _m.compose(_p, _q, _s);
      this.backing.setMatrixAt(i, _m);
    }
    this.backing.count = n;
    // detail: note dots at each bar's ends; a gong's fine rings and strike spot; a dot in each tongue
    let d = 0;
    for (let i = 0; i < n; i++) {
      const z = this.zones[i];
      const k = Math.min(1, Math.max(0, reveal * (n + 2) - i * 0.9) / 2);
      if (k <= 0) continue;
      if (z.shape === 'rect') {
        const along = z.w >= z.h;
        for (let e = 0; e < 2; e++) {
          const sgn = e ? 1 : -1;
          const off = (along ? z.w : z.h) / 2 - 0.007;
          _p.set(z.x + (along ? sgn * off * k : 0), LIFT * 1.3, -(z.z + (along ? 0 : sgn * off * k)));
          _m.compose(_p, _q, _s.setScalar(0.0032));
          this.detail.setMatrixAt(d++, _m);
        }
      } else if (this.family === 'gong') {
        for (const f of GONG_RINGS) {
          _p.set(z.x, LIFT * 1.3, -z.z);
          _m.compose(_p, _q, _s.set(z.w * f * k, 1, z.w * f * k));
          this.detail.setMatrixAt(d++, _m);
        }
        _p.set(z.x, LIFT * 1.3, -z.z);
        _m.compose(_p, _q, _s.setScalar(z.w * 0.1 * k));
        this.detail.setMatrixAt(d++, _m);
      } else {
        _p.set(z.x, LIFT * 1.3, -z.z);
        _m.compose(_p, _q, _s.setScalar(z.w * 0.22 * k));
        this.detail.setMatrixAt(d++, _m);
      }
    }
    this.detail.count = d;
    (this.detail.material as MeshBasicMaterial).color.copy(this.base);
    this.shapes.instanceMatrix.needsUpdate = true;
    this.glow.instanceMatrix.needsUpdate = true;
    this.backing.instanceMatrix.needsUpdate = true;
    this.detail.instanceMatrix.needsUpdate = true;
  }

  update(dt: number): void {
    const n = this.shapes.count;
    if (n === 0) return;
    if (this.revealT < 1) {
      this.revealT = Math.min(1, this.revealT + dt / 0.9);
      this.layout(this.revealT);
    }
    let sweepAt = -1;
    if (this.sweepT >= 0) {
      this.sweepT += dt / (motion.calm ? 1.6 : 0.8);
      sweepAt = this.sweepT * (n + 3) - 1.5;
      if (this.sweepT >= 1) this.sweepT = -1;
    }
    for (let i = 0; i < n; i++) {
      this.flash[i] = Math.max(0, this.flash[i] - dt * 3.5);
      this.white[i] = Math.max(0, this.white[i] - dt * 3);
      this.dim[i] = Math.max(0, this.dim[i] - dt * 2.5);
      const sw = sweepAt >= 0 ? Math.max(0, 1 - Math.abs(i - sweepAt) / 1.5) * 0.8 : 0;
      const target = Math.max(this.ask[i] * 0.75, this.flash[i], sw, this.white[i]);
      this.shown[i] += (target - this.shown[i]) * Math.min(1, dt * 30);
      this.ask[i] = 0;
      const s = this.shown[i] * (1 - 0.7 * this.dim[i]);
      const rest = this.rest * (1 - 0.7 * this.dim[i]);
      // the shape: its accent, brighter as it lights (white on a perfect hit); the glow: nothing at rest
      this.shapes.setColorAt(i, _c.copy(this.base).multiplyScalar(rest + (1 - rest) * s).lerp(WHITE, Math.max(s * 0.35, this.white[i] * 0.85)));
      this.glow.setColorAt(i, _c.copy(this.base).lerp(WHITE, this.white[i] * 0.6).multiplyScalar(s * 0.9));
    }
    if (this.shapes.instanceColor) this.shapes.instanceColor.needsUpdate = true;
    if (this.glow.instanceColor) this.glow.instanceColor.needsUpdate = true;
  }

  /** Free its GPU buffers and materials (shared geometries stay). */
  dispose(): void {
    for (const m of [this.shapes, this.glow, this.backing, this.detail]) {
      (m.material as MeshBasicMaterial).dispose();
      m.dispose();
    }
    this.group.removeFromParent();
  }

  /** Light level of zone i now (debug/E2E). */
  level(i: number): number {
    return this.shown[i] ?? 0;
  }
}
const WHITE = new Color(0xffffff);
const GONG_RINGS = [0.32, 0.55, 0.75];

/** A faint sheen and outline on an undiscovered surface: "there's something here". */
export class Sheen {
  readonly group = new Group();
  private fill: Mesh;
  private line: LineLoop;
  private t = Math.random() * 6;

  constructor(s: Surface) {
    const shape = new Shape();
    const pts = s.outline.length >= 3 ? s.outline : rectOutline(s);
    // the outline in surface-local x/−z (zone z is −local z)
    pts.forEach((p, i) => (i ? shape.lineTo(p.x, p.z) : shape.moveTo(p.x, p.z)));
    shape.closePath();
    const geo = new ShapeGeometry(shape);
    // ShapeGeometry is in x/y: lay it into x/z with zone z → local −z
    geo.rotateX(-Math.PI / 2);
    this.fill = new Mesh(geo, asLight(new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.04, depthWrite: false, toneMapped: false, side: DoubleSide })));
    this.fill.position.y = 0.002;
    const lg = new BufferGeometry();
    const v: number[] = [];
    for (const p of pts) v.push(p.x, 0.003, -p.z);
    lg.setAttribute('position', new Float32BufferAttribute(v, 3));
    this.line = new LineLoop(lg, new LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false, toneMapped: false }));
    this.group.add(this.fill, this.line);
    this.fill.renderOrder = this.line.renderOrder = 3;
  }

  update(dt: number): void {
    this.t += dt;
    const k = motion.calm ? 0.5 : 1;
    (this.fill.material as MeshBasicMaterial).opacity = 0.08 + 0.06 * k * (0.5 + 0.5 * Math.sin(this.t * 2.2));
    (this.line.material as LineBasicMaterial).opacity = 0.45 + 0.3 * k * (0.5 + 0.5 * Math.sin(this.t * 2.2 + 1));
  }

  dispose(): void {
    this.fill.geometry.dispose();
    this.line.geometry.dispose();
    (this.fill.material as Material).dispose();
    (this.line.material as Material).dispose();
  }
}

function rectOutline(s: Surface): { x: number; z: number }[] {
  const b = s.bounds;
  return [
    { x: b.minX, z: b.minZ },
    { x: b.maxX, z: b.minZ },
    { x: b.maxX, z: b.maxZ },
    { x: b.minX, z: b.maxZ },
  ];
}
