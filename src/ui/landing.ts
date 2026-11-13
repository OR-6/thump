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
    <main class="stage">
      <article class="setlist" aria-label="Thump">
        <span class="gaffer tl"></span><span class="gaffer tr"></span><span class="gaffer bl"></span>
        <h1>THUMP</h1>
        <p class="under">play your room</p>
        <ol class="songs">
          <li>Porch Step</li>
          <li>Kitchen Clock</li>
          <li>Night Bus</li>
          <li>Big Room</li>
          <li>Open House</li>
        </ol>
        <p class="encore">encore: whatever you just played</p>
        <ul class="lineup">
          <li><b>drums</b> the table</li>
          <li><b>bells</b> your cups <small>(the tall one's lower)</small></li>
          <li><b>wood block</b> a book</li>
          <li><b>congas</b> your knees</li>
          <li><b>marimba</b> the door, if you stand up</li>
        </ul>
      </article>
      <section class="notes">
        <p class="what">A music game for Meta Quest 3. Sit at a table and put the headset on. Hit the table and it's a drum kit. Tap your cup twice and it rings. Get up and the walls, the door and the window join in.</p>
        <div class="go">
          <button id="enter-xr" class="tape-btn" type="button">Enter mixed reality</button>
          <p class="xr-fail" role="alert" hidden>That didn't start. Allow what Quest asks for, then try again.</p>
          <p class="note">Hands, not controllers. Quest asks once to use your room.</p>
        </div>
        <div class="nohead" id="xr-unsupported" hidden>
          <p class="quest">This one needs a Quest. In the headset's browser, go to <span class="url">${LIVE_URL}</span></p>
          <button type="button" id="copy-link" class="tape-btn small">Copy the link</button>
        </div>
        <details class="prep">
          <summary>Settings</summary>
          <div class="opts">
            <label><input type="checkbox" data-k="oneHand" /> One hand (the whole kit within reach of one)</label>
            <label class="row">Lead hand
              <select data-k="hand"><option value="auto">Whichever you rest first</option><option value="right">Right</option><option value="left">Left</option></select>
            </label>
            <label class="row">Song speed <input type="range" min="0.6" max="1" step="0.1" data-k="tempo" /> <output id="tempo-out"></output></label>
            <label><input type="checkbox" data-k="highContrast" /> High contrast</label>
            <label><input type="checkbox" data-k="calmMotion" /> Less movement</label>
            <label><input type="checkbox" data-k="noWords" /> No words in the headset</label>
            <label><input type="checkbox" data-k="band" /> Piano and bass behind the songs</label>
            <label><input type="checkbox" data-k="placeFresh" /> Find the table again next time</label>
            <p class="small-print">Timing: <span id="offset-out"></span>. <button type="button" id="reset" class="link">Start over</button></p>
          </div>
        </details>
        <footer class="foot">The instruments are real recordings, public domain, from the Versilian Community Sample Library. The code is MIT.</footer>
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
      b.textContent = 'Sure? Tap again';
      return;
    }
    const p = loadProgress();
    saveProgress({ ...freshProgress(), kit: p.kit });
    window.dispatchEvent(new Event('thump:reset'));
    b.textContent = 'Done. A fresh start.';
    b.dataset.sure = '';
  });

  // the page hides while in the headset
  world.visibilityState.subscribe((v) => {
    el.hidden = v !== VisibilityState.NonImmersive;
  });
}
