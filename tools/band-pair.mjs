// Two more pages of the app in the managed browser: one starts a band, the other joins with its code, then a pad
// tapped on the joiner's page must be heard on the host's (and one on the host's by the joiner). Returns what happened.
export default async function run({ page }) {
  const ctx = page.context();
  const url = new URL(page.url());
  const app = page.frames().find((f) => /localhost|127\.0\.0\.1/.test(f.url()) && !/editor/.test(f.url()))?.url() ?? url.href;
  const base = new URL(app);
  base.search = '';
  const a = await ctx.newPage();
  const b = await ctx.newPage();
  const out = { host: '', join: '', aHeard: 0, bHeard: 0, code: '', err: '', aMode: '', bMode: '', beatGap: -1 };
  try {
    await a.goto(base.href, { waitUntil: 'load' });
    await b.goto(base.href, { waitUntil: 'load' });
    await a.waitForSelector('#band-start', { timeout: 15000 });
    await a.click('#band-start');
    await a.waitForFunction(() => /Your code: [A-Z]{4}/.test(document.querySelector('#band-status')?.textContent ?? ''), null, { timeout: 20000 });
    out.host = await a.textContent('#band-status');
    out.code = out.host.match(/Your code: ([A-Z]{4})/)[1];
    await b.waitForSelector('#band-code', { timeout: 15000 });
    await b.fill('#band-code', out.code);
    await b.click('#band-join');
    await b.waitForFunction(() => /in the band/.test(document.querySelector('#band-status')?.textContent ?? ''), null, { timeout: 20000 });
    await a.waitForFunction(() => /in the band/.test(document.querySelector('#band-status')?.textContent ?? ''), null, { timeout: 20000 });
    out.join = await b.textContent('#band-status');
    // a pad on each page: the other hears it
    const heard = (p) => p.evaluate(() => window.__thump?.debug?.friendNotes ?? 0);
    await b.dispatchEvent('.pad[data-k="p"]', 'pointerdown');
    await b.dispatchEvent('.pad[data-k="d"]', 'pointerdown');
    await a.dispatchEvent('.pad[data-k="h"]', 'pointerdown');
    await a.waitForTimeout(2500);
    out.aHeard = await heard(a);
    out.bHeard = await heard(b);
    // one beat: the friend presses play; the host starts the song for both, on the band's clock
    await b.waitForTimeout(2500);
    await b.evaluate(() => window.__thump.game.game.key('play'));
    await a.waitForTimeout(2500);
    const beat = (p) => p.evaluate(() => {
      const r = window.__thump.game;
      return { mode: r.game.mode, beat: r.game.clock.beatAt(r.clock.t), at: performance.now() };
    });
    const [ra, rb] = await Promise.all([beat(a), beat(b)]);
    out.aMode = ra.mode;
    out.bMode = rb.mode;
    // (the two reads are a few ms apart: allow for that at the song's tempo)
    out.beatGap = Math.abs(ra.beat - rb.beat - ((ra.at - rb.at) / 1000) * (92 / 60));
  } catch (e) {
    out.err = String(e).slice(0, 300);
  } finally {
    await a.close();
    await b.close();
  }
  return out;
}
