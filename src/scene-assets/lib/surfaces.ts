/**
 * Procedural surface textures for the instruments, made from plain arrays (no canvas, no DOM: the asset manifest is
 * evaluated in the editor's realm too) and deterministic. Wood grain for lacquered shells and bars, a coated drum
 * head with its centre worn by sticks, the lathe rings turned into a cymbal, a fine grain for normal maps.
 */
import { ClampToEdgeWrapping, DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, RGBAFormat, SRGBColorSpace, UnsignedByteType } from '@iwsdk/core';

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) ^ Math.imul(s ^ (s >>> 13), 3266489917)) >>> 0) / 4294967296;
}

function tex(w: number, h: number, px: (x: number, y: number) => [number, number, number], srgb: boolean, wrap = true): DataTexture {
  const d = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = px(x, y);
      const i = (y * w + x) * 4;
      d[i] = Math.max(0, Math.min(255, r));
      d[i + 1] = Math.max(0, Math.min(255, g));
      d[i + 2] = Math.max(0, Math.min(255, b));
      d[i + 3] = 255;
    }
  const t = new DataTexture(d, w, h, RGBAFormat, UnsignedByteType);
  t.wrapS = t.wrapT = wrap ? RepeatWrapping : ClampToEdgeWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  if (srgb) t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

const cache = new Map<string, DataTexture>();
const once = (k: string, make: () => DataTexture) => cache.get(k) ?? (cache.set(k, make()), cache.get(k)!);

/** Wood grain (greyscale, multiplied into the material's colour): long streaks along u, figure and pores. */
export function woodGrain(seed = 7): DataTexture {
  return once(`wood${seed}`, () => {
    const r = rng(seed);
    const lines = Array.from({ length: 24 }, () => ({ y: r() * 64, a: 0.5 + r() * 1.5, f: 0.02 + r() * 0.05, p: r() * 6 }));
    return tex(256, 64, (x, y) => {
      let v = 0;
      for (const l of lines) {
        const yy = l.y + Math.sin(x * l.f + l.p) * l.a * 2;
        const d = Math.abs(((y - yy + 96) % 64) - 32);
        v += Math.exp(-d * d * 0.35) * 0.35;
      }
      const g = 205 - Math.min(1, v) * 70 + (r() - 0.5) * 10;
      return [g, g, g];
    }, true);
  });
}

/** A coated drum head (greyscale, multiplied into off-white): a fine mottle, and the centre a shade greyer where sticks land. */
export function headCoat(): DataTexture {
  return once('head', () => {
    const r = rng(11);
    return tex(128, 128, (x, y) => {
      const dx = (x - 63.5) / 64;
      const dy = (y - 63.5) / 64;
      const d = Math.hypot(dx, dy);
      const wear = Math.exp(-Math.pow((d - 0.22) / 0.12, 2)) * 45 + Math.exp(-Math.pow(d / 0.16, 2)) * 20;
      const g = 250 - wear + (r() - 0.5) * 9;
      return [g, g, g - 3];
    }, true, false);
  });
}

/** A fine grain for a normal map (the coating's tooth, a matte surface): small random tilts round flat. */
export function fineNormal(seed = 3, strength = 18): DataTexture {
  return once(`n${seed}:${strength}`, () => {
    const r = rng(seed);
    return tex(64, 64, () => [128 + (r() - 0.5) * strength, 128 + (r() - 0.5) * strength, 255], false);
  });
}

/**
 * The rings turned into a cymbal, along a lathe's v (the profile, centre to edge): a colour map (bright and dark
 * grooves, the bell left smooth) and a roughness map to match.
 */
export function cymbalRings(): { map: DataTexture; rough: DataTexture } {
  const map = once('rings', () =>
    tex(4, 1024, (_x, y) => {
      const v = y / 1023;
      const groove = 0.5 + 0.5 * Math.sin(v * 300) * (v > 0.12 && v < 0.88 ? 1 : 0.15);
      // (fine and faint: real lathe rings are a sheen, not stripes)
      const g = 222 + groove * 16;
      return [g, g * 0.93, g * 0.78];
    }, true),
  );
  const rough = once('ringsR', () =>
    tex(4, 1024, (_x, y) => {
      const v = y / 1023;
      const g = 90 + 22 * (0.5 + 0.5 * Math.sin(v * 300)) * (v > 0.12 && v < 0.88 ? 1 : 0.3);
      return [g, g, g];
    }, false),
  );
  return { map, rough };
}
