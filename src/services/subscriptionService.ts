import { HydratedDocument } from 'mongoose';
import { ISubscriptionDocument, SubscriptionModel } from '../models/mongoose';
import { DeviceTrialRegistryModel } from '../models/mongoose/deviceTrialRegistry';
import { UserTrialRegistryModel } from '../models/mongoose/userTrialRegistry';
import {
  SUBSCRIPTION_CONFIG,
  SUBSCRIPTION_PROVIDERS,
  SUBSCRIPTION_STATUSES,
} from '../config/subscriptionConfig';
import { RevenueCatService } from './revenueCatService';

/**
 * Unified subscription status - single source of truth for frontend
 */
export interface UnifiedSubscriptionStatus {
  hasActiveSubscription: boolean;
  subscriptionType: 'trial' | 'paid' | null;
  tier: string | null;
  expiresAt: string | null;
  daysRemaining: number;
  isExpired: boolean;
  isCancelled: boolean;
  canStartTrial: boolean;
  provider: 'internal' | 'revenuecat' | null;
}

export class SubscriptionService {
  private revenueCatService = new RevenueCatService();

  /**
   * Get unified subscription status for a user
   * This is the main endpoint - frontend should use this for all status checks
   */
  async getSubscriptionStatus(
    userId: string,
    deviceId?: string
  ): Promise<UnifiedSubscriptionStatus> {
    // Get the user's active subscription (either internal trial or revenuecat)
    const subscription = await SubscriptionModel.findOne({
      userId,
      status: { $in: [SUBSCRIPTION_STATUSES.ACTIVE, SUBSCRIPTION_STATUSES.CANCELLED] },
      expiresAt: { $gt: new Date() }
    }).exec();

    if (!subscription) {
      // No active subscription - check last known subscription for status flags
      const latestSubscription = await SubscriptionModel.findOne({ userId }).sort({ expiresAt: -1 }).exec();

      // Check if device can start trial
      const canStartTrial = deviceId
        ? await this.checkDeviceCanStartTrial(deviceId, userId)
        : false;

      return {
        hasActiveSubscription: false,
        subscriptionType: null,
        tier: null,
        expiresAt: null,
        daysRemaining: 0,
        isExpired: !!latestSubscription,
        isCancelled:
          latestSubscription?.status === SUBSCRIPTION_STATUSES.CANCELLED,
        canStartTrial,
        provider: null,
      };
    }

    const expiresAt = new Date(subscription.expiresAt);
    const daysRemaining = SUBSCRIPTION_CONFIG.getDaysRemaining(expiresAt);

    return {
      hasActiveSubscription: true,
      subscriptionType:
        subscription.provider === SUBSCRIPTION_PROVIDERS.INTERNAL
          ? 'trial'
          : 'paid',
      tier: subscription.tier,
      expiresAt: expiresAt.toISOString(),
      daysRemaining,
      isExpired: false,
      isCancelled: subscription.status === SUBSCRIPTION_STATUSES.CANCELLED,
      canStartTrial: false, // Already has subscription
      provider: subscription.provider,
    };
  }

  async verifyAndSyncFromRevenueCat(userId: string): Promise<UnifiedSubscriptionStatus> {
    const result = await this.revenueCatService.verifyActiveEntitlement(userId);

    if (!result.configured) {
      return this.getSubscriptionStatus(userId);
    }

    if (result.isActive && result.expiresAt) {
      const status = result.isCancelled
        ? SUBSCRIPTION_STATUSES.CANCELLED
        : SUBSCRIPTION_STATUSES.ACTIVE;

      await this.upsertRevenueCatSubscription(
        userId,
        null,
        result.expiresAt,
        status
      );
    }

    return this.getSubscriptionStatus(userId);
  }

  /**
   * Check if a device has already used a trial
   */
  async checkDeviceCanStartTrial(deviceId: string, userId?: string): Promise<boolean> {
    const existingDevice = await DeviceTrialRegistryModel.findOne({ deviceId }).exec();
    if (existingDevice) {
      return false;
    }

    if (userId) {
      const existingUserTrial = await UserTrialRegistryModel.findOne({ userId }).exec();
      return !existingUserTrial;
    }

    return true;
  }


  /**
   * Start an internal trial for a user
   */
  async startTrial(userId: string, deviceId: string): Promise<HydratedDocument<ISubscriptionDocument>> {
    // Check if user already has any subscription
    const existingSubscription = await SubscriptionModel.findOne({
      userId,
      status: { $in: [SUBSCRIPTION_STATUSES.ACTIVE, SUBSCRIPTION_STATUSES.CANCELLED] },
      expiresAt: { $gt: new Date() },
    }).exec();

    if (existingSubscription) {
      throw new Error('User already has a subscription');
    }

    // Check if user has already used a trial
    const existingUserTrial = await UserTrialRegistryModel.findOne({ userId }).exec();

    if (existingUserTrial) {
      throw new Error('User has already used a trial');
    }

    // Check if device has already used a trial
    const existingDevice = await DeviceTrialRegistryModel.findOne({ deviceId }).exec();

    if (existingDevice) {
      throw new Error('Device has already used a trial');
    }

    const now = new Date();
    const expiresAt = SUBSCRIPTION_CONFIG.getTrialEndDate(now);

    // Create subscription with provider='internal'
    const newSubscription = new SubscriptionModel({
      userId,
      provider: SUBSCRIPTION_PROVIDERS.INTERNAL,
      revenueCatId: null,
      tier: SUBSCRIPTION_CONFIG.TIERS.PRO,
      status: SUBSCRIPTION_STATUSES.ACTIVE,
      expiresAt,
    });

    const savedSubscription = await newSubscription.save();

    if (!savedSubscription) {
      throw new Error('Failed to create subscription');
    }

    // Register device to prevent future trials
    const deviceTrial = new DeviceTrialRegistryModel({
      deviceId,
      firstTrialUserId: userId,
      trialUsedAt: now,
    });

    await deviceTrial.save();

    const userTrial = new UserTrialRegistryModel({
      userId,
      trialUsedAt: now,
    });

    await userTrial.save();

    return savedSubscription;
  }

  /**
   * Upsert a RevenueCat subscription
   * Called from webhook handler when a purchase/renewal/cancellation occurs
   */
  async upsertRevenueCatSubscription(
    userId: string,
    revenueCatId: string | null,
    expiresAt: Date,
    status: string
  ): Promise<HydratedDocument<ISubscriptionDocument> | null> {
    const now = new Date();

    // Check if user already has a subscription
    const existingSubscription = await SubscriptionModel.findOne({ userId }).exec();

    if (existingSubscription) {
      // Update existing subscription to RevenueCat
      const updatedSubscription = await SubscriptionModel.findOneAndUpdate(
        { userId },
        {
          provider: SUBSCRIPTION_PROVIDERS.REVENUECAT,
          ...(revenueCatId ? { revenueCatId } : {}),
          status,
          expiresAt,
          updatedAt: now,
        },
        { new: true }
      ).exec();

      return updatedSubscription;
    }

    // Create new RevenueCat subscription
    const newSubscription = new SubscriptionModel({
      userId,
      provider: SUBSCRIPTION_PROVIDERS.REVENUECAT,
      revenueCatId: revenueCatId ?? undefined,
      tier: SUBSCRIPTION_CONFIG.TIERS.PRO,
      status,
      expiresAt,
    });

    const savedSubscription = await newSubscription.save();

    return savedSubscription;
  }

  /**
   * Update subscription status (used by webhook for cancellation/expiration)
   */
  async updateSubscriptionStatus(
    revenueCatId: string,
    status: string,
    expiresAt?: Date
  ): Promise<HydratedDocument<ISubscriptionDocument> | null> {
    const now = new Date();

    const updateData: { status: string; updatedAt: Date; expiresAt?: Date } = {
      status,
      updatedAt: now,
    };

    if (expiresAt) {
      updateData.expiresAt = expiresAt;
    }

    const updatedSubscription = await SubscriptionModel.findOneAndUpdate(
      { revenueCatId },
      updateData,
      { new: true }
    ).exec();

    return updatedSubscription;
  }

  async updateLatestRevenueCatSubscriptionForUser(
    userId: string,
    status: string,
    expiresAt?: Date
  ): Promise<HydratedDocument<ISubscriptionDocument> | null> {
    const now = new Date();

    const updateData: { status: string; updatedAt: Date; expiresAt?: Date } = {
      status,
      updatedAt: now,
    };

    if (expiresAt) {
      updateData.expiresAt = expiresAt;
    }

    return SubscriptionModel.findOneAndUpdate(
      {
        userId,
        provider: SUBSCRIPTION_PROVIDERS.REVENUECAT,
      },
      updateData,
      { new: true, sort: { updatedAt: -1 } }
    ).exec();
  }

  /**
   * Expire internal trial when user subscribes via RevenueCat
   */
  async expireInternalTrial(userId: string): Promise<boolean> {
    const subscription = await SubscriptionModel.findOne({
      userId,
      provider: SUBSCRIPTION_PROVIDERS.INTERNAL,
      status: SUBSCRIPTION_STATUSES.ACTIVE
    }).exec();

    if (!subscription) {
      return false;
    }

    await SubscriptionModel.updateOne(
      { _id: subscription._id },
      {
        status: SUBSCRIPTION_STATUSES.EXPIRED,
        updatedAt: new Date(),
      });

    return true;
  }

  /**
   * Get subscription by user ID
   */
  async getSubscriptionByUserId(userId: string): Promise<HydratedDocument<ISubscriptionDocument> | null> {
    const subscription = await SubscriptionModel.findOne({ userId }).exec();
    return subscription ?? null;
  }

  /**
   * Find user ID by RevenueCat app user ID
   * RevenueCat sends app_user_id in webhooks which should match our userId
   */
  findUserByRevenueCatAppUserId(
    appUserId: string
  ): string | null {
    // In our case, app_user_id is the same as userId
    return appUserId;
  }
}
