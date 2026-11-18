/**
 * The HUD, drawn with the screen's own pieces (src/ui/theme.ts: its count-in, its plate, its italic type, its primary
 * button, its streak colours), so the two read as one thing: a small sign standing on the desk just in front of the instrument, on your side, turned to your eyes —
 * where you're looking while you play (the screen at the back is for choosing; this is for doing). It shows one thing
 * at a time: the count-in (big, stamped), or the one thing to do now (a lesson's step, a first-time tip, "Hands up!"),
 * or the streak stepping up. Nothing at all when there's nothing to say. One canvas, redrawn only when what it says
 * changes; nothing allocated per frame.
 */
import { CanvasTexture, CylinderGeometry, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Quaternion, RingGeometry, SRGBColorSpace, Vector3, type Object3D } from '@iwsdk/core';
import { whenFonts } from '../ui/fonts.js';
import { body, display, halftone, riso } from '../ui/theme.js';

/** The flyer's inks (docs/flyer-mockup.html). */
const PAPER = '#efe6d2';
const INK = '#1d1d1b';
const INK2 = '#4a4640';
const PINK = '#ff48b0';
const BLUE = '#3255a4';
const YELLOW = '#ffe24a';
const GOLD = '#c98a00';
const GREEN = '#2f8a4c';
/** The multiplier's sticker by step: ×2 yellow, ×3 pink, ×4 blue. */
const MULT_FILL = ['', YELLOW, YELLOW, PINK, BLUE];

/** A ticket stub's outline: a rounded card with a half-circle notch bitten out of each side. */
function ticketPath(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const r = 18;
  const n = Math.min(22, h / 5);
  const my = y + h / 2;
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.arcTo(x + w, y, x + w, y + r, r);
  g.lineTo(x + w, my - n);
  g.arc(x + w, my, n, -Math.PI / 2, Math.PI / 2, true);
  g.lineTo(x + w, y + h - r);
  g.arcTo(x + w, y + h, x + w - r, y + h, r);
  g.lineTo(x + r, y + h);
  g.arcTo(x, y + h, x, y + h - r, r);
  g.lineTo(x, my + n);
  g.arc(x, my, n, Math.PI / 2, -Math.PI / 2, true);
  g.lineTo(x, y + r);
  g.arcTo(x, y, x + r, y, r);
  g.closePath();
}
/** A ticket stub, filled and lined in ink, its blue plate printed a few px off under it. */
function ticket(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string): void {
  ticketPath(g, x + 7, y + 7, w - 8, h - 8);
  g.fillStyle = BLUE;
  g.fill();
  ticketPath(g, x, y, w - 8, h - 8);
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = INK;
  g.stroke();
}
/** A round sticker, slapped on at a slight angle: a fill, an ink ring, its words in ink (and a small line under). */
function sticker(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string, text: string, px: number, under = ''): void {
  g.save();
  g.translate(cx, cy);
  g.rotate(-0.12);
  g.beginPath();
  g.arc(6, 6, r, 0, Math.PI * 2);
  g.fillStyle = fill === BLUE ? PINK : BLUE;
  g.fill();
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = INK;
  g.stroke();
  g.font = display(px, 800);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = fill === BLUE ? PAPER : INK;
  g.fillText(text, 0, under ? -12 : 4);
  if (under) {
    g.font = body(30, 700);
    g.fillText(under, 0, px * 0.48);
  }
  g.restore();
}

const W = 1024;
const H = 300;
/** The sign's size (m): 30 cm wide, its words 2 cm tall (read at a glance from the seat, 45 cm away). */
const SW = 0.3;
const SH = (SW * H) / W;

export type HudSay =
  | { kind: 'none' }
  | { kind: 'count'; n: number }
  | { kind: 'go' }
  /** A command (a few words) and a quieter line under it; gold for the spotlight. */
  | { kind: 'tip'; big: string; small: string; gold?: boolean; hot?: boolean; foot?: string; icon?: 'stick' }
  | { kind: 'mult'; n: number }
  /** A streak milestone: the run's length. */
  | { kind: 'streak'; n: number }
  /**
   * Playing a song: the run and the multiplier, and under them how your last hits sat in time (offsets in seconds, −
   * early; `n` of them, the newest at `i - 1` round `errs`). `v` changes with every hit or miss (it redraws then).
   */
  | { kind: 'play'; run: number; mult: number; v: number; errs: Float32Array; n: number; i: number };

export class Hud {
  readonly mesh: Mesh;
  readonly root = new Group();
  private ghost: Mesh;
  private ghostCanvas: HTMLCanvasElement;
  private ghostTex: CanvasTexture;
  /** The leaving copy's time and what it was (a tip slides, a number zooms). */
  private ghostAge = 9;
  private ghostTip = false;
  private tex: CanvasTexture;
  private canvas: HTMLCanvasElement;
  private sig = '';
  private say: HudSay = { kind: 'none' };
  /** Seconds since what it says changed (the stamp and the fade). */
  private age = 9;
  private shown = 0;
  private lastKind: HudSay['kind'] = 'none';
  /** Seconds since the run went up (the number pops). */
  private pop = 9;
  private lastRun = 0;
  private leader: Mesh;
  private leaderEnd: Mesh;
  private lk = 0;
  private static readonly UP = new Vector3(0, 1, 0);
  private ld = new Vector3();
  private ldir = new Vector3();
  private lq = new Quaternion();
  private eye = new Vector3();

  constructor(parent: Object3D) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.mesh = new Mesh(new PlaneGeometry(SW, SH), new MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0 }));
    this.mesh.name = 'Hud';
    this.mesh.renderOrder = 14;
    // what it said a moment ago, leaving (a copy of the canvas: a tip slides off, a number zooms away)
    this.ghostCanvas = document.createElement('canvas');
    this.ghostCanvas.width = W;
    this.ghostCanvas.height = H;
    this.ghostTex = new CanvasTexture(this.ghostCanvas);
    this.ghostTex.colorSpace = SRGBColorSpace;
    this.ghost = new Mesh(new PlaneGeometry(SW, SH), new MeshBasicMaterial({ map: this.ghostTex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0 }));
    this.ghost.renderOrder = 13;
    this.ghost.visible = false;
    this.root.name = 'HudSign';
    this.root.add(this.mesh, this.ghost);
    this.root.visible = false;
    parent.add(this.root);
    // the leader: a thin hot line from the sign to the thing it's about, and a small ring where it lands
    const hot = new MeshBasicMaterial({ color: BLUE, transparent: true, depthWrite: false, depthTest: false, toneMapped: false });
    this.leader = new Mesh(new CylinderGeometry(0.0011, 0.0011, 1, 6), hot);
    this.leaderEnd = new Mesh(new RingGeometry(0.006, 0.009, 24), hot);
    this.leader.renderOrder = this.leaderEnd.renderOrder = 14;
    this.leader.visible = this.leaderEnd.visible = false;
    parent.add(this.leader, this.leaderEnd);
    whenFonts(() => {
      this.sig = '';
    });
  }

  /** What to show now (called every frame; redraws only when it changes). */
  set(s: HudSay): void {
    const sig = s.kind === 'count' || s.kind === 'mult' || s.kind === 'streak' ? `${s.kind}${s.n}` : s.kind === 'tip' ? `tip${s.big}|${s.small}|${s.gold ? 1 : 0}${s.hot ? 1 : 0}|${s.foot ?? ''}|${s.icon ?? ''}` : s.kind === 'play' ? `play${s.v}|${s.run}|${s.mult}` : s.kind;
    if (sig === this.sig) return;
    // (a tip that's only reworded doesn't stamp in again; nor does the run as you play: it pops)
    const playing = s.kind === 'play' && this.say.kind === 'play';
    const restamp = !(s.kind === 'tip' && this.say.kind === 'tip' && this.say.big === s.big) && !playing;
    // (the run is told by one object refreshed each frame: what it was is kept here)
    if (s.kind === 'play') {
      if (s.run > this.lastRun) this.pop = 0;
      this.lastRun = s.run;
    }
    this.sig = sig;
    this.say = s;
    if (restamp) {
      // (what was showing leaves as a copy, unless nothing was)
      if (this.shown > 0.3 && this.lastKind !== 'none') {
        const gg = this.ghostCanvas.getContext('2d')!;
        gg.clearRect(0, 0, W, H);
        gg.drawImage(this.canvas, 0, 0);
        this.ghostTex.needsUpdate = true;
        this.ghostAge = 0;
        this.ghostTip = this.lastKind === 'tip';
      }
      this.age = 0;
    }
    this.lastKind = s.kind;
    this.draw();
  }

  private draw(): void {
    const g = this.canvas.getContext('2d')!;
    g.clearRect(0, 0, W, H);
    const s = this.say;
    if (s.kind === 'none') return;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.textBaseline = 'alphabetic';
    g.textAlign = 'left';
    const cx = W / 2;
    if (s.kind === 'count' || s.kind === 'go') {
      // a big number printed over a halftone dot: the count-in, then Go!
      const t = s.kind === 'count' ? String(s.n) : 'Go!';
      halftone(g, cx, H / 2, 130, s.kind === 'go' ? PINK : BLUE, 14);
      g.font = display(s.kind === 'count' ? 250 : 200, 800);
      const x = cx - g.measureText(t).width / 2;
      const y = s.kind === 'count' ? 245 : 225;
      g.lineWidth = 16;
      g.strokeStyle = PAPER;
      g.strokeText(t, x, y);
      riso(g, t, x, y, s.kind === 'go' ? PINK : BLUE, s.kind === 'go' ? BLUE : PINK, 7);
    } else if (s.kind === 'mult') {
      // the multiplier: a round sticker slapped on at an angle
      sticker(g, cx, H / 2, 128, MULT_FILL[Math.max(1, Math.min(4, s.n))], `×${s.n}`, 150);
    } else if (s.kind === 'streak') {
      sticker(g, cx, H / 2 - 8, 124, YELLOW, String(s.n), 130, 'in a row');
    } else if (s.kind === 'play') {
      this.drawPlay(g, s);
    } else {
      // a tip: a ticket stub. Its title printed in two inks, the line under it, and what to do to go on, highlighted
      const hot = !!s.hot;
      const pad = 54;
      const room = W - pad * 2 - 30;
      let size = 92;
      for (; size > 60; size -= 4) {
        g.font = display(size, 800);
        if (g.measureText(s.big).width <= room) break;
      }
      const titleW = g.measureText(s.big).width;
      let sz = 46;
      let lines: string[] = s.small ? [s.small] : [];
      if (s.small) {
        g.font = body(sz, 600);
        if (g.measureText(s.small).width > room) {
          sz = 42;
          g.font = body(sz, 600);
          lines = wrapTo(g, s.small, room).slice(0, 2);
        }
      }
      let sw = 0;
      for (const l of lines) sw = Math.max(sw, g.measureText(l).width);
      const foot = s.foot ?? '';
      g.font = body(40, 700);
      const fw = foot ? g.measureText(foot).width : 0;
      // (as tall as what it says: no empty half)
      const ph = Math.min(H - 8, 34 + size * 0.95 + lines.length * (sz + 8) + (foot ? 72 : 0) + 22);
      const pw = Math.min(W - 8, Math.max(titleW, sw, fw + 30) + pad * 2);
      const px = cx - pw / 2;
      const py = (H - ph) / 2;
      ticket(g, px, py, pw, ph, hot ? PINK : PAPER);
      // (a halftone corner, the print's texture)
      g.save();
      ticketPath(g, px, py, pw, ph);
      g.clip();
      halftone(g, px + pw - 30, py + 20, 90, hot ? BLUE : PINK, 12);
      g.restore();
      let y = py + 30 + size * 0.78;
      g.font = display(size, 800);
      if (hot) {
        g.fillStyle = INK;
        g.fillText(s.big, px + pad, y);
      } else riso(g, s.big, px + pad, y, s.gold ? GOLD : BLUE, PINK, 5);
      g.font = body(sz, 600);
      g.fillStyle = INK;
      for (const l of lines) {
        y += sz + 10;
        g.fillText(l, px + pad, y);
      }
      if (foot) {
        // (what to do, like a line run over with a highlighter)
        y += 62;
        g.font = body(40, 700);
        g.fillStyle = YELLOW;
        g.globalCompositeOperation = 'multiply';
        g.fillRect(px + pad - 10, y - 34, fw + 20, 44);
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = INK;
        g.fillText(foot, px + pad, y);
      }
    }
    this.tex.needsUpdate = true;
  }

  /**
   * Playing: a ticket with the run printed big ("in a row" under it), the multiplier as a sticker beside it, and along
   * the bottom a strip of time, early to late, ±120 ms wide: the Perfect band (±60 ms) highlighted in the middle, and
   * your last hits as ticks where they landed (blue a Perfect, green a Good, pink early or late beyond it, at its edge),
   * the newest boldest. So you can see which way you're off, and put it right.
   */
  private drawPlay(g: CanvasRenderingContext2D, s: Extract<HudSay, { kind: 'play' }>): void {
    const px = 60;
    const pw = W - 120;
    const py = 10;
    const ph = H - 20;
    ticket(g, px, py, pw, ph, PAPER);
    const run = s.run >= 2 ? String(s.run) : '';
    const nx = px + 90;
    if (run) {
      g.font = display(150, 800);
      g.textAlign = 'left';
      riso(g, run, nx, 160, BLUE, PINK, 6);
      const rw = g.measureText(run).width;
      g.font = body(38, 700);
      g.fillStyle = INK;
      g.fillText('in a row', nx + rw + 22, 152);
    } else {
      g.font = body(40, 600);
      g.fillStyle = INK2;
      g.fillText('Hit what glows', nx, 130);
    }
    if (s.mult > 1) sticker(g, px + pw - 120, 100, 72, MULT_FILL[Math.max(1, Math.min(4, s.mult))], `×${s.mult}`, 78);
    // the strip, inside the ticket
    const x0 = px + 150;
    const x1 = px + pw - 150;
    const y = 232;
    const span = 0.12;
    const at = (o: number) => (x0 + x1) / 2 + (Math.max(-span, Math.min(span, o)) / span) * ((x1 - x0) / 2);
    g.fillStyle = INK;
    g.fillRect(x0, y - 2, x1 - x0, 4);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = YELLOW;
    g.fillRect(at(-0.06), y - 20, at(0.06) - at(-0.06), 40);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = INK;
    g.fillRect((x0 + x1) / 2 - 2, y - 24, 4, 48);
    g.font = body(32, 700);
    g.fillStyle = INK2;
    g.textAlign = 'right';
    g.fillText('early', x0 - 18, y + 11);
    g.textAlign = 'left';
    g.fillText('late', x1 + 18, y + 11);
    const N = s.errs.length;
    for (let k = 0; k < s.n; k++) {
      // oldest first, so the newest is drawn on top
      const o = s.errs[(s.i - s.n + k + N * 2) % N];
      const off = Math.abs(o);
      g.globalAlpha = 0.35 + 0.65 * ((k + 1) / s.n);
      g.fillStyle = off <= 0.06 ? BLUE : off <= 0.12 ? GREEN : PINK;
      const w = k === s.n - 1 ? 12 : 7;
      g.fillRect(at(o) - w / 2, y - 26, w, 52);
    }
    g.globalAlpha = 1;
  }

  /** Each frame: stand at kit-local `at`, turned to `eyeWorld`; stamp in, fade out when there's nothing to say. */
  update(dt: number, at: Vector3, eyeWorld: Vector3, calm: boolean, target: Vector3 | null = null): void {
    this.age += dt;
    this.pop += dt;
    // the leader to `target` (kit-local), drawn from the top of the sign; it grows in after the sign lands
    this.lk += ((target && this.say.kind === 'tip' ? 1 : 0) - this.lk) * Math.min(1, dt / 0.15);
    const lon = this.lk > 0.02 && !!target;
    this.leader.visible = this.leaderEnd.visible = lon;
    if (lon && target) {
      this.ld.set(at.x, at.y + SH * 0.5, at.z);
      const len = this.ld.distanceTo(target) * Math.min(1, this.lk * 1.2);
      this.ldir.subVectors(target, this.ld).normalize();
      this.lq.setFromUnitVectors(Hud.UP, this.ldir);
      this.leader.quaternion.copy(this.lq);
      this.leader.scale.set(1, Math.max(0.0001, len), 1);
      this.leader.position.copy(this.ld).addScaledVector(this.ldir, len / 2);
      this.leaderEnd.position.copy(target);
      this.leaderEnd.position.y += 0.004;
      this.leaderEnd.rotation.x = -Math.PI / 2;
      this.leaderEnd.scale.setScalar(1 + 0.25 * Math.sin(this.age * 8));
      (this.leader.material as MeshBasicMaterial).opacity = this.lk * this.shown;
    }
    this.ghostAge += dt;
    const want = this.say.kind === 'none' ? 0 : 1;
    // (the streak's number shows for a second and a half, then goes)
    const mult = (this.say.kind === 'mult' || this.say.kind === 'streak') && this.age > 1.5 ? 0 : 1;
    this.shown += (want * mult - this.shown) * Math.min(1, dt / 0.12);
    const ghostOn = this.ghostAge < 0.24;
    this.root.visible = this.shown > 0.01 || ghostOn;
    if (!this.root.visible) return;
    this.root.position.copy(at);
    this.eye.copy(eyeWorld);
    this.root.lookAt(this.eye);
    const m = this.mesh;
    m.visible = this.shown > 0.01;
    (m.material as MeshBasicMaterial).opacity = this.shown;
    const k = Math.min(1, this.age / 0.22);
    const out = 1 - Math.pow(1 - k, 3);
    if (this.say.kind === 'tip') {
      // a tip slides in along its plate's slant (from the right, rising a touch), eased out with a little overshoot
      const back = 1 + 2.4 * Math.pow(k - 1, 3) + 1.4 * Math.pow(k - 1, 2);
      m.position.set(calm ? 0 : SW * 0.18 * (1 - back), calm ? 0 : -SH * 0.12 * (1 - out), 0);
      m.scale.setScalar(1);
    } else {
      // a number stamps in: from 1.35x to 1 over 160 ms, a little overshoot; the run as you play pops a little each hit
      const q = Math.min(1, this.age / 0.16);
      const p = Math.min(1, this.pop / 0.12);
      m.position.set(0, 0, 0);
      m.scale.setScalar(calm ? 1 : 1 + 0.35 * (1 - q) * (1 - q) - 0.05 * Math.sin(Math.PI * q) + (this.say.kind === 'play' ? 0.06 * (1 - p) * (1 - p) : 0));
    }
    // leaving as it goes: the sign sinks a little as it fades
    if (!want || !mult) m.position.y -= SH * 0.15 * (1 - this.shown);
    const gm = this.ghost;
    gm.visible = ghostOn && !calm;
    if (gm.visible) {
      const u = this.ghostAge / 0.24;
      (gm.material as MeshBasicMaterial).opacity = Math.max(0, 1 - u) * 0.9;
      if (this.ghostTip) {
        gm.position.set(-SW * 0.22 * u * u, 0, -0.001);
        gm.scale.setScalar(1);
      } else {
        gm.position.set(0, 0, -0.001);
        gm.scale.setScalar(1 + 0.45 * u);
      }
    }
  }
}

/** `text` broken into lines no wider than `max` (in the context's current font). */
function wrapTo(g: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of text.split(' ')) {
    const t = line ? `${line} ${w}` : w;
    if (g.measureText(t).width > max && line) {
      out.push(line);
      line = w;
    } else line = t;
  }
  if (line) out.push(line);
  return out;
}
