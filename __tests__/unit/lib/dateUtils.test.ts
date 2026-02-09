import { describe, expect, it } from 'vitest';
import {
  getCurrentUTCMonthRange,
  getMonthRange,
  getPreviousUTCMonthRange,
  getUTCMonthPeriodKey,
  getYearRange,
  dateJSONReplacer,
  formatDateInTimeZone,
  getUTCDateRangeForLocalDate,
  parseUTCDate,
} from '@/lib/dateUtils';

describe('getUTCDateRangeForLocalDate', () => {
  describe('Europe/Istanbul timezone (UTC+3)', () => {
    it('should return correct UTC range for 2026-02-04 in Istanbul', () => {
      const dateStr = '2026-02-04';
      const timeZone = 'Europe/Istanbul';
      
      const { start, end } = getUTCDateRangeForLocalDate(dateStr, timeZone);
      
      // 4 Şubat 2026 00:00 Istanbul = 3 Şubat 2026 21:00 UTC (Istanbul UTC+3)
      const expectedStart = new Date('2026-02-03T21:00:00.000Z');
      // 5 Şubat 2026 00:00 Istanbul = 4 Şubat 2026 21:00 UTC
      const expectedEnd = new Date('2026-02-04T21:00:00.000Z');
      
      expect(start.getTime()).toBe(expectedStart.getTime());
      expect(end.getTime()).toBe(expectedEnd.getTime());
    });

    it('should include an event at 10:00 AM local time', () => {
      const dateStr = '2026-02-04';
      const timeZone = 'Europe/Istanbul';
      
      const { start, end } = getUTCDateRangeForLocalDate(dateStr, timeZone);
      
      // Event: 4 Şubat 2026 10:00 Istanbul = 4 Şubat 2026 07:00 UTC
      const eventTime = new Date('2026-02-04T07:00:00.000Z');
      
      // Event should be within the range
      expect(eventTime.getTime()).toBeGreaterThanOrEqual(start.getTime());
      expect(eventTime.getTime()).toBeLessThan(end.getTime());
    });

    it('should include an event at 11:59 PM local time', () => {
      const dateStr = '2026-02-04';
      const timeZone = 'Europe/Istanbul';
      
      const { start, end } = getUTCDateRangeForLocalDate(dateStr, timeZone);
      
      // Event: 4 Şubat 2026 23:59 Istanbul = 4 Şubat 2026 20:59 UTC
      const eventTime = new Date('2026-02-04T20:59:00.000Z');
      
      expect(eventTime.getTime()).toBeGreaterThanOrEqual(start.getTime());
      expect(eventTime.getTime()).toBeLessThan(end.getTime());
    });

    it('should NOT include an event from previous day', () => {
      const dateStr = '2026-02-04';
      const timeZone = 'Europe/Istanbul';
      
      const { start } = getUTCDateRangeForLocalDate(dateStr, timeZone);
      
      // Event: 3 Şubat 2026 23:59 Istanbul = 3 Şubat 2026 20:59 UTC
      const previousDayEvent = new Date('2026-02-03T20:59:00.000Z');
      
      // This should be BEFORE the start
      expect(previousDayEvent.getTime()).toBeLessThan(start.getTime());
    });

    it('should NOT include an event from next day', () => {
      const dateStr = '2026-02-04';
      const timeZone = 'Europe/Istanbul';
      
      const { end } = getUTCDateRangeForLocalDate(dateStr, timeZone);
      
      // Event: 5 Şubat 2026 00:01 Istanbul = 4 Şubat 2026 21:01 UTC
      const nextDayEvent = new Date('2026-02-04T21:01:00.000Z');
      
      // This should be AT or AFTER the end
      expect(nextDayEvent.getTime()).toBeGreaterThanOrEqual(end.getTime());
    });
  });

  describe('UTC timezone', () => {
    it('should return correct UTC range for UTC timezone', () => {
      const dateStr = '2026-02-04';
      const timeZone = 'UTC';
      
      const { start, end } = getUTCDateRangeForLocalDate(dateStr, timeZone);
      
      const expectedStart = new Date('2026-02-04T00:00:00.000Z');
      const expectedEnd = new Date('2026-02-05T00:00:00.000Z');
      
      expect(start.getTime()).toBe(expectedStart.getTime());
      expect(end.getTime()).toBe(expectedEnd.getTime());
    });
  });

  describe('America/New_York timezone (UTC-5/-4)', () => {
    it('should return correct UTC range for New York in February (EST, UTC-5)', () => {
      const dateStr = '2026-02-04';
      const timeZone = 'America/New_York';
      
      const { start, end } = getUTCDateRangeForLocalDate(dateStr, timeZone);
      
      // 4 Şubat 2026 00:00 NY = 4 Şubat 2026 05:00 UTC (NY UTC-5 in February)
      const expectedStart = new Date('2026-02-04T05:00:00.000Z');
      // 5 Şubat 2026 00:00 NY = 5 Şubat 2026 05:00 UTC
      const expectedEnd = new Date('2026-02-05T05:00:00.000Z');
      
      expect(start.getTime()).toBe(expectedStart.getTime());
      expect(end.getTime()).toBe(expectedEnd.getTime());
    });
  });

  describe('Date range duration', () => {
    it('should always return exactly 24 hours duration', () => {
      const timeZones = ['Europe/Istanbul', 'America/New_York', 'UTC', 'Asia/Tokyo', 'Pacific/Auckland'];
      const dateStr = '2026-02-04';
      
      for (const timeZone of timeZones) {
        const { start, end } = getUTCDateRangeForLocalDate(dateStr, timeZone);
        const durationMs = end.getTime() - start.getTime();
        const durationHours = durationMs / (1000 * 60 * 60);
        
        expect(durationHours).toBe(24);
      }
    });

    it('should return 23 hours on Europe/Berlin DST start day', () => {
      const { start, end } = getUTCDateRangeForLocalDate(
        '2026-03-29',
        'Europe/Berlin'
      );

      const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      expect(durationHours).toBe(23);
    });

    it('should return 25 hours on Europe/Berlin DST end day', () => {
      const { start, end } = getUTCDateRangeForLocalDate(
        '2026-10-25',
        'Europe/Berlin'
      );

      const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      expect(durationHours).toBe(25);
    });

    it('should return 23 hours on America/New_York DST start day', () => {
      const { start, end } = getUTCDateRangeForLocalDate(
        '2026-03-08',
        'America/New_York'
      );

      const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      expect(durationHours).toBe(23);
    });

    it('should return 25 hours on America/New_York DST end day', () => {
      const { start, end } = getUTCDateRangeForLocalDate(
        '2026-11-01',
        'America/New_York'
      );

      const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      expect(durationHours).toBe(25);
    });
  });

  describe('Bug reproduction: Calendar event appearing on wrong day', () => {
    it('should correctly identify which UTC events belong to a local day', () => {
      // Simulate the bug scenario:
      // User selects 2026-02-04 in Istanbul timezone
      // Event was created at 2026-02-04T10:00:00 local time
      // Which is 2026-02-04T07:00:00Z in UTC
      
      const selectedDate = '2026-02-04';
      const timeZone = 'Europe/Istanbul';
      const { start, end } = getUTCDateRangeForLocalDate(selectedDate, timeZone);
      
      // Event stored in database (UTC)
      const eventStartTime = new Date('2026-02-04T07:00:00.000Z');
      
      // The event should be included when querying for 2026-02-04
      const isInSelectedDay = eventStartTime >= start && eventStartTime < end;
      
      expect(isInSelectedDay).toBe(true);
      
      // Verify the formatted date matches
      const formattedDate = formatDateInTimeZone(eventStartTime, timeZone);
      expect(formattedDate).toBe('2026-02-04');
    });

    it('should demonstrate the timezone conversion chain', () => {
      // Step 1: Event created at 10:00 AM local time in Istanbul
      const localEventDate = '2026-02-04';
      const localEventTime = '10:00';
      const timeZone = 'Europe/Istanbul';
      
      // Step 2: Combined and stored as UTC in database
      // This simulates what frontend does when creating an event
      const localDateTime = new Date(`${localEventDate}T${localEventTime}:00`);
      const utcEventTime = localDateTime.toISOString(); // 2026-02-04T07:00:00.000Z
      
      expect(utcEventTime).toBe('2026-02-04T07:00:00.000Z');
      
      // Step 3: When querying for the date, backend uses getUTCDateRangeForLocalDate
      const { start, end } = getUTCDateRangeForLocalDate(localEventDate, timeZone);
      
      // Step 4: The UTC event time should fall within the range
      const eventDate = parseUTCDate(utcEventTime);
      const isInRange = eventDate >= start && eventDate < end;
      
      expect(isInRange).toBe(true);
      
      // Additional verification: range should be exactly 24 hours
      const rangeDurationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      expect(rangeDurationHours).toBe(24);
    });
  });
});

describe('parseUTCDate', () => {
  it('parses ISO strings with negative UTC offset correctly', () => {
    const parsed = parseUTCDate('2026-02-04T10:00:00-05:00');
    expect(parsed.toISOString()).toBe('2026-02-04T15:00:00.000Z');
  });
});

describe('dateJSONReplacer', () => {
  it('normalizes timezone-less datetime strings to UTC', () => {
    const result = dateJSONReplacer('startTime', '2026-02-04T10:00:00');
    expect(result).toBe('2026-02-04T10:00:00.000Z');
  });

  it('keeps offset datetime strings unchanged', () => {
    const value = '2026-02-04T10:00:00+03:00';
    const result = dateJSONReplacer('startTime', value);
    expect(result).toBe(value);
  });
});

describe('UTC finance boundaries', () => {
  it('returns UTC month range regardless of server local timezone', () => {
    const { start, end } = getMonthRange(2026, 2);

    expect(start.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-02-28T23:59:59.999Z');
  });

  it('returns UTC year range boundaries', () => {
    const { start, end } = getYearRange(2026);

    expect(start.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-12-31T23:59:59.999Z');
  });

  it('builds UTC month period key', () => {
    const periodKey = getUTCMonthPeriodKey(new Date('2026-02-28T23:59:59.000Z'));
    expect(periodKey).toBe('2026-02');
  });

  it('gets current and previous UTC month ranges', () => {
    const reference = new Date('2026-02-15T08:00:00.000Z');
    const current = getCurrentUTCMonthRange(reference);
    const previous = getPreviousUTCMonthRange(reference);

    expect(current.start.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(current.end.toISOString()).toBe('2026-02-28T23:59:59.999Z');
    expect(previous.start.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(previous.end.toISOString()).toBe('2026-01-31T23:59:59.999Z');
  });
});
