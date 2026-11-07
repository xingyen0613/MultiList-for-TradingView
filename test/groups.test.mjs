import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addSymbol,
  createGroup,
  moveGroup,
  moveSymbol,
  removeSymbol,
  visibleSymbolIds,
} from '../extension/lib/groups.js';

const AAPL = { id: 'NASDAQ:AAPL', name: 'Apple' };
const TSMC = { id: 'TWSE:2330', name: '台積電' };
const BTC = { id: 'BINANCE:BTCUSDT', name: '' };

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
