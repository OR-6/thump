// How many recorded clips the running app has loaded, and which families can play from them (E2E).
export default async function run({ page, frame }) {
  return await (frame ?? page).evaluate(() => {
    const a = window.__thump?.audio;
    if (!a) return null;
    const fams = ['marimba', 'glock', 'gong', 'timpani', 'harp', 'kit:snare', 'kit:kick', 'congas', 'tongue', 'bowl'];
    return { loaded: a.sampler.loaded, ready: fams.filter((f) => a.sampler.has(f)) };
  });
}
