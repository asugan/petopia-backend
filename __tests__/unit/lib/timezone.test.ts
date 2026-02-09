import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TIMEZONE,
  resolveEffectiveTimezone,
  sanitizeTimezone,
} from '@/lib/timezone';

describe('timezone utilities', () => {
  describe('sanitizeTimezone', () => {
    it('returns undefined for empty and whitespace values', () => {
      expect(sanitizeTimezone('')).toBeUndefined();
      expect(sanitizeTimezone('   ')).toBeUndefined();
      expect(sanitizeTimezone(undefined)).toBeUndefined();
      expect(sanitizeTimezone(null)).toBeUndefined();
    });

    it('returns undefined for invalid timezone', () => {
      expect(sanitizeTimezone('Invalid/Timezone')).toBeUndefined();
    });

    it('trims and returns valid timezone', () => {
      expect(sanitizeTimezone('  Europe/Istanbul  ')).toBe('Europe/Istanbul');
    });
  });

  describe('resolveEffectiveTimezone', () => {
    it('uses client timezone first when valid', () => {
      const timezone = resolveEffectiveTimezone({
        clientTimezone: 'America/New_York',
        userTimezone: 'Europe/Istanbul',
      });

      expect(timezone).toBe('America/New_York');
    });

    it('falls back to user timezone when client timezone is empty', () => {
      const timezone = resolveEffectiveTimezone({
        clientTimezone: '   ',
        userTimezone: 'Europe/Istanbul',
      });

      expect(timezone).toBe('Europe/Istanbul');
    });

    it('falls back to default timezone when all values are invalid', () => {
      const timezone = resolveEffectiveTimezone({
        clientTimezone: 'Invalid/Timezone',
        userTimezone: '',
      });

      expect(timezone).toBe(DEFAULT_TIMEZONE);
    });

    it('uses provided fallback when valid', () => {
      const timezone = resolveEffectiveTimezone({
        clientTimezone: '',
        userTimezone: '',
        fallback: 'Asia/Tokyo',
      });

      expect(timezone).toBe('Asia/Tokyo');
    });
  });
});
