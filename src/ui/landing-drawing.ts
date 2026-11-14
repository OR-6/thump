/**
 * The desk from above, for the 2D page: each instrument drawn in plan view at its real size, straight from the
 * game's own layouts (shelf.ts, config.ts), so the page can't drift from what's on the desk. SVG in centimetres:
 * x to the right, y towards you (the game's z, flipped). Every playable part is a `.part` with a `data-part` and a
 * `.glow` copy of its shape that lights in the instrument's colour when it's hit.
 */
import { PADS } from '../config.js';
import { CONGA, KEYBOARD, NECK, PIANO_CHORD, SHELF, marimbaZones, handpanZones, pianoBlacks, pianoZones, scaleById, type InstId } from '../kit/shelf.js';

/** The page plays in C, the happy scale (a pentatonic: every key works with every other). */
export const PAGE_SCALE = scaleById('happy');
export const PAGE_ROOT = { piano: 60, marimba: 60, handpan: 48, guitar: 48 } as const;

/** The drawing's window onto the desk, in cm (the same for every instrument, so they compare at one scale). */
export const VIEW = { x: -32, y: -18, w: 64, h: 34 } as const;
/** The full drum kit needs a desk, not a tray. */
const DESK = { x: -62, y: -32, w: 124, h: 58 } as const;
export const viewFor = (id: InstId): { x: number; y: number; w: number; h: number } => (id === 'drums' ? DESK : VIEW);

const cm = (m: number) => +(m * 100).toFixed(2);
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

interface Part {
  id: string;
  label: string;
  /** The shapes you see. */
  body: string;
  /** The same outline, filled with the light colour on a hit. */
  glow: string;
  light: string;
}
const part = (p: Part) =>
  `<g class="part" data-part="${p.id}" role="button" tabindex="0" aria-label="${p.label}" style="--light:${p.light}">${p.body}<g class="glow" aria-hidden="true">${p.glow}</g></g>`;
const circle = (x: number, y: number, r: number, attrs = '') => `<circle cx="${x}" cy="${y}" r="${r}" ${attrs}/>`;
const rect = (x: number, y: number, w: number, h: number, attrs = '') => `<rect x="${+x.toFixed(2)}" y="${+y.toFixed(2)}" width="${+w.toFixed(2)}" height="${+h.toFixed(2)}" ${attrs}/>`;

const light = (id: InstId) => hex(SHELF.find((d) => d.id === id)?.color ?? 0xffffff);

function lugs(x: number, y: number, r: number, n: number, size: number, fill: string): string {
  let s = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / n;
    s += circle(+(x + Math.cos(a) * r).toFixed(2), +(y + Math.sin(a) * r).toFixed(2), size, `fill="${fill}"`);
  }
  return s;
}

function drums(): string {
  // the whole kit from above, every piece where the game puts it: the drums' coated heads in their hoops and lugs,
  // the three cymbals in brass
  const DRUM: { lane: 'kick' | 'snare' | 'tom' | 'floor'; label: string; lugs: number }[] = [
    { lane: 'kick', label: 'Bass drum', lugs: 10 },
    { lane: 'snare', label: 'Snare drum', lugs: 8 },
    { lane: 'tom', label: 'Rack tom', lugs: 6 },
    { lane: 'floor', label: 'Floor tom', lugs: 8 },
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
      id: c.lane, label: c.label, light: hex(p.color),
      body: lugs(x, y, r + 0.35, c.lugs, 0.45, '#8c9297') + circle(x, y, r + 0.1, 'fill="#9aa1a6"') + circle(x, y, r - 0.45, 'fill="url(#coated)"'),
      glow: circle(x, y, r + 0.1),
    });
  }
  for (const c of CYM) {
    const p = PADS[c.lane];
    const x = cm(p.x), y = -cm(p.z), r = cm(p.size / 2);
    let rings = '';
    for (let i = 1; i <= 7; i++) rings += circle(x, y, +(r * (0.3 + i * 0.095)).toFixed(2), 'fill="none" stroke="#8a6424" stroke-opacity="0.45" stroke-width="0.12"');
    s += part({
      id: c.lane, label: c.label, light: hex(p.color),
      body: circle(x, y, r, 'fill="url(#brass)"') + rings + circle(x, y, r * 0.27, 'fill="#c99a48" stroke="#8a6424" stroke-width="0.15"') + circle(x, y, 0.45, 'fill="#55575a"'),
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
  let s = rect(-20.5, back - 3.6, 41, front - back + 5.4, 'rx="1.2" fill="#3a271f"');
  s += rect(-20.5, back - 3.6, 41, 0.6, 'rx="0.3" fill="#4a3329"');
  s += rect(cm(whites[0].x - whites[0].w / 2) - 0.2, back - 1.3, cm(K.pitch * whites.length) + 0.3, 1.3, 'fill="#7c1f1a"');
  const names = ['C', 'D', 'E', 'G', 'A'];
  for (const z of whites) {
    const x = cm(z.x - z.w / 2), w = cm(z.w);
    s += part({
      id: `w${z.i}`, label: `Piano key ${names[z.i % 5]}`, light: light('piano'),
      body: rect(x, back, w, front - back, 'rx="0.25" fill="#f6f3ea" stroke="#cbc4b4" stroke-width="0.1"'),
      glow: rect(x, back, w, front - back, 'rx="0.25"'),
    });
  }
  for (const b of pianoBlacks(zones)) {
    const x = cm(b.x - b.w / 2), y = -cm(b.z + b.h / 2);
    s += part({
      id: `b${b.a}-${b.b}`, label: `Black key: ${names[b.a % 5]} and ${names[b.b % 5]} together`, light: light('piano'),
      body: rect(x, y, cm(b.w), cm(b.h), 'rx="0.2" fill="#1c1a19"') + rect(x + 0.15, y + cm(b.h) - 0.9, cm(b.w) - 0.3, 0.7, 'rx="0.15" fill="#2c2927"'),
      glow: rect(x, y, cm(b.w), cm(b.h), 'rx="0.2"'),
    });
  }
  const cx = cm(chord.x), cy = -cm(chord.z), cr = cm(chord.w) * 0.75;
  s += part({
    id: 'chord', label: 'Chord button', light: light('piano'),
    body: circle(cx, cy, cr + 0.35, 'fill="#22160f"') + circle(cx, cy, cr, 'fill="#c3302a"') + circle(cx - 0.35, cy - 0.35, cr * 0.45, 'fill="#d9524a"'),
    glow: circle(cx, cy, cr + 0.35),
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
  for (const side of [-1, 1] as const)
    s += `<line x1="${xl}" y1="${node(first, side)}" x2="${xr}" y2="${node(last, side)}" stroke="#241913" stroke-width="1.1" stroke-linecap="round"/>`;
  const names = ['C', 'D', 'E', 'G', 'A', 'C', 'D', 'E'];
  for (const z of zones) {
    const x = cm(z.x - z.w / 2), w = cm(z.w), h = cm(z.h), y = y0 - h / 2;
    s += part({
      id: `m${z.i}`, label: `Marimba bar ${names[z.i]}`, light: light('marimba'),
      body: rect(x, y, w, h, 'rx="0.5" fill="url(#rosewood)"') + rect(x + 0.5, y + 0.6, w - 1, h - 1.2, 'rx="0.4" fill="none" stroke="#a4573f" stroke-opacity="0.35" stroke-width="0.12"') +
        circle(x + w / 2, node(z, -1), 0.28, 'fill="#d8c39b"') + circle(x + w / 2, node(z, 1), 0.28, 'fill="#d8c39b"'),
      glow: rect(x, y, w, h, 'rx="0.5"'),
    });
  }
  return s;
}

/** Where the neck runs and where you strum (the strum part covers the soundhole and the strings over the body). */
const G = { y: -cm(NECK.z), nut: -25, bridge: 19.5 } as const;
export const GUITAR_CHORDS = ['C', 'A minor', 'F'] as const;

function guitar(): string {
  const y = G.y;
  // a closed outline: the top half out to the tail, then the bottom half back
  // the top half from the neck end round to the tail (upper bout, waist, lower bout), then the same mirrored back
  const half: [number, number][][] = [
    [[-6.5, -5], [-4.5, -8.6], [0.5, -8.6]],
    [[4.5, -8.6], [6.5, -6.4], [9, -6.4]],
    [[11.5, -6.4], [13, -10.8], [19, -10.8]],
    [[25, -10.8], [27.5, -6.5], [27.5, 0]],
  ];
  const seg = (ps: [number, number][], s: number) => `C ${ps.map(([px, py]) => `${px} ${+(y + s * py).toFixed(2)}`).join(' ')}`;
  const back = half.map((c, i) => [c[1], c[0], i === 0 ? ([-6.5, 0] as [number, number]) : half[i - 1][2]]).reverse();
  const outline = `M -6.5 ${y} ${half.map((c) => seg(c, 1)).join(' ')} ${back.map((c) => seg(c, -1)).join(' ')} Z`;
  let s = `<path d="${outline}" fill="url(#spruce)" stroke="#5a3a24" stroke-width="0.6"/>`;
  s += circle(4, y, 3.6, 'fill="none" stroke="#6b4a2c" stroke-width="0.5"') + circle(4, y, 2.9, 'fill="#1a120d"');
  // headstock and fretboard
  s += `<path d="M ${G.nut} ${y - 2.6} L ${G.nut - 6.5} ${y - 3.2} L ${G.nut - 6.5} ${y + 3.2} L ${G.nut} ${y + 2.6} Z" fill="#3a2419"/>`;
  for (let i = 0; i < 3; i++) s += circle(G.nut - 1.8 - i * 1.7, y - 2.4, 0.45, 'fill="#c9cfd3"') + circle(G.nut - 1.8 - i * 1.7, y + 2.4, 0.45, 'fill="#c9cfd3"');
  s += rect(G.nut, y - 2.6, -2 - G.nut, 5.2, 'fill="#2f1d15"');
  s += rect(G.nut - 0.4, y - 2.6, 0.4, 5.2, 'fill="#e9e3d4"');
  for (const fx of [-22.6, -19.9, -17.4, -15.1, -12.9, -11.1, -9.4, -7.8, -6.3, -4.9, -3.6])
    s += rect(fx, y - 2.6, 0.18, 5.2, 'fill="#b7bcbf"');
  s += rect(18.6, y - 4.2, 1.8, 8.4, 'rx="0.4" fill="#2a1a12"');
  // strings: nylon on the treble side, wound on the bass side (the low string nearest you, as it lies on the desk)
  for (let i = 0; i < 6; i++) {
    const sy = +(y + (i - 2.5) * 1.1).toFixed(2);
    s += `<line x1="${G.nut - 0.4}" y1="${sy}" x2="${G.bridge}" y2="${sy}" stroke="${i >= 3 ? '#cfc5ad' : '#efeadf'}" stroke-width="${(0.12 + i * 0.03).toFixed(2)}"/>`;
  }
  // the strum: over the soundhole and the strings on the body
  s += part({
    id: 'strum', label: 'Strum the strings', light: light('guitar'),
    body: rect(-1, y - 6.5, 22, 13, 'fill="transparent"'),
    glow: rect(-1, y - 3.3, 20.5, 6.6, 'rx="0.6"'),
  });
  // the three chord positions on the neck, like frets
  NECK.x.forEach((nx, c) => {
    const x = cm(nx - NECK.w / 2), w = cm(NECK.w);
    s += part({
      id: `g${c}`, label: `Hold ${GUITAR_CHORDS[c]} and strum`, light: light('guitar'),
      body: rect(x, y - 3.5, w, 7, 'fill="transparent"') + circle(x + w / 2, y, 0.9, `class="held" fill="#f4efe4" stroke="#2f1d15" stroke-width="0.2"`),
      glow: rect(x, y - 2.6, w, 5.2, 'rx="0.4"'),
    });
  });
  return s;
}

function congas(): string {
  let s = '';
  for (let d = 0; d < 2; d++) {
    const x = cm(CONGA.x[d]), y = -cm(CONGA.z), r = cm(CONGA.r[d]);
    const name = d === 0 ? 'low' : 'high';
    s += circle(x, y, r + 0.9, 'fill="#4a2416"') + lugs(x, y, r + 1.15, 6, 0.6, '#8c9297') + circle(x, y, r + 0.25, 'fill="#9aa1a6"');
    s += part({
      id: `c${d * 2 + 1}`, label: `Edge of the ${name} conga (slap)`, light: light('congas'),
      body: circle(x, y, r - 0.2, 'fill="url(#hide)"'),
      glow: circle(x, y, r * 0.8, `fill="none" stroke-width="${(r * 0.4).toFixed(2)}"`),
    });
    s += part({
      id: `c${d * 2}`, label: `Middle of the ${name} conga (open)`, light: light('congas'),
      body: circle(x, y, +(r * CONGA.open).toFixed(2), 'fill="transparent"'),
      glow: circle(x, y, +(r * CONGA.open).toFixed(2)),
    });
  }
  return s;
}

function handpan(): string {
  const zones = handpanZones(PAGE_ROOT.handpan, PAGE_SCALE);
  const cx = 0, cy = -cm(zones[0].z);
  let s = circle(cx, cy, 14.6, 'fill="#2a201a"') + circle(cx, cy, 14.1, 'fill="url(#steel)"');
  const names = ['C', 'D', 'E', 'G', 'A'];
  for (const z of zones) {
    const x = cm(z.x), y = -cm(z.z), r = cm(z.w);
    const ding = z.i === 0;
    s += part({
      id: `h${z.i}`, label: ding ? 'Handpan, the low note in the middle' : `Handpan note ${names[((z.degree % 5) + 5) % 5]}`, light: light('handpan'),
      body: `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${+(r * (ding ? 1 : 0.86)).toFixed(2)}" fill="url(#field)" stroke="#2a1d14" stroke-opacity="0.6" stroke-width="0.18"/>` +
        circle(x, y, +(r * 0.36).toFixed(2), 'fill="#6e5643" stroke="#2a1d14" stroke-opacity="0.5" stroke-width="0.15"'),
      glow: `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${+(r * (ding ? 1 : 0.86)).toFixed(2)}"/>`,
    });
  }
  return s;
}

const DEFS = `<defs>
  <radialGradient id="coated" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#d9d5cb"/><stop offset="0.35" stop-color="#e9e5dc"/><stop offset="1" stop-color="#f4f1ea"/></radialGradient>
  <radialGradient id="brass" cx="0.42" cy="0.38" r="0.65"><stop offset="0" stop-color="#e6bd6a"/><stop offset="0.6" stop-color="#c4913b"/><stop offset="1" stop-color="#9c6e28"/></radialGradient>
  <linearGradient id="rosewood" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5e2a1f"/><stop offset="0.5" stop-color="#7a3a2a"/><stop offset="1" stop-color="#5a281d"/></linearGradient>
  <radialGradient id="spruce" cx="0.6" cy="0.5" r="0.7"><stop offset="0" stop-color="#e2bf86"/><stop offset="1" stop-color="#c79a5c"/></radialGradient>
  <radialGradient id="hide" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#e8d7b0"/><stop offset="0.75" stop-color="#ddc89b"/><stop offset="1" stop-color="#b99d6c"/></radialGradient>
  <radialGradient id="steel" cx="0.4" cy="0.35" r="0.75"><stop offset="0" stop-color="#7b6250"/><stop offset="0.7" stop-color="#4f3d31"/><stop offset="1" stop-color="#3a2d24"/></radialGradient>
  <radialGradient id="field" cx="0.45" cy="0.4" r="0.6"><stop offset="0" stop-color="#8a705b"/><stop offset="1" stop-color="#5d4838"/></radialGradient>
  <filter id="sit" x="-10%" y="-10%" width="125%" height="130%"><feDropShadow dx="0.35" dy="0.8" stdDeviation="0.55" flood-color="#2b2e29" flood-opacity="0.32"/></filter>
</defs>`;

const DRAW: Record<InstId, () => string> = { drums, piano, marimba, guitar, congas, handpan };

/** The whole drawing: the tray, then the instrument on it. `.inst-pos` is centred on the tray once it's on the page. */
export function deskSvg(id: InstId, title: string): string {
  const v = viewFor(id);
  return `<svg class="desk-svg" viewBox="${v.x} ${v.y} ${v.w} ${v.h}" role="group" aria-label="${title}, seen from above">${DEFS}
  ${rect(v.x + 0.3, v.y + 0.3, v.w - 0.6, v.h - 0.6, 'rx="2.4" fill="var(--tray)"')}
  ${rect(v.x + 1.3, v.y + 1.3, v.w - 2.6, v.h - 3.6, 'rx="1.6" fill="none" stroke="#ffffff" stroke-opacity="0.45" stroke-width="0.14"')}
  ${rect(v.x + 0.3, v.y + v.h - 1.5, v.w - 0.6, 1.2, 'rx="0.6" fill="var(--tray-lip)"')}
  <g class="inst-pos"><g class="inst" filter="url(#sit)">${DRAW[id]()}</g></g></svg>`;
}

/** Centre the instrument on the tray (a little towards the back, clear of the lip). */
export function centreOnTray(svg: SVGSVGElement): void {
  const g = svg.querySelector<SVGGElement>('.inst-pos');
  if (!g) return;
  const b = g.getBBox();
  if (!b.width) return;
  const v = DESK.w === Number(svg.getAttribute('viewBox')?.split(' ')[2]) ? DESK : VIEW;
  const tx = v.x + v.w / 2 - (b.x + b.width / 2);
  const ty = v.y + (v.h - 1.5) / 2 - (b.y + b.height / 2);
  g.setAttribute('transform', `translate(${tx.toFixed(2)} ${ty.toFixed(2)})`);
}
