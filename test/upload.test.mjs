import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clearUploadData, fitBody, maybeUpload, recordChanges, MAX_BODY_BYTES, MAX_EVENTS } from '../extension/lib/upload.js';

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
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
    },
  };
}

function fakeStorage({ sync = {}, local = {} } = {}) {
  return { sync: fakeArea(sync), local: fakeArea(local) };
}

const AGREED = { consent: { v: 1, granted: true, at: 1_000 } };
const DAY = 24 * 60 * 60 * 1000;
const T0 = 1_800_000_000_000;
const GROUPS = [{ id: 'g1', name: 'Secret name', tabId: 'tab1', symbols: [{ id: 'NASDAQ:AAPL', name: 'Apple' }] }];
const ev = (n, op = 'add') => ({ t: T0 + n, op, groupId: 'g1', symbolId: 'NASDAQ:AAPL' });

// Answers with the given status (or throws), and can hold the response until released.
function fakeFetch(status = 201, { hold = false } = {}) {
  const calls = [];
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const fetchImpl = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    if (hold) await gate;
    if (status === 'throw') throw new TypeError('Failed to fetch');
    return { ok: status >= 200 && status < 300, status };
  };
  return { calls, fetchImpl, release };
}

function run(storage, fetchImpl, { time = T0, ...extra } = {}) {
  return maybeUpload({
    storage,
    fetchImpl,
    serverUrl: 'https://server.test',
    now: () => time,
    version: '0.1.0',
    loadGroups: async () => GROUPS,
    ...extra,
  });
}

test('events are dropped and nothing is sent without consent', async () => {
  const storage = fakeStorage();
  const { calls, fetchImpl } = fakeFetch();
  await recordChanges([ev(1)], { storage });
  assert.equal(storage.local.data.changeLog, undefined);
  assert.equal(await run(storage, fetchImpl), 'no-consent');
  assert.equal(calls.length, 0);
});

test('events are added, bad ones are dropped, and the log keeps the newest 5000', async () => {
  const storage = fakeStorage({ sync: AGREED });
  await recordChanges([ev(1), { ...ev(2), symbolId: 'bad id' }, { ...ev(3), op: 'move' }], { storage });
  assert.deepEqual(storage.local.data.changeLog, [ev(1)]);
  assert.equal(storage.local.data.changeLogTruncated, undefined);

  await recordChanges(Array.from({ length: MAX_EVENTS }, (_, i) => ev(10 + i)), { storage });
  assert.equal(storage.local.data.changeLog.length, MAX_EVENTS);
  assert.equal(storage.local.data.changeLog[0].t, T0 + 10);
  assert.equal(storage.local.data.changeLogTruncated, true);
});

test('the first upload goes out at once with a body that matches the contract', async () => {
  const storage = fakeStorage({ sync: AGREED });
  const { calls, fetchImpl } = fakeFetch(201);
  await recordChanges([ev(1)], { storage });

  assert.equal(await run(storage, fetchImpl), 'uploaded');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://server.test/v1/uploads');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
  const { body } = calls[0];
  assert.deepEqual(Object.keys(body).sort(), [
    'analyticsId', 'events', 'extVersion', 'periodEnd', 'periodStart', 'schemaVersion', 'snapshot', 'truncated', 'uploadId',
  ]);
  assert.equal(body.schemaVersion, 1);
  assert.match(body.uploadId, /^[0-9a-f-]{36}$/);
  assert.equal(body.analyticsId, storage.sync.data.analyticsId);
  assert.equal(body.extVersion, '0.1.0');
  assert.equal(body.periodStart, 1_000);
  assert.equal(body.periodEnd, T0);
  assert.equal(body.truncated, false);
  assert.deepEqual(body.events, [ev(1)]);
  assert.deepEqual(body.snapshot, { groups: [{ id: 'g1', tabId: 'tab1', symbols: ['NASDAQ:AAPL'] }] });
  assert.ok(!JSON.stringify(body).includes('Secret name'));
  assert.ok(!JSON.stringify(body).includes('Apple'));
  assert.equal(storage.local.data.pendingUpload, undefined);
  assert.equal(storage.local.data.lastUploadAt, T0);
  assert.deepEqual(storage.local.data.changeLog, []);
});

test('nothing is sent within 7 days, then the next upload starts at the last one', async () => {
  const storage = fakeStorage({ sync: AGREED });
  const { calls, fetchImpl } = fakeFetch(201);
  assert.equal(await run(storage, fetchImpl), 'uploaded');
  assert.equal(await run(storage, fetchImpl, { time: T0 + 7 * DAY - 1 }), 'not-due');
  assert.equal(calls.length, 1);
  assert.equal(await run(storage, fetchImpl, { time: T0 + 7 * DAY }), 'uploaded');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.periodStart, T0);
  assert.equal(calls[1].body.periodEnd, T0 + 7 * DAY);
  assert.equal(storage.local.data.lastUploadAt, T0 + 7 * DAY);
});

test('a failed upload is kept and sent again with the same uploadId', async () => {
  for (const status of ['throw', 500, 408, 429]) {
    const storage = fakeStorage({ sync: AGREED });
    await recordChanges([ev(1)], { storage });
    const failing = fakeFetch(status);
    assert.equal(await run(storage, failing.fetchImpl), 'retry', String(status));
    assert.equal(storage.local.data.pendingUpload.uploadId, failing.calls[0].body.uploadId);
    assert.equal(storage.local.data.lastUploadAt, undefined);
    assert.deepEqual(storage.local.data.changeLog, []);

    await recordChanges([ev(2)], { storage });
    const working = fakeFetch(200);
    assert.equal(await run(storage, working.fetchImpl, { time: T0 + 1 }), 'uploaded');
    assert.deepEqual(working.calls[0].body, failing.calls[0].body);
    assert.equal(storage.local.data.pendingUpload, undefined);
    assert.equal(storage.local.data.lastUploadAt, T0 + 1);
    assert.deepEqual(storage.local.data.changeLog, [ev(2)]);
  }
});

test('events added while the request runs stay in the log', async () => {
  const storage = fakeStorage({ sync: AGREED });
  await recordChanges([ev(1)], { storage });
  const { calls, fetchImpl, release } = fakeFetch(201, { hold: true });

  const pending = run(storage, fetchImpl);
  while (calls.length === 0) await new Promise((resolve) => setImmediate(resolve));
  await recordChanges([ev(2)], { storage });
  release();

  assert.equal(await pending, 'uploaded');
  assert.deepEqual(calls[0].body.events, [ev(1)]);
  assert.deepEqual(storage.local.data.changeLog, [ev(2)]);
});

test('only one upload runs at a time', async () => {
  const storage = fakeStorage({ sync: AGREED });
  const { calls, fetchImpl, release } = fakeFetch(201, { hold: true });
  const first = run(storage, fetchImpl);
  const second = run(storage, fetchImpl);
  while (calls.length === 0) await new Promise((resolve) => setImmediate(resolve));
  release();
  assert.deepEqual(await Promise.all([first, second]), ['uploaded', 'uploaded']);
  assert.equal(calls.length, 1);
});

test('a 4xx answer drops that batch', async () => {
  const storage = fakeStorage({ sync: AGREED });
  await recordChanges([ev(1)], { storage });
  const { calls, fetchImpl } = fakeFetch(400);
  assert.equal(await run(storage, fetchImpl), 'rejected');
  assert.equal(storage.local.data.pendingUpload, undefined);
  assert.equal(storage.local.data.lastUploadAt, T0);
  assert.deepEqual(storage.local.data.changeLog, []);
  assert.equal(await run(storage, fetchImpl, { time: T0 + 1 }), 'not-due');
  assert.equal(calls.length, 1);
});

test('taking back consent deletes the collected data and keeps the analytics id', async () => {
  const storage = fakeStorage({ sync: AGREED });
  await recordChanges([ev(1)], { storage });
  await run(storage, fakeFetch(500).fetchImpl);
  await recordChanges([ev(2)], { storage });
  storage.local.data.changeLogTruncated = true;
  storage.local.data.lastUploadAt = T0;
  const id = storage.sync.data.analyticsId;
  assert.ok(id);

  await clearUploadData({ storage });
  for (const key of ['changeLog', 'changeLogTruncated', 'pendingUpload', 'lastUploadAt']) {
    assert.equal(storage.local.data[key], undefined, key);
  }
  assert.equal(storage.sync.data.analyticsId, id);
});

test('the analytics id stays the same across uploads and differs from the install id', async () => {
  const installId = '11111111-2222-4333-8444-555555555555';
  const storage = fakeStorage({ sync: { ...AGREED, installId } });
  const { calls, fetchImpl } = fakeFetch(201);
  await run(storage, fetchImpl);
  await run(storage, fetchImpl, { time: T0 + 7 * DAY });
  await run(storage, fetchImpl, { time: T0 + 14 * DAY });
  assert.equal(calls.length, 3);
  assert.equal(new Set(calls.map((call) => call.body.analyticsId)).size, 1);
  assert.notEqual(calls[0].body.analyticsId, installId);
});

test('nothing is sent when the server is not set', async () => {
  const storage = fakeStorage({ sync: AGREED });
  const { calls, fetchImpl } = fakeFetch(201);
  assert.equal(await run(storage, fetchImpl, { serverUrl: '' }), 'disabled');
  assert.equal(calls.length, 0);
  assert.equal(storage.local.data.pendingUpload, undefined);
});

test('fitBody drops the oldest events until the body fits, and marks it truncated', () => {
  const longId = `EXCHANGE_${'X'.repeat(23)}:${'Y'.repeat(48)}`;
  const events = Array.from({ length: MAX_EVENTS }, (_, i) => ({ t: i, op: 'add', groupId: 'g'.repeat(40), symbolId: longId }));
  const body = fitBody({ truncated: false, events, snapshot: { groups: [] } });
  assert.ok(new TextEncoder().encode(JSON.stringify(body)).length <= MAX_BODY_BYTES);
  assert.equal(body.truncated, true);
  assert.ok(body.events.length > 0 && body.events.length < MAX_EVENTS);
  assert.equal(body.events.at(-1).t, MAX_EVENTS - 1, 'the newest event stays');
});

test('fitBody leaves a small body alone', () => {
  const body = { truncated: false, events: [{ t: 1, op: 'add', groupId: 'g1', symbolId: 'TWSE:2330' }], snapshot: { groups: [] } };
  assert.deepEqual(fitBody(structuredClone(body)), body);
});
