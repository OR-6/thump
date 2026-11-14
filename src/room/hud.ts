/**
 * The HUD (drawn in the screen's own look, src/ui/theme.ts: the same count-in, plates, type and streak colours): a small sign standing on the desk just in front of the instrument, on your side, turned to your eyes —
 * where you're looking while you play (the screen at the back is for choosing; this is for doing). It shows one thing
 * at a time: the count-in (big, stamped), or the one thing to do now (a lesson's step, a first-time tip, "Hands up!"),
 * or the streak stepping up. Nothing at all when there's nothing to say. One canvas, redrawn only when what it says
 * changes; nothing allocated per frame.
 */
import { CanvasTexture, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Vector3, type Object3D } from '@iwsdk/core';
import { whenFonts } from '../ui/fonts.js';
import { MULT_PAIR, NEON, body, display, glowText, slant, vgrad } from '../ui/theme.js';

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
  | { kind: 'tip'; big: string; small: string; gold?: boolean; foot?: string; icon?: 'stick' }
  | { kind: 'mult'; n: number }
  /** A streak milestone: the run's length. */
  | { kind: 'streak'; n: number };

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
    whenFonts(() => {
      this.sig = '';
    });
  }

  /** What to show now (called every frame; redraws only when it changes). */
  set(s: HudSay): void {
    const sig = s.kind === 'count' || s.kind === 'mult' || s.kind === 'streak' ? `${s.kind}${s.n}` : s.kind === 'tip' ? `tip${s.big}|${s.small}|${s.gold ? 1 : 0}|${s.foot ?? ''}|${s.icon ?? ''}` : s.kind;
    if (sig === this.sig) return;
    // (a tip that's only reworded doesn't stamp in again)
    const restamp = !(s.kind === 'tip' && this.say.kind === 'tip' && this.say.big === s.big);
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
    const cx = W / 2;
    if (s.kind === 'count' || s.kind === 'go') {
      // the count-in exactly as the screen draws its numbers: chunky italic, cyan into magenta, glowing, outlined
      const t = s.kind === 'count' ? String(s.n) : 'GO!';
      g.font = display(t.length > 1 ? 210 : 260, 900);
      g.textBaseline = 'alphabetic';
      g.textAlign = 'left';
      const x = cx - g.measureText(t).width / 2;
      const y = 252;
      g.lineWidth = 14;
      g.strokeStyle = '#1a0b2e';
      g.strokeText(t, x, y);
      glowText(g, t, x, y, vgrad(g, 40, y, NEON.cyan, NEON.magenta), NEON.magenta, 26);
    } else if (s.kind === 'mult' || s.kind === 'streak') {
      // the streak as the screen shows its run: the number in the multiplier's colours, "in a row" under it
      const pair = MULT_PAIR[Math.max(0, Math.min(4, s.kind === 'mult' ? s.n : 4))];
      const t = s.kind === 'mult' ? `×${s.n}` : String(s.n);
      g.font = display(s.kind === 'mult' ? 230 : 190, 900);
      g.textBaseline = 'alphabetic';
      g.textAlign = 'left';
      const x = cx - g.measureText(t).width / 2;
      const y = s.kind === 'mult' ? 248 : 200;
      g.lineWidth = 14;
      g.strokeStyle = '#1a0b2e';
      g.strokeText(t, x, y);
      glowText(g, t, x, y, vgrad(g, 40, y, pair[0], pair[1]), pair[1], 24);
      if (s.kind === 'streak') {
        g.font = body(48, 700);
        g.textAlign = 'center';
        g.lineWidth = 8;
        g.strokeText('in a row', cx, 262);
        g.fillStyle = NEON.muted;
        g.fillText('in a row', cx, 262);
      }
    } else {
      // a tip on one of the screen's plates: slanted, the stage's indigo with its solid edge; the command in the
      // display face, the line under it in the body face; cyan marks it (gold for the spotlight)
      const accent = s.gold ? NEON.gold : NEON.cyan;
      // (room for the icon on the right, when there is one)
      const room = W - 170 - (s.icon ? 150 : 0);
      let size = 92;
      g.textBaseline = 'middle';
      g.textAlign = 'left';
      for (; size > 56; size -= 4) {
        g.font = display(size, 900);
        if (g.measureText(s.big).width <= room) break;
      }
      const bw = g.measureText(s.big).width;
      let sz = 50;
      if (s.small)
        for (; sz > 30; sz -= 2) {
          g.font = body(sz, 600);
          if (g.measureText(s.small).width <= room) break;
        }
      const sw = s.small ? g.measureText(s.small).width : 0;
      g.font = body(40, 800);
      const fw = s.foot ? g.measureText(`▶  ${s.foot}`).width : 0;
      const iw = s.icon ? 150 : 0;
      const pw = Math.min(W - 16, Math.max(bw, sw, fw) + 130 + iw);
      const ph = s.foot ? 290 : s.small ? 236 : 150;
      const px = cx - pw / 2;
      const py = (H - ph) / 2;
      slant(g, px, py, pw, ph);
      g.fillStyle = vgrad(g, py, py + ph, 'rgba(26,13,56,0.95)', 'rgba(36,16,70,0.95)');
      g.fill();
      g.lineWidth = 4;
      g.strokeStyle = '#3b2670';
      g.stroke();
      // the accent: the plate's leading edge lit
      const k = Math.round(ph * 0.176);
      g.beginPath();
      g.moveTo(px + k, py);
      g.lineTo(px, py + ph);
      g.lineWidth = 8;
      g.strokeStyle = accent;
      g.shadowColor = accent;
      g.shadowBlur = 14;
      g.stroke();
      g.shadowBlur = 0;
      const tx = px + 66;
      const y1 = s.small ? py + 82 : H / 2;
      g.font = display(size, 900);
      glowText(g, s.big, tx, y1, s.gold ? vgrad(g, y1 - size / 2, y1 + size / 2, '#fff1a8', '#ffb000') : NEON.ink, s.gold ? NEON.gold : 'rgba(51,225,255,0.35)', 12);
      if (s.small) {
        g.font = body(sz, 600);
        g.fillStyle = NEON.muted;
        g.fillText(s.small, tx - 8, py + 176);
      }
      // a fist holding a stick, drawn in the screen's ink: the stick out of the top of the fist, angled in
      if (s.icon === 'stick') {
        const ix = px + pw - 105;
        const iy = py + ph / 2 + 30;
        g.save();
        g.translate(ix, iy);
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.strokeStyle = accent;
        g.shadowColor = accent;
        g.shadowBlur = 10;
        g.lineWidth = 12;
        g.beginPath();
        g.moveTo(-34, 30);
        g.lineTo(40, -92);
        g.stroke();
        g.shadowBlur = 0;
        g.fillStyle = NEON.ink;
        rrPath(g, -40, -40, 80, 70, 22);
        g.fill();
        g.strokeStyle = '#1a0b2e';
        g.lineWidth = 4;
        for (const y of [-14, 4]) {
          g.beginPath();
          g.moveTo(-26, y);
          g.lineTo(26, y);
          g.stroke();
        }
        g.restore();
      }
      // what to do to go on: in the accent, under a hairline
      if (s.foot) {
        g.fillStyle = 'rgba(179,166,214,0.25)';
        g.fillRect(tx - 14, py + 214, pw - 120, 2);
        g.font = body(40, 800);
        g.fillStyle = accent;
        g.fillText(`▶  ${s.foot}`, tx - 18, py + 252);
      }
    }
    this.tex.needsUpdate = true;
  }

  /** Each frame: stand at kit-local `at`, turned to `eyeWorld`; stamp in, fade out when there's nothing to say. */
  update(dt: number, at: Vector3, eyeWorld: Vector3, calm: boolean): void {
    this.age += dt;
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
      // a number stamps in: from 1.35x to 1 over 160 ms, a little overshoot
      const q = Math.min(1, this.age / 0.16);
      m.position.set(0, 0, 0);
      m.scale.setScalar(calm ? 1 : 1 + 0.35 * (1 - q) * (1 - q) - 0.05 * Math.sin(Math.PI * q));
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

function rrPath(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
