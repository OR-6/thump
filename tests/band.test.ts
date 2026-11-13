import { describe, expect, it } from 'vitest';
import { BandLink, Flood, asPlayer, validCtl, validNote } from '../src/net/band.js';
import { audio } from '../src/audio/engine.js';
import type { Transport } from '../src/net/transport.js';

function pipe(): [Transport, Transport] {
  const a: Array<(m: unknown) => void> = [];
  const b: Array<(m: unknown) => void> = [];
  return [
    { send: (m) => b.forEach((cb) => cb(JSON.parse(JSON.stringify(m)))), onMessage: (cb) => a.push(cb) },
    { send: (m) => a.forEach((cb) => cb(JSON.parse(JSON.stringify(m)))), onMessage: (cb) => b.push(cb) },
  ];
}

describe('playing together', () => {
  it('only sounds this game makes get through', () => {
    expect(validNote({ k: 'n', s: 'd:kick', m: 0, v: 0.8, d: 0 })).toBe(true);
    expect(validNote({ k: 'n', s: 'm:keys', m: 64, v: 0.8, d: 30, z: 0.5 })).toBe(true);
    expect(validNote({ k: 'n', s: 'p:steel', m: 40, v: 0.8, d: 12 })).toBe(true);
    expect(validNote({ k: 'n', s: 'b:chord', m: 60, v: 0.4, d: 100, z: 4, spb: 0.65, mi: true })).toBe(true);
    expect(validNote({ k: 'n', s: 'm:theremin', m: 64, v: 0.8, d: 0 })).toBe(false);
    expect(validNote({ k: 'n', s: 'd:kick', m: 0, v: 9, d: 0 })).toBe(false);
    expect(validNote({ k: 'n', s: 'd:kick', m: 0, v: 0.5, d: 1e9 })).toBe(false);
    expect(validNote({ k: 'x' })).toBe(false);
    expect(validNote(null)).toBe(false);
  });
  it('a flood is cut off', () => {
    const f = new Flood(10);
    let ok = 0;
    for (let i = 0; i < 50; i++) if (f.ok(i * 0.001)) ok++;
    expect(ok).toBe(10);
    expect(f.ok(2)).toBe(true);
  });
  it('my sounds go out once each (not the sounds inside them), and a friend’s never echo back', () => {
    const [mine, theirs] = pipe();
    const got: unknown[] = [];
    theirs.onMessage((m) => got.push(m));
    const link = new BandLink();
    link.start(mine);
    asPlayer(() => {
      audio.modal('keys', 64, 0.7);
      audio.drum('kick', 0.9);
      audio.pluck(40, 0.6, 0, 0, 'steel');
    });
    // the backing this headset plays for itself stays home
    audio.modal('keys', 60, 0.5);
    expect(got).toHaveLength(3);
    expect(got.map((m) => (m as { s: string }).s)).toEqual(['m:keys', 'd:kick', 'p:steel']);
    // a friend's note arrives: it plays here, and nothing goes back out
    let heard = 0;
    const link2 = new BandLink(() => heard++);
    link2.play({ k: 'n', s: 'm:bell', m: 72, v: 0.5, d: 0 });
    link.play({ k: 'n', s: 'd:snare', m: 0, v: 0.5, d: 0 });
    expect(got).toHaveLength(3);
    expect(heard).toBe(1);
    link.stop();
    audio.modal('keys', 64, 0.7);
    expect(got).toHaveLength(3);
  });
  it('one beat: a guest measures the host clock by ping; songs and asks and instruments are checked', () => {
    const [hostSide, guestSide] = pipe();
    const host = new BandLink();
    host.host = true;
    host.start(hostSide);
    const guest = new BandLink();
    guest.start(guestSide);
    guest.ping();
    // (an in-memory pipe: no delay, so the offset is ~0)
    expect(Math.abs(guest.offset)).toBeLessThan(0.01);
    expect(guest.toLocal(guest.bandNow())).toBeCloseTo(performance.now() / 1000, 1);
    const asks: unknown[] = [];
    host.onCtl = (m) => asks.push(m);
    guest.send({ k: 'ask', i: 2 });
    expect(asks).toEqual([{ k: 'ask', i: 2 }]);
    expect(validCtl({ k: 'song', i: 1, at: 12.5 })).toBe(true);
    expect(validCtl({ k: 'song', i: 99, at: 12.5 })).toBe(false);
    expect(validCtl({ k: 'inst', p: 'abc', id: 'piano' })).toBe(true);
    expect(validCtl({ k: 'inst', p: 'abc', id: '<script>' })).toBe(false);
    // what a friend plays: the song and the parts, checked
    expect(validCtl({ k: 'inst', p: 'abc', id: 'piano', s: 'kick-start', l: ['KEYS', 'KEYS 2'] })).toBe(true);
    expect(validCtl({ k: 'inst', p: 'abc', id: 'piano', s: 'kick-start', l: ['<b>'] })).toBe(false);
    expect(validCtl({ k: 'inst', p: 'abc', id: 'piano', s: 'Kick Start!' })).toBe(false);
    expect(validCtl({ k: 'pong', a: 1, h: 2, p: 'x' })).toBe(true);
  });
});
