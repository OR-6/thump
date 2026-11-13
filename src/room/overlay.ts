/**
 * Light overlays on real surfaces (DESIGN.md §3.13): slim, precise bars and keys, rings for drums and
 * bowls, a big ring for a gong, each in its instrument's accent colour, drawn just off the surface.
 * A zone lights a beat before its note and flashes when hit (brighter for a harder hit). On discovery
 * the overlay draws itself in, zone by zone. Undiscovered surfaces in reach carry a faint sheen.
 *
 * Two draws per instrument (the shapes, and their additive glow), whatever its zone count.
 */
import {
  SphereGeometry,
  Path,
  type Material,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
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
let thinGeo: RingGeometry | null = null;
let frameGeo: ShapeGeometry | null = null;
/** A bar's outline, as a share of its size on each side. */
const FRAME_EDGE = 0.13;
/** Drums ring out: a hit sends rings of light across the surface from where it landed. */
const RIPPLERS = new Set<Family>(['gong', 'timpani', 'frame', 'congas', 'cajon', 'stomp', 'tongue', 'bowl', 'bell', 'tambourine', 'triangle']);
const RIPPLES = 6;
function geos() {
  if (!boxGeo) {
    boxGeo = new PlaneGeometry(1, 1);
    boxGeo.rotateX(-Math.PI / 2);
    ringGeo = new RingGeometry(0.86, 1, 48);
    ringGeo.rotateX(-Math.PI / 2);
    discGeo = new RingGeometry(0, 1, 40);
    discGeo.rotateX(-Math.PI / 2);
    thinGeo = new RingGeometry(0.965, 1, 64);
    thinGeo.rotateX(-Math.PI / 2);
    // a bar drawn as a line of light round its edge (the fill comes up only when it plays)
    const outer = new Shape();
    outer.moveTo(-0.5, -0.5);
    outer.lineTo(0.5, -0.5);
    outer.lineTo(0.5, 0.5);
    outer.lineTo(-0.5, 0.5);
    outer.closePath();
    const hole = new Path();
    const t = 0.5 - FRAME_EDGE;
    hole.moveTo(-t, -t);
    hole.lineTo(-t, t);
    hole.lineTo(t, t);
    hole.lineTo(t, -t);
    hole.closePath();
    outer.holes.push(hole);
    frameGeo = new ShapeGeometry(outer);
    frameGeo.rotateX(-Math.PI / 2);
  }
  return { box: boxGeo!, ring: ringGeo!, disc: discGeo!, thin: thinGeo!, frame: frameGeo! };
}

/** Instruments drawn as bars, keys, strings or tubes (rectangles); the rest are drums and rings (discs). */
const BARS = new Set<Family>(['marimba', 'xylophone', 'glock', 'harp', 'tubular', 'keys', 'slit', 'cajon']);

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
  /** Seconds since the reveal began, and each zone's delay (the light spreads out from the hand). */
  private revealT = 99;
  private revealEnd = 0;
  private delay: Float32Array;
  private snapped: Uint8Array;
  private ripples: InstancedMesh;
  private rip = new Float32Array(RIPPLES * 5); // x, z, age, life, reach
  private ripNext = 0;
  private sweepT = -1;
  private hc = false;
  /** Brightness at rest (the table keys sit quieter than a door's bars). */
  rest = 0.55;

  constructor(readonly family: Family, max = 12) {
    const g = geos();
    this.group.name = `Overlay-${family}`;
    // drawn in light on the real surface (adds to what you see; the real surface shows through)
    const solid = asLight(new MeshBasicMaterial({ transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false, side: DoubleSide }));
    this.shapes = new InstancedMesh(BARS.has(family) ? g.frame : g.ring, solid, max);
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
    this.detail = new InstancedMesh(family === 'gong' || family === 'frame' ? g.ring : g.disc, new MeshBasicMaterial({ transparent: true, opacity: family === 'gong' ? 0.22 : 0.85, depthWrite: false, toneMapped: false, side: DoubleSide }), max * 12);
    this.detail.renderOrder = 4;
    for (const m of [this.backing, this.detail]) {
      m.frustumCulled = false;
      m.count = 0;
      this.group.add(m);
    }
    this.ripples = new InstancedMesh(g.thin, asLight(new MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, side: DoubleSide })), RIPPLES);
    this.ripples.frustumCulled = false;
    this.ripples.count = 0;
    this.ripples.renderOrder = 5;
    this.ripples.setColorAt(0, this.base);
    this.group.add(this.ripples);
    for (let r = 0; r < RIPPLES; r++) this.rip[r * 5 + 2] = 99;
    this.delay = new Float32Array(max);
    this.snapped = new Uint8Array(max);
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
  /**
   * Over a modelled instrument: only the lights (no dark backing or painted note dots: the model is the
   * instrument, and anything painted on it reads as a sticker).
   */
  plain(): void {
    this.backing.visible = false;
    this.detail.visible = false;
  }

  build(zones: Zone[], hc = false): void {
    this.zones = zones;
    this.hc = hc;
    this.base.setHex(hc ? 0xffffff : FAMILIES[this.family].color);
    this.shapes.count = this.glow.count = Math.min(zones.length, this.ask.length);
    this.reveal();
  }

  /**
   * Draw itself in (a discovery): the light spreads out across the surface from where the hand landed (zone
   * coordinates), each bar or drum snapping in with a flash as it arrives, and a ring runs out from the hand.
   */
  reveal(fromX?: number, fromZ?: number): void {
    const n = this.shapes.count;
    const calm = motion.calm;
    let far = 0;
    for (let i = 0; i < n; i++) {
      const z = this.zones[i];
      const d = fromX === undefined ? i * 0.07 : Math.hypot(z.x - fromX, z.z - (fromZ ?? 0)) / 1.6 + i * 0.015;
      this.delay[i] = calm ? d * 1.5 : d;
      this.snapped[i] = 0;
      far = Math.max(far, this.delay[i]);
    }
    this.revealT = 0;
    this.revealEnd = far + 0.3;
    this.layout(0);
    if (fromX !== undefined && !calm) this.ripple(fromX, fromZ ?? 0, 0.02, 0.9, 0.55);
  }

  /** Every zone flashes white at once (the song's last chord). */
  flashAll(): void {
    for (let i = 0; i < this.white.length; i++) this.white[i] = 1;
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
    if (i < 0 || i >= this.flash.length) return;
    this.flash[i] = Math.max(this.flash[i], 0.5 + 0.5 * gain);
    // a drum rings out across the surface; a gong's rings go further and last
    const z = this.zones[i];
    if (z && RIPPLERS.has(this.family) && !motion.calm) {
      const big = this.family === 'gong' || this.family === 'timpani' || this.family === 'stomp';
      this.ripple(z.x, z.z, z.w, big ? 1.8 : 0.8, z.w * (big ? 2.4 : 1.8) * (0.6 + 0.4 * gain));
      if (this.family === 'gong' && gain > 0.6) this.ripple(z.x, z.z, z.w * 0.5, 1.6, z.w * 1.6);
    }
  }

  /** A ring of light from (x, z), radius r0 growing to r0 + reach over `life` seconds, fading. */
  private ripple(x: number, z: number, r0: number, life: number, reach: number): void {
    const k = this.ripNext;
    this.ripNext = (this.ripNext + 1) % RIPPLES;
    const o = k * 5;
    this.rip[o] = x;
    this.rip[o + 1] = z;
    this.rip[o + 2] = 0;
    this.rip[o + 3] = life;
    this.rip[o + 4] = reach;
    this.ripR0[k] = r0;
  }
  private ripR0 = new Float32Array(RIPPLES);

  /** How far zone i has drawn in (0..1) at `t` seconds into the reveal. */
  private grown(i: number, t: number): number {
    return Math.min(1, Math.max(0, (t - this.delay[i]) / 0.16));
  }

  private layout(t: number): void {
    const n = this.shapes.count;
    for (let i = 0; i < n; i++) {
      const z = this.zones[i];
      // each zone draws in as the light reaches it, with a flash
      const k = this.grown(i, t);
      if (k > 0 && !this.snapped[i]) {
        this.snapped[i] = 1;
        this.white[i] = Math.max(this.white[i], 0.9);
      }
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
      const k = this.grown(i, t);
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
      const k = this.grown(i, t);
      if (k <= 0) continue;
      if (z.shape === 'rect') {
        const along = z.w >= z.h;
        for (let e = 0; e < 2; e++) {
          const sgn = e ? 1 : -1;
          // where a bar is strung or mounted: about a fifth of the way in from each end
          const off = (along ? z.w : z.h) * 0.28;
          _p.set(z.x + (along ? sgn * off * k : 0), LIFT * 1.3, -(z.z + (along ? 0 : sgn * off * k)));
          _m.compose(_p, _q, _s.setScalar(0.0045));
          this.detail.setMatrixAt(d++, _m);
        }
      } else if (this.family === 'frame') {
        // a frame drum is a skin tacked over a hoop: a second rim just inside the first
        _p.set(z.x, LIFT * 1.3, -z.z);
        _m.compose(_p, _q, _s.set(z.w * 0.86 * k, 1, z.w * 0.86 * k));
        this.detail.setMatrixAt(d++, _m);
      } else if (this.family === 'gong') {
        for (const f of GONG_RINGS) {
          _p.set(z.x, LIFT * 1.3, -z.z);
          _m.compose(_p, _q, _s.set(z.w * f * k, 1, z.w * f * k));
          this.detail.setMatrixAt(d++, _m);
        }
        // the boss in the middle: where it sings
        _p.set(z.x, LIFT * 1.3, -z.z);
        _m.compose(_p, _q, _s.setScalar(z.w * 0.16 * k));
        this.detail.setMatrixAt(d++, _m);
      } else if (LUGS[this.family]) {
        // a drum: its tension lugs round the rim (a tambourine: its jingles), drawn in as the head grows
        const [count, at, size] = LUGS[this.family]!;
        for (let q = 0; q < count; q++) {
          const a = (q / count) * Math.PI * 2 + Math.PI / count;
          _p.set(z.x + Math.cos(a) * z.w * at * k, LIFT * 1.3, -(z.z + Math.sin(a) * z.w * at * k));
          _m.compose(_p, _q, _s.setScalar(Math.max(0.004, z.w * size) * k));
          this.detail.setMatrixAt(d++, _m);
        }
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
    if (this.revealT < this.revealEnd) {
      this.revealT = Math.min(this.revealEnd, this.revealT + dt);
      this.layout(this.revealT);
    }
    this.updateRipples(dt);
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

  private updateRipples(dt: number): void {
    let live = 0;
    for (let r = 0; r < RIPPLES; r++) {
      const o = r * 5;
      if (this.rip[o + 2] >= this.rip[o + 3]) continue;
      this.rip[o + 2] += dt;
      const k = Math.min(1, this.rip[o + 2] / this.rip[o + 3]);
      // eases out: fast from the hand, slowing as it spreads, fading as it goes
      const e = 1 - Math.pow(1 - k, 2.2);
      const rad = this.ripR0[r] + this.rip[o + 4] * e;
      _p.set(this.rip[o], LIFT * 1.6, -this.rip[o + 1]);
      _m.compose(_p, _q.identity(), _s.set(rad, 1, rad));
      this.ripples.setMatrixAt(live, _m);
      this.ripples.setColorAt(live, _c.copy(this.base).lerp(WHITE, 0.35 * (1 - k)).multiplyScalar(0.9 * (1 - k) * (1 - k)));
      live++;
    }
    this.ripples.count = live;
    if (live) {
      this.ripples.instanceMatrix.needsUpdate = true;
      if (this.ripples.instanceColor) this.ripples.instanceColor.needsUpdate = true;
    }
  }

  /** Free its GPU buffers and materials (shared geometries stay). */
  dispose(): void {
    for (const m of [this.shapes, this.glow, this.backing, this.detail, this.ripples]) {
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
const GONG_RINGS = [0.2, 0.62, 0.66];
/** Detail round a drum's rim: [how many, at what share of its radius, how big]. */
const LUGS: Partial<Record<Family, [number, number, number]>> = {
  timpani: [8, 1.12, 0.085],
  congas: [6, 1.14, 0.11],
  stomp: [10, 1.1, 0.065],
  tambourine: [5, 0.8, 0.17],
};

/** A faint sheen and outline on an undiscovered surface: "there's something here". */
/**
 * An undiscovered surface in reach: "there's something here". A breath of light on it, and a few motes in the
 * colour of what it will play, drifting a couple of centimetres above it, each fading in and out on its own time.
 */
export class Sheen {
  readonly group = new Group();
  private fill: Mesh;
  private motes: InstancedMesh;
  private t = Math.random() * 20;
  private seeds: Float32Array;
  private span: { x0: number; x1: number; z0: number; z1: number };

  constructor(s: Surface, color = 0xffffff) {
    const shape = new Shape();
    const pts = s.outline.length >= 3 ? s.outline : rectOutline(s);
    // the outline in surface-local x/−z (zone z is −local z)
    pts.forEach((p, i) => (i ? shape.lineTo(p.x, p.z) : shape.moveTo(p.x, p.z)));
    shape.closePath();
    const geo = new ShapeGeometry(shape);
    // ShapeGeometry is in x/y: lay it into x/z with zone z → local −z
    geo.rotateX(-Math.PI / 2);
    this.fill = new Mesh(geo, asLight(new MeshBasicMaterial({ color, transparent: true, opacity: 0.02, depthWrite: false, toneMapped: false, side: DoubleSide })));
    this.fill.position.y = 0.002;
    this.fill.renderOrder = 3;
    const b = s.bounds;
    // on a big wall, only the part you can reach gets motes (around the middle, a metre across at most)
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    const hx = Math.min(0.5, (b.maxX - b.minX) / 2);
    const hz = Math.min(0.5, (b.maxZ - b.minZ) / 2);
    this.span = { x0: cx - hx, x1: cx + hx, z0: cz - hz, z1: cz + hz };
    const n = Math.round(14 + 10 * Math.min(1, (hx * hz * 4) / 0.6));
    moteGeo ??= new SphereGeometry(1, 6, 4);
    this.motes = new InstancedMesh(moteGeo, asLight(new MeshBasicMaterial({ toneMapped: false })), n);
    this.motes.frustumCulled = false;
    this.motes.renderOrder = 4;
    const c = new Color(color);
    for (let k = 0; k < n; k++) this.motes.setColorAt(k, c);
    this.seeds = new Float32Array(n * 4);
    for (let k = 0; k < this.seeds.length; k++) this.seeds[k] = Math.random();
    this.group.add(this.fill, this.motes);
    this.update(0);
  }

  update(dt: number): void {
    this.t += dt * (motion.calm ? 0.4 : 1);
    const t = this.t;
    // a slow breath on the surface, about every five seconds
    (this.fill.material as MeshBasicMaterial).opacity = 0.012 + 0.04 * Math.pow(0.5 + 0.5 * Math.sin(t * 1.25), 3);
    const sp = this.span;
    for (let k = 0; k < this.motes.count; k++) {
      const a = this.seeds[k * 4];
      const b = this.seeds[k * 4 + 1];
      const ph = this.seeds[k * 4 + 2] * 6.283;
      const life = 3 + this.seeds[k * 4 + 3] * 3;
      const u = (t / life + a * 10) % 1;
      // fades in, glows, fades out; drifting a little as it goes
      const glow = Math.sin(u * Math.PI);
      const x = sp.x0 + (sp.x1 - sp.x0) * ((a + 0.04 * Math.sin(t * 0.3 + ph)) % 1);
      const z = sp.z0 + (sp.z1 - sp.z0) * ((b + 0.04 * Math.cos(t * 0.27 + ph)) % 1);
      _p.set(x, 0.015 + 0.03 * u, -z);
      _m.compose(_p, _q.identity(), _s.setScalar(0.0055 * glow + 0.0005));
      this.motes.setMatrixAt(k, _m);
    }
    this.motes.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.fill.geometry.dispose();
    (this.fill.material as Material).dispose();
    (this.motes.material as Material).dispose();
    this.motes.dispose();
  }
}

let moteGeo: SphereGeometry | null = null;

function rectOutline(s: Surface): { x: number; z: number }[] {
  const b = s.bounds;
  return [
    { x: b.minX, z: b.minZ },
    { x: b.maxX, z: b.minZ },
    { x: b.maxX, z: b.maxZ },
    { x: b.minX, z: b.maxZ },
  ];
}
