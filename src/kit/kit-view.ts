/**
 * The table's instrument, in kit-local space (origin on the table at the kit's centre, +X right, +Z
 * toward the player): the drum pads, the table keys (a slim row of light bars that plays any melody
 * your room has no instrument for), the module at the back, and your hands' shadows on the table.
 */
import { BoxGeometry, DirectionalLight, MeshStandardMaterial, Group, Mesh, MeshBasicMaterial, PlaneGeometry, CanvasTexture, SRGBColorSpace } from '@iwsdk/core';
import { FONT } from '../ui/fonts.js';
import { castShadows, contactShadow, shadowCatcher } from '../art/lighting.js';
import { LANES, PADS, type Lane } from '../config.js';
import { PadView } from './pad-view.js';
import { blackMetal, buildModule, tube, type KitStyle } from '../scene-assets/lib/drums.js';
import { EPAD_DEPTH, HEAD_Y } from './pad-view.js';
import { Panel } from '../ui/panel.js';
import { Overlay } from '../room/overlay.js';
import { zonesFor, type Zone } from '../room/zones.js';
import { CongaModel, GuitarModel, HandpanModel, MarimbaModel, PianoModel, type DeskModel } from '../scene-assets/lib/instruments.js';
import { Tag } from '../ui/tag.js';
import { Vector3 } from '@iwsdk/core';
import { CONGA, GUITAR, HANDPAN, KEYBOARD, MARIMBA, NECK, instZones, type InstId, type Scale } from './shelf.js';

/** The table keys' row (kit-local, between the pads and the module). */
export const KEYS_ROW = { x: 0, z: -0.11 } as const;
/** The kit's playing area (kit-local): the whole table here is the kit. */
export const KIT_ZONE = { halfX: 0.34, back: -0.24, front: 0.12 } as const;

let shadowTex: CanvasTexture | null = null;
function handShadowTexture(): CanvasTexture {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.3)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  shadowTex = new CanvasTexture(c);
  return shadowTex;
}

export class KitView {
  readonly root = new Group();
  readonly pads = new Map<Lane, PadView>();
  /** The pads together (put away while another instrument is on the desk). */
  private readonly padRoot = new Group();
  /** The game's screen, floating over the back of the desk (it was a box on the desk). */
  readonly module = new Panel();
  readonly keys = new Overlay('keys', 8);
  keyZones: Zone[] = [];
  /** The instrument on the desk, and the shelf's other instruments (each its own light on the table). */
  inst: InstId = 'drums';
  /** The instrument's id and a colon: what its notes' keys start with. */
  instKey = 'drums:';
  readonly shelf = new Map<Exclude<InstId, 'drums'>, Overlay>([
    ['piano', new Overlay('keys', 16)],
    ['marimba', new Overlay('marimba', 8)],
    ['guitar', new Overlay('harp', 10)],
    ['handpan', new Overlay('tongue', 10)],
    ['congas', new Overlay('congas', 4)],
  ]);
  /** The instrument's contact shadow on the desk (sized to it when it comes out). */
  private instShadow = contactShadow(1, 1, 0.85);
  /** The guitar's neck lies off the desk: its own soft shadow under it. */
  private neckShadow = contactShadow(0.3, 0.07, 0.6);
  /** The zones of the instrument on the desk (none for the drums: they have pads). */
  instZones: Zone[] = [];
  private handShadow: Mesh[] = [];

  constructor() {
    this.root.name = 'Kit';
    // a soft key light from front-left and a cool rim from behind: the pads read against any table
    // (the room environment, src/art/lighting.ts, gives the ambient and the reflections; these shape it)
    const key = new DirectionalLight(0xfff3e4, 2.2);
    key.position.set(-0.3, 0.7, 0.4);
    key.target.position.set(0, 0, -0.05);
    // its shadows: a tight box round the desk's instruments, soft at the edges
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera;
    sc.left = -0.45;
    sc.right = 0.45;
    sc.top = 0.45;
    sc.bottom = -0.45;
    sc.near = 0.1;
    sc.far = 1.6;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.002;
    key.shadow.radius = 3;
    const fill = new DirectionalLight(0xe6eeff, 0.6);
    fill.position.set(0.45, 0.25, 0.3);
    fill.target.position.set(0, 0, -0.05);
    const rim = new DirectionalLight(0xdfe8ff, 0.8);
    rim.position.set(0.25, 0.35, -0.5);
    this.root.add(key, key.target, fill, fill.target, rim, rim.target);
    this.root.add(this.instShadow, this.neckShadow, shadowCatcher(1.1, 0.75));
    this.instShadow.visible = false;
    this.neckShadow.visible = false;
    for (const lane of LANES) {
      if (lane === 'gong') continue;
      const p = new PadView(lane);
      p.x = PADS[lane].x;
      p.z = PADS[lane].z;
      p.aim();
      this.pads.set(lane, p);
      this.padRoot.add(p.group);
    }
    castShadows(this.padRoot);
    castShadows(this.module.stand);
    // the table keys lie on the table (an overlay on the kit's own surface: zone z is away from you)
    this.keyZones = zonesFor('keys', { minX: -0.3, maxX: 0.3, minZ: -0.1, maxZ: 0.3 }, { x: KEYS_ROW.x, z: -KEYS_ROW.z }, 0.5);
    this.keys.group.visible = false;
    this.keys.rest = 0.35;
    this.root.add(this.padRoot, this.keys.group, this.module.root, this.module.stand);
    for (const o of this.shelf.values()) {
      o.group.visible = false;
      o.rest = 0.45;
      this.root.add(o.group);
    }
    for (const m of this.models.values()) {
      m.root.visible = false;
      this.root.add(m.root);
    }
    this.chordTag.mesh.visible = false;
    this.root.add(this.chordTag.mesh);
    const g = new PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    for (let i = 0; i < 2; i++) {
      const m = new Mesh(g, new MeshBasicMaterial({ map: handShadowTexture(), transparent: true, depthWrite: false, opacity: 0 }));
      m.renderOrder = 2;
      m.visible = false;
      this.handShadow.push(m);
      this.root.add(m);
    }
    this.root.visible = false;
  }

  pad(lane: Lane): PadView | undefined {
    return this.pads.get(lane);
  }

  /** The kit appears (its first hit): the pads you have, and the table keys. */
  reveal(lanes: readonly Lane[]): void {
    for (const l of lanes) this.pads.get(l)?.appear('fade');
    this.keys.build(this.keyZones);
    this.keys.group.visible = false;
  }

  /** The bars draw in from a point (kit zone coordinates), as part of the kit's first bloom. */
  revealKeys(fromX: number, fromZ: number): void {
    void fromX;
    void fromZ;
    this.keys.build(this.keyZones);
    this.keys.group.visible = false;
  }

  /**
   * Put an instrument on the desk: the drums are the pads and the bars; any other takes their place, drawn in from
   * the middle. `root` is its lowest note (MIDI) and `scale` the notes it has.
   */
  setInstrument(id: InstId, root: number, scale: Scale): void {
    const drums = id === 'drums';
    this.chordTag.mesh.visible = false;
    this.padRoot.visible = drums;
    this.keys.group.visible = drums && this.keyZones.length > 0 && this.keysShown;
    for (const [k, o] of this.shelf) o.group.visible = k === id;
    this.inst = id;
    this.instKey = `${id}:`;
    // (only the one that's out shows: the drums put every other model away)
    for (const [k, m] of this.models) m.root.visible = k === id;
    // the display stands just clear of it
    this.module.standOver(id === 'drums' ? 0.26 : id === 'congas' ? CONGA.top : id === 'piano' ? 0.105 : id === 'marimba' ? MARIMBA.top : id === 'guitar' ? GUITAR.strings : HANDPAN.rim + HANDPAN.dome);
    if (drums) {
      this.instZones = [];
      this.instShadow.visible = false;
      this.neckShadow.visible = false;
      return;
    }
    this.instZones = instZones(id, root, scale);
    const o = this.shelf.get(id)!;
    o.build(this.instZones);
    o.plain();
    // the instrument itself (the light on it is the song's notes, quiet at rest)
    for (const [k, m] of this.models) m.root.visible = k === id;
    const model = this.models.get(id);
    model?.layout(this.instZones);
    if (model) castShadows(model.root);
    // its shadow: a soft ellipse a little past its footprint
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const q of this.instZones) {
      const hw = q.shape === 'disc' ? q.w : q.w / 2;
      const hd = q.shape === 'disc' ? q.w : q.h / 2;
      x0 = Math.min(x0, q.x - hw);
      x1 = Math.max(x1, q.x + hw);
      z0 = Math.min(z0, q.z - hd);
      z1 = Math.max(z1, q.z + hd);
    }
    this.instShadow.visible = Number.isFinite(x0);
    this.neckShadow.visible = id === 'guitar';
    if (id === 'guitar') this.neckShadow.position.set((NECK.x[0] + NECK.x[2]) / 2 - 0.05, 0.0007, -NECK.z);
    if (this.instShadow.visible) {
      this.instShadow.scale.set((x1 - x0) * 1.35 + 0.06, (z1 - z0) * 1.5 + 0.06, 1);
      this.instShadow.position.set((x0 + x1) / 2, 0.0006, -(z0 + z1) / 2 - 0.01);
    }
    // (no light at rest: the instrument is the instrument; its notes light when a song asks, and when hit)
    o.rest = 0;
    // (the piano's chord button is red rubber on its case: no tape)
    this.chordTag.mesh.visible = false;
    o.group.position.y = id === 'piano' ? KEYBOARD.top + 0.0015 : id === 'marimba' ? MARIMBA.top + 0.001 : id === 'handpan' ? 0.02 : id === 'guitar' ? GUITAR.board + 0.001 : id === 'congas' ? CONGA.top + 0.001 : 0;
    this.unfoldT = 0;
    o.reveal(0, 0.03);
  }
  /** The piano's little screen: the name of its sound, in green on the dark glass. */
  private screen: Mesh | null = null;
  private screenText = '';
  pianoScreen(text: string): void {
    const display = this.models.get('piano')?.root.getObjectByName('Display');
    if (!display) return;
    if (!this.screen) {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 60;
      const t = new CanvasTexture(c);
      t.colorSpace = SRGBColorSpace;
      this.screen = new Mesh(new PlaneGeometry(0.056, 0.0131), new MeshBasicMaterial({ map: t, transparent: true, toneMapped: false, depthWrite: false }));
      this.screen.name = 'Screen';
      this.screen.rotation.x = -Math.PI / 2;
      this.screen.position.y = 0.0007;
    }
    if (this.screen.parent !== display) display.add(this.screen);
    if (text === this.screenText) return;
    this.screenText = text;
    const t = (this.screen.material as MeshBasicMaterial).map as CanvasTexture;
    const c = t.image as HTMLCanvasElement;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, 256, 60);
    g.fillStyle = '#7dffb0';
    g.font = `600 40px ${FONT}`;
    g.textBaseline = 'middle';
    g.fillText(text, 14, 32);
    t.needsUpdate = true;
  }
  /** A different kit (acoustic, jazz, electronic): every piece rebuilt in its look, where it stood, as it was. */
  setKitStyle(style: KitStyle): void {
    this.style = style;
    for (const [lane, old] of this.pads) {
      const p = new PadView(lane, false, style);
      p.x = old.x;
      p.z = old.z;
      p.aim();
      if (old.visible) p.appear('fade');
      this.padRoot.remove(old.group);
      old.group.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          for (const x of Array.isArray(m.material) ? m.material : [m.material]) x.dispose();
        }
      });
      this.pads.set(lane, p);
      this.padRoot.add(p.group);
    }
    castShadows(this.padRoot);
  }
  /**
   * An electronic kit stands on a rack: a black tube frame behind the kit, an arm from it to each pad and cymbal (the
   * hi-hat has its own stand), and the drum module clamped at its left. Refitted when the pads move.
   */
  private rack: Group | null = null;
  private style: KitStyle = 'acoustic';
  fitRack(lanes: readonly Lane[]): void {
    if (this.rack) {
      this.padRoot.remove(this.rack);
      this.rack.traverse((o) => (o as Mesh).geometry?.dispose());
      this.rack = null;
    }
    if (this.style !== 'electronic') return;
    const pads = lanes.map((l) => [l, this.pads.get(l)] as const).filter(([l, p]) => p && l !== 'hat' && l !== 'gong');
    if (!pads.length) return;
    const m = blackMetal();
    const silver = new MeshStandardMaterial({ name: 'Clamp', color: 0xc8ccd2, metalness: 1, roughness: 0.25 });
    const rack = new Group();
    rack.name = 'Rack';
    const xs = pads.map(([, p]) => p!.x);
    const x0 = Math.min(...xs) - 0.05;
    const x1 = Math.max(...xs) + 0.05;
    const zr = Math.min(...pads.map(([, p]) => p!.z)) - 0.1;
    const yb = 0.12;
    const r = 0.007;
    const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
    // two legs with feet, the bar across the back
    for (const x of [x0, x1]) {
      rack.add(tube(v(x, 0, zr), v(x, yb + 0.02, zr), r, m), tube(v(x, 0.004, zr - 0.06), v(x, 0.004, zr + 0.06), r * 0.9, m));
    }
    rack.add(tube(v(x0, yb, zr), v(x1, yb, zr), r, m));
    // an arm from the bar to the underside of each pad, with a clamp on the bar
    for (const [lane, p] of pads) {
      const under = HEAD_Y[lane] - (lane === 'crash' || lane === 'ride' ? 0.012 : (EPAD_DEPTH[lane] ?? 0.035));
      const cx = Math.max(x0 + 0.02, Math.min(x1 - 0.02, p!.x));
      rack.add(tube(v(cx, yb, zr), v(p!.x, under, p!.z), r * 0.75, m));
      const clamp = new Mesh(new BoxGeometry(0.022, 0.022, 0.022), silver);
      clamp.position.set(cx, yb, zr);
      rack.add(clamp);
    }
    // the module, on a short arm at the left end, its screen toward you
    const mod = buildModule();
    mod.position.set(x0 + 0.08, yb + 0.07, zr + 0.01);
    mod.rotation.x = -0.35;
    rack.add(tube(v(x0 + 0.08, yb, zr), v(x0 + 0.08, yb + 0.04, zr), r * 0.7, m), mod);
    castShadows(rack);
    this.rack = rack;
    this.padRoot.add(rack);
  }
  /** Only these pieces of the kit out (the rest put away). */
  showLanes(lanes: readonly Lane[]): void {
    for (const [lane, p] of this.pads) {
      if (lanes.includes(lane) && !p.visible) p.appear('fade');
      else if (!lanes.includes(lane) && p.visible) p.hide();
    }
  }
  /** The bars were shown (the kit's first bloom): they come back with the drums. */
  private keysShown = false;

  /** The real instruments (models), one shown at a time; and the half-second unfold when one comes out. */
  readonly models = new Map<string, DeskModel>([
    ['piano', new PianoModel()],
    ['marimba', new MarimbaModel()],
    ['guitar', new GuitarModel()],
    ['handpan', new HandpanModel()],
    ['congas', new CongaModel()],
  ]);
  private unfoldT = 1;
  private chordTag = new Tag(0.075, 0.022, true);
  /** How long the unfold takes (quicker when a song is on: the notes are already coming). */
  unfoldS = 0.5;

  /** A note was played on the instrument out (zone i): it moves. */
  instStruck(i: number, gain: number): void {
    this.models.get(this.inst)?.struck(i % 20, gain);
  }
  /** The piano's ebony key j went down. */
  blackStruck(j: number, gain: number): void {
    if (this.inst === 'piano') this.models.get('piano')?.struck(30 + j, gain);
  }

  /** Light zone i of the instrument out at k: on the model itself if it lights itself (the handpan), else its overlay. */
  instLight(i: number, k: number): void {
    const m = this.models.get(this.inst);
    if (m?.light) m.light(i, k);
    else this.instOverlay()?.light(i, k);
  }

  /** The overlay of the instrument on the desk (null for the drums). */
  instOverlay(): Overlay | null {
    return this.inst === 'drums' ? null : (this.shelf.get(this.inst) ?? null);
  }

  setContrast(hc: boolean): void {
    for (const p of this.pads.values()) p.setContrast(hc);
    if (this.keys.group.visible) this.keys.build(this.keyZones, hc);
  }

  /** The hand's shadow on the table under the palm (kit-local), darker as it nears. */
  setHandShadow(i: number, x: number, h: number, z: number): void {
    const m = this.handShadow[i];
    if (!Number.isFinite(h) || h > 0.3 || h < -0.05 || Math.abs(x) > 0.6 || Math.abs(z) > 0.45) {
      m.visible = false;
      return;
    }
    m.visible = true;
    const k = 1 - Math.max(0, h) / 0.3;
    m.position.set(x, 0.0009, z);
    m.scale.setScalar(0.075 + Math.max(0, h) * 0.25);
    (m.material as MeshBasicMaterial).opacity = 0.12 + 0.45 * k * k;
  }

  update(dt: number): void {
    for (const p of this.pads.values()) p.update(dt);
    this.keys.update(dt);
    for (const o of this.shelf.values()) if (o.group.visible) o.update(dt);
    const m = this.models.get(this.inst);
    if (m && m.root.visible) {
      m.update(dt);
      // it unfolds onto the desk: grows from flat and narrow to full over half a second, overshooting a touch
      if (this.unfoldT < 1) {
        this.unfoldT = Math.min(1, this.unfoldT + dt / this.unfoldS);
        const t = this.unfoldT;
        const e = 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
        m.root.scale.set(0.6 + 0.4 * e, Math.max(0.05, e), 0.6 + 0.4 * e);
      } else m.root.scale.setScalar(1);
    }
    this.module.update(dt);
  }
}
