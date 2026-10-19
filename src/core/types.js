/**
 * WhatsApp Client Message Scheduler - Type Definitions & Constants
 *
 * Strictly adheres to the spec:
 * - Timezone: Asia/Jerusalem
 * - Work days: Sunday (0) to Thursday (4)
 * - Preferred delivery time: 08:00
 */

export const TIMEZONE = 'Asia/Jerusalem';
export const BUSINESS_DAYS = [0, 1, 2, 3, 4]; // Sunday = 0, ..., Thursday = 4
export const DEFAULT_DELIVERY_HOUR = 8;
export const DEFAULT_DELIVERY_MINUTE = 0;

export const STORAGE_KEYS = {
  MESSAGES: 'wa_scheduler_messages',
  DRAFT: 'wa_scheduler_draft',
  SETTINGS: 'wa_scheduler_settings',
  CONTACTS: 'wa_scheduler_contacts',
  SCHEMA_VERSION: 'wa_scheduler_schema_version'
};

export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Message Status Enum
 * @readonly
 * @enum {string}
 */
export const MESSAGE_STATUS = {
  DRAFT: 'draft',
  SCHEDULED: 'scheduled',
  DUE: 'due',
  READY_FOR_REVIEW: 'ready_for_review',
  SENT: 'sent',
  CANCELLED: 'cancelled',
  FAILED: 'failed'
};

/**
 * Scheduling Options Enum
 * @readonly
 * @enum {string}
 */
export const SCHEDULE_OPTION = {
  NEXT_BUSINESS_MORNING: 'next_business_morning',
  CUSTOM: 'custom'
};

export const ATTACHMENT_CONFIG = {
  MAX_FILE_SIZE_BYTES: 15 * 1024 * 1024, // 15MB total / single file
  MAX_TOTAL_SIZE_BYTES: 25 * 1024 * 1024 // 25MB total payload
};

export const DEFAULT_SETTINGS = {
  autoSendDefault: false,
  timezone: TIMEZONE
};
