import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { searchSymbolsInPage, switchSymbolInPage } from '../extension/lib/chart-page.js';

class FakeKeyboardEvent extends Event {
  constructor(type, init) {
    super(type, init);
    this.key = init.key;
    this.keyCode = init.keyCode;
  }
}

// A small stand-in for the TradingView page. Like the real page, it reads the text only
// from an input event and closes the search box when Enter has a symbol to apply.
function fakePage({ hasButton = true, opensSearch = true, appliesEnter = true } = {}) {
  const input = new EventTarget();
  input.value = '';
  input.isConnected = true;
  input.matches = (selector) => selector === 'input[data-role="search"]';

  let typed = '';
  input.addEventListener('input', () => {
    typed = input.value;
  });
  const results = { applied: null };
  input.addEventListener('keydown', (event) => {
    if (!appliesEnter || event.keyCode !== 13 || !typed) return;
    results.applied = typed;
    input.isConnected = false;
  });

  const button = {
    click() {
      if (opensSearch) page.activeElement = input;
    },
  };
  const page = {
    activeElement: null,
    querySelector: (selector) =>
      hasButton && selector === '#header-toolbar-symbol-search' ? button : null,
  };
  return { page, results };
}

const realDocument = globalThis.document;
const realKeyboardEvent = globalThis.KeyboardEvent;
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.document = realDocument;
  globalThis.KeyboardEvent = realKeyboardEvent;
  globalThis.fetch = realFetch;
});

function install(page) {
  globalThis.document = page;
  globalThis.KeyboardEvent = FakeKeyboardEvent;
}

test('switchSymbolInPage applies the full symbol and reports success', async () => {
  const { page, results } = fakePage();
  install(page);
  assert.equal(await switchSymbolInPage('TWSE:2330'), true);
  assert.equal(results.applied, 'TWSE:2330');
});

test('switchSymbolInPage returns false if the page has no search button', async () => {
  install(fakePage({ hasButton: false }).page);
  assert.equal(await switchSymbolInPage('TWSE:2330'), false);
});

test('switchSymbolInPage returns false if the search box does not open', async () => {
  install(fakePage({ opensSearch: false }).page);
  assert.equal(await switchSymbolInPage('TWSE:2330'), false);
});

test('switchSymbolInPage returns false if the search box stays open', async () => {
  install(fakePage({ appliesEnter: false }).page);
  assert.equal(await switchSymbolInPage('TWSE:2330'), false);
});

test('switchSymbolInPage still works when only its source text is copied', async () => {
  const { page, results } = fakePage();
  install(page);
  const copy = new Function(`return (${switchSymbolInPage.toString()})`)();
  assert.equal(await copy('NASDAQ:NVDA'), true);
  assert.equal(results.applied, 'NASDAQ:NVDA');
});

test('searchSymbolsInPage asks for names in the panel language and reports a timeout as timeout', async () => {
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(new URL(url));
    return { ok: true, json: async () => ({ symbols: [] }) };
  };
  assert.deepEqual(await searchSymbolsInPage('sui', '', 'en'), { json: { symbols: [] } });
  assert.equal(urls[0].searchParams.get('lang'), 'en');
  await searchSymbolsInPage('sui', 'crypto');
  assert.equal(urls[1].searchParams.get('lang'), 'zh_TW');
  assert.equal(urls[1].searchParams.get('search_type'), 'crypto');

  globalThis.fetch = async () => {
    throw Object.assign(new Error('signal timed out'), { name: 'TimeoutError' });
  };
  assert.deepEqual(await searchSymbolsInPage('sui', ''), { error: 'timeout' });
});
