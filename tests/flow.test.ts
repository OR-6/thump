import { describe, expect, it } from 'vitest';
import { Flow, type Stage } from '../src/play/flow.js';
import { freshProgress, type Progress } from '../src/persistence/progress.js';
import type { Lane } from '../src/config.js';

function fakeStage(log: string[]): Stage {
  return {
    showPad: (l, how) => log.push(`pad ${l} ${how}`),
    glow: () => {},
    demo: () => {},
    band: () => {},
    crowd: () => {},
    cheer: (big) => log.push(`cheer ${big}`),
    title: (s) => s && log.push(`title ${s.id}`),
    stars: (n) => n !== null && log.push(`stars ${n}`),
    hint: (t) => t && log.push(`hint ${t}`),
    bandmate: (e) => e === 'arrive' && log.push('bandmate'),
    songList: (show) => show && log.push('list'),
    save: () => {},
    unlock: (u) => log.push(`unlock ${u}`),
  };
}

type Internals = { turnJudge: { notes: { t: number; lane: Lane; grade: string | null }[] } | null; waitHit: Lane | null };

/** A player: hits every note `late` seconds after it's due (or never, with skill 0), and any pad that asks. */
function run(flow: Flow, seconds: number, opts: { skill?: number; late?: number; stopAt?: (f: Flow) => boolean } = {}) {
  const skill = opts.skill ?? 1;
  const late = opts.late ?? 0.01;
  const dt = 1 / 72;
  let t = 0;
  let k = 0;
  const f = flow as unknown as Internals;
  for (; t < seconds; t += dt) {
    flow.tick(t);
    if (opts.stopAt?.(flow)) break;
    if (f.waitHit && (k++ % 72) === 0 && skill > 0) flow.hit(f.waitHit, t, 0.8);
    const j = flow.phase === 'copy-turn' || flow.phase === 'copy-demo' ? f.turnJudge : flow.phase === 'play' ? flow.judge : null;
    if (!j || skill === 0) continue;
    for (const n of j.notes) {
      const due = n.t + flow.clock.start + late;
      if (n.grade === null && due <= t && due > t - dt) flow.hit(n.lane, t, 0.8);
    }
  }
  return t;
}

describe('the first ten minutes', () => {
  it('a player who plays everything goes kick → snare → copy → hat → copy → crowd → three songs with unlocks → the song list', () => {
    const log: string[] = [];
    const p: Progress = freshProgress();
    const flow = new Flow(fakeStage(log), p);
    flow.start(0);
    const t = run(flow, 900, { stopAt: (f) => f.phase === 'list' });
    expect(flow.phase).toBe('list');
    expect(t).toBeLessThan(10 * 60); // inside the judges' ten minutes, with a good player
    const order = log.filter((l) => /^(pad|title|stars|bandmate|unlock|list)/.test(l));
    expect(order.slice(0, 3)).toEqual(['pad kick fade', 'pad snare slide', 'pad hat slide']);
    expect(order).toContain('title porch-step');
    expect(order.indexOf('pad tom slide')).toBeGreaterThan(order.indexOf('title porch-step'));
    expect(order.indexOf('title kitchen-clock')).toBeGreaterThan(order.indexOf('pad tom slide'));
    expect(order.indexOf('pad gong slide')).toBeGreaterThan(order.indexOf('title kitchen-clock'));
    expect(order.indexOf('bandmate')).toBeGreaterThan(order.indexOf('pad gong slide'));
    expect(order.indexOf('title call-and-answer')).toBeGreaterThan(order.indexOf('bandmate'));
    expect(order).toContain('unlock arrange');
    expect(order.at(-1)).toBe('list');
    expect(p.introDone).toBe(true);
    expect(p.stars['porch-step']).toBe(3);
    expect(p.stars['call-and-answer']).toBe(3);
    expect(p.unlocks).toEqual(expect.arrayContaining(['tom', 'gong', 'bandmate', 'arrange', 'phone']));
    expect(p.crowd).toBeGreaterThan(3);
  });

  it('a player who never hits a pad is shown the copy again and again (never stuck in an error, never pushed on)', () => {
    const flow = new Flow(fakeStage([]), freshProgress());
    flow.start(0);
    run(flow, 120, { skill: 0 });
    // the first pad moves on after a while; the copy keeps demonstrating, with guide lights
    expect(flow.phase.startsWith('copy')).toBe(true);
    expect(flow.attempts).toBeGreaterThanOrEqual(1);
  });

  it('a player who hits late still gets through the copies (the right pads in order pass from the second try)', () => {
    const flow = new Flow(fakeStage([]), freshProgress());
    flow.start(0);
    run(flow, 200, { late: 0.3, stopAt: (f) => f.phase === 'title' });
    expect(flow.phase).toBe('title');
  });

  it('every song ends with stars, even played badly', () => {
    const log: string[] = [];
    const p = freshProgress();
    p.introDone = true;
    const flow = new Flow(fakeStage(log), p);
    flow.start(0);
    run(flow, 200, { late: 0.3, stopAt: (f) => f.phase === 'results' });
    expect(flow.phase).toBe('results');
    expect(log.some((l) => l.startsWith('stars'))).toBe(true);
    expect(flow.last!.stars).toBe(1);
  });

  it('a returning player starts at their next song with their kit and crowd', () => {
    const log: string[] = [];
    const p = freshProgress();
    p.introDone = true;
    p.unlocks = ['tom'];
    p.next = 1;
    p.crowd = 7;
    const flow = new Flow(fakeStage(log), p);
    flow.start(0);
    expect(flow.lanes).toEqual(['kick', 'snare', 'hat', 'tom']);
    expect(flow.crowd).toBe(7);
    expect(log).toContain('title kitchen-clock');
  });

  it('after the guided songs, the cards: picking a song plays it and comes back to the cards', () => {
    const log: string[] = [];
    const p = freshProgress();
    p.introDone = true;
    p.unlocks = ['tom', 'gong', 'bandmate', 'arrange', 'phone'];
    p.next = 3;
    p.stars = { 'porch-step': 2, 'kitchen-clock': 2, 'call-and-answer': 2 };
    const flow = new Flow(fakeStage(log), p);
    flow.start(0);
    expect(flow.phase).toBe('list');
    flow.pickSong(0);
    expect(flow.phase).toBe('title');
    run(flow, 200, { stopAt: (f) => f.phase === 'list' });
    expect(flow.phase).toBe('list');
    expect(p.stars['porch-step']).toBe(3);
  });

  it('learns a steady lateness and judges it away', () => {
    const p = freshProgress();
    p.introDone = true;
    const flow = new Flow(fakeStage([]), p);
    flow.start(0);
    run(flow, 200, { late: 0.08, stopAt: (f) => f.phase === 'results' });
    expect(flow.opts.offset).toBeGreaterThan(0.03);
  });
});
