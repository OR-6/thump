// A 1920x1080 screenshot of the app's canvas (the emulated headset view), for contact sheets.
// Run: npx @iwsdk/cli browser run tools/shot-hd.mjs   (writes artifacts/shot-hd.png)
import { writeFileSync } from 'node:fs';
export default async function run({ page, frame }) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await new Promise((r) => setTimeout(r, 700));
  const f = frame ?? page;
  const buf = await f.locator('canvas').first().screenshot();
  writeFileSync('artifacts/shot-hd.png', buf);
  const size = await f.evaluate(() => { const c = document.querySelector('canvas'); return [c.width, c.height]; });
  return size;
}
