/**
 * The panel: the game's screen, floating just above the back of the desk and leaning back toward you, the way a VR
 * game's menu does, laid out like a music game's. It draws whatever page it's given (src/ui/menu.ts): a title, a
 * line, and things to press (menu tiles, instrument cards, song rows, choices, buttons), plus a song's progress and
 * count or the results' stars. You poke an item with a fingertip, or pinch it: it lights and clicks. One canvas;
 * presses and pulses are light quads on top, so nothing redraws every frame. Kit-local, centred behind the instrument.
 */
import { AdditiveBlending, BoxGeometry, CanvasTexture, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, RingGeometry, SRGBColorSpace } from '@iwsdk/core';
import { asLight } from '../art/light.js';
import { FONT, MARKER, whenFonts } from './fonts.js';
import { star, type Display } from './module.js';
import type { Item, Page } from './menu.js';
import { ICON } from '../stand/stand.js';

/** The panel in kit-local space: centre, size (m), and how far it leans back (radians). */
export const PANEL = { y: 0.19, z: -0.2, w: 0.34, h: 0.2, lean: 0.47 } as const;
/** Canvas pixels (4 per millimetre). */
const CW = 1360;
const CH = 800;
const MAX_ITEMS = 16;

const INK = '#f2efe6';
const SOFT = '#bdb8ad';
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

function fit(g: CanvasRenderingContext2D, text: string, weight: string, px: number, min: number, room: number): number {
  // (never below 30 px: about 7.5 mm on the panel, readable from a seat)
  min = Math.max(30, min);
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
  private press = new Float32Array(MAX_ITEMS);
  private pulseT = 0;
  /** What's on it now, and a number that changes whenever its items do (the hit zones follow). */
  page: Page | null = null;
  version = 0;
  shown: Display = { line: '', sub: '', found: [], total: 0, meter: -1, stars: -1, pulse: null, count: 0, day: 0, gold: false, code: '', keyLabels: null, locked: [] };
  private sig = '';
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
    this.faceMat = new MeshBasicMaterial({ map: this.tex, toneMapped: false, transparent: true });
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
    this.root.add(this.bar, this.comboMesh);
    this.root.position.set(0, PANEL.y, PANEL.z);
    this.root.rotation.x = -PANEL.lean;
    whenFonts(() => {
      this.sig = '';
      this.set(this.shown);
    });
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
    const combo = song ? (d.combo ?? 0) : 0;
    this.comboMesh.visible = combo >= 4;
    if (combo !== this.lastCombo) {
      this.lastCombo = combo;
      if (combo >= 4) this.drawCombo(combo);
    }
    const sig = [p.id, p.title, p.line, d.count, d.stars, d.gold, d.code, p.items.map((i) => `${i.id}|${i.label}|${i.sub}|${i.on}|${i.off}|${i.stars}`).join(',')].join('~');
    if (sig === this.sig) return;
    this.sig = sig;
    if (p.id !== this.pageId) {
      this.pageId = p.id;
      this.turn = 0;
      // (a flash left from the last page doesn't land on whatever sits there now)
      this.press.fill(0);
    }
    this.page = p;
    const isig = p.items.map((i) => `${i.id}@${i.x},${i.y},${i.w},${i.h}`).join(';');
    if (isig !== this.itemsSig) {
      this.itemsSig = isig;
      this.version++;
      this.glows.forEach((m, i) => {
        const it = p.items[i];
        m.visible = !!it;
        if (!it) return;
        const z = itemZone(it);
        m.position.set(z.x, z.z, 0.0012);
        m.scale.set(z.w * 0.97, z.h * 0.94, 1);
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
      const r = 0.003 + 0.012 * (1 - this.hoverK);
      this.cursor.position.set(this.cursorAt.x, this.cursorAt.z, 0.0015);
      this.cursor.scale.setScalar(r);
      const mm = this.cursor.material as MeshBasicMaterial;
      mm.opacity = 0.3 + 0.6 * this.hoverK;
      mm.color.setHex(this.hoverK > 0.9 ? 0xffa630 : 0xfff2dc);
    }
    // the panel grows in when it first shows; a new page slides up into place and fades in
    if (this.root.visible && this.grow < 1) this.grow = Math.min(1, this.grow + dt / 0.35);
    const e = 1 - Math.pow(1 - this.grow, 3);
    this.root.scale.setScalar(0.85 + 0.15 * e);
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
      (m.material as MeshBasicMaterial).opacity = Math.max(this.press[i] * 0.55, p * 0.12, h * 0.28) * te;
      const pop = 1 + 0.04 * this.press[i];
      const z = items[i] ? itemZone(items[i]) : null;
      if (z) m.scale.set(z.w * 0.97 * pop, z.h * 0.94 * pop, 1);
    }
  }

  private draw(d: Display, p: Page): void {
    const g = this.canvas.getContext('2d')!;
    g.clearRect(0, 0, CW, CH);
    rounded(g, 0, 0, CW, CH, 36);
    g.fillStyle = '#0d0d0f';
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = '#2b2a28';
    g.stroke();
    g.textBaseline = 'alphabetic';
    // the header: the title, and the line under it
    const hasBack = p.items.some((i) => i.id === 'back' && i.y < 120);
    const tx = hasBack ? 220 : 40;
    const right = p.items.some((i) => i.y < 120 && i.x > CW / 2) ? CW - 280 : CW - 40;
    g.fillStyle = INK;
    fit(g, p.title, '700', p.id === 'main' ? 76 : 66, 36, right - tx);
    if (p.id === 'main') g.font = `76px ${MARKER}`;
    g.fillText(p.title, tx, 84);
    if (p.line) {
      g.fillStyle = SOFT;
      fit(g, p.line, '500', 34, 22, right - tx);
      g.fillText(p.line, tx, 128);
    }
    if (d.code && p.id !== 'band') {
      g.fillStyle = '#7fe39a';
      g.font = `600 30px ${FONT}`;
      const t = `BAND ${d.code}`;
      g.fillText(t, CW - 40 - g.measureText(t).width, 128);
    }
    if (p.body === 'song') this.drawSong(g, d);
    if (p.body === 'results') this.drawResults(g, d);
    p.items.forEach((it) => this.drawItem(g, it));
    this.tex.needsUpdate = true;
  }

  private drawSong(g: CanvasRenderingContext2D, d: Display): void {
    const X = 40;
    const R = CW - 40;
    if (d.count > 0) {
      g.fillStyle = INK;
      g.font = `700 300px ${FONT}`;
      const t = String(d.count);
      g.fillText(t, (CW - g.measureText(t).width) / 2, 470);
      return;
    }
    if (d.stars >= 0) for (let i = 0; i < 3; i++) star(g, R - 210 + i * 76, 230, 30, i < d.stars, d.gold);
    // (the progress bar's track; its fill and the run of notes are drawn apart)
    g.fillStyle = '#2a2927';
    rounded(g, X, 470, R - X, 22, 11);
    g.fill();
    if (d.meter >= 0) {
      g.fillStyle = '#2a2927';
      g.fillRect(X, 520, R - X, 10);
      g.fillStyle = '#7fe39a';
      g.fillRect(X, 520, (R - X) * d.meter, 10);
    }
  }

  private drawCombo(n: number): void {
    const g = this.comboCanvas.getContext('2d')!;
    g.clearRect(0, 0, 512, 256);
    g.fillStyle = '#ffd34d';
    g.font = `700 150px ${FONT}`;
    g.fillText(String(n), 8, 150);
    g.fillStyle = SOFT;
    g.font = `500 48px ${FONT}`;
    g.fillText('in a row', 14, 220);
    this.comboTex.needsUpdate = true;
  }

  private drawResults(g: CanvasRenderingContext2D, d: Display): void {
    for (let i = 0; i < 3; i++) star(g, CW / 2 - 170 + i * 170, 330, 70, i < Math.max(0, d.stars), d.gold);
  }

  private drawItem(g: CanvasRenderingContext2D, it: Item): void {
    const accent = it.color !== undefined ? hex(it.color) : it.kind === 'play' ? '#ff5a3c' : '#ffa630';
    const r = it.kind === 'chip' || it.kind === 'button' ? 22 : 28;
    rounded(g, it.x, it.y, it.w, it.h, r);
    g.fillStyle = it.off ? '#121214' : it.on ? '#2a2620' : it.kind === 'play' ? '#2e1d18' : '#1b1b1e';
    g.fill();
    g.lineWidth = it.on ? 8 : 3;
    g.strokeStyle = it.off ? '#1e1e20' : it.on || it.kind === 'play' ? accent : '#38372f';
    g.stroke();
    const ink = it.off ? DIMI : INK;
    g.fillStyle = ink;
    if (it.kind === 'card' || (it.icon && it.kind !== 'row')) {
      // an instrument, drawn, with its name under it
      const S = Math.min(it.h * (it.kind === 'card' ? 0.62 : 0.55), it.w * 0.7);
      g.save();
      g.translate(it.x + (it.kind === 'card' ? (it.w - S) / 2 : it.w - S - 24), it.y + (it.kind === 'card' ? 10 : (it.h - S) / 2));
      g.strokeStyle = it.on ? INK : SOFT;
      g.fillStyle = it.on ? INK : SOFT;
      g.lineWidth = 5;
      g.lineCap = 'round';
      if (it.icon) ICON[it.icon]?.(g, S);
      g.restore();
      g.fillStyle = ink;
      if (it.kind === 'card') {
        fit(g, it.label, '700', Math.min(48, it.h * 0.2), 22, it.w - 20);
        g.fillText(it.label, it.x + (it.w - g.measureText(it.label).width) / 2, it.y + it.h - 22);
        return;
      }
    }
    if (it.kind === 'big') {
      fit(g, it.label, '700', 76, 36, it.w - 60 - (it.icon ? it.h * 0.6 : 0));
      g.fillText(it.label, it.x + 34, it.y + it.h / 2 + 10);
      if (it.sub) {
        g.fillStyle = it.off ? DIMI : SOFT;
        fit(g, it.sub, '500', 36, 22, it.w - 60 - (it.icon ? it.h * 0.6 : 0));
        g.fillText(it.sub, it.x + 34, it.y + it.h / 2 + 62);
      }
      return;
    }
    if (it.kind === 'row') {
      g.font = `${Math.min(56, it.h * 0.55)}px ${MARKER}`;
      g.fillText(it.label, it.x + 28, it.y + it.h * 0.62);
      if (it.sub) {
        g.fillStyle = it.off ? DIMI : SOFT;
        g.font = `500 30px ${FONT}`;
        g.fillText(it.sub, it.x + 420, it.y + it.h * 0.6);
      }
      if (it.stars !== undefined && !it.off) for (let i = 0; i < 3; i++) star(g, it.x + it.w - 150 + i * 50, it.y + it.h / 2, 18, i < it.stars);
      return;
    }
    // chip, button, play: the label in the middle (a second line under it)
    const lines = it.label.split('\n');
    const px = fit(g, lines.reduce((a, b) => (a.length > b.length ? a : b)), '700', it.kind === 'play' ? 72 : 50, 22, it.w - (it.icon ? it.h * 0.7 : 0) - 30);
    const cx = it.x + (it.w - (it.icon ? it.h * 0.55 : 0)) / 2;
    const top = it.y + it.h / 2 - ((lines.length - 1) * px * 1.1) / 2 + px * 0.35 - (it.sub ? 18 : 0);
    lines.forEach((t, j) => g.fillText(t, cx - g.measureText(t).width / 2, top + j * px * 1.1));
    if (it.sub) {
      g.fillStyle = it.off ? DIMI : SOFT;
      fit(g, it.sub, '500', 30, 18, it.w - 30);
      g.fillText(it.sub, cx - g.measureText(it.sub).width / 2, top + 50);
    }
  }
}
