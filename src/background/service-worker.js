/**
 * WhatsApp Scheduler - Background Service Worker (MV3)
 *
 * Configures Side Panel behavior, handles periodic alarms,
 * monitors tab status, and updates badge counters for due messages.
 */

import { checkAndTransitionDueMessages, getMessages } from '../core/storage.js';
import { MESSAGE_STATUS } from '../core/types.js';

const ALARM_NAME = 'wa_scheduler_check_due';

// 1. Configure Side Panel to open when action icon is clicked
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => {
    console.error('[WhatsApp Scheduler] Failed to set sidePanel behavior:', error);
  });

// 2. Setup periodic alarm for queue evaluation
function ensureAlarm() {
  chrome.alarms.get(ALARM_NAME, (alarm) => {
    if (!alarm) {
      chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
    }
  });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureAlarm();
  evaluateDueMessages();
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarm();
  evaluateDueMessages();
});

// Also ensure alarm immediately when worker script evaluates
ensureAlarm();
evaluateDueMessages();

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    evaluateDueMessages();
  }
});

// 3. Reactively check when WhatsApp Web tab is updated/focused
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.url && tab.url.includes('web.whatsapp.com') && changeInfo.status === 'complete') {
    evaluateDueMessages();
  }
});

/**
 * Checks for overdue messages and updates the extension badge.
 */
async function evaluateDueMessages() {
  try {
    await checkAndTransitionDueMessages();
    const dueMessages = await getMessages({ status: MESSAGE_STATUS.DUE });
    const count = dueMessages.length;

    if (count > 0) {
      await chrome.action.setBadgeText({ text: String(count) });
      await chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });
    } else {
      await chrome.action.setBadgeText({ text: '' });
    }
  } catch (err) {
    console.error('[WhatsApp Scheduler] Error in evaluateDueMessages:', err);
  }
}
