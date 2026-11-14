// Renders artifacts/render-jobs.json ([{ html, w, h, out, transparent }]) to PNGs in a fresh page of the managed browser.
// Run: npx @iwsdk/cli browser run tools/render-html.mjs
import { readFileSync, writeFileSync } from 'node:fs';
export default async function run({ page }) {
  const jobs = JSON.parse(readFileSync('artifacts/render-jobs.json', 'utf8'));
  const p = await page.context().newPage();
  const done = [];
  try {
    for (const j of jobs) {
      await p.setViewportSize({ width: j.w, height: j.h });
      await p.setContent(j.html, { waitUntil: 'load' });
      await p.evaluate(() => document.fonts.ready);
      await p.waitForTimeout(150);
      const buf = await p.screenshot({ clip: { x: 0, y: 0, width: j.w, height: j.h }, omitBackground: !!j.transparent });
      writeFileSync(j.out, buf);
      done.push(j.out);
    }
  } finally {
    await p.close();
  }
  return done;
}
