// Sharing sends anonymous data to the MultiList server, but only after the user agrees.
// The consent and the first use date live in chrome.storage.sync, so they follow the Chrome
// account to other computers.

// Raise this when what is shared changes, so everyone is asked again.
export const CONSENT_VERSION = 1;

const CONSENT_KEY = 'consent';
const FIRST_SEEN_KEY = 'firstSeenAt';

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

// Remembers the first use date, once, on every install whether or not the user shares data.
// It is never uploaded here, and an existing value is never overwritten.
export async function ensureFirstSeen(storage = chrome.storage, now = Date.now) {
  const data = await storage.sync.get(FIRST_SEEN_KEY);
  if (Number.isInteger(data[FIRST_SEEN_KEY])) return data[FIRST_SEEN_KEY];
  const firstSeenAt = now();
  await storage.sync.set({ [FIRST_SEEN_KEY]: firstSeenAt });
  return firstSeenAt;
}
