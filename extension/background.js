import { ensureFirstSeen } from './lib/sharing.js';
import { createSync, isListKey } from './lib/sync.js';
import { clearUploadData, maybeUpload, recordChanges } from './lib/upload.js';

const UPLOAD_ALARM = 'multilist-upload';

// Clicking the toolbar icon opens the side panel.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

const upload = () => maybeUpload().catch((error) => console.error(error));

// Cloud sync of the list. It does nothing while no one is signed in.
const sync = createSync();
const syncNow = () => sync.syncNow().catch((error) => console.error(error));
const pull = () => sync.requestPull().catch((error) => console.error(error));

// The alarm only wakes this page now and then; maybeUpload decides if a week has passed.
async function ensureAlarm() {
  if (!(await chrome.alarms.get(UPLOAD_ALARM))) {
    chrome.alarms.create(UPLOAD_ALARM, { periodInMinutes: 240 });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  ensureAlarm();
  ensureFirstSeen().catch((error) => console.error(error));
});
chrome.runtime.onStartup.addListener(() => {
  ensureAlarm();
  upload();
  syncNow();
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== UPLOAD_ALARM) return;
  upload();
  syncNow();
});

// The side panels send list changes here; this page is the only writer of the change log.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (message?.type === 'changes') {
    recordChanges(message.events)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        console.error(error);
        sendResponse({ ok: false });
      });
    return true;
  }
  // Only these two answers exist; anything else must not overwrite either list.
  if (message?.type === 'syncChoice' && (message.choice === 'local' || message.choice === 'cloud')) {
    sync.choose(message.choice).then(
      (ok) => sendResponse({ ok }),
      () => sendResponse({ ok: false }),
    );
    return true;
  }
  if (message?.type === 'flushSync') {
    sync.flush().then(
      () => sendResponse({ ok: true }),
      () => sendResponse({ ok: false }),
    );
    return true;
  }
  if (message?.type === 'panelOpened') {
    upload();
    pull();
  }
  if (message?.type === 'panelVisible') pull();
  return false;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  // The first snapshot goes out as soon as the user agrees.
  if (changes.consent?.newValue?.granted === true) upload();
  // Taking back consent deletes the records on this computer that were not sent yet.
  if (changes.consent?.newValue?.granted === false) clearUploadData().catch((error) => console.error(error));
});

// A list change from a side panel, another window or Chrome sync goes to the cloud a little later.
// A new sign-in syncs at once.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && Object.keys(changes).some(isListKey)) sync.schedulePush();
  if (area === 'local' && changes.account?.newValue && !changes.account.oldValue) syncNow();
});
