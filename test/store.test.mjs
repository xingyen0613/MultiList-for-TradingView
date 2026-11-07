import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  loadColumnWidths,
  loadGroups,
  loadTabs,
  saveColumnWidths,
  saveGroups,
  saveTabs,
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
    tabNames: { tw: '台灣' },
    customTabs: custom,
  });
  await saveGroups([group('a')]);
  assert.deepEqual(Object.keys(sync.data).sort(), ['customTabs', 'group:a', 'groupOrder', 'tabNames']);
  assert.deepEqual(await loadTabs(), { names: { tw: '台灣' }, custom });
  assert.deepEqual(await loadGroups(), [group('a')]);
});

test('tabs start empty and can be saved', async () => {
  install({});
  assert.deepEqual(await loadTabs(), { names: {}, custom: [] });
  const tabs = { names: { crypto: '幣圈' }, custom: [{ id: 'x1', name: '短線' }] };
  await saveTabs(tabs);
  assert.deepEqual(await loadTabs(), tabs);
});

test('tabsChanged reads only changes to the tabs', () => {
  assert.equal(tabsChanged({ 'group:a': { newValue: group('a') } }), false);
  assert.equal(tabsChanged({ tabNames: { newValue: { us: '美國' } } }), true);
  assert.equal(tabsChanged({ customTabs: { oldValue: [] } }), true);
});

test('column widths stay on this computer', async () => {
  const sync = install({});
  assert.equal(await loadColumnWidths(), null);
  await saveColumnWidths([90, 50, 60]);
  assert.deepEqual(await loadColumnWidths(), [90, 50, 60]);
  assert.deepEqual(sync.data, {});
});
