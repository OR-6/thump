// Key art from the game's own models: renders the drum kit with the game's renderer settings into a separate,
// transparent canvas from a low, close camera, with warm and magenta rim lights. Reads artifacts/keyart-cfg.json:
// { inst, w, h, fov, eye:[x,y,z], at:[x,y,z] (kit-local, metres from the snare), hit, out, hide:[...] }.
// Run: npx @iwsdk/cli browser run tools/keyart.mjs
import { readFileSync, writeFileSync } from 'node:fs';
export default async function run({ page, frame }) {
  const cfg = JSON.parse(readFileSync('artifacts/keyart-cfg.json', 'utf8'));
  const f = frame ?? page;
  const res = await f.evaluate(async (cfg) => {
    const T = window.__thump;
    const r = T.game;
    const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
    if (r.kit.inst !== cfg.inst) {
      r.putOut(cfg.inst);
      await wait(2500);
    }
    // every drum and cymbal out
    for (const [, p] of r.kit.pads) p.appear?.('fade');
    await wait(900);
    const snare = r.kit.pads.get(cfg.focus ?? 'snare');
    const S = snare.group.getWorldPosition(snare.group.position.clone());
    const kitQ = r.kit.root.getWorldQuaternion(r.kit.root.quaternion.clone());
    const V = S.constructor;
    const local = (a) => new V(a[0], a[1], a[2]).applyQuaternion(kitQ).add(S);
    const R0 = r.renderer;
    const R = new R0.constructor({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    R.setPixelRatio(1);
    R.setSize(cfg.w, cfg.h, false);
    R.toneMapping = R0.toneMapping;
    R.toneMappingExposure = cfg.exposure ?? R0.toneMappingExposure;
    R.outputColorSpace = R0.outputColorSpace;
    R.shadowMap.enabled = true;
    R.shadowMap.type = R0.shadowMap.type;
    R.setClearColor(0x000000, 0);
    const cam = r.camera.clone();
    cam.fov = cfg.fov ?? 30;
    cam.aspect = cfg.w / cfg.h;
    cam.near = 0.01;
    cam.far = 20;
    cam.position.copy(local(cfg.eye));
    cam.up.set(0, 1, 0);
    cam.lookAt(local(cfg.at));
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    // rim lights: clones of the kit's own key light, warm from behind left, magenta from behind right
    const key = [];
    r.scene.traverse((o) => o.isDirectionalLight && key.push(o));
    const added = [];
    for (const [pos, color, k] of cfg.rims ?? []) {
      const L = key[0].clone();
      L.castShadow = false;
      L.color.set(color);
      L.intensity = k;
      L.position.copy(local(pos));
      L.target = snare.group;
      r.scene.add(L);
      added.push(L);
    }
    // hide what isn't the instrument (the panel, hands, other bits by name match)
    const hidden = [];
    const hideObj = (o) => { if (o && o.visible) { o.visible = false; hidden.push(o); } };
    // only the instrument (and the lights) stay: everything off its path to the scene's root is hidden
    const keep = new Set((cfg.keep ?? ['kit.padRoot']).map((k) => k.split('.').reduce((o, p) => o?.[p], r)).filter(Boolean));
    const anc = new Set();
    for (const k of keep) for (let o = k.parent; o; o = o.parent) anc.add(o);
    const walk = (o) => {
      for (const c of o.children) {
        if (keep.has(c) || c.isLight || added.includes(c)) continue;
        if (anc.has(c)) walk(c);
        else hideObj(c);
      }
    };
    walk(r.scene);
    for (const k of cfg.hideLanes ?? []) hideObj(r.kit.pads.get(k)?.group);
    // a studio for reflections (the scene's own environment belongs to the other renderer): dark plum, two big
    // soft boxes overhead, a warm strip at the left and a magenta strip at the right, as an equirect the new
    // renderer prefilters itself
    let Tex = null;
    r.scene.traverse((o) => { if (!Tex && o.material?.map) Tex = o.material.map.constructor; });
    const ec = document.createElement('canvas');
    ec.width = 1024; ec.height = 512;
    const g = ec.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, 512);
    bg.addColorStop(0, '#3a2468'); bg.addColorStop(0.5, '#1a0d38'); bg.addColorStop(1, '#0c0618');
    g.fillStyle = bg; g.fillRect(0, 0, 1024, 512);
    g.fillStyle = '#fff6ea'; g.fillRect(380, 40, 260, 90); g.fillRect(100, 70, 140, 60);
    g.fillStyle = '#ffb347'; g.fillRect(150, 150, 70, 170);
    g.fillStyle = '#ff3ea5'; g.fillRect(760, 150, 60, 170);
    g.fillStyle = '#ff9a3c'; g.fillRect(560, 210, 40, 90);
    const env = new Tex(ec);
    env.mapping = 303; // EquirectangularReflectionMapping
    env.colorSpace = 'srgb';
    env.needsUpdate = true;
    const env0 = r.scene.environment;
    const envI0 = r.scene.environmentIntensity;
    r.scene.environment = env;
    r.scene.environmentIntensity = cfg.envIntensity ?? 1.4;
    if (cfg.hit) for (const l of cfg.hit) r.kit.pads.get(l)?.hit?.(1);
    await wait(cfg.hitWait ?? 60);
    R.render(r.scene, cam);
    const url = R.domElement.toDataURL('image/png');
    r.scene.environment = env0;
    r.scene.environmentIntensity = envI0;
    env.dispose();
    for (const o of hidden) o.visible = true;
    for (const L of added) r.scene.remove(L);
    R.dispose();
    return url;
  }, cfg);
  writeFileSync(cfg.out, Buffer.from(res.split(',')[1], 'base64'));
  return cfg.out;
}
