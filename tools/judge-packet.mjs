#!/usr/bin/env node
// Builds the judge-visible packet (what a Devpost judge reads) from SUBMISSION.md: tagline, About,
// try-it link, capability answers and judge steps. Never [UPDATE]/[FILL] lines or internal notes.
// Usage: node tools/judge-packet.mjs OUT.md
import { readFileSync, writeFileSync } from 'node:fs';
const m = readFileSync('SUBMISSION.md', 'utf8')
  .split('\n')
  .filter((l) => !/\[(UPDATE|FILL)/.test(l))
  .join('\n');
const out = m.replace(/^# Thump: Devpost submission/, '# Thump: Devpost submission (as judges see it)');
writeFileSync(process.argv[2] ?? 'judge-packet.md', out);
console.log(`${out.split(/\s+/).length} words`);
