/**
 * The 2D page shown outside the headset: Thump's site (docs/SITE-DESIGN.md). The hero (the kit at the moment of a
 * Perfect, the hit's rings spreading from the drum, and the button that starts mixed reality; off a Quest it copies
 * the link), the band (one list of the six that drives a capture and a drawing of the desk that plays the headset's
 * own sounds), the setlist from the game's own data, scoring, playing together (start a band or type a friend's
 * code), three steps to start, the specs and the settings.
 */
import { VisibilityState, type World } from '@iwsdk/core';
import { audio, type Voice } from '../audio/engine.js';
import { loadSettings, saveSettings, type Settings } from '../persistence/settings.js';
import { loadProgress, saveProgress, freshProgress } from '../persistence/progress.js';
import { coop, normaliseCode, type CoopStatus } from '../net/coop.js';
import { asPlayer } from '../net/band.js';
import { PADS } from '../config.js';
import { CONGA, handpanZones, marimbaZones, percVoice, pianoBlacks, pianoZones, strumNotes, type InstId } from '../kit/shelf.js';
import { LESSONS, TUNES } from '../songs/tunes.js';
import { scoreOf } from '../songs/score.js';
import { ringMarkSvg, wordmarkSvg } from './brand.js';
import { PAGE_ROOT, PAGE_SCALE, VIEW, centreOnTray, deskSvg, viewFor } from './landing-drawing.js';

const LIVE_URL = 'or-6.github.io/thump';
const REPO_URL = 'https://github.com/OR-6/thump';

/** The band, in the page's order: its name, a few words on it, how you play it, and its capture from the game. */
const BAND: { id: InstId; label: string; what: string; line: string; alt: string }[] = [
  { id: 'drums', label: 'Drums', what: 'Seven pieces', line: 'Hit the heads in the air over the desk with your palms. Pinch, and there’s a stick in your hand.', alt: 'The drum kit on the desk from the player’s seat, rings closing onto the heads.' },
  { id: 'piano', label: 'Piano', what: 'Real-size keys', line: 'A piano keyboard with real-size keys. Press them with your fingertips; the square on the left plays a chord.', alt: 'The piano keyboard on the desk mid-song, a note landing on a key.' },
  { id: 'marimba', label: 'Marimba', what: 'Eight bars', line: 'Make a fist and there’s a mallet in it. The long rosewood bars on the left are the low ones.', alt: 'The rosewood marimba on the desk mid-song, a bar lit as it is hit.' },
  { id: 'congas', label: 'Congas', what: 'A pair', line: 'Palm in the middle of a head for an open tone, fingers on the edge for a slap.', alt: 'Two congas on the desk mid-song, a ring closing onto one head.' },
  { id: 'handpan', label: 'Handpan', what: 'Nine notes', line: 'Fingertips on the notes. The deep one is in the middle; go round the rim and you walk up the scale.', alt: 'The handpan on the desk mid-song, a note lit as it is played.' },
  { id: 'guitar', label: 'Guitar', what: 'On your lap', line: 'Hold it across your lap. Every string sounds as your fingertip crosses it.', alt: 'The acoustic guitar held across the lap, chord names on the neck.' },
];
const labelOf = (id: InstId) => BAND.find((b) => b.id === id)?.label ?? id;

/** What the drawing of each instrument does, under it. */
const ABOUT: Record<InstId, string> = {
  drums: 'The whole kit from above: hi-hat, snare, rack tom, floor tom, the kick lying flat, crash and ride.',
  piano: 'Two octaves of real-size piano keys. A black key plays the two notes either side of it; the round button plays a chord.',
  marimba: 'Eight bars, long and low on the left.',
  guitar: 'In the headset you hold it. Here, pick a chord on the neck, then tap the strings.',
  congas: 'The low drum on the left. Inside the dashed line is an open tone, outside it a slap.',
  handpan: 'A low note in the middle and eight around it.',
};

/** The hero capture, and where in it the struck drum sits (its rings spread from there). */
const HERO = { src: './site/hero.webp', w: 716, h: 290, fx: 0.63, fy: 0.52, alt: 'The drum kit on the desk mid-song, seen from the player’s seat: Perfect on the bass drum, its rim lit red and gold.' };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const two = (n: number) => String(n).padStart(2, '0');
/** A song's length at full speed, from its score: its passes and solos to the last note. */
const lengthOf = (t: (typeof TUNES)[number]) => {
  const s = Math.round(((scoreOf(t).end + 1) * 60) / t.bpm);
  return `${Math.floor(s / 60)}:${two(s % 60)}`;
};

/** The hit's rings, as on the icon (each broken and turned its own way), round the struck drum; one more goes out now and then. */
const heroRings = () => `<svg class="rings" viewBox="-100 -100 200 200" aria-hidden="true" focusable="false">
  <g class="ring ring-1"><circle r="44" stroke-width="5.5" pathLength="100" stroke-dasharray="78 22" transform="rotate(-20)"/></g>
  <g class="ring ring-2"><circle r="68" stroke-width="3.4" pathLength="100" stroke-dasharray="31 9 15 18" transform="rotate(40)"/></g>
  <g class="ring ring-3"><circle r="94" stroke-width="1.9" pathLength="100" stroke-dasharray="12 9 20 21" transform="rotate(10)"/></g>
  <circle class="pulse" r="94"/></svg>`;

export function mountLanding(world: World): void {
  const classics = TUNES.filter((t) => !t.original);
  const originals = TUNES.filter((t) => t.original);
  let n = 0;
  const songRow = (t: (typeof TUNES)[number]) =>
    `<li class="song"><span class="no" aria-hidden="true">${two(++n)}</span><span class="name">${esc(t.name)}</span><span class="by">${esc(t.original ? 'Original' : t.by)}</span><span class="bpm">${t.bpm} bpm</span><span class="len"><span class="vh">Length </span>${lengthOf(t)}</span></li>`;

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
        <div class="wrap hero-in">
          <h1 id="hero-h">${wordmarkSvg('currentColor', 'Thump')}</h1>
          <p class="tag">A band on your desk.</p>
          <p class="lede">Drums, keys, guitar and more, on the table in front of you, played with your bare hands. Mixed reality on Meta Quest, straight from the browser.</p>
          <div class="cta">
            <button id="enter-xr" class="btn btn-1" type="button">Enter mixed reality</button>
            <a class="btn btn-2" href="#band">Hear it first <span aria-hidden="true">↓</span></a>
          </div>
          <p class="go-note" id="go-note" aria-live="polite"></p>
          <p class="xr-fail" role="alert" hidden>It didn’t start. Say yes to the Quest’s prompts and try again.</p>
        </div>
        <figure class="hero-art" style="--fx:${HERO.fx * 100}%;--fy:${HERO.fy * 100}%">
          <img class="feather" src="${HERO.src}" width="${HERO.w}" height="${HERO.h}" fetchpriority="high" alt="${esc(HERO.alt)}" />
          ${heroRings()}
        </figure>
      </section>

      <section class="sec band" id="band" aria-labelledby="band-h">
        <div class="wrap">
          <div class="band-head">
            <h2 class="title" id="band-h">The band</h2>
            <p>Six instruments, and these are the headset’s own sounds. Pick one, then tap or click its drawing; hold the mouse down and drag for a run.</p>
          </div>
          <div class="band-in">
            <ul class="picker" role="group" aria-label="Instrument">
              ${BAND.map((b) => `<li><button type="button" class="pick" data-inst="${b.id}" aria-pressed="false"><span>${b.label}</span><small>${b.what}</small></button></li>`).join('')}
            </ul>
            <div class="band-main">
              <figure class="desk">
                <div class="frame"><div class="stage"></div></div>
                <div class="desk-foot" aria-hidden="true">
                  <span>Your side of the desk, from above</span>
                  <span class="scale"><span class="scale-bar" style="width:${((10 / VIEW.w) * 100).toFixed(2)}%"></span>10 cm</span>
                </div>
                <figcaption class="about" aria-live="polite"></figcaption>
              </figure>
              <figure class="band-shot">
                <img class="feather" src="./site/drums.webp" width="620" height="296" loading="lazy" alt="" />
                <figcaption><span class="label">In the headset</span><span class="how" aria-live="polite"></span></figcaption>
              </figure>
            </div>
          </div>
        </div>
      </section>

      <section class="setlist" id="setlist" aria-labelledby="setlist-h">
        <div class="wrap">
          <span class="label">Setlist</span>
          <div class="set-head">
            <h2 class="title" id="setlist-h">${TUNES.length} songs</h2>
            <p class="set-note">Every one on Easy, Normal and Hard. Lengths are at full speed.</p>
          </div>
          <h3 class="group">Classics <span>${classics.length}</span></h3>
          <ol class="songs">${classics.map(songRow).join('')}</ol>
          <h3 class="group">Originals <span>${originals.length}</span></h3>
          <ol class="songs" start="${classics.length + 1}">${originals.map(songRow).join('')}</ol>
          <p class="lessons"><strong>And a lesson for every instrument</strong> (${LESSONS.map((l) => esc(l.name.replace(/^Learn /, ''))).join(', ').replace(/, ([^,]+)$/, ' and $1')}): a slow tune that teaches it one move at a time.</p>
        </div>
      </section>

      <section class="sec score" id="score" aria-labelledby="score-h">
        <div class="wrap">
          <div class="score-in">
            <figure class="score-shot"><img src="./site/results.webp" width="420" height="256" loading="lazy" alt="The results for Canon in D: grade S with three stars, All perfect, 74,300 points, 200 perfect and no misses." /></figure>
            <div class="score-words">
              <span class="label">Scoring</span>
              <h2 class="title" id="score-h">Go for the <span class="hot">S</span></h2>
              <p>Every song ends on a grade, S down to C.</p>
            </div>
          </div>
          <ol class="rules">
            <li><strong>Streak</strong>Ten in a row doubles your points, up to ×4.</li>
            <li><strong>Spotlight</strong>Play the gold bars clean, then raise both hands for ×2.</li>
            <li><strong>Your ghost</strong>Race your own best run, bar by bar.</li>
            <li><strong>Full combo</strong>Every note. No misses.</li>
          </ol>
        </div>
      </section>

      <section class="together" id="together" aria-labelledby="together-h">
        <div class="wrap">
          <div class="together-in">
            <div class="together-words">
              <h2 class="title" id="together-h">Play together</h2>
              <p class="big">Up to four of you, one song, one beat. Or just jam.</p>
              <p>One of you starts a band and gets a four-letter code. The others type it here and join, then everyone enters mixed reality, wherever they are.</p>
            </div>
            <p class="eg"><span class="eg-code">PKRW</span><span class="eg-cap">An example. Yours comes when you start a band.</span></p>
          </div>
          <div class="band-ctl">
            <div>
              <h3>Start a band</h3>
              <p class="hint">You get a code to send to your friends.</p>
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

      <section class="sec start" id="start" aria-labelledby="start-h">
        <div class="wrap">
          <h2 class="title" id="start-h">How to start</h2>
          <ol class="steps">
            ${[
              ['Open the link on your Quest', `In the Quest browser, go to <strong>${LIVE_URL}</strong> and press Enter mixed reality. Nothing to install.`],
              ['Sit at a desk, put the controllers down', 'It’s hands only. A tray table on a train or a plane works too.'],
              ['Tap the desk and play', 'The drums come up under your hands. Poke the panel at the back of the desk for a song or another instrument.'],
            ]
              .map(([h, p], i) => `<li><span class="num" aria-hidden="true">${i + 1}</span><div><h3>${h}</h3><p>${p}</p></div></li>`)
              .join('')}
          </ol>
        </div>
      </section>

      <section class="sec specs" id="specs" aria-labelledby="specs-h">
        <div class="wrap">
          <h2 class="title" id="specs-h">Specs</h2>
          <dl class="spec">
            <div><dt>Headset</dt><dd>Meta Quest 3, Quest browser (WebXR)</dd></div>
            <div><dt>Where</dt><dd>Seated at a desk or tray table, passthrough</dd></div>
            <div><dt>Input</dt><dd>Hand tracking, hands only</dd></div>
            <div><dt>Players</dt><dd>1–4 online with a code</dd></div>
            <div><dt>Songs</dt><dd>${TUNES.length} (${classics.length} classics, ${originals.length} originals) on Easy, Normal and Hard, plus ${LESSONS.length} lessons</dd></div>
            <div><dt>Price</dt><dd>Free, nothing to install</dd></div>
            <div><dt>Status</dt><dd>Built and checked in the WebXR emulator; Quest 3 playtests next</dd></div>
          </dl>
          <details class="prep">
            <summary>Settings <small>For the Quest’s browser, before you enter. They’re saved there.</small><span class="pm" aria-hidden="true"></span></summary>
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

  // the bar is clear over the hero; it takes the plum and its rule once the page has scrolled
  const bar = el.querySelector<HTMLElement>('.bar')!;
  el.addEventListener('scroll', () => bar.classList.toggle('scrolled', el.scrollTop > 8), { passive: true });

  // Enter mixed reality: on a Quest it starts; a browser that can't enter says so on the button and copies the link
  const btn = el.querySelector<HTMLButtonElement>('#enter-xr')!;
  const barBtn = el.querySelector<HTMLButtonElement>('#bar-enter')!;
  const xrFail = el.querySelector<HTMLElement>('.xr-fail')!;
  const note = el.querySelector<HTMLElement>('#go-note')!;
  const xrApi = (navigator as Navigator & { xr?: { isSessionSupported(mode: string): Promise<boolean> } }).xr;
  let canEnter = world.xrEnabled && !!xrApi && !new URLSearchParams(location.search).has('jam');
  const label = () => {
    btn.textContent = canEnter ? 'Enter mixed reality' : 'Copy the Quest link';
    barBtn.textContent = canEnter ? 'Enter' : 'Copy link';
    note.textContent = canEnter
      ? 'Sit at a desk or a tray table and put the controllers down: it’s hands only.'
      : `Thump runs in the Quest browser. This copies ${LIVE_URL} to open there.`;
  };
  label();
  if (canEnter)
    void xrApi!.isSessionSupported('immersive-ar').then(
      (ok) => ((canEnter = ok), label()),
      () => ((canEnter = false), label()),
    );
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
  barBtn.addEventListener('click', () => {
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

  // the band: one list; the chosen name swaps the capture, the line on how it's played, and the drawing
  const shot = el.querySelector<HTMLImageElement>('.band-shot img')!;
  const how = el.querySelector<HTMLElement>('.band-shot .how')!;
  mountDesk(el, (id) => {
    const b = BAND.find((x) => x.id === id)!;
    shot.src = `./site/${id}.webp`;
    shot.alt = b.alt;
    how.textContent = b.line;
  });

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

/** The drawing of the desk: pick an instrument from the band's list, tap its parts, hear the headset's sounds. */
function mountDesk(el: HTMLElement, chose: (id: InstId) => void): void {
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

  /** The drawing's one flourish: the hit's broken rings go out, in hot, from the point that was hit. */
  const ring = (x: number, y: number) => {
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
    stage.querySelectorAll('svg.desk-svg').forEach((s) => s.remove());
    stage.insertAdjacentHTML('afterbegin', deskSvg(id, labelOf(id)));
    centreOnTray(stage.querySelector('svg.desk-svg')!);
    // (the scale bar follows: the drums are drawn on a desk, the rest on a tray)
    const bar = el.querySelector<HTMLElement>('.scale-bar');
    if (bar) bar.style.width = `${((10 / viewFor(id).w) * 100).toFixed(2)}%`;
    about.textContent = ABOUT[id];
    for (const b of picks) b.setAttribute('aria-pressed', String(b.dataset.inst === id));
    if (id === 'guitar') stage.querySelector(`.part[data-part="g${chord}"]`)?.classList.add('on');
    chose(id);
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
}
