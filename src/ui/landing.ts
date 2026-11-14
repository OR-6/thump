/**
 * The 2D page shown outside the headset: what Thump is, a drawing of the desk from above that plays the instruments
 * you'll have on it (the headset's own sounds), one button to enter mixed reality, playing together (start a band or
 * type a friend's code), and the settings folded away. On a laptop or phone it says how to play on a Quest instead.
 */
import { VisibilityState, type World } from '@iwsdk/core';
import { audio, type Voice } from '../audio/engine.js';
import { loadSettings, saveSettings, type Settings } from '../persistence/settings.js';
import { loadProgress, saveProgress, freshProgress } from '../persistence/progress.js';
import { coop, normaliseCode, type CoopStatus } from '../net/coop.js';
import { asPlayer } from '../net/band.js';
import { PADS } from '../config.js';
import { CONGA, SHELF, handpanZones, marimbaZones, percVoice, pianoBlacks, pianoZones, strumNotes, type InstId } from '../kit/shelf.js';
import { TRACKS, dailyTrack, songDay } from '../play/build.js';
import { PAGE_ROOT, PAGE_SCALE, VIEW, centreOnTray, deskSvg, viewFor } from './landing-drawing.js';

const LIVE_URL = 'or-6.github.io/thump';

/** What each instrument is, in a sentence or two, from how the game builds it. */
const ABOUT: Record<InstId, string> = {
  drums: 'A full kit for your hands: hi-hat, snare, a rack tom, a floor tom, a bass drum lying flat, crash and ride. Acoustic, jazz or electronic. Slap the heads, or make fists and sticks appear.',
  piano: 'A compact keyboard at real key size: two octaves, every white key a note of the scale. The square to the left of the keys plays three notes at once. Set its key, scale and sound.',
  marimba: 'Eight rosewood bars on a maple box, long and low on the left. Make fists and mallets appear, or tap with your fingers.',
  guitar: 'It lies flat on the desk. One hand holds one of three chords on the neck, the other sweeps the strings.',
  congas: 'Two hand drums, the low one on the left. The middle of a head is an open tone, the edge a slap.',
  handpan: 'A low note in the middle and eight around it. Alternate hands round the rim and you walk up the scale.',
};

export function mountLanding(world: World): void {
  const today = dailyTrack(songDay());
  const el = document.createElement('div');
  el.id = 'landing';
  el.innerHTML = `
    <div class="page">
      <header class="mast">
        <span class="wordmark">Thump</span>
        <span class="for">For Meta Quest 3</span>
      </header>

      <main>
        <section class="hero">
          <div class="pitch">
            <h1>A band on your desk.</h1>
            <p class="lede">A music game for Meta Quest 3, played sitting down. Tap your desk or a tray table and a drum kit comes up under your hands. Swap it for a piano, a marimba, a guitar, congas or a handpan. Every note is in the scale, so there's no wrong one.</p>
            <div class="go">
              <button id="enter-xr" class="enter" type="button">Enter mixed reality</button>
              <p class="go-note">Put the controllers down first. It's hands only.</p>
              <p class="xr-fail" role="alert" hidden>It didn't start. Say yes to Quest's prompts and try again.</p>
            </div>
            <div class="nohead" id="xr-unsupported" hidden>
              <p class="quest">It plays on a Meta Quest 3. In the Quest's browser, go to</p>
              <p class="url-line"><strong class="url">${LIVE_URL}</strong> <button type="button" id="copy-link" class="plain">Copy the link</button></p>
            </div>
          </div>

          <figure class="desk">
            <div class="picker" role="group" aria-label="Instruments">
              ${SHELF.map((d) => `<button type="button" class="pick" data-inst="${d.id}" style="--light:#${d.color.toString(16).padStart(6, '0')}" aria-pressed="false">${d.name}</button>`).join('')}
            </div>
            <div class="stage"></div>
            <div class="desk-foot" aria-hidden="true">
              <span class="your-side">Your side of the desk</span>
              <span class="scale"><span class="scale-bar" style="width:${((10 / VIEW.w) * 100).toFixed(2)}%"></span>10 cm</span>
            </div>
            <figcaption>
              <p class="about"></p>
              <p class="try">Tap the drawing to play it. These are the sounds the headset plays.</p>
            </figcaption>
          </figure>
        </section>

        <section class="row" id="together" aria-labelledby="together-h">
          <div class="row-words">
            <h2 id="together-h">Play together</h2>
            <p>One of you starts a band and gets a four-letter code. The others type it here and press Join, then everyone enters mixed reality. Up to four headsets, wherever you all are.</p>
          </div>
          <div class="row-body">
            <div class="band">
              <button type="button" id="band-start" class="plain">Start a band</button>
              <span class="or">or</span>
              <span class="join">
                <input id="band-code" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="CODE" aria-label="A friend's 4-letter code" />
                <button type="button" id="band-join" class="plain">Join</button>
              </span>
            </div>
            <p id="band-status" aria-live="polite"></p>
          </div>
        </section>

        <div class="trio">
        <section class="col" aria-labelledby="desk-h">
          <h2 id="desk-h">At the desk</h2>
          <div class="col-body">
            <p>Tap the desk and the drums come out. A screen floats over the back of the desk: poke it with a fingertip to swap instruments, pick a song or start a track. Your first few notes bring in a soft backing band at your tempo, and it drops out when you stop.</p>
          </div>
        </section>

        <section class="col" aria-labelledby="songs-h">
          <h2 id="songs-h">Songs</h2>
          <div class="col-body">
            <p>Five songs, and a sixth that changes every day. Pick Easy, Normal or Hard. The notes fall onto the exact key or drum that plays them while a band plays the rest, and each song has two one-bar solos where anything you hit counts. Switch instruments halfway through if you like.</p>
            <ol class="setlist">
              ${[...TRACKS, today].map((t) => `<li><span class="song">${t.name}</span><span class="bpm">${t.bpm} bpm</span></li>`).join('')}
            </ol>
          </div>
        </section>

        <section class="col" aria-labelledby="track-h">
          <h2 id="track-h">Make a track</h2>
          <div class="col-body">
            <p>Build a song one part at a time: Boom, Smack, Tick, Extra, Tune, Bass. For a bar the lights show you a pattern, then for a bar you play anything and it's kept, snapped to the beat. When the last part is in, everything drops in at once and you play it like a song.</p>
          </div>
        </section>
        </div>

        <section class="row" aria-labelledby="prep-h">
          <div class="row-words">
            <h2 id="prep-h">Before you start</h2>
            <p>Sit at a desk or a tray table with the Quest on. It asks once to see your desk. Nothing leaves the headset unless you play together, and then only the notes you play.</p>
          </div>
          <div class="row-body">
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
        </section>
      </main>

      <footer class="foot">Sounds from the Versilian Community Sample Library (CC0). Code under the MIT licence.</footer>
    </div>`;
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
  const noHeadset = () => {
    el.querySelector<HTMLElement>('.go')!.hidden = true;
    el.querySelector<HTMLElement>('#xr-unsupported')!.hidden = false;
  };
  const xrApi = (navigator as Navigator & { xr?: { isSessionSupported(mode: string): Promise<boolean> } }).xr;
  if (!world.xrEnabled || !xrApi || new URLSearchParams(location.search).has('jam')) noHeadset();
  else void xrApi.isSessionSupported('immersive-ar').then((ok) => ok || noHeadset(), noHeadset);

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
  const copyBtn = el.querySelector<HTMLButtonElement>('#copy-link')!;
  copyBtn.addEventListener('click', () => {
    const url = location.origin + location.pathname;
    void navigator.clipboard?.writeText(url).then(
      () => (copyBtn.textContent = 'Copied'),
      () => (copyBtn.textContent = url),
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
    centreOnTray(stage.querySelector('svg')!);
    // (the scale bar follows: the drums are drawn on a desk, the rest on a tray)
    const bar = document.querySelector<HTMLElement>('#landing .scale-bar');
    if (bar) bar.style.width = `${((10 / viewFor(id).w) * 100).toFixed(2)}%`;
    about.textContent = ABOUT[id];
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
}
