import { Types } from 'mongoose';
import { pushNotificationService } from './pushNotificationService.js';
import { FeedingNotificationModel, FeedingScheduleModel, PetModel, UserDeviceModel, UserSettingsModel } from '../models/mongoose/index.js';
import { getFeedingReminderMessages } from '../config/notificationMessages.js';
import { logger } from '../utils/logger.js';
import { calculateNextFeedingTime } from '../lib/feedingReminderTime.js';
import { resolveUserTimezone } from './userTimezoneService.js';

// Cache for user languages to avoid repeated DB queries
const userLanguageCache = new Map<string, string>();

export interface FeedingReminderConfig {
  scheduleId: string;
  userId: string;
  petId: string;
  petName: string;
  time: string;
  foodType: string;
  amount: string;
  days: string;
  reminderMinutesBefore: number;
  timezone?: string; // User's timezone (defaults to UTC)
}

export interface FeedingReminderResult {
  success: boolean;
  scheduledCount: number;
  error?: string;
}

/**
 * Feeding Reminder Service
 * Handles scheduling and sending feeding reminder push notifications with i18n support
 */
export class FeedingReminderService {
  /**
   * Schedule a feeding reminder for a specific schedule
   */
  async scheduleFeedingReminder(config: FeedingReminderConfig): Promise<FeedingReminderResult> {
    const { scheduleId, userId, time, days, reminderMinutesBefore, timezone: configTimezone } = config;

    const timezone = await resolveUserTimezone(userId, configTimezone);

    // Get user's active devices
    const devices = await UserDeviceModel.find({
      userId: new Types.ObjectId(userId),
      isActive: true,
    }).select('expoPushToken').lean();

    if (devices.length === 0) {
      logger.info(`No active devices found for user ${userId}`);
      return { success: true, scheduledCount: 0 };
    }

    // Calculate the next feeding time based on days and time (using user's timezone)
    const nextFeedingTime = this.calculateNextFeedingTime(time, days, timezone);

    if (!nextFeedingTime) {
      logger.info(`No upcoming feeding time found for schedule ${scheduleId}`);
      return { success: true, scheduledCount: 0 };
    }

    // Calculate when to send the reminder
    const reminderTime = new Date(nextFeedingTime.getTime() - reminderMinutesBefore * 60 * 1000);

    // Don't schedule if reminder time is in the past
    if (reminderTime <= new Date()) {
      logger.info(`Reminder time ${reminderTime.toISOString()} is in the past, skipping`);
      return { success: true, scheduledCount: 0 };
    }

    // Store notification record (use upsert to prevent duplicates)
    const firstDevice = devices[0];
    if (!firstDevice) {
      return { success: true, scheduledCount: 0 };
    }

    const notificationData = {
      userId: new Types.ObjectId(userId),
      scheduleId: new Types.ObjectId(scheduleId),
      petId: new Types.ObjectId(config.petId),
      scheduledFor: reminderTime,
      status: 'pending' as const,
      expoPushToken: firstDevice.expoPushToken,
    };

    // Use findOneAndUpdate with upsert to prevent duplicate notifications
    await FeedingNotificationModel.findOneAndUpdate(
      {
        scheduleId: notificationData.scheduleId,
        scheduledFor: reminderTime,
        status: 'pending',
      },
      notificationData,
      { upsert: true, new: true }
    );

    logger.info(`Scheduled feeding reminder for schedule ${scheduleId} at ${reminderTime.toISOString()}`);

    return { success: true, scheduledCount: 1 };
  }

  /**
   * Cancel feeding reminders for a schedule
   */
  async cancelFeedingReminders(scheduleId: string): Promise<boolean> {
    try {
      await FeedingNotificationModel.updateMany(
        { scheduleId: new Types.ObjectId(scheduleId), status: 'pending' },
        { $set: { status: 'cancelled' } }
      );

      await FeedingScheduleModel.findByIdAndUpdate(scheduleId, {
        $set: {
          nextNotificationTime: undefined,
        },
      });

      logger.info(`Cancelled feeding reminders for schedule ${scheduleId}`);
      return true;
    } catch (error) {
      logger.error(`Error cancelling feeding reminders for schedule ${scheduleId}:`, error);
      return false;
    }
  }

  /**
   * Mark feeding as completed
   */
  async markFeedingCompleted(
    scheduleId: string,
    _userId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Cancel pending reminders
      await this.cancelFeedingReminders(scheduleId);

      // Update schedule's last notification time
      await FeedingScheduleModel.findByIdAndUpdate(scheduleId, {
        $set: { lastNotificationAt: new Date() },
      });

      logger.info(`Feeding marked as completed for schedule ${scheduleId}`);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error marking feeding as completed:`, error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Send a feeding reminder notification immediately
   */
  async sendFeedingReminder(
    scheduleId: string,
    userId: string
  ): Promise<FeedingReminderResult> {
    try {
      const schedule = await FeedingScheduleModel.findById(scheduleId);
      if (!schedule) {
        return { success: false, scheduledCount: 0, error: 'Schedule not found' };
      }

      // Get pet name
      const pet = await PetModel.findById(schedule.petId);
      if (!pet) {
        return { success: false, scheduledCount: 0, error: 'Pet not found' };
      }

      // Get user's active devices
      const devices = await UserDeviceModel.find({
        userId: new Types.ObjectId(userId),
        isActive: true,
      }).select('expoPushToken').lean();

      if (devices.length === 0) {
        return { success: true, scheduledCount: 0 };
      }

      const tokens = devices.map(d => d.expoPushToken);

      // Get user's language preference
      let userLanguage = userLanguageCache.get(userId);
      if (userLanguage === undefined) {
        const userSettings = await UserSettingsModel.findOne({
          userId: new Types.ObjectId(userId),
        }).select('language').lean().exec();
        userLanguage = userSettings?.language ?? 'en';
        userLanguageCache.set(userId, userLanguage);
      }

      // Get localized messages
      const messages = getFeedingReminderMessages(userLanguage);

      // Use i18n-enabled message templates
      const title = messages.title(pet.name);
      const body = messages.body({
        petName: pet.name,
        amount: schedule.amount,
        foodType: schedule.foodType,
      });

      const result = await pushNotificationService.sendNotifications(tokens, {
        title,
        body,
        data: {
          type: 'feeding_reminder',
          screen: 'feeding',
          scheduleId,
          petId: schedule.petId.toString(),
        },
        sound: 'default',
        priority: 'high',
        channelId: 'feeding-reminders',
      });

      let sentCount = 0;
      const tokensToRemove: string[] = [];

      result.forEach((r, index) => {
        if (r.success) {
          sentCount++;
        } else if (r.shouldRemoveToken && tokens[index]) {
          tokensToRemove.push(tokens[index]);
        }
      });

      // Deactivate invalid tokens
      if (tokensToRemove.length > 0) {
        await UserDeviceModel.updateMany(
          { expoPushToken: { $in: tokensToRemove } },
          { $set: { isActive: false } }
        );
      }

      // Update schedule's last notification time
      await FeedingScheduleModel.findByIdAndUpdate(scheduleId, {
        $set: { lastNotificationAt: new Date() },
      });

      logger.info(`Feeding reminder sent for schedule ${scheduleId}: ${sentCount} notifications`);
      return { success: true, scheduledCount: sentCount };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error sending feeding reminder:`, error);
      return { success: false, scheduledCount: 0, error: errorMessage };
    }
  }

  /**
   * Get notifications for a feeding schedule
   */
  async getScheduleNotifications(
    scheduleId: string
  ): Promise<{
    pending: number;
    sent: number;
    failed: number;
    cancelled: number;
  }> {
    const counts = await FeedingNotificationModel.aggregate<{ _id: string; count: number }>([
      { $match: { scheduleId: new Types.ObjectId(scheduleId) } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    const result = {
      pending: 0,
      sent: 0,
      failed: 0,
      cancelled: 0,
    };

    counts.forEach(c => {
      result[c._id as keyof typeof result] = c.count;
    });

    return result;
  }

  /**
   * Calculate the next feeding time based on schedule time and days
   * Uses the user's timezone for accurate day calculation
   * Uses date-fns-tz for clean timezone handling
   */
  calculateNextFeedingTime(time: string, days: string, timezone = 'UTC'): Date | null {
    return calculateNextFeedingTime(time, days, timezone);
  }

  /**
   * Get all active schedules with reminders enabled
   */
  async getActiveSchedulesWithReminders(): Promise<typeof FeedingScheduleModel.prototype._id[]> {
    const schedules = await FeedingScheduleModel.find({
      isActive: true,
      remindersEnabled: true,
    }).select('_id userId petId time foodType amount days reminderMinutesBefore').lean();

    return schedules;
  }

  /**
   * Update schedule with next notification time
   */
  async updateNextNotificationTime(
    scheduleId: string,
    nextNotificationTime: Date
  ): Promise<void> {
    await FeedingScheduleModel.findByIdAndUpdate(scheduleId, {
      $set: { nextNotificationTime },
    });
  }

  /**
   * Clear the language cache (useful for testing or when language changes)
   */
  clearLanguageCache(): void {
    userLanguageCache.clear();
  }
}

// Singleton instance
export const feedingReminderService = new FeedingReminderService();
