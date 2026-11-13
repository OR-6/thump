/**
 * Light for the instruments over passthrough (the real room gives the renderer none): a soft indoor environment for
 * reflections and ambient light (a small lit room, prefiltered once), filmic tone mapping, and contact shadows (a
 * soft dark blob under each thing, so it sits on the desk instead of floating). The key and fill lights live on the
 * kit (src/kit/kit-view.ts).
 */
import {
  ACESFilmicToneMapping,
  BackSide,
  BoxGeometry,
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PMREMGenerator,
  PlaneGeometry,
  PointLight,
  Scene,
  SRGBColorSpace,
  type Texture,
  type WebGLRenderer,
} from '@iwsdk/core';

/** A small room to light from: warm walls, a bright ceiling panel and a window, prefiltered for PBR. */
function roomEnvironment(renderer: WebGLRenderer): Texture {
  const scene = new Scene();
  const box = new BoxGeometry(1, 1, 1);
  const room = new Mesh(box, new MeshStandardMaterial({ color: 0x8a7f74, side: BackSide, roughness: 1 }));
  room.scale.set(8, 4, 8);
  room.position.y = 1.6;
  scene.add(room);
  const light = new PointLight(0xffffff, 60, 30, 2);
  light.position.set(0, 3, 0);
  scene.add(light);
  // bright panels: a ceiling light, a window to one side, a softer one behind (what chrome and lacquer catch)
  const panel = (w: number, h: number, x: number, y: number, z: number, ry: number, rx: number, k: number, tint = 0xffffff) => {
    const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color: tint, side: BackSide }));
    (m.material as MeshBasicMaterial).color.multiplyScalar(k);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, 0);
    scene.add(m);
  };
  panel(2.4, 1.2, 0, 3.55, -0.4, 0, Math.PI / 2, 9);
  panel(2.2, 1.6, -3.9, 1.8, 0.4, Math.PI / 2, 0, 5, 0xe8f0ff);
  panel(1.6, 1.0, 2.6, 2.2, 3.9, Math.PI, 0, 3, 0xfff1dc);
  const pmrem = new PMREMGenerator(renderer);
  const tex = pmrem.fromScene(scene, 0.04).texture;
  pmrem.dispose();
  return tex;
}

/** Set the renderer and scene up for the instruments. */
export function setupLighting(renderer: WebGLRenderer, scene: Scene): void {
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  scene.environment = roomEnvironment(renderer);
  // (the environment lights PBR materials; it is not drawn: passthrough is the background)
  scene.environmentIntensity = 0.9;
}

let blobTex: CanvasTexture | null = null;
/** The soft radial blob a contact shadow is drawn with (made once). */
function blob(): CanvasTexture {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.62)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.32)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  blobTex = new CanvasTexture(c);
  blobTex.colorSpace = SRGBColorSpace;
  return blobTex;
}

/**
 * A contact shadow: a soft dark ellipse `w` by `d` metres lying on the desk (local y 0), drawn before the thing on
 * it. Over passthrough it darkens the real desk under the instrument, the way a real one would.
 */
export function contactShadow(w: number, d: number, strength = 1): Mesh {
  // (the map is black with a soft alpha: it only ever darkens)
  const m = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: typeof document === 'undefined' ? null : blob(), transparent: true, depthWrite: false, toneMapped: false, opacity: strength }));
  m.name = 'ContactShadow';
  m.rotation.x = -Math.PI / 2;
  m.scale.set(w, d, 1);
  m.position.y = 0.0006;
  m.renderOrder = 1;
  return m;
}
