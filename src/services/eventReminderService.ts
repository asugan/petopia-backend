import { Types } from 'mongoose';
import { pushNotificationService } from './pushNotificationService.js';
import { ScheduledNotificationModel } from '../models/mongoose/scheduledNotifications.js';
import { EventModel, UserSettingsModel } from '../models/mongoose/index.js';
import { logger } from '../utils/logger.js';
import { formatInTimeZone } from 'date-fns-tz';
import { getEventReminderMessages } from '../config/notificationMessages.js';

// Pagination settings for batch processing
const BATCH_SIZE = 100; // Process 100 events at a time

// Default timezone if user settings not available
const DEFAULT_TIMEZONE = 'UTC';

// Cache for user languages to avoid repeated DB queries
const userLanguageCache = new Map<string, string>();

export interface EventReminderConfig {
  eventId: string;
  userId: string;
  title: string;
  eventType: string;
  eventTitle: string;
  startTime: Date;
  petName?: string;
  reminderMinutes: number[];
  timezone: string;
}

export interface EventReminderResult {
  success: boolean;
  scheduledCount: number;
  error?: string;
}

/**
 * Event Reminder Service
 * Handles scheduling and managing event reminder notifications
 */
export class EventReminderService {
  /**
   * Schedule reminders for an event
   *
   * This function checks if a notification has already been sent for each reminder
   * to prevent duplicate notifications when the scheduler runs repeatedly.
   */
  async scheduleReminders(
    config: EventReminderConfig
  ): Promise<EventReminderResult> {
    const {
      eventId,
      userId,
      eventType,
      eventTitle,
      startTime,
      petName,
      reminderMinutes,
      timezone,
    } = config;

    // Get user's active devices
    const devices = await pushNotificationService.getUserActiveDevices(userId);

    if (devices.length === 0) {
      logger.info(`No active devices for user ${userId}, skipping reminders`);
      return { success: true, scheduledCount: 0 };
    }

    // Get user's language preference
    let userLanguage = userLanguageCache.get(userId);
    if (userLanguage === undefined) {
      const userSettings = await UserSettingsModel.findOne({
        userId: new Types.ObjectId(userId),
      })
        .select('language')
        .lean()
        .exec();
      userLanguage = userSettings?.language ?? 'en';
      userLanguageCache.set(userId, userLanguage);
    }

    // Get localized messages
    const messages = getEventReminderMessages(userLanguage);

    let scheduledCount = 0;
    const now = new Date();

    // Grace window: How long after triggerTime we still send the notification
    // This handles scheduler delays and ensures notifications aren't missed
    // Set to 30 min (2x scheduler period) to allow recovery if one scheduler run is missed
    const GRACE_WINDOW_MS = 30 * 60 * 1000;

    for (const minutes of reminderMinutes) {
      const triggerTime = new Date(startTime.getTime() - minutes * 60 * 1000);

      // Check if trigger time has arrived
      const triggerTimePassed = now.getTime() >= triggerTime.getTime();

      // Check if we're still within the grace window (not too late)
      const timeSinceTrigger = now.getTime() - triggerTime.getTime();
      const withinGraceWindow = timeSinceTrigger <= GRACE_WINDOW_MS;

      // Only send if:
      // 1. Trigger time has passed (it's time to send)
      // 2. We're still within grace window (not too late)
      if (!triggerTimePassed || !withinGraceWindow) {
        continue;
      }

      // Check if this specific reminder has already been sent
      // This prevents duplicate notifications when scheduler runs repeatedly
      const notificationId = `reminder-${eventId}-${minutes}`;
      const existingNotification = await ScheduledNotificationModel.findOne({
        eventId: new Types.ObjectId(eventId),
        notificationId,
        status: 'sent',
      })
        .lean()
        .exec();

      if (existingNotification) {
        // Already sent this reminder, skip
        continue;
      }

      // Format notification content with i18n
      const emoji = this.getEventTypeEmoji(eventType);
      const formattedDate = formatInTimeZone(
        startTime,
        timezone,
        'MMM d, HH:mm'
      );

      const notificationTitle = messages.getTitle(emoji, petName, eventTitle);
      const timeOffset = messages.getTimeOffset(minutes);
      const notificationBody = `${formattedDate} (${timeOffset})`;

      // Send to all user devices
      const result = await pushNotificationService.sendToUser(userId, {
        title: notificationTitle,
        body: notificationBody,
        data: {
          eventId,
          screen: 'event',
          eventType,
        },
        sound: 'default',
        priority: 'high',
        channelId: 'event-reminders',
      });

      // Store notification record for tracking
      if (result.sent > 0) {
        try {
          await ScheduledNotificationModel.create({
            userId: new Types.ObjectId(userId),
            eventId: new Types.ObjectId(eventId),
            expoPushToken: devices[0], // Primary token for reference
            scheduledFor: triggerTime,
            sentAt: new Date(),
            status: 'sent',
            notificationId,
          });

          scheduledCount += result.sent;
        } catch (error: unknown) {
          // Handle duplicate key error (E11000) from unique index
          // This happens if another scheduler instance already created this notification
          if (
            error instanceof Error &&
            'code' in error &&
            (error as { code: number }).code === 11000
          ) {
            logger.debug(
              `Duplicate notification skipped (race condition prevented): ${notificationId}`
            );
            continue;
          }
          throw error;
        }
      }

      // Handle failed tokens
      if (result.tokensToRemove.length > 0) {
        logger.warn(
          `Removing ${result.tokensToRemove.length} invalid tokens for user ${userId}`
        );
      }
    }

    // Update event with scheduled notification IDs
    if (scheduledCount > 0) {
      await EventModel.findByIdAndUpdate(eventId, {
        $set: {
          scheduledNotificationIds: reminderMinutes.map(
            m => `reminder-${eventId}-${m}`
          ),
        },
      });
    }

    logger.info(`Scheduled ${scheduledCount} reminders for event ${eventId}`);
    return { success: true, scheduledCount };
  }

  /**
   * Cancel/reset reminders for an event
   *
   * This deletes all notification records for the event, allowing new reminders
   * to be scheduled when the event is updated (e.g., time changed).
   *
   * Note: Since notifications are sent immediately (not scheduled for future),
   * we delete the records rather than just marking them cancelled. This ensures
   * that if an event's time is updated, new reminders can be sent.
   */
  async cancelReminders(eventId: string): Promise<boolean> {
    try {
      // Delete all notification records for this event
      // This allows new reminders to be scheduled if event is updated
      await ScheduledNotificationModel.deleteMany({
        eventId: new Types.ObjectId(eventId),
      });

      await EventModel.findByIdAndUpdate(eventId, {
        $set: { scheduledNotificationIds: [] },
      });

      logger.info(`Cancelled/reset reminders for event ${eventId}`);
      return true;
    } catch (error) {
      logger.error(`Error cancelling reminders for event ${eventId}:`, error);
      return false;
    }
  }

  /**
   * Schedule reminders for all upcoming events with reminders enabled
   * Uses cursor-based pagination to handle large datasets efficiently
   */
  async scheduleAllUpcomingReminders(): Promise<{
    eventsProcessed: number;
    remindersScheduled: number;
  }> {
    const now = new Date();
    const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    let eventsProcessed = 0;
    let remindersScheduled = 0;
    let lastId: Types.ObjectId | null = null;
    let hasMore = true;

    // Cache for user timezones to avoid repeated DB queries
    const userTimezoneCache = new Map<string, string>();

    // Clear language cache at the start of batch processing
    userLanguageCache.clear();

    // Base query for upcoming events with reminders
    const baseQuery = {
      reminder: true,
      status: 'upcoming',
      startTime: { $gte: now, $lte: sevenDaysLater },
    };

    while (hasMore) {
      // Build cursor-based query
      const query: Record<string, unknown> = lastId
        ? { ...baseQuery, _id: { $gt: lastId } }
        : { ...baseQuery };

      // Fetch batch of events
      const events = await EventModel.find(query)
        .sort({ _id: 1 })
        .limit(BATCH_SIZE)
        .populate('petId', 'name')
        .lean()
        .exec();

      if (events.length === 0) {
        hasMore = false;
        break;
      }

      // Process batch
      for (const event of events) {
        try {
          const userIdStr = event.userId.toString();

          // Get user's timezone from cache or fetch from settings
          let timezone = userTimezoneCache.get(userIdStr);
          if (timezone === undefined) {
            const userSettings = await UserSettingsModel.findOne({
              userId: event.userId,
            })
              .select('timezone')
              .lean()
              .exec();
            timezone = userSettings?.timezone ?? DEFAULT_TIMEZONE;
            userTimezoneCache.set(userIdStr, timezone);
          }

          // Get reminder minutes based on preset
          const reminderMinutes = this.getReminderMinutesForPreset(
            event.reminderPreset ?? 'standard'
          );

          // Get pet name if available
          let petName: string | undefined;
          if (
            event.petId &&
            typeof event.petId === 'object' &&
            'name' in event.petId
          ) {
            petName = (event.petId as { name: string }).name;
          }

          const result = await this.scheduleReminders({
            eventId: event._id.toString(),
            userId: userIdStr,
            title: event.title,
            eventType: event.type,
            eventTitle: event.title,
            startTime: new Date(event.startTime),
            petName,
            reminderMinutes,
            timezone,
          });

          if (result.success) {
            remindersScheduled += result.scheduledCount;
          }
          eventsProcessed++;
        } catch (error) {
          logger.error(
            `Error scheduling reminders for event ${event._id.toString()}:`,
            error
          );
        }
      }

      // Update cursor for next batch
      const lastEvent = events[events.length - 1];
      if (lastEvent) {
        lastId = lastEvent._id;
      }

      // Check if we got less than batch size (no more results)
      if (events.length < BATCH_SIZE) {
        hasMore = false;
      }

      logger.info(
        `Processed batch of ${events.length} events (total: ${eventsProcessed})`
      );
    }

    logger.info(
      `Processed ${eventsProcessed} events, scheduled ${remindersScheduled} reminders`
    );
    return { eventsProcessed, remindersScheduled };
  }

  /**
   * Check for missed events (startTime passed but status still upcoming)
   */
  async markMissedEvents(): Promise<number> {
    const now = new Date();

    const result = await EventModel.updateMany(
      {
        status: 'upcoming',
        startTime: { $lt: now },
      },
      {
        $set: { status: 'missed' },
      }
    );

    if (result.modifiedCount > 0) {
      logger.info(`Marked ${result.modifiedCount} events as missed`);
    }

    return result.modifiedCount;
  }

  /**
   * Get reminder minutes for a preset
   */
  private getReminderMinutesForPreset(preset: string): number[] {
    const presets: Record<string, number[]> = {
      standard: [1440, 120, 60, 15],
      compact: [60, 15],
      minimal: [15],
    };

    const result = presets[preset];
    return result ?? presets.standard ?? [1440, 120, 60, 15];
  }

  /**
   * Get emoji for event type
   */
  private getEventTypeEmoji(eventType: string): string {
    const emojiMap: Record<string, string> = {
      feeding: '🍽️',
      exercise: '🏃',
      grooming: '✂️',
      play: '🎾',
      training: '🎓',
      vet_visit: '🏥',
      walk: '🚶',
      bath: '🛁',
      vaccination: '💉',
      medication: '💊',
      other: '📅',
    };

    return emojiMap[eventType] ?? '📅';
  }
}

// Singleton instance
export const eventReminderService = new EventReminderService();
