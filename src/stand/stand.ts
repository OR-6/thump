/**
 * The stand: a small rack beside the module with a tile for each instrument (a drawing of it and its name on tape).
 * Pinch a tile and that instrument comes out on the desk. The one that's out is lit in its colour; one not yet
 * earned shows dim with a lock line. Kit-local (origin on the desk at the kit's centre, +Y up, −Z away from you).
 */
import { BoxGeometry, CanvasTexture, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, Vector3 } from '@iwsdk/core';
import { FONT, whenFonts } from '../ui/fonts.js';

export interface StandItem {
  id: string;
  name: string;
  color: number;
  locked?: boolean;
}

/** Where the rack stands (kit-local): right of the module, at the back of the tray. */
export const STAND = { x: 0.178, z: -0.215, tile: 0.03, gap: 0.004, cols: 3 } as const;

type Draw = (g: CanvasRenderingContext2D, S: number) => void;

/** Simple drawings, in ink, of each instrument. */
export const ICON: Record<string, Draw> = {
  drums: (g, S) => {
    g.beginPath();
    g.ellipse(S * 0.5, S * 0.42, S * 0.3, S * 0.12, 0, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(S * 0.2, S * 0.42);
    g.lineTo(S * 0.2, S * 0.6);
    g.ellipse(S * 0.5, S * 0.6, S * 0.3, S * 0.12, 0, Math.PI, 0, true);
    g.lineTo(S * 0.8, S * 0.42);
    g.stroke();
    for (const x of [0.28, 0.5, 0.72]) {
      g.beginPath();
      g.moveTo(S * x, S * 0.53);
      g.lineTo(S * x, S * 0.68);
      g.stroke();
    }
  },
  piano: (g, S) => {
    g.strokeRect(S * 0.18, S * 0.3, S * 0.64, S * 0.4);
    for (let i = 1; i < 5; i++) {
      g.beginPath();
      g.moveTo(S * (0.18 + i * 0.128), S * 0.3);
      g.lineTo(S * (0.18 + i * 0.128), S * 0.7);
      g.stroke();
    }
    for (const i of [1, 2, 4]) g.fillRect(S * (0.18 + i * 0.128 - 0.035), S * 0.3, S * 0.07, S * 0.22);
  },
  guitar: (g, S) => {
    g.beginPath();
    g.ellipse(S * 0.38, S * 0.6, S * 0.17, S * 0.15, 0, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(S * 0.38, S * 0.6, S * 0.05, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(S * 0.48, S * 0.5);
    g.lineTo(S * 0.8, S * 0.2);
    g.stroke();
  },
  handpan: (g, S) => {
    g.beginPath();
    g.arc(S * 0.5, S * 0.5, S * 0.3, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(S * 0.5, S * 0.5, S * 0.08, 0, Math.PI * 2);
    g.stroke();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      g.beginPath();
      g.arc(S * (0.5 + Math.cos(a) * 0.2), S * (0.5 + Math.sin(a) * 0.2), S * 0.035, 0, Math.PI * 2);
      g.stroke();
    }
  },
  congas: (g, S) => {
    // two tall drums, a little apart, the left one bigger
    for (const [x, w, h] of [[0.34, 0.17, 0.5], [0.66, 0.14, 0.44]] as const) {
      g.beginPath();
      g.ellipse(S * x, S * (0.86 - h), S * w, S * 0.05, 0, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.moveTo(S * (x - w), S * (0.86 - h));
      g.quadraticCurveTo(S * (x - w * 1.25), S * (0.86 - h / 2), S * (x - w * 0.8), S * 0.86);
      g.lineTo(S * (x + w * 0.8), S * 0.86);
      g.quadraticCurveTo(S * (x + w * 1.25), S * (0.86 - h / 2), S * (x + w), S * (0.86 - h));
      g.stroke();
    }
  },
  marimba: (g, S) => {
    for (let i = 0; i < 6; i++) {
      const h = 0.42 - i * 0.04;
      g.strokeRect(S * (0.17 + i * 0.11), S * (0.5 - h / 2), S * 0.08, S * h);
    }
  },
};

function tileTexture(item: StandItem, on: boolean): CanvasTexture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d')!;
  // the tile: dark, its instrument's colour round the edge when it's out
  g.fillStyle = on ? '#24221f' : '#18171a';
  g.fillRect(0, 0, S, S);
  g.lineWidth = on ? 6 : 2;
  g.strokeStyle = `#${item.color.toString(16).padStart(6, '0')}`;
  g.globalAlpha = on ? 1 : 0.45;
  g.strokeRect(3, 3, S - 6, S - 6);
  g.globalAlpha = item.locked ? 0.3 : 1;
  g.strokeStyle = '#ece6d8';
  g.fillStyle = '#ece6d8';
  g.lineWidth = 4;
  g.lineCap = 'round';
  ICON[item.id]?.(g, S * 0.86);
  g.globalAlpha = 1;
  // its name along the bottom
  g.fillStyle = '#ece6d8';
  g.font = `600 22px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(item.locked ? 'Soon' : item.name, S / 2, S - 21);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export class Stand {
  readonly root = new Group();
  private items: StandItem[] = [];
  private current = '';
  private tiles: Mesh[] = [];
  private tilePos: Vector3[] = [];
  private bump: number[] = [];
  private readonly tileGeo = new PlaneGeometry(STAND.tile, STAND.tile);

  constructor() {
    this.root.name = 'Stand';
    // a low wooden rack: a base, and a rail the tiles lean against
    const wood = new MeshStandardMaterial({ name: 'Wood', color: 0x5b3c25, roughness: 0.55 });
    const w = STAND.cols * (STAND.tile + STAND.gap) + 0.008;
    const base = new Mesh(new BoxGeometry(w, 0.006, 0.075), wood);
    base.name = 'Base';
    base.position.set(STAND.x, 0.003, STAND.z);
    const rail = new Mesh(new BoxGeometry(w, 0.004, 0.006), wood);
    rail.name = 'Rail';
    rail.position.set(STAND.x, 0.03, STAND.z - 0.03);
    this.root.add(base, rail);
    this.root.visible = false;
    whenFonts(() => this.draw());
  }

  /** What's on it, and which is out. */
  set(items: readonly StandItem[], current: string): void {
    const same = items.length === this.items.length && items.every((x, i) => x.id === this.items[i].id && !!x.locked === !!this.items[i].locked);
    this.items = items.slice();
    if (same && current === this.current) return;
    this.current = current;
    this.draw();
  }

  private draw(): void {
    for (const t of this.tiles) {
      this.root.remove(t);
      ((t.material as MeshBasicMaterial).map as CanvasTexture | null)?.dispose();
      (t.material as MeshBasicMaterial).dispose();
    }
    this.tiles = [];
    this.tilePos = [];
    this.bump = [];
    this.items.forEach((it, i) => {
      const col = i % STAND.cols;
      const row = Math.floor(i / STAND.cols);
      const m = new Mesh(this.tileGeo, new MeshBasicMaterial({ map: tileTexture(it, it.id === this.current), toneMapped: false }));
      m.name = `Tile-${it.id}`;
      // two rows, the back one higher, each tile leaning back toward you
      const x = STAND.x + (col - (STAND.cols - 1) / 2) * (STAND.tile + STAND.gap);
      const y = 0.006 + STAND.tile / 2 + row * 0.022;
      const z = STAND.z + 0.018 - row * 0.03;
      m.position.set(x, y, z);
      m.rotation.x = -0.35;
      this.root.add(m);
      this.tiles.push(m);
      this.tilePos.push(new Vector3(x, y, z));
      this.bump.push(0);
    });
  }

  /** The item whose tile is within reach of kit-local point `p` (a pinch), or null. */
  pickAt(p: Vector3): StandItem | null {
    let best = -1;
    let bd = 0.03;
    this.tilePos.forEach((q, i) => {
      const d = q.distanceTo(p);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    if (best < 0) return null;
    this.bump[best] = 1;
    return this.items[best];
  }

  /** Kit-local centre of an item's tile (tests and the autoplayer). */
  tileAt(id: string): Vector3 | null {
    const i = this.items.findIndex((x) => x.id === id);
    return i >= 0 ? this.tilePos[i] : null;
  }

  update(dt: number): void {
    if (!this.root.visible) return;
    this.tiles.forEach((m, i) => {
      if (this.bump[i] <= 0) return;
      this.bump[i] = Math.max(0, this.bump[i] - dt * 5);
      m.scale.setScalar(1 + 0.15 * this.bump[i]);
    });
  }
}
