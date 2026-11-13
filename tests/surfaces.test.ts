import { describe, expect, it } from 'vitest';
import { Matrix4, Object3D, Vector3 } from '@iwsdk/core';
import { SurfaceBuilder, insidePolygon } from '../src/room/surface-builder.js';
import { SwapGesture, SWAP_HOLD_S } from '../src/room/swaps.js';
import type { Surface } from '../src/room/surface.js';

/** A room: the head at the origin looking down −z, the kit far off to the side. */
function room() {
  const made = new Map<object, Surface[]>();
  const kit = new Matrix4().makeTranslation(10, 0.75, 10);
  const b = new SurfaceBuilder({ head: new Vector3(0, 1.2, 0), forward: (o) => o.set(0, 0, -1), kitWorld: () => kit, others: () => made.values() });
  return { b, made };
}

/** A vertical plane facing the head at z = −d (local y is its normal), w × h, centred at height y. */
function wall(d: number, w: number, h: number, y: number, x = 0) {
  const o = new Object3D();
  o.position.set(x, y, -d);
  o.rotation.x = Math.PI / 2;
  o.updateMatrixWorld(true);
  const polygon = [
    { x: -w / 2, y: 0, z: -h / 2 },
    { x: w / 2, y: 0, z: -h / 2 },
    { x: w / 2, y: 0, z: h / 2 },
    { x: -w / 2, y: 0, z: h / 2 },
  ];
  return { o, polygon };
}

describe('surfaces from planes', () => {
  it('a big wall in front is a gong, framed facing the head', () => {
    const { b } = room();
    const w = wall(1.5, 3, 2.5, 1.25);
    const s = b.fromPlane({ semanticLabel: 'wall', polygon: w.polygon }, w.o, 0.75, new Vector3(10, 0.75, 10))!;
    expect(s.voice?.family).toBe('gong');
    expect(s.normal.z).toBeGreaterThan(0.99);
    expect(s.bounds.maxX - s.bounds.minX).toBeCloseTo(3, 1);
  });
  it('a door-shaped plane set into that wall is a hollow door: a marimba', () => {
    const { b, made } = room();
    const w = wall(1.5, 3, 2.5, 1.25);
    made.set({}, [b.fromPlane({ semanticLabel: 'wall', polygon: w.polygon }, w.o, 0.75, new Vector3(10, 0, 10))!]);
    const d = wall(1.49, 0.85, 2, 1, 0.6);
    expect(b.fromPlane({ semanticLabel: '', polygon: d.polygon }, d.o, 0.75, new Vector3(10, 0, 10))?.voice?.family).toBe('marimba');
  });
  it('a window set into it is glass: a glockenspiel', () => {
    const { b, made } = room();
    const w = wall(1.5, 3, 2.5, 1.25);
    made.set({}, [b.fromPlane({ semanticLabel: 'wall', polygon: w.polygon }, w.o, 0.75, new Vector3(10, 0, 10))!]);
    const g = wall(1.49, 1.2, 1, 1.4, -0.7);
    expect(b.fromPlane({ semanticLabel: 'window frame', polygon: g.polygon }, g.o, 0.75, new Vector3(10, 0, 10))?.voice?.family).toBe('glock');
  });
  it('the kit’s own table is not a room surface; a ceiling never is', () => {
    const { b } = room();
    const t = new Object3D();
    t.position.set(0, 0.75, -0.4);
    t.updateMatrixWorld(true);
    const poly = [{ x: -0.6, y: 0, z: -0.3 }, { x: 0.6, y: 0, z: -0.3 }, { x: 0.6, y: 0, z: 0.3 }, { x: -0.6, y: 0, z: 0.3 }];
    expect(b.fromPlane({ semanticLabel: 'table', polygon: poly }, t, 0.75, new Vector3(0, 0.75, -0.4))).toBeNull();
    const c = new Object3D();
    c.position.set(0, 2.5, 0);
    c.updateMatrixWorld(true);
    expect(b.fromPlane({ semanticLabel: 'ceiling', polygon: poly }, c, 0.75, new Vector3(10, 0, 10))).toBeNull();
  });
  it('surfaces get unique ids', () => {
    const { b } = room();
    const w = wall(1.5, 3, 2.5, 1.25);
    const a = b.fromPlane({ semanticLabel: 'wall', polygon: w.polygon }, w.o, 0.75, new Vector3(10, 0, 10))!;
    const c = b.fromPlane({ semanticLabel: 'wall', polygon: w.polygon }, w.o, 0.75, new Vector3(10, 0, 10))!;
    expect(a.id).not.toBe(c.id);
  });
});

describe('surfaces from room-scan boxes', () => {
  const box = (x: number, z: number) => {
    const o = new Object3D();
    o.position.set(x, 0, z);
    o.updateMatrixWorld(true);
    return o;
  };
  it('a cupboard: its top and its front facing you; the front is a tongue drum', () => {
    const { b } = room();
    const out = b.fromVolume('storage', box(0, -1.2), [-0.4, 0, -0.2], [0.4, 0.9, 0.2]);
    const front = out.find((s) => s.features.facing === 'vertical')!;
    expect(front.voice?.family).toBe('tongue');
    expect(front.normal.z).toBeGreaterThan(0.9);
    expect(out.some((s) => s.features.facing === 'up')).toBe(true);
  });
  it('a sofa: no top (its box top is the backrest in mid-air), its front a shaker', () => {
    const { b } = room();
    const out = b.fromVolume('couch', box(0, -1.5), [-0.9, 0, -0.4], [0.9, 0.8, 0.4]);
    expect(out.every((s) => s.features.facing === 'vertical')).toBe(true);
    expect(out[0]?.voice?.family).toBe('shaker');
  });
  it('walls and tables from the scan are planes, not boxes', () => {
    const { b } = room();
    expect(b.fromVolume('table', box(0, -1), [-0.5, 0, -0.3], [0.5, 0.75, 0.3])).toEqual([]);
  });
});

describe('polygons', () => {
  const sq = [{ x: -1, z: -1 }, { x: 1, z: -1 }, { x: 1, z: 1 }, { x: -1, z: 1 }];
  it('inside, near the edge with a margin, and outside', () => {
    expect(insidePolygon(sq, 0, 0, 0)).toBe(true);
    expect(insidePolygon(sq, 1.03, 0, 0.05)).toBe(true);
    expect(insidePolygon(sq, 1.2, 0, 0.05)).toBe(false);
    expect(insidePolygon([], 0, 0, 1)).toBe(false);
  });
});

describe('the swap gesture', () => {
  const hand = () => ({ tracked: true, pinch: { pinching: false }, edge: 'none' as 'none' | 'start' | 'end', pinchPoint: new Vector3(0, 1, -1) });
  const near = (p: Vector3) => (p.z < -0.9 ? 'door' : null);
  it('a pinch started at an instrument and held changes it once', () => {
    const g = new SwapGesture<string>();
    const h = hand();
    const starts: string[] = [];
    h.pinch.pinching = true;
    h.edge = 'start';
    expect(g.update([h], true, 0, near, (t) => starts.push(t))).toBeNull();
    h.edge = 'none';
    expect(g.update([h], true, SWAP_HOLD_S / 2, near, () => {})).toBeNull();
    expect(g.update([h], true, SWAP_HOLD_S + 0.01, near, () => {})).toBe('door');
    expect(g.update([h], true, SWAP_HOLD_S + 1, near, () => {})).toBeNull();
    expect(starts).toEqual(['door']);
  });
  it('a pinch that starts away from it, drifts, or lets go changes nothing', () => {
    const g = new SwapGesture<string>();
    const h = hand();
    h.pinch.pinching = true;
    h.edge = 'start';
    h.pinchPoint.z = -0.5;
    g.update([h], true, 0, near, () => {});
    h.edge = 'none';
    h.pinchPoint.z = -1;
    expect(g.update([h], true, 2, near, () => {})).toBeNull();
    // starts at it, then drifts 8 cm
    h.edge = 'start';
    g.update([h], true, 3, near, () => {});
    h.edge = 'none';
    h.pinchPoint.x = 0.08;
    expect(g.update([h], true, 4, near, () => {})).toBeNull();
    // disabled (a song is playing)
    h.pinchPoint.x = 0;
    h.edge = 'start';
    expect(g.update([h], false, 5, near, () => {})).toBeNull();
    h.edge = 'none';
    expect(g.update([h], true, 6, near, () => {})).toBeNull();
  });
});
