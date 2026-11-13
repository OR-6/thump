#!/usr/bin/env node
/** Runs every emulator E2E suite in turn (needs `npx @iwsdk/cli dev up --allow-browser-automation`). */
import { spawnSync } from 'node:child_process';
const suites = ['m0', 'm1', 'm2', 'm3', 'cloth', 'coop', 'plush-sing', 'desk', 'resume', 'daily', 'visit', 'quilt', 'nap', 'card', 'music-box', 'sea-swap', 'tooltip', 'finale', 'grand', 'caller', 'phone', 'pads', 'friend', 'gaze', 'delight', 'pet', 'look', 'practice', 'move', 'ear', 'settings', 'mend', 'pace', 'landing'];
let failed = 0;
for (const s of suites) {
  const r = spawnSync('node', [`tools/e2e-${s}.mjs`], { encoding: 'utf8' });
  const last = (r.stdout || '').trim().split('\n').pop();
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${s.padEnd(11)} ${last ?? ''}`);
  if (ok) continue;
  // which checks failed (or the error), so a flaky suite can be told from a real break
  const lines = `${r.stdout || ''}\n${r.stderr || ''}`.split('\n');
  for (const l of lines.filter((x) => x.startsWith('FAIL  ') || /Error/.test(x)).slice(0, 4)) console.log(`        ${l.slice(0, 220)}`);
  // retry once: the emulator sometimes needs a moment after the previous suite's reload
  const again = spawnSync('node', [`tools/e2e-${s}.mjs`], { encoding: 'utf8' });
  if (again.status === 0) {
    failed--;
    console.log(`        retried: PASS (flaky)`);
  }
}
console.log(failed ? `\n${failed} suite(s) failed` : '\nALL SUITES PASS');
process.exit(failed ? 1 : 0);
