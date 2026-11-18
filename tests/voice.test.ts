import { describe, expect, it } from 'vitest';
import { Talk, callsFirst, micMessage, validTalk, type VoiceDeps } from '../src/net/voice.js';
import type { MediaCallLike } from '../src/net/coop.js';
import type { Transport } from '../src/net/transport.js';

/** A band's message bus: what one sends, every other gets (the host passes it on). */
function bus(n: number): Transport[] {
  const subs: Array<Array<(m: unknown) => void>> = Array.from({ length: n }, () => []);
  return subs.map((_, i) => ({
    send: (m: unknown) => subs.forEach((s, j) => j !== i && s.forEach((cb) => cb(JSON.parse(JSON.stringify(m))))),
    onMessage: (cb: (m: unknown) => void) => subs[i].push(cb),
  }));
}

class FakeTrack {
  stopped = false;
  stop() {
    this.stopped = true;
  }
}
const fakeStream = () => {
  const t = new FakeTrack();
  return { s: { getTracks: () => [t] } as unknown as MediaStream, t };
};

/** Peers that call each other in memory. */
function network() {
  const talks = new Map<string, Talk>();
  const calls: Array<{ from: string; to: string }> = [];
  const playing: string[] = [];
  const deps = (id: string, mic: () => Promise<MediaStream> = async () => fakeStream().s): VoiceDeps => ({
    peerId: () => id,
    now: () => 0,
    mic,
    play: () => {
      playing.push(id);
      return { level: () => 0.5, stop: () => {} };
    },
    call: (to, stream) => {
      calls.push({ from: id, to });
      const ev: Record<string, Array<(...a: unknown[]) => void>> = {};
      const back: Record<string, Array<(...a: unknown[]) => void>> = {};
      const mine: MediaCallLike = { peer: to, answer: () => {}, close: () => (back.close ?? []).forEach((f) => f()), on: (e, cb) => (ev[e] ??= []).push(cb) };
      const theirs: MediaCallLike = {
        peer: id,
        // (the voices arrive later, as over a network)
        answer: (s) =>
          setTimeout(() => {
            (ev.stream ?? []).forEach((f) => f(s));
            (back.stream ?? []).forEach((f) => f(stream));
          }, 0),
        close: () => (ev.close ?? []).forEach((f) => f()),
        on: (e, cb) => (back[e] ??= []).push(cb),
      };
      talks.get(to)?.incoming(theirs);
      return mine;
    },
  });
  return { talks, calls, playing, deps };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('talk', () => {
  it('only its own messages get through', () => {
    expect(validTalk({ k: 'talk', p: 'ab12', id: 'thump-v1-CDFH', on: true })).toBe(true);
    expect(validTalk({ k: 'talk', p: 'ab12', id: '8c1e7c2a-63f1-4a77-9f3e-1d2a', on: false })).toBe(true);
    expect(validTalk({ k: 'talk', p: 'ab12', id: 'x'.repeat(65), on: true })).toBe(false);
    expect(validTalk({ k: 'talk', p: 'ab12', id: 'a b', on: true })).toBe(false);
    expect(validTalk({ k: 'talk', p: 'AB', id: 'x', on: true })).toBe(false);
    expect(validTalk({ k: 'talk', p: 'ab', id: 'x', on: 'yes' })).toBe(false);
    expect(validTalk(null)).toBe(false);
  });
  it('of two, exactly one calls', () => {
    expect(callsFirst('a', 'b')).toBe(true);
    expect(callsFirst('b', 'a')).toBe(false);
  });
  it('says why the mic is off', () => {
    expect(micMessage({ name: 'NotAllowedError' })).toMatch(/Mic blocked/);
    expect(micMessage({ name: 'NotFoundError' })).toBe('No microphone found');
    expect(micMessage(new Error('x'))).toMatch(/Try again/);
  });
  it('the mic is off until asked; two on Talk get one call between them and hear each other', async () => {
    const net = network();
    const [ta, tb] = bus(2);
    let asked = 0;
    const a = new Talk(net.deps('aaa', async () => (asked++, fakeStream().s)));
    const b = new Talk(net.deps('bbb'));
    net.talks.set('aaa', a).set('bbb', b);
    a.start(ta, 'pa');
    b.start(tb, 'pb');
    expect(asked).toBe(0);
    expect(a.state).toBe('off');
    b.toggle();
    await flush();
    expect(b.state).toBe('on');
    expect(net.calls).toEqual([]); // nobody else is on
    a.toggle();
    await flush();
    expect(asked).toBe(1);
    // (both are on: only the smaller id called)
    expect(net.calls).toEqual([{ from: 'aaa', to: 'bbb' }]);
    await flush();
    expect(net.playing.sort()).toEqual(['aaa', 'bbb']);
    expect(a.menu()).toEqual({ on: true, line: '', others: 1 });
    // the seat of whoever's talking swells
    const lv: number[] = [];
    a.tick(0.1, new Map([['pb', { talk: (l: number) => lv.push(l) }], ['band:piano', { talk: () => lv.push(-1) }]]));
    expect(lv.length).toBe(1);
    expect(lv[0]).toBeGreaterThan(0);
  });
  it('a stranger calling is hung up on', async () => {
    const net = network();
    const [ta] = bus(1);
    const b = new Talk(net.deps('bbb'));
    b.start(ta, 'pb');
    b.toggle();
    await flush();
    let closed = false;
    b.incoming({ peer: 'aaa', answer: () => expect.fail('answered'), close: () => (closed = true), on: () => {} });
    expect(closed).toBe(true);
  });
  it('a blocked mic says so and stays off', async () => {
    const net = network();
    const [ta] = bus(1);
    const a = new Talk(net.deps('aaa', async () => Promise.reject(Object.assign(new Error('no'), { name: 'NotAllowedError' }))));
    a.start(ta, 'pa');
    a.toggle();
    expect(a.menu().line).toBe('Asking for the mic…');
    await flush();
    expect(a.state).toBe('blocked');
    expect(a.menu().on).toBe(false);
    expect(a.menu().line).toMatch(/Mic blocked/);
  });
  it('leaving the band stops the mic; turning off while asked stops it too', async () => {
    const net = network();
    const [ta] = bus(1);
    const st = fakeStream();
    const a = new Talk(net.deps('aaa', async () => st.s));
    a.start(ta, 'pa');
    a.toggle();
    await flush();
    expect(a.state).toBe('on');
    a.leave();
    expect(st.t.stopped).toBe(true);
    expect(a.state).toBe('off');
    const st2 = fakeStream();
    let give: (s: MediaStream) => void = () => {};
    const b = new Talk(net.deps('bbb', () => new Promise((r) => (give = r))));
    b.start(ta, 'pb');
    b.toggle();
    b.toggle();
    give(st2.s);
    await flush();
    expect(st2.t.stopped).toBe(true);
    expect(b.state).toBe('off');
  });
});
