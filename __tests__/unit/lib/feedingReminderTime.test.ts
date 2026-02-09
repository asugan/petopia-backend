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
});
