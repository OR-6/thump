/**
 * The panel: the game's screen, floating just above the back of the desk and leaning back toward you, the way a VR
 * game's menu does, laid out like a music game's. It draws whatever page it's given (src/ui/menu.ts): a title, a
 * line, and things to press (menu tiles, instrument cards, song rows, choices, buttons), plus a song's progress and
 * count or the results' stars. You poke an item with a fingertip, or pinch it: it lights and clicks. One canvas;
 * presses and pulses are light quads on top, so nothing redraws every frame. Kit-local, centred behind the instrument.
 */
import { AdditiveBlending, BoxGeometry, CylinderGeometry, CanvasTexture, Group, LinearFilter, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, RingGeometry, SRGBColorSpace, Vector3 } from '@iwsdk/core';
import { asLight } from '../art/light.js';
import { contactShadow } from '../art/lighting.js';
import { thumb, whenThumbs } from '../art/thumbs.js';
import { FONT, whenFonts } from './fonts.js';
import { star, type Display } from './module.js';
import type { Item, Page } from './menu.js';
import { ICON } from '../stand/stand.js';
import { Minis } from './minis.js';
import { motion } from './motion.js';

/** The panel in kit-local space: centre, size (m), and how far it leans back (radians). */
/**
 * The display: standing on the desk behind the instruments on two thin uprights, its bottom edge clear of the
 * keyboard's case (9 cm), tilted back 25°.
 */
export const PANEL = { y: 0.28, z: -0.25, w: 0.33, h: 0.22, lean: 0.44 } as const;
/** Canvas pixels (4.12 per millimetre). */
const CW = 1360;
const CH = 907;
/** No text under this (11.6 mm on the panel: 22 to 24 mm at 1 m from the seat, 50 to 55 cm away). */
const MIN_PX = 48;
const MAX_ITEMS = 16;

const INK = '#f2efe6';
const SOFT = '#b9b9bd';
/** The panel's one accent. */
const ACCENT = '#5ac8ff';
const DIMI = '#6a6862';
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** An item's centre and size in the panel's zone frame (x right, z up the panel, metres). */
export function itemZone(it: { x: number; y: number; w: number; h: number }): { x: number; z: number; w: number; h: number } {
  return { x: ((it.x + it.w / 2) / CW - 0.5) * PANEL.w, z: (0.5 - (it.y + it.h / 2) / CH) * PANEL.h, w: (it.w / CW) * PANEL.w, h: (it.h / CH) * PANEL.h };
}

function rounded(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** The bottom row's top (canvas px): the glass stage behind a page's body ends above it. */
const BOT_Y = 680;
const lighten = (c: number, k: number) => {
  const ch = (v: number) => Math.round(v + (255 - v) * k);
  return (ch((c >> 16) & 255) << 16) | (ch((c >> 8) & 255) << 8) | ch(c & 255);
};
/** The main menu's own pictures: thin white line drawings. */
const MENU_ICON: Record<string, (g: CanvasRenderingContext2D, S: number, c: string) => void> = {
  'menu:songs': (g, S, c) => {
    // two quavers on a beam
    g.strokeStyle = c;
    g.lineWidth = S * 0.05;
    g.lineCap = 'round';
    for (const [x, y] of [[0.3, 0.74], [0.72, 0.64]]) {
      g.beginPath();
      g.ellipse(S * x, S * y, S * 0.1, S * 0.075, -0.4, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.moveTo(S * (x + 0.095), S * (y - 0.02));
      g.lineTo(S * (x + 0.095), S * (y - 0.5));
      g.stroke();
    }
    g.beginPath();
    g.moveTo(S * 0.395, S * 0.24);
    g.lineTo(S * 0.815, S * 0.14);
    g.stroke();
  },
  'menu:build': (g, S, c) => {
    // a track's parts, stacked
    g.strokeStyle = c;
    g.lineWidth = S * 0.05;
    [0.72, 0.5, 0.28].forEach((y, k) => {
      rounded(g, S * (0.14 + k * 0.06), S * y, S * (0.72 - k * 0.12), S * 0.13, S * 0.04);
      g.stroke();
    });
  },
  'menu:band': (g, S, c) => {
    // two people side by side
    g.strokeStyle = c;
    g.lineWidth = S * 0.05;
    for (const x of [0.34, 0.66]) {
      g.beginPath();
      g.arc(S * x, S * 0.34, S * 0.11, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(S * x, S * 0.86, S * 0.2, Math.PI * 1.08, Math.PI * 1.92);
      g.stroke();
    }
  },
};

function fit(g: CanvasRenderingContext2D, text: string, weight: string, px: number, min: number, room: number): number {
  min = Math.max(MIN_PX, min, Math.min(px, MIN_PX));
  g.font = `${weight} ${px}px ${FONT}`;
  while (g.measureText(text).width > room && px > min) g.font = `${weight} ${--px}px ${FONT}`;
  return px;
}

export class Panel {
  readonly root = new Group();
  /** The pressable face's frame: +Y out of the panel toward you, +X right, −Z up the panel (for the hit surface). */
  readonly frame = new Object3D();
  private canvas = document.createElement('canvas');
  private tex: CanvasTexture;
  private glows: Mesh[] = [];
  private cards: Mesh[] = [];
  private cardS: number[] = [];
  private cardLive: boolean[] = [];
  private press = new Float32Array(MAX_ITEMS);
  private pulseT = 0;
  /** What's on it now, and a number that changes whenever its items do (the hit zones follow). */
  page: Page | null = null;
  version = 0;
  shown: Display = { line: '', sub: '', found: [], total: 0, meter: -1, stars: -1, pulse: null, count: 0, day: 0, gold: false, code: '', keyLabels: null, locked: [] };
  private sig = '';
  private lastCount = -1;
  private lastStars = -9;
  /** Each item's zone on the panel (worked out when the items move, not every frame). */
  private zones: ReturnType<typeof itemZone>[] = [];
  private itemsSig = '';
  private barW = 0.3;
  private faceMat: MeshBasicMaterial;
  private face: Mesh;
  /** A new page slides in (0 → 1), the panel grows in when it first shows (0 → 1). */
  private turn = 1;
  private grow = 0;
  private pageId = '';
  /** The item a fingertip is close to, and how close (0 far … 1 touching). */
  private hoverI = -1;
  private hoverK = 0;

  constructor() {
    this.root.name = 'Panel';
    this.canvas.width = CW;
    this.canvas.height = CH;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.tex.anisotropy = 4;
    const slab = new Mesh(new BoxGeometry(PANEL.w + 0.008, PANEL.h + 0.008, 0.006), new MeshStandardMaterial({ name: 'Slab', color: 0x111113, roughness: 0.5, metalness: 0.2 }));
    slab.name = 'Slab';
    slab.position.z = -0.0035;
    this.faceMat = new MeshBasicMaterial({ map: this.tex, toneMapped: false, transparent: true, depthWrite: false });
    const face = new Mesh(new PlaneGeometry(PANEL.w, PANEL.h), this.faceMat);
    face.name = 'Face';
    this.face = face;
    this.root.add(slab, face);
    const quad = new PlaneGeometry(1, 1);
    for (let i = 0; i < MAX_ITEMS; i++) {
      const m = new Mesh(quad, new MeshBasicMaterial({ color: 0xfff2dc, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
      m.renderOrder = 8;
      m.visible = false;
      this.glows.push(m);
      this.root.add(m);
    }
    // each control is also its own quad, cut from the same canvas: it grows on hover and dips on a press
    for (let i = 0; i < MAX_ITEMS; i++) {
      const q = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: this.tex, transparent: true, toneMapped: false, depthWrite: false }));
      q.renderOrder = 7;
      q.visible = false;
      this.cards.push(q);
      this.cardS.push(1);
      this.root.add(q);
    }
    this.frame.rotation.x = Math.PI / 2;
    this.root.add(this.frame);
    this.cursor = new Mesh(new RingGeometry(0.8, 1, 32), asLight(new MeshBasicMaterial({ color: 0xfff2dc, toneMapped: false })));
    this.cursor.renderOrder = 9;
    this.cursor.visible = false;
    this.root.add(this.cursor);
    // the progress bar: a strip anchored at its left end, scaled in x (no canvas redraw as the song goes on)
    const barGeo = new PlaneGeometry(1, 1);
    barGeo.translate(0.5, 0, 0);
    this.bar = new Mesh(barGeo, new MeshBasicMaterial({ color: 0xf2efe6, toneMapped: false, transparent: true }));
    this.bar.renderOrder = 7;
    this.bar.visible = false;
    const bz = itemZone({ x: 40, y: 470, w: CW - 80, h: 22 });
    this.bar.position.set(bz.x - bz.w / 2, bz.z, 0.0008);
    this.bar.scale.set(0.0001, bz.h, 1);
    this.barW = bz.w;
    this.comboCanvas.width = 512;
    this.comboCanvas.height = 256;
    this.comboTex = new CanvasTexture(this.comboCanvas);
    this.comboTex.colorSpace = SRGBColorSpace;
    const cz = itemZone({ x: 40, y: 200, w: 480, h: 240 });
    this.comboMesh = new Mesh(new PlaneGeometry(cz.w, cz.h), new MeshBasicMaterial({ map: this.comboTex, transparent: true, toneMapped: false }));
    this.comboMesh.position.set(cz.x, cz.z, 0.0008);
    this.comboMesh.renderOrder = 7;
    this.comboMesh.visible = false;
    // (both change often: no mipmaps to rebuild on each upload)
    this.comboTex.generateMipmaps = false;
    this.comboTex.minFilter = LinearFilter;
    // the count-in's number, on its own: the page isn't redrawn on each beat just before the first note
    this.countCanvas.width = 256;
    this.countCanvas.height = 256;
    this.countTex = new CanvasTexture(this.countCanvas);
    this.countTex.colorSpace = SRGBColorSpace;
    this.countTex.generateMipmaps = false;
    this.countTex.minFilter = LinearFilter;
    const nz = itemZone({ x: CW / 2 - 160, y: 190, w: 320, h: 320 });
    this.countMesh = new Mesh(new PlaneGeometry(nz.w, nz.h), new MeshBasicMaterial({ map: this.countTex, transparent: true, toneMapped: false }));
    this.countMesh.position.set(nz.x, nz.z, 0.0008);
    this.countMesh.renderOrder = 7;
    this.countMesh.visible = false;
    this.root.add(this.bar, this.comboMesh, this.countMesh, this.minis.root);
    // the results' stars, each its own quad over the drawn one: it lands (1.4 → 1 with a little overshoot, 180 ms)
    for (let i = 0; i < 3; i++) {
      const c = document.createElement('canvas');
      c.width = c.height = 160;
      const t = new CanvasTexture(c);
      t.colorSpace = SRGBColorSpace;
      const q = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: t, transparent: true, toneMapped: false, depthWrite: false }));
      const z = itemZone({ x: CW / 2 - 170 + i * 170 - 80, y: 300 - 80, w: 160, h: 160 });
      q.position.set(z.x, z.z, 0.0016);
      q.userData.size = z.w;
      q.renderOrder = 9;
      q.visible = false;
      this.starQuads.push(q);
      this.starTex.push(t);
      this.root.add(q);
    }
    this.root.position.set(0, PANEL.y, PANEL.z);
    this.root.rotation.x = -PANEL.lean;
    this.fitStand();
    const redraw = () => {
      this.sig = '';
      this.page = null;
      this.set(this.shown);
    };
    whenFonts(redraw);
    whenThumbs(redraw);
  }

  /**
   * Pulled in for a tray (no table found: probably a seat with one in front of it): its top row a few centimetres
   * nearer and higher, more upright, so it's short of the seatback ahead.
   */
  compact(on: boolean): void {
    this.tray = on;
    this.place();
  }
  private tray = false;
  /** How tall the instrument in front of it is: the display stands with its bottom edge 4 cm clear of it (a hand on
   * the back of the instrument stays under it). */
  private clear = 0.19;
  standOver(top: number): void {
    this.clear = top;
    this.place();
  }
  /** Where you sit: how far ahead of your head the instrument's centre is, and how high your eyes are over the desk. */
  private baseY: number = PANEL.y;
  private ahead = 0.34;
  private eye = 0.42;
  seat(ahead: number, eye: number): void {
    this.ahead = ahead;
    this.eye = Math.max(0.2, eye);
    this.place();
  }
  private place(): void {
    const lean = this.tray ? 0.36 : PANEL.lean;
    // (up toward your eyes rather than down over the instrument: a hand slapping its back passes under the panel)
    const y = Math.max(this.tray ? 0.17 : 0.3, this.clear + 0.04 + (PANEL.h / 2) * Math.cos(lean));
    // within 55 cm of your eyes (no further back than that, however far ahead the instrument went), never under 35
    const dy = this.eye - y;
    const flat = Math.sqrt(Math.max(0.01, 0.55 * 0.55 - dy * dy));
    const nearest = Math.sqrt(Math.max(0.01, 0.35 * 0.35 - dy * dy));
    const z = Math.min(this.ahead - nearest, Math.max(this.tray ? -0.22 : PANEL.z, this.ahead - flat));
    // (higher rather than nearer at a tray: its bottom edge stays clear of hands at the back of the instrument)
    this.baseY = y;
    this.root.position.set(0, y, z);
    this.root.rotation.x = -lean;
    this.fitStand();
  }

  /**
   * The display stands on the desk (it is a thing on the desk, not a slab in the air): a foot, two slim uprights up
   * to its bottom edge, a kickstand behind. In the panel's parent's frame (kit-local), refitted when the pose changes.
   */
  readonly stand = new Group();
  private standParts: Mesh[] = [];
  private fitStand(): void {
    // one slim post from a small round foot up to the back of the panel's centre (nothing standing inside the
    // instrument in front of it)
    const lean = -this.root.rotation.x;
    const P = this.root.position;
    if (!this.standParts.length) {
      const metal = new MeshStandardMaterial({ name: 'Anodised', color: 0x2a2b30, metalness: 0.85, roughness: 0.32 });
      this.standParts.push(new Mesh(new CylinderGeometry(0.004, 0.004, 1, 12), metal), new Mesh(new CylinderGeometry(0.035, 0.038, 0.006, 32), metal));
      this.stand.name = 'PanelStand';
      this.stand.add(...this.standParts, contactShadow(0.09, 0.09, 0.7));
    }
    const [post, foot] = this.standParts;
    // (the post meets the panel's back a little below its middle, 6 mm behind the face)
    const ty = P.y - 0.02 * Math.cos(lean) - 0.006 * Math.sin(lean);
    const tz = P.z + 0.02 * Math.sin(lean) - 0.006 * Math.cos(lean) - 0.004;
    post.scale.set(1, ty, 1);
    post.position.set(0, ty / 2, tz);
    foot.position.set(0, 0.003, tz);
    (this.stand.children[2] as Mesh).position.set(0, 0.0006, tz);
  }

  /** The item a press landed on (by its index in the page). */
  itemAt(i: number): Item | null {
    return this.page?.items[i] ?? null;
  }

  pressKey(i: number): void {
    if (i >= 0 && i < MAX_ITEMS) this.press[i] = 1;
  }

  /** A fingertip near item `i` (−1: none), `k` 0 (5 cm off) … 1 (touching), over panel point (x right, z up, m). */
  hover(i: number, k: number, x = 0, z = 0): void {
    this.hoverI = i;
    this.hoverK = k;
    this.cursorAt.x = x;
    this.cursorAt.z = z;
  }
  private cursorAt = { x: 0, z: 0 };
  /** A ring where your fingertip will land, shrinking as it nears (and lit on contact). */
  private cursor: Mesh;
  private hoverShown = 0;
  /** The song so far (a bar that grows) and the run of notes in a row (its own little canvas). */
  private bar: Mesh;
  private comboCanvas = document.createElement('canvas');
  /** The Instruments screen's 3D miniatures (they stand in for the cards' pictures). */
  readonly minis = new Minis();
  private noPics = false;
  /** The picked instrument's miniature flies from its card to the middle of the desk. */
  flyMini(id: string): void {
    this.root.updateMatrix();
    const to = new Vector3(0, 0.03, 0.02).applyMatrix4(this.root.matrix.clone().invert());
    this.minis.fly(id, to);
  }
  private starQuads: Mesh[] = [];
  private starTex: CanvasTexture[] = [];
  private starAge = [9, 9, 9];
  /** Star `i` of the results just landed (its note is playing): it drops into place. */
  starLand(i: number, gold = false): void {
    const t = this.starTex[i];
    if (!t) return;
    const c = t.image as HTMLCanvasElement;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, 160, 160);
    star(g, 80, 80, 64, true, gold);
    t.needsUpdate = true;
    this.starAge[i] = 0;
  }
  private countCanvas = document.createElement('canvas');
  private countTex: CanvasTexture;
  private countMesh: Mesh;
  private lastDigit = 0;
  private comboTex: CanvasTexture;
  private comboMesh: Mesh;
  private lastCombo = -1;

  set(d: Display): void {
    this.shown = d;
    const p = d.page;
    if (!p) return;
    // the song's progress and the run of notes are drawn apart (they change on every hit)
    const song = p.body === 'song' && d.count <= 0;
    this.bar.visible = song && d.progress !== undefined && d.progress >= 0;
    if (this.bar.visible) this.bar.scale.x = Math.max(0.0001, this.barW * Math.min(1, d.progress ?? 0));
    const digit = p.body === 'song' && d.count > 0 ? d.count : 0;
    this.countMesh.visible = digit > 0;
    if (digit !== this.lastDigit) {
      this.lastDigit = digit;
      if (digit > 0) this.drawCount(digit);
    }
    const combo = song ? (d.combo ?? 0) : 0;
    this.comboMesh.visible = combo >= 4;
    if (combo !== this.lastCombo) {
      this.lastCombo = combo;
      if (combo >= 4) this.drawCombo(combo);
    }
    // (the page object is rebuilt only when the display changes: the same one, the same count and stars, is no change)
    // (the count-in's number is its own: the page only cares whether there is one)
    if (p === this.page && d.count > 0 === this.lastCount > 0 && d.stars === this.lastStars) return;
    this.lastCount = d.count;
    this.lastStars = d.stars;
    const sig = [p.id, p.title, p.line, d.count > 0, d.stars, d.gold, d.code, d.best?.run, d.best?.better, d.map?.beats ?? 0, p.items.map((i) => `${i.id}|${i.label}|${i.sub}|${i.on}|${i.off}|${i.stars}`).join(',')].join('~');
    if (sig === this.sig) return;
    this.sig = sig;
    if (p.id !== this.pageId) {
      this.pageId = p.id;
      this.turn = 0;
      // (a flash left from the last page doesn't land on whatever sits there now)
      this.press.fill(0);
    }
    this.page = p;
    const isig = p.items.map((i) => `${i.id}@${i.x},${i.y},${i.w},${i.h}${i.off ? '-' : ''}`).join(';');
    if (isig !== this.itemsSig) {
      this.itemsSig = isig;
      this.version++;
      this.zones = p.items.map((it) => itemZone(it));
      this.glows.forEach((m, i) => {
        const it = p.items[i];
        m.visible = !!it;
        if (!it) return;
        const z = this.zones[i];
        m.position.set(z.x, z.z, 0.0012);
        m.scale.set(z.w * 0.97, z.h * 0.94, 1);
      });
      // the controls' own quads: each one's corner of the canvas (labels and off items stay flat)
      this.cards.forEach((q, i) => {
        const it = p.items[i];
        const live = !!it && !it.off && !it.id.startsWith('label:');
        this.cardLive[i] = live;
        q.visible = false;
        this.cardS[i] = 1;
        if (!live) return;
        const z = this.zones[i];
        const uv = q.geometry.getAttribute('uv');
        const u0 = it.x / CW;
        const u1 = (it.x + it.w) / CW;
        const v1 = 1 - it.y / CH;
        const v0 = 1 - (it.y + it.h) / CH;
        uv.setXY(0, u0, v1);
        uv.setXY(1, u1, v1);
        uv.setXY(2, u0, v0);
        uv.setXY(3, u1, v0);
        uv.needsUpdate = true;
        q.position.set(z.x, z.z, 0.0006);
        q.scale.set(z.w, z.h, 1);
      });
    }
    this.draw(d, p);
  }

  update(dt: number): void {
    this.pulseT += dt;
    // the hover eases in and out (60 ms); the cursor ring sits where the fingertip would land
    this.hoverShown += ((this.hoverI >= 0 ? this.hoverK : 0) - this.hoverShown) * Math.min(1, dt / 0.06);
    this.cursor.visible = this.hoverI >= 0 && this.hoverK > 0.02;
    if (this.cursor.visible) {
      // (never smaller than a fingertip: it would hide under your own finger)
      const r = 0.012 + 0.006 * (1 - this.hoverK);
      this.cursor.position.set(this.cursorAt.x, this.cursorAt.z, 0.0015);
      this.cursor.scale.setScalar(r);
      const mm = this.cursor.material as MeshBasicMaterial;
      mm.opacity = 0.3 + 0.6 * this.hoverK;
      mm.color.setHex(this.hoverK > 0.9 ? 0xffffff : 0xfff2dc);
    }
    // the panel slides up into place when it first shows (250 ms, eased out); a new page slides up and fades in
    if (this.root.visible && this.grow < 1) this.grow = Math.min(1, this.grow + dt / 0.25);
    const e = 1 - Math.pow(1 - this.grow, 3);
    this.root.position.y = this.baseY - 0.05 * (1 - e);
    {
      const hi = this.hoverI >= 0 && this.hoverK > 0.05 ? (this.page?.items[this.hoverI]?.id ?? '') : '';
      this.minis.update(dt, hi.startsWith('inst:') ? hi.slice(5) : '', motion.calm);
    }
    for (let i = 0; i < this.starQuads.length; i++) {
      const q = this.starQuads[i];
      q.visible = this.starAge[i] < 0.6 && this.page?.id === 'results';
      if (!q.visible) continue;
      this.starAge[i] += dt;
      // (back-out: past 1 a little, then settled; it fades as the drawn star under it takes over)
      const u = Math.min(1, this.starAge[i] / 0.18);
      const s = 1 + 0.4 * (1 - u) - 0.08 * Math.sin(Math.PI * u) * (1 - u * 0.3);
      q.scale.setScalar((q.userData.size as number) * s);
      (q.material as MeshBasicMaterial).opacity = Math.min(1, this.starAge[i] / 0.06) * (this.starAge[i] > 0.4 ? Math.max(0, 1 - (this.starAge[i] - 0.4) / 0.2) : 1);
    }
    if (this.turn < 1) this.turn = Math.min(1, this.turn + dt / 0.18);
    const te = 1 - Math.pow(1 - this.turn, 3);
    this.faceMat.opacity = (0.25 + 0.75 * te) * e;
    this.face.position.y = -0.008 * (1 - te);
    const items = this.page?.items ?? [];
    for (let i = 0; i < MAX_ITEMS; i++) {
      // a press flashes and the light pops out a little, then settles
      this.press[i] = Math.max(0, this.press[i] - dt * 4);
      const want = items[i] && items[i].id === this.shown.focus;
      const p = want ? 0.5 + 0.5 * Math.sin(this.pulseT * 5) : 0;
      const h = i === this.hoverI ? this.hoverShown : 0;
      const m = this.glows[i];
      // (the white primary button carries no glow: light added over it would grey its black type)
      const solid = items[i]?.kind === 'play' && !items[i]?.off;
      const op = (solid ? this.press[i] * 0.2 : Math.max(this.press[i] * 0.55, p * 0.12, h * 0.28)) * te;
      (m.material as MeshBasicMaterial).opacity = op;
      // (an unlit glow isn't drawn at all)
      m.visible = !!items[i] && op > 0.002;
      const z = items[i] ? this.zones[i] : null;
      // the control itself: 1.04 under a hovering finger (120 ms, eased out), 0.97 the moment it's pressed (60 ms),
      // back over 150 ms
      const q = this.cards[i];
      // (not while a new page slides in: the face moves then, and the quads would sit apart from it)
      q.visible = !!this.cardLive[i] && this.turn >= 1 && te > 0.99;
      // (and they fade in with the face)
      (q.material as MeshBasicMaterial).opacity = this.faceMat.opacity;
      if (z && q.visible) {
        const target = this.press[i] > 0.7 ? 0.97 : i === this.hoverI && this.hoverK > 0.05 ? 1.04 : 1;
        const tau = target < this.cardS[i] ? 0.02 : target > 1 ? 0.04 : 0.05;
        this.cardS[i] += (target - this.cardS[i]) * Math.min(1, dt / tau);
        const s = this.cardS[i];
        q.scale.set(z.w * s, z.h * s, 1);
        // (just in front of the page, which draws the same card under it)
        q.position.z = 0.0012 + (s - 1) * 0.01;
        m.scale.set(z.w * 0.97 * s, z.h * 0.94 * s, 1);
      }
    }
  }

  /** The page's accent: the colour of the instrument that's out. */
  private accent = 0x5ac8ff;
  private draw(d: Display, p: Page): void {
    const g = this.canvas.getContext('2d')!;
    g.clearRect(0, 0, CW, CH);
    // one quiet surface: translucent near-black, a hairline edge, a hairline under the header; nothing else
    this.accent = p.accent ?? 0xffffff;
    rounded(g, 4, 4, CW - 8, CH - 8, 40);
    g.fillStyle = 'rgba(18,18,20,0.88)';
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(40, 160, CW - 80, 2);
    g.textBaseline = 'alphabetic';
    // the header: the title, and the line under it
    const hasBack = p.items.some((i) => i.id === 'back' && i.y < 120);
    const tx = hasBack ? 220 : 40;
    const right = p.items.some((i) => i.y < 120 && i.x > CW / 2) ? CW - 280 : CW - 40;
    g.fillStyle = INK;
    fit(g, p.title, '600', p.id === 'main' ? 72 : 64, 48, right - tx);
    g.fillText(p.title, tx, 84);
    if (p.line) {
      g.fillStyle = '#8e8e94';
      fit(g, p.line, '400', 48, 48, right - tx);
      g.fillText(p.line, tx, 140);
    }
    if (d.code && p.id !== 'band') {
      g.fillStyle = INK;
      g.font = `600 48px ${FONT}`;
      const t = `Band ${d.code}`;
      g.fillText(t, CW - 40 - g.measureText(t).width, 140);
    }
    if (p.body === 'song') this.drawSong(g, d);
    if (p.body === 'results') this.drawResults(g, d);
    if (p.body === 'how' && p.how) {
      // how to play what's on the desk, large, in the middle (two lines if it needs them)
      g.fillStyle = INK;
      const words = p.how.split(' ');
      fit(g, p.how, '600', 64, 40, CW - 80);
      if (g.measureText(p.how).width > CW - 80) {
        const half = Math.ceil(words.length / 2);
        const a = words.slice(0, half).join(' ');
        const b = words.slice(half).join(' ');
        fit(g, a.length > b.length ? a : b, '600', 64, 40, CW - 80);
        g.fillText(a, 40, 300);
        g.fillText(b, 40, 380);
      } else g.fillText(p.how, 40, 340);
    }
    this.noPics = p.id === 'instruments';
    p.items.forEach((it) => this.drawItem(g, it));
    this.tex.needsUpdate = true;
    if (p.id === 'instruments') {
      const cards = p.items
        .filter((it) => it.kind === 'card' && it.id.startsWith('inst:'))
        .map((it) => {
          const S = it.h * 0.78;
          return { id: it.id.slice(5), x: ((it.x + 18 + S / 2) / CW - 0.5) * PANEL.w, y: (0.5 - (it.y + it.h / 2) / CH) * PANEL.h };
        });
      this.minis.layout(cards, -this.root.rotation.x);
    } else this.minis.hide();
  }

  private drawSong(g: CanvasRenderingContext2D, d: Display): void {
    const X = 40;
    const R = CW - 40;
    // (the count-in's number is drawn on its own canvas)
    if (d.count > 0) return;
    if (d.stars >= 0) for (let i = 0; i < 3; i++) star(g, R - 210 + i * 76, 230, 30, i < d.stars, d.gold);
    // (the progress bar's track; its fill and the run of notes are drawn apart)
    g.fillStyle = '#2a2927';
    rounded(g, X, 470, R - X, 22, 11);
    g.fill();
    // the song's map on it: the second half a shade lighter, each solo a red stretch marked above
    const m = d.map;
    if (m && m.beats > 0) {
      const at = (b: number) => X + ((R - X) * b) / m.beats;
      g.fillStyle = '#34322e';
      g.fillRect(at(m.second[0]), 474, at(m.second[1]) - at(m.second[0]), 14);
      g.font = `600 48px ${FONT}`;
      for (const [a, z] of m.wild) {
        g.fillStyle = '#7a2a1e';
        g.fillRect(at(a), 474, at(z) - at(a), 14);
        g.fillStyle = INK;
        const t = 'Solo';
        g.fillText(t, (at(a) + at(z) - g.measureText(t).width) / 2, 458);
      }
    }
    if (d.meter >= 0) {
      g.fillStyle = '#2a2927';
      g.fillRect(X, 520, R - X, 10);
      g.fillStyle = INK;
      g.fillRect(X, 520, (R - X) * d.meter, 10);
    }
  }

  private drawCount(n: number): void {
    const g = this.countCanvas.getContext('2d')!;
    g.clearRect(0, 0, 256, 256);
    g.fillStyle = INK;
    g.font = `700 240px ${FONT}`;
    const t = String(n);
    g.textBaseline = 'alphabetic';
    g.fillText(t, (256 - g.measureText(t).width) / 2, 214);
    this.countTex.needsUpdate = true;
  }

  private drawCombo(n: number): void {
    const g = this.comboCanvas.getContext('2d')!;
    g.clearRect(0, 0, 512, 256);
    g.fillStyle = ACCENT;
    g.font = `700 150px ${FONT}`;
    g.fillText(String(n), 8, 150);
    g.fillStyle = SOFT;
    g.font = `500 48px ${FONT}`;
    g.fillText('in a row', 14, 220);
    this.comboTex.needsUpdate = true;
  }

  private drawResults(g: CanvasRenderingContext2D, d: Display): void {
    // (stars hidden while your replay plays)
    if (d.stars < 0) return;
    for (let i = 0; i < 3; i++) star(g, CW / 2 - 170 + i * 170, 300, 64, i < Math.max(0, d.stars), d.gold);
    const b = d.best;
    if (!b) return;
    // how they split, and your longest run; a chip when you beat your best
    g.font = `600 48px ${FONT}`;
    const parts = [`Perfect ${b.perfect}`, `Good ${b.good}`, b.run >= 4 ? `Best run ${b.run}` : ''].filter(Boolean).join('  ·  ');
    const w = g.measureText(parts).width;
    const chip = b.better ? 250 : 0;
    const x = (CW - w - chip) / 2;
    g.fillStyle = SOFT;
    g.fillText(parts, x, 452);
    if (b.better) {
      rounded(g, x + w + 30, 400, 220, 72, 36);
      g.fillStyle = ACCENT;
      g.fill();
      g.fillStyle = '#16140f';
      g.font = `700 48px ${FONT}`;
      g.fillText('New best', x + w + 30 + (200 - g.measureText('New best').width) / 2, 455);
    }
  }

  /**
   * A song on the setlist: its name in the grotesque, white, the line under it in grey, stars; the one picked has the
   * accent bar down its left and a lighter tile; a locked one is dim.
   */
  private drawRow(g: CanvasRenderingContext2D, it: Item): void {
    // a song: its name, who wrote it in grey beneath, its stars as three small dots; chosen, a white ring
    rounded(g, it.x, it.y, it.w, it.h, 22);
    g.fillStyle = it.off ? 'rgba(255,255,255,0.025)' : it.on ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.055)';
    g.fill();
    if (it.on) {
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.stroke();
    }
    g.fillStyle = it.off ? DIMI : INK;
    fit(g, it.label, '600', 54, 48, it.w - 60);
    g.fillText(it.label, it.x + 30, it.y + 82);
    if (it.sub) {
      g.fillStyle = it.off ? DIMI : '#8e8e94';
      fit(g, it.sub, '400', 48, 48, it.w - 60);
      g.fillText(it.sub, it.x + 30, it.y + 144);
    }
    if (it.stars !== undefined && !it.off)
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.arc(it.x + 40 + i * 30, it.y + it.h - 30, 8, 0, Math.PI * 2);
        if (i < it.stars) {
          g.fillStyle = '#f4f4f2';
          g.fill();
        } else {
          g.lineWidth = 2.5;
          g.strokeStyle = 'rgba(255,255,255,0.35)';
          g.stroke();
        }
      }
  }

  private drawItem(g: CanvasRenderingContext2D, it: Item): void {
    if (it.kind === 'row') return this.drawRow(g, it);
    // (one accent: the picked and the go buttons in it; everything else white on near-black)
    const r = 22;
    rounded(g, it.x, it.y, it.w, it.h, r);
    if (it.kind === 'play' && !it.off) {
      // the one thing to press next: solid white, black type
      g.fillStyle = '#f4f4f2';
      g.fill();
    } else {
      g.fillStyle = it.off ? 'rgba(255,255,255,0.025)' : it.on ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.055)';
      g.fill();
      if (it.on) {
        g.lineWidth = 3;
        g.strokeStyle = 'rgba(255,255,255,0.85)';
        g.stroke();
      }
    }
    const ink = it.off ? DIMI : INK;
    g.fillStyle = ink;
    if (it.kind === 'card' || it.icon) {
      // an instrument, pictured, with its name under it (or beside it, on a wide card)
      const wide = it.kind === 'card' && it.w >= it.h * 1.4;
      const S = wide ? it.h * 0.78 : Math.min(it.h * (it.kind === 'card' ? 0.62 : 0.55), it.w * 0.7);
      g.save();
      g.translate(it.x + (wide ? 18 : it.kind === 'card' ? (it.w - S) / 2 : it.w - S - 24), it.y + (wide ? (it.h - S) / 2 : it.kind === 'card' ? 10 : (it.h - S) / 2));
      g.strokeStyle = it.on ? INK : SOFT;
      g.fillStyle = it.on ? INK : SOFT;
      g.lineWidth = 5;
      g.lineCap = 'round';
      // the instrument itself, pictured (its line drawing until the pictures are made)
      // (on the Instruments screen the miniatures stand there instead)
      const pic = it.icon && !(this.noPics && it.kind === 'card') ? thumb(it.icon) : undefined;
      if (it.icon && MENU_ICON[it.icon]) MENU_ICON[it.icon](g, S, 'rgba(255,255,255,0.78)');
      else if (pic) g.drawImage(pic, -S * 0.08, -S * 0.08, S * 1.16, S * 1.16);
      else if (it.icon && !(this.noPics && it.kind === 'card')) ICON[it.icon]?.(g, S);
      g.restore();
      g.fillStyle = ink;
      if (wide) {
        fit(g, it.label, '600', 56, 48, it.w - S - 50);
        g.fillText(it.label, it.x + S + 34, it.y + it.h / 2 + 18);
        return;
      }
      if (it.kind === 'card') {
        fit(g, it.label, '600', 52, 48, it.w - 16);
        g.fillText(it.label, it.x + (it.w - g.measureText(it.label).width) / 2, it.y + it.h - 22);
        return;
      }
    }
    if (it.kind === 'big') {
      fit(g, it.label, '600', 64, 48, it.w - 60 - (it.icon ? it.h * 0.6 : 0));
      g.fillText(it.label, it.x + 34, it.y + it.h / 2 + 4);
      if (it.sub) {
        g.fillStyle = it.off ? DIMI : '#8e8e94';
        fit(g, it.sub, '400', 48, 48, it.w - 60 - (it.icon ? it.h * 0.6 : 0));
        g.fillText(it.sub, it.x + 34, it.y + it.h / 2 + 66);
      }
      return;
    }
    // chip, button, play: the label in the middle (a second line under it)
    const lines = it.label.split('\n');
    if (it.kind === 'play' && !it.off) g.fillStyle = '#0b0b0d';
    const px = fit(g, lines.reduce((a, b) => (a.length > b.length ? a : b)), '600', it.kind === 'play' ? 64 : 52, 48, it.w - (it.icon ? it.h * 0.7 : 0) - 30);
    const cx = it.x + (it.w - (it.icon ? it.h * 0.55 : 0)) / 2;
    // the block (label lines, then the sub under the last of them) centred in the item
    const lh = px * 1.1;
    const subH = it.sub ? 62 : 0;
    const top = it.y + (it.h - (lines.length - 1) * lh - subH) / 2 + px * 0.35;
    lines.forEach((t, j) => g.fillText(t, cx - g.measureText(t).width / 2, top + j * lh));
    if (it.sub) {
      g.fillStyle = it.off ? DIMI : it.kind === 'play' ? '#3a3a3e' : '#8e8e94';
      fit(g, it.sub, '400', 48, 48, it.w - 30);
      g.fillText(it.sub, cx - g.measureText(it.sub).width / 2, top + (lines.length - 1) * lh + subH);
    }
  }
}
