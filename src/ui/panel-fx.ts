/**
 * The panel's particles and light (Kenney's CC0 Particle Pack, public/fx): stars and sparks that burst from the
 * medal as a grade lands, pink stars for a new record, confetti falling for a full combo, gold sparks for the
 * spotlight, cyan ones as the streak steps up; and a band of light that sweeps across the panel when a page opens.
 * In the panel's own plane (x right, y up, z toward you), metres; one pool, nothing allocated per frame.
 */
import { AdditiveBlending, CanvasTexture, Color, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, TextureLoader, type Texture } from '@iwsdk/core';

export type FxKind = 'stamp' | 'stamp-small' | 'record' | 'fullcombo' | 'spotlight' | 'mult' | 'milestone';

const N = 72;
const TEX = ['star_06.png', 'spark_05.png', 'flare_01.png', 'magic_02.png', 'star_08.png', 'light_01.png'] as const;
const PALETTE: Record<FxKind, readonly number[]> = {
  stamp: [0xffd23f, 0xfff1a8, 0x33e1ff, 0xffffff],
  'stamp-small': [0x33e1ff, 0x8a5cff, 0xffffff],
  record: [0xff3ea5, 0xff7ac8, 0xffffff, 0xffd23f],
  fullcombo: [0x33e1ff, 0xff3ea5, 0xffd23f, 0x3cf0a0, 0x8a5cff],
  spotlight: [0xffd23f, 0xff9a3c, 0xffffff],
  mult: [0x33e1ff, 0xb5f3ff],
  milestone: [0xffd23f, 0x33e1ff, 0xff3ea5],
};

export class PanelFx {
  readonly root = new Group();
  private parts: Mesh[] = [];
  private mats: MeshBasicMaterial[] = [];
  private vel = new Float32Array(N * 3);
  private life = new Float32Array(N);
  private age = new Float32Array(N).fill(9);
  private spin = new Float32Array(N);
  private size = new Float32Array(N);
  private grav = new Float32Array(N);
  private next = 0;
  private tex: Texture[] = [];
  private sweepMesh: Mesh;
  private sweepT = 9;
  private seed = 1;

  constructor(private w: number, private h: number) {
    this.root.name = 'PanelFx';
    const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
    const loader = new TextureLoader();
    for (const f of TEX) {
      const t = loader.load(`${base}fx/${f}`);
      t.colorSpace = SRGBColorSpace;
      this.tex.push(t);
    }
    const geo = new PlaneGeometry(1, 1);
    for (let i = 0; i < N; i++) {
      const m = new MeshBasicMaterial({ map: this.tex[i % this.tex.length], color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending, toneMapped: false });
      const p = new Mesh(geo, m);
      p.visible = false;
      p.renderOrder = 12;
      this.parts.push(p);
      this.mats.push(m);
      this.root.add(p);
    }
    // the sweep: a soft diagonal band of light on a panel-sized quad, its texture slid across
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const g = c.getContext('2d')!;
    const gr = g.createLinearGradient(0, 0, 512, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.42, 'rgba(255,255,255,0)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.55)');
    gr.addColorStop(0.58, 'rgba(255,255,255,0)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.setTransform(1, 0, -0.35, 1, 22, 0);
    g.fillRect(-60, 0, 640, 128);
    const st = new CanvasTexture(c);
    this.sweepMesh = new Mesh(new PlaneGeometry(w * 0.98, h * 0.96), new MeshBasicMaterial({ map: st, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending, toneMapped: false }));
    this.sweepMesh.position.z = 0.0022;
    this.sweepMesh.renderOrder = 11;
    this.sweepMesh.visible = false;
    this.root.add(this.sweepMesh);
  }

  private rnd(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }

  /** A burst of `kind` at (x, y) in the panel's plane. */
  burst(kind: FxKind, x: number, y: number): void {
    const n = kind === 'stamp' ? 36 : kind === 'fullcombo' ? 40 : kind === 'record' ? 24 : kind === 'spotlight' ? 22 : 10;
    const pal = PALETTE[kind];
    for (let k = 0; k < n; k++) {
      const i = this.next++ % N;
      const p = this.parts[i];
      const m = this.mats[i];
      // (confetti falls from the panel's top edge; the rest bursts outward from its point)
      if (kind === 'fullcombo') {
        p.position.set((this.rnd() - 0.5) * this.w, this.h / 2 + 0.01, 0.004 + this.rnd() * 0.01);
        this.vel[i * 3] = (this.rnd() - 0.5) * 0.06;
        this.vel[i * 3 + 1] = -0.03 - this.rnd() * 0.08;
        this.grav[i] = -0.12;
      } else {
        p.position.set(x, y, 0.004);
        const a = this.rnd() * Math.PI * 2;
        const sp = (kind === 'stamp' ? 0.12 : kind === 'mult' ? 0.06 : 0.09) * (0.4 + this.rnd());
        this.vel[i * 3] = Math.cos(a) * sp;
        this.vel[i * 3 + 1] = Math.sin(a) * sp + 0.03;
        this.grav[i] = -0.09;
      }
      this.vel[i * 3 + 2] = 0.02 + this.rnd() * 0.05;
      this.life[i] = kind === 'fullcombo' ? 1.6 + this.rnd() * 0.6 : 0.7 + this.rnd() * 0.6;
      this.age[i] = 0;
      this.spin[i] = (this.rnd() - 0.5) * 6;
      this.size[i] = (kind === 'stamp' ? 0.022 : kind === 'mult' ? 0.012 : 0.016) * (0.5 + this.rnd());
      m.map = this.tex[kind === 'fullcombo' ? 4 + (k % 2) : kind === 'mult' ? 1 : k % 4];
      m.color.set(pal[k % pal.length]);
      p.visible = true;
    }
  }

  /** A band of light across the panel (a page opening, the results coming in). */
  sweep(): void {
    this.sweepT = 0;
  }

  update(dt: number): void {
    for (let i = 0; i < N; i++) {
      if (this.age[i] >= this.life[i]) continue;
      this.age[i] += dt;
      const p = this.parts[i];
      if (this.age[i] >= this.life[i]) {
        p.visible = false;
        continue;
      }
      this.vel[i * 3 + 1] += this.grav[i] * dt;
      // (a little drag: they burst, then hang)
      const d = Math.exp(-dt * 2.2);
      this.vel[i * 3] *= d;
      this.vel[i * 3 + 2] *= d;
      p.position.x += this.vel[i * 3] * dt;
      p.position.y += this.vel[i * 3 + 1] * dt;
      p.position.z += this.vel[i * 3 + 2] * dt;
      p.rotation.z += this.spin[i] * dt;
      const u = this.age[i] / this.life[i];
      const s = this.size[i] * (u < 0.15 ? u / 0.15 : 1 - 0.4 * u);
      p.scale.set(s, s, 1);
      this.mats[i].opacity = u < 0.1 ? u / 0.1 : 1 - Math.pow(u, 2);
    }
    if (this.sweepT < 0.6) {
      this.sweepT += dt;
      const u = Math.min(1, this.sweepT / 0.55);
      const m = this.sweepMesh.material as MeshBasicMaterial;
      this.sweepMesh.visible = u < 1;
      m.map!.offset.x = 0.6 - 1.2 * (1 - Math.pow(1 - u, 2));
      m.opacity = Math.sin(u * Math.PI) * 0.55;
    }
  }
}

// (keep the colour type in the import list used: tinting goes through material.color)
export type { Color };
