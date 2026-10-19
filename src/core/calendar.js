/**
 * WhatsApp Client Message Scheduler - Business Calendar & Timezone Logic
 *
 * Implements scheduling rules for Asia/Jerusalem:
 * - Working business days: Sunday (0) through Thursday (4)
 * - Preferred delivery time: 08:00
 * - Non-business days: Friday (5), Saturday (6) roll forward to Sunday 08:00
 * - Handles Daylight Saving Time (DST) shifts
 *
 * Note: Initial version covers weekdays only, not Israeli public holidays
 * (per spec section 3).
 */

import { TIMEZONE, DEFAULT_DELIVERY_HOUR, DEFAULT_DELIVERY_MINUTE } from './types.js';

const JERUSALEM_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  weekday: 'short',
  hour12: false
});

const WEEKDAY_MAP = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

/**
 * Extracts date components in Asia/Jerusalem timezone.
 *
 * @param {Date|string|number} date
 * @returns {{ year: number, month: number, day: number, hour: number, minute: number, second: number, dayOfWeek: number }}
 */
export function getJerusalemParts(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) {
    throw new TypeError(`Invalid date: ${date}`);
  }

  const parts = JERUSALEM_FORMATTER.formatToParts(d);
  const map = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }

  return {
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10), // 1-12
    day: parseInt(map.day, 10),
    hour: map.hour === '24' ? 0 : parseInt(map.hour, 10),
    minute: parseInt(map.minute, 10),
    second: parseInt(map.second, 10),
    dayOfWeek: WEEKDAY_MAP[map.weekday]
  };
}

/**
 * Creates a UTC Date corresponding to a specific wall-clock time in Asia/Jerusalem.
 * Correctly accounts for DST changes (UTC+2 in winter, UTC+3 in summer).
 *
 * @param {number} year
 * @param {number} month - 1-indexed (1 = January, 12 = December)
 * @param {number} day - 1-indexed
 * @param {number} [hour=8] - 0-23
 * @param {number} [minute=0] - 0-59
 * @param {number} [second=0] - 0-59
 * @returns {Date}
 */
export function createJerusalemDate(year, month, day, hour = DEFAULT_DELIVERY_HOUR, minute = DEFAULT_DELIVERY_MINUTE, second = 0) {
  // Approximate candidate using UTC
  const candidate = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const currentParts = getJerusalemParts(candidate);

  const targetUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const actualAsUtc = Date.UTC(
    currentParts.year,
    currentParts.month - 1,
    currentParts.day,
    currentParts.hour,
    currentParts.minute,
    currentParts.second
  );

  const diffMs = targetUtc - actualAsUtc;
  return new Date(candidate.getTime() + diffMs);
}

/**
 * Calculates the next business delivery slot (08:00 Asia/Jerusalem).
 *
 * Scheduling rules:
 * - A message created outside business hours defaults to the next business day at 08:00.
 * - Friday and Saturday messages default to Sunday at 08:00.
 * - A message created on a business day before 08:00 defaults to today's 08:00 slot.
 * - A message created at or after 08:00 on a business day defaults to the next business day at 08:00.
 * - If current time is exactly 08:00:00, defaults to the next business day to prevent race conditions.
 * - Never silently moves a message to an earlier scheduled time.
 *
 * @param {Date|string|number} [referenceDate=new Date()]
 * @returns {Date} UTC Date object pointing to 08:00 Jerusalem on target business day
 */
export function getNextBusinessSlot(referenceDate = new Date()) {
  const parts = getJerusalemParts(referenceDate);

  const isBusinessDay = parts.dayOfWeek >= 0 && parts.dayOfWeek <= 4; // Sunday=0 to Thursday=4
  const isBefore8am = parts.hour < DEFAULT_DELIVERY_HOUR;

  let daysToAdd = 0;
  if (isBusinessDay && isBefore8am) {
    // Deliver today at 08:00
    daysToAdd = 0;
  } else {
    // Determine days until the next business morning
    switch (parts.dayOfWeek) {
      case 0: // Sunday -> Monday
      case 1: // Monday -> Tuesday
      case 2: // Tuesday -> Wednesday
      case 3: // Wednesday -> Thursday
        daysToAdd = 1;
        break;
      case 4: // Thursday -> Sunday (skips Friday & Saturday)
        daysToAdd = 3;
        break;
      case 5: // Friday -> Sunday
        daysToAdd = 2;
        break;
      case 6: // Saturday -> Sunday
        daysToAdd = 1;
        break;
    }
  }

  // Calculate target calendar day in UTC calendar arithmetic
  const targetCalendar = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + daysToAdd));
  const targetYear = targetCalendar.getUTCFullYear();
  const targetMonth = targetCalendar.getUTCMonth() + 1;
  const targetDay = targetCalendar.getUTCDate();

  return createJerusalemDate(targetYear, targetMonth, targetDay, DEFAULT_DELIVERY_HOUR, DEFAULT_DELIVERY_MINUTE, 0);
}

/**
 * Checks whether a scheduled message is due for delivery.
 *
 * @param {Date|string|number} scheduledFor
 * @param {Date|string|number} [referenceDate=new Date()]
 * @returns {boolean}
 */
export function isScheduledTimeDue(scheduledFor, referenceDate = new Date()) {
  const scheduledTime = new Date(scheduledFor).getTime();
  const refTime = new Date(referenceDate).getTime();
  return refTime >= scheduledTime;
}

/**
 * Validates a custom delivery datetime.
 * A custom datetime must be in the future relative to referenceDate.
 *
 * @param {Date|string|number} customDate
 * @param {Date|string|number} [referenceDate=new Date()]
 * @returns {{ valid: boolean, error?: string }}
 */
export function isValidCustomSchedule(customDate, referenceDate = new Date()) {
  const target = new Date(customDate);
  if (isNaN(target.getTime())) {
    return { valid: false, error: 'Invalid custom date format.' };
  }

  const ref = new Date(referenceDate);
  if (target.getTime() <= ref.getTime()) {
    return { valid: false, error: 'Scheduled time must be in the future.' };
  }

  return { valid: true };
}

/**
 * Formats a Date in Asia/Jerusalem for human display.
 * e.g. "Sunday, Oct 19, 2026 at 08:00 (Asia/Jerusalem)"
 *
 * @param {Date|string|number} date
 * @returns {string}
 */
export function formatJerusalemDateTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  const weekdayName = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, weekday: 'long' }).format(d);
  const dateStr = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(d);
  const timeStr = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(d);

  return `${weekdayName}, ${dateStr} at ${timeStr} (${TIMEZONE})`;
}
