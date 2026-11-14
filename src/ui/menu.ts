/**
 * The panel's pages, as data: a title, a line under it, and the things you can press (each with an action id and
 * where it sits on the panel, in canvas pixels 1360×800). Pure, so every screen is testable: the main menu, the
 * instruments, an instrument's settings, the songs, playing together, settings, and the screens inside a song.
 */
import { SCALES, SHELF, instDef } from '../kit/shelf.js';

export type PageId = 'main' | 'free' | 'instruments' | 'inst' | 'songs' | 'band' | 'settings' | 'song' | 'build' | 'results' | 'tune';

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
  /** big: a main-menu tile; card: an instrument; row: a list row; chip: a small choice; button: a plain one. */
  kind: 'big' | 'card' | 'row' | 'chip' | 'button' | 'play';
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
  body?: 'song' | 'results' | 'how';
  /** The how-to line for a 'how' body. */
  how?: string;
}

export interface MenuInput {
  page: PageId;
  line: string;
  sub: string;
  inst: { id: string; name: string; scale: string; sound: string; oct: number; how?: string };
  songs: { name: string; meta: string; stars: number; locked: boolean }[];
  songSel: number;
  level: 'easy' | 'normal' | 'hard';
  band: { state: string; code: string; players: number; message?: string };
  settings: { slow: boolean; oneHand: boolean; contrast: boolean; words: boolean; backing: boolean };
  /** Results: the next song's button ('' none), and whether MAKE IT YOURS is offered. */
  next: string;
  make?: boolean;
  /** Three stars: AGAIN goes up a level ('NORMAL' or 'HARD'; '' not). */
  harder?: string;
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
const back = (): Item => ({ id: 'back', label: 'Back', kind: 'button', x: 24, y: 24, w: 190, h: 96 });
/** The top-right corner button (beside the title). */
const corner = (id: string, label: string): Item => ({ id, label, kind: 'button', x: W - 250, y: 24, w: 226, h: 96 });
/** The bottom row: where every screen keeps what you do next. */
const BOT = { y: 680, h: 200 };

/** Split a row of `n` across the panel from x0 to x1 with a gap. */
function row(n: number, x0: number, x1: number, gap: number): { x: number; w: number }[] {
  const w = (x1 - x0 - gap * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => ({ x: x0 + i * (w + gap), w }));
}

export function buildPage(m: MenuInput): Page {
  switch (m.page) {
    case 'main': {
      const c = row(2, 24, W - 24, 24);
      const items: Item[] = [
        { id: 'nav:instruments', label: 'Instruments', sub: 'Swap it', icon: m.inst.id, kind: 'big', x: c[0].x, y: 170, w: c[0].w, h: 340 },
        { id: 'nav:songs', label: 'Songs', sub: 'Play along', kind: 'big', x: c[1].x, y: 170, w: c[1].w, h: 340 },
        { id: 'nav:build', label: 'Make a track', sub: 'Part by part', kind: 'big', x: c[0].x, y: 534, w: c[0].w, h: 340 },
        { id: 'nav:band', label: 'Play together', sub: m.band.state === 'connected' ? `${m.band.players} in the band` : 'Up to four', kind: 'big', x: c[1].x, y: 534, w: c[1].w, h: 340 },
        corner('nav:settings', 'Settings'),
      ];
      return { id: 'main', title: 'Thump', line: m.line || 'Pick something to play', items };
    }
    case 'instruments': {
      // two rows of three, a picture and a name each
      const c = row(3, 24, W - 24, 18);
      const items: Item[] = SHELF.map((d, i) => ({ id: `inst:${d.id}`, label: d.name, icon: d.id, color: d.color, on: d.id === m.inst.id, kind: 'card' as const, x: c[i % 3].x, y: 170 + Math.floor(i / 3) * 252, w: c[i % 3].w, h: 236 }));
      items.push(back());
      const h = row(2, 24, W - 24, 24);
      if (m.inst.id !== 'drums') items.push({ id: 'nav:inst', label: m.inst.scale ? 'Notes & sound' : 'Sound', sub: m.inst.name, kind: 'button', x: h[0].x, y: BOT.y, w: h[0].w, h: BOT.h });
      items.push({ id: 'nav:free', label: 'Play it', kind: 'play', x: h[1].x, y: BOT.y, w: h[1].w, h: BOT.h });
      return { id: 'instruments', title: 'Instruments', line: 'Tap one to put it on the desk', items };
    }
    case 'inst': {
      const d = instDef(m.inst.id as never);
      const items: Item[] = [back()];
      // each row named on the left (not pressable)
      const label = (text: string, y: number): Item => ({ id: `label:${text}`, label: text, kind: 'chip', off: true, x: 24, y, w: 216, h: 140 });
      // (a drum has no notes to pick and no pitch: just its sound)
      const pitched = d.scales !== false;
      const soundY = pitched ? 330 : 170;
      items.push(label('Sound', soundY));
      if (pitched) {
        items.push(label('Notes', 170), label('Pitch', 490));
        const sc = row(SCALES.length, 260, W - 24, 14);
        SCALES.forEach((s, i) => items.push({ id: `scale:${s.id}`, label: s.name, on: s.name === m.inst.scale, kind: 'chip', x: sc[i].x, y: 170, w: sc[i].w, h: 140 }));
        items.push({ id: 'oct:-1', label: 'Lower', kind: 'chip', off: m.inst.oct <= -1, x: 260, y: 490, w: 320, h: 140 });
        items.push({ id: 'oct:+1', label: 'Higher', kind: 'chip', off: m.inst.oct >= 1, x: 600, y: 490, w: 320, h: 140 });
      }
      const so = row(d.sounds.length, 260, W - 24, 14);
      d.sounds.forEach((s, i) => items.push({ id: `sound:${s.id}`, label: s.name, on: s.name === m.inst.sound, kind: 'chip', x: so[i].x, y: soundY, w: so[i].w, h: 140 }));
      items.push({ id: 'nav:free', label: 'Play it', kind: 'play', x: 24, y: BOT.y, w: W - 48, h: BOT.h });
      return { id: 'inst', title: `${m.inst.name}`, line: '', items };
    }
    case 'songs': {
      // the songs as tiles, two across; what you'll play down the right
      const items: Item[] = [back()];
      const tw = (956 - 24 - 24 - 16) / 2;
      m.songs.forEach((s, i) => items.push({ id: `song:${i}`, label: s.name, sub: s.meta, stars: s.stars, on: i === m.songSel, off: s.locked, kind: 'row', x: 24 + (i % 2) * (tw + 16), y: 170 + Math.floor(i / 2) * 236, w: tw, h: 220 }));
      const lv = m.level === 'hard' ? 'Hard' : m.level === 'normal' ? 'Normal' : 'Easy';
      items.push({ id: 'level', label: lv, sub: m.level === 'hard' ? 'Tap for easy' : 'Tap for harder', kind: 'button', x: 956, y: 170, w: 380, h: 150 });
      items.push({ id: 'nav:instruments', label: m.inst.name, sub: 'Tap to change', kind: 'button', x: 956, y: 336, w: 380, h: 150 });
      items.push({ id: 'listen', label: 'Listen first', kind: 'button', x: 956, y: 502, w: 380, h: 120 });
      items.push({ id: 'play', label: 'Play', kind: 'play', x: 956, y: 638, w: 380, h: 242 });
      return { id: 'songs', title: 'Songs', line: m.sub, items };
    }
    case 'band': {
      const items: Item[] = [back()];
      const on = m.band.state === 'connected' || m.band.state === 'hosting';
      if (!on) items.push({ id: 'band:start', label: 'Start a band', sub: 'Friends type its code on the Thump page', kind: 'big', x: 24, y: 170, w: W - 48, h: 340 });
      else {
        items.push({ id: 'nav:songs', label: 'Pick a song', sub: 'Everyone plays it, on one beat', kind: 'big', x: 24, y: 534, w: 644, h: 340 });
        items.push({ id: 'band:leave', label: 'Leave', kind: 'button', x: 692, y: 534, w: 644, h: 340 });
      }
      // (the code only once the connection service has it; a failure says what went wrong)
      const msg = m.band.message ?? '';
      const line =
        m.band.state === 'connected'
          ? `${m.band.players} in the band, code ${m.band.code}`
          : m.band.state === 'hosting'
            ? msg.startsWith('Connecting') ? 'Connecting…' : `Code ${m.band.code}: friends type it on the Thump page`
            : m.band.state === 'joining'
              ? 'Connecting…'
              : (m.band.state === 'error' || m.band.state === 'closed') && msg
                ? msg
                : 'Play with friends, wherever they are';
      return { id: 'band', title: 'Play together', line, items };
    }
    case 'settings': {
      const items: Item[] = [back()];
      const t = (id: string, label: string, on: boolean, i: number): Item => ({ id, label, sub: on ? 'On' : 'Off', on, kind: 'chip', x: 24 + (i % 3) * 444, y: 170 + Math.floor(i / 3) * 260, w: 424, h: 240 });
      items.push(t('set:slow', 'Slower songs', m.settings.slow, 0), t('set:onehand', 'One hand', m.settings.oneHand, 1), t('set:contrast', 'High contrast', m.settings.contrast, 2), t('set:words', 'Hints in\nthe room', m.settings.words, 3), t('set:backing', 'Backing band', m.settings.backing, 4));
      return { id: 'settings', title: 'Settings', line: '', items };
    }
    case 'tune': {
      const labels = m.tune ?? ['', '', '', '', ''];
      const c = row(5, 24, W - 24, 18);
      return { id: 'tune', title: m.line, line: m.sub, items: labels.map((l, i) => ({ id: `key:${['prev', 'play', 'next', 'jam', 'loop'][i]}`, label: l, kind: 'button' as const, off: !l, x: c[i].x, y: 590, w: c[i].w, h: 180 })) };
    }
    case 'free': {
      // (the drums have no notes or sounds to pick: no button for it)
      const drums = m.inst.id === 'drums';
      const c = row(drums ? 2 : 3, 24, W - 24, 18);
      const items: Item[] = [{ id: 'nav:instruments', label: 'Instruments', kind: 'button', x: c[0].x, y: BOT.y, w: c[0].w, h: BOT.h }];
      if (!drums) items.push({ id: 'nav:inst', label: m.inst.scale ? 'Notes &\nsound' : 'Sound', sub: m.inst.scale ? `${m.inst.scale}, ${m.inst.sound.toLowerCase()}` : m.inst.sound, kind: 'button', x: c[1].x, y: BOT.y, w: c[1].w, h: BOT.h });
      items.push({ id: 'nav:songs', label: 'Songs', kind: 'play', x: c[drums ? 1 : 2].x, y: BOT.y, w: c[drums ? 1 : 2].w, h: BOT.h });
      items.push(corner('nav:main', 'Menu'));
      // how to play it, large, in the body (or what the game has to say)
      return { id: 'free', title: m.inst.name, line: m.line || (m.inst.id === 'drums' || m.inst.id === 'congas' ? 'Hit anything. It all sounds right.' : 'Play anything. Every note fits.'), items, body: 'how', how: m.inst.how ?? '' };
    }
    case 'build': {
      const items: Item[] = m.perform
        ? [
            { id: 'key:play', label: 'Perform it', kind: 'play', x: 24, y: BOT.y, w: 860, h: BOT.h },
            { id: 'stop', label: m.sure ? 'Sure?' : 'Stop', kind: 'button', x: 908, y: BOT.y, w: 428, h: BOT.h },
          ]
        : [
            { id: 'key:prev', label: 'Back a part', kind: 'button', x: 24, y: BOT.y, w: 644, h: BOT.h },
            { id: 'stop', label: m.sure ? 'Sure?' : 'Stop', kind: 'button', x: 692, y: BOT.y, w: 644, h: BOT.h },
          ];
      return { id: 'build', title: m.line, line: m.sub, items, body: 'song' };
    }
    case 'song': {
      const c = row(Math.max(1, m.switchable.length) + 1, 24, W - 24, 18);
      const items: Item[] = m.switchable.map((id, i) => ({ id: `inst:${id}`, label: instDef(id as never).name, icon: id, on: id === m.inst.id, color: instDef(id as never).color, kind: 'card' as const, x: c[i].x, y: BOT.y, w: c[i].w, h: BOT.h }));
      items.push({ id: 'stop', label: m.sure ? 'Sure?' : 'Stop', kind: 'button', x: c[c.length - 1].x, y: BOT.y, w: c[c.length - 1].w, h: BOT.h });
      return { id: 'song', title: m.line, line: m.sub, items, body: 'song' };
    }
    case 'results': {
      const c = row(m.make ? 4 : 3, 24, W - 24, 18);
      const items: Item[] = [
        { id: 'again', label: m.harder ? `Again on\n${m.harder.toLowerCase()}` : 'Again', kind: 'play', x: c[0].x, y: BOT.y, w: c[0].w, h: BOT.h },
        { id: 'next', label: m.next, kind: 'button', off: !m.next, x: c[1].x, y: BOT.y, w: c[1].w, h: BOT.h },
      ];
      if (m.make) items.push({ id: 'make', label: 'Make it\nyours', kind: 'button', x: c[2].x, y: BOT.y, w: c[2].w, h: BOT.h });
      items.push({ id: 'nav:main', label: 'Menu', kind: 'button', x: c[c.length - 1].x, y: BOT.y, w: c[c.length - 1].w, h: BOT.h });
      return { id: 'results', title: m.line, line: m.sub, items, body: 'results' };
    }
  }
}
