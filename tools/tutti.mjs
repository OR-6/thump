// Plays the whole-room chord (as a two-hand slam would) in the running app, for E2E: the emulator can't move both hands at once.
export default async function run({ page, frame }) {
  return await (frame ?? page).evaluate(() => {
    const r = window.__thump?.game;
    if (!r) return null;
    r.tutti(0.9);
    return true;
  });
}
