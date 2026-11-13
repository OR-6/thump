// Presses MAKE IT YOURS on the results (as the game hears it), for tests.
export default async function run({ page, frame }) {
  return await (frame ?? page).evaluate(() => {
    const g = window.__thump?.game?.game;
    if (!g) return false;
    g.act('make');
    return g.mode;
  });
}
