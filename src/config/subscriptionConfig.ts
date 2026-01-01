/**
 * Unified subscription system configuration
 * Handles both internal trials and RevenueCat subscriptions
 */

export const SUBSCRIPTION_PROVIDERS = {
  INTERNAL: 'internal',
  REVENUECAT: 'revenuecat',
} as const;

export const SUBSCRIPTION_STATUSES = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
} as const;

export const SUBSCRIPTION_TIERS = {
  PRO: 'pro',
} as const;

export type SubscriptionProvider =
  (typeof SUBSCRIPTION_PROVIDERS)[keyof typeof SUBSCRIPTION_PROVIDERS];
export type SubscriptionStatus =
  (typeof SUBSCRIPTION_STATUSES)[keyof typeof SUBSCRIPTION_STATUSES];
export type SubscriptionTier =
  (typeof SUBSCRIPTION_TIERS)[keyof typeof SUBSCRIPTION_TIERS];

export const SUBSCRIPTION_CONFIG = {
  /** Trial duration in days */
  TRIAL_DURATION_DAYS: 14,

  /** Providers */
  PROVIDERS: SUBSCRIPTION_PROVIDERS,

  /** Statuses */
  STATUSES: SUBSCRIPTION_STATUSES,

  /** Tiers */
  TIERS: SUBSCRIPTION_TIERS,

  /**
   * Calculate trial end date from a given start date
   * @param startDate - The start date of the trial (defaults to now)
   * @returns The end date of the trial
   */
  getTrialEndDate: (startDate: Date = new Date()): Date => {
    const endDate = new Date(startDate);
    endDate.setDate(
      endDate.getDate() + SUBSCRIPTION_CONFIG.TRIAL_DURATION_DAYS
    );
    return endDate;
  },

  /**
   * Calculate remaining days from expiration date
   * @param expiresAt - The expiration date
   * @returns Number of days remaining (0 if expired)
   */
  getDaysRemaining: (expiresAt: Date): number => {
    const now = new Date();
    const diffMs = expiresAt.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  },

  /**
   * Check if a subscription is expired
   * @param expiresAt - The expiration date
   * @returns True if the subscription has expired
   */
  isExpired: (expiresAt: Date): boolean => {
    return new Date() > expiresAt;
  },

  /**
   * Check if status indicates an active subscription
   * @param status - The subscription status
   * @returns True if the status is active
   */
  isActiveStatus: (status: string): boolean => {
    return status === SUBSCRIPTION_STATUSES.ACTIVE;
  },
} as const;
