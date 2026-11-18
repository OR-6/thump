#!/usr/bin/env node
/**
 * The songs' backing tracks, rendered and mixed: arranges each song (tools/stems/arrange-stems.ts, from the game's own
 * score), renders every stem with FluidSynth on the GeneralUser GS SoundFont, then mixes each stem as a track in a
 * mix would be: EQ (the low end left to the kick and the bass), compression, the bass and the keys ducking under the
 * kick (a sidechain), and a convolution reverb (a hall's tail, made here) on its own send. The whole is set to about
 * −14 LUFS and each stem is encoded as Opus in WebM for public/songs/<id>/ (stems.json beside them, `start` the beat its
 * time 0 is: the count-in bar is the intro). The full mix, limited as a finished track, goes to
 * artifacts/listen/<id>-mix.mp3; tools/stems/check-mix.mjs reads them all back.
 *
 *   node tools/stems/make-stems.mjs [song-id …] --sf2 path/to/GeneralUser-GS.sf2 --grand path/to/SalamanderGrandPiano.sf2
 *        [--remix: only mix again from the stems already rendered]
 *
 * Needs fluidsynth and ffmpeg (with libopus) on the PATH.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const sf2 = opt('sf2', process.env.THUMP_SF2 ?? '');
if (!REMIX_ARG() && (!sf2 || !existsSync(sf2))) throw new Error('--sf2 <GeneralUser-GS.sf2> is needed');
function REMIX_ARG() {
  return process.argv.includes('--remix');
}
const ids = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')) && a !== '--remix');
/** Only mix again, from the stems already rendered (artifacts/stems/<id>/<stem>.wav). */
const REMIX = args.includes('--remix');
const TARGET = -14;
const RATE = 44100;

if (!REMIX) execFileSync('npx', ['vite-node', 'tools/stems/arrange-stems.ts', ...ids], { stdio: ['ignore', 'inherit', 'inherit'] });

const run = (cmd, a) => execFileSync(cmd, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 });
const ff = (a) => run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...a]);

/** Integrated loudness, true peak and loudness range of a file (ffmpeg's loudnorm, measuring: it reports on stderr). */
export function measure(file, extra = []) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...extra, '-i', file, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], { encoding: 'utf8' });
  const out = r.stderr;
  const j = JSON.parse(out.slice(out.lastIndexOf('{'), out.lastIndexOf('}') + 1));
  return { lufs: Number(j.input_i), peak: Number(j.input_tp), lra: Number(j.input_lra) };
}

/** A hall's impulse response (2.4 s): early reflections, then decorrelated noise in each ear, decaying and darkening. */
function hall(file, seconds = 2.4) {
  const n = Math.floor(RATE * seconds);
  const pcm = new Float32Array(n * 2);
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  for (let ch = 0; ch < 2; ch++) {
    for (const [ms, a] of [[13, 0.5], [19, 0.35], [27, 0.3], [37, 0.22], [53, 0.16]]) pcm[2 * Math.floor((RATE * (ms + ch * 3)) / 1000) + ch] += a * (ch ? -1 : 1);
    let lp = 0;
    const pre = Math.floor(RATE * 0.022);
    for (let i = pre; i < n; i++) {
      const k = (i - pre) / (n - pre);
      const cut = 7000 * Math.pow(900 / 7000, k);
      lp += (1 - Math.exp((-2 * Math.PI * cut) / RATE)) * (rnd() - lp);
      pcm[2 * i + ch] += lp * Math.pow(1 - k, 2.6) * Math.min(1, (i - pre) / (RATE * 0.01)) * 0.6;
    }
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.byteLength, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(3, 20);
  h.writeUInt16LE(2, 22);
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 8, 28);
  h.writeUInt16LE(8, 32);
  h.writeUInt16LE(32, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.byteLength, 40);
  writeFileSync(file, Buffer.concat([h, Buffer.from(pcm.buffer)]));
}

/** Each stem's channel: its EQ and compression. */
const FX = {
  drums: 'highpass=f=30,equalizer=f=60:t=q:w=1:g=2,equalizer=f=350:t=q:w=1.2:g=-2.5,equalizer=f=5000:t=q:w=1:g=2,acompressor=threshold=-16dB:ratio=3:attack=10:release=110:makeup=2',
  perc: 'highpass=f=180,equalizer=f=7000:t=q:w=1:g=1.5,acompressor=threshold=-18dB:ratio=2.5:attack=5:release=100',
  bass: 'highpass=f=32,equalizer=f=80:t=q:w=1:g=1.5,equalizer=f=250:t=q:w=1:g=-2,lowpass=f=5000,acompressor=threshold=-20dB:ratio=4:attack=12:release=150:makeup=3',
  lead: 'highpass=f=140,equalizer=f=300:t=q:w=1:g=-2,equalizer=f=3000:t=q:w=1.2:g=2.5,acompressor=threshold=-20dB:ratio=3:attack=8:release=160:makeup=2',
  guitar: 'highpass=f=120,equalizer=f=300:t=q:w=1:g=-2,acompressor=threshold=-18dB:ratio=2.5:attack=10:release=150',
  keys: 'highpass=f=130,equalizer=f=320:t=q:w=1:g=-2.5,acompressor=threshold=-20dB:ratio=2:attack=15:release=200',
  strings: 'highpass=f=120,equalizer=f=300:t=q:w=1:g=-2,acompressor=threshold=-20dB:ratio=2:attack=20:release=250',
  brass: 'highpass=f=120,equalizer=f=300:t=q:w=1:g=-2,acompressor=threshold=-18dB:ratio=2.5:attack=10:release=180',
};
/** The grand's top end: a shelf from 2.5 kHz and air from 8 kHz. */
const GRAND_EQ = 'highshelf=f=2500:g=6:t=q:w=0.7,highshelf=f=8000:g=6:t=q:w=0.7';
/** A song's own touches: Scarborough Fair's guitar opened up (the General MIDI bank's are dark), a lighter low end where
 * it crowded the piano. */
const BALLAD_EQ = { bass: 'volume=-3dB', keys: 'highshelf=f=3000:g=4:t=q:w=0.7' };
const SONG_EQ = {
  'scarborough-fair': { guitar: 'highshelf=f=2000:g=8:t=q:w=0.7,highshelf=f=7000:g=4:t=q:w=0.7' },
  // (the hymn's organ and basses less heavy, the room for the grand)
  'amazing-grace': { keys: 'highpass=f=220,highshelf=f=3000:g=4:t=q:w=0.7', bass: 'volume=-3dB', strings: 'highpass=f=200' },
  // (the ballad lessons' bass and pads a step back)
  'learn-piano': BALLAD_EQ,
  'learn-marimba': BALLAD_EQ,
  'learn-guitar': BALLAD_EQ,
  'learn-handpan': BALLAD_EQ,
  // (Late Bus is lo-fi: the grand and the Rhodes with their tops rolled off, the grand's lift taken back; the Rhodes up,
  // the bass and the kick's boom down, the hats a little brighter)
  'late-bus': { lead: 'highshelf=f=2500:g=-3:t=q:w=0.7,lowpass=f=7000', keys: 'lowpass=f=6500,volume=4dB', bass: 'volume=-3dB,equalizer=f=180:t=q:w=1:g=-2', drums: 'equalizer=f=60:t=q:w=1:g=-2,highshelf=f=4000:g=3:t=q:w=0.7' },
};
/** How much of each goes to the hall. */
const WET = { drums: 0.1, perc: 0.16, bass: 0, lead: 0.2, guitar: 0.2, keys: 0.28, strings: 0.34, brass: 0.24 };
/** Which duck under the kick, and how hard (ratio). */
const DUCK = { bass: 5, keys: 2.2, strings: 1.8, guitar: 1.6, brass: 1.6 };
/** Each stem's place in the mix (dB) before the whole is set to −14 LUFS: the tune on top, the drums under it. */
/** The tune's loudness over the rest of the band (dB), and the piano pieces where the right hand leads more. */
const TUNE = 3;
const SOLO_PIANO = new Set(['fur-elise', 'turkish-march', 'entertainer']);
const LEVEL = { lead: 2.5, drums: -2.5, perc: -6, bass: -1.5, guitar: -4, keys: -4.5, strings: -5, brass: -4.5 };
/** Opus at about 96 kb/s a stereo stem; the bass, the tune and the percussion mono (half the memory once decoded). */
const MONO = new Set(['bass', 'lead', 'perc']);
const BITRATE = { drums: '96k', perc: '56k', bass: '56k', lead: '72k', guitar: '96k', keys: '96k', strings: '96k', brass: '96k' };

const root = 'artifacts/stems';
mkdirSync('artifacts/listen', { recursive: true });
const IR = `${root}/hall.wav`;
hall(IR);
/** The concert grand (Salamander Grand Piano, an SF2 build of it) for every piano part, and its level against the
 * General MIDI bank's (dB). */
const grandSf2 = opt('grand', process.env.THUMP_GRAND ?? '');
const GRAND_DB = Number(opt('grand-db', '0'));
const fluid = (mid, wav, font = sf2, db = 0) => run('fluidsynth', ['-ni', '-q', '-g', (0.6 * Math.pow(10, db / 20)).toFixed(3), '-r', String(RATE), '-O', 'float', '-T', 'wav', '-o', 'synth.reverb.room-size=0.4', '-o', 'synth.reverb.damp=0.4', '-o', 'synth.reverb.width=0.8', '-o', 'synth.reverb.level=0.3', '-o', 'synth.chorus.depth=3.6', '-o', 'synth.chorus.level=0.55', '-o', 'synth.chorus.nr=4', '-o', 'synth.chorus.speed=0.36', '-o', 'synth.polyphony=512', '-F', wav, font, mid]);

for (const id of readdirSync(root)) {
  if (ids.length && !ids.includes(id)) continue;
  const dir = `${root}/${id}`;
  if (!existsSync(`${dir}/plan.json`)) continue;
  const plan = JSON.parse(readFileSync(`${dir}/plan.json`, 'utf8'));
  const secs = plan.seconds.toFixed(3);
  const key = `${dir}/kick.key.wav`;
  if (plan.key && !REMIX) fluid(`${dir}/kick.key.mid`, key);
  const done = [];
  for (const st of plan.stems) {
    if (REMIX) {
      if (existsSync(`${dir}/${st.id}.wav`)) done.push(st.id);
      continue;
    }
    const raw = `${dir}/${st.id}.raw.wav`;
    // the General MIDI part and the grand's, rendered apart and laid together
    const gmPart = st.gm !== false;
    const grandPart = !!st.grand && !!grandSf2;
    if (gmPart && !grandPart) fluid(`${dir}/${st.id}.mid`, raw);
    else if (grandPart && !gmPart) fluid(`${dir}/${st.id}.grand.mid`, raw, grandSf2, GRAND_DB);
    else {
      fluid(`${dir}/${st.id}.mid`, `${dir}/${st.id}.gm.wav`);
      fluid(`${dir}/${st.id}.grand.mid`, `${dir}/${st.id}.grand.wav`, grandSf2, GRAND_DB);
      ff(['-i', `${dir}/${st.id}.gm.wav`, '-i', `${dir}/${st.id}.grand.wav`, '-filter_complex', 'amix=inputs=2:normalize=0:duration=longest', '-c:a', 'pcm_f32le', raw]);
      rmSync(`${dir}/${st.id}.gm.wav`);
      rmSync(`${dir}/${st.id}.grand.wav`);
    }
    if (st.grand && !grandSf2) throw new Error(`${id}: its piano needs --grand <Salamander Grand Piano .sf2>`);
    const mixed = `${dir}/${st.id}.wav`;
    const wet = WET[st.id] ?? 0.15;
    const duck = plan.key && DUCK[st.id];
    // the channel: EQ and compression, the duck under the kick, then the dry and its hall send together
    const inputs = ['-i', raw, '-i', IR, ...(duck ? ['-i', key] : [])];
    // (the grand opened up: its sparkle and air lifted a little, gently)
    const fx = (FX[st.id] ?? 'anull') + (st.grand ? `,${GRAND_EQ}` : '') + (SONG_EQ[id]?.[st.id] ? `,${SONG_EQ[id][st.id]}` : '');
    let g = `[0:a]${fx},apad=whole_dur=${secs}[eq];`;
    g += duck ? `[2:a]apad=whole_dur=${secs}[k];[eq][k]sidechaincompress=threshold=0.04:ratio=${duck}:attack=4:release=160:makeup=1[ch];` : `[eq]anull[ch];`;
    g += wet > 0 ? `[ch]asplit=2[dry][send];[send]highpass=f=250[s2];[s2][1:a]afir=dry=0:wet=1:length=1[rv];[dry][rv]amix=inputs=2:weights=1 ${wet}:normalize=0,volume=${LEVEL[st.id] ?? 0}dB[out]` : `[ch]volume=${LEVEL[st.id] ?? 0}dB[out]`;
    ff([...inputs, '-filter_complex', g, '-map', '[out]', '-t', secs, '-ar', String(RATE), '-ac', '2', '-c:a', 'pcm_f32le', mixed]);
    rmSync(raw);
    done.push(st.id);
  }
  if (plan.key && !REMIX) rmSync(key);
  // the tune over the band: the lead set to sit TUNE dB over everything else (a piano piece's right hand a little
  // more), so it's heard in every song and never shouts over a thin band
  const others = done.filter((x) => x !== 'lead');
  if (done.includes('lead') && others.length) {
    const sumO = `${dir}/others.wav`;
    ff([...others.flatMap((x) => ['-i', `${dir}/${x}.wav`]), '-filter_complex', others.length > 1 ? `amix=inputs=${others.length}:normalize=0:duration=longest` : 'anull', '-c:a', 'pcm_f32le', sumO]);
    const want = SOLO_PIANO.has(id) ? 6 : TUNE;
    const now = measure(`${dir}/lead.wav`).lufs - measure(sumO).lufs;
    const fix = Math.max(-10, Math.min(8, want - now));
    if (Math.abs(fix) > 0.3) {
      ff(['-i', `${dir}/lead.wav`, '-af', `volume=${fix.toFixed(2)}dB`, '-c:a', 'pcm_f32le', `${dir}/lead.tmp.wav`]);
      execFileSync('mv', [`${dir}/lead.tmp.wav`, `${dir}/lead.wav`]);
    }
    rmSync(sumO);
  }
  // the whole mix to −14 LUFS: the same gain on every stem
  const sum = `${dir}/mix.wav`;
  ff([...done.flatMap((s) => ['-i', `${dir}/${s}.wav`]), '-filter_complex', `amix=inputs=${done.length}:normalize=0:duration=longest`, '-c:a', 'pcm_f32le', sum]);
  const m = measure(sum);
  const gain = TARGET - m.lufs;
  const out = `public/songs/${id}`;
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const stems = [];
  for (const s of done) {
    const file = `${s}.webm`;
    // (each stem kept under full scale: a stem's peak never clips in the file)
    ff(['-i', `${dir}/${s}.wav`, '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=0.97:attack=2:release=40:level=disabled`, '-c:a', 'libopus', '-b:a', BITRATE[s] ?? '48k', '-vbr', 'on', '-application', 'audio', ...(MONO.has(s) ? ['-ac', '1'] : []), `${out}/${file}`]);
    stems.push({ id: s, file, ch: MONO.has(s) ? 1 : 2, bytes: statSync(`${out}/${file}`).size });
  }
  // to listen to: the mix as a finished track (a limiter just under 0 dBFS on top)
  ff(['-i', sum, '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=0.89:attack=4:release=50:level=disabled`, '-c:a', 'libmp3lame', '-b:a', '192k', `artifacts/listen/${id}-mix.mp3`]);
  writeFileSync(`${out}/stems.json`, JSON.stringify({ id, bpm: plan.bpm, meter: plan.meter, start: plan.start, end: plan.end, seconds: plan.seconds, stems: stems.map(({ id: s, file, ch }) => ({ id: s, file, ch })) }));
  writeFileSync(`${dir}/mix.json`, JSON.stringify({ gain, stems: done }));
  const kb = stems.reduce((a, s) => a + s.bytes, 0) / 1024;
  console.log(`${id.padEnd(18)} ${m.lufs.toFixed(1)} LUFS +${gain.toFixed(1)} dB  ${stems.map((s) => `${s.id} ${Math.round(s.bytes / 1024)}k`).join(' ')}  = ${Math.round(kb)} KB`);
}
