// After a reload, saving must work again. If the clear-storage block survived (the reload didn't really
// happen), lift it so a test's saves stick (E2E helper).
export default async function run({ page, frame }) {
  return await (frame ?? page).evaluate(() => {
    const real = window.__realSetItem;
    if (!real) return 'fresh';
    Storage.prototype.setItem = real;
    delete window.__realSetItem;
    return 'unblocked';
  });
}
