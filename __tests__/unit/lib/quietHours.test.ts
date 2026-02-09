import { describe, expect, it } from 'vitest';
import { getNextAllowedTime, isInQuietHours } from '../../../src/lib/quietHours';

const quietHours = {
  startHour: 22,
  startMinute: 0,
  endHour: 8,
  endMinute: 0,
};

describe('quietHours utility', () => {
  it('detects quiet hours when range crosses midnight', () => {
    const inQuiet = new Date('2026-02-10T03:30:00.000Z');
    const outQuiet = new Date('2026-02-10T12:30:00.000Z');

    expect(isInQuietHours(inQuiet, 'UTC', quietHours)).toBe(true);
    expect(isInQuietHours(outQuiet, 'UTC', quietHours)).toBe(false);
  });

  it('moves trigger to quiet-hours end when blocked', () => {
    const blocked = new Date('2026-02-10T23:00:00.000Z');
    const nextAllowed = getNextAllowedTime(blocked, 'UTC', quietHours);

    expect(nextAllowed.toISOString()).toBe('2026-02-11T08:00:00.000Z');
  });

  it('keeps trigger unchanged when already outside quiet hours', () => {
    const allowed = new Date('2026-02-10T09:15:00.000Z');
    const nextAllowed = getNextAllowedTime(allowed, 'UTC', quietHours);

    expect(nextAllowed.toISOString()).toBe(allowed.toISOString());
  });
});
