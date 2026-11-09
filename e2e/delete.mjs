// Real-browser check of 刪除帳號: the confirmation, cancel, the server rows that go away, the other
// browser's session, the list that stays on this computer, and signing in again to an empty cloud.
// Run: node e2e/delete.mjs   (setup and requirements: e2e/harness.mjs)
// With SCREENSHOT_DIR=<dir>, screenshots of the new screens go there.

import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { docFromItems, docsEqual } from '../extension/lib/merge.js';
import { createSteps, startStack, waitFor } from './harness.mjs';

// A panel asks for the cloud copy when it shows, at most once a minute; this copy asks every time.
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
const deletes = [];
stack.server.on('request', (req) => {
  if (req.method === 'DELETE' && req.url === '/v1/account') deletes.push(req.url);
});

const LIST = {
  groupOrder: ['g1'],
  'group:g1': { id: 'g1', name: '科技', collapsed: false, symbols: [{ id: 'TWSE:2330', name: '台積電' }, { id: 'NASDAQ:NVDA', name: 'NVIDIA' }] },
};

const local = (b, key) => b.worker.evaluate(async (name) => (await chrome.storage.local.get(name))[name] ?? null, key);
const listOf = async (b) => docFromItems(await b.worker.evaluate(() => chrome.storage.sync.get(null)));
const showPanel = (page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
const confirmDialog = (page) => page.locator('dialog', { hasText: '刪除帳號？' });

async function shot(page, name) {
  if (shots) await page.screenshot({ path: join(shots, `${name}.png`) });
}

async function browser(name, list) {
  const { context, worker } = await stack.openProfile();
  await worker.evaluate((items) => chrome.storage.sync.set({ ...items, consent: { v: 1, granted: false, at: Date.now() } }), list);
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`${name}: ${error.message}`));
  page.on('console', (message) => message.type() === 'error' && errors.push(`${name}: ${message.text()}`));
  await page.setViewportSize({ width: 360, height: 720 });
  await page.goto(panelUrl);
  return { name, context, worker, page };
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

const rows = () => ({ accounts: stack.store.accounts.size, sessions: stack.store.sessions.size, syncDocs: stack.store.syncDocs.size });

let A;
let B;
let firstAccountId;
try {
  A = await browser('A', LIST);
  B = await browser('B', {});

  await step('A and B sign in to one account: the cloud holds A\'s list and B has it too', async () => {
    await signIn(A);
    assert.ok(await waitFor(() => stack.store.syncDocs.size === 1), 'A did not upload');
    await signIn(B);
    assert.ok(await waitFor(async () => docsEqual(await listOf(B), await listOf(A))), 'B did not get the list');
    assert.deepEqual(rows(), { accounts: 1, sessions: 2, syncDocs: 1 });
    firstAccountId = (await local(A, 'account')).accountId;
  });

  await step('signed in: 登出 and 刪除帳號 sit side by side inside 360px', async () => {
    await openSettings(A.page);
    const out = A.page.locator('#account-button');
    const del = A.page.locator('#account-delete');
    assert.equal(await out.textContent(), '登出');
    assert.equal(await del.textContent(), '刪除帳號');
    const [a, b] = [await out.boundingBox(), await del.boundingBox()];
    assert.ok(a.x >= 0 && b.x + b.width <= 360, 'a button leaves the panel');
    assert.equal(b.y, a.y, 'the buttons are on two lines');
    await A.page.locator('#account-setting').scrollIntoViewIfNeeded();
    await shot(A.page, 'account-signed-in');
  });

  await step('刪除帳號 asks first; the focus is on 取消, Enter and 取消 send nothing', async () => {
    await A.page.locator('#account-delete').click();
    const dialog = confirmDialog(A.page);
    await dialog.waitFor();
    assert.match(await dialog.textContent(), /雲端上的清單和帳號資料會永久刪除，無法復原。這台電腦上的清單會保留。其他已登入的瀏覽器會被登出。/);
    assert.equal(await A.page.evaluate(() => document.activeElement.textContent), '取消');
    await shot(A.page, 'delete-light');
    await A.page.emulateMedia({ colorScheme: 'dark' });
    await shot(A.page, 'delete-dark');
    await A.page.emulateMedia({ colorScheme: 'light' });
    await A.page.keyboard.press('Enter');
    await dialog.waitFor({ state: 'detached' });
    await A.page.locator('#account-delete').click();
    await dialog.waitFor();
    await dialog.getByRole('button', { name: '取消' }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.deepEqual(deletes, []);
    assert.deepEqual(rows(), { accounts: 1, sessions: 2, syncDocs: 1 });
    assert.ok(await local(A, 'account'));
  });

  await step('confirming deletes the account, its cloud list and both sessions; A is signed out and keeps its list', async () => {
    const before = await listOf(A);
    await A.page.locator('#account-delete').click();
    await confirmDialog(A.page).getByRole('button', { name: '刪除帳號' }).click();
    assert.ok(await waitFor(async () => (await local(A, 'account')) === null), 'A is still signed in');
    assert.equal(deletes.length, 1);
    assert.deepEqual(rows(), { accounts: 0, sessions: 0, syncDocs: 0 });
    for (const key of ['cloudSync', 'syncStatus', 'syncChoice', 'signInExpired']) assert.equal(await local(A, key), null, key);
    assert.ok(docsEqual(await listOf(A), before), 'A lost its list');
    assert.ok(Object.keys(before.groups).length > 0);
    assert.equal(await A.page.locator('#account-button').textContent(), '登入');
    assert.equal(await A.page.locator('#account-delete').isHidden(), true);
    assert.equal(await A.page.getByRole('button', { name: '登入以同步到其他瀏覽器' }).count(), 1);
    assert.equal(await A.page.locator('#status-error').textContent(), '');
  });

  await step('B asks on its next sync: 登入已過期, and its list stays', async () => {
    const before = await listOf(B);
    await showPanel(B.page);
    assert.ok(await waitFor(async () => (await local(B, 'account')) === null), 'B is still signed in');
    assert.equal(await local(B, 'signInExpired'), true);
    await openSettings(B.page);
    assert.ok(await waitFor(async () => (await B.page.locator('#account-text').textContent()) === '登入已過期，請重新登入'));
    assert.ok(docsEqual(await listOf(B), before), 'B lost its list');
    assert.ok(Object.keys(before.groups).length > 0);
  });

  await step('A signs in again with the same Google account: a new empty cloud takes A\'s list, with no question', async () => {
    await signIn(A);
    assert.ok(await waitFor(() => stack.store.syncDocs.size === 1), 'A did not upload');
    const [doc] = stack.store.syncDocs.values();
    assert.equal(doc.version, 1);
    assert.ok(await waitFor(async () => (await local(A, 'syncStatus'))?.state === 'ok'));
    assert.notEqual((await local(A, 'account')).accountId, firstAccountId);
    assert.equal(await local(A, 'syncChoice'), null);
    assert.equal(await A.page.locator('dialog').count(), 0);
  });

  await step('a failed delete shows 刪除失敗，請稍後再試 and keeps the session', async () => {
    // The server goes away for one attempt, then comes back on the same port.
    const { port } = stack.server.address();
    await new Promise((done) => {
      stack.server.close(done);
      stack.server.closeAllConnections();
    });
    await openSettings(A.page);
    await A.page.locator('#account-delete').click();
    await confirmDialog(A.page).getByRole('button', { name: '刪除帳號' }).click();
    assert.ok(await waitFor(async () => (await A.page.locator('#status-error').textContent()).includes('刪除失敗，請稍後再試')));
    assert.ok(await local(A, 'account'));
    assert.equal(await A.page.locator('#account-delete').isDisabled(), false);
    await new Promise((done) => stack.server.listen(port, '127.0.0.1', done));
    assert.equal(stack.store.accounts.size, 1);
  });

  await step('no console error in any side panel', async () => {
    assert.deepEqual(errors.filter((text) => !/Failed to load resource|net::ERR_/.test(text)), []);
  });
} finally {
  finish();
  await stack.close();
}
