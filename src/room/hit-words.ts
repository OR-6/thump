/**
 * The word for a hit in a song, over what you hit (each word its own colour, stamped with a plum outline so it reads
 * on a white head): it stamps in 5 cm above, rises a little, and is gone half a second later. Never in the middle of
 * the view.
 * A small pool of planes, each a word drawn once.
 */
import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Vector3, type Object3D } from '@iwsdk/core';
import { FONT, whenFonts } from '../ui/fonts.js';

const WORDS = ['PERFECT', 'GOOD', 'EARLY', 'LATE'] as const;
/** Each word's own neon (a cyan Perfect, a green Good, an orange Early, a violet Late). */
const INK: Record<string, [string, string]> = { PERFECT: ['#ffffff', '#33e1ff'], GOOD: ['#e6fff4', '#3cf0a0'], EARLY: ['#fff0dd', '#ff9a3c'], LATE: ['#efe6ff', '#8a5cff'] };
const POOL = 6;

function wordTexture(word: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 144;
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  const draw = () => {
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, 512, 144);
    g.font = `italic 900 92px ${FONT}`;
    g.textBaseline = 'middle';
    const [, b] = INK[word] ?? ['#ffffff', '#ffffff'];
    const w = g.measureText(word).width;
    const x = (512 - w) / 2;
    const y = 70;
    // stamped like the wordmark: a hard plum shadow, a thick plum outline, then a solid fill in its colour with a
    // light top edge (it has to read over a white drum head and a bright room, not glow into them)
    g.lineJoin = 'round';
    g.fillStyle = '#1d0b2c';
    g.strokeStyle = '#1d0b2c';
    g.lineWidth = 18;
    g.strokeText(word, x + 5, y + 6);
    g.fillText(word, x + 5, y + 6);
    g.strokeText(word, x, y);
    g.fillStyle = b;
    g.fillText(word, x, y);
    g.save();
    g.beginPath();
    g.rect(0, 0, 512, y - 14);
    g.clip();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.fillText(word, x, y);
    g.restore();
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
  private toward = new Vector3();

  constructor(parent: Object3D) {
    if (typeof document === 'undefined') return;
    this.tex = WORDS.map((w) => wordTexture(w));
    const geo = new PlaneGeometry(0.1, 0.028);
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
  /** Called with every word shown (the struck part flashes with it). */
  onShow: ((grade: string, at: Vector3) => void) | null = null;
  show(grade: string | null, at: Vector3, head: Vector3, color: number): void {
    if (grade) this.onShow?.(grade, at);
    const w = grade === 'perfect' ? 0 : grade === 'good' ? 1 : grade === 'early' ? 2 : grade === 'late' ? 3 : -1;
    if (!this.meshes.length || w < 0) return;
    const i = this.next++ % this.meshes.length;
    const m = this.meshes[i];
    const mat = m.material as MeshBasicMaterial;
    mat.map = this.tex[w];
    // (each word carries its own colour now)
    void color;
    mat.color.setHex(0xffffff);
    // (above the part and a little toward you, so it never sits on the head it's about)
    this.base[i].copy(at);
    this.base[i].y += 0.05;
    this.toward.copy(head).sub(at).setY(0);
    if (this.toward.lengthSq() > 1e-6) this.base[i].addScaledVector(this.toward.normalize(), 0.025);
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
      // stamps in (1.35 → 1 over 120 ms with a little overshoot), holds, out over 150 ms; rising a centimetre
      const inK = Math.min(1, a / 0.12);
      const back = 1 + 2.2 * Math.pow(inK - 1, 3) + 1.2 * Math.pow(inK - 1, 2);
      const out = a > 0.35 ? Math.max(0, 1 - (a - 0.35) / 0.15) : 1;
      mat.opacity = Math.min(1, inK * 3) * out;
      m.scale.setScalar(1.35 - 0.35 * back);
      m.position.y = this.base[i].y + 0.01 * (1 - Math.pow(1 - Math.min(1, a / 0.5), 2));
      if (a > 0.5) m.visible = false;
    }
  }
}
