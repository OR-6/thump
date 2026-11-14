/**
 * The 2D page shown outside the headset: Thump's site. The key art and the one button that starts mixed reality,
 * the six instruments in real captures, a drawing of the desk that plays the headset's own sounds, the song list,
 * how scoring works, three steps to start, playing together (start a band or type a friend's code), the specs and
 * the settings. On a laptop or phone the button becomes the address to open on a Quest.
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
import { INST_LIGHT } from './theme.js';
import { stampSvg, wordmarkSvg } from './brand.js';
import { PAGE_ROOT, PAGE_SCALE, VIEW, centreOnTray, deskSvg, viewFor } from './landing-drawing.js';

const LIVE_URL = 'or-6.github.io/thump';
const REPO_URL = 'https://github.com/OR-6/thump';

const lightOf = (id: InstId) => `#${(INST_LIGHT[id] ?? 0xffffff).toString(16).padStart(6, '0')}`;

/** Each instrument on the page: a capture from the game, what it is, and the alt text for the capture. */
const INSTRUMENTS: { id: InstId; line: string; alt: string }[] = [
  { id: 'drums', line: 'A full kit: hi-hat, snare, two toms, the kick, crash and ride. Slap the heads, or make fists and sticks appear.', alt: 'The drums mid-song: rings closing onto the snare and the kick, Perfect on both heads, the score panel behind.' },
  { id: 'piano', line: 'A compact keyboard with real-size keys. Every white key is in the scale, and the pad on the left plays chords.', alt: 'The keyboard in Für Elise: a note landing on a key, the Spotlight meter filling over the score.' },
  { id: 'guitar', line: 'A full-size acoustic you hold. Strings sound as your fingertips cross them; the neck picks chords, or real frets.', alt: 'The acoustic guitar held at the edge of the desk, chord names on the neck, the score panel behind.' },
  { id: 'marimba', line: 'Eight rosewood bars on a maple box. Make a fist and a mallet appears in it.', alt: 'The marimba in Canon in D, one bar lit gold as it is hit.' },
  { id: 'congas', line: 'Two hand drums. Palm in the middle for an open tone, fingers on the edge for a slap.', alt: 'Two congas in Can-can, a ring closing onto the right-hand drum.' },
  { id: 'handpan', line: 'A deep note in the middle and eight around it. Go round the rim and you walk up the scale.', alt: 'The handpan in Amazing Grace, the score panel behind it.' },
];

/** What the drawing of each instrument does, under it. */
const ABOUT: Record<InstId, string> = {
  drums: 'The whole kit from above: hi-hat, snare, rack tom, floor tom, the kick lying flat, crash and ride.',
  piano: 'Two octaves of real-size keys. A black key plays the two notes either side of it; the red button plays a chord.',
  marimba: 'Eight bars, long and low on the left.',
  guitar: 'In the headset you hold it. Here, pick a chord on the neck, then tap the strings.',
  congas: 'The low drum on the left. The middle of a head is an open tone, the edge a slap.',
  handpan: 'A low note in the middle and eight around it.',
};

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const word = (n: number) => WORDS[n] ?? String(n);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const STYLE: Record<string, string> = { shufflehop: 'Shuffle', hiphop: 'Hip-hop', synthpop: 'Synth-pop', three: 'Waltz' };

export function mountLanding(world: World): void {
  const classics = TUNES.filter((t) => !t.original);
  const originals = TUNES.filter((t) => t.original);
  const songRow = (t: (typeof TUNES)[number]) =>
    `<li><span class="song">${esc(t.name)}</span><span class="by">${esc(t.original ? (STYLE[t.style] ?? cap(t.style)) : t.by)}</span><span class="bpm">${t.bpm}<abbr title="beats per minute">bpm</abbr></span></li>`;
  const name = (id: InstId) => SHELF.find((d) => d.id === id)?.name ?? id;

  const el = document.createElement('div');
  el.id = 'landing';
  el.innerHTML = `
    <a class="skip" href="#main">Skip to the page</a>
    <header class="bar">
      <div class="wrap bar-in">
        <a class="brand" href="#top"><img src="./favicon.svg" width="32" height="32" alt="" />${wordmarkSvg('currentColor', 'Thump')}</a>
        <nav class="nav" aria-label="On this page">
          <a href="#instruments">Instruments</a><a href="#songs">Songs</a><a href="#how">How it works</a><a href="#together">Play together</a><a href="#specs">Specs</a>
        </nav>
        <button type="button" class="btn btn-2 btn-s" id="bar-play"><span>Play now</span></button>
      </div>
    </header>

    <main id="main" tabindex="-1">
      <section class="hero" id="top" aria-labelledby="hero-h">
        <img class="hero-art" src="./site/keyart.webp" width="1920" height="1080" fetchpriority="high"
          alt="Thump's drum kit on a dark plum stage: rings of amber and magenta light burst off the snare as it is struck, sparks thrown up past the cymbals." />
        <div class="wrap hero-in">
          <div class="hero-copy">
            <div class="hero-stamp">${stampSvg('hero', undefined, { label: 'Thump' })}</div>
            <h1 id="hero-h">A band on your desk.</h1>
            <p class="lede">Hit a full drum kit in the air. Play real keys, a marimba, congas and a handpan, or hold a guitar and strum it. Bare hands, mixed reality, on Meta Quest 3. It runs in the browser: nothing to install.</p>
            <div class="go">
              <div class="cta">
                <button id="enter-xr" class="btn btn-1" type="button"><span>Enter mixed reality</span></button>
                <a class="btn btn-3" href="#songs"><span>See the songs</span></a>
              </div>
              <p class="go-note">Put the controllers down first. It's hands only.</p>
              <p class="xr-fail" role="alert" hidden>It didn't start. Say yes to Quest's prompts and try again.</p>
            </div>
            <div class="nohead" id="xr-unsupported" hidden>
              <p class="quest">Play it on a Meta Quest 3. In the Quest's browser, go to</p>
              <p class="url">${LIVE_URL}</p>
              <div class="cta">
                <button type="button" id="copy-link" class="btn btn-1"><span>Copy the link</span></button>
                <a class="btn btn-3" href="#hear"><span>Hear it here</span></a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="sec" id="instruments" aria-labelledby="inst-h">
        <div class="wrap">
          <div class="head">
            <h2 id="inst-h">Six instruments, one desk</h2>
            <p>Each is a model of the real thing, and it moves when you play it. Swap from the panel at the back of the desk, even halfway through a song.</p>
          </div>
          <ul class="kit-grid">
            ${INSTRUMENTS.map((it) => `
            <li class="inst-card" style="--light:${lightOf(it.id)}">
              <img src="./site/${it.id}.webp" width="720" height="540" loading="lazy" alt="${esc(it.alt)}" />
              <div class="inst-txt">
                <h3>${name(it.id)}</h3>
                <p>${it.line}</p>
                <button type="button" class="hear" data-hear="${it.id}">Hear the ${name(it.id).toLowerCase()}</button>
              </div>
            </li>`).join('')}
          </ul>
          <p class="fine">Captures from the game, running in the WebXR emulator. In the headset, the room around the instruments is your own.</p>
        </div>
      </section>

      <section class="sec alt" id="hear" aria-labelledby="hear-h">
        <div class="wrap hear-in">
          <div class="hear-words">
            <h2 id="hear-h">Hear them now</h2>
            <p>The same sounds the headset plays. Pick an instrument and tap the drawing. With a mouse, hold the button down and drag across for a run.</p>
            <div class="picker" role="group" aria-label="Instruments">
              ${SHELF.map((d) => `<button type="button" class="pick" data-inst="${d.id}" style="--light:${lightOf(d.id)}" aria-pressed="false">${d.name}</button>`).join('')}
            </div>
          </div>
          <figure class="desk">
            <div class="stage"></div>
            <div class="desk-foot" aria-hidden="true">
              <span>Your side of the desk</span>
              <span class="scale"><span class="scale-bar" style="width:${((10 / VIEW.w) * 100).toFixed(2)}%"></span>10 cm</span>
            </div>
            <figcaption class="about" aria-live="polite"></figcaption>
          </figure>
        </div>
      </section>

      <section class="sec" id="songs" aria-labelledby="songs-h">
        <div class="wrap">
          <div class="head">
            <h2 id="songs-h">${cap(word(TUNES.length))} songs. <span class="lv-easy">Easy</span>, <span class="lv-normal">Normal</span>, <span class="lv-hard">Hard</span>.</h2>
            <p>${cap(word(classics.length))} classics you can already hum, set to modern grooves, and ${word(originals.length)} written for Thump. The notes fall onto the exact key or drum that plays them while the band plays the rest.</p>
          </div>
          <div class="sets">
            <div class="set"><h3>Classics</h3><ol class="setlist two">${classics.map(songRow).join('')}</ol></div>
            <div class="set"><h3>Written for Thump</h3><ol class="setlist">${originals.map(songRow).join('')}</ol>
              <p class="lessons"><span class="k">And a lesson for each instrument</span>A slow tune that teaches it one move at a time: ${LESSONS.map((l) => esc(l.name.replace(/^Learn /, ''))).join(', ')}.</p></div>
          </div>
        </div>
      </section>

      <section class="sec alt" id="score" aria-labelledby="score-h">
        <div class="wrap score-in">
          <div class="shots">
            <figure class="shot shot-a"><img src="./site/hud.webp" width="620" height="465" loading="lazy" alt="The panel during Ode to Joy: a 110-note streak at times four, 100 percent accuracy, 60 points behind your best run, and Hands up for the Spotlight." /><figcaption>Mid-song: the streak, your ghost, the Spotlight</figcaption></figure>
            <figure class="shot shot-b"><img src="./site/results.webp" width="620" height="465" loading="lazy" alt="The results for Ode to Joy on Normal: grade S with three stars, 95,100 points, 252 perfect and no misses, All perfect." /><figcaption>The results: grade S, all perfect</figcaption></figure>
          </div>
          <div class="score-words">
            <h2 id="score-h">Go for the S</h2>
            <dl class="rules">
              <div><dt>Streak</dt><dd>Ten notes in a row doubles your points, and it climbs to ×4.</dd></div>
              <div><dt>Spotlight</dt><dd>The last bar of every four is gold. Play gold bars clean to fill the meter, then raise both hands for ×2 on top.</dd></div>
              <div><dt>Your ghost</dt><dd>Your best run is kept bar by bar and raced live. The panel says how far ahead or behind you are.</dd></div>
              <div><dt>Grades</dt><dd>S to D for every song and level, with Full Combo and All Perfect when you earn them.</dd></div>
            </dl>
            <p class="judges" aria-label="Every hit is judged Perfect, Good or Miss"><span class="j-p">Perfect</span><span class="j-g">Good</span><span class="j-m">Miss</span></p>
          </div>
        </div>
      </section>

      <section class="sec" id="how" aria-labelledby="how-h">
        <div class="wrap">
          <div class="head"><h2 id="how-h">How it works</h2></div>
          <ol class="steps">
            <li><span class="n" aria-hidden="true">1</span><h3>Open the link</h3><p>In the Quest browser, go to <strong>${LIVE_URL}</strong> and press Enter mixed reality. It asks once to see your room. Nothing to install.</p></li>
            <li><span class="n" aria-hidden="true">2</span><h3>Sit at a desk</h3><p>Put the controllers down. Tap the desk, or rest a palm flat on it, and the drums come up under your hands. A tray table works too.</p></li>
            <li><span class="n" aria-hidden="true">3</span><h3>Play</h3><p>Poke the panel at the back of the desk to pick a song or an instrument. Or just play: free play has a four-bar looper to layer parts on.</p></li>
          </ol>
        </div>
      </section>

      <section class="sec alt" id="together" aria-labelledby="together-h">
        <div class="wrap together-in">
          <div class="together-words">
            <h2 id="together-h">Play together</h2>
            <p>Up to four headsets, wherever you all are. One of you starts a band and gets a four-letter code. The others type it here and press Join, then everyone enters mixed reality. Play a song together or jam in free play, on the same beat.</p>
          </div>
          <div class="band-box">
            <div class="band">
              <button type="button" id="band-start" class="btn btn-2"><span>Start a band</span></button>
              <span class="or">or</span>
              <span class="join">
                <input id="band-code" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="CODE" aria-label="A friend's 4-letter code" />
                <button type="button" id="band-join" class="btn btn-3"><span>Join</span></button>
              </span>
            </div>
            <p id="band-status" aria-live="polite"></p>
          </div>
        </div>
      </section>

      <section class="sec" id="specs" aria-labelledby="specs-h">
        <div class="wrap specs-in">
          <div>
            <h2 id="specs-h">Specs</h2>
            <dl class="spec">
              <div><dt>Headset</dt><dd>Meta Quest 3, in the Quest browser (WebXR)</dd></div>
              <div><dt>Where</dt><dd>Seated at a desk or a tray table, in passthrough mixed reality</dd></div>
              <div><dt>Input</dt><dd>Hand tracking. Hands only</dd></div>
              <div><dt>Players</dt><dd>1 to 4, online with a code</dd></div>
              <div><dt>Songs</dt><dd>${TUNES.length} (${classics.length} classics, ${originals.length} originals) on Easy, Normal and Hard, plus ${LESSONS.length} lessons</dd></div>
              <div><dt>Price</dt><dd>Free. Nothing to install</dd></div>
              <div><dt>Privacy</dt><dd>Nothing leaves the headset unless you play together, and then only the notes you play</dd></div>
              <div><dt>Status</dt><dd>Built and checked in the WebXR emulator. Testing on a Quest 3 comes next</dd></div>
            </dl>
          </div>
          <div class="prep-col">
            <details class="prep">
              <summary>Settings</summary>
              <p class="small-print">Change these in the Quest's browser before you enter. They're saved there.</p>
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
        </div>
      </section>
    </main>

    <footer class="foot">
      <div class="wrap foot-in">
        <div class="foot-brand">${wordmarkSvg('currentColor', '')}<p>An entry in the Meta VR Start Developer Competition 2026, Gaming.</p></div>
        <p class="credits">Instrument sounds from the Versilian Community Sample Library (CC0). Interface sounds and particles by Kenney (CC0). Code under the MIT licence, on <a href="${REPO_URL}">GitHub</a>.</p>
      </div>
    </footer>`;
  document.body.appendChild(el);
  // (index.html paints the top of the page while the game loads; this replaces it)
  document.getElementById('landing-boot')?.remove();

  const btn = el.querySelector<HTMLButtonElement>('#enter-xr')!;
  const xrFail = el.querySelector<HTMLElement>('.xr-fail')!;
  btn.addEventListener('click', () => {
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
  // a laptop or phone browser can't enter mixed reality: say how to play on a Quest instead
  // (world.xrEnabled is the project's config, true everywhere; the browser itself is what decides)
  const go = el.querySelector<HTMLElement>('.go')!;
  const noHeadset = () => {
    go.hidden = true;
    el.querySelector<HTMLElement>('#xr-unsupported')!.hidden = false;
  };
  const xrApi = (navigator as Navigator & { xr?: { isSessionSupported(mode: string): Promise<boolean> } }).xr;
  if (!world.xrEnabled || !xrApi || new URLSearchParams(location.search).has('jam')) noHeadset();
  else void xrApi.isSessionSupported('immersive-ar').then((ok) => ok || noHeadset(), noHeadset);

  // the bar's Play now: on a Quest it starts, anywhere else it goes to the address
  el.querySelector<HTMLButtonElement>('#bar-play')!.addEventListener('click', () => {
    if (!go.hidden) btn.click();
    else {
      el.scrollTo({ top: 0, behavior: smooth() });
      el.querySelector<HTMLButtonElement>('#copy-link')!.focus({ preventScroll: true });
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
  for (const b of el.querySelectorAll<HTMLButtonElement>('.hear')) {
    b.addEventListener('click', () => {
      desk.pick(b.dataset.hear as InstId);
      el.querySelector('#hear')!.scrollIntoView({ behavior: smooth(), block: 'start' });
      el.querySelector<HTMLButtonElement>(`.pick[data-inst="${b.dataset.hear}"]`)?.focus({ preventScroll: true });
    });
  }

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
  const copyBtn = el.querySelector<HTMLButtonElement>('#copy-link')!;
  const copyLabel = copyBtn.querySelector('span')!;
  copyBtn.addEventListener('click', () => {
    const url = location.origin + location.pathname;
    void navigator.clipboard?.writeText(url).then(
      () => (copyLabel.textContent = 'Copied'),
      () => (copyLabel.textContent = url),
    );
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

  const hit = (p: Element) => {
    const id = p.getAttribute('data-part') ?? '';
    asPlayer(() => {
      audio.resume();
      play(id);
    });
    // (off, then on next frame: a second hit restarts the light)
    p.classList.remove('lit');
    requestAnimationFrame(() => p.classList.add('lit'));
  };

  const show = (id: InstId, animate: boolean) => {
    inst = id;
    const d = SHELF.find((x) => x.id === id)!;
    stage.innerHTML = deskSvg(id, d.name);
    stage.style.setProperty('--light', lightOf(id));
    centreOnTray(stage.querySelector('svg')!);
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
    hit(p);
  });
  stage.addEventListener('pointerover', (e) => {
    if (!held) return;
    const p = (e.target as Element).closest('.part');
    if (p && !p.contains(e.relatedTarget as Node | null)) hit(p);
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
