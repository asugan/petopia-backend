import { ScheduledNotificationModel } from '../models/mongoose/scheduledNotifications.js';
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

  if (result.deletedCount > 0) {
    logger.info(
      `Cleaned up ${result.deletedCount} old notification records (older than ${RETENTION_DAYS} days)`
    );
  }

  return { deleted: result.deletedCount };
}
