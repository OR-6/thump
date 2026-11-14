/**
 * The desk drums as real drums, cut down so your hand still lands on the real desk (the thump is the point): a
 * lacquered wood shell under a clear coat, a coated head worn grey where sticks land, a rolled chrome hoop with lugs,
 * tension rods and claws, a snare's throw-off, a kick's port, and a hi-hat (two turned brass cymbals on a small
 * tripod). Deterministic and parentless: built the same in the app and the editor. Drum-local: origin on the desk at
 * the drum's centre, +Y up; sizes in metres.
 */
import { BoxGeometry, CylinderGeometry, Group, LatheGeometry, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, RingGeometry, TorusGeometry, Vector2, Vector3 } from '@iwsdk/core';
import { carbonTwill, cymbalRings, fineNormal, headCoat, meshWeave, woodGrain } from './surfaces.js';

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
  /** The shell's finish: lacquer over grain (default), natural wood, or plain matte (an electronic kit's). */
  finish?: 'lacquer' | 'natural' | 'matte';
  /** The head: coated (default), calfskin (a jazz kit's warm head), or mesh (an electronic kit's). */
  skin?: 'coat' | 'calf' | 'mesh';
  /** Hardware colour: chrome (default), black, or black nickel (a jazz kit's). */
  black?: boolean;
  blackNickel?: boolean;
  /** A bass drum's wooden hoops (in the shell's finish, with a chrome inlay) and T-handle rods. */
  woodHoops?: boolean;
}

/** A kit's look: acoustic (lacquer and chrome), jazz (natural wood, calf heads, darker cymbals), electronic (matte
 * black, mesh heads, rubber cymbal pads). */
export type KitStyle = 'acoustic' | 'jazz' | 'electronic';
export const KIT_STYLES: readonly KitStyle[] = ['acoustic', 'jazz', 'electronic'];

/** A cymbal's look for a kit style. */
export function cymbalMat(style: KitStyle): MeshStandardMaterial {
  if (style === 'electronic') return new MeshStandardMaterial({ name: 'RubberPad', color: 0x1c1c1f, roughness: 0.85, normalMap: fineNormal(3, 18) });
  const rings = cymbalRings();
  return new MeshStandardMaterial({ name: 'Bronze', color: style === 'jazz' ? 0xa98a52 : 0xd9b25e, map: rings.map, roughnessMap: rings.rough, metalness: 1, roughness: style === 'jazz' ? 1.3 : 1 });
}

const chrome = () => new MeshStandardMaterial({ name: 'Chrome', color: 0xe8eaee, metalness: 1, roughness: 0.14 });
export const blackMetal = () => new MeshStandardMaterial({ name: 'BlackHardware', color: 0x2a2b30, metalness: 0.85, roughness: 0.35 });

function named<T extends Object3D>(o: T, name: string): T {
  o.name = name;
  return o;
}

/** A hoop: a flat flange standing up round the head, its top rolled outward into a lip (radius r, top at y). */
function hoopGeometry(r: number, y: number, flange = 0.009): LatheGeometry {
  const pts: Vector2[] = [];
  const t = 0.0025;
  pts.push(new Vector2(r, y - flange));
  pts.push(new Vector2(r, y - t));
  for (let k = 0; k <= 8; k++) {
    const a = Math.PI * (k / 8);
    pts.push(new Vector2(r + t - Math.cos(a) * t, y - t + Math.sin(a) * t));
  }
  pts.push(new Vector2(r + 2 * t, y - flange));
  return new LatheGeometry(pts, 64);
}

/**
 * One drum, `d` across, as a real drum is made: a shell with a top and a bottom hoop (a rolled-lip flange standing
 * 6 mm proud of the head), the batter head with its collar, lugs on the shell with a tension rod and claw to each
 * hoop (two lugs on a deep drum), a snare's throw-off. Named parts: Shell, Head, Hoop, BottomHoop, Lugs, ThrowOff.
 */
export function buildDrum(d: number, look: DrumLook): Group {
  const R = d / 2;
  const DRUM_H = look.depth ?? DEFAULT_DEPTH;
  const g = named(new Group(), 'Drum');
  // the shell: a deep even lacquer under a mirror coat (or natural wood showing its grain, or matte, or chrome)
  const shellMat = look.chromeShell
    ? new MeshPhysicalMaterial({ name: 'ChromeShell', color: 0xe6e8ec, metalness: 1, roughness: 0.1 })
    : look.finish === 'matte'
      ? new MeshPhysicalMaterial({ name: 'Matte', color: look.shell, metalness: 0.1, roughness: 0.6, clearcoat: 0.2, clearcoatRoughness: 0.5 })
      : look.finish === 'natural'
        ? new MeshPhysicalMaterial({ name: 'Maple', color: look.shell, map: woodGrain(Math.round(R * 1000)), roughness: 0.55, clearcoat: 0.4, clearcoatRoughness: 0.3 })
        : new MeshPhysicalMaterial({ name: 'Lacquer', color: look.shell, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.04 });
  const shell = named(new Mesh(new CylinderGeometry(R, R, DRUM_H - 0.002, 64, 1, true), shellMat), 'Shell');
  shell.position.y = (DRUM_H - 0.002) / 2;
  // the head: coated near-white satin (or calf, or dark, or mesh), with its collar where it bends over the edge
  const dark = look.head !== undefined;
  const weave = look.skin === 'mesh' ? meshWeave().clone() : null;
  if (weave) {
    weave.repeat.set(d * 60, d * 60);
    weave.needsUpdate = true;
  }
  const headMat = look.skin === 'mesh'
    ? new MeshStandardMaterial({ name: 'Head', color: 0xa4a4ac, map: weave, roughness: 0.7 })
    : dark
      ? new MeshPhysicalMaterial({ name: 'Head', color: look.head, normalMap: fineNormal(5, 14), roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12 })
      : new MeshPhysicalMaterial({ name: 'Head', color: look.skin === 'calf' ? 0xe2d3b0 : 0xf1efe9, map: headCoat(), normalMap: fineNormal(5, 14), roughness: look.skin === 'calf' ? 0.75 : 0.5, clearcoat: look.skin === 'calf' ? 0 : 0.3, clearcoatRoughness: 0.5 });
  const head = named(new Mesh(new CylinderGeometry(R * 0.985, R * 0.985, 0.0012, 72), headMat), 'Head');
  head.position.y = DRUM_H - 0.0016;
  const collar = named(new Mesh(new RingGeometry(R * 0.94, R * 0.985, 72), new MeshStandardMaterial({ name: 'Collar', color: look.skin === 'calf' ? 0xc9b48c : 0xcfcac0, roughness: 0.6 })), 'Collar');
  collar.rotation.x = -Math.PI / 2;
  collar.position.y = DRUM_H - 0.0009;
  const parts: Object3D[] = [shell, head, collar];
  // the hoops, top and bottom: chrome (or black, black nickel, or a bass drum's wooden hoops with a chrome inlay)
  const metal = look.black ? blackMetal() : look.blackNickel ? new MeshStandardMaterial({ name: 'BlackNickel', color: 0x5a5a60, metalness: 1, roughness: 0.22 }) : chrome();
  const hoopMat = look.woodHoops ? shellMat : metal;
  const fl = look.woodHoops ? 0.014 : 0.009;
  const hoop = named(new Mesh(hoopGeometry(R * 0.995, DRUM_H + 0.006, fl), hoopMat), 'Hoop');
  const bottom = named(new Mesh(hoopGeometry(R * 0.995, fl, fl), hoopMat), 'BottomHoop');
  bottom.scale.y = -1;
  bottom.position.y = fl;
  parts.push(hoop, bottom);
  if (look.woodHoops) {
    for (const y of [DRUM_H + 0.006 - fl * 0.5, fl * 0.5]) {
      const inlay = named(new Mesh(new CylinderGeometry(R * 0.995 + 0.0052, R * 0.995 + 0.0052, 0.003, 64, 1, true), chrome()), 'Inlay');
      inlay.position.y = y;
      parts.push(inlay);
    }
  }
  // lugs on the shell: one per rod pair on a shallow drum, two (top and bottom) on a deep one; rods to each hoop
  const lugs = named(new Group(), 'Lugs');
  const deep = DRUM_H > 0.07;
  const n = d > 0.21 ? 10 : d > 0.16 ? 8 : 6;
  const lugGeo = new BoxGeometry(0.006, deep ? 0.012 : Math.min(0.016, DRUM_H * 0.4), 0.008);
  const rodGeo = new CylinderGeometry(0.0009, 0.0009, 1, 8);
  const clawGeo = new BoxGeometry(0.0035, 0.0026, 0.005);
  const tGeo = new BoxGeometry(0.0022, 0.0022, 0.014);
  for (let i = 0; i < n; i++) {
    const lug = named(new Group(), `Lug${i}`);
    const ys = deep ? [DRUM_H * 0.72, DRUM_H * 0.28] : [DRUM_H * 0.5];
    ys.forEach((ly, j) => {
      const body = named(new Mesh(lugGeo, metal), 'Body');
      body.position.set(R + 0.0025, ly, 0);
      lug.add(body);
      const ends = deep ? [j === 0 ? DRUM_H + 0.006 - fl : fl] : [DRUM_H + 0.006 - fl, fl];
      for (const ey of ends) {
        const from = ey > ly ? ly + 0.006 : ly - 0.006;
        const rod = named(new Mesh(rodGeo, metal), 'Rod');
        rod.scale.y = Math.max(0.001, Math.abs(ey - from));
        rod.position.set(R + 0.0035, (ey + from) / 2, 0);
        const claw = named(new Mesh(clawGeo, metal), 'Claw');
        claw.position.set(R + 0.0035, ey + (ey > ly ? 0.0012 : -0.0012), 0);
        lug.add(rod, claw);
        // (a bass drum's top rods end in T-handles outside the hoop)
        if (look.woodHoops && ey > ly) {
          const t = named(new Mesh(tGeo, chrome()), 'THandle');
          t.position.set(R + 0.0035, DRUM_H + 0.006 + 0.004, 0);
          lug.add(t);
        }
      }
    });
    lug.rotation.y = ((i + 0.5) / n) * Math.PI * 2;
    lugs.add(lug);
  }
  parts.push(lugs);
  if (look.throwOff) {
    const t = named(new Group(), 'ThrowOff');
    const base = new Mesh(new BoxGeometry(0.009, 0.014, 0.005), metal);
    base.position.set(0, DRUM_H * 0.5, 0);
    const lever = new Mesh(new BoxGeometry(0.0025, 0.014, 0.003), metal);
    lever.position.set(0.0035, DRUM_H * 0.5 + 0.005, 0.002);
    lever.rotation.z = -0.5;
    t.add(base, lever);
    t.position.set(0, 0, R + 0.004);
    parts.push(t);
  }
  g.add(...parts);
  return g;
}

/**
 * A floor tom on its three chrome legs: brackets on the shell at 60 % of its height, the legs splayed out to rubber
 * feet, the bottom hoop 3 cm off the desk.
 */
export function buildFloorTom(d: number, look: DrumLook): Group {
  const g = named(new Group(), 'FloorTom');
  const depth = look.depth ?? 0.11;
  const lift = 0.03;
  const drum = buildDrum(d, look);
  drum.position.y = lift;
  g.add(drum);
  const R = d / 2;
  const m = look.black ? blackMetal() : chrome();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const top = new Vector3(c * (R + 0.008), lift + depth * 0.6, sn * (R + 0.008));
    const foot = new Vector3(c * (R + 0.026), 0.003, sn * (R + 0.026));
    const bracket = named(new Mesh(new BoxGeometry(0.008, 0.012, 0.012), m), 'Bracket');
    bracket.position.set(c * (R + 0.003), lift + depth * 0.6, sn * (R + 0.003));
    bracket.rotation.y = -a;
    const leg = tube(top, foot, 0.002, m);
    leg.name = 'Leg';
    const f = named(new Mesh(new CylinderGeometry(0.0045, 0.005, 0.005, 12), rubber()), 'Foot');
    f.position.copy(foot);
    g.add(bracket, leg, f);
  }
  return g;
}

/** A cymbal `d` across: a shallow cone with a bell, turned (its lathe rings in the texture), named `name`. */
function cymbal(d: number, mat: MeshStandardMaterial, name: string, bell = 0.2, rise = 0.0048): Mesh {
  const R = d / 2;
  const pts = [
    new Vector2(0.0012, rise),
    new Vector2(R * bell, rise),
    new Vector2(R * (bell + 0.06), rise * 0.62),
    new Vector2(R * (bell + 0.12), rise * 0.42),
    new Vector2(R, 0),
    new Vector2(R, -0.0007),
    new Vector2(R * (bell + 0.12), rise * 0.25),
    new Vector2(R * (bell + 0.06), rise * 0.44),
    new Vector2(R * bell, rise - 0.0007),
    new Vector2(0.0012, rise - 0.0007),
  ];
  const geo = new LatheGeometry(pts, 72);
  // (the lathe's v runs along the profile's points; the rings want it to run out from the centre)
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setY(i, Math.min(1, Math.hypot(pos.getX(i), pos.getZ(i)) / R));
  uv.needsUpdate = true;
  return named(new Mesh(geo, mat), name);
}

/**
 * A hi-hat `d` across: two cymbals a centimetre apart on a short chrome stand (a rod, a clutch, three folding legs),
 * the top one tipped a little toward you. Named Bottom, Top, Rod, Clutch, Legs.
 */
export function buildHiHat(d: number, height = DRUM_H + 0.004, style: KitStyle = 'acoustic'): Group {
  const g = named(new Group(), 'HiHat');
  const mat = cymbalMat(style);
  const rodMat = style === 'electronic' ? blackMetal() : chrome();
  const H = height;
  const rod = named(new Mesh(new CylinderGeometry(0.0022, 0.0022, H + 0.014, 12), rodMat), 'Rod');
  rod.position.y = (H + 0.014) / 2;
  const legs = named(new Group(), 'Legs');
  legs.add(tripod(Math.min(0.06, H * 0.45), rodMat));
  // (the cymbals and the clutch as one, pivoting where they sit: a hit moves them, not the stand)
  const cymbals = named(new Group(), 'Cymbals');
  cymbals.position.y = H;
  const bottom = cymbal(d, mat, 'Bottom');
  bottom.position.y = -0.006;
  // the top cymbal hangs face down over it, 12 mm up, tipped toward you
  const top = cymbal(d, mat, 'Top');
  top.rotation.set(Math.PI - 0.035, 0, 0.02);
  top.position.y = 0.0105;
  const clutch = named(new Mesh(new CylinderGeometry(0.0038, 0.0038, 0.005, 14), rodMat), 'Clutch');
  clutch.position.y = 0.014;
  cymbals.add(bottom, top, clutch);
  g.add(legs, rod, cymbals);
  return g;
}

/**
 * A drum stand's tripod: three legs from a collar on the rod out and down to the desk, `spread` from the centre
 * (named Tripod). Feet at y 0.
 */
/**
 * A crash or ride on its stand: a tripod, a rod up to a tilter, the cymbal tipped toward you by `tilt` (rad), with
 * a felt and wing nut on top. The ride's bell is bigger and it sits flatter. Named Cymbals (the pivot a hit swings)
 * and Top (the cymbal).
 */
export function buildCymbal(d: number, height: number, tilt: number, kind: 'crash' | 'ride', style: KitStyle = 'acoustic'): Group {
  const g = named(new Group(), kind === 'crash' ? 'Crash' : 'Ride');
  const metal = style === 'electronic' ? blackMetal() : chrome();
  const legs = named(new Group(), 'Legs');
  legs.add(tripod(0.06, metal));
  const rod = named(new Mesh(new CylinderGeometry(0.0028, 0.0028, height - 0.006, 12), metal), 'Rod');
  rod.position.y = (height - 0.006) / 2;
  const tilter = named(new Mesh(new BoxGeometry(0.008, 0.01, 0.008), metal), 'Tilter');
  tilter.position.y = height - 0.008;
  const cymbals = named(new Group(), 'Cymbals');
  cymbals.position.y = height;
  cymbals.rotation.x = tilt;
  // (a crash's bow rises to a clear domed bell about 1 cm up; a ride is heavier with a wider bell)
  const top = cymbal(d, cymbalMat(style), 'Top', kind === 'ride' ? 0.28 : 0.22, kind === 'ride' ? 0.013 : 0.012);
  const felt = named(new Mesh(new CylinderGeometry(0.0045, 0.0045, 0.003, 14), new MeshStandardMaterial({ name: 'Felt', color: style === 'electronic' ? 0x2a2a2e : 0x7a1f1a, roughness: 0.95 })), 'Felt');
  felt.position.y = (kind === 'ride' ? 0.013 : 0.012) + 0.0015;
  const nut = named(new Mesh(new BoxGeometry(0.012, 0.003, 0.003), metal), 'WingNut');
  nut.position.y = felt.position.y + 0.003;
  cymbals.add(top, felt, nut);
  g.add(legs, rod, tilter, cymbals);
  return g;
}

/** A drum that stands on the desk on three rubber feet (the bass drum and the floor tom lie flat: no stand, no legs). */
export function buildFloorDrum(d: number, look: DrumLook): Group {
  const g = named(new Group(), 'FloorDrum');
  const drum = buildDrum(d, look);
  drum.position.y = 0.006;
  g.add(drum);
  const foot = new CylinderGeometry(0.006, 0.0075, 0.006, 14);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    const f = named(new Mesh(foot, rubber()), 'Foot');
    f.position.set(Math.cos(a) * d * 0.36, 0.003, Math.sin(a) * d * 0.36);
    g.add(f);
  }
  return g;
}

/**
 * An electronic kit's pad, as on a real e-kit: a shallow black plastic shell 3.5 cm deep, a grey mesh head inside a
 * thick rubber rim, a jack on the side. No lugs, no hoop. Its top is at `depth` above its origin. Named Drum and Head.
 */
export function buildEPad(d: number, depth = 0.035): Group {
  const g = named(new Group(), 'EPad');
  const R = d / 2;
  const drum = named(new Group(), 'Drum');
  const plastic = new MeshStandardMaterial({ name: 'Plastic', color: 0x1d1d20, roughness: 0.55, metalness: 0.05 });
  // the shell in carbon weave under a clear coat, a brushed-aluminium trim ring at its top, and round it a thin LED
  // strip (named Glow: it flares when the pad is hit)
  const twill = carbonTwill().clone();
  twill.repeat.set(Math.max(4, Math.round(d * 70)), 2);
  twill.needsUpdate = true;
  const carbon = new MeshPhysicalMaterial({ name: 'Carbon', color: 0xffffff, map: twill, roughness: 0.38, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.12 });
  const shell = named(new Mesh(new CylinderGeometry(R * 0.97, R * 0.97, depth - 0.006, 48), carbon), 'Shell');
  shell.position.y = (depth - 0.006) / 2;
  const trim = named(new Mesh(new CylinderGeometry(R * 0.975, R * 0.975, 0.004, 48, 1, true), new MeshStandardMaterial({ name: 'Trim', color: 0xc2c6cc, metalness: 1, roughness: 0.28 })), 'Trim');
  trim.position.y = depth - 0.008;
  const glow = named(new Mesh(new CylinderGeometry(R * 0.955, R * 0.94, 0.0045, 48, 1, true), new MeshStandardMaterial({ name: 'Glow', color: 0x0a1a24, emissive: 0x2fa8ff, emissiveIntensity: 0.3, roughness: 0.4 })), 'Glow');
  glow.position.y = depth * 0.45;
  const rubber = new MeshStandardMaterial({ name: 'Rim', color: 0x141416, roughness: 0.9 });
  const rim = named(new Mesh(new TorusGeometry(R * 0.945, 0.009, 12, 64), rubber), 'Rim');
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = depth - 0.004;
  const weave = meshWeave().clone();
  weave.repeat.set(d * 60, d * 60);
  weave.needsUpdate = true;
  const head = named(new Mesh(new CylinderGeometry(R * 0.9, R * 0.9, 0.0015, 48), new MeshStandardMaterial({ name: 'Head', color: 0xb8b8c2, map: weave, roughness: 0.7 })), 'Head');
  head.position.y = depth - 0.003;
  const jack = named(new Mesh(new BoxGeometry(0.012, 0.012, 0.016), plastic), 'Jack');
  jack.position.set(R * 0.9, depth * 0.4, 0);
  drum.add(shell, trim, glow, rim, head, jack);
  g.add(drum);
  return g;
}

/**
 * An electronic cymbal pad: a flat rubber disc 7 mm thick with a raised bell, a grey edge where the cymbal's edge zone
 * is, on a short black post with a wing nut. Named Cymbals (the pivot that swings) and Top.
 */
export function buildECymbal(d: number, tilt: number): Group {
  const g = named(new Group(), 'ECymbal');
  const R = d / 2;
  const cymbals = named(new Group(), 'Cymbals');
  cymbals.rotation.x = tilt;
  const black = new MeshStandardMaterial({ name: 'RubberPad', color: 0x18181b, roughness: 0.82, normalMap: fineNormal(3, 18) });
  const pts = [new Vector2(0.001, 0.009), new Vector2(R * 0.22, 0.009), new Vector2(R * 0.3, 0.0045), new Vector2(R, 0.0035), new Vector2(R, -0.0035), new Vector2(0.001, -0.0035)];
  const top = named(new Mesh(new LatheGeometry(pts, 64), black), 'Top');
  const edge = named(new Mesh(new TorusGeometry(R * 0.985, 0.0035, 8, 64), new MeshStandardMaterial({ name: 'EdgeZone', color: 0xb8bcc2, metalness: 0.9, roughness: 0.32 })), 'Edge');
  edge.rotation.x = -Math.PI / 2;
  // a lit ring round the bell (named Glow, like the pads')
  const ring = named(new Mesh(new TorusGeometry(R * 0.3, 0.0016, 8, 48), new MeshStandardMaterial({ name: 'Glow', color: 0x0a1a24, emissive: 0x2fa8ff, emissiveIntensity: 0.45 })), 'Glow');
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.0047;
  const nut = named(new Mesh(new BoxGeometry(0.014, 0.004, 0.004), blackMetal()), 'WingNut');
  nut.position.y = 0.012;
  cymbals.add(top, edge, ring, nut);
  g.add(cymbals);
  return g;
}

/** A tube from `a` to `b` (radius r): a rack bar or a pad's arm. */
export function tube(a: Vector3, b: Vector3, r: number, mat: MeshStandardMaterial): Mesh {
  const len = a.distanceTo(b);
  const m = new Mesh(new CylinderGeometry(r, r, Math.max(0.001, len), 10), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), new Vector3().subVectors(b, a).normalize());
  return m;
}

/** The e-kit's drum module (its brain): a dark box with a small lit screen, knobs and a row of buttons. */
export function buildModule(): Group {
  const g = named(new Group(), 'DrumModule');
  const body = named(new Mesh(new BoxGeometry(0.11, 0.07, 0.03), new MeshStandardMaterial({ name: 'ModuleBody', color: 0x202024, roughness: 0.5 })), 'Body');
  const screen = named(new Mesh(new BoxGeometry(0.05, 0.022, 0.002), new MeshStandardMaterial({ name: 'Screen', color: 0x0c1418, emissive: 0x2a6a8a, emissiveIntensity: 0.6, roughness: 0.2 })), 'Screen');
  screen.position.set(-0.018, 0.012, 0.0155);
  g.add(body, screen);
  const knob = new CylinderGeometry(0.0055, 0.006, 0.006, 20);
  const kmat = new MeshStandardMaterial({ name: 'Knob', color: 0x3a3a40, roughness: 0.4, metalness: 0.3 });
  for (const [x, y] of [[0.03, 0.014], [0.03, -0.012]] as const) {
    const k = new Mesh(knob, kmat);
    k.rotation.x = Math.PI / 2;
    k.position.set(x, y, 0.018);
    g.add(k);
  }
  const btn = new BoxGeometry(0.008, 0.005, 0.003);
  const bmat = new MeshStandardMaterial({ name: 'Button', color: 0x4a4a52, roughness: 0.6 });
  for (let i = 0; i < 5; i++) {
    const b = new Mesh(btn, bmat);
    b.position.set(-0.04 + i * 0.011, -0.02, 0.0165);
    g.add(b);
  }
  return g;
}

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
