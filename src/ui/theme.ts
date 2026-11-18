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
  plum: '#161419',
  plum2: '#211e24',
  plum3: '#2b2730',
  line: '#36323b',
  ink: '#f2eee8',
  ink2: '#a29da8',
  ink3: '#6d6873',
  hot: '#ff5a1f',
  hotInk: '#1a0d07',
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
  bg0: '#161419',
  bg1: '#1c1a1f',
  ink: '#f2eee8',
  muted: '#a29da8',
  dim: '#6d6873',
  cyan: '#ffe2b8',
  magenta: '#ff5a1f',
  violet: '#a29da8',
  green: '#8fdc8a',
  gold: '#ffd23f',
  orange: '#ff9a3c',
  red: '#ff6b5a',
  plate: 'rgba(22,20,25,0.94)',
} as const;

/** Each judgement's colour. */
export const JUDGE = { perfect: NEON.cyan, good: NEON.green, miss: NEON.red } as const;
/** Each level's colour. */
export const LEVEL_INK: Record<string, string> = { easy: NEON.green, normal: NEON.gold, hard: NEON.red };
/** Each grade's pair (a gradient, light to deep). */
export const GRADE_PAIR: Record<string, [string, string]> = {
  S: ['#ffc93c', '#ffc93c'],
  A: ['#9fd98a', '#9fd98a'],
  B: ['#f2eee8', '#f2eee8'],
  C: ['#a29da8', '#a29da8'],
  D: ['#6d6873', '#6d6873'],
};
/** The panel's surfaces (see docs/UI-DIRECTION.md): flat graphite, a hairline, one orange. */
export const UI = { bg: '#161419', raised: '#211e24', sel: '#2b2730', line: '#36323b', ink: '#f2eee8', ink2: '#a29da8', ink3: '#6d6873', accent: '#ff5a1f', accentInk: '#1a0d07' } as const;
/** The three tiers of what you press: the one hot primary, white secondaries, outlined tertiaries. */
export const SECONDARY = new Set(['back', 'nav:main', 'next', 'again:easy', 'pause', 'nav:settings']);
/** Each instrument's own light (the panel's edge flashes it as you play). */
export const INST_LIGHT: Record<string, number> = { drums: 0xffb347, piano: 0xf3ead8, guitar: 0xff7a2f, handpan: 0xc9a26b, marimba: 0xd0485a, congas: 0xe0b07a };
/** The streak's ladder: ×2 cyan, ×3 green, ×4 gold. */
export const MULT_PAIR: [string, string][] = [
  ['#f2eee8', '#f2eee8'],
  ['#f2eee8', '#f2eee8'],
  ['#ffb27a', '#ffb27a'],
  ['#9fd98a', '#9fd98a'],
  ['#ffc93c', '#ffc93c'],
];

/** The display face: Barlow Condensed (the site's too), bold and upright, for titles, buttons and numbers. */
export const display = (px: number, weight = 800) => `${Math.min(700, weight)} ${px}px 'Barlow Condensed', ${FONT}`;
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
  g.fillStyle = 'rgba(22,20,25,0.96)';
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = '#36323b';
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
