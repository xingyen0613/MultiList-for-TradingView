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

// Runs inside a TradingView tab, because TradingView search answers only requests from its own pages.
// chrome.scripting copies only this function into the page. lang is the language of the names, zh_TW or en.
export async function searchSymbolsInPage(text, searchType, lang = 'zh_TW') {
  const url = new URL('https://symbol-search.tradingview.com/symbol_search/v3/');
  const params = { text, hl: '1', exchange: '', lang, search_type: searchType, domain: 'production' };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  try {
    const response = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(8000) });
    if (!response.ok) return { error: `HTTP ${response.status}` };
    return { json: await response.json() };
  } catch (error) {
    return { error: error.name === 'TimeoutError' ? 'timeout' : error.message };
  }
}

// Runs inside a TradingView tab, so the request has the TradingView sign-in of the user.
// The extension never sees the password or the cookie. A timeout comes back as the error 'timeout'.
export async function readWatchlistsInPage() {
  try {
    const response = await fetch(`${location.origin}/api/v1/symbols_list/custom/`, {
      credentials: 'include',
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return { error: `HTTP ${response.status}` };
    return { lists: await response.json() };
  } catch (error) {
    return { error: error.name === 'TimeoutError' ? 'timeout' : error.message };
  }
}
