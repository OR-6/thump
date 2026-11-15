/**
 * Lights Out: the Spotlight's moment. Both hands up and your real room goes black; a theatre follow spot strikes
 * behind your head with a heavy "ka-chunk", and on your real wall the shadows of your hands drum along beside the
 * shadows of your real furniture. Every four bars a second light sweeps across the room and those shadows slide; on
 * the last bar both beams close in on your hands and the room comes back up over a beat.
 *
 * Passthrough can only be darkened, never lit, and the app never sees its pixels. So the light here is where the
 * darkness isn't: the room's own shape (Quest's scene mesh, else its planes, else a backdrop and the desk) is drawn
 * over passthrough black, except where a beam falls and nothing shadows it. Shadows are our own small depth
 * passes from each beam (casters: capsules on your tracked hand bones, the instruments on the desk and the room's
 * furniture), so nothing else in the app pays for them, and only while the moment runs. Inside a beam a touch of
 * warm light is added over the real room (additive: it brightens what you see) and each hit tints it in its
 * instrument's colour.
 *
 * Calm motion: no flicker, no sweep, a gentler breath, no colour flashes. Lessons never have it.
 */
import {
  AddEquation,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Box3,
  Color,
  ConeGeometry,
  CustomBlending,
  CylinderGeometry,
  DepthTexture,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  WebGLRenderTarget,
  XRMesh,
  XRPlane,
  ZeroFactor,
  type Entity,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from '@iwsdk/core';
import { asLight } from '../art/light.js';
import { audio } from '../audio/engine.js';
import { sfx } from '../audio/sfx.js';
import { hands, type HandState } from '../input/hands.js';
import { BONES } from '../input/occluders.js';
import type { Game } from '../play/game.js';
import { NO_COACH, params } from './params.js';

/** The render layer the beams' depth passes draw (casters only; the eyes never draw it). */
export const SHADOW_LAYER = 7;
/** The instruments on the desk: the key light's pass only (the sweep is about the room's furniture). */
export const KIT_LAYER = 8;
/** How dark the room goes. */
const DARK = 0.88;
/** Darkness eases in over this, then the spot strikes. */
const STRIKE_S = 0.4;
/** Scene geometry drawn over passthrough, at most (triangles). */
const MAX_TRIS = 20000;
const DUST = 64;
/** Palm webbing between the knuckles (joint names): the hand's shadow is a hand, not a skeleton. */
const PALM: Array<[string, string]> = [
  ['index-finger-metacarpal', 'pinky-finger-metacarpal'],
  ['index-finger-phalanx-proximal', 'pinky-finger-phalanx-proximal'],
  ['middle-finger-metacarpal', 'ring-finger-phalanx-proximal'],
  ['ring-finger-metacarpal', 'middle-finger-phalanx-proximal'],
  ['wrist', 'thumb-phalanx-proximal'],
];
const LINKS = [...BONES, ...PALM];
const JOINT_NAMES = [
  'wrist',
  ...['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'],
  ...(['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'] as const).flatMap((f) =>
    ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'].map((j) => `${f}-${j}`),
  ),
] as XRHandJoint[];
const JI = new Map<string, number>(JOINT_NAMES.map((n, i) => [n, i]));

/** What the room lends the moment. */
export interface LightsHost {
  /** Your eyes (world), kept current by the room. */
  readonly head: Vector3;
  /** The kit's root on the desk. */
  readonly kit: Object3D;
  forward(out: Vector3): Vector3;
  readonly game: Game;
  frame(): XRFrame | undefined;
  refSpace(): XRReferenceSpace | null;
  planes(): Iterable<Entity>;
  meshes(): Iterable<Entity>;
  paused(): boolean;
  /** Free play, the kit on the desk, and this player has never had the taste. */
  tasteOk(): boolean;
  /** The taste was given (remember it). */
  tasted(): void;
}

type Kind = 'song' | 'taste' | 'curtain';
/** Every joint in one call (Quest and the emulator offer it): no pose objects each frame. */
type BatchFrame = XRFrame & {
  fillPoses?: (spaces: XRSpace[], base: XRSpace, out: Float32Array) => boolean;
  fillJointRadii?: (spaces: XRJointSpace[], out: Float32Array) => boolean;
};
type Phase = 'off' | 'on' | 'back';

/** One beam: where it is and points, its cone, and its own shadow map. */
class Beam {
  readonly pos = new Vector3();
  readonly dir = new Vector3(0, 0, -1);
  readonly aim = new Vector3();
  /** Half-angles (radians): the edge, and where it's full. */
  outer = 0.4;
  inner = 0.36;
  intensity = 0;
  shadows = true;
  readonly cam = new PerspectiveCamera(50, 1, 0.3, 9);
  readonly rt: WebGLRenderTarget;
  readonly mat = new Matrix4();
  readonly cos = new Vector3();
  readonly nf = new Vector3();
  readonly cone: Mesh;
  private coneMat: ShaderMaterial;

  constructor(size: number, haze: number) {
    this.rt = new WebGLRenderTarget(size, size, { depthTexture: new DepthTexture(size, size), depthBuffer: true });
    this.rt.texture.name = 'LightsOutShadowColour';
    this.cam.layers.set(SHADOW_LAYER);
    // the beam in the air: brighter looking through its middle than along its edges, fading out from the lamp
    const g = new ConeGeometry(1, 1, 48, 1, true);
    g.translate(0, -0.5, 0);
    g.rotateX(-Math.PI / 2);
    this.coneMat = asLight(
      new ShaderMaterial({
        uniforms: { uI: { value: 0 }, uC: { value: new Color(1, 0.9, 0.74) } },
        vertexShader: /* glsl */ `
          varying float vZ; varying vec3 vN; varying vec3 vV; varying float vD;
          void main() {
            vZ = position.z;
            vec4 w = modelMatrix * vec4(position, 1.0);
            vN = normalize(mat3(modelMatrix) * normal);
            vV = cameraPosition - w.xyz;
            vD = length(vV);
            vV /= vD;
            gl_Position = projectionMatrix * viewMatrix * w;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uI; uniform vec3 uC;
          varying float vZ; varying vec3 vN; varying vec3 vV; varying float vD;
          void main() {
            float through = pow(abs(dot(normalize(vN), normalize(vV))), 2.0);
            float along = smoothstep(0.04, 0.3, vZ) * (1.0 - smoothstep(0.5, 1.0, vZ));
            // (none right at your eyes: a beam passing over your head is felt, not seen as a sheet)
            float near = smoothstep(0.6, 1.6, vD);
            gl_FragColor = vec4(uC * uI * through * along * near, 1.0);
          }`,
        side: DoubleSide,
        depthWrite: false,
      }),
    );
    this.cone = new Mesh(g, this.coneMat);
    this.cone.name = 'LightsOutBeam';
    this.cone.renderOrder = 5;
    this.cone.frustumCulled = false;
    this.cone.visible = false;
    this.haze = haze;
  }
  private haze: number;

  /** Point it, size it, and ready its shadow camera. */
  place(len: number, hazeOn: boolean, fade: number): void {
    this.dir.subVectors(this.aim, this.pos).normalize();
    this.cos.set(Math.cos(this.outer), Math.cos(this.inner), 0);
    const fov = Math.min(150, ((this.outer * 2 * 180) / Math.PI) * 1.12 + 2);
    if (Math.abs(this.cam.fov - fov) > 0.05) {
      this.cam.fov = fov;
      this.cam.updateProjectionMatrix();
    }
    this.cam.position.copy(this.pos);
    this.cam.lookAt(this.aim);
    this.cam.updateMatrixWorld();
    this.mat.multiplyMatrices(this.cam.projectionMatrix, this.cam.matrixWorldInverse);
    this.nf.set(this.cam.near, this.cam.far, 1 / this.rt.width);
    const r = Math.tan(this.outer) * len;
    this.cone.position.copy(this.pos);
    this.cone.lookAt(this.aim);
    this.cone.scale.set(r, r, len);
    const i = this.haze * this.intensity * fade;
    this.coneMat.uniforms.uI.value = i;
    this.cone.visible = hazeOn && i > 0.002;
  }
}

const RECEIVER_VERT = /* glsl */ `
  varying vec3 vW;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

const RECEIVER_FRAG = /* glsl */ `
  uniform float uDark;
  uniform vec3 uGlow;
  uniform vec3 uPos[2];
  uniform vec3 uDir[2];
  uniform vec3 uCos[2];
  uniform float uInt[2];
  uniform float uShadow[2];
  uniform mat4 uMat[2];
  uniform vec3 uNF[2];
  uniform sampler2D uMap0;
  uniform sampler2D uMap1;
  varying vec3 vW;

  float depthAt(sampler2D map, vec2 uv, vec3 nf) {
    float z = texture2D(map, uv).r;
    return nf.x * nf.y / (nf.y - z * (nf.y - nf.x));
  }
  // 1 lit, 0 in shadow: a soft 3x3 look-up in the beam's own depth pass
  float lit(sampler2D map, mat4 m, vec3 nf) {
    vec4 c = m * vec4(vW, 1.0);
    if (c.w <= 0.0) return 0.0;
    vec2 uv = c.xy / c.w * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 1.0;
    float d = c.w - 0.015 - 0.008 * c.w;
    float s = 0.0;
    for (int i = -1; i <= 1; i++)
      for (int j = -1; j <= 1; j++)
        s += d <= depthAt(map, uv + vec2(float(i), float(j)) * nf.z * 1.25, nf) ? 1.0 : 0.0;
    return s / 9.0;
  }
  float beam(int k, vec3 n, float sh) {
    vec3 tl = uPos[k] - vW;
    float dist = length(tl);
    tl /= dist;
    float cs = dot(-tl, uDir[k]);
    float cone = smoothstep(uCos[k].x, uCos[k].y, cs);
    if (cone <= 0.0) return 0.0;
    // a lamp's hot middle, a surface turned away gets none, a grazing one less
    float hot = mix(0.86, 1.0, smoothstep(uCos[k].y, 1.0, cs));
    float face = smoothstep(-0.02, 0.35, dot(n, tl));
    return uInt[k] * cone * hot * face * mix(1.0, sh, uShadow[k]);
  }
  void main() {
    vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
    if (dot(n, cameraPosition - vW) < 0.0) n = -n;
    float L = 0.0;
    if (uInt[0] > 0.0) L += beam(0, n, uShadow[0] > 0.5 ? lit(uMap0, uMat[0], uNF[0]) : 1.0);
    if (uInt[1] > 0.0) L += beam(1, n, uShadow[1] > 0.5 ? lit(uMap1, uMat[1], uNF[1]) : 1.0);
    L = clamp(L, 0.0, 1.0);
    // premultiplied: the darkness occludes passthrough, the glow adds to it
    gl_FragColor = vec4(uGlow * L, uDark * (1.0 - L));
  }`;

const _v = new Vector3();
const _v2 = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _q = new Quaternion();
const _m = new Matrix4();
const _s = new Vector3();
const _c = new Color();
const _up = new Vector3(0, 1, 0);
const _yAxis = new Vector3(0, 1, 0);
const _hsl = { h: 0, s: 0, l: 0 };

const _box = new Box3();
const _n1 = new Vector3();
const _n2 = new Vector3();
const _c1 = new Vector3();
const _c2 = new Vector3();
type PlaneGeo = BufferGeometry & { parameters?: { width: number; height: number; depth: number } };
/** A plane's area (m²) from the scene system's box. */
const areaOf = (o: Mesh) => {
  const p = (o.geometry as PlaneGeo).parameters;
  return p ? p.width * p.depth : 0;
};
/**
 * A plane lying on a bigger one (a window or a door in its wall) or on a volume's face (a table's top on its box):
 * drawn as well it would darken the same spot twice, and the two flicker against each other.
 */
function coveredPlane(o: Mesh, planes: ReadonlyArray<{ obj: Mesh }>, volumes: ReadonlyArray<{ obj: Mesh }>): boolean {
  o.updateMatrixWorld();
  _n1.set(0, 1, 0).transformDirection(o.matrixWorld);
  _c1.setFromMatrixPosition(o.matrixWorld);
  const a = areaOf(o);
  for (const { obj: q } of planes) {
    if (q === o || areaOf(q) <= a) continue;
    q.updateMatrixWorld();
    _n2.set(0, 1, 0).transformDirection(q.matrixWorld);
    if (Math.abs(_n1.dot(_n2)) < 0.97) continue;
    _c2.setFromMatrixPosition(q.matrixWorld);
    if (Math.abs(_v.subVectors(_c1, _c2).dot(_n2)) > 0.06) continue;
    // its middle inside the bigger one's rectangle
    _v.copy(_c1).applyMatrix4(_m.copy(q.matrixWorld).invert());
    const p = (q.geometry as PlaneGeo).parameters;
    if (p && Math.abs(_v.x) <= p.width / 2 + 0.02 && Math.abs(_v.z) <= p.depth / 2 + 0.02) return true;
  }
  if (Math.abs(_n1.y) > 0.97)
    for (const { obj: v } of volumes) {
      if (!v.geometry.boundingBox) v.geometry.computeBoundingBox();
      v.updateMatrixWorld();
      _box.copy(v.geometry.boundingBox!).applyMatrix4(v.matrixWorld);
      if (Math.abs(_box.max.y - _c1.y) < 0.05 && _c1.x >= _box.min.x - 0.02 && _c1.x <= _box.max.x + 0.02 && _c1.z >= _box.min.z - 0.02 && _c1.z <= _box.max.z + 0.02) return true;
    }
  return false;
}

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** A source of the room's shape: a scene mesh, a volume, or a plane (its rectangle). */
interface RoomPart {
  obj: Mesh;
  quad: boolean;
}

/**
 * The parts, in one geometry (in `toLocal` space): one draw for the whole room, however many surfaces Quest found.
 * Planes are their rectangles (the scene system's plane is a 1 mm box whose two faces would fight).
 */
function mergeRoom(parts: readonly RoomPart[], toLocal: Matrix4): BufferGeometry {
  let n = 0;
  for (const p of parts) n += p.quad ? 6 : (p.obj.geometry.index?.count ?? p.obj.geometry.attributes.position.count);
  const out = new Float32Array(n * 3);
  let k = 0;
  const put = (x: number, y: number, z: number) => {
    _v.set(x, y, z).applyMatrix4(_m);
    out[k++] = _v.x;
    out[k++] = _v.y;
    out[k++] = _v.z;
  };
  for (const p of parts) {
    _m.multiplyMatrices(toLocal, p.obj.matrixWorld);
    const g = p.obj.geometry as PlaneGeo;
    if (p.quad) {
      const w = (g.parameters?.width ?? 0) / 2;
      const d = (g.parameters?.depth ?? 0) / 2;
      put(-w, 0, -d), put(-w, 0, d), put(w, 0, d);
      put(-w, 0, -d), put(w, 0, d), put(w, 0, -d);
      continue;
    }
    const pos = g.attributes.position;
    const idx = g.index;
    const count = idx ? idx.count : pos.count;
    for (let i = 0; i < count; i++) {
      const j = idx ? idx.getX(i) : i;
      put(pos.getX(j), pos.getY(j), pos.getZ(j));
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(out, 3));
  return geo;
}

export class LightsOut {
  readonly root = new Group();
  /** Off at the lowest frame-rate level; lighter at the next (see `level`). */
  level = 0;
  phase: Phase = 'off';
  kind: Kind = 'song';
  /** Where the key light hangs: metres above (`?lorise=`; `high`: up to 0.9 m, under the ceiling), behind (`?loback=`) and to the right of your eyes (`?loside=`). */
  readonly tune = { rise: Number(params.get('lorise') ?? -0.2), back: Number(params.get('loback') ?? 0.35), side: Number(params.get('loside') ?? 0.4), aimUp: 0.3, glow: 1 };
  /** Live numbers for the tests. */
  readonly stats = { dark: 0, key: 0, sweep: 0, receivers: 0, tris: 0, source: 'none' as 'mesh' | 'planes' | 'backdrop' | 'none', casters: 0, fired: 0, ended: 0, passes: 0 };

  private key = new Beam(1024, 0.05);
  private sweep = new Beam(512, 0.06);
  private uniforms = {
    uDark: { value: 0 },
    uGlow: { value: new Vector3() },
    uPos: { value: [this.key.pos, this.sweep.pos] },
    uDir: { value: [this.key.dir, this.sweep.dir] },
    uCos: { value: [this.key.cos, this.sweep.cos] },
    uInt: { value: [0, 0] },
    uShadow: { value: [1, 1] },
    uMat: { value: [this.key.mat, this.sweep.mat] },
    uNF: { value: [this.key.nf, this.sweep.nf] },
    uMap0: { value: this.key.rt.depthTexture },
    uMap1: { value: this.sweep.rt.depthTexture },
  };
  private receiverMat = new ShaderMaterial({
    uniforms: this.uniforms,
    vertexShader: RECEIVER_VERT,
    fragmentShader: RECEIVER_FRAG,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: CustomBlending,
    blendEquation: AddEquation,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    blendEquationAlpha: AddEquation,
    blendSrcAlpha: OneFactor,
    blendDstAlpha: OneMinusSrcAlphaFactor,
    // (a hair nearer than its own depth pass, so it always passes over itself, never over a surface in front)
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 2,
    toneMapped: false,
  });
  /** The room's surfaces' depth, drawn before everything (the darkness then only lands on the nearest). */
  private prepassMat = new ShaderMaterial({
    vertexShader: RECEIVER_VERT,
    fragmentShader: 'void main() { gl_FragColor = vec4(0.0); }',
    colorWrite: false,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 8,
  });
  /** What the beams' depth passes draw everything with. */
  private depthMat = new MeshBasicMaterial({ colorWrite: false, side: DoubleSide });
  private casterMat = new MeshBasicMaterial({ colorWrite: false });
  /** Everything the room has no surface for: dark too. */
  private sky: Mesh;
  private skyMat = new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: BackSide, depthWrite: false, toneMapped: false });
  /** The room drawn over passthrough (its depth, then its light), and its furniture as casters. */
  private roomDepth: Mesh;
  private roomColor: Mesh;
  private roomCast: Mesh;
  /** What the merged room was built from (rebuilt only when that changes). */
  private roomSig: Array<{ obj: Object3D; geo: BufferGeometry; m: Float32Array }> = [];
  private casters = new Group();
  private fallback = new Group();
  private bones: InstancedMesh;
  private knots: InstancedMesh;
  private dust: InstancedMesh;
  private dustSeed = new Float32Array(DUST * 4);

  private t = 0;
  private backT = 0;
  private backDur = 0.5;
  private darkAt = 0;
  private struck = false;
  private fireBeat = 0;
  private lastTint = -9;
  private tint = 0;
  private tintCol = new Color();
  private syncT = 0;
  private raiseT = 0;
  private downSeen = false;
  private ceilingY = Number.NaN;
  private wantDark = DARK;
  private readonly fwd = new Vector3(0, 0, -1);
  private readonly side = new Vector3(1, 0, 0);
  private readonly handsAt = new Vector3();
  private handsSeen = false;
  private poseBuf = new Float32Array(25 * 16);
  private radBuf = new Float32Array(25);
  private jointPos = Array.from({ length: 25 }, () => new Vector3());
  private jointOk = new Uint8Array(25);
  private spaces: Record<'left' | 'right', { of: XRHand | null; list: XRJointSpace[] }> = { left: { of: null, list: [] }, right: { of: null, list: [] } };

  constructor(
    private renderer: WebGLRenderer,
    private scene: Scene,
    private host: LightsHost,
  ) {
    this.root.name = 'LightsOut';
    this.root.visible = false;
    this.sky = new Mesh(new SphereGeometry(9, 32, 16), this.skyMat);
    this.sky.name = 'LightsOutRoom';
    this.sky.renderOrder = -11;
    this.sky.frustumCulled = false;
    this.roomDepth = new Mesh(new BufferGeometry(), this.prepassMat);
    this.roomDepth.renderOrder = -14;
    this.roomColor = new Mesh(this.roomDepth.geometry, this.receiverMat);
    this.roomColor.renderOrder = -12;
    this.roomCast = new Mesh(new BufferGeometry(), this.casterMat);
    this.roomCast.layers.set(SHADOW_LAYER);
    for (const m of [this.roomDepth, this.roomColor, this.roomCast]) m.frustumCulled = false;
    this.root.add(this.roomDepth, this.roomColor, this.casters, this.fallback, this.sky, this.key.cone, this.sweep.cone);
    this.casters.add(this.roomCast);
    // the hands' shadow casters: a cylinder on every bone, a ball on every joint (the beams' passes only)
    const n = LINKS.length * 2 + 2;
    this.bones = new InstancedMesh(new CylinderGeometry(1, 1, 1, 8, 1, true), this.casterMat, n);
    this.knots = new InstancedMesh(new SphereGeometry(1, 8, 5), this.casterMat, 50 + 2);
    for (const m of [this.bones, this.knots]) {
      m.layers.set(SHADOW_LAYER);
      m.frustumCulled = false;
      m.count = 0;
      m.renderOrder = -13;
      this.casters.add(m);
    }
    // dust in the beams
    this.dust = new InstancedMesh(new SphereGeometry(1, 6, 4), asLight(new MeshBasicMaterial({ toneMapped: false })), DUST);
    this.dust.name = 'LightsOutDust';
    this.dust.frustumCulled = false;
    this.dust.renderOrder = 6;
    for (let i = 0; i < DUST; i++) {
      this.dust.setColorAt(i, _c.setRGB(0, 0, 0));
      for (let k = 0; k < 4; k++) this.dustSeed[i * 4 + k] = Math.random();
    }
    this.root.add(this.dust);
    this.key.cam.layers.enable(KIT_LAYER);
    this.buildFallback();
  }

  get active(): boolean {
    return this.phase !== 'off';
  }

  /** The moment begins: a song's Spotlight, a newcomer's first taste, or an S's curtain call. */
  fire(kind: Kind): void {
    if (this.level >= 3) return;
    if (kind !== 'song' && this.phase !== 'off') return;
    if (this.host.game.inLesson && kind !== 'taste') return;
    this.kind = kind;
    this.phase = 'on';
    this.t = 0;
    this.backT = 0;
    this.struck = false;
    this.tint = 0;
    this.darkAt = this.stats.dark;
    this.wantDark = kind === 'curtain' ? 0.8 : DARK;
    this.stats.fired++;
    this.root.visible = true;
    this.host.forward(this.fwd);
    this.side.crossVectors(this.fwd, _up).normalize();
    const b = this.host.game.beatNow;
    this.fireBeat = Number.isFinite(b) ? b : 0;
    // the instruments on the desk throw shadows too (in the key light; their small parts' are lost in the big ones)
    this.host.kit.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh || !m.castShadow || m.layers.isEnabled(KIT_LAYER)) return;
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      m.getWorldScale(_s);
      if ((m.geometry.boundingSphere?.radius ?? 0) * Math.max(_s.x, _s.y, _s.z) >= 0.03) m.layers.enable(KIT_LAYER);
    });
    this.syncRoom();
    // (a curtain call lands with the grade's own stamp: only the lamp)
    if (kind !== 'curtain') sfx.powerDown();
    sfx.strike(this.calm ? 0.8 : STRIKE_S);
    if (kind === 'song') {
      // the band drops to the drums until the next downbeat after the strike, then comes back with more room
      const spb = this.host.game.clock.spb;
      let nb = Math.ceil(this.fireBeat / 4) * 4;
      if ((nb - this.fireBeat) * spb < STRIKE_S + 0.25) nb += 4;
      const back = audio.now() + (nb - this.fireBeat) * spb;
      audio.bandDrop(back);
      audio.wetter(true, back);
      // (and the band comes back in on a bloom of the key's chord)
      sfx.bloom(back);
    }
  }

  /** The moment is over: the room comes back over a beat. */
  end(): void {
    if (this.phase !== 'on') return;
    this.phase = 'back';
    this.backT = 0;
    this.darkAt = this.stats.dark;
    const spb = this.host.game.clock.spb;
    this.backDur = this.kind === 'song' ? Math.min(1.2, Math.max(0.35, spb)) : this.kind === 'taste' ? 0.6 : 1;
    if (this.kind === 'song') audio.wetter(false);
  }

  /** A hit (or any coloured moment): the lit area takes its colour, at most twice a second (never a flicker). */
  hit(color: number, gain: number): void {
    if (this.phase !== 'on' || !this.struck || this.t - this.lastTint < 0.5 || this.calm) return;
    // (the Spotlight's own gold beat pulse is the beam's breath, not a colour)
    if (color === 0xffd36a && gain < 0.5) return;
    this.tintCol.setHex(color);
    this.tintCol.getHSL(_hsl);
    if (_hsl.s < 0.35) this.tintCol.setHSL(0.09, 0.8, 0.55);
    this.lastTint = this.t;
    this.tint = Math.min(1, 0.55 + 0.4 * gain);
  }

  private calm = false;

  update(dt: number, calm: boolean): void {
    this.calm = calm;
    if (this.phase === 'off') {
      this.watchTaste(dt);
      return;
    }
    const g = this.host.game;
    // (the song paused: the moment holds still with it)
    const paused = this.host.paused() && (g.mode === 'play' || g.mode === 'count');
    if (!paused) this.t += dt;
    // a song that stopped (quit, or over) takes the moment with it
    if (this.kind === 'song' && this.phase === 'on' && (g.mode !== 'play' || (this.t > 1 && g.spotLeft <= 0))) this.end();
    if (this.kind === 'taste' && this.phase === 'on' && this.t >= 3.4) this.end();
    if (this.kind === 'curtain' && this.phase === 'on' && (this.t >= 5.5 || (g.mode !== 'results' && this.t > 0.6))) this.end();
    if (this.phase === 'back' && !paused) this.backT += dt;

    // darkness
    const downS = calm ? 0.8 : STRIKE_S;
    let dark: number;
    if (this.phase === 'on') dark = this.darkAt + (this.wantDark - this.darkAt) * ease(this.t / downS);
    else dark = this.darkAt * (1 - ease(this.backT / this.backDur));
    if (this.phase === 'back' && this.backT >= this.backDur) {
      this.stop();
      return;
    }
    this.stats.dark = dark;
    this.uniforms.uDark.value = dark;
    this.skyMat.opacity = dark;

    // the strike
    const strikeAt = calm ? 0.8 : STRIKE_S;
    if (!this.struck && this.t >= strikeAt) this.struck = true;
    let on = 0;
    if (this.struck) {
      const s = this.t - strikeAt;
      // (the lamp catching: one quick dip as it strikes, then up; calm, it just eases on)
      if (calm) on = ease(s / 0.25);
      else on = s < 0.03 ? 0.9 : s < 0.07 ? 0.55 : Math.min(1, 0.55 + 0.45 * ease((s - 0.07) / 0.12));
    }

    // the beat: the beam breathes on it
    const beat = this.kind === 'song' && Number.isFinite(g.beatNow) ? g.beatNow : this.t * 2;
    const frac = beat - Math.floor(beat);
    const breath = 1 + (calm ? 0.04 : 0.08) * Math.cos(frac * Math.PI * 2);

    // how far the beams have closed onto the hands (the last bar; a taste's last second; a curtain call all along)
    let conv = 0;
    if (this.kind === 'song') conv = this.phase === 'back' ? 1 : g.spotLeft > 0 ? clamp01(1 - g.spotLeft / 4) : 0;
    else if (this.kind === 'taste') conv = this.phase === 'back' ? 1 : clamp01((this.t - 2.4) / 1);
    else conv = this.phase === 'back' ? 1 : clamp01((this.t - strikeAt) / 3);
    conv = ease(conv);

    this.aimBeams(conv, breath, on, beat);
    this.updateHands();
    this.syncT -= dt;
    if (this.syncT <= 0) this.syncRoom();

    // the light added over the real room in the beam: warm, breathing, tinted by the last hit
    if (!paused) this.tint = Math.max(0, this.tint - dt * 2.6);
    const glowK = (dark / DARK) * 0.06 * breath * this.tune.glow;
    const tg = this.uniforms.uGlow.value;
    tg.set(1, 0.86, 0.66).multiplyScalar(glowK);
    if (this.tint > 0) {
      _c.copy(this.tintCol).multiplyScalar(this.tint * 0.22 * (dark / DARK));
      tg.x += _c.r;
      tg.y += _c.g;
      tg.z += _c.b;
    }
    this.updateDust(dt, dark);
    this.renderShadows();
  }

  /** Put both beams where they are this frame. */
  private aimBeams(conv: number, breath: number, on: number, beat: number): void {
    const head = this.host.head;
    const kitAt = this.host.kit.getWorldPosition(_a);
    const low = this.level >= 1;
    // where everything converges: your hands (or the desk when they're not seen)
    if (!this.handsSeen) this.handsAt.copy(kitAt).addScaledVector(_up, 0.12);

    // the key: a follow spot behind you, off your right shoulder and a little under your eyes, following your hands
    // over the desk: their shadows land big on the wall ahead, beside the screen rather than behind it (a lamp high
    // overhead, `?lorise=high`, throws them down onto the desk instead)
    const k = this.key;
    const rise = Number.isFinite(this.tune.rise) ? this.tune.rise : Number.isFinite(this.ceilingY) ? Math.min(0.9, this.ceilingY - 0.12 - head.y) : 0.9;
    const back = this.tune.back;
    k.pos.copy(head).addScaledVector(this.fwd, -back).addScaledVector(_up, rise).addScaledVector(this.side, this.tune.side);
    // (a follow spot: it follows the hands, loosely, and closes onto them at the end)
    _v.copy(kitAt).addScaledVector(_up, this.tune.aimUp).addScaledVector(this.fwd, 0.15);
    k.aim.lerpVectors(_v, this.handsAt, 0.6 + 0.4 * conv);
    k.outer = (this.kind === 'curtain' ? 0.36 : 0.42) * (1 - conv) + 0.13 * conv;
    k.outer *= 1 + (breath - 1) * 0.25;
    k.inner = k.outer * 0.9;
    k.intensity = on * (0.9 * breath + 0.1 * conv);
    k.cam.near = Math.max(0.1, Math.min(back, Math.hypot(back, rise)) - 0.3);
    k.place(Math.hypot(back, rise) + 3, !low, 1);

    // the sweep: every four bars a second light rides across behind you, high, and its beam crosses the room
    const s = this.sweep;
    let si = 0;
    let theta = 0.44;
    if (this.kind === 'song' && !this.calm && this.level < 2) {
      const sb = beat - this.fireBeat - 2;
      const k16 = Math.floor(sb / 16);
      const u = (sb - k16 * 16) / 4;
      if (sb >= 0 && u < 1 && conv <= 0) {
        const dirn = k16 % 2 === 0 ? 1 : -1;
        theta = dirn * (-0.44 + 0.88 * ease(u));
        si = ease(u / 0.15) * (1 - ease((u - 0.85) / 0.15));
      }
    }
    // on the last bar it comes back, aimed at your hands
    if (conv > 0 && this.kind !== 'curtain' && !this.calm && this.level < 2) {
      theta = 0.44;
      si = Math.max(si, conv);
    }
    const sweepUp = Number.isFinite(this.ceilingY) ? Math.min(1.1, this.ceilingY - 0.15 - head.y) : 0.95;
    _v.copy(this.fwd).applyAxisAngle(_yAxis, theta);
    s.pos.copy(head).addScaledVector(_v, -1.0).addScaledVector(_up, sweepUp);
    _v2.copy(this.fwd).applyAxisAngle(_yAxis, -theta * 1.5);
    _b.copy(head).addScaledVector(_v2, 2.4).addScaledVector(_up, -0.55);
    s.aim.lerpVectors(_b, this.handsAt, conv);
    s.outer = 0.3 * (1 - conv) + 0.1 * conv;
    s.inner = s.outer * 0.85;
    s.intensity = on * si * 0.85 * (conv > 0 ? 1 : breath);
    s.shadows = this.level < 1;
    s.cam.near = 0.3;
    s.place(4, !low, 1);

    this.stats.key = k.intensity;
    this.stats.sweep = s.intensity;
    const ints = this.uniforms.uInt.value as number[];
    ints[0] = k.intensity;
    ints[1] = s.intensity;
    const sh = this.uniforms.uShadow.value as number[];
    sh[0] = 1;
    sh[1] = s.shadows ? 1 : 0;
  }

  /** Capsules on the tracked hand bones (or a stand-in for a controller), for the beams' shadow passes. */
  private updateHands(): void {
    const frame = this.host.frame() as BatchFrame | undefined;
    const ref = this.host.refSpace();
    let nb = 0;
    let nk = 0;
    let seen = 0;
    _a.set(0, 0, 0);
    if (frame?.session && ref) {
      for (const src of frame.session.inputSources) {
        const side = src.handedness;
        if (side !== 'left' && side !== 'right') continue;
        const hs: HandState = hands[side];
        if (src.hand && frame.fillPoses && frame.fillJointRadii) {
          const sp = this.spaces[side];
          if (sp.of !== src.hand) {
            sp.of = src.hand;
            sp.list = JOINT_NAMES.map((n) => src.hand!.get(n)).filter((x): x is XRJointSpace => !!x);
          }
          if (sp.list.length !== 25) continue;
          if (!frame.fillPoses(sp.list, ref, this.poseBuf) || !frame.fillJointRadii(sp.list, this.radBuf)) continue;
          for (let i = 0; i < 25; i++) {
            const x = this.poseBuf[i * 16 + 12];
            this.jointOk[i] = Number.isNaN(x) ? 0 : 1;
            this.jointPos[i].set(x, this.poseBuf[i * 16 + 13], this.poseBuf[i * 16 + 14]);
          }
          for (let i = 0; i < 25; i++) {
            if (!this.jointOk[i] || nk >= this.knots.instanceMatrix.count) continue;
            _m.compose(this.jointPos[i], _q.identity(), _s.setScalar((this.radBuf[i] || 0.008) * 1.05));
            this.knots.setMatrixAt(nk++, _m);
          }
          for (const [an, bn] of LINKS) {
            const ia = JI.get(an)!;
            const ib = JI.get(bn)!;
            if (!this.jointOk[ia] || !this.jointOk[ib] || nb >= this.bones.instanceMatrix.count) continue;
            const r = ((this.radBuf[ia] || 0.008) + (this.radBuf[ib] || 0.008)) * 0.5 * 1.05;
            this.bone(nb++, this.jointPos[ia], this.jointPos[ib], r);
          }
          if (this.jointOk[0]) {
            _a.add(this.jointPos[0]);
            seen++;
          }
        } else if (hs.controller || !src.hand) {
          // a controller: a stand-in about its size, along its ray behind the tip
          if (!hs.tracked) continue;
          _b.copy(hs.rayO).addScaledVector(hs.rayD, 0.03);
          _v2.copy(hs.rayO).addScaledVector(hs.rayD, -0.11);
          if (nb < this.bones.instanceMatrix.count) this.bone(nb++, _b, _v2, 0.024);
          if (nk < this.knots.instanceMatrix.count) {
            _m.compose(_v2, _q.identity(), _s.setScalar(0.035));
            this.knots.setMatrixAt(nk++, _m);
          }
          _a.add(hs.rayO);
          seen++;
        }
      }
    }
    this.bones.count = nb;
    this.knots.count = nk;
    // (at the lowest frame-rate level the app's own hand occluders are off: these keep your hands out of the dark)
    const occlude = this.level >= 2;
    for (const m of [this.bones, this.knots]) if (m.layers.isEnabled(0) !== occlude) m.layers.toggle(0);
    this.bones.instanceMatrix.needsUpdate = true;
    this.knots.instanceMatrix.needsUpdate = true;
    this.stats.casters = nb + nk;
    if (seen > 0) {
      _a.multiplyScalar(1 / seen);
      if (!this.handsSeen) this.handsAt.copy(_a);
      else this.handsAt.lerp(_a, 0.2);
      this.handsSeen = true;
    } else this.handsSeen = false;
  }

  private bone(i: number, a: Vector3, b: Vector3, r: number): void {
    _v.subVectors(b, a);
    const len = _v.length();
    if (len < 1e-4) return;
    _q.setFromUnitVectors(_yAxis, _v.multiplyScalar(1 / len));
    _v2.addVectors(a, b).multiplyScalar(0.5);
    _m.compose(_v2, _q, _s.set(r, len, r));
    this.bones.setMatrixAt(i, _m);
  }

  /**
   * The room's surfaces, from the best Quest gives: its scene mesh (the whole room as triangles, within budget) with
   * the furniture's volumes casting; else its planes (walls, floor, ceiling, tables) with the volumes on them; else a
   * backdrop ahead, the desk and the floor.
   */
  private syncRoom(): void {
    this.syncT = 1;
    let global: { e: Entity; obj: Mesh; tris: number } | null = null;
    const volumes: Array<{ obj: Mesh; tris: number }> = [];
    for (const e of this.host.meshes()) {
      const obj = e.object3D as Mesh | undefined;
      if (!obj?.isMesh || !obj.geometry) continue;
      const tris = (obj.geometry.index?.count ?? obj.geometry.attributes.position?.count ?? 0) / 3;
      if (e.getValue(XRMesh, 'isBounded3D')) volumes.push({ obj, tris });
      else if (!global || tris > global.tris) global = { e, obj, tris };
    }
    const planes: Array<{ obj: Mesh; tris: number }> = [];
    this.ceilingY = Number.NaN;
    for (const e of this.host.planes()) {
      const obj = e.object3D as Mesh | undefined;
      if (!obj?.isMesh || !obj.geometry) continue;
      const pl = e.getValue(XRPlane, '_plane') as (XRPlane & { semanticLabel?: string }) | undefined;
      if (pl?.semanticLabel === 'ceiling') {
        obj.updateMatrixWorld();
        this.ceilingY = obj.matrixWorld.elements[13];
      }
      planes.push({ obj, tris: 2 });
    }
    /** What's drawn over passthrough, and what casts. */
    const recv: RoomPart[] = [];
    const cast: RoomPart[] = [];
    let tris = 0;
    let source: typeof this.stats.source = 'none';
    if (global && global.tris <= MAX_TRIS) {
      // the whole room in one: the furniture inside it only casts (drawn again it would darken twice)
      recv.push({ obj: global.obj, quad: false });
      tris += global.tris;
      for (const v of volumes) cast.push({ obj: v.obj, quad: false });
      source = 'mesh';
    } else if (planes.length || volumes.length) {
      for (const v of volumes)
        if (tris + v.tris <= MAX_TRIS) {
          recv.push({ obj: v.obj, quad: false });
          cast.push({ obj: v.obj, quad: false });
          tris += v.tris;
        }
      for (const p of planes)
        if (tris + p.tris <= MAX_TRIS && !coveredPlane(p.obj, planes, volumes)) {
          recv.push({ obj: p.obj, quad: true });
          tris += p.tris;
        }
      source = planes.length ? 'planes' : 'mesh';
    }
    // rebuilt only when Quest's room changed (a new surface, a refit, a recentre)
    let same = this.roomSig.length === recv.length + cast.length;
    const all = [...recv, ...cast];
    for (let i = 0; same && i < all.length; i++) {
      const o = all[i].obj;
      o.updateWorldMatrix(true, false);
      const sg = this.roomSig[i];
      same = sg.obj === o && sg.geo === o.geometry && o.matrixWorld.elements.every((x, j) => Math.abs(x - sg.m[j]) < 1e-4);
    }
    if (!same) {
      this.root.updateWorldMatrix(true, false);
      const toLocal = new Matrix4().copy(this.root.matrixWorld).invert();
      for (const p of all) p.obj.updateWorldMatrix(true, false);
      this.roomDepth.geometry.dispose();
      this.roomCast.geometry.dispose();
      this.roomDepth.geometry = this.roomColor.geometry = mergeRoom(recv, toLocal);
      this.roomCast.geometry = mergeRoom(cast, toLocal);
      this.roomSig = all.map((p) => ({ obj: p.obj, geo: p.obj.geometry, m: new Float32Array(p.obj.matrixWorld.elements) }));
    }
    this.roomDepth.visible = this.roomColor.visible = recv.length > 0;
    this.roomCast.visible = cast.length > 0;
    this.fallback.visible = source === 'none';
    if (source === 'none') {
      this.placeFallback();
      tris = 6;
      source = 'backdrop';
    }
    this.stats.receivers = this.fallback.visible ? this.fallback.children.length / 2 : this.roomSig.length;
    this.stats.tris = tris;
    this.stats.source = source;
  }

  /** No scene data at all: a backdrop wall two metres ahead, the desk under the kit, and the floor. */
  private buildFallback(): void {
    const mk = (w: number, h: number, casts: boolean) => {
      const geo = new PlaneGeometry(w, h);
      const d = new Mesh(geo, this.prepassMat);
      d.renderOrder = -14;
      const c = new Mesh(geo, this.receiverMat);
      c.renderOrder = -12;
      this.fallback.add(d, c);
      if (casts) {
        const k = new Mesh(geo, this.casterMat);
        k.layers.set(SHADOW_LAYER);
        d.add(k);
      }
      return d;
    };
    mk(7, 3.2, false).name = 'backdrop';
    mk(1.3, 0.75, true).name = 'desk';
    mk(7, 7, false).name = 'floor';
    this.fallback.visible = false;
  }

  private placeFallback(): void {
    const head = this.host.head;
    const kit = this.host.kit;
    const kitAt = kit.getWorldPosition(_a);
    const kids = this.fallback.children;
    const floorY = Math.min(kitAt.y - 0.72, head.y - 1.15);
    for (let i = 0; i < kids.length; i += 2) {
      const d = kids[i] as Mesh;
      const c = kids[i + 1] as Mesh;
      if (d.name === 'backdrop') {
        d.position.copy(head).addScaledVector(this.fwd, 2.1);
        d.position.y = floorY + 1.6;
        d.lookAt(head.x, d.position.y, head.z);
      } else if (d.name === 'desk') {
        d.position.copy(kitAt).addScaledVector(_up, -0.002);
        kit.getWorldQuaternion(d.quaternion);
        d.quaternion.multiply(_q.setFromAxisAngle(_v.set(1, 0, 0), -Math.PI / 2));
      } else {
        d.position.copy(head);
        d.position.y = floorY;
        d.quaternion.setFromAxisAngle(_v.set(1, 0, 0), -Math.PI / 2);
      }
      c.position.copy(d.position);
      c.quaternion.copy(d.quaternion);
    }
  }

  /** Motes of dust turning in the beams (dark outside them). */
  private updateDust(dt: number, dark: number): void {
    const on = this.level < 1 && dark > 0.05;
    this.dust.visible = on;
    if (!on) return;
    const head = this.host.head;
    const tt = this.t;
    const k = this.key;
    for (let i = 0; i < DUST; i++) {
      const r0 = this.dustSeed[i * 4];
      const r1 = this.dustSeed[i * 4 + 1];
      const r2 = this.dustSeed[i * 4 + 2];
      const r3 = this.dustSeed[i * 4 + 3];
      // a slow drift in a box between you and the wall ahead
      const x = (r0 - 0.5) * 1.6 + Math.sin(tt * (0.11 + r3 * 0.1) + r1 * 6.3) * 0.08;
      const y = -0.25 + r1 * 0.75 + Math.sin(tt * (0.07 + r0 * 0.08) + r2 * 6.3) * 0.06 - ((tt * 0.012 * (0.5 + r3)) % 0.75);
      const z = 0.35 + r2 * 1.7;
      _v.copy(head).addScaledVector(this.side, x).addScaledVector(_up, y).addScaledVector(this.fwd, z);
      _b.subVectors(_v, k.pos);
      const cs = _b.normalize().dot(k.dir);
      let b = k.intensity * clamp01((cs - k.cos.x) / Math.max(1e-3, k.cos.y - k.cos.x));
      const s = this.sweep;
      if (s.intensity > 0) {
        _b.subVectors(_v, s.pos);
        const c2 = _b.normalize().dot(s.dir);
        b += s.intensity * clamp01((c2 - s.cos.x) / Math.max(1e-3, s.cos.y - s.cos.x));
      }
      b *= (0.35 + 0.65 * Math.abs(Math.sin(tt * (0.8 + r3) + r0 * 9))) * (dark / DARK);
      _m.compose(_v, _q.identity(), _s.setScalar(0.0011 + r3 * 0.0012));
      this.dust.setMatrixAt(i, _m);
      this.dust.setColorAt(i, _c.setRGB(1, 0.9, 0.75).multiplyScalar(b * 0.55));
    }
    this.dust.instanceMatrix.needsUpdate = true;
    if (this.dust.instanceColor) this.dust.instanceColor.needsUpdate = true;
    void dt;
  }

  /** Each beam's depth pass: only what's on the shadow layer, from the beam, into its own small map. */
  private renderShadows(): void {
    const r = this.renderer;
    const scene = this.scene;
    const prevTarget = r.getRenderTarget();
    const xrOn = r.xr.enabled;
    const prevOverride = scene.overrideMaterial;
    const prevAuto = scene.matrixWorldAutoUpdate;
    const prevBg = scene.background;
    const prevAutoClear = r.autoClear;
    let passes = 0;
    try {
      r.xr.enabled = false;
      scene.overrideMaterial = this.depthMat;
      scene.matrixWorldAutoUpdate = false;
      scene.background = null;
      r.autoClear = false;
      for (const b of [this.key, this.sweep]) {
        if (b.intensity <= 0.001 || !b.shadows) continue;
        r.setRenderTarget(b.rt);
        r.clear(true, true, false);
        r.render(scene, b.cam);
        passes++;
      }
    } finally {
      r.xr.enabled = xrOn;
      scene.overrideMaterial = prevOverride;
      scene.matrixWorldAutoUpdate = prevAuto;
      scene.background = prevBg;
      r.autoClear = prevAutoClear;
      r.setRenderTarget(prevTarget);
    }
    this.stats.passes = passes;
  }

  /** Off: nothing drawn, no passes. */
  private stop(): void {
    this.phase = 'off';
    this.stats.dark = 0;
    this.stats.key = 0;
    this.stats.sweep = 0;
    this.stats.ended++;
    this.stats.passes = 0;
    this.uniforms.uDark.value = 0;
    this.skyMat.opacity = 0;
    this.root.visible = false;
    this.key.intensity = this.sweep.intensity = 0;
    this.downSeen = false;
    this.raiseT = 0;
  }

  /** Free play: the first time a newcomer raises both hands, a four-second taste of it. */
  private watchTaste(dt: number): void {
    if (NO_COACH || this.level >= 2) return;
    const head = this.host.head;
    const l = hands.left;
    const r = hands.right;
    if (!l.tracked || !r.tracked) {
      this.raiseT = 0;
      return;
    }
    // (from hands that were down: hands left up while you sit down don't count)
    if (l.wrist.y < head.y - 0.25 && r.wrist.y < head.y - 0.25) this.downSeen = true;
    const up = l.wrist.y > head.y - 0.12 && r.wrist.y > head.y - 0.12;
    this.raiseT = up && this.downSeen ? this.raiseT + dt : 0;
    if (this.raiseT < 0.3) return;
    this.raiseT = 0;
    if (!this.host.tasteOk()) return;
    this.host.tasted();
    this.fire('taste');
  }
}
