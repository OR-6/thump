/**
 * The module: a small matte-black drum-module panel at the back of the table, the game's only UI
 * (DESIGN.md §3.13). A monochrome display (one big line, a room map of instrument icons, a meter) and four
 * rubber keys you tap like pads: ◀ PLAY ▶ JAM. Kit-local, facing the player.
 */
import { BoxGeometry, CanvasTexture, Color, Group, Mesh, MeshStandardMaterial, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';
import { FAMILIES, type Family } from '../room/classify.js';

export const MODULE = {
  /** Kit-local centre of its base. */
  x: 0,
  z: -0.3,
  w: 0.3,
  d: 0.13,
  h: 0.034,
  /** The display's tilt back from facing straight at you (radians): it looks up at a seated player. */
  tilt: 0.6,
  /** Keys along the front edge (module-local x), each this wide. */
  keyW: 0.05,
  keyD: 0.034,
  keyZ: 0.04,
} as const;

export type ModuleKey = 'prev' | 'play' | 'next' | 'jam' | 'loop';
export const KEYS: readonly ModuleKey[] = ['prev', 'play', 'next', 'jam', 'loop'];
const KEY_X = [-0.116, -0.058, 0, 0.058, 0.116];

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
  /** A count-in number (4..1), or 0. */
  count: number;
  /** Days you've played (shown small), and a gold mark for the selected song. */
  day: number;
  gold: boolean;
  /** A phone-jam code to show, or ''. */
  code: string;
  /** Labels over each key (the settings page), or null. */
  keyLabels: string[] | null;
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
  private press = new Float32Array(5);
  private pulseT = 0;
  shown: Display = { line: '', sub: '', found: [], total: 0, meter: -1, stars: -1, pulse: null, count: 0, day: 0, gold: false, code: '', keyLabels: null };

  constructor() {
    this.root.name = 'Module';
    this.canvas.width = 840;
    this.canvas.height = 285;
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
      const mat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, emissive: new Color(0), map: keyTexture(k) });
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

  private lastMeter = -9;
  private lastFound = -1;
  private lastLabels: string[] | null = null;
  private lastStr = ['', '', '', '', ''];
  private lastNum = [NaN, NaN, NaN, NaN, NaN];
  set(d: Display): void {
    this.shown = d;
    const meter = Math.round(d.meter * 24);
    const labels = d.keyLabels ? d.keyLabels.join('|') : '';
    const same =
      d.line === this.lastStr[0] && d.sub === this.lastStr[1] && d.code === this.lastStr[2] && labels === this.lastStr[3] &&
      d.total === this.lastNum[0] && d.stars === this.lastNum[1] && d.count === this.lastNum[2] && d.day === this.lastNum[3] && (d.gold ? 1 : 0) === this.lastNum[4] &&
      meter === this.lastMeter && d.found.length === this.lastFound;
    if (same) return;
    this.lastStr[0] = d.line;
    this.lastStr[1] = d.sub;
    this.lastStr[2] = d.code;
    this.lastStr[3] = labels;
    this.lastNum[0] = d.total;
    this.lastNum[1] = d.stars;
    this.lastNum[2] = d.count;
    this.lastNum[3] = d.day;
    this.lastNum[4] = d.gold ? 1 : 0;
    this.lastMeter = meter;
    this.lastFound = d.found.length;
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
    g.textBaseline = 'alphabetic';
    if (d.count > 0) {
      // the count-in, big
      g.fillStyle = INK;
      g.font = `700 190px ${FONT}`;
      const txt = String(d.count);
      g.fillText(txt, (W - g.measureText(txt).width) / 2, 210);
      this.tex.needsUpdate = true;
      return;
    }
    if (d.keyLabels) {
      // the settings page: a title, and each key's setting written over it
      g.fillStyle = INK;
      g.font = `650 64px ${FONT}`;
      g.fillText(d.line, 28, 80);
      g.font = `600 34px ${FONT}`;
      d.keyLabels.forEach((l, i) => {
        const x = W / 2 + (KEY_X[i] / 0.28) * W;
        const lines = l.split('\n');
        lines.forEach((t, k) => g.fillText(t, x - g.measureText(t).width / 2, 170 + k * 42));
      });
      this.tex.needsUpdate = true;
      return;
    }
    g.fillStyle = INK;
    let px = 84;
    g.font = `650 ${px}px ${FONT}`;
    const room = d.stars >= 0 ? W - 230 : W - 56;
    while (g.measureText(d.line).width > room && px > 40) g.font = `650 ${--px}px ${FONT}`;
    g.fillText(d.line, 28, 92);
    let sp = 62;
    g.font = `550 ${sp}px ${FONT}`;
    while (g.measureText(d.sub).width > W - 56 && sp > 40) g.font = `550 ${--sp}px ${FONT}`;
    g.fillStyle = '#d6d2c8';
    g.fillText(d.sub, 28, 166);
    if (d.stars >= 0) for (let i = 0; i < 3; i++) star(g, W - 180 + i * 64, 70, 26, i < d.stars, d.gold);
    // the room map: one LED per instrument the room has, lit in its colour once found
    const slots = Math.min(9, Math.max(d.total, d.found.length));
    for (let i = 0; i < slots; i++) {
      const f = d.found[i];
      const x = 48 + i * 60;
      // each instrument found, as its icon in its colour; a dim ring for the ones still to find
      if (f) icon(g, f, x, 226, 20, `#${FAMILIES[f].color.toString(16).padStart(6, '0')}`);
      else {
        g.beginPath();
        g.arc(x, 226, 16, 0, Math.PI * 2);
        g.strokeStyle = DIM;
        g.lineWidth = 4;
        g.stroke();
      }
    }
    g.font = `600 38px ${FONT}`;
    g.fillStyle = INK;
    const right = d.code ? `Phone ${d.code}` : d.day > 1 ? `Day ${d.day}` : slots ? `${d.found.length}/${slots}` : '';
    if (right) g.fillText(right, W - 28 - g.measureText(right).width, 236);
    if (d.meter >= 0) {
      const segs = 24;
      for (let i = 0; i < segs; i++) {
        g.fillStyle = i / segs < d.meter ? INK : DIM;
        g.fillRect(28 + i * ((W - 56) / segs), H - 16, (W - 56) / segs - 5, 8);
      }
    }
    this.tex.needsUpdate = true;
  }

  update(dt: number): void {
    this.pulseT += dt;
    const pulse = this.shown.pulse;
    for (let i = 0; i < KEYS.length; i++) {
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
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#ffffff';
  g.lineWidth = 11;
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
  } else if (k === 'loop') {
    // rec: a red dot
    g.fillStyle = '#ff4a3a';
    g.arc(64, 64, 26, 0, Math.PI * 2);
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

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number, filled: boolean, gold = false): void {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    if (i === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fillStyle = gold ? '#ffd34d' : INK;
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
