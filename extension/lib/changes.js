// Pure helpers that turn two group states into add/remove events. No chrome API here.
// The patterns match the server validation. The server rejects a whole batch on one bad
// field, so the extension drops bad ids before they leave.
export const SYMBOL_ID_PATTERN = /^[A-Z0-9_]{1,32}:[A-Z0-9._!&\-]{1,48}$/;
export const GROUP_ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

const validSymbol = (id) => typeof id === 'string' && SYMBOL_ID_PATTERN.test(id);
const validGroup = (id) => typeof id === 'string' && GROUP_ID_PATTERN.test(id);

// Map of valid groupId -> Set of valid symbol ids.
function symbolSets(groups) {
  const sets = new Map();
  for (const group of groups ?? []) {
    if (!validGroup(group?.id)) continue;
    const set = sets.get(group.id) ?? new Set();
    for (const symbol of group.symbols ?? []) if (validSymbol(symbol?.id)) set.add(symbol.id);
    sets.set(group.id, set);
  }
  return sets;
}

const byGroupThenSymbol = (a, b) =>
  a.groupId < b.groupId ? -1 : a.groupId > b.groupId ? 1 :
  a.symbolId < b.symbolId ? -1 : a.symbolId > b.symbolId ? 1 : 0;

// Order inside a group, rename and collapse produce no events. Removes come before adds.
export function diffGroups(before, after, t) {
  const old = symbolSets(before);
  const now = symbolSets(after);
  const removes = [];
  const adds = [];
  for (const [groupId, set] of old) {
    const next = now.get(groupId);
    for (const symbolId of set) {
      if (!next?.has(symbolId)) removes.push({ t, op: 'remove', groupId, symbolId });
    }
  }
  for (const [groupId, set] of now) {
    const prev = old.get(groupId);
    for (const symbolId of set) {
      if (!prev?.has(symbolId)) adds.push({ t, op: 'add', groupId, symbolId });
    }
  }
  return [...removes.sort(byGroupThenSymbol), ...adds.sort(byGroupThenSymbol)];
}

// Keeps only ids and order, so a snapshot holds no names or other user text.
export function snapshotOf(groups) {
  return {
    groups: (groups ?? [])
      .filter((group) => validGroup(group?.id))
      .map((group) => ({
        id: group.id,
        tabId: group.tabId ?? null,
        symbols: (group.symbols ?? []).map((symbol) => symbol?.id).filter(validSymbol),
      })),
  };
}
