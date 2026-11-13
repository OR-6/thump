/**
 * The 2D page shown outside the headset: the hook, one button to enter mixed reality, and the
 * settings folded away (DESIGN.md §3.15). On a laptop or phone it says how to play on a Quest instead.
 */
import { VisibilityState, type World } from '@iwsdk/core';
import { audio } from '../audio/engine.js';
import { loadSettings, saveSettings, type Settings } from '../persistence/settings.js';
import { loadProgress, saveProgress, freshProgress } from '../persistence/progress.js';
import { mountPhoneJam } from '../jam/phone.js';

const LIVE_URL = 'or-6.github.io/thump';

export function mountLanding(world: World): void {
  const el = document.createElement('div');
  el.id = 'landing';
  el.innerHTML = `
    <main class="sheet">
      <header class="mast">
        <p class="kicker">Tonight, in your room</p>
        <h1>Thump</h1>
        <p class="tag">Play your room.</p>
      </header>
      <ol class="bill" aria-label="What your room might play">
        <li><span class="who">Your table</span><i></i><span class="what" style="--c:#ff5a3c">drum kit</span></li>
        <li><span class="who">The wall</span><i></i><span class="what" style="--c:#e8a44a">gong</span></li>
        <li><span class="who">The next wall</span><i></i><span class="what" style="--c:#d4703a">timpani</span></li>
        <li><span class="who">Your door</span><i></i><span class="what" style="--c:#ffc14d">marimba</span></li>
        <li><span class="who">The window</span><i></i><span class="what" style="--c:#6fa8ff">harp, played gently</span></li>
        <li><span class="who">The cupboard</span><i></i><span class="what" style="--c:#2ad1b5">kalimba</span></li>
        <li><span class="who">The lamp</span><i></i><span class="what" style="--c:#b28dff">vibraphone</span></li>
      </ol>
      <p class="conductor">Conducted by your two hands.</p>
      <p class="lede">Every surface in your room is an instrument. Hit anything to find out what it plays, then play songs across your own room.</p>
      <div class="go">
        <button id="enter-xr" class="patch" type="button">Enter mixed reality</button>
        <p class="xr-fail" role="alert" hidden>Mixed reality didn't start. Allow what Quest asks for, then press Enter again.</p>
        <p class="note">Sit at a table with hand tracking on. Quest will ask once to use your room; a room scan (Space Setup) finds more instruments.</p>
      </div>
      <div class="nohead" id="xr-unsupported" hidden>
        <p class="quest"><b>Play on Meta Quest:</b> open <span class="url">${LIVE_URL}</span> in the headset's browser.</p>
        <button type="button" id="copy-link" class="patch small">Copy link</button>
      </div>
      <details class="prep">
        <summary>Settings</summary>
        <div class="opts">
          <label><input type="checkbox" data-k="oneHand" /> One hand: the drum kit within one hand's reach</label>
          <label class="row">Lead hand
            <select data-k="hand"><option value="auto">The hand you rest first</option><option value="right">Right</option><option value="left">Left</option></select>
          </label>
          <label class="row">Song speed <input type="range" min="0.6" max="1" step="0.1" data-k="tempo" /> <output id="tempo-out"></output></label>
          <label><input type="checkbox" data-k="highContrast" /> High contrast</label>
          <label><input type="checkbox" data-k="calmMotion" /> Calm motion</label>
          <label><input type="checkbox" data-k="noWords" /> No words in the headset</label>
          <label><input type="checkbox" data-k="band" /> Backing band in songs</label>
          <label><input type="checkbox" data-k="placeFresh" /> Find the table again next time</label>
          <p class="small-print">Timing offset: <span id="offset-out"></span>. <button type="button" id="reset" class="link">Start over</button></p>
        </div>
      </details>
      <footer class="foot">Twenty recorded instruments, public domain (the Versilian Community Sample Library), tuned to your room as you play. Code under the MIT licence.</footer>
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
  // a friend's phone joins the headset's jam (shown where there's no headset)
  mountPhoneJam(el.querySelector<HTMLElement>('#xr-unsupported')!);
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
    tempoOut.textContent = st.tempo >= 0.999 ? 'full' : `${Math.round(st.tempo * 100)}%`;
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
      b.textContent = 'Tap again to forget your songs and rooms';
      return;
    }
    const p = loadProgress();
    saveProgress({ ...freshProgress(), kit: p.kit });
    window.dispatchEvent(new Event('thump:reset'));
    b.textContent = 'Done: your room starts fresh';
    b.dataset.sure = '';
  });

  // the page hides while in the headset
  world.visibilityState.subscribe((v) => {
    el.hidden = v !== VisibilityState.NonImmersive;
  });
}
