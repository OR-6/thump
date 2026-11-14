/**
 * A label: a small pill of dark glass with white words, the instrument's colour as a dot at its start. It turns up
 * where something was found, facing you, and fades after a couple of seconds. Text ≤ 6 words.
 */
import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Vector3 } from '@iwsdk/core';
import { FONT, whenFonts } from './fonts.js';


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
  /** `onSurface`: on something (it hides behind your fingers like the thing it's on); else a label over all. */
  constructor(readonly widthM = 0.46, readonly heightM = 0.05, onSurface = false) {
    this.canvas.width = Math.round((768 * widthM) / 0.2);
    this.canvas.height = Math.round((768 * heightM) / 0.2);
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.mat = new MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, depthTest: onSurface, toneMapped: false, opacity: 0 });
    this.mesh = new Mesh(new PlaneGeometry(widthM, heightM), this.mat);
    this.mesh.renderOrder = 20;
    this.mesh.visible = false;
    whenFonts(() => {
      if (this.text) this.draw(this.text, this.accent);
    });
  }
  private accent = 0xffffff;

  /** Let its texture, material and plane go (a tag that's done for good). */
  dispose(): void {
    this.mesh.removeFromParent();
    this.tex.dispose();
    this.mat.dispose();
    this.mesh.geometry.dispose();
  }

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
  /** Muted (a hand over its thing): the label goes pale. */
  dim(on: boolean): void {
    if (this.pinned) this.mat.opacity = on ? 0.35 : 0.95;
  }
  /** Turn to face you again (you moved). */
  face(head: Vector3): void {
    this.mesh.lookAt(head);
  }

  get shownText(): string {
    return this.mesh.visible ? this.text : '';
  }


  private draw(text: string, accent: number): void {
    this.text = text;
    this.accent = accent;
    const c = this.canvas;
    const g = c.getContext('2d')!;
    const W = c.width;
    const H = c.height;
    g.clearRect(0, 0, W, H);
    let px = Math.round(H * 0.46);
    g.font = `600 ${px}px ${FONT}`;
    while (g.measureText(text).width > W - H * 1.6 && px > 12) g.font = `600 ${--px}px ${FONT}`;
    const tw = g.measureText(text).width;
    const w = tw + H * 1.3;
    const x0 = (W - w) / 2;
    const top = H * 0.1;
    const h = H * 0.8;
    // the glass: near-black, a hairline rim
    g.beginPath();
    g.roundRect(x0, top, w, h, h / 2);
    g.fillStyle = 'rgba(13, 13, 15, 0.85)';
    g.fill();
    g.lineWidth = Math.max(1, H * 0.03);
    g.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    g.stroke();
    // the instrument's colour, a dot before the words
    g.fillStyle = `#${accent.toString(16).padStart(6, '0')}`;
    g.beginPath();
    g.arc(x0 + h * 0.5, top + h / 2, h * 0.13, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f2efe6';
    g.textBaseline = 'middle';
    g.fillText(text, x0 + h * 0.85, top + h / 2 + 1);
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
