import { describe, expect, it } from 'vitest';
import {
  createUTCDateFilter,
  getUTCDateRangeForLocalDate,
  getUTCTodayBoundaries,
  getUTCUpcomingBoundaries,
  isUTCToday,
  normalizeDatesToUTC,
  parseAsUTCDate,
  parseUTCDate,
  toUTCDateString,
  toUTCISOString,
} from '../../../src/lib/dateUtils';

describe('dateUtils', () => {
  describe('parseUTCDate', () => {
    it('should parse ISO string with Z to Date object', () => {
      const isoString = '2024-01-15T10:30:00.000Z';
      const result = parseUTCDate(isoString);
      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe(isoString);
    });

    it('should add Z to date string without timezone', () => {
      const dateString = '2024-01-15T10:30:00';
      const result = parseUTCDate(dateString);
      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString().endsWith('Z')).toBe(true);
    });

    it('should handle date string with plus offset', () => {
      const dateString = '2024-01-15T10:30:00+03:00';
      const result = parseUTCDate(dateString);
      expect(result).toBeInstanceOf(Date);
    });
  });

  describe('toUTCISOString', () => {
    it('should format date to ISO string', () => {
      const date = new Date('2024-01-15T10:30:00.000Z');
      const result = toUTCISOString(date);
      expect(result).toBe('2024-01-15T10:30:00.000Z');
    });
  });

  describe('toUTCDateString', () => {
    it('should return date-only string', () => {
      const date = new Date('2024-01-15T10:30:00.000Z');
      const result = toUTCDateString(date);
      expect(result).toBe('2024-01-15');
    });
  });

  describe('parseAsUTCDate', () => {
    it('should parse and return date-only string', () => {
      const dateString = '2024-01-15T10:30:00';
      const result = parseAsUTCDate(dateString);
      expect(result).toBe('2024-01-15');
    });
  });

  describe('normalizeDatesToUTC', () => {
    it('should normalize string date to UTC ISO', () => {
      const obj = { id: '123', createdAt: '2024-01-15T10:30:00' };
      const result = normalizeDatesToUTC(obj, ['createdAt']);
      expect(result.createdAt).toBe('2024-01-15T10:30:00.000Z');
    });

    it('should normalize Date object to UTC ISO', () => {
      const date = new Date('2024-01-15T10:30:00.000Z');
      const obj = { id: '123', date } as Record<string, unknown>;
      const result = normalizeDatesToUTC(obj, ['date']);
      expect(result.date).toBe('2024-01-15T10:30:00.000Z');
    });

    it('should return same object if date field is not specified', () => {
      const obj = { id: '123', name: 'Test' };
      const result = normalizeDatesToUTC(obj, []);
      expect(result).toEqual(obj);
    });
  });

  describe('createUTCDateFilter', () => {
    it('should create start and end timestamps for a date', () => {
      const dateStr = '2024-01-15';
      const result = createUTCDateFilter(dateStr);
      expect(result).toHaveProperty('gte');
      expect(result).toHaveProperty('lte');
      expect(result.gte).toBeTypeOf('number');
      expect(result.lte).toBeTypeOf('number');
    });
  });

  describe('getUTCTodayBoundaries', () => {
    it('should return start and end of today in UTC', () => {
      const result = getUTCTodayBoundaries();
      expect(result).toHaveProperty('gte');
      expect(result).toHaveProperty('lte');
      expect(result.gte).toBeTypeOf('number');
      expect(result.lte).toBeTypeOf('number');
    });
  });

  describe('isUTCToday', () => {
    it('should return true for date set to today', () => {
      const now = new Date();
      const result = isUTCToday(now.getTime());
      expect(result).toBe(true);
    });

    it('should return false for date not today', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const result = isUTCToday(yesterday.getTime());
      expect(result).toBe(false);
    });
  });

  describe('getUTCUpcomingBoundaries', () => {
    it('should return boundaries for upcoming days', () => {
      const result = getUTCUpcomingBoundaries(7);
      expect(result).toHaveProperty('gte');
      expect(result).toHaveProperty('lte');
      expect(result.gte).toBeTypeOf('number');
      expect(result.lte).toBeTypeOf('number');
    });

    it('should support custom days parameter', () => {
      const result = getUTCUpcomingBoundaries(14);
      expect(result).toHaveProperty('gte');
      expect(result).toHaveProperty('lte');
    });
  });

  describe('getUTCDateRangeForLocalDate', () => {
    it('should compute UTC boundaries for UTC timezone', () => {
      const range = getUTCDateRangeForLocalDate('2024-01-15', 'UTC');
      expect(range.start.toISOString()).toBe('2024-01-15T00:00:00.000Z');
      expect(range.end.toISOString()).toBe('2024-01-16T00:00:00.000Z');
    });

    it('should compute UTC boundaries for Europe/Istanbul (UTC+03)', () => {
      const range = getUTCDateRangeForLocalDate('2024-01-15', 'Europe/Istanbul');
      expect(range.start.toISOString()).toBe('2024-01-14T21:00:00.000Z');
      expect(range.end.toISOString()).toBe('2024-01-15T21:00:00.000Z');
    });

    it('should throw for invalid date format', () => {
      expect(() => getUTCDateRangeForLocalDate('2024/01/15', 'UTC')).toThrow();
    });
  });
});
