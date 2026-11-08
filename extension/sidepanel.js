import { readWatchlistsInPage, searchSymbolsInPage, switchSymbolInPage } from './lib/chart-page.js';
import { columnsTemplate, DEFAULT_WIDTHS, resizeColumns, validWidths } from './lib/columns.js';
import { directionOf, formatChange, formatPercent, formatPrice, formatTime } from './lib/format.js';
import {
  addSymbol,
  ALL_TAB,
  createGroup,
  createLooseGroup,
  groupInTab,
  looseGroup,
  moveGroup,
  moveGroupToTab,
  moveSymbol,
  releaseGroups,
  removeSymbol,
  visibleSymbolIds,
} from './lib/groups.js';
import { diffGroups } from './lib/changes.js';
import { PRIVACY_URL } from './lib/config.js';
import { fetchQuotes, resolveSymbol } from './lib/quotes.js';
import {
  loadColumnWidths,
  loadCurrentTab,
  loadGroups,
  loadKeys,
  loadTabs,
  saveColumnWidths,
  saveCurrentTab,
  saveGroups,
  saveKeys,
  saveTabs,
  syncUsage,
  tabsChanged,
} from './lib/store.js';
import { hasConsent, needsConsentDecision, setConsent } from './lib/sharing.js';
import { chartUrl, isChartUrl, marketOf, tickerOf } from './lib/symbols.js';
import { isSignedOut, parseSearch, watchlistsToTabs } from './lib/tradingview.js';

const REFRESH_MS = 30_000;
const MARKET_LABELS = { tw: '台股', us: '美股', eu: '歐股', crypto: '加密貨幣', perp: '幣安合約' };
const SEARCH_TYPES = [
  ['', '全部'],
  ['stocks', '股票'],
  ['funds', '基金'],
  ['crypto', '加密貨幣'],
  ['futures', '期貨'],
  ['index', '指數'],
];
const IMPORT_LIMIT = 4; // Name lookups at the same time during an import.
const ALL_LABEL = '全部';
const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  import: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
};

// The search keeps its type after a symbol is added, so the next search finds the same kind.
const emptySearch = (type = '') => ({ text: '', type, results: [], resultsFor: '', active: 0, message: '' });

const state = {
  groups: [],
  tab: ALL_TAB,
  tabNames: {},
  customTabs: [],
  editingTab: null,
  creatingTab: false,
  tabSaving: 0,
  tabEdits: 0,
  columnWidths: DEFAULT_WIDTHS,
  quotes: new Map(),
  keys: {},
  selected: null,
  creating: false,
  renaming: null,
  addingTo: null,
  addError: '',
  drag: null,
  sourceStatus: [],
  updatedAt: null,
  saveError: '',
  notice: '',
  saving: 0,
  edits: 0,
  resolving: false,
  search: emptySearch(),
  importing: null,
};

const groupsContainer = document.getElementById('groups');

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  node.append(...children.filter((child) => child !== null));
  return node;
}

function svgIcon(name) {
  const holder = document.createElement('span');
  holder.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
  return holder.firstElementChild;
}

function iconButton(name, label, onClick, extraClass = '') {
  return el(
    'button',
    {
      type: 'button',
      class: `icon-button ${extraClass}`,
      title: label,
      'aria-label': label,
      onclick: (event) => {
        event.stopPropagation();
        onClick();
      },
    },
    svgIcon(name),
  );
}

function textForm({ placeholder, value = '', label, onSubmit, onCancel }) {
  const input = el('input', {
    type: 'text',
    placeholder,
    value,
    'aria-label': label,
    autocomplete: 'off',
    spellcheck: false,
    dataset: { autofocus: 'true' },
    onkeydown: (event) => {
      if (event.key === 'Escape') onCancel();
    },
  });
  return el(
    'form',
    {
      class: 'inline-form',
      onsubmit: (event) => {
        event.preventDefault();
        const text = input.value.trim();
        if (text) onSubmit(text);
      },
    },
    input,
  );
}

let saveQueue = Promise.resolve();

// The groups as last saved by this panel or read from storage. A save compares against it,
// so only edits made in this panel are recorded, not changes from another window or computer.
let baseline = [];
const setBaseline = (groups) => {
  baseline = structuredClone(groups);
};

// The background page keeps the log, and drops the events without consent.
function recordSaved(saved) {
  const events = diffGroups(baseline, saved, Date.now());
  baseline = saved;
  if (events.length > 0) chrome.runtime.sendMessage({ type: 'changes', events }).catch(() => {});
}

// Saves run one at a time, and each one saves the latest groups. Two saves at once
// can lose a group, because each one removes items that it does not know.
function persist() {
  state.saving += 1;
  state.edits += 1;
  saveQueue = saveQueue
    .then(async () => {
      try {
        const saved = structuredClone(state.groups);
        await saveGroups(saved);
        state.saveError = '';
        recordSaved(saved);
      } catch (error) {
        state.saveError = `儲存失敗：${error.message}`;
        state.groups = await loadGroups();
        setBaseline(state.groups);
        render();
      } finally {
        state.saving -= 1;
        renderStatus();
        if (state.saving === 0) syncFromStorage();
      }
    })
    .catch((error) => console.error(error));
}

// Picks up changes from another window or computer. A local edit that starts during
// the read wins over the read.
async function syncFromStorage() {
  if (state.saving > 0) return;
  const { edits } = state;
  const groups = await loadGroups();
  if (edits !== state.edits || JSON.stringify(groups) === JSON.stringify(state.groups)) return;
  state.groups = groups;
  setBaseline(groups);
  render();
  refresh();
}

function groupById(groupId) {
  return state.groups.find((group) => group.id === groupId);
}

// A loose group has no name. Its title says which tab it belongs to.
function groupTitle(group) {
  if (!group.loose) return group.name;
  const tab = group.tabId ? tabLabel(group.tabId) : '';
  return tab ? `${tab} · 未分組` : '未分組';
}

// Renames, drags and closing a group need no new quotes, and Fugle has a low limit.
function fetchNewQuotes() {
  if (visibleSymbolIds(state.groups, state.tab).some((id) => !lastFetched.has(id))) refresh();
}

// Applies a change to the groups, then saves, redraws and fetches any new quotes.
// An empty loose group is dropped, unless its add form is open, so it does not use a sync item.
function commit(change = () => {}) {
  state.notice = '';
  change();
  state.groups = state.groups.filter((group) => !group.loose || group.symbols.length > 0 || group.id === state.addingTo);
  render();
  persist();
  fetchNewQuotes();
}

function allTabIds() {
  return [ALL_TAB, ...state.customTabs.map((tab) => tab.id)];
}

function tabLabel(tabId) {
  if (tabId === ALL_TAB) return state.tabNames[ALL_TAB] || ALL_LABEL;
  return state.customTabs.find((tab) => tab.id === tabId)?.name ?? '';
}

function clearTabEditing() {
  state.editingTab = null;
  state.creatingTab = false;
}

function selectTab(tabId) {
  // Another computer can delete a tab while its button is still on the screen.
  if (!allTabIds().includes(tabId)) tabId = ALL_TAB;
  clearEditing();
  clearTabEditing();
  state.tab = tabId;
  state.notice = '';
  saveCurrentTab(tabId);
  renderTabs();
  render();
  groupsContainer.scrollTop = 0;
  renderStatus();
  fetchNewQuotes();
}

// A drop can remove the source row, and then Chrome may not send dragend.
function takeDrag() {
  const { drag } = state;
  state.drag = null;
  return drag;
}

function moveSymbolTo(drag, group, beforeSymbolId) {
  if (moveSymbol(state.groups, drag.groupId, drag.symbolId, group.id, beforeSymbolId)) {
    commit();
  } else {
    state.notice = `${tickerOf(drag.symbolId)} 已經在「${groupTitle(group)}」`;
    renderStatus();
  }
}

// Opens the add form, and opens the group too, because a closed group hides the form.
function toggleAdding(group) {
  const opening = state.addingTo !== group.id;
  clearEditing();
  if (opening) {
    state.addingTo = group.id;
    group.collapsed = false;
  }
  commit();
}

// The add form and a drop need a group, so they make the loose group of the tab.
// commit drops it again if it stays empty.
function ensureLooseGroup() {
  let group = looseGroup(state.groups, state.tab);
  if (!group) {
    group = createLooseGroup(state.tab);
    state.groups.unshift(group);
  }
  return group;
}

function toggleAddingLoose() {
  toggleAdding(ensureLooseGroup());
}

// A tab with no loose symbols shows no rows to drop on, so the bar with the add buttons
// also takes a symbol out of its group.
function makeLooseDropTarget(node) {
  node.addEventListener('dragover', (event) => {
    if (state.drag?.kind === 'symbol') markDrop(event, node, 'drop-into');
  });
  node.addEventListener('dragleave', () => node.classList.remove('drop-into'));
  node.addEventListener('drop', (event) => {
    if (state.drag?.kind !== 'symbol') return;
    event.preventDefault();
    clearDropMarks();
    moveSymbolTo(takeDrag(), ensureLooseGroup(), null);
  });
}

function clearEditing() {
  state.creating = false;
  state.renaming = null;
  state.addingTo = null;
  state.addError = '';
  resetSearch();
}

function startEditing(field, value) {
  clearEditing();
  state[field] = value;
  render();
}

function cancelEditing() {
  clearEditing();
  render();
}

// Shows a popup with the given content and buttons. Escape or a click outside closes it
// and calls onDismiss. The first button gets the focus.
// actions: [{ label, className, onClick }]. A button closes the popup, then runs its onClick.
function showDialog({ content, actions, onDismiss }) {
  const dialog = el(
    'dialog',
    { class: 'confirm-dialog' },
    el(
      'div',
      { class: 'dialog-body' },
      el('div', { class: 'dialog-content' }, ...[content].flat()),
      el(
        'div',
        { class: 'dialog-actions' },
        ...actions.map((action, index) =>
          el(
            'button',
            {
              type: 'button',
              class: `text-button ${action.className ?? ''}`.trim(),
              autofocus: index === 0,
              onclick: () => {
                dialog.close();
                action.onClick?.();
              },
            },
            action.label,
          ),
        ),
      ),
    ),
  );
  // The dialog has no padding, so a click on the dialog itself is a click on the backdrop.
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    dialog.close();
    onDismiss?.();
  });
  // Escape closes the dialog without a button.
  dialog.addEventListener('cancel', () => onDismiss?.());
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

// A delete asks first in a popup. 取消, Escape or a click outside the popup closes it.
// The focus starts on 取消, so a quick Enter does not delete.
function confirmDelete(message, onDelete) {
  showDialog({
    content: el('p', {}, message),
    actions: [
      { label: '取消' },
      { label: '刪除', className: 'danger', onClick: onDelete },
    ],
  });
}

// Asks once whether to share anonymous list changes. Escape or a click outside decides
// nothing, so the question comes back the next time the side panel opens.
function showConsentDialog() {
  const privacyLink = el('a', { href: PRIVACY_URL, target: '_blank', rel: 'noopener' }, '隱私權政策');
  showDialog({
    content: [
      el('p', { class: 'dialog-title' }, '匿名分享觀察清單？'),
      el(
        'p',
        {},
        'MultiList 會匿名記錄你的觀察清單，不含任何能認出你的個人資訊。資料只用於 MultiList 的功能開發，例如熱門代碼統計。',
      ),
      el('p', {}, privacyLink),
    ],
    actions: [
      { label: '不同意', onClick: () => setConsent(false) },
      { label: '同意', onClick: () => setConsent(true) },
    ],
  });
}

async function askForConsent() {
  if (await needsConsentDecision()) showConsentDialog();
}

function confirmGroupDelete(group) {
  confirmDelete(`刪除「${group.name}」？`, () =>
    commit(() => {
      state.groups = state.groups.filter((item) => item.id !== group.id);
      clearEditing();
    }),
  );
}

async function addSymbols(groupId, text) {
  if (state.resolving) return; // A second Enter must not submit the same text again.
  state.resolving = true;
  const errors = [];
  const added = [];
  for (const token of text.split(/[\s,，、]+/).filter(Boolean)) {
    try {
      added.push(await resolveSymbol(token));
    } catch (error) {
      errors.push(error.message);
    }
  }
  state.resolving = false;

  const group = groupById(groupId);
  if (!group) return;
  for (const symbol of added) {
    if (!addSymbol(group, symbol)) errors.push(`${tickerOf(symbol.id)} 已經在「${groupTitle(group)}」`);
  }
  state.addError = errors.join('；');
  resetSearch();
  commit();
}

// A search result keeps the TradingView name. A European stock also needs its Yahoo ticker
// for quotes, because EURONEXT:MC can be MC.PA or MC.AS.
async function addSearchResult(groupId, result) {
  if (state.resolving) return;
  const symbol = { id: result.id, name: result.name };
  if (marketOf(result.id) === 'eu') {
    state.resolving = true;
    const resolved = await resolveSymbol(result.id).catch(() => null);
    state.resolving = false;
    if (resolved?.yahoo) symbol.yahoo = resolved.yahoo;
  }
  const group = groupById(groupId);
  if (!group) return;
  state.addError = addSymbol(group, symbol) ? '' : `${result.ticker} 已經在「${groupTitle(group)}」`;
  resetSearch();
  commit();
}

// The active TradingView tab comes first, then the tab used last.
async function tradingViewTabs() {
  const tabs = await chrome.tabs.query({ url: 'https://*.tradingview.com/*' });
  return tabs.sort((a, b) => Number(b.active) - Number(a.active) || (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
}

// Runs func in the TradingView tabs until one answers without an error. Returns the last error
// if every tab fails, or null if no tab answers.
async function runInTradingView(func, args = []) {
  let failed = null;
  for (const tab of await tradingViewTabs()) {
    const [injection] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func, args }).catch(() => []);
    const result = injection?.result;
    if (result && !result.error) return result;
    failed = result ?? failed;
  }
  return failed;
}

let searchTimer = null;
let searchRun = 0;

// Drops the typed text and any search on the way, so a late answer does not fill a new form.
function resetSearch() {
  clearTimeout(searchTimer);
  searchRun += 1;
  state.search = emptySearch(state.search.type);
}

function onSearchInput(text) {
  state.search.text = text;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 200);
}

// Only the answer to the last search is shown, because an older answer can come later.
async function runSearch() {
  clearTimeout(searchTimer);
  const run = ++searchRun;
  const text = state.search.text.trim();
  if (!text) {
    Object.assign(state.search, { results: [], resultsFor: '', active: 0, message: '' });
    paintSearch();
    return;
  }
  const answer = await runInTradingView(searchSymbolsInPage, [text, state.search.type]);
  if (run !== searchRun || state.addingTo === null || text !== state.search.text.trim()) return;
  let results = [];
  let message = '';
  if (!answer) {
    message = '打開 TradingView 分頁後，就可以用代碼或名稱搜尋。現在可以輸入完整代碼（例如 BINANCE:SUIUSDT）再按 Enter。';
  } else if (answer.error) {
    message = `搜尋失敗（${answer.error}）`;
  } else {
    results = parseSearch(answer.json);
    if (results.length === 0) message = '找不到符合的標的';
  }
  Object.assign(state.search, { results, resultsFor: text, active: 0, message });
  paintSearch();
}

// Enter adds the marked result. A list of codes, or a code typed before its results come, is added as it is.
function onSearchKey(event, group) {
  // While an input method such as Zhuyin is open, Enter and the arrow keys belong to it.
  if (event.isComposing || event.keyCode === 229) return;
  const { results } = state.search;
  if (event.key === 'Escape') {
    cancelEditing();
  } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && results.length > 0) {
    event.preventDefault();
    const step = event.key === 'ArrowDown' ? 1 : -1;
    state.search.active = (state.search.active + step + results.length) % results.length;
    paintSearch();
  } else if (event.key === 'Enter') {
    event.preventDefault();
    const text = event.target.value.trim();
    if (!text) return;
    const pick = !/[\s,，、]/.test(text) && state.search.resultsFor === text ? results[state.search.active] : null;
    if (pick) addSearchResult(group.id, pick);
    else addSymbols(group.id, text);
  }
}

// A reload loses indicators that are not saved, so the URL is only the fallback.
async function showOnChartTab(tab, symbolId) {
  const [injection] = await chrome.scripting
    .executeScript({
      target: { tabId: tab.id },
      func: switchSymbolInPage,
      args: [symbolId],
    })
    .catch(() => []);
  const switched = Boolean(injection?.result);
  // A page that is still loading has no unsaved changes to lose.
  const warn = !switched && tab.status === 'complete';
  state.notice = warn ? '無法在頁面內切換，已改用重新載入，未儲存的圖表變更可能遺失' : '';
  renderStatus();
  if (!switched) await chrome.tabs.update(tab.id, { url: chartUrl(symbolId, tab.url) });
}

async function openChart(symbolId) {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (isChartUrl(active?.url)) {
    await showOnChartTab(active, symbolId);
    return;
  }
  const tabs = await chrome.tabs.query({ currentWindow: true, url: 'https://*.tradingview.com/*' });
  const chartTab = tabs.find((tab) => isChartUrl(tab.url));
  if (chartTab) {
    await chrome.tabs.update(chartTab.id, { active: true });
    await showOnChartTab(chartTab, symbolId);
  } else {
    await chrome.tabs.create({ url: chartUrl(symbolId) });
  }
}

let chartBusy = false;
let nextChartSymbol = null;

// Runs one switch at a time. During a switch, only the last clicked symbol waits its turn.
async function requestChart(symbolId) {
  nextChartSymbol = symbolId;
  if (chartBusy) return;
  chartBusy = true;
  try {
    while (nextChartSymbol) {
      const symbol = nextChartSymbol;
      nextChartSymbol = null;
      await openChart(symbol);
    }
  } catch (error) {
    console.error(error);
  } finally {
    chartBusy = false;
  }
}

function selectSymbol(symbolId) {
  state.selected = symbolId;
  for (const row of groupsContainer.querySelectorAll('.row')) {
    row.classList.toggle('selected', row.dataset.symbol === symbolId);
  }
  requestChart(symbolId);
}

function paintRow(row) {
  const quote = state.quotes.get(row.dataset.symbol);
  const direction = directionOf(quote?.change ?? 0);
  row.querySelector('.price').textContent = formatPrice(quote?.price);
  for (const [selector, text] of [
    ['.change', formatChange(quote?.change, quote?.price)],
    ['.percent', formatPercent(quote?.changePercent)],
  ]) {
    const cell = row.querySelector(selector);
    cell.textContent = text;
    cell.className = `cell ${selector.slice(1)} ${direction}`;
  }
}

function clearDropMarks() {
  for (const node of document.querySelectorAll('.drop-before, .drop-after, .drop-into')) {
    node.classList.remove('drop-before', 'drop-after', 'drop-into');
  }
}

function isLowerHalf(event, node) {
  const rect = node.getBoundingClientRect();
  return event.clientY > rect.top + rect.height / 2;
}

function markDrop(event, node, className) {
  event.preventDefault();
  clearDropMarks();
  node.classList.add(className);
}

function makeDraggable(node, dragData) {
  node.draggable = true;
  node.addEventListener('dragstart', (event) => {
    state.drag = dragData;
    event.dataTransfer.effectAllowed = 'move';
    event.stopPropagation();
  });
  node.addEventListener('dragend', () => {
    state.drag = null;
    clearDropMarks();
  });
}

function makeRowDropTarget(row, group, symbolIndex) {
  const targetAfter = () => group.symbols[symbolIndex + 1]?.id ?? null;
  row.addEventListener('dragover', (event) => {
    if (state.drag?.kind !== 'symbol') return;
    markDrop(event, row, isLowerHalf(event, row) ? 'drop-after' : 'drop-before');
  });
  row.addEventListener('drop', (event) => {
    if (state.drag?.kind !== 'symbol') return;
    event.preventDefault();
    const drag = takeDrag();
    const before = isLowerHalf(event, row) ? targetAfter() : row.dataset.symbol;
    if (before !== drag.symbolId) moveSymbolTo(drag, group, before);
  });
}

// The loose symbols always come before the groups, so a group cannot move next to them.
function makeHeaderDropTarget(header, group, groupIndex) {
  header.addEventListener('dragover', (event) => {
    if (state.drag?.kind === 'symbol') {
      markDrop(event, header, 'drop-into');
    } else if (state.drag?.kind === 'group' && !group.loose) {
      markDrop(event, header, isLowerHalf(event, header) ? 'drop-after' : 'drop-before');
    }
  });
  header.addEventListener('drop', (event) => {
    event.preventDefault();
    const drag = takeDrag();
    if (drag?.kind === 'symbol') {
      moveSymbolTo(drag, group, null);
    } else if (drag?.kind === 'group' && !group.loose) {
      const next = state.groups[groupIndex + 1]?.id ?? null;
      const before = isLowerHalf(event, header) ? next : group.id;
      if (before !== drag.groupId) commit(() => moveGroup(state.groups, drag.groupId, before));
    }
  });
}

function renderRow(group, symbol, symbolIndex) {
  const ticker = tickerOf(symbol.id);
  // A symbol with no quote source shows its exchange, because BYBIT:SUIUSDT and BINANCE:SUIUSDT look the same.
  const name = marketOf(symbol.id) ? symbol.name : [symbol.id.split(':')[0], symbol.name].filter(Boolean).join(' · ');
  const row = el(
    'div',
    {
      class: `row${state.selected === symbol.id ? ' selected' : ''}`,
      role: 'button',
      tabIndex: 0,
      'aria-label': `${ticker} ${name}`,
      dataset: { symbol: symbol.id },
      onclick: () => selectSymbol(symbol.id),
      onkeydown: (event) => {
        if (event.target === row && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          selectSymbol(symbol.id);
        }
      },
    },
    el(
      'div',
      { class: 'symbol' },
      el('span', { class: 'ticker' }, ticker),
      el('span', { class: 'name', title: name }, name),
    ),
    el('span', { class: 'cell price' }),
    el('span', { class: 'cell change' }),
    el('span', { class: 'cell percent' }),
    iconButton(
      'close',
      `從「${groupTitle(group)}」移除 ${ticker}`,
      () => commit(() => removeSymbol(group, symbol.id)),
      'row-remove',
    ),
  );
  paintRow(row);
  makeDraggable(row, { kind: 'symbol', groupId: group.id, symbolId: symbol.id });
  makeRowDropTarget(row, group, symbolIndex);
  return row;
}

function renderHeader(group, groupIndex) {
  if (state.renaming === group.id) {
    return textForm({
      label: '分組名稱',
      placeholder: '分組名稱',
      value: group.name,
      onCancel: cancelEditing,
      onSubmit: (name) =>
        commit(() => {
          group.name = name;
          clearEditing();
        }),
    });
  }

  const header = el(
    'div',
    { class: 'group-header' },
    el(
      'button',
      {
        type: 'button',
        class: 'group-toggle',
        'aria-expanded': String(!group.collapsed),
        onclick: () =>
          commit(() => {
            group.collapsed = !group.collapsed;
          }),
      },
      svgIcon('chevron'),
      el('span', { class: 'group-name' }, groupTitle(group)),
      el('span', { class: 'group-count' }, String(group.symbols.length)),
    ),
    // Loose symbols have no name to change and no group to delete.
    el(
      'span',
      { class: 'group-actions' },
      group.loose ? null : iconButton('edit', `重新命名「${group.name}」`, () => startEditing('renaming', group.id), 'secondary'),
      group.loose ? null : iconButton('trash', `刪除「${group.name}」`, () => confirmGroupDelete(group), 'secondary'),
      iconButton('plus', `新增代碼到「${groupTitle(group)}」`, () => toggleAdding(group)),
    ),
  );
  if (!group.loose) makeDraggable(header, { kind: 'group', groupId: group.id });
  makeHeaderDropTarget(header, group, groupIndex);
  return header;
}

function renderBody(group) {
  if (group.collapsed) return [];
  const nodes = group.symbols.map((symbol, index) => renderRow(group, symbol, index));
  if (group.symbols.length === 0 && state.addingTo !== group.id) {
    nodes.push(el('p', { class: 'group-empty' }, '這個分組還沒有代碼。按 + 新增。'));
  }
  if (state.addingTo === group.id) {
    nodes.push(searchForm(group));
    if (state.addError) nodes.push(el('p', { class: 'form-error', role: 'alert' }, state.addError));
  }
  return nodes;
}

function searchPanel() {
  const { results, active, message } = state.search;
  const items = results.map((result, index) =>
    el(
      'li',
      {
        class: `search-result${index === active ? ' active' : ''}`,
        role: 'option',
        id: `search-result-${index}`,
        'aria-selected': String(index === active),
        // Keeps the focus in the input, so a click does not close the form first.
        onmousedown: (event) => event.preventDefault(),
        onclick: () => addSearchResult(state.addingTo, result),
      },
      el('span', { class: 'result-ticker' }, result.ticker),
      el(
        'span',
        { class: 'result-meta' },
        result.quoted ? null : el('span', { class: 'no-quote' }, '無報價'),
        `${result.exchange} · ${result.kind}`,
      ),
      el('span', { class: 'result-name', title: result.name }, result.name),
    ),
  );
  return [
    items.length > 0 ? el('ul', { class: 'search-results', role: 'listbox', id: 'search-results', 'aria-label': '搜尋結果' }, ...items) : null,
    message ? el('p', { class: 'search-message', role: 'status' }, message) : null,
  ];
}

function searchForm(group) {
  const input = el('input', {
    type: 'text',
    placeholder: '代碼或名稱，例如 2330、台積電、AAPL、BTC',
    value: state.search.text,
    'aria-label': `新增代碼到「${groupTitle(group)}」`,
    role: 'combobox',
    'aria-autocomplete': 'list',
    'aria-controls': 'search-results',
    autocomplete: 'off',
    spellcheck: false,
    dataset: { autofocus: 'true' },
    // An input method sends text that is not finished, for example ㄊㄞˊ. Search when it ends.
    oninput: (event) => {
      if (!event.isComposing) onSearchInput(input.value);
    },
    oncompositionend: () => onSearchInput(input.value),
    onkeydown: (event) => onSearchKey(event, group),
  });
  const types = SEARCH_TYPES.map(([type, label]) =>
    el(
      'button',
      {
        type: 'button',
        class: 'search-type',
        'aria-pressed': String(state.search.type === type),
        dataset: { type },
        onclick: () => {
          state.search.type = type;
          paintSearch();
          input.focus();
          runSearch();
        },
      },
      label,
    ),
  );
  return el(
    'form',
    { class: 'inline-form symbol-search', onsubmit: (event) => event.preventDefault() },
    input,
    el('div', { class: 'search-types', role: 'group', 'aria-label': '搜尋類型' }, ...types),
    el('div', { class: 'search-panel' }, ...searchPanel()),
  );
}

// Typing does not redraw the groups, so only the search part changes.
function paintSearch() {
  const form = groupsContainer.querySelector('.symbol-search');
  if (!form) return;
  for (const button of form.querySelectorAll('.search-type')) {
    button.setAttribute('aria-pressed', String(button.dataset.type === state.search.type));
  }
  const panel = form.querySelector('.search-panel');
  panel.replaceChildren(...searchPanel().filter(Boolean));
  const input = form.querySelector('input');
  const active = panel.querySelector('.search-result.active');
  input.setAttribute('aria-expanded', String(state.search.results.length > 0));
  if (active) {
    input.setAttribute('aria-activedescendant', active.id);
    active.scrollIntoView({ block: 'nearest' });
  } else {
    input.removeAttribute('aria-activedescendant');
  }
}

let importRun = 0;

async function startImport() {
  if (state.importing?.step === 'working') return;
  const run = ++importRun;
  state.importing = { step: 'loading' };
  render();
  const answer = await runInTradingView(readWatchlistsInPage);
  if (run !== importRun) return;
  state.importing = importChoice(answer);
  render();
}

function importChoice(answer) {
  const error = (message) => ({ step: 'error', message });
  if (!answer) return error('找不到 TradingView 分頁。請先在 Chrome 打開 TradingView 並登入，再按一次匯入。');
  if (answer.error) return error(`讀取 TradingView 名單失敗（${answer.error}）`);
  if (!Array.isArray(answer.lists)) return error('看不懂 TradingView 回傳的名單，TradingView 可能已經改版。');
  if (isSignedOut(answer.lists)) return error('TradingView 分頁沒有登入。請先登入 TradingView，再按一次匯入。');
  const lists = watchlistsToTabs(answer.lists).filter((list) => list.count > 0);
  if (lists.length === 0) return error('你的 TradingView 名單都是空的。');
  return { step: 'choose', lists, chosen: new Set(lists.map((_, index) => index)) };
}

function closeImport() {
  importRun += 1;
  state.importing = null;
  render();
}

async function eachLimit(items, limit, task) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await task(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

// Keeps the TradingView symbol id and gets only the name, and the Yahoo ticker of a European stock.
// Binance names are empty, and a symbol without a quote source has no lookup.
async function importedSymbol(id) {
  const market = marketOf(id);
  if (market === null || market === 'crypto' || market === 'perp') return { id, name: '' };
  const resolved = await resolveSymbol(id).catch(() => null);
  const symbol = { id, name: resolved?.name ?? '' };
  if (resolved?.yahoo) symbol.yahoo = resolved.yahoo;
  return symbol;
}

// The new tabs and groups, and the sync usage after they are added.
function buildImport(picked, symbolOf) {
  const tabs = picked.map((list) => ({ id: crypto.randomUUID().slice(0, 8), name: list.name }));
  const groups = picked.flatMap((list, index) =>
    list.groups.map((item) => ({ ...createGroup(item.name), tabId: tabs[index].id, symbols: item.symbolIds.map(symbolOf) })),
  );
  const usage = syncUsage([...state.groups, ...groups], { names: state.tabNames, custom: [...state.customTabs, ...tabs] });
  return { tabs, groups, usage };
}

function quotaMessage(usage) {
  if (usage.tooLarge) {
    return `「${groupTitle(usage.tooLarge)}」有 ${usage.tooLarge.symbols.length} 個代碼，超過 Chrome 同步的單一分組上限（8 KB）。請在 TradingView 把這個區段拆小，或不要勾選這個清單。`;
  }
  if (usage.tooMany) return `匯入後會有 ${usage.items} 個同步項目，超過 Chrome 上限 512 個。請少選幾個清單。`;
  return `匯入後會用掉 ${Math.ceil(usage.total / 1024)} KB，超過 Chrome 同步上限 100 KB。請少選幾個清單。`;
}

async function runImport() {
  const { lists, chosen } = state.importing;
  const picked = lists.filter((_, index) => chosen.has(index));
  if (picked.length === 0) return;
  // Names only make the groups larger, so an import that does not fit without names stops before the lookups.
  const bare = buildImport(picked, (id) => ({ id, name: '' }));
  if (!bare.usage.fits) {
    state.importing = { step: 'error', message: quotaMessage(bare.usage) };
    render();
    return;
  }
  const run = ++importRun;
  const ids = [...new Set(picked.flatMap((list) => list.groups.flatMap((group) => group.symbolIds)))];
  state.importing = { step: 'working', done: 0, total: ids.length };
  render();

  const symbols = new Map();
  await eachLimit(ids, IMPORT_LIMIT, async (id) => {
    symbols.set(id, await importedSymbol(id));
    state.importing.done += 1;
    const progress = groupsContainer.querySelector('.import-progress');
    if (progress) progress.textContent = importProgressText();
  });
  if (run !== importRun) return;

  // Each group gets its own copy, so a later change to one group does not change another.
  const { tabs, groups, usage } = buildImport(picked, (id) => ({ ...symbols.get(id) }));
  if (!usage.fits) {
    state.importing = { step: 'error', message: quotaMessage(usage) };
    render();
    return;
  }

  state.importing = null;
  state.customTabs.push(...tabs);
  state.groups.push(...groups);
  persistTabs();
  persist();
  selectTab(tabs[0].id);
  state.notice = `已匯入 ${tabs.length} 個分頁、${groups.length} 個分組、${ids.length} 個代碼`;
  renderStatus();
}

const importProgressText = () => `正在查詢名稱 ${state.importing.done} / ${state.importing.total}…`;

function importPanel() {
  const { step } = state.importing;
  const title = el('p', { class: 'import-title' }, '從 TradingView 匯入名單');
  const closeButton = (label) => el('button', { type: 'button', class: 'text-button', onclick: closeImport }, label);
  if (step === 'loading') {
    return el('section', { class: 'import-panel' }, title, el('p', { class: 'hint' }, '正在讀取 TradingView 名單…'), el('div', { class: 'form-actions' }, closeButton('取消')));
  }
  if (step === 'working') {
    return el('section', { class: 'import-panel' }, title, el('p', { class: 'hint import-progress', role: 'status' }, importProgressText()));
  }
  if (step === 'error') {
    return el(
      'section',
      { class: 'import-panel' },
      title,
      el('p', { class: 'form-error import-error', role: 'alert' }, state.importing.message),
      el('div', { class: 'form-actions' }, closeButton('關閉')),
    );
  }
  const { lists, chosen } = state.importing;
  const items = lists.map((list, index) =>
    el(
      'label',
      { class: 'import-item' },
      el('input', {
        type: 'checkbox',
        checked: chosen.has(index),
        onchange: (event) => {
          if (event.target.checked) chosen.add(index);
          else chosen.delete(index);
          groupsContainer.querySelector('.import-start').disabled = chosen.size === 0;
        },
      }),
      el('span', { class: 'import-name' }, list.name),
      el('span', { class: 'hint' }, `${list.count} 檔 · ${list.groups.length} 組`),
    ),
  );
  return el(
    'section',
    { class: 'import-panel' },
    title,
    el('p', { class: 'hint' }, '每個清單會變成一個分頁，清單裡的區段會變成分組。'),
    ...items,
    el(
      'div',
      { class: 'form-actions' },
      el('button', { type: 'button', class: 'text-button primary import-start', disabled: chosen.size === 0, onclick: runImport }, '匯入'),
      closeButton('取消'),
    ),
  );
}

function render() {
  const { scrollTop } = groupsContainer;
  const nodes = [];
  const own = looseGroup(state.groups, state.tab);
  if (state.importing) nodes.push(importPanel());
  if (state.creating) {
    nodes.push(
      el(
        'div',
        { class: 'add-group-form' },
        textForm({
          label: '新分組名稱',
          placeholder: '新分組名稱，按 Enter 建立',
          onCancel: cancelEditing,
          onSubmit: (name) =>
            commit(() => {
              const group = createGroup(name);
              if (state.tab !== ALL_TAB) group.tabId = state.tab;
              state.groups.push(group);
              clearEditing();
              state.addingTo = group.id;
            }),
        }),
      ),
    );
  } else {
    const actions = el(
      'div',
      { class: 'list-actions' },
      el('button', { type: 'button', class: 'list-action add-group', onclick: () => startEditing('creating', true) }, svgIcon('plus'), '新增分組'),
      el(
        'button',
        {
          type: 'button',
          class: 'list-action add-symbol',
          'aria-pressed': String(Boolean(own) && state.addingTo === own.id),
          onclick: toggleAddingLoose,
        },
        svgIcon('plus'),
        '新增代碼',
      ),
    );
    makeLooseDropTarget(actions);
    nodes.push(actions);
  }
  const first = nodes.length;
  if (own) nodes.push(looseSection(own));
  if (state.tab === ALL_TAB) {
    for (const group of otherLooseGroups()) {
      nodes.push(el('section', { class: 'group' }, renderHeader(group, state.groups.indexOf(group)), ...renderBody(group)));
    }
  }
  state.groups.forEach((group, index) => {
    if (group.loose || !groupInTab(group, state.tab)) return;
    nodes.push(el('section', { class: 'group' }, renderHeader(group, index), ...renderBody(group)));
  });
  if (nodes.slice(first).every((node) => node === null)) nodes.push(el('p', { class: 'empty' }, emptyText()));
  groupsContainer.replaceChildren(...nodes.filter(Boolean));
  groupsContainer.scrollTop = scrollTop;
  groupsContainer.querySelector('[data-autofocus]')?.focus();
}

// The loose symbols of the tab come first, with no header. The add form comes before them,
// next to the button that opens it.
function looseSection(group) {
  const nodes = [];
  if (state.addingTo === group.id) {
    nodes.push(searchForm(group));
    if (state.addError) nodes.push(el('p', { class: 'form-error', role: 'alert' }, state.addError));
  }
  nodes.push(...group.symbols.map((symbol, index) => renderRow(group, symbol, index)));
  return nodes.length > 0 ? el('section', { class: 'group loose' }, ...nodes) : null;
}

// The all tab also shows the loose symbols of each custom tab, in the order of the tabs.
function otherLooseGroups() {
  const order = (group) => {
    const index = state.customTabs.findIndex((tab) => tab.id === group.tabId);
    return index === -1 ? state.customTabs.length : index;
  };
  return state.groups
    .filter((group) => group.loose && group.tabId && (group.symbols.length > 0 || state.addingTo === group.id))
    .sort((a, b) => order(a) - order(b));
}

function emptyText() {
  if (state.tab === ALL_TAB) return '還沒有代碼。按上方的「新增代碼」加入標的，或按「新增分組」建立分組。';
  return `「${tabLabel(state.tab)}」還沒有代碼。按上方的「新增代碼」加入標的，或把其他分頁的分組標題拖到這個分頁上。`;
}

function renderStatus() {
  const errors = state.sourceStatus
    .filter((item) => item.errors.length > 0)
    .map((item) => `${MARKET_LABELS[item.market]}：${item.errors.join('、')}`);
  if (state.saveError) errors.unshift(state.saveError);
  if (state.notice) errors.unshift(state.notice);
  document.getElementById('status-error').textContent = errors.join('；');

  const sources = state.sourceStatus
    .filter((item) => item.source)
    .map((item) => `${MARKET_LABELS[item.market]} ${item.source}`);
  const time = state.updatedAt ? `更新於 ${formatTime(state.updatedAt)}` : '';
  document.getElementById('status').textContent = [time, ...sources].filter(Boolean).join(' · ');
}

let refreshing = false;
let refreshAgain = false;
let lastFetched = new Set();

// Runs one fetch at a time. A request during a fetch runs again after that fetch ends.
// European symbols keep the Yahoo ticker that the quotes need.
function yahooTickers() {
  const symbols = state.groups.flatMap((group) => group.symbols).filter((item) => item.yahoo);
  return new Map(symbols.map((item) => [item.id, item.yahoo]));
}

async function refresh() {
  if (refreshing) {
    refreshAgain = true;
    return;
  }
  if (document.hidden) return;

  refreshing = true;
  try {
    const symbolIds = visibleSymbolIds(state.groups, state.tab);
    lastFetched = new Set(symbolIds);
    const { quotes, status } = await fetchQuotes(symbolIds, state.keys, yahooTickers());
    for (const [id, quote] of quotes) state.quotes.set(id, quote);
    state.sourceStatus = status;
    if (quotes.size > 0) state.updatedAt = new Date();
    for (const row of groupsContainer.querySelectorAll('.row')) paintRow(row);
    renderStatus();
  } finally {
    refreshing = false;
    if (refreshAgain) {
      refreshAgain = false;
      refresh();
    }
  }
}

function setUpTopbar() {
  document
    .getElementById('topbar-actions')
    .append(iconButton('import', '從 TradingView 匯入名單', startImport));
}

// The counters work like the ones for groups: a sync does not replace tabs that are not saved yet.
function persistTabs() {
  state.tabSaving += 1;
  state.tabEdits += 1;
  saveTabs({ names: state.tabNames, custom: state.customTabs })
    .catch((error) => {
      state.saveError = `儲存失敗：${error.message}`;
      renderStatus();
    })
    .finally(() => {
      state.tabSaving -= 1;
      if (state.tabSaving === 0) syncTabs();
    });
}

async function syncTabs() {
  if (state.tabSaving > 0) return;
  const { tabEdits } = state;
  const tabs = await loadTabs();
  if (tabEdits !== state.tabEdits) return;
  if (JSON.stringify(tabs) === JSON.stringify({ names: state.tabNames, custom: state.customTabs })) return;
  const before = state.tab;
  applyTabs(tabs);
  // A redraw during a rename would lose the text that the user is typing.
  if (!state.editingTab && !state.creatingTab) renderTabs();
  render();
  if (state.tab !== before) {
    saveCurrentTab(state.tab);
    fetchNewQuotes();
  }
}

function stopTabEditing() {
  clearTabEditing();
  renderTabs();
}

// An empty name, or the default name, goes back to the default name of the all tab.
// A custom tab keeps its old name if the new name is empty.
function renameTab(tabId, name) {
  state.editingTab = null;
  if (tabId === ALL_TAB) {
    if (name && name !== ALL_LABEL) state.tabNames[ALL_TAB] = name;
    else delete state.tabNames[ALL_TAB];
  } else if (name) {
    const tab = state.customTabs.find((item) => item.id === tabId);
    if (tab) tab.name = name;
  }
  persistTabs();
  renderTabs();
  render();
}

function createTab(name) {
  const tab = { id: crypto.randomUUID().slice(0, 8), name };
  state.customTabs.push(tab);
  persistTabs();
  selectTab(tab.id);
}

function deleteTab(tabId) {
  state.customTabs = state.customTabs.filter((tab) => tab.id !== tabId);
  persistTabs();
  releaseGroups(state.groups, tabId);
  persist();
  selectTab(ALL_TAB);
}

function tabNameField({ value, placeholder, label, onSubmit, onCancel }) {
  const input = el('input', {
    type: 'text',
    class: 'tab-input',
    value,
    placeholder,
    maxLength: 10,
    'aria-label': label,
    autocomplete: 'off',
    spellcheck: false,
    onkeydown: (event) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        onSubmit(input.value.trim());
      } else if (event.key === 'Escape') {
        onCancel();
      }
    },
  });
  return [input, iconButton('check', '儲存名稱', () => onSubmit(input.value.trim()), 'tab-save')];
}

function tabEditor(tabId) {
  const parts = tabNameField({
    value: tabLabel(tabId),
    placeholder: tabId === ALL_TAB ? ALL_LABEL : '分頁名稱',
    label: tabId === ALL_TAB
      ? `「${tabLabel(tabId)}」分頁名稱，清空可還原預設`
      : `「${tabLabel(tabId)}」分頁名稱`,
    onSubmit: (name) => renameTab(tabId, name),
    onCancel: stopTabEditing,
  });
  return el('span', { class: 'tab-current' }, ...parts);
}

function confirmTabDelete(tabId) {
  const count = state.groups.filter((group) => group.tabId === tabId && !group.loose).length;
  const loose = looseGroup(state.groups, tabId)?.symbols.length ?? 0;
  const parts = [count > 0 ? `${count} 個分組` : '', loose > 0 ? `${loose} 個未分組代碼` : ''].filter(Boolean);
  const keep = parts.length > 0 ? `裡面的 ${parts.join('、')}會留在「${tabLabel(ALL_TAB)}」。` : '';
  confirmDelete(`刪除「${tabLabel(tabId)}」分頁？${keep}`, () => deleteTab(tabId));
}

// Drop a group header on a tab to move the group there.
function makeTabDropTarget(button, tabId) {
  button.addEventListener('dragover', (event) => {
    if (state.drag?.kind === 'group') markDrop(event, button, 'drop-into');
  });
  button.addEventListener('dragleave', () => button.classList.remove('drop-into'));
  button.addEventListener('drop', (event) => {
    if (state.drag?.kind !== 'group') return;
    event.preventDefault();
    clearDropMarks();
    const group = groupById(takeDrag().groupId);
    const target = tabId === ALL_TAB ? undefined : tabId;
    if (!group || group.tabId === target || !allTabIds().includes(tabId)) return;
    const from = group.tabId;
    commit(() => moveGroupToTab(group, tabId));
    state.notice = target
      ? `「${group.name}」已移到「${tabLabel(tabId)}」`
      : `「${group.name}」已移出「${tabLabel(from) || '自訂分頁'}」`;
    renderStatus();
  });
}

// A custom tab has an x that deletes it. The all tab cannot be deleted.
function tabButton(tabId) {
  const current = tabId === state.tab;
  const item = el(
    'span',
    { class: current ? 'tab-item current' : 'tab-item' },
    el(
      'button',
      {
        type: 'button',
        class: 'tab',
        'aria-pressed': String(current),
        dataset: { tab: tabId },
        onclick: () => selectTab(tabId),
      },
      tabLabel(tabId),
    ),
    tabId === ALL_TAB ? null : iconButton('close', `刪除「${tabLabel(tabId)}」分頁`, () => confirmTabDelete(tabId), 'tab-close'),
  );
  makeTabDropTarget(item, tabId);
  return item;
}

// The pencil and the + stay at the right end, so a tab click never moves the tabs.
function tabActions() {
  return el(
    'div',
    { class: 'tab-actions' },
    iconButton(
      'edit',
      `重新命名「${tabLabel(state.tab)}」分頁`,
      () => {
        clearTabEditing();
        state.editingTab = state.tab;
        renderTabs();
      },
      'tab-edit',
    ),
    iconButton(
      'plus',
      '新增分頁',
      () => {
        clearTabEditing();
        state.creatingTab = true;
        renderTabs();
      },
      'tab-add',
    ),
  );
}

function renderTabs() {
  const nav = document.getElementById('market-tabs');
  const items = allTabIds().map((id) => (state.editingTab === id ? tabEditor(id) : tabButton(id)));
  if (state.creatingTab) {
    items.push(
      el(
        'span',
        { class: 'tab-current' },
        ...tabNameField({
          value: '',
          placeholder: '新分頁名稱',
          label: '新分頁名稱',
          onSubmit: (name) => (name ? createTab(name) : stopTabEditing()),
          onCancel: stopTabEditing,
        }),
      ),
    );
  }
  nav.replaceChildren(el('div', { class: 'tab-list' }, ...items), tabActions());
  const input = nav.querySelector('input');
  input?.focus();
  input?.select();
  (input ?? nav.querySelector('.tab[aria-pressed="true"]'))?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

// Another computer can delete the current tab, or the tab that is open for editing.
function applyTabs({ names, custom }) {
  state.tabNames = names;
  state.customTabs = custom;
  const ids = allTabIds();
  if (!ids.includes(state.tab)) state.tab = ALL_TAB;
  if (!ids.includes(state.editingTab)) state.editingTab = null;
}

function applyColumnWidths(widths) {
  state.columnWidths = widths;
  document.documentElement.style.setProperty('--columns', columnsTemplate(widths));
}

// The width of the widest number in each column on the screen.
function numberWidths() {
  const range = document.createRange();
  return ['price', 'change', 'percent'].map((name) => {
    let widest = 0;
    for (const cell of groupsContainer.querySelectorAll(`.row .${name}`)) {
      range.selectNodeContents(cell);
      widest = Math.max(widest, Math.ceil(range.getBoundingClientRect().width));
    }
    return widest;
  });
}

// Each number column header has a line on its left. Drag the line to move it.
// Double-click a line to go back to the default widths.
function setUpColumns(saved) {
  applyColumnWidths(validWidths(saved) ? saved : DEFAULT_WIDTHS);
  const header = document.querySelector('.columns');
  const symbolHeader = header.firstElementChild;
  header.querySelectorAll('.cell').forEach((cell, index) => {
    const handle = el('span', { class: 'col-resize', title: '拖曳調整欄寬，按兩下還原預設' });
    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      const start = {
        x: event.clientX,
        widths: state.columnWidths,
        symbol: symbolHeader.getBoundingClientRect().width,
        mins: numberWidths(),
      };
      document.body.classList.add('resizing-columns');
      handle.classList.add('dragging');
      const move = (moveEvent) =>
        applyColumnWidths(resizeColumns(start.widths, index, moveEvent.clientX - start.x, start.symbol, start.mins));
      const end = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', end);
        handle.removeEventListener('pointercancel', end);
        document.body.classList.remove('resizing-columns');
        handle.classList.remove('dragging');
        if (state.columnWidths !== start.widths) saveColumnWidths(state.columnWidths);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', end);
      handle.addEventListener('pointercancel', end);
    });
    handle.addEventListener('dblclick', () => {
      applyColumnWidths(DEFAULT_WIDTHS);
      saveColumnWidths(DEFAULT_WIDTHS);
    });
    cell.append(handle);
  });
}

function setUpKeysForm() {
  const fugle = document.getElementById('key-fugle');
  const alpacaId = document.getElementById('key-alpaca-id');
  const alpacaSecret = document.getElementById('key-alpaca-secret');
  fugle.value = state.keys.fugle ?? '';
  alpacaId.value = state.keys.alpacaId ?? '';
  alpacaSecret.value = state.keys.alpacaSecret ?? '';

  document.getElementById('keys-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    state.keys = {
      fugle: fugle.value.trim(),
      alpacaId: alpacaId.value.trim(),
      alpacaSecret: alpacaSecret.value.trim(),
    };
    await saveKeys(state.keys);
    document.getElementById('keys-saved').textContent = '已儲存';
    refresh();
  });
}

// The checkbox in the settings follows the consent, also when another window changes it.
function setUpSharingToggle() {
  const toggle = document.getElementById('sharing-toggle');
  document.getElementById('sharing-privacy').href = PRIVACY_URL;
  const show = async () => {
    toggle.checked = await hasConsent();
  };
  toggle.addEventListener('change', () => setConsent(toggle.checked));
  show();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.consent) show();
  });
}

function watchStorage() {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (tabsChanged(changes)) syncTabs();
    syncFromStorage();
  });
}

async function start() {
  let tabs;
  let widths;
  [state.groups, state.keys, state.tab, tabs, widths] = await Promise.all([
    loadGroups(),
    loadKeys(),
    loadCurrentTab(),
    loadTabs(),
    loadColumnWidths(),
  ]);
  setBaseline(state.groups);
  // Lets the background page send the weekly upload if it is due.
  chrome.runtime.sendMessage({ type: 'panelOpened' }).catch(() => {});
  applyTabs(tabs);
  setUpColumns(widths);
  setUpTopbar();
  renderTabs();
  setUpSharingToggle();
  setUpKeysForm();
  watchStorage();
  render();
  refresh();
  setInterval(refresh, REFRESH_MS);
  document.addEventListener('visibilitychange', refresh);
  await askForConsent();
}

start();
