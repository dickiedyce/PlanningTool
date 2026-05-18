/**
 * dates.js — Working-day calculations
 *
 * All functions accept plain Date objects (local midnight).
 * Weekend = Saturday (day 6) or Sunday (day 0).
 *
 * Exports:
 *   isWorkingDay(date)                      → boolean
 *   nextWorkingDay(date)                    → Date
 *   addWorkingDays(startDate, n)            → Date
 *   workingDaysBetween(startDate, endDate)  → number
 */

/** @param {Date} date */
export function isWorkingDay(date) {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

/**
 * Return the next working day after date (not including date itself).
 * @param {Date} date
 * @returns {Date}
 */
export function nextWorkingDay(date) {
  const result = new Date(date);
  do {
    result.setDate(result.getDate() + 1);
  } while (!isWorkingDay(result));
  return result;
}

/**
 * Add n working days to startDate.
 * n=0 returns startDate unchanged (even if it falls on a weekend).
 * @param {Date} startDate
 * @param {number} n  Non-negative integer
 * @returns {Date}
 */
export function addWorkingDays(startDate, n) {
  const result = new Date(startDate);
  let remaining = n;
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    if (isWorkingDay(result)) remaining--;
  }
  return result;
}

/**
 * Count working days strictly between startDate and endDate (exclusive of
 * startDate, inclusive of endDate).  Returns 0 when start === end.
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {number}
 */
export function workingDaysBetween(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  let count = 0;
  const cursor = new Date(start);
  while (cursor < end) {
    cursor.setDate(cursor.getDate() + 1);
    if (isWorkingDay(cursor)) count++;
  }
  return count;
}
