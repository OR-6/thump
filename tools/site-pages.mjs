// Full-page screenshots of the site at 1440, 768 and 390 px wide (artifacts/site-1440.png, site-768.png,
// site-390.png), each as it shows there (?where=: a computer, a computer, a phone), in a fresh page of the managed
// browser; and whether anything scrolls sideways at that width.
// Run: npx @iwsdk/cli browser run tools/site-pages.mjs --timeout 120000
import { writeFileSync } from 'node:fs';
const SIZES = [
  { w: 1440, h: 900, where: 'desk' },
  { w: 768, h: 1024, where: 'desk' },
  { w: 390, h: 844, where: 'phone' },
];
export default async function run({ page, frame }) {
  const base = new URL((frame ?? page).url());
  const p = await page.context().newPage();
  const out = [];
  try {
    for (const s of SIZES) {
      await p.setViewportSize({ width: s.w, height: s.h });
      await p.goto(`${base.origin}/?nocoach=1&where=${s.where}`, { waitUntil: 'load' });
      await p.waitForSelector('#landing .pick', { timeout: 30000 });
      await p.evaluate(() => document.fonts.ready);
      await p.waitForTimeout(800);
      const wide = await p.evaluate(() => {
        const el = document.getElementById('landing');
        return el.scrollWidth > el.clientWidth + 1;
      });
      // (the page is its own scroller: let it flow so the whole of it is in one shot, every picture loaded)
      await p.addStyleTag({ content: '#landing{position:static!important;overflow:visible!important;height:auto!important} html,body{height:auto!important}' });
      await p.evaluate(async () => {
        const imgs = [...document.querySelectorAll('#landing img')];
        imgs.forEach((i) => ((i.loading = 'eager'), (i.decoding = 'sync')));
        // (down the page and back, so every lazy picture is fetched and painted)
        for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 60));
        }
        await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => (i.onload = i.onerror = r)))));
        window.scrollTo(0, 0);
      });
      await p.waitForTimeout(1200);
      const file = `artifacts/site-${s.w}.png`;
      writeFileSync(file, await p.screenshot({ fullPage: true }));
      out.push({ file, wide });
    }
  } finally {
    await p.close();
  }
  return out;
}
