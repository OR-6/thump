/**
 * A keyboard at real key size: white keys 23.5 mm pitch and 150 mm long with the notches cut where the black keys
 * sit, black keys 11 mm wide and 95 mm long standing 10 mm proud with a sloped front, a lacquered case with end
 * cheeks, a key slip in front, a red felt strip at the fallboard and a brushed-aluminium lip. Every key is a group
 * named `Key:<midi>` pivoting at its back, so pressing it is one rotation. Deterministic and parentless.
 * Keyboard-local: origin on the desk at the keyboard's centre, +Y up, −Z away from the player; metres.
 */
import { BoxGeometry, ExtrudeGeometry, Group, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, Shape } from '@iwsdk/core';

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

  // the case: end cheeks, a key bed under the keys, a key slip in front, the fallboard behind, a felt strip, a lip
  const cheekW = 0.028;
  const depth = 0.27;
  const caseMat = lacquer();
  const caseH = KEY.top - KEY.thick - 0.004; // the key bed's top, just under the keys
  const bed = named(new Mesh(new BoxGeometry(width + 2 * cheekW, caseH, depth), caseMat), 'Bed');
  bed.position.set(0, caseH / 2, -depth / 2 + 0.012);
  bed.receiveShadow = true;
  root.add(bed);
  for (const side of [-1, 1]) {
    const cheek = named(new Mesh(new BoxGeometry(cheekW, KEY.top + 0.022, depth), caseMat), side < 0 ? 'CheekL' : 'CheekR');
    cheek.position.set(side * (width / 2 + cheekW / 2), (KEY.top + 0.022) / 2, -depth / 2 + 0.012);
    cheek.castShadow = true;
    cheek.receiveShadow = true;
    root.add(cheek);
  }
  const slip = named(new Mesh(new BoxGeometry(width, KEY.top - 0.016, 0.012), caseMat), 'KeySlip');
  slip.position.set(0, (KEY.top - 0.016) / 2, 0.006);
  slip.castShadow = true;
  root.add(slip);
  const fallH = KEY.top + 0.022;
  const fall = named(new Mesh(new BoxGeometry(width, fallH, depth - KEY.length - 0.014), caseMat), 'Fallboard');
  fall.position.set(0, fallH / 2, -(KEY.length + 0.002) - (depth - KEY.length - 0.014) / 2);
  fall.castShadow = true;
  fall.receiveShadow = true;
  root.add(fall);
  const strip = named(new Mesh(new BoxGeometry(width, 0.006, 0.004), felt()), 'Felt');
  strip.position.set(0, KEY.top + 0.001, -KEY.length - 0.002);
  root.add(strip);
  const lip = named(new Mesh(new BoxGeometry(width + 2 * cheekW, 0.004, 0.006), alu()), 'Lip');
  lip.position.set(0, fallH + 0.002, -(depth - 0.012) + 0.003);
  root.add(lip);

  return { root, keys, width };
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
