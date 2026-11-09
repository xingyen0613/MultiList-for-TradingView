// Real-browser check of the optional Google sign-in: the explanation dialog, the PKCE login
// through chrome.identity.launchWebAuthFlow against a fake Google page, a bad state, and logout.
// Run: node e2e/account.mjs   (setup and requirements: e2e/harness.mjs)

import assert from 'node:assert/strict';
import { createSteps, startStack, waitFor } from './harness.mjs';

const stack = await startStack({ google: true });
const { worker, context, google } = stack;
const { step, finish } = createSteps();
const panelUrl = `chrome-extension://${stack.extensionId}/sidepanel.html`;
const errors = [];

const localAccount = () => worker.evaluate(async () => (await chrome.storage.local.get('account')).account ?? null);
const accountsOnServer = () => [...stack.store.accounts.values()];

const page = await context.newPage();
page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
page.on('pageerror', (error) => errors.push(error.message));
stack.allowedOrigins.push(stack.origin);
await page.goto(panelUrl);
const cloud = page.getByRole('button', { name: '登入以同步到其他瀏覽器' });
const dialog = page.locator('dialog');
// The consent question covers the panel on a first run; the sign-in checks start after it.
await dialog.getByRole('button', { name: '不同意' }).click();
await dialog.waitFor({ state: 'detached' });
await page.locator('details#settings summary').click();

let token = null;
let firstSeenAt = null;

try {
  await step('signed out: the settings button and the top cloud are shown', async () => {
    await page.locator('#account-setting').waitFor();
    assert.equal(await page.locator('#account-button').textContent(), '登入');
    assert.match(await page.locator('#account-text').textContent(), /登入 Google 帳號/);
    assert.equal(await cloud.count(), 1);
    assert.equal(await cloud.getAttribute('title'), '登入以同步到其他瀏覽器');
  });

  await step('the cloud opens the explanation, cancel sends nothing', async () => {
    await cloud.click();
    assert.match(await dialog.textContent(), /登入以同步清單/);
    assert.match(await dialog.textContent(), /Google 信箱會存到 MultiList 的伺服器/);
    assert.equal(await dialog.locator('a').count(), 1);
    await dialog.getByRole('button', { name: '取消' }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.equal(google.requests.length, 0);
    assert.equal(await localAccount(), null);
    assert.equal(accountsOnServer().length, 0);
  });

  await step('a state that does not match shows an error and stores nothing', async () => {
    google.badState = true;
    await page.locator('#account-button').click();
    await dialog.getByRole('button', { name: '用 Google 登入' }).click();
    assert.ok(await waitFor(() => google.requests.length === 1), 'launchWebAuthFlow did not reach the fake Google page');
    assert.ok(await waitFor(async () => (await page.locator('#status-error').textContent()).includes('登入失敗，請再試一次')));
    assert.equal(await localAccount(), null);
    assert.equal(accountsOnServer().length, 0);
    assert.equal(await page.locator('#account-button').textContent(), '登入');
  });

  await step('confirming signs in: session stored, email shown, cloud gone, one account', async () => {
    google.badState = false;
    firstSeenAt = await worker.evaluate(async () => (await chrome.storage.sync.get('firstSeenAt')).firstSeenAt);
    assert.ok(Number.isInteger(firstSeenAt), 'extension has no firstSeenAt');
    await cloud.click();
    await dialog.getByRole('button', { name: '用 Google 登入' }).click();
    assert.ok(await waitFor(async () => (await localAccount()) !== null), 'no account saved');
    const account = await localAccount();
    token = account.token;
    assert.ok(token);
    assert.equal(account.email, 'tester@example.com');
    assert.deepEqual(google.exchanges, [true], 'PKCE verifier did not match the challenge');
    assert.ok(await waitFor(async () => (await page.locator('#account-text').textContent()) === '已登入：tester@example.com'));
    assert.equal(await page.locator('#account-button').textContent(), '登出');
    assert.equal(await cloud.count(), 0);
    const [row, ...rest] = accountsOnServer();
    assert.equal(rest.length, 0);
    assert.equal(row.firstSeenAt, firstSeenAt);
  });

  await step('the anonymous upload does not carry the login', async () => {
    const text = await page.evaluate(async () => (await fetch('lib/upload.js')).text());
    assert.ok(!/account|Authorization|Bearer/.test(text));
  });

  await step('logging out removes the local session, the server token, and the screen follows', async () => {
    await page.locator('#account-button').click();
    assert.ok(await waitFor(async () => (await localAccount()) === null), 'account still stored');
    assert.equal(await page.locator('#account-button').textContent(), '登入');
    assert.equal(await cloud.count(), 1);
    const response = await fetch(`${stack.serverUrl}/v1/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Origin: stack.origin },
      body: '{}',
    });
    assert.equal(response.status, 401);
  });

  await step('no console error in the side panel', async () => {
    assert.deepEqual(errors.filter((text) => !/Failed to load resource/.test(text)), []);
  });
} finally {
  finish();
  await stack.close();
}
