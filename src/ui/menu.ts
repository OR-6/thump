/**
 * The panel's pages, as data: a title, a line under it, and the things you can press (each with an action id and
 * where it sits on the panel, in canvas pixels 1360×800). Pure, so every screen is testable: the main menu, the
 * instruments, an instrument's settings, the songs, playing together, settings, and the screens inside a song.
 */
import { KEYS, SCALES, SHELF, instDef } from '../kit/shelf.js';

export type PageId = 'main' | 'free' | 'instruments' | 'inst' | 'songs' | 'band' | 'settings' | 'song' | 'build' | 'results' | 'tune' | 'pause';

export interface Item {
  id: string;
  label: string;
  /** A second, smaller line. */
  sub?: string;
  /** An instrument drawing on it. */
  icon?: string;
  color?: number;
  /** Chosen (lit in its colour). */
  on?: boolean;
  /** Can't be pressed yet. */
  off?: boolean;
  stars?: number;
  /** A song's best grade at this level (S–D). */
  grade?: string;
  /** big: a main-menu tile; card: an instrument; row: a list row; chip: a small choice; button: a plain one. */
  kind: 'big' | 'card' | 'row' | 'chip' | 'button' | 'play' | 'ghost' | 'hero' | 'tile' | 'text' | 'label' | 'toggle';
  /** A red dot before the label (record). */
  dot?: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Page {
  id: PageId;
  title: string;
  line: string;
  items: Item[];
  /** What the middle shows besides items: a song's progress and count, results' stars, or how to play. */
  body?: 'song' | 'results' | 'how' | 'songs' | 'pause' | 'band';
  /** Songs: the chosen song's card. */
  card?: { name: string; meta: string; stars: number; grade: string; best: number };
  /** Play together: the code, and how many are in.
   */
  band?: { code: string; players: number };
  /** The how-to line for a 'how' body. */
  how?: string;
  /** The colour of the instrument that's out: the page's accent. */
  accent?: number;
}

export interface MenuInput {
  page: PageId;
  line: string;
  sub: string;
  inst: { id: string; name: string; scale: string; sound: string; oct: number; how?: string; key?: string; pieces?: 'small' | 'full'; frets?: 'easy' | 'real' };
  songs: { name: string; meta: string; stars: number; locked: boolean; grade?: string; best?: number }[];
  songSel: number;
  /** Which six songs show (more than six: a button in the corner turns the page). */
  songPage?: number;
  /** The songs the filter lets through (indices into `songs`; all of them when not given), and the filter. */
  songShown?: number[];
  songFilter?: 'all' | 'classics' | 'originals' | 'lessons';
  level: 'easy' | 'normal' | 'hard';
  band: { state: string; code: string; players: number; message?: string };
  settings: { slow: boolean; oneHand: boolean; contrast: boolean; words: boolean; backing: boolean; light?: boolean };
  /** Free play's looper: off, counting in, recording or playing; how many layers it holds. */
  loop?: { state: string; layers: number; recording: boolean };
  /** Results: the next song's button ('' none), and whether MAKE IT YOURS is offered. */
  next: string;
  make?: boolean;
  /** Three stars: AGAIN goes up a level ('NORMAL' or 'HARD'; '' not). */
  harder?: string;
  /** A D on Normal or Hard: the second button offers the song again on Easy. */
  easier?: boolean;
  /** Make a track: the machine is in, PERFORM starts it. */
  perform?: boolean;
  /** STOP was pressed once: it asks. */
  sure?: boolean;
  /** In a song: instruments you can switch to. */
  switchable: string[];
  /** Tuning page labels (debug). */
  tune?: string[];
}

const W = 1360;
const back = (): Item => ({ id: 'back', label: 'Back', kind: 'button', x: 32, y: 28, w: 96, h: 96 });
/** The top-right corner button (beside the title). */
const corner = (id: string, label: string): Item => ({ id, label, kind: 'button', x: 1104, y: 28, w: 224, h: 96 });
/** The bottom row: where every screen keeps what you do next. */
const BOT = { y: 680, h: 200 };

/** Split a row of `n` across the panel from x0 to x1 with a gap. */
function row(n: number, x0: number, x1: number, gap: number): { x: number; w: number }[] {
  const w = (x1 - x0 - gap * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => ({ x: x0 + i * (w + gap), w }));
}

export function buildPage(m: MenuInput): Page {
  const p = buildPageFor(m);
  p.accent = SHELF.find((d) => d.id === m.inst.id)?.color;
  return p;
}

function buildPageFor(m: MenuInput): Page {
  // the grid: a 32 margin, a 16 gutter; the header to 152, the body 176 to 656, the action row 680 to 880
  const C4 = 421.3;
  const C6 = 640;
  const C8 = 858.7;
  const X2 = 32 + C4 + 16;
  const X3 = 32 + 2 * (C4 + 16);
  switch (m.page) {
    case 'main': {
      // the songs, large: what most people came for; the instrument that's out beside them; the rest below
      const n = m.songs.length;
      const items: Item[] = [
        { id: 'nav:songs', label: 'Songs', sub: `Play along · ${n} songs`, icon: 'menu:songs', kind: 'hero', x: 32, y: 176, w: C8, h: 480 },
        { id: 'nav:instruments', label: 'Instruments', sub: m.inst.name, icon: m.inst.id, kind: 'tile', x: X3, y: 176, w: C4, h: 480 },
        { id: 'nav:build', label: 'Make a track', sub: 'Part by part', kind: 'button', x: 32, y: BOT.y, w: C6, h: BOT.h },
        { id: 'nav:band', label: 'Play together', sub: m.band.state === 'connected' ? `${m.band.players} in the band` : 'Up to four', kind: 'button', x: 32 + C6 + 16, y: BOT.y, w: C6, h: BOT.h },
        corner('nav:settings', 'Settings'),
      ];
      return { id: 'main', title: 'Thump', line: m.line || 'Pick something to play', items };
    }
    case 'instruments': {
      // two rows of three: a miniature and a name each; the one on the desk ringed
      const xs = [32, X2, X3];
      const items: Item[] = SHELF.map((d, i) => ({ id: `inst:${d.id}`, label: d.name, sub: d.id === m.inst.id ? 'On the desk' : undefined, icon: d.id, color: d.color, on: d.id === m.inst.id, kind: 'card' as const, x: xs[i % 3], y: 176 + Math.floor(i / 3) * 248, w: C4, h: 232 }));
      items.push(back());
      const detail = m.inst.id === 'drums' ? m.inst.sound : m.inst.scale ? `${m.inst.sound} · ${m.inst.scale} in ${m.inst.key || 'C'}` : m.inst.sound;
      items.push({ id: 'nav:inst', label: m.inst.id === 'drums' ? 'Kit' : 'Settings', sub: detail, kind: 'button', x: 32, y: BOT.y, w: C6, h: BOT.h });
      items.push({ id: 'nav:free', label: 'Play it', kind: 'play', x: 32 + C6 + 16, y: BOT.y, w: C6, h: BOT.h });
      return { id: 'instruments', title: 'Instruments', line: 'Tap one to put it on the desk', items };
    }
    case 'inst': {
      const d = instDef(m.inst.id as never);
      const items: Item[] = [back()];
      // each row named on the left in quiet type, its choices across as pills (a key or a pitch steps ‹ ›)
      const label = (text: string, y: number): Item => ({ id: `label:${text}`, label: text, kind: 'label', x: 32, y, w: 200, h: 96 });
      const across = (ids: { id: string; label: string; on: boolean; off?: boolean }[], y: number) => {
        const r = row(ids.length, 248, W - 32, 12);
        ids.forEach((c, i) => items.push({ id: c.id, label: c.label, on: c.on, off: c.off, kind: 'chip', x: r[i].x, y, w: r[i].w, h: 96 }));
      };
      const stepper = (minus: string, plus: string, value: string, y: number, offMinus = false, offPlus = false) => {
        items.push({ id: minus, label: '‹', kind: 'chip', off: offMinus, x: 248, y, w: 96, h: 96 });
        items.push({ id: `value:${minus}`, label: value, kind: 'text', x: 352, y, w: 240, h: 96 });
        items.push({ id: plus, label: '›', kind: 'chip', off: offPlus, x: 600, y, w: 96, h: 96 });
      };
      const ys = [176, 296, 416, 536];
      if (d.id === 'drums') {
        // a drum kit: its kind, and how much of it is out
        items.push(label('Kit', ys[0]), label('Pieces', ys[1]));
        across(d.sounds.map((s) => ({ id: `sound:${s.id}`, label: s.name, on: s.name === m.inst.sound })), ys[0]);
        across([{ id: 'pieces:full', label: 'Full kit', on: m.inst.pieces !== 'small' }, { id: 'pieces:small', label: 'Small kit', on: m.inst.pieces === 'small' }], ys[1]);
      } else {
        // (a drum has no notes to pick and no pitch: just its sound)
        const pitched = d.scales !== false;
        let k = 0;
        if (pitched) {
          items.push(label('Notes', ys[k]));
          across(SCALES.map((s) => ({ id: `scale:${s.id}`, label: s.name, on: s.name === m.inst.scale })), ys[k++]);
          items.push(label('Key', ys[k]));
          const pc = KEYS.find((x) => x.name === (m.inst.key || 'C'))?.pc ?? 0;
          stepper(`key:${(pc + 11) % 12}`, `key:${(pc + 1) % 12}`, m.inst.key || 'C', ys[k++]);
        }
        items.push(label('Sound', ys[k]));
        across(d.sounds.map((s) => ({ id: `sound:${s.id}`, label: s.name, on: s.name === m.inst.sound })), ys[k++]);
        if (d.id === 'guitar') {
          // (chords that always fit, or each fingertip stopping its own string, for people who play)
          items.push(label('Frets', ys[k]));
          across([{ id: 'frets:easy', label: 'Chords', on: m.inst.frets !== 'real' }, { id: 'frets:real', label: 'Real frets', on: m.inst.frets === 'real' }], ys[k]);
        } else if (pitched) {
          items.push(label('Pitch', ys[k]));
          stepper('oct:-1', 'oct:+1', m.inst.oct < 0 ? 'Lower' : m.inst.oct > 0 ? 'Higher' : 'Middle', ys[k], m.inst.oct <= -1, m.inst.oct >= 1);
        }
      }
      // (learn it: its lesson, a short song that teaches it one move at a time)
      items.push({ id: 'learn', label: 'Learn it', sub: 'A short lesson', kind: 'button', x: 32, y: BOT.y, w: C4, h: BOT.h });
      items.push({ id: 'nav:free', label: 'Play it', kind: 'play', x: X2, y: BOT.y, w: W - 32 - X2, h: BOT.h });
      const line = d.id === 'drums' ? m.inst.sound : m.inst.scale ? `${m.inst.scale} in ${m.inst.key || 'C'} · ${m.inst.sound}` : m.inst.sound;
      return { id: 'inst', title: `${m.inst.name}`, line, items };
    }
    case 'songs': {
      // a list of four with the chosen song's card beside it; filters as pills up top; the level as a stepper
      const items: Item[] = [back()];
      const shown = m.songShown ?? m.songs.map((_, i) => i);
      const per = 4;
      const pages = Math.max(1, Math.ceil(shown.length / per));
      const pg = Math.max(0, Math.min(pages - 1, m.songPage ?? 0));
      if (m.songFilter) {
        const pills: [string, string, number][] = [['all', 'All', 140], ['classics', 'Classics', 250], ['originals', 'Originals', 280], ['lessons', 'Lessons', 240]];
        let x = W - 32 - pills.reduce((a, p) => a + p[2], 0) - 8 * (pills.length - 1);
        for (const [id, label, w] of pills) {
          items.push({ id: `songs:filter:${id}`, label, on: m.songFilter === id, kind: 'chip', x, y: 36, w, h: 80 });
          x += w + 8;
        }
      }
      shown.slice(pg * per, pg * per + per).forEach((i, k) => {
        const s = m.songs[i];
        items.push({ id: `song:${i}`, label: s.name, sub: s.meta, stars: s.stars, grade: s.grade, on: i === m.songSel, off: s.locked, kind: 'row', x: 32, y: 176 + k * 122, w: C8, h: 112 });
      });
      const lv = m.level === 'hard' ? 'Hard' : m.level === 'normal' ? 'Normal' : 'Easy';
      // the level as three tabs, each lit in its own colour
      void lv;
      (['easy', 'normal', 'hard'] as const).forEach((l, k) => items.push({ id: `level:${l}`, label: l.toUpperCase(), on: m.level === l, kind: 'chip', x: X3, y: 448 + k * 72, w: C4, h: 64 }));
      items.push({ id: 'songs:more', label: 'More', sub: `${pg + 1} of ${pages}`, off: pages < 2, kind: 'button', x: 32, y: BOT.y, w: 260, h: BOT.h });
      items.push({ id: 'nav:instruments', label: m.inst.name, sub: 'Change', kind: 'button', x: 308, y: BOT.y, w: 312, h: BOT.h });
      items.push({ id: 'listen', label: 'Listen first', kind: 'button', x: 636, y: BOT.y, w: 312, h: BOT.h });
      items.push({ id: 'play', label: 'Play', kind: 'play', x: 964, y: BOT.y, w: W - 32 - 964, h: BOT.h });
      const sel = m.songs[m.songSel];
      return { id: 'songs', title: 'Songs', line: m.sub, items, body: 'songs', card: sel ? { name: sel.name, meta: sel.meta, stars: sel.stars, grade: sel.grade ?? '', best: sel.best ?? -1 } : undefined };
    }
    case 'band': {
      const on = m.band.state === 'hosting' || m.band.state === 'connected';
      const items: Item[] = [back()];
      if (!on) items.push({ id: 'band:start', label: 'Start a band', sub: 'Friends type its code on the Thump page', kind: 'play', x: 32, y: BOT.y, w: W - 64, h: BOT.h });
      else {
        items.push({ id: 'band:leave', label: 'Leave', kind: 'ghost', x: 32, y: BOT.y, w: 312, h: BOT.h });
        items.push({ id: 'nav:songs', label: 'Pick a song', sub: 'Everyone plays it, on one beat', kind: 'play', x: 360, y: BOT.y, w: W - 32 - 360, h: BOT.h });
      }
      // (the code only once the connection service has it; a failure says what went wrong)
      const msg = m.band.message ?? '';
      const line =
        m.band.state === 'connected'
          ? `${m.band.players} in the band`
          : m.band.state === 'hosting'
            ? msg.startsWith('Connecting') ? 'Connecting…' : 'Waiting for friends'
            : m.band.state === 'joining'
              ? 'Connecting…'
              : (m.band.state === 'error' || m.band.state === 'closed') && msg
                ? msg
                : 'Play with friends, wherever they are';
      return { id: 'band', title: 'Play together', line, items, body: 'band', band: { code: on && !msg.startsWith('Connecting') ? m.band.code : '', players: m.band.players } };
    }
    case 'settings': {
      // two columns of switches; putting the panel back is an action, beside Done
      const items: Item[] = [back()];
      const t = (id: string, label: string, on: boolean, i: number): Item => ({ id, label, on, kind: 'toggle', x: i % 2 ? 32 + C6 + 16 : 32, y: 176 + Math.floor(i / 2) * 116, w: C6, h: 104 });
      items.push(t('set:slow', 'Slower songs', m.settings.slow, 0), t('set:onehand', 'One hand', m.settings.oneHand, 1), t('set:contrast', 'High contrast', m.settings.contrast, 2), t('set:words', 'Hints in the room', m.settings.words, 3), t('set:backing', 'Backing band', m.settings.backing, 4), t('set:light', 'Light when you play', m.settings.light !== false, 5));
      items.push({ id: 'set:panel', label: 'Panel back in place', kind: 'button', x: 32, y: BOT.y, w: C6, h: BOT.h });
      // (the back tile and Done both close it)
      items.push({ id: 'back', label: 'Done', kind: 'play', x: 32 + C6 + 16, y: BOT.y, w: C6, h: BOT.h });
      return { id: 'settings', title: 'Settings', line: '', items };
    }
    case 'tune': {
      const labels = m.tune ?? ['', '', '', '', ''];
      const c = row(5, 32, W - 32, 16);
      return { id: 'tune', title: m.line, line: m.sub, items: labels.map((l, i) => ({ id: `key:${['prev', 'play', 'next', 'jam', 'loop'][i]}`, label: l, kind: 'button' as const, off: !l, x: c[i].x, y: 590, w: c[i].w, h: 180 })) };
    }
    case 'free': {
      // how to play it, large; the looper as a row of three; then where to go, all quiet (free play is the point)
      const drums = m.inst.id === 'drums';
      const items: Item[] = [{ id: 'nav:instruments', label: 'Instruments', kind: 'button', x: 32, y: BOT.y, w: C4, h: BOT.h }];
      items.push({ id: 'nav:inst', label: drums ? 'Kit' : 'Settings', sub: drums ? m.inst.sound : m.inst.scale ? `${m.inst.scale} in ${m.inst.key || 'C'}` : m.inst.sound, kind: 'button', x: X2, y: BOT.y, w: C4, h: BOT.h });
      items.push({ id: 'nav:songs', label: 'Songs', sub: 'Play along', kind: 'button', x: X3, y: BOT.y, w: C4, h: BOT.h });
      items.push(corner('nav:main', 'Menu'));
      // recording: a take of four bars that loops, layers on top, the loop stopped or played, cleared
      const lp = m.loop ?? { state: 'off', layers: 0, recording: false };
      const busy = lp.state === 'count' || lp.recording;
      items.push({ id: 'loop:rec', label: busy ? 'Recording' : lp.layers ? 'Add a layer' : 'Record', sub: busy ? 'Four bars' : lp.layers >= 3 ? 'Replaces the first' : 'Four bars, loops', on: busy, kind: 'button', x: 32, y: 340, w: C4, h: 200, dot: true });
      items.push({ id: lp.state === 'play' || busy ? 'loop:stop' : 'loop:play', label: lp.state === 'play' || busy ? 'Stop loop' : 'Play loop', off: !lp.layers && !busy, kind: 'button', x: X2, y: 340, w: C4, h: 200 });
      items.push({ id: 'loop:clear', label: 'Clear', sub: lp.layers ? `${lp.layers} layer${lp.layers === 1 ? '' : 's'}` : undefined, off: !lp.layers, kind: 'button', x: X3, y: 340, w: C4, h: 200 });
      return { id: 'free', title: m.inst.name, line: m.line || (m.inst.id === 'drums' || m.inst.id === 'congas' ? 'Hit anything. It all sounds right.' : 'Play anything. Every note fits.'), items, body: 'how', how: m.inst.how ?? '' };
    }
    case 'build': {
      const items: Item[] = m.perform
        ? [
            { id: 'stop', label: m.sure ? 'Sure?' : 'Stop', kind: 'ghost', x: 32, y: BOT.y, w: 312, h: BOT.h },
            { id: 'key:prev', label: 'Back a part', kind: 'button', x: 360, y: BOT.y, w: 420, h: BOT.h },
            { id: 'key:play', label: 'Perform it', kind: 'play', x: 796, y: BOT.y, w: W - 32 - 796, h: BOT.h },
          ]
        : [
            { id: 'stop', label: m.sure ? 'Sure?' : 'Stop', kind: 'ghost', x: 32, y: BOT.y, w: 312, h: BOT.h },
            { id: 'key:prev', label: 'Back a part', kind: 'button', x: 360, y: BOT.y, w: W - 32 - 360, h: BOT.h },
          ];
      return { id: 'build', title: m.line, line: m.sub, items, body: 'song' };
    }
    case 'song': {
      // pause in the corner, always in the same place; the instruments you can switch to along the bottom, then stop
      const c = row(Math.max(1, m.switchable.length), 32, 1104 - 16, 16);
      const items: Item[] = m.switchable.map((id, i) => ({ id: `inst:${id}`, label: instDef(id as never).name, icon: id, on: id === m.inst.id, color: instDef(id as never).color, kind: 'card' as const, x: c[i].x, y: BOT.y, w: c[i].w, h: BOT.h }));
      items.push({ id: 'stop', label: m.sure ? 'Sure?' : 'Stop', kind: 'ghost', x: 1104, y: BOT.y, w: 224, h: BOT.h });
      items.push(corner('pause', 'Pause'));
      return { id: 'song', title: m.line, line: m.sub, items, body: 'song' };
    }
    case 'pause': {
      // the song where it stopped, your score so far; quit is quiet, resume is the one to press
      const items: Item[] = [
        { id: 'pause:songs', label: 'Quit song', kind: 'ghost', x: 32, y: BOT.y, w: 312, h: BOT.h },
        { id: 'pause:restart', label: 'Restart', kind: 'button', x: 360, y: BOT.y, w: 420, h: BOT.h },
        { id: 'resume', label: 'Resume', sub: 'Counts you in', kind: 'play', x: 796, y: BOT.y, w: W - 32 - 796, h: BOT.h },
      ];
      return { id: 'pause', title: 'Paused', line: m.line, items, body: 'pause' };
    }
    case 'results': {
      // menu on the left, the song's way on in the middle, the one thing to press on the right
      const again: Item = { id: 'again', label: m.harder ? `Again on ${m.harder.toLowerCase()}` : 'Again', kind: 'play', x: 0, y: BOT.y, w: 0, h: BOT.h };
      const second: Item = m.easier ? { id: 'again:easy', label: 'Again on easy', kind: 'button', x: 0, y: BOT.y, w: 0, h: BOT.h } : { id: 'next', label: 'Next', sub: m.next ? 'The next song' : undefined, kind: 'button', off: !m.next, x: 0, y: BOT.y, w: 0, h: BOT.h };
      const items: Item[] = m.make
        ? [
            { id: 'nav:main', label: 'Menu', kind: 'button', x: 32, y: BOT.y, w: 224, h: BOT.h },
            { id: 'make', label: 'Make it yours', kind: 'button', x: 272, y: BOT.y, w: 320, h: BOT.h },
            { ...second, x: 608, w: 320 },
            { ...again, x: 944, w: 384 },
          ]
        : [{ id: 'nav:main', label: 'Menu', kind: 'button', x: 32, y: BOT.y, w: 300, h: BOT.h }, { ...second, x: 348, w: 420 }, { ...again, x: 784, w: 544 }];
      return { id: 'results', title: m.line, line: m.sub, items, body: 'results' };
    }
  }
}
