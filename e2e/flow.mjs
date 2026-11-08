// Real-browser check of the whole sharing flow: the consent dialog, the first snapshot,
// change records from side panel edits, the weekly upload, and taking consent back.
// Run: node e2e/flow.mjs   (setup and requirements: e2e/harness.mjs)

import assert from 'node:assert/strict';
import { createSteps, sleep, startStack, waitFor } from './harness.mjs';

const DAY = 24 * 60 * 60 * 1000;
const stack = await startStack();
const { worker, context } = stack;
stack.allowedOrigins.push(stack.origin);
const { step, finish } = createSteps();

const uploads = () => stack.docs('uploads').sort((a, b) => a.receivedAt - b.receivedAt);
const local = (key) => worker.evaluate(async (k) => (await chrome.storage.local.get(k))[k] ?? null, key);
const changeLog = async () => (await local('changeLog')) ?? [];
const panelUrl = `chrome-extension://${stack.extensionId}/sidepanel.html`;
const errors = [];

async function openPanel() {
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.setViewportSize({ width: 360, height: 720 });
  await page.goto(panelUrl);
  return page;
}

const removeButton = (page, ticker) => page.locator(`button.row-remove[aria-label$=" ${ticker}"]`).first();

try {
  // Two groups that already exist before the user decides.
  await worker.evaluate(() =>
    chrome.storage.sync.set({
      groupOrder: ['g1', 'g2'],
      'group:g1': {
        id: 'g1',
        name: '科技',
        collapsed: false,
        symbols: [
          { id: 'TWSE:2330', name: '台積電' },
          { id: 'NASDAQ:NVDA', name: 'NVIDIA' },
        ],
      },
      'group:g2': { id: 'g2', name: '幣', collapsed: false, symbols: [{ id: 'BINANCE:BTCUSDT', name: 'BTC' }] },
    }),
  );

  const pageA = await openPanel();

  await step('the consent dialog opens and nothing is sent before a decision', async () => {
    await pageA.getByText('匿名分享觀察清單？').waitFor({ timeout: 5000 });
    await sleep(1000);
    assert.equal(stack.seen.POST, 0);
  });

  await step('agreeing registers the install and sends a first snapshot without names', async () => {
    await pageA.getByRole('button', { name: '同意', exact: true }).click();
    assert.ok(await waitFor(() => stack.docs('installs').length === 1), 'no install');
    assert.ok(await waitFor(() => uploads().length === 1), 'no first snapshot');
    const [first] = uploads();
    assert.equal(first.eventCount, 0);
    const snapshot = JSON.parse(first.snapshotJson);
    assert.deepEqual(snapshot.groups.find((group) => group.id === 'g1').symbols, ['TWSE:2330', 'NASDAQ:NVDA']);
    assert.ok(!first.snapshotJson.includes('科技') && !first.snapshotJson.includes('台積電'), 'names were uploaded');
    assert.notEqual(first.analyticsId, stack.docs('installs')[0].installId);
  });

  await step('removing a symbol in the panel records one remove event', async () => {
    await removeButton(pageA, 'NVDA').click();
    assert.ok(await waitFor(async () => (await changeLog()).length === 1), 'no event');
    const [event] = await changeLog();
    assert.deepEqual({ op: event.op, groupId: event.groupId, symbolId: event.symbolId }, {
      op: 'remove',
      groupId: 'g1',
      symbolId: 'NASDAQ:NVDA',
    });
  });

  const pageB = await openPanel();

  await step('with two panels open, one edit is recorded once', async () => {
    await removeButton(pageA, 'BTCUSDT').click();
    assert.ok(await waitFor(async () => (await changeLog()).length === 2), 'no second event');
    await sleep(2000);
    assert.equal((await changeLog()).length, 2);
  });

  await step('a change that arrives through sync is not recorded', async () => {
    await worker.evaluate(() =>
      chrome.storage.sync.set({
        'group:g2': { id: 'g2', name: '幣', collapsed: false, symbols: [{ id: 'BINANCE:ETHUSDT', name: 'ETH' }] },
      }),
    );
    await sleep(2000);
    assert.equal((await changeLog()).length, 2);
  });

  await step('after changes from elsewhere, an edit in the other panel records only itself', async () => {
    await removeButton(pageB, '2330').click();
    assert.ok(await waitFor(async () => (await changeLog()).length === 3), 'no third event');
    await sleep(1500);
    const log = await changeLog();
    assert.deepEqual(log.slice(2).map((event) => `${event.op} ${event.symbolId}`), ['remove TWSE:2330']);
  });

  await step('after 7 days, opening the panel uploads the recorded changes', async () => {
    await worker.evaluate((ago) => chrome.storage.local.set({ lastUploadAt: Date.now() - ago }), 8 * DAY);
    await pageA.reload();
    assert.ok(await waitFor(() => uploads().length === 2), 'no weekly upload');
    const second = uploads()[1];
    assert.equal(second.eventCount, 3);
    assert.deepEqual(
      JSON.parse(second.eventsJson).map((event) => `${event.op} ${event.symbolId}`),
      ['remove NASDAQ:NVDA', 'remove BINANCE:BTCUSDT', 'remove TWSE:2330'],
    );
    assert.ok(await waitFor(async () => (await changeLog()).length === 0), 'change log was not cleared');
  });

  await step('before 7 days pass, opening the panel uploads nothing', async () => {
    await pageA.reload();
    await sleep(2000);
    assert.equal(uploads().length, 2);
  });

  await step('turning sharing off in the settings stops recording', async () => {
    await pageA.locator('#settings summary').click();
    const toggle = pageA.getByLabel('匿名分享觀察清單');
    assert.ok(await toggle.isChecked());
    await toggle.uncheck();
    assert.ok(await waitFor(async () => (await local('lastUploadAt')) === null), 'upload state was not cleared');
    await removeButton(pageA, 'ETHUSDT').click();
    await sleep(1500);
    assert.equal((await changeLog()).length, 0);
    assert.equal(uploads().length, 2);
  });

  await step('the panels log no errors', async () => {
    const real = errors.filter((text) => !/Failed to load resource|net::ERR_/.test(text));
    assert.deepEqual(real, []);
  });

  await pageB.close();
  await pageA.close();
} finally {
  await stack.close();
}

finish(`uploads stored: ${stack.docs('uploads').length}, installs stored: ${stack.docs('installs').length}`);
