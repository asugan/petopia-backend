import { Types } from 'mongoose';
import { feedingReminderService } from '../services/feedingReminderService.js';
import { FeedingNotificationModel, FeedingScheduleModel, PetModel, UserDeviceModel, UserSettingsModel } from '../models/mongoose/index.js';
import { pushNotificationService } from '../services/pushNotificationService.js';
import { getFeedingReminderMessages } from '../config/notificationMessages.js';
import { logger } from '../utils/logger.js';

// Configurable batch limit from environment
const BATCH_LIMIT = parseInt(process.env.FEEDING_REMINDER_BATCH_LIMIT ?? '100', 10);

// Max retry attempts for failed notifications
const MAX_RETRY_ATTEMPTS = parseInt(process.env.FEEDING_REMINDER_MAX_RETRIES ?? '3', 10);

// Cache for user languages to avoid repeated DB queries during batch processing
const userLanguageCache = new Map<string, string>();

interface FeedingScheduleForReminder {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  petId: Types.ObjectId;
  time: string;
  foodType: string;
  amount: string;
  days: string;
  reminderMinutesBefore?: number;
}

interface IFeedingScheduleDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  petId: Types.ObjectId;
  time: string;
  foodType: string;
  amount: string;
  days: string;
  isActive: boolean;
  remindersEnabled?: boolean;
  reminderMinutesBefore?: number;
}

interface IPetDoc {
  _id: Types.ObjectId;
  name: string;
}

/**
 * Check and send feeding reminders for upcoming schedules
 */
export async function checkFeedingReminders(): Promise<{
  checked: number;
  sent: number;
  failed: number;
  retried: number;
}> {
  logger.info('[Feeding Reminder Checker] Starting feeding reminder check...');

  try {
    const now = new Date();

    // Find all pending notifications that are due, with configurable batch limit
    const pendingNotifications = await FeedingNotificationModel.find({
      status: 'pending',
      scheduledFor: { $lte: now },
    })
      .limit(BATCH_LIMIT)
      .lean();

    if (pendingNotifications.length === 0) {
      logger.info('[Feeding Reminder Checker] No pending notifications found');
      return { checked: 0, sent: 0, failed: 0, retried: 0 };
    }

    // Clear language cache at the start of batch processing
    userLanguageCache.clear();

    // Batch fetch all schedules and pets to avoid N+1 queries
    const scheduleIds = [...new Set(pendingNotifications.map(n => n.scheduleId.toString()))];
    const schedules = await FeedingScheduleModel.find({ _id: { $in: scheduleIds } }).lean() as IFeedingScheduleDoc[];
    const scheduleMap = new Map(schedules.map(s => [s._id.toString(), s]));

    const petIds = [...new Set(schedules.map(s => s.petId.toString()))];
    const pets = await PetModel.find({ _id: { $in: petIds } }).lean() as IPetDoc[];
    const petMap = new Map(pets.map(p => [p._id.toString(), p]));

    let sent = 0;
    let failed = 0;
    let retried = 0;
    let checked = 0;

    for (const notification of pendingNotifications) {
      try {
        checked++;

        // Get retry count from notification
        const retryCount = (notification as { retryCount?: number }).retryCount ?? 0;

        // Get the schedule from pre-fetched map
        const schedule = scheduleMap.get(notification.scheduleId.toString());
        if (!schedule || !schedule.isActive || !schedule.remindersEnabled) {
          await FeedingNotificationModel.findByIdAndUpdate(notification._id, {
            $set: { status: 'cancelled' },
          });
          continue;
        }

        // Get the pet name from pre-fetched map
        const pet = petMap.get(schedule.petId.toString());
        if (!pet) {
          await FeedingNotificationModel.findByIdAndUpdate(notification._id, {
            $set: { status: 'failed', errorMessage: 'Pet not found' },
          });
          failed++;
          continue;
        }

        // Get user's language preference
        const userId = notification.userId.toString();
        let userLanguage = userLanguageCache.get(userId);
        if (userLanguage === undefined) {
          const userSettings = await UserSettingsModel.findOne({
            userId: notification.userId,
          }).select('language').lean().exec();
          userLanguage = userSettings?.language ?? 'en';
          userLanguageCache.set(userId, userLanguage);
        }

        // Get localized messages
        const messages = getFeedingReminderMessages(userLanguage);

        // Send the notification using i18n-enabled message templates
        const result = await pushNotificationService.sendToUser(userId, {
          title: messages.title(pet.name),
          body: messages.body({
            petName: pet.name,
            amount: schedule.amount,
            foodType: schedule.foodType,
          }),
          data: {
            type: 'feeding_reminder',
            screen: 'feeding',
            scheduleId: schedule._id.toString(),
            petId: schedule.petId.toString(),
          },
          sound: 'default',
          priority: 'high',
          channelId: 'feeding-reminders',
        });

        if (result.sent > 0) {
          // Update notification status
          await FeedingNotificationModel.findByIdAndUpdate(notification._id, {
            $set: {
              status: 'sent',
              sentAt: new Date(),
              notificationId: `feeding-${notification._id.toString()}`,
            },
          });

          // Update schedule's last notification time
          await FeedingScheduleModel.findByIdAndUpdate(notification.scheduleId, {
            $set: { lastNotificationAt: now },
          });

          sent += result.sent;

          // Schedule next reminder for this schedule
          await scheduleNextReminder(schedule as FeedingScheduleForReminder);
        } else if (retryCount < MAX_RETRY_ATTEMPTS) {
          // Retry logic: increment retry count and reschedule
          await FeedingNotificationModel.findByIdAndUpdate(notification._id, {
            $inc: { retryCount: 1 },
            $set: { status: 'pending' },
          });
          retried++;
        } else {
          await FeedingNotificationModel.findByIdAndUpdate(notification._id, {
            $set: { status: 'failed', errorMessage: 'Max retries exceeded' },
          });
          failed++;
        }

        // Handle invalid tokens
        if (result.tokensToRemove.length > 0) {
          await UserDeviceModel.updateMany(
            { expoPushToken: { $in: result.tokensToRemove } },
            { $set: { isActive: false } }
          );
        }

      } catch (error) {
        logger.error(`Error processing feeding notification ${notification._id.toString()}:`, error);
        await FeedingNotificationModel.findByIdAndUpdate(notification._id, {
          $set: { status: 'failed', errorMessage: String(error) },
        });
        failed++;
      }
    }

    logger.info(`[Feeding Reminder Checker] Completed: ${checked} checked, ${sent} sent, ${failed} failed, ${retried} retried`);
    return { checked, sent, failed, retried };

  } catch (error) {
    logger.error('[Feeding Reminder Checker] Error during feeding reminder check:', error);
    throw error;
  }
}

/**
 * Schedule the next reminder for a feeding schedule
 */
async function scheduleNextReminder(schedule: FeedingScheduleForReminder): Promise<void> {
  // Get user's timezone from settings
  let timezone = 'UTC';
  try {
    const settings = await UserSettingsModel.findOne({ userId: schedule.userId }).exec();
    timezone = settings?.timezone ?? 'UTC';
  } catch {
    timezone = 'UTC';
  }

  const nextFeedingTime = feedingReminderService.calculateNextFeedingTime(
    schedule.time,
    schedule.days,
    timezone
  );

  if (!nextFeedingTime) {
    return;
  }

  const reminderMinutesBefore = schedule.reminderMinutesBefore ?? 15;
  const nextNotificationTime = new Date(nextFeedingTime.getTime() - reminderMinutesBefore * 60 * 1000);

  // Don't schedule if notification time is in the past
  if (nextNotificationTime <= new Date()) {
    return;
  }

  // Get user's active devices
  const devices = await UserDeviceModel.find({
    userId: schedule.userId,
    isActive: true,
  }).select('expoPushToken').lean();

  if (devices.length === 0) {
    return;
  }

  // Create new notification record (use upsert to prevent duplicates)
  const firstDevice = devices[0];
  if (!firstDevice) {
    return;
  }

  await FeedingNotificationModel.findOneAndUpdate(
    {
      scheduleId: schedule._id,
      scheduledFor: nextNotificationTime,
      status: 'pending',
    },
    {
      userId: schedule.userId,
      scheduleId: schedule._id,
      petId: schedule.petId,
      scheduledFor: nextNotificationTime,
      status: 'pending',
      expoPushToken: firstDevice.expoPushToken,
    },
    { upsert: true, new: true }
  );

  // Update schedule's next notification time
  await FeedingScheduleModel.findByIdAndUpdate(schedule._id, {
    $set: { nextNotificationTime },
  });

  logger.info(`Scheduled next feeding reminder for schedule ${schedule._id.toString()} at ${nextNotificationTime.toISOString()}`);
}
