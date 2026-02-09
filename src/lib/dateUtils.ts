import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { resolveEffectiveTimezone } from './timezone';

export interface UTCDateRange {
  start: Date;
  end: Date;
}

/**
 * Backend date utilities for consistent UTC handling
 *
 * These utilities ensure that all dates are parsed and serialized
 * consistently in UTC to avoid timezone-related issues.
 */

/**
 * Parse date string as UTC and return Date object
 * @param dateString - ISO date string (should be in UTC)
 * @returns Date object representing UTC time
 */
export function parseUTCDate(dateString: string): Date {
  const value = dateString?.trim();
  if (!value) {
    throw new Error('Invalid date string');
  }

  let normalized = value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    normalized = `${normalized}T00:00:00.000Z`;
  } else if (/^\d{4}-\d{2}-\d{2}T/.test(normalized) && !/(Z|[+-]\d{2}:\d{2})$/.test(normalized)) {
    normalized = `${normalized}Z`;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date string: ${dateString}`);
  }

  return parsed;
}

/**
 * Convert Date to UTC ISO string
 * @param date - Date object
 * @returns ISO 8601 string in UTC
 */
export function toUTCISOString(date: Date): string {
  return date.toISOString();
}

/**
 * Get UTC date-only string (YYYY-MM-DD)
 * @param date - Date object
 * @returns Date-only string in YYYY-MM-DD format
 */
export function toUTCDateString(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse date string and return as date-only UTC string
 * @param dateString - ISO date string
 * @returns Date-only string in YYYY-MM-DD format (UTC)
 */
export function parseAsUTCDate(dateString: string): string {
  const date = parseUTCDate(dateString);
  return toUTCDateString(date);
}

/**
 * Normalize all date values in an object to UTC ISO strings
 * @param obj - Object containing date fields
 * @param dateFields - Array of field names that contain dates
 * @returns Object with normalized date fields
 */
export function normalizeDatesToUTC<T extends Record<string, unknown>>(
  obj: T,
  dateFields: (keyof T)[]
): T {
  const normalized = { ...obj };

  for (const field of dateFields) {
    if (normalized[field]) {
      if (typeof normalized[field] === 'string') {
        normalized[field] = toUTCISOString(
          parseUTCDate(normalized[field])
        ) as T[keyof T];
      } else if (
        normalized[field] &&
        typeof normalized[field] === 'object' &&
        'toISOString' in normalized[field]
      ) {
        normalized[field] = toUTCISOString(normalized[field] as unknown as Date) as T[keyof T];
      }
    }
  }

  return normalized;
}

/**
 * Convert JSON response to ensure all dates are in UTC format
 * This can be used as a JSON replacer
 */
export function dateJSONReplacer(key: string, value: unknown): unknown {
  if (value instanceof Date) {
    return toUTCISOString(value);
  }

  // Handle date-only fields - check if it's a date-only string without time
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    // Return as-is for date-only fields (no timezone info)
    return value;
  }

  // Handle ISO date strings that might not be in UTC
  if (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value) &&
    !/(Z|[+-]\d{2}:\d{2})$/.test(value)
  ) {
    return toUTCISOString(new Date(`${value}Z`));
  }

  return value;
}

/**
 * Create a UTC-aware date filter for database queries
 * @param dateStr - Date string in YYYY-MM-DD format
 * @returns Object with UTC start and end of day timestamps
 */
export function createUTCDateFilter(dateStr: string) {
  const startDate = new Date(`${dateStr}T00:00:00.000Z`);
  const endDate = new Date(`${dateStr}T23:59:59.999Z`);

  return {
    gte: startDate.getTime(),
    lte: endDate.getTime(),
  };
}

/**
 * Get today's date boundaries in UTC
 * @returns Object with UTC start and end of today
 */
export function getUTCTodayBoundaries() {
  const now = new Date();

  // Get UTC date string
  const utcDateString = toUTCDateString(now);

  return createUTCDateFilter(utcDateString);
}

export function formatDateInTimeZone(date: Date, timeZone: string): string {
  const tz = resolveEffectiveTimezone({ userTimezone: timeZone });
  return formatInTimeZone(date, tz, 'yyyy-MM-dd');
}

/**
 * Check if a date is today in UTC
 * @param date - Date object or timestamp
 * @returns boolean indicating if date is today
 */
export function isUTCToday(date: Date | number): boolean {
  const dateObj = typeof date === 'number' ? new Date(date) : date;
  const today = getUTCTodayBoundaries();
  const timestamp = dateObj.getTime();

  return timestamp >= today.gte && timestamp <= today.lte;
}

/**
 * Get UTC date boundaries for a range of days from now
 * @param days - Number of days to look ahead (default: 7)
 * @returns Object with UTC start (now) and end timestamps
 */
export function getUTCUpcomingBoundaries(days = 7) {
  const now = new Date();
  const endDate = new Date(now);

  // Add days in UTC to avoid timezone issues
  endDate.setUTCDate(endDate.getUTCDate() + days);

  // Set end of day for the final day
  endDate.setUTCHours(23, 59, 59, 999);

  return {
    gte: now.getTime(),
    lte: endDate.getTime(),
  };
}

/**
 * Build a UTC month range [start, end] where end is inclusive to millisecond.
 * Month input is 1-based (January = 1).
 */
export function getMonthRange(year: number, month: number): UTCDateRange {
  if (!Number.isInteger(year) || year < 1970 || year > 9999) {
    throw new Error('Invalid year. Expected integer between 1970 and 9999');
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('Invalid month. Expected integer between 1 and 12');
  }

  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0) - 1);

  return { start, end };
}

/**
 * Build a UTC year range [start, end] where end is inclusive to millisecond.
 */
export function getYearRange(year: number): UTCDateRange {
  if (!Number.isInteger(year) || year < 1970 || year > 9999) {
    throw new Error('Invalid year. Expected integer between 1970 and 9999');
  }

  const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0) - 1);

  return { start, end };
}

/**
 * UTC period key in YYYY-MM format.
 */
export function getUTCMonthPeriodKey(referenceDate: Date = new Date()): string {
  const year = referenceDate.getUTCFullYear();
  const month = String(referenceDate.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function getCurrentUTCMonthRange(referenceDate: Date = new Date()): UTCDateRange {
  return getMonthRange(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth() + 1
  );
}

export function getPreviousUTCMonthRange(referenceDate: Date = new Date()): UTCDateRange {
  const previousMonth = new Date(Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth() - 1,
    1,
    0,
    0,
    0,
    0
  ));

  return getMonthRange(
    previousMonth.getUTCFullYear(),
    previousMonth.getUTCMonth() + 1
  );
}

function formatUTCDateString(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDaysToDateString(dateStr: string, days: number): string {
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const nextDate = new Date(
    Date.UTC(Number(yearStr), Number(monthStr) - 1, Number(dayStr) + days)
  );
  return formatUTCDateString(nextDate);
}

export function getUTCDateRangeForLocalDate(
  dateStr: string,
  timeZone: string
): { start: Date; end: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error('Invalid date format. Expected YYYY-MM-DD');
  }

  const tz = resolveEffectiveTimezone({ userTimezone: timeZone });

  const start = fromZonedTime(`${dateStr}T00:00:00`, tz);

  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const nextDate = new Date(Date.UTC(Number(yearStr), Number(monthStr) - 1, Number(dayStr) + 1));
  const nextDateStr = formatUTCDateString(nextDate);
  const end = fromZonedTime(`${nextDateStr}T00:00:00`, tz);

  return { start, end };
}

export function getUTCTodayBoundariesForTimeZone(timeZone: string) {
  const todayLocal = formatDateInTimeZone(new Date(), timeZone);
  const { start, end } = getUTCDateRangeForLocalDate(todayLocal, timeZone);

  return {
    gte: start.getTime(),
    lte: end.getTime() - 1,
  };
}

export function getUTCUpcomingBoundariesForTimeZone(
  days: number,
  timeZone: string
) {
  const now = new Date();
  const todayLocal = formatDateInTimeZone(now, timeZone);
  const endDateStr = addDaysToDateString(todayLocal, days);
  const { end } = getUTCDateRangeForLocalDate(endDateStr, timeZone);

  return {
    gte: now.getTime(),
    lte: end.getTime() - 1,
  };
}
