/**
 * A keyboard at real key size: white keys 23.5 mm pitch and 150 mm long with the notches cut where the black keys
 * sit, black keys 11 mm wide and 95 mm long standing 10 mm proud with a sloped front, a lacquered case with end
 * cheeks, a key slip in front, a red felt strip at the fallboard and a brushed-aluminium lip. Every key is a group
 * named `Key:<midi>` pivoting at its back, so pressing it is one rotation. Deterministic and parentless.
 * Keyboard-local: origin on the desk at the keyboard's centre, +Y up, −Z away from the player; metres.
 */
import { BoxGeometry, CylinderGeometry, ExtrudeGeometry, Group, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, Shape } from '@iwsdk/core';
import { woodGrain } from './surfaces.js';

export const KEY = {
  /** White key pitch (centre to centre) and the gap between keys. */
  pitch: 0.0235,
  gap: 0.001,
  /** Visible white key length and thickness. */
  length: 0.15,
  thick: 0.014,
  /** Black key width, length, height above the white tops. */
  blackW: 0.011,
  blackL: 0.095,
  blackH: 0.0105,
  /** Height of the white key tops above the desk (a slim compact keyboard's). */
  top: 0.042,
  /** Full press: how far the front dips (radians about the back pivot). */
  press: 0.055,
} as const;

/** Notes in an octave that are white, with the black key centre offsets (in white-key widths) that follow each. */
const WHITE = [0, 2, 4, 5, 7, 9, 11];
/** Black-key centre offsets from the octave's first white key edge, in white-key pitches (real pianos spread the pairs). */
const BLACK_AT: Record<number, number> = { 1: 0.93, 3: 2.07, 6: 3.9, 8: 5.0, 10: 6.1 };

export interface PianoOptions {
  /** Lowest key's MIDI note (a C). */
  low?: number;
  /** Whole octaves; a final C is added on top. */
  octaves?: number;
  /** An end panel this wide inside the case to the left of the keys (a stage keyboard's wheels and pads). */
  left?: number;
}

export interface PianoParts {
  root: Group;
  /** Key groups by MIDI note (pivot at the back of the key). */
  keys: Map<number, Group>;
  /** Overall width of the key bed (m). */
  width: number;
}

function named<T extends Object3D>(o: T, name: string): T {
  o.name = name;
  return o;
}

const ivory = () => new MeshPhysicalMaterial({ name: 'Ivory', color: 0xf4eedf, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.18 });
const ebony = () => new MeshPhysicalMaterial({ name: 'Ebony', color: 0x131315, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.3 });
const lacquer = () => new MeshPhysicalMaterial({ name: 'Lacquer', color: 0x0c0c0e, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 });
const felt = () => new MeshStandardMaterial({ name: 'Felt', color: 0x8e1e26, roughness: 1 });
const alu = () => new MeshStandardMaterial({ name: 'Aluminium', color: 0xb9bdc3, metalness: 1, roughness: 0.38 });

/** The top-view outline of a white key: full width at the front, notched at the back where black keys sit. */
function whiteShape(x0: number, x1: number, leftBlack: number | null, rightBlack: number | null): Shape {
  const half = KEY.blackW / 2 + KEY.gap * 1.6;
  const bx0 = leftBlack === null ? x0 : Math.max(x0, leftBlack + half);
  const bx1 = rightBlack === null ? x1 : Math.min(x1, rightBlack - half);
  const frontD = KEY.length - KEY.blackL - 0.004; // the un-notched front part
  const s = new Shape();
  s.moveTo(x0, 0);
  s.lineTo(x1, 0);
  s.lineTo(x1, frontD);
  s.lineTo(bx1, frontD);
  s.lineTo(bx1, KEY.length);
  s.lineTo(bx0, KEY.length);
  s.lineTo(bx0, frontD);
  s.lineTo(x0, frontD);
  s.closePath();
  return s;
}

/** The side profile of a black key: flat top, a sloped front, over its length. */
function blackProfile(): Shape {
  const s = new Shape();
  const slope = 0.012;
  s.moveTo(0, 0);
  s.lineTo(KEY.blackL, 0);
  s.lineTo(KEY.blackL, KEY.blackH);
  s.lineTo(slope, KEY.blackH);
  s.lineTo(0, KEY.blackH * 0.55);
  s.closePath();
  return s;
}

export function buildPiano(opts: PianoOptions = {}): PianoParts {
  const low = opts.low ?? 48;
  const octaves = opts.octaves ?? 2;
  const whiteCount = octaves * 7 + 1;
  const width = whiteCount * KEY.pitch;
  const x0 = -width / 2;
  const root = named(new Group(), 'Piano');
  const keys = new Map<number, Group>();

  // where every key sits (x centre for blacks; x range for whites), by MIDI note
  const blacks = new Map<number, number>();
  const whites: { midi: number; x0: number; x1: number }[] = [];
  for (let o = 0; o <= octaves; o++) {
    const ox = x0 + o * 7 * KEY.pitch;
    for (let k = 0; k < 12; k++) {
      const midi = low + o * 12 + k;
      if (o === octaves && k > 0) break; // the final C only
      const w = WHITE.indexOf(k);
      if (w >= 0) whites.push({ midi, x0: ox + w * KEY.pitch + KEY.gap / 2, x1: ox + (w + 1) * KEY.pitch - KEY.gap / 2 });
      else blacks.set(midi, ox + BLACK_AT[k] * KEY.pitch);
    }
  }

  const whiteMat = ivory();
  const blackMat = ebony();
  // white keys
  for (const w of whites) {
    const leftBlack = blacks.get(w.midi - 1) ?? null;
    const rightBlack = blacks.get(w.midi + 1) ?? null;
    const geo = new ExtrudeGeometry(whiteShape(w.x0, w.x1, leftBlack, rightBlack), { depth: KEY.thick, bevelEnabled: true, bevelThickness: 0.0009, bevelSize: 0.0007, bevelSegments: 2 });
    // shape y (depth into the keyboard) → −Z; extrude → +Y; pivot at the back of the key
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, -KEY.thick, KEY.length);
    const mesh = named(new Mesh(geo, whiteMat), 'White');
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const g = named(new Group(), `Key:${w.midi}`);
    g.position.set(0, KEY.top, -KEY.length);
    g.add(mesh);
    root.add(g);
    keys.set(w.midi, g);
  }
  // black keys
  const blackGeo = new ExtrudeGeometry(blackProfile(), { depth: KEY.blackW, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0007, bevelSegments: 2 });
  // profile x (length, 0 at the sloped front) → −Z, extrude (width) → +X; then slide it so its back is at the pivot
  blackGeo.rotateY(Math.PI / 2);
  blackGeo.translate(-KEY.blackW / 2, 0, KEY.blackL);
  for (const [midi, x] of blacks) {
    const mesh = named(new Mesh(blackGeo, blackMat), 'Black');
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // the pivot is the back of the keybed like the whites; the key runs forward from it
    mesh.position.set(x, 0, 0);
    const g = named(new Group(), `Key:${midi}`);
    g.position.set(0, KEY.top, -KEY.length);
    g.add(mesh);
    root.add(g);
    keys.set(midi, g);
  }

  // the body, as a compact keyboard is made: slim and low, the keys running right to its front edge, a flat top
  // panel behind them with the controls (a small screen, knobs, eight rubber pads that light, a row of round buttons,
  // a speaker grille), rounded red end caps, rubber feet. No brand, no logo.
  const L = opts.left ?? 0;
  const capW = 0.018;
  const panelD = 0.1;
  const depth = KEY.length + 0.006 + panelD;
  const bodyW = width + L;
  const bx = -L / 2;
  const topY = KEY.top + 0.004;
  const graphite = new MeshPhysicalMaterial({ name: 'Body', color: 0x232428, roughness: 0.55, metalness: 0.1, clearcoat: 0.25, clearcoatRoughness: 0.45 });
  const red = new MeshPhysicalMaterial({ name: 'EndCap', color: 0xc2271c, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  const plate = new MeshStandardMaterial({ name: 'TopPlate', color: 0x17181b, roughness: 0.62 });
  const block = (name: string, m: MeshStandardMaterial, w: number, h: number, d: number, x: number, y: number, z: number, r = 0.003) => {
    const o = named(new Mesh(rounded(w, h, d, r), m), name);
    o.position.set(x, y, z);
    o.castShadow = true;
    o.receiveShadow = true;
    root.add(o);
    return o;
  };
  // the tub under the keys (its front lip just under them) and the raised top panel behind them
  const bedH = KEY.top - KEY.thick - 0.002;
  block('Bed', graphite, bodyW, bedH, KEY.length + 0.01, bx, bedH / 2, -KEY.length / 2 + 0.002);
  const panZ = -KEY.length - 0.006 - panelD / 2;
  block('TopPanel', graphite, bodyW, topY, panelD + 0.004, bx, topY / 2, panZ);
  const face = block('Plate', plate, bodyW - 0.012, 0.0016, panelD - 0.012, bx, topY + 0.0004, panZ, 0.0008);
  void face;
  // a thin gloss strip where the keys run in under the panel, with the felt along it
  block('Fallboard', lacquer(), bodyW, 0.012, 0.008, bx, KEY.top + 0.002, -KEY.length - 0.003, 0.0015);
  const strip = named(new Mesh(new BoxGeometry(width, 0.003, 0.003), felt()), 'Felt');
  strip.position.set(0, KEY.top + 0.0008, -KEY.length + 0.0005);
  root.add(strip);
  // the end panel to the left of the keys (the chord pad and wheels sit on it): level with the keys' front
  if (L > 0) block('EndPanel', graphite, L, KEY.top - 0.003, KEY.length + 0.01, -width / 2 - L / 2, (KEY.top - 0.003) / 2, -KEY.length / 2 + 0.002);
  // the end caps: rounded red cheeks the full depth, a little taller than the top panel
  for (const side of [-1, 1]) {
    const sh = new Shape();
    const h = topY + 0.004;
    sh.moveTo(0, 0);
    sh.lineTo(depth, 0);
    sh.lineTo(depth, h - 0.006);
    sh.quadraticCurveTo(depth, h, depth - 0.006, h);
    sh.lineTo(0.008, h);
    sh.quadraticCurveTo(0, h, 0, h - 0.008);
    sh.lineTo(0, 0);
    const g = new ExtrudeGeometry(sh, { depth: capW, bevelEnabled: true, bevelSize: 0.0025, bevelThickness: 0.0025, bevelSegments: 3, curveSegments: 8 });
    g.translate(0, 0, -capW / 2);
    g.rotateY(Math.PI / 2);
    const cap = named(new Mesh(g, red), side < 0 ? 'CapL' : 'CapR');
    cap.position.set(side < 0 ? -width / 2 - L - capW / 2 : width / 2 + capW / 2, 0, 0.004);
    cap.castShadow = true;
    cap.receiveShadow = true;
    root.add(cap);
  }
  // on the top panel, left to right: the screen, four knobs, the eight pads, the speaker grille; buttons along the front
  const px0 = bx - bodyW / 2 + 0.02;
  const lcd = named(new Mesh(new BoxGeometry(0.06, 0.0012, 0.022), new MeshStandardMaterial({ name: 'Display', color: 0x0b1416, emissive: 0x123a4a, emissiveIntensity: 0.6, roughness: 0.15 })), 'Display');
  lcd.position.set(px0 + 0.035, topY + 0.0012, panZ - 0.012);
  root.add(lcd);
  const knob = new CylinderGeometry(0.0065, 0.007, 0.011, 24);
  const knobMat = new MeshStandardMaterial({ name: 'Knob', color: 0x111113, roughness: 0.42 });
  const markMat = new MeshStandardMaterial({ name: 'Mark', color: 0xf0f0f0, roughness: 0.5 });
  const ringMat = new MeshStandardMaterial({ name: 'KnobRing', color: 0x2a1a08, emissive: 0xffa040, emissiveIntensity: 0.4 });
  for (let k = 0; k < 4; k++) {
    const kx = px0 + 0.085 + k * 0.022;
    const kn = new Mesh(knob, knobMat);
    kn.position.set(kx, topY + 0.0055, panZ - 0.014);
    const mk = new Mesh(new BoxGeometry(0.0012, 0.0006, 0.005), markMat);
    mk.position.set(kx, topY + 0.0113, panZ - 0.0155);
    mk.rotation.y = (k * 0.9) % 1.8 - 0.9;
    const ring = new Mesh(new CylinderGeometry(0.0085, 0.0085, 0.0008, 24, 1, true), ringMat);
    ring.position.set(kx, topY + 0.0006, panZ - 0.014);
    root.add(kn, mk, ring);
  }
  // the pads: soft rubber squares, backlit (named Pad0..7: they light in colour as you play)
  const padGeo = rounded(0.017, 0.004, 0.017, 0.002);
  const pads = named(new Group(), 'Pads');
  for (let k = 0; k < 8; k++) {
    const pad = named(new Mesh(padGeo, new MeshStandardMaterial({ name: `Pad${k}`, color: 0x2c2d31, roughness: 0.85, emissive: 0x000000 })), `Pad${k}`);
    pad.position.set(px0 + 0.185 + (k % 4) * 0.021, topY + 0.002, panZ - 0.022 + Math.floor(k / 4) * 0.021);
    pads.add(pad);
  }
  root.add(pads);
  // the speaker grille: a field of slots at the right end
  const slot = new BoxGeometry(0.03, 0.0008, 0.0022);
  const slotMat = new MeshStandardMaterial({ name: 'Grille', color: 0x050506, roughness: 0.9 });
  const gx = bx + bodyW / 2 - 0.035;
  for (let k = 0; k < 11; k++) {
    for (const dx of [-0.017, 0.017]) {
      const sl = new Mesh(slot, slotMat);
      sl.position.set(gx + dx, topY + 0.0004, panZ - panelD / 2 + 0.014 + k * 0.0065);
      root.add(sl);
    }
  }
  // a row of round buttons along the panel's front edge, two of them coloured
  const btnGeo = new CylinderGeometry(0.0042, 0.0042, 0.003, 18);
  const btnMats = [new MeshStandardMaterial({ name: 'Button', color: 0x3a3b40, roughness: 0.5 }), new MeshStandardMaterial({ name: 'ButtonBlue', color: 0x4aa0e0, roughness: 0.45 }), new MeshStandardMaterial({ name: 'ButtonAmber', color: 0xf0a030, roughness: 0.45 })];
  for (let k = 0; k < 9; k++) {
    const b = new Mesh(btnGeo, btnMats[k === 6 ? 1 : k === 7 ? 2 : 0]);
    b.position.set(px0 + 0.085 + k * 0.0125, topY + 0.0015, panZ + panelD / 2 - 0.016);
    root.add(b);
  }
  const power = named(new Mesh(new CylinderGeometry(0.0018, 0.0018, 0.0012, 12), new MeshStandardMaterial({ name: 'Power', color: 0x30ff80, emissive: 0x30ff80, emissiveIntensity: 0.8 })), 'Power');
  power.position.set(px0 + 0.006, topY + 0.0012, panZ + panelD / 2 - 0.016);
  root.add(power);
  // four rubber feet
  const footGeo = new CylinderGeometry(0.008, 0.009, 0.004, 16);
  const footMat = new MeshStandardMaterial({ name: 'Rubber', color: 0x0e0e10, roughness: 0.9 });
  for (const fx of [bx - bodyW / 2 + 0.02, bx + bodyW / 2 - 0.02])
    for (const fz of [-0.01, -depth + 0.02]) {
      const f = new Mesh(footGeo, footMat);
      f.position.set(fx, -0.0015, fz);
      root.add(f);
    }

  return { root, keys, width };
}

/** A box with its edges rounded by `r` (an extruded rounded rectangle, bevelled): x by y by z, centred. */
function rounded(w: number, h: number, d: number, r: number): ExtrudeGeometry {
  const sh = new Shape();
  const x = -w / 2 + r;
  const y = -h / 2 + r;
  const W = w - 2 * r;
  const H = h - 2 * r;
  sh.moveTo(x, y - r);
  sh.lineTo(x + W, y - r);
  sh.quadraticCurveTo(x + W + r, y - r, x + W + r, y);
  sh.lineTo(x + W + r, y + H);
  sh.quadraticCurveTo(x + W + r, y + H + r, x + W, y + H + r);
  sh.lineTo(x, y + H + r);
  sh.quadraticCurveTo(x - r, y + H + r, x - r, y + H);
  sh.lineTo(x - r, y);
  sh.quadraticCurveTo(x - r, y - r, x, y - r);
  const g = new ExtrudeGeometry(sh, { depth: Math.max(0.0005, d - 2 * r), bevelEnabled: true, bevelSize: r * 0.9, bevelThickness: r, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -(d - 2 * r) / 2);
  return g;
}

/** The X centre of a key, keyboard-local. */
export function keyCentre(parts: PianoParts, midi: number): number | null {
  const g = parts.keys.get(midi);
  if (!g) return null;
  const mesh = g.children[0] as Mesh;
  if (mesh.name === 'Black') return mesh.position.x;
  mesh.geometry.computeBoundingBox();
  const bb = mesh.geometry.boundingBox!;
  return (bb.min.x + bb.max.x) / 2;
}

export const isBlack = (midi: number): boolean => WHITE.indexOf(midi % 12) < 0;
