/**
 * Everything the kit shows, in kit-local space (origin on the table at the kit's centre, +Z toward
 * the player): the pads, the travelling chips, the crowd, the bandmate, the felt cards, the paper
 * tags, the hands' shadows on the table, and the toy juice (puffs, rings, confetti).
 *
 * Nothing floats: tags and cards lie on the table, tilted up toward the player.
 */
import {
  AdditiveBlending,
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  Vector3,
} from '@iwsdk/core';
import { CROWD, FELT, LANES, PADS, type Lane } from '../config.js';
import { PadView, feltDisc } from './pad-view.js';
import { Chips } from './chips.js';
import { Crowd } from '../crowd/crowd.js';
import { Bird } from '../bandmate/bird.js';
import { Card } from '../ui/cards.js';
import { Label } from '../ui/label.js';
import { Fx } from '../art/fx.js';
import { blobTexture, starShape } from '../art/felt.js';
import { themeFor, type Theme } from '../ui/theme.js';
import { SONGS } from '../songs/songs.js';
import type { Song } from '../songs/chart.js';
import type { Progress } from '../persistence/progress.js';
import type { ChipView } from '../play/flow.js';
import { motion } from '../ui/motion.js';

/** The song cards on the desk: a row standing at the back-left, tilted toward the player. */
export const LIST = { x0: -0.27, z: -0.13, w: 0.07, d: 0.095, gap: 0.078, tilt: 1.05 } as const;
/** The felt plate you tap twice to move the kit (front-left). */
export const PLATE = { x: -0.3, z: 0.11, r: 0.024 } as const;
/** The bandmate's seat (back-right corner of the kit). */
export const BIRD = { x: -0.34, z: -0.17 } as const;
/** Height nudge arrows (default placement only), front-right. */
export const NUDGE = { x: 0.3, upZ: 0.08, downZ: 0.13, r: 0.016 } as const;

let shadowGeo: PlaneGeometry | null = null;

export class KitView {
  readonly root = new Group();
  readonly pads = new Map<Lane, PadView>();
  readonly chips = new Chips();
  readonly crowd = new Crowd();
  readonly bird = new Bird();
  readonly fx = new Fx();
  readonly title = new Card(0.16, 0.115);
  readonly cards: Card[] = [];
  readonly hint = new Label(0.26, 0.036);
  readonly debug = new Label(0.52, 0.075);
  readonly ribbon = new Label(0.24, 0.05);
  private stars: Mesh[] = [];
  private starT = -1;
  private starN = 0;
  private titleT = -1;
  private listShown = false;
  private listT = 0;
  readonly plate: Mesh;
  readonly nudges = new Group();
  private handShadow: Mesh[] = [];
  /** The gong's closing ring (its notes, on the wall). */
  private gongRing: Mesh;
  theme: Theme = themeFor(false);
  /** The gong hangs on a real wall (true) or stands at the back of the table. */
  gongOnWall = false;

  constructor() {
    this.root.name = 'Kit';
    // a warm key light from front-left and a cool rim from behind (no shadow maps: contact blobs instead)
    const key = new DirectionalLight(0xfff0dc, 1.5);
    key.position.set(-0.35, 0.5, 0.35);
    key.target.position.set(0, 0, -0.05);
    const rim = new DirectionalLight(0xdfe8ff, 0.45);
    rim.position.set(0.25, 0.3, -0.45);
    this.root.add(key, key.target, rim, rim.target);
    for (const lane of LANES) {
      const p = new PadView(lane);
      p.x = PADS[lane].x;
      p.z = PADS[lane].z;
      this.pads.set(lane, p);
      this.root.add(p.group);
    }
    this.root.add(this.chips.mesh, this.crowd.root, this.fx.root);
    this.bird.root.position.set(BIRD.x, 0, BIRD.z);
    this.bird.root.rotation.y = 0.5; // turned a little toward the kit
    this.root.add(this.bird.root);
    // the title card lies in front of the kit, tilted up to be read
    this.title.mesh.rotation.x = 0.9;
    this.title.mesh.position.set(0, 0.045, 0.14);
    this.title.mesh.visible = false;
    this.root.add(this.title.mesh);
    SONGS.forEach((_, i) => {
      const c = new Card(LIST.w, LIST.d);
      c.mesh.rotation.x = LIST.tilt;
      c.mesh.position.set(LIST.x0 + i * LIST.gap, 0.04, LIST.z);
      c.mesh.visible = false;
      this.cards.push(c);
      this.root.add(c.mesh);
    });
    // paper tags: the hint in front of the kit, the debug tag behind it
    this.hint.mesh.rotation.x = -0.55;
    this.hint.mesh.position.set(0, 0.03, 0.17);
    this.hint.set('');
    this.root.add(this.hint.mesh);
    this.debug.mesh.rotation.x = -0.35;
    this.debug.mesh.position.set(0, 0.11, -0.34);
    this.debug.set('');
    this.root.add(this.debug.mesh);
    this.ribbon.style = 'ribbon';
    this.ribbon.mesh.rotation.x = -0.5;
    this.ribbon.mesh.position.set(0, 0.07, -0.06);
    this.ribbon.set('');
    this.root.add(this.ribbon.mesh);
    const starGeo = new ExtrudeGeometry(starShape(), { depth: 0.2, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.04, bevelSegments: 2 });
    starGeo.center();
    for (let i = 0; i < 3; i++) {
      const m = new Mesh(starGeo, new MeshStandardMaterial({ color: 0xf7c948, roughness: 0.55, metalness: 0.15, emissive: new Color(0x5a3a00) }));
      m.scale.setScalar(0);
      m.visible = false;
      m.position.set((i - 1) * 0.05, 0.12, -0.06);
      m.rotation.x = -0.4;
      this.stars.push(m);
      this.root.add(m);
    }
    this.plate = feltDisc(PLATE.r, FELT.navy);
    this.plate.position.set(PLATE.x, 0.002, PLATE.z);
    this.plate.name = 'MovePlate';
    this.root.add(this.plate);
    for (const [z, up] of [
      [NUDGE.upZ, true],
      [NUDGE.downZ, false],
    ] as const) {
      const d = feltDisc(NUDGE.r, up ? FELT.teal : FELT.tomato);
      d.position.set(NUDGE.x, 0.002, z);
      const arrow = new Label(0.03, 0.03);
      arrow.style = 'tag';
      arrow.mesh.rotation.x = -Math.PI / 2;
      arrow.mesh.position.set(NUDGE.x, 0.004, z);
      arrow.set(up ? '▲' : '▼');
      this.nudges.add(d, arrow.mesh);
    }
    this.nudges.visible = false;
    this.root.add(this.nudges);
    shadowGeo ??= (() => {
      const g = new PlaneGeometry(1, 1);
      g.rotateX(-Math.PI / 2);
      return g;
    })();
    for (let i = 0; i < 2; i++) {
      const m = new Mesh(shadowGeo, new MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0 }));
      m.renderOrder = 2;
      m.visible = false;
      this.handShadow.push(m);
      this.root.add(m);
    }
    this.gongRing = new Mesh(new RingGeometry(0.92, 1, 48), new MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }));
    this.gongRing.rotation.x = -Math.PI / 2;
    this.gongRing.visible = false;
    this.pads.get('gong')!.group.add(this.gongRing);
    this.root.visible = false;
  }

  pad(lane: Lane): PadView | undefined {
    return this.pads.get(lane);
  }

  setTheme(hc: boolean): void {
    this.theme = themeFor(hc);
    for (const p of this.pads.values()) p.setContrast(hc);
    this.hint.setTheme(this.theme);
    this.debug.setTheme(this.theme);
    this.ribbon.setTheme(this.theme);
  }

  /** Put the hand's shadow on the table under the palm (kit-local), darker as it nears. */
  setHandShadow(i: number, x: number, h: number, z: number): void {
    const m = this.handShadow[i];
    if (!Number.isFinite(h) || h > 0.3 || h < -0.05) {
      m.visible = false;
      return;
    }
    m.visible = true;
    const k = 1 - Math.max(0, h) / 0.3;
    m.position.set(x, 0.0009, z);
    m.scale.setScalar(0.075 + Math.max(0, h) * 0.25);
    (m.material as MeshBasicMaterial).opacity = 0.15 + 0.5 * k * k;
  }

  showTitle(song: Song | null): void {
    if (!song) {
      this.titleT = -1;
      this.title.mesh.visible = false;
      return;
    }
    this.title.draw(song, SONGS.indexOf(song), 0, false, this.theme, true);
    this.title.mesh.visible = true;
    this.titleT = 0;
  }

  showStars(n: number | null, gold: boolean, name = ''): void {
    if (n === null) {
      this.starT = -1;
      this.ribbon.set('');
      for (const s of this.stars) s.visible = false;
      return;
    }
    this.starN = n;
    this.starT = 0;
    this.ribbon.set(gold ? `${name}: gold!` : name);
    for (const [i, s] of this.stars.entries()) {
      (s.material as MeshStandardMaterial).color.setHex(i < n ? (gold ? 0xffd34d : 0xf7c948) : 0x9a8f86);
      s.visible = true;
      s.scale.setScalar(0);
    }
  }

  /** The song cards, with your stars on them. */
  showList(show: boolean, p: Progress): void {
    this.listShown = show;
    this.listT = 0;
    this.cards.forEach((c, i) => {
      const s = SONGS[i];
      c.draw(s, i, p.stars[s.id] ?? 0, !!p.gold[s.id], this.theme);
      c.mesh.visible = show;
      c.mesh.scale.setScalar(show ? 0.01 : 1);
    });
  }

  get listVisible(): boolean {
    return this.listShown;
  }

  /** Lay out the travelling notes and the gong's closing ring. */
  syncChips(chips: readonly ChipView[], count: number, hc: boolean): void {
    let ring = Infinity;
    for (let i = 0; i < count; i++) {
      const c = chips[i];
      if (c.lane === 'gong' && !c.theirs && c.grade === null && c.ahead > -0.2 && c.ahead < ring) ring = c.ahead;
    }
    this.chips.update(chips, count, this.spotFn, hc);
    const gr = this.gongRing;
    if (ring < 2.1) {
      gr.visible = true;
      const k = Math.max(0, ring) / 2;
      const r = PADS.gong.size / 2;
      gr.scale.setScalar(r * (1.05 + k * 1.6));
      gr.position.y = 0.012;
      (gr.material as MeshBasicMaterial).opacity = 0.9 * (1 - k * 0.6);
    } else gr.visible = false;
  }

  /** Kit-local spot of a table pad (null for the wall gong). */
  private spotFn = (lane: Lane): { x: number; z: number } | null => {
    if (lane === 'gong' && this.gongOnWall) return null;
    const p = this.pads.get(lane);
    return p && p.visible ? { x: p.x, z: p.z } : null;
  };

  update(dt: number, beat: number, time: number): void {
    for (const p of this.pads.values()) p.update(dt);
    this.crowd.update(dt, beat, time);
    this.bird.update(dt, beat);
    this.fx.update(dt);
    if (this.titleT >= 0) {
      this.titleT += dt;
      const k = Math.min(1, this.titleT / 0.35);
      this.title.mesh.scale.setScalar(0.3 + 0.7 * (1 - Math.pow(1 - k, 3)));
    }
    if (this.starT >= 0) {
      this.starT += dt;
      // the stars pop in one by one
      this.stars.forEach((s, i) => {
        const k = Math.min(1, Math.max(0, (this.starT - 0.25 - i * 0.28) / 0.25));
        const b = k - 1;
        const e = k <= 0 ? 0 : 1 + 2.4 * b * b * b + 1.4 * b * b;
        s.scale.setScalar(0.045 * e * (i < this.starN ? 1 : 0.8));
        s.rotation.y = Math.sin(time * 1.5 + i) * 0.25 * (motion.calm ? 0.3 : 1);
      });
    }
    if (this.listShown && this.listT < 1) {
      this.listT = Math.min(1, this.listT + dt / 0.6);
      this.cards.forEach((c, i) => {
        const k = Math.min(1, Math.max(0, (this.listT * 1.6 - i * 0.1) / 0.6));
        c.mesh.scale.setScalar(Math.max(0.01, 1 - Math.pow(1 - k, 3)));
      });
    }
  }

  /** Where a card sits (kit-local), for pokes. */
  cardCentre(i: number, out: Vector3): Vector3 {
    return out.copy(this.cards[i].mesh.position);
  }

  /** Crowd's centre, for effects. */
  crowdCentre(out: Vector3): Vector3 {
    return out.set(0, 0.03, CROWD.z);
  }
}
