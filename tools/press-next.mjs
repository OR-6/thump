// Taps > on the module (as the game hears it), for tests.
export default async function run({ page, frame }) {
  return await (frame ?? page).evaluate(() => {
    const g = window.__thump?.game?.game;
    if (!g) return false;
    g.key('next');
    return g.mode;
  });
}
