/**
 * The word for a hit in a song, over what you hit (each word its own neon, as the screen draws judgements, with a dark
 * outline so it reads on a white head): it stamps in 6 cm above, rises a little, and is gone under half a second later.
 * Never in the middle of the view. Only the words worth reading: what wasn't a Perfect (Good, Early, Late) and a
 * Perfect while the word is new (`wants`); a Perfect after that is said by the ring alone, so a run of them isn't a
 * wall of words over the next notes. Calm motion: no stamp or rise, just a fade.
 * A small pool of planes, each a word drawn once.
 */
import { motion } from '../ui/motion.js';
import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Vector3, type Object3D } from '@iwsdk/core';
import { FONT, whenFonts } from '../ui/fonts.js';

/** (the last two: a Good that was early or late, in Good's green: still counted, but it says which way) */
const WORDS = ['PERFECT', 'GOOD', 'EARLY', 'LATE', 'EARLY ', 'LATE '] as const;
/** Each word's own neon (a cyan Perfect, a green Good, an orange Early, a violet Late). */
const INK: Record<string, [string, string]> = { PERFECT: ['#ffe2b8', '#ffe2b8'], GOOD: ['#9fd98a', '#9fd98a'], EARLY: ['#ffb27a', '#ffb27a'], LATE: ['#a29da8', '#a29da8'], 'EARLY ': ['#9fd98a', '#9fd98a'], 'LATE ': ['#9fd98a', '#9fd98a'] };
const POOL = 6;
/** How long a word is up (s). */
const LIFE = 0.42;

function wordTexture(word: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 144;
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  const draw = () => {
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, 512, 144);
    g.font = `800 92px ${FONT}`;
    g.textBaseline = 'middle';
    const ink = word;
    word = word.trim();
    const w = g.measureText(word).width;
    const x = (512 - w) / 2;
    const y = 70;
    // the screen's own look (src/ui/theme.ts): the judgement's colour as a light-to-colour gradient, a dark outline so
    // it reads over a bright desk, a glow in its colour
    g.lineJoin = 'round';
    g.strokeStyle = '#161419';
    g.lineWidth = 8;
    g.strokeText(word, x, y);
    const [a, b] = INK[ink] ?? ['#ffffff', '#ffffff'];
    const gr = g.createLinearGradient(0, y - 46, 0, y + 46);
    gr.addColorStop(0, a);
    gr.addColorStop(1, b);
    // (flat: one colour, no glow)
    g.fillStyle = b;
    void gr;
    g.fillText(word, x, y);
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
  private toward = new Vector3();

  constructor(parent: Object3D) {
    if (typeof document === 'undefined') return;
    this.tex = WORDS.map((w) => wordTexture(w));
    const geo = new PlaneGeometry(0.075, 0.021);
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

  /** Called with every judged hit, word or not (the struck part flashes with it). */
  onShow: ((grade: string, at: Vector3) => void) | null = null;
  /** Whether a grade's word is shown this time (unset: always). */
  wants: ((grade: string) => boolean) | null = null;
  /** The last judged hit's offset (s; − early): a Good says EARLY or LATE in its green. */
  lean: (() => number) | null = null;
  /** The word for `grade` at world `at` (6 cm above it), facing `head`. */
  show(grade: string | null, at: Vector3, head: Vector3, color: number): void {
    if (grade) this.onShow?.(grade, at);
    const lean = grade === 'good' && this.lean ? this.lean() : 0;
    const w = grade === 'perfect' ? 0 : grade === 'good' ? (lean < 0 ? 4 : lean > 0 ? 5 : 1) : grade === 'early' ? 2 : grade === 'late' ? 3 : -1;
    if (!this.meshes.length || w < 0 || (this.wants && !this.wants(grade!))) return;
    const i = this.next++ % this.meshes.length;
    const m = this.meshes[i];
    const mat = m.material as MeshBasicMaterial;
    mat.map = this.tex[w];
    // (each word carries its own colour now)
    void color;
    mat.color.setHex(0xffffff);
    // (above the part and a little toward you, so it never sits on the head it's about)
    this.base[i].copy(at);
    this.base[i].y += 0.06;
    this.toward.copy(head).sub(at).setY(0);
    if (this.toward.lengthSq() > 1e-6) this.base[i].addScaledVector(this.toward.normalize(), 0.025);
    m.position.copy(this.base[i]);
    m.lookAt(head);
    this.age[i] = 0;
    m.visible = true;
  }

  update(dt: number): void {
    const calm = motion.calm;
    for (let i = 0; i < this.meshes.length; i++) {
      if (this.age[i] > LIFE) continue;
      this.age[i] += dt;
      const a = this.age[i];
      const m = this.meshes[i];
      const mat = m.material as MeshBasicMaterial;
      // stamps in (1.2 → 1 over 100 ms, a little overshoot), holds, out over 120 ms; rising 8 mm
      const inK = Math.min(1, a / 0.1);
      const back = 1 + 2.2 * Math.pow(inK - 1, 3) + 1.2 * Math.pow(inK - 1, 2);
      const out = a > LIFE - 0.12 ? Math.max(0, 1 - (a - (LIFE - 0.12)) / 0.12) : 1;
      mat.opacity = Math.min(1, inK * 3) * out * 0.95;
      m.scale.setScalar(calm ? 1 : 1.2 - 0.2 * back);
      m.position.y = this.base[i].y + (calm ? 0 : 0.008 * (1 - Math.pow(1 - Math.min(1, a / LIFE), 2)));
      if (a > LIFE) m.visible = false;
    }
  }
}
