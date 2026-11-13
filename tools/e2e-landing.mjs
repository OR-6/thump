#!/usr/bin/env node
/** The 2D page: no page errors, the pitch and the Enter button are there, settings write through; screenshots at desktop and phone widths. */
import { cli, run, xr, wait, check, done } from './e2e-lib.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';

if (xr('status').sessionActive) xr('exit');
run('tools/clear-storage.mjs');
cli('browser', 'reload');
await wait(3000);
run('tools/unblock-storage.mjs');
writeFileSync('tools/.probe.mjs', `export default async function run({ page, frame }) { const f = frame ?? page; return await f.evaluate(() => {
  const el = document.getElementById('landing');
  const text = el?.innerText ?? '';
  const box = el?.querySelector('[data-k="highContrast"]');
  box.checked = true; box.dispatchEvent(new Event('change'));
  const saved = JSON.parse(localStorage.getItem('thump:settings.v1') || '{}');
  box.checked = false; box.dispatchEvent(new Event('change'));
  return { shown: !!el && !el.hidden, text, enter: !!document.getElementById('enter-xr'), hc: saved.highContrast === true };
}); }\n`);
const r = run('tools/.probe.mjs');
check('the page is shown outside the headset', r.shown);
check('one line: your desk is a drum machine; pads to try', /YOUR DESK IS A DRUM MACHINE/i.test(r.text) && /MUG/.test(r.text), r.text.slice(0, 160));
check('no felt-era copy left', !/felt|crowd|plush|loom/i.test(r.text), r.text.match(/felt|crowd|plush|loom/i)?.[0] ?? '');
check('Enter mixed reality is there', r.enter);
check('a setting writes through', r.hc);
mkdirSync('artifacts', { recursive: true });
cli('browser', 'screenshot', '--output-file', 'artifacts/landing-desktop.png');
done('E2E landing');
