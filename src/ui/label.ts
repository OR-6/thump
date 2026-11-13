/**
 * Canvas-texture text label drawn as a paper tag (no UI kit). Text ≤ 5 words,
 * cap height ≥ 1.5 cm at the chosen world height.
 */
import { CanvasTexture, LinearFilter, Mesh, MeshBasicMaterial, PlaneGeometry } from '@iwsdk/core';
import { THEMES, type Theme } from './theme.js';

export class Label {
  readonly mesh: Mesh;
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private tex: CanvasTexture;
  private text = '';
  private theme: Theme = THEMES.toy;

  setTheme(theme: Theme): void {
    this.theme = theme;
    const t = this.text;
    this.text = '\u0000';
    this.set(t);
  }

  /** @param heightM world height of the label quad; cap height ≈ 0.5 × this. */
  /** 'tag': a paper luggage tag (hints); 'ribbon': a gold celebration banner. */
  style: 'tag' | 'ribbon' = 'tag';
  /** The tag's card colour (null: the theme's paper). A switched-on setting is mustard, like the 2D page's. */
  fill: string | null = null;

  constructor(public widthM = 0.2, public heightM = 0.035) {
    this.canvas.width = 1024;
    this.canvas.height = Math.round((1024 * heightM) / widthM);
    this.ctx = this.canvas.getContext('2d')!;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.generateMipmaps = false; // re-mipping a 1024-wide canvas on every text change cost more than it gave
    this.tex.minFilter = LinearFilter;
    this.mesh = new Mesh(
      new PlaneGeometry(widthM, heightM),
      new MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, toneMapped: false }), // the colours as drawn
    );
    this.mesh.renderOrder = 10;
  }

  set(text: string): void {
    if (text === this.text) return;
    this.text = text;
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.mesh.visible = text.length > 0;
    if (!text) {
      this.tex.needsUpdate = true;
      return;
    }
    if (this.style === 'ribbon') {
      this.drawRibbon(text);
      return;
    }
    // A paper luggage tag: cream card sized to the words, notched left end
    // with a punched hole and a loop of yarn, ink lettering.
    const h = canvas.height;
    const pad = h * 0.34;
    const hole = h * 0.62;
    // long words get a smaller font; past that they wrap onto two lines (never squeezed: squeezed letters blur in a headset)
    const avail = canvas.width - hole - pad * 2 - 8;
    let px = Math.round(h * 0.6);
    ctx.font = `400 ${px}px ${this.theme.font}`;
    const full = ctx.measureText(text).width;
    let lines = [text];
    if (full > avail) {
      px = Math.max(Math.round(h * 0.52), Math.floor((px * avail) / full));
      ctx.font = `400 ${px}px ${this.theme.font}`;
      if (ctx.measureText(text).width > avail) {
        // two lines, split at the space nearest the middle
        const mid = text.length / 2;
        let cut = -1;
        for (let i = 0; i < text.length; i++) if (text[i] === ' ' && (cut < 0 || Math.abs(i - mid) < Math.abs(cut - mid))) cut = i;
        if (cut > 0) lines = [text.slice(0, cut), text.slice(cut + 1)];
        px = Math.round(h * 0.38);
        ctx.font = `400 ${px}px ${this.theme.font}`;
        while (px > h * 0.26 && Math.max(...lines.map((l) => ctx.measureText(l).width)) > avail) {
          px--;
          ctx.font = `400 ${px}px ${this.theme.font}`;
        }
      }
    }
    const tw = Math.min(avail, Math.max(...lines.map((l) => ctx.measureText(l).width)));
    const w = hole + tw + pad * 1.6;
    const x0 = (canvas.width - w) / 2;
    const y0 = h * 0.08;
    const th = h * 0.84;
    const notch = th * 0.32;
    const tag = (dx: number, dy: number) => {
      ctx.beginPath();
      ctx.moveTo(x0 + notch + dx, y0 + dy);
      ctx.lineTo(x0 + w - th * 0.16 + dx, y0 + dy);
      ctx.arcTo(x0 + w + dx, y0 + dy, x0 + w + dx, y0 + th + dy, th * 0.16);
      ctx.arcTo(x0 + w + dx, y0 + th + dy, x0 + dx, y0 + th + dy, th * 0.16);
      ctx.lineTo(x0 + notch + dx, y0 + th + dy);
      ctx.lineTo(x0 + dx, y0 + th - notch + dy);
      ctx.lineTo(x0 + dx, y0 + notch + dy);
      ctx.closePath();
    };
    // soft drop shadow, then the card
    ctx.fillStyle = 'rgba(40,25,15,0.5)';
    tag(h * 0.03, h * 0.05);
    ctx.fill();
    ctx.fillStyle = this.fill ?? this.theme.paper;
    tag(0, 0);
    ctx.fill();
    // a firm walnut edge: the tag's shape holds against a white desk or a bright window
    ctx.lineWidth = h * 0.04;
    ctx.strokeStyle = this.theme.hc ? '#000000' : '#6b3e26';
    ctx.stroke();
    // punched hole with a yarn loop through it
    const hx = x0 + hole * 0.62;
    const hy = y0 + th / 2;
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(hx, hy, th * 0.11, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // a short end of brown twine through the hole, trailing off the tag
    ctx.strokeStyle = '#8b6a48';
    ctx.lineWidth = h * 0.035;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.quadraticCurveTo(hx - th * 0.3, hy - th * 0.18, x0 - th * 0.35, hy - th * 0.32);
    ctx.stroke();
    ctx.fillStyle = this.theme.ink;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    if (lines.length === 1) ctx.fillText(text, x0 + hole + pad * 0.5, y0 + th * 0.56);
    else {
      ctx.fillText(lines[0], x0 + hole + pad * 0.5, y0 + th * 0.31);
      ctx.fillText(lines[1], x0 + hole + pad * 0.5, y0 + th * 0.74);
    }
    this.tex.needsUpdate = true;
  }

  /** A strip of tomato felt with folded tails and a running stitch (celebrations). */
  private drawRibbon(text: string): void {
    const { ctx, canvas } = this;
    const h = canvas.height;
    let rpx = Math.round(h * 0.5);
    ctx.font = `700 ${rpx}px ${this.theme.font}`;
    const room = canvas.width * 0.8;
    if (ctx.measureText(text).width > room) {
      rpx = Math.floor((rpx * room) / ctx.measureText(text).width);
      ctx.font = `700 ${rpx}px ${this.theme.font}`;
    }
    const tw = ctx.measureText(text).width;
    const w = tw + h * 0.8;
    const x0 = (canvas.width - w) / 2;
    const y0 = h * 0.14;
    const th = h * 0.7;
    // the band: a strip of tomato felt
    ctx.fillStyle = 'rgba(60,35,20,0.3)';
    ctx.fillRect(x0 + h * 0.03, y0 + h * 0.05, w, th);
    ctx.fillStyle = '#c43c28'; // deep enough for cream lettering (about 4.9:1)
    ctx.fillRect(x0, y0, w, th);
    // felt fuzz
    let seed = 5;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 140; i++) {
      ctx.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)';
      ctx.fillRect(x0 + rnd() * w, y0 + rnd() * th, h * 0.02, h * 0.008);
    }
    // a cream running stitch along both edges
    ctx.setLineDash([h * 0.07, h * 0.06]);
    ctx.strokeStyle = 'rgba(255,241,214,0.95)';
    ctx.lineWidth = h * 0.022;
    ctx.beginPath();
    ctx.moveTo(x0 + h * 0.08, y0 + h * 0.08);
    ctx.lineTo(x0 + w - h * 0.08, y0 + h * 0.08);
    ctx.moveTo(x0 + h * 0.08, y0 + th - h * 0.08);
    ctx.lineTo(x0 + w - h * 0.08, y0 + th - h * 0.08);
    ctx.stroke();
    ctx.setLineDash([]);
    // plain cream lettering, as if appliquéd
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = h * 0.04;
    ctx.strokeStyle = '#7a2a1c';
    ctx.strokeText(text, canvas.width / 2, y0 + th * 0.55);
    ctx.fillStyle = '#fff4de';
    ctx.fillText(text, canvas.width / 2, y0 + th * 0.55);
    this.tex.needsUpdate = true;
  }
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
