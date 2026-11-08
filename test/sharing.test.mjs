import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONSENT_VERSION, isPermanentFailure, needsConsentDecision, registerInstall, setConsent } from '../extension/lib/sharing.js';

// A small stand-in for one chrome.storage area.
function fakeArea(initial = {}) {
  const data = structuredClone(initial);
  return {
    data,
    async get(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(list.filter((key) => key in data).map((key) => [key, structuredClone(data[key])]));
    },
    async set(items) {
      Object.assign(data, structuredClone(items));
    },
  };
}

function fakeStorage({ sync = {}, local = {} } = {}) {
  return { sync: fakeArea(sync), local: fakeArea(local) };
}

const AGREED = { consent: { v: 1, granted: true, at: 1 } };

// Records each request and answers with the given status, or throws like a blocked fetch.
function fakeFetch(status) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    if (status === 'throw') throw new TypeError('Failed to fetch');
    return { ok: status >= 200 && status < 300, status };
  };
  return { calls, fetchImpl };
}

function run(storage, fetchImpl, extra = {}) {
  return registerInstall({
    storage,
    fetchImpl,
    serverUrl: 'https://server.test',
    now: () => 1_800_000_000_000,
    version: '0.1.0',
    ...extra,
  });
}

test('registerInstall sends nothing when the server is not set', async () => {
  const { calls, fetchImpl } = fakeFetch(201);
  assert.equal(await run(fakeStorage({ sync: AGREED }), fetchImpl, { serverUrl: '' }), 'disabled');
  assert.equal(calls.length, 0);
});

test('registerInstall sends nothing and makes no id without consent', async () => {
  for (const sync of [{}, { consent: { v: 1, granted: false, at: 1 } }]) {
    const storage = fakeStorage({ sync });
    const { calls, fetchImpl } = fakeFetch(201);
    assert.equal(await run(storage, fetchImpl), 'no-consent');
    assert.equal(calls.length, 0);
    assert.equal(storage.sync.data.installId, undefined);
  }
});

test('registerInstall makes the id after consent and sends it once', async () => {
  const storage = fakeStorage({ sync: AGREED });
  const { calls, fetchImpl } = fakeFetch(201);

  assert.equal(await run(storage, fetchImpl), 'registered');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://server.test/v1/installs');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
  assert.match(storage.sync.data.installId, /^[0-9a-f-]{36}$/);
  assert.deepEqual(calls[0].body, {
    schemaVersion: 1,
    installId: storage.sync.data.installId,
    firstSeenAt: 1_800_000_000_000,
    extVersion: '0.1.0',
  });
  assert.equal(storage.local.data.installRegisteredAt, 1_800_000_000_000);

  assert.equal(await run(storage, fetchImpl), 'done');
  assert.equal(calls.length, 1);
});

test('registerInstall keeps an existing id and first install date', async () => {
  const sync = { ...AGREED, installId: '11111111-2222-4333-8444-555555555555', firstSeenAt: 1_700_000_000_000 };
  const storage = fakeStorage({ sync });
  const { calls, fetchImpl } = fakeFetch(200);
  assert.equal(await run(storage, fetchImpl), 'registered');
  assert.equal(calls[0].body.installId, sync.installId);
  assert.equal(calls[0].body.firstSeenAt, sync.firstSeenAt);
});

test('registerInstall tries again after a network error or a server error', async () => {
  for (const status of ['throw', 500, 503, 408, 429]) {
    const storage = fakeStorage({ sync: AGREED });
    const { fetchImpl } = fakeFetch(status);
    assert.equal(await run(storage, fetchImpl), 'retry', String(status));
    assert.equal(storage.local.data.installRegisteredAt, undefined);
  }
});

test('registerInstall stops after the server rejects the data', async () => {
  const storage = fakeStorage({ sync: AGREED });
  const { calls, fetchImpl } = fakeFetch(400);
  assert.equal(await run(storage, fetchImpl), 'rejected');
  assert.equal(await run(storage, fetchImpl), 'done');
  assert.equal(calls.length, 1);
});

test('isPermanentFailure is true only for 4xx other than 408 and 429', () => {
  assert.deepEqual(
    [200, 201, 400, 404, 408, 413, 415, 429, 500].map(isPermanentFailure),
    [false, false, true, true, false, true, true, false, false],
  );
});

test('setConsent stores the version, the choice and the time', async () => {
  const storage = fakeStorage();
  await setConsent(true, storage, () => 123);
  assert.deepEqual(storage.sync.data.consent, { v: CONSENT_VERSION, granted: true, at: 123 });
  await setConsent(false, storage, () => 456);
  assert.deepEqual(storage.sync.data.consent, { v: CONSENT_VERSION, granted: false, at: 456 });
});

test('needsConsentDecision is true without a decision or with an older version', async () => {
  assert.equal(await needsConsentDecision(fakeStorage()), true);
  assert.equal(await needsConsentDecision(fakeStorage({ sync: { consent: { v: 0, granted: true, at: 1 } } })), true);
});

test('needsConsentDecision is false once the current version is answered, either way', async () => {
  assert.equal(await needsConsentDecision(fakeStorage({ sync: AGREED })), false);
  const declined = { consent: { v: CONSENT_VERSION, granted: false, at: 1 } };
  assert.equal(await needsConsentDecision(fakeStorage({ sync: declined })), false);
});
