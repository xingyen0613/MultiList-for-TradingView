import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ALL_TAB } from '../extension/lib/groups.js';
import { exportFileName, exportList, importList, MAX_FILE_BYTES, parseExport } from '../extension/lib/transfer.js';

// A list with every kind of group: a custom tab with loose symbols and a group, a second tab,
// loose symbols on the all tab, a group on the all tab only, and a European stock.
function sample() {
  return {
    names: {},
    custom: [
      { id: 'tab1', name: '台股' },
      { id: 'tab2', name: '歐股' },
    ],
    groups: [
      { id: 'loose-all', name: '', loose: true, collapsed: false, symbols: [{ id: 'NASDAQ:AAPL', name: 'Apple' }] },
      { id: 'g1', name: '半導體', collapsed: false, tabId: 'tab1', symbols: [
        { id: 'TWSE:2330', name: '台積電' },
        { id: 'TPEX:6488', name: '環球晶' },
      ] },
      { id: 'loose-tab1', name: '', loose: true, collapsed: false, tabId: 'tab1', symbols: [{ id: 'TWSE:2317', name: '鴻海' }] },
      { id: 'g2', name: '德國', collapsed: true, tabId: 'tab2', symbols: [
        { id: 'XETR:IFX', name: 'Infineon', yahoo: 'IFX.DE' },
        { id: 'OMXSTO:VOLV_B', name: 'Volvo B', yahoo: 'VOLV-B.ST' },
      ] },
      { id: 'g3', name: '幣', collapsed: false, symbols: [
        { id: 'BINANCE:BTCUSDT', name: '' },
        { id: 'BINANCE:SUIUSDT.P', name: '' },
      ] },
    ],
  };
}

const empty = () => ({ names: {}, custom: [], groups: [] });
const roundTrip = (list) => parseExport(JSON.stringify(list));
const withoutTime = ({ exportedAt, ...rest }) => rest;

function importInto(state, text) {
  const parsed = parseExport(text);
  assert.ok(parsed.value, parsed.error);
  return importList(parsed.value, state.groups, state);
}

test('exportList writes names, symbols and order, and no tab or group ids', () => {
  const { groups, custom } = sample();
  const list = exportList(groups, custom, ALL_TAB, Date.UTC(2026, 10, 9));
  assert.equal(list.format, 'multilist');
  assert.equal(list.version, 1);
  assert.equal(list.exportedAt, '2026-11-09T00:00:00.000Z');
  assert.deepEqual(list.tabs, [
    { name: '台股', groups: [
      { name: '半導體', symbols: [{ id: 'TWSE:2330', name: '台積電' }, { id: 'TPEX:6488', name: '環球晶' }] },
      { name: '', loose: true, symbols: [{ id: 'TWSE:2317', name: '鴻海' }] },
    ] },
    { name: '歐股', groups: [
      { name: '德國', symbols: [
        { id: 'XETR:IFX', name: 'Infineon', yahoo: 'IFX.DE' },
        { id: 'OMXSTO:VOLV_B', name: 'Volvo B', yahoo: 'VOLV-B.ST' },
      ] },
    ] },
  ]);
  assert.deepEqual(list.groups, [
    { name: '', loose: true, symbols: [{ id: 'NASDAQ:AAPL', name: 'Apple' }] },
    { name: '幣', symbols: [{ id: 'BINANCE:BTCUSDT', name: '' }, { id: 'BINANCE:SUIUSDT.P', name: '' }] },
  ]);
  const text = JSON.stringify(list);
  for (const id of ['tab1', 'tab2', 'loose-all', 'loose-tab1', '"g1"', '"g2"', '"g3"', 'collapsed', 'tabId']) {
    assert.ok(!text.includes(id), `the file has ${id}`);
  }
});

test('exportList of the current tab has only that tab; the all tab is the whole list', () => {
  const { groups, custom } = sample();
  const one = exportList(groups, custom, 'tab2');
  assert.deepEqual(one.tabs.map((tab) => tab.name), ['歐股']);
  assert.deepEqual(one.groups, []);
  assert.deepEqual(withoutTime(exportList(groups, custom, ALL_TAB, 0)), withoutTime(exportList(groups, custom, 'gone', 0)));
  assert.equal(exportList(groups, custom, ALL_TAB).tabs.length, 2);
});

test('exportList puts the groups of a tab that no longer exists with the all-tab groups', () => {
  const groups = [{ id: 'g9', name: '孤兒', collapsed: false, tabId: 'deleted', symbols: [{ id: 'NYSE:KO', name: 'Coca-Cola' }] }];
  assert.deepEqual(exportList(groups, []).groups, [{ name: '孤兒', symbols: [{ id: 'NYSE:KO', name: 'Coca-Cola' }] }]);
});

test('export then import into an empty list gives the same names, symbols and order', () => {
  const before = sample();
  const result = importInto(empty(), JSON.stringify(exportList(before.groups, before.custom)));
  assert.ok(result.usage.fits);
  assert.deepEqual(
    withoutTime(exportList(result.groups, result.custom, ALL_TAB, 0)),
    withoutTime(exportList(before.groups, before.custom, ALL_TAB, 0)),
  );
  assert.deepEqual(result.added, { tabs: result.custom, groups: 3, symbols: 8 });
});

test('import keeps the Yahoo ticker of a European stock', () => {
  const before = sample();
  const result = importInto(empty(), JSON.stringify(exportList(before.groups, before.custom)));
  const symbols = result.groups.flatMap((group) => group.symbols);
  assert.deepEqual(symbols.find((item) => item.id === 'XETR:IFX'), { id: 'XETR:IFX', name: 'Infineon', yahoo: 'IFX.DE' });
  assert.deepEqual(symbols.find((item) => item.id === 'OMXSTO:VOLV_B').yahoo, 'VOLV-B.ST');
  assert.ok(!('yahoo' in symbols.find((item) => item.id === 'TWSE:2330')));
});

test('import adds after the current list with new ids, and loose groups do not share an id', () => {
  const state = sample();
  const snapshot = structuredClone(state);
  const text = JSON.stringify(exportList(state.groups, state.custom));
  const once = importInto(state, text);
  const twice = importInto({ ...state, groups: once.groups, custom: once.custom }, text);

  // The inputs stay as they were.
  assert.deepEqual(state, snapshot);

  const ids = twice.groups.map((group) => group.id);
  assert.equal(new Set(ids).size, ids.length, `ids repeat: ${ids}`);
  const tabIds = twice.custom.map((tab) => tab.id);
  assert.equal(new Set(tabIds).size, tabIds.length);
  assert.deepEqual(twice.custom.map((tab) => tab.name), ['台股', '歐股', '台股', '歐股', '台股', '歐股']);

  // The current groups keep their place; the new ones come after them.
  assert.deepEqual(ids.slice(0, 5), ['loose-all', 'g1', 'loose-tab1', 'g2', 'g3']);
  // Each new tab has its own loose group, with an id from the new tab id.
  for (const tab of twice.custom.slice(2).filter((item) => item.name === '台股')) {
    const loose = twice.groups.filter((group) => group.loose && group.tabId === tab.id);
    assert.equal(loose.length, 1);
    assert.equal(loose[0].id, `loose-${tab.id}`);
    assert.deepEqual(loose[0].symbols, [{ id: 'TWSE:2317', name: '鴻海' }]);
  }
  // New groups get new ids and the new tab id.
  const copies = twice.groups.filter((group) => group.name === '半導體');
  assert.equal(copies.length, 3);
  assert.ok(copies.slice(1).every((group) => /^[0-9a-f]{8}$/.test(group.id) && tabIds.slice(2).includes(group.tabId)));
  assert.ok(twice.groups.filter((group) => group.name === '幣').slice(1).every((group) => !('tabId' in group)));
});

test('the loose symbols of the all tab join the current ones without duplicates', () => {
  const state = sample();
  const data = parseExport(JSON.stringify({
    format: 'multilist',
    version: 1,
    tabs: [],
    groups: [{ name: '', loose: true, symbols: [{ id: 'NASDAQ:AAPL', name: 'Apple' }, { id: 'NASDAQ:MSFT', name: 'Microsoft' }] }],
  })).value;
  const result = importList(data, state.groups, state);
  const loose = result.groups.filter((group) => group.loose && !group.tabId);
  assert.equal(loose.length, 1);
  assert.deepEqual(loose[0].symbols.map((item) => item.id), ['NASDAQ:AAPL', 'NASDAQ:MSFT']);
  assert.deepEqual(sample().groups[0].symbols, state.groups[0].symbols);
  assert.deepEqual(result.added, { tabs: [], groups: 0, symbols: 1 });

  // With no loose group yet, one is made at the top of the list.
  const fresh = importList(data, [], empty());
  assert.equal(fresh.groups[0].id, 'loose-all');
  assert.ok(!('tabId' in fresh.groups[0]));
});

test('a symbol that repeats in one group is added once', () => {
  const data = parseExport(JSON.stringify({
    format: 'multilist',
    version: 1,
    tabs: [{ name: 'A', groups: [{ name: 'G', symbols: [{ id: 'NYSE:KO', name: '' }, { id: 'NYSE:KO', name: '' }] }] }],
  })).value;
  const result = importList(data, [], empty());
  assert.deepEqual(result.groups[0].symbols, [{ id: 'NYSE:KO', name: '' }]);
});

test('parseExport keeps known fields only', () => {
  const { value } = parseExport(JSON.stringify({
    format: 'multilist',
    version: 1,
    extra: 1,
    tabs: [{ name: 'A', id: 'x', groups: [{ name: 'G', id: 'y', collapsed: true, symbols: [{ id: 'NYSE:KO', name: 'Coke', price: 1 }] }] }],
  }));
  assert.deepEqual(value, { tabs: [{ name: 'A', groups: [{ name: 'G', loose: false, symbols: [{ id: 'NYSE:KO', name: 'Coke' }] }] }], groups: [] });
});

const good = (change = (data) => data) =>
  JSON.stringify(change({ format: 'multilist', version: 1, tabs: [{ name: 'A', groups: [{ name: 'G', symbols: [{ id: 'NYSE:KO', name: '' }] }] }], groups: [] }));

test('parseExport rejects a file that is not JSON', () => {
  assert.match(parseExport('not json {').error, /不是 JSON/);
  assert.match(parseExport('').error, /不是 JSON/);
});

test('parseExport rejects a file of another format', () => {
  assert.match(parseExport(good((data) => ({ ...data, format: 'other' }))).error, /不是 MultiList/);
  assert.match(parseExport('[]').error, /不是 MultiList/);
  assert.match(parseExport('null').error, /不是 MultiList/);
});

test('parseExport rejects another version', () => {
  assert.match(parseExport(good((data) => ({ ...data, version: 2 }))).error, /版本（2）/);
  assert.match(parseExport(good((data) => ({ ...data, version: '1' }))).error, /版本/);
  assert.match(parseExport(good(({ version, ...data }) => data)).error, /版本/);
});

test('parseExport rejects a symbol id with a bad form', () => {
  for (const id of ['nyse:ko', 'KO', 'NYSE:', ':KO', 'NYSE:K O', 'NYSE:KO<script>', 42]) {
    const text = good((data) => ({ ...data, groups: [{ name: 'X', symbols: [{ id, name: '' }] }] }));
    assert.match(parseExport(text).error, /代碼格式不對/, String(id));
  }
});

test('parseExport rejects a file larger than 1 MB', () => {
  const padding = 'x'.repeat(MAX_FILE_BYTES);
  assert.match(parseExport(good((data) => ({ ...data, padding }))).error, /超過 1 MB/);
});

test('parseExport rejects a broken structure, an empty name and a bad Yahoo ticker', () => {
  assert.match(parseExport(good((data) => ({ ...data, tabs: {} }))).error, /格式不對（tabs）/);
  assert.match(parseExport(good((data) => ({ ...data, tabs: [{ name: 'A' }] }))).error, /tabs\[0\]\.groups/);
  assert.match(parseExport(good((data) => ({ ...data, tabs: [{ name: ' ', groups: [] }] }))).error, /沒有名稱/);
  assert.match(parseExport(good((data) => ({ ...data, groups: [{ name: 'G', symbols: 'x' }] }))).error, /groups\[0\]\.symbols/);
  const yahoo = good((data) => ({ ...data, groups: [{ name: 'G', symbols: [{ id: 'XETR:IFX', name: '', yahoo: 'IFX DE/../' }] }] }));
  assert.match(parseExport(yahoo).error, /Yahoo/);
});

test('parseExport rejects too many symbols', () => {
  const symbols = Array.from({ length: 10001 }, (_, index) => ({ id: `NYSE:S${index}` }));
  assert.match(parseExport(good((data) => ({ ...data, groups: [{ name: 'G', symbols }] }))).error, /代碼超過 10000/);
});

test('importList reports a list that would not fit in Chrome sync, without changing the list', () => {
  const state = sample();
  const snapshot = structuredClone(state);
  // About 120 KB of symbols, spread so that no single group is too large.
  const groups = Array.from({ length: 40 }, (_, g) => ({
    name: `G${g}`,
    symbols: Array.from({ length: 60 }, (_, s) => ({ id: `NYSE:S${g}X${s}`, name: 'A long company name' })),
  }));
  const tooBig = importInto(state, good((data) => ({ ...data, tabs: [], groups })));
  assert.equal(tooBig.usage.fits, false);
  assert.ok(tooBig.usage.total > 102400);
  assert.equal(tooBig.usage.tooLarge, null);
  assert.deepEqual(state, snapshot);

  // One group over the 8 KB item limit is named.
  const big = [{ name: 'Big', symbols: Array.from({ length: 300 }, (_, s) => ({ id: `NYSE:B${s}`, name: 'A long company name' })) }];
  const oneTooLarge = importInto(state, good((data) => ({ ...data, tabs: [], groups: big })));
  assert.equal(oneTooLarge.usage.fits, false);
  assert.equal(oneTooLarge.usage.tooLarge.name, 'Big');
});

test('exportFileName uses the local date', () => {
  assert.equal(exportFileName(new Date(2026, 10, 9, 23, 59)), 'multilist-20261109.json');
  assert.equal(exportFileName(new Date(2027, 0, 5)), 'multilist-20270105.json');
});
