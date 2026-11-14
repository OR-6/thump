// Composes the key art, icons and OG card from the renders tools/keyart-batch.mjs leaves in artifacts/ (ka-icon.png, ka-wide.png), then
// writes artifacts/render-jobs.json for tools/render-html.mjs; tools/keyart-export.sh copies the results into public/. node tools/keyart-compose.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { stampSvg, MONOGRAM } from '../src/ui/brand.ts';

const b64 = (p) => `data:image/png;base64,${readFileSync(p).toString('base64')}`;
const fx = (n) => b64(`public/fx/${n}.png`);
const page = (body, w, h) => `<!doctype html><html><head><style>html,body{margin:0;background:transparent}*{box-sizing:border-box}
  .tex{position:absolute;mix-blend-mode:screen;-webkit-mask-size:contain;-webkit-mask-repeat:no-repeat;-webkit-mask-position:center}
  .abs{position:absolute}</style></head><body><div style="position:relative;width:${w}px;height:${h}px;overflow:hidden">${body}</div></body></html>`;

/** A Kenney texture, tinted, at (x, y) centre with size s. */
const tex = (name, x, y, s, color, op = 1, rot = 0, sy = 1) =>
  `<div class="tex" style="left:${x - s / 2}px;top:${y - (s * sy) / 2}px;width:${s}px;height:${s * sy}px;background:${color};opacity:${op};-webkit-mask-image:url(${fx(name)});transform:rotate(${rot}deg)"></div>`;

/**
 * The hit: a flash on the head, rings spreading off it in the head's perspective (amber, then orange, then magenta
 * at the edge), streaks of light thrown up and out, and sparks. (cx, cy) the head's centre, (rx, ry) its radii.
 */
function burst(W, H, cx, cy, rx, ry, seed = 3, scale = 1) {
  let rnd = seed;
  const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
  const rings = [
    [1.08, '#ffb347', 9, 0.95],
    [1.32, '#ff9a3c', 6, 0.8],
    [1.62, '#ff3ea5', 4, 0.6],
    [1.98, '#ff3ea5', 2.5, 0.32],
  ];
  let s = `<svg class="abs" style="left:0;top:0" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>
    <filter id="bl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${10 * scale}"/></filter>
    <filter id="bl2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${3 * scale}"/></filter>
    <radialGradient id="fl" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#fffbe6" stop-opacity="1"/><stop offset="0.35" stop-color="#ffd27a" stop-opacity="0.85"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>
    <linearGradient id="st" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff6d8" stop-opacity="0.95"/><stop offset="1" stop-color="#ff9a3c" stop-opacity="0"/></linearGradient></defs>`;
  // the flash on the head
  // the head in shade toward its rim, the flash where it was struck, and three ripples across it
  s += `<defs><radialGradient id="hd" cx="0.5" cy="0.5" r="0.5"><stop offset="0.55" stop-color="#3a1f5c" stop-opacity="0"/><stop offset="1" stop-color="#3a1f5c" stop-opacity="0.45"/></radialGradient></defs>`;
  s += `<ellipse cx="${cx}" cy="${cy}" rx="${rx * 0.97}" ry="${ry * 0.97}" fill="url(#hd)" style="mix-blend-mode:multiply"/>`;
  s += `<ellipse cx="${cx + rx * 0.08}" cy="${cy}" rx="${rx * 0.5}" ry="${ry * 0.5}" fill="url(#fl)" style="mix-blend-mode:screen"/>`;
  for (const [k, op] of [[0.32, 0.9], [0.56, 0.7], [0.8, 0.5]]) s += `<ellipse cx="${cx + rx * 0.08}" cy="${cy}" rx="${rx * k}" ry="${ry * k}" fill="none" stroke="#ff9a3c" stroke-width="${3 * scale}" opacity="${op}" style="mix-blend-mode:screen"/>`;
  // rings: a blurred glow under a sharp line, lifting a little as they spread
  rings.forEach(([k, c, sw, op], i) => {
    const y = cy - ry * 0.25 * i;
    s += `<ellipse cx="${cx}" cy="${y}" rx="${rx * k}" ry="${ry * k}" fill="none" stroke="${c}" stroke-width="${sw * 3 * scale}" opacity="${op * 0.7}" filter="url(#bl)" style="mix-blend-mode:screen"/>`;
    s += `<ellipse cx="${cx}" cy="${y}" rx="${rx * k}" ry="${ry * k}" fill="none" stroke="${c}" stroke-width="${sw * scale}" opacity="${op}" style="mix-blend-mode:screen"/>`;
  });
  // streaks thrown up off the rim
  for (let i = 0; i < 16; i++) {
    const a = Math.PI * (0.06 + 0.88 * (i / 15)) + (rand() - 0.5) * 0.12;
    const px = cx - Math.cos(a) * rx * (0.75 + rand() * 0.35);
    const py = cy - Math.sin(a) * ry * (0.6 + rand() * 0.3);
    const len = (90 + rand() * 210) * scale;
    const dx = -Math.cos(a) * 0.55;
    const ang = (Math.atan2(-1, dx) * 180) / Math.PI + 90;
    const wd = (3 + rand() * 6) * scale;
    s += `<g transform="translate(${px} ${py}) rotate(${ang})" style="mix-blend-mode:screen"><path d="M ${-wd / 2} 0 L 0 ${-len} L ${wd / 2} 0 Z" fill="url(#st)" opacity="${0.55 + rand() * 0.45}"/></g>`;
  }
  // sparks
  for (let i = 0; i < 26; i++) {
    const a = Math.PI * rand();
    const d = 0.9 + rand() * 1.1;
    const px = cx - Math.cos(a) * rx * d;
    const py = cy - Math.sin(a) * ry * d - rand() * 160 * scale;
    const r = (1.5 + rand() * 3.5) * scale;
    const c = ['#fff6d8', '#ffb347', '#ff9a3c', '#ff3ea5'][Math.floor(rand() * 4)];
    s += `<circle cx="${px}" cy="${py}" r="${r * 2.2}" fill="${c}" opacity="0.5" filter="url(#bl2)" style="mix-blend-mode:screen"/><circle cx="${px}" cy="${py}" r="${r}" fill="${c}" style="mix-blend-mode:screen"/>`;
  }
  return s + '</svg>';
}

/** The stage behind the instruments: plum, a warm pool where the hit is, a darker floor. */
const stage = (W, H, cx, cy, k = 1) =>
  `<div class="abs" style="inset:0;background:linear-gradient(180deg,#241046 0%,#1a0d38 70%,#12082a 100%)"></div>
   <div class="abs" style="left:${cx - 700 * k}px;top:${cy - 520 * k}px;width:${1400 * k}px;height:${1040 * k}px;background:radial-gradient(closest-side,rgba(255,179,71,.38),rgba(255,62,165,.12) 55%,rgba(26,13,56,0))"></div>`;

const jobs = [];
const mode = process.argv[2] ?? 'all';

// 1. the app icon: the snare mid-hit, close and low, THUMP stamped across the bottom
{
  const W = 1024;
  const k = 0.7; // the render (1600) at 1120 px
  const ox = -20, oy = -40;
  const cx = ox + 576 * k, cy = oy + 636 * k, rx = 566 * k, ry = 132 * k;
  const body = `${stage(W, W, cx, cy, 0.9)}
    <img class="abs" src="${b64('artifacts/ka-icon.png')}" style="left:${ox}px;top:${oy}px;width:${1600 * k}px">
    ${tex('light_01', cx + 40, cy - 10, 900, '#ffb347', 0.55, 0, 0.45)}
    ${burst(W, W, cx, cy, rx, ry, 7, 1)}
    ${tex('star_06', cx + 70, cy - 8, 300, '#fff6d8', 0.95)}
    <div class="abs" style="inset:0;background:radial-gradient(120% 100% at 50% 40%,rgba(0,0,0,0) 55%,rgba(10,4,24,.55) 100%)"></div>
    <div class="abs" style="left:30px;right:42px;bottom:40px;transform:rotate(-4deg)">${stampSvg('ic', undefined, { depth: 8 })}</div>`;
  jobs.push({ w: W, h: W, out: 'artifacts/icon-art.png', html: page(body, W, W) });
}

// 2. the small icon: a stamped T on a hoop of light (it has to read at 16 to 32 px)
{
  const W = 512;
  const body = `<div class="abs" style="inset:0;border-radius:112px;overflow:hidden;background:linear-gradient(180deg,#2a124f,#1a0d38)">
    <svg class="abs" style="inset:0" width="512" height="512" viewBox="0 0 512 512"><defs><filter id="g" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="14"/></filter>
      <linearGradient id="h" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb347"/><stop offset="0.5" stop-color="#ff9a3c"/><stop offset="1" stop-color="#ff3ea5"/></linearGradient></defs>
      <ellipse cx="270" cy="300" rx="196" ry="150" fill="none" stroke="url(#h)" stroke-width="42" filter="url(#g)" opacity="0.8"/>
      <ellipse cx="270" cy="300" rx="196" ry="150" fill="none" stroke="url(#h)" stroke-width="26"/></svg>
    <div class="abs" style="left:96px;top:58px;width:330px">${stampSvg('fv', MONOGRAM, { depth: 9 })}</div></div>`;
  jobs.push({ w: W, h: W, out: 'artifacts/icon-t.png', transparent: true, html: page(body, W, W) });
}

// 3. the key art for the page's hero: the whole kit low, the snare hit (no words: the page sets those)
{
  const W = 2400, H = 1350;
  // the kit render placed right; its snare head (measured in the 2400 render)
  const ox = 540, oy = 150, k = 0.85;
  const cx = ox + 756 * k, cy = oy + 592 * k, rx = 296 * k, ry = 50 * k;
  const body = `${stage(W, H, cx, cy, 1.3)}
    <img class="abs" src="${b64('artifacts/ka-wide.png')}" style="left:${ox}px;top:${oy}px;width:${2400 * k}px">
    ${tex('light_01', cx + 20, cy - 10, 1100, '#ffb347', 0.45, 0, 0.4)}
    ${burst(W, H, cx, cy, rx, ry, 11, 1)}
    ${tex('star_06', cx + 40, cy - 6, 260, '#fff6d8', 0.95)}`;
  jobs.push({ w: W, h: H, out: 'artifacts/keyart.png', html: page(body, W, H) });
}

// 4. the Open Graph card: the key art, the stamped wordmark, the line
{
  const W = 1200, H = 630;
  const body = `<div class="abs" style="inset:0;background:linear-gradient(180deg,#241046 0%,#1a0d38 70%,#12082a 100%)"></div><img class="abs" src="${b64('artifacts/keyart.png')}" style="left:150px;top:-30px;width:1300px;-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 22%)">
    <div class="abs" style="inset:0;background:linear-gradient(90deg,rgba(26,13,56,.95) 0%,rgba(26,13,56,.75) 36%,rgba(26,13,56,0) 54%)"></div>
    <div class="abs" style="left:56px;top:120px;width:560px;transform:rotate(-4deg);transform-origin:left center">${stampSvg('og', undefined, { depth: 8 })}</div>
    <div class="abs" style="left:64px;top:330px;width:520px;color:#fbf7ff;font:italic 800 54px/1 'Barlow Semi Condensed',system-ui,sans-serif">A band on your desk.</div>
    <div class="abs" style="left:64px;top:402px;width:470px;color:#d9d0f0;font:500 25px/1.35 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">Drums, keys, guitar and more, played with your hands in mixed reality on Meta Quest. In the browser.</div>`;
  jobs.push({ w: W, h: H, out: 'artifacts/og.png', html: page(body, W, H).replace('<head>', `<head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:ital,wght@1,800&display=block">`) });
}

// the favicon as SVG: the same hoop and stamped T
writeFileSync('public/favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512"><title>Thump</title><defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a124f"/><stop offset="1" stop-color="#1a0d38"/></linearGradient><linearGradient id="h" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb347"/><stop offset="0.5" stop-color="#ff9a3c"/><stop offset="1" stop-color="#ff3ea5"/></linearGradient></defs><rect width="512" height="512" rx="112" fill="url(#bg)"/><ellipse cx="270" cy="300" rx="196" ry="150" fill="none" stroke="url(#h)" stroke-width="30"/>${stampSvg('fv', MONOGRAM, { depth: 9, label: '' }).replace(/^<svg class="stamp" (viewBox="[^"]+") aria-hidden="true">/, '<svg x="96" y="58" width="330" height="344" $1>')}</svg>\n`);

writeFileSync('artifacts/render-jobs.json', JSON.stringify(mode === 'all' ? jobs : jobs.filter((j) => j.out.includes(mode))));
console.log(jobs.map((j) => j.out).join(' '));
