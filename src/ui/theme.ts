/**
 * The panel's look: a night stage. Deep indigo to plum, a faint grid, a neon edge running cyan to magenta with corner
 * brackets; bold italic display type; slanted plates for what you press; colour that means something (judgements,
 * levels, grades, the streak). Canvas 2D helpers only (no scene, no DOM beyond the context they are given).
 */
import { FONT } from './fonts.js';

export const NEON = {
  bg0: '#150a30',
  bg1: '#2a0c44',
  ink: '#fbf7ff',
  muted: '#b3a6d6',
  dim: '#6b5f8e',
  cyan: '#33e1ff',
  magenta: '#ff3ea5',
  violet: '#8a5cff',
  green: '#3cf0a0',
  gold: '#ffd23f',
  orange: '#ff9a3c',
  red: '#ff4f7a',
  plate: 'rgba(22,10,48,0.86)',
} as const;

/** Each judgement's colour. */
export const JUDGE = { perfect: NEON.cyan, good: NEON.green, miss: NEON.red } as const;
/** Each level's colour. */
export const LEVEL_INK: Record<string, string> = { easy: NEON.green, normal: NEON.gold, hard: NEON.red };
/** Each grade's pair (a gradient, light to deep). */
export const GRADE_PAIR: Record<string, [string, string]> = {
  S: ['#fff1a8', '#ffb000'],
  A: ['#b8ffe0', '#22d68a'],
  B: ['#b5f3ff', '#1fb3ff'],
  C: ['#e0ccff', '#8a5cff'],
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
  ['#b5f3ff', '#1fb3ff'],
  ['#b8ffe0', '#22d68a'],
  ['#fff1a8', '#ffb000'],
];

/** A display font: bold italic. */
export const display = (px: number, weight = 800) => `italic ${weight} ${px}px ${FONT}`;
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
  g.fillStyle = vgrad(g, 0, h, 'rgba(26,13,56,0.94)', 'rgba(36,16,70,0.94)');
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = '#3b2670';
  g.stroke();
}

/** Text with a neon glow, filled with a colour or a gradient. */
export function glowText(g: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string | CanvasGradient, glow: string, blur = 18): void {
  g.shadowColor = glow;
  g.shadowBlur = blur;
  g.fillStyle = fill;
  g.fillText(text, x, y);
  g.shadowBlur = 0;
}

/** Chromatic display text: a cyan and a magenta ghost either side, a white-to-pink fill on top (a "PERFECT!" banner). */
export function chroma(g: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, a: string = NEON.cyan, b: string = NEON.magenta): void {
  g.font = display(px, 900);
  g.globalAlpha = 0.85;
  g.fillStyle = a;
  g.fillText(text, x - 2, y - 1);
  g.fillStyle = b;
  g.fillText(text, x + 2, y + 1);
  g.globalAlpha = 1;
  const w = g.measureText(text).width;
  const gr = g.createLinearGradient(x, y - px, x, y);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(1, '#ffd6f1');
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
