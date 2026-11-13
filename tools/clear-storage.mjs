// Clears this origin's localStorage (fresh first-run state for E2E). The page is about to be
// reloaded: block its further writes too, or a save in the gap (a loom pose, a timer) undoes the clear.
export default async function run({ page, frame }) {
  return await (frame ?? page).evaluate(() => {
    try {
      localStorage.clear();
      // (seed scripts that write right after this use window.__realSetItem)
      window.__realSetItem ??= Storage.prototype.setItem;
      Storage.prototype.setItem = () => {};
      history.replaceState(null, '', location.pathname + location.search);
      return 'cleared';
    } catch (e) {
      return String(e);
    }
  });
}
