export const NOTIFICATION_CHANNELS = {
  event: 'event-reminders',
  feeding: 'feeding-reminders',
  budget: 'budget-alerts',
} as const;

export const NOTIFICATION_SCREENS = {
  event: 'event',
  feeding: 'feeding',
  budget: 'budget',
} as const;

export const NOTIFICATION_ENTITY_TYPES = {
  event: 'event',
  feeding: 'feeding',
  budget: 'budget',
} as const;

export const EVENT_REMINDER_PRESET_MINUTES = {
  standard: [4320, 1440, 60, 0],
  compact: [1440, 60, 0],
  minimal: [60, 0],
} as const;
