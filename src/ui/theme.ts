/**
 * The panel's look (docs/UI-DIRECTION.md): flat graphite, plain rounded plates, one orange; Barlow Condensed upright for
 * titles; colour that means something (judgements,
 * levels, grades, the streak). Canvas 2D helpers only (no scene, no DOM beyond the context they are given).
 */
import { FONT } from './fonts.js';

/**
 * Thump's own colours (the icon's and the site's): a warm plum night, off-white ink, one hot red-orange for what you
 * hit and what you press, gold only for the best things (an S, all perfect). Nothing else carries colour except an
 * instrument's own light.
 */
export const BRAND = {
  plum: '#efe6d2',
  plum2: '#e6dbc3',
  plum3: '#ffe24a',
  line: '#1d1d1b',
  ink: '#1d1d1b',
  ink2: '#4a4640',
  ink3: '#8a8277',
  hot: '#ff48b0',
  hotInk: '#1d1d1b',
  gold: '#c98a00',
} as const;

/** A token's colour at `a` opacity, as a CSS colour (canvas fills over the room). */
export function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
/** A token's colour as a number (three.js). */
export const hexNum = (hex: string): number => parseInt(hex.slice(1), 16);

export const NEON = {
  bg0: '#efe6d2',
  bg1: '#e6dbc3',
  ink: '#1d1d1b',
  muted: '#4a4640',
  dim: '#8a8277',
  cyan: '#3255a4',
  magenta: '#ff48b0',
  violet: '#3255a4',
  green: '#2f8a4c',
  gold: '#c98a00',
  orange: '#e0622b',
  red: '#d8342b',
  plate: 'rgba(239,230,210,0.97)',
} as const;

/** Each judgement's colour. */
export const JUDGE = { perfect: NEON.cyan, good: NEON.green, miss: NEON.red } as const;
/** Each level's colour. */
export const LEVEL_INK: Record<string, string> = { easy: NEON.green, normal: NEON.gold, hard: NEON.red };
/** Each grade's pair (a gradient, light to deep). */
export const GRADE_PAIR: Record<string, [string, string]> = {
  S: ['#ff48b0', '#ff48b0'],
  A: ['#3255a4', '#3255a4'],
  B: ['#1d1d1b', '#1d1d1b'],
  C: ['#4a4640', '#4a4640'],
  D: ['#8a8277', '#8a8277'],
};
/** The panel's surfaces (see docs/UI-DIRECTION.md): flat graphite, a hairline, one orange. */
/** The flyer (docs/flyer-mockup.html): cream paper, two riso inks (pink, blue) that overprint, ink black, a yellow
 * highlighter for what's chosen. */
export const UI = { bg: '#efe6d2', raised: '#e6dbc3', sel: '#ffe24a', line: '#1d1d1b', ink: '#1d1d1b', ink2: '#4a4640', ink3: '#8a8277', accent: '#ff48b0', accentInk: '#1d1d1b', blue: '#3255a4' } as const;
/** The three tiers of what you press: the one hot primary, white secondaries, outlined tertiaries. */
export const SECONDARY = new Set(['back', 'nav:main', 'next', 'again:easy', 'pause', 'nav:settings']);
/** Each instrument's own light (the panel's edge flashes it as you play). */
export const INST_LIGHT: Record<string, number> = { drums: 0xffb347, piano: 0xf3ead8, guitar: 0xff7a2f, handpan: 0xc9a26b, marimba: 0xd0485a, congas: 0xe0b07a };
/** The streak's ladder: ×2 cyan, ×3 green, ×4 gold. */
export const MULT_PAIR: [string, string][] = [
  ['#1d1d1b', '#1d1d1b'],
  ['#1d1d1b', '#1d1d1b'],
  ['#3255a4', '#3255a4'],
  ['#ff48b0', '#ff48b0'],
  ['#c98a00', '#c98a00'],
];

/** The display face: Barlow Condensed (the site's too), bold and upright, for titles, buttons and numbers. */
export const display = (px: number, weight = 800) => `${Math.min(800, weight)} ${px}px 'Bricolage Grotesque', 'Barlow Condensed', ${FONT}`;
export const body = (px: number, weight = 600) => `${weight} ${px}px ${FONT}`;

/** A slanted plate (a parallelogram leaning right by `k` px), as a path. */
export function slant(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, _k?: number): void {
  // (no slant any more: a plain rounded rectangle, like a button on a piece of gear)
  void _k;
  const r = Math.min(14, h / 4, w / 4);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** A vertical gradient between two colours over [y0, y1]. */
export function vgrad(g: CanvasRenderingContext2D, y0: number, y1: number, a: string, b: string): CanvasGradient {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  gr.addColorStop(0, a);
  gr.addColorStop(1, b);
  return gr;
}
export function hgrad(g: CanvasRenderingContext2D, x0: number, x1: number, stops: readonly string[]): CanvasGradient {
  const gr = g.createLinearGradient(x0, 0, x1, 0);
  stops.forEach((c, i) => gr.addColorStop(i / Math.max(1, stops.length - 1), c));
  return gr;
}

/** The panel: a deep indigo to plum, a plain solid edge. (No wallpaper: it floats over a real desk; light comes
 * from your playing, see the edge flash.) */
export function stage(g: CanvasRenderingContext2D, w: number, h: number, r = 40): void {
  rr(g, 4, 4, w - 8, h - 8, r);
  g.fillStyle = '#efe6d2';
  g.fill();
  // (the paper's faint dot grain, and one blue halftone moon in the top corner: the flyer's print)
  g.save();
  rr(g, 4, 4, w - 8, h - 8, r);
  g.clip();
  g.fillStyle = paperDots(g);
  g.fillRect(0, 0, w, h);
  halftone(g, w - 120, 40, 230, '#3255a4');
  g.restore();
  g.lineWidth = 4;
  g.strokeStyle = '#1d1d1b';
  g.stroke();
}

/** Text, flat ink on paper (no glow, no shadow). */
export function glowText(g: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string | CanvasGradient, _glow: string, _blur = 18): void {
  void _glow;
  void _blur;
  g.fillStyle = fill;
  g.fillText(text, x, y);
}

/** Display text printed in two inks, slightly off register: pink under, blue over, overprinting (multiply). */
export function riso(g: CanvasRenderingContext2D, text: string, x: number, y: number, top = '#3255a4', under = '#ff48b0', off = 4): void {
  g.save();
  g.fillStyle = under;
  g.fillText(text, x + off, y + off * 0.75);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = top;
  g.fillText(text, x, y);
  g.restore();
}

let dotPat: CanvasPattern | null = null;
/** The paper's grain: a faint dot every 10 px. */
function paperDots(g: CanvasRenderingContext2D): CanvasPattern | string {
  if (dotPat) return dotPat;
  if (typeof document === 'undefined') return '#efe6d2';
  const c = document.createElement('canvas');
  c.width = c.height = 10;
  const t = c.getContext('2d')!;
  t.fillStyle = 'rgba(29,29,27,0.07)';
  t.beginPath();
  t.arc(5, 5, 1.6, 0, Math.PI * 2);
  t.fill();
  dotPat = g.createPattern(c, 'repeat');
  return dotPat ?? '#efe6d2';
}

/** A halftone disc: dots on a grid, in one ink, overprinting what's under it. */
export function halftone(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, ink: string, step = 16): void {
  g.save();
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = ink;
  g.globalAlpha = 0.85;
  for (let y = cy - r; y <= cy + r; y += step)
    for (let x = cx - r; x <= cx + r; x += step) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > r) continue;
      g.beginPath();
      g.arc(x, y, step * 0.36, 0, Math.PI * 2);
      g.fill();
    }
  g.restore();
}

/** Chromatic display text: a cyan and a magenta ghost either side, a white-to-pink fill on top (a "PERFECT!" banner). */
export function chroma(g: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, a: string = NEON.cyan, b: string = NEON.magenta): void {
  g.font = display(px, 900);
  riso(g, text, x, y, a === NEON.cyan ? '#3255a4' : a, b === NEON.magenta ? '#ff48b0' : b);
}

/** A rounded rectangle path. */
export function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + k, y);
  g.arcTo(x + w, y, x + w, y + h, k);
  g.arcTo(x + w, y + h, x, y + h, k);
  g.arcTo(x, y + h, x, y, k);
  g.arcTo(x, y, x + w, y, k);
  g.closePath();
}

/** A pill badge: a colour (or gradient) fill, dark or light text centred. */
export function pill(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string | CanvasGradient, text: string, ink: string, font: string, glow?: string): void {
  rr(g, x, y, w, h, h / 2);
  // (no glow: flat, like the rest)
  void glow;
  g.fillStyle = fill;
  g.fill();
  g.shadowBlur = 0;
  g.font = font;
  g.fillStyle = ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x + w / 2, y + h / 2 + 2);
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
}
