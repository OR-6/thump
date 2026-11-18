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
import { BRAND, MULT_PAIR, NEON, body, display, glowText, hgrad, rr, slant, vgrad } from '../ui/theme.js';

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
    const hot = new MeshBasicMaterial({ color: NEON.cyan, transparent: true, depthWrite: false, depthTest: false, toneMapped: false });
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
    const cx = W / 2;
    const DARK = '#1a0b2e';
    // a number exactly as the screen draws its count-in: chunky italic, outlined, a gradient with a glow
    const big = (t: string, px: number, y: number, a: string, b: string, glow: string) => {
      g.font = display(px, 900);
      g.textBaseline = 'alphabetic';
      g.textAlign = 'left';
      const x = cx - g.measureText(t).width / 2;
      g.lineWidth = 14;
      g.strokeStyle = DARK;
      g.strokeText(t, x, y);
      glowText(g, t, x, y, vgrad(g, y - px * 0.8, y, a, b), glow, 24);
    };
    if (s.kind === 'count') big(String(s.n), 270, 262, NEON.cyan, NEON.magenta, NEON.magenta);
    else if (s.kind === 'go') big('GO!', 230, 250, NEON.cyan, NEON.magenta, NEON.magenta);
    else if (s.kind === 'mult') {
      // the screen's multiplier chip, large: a slanted plate in the streak's colours, the number dark on it
      const [a, b] = MULT_PAIR[Math.max(1, Math.min(4, s.n))];
      const t = `×${s.n}`;
      g.font = display(200, 900);
      const w = g.measureText(t).width + 120;
      slant(g, cx - w / 2, 34, w, 232);
      g.shadowColor = b;
      g.shadowBlur = 22;
      g.fillStyle = vgrad(g, 34, 266, a, b);
      g.fill();
      g.shadowBlur = 0;
      g.textBaseline = 'alphabetic';
      g.textAlign = 'left';
      g.fillStyle = DARK;
      g.fillText(t, cx - w / 2 + 60, 226);
    } else if (s.kind === 'play') {
      this.drawPlay(g, s);
    } else if (s.kind === 'streak') {
      // the screen's run: the count in the streak's colours, COMBO under it
      const [a, b] = MULT_PAIR[4];
      big(String(s.n), 190, 196, a, b, b);
      g.font = display(54, 700);
      g.textAlign = 'center';
      g.fillStyle = NEON.muted;
      g.fillText('COMBO', cx, 262);
    } else {
      // a tip: one of the screen's plates (its indigo, its solid edge); the command in its italic display face, a line
      // under it in its body face, and what to do to go on on its primary button
      const cmd = s.big.toUpperCase();
      const room = W - 120 - (s.icon ? 150 : 0);
      let size = 108;
      for (; size > 64; size -= 4) {
        g.font = display(size, 900);
        if (g.measureText(cmd).width <= room) break;
      }
      const cw = g.measureText(cmd).width;
      let sz = 48;
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
      const foot = s.foot ? s.foot.toUpperCase() : '';
      g.font = display(40, 900);
      const fw = foot ? g.measureText(foot).width + 90 : 0;
      const pw = Math.min(W - 8, Math.max(cw, sw, fw) + 100 + (s.icon ? 150 : 0));
      const px = cx - pw / 2;
      const py = 4;
      const ph = H - 8;
      rr(g, px, py, pw, ph, 30);
      g.fillStyle = vgrad(g, py, py + ph, 'rgba(29,11,44,0.95)', 'rgba(38,16,58,0.95)');
      g.fill();
      g.lineWidth = 4;
      g.strokeStyle = '#3d2357';
      g.stroke();
      const tx = px + 48;
      const top = lines.length > 1 ? py + 64 : lines.length || foot ? py + 80 : py + ph / 2 + 6;
      g.textBaseline = 'middle';
      g.textAlign = 'left';
      g.font = display(size, 900);
      const fill = s.gold ? vgrad(g, top - size / 2, top + size / 2, '#fff1a8', '#ffb000') : s.hot ? vgrad(g, top - size / 2, top + size / 2, '#ffffff', NEON.cyan) : NEON.ink;
      glowText(g, cmd, tx, top, fill, s.gold ? NEON.gold : s.hot ? NEON.cyan : 'rgba(255,181,71,0.25)', s.hot || s.gold ? 18 : 8);
      if (lines.length) {
        g.font = body(sz, 600);
        g.fillStyle = NEON.muted;
        lines.forEach((l, i) => g.fillText(l, tx, top + size / 2 + (lines.length > 1 ? 24 : 32) + i * (sz + 6)));
      }
      if (foot) {
        // the screen's primary button: a slanted plate, magenta into orange, white italic on it
        const bh = 64;
        const by = py + ph - bh - 14;
        slant(g, tx - 6, by, fw, bh);
        g.fillStyle = BRAND.hot;
        g.fill();
        g.font = display(40, 900);
        g.fillStyle = '#ffffff';
        g.fillText(foot, tx + 34, by + bh / 2 + 2);
      }
      if (s.icon === 'stick') {
        // a fist holding a stick, in the screen's ink
        const ix = px + pw - 96;
        const iy = py + ph / 2 + 20;
        g.save();
        g.translate(ix, iy);
        g.strokeStyle = NEON.ink;
        g.lineWidth = 12;
        g.beginPath();
        g.moveTo(-26, 26);
        g.lineTo(34, -92);
        g.stroke();
        g.fillStyle = NEON.ink;
        rr(g, -40, -36, 80, 66, 18);
        g.fill();
        g.strokeStyle = DARK;
        g.lineWidth = 4;
        for (const y of [-16, 4]) {
          g.beginPath();
          g.moveTo(-28, y);
          g.lineTo(28, y);
          g.stroke();
        }
        g.restore();
      }
    }
    this.tex.needsUpdate = true;
  }

  /**
   * Playing: the run big in the streak's colours with COMBO under it, the multiplier's chip beside it; along the bottom
   * a strip of time, early to late, ±120 ms wide: the Perfect band (±60 ms) in the middle, and your last hits as ticks
   * where they landed (cyan a Perfect, green a Good, orange early or violet late beyond it, at its edge), the newest
   * brightest. So you can see which way you're off, and put it right.
   */
  private drawPlay(g: CanvasRenderingContext2D, s: Extract<HudSay, { kind: 'play' }>): void {
    const DARK = '#1a0b2e';
    const [a, b] = MULT_PAIR[Math.max(1, Math.min(4, s.mult))];
    g.textBaseline = 'alphabetic';
    // the run (from 2: one hit isn't a run)
    const run = s.run >= 2 ? String(s.run) : '';
    const nx = s.mult > 1 ? 400 : W / 2;
    if (run) {
      g.font = display(160, 900);
      g.textAlign = 'left';
      const x = nx - g.measureText(run).width / 2;
      g.lineWidth = 12;
      g.strokeStyle = DARK;
      g.strokeText(run, x, 150);
      glowText(g, run, x, 150, vgrad(g, 30, 150, a, b), b, 20);
      g.font = display(40, 700);
      g.textAlign = 'center';
      g.fillStyle = NEON.muted;
      g.fillText('COMBO', nx, 196);
    }
    if (s.mult > 1) {
      // the multiplier: the screen's chip, its number dark on it
      const t = `×${s.mult}`;
      g.font = display(110, 900);
      const w = g.measureText(t).width + 70;
      const x = 640;
      slant(g, x, 40, w, 130);
      g.shadowColor = b;
      g.shadowBlur = 16;
      g.fillStyle = vgrad(g, 40, 170, a, b);
      g.fill();
      g.shadowBlur = 0;
      g.textAlign = 'left';
      g.fillStyle = DARK;
      g.fillText(t, x + 35, 146);
    }
    // the strip
    const x0 = 150;
    const x1 = W - 150;
    const y = 252;
    const span = 0.12;
    const at = (o: number) => (x0 + x1) / 2 + (Math.max(-span, Math.min(span, o)) / span) * ((x1 - x0) / 2);
    rr(g, x0, y - 6, x1 - x0, 12, 6);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fill();
    rr(g, at(-0.06), y - 9, at(0.06) - at(-0.06), 18, 9);
    g.fillStyle = 'rgba(255,181,71,0.28)';
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.fillRect((x0 + x1) / 2 - 2, y - 22, 4, 44);
    g.font = body(30, 700);
    g.fillStyle = NEON.muted;
    g.textAlign = 'right';
    g.fillText('EARLY', x0 - 18, y + 11);
    g.textAlign = 'left';
    g.fillText('LATE', x1 + 18, y + 11);
    const N = s.errs.length;
    for (let k = 0; k < s.n; k++) {
      // oldest first, so the newest is drawn on top
      const o = s.errs[(s.i - s.n + k + N * 2) % N];
      const off = Math.abs(o);
      g.globalAlpha = 0.3 + 0.7 * ((k + 1) / s.n);
      g.fillStyle = off <= 0.06 ? NEON.cyan : off <= 0.12 ? '#3cf0a0' : o < 0 ? '#ff9a3c' : '#d2a54a';
      const w = k === s.n - 1 ? 10 : 6;
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
