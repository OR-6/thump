/**
 * The phone side of the jam: a friend opens the page on a phone, types the headset's 4-letter code,
 * and the phone becomes the bass. Three felt pads (the root big in the middle, the fifth and the
 * octave either side) and a light that pulses on the beat. The sound comes from the headset.
 */
import { coop, normaliseCode, type CoopStatus } from '../net/coop.js';
import { validToPhone, type JamFromPhone } from './protocol.js';

export function mountPhoneJam(host: HTMLElement): void {
  const box = document.createElement('section');
  box.className = 'jam';
  box.innerHTML = `
    <h2>Got a code from a friend's headset?</h2>
    <p class="jam-lede">Your phone plays the bass. When they tap JAM, type the 4 letters on their drum module.</p>
    <form class="jam-join">
      <input id="jam-code" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="CODE" aria-label="Headset code" />
      <button class="patch small" type="submit">Join</button>
    </form>
    <p class="jam-status" role="status"></p>
    <div class="jam-pads" hidden>
      <div class="jam-light" aria-hidden="true"></div>
      <p class="jam-song"></p>
      <div class="jam-row">
        <button type="button" class="jam-pad small" data-n="1" aria-label="Bass, fifth">5</button>
        <button type="button" class="jam-pad big" data-n="0" aria-label="Bass, root">Bass</button>
        <button type="button" class="jam-pad small" data-n="2" aria-label="Bass, octave">8</button>
      </div>
      <button type="button" class="link jam-leave">Leave the jam</button>
    </div>`;
  host.appendChild(box);
  const form = box.querySelector<HTMLFormElement>('.jam-join')!;
  const input = box.querySelector<HTMLInputElement>('#jam-code')!;
  const status = box.querySelector<HTMLElement>('.jam-status')!;
  const pads = box.querySelector<HTMLElement>('.jam-pads')!;
  const light = box.querySelector<HTMLElement>('.jam-light')!;
  const song = box.querySelector<HTMLElement>('.jam-song')!;
  const fromLink = normaliseCode(new URLSearchParams(location.search).get('jam') ?? '');
  if (fromLink) input.value = fromLink;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = normaliseCode(input.value);
    if (!code) {
      status.textContent = 'Type the 4 letters on their drum module';
      return;
    }
    void coop.join(code, 'caller');
  });
  const send = (m: JamFromPhone) => coop.transport?.send(m);
  for (const b of box.querySelectorAll<HTMLButtonElement>('.jam-pad')) {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const n = Number(b.dataset.n) as 0 | 1 | 2;
      // harder on the middle of the pad, softer at its edge: a little dynamics from a flat screen
      const r = b.getBoundingClientRect();
      const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) / (r.width / 2);
      send({ k: 'note', n, v: Math.max(0.5, Math.min(1, 1.05 - d * 0.5)) });
      b.classList.add('hit');
      window.setTimeout(() => b.classList.remove('hit'), 90);
      navigator.vibrate?.(12);
    });
  }
  box.querySelector<HTMLButtonElement>('.jam-leave')!.addEventListener('click', () => coop.leave());
  let wired = false;
  window.addEventListener('thump:coop', (e) => {
    const s = (e as CustomEvent<CoopStatus>).detail;
    if (s.role !== 'caller' && s.state !== 'error' && s.state !== 'closed' && s.state !== 'idle') return;
    status.textContent = s.state === 'connected' ? 'You are the bass. Tap in time with the light.' : (s.message ?? '');
    const on = s.state === 'connected';
    pads.hidden = !on;
    form.hidden = on;
    if (on && !wired && coop.transport) {
      wired = true;
      coop.transport.onMessage((m) => {
        if (!validToPhone(m)) return;
        if (m.k === 'beat') {
          song.textContent = m.song;
          light.classList.remove('pulse');
          void light.offsetWidth; // restart the pulse animation
          light.classList.add('pulse');
        } else if (m.k === 'rest') song.textContent = 'Waiting for the next song';
      });
    }
    if (!on) wired = false;
  });
}
