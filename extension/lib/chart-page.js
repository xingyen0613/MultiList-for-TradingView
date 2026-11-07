// Runs inside the TradingView tab and uses the symbol search of the page, so the page
// does not reload and keeps indicators that are not saved. Returns false if the page
// does not respond as expected. chrome.scripting copies only this function into the
// page, so the function must not use anything outside itself.
export async function switchSymbolInPage(symbolId) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitFor = async (find, timeoutMs) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = find();
      if (found) return found;
      await sleep(30);
    }
    return null;
  };

  const button = document.querySelector('#header-toolbar-symbol-search');
  if (!button) return false;
  button.click();

  const input = await waitFor(() => {
    const active = document.activeElement;
    return active?.matches?.('input[data-role="search"]') ? active : null;
  }, 1500);
  if (!input) return false;

  input.value = symbolId;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(150);
  input.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    }),
  );

  // The search box closes when the page accepts the symbol. The chart data can come much later.
  return Boolean(await waitFor(() => !input.isConnected, 5000));
}
