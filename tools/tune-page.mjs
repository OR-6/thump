// Opens the tuning page the way a player does (◀ twice, then ◀ twice in Settings) and steps Speed up once, for E2E.
export default async function run({ page, frame }) {
  return await (frame ?? page).evaluate(async () => {
    const g = window.__thump?.game?.game;
    if (!g) return null;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    for (const k of ['prev', 'prev']) { g.key(k); await wait(150); }
    const settings = g.settingsOpen;
    await wait(1000);
    for (const k of ['prev', 'prev']) { g.key(k); await wait(150); }
    const before = g.display.line;
    g.key('loop');
    return { settings, tune: g.tuneOpen, before, after: g.display.line, sub: g.display.sub, labels: g.display.keyLabels, unlocks: g.progress.unlocks };
  });
}
