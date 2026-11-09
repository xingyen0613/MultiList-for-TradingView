// Real-browser check of the cloud sync between browsers signed in to one account: the first
// sign-in (upload, download, the overwrite question), pushes and pulls, automatic merges, two
// computers of one Chrome account, the push before a sign-out, an expired session, and no loop.
// Run: node e2e/sync.mjs   (setup and requirements: e2e/harness.mjs)
// With SCREENSHOT_DIR=<dir>, screenshots of the new screens go there.

import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { countDoc, docFromItems, docsEqual, normalizeDoc } from '../extension/lib/merge.js';
import { createSteps, sleep, startStack, waitFor } from './harness.mjs';

// A panel asks for the cloud copy when it shows, at most once a minute. These checks pull many
// times a minute, so this copy pulls every time. The one-minute gap has its own unit test.
async function noPullGap(extDir) {
  const path = join(extDir, 'lib/sync.js');
  const code = await readFile(path, 'utf8');
  const patched = code.replace('const PULL_GAP = 60_000;', 'const PULL_GAP = 0;');
  if (patched === code) throw new Error('sync.js no longer has PULL_GAP = 60_000');
  await writeFile(path, patched);
}

const stack = await startStack({ google: true, beforeLaunch: noPullGap });
stack.allowedOrigins.push(stack.origin);
const { step, finish } = createSteps();
const panelUrl = `chrome-extension://${stack.extensionId}/sidepanel.html`;
const shots = process.env.SCREENSHOT_DIR ?? null;
const errors = [];
const requests = { GET: 0, PUT: 0 };
stack.server.on('request', (req) => {
  if (req.url.startsWith('/v1/sync') && req.method in requests) requests[req.method] += 1;
});

const symbol = (id, name) => ({ id, name });
const TSMC = symbol('TWSE:2330', '台積電');
const NVDA = symbol('NASDAQ:NVDA', 'NVIDIA');
const AAPL = symbol('NASDAQ:AAPL', 'Apple');
const BTC = symbol('BINANCE:BTCUSDT', '');
const ETH = symbol('BINANCE:ETHUSDT', '');
const MSFT = symbol('NASDAQ:MSFT', 'Microsoft');
const GOOG = symbol('NASDAQ:GOOG', 'Alphabet');
const AMZN = symbol('NASDAQ:AMZN', 'Amazon');
const META = symbol('NASDAQ:META', 'Meta');
const TSLA = symbol('NASDAQ:TSLA', 'Tesla');
const group = (id, name, symbols) => ({ id, name, collapsed: false, symbols });

const LIST_A = {
  groupOrder: ['g1', 'g2'],
  'group:g1': group('g1', '科技', [TSMC, NVDA, AAPL]),
  'group:g2': group('g2', '幣', [BTC, ETH]),
};
// One group and one loose symbol: 1 group, 3 symbols.
const LIST_C = {
  groupOrder: ['loose-all', 'c1'],
  'group:loose-all': { id: 'loose-all', name: '', loose: true, collapsed: false, symbols: [AMZN] },
  'group:c1': group('c1', 'C 的分組', [MSFT, GOOG]),
};
const LIST_D = {
  groupOrder: ['d1', 'd2'],
  'group:d1': group('d1', '電商', [AMZN]),
  'group:d2': group('d2', '車', [META, TSLA]),
};

const cloud = () => {
  const [row, ...rest] = stack.store.syncDocs.values();
  assert.equal(rest.length, 0, 'more than one cloud list');
  return row ? { version: row.version, data: normalizeDoc(JSON.parse(row.dataJson)) } : null;
};
const local = (b, key) => b.worker.evaluate(async (name) => (await chrome.storage.local.get(name))[name] ?? null, key);
const listOf = async (b) => docFromItems(await b.worker.evaluate(() => chrome.storage.sync.get(null)));
const hasSymbol = (doc, id) => Object.values(doc.groups).some((item) => item.symbols.some((each) => each.id === id));
const removeButton = (page, ticker) => page.locator(`button.row-remove[aria-label$=" ${ticker}"]`).first();
const choiceDialog = (page) => page.locator('dialog', { hasText: '這台和雲端的清單不同' });
// What a panel does when it becomes visible again.
const showPanel = (page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

async function shot(page, name) {
  if (shots) await page.screenshot({ path: join(shots, `${name}.png`) });
}

async function openPanel(context, name) {
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`${name}: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${name}: ${message.text()}`);
  });
  await page.setViewportSize({ width: 360, height: 720 });
  await page.goto(panelUrl);
  return page;
}

// A new browser profile with a list and a consent answer, so no consent question covers the panel.
async function browser(name, { list = {}, consent = false } = {}) {
  const { context, worker } = await stack.openProfile();
  await worker.evaluate(
    ({ items, granted }) => chrome.storage.sync.set({ ...items, consent: { v: 1, granted, at: Date.now() } }),
    { items: list, granted: consent },
  );
  return { name, context, worker, page: await openPanel(context, name) };
}

async function openSettings(page) {
  if (!(await page.locator('details#settings').evaluate((node) => node.open))) await page.locator('details#settings summary').click();
}

// The fake Google page answers the latest request, so sign-ins run one at a time.
async function signIn(b) {
  await openSettings(b.page);
  await b.page.locator('#account-button').click();
  await b.page.locator('dialog').getByRole('button', { name: '用 Google 登入' }).click();
  assert.ok(await waitFor(async () => (await local(b, 'account')) !== null), `${b.name} did not sign in`);
}

async function noQuestion(...browsers) {
  for (const b of browsers) {
    assert.equal(await local(b, 'syncChoice'), null, `${b.name} has a syncChoice`);
    assert.equal(await b.page.locator('dialog').count(), 0, `${b.name} shows a popup`);
  }
}

// Copies every storage.sync change of one browser to another, like Chrome sync between two
// computers of one Chrome account. Each key waits its own random time, so keys arrive out of
// order, and carries the value it has when it is copied, so the last value wins in the end.
function chromeSync(from, to) {
  let last = {};
  let stopped = false;
  let pending = 0;
  const failures = [];
  const copy = async (key) => {
    pending += 1;
    try {
      await sleep(100 + Math.random() * 4000);
      if (stopped) return;
      const value = (await from.worker.evaluate((name) => chrome.storage.sync.get(name), key))[key];
      await to.worker.evaluate(
        ({ name, item, gone }) => (gone ? chrome.storage.sync.remove(name) : chrome.storage.sync.set({ [name]: item })),
        { name: key, item: value ?? null, gone: value === undefined },
      );
    } catch (error) {
      failures.push(error.message);
    } finally {
      pending -= 1;
    }
  };
  const loop = (async () => {
    while (!stopped) {
      const now = await from.worker.evaluate(() => chrome.storage.sync.get(null));
      for (const key of new Set([...Object.keys(last), ...Object.keys(now)])) {
        if (JSON.stringify(last[key]) !== JSON.stringify(now[key])) copy(key);
      }
      last = now;
      await sleep(100);
    }
  })();
  return {
    failures,
    idle: () => pending === 0,
    async stop() {
      stopped = true;
      await loop;
      await waitFor(() => pending === 0);
    },
  };
}

const opened = [];
try {
  const A = await browser('A', { list: LIST_A });
  opened.push(A);

  await step('A has a list and signs in: the cloud gets that list, and the status bar says 已同步', async () => {
    await signIn(A);
    assert.ok(await waitFor(() => cloud() !== null), 'nothing reached the cloud');
    assert.ok(docsEqual(cloud().data, docFromItems(LIST_A)));
    assert.ok(await waitFor(async () => (await A.page.locator('#status').textContent()).includes('已同步')), 'no 已同步');
    await noQuestion(A);
    await shot(A.page, 'status-synced');
  });

  const B = await browser('B', { consent: true });
  opened.push(B);

  await step('B is new and agreed to share: signing in downloads the list, with no question and no change logged', async () => {
    await signIn(B);
    assert.ok(await waitFor(async () => docsEqual(await listOf(B), cloud().data)), 'B did not download');
    assert.ok(await waitFor(async () => (await B.page.locator('.row').count()) === 5), 'the panel does not show the list');
    await sleep(1500);
    await noQuestion(B);
    assert.equal(((await local(B, 'changeLog')) ?? []).length, 0);
  });

  await step('A removes a symbol: it reaches the cloud in seconds, and B gets it when its panel shows', async () => {
    const { version } = cloud();
    await removeButton(A.page, 'NVDA').click();
    assert.ok(await waitFor(() => cloud().version > version), 'not pushed');
    assert.ok(!hasSymbol(cloud().data, NVDA.id));
    await showPanel(B.page);
    assert.ok(await waitFor(async () => !hasSymbol(await listOf(B), NVDA.id)), 'B did not pull');
    assert.ok(await waitFor(async () => (await removeButton(B.page, 'NVDA').count()) === 0), 'the B panel still shows it');
  });

  await step('B shows old data, A edits again, B at once collapses another group: both edits are kept, with no question', async () => {
    const { version } = cloud();
    await removeButton(A.page, 'AAPL').click();
    assert.ok(await waitFor(() => cloud().version > version), 'A did not push');
    assert.equal(await removeButton(B.page, 'AAPL').count(), 1, 'B is not showing old data');
    await B.page.locator('.group-toggle', { hasText: '幣' }).click();
    const both = (doc) => !hasSymbol(doc, AAPL.id) && doc.groups.g2.collapsed === true;
    assert.ok(await waitFor(() => both(cloud().data), 15000), 'the cloud does not have both edits');
    await showPanel(A.page);
    assert.ok(await waitFor(async () => both(await listOf(A)) && both(await listOf(B))), 'A or B misses an edit');
    assert.ok(docsEqual(await listOf(A), cloud().data));
    assert.ok(docsEqual(await listOf(B), cloud().data));
    assert.ok(await waitFor(async () => (await removeButton(B.page, 'AAPL').count()) === 0), 'the B panel still shows AAPL');
    await noQuestion(A, B);
  });

  const C = await browser('C', { list: LIST_C });
  opened.push(C);

  await step('C has another list and signs in: the question has the right numbers, the export keeps it open, Escape asks again later', async () => {
    await signIn(C);
    const dialog = choiceDialog(C.page);
    await dialog.waitFor({ timeout: 10000 });
    const text = await dialog.textContent();
    const counts = countDoc(cloud().data);
    assert.ok(text.includes('這台：1 個分組、3 個代碼'), text);
    assert.ok(text.includes(`雲端：${counts.groups} 個分組、${counts.symbols} 個代碼（更新於 `), text);
    assert.match(text, /更新於 \d{4}\/\d{2}\/\d{2} \d{2}:\d{2}）/);
    assert.ok(text.includes('選一份保留，另一份會被取代。用雲端覆蓋這台時，同一個 Chrome 帳號的其他電腦也會跟著改變。'));
    await shot(C.page, 'choice-light');
    await C.page.emulateMedia({ colorScheme: 'dark' });
    await shot(C.page, 'choice-dark');
    await C.page.emulateMedia({ colorScheme: 'light' });

    const [download] = await Promise.all([
      C.page.waitForEvent('download'),
      dialog.getByRole('button', { name: '先匯出這台的清單' }).click(),
    ]);
    assert.match(download.suggestedFilename(), /^multilist-\d{8}\.json$/);
    assert.equal(await dialog.count(), 1, 'the export closed the question');

    await C.page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    assert.ok(await local(C, 'syncChoice'), 'Escape removed the question');
    assert.ok(docsEqual(await listOf(C), docFromItems(LIST_C)), 'C changed before an answer');
    await C.page.reload();
    await choiceDialog(C.page).waitFor({ timeout: 10000 });
  });

  await step('用雲端覆蓋這台 makes C equal to the cloud, and the question also closes in a second C panel', async () => {
    const second = await openPanel(C.context, 'C-second');
    await choiceDialog(second).waitFor({ timeout: 10000 });
    await choiceDialog(C.page).getByRole('button', { name: '用雲端覆蓋這台' }).click();
    assert.ok(await waitFor(async () => docsEqual(await listOf(C), cloud().data)), 'C was not replaced');
    assert.ok(await waitFor(async () => (await second.locator('dialog').count()) === 0), 'the second panel still asks');
    await noQuestion(C);
    await second.close();
  });

  const D = await browser('D', { list: LIST_D });
  opened.push(D);

  await step('D has another list: 用這台覆蓋雲端 puts D in the cloud, and A gets D on its next pull', async () => {
    await signIn(D);
    const dialog = choiceDialog(D.page);
    await dialog.waitFor({ timeout: 10000 });
    await dialog.getByRole('button', { name: '用這台覆蓋雲端' }).click();
    assert.ok(await waitFor(() => docsEqual(cloud().data, docFromItems(LIST_D))), 'the cloud is not D');
    assert.ok(docsEqual(await listOf(D), docFromItems(LIST_D)));
    await showPanel(A.page);
    assert.ok(await waitFor(async () => docsEqual(await listOf(A), docFromItems(LIST_D))), 'A did not get D');
    await noQuestion(D, A);
  });

  const A2 = await browser('A2');
  opened.push(A2);

  await step('two computers of one Chrome account, Chrome sync late and out of order: A, A2 and the cloud end up equal, A keeps its edit, no question', async () => {
    const relay = chromeSync(A, A2);
    try {
      assert.ok(await waitFor(async () => relay.idle() && docsEqual(await listOf(A2), await listOf(A)), 20000), 'Chrome sync did not copy A');
      await signIn(A2);
      assert.ok(await waitFor(async () => (await local(A2, 'syncStatus'))?.state === 'ok'), 'A2 did not sync');
      // A new group is two keys, groupOrder and group:<id>, which reach A2 in any order.
      await A.page.locator('.list-action.add-group').click();
      await A.page.getByLabel('新分組名稱').fill('新分組');
      await A.page.getByLabel('新分組名稱').press('Enter');
      const settled = async () => {
        const [a, a2, top] = [await listOf(A), await listOf(A2), cloud().data];
        return relay.idle() && docsEqual(a, top) && docsEqual(a2, top) && Object.values(top.groups).some((item) => item.name === '新分組');
      };
      assert.ok(await waitFor(settled, 30000), 'A, A2 and the cloud did not settle');
      await sleep(5000);
      assert.ok(await settled(), 'something changed after it settled');
      await noQuestion(A, A2);
    } finally {
      await relay.stop();
    }
    assert.deepEqual(relay.failures, []);
  });

  await step('after everything settles, 10 idle seconds with five signed-in browsers bring no GET and no PUT', async () => {
    await sleep(4000);
    const before = { ...requests };
    await sleep(10000);
    assert.deepEqual({ GET: requests.GET - before.GET, PUT: requests.PUT - before.PUT }, { GET: 0, PUT: 0 });
  });

  await step('an edit followed at once by 登出 still reaches the server, and the record stays for the next sign-in', async () => {
    await openSettings(A.page);
    const { version } = cloud();
    await removeButton(A.page, 'AMZN').click();
    await A.page.locator('#account-button').click();
    assert.ok(await waitFor(async () => (await local(A, 'account')) === null), 'A did not sign out');
    assert.ok(cloud().version > version, 'the edit did not go up before the sign-out');
    assert.ok(!hasSymbol(cloud().data, AMZN.id));
    assert.ok(await local(A, 'cloudSync'), 'cloudSync was removed');
  });

  await step('a session deleted on the server: after the next sync B shows 登入已過期 and keeps its list', async () => {
    const before = await listOf(B);
    stack.store.sessions.clear();
    await showPanel(B.page);
    assert.ok(await waitFor(async () => (await local(B, 'account')) === null), 'B is still signed in');
    assert.equal(await local(B, 'signInExpired'), true);
    await openSettings(B.page);
    assert.ok(await waitFor(async () => (await B.page.locator('#account-text').textContent()) === '登入已過期，請重新登入'));
    assert.equal(await B.page.locator('#account-button').textContent(), '登入');
    assert.ok(docsEqual(await listOf(B), before), 'B lost its list');
    assert.ok(await local(B, 'cloudSync'), 'cloudSync was removed');
    await B.page.locator('#account-setting').scrollIntoViewIfNeeded();
    await shot(B.page, 'account-expired');
  });

  await step('no console error in any side panel', async () => {
    assert.deepEqual(errors.filter((text) => !/Failed to load resource|net::ERR_/.test(text)), []);
  });
} finally {
  finish(`sync requests seen by the server: ${JSON.stringify(requests)}`);
  await stack.close();
}
