/**
 * The 2D page shown outside the headset: Thump's hackathon page (docs/SITE-DESIGN.md). What it is in one line and one
 * action, which depends on where you are: in the Quest's browser it enters mixed reality, on a computer it plays the
 * video (or, until there is one, goes to the drawing), on a phone it sends the link on. Then the video and the
 * screenshots (slots that fill themselves when the files are in public/site), how to play, the six instruments as a
 * drawing that plays the headset's own sounds, the songs, making a track and playing together, the settings, and who
 * made it.
 */
import { VisibilityState, type World } from '@iwsdk/core';
import { audio, type Voice } from '../audio/engine.js';
import { loadSettings, saveSettings, type Settings } from '../persistence/settings.js';
import { loadProgress, saveProgress, freshProgress } from '../persistence/progress.js';
import { coop, normaliseCode, type CoopStatus } from '../net/coop.js';
import { asPlayer } from '../net/band.js';
import { PADS, type Lane } from '../config.js';
import { CONGA, KEYBOARD, handpanZones, marimbaZones, percVoice, pianoBlacks, pianoZones, strumNotes, type InstId } from '../kit/shelf.js';
import { TUNES } from '../songs/tunes.js';
import { scoreOf } from '../songs/score.js';
import { ringMarkSvg } from './brand.js';
import { PAGE_ROOT, PAGE_SCALE, centreOnTray, deskSvg } from './landing-drawing.js';

const LIVE_URL = 'playthump.pages.dev';

/**
 * The video and the screenshots. Drop the files into public/site with these names and they show up; until a file is
 * there its slot shows a quiet empty state. Add a line here for another screenshot.
 */
const VIDEO = { src: './site/video.mp4', label: 'Thump being played on a Quest 3' };
const SHOTS: { src: string; alt: string }[] = [
  { src: './site/shot-1.jpg', alt: 'A screenshot of Thump from the headset' },
  { src: './site/shot-2.jpg', alt: 'A screenshot of Thump from the headset' },
  { src: './site/shot-3.jpg', alt: 'A screenshot of Thump from the headset' },
];

/** The six, in the page's order: the name and how you play it, in a line. */
const BAND: { id: InstId; label: string; line: string }[] = [
  { id: 'piano', label: 'Keyboard', line: 'Keys a little bigger than a piano’s, for fingertips in the air. They react to your fingertips, so you can rest your palm and nothing plays. You can slide a finger along them too.' },
  { id: 'drums', label: 'Drums', line: 'Slap them with a flat hand, or make a fist and you get a stick.' },
  { id: 'marimba', label: 'Marimba', line: 'Make fists and they turn into mallets.' },
  { id: 'congas', label: 'Congas', line: 'Palm in the middle for an open tone, fingers on the edge for a slap.' },
  { id: 'handpan', label: 'Handpan', line: 'A deep note in the middle and eight around it.' },
  { id: 'guitar', label: 'Guitar', line: 'It sits on your lap. Your left hand picks the chord on the neck, your right hand strums, and pinching gives you a pick.' },
];
const labelOf = (id: InstId) => BAND.find((b) => b.id === id)?.label ?? id;
const lineOf = (id: InstId) => BAND.find((b) => b.id === id)?.line ?? '';

/** What isn't obvious from a drawing, under it (most say nothing). */
const ABOUT: Partial<Record<InstId, string>> = {
  piano: 'A black key plays the notes either side of it. The pad on the left is a chord.',
  guitar: 'Pick a chord on the neck, then strum over the soundhole.',
  congas: 'Inside the dashed line is the open tone, outside it the slap.',
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const two = (n: number) => String(n).padStart(2, '0');
/** A song's length at full speed, from its score. */
const lengthOf = (t: (typeof TUNES)[number]) => {
  const s = Math.round(((scoreOf(t).end + 1) * 60) / t.bpm);
  return `${Math.floor(s / 60)}:${two(s % 60)}`;
};
/** "a", "a and b", "a, b and c" */
const andList = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** Where the page is open: the headset's browser (it can enter), a phone (it sends the link on), or a computer. */
type Where = 'xr' | 'phone' | 'desk';

/** An empty slot: a paste-up box with its name and one line. */
const emptySlot = (label: string, line: string, play = false) =>
  `<div class="empty">${play ? '<svg class="play-mark" viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r="28"/><path d="M22 17.5v21l17-10.5z"/></svg>' : ''}<div><span class="slot-name">${label}</span><p>${line}</p></div></div>`;
/** A title printed in two inks a little out of register (index.html, `.riso`): the pink copy is `data-t`. */
const riso = (text: string) => `data-t="${text.replace(/"/g, '&quot;')}"`;

export function mountLanding(world: World): void {
  // (the count comes from the songs themselves: when an original is added or taken out, the page follows)
  const originals = TUNES.filter((t) => t.original);
  const classics = TUNES.length - originals.length;
  const songs = [...originals, ...TUNES.filter((t) => !t.original)];
  const songRow = (t: (typeof TUNES)[number], i: number) =>
    `<li class="song${t.original ? ' orig' : ''}"><span class="n">${two(i + 1)}</span><span class="name">${esc(t.name)}</span><span class="lead" aria-hidden="true"></span><span class="len"><span class="vh">length </span>${lengthOf(t)}</span><span class="by">${esc(t.original ? t.style[0].toUpperCase() + t.style.slice(1) : t.by)}</span><span class="bpm nb">${t.bpm} bpm</span></li>`;
  const originalsLine =
    originals.length === 1 ? `<strong>${esc(originals[0].name)}</strong> is an original I wrote, the other ${classics} are classics you probably already know.`
    : `${originals.length} are originals I wrote (${esc(andList(originals.map((t) => t.name)))}), the other ${classics} are classics you probably already know.`;

  const el = document.createElement('div');
  el.id = 'landing';
  el.innerHTML = `
    <a class="skip" href="#main">Skip to the page</a>
    <header class="bar">
      <div class="wrap bar-in">
        <a class="brand" href="#top" aria-label="Thump, to the top">${ringMarkSvg({ simple: true })}<span aria-hidden="true">Thump</span></a>
        <nav class="nav" aria-label="On this page">
          <a href="#how">How to play</a><a href="#play">Instruments</a><a href="#songs">Songs</a><a href="#together">Play together</a>
        </nav>
        <button type="button" class="btn btn-2 btn-s" id="bar-enter">Enter</button>
      </div>
    </header>

    <main id="main" tabindex="-1">
      <section class="hero" id="top" aria-labelledby="hero-h">
        <div class="wrap hero-in">
          <div class="hero-top">
          <div class="inks" aria-hidden="true"><span class="ink ink-1"></span><span class="ink ink-2"></span><span class="ink ink-3"></span></div>
          <h1 id="hero-h"><span class="l riso" ${riso('A band')}>A band</span> <span class="l riso" ${riso('on your')}>on your</span> <span class="l riso" ${riso('desk.')}>desk.</span></h1>
          <p class="ticket" id="addr"><span class="t-main"><span class="t-top">On your Quest, open</span> <button type="button" class="addr-url" id="addr-url" title="Copy the link">${LIVE_URL}</button></span> <span class="t-stub">Quest 3</span></p>
          </div>
          <div class="hero-foot">
            <p class="tag">A VR music game you play with just your hands, no controllers, on your actual desk.</p>
            <div class="go">
              <div class="cta"><button id="enter-xr" class="btn btn-1" type="button">Enter</button></div>
              <p class="go-note" id="go-note" aria-live="polite"></p>
              <p class="xr-fail" role="alert" hidden>That didn’t start. Say yes to the Quest’s prompts, then try again.</p>
            </div>
          </div>
        </div>
        <div class="wrap">
          <div class="media">
            <figure class="slot slot-video" id="video-slot">
              <video class="fill" id="video" inert controls playsinline preload="metadata" aria-label="${esc(VIDEO.label)}"><source src="${VIDEO.src}#t=0.1" type="video/mp4" /></video>
              ${emptySlot('Video', 'The gameplay video goes here, I’m recording it on my Quest.', true)}
            </figure>
            ${SHOTS.map((s, i) => `<figure class="slot shot shot-${i + 1}"><img class="fill" src="${s.src}" alt="${esc(s.alt)}" loading="lazy" decoding="async" />${emptySlot(`Screenshot ${i + 1}`, 'Coming soon, from the headset.')}</figure>`).join('')}
          </div>
        </div>
      </section>

      <section class="how" id="how" aria-labelledby="how-h">
        <div class="wrap how-in">
          <h2 class="h2 riso" id="how-h" ${riso('How to play')}>How to play</h2>
          <div>
            <ol class="steps">
              ${['Open <strong>' + LIVE_URL + '</strong> in your Quest’s browser.', 'Sit down at your desk (a table works too).', 'Look down. The instruments are sitting on it.']
                .map((t, i) => `<li><span class="num riso" ${riso(String(i + 1))} aria-hidden="true">${i + 1}</span><span>${t}</span></li>`).join('')}
            </ol>
            <p class="how-note">Put the controllers away, it’s all hands. Make a fist on the drums and you get sticks, pinch on the guitar and you get a pick.</p>
          </div>
        </div>
      </section>

      <section class="play" id="play" aria-labelledby="play-h">
        <div class="wrap">
          <div class="play-head">
            <h2 class="h2 riso" id="play-h" ${riso('Six instruments')}>Six instruments</h2>
            <p class="lede">These are the same sounds as in the headset, so go on and hit something! Click or tap, or hold and drag across for a run.</p>
          </div>
          <ul class="lineup" role="group" aria-label="Instrument">
            ${BAND.map((b) => `<li><button type="button" class="pick" data-inst="${b.id}" aria-pressed="false"><span class="pick-name">${b.label}</span></button></li>`).join('')}
          </ul>
          <figure class="deck">
            <div class="stage"></div>
            <figcaption class="desk-foot"><div><p class="now-name"></p><p class="now-line"></p></div><p class="about" aria-live="polite"></p></figcaption>
          </figure>
        </div>
      </section>

      <section class="songs-sec" id="songs" aria-labelledby="songs-h">
        <div class="wrap songs-in">
          <div>
            <h2 class="h2 riso" id="songs-h" ${riso(`${TUNES.length} songs`)}>${TUNES.length} songs</h2>
            <p class="lede">${originalsLine} I took the songs and turned them into the parts you play, with a band playing along. More originals are on the way.</p>
          </div>
          <div>
            <ol class="songs">${songs.map(songRow).join('')}</ol>
            ${originals.length ? `<p class="key">${originals.length === 1 ? 'The one I wrote' : 'The ones I wrote'}</p>` : ''}
          </div>
        </div>
      </section>

      <section class="more" id="together" aria-label="Make a track and play together">
        <div class="wrap more-in">
          <div class="panel track">
            <h2 class="h2">Make your own track</h2>
            <p>Build a loop out of the instruments, play over it, and keep the one you like.</p>
          </div>
          <div class="panel together">
            <h2 class="h2 riso" id="together-h" ${riso('Play together')}>Play together</h2>
            <p class="lede">Play in a band with up to 3 friends! One of you starts a band and gets a <span class="nb">4-letter</span> code, the others type it in, and each of you plays a different instrument.</p>
            <div class="band-ctl">
              <div>
                <h3 class="h3">Start a band</h3>
                <p class="hint">You get a code to send your friends.</p>
                <button type="button" id="band-start" class="btn btn-2">Get a code</button>
              </div>
              <div>
                <h3 class="h3"><label for="band-code">Join a band</label></h3>
                <p class="hint">Type the code your friend sent.</p>
                <div class="join">
                  <input id="band-code" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD" />
                  <button type="button" id="band-join" class="btn btn-2">Join</button>
                </div>
              </div>
            </div>
            <p id="band-status" aria-live="polite"></p>
            <p class="band-phone">Open this page on your Quest to start or join a band.</p>
          </div>
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
              <label><input type="checkbox" data-k="band" /> Backing band (off is just you)</label>
              <label><input type="checkbox" data-k="placeFresh" /> Set up the desk fresh each time</label>
            </div>
            <p class="small-print">Timing <span id="offset-out"></span>. <button type="button" id="reset" class="link">Start over</button></p>
          </details>
        </div>
      </section>
    </main>

    <footer class="foot" aria-labelledby="who-h">
      <div class="wrap foot-in">
        <div>
          <h2 class="h2 riso" id="who-h" ${riso('Who made it')}>Who made it</h2>
          <p class="maker">Pretty much every VR music game needs controllers, so I made one you play with just your hands.</p>
        </div>
        <dl class="plate">
          <dt>Made by</dt><dd>OR-6, with my friends as testers</dd>
          <dt>Built with</dt><dd>IWSDK, WebXR, three.js, TypeScript, Web Audio and PeerJS</dd>
          <dt>Runs on</dt><dd>Meta Quest 3, in the browser</dd>
          <dt>Entered in</dt><dd>The Meta VR Start Developer Competition 2026 (Gaming)</dd>
          <dt>Sounds</dt><dd class="credit">Instrument samples from the Versilian Community Sample Library (CC0); the guitar is a Martin HD-28 recorded by Jeff Learman (Discord SFZ GM Bank, CC0). Particles by Kenney (CC0).</dd>
        </dl>
      </div>
      <div class="wrap"><p class="sign" aria-hidden="true">${ringMarkSvg({ simple: true })}<span class="riso" ${riso('Thump')}>Thump</span></p></div>
    </footer>`;
  document.body.appendChild(el);
  // (index.html paints the top of the page while the game loads; this replaces it)
  document.getElementById('landing-boot')?.remove();

  // the bar takes its rule once the page has scrolled
  const bar = el.querySelector<HTMLElement>('.bar')!;
  el.addEventListener('scroll', () => bar.classList.toggle('scrolled', el.scrollTop > 8), { passive: true });

  // ---- the slots: each fills itself when its file loads, and keeps its empty state when there's none ----
  const video = el.querySelector<HTMLVideoElement>('#video')!;
  const videoSlot = el.querySelector<HTMLElement>('#video-slot')!;
  let hasVideo = false;
  video.addEventListener('loadedmetadata', () => {
    hasVideo = video.videoWidth > 0;
    videoSlot.classList.toggle('filled', hasVideo);
    // (an empty slot's controls stay out of the way of the keyboard)
    video.inert = !hasVideo;
    label();
  });
  for (const img of el.querySelectorAll<HTMLImageElement>('.shot .fill')) {
    const fill = () => {
      if (!img.naturalWidth) return;
      img.closest('.slot')!.classList.add('filled');
      img.closest('.media')!.classList.add('has-shots');
    };
    if (img.complete) fill();
    else img.addEventListener('load', fill);
  }

  // ---- the one action: enter (in the headset), watch the video (a computer), send it to the Quest (a phone) ----
  const btn = el.querySelector<HTMLButtonElement>('#enter-xr')!;
  const barBtn = el.querySelector<HTMLButtonElement>('#bar-enter')!;
  const xrFail = el.querySelector<HTMLElement>('.xr-fail')!;
  const note = el.querySelector<HTMLElement>('#go-note')!;
  const addr = el.querySelector<HTMLElement>('#addr')!;
  const addrUrl = el.querySelector<HTMLButtonElement>('#addr-url')!;
  const xrApi = (navigator as Navigator & { xr?: { isSessionSupported(mode: string): Promise<boolean> } }).xr;
  const phone = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820;
  // (?where=desk|phone|xr shows the page as it is there: for reviews and screenshots)
  const forced = new URLSearchParams(location.search).get('where') as Where | null;
  let where: Where = forced ?? (world.xrEnabled && !!xrApi && !new URLSearchParams(location.search).has('jam') ? 'xr' : phone ? 'phone' : 'desk');
  function label() {
    btn.textContent = where === 'xr' ? 'Enter' : where === 'phone' ? 'Send link' : hasVideo ? 'Watch' : 'Try it';
    barBtn.textContent = btn.textContent;
    el.dataset.where = where;
    addr.hidden = where === 'xr';
    note.textContent = where === 'xr' ? 'Sit at your desk, put the controllers down and look down.' : 'It’s free and there’s nothing to install.';
  }
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
  /** The video, from the start with its sound; or, while there's no video yet, the drawing to try. */
  const watch = () => {
    if (!hasVideo) return el.querySelector('#play')!.scrollIntoView({ behavior: smooth(), block: 'start' });
    videoSlot.scrollIntoView({ behavior: smooth(), block: 'center' });
    video.currentTime = 0;
    void video.play().catch(() => {});
  };
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
    if (where !== 'desk') el.scrollTo({ top: 0, behavior: smooth() });
    btn.click();
  });
  // (the video stops when it's scrolled away)
  new IntersectionObserver(([e]) => {
    if (!e.isIntersecting && !video.paused) video.pause();
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
      st.state === 'hosting' ? (st.code ? `Your code: ${st.code}. Friends type it in here, then everyone opens this page on their Quest and presses Enter.` : (st.message ?? 'Connecting…'))
      : st.state === 'joining' ? 'Connecting…'
      : st.state === 'connected' ? `${n} in the band${st.role === 'host' && st.code ? ` (code ${st.code})` : ''}. Now open this page on your Quest and press Enter.`
      : st.state === 'error' || st.state === 'closed' ? (st.message ?? 'That didn’t work, try again.')
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
      bandStatus.textContent = 'The code is 4 letters, from your friend’s page.';
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
    b.textContent = 'Done. Your progress is cleared, your name and settings stay.';
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
  const nowLine = el.querySelector<HTMLElement>('.now-line')!;
  const nowName = el.querySelector<HTMLElement>('.now-name')!;
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
    else if (id[0] === 'w') audio.modal('keys', pianoMidi.get(n) ?? 60, 0.8, panOf((n - 7) * KEYBOARD.pitch), 0, 0.5, 'page');
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
    nowName.textContent = labelOf(id);
    nowLine.textContent = lineOf(id);
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
