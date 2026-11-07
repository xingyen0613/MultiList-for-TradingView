import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addSymbol,
  createGroup,
  groupInTab,
  groupVisibleIn,
  inMarket,
  isMarketTab,
  marketOfTab,
  moveGroup,
  moveGroupToTab,
  moveSymbol,
  releaseGroups,
  removeSymbol,
  symbolsInMarket,
  visibleSymbolIds,
} from '../extension/lib/groups.js';

const AAPL = { id: 'NASDAQ:AAPL', name: 'Apple' };
const TSMC = { id: 'TWSE:2330', name: '台積電' };
const BTC = { id: 'BINANCE:BTCUSDT', name: '' };
const IFX = { id: 'XETR:IFX', name: 'Infineon Technologies AG', yahoo: 'IFX.DE' };

function twoGroups() {
  const a = createGroup('A');
  const b = createGroup('B');
  a.symbols = [AAPL, TSMC];
  b.symbols = [BTC];
  return { a, b, groups: [a, b] };
}

test('the same symbol can be in many groups', () => {
  const { a, b } = twoGroups();
  assert.equal(addSymbol(b, AAPL), true);
  assert.ok(a.symbols.includes(AAPL));
  assert.ok(b.symbols.includes(AAPL));
});

test('a group rejects a symbol it already has', () => {
  const { a } = twoGroups();
  assert.equal(addSymbol(a, AAPL), false);
  assert.equal(a.symbols.length, 2);
});

test('removing a symbol from one group keeps it in other groups', () => {
  const { a, b } = twoGroups();
  addSymbol(b, AAPL);
  removeSymbol(a, AAPL.id);
  assert.deepEqual(a.symbols, [TSMC]);
  assert.ok(b.symbols.includes(AAPL));
});

test('moveSymbol reorders inside a group', () => {
  const { a, groups } = twoGroups();
  assert.equal(moveSymbol(groups, a.id, TSMC.id, a.id, AAPL.id), true);
  assert.deepEqual(a.symbols, [TSMC, AAPL]);
  assert.equal(moveSymbol(groups, a.id, TSMC.id, a.id, null), true);
  assert.deepEqual(a.symbols, [AAPL, TSMC]);
});

test('moveSymbol moves to another group at the chosen position', () => {
  const { a, b, groups } = twoGroups();
  assert.equal(moveSymbol(groups, a.id, AAPL.id, b.id, BTC.id), true);
  assert.deepEqual(a.symbols, [TSMC]);
  assert.deepEqual(b.symbols, [AAPL, BTC]);
});

test('moveSymbol changes nothing if the target group has the symbol', () => {
  const { a, b, groups } = twoGroups();
  addSymbol(b, AAPL);
  assert.equal(moveSymbol(groups, a.id, AAPL.id, b.id, null), false);
  assert.deepEqual(a.symbols, [AAPL, TSMC]);
  assert.deepEqual(b.symbols, [BTC, AAPL]);
});

test('moveSymbol changes nothing if a sync removed the source or the target', () => {
  const { a, b, groups } = twoGroups();
  assert.equal(moveSymbol(groups, 'gone', AAPL.id, b.id, null), false);
  assert.equal(moveSymbol(groups, a.id, 'NYSE:GONE', b.id, null), false);
  assert.equal(moveSymbol(groups, a.id, AAPL.id, 'gone', null), false);
  assert.deepEqual(a.symbols, [AAPL, TSMC]);
  assert.deepEqual(b.symbols, [BTC]);
});

test('moveGroup changes the group order', () => {
  const { a, b, groups } = twoGroups();
  moveGroup(groups, b.id, a.id);
  assert.deepEqual(groups, [b, a]);
  moveGroup(groups, b.id, null);
  assert.deepEqual(groups, [a, b]);
  moveGroup(groups, 'gone', a.id);
  assert.deepEqual(groups, [a, b]);
});

test('visibleSymbolIds skips closed groups and removes duplicates', () => {
  const { a, b, groups } = twoGroups();
  addSymbol(b, AAPL);
  assert.deepEqual(visibleSymbolIds(groups), [AAPL.id, TSMC.id, BTC.id]);
  a.collapsed = true;
  assert.deepEqual(visibleSymbolIds(groups), [BTC.id, AAPL.id]);
  b.collapsed = true;
  assert.deepEqual(visibleSymbolIds(groups), []);
});

test('inMarket matches the market of the symbol, and all matches every symbol', () => {
  assert.equal(inMarket(TSMC.id, 'tw'), true);
  assert.equal(inMarket('TPEX:6488', 'tw'), true);
  assert.equal(inMarket(TSMC.id, 'us'), false);
  assert.equal(inMarket(AAPL.id, 'us'), true);
  assert.equal(inMarket(BTC.id, 'crypto'), true);
  assert.equal(inMarket(IFX.id, 'eu'), true);
  assert.equal(inMarket(IFX.id, 'us'), false);
  for (const symbol of [TSMC, AAPL, BTC, IFX]) assert.equal(inMarket(symbol.id, 'all'), true);
});

test('symbolsInMarket keeps only the symbols of the market, in order', () => {
  const group = createGroup('A');
  group.symbols = [AAPL, TSMC, BTC, { id: 'TPEX:6488', name: '' }];
  assert.deepEqual(symbolsInMarket(group, 'tw').map((item) => item.id), [TSMC.id, 'TPEX:6488']);
  assert.deepEqual(symbolsInMarket(group, 'all'), group.symbols);
});

test('groupVisibleIn hides a group with only other markets and shows an empty group', () => {
  const { a, b } = twoGroups();
  assert.equal(groupVisibleIn(a, 'tw'), true);
  assert.equal(groupVisibleIn(a, 'crypto'), false);
  assert.equal(groupVisibleIn(b, 'crypto'), true);
  assert.equal(groupVisibleIn(b, 'all'), true);
  assert.equal(groupVisibleIn(createGroup('empty'), 'tw'), true);
});

test('visibleSymbolIds returns only the symbols of the current tab', () => {
  const { a, b, groups } = twoGroups();
  addSymbol(b, AAPL);
  assert.deepEqual(visibleSymbolIds(groups, 'us'), [AAPL.id]);
  assert.deepEqual(visibleSymbolIds(groups, 'tw'), [TSMC.id]);
  assert.deepEqual(visibleSymbolIds(groups, 'crypto'), [BTC.id]);
  a.collapsed = true;
  assert.deepEqual(visibleSymbolIds(groups, 'tw'), []);
});

test('market tabs and custom tabs', () => {
  for (const id of ['all', 'tw', 'us', 'eu', 'crypto']) assert.equal(isMarketTab(id), true);
  assert.equal(isMarketTab('x1'), false);
  assert.equal(marketOfTab('eu'), 'eu');
  assert.equal(marketOfTab('x1'), 'all');
});

test('a custom tab shows only its own groups, with every market', () => {
  const { a, b } = twoGroups();
  a.tabId = 'x1';
  assert.equal(groupInTab(a, 'x1'), true);
  assert.equal(groupInTab(b, 'x1'), false);
  assert.equal(groupInTab(a, 'x2'), false);
  // The market tabs still show the groups of a custom tab.
  assert.equal(groupInTab(a, 'tw'), true);
  assert.equal(groupInTab(a, 'all'), true);
  assert.equal(groupInTab(a, 'crypto'), false);
});

test('visibleSymbolIds on a custom tab returns all markets of its groups only', () => {
  const { a, b, groups } = twoGroups();
  a.tabId = 'x1';
  assert.deepEqual(visibleSymbolIds(groups, 'x1'), [AAPL.id, TSMC.id]);
  assert.deepEqual(visibleSymbolIds(groups, 'x2'), []);
  b.tabId = 'x1';
  assert.deepEqual(visibleSymbolIds(groups, 'x1'), [AAPL.id, TSMC.id, BTC.id]);
});

test('moveGroupToTab moves a group into a custom tab, and a market tab takes it out', () => {
  const group = createGroup('A');
  moveGroupToTab(group, 'x1');
  assert.equal(group.tabId, 'x1');
  moveGroupToTab(group, 'x2');
  assert.equal(group.tabId, 'x2');
  moveGroupToTab(group, 'us');
  assert.equal('tabId' in group, false);
});

test('releaseGroups keeps the groups of a deleted tab and only those', () => {
  const { a, b, groups } = twoGroups();
  a.tabId = 'x1';
  b.tabId = 'x2';
  releaseGroups(groups, 'x1');
  assert.equal('tabId' in a, false);
  assert.equal(b.tabId, 'x2');
  assert.equal(groups.length, 2);
});

test('a European symbol shows on the European tab', () => {
  const group = createGroup('A');
  group.symbols = [AAPL, IFX];
  assert.deepEqual(visibleSymbolIds([group], 'eu'), [IFX.id]);
  assert.deepEqual(visibleSymbolIds([group], 'us'), [AAPL.id]);
});
