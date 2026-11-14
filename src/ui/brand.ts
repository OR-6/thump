/**
 * Thump's wordmark as inline SVG for the 2D page (the key art and icons in public/ are rendered from the same
 * paths). THUMP in heavy block capitals leaning 10 degrees, the angle every pressable plate in the game uses,
 * stamped: a thick dark outline, a deep extrusion and a hard shadow under a gold-to-orange fill with a light top
 * edge and a halftone in its lower half. Plain paths, no font.
 */

/** The letters, upright, 100 units tall, placed along the line (438 wide with the lean), before the lean. */
export const LETTERS = [
  'M0 0H70V26H48V100H22V26H0Z',
  'M78 0H104V37H128V0H154V100H128V63H104V100H78Z',
  'M162 0H188V62A12 12 0 0 0 212 62V0H238V64A38 36 0 0 1 162 64Z',
  'M246 100V0H272L290 40L308 0H334V100H310V46L297 74H283L270 46V100Z',
  'M342 0H390A30 30 0 0 1 390 60H368V100H342ZM368 22V38H388A8 8 0 0 0 388 22Z',
];
/** The T alone, for the small icon. */
export const MONOGRAM = [LETTERS[0]];

const INK = '#1a0b2e';

/**
 * The stamped word. `id` keeps its gradients apart when there's more than one on a page; `depth` is the extrusion
 * in letter units. Its box is the letters' plus room for the outline, the extrusion and the shadow.
 */
export function stampSvg(id: string, paths: readonly string[] = LETTERS, opts: { depth?: number; label?: string; className?: string } = {}): string {
  const depth = opts.depth ?? 7;
  const w = paths === LETTERS ? 420 : 70;
  const lean = 0.176 * 100;
  const pad = 9;
  const vb = `${-lean - pad} ${-pad} ${w + lean + pad * 2 + depth + 6} ${100 + pad * 2 + depth + 8}`;
  const d = paths.join('');
  const aria = opts.label === '' ? 'aria-hidden="true"' : `role="img" aria-label="${opts.label ?? 'Thump'}"`;
  let ext = '';
  for (let i = depth; i >= 1; i--) ext += `<use href="#${id}-l" transform="translate(${(i * 0.8).toFixed(1)} ${i})" fill="${INK}" stroke="${INK}" stroke-width="14" stroke-linejoin="round"/>`;
  return `<svg class="${opts.className ?? 'stamp'}" viewBox="${vb}" ${aria}><defs>
    <path id="${id}-l" d="${d}" fill-rule="evenodd"/>
    <linearGradient id="${id}-f" x1="0" y1="0" x2="0" y2="100" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff1a8"/><stop offset="0.48" stop-color="#ffb000"/><stop offset="1" stop-color="#ff6a3c"/></linearGradient>
    <linearGradient id="${id}-s" x1="0" y1="0" x2="0" y2="100" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#b83a1c"/><stop offset="1" stop-color="#5a1430"/></linearGradient>
    <pattern id="${id}-d" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="2.5" cy="2.5" r="1.05" fill="#c2410c"/></pattern>
    <linearGradient id="${id}-hm" x1="0" y1="0" x2="0" y2="100" gradientUnits="userSpaceOnUse"><stop offset="0.5" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>
    <mask id="${id}-m" maskUnits="userSpaceOnUse" x="-40" y="-20" width="${w + 80}" height="140"><rect x="-40" y="-20" width="${w + 80}" height="140" fill="url(#${id}-hm)"/></mask>
    <clipPath id="${id}-c"><use href="#${id}-l" clip-rule="evenodd"/></clipPath>
  </defs><g transform="skewX(-10)">
    <use href="#${id}-l" transform="translate(${depth * 0.8 + 6} ${depth + 7})" fill="${INK}" stroke="${INK}" stroke-width="14" stroke-linejoin="round" opacity="0.55"/>
    ${ext}
    <use href="#${id}-l" transform="translate(${(depth * 0.8).toFixed(1)} ${depth})" fill="url(#${id}-s)" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <use href="#${id}-l" fill="${INK}" stroke="${INK}" stroke-width="14" stroke-linejoin="round"/>
    <use href="#${id}-l" fill="url(#${id}-f)"/>
    <g clip-path="url(#${id}-c)">
      <rect x="-30" y="55" width="${w + 60}" height="50" fill="url(#${id}-d)" mask="url(#${id}-m)" opacity="0.55"/>
      <rect x="-30" y="0" width="${w + 60}" height="5" fill="#fffbe6" opacity="0.85"/>
    </g>
    <use href="#${id}-l" fill="none" stroke="#fffbe6" stroke-width="1.6" stroke-opacity="0.55" transform="translate(-0.6 -0.8)" clip-path="url(#${id}-c)"/>
  </g></svg>`;
}

/** The plain wordmark (one colour), for small places like the page's footer. Its box is 438 by 100. */
export function wordmarkSvg(fill = 'currentColor', label = 'Thump'): string {
  const aria = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  return `<svg class="wordmark-svg" viewBox="-18 0 438 100" ${aria}><g transform="skewX(-10)" fill="${fill}" fill-rule="evenodd">${LETTERS.map((d) => `<path d="${d}"/>`).join('')}</g></svg>`;
}

/**
 * Thump's mark (the icon, tools/icon-hit.mjs, the same geometry): a solid core and three broken rings spreading from
 * it, each turned a little differently. `simple` is the favicon's two heavier rings, for small sizes. The view box is
 * centred on the core, and each ring sits in its own `.ring` group so the page can turn them.
 */
const RINGS = [
  { r: 150, w: 56, dash: [760, 180], rot: -20 },
  { r: 270, w: 34, dash: [520, 160, 260, 300], rot: 40 },
  { r: 390, w: 18, dash: [300, 220, 480, 520], rot: 10 },
];
const RINGS_SIMPLE = [
  { r: 170, w: 92, dash: [800, 270], rot: -20 },
  { r: 330, w: 64, dash: [700, 240, 600, 540], rot: 30 },
];
export function ringMarkSvg(opts: { simple?: boolean; className?: string; label?: string } = {}): string {
  const rings = opts.simple ? RINGS_SIMPLE : RINGS;
  const half = opts.simple ? 372 : 400;
  const aria = opts.label ? `role="img" aria-label="${opts.label}"` : 'aria-hidden="true" focusable="false"';
  const body = rings
    .map((g, i) => `<g class="ring ring-${i + 1}"><circle r="${g.r}" fill="none" stroke="var(--hot, #ff4b2b)" stroke-width="${g.w}" stroke-dasharray="${g.dash.join(' ')}" transform="rotate(${g.rot})"/></g>`)
    .join('');
  return `<svg class="${opts.className ?? 'mark'}" viewBox="${-half} ${-half} ${half * 2} ${half * 2}" ${aria}>${body}<circle class="core" r="${opts.simple ? 84 : 70}" fill="var(--ink, #f6efe4)"/></svg>`;
}
