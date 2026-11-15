/**
 * A Standard MIDI File, read (tools only): its resolution, its tempo and meter changes, and each track's notes (tick,
 * length in ticks, pitch, velocity, channel). Used to bring public-domain scores (the Mutopia Project's) into the
 * songs' arrangements.
 */
import { readFileSync } from 'node:fs';

export function readMidi(file) {
  const b = readFileSync(file);
  let p = 0;
  const u32 = () => ((b[p++] << 24) | (b[p++] << 16) | (b[p++] << 8) | b[p++]) >>> 0;
  const u16 = () => (b[p++] << 8) | b[p++];
  if (b.toString('latin1', 0, 4) !== 'MThd') throw new Error('not a MIDI file');
  p = 4;
  const hl = u32();
  const format = u16();
  const ntr = u16();
  const ppq = u16();
  p = 8 + hl;
  const tracks = [];
  const tempos = [];
  const meters = [];
  for (let t = 0; t < ntr; t++) {
    if (b.toString('latin1', p, p + 4) !== 'MTrk') break;
    p += 4;
    const len = u32();
    const end = p + len;
    let tick = 0;
    let run = 0;
    const on = new Map();
    const notes = [];
    let name = '';
    const vlq = () => {
      let v = 0;
      let c;
      do {
        c = b[p++];
        v = (v << 7) | (c & 0x7f);
      } while (c & 0x80);
      return v;
    };
    while (p < end) {
      tick += vlq();
      let st = b[p];
      if (st & 0x80) p++;
      else st = run;
      if (st === 0xff) {
        const type = b[p++];
        const l = vlq();
        if (type === 0x51) tempos.push({ tick, us: (b[p] << 16) | (b[p + 1] << 8) | b[p + 2] });
        if (type === 0x58) meters.push({ tick, num: b[p], den: 1 << b[p + 1] });
        if (type === 0x03) name = b.toString('latin1', p, p + l);
        p += l;
        continue;
      }
      if (st === 0xf0 || st === 0xf7) {
        p += vlq();
        continue;
      }
      run = st;
      const kind = st & 0xf0;
      const ch = st & 15;
      const d1 = b[p++];
      const d2 = kind === 0xc0 || kind === 0xd0 ? 0 : b[p++];
      if (kind === 0x90 && d2 > 0) {
        on.set(`${ch}:${d1}`, { tick, vel: d2 });
      } else if (kind === 0x80 || (kind === 0x90 && d2 === 0)) {
        const k = `${ch}:${d1}`;
        const o = on.get(k);
        if (o) {
          notes.push({ tick: o.tick, dur: tick - o.tick, pitch: d1, vel: o.vel, ch });
          on.delete(k);
        }
      }
    }
    p = end;
    notes.sort((a, c) => a.tick - c.tick || c.pitch - a.pitch);
    tracks.push({ name, notes });
  }
  return { format, ppq, tempos, meters, tracks };
}
