/**
 * The word for a hit in a song, next to what you hit (Perfect in white, Good in the instrument's colour, Early or
 * Late in grey): it pops
 * in over 80 ms a few centimetres above, rises a little, and is gone 250 ms later. Never in the middle of the view.
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
  c.width = 320;
  c.height = 100;
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  const draw = () => {
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, 320, 100);
    g.font = `italic 900 58px ${FONT}`;
    g.textBaseline = 'middle';
    const [a, b] = INK[word] ?? ['#ffffff', '#ffffff'];
    const w = g.measureText(word).width;
    const x = (320 - w) / 2;
    // (a dark outline so it reads over a bright desk, a glow in its colour, a light-to-colour fill)
    g.lineJoin = 'round';
    g.lineWidth = 10;
    g.strokeStyle = 'rgba(20,8,40,0.85)';
    g.strokeText(word, x, 52);
    g.shadowColor = b;
    g.shadowBlur = 16;
    const gr = g.createLinearGradient(0, 24, 0, 80);
    gr.addColorStop(0, a);
    gr.addColorStop(1, b);
    g.fillStyle = gr;
    g.fillText(word, x, 52);
    g.shadowBlur = 0;
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
    const geo = new PlaneGeometry(0.07, 0.022);
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
    const w = grade === 'perfect' ? 0 : grade === 'good' ? 1 : grade === 'early' ? 2 : grade === 'late' ? 3 : -1;
    if (!this.meshes.length || w < 0) return;
    const i = this.next++ % this.meshes.length;
    const m = this.meshes[i];
    const mat = m.material as MeshBasicMaterial;
    mat.map = this.tex[w];
    // (each word carries its own colour now)
    void color;
    mat.color.setHex(0xffffff);
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
      m.position.y = this.base[i].y + 0.01 * (1 - Math.pow(1 - Math.min(1, a / 0.5), 2));
      if (a > 0.5) m.visible = false;
    }
  }
}
