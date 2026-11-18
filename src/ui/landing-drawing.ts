/**
 * The desk from above, for the 2D page: each instrument drawn in plan view at its real size, straight from the
 * game's own layouts (shelf.ts, config.ts), so the page can't drift from what's on the desk. SVG in centimetres:
 * x to the right, y towards you (the game's z, flipped). Every playable part is a `.part` with a `data-part` and a
 * `.glow` copy of its shape that flashes when it's hit.
 *
 * Flat and filled in the instruments' own colours (docs/SITE-DESIGN.md): every shape carries a material class
 * (`m-head`, `m-brass`, `m-rosewood`…) that index.html fills from a `--i-*` custom property on :root, so no colour
 * lives here. Strokes are in CSS pixels (`vector-effect: non-scaling-stroke`), so a drum and a key carry the same
 * weight of line at any size.
 */
import { PADS } from '../config.js';
import { CONGA, KEYBOARD, NECK, PIANO_CHORD, marimbaZones, handpanZones, pianoBlacks, pianoZones, scaleById, type InstId } from '../kit/shelf.js';

/** The page plays in C, the happy scale (a pentatonic: every key works with every other). */
export const PAGE_SCALE = scaleById('happy');
export const PAGE_ROOT = { piano: 60, marimba: 60, handpan: 48, guitar: 48 } as const;

/** The drawing's window onto the desk, in cm (the same for every instrument, so they compare at one scale). */
export const VIEW = { x: -32, y: -18, w: 64, h: 34 } as const;
/** The full drum kit needs a desk, not a tray. */
const DESK = { x: -62, y: -34, w: 124, h: 64 } as const;
export const viewFor = (id: InstId): { x: number; y: number; w: number; h: number } => (id === 'drums' ? DESK : VIEW);

const cm = (m: number) => +(m * 100).toFixed(2);

interface Part {
  id: string;
  label: string;
  /** The shapes you see. */
  body: string;
  /** The same outline, flashed on a hit. */
  glow: string;
  /** Drawn light (the piano's white keys): its flash is dark. */
  pale?: boolean;
}
const part = (p: Part) =>
  `<g class="part${p.pale ? ' pale' : ''}" data-part="${p.id}" role="button" tabindex="0" aria-label="${p.label}">${p.body}<g class="glow" aria-hidden="true">${p.glow}</g></g>`;
const circle = (x: number, y: number, r: number, attrs = '') => `<circle cx="${x}" cy="${y}" r="${r}" ${attrs}/>`;
const rect = (x: number, y: number, w: number, h: number, attrs = '') => `<rect x="${+x.toFixed(2)}" y="${+y.toFixed(2)}" width="${+w.toFixed(2)}" height="${+h.toFixed(2)}" ${attrs}/>`;
const line = (x1: number, y1: number, x2: number, y2: number, attrs: string) => `<line x1="${+x1.toFixed(2)}" y1="${+y1.toFixed(2)}" x2="${+x2.toFixed(2)}" y2="${+y2.toFixed(2)}" ${attrs}/>`;

/** A shape's material (index.html colours each from a `--i-*` property). */
const M = (name: string) => `class="m-${name}"`;
const CHROME = M('chrome');

function lugs(x: number, y: number, r: number, n: number, size: number): string {
  let s = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / n;
    s += circle(+(x + Math.cos(a) * r).toFixed(2), +(y + Math.sin(a) * r).toFixed(2), size, CHROME);
  }
  return s;
}

function drums(): string {
  // the whole kit from above, every piece where the game puts it: the drums' heads in their hoops and lugs, the
  // three cymbals with their lathe grooves and bells
  // (the shells as the game paints them: a red kit, the snare in white)
  const DRUM: { lane: 'kick' | 'snare' | 'tom' | 'floor'; label: string; lugs: number; shell: string }[] = [
    { lane: 'kick', label: 'Bass drum', lugs: 10, shell: 'shell' },
    { lane: 'snare', label: 'Snare drum', lugs: 8, shell: 'chrome' },
    { lane: 'tom', label: 'Rack tom', lugs: 6, shell: 'shell' },
    { lane: 'floor', label: 'Floor tom', lugs: 8, shell: 'shell' },
  ];
  const CYM: { lane: 'hat' | 'crash' | 'ride'; label: string }[] = [
    { lane: 'hat', label: 'Hi-hat' },
    { lane: 'crash', label: 'Crash' },
    { lane: 'ride', label: 'Ride' },
  ];
  let s = '';
  for (const c of DRUM) {
    const p = PADS[c.lane];
    const x = cm(p.x), y = -cm(p.z), r = cm(p.size / 2);
    s += part({
      id: c.lane, label: c.label,
      body: lugs(x, y, r + 0.9, c.lugs, 0.55) + circle(x, y, r + 0.1, M(c.shell)) + circle(x, y, +(r - 1.1).toFixed(2), M('head')),
      glow: circle(x, y, r + 0.1),
    });
  }
  for (const c of CYM) {
    const p = PADS[c.lane];
    const x = cm(p.x), y = -cm(p.z), r = cm(p.size / 2);
    let grooves = '';
    for (let i = 1; i <= 3; i++) grooves += circle(x, y, +(r * (0.38 + i * 0.17)).toFixed(2), M('groove'));
    s += part({
      id: c.lane, label: c.label,
      body: circle(x, y, r, M('brass')) + grooves + circle(x, y, +(r * 0.27).toFixed(2), M('brass')) + circle(x, y, 0.6, CHROME),
      glow: circle(x, y, r),
    });
  }
  return s;
}

function piano(): string {
  const K = KEYBOARD;
  const zones = pianoZones(PAGE_ROOT.piano, PAGE_SCALE);
  const whites = zones.filter((z) => z.i < PIANO_CHORD);
  const chord = zones.find((z) => z.i === PIANO_CHORD)!;
  const back = -cm(K.front + K.len); // the far end of the keys
  const front = -cm(K.front);
  // the case round the keys, the felt strip at the back as a line
  const kx = cm(whites[0].x - whites[0].w / 2);
  // (the case round the keys and the chord pad, from where they are: they grew to 28 mm keys)
  const x0 = cm(chord.x) - cm(chord.w) * 0.75 - 2.5;
  const x1 = kx + cm(K.pitch * whites.length) + 1.5;
  let s = rect(x0, back - 3.6, x1 - x0, front - back + 5.4, M('case'));
  s += line(kx, back - 1, kx + cm(K.pitch * whites.length), back - 1, M('felt'));
  const names = ['C', 'D', 'E', 'G', 'A'];
  for (const z of whites) {
    const x = cm(z.x - z.w / 2), w = cm(z.w);
    s += part({
      id: `w${z.i}`, label: `Piano key ${names[z.i % 5]}`, pale: true,
      body: rect(x, back, w, front - back, M('key')),
      glow: rect(x, back, w, front - back),
    });
  }
  for (const b of pianoBlacks(zones)) {
    const x = cm(b.x - b.w / 2), y = -cm(b.z + b.h / 2);
    s += part({
      id: `b${b.a}-${b.b}`, label: `Black key: ${names[b.a % 5]} and ${names[b.b % 5]} together`,
      body: rect(x, y, cm(b.w), cm(b.h), M('bkey')),
      glow: rect(x, y, cm(b.w), cm(b.h)),
    });
  }
  const cx = cm(chord.x), cy = -cm(chord.z), cr = cm(chord.w) * 0.75;
  s += part({
    id: 'chord', label: 'Chord button',
    body: circle(cx, cy, +(cr + 0.35).toFixed(2), M('bkey')) + circle(cx, cy, +(cr * 0.45).toFixed(2), CHROME),
    glow: circle(cx, cy, +(cr + 0.35).toFixed(2)),
  });
  return s;
}

function marimba(): string {
  const zones = marimbaZones(PAGE_ROOT.marimba, PAGE_SCALE);
  const first = zones[0], last = zones[zones.length - 1];
  const y0 = -cm(first.z);
  // the two rails run under the bars' nodes (about a fifth in from each end), closer together as the bars shorten
  const node = (z: (typeof zones)[number], side: 1 | -1) => +(y0 + side * cm(z.h) * 0.28).toFixed(2);
  const xl = cm(first.x - first.w / 2) - 1.4, xr = cm(last.x + last.w / 2) + 1.4;
  let s = '';
  for (const side of [-1, 1] as const) s += line(xl, node(first, side), xr, node(last, side), M('rail'));
  const names = ['C', 'D', 'E', 'G', 'A', 'C', 'D', 'E'];
  for (const z of zones) {
    const x = cm(z.x - z.w / 2), w = cm(z.w), h = cm(z.h), y = y0 - h / 2;
    s += part({
      id: `m${z.i}`, label: `Marimba bar ${names[z.i]}`,
      body: rect(x, y, w, h, M('rosewood')) + circle(x + w / 2, node(z, -1), 0.35, CHROME) + circle(x + w / 2, node(z, 1), 0.35, CHROME),
      glow: rect(x, y, w, h),
    });
  }
  return s;
}

/** Where the neck runs and where you strum (the strum part covers the soundhole and the strings over the body). */
const G = { y: -cm(NECK.z), nut: -25, bridge: 19.5 } as const;
export const GUITAR_CHORDS = ['C', 'A minor', 'F'] as const;

function guitar(): string {
  const y = G.y;
  // a closed outline: the top half from the neck end round to the tail (upper bout, waist, lower bout), then the
  // same mirrored back
  const half: [number, number][][] = [
    [[-6.5, -5], [-4.5, -8.6], [0.5, -8.6]],
    [[4.5, -8.6], [6.5, -6.4], [9, -6.4]],
    [[11.5, -6.4], [13, -10.8], [19, -10.8]],
    [[25, -10.8], [27.5, -6.5], [27.5, 0]],
  ];
  const seg = (ps: [number, number][], s: number) => `C ${ps.map(([px, py]) => `${px} ${+(y + s * py).toFixed(2)}`).join(' ')}`;
  const back = half.map((c, i) => [c[1], c[0], i === 0 ? ([-6.5, 0] as [number, number]) : half[i - 1][2]]).reverse();
  const outline = `M -6.5 ${y} ${half.map((c) => seg(c, 1)).join(' ')} ${back.map((c) => seg(c, -1)).join(' ')} Z`;
  let s = `<path d="${outline}" ${M('spruce')}/>`;
  s += circle(4, y, 3.6, M('rosette')) + circle(4, y, 2.9, M('hole'));
  // headstock and fretboard
  s += `<path d="M ${G.nut} ${y - 2.6} L ${G.nut - 6.5} ${y - 3.2} L ${G.nut - 6.5} ${y + 3.2} L ${G.nut} ${y + 2.6} Z" ${M('board')}/>`;
  for (let i = 0; i < 3; i++) s += circle(G.nut - 1.8 - i * 1.7, y - 2.4, 0.45, CHROME) + circle(G.nut - 1.8 - i * 1.7, y + 2.4, 0.45, CHROME);
  s += rect(G.nut, y - 2.6, -2 - G.nut, 5.2, M('board'));
  for (const fx of [-22.6, -19.9, -17.4, -15.1, -12.9, -11.1, -9.4, -7.8, -6.3, -4.9, -3.6]) s += line(fx, y - 2.6, fx, y + 2.6, M('fret'));
  s += rect(18.6, y - 4.2, 1.8, 8.4, M('board'));
  // strings: nylon on the treble side, wound on the bass side (the low string nearest you, as it lies on the desk)
  for (let i = 0; i < 6; i++) {
    const sy = +(y + (i - 2.5) * 1.1).toFixed(2);
    s += line(G.nut, sy, G.bridge, sy, `class="m-string${i >= 3 ? ' wound' : ''}"`);
  }
  // the strum: over the soundhole and the strings on the body
  s += part({
    id: 'strum', label: 'Strum the strings',
    body: rect(-1, y - 6.5, 22, 13, 'fill="transparent"'),
    glow: rect(-1, y - 3.3, 20.5, 6.6),
  });
  // the three chord positions on the neck, like frets
  NECK.x.forEach((nx, c) => {
    const x = cm(nx - NECK.w / 2), w = cm(NECK.w);
    s += part({
      id: `g${c}`, label: `Hold ${GUITAR_CHORDS[c]} and strum`,
      body: rect(x, y - 3.5, w, 7, 'fill="transparent"') + circle(x + w / 2, y, 0.9, 'class="held"'),
      glow: rect(x, y - 2.6, w, 5.2),
    });
  });
  return s;
}

function congas(): string {
  let s = '';
  for (let d = 0; d < 2; d++) {
    const x = cm(CONGA.x[d]), y = -cm(CONGA.z), r = cm(CONGA.r[d]);
    const name = d === 0 ? 'low' : 'high';
    const open = +(r * CONGA.open).toFixed(2);
    s += lugs(x, y, r + 1.3, 6, 0.6) + circle(x, y, r + 0.25, CHROME);
    // the edge (a slap) is the ring outside the dashed line, the middle (open) inside it
    s += part({
      id: `c${d * 2 + 1}`, label: `Edge of the ${name} conga (slap)`,
      body: circle(x, y, r - 0.2, M('skin')) + circle(x, y, open, M('dash')),
      glow: circle(x, y, +(r * 0.8).toFixed(2), `fill="none" stroke-width="${(r * 0.4).toFixed(2)}" class="band"`),
    });
    s += part({
      id: `c${d * 2}`, label: `Middle of the ${name} conga (open)`,
      body: circle(x, y, open, 'fill="transparent"'),
      glow: circle(x, y, open),
    });
  }
  return s;
}

function handpan(): string {
  const zones = handpanZones(PAGE_ROOT.handpan, PAGE_SCALE);
  const cx = 0, cy = -cm(zones[0].z);
  let s = circle(cx, cy, 14.4, M('bronze'));
  const names = ['C', 'D', 'E', 'G', 'A'];
  for (const z of zones) {
    const x = cm(z.x), y = -cm(z.z), r = cm(z.w);
    const ding = z.i === 0;
    const ell = (attrs: string) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${+(r * (ding ? 1 : 0.86)).toFixed(2)}" ${attrs}/>`;
    s += part({
      id: `h${z.i}`, label: ding ? 'Handpan, the low note in the middle' : `Handpan note ${names[((z.degree % 5) + 5) % 5]}`,
      body: ell(M('note')) + circle(x, y, +(r * 0.36).toFixed(2), M('dimple')),
      glow: ell(''),
    });
  }
  return s;
}

const DRAW: Record<InstId, () => string> = { drums, piano, marimba, guitar, congas, handpan };

/** The whole drawing: the instrument alone (the page draws its one frame). `.inst-pos` is centred once it's on the page. */
export function deskSvg(id: InstId, title: string): string {
  const v = viewFor(id);
  return `<svg class="desk-svg" viewBox="${v.x} ${v.y} ${v.w} ${v.h}" role="group" aria-label="${title}, seen from above">
  <g class="inst-pos"><g class="inst">${DRAW[id]()}</g></g></svg>`;
}

/** Centre the instrument in the frame. */
export function centreOnTray(svg: SVGSVGElement): void {
  const g = svg.querySelector<SVGGElement>('.inst-pos');
  if (!g) return;
  const b = g.getBBox();
  if (!b.width) return;
  const v = DESK.w === Number(svg.getAttribute('viewBox')?.split(' ')[2]) ? DESK : VIEW;
  const tx = v.x + v.w / 2 - (b.x + b.width / 2);
  const ty = v.y + v.h / 2 - (b.y + b.height / 2);
  g.setAttribute('transform', `translate(${tx.toFixed(2)} ${ty.toFixed(2)})`);
}
