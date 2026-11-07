// Pure operations on the list of groups. A symbol is unique inside one group,
// but the same symbol can be in any number of groups.

export function createGroup(name) {
  return { id: crypto.randomUUID().slice(0, 8), name, collapsed: false, symbols: [] };
}

export function addSymbol(group, symbol) {
  if (group.symbols.some((item) => item.id === symbol.id)) return false;
  group.symbols.push(symbol);
  return true;
}

export function removeSymbol(group, symbolId) {
  group.symbols = group.symbols.filter((item) => item.id !== symbolId);
}

// Returns false, and changes nothing, if the target group already has the symbol.
// Also returns false if a sync from another computer removed the source during a drag.
export function moveSymbol(groups, fromGroupId, symbolId, toGroupId, beforeSymbolId) {
  const from = groups.find((group) => group.id === fromGroupId);
  const to = groups.find((group) => group.id === toGroupId);
  const symbol = from?.symbols.find((item) => item.id === symbolId);
  if (!symbol || !to) return false;
  if (fromGroupId !== toGroupId && to.symbols.some((item) => item.id === symbolId)) return false;

  removeSymbol(from, symbolId);
  const index = to.symbols.findIndex((item) => item.id === beforeSymbolId);
  to.symbols.splice(index === -1 ? to.symbols.length : index, 0, symbol);
  return true;
}

export function moveGroup(groups, groupId, beforeGroupId) {
  const group = groups.find((item) => item.id === groupId);
  if (!group) return;
  groups.splice(groups.indexOf(group), 1);
  const index = groups.findIndex((item) => item.id === beforeGroupId);
  groups.splice(index === -1 ? groups.length : index, 0, group);
}

// Only open groups need quotes. A symbol in two open groups is fetched once.
export function visibleSymbolIds(groups) {
  const open = groups.filter((group) => !group.collapsed);
  return [...new Set(open.flatMap((group) => group.symbols.map((item) => item.id)))];
}
