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
  /** What the middle shows besides items: a song's progress and count, or results' stars. */
  body?: 'song' | 'results';
}

export interface MenuInput {
  page: PageId;
  line: string;
  sub: string;
  inst: { id: string; name: string; scale: string; sound: string; oct: number };
  songs: { name: string; meta: string; stars: number; locked: boolean }[];
  songSel: number;
  level: 'easy' | 'normal';
  band: { state: string; code: string; players: number };
  settings: { slow: boolean; oneHand: boolean; contrast: boolean; words: boolean; backing: boolean };
  /** Results: the next song's button ('' none), and whether MAKE IT YOURS is offered. */
  next: string;
  make?: boolean;
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
const back = (): Item => ({ id: 'back', label: 'BACK', kind: 'button', x: 24, y: 24, w: 170, h: 84 });

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
        { id: 'nav:instruments', label: 'FREE PLAY', sub: `${m.inst.name} on the desk`, icon: m.inst.id, kind: 'big', x: c[0].x, y: 150, w: c[0].w, h: 290 },
        { id: 'nav:songs', label: 'SONGS', sub: 'Play along with the band', kind: 'big', x: c[1].x, y: 150, w: c[1].w, h: 290 },
        { id: 'nav:build', label: 'MAKE A TRACK', sub: 'Your own, part by part', kind: 'big', x: c[0].x, y: 464, w: c[0].w, h: 290 },
        { id: 'nav:band', label: 'PLAY TOGETHER', sub: m.band.state === 'connected' ? `${m.band.players} in the band` : 'Up to four headsets', kind: 'big', x: c[1].x, y: 464, w: c[1].w, h: 290 },
        { id: 'nav:settings', label: 'SETTINGS', kind: 'button', x: W - 250, y: 30, w: 226, h: 84 },
      ];
      return { id: 'main', title: 'THUMP', line: m.line || 'Pick something to play', items };
    }
    case 'instruments': {
      const c = row(SHELF.length, 24, W - 24, 18);
      const items: Item[] = SHELF.map((d, i) => ({ id: `inst:${d.id}`, label: d.name.toUpperCase(), icon: d.id, color: d.color, on: d.id === m.inst.id, kind: 'card' as const, x: c[i].x, y: 150, w: c[i].w, h: 360 }));
      items.push(back());
      if (m.inst.id !== 'drums') items.push({ id: 'nav:inst', label: `${m.inst.name.toUpperCase()}: NOTES & SOUND`, kind: 'button', x: 24, y: 560, w: 640, h: 190 });
      items.push({ id: 'nav:free', label: 'PLAY IT', kind: 'play', x: 696, y: 560, w: 640, h: 190 });
      return { id: 'instruments', title: 'Instruments', line: 'Tap one to put it on the desk', items };
    }
    case 'inst': {
      const d = instDef(m.inst.id as never);
      const items: Item[] = [back()];
      // each row named on the left (not pressable)
      const label = (text: string, y: number): Item => ({ id: `label:${text}`, label: text, kind: 'chip', off: true, x: 24, y, w: 216, h: 130 });
      items.push(label('NOTES', 150), label('SOUND', 310), label('PITCH', 470));
      const sc = row(SCALES.length, 260, W - 24, 14);
      SCALES.forEach((s, i) => items.push({ id: `scale:${s.id}`, label: s.name.toUpperCase(), on: s.name === m.inst.scale, kind: 'chip', x: sc[i].x, y: 150, w: sc[i].w, h: 130 }));
      const so = row(d.sounds.length, 260, W - 24, 14);
      d.sounds.forEach((s, i) => items.push({ id: `sound:${s.id}`, label: s.name.toUpperCase(), on: s.name === m.inst.sound, kind: 'chip', x: so[i].x, y: 310, w: so[i].w, h: 130 }));
      items.push({ id: 'oct:-1', label: 'LOWER', kind: 'chip', off: m.inst.oct <= -1, x: 260, y: 470, w: 300, h: 130 });
      items.push({ id: 'oct:+1', label: 'HIGHER', kind: 'chip', off: m.inst.oct >= 1, x: 760, y: 470, w: 300, h: 130 });
      items.push({ id: 'nav:free', label: 'PLAY IT', kind: 'play', x: 24, y: 640, w: W - 48, h: 130 });
      return { id: 'inst', title: `${m.inst.name}`, line: '', items };
    }
    case 'songs': {
      const items: Item[] = [back()];
      m.songs.forEach((s, i) => items.push({ id: `song:${i}`, label: s.name, sub: s.locked ? 'Play the one before it' : s.meta, stars: s.stars, on: i === m.songSel, off: s.locked, kind: 'row', x: 24, y: 140 + i * 124, w: 860, h: 108 }));
      items.push({ id: 'level:easy', label: 'EASY', on: m.level === 'easy', kind: 'chip', x: 910, y: 130, w: 205, h: 110 });
      items.push({ id: 'level:normal', label: 'NORMAL', on: m.level === 'normal', kind: 'chip', x: 1131, y: 130, w: 205, h: 110 });
      items.push({ id: 'nav:instruments', label: m.inst.name.toUpperCase(), sub: 'You play this', icon: m.inst.id, kind: 'button', x: 910, y: 262, w: 426, h: 190 });
      items.push({ id: 'play', label: 'PLAY', kind: 'play', x: 910, y: 474, w: 426, h: 294 });
      return { id: 'songs', title: 'Songs', line: '', items };
    }
    case 'band': {
      const items: Item[] = [back()];
      const on = m.band.state === 'connected' || m.band.state === 'hosting';
      if (!on) items.push({ id: 'band:start', label: 'START A BAND', sub: 'Friends type its code on the Thump page', kind: 'big', x: 24, y: 150, w: W - 48, h: 300 });
      else {
        items.push({ id: 'nav:songs', label: 'PICK A SONG', sub: 'Everyone plays it, on one beat', kind: 'big', x: 24, y: 470, w: 640, h: 290 });
        items.push({ id: 'band:leave', label: 'LEAVE', kind: 'button', x: 696, y: 470, w: 640, h: 290 });
      }
      const line = m.band.state === 'connected' ? `${m.band.players} in the band, code ${m.band.code}` : m.band.state === 'hosting' ? `Code ${m.band.code}: friends type it on the Thump page` : m.band.state === 'joining' ? 'Connecting' : 'Play with friends, wherever they are';
      return { id: 'band', title: 'Play together', line, items };
    }
    case 'settings': {
      const items: Item[] = [];
      const t = (id: string, label: string, on: boolean, i: number): Item => ({ id, label, sub: on ? 'On' : 'Off', on, kind: 'chip', x: 24 + (i % 3) * 444, y: 150 + Math.floor(i / 3) * 210, w: 424, h: 190 });
      items.push(t('set:slow', 'SLOWER SONGS', m.settings.slow, 0), t('set:onehand', 'ONE HAND', m.settings.oneHand, 1), t('set:contrast', 'HIGH CONTRAST', m.settings.contrast, 2), t('set:words', 'HINTS IN\nTHE ROOM', m.settings.words, 3), t('set:backing', 'BACKING BAND', m.settings.backing, 4));
      items.push({ id: 'back', label: 'DONE', kind: 'play', x: 24, y: 590, w: W - 48, h: 180 });
      return { id: 'settings', title: 'Settings', line: '', items };
    }
    case 'tune': {
      const labels = m.tune ?? ['', '', '', '', ''];
      const c = row(5, 24, W - 24, 18);
      return { id: 'tune', title: m.line, line: m.sub, items: labels.map((l, i) => ({ id: `key:${['prev', 'play', 'next', 'jam', 'loop'][i]}`, label: l, kind: 'button' as const, off: !l, x: c[i].x, y: 590, w: c[i].w, h: 180 })) };
    }
    case 'free': {
      const c = row(4, 24, W - 24, 18);
      const items: Item[] = [
        { id: 'nav:instruments', label: 'INSTRUMENTS', icon: m.inst.id, kind: 'button', x: c[0].x, y: 560, w: c[0].w, h: 210 },
        { id: 'nav:inst', label: 'NOTES &\nSOUND', sub: m.inst.id === 'drums' ? '' : `${m.inst.scale}, ${m.inst.sound}`, off: m.inst.id === 'drums', kind: 'button', x: c[1].x, y: 560, w: c[1].w, h: 210 },
        { id: 'nav:songs', label: 'SONGS', kind: 'play', x: c[2].x, y: 560, w: c[2].w, h: 210 },
        { id: 'nav:main', label: 'MENU', kind: 'button', x: c[3].x, y: 560, w: c[3].w, h: 210 },
      ];
      return { id: 'free', title: m.inst.name, line: m.line || 'Play anything. Every note fits.', items };
    }
    case 'build': {
      const items: Item[] = m.perform
        ? [
            { id: 'key:play', label: 'PERFORM IT', kind: 'play', x: 24, y: 590, w: 860, h: 180 },
            { id: 'stop', label: m.sure ? 'SURE?' : 'STOP', kind: 'button', x: 908, y: 590, w: 428, h: 180 },
          ]
        : [
            { id: 'key:prev', label: 'BACK A PART', kind: 'button', x: 24, y: 590, w: 640, h: 180 },
            { id: 'stop', label: m.sure ? 'SURE?' : 'STOP', kind: 'button', x: 696, y: 590, w: 640, h: 180 },
          ];
      return { id: 'build', title: m.line, line: m.sub, items, body: 'song' };
    }
    case 'song': {
      const c = row(Math.max(1, m.switchable.length) + 1, 24, W - 24, 18);
      const items: Item[] = m.switchable.map((id, i) => ({ id: `inst:${id}`, label: instDef(id as never).name.toUpperCase(), icon: id, on: id === m.inst.id, color: instDef(id as never).color, kind: 'card' as const, x: c[i].x, y: 590, w: c[i].w, h: 180 }));
      items.push({ id: 'stop', label: m.sure ? 'SURE?' : 'STOP', kind: 'button', x: c[c.length - 1].x, y: 590, w: c[c.length - 1].w, h: 180 });
      return { id: 'song', title: m.line, line: m.sub, items, body: 'song' };
    }
    case 'results': {
      const c = row(m.make ? 4 : 3, 24, W - 24, 18);
      const items: Item[] = [
        { id: 'again', label: 'AGAIN', kind: 'play', x: c[0].x, y: 590, w: c[0].w, h: 180 },
        { id: 'next', label: m.next, kind: 'button', off: !m.next, x: c[1].x, y: 590, w: c[1].w, h: 180 },
      ];
      if (m.make) items.push({ id: 'make', label: 'MAKE IT\nYOURS', kind: 'button', x: c[2].x, y: 590, w: c[2].w, h: 180 });
      items.push({ id: 'nav:main', label: 'MENU', kind: 'button', x: c[c.length - 1].x, y: 590, w: c[c.length - 1].w, h: 180 });
      return { id: 'results', title: m.line, line: m.sub, items, body: 'results' };
    }
  }
}
