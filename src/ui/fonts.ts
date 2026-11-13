/**
 * The headset's typeface: Barlow Condensed (SIL Open Font License, public/fonts/OFL.txt), a condensed grotesk
 * that reads like a drum module's legend and stays legible small and far. Canvas text is drawn once the faces
 * have loaded; until then the system face stands in, and anything already drawn is redrawn when they arrive.
 */
export const FONT = "'Barlow Condensed', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
/** Marker on tape: what musicians write on their gear and their setlists (Permanent Marker, Apache 2.0). */
export const MARKER = "'Permanent Marker', 'Barlow Condensed', system-ui, sans-serif";

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
    ...WEIGHTS.map(([weight, file]) => {
      const f = new FontFace('Barlow Condensed', `url(${base}${file})`, { weight });
      return f.load().then((ff) => document.fonts.add(ff));
    }),
    new FontFace('Permanent Marker', `url(${base}PermanentMarker-Regular.ttf)`).load().then((ff) => document.fonts.add(ff)),
  ])
    .then(() => {
      loaded = true;
      for (const fn of waiting.splice(0)) fn();
    })
    .catch(() => {
      /* the system face stays */
    });
}
