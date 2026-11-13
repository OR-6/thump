/**
 * The crowd: a row of tiny felt creatures at the back of the table (PLAN §3.4). They are the score:
 * no numbers on screen while you play. They bob on the beat (livelier when you're doing well), jump
 * on a cheer, sag a little when the notes go by unplayed, and there are more of them as you play.
 * Three instanced meshes (bodies, eyes, feet) for up to twelve.
 */
import { Color, Group, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, SphereGeometry, Vector3, Euler } from '@iwsdk/core';
import { CROWD, FELT } from '../config.js';
import { feltTexture } from '../art/textures.js';
import { motion } from '../ui/motion.js';

const COLORS = [FELT.teal, FELT.mustard, FELT.tomato, FELT.plum, 0x6fa86b, FELT.navy, 0xe58fb0, 0xf08a3c];
const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();
const _s = new Vector3();
const _c = new Color();

interface Mate {
  x: number;
  z: number;
  size: number;
  phase: number;
  /** 0 → 1 as it arrives (pops up out of the table). */
  in: number;
  jump: number;
  jumpV: number;
}

export class Crowd {
  readonly root = new Group();
  private bodies: InstancedMesh;
  private eyes: InstancedMesh;
  private feet: InstancedMesh;
  private mates: Mate[] = [];
  private target = 0;
  energy = 0.5;
  /** Debug/E2E: cheers seen. */
  cheers = 0;

  constructor() {
    this.root.name = 'Crowd';
    const sphere = new SphereGeometry(1, 16, 12);
    this.bodies = new InstancedMesh(sphere, new MeshStandardMaterial({ roughness: 0.95, map: feltTexture() }), CROWD.max);
    this.eyes = new InstancedMesh(new SphereGeometry(1, 8, 6), new MeshStandardMaterial({ color: 0x1f1714, roughness: 0.6 }), CROWD.max * 2);
    this.feet = new InstancedMesh(new SphereGeometry(1, 8, 6), new MeshStandardMaterial({ roughness: 0.95 }), CROWD.max * 2);
    for (const m of [this.bodies, this.eyes, this.feet]) {
      m.frustumCulled = false;
      m.count = 0;
      this.root.add(m);
    }
    for (let i = 0; i < CROWD.max; i++) {
      // two staggered rows, the first six in front, filling out from the middle
      const row = i < 6 ? 0 : 1;
      const j = row ? i - 6 : i;
      const slot = (j % 2 ? -1 : 1) * Math.ceil(j / 2);
      const seed = Math.sin(i * 12.9898) * 43758.5453;
      const r = seed - Math.floor(seed);
      this.mates.push({ x: slot * CROWD.spacing + (row ? CROWD.spacing / 2 : 0), z: CROWD.z - row * 0.04, size: 0.85 + r * 0.35, phase: r * 0.2, in: 0, jump: 0, jumpV: 0 });
      const col = COLORS[i % COLORS.length];
      this.bodies.setColorAt(i, _c.setHex(col));
      this.feet.setColorAt(i * 2, _c.setHex(col).multiplyScalar(0.7));
      this.feet.setColorAt(i * 2 + 1, _c);
    }
  }

  /** How many should be there (they pop up one by one). */
  setCount(n: number): void {
    this.target = Math.max(0, Math.min(CROWD.max, Math.round(n)));
  }

  get count(): number {
    return this.target;
  }

  cheer(big: boolean): void {
    this.cheers++;
    const k = motion.calm ? 0.45 : 1;
    for (let i = 0; i < this.target; i++) {
      const m = this.mates[i];
      if (m.jump > 0.002 && !big) continue;
      m.jumpV = (big ? 0.42 : 0.24) * k * (0.8 + ((i * 37) % 10) / 25);
      m.jump = 0.0001;
    }
  }

  /** @param beat the song's beat (fractional), or NaN when no music: they sway gently by themselves. */
  update(dt: number, beat: number, time: number): void {
    const free = Number.isNaN(beat);
    const k = motion.calm ? 0.5 : 1;
    for (let i = 0; i < CROWD.max; i++) {
      const m = this.mates[i];
      const want = i < this.target ? 1 : 0;
      m.in += (want - m.in) * Math.min(1, dt * 6);
      if (m.jump > 0) {
        m.jumpV -= 9.8 * dt;
        m.jump += m.jumpV * dt;
        if (m.jump <= 0) {
          m.jump = 0;
          m.jumpV = 0;
        }
      }
    }
    const n = this.mates.findIndex((m) => m.in < 0.01);
    const shown = n < 0 ? CROWD.max : n;
    for (let i = 0; i < shown; i++) {
      const m = this.mates[i];
      const ph = free ? time * 1.2 + m.phase * 6 : beat + m.phase * 0.3;
      const f = ph - Math.floor(ph);
      // a hop on every beat, bigger when the crowd's into it; a slow sway with no music
      const bob = free ? 0.0015 * Math.sin(ph * Math.PI * 2) + 0.0015 : (0.002 + 0.008 * this.energy) * Math.sin(f * Math.PI) * k;
      const sag = 1 - Math.max(0, 0.35 - this.energy) * 0.5; // a little droop when it's gone quiet
      const s = 0.018 * m.size * m.in;
      const lean = free ? Math.sin(ph * 3) * 0.06 : Math.sin(beat * Math.PI) * 0.12 * this.energy * k;
      const y = Math.max(0, bob + m.jump);
      _e.set(0, 0, lean);
      _q.setFromEuler(_e);
      _p.set(m.x, y + s * 1.05 * sag, m.z);
      _m.compose(_p, _q, _s.set(s, s * 1.15 * sag, s * 0.92));
      this.bodies.setMatrixAt(i, _m);
      for (const side of [0, 1]) {
        const ex = (side ? 1 : -1) * s * 0.36;
        _p.set(m.x + ex * Math.cos(lean), y + s * 1.35 * sag + ex * Math.sin(lean), m.z + s * 0.85);
        _m.compose(_p, _q.identity(), _s.setScalar(s * 0.13));
        this.eyes.setMatrixAt(i * 2 + side, _m);
        _p.set(m.x + (side ? 1 : -1) * s * 0.45, Math.max(0.002, y * 0.5 + s * 0.12), m.z + s * 0.25);
        _m.compose(_p, _q.identity(), _s.set(s * 0.32, s * 0.16, s * 0.42));
        this.feet.setMatrixAt(i * 2 + side, _m);
      }
    }
    this.bodies.count = shown;
    this.eyes.count = shown * 2;
    this.feet.count = shown * 2;
    for (const mm of [this.bodies, this.eyes, this.feet]) mm.instanceMatrix.needsUpdate = true;
    if (this.bodies.instanceColor) this.bodies.instanceColor.needsUpdate = true;
    if (this.feet.instanceColor) this.feet.instanceColor.needsUpdate = true;
  }
}
