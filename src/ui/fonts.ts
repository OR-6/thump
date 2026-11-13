/**
 * Bundled display fonts (SIL Open Font License 1.1, unmodified, licences in
 * public/fonts). Lilita One (Toy) loads before the world starts; Fraunces
 * (Workshop) loads on demand. Both fall back to system fonts on timeout.
 */
const FILES: Record<string, string> = {
  'Lilita One': 'fonts/LilitaOne-Regular.ttf',
  Fraunces: 'fonts/Fraunces-SoftSemiBold.ttf',
};

const pending = new Map<string, Promise<boolean>>();

/** Load a bundled font family once; resolves false on failure or timeout. */
export function loadFont(family: keyof typeof FILES | string, timeoutMs = 1500): Promise<boolean> {
  const file = FILES[family];
  if (!file) return Promise.resolve(false);
  let p = pending.get(family);
  if (!p) {
    p = (async () => {
      try {
        const face = new FontFace(family, `url(${import.meta.env.BASE_URL}${file})`);
        document.fonts.add(await face.load());
        return true;
      } catch {
        return false;
      }
    })();
    pending.set(family, p);
  }
  const timeout = new Promise<boolean>((r) => setTimeout(() => r(false), timeoutMs));
  return Promise.race([p, timeout]);
}

/** Fonts needed before the first frame. */
export function loadFonts(): Promise<boolean> {
  return loadFont('Lilita One');
}
