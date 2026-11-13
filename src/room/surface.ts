/**
 * A playable surface of the room: its frame, size, measured features, instrument and zones, and its own
 * strike detector. Built from a detected plane, a face of a room-scan volume, the kit's table, or the
 * module's keys.
 *
 * Surface frame (right-handed): x to the right as you face it, y out of the surface toward you (the
 * normal), z = x × y (down the surface for walls; toward you for a table top). Zone coordinates (see
 * zones.ts) use the same x and z flipped, so zone z is "up the wall" or "away across the table".
 */
import { Matrix4, Quaternion, Vector3 } from '@iwsdk/core';
import { StrikeDetector } from '../kit/strike.js';
import { classify, swapsFor, type Family, type Features, type Voice } from './classify.js';
import { zonesFor, type Bounds, type Zone } from './zones.js';

export type SurfaceSource = 'plane' | 'volume' | 'kit' | 'module';

const _up = new Vector3(0, 1, 0);
const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _q = new Quaternion();
const _s = new Vector3(1, 1, 1);

export class Surface {
  /** Surface-local → world. */
  readonly world = new Matrix4();
  /** World → surface-local. */
  readonly inv = new Matrix4();
  readonly normal = new Vector3();
  readonly centre = new Vector3();
  bounds: Bounds = { minX: -0.1, maxX: 0.1, minZ: -0.1, maxZ: 0.1 };
  /** Outline in zone coordinates (x, z up/away), for the sheen. */
  outline: { x: number; z: number }[] = [];
  features!: Features;
  voice: Voice | null = null;
  /** What its physics says it is (before any swap). */
  natural: Family | null = null;
  /** The player swapped it to this instrument (null: it plays what it is). */
  as: Family | null = null;
  zones: Zone[] = [];
  discovered = false;
  /** Where its zones are centred (zone coordinates); set by the first hit. */
  anchor = { x: 0, z: 0 };
  readonly detector: StrikeDetector;
  /** Was each hand within range last frame (left, right)? */
  readonly near: [boolean, boolean] = [false, false];
  /** Closest distance from the head (m), refreshed while placing. */
  reach = Infinity;
  /** Hits (debug). */
  hits = 0;
  /** Measured softness: the deepest a hand went past the surface after a hit, smoothed (m). */
  sink = 0;

  constructor(
    public id: string,
    readonly source: SurfaceSource,
    readonly label: string,
    strike: ConstructorParameters<typeof StrikeDetector>[0] = {},
  ) {
    this.detector = new StrikeDetector(strike);
  }

  /** Set the frame from a centre, a normal facing the room, and (for horizontal tops) the player's forward. */
  setFrame(centre: Vector3, normal: Vector3, forward: Vector3): void {
    const n = _b.copy(normal).normalize();
    const vertical = Math.abs(n.y) < 0.7;
    let x: Vector3;
    if (vertical) {
      // x = up × n: the right as you face it
      x = _a.copy(_up).cross(n).normalize();
    } else {
      // a top: x is the player's right (forward × up)
      x = _a.copy(forward).setY(0);
      if (x.lengthSq() < 1e-6) x.set(0, 0, -1);
      x.normalize().cross(_up).normalize();
      if (n.y < 0) x.negate();
    }
    const z = _c.copy(x).cross(n).normalize();
    this.world.makeBasis(x, n, z).setPosition(centre);
    this.inv.copy(this.world).invert();
    this.normal.copy(n);
    this.centre.copy(centre);
  }

  /** World point → zone coordinates (x across, z up the wall / away across a top), and its height. */
  toZone(world: Vector3, out: { x: number; y: number; z: number }): void {
    _a.copy(world).applyMatrix4(this.inv);
    out.x = _a.x;
    out.y = _a.y;
    out.z = -_a.z;
  }

  /** Measure and decide its instrument. */
  setFeatures(f: Features, isKitTable = false): void {
    this.features = f;
    const v = classify(f, isKitTable);
    this.voice = v;
    this.natural = v?.family ?? null;
    // a swap holds while it still suits what the surface is (a re-measured surface may drop it)
    if (v && this.as && this.as !== v.family && swapsFor(v.family).includes(this.as)) this.voice = { ...v, family: this.as, why: `swapped from ${v.family}` };
    else this.as = null;
  }

  /** Lay its zones out around `anchor` (zone coordinates), in key `keyPc`. */
  layZones(anchor: { x: number; z: number }, keyPc = 0): void {
    this.anchor = { x: anchor.x, z: anchor.z };
    this.zones = this.voice ? zonesFor(this.voice.family, this.bounds, this.anchor, this.voice.size, keyPc) : [];
  }

  /** Closest distance from a world point to the surface's rectangle. */
  distanceTo(p: Vector3): number {
    _a.copy(p).applyMatrix4(this.inv);
    const zx = Math.min(this.bounds.maxX, Math.max(this.bounds.minX, _a.x));
    const zz = Math.min(this.bounds.maxZ, Math.max(this.bounds.minZ, -_a.z));
    return Math.hypot(_a.x - zx, _a.y, -_a.z - zz);
  }

  /** Is a zone-space point over the surface (with a margin)? */
  over(x: number, z: number, margin = 0.04): boolean {
    const b = this.bounds;
    return x >= b.minX - margin && x <= b.maxX + margin && z >= b.minZ - margin && z <= b.maxZ + margin;
  }

  /** Decompose the frame (for placing an overlay group). */
  pose(pos: Vector3, quat: Quaternion): void {
    this.world.decompose(pos, quat, _s);
  }
}

/** Bounds and outline (zone coordinates) of world points lying on a surface. */
export function outlineOf(s: Surface, worldPts: Vector3[]): void {
  const o = { x: 0, y: 0, z: 0 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  s.outline = [];
  for (const p of worldPts) {
    s.toZone(p, o);
    s.outline.push({ x: o.x, z: o.z });
    minX = Math.min(minX, o.x);
    maxX = Math.max(maxX, o.x);
    minZ = Math.min(minZ, o.z);
    maxZ = Math.max(maxZ, o.z);
  }
  s.bounds = { minX, maxX, minZ, maxZ };
}

void _q;

/** A room surface whose physics suits more than one instrument (the kit's table and the module never swap). */
export function swappable(s: Surface): boolean {
  return (s.source === 'plane' || s.source === 'volume') && !!s.natural && swapsFor(s.natural).length > 1;
}

export function surfaceName(s: Surface): string {
  const l = s.label;
  if (/door/.test(l)) return 'Door';
  if (/window/.test(l)) return 'Window';
  if (/storage|cabinet/.test(l)) return 'Cupboard';
  if (/couch|sofa/.test(l)) return 'Sofa';
  if (/bed/.test(l)) return 'Bed';
  if (/screen/.test(l)) return 'Screen';
  if (/wall art|picture/.test(l)) return 'Picture';
  if (/table|desk/.test(l)) return 'Table';
  if (/floor/.test(l)) return 'Floor';
  if (/wall/.test(l)) return 'Wall';
  if (s.source === 'kit') return 'Table';
  return s.features?.facing === 'vertical' ? 'Wall' : 'Top';
}

/** Glass (a window, a screen): soft taps only, whatever instrument it plays. */
export function isGlass(s: Surface): boolean {
  return (s.features?.glass ?? 0) >= 0.5 || /window|screen/.test(s.label);
}
