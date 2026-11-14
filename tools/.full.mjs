export default async function run({ page, frame }) { return await (frame ?? page).evaluate(() => { window.__thump.game.setShelf('pieces', 'full'); return true; }); }
