// Pure operations on the list of groups. A symbol is unique inside one group,
// but the same symbol can be in any number of groups.

// The all tab shows every group. A custom tab shows only its own groups.
export const ALL_TAB = 'all';

export function groupInTab(group, tabId) {
  return tabId === ALL_TAB || group.tabId === tabId;
}

// The all tab holds no groups, so a drop there takes the group out of its custom tab.
export function moveGroupToTab(group, tabId) {
  if (tabId === ALL_TAB) delete group.tabId;
  else group.tabId = tabId;
}

// Deleting a tab keeps its groups. They stay on the all tab. Its loose symbols join the loose
// symbols of the all tab.
export function releaseGroups(groups, tabId) {
  const index = groups.findIndex((group) => group.loose && group.tabId === tabId);
  if (index !== -1) {
    const [from] = groups.splice(index, 1);
    if (from.symbols.length > 0) {
      let to = looseGroup(groups, ALL_TAB);
      if (!to) {
        to = createLooseGroup(ALL_TAB);
        groups.unshift(to);
      }
      for (const symbol of from.symbols) addSymbol(to, symbol);
    }
  }
  for (const group of groups) if (group.tabId === tabId) delete group.tabId;
}

export function createGroup(name) {
  return { id: crypto.randomUUID().slice(0, 8), name, collapsed: false, symbols: [] };
}

// Each tab can hold symbols that are not in a group. They are in one loose group per tab.
// Its id comes from the tab id, so two computers that add the first loose symbol at the same
// time make the same item.
const looseId = (tabId) => `loose-${tabId}`;

export function looseGroup(groups, tabId) {
  return groups.find((group) => group.id === looseId(tabId));
}

export function createLooseGroup(tabId) {
  const group = { id: looseId(tabId), name: '', loose: true, collapsed: false, symbols: [] };
  if (tabId !== ALL_TAB) group.tabId = tabId;
  return group;
}

// A tab shows its own loose symbols without a header, so they cannot be closed there.
// The all tab shows the loose symbols of other tabs with a header.
export function showsHeader(group, tabId) {
  return !group.loose || (group.tabId ?? ALL_TAB) !== tabId;
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

// Only open groups on the current tab need quotes. A symbol in two open groups is fetched once.
export function visibleSymbolIds(groups, tabId = ALL_TAB) {
  const open = groups.filter(
    (group) => groupInTab(group, tabId) && !(group.collapsed && showsHeader(group, tabId)),
  );
  return [...new Set(open.flatMap((group) => group.symbols.map((item) => item.id)))];
}
