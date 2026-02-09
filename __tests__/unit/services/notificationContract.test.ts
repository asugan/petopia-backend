import { describe, expect, it } from 'vitest';
import {
  EVENT_REMINDER_PRESET_MINUTES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_ENTITY_TYPES,
  NOTIFICATION_SCREENS,
} from '../../../src/constants/notificationContract';

describe('notification contract constants', () => {
  it('defines stable channels and screens', () => {
    expect(NOTIFICATION_CHANNELS).toEqual({
      event: 'event-reminders',
      feeding: 'feeding-reminders',
      budget: 'budget-alerts',
    });

    expect(NOTIFICATION_SCREENS).toEqual({
      event: 'event',
      feeding: 'feeding',
      budget: 'budget',
    });
  });

  it('defines entity types aligned with mobile routing', () => {
    expect(NOTIFICATION_ENTITY_TYPES).toEqual({
      event: 'event',
      feeding: 'feeding',
      budget: 'budget',
    });
  });

  it('keeps reminder presets aligned with mobile contract', () => {
    expect(EVENT_REMINDER_PRESET_MINUTES.standard).toEqual([4320, 1440, 60, 0]);
    expect(EVENT_REMINDER_PRESET_MINUTES.compact).toEqual([1440, 60, 0]);
    expect(EVENT_REMINDER_PRESET_MINUTES.minimal).toEqual([60, 0]);
  });
});
