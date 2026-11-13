/**
 * Procedural textures (generated once, shared). Grayscale maps multiplied by
 * material / instance colours, so every theme and palette reuses them.
 */
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from '@iwsdk/core';

let weave: CanvasTexture | null = null;
let grain: CanvasTexture | null = null;

/** One woven cell: a soft pillow of yarn with fibre lines (256²). */
export function weaveTexture(): CanvasTexture {
  if (weave) return weave;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  // pillow shading: bright centre, darker edges where yarn dips under
  const grad = g.createRadialGradient(128, 128, 20, 128, 128, 170);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.7, '#f3f3f3');
  grad.addColorStop(1, '#cdcdcd'); // a light dip at the edges: the woven picture stays bright from the seat
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  // fibre lines (slight twist) — deterministic
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.lineWidth = 2;
  for (let i = 0; i < 46; i++) {
    const y = rnd() * 256;
    g.strokeStyle = `rgba(0,0,0,${0.05 + rnd() * 0.08})`;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(80, y - 10 + rnd() * 20, 170, y - 10 + rnd() * 20, 256, y + 6);
    g.stroke();
  }
  weave = new CanvasTexture(c);
  weave.colorSpace = SRGBColorSpace;
  return weave;
}

/** Faint painted-wood grain (tileable along U). */
let softGrain: CanvasTexture | null = null;
export function grainTexture(soft = false): CanvasTexture {
  if (soft ? softGrain : grain) return (soft ? softGrain : grain)!;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 64);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const y = rnd() * 64;
    const a = (0.03 + rnd() * 0.06) * (soft ? 0.5 : 1);
    g.strokeStyle = `rgba(60,35,10,${a})`;
    g.lineWidth = 1 + rnd() * 2;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= 256; x += 32) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 2.5);
    g.stroke();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  if (soft) softGrain = t;
  else grain = t;
  return t;
}

let yarn: CanvasTexture | null = null;
/**
 * Twisted yarn for the warps: diagonal plies with soft shading, white so the
 * material colour tints it. Mapped around (u) and along (v) a cylinder.
 */
export function yarnTexture(): CanvasTexture {
  if (yarn) return yarn;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 64);
  // Two plies twisting: diagonal bands with a darker groove between them.
  for (let k = -64; k < 128; k += 16) {
    const grad = g.createLinearGradient(k, 0, k + 16, 0);
    grad.addColorStop(0, 'rgba(60,35,15,0.5)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(60,35,15,0.32)');
    g.save();
    g.transform(1, 0, -1, 1, 0, 0); // shear → diagonal twist
    g.fillStyle = grad;
    g.fillRect(k, 0, 16, 128);
    g.restore();
  }
  // A few loose fibres.
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 1;
  for (let i = 0; i < 18; i++) {
    const x = (i * 37) % 64;
    const y = (i * 23) % 64;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 6, y + 3);
    g.stroke();
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(1, 34); // ~3–4 mm per twist on a warp: reads as plied yarn
  t.colorSpace = SRGBColorSpace;
  yarn = t;
  return t;
}

let knit: CanvasTexture | null = null;
/**
 * One knitted "V" stitch per woven cell (white, tinted by the cell colour):
 * two plump angled loops with soft shading and a dark gap between them, so
 * woven rows read as yarn rather than beads or tiles.
 */
export function knitTexture(): CanvasTexture {
  if (knit) return knit;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#c4b4a0'; // warm, soft gaps: wool, not silver, and the picture colour stays loud
  g.fillRect(0, 0, 128, 128);
  const loop = (sx: number) => {
    g.save();
    g.translate(64 + sx * 22, 64);
    g.rotate(sx * 0.62);
    const grad = g.createLinearGradient(-20, 0, 20, 0);
    grad.addColorStop(0, '#ede6da');
    grad.addColorStop(0.45, '#f8f2e8'); // matte: no near-white glint
    grad.addColorStop(1, '#e2d7c6');
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(0, 0, 21, 62, 0, 0, Math.PI * 2);
    g.fill();
    // ply twist lines across the loop
    g.strokeStyle = 'rgba(90,60,30,0.14)';
    g.lineWidth = 2;
    for (let y = -50; y <= 50; y += 12) {
      g.beginPath();
      g.moveTo(-17, y + 5);
      g.quadraticCurveTo(0, y - 3, 17, y + 5);
      g.stroke();
    }
    g.restore();
  };
  loop(-1);
  loop(1);
  knit = new CanvasTexture(c);
  knit.colorSpace = SRGBColorSpace;
  return knit;
}

let felt: CanvasTexture | null = null;
/**
 * Plush felt: a soft pillow (lighter middle, gently darker toward the seams)
 * with a fuzz of short fibres. Low contrast on purpose: the quilted cells give
 * the shape, so a small plush still reads as its picture, not as stitch noise.
 */
export function feltTexture(): CanvasTexture {
  if (felt) return felt;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 60, 8, 64, 64, 92);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.75, '#efebe6');
  grad.addColorStop(1, '#cfc8bf');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.lineWidth = 1;
  for (let i = 0; i < 260; i++) {
    const x = rnd() * 128;
    const y = rnd() * 128;
    const a = rnd() * Math.PI;
    const l = 2 + rnd() * 4;
    g.strokeStyle = rnd() < 0.5 ? `rgba(0,0,0,${0.04 + rnd() * 0.05})` : `rgba(255,255,255,${0.1 + rnd() * 0.12})`;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  felt = new CanvasTexture(c);
  felt.colorSpace = SRGBColorSpace;
  return felt;
}
