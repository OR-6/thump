#!/usr/bin/env node
/**
 * Assembles the submission video from headset recordings, in one command, once the footage is in.
 *
 *   node tools/video-assemble.mjs artifacts/video/shots.json artifacts/video/thump.mp4
 *
 * shots.json is a list, in story order, of { "clip": "path.mp4", "in": 3.0, "out": 9.5, "card": "05-phone", "chip": "f-plane" }
 * (card: a PNG name in artifacts/video-cards without .png, or null; chip: an optional feature chip, top right). The title card opens, the end card
 * closes, each shot gets its text card faded in over it, and every clip is fitted to 1920x1080. The sound
 * is the game's own (the instruments and the real knocks the headset's microphone heard): no added music.
 * Needs ffmpeg. Keep the whole thing under 2:50 (judges may stop at 3:00).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const [list, out] = process.argv.slice(2);
if (!list || !out) {
  console.error('usage: node tools/video-assemble.mjs <shots.json> <out.mp4>');
  process.exit(1);
}
const shots = JSON.parse(readFileSync(list, 'utf8'));
const CARDS = 'artifacts/video-cards';
const tmp = join(dirname(out), '.assemble');
mkdirSync(tmp, { recursive: true });
const ff = (args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });

const parts = [];
// title card, 2.5 s, with a soft fade
ff(['-loop', '1', '-t', '2.5', '-i', `${CARDS}/00-title.png`, '-f', 'lavfi', '-t', '2.5', '-i', 'anullsrc=r=48000:cl=stereo', '-vf', 'fade=t=out:st=2.0:d=0.5,format=yuv420p', '-r', '30', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', `${tmp}/00.mp4`]);
parts.push(`${tmp}/00.mp4`);
shots.forEach((s, i) => {
  if (!existsSync(s.clip)) throw new Error(`missing clip: ${s.clip}`);
  const dur = s.out - s.in;
  const card = s.card ? `${CARDS}/${s.card}.png` : null;
  const chip = s.chip ? `${CARDS}/${s.chip}.png` : null;
  const name = `${tmp}/${String(i + 1).padStart(2, '0')}.mp4`;
  // fit to 1920x1080 (pad, never stretch); the card fades in after 0.4 s and out before the end
  const fit = 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1';
  if (card || chip) {
    const inputs = ['-ss', String(s.in), '-t', String(dur), '-i', s.clip];
    const overlays = [card, chip].filter(Boolean);
    for (const o of overlays) inputs.push('-loop', '1', '-t', String(dur), '-i', o);
    let fc = `[0:v]${fit}[v0]`;
    overlays.forEach((_, k) => {
      fc += `;[${k + 1}:v]format=rgba,fade=t=in:st=${0.4 + k * 0.3}:d=0.4:alpha=1,fade=t=out:st=${Math.max(0.8, dur - 0.5)}:d=0.4:alpha=1[c${k}];[v${k}][c${k}]overlay=0:0:format=auto[v${k + 1}]`;
    });
    fc += `;[v${overlays.length}]format=yuv420p[o]`;
    ff([...inputs, '-filter_complex', fc, '-map', '[o]', '-map', '0:a?', '-r', '30', '-c:v', 'libx264', '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-shortest', name]);
  } else {
    ff(['-ss', String(s.in), '-t', String(dur), '-i', s.clip, '-vf', `${fit},format=yuv420p`, '-r', '30', '-c:v', 'libx264', '-c:a', 'aac', '-ar', '48000', '-ac', '2', name]);
  }
  parts.push(name);
});
ff(['-loop', '1', '-t', '4', '-i', `${CARDS}/99-end.png`, '-f', 'lavfi', '-t', '4', '-i', 'anullsrc=r=48000:cl=stereo', '-vf', 'fade=t=in:st=0:d=0.5,format=yuv420p', '-r', '30', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', `${tmp}/99.mp4`]);
parts.push(`${tmp}/99.mp4`);

// join
const listFile = `${tmp}/list.txt`;
writeFileSync(listFile, parts.map((p) => `file '${resolve(p)}'`).join('\n') + '\n');
ff(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', out]);
const total = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], { encoding: 'utf8' }).trim());
console.log(`wrote ${out} (${total.toFixed(1)} s)`);
