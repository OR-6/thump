#!/usr/bin/env node
/**
 * check:rules — competition hygiene, run before every deploy.
 *  1. No brand names in app code or the page (comments excluded).
 *  2. Audio files only in public/audio (CC0 recordings, credited in
 *     public/audio/CREDITS.md and rebuilt by tools/audio/build-audio.sh).
 *  3. No network APIs or external URLs in app code; built bundle only
 *     contains known library-embedded hosts.
 *  4. No ads / IAP / paywall code.
 *  5. Tagline ≤ 140 chars (submission.json).
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

let failures = 0;
const fail = (m) => { console.log('FAIL  ' + m); failures++; };
const pass = (m) => console.log('PASS  ' + m);

const walk = (d, out = []) => {
  if (!existsSync(d)) return out;
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
};
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1').replace(/<!--[\s\S]*?-->/g, '');
const appFiles = [...walk('src').filter((f) => /\.(ts|js)$/.test(f)), 'index.html'];
const code = Object.fromEntries(appFiles.map((f) => [f, stripComments(readFileSync(f, 'utf8'))]));

// 1. brands
const BRANDS = ['Meta', 'Quest', 'Oculus', 'Facebook', 'Instagram', 'WhatsApp', 'Apple', 'Vision Pro', 'Google', 'Android', 'Microsoft', 'Xbox', 'PlayStation', 'Sony', 'Nintendo', 'Steam', 'YouTube', 'Unity', 'Unreal', 'Logitech', 'Pico', 'Tiny Golf', 'Inkphony'];
const brandHits = [];
for (const [f, s] of Object.entries(code)) {
  // only user-visible string literals and HTML text
  const strings = f.endsWith('.html') ? [s.replace(/<[^>]+>/g, ' ')] : s.match(/(['"`])(?:\\.|(?!\1).)*\1/g) ?? [];
  for (const str of strings) for (const b of BRANDS) if (new RegExp(`\\b${b}\\b`).test(str)) brandHits.push(`${f}: ${b} in ${str.slice(0, 60)}`);
}
brandHits.length ? brandHits.forEach((h) => fail('brand string: ' + h)) : pass('no brand names in app strings');

// 2. audio files
const AUDIO = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.opus', '.webm'];
const audio = [...walk('public'), ...walk('dist')].filter((f) => AUDIO.includes(extname(f).toLowerCase()));
const stray = audio.filter((f) => !/^(public|dist)[\\/]audio[\\/]/.test(f));
stray.length ? stray.forEach((f) => fail('audio file outside public/audio: ' + f)) : pass(`audio only in public/audio (${audio.length} files)`);
existsSync('public/audio/CREDITS.md') ? pass('audio credits present') : fail('public/audio/CREDITS.md missing');

// 3. network — the only exception is opt-in co-op: PeerJS may be imported
// only by src/net/coop.ts, and only lazily (dynamic import).
const peerImports = Object.entries(code).filter(([, s]) => /from\s+['"]peerjs['"]|import\(\s*['"]peerjs['"]\s*\)/.test(s));
const badPeer = peerImports.filter(([f, s]) => f !== 'src/net/coop.ts' || /from\s+['"]peerjs['"]/.test(s));
badPeer.length
  ? badPeer.forEach(([f]) => fail('peerjs must be lazily imported only in src/net/coop.ts: ' + f))
  : pass('network only via opt-in co-op (peerjs lazily imported in src/net/coop.ts)');
const NET = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|RTCPeerConnection)\b\s*\(|new\s+(WebSocket|EventSource|XMLHttpRequest|RTCPeerConnection)\b|https?:\/\/(?!localhost|127\.0\.0\.1)[a-z0-9.-]+/gi;
const netHits = [];
for (const [f, s] of Object.entries(code))
  for (const m of s.matchAll(NET)) {
    // Same-origin fetch of the bundled CC0 samples (public/audio) is allowed.
    if (/synth\.ts$/.test(f) && m[0].startsWith('fetch') && s.startsWith('audioUrl(', (m.index ?? 0) + m[0].length)) continue;
    netHits.push(`${f}: ${m[0]}`);
  }
netHits.length ? netHits.forEach((h) => fail('network in app code: ' + h)) : pass('no network calls or external URLs in app code');
const LIB_HOSTS = new Set(['www.w3.org', 'json-schema.org', 'iwsdk.local', 'iwsdk.dev', 'unpkg.com', 'jcgt.org', 'cdn.jsdelivr.net', 'api.dicebear.com']);
if (existsSync('dist')) {
  const hosts = new Set();
  for (const f of walk('dist').filter((f) => /\.(js|html)$/.test(f))) {
    for (const m of readFileSync(f, 'utf8').matchAll(/https?:\/\/([a-zA-Z0-9.-]+)/g)) hosts.add(m[1]);
  }
  const unknown = [...hosts].filter((h) => !LIB_HOSTS.has(h));
  unknown.length ? unknown.forEach((h) => fail('unexpected host in build: ' + h)) : pass(`build hosts are known library strings only (${[...hosts].sort().join(', ')})`);
} else console.log('SKIP  dist/ not built');

// 4. monetisation
const MONEY = /\b(purchase|payment|paywall|subscription|in-app|iap|adsense|advert)/i;
const money = Object.entries(code).filter(([, s]) => MONEY.test(s)).map(([f]) => f);
money.length ? money.forEach((f) => fail('monetisation term in ' + f)) : pass('no ads, IAP or paywalls');

// 5. tagline
const sub = JSON.parse(readFileSync('submission.json', 'utf8'));
sub.tagline && sub.tagline.length <= 140 ? pass(`tagline ${sub.tagline.length}/140 chars`) : fail(`tagline length ${sub.tagline?.length}`);

console.log(failures ? `\ncheck:rules: ${failures} FAILURE(S)` : '\ncheck:rules: ALL PASS');
process.exit(failures ? 1 : 0);
