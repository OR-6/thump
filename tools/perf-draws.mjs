/** Draw calls and triangles per frame for each instrument, in the running emulator: npx @iwsdk/cli browser run tools/perf-draws.mjs (place the kit first). */
export default async function run({ page, frame }) {
  return await (frame ?? page).evaluate(async () => {
    const r = window.__thump.game;
    const ren = r.world.renderer;
    ren.info.autoReset = false;
    const out = {};
    for (const inst of ['drums', 'piano', 'congas', 'handpan', 'marimba', 'guitar']) {
      r.putOut(inst);
      if (inst === 'drums') { r.setShelf('pieces', 'full'); }
      await new Promise((f) => setTimeout(f, 800));
      ren.info.reset();
      const t0 = performance.now();
      let fr = 0;
      await new Promise((f) => { const s = () => { fr++; if (performance.now() - t0 < 1000) requestAnimationFrame(s); else f(); }; requestAnimationFrame(s); });
      out[inst] = { calls: Math.round(ren.info.render.calls / fr), tris: Math.round(ren.info.render.triangles / fr) };
    }
    ren.info.autoReset = true;
    r.putOut('drums');
    return out;
  });
}
