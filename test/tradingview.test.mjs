import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { setLanguage } from '../extension/lib/i18n.js';
import { isSignedOut, parseSearch, watchlistsToTabs } from '../extension/lib/tradingview.js';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));

test('parseSearch reads a real TradingView search for "sui"', () => {
  const results = parseSearch(fixture('tv-search-sui'));
  const byId = new Map(results.map((item) => [item.id, item]));

  assert.deepEqual(byId.get('BINANCE:SUIUSDT'), {
    id: 'BINANCE:SUIUSDT',
    ticker: 'SUIUSDT',
    name: 'SUI / TetherUS',
    exchange: 'Binance',
    kind: '現貨',
    quoted: true,
  });
  assert.equal(byId.get('BINANCE:SUIUSDT.P').kind, '永續合約');
  assert.equal(byId.get('BINANCE:SUIUSDT.P').quoted, true);
  // A result without a prefix uses its source id.
  assert.equal(byId.get('OKX:SUIUSDT.P').quoted, true);
  assert.equal(byId.get('CRYPTOCAP:SUI').quoted, false);
  assert.equal(byId.get('NYSE:SUI').kind, '股票');
  assert.equal(byId.get('NYSE:SUI').quoted, true);
  // This futures result lists only dated contracts, so it opens the first one.
  assert.equal(byId.get('COINBASE:SUIX2026').kind, '期貨');
  // The search marks the typed text with <em>, and the same symbol can come twice.
  assert.equal(results.filter((item) => item.id === 'CRYPTOCAP:SUI').length, 1);
  assert.equal(results.some((item) => /<\/?em>/.test(item.id + item.name)), false);
});

test('parseSearch opens the continuous contract of a futures result', () => {
  const futures = {
    symbol: '<em>SUI</em>',
    source_id: 'CME',
    type: 'futures',
    contracts: [
      { symbol: '<em>SUI</em>X2026', typespecs: [] },
      { symbol: '<em>SUI</em>1!', typespecs: ['continuous', 'synthetic'] },
    ],
  };
  assert.equal(parseSearch({ symbols: [futures] })[0].id, 'CME:SUI1!');
});

test('parseSearch accepts an empty or broken answer', () => {
  assert.deepEqual(parseSearch({}), []);
  assert.deepEqual(parseSearch(null), []);
  assert.deepEqual(parseSearch({ symbols: [{ type: 'stock' }] }), []);
});

test('a signed-out user gets the sample list, which has no id', () => {
  const sample = fixture('tv-watchlist-signed-out');
  assert.equal(isSignedOut(sample), true);
  assert.equal(isSignedOut([{ id: 123, name: 'Mine', symbols: [] }]), false);
  // A signed-in user can have no list at all.
  assert.equal(isSignedOut([]), false);
});

test('watchlistsToTabs makes a tab per list and a group per section', () => {
  const [tab] = watchlistsToTabs(fixture('tv-watchlist-signed-out'));
  assert.equal(tab.name, 'Watchlist');
  assert.deepEqual(
    tab.groups.map((group) => group.name),
    ['Indices', 'Stocks', 'Futures', 'Forex', 'Crypto'],
  );
  assert.deepEqual(tab.groups[1].symbolIds, ['NASDAQ:AAPL', 'NASDAQ:TSLA', 'NASDAQ:NFLX']);
  assert.equal(tab.count, 17);
});

test('symbols before the first section go to a group named after the list, and empty sections are left out', () => {
  const lists = [
    { id: 1, name: '半導體', symbols: ['TWSE:2330', 'NASDAQ:NVDA', '###Empty', '###歐洲', 'XETR:IFX', 'XETR:IFX', '###'] },
    { id: 2, name: '沒有區段', symbols: ['BINANCE:SUIUSDT.P'] },
    { id: 3, name: '空的', symbols: [] },
  ];
  assert.deepEqual(watchlistsToTabs(lists), [
    {
      id: 1,
      name: '半導體',
      count: 3,
      groups: [
        { name: '半導體', symbolIds: ['TWSE:2330', 'NASDAQ:NVDA'] },
        { name: '歐洲', symbolIds: ['XETR:IFX'] },
      ],
    },
    { id: 2, name: '沒有區段', count: 1, groups: [{ name: '沒有區段', symbolIds: ['BINANCE:SUIUSDT.P'] }] },
    { id: 3, name: '空的', count: 0, groups: [] },
  ]);
});

test('parseSearch names the kinds in the panel language', () => {
  setLanguage('en');
  try {
    const byId = new Map(parseSearch(fixture('tv-search-sui')).map((item) => [item.id, item]));
    assert.equal(byId.get('BINANCE:SUIUSDT').kind, 'Spot');
    assert.equal(byId.get('BINANCE:SUIUSDT.P').kind, 'Perpetual');
    assert.equal(byId.get('NYSE:SUI').kind, 'Stock');
    assert.equal(byId.get('COINBASE:SUIX2026').kind, 'Futures');
  } finally {
    setLanguage('zh-TW');
  }
});
