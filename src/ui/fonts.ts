/**
 * The headset's typeface: Barlow Condensed (SIL Open Font License, public/fonts/OFL.txt), a condensed grotesk
 * that reads like a drum module's legend and stays legible small and far. Canvas text is drawn once the faces
 * have loaded; until then the system face stands in, and anything already drawn is redrawn when they arrive.
 */
/** The panel's face: a clean grotesque (the system's: Roboto on Quest), never condensed. */
export const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
/**
 * Thump's own type, the same as the site's (index.html loads both): Big Shoulders Display, heavy and condensed, set
 * upright, for words and numbers you read at a glance; Atkinson Hyperlegible for anything you read as a sentence.
 */
export const DISPLAY = `'Big Shoulders Display', 'Barlow Condensed', ${FONT}`;
export const BODY = `'Atkinson Hyperlegible', ${FONT}`;

const WEIGHTS: [string, string][] = [
  ['500', 'BarlowCondensed-Medium.ttf'],
  ['600', 'BarlowCondensed-SemiBold.ttf'],
  ['700', 'BarlowCondensed-Bold.ttf'],
];

let loaded = false;
const waiting: (() => void)[] = [];

/** Run `fn` once the faces are in (at once if they already are). */
export function whenFonts(fn: () => void): void {
  if (loaded) fn();
  else waiting.push(fn);
}

export function loadFonts(): void {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return;
  const base = `${import.meta.env?.BASE_URL ?? './'}fonts/`;
  Promise.all([
    // (the brand's faces come from the page's stylesheet: wait for the weights the canvas uses)
    ...['900 40px "Big Shoulders Display"', '800 40px "Big Shoulders Display"', '700 40px "Atkinson Hyperlegible"', '400 40px "Atkinson Hyperlegible"'].map((f) => document.fonts.load(f).catch(() => [])),
    ...WEIGHTS.map(([weight, file]) => {
      const f = new FontFace('Barlow Condensed', `url(${base}${file})`, { weight });
      return f.load().then((ff) => document.fonts.add(ff));
    }),
  ])
    .then(() => {
      loaded = true;
      for (const fn of waiting.splice(0)) fn();
    })
    .catch(() => {
      /* the system face stays */
    });
}
