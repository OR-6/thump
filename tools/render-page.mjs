// In-page half of tools/render-song.mjs (browser run helper): renders one song's band (and, if asked, your part played
// on time) offline through the real engine, the way the game schedules it, and writes the WAV and what was played.
// Reads its options from artifacts/.render.json.
import { readFileSync, writeFileSync } from 'node:fs';

export default async function run({ page, frame }) {
  const f = frame ?? page;
  const P = JSON.parse(readFileSync('artifacts/.render.json', 'utf8'));
  const meta = await f.evaluate(async (P) => {
    const T = window.__thump;
    const A = T.audio;
    A.resume();
    const S = await import('/src/songs/score.ts');
    const SH = await import('/src/kit/shelf.ts');
    // every clip in first (the band's piano, the kit, the lead), as the game has them a few seconds after it starts
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let was = -1;
    for (let i = 0; i < 200; i++) {
      const n = A.sampler.loaded;
      if (n === was && n > 100) break;
      was = n;
      await sleep(250);
    }
    const s = S.SCORES.find((x) => x.tune.id === P.song);
    if (!s) return { error: `no song ${P.song}` };
    const spb = 60 / s.tune.bpm;
    const from = P.from ?? -4;
    const endBeat = Math.min(s.end + 4, from + P.seconds / spb);
    const seconds = (endBeat - from) * spb + 2.5;
    const t0 = 0.05;
    const at = (b) => t0 + (b - from) * spb;
    const inst = P.player && P.player !== 'none' ? P.player : (P.as ?? s.tune.lesson?.inst ?? 'piano');
    const solos = s.solos.map(([a, z]) => [a, z]);
    const chart = S.scoreChart(s, inst, P.level ?? 'normal', 0, s.end, solos, {});
    const live = new Set(chart.live);
    const cover = chart.cover;
    const bars = s.end / 4;
    const holdFrom = P.level === 'easy' ? 999 : P.level === 'hard' ? bars * 4 - 16 : bars * 4 - 8;
    const energy = P.energy ?? 0.8;
    const played = [];
    const count = {};
    const PAN = { kick: 0.375, snare: -0.3, hat: -0.8, tom: 0, floor: 0.8, crash: -0.75, ride: 0.675 };
    const bandPan = (lane) => (typeof S.bandPan === 'function' ? S.bandPan(lane) : PAN[lane] ?? 0);
    const scheduled = [];
    const voice = (key, b, vel, you, late = 0) => {
      const when = at(b) + late;
      const [sid, rest] = key.split(':');
      if (sid === 'kit') {
        A.drum(rest, vel, you ? (PAN[rest] ?? 0) : bandPan(rest), when);
      } else if (sid === 'congas') {
        const v = SH.percVoice('congas', Number(rest));
        A.modal('congas', 0, vel, 0, when, v.size, 'congas', v.tone);
        if (v.slap) A.drum('rim', vel * 0.3, 0, when, 1);
      } else if (sid === 'piano' || sid === 'marimba') {
        const z = SH.instZones(sid, 65 + ((s.keyPc + 7) % 12), SH.scaleById(s.scale))[Number(rest)];
        if (z) A.modal(sid === 'piano' ? 'keys' : 'marimba', z.midi, vel, 0, when, 0.5, sid, Number(rest));
      }
      played.push([when, key, you ? 1 : 0]);
      count[key] = (count[key] ?? 0) + 1;
    };
    // the song's mix (its style's), as the game sets it when the song starts
    const st = typeof S.bandStyle === 'function' ? S.bandStyle(s) : null;
    A.mix?.(st ? { duck: st.duck, room: st.room } : null);
    const buf = await A.render(seconds, () => {
      // the band's parts, as the game's tickPerform plays them (BACKING BAND on, no friends, you on `inst`)
      for (const part of S.scoreParts(s)) {
        if (live.has(part.key)) continue;
        if (P.only && !P.only.includes(part.name)) continue;
        const mine = cover.get(part.key);
        for (const n of part.notes) {
          const b = n.beat;
          if (b < from || b >= endBeat || b >= s.end) continue;
          if (mine?.has(S.beatKey(b))) continue;
          const inFill = solos.some(([a, z]) => b >= a && b < z);
          const keepsTime = inst !== 'drums' && (part.name === 'KICK' || part.name === 'SNARE' || part.name === 'HAT');
          const level = inFill ? (keepsTime ? 0.55 : 0.22) : b >= holdFrom ? 0.95 : 0.25 + 0.6 * energy;
          const v = n.vel * level;
          const late = n.late ?? 0;
          if (n.midi === undefined) voice(n.key, b, v, false, late);
          else {
            const bass = n.key === 'band:bass';
            A.band({ beat: b, voice: bass ? 'bass' : 'pluck', midi: n.midi, len: n.len ?? 1, vel: Math.max(v, 0.75 * n.vel), sound: n.sound }, at(b) + late, spb);
            played.push([at(b) + late, n.key, 0]);
            count[n.key] = (count[n.key] ?? 0) + 1;
          }
        }
      }
      // the bed (count-in, chords): the count-in on sticks from the left unless you're the drummer
      for (const e of S.scoreBed(s)) {
        if (e.beat < from || e.beat >= endBeat) continue;
        if (P.only && !P.only.includes(`bed:${e.voice}`)) continue;
        if (e.beat < 0 && e.voice === 'shaker' && inst !== 'drums') {
          A.drum('rim', Math.min(1, 0.45 + e.vel * 0.5), -0.45, at(e.beat), 1);
          continue;
        }
        A.band(e, at(e.beat), spb);
        const k = `bed:${e.voice}`;
        count[k] = (count[k] ?? 0) + 1;
      }
      // your part, on time, if asked
      if (P.player && P.player !== 'none') for (const n of chart.notes) if (n.beat >= from && n.beat < endBeat) voice(n.key, n.beat, n.vel * 0.9, true);
    });
    A.mix?.(null);
    if (!buf) return { error: 'no OfflineAudioContext' };
    const L = buf.getChannelData(0);
    const R = buf.getChannelData(1);
    const pcm = new Int16Array(L.length * 2);
    for (let i = 0; i < L.length; i++) {
      pcm[2 * i] = Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767)));
      pcm[2 * i + 1] = Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767)));
    }
    window.__render = pcm;
    return { song: s.tune.id, style: s.tune.style, bpm: s.tune.bpm, rate: buf.sampleRate, frames: L.length, from, endBeat, t0, spb, inst, level: P.level ?? 'normal', energy, count, played: played.filter((p) => p[1] === 'kit:kick' || p[1] === 'kit:snare'), bars: (endBeat - Math.max(0, from)) / s.meter, loaded: A.sampler.loaded };
  }, P);
  if (meta.error) return meta;
  // the samples, a slice at a time
  const total = meta.frames * 2;
  const out = Buffer.alloc(total * 2);
  const CH = 1 << 20;
  for (let i = 0; i < total; i += CH) {
    const b64 = await f.evaluate(
      ([a, n]) => {
        const s = window.__render.subarray(a, a + n);
        const u = new Uint8Array(s.buffer, s.byteOffset, s.byteLength);
        let bin = '';
        for (let k = 0; k < u.length; k += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(k, k + 0x8000));
        return btoa(bin);
      },
      [i, CH],
    );
    Buffer.from(b64, 'base64').copy(out, i * 2);
  }
  await f.evaluate(() => delete window.__render);
  writeFileSync(P.raw, out);
  writeFileSync(P.meta, JSON.stringify(meta));
  return { song: meta.song, frames: meta.frames, loaded: meta.loaded };
}
