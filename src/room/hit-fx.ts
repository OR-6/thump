/**
 * What you hit answers in its own shape (like a hit circle swelling off in osu!, or a target lighting at the strike
 * line): one thin neon outline of the struck part (round for a drum, a conga or a handpan note; a rounded rectangle
 * for a key, a bar or the strings) swells a little off it and fades in about a third of a second, in the part's own
 * colour over a faint dark edge so it reads on a white head. A Perfect is brighter, swells further and lights the
 * part for a moment (a glow, not a white-out); a Good is a fainter, smaller ring. The streak stepping up sends one
 * bigger ring off the last thing you hit: rare, so it can be big. Small enough that the next note's approach ring
 * stays readable through it. Calm motion: half the swell, no glow. A small pool, its outlines rewritten in place:
 * nothing allocated per frame.
 */
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, Quaternion, Vector3, type Object3D } from '@iwsdk/core';
import { BRAND, hexNum } from '../ui/theme.js';
import { motion } from '../ui/motion.js';

/** Points round each corner (the perimeter has 4 × (K + 1)). */
const K = 10;
const P = 4 * (K + 1);
const POOL = 10;

export interface PartShape {
  /** World centre on the struck surface, and the surface's world orientation (its local +Y out of the surface). */
  at: Vector3;
  q: Quaternion;
  /** Size along the surface's local X and Z (m); round: a disc of diameter w. */
  w: number;
  d: number;
  round: boolean;
}

export type FlashKind = 'perfect' | 'good' | 'mult';

interface Slot {
  ring: Mesh;
  edge: Mesh;
  fill: Mesh;
  age: number;
  life: number;
  spread: number;
  width: number;
  hw: number;
  hd: number;
  r: number;
  fillK: number;
  /** How long the part's own snap lasts (s). */
  fillT: number;
}

/** Write the perimeter of a rounded rectangle (half sizes hw, hd, corner r) grown by o, into xyz at `base`. */
function perimeter(arr: Float32Array, base: number, hw: number, hd: number, r: number, o: number): void {
  const cx = [hw - r, -(hw - r), -(hw - r), hw - r];
  const cz = [hd - r, hd - r, -(hd - r), -(hd - r)];
  const rr = Math.max(0, r + o);
  let n = base;
  for (let c = 0; c < 4; c++)
    for (let k = 0; k <= K; k++) {
      const a = (c + k / K) * (Math.PI / 2);
      arr[n++] = cx[c] + Math.cos(a) * rr;
      arr[n++] = 0;
      arr[n++] = cz[c] + Math.sin(a) * rr;
    }
}

function frameGeometry(): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(P * 2 * 3), 3));
  const idx: number[] = [];
  for (let i = 0; i < P; i++) {
    const j = (i + 1) % P;
    idx.push(i, P + i, j, j, P + i, P + j);
  }
  g.setIndex(idx);
  return g;
}

function fanGeometry(): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array((P + 1) * 3), 3));
  const idx: number[] = [];
  for (let i = 0; i < P; i++) idx.push(P, (i + 1) % P, i);
  g.setIndex(idx);
  return g;
}

export class HitFx {
  readonly root = new Group();
  private slots: Slot[] = [];
  private next = 0;
  private col = new Color();
  private white = new Color(1, 1, 1);

  constructor(parent: Object3D) {
    this.root.name = 'HitFx';
    const mat = (o: number) => new MeshBasicMaterial({ transparent: true, depthWrite: false, depthTest: false, toneMapped: false, side: DoubleSide, opacity: o });
    for (let i = 0; i < POOL; i++) {
      const edge = new Mesh(frameGeometry(), mat(0));
      const ring = new Mesh(frameGeometry(), mat(0));
      const fill = new Mesh(fanGeometry(), mat(0));
      (edge.material as MeshBasicMaterial).color.setHex(hexNum(BRAND.plum));
      edge.renderOrder = 12;
      fill.renderOrder = 12;
      ring.renderOrder = 13;
      for (const m of [edge, ring, fill]) {
        m.visible = false;
        m.frustumCulled = false;
        m.name = 'HitFlash';
        this.root.add(m);
      }
      this.slots.push({ ring, edge, fill, age: 9, life: 1, spread: 0, width: 0, hw: 0, hd: 0, r: 0, fillK: 0, fillT: 0.1 });
    }
    parent.add(this.root);
  }

  /** Flash the part `s` in `color` (`delay` s later). */
  flash(kind: FlashKind, s: PartShape, color: number, delay = 0): void {
    const slot = this.slots[this.next++ % POOL];
    slot.hw = s.w / 2;
    slot.hd = s.round ? s.w / 2 : s.d / 2;
    // (a key or a bar: softly rounded corners; a disc: all corner)
    slot.r = s.round ? s.w / 2 : Math.min(slot.hw, slot.hd) * 0.35;
    slot.age = -delay;
    slot.life = kind === 'mult' ? 0.55 : kind === 'perfect' ? 0.32 : 0.26;
    // (how far it swells past the part, in metres: bigger parts swell further, but never much)
    const size = Math.min(slot.hw, slot.hd);
    const calm = motion.calm ? 0.5 : 1;
    slot.spread = calm * (kind === 'mult' ? 0.03 + size * 0.45 : kind === 'perfect' ? 0.006 + size * 0.2 : 0.004 + size * 0.1);
    slot.width = kind === 'mult' ? 0.005 : kind === 'perfect' ? 0.0045 : 0.0026;
    // (a Perfect: the part snaps white-hot for 70 ms, a crack of light, not a glow; a Good: just its ring)
    slot.fillK = motion.calm ? 0 : kind === 'perfect' ? 0.55 : 0;
    slot.fillT = 0.07;
    // (a Good: the part's colour, dimmer; a Perfect's ring a little toward white)
    this.col.setHex(color);
    if (kind === 'good') this.col.multiplyScalar(0.65);
    if (kind === 'perfect') this.col.lerp(this.white, 0.3);
    (slot.ring.material as MeshBasicMaterial).color.copy(this.col);
    if (kind === 'perfect') this.col.lerp(this.white, 0.35);
    (slot.fill.material as MeshBasicMaterial).color.copy(this.col);
    for (const m of [slot.ring, slot.edge, slot.fill]) {
      m.position.copy(s.at);
      m.quaternion.copy(s.q);
      m.visible = false;
    }
  }

  update(dt: number): void {
    for (const s of this.slots) {
      if (s.age >= s.life) continue;
      s.age += dt;
      if (s.age < 0) continue;
      const u = Math.min(1, s.age / s.life);
      if (u >= 1) {
        s.ring.visible = s.edge.visible = s.fill.visible = false;
        continue;
      }
      const grow = s.spread * (1 - Math.pow(1 - u, 3));
      const w = s.width * (1 - u * 0.6);
      const ring = s.ring.geometry.getAttribute('position') as BufferAttribute;
      perimeter(ring.array as Float32Array, 0, s.hw, s.hd, s.r, grow);
      perimeter(ring.array as Float32Array, P * 3, s.hw, s.hd, s.r, grow + w);
      ring.needsUpdate = true;
      // (the dark edge: just outside and inside the neon, so it reads on a white head or a bright desk)
      const edge = s.edge.geometry.getAttribute('position') as BufferAttribute;
      perimeter(edge.array as Float32Array, 0, s.hw, s.hd, s.r, grow - 0.0015);
      perimeter(edge.array as Float32Array, P * 3, s.hw, s.hd, s.r, grow + w + 0.0015);
      edge.needsUpdate = true;
      (s.ring.material as MeshBasicMaterial).opacity = 1 - u * u;
      (s.edge.material as MeshBasicMaterial).opacity = 0.35 * (1 - u);
      s.ring.visible = s.edge.visible = true;
      // the part itself snaps bright for its first moment
      const f = s.fillK * Math.max(0, 1 - s.age / s.fillT);
      s.fill.visible = f > 0.01;
      if (s.fill.visible) {
        const fan = s.fill.geometry.getAttribute('position') as BufferAttribute;
        const a = fan.array as Float32Array;
        perimeter(a, 0, s.hw, s.hd, s.r, 0);
        a[P * 3] = a[P * 3 + 1] = a[P * 3 + 2] = 0;
        fan.needsUpdate = true;
        (s.fill.material as MeshBasicMaterial).opacity = f;
      }
    }
  }
}
