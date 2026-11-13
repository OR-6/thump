// Swaps the first found room instrument in the running app (as a pinch and hold would), for E2E.
export default async function run({ page, frame }) {
  return await (frame ?? page).evaluate(() => {
    const r = window.__thump?.game;
    if (!r) return null;
    const s = r.surfaces.find((x) => x.discovered && (x.source === 'plane' || x.source === 'volume') && x.natural);
    if (!s) return null;
    r.swap(s);
    return { id: s.id, natural: s.natural, family: s.voice?.family };
  });
}
