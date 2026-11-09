// Cloud sync of the list for signed-in users. The background page runs one engine.
// Every step goes through one queue, so two syncs never interleave. Every read-change-write of
// the list storage holds LIST_LOCK, which the side panel also takes when it saves.
// The record { accountId, version, base } is the cloud copy that the local list last agreed with:
// what differs from base is a local edit, and a newer cloud version holds edits made elsewhere.

import { deleteAccount as deleteAccountOnServer, loadAccount } from './account.js';
import { SERVER_URL } from './config.js';
import {
  countDoc,
  decideInitial,
  docFromItems,
  docsEqual,
  hasCommonBase,
  isEmptyDoc,
  itemsDiff,
  mergeDocs,
  normalizeDoc,
} from './merge.js';

export const LIST_LOCK = 'multilist-list';

const ACCOUNT_KEY = 'account';
const RECORD_KEY = 'cloudSync';
const STATUS_KEY = 'syncStatus';
const CHOICE_KEY = 'syncChoice';
const EXPIRED_KEY = 'signInExpired';
// Edits made close together go up in one request.
const PUSH_DELAY = 3000;
// Opening and showing the panel often must not cost a request each time.
const PULL_GAP = 60_000;
const REQUEST_TIMEOUT = 20_000;
// Each 409 means another browser wrote in between. After this many, the next trigger tries again.
const MAX_RETRIES = 3;

export function isListKey(key) {
  return key === 'groupOrder' || key === 'tabNames' || key === 'customTabs' || key.startsWith('group:');
}

// Writes only the keys that differ, so a change made elsewhere to another key stays.
export async function writeDiff(storage, before, after) {
  const { set, remove } = itemsDiff(before, after);
  if (Object.keys(set).length > 0) await storage.sync.set(set);
  if (remove.length > 0) await storage.sync.remove(remove);
}

class SessionExpired extends Error {}
class SyncFailed extends Error {}

export function createSync({
  storage = chrome.storage,
  fetchFn = fetch,
  serverUrl = SERVER_URL,
  now = Date.now,
  locks = navigator.locks,
  setTimeout: startTimer = setTimeout,
  clearTimeout: stopTimer = clearTimeout,
} = {}) {
  let queue = Promise.resolve();
  let pushTimer = null;
  let lastPullAt = -Infinity;

  const enqueue = (step) => {
    const run = queue.then(step);
    queue = run.catch(() => {});
    return run;
  };
  const readLocal = async () => docFromItems(await storage.sync.get(null));
  const status = (state) => ({ [STATUS_KEY]: { state, at: now() } });
  const record = (account, version, base) => ({
    [RECORD_KEY]: { accountId: account.accountId, version, base: normalizeDoc(base) },
  });

  // Called only after the local list holds what the record describes. A base saved before a
  // failed write would make the old local list look like a new edit and push it over the cloud.
  async function finish(account, version, base) {
    await storage.local.set({ ...record(account, version, base), ...status('ok') });
    await storage.local.remove(CHOICE_KEY);
  }

  async function request(method, account, payload) {
    const controller = new AbortController();
    const timer = startTimer(() => controller.abort(), REQUEST_TIMEOUT);
    try {
      const headers = { Authorization: `Bearer ${account.token}` };
      if (payload) headers['Content-Type'] = 'application/json';
      let response;
      try {
        response = await fetchFn(`${serverUrl}/v1/sync`, {
          method,
          headers,
          body: payload && JSON.stringify(payload),
          signal: controller.signal,
        });
      } catch {
        throw new SyncFailed(`${method} did not reach the server`);
      }
      if (response.status === 401) throw new SessionExpired();
      return { code: response.status, body: await response.json().catch(() => null) };
    } finally {
      stopTimer(timer);
    }
  }

  async function getCloud(account) {
    lastPullAt = now();
    const { code, body } = await request('GET', account);
    if (code !== 200 || !Number.isSafeInteger(body?.version)) throw new SyncFailed(`GET answered ${code}`);
    return body;
  }

  // Returns { version } when the cloud took the list, or { conflict } with the newer cloud copy.
  // Only the four list keys go up, the same shape the server checks.
  async function putCloud(account, baseVersion, doc) {
    const { code, body } = await request('PUT', account, { baseVersion, data: normalizeDoc(doc) });
    if (code === 200 && Number.isSafeInteger(body?.version)) return { version: body.version };
    if (code === 409 && Number.isSafeInteger(body?.version)) return { conflict: body };
    // A 400 means the server refuses this list, so sending it again would fail the same way.
    throw new SyncFailed(`PUT answered ${code}`);
  }

  // The list read before the lock can be old by now, so the merge uses the one read inside it.
  // Returns the list as stored.
  function mergeIntoLocal(base, cloudData) {
    return locks.request(LIST_LOCK, async () => {
      const local = await readLocal();
      const merged = mergeDocs(base, local, cloudData);
      if (!docsEqual(merged, local)) await writeDiff(storage, local, merged);
      return merged;
    });
  }

  // Returns null after the download, or the local list if something was saved meanwhile.
  function downloadIfEmpty(cloudData) {
    return locks.request(LIST_LOCK, async () => {
      const local = await readLocal();
      if (!isEmptyDoc(local)) return local;
      await writeDiff(storage, local, cloudData);
      return null;
    });
  }

  function replaceLocal(cloudData) {
    return locks.request(LIST_LOCK, async () => writeDiff(storage, await readLocal(), cloudData));
  }

  // A first sign-in, another account, or a cloud copy that was rebuilt: there is no base to merge with.
  async function firstSync(account, cloud) {
    let local = await readLocal();
    let decision = decideInitial({ local, cloud: cloud.data });
    if (decision === 'download') {
      local = await downloadIfEmpty(cloud.data);
      decision = local ? decideInitial({ local, cloud: cloud.data }) : 'adopt';
    }
    if (decision === 'upload') {
      const answer = await putCloud(account, cloud.version, local);
      if (answer.conflict) return answer.conflict;
      await finish(account, answer.version, local);
    } else if (decision === 'adopt') {
      await finish(account, cloud.version, cloud.data);
    } else {
      // Two different lists: only the user can say which one to keep. Nothing moves until then.
      await storage.local.set({
        [CHOICE_KEY]: { local: countDoc(local), cloud: countDoc(cloud.data), cloudUpdatedAt: cloud.updatedAt },
        ...status('choice'),
      });
    }
    return null;
  }

  // One pass against a known cloud copy. Returns the newer cloud copy after a 409, or null when done.
  async function reconcile(account, cloud) {
    const saved = (await storage.local.get(RECORD_KEY))[RECORD_KEY];
    if (!hasCommonBase({ record: saved, accountId: account.accountId, cloudVersion: cloud.version })) {
      return firstSync(account, cloud);
    }
    let { version, base } = saved;
    let mine;
    if (cloud.version > version) {
      mine = await mergeIntoLocal(base, cloud.data);
      // The local list now holds the cloud copy plus the local edits, so the cloud copy is the new base.
      ({ version } = cloud);
      base = cloud.data;
      await storage.local.set(record(account, version, base));
    } else {
      mine = await readLocal();
    }
    if (docsEqual(mine, base)) {
      await finish(account, version, base);
      return null;
    }
    const answer = await putCloud(account, version, mine);
    if (answer.conflict) return answer.conflict;
    await finish(account, answer.version, mine);
    return null;
  }

  async function runSync(account, cloud = null) {
    let next = cloud ?? (await getCloud(account));
    for (let retry = 0; next; retry += 1) {
      if (retry > MAX_RETRIES) throw new SyncFailed('too many conflicts');
      next = await reconcile(account, next);
    }
  }

  // With a valid record, a local edit goes straight up, without a GET first.
  async function push(account) {
    const { [RECORD_KEY]: saved, [CHOICE_KEY]: choice } = await storage.local.get([RECORD_KEY, CHOICE_KEY]);
    if (choice) return;
    if (!saved || saved.accountId !== account.accountId) {
      await runSync(account);
      return;
    }
    const local = await readLocal();
    if (docsEqual(local, saved.base)) return;
    const answer = await putCloud(account, saved.version, local);
    if (answer.conflict) {
      await runSync(account, answer.conflict);
      return;
    }
    await finish(account, answer.version, local);
  }

  // The user's answer to syncChoice. The cloud is read again, because the counts shown can be old.
  async function applyChoice(account, choice) {
    let cloud = await getCloud(account);
    for (let retry = 0; ; retry += 1) {
      if (retry > MAX_RETRIES) throw new SyncFailed('too many conflicts');
      // A cloud copy that became empty has nothing to keep, so the local list goes up instead.
      if (choice === 'cloud' && !isEmptyDoc(cloud.data)) {
        await replaceLocal(cloud.data);
        await finish(account, cloud.version, cloud.data);
        return;
      }
      const local = await readLocal();
      const answer = await putCloud(account, cloud.version, local);
      if (!answer.conflict) {
        await finish(account, answer.version, local);
        return;
      }
      cloud = answer.conflict;
    }
  }

  // The list and the record stay, so signing in again with the same account merges with no question.
  async function expire(account) {
    // A sign-out during the request is not an expired session.
    if ((await loadAccount(storage))?.token !== account.token) return;
    await storage.local.set({ [EXPIRED_KEY]: true });
    await storage.local.remove(ACCOUNT_KEY);
  }

  // Runs a step for the signed-in account. Returns true when it finished.
  async function task(step) {
    const account = await loadAccount(storage);
    if (!account || !serverUrl) return false;
    try {
      await step(account);
      return true;
    } catch (error) {
      if (error instanceof SessionExpired) {
        await expire(account);
      } else {
        // The reason only, never the list.
        console.warn(`cloud sync failed: ${error.message}`);
        await storage.local.set(status('error'));
      }
      return false;
    }
  }

  function syncNow() {
    return enqueue(() => task((account) => runSync(account)));
  }

  function schedulePush() {
    if (pushTimer !== null) stopTimer(pushTimer);
    pushTimer = startTimer(() => {
      pushTimer = null;
      enqueue(() => task(push)).catch((error) => console.error(error));
    }, PUSH_DELAY);
  }

  function requestPull() {
    if (now() - lastPullAt < PULL_GAP) return Promise.resolve(false);
    lastPullAt = now();
    return syncNow();
  }

  function choose(choice) {
    return enqueue(() => task((account) => applyChoice(account, choice)));
  }

  // The waiting push is dropped, and the delete runs in the queue, so no sync step writes cloudSync
  // or pushes to the deleted account afterwards: the steps behind it find no account.
  function deleteAccount() {
    if (pushTimer !== null) {
      stopTimer(pushTimer);
      pushTimer = null;
    }
    return enqueue(() => deleteAccountOnServer({ storage, fetchFn, serverUrl }));
  }

  async function whenIdle() {
    let last;
    do {
      last = queue;
      await last;
    } while (last !== queue);
  }

  // Before a sign-out: the edit that waits for its timer goes up now.
  async function flush() {
    if (pushTimer !== null) {
      stopTimer(pushTimer);
      pushTimer = null;
    }
    await enqueue(() => task(push));
    await whenIdle();
  }

  return { syncNow, schedulePush, requestPull, choose, flush, deleteAccount, whenIdle };
}
