// Groups use chrome.storage.sync, so they follow the Chrome account to other computers.
// Each group is its own item, because sync allows 8 KB per item and 100 KB in total.
// API keys use chrome.storage.local, so they never leave this computer.

const ORDER_KEY = 'groupOrder';
const GROUP_PREFIX = 'group:';
const KEYS_KEY = 'apiKeys';

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

  const existing = await chrome.storage.sync.get(null);
  const stale = Object.keys(existing).filter((key) => !(key in items));
  if (stale.length > 0) await chrome.storage.sync.remove(stale);
}

export async function loadKeys() {
  const data = await chrome.storage.local.get(KEYS_KEY);
  return data[KEYS_KEY] ?? {};
}

export async function saveKeys(keys) {
  await chrome.storage.local.set({ [KEYS_KEY]: keys });
}
