/**
 * The desk drums as real drums, cut down so your hand still lands on the real desk (the thump is the point): a
 * lacquered wood shell under a clear coat, a coated head worn grey where sticks land, a rolled chrome hoop with lugs,
 * tension rods and claws, a snare's throw-off, a kick's port, and a hi-hat (two turned brass cymbals on a small
 * tripod). Deterministic and parentless: built the same in the app and the editor. Drum-local: origin on the desk at
 * the drum's centre, +Y up; sizes in metres.
 */
import { BoxGeometry, CylinderGeometry, Group, LatheGeometry, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, RingGeometry, Vector2 } from '@iwsdk/core';
import { cymbalRings, fineNormal, headCoat, woodGrain } from './surfaces.js';

/** The old low drums' head height (still the default shell depth for anything flat). */
export const DRUM_H = 0.022;
const DEFAULT_DEPTH = DRUM_H;

export interface DrumLook {
  /** Shell lacquer colour. */
  shell: number;
  /** Head colour (coated white, or a darker resonant head for the kick). */
  head?: number;
  /** A snare's throw-off on the side nearest you; a kick's port in its head. */
  throwOff?: boolean;
  port?: boolean;
  /** Shell depth (m): a real drum's, about 0.4 of its width for a snare. */
  depth?: number;
  /** A chrome (metal) shell, the classic snare's. */
  chromeShell?: boolean;
}

const chrome = () => new MeshStandardMaterial({ name: 'Chrome', color: 0xe8eaee, metalness: 1, roughness: 0.14 });

function named<T extends Object3D>(o: T, name: string): T {
  o.name = name;
  return o;
}

/** A rolled hoop: a rounded lip profile turned round the drum (radius r, at height y). */
function hoopGeometry(r: number, y: number): LatheGeometry {
  const pts: Vector2[] = [];
  // up the inside, over the rounded top, down the outside: a hoop you'd see on a real snare
  const t = 0.003;
  for (let k = 0; k <= 10; k++) {
    const a = Math.PI * (k / 10);
    pts.push(new Vector2(r + t - Math.cos(a) * t, y - 0.004 + Math.sin(a) * t + (k === 0 || k === 10 ? 0 : 0.004)));
  }
  pts.push(new Vector2(r + 2 * t, y - 0.006));
  return new LatheGeometry(pts, 64);
}

/** One drum, `d` across. Named parts: Shell, Head, Hoop, Lugs (each Lug with its Rod), and a snare's ThrowOff. */
export function buildDrum(d: number, look: DrumLook): Group {
  const R = d / 2;
  // (the shell's depth: a real drum's proportions unless told otherwise)
  const DRUM_H = look.depth ?? DEFAULT_DEPTH;
  const g = named(new Group(), 'Drum');
  // the shell: lacquered wood under a clear coat, a slight bearing edge at the top
  const shellMat = look.chromeShell
    ? new MeshPhysicalMaterial({ name: 'ChromeShell', color: 0xe6e8ec, metalness: 1, roughness: 0.12 })
    : new MeshPhysicalMaterial({ name: 'Lacquer', color: look.shell, map: woodGrain(Math.round(R * 1000)), metalness: 0, roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.08 });
  const shellPts = [new Vector2(R * 0.97, 0), new Vector2(R, 0.001), new Vector2(R, DRUM_H - 0.004), new Vector2(R * 0.985, DRUM_H - 0.0028)];
  const shell = named(new Mesh(new LatheGeometry(shellPts, 72), shellMat), 'Shell');
  // the head: coated, a slight crown, worn grey where the sticks land (the kick's is dark, with a port)
  const dark = look.head !== undefined;
  const headMat = new MeshStandardMaterial({ name: 'Head', color: look.head ?? 0xe6e0d2, map: dark ? null : headCoat(), normalMap: fineNormal(5, 14), roughness: dark ? 0.6 : 0.8 });
  const head = named(new Mesh(new CylinderGeometry(R * 0.985, R * 0.985, 0.0012, 72), headMat), 'Head');
  head.position.y = DRUM_H - 0.0016;
  // (top-face uvs for the wear: a cylinder's cap maps its circle to the texture)
  const parts: Object3D[] = [shell, head];
  if (look.port) {
    // the resonant head's port: a black ring off centre
    const port = named(new Mesh(new RingGeometry(R * 0.16, R * 0.2, 40), new MeshStandardMaterial({ name: 'Port', color: 0x0c0c0e, roughness: 0.5, metalness: 0.4 })), 'Port');
    port.rotation.x = -Math.PI / 2;
    port.position.set(R * 0.45, DRUM_H - 0.0009, R * 0.5);
    parts.push(port);
  }
  // the hoop over the head's edge: a rolled chrome lip
  const hoop = named(new Mesh(hoopGeometry(R * 0.985, DRUM_H + 0.0012), chrome()), 'Hoop');
  parts.push(hoop);
  // lugs on the shell, each with a tension rod up to the hoop and a claw over it
  const lugs = named(new Group(), 'Lugs');
  const lugMat = chrome();
  const n = d > 0.16 ? 10 : 8;
  const lugGeo = new BoxGeometry(0.005, Math.min(0.014, DRUM_H * 0.4), 0.007);
  const rodGeo = new CylinderGeometry(0.0008, 0.0008, 0.008, 8);
  const clawGeo = new BoxGeometry(0.003, 0.0022, 0.004);
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2;
    const lug = named(new Group(), `Lug${i}`);
    const body = named(new Mesh(lugGeo, lugMat), 'Body');
    body.position.set(R + 0.002, DRUM_H * 0.45, 0);
    const rod = named(new Mesh(rodGeo, lugMat), 'Rod');
    rod.position.set(R + 0.0022, DRUM_H * 0.72, 0);
    rod.scale.y = (DRUM_H * 0.5) / 0.008;
    const claw = named(new Mesh(clawGeo, lugMat), 'Claw');
    claw.position.set(R + 0.0012, DRUM_H + 0.0006, 0);
    lug.add(body, rod, claw);
    lug.rotation.y = a;
    lugs.add(lug);
  }
  parts.push(lugs);
  if (look.throwOff) {
    // the snare's throw-off: a chrome lever on the side nearest you
    const t = named(new Group(), 'ThrowOff');
    const base = new Mesh(new BoxGeometry(0.008, 0.011, 0.005), lugMat);
    base.position.set(0, DRUM_H * 0.45, 0);
    const lever = new Mesh(new BoxGeometry(0.0025, 0.012, 0.003), lugMat);
    lever.position.set(0.0035, DRUM_H * 0.45 + 0.004, 0.002);
    lever.rotation.z = -0.5;
    t.add(base, lever);
    t.position.set(0, 0, R + 0.0035);
    t.rotation.y = 0.0;
    parts.push(t);
  }
  g.add(...parts);
  return g;
}

/** A cymbal `d` across: a shallow cone with a bell, turned (its lathe rings in the texture), named `name`. */
function cymbal(d: number, mat: MeshStandardMaterial, name: string): Mesh {
  const R = d / 2;
  const pts = [
    new Vector2(0.0012, 0.0048),
    new Vector2(R * 0.2, 0.0048),
    new Vector2(R * 0.26, 0.003),
    new Vector2(R * 0.32, 0.002),
    new Vector2(R, 0),
    new Vector2(R, -0.0007),
    new Vector2(R * 0.32, 0.0012),
    new Vector2(R * 0.26, 0.0021),
    new Vector2(R * 0.2, 0.0041),
    new Vector2(0.0012, 0.0041),
  ];
  return named(new Mesh(new LatheGeometry(pts, 72), mat), name);
}

/**
 * A hi-hat `d` across: two cymbals a centimetre apart on a short chrome stand (a rod, a clutch, three folding legs),
 * the top one tipped a little toward you. Named Bottom, Top, Rod, Clutch, Legs.
 */
export function buildHiHat(d: number, height = DRUM_H + 0.004): Group {
  const g = named(new Group(), 'HiHat');
  const rings = cymbalRings();
  const mat = new MeshStandardMaterial({ name: 'Bronze', color: 0xd8a85a, map: rings.map, roughnessMap: rings.rough, metalness: 1, roughness: 1 });
  const rodMat = chrome();
  const H = height;
  const rod = named(new Mesh(new CylinderGeometry(0.0022, 0.0022, H + 0.014, 12), rodMat), 'Rod');
  rod.position.y = (H + 0.014) / 2;
  const legs = named(new Group(), 'Legs');
  legs.add(tripod(Math.min(0.06, H * 0.45), rodMat));
  const bottom = cymbal(d, mat, 'Bottom');
  bottom.position.y = H - 0.004;
  // the top cymbal hangs face down over it, a centimetre up, tipped toward you
  const top = cymbal(d, mat, 'Top');
  top.rotation.set(Math.PI - 0.035, 0, 0.02);
  top.position.y = H + 0.006;
  const clutch = named(new Mesh(new CylinderGeometry(0.0038, 0.0038, 0.005, 14), rodMat), 'Clutch');
  clutch.position.y = H + 0.0095;
  // (the cymbals and the clutch as one: a hit moves them, not the stand)
  const cymbals = named(new Group(), 'Cymbals');
  cymbals.add(bottom, top, clutch);
  g.add(legs, rod, cymbals);
  return g;
}

/**
 * A drum stand's tripod: three legs from a collar on the rod out and down to the desk, `spread` from the centre
 * (named Tripod). Feet at y 0.
 */
export function tripod(spread: number, mat: MeshStandardMaterial): Group {
  const g = named(new Group(), 'Tripod');
  const collarY = spread * 0.75;
  const len = Math.hypot(spread, collarY);
  const geo = new CylinderGeometry(0.0016, 0.0016, len, 8);
  const foot = new CylinderGeometry(0.003, 0.003, 0.003, 10);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    const leg = new Mesh(geo, mat);
    leg.position.set((Math.cos(a) * spread) / 2, collarY / 2, (Math.sin(a) * spread) / 2);
    leg.rotation.set(0, -a, 0);
    leg.rotateZ(Math.atan2(spread, collarY));
    const f = new Mesh(foot, rubber());
    f.position.set(Math.cos(a) * spread, 0.0015, Math.sin(a) * spread);
    g.add(leg, f);
  }
  return g;
}

const rubber = () => new MeshStandardMaterial({ name: 'Rubber', color: 0x161616, roughness: 0.9 });

/** A snare or tom stand: a tripod, a rod up to the basket, three arms gripping the drum's bottom (named Stand). */
export function drumStand(height: number, drumR: number): Group {
  const g = named(new Group(), 'Stand');
  const m = chrome();
  g.add(tripod(Math.min(0.07, drumR * 0.9), m));
  const rod = named(new Mesh(new CylinderGeometry(0.003, 0.003, height, 12), m), 'Rod');
  rod.position.y = height / 2;
  g.add(rod);
  const armGeo = new CylinderGeometry(0.0016, 0.0016, drumR * 0.85, 8);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const arm = new Mesh(armGeo, m);
    arm.position.set((Math.cos(a) * drumR * 0.85) / 2, height - 0.004, (Math.sin(a) * drumR * 0.85) / 2);
    arm.rotation.set(0, -a, Math.PI / 2 - 0.12);
    g.add(arm);
  }
  return g;
}

/** A kick drum on its side, its front head facing you (+z), resting on two spurs; `d` across, `depth` deep. */
export function buildKick(d: number, depth: number, look: DrumLook): Group {
  const g = named(new Group(), 'Kick');
  const drum = buildDrum(d, { ...look, depth });
  // on its side: the head (local +y) turned to face the player (+z), the shell's back at z −depth/2
  drum.rotation.x = Math.PI / 2;
  drum.position.set(0, d / 2 + 0.004, -depth / 2);
  g.add(drum);
  // two spurs angled out to the desk at the front
  const m = chrome();
  for (const s of [-1, 1]) {
    const spur = named(new Mesh(new CylinderGeometry(0.002, 0.002, d * 0.42, 8), m), 'Spur');
    spur.position.set(s * d * 0.36, d * 0.14, depth * 0.18);
    spur.rotation.z = s * 0.7;
    g.add(spur);
  }
  return g;
}
