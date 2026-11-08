// Real-browser check that the extension reaches the server through CORS alone, without
// host permissions, and that nothing else can.
// Run: node e2e/cors.mjs   (setup and requirements: e2e/harness.mjs)

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer as createPageServer } from 'node:http';
import { join } from 'node:path';
import { createSteps, listen, sleep, startStack, waitFor } from './harness.mjs';

const stack = await startStack();
const { worker, seen } = stack;
const { step, finish } = createSteps();
const installs = () => stack.docs('installs').length;
const setConsent = (granted) =>
  worker.evaluate((value) => chrome.storage.sync.set({ consent: { v: 1, granted: value, at: Date.now() } }), granted);
const registeredAt = () =>
  worker.evaluate(async () => (await chrome.storage.local.get('installRegisteredAt')).installRegisteredAt ?? null);

try {
  await step('manifest asks for no host permission to the server', async () => {
    const manifest = JSON.parse(readFileSync(join(stack.extDir, 'manifest.json')));
    assert.ok(!manifest.host_permissions.some((host) => host.includes('localhost') || host.includes('workers.dev')));
  });

  await step('without consent the extension sends nothing', async () => {
    await sleep(2000);
    assert.deepEqual(seen, { POST: 0, OPTIONS: 0 });
    assert.equal(await worker.evaluate(async () => (await chrome.storage.sync.get('installId')).installId ?? null), null);
  });

  await step('an extension id that is not allowed cannot write', async () => {
    await setConsent(true);
    assert.ok(await waitFor(() => seen.OPTIONS > 0), 'no preflight arrived');
    await sleep(1000);
    assert.equal(seen.POST, 0, 'the browser should block the POST after the preflight');
    assert.equal(installs(), 0);
    assert.equal(await registeredAt(), null);
  });

  await step('the allowed extension id writes through CORS', async () => {
    stack.allowedOrigins.push(stack.origin);
    await setConsent(false);
    await setConsent(true);
    assert.ok(await waitFor(() => installs() === 1), 'no install was stored');
    assert.ok(await waitFor(async () => (await registeredAt()) !== null), 'installRegisteredAt was not saved');
  });

  await step('a normal web page cannot write', async () => {
    const pageServer = createPageServer((req, res) => res.end('<!doctype html><title>page</title>'));
    const pagePort = await listen(pageServer);
    const page = await stack.context.newPage();
    try {
      await page.goto(`http://127.0.0.1:${pagePort}/`);
      const postsBefore = seen.POST;
      const outcome = await page.evaluate(async (url) => {
        try {
          await fetch(`${url}/v1/installs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ schemaVersion: 1, installId: crypto.randomUUID(), firstSeenAt: Date.now(), extVersion: '0.1.0' }),
          });
          return 'sent';
        } catch {
          return 'blocked';
        }
      }, stack.serverUrl);
      assert.equal(outcome, 'blocked');
      assert.equal(seen.POST, postsBefore);
      assert.equal(installs(), 1);
    } finally {
      await page.close();
      pageServer.close();
    }
  });
} finally {
  await stack.close();
}

finish(`requests seen by the server: ${JSON.stringify(seen)}`);
