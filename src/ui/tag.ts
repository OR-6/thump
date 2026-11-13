/**
 * A label the way musicians label things: a strip of masking tape with torn ends, written on in marker, a stroke of
 * the instrument's colour under the words. It turns up where something was found ("Your door is a marimba"), facing
 * you, a little crooked like a real one, and peels away after a couple of seconds. Text ≤ 6 words.
 */
import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Vector3 } from '@iwsdk/core';
import { MARKER, whenFonts } from './fonts.js';


export class Tag {
  readonly mesh: Mesh;
  private canvas = document.createElement('canvas');
  private tex: CanvasTexture;
  private mat: MeshBasicMaterial;
  private life = 0;
  private text = '';
  /** Seconds a tag stays up. */
  hold = 2.2;

  /** `widthM` is the room a tag has: text keeps its size and only shrinks past it (it's drawn centred, the rest clear). */
  constructor(readonly widthM = 0.46, readonly heightM = 0.05) {
    this.canvas.width = Math.round((768 * widthM) / 0.2);
    this.canvas.height = Math.round((768 * heightM) / 0.2);
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.mat = new MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false, opacity: 0 });
    this.mesh = new Mesh(new PlaneGeometry(widthM, heightM), this.mat);
    this.mesh.renderOrder = 20;
    this.mesh.visible = false;
    whenFonts(() => {
      if (this.text) this.draw(this.text, this.accent);
    });
  }
  private accent = 0xffffff;

  /** Show `text` (with an accent colour) at world `at`, facing `head`. Empty text hides it. */
  show(text: string, accent: number, at: Vector3 | null, head: Vector3 | null, hold = this.hold): void {
    this.hold = hold;
    if (!text) {
      this.life = 0;
      this.mesh.visible = false;
      return;
    }
    if (text !== this.text) this.draw(text, accent);
    if (at) this.mesh.position.copy(at);
    if (head) this.mesh.lookAt(head);
    // stuck on by hand: never quite level
    this.mesh.rotateZ(this.tilt);
    // as legible across the room as at the desk: it grows with distance past 60 cm
    if (at && head) this.mesh.scale.setScalar(Math.min(4, Math.max(1, at.distanceTo(head) / 0.6)));
    this.life = hold;
    this.mesh.visible = true;
  }

  /** Stuck on for good (a part's label on the thing that plays it): no fade, a bump when it plays. */
  private pinned = false;
  private base = 1;
  private kick = 0;
  pin(text: string, accent: number, at: Vector3, head: Vector3): void {
    this.show(text, accent, at, head, 1);
    this.pinned = true;
    this.mesh.scale.setScalar(1);
    this.base = 1;
    this.mat.opacity = 0.95;
  }
  unpin(): void {
    this.pinned = false;
    this.mesh.visible = false;
  }
  get pinnedNow(): boolean {
    return this.pinned;
  }
  /** Its part just played. */
  bump(): void {
    this.kick = 1;
  }
  /** Muted (a hand over its thing): the tape goes pale. */
  dim(on: boolean): void {
    if (this.pinned) this.mat.opacity = on ? 0.35 : 0.95;
  }
  /** Turn to face you again (you moved), keeping its lean. */
  face(head: Vector3): void {
    this.mesh.lookAt(head);
    this.mesh.rotateZ(this.tilt);
  }

  get shownText(): string {
    return this.mesh.visible ? this.text : '';
  }

  private tilt = 0;

  private draw(text: string, accent: number): void {
    this.text = text;
    this.accent = accent;
    const c = this.canvas;
    const g = c.getContext('2d')!;
    const W = c.width;
    const H = c.height;
    g.clearRect(0, 0, W, H);
    // the same words always tear and lean the same way
    let seed = 7;
    for (let k = 0; k < text.length; k++) seed = (seed * 31 + text.charCodeAt(k)) % 2147483647;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    this.tilt = (rnd() - 0.5) * 0.07;
    let px = Math.round(H * 0.5);
    g.font = `${px}px ${MARKER}`;
    while (g.measureText(text).width > W - H * 1.4 && px > 12) g.font = `${--px}px ${MARKER}`;
    const tw = g.measureText(text).width;
    const w = tw + H * 1.1;
    const x0 = (W - w) / 2;
    const top = H * 0.12;
    const bot = H * 0.88;
    // the tape: torn at both ends
    g.beginPath();
    g.moveTo(x0, top);
    g.lineTo(x0 + w, top);
    for (let y = top; y < bot; y += H * 0.07) g.lineTo(x0 + w + (rnd() - 0.5) * H * 0.12, y);
    g.lineTo(x0 + w, bot);
    g.lineTo(x0, bot);
    for (let y = bot; y > top; y -= H * 0.07) g.lineTo(x0 + (rnd() - 0.5) * H * 0.12, y);
    g.closePath();
    g.fillStyle = '#ece2c6';
    g.fill();
    // its paper: faint fibres along it, and a slightly darker edge where it's thin
    g.save();
    g.clip();
    for (let k = 0; k < 26; k++) {
      g.fillStyle = `rgba(120, 100, 60, ${0.04 + rnd() * 0.05})`;
      g.fillRect(x0 + rnd() * w, top + rnd() * (bot - top), w * (0.1 + rnd() * 0.3), 1 + rnd() * 1.5);
    }
    g.fillStyle = 'rgba(110, 90, 50, 0.10)';
    g.fillRect(x0, top, w, H * 0.035);
    g.fillRect(x0, bot - H * 0.035, w, H * 0.035);
    g.restore();
    // the words, in marker
    const tx = x0 + H * 0.55;
    const ty = H * 0.47;
    g.fillStyle = '#17150f';
    g.textBaseline = 'middle';
    g.fillText(text, tx, ty);
    // and a stroke of the instrument's colour under them, the way you'd underline it
    g.strokeStyle = `#${accent.toString(16).padStart(6, '0')}`;
    g.lineWidth = H * 0.06;
    g.lineCap = 'round';
    g.beginPath();
    const uy = H * 0.76;
    g.moveTo(tx + tw * 0.02, uy + (rnd() - 0.5) * 3);
    g.quadraticCurveTo(tx + tw * 0.5, uy + (rnd() - 0.5) * 8, tx + tw * 0.96, uy - 2 + (rnd() - 0.5) * 4);
    g.stroke();
    this.tex.needsUpdate = true;
  }

  update(dt: number): void {
    if (!this.mesh.visible) return;
    if (this.pinned) {
      if (this.kick > 0) {
        this.kick = Math.max(0, this.kick - dt * 7);
        this.mesh.scale.setScalar(this.base * (1 + 0.16 * this.kick));
      }
      return;
    }
    this.life -= dt;
    const k = Math.min(1, Math.min(this.life / 0.3, (this.hold - this.life) / 0.15 + 0.2));
    this.mat.opacity = Math.max(0, k);
    if (this.life <= 0) this.mesh.visible = false;
  }
}

/** `?debug=1`: three lines of small text on dark glass (behind the module), for device sessions. */
export class DebugBoard {
  readonly mesh: Mesh;
  private canvas = document.createElement('canvas');
  private tex: CanvasTexture;
  private last = '';

  constructor(widthM = 0.42, heightM = 0.075) {
    this.canvas.width = 1400;
    this.canvas.height = Math.round((1400 * heightM) / widthM);
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.mesh = new Mesh(new PlaneGeometry(widthM, heightM), new MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, toneMapped: false }));
    this.mesh.renderOrder = 19;
  }

  set(lines: string[]): void {
    const key = lines.join('\n');
    if (key === this.last) return;
    this.last = key;
    const c = this.canvas;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(10,10,12,0.85)';
    g.beginPath();
    g.roundRect(0, 0, c.width, c.height, 16);
    g.fill();
    g.fillStyle = '#e8e4da';
    const lh = c.height / (lines.length + 0.4);
    g.font = `500 ${Math.round(lh * 0.62)}px ui-monospace, Menlo, monospace`;
    g.textBaseline = 'middle';
    lines.forEach((l, i) => g.fillText(l, 18, lh * (i + 0.7)));
    this.tex.needsUpdate = true;
  }
}
