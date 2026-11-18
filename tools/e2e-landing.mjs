#!/usr/bin/env node
/** The 2D page: no page errors, the pitch, the six instruments and the Enter button are there, the desk drawing plays,
 * settings write through, nothing scrolls sideways; a screenshot at desktop width. And the drawing really sounds: the
 * first tap on a phone (audio locked until the finger lifts, as phones do), then every part of all six instruments
 * clicked with the mouse, each heard at the output (an analyser on it) as a voice the engine started from its
 * recording, and a slide across the keys by mouse and by finger. */
import { cli, run, xr, wait, check, done } from './e2e-lib.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

if (xr('status').sessionActive) xr('exit');
run('tools/clear-storage.mjs');
cli('browser', 'reload');
await wait(3000);
run('tools/unblock-storage.mjs');

/**
 * Runs in the managed browser (written out to tools/.probe.mjs, so it's self-contained). `step`: 'gate' puts a tap
 * on the output and a phone's audio lock in the page, then taps the kick with a finger; 'parts' clicks every part of
 * one instrument; 'slide' drags over the piano's keys with the mouse and over the marimba's bars with a finger.
 */
async function soundProbe({ page, frame }, { step, inst, voice, sampled }) {
  const f = frame ?? page;
  const off = frame ? await (await frame.frameElement()).boundingBox() : { x: 0, y: 0 };
  await f.evaluate(() => {
    if (window.__snd) return;
    const T = (window.__snd = { ans: new Map(), buf: new Float32Array(2048), starts: 0, sampled: 0, gate: false, locked: 0 });
    // every context's output also feeds an analyser: what reaches the speakers
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (dest) {
      if (dest instanceof AudioDestinationNode) {
        let an = T.ans.get(this.context);
        if (!an) T.ans.set(this.context, (an = this.context.createAnalyser()));
        an.fftSize = 2048;
        connect.call(this, an);
      }
      return connect.apply(this, arguments);
    };
    // a voice started, and whether it plays one of the sampler's decoded recordings
    for (const C of [AudioBufferSourceNode, OscillatorNode]) {
      const start = C.prototype.start;
      C.prototype.start = function (...a) {
        T.starts++;
        const clips = window.__thump?.audio?.sampler?.buffers;
        if (this.buffer && clips) for (const b of clips.values()) if (b === this.buffer) (T.sampled++, (T.lastClip = b));
        return start.apply(this, a);
      };
    }
    // a phone's rule: audio may start only inside a key, a mouse press, or a finger lifting (not a finger landing)
    for (const type of ['keydown', 'mousedown', 'pointerdown', 'pointerup', 'touchend', 'click'])
      window.addEventListener(type, (e) => {
        if (type === 'pointerdown' && e.pointerType !== 'mouse') return;
        if (type === 'pointerup' && e.pointerType === 'mouse') return;
        T.gate = true;
        setTimeout(() => (T.gate = false), 0);
      }, true);
    const Real = window.AudioContext;
    window.AudioContext = class extends Real {
      constructor(o) {
        super(o);
        this.__locked = !T.gate;
        if (this.__locked) (T.locked++, Real.prototype.suspend.call(this));
      }
      get state() {
        return this.__locked ? 'suspended' : super.state;
      }
      resume() {
        if (this.__locked && !T.gate) return new Promise(() => {});
        this.__locked = false;
        return super.resume();
      }
    };
    T.peak = async (ms) => {
      let peak = 0;
      const end = performance.now() + ms;
      do {
        await new Promise((r) => setTimeout(r, 15));
        for (const an of T.ans.values()) {
          an.getFloatTimeDomainData(T.buf);
          for (const v of T.buf) peak = Math.max(peak, Math.abs(v));
        }
      } while (performance.now() < end);
      return peak;
    };
    // the last note's ring dies away first, so each part is heard on its own
    T.quiet = async () => {
      const end = performance.now() + 3000;
      while (performance.now() < end && (await T.peak(60)) > 0.03);
    };
    // a point inside the part that the part itself gets (not one drawn over it); 'low': near its front edge
    T.point = (id, where = 'any') => {
      const p = document.querySelector(`.stage .part[data-part="${id}"]`);
      p.scrollIntoView({ block: 'center', behavior: 'instant' });
      const b = p.getBoundingClientRect();
      const rows = where === 'low' ? [10, 9, 8, 7, 6, 5, 4, 3, 2, 1] : [6, 5, 7, 4, 8, 3, 9, 2, 10, 1];
      for (const j of rows)
        for (const i of [6, 5, 7, 4, 8, 3, 9, 2, 10, 1]) {
          const x = b.left + (b.width * i) / 11, y = b.top + (b.height * j) / 11;
          if (document.elementFromPoint(x, y)?.closest('.part') === p) return { x, y };
        }
      return null;
    };
    T.count = () => ({ starts: T.starts, sampled: T.sampled, played: { ...(window.__thump?.audio?.played ?? {}) } });
  });
  const at = (pt) => ({ x: off.x + pt.x, y: off.y + pt.y });

  if (step === 'gate') {
    // the page's very first touch on its audio: a finger on the kick (nothing may sound yet), then lifting it
    return await f.evaluate(async () => {
      const T = window.__snd;
      const ctxBefore = !!window.__thump?.audio?.ctx;
      const pt = T.point('kick');
      const target = document.elementFromPoint(pt.x, pt.y);
      const ev = (type) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 7, isPrimary: true, clientX: pt.x, clientY: pt.y }));
      const c0 = T.count();
      ev('pointerdown');
      const pressed = { locked: T.locked, running: !!window.__thump?.audio?.running, peak: +(await T.peak(150)).toFixed(3) };
      ev('pointerup');
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: pt.x, clientY: pt.y }));
      const peak = +(await T.peak(500)).toFixed(3);
      const c1 = T.count();
      return { ctxBefore, pressed, peak, starts: c1.starts - c0.starts, sampled: c1.sampled - c0.sampled, kick: (c1.played.kick ?? 0) - (c0.played.kick ?? 0), running: !!window.__thump?.audio?.running };
    });
  }

  if (step === 'parts') {
    await f.locator(`.pick[data-inst="${inst}"]`).click();
    // (its recordings get the moment they'd have between choosing an instrument and playing it)
    await page.waitForTimeout(900);
    const ids = await f.evaluate(() => [...document.querySelectorAll('.stage .part')].map((p) => p.getAttribute('data-part')));
    const out = {};
    for (const id of ids) {
      await f.evaluate(() => window.__snd.quiet());
      const pt = await f.evaluate((id) => window.__snd.point(id), id);
      if (!pt) {
        out[id] = { unreachable: true };
        continue;
      }
      const c0 = await f.evaluate(() => window.__snd.count());
      const xy = at(pt);
      await page.mouse.click(xy.x, xy.y);
      const peak = await f.evaluate(() => window.__snd.peak(350));
      const c1 = await f.evaluate(() => window.__snd.count());
      const v = voice === 'part' ? id : voice;
      const d = { starts: c1.starts - c0.starts, sampled: c1.sampled - c0.sampled, played: v ? (c1.played[v] ?? 0) - (c0.played[v] ?? 0) : null };
      out[id] = { ...d, peak: +peak.toFixed(3), ok: d.starts > 0 && peak > 0.03 && (!v || d.played > 0) && (!sampled || d.sampled > 0) };
    }
    return out;
  }

  if (step === 'slide') {
    // the mouse held down along the front of the piano's white keys, C to the next octave's D
    await f.locator('.pick[data-inst="piano"]').click();
    await page.waitForTimeout(600);
    const a = at(await f.evaluate(() => window.__snd.point('w0', 'low')));
    const b = at(await f.evaluate(() => window.__snd.point('w6', 'low')));
    const k0 = await f.evaluate(() => window.__snd.count());
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 30 });
    await page.mouse.up();
    const k1 = await f.evaluate(() => window.__snd.count());
    // a finger along the marimba's bars (its events all go to the bar it landed on, as a touchscreen's do)
    await f.locator('.pick[data-inst="marimba"]').click();
    await page.waitForTimeout(600);
    const marimba = await f.evaluate(async () => {
      const T = window.__snd;
      const a = T.point('m0'), b = T.point('m7');
      const target = document.elementFromPoint(a.x, a.y);
      const ev = (type, x) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 9, isPrimary: true, clientX: x, clientY: a.y }));
      const c0 = T.count();
      ev('pointerdown', a.x);
      for (let i = 1; i <= 30; i++) {
        ev('pointermove', a.x + ((b.x - a.x) * i) / 30);
        await new Promise((r) => setTimeout(r, 8));
      }
      ev('pointerup', b.x);
      await new Promise((r) => setTimeout(r, 50));
      return (T.count().played.marimba ?? 0) - (c0.played.marimba ?? 0);
    });
    return { keys: (k1.played.keys ?? 0) - (k0.played.keys ?? 0), marimba };
  }
}
const sound = (args) => {
  writeFileSync('tools/.probe.mjs', `const probe = ${soundProbe.toString()};\nexport default (c) => probe(c, ${JSON.stringify(args)});\n`);
  // (the piano's 31 parts, each heard out: longer than a run's default minute)
  return JSON.parse(execFileSync('npx', ['@iwsdk/cli', 'browser', 'run', 'tools/.probe.mjs', '--timeout', '110000'], { encoding: 'utf8' })).data.result;
};

const g = sound({ step: 'gate' });
check('a phone’s first tap: nothing sounds while the finger is down (audio locked)', !g.ctxBefore && g.pressed.locked > 0 && !g.pressed.running && g.pressed.peak < 0.01, JSON.stringify(g));
check('a phone’s first tap: the kick sounds as the finger lifts, from its recording', g.running && g.kick === 1 && g.sampled > 0 && g.peak > 0.05, JSON.stringify(g));
// every part of every instrument, clicked: heard, played as its own voice, and (but the guitar's synthesised strings)
// from its recording
const VOICES = { drums: 'part', piano: 'keys', marimba: 'marimba', congas: 'congas', handpan: 'tongue', guitar: null };
for (const [inst, voice] of Object.entries(VOICES)) {
  const parts = sound({ step: 'parts', inst, voice, sampled: inst !== 'guitar' });
  const ids = Object.keys(parts);
  const bad = ids.filter((id) => !parts[id].ok);
  check(`${inst}: every part sounds (${ids.length - bad.length}/${ids.length})`, ids.length > 0 && !bad.length, bad.map((id) => `${id} ${JSON.stringify(parts[id])}`).join('; '));
}
const sl = sound({ step: 'slide' });
check('a slide plays every key it crosses: the mouse over the piano, a finger over the marimba', sl.keys >= 7 && sl.marimba >= 8, JSON.stringify(sl));

writeFileSync('tools/.probe.mjs',`export default async function run({ page, frame }) { const f = frame ?? page; return await f.evaluate(async () => {
  const el = document.getElementById('landing');
  const text = el?.innerText ?? '';
  const box = el?.querySelector('[data-k="highContrast"]');
  box.checked = true; box.dispatchEvent(new Event('change'));
  const saved = JSON.parse(localStorage.getItem('thump:settings.v1') || '{}');
  box.checked = false; box.dispatchEvent(new Event('change'));
  // every instrument draws on the desk, and a part of it lights when it's pressed
  const drawn = {};
  for (const b of el.querySelectorAll('.pick')) {
    b.click();
    const part = el.querySelector('.stage .part');
    part?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    drawn[b.dataset.inst] = { parts: el.querySelectorAll('.stage .part').length, lit: !!part?.classList.contains('lit') };
  }
  el.querySelector('.pick[data-inst="drums"]')?.click();
  return { shown: !!el && !el.hidden, text, h1: el.querySelector('h1')?.textContent ?? '', enter: !!document.getElementById('enter-xr'), hc: saved.highContrast === true, drawn,
    wide: el.scrollWidth > el.clientWidth + 1, boot: !!document.getElementById('landing-boot') };
}); }\n`);
const r = run('tools/.probe.mjs');
// (the page's names; the keyboard is the game's piano)
const six = { Keyboard: 'piano', Drums: 'drums', Marimba: 'marimba', Guitar: 'guitar', Congas: 'congas', Handpan: 'handpan' };
check('the page is shown outside the headset', r.shown);
check('the loading shell is gone', !r.boot);
check('the headline: play real instruments with just your hands', /^\s*Play real instruments with just your hands\.\s*$/i.test(r.h1.replace(/\s+/g, ' ')), r.h1);
check('and the line over it: a band on your desk', /A band on your desk/i.test(r.text), r.text.slice(0, 120));
check('all six instruments are named', Object.keys(six).every((n) => new RegExp(n, 'i').test(r.text)), Object.keys(six).filter((n) => !new RegExp(n, 'i').test(r.text)).join(', '));
check('each instrument is drawn and plays', Object.values(six).every((id) => r.drawn[id]?.parts > 0 && r.drawn[id]?.lit), JSON.stringify(r.drawn));
check('play together: start a band or type a code', /Play together/i.test(r.text) && /Start a band/i.test(r.text), r.text.match(/Play together.{0,60}/i)?.[0] ?? '');
check('no desk-object pitch left', !/drum machine|your mug|chair arm/i.test(r.text), r.text.match(/drum machine|your mug|chair arm/i)?.[0] ?? '');
check('no felt-era copy left', !/felt|crowd|plush|loom/i.test(r.text), r.text.match(/felt|crowd|plush|loom/i)?.[0] ?? '');
check('no leaderboard, lessons, scoring or Spotlight on the page', !/leaderboard|\blessons?\b|spotlight|\bscor(e|es|ing)\b|points/i.test(r.text), r.text.match(/leaderboard|\blessons?\b|spotlight|\bscor(e|es|ing)\b|points/i)?.[0] ?? '');
check('the Enter button is there', r.enter);
check('a setting writes through', r.hc);
check('nothing scrolls sideways', !r.wide);
mkdirSync('artifacts', { recursive: true });
cli('browser', 'screenshot', '--output-file', 'artifacts/landing-desktop.png');
done('E2E landing');
