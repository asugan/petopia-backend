import { ScheduledNotificationModel } from '../models/mongoose/scheduledNotifications.js';
import { FeedingNotificationModel } from '../models/mongoose/feedingNotification.js';
import { logger } from '../utils/logger.js';

// How many days to keep sent notification records
const RETENTION_DAYS = 30;

export interface CleanupResult {
  deleted: number;
}

/**
 * Clean up old notification records to prevent database bloat.
 *
 * Deletes 'sent' notifications older than RETENTION_DAYS.
 * This runs daily and keeps the schedulednotifications collection manageable.
 */
export async function cleanupOldNotifications(): Promise<CleanupResult> {
  const cutoffDate = new Date(
    Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
  );

  const result = await ScheduledNotificationModel.deleteMany({
    status: 'sent',
    sentAt: { $lt: cutoffDate },
  });

  const feedingResult = await FeedingNotificationModel.deleteMany({
    status: { $in: ['sent', 'failed', 'cancelled'] },
    updatedAt: { $lt: cutoffDate },
  });

  const totalDeleted = result.deletedCount + feedingResult.deletedCount;

  if (totalDeleted > 0) {
    logger.info(
      `Cleaned up ${totalDeleted} old notification records (older than ${RETENTION_DAYS} days)`
    );
  }

  return { deleted: totalDeleted };
}
