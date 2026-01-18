/**
 * Notification message templates
 * These can be extended with i18n support in the future
 */

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
