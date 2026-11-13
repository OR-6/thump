/**
 * The 2D page shown outside the headset: the hook, one button to enter mixed reality, and the
 * settings folded away (DESIGN.md §3.15). On a laptop or phone it says how to play on a Quest instead.
 */
import { VisibilityState, type World } from '@iwsdk/core';
import { audio, type Voice } from '../audio/engine.js';
import { soundById } from '../audio/bank.js';
import { loadSettings, saveSettings, type Settings } from '../persistence/settings.js';
import { loadProgress, saveProgress, freshProgress } from '../persistence/progress.js';
import { mountPhoneJam } from '../jam/phone.js';

const LIVE_URL = 'or-6.github.io/thump';

export function mountLanding(world: World): void {
  const el = document.createElement('div');
  el.id = 'landing';
  el.innerHTML = `
    <main class="rig">
      <section class="sampler" aria-label="Thump">
        <header class="top">
          <span class="brand">THUMP</span>
          <span class="model">DESK SAMPLER · 28 SOUNDS</span>
        </header>
        <div class="lcd" aria-live="polite"><span class="lcd-main">YOUR DESK IS A DRUM MACHINE</span><span class="lcd-sub">tap a pad</span></div>
        <div class="pads" role="group" aria-label="Try the sounds">
          <button class="pad" data-s="kick" style="--c:#ff5a3c"><i>DESK LEFT</i></button>
          <button class="pad" data-s="snare" style="--c:#f4f1ea"><i>DESK MIDDLE</i></button>
          <button class="pad" data-s="hat" style="--c:#2ad1d1"><i>DESK RIGHT</i></button>
          <button class="pad" data-s="bell" style="--c:#9ef0e0"><i>MUG</i></button>
          <button class="pad" data-s="block" style="--c:#ff8a3c"><i>BOOK</i></button>
          <button class="pad" data-s="chime" style="--c:#b8c4ff"><i>BOTTLE</i></button>
          <button class="pad" data-s="keys" style="--c:#ffa630"><i>KEYBOARD</i></button>
          <button class="pad" data-s="ride" style="--c:#d6e2ea"><i>LAPTOP LID</i></button>
          <button class="pad" data-s="congas" style="--c:#ff7aa2"><i>KNEE</i></button>
          <button class="pad" data-s="cowbell" style="--c:#e0b85a"><i>CHAIR ARM</i></button>
          <button class="pad" data-s="clave" style="--c:#d99a5b"><i>PHONE</i></button>
          <button class="pad" data-s="clap" style="--c:#ff9e7a"><i>HANDS</i></button>
        </div>
        <div class="go">
          <button id="enter-xr" class="power" type="button"><span class="led"></span>Enter mixed reality</button>
          <p class="xr-fail" role="alert" hidden>It didn't start. Say yes to Quest's prompts and try again.</p>
        </div>
        <div class="nohead" id="xr-unsupported" hidden>
          <p class="quest">It plays on a Meta Quest 3. In its browser, go to <span class="url">${LIVE_URL}</span></p>
          <button type="button" id="copy-link" class="power small">Copy the link</button>
        </div>
      </section>
      <section class="manual">
        <p>Sit at your desk with a Quest 3 on. Hit the desk and it's a kit. Hit your mug and it rings. Every thing in reach plays the first time you hit it, and you pick its sound.</p>
        <p>Then build a track on your stuff, one part at a time, and play it live.</p>
        <p class="note">Put the controllers down: it's hands only. Quest asks once for permission to see your desk; nothing leaves the headset.</p>
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
  // the pads on the page play the real sounds (the same clips the headset uses)
  const lcdMain = el.querySelector<HTMLElement>('.lcd-main')!;
  const lcdSub = el.querySelector<HTMLElement>('.lcd-sub')!;
  for (const pad of el.querySelectorAll<HTMLButtonElement>('.pad')) {
    pad.addEventListener('pointerdown', () => {
      audio.resume();
      const snd = soundById(pad.dataset.s);
      if (!snd) return;
      if (snd.drum) audio.drum(snd.drum as Voice, 0.85, 0);
      else if (snd.family) audio.modal(snd.family, snd.pitched ? 67 : 60, 0.85, 0, 0, 0.5, 'page');
      pad.classList.remove('hit');
      void pad.offsetWidth;
      pad.classList.add('hit');
      lcdMain.textContent = `${pad.querySelector('i')!.textContent} · ${snd.name.toUpperCase()}`;
      lcdSub.textContent = 'your real one plays this';
    });
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
