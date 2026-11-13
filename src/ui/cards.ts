/**
 * Felt song cards (PLAN §3.5): the title card that lies on the desk when a song begins, and the
 * stack of cards you pick songs from. Each has the song's name, a three-word mood line, a hand-drawn
 * icon, and the stars you've earned on it (a gold edge for three at full tempo).
 */
import { CanvasTexture, Mesh, MeshStandardMaterial, BoxGeometry, SRGBColorSpace } from '@iwsdk/core';
import type { Song } from '../songs/chart.js';
import type { Theme } from './theme.js';
import { FELT } from '../config.js';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const CARD_COLORS = [FELT.teal, FELT.tomato, FELT.navy, FELT.plum, FELT.mustard, 0x5a7d4f];

export function drawIcon(g: CanvasRenderingContext2D, icon: Song['icon'], x: number, y: number, r: number, ink: string): void {
  g.save();
  g.translate(x, y);
  g.strokeStyle = ink;
  g.fillStyle = ink;
  g.lineWidth = r * 0.12;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const line = (pts: number[][]) => {
    g.beginPath();
    pts.forEach(([a, b], i) => (i ? g.lineTo(a * r, b * r) : g.moveTo(a * r, b * r)));
    g.stroke();
  };
  switch (icon) {
    case 'porch': // steps and a sun
      line([[-0.9, 0.8], [-0.9, 0.35], [-0.35, 0.35], [-0.35, -0.1], [0.2, -0.1], [0.2, -0.55], [0.9, -0.55]]);
      g.beginPath();
      g.arc(0.55 * r, 0.35 * r, 0.22 * r, 0, Math.PI * 2);
      g.stroke();
      break;
    case 'clock':
      g.beginPath();
      g.arc(0, 0, 0.8 * r, 0, Math.PI * 2);
      g.stroke();
      line([[0, 0], [0, -0.55]]);
      line([[0, 0], [0.4, 0.15]]);
      break;
    case 'birds': // two little birds facing
      for (const s of [-1, 1]) {
        g.beginPath();
        g.ellipse(s * 0.45 * r, 0.1 * r, 0.32 * r, 0.26 * r, 0, 0, Math.PI * 2);
        g.stroke();
        line([[s * 0.12, 0.02], [s * -0.02, 0.08], [s * 0.12, 0.14]]);
      }
      break;
    case 'hands':
      for (const s of [-1, 1]) {
        g.beginPath();
        g.ellipse(s * 0.42 * r, 0.25 * r, 0.26 * r, 0.32 * r, 0, 0, Math.PI * 2);
        g.stroke();
        for (let f = 0; f < 3; f++) line([[s * (0.28 + f * 0.14), -0.05], [s * (0.28 + f * 0.14), -0.6]]);
      }
      break;
    case 'gong':
      g.beginPath();
      g.arc(0, 0.1 * r, 0.62 * r, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(0, 0.1 * r, 0.22 * r, 0, Math.PI * 2);
      g.fill();
      line([[-0.4, -0.75], [0, -0.5], [0.4, -0.75]]);
      break;
    case 'bus':
      g.strokeRect(-0.9 * r, -0.45 * r, 1.8 * r, 0.9 * r);
      for (let w = 0; w < 3; w++) g.strokeRect((-0.75 + w * 0.55) * r, -0.3 * r, 0.4 * r, 0.3 * r);
      for (const s of [-1, 1]) {
        g.beginPath();
        g.arc(s * 0.5 * r, 0.5 * r, 0.16 * r, 0, Math.PI * 2);
        g.fill();
      }
      break;
  }
  g.restore();
}

/** Draw a song card face onto a canvas (W×H px). */
export function drawCard(c: HTMLCanvasElement, song: Song, index: number, stars: number, gold: boolean, theme: Theme, title = false): void {
  const g = c.getContext('2d')!;
  const W = c.width;
  const H = c.height;
  const felt = theme.hc ? '#ffffff' : hex(CARD_COLORS[index % CARD_COLORS.length]);
  const ink = theme.hc ? '#000000' : '#fff6e8';
  g.clearRect(0, 0, W, H);
  // the felt card: rounded, with a stitched border
  const r = W * 0.08;
  g.fillStyle = gold && !theme.hc ? '#e8b730' : theme.hc ? '#000' : '#5a3a24';
  roundRect(g, 0, 0, W, H, r);
  g.fill();
  g.fillStyle = felt;
  roundRect(g, W * 0.035, W * 0.035, W - W * 0.07, H - W * 0.07, r * 0.8);
  g.fill();
  let seed = 3 + index * 17;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 500; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.07)';
    g.fillRect(rnd() * W, rnd() * H, 3, 1.5);
  }
  g.save();
  g.setLineDash([W * 0.03, W * 0.022]);
  g.strokeStyle = theme.hc ? '#000' : 'rgba(255,241,214,0.85)';
  g.lineWidth = W * 0.012;
  roundRect(g, W * 0.07, W * 0.07, W - W * 0.14, H - W * 0.14, r * 0.6);
  g.stroke();
  g.restore();
  g.fillStyle = ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const iconY = title ? H * 0.33 : H * 0.3;
  drawIcon(g, song.icon, W / 2, iconY, title ? H * 0.16 : W * 0.2, ink);
  let px = Math.round(title ? H * 0.17 : W * 0.15);
  g.font = `400 ${px}px ${theme.font}`;
  while (g.measureText(song.name).width > W * 0.84 && px > 10) g.font = `400 ${--px}px ${theme.font}`;
  g.fillText(song.name, W / 2, title ? H * 0.64 : H * 0.6);
  g.font = `400 ${Math.round((title ? H * 0.09 : W * 0.085))}px ${theme.font}`;
  g.globalAlpha = 0.85;
  g.fillText(song.mood, W / 2, title ? H * 0.8 : H * 0.72);
  g.globalAlpha = 1;
  if (!title) {
    // the stars you've earned: three felt stars, empty ones as outlines
    for (let s = 0; s < 3; s++) {
      const x = W / 2 + (s - 1) * W * 0.2;
      star(g, x, H * 0.86, W * 0.07, s < stars, gold && !theme.hc ? '#f7c948' : ink);
    }
  }
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number, filled: boolean, colour: string): void {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.42 : r;
    if (i === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.strokeStyle = colour;
  g.fillStyle = colour;
  g.lineWidth = r * 0.18;
  if (filled) g.fill();
  else g.stroke();
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** A felt card as a thin box (the face on top, +Y), w × d metres. */
export class Card {
  readonly mesh: Mesh;
  readonly canvas = document.createElement('canvas');
  private tex: CanvasTexture;
  constructor(readonly w: number, readonly d: number) {
    this.canvas.width = 384;
    this.canvas.height = Math.round((384 * d) / w);
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.tex.anisotropy = 4;
    const edge = new MeshStandardMaterial({ color: 0x5a3a24, roughness: 0.95 });
    const face = new MeshStandardMaterial({ map: this.tex, roughness: 0.95 });
    // BoxGeometry faces: +x, -x, +y (top), -y, +z, -z
    this.mesh = new Mesh(new BoxGeometry(w, 0.003, d), [edge, edge, face, edge, edge, edge]);
    this.mesh.name = 'Card';
  }
  draw(song: Song, index: number, stars: number, gold: boolean, theme: Theme, title = false): void {
    drawCard(this.canvas, song, index, stars, gold, theme, title);
    this.tex.needsUpdate = true;
  }
}
