import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  diffGroups,
  GROUP_ID_PATTERN,
  snapshotOf,
  SYMBOL_ID_PATTERN,
} from '../extension/lib/changes.js';
import { createLooseGroup, releaseGroups } from '../extension/lib/groups.js';

const sym = (id) => ({ id, name: '' });
const grp = (id, ids, extra = {}) => ({ id, name: id, collapsed: false, symbols: ids.map(sym), ...extra });
const ev = (op, groupId, symbolId) => ({ t: 1, op, groupId, symbolId });

test('add a symbol', () => {
  assert.deepEqual(diffGroups([grp('g1', ['TWSE:2330'])], [grp('g1', ['TWSE:2330', 'XETR:IFX'])], 1), [
    ev('add', 'g1', 'XETR:IFX'),
  ]);
});

test('remove a symbol', () => {
  assert.deepEqual(diffGroups([grp('g1', ['TWSE:2330', 'XETR:IFX'])], [grp('g1', ['TWSE:2330'])], 1), [
    ev('remove', 'g1', 'XETR:IFX'),
  ]);
});

test('move across groups is one remove and one add', () => {
  const events = diffGroups([grp('g1', ['TWSE:2330']), grp('g2', [])], [grp('g1', []), grp('g2', ['TWSE:2330'])], 1);
  assert.deepEqual(events, [ev('remove', 'g1', 'TWSE:2330'), ev('add', 'g2', 'TWSE:2330')]);
});

test('reorder, rename and collapse give no events', () => {
  const before = [grp('g1', ['TWSE:2330', 'XETR:IFX'])];
  const after = [{ ...grp('g1', ['XETR:IFX', 'TWSE:2330']), name: 'New', collapsed: true }];
  assert.deepEqual(diffGroups(before, after, 1), []);
});

test('new group with symbols adds each; deleted group removes each', () => {
  const g = grp('g1', ['BINANCE:BTCUSDT.P', 'CME:SUI1!']);
  assert.deepEqual(diffGroups([], [g], 1), [ev('add', 'g1', 'BINANCE:BTCUSDT.P'), ev('add', 'g1', 'CME:SUI1!')]);
  assert.deepEqual(diffGroups([g], [], 1), [ev('remove', 'g1', 'BINANCE:BTCUSDT.P'), ev('remove', 'g1', 'CME:SUI1!')]);
});

test('deleting a tab moves loose symbols into loose-all', () => {
  const tabLoose = createLooseGroup('t1');
  tabLoose.symbols.push(sym('OMXSTO:VOLV_B'));
  const groups = [tabLoose];
  const before = structuredClone(groups);
  releaseGroups(groups, 't1');
  assert.deepEqual(diffGroups(before, groups, 1), [
    ev('remove', 'loose-t1', 'OMXSTO:VOLV_B'),
    ev('add', 'loose-all', 'OMXSTO:VOLV_B'),
  ]);
});

test('importing many symbols at once', () => {
  const ids = ['LSE:BT.A', 'TWSE:2330', 'XETR:IFX'];
  assert.equal(diffGroups([grp('g1', [])], [grp('g1', ids)], 1).length, 3);
});

test('null or undefined before is empty', () => {
  assert.deepEqual(diffGroups(null, [grp('g1', ['TWSE:2330'])], 5), [{ t: 5, op: 'add', groupId: 'g1', symbolId: 'TWSE:2330' }]);
  assert.deepEqual(diffGroups(undefined, undefined, 5), []);
});

test('invalid symbol ids and group ids are skipped', () => {
  const after = [grp('g1', ['twse:2330', 'NOCOLON', 'TWSE:2330', 'A:' + 'x'.repeat(10)]), grp('bad id!', ['TWSE:2330'])];
  assert.deepEqual(diffGroups([], after, 1), [ev('add', 'g1', 'TWSE:2330')]);
  assert.deepEqual(snapshotOf(after).groups.map((g) => g.id), ['g1']);
  assert.deepEqual(snapshotOf(after).groups[0].symbols, ['TWSE:2330']);
});

test('events are sorted: removes first, then by group and symbol', () => {
  const before = [grp('b', ['TWSE:2330', 'AMEX:SPY']), grp('a', ['XETR:IFX'])];
  const after = [grp('b', ['NASDAQ:AAPL']), grp('a', ['NASDAQ:TSLA', 'NASDAQ:NFLX'])];
  assert.deepEqual(diffGroups(before, after, 1).map((e) => `${e.op} ${e.groupId} ${e.symbolId}`), [
    'remove a XETR:IFX',
    'remove b AMEX:SPY',
    'remove b TWSE:2330',
    'add a NASDAQ:NFLX',
    'add a NASDAQ:TSLA',
    'add b NASDAQ:AAPL',
  ]);
});

test('inputs are not modified', () => {
  const before = [grp('g1', ['TWSE:2330'])];
  const after = [grp('g1', ['XETR:IFX'])];
  const copies = [structuredClone(before), structuredClone(after)];
  diffGroups(before, after, 1);
  snapshotOf(after);
  assert.deepEqual([before, after], copies);
});

test('snapshotOf keeps only ids and order; missing tabId is null', () => {
  const groups = [
    grp('g1', ['XETR:IFX', 'TWSE:2330'], { tabId: 't1' }),
    { ...grp('loose-all', ['CME:SUI1!']), loose: true },
  ];
  groups[0].symbols[0].yahoo = 'IFX.DE';
  assert.deepEqual(snapshotOf(groups), {
    groups: [
      { id: 'g1', tabId: 't1', symbols: ['XETR:IFX', 'TWSE:2330'] },
      { id: 'loose-all', tabId: null, symbols: ['CME:SUI1!'] },
    ],
  });
  assert.deepEqual(snapshotOf(null), { groups: [] });
});

test('patterns accept real ids', () => {
  for (const id of ['TWSE:2330', 'BINANCE:BTCUSDT.P', 'CME:SUI1!', 'XETR:IFX', 'OMXSTO:VOLV_B', 'LSE:BT.A']) {
    assert.ok(SYMBOL_ID_PATTERN.test(id), id);
  }
  assert.ok(GROUP_ID_PATTERN.test('loose-all'));
});
