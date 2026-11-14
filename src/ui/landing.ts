/**
 * The 2D page shown outside the headset: Thump's site, built from the icon (docs/SITE-DESIGN.md). The hero with the
 * button that starts mixed reality (off a Quest it copies the link), the band as a list you choose from, a drawing of
 * the desk that plays the headset's own sounds, the setlist from the game's own data, scoring, playing together
 * (start a band or type a friend's code), three steps to start, the specs and the settings.
 */
import { VisibilityState, type World } from '@iwsdk/core';
import { audio, type Voice } from '../audio/engine.js';
import { loadSettings, saveSettings, type Settings } from '../persistence/settings.js';
import { loadProgress, saveProgress, freshProgress } from '../persistence/progress.js';
import { coop, normaliseCode, type CoopStatus } from '../net/coop.js';
import { asPlayer } from '../net/band.js';
import { PADS } from '../config.js';
import { CONGA, SHELF, handpanZones, marimbaZones, percVoice, pianoBlacks, pianoZones, strumNotes, type InstId } from '../kit/shelf.js';
import { LESSONS, TUNES } from '../songs/tunes.js';
import { ringMarkSvg, wordmarkSvg } from './brand.js';
import { PAGE_ROOT, PAGE_SCALE, VIEW, centreOnTray, deskSvg, viewFor } from './landing-drawing.js';

const LIVE_URL = 'or-6.github.io/thump';
const REPO_URL = 'https://github.com/OR-6/thump';

/** The band, in the page's order: what it's called here, how you play it, and its capture from the game. */
const BAND: { id: InstId; label: string; what: string; line: string; alt: string }[] = [
  { id: 'drums', what: 'Seven pieces', label: 'Drums', line: 'Hit the heads in the air over the desk with your palms. Pinch, and there’s a stick in your hand.', alt: 'The drums mid-song: rings closing onto the snare and the kick, Perfect on both heads, the score panel behind.' },
  { id: 'piano', what: 'Piano', label: 'Keys', line: 'A piano keyboard with real-size keys. Press them with your fingertips; the square on the left plays a chord.', alt: 'The keyboard in Für Elise: a note landing on a key, the Spotlight meter filling over the score.' },
  { id: 'marimba', what: 'Eight bars', label: 'Marimba', line: 'Make a fist and there’s a mallet in it. The long rosewood bars on the left are the low ones.', alt: 'The marimba in Canon in D, one bar lit gold as it is hit.' },
  { id: 'congas', what: 'A pair', label: 'Congas', line: 'Palm in the middle of a head for an open tone, fingers on the edge for a slap.', alt: 'Two congas in Can-can, a ring closing onto the right-hand drum.' },
  { id: 'handpan', what: 'Nine notes', label: 'Handpan', line: 'Fingertips on the notes. The deep one is in the middle; go round the rim and you walk up the scale.', alt: 'The handpan in Amazing Grace, the score panel behind it.' },
  { id: 'guitar', what: 'Acoustic', label: 'Guitar', line: 'Hold it across your lap. Every string sounds as your fingertip crosses it.', alt: 'The acoustic guitar held at the edge of the desk, chord names on the neck, the score panel behind.' },
];
const labelOf = (id: InstId) => BAND.find((b) => b.id === id)?.label ?? id;

/** What the drawing of each instrument does, under it. */
const ABOUT: Record<InstId, string> = {
  drums: 'The whole kit from above: hi-hat, snare, rack tom, floor tom, the kick lying flat, crash and ride.',
  piano: 'Two octaves of real-size piano keys. A black key plays the two notes either side of it; the red button plays a chord.',
  marimba: 'Eight bars, long and low on the left.',
  guitar: 'In the headset you hold it. Here, pick a chord on the neck, then tap the strings.',
  congas: 'The low drum on the left. The middle of a head is an open tone, the edge a slap.',
  handpan: 'A low note in the middle and eight around it.',
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const two = (n: number) => String(n).padStart(2, '0');
const kicker = (id: string, text: string, tag = 'h2') => `<${tag} class="kicker" id="${id}">${ringMarkSvg({ simple: true })}<span>${text}</span></${tag}>`;
/** One huge broken ring, cropped off an edge of its section: texture. */
const arc = (cls: string) => `<svg class="bg-arc ${cls}" viewBox="-500 -500 1000 1000" aria-hidden="true" focusable="false"><circle r="480" fill="none" stroke-dasharray="1300 260 700 760"/></svg>`;

export function mountLanding(world: World): void {
  const classics = TUNES.filter((t) => !t.original);
  const originals = TUNES.filter((t) => t.original);
  let n = 0;
  const songRow = (t: (typeof TUNES)[number]) =>
    `<li class="song"><span class="no" aria-hidden="true"><span>${two(++n)}</span>${ringMarkSvg({ simple: true })}</span><span class="name">${esc(t.name)}</span><span class="by">${esc(t.original ? 'Original' : t.by)}</span><span class="bpm">${t.bpm} bpm</span><span class="lv"><i class="e">Easy</i><i class="n">Normal</i><i class="h">Hard</i></span></li>`;

  const el = document.createElement('div');
  el.id = 'landing';
  el.innerHTML = `
    <a class="skip" href="#main">Skip to the page</a>
    <header class="bar">
      <div class="wrap bar-in">
        <a class="brand" href="#top" aria-label="Thump, to the top">${ringMarkSvg({ simple: true })}${wordmarkSvg('currentColor', '')}</a>
        <nav class="nav" aria-label="On this page">
          <a href="#band">Instruments</a><a href="#setlist">Setlist</a><a href="#together">Play together</a><a href="#start">Start</a>
        </nav>
        <button type="button" class="btn btn-1 btn-s" id="bar-enter">Enter</button>
      </div>
    </header>

    <main id="main" tabindex="-1">
      <section class="hero" id="top" aria-labelledby="hero-h">
        <div class="hero-top">
        ${ringMarkSvg({ className: 'hero-mark' })}
        <div class="wrap hero-in">
          <div class="hero-word">${wordmarkSvg('currentColor', 'Thump')}</div>
          <h1 id="hero-h">A band on <span class="nb">your desk.</span></h1>
          <p class="lede">Drums, keys, guitar and more, on the table in front of you, played with your bare hands. Mixed reality on Meta Quest, straight from the browser.</p>
          <div class="cta">
            <button id="enter-xr" class="btn btn-1" type="button">Enter mixed reality</button>
            <a class="btn btn-2" href="#hear">Hear it first <span aria-hidden="true">↓</span></a>
          </div>
          <p class="go-note" id="go-note" aria-live="polite">On Quest, open this page in the browser. On a laptop, the button copies the link.</p>
          <p class="xr-fail" role="alert" hidden>It didn’t start. Say yes to the Quest’s prompts and try again.</p>
        </div>
        </div>
        <div class="wrap">
          <div class="strip">
            <figure class="cap" style="--ar:1.333"><img src="./site/drums.webp" width="720" height="540" fetchpriority="high" alt="The drum kit on the desk mid-song, Perfect on the snare and the kick." /><figcaption>The kit</figcaption></figure>
            <figure class="cap" style="--ar:1.778"><img src="./site/held.webp" width="640" height="360" alt="The acoustic guitar held across the lap, chord names on the neck, Perfect on the strings." /><figcaption>The guitar, held</figcaption></figure>
            <figure class="cap" style="--ar:1.778"><img src="./site/hud-live.webp" width="640" height="360" alt="The score panel during Canon in D: a 76-note streak at times four and Hands up for the Spotlight." /><figcaption>The panel, mid-song</figcaption></figure>
          </div>
        </div>
      </section>

      <section class="sec band" id="band" aria-labelledby="band-h">
        ${arc('arc-band')}
        <div class="wrap band-in">
          <div class="band-list">
            ${kicker('band-h', 'The band')}
            <ul class="inst-list">
              ${BAND.map((b) => `<li><button type="button" class="member" data-band="${b.id}" aria-pressed="false" aria-controls="band-shot">${ringMarkSvg({ simple: true })}<span>${b.label}</span><small>${b.what}</small></button></li>`).join('')}
            </ul>
          </div>
          <figure class="band-shot" id="band-shot">
            <img src="./site/drums.webp" width="720" height="540" loading="lazy" alt="" />
            <figcaption><span class="cap-src">In the WebXR emulator</span><span class="how" aria-live="polite"></span>
              <button type="button" class="link" id="band-hear">Play it on the desk below</button></figcaption>
          </figure>
        </div>
      </section>

      <section class="sec hear" id="hear" aria-labelledby="hear-h">
        <div class="wrap hear-in">
          <div class="hear-words">
            ${kicker('hear-h', 'Hear them now')}
            <p>The headset’s own sounds. Pick one, then tap or click the drawing; hold the mouse down and drag for a run.</p>
            <div class="picker" role="group" aria-label="Instrument on the desk">
              ${BAND.map((b) => `<button type="button" class="pick" data-inst="${b.id}" aria-pressed="false">${b.label}</button>`).join('')}
            </div>
          </div>
          <figure class="desk">
            <div class="frame"><div class="stage"></div></div>
            <div class="desk-foot" aria-hidden="true">
              <span>Your side of the desk</span>
              <span class="scale"><span class="scale-bar" style="width:${((10 / VIEW.w) * 100).toFixed(2)}%"></span>10 cm</span>
            </div>
            <figcaption class="about" aria-live="polite"></figcaption>
          </figure>
        </div>
      </section>

      <section class="sec setlist" id="setlist" aria-labelledby="setlist-h">
        ${arc('arc-set')}
        <div class="wrap">
          ${kicker('setlist-k', 'Setlist', 'p')}
          <h2 class="title" id="setlist-h"><span>${TUNES.length} songs.</span> <span>3 ways to play each.</span></h2>
          <h3 class="group">Classics <span>${classics.length}</span></h3>
          <ol class="songs">${classics.map(songRow).join('')}</ol>
          <h3 class="group">Originals <span>${originals.length}</span></h3>
          <ol class="songs" start="${classics.length + 1}">${originals.map(songRow).join('')}</ol>
          <p class="lessons"><strong>And a lesson for every instrument.</strong> A slow tune that teaches it one move at a time: ${LESSONS.map((l) => esc(l.name.replace(/^Learn /, ''))).join(', ').replace(/, ([^,]+)$/, ' and $1')}.</p>
        </div>
      </section>

      <section class="sec score" id="score" aria-labelledby="score-h">
        <div class="wrap">
          ${kicker('score-k', 'Scoring', 'p')}
          <h2 class="title" id="score-h">Go for the S</h2>
        </div>
        <div class="wrap score-in">
          <div class="score-words">
            <ol class="rules">
              <li><strong>Streak</strong> Ten notes in a row doubles your points, up to ×4.</li>
              <li><strong>Spotlight</strong> Play the gold bars clean, then raise both hands for ×2.</li>
              <li><strong>Your ghost</strong> Your best run, raced bar by bar.</li>
              <li><strong>Full combo</strong> Every note, no misses.</li>
            </ol>
            <figure class="shot shot-b"><img src="./site/results.webp" width="620" height="465" loading="lazy" alt="The results for Ode to Joy on Normal: grade S with three stars, 95,100 points, 252 perfect and no misses, All perfect." /><figcaption>The results: an S, every note perfect</figcaption></figure>
          </div>
          <div class="shots">
            <figure class="shot shot-a"><img src="./site/hud.webp" width="620" height="465" loading="lazy" alt="The panel during Ode to Joy: a 110-note streak at times four, 100 percent accuracy, 60 points behind your best run, and Hands up for the Spotlight." /><figcaption>Mid-song: the streak, your ghost, the Spotlight</figcaption></figure>
            
          </div>
        </div>
      </section>

      <section class="sec together" id="together" aria-labelledby="together-h">
        <div class="wrap together-in">
          <div class="together-words">
            ${kicker('together-h', 'Play together')}
            <p class="big">Up to four of you, one song, one beat. Or just jam.</p>
            <p>One of you starts a band and gets a four-letter code. The others type it here and join, then everyone enters mixed reality, wherever they are.</p>
            <div class="band-ctl">
              <button type="button" id="band-start" class="btn btn-2">Start a band</button>
              <span class="or">or</span>
              <span class="join">
                <input id="band-code" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="CODE" aria-label="A friend’s 4-letter code" />
                <button type="button" id="band-join" class="btn btn-2">Join</button>
              </span>
            </div>
            <p id="band-status" aria-live="polite"></p>
          </div>
          <svg class="seats" viewBox="0 0 400 420" role="img" aria-label="Four seats round the desk, one taken: yours">
            <rect class="desk-top" x="110" y="130" width="180" height="140"/>
            <g class="seat seat-1 on" transform="translate(200 330)"><circle r="46"/><g transform="scale(0.1)">${ringMarkSvg({ className: 'seat-mark' }).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g></g>
            <g class="seat seat-2" transform="translate(200 70)"><circle r="46"/></g>
            <g class="seat seat-3" transform="translate(50 200)"><circle r="46"/></g>
            <g class="seat seat-4" transform="translate(350 200)"><circle r="46"/></g>
            <text x="200" y="414" text-anchor="middle">You</text>
          </svg>
        </div>
      </section>

      <section class="sec start" id="start" aria-labelledby="start-h">
        <div class="wrap">
          ${kicker('start-h', 'How to start')}
          <ol class="steps">
            ${[
              ['Open the link on your Quest', `In the Quest browser, go to <strong>${LIVE_URL}</strong> and press Enter mixed reality. Nothing to install.`, -30],
              ['Sit at a desk, put the controllers down', 'It’s hands only. A tray table on a train or a plane works too.', 120],
              ['Tap the desk and play', 'The drums come up under your hands. Poke the panel at the back of the desk for a song or another instrument.', 230],
            ]
              .map(
                ([h, p, rot], i) => `<li><span class="num" aria-hidden="true"><svg viewBox="-60 -60 120 120"><circle r="52" transform="rotate(${rot})"/></svg><span>${i + 1}</span></span><div><h3>${h}</h3><p>${p}</p></div></li>`,
              )
              .join('')}
          </ol>
        </div>
      </section>

      <section class="sec specs" id="specs" aria-labelledby="specs-h">
        <div class="wrap specs-in">
          <div>
            ${kicker('specs-h', 'Specs')}
            <dl class="spec">
              <div><dt>Headset</dt><dd>Meta Quest 3, Quest browser (WebXR)</dd></div>
              <div><dt>Where</dt><dd>Seated at a desk or tray table, passthrough</dd></div>
              <div><dt>Input</dt><dd>Hand tracking, hands only</dd></div>
              <div><dt>Players</dt><dd>1–4 online with a code</dd></div>
              <div><dt>Songs</dt><dd>${TUNES.length} (${classics.length} classics, ${originals.length} originals) on Easy, Normal and Hard, plus ${LESSONS.length} lessons</dd></div>
              <div><dt>Price</dt><dd>Free, nothing to install</dd></div>
              <div><dt>Status</dt><dd>Built and checked in the WebXR emulator; Quest 3 testing next</dd></div>
            </dl>
          </div>
          <details class="prep">
            <summary>Settings</summary>
            <p class="small-print">Change these in the Quest’s browser before you enter. They’re saved there.</p>
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
        <div class="foot-brand">${wordmarkSvg('currentColor', 'Thump')}<p>An entry in the Meta VR Start Developer Competition 2026 (Gaming).</p></div>
        <div class="foot-text">
          <p>Instrument samples from the Versilian Community Sample Library (CC0). Interface sounds and particles by Kenney (CC0).</p>
          <p><a href="${REPO_URL}/blob/main/LICENSE">MIT licence</a> <a href="${REPO_URL}">GitHub</a></p>
        </div>
      </div>
    </footer>`;
  document.body.appendChild(el);
  // (index.html paints the top of the page while the game loads; this replaces it)
  document.getElementById('landing-boot')?.remove();

  // the bar gets its rule once the page has scrolled
  const bar = el.querySelector<HTMLElement>('.bar')!;
  el.addEventListener('scroll', () => bar.classList.toggle('scrolled', el.scrollTop > 8), { passive: true });

  // Enter mixed reality: on a Quest it starts; a browser that can't enter copies the link instead
  const btn = el.querySelector<HTMLButtonElement>('#enter-xr')!;
  const xrFail = el.querySelector<HTMLElement>('.xr-fail')!;
  const note = el.querySelector<HTMLElement>('#go-note')!;
  const xrApi = (navigator as Navigator & { xr?: { isSessionSupported(mode: string): Promise<boolean> } }).xr;
  let canEnter = world.xrEnabled && !!xrApi && !new URLSearchParams(location.search).has('jam');
  if (canEnter) void xrApi!.isSessionSupported('immersive-ar').then((ok) => (canEnter = ok), () => (canEnter = false));
  const copyLink = () => {
    const url = location.origin + location.pathname;
    const say = (copied: boolean) => (note.textContent = `${copied ? 'Link copied. ' : ''}Open ${LIVE_URL} in the Quest browser.`);
    if (!navigator.clipboard) return say(false);
    void navigator.clipboard.writeText(url).then(() => say(true), () => say(false));
  };
  btn.addEventListener('click', () => {
    if (!canEnter) return copyLink();
    audio.resume(); // a user gesture: unlock audio now
    xrFail.hidden = true;
    world.launchXR();
    const w = world as unknown as { session?: unknown; sessionRequestPending?: boolean };
    const t0 = performance.now();
    const watch = window.setInterval(() => {
      if (w.session) return window.clearInterval(watch);
      if (!w.sessionRequestPending && performance.now() - t0 > 600) {
        window.clearInterval(watch);
        xrFail.hidden = false;
      }
    }, 250);
  });
  el.querySelector<HTMLButtonElement>('#bar-enter')!.addEventListener('click', () => {
    btn.click();
    if (!canEnter) {
      el.scrollTo({ top: 0, behavior: smooth() });
      btn.focus({ preventScroll: true });
    }
  });

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

  const desk = mountDesk(el);

  // the band: choosing a name (click, hover or focus) swaps the capture and says how it's played
  const shot = el.querySelector<HTMLImageElement>('.band-shot img')!;
  const how = el.querySelector<HTMLElement>('.band-shot .how')!;
  const hearBtn = el.querySelector<HTMLButtonElement>('#band-hear')!;
  const instBtns = [...el.querySelectorAll<HTMLButtonElement>('.member')];
  let chosen: InstId = 'drums';
  const choose = (id: InstId) => {
    const b = BAND.find((x) => x.id === id)!;
    chosen = id;
    shot.src = `./site/${id}.webp`;
    shot.alt = b.alt;
    how.textContent = b.line;
    hearBtn.textContent = `Play the ${b.label.toLowerCase()} on the desk below`;
    for (const x of instBtns) x.setAttribute('aria-pressed', String(x.dataset.band === id));
  };
  for (const b of instBtns) {
    const id = b.dataset.band as InstId;
    b.addEventListener('click', () => choose(id));
    b.addEventListener('focus', () => choose(id));
    b.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && choose(id));
  }
  choose('drums');
  hearBtn.addEventListener('click', () => {
    desk.pick(chosen);
    el.querySelector('#hear')!.scrollIntoView({ behavior: smooth(), block: 'start' });
    el.querySelector<HTMLButtonElement>(`.pick[data-inst="${chosen}"]`)?.focus({ preventScroll: true });
  });

  // playing together: start a band (a code for friends) or join one, then everyone enters
  const bandStart = el.querySelector<HTMLButtonElement>('#band-start')!;
  const bandJoin = el.querySelector<HTMLButtonElement>('#band-join')!;
  const bandCode = el.querySelector<HTMLInputElement>('#band-code')!;
  const bandStatus = el.querySelector<HTMLElement>('#band-status')!;
  const seats = el.querySelector<SVGSVGElement>('.seats')!;
  const fillSeats = (n: number) => {
    seats.querySelectorAll('.seat').forEach((s, i) => s.classList.toggle('on', i < n));
    seats.setAttribute('aria-label', n <= 1 ? 'Four seats round the desk, one taken: yours' : `Four seats round the desk, ${n} taken`);
  };
  const showBand = (st: CoopStatus) => {
    if (st.role === 'caller') return;
    const n = st.players ?? 1;
    bandStatus.textContent =
      st.state === 'hosting' ? (st.code ? `Your code: ${st.code}. Friends type it here, then everyone enters.` : (st.message ?? 'Connecting…'))
      : st.state === 'joining' ? 'Connecting…'
      : st.state === 'connected' ? `${n} in the band${st.role === 'host' && st.code ? ` (code ${st.code})` : ''}. Enter mixed reality.`
      : st.state === 'error' || st.state === 'closed' ? (st.message ?? 'That didn’t work')
      : '';
    fillSeats(st.state === 'connected' ? n : 1);
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
    saveProgress({ ...freshProgress(), kit: p.kit });
    window.dispatchEvent(new Event('thump:reset'));
    b.textContent = 'Done. Progress cleared.';
    b.dataset.sure = '';
  });

  // the page hides while in the headset
  world.visibilityState.subscribe((v) => {
    el.hidden = v !== VisibilityState.NonImmersive;
  });
}

/** Smooth scrolling, unless the reader asked for less movement. */
const smooth = (): ScrollBehavior => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

/** The drawing of the desk: pick an instrument, tap its parts, hear the headset's sounds. */
function mountDesk(el: HTMLElement): { pick(id: InstId): void } {
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
    notes.forEach((n, i) => audio.pluck(n, 0.75 - i * 0.04, pan, t + i * 0.012, 'nylon'));
  };
  const panOf = (xm: number) => Math.max(-0.8, Math.min(0.8, xm / 0.4));

  /** Play a part by its id. */
  const play = (id: string): void => {
    const n = Number(id.slice(1));
    if (id === 'kick' || id === 'snare' || id === 'hat') audio.drum(id as Voice, 0.85, panOf(PADS[id].x));
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
      stage.querySelectorAll('.part[data-part^="g"]').forEach((p) => p.classList.toggle('on', p.getAttribute('data-part') === id));
      strum(-0.4);
    } else if (id === 'strum') strum(0.3);
  };

  /** The one flourish: a hot broken ring goes out from the point that was hit. */
  const ring = (x: number, y: number) => {
    const r = stage.getBoundingClientRect();
    const span = document.createElement('span');
    span.className = 'hit-ring';
    span.style.left = `${x - r.left}px`;
    span.style.top = `${y - r.top}px`;
    span.innerHTML = '<svg viewBox="-50 -50 100 100" aria-hidden="true"><circle r="44" transform="rotate(-30)"/></svg>';
    span.addEventListener('animationend', () => span.remove());
    stage.appendChild(span);
    window.setTimeout(() => span.remove(), 1000);
  };

  const hit = (p: Element, at?: { x: number; y: number }) => {
    const id = p.getAttribute('data-part') ?? '';
    asPlayer(() => {
      audio.resume();
      play(id);
    });
    // (off, then on next frame: a second hit restarts the light)
    p.classList.remove('lit');
    requestAnimationFrame(() => p.classList.add('lit'));
    const b = p.getBoundingClientRect();
    ring(at?.x ?? b.left + b.width / 2, at?.y ?? b.top + b.height / 2);
  };

  const show = (id: InstId, animate: boolean) => {
    inst = id;
    const d = SHELF.find((x) => x.id === id)!;
    stage.querySelectorAll('svg.desk-svg').forEach((s) => s.remove());
    stage.insertAdjacentHTML('afterbegin', deskSvg(id, labelOf(id)));
    centreOnTray(stage.querySelector('svg.desk-svg')!);
    // (the scale bar follows: the drums are drawn on a desk, the rest on a tray)
    const bar = el.querySelector<HTMLElement>('.scale-bar');
    if (bar) bar.style.width = `${((10 / viewFor(id).w) * 100).toFixed(2)}%`;
    about.textContent = `${d.name}. ${ABOUT[id]}`;
    for (const b of picks) b.setAttribute('aria-pressed', String(b.dataset.inst === id));
    if (id === 'guitar') stage.querySelector(`.part[data-part="g${chord}"]`)?.classList.add('on');
    if (animate) {
      stage.classList.remove('unfold');
      requestAnimationFrame(() => stage.classList.add('unfold'));
    }
  };

  for (const b of picks) b.addEventListener('click', () => {
    if (b.dataset.inst !== inst) show(b.dataset.inst as InstId, true);
  });

  // a press plays at once; with a mouse held down, sliding over the parts plays them too (a glissando)
  let held = false;
  stage.addEventListener('pointerdown', (e) => {
    const p = (e.target as Element).closest('.part');
    if (!p) return;
    held = e.pointerType === 'mouse';
    hit(p, e.clientX || e.clientY ? { x: e.clientX, y: e.clientY } : undefined);
  });
  stage.addEventListener('pointerover', (e) => {
    if (!held) return;
    const p = (e.target as Element).closest('.part');
    if (p && !p.contains(e.relatedTarget as Node | null)) hit(p, { x: e.clientX, y: e.clientY });
  });
  window.addEventListener('pointerup', () => (held = false));
  stage.addEventListener('keydown', (e) => {
    const p = (e.target as Element).closest('.part');
    if (!p || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    hit(p);
  });
  stage.addEventListener('animationend', (e) => (e.target as Element).closest('.part')?.classList.remove('lit'));

  show(inst, false);
  return { pick: (id) => id !== inst && show(id, true) };
}
