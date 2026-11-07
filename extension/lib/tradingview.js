// Reads the answers of TradingView search and of the TradingView watchlists.

import { marketOf } from './symbols.js';

const stripTags = (text) => (text ?? '').replaceAll(/<\/?em>/g, '');

const KIND_LABELS = {
  stock: '股票',
  fund: '基金',
  dr: '存託憑證',
  structured: '結構型商品',
  futures: '期貨',
  swap: '合約',
  spot: '現貨',
  index: '指數',
  forex: '外匯',
  bond: '債券',
  economic: '經濟數據',
};

function kindOf(item) {
  const specs = item.typespecs ?? [];
  if (specs.includes('etf')) return 'ETF';
  if (item.type === 'swap' && specs.includes('perpetual')) return '永續合約';
  return KIND_LABELS[item.type] ?? item.type ?? '';
}

// A futures result lists its contracts. The continuous contract, for example CME:SUI1!, follows
// the front month. Some exchanges list only dated contracts, and then the first one is used.
function contractOf(item) {
  const contracts = item.contracts ?? [];
  return contracts.find((contract) => contract.typespecs?.includes('continuous')) ?? contracts[0];
}

// A result has a prefix such as BINANCE, or else a source id such as OKX.
export function parseSearch(json) {
  const seen = new Set();
  const results = [];
  for (const item of json?.symbols ?? []) {
    const prefix = item.prefix ?? item.source_id ?? item.exchange;
    const ticker = stripTags(contractOf(item)?.symbol ?? item.symbol);
    if (!prefix || !ticker) continue;
    const id = `${prefix}:${ticker}`;
    if (seen.has(id)) continue;
    seen.add(id);
    results.push({
      id,
      ticker,
      name: stripTags(item.description),
      exchange: item.exchange ?? prefix,
      kind: kindOf(item),
      quoted: marketOf(id) !== null,
    });
  }
  return results;
}

// A signed-out user gets the TradingView sample list, which has no id.
export const isSignedOut = (lists) => lists.length > 0 && lists.every((list) => list.id === null);

// A watchlist becomes a tab, and each ### section becomes a group in that tab. Symbols before
// the first section go to a group with the name of the list. Empty sections are left out.
export function watchlistsToTabs(lists) {
  return lists.map((list) => {
    const groups = [];
    let current = null;
    for (const entry of list.symbols ?? []) {
      if (entry.startsWith('###')) {
        current = { name: entry.slice(3).trim() || list.name, symbolIds: [] };
        groups.push(current);
      } else {
        if (!current) {
          current = { name: list.name, symbolIds: [] };
          groups.push(current);
        }
        if (!current.symbolIds.includes(entry)) current.symbolIds.push(entry);
      }
    }
    const filled = groups.filter((group) => group.symbolIds.length > 0);
    const count = new Set(filled.flatMap((group) => group.symbolIds)).size;
    return { id: list.id, name: list.name, groups: filled, count };
  });
}
