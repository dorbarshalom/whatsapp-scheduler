import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getJerusalemParts,
  createJerusalemDate,
  getNextBusinessSlot,
  isScheduledTimeDue,
  isValidCustomSchedule,
  formatJerusalemDateTime
} from '../src/core/calendar.js';

test('Calendar: getJerusalemParts correctly parses Jerusalem wall-clock components', () => {
  // A known UTC instant: 2026-01-15T06:00:00Z -> In Jerusalem (Winter, UTC+2) this is 08:00:00
  const d = new Date('2026-01-15T06:00:00.000Z');
  const parts = getJerusalemParts(d);

  assert.equal(parts.year, 2026);
  assert.equal(parts.month, 1);
  assert.equal(parts.day, 15);
  assert.equal(parts.hour, 8);
  assert.equal(parts.minute, 0);
  assert.equal(parts.second, 0);
  assert.equal(parts.dayOfWeek, 4); // Thursday
});

test('Calendar: createJerusalemDate handles winter (UTC+2) and summer (UTC+3) correctly', () => {
  // Winter test: Jan 15, 2026 at 08:00
  const winterDate = createJerusalemDate(2026, 1, 15, 8, 0, 0);
  assert.equal(winterDate.toISOString(), '2026-01-15T06:00:00.000Z');
  const winterParts = getJerusalemParts(winterDate);
  assert.equal(winterParts.hour, 8);
  assert.equal(winterParts.minute, 0);

  // Summer test: Jul 15, 2026 at 08:00
  const summerDate = createJerusalemDate(2026, 7, 15, 8, 0, 0);
  assert.equal(summerDate.toISOString(), '2026-07-15T05:00:00.000Z');
  const summerParts = getJerusalemParts(summerDate);
  assert.equal(summerParts.hour, 8);
  assert.equal(summerParts.minute, 0);
});

test('Calendar: Sunday before 08:00 defaults to today at 08:00 (e.g. 01:00 AM delivers in 7 hours)', () => {
  // Sunday Oct 18, 2026 at 01:00 AM
  const oneAm = createJerusalemDate(2026, 10, 18, 1, 0, 0);
  const slotOneAm = getNextBusinessSlot(oneAm);
  const pOneAm = getJerusalemParts(slotOneAm);

  assert.equal(pOneAm.year, 2026);
  assert.equal(pOneAm.month, 10);
  assert.equal(pOneAm.day, 18);
  assert.equal(pOneAm.dayOfWeek, 0); // Sunday
  assert.equal(pOneAm.hour, 8);
  assert.equal(pOneAm.minute, 0);

  // Exact difference must be 7 hours (7 * 3600 * 1000 ms)
  const diffHours = (slotOneAm.getTime() - oneAm.getTime()) / (1000 * 60 * 60);
  assert.equal(diffHours, 7);

  // Sunday Oct 18, 2026 at 07:30
  const now = createJerusalemDate(2026, 10, 18, 7, 30, 0);
  const slot = getNextBusinessSlot(now);
  const p = getJerusalemParts(slot);

  assert.equal(p.year, 2026);
  assert.equal(p.month, 10);
  assert.equal(p.day, 18);
  assert.equal(p.dayOfWeek, 0); // Sunday
  assert.equal(p.hour, 8);
  assert.equal(p.minute, 0);
});

test('Calendar: Sunday at or after 08:00 defaults to Monday at 08:00', () => {
  // Sunday Oct 18, 2026 at 08:00:00 (exact boundary)
  const exact = createJerusalemDate(2026, 10, 18, 8, 0, 0);
  const slotExact = getNextBusinessSlot(exact);
  const pExact = getJerusalemParts(slotExact);
  assert.equal(pExact.day, 19);
  assert.equal(pExact.dayOfWeek, 1); // Monday
  assert.equal(pExact.hour, 8);

  // Sunday Oct 18, 2026 at 15:45
  const afternoon = createJerusalemDate(2026, 10, 18, 15, 45, 0);
  const slotAfternoon = getNextBusinessSlot(afternoon);
  const pAfternoon = getJerusalemParts(slotAfternoon);
  assert.equal(pAfternoon.day, 19);
  assert.equal(pAfternoon.dayOfWeek, 1); // Monday
  assert.equal(pAfternoon.hour, 8);
});

test('Calendar: Monday through Wednesday transitions roll to next day at 08:00', () => {
  // Monday Oct 19, 2026 at 08:00 -> Tuesday Oct 20 at 08:00
  const mon = createJerusalemDate(2026, 10, 19, 8, 30);
  const tueSlot = getNextBusinessSlot(mon);
  assert.equal(getJerusalemParts(tueSlot).dayOfWeek, 2); // Tuesday
  assert.equal(getJerusalemParts(tueSlot).day, 20);

  // Tuesday Oct 20, 2026 at 22:00 -> Wednesday Oct 21 at 08:00
  const tue = createJerusalemDate(2026, 10, 20, 22, 0);
  const wedSlot = getNextBusinessSlot(tue);
  assert.equal(getJerusalemParts(wedSlot).dayOfWeek, 3); // Wednesday
  assert.equal(getJerusalemParts(wedSlot).day, 21);

  // Wednesday Oct 21, 2026 at 11:00 -> Thursday Oct 22 at 08:00
  const wed = createJerusalemDate(2026, 10, 21, 11, 0);
  const thuSlot = getNextBusinessSlot(wed);
  assert.equal(getJerusalemParts(thuSlot).dayOfWeek, 4); // Thursday
  assert.equal(getJerusalemParts(thuSlot).day, 22);
});

test('Calendar: Thursday transitions - before 08:00 vs after 08:00 (Weekend rollover)', () => {
  // Thursday Oct 22, 2026 at 07:59 -> Today (Thursday) at 08:00
  const thuMorning = createJerusalemDate(2026, 10, 22, 7, 59, 59);
  const thuSlot = getNextBusinessSlot(thuMorning);
  assert.equal(getJerusalemParts(thuSlot).dayOfWeek, 4);
  assert.equal(getJerusalemParts(thuSlot).day, 22);

  // Thursday Oct 22, 2026 at 08:00 -> Rolls over weekend to Sunday Oct 25 at 08:00
  const thuPast = createJerusalemDate(2026, 10, 22, 8, 0, 0);
  const sunSlot = getNextBusinessSlot(thuPast);
  assert.equal(getJerusalemParts(sunSlot).dayOfWeek, 0); // Sunday
  assert.equal(getJerusalemParts(sunSlot).day, 25);
  assert.equal(getJerusalemParts(sunSlot).hour, 8);
});

test('Calendar: Friday and Saturday always default to Sunday at 08:00', () => {
  // Friday Oct 23, 2026 at 14:00
  const fri = createJerusalemDate(2026, 10, 23, 14, 0, 0);
  const slotFri = getNextBusinessSlot(fri);
  const pFri = getJerusalemParts(slotFri);
  assert.equal(pFri.dayOfWeek, 0); // Sunday
  assert.equal(pFri.day, 25);
  assert.equal(pFri.hour, 8);

  // Saturday Oct 24, 2026 at 23:59:59 (Late Saturday night)
  const satNight = createJerusalemDate(2026, 10, 24, 23, 59, 59);
  const slotSat = getNextBusinessSlot(satNight);
  const pSat = getJerusalemParts(slotSat);
  assert.equal(pSat.dayOfWeek, 0); // Sunday
  assert.equal(pSat.day, 25);
  assert.equal(pSat.hour, 8);
});

test('Calendar: Month and Year boundary rollovers', () => {
  // Thursday Dec 31, 2026 at 20:00 -> Sunday Jan 3, 2027 at 08:00
  const newYearEve = createJerusalemDate(2026, 12, 31, 20, 0, 0);
  const slot = getNextBusinessSlot(newYearEve);
  const p = getJerusalemParts(slot);

  assert.equal(p.year, 2027);
  assert.equal(p.month, 1);
  assert.equal(p.day, 3);
  assert.equal(p.dayOfWeek, 0); // Sunday
  assert.equal(p.hour, 8);
});

test('Calendar: Daylight Saving Time (DST) shift handling', () => {
  // Israel Fall transition 2026: Sunday Oct 25, 2026
  // On this day clocks turn back from 02:00 -> 01:00 (UTC+3 -> UTC+2)
  // Ensure the 08:00 slot on Oct 25 is generated at 06:00 UTC (UTC+2)
  const satBeforeFall = createJerusalemDate(2026, 10, 24, 20, 0);
  const fallSlot = getNextBusinessSlot(satBeforeFall);
  assert.equal(fallSlot.toISOString(), '2026-10-25T06:00:00.000Z');
  assert.equal(getJerusalemParts(fallSlot).hour, 8);

  // Israel Spring transition 2026: Friday March 27, 2026
  // Clocks jump 02:00 -> 03:00 (UTC+2 -> UTC+3)
  // Next business day is Sunday March 29 at 08:00 -> must be 05:00 UTC
  const friSpring = createJerusalemDate(2026, 3, 27, 10, 0);
  const springSlot = getNextBusinessSlot(friSpring);
  assert.equal(springSlot.toISOString(), '2026-03-29T05:00:00.000Z');
  assert.equal(getJerusalemParts(springSlot).hour, 8);
});

test('Calendar: isScheduledTimeDue helper', () => {
  const target = new Date('2026-10-18T08:00:00.000Z');

  // Before target: not due
  assert.equal(isScheduledTimeDue(target, new Date('2026-10-18T07:59:59.000Z')), false);

  // Exact target: due
  assert.equal(isScheduledTimeDue(target, new Date('2026-10-18T08:00:00.000Z')), true);

  // Past target: due (overdue)
  assert.equal(isScheduledTimeDue(target, new Date('2026-10-18T08:15:00.000Z')), true);
});

test('Calendar: isValidCustomSchedule helper', () => {
  const ref = new Date('2026-10-18T10:00:00.000Z');

  // Past time: invalid
  const pastRes = isValidCustomSchedule('2026-10-18T09:00:00.000Z', ref);
  assert.equal(pastRes.valid, false);

  // Future time: valid
  const futureRes = isValidCustomSchedule('2026-10-18T12:00:00.000Z', ref);
  assert.equal(futureRes.valid, true);

  // Malformed date: invalid
  const invalidRes = isValidCustomSchedule('not-a-date', ref);
  assert.equal(invalidRes.valid, false);
});

test('Calendar: formatJerusalemDateTime output string', () => {
  const d = createJerusalemDate(2026, 10, 18, 8, 0, 0);
  const formatted = formatJerusalemDateTime(d);
  assert.ok(formatted.includes('Sunday'));
  assert.ok(formatted.includes('08:00'));
  assert.ok(formatted.includes('Asia/Jerusalem'));
});
