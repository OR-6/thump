// Runs several key-art renders (tools/keyart.mjs) and makes a sheet over plum. node tools/keyart-batch.mjs tools/keyart-shots.json (after tools/look.mjs or e2e-lib placeKit has the kit on the desk; no ?autoplay)
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const list = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const outs = [];
for (const cfg of list) {
  writeFileSync('artifacts/keyart-cfg.json', JSON.stringify(cfg));
  execFileSync('npx', ['@iwsdk/cli', 'browser', 'run', 'tools/keyart.mjs']);
  outs.push(cfg.out);
}
const n = outs.length;
const args = ['-v', 'error', '-y'];
for (const o of outs) args.push('-f', 'lavfi', '-i', 'color=c=0x1a0d38:s=1600x1600', '-i', o);
let fc = '';
outs.forEach((_, i) => (fc += `[${2 * i}][${2 * i + 1}]overlay,scale=500:500[v${i}];`));
fc += outs.map((_, i) => `[v${i}]`).join('') + `hstack=inputs=${n}`;
args.push('-filter_complex', n > 1 ? fc : fc.replace(/\[v0\]hstack=inputs=1$/, '').replace(/;$/, '').replace('[v0]', ''), '-frames:v', '1', 'artifacts/ka-sheet.jpg');
execFileSync('ffmpeg', args);
console.log(outs.join(' '));
