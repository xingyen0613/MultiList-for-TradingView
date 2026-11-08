import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  loadColumnWidths,
  loadGroups,
  loadTabs,
  saveColumnWidths,
  saveGroups,
  saveTabs,
  syncUsage,
  tabsChanged,
} from '../extension/lib/store.js';

// A small stand-in for chrome.storage.sync.
function fakeSync(initial = {}) {
  const data = structuredClone(initial);
  return {
    data,
    async get(keys) {
      if (keys === null) return structuredClone(data);
      const list = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(list.filter((key) => key in data).map((key) => [key, structuredClone(data[key])]));
    },
    async set(items) {
      Object.assign(data, structuredClone(items));
    },
    async remove(keys) {
      for (const key of [keys].flat()) delete data[key];
    },
  };
}

const realChrome = globalThis.chrome;
afterEach(() => {
  globalThis.chrome = realChrome;
});

function install(initial) {
  const sync = fakeSync(initial);
  globalThis.chrome = { storage: { sync, local: fakeSync() } };
  return sync;
}

const group = (id) => ({ id, name: id, collapsed: false, symbols: [] });

test('saveGroups removes a deleted group and keeps the tabs', async () => {
  const custom = [{ id: 'x1', name: '長期' }];
  const sync = install({
    groupOrder: ['a', 'b'],
    'group:a': group('a'),
    'group:b': group('b'),
    tabNames: { all: '總覽' },
    customTabs: custom,
  });
  await saveGroups([group('a')]);
  assert.deepEqual(Object.keys(sync.data).sort(), ['customTabs', 'group:a', 'groupOrder', 'tabNames']);
  assert.deepEqual(await loadTabs(), { names: { all: '總覽' }, custom });
  assert.deepEqual(await loadGroups(), [group('a')]);
});

test('a new install has one custom tab, and tabs can be saved', async () => {
  install({});
  const first = await loadTabs();
  assert.deepEqual(first, { names: {}, custom: [{ id: 'tab1', name: '分頁一' }] });
  first.custom.push({ id: 'x9', name: '改到的' });
  assert.deepEqual((await loadTabs()).custom, [{ id: 'tab1', name: '分頁一' }]);
  const tabs = { names: { all: '總覽' }, custom: [{ id: 'x1', name: '短線' }] };
  await saveTabs(tabs);
  assert.deepEqual(await loadTabs(), tabs);
});

test('a deleted default tab does not come back', async () => {
  install({ customTabs: [] });
  assert.deepEqual(await loadTabs(), { names: {}, custom: [] });
});

test('tabsChanged reads only changes to the tabs', () => {
  assert.equal(tabsChanged({ 'group:a': { newValue: group('a') } }), false);
  assert.equal(tabsChanged({ tabNames: { newValue: { all: '總覽' } } }), true);
  assert.equal(tabsChanged({ customTabs: { oldValue: [] } }), true);
});

test('column widths stay on this computer', async () => {
  const sync = install({});
  assert.equal(await loadColumnWidths(), null);
  await saveColumnWidths([90, 50, 60]);
  assert.deepEqual(await loadColumnWidths(), [90, 50, 60]);
  assert.deepEqual(sync.data, {});
});

test('syncUsage finds a group too large for one sync item, and counts every item', () => {
  const tabs = { names: {}, custom: [{ id: 'tab1', name: '分頁一' }] };
  const small = group('a');
  const usage = syncUsage([small], tabs);
  const expected = ['groupOrder["a"]', `tabNames{}`, `customTabs${JSON.stringify(tabs.custom)}`, `group:a${JSON.stringify(small)}`]
    .reduce((sum, text) => sum + new TextEncoder().encode(text).length, 0);
  assert.deepEqual(usage, { tooLarge: null, tooMany: false, items: 4, total: expected, fits: true });

  // Chinese names take three bytes each, so a count of characters is not enough.
  const big = group('b');
  big.symbols = Array.from({ length: 160 }, (_, i) => ({ id: `TWSE:${1000 + i}`, name: '台灣積體電路製造' }));
  const usageBig = syncUsage([small, big], tabs);
  assert.equal(JSON.stringify(big).length < 8192, true);
  assert.equal(usageBig.tooLarge, big);
  assert.equal(usageBig.fits, false);

  const many = Array.from({ length: 30 }, (_, n) => {
    const item = group(`g${n}`);
    item.symbols = Array.from({ length: 80 }, (_, i) => ({ id: `NASDAQ:T${i}`, name: 'Some Company Inc.' }));
    return item;
  });
  const usageMany = syncUsage(many, tabs);
  assert.equal(usageMany.tooLarge, null);
  assert.equal(usageMany.total > 102400, true);
  assert.equal(usageMany.fits, false);

  // Chrome sync holds at most 512 items, and each group is one item.
  const tiny = Array.from({ length: 510 }, (_, n) => group(`t${n}`));
  assert.equal(syncUsage(tiny, tabs).tooMany, true);
  assert.equal(syncUsage(tiny, tabs).fits, false);
  assert.equal(syncUsage(tiny.slice(0, 509), tabs).fits, true);
});
