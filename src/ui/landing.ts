/**
 * The 2D page shown outside the headset: a sampler whose pads play the instruments you'll have on your desk, one
 * button to enter mixed reality, playing together (start a band or type a friend's code), and the settings folded
 * away. On a laptop or phone it says how to play on a Quest instead.
 */
import { VisibilityState, type World } from '@iwsdk/core';
import { audio, type Voice } from '../audio/engine.js';
import { loadSettings, saveSettings, type Settings } from '../persistence/settings.js';
import { loadProgress, saveProgress, freshProgress } from '../persistence/progress.js';
import { coop, normaliseCode, type CoopStatus } from '../net/coop.js';
import { asPlayer } from '../net/band.js';
import { strumNotes } from '../kit/shelf.js';

const LIVE_URL = 'or-6.github.io/thump';

export function mountLanding(world: World): void {
  const el = document.createElement('div');
  el.id = 'landing';
  el.innerHTML = `
    <main class="rig">
      <section class="sampler" aria-label="Thump">
        <header class="top">
          <span class="brand">THUMP</span>
          <span class="model">DESK SAMPLER · 5 INSTRUMENTS</span>
        </header>
        <div class="lcd" aria-live="polite"><span class="lcd-main">A BAND ON YOUR DESK</span><span class="lcd-sub">tap a pad</span></div>
        <div class="pads" role="group" aria-label="Try the instruments">
          <button class="pad" data-k="d" data-v="kick" style="--c:#ff5a3c"><i>BOOM</i></button>
          <button class="pad" data-k="d" data-v="snare" style="--c:#f4f1ea"><i>SMACK</i></button>
          <button class="pad" data-k="d" data-v="hat" style="--c:#2ad1d1"><i>TICK</i></button>
          <button class="pad" data-k="p" data-v="60" style="--c:#ffa630"><i>PIANO</i></button>
          <button class="pad" data-k="p" data-v="64" style="--c:#ffa630"><i>PIANO</i></button>
          <button class="pad" data-k="p" data-v="67" style="--c:#ffa630"><i>PIANO</i></button>
          <button class="pad" data-k="g" data-v="0" style="--c:#6fa8ff"><i>GUITAR</i></button>
          <button class="pad" data-k="g" data-v="9" style="--c:#6fa8ff"><i>GUITAR</i></button>
          <button class="pad" data-k="g" data-v="5" style="--c:#6fa8ff"><i>GUITAR</i></button>
          <button class="pad" data-k="h" data-v="62" style="--c:#2ad1b5"><i>HANDPAN</i></button>
          <button class="pad" data-k="h" data-v="69" style="--c:#2ad1b5"><i>HANDPAN</i></button>
          <button class="pad" data-k="h" data-v="74" style="--c:#2ad1b5"><i>HANDPAN</i></button>
        </div>
        <div class="go">
          <button id="enter-xr" class="power" type="button"><span class="led"></span>Enter mixed reality</button>
          <p class="xr-fail" role="alert" hidden>It didn't start. Say yes to Quest's prompts and try again.</p>
        </div>
        <div class="together" aria-label="Play together">
          <span class="tlabel">PLAY TOGETHER</span>
          <button type="button" id="band-start" class="power small">Start a band</button>
          <input id="band-code" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="CODE" aria-label="A friend's 4-letter code" />
          <button type="button" id="band-join" class="power small">Join</button>
          <p id="band-status" aria-live="polite"></p>
        </div>
        <div class="nohead" id="xr-unsupported" hidden>
          <p class="quest">It plays on a Meta Quest 3. In its browser, go to <span class="url">${LIVE_URL}</span></p>
          <button type="button" id="copy-link" class="power small">Copy the link</button>
        </div>
      </section>
      <section class="manual">
        <p>Sit at a desk or a tray table with a Quest 3 on. Tap the desk and a drum kit comes up under your hands. Poke the screen floating over the desk to swap it for a piano, a marimba, a guitar or a handpan. Every note fits the others, so there's no wrong one.</p>
        <p>Pick a song and the notes fall onto the keys you need, with the band playing the rest. Or make your own track a part at a time and play it live. Switch instruments halfway through if you like.</p>
        <p>With friends: one of you starts a band, the others type the code. Up to four headsets, wherever you all are.</p>
        <p class="note">Put the controllers down: it's hands only. Quest asks once to see your desk. Nothing leaves the headset unless you play together, and then only the notes.</p>
        <p class="note">On your Quest, open the Browser and go to <span class="url">${LIVE_URL}</span></p>
        <details class="prep">
          <summary>Settings</summary>
          <div class="opts">
            <label><input type="checkbox" data-k="oneHand" /> One hand (kit sized for one hand)</label>
            <label class="row">Lead hand
              <select data-k="hand"><option value="auto">Whichever you rest first</option><option value="right">Right</option><option value="left">Left</option></select>
            </label>
            <label class="row">Speed <input type="range" min="0.6" max="1" step="0.1" data-k="tempo" /> <output id="tempo-out"></output></label>
            <label><input type="checkbox" data-k="highContrast" /> High contrast</label>
            <label><input type="checkbox" data-k="calmMotion" /> Less movement</label>
            <label><input type="checkbox" data-k="noWords" /> No words in the headset</label>
            <label><input type="checkbox" data-k="band" /> Piano and bass under tracks</label>
            <label><input type="checkbox" data-k="placeFresh" /> Set up the desk fresh each time</label>
            <p class="small-print">Timing: <span id="offset-out"></span>. <button type="button" id="reset" class="link">Start over</button></p>
          </div>
        </details>
        <footer class="foot">Sounds: Versilian Community Sample Library (public domain). Code: MIT.</footer>
      </section>
    </main>`;
  document.body.appendChild(el);

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
  if (!world.xrEnabled || new URLSearchParams(location.search).has('jam')) {
    el.querySelector<HTMLElement>('.go')!.hidden = true;
    el.querySelector<HTMLElement>('#xr-unsupported')!.hidden = false;
  }
  // the pads on the page play the real instruments (the same sounds the headset uses)
  const lcdMain = el.querySelector<HTMLElement>('.lcd-main')!;
  const lcdSub = el.querySelector<HTMLElement>('.lcd-sub')!;
  const say: Record<string, string> = { d: 'DRUMS', p: 'PIANO', g: 'GUITAR', h: 'HANDPAN' };
  for (const pad of el.querySelectorAll<HTMLButtonElement>('.pad')) {
    pad.addEventListener('pointerdown', () => asPlayer(() => {
      audio.resume();
      const k = pad.dataset.k ?? '';
      const v = pad.dataset.v ?? '';
      if (k === 'd') audio.drum(v as Voice, 0.85, 0);
      else if (k === 'p') audio.modal('keys', Number(v), 0.8, 0, 0, 0.5, 'page');
      else if (k === 'h') audio.modal('tongue', Number(v), 0.8, 0, 0, 0.5, 'page');
      else if (k === 'g') {
        // a strum: C, A minor, F
        const root = 48 + Number(v);
        const notes = strumNotes(root, Number(v) === 9 ? [0, 3, 7] : [0, 4, 7]);
        const t = audio.now();
        notes.forEach((n, i) => audio.pluck(n, 0.75 - i * 0.04, 0, t + i * 0.012, 'nylon'));
      }
      pad.classList.remove('hit');
      void pad.offsetWidth;
      pad.classList.add('hit');
      lcdMain.textContent = say[k] ?? '';
      lcdSub.textContent = 'on your desk, under your hands';
    }));
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
      : st.state === 'error' || st.state === 'closed' ? (st.message ?? 'That didn\u2019t work')
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
      bandStatus.textContent = 'Four letters, from your friend\u2019s page';
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
  for (const input of el.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-k]')) {
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
