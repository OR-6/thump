// Thump's icon: the hit. A solid core and three broken rings spreading from it, in the panel's deep plum, the PLAY
// button's hot red-orange and off-white. Writes the app icon, a simplified favicon (fewer, heavier rings for 16-32
// px) and the 1200x630 social card, plus artifacts/render-jobs.json for tools/render-html.mjs. Run:
//   node tools/icon-hit.mjs && npx @iwsdk/cli browser run tools/render-html.mjs && sh tools/icon-hit-export.sh
import { readFileSync, writeFileSync } from 'node:fs';

const PLUM = '#1d0b2c';
const CREAM = '#f6efe4';
const HOT = '#ff4b2b';

/** The mark at (cx, cy), scale k: the core and three broken rings, each turned a little differently. */
function mark(cx, cy, k = 1, simple = false) {
  const ring = (r, w, dash, rot) =>
    `<circle cx="${cx}" cy="${cy}" r="${r * k}" fill="none" stroke="${HOT}" stroke-width="${w * k}" stroke-dasharray="${dash.map((d) => d * k).join(' ')}" transform="rotate(${rot} ${cx} ${cy})"/>`;
  if (simple)
    return `${ring(170, 92, [800, 270], -20)}${ring(330, 64, [700, 240, 600, 540], 30)}<circle cx="${cx}" cy="${cy}" r="${84 * k}" fill="${CREAM}"/>`;
  return `${ring(150, 56, [760, 180], -20)}${ring(270, 34, [520, 160, 260, 300], 40)}${ring(390, 18, [300, 220, 480, 520], 10)}<circle cx="${cx}" cy="${cy}" r="${70 * k}" fill="${CREAM}"/>`;
}

const app = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"><rect width="1024" height="1024" fill="${PLUM}"/>${mark(470, 560)}</svg>`;
const fav = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"><rect width="1024" height="1024" rx="200" fill="${PLUM}"/>${mark(512, 512, 1, true)}</svg>`;

// the social card: the mark at the left, the wordmark and the line at the right
const brand = readFileSync('src/ui/brand.ts', 'utf8');
const LETTERS = [...brand.matchAll(/'(M[^']+)'/g)].map((m) => m[1]).slice(0, 5);
const og = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630"><rect width="1200" height="630" fill="${PLUM}"/>
  ${mark(300, 330, 0.62)}
  <g transform="translate(620 214) scale(1.22) skewX(-10)" fill="${CREAM}" fill-rule="evenodd">${LETTERS.map((d) => `<path d="${d}"/>`).join('')}</g>
  <text x="622" y="420" style="font-family:'Big Shoulders Display';font-weight:900" font-size="58" letter-spacing="1" fill="${HOT}">A BAND ON YOUR DESK</text>
  <text x="622" y="470" style="font-family:'Big Shoulders Display';font-weight:800" font-size="32" letter-spacing="2" fill="${CREAM}" opacity="0.7">MIXED REALITY · META QUEST</text>
</svg>`;

writeFileSync('artifacts/hit-app.svg', app);
writeFileSync('artifacts/hit-fav.svg', fav);
writeFileSync('artifacts/hit-og.svg', og);
const FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@800;900&display=block">';
const page = (s) => `<!doctype html><html><head>${FONTS}</head><body style="margin:0">${s}</body></html>`;
writeFileSync(
  'artifacts/render-jobs.json',
  JSON.stringify([
    { html: page(app), w: 1024, h: 1024, out: 'artifacts/hit-app.png' },
    { html: page(fav), w: 1024, h: 1024, out: 'artifacts/hit-fav.png', transparent: true },
    { html: page(og), w: 1200, h: 630, out: 'artifacts/hit-og.png' },
  ]),
);
console.log('ok');
