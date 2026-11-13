#!/usr/bin/env node
/** Runs every emulator E2E suite in turn (needs `npx @iwsdk/cli dev up --allow-browser-automation`). Retries a failed suite once. */
import { spawnSync } from 'node:child_process';
const suites = [['room', '--song'], ['landing']];
let failed = 0;
for (const [s, ...args] of suites) {
  const go = () => spawnSync('node', [`tools/e2e-${s}.mjs`, ...args], { encoding: 'utf8' });
  let r = go();
  const last = (r.stdout || '').trim().split('\n').pop();
  let ok = r.status === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${s.padEnd(11)} ${last ?? ''}`);
  if (!ok) {
    for (const l of `${r.stdout || ''}\n${r.stderr || ''}`.split('\n').filter((x) => x.startsWith('FAIL  ') || /Error/.test(x)).slice(0, 4)) console.log(`        ${l.slice(0, 220)}`);
    r = go();
    ok = r.status === 0;
    console.log(ok ? '        retried: PASS (flaky)' : '        retried: FAIL');
  }
  if (!ok) failed++;
}
console.log(failed ? `\n${failed} suite(s) failed` : '\nALL SUITES PASS');
process.exit(failed ? 1 : 0);
