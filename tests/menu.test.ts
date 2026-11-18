import { describe, expect, it } from 'vitest';
import { buildPage, type MenuInput, type PageId } from '../src/ui/menu.js';

const base = (page: PageId): MenuInput => ({
  page,
  line: '',
  sub: '',
  inst: { id: 'piano', name: 'Piano', scale: 'Happy', sound: 'Grand', oct: 0 },
  songs: [
    { name: 'Kick Start', meta: '92 BPM', stars: 2, locked: false },
    { name: 'Two Step', meta: '100 BPM', stars: 0, locked: true },
  ],
  songSel: 0,
  level: 'easy',
  band: { state: 'idle', code: '', players: 1 },
  settings: { slow: false, oneHand: false, contrast: false, words: true, backing: true },
  next: 'NEXT',
  switchable: ['drums', 'piano', 'guitar'],
});

describe('the panel pages', () => {
  it('the main menu: free play, songs, make a track, play together, settings', () => {
    const p = buildPage(base('main'));
    // (the songs first and largest)
    expect(p.items.map((i) => i.id)).toEqual(['nav:songs', 'nav:instruments', 'nav:build', 'nav:band', 'nav:settings']);
    expect(p.items[0].w).toBeGreaterThan(p.items[1].w);
  });
  it('instruments: a card each, the one out lit; its settings; play it', () => {
    const p = buildPage(base('instruments'));
    const cards = p.items.filter((i) => i.kind === 'card');
    expect(cards.map((c) => c.id)).toEqual(['inst:drums', 'inst:piano', 'inst:marimba', 'inst:guitar', 'inst:congas', 'inst:handpan']);
    expect(cards.find((c) => c.on)?.id).toBe('inst:piano');
    expect(p.items.some((i) => i.id === 'nav:inst')).toBe(true);
  });
  it("an instrument's settings: its scales, its sounds, an octave down or up", () => {
    const p = buildPage(base('inst'));
    // (the notes stepped ‹ Happy ›: back to Minor, on to Sad)
    expect(p.items.filter((i) => i.id.startsWith('scale:')).map((i) => i.id)).toEqual(['scale:minor', 'scale:sad']);
    expect(p.items.find((i) => i.id === 'value:scale:minor')?.label).toBe('Happy');
    expect(p.items.find((i) => i.id === 'sound:piano')?.on).toBe(true);
    expect(p.items.some((i) => i.id === 'oct:+1')).toBe(true);
  });
  it('songs: a row each with stars, locked ones dim; easy or normal; play', () => {
    const p = buildPage(base('songs'));
    expect(p.items.find((i) => i.id === 'song:1')?.off).toBe(true);
    expect(p.items.find((i) => i.id === 'song:0')?.stars).toBe(2);
    expect(p.items.find((i) => i.id.startsWith('level:') && i.on)?.label).toBe('Easy');
    expect(p.items.some((i) => i.id === 'play')).toBe(true);
  });
  it('songs: every song a row of a list that scrolls beside the chosen one\'s card; filters as pills; nothing overlaps', () => {
    const songs = Array.from({ length: 9 }, (_, i) => ({ name: `Song ${i}`, meta: 'Traditional', stars: 0, locked: i > 1 }));
    const p = buildPage({ ...base('songs'), songs });
    const rows = p.items.filter((i) => i.id.startsWith('song:'));
    expect(rows.map((i) => i.id)).toEqual(songs.map((_, i) => `song:${i}`));
    expect(rows.every((i) => i.scroll)).toBe(true);
    // (no page to turn, no counter)
    expect(p.items.some((i) => i.id === 'songs:more' || /of \d/.test(i.sub ?? ''))).toBe(false);
    expect(p.card?.name).toBe('Song 0');
    // the rows one under another in the list's window, the first at its top; the window six rows tall
    const L = p.list!;
    expect(rows[0].y).toBe(L.y);
    rows.forEach((r, k) => expect(r.y).toBe(L.y + k * 80));
    expect(Math.floor(L.h / 80)).toBe(6);
    // a filter: only the songs it lets through; its pill lit
    const some = buildPage({ ...base('songs'), songs, songShown: [1, 4], songFilter: 'originals' });
    expect(some.items.filter((i) => i.id.startsWith('song:')).map((i) => i.id)).toEqual(['song:1', 'song:4']);
    expect(some.items.find((i) => i.id.startsWith('songs:filter:') && i.on)?.label).toBe('Originals');
    // nothing outside the list overlaps, the list's window included; the rows stay in the window's column
    const fixed = [...p.items.filter((i) => !i.scroll), { ...L, id: 'list' }];
    for (const a of fixed) {
      expect(a.x >= 0 && a.y >= 0 && a.x + a.w <= 1360 && a.y + a.h <= 907).toBe(true);
      for (const b of fixed) if (a !== b) expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
    }
    for (const r of rows) expect(r.x >= L.x && r.x + r.w <= L.x + L.w && r.y >= L.y).toBe(true);
  });
  it('in a song: switch instrument, or stop', () => {
    const p = buildPage({ ...base('song'), line: 'Kick Start' });
    expect(p.items.map((i) => i.id)).toEqual(['inst:drums', 'inst:piano', 'inst:guitar', 'stop', 'pause']);
    expect(p.body).toBe('song');
  });
  it('results: three stars on Easy and AGAIN goes up to Normal', () => {
    expect(buildPage({ ...base('results'), harder: 'NORMAL' }).items.find((i) => i.id === 'again')?.label).toBe('Again on normal');
    expect(buildPage(base('results')).items.find((i) => i.id === 'again')?.label).toBe('Again');
  });
  it('paused: songs, restart, and resume to the front', () => {
    const p = buildPage({ ...base('pause'), line: 'Ode to Joy' });
    expect(p.items.map((i) => i.id)).toEqual(['pause:songs', 'pause:restart', 'resume']);
    expect(p.items.find((i) => i.id === 'resume')?.kind).toBe('play');
  });
  it('play together: Talk once there is a band, saying who is on it or why the mic is off', () => {
    const conn = (host: boolean, talk?: { on: boolean; line: string; others: number }) => buildPage({ ...base('band'), band: { state: 'connected', code: 'CDFH', players: 2, host, name: 'The Band', talk } });
    expect(buildPage({ ...base('band'), band: { state: 'hosting', code: 'CDFH', players: 1, host: true } }).items.some((i) => i.id === 'band:talk')).toBe(false);
    for (const host of [true, false]) {
      const p = conn(host, { on: false, line: '', others: 0 });
      const t = p.items.find((i) => i.id === 'band:talk');
      expect(t?.kind).toBe('toggle');
      expect(t?.on).toBe(false);
      for (const a of p.items) {
        expect(a.x >= 0 && a.y >= 0 && a.x + a.w <= 1360 && a.y + a.h <= 907).toBe(true);
        for (const b of p.items) if (a !== b) expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
      }
    }
    expect(conn(false, { on: true, line: '', others: 1 }).line).toBe('2 in the band, 1 on Talk');
    expect(conn(false, { on: true, line: '', others: 1 }).items.find((i) => i.id === 'band:talk')?.on).toBe(true);
    expect(conn(false, { on: false, line: 'No microphone found', others: 0 }).line).toBe('No microphone found');
  });
  it('nothing on any page overlaps, and everything is on the panel', () => {
    for (const id of ['main', 'instruments', 'inst', 'songs', 'band', 'settings', 'free', 'build', 'song', 'results', 'pause'] as PageId[]) {
      const items = buildPage(base(id)).items;
      for (const a of items) {
        expect(a.x >= 0 && a.y >= 0 && a.x + a.w <= 1360 && a.y + a.h <= 907).toBe(true);
        for (const b of items) if (a !== b) expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
      }
    }
  });
});
