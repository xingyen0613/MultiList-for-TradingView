import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addSymbol,
  ALL_TAB,
  createGroup,
  createLooseGroup,
  groupInTab,
  looseGroup,
  moveGroup,
  moveGroupToTab,
  moveSymbol,
  releaseGroups,
  removeSymbol,
  showsHeader,
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

test('the all tab shows every group, and a custom tab shows only its own groups', () => {
  const { a, b } = twoGroups();
  a.tabId = 'x1';
  assert.equal(groupInTab(a, 'x1'), true);
  assert.equal(groupInTab(b, 'x1'), false);
  assert.equal(groupInTab(a, 'x2'), false);
  assert.equal(groupInTab(a, ALL_TAB), true);
  assert.equal(groupInTab(b, ALL_TAB), true);
});

test('a tab shows the symbols of every market', () => {
  const group = createGroup('A');
  group.symbols = [TSMC, AAPL, IFX, BTC];
  group.tabId = 'x1';
  const all = [TSMC.id, AAPL.id, IFX.id, BTC.id];
  assert.deepEqual(visibleSymbolIds([group], 'x1'), all);
  assert.deepEqual(visibleSymbolIds([group], ALL_TAB), all);
});

test('visibleSymbolIds on a custom tab returns the symbols of its groups only', () => {
  const { a, b, groups } = twoGroups();
  a.tabId = 'x1';
  assert.deepEqual(visibleSymbolIds(groups, 'x1'), [AAPL.id, TSMC.id]);
  assert.deepEqual(visibleSymbolIds(groups, 'x2'), []);
  b.tabId = 'x1';
  assert.deepEqual(visibleSymbolIds(groups, 'x1'), [AAPL.id, TSMC.id, BTC.id]);
  a.collapsed = true;
  assert.deepEqual(visibleSymbolIds(groups, 'x1'), [BTC.id]);
});

test('moveGroupToTab moves a group into a custom tab, and the all tab takes it out', () => {
  const group = createGroup('A');
  moveGroupToTab(group, 'x1');
  assert.equal(group.tabId, 'x1');
  moveGroupToTab(group, 'x2');
  assert.equal(group.tabId, 'x2');
  moveGroupToTab(group, ALL_TAB);
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

test('each tab has its own loose group, with an id that comes from the tab', () => {
  const all = createLooseGroup(ALL_TAB);
  const x1 = createLooseGroup('x1');
  assert.equal(all.loose, true);
  assert.equal('tabId' in all, false);
  assert.equal(x1.tabId, 'x1');
  // Two computers make the same id, so sync keeps one item.
  assert.equal(createLooseGroup('x1').id, x1.id);
  assert.notEqual(all.id, x1.id);
  const groups = [createGroup('A'), all, x1];
  assert.equal(looseGroup(groups, ALL_TAB), all);
  assert.equal(looseGroup(groups, 'x1'), x1);
  assert.equal(looseGroup(groups, 'x2'), undefined);
});

test('a tab shows its own loose symbols without a header, and the all tab shows other tabs with one', () => {
  const all = createLooseGroup(ALL_TAB);
  const x1 = createLooseGroup('x1');
  assert.equal(showsHeader(all, ALL_TAB), false);
  assert.equal(showsHeader(x1, 'x1'), false);
  assert.equal(showsHeader(x1, ALL_TAB), true);
  assert.equal(showsHeader(createGroup('A'), ALL_TAB), true);
});

test('loose symbols without a header are always visible, even if closed on the all tab', () => {
  const x1 = createLooseGroup('x1');
  x1.symbols = [BTC];
  x1.collapsed = true;
  assert.deepEqual(visibleSymbolIds([x1], 'x1'), [BTC.id]);
  assert.deepEqual(visibleSymbolIds([x1], ALL_TAB), []);
  x1.collapsed = false;
  assert.deepEqual(visibleSymbolIds([x1], ALL_TAB), [BTC.id]);
});

test('releaseGroups moves the loose symbols of a deleted tab to the all tab', () => {
  const group = createGroup('A');
  group.tabId = 'x1';
  const x1 = createLooseGroup('x1');
  x1.symbols = [BTC, AAPL];
  const all = createLooseGroup(ALL_TAB);
  all.symbols = [AAPL];
  const groups = [group, x1, all];
  releaseGroups(groups, 'x1');
  assert.equal(looseGroup(groups, 'x1'), undefined);
  assert.deepEqual(all.symbols, [AAPL, BTC]);
  assert.equal('tabId' in group, false);
  assert.equal(groups.length, 2);
});

test('releaseGroups makes the loose group of the all tab if it does not exist', () => {
  const x1 = createLooseGroup('x1');
  x1.symbols = [TSMC];
  const groups = [createGroup('A'), x1];
  releaseGroups(groups, 'x1');
  assert.deepEqual(looseGroup(groups, ALL_TAB).symbols, [TSMC]);
  assert.equal(groups.length, 2);
});

test('releaseGroups drops an empty loose group of a deleted tab', () => {
  const groups = [createGroup('A'), createLooseGroup('x1')];
  releaseGroups(groups, 'x1');
  assert.equal(groups.length, 1);
  assert.equal(looseGroup(groups, ALL_TAB), undefined);
});
