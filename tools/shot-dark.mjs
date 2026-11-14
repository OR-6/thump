// The game's canvas over the site's plum instead of the emulator's grey room (for the website's captures): hides the
// emulated room's canvas, screenshots the game's own canvas, and writes artifacts/shot-dark.png (the emulator view's
// size, about 756 x 470).
// Run: npx @iwsdk/cli browser run tools/shot-dark.mjs
import { writeFileSync } from 'node:fs';
export default async function run({ page, frame }) {
  const f = frame ?? page;
  // (the emulator's and the editor's own badges float over the view: hidden for the shot, in the page and the frame)
  const hide = () => {
    for (const el of document.querySelectorAll('body *')) {
      const st = getComputedStyle(el);
      if ((st.position === 'fixed' || st.position === 'absolute') && el.tagName !== 'CANVAS' && !el.querySelector('canvas, iframe') && el.tagName !== 'IFRAME') {
        el.dataset.shotHidden = el.style.visibility || '-';
        el.style.visibility = 'hidden';
      }
    }
  };
  const show = () => {
    for (const el of document.querySelectorAll('[data-shot-hidden]')) {
      el.style.visibility = el.dataset.shotHidden === '-' ? '' : el.dataset.shotHidden;
      delete el.dataset.shotHidden;
    }
  };
  await page.evaluate(hide);
  if (frame) await frame.evaluate(hide);
  await f.evaluate(() => {
    // (the room is the fixed canvas under the app's)
    for (const c of document.querySelectorAll('canvas')) if (getComputedStyle(c).position === 'fixed' && getComputedStyle(c).zIndex === '1') c.style.visibility = 'hidden';
    document.documentElement.style.background = '#1d0b2c';
    document.body.style.background = '#1d0b2c';
  });
  await new Promise((r) => setTimeout(r, 300));
  // (the game's own canvas: the static one between the room and the emulator's overlay)
  const cs = f.locator('canvas');
  let buf = null;
  for (let i = 0; i < (await cs.count()); i++) {
    const c = cs.nth(i);
    if ((await c.evaluate((e) => getComputedStyle(e).position)) === 'static') buf = await c.screenshot({ type: 'png' });
  }
  buf ??= await page.screenshot({ type: 'png' });
  writeFileSync('artifacts/shot-dark.png', buf);
  await f.evaluate(() => {
    for (const c of document.querySelectorAll('canvas')) c.style.visibility = '';
  });
  await page.evaluate(show);
  if (frame) await frame.evaluate(show);
  return 'ok';
}
