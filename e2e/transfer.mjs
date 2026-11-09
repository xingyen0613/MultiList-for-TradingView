// Real-browser check of the list export and import in the menu: the download, picking the
// file again, what lands in chrome.storage.sync, and files that must change nothing.
// Run: node e2e/transfer.mjs   (setup and requirements: e2e/harness.mjs)

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSteps, sleep, startStack, waitFor } from './harness.mjs';

const stack = await startStack();
const { worker, context } = stack;
stack.allowedOrigins.push(stack.origin);
const { step, finish } = createSteps();
const files = await mkdtemp(join(tmpdir(), 'multilist-transfer-'));
const panelUrl = `chrome-extension://${stack.extensionId}/sidepanel.html`;
const errors = [];

const sync = () => worker.evaluate(() => chrome.storage.sync.get(null));
const changeLog = () => worker.evaluate(async () => (await chrome.storage.local.get('changeLog')).changeLog ?? []);
// The list part of sync storage, in order: tabs, then groups.
async function list() {
  const data = await sync();
  return {
    custom: data.customTabs,
    names: data.tabNames,
    groups: (data.groupOrder ?? []).map((id) => data[`group:${id}`]),
  };
}

const seed = {
  customTabs: [
    { id: 'tab1', name: '台股' },
    { id: 'tab2', name: '歐股' },
  ],
  tabNames: {},
  groupOrder: ['loose-all', 'g1', 'loose-tab1', 'g2', 'g3'],
  'group:loose-all': { id: 'loose-all', name: '', loose: true, collapsed: false, symbols: [{ id: 'NASDAQ:AAPL', name: 'Apple' }] },
  'group:g1': {
    id: 'g1',
    name: '半導體',
    collapsed: false,
    tabId: 'tab1',
    symbols: [
      { id: 'TWSE:2330', name: '台積電' },
      { id: 'TPEX:6488', name: '環球晶' },
    ],
  },
  'group:loose-tab1': { id: 'loose-tab1', name: '', loose: true, collapsed: false, tabId: 'tab1', symbols: [{ id: 'TWSE:2317', name: '鴻海' }] },
  'group:g2': { id: 'g2', name: '德國', collapsed: false, tabId: 'tab2', symbols: [{ id: 'XETR:IFX', name: 'Infineon', yahoo: 'IFX.DE' }] },
  'group:g3': { id: 'g3', name: '幣', collapsed: false, symbols: [{ id: 'BINANCE:BTCUSDT', name: '' }] },
};

const menuItem = async (page, name) => {
  await page.locator('#menu-button').click();
  await page.getByRole('menuitem', { name, exact: true }).click();
};
const messages = (page) => page.locator('#message-bar .message');
// Closes every message that can be closed, so the next one is the answer to the next action.
// A quote-source error has no close button and is not an answer to an import.
const closeButtons = (page) => page.locator('#message-bar').getByRole('button', { name: '關閉訊息' });
async function clearMessages(page) {
  while ((await closeButtons(page).count()) > 0) await closeButtons(page).first().click();
}

let downloads = 0;
async function exportFile(page, scope) {
  await clearMessages(page);
  await menuItem(page, '匯出檔案…');
  const dialog = page.locator('dialog', { hasText: '匯出觀察清單' });
  await dialog.getByRole('radio', { name: new RegExp(scope) }).check();
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: '匯出' }).click()]);
  downloads += 1;
  const path = join(files, `${downloads}-${download.suggestedFilename()}`);
  await download.saveAs(path);
  return { name: download.suggestedFilename(), data: JSON.parse(await readFile(path, 'utf8')), path };
}

// Picks a file through the menu, the popup and the file chooser, like a user, and waits for the
// message in the message bar: an error is a .problem, a result is an .info.
async function importFile(page, path) {
  await clearMessages(page);
  await menuItem(page, '從檔案匯入…');
  const dialog = page.locator('dialog', { hasText: '從檔案匯入' });
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), dialog.getByRole('button', { name: '選擇檔案' }).click()]);
  await chooser.setFiles(path);
  // An import error is a closable .problem; a result is an .info.
  assert.ok(await waitFor(async () => (await closeButtons(page).count()) > 0), 'no message after the import');
  const problem = page.locator('#message-bar .message.problem').filter({ has: page.getByRole('button', { name: '關閉訊息' }) });
  const isError = (await problem.count()) > 0;
  return { text: await (isError ? problem : page.locator('#message-bar .message.info')).first().textContent(), isError };
}

async function writeJson(name, data) {
  const path = join(files, name);
  await writeFile(path, typeof data === 'string' ? data : JSON.stringify(data));
  return path;
}

try {
  await worker.evaluate((items) => chrome.storage.sync.set(items), seed);

  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.setViewportSize({ width: 360, height: 720 });
  await page.goto(panelUrl);
  // Consent is on, so the check can see that an import is recorded as list changes.
  await page.getByRole('button', { name: '同意', exact: true }).click();

  let whole;
  await step('exporting the whole list downloads multilist-YYYYMMDD.json with names, symbols and Yahoo tickers', async () => {
    whole = await exportFile(page, '整份清單');
    assert.match(whole.name, /^multilist-\d{8}\.json$/);
    const now = new Date();
    const today = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    assert.equal(whole.name, `multilist-${today}.json`);
    const { format, version, exportedAt, tabs, groups } = whole.data;
    assert.deepEqual({ format, version }, { format: 'multilist', version: 1 });
    assert.ok(!Number.isNaN(Date.parse(exportedAt)));
    assert.deepEqual(tabs, [
      { name: '台股', groups: [
        { name: '半導體', symbols: [{ id: 'TWSE:2330', name: '台積電' }, { id: 'TPEX:6488', name: '環球晶' }] },
        { name: '', loose: true, symbols: [{ id: 'TWSE:2317', name: '鴻海' }] },
      ] },
      { name: '歐股', groups: [{ name: '德國', symbols: [{ id: 'XETR:IFX', name: 'Infineon', yahoo: 'IFX.DE' }] }] },
    ]);
    assert.deepEqual(groups, [
      { name: '', loose: true, symbols: [{ id: 'NASDAQ:AAPL', name: 'Apple' }] },
      { name: '幣', symbols: [{ id: 'BINANCE:BTCUSDT', name: '' }] },
    ]);
    assert.match(await page.locator('#message-bar .message.info').textContent(), /已匯出 multilist-\d{8}\.json/);
  });

  let oneTab;
  await step('exporting the current tab has only that tab', async () => {
    await page.locator('#market-tabs button.tab[data-tab="tab2"]').click();
    oneTab = await exportFile(page, '目前分頁（歐股）');
    assert.deepEqual(oneTab.data.tabs.map((tab) => tab.name), ['歐股']);
    assert.deepEqual(oneTab.data.groups, []);
  });

  await step('on the all tab, 目前分頁 is disabled and only the whole list can be exported', async () => {
    await page.locator('#market-tabs button.tab[data-tab="all"]').click();
    await menuItem(page, '匯出檔案…');
    const dialog = page.locator('dialog', { hasText: '匯出觀察清單' });
    assert.equal(await dialog.getByRole('radio', { name: /目前分頁/ }).isDisabled(), true);
    assert.equal(await dialog.getByRole('radio', { name: /整份清單/ }).isChecked(), true);
    await dialog.getByRole('button', { name: '取消' }).click();
    await dialog.waitFor({ state: 'detached' });
    const all = await exportFile(page, '整份清單');
    assert.deepEqual(all.data.tabs, whole.data.tabs);
    assert.deepEqual(all.data.groups, whole.data.groups);
  });

  await step('importing the whole-list file adds new tabs and groups after the current ones', async () => {
    const eventsBefore = (await changeLog()).length;
    const result = await importFile(page, whole.path);
    assert.equal(result.isError, false, result.text);
    assert.equal(result.text, '已匯入 2 個分頁、3 個分組、5 個代碼');
    assert.ok(await waitFor(async () => (await list()).custom.length === 4), 'tabs were not saved');
    assert.ok(await waitFor(async () => (await list()).groups.length === 9), 'groups were not saved');
    const { custom, groups } = await list();

    assert.deepEqual(custom.slice(0, 2), seed.customTabs);
    assert.deepEqual(custom.map((tab) => tab.name), ['台股', '歐股', '台股', '歐股']);
    const [newTw, newEu] = custom.slice(2);
    assert.ok(newTw.id !== 'tab1' && newEu.id !== 'tab2');

    const ids = groups.map((group) => group.id);
    assert.equal(new Set(ids).size, ids.length, `ids repeat: ${ids}`);
    // The current groups are unchanged and keep their place.
    assert.deepEqual(groups.slice(0, 5), seed.groupOrder.map((id) => seed[`group:${id}`]));
    // The all-tab loose symbols had AAPL already, so nothing joined them.
    assert.deepEqual(groups.find((group) => group.id === 'loose-all').symbols, [{ id: 'NASDAQ:AAPL', name: 'Apple' }]);
    const added = groups.slice(5);
    const byName = (name) => added.find((group) => group.name === name);
    assert.equal(byName('半導體').tabId, newTw.id);
    assert.deepEqual(byName('半導體').symbols, seed['group:g1'].symbols);
    assert.deepEqual(byName('德國').symbols, [{ id: 'XETR:IFX', name: 'Infineon', yahoo: 'IFX.DE' }]);
    assert.equal(byName('德國').tabId, newEu.id);
    assert.ok(!('tabId' in byName('幣')));
    const loose = added.find((group) => group.loose);
    assert.equal(loose.id, `loose-${newTw.id}`);
    assert.equal(loose.tabId, newTw.id);
    assert.deepEqual(loose.symbols, [{ id: 'TWSE:2317', name: '鴻海' }]);

    // The panel moved to the first new tab.
    assert.equal(await page.locator('#market-tabs button.tab[aria-pressed="true"]').getAttribute('data-tab'), newTw.id);
    // The import is a list change like any other edit.
    assert.ok(await waitFor(async () => (await changeLog()).length >= eventsBefore + 5), 'no change records');
    const events = (await changeLog()).slice(eventsBefore);
    assert.ok(events.every((event) => event.op === 'add'));
    assert.deepEqual(events.map((event) => event.symbolId).sort(), ['BINANCE:BTCUSDT', 'TPEX:6488', 'TWSE:2317', 'TWSE:2330', 'XETR:IFX']);
  });

  await step('importing the one-tab file adds one tab with the Yahoo ticker', async () => {
    const result = await importFile(page, oneTab.path);
    assert.equal(result.text, '已匯入 1 個分頁、1 個分組、1 個代碼');
    assert.ok(await waitFor(async () => (await list()).custom.length === 5), 'tab was not saved');
    assert.ok(await waitFor(async () => (await list()).groups.length === 10), 'group was not saved');
    const { custom, groups } = await list();
    const tab = custom[4];
    assert.equal(tab.name, '歐股');
    const group = groups.find((item) => item.tabId === tab.id);
    assert.deepEqual(group.symbols, [{ id: 'XETR:IFX', name: 'Infineon', yahoo: 'IFX.DE' }]);
  });

  const bad = [
    ['not JSON', await writeJson('broken.json', '{"format": "multilist", '), /不是 JSON/],
    ['another format', await writeJson('other.json', { format: 'other', version: 1, tabs: [] }), /不是 MultiList/],
    ['another version', await writeJson('v2.json', { ...whole.data, version: 2 }), /版本（2）/],
    [
      'a bad symbol id',
      await writeJson('symbol.json', { ...whole.data, groups: [{ name: 'X', symbols: [{ id: 'nasdaq:aapl', name: '' }] }] }),
      /代碼格式不對：「nasdaq:aapl」/,
    ],
    ['more than 1 MB', await writeJson('big.json', { ...whole.data, padding: 'x'.repeat(1024 * 1024) }), /超過 1 MB/],
  ];
  for (const [what, path, message] of bad) {
    await step(`a file with ${what} shows an error and changes nothing`, async () => {
      const before = await list();
      const result = await importFile(page, path);
      assert.equal(result.isError, true, result.text);
      assert.match(result.text, message);
      await sleep(500);
      assert.deepEqual(await list(), before);
    });
  }

  await step('a file that does not fit in Chrome sync shows an error and changes nothing', async () => {
    const groups = Array.from({ length: 40 }, (_, g) => ({
      name: `G${g}`,
      symbols: Array.from({ length: 60 }, (_, s) => ({ id: `NYSE:S${g}X${s}`, name: 'A long company name' })),
    }));
    const path = await writeJson('quota.json', { format: 'multilist', version: 1, tabs: [], groups });
    const before = await list();
    const result = await importFile(page, path);
    assert.equal(result.isError, true, result.text);
    assert.match(result.text, /超過 Chrome 同步上限 100 KB/);
    await sleep(500);
    assert.deepEqual(await list(), before);
  });

  await step('the panel logs no errors', async () => {
    const real = errors.filter((text) => !/Failed to load resource|net::ERR_/.test(text));
    assert.deepEqual(real, []);
  });

  await page.close();
} finally {
  await stack.close();
  await rm(files, { recursive: true, force: true });
}

finish();
