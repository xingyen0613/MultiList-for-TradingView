import { ensureFirstSeen } from './lib/sharing.js';
import { clearUploadData, maybeUpload, recordChanges } from './lib/upload.js';

const UPLOAD_ALARM = 'multilist-upload';

// Clicking the toolbar icon opens the side panel.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

const upload = () => maybeUpload().catch((error) => console.error(error));

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
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === UPLOAD_ALARM) upload();
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
  if (message?.type === 'panelOpened') upload();
  return false;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  // The first snapshot goes out as soon as the user agrees.
  if (changes.consent?.newValue?.granted === true) upload();
  // Taking back consent deletes the records on this computer that were not sent yet.
  if (changes.consent?.newValue?.granted === false) clearUploadData().catch((error) => console.error(error));
});
