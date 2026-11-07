// Pure operations on the list of groups. A symbol is unique inside one group,
// but the same symbol can be in any number of groups.

import { marketOf } from './symbols.js';

const MARKET_TABS = new Set(['all', 'tw', 'us', 'eu', 'crypto']);

export const isMarketTab = (tabId) => MARKET_TABS.has(tabId);

// A custom tab shows every market of its own groups.
export const marketOfTab = (tabId) => (isMarketTab(tabId) ? tabId : 'all');

// A market tab shows every group with symbols of its market. A custom tab shows only its own groups.
export function groupInTab(group, tabId) {
  return isMarketTab(tabId) ? groupVisibleIn(group, tabId) : group.tabId === tabId;
}

// A market tab holds no groups, so a drop there takes the group out of its custom tab.
export function moveGroupToTab(group, tabId) {
  if (isMarketTab(tabId)) delete group.tabId;
  else group.tabId = tabId;
}

// Deleting a tab keeps its groups. They stay on the market tabs.
export function releaseGroups(groups, tabId) {
  for (const group of groups) if (group.tabId === tabId) delete group.tabId;
}

export function inMarket(symbolId, market) {
  return market === 'all' || marketOf(symbolId) === market;
}

export function symbolsInMarket(group, market) {
  return group.symbols.filter((item) => inMarket(item.id, market));
}

// An empty group shows on every tab, or a new group has no place to get its first symbol.
export function groupVisibleIn(group, market) {
  return group.symbols.length === 0 || symbolsInMarket(group, market).length > 0;
}

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

// Only open groups on the current tab need quotes. A symbol in two open groups is fetched once.
export function visibleSymbolIds(groups, tabId = 'all') {
  const market = marketOfTab(tabId);
  const open = groups.filter((group) => !group.collapsed && groupInTab(group, tabId));
  return [...new Set(open.flatMap((group) => symbolsInMarket(group, market).map((item) => item.id)))];
}
