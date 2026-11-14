/**
 * A keyboard at real key size: white keys 23.5 mm pitch and 150 mm long with the notches cut where the black keys
 * sit, black keys 11 mm wide and 95 mm long standing 10 mm proud with a sloped front, a lacquered case with end
 * cheeks, a key slip in front, a red felt strip at the fallboard and a brushed-aluminium lip. Every key is a group
 * named `Key:<midi>` pivoting at its back, so pressing it is one rotation. Deterministic and parentless.
 * Keyboard-local: origin on the desk at the keyboard's centre, +Y up, −Z away from the player; metres.
 */
import { BoxGeometry, CylinderGeometry, ExtrudeGeometry, Group, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, Shape } from '@iwsdk/core';
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
  /** Height of the white key tops above the desk. */
  top: 0.06,
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

const ivory = () => new MeshPhysicalMaterial({ name: 'Ivory', color: 0xf3efe4, roughness: 0.38, clearcoat: 0.45, clearcoatRoughness: 0.25 });
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

  // the case: a satin black body (a key bed under the keys, a key slip in front), walnut end cheeks, a gloss
  // fallboard strip with the felt along it, and behind the keys a brushed-aluminium control panel (knobs, faders, a
  // small display, a power light). Every block's edges rounded, so the lacquer and metal catch the light.
  const cheekW = 0.024;
  const depth = 0.27;
  const satin = new MeshStandardMaterial({ name: 'Satin', color: 0x111113, roughness: 0.55 });
  const walnut = new MeshPhysicalMaterial({ name: 'Walnut', color: 0x5a3a24, map: woodGrain(71), roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.35 });
  const gloss = lacquer();
  const brushed = new MeshStandardMaterial({ name: 'Brushed', color: 0xb8bcc2, metalness: 1, roughness: 0.3 });
  const caseH = KEY.top - KEY.thick - 0.004; // the key bed's top, just under the keys
  const block = (name: string, m: MeshStandardMaterial, w: number, h: number, d: number, x: number, y: number, z: number) => {
    const o = named(new Mesh(rounded(w, h, d, 0.003), m), name);
    o.position.set(x, y, z);
    o.castShadow = true;
    o.receiveShadow = true;
    root.add(o);
    return o;
  };
  // (an end panel to the left widens the case: everything spans it, the left cheek outside it)
  const L = opts.left ?? 0;
  const cw = width + L;
  const ccx = -L / 2;
  block('Bed', satin, cw + 2 * cheekW, caseH, depth, ccx, caseH / 2, -depth / 2 + 0.012);
  if (L > 0) block('EndPanel', satin, L, KEY.top - 0.004, depth - 0.012, -width / 2 - L / 2, (KEY.top - 0.004) / 2, -depth / 2 + 0.018);
  // the cheeks: walnut, as tall as the keys at the front, rising to the panel at the back
  const backH = 0.095;
  for (const side of [-1, 1]) {
    const sh = new Shape();
    const front = KEY.top + 0.008;
    sh.moveTo(0, 0);
    sh.lineTo(depth, 0);
    sh.lineTo(depth, backH);
    sh.lineTo(depth * 0.42, backH);
    sh.quadraticCurveTo(depth * 0.3, front, depth * 0.12, front);
    sh.lineTo(0, front);
    sh.lineTo(0, 0);
    const g = new ExtrudeGeometry(sh, { depth: cheekW, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 3, curveSegments: 10 });
    g.translate(0, 0, -cheekW / 2);
    g.rotateY(Math.PI / 2);
    const cheek = named(new Mesh(g, walnut), side < 0 ? 'CheekL' : 'CheekR');
    cheek.position.set(side < 0 ? -width / 2 - L - cheekW / 2 : width / 2 + cheekW / 2, 0, 0.012);
    cheek.castShadow = true;
    cheek.receiveShadow = true;
    root.add(cheek);
  }
  block('KeySlip', satin, width, KEY.top - 0.016, 0.012, 0, (KEY.top - 0.016) / 2, 0.006);
  // the fallboard: a gloss strip just behind the keys, the felt along its front, a shadow line under it
  const fallD = 0.03;
  const fallZ = -(KEY.length + 0.002) - fallD / 2;
  block('Fallboard', gloss, cw, KEY.top + 0.012, fallD, ccx, (KEY.top + 0.012) / 2, fallZ);
  const strip = named(new Mesh(new BoxGeometry(width, 0.004, 0.003), felt()), 'Felt');
  strip.position.set(0, KEY.top + 0.001, -KEY.length - 0.002);
  root.add(strip);
  // the control panel: brushed aluminium on a sloped satin back, rising to the cheeks' height
  const panD = depth - KEY.length - 0.014 - fallD;
  const panZ = fallZ - fallD / 2 - panD / 2;
  block('Back', satin, cw, backH - 0.004, panD, ccx, (backH - 0.004) / 2, panZ);
  const face = block('ControlPanel', brushed, cw - 0.01, 0.003, panD - 0.012, ccx, backH - 0.002, panZ);
  void face;
  const knob = new CylinderGeometry(0.006, 0.0065, 0.01, 24);
  const knobMat = new MeshStandardMaterial({ name: 'Knob', color: 0x1a1a1c, roughness: 0.4 });
  const dot = new BoxGeometry(0.001, 0.0006, 0.004);
  const white = new MeshStandardMaterial({ name: 'Mark', color: 0xe8e8e8, roughness: 0.5 });
  for (let k = 0; k < 6; k++) {
    const kx = -width / 2 + 0.08 + k * 0.026;
    const kn = new Mesh(knob, knobMat);
    kn.position.set(kx, backH + 0.005, panZ);
    const mk = new Mesh(dot, white);
    mk.position.set(kx, backH + 0.0103, panZ + 0.003);
    mk.rotation.y = (k * 0.7) % 1.6 - 0.8;
    root.add(kn, mk);
  }
  for (let k = 0; k < 2; k++) {
    const slot = new Mesh(new BoxGeometry(0.004, 0.001, 0.03), new MeshStandardMaterial({ color: 0x050506, roughness: 0.8 }));
    slot.position.set(width / 2 - 0.12 + k * 0.022, backH + 0.0005, panZ);
    const cap = new Mesh(new BoxGeometry(0.012, 0.006, 0.006), knobMat);
    cap.position.set(slot.position.x, backH + 0.0035, panZ - 0.006 + k * 0.01);
    root.add(slot, cap);
  }
  const lcd = named(new Mesh(new BoxGeometry(0.06, 0.0012, 0.014), new MeshStandardMaterial({ name: 'Display', color: 0x0d1a14, emissive: 0x1a3a2a, roughness: 0.2 })), 'Display');
  lcd.position.set(width / 2 - 0.05, backH + 0.0007, panZ);
  const power = named(new Mesh(new CylinderGeometry(0.0018, 0.0018, 0.0012, 12), new MeshStandardMaterial({ name: 'Power', color: 0x30ff80, emissive: 0x30ff80, emissiveIntensity: 0.8 })), 'Power');
  power.position.set(-width / 2 + 0.035, backH + 0.0007, panZ);
  root.add(lcd, power);

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
