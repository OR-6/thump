/**
 * A plush's body as one soft felt shape: the picture's cells traced into an
 * outline, corners rounded off within half a cell (Chaikin on unit edges), extruded with a rounded bevel so the
 * edges pillow, and a cream running stitch sewn around the edge on both faces.
 * Replaces a grid of cubes, which read as voxels rather than a sewn toy.
 *
 * Coordinates match the old cell grid: x centred on the 8 warps, y up from the
 * plush's base (cell r spans y in [lift + r·cell, lift + (r+1)·cell]), z through
 * the plush, front face at +depth/2.
 */
import { BoxGeometry, BufferAttribute, ExtrudeGeometry, Mesh, MeshStandardMaterial, Path, Shape, Vector2 } from '@iwsdk/core';
import type { Group } from '@iwsdk/core';

type Loop = Vector2[];

/**
 * Trace the boundary of the filled cells (on(r, i), r up, i right) into closed
 * loops in cell units: outer loops counter-clockwise (positive area), holes clockwise.
 */
export function traceCells(on: (r: number, i: number) => boolean, H: number, W: number): Loop[] {
  // directed boundary edges with the filled cell on the left
  const edges: [number, number, number, number][] = [];
  for (let r = 0; r < H; r++) {
    for (let i = 0; i < W; i++) {
      if (!on(r, i)) continue;
      if (!on(r - 1, i)) edges.push([i, r, i + 1, r]);
      if (!on(r, i + 1)) edges.push([i + 1, r, i + 1, r + 1]);
      if (!on(r + 1, i)) edges.push([i + 1, r + 1, i, r + 1]);
      if (!on(r, i - 1)) edges.push([i, r + 1, i, r]);
    }
  }
  const key = (x: number, y: number) => x * 1000 + y;
  const from = new Map<number, number[]>();
  edges.forEach((e, k) => {
    const s = key(e[0], e[1]);
    const l = from.get(s) ?? [];
    l.push(k);
    from.set(s, l);
  });
  const used = new Uint8Array(edges.length);
  const loops: Loop[] = [];
  for (let s = 0; s < edges.length; s++) {
    if (used[s]) continue;
    const loop: Loop = [];
    let k = s;
    while (!used[k]) {
      used[k] = 1;
      const e = edges[k];
      loop.push(new Vector2(e[0], e[1]));
      const dx = e[2] - e[0];
      const dy = e[3] - e[1];
      const next = (from.get(key(e[2], e[3])) ?? []).filter((n) => !used[n]);
      if (!next.length) break;
      // at a pinch (two cells touching only at a corner) take the left turn: keeps loops simple
      next.sort((a, b) => turn(edges[b], dx, dy) - turn(edges[a], dx, dy));
      k = next[0];
    }
    if (loop.length >= 4) loops.push(loop); // unit edges: rounding stays local to each corner
  }
  return loops;
}

const turn = (e: [number, number, number, number], dx: number, dy: number) => dx * (e[3] - e[1]) - dy * (e[2] - e[0]);

export function dropCollinear(loop: Loop): Loop {
  const out: Loop = [];
  const n = loop.length;
  for (let k = 0; k < n; k++) {
    const a = loop[(k + n - 1) % n];
    const b = loop[k];
    const c = loop[(k + 1) % n];
    if (Math.abs((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)) > 1e-9) out.push(b);
  }
  return out;
}

/** Signed area (positive: counter-clockwise). */
export function area(loop: Loop): number {
  let a = 0;
  for (let k = 0; k < loop.length; k++) {
    const p = loop[k];
    const q = loop[(k + 1) % loop.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** Corner cutting: each pass replaces a corner by two points at 1/4 and 3/4 along its edges. */
export function chaikin(loop: Loop, passes: number): Loop {
  let pts = loop;
  for (let p = 0; p < passes; p++) {
    const out: Loop = [];
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k];
      const b = pts[(k + 1) % pts.length];
      out.push(new Vector2(a.x * 0.75 + b.x * 0.25, a.y * 0.75 + b.y * 0.25), new Vector2(a.x * 0.25 + b.x * 0.75, a.y * 0.25 + b.y * 0.75));
    }
    pts = out;
  }
  return pts;
}

function inside(p: Vector2, loop: Loop): boolean {
  let c = false;
  for (let k = 0, j = loop.length - 1; k < loop.length; j = k++) {
    const a = loop[k];
    const b = loop[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

export interface BodyOptions {
  cell: number;
  lift: number;
  warps: number;
  /** Total thickness (m). */
  depth: number;
}

let stitchGeo: BoxGeometry | null = null;
let stitchMat: MeshStandardMaterial | null = null;

/**
 * Add the felt body (one mesh) and its running stitch (small cream dashes, merged
 * later with the plush's other static parts) to `g`. `on(r, i)` says which cells
 * belong to the body. Returns the body mesh, or null when there are no cells.
 */
export function addFeltBody(g: Group, on: (r: number, i: number) => boolean, H: number, mat: MeshStandardMaterial, o: BodyOptions): Mesh | null {
  const loops = traceCells(on, H, o.warps).map((l) => dropCollinear(chaikin(l, 3)));
  if (!loops.length) return null;
  const toM = (v: Vector2) => new Vector2((v.x - o.warps / 2) * o.cell, o.lift + v.y * o.cell);
  const outers = loops.filter((l) => area(l) > 0).map((l) => l.map(toM));
  const holes = loops.filter((l) => area(l) < 0).map((l) => l.map(toM));
  if (!outers.length) return null;
  const shapes = outers.map((pts) => {
    const s = new Shape(pts);
    for (const h of holes) if (inside(h[0], pts)) s.holes.push(new Path(h));
    return s;
  });
  // a soft rounded edge: the bevel is a quarter-ellipse, tangent to the face and the side
  const bevel = Math.min(o.depth * 0.32, o.cell * 0.42);
  const geo = new ExtrudeGeometry(shapes, {
    depth: Math.max(0.0005, o.depth - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: o.cell * 0.3,
    bevelOffset: -o.cell * 0.22,
    bevelSegments: 2, // half the triangles; the felt edge still reads round
    curveSegments: 1,
  });
  geo.translate(0, 0, -(o.depth - bevel * 2) / 2);
  // felt texture: one tile per cell, as before
  const uv = geo.getAttribute('uv') as BufferAttribute;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) / o.cell, uv.getY(k) / o.cell);
  smoothNormals(geo);
  const body = new Mesh(geo, mat);
  body.name = 'PlushBody';
  body.castShadow = true;
  g.add(body);
  // the running stitch: dashes a few mm in from the edge, on the front and the back
  stitchGeo ??= new BoxGeometry(1, 1, 1);
  stitchGeo.userData.sharedGeometry = true;
  stitchMat ??= new MeshStandardMaterial({ color: 0xfff1d6, roughness: 0.9, name: 'PlushStitch' });
  const zf = o.depth / 2 + 0.0002;
  for (const pts of outers) {
    const n = pts.length;
    let len = 0;
    const cum: number[] = [0];
    for (let k = 0; k < n; k++) cum.push((len += pts[k].distanceTo(pts[(k + 1) % n])));
    const step = 0.0056;
    const count = Math.floor(len / step);
    let seg = 0;
    for (let s = 0; s < count; s++) {
      const d = (s + 0.5) * (len / count);
      while (cum[seg + 1] < d) seg++;
      const a = pts[seg];
      const b = pts[(seg + 1) % n];
      const t = (d - cum[seg]) / Math.max(1e-6, cum[seg + 1] - cum[seg]);
      const tx = b.x - a.x;
      const ty = b.y - a.y;
      const tl = Math.hypot(tx, ty) || 1;
      // inward normal of a counter-clockwise loop: the left of the tangent
      const nx = -ty / tl;
      const ny = tx / tl;
      const inset = o.cell * 0.36;
      const x = a.x + tx * t + nx * inset;
      const y = a.y + ty * t + ny * inset;
      for (const z of [zf, -zf]) {
        const m = new Mesh(stitchGeo, stitchMat);
        m.scale.set(0.0029, 0.0009, 0.0006);
        m.position.set(x, y, z);
        m.rotation.z = Math.atan2(ty, tx);
        g.add(m);
      }
    }
  }
  return body;
}

/** Smooth shading across the bevel: average face normals at shared positions (area-weighted). */
function smoothNormals(geo: ExtrudeGeometry): void {
  const pos = geo.getAttribute('position') as BufferAttribute;
  const n = pos.count;
  // shared positions by a numeric key (0.1 mm grid; a plush is well within ±0.5 m): no strings per vertex
  const q = (v: number) => Math.round(v * 1e4) + 5000;
  const slotOf = new Map<number, number>();
  const slot = new Uint32Array(n);
  for (let k = 0; k < n; k++) {
    const key = q(pos.getX(k)) * 1e8 + q(pos.getY(k)) * 1e4 + q(pos.getZ(k));
    let i = slotOf.get(key);
    if (i === undefined) slotOf.set(key, (i = slotOf.size));
    slot[k] = i;
  }
  const acc = new Float32Array(slotOf.size * 3);
  for (let k = 0; k + 2 < n; k += 3) {
    const ax = pos.getX(k), ay = pos.getY(k), az = pos.getZ(k);
    const ux = pos.getX(k + 1) - ax, uy = pos.getY(k + 1) - ay, uz = pos.getZ(k + 1) - az;
    const vx = pos.getX(k + 2) - ax, vy = pos.getY(k + 2) - ay, vz = pos.getZ(k + 2) - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (let j = 0; j < 3; j++) {
      const o = slot[k + j] * 3;
      acc[o] += nx;
      acc[o + 1] += ny;
      acc[o + 2] += nz;
    }
  }
  const nor = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) {
    const o = slot[k] * 3;
    const l = Math.hypot(acc[o], acc[o + 1], acc[o + 2]) || 1;
    nor[k * 3] = acc[o] / l;
    nor[k * 3 + 1] = acc[o + 1] / l;
    nor[k * 3 + 2] = acc[o + 2] / l;
  }
  geo.setAttribute('normal', new BufferAttribute(nor, 3));
}
