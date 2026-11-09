// The background page records each list change and uploads the batch about once a week,
// but only after the user agrees. Only ids are kept; no group names or other user text.
// The background page is the only writer of the change log, so several side panels cannot
// overwrite each other.

import { SERVER_URL } from './config.js';
import { GROUP_ID_PATTERN, SYMBOL_ID_PATTERN, snapshotOf } from './changes.js';
import { hasConsent } from './sharing.js';
import { loadGroups } from './store.js';

const CONSENT_KEY = 'consent';
const ANALYTICS_ID_KEY = 'analyticsId';
const ANALYTICS_SALT_KEY = 'analyticsSalt';
const CHANGE_LOG_KEY = 'changeLog';
const TRUNCATED_KEY = 'changeLogTruncated';
const PENDING_KEY = 'pendingUpload';
const LAST_UPLOAD_KEY = 'lastUploadAt';
const TIMEOUT_MS = 20000;
export const MAX_EVENTS = 5000;
// The server takes a body of up to 512 KB. This leaves some room.
export const MAX_BODY_BYTES = 500 * 1024;
export const UPLOAD_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

// Every read-modify-write of the change log and the pending upload goes through this chain.
let queue = Promise.resolve();
function enqueue(task) {
  const run = queue.then(task);
  queue = run.catch(() => {});
  return run;
}

function validEvent(event) {
  return (
    Number.isInteger(event?.t) &&
    (event.op === 'add' || event.op === 'remove') &&
    typeof event.groupId === 'string' && GROUP_ID_PATTERN.test(event.groupId) &&
    typeof event.symbolId === 'string' && SYMBOL_ID_PATTERN.test(event.symbolId)
  );
}

// Adds events to the log. Without consent they are dropped, so nothing builds up on this computer.
// Past the limit the oldest events go and the batch is marked as truncated.
export function recordChanges(events, { storage = chrome.storage } = {}) {
  return enqueue(async () => {
    if (!Array.isArray(events) || !(await hasConsent(storage))) return;
    const fresh = events.filter(validEvent).map(({ t, op, groupId, symbolId }) => ({ t, op, groupId, symbolId }));
    if (fresh.length === 0) return;
    const data = await storage.local.get(CHANGE_LOG_KEY);
    const log = [...(data[CHANGE_LOG_KEY] ?? []), ...fresh];
    const items = { [CHANGE_LOG_KEY]: log.slice(-MAX_EVENTS) };
    if (log.length > MAX_EVENTS) items[TRUNCATED_KEY] = true;
    await storage.local.set(items);
  });
}

// When the user takes back consent, the records not yet sent are deleted from this computer.
// What the server already has stays there. The analytics id and salt stay too.
export function clearUploadData({ storage = chrome.storage } = {}) {
  return enqueue(() =>
    storage.local.remove([CHANGE_LOG_KEY, TRUNCATED_KEY, PENDING_KEY, LAST_UPLOAD_KEY]),
  );
}

// The analytics id and the salt are made together. Both stay in chrome.storage.sync; the salt
// is never uploaded, so the server cannot match hashed ids against the raw local ids.
async function ensureAnalyticsIdentity(storage) {
  const data = await storage.sync.get([ANALYTICS_ID_KEY, ANALYTICS_SALT_KEY]);
  if (data[ANALYTICS_ID_KEY] && data[ANALYTICS_SALT_KEY]) {
    return { analyticsId: data[ANALYTICS_ID_KEY], salt: data[ANALYTICS_SALT_KEY] };
  }
  const identity = {
    analyticsId: data[ANALYTICS_ID_KEY] ?? crypto.randomUUID(),
    salt: Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join(''),
  };
  await storage.sync.set({ [ANALYTICS_ID_KEY]: identity.analyticsId, [ANALYTICS_SALT_KEY]: identity.salt });
  return identity;
}

// The first 16 hex characters of SHA-256(salt + ':' + id).
async function hashId(salt, id) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${id}`));
  return Array.from(new Uint8Array(digest).subarray(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Group and tab ids leave this computer only as salted hashes. The change log keeps the raw ids.
async function hashIds(salt, events, snapshot) {
  const hash = async (id) => (id == null ? id : hashId(salt, id));
  return {
    events: await Promise.all(events.map(async (event) => ({ ...event, groupId: await hash(event.groupId) }))),
    snapshot: {
      groups: await Promise.all(
        snapshot.groups.map(async (group) => ({ ...group, id: await hash(group.id), tabId: await hash(group.tabId) })),
      ),
    },
  };
}

// The server rejects bad data with 4xx. Sending the same data again cannot succeed,
// except after a timeout (408) or a rate limit (429).
function isPermanentFailure(status) {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

// A body that is too big would be rejected as a whole, so the oldest events go first until
// it fits, and the batch is marked as truncated.
export function fitBody(body) {
  const size = () => new TextEncoder().encode(JSON.stringify(body)).length;
  while (body.events.length > 0 && size() > MAX_BODY_BYTES) {
    body.events = body.events.slice(Math.ceil(body.events.length / 10));
    body.truncated = true;
  }
  return body;
}

// Returns the upload to send, or null if none is due. A saved upload is sent again as it was,
// with the same uploadId. Otherwise the log moves into a new pending upload, in one step,
// so events added while the request runs stay in the log.
function preparePending({ storage, now, version, load }) {
  return enqueue(async () => {
    const local = await storage.local.get([PENDING_KEY, LAST_UPLOAD_KEY, CHANGE_LOG_KEY, TRUNCATED_KEY]);
    if (local[PENDING_KEY]) return local[PENDING_KEY];
    const lastUploadAt = local[LAST_UPLOAD_KEY];
    const periodEnd = now();
    if (Number.isInteger(lastUploadAt) && periodEnd - lastUploadAt < UPLOAD_INTERVAL_MS) return null;

    const consent = (await storage.sync.get(CONSENT_KEY))[CONSENT_KEY];
    const { analyticsId, salt } = await ensureAnalyticsIdentity(storage);
    const { events, snapshot } = await hashIds(salt, local[CHANGE_LOG_KEY] ?? [], snapshotOf(await load()));
    const pending = {
      uploadId: crypto.randomUUID(),
      body: {
        schemaVersion: 1,
        uploadId: null,
        analyticsId,
        extVersion: version ?? chrome.runtime.getManifest().version,
        periodStart: Math.min(lastUploadAt ?? consent?.at ?? periodEnd, periodEnd),
        periodEnd,
        truncated: local[TRUNCATED_KEY] === true,
        events,
        snapshot,
      },
    };
    pending.body.uploadId = pending.uploadId;
    fitBody(pending.body);
    await storage.local.set({ [PENDING_KEY]: pending, [CHANGE_LOG_KEY]: [] });
    await storage.local.remove(TRUNCATED_KEY);
    return pending;
  });
}

// Records the outcome, unless consent was taken back while the request ran.
function finishUpload({ storage, now }) {
  return enqueue(async () => {
    if (!(await hasConsent(storage))) return;
    await storage.local.remove(PENDING_KEY);
    await storage.local.set({ [LAST_UPLOAD_KEY]: now() });
  });
}

let uploading = null;

// Returns what happened: 'disabled', 'no-consent', 'not-due', 'uploaded', 'rejected' or 'retry'.
// 'retry' keeps the pending upload; the next trigger sends it again.
// Only one upload runs at a time.
export function maybeUpload({
  storage = chrome.storage,
  fetchImpl = fetch,
  serverUrl = SERVER_URL,
  now = Date.now,
  version,
  loadGroups: load = loadGroups,
} = {}) {
  uploading ??= upload({ storage, fetchImpl, serverUrl, now, version, load }).finally(() => {
    uploading = null;
  });
  return uploading;
}

async function upload({ storage, fetchImpl, serverUrl, now, version, load }) {
  if (!serverUrl) return 'disabled';
  if (!(await hasConsent(storage))) return 'no-consent';
  const pending = await preparePending({ storage, now, version, load });
  if (!pending) return 'not-due';

  let response;
  try {
    response = await fetchImpl(`${serverUrl}/v1/uploads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pending.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return 'retry';
  }
  if (response.ok || isPermanentFailure(response.status)) {
    await finishUpload({ storage, now });
    return response.ok ? 'uploaded' : 'rejected';
  }
  return 'retry';
}
