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
import { PanelFx, type FxKind } from './panel-fx.js';
import { GRADE_PAIR, JUDGE, LEVEL_INK, MULT_PAIR, NEON, SECONDARY, body, chroma, display, glowText, hgrad, pill, slant, stage, vgrad } from './theme.js';
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

const INK = '#fbf7ff';
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
interface Quad {
  c: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  tex: CanvasTexture;
  mesh: Mesh;
}
/** A canvas on its own quad over the panel, at a page-pixel zone (drawn and uploaded apart from the page). */
function overlayQuad(w: number, h: number, at: { x: number; y: number; w: number; h: number }): Quad {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = LinearFilter;
  const z = itemZone(at);
  const mesh = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }));
  mesh.scale.set(z.w, z.h, 1);
  mesh.userData.size = z.w;
  mesh.userData.h = z.h;
  mesh.userData.y = z.z;
  mesh.position.set(z.x, z.z, 0.0018);
  mesh.renderOrder = 9;
  mesh.visible = false;
  return { c, g: c.getContext('2d')!, tex, mesh };
}
const fmt = (n: number) => n.toLocaleString('en-GB');
const INK2 = NEON.ink;
const MUTED = NEON.muted;
const GOLD = NEON.gold;
const RED = NEON.red;
/** The run: its count in the streak's gradient, the multiplier's chip, COMBO (page px from (32, 176)). */
function drawRun(g: CanvasRenderingContext2D, combo: number, mult: number, spot: boolean): void {
  g.clearRect(0, 0, 600, 260);
  const [a, b] = spot ? GRADE_PAIR.S : MULT_PAIR[mult] ?? MULT_PAIR[1];
  g.font = display(150, 900);
  glowText(g, String(combo), 6, 150, vgrad(g, 20, 150, a, b), b, mult > 1 || spot ? 24 : 8);
  let x = 6;
  if (mult > 1 || spot) {
    const t = `×${spot ? mult * 2 : mult}`;
    g.font = display(48, 900);
    const w = g.measureText(t).width + 44;
    slant(g, x, 186, w, 64, 14);
    g.shadowColor = b;
    g.shadowBlur = 14;
    g.fillStyle = vgrad(g, 186, 250, a, b);
    g.fill();
    g.shadowBlur = 0;
    g.fillStyle = '#1a0b2e';
    g.fillText(t, x + 22, 234);
    x += w + 16;
  }
  g.fillStyle = MUTED;
  g.font = display(48, 700);
  g.fillText('COMBO', x, 234);
}
/** The score, accuracy, and your best's race (page px from (808, 176), right-aligned to 1328). */
function drawHud(g: CanvasRenderingContext2D, score: number, acc: number, ghost: number | null): void {
  g.clearRect(0, 0, 520, 260);
  g.textAlign = 'right';
  g.font = display(96, 900);
  g.fillStyle = INK2;
  g.fillText(fmt(score), 512, 96);
  g.font = display(48, 700);
  g.fillStyle = MUTED;
  g.fillText(`${(acc * 100).toFixed(1)}%`, 512, 160);
  if (ghost !== null) {
    g.font = display(48, 800);
    if (ghost >= 0) {
      g.fillStyle = NEON.green;
      g.fillText(`+${fmt(ghost)} on best`, 512, 222);
    }
    else {
      g.fillStyle = MUTED;
      g.fillText(`${fmt(-ghost)} behind best`, 512, 222);
    }
  }
  g.textAlign = 'left';
}
/** The spotlight: its name (or what to do), four slanted segments filling gold to magenta (page px from (32, 516)). */
function drawSpot(g: CanvasRenderingContext2D, meter: number, active: boolean, ready: boolean): void {
  g.clearRect(0, 0, 820, 72);
  g.font = display(48, 900);
  if (active || ready) {
    g.fillStyle = NEON.gold;
    g.fillText(active ? 'SPOTLIGHT ×2' : 'HANDS UP!', 0, 52);
  }
  else {
    g.fillStyle = MUTED;
    g.fillText('SPOTLIGHT', 0, 52);
  }
  for (let i = 0; i < 4; i++) {
    const x = 380 + i * 108;
    slant(g, x, 20, 100, 32, 12);
    g.fillStyle = 'rgba(138,92,255,0.18)';
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(179,166,214,0.35)';
    g.stroke();
    const f = Math.max(0, Math.min(1, meter * 4 - i));
    if (f > 0) {
      g.save();
      slant(g, x, 20, 100, 32, 12);
      g.clip();
      g.fillStyle = hgrad(g, x, x + 100, ['#ffd23f', '#ff9a3c']);
      g.fillRect(x, 20, 100 * f, 32);
      g.restore();
    }
  }
}
/** The results' score as it counts up (page px from (576, 240)). */
function drawCountUp(g: CanvasRenderingContext2D, score: number): void {
  g.clearRect(0, 0, 752, 188);
  g.font = display(150, 900);
  g.fillStyle = NEON.ink;
  g.fillText(fmt(score), 8, 157);
}
/** The medal's ring: a dark track with ticks where each grade begins, filled to `k` (in a grade's gradient once stamped). */
function drawRing(g: CanvasRenderingContext2D, k: number, pair: [string, string] | null): void {
  g.clearRect(0, 0, 480, 480);
  g.lineCap = 'round';
  g.lineWidth = 28;
  g.strokeStyle = 'rgba(138,92,255,0.18)';
  g.beginPath();
  g.arc(240, 240, 200, 0, Math.PI * 2);
  g.stroke();
  if (k > 0.002) {
    g.strokeStyle = pair ? vgrad(g, 40, 440, pair[0], pair[1]) : 'rgba(251,247,255,0.7)';
    g.shadowColor = pair ? pair[1] : NEON.violet;
    g.shadowBlur = pair ? 26 : 10;
    g.beginPath();
    g.arc(240, 240, 200, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
    g.stroke();
    g.shadowBlur = 0;
  }
  // (where C, B, A and S begin, as notches on the ring)
  g.lineCap = 'butt';
  g.lineWidth = 4;
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  for (const t of [0.65, 0.78, 0.88, 0.95]) {
    const an = -Math.PI / 2 + Math.PI * 2 * t;
    g.beginPath();
    g.moveTo(240 + Math.cos(an) * 178, 240 + Math.sin(an) * 178);
    g.lineTo(240 + Math.cos(an) * 222, 240 + Math.sin(an) * 222);
    g.stroke();
  }
}
/** The grade: a chunky letter in its gradient, a dark outline, a glow. */
function drawGrade(g: CanvasRenderingContext2D, letter: string): void {
  g.clearRect(0, 0, 300, 300);
  const [a, b] = GRADE_PAIR[letter] ?? GRADE_PAIR.D;
  g.font = display(250, 900);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 18;
  g.strokeStyle = '#1a0b2e';
  g.strokeText(letter, 156, 160);
  g.shadowColor = b;
  g.shadowBlur = letter === 'S' || letter === 'A' ? 34 : 14;
  g.fillStyle = vgrad(g, 50, 260, a, b);
  g.fillText(letter, 156, 160);
  g.shadowBlur = 0;
  g.lineWidth = 3;
  g.strokeStyle = 'rgba(255,255,255,0.65)';
  g.strokeText(letter, 156, 160);
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
}
/** Over the score: a banner on a gold plate for a full combo, else NEW RECORD!, else your best (a first clear). */
function drawBrow(g: CanvasRenderingContext2D, better: boolean, prev: number, score: number, banner = ''): void {
  g.clearRect(0, 0, 752, 96);
  if (banner) {
    g.font = display(72, 900);
    const w = Math.min(744, g.measureText(banner).width + 70);
    slant(g, 4, 2, w, 92);
    g.fillStyle = hgrad(g, 4, 4 + w, ['#ffd23f', '#ff9a3c']);
    g.fill();
    g.fillStyle = '#1a0b2e';
    g.fillText(banner, 4 + Math.round(92 * 0.176) + 18, 74);
    return;
  }
  if (better && prev >= 0) {
    g.font = display(48, 900);
    const w = g.measureText('NEW RECORD!').width + 56;
    pill(g, 4, 16, w, 64, hgrad(g, 4, 4 + w, ['#ff7ac8', '#ff3ea5']), 'NEW RECORD!', '#ffffff', display(48, 900));
    g.font = display(48, 800);
    g.fillStyle = NEON.ink;
    g.fillText(`+${fmt(score - prev)}`, w + 24, 66);
    return;
  }
  g.font = display(48, 800);
  g.fillStyle = MUTED;
  g.fillText(prev >= 0 ? `BEST ${fmt(prev)}` : 'FIRST CLEAR', 4, 64);
}
/** What the run was: the record (if the banner took the brow) or the next goal; each judgement centred over its count. */
function drawDetails(g: CanvasRenderingContext2D, r: { hook: string; letter: string; accuracy: number; fullCombo: boolean; allPerfect: boolean; maxCombo: number; perfect: number; good: number; miss: number; better?: boolean; prev?: number; score?: number }): void {
  g.clearRect(0, 0, 752, 236);
  if ((r.fullCombo || r.allPerfect) && r.better && (r.prev ?? -1) >= 0) {
    pill(g, 8, 4, 330, 64, hgrad(g, 8, 338, ['#ff7ac8', '#ff3ea5']), 'NEW RECORD!', '#ffffff', display(48, 900));
    g.font = display(48, 800);
    g.fillStyle = NEON.ink;
    g.fillText(`+${fmt((r.score ?? 0) - (r.prev ?? 0))}`, 360, 54);
  } else {
    fit(g, r.hook, '700', 52, 48, 744);
    g.fillStyle = NEON.ink;
    g.fillText(r.hook, 8, 54);
  }
  const cols: [string, string, string][] = [['PERFECT', String(r.perfect), JUDGE.perfect], ['GOOD', String(r.good), JUDGE.good], ['MISS', String(r.miss), JUDGE.miss], ['COMBO', String(r.maxCombo), '#d9cfff']];
  g.textAlign = 'center';
  cols.forEach(([l, v, c], i) => {
    const cx = 8 + 93 + i * 186;
    g.font = body(46, 800);
    g.fillStyle = c;
    g.fillText(l, cx, 128);
    g.font = display(64, 900);
    g.fillStyle = NEON.ink;
    g.fillText(v, cx, 202);
  });
  g.textAlign = 'left';
}

/** Each grade's colour: S gold, A green, B blue, C and D quieter. */
const GRADE_INK: Record<string, string> = { S: '#ffd36a', A: '#7be0a0', B: '#7fb4ff', C: '#c9c4bb', D: '#8e8e94' };

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
  // (still too wide at the smallest size: noted, so a layout check can find every clash)
  const w = g.measureText(text).width;
  if (w > room + 1) OVERFLOW.set(`${text}|${Math.round(room)}`, { text, room: Math.round(room), width: Math.round(w) });
  return px;
}
/** Text that didn't fit its room at the smallest size (read by the layout check). */
export const OVERFLOW = new Map<string, { text: string; room: number; width: number }>();
(globalThis as { __thumpOverflow?: typeof OVERFLOW }).__thumpOverflow = OVERFLOW;

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
    const bz = itemZone({ x: 32, y: 488, w: CW - 64, h: 16 });
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
    // the score while you play (its own canvas: it changes on every hit), the results' ring, grade and score, and
    // a callout that pops over the panel (×2, a run of 50, a run lost)
    // playing: the run (its count, the multiplier, in its colour), the score (with accuracy and your best), the
    // spotlight's meter; the results: the ring and grade, a line over the score, the score, what it was made of
    this.run = overlayQuad(600, 260, { x: 32, y: 176, w: 600, h: 260 });
    this.hud = overlayQuad(520, 260, { x: 808, y: 176, w: 520, h: 260 });
    this.spotQ = overlayQuad(820, 72, { x: 32, y: 516, w: 820, h: 72 });
    this.ring = overlayQuad(480, 480, { x: 48, y: 172, w: 480, h: 480 });
    this.grade = overlayQuad(300, 300, { x: 138, y: 222, w: 300, h: 300 });
    this.brow = overlayQuad(752, 96, { x: 576, y: 160, w: 752, h: 96 });
    this.scoreQ = overlayQuad(752, 188, { x: 576, y: 240, w: 752, h: 188 });
    this.details = overlayQuad(752, 236, { x: 576, y: 420, w: 752, h: 236 });
    this.callout = overlayQuad(1000, 150, { x: CW / 2 - 500, y: -210, w: 1000, h: 150 });
    for (const q of [this.run, this.hud, this.spotQ, this.ring, this.grade, this.brow, this.scoreQ, this.details, this.callout]) this.root.add(q.mesh);
    // (the stamp's shockwave: a ring of light out from the medal, no canvas)
    const rz = itemZone({ x: 288 - 210, y: 412 - 210, w: 420, h: 420 });
    this.shock = new Mesh(new RingGeometry(0.94, 1, 72), new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    this.shock.position.set(rz.x, rz.z, 0.002);
    this.shock.userData.r = rz.w / 2;
    this.shock.renderOrder = 9;
    this.shock.visible = false;
    this.root.add(this.shock);
    // particles and a sweep of light, in the panel's plane
    this.fx = new PanelFx(PANEL.w, PANEL.h);
    this.root.add(this.fx.root);
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
    this.buildHandle();
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
    this.root.rotation.order = 'YXZ';
    this.root.rotation.set(-lean, 0, 0);
    // moved by hand: where you left it, turned to face you
    // (never down onto the instrument: its bottom edge stays over the tallest part, so nothing under it goes dead)
    if (this.userAt) {
      this.baseY = Math.max(this.userAt.y, this.clear + 0.04 + (PANEL.h / 2) * Math.cos(lean));
      this.root.position.set(this.userAt.x, this.baseY, this.userAt.z);
      this.root.rotation.set(-lean, Math.atan2(-this.userAt.x, this.ahead - this.userAt.z), 0);
    }
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
  private run: Quad;
  private hud: Quad;
  private spotQ: Quad;
  private ring: Quad;
  private grade: Quad;
  private brow: Quad;
  private scoreQ: Quad;
  private details: Quad;
  private callout: Quad;
  private shock: Mesh;
  private fx: PanelFx;
  /** A note played: the panel's edge lights in the instrument's colour. */
  edgeFlash(color: number, gain: number): void {
    if (!this.hidden) this.fx.flash(color, gain);
  }
  /** A burst of particles at a page-pixel point (the medal, the score, the run). */
  burst(kind: FxKind, px = CW / 2, py = 400): void {
    const z = itemZone({ x: px, y: py, w: 0, h: 0 });
    this.fx.burst(kind, z.x, z.z);
  }
  private runKey = '';
  private spotKey = '';
  private browKey = '';
  private detKey = '';
  private stampAge = 9;
  private hudShown = -1;
  private hudKey = '';
  private hudT = 0;
  private hudPulse = 0;
  private lastMult = 1;
  private resKey = '';
  private calloutAge = 9;
  /** A moment worth saying over the panel: '×2', 'Run of 50', 'Run lost' (gold, white or grey). */
  say(text: string, tone: 'gold' | 'white' | 'grey' = 'white'): void {
    // a dark slanted plate, the words in chromatic italic (grey ones plain and quiet)
    const g = this.callout.g;
    g.clearRect(0, 0, 1000, 150);
    const t = text.toUpperCase();
    g.font = display(84, 900);
    const tw = Math.min(900, g.measureText(t).width);
    const w = Math.min(992, tw + 120);
    slant(g, (1000 - w) / 2, 12, w, 126, 30);
    g.fillStyle = 'rgba(22,10,48,0.9)';
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = tone === 'gold' ? NEON.gold : tone === 'grey' ? 'rgba(179,166,214,0.4)' : NEON.magenta;
    g.stroke();
    if (tone === 'grey') {
      g.fillStyle = MUTED;
      g.fillText(t, (1000 - tw) / 2, 104);
    } else chroma(g, t, (1000 - tw) / 2, 106, 84, tone === 'gold' ? NEON.gold : NEON.cyan, NEON.magenta);
    this.callout.tex.needsUpdate = true;
    this.calloutAge = 0;
  }
  /** The results' grade landed: the medal pulses, a ring of light runs out, the panel gives under it. */
  stamp(): void {
    this.stampAge = 0;
    const l = this.shown?.result?.letter ?? 'B';
    if (l !== 'D') this.burst(l === 'S' || l === 'A' ? 'stamp' : 'stamp-small', 288, 412);
  }
  private starQuads: Mesh[] = [];
  private starTex: CanvasTexture[] = [];
  private starAge = [9, 9, 9];
  /** Star `i` of the results just landed (its note is playing): it drops into place. */
  starLand(i: number, gold = false): void {
    const t = this.starTex[i];
    if (!t) return;
    const q = this.starQuads[i];
    const scored = !!this.shown?.result;
    const z = itemZone(scored ? { x: 180 + i * 72, y: 504, w: 72, h: 72 } : { x: CW / 2 - 170 + i * 170 - 80, y: 300 - 80, w: 160, h: 160 });
    q.position.set(z.x, z.z, 0.0016);
    q.userData.size = z.w;
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
  private lastHalf = false;

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
    // (the run is its own quad now: the old combo canvas stays hidden)
    this.comboMesh.visible = false;
    // (the page object is rebuilt only when the display changes: the same one, the same count and stars, is no change)
    // (the count-in's number is its own: the page only cares whether there is one)
    if (p === this.page && d.count > 0 === this.lastCount > 0 && (d.stars === this.lastStars || !!d.result) && !(p.body === 'song' && d.map && !this.sig)) return;
    this.lastCount = d.count;
    this.lastStars = d.stars;
    const sig = [p.id, p.title, p.line, d.count > 0, d.stars, d.gold, d.code, d.best?.run, d.best?.better, d.map?.beats ?? 0, d.result ? 'r' : '', p.card ? `${p.card.name}|${p.card.best}|${p.card.grade}` : '', p.band ? `${p.band.code}|${p.band.players}` : '', p.body === 'pause' ? `${d.score}` : '', p.items.map((i) => `${i.id}|${i.label}|${i.sub}|${i.on}|${i.off}|${i.stars}|${i.grade ?? ''}`).join(',')].join('~');
    if (sig === this.sig) return;
    this.sig = sig;
    if (p.id !== this.pageId) {
      this.pageId = p.id;
      this.fx.sweep();
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

  /**
   * The panel's handle, under it as on a visionOS window: a grab bar (pinch it and move the panel anywhere; it stays
   * there and keeps facing you) and a close dot that folds the panel into a small Menu pill, which brings it back.
   * In the panel's parent frame, following the panel.
   */
  readonly handle = new Group();
  private grabBar!: Mesh;
  private closeDot!: Mesh;
  private pill!: Mesh;
  hidden = false;
  private userAt: Vector3 | null = null;
  private grabK = 0;
  private closeK = 0;
  private pillK = 0;
  private buildHandle(): void {
    const tex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const t = new CanvasTexture(c);
      t.colorSpace = SRGBColorSpace;
      const redraw = () => {
        const g = c.getContext('2d')!;
        g.clearRect(0, 0, w, h);
        draw(g);
        t.needsUpdate = true;
      };
      redraw();
      whenFonts(redraw);
      return t;
    };
    const mat = (t: CanvasTexture) => new MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false });
    // the bar: a soft white pill
    this.grabBar = new Mesh(new PlaneGeometry(0.06, 0.012), mat(tex(240, 48, (g) => {
      rounded(g, 4, 10, 232, 28, 14);
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.fill();
    })));
    // the close dot: a small dark disc with a fine cross
    this.closeDot = new Mesh(new PlaneGeometry(0.016, 0.016), mat(tex(64, 64, (g) => {
      g.beginPath();
      g.arc(32, 32, 30, 0, Math.PI * 2);
      g.fillStyle = 'rgba(18,18,20,0.9)';
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(255,255,255,0.3)';
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineWidth = 5;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(22, 22);
      g.lineTo(42, 42);
      g.moveTo(42, 22);
      g.lineTo(22, 42);
      g.stroke();
    })));
    // the pill the panel folds into
    this.pill = new Mesh(new PlaneGeometry(0.075, 0.026), mat(tex(300, 104, (g) => {
      rounded(g, 4, 4, 292, 96, 48);
      g.fillStyle = 'rgba(18,18,20,0.9)';
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(255,255,255,0.22)';
      g.stroke();
      g.fillStyle = '#f4f4f2';
      g.font = `600 48px ${FONT}`;
      g.textBaseline = 'middle';
      const t = 'Menu';
      g.fillText(t, (300 - g.measureText(t).width) / 2, 54);
    })));
    const y = -PANEL.h / 2 - 0.02;
    this.grabBar.position.set(0, y, 0.002);
    this.closeDot.position.set(-0.05, y, 0.002);
    this.pill.position.set(0, y + 0.01, 0.002);
    this.pill.visible = false;
    for (const m of [this.grabBar, this.closeDot, this.pill]) m.renderOrder = 9;
    this.handle.name = 'PanelHandle';
    this.handle.add(this.grabBar, this.closeDot, this.pill);
  }
  /** Where the handle's parts are, in the world. */
  grabAt(out: Vector3): Vector3 {
    return this.grabBar.getWorldPosition(out);
  }
  closeAt(out: Vector3): Vector3 {
    return this.closeDot.getWorldPosition(out);
  }
  pillAt(out: Vector3): Vector3 {
    return this.pill.getWorldPosition(out);
  }
  /** How lit each part is under a finger (0..1). */
  handleHover(grab: number, close: number, pill: number): void {
    this.grabK = grab;
    this.closeK = close;
    this.pillK = pill;
  }
  /** Fold the panel away into its pill, or bring it back. */
  setHidden(on: boolean): void {
    if (on === this.hidden) return;
    this.hidden = on;
    this.root.visible = !on;
    if (!on) this.grow = 0;
  }
  /** Put the panel at `at` (its parent's frame: the kit's), turned to face you; null: back where it stands by itself. */
  moveTo(at: Vector3 | null): void {
    this.userAt = at ? (this.userAt ?? new Vector3()).copy(at) : null;
    this.place();
  }
  get movedTo(): Vector3 | null {
    return this.userAt;
  }

  update(dt: number): void {
    this.handle.position.copy(this.root.position);
    this.handle.quaternion.copy(this.root.quaternion);
    this.grabBar.visible = this.closeDot.visible = !this.hidden;
    this.pill.visible = this.hidden;
    (this.grabBar.material as MeshBasicMaterial).opacity = 0.55 + 0.45 * this.grabK;
    this.grabBar.scale.setScalar(1 + 0.12 * this.grabK);
    (this.closeDot.material as MeshBasicMaterial).opacity = 0.7 + 0.3 * this.closeK;
    this.closeDot.scale.setScalar(1 + 0.15 * this.closeK);
    this.pill.scale.setScalar(1 + 0.06 * this.pillK);
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
    this.animateScore(dt);
    this.fx.update(dt);
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
    // a night stage: deep indigo to plum, a faint floor grid, a neon edge with corner brackets
    stage(g, CW, CH, 40);
    g.fillStyle = 'rgba(90,69,150,0.55)';
    g.fillRect(32, 166, CW - 64, 2);
    g.textBaseline = 'alphabetic';
    // the header: the title, and the line under it
    const hasBack = p.items.some((i) => i.id === 'back' && i.y < 120);
    const tx = hasBack ? 148 : 32;
    const right = Math.min(CW - 32, ...p.items.filter((i) => i.y < 140 && i.x > 300).map((i) => i.x - 16));
    fit(g, p.title, '900', p.id === 'main' ? 76 : 64, 48, right - tx);
    g.font = `italic ${g.font}`;
    g.fillStyle = NEON.ink;
    g.fillText(p.id === 'main' ? p.title.toUpperCase() : p.title, tx, 88);
    if (p.line) {
      g.fillStyle = MUTED;
      fit(g, p.line, '400', 48, 48, right - tx);
      g.fillText(p.line, tx, 138);
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
      // how to play what's on the desk, large (two lines if it needs them)
      g.fillStyle = INK;
      const words = p.how.split(' ');
      g.font = `600 56px ${FONT}`;
      if (g.measureText(p.how).width > CW - 64) {
        const half = Math.ceil(words.length / 2);
        const a = words.slice(0, half).join(' ');
        const b = words.slice(half).join(' ');
        fit(g, a.length > b.length ? a : b, '600', 56, 48, CW - 64);
        g.fillText(a, 32, 232);
        g.fillText(b, 32, 296);
      } else {
        fit(g, p.how, '600', 56, 48, CW - 64);
        g.fillText(p.how, 32, 262);
      }
    }
    if (p.body === 'songs' && p.card) this.drawSongCard(g, p.card);
    if (p.body === 'pause') this.drawPause(g, d);
    if (p.body === 'band' && p.band) this.drawBand(g, p.band);
    // (the instruments' pictures are drawn on their cards: one fixed box each, never a 3D model standing off the panel)
    this.noPics = false;
    p.items.forEach((it) => this.drawItem(g, it));
    this.tex.needsUpdate = true;
    if (false as boolean) {
      const cards = p.items
        .filter((it) => it.kind === 'card' && it.id.startsWith('inst:'))
        .map((it) => {
          // (in the same box the card keeps for its picture: it never reaches the name or the card's edge)
          // (centred over where the card keeps its picture, above its name)
          const S = Math.min(it.h * 0.58, it.w * 0.8);
          // (a little high: the model stands up off the tilted panel, so it reads lower than its footprint)
          return { id: it.id.slice(5), x: ((it.x + it.w / 2) / CW - 0.5) * PANEL.w, y: (0.5 - (it.y + S * 0.42) / CH) * PANEL.h };
        });
      this.minis.layout(cards, -this.root.rotation.x);
    } else this.minis.hide();
  }

  private drawSong(g: CanvasRenderingContext2D, d: Display): void {
    const X = 32;
    const R = CW - 32;
    // (the count-in's number is drawn on its own canvas)
    if (d.count > 0) return;
    // (the instrument that's out, named over its picture in the strip)
    const out = this.page?.items.find((i) => i.kind === 'card' && i.on && i.sub);
    if (out?.sub) {
      g.font = body(48, 700);
      g.fillStyle = NEON.ink;
      const w = g.measureText(out.sub).width;
      g.fillText(out.sub, Math.max(X, Math.min(1088 - w, out.x + (out.w - w) / 2)), 666);
    }
    // the progress track (its fill is a mesh); each solo a red stretch on it, named above
    g.fillStyle = '#2a2927';
    rounded(g, X, 488, R - X, 16, 8);
    g.fill();
    const m = d.map;
    if (m && m.beats > 0) {
      const at = (b: number) => X + ((R - X) * b) / m.beats;
      g.font = `600 48px ${FONT}`;
      for (const [a, z] of m.wild) {
        g.fillStyle = 'rgba(255,95,79,0.9)';
        g.fillRect(at(a), 488, at(z) - at(a), 16);
        g.fillStyle = RED;
        const t = 'Solo';
        g.fillText(t, Math.max(X, Math.min(R - g.measureText(t).width, (at(a) + at(z) - g.measureText(t).width) / 2)), 470);
      }
    }
  }

  private drawCount(n: number): void {
    const g = this.countCanvas.getContext('2d')!;
    g.clearRect(0, 0, 256, 256);
    // the count-in: a chunky italic number, cyan into magenta, glowing
    g.font = display(230, 900);
    const t = String(n);
    g.textBaseline = 'alphabetic';
    const x = (256 - g.measureText(t).width) / 2;
    g.lineJoin = 'round';
    g.lineWidth = 12;
    g.strokeStyle = '#1a0b2e';
    g.strokeText(t, x, 214);
    glowText(g, t, x, 214, vgrad(g, 40, 214, NEON.cyan, NEON.magenta), NEON.magenta, 24);
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

  /** The HUD while you play, the results' reveal, the callout: all animated here (each quad redrawn on change). */
  private animateScore(dt: number): void {
    const d = this.shown;
    const pid = this.page?.id;
    const playing = pid === 'song' && !!d && d.count <= 0 && d.score !== undefined && !this.hidden;
    // the run: its count in the multiplier's colour (gold in the spotlight), the chip, "in a row"
    const combo = playing && d ? (d.combo ?? 0) : 0;
    this.run.mesh.visible = combo >= 4;
    const mult = d?.mult ?? 1;
    const spot = !!d?.spot?.active;
    if (mult > this.lastMult) this.hudPulse = 1;
    this.lastMult = mult;
    this.hudPulse = Math.max(0, this.hudPulse - dt / 0.15);
    if (this.run.mesh.visible) {
      const key = `${combo}|${mult}|${spot}`;
      if (key !== this.runKey) {
        this.runKey = key;
        drawRun(this.run.g, combo, mult, spot);
        this.run.tex.needsUpdate = true;
      }
      this.run.mesh.scale.set((this.run.mesh.userData.size as number) * (1 + 0.06 * this.hudPulse), (this.run.mesh.userData.h as number) * (1 + 0.06 * this.hudPulse), 1);
    }
    // the score: it rolls up; accuracy under it; how you stand against your best
    this.hud.mesh.visible = playing;
    if (playing && d) {
      const target = d.score ?? 0;
      if (this.hudShown < 0 || target < this.hudShown) this.hudShown = target;
      this.hudShown += (target - this.hudShown) * Math.min(1, dt * 14);
      if (target - this.hudShown < 1) this.hudShown = target;
      this.hudT -= dt;
      const ghost = d.ghost === null || d.ghost === undefined ? null : Math.round(d.ghost / 10) * 10;
      const key = `${Math.round(this.hudShown)}|${Math.round((d.acc ?? 1) * 1000)}|${ghost}`;
      if (key !== this.hudKey && this.hudT <= 0) {
        this.hudKey = key;
        this.hudT = 1 / 30;
        drawHud(this.hud.g, Math.round(this.hudShown), d.acc ?? 1, ghost);
        this.hud.tex.needsUpdate = true;
      }
    } else this.hudShown = -1;
    // the spotlight: its four segments, what to do
    const sp = playing ? d?.spot : undefined;
    this.spotQ.mesh.visible = !!sp;
    if (sp) {
      const key = `${Math.round(sp.meter * 40)}|${sp.active}|${sp.ready}`;
      if (key !== this.spotKey) {
        this.spotKey = key;
        drawSpot(this.spotQ.g, sp.meter, sp.active, sp.ready);
        this.spotQ.tex.needsUpdate = true;
      }
      // (ready: it breathes, asking for your hands)
      (this.spotQ.mesh.material as MeshBasicMaterial).opacity = sp.ready ? 0.75 + 0.25 * Math.sin(performance.now() / 160) : 1;
    }
    // the results: the score counts up while the ring fills in Ink; the grade stamps (the ring takes its colour, a
    // ring of light runs out); the line over the score and the details fade in
    const r = pid === 'results' ? d?.result : null;
    const on = !!r && r.t > 0;
    for (const q of [this.ring, this.scoreQ, this.brow, this.details]) q.mesh.visible = on;
    const stamped = on && !!r && r.stampT >= 0 && r.t >= r.stampT;
    this.grade.mesh.visible = stamped;
    if (on && r) {
      const ease = (u: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, u)), 3);
      const ks = ease((r.t - 0.15) / 1.2);
      const kr = ease((r.t - 0.25) / 1.2);
      const ink = GRADE_INK[r.letter] ?? INK2;
      const key = `${Math.round(r.score * ks)}|${Math.round(r.accuracy * kr * 1000)}|${stamped}`;
      if (key !== this.resKey) {
        this.resKey = key;
        drawCountUp(this.scoreQ.g, Math.round(r.score * ks));
        this.scoreQ.tex.needsUpdate = true;
        drawRing(this.ring.g, r.accuracy * kr, stamped ? (GRADE_PAIR[r.letter] ?? null) : null);
        this.ring.tex.needsUpdate = true;
        if (stamped) {
          drawGrade(this.grade.g, r.letter);
          this.grade.tex.needsUpdate = true;
        }
      }
      // (the score settles with a little bump as it lands)
      const bump = r.t > 1.35 && r.t < 1.49 ? Math.sin(((r.t - 1.35) / 0.14) * Math.PI) : 0;
      this.scoreQ.mesh.scale.set((this.scoreQ.mesh.userData.size as number) * (1 + 0.04 * bump), (this.scoreQ.mesh.userData.h as number) * (1 + 0.04 * bump), 1);
      if (stamped) {
        const u = Math.min(1, (r.t - r.stampT) / 0.22);
        const low = r.letter === 'D';
        // a stamp: in from 1.8× with a 6 % overshoot (a D just fades in from 1.1×)
        const sc = low ? 1.1 - 0.1 * u : u < 1 ? 1.8 - 0.8 * u - 0.06 * Math.sin(u * Math.PI) * 1.6 : 1;
        this.grade.mesh.scale.set((this.grade.mesh.userData.size as number) * sc, (this.grade.mesh.userData.h as number) * sc, 1);
        (this.grade.mesh.material as MeshBasicMaterial).opacity = low ? Math.min(1, (r.t - r.stampT) / 0.2) : Math.min(1, u * 4);
        const pu = Math.min(1, (r.t - r.stampT) / 0.3);
        const pulse = 1 + 0.03 * Math.sin(pu * Math.PI);
        this.ring.mesh.scale.set((this.ring.mesh.userData.size as number) * pulse, (this.ring.mesh.userData.h as number) * pulse, 1);
      }
      // the line over the score at 2.05 s, the details at 2.15 (the new best chip pops at 2.65)
      const banner = r.allPerfect ? 'ALL PERFECT!!' : r.fullCombo ? 'FULL COMBO!' : '';
      const browKey = `${r.better}|${r.prev}|${r.score}|${banner}`;
      if (browKey !== this.browKey) {
        this.browKey = browKey;
        drawBrow(this.brow.g, r.better && !banner, r.prev, r.score, banner);
        this.brow.tex.needsUpdate = true;
      }
      const pop = r.better && r.t >= 2.65 ? Math.min(1, (r.t - 2.65) / 0.24) : 1;
      const ps = r.better ? (pop < 0.6 ? 0.8 + (0.25 * pop) / 0.6 : 1.05 - 0.05 * ((pop - 0.6) / 0.4)) : 1;
      (this.brow.mesh.material as MeshBasicMaterial).opacity = r.better ? (r.t >= 2.65 ? Math.min(1, pop * 3) : 0) : Math.min(1, Math.max(0, (r.t - 2.05) / 0.2));
      this.brow.mesh.scale.set((this.brow.mesh.userData.size as number) * ps, (this.brow.mesh.userData.h as number) * ps, 1);
      const dk = `${r.hook}|${r.letter}|${r.perfect}|${r.good}|${r.miss}|${r.maxCombo}|${r.better}`;
      if (dk !== this.detKey) {
        this.detKey = dk;
        drawDetails(this.details.g, r);
        this.details.tex.needsUpdate = true;
      }
      (this.details.mesh.material as MeshBasicMaterial).opacity = Math.min(1, Math.max(0, (r.t - 2.15) / 0.2));
    } else this.resKey = this.browKey = this.detKey = '';
    // the stamp: the shockwave runs out from the medal, the panel gives a little under it
    if (this.stampAge < 0.4) {
      this.stampAge += dt;
      const u = Math.min(1, this.stampAge / 0.3);
      const hard = !!r && (r.letter === 'S' || r.letter === 'A' || r.letter === 'B' || r.letter === 'C');
      this.shock.visible = u < 1 && hard;
      const rr = (this.shock.userData.r as number) * (1 + (40 / 210) * u);
      this.shock.scale.set(rr, rr, 1);
      const sm = this.shock.material as MeshBasicMaterial;
      sm.color.set(GRADE_INK[r?.letter ?? 'S'] ?? INK2);
      sm.opacity = 0.7 * (1 - u);
      const give = r?.letter === 'S' || r?.letter === 'A' ? 0.012 : hard ? 0.007 : 0;
      this.root.scale.setScalar(1 - give * Math.sin(Math.min(1, this.stampAge / 0.24) * Math.PI));
    } else {
      this.shock.visible = false;
      if (this.root.scale.x !== 1) this.root.scale.setScalar(1);
    }
    // the callout: pops up, holds, floats off
    this.callout.mesh.visible = this.calloutAge < 1.2 && !this.hidden;
    if (this.callout.mesh.visible) {
      this.calloutAge += dt;
      const a = this.calloutAge;
      const popc = a < 0.12 ? 0.6 + 0.5 * (a / 0.12) : a < 0.2 ? 1.1 - 0.1 * ((a - 0.12) / 0.08) : 1;
      this.callout.mesh.scale.set((this.callout.mesh.userData.size as number) * popc, (this.callout.mesh.userData.h as number) * popc, 1);
      (this.callout.mesh.material as MeshBasicMaterial).opacity = a > 0.8 ? Math.max(0, 1 - (a - 0.8) / 0.4) : 1;
      this.callout.mesh.position.y = (this.callout.mesh.userData.y as number) + 0.01 * Math.max(0, a - 0.5);
    }
  }

  private drawResults(g: CanvasRenderingContext2D, d: Display): void {
    // a scored song: the page holds only the medal's three star slots (everything else is its own quad)
    if (d.result) {
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.arc(216 + i * 72, 540, 30, 0, Math.PI * 2);
        g.lineWidth = 3;
        g.strokeStyle = 'rgba(255,255,255,0.25)';
        g.stroke();
      }
      for (let i = 0; i < Math.max(0, d.stars); i++) star(g, 216 + i * 72, 540, 30, true, d.gold);
      return;
    }
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
    // a song: a slanted row, its name, its best grade at the right; the chosen one white; More songs, quiet
    const chosen = !!it.on && !it.off;
    slant(g, it.x, it.y, it.w, it.h);
    if (chosen) {
      g.fillStyle = '#f6f2ff';
      g.fill();
    } else {
      g.fillStyle = it.off ? 'rgba(40,20,80,0.3)' : 'rgba(52,26,98,0.7)';
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(90,69,150,0.6)';
      g.stroke();
    }
    const k = Math.round(it.h * 0.176);
    const right = it.x + it.w - k - 24;
    let gx = right;
    if (it.grade && !it.off) {
      g.font = display(52, 900);
      const gw = g.measureText(it.grade).width;
      if (it.grade === '—') g.fillStyle = chosen ? '#8a7fae' : NEON.dim;
      else {
        const [ga, gb] = GRADE_PAIR[it.grade] ?? GRADE_PAIR.D;
        g.fillStyle = chosen ? gb : vgrad(g, it.y + 14, it.y + 70, ga, gb);
      }
      g.fillText(it.grade, right - gw, it.y + it.h / 2 + 19);
      gx = right - gw - 24;
    } else if (it.sub) {
      g.font = body(48, 500);
      const sw = g.measureText(it.sub).width;
      g.fillStyle = MUTED;
      g.fillText(it.sub, right - sw, it.y + it.h / 2 + 17);
      gx = right - sw - 24;
    }
    g.fillStyle = it.off ? NEON.dim : chosen ? '#1a0b2e' : NEON.ink;
    fit(g, it.label, '800', 56, 48, gx - (it.x + k + 24));
    g.font = `italic ${g.font}`;
    g.fillText(it.label, it.x + k + 24, it.y + it.h / 2 + 19);
  }


  /** The chosen song beside the list: its name (two lines if it needs them), what it is, your best and its grade. */
  private drawSongCard(g: CanvasRenderingContext2D, c: { name: string; meta: string; stars: number; grade: string; best: number }): void {
    const x = 32 + 2 * (421.3 + 16);
    const w = 421.3;
    const room = w - 44;
    rounded(g, x, 176, w, 256, 24);
    g.fillStyle = 'rgba(52,26,98,0.7)';
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(90,69,150,0.6)';
    g.stroke();
    const name = c.name.toUpperCase();
    g.font = display(52, 800);
    let lines = [name];
    if (g.measureText(name).width > room) {
      const words = name.split(' ');
      let best = 1;
      let bw = Infinity;
      for (let k = 1; k < words.length; k++) {
        const a = g.measureText(words.slice(0, k).join(' ')).width;
        const b = g.measureText(words.slice(k).join(' ')).width;
        if (Math.max(a, b) < bw) {
          bw = Math.max(a, b);
          best = k;
        }
      }
      lines = words.length > 1 ? [words.slice(0, best).join(' '), words.slice(best).join(' ')] : [name];
    }
    const longest = lines.reduce((a, b) => (g.measureText(a).width > g.measureText(b).width ? a : b));
    fit(g, longest, '800', 52, 48, room);
    g.font = `italic ${g.font}`;
    g.fillStyle = NEON.ink;
    lines.forEach((l, k) => g.fillText(l, x + 28, 236 + k * 52));
    const my = lines.length > 1 ? 330 : 286;
    g.fillStyle = MUTED;
    fit(g, c.meta, '500', 48, 48, lines.length > 1 && c.grade ? room - 130 : room);
    g.fillText(c.meta, x + 28, my);
    // your best, and its grade large at the right
    g.font = display(48, 800);
    g.fillStyle = MUTED;
    g.fillText('BEST', x + 28, 404);
    const bw2 = g.measureText('BEST ').width;
    g.font = display(52, 900);
    g.fillStyle = NEON.ink;
    g.fillText(c.best >= 0 ? c.best.toLocaleString('en-GB') : '—', x + 28 + bw2 + 6, 404);
    if (c.grade) {
      const [ga, gb] = GRADE_PAIR[c.grade] ?? GRADE_PAIR.D;
      g.font = display(110, 900);
      g.textAlign = 'right';
      g.fillStyle = vgrad(g, 330, 414, ga, gb);
      g.fillText(c.grade, x + w - 30, 414);
      g.textAlign = 'left';
    }
  }

  /** Paused: your score so far and where the song stopped. */
  private drawPause(g: CanvasRenderingContext2D, d: Display): void {
    if (d.score === undefined) return;
    g.fillStyle = INK;
    g.font = `700 96px ${FONT}`;
    const t = (d.score ?? 0).toLocaleString('en-GB');
    g.fillText(t, 32, 360);
    const w = g.measureText(t).width;
    g.fillStyle = MUTED;
    g.font = `500 48px ${FONT}`;
    g.fillText('so far', 32 + w + 20, 360);
    const a = `${((d.acc ?? 1) * 100).toFixed(1)}%`;
    g.fillText(a, CW - 32 - g.measureText(a).width, 360);
    g.fillStyle = '#2a2927';
    rounded(g, 32, 488, CW - 64, 16, 8);
    g.fill();
    g.fillStyle = INK;
    rounded(g, 32, 488, Math.max(16, (CW - 64) * Math.min(1, d.progress ?? 0)), 16, 8);
    g.fill();
  }

  /** Play together: the band's code, large; who's in (four seats). */
  private drawBand(g: CanvasRenderingContext2D, b: { code: string; players: number }): void {
    if (b.code) {
      g.fillStyle = MUTED;
      g.font = `500 48px ${FONT}`;
      g.fillText('Band code', 32, 236);
      g.fillStyle = INK;
      g.font = `700 150px ${FONT}`;
      let x = 32;
      for (const ch of b.code) {
        g.fillText(ch, x, 400);
        x += g.measureText(ch).width + 12;
      }
      g.fillStyle = MUTED;
      g.font = `400 48px ${FONT}`;
      g.fillText('Friends type it on the Thump page', 32, 470);
    } else {
      g.fillStyle = INK;
      g.font = `600 56px ${FONT}`;
      g.fillText('Up to four of you, one song, one beat', 32, 300);
    }
    // (the four seats, once there's a band)
    if (!b.code) return;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.arc(906.7 + 48 + i * 108, 348, 44, 0, Math.PI * 2);
      if (i < b.players && b.code) {
        g.fillStyle = INK;
        g.fill();
      } else {
        g.lineWidth = 3;
        g.strokeStyle = 'rgba(255,255,255,0.22)';
        g.stroke();
      }
    }
    if (b.code) {
      g.fillStyle = MUTED;
      g.font = `500 48px ${FONT}`;
      g.fillText(`${b.players} of 4`, 906.7, 470);
    }
  }

  private drawItem(g: CanvasRenderingContext2D, it: Item): void {
    if (it.kind === 'row') return this.drawRow(g, it);
    // (words with no box: a value between a stepper's arrows; a row's name)
    if (it.kind === 'text') {
      g.fillStyle = NEON.ink;
      fit(g, it.label, '700', 56, 48, it.w);
      g.fillText(it.label, it.x + (it.w - g.measureText(it.label).width) / 2, it.y + it.h / 2 + 20);
      return;
    }
    if (it.kind === 'label') {
      g.fillStyle = MUTED;
      fit(g, it.label, '700', 48, 48, it.w);
      g.fillText(it.label, it.x, it.y + it.h / 2 + 17);
      return;
    }
    // the tiers: the one hot primary; white secondaries (back, menu, next); everything else outlined; choices slant
    // the same 10 degrees and turn white when chosen; a level lights in its own colour
    const level = it.id.startsWith('level:') ? LEVEL_INK[it.id.slice(6)] : undefined;
    const secondary = it.kind === 'button' && SECONDARY.has(it.id);
    const tertiary = (it.kind === 'button' && !secondary) || it.kind === 'ghost';
    // (a switch shows its state on the switch, never as a white chosen plate)
    const chosen = !!it.on && !it.off && it.kind !== 'toggle';
    const rounded2 = it.kind === 'toggle' || it.kind === 'hero' || it.kind === 'tile';
    const path = () => (rounded2 ? rounded(g, it.x, it.y, it.w, it.h, 24) : slant(g, it.x, it.y, it.w, it.h));
    let ink: string = NEON.ink;
    // (the back tile: a white plate with a dark chevron)
    if (it.id === 'back' && it.w <= 100) {
      slant(g, it.x, it.y, it.w, it.h);
      g.fillStyle = it.off ? NEON.dim : '#f6f2ff';
      g.fill();
      g.strokeStyle = '#1a0b2e';
      g.lineWidth = 8;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(it.x + 58, it.y + 26);
      g.lineTo(it.x + 38, it.y + 48);
      g.lineTo(it.x + 58, it.y + 70);
      g.stroke();
      return;
    }
    path();
    if (it.kind === 'play' && !it.off) {
      g.shadowColor = NEON.magenta;
      g.shadowBlur = 12;
      g.fillStyle = hgrad(g, it.x, it.x + it.w, ['#ff3ea5', '#ff6a6a', '#ff9a3c']);
      g.fill();
      g.shadowBlur = 0;
      ink = '#ffffff';
    } else if (it.off) {
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(90,69,150,0.45)';
      g.stroke();
      ink = NEON.dim;
    } else if (level) {
      // a level: its colour at a fifth, or solid when it's the one
      g.fillStyle = chosen ? level : `${level}2e`;
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = level;
      g.stroke();
      ink = chosen ? '#12081f' : level;
    } else if (secondary || chosen) {
      g.fillStyle = '#f6f2ff';
      g.fill();
      ink = '#1a0b2e';
    } else if (tertiary) {
      g.lineWidth = 2;
      g.strokeStyle = '#5a4596';
      g.stroke();
      ink = '#d9cfff';
    } else {
      // a plate: chips, cards, tiles, switches' rows
      g.fillStyle = 'rgba(52,26,98,0.7)';
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(90,69,150,0.6)';
      g.stroke();
    }
    g.fillStyle = ink;
    // a switch: the setting's name, and its switch at the right
    if (it.kind === 'toggle') {
      fit(g, it.label, '700', 52, 48, it.w - 180);
      g.fillStyle = NEON.ink;
      g.fillText(it.label, it.x + 28, it.y + it.h / 2 + 18);
      const sx = it.x + it.w - 124;
      const sy = it.y + (it.h - 52) / 2;
      rounded(g, sx, sy, 96, 52, 26);
      g.fillStyle = it.on ? hgrad(g, sx, sx + 96, ['#ff3ea5', '#ff9a3c']) : 'rgba(255,255,255,0.12)';
      g.fill();
      g.beginPath();
      g.arc(it.on ? sx + 70 : sx + 26, sy + 26, 20, 0, Math.PI * 2);
      g.fillStyle = it.on ? '#ffffff' : MUTED;
      g.fill();
      return;
    }
    // the songs, large: a quiet wash, its picture to the right, the word and a line under it
    if (it.kind === 'hero') {
      g.save();
      rounded(g, it.x, it.y, it.w, it.h, 24);
      g.clip();
      const wash = g.createLinearGradient(it.x, it.y + it.h, it.x + it.w, it.y);
      wash.addColorStop(0, 'rgba(255,62,165,0.30)');
      wash.addColorStop(1, 'rgba(255,154,60,0.10)');
      g.fillStyle = wash;
      g.fillRect(it.x, it.y, it.w, it.h);
      g.restore();
      g.save();
      g.translate(it.x + it.w - 330, it.y + 40);
      if (it.icon && MENU_ICON[it.icon]) MENU_ICON[it.icon](g, 280, 'rgba(255,255,255,0.85)');
      g.restore();
      fit(g, it.label.toUpperCase(), '900', 96, 48, it.w - 420);
      g.font = `italic ${g.font}`;
      g.fillStyle = NEON.ink;
      g.fillText(it.label.toUpperCase(), it.x + 40, it.y + 384);
      if (it.sub) {
        g.fillStyle = MUTED;
        fit(g, it.sub, '500', 48, 48, it.w - 80);
        g.fillText(it.sub, it.x + 40, it.y + 444);
      }
      return;
    }
    // the instrument that's out, pictured, named
    if (it.kind === 'tile') {
      const pic = it.icon ? thumb(it.icon) : undefined;
      const S = Math.min(300, it.w - 56, it.h - 200);
      if (pic) g.drawImage(pic, it.x + (it.w - S) / 2, it.y + 24, S, S);
      g.fillStyle = NEON.ink;
      fit(g, it.label, '700', 56, 48, it.w - 56);
      g.fillText(it.label, it.x + 28, it.y + it.h - 76);
      if (it.sub) {
        g.fillStyle = MUTED;
        fit(g, it.sub, '500', 48, 48, it.w - 56);
        g.fillText(it.sub, it.x + 28, it.y + it.h - 22);
      }
      return;
    }
    if (it.kind === 'card' || it.icon) {
      // an instrument: its picture in a fixed box that never crosses the card's edge, its name beside it (a strip
      // card in a song: the picture alone)
      // (a card is a tile: its picture centred at the top, its name centred under it)
      const wide = false;
      const S = Math.min(it.h * (it.label ? 0.58 : 0.8), it.w * 0.8);
      const px0 = it.x + (it.w - S) / 2;
      const py0 = it.y + (it.label ? 14 : (it.h - S) / 2);
      g.save();
      g.translate(px0, py0);
      g.strokeStyle = SOFT;
      g.fillStyle = SOFT;
      g.lineWidth = 5;
      g.lineCap = 'round';
      const pic = it.icon && !(this.noPics && it.kind === 'card') ? thumb(it.icon) : undefined;
      if (it.icon && MENU_ICON[it.icon]) MENU_ICON[it.icon](g, S, 'rgba(255,255,255,0.78)');
      else if (pic) g.drawImage(pic, 0, 0, S, S);
      else if (it.icon && !(this.noPics && it.kind === 'card')) ICON[it.icon]?.(g, S);
      g.restore();
      g.fillStyle = ink;
      if (wide) {
        const lx = px0 + S + 16;
        // (on the desk: a small white tag at its top right)
        if (it.sub === 'On the desk') pill(g, it.x + it.w - 200, it.y + 14, 176, 56, '#f6f2ff', 'ON DESK', '#1a0b2e', body(44, 800));
        fit(g, it.label, '700', 52, 48, it.x + it.w - 22 - lx);
        g.fillStyle = ink;
        g.fillText(it.label, lx, it.y + it.h / 2 + 18);
        return;
      }
      if (it.kind === 'card') {
        if (!it.label) return;
        fit(g, it.label, '700', 52, 48, it.w - Math.round(it.h * 0.176) * 2 - 16);
        g.fillStyle = ink;
        g.fillText(it.label, it.x + (it.w - g.measureText(it.label).width) / 2, it.y + it.h - 26);
        return;
      }
    }
    if (it.kind === 'big') {
      fit(g, it.label, '700', 64, 48, it.w - 60 - (it.icon ? it.h * 0.6 : 0));
      g.fillText(it.label, it.x + 34, it.y + it.h / 2 + 4);
      if (it.sub) {
        g.fillStyle = it.off ? NEON.dim : MUTED;
        fit(g, it.sub, '500', 48, 48, it.w - 60 - (it.icon ? it.h * 0.6 : 0));
        g.fillText(it.sub, it.x + 34, it.y + it.h / 2 + 66);
      }
      return;
    }
    // chip, button, play: the label in the middle (a second line under it); upright, except the primary
    const lines = it.label.split('\n');
    // (record: a red dot before its word)
    const dotW = it.dot ? 40 : 0;
    const slack = Math.round(it.h * 0.176) * 2 + (it.kind === 'chip' ? 12 : 24);
    const px = fit(g, lines.reduce((a, b) => (a.length > b.length ? a : b)), it.kind === 'play' ? '900' : '700', it.kind === 'play' ? 64 : 52, 48, it.w - slack - dotW);
    if (it.kind === 'play') g.font = `italic ${g.font}`;
    g.fillStyle = ink;
    const cx = it.x + it.w / 2 + dotW / 2;
    const lh = px * 1.1;
    const subH = it.sub ? 62 : 0;
    const top = it.y + (it.h - (lines.length - 1) * lh - subH) / 2 + px * 0.35;
    if (it.dot) {
      const w0 = Math.max(...lines.map((t) => g.measureText(t).width));
      g.beginPath();
      g.arc(cx - w0 / 2 - 28, top - px * 0.32, 13, 0, Math.PI * 2);
      g.fillStyle = RED;
      g.fill();
      g.fillStyle = ink;
    }
    lines.forEach((t, j) => g.fillText(t, cx - g.measureText(t).width / 2, top + j * lh));
    if (it.sub) {
      g.fillStyle = it.off ? NEON.dim : it.kind === 'play' ? 'rgba(255,255,255,0.85)' : secondary || chosen ? '#4a3a6e' : MUTED;
      fit(g, it.sub, '500', 48, 48, it.w - Math.round(it.h * 0.176) * 2 - 16);
      g.fillText(it.sub, cx - g.measureText(it.sub).width / 2, top + (lines.length - 1) * lh + subH);
    }
  }

}
