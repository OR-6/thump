#!/usr/bin/env node
/**
 * The website's pictures (public/site/*.webp), cut tight from the game's captures: the submission stills (3:2, over
 * the site's plum) and tools/site-shots.mjs's 1280x720 frames. Each is a crop box in its source's pixels, scaled to
 * 1200x800 and written as WebP. Needs ffmpeg and cwebp.
 *   node tools/site-crops.mjs [--sheet]   (--sheet: also a contact sheet in the scratch folder given by $SHEET)
 * Sources: $SUB (default ../../../artifacts/submission from a worktree, artifacts/submission otherwise) and
 * artifacts/site-cap.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SUB = process.env.SUB ?? (existsSync('artifacts/submission') ? 'artifacts/submission' : '../../../artifacts/submission');
const CAP = 'artifacts/site-cap';
/** name: [source, crop w, h, x, y] */
const CROPS = {
  drums: [`${SUB}/02-drums-perfect.jpg`, 840, 560, 0, 40],
  guitar: [`${SUB}/01-guitar-on-your-lap.jpg`, 840, 560, 0, 20],
  piano: [`${CAP}/piano-1.png`, 810, 540, 235, 180],
  marimba: [`${CAP}/marimba-0.png`, 1000, 667, 140, 53],
  congas: [`${SUB}/08-congas.jpg`, 690, 460, 105, 70],
  handpan: [`${CAP}/handpan-2.png`, 780, 520, 250, 200],
  lesson: [`${SUB}/03-lesson-now.jpg`, 690, 460, 0, 135],
  results: [`${SUB}/10-results-S.jpg`, 840, 560, 30, 10],
};
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const tmp = join(tmpdir(), 'thump-crops');
mkdirSync(tmp, { recursive: true });
const ff = (args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
for (const [name, [src, w, h, x, y]] of Object.entries(CROPS)) {
  if (only.length && !only.includes(name)) continue;
  const png = join(tmp, `${name}.png`);
  ff(['-i', src, '-vf', `crop=${w}:${h}:${x}:${y},scale=1200:800:flags=lanczos`, png]);
  execFileSync('cwebp', ['-quiet', '-q', '80', '-m', '6', png, '-o', `public/site/${name}.webp`]);
  console.log(`public/site/${name}.webp`);
}
if (process.argv.includes('--sheet') && process.env.SHEET) {
  const names = Object.keys(CROPS);
  const ins = names.flatMap((n) => ['-i', join(tmp, `${n}.png`)]);
  const row = (a) => `${a.map((i) => `[${i}]`).join('')}hstack=${a.length}`;
  ff([...ins, '-filter_complex', `${row([0, 1, 2])}[a];${row([3, 4, 5])}[b];${row([6, 7, 7])}[c];[a][b][c]vstack=3,scale=1800:-1`, process.env.SHEET]);
}
rmSync(tmp, { recursive: true, force: true });
