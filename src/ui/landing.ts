/**
 * The 2D page shown outside the headset: Thump's site (docs/SITE-DESIGN.md). The hero is a muted loop of the game
 * being played with one line over it and one action, which depends on where you are: in the Quest's browser it
 * enters mixed reality, on a computer it plays the loop full screen (the address to type on the Quest beside it), on
 * a phone it sends the link on. Then the six instruments as big pictures; a drawing of the desk that plays itself
 * as it scrolls in and then plays the headset's own sounds under your clicks; lessons and grades; the setlist as a
 * poster; playing together (start a band or type a friend's code); the settings; a footer with the maker.
 */
import { VisibilityState, type World } from '@iwsdk/core';
import { audio, type Voice } from '../audio/engine.js';
import { loadSettings, saveSettings, type Settings } from '../persistence/settings.js';
import { loadProgress, saveProgress, freshProgress } from '../persistence/progress.js';
import { coop, normaliseCode, type CoopStatus } from '../net/coop.js';
import { asPlayer } from '../net/band.js';
import { PADS, type Lane } from '../config.js';
import { CONGA, handpanZones, marimbaZones, percVoice, pianoBlacks, pianoZones, strumNotes, type InstId } from '../kit/shelf.js';
import { LESSONS, TUNES } from '../songs/tunes.js';
import { scoreOf } from '../songs/score.js';
import { ringMarkSvg, wordmarkSvg } from './brand.js';
import { PAGE_ROOT, PAGE_SCALE, centreOnTray, deskSvg } from './landing-drawing.js';

const LIVE_URL = 'playthump.pages.dev';

/** The six, in the page's order: the name, how you play it (in a line), and its picture from the game. */
const BAND: { id: InstId; label: string; line: string; alt: string }[] = [
  { id: 'drums', label: 'Drums', line: 'Slap the heads with your palms. Make a fist and there’s a stick in it.', alt: 'The drum kit on the desk mid-song, seen from the seat: a ring closing onto the snare, Perfect on the bass drum.' },
  { id: 'guitar', label: 'Guitar', line: 'Across your lap, like a real one. One hand holds the chord, the other strums. Pinch and you’ve got a pick.', alt: 'The acoustic guitar held across the lap from the seat, chord names along the neck, a Perfect on the strings.' },
  { id: 'piano', label: 'Piano', line: 'Real-size keys. Hold one down and it rings on; drag a finger along them for a glissando.', alt: 'The piano keyboard on the desk mid-song, a key lit as it is pressed.' },
  { id: 'marimba', label: 'Marimba', line: 'Eight rosewood bars. A fist holds a mallet.', alt: 'The rosewood marimba on the desk mid-song, a bar lit as it is hit.' },
  { id: 'congas', label: 'Congas', line: 'Palm in the middle for an open tone, fingers on the edge for a slap.', alt: 'Two congas on the desk mid-song, a ring closing onto one head.' },
  { id: 'handpan', label: 'Handpan', line: 'The deep note in the middle, eight around it.', alt: 'The handpan on the desk mid-song, a note lit as it is played.' },
];
const labelOf = (id: InstId) => BAND.find((b) => b.id === id)?.label ?? id;

/** What isn't obvious from a drawing, under it (most say nothing). */
const ABOUT: Partial<Record<InstId, string>> = {
  piano: 'A black key plays the notes either side of it. The round button is a chord.',
  guitar: 'Pick a chord on the neck, then strum over the soundhole.',
  congas: 'Inside the dashed line: open tone. Outside it: slap.',
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const two = (n: number) => String(n).padStart(2, '0');
/** A song's length at full speed, from its score: its passes and solos to the last note. */
const lengthOf = (t: (typeof TUNES)[number]) => {
  const s = Math.round(((scoreOf(t).end + 1) * 60) / t.bpm);
  return `${Math.floor(s / 60)}:${two(s % 60)}`;
};

/** Where the page is open: the headset's browser (it can enter), a phone (it sends the link on), or a computer. */
type Where = 'xr' | 'phone' | 'desk';

export function mountLanding(world: World): void {
  const songs = [...TUNES.filter((t) => t.original), ...TUNES.filter((t) => !t.original)];
  const originals = TUNES.filter((t) => t.original).length;
  const songRow = (t: (typeof TUNES)[number]) =>
    `<li class="song${t.original ? ' orig' : ''}"><span class="name">${esc(t.name)}</span><span class="meta-line">${esc(t.original ? 'Original' : t.by)}<span class="dot-sep" aria-hidden="true"> / </span><span class="nb">${t.bpm} bpm</span><span class="dot-sep" aria-hidden="true"> / </span><span class="nb"><span class="vh">length </span>${lengthOf(t)}</span></span></li>`;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  const slow = !!conn && (conn.saveData === true || /(^|-)2g$/.test(conn.effectiveType ?? ''));
  const autoplay = !reduce && !slow;

  const shot = (name: string, alt: string, w = 1200, h = 800, lazy = true) =>
    `<img src="./site/${name}.webp" width="${w}" height="${h}" ${lazy ? 'loading="lazy" decoding="async"' : ''} alt="${esc(alt)}" />`;

  const el = document.createElement('div');
  el.id = 'landing';
  el.innerHTML = `
    <a class="skip" href="#main">Skip to the page</a>
    <header class="bar">
      <div class="wrap bar-in">
        <a class="brand" href="#top" aria-label="Thump, to the top">${ringMarkSvg({ simple: true })}${wordmarkSvg('currentColor', '')}</a>
        <nav class="nav" aria-label="On this page">
          <a href="#band">Instruments</a><a href="#setlist">Songs</a><a href="#together">Play together</a>
        </nav>
        <button type="button" class="btn btn-1 btn-s" id="bar-enter">Enter</button>
      </div>
    </header>

    <main id="main" tabindex="-1">
      <section class="hero" id="top" aria-labelledby="hero-h">
        <div class="hero-media">
          <video id="hero-video" class="hero-video" ${autoplay ? 'autoplay' : ''} muted loop playsinline preload="${slow ? 'none' : 'auto'}" poster="./site/hero.jpg" aria-label="Thump being played: two hands drumming on the kit on a desk in mixed reality, rings closing onto each drum, Perfect after Perfect.">
            <source src="./site/hero.mp4" type="video/mp4" />
          </video>
        </div>
        <div class="wrap hero-in">
          <h1 id="hero-h">A band on your desk<span class="vh">.</span><span class="beat" aria-hidden="true"><svg class="beat-ring" viewBox="-50 -50 100 100" aria-hidden="true" focusable="false"><circle class="closing" r="40" pathLength="100" stroke-dasharray="78 22" transform="rotate(-20)"/><circle class="burst" r="40" pathLength="100" stroke-dasharray="31 9 15 18" transform="rotate(40)"/></svg></span></h1>
          <p class="tag">Play real instruments with your bare hands, in VR. Put the controllers down and look at your desk. There’s a drum kit set into it now, and every hit lands on the wood.</p>
          <div class="cta">
            <button id="enter-xr" class="btn btn-1" type="button">Enter mixed reality</button>
          </div>
          <p class="addr" id="addr">On your Quest, open <button type="button" class="addr-url" id="addr-url">${LIVE_URL}</button></p>
          <p class="go-note" id="go-note" aria-live="polite">Nothing to install. Sit at a desk, put the controllers away and hit a drum to start.</p>
          <p class="xr-fail" role="alert" hidden>That didn’t start. Say yes to the Quest’s prompts, then try again.</p>
        </div>
      </section>

      <section class="pics" id="band" aria-label="The instruments">
        <div class="wrap">
          <p class="label">Six instruments. Swap any time, even mid-song</p>
          <ul class="mosaic">
            ${BAND.map((b, i) => `<li class="pic pic-${i + 1}"><figure>${shot(b.id, b.alt)}<figcaption><strong>${b.label}</strong> ${b.line}</figcaption></figure></li>`).join('')}
          </ul>
        </div>
      </section>

      <section class="play" id="play" aria-labelledby="play-h">
        <div class="wrap">
          <div class="play-head">
            <h2 class="h2" id="play-h">Go on, hit something.</h2>
            <p>These are the headset’s own sounds. Click or tap a part, or hold and drag across them for a run.</p>
          </div>
          <ul class="picker" role="group" aria-label="Instrument">
            ${BAND.map((b) => `<li><button type="button" class="pick" data-inst="${b.id}" aria-pressed="false">${b.label}</button></li>`).join('')}
          </ul>
          <figure class="desk">
            <div class="stage"></div>
            <figcaption class="about" aria-live="polite"></figcaption>
          </figure>
        </div>
      </section>

      <section class="learn" id="learn" aria-label="Lessons and grades">
        <div class="wrap">
          <div class="row row-a">
            <figure class="row-pic">${shot('lesson', 'A drum lesson holding the song still: the ring on the snare, a line from the sign on the desk to it, and the word Now.')}</figure>
            <div class="row-words">
              <h2 class="h3">Lessons that wait for you to get it.</h2>
              <p>One for each instrument. The song stops on the note you need and says <strong>Now</strong> when it’s time. Then it waits, for as long as you like, until you hit it.</p>
            </div>
          </div>
          <div class="row row-b">
            <figure class="row-pic">${shot('results', 'The results for Canon in D: grade S with three stars, All perfect, 74,300 points, 200 perfect and no misses.')}</figure>
            <div class="row-words">
              <h2 class="h3">Get an <span class="hot">S</span>. Then do it again on Hard.</h2>
              <p>Easy, Normal or Hard, on every song. Ten in a row doubles your points, and it climbs to ×4. Play the gold bars clean, throw both hands up, and the Spotlight doubles them again. Every song keeps a world board for each instrument and level. You go on it as a random two-word name, like Silver Harmony. No account.</p>
            </div>
          </div>
        </div>
      </section>

      <section class="setlist" id="setlist" aria-labelledby="setlist-h">
        <div class="wrap">
          <div class="set-head">
            <h2 class="title mega" id="setlist-h">${TUNES.length} songs</h2>
            <p class="set-note">${originals} written for Thump, ${TUNES.length - originals} you already know, set to new grooves. Lengths at full speed.</p>
          </div>
          <ol class="songs">${songs.map(songRow).join('')}</ol>
          <p class="lessons">Plus a lesson for each instrument (${LESSONS.map((l) => esc(l.name.replace(/^Learn /, ''))).join(', ').replace(/, ([^,]+)$/, ' and $1')}).</p>
        </div>
      </section>

      <section class="together" id="together" aria-labelledby="together-h">
        <div class="wrap">
          <p class="label">Play together</p>
          <div class="together-in">
            <div class="together-words">
              <h2 class="title" id="together-h">Four friends, four rooms, one song.</h2>
              <p class="big">One of you gets a code. Everyone else types it in. The band gets a name of its own, something like The Midnight Coffee Rings, and a board for the songs you play together.</p>
            </div>
            <p class="eg"><span class="eg-cap">e.g.</span><span class="eg-code">PKRW</span></p>
          </div>
          <div class="band-ctl">
            <div>
              <h3>Start a band</h3>
              <p class="hint">You get a four-letter code to send your friends.</p>
              <button type="button" id="band-start" class="btn btn-1">Get a code</button>
            </div>
            <div>
              <div class="join">
                <div class="field">
                  <label for="band-code">Join with a code</label>
                  <input id="band-code" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" />
                </div>
                <button type="button" id="band-join" class="btn btn-2">Join</button>
              </div>
            </div>
          </div>
          <p id="band-status" aria-live="polite"></p>
        </div>
      </section>

      <section class="prep-sec" id="settings" aria-label="Settings">
        <div class="wrap">
          <details class="prep">
            <summary>Settings <small>Set these in the Quest’s browser before you go in. It remembers them.</small><span class="pm" aria-hidden="true"></span></summary>
            <div class="opts">
              <label class="sel">Lead hand
                <select data-k="hand"><option value="auto">Whichever you rest first</option><option value="right">Right</option><option value="left">Left</option></select>
              </label>
              <label class="sel">Speed <span class="range"><input type="range" min="0.6" max="1" step="0.1" data-k="tempo" /> <output id="tempo-out"></output></span></label>
              <label><input type="checkbox" data-k="oneHand" /> One hand (the kit sized for one hand)</label>
              <label><input type="checkbox" data-k="highContrast" /> High contrast</label>
              <label><input type="checkbox" data-k="calmMotion" /> Less movement</label>
              <label><input type="checkbox" data-k="noWords" /> No words in the headset</label>
              <label><input type="checkbox" data-k="band" /> Backing band (off: just you)</label>
              <label><input type="checkbox" data-k="placeFresh" /> Set up the desk fresh each time</label>
            </div>
            <p class="small-print">Timing: <span id="offset-out"></span>. <button type="button" id="reset" class="link">Start over</button></p>
          </details>
        </div>
      </section>
    </main>

    <footer class="foot">
      <div class="wrap foot-in">
        <div class="foot-maker">
          ${wordmarkSvg('currentColor', 'Thump')}
          <p class="maker">Made by OR-6, after years of drumming on desks that never played back.</p>
        </div>
        <div class="foot-text">
          <p class="specs">Meta Quest, in its browser. Hands only, seated. 1–4 players. Free, nothing to install.</p>
          <p>Played on a Quest headset; built and tested in the WebXR emulator.</p>
          <p>Instrument samples from the Versilian Community Sample Library (CC0); the guitar is a Martin HD-28 recorded by Jeff Learman (Discord SFZ GM Bank, CC0). Particles by Kenney (CC0).</p>
          <p>An entry in the Meta VR Start Developer Competition 2026 (Gaming).</p>
        </div>
      </div>
    </footer>`;
  document.body.appendChild(el);
  // (index.html paints the top of the page while the game loads; this replaces it)
  document.getElementById('landing-boot')?.remove();

  // the bar is clear over the hero; it takes the plum and its rule once the page has scrolled
  const bar = el.querySelector<HTMLElement>('.bar')!;
  el.addEventListener('scroll', () => bar.classList.toggle('scrolled', el.scrollTop > 8), { passive: true });

  // ---- the one action: enter (in the headset), watch it played (a computer), send it to the Quest (a phone) ----
  const btn = el.querySelector<HTMLButtonElement>('#enter-xr')!;
  const barBtn = el.querySelector<HTMLButtonElement>('#bar-enter')!;
  const xrFail = el.querySelector<HTMLElement>('.xr-fail')!;
  const note = el.querySelector<HTMLElement>('#go-note')!;
  const addr = el.querySelector<HTMLElement>('#addr')!;
  const addrUrl = el.querySelector<HTMLButtonElement>('#addr-url')!;
  const video = el.querySelector<HTMLVideoElement>('#hero-video')!;
  const xrApi = (navigator as Navigator & { xr?: { isSessionSupported(mode: string): Promise<boolean> } }).xr;
  const phone = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820;
  // (?where=desk|phone|xr shows the page as it is there: for reviews and screenshots)
  const forced = new URLSearchParams(location.search).get('where') as Where | null;
  let where: Where = forced ?? (world.xrEnabled && !!xrApi && !new URLSearchParams(location.search).has('jam') ? 'xr' : phone ? 'phone' : 'desk');
  const label = () => {
    btn.textContent = where === 'xr' ? 'Enter mixed reality' : where === 'phone' ? 'Send it to my Quest' : 'Watch it played';
    barBtn.textContent = where === 'xr' ? 'Enter' : where === 'phone' ? 'Send' : 'Watch';
    el.dataset.where = where;
    addr.hidden = where === 'xr';
    note.textContent = where === 'xr' ? 'Any desk will do, or a tray table on a train. Put the controllers down: it’s hands only.' : 'Nothing to install. Sit at a desk, put the controllers away and hit a drum to start.';
  };
  label();
  if (where === 'xr' && !forced)
    void xrApi!.isSessionSupported('immersive-ar').then(
      (ok) => ((where = ok ? 'xr' : phone ? 'phone' : 'desk'), label()),
      () => ((where = phone ? 'phone' : 'desk'), label()),
    );

  const url = () => `https://${LIVE_URL}/`;
  const copyLink = () => {
    const say = (ok: boolean) => (note.textContent = ok ? 'Copied. Now open it on your Quest.' : `Type ${LIVE_URL} into the Quest’s browser.`);
    if (!navigator.clipboard) return say(false);
    void navigator.clipboard.writeText(url()).then(() => say(true), () => say(false));
  };
  const share = () => {
    if (navigator.share)
      void navigator.share({ title: 'Thump', text: 'Open this on your Quest: a band on your desk.', url: url() }).then(
        () => (note.textContent = 'Sent. Now open it on your Quest.'),
        (e: DOMException) => e?.name !== 'AbortError' && copyLink(),
      );
    else copyLink();
  };
  /** The loop, full screen if the browser will, from the start. */
  const watch = () => {
    video.currentTime = 0;
    video.controls = true;
    void video.play().catch(() => {});
    const fs = video.requestFullscreen?.bind(video) ?? (video as HTMLVideoElement & { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen?.bind(video);
    if (fs) void Promise.resolve(fs()).catch(() => video.scrollIntoView({ behavior: smooth(), block: 'center' }));
    else video.scrollIntoView({ behavior: smooth(), block: 'center' });
  };
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) return;
    video.controls = false;
    if (!autoplay) video.pause();
  });
  addrUrl.addEventListener('click', copyLink);
  btn.addEventListener('click', () => {
    if (where === 'desk') return watch();
    if (where === 'phone') return share();
    audio.resume(); // a user gesture: unlock audio now
    xrFail.hidden = true;
    world.launchXR();
    const w = world as unknown as { session?: unknown; sessionRequestPending?: boolean };
    const t0 = performance.now();
    const check = window.setInterval(() => {
      if (w.session) return window.clearInterval(check);
      if (!w.sessionRequestPending && performance.now() - t0 > 600) {
        window.clearInterval(check);
        xrFail.hidden = false;
      }
    }, 250);
  });
  barBtn.addEventListener('click', () => {
    if (where === 'xr') return btn.click();
    el.scrollTo({ top: 0, behavior: smooth() });
    btn.click();
  });
  // (the loop only runs while it's on screen)
  if (autoplay)
    new IntersectionObserver(([e]) => {
      if (document.fullscreenElement) return;
      if (e.isIntersecting) void video.play().catch(() => {});
      else video.pause();
    }, { root: el }).observe(video);

  // in-page links scroll the page (it's its own scroller), without touching the address
  el.addEventListener('click', (e) => {
    const a = (e.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
    if (!a) return;
    const target = el.querySelector<HTMLElement>(a.getAttribute('href')!);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: smooth(), block: 'start' });
    if (target.id === 'main') target.focus({ preventScroll: true });
  });

  mountDesk(el);

  // playing together: start a band (a code for friends) or join one, then everyone enters
  const bandStart = el.querySelector<HTMLButtonElement>('#band-start')!;
  const bandJoin = el.querySelector<HTMLButtonElement>('#band-join')!;
  const bandCode = el.querySelector<HTMLInputElement>('#band-code')!;
  const bandStatus = el.querySelector<HTMLElement>('#band-status')!;
  const showBand = (st: CoopStatus) => {
    if (st.role === 'caller') return;
    const n = st.players ?? 1;
    bandStatus.textContent =
      st.state === 'hosting' ? (st.code ? `Your code: ${st.code}. Friends type it here, then everyone enters.` : (st.message ?? 'Connecting…'))
      : st.state === 'joining' ? 'Connecting…'
      : st.state === 'connected' ? `${n} in the band${st.role === 'host' && st.code ? ` (code ${st.code})` : ''}. Enter mixed reality.`
      : st.state === 'error' || st.state === 'closed' ? (st.message ?? 'That didn’t work')
      : '';
  };
  window.addEventListener('thump:coop', (e) => showBand((e as CustomEvent<CoopStatus>).detail));
  bandStart.addEventListener('click', () => {
    audio.resume();
    void coop.host();
  });
  const join = () => {
    audio.resume();
    const c = normaliseCode(bandCode.value);
    if (!c) {
      bandStatus.textContent = 'Four letters, from your friend’s page';
      return;
    }
    void coop.join(c, 'guest');
  };
  bandJoin.addEventListener('click', join);
  bandCode.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') join();
  });

  // settings: every control writes through at once and tells the game
  const s = loadSettings();
  const offOut = el.querySelector<HTMLElement>('#offset-out')!;
  const tempoOut = el.querySelector<HTMLOutputElement>('#tempo-out')!;
  const show = (st: Settings) => {
    offOut.textContent = `${Math.round(st.offset * 1000)} ms`;
    tempoOut.textContent = st.tempo >= 0.999 ? '100%' : `${Math.round(st.tempo * 100)}%`;
  };
  for (const input of el.querySelectorAll<HTMLInputElement | HTMLSelectElement>('.opts [data-k]')) {
    const k = input.dataset.k as keyof Settings;
    const v = s[k];
    if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = k === 'calmMotion' ? (v ?? false) === true : v === true;
    else input.value = String(v);
    input.addEventListener('change', () => {
      const cur = loadSettings();
      const val = input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked : input instanceof HTMLInputElement && input.type === 'range' ? Number(input.value) : input.value;
      const next = { ...cur, [k]: val } as Settings;
      saveSettings(next);
      show(next);
      window.dispatchEvent(new Event('thump:settings'));
    });
  }
  show(s);
  el.querySelector<HTMLButtonElement>('#reset')!.addEventListener('click', (e) => {
    const b = e.currentTarget as HTMLButtonElement;
    if (b.dataset.sure !== '1') {
      b.dataset.sure = '1';
      b.textContent = 'Sure? Tap again';
      return;
    }
    const p = loadProgress();
    saveProgress({ ...freshProgress(), kit: p.kit, ...(p.me ? { me: p.me } : {}), ...(p.bandWords ? { bandWords: p.bandWords } : {}) });
    window.dispatchEvent(new Event('thump:reset'));
    b.textContent = 'Done. Progress cleared; your name and settings stay.';
    b.dataset.sure = '';
  });

  // the page hides while in the headset
  world.visibilityState.subscribe((v) => {
    el.hidden = v !== VisibilityState.NonImmersive;
    if (el.hidden) video.pause();
  });
}

/** Smooth scrolling, unless the reader asked for less movement. */
const smooth = (): ScrollBehavior => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

/** The kit's pieces, by the ids the drawing gives them. */
const KIT = new Set<string>(['kick', 'snare', 'hat', 'tom', 'floor', 'crash', 'ride']);
/** Each instrument's recordings (src/audio/sample-map.ts), decoded as soon as it's on show; the guitar is synthesised. */
const BANKS: Record<InstId, readonly string[]> = {
  drums: ['kit:kick', 'kit:snare', 'kit:hat', 'kit:tom', 'kit:crash', 'ride'],
  piano: ['keys'],
  marimba: ['marimba'],
  congas: ['congas', 'kit:rim'],
  handpan: ['tongue'],
  guitar: [],
};

/**
 * What each drawing plays by itself, at 96 bpm, until you play it: the parts, one per eighth note ('' a rest). A
 * ring closes onto each part over the two beats before it, as in the game, and bursts when it lands.
 */
const DEMO_BPM = 96;
const DEMO: Record<InstId, readonly string[]> = {
  drums: ['kick', 'hat', 'snare', 'hat', 'kick', 'kick', 'snare', 'crash'],
  piano: ['w0', '', 'w2', '', 'w4', 'w3', 'w2', ''],
  marimba: ['m0', 'm2', 'm4', 'm7', 'm4', 'm2', 'm3', ''],
  congas: ['c0', '', 'c3', 'c2', 'c0', 'c1', 'c3', ''],
  handpan: ['h0', '', 'h3', 'h5', 'h0', 'h2', 'h6', ''],
  guitar: ['g0', 'strum', '', 'strum', 'g1', 'strum', '', 'strum'],
};

/** The drawing of the desk: pick an instrument, tap its parts, hear the headset's sounds. */
function mountDesk(el: HTMLElement): void {
  const stage = el.querySelector<HTMLElement>('.stage')!;
  const about = el.querySelector<HTMLElement>('.about')!;
  const picks = [...el.querySelectorAll<HTMLButtonElement>('.pick')];
  let inst: InstId = 'drums';
  let chord = 0;

  const piano = pianoZones(PAGE_ROOT.piano, PAGE_SCALE);
  const pianoMidi = new Map(piano.map((z) => [z.i, z.midi]));
  const blacks = new Map(pianoBlacks(piano).map((b) => [`b${b.a}-${b.b}`, [pianoMidi.get(b.a)!, pianoMidi.get(b.b)!]]));
  const marimba = new Map(marimbaZones(PAGE_ROOT.marimba, PAGE_SCALE).map((z) => [z.i, z.midi]));
  const handpan = new Map(handpanZones(PAGE_ROOT.handpan, PAGE_SCALE).map((z) => [z.i, { midi: z.midi, x: z.x }]));

  const strum = (pan: number) => {
    const notes = strumNotes(PAGE_ROOT.guitar, PAGE_SCALE.chords[chord]);
    const t = audio.now();
    notes.forEach((n, i) => audio.pluck(n, 0.75 - i * 0.04, pan, t + i * 0.012, 'steel'));
  };
  const panOf = (xm: number) => Math.max(-0.8, Math.min(0.8, xm / 0.4));
  const holdChord = (id: string) => stage.querySelectorAll('.part[data-part^="g"]').forEach((p) => p.classList.toggle('on', p.getAttribute('data-part') === id));

  /** Play a part by its id. */
  const play = (id: string): void => {
    const n = Number(id.slice(1));
    // (every piece of the kit by its own name, before the letters below: the crash isn't a conga)
    if (KIT.has(id)) audio.drum(id as Voice, 0.85, panOf(PADS[id as Lane].x));
    else if (id === 'chord') for (const k of [0, 7, 16]) audio.modal('keys', PAGE_ROOT.piano - 12 + k, 0.6, -0.4, 0, 0.5, 'page-chord', k);
    else if (id[0] === 'w') audio.modal('keys', pianoMidi.get(n) ?? 60, 0.8, panOf((n - 7) * 0.0235), 0, 0.5, 'page');
    else if (id[0] === 'b') for (const m of blacks.get(id) ?? []) audio.modal('keys', m, 0.7, 0, 0, 0.5, `page${m}`);
    else if (id[0] === 'm') audio.modal('marimba', marimba.get(n) ?? 60, 0.8, panOf((n - 3.5) * 0.054), 0, 0.5, 'page');
    else if (id[0] === 'h') {
      const z = handpan.get(n);
      audio.modal('tongue', z?.midi ?? 48, 0.8, panOf(z?.x ?? 0), 0, 0.5, 'page');
    } else if (id[0] === 'c') {
      const v = percVoice('congas', n);
      const pan = panOf(CONGA.x[n >= 2 ? 1 : 0]);
      audio.modal('congas', 0, 0.85, pan, 0, v.size, 'page', v.tone);
      if (v.slap) audio.drum('rim', 0.25, pan);
    } else if (id[0] === 'g') {
      chord = n;
      holdChord(id);
      strum(-0.4);
    } else if (id === 'strum') strum(0.3);
  };

  /** A hit's burst: the broken rings go out, in hot, from the point that was hit. */
  const burst = (x: number, y: number) => {
    const r = stage.getBoundingClientRect();
    const span = document.createElement('span');
    span.className = 'hit-ring';
    span.style.left = `${x - r.left}px`;
    span.style.top = `${y - r.top}px`;
    span.innerHTML =
      '<svg viewBox="-50 -50 100 100" aria-hidden="true"><circle r="24" stroke-width="7" pathLength="100" stroke-dasharray="78 22" transform="rotate(-20)"/><circle r="44" stroke-width="4" pathLength="100" stroke-dasharray="31 9 15 18" transform="rotate(40)"/></svg>';
    span.addEventListener('animationend', () => span.remove());
    stage.appendChild(span);
    window.setTimeout(() => span.remove(), 1000);
  };
  const light = (p: Element) => {
    // (off, then on next frame: a second hit restarts the light)
    p.classList.remove('lit');
    requestAnimationFrame(() => p.classList.add('lit'));
  };

  // Audio may not start on the press itself: a phone only lets it start when the finger lifts (and Safari only inside
  // that event), so every lift, click and key on the drawing unlocks it too, and a press made before it's running is
  // held and played the moment it is, rather than lost.
  const held: { id: string; at: number }[] = [];
  let waiting = 0;
  const flush = () => {
    waiting = 0;
    const now = performance.now();
    while (held.length && now - held[0].at > 1200) held.shift();
    if (!held.length) return;
    if (!audio.running) {
      waiting = requestAnimationFrame(flush);
      return;
    }
    for (const h of held.splice(0)) asPlayer(() => play(h.id));
  };
  const unlock = () => {
    // (Safari: play through the ringer switch, as an instrument should; it's asked for by a tap on one)
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session && session.type !== 'playback') session.type = 'playback';
    audio.resume();
  };
  for (const type of ['pointerup', 'touchend', 'click', 'keydown'] as const) stage.addEventListener(type, unlock);

  const hit = (p: Element, at?: { x: number; y: number }) => {
    const id = p.getAttribute('data-part') ?? '';
    youPlayed();
    unlock();
    if (audio.running && !held.length) asPlayer(() => play(id));
    else {
      held.push({ id, at: performance.now() });
      if (held.length > 6) held.shift();
      if (!waiting) waiting = requestAnimationFrame(flush);
    }
    light(p);
    const b = p.getBoundingClientRect();
    burst(at?.x ?? b.left + b.width / 2, at?.y ?? b.top + b.height / 2);
  };

  // ---- the drawing plays itself as it scrolls in: rings close onto the parts in time and burst as they land ----
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const beat = 60 / DEMO_BPM;
  let inView = false;
  let quietUntil = 0;
  let demoT0 = 0;
  let demoStep = -1;
  let demoRaf = 0;
  /** A ring the shape of the part, from nearly twice its size two beats ahead to its outline on the beat. */
  const closing = (p: Element, lead: number) => {
    const sr = stage.getBoundingClientRect();
    const b = p.querySelector('.glow > *')?.getBoundingClientRect() ?? p.getBoundingClientRect();
    const round = /^(circle|ellipse)$/i.test(p.querySelector('.glow > *')?.tagName ?? '');
    const ring = document.createElement('span');
    ring.className = `close-ring${round ? ' round' : ''}`;
    ring.style.cssText = `left:${b.left - sr.left}px;top:${b.top - sr.top}px;width:${b.width}px;height:${b.height}px;animation-duration:${lead}s`;
    ring.addEventListener('animationend', () => ring.remove());
    stage.appendChild(ring);
    window.setTimeout(() => ring.remove(), lead * 1000 + 400);
  };
  const demoTick = () => {
    demoRaf = 0;
    if (!inView || reduce.matches) return;
    demoRaf = requestAnimationFrame(demoTick);
    const now = performance.now();
    if (now < quietUntil) return;
    if (!demoT0) demoT0 = now;
    const pat = DEMO[inst];
    // each step's ring sets off two beats before it lands
    const step = Math.floor(((now - demoT0) / 1000 / (beat / 2)));
    while (demoStep < step) {
      demoStep++;
      const id = pat[(demoStep + 4) % pat.length];
      const p = id && stage.querySelector(`.part[data-part="${id}"]`);
      if (p) {
        closing(p, beat * 2);
        window.setTimeout(() => {
          if (!inView || performance.now() < quietUntil) return;
          if (id[0] === 'g' && id !== 'strum') {
            chord = Number(id.slice(1));
            holdChord(id);
          }
          light(p);
          const b = p.getBoundingClientRect();
          burst(b.left + b.width / 2, b.top + b.height / 2);
        }, beat * 2000);
      }
    }
  };
  const demoStart = () => {
    if (!demoRaf && inView && !reduce.matches) {
      demoT0 = 0;
      demoStep = -1;
      demoRaf = requestAnimationFrame(demoTick);
    }
  };
  const clearRings = () => stage.querySelectorAll('.close-ring').forEach((r) => r.remove());
  /** You're playing: the drawing stops playing itself, and starts again a few seconds after your last hit. */
  let resume = 0;
  function youPlayed() {
    quietUntil = performance.now() + 4000;
    clearRings();
    window.clearTimeout(resume);
    resume = window.setTimeout(() => {
      cancelAnimationFrame(demoRaf);
      demoRaf = 0;
      demoStart();
    }, 4100);
  }
  new IntersectionObserver(([e]) => {
    inView = e.isIntersecting;
    if (inView) demoStart();
    else clearRings();
  }, { root: el, threshold: 0.4 }).observe(stage);

  const show = (id: InstId, animate: boolean) => {
    inst = id;
    void audio.sampler.warm(BANKS[id]);
    clearRings();
    stage.querySelectorAll('svg.desk-svg').forEach((s) => s.remove());
    stage.insertAdjacentHTML('afterbegin', deskSvg(id, labelOf(id)));
    centreOnTray(stage.querySelector('svg.desk-svg')!);
    stage.dataset.inst = id;
    about.textContent = ABOUT[id] ?? '';
    for (const b of picks) b.setAttribute('aria-pressed', String(b.dataset.inst === id));
    if (id === 'guitar') stage.querySelector(`.part[data-part="g${chord}"]`)?.classList.add('on');
    demoT0 = 0;
    demoStep = -1;
    if (animate) {
      stage.classList.remove('unfold');
      requestAnimationFrame(() => stage.classList.add('unfold'));
    }
  };

  for (const b of picks) {
    b.addEventListener('click', () => {
      if (b.dataset.inst !== inst) show(b.dataset.inst as InstId, true);
    });
    // (its recordings come in as soon as you look like choosing it)
    const warm = () => void audio.sampler.warm(BANKS[b.dataset.inst as InstId] ?? []);
    b.addEventListener('pointerenter', warm);
    b.addEventListener('focus', warm);
  }

  // a press plays at once; held down (a mouse button or a finger), sliding over the parts plays them too (a glissando)
  const down = new Map<number, Element | null>();
  stage.addEventListener('pointerdown', (e) => {
    const p = (e.target as Element).closest('.part');
    if (!p) return;
    down.set(e.pointerId, p);
    hit(p, e.clientX || e.clientY ? { x: e.clientX, y: e.clientY } : undefined);
  });
  // (found under the pointer, not from the event's target: a finger's events all go to the part it first touched)
  stage.addEventListener('pointermove', (e) => {
    if (!down.has(e.pointerId)) return;
    const p = document.elementFromPoint(e.clientX, e.clientY)?.closest('.part') ?? null;
    if (p === down.get(e.pointerId)) return;
    down.set(e.pointerId, p && stage.contains(p) ? p : null);
    if (p && stage.contains(p)) hit(p, { x: e.clientX, y: e.clientY });
  });
  const up = (e: PointerEvent) => down.delete(e.pointerId);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  // a slide that started on a part plays, rather than scrolling the page
  stage.addEventListener('touchmove', (e) => {
    if (down.size && e.cancelable) e.preventDefault();
  }, { passive: false });
  stage.addEventListener('keydown', (e) => {
    const p = (e.target as Element).closest('.part');
    if (!p || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    hit(p);
  });
  stage.addEventListener('animationend', (e) => (e.target as Element).closest('.part')?.classList.remove('lit'));

  show(inst, false);
}
