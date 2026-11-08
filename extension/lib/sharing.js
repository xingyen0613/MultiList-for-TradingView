// Sharing sends anonymous data to the MultiList server, but only after the user agrees.
// Install registration sends a random install id and the first install date, once.
// The ids live in chrome.storage.sync, so they follow the Chrome account to other computers.

import { SERVER_URL } from './config.js';

// Raise this when what is shared changes, so everyone is asked again.
export const CONSENT_VERSION = 1;

const CONSENT_KEY = 'consent';
const INSTALL_ID_KEY = 'installId';
const FIRST_SEEN_KEY = 'firstSeenAt';
const INSTALL_REGISTERED_KEY = 'installRegisteredAt';
const TIMEOUT_MS = 20000;

export async function hasConsent(storage = chrome.storage) {
  const data = await storage.sync.get(CONSENT_KEY);
  return data[CONSENT_KEY]?.granted === true;
}

export async function setConsent(granted, storage = chrome.storage, now = Date.now) {
  await storage.sync.set({ [CONSENT_KEY]: { v: CONSENT_VERSION, granted, at: now() } });
}

// True when the user has not decided yet, or decided on an older version of the text.
export async function needsConsentDecision(storage = chrome.storage) {
  const data = await storage.sync.get(CONSENT_KEY);
  const consent = data[CONSENT_KEY];
  return !consent || !(consent.v >= CONSENT_VERSION);
}

// Makes the install id on first use. It is made only after consent, so a user who never
// agrees has no id at all.
export async function ensureInstallIdentity(storage, now) {
  const data = await storage.sync.get([INSTALL_ID_KEY, FIRST_SEEN_KEY]);
  if (data[INSTALL_ID_KEY] && Number.isInteger(data[FIRST_SEEN_KEY])) {
    return { installId: data[INSTALL_ID_KEY], firstSeenAt: data[FIRST_SEEN_KEY] };
  }
  const identity = { installId: crypto.randomUUID(), firstSeenAt: now() };
  await storage.sync.set({ [INSTALL_ID_KEY]: identity.installId, [FIRST_SEEN_KEY]: identity.firstSeenAt });
  return identity;
}

// The server rejects bad data with 4xx. Sending the same data again cannot succeed,
// except after a timeout (408) or a rate limit (429).
export function isPermanentFailure(status) {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

// Returns what happened: 'disabled', 'no-consent', 'done', 'registered', 'rejected' or 'retry'.
// 'retry' means a network error, a CORS block or a server error; the next trigger tries again.
export async function registerInstall({
  storage = chrome.storage,
  fetchImpl = fetch,
  serverUrl = SERVER_URL,
  now = Date.now,
  version,
} = {}) {
  if (!serverUrl) return 'disabled';
  if (!(await hasConsent(storage))) return 'no-consent';
  const local = await storage.local.get(INSTALL_REGISTERED_KEY);
  if (local[INSTALL_REGISTERED_KEY]) return 'done';

  const identity = await ensureInstallIdentity(storage, now);
  const body = {
    schemaVersion: 1,
    installId: identity.installId,
    firstSeenAt: identity.firstSeenAt,
    extVersion: version ?? chrome.runtime.getManifest().version,
  };
  let response;
  try {
    response = await fetchImpl(`${serverUrl}/v1/installs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return 'retry';
  }
  if (response.ok || isPermanentFailure(response.status)) {
    await storage.local.set({ [INSTALL_REGISTERED_KEY]: now() });
    return response.ok ? 'registered' : 'rejected';
  }
  return 'retry';
}
