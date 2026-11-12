import { readWatchlistsInPage, searchSymbolsInPage, switchSymbolInPage } from './lib/chart-page.js';
import { columnsTemplate, DEFAULT_WIDTHS, resizeColumns, validWidths } from './lib/columns.js';
import { directionOf, formatChange, formatDateTime, formatPercent, formatPrice, formatTime } from './lib/format.js';
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
import { isSignInAvailable, loadAccount, SignInCancelled, signIn, signOut } from './lib/account.js';
import { PRIVACY_URL } from './lib/config.js';
import { docFromItems, docsEqual, mergeDocs, normalizeDoc } from './lib/merge.js';
import { fetchQuotes, resolveSymbol } from './lib/quotes.js';
import {
  loadColumnWidths,
  loadCurrentTab,
  loadGroups,
  loadKeys,
  loadTabs,
  saveColumnWidths,
  saveCurrentTab,
  saveKeys,
  syncUsage,
  tabsChanged,
} from './lib/store.js';
import { hasConsent, needsConsentDecision, setConsent } from './lib/sharing.js';
import { chartUrl, EXCHANGE_MARKETS, isChartUrl, isCryptoMarket, marketOf, showsExchange, tickerOf } from './lib/symbols.js';
import { contrast, hexToHsv, hsvToHex, parseHex, presetOf, PRESETS, THEME_KEY, themeColors, validTheme } from './lib/theme.js';
import { LIST_LOCK, writeDiff } from './lib/sync.js';
import { isSignedOut, parseSearch, watchlistsToTabs } from './lib/tradingview.js';
import { exportFileName, exportList, importList, parseExport, sizeError } from './lib/transfer.js';

const REFRESH_MS = 30_000;
const MARKET_LABELS = {
  tw: '台股',
  us: '美股',
  eu: '歐股',
  kr: '韓股',
  crypto: '幣安現貨',
  perp: '幣安合約',
  ...Object.fromEntries(EXCHANGE_MARKETS.map((item) => [item.market, `${item.name} ${item.perp ? '合約' : '現貨'}`])),
};
const SEARCH_TYPES = [
  ['', '全部'],
  ['stocks', '股票'],
  ['funds', '基金'],
  ['crypto', '加密貨幣'],
  ['futures', '期貨'],
  ['index', '指數'],
];
const IMPORT_LIMIT = 4; // Name lookups at the same time during an import.
const PING_MS = 15 * 60_000; // An open panel asks for the cloud copy this often.
const FLUSH_WAIT_MS = 5000; // A sign-out waits at most this long for the last edit to go up.
const ALL_LABEL = '全部';
// PulsoIcon outline icons (ISC), drawn on a 24 x 24 grid.
const ICONS = {
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  edit: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  trash: '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  fileInput: '<path d="M4 11V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M2 15h10"/><path d="m9 18 3-3-3-3"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  cloudAlert: '<path d="M12 12v4"/><path d="M12 20h.01"/><path d="M8.128 16.949A7 7 0 1 1 15.71 8h1.79a1 1 0 0 1 0 9h-1.642"/>',
  ellipsis: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  upload: '<path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
  download: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
  keyRound: '<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>',
  palette: '<path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  logIn: '<path d="m10 17 5-5-5-5"/><path d="M15 12H3"/><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>',
  logOut: '<path d="m16 17 5-5-5-5"/><path d="M21 12H9"/><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>',
  userX: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" x2="22" y1="8" y2="13"/><line x1="22" x2="17" y1="8" y2="13"/>',
  externalLink: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  listPlus: '<path d="M16 5H3"/><path d="M11 12H3"/><path d="M16 19H3"/><path d="M18 9v6"/><path d="M21 12h-6"/>',
  triangleAlert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  handHeart: '<path d="M11 14h2a2 2 0 0 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 16"/><path d="m14.45 13.39 5.05-4.694C20.196 8 21 6.85 21 5.75a2.75 2.75 0 0 0-4.797-1.837.276.276 0 0 1-.406 0A2.75 2.75 0 0 0 11 5.75c0 1.2.802 2.248 1.5 2.946L16 11.95"/><path d="m2 15 6 6"/><path d="m7 20 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a1 1 0 0 0-2.75-2.91"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  moon: '<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/>',
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
  alert: '',
  saving: 0,
  edits: 0,
  resolving: false,
  search: emptySearch(),
  importing: null,
  account: null,
  signingIn: false,
  signInExpired: false,
  deleting: false,
  syncStatus: null,
  syncChoice: null,
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
  holder.innerHTML = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
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

// The list (groups and tabs) as last saved by this panel or read from storage. A save compares
// against it, so only edits made in this panel are recorded, not changes from another window or
// computer, and a change that arrived meanwhile is merged instead of overwritten.
const docOf = (groups, names, custom) =>
  normalizeDoc({
    groupOrder: groups.map((group) => group.id),
    groups: Object.fromEntries(groups.map((group) => [group.id, group])),
    tabNames: names,
    customTabs: custom,
  });
const groupsOf = (doc) => doc.groupOrder.map((id) => doc.groups[id]);
const panelDoc = () => docOf(state.groups, state.tabNames, state.customTabs);
let baseline = docOf([], {}, []);
const setBaseline = (groups) => {
  baseline = docOf(groups, baseline.tabNames, baseline.customTabs);
};
const setBaselineTabs = ({ names, custom }) => {
  baseline = docOf(groupsOf(baseline), names, custom);
};

// The background page keeps the log, and drops the events without consent.
function recordSaved(saved) {
  const events = diffGroups(groupsOf(baseline), groupsOf(saved), Date.now());
  if (events.length > 0) chrome.runtime.sendMessage({ type: 'changes', events }).catch(() => {});
}

// Shows a list that a save merged with a change from elsewhere.
function showList(doc) {
  const before = state.tab;
  state.groups = groupsOf(doc);
  applyTabs({ names: doc.tabNames, custom: doc.customTabs });
  if (!state.editingTab && !state.creatingTab) renderTabs();
  render();
  if (state.tab !== before) saveCurrentTab(state.tab);
  fetchNewQuotes();
}

// Writes the list inside LIST_LOCK, so the cloud sync in the background cannot write between the
// read and the write. If the stored list changed since this panel read it, both changes are kept.
function saveList() {
  return navigator.locks.request(LIST_LOCK, async () => {
    const mine = panelDoc();
    const current = docFromItems(await chrome.storage.sync.get(null));
    const merged = docsEqual(current, baseline) ? mine : mergeDocs(baseline, mine, current);
    await writeDiff(chrome.storage, current, merged);
    // The log gets this panel's edits only, not what the merge brought in.
    recordSaved(mine);
    baseline = merged;
    // An edit made during the save stays on top of the merged list.
    if (!docsEqual(merged, mine)) showList(mergeDocs(mine, panelDoc(), merged));
  });
}

// Saves run one at a time, and each one saves the latest list. Two saves at once
// can lose a group, because each one removes items that it does not know.
function persist() {
  state.saving += 1;
  state.edits += 1;
  saveQueue = saveQueue
    .then(async () => {
      try {
        await saveList();
        state.saveError = '';
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
  state.alert = '';
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
  state.alert = '';
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
// className adds a style to the popup. split gives the buttons equal widths. An action can have
// an icon, and a note in small text under its label.
function showDialog({ content, actions = [], onDismiss, className = '', split = false }) {
  const buttons = actions.map((action, index) =>
    el(
      'button',
      {
        type: 'button',
        class: `text-button ${action.note ? 'answer' : ''} ${action.className ?? ''}`.trim(),
        autofocus: action.autofocus ?? index === 0,
        onclick: () => {
          dialog.close();
          action.onClick?.();
        },
      },
      action.icon ? svgIcon(action.icon) : null,
      action.label,
      action.note ? el('small', {}, action.note) : null,
    ),
  );
  const dialog = el(
    'dialog',
    { class: `confirm-dialog ${className}`.trim() },
    el(
      'div',
      { class: 'dialog-body' },
      el('div', { class: 'dialog-content' }, ...[content].flat()),
      buttons.length > 0 ? el('div', { class: split ? 'dialog-actions split' : 'dialog-actions' }, ...buttons) : null,
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

const privacyLink = () => el('a', { href: PRIVACY_URL, target: '_blank', rel: 'noopener' }, '隱私權政策');
const dialogTitle = (text) => el('p', { class: 'dialog-title' }, text);
const dialogNote = (...children) => el('p', { class: 'dialog-note' }, ...children);

// An icon in a circle above the title. tone picks the colors of the circle.
function heroHeader(icon, title, tone) {
  return el('div', { class: 'dialog-hero' }, el('span', { class: `hero-icon ${tone}` }, svgIcon(icon)), el('p', { class: 'hero-title' }, title));
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
// Resolves true or false for the answer, or null when the popup closed without one.
function showConsentDialog() {
  return new Promise((done) => {
    showDialog({
      className: 'hero-dialog',
      split: true,
      content: [
        heroHeader('shield', '匿名分享觀察清單？', 'neutral'),
        el('p', {}, 'MultiList 會匿名記錄你的觀察清單，不含任何能認出你的個人資訊。資料只用於 MultiList 的功能開發，例如熱門代碼統計。'),
        dialogNote('之後可以在右上角「⋯」選單的「匿名分享」更改。', privacyLink()),
      ],
      actions: [
        { label: '不同意', onClick: () => done(false) },
        { label: '同意', onClick: () => done(true) },
      ],
      onDismiss: () => done(null),
    });
  });
}

// Shown once, right after 不同意 in the first question. The settings switch never shows it.
// The focus starts on 太狠了, so a quick Enter keeps the answer.
function showPleaseDialog() {
  showDialog({
    className: 'hero-dialog please-dialog',
    split: true,
    content: heroHeader('handHeart', '拜託啦～求求了～', 'pink'),
    actions: [
      { label: '太狠了', note: '還是不要' },
      { label: '好辣', note: '同意分享', onClick: () => saveConsent(true) },
    ],
  });
}

// A failed write shows in the message bar. Resolves true when the choice was saved.
function saveConsent(granted) {
  return setConsent(granted)
    .then(() => true)
    .catch((error) => {
      state.alert = `分享設定儲存失敗：${error.message}`;
      renderStatus();
      return false;
    });
}

async function askForConsent() {
  if (!(await needsConsentDecision())) return;
  const granted = await showConsentDialog();
  if (granted === null) return;
  if ((await saveConsent(granted)) && !granted) showPleaseDialog();
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
  state.alert = warn ? '無法在頁面內切換，已改用重新載入，未儲存的圖表變更可能遺失' : '';
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
  const name = showsExchange(symbol.id) ? [symbol.id.split(':')[0], symbol.name].filter(Boolean).join(' · ') : symbol.name;
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
  state.importing = answer ? importChoice(answer) : null;
  render();
  if (!answer) showNoTradingViewDialog();
}

// The import reads the lists from a TradingView tab. The button opens one.
function showNoTradingViewDialog() {
  showDialog({
    content: [
      dialogTitle('找不到 TradingView 分頁'),
      el('p', {}, '一鍵匯入會從你已登入的 TradingView 分頁讀取清單。'),
      dialogNote('打開 TradingView 並登入後，再按一次匯入。'),
    ],
    actions: [
      { label: '取消' },
      { label: 'TradingView', icon: 'externalLink', className: 'primary', onClick: () => chrome.tabs.create({ url: TRADINGVIEW_URL }) },
    ],
  });
}

function importChoice(answer) {
  const error = (message) => ({ step: 'error', message });
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
// Crypto names are empty, and a symbol without a quote source has no lookup.
async function importedSymbol(id) {
  const market = marketOf(id);
  if (market === null || isCryptoMarket(market)) return { id, name: '' };
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

const TRADINGVIEW_ADVICE = { group: '請在 TradingView 把這個區段拆小，或不要勾選這個清單。', total: '請少選幾個清單。' };
const FILE_ADVICE = { group: '請先把這個分組拆小再匯出。', total: '請先刪掉一些分組或代碼，或改匯入較小的檔案。' };

// advice says what to do about one group that is too large, and about a list that is too large.
function quotaMessage(usage, advice = TRADINGVIEW_ADVICE) {
  if (usage.tooLarge) {
    return `「${groupTitle(usage.tooLarge)}」有 ${usage.tooLarge.symbols.length} 個代碼，超過 Chrome 同步的單一分組上限（8 KB）。${advice.group}`;
  }
  if (usage.tooMany) return `匯入後會有 ${usage.items} 個同步項目，超過 Chrome 上限 512 個。${advice.total}`;
  return `匯入後會用掉 ${Math.ceil(usage.total / 1024)} KB，超過 Chrome 同步上限 100 KB。${advice.total}`;
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
  if (nodes.slice(first).every((node) => node === null)) nodes.push(emptyState());
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

// A list with no symbols at all offers the two ways to start. A tab with no symbols only says how
// to fill it.
function emptyState() {
  if (state.groups.some((group) => group.symbols.length > 0)) {
    return el(
      'div',
      { class: 'empty-state' },
      el('p', { class: 'empty-title' }, `「${tabLabel(state.tab)}」還沒有代碼`),
      el('p', { class: 'empty-text' }, '按上方的「新增代碼」加入標的，或把其他分頁的分組標題拖到這個分頁上。'),
    );
  }
  return el(
    'div',
    { class: 'empty-state' },
    el('span', { class: 'hero-icon neutral large' }, svgIcon('listPlus')),
    el('p', { class: 'empty-title' }, '清單還是空的'),
    el('p', { class: 'empty-text' }, '從 TradingView 帶入你現有的清單，', el('br'), '或自己加入第一個代碼。'),
    el(
      'div',
      { class: 'empty-actions' },
      el('button', { type: 'button', class: 'big-button primary', onclick: startImport }, svgIcon('fileInput'), '一鍵匯入 TradingView 清單'),
      el('button', { type: 'button', class: 'big-button', onclick: toggleAddingLoose }, svgIcon('plus'), '手動新增第一個代碼'),
    ),
    el('p', { class: 'empty-hint' }, '匯入需要先打開並登入 TradingView'),
  );
}

// Problems show in a bar above the footer, one per line. Other messages show in a quieter bar.
// The x clears the messages that do not come back by themselves.
function messageBlock(kind, icon, lines, onClose) {
  return el(
    'div',
    { class: `message ${kind}`, role: kind === 'problem' ? 'alert' : 'status' },
    svgIcon(icon),
    el('div', { class: 'message-lines' }, ...lines.map((line) => el('p', {}, line))),
    onClose ? iconButton('close', '關閉訊息', onClose, 'message-close') : null,
  );
}

function renderStatus() {
  const sourceErrors = state.sourceStatus
    .filter((item) => item.errors.length > 0)
    .map((item) => `${MARKET_LABELS[item.market]}：${item.errors.join('、')}`);
  const syncFailed = state.account && state.syncStatus?.state === 'error';
  const problems = [state.alert, state.saveError, ...sourceErrors, syncFailed ? SYNC_TEXT.error : ''].filter(Boolean);
  const clearProblems = () => {
    state.alert = '';
    state.saveError = '';
    renderStatus();
  };
  const clearNotice = () => {
    state.notice = '';
    renderStatus();
  };
  document
    .getElementById('message-bar')
    .replaceChildren(
      ...[
        problems.length > 0 ? messageBlock('problem', 'triangleAlert', problems, state.alert || state.saveError ? clearProblems : null) : null,
        state.notice ? messageBlock('info', 'check', [state.notice], clearNotice) : null,
      ].filter(Boolean),
    );

  // The update time shows when there are quotes. Its tip lists the sources and the cloud sync.
  document.getElementById('update-info').hidden = !state.updatedAt;
  document.getElementById('update-time').textContent = state.updatedAt ? `更新於 ${formatTime(state.updatedAt)}` : '';
  const sources = state.sourceStatus.filter((item) => item.source);
  const syncText = state.account ? SYNC_TEXT[state.syncStatus?.state] : '';
  const rows = (items) => el('dl', { class: 'tip-rows' }, ...items.flatMap(([label, value, className]) => [el('dt', {}, label), el('dd', { class: className ?? '' }, value)]));
  document
    .getElementById('source-tip')
    .replaceChildren(
      ...[
        el('p', { class: 'tip-title' }, '資料來源'),
        sources.length > 0 ? rows(sources.map((item) => [MARKET_LABELS[item.market], item.source])) : el('p', { class: 'tip-note' }, '還沒有報價'),
        syncText ? el('div', { class: 'tip-separator' }) : null,
        syncText ? rows([['雲端同步', syncText, `sync-${state.syncStatus.state}`]]) : null,
      ].filter(Boolean),
    );
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

const TRADINGVIEW_URL = 'https://www.tradingview.com/';
const GOOGLE_LOGO =
  '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

// The cloud shows only when the user is not signed in. The menu button opens the settings menu.
function setUpTopbar() {
  const signInButton = document.getElementById('signin-button');
  signInButton.append(svgIcon('cloudAlert'));
  signInButton.addEventListener('click', () => showSignInDialog());
  const menuButton = document.getElementById('menu-button');
  menuButton.append(svgIcon('ellipsis'));
  menuButton.setAttribute('aria-expanded', 'false');
  const menu = document.getElementById('menu');
  menu.addEventListener('toggle', (event) => {
    const open = event.newState === 'open';
    menuButton.setAttribute('aria-expanded', String(open));
    if (open) menu.querySelector('[role="menuitem"]')?.focus();
  });
  // The arrow keys move between the items. Home and End go to the first and the last item.
  menu.addEventListener('keydown', (event) => {
    const items = [...menu.querySelectorAll('[role="menuitem"]:not(:disabled)')];
    const index = items.indexOf(document.activeElement);
    const next = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: items.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    items[(next + items.length) % items.length]?.focus();
  });
  renderMenu();
}

function menuItem(icon, label, onClick, className = '') {
  return el(
    'button',
    {
      type: 'button',
      role: 'menuitem',
      class: `menu-item ${className}`.trim(),
      onclick: () => {
        document.getElementById('menu').hidePopover();
        onClick();
      },
    },
    svgIcon(icon),
    label,
  );
}

const menuSeparator = () => el('div', { class: 'menu-separator', role: 'separator' });

function menuHeader() {
  if (!isSignInAvailable()) return null;
  if (state.account) {
    return el(
      'div',
      { class: 'menu-header', role: 'presentation' },
      el('p', { class: 'menu-header-note' }, '已登入，清單會自動同步'),
      el('p', { class: 'menu-header-email' }, state.account.email),
    );
  }
  if (state.signInExpired) return el('div', { class: 'menu-header', role: 'presentation' }, el('p', { class: 'menu-header-note expired' }, '登入已過期，請重新登入'));
  return null;
}

function accountItems() {
  if (!isSignInAvailable()) return [];
  if (!state.account) return [menuSeparator(), menuItem('logIn', '用 Google 登入', () => showSignInDialog())];
  const remove = menuItem('userX', '刪除帳號…', showDeleteAccountDialog, 'danger');
  remove.disabled = state.deleting;
  return [menuSeparator(), menuItem('logOut', '登出', startSignOut), remove];
}

// An account change can redraw the open menu. The focus stays on the same item.
function renderMenu() {
  const menu = document.getElementById('menu');
  const focused = [...menu.querySelectorAll('[role="menuitem"]')].indexOf(document.activeElement);
  const header = menuHeader();
  menu
    .replaceChildren(
      ...(header ? [header, menuSeparator()] : []),
      menuItem('fileInput', '從 TradingView 一鍵匯入', startImport),
      menuItem('upload', '從檔案匯入…', showImportFileDialog),
      menuItem('download', '匯出檔案…', showExportDialog),
      menuSeparator(),
      menuItem('keyRound', '報價 API key…', showKeysDialog),
      menuItem('palette', '背景與文字顏色…', showThemeSheet),
      menuItem('shield', '匿名分享…', showShareDialog),
      ...accountItems(),
    );
  if (focused !== -1) menu.querySelectorAll('[role="menuitem"]')[focused]?.focus();
}

const SYNC_TEXT = { ok: '已同步', error: '同步失敗，稍後重試' };

// Only a click on the Google button starts the flow. Resolves when the popup is closed and any
// sign-in it started has ended, so the next first-run question waits for it.
function showSignInDialog() {
  if (state.signingIn) return Promise.resolve();
  return new Promise((done) => {
    let started = null;
    const google = el(
      'button',
      {
        type: 'button',
        class: 'google-button',
        autofocus: true,
        onclick: () => {
          started = startSignIn();
          dialog.close();
        },
      },
      '使用 Google 帳戶登入',
    );
    google.insertAdjacentHTML('afterbegin', GOOGLE_LOGO);
    const dialog = showDialog({
      className: 'hero-dialog',
      content: [
        iconButton('close', '關閉，不登入', () => dialog.close(), 'dialog-close'),
        heroHeader('cloud', '同步你的觀察清單', 'accent'),
        google,
        el('p', { class: 'dialog-note center' }, '登入後可在其他設備或瀏覽器共享觀察清單。'),
        el('p', { class: 'dialog-link' }, privacyLink()),
      ],
    });
    dialog.addEventListener('close', () => (started ?? Promise.resolve()).then(done));
  });
}

async function startSignIn() {
  state.signingIn = true;
  state.alert = '';
  try {
    await signIn();
  } catch (error) {
    if (!(error instanceof SignInCancelled)) {
      console.warn(error);
      state.alert = '登入失敗，請再試一次';
    }
  } finally {
    state.signingIn = false;
    renderStatus();
  }
}

// The cloud and the menu follow the stored session.
function renderAccount() {
  const hint = document.getElementById('signin-hint');
  hint.hidden = !isSignInAvailable() || Boolean(state.account);
  const expired = !state.account && state.signInExpired;
  document
    .getElementById('signin-tip')
    .replaceChildren(
      el('p', {}, expired ? '登入已過期，你的清單暫時不會同步到其他設備或瀏覽器' : '登入後你將不會在其他設備或瀏覽器遺失你的觀察清單'),
      el('p', { class: 'tip-note' }, expired ? '點一下雲朵就能重新登入' : '點一下雲朵就能登入'),
    );
  renderMenu();
}

// The last edit goes to the cloud before the session ends, but the sign-out never waits long.
async function startSignOut() {
  const flushed = saveQueue.then(() => chrome.runtime.sendMessage({ type: 'flushSync' })).catch(() => {});
  await Promise.race([flushed, new Promise((done) => setTimeout(done, FLUSH_WAIT_MS))]);
  await signOut();
}

const DELETE_ERRORS = { expired: '登入已過期，請重新登入後再刪除', failed: '刪除失敗，請稍後再試' };

// The focus starts on 取消, so a quick Enter does not delete.
function showDeleteAccountDialog() {
  if (state.deleting) return;
  showDialog({
    content: [
      el('p', { class: 'dialog-title' }, '刪除帳號？'),
      el('p', {}, '雲端上的清單和帳號資料會永久刪除，無法復原。這台電腦上的清單會保留。其他已登入的瀏覽器會被登出。'),
    ],
    actions: [{ label: '取消' }, { label: '刪除帳號', className: 'danger', onClick: startDeleteAccount }],
  });
}

// The background runs the delete in the sync queue. On success the stored session is gone and the
// storage listener redraws the section; the buttons stay off until the answer comes back.
async function startDeleteAccount() {
  state.deleting = true;
  state.alert = '';
  renderAccount();
  try {
    const answer = await chrome.runtime.sendMessage({ type: 'deleteAccount' }).catch(() => null);
    if (!answer?.ok) state.alert = DELETE_ERRORS[answer?.reason] ?? DELETE_ERRORS.failed;
  } finally {
    state.deleting = false;
    renderAccount();
    renderStatus();
  }
}

let choiceDialog = null;
let choiceShown = '';
let choiceDismissed = false;

const countText = ({ groups, symbols }) => `${groups} 個分組、${symbols} 個代碼`;

// The background found two different lists with nothing to merge from, and waits for the user.
// Escape or a click outside only closes the popup, so the question comes back next time.
// When another panel answers, syncChoice goes away and this popup closes too.
function updateChoiceDialog() {
  const choice = state.account ? state.syncChoice : null;
  if (!choice) choiceDismissed = false;
  const text = choice ? JSON.stringify(choice) : '';
  if (choiceDialog && text === choiceShown) return;
  choiceDialog?.close();
  choiceDialog = null;
  choiceShown = '';
  if (!choice || choiceDismissed) return;

  const updated = choice.cloudUpdatedAt ? `（更新於 ${formatDateTime(new Date(choice.cloudUpdatedAt))}）` : '';
  // The focus starts on the export, so a quick Enter replaces neither list.
  const exportButton = el(
    'button',
    { type: 'button', class: 'text-button', autofocus: true, onclick: () => downloadExport(ALL_TAB) },
    '先匯出這台的清單',
  );
  const dialog = showDialog({
    content: [
      el('p', { class: 'dialog-title' }, '這台和雲端的清單不同'),
      el('p', {}, `這台：${countText(choice.local)}`),
      el('p', {}, `雲端：${countText(choice.cloud)}${updated}`),
      el('p', {}, '選一份保留，另一份會被取代。用雲端覆蓋這台時，同一個 Chrome 帳號的其他電腦也會跟著改變。'),
      el('p', {}, exportButton),
    ],
    actions: [
      { label: '用雲端覆蓋這台', onClick: () => sendChoice('cloud') },
      { label: '用這台覆蓋雲端', onClick: () => sendChoice('local') },
    ],
    onDismiss: () => {
      choiceDismissed = true;
    },
  });
  dialog.addEventListener('close', () => {
    if (choiceDialog !== dialog) return;
    choiceDialog = null;
    choiceShown = '';
  });
  choiceDialog = dialog;
  choiceShown = text;
}

// A failed answer leaves syncChoice in place, so the question comes back at once.
async function sendChoice(choice) {
  const answer = await chrome.runtime.sendMessage({ type: 'syncChoice', choice }).catch(() => null);
  if (!answer?.ok) updateChoiceDialog();
}

async function setUpAccount() {
  if (!isSignInAvailable()) return;
  state.account = await loadAccount();
  const saved = await chrome.storage.local.get(['signInExpired', 'syncStatus', 'syncChoice']);
  state.signInExpired = saved.signInExpired === true;
  state.syncStatus = saved.syncStatus ?? null;
  state.syncChoice = saved.syncChoice ?? null;
  renderAccount();
  renderStatus();
  updateChoiceDialog();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.account) state.account = changes.account.newValue ?? null;
    if (changes.signInExpired) state.signInExpired = changes.signInExpired.newValue === true;
    if (changes.syncStatus) state.syncStatus = changes.syncStatus.newValue ?? null;
    if (changes.syncChoice) state.syncChoice = changes.syncChoice.newValue ?? null;
    if (changes.account || changes.signInExpired) renderAccount();
    if (changes.account || changes.syncStatus) renderStatus();
    if (changes.account || changes.syncChoice) updateChoiceDialog();
  });
}

// The counters work like the ones for groups: a sync does not replace tabs that are not saved yet.
// Tabs use the same queue as groups, because each save writes the whole list.
function persistTabs() {
  state.tabSaving += 1;
  state.tabEdits += 1;
  saveQueue = saveQueue
    .then(saveList)
    .catch((error) => {
      state.saveError = `儲存失敗：${error.message}`;
      renderStatus();
    })
    .finally(() => {
      state.tabSaving -= 1;
      if (state.tabSaving === 0) syncTabs();
    })
    // A rejected queue would skip every later save.
    .catch((error) => console.error(error));
}

async function syncTabs() {
  if (state.tabSaving > 0) return;
  const { tabEdits } = state;
  const tabs = await loadTabs();
  if (tabEdits !== state.tabEdits) return;
  if (JSON.stringify(tabs) === JSON.stringify({ names: state.tabNames, custom: state.customTabs })) return;
  const before = state.tab;
  applyTabs(tabs);
  setBaselineTabs(tabs);
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

// Saving closes the popup and fetches the quotes again with the new keys.
function showKeysDialog() {
  const field = (label, key) => el('input', { type: 'password', autocomplete: 'off', value: state.keys[key] ?? '', 'aria-label': label });
  const fields = { fugle: field('Fugle API key', 'fugle'), alpacaId: field('Alpaca Key ID', 'alpacaId'), alpacaSecret: field('Alpaca Secret', 'alpacaSecret') };
  const save = () => {
    state.keys = Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, input.value.trim()]));
    saveKeys(state.keys)
      .then(() => {
        state.notice = '已儲存 API key';
        renderStatus();
        refresh();
      })
      .catch((error) => {
        state.alert = `API key 儲存失敗：${error.message}`;
        renderStatus();
      });
  };
  const labelled = (text, input) => el('label', { class: 'field' }, text, input);
  const dialog = showDialog({
    content: [
      dialogTitle('報價 API key'),
      dialogNote('沒有 key 時，台股用 TWSE MIS，美股用 Yahoo。Key 只存在這台電腦，不會同步。'),
      el(
        'div',
        {
          class: 'fields',
          // Enter in a field saves, like a form.
          onkeydown: (event) => {
            if (event.key !== 'Enter' || event.isComposing) return;
            event.preventDefault();
            dialog.close();
            save();
          },
        },
        labelled('Fugle API key', fields.fugle),
        labelled('Alpaca Key ID', fields.alpacaId),
        labelled('Alpaca Secret', fields.alpacaSecret),
      ),
    ],
    actions: [{ label: '取消' }, { label: '儲存', className: 'primary', onClick: save }],
  });
}

// Downloads the whole list, or one custom tab, as a JSON file. The all tab is the whole list.
// Returns the file name.
function downloadExport(tabId = ALL_TAB) {
  const name = exportFileName();
  const data = exportList(state.groups, state.customTabs, tabId);
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = el('a', { href: url, download: name, hidden: true });
  document.body.append(link);
  link.click();
  link.remove();
  // The download has its own copy once it starts, so the url is not needed for long.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}

// On the all tab, the current tab is the whole list, so only the whole list can be picked.
function showExportDialog() {
  let scope = ALL_TAB;
  const option = (value, title, text, { checked = false, disabled = false } = {}) =>
    el(
      'label',
      { class: 'option' },
      el('input', { type: 'radio', name: 'export-scope', checked, disabled, onchange: () => (scope = value) }),
      el('span', {}, el('span', { class: 'option-title' }, title), el('span', { class: 'option-text' }, text)),
    );
  const onAll = state.tab === ALL_TAB;
  showDialog({
    content: [
      dialogTitle('匯出觀察清單'),
      el(
        'div',
        { class: 'options', role: 'radiogroup', 'aria-label': '匯出範圍' },
        option(ALL_TAB, '整份清單', '所有分頁、分組和代碼', { checked: true }),
        option(
          state.tab,
          onAll ? '目前分頁' : `目前分頁（${tabLabel(state.tab)}）`,
          onAll ? '切到自訂分頁後，才能只匯出一個分頁' : '只有這個分頁裡的分組和代碼',
          { disabled: onAll },
        ),
      ),
      dialogNote('匯出的 JSON 檔可以備份，或分享給別人匯入。'),
    ],
    actions: [
      { label: '取消' },
      {
        label: '匯出',
        icon: 'download',
        className: 'primary',
        onClick: () => {
          state.notice = `已匯出 ${downloadExport(scope)}`;
          renderStatus();
        },
      },
    ],
  });
}

function showImportFileDialog() {
  showDialog({
    content: [
      dialogTitle('從檔案匯入'),
      el('p', {}, '選一個 MultiList 匯出的 JSON 檔（最大 1\u00a0MB）。'),
      dialogNote('匯入的內容會加在現有清單後面，不會蓋掉任何東西。'),
    ],
    actions: [
      { label: '取消' },
      { label: '選擇檔案', icon: 'upload', className: 'primary', onClick: () => document.getElementById('import-file').click() },
    ],
  });
}

function showTransferResult(text, isError = false) {
  if (isError) state.alert = text;
  else state.notice = text;
  renderStatus();
}

// Adds an export file to the list, like the TradingView import. A file that is not valid,
// or a list that would not fit in Chrome sync, changes nothing.
async function importFile(file) {
  const tooLarge = sizeError(file.size);
  const parsed = tooLarge ? { error: tooLarge } : parseExport(await file.text());
  if (parsed.error) {
    showTransferResult(parsed.error, true);
    return;
  }
  const result = importList(parsed.value, state.groups, { names: state.tabNames, custom: state.customTabs });
  if (!result.usage.fits) {
    showTransferResult(quotaMessage(result.usage, FILE_ADVICE), true);
    return;
  }
  const { tabs, groups, symbols } = result.added;
  if (tabs.length === 0 && groups === 0 && symbols === 0) {
    showTransferResult('檔案裡沒有新的分頁、分組或代碼，清單沒有變動。');
    return;
  }
  state.groups = result.groups;
  state.customTabs = result.custom;
  if (tabs.length > 0) persistTabs();
  persist();
  selectTab(tabs[0]?.id ?? ALL_TAB);
  showTransferResult(`已匯入 ${tabs.length} 個分頁、${groups} 個分組、${symbols} 個代碼`);
}

function setUpTransfer() {
  const fileInput = document.getElementById('import-file');
  fileInput.addEventListener('change', async () => {
    const [file] = fileInput.files;
    // Clears the choice, so the same file can be picked again.
    fileInput.value = '';
    if (!file) return;
    try {
      await importFile(file);
    } catch (error) {
      showTransferResult(`匯入失敗：${error.message}`, true);
    }
  });
}

// The switch follows the consent, also when another window changes it. Turning it off here does
// not show the plea.
async function showShareDialog() {
  const toggle = el('button', {
    type: 'button',
    role: 'switch',
    class: 'switch',
    'aria-checked': String(await hasConsent()),
    'aria-label': '匿名分享觀察清單',
    onclick: async () => {
      const on = toggle.getAttribute('aria-checked') !== 'true';
      toggle.setAttribute('aria-checked', String(on));
      if (!(await saveConsent(on))) toggle.setAttribute('aria-checked', String(!on));
    },
  });
  const follow = (changes, area) => {
    if (area === 'sync' && changes.consent) toggle.setAttribute('aria-checked', String(changes.consent.newValue?.granted === true));
  };
  chrome.storage.onChanged.addListener(follow);
  const dialog = showDialog({
    content: [
      dialogTitle('匿名分享'),
      el('label', { class: 'switch-row' }, el('span', {}, '匿名分享觀察清單'), toggle),
      el('p', {}, 'MultiList 會匿名記錄你的觀察清單，不含任何能認出你的個人資訊。'),
      dialogNote('關閉後停止上傳，已上傳的資料不會刪除。', privacyLink()),
    ],
    actions: [{ label: '完成', className: 'primary' }],
  });
  dialog.addEventListener('close', () => chrome.storage.onChanged.removeListener(follow));
}

const THEME_VARS = ['--bg', '--text', '--muted', '--border', '--hover', '--selected'];
const THEME_SAVE_MS = 800; // Chrome sync allows about two writes a second, so a drag saves once at the end.
let theme = null; // The saved colors, or null to follow the system.
let themeSaveTimer = null;
let themeSheetOpen = false;

// theme-boot.js puts the same colors on the page before the next panel draws.
function applyTheme(next) {
  theme = validTheme(next) ? next : null;
  const root = document.documentElement;
  for (const name of THEME_VARS) root.style.removeProperty(name);
  const colors = theme ? themeColors(theme) : null;
  if (colors) {
    root.dataset.scheme = colors.scheme;
    for (const [name, value] of Object.entries(colors.vars)) root.style.setProperty(name, value);
  } else {
    delete root.dataset.scheme;
  }
  try {
    localStorage.setItem('themeColors', JSON.stringify(colors));
  } catch {
    // Without storage the next panel only draws the system colors first.
  }
}

function saveTheme() {
  clearTimeout(themeSaveTimer);
  themeSaveTimer = null;
  const write = theme ? chrome.storage.sync.set({ [THEME_KEY]: theme }) : chrome.storage.sync.remove(THEME_KEY);
  write.catch((error) => {
    state.alert = `顏色儲存失敗：${error.message}`;
    renderStatus();
  });
}

function scheduleThemeSave() {
  clearTimeout(themeSaveTimer);
  themeSaveTimer = setTimeout(saveTheme, THEME_SAVE_MS);
}

// A panel closed during the wait still saves the last pick.
addEventListener('pagehide', () => {
  if (themeSaveTimer) saveTheme();
});

const systemColors = () => ({ ...(matchMedia('(prefers-color-scheme: dark)').matches ? PRESETS.dark : PRESETS.light) });
const ratioText = (ratio) => (ratio >= 10 ? String(Math.round(ratio)) : ratio.toFixed(1));

// Calls onMove with the pointer position in the node, from 0 to 1 on each side, while it drags.
function dragOn(node, onMove) {
  const move = (event) => {
    const rect = node.getBoundingClientRect();
    const clamp = (value) => Math.min(1, Math.max(0, value));
    onMove(clamp((event.clientX - rect.left) / rect.width), clamp((event.clientY - rect.top) / rect.height));
  };
  node.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    node.focus();
    node.setPointerCapture(event.pointerId);
    move(event);
  });
  node.addEventListener('pointermove', (event) => {
    if (node.hasPointerCapture(event.pointerId)) move(event);
  });
}

// The arrow keys move a slider one step, or ten steps with Shift.
function arrowSteps(event) {
  const step = event.shiftKey ? 10 : 1;
  const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
  if (!moves[event.key]) return null;
  event.preventDefault();
  return moves[event.key];
}

// A sheet at the bottom with no dark backdrop, so the list above shows each change at once.
// The sheet keeps the system colors, so it stays readable whatever colors the user picks.
function showThemeSheet() {
  const picker = { theme: theme ? { ...theme } : systemColors(), target: 'bg' };
  picker.hsv = hexToHsv(picker.theme.bg);

  const presetButton = (name, icon, label) =>
    el(
      'button',
      { type: 'button', class: 'preset', dataset: { preset: name }, onclick: () => pickTheme({ ...PRESETS[name] }) },
      el('span', { class: 'preset-swatch', style: `background:${PRESETS[name].bg};color:${PRESETS[name].text}` }, svgIcon(icon)),
      label,
    );
  const targetTab = (target, label) =>
    el(
      'button',
      { type: 'button', class: 'target', dataset: { target }, onclick: () => pickTarget(target) },
      el('span', { class: 'chip' }),
      label,
      el('span', { class: 'hex' }),
    );
  const area = el('div', { class: 'sv-area', role: 'slider', tabIndex: 0, 'aria-label': '飽和度與亮度' }, el('span', { class: 'thumb' }));
  const hue = el(
    'div',
    { class: 'hue-bar', role: 'slider', tabIndex: 0, 'aria-label': '色相', 'aria-valuemin': '0', 'aria-valuemax': '360' },
    el('span', { class: 'thumb' }),
  );
  const hexInput = el('input', {
    type: 'text',
    class: 'hex-input',
    maxLength: 7,
    spellcheck: false,
    autocomplete: 'off',
    oninput: () => {
      const hex = parseHex(hexInput.value);
      if (hex) setColor(hex, true);
    },
  });
  const customLabel = el('p', { class: 'sheet-label' });
  const contrastLine = el('p', { class: 'contrast' });
  const presets = el('div', { class: 'presets' }, presetButton('light', 'sun', 'Light Mode'), presetButton('dark', 'moon', 'Dark Mode'));
  const targets = el('div', { class: 'targets', role: 'group', 'aria-label': '要調整的顏色' }, targetTab('bg', '背景'), targetTab('text', '文字'));

  function paint(keepInput = false) {
    const { h, s, v } = picker.hsv;
    const hex = picker.theme[picker.target];
    area.style.background = `linear-gradient(to top, #000000, transparent), linear-gradient(to right, #ffffff, hsl(${h} 100% 50%))`;
    Object.assign(area.firstElementChild.style, { left: `${s * 100}%`, top: `${(1 - v) * 100}%`, background: hex });
    area.setAttribute('aria-valuetext', `飽和度 ${Math.round(s * 100)}%，亮度 ${Math.round(v * 100)}%`);
    Object.assign(hue.firstElementChild.style, { left: `${(h / 360) * 100}%`, background: `hsl(${h} 100% 50%)` });
    hue.setAttribute('aria-valuenow', String(Math.round(h)));
    hue.setAttribute('aria-valuetext', `色相 ${Math.round(h)} 度`);
    for (const tab of targets.children) {
      const color = picker.theme[tab.dataset.target];
      tab.setAttribute('aria-pressed', String(tab.dataset.target === picker.target));
      tab.querySelector('.chip').style.background = color;
      tab.querySelector('.hex').textContent = color.toUpperCase();
    }
    const preset = theme ? presetOf(picker.theme) : null;
    for (const button of presets.children) button.setAttribute('aria-pressed', String(button.dataset.preset === preset));
    customLabel.textContent = theme && !preset ? '自訂（目前使用中）' : '自訂';
    hexInput.setAttribute('aria-label', `${picker.target === 'bg' ? '背景' : '文字'}色碼`);
    if (!keepInput) hexInput.value = hex.toUpperCase();
    const ratio = contrast(picker.theme.bg, picker.theme.text);
    const good = ratio >= 4.5;
    contrastLine.className = `contrast ${good ? 'good' : 'poor'}`;
    contrastLine.replaceChildren(svgIcon(good ? 'check' : 'triangleAlert'), `對比 ${ratioText(ratio)} : 1，${good ? '看得清楚' : '文字可能看不清楚'}`);
  }

  function useColors() {
    applyTheme({ ...picker.theme });
    scheduleThemeSave();
  }

  // A gray or black color has no hue, so the hue and saturation stay where they were.
  function hsvOf(hex) {
    const next = hexToHsv(hex);
    if (next.s === 0 || next.v === 0) next.h = picker.hsv.h;
    if (next.v === 0) next.s = picker.hsv.s;
    return next;
  }

  function setColor(hex, keepInput = false) {
    picker.theme[picker.target] = hex;
    picker.hsv = hsvOf(hex);
    useColors();
    paint(keepInput);
  }

  function setHsv(change) {
    Object.assign(picker.hsv, change);
    picker.theme[picker.target] = hsvToHex(picker.hsv);
    useColors();
    paint();
  }

  function pickTheme(colors) {
    picker.theme = colors;
    picker.hsv = hsvOf(colors[picker.target]);
    useColors();
    paint();
  }

  function pickTarget(target) {
    picker.target = target;
    picker.hsv = hsvOf(picker.theme[target]);
    paint();
  }

  dragOn(area, (x, y) => setHsv({ s: x, v: 1 - y }));
  dragOn(hue, (x) => setHsv({ h: x * 360 }));
  area.addEventListener('keydown', (event) => {
    const steps = arrowSteps(event);
    if (!steps) return;
    const clamp = (value) => Math.min(1, Math.max(0, value));
    setHsv({ s: clamp(picker.hsv.s + steps[0] / 100), v: clamp(picker.hsv.v + steps[1] / 100) });
  });
  hue.addEventListener('keydown', (event) => {
    const steps = arrowSteps(event);
    if (steps) setHsv({ h: Math.min(360, Math.max(0, picker.hsv.h + steps[0] + steps[1])) });
  });

  themeSheetOpen = true;
  const dialog = showDialog({
    className: 'theme-sheet',
    content: [
      dialogTitle('背景與文字顏色'),
      el('p', { class: 'sheet-subtitle' }, '選了馬上套用，上面的清單就是預覽。'),
      el('p', { class: 'sheet-label' }, '預設配色'),
      presets,
      customLabel,
      targets,
      area,
      hue,
      el('div', { class: 'hex-row' }, el('label', { class: 'hex-label' }, '色碼', hexInput), contrastLine),
      el('p', { class: 'sheet-note' }, '次要文字和分隔線會跟著自動調整；漲跌的綠色、紅色不變。'),
    ],
    actions: [
      {
        label: '跟隨系統',
        className: 'plain',
        autofocus: false,
        onClick: () => {
          applyTheme(null);
          saveTheme();
        },
      },
      { label: '完成', className: 'primary', autofocus: true },
    ],
  });
  dialog.addEventListener('close', () => {
    themeSheetOpen = false;
    if (themeSaveTimer) saveTheme();
  });
  paint();
}

function watchStorage() {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    // An open sheet owns the colors, so an echo of its own earlier save does not undo a newer pick.
    if (changes[THEME_KEY] && !themeSheetOpen) applyTheme(changes[THEME_KEY].newValue ?? null);
    if (tabsChanged(changes)) syncTabs();
    syncFromStorage();
  });
}

async function start() {
  let tabs;
  let widths;
  let saved;
  [state.groups, state.keys, state.tab, tabs, widths, saved] = await Promise.all([
    loadGroups(),
    loadKeys(),
    loadCurrentTab(),
    loadTabs(),
    loadColumnWidths(),
    chrome.storage.sync.get(THEME_KEY),
  ]);
  applyTheme(saved[THEME_KEY] ?? null);
  baseline = docOf(state.groups, tabs.names, tabs.custom);
  // Lets the background page send the weekly upload if it is due, and pull the cloud copy.
  chrome.runtime.sendMessage({ type: 'panelOpened' }).catch(() => {});
  document.getElementById('app-version').textContent = `v${chrome.runtime.getManifest().version}`;
  document.getElementById('privacy-link').href = PRIVACY_URL;
  applyTabs(tabs);
  setUpColumns(widths);
  setUpTopbar();
  renderTabs();
  setUpTransfer();
  const accountReady = setUpAccount();
  watchStorage();
  render();
  refresh();
  setInterval(refresh, REFRESH_MS);
  document.addEventListener('visibilitychange', refresh);
  document.addEventListener('visibilitychange', pingBackground);
  setInterval(pingBackground, PING_MS);
  await accountReady;
  await offerSignIn();
  await askForConsent();
}

// The first panel on this computer offers the sign-in once, before the sharing question.
async function offerSignIn() {
  if (!isSignInAvailable() || state.account) return;
  const { signInOffered } = await chrome.storage.local.get('signInOffered');
  if (signInOffered) return;
  await chrome.storage.local.set({ signInOffered: true });
  await showSignInDialog();
}

// A panel that shows up again, or stays open, asks the background for the cloud copy.
function pingBackground() {
  if (!document.hidden) chrome.runtime.sendMessage({ type: 'panelVisible' }).catch(() => {});
}

start();
