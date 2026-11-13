/**
 * A slim name tag: dark glass with an accent bar and clean light text, shown for two seconds where an
 * instrument is discovered ("Door · marimba"), facing you. Text ≤ 6 words.
 */
import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Vector3 } from '@iwsdk/core';

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

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
  constructor(readonly widthM = 0.4, readonly heightM = 0.034) {
    this.canvas.width = Math.round((768 * widthM) / 0.2);
    this.canvas.height = Math.round((768 * heightM) / 0.2);
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.mat = new MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false, opacity: 0 });
    this.mesh = new Mesh(new PlaneGeometry(widthM, heightM), this.mat);
    this.mesh.renderOrder = 20;
    this.mesh.visible = false;
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

  get shownText(): string {
    return this.mesh.visible ? this.text : '';
  }

  private draw(text: string, accent: number): void {
    this.text = text;
    const c = this.canvas;
    const g = c.getContext('2d')!;
    const W = c.width;
    const H = c.height;
    g.clearRect(0, 0, W, H);
    let px = Math.round(H * 0.5);
    g.font = `600 ${px}px ${FONT}`;
    while (g.measureText(text).width > W - H * 1.2 && px > 12) g.font = `600 ${--px}px ${FONT}`;
    const tw = g.measureText(text).width;
    const w = tw + H * 0.9;
    const x0 = (W - w) / 2;
    const r = H * 0.22;
    g.fillStyle = 'rgba(12,12,14,0.86)';
    g.beginPath();
    g.roundRect(x0, H * 0.1, w, H * 0.8, r);
    g.fill();
    g.fillStyle = `#${accent.toString(16).padStart(6, '0')}`;
    g.fillRect(x0 + H * 0.16, H * 0.3, H * 0.07, H * 0.4);
    g.fillStyle = '#f2efe6';
    g.textBaseline = 'middle';
    g.fillText(text, x0 + H * 0.4, H * 0.53);
    this.tex.needsUpdate = true;
  }

  update(dt: number): void {
    if (!this.mesh.visible) return;
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
