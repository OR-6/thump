/**
 * Every song's chart on every instrument at every level, exactly as the game asks for it (src/play/game.ts: a song
 * charted from beat 0 to its last note, no fills), written as JSON for tools/songfit/measure.mjs. Also the melody's
 * notes through all the passes, for reference.
 *
 *   npx vite-node tools/songfit/dump-charts.ts [out.json] [song-id …]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { SCORES, SONG_ORDER, scoreChart, type Level } from '../../src/songs/score.js';

const args = process.argv.slice(2);
const out = args.find((a) => a.endsWith('.json')) ?? 'artifacts/songfit/charts.json';
const ids = args.filter((a) => !a.endsWith('.json'));
const INSTS = ['drums', 'piano', 'marimba', 'handpan', 'guitar', 'congas'];
const LEVELS: Level[] = ['easy', 'normal', 'hard'];

const songs = [];
for (const s of SCORES) {
  if (s.tune.lesson) continue;
  if (ids.length && !ids.includes(s.tune.id)) continue;
  const charts: Record<string, Record<string, [number, string][]>> = {};
  for (const inst of INSTS) {
    charts[inst] = {};
    for (const lv of LEVELS) charts[inst][lv] = scoreChart(s, inst, lv, 0, s.end, [], { tom: true }).notes.map((n) => [n.beat, n.key]);
  }
  const melody: number[] = [];
  for (const st of s.starts) for (const n of s.melody) if (st + n.beat < s.end - 1e-6) melody.push(st + n.beat);
  songs.push({ id: s.tune.id, name: s.tune.name, bpm: s.tune.bpm, meter: s.meter, end: s.end, original: !!s.tune.original, melody, charts });
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ order: SONG_ORDER, songs }));
console.log(`${songs.length} songs -> ${out}`);
