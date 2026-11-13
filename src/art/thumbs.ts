/**
 * Pictures of the real instruments for the instrument cards: each model rendered once at start, lit like the desk,
 * three-quarter from above, into a small canvas the panel draws (the cards show the instruments, not symbols).
 */
import { Box3, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderTarget, type Texture, type WebGLRenderer } from '@iwsdk/core';
import { miniModel } from '../room/friend-seat.js';

const thumbs = new Map<string, HTMLCanvasElement>();
const waiting: (() => void)[] = [];

/** The picture of instrument `id`, once made. */
export function thumb(id: string): HTMLCanvasElement | undefined {
  return thumbs.get(id);
}
/** Run `fn` when the pictures are made (or now). */
export function whenThumbs(fn: () => void): void {
  if (thumbs.size) fn();
  else waiting.push(fn);
}

/** Make them (before the headset session: it renders to its own target and puts the renderer back). */
export function makeThumbs(renderer: WebGLRenderer, env: Texture | null, ids: readonly string[], size = 256): void {
  if (renderer.xr.isPresenting || typeof document === 'undefined') return;
  const rt = new WebGLRenderTarget(size, size, { samples: 4 });
  rt.texture.colorSpace = SRGBColorSpace;
  const px = new Uint8Array(size * size * 4);
  const before = renderer.getRenderTarget();
  const clear = renderer.getClearAlpha();
  for (const id of ids) {
    const scene = new Scene();
    scene.environment = env;
    const key = new DirectionalLight(0xfff3e4, 3.4);
    key.position.set(-0.4, 1, 0.6);
    const fill = new DirectionalLight(0xe6eeff, 1.4);
    fill.position.set(0.6, 0.5, 0.5);
    const top = new HemisphereLight(0xffffff, 0x404040, 1.2);
    scene.add(key, fill, top);
    const m = miniModel(id);
    scene.add(m.root);
    m.root.updateMatrixWorld(true);
    const box = new Box3().setFromObject(m.root);
    const c = box.getCenter(new Vector3());
    // framed by its width (they're all wide and low), from in front and well above, as you'd see it on a desk
    const sz = box.getSize(new Vector3());
    const cam = new PerspectiveCamera(30, 1, 0.01, 10);
    const dist = (Math.max(sz.x, sz.z) / 2 / Math.tan((30 / 2) * (Math.PI / 180))) * 1.02;
    cam.position.set(c.x, c.y + dist * 0.8, c.z + dist * 0.6);
    cam.lookAt(c);
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d')!;
    const img = g.createImageData(size, size);
    // (the target's rows run bottom up)
    for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    g.putImageData(img, 0, 0);
    thumbs.set(id, cv);
  }
  renderer.setRenderTarget(before);
  renderer.setClearAlpha(clear);
  rt.dispose();
  for (const fn of waiting.splice(0)) fn();
}
