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
  // Ensure the date string is treated as UTC
  if (!dateString.endsWith('Z') && !dateString.includes('+')) {
    // Add Z to force UTC parsing
    return new Date(`${dateString}Z`);
  }
  return new Date(dateString);
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
  return date.toISOString().split('T')[0] ?? '';
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
    !value.endsWith('Z')
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

function formatUTCDateString(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(date);
  const values: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      values[part.type] = part.value;
    }
  }

  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  const hour = Number(values.hour);
  const minute = Number(values.minute);
  const second = Number(values.second);

  const asUTC = Date.UTC(year, month - 1, day, hour, minute, second);
  return (asUTC - date.getTime()) / 60000;
}

function zonedStartOfDayToUTC(dateStr: string, timeZone: string): Date {
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  const utcMidnightGuess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

  let offsetMinutes = getTimeZoneOffsetMinutes(utcMidnightGuess, timeZone);
  let utcInstant = new Date(utcMidnightGuess.getTime() - offsetMinutes * 60000);

  offsetMinutes = getTimeZoneOffsetMinutes(utcInstant, timeZone);
  utcInstant = new Date(utcMidnightGuess.getTime() - offsetMinutes * 60000);

  return utcInstant;
}

export function getUTCDateRangeForLocalDate(
  dateStr: string,
  timeZone: string
): { start: Date; end: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error('Invalid date format. Expected YYYY-MM-DD');
  }

  const safeTimeZone = timeZone || 'UTC';

  let tz = safeTimeZone;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
  } catch {
    tz = 'UTC';
  }

  const start = zonedStartOfDayToUTC(dateStr, tz);

  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const nextDate = new Date(Date.UTC(Number(yearStr), Number(monthStr) - 1, Number(dayStr) + 1));
  const nextDateStr = formatUTCDateString(nextDate);
  const end = zonedStartOfDayToUTC(nextDateStr, tz);

  return { start, end };
}
