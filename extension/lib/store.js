// Groups use chrome.storage.sync, so they follow the Chrome account to other computers.
// Each group is its own item, because sync allows 8 KB per item and 100 KB in total.
// Tabs also sync. The current tab and the column widths stay on this computer.
// API keys use chrome.storage.local, so they never leave this computer.

const ORDER_KEY = 'groupOrder';
const GROUP_PREFIX = 'group:';
const KEYS_KEY = 'apiKeys';
const CURRENT_TAB_KEY = 'currentTab';
const TAB_NAMES_KEY = 'tabNames';
const CUSTOM_TABS_KEY = 'customTabs';
const COLUMN_WIDTHS_KEY = 'columnWidths';

export async function loadGroups() {
  const data = await chrome.storage.sync.get(null);
  const order = data[ORDER_KEY] ?? [];
  return order
    .map((id) => data[GROUP_PREFIX + id])
    .filter(Boolean);
}

export async function saveGroups(groups) {
  const items = { [ORDER_KEY]: groups.map((group) => group.id) };
  for (const group of groups) items[GROUP_PREFIX + group.id] = group;
  await chrome.storage.sync.set(items);

  // Removes only deleted groups, so other synced items such as tab names stay.
  const existing = await chrome.storage.sync.get(null);
  const stale = Object.keys(existing).filter((key) => key.startsWith(GROUP_PREFIX) && !(key in items));
  if (stale.length > 0) await chrome.storage.sync.remove(stale);
}

// Market tabs have fixed ids and can have custom names. Custom tabs are a list of { id, name }.
export async function loadTabs() {
  const data = await chrome.storage.sync.get([TAB_NAMES_KEY, CUSTOM_TABS_KEY]);
  return { names: data[TAB_NAMES_KEY] ?? {}, custom: data[CUSTOM_TABS_KEY] ?? [] };
}

export async function saveTabs({ names, custom }) {
  await chrome.storage.sync.set({ [TAB_NAMES_KEY]: names, [CUSTOM_TABS_KEY]: custom });
}

export function tabsChanged(changes) {
  return TAB_NAMES_KEY in changes || CUSTOM_TABS_KEY in changes;
}

export async function loadKeys() {
  const data = await chrome.storage.local.get(KEYS_KEY);
  return data[KEYS_KEY] ?? {};
}

export async function saveKeys(keys) {
  await chrome.storage.local.set({ [KEYS_KEY]: keys });
}

// Column widths stay on this computer, because each screen has a different panel width.
export async function loadColumnWidths() {
  const data = await chrome.storage.local.get(COLUMN_WIDTHS_KEY);
  return data[COLUMN_WIDTHS_KEY] ?? null;
}

export async function saveColumnWidths(widths) {
  await chrome.storage.local.set({ [COLUMN_WIDTHS_KEY]: widths });
}

export async function loadCurrentTab() {
  const data = await chrome.storage.local.get(CURRENT_TAB_KEY);
  return data[CURRENT_TAB_KEY] ?? 'all';
}

export async function saveCurrentTab(tabId) {
  await chrome.storage.local.set({ [CURRENT_TAB_KEY]: tabId });
}
