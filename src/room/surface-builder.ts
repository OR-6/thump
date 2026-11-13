/**
 * Room surfaces from what Quest reports: a detected plane, or the faces of a room-scan box. Each gets its frame,
 * outline and measured features (and so its instrument), and strike tuning to suit it.
 */
import { Matrix4, Quaternion, Vector3, type Object3D } from '@iwsdk/core';
import { STRIKE } from '../config.js';
import type { Features } from './classify.js';
import { STRIKE_CFG } from './params.js';
import { Surface, outlineOf } from './surface.js';

export interface BuilderContext {
  /** The head, world space (kept current by the caller). */
  readonly head: Vector3;
  /** The player's flat forward. */
  forward(out: Vector3): Vector3;
  /** The kit's frame (a box never covers the kit). */
  kitWorld(): Matrix4;
  /** The surfaces already made, by source (to find what a pane is set into). */
  others(): Iterable<Surface[]>;
}

export type PlaneLike = { semanticLabel?: string; polygon?: ReadonlyArray<{ x: number; y: number; z: number }> };

export class SurfaceBuilder {
  private nextId = 1;
  private tmp = new Vector3();
  private tmpQ = new Quaternion();
  private tmpM = new Matrix4();
  private planeInv = new Matrix4();
  private fwd = new Vector3();

  constructor(private readonly ctx: BuilderContext) {}

  fromPlane(pl: PlaneLike, obj: Object3D, kitY: number, kitC: Vector3): Surface | null {
    const label = (pl.semanticLabel ?? '').toLowerCase();
    if (label === 'ceiling' || /invisible/.test(label)) return null;
    const poly = pl.polygon ?? [];
    if (poly.length < 3) return null;
    const centre = obj.getWorldPosition(new Vector3());
    const n = new Vector3(0, 1, 0).applyQuaternion(obj.getWorldQuaternion(this.tmpQ));
    const vertical = Math.abs(n.y) < 0.7;
    if (vertical && n.dot(this.tmp.copy(this.ctx.head).sub(centre)) < 0) n.negate();
    if (!vertical && n.y < 0) return null; // a ceiling-like face
    // the kit's own table: the kit plays all of it
    if (!vertical && Math.abs(centre.y - kitY) < 0.05) {
      this.planeInv.copy(obj.matrixWorld).invert();
      const k = this.tmp.copy(kitC).applyMatrix4(this.planeInv);
      if (insidePolygon(poly, k.x, k.z, 0.05)) return null;
    }
    const s = new Surface(`p${this.nextId++}`, 'plane', label, STRIKE_CFG);
        s.setFrame(centre, n, this.ctx.forward(this.fwd));
    const world = poly.map((p) => new Vector3(p.x, 0, p.z).applyMatrix4(obj.matrixWorld));
    outlineOf(s, world);
    const b = s.bounds;
    const f: Features = {
      facing: vertical ? 'vertical' : 'up',
      width: b.maxX - b.minX,
      length: b.maxZ - b.minZ,
      area: Math.abs(shoelace(s.outline)),
      elevation: centre.y,
      hollow: 0,
      glass: 0,
      soft: 0,
      curved: 0,
      bump: false,
      label,
    };
    this.measure(s, f);
    s.setFeatures(f);
    tuneStrike(s);
    return s.voice ? s : null;
  }

  /** A room-scan box (a cupboard, a sofa…): its top where it has a real one, and the face turned toward you. */
  fromVolume(label: string, obj: Object3D, min: ArrayLike<number>, max: ArrayLike<number>): Surface[] {
    if (/wall|floor|ceiling|table|desk|invisible/.test(label)) return [];
    const out: Surface[] = [];
    const m = obj.matrixWorld;
    const corner = (x: number, y: number, z: number) => new Vector3(x, y, z).applyMatrix4(m);
    // the box's six faces, in world space: [normal, centre, corners]
    const X = [min[0], max[0]];
    const Y = [min[1], max[1]];
    const Z = [min[2], max[2]];
    const faces: { n: Vector3; c: Vector3; pts: Vector3[] }[] = [];
    for (const ax of [0, 1, 2] as const) {
      for (const side of [0, 1]) {
        const nl = [0, 0, 0];
        nl[ax] = side ? 1 : -1;
        const pts: Vector3[] = [];
        const u = (ax + 1) % 3;
        const v = (ax + 2) % 3;
        const R = [X, Y, Z];
        for (const [a, b] of [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ]) {
          const p = [0, 0, 0];
          p[ax] = R[ax][side];
          p[u] = R[u][a];
          p[v] = R[v][b];
          pts.push(corner(p[0], p[1], p[2]));
        }
        const c = pts.reduce((acc, p) => acc.add(p), new Vector3()).multiplyScalar(0.25);
        faces.push({ n: new Vector3(nl[0], nl[1], nl[2]).transformDirection(m), c, pts });
      }
    }
    const make = (face: { n: Vector3; c: Vector3; pts: Vector3[] }, facing: Features['facing']) => {
      // never over the kit: the kit always plays its table
      for (const p of [face.c, ...face.pts]) {
        this.tmp.copy(p).applyMatrix4(this.tmpM.copy(this.ctx.kitWorld()).invert());
        if (Math.abs(this.tmp.x) < 0.45 && Math.abs(this.tmp.z) < 0.32 && Math.abs(this.tmp.y) < 0.12) return;
      }
      const s = new Surface(`v${this.nextId++}`, 'volume', label, STRIKE_CFG);
            s.setFrame(face.c, face.n, this.ctx.forward(this.fwd));
      outlineOf(s, face.pts);
      const b = s.bounds;
      const f: Features = { facing, width: b.maxX - b.minX, length: b.maxZ - b.minZ, area: (b.maxX - b.minX) * (b.maxZ - b.minZ), elevation: face.c.y, hollow: /storage|cabinet|drawer/.test(label) ? 0.9 : 0, glass: 0, soft: 0, curved: 0, bump: false, label };
      s.setFeatures(f);
      tuneStrike(s);
      if (s.voice) out.push(s);
    };
    // the top only where a box really has one to play (a sofa's box top is its backrest, in mid-air)
    if (!/couch|sofa|bed|lamp|plant|chair|other/.test(label)) {
      const top = faces.reduce((a, f) => (f.n.y > a.n.y ? f : a));
      if (top.n.y > 0.85 && top.c.y > 0.15) make(top, 'up');
    }
    // the side facing the head
    let bestDot = 0.3;
    let best: (typeof faces)[number] | null = null;
    for (const f of faces) {
      if (Math.abs(f.n.y) > 0.5) continue;
      const d = f.n.dot(this.tmp.copy(this.ctx.head).sub(f.c).normalize());
      if (d > bestDot) {
        bestDot = d;
        best = f;
      }
    }
    if (best) make(best, 'vertical');
    return out;
  }

  /** What geometry says beyond its outline: set into a bigger wall (a door, if door-shaped; else glass). */
  measure(s: Surface, f: Features): void {
    if (f.facing !== 'vertical') return;
    for (const list of this.ctx.others()) {
      for (const o of list) {
        if (o === s || o.features.facing !== 'vertical' || o.features.area <= f.area * 1.6) continue;
        if (Math.abs(o.normal.dot(s.normal)) < 0.95) continue;
        this.tmp.copy(s.centre).applyMatrix4(o.inv);
        if (Math.abs(this.tmp.y) > 0.12 || !o.over(this.tmp.x, -this.tmp.z, 0)) continue;
        const doorShaped = f.length >= 1.5 && f.width >= 0.5 && f.width <= 1.8;
        if (doorShaped || /door/.test(f.label)) f.hollow = Math.max(f.hollow, 0.7);
        // only a window or an unlabelled pane can be glass (never a door, a picture or a board)
        else if (/window/.test(f.label) || f.label === '') f.glass = Math.max(f.glass, 0.6);
      }
    }
  }
}

/** Strike tuning per surface: room planes can sit a few centimetres off; glass wants soft taps. */
export function tuneStrike(s: Surface): void {
  const c = s.detector.cfg;
  Object.assign(c, STRIKE, STRIKE_CFG);
  c.nearM = Math.max(STRIKE_CFG.nearM ?? 0, 0.03);
  c.surfaceDriftM = 0.05;
  if (s.voice?.family === 'glock') {
    c.minSpeed = Math.min(STRIKE_CFG.minSpeed ?? 1, 0.18);
    c.hardSpeed = 0.7;
  }
  // a door frame may be an open doorway, a box's face a soft cover: only a stop is a hit
  s.detector.stopOnly = s.source === 'volume' || /door/.test(s.label);
}

export function shoelace(p: { x: number; z: number }[]): number {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j].x + p[i].x) * (p[j].z - p[i].z);
  return a / 2;
}

export function insidePolygon(poly: ReadonlyArray<{ x: number; z: number }> | undefined, x: number, z: number, margin: number): boolean {
  if (!poly || poly.length < 3) return false;
  let inside = false;
  let minD = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const l2 = ex * ex + ez * ez || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / l2));
    minD = Math.min(minD, Math.hypot(x - (a.x + t * ex), z - (a.z + t * ez)));
  }
  return inside || minD <= margin;
}
