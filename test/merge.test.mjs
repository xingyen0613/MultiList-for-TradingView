import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addSymbol,
  ALL_TAB,
  createLooseGroup,
  looseGroup,
  moveGroup,
  moveGroupToTab,
  moveSymbol,
  releaseGroups,
  removeSymbol,
} from '../extension/lib/groups.js';
import {
  countDoc,
  decideInitial,
  docFromItems,
  docsEqual,
  hasCommonBase,
  isEmptyDoc,
  itemsDiff,
  mergeDocs,
  mergeOrder,
  normalizeDoc,
} from '../extension/lib/merge.js';

const AAPL = { id: 'NASDAQ:AAPL', name: 'Apple' };
const TSMC = { id: 'TWSE:2330', name: '台積電' };
const BTC = { id: 'BINANCE:BTCUSDT', name: '' };
const NVDA = { id: 'NASDAQ:NVDA', name: 'NVIDIA' };
const IFX = { id: 'XETR:IFX', name: 'Infineon Technologies AG', yahoo: 'IFX.DE' };
const SAP = { id: 'XETR:SAP', name: 'SAP SE', yahoo: 'SAP.DE' };
const POOL = [AAPL, TSMC, BTC, NVDA, IFX, SAP, { id: 'TWSE:2317', name: '鴻海' }, { id: 'NYSE:TSM', name: 'TSMC ADR' }];

const TAB1 = { id: 'tab1', name: '分頁一' };
const TAB2 = { id: 'tab2', name: '分頁二' };
const TAB3 = { id: 'tab3', name: '分頁三' };

const group = (id, symbols = [], extra = {}) => ({
  id,
  name: id.toUpperCase(),
  collapsed: false,
  symbols: structuredClone(symbols),
  ...extra,
});
const loose = (tabId, symbols) => ({ ...createLooseGroup(tabId), symbols: structuredClone(symbols) });

// A doc from groups in order, like the side panel state.
function makeDoc(groups, { tabNames = {}, customTabs = [TAB1] } = {}) {
  return normalizeDoc({
    groupOrder: groups.map((item) => item.id),
    groups: Object.fromEntries(groups.map((item) => [item.id, item])),
    tabNames,
    customTabs,
  });
}

const listOf = (doc) => doc.groupOrder.map((id) => doc.groups[id]);
const find = (list, id) => list.find((item) => item.id === id);
const symbolIds = (doc, id) => doc.groups[id].symbols.map((symbol) => symbol.id);

// Changes a copy of the doc the way the side panel would: on the list of groups and the tabs.
function edit(doc, change) {
  const copy = structuredClone(doc);
  const list = listOf(copy);
  change(list, copy);
  return makeDoc(list, { tabNames: copy.tabNames, customTabs: copy.customTabs });
}

function assertValid(doc, message) {
  assert.equal(new Set(doc.groupOrder).size, doc.groupOrder.length, message);
  assert.deepEqual([...doc.groupOrder].sort(), Object.keys(doc.groups).sort(), message);
  const tabIds = new Set(doc.customTabs.map((tab) => tab.id));
  for (const [id, item] of Object.entries(doc.groups)) {
    assert.equal(item.id, id, message);
    if (item.tabId !== undefined) assert.ok(tabIds.has(item.tabId), `${message}: ${id} points to a missing tab`);
    const ids = item.symbols.map((symbol) => symbol.id);
    assert.equal(new Set(ids).size, ids.length, message);
  }
}

// --- merge cases ---

test('changes to different groups are both kept', () => {
  const base = makeDoc([group('a', [AAPL]), group('b', [TSMC])]);
  const mine = edit(base, (list) => {
    find(list, 'a').name = 'Tech';
  });
  const theirs = edit(base, (list) => {
    addSymbol(find(list, 'b'), BTC);
  });
  const merged = mergeDocs(base, mine, theirs);
  assert.equal(merged.groups.a.name, 'Tech');
  assert.deepEqual(symbolIds(merged, 'b'), [TSMC.id, BTC.id]);
});

test('one side adds a symbol and the other removes another one in the same group', () => {
  const base = makeDoc([group('a', [AAPL, TSMC])]);
  const mine = edit(base, (list) => addSymbol(list[0], BTC));
  const theirs = edit(base, (list) => removeSymbol(list[0], TSMC.id));
  assert.deepEqual(symbolIds(mergeDocs(base, mine, theirs), 'a'), [AAPL.id, BTC.id]);
  assert.deepEqual(symbolIds(mergeDocs(base, theirs, mine), 'a'), [AAPL.id, BTC.id]);
});

test('one side collapses a group and the other adds a symbol to it: both are kept', () => {
  const base = makeDoc([group('a', [AAPL]), group('b', [TSMC])]);
  const collapsed = edit(base, (list) => {
    find(list, 'a').collapsed = true;
  });
  const added = edit(base, (list) => addSymbol(find(list, 'a'), NVDA));
  for (const merged of [mergeDocs(base, collapsed, added), mergeDocs(base, added, collapsed)]) {
    assert.equal(merged.groups.a.collapsed, true);
    assert.deepEqual(symbolIds(merged, 'a'), [AAPL.id, NVDA.id]);
    assert.deepEqual(merged.groups.b, base.groups.b);
  }
});

test('a field changed to different values on both sides takes mine', () => {
  const tabs = { customTabs: [TAB1, TAB2, TAB3] };
  const base = makeDoc([group('a', [], { tabId: 'tab1' })], tabs);
  const mine = edit(base, (list) => {
    list[0].name = 'Mine';
    moveGroupToTab(list[0], 'tab2');
  });
  const theirs = edit(base, (list) => {
    list[0].name = 'Theirs';
    moveGroupToTab(list[0], 'tab3');
  });
  const merged = mergeDocs(base, mine, theirs);
  assert.equal(merged.groups.a.name, 'Mine');
  assert.equal(merged.groups.a.tabId, 'tab2');
});

test('removing tabId is a change of its own', () => {
  const tabs = { customTabs: [TAB1, TAB2, TAB3] };
  const base = makeDoc([group('a', [], { tabId: 'tab1' })], tabs);
  const toAll = edit(base, (list) => moveGroupToTab(list[0], ALL_TAB));
  const toTab3 = edit(base, (list) => moveGroupToTab(list[0], 'tab3'));
  const renamed = edit(base, (list) => {
    list[0].name = 'New';
  });
  // Only one side moved it to the all tab, so it leaves its tab.
  assert.equal('tabId' in mergeDocs(base, renamed, toAll).groups.a, false);
  assert.equal('tabId' in mergeDocs(base, toAll, renamed).groups.a, false);
  // Both moved it, so mine wins either way.
  assert.equal('tabId' in mergeDocs(base, toAll, toTab3).groups.a, false);
  assert.equal(mergeDocs(base, toTab3, toAll).groups.a.tabId, 'tab3');
});

test('a group deleted on one side and changed on the other is kept', () => {
  const base = makeDoc([group('a', [AAPL]), group('b')]);
  const deleted = edit(base, (list) => list.splice(0, 1));
  const changed = edit(base, (list) => addSymbol(find(list, 'a'), TSMC));
  for (const merged of [mergeDocs(base, deleted, changed), mergeDocs(base, changed, deleted)]) {
    assert.deepEqual(merged.groupOrder, ['a', 'b']);
    assert.deepEqual(symbolIds(merged, 'a'), [AAPL.id, TSMC.id]);
  }
});

test('a group deleted on one side and untouched on the other is deleted', () => {
  const base = makeDoc([group('a', [AAPL]), group('b')]);
  const deleted = edit(base, (list) => list.splice(0, 1));
  const other = edit(base, (list) => {
    find(list, 'b').name = 'Renamed';
  });
  for (const merged of [mergeDocs(base, deleted, other), mergeDocs(base, other, deleted)]) {
    assert.deepEqual(merged.groupOrder, ['b']);
    assert.equal(merged.groups.a, undefined);
    assert.equal(merged.groups.b.name, 'Renamed');
  }
  const both = mergeDocs(base, deleted, deleted);
  assert.deepEqual(both.groupOrder, ['b']);
});

test('groups added on both sides are all kept, each once in groupOrder', () => {
  const base = makeDoc([group('a'), group('b')]);
  const mine = edit(base, (list) => list.push(group('m', [AAPL])));
  const theirs = edit(base, (list) => list.push(group('t', [TSMC])));
  const merged = mergeDocs(base, mine, theirs);
  assert.deepEqual(merged.groupOrder, ['a', 'b', 'm', 't']);
  assert.deepEqual(symbolIds(merged, 'm'), [AAPL.id]);
  assert.deepEqual(symbolIds(merged, 't'), [TSMC.id]);
  assertValid(merged);
});

test('when only theirs reorders, the merge uses theirs order', () => {
  const base = makeDoc([group('a'), group('b'), group('c')]);
  const mine = edit(base, (list) => {
    find(list, 'a').name = 'A2';
    list.splice(1, 0, group('m'));
  });
  const theirs = edit(base, (list) => moveGroup(list, 'c', 'a'));
  const merged = mergeDocs(base, mine, theirs);
  // Mine added m after a, so it stays after a.
  assert.deepEqual(merged.groupOrder, ['c', 'a', 'm', 'b']);
  assert.equal(merged.groups.a.name, 'A2');
});

test('when both reorder, mine order wins and a group new in theirs goes after its neighbour', () => {
  const base = makeDoc([group('a'), group('b'), group('c')]);
  const mine = edit(base, (list) => moveGroup(list, 'c', 'a'));
  const theirs = edit(base, (list) => {
    moveGroup(list, 'b', 'a');
    list.splice(2, 0, group('t'));
  });
  assert.deepEqual(theirs.groupOrder, ['b', 'a', 't', 'c']);
  assert.deepEqual(mergeDocs(base, mine, theirs).groupOrder, ['c', 'a', 't', 'b']);
});

test('symbol order follows the same rule as group order', () => {
  const base = makeDoc([group('a', [AAPL, TSMC, BTC])]);
  const mine = edit(base, (list) => addSymbol(list[0], NVDA));
  const theirs = edit(base, (list) => moveSymbol(list, 'a', BTC.id, 'a', AAPL.id));
  // NVDA was added after BTC, so it follows BTC to its new place.
  assert.deepEqual(symbolIds(mergeDocs(base, mine, theirs), 'a'), [BTC.id, NVDA.id, AAPL.id, TSMC.id]);
  assert.deepEqual(symbolIds(mergeDocs(base, theirs, mine), 'a'), [BTC.id, NVDA.id, AAPL.id, TSMC.id]);
  const inMiddle = edit(base, (list) => {
    addSymbol(list[0], NVDA);
    moveSymbol(list, 'a', NVDA.id, 'a', TSMC.id);
  });
  assert.deepEqual(symbolIds(inMiddle, 'a'), [AAPL.id, NVDA.id, TSMC.id, BTC.id]);
  assert.deepEqual(symbolIds(mergeDocs(base, inMiddle, theirs), 'a'), [BTC.id, AAPL.id, NVDA.id, TSMC.id]);
});

test('mergeOrder keeps only wanted ids, never repeats one, and puts an id without a neighbour first', () => {
  // Mine moved, so mine is the main order. t has no earlier neighbour in theirs.
  assert.deepEqual(mergeOrder(['a', 'b'], ['n', 'b', 'a'], ['t', 'a', 'b'], ['a', 'b', 'n', 't']), ['t', 'n', 'b', 'a']);
  assert.deepEqual(mergeOrder(['a', 'b'], ['n', 'b', 'a'], ['t', 'a', 'b'], ['b', 'n', 't']), ['t', 'n', 'b']);
  assert.deepEqual(mergeOrder(['a'], ['a', 'a'], ['a'], ['a']), ['a']);
  // Two new ids in a row keep their order.
  assert.deepEqual(mergeOrder(['a'], ['a'], ['x', 'y', 'a'], new Set(['a', 'x', 'y'])), ['x', 'y', 'a']);
  assert.deepEqual(mergeOrder(['a'], ['x', 'y', 'a'], ['a', 'z'], ['a', 'x', 'y', 'z']), ['x', 'y', 'a', 'z']);
});

test('a tab deleted on one side leaves no group pointing to it', () => {
  const base = makeDoc([group('a'), group('b', [], { tabId: 'tab2' }), loose('tab2', [AAPL])], {
    customTabs: [TAB1, TAB2],
  });
  const theirs = edit(base, (list, copy) => {
    copy.customTabs = copy.customTabs.filter((tab) => tab.id !== 'tab2');
    releaseGroups(list, 'tab2');
  });
  assert.deepEqual(symbolIds(theirs, 'loose-all'), [AAPL.id]);
  const mine = edit(base, (list) => {
    list.push(group('c', [TSMC], { tabId: 'tab2' }));
    addSymbol(looseGroup(list, 'tab2'), BTC);
  });

  const merged = mergeDocs(base, mine, theirs);
  assertValid(merged);
  assert.deepEqual(merged.customTabs, [TAB1]);
  for (const item of Object.values(merged.groups)) assert.equal(item.tabId, undefined);
  // Mine's new group stays, now on the all tab. The loose symbols of the tab join loose-all.
  assert.deepEqual(symbolIds(merged, 'c'), [TSMC.id]);
  assert.equal(merged.groups['loose-tab2'], undefined);
  assert.deepEqual(symbolIds(merged, 'loose-all'), [AAPL.id, BTC.id]);
  assert.deepEqual(merged.groupOrder, ['loose-all', 'a', 'b', 'c']);
});

test('loose-all made on both sides becomes one group with the symbols of both', () => {
  const base = makeDoc([group('a')]);
  const mine = edit(base, (list) => list.unshift(loose(ALL_TAB, [AAPL])));
  const theirs = edit(base, (list) => list.unshift({ ...loose(ALL_TAB, [TSMC, IFX]), collapsed: true }));
  const merged = mergeDocs(base, mine, theirs);
  assert.deepEqual(merged.groupOrder, ['loose-all', 'a']);
  assert.equal(merged.groups['loose-all'].loose, true);
  // The base is an empty group, which is open, so only theirs changed collapsed.
  assert.equal(merged.groups['loose-all'].collapsed, true);
  assert.deepEqual(symbolIds(merged, 'loose-all').sort(), [AAPL.id, IFX.id, TSMC.id].sort());
  assertValid(merged);
});

test('removing the last loose symbol stays removed when the other side adds a loose symbol', () => {
  const base = makeDoc([loose(ALL_TAB, [AAPL]), group('a')]);
  // The side panel drops a loose group once its last symbol is removed.
  const mine = edit(base, (list) => list.splice(0, 1));
  const theirs = edit(base, (list) => addSymbol(list[0], TSMC));
  assert.deepEqual(symbolIds(mergeDocs(base, mine, theirs), 'loose-all'), [TSMC.id]);
  assert.deepEqual(symbolIds(mergeDocs(base, theirs, mine), 'loose-all'), [TSMC.id]);
  assert.equal(mergeDocs(base, mine, base).groups['loose-all'], undefined);
});

test('the yahoo field of European stocks is kept', () => {
  const base = makeDoc([group('a', [AAPL, SAP])]);
  const mine = edit(base, (list) => {
    list[0].symbols[1].name = 'SAP';
  });
  const theirs = edit(base, (list) => addSymbol(list[0], structuredClone(IFX)));
  assert.deepEqual(mergeDocs(base, mine, theirs).groups.a.symbols, [AAPL, { ...SAP, name: 'SAP' }, IFX]);

  // Both added IFX, and only one copy has the yahoo field.
  const plain = edit(base, (list) => addSymbol(list[0], { id: IFX.id, name: IFX.name }));
  const full = edit(base, (list) => addSymbol(list[0], structuredClone(IFX)));
  assert.deepEqual(mergeDocs(base, plain, full).groups.a.symbols.at(-1), IFX);
  assert.deepEqual(mergeDocs(base, full, plain).groups.a.symbols.at(-1), IFX);
});

test('custom tabs and the all tab name merge by tab', () => {
  const base = makeDoc([], { customTabs: [TAB1, TAB2] });
  const mine = edit(base, (list, copy) => {
    copy.customTabs[0].name = '美股';
    copy.tabNames[ALL_TAB] = '全部清單';
  });
  const theirs = edit(base, (list, copy) => {
    copy.customTabs = copy.customTabs.filter((tab) => tab.id !== 'tab1');
    copy.customTabs[0].name = '台股';
    copy.customTabs.push({ id: 'new', name: '加密' });
  });
  const merged = mergeDocs(base, mine, theirs);
  // A tab removal wins over a rename, like a symbol removal.
  assert.deepEqual(merged.customTabs, [{ id: 'tab2', name: '台股' }, { id: 'new', name: '加密' }]);
  assert.deepEqual(merged.tabNames, { [ALL_TAB]: '全部清單' });

  const cleared = edit(mine, (list, copy) => {
    delete copy.tabNames[ALL_TAB];
  });
  assert.deepEqual(mergeDocs(mine, mine, cleared).tabNames, {});
});

// --- properties on random lists ---

// A small seeded random generator, so a failure names a seed that can be run again.
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rand, list) => list[Math.floor(rand() * list.length)];

function randomSymbols(rand, min = 0) {
  const pool = [...POOL];
  const count = min + Math.floor(rand() * (pool.length - min));
  const symbols = [];
  while (symbols.length < count) symbols.push(structuredClone(pool.splice(Math.floor(rand() * pool.length), 1)[0]));
  return symbols;
}

function randomDoc(rand) {
  const customTabs = rand() < 0.5 ? [structuredClone(TAB1)] : [structuredClone(TAB1), structuredClone(TAB2)];
  const groups = [];
  const count = Math.floor(rand() * 5);
  for (let i = 0; i < count; i += 1) {
    const item = group(`g${i}`, randomSymbols(rand), { collapsed: rand() < 0.3 });
    if (rand() < 0.4) item.tabId = pick(rand, customTabs).id;
    groups.push(item);
  }
  if (rand() < 0.4) groups.unshift(loose(ALL_TAB, randomSymbols(rand, 1)));
  if (rand() < 0.3) groups.push(loose(pick(rand, customTabs).id, randomSymbols(rand, 1)));
  return makeDoc(groups, { tabNames: rand() < 0.3 ? { [ALL_TAB]: '全部清單' } : {}, customTabs });
}

// One to four random edits with the same helpers the side panel uses.
function randomEdit(doc, rand, side) {
  return edit(doc, (list, copy) => {
    const steps = 1 + Math.floor(rand() * 4);
    for (let step = 0; step < steps; step += 1) {
      const item = list.length > 0 ? pick(rand, list) : null;
      const symbol = item && item.symbols.length > 0 ? pick(rand, item.symbols) : null;
      const tabIds = copy.customTabs.map((tab) => tab.id);
      switch (Math.floor(rand() * 15)) {
        case 0:
          if (item && !item.loose) item.name = `${side}${step}`;
          break;
        case 1:
          if (item) item.collapsed = !item.collapsed;
          break;
        case 2:
          if (item) addSymbol(item, structuredClone(pick(rand, POOL)));
          break;
        case 3:
          if (symbol) removeSymbol(item, symbol.id);
          break;
        case 4:
          if (symbol) moveSymbol(list, item.id, symbol.id, item.id, pick(rand, item.symbols).id);
          break;
        case 5:
          if (item) list.splice(list.indexOf(item), 1);
          break;
        case 6:
          list.splice(Math.floor(rand() * (list.length + 1)), 0, group(`${side}${step}`, randomSymbols(rand)));
          break;
        case 7:
          if (item) moveGroup(list, item.id, pick(rand, [...list.map((other) => other.id), null]));
          break;
        case 8:
          if (item && !item.loose) moveGroupToTab(item, pick(rand, [ALL_TAB, ...tabIds]));
          break;
        case 9:
          copy.customTabs.push({ id: `${side}-tab${step}`, name: `新${step}` });
          break;
        case 10:
          if (tabIds.length > 0) {
            const tabId = pick(rand, tabIds);
            copy.customTabs = copy.customTabs.filter((tab) => tab.id !== tabId);
            releaseGroups(list, tabId);
          }
          break;
        case 11:
          if (tabIds.length > 0) pick(rand, copy.customTabs).name = `${side}改${step}`;
          break;
        case 12:
          if (rand() < 0.5) copy.tabNames[ALL_TAB] = `${side}全部`;
          else delete copy.tabNames[ALL_TAB];
          break;
        case 13: {
          const tabId = pick(rand, [ALL_TAB, ...tabIds]);
          let to = looseGroup(list, tabId);
          if (!to) {
            to = createLooseGroup(tabId);
            list.unshift(to);
          }
          addSymbol(to, structuredClone(pick(rand, POOL)));
          break;
        }
        case 14:
          if (symbol && rand() < 0.5) symbol.name = `${side}名${step}`;
          else if (symbol?.yahoo) delete symbol.yahoo;
          else if (symbol) symbol.yahoo = `${side}.DE`;
          break;
      }
    }
    // Like commit in the side panel, an empty loose group is dropped.
    for (let i = list.length - 1; i >= 0; i -= 1) if (list[i].loose && list[i].symbols.length === 0) list.splice(i, 1);
  });
}

const RUNS = 500;

function* randomCases() {
  for (let seed = 1; seed <= RUNS; seed += 1) {
    const rand = random(seed);
    const base = randomDoc(rand);
    yield { seed, base, mine: randomEdit(base, rand, 'm'), theirs: randomEdit(base, rand, 't') };
  }
}

test('when mine equals the base, the merge equals theirs, and the other way round', () => {
  for (const { seed, base, mine, theirs } of randomCases()) {
    assertValid(theirs, `seed ${seed}`);
    assert.deepEqual(mergeDocs(base, base, theirs), theirs, `seed ${seed}: base === mine`);
    assert.deepEqual(mergeDocs(base, mine, base), mine, `seed ${seed}: base === theirs`);
  }
});

test('a merge is valid and stays the same when merged with itself again', () => {
  for (const { seed, base, mine, theirs } of randomCases()) {
    const before = structuredClone({ base, mine, theirs });
    const merged = mergeDocs(base, mine, theirs);
    assert.deepEqual({ base, mine, theirs }, before, `seed ${seed}: inputs unchanged`);
    assertValid(merged, `seed ${seed}`);
    assert.deepEqual(mergeDocs(base, merged, merged), merged, `seed ${seed}`);
    assert.deepEqual(mergeDocs(base, mine, mine), mine, `seed ${seed}: both sides equal`);
  }
});

// --- doc helpers ---

test('docFromItems reads only the list keys, and only groups listed in groupOrder', () => {
  const items = {
    groupOrder: ['a', 'b', 'gone', 'a'],
    'group:a': group('a', [AAPL, IFX]),
    'group:b': { id: 'b', name: 'B' },
    'group:orphan': group('orphan'),
    tabNames: { [ALL_TAB]: '我的清單' },
    consent: { version: 1, accepted: true },
    analyticsId: 'abc',
    analyticsSalt: 'salt',
    firstSeenAt: 1730000000000,
  };
  const before = structuredClone(items);
  assert.deepEqual(docFromItems(items), {
    groupOrder: ['a', 'b'],
    groups: { a: group('a', [AAPL, IFX]), b: { id: 'b', name: 'B', collapsed: false, symbols: [] } },
    tabNames: { [ALL_TAB]: '我的清單' },
    customTabs: [TAB1],
  });
  assert.deepEqual(items, before);
  assert.deepEqual(docFromItems({ consent: { accepted: true } }), {
    groupOrder: [],
    groups: {},
    tabNames: {},
    customTabs: [TAB1],
  });
});

test('normalizeDoc fills defaults and puts groups missing from groupOrder back at the end', () => {
  const input = {
    groupOrder: ['b', 'missing', 'b'],
    groups: { a: { id: 'a', name: 'A' }, b: group('b', [AAPL], { collapsed: true }) },
  };
  const before = structuredClone(input);
  const doc = normalizeDoc(input);
  assert.deepEqual(doc, {
    groupOrder: ['b', 'a'],
    groups: { a: { id: 'a', name: 'A', collapsed: false, symbols: [] }, b: group('b', [AAPL], { collapsed: true }) },
    tabNames: {},
    customTabs: [TAB1],
  });
  assert.deepEqual(input, before);
  doc.groups.b.symbols.push(TSMC);
  assert.deepEqual(input, before);
});

test('docsEqual ignores object key order but not array order', () => {
  const a = makeDoc([group('a', [IFX]), group('b')], { tabNames: { [ALL_TAB]: 'X' } });
  const b = {
    customTabs: [{ name: '分頁一', id: 'tab1' }],
    tabNames: { [ALL_TAB]: 'X' },
    groups: {
      b: { symbols: [], collapsed: false, name: 'B', id: 'b' },
      a: { symbols: [{ yahoo: 'IFX.DE', name: IFX.name, id: IFX.id }], name: 'A', id: 'a', collapsed: false },
    },
    groupOrder: ['a', 'b'],
  };
  assert.equal(docsEqual(a, b), true);
  assert.equal(docsEqual(a, { ...b, groupOrder: ['b', 'a'] }), false);
  assert.equal(docsEqual(a, edit(a, (list) => addSymbol(list[0], AAPL))), false);
  // Missing defaults equal the defaults.
  assert.equal(docsEqual({}, { groupOrder: [], groups: {}, tabNames: {}, customTabs: [TAB1] }), true);
});

test('isEmptyDoc is true only for an untouched install', () => {
  assert.equal(isEmptyDoc(null), true);
  assert.equal(isEmptyDoc({}), true);
  assert.equal(isEmptyDoc(docFromItems({ consent: { accepted: true }, firstSeenAt: 1 })), true);
  assert.equal(isEmptyDoc(makeDoc([group('a')])), false);
  assert.equal(isEmptyDoc(makeDoc([], { customTabs: [{ id: 'tab1', name: '美股' }] })), false);
  assert.equal(isEmptyDoc(makeDoc([], { customTabs: [] })), false);
  assert.equal(isEmptyDoc(makeDoc([], { tabNames: { [ALL_TAB]: '我的' } })), false);
});

test('countDoc counts named groups and every symbol, repeats included', () => {
  const doc = makeDoc([loose(ALL_TAB, [BTC]), group('a', [AAPL, TSMC]), group('b', [AAPL])]);
  assert.deepEqual(countDoc(doc), { groups: 2, symbols: 4 });
  assert.deepEqual(countDoc({}), { groups: 0, symbols: 0 });
});

test('decideInitial picks upload, download, adopt or ask', () => {
  const empty = docFromItems({});
  const list = makeDoc([group('a', [AAPL])]);
  const other = makeDoc([group('b', [TSMC])]);
  assert.equal(decideInitial({ local: list, cloud: null }), 'upload');
  assert.equal(decideInitial({ local: list, cloud: empty }), 'upload');
  assert.equal(decideInitial({ local: empty, cloud: empty }), 'upload');
  assert.equal(decideInitial({ local: empty, cloud: list }), 'download');
  const reordered = { customTabs: list.customTabs, groups: list.groups, tabNames: {}, groupOrder: ['a'] };
  assert.equal(decideInitial({ local: list, cloud: reordered }), 'adopt');
  assert.equal(decideInitial({ local: list, cloud: other }), 'ask');
});

test('hasCommonBase needs a record of the same account and a cloud version not below it', () => {
  const record = { accountId: 'u1', version: 5, base: makeDoc([group('a')]) };
  assert.equal(hasCommonBase({ record: null, accountId: 'u1', cloudVersion: 5 }), false);
  assert.equal(hasCommonBase({ record, accountId: 'u2', cloudVersion: 5 }), false);
  assert.equal(hasCommonBase({ record, accountId: 'u1', cloudVersion: 4 }), false);
  assert.equal(hasCommonBase({ record, accountId: 'u1', cloudVersion: 1 }), false);
  assert.equal(hasCommonBase({ record, accountId: 'u1', cloudVersion: 5 }), true);
  assert.equal(hasCommonBase({ record, accountId: 'u1', cloudVersion: 9 }), true);
  assert.equal(hasCommonBase({ record, accountId: 'u1', cloudVersion: undefined }), false);
});

test('itemsDiff lists only changed keys and removes deleted groups', () => {
  const before = makeDoc([group('a', [AAPL]), group('b'), group('c')], { tabNames: {} });
  const after = edit(before, (list, copy) => {
    find(list, 'a').collapsed = true;
    list.splice(list.indexOf(find(list, 'b')), 1);
    list.push(group('d', [IFX]));
    copy.tabNames[ALL_TAB] = '全部清單';
  });
  const diff = itemsDiff(before, after);
  assert.deepEqual(Object.keys(diff.set).sort(), ['group:a', 'group:d', 'groupOrder', 'tabNames']);
  assert.deepEqual(diff.set['group:a'], after.groups.a);
  assert.deepEqual(diff.set['group:d'], after.groups.d);
  assert.deepEqual(diff.set.groupOrder, ['a', 'c', 'd']);
  assert.deepEqual(diff.remove, ['group:b']);

  assert.deepEqual(itemsDiff(before, structuredClone(before)), { set: {}, remove: [] });
  const collapsedOnly = edit(before, (list) => {
    list[0].collapsed = true;
  });
  assert.deepEqual(Object.keys(itemsDiff(before, collapsedOnly).set), ['group:a']);
  // Storage without customTabs means the default tab, so writing the default is no change.
  assert.deepEqual(itemsDiff(docFromItems({}), makeDoc([])), { set: {}, remove: [] });
});

test('no function changes its input, and a merge shares nothing with its inputs', () => {
  const base = makeDoc([group('a', [AAPL]), loose('tab2', [TSMC])], { customTabs: [TAB1, TAB2] });
  const mine = edit(base, (list, copy) => {
    copy.customTabs = copy.customTabs.filter((tab) => tab.id !== 'tab2');
    releaseGroups(list, 'tab2');
  });
  const theirs = edit(base, (list) => {
    addSymbol(find(list, 'loose-tab2'), IFX);
    list.push(group('t', [SAP], { tabId: 'tab2' }));
  });
  const items = { groupOrder: ['a'], 'group:a': group('a', [AAPL]), consent: { accepted: true } };
  const inputs = { base, mine, theirs, items };
  const before = structuredClone(inputs);

  const merged = mergeDocs(base, mine, theirs);
  normalizeDoc(mine);
  docFromItems(items);
  docsEqual(mine, theirs);
  isEmptyDoc(mine);
  countDoc(mine);
  decideInitial({ local: mine, cloud: theirs });
  itemsDiff(base, merged);
  mergeOrder(base.groupOrder, mine.groupOrder, theirs.groupOrder, ['a']);
  assert.deepEqual(inputs, before);

  for (const item of Object.values(merged.groups)) {
    item.name = 'changed';
    item.symbols.push(BTC);
  }
  merged.customTabs.push(TAB3);
  assert.deepEqual(inputs, before);
});
