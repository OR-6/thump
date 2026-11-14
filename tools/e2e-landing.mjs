#!/usr/bin/env node
/** The 2D page: no page errors, the pitch, the six instruments and the Enter button are there, the desk drawing plays,
 * settings write through, nothing scrolls sideways; a screenshot at desktop width. */
import { cli, run, xr, wait, check, done } from './e2e-lib.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';

if (xr('status').sessionActive) xr('exit');
run('tools/clear-storage.mjs');
cli('browser', 'reload');
await wait(3000);
run('tools/unblock-storage.mjs');
writeFileSync('tools/.probe.mjs', `export default async function run({ page, frame }) { const f = frame ?? page; return await f.evaluate(async () => {
  const el = document.getElementById('landing');
  const text = el?.innerText ?? '';
  const box = el?.querySelector('[data-k="highContrast"]');
  box.checked = true; box.dispatchEvent(new Event('change'));
  const saved = JSON.parse(localStorage.getItem('thump:settings.v1') || '{}');
  box.checked = false; box.dispatchEvent(new Event('change'));
  // every instrument draws on the desk, and a part of it lights when it's pressed
  const drawn = {};
  for (const b of el.querySelectorAll('.pick')) {
    b.click();
    const part = el.querySelector('.stage .part');
    part?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    drawn[b.dataset.inst] = { parts: el.querySelectorAll('.stage .part').length, lit: !!part?.classList.contains('lit') };
  }
  el.querySelector('.pick[data-inst="drums"]')?.click();
  return { shown: !!el && !el.hidden, text, enter: !!document.getElementById('enter-xr'), hc: saved.highContrast === true, drawn,
    wide: el.scrollWidth > el.clientWidth + 1, boot: !!document.getElementById('landing-boot') };
}); }\n`);
const r = run('tools/.probe.mjs');
const six = ['Drums', 'Piano', 'Marimba', 'Guitar', 'Congas', 'Handpan'];
check('the page is shown outside the headset', r.shown);
check('the loading shell is gone', !r.boot);
check('one line: a band on your desk', /A band on your desk/i.test(r.text), r.text.slice(0, 120));
check('all six instruments are named', six.every((n) => new RegExp(n, 'i').test(r.text)), six.filter((n) => !new RegExp(n, 'i').test(r.text)).join(', '));
check('each instrument is drawn and plays', six.every((n) => r.drawn[n.toLowerCase()]?.parts > 0 && r.drawn[n.toLowerCase()]?.lit), JSON.stringify(r.drawn));
check('play together: start a band or type a code', /Play together/i.test(r.text) && /Start a band/i.test(r.text), r.text.match(/Play together.{0,60}/i)?.[0] ?? '');
check('no desk-object pitch left', !/drum machine|your mug|chair arm/i.test(r.text), r.text.match(/drum machine|your mug|chair arm/i)?.[0] ?? '');
check('no felt-era copy left', !/felt|crowd|plush|loom/i.test(r.text), r.text.match(/felt|crowd|plush|loom/i)?.[0] ?? '');
check('Enter mixed reality is there', r.enter);
check('a setting writes through', r.hc);
check('nothing scrolls sideways', !r.wide);
mkdirSync('artifacts', { recursive: true });
cli('browser', 'screenshot', '--output-file', 'artifacts/landing-desktop.png');
done('E2E landing');
