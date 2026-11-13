#!/usr/bin/env node
// Builds the judge-visible packet (what a Devpost judge reads) from SUBMISSION-META.md: the pitch,
// About, try-it link, gallery captions, capability answers and judge steps. Never the [FILL] lines,
// internal notes, video script or award map. Usage: node tools/judge-packet.mjs OUT.md
import { readFileSync, writeFileSync } from 'node:fs';
const m = readFileSync('SUBMISSION-META.md', 'utf8');
const between = (a, b) => {
  const i = m.indexOf(a);
  const j = m.indexOf(b, i + a.length);
  if (i < 0 || j < 0) throw new Error(`section not found: ${a}`);
  return m.slice(i, j).trim();
};
const pitch = m.match(/\*\*Elevator pitch\*\*[^\n]*\n```\n([^`]+)```/)[1].trim();
const parts = [
  '# Loomsong: Devpost submission (as judges see it)',
  `## Elevator pitch\n${pitch}`,
  between('### About the project (Markdown)', '### Built with'),
  'Try it: https://or-6.github.io/loomsong/',
  between('### Image gallery', '### Demonstration video').replace(/^From the final build[^\n]*\n/m, ''),
  between('### What Meta VR capability(ies) did you use?', '### Target launch date'),
  between('## 6. Judge instructions', '## 7. Award map').replace('## 6. Judge instructions (also in the README)', '## Judge instructions').replace(/\n---\s*$/, ''),
];
const out = parts.join('\n\n');
if (/FILL|PENDING/.test(out)) throw new Error('packet has [FILL] lines');
writeFileSync(process.argv[2] ?? 'judge-packet.md', out);
console.log(`${out.split(/\s+/).length} words`);
