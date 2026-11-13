/**
 * A seated-view preview of the piano with waterfall notes: lighting, a desk, a short song, key presses.
 * ?view=seated|quarter|front|top|close  ?t=<seconds> freezes the song at that time (deterministic screenshots).
 */
import {
  ACESFilmicToneMapping, AdditiveBlending, BoxGeometry, CanvasTexture, Color, DirectionalLight, Group, HemisphereLight, Mesh,
  MeshBasicMaterial, MeshStandardMaterial, PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry, PMREMGenerator, RepeatWrapping,
  Scene, SRGBColorSpace, WebGLRenderer,
} from '@iwsdk/core';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildPiano, isBlack, keyCentre, KEY } from '../src/scene-assets/lib/piano.js';

const q = new URLSearchParams(location.search);
const view = q.get('view') ?? 'seated';
const freeze = q.has('t') ? Number(q.get('t')) : null;

const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new Scene();
scene.background = new Color(0x202226);
const pmrem = new PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const camera = new PerspectiveCamera(50, innerWidth / innerHeight, 0.02, 20);
const views: Record<string, [number, number, number, number, number, number]> = {
  seated: [0, 0.36, 0.44, 0, 0.06, -0.11],
  quarter: [0.5, 0.42, 0.5, 0, 0.03, -0.1],
  front: [0, 0.18, 0.6, 0, 0.04, -0.1],
  top: [0, 0.9, 0.05, 0, 0, -0.1],
  close: [0.1, 0.16, 0.22, 0.03, 0.06, -0.09],
};
const v = views[view] ?? views.seated;
camera.position.set(v[0], v[1], v[2]);
camera.lookAt(v[3], v[4], v[5]);

// light: a soft key from above-front, a cool fill, the room's reflections from the environment
const key = new DirectionalLight(0xfff1dc, 3.2);
key.position.set(0.5, 1.4, 0.9);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -0.6;
key.shadow.camera.right = 0.6;
key.shadow.camera.top = 0.6;
key.shadow.camera.bottom = -0.6;
key.shadow.camera.near = 0.3;
key.shadow.camera.far = 4;
key.shadow.bias = -0.00015;
key.shadow.normalBias = 0.0008;
key.shadow.radius = 3;
scene.add(key);
scene.add(new HemisphereLight(0xdfe6ff, 0x3a3228, 0.22));

// the desk: light oak, so the preview sits on something like a real table (in the headset this is the real desk)
function woodTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext('2d')!;
  g.fillStyle = '#6e4a30';
  g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 900; i++) {
    const y = Math.random() * 1024;
    const dark = Math.random() < 0.5;
    g.strokeStyle = dark ? `rgba(30,18,10,${0.05 + Math.random() * 0.1})` : `rgba(150,110,70,${0.04 + Math.random() * 0.08})`;
    g.lineWidth = 0.6 + Math.random() * 1.6;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= 1024; x += 32) g.lineTo(x, y + Math.sin(x / 140 + i) * 2.5 + Math.sin(x / 23 + i * 3) * 0.6);
    g.stroke();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(1.2, 0.6);
  t.anisotropy = 8;
  return t;
}
function fadeTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(8,9,11,0)');
  grad.addColorStop(0.35, 'rgba(8,9,11,0.85)');
  grad.addColorStop(1, 'rgba(8,9,11,0.95)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}
const desk = new Mesh(new PlaneGeometry(1.6, 0.8), new MeshStandardMaterial({ map: woodTexture(), roughness: 0.45, metalness: 0 }));
desk.rotation.x = -Math.PI / 2;
desk.position.set(0, -0.0005, -0.1);
desk.receiveShadow = true;
scene.add(desk);

// the piano
const piano = buildPiano({ low: 48, octaves: 3 });
scene.add(piano.root);

// a song: a simple melody over chords in C, 92 bpm, two hands
const BPM = 92;
const spb = 60 / BPM;
type Note = { midi: number; at: number; dur: number; hand: 0 | 1 };
const notes: Note[] = [];
const melody = [72, 74, 76, 79, 76, 74, 72, 67, 69, 72, 71, 69, 67, 72, 74, 76];
melody.forEach((m, i) => notes.push({ midi: m, at: i * 0.5, dur: i % 4 === 3 ? 1 : 0.45, hand: 1 }));
const chords = [
  [48, 52, 55], [48, 52, 55], [45, 48, 52], [45, 48, 52], [41, 45, 48], [41, 45, 48], [43, 47, 50], [43, 47, 50],
];
chords.forEach((c, i) => c.forEach((m) => notes.push({ midi: m, at: i * 1, dur: 0.95, hand: 0 })));
const LOOP = 8; // beats

// the waterfall: bars rise from the back of the keys; a note reaches its key when its time comes
const SPEED = 0.26; // metres per second
const LEAD = 2.2; // seconds visible ahead
const FALL_Z = -KEY.length - 0.01;
const TILT = 0.24; // the lane leans back from vertical (radians)
const lane = new Group();
lane.position.set(0, KEY.top + KEY.blackH + 0.008, FALL_Z);
lane.rotation.x = -TILT;
scene.add(lane);
const colours = [new Color(0x2fcf8a), new Color(0x3aa8ff)];
const noteMat = colours.map((c) => new MeshBasicMaterial({ color: c.clone().multiplyScalar(0.85), toneMapped: false }));
const coreMat = colours.map((c) => new MeshBasicMaterial({ color: c.clone().lerp(new Color(0xffffff), 0.55), toneMapped: false }));
const glowMat = colours.map((c) => new MeshBasicMaterial({ color: c, transparent: true, opacity: 0.16, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
const bars = new Group();
lane.add(bars);
const barGeo = new BoxGeometry(1, 1, 1);
// thin key lines on the lane so a note reads against its key
const lines = new Group();
lane.add(lines);
const lineMat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, depthWrite: false, toneMapped: false });
for (const [midi] of piano.keys) {
  if (isBlack(midi)) continue;
  const x = keyCentre(piano, midi)! - (KEY.pitch) / 2;
  const m = new Mesh(new PlaneGeometry(0.0008, SPEED * LEAD), lineMat);
  m.position.set(x, (SPEED * LEAD) / 2, -0.002);
  lines.add(m);
}
// hit bursts: an expanding ring at the landing line when a note lands
const burstGeo = new PlaneGeometry(1, 1);
const bursts: { mesh: Mesh; t: number; x: number; hand: 0 | 1 }[] = [];
const burstMat = colours.map((c) => new MeshBasicMaterial({ color: c, transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
function burst(x: number, hand: 0 | 1): void {
  const mesh = new Mesh(burstGeo, burstMat[hand].clone());
  mesh.position.set(x, 0.004, 0.012);
  lane.add(mesh);
  bursts.push({ mesh, t: 0, x, hand });
}
const landed = new Set<string>();
const live: { note: Note; mesh: Mesh; glow: Mesh; w: number }[] = notes.map((note) => {
  const w = (isBlack(note.midi) ? KEY.blackW : KEY.pitch - KEY.gap) * 0.78;
  const mesh = new Mesh(barGeo, noteMat[note.hand]);
  const core = new Mesh(barGeo, coreMat[note.hand]);
  const glow = new Mesh(barGeo, glowMat[note.hand]);
  mesh.visible = glow.visible = core.visible = false;
  mesh.add(core);
  core.scale.set(0.42, 0.96, 1.2);
  core.position.z = 0.02;
  bars.add(mesh, glow);
  return { note, mesh, glow, w };
});
// a faint strip where notes land, and a soft backdrop so the lane reads in a bright room
const landing = new Mesh(new BoxGeometry(piano.width + 0.01, 0.004, 0.006), new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, toneMapped: false }));
landing.position.set(0, -0.002, 0);
lane.add(landing);
const backdrop = new Mesh(new PlaneGeometry(piano.width + 0.02, SPEED * LEAD + 0.05), new MeshBasicMaterial({ map: fadeTexture(), transparent: true, opacity: 0.5, depthWrite: false }));
backdrop.position.set(0, (SPEED * LEAD + 0.05) / 2, -0.004);
lane.add(backdrop);

// key presses: a spring per key
const pressed = new Map<number, number>();
const keyGlow = new Map<number, Mesh>();
for (const [midi, g] of piano.keys) {
  const x = keyCentre(piano, midi)!;
  const black = isBlack(midi);
  const glow = new Mesh(new BoxGeometry(black ? KEY.blackW : KEY.pitch - KEY.gap, 0.002, black ? 0.03 : 0.04), new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
  glow.position.set(x, black ? KEY.blackH + 0.002 : 0.002, black ? KEY.length - KEY.blackL + 0.018 : KEY.length - 0.024);
  g.add(glow);
  keyGlow.set(midi, glow);
}

let t0 = performance.now() / 1000;
function frame(): void {
  const now = freeze ?? performance.now() / 1000 - t0;
  const beat = (now / spb) % LOOP;
  for (const l of live) {
    const until = ((l.note.at - beat + LOOP * 1.5) % LOOP) - LOOP * 0.5; // beats until it lands (−: playing / gone)
    const secs = until * spb;
    const len = l.note.dur * spb * SPEED;
    const x = keyCentre(piano, l.note.midi)!;
    const base = 0;
    const bottom = base + secs * SPEED; // the bar's leading edge
    const top = bottom + len;
    const visBottom = Math.max(bottom, base);
    const visTop = Math.min(top, base + SPEED * LEAD);
    const show = visTop > visBottom + 0.002;
    l.mesh.visible = l.glow.visible = show;
    if (show) {
      const h = visTop - visBottom;
      l.mesh.position.set(x, visBottom + h / 2, 0.006);
      l.mesh.scale.set(l.w, h, 0.012);
      l.glow.position.copy(l.mesh.position);
      l.glow.scale.set(l.w + 0.006, h + 0.006, 0.02);
    }
    const playing = secs <= 0 && secs > -l.note.dur * spb;
    if (playing) pressed.set(l.note.midi, 1);
    const id = `${l.note.midi}:${l.note.at}:${Math.floor(now / (LOOP * spb))}`;
    if (secs <= 0 && secs > -0.12 && !landed.has(id)) {
      landed.add(id);
      burst(x, l.note.hand);
    }
  }
  for (const [midi, g] of piano.keys) {
    const target = pressed.get(midi) ?? 0;
    pressed.set(midi, 0);
    const cur = g.rotation.x / KEY.press;
    const next = cur + (target - cur) * (target > cur ? 0.55 : 0.25);
    g.rotation.x = next * KEY.press;
    const glow = keyGlow.get(midi)!;
    const colour = live.find((l) => l.note.midi === midi)?.note.hand ?? 1;
    (glow.material as MeshBasicMaterial).color.copy(colours[colour]);
    (glow.material as MeshBasicMaterial).opacity = next * 0.55;
  }
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i];
    b.t += 1 / 72;
    const k = Math.min(1, b.t / 0.35);
    b.mesh.scale.set(0.02 + k * 0.05, 0.004 + k * 0.03, 1);
    (b.mesh.material as MeshBasicMaterial).opacity = 0.7 * (1 - k);
    if (k >= 1) {
      lane.remove(b.mesh);
      bursts.splice(i, 1);
    }
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
if (freeze !== null) {
  // settle the springs for a frozen shot
  for (let i = 0; i < 40; i++) frame();
}
frame();
(window as unknown as { ready: boolean }).ready = true;
