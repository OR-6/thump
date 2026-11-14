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
export const LEVEL_INK: Record<string, string> = { easy: NEON.cyan, normal: NEON.green, hard: NEON.magenta };
/** Each grade's pair (a gradient, light to deep). */
export const GRADE_PAIR: Record<string, [string, string]> = {
  S: ['#fff1a8', '#ffb000'],
  A: ['#b8ffe0', '#22d68a'],
  B: ['#b5f3ff', '#1fb3ff'],
  C: ['#e0ccff', '#8a5cff'],
  D: ['#d6cfe8', '#7a6f98'],
};
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
export function slant(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, k = 18): void {
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

/** The stage: a deep gradient, a faint perspective grid at the bottom, a vignette, a neon edge and corner brackets. */
export function stage(g: CanvasRenderingContext2D, w: number, h: number, r = 40): void {
  rr(g, 4, 4, w - 8, h - 8, r);
  g.fillStyle = vgrad(g, 0, h, 'rgba(21,10,48,0.95)', 'rgba(42,12,68,0.95)');
  g.fill();
  g.save();
  rr(g, 4, 4, w - 8, h - 8, r);
  g.clip();
  // a horizon glow and a grid running to it (synth-stage floor), very faint
  const hz = h * 0.62;
  const glow = g.createRadialGradient(w / 2, hz, 10, w / 2, hz, w * 0.6);
  glow.addColorStop(0, 'rgba(255,62,165,0.16)');
  glow.addColorStop(1, 'rgba(255,62,165,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(138,92,255,0.10)';
  g.lineWidth = 2;
  for (let i = -10; i <= 10; i++) {
    g.beginPath();
    g.moveTo(w / 2 + i * 40, hz);
    g.lineTo(w / 2 + i * 220, h);
    g.stroke();
  }
  for (let k = 1; k < 7; k++) {
    const y = hz + ((h - hz) * k * k) / 36;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.stroke();
  }
  // a few stars
  g.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 40; i++) {
    const x = (i * 337) % w;
    const y = (i * 151) % (hz - 40);
    g.fillRect(x, y, i % 5 === 0 ? 3 : 2, i % 5 === 0 ? 3 : 2);
  }
  g.restore();
  // the neon edge: cyan into magenta, glowing
  rr(g, 4, 4, w - 8, h - 8, r);
  g.lineWidth = 4;
  g.strokeStyle = hgrad(g, 0, w, [NEON.cyan, NEON.violet, NEON.magenta]);
  g.shadowColor = NEON.magenta;
  g.shadowBlur = 18;
  g.stroke();
  g.shadowBlur = 0;
  // corner brackets
  g.strokeStyle = NEON.cyan;
  g.lineWidth = 6;
  g.lineCap = 'round';
  const L = 60;
  const m = 20;
  for (const [cx, cy, sx, sy] of [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]] as const) {
    g.beginPath();
    g.moveTo(cx, cy + sy * L);
    g.lineTo(cx, cy);
    g.lineTo(cx + sx * L, cy);
    g.stroke();
  }
  g.lineCap = 'butt';
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
  g.fillText(text, x - 4, y - 2);
  g.fillStyle = b;
  g.fillText(text, x + 4, y + 2);
  g.globalAlpha = 1;
  const w = g.measureText(text).width;
  const gr = g.createLinearGradient(x, y - px, x, y);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(1, '#ffd6f1');
  glowText(g, text, x, y, gr, b, 14);
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
