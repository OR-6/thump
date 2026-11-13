/**
 * Pitch zones (pure): where each note of an instrument lies on its surface, in the surface's own 2D
 * frame (x across, to the right as you face it; z up the surface for walls, doors and windows; on a
 * horizontal top, z points away from you). Zones sit around the spot of the first hit (it was in
 * reach), clamped into the surface (DESIGN.md §3.3). Pitches are in the current key, major pentatonic,
 * so anything you play sounds good.
 */
import type { Family } from './classify.js';

export interface Zone {
  /** Index on the surface. */
  i: number;
  shape: 'rect' | 'disc';
  x: number;
  z: number;
  /** Rect: width (x) and height (z). Disc: radius in w, h unused. */
  w: number;
  h: number;
  /** Scale degree (0 = the key's root in this instrument's register), or −1 when unpitched. */
  degree: number;
  /** MIDI note (unpitched: a nominal note the voice uses for its body). */
  midi: number;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const PENTA = [0, 2, 4, 7, 9];

/** MIDI for a scale degree above a root (degrees go on into the next octaves). */
export function degreeMidi(root: number, degree: number): number {
  const oct = Math.floor(degree / 5);
  const d = ((degree % 5) + 5) % 5;
  return root + oct * 12 + PENTA[d];
}

/** Each family's register: the MIDI note near which its degree 0 sits (bigger surface: lower). */
export function registerBase(family: Family, size: number): number {
  const s = Math.min(1, Math.max(0, size));
  switch (family) {
    case 'marimba':
      return 55 - Math.round(s * 7); // a big door goes down to G2..C3
    case 'glock':
      return 79 - Math.round(s * 5);
    case 'xylophone':
      return 72 - Math.round(s * 5);
    case 'harp':
      return 60 - Math.round(s * 7);
    case 'tubular':
      return 67 - Math.round(s * 7);
    case 'timpani':
      return 50 - Math.round(s * 7);
    case 'tongue':
      return 62 - Math.round(s * 7);
    case 'bowl':
      return 67 - Math.round(s * 10);
    case 'bell':
      return 79 - Math.round(s * 9);
    case 'gong':
      return 43 - Math.round(s * 9);
    case 'keys':
      return 60;
    case 'stomp':
      return 31;
    case 'kit':
      return 36;
    default:
      return 72;
  }
}

/** The MIDI of the key's root (pitch class `keyPc`, 0 = C) at or just above `base`. */
export function rootNear(base: number, keyPc: number): number {
  const pc = ((base % 12) + 12) % 12;
  return base + ((keyPc - pc + 12) % 12);
}

/** Lay out an instrument's zones on its surface around `anchor` (both in the surface's 2D frame). */
export function zonesFor(family: Family, b: Bounds, anchor: { x: number; z: number }, size: number, keyPc = 0): Zone[] {
  const { root, d0 } = startOf(family, size, keyPc);
  const out: Zone[] = [];
  const fit = (cx: number, cz: number, w: number, h: number) => ({
    x: clampSpan(cx, w, b.minX, b.maxX),
    z: clampSpan(cz, h, b.minZ, b.maxZ),
  });
  switch (family) {
    case 'xylophone':
    case 'marimba': {
      // 8 bars stacked up the surface, low at the bottom; higher bars a little shorter, like a real marimba
      // bars at least a hand apart (palm to fingertip lands ~9 cm along a door)
      const n = 8;
      const room = Math.max(0.5, Math.min(0.72, b.maxZ - b.minZ - 0.04));
      const step = room / n;
      const barH = Math.min(0.05, step * 0.62);
      const maxW = Math.max(0.2, Math.min(0.44, b.maxX - b.minX - 0.04));
      const c = fit(anchor.x, anchor.z, maxW, room);
      for (let i = 0; i < n; i++) {
        const w = maxW * (1 - (i / (n - 1)) * 0.3);
        out.push({ i, shape: 'rect', x: c.x, z: c.z - room / 2 + step * (i + 0.5), w, h: barH, degree: d0 + i, midi: degreeMidi(root, d0 + i) });
      }
      break;
    }
    case 'harp': {
      // 8 strings across, low on the left, longer at the bass end; a string is drawn thin but plays a hand wide
      const n = 8;
      const room = Math.max(0.5, Math.min(0.66, b.maxX - b.minX - 0.04));
      const step = room / n;
      const maxH = Math.max(0.2, Math.min(0.42, b.maxZ - b.minZ - 0.04));
      const c = fit(anchor.x, anchor.z, room, maxH);
      for (let i = 0; i < n; i++) {
        const h = maxH * (1 - (i / (n - 1)) * 0.45);
        out.push({ i, shape: 'rect', x: c.x - room / 2 + step * (i + 0.5), z: c.z - (maxH - h) / 2, w: Math.min(0.014, step * 0.25), h, degree: d0 + i, midi: degreeMidi(root, d0 + i) });
      }
      break;
    }
    case 'tubular': {
      // 6 hanging tubes across, longer for the low ones, tops level
      const n = 6;
      const room = Math.max(0.42, Math.min(0.56, b.maxX - b.minX - 0.04));
      const step = room / n;
      const maxH = Math.max(0.24, Math.min(0.5, b.maxZ - b.minZ - 0.04));
      const c = fit(anchor.x, anchor.z, room, maxH);
      for (let i = 0; i < n; i++) {
        const h = maxH * (1 - (i / (n - 1)) * 0.4);
        out.push({ i, shape: 'rect', x: c.x - room / 2 + step * (i + 0.5), z: c.z + (maxH - h) / 2, w: Math.min(0.045, step * 0.55), h, degree: d0 + i, midi: degreeMidi(root, d0 + i) });
      }
      break;
    }
    case 'timpani': {
      // two kettles side by side: the low one on the left, a fifth above on the right
      const r = 0.11 + 0.05 * Math.min(1, Math.max(0, size));
      const c = fit(anchor.x, anchor.z, r * 4.4, r * 2);
      for (let i = 0; i < 2; i++) out.push({ i, shape: 'disc', x: c.x + (i ? 1.1 : -1.1) * r, z: c.z, w: i ? r * 0.88 : r, h: 0, degree: d0 + i * 3, midi: degreeMidi(root, d0 + i * 3) });
      break;
    }
    case 'congas':
    case 'frame':
    case 'cajon':
    case 'slit': {
      // a set of drums: low to high, left to right (a cajón: its bass in the middle, its slap at the top edge)
      const n = family === 'congas' ? 3 : 2;
      const r = family === 'congas' ? 0.075 : family === 'frame' ? 0.11 : 0.085;
      const c = fit(anchor.x, anchor.z, family === 'cajon' ? r * 2 : r * 2.2 * n, family === 'cajon' ? r * 4.4 : r * 2);
      for (let i = 0; i < n; i++) {
        const k = i - (n - 1) / 2;
        const rr = r * (1 - i * 0.12);
        if (family === 'slit') out.push({ i, shape: 'rect', x: c.x + k * r * 2.3, z: c.z, w: r * 1.6, h: r * 0.9, degree: -1, midi: degreeMidi(root, d0) });
        else if (family === 'cajon') out.push({ i, shape: 'disc', x: c.x, z: c.z + k * r * 2.2, w: rr, h: 0, degree: -1, midi: degreeMidi(root, d0) });
        else out.push({ i, shape: 'disc', x: c.x + k * r * 2.2, z: c.z, w: rr, h: 0, degree: -1, midi: degreeMidi(root, d0) });
      }
      break;
    }
    case 'glock': {
      // 8 keys across the pane, low on the left; higher keys a little shorter
      // keys wider than a fingertip spread (index to ring is ~4 cm)
      const n = 8;
      // a window is seen from across the room: on a big pane the keys are big
      const room = Math.max(0.48, Math.min(0.8, b.maxX - b.minX - 0.04));
      const step = room / n;
      const keyW = Math.min(0.07, step * 0.7);
      const maxH = Math.max(0.07, Math.min(0.2, b.maxZ - b.minZ - 0.04, room * 0.26));
      const c = fit(anchor.x, anchor.z, room, maxH);
      for (let i = 0; i < n; i++) {
        const h = maxH * (1 - (i / (n - 1)) * 0.32);
        out.push({ i, shape: 'rect', x: c.x - room / 2 + step * (i + 0.5), z: c.z, w: keyW, h, degree: d0 + i, midi: degreeMidi(root, d0 + i) });
      }
      break;
    }
    case 'tongue':
    case 'bowl':
    case 'bell': {
      // tongues (or notes round a bowl's rim, or a cluster of chimes) in a ring, low at the bottom going round clockwise
      const n = family === 'tongue' ? 5 : family === 'bell' ? 5 : 6;
      const ring = family === 'tongue' ? 0.075 : family === 'bell' ? 0.065 : 0.085;
      const r = family === 'tongue' ? 0.033 : family === 'bell' ? 0.026 : 0.03;
      const c = fit(anchor.x, anchor.z, (ring + r) * 2, (ring + r) * 2);
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 - (i / n) * Math.PI * 2;
        out.push({ i, shape: 'disc', x: c.x + Math.cos(a) * ring, z: c.z + Math.sin(a) * ring, w: r, h: 0, degree: d0 + i, midi: degreeMidi(root, d0 + i) });
      }
      break;
    }
    case 'keys': {
      // the table marimba (see below)
      // the table marimba: eight bars drawn on the wood, running toward you, low on the left, a hand wide
      for (let i = 0; i < 8; i++) {
        const len = 0.1 - i * 0.005;
        out.push({ i, shape: 'rect', x: anchor.x + (i - 3.5) * 0.066, z: anchor.z, w: 0.05, h: len, degree: d0 + i, midi: degreeMidi(root, d0 + i) });
      }
      break;
    }
    case 'gong': {
      const r = 0.2 + 0.16 * Math.min(1, Math.max(0, size));
      const c = fit(anchor.x, anchor.z, r * 2, r * 2);
      out.push({ i: 0, shape: 'disc', x: c.x, z: c.z, w: r, h: 0, degree: -1, midi: degreeMidi(root, d0) });
      break;
    }
    default: {
      const r = family === 'stomp' ? 0.22 : family === 'shaker' || family === 'tambourine' ? 0.12 : family === 'triangle' ? 0.07 : 0.08;
      const c = fit(anchor.x, anchor.z, r * 2, r * 2);
      out.push({ i: 0, shape: 'disc', x: c.x, z: c.z, w: r, h: 0, degree: -1, midi: degreeMidi(root, d0) });
    }
  }
  return out;
}

/**
 * Where an instrument's lowest note sits: the key's root an octave or so below the size's register, and
 * the scale degree whose note is nearest that register (so a bigger surface really is lower, step by
 * step, not only in octave jumps).
 */
export function startOf(family: Family, size: number, keyPc: number): { root: number; d0: number } {
  const base = registerBase(family, size);
  const root = rootNear(base, keyPc) - 12;
  let d0 = 0;
  let best = Infinity;
  for (let d = 0; d < 10; d++) {
    const m = degreeMidi(root, d);
    if (Math.abs(m - base) < best) {
      best = Math.abs(m - base);
      d0 = d;
    }
  }
  return { root, d0 };
}

/** Re-pitch zones into another key (a song's), keeping each zone's place in the scale. */
export function retune(zones: Zone[], family: Family, size: number, keyPc: number): void {
  const { root, d0 } = startOf(family, size, keyPc);
  zones.forEach((z, i) => {
    if (z.degree < 0) return;
    z.degree = d0 + i;
    z.midi = degreeMidi(root, z.degree);
  });
}

/** The zone a song's scale degree lands on: the zone with that degree, else the same note an octave over. */
export function zoneForDegree(zones: readonly Zone[], degree: number): number {
  if (zones.length <= 1 || degree < 0) return 0;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < zones.length; i++) {
    const zd = zones[i].degree;
    if (zd < 0) continue;
    // same pitch class (degree mod 5) first, then nearest
    const same = ((zd - degree) % 5 + 5) % 5 === 0;
    const d = Math.abs(zd - degree) + (same ? 0 : 100);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Which zone a hit at (x, z) plays: the one it lands in, else the nearest (the whole surface is the
 * instrument; the zones say where each note is). −1 only for no zones.
 */
export function zoneAt(zones: readonly Zone[], x: number, z: number): number {
  let best = -1;
  let bestD = Infinity;
  for (let k = 0; k < zones.length; k++) {
    const q = zones[k];
    let d: number;
    if (q.shape === 'disc') d = Math.max(0, Math.hypot(x - q.x, z - q.z) - q.w);
    else d = Math.hypot(Math.max(0, Math.abs(x - q.x) - q.w / 2), Math.max(0, Math.abs(z - q.z) - q.h / 2));
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

/** Centre a span of `len` on `c` inside [lo, hi] (centred in it when it doesn't fit). */
function clampSpan(c: number, len: number, lo: number, hi: number): number {
  if (hi - lo <= len) return (lo + hi) / 2;
  return Math.min(hi - len / 2, Math.max(lo + len / 2, c));
}
