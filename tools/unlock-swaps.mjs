// Grants the swaps unlock in the running app (as if Kitchen Clock were played), for E2E.
export default async function run({ page, frame }) {
  return await (frame ?? page).evaluate(() => {
    const p = window.__thump?.game?.game?.progress;
    if (!p) return 'no app';
    if (!p.unlocks.includes('swaps')) p.unlocks.push('swaps');
    return p.unlocks.join(',');
  });
}
