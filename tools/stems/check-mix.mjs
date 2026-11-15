#!/usr/bin/env node
/**
 * Reads back every song's mix (artifacts/listen/<id>-mix.mp3, from tools/stems/make-stems.mjs) as a listen-check:
 * loudness and true peak, clipped samples, the spectrum by band, any near-silent bar (the intro to the last hit), and
 * the tune over the band: the lead stem's loudness against everything else's, over the whole song and its first four
 * bars. Writes artifacts/listen/check.json.
 *
 *   node tools/stems/check-mix.mjs [song-id …]
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

const ids = process.argv.slice(2);
const RATE = 44100;

function measure(file, extra = [], pre = []) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...pre, ...extra.flatMap((f) => ['-i', f]), '-filter_complex', `${extra.length > 1 ? `amix=inputs=${extra.length}:normalize=0,` : ''}loudnorm=print_format=json`, '-f', 'null', '-'], { encoding: 'utf8' });
  void file;
  const out = r.stderr;
  const j = JSON.parse(out.slice(out.lastIndexOf('{'), out.lastIndexOf('}') + 1));
  return { lufs: Number(j.input_i), peak: Number(j.input_tp) };
}
function decode(file) {
  const b = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-ac', '2', '-ar', String(RATE), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
}
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len)
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(a * k), wi = Math.sin(a * k);
        const xr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const xi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k + len / 2] = re[i + k] - xr;
        im[i + k + len / 2] = im[i + k] - xi;
        re[i + k] += xr;
        im[i + k] += xi;
      }
  }
}

const rows = [];
for (const f of readdirSync('artifacts/listen').filter((x) => x.endsWith('-mix.mp3')).sort()) {
  const id = f.replace(/-mix\.mp3$/, '');
  if (ids.length && !ids.includes(id)) continue;
  const plan = JSON.parse(readFileSync(`artifacts/stems/${id}/plan.json`, 'utf8'));
  const mix = JSON.parse(readFileSync(`artifacts/stems/${id}/mix.json`, 'utf8'));
  const spb = 60 / plan.bpm;
  const x = decode(`artifacts/listen/${f}`);
  const n = x.length / 2;
  let clip = 0;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) >= 0.999) clip++;
  const all = measure('', [`artifacts/listen/${f}`]);
  // bars: the intro's, then each to the last hit
  const bars = [];
  const barS = plan.meter * spb;
  for (let t = 0; t + barS <= (plan.end - plan.start) * spb + 1e-6; t += barS) {
    let s = 0;
    const a = Math.floor(t * RATE), z = Math.floor((t + barS) * RATE);
    for (let i = a; i < z; i++) s += x[2 * i] * x[2 * i] + x[2 * i + 1] * x[2 * i + 1];
    bars.push(10 * Math.log10(s / (2 * (z - a)) + 1e-12));
  }
  const sorted = [...bars].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  const empty = bars.map((v, i) => [i - 1, v]).filter(([, v]) => v < -45 || v < med - 18).map(([i]) => i);
  // spectrum
  const N = 4096;
  const pow = new Float64Array(N / 2);
  const win = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  for (let a = 0; a + N <= n; a += N) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = ((x[2 * (a + i)] + x[2 * (a + i) + 1]) / 2) * win[i];
    fft(re, im);
    for (let k = 0; k < N / 2; k++) pow[k] += re[k] * re[k] + im[k] * im[k];
  }
  const B = { sub: [20, 60], bass: [60, 250], lowmid: [250, 500], mid: [500, 2000], highmid: [2000, 6000], air: [6000, 20000] };
  const e = {};
  let tot = 0;
  for (const [k, [lo, hi]] of Object.entries(B)) {
    let s = 0;
    for (let i = Math.ceil((lo * N) / RATE); i < Math.min(N / 2, (hi * N) / RATE); i++) s += pow[i];
    e[k] = s;
    tot += s;
  }
  const bands = Object.fromEntries(Object.entries(e).map(([k, v]) => [k, Math.round((1000 * v) / tot) / 10]));
  // the tune over the band (the stems as mixed, before the master limiter): whole song, and its first four bars
  const lead = `artifacts/stems/${id}/lead.wav`;
  const others = mix.stems.filter((s) => s !== 'lead').map((s) => `artifacts/stems/${id}/${s}.wav`);
  let over = NaN, over4 = NaN;
  if (existsSync(lead) && others.length) {
    over = measure('', [lead]).lufs - measure('', others).lufs;
    const win4 = ['-ss', String(-plan.start * spb), '-t', String(Math.max(3.2, 4 * plan.meter * spb))];
    const l4 = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...win4, '-i', lead, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
    const o4 = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...others.flatMap((o) => [...win4, '-i', o]), '-filter_complex', `${others.length > 1 ? `amix=inputs=${others.length}:normalize=0,` : ''}loudnorm=print_format=json`, '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
    const L = (o) => Number(JSON.parse(o.slice(o.lastIndexOf('{'), o.lastIndexOf('}') + 1)).input_i);
    over4 = L(l4) - L(o4);
  }
  const r = { id, lufs: all.lufs, truePeak: all.peak, clipped: clip, bands, emptyBars: empty, quietestBar: Math.round(sorted[0] * 10) / 10, medianBar: Math.round(med * 10) / 10, tuneOverBand: Math.round(over * 10) / 10, tuneOverBand4: Math.round(over4 * 10) / 10 };
  rows.push(r);
  console.log(`${id.padEnd(18)} ${all.lufs.toFixed(1)} LUFS  TP ${all.peak.toFixed(1)}  clip ${clip}  tune/band ${r.tuneOverBand} dB (bars 1-4: ${r.tuneOverBand4})  bars ${med.toFixed(0)} dB median, quietest ${r.quietestBar}${empty.length ? `  QUIET BARS ${empty.join(',')}` : ''}  | ${Object.entries(bands).map(([k, v]) => `${k} ${v}`).join(' ')}`);
}
writeFileSync('artifacts/listen/check.json', JSON.stringify(rows, null, 1));
