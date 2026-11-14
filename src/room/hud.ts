/**
 * The HUD (drawn in the screen's own look, src/ui/theme.ts: the same count-in, plates, type and streak colours): a small sign standing on the desk just in front of the instrument, on your side, turned to your eyes —
 * where you're looking while you play (the screen at the back is for choosing; this is for doing). It shows one thing
 * at a time: the count-in (big, stamped), or the one thing to do now (a lesson's step, a first-time tip, "Hands up!"),
 * or the streak stepping up. Nothing at all when there's nothing to say. One canvas, redrawn only when what it says
 * changes; nothing allocated per frame.
 */
import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Vector3, type Object3D } from '@iwsdk/core';
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
  | { kind: 'tip'; big: string; small: string; gold?: boolean }
  | { kind: 'mult'; n: number }
  /** A streak milestone: the run's length. */
  | { kind: 'streak'; n: number };

export class Hud {
  readonly mesh: Mesh;
  private tex: CanvasTexture;
  private canvas: HTMLCanvasElement;
  private sig = '';
  private say: HudSay = { kind: 'none' };
  /** Seconds since what it says changed (the stamp and the fade). */
  private age = 9;
  private shown = 0;
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
    this.mesh.visible = false;
    parent.add(this.mesh);
    whenFonts(() => {
      this.sig = '';
    });
  }

  /** What to show now (called every frame; redraws only when it changes). */
  set(s: HudSay): void {
    const sig = s.kind === 'count' || s.kind === 'mult' || s.kind === 'streak' ? `${s.kind}${s.n}` : s.kind === 'tip' ? `tip${s.big}|${s.small}|${s.gold ? 1 : 0}` : s.kind;
    if (sig === this.sig) return;
    // (a tip that's only reworded doesn't stamp in again)
    const restamp = !(s.kind === 'tip' && this.say.kind === 'tip' && this.say.big === s.big);
    this.sig = sig;
    this.say = s;
    if (restamp) this.age = 0;
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
      let size = 92;
      g.textBaseline = 'middle';
      g.textAlign = 'left';
      for (; size > 56; size -= 4) {
        g.font = display(size, 900);
        if (g.measureText(s.big).width <= W - 170) break;
      }
      const bw = g.measureText(s.big).width;
      let sz = 50;
      if (s.small)
        for (; sz > 34; sz -= 2) {
          g.font = body(sz, 600);
          if (g.measureText(s.small).width <= W - 170) break;
        }
      const sw = s.small ? g.measureText(s.small).width : 0;
      const pw = Math.min(W - 16, Math.max(bw, sw) + 130);
      const ph = s.small ? 236 : 150;
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
    }
    this.tex.needsUpdate = true;
  }

  /** Each frame: stand at kit-local `at`, turned to `eyeWorld`; stamp in, fade out when there's nothing to say. */
  update(dt: number, at: Vector3, eyeWorld: Vector3, calm: boolean): void {
    this.age += dt;
    const want = this.say.kind === 'none' ? 0 : 1;
    // (the streak's number shows for a second and a half, then goes)
    const mult = (this.say.kind === 'mult' || this.say.kind === 'streak') && this.age > 1.5 ? 0 : 1;
    this.shown += (want * mult - this.shown) * Math.min(1, dt / 0.12);
    const m = this.mesh;
    m.visible = this.shown > 0.01;
    if (!m.visible) return;
    (m.material as MeshBasicMaterial).opacity = this.shown;
    m.position.copy(at);
    this.eye.copy(eyeWorld);
    m.lookAt(this.eye);
    // stamped: from 1.3× to 1 over 160 ms, a little overshoot (still, under calm motion)
    const k = Math.min(1, this.age / 0.16);
    const s = calm ? 1 : 1 + 0.3 * (1 - k) * (1 - k) - 0.04 * Math.sin(Math.PI * k);
    m.scale.setScalar(s);
  }
}
