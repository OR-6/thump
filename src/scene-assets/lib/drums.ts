/**
 * The desk drums as real drums, low enough that your palm still lands on the real desk: a lacquered wood shell, a
 * white coated head with a faint centre dot, a rolled chrome hoop with lugs and tension rods, and a hi-hat (two
 * bronze cymbals with bells on a chrome rod). Deterministic and parentless: built the same in the app and the editor.
 * Drum-local: origin on the desk at the drum's centre, +Y up; sizes in metres.
 */
import { CylinderGeometry, Group, LatheGeometry, Mesh, MeshStandardMaterial, Object3D, Vector2 } from '@iwsdk/core';

/** The height of a drum's head above the desk (and of a hi-hat's top cymbal). */
export const DRUM_H = 0.016;

export interface DrumLook {
  /** Shell lacquer colour. */
  shell: number;
  /** Head colour (coated white, or a darker resonant head for the kick). */
  head?: number;
}

const chrome = () => new MeshStandardMaterial({ name: 'Chrome', color: 0xdfe2e6, metalness: 1, roughness: 0.18 });
const bronze = () => new MeshStandardMaterial({ name: 'Bronze', color: 0xc99a4a, metalness: 1, roughness: 0.32 });

function named<T extends Object3D>(o: T, name: string): T {
  o.name = name;
  return o;
}

/** A rolled hoop: a rounded lip profile turned round the drum (radius r, at height y). */
function hoopGeometry(r: number, y: number): LatheGeometry {
  const pts: Vector2[] = [];
  // up the inside, over the rounded top, down the outside: a hoop you'd see on a real snare
  const t = 0.0022;
  for (let k = 0; k <= 10; k++) {
    const a = Math.PI * (k / 10);
    pts.push(new Vector2(r + t - Math.cos(a) * t, y - 0.004 + Math.sin(a) * t + (k === 0 || k === 10 ? 0 : 0.004)));
  }
  pts.push(new Vector2(r + 2 * t, y - 0.006));
  return new LatheGeometry(pts, 64);
}

/** One drum, `d` across. Named parts: Shell, Head, CentreDot, Hoop, Lugs (each Lug with its Rod). */
export function buildDrum(d: number, look: DrumLook): Group {
  const R = d / 2;
  const g = named(new Group(), 'Drum');
  // the shell: a short wood ring under the head, lacquered
  const shellMat = new MeshStandardMaterial({ name: 'Lacquer', color: look.shell, metalness: 0.05, roughness: 0.28 });
  const shellPts = [new Vector2(R * 0.97, 0), new Vector2(R, 0.0008), new Vector2(R, DRUM_H - 0.003), new Vector2(R * 0.97, DRUM_H - 0.0025)];
  const shell = named(new Mesh(new LatheGeometry(shellPts, 64), shellMat), 'Shell');
  // the head: a membrane with a slight crown, just below the hoop's top
  const headMat = new MeshStandardMaterial({ name: 'Head', color: look.head ?? 0xf2efe8, roughness: 0.72 });
  const headPts: Vector2[] = [];
  for (let k = 0; k <= 8; k++) headPts.push(new Vector2((R * 0.985 * (8 - k)) / 8, DRUM_H - 0.0016 + 0.0009 * Math.sin((Math.PI / 2) * (k / 8))));
  const head = named(new Mesh(new LatheGeometry(headPts, 64), headMat), 'Head');
  const dot = named(new Mesh(new CylinderGeometry(R * 0.16, R * 0.16, 0.0003, 40), new MeshStandardMaterial({ name: 'Dot', color: 0xd9d4c8, roughness: 0.8 })), 'CentreDot');
  dot.position.y = DRUM_H - 0.0006;
  // the hoop over the head's edge
  const hoop = named(new Mesh(hoopGeometry(R * 0.985, DRUM_H + 0.0012), chrome()), 'Hoop');
  // lugs on the shell, each with a tension rod up to the hoop
  const lugs = named(new Group(), 'Lugs');
  const lugMat = chrome();
  const n = d > 0.095 ? 8 : 6;
  const lugGeo = new CylinderGeometry(0.0018, 0.0022, 0.007, 10);
  const rodGeo = new CylinderGeometry(0.0007, 0.0007, 0.006, 8);
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2;
    const lug = named(new Group(), `Lug${i}`);
    const body = named(new Mesh(lugGeo, lugMat), 'Body');
    body.position.set(R + 0.0016, DRUM_H * 0.42, 0);
    const rod = named(new Mesh(rodGeo, lugMat), 'Rod');
    rod.position.set(R + 0.0016, DRUM_H * 0.42 + 0.0055, 0);
    lug.add(body, rod);
    lug.rotation.y = a;
    lugs.add(lug);
  }
  g.add(shell, head, dot, hoop, lugs);
  return g;
}

/** A cymbal `d` across: a shallow cone with a bell, turned (named Cymbal). */
function cymbal(d: number, mat: MeshStandardMaterial, name: string): Mesh {
  const R = d / 2;
  const pts = [
    new Vector2(0.0012, 0.0042),
    new Vector2(R * 0.22, 0.0042),
    new Vector2(R * 0.27, 0.0026),
    new Vector2(R * 0.32, 0.0018),
    new Vector2(R, 0),
    new Vector2(R, -0.0007),
    new Vector2(R * 0.32, 0.0011),
    new Vector2(R * 0.27, 0.0019),
    new Vector2(R * 0.22, 0.0035),
    new Vector2(0.0012, 0.0035),
  ];
  return named(new Mesh(new LatheGeometry(pts, 64), mat), name);
}

/** A hi-hat `d` across: two cymbals on a short chrome rod with a clutch (named Bottom, Top, Rod, Clutch). */
export function buildHiHat(d: number): Group {
  const g = named(new Group(), 'HiHat');
  const mat = bronze();
  const rodMat = chrome();
  const rod = named(new Mesh(new CylinderGeometry(0.0016, 0.0016, DRUM_H + 0.012, 12), rodMat), 'Rod');
  rod.position.y = (DRUM_H + 0.012) / 2;
  const foot = named(new Mesh(new CylinderGeometry(0.008, 0.01, 0.003, 24), rodMat), 'Foot');
  foot.position.y = 0.0015;
  const bottom = cymbal(d, mat, 'Bottom');
  bottom.position.y = DRUM_H - 0.003;
  // the top cymbal hangs face down over it, a few millimetres up
  const top = cymbal(d, mat, 'Top');
  top.rotation.x = Math.PI;
  top.position.y = DRUM_H + 0.006;
  const clutch = named(new Mesh(new CylinderGeometry(0.0034, 0.0034, 0.004, 14), rodMat), 'Clutch');
  clutch.position.y = DRUM_H + 0.009;
  g.add(foot, rod, bottom, top, clutch);
  return g;
}
