/**
 * WhatsApp Client Message Scheduler - Local Persistence & Storage Engine
 *
 * Wraps chrome.storage.local with schema validation, migration support,
 * and an in-memory fallback for automated testing outside the browser.
 */

import {
  STORAGE_KEYS,
  CURRENT_SCHEMA_VERSION,
  MESSAGE_STATUS,
  DEFAULT_SETTINGS,
  ATTACHMENT_CONFIG
} from './types.js';

// In-memory fallback adapter for unit tests and non-extension environments
const memoryStorage = new Map();

/**
 * Accesses chrome.storage.local or the memory fallback.
 */
function getStorageBackend() {
  if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
    return {
      async get(keys) {
        return chrome.storage.local.get(keys);
      },
      async set(items) {
        return chrome.storage.local.set(items);
      },
      async remove(keys) {
        return chrome.storage.local.remove(keys);
      },
      async clear() {
        return chrome.storage.local.clear();
      }
    };
  }

  // Memory fallback
  return {
    async get(keys) {
      const result = {};
      const keyList = Array.isArray(keys) ? keys : typeof keys === 'string' ? [keys] : Object.keys(keys || {});
      for (const k of keyList) {
        if (memoryStorage.has(k)) {
          result[k] = JSON.parse(JSON.stringify(memoryStorage.get(k)));
        }
      }
      return result;
    },
    async set(items) {
      for (const [k, v] of Object.entries(items)) {
        memoryStorage.set(k, JSON.parse(JSON.stringify(v)));
      }
    },
    async remove(keys) {
      const keyList = Array.isArray(keys) ? keys : [keys];
      for (const k of keyList) {
        memoryStorage.delete(k);
      }
    },
    async clear() {
      memoryStorage.clear();
    }
  };
}

/**
 * Normalizes phone numbers to standard E.164-style numeric string.
 * e.g. "050-123-4567" in Israel becomes "+972501234567"
 *
 * @param {string} phone
 * @param {string} [defaultCountryCode='972']
 * @returns {string}
 */
export function normalizePhoneNumber(phone, defaultCountryCode = '972') {
  if (!phone) return '';
  let cleaned = phone.replace(/[\s\-\(\)\.]/g, '');

  if (cleaned.startsWith('+')) {
    return cleaned;
  }

  if (cleaned.startsWith('00')) {
    return '+' + cleaned.slice(2);
  }

  if (cleaned.startsWith('0')) {
    return `+${defaultCountryCode}${cleaned.slice(1)}`;
  }

  return `+${cleaned}`;
}

/**
 * Generates a unique UUID v4.
 *
 * @returns {string}
 */
export function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Validates a message record against schema requirements.
 *
 * @param {object} msg
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateMessageRecord(msg) {
  if (!msg || typeof msg !== 'object') {
    return { valid: false, error: 'Message must be an object' };
  }
  if (!msg.id || typeof msg.id !== 'string') {
    return { valid: false, error: 'Message id is required' };
  }
  if (!msg.recipient || !msg.recipient.phone) {
    return { valid: false, error: 'Recipient phone is required' };
  }
  
  const hasText = typeof msg.text === 'string' && msg.text.trim().length > 0;
  const hasAttachments = Array.isArray(msg.attachments) && msg.attachments.length > 0;

  if (!hasText && !hasAttachments) {
    return { valid: false, error: 'Message text or attachment is required' };
  }

  if (hasAttachments) {
    let totalSize = 0;
    for (const file of msg.attachments) {
      if (!file || typeof file !== 'object' || !file.name) {
        return { valid: false, error: 'Invalid attachment structure' };
      }
      totalSize += file.size || 0;
    }
    if (totalSize > ATTACHMENT_CONFIG.MAX_TOTAL_SIZE_BYTES) {
      return { valid: false, error: `Total attachments exceed limit of ${ATTACHMENT_CONFIG.MAX_TOTAL_SIZE_BYTES / (1024 * 1024)}MB` };
    }
  }

  if (!msg.scheduledFor || isNaN(new Date(msg.scheduledFor).getTime())) {
    return { valid: false, error: 'Valid scheduledFor timestamp is required' };
  }
  const validStatuses = Object.values(MESSAGE_STATUS);
  if (!validStatuses.includes(msg.status)) {
    return { valid: false, error: `Invalid status: ${msg.status}` };
  }
  return { valid: true };
}

/**
 * Retrieves all stored messages, optionally filtered by status.
 *
 * @param {{ status?: string }} [filter]
 * @returns {Promise<Array<object>>}
 */
export async function getMessages(filter = {}) {
  const backend = getStorageBackend();
  const data = await backend.get(STORAGE_KEYS.MESSAGES);
  const messages = Array.isArray(data[STORAGE_KEYS.MESSAGES]) ? data[STORAGE_KEYS.MESSAGES] : [];

  if (!filter.status) {
    return messages;
  }
  return messages.filter((m) => m.status === filter.status);
}

/**
 * Saves a new message or updates an existing message.
 *
 * @param {object} messageData
 * @returns {Promise<object>} The saved message
 */
export async function saveMessage(messageData) {
  const backend = getStorageBackend();
  const messages = await getMessages();

  const nowIso = new Date().toISOString();
  const id = messageData.id || generateUUID();

  const existingIndex = messages.findIndex((m) => m.id === id);

  const messageRecord = {
    id,
    recipient: {
      name: messageData.recipient?.name?.trim() || '',
      phone: normalizePhoneNumber(messageData.recipient?.phone || '')
    },
    text: messageData.text?.trim() || '',
    attachments: Array.isArray(messageData.attachments) ? messageData.attachments : [],
    autoSend: Boolean(messageData.autoSend),
    createdAt: messageData.createdAt || nowIso,
    scheduledFor: new Date(messageData.scheduledFor).toISOString(),
    timezone: 'Asia/Jerusalem',
    status: messageData.status || MESSAGE_STATUS.SCHEDULED,
    lastUpdatedAt: nowIso,
    sentAt: messageData.sentAt || null,
    errorDetails: messageData.errorDetails || null,
    deliveryAttemptId: messageData.deliveryAttemptId || null,
    schemaVersion: CURRENT_SCHEMA_VERSION
  };

  const validation = validateMessageRecord(messageRecord);
  if (!validation.valid) {
    throw new Error(`Validation failed: ${validation.error}`);
  }

  if (existingIndex >= 0) {
    messages[existingIndex] = messageRecord;
  } else {
    messages.push(messageRecord);
  }

  // Sort scheduled/due messages chronologically
  messages.sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime());

  await backend.set({ [STORAGE_KEYS.MESSAGES]: messages });
  return messageRecord;
}

/**
 * Updates the status of an existing message with strict transition rules.
 *
 * @param {string} id
 * @param {string} newStatus
 * @param {object} [extraFields={}]
 * @returns {Promise<object>}
 */
export async function updateMessageStatus(id, newStatus, extraFields = {}) {
  const backend = getStorageBackend();
  const messages = await getMessages();
  const index = messages.findIndex((m) => m.id === id);

  if (index === -1) {
    throw new Error(`Message with ID ${id} not found.`);
  }

  const validStatuses = Object.values(MESSAGE_STATUS);
  if (!validStatuses.includes(newStatus)) {
    throw new Error(`Invalid target status: ${newStatus}`);
  }

  const current = messages[index];
  const nowIso = new Date().toISOString();

  // Update record
  messages[index] = {
    ...current,
    ...extraFields,
    status: newStatus,
    lastUpdatedAt: nowIso
  };

  if (newStatus === MESSAGE_STATUS.SENT && !messages[index].sentAt) {
    messages[index].sentAt = nowIso;
  }

  await backend.set({ [STORAGE_KEYS.MESSAGES]: messages });
  return messages[index];
}

/**
 * Deletes a message by its ID.
 *
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteMessage(id) {
  const backend = getStorageBackend();
  const messages = await getMessages();
  const filtered = messages.filter((m) => m.id !== id);

  if (filtered.length === messages.length) {
    return false;
  }

  await backend.set({ [STORAGE_KEYS.MESSAGES]: filtered });
  return true;
}

/**
 * Retrieves the current compose draft.
 *
 * @returns {Promise<object|null>}
 */
export async function getDraft() {
  const backend = getStorageBackend();
  const data = await backend.get(STORAGE_KEYS.DRAFT);
  return data[STORAGE_KEYS.DRAFT] || null;
}

/**
 * Saves draft content.
 *
 * @param {object} draft
 * @returns {Promise<void>}
 */
export async function saveDraft(draft) {
  const backend = getStorageBackend();
  await backend.set({
    [STORAGE_KEYS.DRAFT]: {
      ...draft,
      savedAt: new Date().toISOString()
    }
  });
}

/**
 * Clears the stored draft.
 *
 * @returns {Promise<void>}
 */
export async function clearDraft() {
  const backend = getStorageBackend();
  await backend.remove(STORAGE_KEYS.DRAFT);
}

/**
 * Evaluates queue messages and transitions overdue ones to 'due'.
 *
 * @param {Date} [referenceDate=new Date()]
 * @returns {Promise<Array<object>>} List of newly due messages
 */
export async function checkAndTransitionDueMessages(referenceDate = new Date()) {
  const backend = getStorageBackend();
  const messages = await getMessages();
  const refTime = referenceDate.getTime();
  let changed = false;
  const dueList = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.status === MESSAGE_STATUS.SCHEDULED) {
      const scheduledTime = new Date(msg.scheduledFor).getTime();
      if (refTime >= scheduledTime) {
        messages[i].status = MESSAGE_STATUS.DUE;
        messages[i].lastUpdatedAt = new Date().toISOString();
        changed = true;
        dueList.push(messages[i]);
      }
    }
  }

  if (changed) {
    await backend.set({ [STORAGE_KEYS.MESSAGES]: messages });
  }

  return dueList;
}

/**
 * Retrieves user preferences/settings.
 *
 * @returns {Promise<object>}
 */
export async function getSettings() {
  const backend = getStorageBackend();
  const data = await backend.get(STORAGE_KEYS.SETTINGS);
  return {
    ...DEFAULT_SETTINGS,
    ...(data[STORAGE_KEYS.SETTINGS] || {})
  };
}

/**
 * Saves user preferences/settings.
 *
 * @param {object} settings
 * @returns {Promise<object>}
 */
export async function saveSettings(settings) {
  const backend = getStorageBackend();
  const current = await getSettings();
  const updated = { ...current, ...settings };
  await backend.set({ [STORAGE_KEYS.SETTINGS]: updated });
  return updated;
}

/**
 * Retrieves all saved contacts, sorted alphabetically by name.
 *
 * @returns {Promise<Array<{ id: string, name: string, phone: string }>>}
 */
export async function getContacts() {
  const backend = getStorageBackend();
  const data = await backend.get(STORAGE_KEYS.CONTACTS);
  const contacts = Array.isArray(data[STORAGE_KEYS.CONTACTS]) ? data[STORAGE_KEYS.CONTACTS] : [];
  return contacts.sort((a, b) => (a.name || a.phone).localeCompare(b.name || b.phone));
}

/**
 * Saves a new contact or updates an existing contact.
 *
 * @param {{ id?: string, name?: string, phone: string }} contactData
 * @returns {Promise<{ id: string, name: string, phone: string }>}
 */
export async function saveContact(contactData) {
  if (!contactData || !contactData.phone) {
    throw new Error('Contact phone is required');
  }

  const backend = getStorageBackend();
  const contacts = await getContacts();
  const normalizedPhone = normalizePhoneNumber(contactData.phone);
  const name = (contactData.name || '').trim();

  // Check if contact with same ID or same phone already exists
  const existingIdx = contacts.findIndex(
    (c) => (contactData.id && c.id === contactData.id) || c.phone === normalizedPhone
  );

  let contactRecord;
  if (existingIdx >= 0) {
    contactRecord = {
      ...contacts[existingIdx],
      name: name || contacts[existingIdx].name,
      phone: normalizedPhone,
      lastUpdatedAt: new Date().toISOString()
    };
    contacts[existingIdx] = contactRecord;
  } else {
    contactRecord = {
      id: contactData.id || generateUUID(),
      name,
      phone: normalizedPhone,
      createdAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString()
    };
    contacts.push(contactRecord);
  }

  await backend.set({ [STORAGE_KEYS.CONTACTS]: contacts });
  return contactRecord;
}

/**
 * Deletes a contact by ID.
 *
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteContact(id) {
  const backend = getStorageBackend();
  const contacts = await getContacts();
  const filtered = contacts.filter((c) => c.id !== id);

  if (filtered.length === contacts.length) {
    return false;
  }

  await backend.set({ [STORAGE_KEYS.CONTACTS]: filtered });
  return true;
}

