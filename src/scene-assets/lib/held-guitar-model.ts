/**
 * The guitar you hold, at a real one's size: a dreadnought's spruce top with cream binding, a rosette, a tortoiseshell
 * pickguard and a rosewood bridge with its bone saddle and pins; mahogany sides and neck, a rosewood fretboard with
 * its frets where a real one's are and pearl dots; a headstock tipped back with six tuners; four wound strings and two
 * plain. Posed as it rests against you (src/kit/held-guitar.ts), in the kit's frame.
 *
 * It shows how it's played: the chord names on the neck where your hand goes (the place you're on lit), your
 * fingertips' dots where they stop strings, each string shaking as it sounds; in free play two arrows over the
 * soundhole, down and up, until you've strummed; in a song, the next chord's place glowing with a ring closing onto
 * it, and arrows (down or up) riding along the strings onto a line where you strum, in time.
 */
import { BoxGeometry, CanvasTexture, CircleGeometry, CylinderGeometry, DoubleSide, ExtrudeGeometry, Group, Matrix4, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, Path, PlaneGeometry, RingGeometry, SRGBColorSpace, Shape, SphereGeometry, Vector2, Vector3 } from '@iwsdk/core';
import type { Zone } from '../../room/zones.js';
import { HG, OUTLINE, SADDLE_X, ZONE_FRETS, fretX, heldMatrix, neckW, stringZ, zoneX } from '../../kit/held-guitar.js';
import { tortoiseShell, woodGrain } from './surfaces.js';
import type { DeskModel } from './instruments.js';
import { FONT } from '../../ui/fonts.js';

const mat = (name: string, color: number, roughness: number, metalness = 0) => new MeshStandardMaterial({ name, color, roughness, metalness });
const glow = (color: number) => new MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: DoubleSide });
/** A plane lying on the guitar's top (facing +y), its texture's up toward the low E. */
const flat = (w: number, d: number) => new PlaneGeometry(w, d).rotateX(-Math.PI / 2);

/** The outline as a flat shape (x along the body, y across), grown by `grow` (m). */
function outline(grow = 0): Shape {
  const pts: Vector2[] = [];
  const n = OUTLINE.length;
  for (let k = 0; k < n; k++) pts.push(new Vector2(HG.join + OUTLINE[k][0] * HG.bodyLen, (OUTLINE[k][1] * HG.bodyWid) / 2 + grow));
  for (let k = n - 1; k >= 0; k--) pts.push(new Vector2(HG.join + OUTLINE[k][0] * HG.bodyLen, -(OUTLINE[k][1] * HG.bodyWid) / 2 - grow));
  const s = new Shape();
  s.moveTo(pts[0].x - grow, 0);
  s.splineThru([...pts.map((p, i) => (i === 0 || i === pts.length - 1 ? new Vector2(p.x - grow * 0.7, p.y) : p)), new Vector2(pts[0].x - grow, 0)]);
  return s;
}

/** An arrow (pointing to the texture's top), soft-edged. */
function arrowTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 192;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(64, 8);
  g.lineTo(120, 80);
  g.lineTo(84, 80);
  g.lineTo(84, 184);
  g.lineTo(44, 184);
  g.lineTo(44, 80);
  g.lineTo(8, 80);
  g.closePath();
  g.fill();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

const STRUM_ARROWS = 8;
/** How far ahead (m) a strum's arrow rides per beat before it lands on the line. */
const ARROW_M_PER_BEAT = 0.085;

export class HeldGuitarModel implements DeskModel {
  readonly root = new Group();
  /** Everything that moves or lights (kept out of the merge). */
  private liveG = new Group();
  private strings: Mesh[] = [];
  private stringY: number[] = [];
  private amp = [0, 0, 0, 0, 0, 0];
  private t = 0;
  private zoneGlow: MeshBasicMaterial[] = [];
  private zoneRing: Mesh[] = [];
  private labels: { c: HTMLCanvasElement; t: CanvasTexture; m: MeshBasicMaterial; text: string }[] = [];
  private dots: Mesh[] = [];
  private arrows: Mesh[] = [];
  private strike!: Mesh;
  private guideArrows: Mesh[] = [];
  /** Set each frame by the room: the chord place you're on, the song's asks, the free-play guide. */
  zone = -1;
  onNeck = false;
  song = false;
  /** The free-play strum guide's strength (0: gone). */
  guideK = 1;
  /** Chord place asks in a song: beats until each place's next chord (NaN: none coming), and that chord's name. */
  readonly zoneAhead = [Number.NaN, Number.NaN, Number.NaN];
  /** Strums coming in a song: beats until each (NaN: unused), its way (+1 down, -1 up), and whether it was hit. */
  readonly strumAhead = new Array<number>(STRUM_ARROWS).fill(Number.NaN);
  readonly strumDir = new Array<number>(STRUM_ARROWS).fill(1);
  readonly strumHit = new Array<boolean>(STRUM_ARROWS).fill(false);
  private zoneK = [0, 0, 0];
  private strikeK = 0;
  private readonly spruce = (() => {
    const map = woodGrain(61).clone();
    map.needsUpdate = true;
    map.repeat.set(14, 40);
    return new MeshPhysicalMaterial({ name: 'Spruce', color: 0xe3c48c, map, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.1 });
  })();
  private readonly mahogany = new MeshPhysicalMaterial({ name: 'Mahogany', color: 0x5a2c16, map: woodGrain(63), roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.15 });
  private readonly rosewood = mat('Rosewood', 0x2e1810, 0.5);
  private readonly bronze = mat('Bronze', 0xc2a26e, 0.22, 1);
  private readonly steel = mat('Steel', 0xdcdad4, 0.2, 1);
  private readonly fretMetal = mat('Fret', 0xd0d2d6, 0.25, 1);
  private readonly chrome = mat('Chrome', 0xe2e5ea, 0.16, 1);
  private readonly bone = mat('Bone', 0xeee6d2, 0.4);
  private readonly cream = mat('Binding', 0xefe6d0, 0.35);
  private readonly pearl = mat('Pearl', 0xf0ece2, 0.25);
  private readonly hole = mat('Soundhole', 0x0b0806, 0.95);
  private readonly coverMat = mat('TrussCover', 0x0e0e10, 0.75);
  private readonly pearlButton = new MeshPhysicalMaterial({ name: 'PearlButton', color: 0xf2ece0, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1, sheen: 1, sheenColor: 0xbfd4ff });
  private readonly logoMat = (() => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const g = c.getContext('2d')!;
    g.font = `italic 700 96px Georgia, 'Times New Roman', serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#d9b46a';
    g.fillText('Thump', 256, 70);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return new MeshStandardMaterial({ name: 'Logo', map: t, transparent: true, roughness: 0.3, metalness: 0.8, depthWrite: false });
  })();
  private readonly veneer = new MeshStandardMaterial({ name: 'Veneer', color: 0x0a0a0b, roughness: 0.62 });
  private readonly tortoise = new MeshPhysicalMaterial({ name: 'Tortoise', color: 0x5a2a14, map: tortoiseShell(), roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.15 });
  private readonly arrowTex = arrowTexture();

  constructor() {
    this.root.name = 'HeldGuitar';
    const m = heldMatrix(new Matrix4());
    m.decompose(this.root.position, this.root.quaternion, this.root.scale);
    for (let c = 0; c < 3; c++) {
      const cv = document.createElement('canvas');
      cv.width = 256;
      cv.height = 128;
      const t = new CanvasTexture(cv);
      t.colorSpace = SRGBColorSpace;
      this.labels.push({ c: cv, t, m: new MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.85 }), text: '' });
    }
  }

  /** The chord names on the neck's three places (redrawn when they change). */
  setNames(names: readonly string[]): void {
    for (let c = 0; c < 3; c++) {
      const L = this.labels[c];
      const text = names[c] ?? '';
      if (text === L.text) continue;
      L.text = text;
      const g = L.c.getContext('2d');
      if (!g) continue;
      g.clearRect(0, 0, 256, 128);
      g.font = `800 100px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 14;
      g.strokeStyle = 'rgba(0,0,0,0.7)';
      g.strokeText(text, 128, 68);
      g.fillStyle = '#fff6e6';
      g.fillText(text, 128, 68);
      L.t.needsUpdate = true;
    }
  }

  /** Each string's fingertip, at its fret (-1: none). */
  setFingers(pressed: Int8Array): void {
    for (let i = 0; i < 6; i++) {
      const d = this.dots[i];
      if (!d) continue;
      const n = pressed[i];
      d.visible = n > 0;
      if (n > 0) {
        const x = (fretX(n - 1) + fretX(n)) / 2;
        d.position.set(x, HG.strings + 0.0015, stringZ(i, x));
      }
    }
  }

  /** A string sounds: it shakes, harder for a harder pluck. */
  pluck(i: number, vel: number): void {
    if (i >= 0 && i < 6) this.amp[i] = Math.max(this.amp[i], 0.4 + 0.6 * vel);
  }

  layout(_zones: readonly Zone[]): void {
    void _zones;
    this.root.clear();
    this.liveG = new Group();
    this.liveG.name = 'Live';
    this.strings = [];
    this.stringY = [];
    this.zoneGlow = [];
    this.zoneRing = [];
    this.dots = [];
    this.arrows = [];
    this.guideArrows = [];
    const body = new Group();
    body.name = 'Body';
    // the box: the top and back on its sides, the outline extruded back from the top
    const box = new Mesh(new ExtrudeGeometry(outline(), { depth: HG.depth - 0.004, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 2, curveSegments: 10 }).rotateX(Math.PI / 2), [this.spruce, this.mahogany]);
    box.name = 'Box';
    box.position.y = -0.002;
    // the binding round the top's edge
    const ring = outline(0.003);
    ring.holes.push(new Path(outline(-0.002).getPoints(10).reverse()));
    const binding = new Mesh(new ExtrudeGeometry(ring, { depth: 0.003, bevelEnabled: false, curveSegments: 10 }).rotateX(Math.PI / 2), this.cream);
    binding.position.y = 0.0006;
    // the soundhole, its rosette, the pickguard on the treble side below it
    const hole = new Mesh(new CircleGeometry(HG.holeR, 48).rotateX(-Math.PI / 2), this.hole);
    hole.position.set(HG.hole, 0.0005, 0);
    body.add(box, binding, hole);
    for (const [r0, r1, m] of [[HG.holeR + 0.002, HG.holeR + 0.005, this.rosewood], [HG.holeR + 0.008, HG.holeR + 0.014, this.cream], [HG.holeR + 0.017, HG.holeR + 0.02, this.rosewood]] as const) {
      const r = new Mesh(new RingGeometry(r0, r1, 64).rotateX(-Math.PI / 2), m);
      r.position.set(HG.hole, 0.0006, 0);
      body.add(r);
    }
    const gs = new Shape();
    // (the shape's y is across the strings: the guard sits toward the high E, +z, wrapping the rosette toward the bridge)
    gs.absarc(0, 0, 0.072, 0.15, 1.9, false);
    gs.quadraticCurveTo(-0.03, 0.105, 0.03, 0.112);
    gs.quadraticCurveTo(0.1, 0.07, Math.cos(0.15) * 0.072, Math.sin(0.15) * 0.072);
    const guard = new Mesh(new ExtrudeGeometry(gs, { depth: 0.0008, bevelEnabled: false, curveSegments: 16 }).rotateX(Math.PI / 2), this.tortoise);
    guard.position.set(HG.hole, 0.0012, 0);
    body.add(guard);
    // the bridge with the saddle and six pins
    const bridge = new Mesh(new BoxGeometry(0.03, 0.009, 0.15), this.rosewood);
    bridge.position.set(SADDLE_X + 0.008, 0.0045, 0);
    const saddle = new Mesh(new BoxGeometry(0.003, 0.004, 0.072), this.bone);
    saddle.position.set(SADDLE_X, 0.0105, 0);
    body.add(bridge, saddle);
    const pin = new CylinderGeometry(0.0026, 0.0022, 0.004, 10);
    for (let i = 0; i < 6; i++) {
      const p = new Mesh(pin, this.bone);
      p.position.set(SADDLE_X + 0.016, 0.01, stringZ(i, SADDLE_X) * 1.05);
      body.add(p);
    }
    // the neck: its back, the fretboard on it (on over the body to the 20th fret), the nut, the heel
    const neck = new Group();
    neck.name = 'Neck';
    const end = fretX(20) + 0.006;
    const taper = (x0: number, x1: number, w0: number, w1: number, th: number) => {
      const sh = new Shape();
      sh.moveTo(x0, -w0 / 2);
      sh.lineTo(x1, -w1 / 2);
      sh.lineTo(x1, w1 / 2);
      sh.lineTo(x0, w0 / 2);
      sh.closePath();
      return new ExtrudeGeometry(sh, { depth: th, bevelEnabled: true, bevelSize: 0.0012, bevelThickness: 0.0012, bevelSegments: 2 }).rotateX(Math.PI / 2);
    };
    const back = new Mesh(taper(HG.nut, HG.join + 0.01, HG.nutW - 0.002, HG.joinW - 0.002, 0.02), this.mahogany);
    back.position.y = HG.board - 0.006;
    const fb = new Mesh(taper(HG.nut, end, HG.nutW, neckW(end), 0.006), this.rosewood);
    fb.position.y = HG.board;
    const nut = new Mesh(new BoxGeometry(0.005, 0.008, HG.nutW), this.bone);
    nut.position.set(HG.nut - 0.0025, HG.board + 0.002, 0);
    const heel = new Mesh(new BoxGeometry(0.03, 0.06, HG.joinW - 0.006), this.mahogany);
    heel.position.set(HG.join - 0.012, -0.03, 0);
    neck.add(back, fb, nut, heel);
    const fret = new BoxGeometry(0.0022, 0.0022, 1);
    for (let n = 1; n <= 20; n++) {
      const f = new Mesh(fret, this.fretMetal);
      f.scale.z = neckW(fretX(n));
      f.position.set(fretX(n), HG.board + 0.0008, 0);
      neck.add(f);
    }
    const dot = new CircleGeometry(0.0042, 20).rotateX(-Math.PI / 2);
    for (const [n, dz] of [[3, 0], [5, 0], [7, 0], [9, 0], [12, -0.012], [12, 0.012], [15, 0]] as const) {
      const d = new Mesh(dot, this.pearl);
      d.position.set((fretX(n - 1) + fretX(n)) / 2, HG.board + 0.0003, dz);
      neck.add(d);
    }
    // the headstock, tipped back 13 degrees from the nut: an open-book crown, bound in cream, a black face with the
    // maker's mark in gold and a bell-shaped truss rod cover; six posts in chrome bushings, the strings wound round
    // them; the tuners' housings and pearl buttons out at its sides
    const head = new Group();
    head.name = 'Headstock';
    head.position.set(HG.nut - 0.004, HG.board, 0);
    head.rotation.z = 0.23;
    const crown = (g: number) => {
      const hs = new Shape();
      hs.moveTo(0.004, -0.0225 - g);
      hs.quadraticCurveTo(-0.08, -0.03 - g, -0.162, -0.039 - g);
      hs.quadraticCurveTo(-0.192 - g, -0.036 - g, -0.19 - g, -0.016);
      hs.quadraticCurveTo(-0.186 - g, -0.004, -0.181 - g, 0);
      hs.quadraticCurveTo(-0.186 - g, 0.004, -0.19 - g, 0.016);
      hs.quadraticCurveTo(-0.192 - g, 0.036 + g, -0.162, 0.039 + g);
      hs.quadraticCurveTo(-0.08, 0.03 + g, 0.004, 0.0225 + g);
      hs.closePath();
      return hs;
    };
    const plate = new Mesh(new ExtrudeGeometry(crown(0), { depth: 0.014, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0015, bevelSegments: 2, curveSegments: 12 }).rotateX(Math.PI / 2), this.mahogany);
    const bind = crown(0.0012);
    bind.holes.push(new Path(crown(-0.0016).getPoints(12).reverse()));
    const hBind = new Mesh(new ExtrudeGeometry(bind, { depth: 0.003, bevelEnabled: false, curveSegments: 12 }).rotateX(Math.PI / 2), this.cream);
    hBind.position.y = 0.0018;
    const face = new Mesh(new ExtrudeGeometry(crown(-0.0016), { depth: 0.0012, bevelEnabled: false, curveSegments: 12 }).rotateX(Math.PI / 2), this.veneer);
    face.position.y = 0.0018;
    // the maker's mark, across the crown
    const logo = new Mesh(flat(0.064, 0.016), this.logoMat);
    logo.rotation.y = Math.PI / 2;
    logo.position.set(-0.158, 0.0022, 0);
    // the truss rod cover: a little black bell with two screws, just above the nut
    const bell = new Shape();
    bell.moveTo(-0.004, -0.007);
    bell.lineTo(-0.004, 0.007);
    bell.quadraticCurveTo(-0.022, 0.012, -0.03, 0.0);
    bell.quadraticCurveTo(-0.022, -0.012, -0.004, -0.007);
    const cover = new Mesh(new ExtrudeGeometry(bell, { depth: 0.0008, bevelEnabled: false, curveSegments: 10 }).rotateX(Math.PI / 2), this.coverMat);
    cover.position.y = 0.0028;
    head.add(plate, hBind, face, logo, cover);
    const screw = new CylinderGeometry(0.0011, 0.0011, 0.0006, 10);
    for (const x of [-0.009, -0.025]) {
      const sc = new Mesh(screw, this.chrome);
      sc.position.set(x, 0.0031, 0);
      head.add(sc);
    }
    // the posts: D, A, low E up the bass side (toward the ceiling); G, B, high E up the treble side
    const bush = new CylinderGeometry(0.0042, 0.0042, 0.0018, 16);
    const post = new CylinderGeometry(0.0028, 0.0028, 0.011, 12);
    const housing = new BoxGeometry(0.013, 0.009, 0.012);
    const shaft = new CylinderGeometry(0.0016, 0.0016, 0.012, 8).rotateX(Math.PI / 2);
    const button = new SphereGeometry(0.0075, 16, 10);
    const postX = [-0.048, -0.09, -0.132];
    const posts: Vector3[] = [];
    for (let i = 0; i < 6; i++) {
      const sd = i < 3 ? -1 : 1;
      const k = i < 3 ? 2 - i : i - 3;
      const x = postX[k];
      const w = 0.0225 + ((0.039 - 0.0225) * -x) / 0.162;
      const z = sd * (w - 0.0085);
      posts.push(new Vector3(x, 0.0075, z));
      const b = new Mesh(bush, this.chrome);
      b.position.set(x, 0.0027, z);
      const p = new Mesh(post, this.chrome);
      p.position.set(x, 0.0075, z);
      const hz = new Mesh(housing, this.chrome);
      hz.position.set(x, -0.0105, sd * (w - 0.004));
      const sf = new Mesh(shaft, this.chrome);
      sf.position.set(x, -0.0105, sd * (w + 0.007));
      const bt = new Mesh(button, this.pearlButton);
      bt.scale.set(0.9, 0.42, 0.62);
      bt.position.set(x, -0.0105, sd * (w + 0.016));
      head.add(b, p, hz, sf, bt);
    }
    // the strings past the nut, out to their posts and wound round them
    for (let i = 0; i < 6; i++) {
      const a = new Vector3(0.004, 0.0035, stringZ(i, HG.nut));
      const p = posts[i];
      const b = new Vector3(p.x, 0.008, p.z - Math.sign(p.z) * 0.0028);
      const r = 0.00085 - i * 0.00008;
      const m = i < 4 ? this.bronze : this.steel;
      const st = new Mesh(new CylinderGeometry(r, r, a.distanceTo(b), 6), m);
      st.position.copy(a).add(b).multiplyScalar(0.5);
      st.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), b.clone().sub(a).normalize());
      const wrap = new Mesh(new CylinderGeometry(0.0034, 0.0034, 0.004, 12, 1, true), m);
      wrap.position.set(p.x, 0.0085, p.z);
      head.add(st, wrap);
    }
    neck.add(head);
    this.root.add(body, neck, this.liveG);
    // the strings, nut to saddle: four wound bronze, two plain steel (shown a touch thick, so they read at arm's length)
    for (let i = 0; i < 6; i++) {
      const a = new Vector3(HG.nut, HG.board + 0.0045, stringZ(i, HG.nut));
      const b = new Vector3(SADDLE_X, 0.0125, stringZ(i, SADDLE_X));
      const r = 0.00085 - i * 0.00008;
      const s = new Mesh(new CylinderGeometry(r, r, a.distanceTo(b), 8), i < 4 ? this.bronze : this.steel);
      s.position.copy(a).add(b).multiplyScalar(0.5);
      s.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), b.clone().sub(a).normalize());
      s.name = `String${i}`;
      this.liveG.add(s);
      this.strings.push(s);
      this.stringY.push(s.position.y);
    }
    // the three chord places: a glow over their frets, the chord's name, a ring that closes onto it in a song
    for (let c = 0; c < 3; c++) {
      const x0 = fretX(ZONE_FRETS[c][0] - 1);
      const x1 = fretX(ZONE_FRETS[c][1]);
      const gm = glow(0xffd28a);
      const g = new Mesh(flat(x1 - x0 - 0.003, neckW(x1)), gm);
      g.position.set((x0 + x1) / 2, HG.board + 0.0012, 0);
      g.renderOrder = 4;
      this.zoneGlow.push(gm);
      const lab = new Mesh(flat(0.064, 0.032), this.labels[c].m);
      lab.position.set(zoneX(c), HG.strings + 0.003, 0);
      lab.renderOrder = 6;
      const ring = new Mesh(new RingGeometry(0.92, 1, 48).rotateX(-Math.PI / 2), glow(0xffd28a));
      ring.position.set(zoneX(c), HG.strings + 0.002, 0);
      ring.renderOrder = 5;
      ring.visible = false;
      this.zoneRing.push(ring);
      this.liveG.add(g, lab, ring);
    }
    // a dot under each fingertip that stops a string
    const dotGeo = new CircleGeometry(0.0045, 20).rotateX(-Math.PI / 2);
    for (let i = 0; i < 6; i++) {
      const d = new Mesh(dotGeo, new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
      d.visible = false;
      d.renderOrder = 7;
      this.dots.push(d);
      this.liveG.add(d);
    }
    // a song's strum line across the strings, and the arrows that ride onto it
    this.strike = new Mesh(flat(0.004, 0.08), glow(0x6fa8ff));
    this.strike.position.set(HG.strikeX, HG.strings + 0.0025, 0);
    this.strike.renderOrder = 5;
    this.liveG.add(this.strike);
    for (let k = 0; k < STRUM_ARROWS; k++) {
      const a = new Mesh(flat(0.022, 0.033), new MeshBasicMaterial({ map: this.arrowTex, color: 0xffb35c, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
      a.visible = false;
      a.renderOrder = 6;
      this.arrows.push(a);
      this.liveG.add(a);
    }
    // free play: down and up, beside the soundhole, until you've strummed a few times
    for (const dir of [1, -1]) {
      const a = new Mesh(flat(0.026, 0.04), new MeshBasicMaterial({ map: this.arrowTex, color: dir > 0 ? 0xffb35c : 0x6fd0ff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
      // (on the top above the strings, by the soundhole: down and up)
      a.position.set(HG.hole + (dir > 0 ? -0.018 : 0.018), 0.002, -0.098);
      if (dir > 0) a.rotation.y = Math.PI;
      a.renderOrder = 6;
      this.guideArrows.push(a);
      this.liveG.add(a);
    }
  }

  /** The parts that move or light on their own. */
  live(): Group[] {
    return [this.liveG];
  }

  /** 0–2: a chord place was taken; 9: a strum landed (the line flashes). */
  struck(i: number, gain: number): void {
    if (i >= 0 && i < 3) this.zoneK[i] = Math.max(this.zoneK[i], 0.6 + 0.4 * gain);
    else this.strikeK = Math.max(this.strikeK, 0.6 + 0.4 * gain);
  }

  /** A song asks: a chord place (0–2) or the strum line (9) lights at k. */
  private asked = [0, 0, 0, 0];
  light(i: number, k: number): void {
    const j = i >= 3 ? 3 : i;
    if (j >= 0) this.asked[j] = Math.max(0, Math.min(1, k));
  }

  update(dt: number): void {
    this.t += dt;
    // each string shakes as it sounds, a blur dying away over about a second
    for (let i = 0; i < this.strings.length; i++) {
      this.amp[i] *= Math.exp(-dt * 3.2);
      const s = this.strings[i];
      const a = this.amp[i];
      s.position.y = this.stringY[i] + a * 0.0011 * Math.sin(this.t * (80 + i * 13));
      s.scale.x = s.scale.z = 1 + a * 1.4;
    }
    for (let c = 0; c < 3; c++) {
      this.zoneK[c] *= Math.exp(-dt * 5);
      const mine = this.zone === c;
      const ahead = this.zoneAhead[c];
      const ask = Number.isFinite(ahead) && ahead < 2 && ahead > -0.4 ? 1 - Math.max(0, ahead) / 2 : this.asked[c];
      const base = this.song ? (mine ? 0.18 : 0.03) : mine ? (this.onNeck ? 0.42 : 0.24) : 0.06;
      this.zoneGlow[c].opacity = Math.min(0.85, Math.max(base, ask * 0.6, this.zoneK[c] * 0.7));
      // (the names: all three in free play; in a song, the chord coming and the one you're on)
      const L = this.labels[c].m;
      L.opacity = this.song ? (ask > 0 ? 0.7 + 0.3 * ask : mine ? 0.6 : 0) : mine ? 1 : 0.8;
      const ring = this.zoneRing[c];
      ring.visible = Number.isFinite(ahead) && ahead < 2 && ahead > -0.25;
      if (ring.visible) {
        const r = 0.03 * (1 + 1.6 * Math.max(0, ahead) / 2);
        ring.scale.set(r, 1, r * 0.75);
        (ring.material as MeshBasicMaterial).opacity = 0.9 * (1 - Math.max(0, ahead) / 2);
      }
    }
    // the strum line, and the arrows riding onto it (down: warm, pointing toward the high E; up: cool)
    this.strikeK *= Math.exp(-dt * 6);
    (this.strike.material as MeshBasicMaterial).opacity = this.song ? Math.min(0.95, 0.3 + 0.5 * this.asked[3] + 0.6 * this.strikeK) : 0;
    for (let k = 0; k < this.arrows.length; k++) {
      const a = this.arrows[k];
      const ah = this.strumAhead[k];
      const on = this.song && Number.isFinite(ah) && ah < 3.2 && ah > -0.3;
      a.visible = on;
      if (!on) continue;
      const m = a.material as MeshBasicMaterial;
      const down = this.strumDir[k] > 0;
      a.position.set(HG.strikeX + Math.max(0, ah) * ARROW_M_PER_BEAT, HG.strings + 0.004, 0);
      a.rotation.y = down ? Math.PI : 0;
      m.color.setHex(this.strumHit[k] ? 0xffffff : down ? 0xffb35c : 0x6fd0ff);
      const fadeIn = Math.min(1, (3.2 - ah) / 0.5);
      const fadeOut = ah < 0 ? Math.max(0, 1 + ah / 0.3) : 1;
      m.opacity = 0.95 * fadeIn * fadeOut;
      a.scale.setScalar(this.strumHit[k] ? 1 + 2 * Math.max(0, -ah) : 1);
    }
    for (let k = 0; k < this.guideArrows.length; k++) {
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 4 - k * Math.PI);
      (this.guideArrows[k].material as MeshBasicMaterial).opacity = this.song ? 0 : this.guideK * (0.35 + 0.45 * pulse);
    }
  }
}
