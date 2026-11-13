/**
 * The panel: the game's screen, floating just above the back of the desk and leaning back toward you, the way a VR
 * game's menu does and laid out like a music game's: instrument tabs along the top, a screen in the middle (choosing
 * a song, the song you're playing, your results), and five big buttons along the bottom. You poke a button with a
 * fingertip (or pinch it): it lights and clicks. Drawn on one canvas; presses and pulses are light quads on top,
 * so nothing redraws every frame. Kit-local: centred over the desk behind the instrument.
 */
import { AdditiveBlending, BoxGeometry, CanvasTexture, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';
import { FONT, MARKER, whenFonts } from './fonts.js';
import { KEYS, star, type Display, type ModuleKey } from './module.js';
import { ICON } from '../stand/stand.js';

/** The panel in kit-local space: centre, size (m), and how far it leans back (radians). */
export const PANEL = { y: 0.19, z: -0.2, w: 0.34, h: 0.2, lean: 0.47 } as const;
/** Canvas pixels (4 per millimetre). */
const CW = 1360;
const CH = 800;

/** A spot you can press, in canvas pixels. */
interface Spot {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** 0–4 the buttons (◀ PLAY ▶ and two more), 5–9 the instrument tabs, 10 the gear. */
export const SPOTS: readonly Spot[] = [
  ...[0, 1, 2, 3, 4].map((i) => ({ x: 24 + i * 266, y: 590, w: 248, h: 190 })),
  ...[0, 1, 2, 3, 4].map((i) => ({ x: 24 + i * 266, y: 18, w: 248, h: 150 })),
  { x: 1248, y: 196, w: 88, h: 88 },
];
export const TAB0 = 5;
export const GEAR = 10;

export interface Tab {
  id: string;
  name: string;
  color: number;
}

const INK = '#f2efe6';
const SOFT = '#bdb8ad';
const DIM = '#55534f';
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** A spot's centre and size in the panel's zone frame (x right, z up the panel, metres). */
export function spotZone(i: number): { x: number; z: number; w: number; h: number } {
  const s = SPOTS[i];
  return { x: ((s.x + s.w / 2) / CW - 0.5) * PANEL.w, z: (0.5 - (s.y + s.h / 2) / CH) * PANEL.h, w: (s.w / CW) * PANEL.w, h: (s.h / CH) * PANEL.h };
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

function fit(g: CanvasRenderingContext2D, text: string, weight: string, px: number, min: number, room: number): void {
  g.font = `${weight} ${px}px ${FONT}`;
  while (g.measureText(text).width > room && px > min) g.font = `${weight} ${--px}px ${FONT}`;
}

export class Panel {
  readonly root = new Group();
  /** The pressable face's frame: +Y out of the panel toward you, +X right, −Z up the panel (for the hit surface). */
  readonly frame = new Object3D();
  private canvas = document.createElement('canvas');
  private tex: CanvasTexture;
  private glows: Mesh[] = [];
  private press = new Float32Array(SPOTS.length);
  private pulseT = 0;
  private tabs: Tab[] = [];
  private current = '';
  shown: Display = { line: '', sub: '', found: [], total: 0, meter: -1, stars: -1, pulse: null, count: 0, day: 0, gold: false, code: '', keyLabels: null, locked: [] };
  private sig = '';

  constructor() {
    this.root.name = 'Panel';
    this.canvas.width = CW;
    this.canvas.height = CH;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.tex.anisotropy = 4;
    // a thin dark slab with the screen on its face
    const slab = new Mesh(new BoxGeometry(PANEL.w + 0.008, PANEL.h + 0.008, 0.006), new MeshStandardMaterial({ name: 'Slab', color: 0x111113, roughness: 0.5, metalness: 0.2 }));
    slab.name = 'Slab';
    slab.position.z = -0.0035;
    const face = new Mesh(new PlaneGeometry(PANEL.w, PANEL.h), new MeshBasicMaterial({ map: this.tex, toneMapped: false }));
    face.name = 'Face';
    this.root.add(slab, face);
    // a light quad over each spot: a press flashes it, the button the game wants pulses
    SPOTS.forEach((_, i) => {
      const z = spotZone(i);
      const m = new Mesh(new PlaneGeometry(z.w * 0.96, z.h * 0.92), new MeshBasicMaterial({ color: 0xfff2dc, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
      m.position.set(z.x, z.z, 0.0012);
      m.renderOrder = 8;
      this.glows.push(m);
      this.root.add(m);
    });
    this.frame.rotation.x = Math.PI / 2;
    this.root.add(this.frame);
    this.root.position.set(0, PANEL.y, PANEL.z);
    this.root.rotation.x = -PANEL.lean;
    this.draw(this.shown);
    whenFonts(() => this.draw(this.shown));
  }

  /** The instruments for the tabs, and which is out. */
  setTabs(tabs: readonly Tab[], current: string): void {
    if (tabs.length === this.tabs.length && current === this.current && tabs.every((t, i) => t.id === this.tabs[i].id)) return;
    this.tabs = tabs.slice();
    this.current = current;
    this.sig = '';
    this.draw(this.shown);
  }

  /** Which tab's instrument a spot is (or null). */
  tabAt(spot: number): string | null {
    return spot >= TAB0 && spot < TAB0 + 5 ? (this.tabs[spot - TAB0]?.id ?? null) : null;
  }

  /** Spot `i` was pressed. */
  pressKey(i: number): void {
    if (i >= 0 && i < this.press.length) this.press[i] = 1;
  }

  set(d: Display): void {
    this.shown = d;
    const sig = [d.screen, d.line, d.sub, d.count, d.stars, d.gold, d.code, d.keys?.join('|'), d.keyLabels?.join('|'), d.songCard?.name, d.songCard?.stars, d.songCard?.pos, d.inst?.name, d.inst?.detail, Math.round((d.progress ?? 0) * 40), d.combo, Math.round(d.meter * 12)].join('~');
    if (sig === this.sig) return;
    this.sig = sig;
    this.draw(d);
  }

  update(dt: number): void {
    this.pulseT += dt;
    const want = this.shown.pulse ? KEYS.indexOf(this.shown.pulse) : -1;
    for (let i = 0; i < this.glows.length; i++) {
      this.press[i] = Math.max(0, this.press[i] - dt * 5);
      const p = i === want ? 0.5 + 0.5 * Math.sin(this.pulseT * 5) : 0;
      (this.glows[i].material as MeshBasicMaterial).opacity = Math.max(this.press[i] * 0.55, p * 0.22);
    }
  }

  private draw(d: Display): void {
    const g = this.canvas.getContext('2d')!;
    g.clearRect(0, 0, CW, CH);
    // the screen: near-black glass with a faint warm edge
    rounded(g, 0, 0, CW, CH, 36);
    g.fillStyle = '#0d0d0f';
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = '#2b2a28';
    g.stroke();
    g.textBaseline = 'alphabetic';
    this.drawTabs(g);
    this.drawScreen(g, d);
    this.drawButtons(g, d);
    // the gear: settings
    const s = SPOTS[GEAR];
    g.save();
    g.translate(s.x + s.w / 2, s.y + s.h / 2);
    g.strokeStyle = SOFT;
    g.lineWidth = 7;
    g.beginPath();
    g.arc(0, 0, 18, 0, Math.PI * 2);
    g.stroke();
    for (let k = 0; k < 8; k++) {
      g.rotate(Math.PI / 4);
      g.fillStyle = SOFT;
      g.fillRect(-6, -34, 12, 12);
    }
    g.restore();
    this.tex.needsUpdate = true;
  }

  private drawTabs(g: CanvasRenderingContext2D): void {
    this.tabs.forEach((t, i) => {
      const s = SPOTS[TAB0 + i];
      const on = t.id === this.current;
      rounded(g, s.x, s.y, s.w, s.h, 22);
      g.fillStyle = on ? '#24221f' : '#161618';
      g.fill();
      g.lineWidth = on ? 7 : 3;
      g.strokeStyle = on ? hex(t.color) : '#2f2e2c';
      g.stroke();
      // the instrument, drawn
      g.save();
      g.translate(s.x + s.w / 2 - 50, s.y + 8);
      g.strokeStyle = on ? INK : SOFT;
      g.fillStyle = on ? INK : SOFT;
      g.lineWidth = 5;
      g.lineCap = 'round';
      ICON[t.id]?.(g, 100);
      g.restore();
      g.fillStyle = on ? INK : SOFT;
      g.font = `600 34px ${FONT}`;
      const n = t.name.toUpperCase();
      g.fillText(n, s.x + (s.w - g.measureText(n).width) / 2, s.y + s.h - 16);
    });
  }

  /** The middle: what you're choosing, the song you're in, or how it went. */
  private drawScreen(g: CanvasRenderingContext2D, d: Display): void {
    const X = 40;
    const Y0 = 196;
    const R = CW - 140;
    if (d.screen === 'home' && d.songCard) {
      // left: the instrument that's out; right: the song card
      const inst = d.inst;
      g.fillStyle = SOFT;
      g.font = `600 30px ${FONT}`;
      g.fillText('ON THE DESK', X, Y0 + 40);
      g.fillStyle = INK;
      fit(g, inst?.name ?? d.line, '700', 84, 44, 520);
      g.fillText(inst?.name ?? d.line, X, Y0 + 124);
      g.fillStyle = SOFT;
      fit(g, inst?.detail ?? d.sub, '500', 40, 26, 540);
      g.fillText(inst?.detail ?? d.sub, X, Y0 + 180);
      if (d.code) {
        g.fillStyle = '#7fe39a';
        g.font = `600 38px ${FONT}`;
        g.fillText(`BAND ${d.code}`, X, Y0 + 300);
      }
      // the card: a strip of tape with the song's name, its tempo, where it is in the list, its stars
      const c = d.songCard;
      const cx = 640;
      const cw = 560;
      rounded(g, cx, Y0 + 10, cw, 340, 24);
      g.fillStyle = '#1a1917';
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = '#34322e';
      g.stroke();
      g.fillStyle = SOFT;
      g.font = `600 30px ${FONT}`;
      g.fillText(`SONG ${c.pos}`, cx + 28, Y0 + 56);
      g.save();
      g.translate(cx + 24, Y0 + 82);
      g.rotate(-0.02);
      g.fillStyle = '#ece2c6';
      g.fillRect(0, 0, cw - 48, 92);
      g.fillStyle = '#17150f';
      g.font = `64px ${MARKER}`;
      let px = 64;
      while (g.measureText(c.name).width > cw - 90 && px > 36) g.font = `${--px}px ${MARKER}`;
      g.fillText(c.name, 22, 68);
      g.restore();
      g.fillStyle = INK;
      g.font = `500 38px ${FONT}`;
      g.fillText(c.meta, cx + 28, Y0 + 238);
      for (let i = 0; i < 3; i++) star(g, cx + 54 + i * 70, Y0 + 300, 26, i < c.stars);
      g.fillStyle = SOFT;
      g.font = `500 32px ${FONT}`;
      const hint = d.line === 'Play a song?' ? 'Tap PLAY' : d.sub;
      g.fillText(hint.length > 28 ? '' : hint, cx + 270, Y0 + 312);
      return;
    }
    if (d.screen === 'results') {
      // stars big, then the notes, then the line under it
      for (let i = 0; i < 3; i++) star(g, X + 70 + i * 130, Y0 + 110, 52, i < Math.max(0, d.stars), d.gold);
      g.fillStyle = INK;
      fit(g, d.line, '700', 96, 50, R - 460);
      g.fillText(d.line, X + 440, Y0 + 140);
      g.fillStyle = SOFT;
      fit(g, d.sub, '500', 52, 30, R - X);
      g.fillText(d.sub, X, Y0 + 270);
      return;
    }
    if (d.screen === 'song' || d.screen === 'page' || !d.screen) {
      const room = d.count > 0 ? R - 260 : R - X;
      g.fillStyle = INK;
      fit(g, d.line, '700', 92, 44, room);
      g.fillText(d.line, X, Y0 + 110);
      g.fillStyle = SOFT;
      fit(g, d.sub, '500', 56, 30, room);
      g.fillText(d.sub, X, Y0 + 190);
      if (d.count > 0) {
        g.fillStyle = INK;
        g.font = `700 240px ${FONT}`;
        const t = String(d.count);
        g.fillText(t, CW - 70 - g.measureText(t).width, Y0 + 260);
      }
      if (d.stars >= 0) for (let i = 0; i < 3; i++) star(g, CW - 260 + i * 70, Y0 + 60, 26, i < d.stars, d.gold);
      if (d.combo && d.combo >= 4) {
        g.fillStyle = '#ffd34d';
        g.font = `700 54px ${FONT}`;
        const t = `x${d.combo}`;
        g.fillText(t, CW - 70 - g.measureText(t).width, Y0 + 190);
      }
      // the song so far
      if (d.progress !== undefined && d.progress >= 0) {
        g.fillStyle = '#2a2927';
        g.fillRect(X, Y0 + 300, R - X, 14);
        g.fillStyle = INK;
        g.fillRect(X, Y0 + 300, (R - X) * Math.min(1, d.progress), 14);
      }
      if (d.meter >= 0) {
        g.fillStyle = '#2a2927';
        g.fillRect(X, Y0 + 340, R - X, 10);
        g.fillStyle = '#7fe39a';
        g.fillRect(X, Y0 + 340, (R - X) * d.meter, 10);
      }
    }
  }

  private drawButtons(g: CanvasRenderingContext2D, d: Display): void {
    const labels = d.keyLabels ?? d.keys ?? ['<', 'PLAY', '>', '', ''];
    KEYS.forEach((k: ModuleKey, i) => {
      const s = SPOTS[i];
      const text = labels[i] ?? '';
      const off = !text;
      rounded(g, s.x, s.y, s.w, s.h, 26);
      g.fillStyle = off ? '#111113' : k === 'play' ? '#2b2420' : '#1d1d20';
      g.fill();
      g.lineWidth = 4;
      g.strokeStyle = off ? '#1d1d1f' : k === 'play' ? '#ff5a3c' : '#3a3936';
      g.stroke();
      if (off) return;
      g.fillStyle = INK;
      const lines = text.split('\n');
      let px = lines.length > 1 ? 44 : text.length <= 2 ? 96 : 56;
      g.font = `700 ${px}px ${FONT}`;
      while (lines.some((t) => g.measureText(t).width > s.w - 24) && px > 24) g.font = `700 ${--px}px ${FONT}`;
      lines.forEach((t, j) => g.fillText(t, s.x + (s.w - g.measureText(t).width) / 2, s.y + s.h / 2 + px * 0.36 + (j - (lines.length - 1) / 2) * px * 1.1));
    });
    void DIM;
  }
}
