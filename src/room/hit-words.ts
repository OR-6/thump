/**
 * The word for a hit in a song, next to what you hit (Perfect in white, Good in the instrument's colour): it pops
 * in over 80 ms a few centimetres above, rises a little, and is gone 250 ms later. Never in the middle of the view.
 * A small pool of planes, each a word drawn once.
 */
import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Vector3, type Object3D } from '@iwsdk/core';
import { FONT, whenFonts } from '../ui/fonts.js';

const WORDS = ['Perfect', 'Good'] as const;
const POOL = 6;

function wordTexture(word: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 80;
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  const draw = () => {
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, 256, 80);
    g.font = `700 52px ${FONT}`;
    g.textBaseline = 'middle';
    // (a dark halo so it reads over a bright desk too)
    g.lineWidth = 8;
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    const w = g.measureText(word).width;
    g.strokeText(word, (256 - w) / 2, 42);
    g.fillStyle = '#ffffff';
    g.fillText(word, (256 - w) / 2, 42);
    tex.needsUpdate = true;
  };
  draw();
  whenFonts(draw);
  return tex;
}

export class HitWords {
  private meshes: Mesh[] = [];
  private age: number[] = [];
  private base: Vector3[] = [];
  private next = 0;
  private tex: CanvasTexture[] = [];

  constructor(parent: Object3D) {
    if (typeof document === 'undefined') return;
    this.tex = WORDS.map((w) => wordTexture(w));
    const geo = new PlaneGeometry(0.06, 0.019);
    for (let i = 0; i < POOL; i++) {
      const m = new Mesh(geo, new MeshBasicMaterial({ map: this.tex[0], transparent: true, depthWrite: false, toneMapped: false, opacity: 0 }));
      m.name = 'HitWord';
      m.renderOrder = 12;
      m.visible = false;
      parent.add(m);
      this.meshes.push(m);
      this.age.push(9);
      this.base.push(new Vector3());
    }
  }

  /** Show the word for `grade` at world `at` (3 cm above it), facing `head`, Good tinted `color`. */
  show(grade: string | null, at: Vector3, head: Vector3, color: number): void {
    if (!this.meshes.length || (grade !== 'perfect' && grade !== 'good')) return;
    const i = this.next++ % this.meshes.length;
    const m = this.meshes[i];
    const mat = m.material as MeshBasicMaterial;
    mat.map = this.tex[grade === 'perfect' ? 0 : 1];
    mat.color.setHex(grade === 'perfect' ? 0xffffff : color);
    this.base[i].copy(at);
    this.base[i].y += 0.03;
    m.position.copy(this.base[i]);
    m.lookAt(head);
    this.age[i] = 0;
    m.visible = true;
  }

  update(dt: number): void {
    for (let i = 0; i < this.meshes.length; i++) {
      if (this.age[i] > 0.5) continue;
      this.age[i] += dt;
      const a = this.age[i];
      const m = this.meshes[i];
      const mat = m.material as MeshBasicMaterial;
      // in over 80 ms (eased), held, out over 250 ms; rising a centimetre
      const inK = Math.min(1, a / 0.08);
      const ease = 1 - Math.pow(1 - inK, 3);
      const out = a > 0.25 ? Math.max(0, 1 - (a - 0.25) / 0.25) : 1;
      mat.opacity = ease * out;
      m.scale.setScalar(0.85 + 0.15 * ease);
      m.position.y = this.base[i].y + 0.01 * Math.min(1, a / 0.5);
      if (a > 0.5) m.visible = false;
    }
  }
}
