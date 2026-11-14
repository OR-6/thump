/**
 * The Instruments screen's miniatures: the real models at about 1:6, standing on the panel in front of their cards,
 * tipped toward you. The one under your finger rises and turns slowly; the one you pick flies to the desk (where the
 * real one unfolds) and is gone. Built once, on the first visit; hidden on every other page.
 */
import { Box3, Group, Vector3 } from '@iwsdk/core';
import { miniModel } from '../room/friend-seat.js';

/** How wide a miniature is (m), and how far it stands off the panel's face. */
const SIZE = 0.027;
const OFF = 0.022;

interface Mini {
  id: string;
  /** Where it sits on the panel (panel-local), the pivot that turns it, and its scale at rest. */
  holder: Group;
  spin: Group;
  home: Vector3;
  s: number;
  lift: number;
  fly: number;
}

const _v = new Vector3();
const _b = new Box3();

export class Minis {
  readonly root = new Group();
  private minis = new Map<string, Mini>();
  private shown = false;
  private flyTo = new Vector3();

  constructor() {
    this.root.name = 'Miniatures';
    this.root.visible = false;
  }

  /** Build them (once) and stand each in front of its card (`at`: panel-local centre of the card's picture). */
  layout(cards: readonly { id: string; x: number; y: number }[], lean: number): void {
    for (const c of cards) {
      let m = this.minis.get(c.id);
      if (!m) {
        const built = miniModel(c.id);
        const spin = new Group();
        spin.add(built.root);
        // (centred on its footprint, standing on its own base)
        built.root.updateMatrixWorld(true);
        _b.setFromObject(built.root);
        const size = _b.getSize(_v);
        const s = SIZE / Math.max(0.01, size.x, size.z);
        const cx = (_b.min.x + _b.max.x) / 2;
        const cz = (_b.min.z + _b.max.z) / 2;
        built.root.position.set(-cx, -_b.min.y, -cz);
        const holder = new Group();
        holder.name = `Mini:${c.id}`;
        holder.add(spin);
        this.root.add(holder);
        m = { id: c.id, holder, spin, home: new Vector3(), s, lift: 0, fly: -1 };
        this.minis.set(c.id, m);
      }
      // upright in the room (the panel leans back), then tipped a little toward you, as if on a shelf below your eyes
      m.holder.rotation.set(lean + 0.45, 0, 0);
      m.home.set(c.x, c.y - 0.012, OFF);
      m.holder.position.copy(m.home);
      m.holder.scale.setScalar(m.s);
      m.holder.visible = true;
      m.spin.rotation.y = -0.5;
      m.lift = 0;
      m.fly = -1;
    }
    for (const [id, m] of this.minis) if (!cards.some((c) => c.id === id)) m.holder.visible = false;
    this.shown = true;
    this.root.visible = true;
  }

  /** Off this page: gone, except one still flying to the desk. */
  hide(): void {
    this.shown = false;
    for (const m of this.minis.values()) if (m.fly < 0 || m.fly >= 1) m.holder.visible = false;
    this.root.visible = [...this.minis.values()].some((m) => m.holder.visible);
  }

  get active(): boolean {
    return this.shown;
  }

  /** The one picked flies from its card to `to` (panel-local: the middle of the desk), growing as it goes. */
  fly(id: string, to: Vector3): void {
    const m = this.minis.get(id);
    if (!m || !m.holder.visible) return;
    this.flyTo.copy(to);
    m.fly = 0;
  }

  /** `hover`: the id under a finger (or ''); `calm`: half the motion, no overshoot. */
  update(dt: number, hover: string, calm = false): void {
    if (!this.root.visible) return;
    for (const m of this.minis.values()) {
      if (!m.holder.visible) continue;
      if (m.fly >= 0) {
        // 400 ms out to the desk, eased in and out, growing to about half size, then gone (the real one unfolds)
        m.fly = Math.min(1, m.fly + dt / 0.4);
        const e = m.fly < 0.5 ? 2 * m.fly * m.fly : 1 - Math.pow(-2 * m.fly + 2, 2) / 2;
        m.holder.position.lerpVectors(m.home, this.flyTo, e);
        m.holder.scale.setScalar(m.s * (1 + e * 2));
        if (m.fly >= 1) {
          m.holder.visible = false;
          if (!this.shown) this.root.visible = [...this.minis.values()].some((x) => x.holder.visible);
        }
        continue;
      }
      // the one under your finger rises toward you a centimetre (120 ms, eased out) and turns slowly
      const want = m.id === hover ? 1 : 0;
      m.lift += (want - m.lift) * Math.min(1, dt / 0.12);
      m.holder.position.set(m.home.x, m.home.y + 0.004 * m.lift, m.home.z + (calm ? 0.005 : 0.01) * m.lift);
      m.holder.scale.setScalar(m.s * (1 + 0.08 * m.lift));
      if (m.lift > 0.05) m.spin.rotation.y = (m.spin.rotation.y + dt * (calm ? 0.4 : 0.8) * m.lift) % (Math.PI * 2);
      else {
        // (back to its resting turn the short way round)
        const d = ((((-0.5 - m.spin.rotation.y) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        m.spin.rotation.y += d * Math.min(1, dt / 0.3);
      }
    }
  }
}
