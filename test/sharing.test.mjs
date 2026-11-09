import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONSENT_VERSION, ensureFirstSeen, needsConsentDecision, setConsent } from '../extension/lib/sharing.js';

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

test('ensureFirstSeen writes the date when there is none, with no consent needed', async () => {
  const storage = fakeStorage();
  assert.equal(await ensureFirstSeen(storage, () => 1_800_000_000_000), 1_800_000_000_000);
  assert.equal(storage.sync.data.firstSeenAt, 1_800_000_000_000);
  assert.equal(storage.sync.data.consent, undefined);
});

test('ensureFirstSeen never overwrites an existing date', async () => {
  const storage = fakeStorage({ sync: { firstSeenAt: 1_700_000_000_000 } });
  assert.equal(await ensureFirstSeen(storage, () => 1_800_000_000_000), 1_700_000_000_000);
  assert.equal(storage.sync.data.firstSeenAt, 1_700_000_000_000);
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
