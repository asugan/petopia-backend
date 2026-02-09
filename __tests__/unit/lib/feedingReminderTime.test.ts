import { describe, expect, it } from 'vitest';
import { calculateNextFeedingTime } from '@/lib/feedingReminderTime';

describe('calculateNextFeedingTime', () => {
  it('returns today when scheduled time is still in future', () => {
    const now = new Date('2026-02-09T05:00:00.000Z'); // 08:00 Europe/Istanbul (Monday)

    const next = calculateNextFeedingTime(
      '10:00',
      'monday,wednesday',
      'Europe/Istanbul',
      now
    );

    expect(next?.toISOString()).toBe('2026-02-09T07:00:00.000Z');
  });

  it('returns next matching day when todays time has passed', () => {
    const now = new Date('2026-02-09T09:30:00.000Z'); // 12:30 Europe/Istanbul (Monday)

    const next = calculateNextFeedingTime(
      '10:00',
      'monday,wednesday',
      'Europe/Istanbul',
      now
    );

    expect(next?.toISOString()).toBe('2026-02-11T07:00:00.000Z');
  });

  it('returns null for invalid time format', () => {
    const now = new Date('2026-02-09T05:00:00.000Z');
    const next = calculateNextFeedingTime('invalid', 'monday', 'Europe/Istanbul', now);

    expect(next).toBeNull();
  });

  it('handles DST spring-forward day in America/New_York', () => {
    const now = new Date('2026-03-08T06:30:00.000Z'); // 01:30 local (before DST jump)

    const next = calculateNextFeedingTime(
      '03:30',
      'sunday',
      'America/New_York',
      now
    );

    // 03:30 local on DST-start day maps to 07:30 UTC
    expect(next?.toISOString()).toBe('2026-03-08T07:30:00.000Z');
  });

  it('uses local-day rollover correctly for high positive offsets', () => {
    const now = new Date('2026-02-09T23:30:00.000Z'); // 13:30 Tuesday in Pacific/Kiritimati

    const next = calculateNextFeedingTime(
      '10:00',
      'tuesday',
      'Pacific/Kiritimati',
      now
    );

    // Today's 10:00 local is already passed, next Tuesday 10:00 local => 2026-02-17T20:00:00Z
    expect(next?.toISOString()).toBe('2026-02-17T20:00:00.000Z');
  });

  it('supports day arrays for backward-compatible feeding day input', () => {
    const now = new Date('2026-02-09T05:00:00.000Z');

    const next = calculateNextFeedingTime(
      '10:00',
      ['monday', 'wednesday'],
      'Europe/Istanbul',
      now
    );

    expect(next?.toISOString()).toBe('2026-02-09T07:00:00.000Z');
  });
});
