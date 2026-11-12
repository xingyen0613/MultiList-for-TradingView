// Export and import of the list as a JSON file, so a user can move, share or back up a list.
// The file has no tab or group ids. An import makes new ids and adds to the list; it never
// replaces anything.

import { addSymbol, ALL_TAB, createGroup, createLooseGroup, looseGroup } from './groups.js';
import { t } from './i18n.js';
import { syncUsage } from './store.js';

export const FORMAT = 'multilist';
export const VERSION = 1;
export const MAX_FILE_BYTES = 1024 * 1024;
const MAX_TABS = 100;
const MAX_GROUPS = 600;
const MAX_SYMBOLS = 10000;
const MAX_NAME = 200;
// Same symbol id rule as the server.
const SYMBOL = /^[A-Z0-9_]{1,32}:[A-Z0-9._!&\-]{1,48}$/;
const YAHOO = /^[A-Za-z0-9^=._&-]{1,32}$/;

const symbolOut = (symbol) => ({ id: symbol.id, name: symbol.name ?? '', ...(symbol.yahoo && { yahoo: symbol.yahoo }) });
const groupOut = (group) => ({ name: group.name, ...(group.loose && { loose: true }), symbols: group.symbols.map(symbolOut) });

// The whole list, or one custom tab. The all tab is the whole list.
// Groups of a tab that no longer exists show on the all tab, so they go to the top-level groups.
export function exportList(groups, custom, tabId = ALL_TAB, now = Date.now()) {
  const one = custom.find((tab) => tab.id === tabId);
  const tabs = (one ? [one] : custom).map((tab) => ({
    name: tab.name,
    groups: groups.filter((group) => group.tabId === tab.id).map(groupOut),
  }));
  const tabIds = new Set(custom.map((tab) => tab.id));
  const rest = one ? [] : groups.filter((group) => !tabIds.has(group.tabId));
  return { format: FORMAT, version: VERSION, exportedAt: new Date(now).toISOString(), tabs, groups: rest.map(groupOut) };
}

// multilist-20261109.json, with the local date.
export function exportFileName(date = new Date()) {
  const pad = (number) => String(number).padStart(2, '0');
  return `multilist-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}.json`;
}

export function sizeError(bytes) {
  return bytes > MAX_FILE_BYTES ? t('file.tooLarge') : null;
}

class Invalid extends Error {}
const fail = (message) => {
  throw new Invalid(message);
};
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const shown = (value) => (typeof value === 'string' ? value : JSON.stringify(value) ?? String(value)).slice(0, 60);
const broken = (path) => fail(t('file.broken', { path }));

function checkName(value, path, allowEmpty) {
  if (typeof value !== 'string') broken(path);
  if (!allowEmpty && value.trim() === '') fail(t('file.noName', { path }));
  if (value.length > MAX_NAME) fail(t('file.longName', { max: MAX_NAME, name: value.slice(0, 20) }));
  return value;
}

function checkSymbol(value, path) {
  if (!isObject(value)) broken(path);
  if (typeof value.id !== 'string' || !SYMBOL.test(value.id)) fail(t('file.badSymbol', { id: shown(value.id) }));
  const symbol = { id: value.id, name: checkName(value.name ?? '', `${path}.name`, true) };
  if (value.yahoo !== undefined) {
    if (typeof value.yahoo !== 'string' || !YAHOO.test(value.yahoo)) fail(t('file.badYahoo', { id: value.id }));
    symbol.yahoo = value.yahoo;
  }
  return symbol;
}

function checkGroups(value, path, count) {
  if (!Array.isArray(value)) broken(path);
  return value.map((item, index) => {
    const at = `${path}[${index}]`;
    if (!isObject(item)) broken(at);
    if (item.loose !== undefined && typeof item.loose !== 'boolean') broken(`${at}.loose`);
    const loose = item.loose === true;
    if (!Array.isArray(item.symbols)) broken(`${at}.symbols`);
    count.groups += 1;
    count.symbols += item.symbols.length;
    if (count.groups > MAX_GROUPS) fail(t('file.tooManyGroups', { max: MAX_GROUPS }));
    if (count.symbols > MAX_SYMBOLS) fail(t('file.tooManySymbols', { max: MAX_SYMBOLS }));
    return {
      name: loose ? '' : checkName(item.name, `${at}.name`, false),
      loose,
      symbols: item.symbols.map((symbol, j) => checkSymbol(symbol, `${at}.symbols[${j}]`)),
    };
  });
}

// Reads the text of an export file. Returns { value } with known fields only, or { error } with
// a message for the user.
export function parseExport(text) {
  try {
    const tooLarge = sizeError(new TextEncoder().encode(text).length);
    if (tooLarge) fail(tooLarge);
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      fail(t('file.notJson'));
    }
    if (!isObject(data) || data.format !== FORMAT) fail(t('file.notExport'));
    if (data.version !== VERSION) fail(t('file.version', { version: shown(data.version) }));
    if (!Array.isArray(data.tabs)) broken('tabs');
    if (data.tabs.length > MAX_TABS) fail(t('file.tooManyTabs', { max: MAX_TABS }));
    const count = { groups: 0, symbols: 0 };
    const tabs = data.tabs.map((tab, index) => {
      const at = `tabs[${index}]`;
      if (!isObject(tab)) broken(at);
      return { name: checkName(tab.name, `${at}.name`, false), groups: checkGroups(tab.groups, `${at}.groups`, count) };
    });
    const groups = checkGroups(data.groups ?? [], 'groups', count);
    return { value: { tabs, groups } };
  } catch (error) {
    if (error instanceof Invalid) return { error: error.message };
    throw error;
  }
}

// Adds a parsed file to the list, like the TradingView import: new tabs and groups go after the
// current ones. The loose symbols of the all tab join the current loose symbols, without
// duplicates. Does not change its inputs. Returns the new groups and custom tabs, what was added,
// and the sync usage, so the caller can stop before a save that does not fit.
export function importList(data, groups, { names, custom }) {
  const nextGroups = [...groups];
  const added = [];
  const ids = new Set();
  const make = (item, tabId) => {
    const symbols = item.symbols.map((symbol) => ({ ...symbol }));
    if (item.loose && tabId === ALL_TAB) {
      if (symbols.length === 0) return;
      let to = looseGroup(nextGroups, ALL_TAB);
      if (to) {
        // A copy, so the current group stays as it is.
        to = { ...to, symbols: [...to.symbols] };
        nextGroups[nextGroups.findIndex((group) => group.id === to.id)] = to;
      } else {
        to = createLooseGroup(ALL_TAB);
        nextGroups.unshift(to);
      }
      for (const symbol of symbols) if (addSymbol(to, symbol)) ids.add(symbol.id);
      return;
    }
    if (item.loose) {
      // Two loose groups for one tab would have the same id, so they become one.
      let to = nextGroups.find((group) => group.id === createLooseGroup(tabId).id);
      if (!to) {
        if (symbols.length === 0) return;
        to = createLooseGroup(tabId);
        nextGroups.push(to);
      }
      for (const symbol of symbols) if (addSymbol(to, symbol)) ids.add(symbol.id);
      return;
    }
    const group = { ...createGroup(item.name), symbols: [] };
    if (tabId !== ALL_TAB) group.tabId = tabId;
    for (const symbol of symbols) if (addSymbol(group, symbol)) ids.add(symbol.id);
    nextGroups.push(group);
    added.push(group);
  };

  const tabs = data.tabs.map((tab) => ({ id: crypto.randomUUID().slice(0, 8), name: tab.name }));
  data.tabs.forEach((tab, index) => tab.groups.forEach((item) => make(item, tabs[index].id)));
  data.groups.forEach((item) => make(item, ALL_TAB));

  const nextCustom = [...custom, ...tabs];
  return {
    groups: nextGroups,
    custom: nextCustom,
    added: { tabs, groups: added.length, symbols: ids.size },
    usage: syncUsage(nextGroups, { names, custom: nextCustom }),
  };
}
