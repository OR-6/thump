/**
 * The module: a small matte-black drum-module panel at the back of the table, the game's only UI
 * (PLAN §3.13). A monochrome display (one big line, a room map of instrument icons, a meter) and four
 * rubber keys you tap like pads: ◀ PLAY ▶ JAM. Kit-local, facing the player.
 */
import { BoxGeometry, CanvasTexture, Color, Group, Mesh, MeshStandardMaterial, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';
import { FAMILIES, type Family } from '../room/classify.js';

export const MODULE = {
  /** Kit-local centre of its base. */
  x: 0,
  z: -0.25,
  w: 0.22,
  d: 0.1,
  h: 0.034,
  /** The display's tilt back from vertical-facing (radians from flat). */
  tilt: 0.42,
  /** Keys along the front edge (module-local x), each this wide. */
  keyW: 0.042,
  keyD: 0.026,
  keyZ: 0.03,
} as const;

export type ModuleKey = 'prev' | 'play' | 'next' | 'jam';
export const KEYS: readonly ModuleKey[] = ['prev', 'play', 'next', 'jam'];
const KEY_X = [-0.075, -0.025, 0.025, 0.075];

export interface Display {
  /** The big line (≤ 18 characters). */
  line: string;
  /** The small line under it. */
  sub: string;
  /** Instruments found, in room-map order, and how many the room has. */
  found: Family[];
  total: number;
  /** 0..1 meter (applause while playing, progress otherwise), or −1 for none. */
  meter: number;
  /** Stars to show (0–3), or −1. */
  stars: number;
  /** Which key pulses for attention. */
  pulse: ModuleKey | null;
}

const INK = '#f2efe6';
const DIM = '#3b3b3e';
const BG = '#0b0b0c';
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

export class Module {
  readonly root = new Group();
  private canvas = document.createElement('canvas');
  private tex: CanvasTexture;
  private keyMeshes: Mesh[] = [];
  private keyMats: MeshStandardMaterial[] = [];
  private press = new Float32Array(4);
  private pulseT = 0;
  private last = '';
  shown: Display = { line: '', sub: '', found: [], total: 0, meter: -1, stars: -1, pulse: null };

  constructor() {
    this.root.name = 'Module';
    this.canvas.width = 640;
    this.canvas.height = 220;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.tex.anisotropy = 4;
    const body = new Mesh(new BoxGeometry(MODULE.w, MODULE.h, MODULE.d), new MeshStandardMaterial({ color: 0x141416, roughness: 0.62, metalness: 0.1 }));
    body.position.y = MODULE.h / 2;
    this.root.add(body);
    // the display: a slanted face on the back half, raised a little
    const face = new Mesh(new PlaneGeometry(0.19, 0.065), new MeshBasicMaterial({ map: this.tex, toneMapped: false }));
    // just in front of the bezel's face (along the tilted normal), never behind it
    face.position.set(0, MODULE.h + 0.0155 + Math.sin(MODULE.tilt) * 0.0062, -0.0215 + Math.cos(MODULE.tilt) * 0.0062);
    face.rotation.x = -MODULE.tilt;
    const bezel = new Mesh(new BoxGeometry(0.2, 0.074, 0.01), new MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.5 }));
    bezel.position.set(0, MODULE.h + 0.0155, -0.0215);
    bezel.rotation.x = -MODULE.tilt;
    this.root.add(bezel, face);
    // four rubber keys along the front, each with a printed glyph
    KEYS.forEach((k, i) => {
      const mat = new MeshStandardMaterial({ color: 0x2a2a2d, roughness: 0.85, emissive: new Color(0), map: keyTexture(k) });
      const key = new Mesh(new BoxGeometry(MODULE.keyW, 0.008, MODULE.keyD), [mat, mat, mat, mat, mat, mat]);
      key.position.set(KEY_X[i], MODULE.h + 0.004, MODULE.keyZ);
      this.keyMeshes.push(key);
      this.keyMats.push(mat);
      this.root.add(key);
    });
    this.root.position.set(MODULE.x, 0, MODULE.z);
    this.draw(this.shown);
  }

  /** Key i's centre in module-local x/z (for the hit surface). */
  static keyAt(i: number): { x: number; z: number } {
    return { x: KEY_X[i], z: MODULE.keyZ };
  }

  /** A key was tapped. */
  pressKey(i: number): void {
    this.press[i] = 1;
  }

  set(d: Display): void {
    const key = `${d.line}|${d.sub}|${d.found.join(',')}|${d.total}|${Math.round(d.meter * 20)}|${d.stars}`;
    this.shown = d;
    if (key === this.last) return;
    this.last = key;
    this.draw(d);
  }

  private draw(d: Display): void {
    const c = this.canvas;
    const g = c.getContext('2d')!;
    const W = c.width;
    const H = c.height;
    g.fillStyle = BG;
    g.fillRect(0, 0, W, H);
    // faint scan lines: a real monochrome panel
    g.fillStyle = '#ffffff06';
    for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);
    g.fillStyle = INK;
    g.textBaseline = 'alphabetic';
    let px = 64;
    g.font = `600 ${px}px ${FONT}`;
    while (g.measureText(d.line).width > W - 48 && px > 30) g.font = `600 ${--px}px ${FONT}`;
    g.fillText(d.line, 24, 82);
    g.font = `500 30px ${FONT}`;
    g.fillStyle = '#b9b5ab';
    g.fillText(d.sub, 24, 124);
    // the room map: one icon per instrument found, dim slots for the rest
    const slots = Math.max(d.total, d.found.length);
    for (let i = 0; i < Math.min(10, slots); i++) {
      const x = 36 + i * 46;
      const f = d.found[i];
      icon(g, f ?? null, x, 172, 16, f ? INK : DIM);
    }
    if (d.total > 0) {
      g.font = `600 30px ${FONT}`;
      g.fillStyle = INK;
      const txt = `${d.found.length}/${Math.max(d.total, d.found.length)}`;
      g.fillText(txt, W - 24 - g.measureText(txt).width, 184);
    }
    if (d.stars >= 0) {
      for (let i = 0; i < 3; i++) star(g, W - 150 + i * 46, 82 - 22, 18, i < d.stars);
    }
    if (d.meter >= 0) {
      // a segmented meter along the bottom edge
      const segs = 20;
      for (let i = 0; i < segs; i++) {
        g.fillStyle = i / segs < d.meter ? INK : DIM;
        g.fillRect(24 + i * ((W - 48) / segs), H - 14, (W - 48) / segs - 4, 6);
      }
    }
    this.tex.needsUpdate = true;
  }

  update(dt: number): void {
    this.pulseT += dt;
    const pulse = this.shown.pulse;
    for (let i = 0; i < 4; i++) {
      this.press[i] = Math.max(0, this.press[i] - dt * 6);
      const p = pulse === KEYS[i] ? 0.5 + 0.5 * Math.sin(this.pulseT * 6) : 0;
      const k = Math.max(this.press[i], p * 0.8);
      this.keyMats[i].emissive.setRGB(1, 0.95, 0.85).multiplyScalar(k * 0.5);
      this.keyMeshes[i].position.y = MODULE.h + 0.004 - this.press[i] * 0.003;
    }
  }
}

function keyTexture(k: ModuleKey): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2a2a2d';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#e8e4da';
  g.strokeStyle = '#e8e4da';
  g.lineWidth = 9;
  g.lineJoin = 'round';
  g.beginPath();
  if (k === 'prev') {
    g.moveTo(80, 36);
    g.lineTo(44, 64);
    g.lineTo(80, 92);
    g.stroke();
  } else if (k === 'next') {
    g.moveTo(48, 36);
    g.lineTo(84, 64);
    g.lineTo(48, 92);
    g.stroke();
  } else if (k === 'play') {
    g.moveTo(48, 34);
    g.lineTo(90, 64);
    g.lineTo(48, 94);
    g.closePath();
    g.fill();
  } else {
    // jam: two little notes
    g.arc(46, 82, 11, 0, Math.PI * 2);
    g.arc(84, 74, 11, 0, Math.PI * 2);
    g.fill();
    g.fillRect(53, 36, 7, 46);
    g.fillRect(91, 28, 7, 46);
    g.fillRect(53, 30, 45, 9);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number, filled: boolean): void {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    if (i === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fillStyle = INK;
  g.strokeStyle = filled ? INK : DIM;
  g.lineWidth = 3;
  if (filled) g.fill();
  else g.stroke();
}

/** A tiny line icon per family (the room map). */
export function icon(g: CanvasRenderingContext2D, f: Family | null, x: number, y: number, r: number, col: string): void {
  g.save();
  g.strokeStyle = col;
  g.fillStyle = col;
  g.lineWidth = 3;
  g.translate(x, y);
  g.beginPath();
  switch (f) {
    case 'kit':
      g.ellipse(0, 4, r, r * 0.45, 0, 0, Math.PI * 2);
      g.moveTo(-r, 4);
      g.lineTo(-r, -4);
      g.moveTo(r, 4);
      g.lineTo(r, -4);
      g.ellipse(0, -4, r, r * 0.45, 0, Math.PI, 0);
      break;
    case 'gong':
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.moveTo(r * 0.35, 0);
      g.arc(0, 0, r * 0.35, 0, Math.PI * 2);
      break;
    case 'marimba':
    case 'keys':
      for (let i = 0; i < 4; i++) {
        const w = r * (1 - i * 0.18);
        g.moveTo(-w, r - i * r * 0.62);
        g.lineTo(w, r - i * r * 0.62);
      }
      break;
    case 'glock':
      for (let i = 0; i < 4; i++) {
        const h = r * (1 - i * 0.2);
        g.moveTo(-r * 0.75 + i * r * 0.5, h);
        g.lineTo(-r * 0.75 + i * r * 0.5, -h);
      }
      break;
    case 'tongue':
      g.arc(0, 0, r, 0, Math.PI * 2);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        g.moveTo(Math.cos(a) * r * 0.25, Math.sin(a) * r * 0.25);
        g.lineTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8);
      }
      break;
    case 'bowl':
      g.arc(0, -r * 0.2, r, 0, Math.PI);
      g.moveTo(-r, -r * 0.2);
      g.lineTo(r, -r * 0.2);
      break;
    case 'bell':
      g.moveTo(-r * 0.8, r * 0.7);
      g.quadraticCurveTo(-r * 0.7, -r, 0, -r);
      g.quadraticCurveTo(r * 0.7, -r, r * 0.8, r * 0.7);
      g.closePath();
      break;
    case 'shaker':
      g.ellipse(0, 0, r * 0.55, r, 0.5, 0, Math.PI * 2);
      break;
    case 'block':
      g.rect(-r, -r * 0.5, r * 2, r);
      break;
    case 'stomp':
      g.moveTo(-r, r);
      g.lineTo(r, r);
      g.moveTo(-r * 0.6, r * 0.2);
      g.lineTo(r * 0.6, r * 0.2);
      break;
    default:
      g.arc(0, 0, r * 0.35, 0, Math.PI * 2);
      g.fill();
      g.restore();
      return;
  }
  g.stroke();
  g.restore();
}

export { FAMILIES };
