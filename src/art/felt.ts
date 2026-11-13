/**
 * Felt textures drawn once on canvases (no image files): pad tops with a stitched edge and each
 * pad's shape cue, a soft contact shadow, and a star. Colours are baked in, so a pad's cream
 * stitches can be lighter than its felt.
 */
import { CanvasTexture, Shape, SRGBColorSpace } from '@iwsdk/core';
import type { PadSpec } from '../config.js';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

function rng(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** Short fibres over a filled area (the felt's fuzz). */
function fuzz(g: CanvasRenderingContext2D, size: number, seed: number, n = 900): void {
  const r = rng(seed);
  g.lineWidth = 1.2;
  for (let i = 0; i < n; i++) {
    const x = r() * size;
    const y = r() * size;
    const a = r() * Math.PI;
    const l = 2 + r() * 5;
    g.strokeStyle = r() < 0.5 ? `rgba(0,0,0,${0.04 + r() * 0.05})` : `rgba(255,255,255,${0.06 + r() * 0.08})`;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
}

function stitchRing(g: CanvasRenderingContext2D, c: number, r: number, colour: string, w: number, dash: number): void {
  g.save();
  g.setLineDash([dash, dash * 0.8]);
  g.lineCap = 'round';
  g.strokeStyle = colour;
  g.lineWidth = w;
  g.beginPath();
  g.arc(c, c, r, 0, Math.PI * 2);
  g.stroke();
  g.restore();
}

/**
 * A pad's top face (maps onto a cylinder's cap: the canvas centre is the pad centre).
 * High contrast: a cream disc with black marks (still told apart by shape).
 */
export function padTopTexture(spec: PadSpec, hc: boolean): CanvasTexture {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const mid = S / 2;
  const base = hc ? '#fff4dc' : hex(spec.color);
  const ink = hc ? '#111111' : 'rgba(255,241,214,0.95)';
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  if (spec.mark === 'brass') {
    // a brass gong: hammered rings, a raised boss
    const grad = g.createRadialGradient(mid - 60, mid - 60, 10, mid, mid, mid);
    grad.addColorStop(0, hc ? '#ffffff' : '#f6dc8c');
    grad.addColorStop(0.55, hc ? '#eeeeee' : '#c9a14a');
    grad.addColorStop(1, hc ? '#bbbbbb' : '#8a6a26');
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
    for (let k = 1; k < 7; k++) {
      g.strokeStyle = hc ? 'rgba(0,0,0,0.6)' : `rgba(90,60,10,${0.18 + (k % 2) * 0.1})`;
      g.lineWidth = hc ? 6 : 3;
      g.beginPath();
      g.arc(mid, mid, k * 34, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = hc ? '#111' : 'rgba(90,60,10,0.35)';
    g.beginPath();
    g.arc(mid, mid, 46, 0, Math.PI * 2);
    g.fill();
  } else {
    // pillow shading: lighter in the middle, darker toward the seam
    const grad = g.createRadialGradient(mid - 30, mid - 40, 20, mid, mid, mid);
    grad.addColorStop(0, 'rgba(255,255,255,0.22)');
    grad.addColorStop(0.7, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.22)');
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
    fuzz(g, S, spec.size * 1000 + spec.color);
    const sw = hc ? 12 : 9;
    if (spec.mark === 'stripe') {
      // the snare: a band of contrasting felt across it, stitched down
      g.fillStyle = hc ? '#111' : 'rgba(255,241,214,0.92)';
      g.fillRect(0, mid - 34, S, 68);
      g.save();
      g.setLineDash([16, 12]);
      g.strokeStyle = hc ? '#fff4dc' : hex(spec.color);
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(0, mid - 22);
      g.lineTo(S, mid - 22);
      g.moveTo(0, mid + 22);
      g.lineTo(S, mid + 22);
      g.stroke();
      g.restore();
    } else if (spec.mark === 'ring') {
      // the tom: a second stitched ring inside
      stitchRing(g, mid, mid * 0.52, ink, sw, 20);
      g.fillStyle = hc ? '#111' : 'rgba(255,241,214,0.85)';
      g.beginPath();
      g.arc(mid, mid, 26, 0, Math.PI * 2);
      g.fill();
    } else if (spec.mark === 'notch') {
      // the hat: a wedge of cream felt let into the edge, like a notch
      g.fillStyle = hc ? '#111' : 'rgba(255,241,214,0.92)';
      g.beginPath();
      g.moveTo(mid, mid);
      g.arc(mid, mid, mid, -Math.PI / 2 - 0.42, -Math.PI / 2 + 0.42);
      g.closePath();
      g.fill();
      for (const a of [0, 2.1, 4.2]) {
        g.beginPath();
        g.arc(mid + Math.cos(a + 1) * 70, mid + Math.sin(a + 1) * 70, 16, 0, Math.PI * 2);
        g.fill();
      }
    } else {
      // the kick: one big sewn-on button
      g.fillStyle = hc ? '#111' : 'rgba(255,241,214,0.9)';
      g.beginPath();
      g.arc(mid, mid, 64, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = base;
      for (const [dx, dy] of [
        [-16, -16],
        [16, -16],
        [-16, 16],
        [16, 16],
      ]) {
        g.beginPath();
        g.arc(mid + dx, mid + dy, 9, 0, Math.PI * 2);
        g.fill();
      }
    }
    stitchRing(g, mid, mid * 0.86, ink, sw, 22);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

let blob: CanvasTexture | null = null;
/** A soft round contact shadow (black, alpha falling off). */
export function blobTexture(): CanvasTexture {
  if (blob) return blob;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(20,12,6,0.55)');
  grad.addColorStop(0.55, 'rgba(20,12,6,0.32)');
  grad.addColorStop(1, 'rgba(20,12,6,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  blob = new CanvasTexture(c);
  return blob;
}

let glowTex: CanvasTexture | null = null;
/** A soft ring of light (white; tinted per pad), for the beat light on the table around a pad. */
export function glowTexture(): CanvasTexture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(128, 128, 60, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.62, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.75, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  glowTex = new CanvasTexture(c);
  return glowTex;
}

/** A five-point star outline (for the stars ribbon), about 1 unit across. */
export function starShape(): Shape {
  const s = new Shape();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 0.21 : 0.5;
    if (i === 0) s.moveTo(Math.cos(a) * r, -Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, -Math.sin(a) * r);
  }
  s.closePath();
  return s;
}
