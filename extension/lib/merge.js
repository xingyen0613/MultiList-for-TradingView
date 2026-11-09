// Three-way merge of the list for cloud sync. No chrome API here, so the background, the side
// panel and the Node tests use the same code.
// A doc is { groupOrder, groups: { id: group }, tabNames, customTabs }. The base is the doc at the
// last sync. Comparing each side with it tells which side made a change, so both sides keep theirs.

import { releaseGroups } from './groups.js';

const ORDER_KEY = 'groupOrder';
const GROUP_PREFIX = 'group:';
const TAB_NAMES_KEY = 'tabNames';
const CUSTOM_TABS_KEY = 'customTabs';
// Same default as loadTabs in store.js.
const DEFAULT_TABS = [{ id: 'tab1', name: '分頁一' }];

const own = (object, key) => (Object.hasOwn(object, key) ? object[key] : undefined);

// JSON with sorted object keys, so key order never makes two equal values look different.
const sortKeys = (key, value) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map((name) => [name, value[name]]))
    : value;
const stable = (value) => JSON.stringify(value, sortKeys);
const same = (a, b) => stable(a) === stable(b);

// Fills defaults and keeps groupOrder and groups in step. A group missing from groupOrder goes to
// the end instead of being lost. Returns a copy.
export function normalizeDoc(doc) {
  const source = structuredClone(doc ?? {});
  const groups = {};
  for (const [id, group] of Object.entries(source.groups ?? {})) {
    if (group) groups[id] = { ...group, collapsed: group.collapsed ?? false, symbols: group.symbols ?? [] };
  }
  const groupOrder = [...new Set(source.groupOrder ?? [])].filter((id) => Object.hasOwn(groups, id));
  for (const id of Object.keys(groups)) if (!groupOrder.includes(id)) groupOrder.push(id);
  return {
    groupOrder,
    groups,
    tabNames: source.tabNames ?? {},
    customTabs: source.customTabs ?? structuredClone(DEFAULT_TABS),
  };
}

// Reads the result of chrome.storage.sync.get(null). Other keys, such as consent, are not part of
// the list. Like loadGroups, a group counts only if groupOrder lists it and its item exists.
export function docFromItems(items) {
  const order = items[ORDER_KEY] ?? [];
  const groups = {};
  for (const id of order) {
    const group = items[GROUP_PREFIX + id];
    if (group) groups[id] = group;
  }
  return normalizeDoc({ groupOrder: order, groups, tabNames: items[TAB_NAMES_KEY], customTabs: items[CUSTOM_TABS_KEY] });
}

export function docsEqual(a, b) {
  return same(normalizeDoc(a), normalizeDoc(b));
}

// A new install. An empty named group is a user change, so it is not empty.
export function isEmptyDoc(doc) {
  const { groupOrder, tabNames, customTabs } = normalizeDoc(doc);
  return groupOrder.length === 0 && Object.keys(tabNames).length === 0 && same(customTabs, DEFAULT_TABS);
}

// A loose group holds symbols outside any group, so it adds symbols but is not counted as a group.
export function countDoc(doc) {
  const groups = Object.values(normalizeDoc(doc).groups);
  return {
    groups: groups.filter((group) => !group.loose).length,
    symbols: groups.reduce((sum, group) => sum + group.symbols.length, 0),
  };
}

// Takes the order of the side that moved things, mine first. Ids missing from that order go after
// their nearest earlier neighbour on their own side, or first if there is none.
export function mergeOrder(baseIds, mineIds, theirsIds, keep) {
  const wanted = new Set(keep);
  const inBase = new Set(baseIds);
  const inMine = new Set(mineIds);
  const mineMoved = !same(baseIds.filter((id) => inMine.has(id)), mineIds.filter((id) => inBase.has(id)));
  const [main, other] = mineMoved ? [mineIds, theirsIds] : [theirsIds, mineIds];

  const result = [];
  for (const id of main) if (wanted.has(id) && !result.includes(id)) result.push(id);
  for (const id of [...other, ...baseIds, ...wanted]) {
    if (!wanted.has(id) || result.includes(id)) continue;
    const source = other.includes(id) ? other : baseIds;
    let at = 0;
    for (let i = source.indexOf(id) - 1; i >= 0; i -= 1) {
      const index = result.indexOf(source[i]);
      if (index !== -1) {
        at = index + 1;
        break;
      }
    }
    result.splice(at, 0, id);
  }
  return result;
}

// Each field takes the side that changed it. If both changed it, mine wins.
// A missing field is a value too, so removing tabId is a change.
function mergeFields(base, mine, theirs) {
  const out = {};
  for (const key of new Set([...Object.keys(mine), ...Object.keys(theirs), ...Object.keys(base)])) {
    const value = same(own(mine, key), own(base, key)) ? own(theirs, key) : own(mine, key);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

// Merges lists of { id, ... }, such as symbols and custom tabs. A removal on either side wins,
// because a user removes a symbol or a tab on purpose.
function mergeList(base, mine, theirs) {
  const byId = (list) => new Map(list.map((item) => [item.id, item]));
  const [b, m, t] = [byId(base), byId(mine), byId(theirs)];
  const merged = new Map();
  for (const id of new Set([...m.keys(), ...t.keys()])) {
    if (m.has(id) && t.has(id)) merged.set(id, mergeFields(b.get(id) ?? { id }, m.get(id), t.get(id)));
    else if (!b.has(id)) merged.set(id, m.get(id) ?? t.get(id));
  }
  const ids = (list) => list.map((item) => item.id);
  return mergeOrder(ids(base), ids(mine), ids(theirs), merged.keys()).map((id) => merged.get(id));
}

function mergeGroup(base, mine, theirs) {
  const { symbols: baseSymbols, ...baseFields } = base;
  const { symbols: mineSymbols, ...mineFields } = mine;
  const { symbols: theirSymbols, ...theirFields } = theirs;
  return { ...mergeFields(baseFields, mineFields, theirFields), symbols: mergeList(baseSymbols, mineSymbols, theirSymbols) };
}

function mergeGroups(base, mine, theirs) {
  const groups = {};
  for (const id of new Set([...mine.groupOrder, ...theirs.groupOrder])) {
    const b = own(base.groups, id);
    const m = own(mine.groups, id);
    const t = own(theirs.groups, id);
    if (b?.loose && !(m && t)) {
      // The side panel drops a loose group once it is empty, so a missing one means its symbols
      // were removed. Merging it as empty keeps those removals and the other side's new symbols.
      const empty = { ...b, symbols: [] };
      const group = mergeGroup(b, m ?? empty, t ?? empty);
      if (group.symbols.length > 0) groups[id] = group;
    } else if (m && t) {
      // Both sides can make the same loose group, such as loose-all.
      groups[id] = mergeGroup(b ?? { id, collapsed: false, symbols: [] }, m, t);
    } else if (!b || !same(m ?? t, b)) {
      // New on one side, or changed on one side while the other deleted it. Keeping it loses nothing.
      groups[id] = m ?? t;
    }
  }
  return groups;
}

export function mergeDocs(base, mine, theirs) {
  const b = normalizeDoc(base);
  const m = normalizeDoc(mine);
  const t = normalizeDoc(theirs);
  const groups = mergeGroups(b, m, t);
  const customTabs = mergeList(b.customTabs, m.customTabs, t.customTabs);
  const list = mergeOrder(b.groupOrder, m.groupOrder, t.groupOrder, Object.keys(groups)).map((id) => groups[id]);

  // A group can point to a tab that the other side deleted. It goes back to the all tab, the same
  // way as when the tab is deleted here, so its loose symbols join the loose symbols of the all tab.
  const tabIds = new Set(customTabs.map((tab) => tab.id));
  for (const tabId of new Set(list.map((group) => group.tabId))) {
    if (tabId !== undefined && !tabIds.has(tabId)) releaseGroups(list, tabId);
  }

  return normalizeDoc({
    groupOrder: list.map((group) => group.id),
    groups: Object.fromEntries(list.map((group) => [group.id, group])),
    tabNames: mergeFields(b.tabNames, m.tabNames, t.tabNames),
    customTabs,
  });
}

// For a first sign-in or a new account, when there is no base to merge with.
export function decideInitial({ local, cloud }) {
  if (!cloud || isEmptyDoc(cloud)) return 'upload';
  if (isEmptyDoc(local)) return 'download';
  if (docsEqual(local, cloud)) return 'adopt';
  return 'ask';
}

// The saved base is only valid for the same account and the same cloud copy. A lower cloud version
// means the cloud copy was replaced. A missing version also fails, so the merge never runs on a guess.
export function hasCommonBase({ record, accountId, cloudVersion }) {
  return Boolean(record) && record.accountId === accountId && cloudVersion >= record.version;
}

// The storage writes that turn one doc into another. Only changed keys are written, so a change
// made elsewhere to another key is not overwritten.
export function itemsDiff(beforeDoc, afterDoc) {
  const before = normalizeDoc(beforeDoc);
  const after = normalizeDoc(afterDoc);
  const set = {};
  for (const id of after.groupOrder) {
    if (!same(own(before.groups, id), after.groups[id])) set[GROUP_PREFIX + id] = after.groups[id];
  }
  if (!same(before.groupOrder, after.groupOrder)) set[ORDER_KEY] = after.groupOrder;
  if (!same(before.tabNames, after.tabNames)) set[TAB_NAMES_KEY] = after.tabNames;
  if (!same(before.customTabs, after.customTabs)) set[CUSTOM_TABS_KEY] = after.customTabs;
  const remove = before.groupOrder.filter((id) => !Object.hasOwn(after.groups, id)).map((id) => GROUP_PREFIX + id);
  return { set, remove };
}
