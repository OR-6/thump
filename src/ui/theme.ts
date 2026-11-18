/**
 * The panel's look: a night stage. Deep indigo to plum, a faint grid, a neon edge running cyan to magenta with corner
 * brackets; bold italic display type; slanted plates for what you press; colour that means something (judgements,
 * levels, grades, the streak). Canvas 2D helpers only (no scene, no DOM beyond the context they are given).
 */
import { FONT } from './fonts.js';

/**
 * Thump's own colours (the icon's and the site's): a warm plum night, off-white ink, one hot red-orange for what you
 * hit and what you press, gold only for the best things (an S, all perfect). Nothing else carries colour except an
 * instrument's own light.
 */
export const BRAND = {
  plum: '#1d0b2c',
  plum2: '#26103a',
  plum3: '#341650',
  line: '#3d2357',
  ink: '#f6efe4',
  ink2: '#b9aac9',
  ink3: '#7d6b92',
  hot: '#ff4b2b',
  hotInk: '#1d0b2c',
  gold: '#ffc93c',
} as const;

/** A token's colour at `a` opacity, as a CSS colour (canvas fills over the room). */
export function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
/** A token's colour as a number (three.js). */
export const hexNum = (hex: string): number => parseInt(hex.slice(1), 16);

export const NEON = {
  bg0: '#1d0b2c',
  bg1: '#26103a',
  ink: '#f6efe4',
  muted: '#b9aac9',
  dim: '#7d6b92',
  cyan: '#ffb547',
  magenta: '#ff4b2b',
  violet: '#d2a54a',
  green: '#8fdc8a',
  gold: '#ffd23f',
  orange: '#ff9a3c',
  red: '#ff6b5a',
  plate: 'rgba(29,11,44,0.86)',
} as const;

/** Each judgement's colour. */
export const JUDGE = { perfect: NEON.cyan, good: NEON.green, miss: NEON.red } as const;
/** Each level's colour. */
export const LEVEL_INK: Record<string, string> = { easy: NEON.green, normal: NEON.gold, hard: NEON.red };
/** Each grade's pair (a gradient, light to deep). */
export const GRADE_PAIR: Record<string, [string, string]> = {
  S: ['#fff1a8', '#ffb000'],
  A: ['#b8ffe0', '#22d68a'],
  B: ['#ffe0b8', '#ff8a3c'],
  C: ['#e0ccff', '#d2a54a'],
  D: ['#d6cfe8', '#7a6f98'],
};
/** The three tiers of what you press: the one hot primary, white secondaries, outlined tertiaries. */
export const SECONDARY = new Set(['back', 'nav:main', 'next', 'again:easy', 'pause', 'nav:settings']);
/** Each instrument's own light (the panel's edge flashes it as you play). */
export const INST_LIGHT: Record<string, number> = { drums: 0xffb347, piano: 0xf3ead8, guitar: 0xff7a2f, handpan: 0xc9a26b, marimba: 0xd0485a, congas: 0xe0b07a };
/** The streak's ladder: ×2 cyan, ×3 green, ×4 gold. */
export const MULT_PAIR: [string, string][] = [
  ['#ffffff', '#d9cfff'],
  ['#ffffff', '#d9cfff'],
  ['#ffe0b8', '#ff8a3c'],
  ['#b8ffe0', '#22d68a'],
  ['#fff1a8', '#ffb000'],
];

/** A display font: bold, upright. */
export const display = (px: number, weight = 800) => `${weight} ${px}px ${FONT}`;
export const body = (px: number, weight = 600) => `${weight} ${px}px ${FONT}`;

/** A slanted plate (a parallelogram leaning right by `k` px), as a path. */
export function slant(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, _k?: number): void {
  // (one angle everywhere: 10 degrees, whatever the height)
  void _k;
  const k = Math.round(h * 0.176);
  g.beginPath();
  g.moveTo(x + k, y);
  g.lineTo(x + w, y);
  g.lineTo(x + w - k, y + h);
  g.lineTo(x, y + h);
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
  g.fillStyle = vgrad(g, 0, h, 'rgba(29,11,44,0.94)', 'rgba(38,16,58,0.94)');
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = '#3d2357';
  g.stroke();
}

/** Text, flat, with a soft dark shadow under it so it reads over a bright room (no coloured glow). */
export function glowText(g: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string | CanvasGradient, _glow: string, _blur = 18): void {
  void _glow;
  void _blur;
  g.shadowColor = 'rgba(10,4,16,0.55)';
  g.shadowBlur = 6;
  g.shadowOffsetY = 2;
  g.fillStyle = fill;
  g.fillText(text, x, y);
  g.shadowBlur = 0;
  g.shadowOffsetY = 0;
}

/** Chromatic display text: a cyan and a magenta ghost either side, a white-to-pink fill on top (a "PERFECT!" banner). */
export function chroma(g: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, a: string = NEON.cyan, b: string = NEON.magenta): void {
  g.font = display(px, 900);
  // (one offset shadow in the accent, like a print slightly off register; no two-colour ghosting)
  void b;
  g.fillStyle = withAlpha(a.startsWith('#') ? a : NEON.cyan, 0.9);
  g.fillText(text, x + 3, y + 3);
  const w = g.measureText(text).width;
  const gr = g.createLinearGradient(x, y - px, x, y);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(1, '#fff1dc');
  g.fillStyle = gr;
  g.fillText(text, x, y);
  void w;
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
  if (glow) {
    g.shadowColor = glow;
    g.shadowBlur = 16;
  }
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
