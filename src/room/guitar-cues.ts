/**
 * The guitar in your lap faces away from you, as a real one does: what a song shows on its top (the chord coming, the
 * strum line and which way to strum) would face away too. So it's shown here instead, just off the guitar where your
 * eyes are, turned to you: each chord place's name over the neck, above the place it's on, and a strum target over the
 * guitar's upper edge by the soundhole with an arrow for the strum coming (warm down, cool up). A song's rings close
 * onto these (src/room/room-system.ts shapeOf). In the screen's look: dark glass, the screen's gold and its ink.
 * Nothing allocated per frame.
 */
import { CanvasTexture, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Vector3, type Object3D } from '@iwsdk/core';
import { HG, bodyHalfW, neckW, zoneX } from '../kit/held-guitar.js';
import type { HeldGuitarModel } from '../scene-assets/lib/held-guitar-model.js';
import { FONT, whenFonts } from '../ui/fonts.js';

/** A tag's size (m): a chord name, the strum target. */
const CHORD = { w: 0.06, h: 0.032 };
const STRUM = { w: 0.05, h: 0.05 };

interface Card {
  mesh: Mesh;
  mat: MeshBasicMaterial;
  canvas: HTMLCanvasElement;
  tex: CanvasTexture;
  text: string;
}

function card(w: number, h: number, px: number): Card {
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = Math.round((px * h) / w);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  const mat = new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false, opacity: 0 });
  const mesh = new Mesh(new PlaneGeometry(w, h), mat);
  mesh.renderOrder = 18;
  mesh.visible = false;
  return { mesh, mat, canvas, tex, text: '' };
}

/** Where a cue stands, in the held guitar's frame: over the neck at chord place c, or over the upper edge (c = 9). */
export function cueSpot(c: number, out: Vector3): Vector3 {
  // (−z is the low E's side: toward the ceiling as it's held)
  if (c >= 0 && c < 3) return out.set(zoneX(c), HG.strings + 0.01, -(neckW(zoneX(c)) / 2 + 0.03));
  return out.set(HG.strikeX, HG.strings + 0.01, -(bodyHalfW(HG.strikeX) + 0.035));
}

export class GuitarCues {
  readonly root = new Group();
  private chords: Card[] = [];
  private strum: Card;
  private strumDir = 0;
  private names = ['', '', ''];
  private p = new Vector3();

  constructor(parent: Object3D) {
    this.root.name = 'GuitarCues';
    for (let c = 0; c < 3; c++) {
      const k = card(CHORD.w, CHORD.h, 256);
      this.chords.push(k);
      this.root.add(k.mesh);
    }
    this.strum = card(STRUM.w, STRUM.h, 192);
    this.root.add(this.strum.mesh);
    this.root.visible = false;
    parent.add(this.root);
    whenFonts(() => {
      for (let c = 0; c < 3; c++) this.drawChord(c, this.names[c], true);
    });
  }

  /** The chord on each place (redrawn when it changes). */
  setNames(names: readonly string[]): void {
    for (let c = 0; c < 3; c++) this.drawChord(c, names[c] ?? '', false);
  }

  private drawChord(c: number, text: string, force: boolean): void {
    const k = this.chords[c];
    this.names[c] = text;
    if (!force && text === k.text) return;
    k.text = text;
    const g = k.canvas.getContext('2d');
    if (!g) return;
    const W = k.canvas.width;
    const H = k.canvas.height;
    g.clearRect(0, 0, W, H);
    if (!text) {
      k.tex.needsUpdate = true;
      return;
    }
    // dark glass, the chord's name in the screen's gold
    const r = H / 2 - 4;
    g.beginPath();
    g.roundRect(4, 4, W - 8, H - 8, r);
    g.fillStyle = 'rgba(26,11,46,0.86)';
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(255,210,138,0.75)';
    g.stroke();
    g.font = `italic 900 ${Math.round(H * 0.62)}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffd28a';
    g.fillText(text, W / 2, H / 2 + 3);
    k.tex.needsUpdate = true;
  }

  /** The strum target with an arrow down (1), up (-1), or none (0). */
  private drawStrum(dir: number): void {
    if (dir === this.strumDir && this.strum.text) return;
    this.strumDir = dir;
    this.strum.text = 'drawn';
    const g = this.strum.canvas.getContext('2d');
    if (!g) return;
    const S = this.strum.canvas.width;
    g.clearRect(0, 0, S, S);
    const col = dir < 0 ? '#6fd0ff' : '#ffb35c';
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2 - 6, 0, Math.PI * 2);
    g.fillStyle = 'rgba(26,11,46,0.86)';
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = col;
    g.stroke();
    if (dir) {
      // an arrow: a shaft and a head, pointing the way to strum
      g.save();
      g.translate(S / 2, S / 2);
      if (dir < 0) g.rotate(Math.PI);
      g.fillStyle = col;
      g.fillRect(-9, -S * 0.26, 18, S * 0.3);
      g.beginPath();
      g.moveTo(-S * 0.2, S * 0.04);
      g.lineTo(S * 0.2, S * 0.04);
      g.lineTo(0, S * 0.3);
      g.closePath();
      g.fill();
      g.restore();
    }
    this.strum.tex.needsUpdate = true;
  }

  /**
   * Each frame: shown only with the guitar in your lap. `place` turns a point in the guitar's frame into the world;
   * `head` is your eyes. In a song: the chord coming and the one you're on, the next strum's way; in free play: every
   * chord place's name, and the strum target while you're still learning which way is down.
   */
  update(model: HeldGuitarModel, on: boolean, place: (x: number, y: number, z: number, out: Vector3) => Vector3, head: Vector3, calm: boolean): void {
    this.root.visible = on;
    if (!on) return;
    for (let c = 0; c < 3; c++) {
      const k = this.chords[c];
      const ahead = model.zoneAhead[c];
      const ask = Number.isFinite(ahead) && ahead < 2 && ahead > -0.4 ? 1 - Math.max(0, ahead) / 2 : model.askedAt(c);
      const mine = model.zone === c;
      const o = !k.text ? 0 : model.song ? (ask > 0 ? 0.65 + 0.35 * ask : mine ? 0.55 : 0) : mine ? 1 : 0.7;
      k.mat.opacity = o;
      k.mesh.visible = o > 0.01;
      if (!k.mesh.visible) continue;
      cueSpot(c, this.p);
      place(this.p.x, this.p.y, this.p.z, k.mesh.position);
      k.mesh.lookAt(head);
      k.mesh.scale.setScalar(calm ? 1 : 1 + 0.25 * model.zoneFlash(c));
    }
    // the strum: the nearest strum coming, its way; brighter as it nears; a flash as one lands
    let next = Number.POSITIVE_INFINITY;
    let dir = 0;
    for (let a = 0; a < model.strumAhead.length; a++) {
      const ah = model.strumAhead[a];
      if (Number.isFinite(ah) && ah > -0.3 && ah < next) {
        next = ah;
        dir = model.strumDir[a] > 0 ? 1 : -1;
      }
    }
    const k = this.strum;
    let o = 0;
    if (model.song) o = Number.isFinite(next) ? 0.45 + 0.55 * (1 - Math.max(0, Math.min(3, next)) / 3) : 0.3 + 0.4 * model.askedAt(3);
    else o = model.guideK * 0.8;
    if (!model.song && !dir) dir = 1;
    this.drawStrum(dir);
    k.mat.opacity = Math.min(1, o + 0.5 * model.strikeFlash);
    k.mesh.visible = k.mat.opacity > 0.01;
    if (k.mesh.visible) {
      cueSpot(9, this.p);
      place(this.p.x, this.p.y, this.p.z, k.mesh.position);
      k.mesh.lookAt(head);
      k.mesh.scale.setScalar(calm ? 1 : 1 + 0.3 * model.strikeFlash);
    }
  }
}
