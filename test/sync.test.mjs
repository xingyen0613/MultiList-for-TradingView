import assert from 'node:assert/strict';
import { test } from 'node:test';
import { docFromItems, docsEqual, normalizeDoc } from '../extension/lib/merge.js';
import { createSync, isListKey, LIST_LOCK } from '../extension/lib/sync.js';

const ACCOUNT = { email: 'a@b.c', token: 't1', accountId: 'acc1' };
const AAPL = { id: 'NASDAQ:AAPL', name: 'Apple' };
const TSMC = { id: 'TWSE:2330', name: '台積電' };
const NVDA = { id: 'NASDAQ:NVDA', name: 'NVIDIA' };
const BTC = { id: 'BINANCE:BTCUSDT', name: '' };
const UPDATED_AT = 1_790_000_000_000;

const group = (id, symbols, extra = {}) => ({ id, name: id.toUpperCase(), collapsed: false, symbols, ...extra });
const doc = (...groups) =>
  normalizeDoc({ groupOrder: groups.map((item) => item.id), groups: Object.fromEntries(groups.map((item) => [item.id, item])) });

const LIST = doc(group('g1', [AAPL, TSMC]), group('g2', [BTC]));
const OTHER = doc(group('x1', [NVDA]));
const recordOf = (version, base, accountId = 'acc1') => ({ accountId, version, base: normalizeDoc(base) });

// The chrome.storage.sync items of a doc.
function itemsOf(value) {
  const items = { groupOrder: value.groupOrder, tabNames: value.tabNames, customTabs: value.customTabs };
  for (const id of value.groupOrder) items[`group:${id}`] = value.groups[id];
  return items;
}

function fakeArea(initial, check = () => {}) {
  const area = {
    data: structuredClone(initial),
    writes: 0,
    failWrites: false,
    afterWrite: null,
    async get(keys) {
      if (keys === null) return structuredClone(area.data);
      return Object.fromEntries([keys].flat().filter((key) => key in area.data).map((key) => [key, structuredClone(area.data[key])]));
    },
    async set(items) {
      check();
      if (area.failWrites) throw new Error('QUOTA_BYTES_PER_ITEM quota exceeded');
      area.writes += 1;
      Object.assign(area.data, structuredClone(items));
      area.afterWrite?.();
    },
    async remove(keys) {
      check();
      if (area.failWrites) throw new Error('write failed');
      area.writes += 1;
      for (const key of [keys].flat()) delete area.data[key];
      area.afterWrite?.();
    },
  };
  return area;
}

// Works like the real server: compare-and-set on the version, 409 with the current copy,
// 401 without a known session. answers.GET / answers.PUT force the next answers.
function fakeServer({ version, data }) {
  const server = {
    version,
    data: data && normalizeDoc(data),
    updatedAt: data ? UPDATED_AT : null,
    sessions: new Set(['t1']),
    calls: [],
    answers: { GET: [], PUT: [] },
    beforePut: null,
    methods: () => server.calls.map((call) => call.method),
    puts: () => server.calls.filter((call) => call.method === 'PUT'),
  };
  const view = () => ({ version: server.version, data: structuredClone(server.data), updatedAt: server.updatedAt });
  const reply = (status, body) => ({ status, json: async () => structuredClone(body) });
  server.fetch = async (url, init) => {
    const body = init.body === undefined ? undefined : JSON.parse(init.body);
    server.calls.push({ url, method: init.method, headers: init.headers, body });
    let forced = server.answers[init.method].shift();
    if (typeof forced === 'function') forced = forced();
    if (forced === 'offline') throw new TypeError('Failed to fetch');
    if (forced) return reply(forced.status, forced.body ?? { error: 'forced' });
    if (!server.sessions.has(init.headers.Authorization.slice('Bearer '.length))) return reply(401, { error: 'session' });
    if (init.method === 'GET') return reply(200, view());
    const hook = server.beforePut;
    server.beforePut = null;
    hook?.();
    if (body.baseVersion !== server.version) return reply(409, view());
    server.version += 1;
    server.data = body.data;
    server.updatedAt += 1000;
    return reply(200, { version: server.version, updatedAt: server.updatedAt });
  };
  return server;
}

// One lock at a time, in order. before runs once when the next lock is granted, like a side panel
// save that got the lock first.
function fakeLocks() {
  let chain = Promise.resolve();
  const locks = {
    names: [],
    held: false,
    before: null,
    request(name, callback) {
      locks.names.push(name);
      const run = chain.then(async () => {
        const hook = locks.before;
        locks.before = null;
        await hook?.();
        locks.held = true;
        try {
          return await callback();
        } finally {
          locks.held = false;
        }
      });
      chain = run.catch(() => {});
      return run;
    },
  };
  return locks;
}

function fakeTimers() {
  let time = 1_800_000_000_000;
  let nextId = 1;
  const timers = new Map();
  return {
    now: () => time,
    setTimeout: (fn, ms) => {
      timers.set(nextId, { at: time + ms, fn });
      return nextId++;
    },
    clearTimeout: (id) => timers.delete(id),
    count: () => timers.size,
    advance(ms) {
      time += ms;
      for (const [id, timer] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
        if (timer.at > time) continue;
        timers.delete(id);
        timer.fn();
      }
    },
  };
}

function setup({ local = LIST, cloud = null, cloudVersion = cloud ? 1 : 0, record = null, account = ACCOUNT, extra = {} } = {}) {
  const locks = fakeLocks();
  const timers = fakeTimers();
  const server = fakeServer({ version: cloudVersion, data: cloud });
  const storage = {
    sync: fakeArea(local ? itemsOf(local) : {}, () => assert.ok(locks.held, 'the list was written outside LIST_LOCK')),
    local: fakeArea({ ...(account && { account }), ...(record && { cloudSync: record }), ...extra }),
  };
  const engine = createSync({
    storage,
    fetchFn: server.fetch,
    serverUrl: 'http://s',
    now: timers.now,
    locks,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  });
  return {
    engine,
    storage,
    server,
    locks,
    timers,
    localDoc: () => docFromItems(storage.sync.data),
    saved: () => storage.local.data.cloudSync,
    state: () => storage.local.data.syncStatus?.state,
    // A side panel save: it writes the items directly, without the engine.
    edit: (value) => {
      for (const key of Object.keys(storage.sync.data)) if (key.startsWith('group:')) delete storage.sync.data[key];
      Object.assign(storage.sync.data, itemsOf(value));
    },
  };
}

test('isListKey matches the list keys only', () => {
  for (const key of ['groupOrder', 'group:g1', 'tabNames', 'customTabs']) assert.equal(isListKey(key), true, key);
  for (const key of ['consent', 'firstSeenAt', 'analyticsId', 'groups']) assert.equal(isListKey(key), false, key);
});

test('signed out: nothing is sent', async () => {
  const t = setup({ account: null });
  assert.equal(await t.engine.syncNow(), false);
  t.engine.schedulePush();
  t.timers.advance(3000);
  await t.engine.flush();
  assert.deepEqual(t.server.calls, []);
});

test('first sync with an empty cloud uploads the local list with the bearer token', async () => {
  const t = setup({ local: LIST });
  assert.equal(await t.engine.syncNow(), true);
  const [get, put] = t.server.calls;
  assert.deepEqual(t.server.methods(), ['GET', 'PUT']);
  assert.equal(get.url, 'http://s/v1/sync');
  assert.equal(get.headers.Authorization, 'Bearer t1');
  assert.equal(put.headers['Content-Type'], 'application/json');
  assert.equal(put.body.baseVersion, 0);
  assert.deepEqual(Object.keys(put.body.data).sort(), ['customTabs', 'groupOrder', 'groups', 'tabNames']);
  assert.ok(docsEqual(put.body.data, LIST));
  assert.deepEqual(t.saved(), recordOf(1, LIST));
  assert.equal(t.state(), 'ok');
});

test('first sync on an empty install downloads the cloud list without asking', async () => {
  const t = setup({ local: null, cloud: LIST, cloudVersion: 4 });
  await t.engine.syncNow();
  assert.deepEqual(t.server.methods(), ['GET']);
  assert.ok(docsEqual(t.localDoc(), LIST));
  assert.deepEqual(t.saved(), recordOf(4, LIST));
  assert.equal(t.storage.local.data.syncChoice, undefined);
  assert.ok(t.locks.names.length > 0 && t.locks.names.every((name) => name === LIST_LOCK));
});

test('first sync with the same list on both sides only records the base', async () => {
  const t = setup({ local: LIST, cloud: LIST, cloudVersion: 7 });
  await t.engine.syncNow();
  assert.deepEqual(t.server.methods(), ['GET']);
  assert.equal(t.storage.sync.writes, 0);
  assert.deepEqual(t.saved(), recordOf(7, LIST));
  assert.equal(t.state(), 'ok');
});

test('first sync with two different lists asks, and nothing moves until the user picks one', async () => {
  const t = setup({ local: LIST, cloud: OTHER, cloudVersion: 3 });
  await t.engine.syncNow();
  assert.deepEqual(t.storage.local.data.syncChoice, {
    local: { groups: 2, symbols: 3 },
    cloud: { groups: 1, symbols: 1 },
    cloudUpdatedAt: UPDATED_AT,
  });
  assert.equal(t.state(), 'choice');
  assert.equal(t.saved(), undefined);
  assert.ok(docsEqual(t.localDoc(), LIST));

  t.edit(doc(group('g1', [AAPL])));
  t.engine.schedulePush();
  t.timers.advance(3000);
  await t.engine.whenIdle();
  assert.deepEqual(t.server.methods(), ['GET']);
  assert.ok(docsEqual(t.server.data, OTHER));
});

test('a download finds a list saved meanwhile inside the lock, so it asks instead', async () => {
  const t = setup({ local: null, cloud: LIST, cloudVersion: 4 });
  t.locks.before = () => t.edit(OTHER);
  await t.engine.syncNow();
  assert.ok(docsEqual(t.localDoc(), OTHER));
  assert.deepEqual(t.storage.local.data.syncChoice.local, { groups: 1, symbols: 1 });
  assert.equal(t.saved(), undefined);
  assert.equal(t.state(), 'choice');
});

test('a record of another account does not count as a base, so the first-sync rules apply', async () => {
  // As a base for acc1 it would merge, and OTHER would silently replace the local list.
  const t = setup({ local: LIST, cloud: OTHER, cloudVersion: 3, record: recordOf(1, LIST, 'someone-else') });
  await t.engine.syncNow();
  assert.equal(t.state(), 'choice');
  assert.ok(docsEqual(t.localDoc(), LIST));
  assert.deepEqual(t.server.methods(), ['GET']);
});

test('a lower cloud version means a rebuilt cloud copy, so the first-sync rules apply', async () => {
  const asked = setup({ local: LIST, cloud: OTHER, cloudVersion: 2, record: recordOf(5, LIST) });
  await asked.engine.syncNow();
  assert.equal(asked.state(), 'choice');
  assert.ok(docsEqual(asked.localDoc(), LIST));

  const emptied = setup({ local: LIST, cloud: null, cloudVersion: 0, record: recordOf(5, LIST) });
  await emptied.engine.syncNow();
  assert.equal(emptied.server.puts()[0].body.baseVersion, 0);
  assert.deepEqual(emptied.saved(), recordOf(1, LIST));
});

test('common base, only the local list changed: one PUT with the record version', async () => {
  const mine = doc(group('g1', [AAPL]), group('g2', [BTC]));
  const t = setup({ local: mine, cloud: LIST, cloudVersion: 2, record: recordOf(2, LIST) });
  await t.engine.syncNow();
  assert.deepEqual(t.server.methods(), ['GET', 'PUT']);
  assert.equal(t.server.puts()[0].body.baseVersion, 2);
  assert.ok(docsEqual(t.server.data, mine));
  assert.equal(t.storage.sync.writes, 0);
  assert.deepEqual(t.saved(), recordOf(3, mine));
});

test('common base, only the cloud changed: written locally, no PUT', async () => {
  const theirs = doc(group('g1', [AAPL, TSMC]), group('g2', [BTC, NVDA]));
  const t = setup({ local: LIST, cloud: theirs, cloudVersion: 3, record: recordOf(2, LIST) });
  await t.engine.syncNow();
  assert.deepEqual(t.server.methods(), ['GET']);
  assert.ok(docsEqual(t.localDoc(), theirs));
  assert.deepEqual(t.saved(), recordOf(3, theirs));
  assert.equal(t.state(), 'ok');
});

test('common base, both changed: the merge is written locally and pushed', async () => {
  const mine = doc(group('g1', [AAPL, TSMC], { collapsed: true }), group('g2', [BTC]));
  const theirs = doc(group('g1', [AAPL]), group('g2', [BTC]));
  const merged = doc(group('g1', [AAPL], { collapsed: true }), group('g2', [BTC]));
  const t = setup({ local: mine, cloud: theirs, cloudVersion: 3, record: recordOf(2, LIST) });
  await t.engine.syncNow();
  assert.deepEqual(t.server.methods(), ['GET', 'PUT']);
  assert.equal(t.server.puts()[0].body.baseVersion, 3);
  assert.ok(docsEqual(t.localDoc(), merged));
  assert.ok(docsEqual(t.server.data, merged));
  assert.deepEqual(t.saved(), recordOf(4, merged));
});

test('the merge uses the local list read inside the lock, not the one read before it', async () => {
  const theirs = doc(group('g1', [AAPL, TSMC]), group('g2', [BTC, NVDA]));
  const t = setup({ local: LIST, cloud: theirs, cloudVersion: 3, record: recordOf(2, LIST) });
  // A side panel save that removes TSMC just before the engine gets the lock.
  t.locks.before = () => t.edit(doc(group('g1', [AAPL]), group('g2', [BTC])));
  await t.engine.syncNow();
  const both = doc(group('g1', [AAPL]), group('g2', [BTC, NVDA]));
  assert.ok(docsEqual(t.localDoc(), both));
  assert.ok(docsEqual(t.server.data, both));
});

test('a 409 merges again with the newer cloud copy from the answer, then succeeds', async () => {
  const mine = doc(group('g1', [TSMC]), group('g2', [BTC]));
  const t = setup({ local: mine, cloud: LIST, cloudVersion: 2, record: recordOf(2, LIST) });
  // Another browser adds NVDA between our GET and our PUT.
  t.server.beforePut = () => {
    t.server.version = 3;
    t.server.data = doc(group('g1', [AAPL, TSMC]), group('g2', [BTC, NVDA]));
  };
  await t.engine.syncNow();
  const both = doc(group('g1', [TSMC]), group('g2', [BTC, NVDA]));
  assert.deepEqual(t.server.methods(), ['GET', 'PUT', 'PUT']);
  assert.deepEqual(t.server.puts().map((call) => call.body.baseVersion), [2, 3]);
  assert.ok(docsEqual(t.server.data, both));
  assert.ok(docsEqual(t.localDoc(), both));
  assert.deepEqual(t.saved(), recordOf(4, both));
  assert.equal(t.state(), 'ok');
});

test('after three more 409 answers the sync stops with an error', async () => {
  const mine = doc(group('g1', [TSMC]), group('g2', [BTC]));
  const t = setup({ local: mine, cloud: LIST, cloudVersion: 2, record: recordOf(2, LIST) });
  for (let version = 3; version < 10; version += 1) {
    t.server.answers.PUT.push({ status: 409, body: { version, data: LIST, updatedAt: UPDATED_AT } });
  }
  assert.equal(await t.engine.syncNow(), false);
  assert.equal(t.server.puts().length, 4);
  assert.equal(t.state(), 'error');
});

test('a failed local write leaves the record as it was', async () => {
  const theirs = doc(group('g1', [AAPL, TSMC]), group('g2', [BTC, NVDA]));
  const t = setup({ local: LIST, cloud: theirs, cloudVersion: 3, record: recordOf(2, LIST) });
  t.storage.sync.failWrites = true;
  assert.equal(await t.engine.syncNow(), false);
  assert.deepEqual(t.saved(), recordOf(2, LIST));
  assert.equal(t.state(), 'error');
  assert.deepEqual(t.server.methods(), ['GET']);
});

test('the push that its own write triggers waits in the queue and sends nothing', async () => {
  const theirs = doc(group('g1', [AAPL, TSMC]), group('g2', [BTC, NVDA]));
  const t = setup({ local: LIST, cloud: theirs, cloudVersion: 3, record: recordOf(2, LIST) });
  // storage.onChanged fires while the sync still runs, and the timer ends before the sync does.
  t.storage.sync.afterWrite = () => {
    t.engine.schedulePush();
    t.timers.advance(3000);
  };
  await t.engine.syncNow();
  await t.engine.whenIdle();
  assert.deepEqual(t.server.methods(), ['GET']);
  assert.deepEqual(t.saved(), recordOf(3, theirs));
});

test('a 401 signs out, marks the session expired, and keeps the list and the record', async () => {
  const t = setup({ local: LIST, cloud: LIST, cloudVersion: 2, record: recordOf(2, LIST) });
  t.server.sessions.clear();
  assert.equal(await t.engine.syncNow(), false);
  assert.equal(t.storage.local.data.account, undefined);
  assert.equal(t.storage.local.data.signInExpired, true);
  assert.deepEqual(t.saved(), recordOf(2, LIST));
  assert.ok(docsEqual(t.localDoc(), LIST));
  assert.notEqual(t.state(), 'error');
});

test('a 401 after the user signed out does not show an expired session', async () => {
  const t = setup({ local: LIST, cloud: LIST, cloudVersion: 2, record: recordOf(2, LIST) });
  t.server.answers.GET.push(() => {
    delete t.storage.local.data.account;
    return { status: 401 };
  });
  await t.engine.syncNow();
  assert.equal(t.storage.local.data.signInExpired, undefined);
});

test('a 5xx answer or no network sets error and keeps everything', async () => {
  for (const answer of [{ status: 503 }, 'offline']) {
    const t = setup({ local: LIST, cloud: LIST, cloudVersion: 2, record: recordOf(2, LIST) });
    t.server.answers.GET.push(answer);
    assert.equal(await t.engine.syncNow(), false);
    assert.equal(t.state(), 'error');
    assert.deepEqual(t.storage.local.data.account, ACCOUNT);
    assert.deepEqual(t.saved(), recordOf(2, LIST));
  }
});

test('a 400 sets error without retrying, and the log has the status but not the list', async (context) => {
  const warn = context.mock.method(console, 'warn', () => {});
  const mine = doc(group('g1', [AAPL]), group('g2', [BTC]));
  const t = setup({ local: mine, cloud: LIST, cloudVersion: 2, record: recordOf(2, LIST) });
  t.server.answers.PUT.push({ status: 400, body: { error: 'data.groups.g1.name' } });
  assert.equal(await t.engine.syncNow(), false);
  assert.equal(t.server.puts().length, 1);
  assert.equal(t.state(), 'error');
  assert.deepEqual(t.saved(), recordOf(2, LIST));
  const logged = warn.mock.calls.map((call) => call.arguments.join(' ')).join('\n');
  assert.match(logged, /400/);
  assert.doesNotMatch(logged, /Apple|G1|NASDAQ|g1/);
});

test('requestPull asks the cloud at most once a minute', async () => {
  const t = setup({ local: LIST, cloud: LIST, cloudVersion: 2, record: recordOf(2, LIST) });
  await t.engine.requestPull();
  await t.engine.requestPull();
  t.timers.advance(59_000);
  await t.engine.requestPull();
  assert.deepEqual(t.server.methods(), ['GET']);
  t.timers.advance(1000);
  await t.engine.requestPull();
  assert.deepEqual(t.server.methods(), ['GET', 'GET']);
});

test('schedulePush waits 3 seconds after the last change, then PUTs without a GET', async () => {
  const t = setup({ local: LIST, cloud: LIST, cloudVersion: 2, record: recordOf(2, LIST) });
  const mine = doc(group('g1', [AAPL]), group('g2', [BTC]));
  t.edit(mine);
  t.engine.schedulePush();
  t.timers.advance(2000);
  t.engine.schedulePush();
  t.timers.advance(2000);
  await t.engine.whenIdle();
  assert.deepEqual(t.server.calls, []);
  t.timers.advance(1000);
  await t.engine.whenIdle();
  assert.deepEqual(t.server.methods(), ['PUT']);
  assert.equal(t.server.puts()[0].body.baseVersion, 2);
  assert.deepEqual(t.saved(), recordOf(3, mine));
});

test('a push answered with 409 falls back to a full sync and merges', async () => {
  const theirs = doc(group('g1', [AAPL, TSMC]), group('g2', [BTC, NVDA]));
  const t = setup({ local: LIST, cloud: theirs, cloudVersion: 3, record: recordOf(2, LIST) });
  t.edit(doc(group('g1', [AAPL]), group('g2', [BTC])));
  t.engine.schedulePush();
  t.timers.advance(3000);
  await t.engine.whenIdle();
  const both = doc(group('g1', [AAPL]), group('g2', [BTC, NVDA]));
  assert.deepEqual(t.server.puts().map((call) => call.body.baseVersion), [2, 3]);
  assert.ok(docsEqual(t.server.data, both));
  assert.ok(docsEqual(t.localDoc(), both));
});

test('choose local reads the cloud again and overwrites it, retrying a 409 with the new version', async () => {
  const choice = { local: { groups: 2, symbols: 3 }, cloud: { groups: 1, symbols: 1 }, cloudUpdatedAt: UPDATED_AT };
  const t = setup({ local: LIST, cloud: OTHER, cloudVersion: 3, extra: { syncChoice: choice } });
  t.server.beforePut = () => {
    t.server.version = 4;
  };
  assert.equal(await t.engine.choose('local'), true);
  assert.deepEqual(t.server.methods(), ['GET', 'PUT', 'PUT']);
  assert.deepEqual(t.server.puts().map((call) => call.body.baseVersion), [3, 4]);
  assert.ok(docsEqual(t.server.data, LIST));
  assert.ok(docsEqual(t.localDoc(), LIST));
  assert.equal(t.storage.local.data.syncChoice, undefined);
  assert.deepEqual(t.saved(), recordOf(5, LIST));
  assert.equal(t.state(), 'ok');
});

test('choose cloud replaces the local list inside the lock and sends nothing', async () => {
  const t = setup({ local: LIST, cloud: OTHER, cloudVersion: 3, extra: { syncChoice: { local: {}, cloud: {} } } });
  assert.equal(await t.engine.choose('cloud'), true);
  assert.deepEqual(t.server.methods(), ['GET']);
  assert.ok(docsEqual(t.localDoc(), OTHER));
  assert.equal(t.storage.sync.data['group:g1'], undefined);
  assert.equal(t.storage.local.data.syncChoice, undefined);
  assert.deepEqual(t.saved(), recordOf(3, OTHER));
});

test('flush pushes a waiting edit at once and cancels its timer', async () => {
  const t = setup({ local: LIST, cloud: LIST, cloudVersion: 2, record: recordOf(2, LIST) });
  const mine = doc(group('g2', [BTC]));
  t.edit(mine);
  t.engine.schedulePush();
  await t.engine.flush();
  assert.deepEqual(t.server.methods(), ['PUT']);
  assert.ok(docsEqual(t.server.data, mine));
  assert.equal(t.timers.count(), 0);
  t.timers.advance(3000);
  await t.engine.whenIdle();
  assert.equal(t.server.calls.length, 1);
});
