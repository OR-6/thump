/**
 * The HUD (drawn in the screen's own look, src/ui/theme.ts: the same count-in, plates, type and streak colours): a small sign standing on the desk just in front of the instrument, on your side, turned to your eyes —
 * where you're looking while you play (the screen at the back is for choosing; this is for doing). It shows one thing
 * at a time: the count-in (big, stamped), or the one thing to do now (a lesson's step, a first-time tip, "Hands up!"),
 * or the streak stepping up. Nothing at all when there's nothing to say. One canvas, redrawn only when what it says
 * changes; nothing allocated per frame.
 */
import { CanvasTexture, CylinderGeometry, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Quaternion, RingGeometry, SRGBColorSpace, Vector3, type Object3D } from '@iwsdk/core';
import { BODY, DISPLAY, whenFonts } from '../ui/fonts.js';
import { BRAND, withAlpha } from '../ui/theme.js';

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
    const hot = new MeshBasicMaterial({ color: BRAND.hot, transparent: true, depthWrite: false, depthTest: false, toneMapped: false });
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
    const sig = s.kind === 'count' || s.kind === 'mult' || s.kind === 'streak' ? `${s.kind}${s.n}` : s.kind === 'tip' ? `tip${s.big}|${s.small}|${s.gold ? 1 : 0}${s.hot ? 1 : 0}|${s.foot ?? ''}|${s.icon ?? ''}` : s.kind;
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
    g.lineCap = 'round';
    g.textBaseline = 'middle';
    const cx = W / 2;
    const cy = H / 2;
    const B = BRAND;
    // the brand's mark: a solid core and broken rings (the icon, the count-in, the streak are all this one shape)
    const ring = (x: number, y: number, r: number, w: number, dash: number[], rot: number, col: string) => {
      g.save();
      g.translate(x, y);
      g.rotate(rot);
      g.strokeStyle = col;
      g.lineWidth = w;
      g.setLineDash(dash);
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    };
    const outlined = (text: string, x: number, y: number, fill: string, w = 12) => {
      g.strokeStyle = B.plum;
      g.lineWidth = w;
      g.strokeText(text, x, y);
      g.fillStyle = fill;
      g.fillText(text, x, y);
    };
    if (s.kind === 'count') {
      // the count-in: four arcs round the number, one goes each beat (4 3 2 1)
      for (let q = 0; q < 4; q++) {
        if (q >= s.n) continue;
        g.save();
        g.translate(cx, cy);
        g.rotate(-Math.PI / 2 + q * (Math.PI / 2));
        g.strokeStyle = B.hot;
        g.lineWidth = 20;
        g.lineCap = 'butt';
        g.beginPath();
        g.arc(0, 0, 122, 0.16, Math.PI / 2 - 0.16);
        g.stroke();
        g.restore();
      }
      g.textAlign = 'center';
      g.font = `900 176px ${DISPLAY}`;
      outlined(String(s.n), cx, cy + 10, B.ink);
    } else if (s.kind === 'go') {
      // GO: the whole mark, struck
      ring(cx, cy, 128, 20, [300, 90, 180, 110], -0.3, B.hot);
      ring(cx, cy, 86, 26, [400, 140], 0.6, B.hot);
      g.fillStyle = B.ink;
      g.beginPath();
      g.arc(cx, cy, 52, 0, Math.PI * 2);
      g.fill();
      g.textAlign = 'center';
      g.font = `900 64px ${DISPLAY}`;
      g.fillStyle = B.plum;
      g.fillText('GO', cx, cy + 4);
    } else if (s.kind === 'mult') {
      // the multiplier: as many broken rings round the core as the streak is worth
      const mx = cx - 150;
      const col = s.n >= 4 ? B.gold : B.hot;
      for (let r = 0; r < s.n; r++) ring(mx, cy, 50 + r * 30, 14, [140 + r * 60, 40 + r * 10], r * 0.9, col);
      g.fillStyle = B.ink;
      g.beginPath();
      g.arc(mx, cy, 30, 0, Math.PI * 2);
      g.fill();
      g.textAlign = 'left';
      g.font = `900 190px ${DISPLAY}`;
      outlined(`×${s.n}`, cx - 10, cy + 12, s.n >= 4 ? B.gold : B.ink);
    } else if (s.kind === 'streak') {
      g.textAlign = 'center';
      g.font = `900 176px ${DISPLAY}`;
      outlined(String(s.n), cx, cy - 22, B.ink);
      g.font = `700 46px ${BODY}`;
      outlined('IN A ROW', cx, cy + 96, B.ink2, 8);
    } else {
      // a tip: a plum plate, straight edges and one cut corner; the command big and upright, at most one line under
      // it, and what to do to go on on a hot tab
      const big = s.big.toUpperCase();
      const room = W - 120 - (s.icon ? 150 : 0);
      let size = 120;
      for (; size > 64; size -= 4) {
        g.font = `900 ${size}px ${DISPLAY}`;
        if (g.measureText(big).width <= room) break;
      }
      const bw = g.measureText(big).width;
      // the line under it: one line if it fits at 50 px, else two at 44
      let sz = 50;
      let lines: string[] = s.small ? [s.small] : [];
      if (s.small) {
        g.font = `700 ${sz}px ${BODY}`;
        if (g.measureText(s.small).width > room) {
          sz = 44;
          g.font = `700 ${sz}px ${BODY}`;
          lines = wrapTo(g, s.small, room).slice(0, 2);
        }
      }
      let sw = 0;
      for (const l of lines) sw = Math.max(sw, g.measureText(l).width);
      g.font = `800 42px ${DISPLAY}`;
      const foot = s.foot ? s.foot.toUpperCase() : '';
      const fw = foot ? g.measureText(foot).width + 56 : 0;
      const pw = Math.min(W - 8, Math.max(bw, sw, fw) + 96 + (s.icon ? 150 : 0));
      const ph = H - 8 - (foot ? 0 : 0);
      const px = cx - pw / 2;
      const py = 4;
      const cut = 34;
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(px + pw - cut, py);
      g.lineTo(px + pw, py + cut);
      g.lineTo(px + pw, py + ph);
      g.lineTo(px, py + ph);
      g.closePath();
      g.fillStyle = withAlpha(B.plum, 0.95);
      g.fill();
      g.lineWidth = 4;
      g.strokeStyle = B.line;
      g.stroke();
      const tx = px + 48;
      const big1 = lines.length > 1 ? py + 66 : s.small || foot ? py + 82 : py + ph / 2 + 4;
      g.textAlign = 'left';
      g.font = `900 ${size}px ${DISPLAY}`;
      g.fillStyle = s.gold ? B.gold : s.hot ? B.hot : B.ink;
      g.fillText(big, tx, big1);
      if (lines.length) {
        g.font = `700 ${sz}px ${BODY}`;
        g.fillStyle = B.ink2;
        lines.forEach((l, i) => g.fillText(l, tx, big1 + size / 2 + (lines.length > 1 ? 26 : 34) + i * (sz + 6)));
      }
      if (foot) {
        // the hot tab along the bottom: what you do to go on
        const th = 62;
        const ty = py + ph - th;
        g.fillStyle = B.hot;
        g.fillRect(px, ty, fw, th);
        g.font = `800 42px ${DISPLAY}`;
        g.fillStyle = B.hotInk;
        g.fillText(foot, px + 28, ty + th / 2 + 2);
      }
      if (s.icon === 'stick') {
        // a fist holding a stick: off-white silhouette, the stick out of the top of the fist, angled in
        const ix = px + pw - 92;
        const iy = py + ph / 2 + 26;
        g.save();
        g.translate(ix, iy);
        g.strokeStyle = B.ink;
        g.lineWidth = 12;
        g.beginPath();
        g.moveTo(-26, 26);
        g.lineTo(34, -92);
        g.stroke();
        g.fillStyle = B.ink;
        g.beginPath();
        g.moveTo(-40, -36);
        g.lineTo(26, -36);
        g.lineTo(40, -22);
        g.lineTo(40, 30);
        g.lineTo(-40, 30);
        g.closePath();
        g.fill();
        g.strokeStyle = B.plum;
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

  /** Each frame: stand at kit-local `at`, turned to `eyeWorld`; stamp in, fade out when there's nothing to say. */
  update(dt: number, at: Vector3, eyeWorld: Vector3, calm: boolean, target: Vector3 | null = null): void {
    this.age += dt;
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
