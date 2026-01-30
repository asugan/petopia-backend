/**
 * Notification message templates with i18n support
 */

import i18next from './i18n.js';

export interface BudgetAlertMessages {
  warning: {
    title: string;
    body: (params: { percentage: number; currency: string; remaining: number }) => string;
  };
  critical: {
    title: string;
    body: (params: { currency: string; exceeded: number; current: number; budget: number }) => string;
  };
}

export interface FeedingReminderMessages {
  title: (petName: string) => string;
  body: (params: { petName: string; amount: string; foodType: string }) => string;
}

// Legacy exports for backward compatibility - will be deprecated
export const budgetAlertMessages: BudgetAlertMessages = {
  warning: {
    title: 'Budget alert',
    body: ({ percentage, currency, remaining }) =>
      `You've used ${percentage.toFixed(0)}% of your monthly budget. ${currency} ${remaining.toFixed(2)} remaining.`,
  },
  critical: {
    title: 'Budget exceeded',
    body: ({ currency, exceeded, current, budget }) =>
      `You've exceeded your monthly budget by ${currency} ${exceeded.toFixed(2)}. Current spending: ${currency} ${current.toFixed(2)} / ${currency} ${budget.toFixed(2)}`,
  },
};

export const feedingReminderMessages: FeedingReminderMessages = {
  title: (petName: string) => `🍽️ Feeding time for ${petName}`,
  body: ({ petName, amount, foodType }) => `Time to feed ${petName}: ${amount} of ${foodType}`,
};

// New i18n-enabled functions
export function getBudgetAlertMessages(language: string): BudgetAlertMessages {
  return {
    warning: {
      title: i18next.t('budgetAlert.warning.title', { lng: language }),
      body: ({ percentage, currency, remaining }: { percentage: number; currency: string; remaining: number }) =>
        i18next.t('budgetAlert.warning.body', {
          lng: language,
          percentage: percentage.toFixed(0),
          currency,
          remaining: remaining.toFixed(2),
        }),
    },
    critical: {
      title: i18next.t('budgetAlert.critical.title', { lng: language }),
      body: ({ currency, exceeded, current, budget }: { currency: string; exceeded: number; current: number; budget: number }) =>
        i18next.t('budgetAlert.critical.body', {
          lng: language,
          currency,
          exceeded: exceeded.toFixed(2),
          current: current.toFixed(2),
          budget: budget.toFixed(2),
        }),
    },
  };
}

export function getFeedingReminderMessages(language: string): FeedingReminderMessages {
  return {
    title: (petName: string) => i18next.t('feedingReminder.title', { lng: language, petName }),
    body: ({ petName, amount, foodType }: { petName: string; amount: string; foodType: string }) =>
      i18next.t('feedingReminder.body', { lng: language, petName, amount, foodType }),
  };
}

// Helper function for event reminders
export function getEventReminderMessages(language: string) {
  return {
    getTitle: (emoji: string, petName: string | undefined, eventTitle: string) => {
      if (petName) {
        return i18next.t('eventReminder.title', { lng: language, emoji, petName, eventTitle });
      }
      return i18next.t('eventReminder.titleNoPet', { lng: language, emoji, eventTitle });
    },
    getTimeOffset: (minutes: number) => {
      if (minutes >= 1440) {
        const days = Math.floor(minutes / 1440);
        return i18next.t('eventReminder.daysLater', { lng: language, count: days });
      } else if (minutes >= 60) {
        const hours = Math.floor(minutes / 60);
        return i18next.t('eventReminder.hoursLater', { lng: language, count: hours });
      } else {
        return i18next.t('eventReminder.minutesLater', { lng: language, count: minutes });
      }
    },
  };
}
