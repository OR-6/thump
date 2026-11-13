// Draws the video's cards (title, end, a caption per shot, feature chips) as 1920x1080 PNGs with
// transparency, in the module's look, into artifacts/video-cards/. Run: npx @iwsdk/cli browser run tools/video-cards.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
export default async function run({ page, frame }) {
  const res = await (frame ?? page).evaluate(() => {
    const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
    const W = 1920;
    const H = 1080;
    const out = {};
    const make = (name, draw) => {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const g = c.getContext('2d');
      draw(g);
      out[name] = c.toDataURL('image/png');
    };
    const full = (title, sub) => (g) => {
      g.fillStyle = '#0d0d0f';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#f2efe6';
      g.font = `700 180px ${FONT}`;
      g.fillText(title, (W - g.measureText(title).width) / 2, 560);
      g.font = `500 64px ${FONT}`;
      g.fillStyle = '#c9c5bb';
      g.fillText(sub, (W - g.measureText(sub).width) / 2, 680);
      g.fillStyle = '#ff5a3c';
      g.fillRect(W / 2 - 60, 720, 120, 8);
    };
    make('00-title', full('Thump', 'Play your room.'));
    make('99-end', full('or-6.github.io/thump', 'Open it in your Quest browser'));
    const caption = (text) => (g) => {
      g.font = `600 64px ${FONT}`;
      const w = g.measureText(text).width + 100;
      const x = (W - w) / 2;
      const y = H - 190;
      g.fillStyle = 'rgba(12,12,14,0.82)';
      g.beginPath();
      g.roundRect(x, y, w, 110, 18);
      g.fill();
      g.fillStyle = '#ff5a3c';
      g.fillRect(x + 28, y + 34, 8, 42);
      g.fillStyle = '#f2efe6';
      g.fillText(text, x + 60, y + 76);
    };
    const caps = {
      '01-instrument': 'Every surface is an instrument.',
      '02-hit': 'Hit something.',
      '03-kit': 'Your table is a drum kit.',
      '04-wall': 'Your wall, a gong. Your window, keys.',
      '05-song': 'Songs cast onto your room.',
      '06-jam': 'A bandmate that listens.',
      '07-phone': "A friend's phone is the bass.",
      '08-remember': 'Your room remembers.',
      '09-hands': 'Made for every pair of hands.',
    };
    for (const [k, v] of Object.entries(caps)) make(k, caption(v));
    const chip = (text) => (g) => {
      g.font = `600 40px ${FONT}`;
      const w = g.measureText(text).width + 60;
      g.fillStyle = 'rgba(12,12,14,0.8)';
      g.beginPath();
      g.roundRect(W - w - 60, 60, w, 70, 35);
      g.fill();
      g.fillStyle = '#f2efe6';
      g.fillText(text, W - w - 30, 108);
    };
    for (const [k, v] of Object.entries({ 'f-hands': 'Hand tracking', 'f-plane': 'Plane detection', 'f-scene': 'Scene understanding', 'f-passthrough': 'Passthrough', 'f-anchor': 'Persistent anchors' })) make(k, chip(v));
    return out;
  });
  mkdirSync('artifacts/video-cards', { recursive: true });
  for (const [name, url] of Object.entries(res)) writeFileSync(`artifacts/video-cards/${name}.png`, Buffer.from(url.split(',')[1], 'base64'));
  return Object.keys(res);
}
