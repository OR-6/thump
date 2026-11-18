/**
 * The desk from above, for the 2D page: each instrument drawn in plan view at its real size, straight from the
 * game's own layouts (shelf.ts, config.ts), so the page can't drift from what's on the desk. SVG in centimetres:
 * x to the right, y towards you (the game's z, flipped). Every playable part is a `.part` with a `data-part` and a
 * `.glow` copy of its shape that flashes when it's hit; the part's own shape (a key, a bar, a tone field) is what you
 * hit, and where a zone has nothing to see (the guitar's strum, its chord places) it's there but drawn as nothing,
 * with the strings and the fret marks as the hint.
 *
 * Printed like the rest of the site (docs/SITE-DESIGN.md): a riso print in two inks (pink and blue) plus ink black
 * for the linework and the yellow highlighter, on paper. Shapes take their ink from a class (`fp` pink fill, `fb`
 * blue, `kk` an ink line…) and multiply over each other (`x`), so where pink crosses blue it prints purple; form is
 * shaded with halftone dot screens (SVG patterns, each ink on its own screen angle). No colour lives here: index.html
 * colours every class from the :root tokens. Hairlines are CSS pixels (`vector-effect: non-scaling-stroke`), so a
 * drum and a key carry the same weight of line at any size.
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
const ART = { x: -52, y: -31, w: 104, h: 62 } as const;
export const viewFor = (id: InstId): { x: number; y: number; w: number; h: number } => (id === 'drums' ? DESK : VIEW);

const cm = (m: number) => +(m * 100).toFixed(2);
const n2 = (v: number) => +v.toFixed(2);

/** The drawing being made: its ids' prefix (the page can hold more than one), a counter, the dot screen's pitch. */
let D = { p: 'd', n: 0, pitch: 0.42, art: false };
const uid = (s: string) => `${D.p}-${s}${D.n++}`;
/** A dot screen (index.html inks the dots): `pk` pink, `bl` blue, `ik` ink, `yl` yellow; 1 light to 3 heavy. */
const S = (screen: string) => `fill="url(#${D.p}-${screen})"`;

interface Part {
  id: string;
  label: string;
  /** The shapes you see (and hit). */
  body: string;
  /** The same outline, flashed on a hit. */
  glow: string;
  /** Its flash and hover, by what it's printed in: 'pink' parts flash blue, 'dark' ones light up over the ink. */
  tone?: 'pink' | 'dark' | 'blue';
}
const part = (p: Part) =>
  D.art
    ? `<g>${p.body}</g>`
    : `<g class="part${p.tone ? ` t-${p.tone}` : ''}" data-part="${p.id}" role="button" tabindex="0" aria-label="${p.label}">${p.body}<g class="glow" aria-hidden="true">${p.glow}</g></g>`;
const circle = (x: number, y: number, r: number, attrs = '') => `<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(r)}" ${attrs}/>`;
const ellipse = (x: number, y: number, rx: number, ry: number, rot: number, attrs = '') =>
  `<ellipse cx="${n2(x)}" cy="${n2(y)}" rx="${n2(rx)}" ry="${n2(ry)}"${rot ? ` transform="rotate(${n2(rot)} ${n2(x)} ${n2(y)})"` : ''} ${attrs}/>`;
const rect = (x: number, y: number, w: number, h: number, attrs = '') => `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" ${attrs}/>`;
const line = (x1: number, y1: number, x2: number, y2: number, attrs: string) => `<line x1="${n2(x1)}" y1="${n2(y1)}" x2="${n2(x2)}" y2="${n2(y2)}" ${attrs}/>`;
const path = (d: string, attrs: string) => `<path d="${d}" ${attrs}/>`;
/** Decoration: printed, not hit (clicks fall through it). */
const deco = (s: string) => `<g class="deco">${s}</g>`;
/** A clear copy of a zone's exact shape, so the whole zone answers even where the drawing is smaller. */
const CLEAR = 'class="clear"';
/** Where the demo's closing ring lands, when it isn't the part's whole shape (the guitar's soundhole, a fret dot). */
const AIM = 'class="aim"';

/**
 * Shade on a round form lit from the upper left: the shape minus itself moved up and left (by `k` of its radius),
 * printed in a dot screen, so the dots gather on the far side like a halftone photo of a dome.
 */
function shadeCircle(x: number, y: number, r: number, screen: string, k: number): string {
  const id = uid('m');
  return `<mask id="${id}"><circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(r)}" fill="#fff"/><circle cx="${n2(x - k * r)}" cy="${n2(y - k * r)}" r="${n2(r * (1 + k * 0.25))}" fill="#000"/></mask>${circle(x, y, r, `${S(screen)} class="x" mask="url(#${id})"`)}`;
}
function shadeEllipse(x: number, y: number, rx: number, ry: number, screen: string, k: number): string {
  const id = uid('m');
  return `<mask id="${id}"><ellipse cx="${n2(x)}" cy="${n2(y)}" rx="${n2(rx)}" ry="${n2(ry)}" fill="#fff"/><ellipse cx="${n2(x - k * rx)}" cy="${n2(y - k * ry)}" rx="${n2(rx * (1 + k * 0.2))}" ry="${n2(ry * (1 + k * 0.2))}" fill="#000"/></mask>${ellipse(x, y, rx, ry, 0, `${S(screen)} class="x" mask="url(#${id})"`)}`;
}
function shadePath(d: string, dx: number, dy: number, screen: string): string {
  const id = uid('m');
  return `<mask id="${id}"><path d="${d}" fill="#fff"/><path d="${d}" transform="translate(${dx} ${dy})" fill="#000"/></mask>${path(d, `${S(screen)} class="x" mask="url(#${id})"`)}`;
}

/** The dot screens: pink at 15°, blue at 75°, ink at 45°, yellow flat, each in three weights. */
function screens(): string {
  const s = D.pitch;
  const one = (name: string, cls: string, angle: number, r: number) =>
    `<pattern id="${D.p}-${name}" width="${n2(s)}" height="${n2(s)}" patternUnits="userSpaceOnUse" patternTransform="rotate(${angle})"><circle class="${cls}" cx="${n2(s / 2)}" cy="${n2(s / 2)}" r="${+(s * r).toFixed(3)}"/></pattern>`;
  let out = '';
  for (const [ink, cls, angle] of [['pk', 'dp', 15], ['bl', 'db', 75], ['ik', 'dk', 45], ['yl', 'dy', 0]] as const)
    [0.2, 0.31, 0.43].forEach((r, i) => (out += one(`${ink}${i + 1}`, cls, angle, r)));
  return `<defs>${out}</defs>`;
}

// ---------------------------------------------------------------- drums

/** Tension rods round a hoop: little claws pointing out, each with its bolt. */
function claws(x: number, y: number, r: number, n: number, len: number, wide: number): string {
  let s = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 360 + 180 / n;
    s += `<g transform="rotate(${n2(a)} ${n2(x)} ${n2(y)})">${rect(x + r - 0.2, y - wide / 2, len, wide, 'rx="0.3" class="fw kk w1"')}${circle(x + r + len - wide * 0.45, y, wide * 0.22, 'class="fk"')}</g>`;
  }
  return s;
}

/** The two broken rings and the core: Thump's mark, printed on the bass drum's head. */
function mark(x: number, y: number, r: number): string {
  const ring = (rr: number, w: number, dash: string, rot: number, cls: string) =>
    `<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(rr)}" stroke-width="${n2(w)}" pathLength="100" stroke-dasharray="${dash}" transform="rotate(${rot} ${n2(x)} ${n2(y)})" class="fn ${cls} x"/>`;
  return ring(r * 0.46, r * 0.25, '76 24', -20, 'kp') + ring(r * 0.89, r * 0.17, '33 11 30 26', 30, 'kb') + circle(x + r * 0.05, y + r * 0.05, r * 0.23, 'class="fp x"') + circle(x, y, r * 0.23, 'class="fk"');
}

function drums(): string {
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
  // the cymbals first (they sit lowest on the page), each a brass disc with its lathe grooves and its bell
  for (const c of CYM) {
    const p = PADS[c.lane];
    const x = cm(p.x), y = -cm(p.z), r = cm(p.size / 2);
    let under = '';
    // (the hi-hat is a pair: the bottom cymbal shows just past the top one)
    if (c.lane === 'hat') under = deco(circle(x + 0.9, y + 0.9, r, `${S('pk2')} class="x kk w15"`));
    let grooves = '';
    for (let i = 1; i <= 5; i++) grooves += circle(x, y, r * (0.32 + i * 0.12), `class="fn kp w1 x"${i % 2 ? ' stroke-dasharray="0.9 0.35"' : ''}`);
    s += under;
    s += part({
      id: c.lane, label: c.label,
      body: circle(x, y, r, 'class="fw"') + circle(x, y, r, 'class="fy x"') + shadeCircle(x, y, r, 'pk2', 0.22) + grooves + circle(x, y, r, 'class="fn kk w15"') +
        circle(x, y, r * 0.3, `${S('pk1')} class="x kk w1"`) + shadeCircle(x, y, r * 0.3, 'pk3', 0.35) +
        circle(x, y, 0.75, 'class="fp x kk w1"') + circle(x, y, 0.28, 'class="fk"'),
      glow: circle(x, y, r),
    });
  }
  for (const c of DRUM) {
    const p = PADS[c.lane];
    const x = cm(p.x), y = -cm(p.z), r = cm(p.size / 2);
    const snare = c.lane === 'snare';
    // the shell just shows round the hoop (pink, the snare blue), the claws on it, the hoop in ink
    let shell = circle(x, y, r + 0.8, `class="${snare ? 'fb' : 'fp'} x kk w15"`) + shadeCircle(x, y, r + 0.8, snare ? 'ik2' : 'bl2', 0.18);
    shell += claws(x, y, r + 0.5, c.lugs, 1.5, 1.1);
    // (the snare's throw-off, on its side)
    if (snare) shell += rect(x - r - 2.4, y - 1.1, 1.8, 2.2, 'rx="0.4" class="fw kk w1"') + rect(x - r - 3.4, y - 0.35, 1.4, 0.7, 'rx="0.35" class="fk"');
    let head = circle(x, y, r, 'class="fw"') + shadeCircle(x, y, r - 0.6, snare ? 'bl2' : 'bl1', 0.16);
    if (c.lane === 'kick') head += mark(x, y, r * 0.42);
    // (the snare's head has a dot in the middle where it's been hit for years)
    else if (snare) head += circle(x, y, r * 0.16, 'class="fn kk w1" stroke-dasharray="3 3"');
    head += circle(x, y, r - 0.35, 'class="fn kk" stroke-width="0.7"') + circle(x, y, r, 'class="fn kk w15"');
    s += deco(shell);
    s += part({ id: c.lane, label: c.label, body: head, glow: circle(x, y, r) });
  }
  return s;
}

// ---------------------------------------------------------------- keyboard

function piano(): string {
  const K = KEYBOARD;
  const zones = pianoZones(PAGE_ROOT.piano, PAGE_SCALE);
  const whites = zones.filter((z) => z.i < PIANO_CHORD);
  const chord = zones.find((z) => z.i === PIANO_CHORD)!;
  const back = -cm(K.front + K.len); // the far end of the keys
  const front = -cm(K.front);
  const kx = cm(whites[0].x - whites[0].w / 2);
  const kw = cm(K.pitch * whites.length);
  const cx = cm(chord.x), cy = -cm(chord.z), cr = cm(chord.w) * 0.75;
  const x0 = cx - cr - 2.5, x1 = kx + kw + 1.5;
  const top = back - 4.4, bot = front + 1.8;
  // the case: blue, rounded, a darker lip along its front edge; a pink cloth strip behind the keys
  let s = rect(x0, top, x1 - x0, bot - top, 'rx="1.6" class="fb x kk w2"');
  s += rect(x0 + 0.5, top + 0.5, x1 - x0 - 1, bot - top - 1, `rx="1.2" ${S('ik1')} class="x"`);
  const lip = uid('c');
  s += `<clipPath id="${lip}">${rect(x0, top, x1 - x0, bot - top, 'rx="1.6"')}</clipPath><g clip-path="url(#${lip})">${rect(x0, bot - 1.1, x1 - x0, 1.1, `${S('ik3')} class="x"`)}</g>` + line(x0 + 1, bot - 1.1, x1 - 1, bot - 1.1, 'class="kk w1"');
  s += rect(kx - 0.3, back - 1.5, kw + 0.6, 1.5, 'class="fw"') + rect(kx - 0.3, back - 1.5, kw + 0.6, 1.5, `class="fp x kk w1"`) + rect(kx - 0.3, back - 1.5, kw + 0.6, 1.5, `${S('pk3')} class="x"`);
  // the name printed on the case, two knobs and a speaker grille over the chord pad
  s += `<text x="${n2(kx)}" y="${n2(top + 2.15)}" class="ttl" font-size="1.7">thump</text>`;
  for (const k of [0, 1]) {
    const nx = x1 - 2.6 - k * 3, ny = top + 1.55;
    s += circle(nx, ny, 1.05, 'class="fw kk w15"') + shadeCircle(nx, ny, 1.05, 'ik2', 0.3) + line(nx, ny, nx + (k ? -0.55 : 0.45), ny - 0.85, 'class="kk w2"');
  }
  for (let i = 0; i < 6; i++) s += line(cx - cr + 0.3, back - 1 + i * 0.95, cx + cr - 0.3, back - 1 + i * 0.95, 'class="kk w3"');
  s = deco(s);
  const names = ['C', 'D', 'E', 'G', 'A'];
  for (const z of whites) {
    const x = cm(z.x - z.w / 2), w = cm(z.w), h = front - back;
    s += part({
      id: `w${z.i}`, label: `Piano key ${names[z.i % 5]}`,
      body: path(`M ${n2(x)} ${n2(back)} H ${n2(x + w)} V ${n2(front - 0.5)} Q ${n2(x + w)} ${n2(front)} ${n2(x + w - 0.5)} ${n2(front)} H ${n2(x + 0.5)} Q ${n2(x)} ${n2(front)} ${n2(x)} ${n2(front - 0.5)} Z`, 'class="fw kk w15"') +
        rect(x, back, w, h, CLEAR),
      glow: rect(x, back, w, h),
    });
  }
  // the black keys' shadows fall on the white keys, then the keys, each with a sheen down its side
  const blacks = pianoBlacks(zones);
  s += deco(blacks.map((b) => rect(cm(b.x - b.w / 2) + 0.4, -cm(b.z + b.h / 2), cm(b.w), cm(b.h) + 0.5, `rx="0.3" ${S('ik2')} class="x"`)).join(''));
  for (const b of blacks) {
    const x = cm(b.x - b.w / 2), y = -cm(b.z + b.h / 2), w = cm(b.w), h = cm(b.h);
    s += part({
      id: `b${b.a}-${b.b}`, label: `Black key: ${names[b.a % 5]} and ${names[b.b % 5]} together`, tone: 'dark',
      body: path(`M ${n2(x)} ${n2(y)} H ${n2(x + w)} V ${n2(y + h - 0.4)} Q ${n2(x + w)} ${n2(y + h)} ${n2(x + w - 0.4)} ${n2(y + h)} H ${n2(x + 0.4)} Q ${n2(x)} ${n2(y + h)} ${n2(x)} ${n2(y + h - 0.4)} Z`, 'class="fk"') +
        line(x + 0.32, y + 0.6, x + 0.32, y + h - 1.6, 'class="kw w15"') + line(x + 0.6, y + h - 0.9, x + w - 0.6, y + h - 0.9, 'class="kw w1"') + rect(x, y, w, h, CLEAR),
      glow: rect(x, y, w, h),
    });
  }
  const pr = cr + 0.35;
  s += part({
    id: 'chord', label: 'Chord button', tone: 'pink',
    body: circle(cx, cy, pr, 'class="fw"') + circle(cx, cy, pr, 'class="fp x kk w2"') + shadeCircle(cx, cy, pr, 'bl2', 0.25) + circle(cx, cy, pr * 0.62, 'class="fn kk w15" stroke-dasharray="4 4"') +
      circle(cx, cy, pr * 0.3, 'class="fw kk w15"') + `<text x="${n2(cx)}" y="${n2(cy + pr + 2)}" class="ttl" font-size="1.45" text-anchor="middle">chord</text>`,
    glow: circle(cx, cy, pr),
  });
  return s;
}

// ---------------------------------------------------------------- marimba

function marimba(): string {
  const zones = marimbaZones(PAGE_ROOT.marimba, PAGE_SCALE);
  const first = zones[0], last = zones[zones.length - 1];
  const y0 = -cm(first.z);
  // the two rails run under the bars' nodes (about a fifth in from each end), closer together as the bars shorten
  const node = (z: (typeof zones)[number], side: 1 | -1) => n2(y0 + side * cm(z.h) * 0.28);
  const xl = cm(first.x - first.w / 2) - 2.2, xr = cm(last.x + last.w / 2) + 2.2;
  // the resonator tubes hang under the bars and show below the front rail, longest under the lowest bar
  let tubes = '';
  for (const z of zones) {
    const x = cm(z.x), top = node(z, 1), len = 3.2 + (zones.length - 1 - z.i) * 0.62 + cm(z.h) * 0.22;
    tubes += rect(x - 1.55, top, 3.1, len, `rx="1.5" ${S('bl3')} class="x"`) + rect(x - 1.55, top, 3.1, len, 'rx="1.5" class="fn kk w15"') +
      line(x - 0.75, top + 1, x - 0.75, top + len - 1.2, 'class="kw w2"');
  }
  let frame = '';
  for (const side of [-1, 1] as const) {
    const ya = node(first, side), yb = node(last, side);
    frame += path(`M ${n2(xl)} ${n2(ya - 0.7)} L ${n2(xr)} ${n2(yb - 0.7)} L ${n2(xr)} ${n2(yb + 0.7)} L ${n2(xl)} ${n2(ya + 0.7)} Z`, 'class="fb x kk w15"');
    for (const [ex, ey] of [[xl, ya], [xr, yb]]) frame += rect(ex - 1, ey - 1.2, 2, 2.4, 'rx="0.4" class="fw"') + rect(ex - 1, ey - 1.2, 2, 2.4, 'rx="0.4" class="fp x kk w15"');
  }
  let s = deco(tubes + frame);
  const names = ['C', 'D', 'E', 'G', 'A', 'C', 'D', 'E'];
  for (const z of zones) {
    const x = cm(z.x - z.w / 2), w = cm(z.w), h = cm(z.h), y = y0 - h / 2, mx = x + w / 2;
    // the bar: pink wood with its grain in blue (they print purple where they cross), the cord through its two nodes
    let grain = '';
    for (const [gx, bend] of [[0.28, 0.25], [0.5, -0.3], [0.72, 0.2]] as const) {
      const lx = x + w * gx;
      grain += path(`M ${n2(lx)} ${n2(y + 1.2)} C ${n2(lx + bend)} ${n2(y + h * 0.35)} ${n2(lx - bend)} ${n2(y + h * 0.65)} ${n2(lx)} ${n2(y + h - 1.2)}`, 'class="fn kb w1 x"');
    }
    s += part({
      id: `m${z.i}`, label: `Marimba bar ${names[z.i]}`, tone: 'pink',
      body: rect(x + 0.15, y, w - 0.3, h, 'rx="0.55" class="fw"') + rect(x + 0.15, y, w - 0.3, h, 'rx="0.55" class="fp x kk w15"') + rect(x + 0.15, y, w - 0.3, h, `rx="0.55" ${S('pk2')} class="x"`) +
        rect(x + w - 1.3, y + 0.5, 1, h - 1, `rx="0.4" ${S('bl2')} class="x"`) + grain +
        circle(mx, node(z, -1), 0.42, 'class="fw kk w1"') + circle(mx, node(z, 1), 0.42, 'class="fw kk w1"') +
        `<text x="${n2(mx)}" y="${n2(y0 + 1.6)}" class="lbl" font-size="1.7" text-anchor="middle">${names[z.i]}</text>` + rect(x, y, w, h, CLEAR),
      glow: rect(x + 0.15, y, w - 0.3, h),
    });
  }
  // (the cord, over the bars, through their holes)
  s += deco(line(xl + 1, node(first, -1), xr - 1, node(last, -1), 'class="kk w1" stroke-dasharray="1.2 4.2"') + line(xl + 1, node(first, 1), xr - 1, node(last, 1), 'class="kk w1" stroke-dasharray="1.2 4.2"'));
  return s;
}

// ---------------------------------------------------------------- guitar

/** Where the neck runs and where you strum (the strum part covers the soundhole and the strings over the body). */
const G = { y: -cm(NECK.z), nut: -25, bridge: 19.5 } as const;
export const GUITAR_CHORDS = ['C', 'A minor', 'F'] as const;
const CHORD_TAG = ['C', 'Am', 'F'] as const;

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
  const seg = (ps: [number, number][], sg: number) => `C ${ps.map(([px, py]) => `${px} ${n2(y + sg * py)}`).join(' ')}`;
  const back = half.map((c, i) => [c[1], c[0], i === 0 ? ([-6.5, 0] as [number, number]) : half[i - 1][2]]).reverse();
  const body = `M -6.5 ${y} ${half.map((c) => seg(c, 1)).join(' ')} ${back.map((c) => seg(c, -1)).join(' ')} Z`;
  const clip = uid('c');
  let s = `<clipPath id="${clip}"><path d="${body}"/></clipPath>`;
  // the top: pink, a heavier screen falling off towards its far edge, the binding a blue band all the way round
  s += path(body, `${S('pk2')} class="x"`) + shadePath(body, -1.6, -1.8, 'pk3');
  s += `<g clip-path="url(#${clip})">${path(body, 'class="fn kb x" stroke-width="1.3"')}</g>`;
  s += path(body, 'class="fn kk w2"');
  // the pickguard, a teardrop under the soundhole on the treble side
  s += path(`M 1.2 ${n2(y + 3.6)} C 1.6 ${n2(y + 6.6)} 7.4 ${n2(y + 7)} 9.4 ${n2(y + 4.6)} C 10.4 ${n2(y + 3.1)} 9.6 ${n2(y + 1.7)} 8.3 ${n2(y + 1.9)} C 7.6 ${n2(y + 4)} 4.6 ${n2(y + 5)} 1.2 ${n2(y + 3.6)} Z`, `${S('bl3')} class="x kk w1"`);
  // the rosette (a blue band between ink rings, a pink chain), the soundhole
  s += circle(4, y, 4.1, 'class="fn kk w1"') + circle(4, y, 3.55, 'class="fn kb x" stroke-width="0.7"') + circle(4, y, 3.55, 'class="fn kp x" stroke-width="0.32" stroke-dasharray="0.35 0.35"') + circle(4, y, 3, 'class="fn kk w1"');
  s += circle(4, y, 2.75, 'class="fk"') + shadeCircle(4, y, 2.75, 'bl3', -0.22);
  // the bridge: a blue block with its wings, the saddle, six pins
  s += path(`M 17.6 ${n2(y - 4.6)} Q 18.4 ${n2(y - 4.2)} 18.7 ${n2(y - 3.6)} L 18.7 ${n2(y + 3.6)} Q 18.4 ${n2(y + 4.2)} 17.6 ${n2(y + 4.6)} L 21.4 ${n2(y + 4.6)} Q 20.6 ${n2(y + 4.2)} 20.3 ${n2(y + 3.6)} L 20.3 ${n2(y - 3.6)} Q 20.6 ${n2(y - 4.2)} 21.4 ${n2(y - 4.6)} Z`, 'class="fb x kk w15"');
  s += line(G.bridge, y - 3.4, G.bridge, y + 3.4, 'class="kw w2"');
  for (let i = 0; i < 6; i++) s += circle(20.85, y + (i - 2.5) * 1.1, 0.3, 'class="fw kk w1"');
  // the neck: a blue fretboard, darker along its far edge, its frets set the way a real guitar's close up
  const bw = (x: number) => 2.45 + ((x - G.nut) / (-2 - G.nut)) * 0.5;
  const board = `M ${G.nut} ${n2(y - bw(G.nut))} L -2 ${n2(y - bw(-2))} L -2 ${n2(y + bw(-2))} L ${G.nut} ${n2(y + bw(G.nut))} Z`;
  s += path(board, 'class="fb x"') + path(board, `${S('ik1')} class="x"`) + shadePath(board, 0, -0.9, 'ik2') + path(board, 'class="fn kk w15"');
  const L = 54.5;
  const frets: number[] = [];
  for (let n = 1; G.nut + L * (1 - 2 ** (-n / 12)) < -2.6; n++) frets.push(n2(G.nut + L * (1 - 2 ** (-n / 12))));
  for (const fx of frets) s += line(fx, y - bw(fx), fx, y + bw(fx), 'class="kw w2"') + line(fx + 0.14, y - bw(fx), fx + 0.14, y + bw(fx), 'class="kk w1"');
  // the headstock: a crown at the end, three tuners a side (posts on its face, buttons out past its edges)
  const hs = `M ${G.nut} ${n2(y - 2.45)} C ${G.nut - 2} ${n2(y - 2.7)} ${G.nut - 4.5} ${n2(y - 3.5)} ${G.nut - 6.3} ${n2(y - 3.4)} Q ${G.nut - 7.4} ${n2(y - 1.4)} ${G.nut - 6.6} ${y} Q ${G.nut - 7.4} ${n2(y + 1.4)} ${G.nut - 6.3} ${n2(y + 3.4)} C ${G.nut - 4.5} ${n2(y + 3.5)} ${G.nut - 2} ${n2(y + 2.7)} ${G.nut} ${n2(y + 2.45)} Z`;
  for (let i = 0; i < 3; i++) {
    const tx = G.nut - 1.6 - i * 1.85;
    for (const sg of [-1, 1]) {
      const edge = y + sg * (2.75 + i * 0.25);
      s += line(tx, edge, tx, edge + sg * 1.3, 'class="kk w2"') + ellipse(tx, edge + sg * 1.75, 0.7, 0.5, 0, 'class="fp x kk w1"');
    }
  }
  s += path(hs, 'class="fb x kk w15"') + path(hs, `${S('ik2')} class="x"`);
  const posts: [number, number][] = [];
  for (let i = 0; i < 3; i++) for (const sg of [-1, 1]) posts.push([G.nut - 1.6 - i * 1.85, y + sg * 1.85]);
  for (const [px, py] of posts) s += circle(px, py, 0.42, 'class="fw kk w1"');
  s += rect(G.nut - 0.15, y - 2.5, 0.5, 5, 'class="fw kk w1"');
  // the strings, nut to bridge (the wound bass ones thicker, nearest you as it lies on the desk), each on a
  // paper line so it reads over the inks; past the nut they run out to their posts
  const order = [0, 2, 4, 5, 3, 1]; // which post each string winds onto
  for (let i = 0; i < 6; i++) {
    const sy = y + (i - 2.5) * 1.1, ny = y + (i - 2.5) * 0.8;
    const [px, py] = posts[order[i]];
    const d = `M ${n2(px)} ${n2(py)} L ${G.nut} ${n2(ny)} L -2 ${n2(ny + (sy - ny) * 0.55)} L ${G.bridge} ${n2(sy)}`;
    s += path(d, 'class="fn kw w3"') + path(d, `class="fn kk ${i >= 3 ? 'w15' : 'w1'}"`);
  }
  s = deco(s);
  // the strum: over the soundhole and the strings on the body (drawn as nothing: the strings are what you see)
  s += part({
    id: 'strum', label: 'Strum the strings', tone: 'pink',
    body: rect(-1, y - 6.5, 22, 13, CLEAR) + circle(4, y, 3.6, AIM),
    // (it lights up as the strings themselves)
    glow: [0, 1, 2, 3, 4, 5].map((i) => line(-0.5, y + (i - 2.5) * 1.02, G.bridge - 0.4, y + (i - 2.5) * 1.1, 'class="band" stroke-width="0.42" stroke-linecap="round"')).join(''),
  });
  // the three chord places on the neck, between frets: a printed dot marks each, the held one gets your finger
  NECK.x.forEach((nx, c) => {
    const x = cm(nx - NECK.w / 2), w = cm(NECK.w), mid = cm(nx);
    let fx = mid, best = Infinity;
    const edges = [G.nut, ...frets];
    for (let k = 1; k < edges.length; k++) {
      const m = (edges[k - 1] + edges[k]) / 2;
      if (Math.abs(m - mid) < best) (best = Math.abs(m - mid)), (fx = m);
    }
    s += part({
      id: `g${c}`, label: `Hold ${GUITAR_CHORDS[c]} and strum`, tone: 'blue',
      body: rect(x, y - 3.5, w, 7, CLEAR) + circle(fx, y, 0.55, 'class="fw kk w1"') + circle(fx, y, 1.6, AIM) +
        `<text x="${n2(fx)}" y="${n2(y + 5.6)}" class="lbl" font-size="1.6" text-anchor="middle">${CHORD_TAG[c]}</text>` +
        `<g class="held">${circle(fx, y, 1.05, 'class="fw"') + circle(fx, y, 1.05, 'class="fp x kk w15"') + circle(fx - 0.3, y - 0.3, 0.3, 'class="fw"')}</g>`,
      glow: rect(x + 0.3, y - bw(fx), w - 0.6, 2 * bw(fx), 'rx="0.6"'),
    });
  });
  return s;
}

// ---------------------------------------------------------------- congas

function congas(): string {
  let s = '';
  for (let d = 0; d < 2; d++) {
    const x = cm(CONGA.x[d]), y = -cm(CONGA.z), r = cm(CONGA.r[d]);
    const name = d === 0 ? 'low' : 'high';
    const open = n2(r * CONGA.open);
    // the shell's belly, wider than the head: pink staves, shaded round, with the joins between them
    const belly = r * 1.2;
    let staves = '';
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      staves += line(x + Math.cos(a) * (r + 0.9), y + Math.sin(a) * (r + 0.9), x + Math.cos(a) * belly, y + Math.sin(a) * belly, 'class="kk w1"');
    }
    let rim = circle(x, y, belly, 'class="fp x kk w15"') + shadeCircle(x, y, belly, 'pk3', 0.2) + shadeCircle(x, y, belly, 'bl2', 0.09) + staves;
    // the rim (a blue crown) and its six lugs, each a plate with a bolt down to the shell
    rim += circle(x, y, r + 0.75, 'class="fw kk w15"') + circle(x, y, r + 0.75, `${S('ik1')} class="x"`);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * 360 + 30;
      rim += `<g transform="rotate(${a} ${n2(x)} ${n2(y)})">${rect(x + r + 0.2, y - 0.9, 2.1, 1.8, 'rx="0.35" class="fw kk w1"')}${circle(x + r + 1.6, y, 0.38, 'class="fk"')}</g>`;
    }
    s += deco(rim);
    // the head: rawhide, a little yellow, mottled darker in the middle where the hands go; the edge is a slap
    s += part({
      id: `c${d * 2 + 1}`, label: `Edge of the ${name} conga (slap)`,
      body: circle(x, y, r - 0.2, 'class="fw"') + circle(x, y, r - 0.2, `${S('yl3')} class="x"`) +
        shadeCircle(x, y, r - 0.2, 'pk2', 0.12) + circle(x, y, r - 0.2, 'class="fn kk w15"') + circle(x, y, open, 'class="fn kk w2" stroke-dasharray="7 6"'),
      glow: circle(x, y, n2(r * 0.8), `fill="none" stroke-width="${(r * 0.4).toFixed(2)}" class="band"`),
    });
    s += part({
      id: `c${d * 2}`, label: `Middle of the ${name} conga (open)`,
      body: circle(x, y, open, CLEAR),
      glow: circle(x, y, open),
    });
  }
  return s;
}

// ---------------------------------------------------------------- handpan

function handpan(): string {
  const zones = handpanZones(PAGE_ROOT.handpan, PAGE_SCALE);
  const cx = 0, cy = -cm(zones[0].z);
  const RX = 16.4, RY = 14.4;
  // the shell, seen a little from the front: its rim's edge shows under it, then the dome, its dots gathering
  // towards the far side with a bare shine up at the top left
  let s = ellipse(cx, cy + 1.3, RX, RY, 0, 'class="fb x kk w2"');
  s += ellipse(cx, cy, RX, RY, 0, 'class="fw"');
  const shine = uid('m');
  s += `<mask id="${shine}"><ellipse cx="${cx}" cy="${n2(cy)}" rx="${RX}" ry="${RY}" fill="#fff"/><ellipse cx="${n2(cx - RX * 0.42)}" cy="${n2(cy - RY * 0.5)}" rx="${n2(RX * 0.26)}" ry="${n2(RY * 0.07)}" transform="rotate(-34 ${n2(cx - RX * 0.42)} ${n2(cy - RY * 0.5)})" fill="#000"/></mask>`;
  s += ellipse(cx, cy, RX, RY, 0, `${S('bl2')} class="x" mask="url(#${shine})"`);
  s += shadeEllipse(cx, cy, RX, RY, 'bl3', 0.2) + shadeEllipse(cx, cy, RX, RY, 'ik1', 0.07);
  s += ellipse(cx, cy, RX - 1.1, RY - 1, 0, 'class="fn kb x" stroke-width="0.25"') + ellipse(cx, cy, RX, RY, 0, 'class="fn kk w2"');
  s = deco(s);
  const names = ['C', 'D', 'E', 'G', 'A'];
  for (const z of zones) {
    const x = cm(z.x), y = -cm(z.z), r = cm(z.w);
    const ding = z.i === 0;
    if (ding) {
      // the ding: a raised dome in the middle, its own shine
      s += part({
        id: `h${z.i}`, label: 'Handpan, the low note in the middle', tone: 'pink',
        body: circle(x, y, r, 'class="fw"') + circle(x, y, r, `${S('pk2')} class="x kk w15"`) + shadeCircle(x, y, r, 'pk3', 0.18) +
          circle(x, y, r * 0.46, 'class="fp x kk w15"') + shadeCircle(x, y, r * 0.46, 'bl3', 0.3) +
          path(`M ${n2(x - r * 0.3)} ${n2(y - r * 0.08)} A ${n2(r * 0.3)} ${n2(r * 0.3)} 0 0 1 ${n2(x - r * 0.05)} ${n2(y - r * 0.3)}`, 'class="fn kw w3"'),
        glow: circle(x, y, r),
      });
      continue;
    }
    // a tone field: a lens pointing at the middle, a dimple in it
    const a = (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
    const t = (a * Math.PI) / 180;
    const ox = -Math.cos(t) * r * 0.1, oy = -Math.sin(t) * r * 0.1;
    s += part({
      id: `h${z.i}`, label: `Handpan note ${names[((z.degree % 5) + 5) % 5]}`, tone: 'pink',
      body: circle(x, y, r, CLEAR) + ellipse(x, y, r, r * 0.74, a, 'class="fw"') + ellipse(x, y, r, r * 0.74, a, `${S('pk2')} class="x kk w15"`) +
        ellipse(x + ox, y + oy, r * 0.43, r * 0.34, a, 'class="fp x kk w1"') + ellipse(x + ox + 0.18, y + oy + 0.18, r * 0.3, r * 0.22, a, `${S('bl3')} class="x"`),
      glow: ellipse(x, y, r, r * 0.74, a),
    });
  }
  return s;
}

const DRAW: Record<InstId, () => string> = { drums, piano, marimba, guitar, congas, handpan };

/**
 * The whole drawing: the instrument alone (the page draws its one frame). `.inst-pos` is centred once it's on the
 * page. `art`: a print to look at (the hero's), no parts to play; `prefix` keeps its ids its own.
 */
export function deskSvg(id: InstId, title: string, opts: { art?: boolean; prefix?: string } = {}): string {
  // (the hero's print is cropped to the kit)
  const v = opts.art && id === 'drums' ? ART : viewFor(id);
  D = { p: opts.prefix ?? 'd', n: 0, pitch: v.w / 150, art: !!opts.art };
  const inner = DRAW[id]();
  const head = opts.art ? `class="desk-svg art" aria-hidden="true"` : `class="desk-svg" role="group" aria-label="${title}, seen from above"`;
  return `<svg ${head} viewBox="${v.x} ${v.y} ${v.w} ${v.h}">${screens()}
  <g class="inst-pos"><g class="inst">${inner}</g></g></svg>`;
}

/** Centre the instrument in the frame. */
export function centreOnTray(svg: SVGSVGElement): void {
  const g = svg.querySelector<SVGGElement>('.inst-pos');
  if (!g) return;
  const b = g.getBBox();
  if (!b.width) return;
  const [x, y, w, h] = (svg.getAttribute('viewBox') ?? '').split(' ').map(Number);
  const v = { x, y, w, h };
  const tx = v.x + v.w / 2 - (b.x + b.width / 2);
  const ty = v.y + v.h / 2 - (b.y + b.height / 2);
  g.setAttribute('transform', `translate(${tx.toFixed(2)} ${ty.toFixed(2)})`);
}
