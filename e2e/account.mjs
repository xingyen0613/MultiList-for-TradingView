// Real-browser check of the optional Google sign-in: the first-open order (sign-in popup, sharing question, plea), the popup, the PKCE login
// through chrome.identity.launchWebAuthFlow against a fake Google page, a bad state, and logout.
// Run: node e2e/account.mjs   (setup and requirements: e2e/harness.mjs)

import assert from 'node:assert/strict';
import { createSteps, sleep, startStack, waitFor } from './harness.mjs';

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
const signInButton = page.locator('#signin-button');
const dialog = page.locator('dialog');
const signInDialog = page.locator('dialog', { hasText: '同步你的觀察清單' });
const consentDialog = page.locator('dialog', { hasText: '匿名分享觀察清單？' });
const pleaseDialog = page.locator('dialog', { hasText: '拜託啦～求求了～' });
const consentOf = () => worker.evaluate(async () => (await chrome.storage.sync.get('consent')).consent ?? null);

// Opens the settings menu and clicks one item; the menu closes by itself.
async function menuItem(name) {
  await page.locator('#menu-button').click();
  await page.getByRole('menuitem', { name, exact: true }).click();
}
const menuText = async () => {
  await page.locator('#menu-button').click();
  const text = await page.locator('#menu').textContent();
  await page.keyboard.press('Escape');
  return text;
};

let token = null;
let firstSeenAt = null;

try {
  await step('first open: the sign-in popup comes first, then the sharing question; 不同意 shows the plea once', async () => {
    await signInDialog.waitFor();
    assert.equal(await dialog.count(), 1, 'the sharing question came before the sign-in popup closed');
    assert.equal(await consentDialog.count(), 0);
    assert.equal(await page.evaluate(async () => (await chrome.storage.local.get('signInOffered')).signInOffered), true);
    assert.equal(await consentOf(), null);
    await signInDialog.getByRole('button', { name: '關閉，不登入' }).click();
    await consentDialog.waitFor();
    assert.equal(google.requests.length, 0);
    await consentDialog.getByRole('button', { name: '不同意' }).click();
    await pleaseDialog.waitFor();
    assert.equal(await pleaseDialog.count(), 1);
    assert.equal((await consentOf()).granted, false);
    await pleaseDialog.getByRole('button', { name: /太狠了/ }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.equal((await consentOf()).granted, false, '太狠了 changed the answer');
    // The next panel asks neither question again.
    await page.reload();
    await sleep(1500);
    assert.equal(await dialog.count(), 0);
  });

  await step('the sharing question: Escape stores nothing and it asks again; 不同意 then 好辣 stores true', async () => {
    await worker.evaluate(() => chrome.storage.sync.remove('consent'));
    await page.reload();
    await consentDialog.waitFor();
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await consentOf(), null);
    await page.reload();
    await consentDialog.waitFor();
    await consentDialog.getByRole('button', { name: '不同意' }).click();
    await pleaseDialog.waitFor();
    await pleaseDialog.getByRole('button', { name: /好辣/ }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.ok(await waitFor(async () => (await consentOf())?.granted === true), '好辣 did not store true');
  });

  await step('signed out: the cloud is shown and the menu offers 用 Google 登入 without an account header', async () => {
    assert.equal(await page.locator('#signin-hint').isHidden(), false);
    assert.equal(await signInButton.getAttribute('aria-label'), '登入以同步觀察清單');
    const text = await menuText();
    assert.match(text, /用 Google 登入/);
    assert.ok(!/登出|刪除帳號/.test(text), text);
    assert.equal(await page.locator('.menu-header-email').count(), 0);
  });

  await step('the cloud opens the sign-in popup, × sends nothing', async () => {
    await signInButton.click();
    await signInDialog.waitFor();
    assert.equal(await signInDialog.getByRole('button', { name: '使用 Google 帳戶登入' }).count(), 1);
    assert.equal(await signInDialog.locator('a').count(), 1);
    await signInDialog.getByRole('button', { name: '關閉，不登入' }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.equal(google.requests.length, 0);
    assert.equal(await localAccount(), null);
    assert.equal(accountsOnServer().length, 0);
  });

  await step('a state that does not match shows an error and stores nothing', async () => {
    google.badState = true;
    await menuItem('用 Google 登入');
    await signInDialog.getByRole('button', { name: '使用 Google 帳戶登入' }).click();
    assert.ok(await waitFor(() => google.requests.length === 1), 'launchWebAuthFlow did not reach the fake Google page');
    assert.ok(await waitFor(async () => (await page.locator('#message-bar .message.problem').allTextContents()).join().includes('登入失敗，請再試一次')));
    assert.equal(await localAccount(), null);
    assert.equal(accountsOnServer().length, 0);
    assert.equal(await page.locator('#signin-hint').isHidden(), false);
  });

  await step('confirming signs in: session stored, email in the menu, cloud gone, one account', async () => {
    google.badState = false;
    firstSeenAt = await worker.evaluate(async () => (await chrome.storage.sync.get('firstSeenAt')).firstSeenAt);
    assert.ok(Number.isInteger(firstSeenAt), 'extension has no firstSeenAt');
    await signInButton.click();
    await signInDialog.getByRole('button', { name: '使用 Google 帳戶登入' }).click();
    assert.ok(await waitFor(async () => (await localAccount()) !== null), 'no account saved');
    const account = await localAccount();
    token = account.token;
    assert.ok(token);
    assert.equal(account.email, 'tester@example.com');
    assert.deepEqual(google.exchanges, [true], 'PKCE verifier did not match the challenge');
    assert.ok(await waitFor(async () => (await page.locator('#signin-hint').isHidden())), 'the cloud is still shown');
    await page.locator('#menu-button').click();
    assert.match(await page.locator('#menu').textContent(), /已登入，清單會自動同步/);
    assert.equal(await page.locator('.menu-header-email').textContent(), 'tester@example.com');
    assert.equal(await page.getByRole('menuitem', { name: '登出', exact: true }).count(), 1);
    assert.equal(await page.getByRole('menuitem', { name: '用 Google 登入', exact: true }).count(), 0);
    await page.keyboard.press('Escape');
    const [row, ...rest] = accountsOnServer();
    assert.equal(rest.length, 0);
    assert.equal(row.firstSeenAt, firstSeenAt);
  });

  await step('the anonymous upload does not carry the login', async () => {
    const text = await page.evaluate(async () => (await fetch('lib/upload.js')).text());
    assert.ok(!/account|Authorization|Bearer/.test(text));
  });

  await step('logging out removes the local session, the server token, and the screen follows', async () => {
    await menuItem('登出');
    assert.ok(await waitFor(async () => (await localAccount()) === null), 'account still stored');
    assert.ok(await waitFor(async () => !(await page.locator('#signin-hint').isHidden())), 'the cloud did not come back');
    assert.match(await menuText(), /用 Google 登入/);
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
