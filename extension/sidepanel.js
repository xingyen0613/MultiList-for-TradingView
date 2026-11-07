import { switchSymbolInPage } from './lib/chart-page.js';
import { columnsTemplate, DEFAULT_WIDTHS, resizeColumns, validWidths } from './lib/columns.js';
import { directionOf, formatChange, formatPercent, formatPrice, formatTime } from './lib/format.js';
import {
  addSymbol,
  createGroup,
  groupInTab,
  inMarket,
  isMarketTab,
  marketOfTab,
  moveGroup,
  moveGroupToTab,
  moveSymbol,
  releaseGroups,
  removeSymbol,
  symbolsInMarket,
  visibleSymbolIds,
} from './lib/groups.js';
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
  tabsChanged,
} from './lib/store.js';
import { chartUrl, isChartUrl, tickerOf } from './lib/symbols.js';

const REFRESH_MS = 30_000;
const MARKET_LABELS = { tw: '台股', us: '美股', eu: '歐股', crypto: '加密貨幣' };
const MARKET_TABS = { all: '全部', ...MARKET_LABELS };
const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
};

const state = {
  groups: [],
  tab: 'all',
  tabNames: {},
  customTabs: [],
  editingTab: null,
  creatingTab: false,
  confirmingTabDelete: null,
  tabSaving: 0,
  tabEdits: 0,
  columnWidths: DEFAULT_WIDTHS,
  quotes: new Map(),
  keys: {},
  selected: null,
  creating: false,
  renaming: null,
  confirmingDelete: null,
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

// Saves run one at a time, and each one saves the latest groups. Two saves at once
// can lose a group, because each one removes items that it does not know.
function persist() {
  state.saving += 1;
  state.edits += 1;
  saveQueue = saveQueue
    .then(async () => {
      try {
        await saveGroups(state.groups);
        state.saveError = '';
      } catch (error) {
        state.saveError = `儲存失敗：${error.message}`;
        state.groups = await loadGroups();
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
  render();
  refresh();
}

function groupById(groupId) {
  return state.groups.find((group) => group.id === groupId);
}

// Renames, drags and closing a group need no new quotes, and Fugle has a low limit.
function fetchNewQuotes() {
  if (visibleSymbolIds(state.groups, state.tab).some((id) => !lastFetched.has(id))) refresh();
}

// Applies a change to the groups, then saves, redraws and fetches any new quotes.
function commit(change = () => {}) {
  state.notice = '';
  change();
  render();
  persist();
  fetchNewQuotes();
}

function allTabIds() {
  return [...Object.keys(MARKET_TABS), ...state.customTabs.map((tab) => tab.id)];
}

function tabLabel(tabId) {
  if (isMarketTab(tabId)) return state.tabNames[tabId] || MARKET_TABS[tabId];
  return state.customTabs.find((tab) => tab.id === tabId)?.name ?? '';
}

const currentMarket = () => marketOfTab(state.tab);

function clearTabEditing() {
  state.editingTab = null;
  state.creatingTab = false;
  state.confirmingTabDelete = null;
}

function selectTab(tabId) {
  // Another computer can delete a tab while its button is still on the screen.
  if (!allTabIds().includes(tabId)) tabId = 'all';
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
    state.notice = `${tickerOf(drag.symbolId)} 已經在「${group.name}」`;
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

function clearEditing() {
  state.creating = false;
  state.renaming = null;
  state.confirmingDelete = null;
  state.addingTo = null;
  state.addError = '';
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
  const hidden = [];
  for (const symbol of added) {
    if (!addSymbol(group, symbol)) errors.push(`${tickerOf(symbol.id)} 已經在這個分組`);
    else if (!inMarket(symbol.id, currentMarket())) hidden.push(tickerOf(symbol.id));
  }
  state.addError = errors.join('；');
  commit();
  if (hidden.length > 0) {
    state.notice = `${hidden.join('、')} 已加入，但不屬於「${tabLabel(state.tab)}」，請到對應市場的分頁查看`;
    renderStatus();
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

function makeHeaderDropTarget(header, group, groupIndex) {
  header.addEventListener('dragover', (event) => {
    if (state.drag?.kind === 'symbol') {
      markDrop(event, header, 'drop-into');
    } else if (state.drag?.kind === 'group') {
      markDrop(event, header, isLowerHalf(event, header) ? 'drop-after' : 'drop-before');
    }
  });
  header.addEventListener('drop', (event) => {
    event.preventDefault();
    const drag = takeDrag();
    if (drag?.kind === 'symbol') {
      moveSymbolTo(drag, group, null);
    } else if (drag?.kind === 'group') {
      const next = state.groups[groupIndex + 1]?.id ?? null;
      const before = isLowerHalf(event, header) ? next : group.id;
      if (before !== drag.groupId) commit(() => moveGroup(state.groups, drag.groupId, before));
    }
  });
}

function renderRow(group, symbol, symbolIndex) {
  const ticker = tickerOf(symbol.id);
  const row = el(
    'div',
    {
      class: `row${state.selected === symbol.id ? ' selected' : ''}`,
      role: 'button',
      tabIndex: 0,
      'aria-label': `${ticker} ${symbol.name}`,
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
      el('span', { class: 'name', title: symbol.name }, symbol.name),
    ),
    el('span', { class: 'cell price' }),
    el('span', { class: 'cell change' }),
    el('span', { class: 'cell percent' }),
    iconButton(
      'close',
      `從「${group.name}」移除 ${ticker}`,
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

  const shownCount = symbolsInMarket(group, currentMarket()).length;

  if (state.confirmingDelete === group.id) {
    const hiddenCount = group.symbols.length - shownCount;
    const warning = hiddenCount > 0 ? `其他市場的 ${hiddenCount} 檔也會一起刪除。` : '';
    return el(
      'div',
      { class: 'confirm' },
      el('span', {}, `刪除「${group.name}」？${warning}`),
      el(
        'button',
        {
          type: 'button',
          class: 'text-button danger',
          onclick: () =>
            commit(() => {
              state.groups = state.groups.filter((item) => item.id !== group.id);
              clearEditing();
            }),
        },
        '刪除',
      ),
      el('button', { type: 'button', class: 'text-button', onclick: cancelEditing }, '取消'),
    );
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
      el('span', { class: 'group-name' }, group.name),
      el('span', { class: 'group-count' }, String(shownCount)),
    ),
    el(
      'span',
      { class: 'group-actions' },
      iconButton('edit', `重新命名「${group.name}」`, () => startEditing('renaming', group.id), 'secondary'),
      iconButton('trash', `刪除「${group.name}」`, () => startEditing('confirmingDelete', group.id), 'secondary'),
      iconButton('plus', `新增代碼到「${group.name}」`, () => toggleAdding(group)),
    ),
  );
  makeDraggable(header, { kind: 'group', groupId: group.id });
  makeHeaderDropTarget(header, group, groupIndex);
  return header;
}

function renderBody(group) {
  if (group.collapsed) return [];
  // The index is the place in the whole group, so a drop keeps the order of hidden symbols.
  const nodes = group.symbols.flatMap((symbol, index) =>
    inMarket(symbol.id, currentMarket()) ? [renderRow(group, symbol, index)] : [],
  );
  if (group.symbols.length === 0 && state.addingTo !== group.id) {
    nodes.push(el('p', { class: 'group-empty' }, '這個分組還沒有代碼。按 + 新增。'));
  }
  if (state.addingTo === group.id) {
    nodes.push(
      textForm({
        label: `新增代碼到「${group.name}」`,
        placeholder: '例如 2330、AAPL、IFX、BTCUSDT',
        onCancel: cancelEditing,
        onSubmit: (text) => addSymbols(group.id, text),
      }),
    );
    if (state.addError) nodes.push(el('p', { class: 'form-error', role: 'alert' }, state.addError));
  }
  return nodes;
}

function render() {
  const { scrollTop } = groupsContainer;
  const nodes = [];
  if (state.creating) {
    nodes.push(
      textForm({
        label: '新分組名稱',
        placeholder: '新分組名稱，按 Enter 建立',
        onCancel: cancelEditing,
        onSubmit: (name) =>
          commit(() => {
            const group = createGroup(name);
            if (!isMarketTab(state.tab)) group.tabId = state.tab;
            state.groups.push(group);
            clearEditing();
            state.addingTo = group.id;
          }),
      }),
    );
  }
  state.groups.forEach((group, index) => {
    // The add form stays open after the group gets a symbol of another market.
    if (!groupInTab(group, state.tab) && state.addingTo !== group.id) return;
    nodes.push(el('section', { class: 'group' }, renderHeader(group, index), ...renderBody(group)));
  });
  if (nodes.length === 0) nodes.push(el('p', { class: 'empty' }, emptyText()));
  groupsContainer.replaceChildren(...nodes);
  groupsContainer.scrollTop = scrollTop;
  groupsContainer.querySelector('[data-autofocus]')?.focus();
}

function emptyText() {
  if (state.groups.length === 0) return '還沒有分組。按右上角的 + 建立第一個分組。';
  const label = tabLabel(state.tab);
  if (!isMarketTab(state.tab)) {
    return `「${label}」還沒有分組。按右上角的 + 建立分組，或把其他分頁的分組標題拖到這個分頁上。`;
  }
  return `「${label}」還沒有代碼。按右上角的 + 建立分組，或到「${tabLabel('all')}」分頁新增。`;
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
    .append(iconButton('plus', '新增分組', () => startEditing('creating', true)));
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

// An empty name, or the default name, goes back to the default name of a market tab.
// A custom tab keeps its old name if the new name is empty.
function renameTab(tabId, name) {
  state.editingTab = null;
  if (isMarketTab(tabId)) {
    if (name && name !== MARKET_TABS[tabId]) state.tabNames[tabId] = name;
    else delete state.tabNames[tabId];
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
  selectTab('all');
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
    placeholder: MARKET_TABS[tabId] ?? '分頁名稱',
    label: isMarketTab(tabId)
      ? `「${tabLabel(tabId)}」分頁名稱，清空可還原預設`
      : `「${tabLabel(tabId)}」分頁名稱`,
    onSubmit: (name) => renameTab(tabId, name),
    onCancel: stopTabEditing,
  });
  if (!isMarketTab(tabId)) {
    parts.push(
      iconButton(
        'trash',
        `刪除「${tabLabel(tabId)}」分頁`,
        () => {
          state.editingTab = null;
          state.confirmingTabDelete = tabId;
          renderTabs();
        },
        'tab-delete',
      ),
    );
  }
  return el('span', { class: 'tab-current' }, ...parts);
}

function tabDeleteConfirm(tabId) {
  const count = state.groups.filter((group) => group.tabId === tabId).length;
  const keep = count > 0 ? `裡面的 ${count} 個分組會留在「${tabLabel('all')}」。` : '';
  return el(
    'div',
    { class: 'confirm' },
    el('span', {}, `刪除「${tabLabel(tabId)}」分頁？${keep}`),
    el('button', { type: 'button', class: 'text-button danger', onclick: () => deleteTab(tabId) }, '刪除'),
    el('button', { type: 'button', class: 'text-button', onclick: stopTabEditing }, '取消'),
  );
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
    const target = isMarketTab(tabId) ? undefined : tabId;
    if (!group || group.tabId === target || !allTabIds().includes(tabId)) return;
    const from = group.tabId;
    commit(() => moveGroupToTab(group, tabId));
    state.notice = target
      ? `「${group.name}」已移到「${tabLabel(tabId)}」`
      : `「${group.name}」已移出「${tabLabel(from) || '自訂分頁'}」`;
    renderStatus();
  });
}

function tabButton(tabId) {
  const button = el(
    'button',
    {
      type: 'button',
      class: 'tab',
      'aria-pressed': String(tabId === state.tab),
      dataset: { tab: tabId },
      onclick: () => selectTab(tabId),
    },
    tabLabel(tabId),
  );
  makeTabDropTarget(button, tabId);
  return button;
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
  if (state.confirmingTabDelete) {
    nav.replaceChildren(tabDeleteConfirm(state.confirmingTabDelete));
    return;
  }
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
  if (!ids.includes(state.tab)) state.tab = 'all';
  if (!ids.includes(state.editingTab)) state.editingTab = null;
  if (!ids.includes(state.confirmingTabDelete)) state.confirmingTabDelete = null;
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
  applyTabs(tabs);
  setUpColumns(widths);
  setUpTopbar();
  renderTabs();
  setUpKeysForm();
  watchStorage();
  render();
  refresh();
  setInterval(refresh, REFRESH_MS);
  document.addEventListener('visibilitychange', refresh);
}

start();
