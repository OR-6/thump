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
      const wear = Math.exp(-Math.pow((d - 0.22) / 0.12, 2)) * 6 + Math.exp(-Math.pow(d / 0.16, 2)) * 4;
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
      // (v is the distance from the centre, 0 to the edge 1: the bell smooth, then fine lathe rings to the edge)
      const v = y / 1023;
      const groove = Math.sin(v * 600) * (v > 0.22 ? 1 : 0.15);
      // (fine and faint: real lathe rings are a sheen, not stripes)
      const g = 228 + groove * 3;
      return [g, g * 0.9, g * 0.68];
    }, true),
  );
  const rough = once('ringsR', () =>
    tex(4, 1024, (_x, y) => {
      const v = y / 1023;
      // (the lathe rings live in the sheen: the metal about 0.3 rough, the grooves a little rougher)
      const g = 77 + 16 * Math.sin(v * 600) * (v > 0.22 ? 1 : 0.3);
      return [g, g, g];
    }, false),
  );
  return { map, rough };
}

/**
 * Hammered steel (a normal map): shallow round dimples about 8 mm across, packed unevenly, the way a handpan's shell
 * is hammered. Tiles; repeat it to the size wanted.
 */
export function hammered(): DataTexture {
  return once('hammered', () => {
    const r = rng(23);
    const N = 128;
    const cells = Array.from({ length: 70 }, () => ({ x: r() * N, y: r() * N }));
    return tex(N, N, (x, y) => {
      // the nearest dimple's centre (wrapping), and the slope toward it
      let best = 1e9;
      let dx = 0;
      let dy = 0;
      for (const c of cells)
        for (const ox of [-N, 0, N])
          for (const oy of [-N, 0, N]) {
            const ex = x - (c.x + ox);
            const ey = y - (c.y + oy);
            const d = ex * ex + ey * ey;
            if (d < best) {
              best = d;
              dx = ex;
              dy = ey;
            }
          }
      const k = Math.sqrt(best) / 9;
      const s = Math.min(1, k) * 4;
      const len = Math.sqrt(best) || 1;
      return [128 + (dx / len) * s, 128 + (dy / len) * s, 245];
    }, false);
  });
}

/** An electronic drum's mesh head (greyscale): a fine woven grid, the threads a shade lighter than the gaps. */
export function meshWeave(): DataTexture {
  return once('weave', () =>
    tex(64, 64, (x, y) => {
      const a = (x % 4 < 2) !== (y % 4 < 2) ? 1 : 0;
      const g = 60 + a * 38 + ((x * 7 + y * 13) % 5);
      return [g, g, g];
    }, true),
  );
}

/** Carbon fibre (greyscale): a 2x2 twill, each tow a band with a sheen across it, so it catches light as you move. */
export function carbonTwill(): DataTexture {
  return once('carbon', () =>
    tex(64, 64, (x, y) => {
      const t = Math.floor(x / 8) + Math.floor(y / 8);
      const along = t % 2 === 0 ? (x % 8) / 8 : (y % 8) / 8;
      const g = 34 + 30 * Math.sin(along * Math.PI) + (t % 4 < 2 ? 6 : 0);
      return [g, g, g + 3];
    }, true),
  );
}

/** Rawhide (greyscale, multiplied into the hide's colour): fibrous mottle and a few darker blotches. */
export function rawhide(): DataTexture {
  return once('rawhide', () => {
    const r = rng(31);
    const spots = Array.from({ length: 9 }, () => ({ x: r() * 128, y: r() * 128, s: 6 + r() * 14 }));
    return tex(128, 128, (x, y) => {
      let g = 232 + (r() - 0.5) * 14 + Math.sin(x * 0.9 + Math.sin(y * 0.21) * 3) * 4;
      for (const p of spots) {
        const d = Math.hypot(x - p.x, y - p.y) / p.s;
        if (d < 1) g -= 34 * (1 - d * d);
      }
      return [g, g, g];
    }, true);
  });
}

/** Tortoiseshell (colour): mottled amber and dark brown in soft drifting patches. */
export function tortoiseShell(): DataTexture {
  return once('tortoise', () =>
    tex(128, 128, (x, y) => {
      const n = Math.sin(x * 0.11 + Math.sin(y * 0.07) * 2.2) + Math.sin(y * 0.13 + Math.sin(x * 0.05) * 2.6) + 0.5 * Math.sin((x + y) * 0.31);
      const k = Math.max(0, Math.min(1, (n + 1.2) / 2.6));
      return [58 + k * 120, 24 + k * 60, 10 + k * 22];
    }, true),
  );
}

/** Straight-grained wood (greyscale): long, nearly straight lines along u, with fine dark pores (3 %). */
export function straightGrain(seed = 9): DataTexture {
  return once(`straight${seed}`, () => {
    const r = rng(seed);
    const lines = Array.from({ length: 28 }, () => ({ y: r() * 64, a: 0.15 + r() * 0.45, f: 0.01 + r() * 0.02, p: r() * 6 }));
    return tex(512, 64, (x, y) => {
      let v = 0;
      for (const l of lines) {
        const yy = l.y + Math.sin(x * l.f + l.p) * l.a * 2;
        const d = Math.abs(((y - yy + 96) % 64) - 32);
        v += Math.exp(-d * d * 0.4) * 0.32;
      }
      let g = 210 - Math.min(1, v) * 62 + (r() - 0.5) * 8;
      if (r() < 0.03) g -= 60;
      return [g, g, g];
    }, true);
  });
}

/** An old jazz cymbal's face (colour): the same fine lathe sheen, with a patina of darker spots over a fifth of it. */
export function cymbalPatina(): DataTexture {
  return once('patina', () => {
    const r = rng(53);
    const spots = Array.from({ length: 40 }, () => ({ u: r() * 128, v: 30 + r() * 220, s: 3 + r() * 9 }));
    return tex(128, 256, (x, y) => {
      const v = y / 255;
      let g = 226 + Math.sin(v * 600) * 3 * (v > 0.22 ? 1 : 0.15);
      for (const p of spots) {
        const du = Math.min(Math.abs(x - p.u), 128 - Math.abs(x - p.u));
        const d = Math.hypot(du, (y - p.v) * 0.6) / p.s;
        if (d < 1) g -= 70 * (1 - d * d);
      }
      return [g, g * 0.88, g * 0.66];
    }, true);
  });
}
