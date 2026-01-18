import cron, { type ScheduledTask } from 'node-cron';
import { runRecurrenceGenerator } from './recurrenceGenerator.js';
import { eventReminderService } from '../services/eventReminderService.js';
import { markMissedEvents } from './eventStatusUpdater.js';
import { logger } from '../utils/logger.js';

let scheduledJobs: ScheduledTask[] = [];

/**
 * Initialize all scheduled jobs
 * This should be called once when the application starts
 */
export function initializeScheduler(): void {
  // Prevent duplicate initialization
  if (scheduledJobs.length > 0) {
    logger.warn('Scheduler already initialized, skipping...');
    return;
  }

  logger.info('Initializing job scheduler...');

  // Recurrence Generator - Runs daily at 2:00 AM
  const recurrenceJob = cron.schedule('0 2 * * *', async () => {
    logger.info('[Scheduler] Running recurrence generator job...');
    try {
      const result = await runRecurrenceGenerator();
      logger.info(`[Scheduler] Recurrence generator completed: ${result.rulesProcessed} rules processed, ${result.eventsCreated} events created`);
    } catch (error) {
      logger.error('[Scheduler] Recurrence generator failed:', error);
    }
  }, {
    timezone: process.env.SCHEDULER_TIMEZONE || 'UTC',
  });
  scheduledJobs.push(recurrenceJob);

  // Reminder Scheduler - Runs every 15 minutes
  // Schedules push notifications for upcoming events
  const reminderJob = cron.schedule('*/15 * * * *', async () => {
    logger.info('[Scheduler] Running reminder scheduler job...');
    try {
      const result = await eventReminderService.scheduleAllUpcomingReminders();
      logger.info(`[Scheduler] Reminder scheduler completed: ${result.eventsProcessed} events, ${result.remindersScheduled} reminders`);
    } catch (error) {
      logger.error('[Scheduler] Reminder scheduler failed:', error);
    }
  }, {
    timezone: process.env.SCHEDULER_TIMEZONE || 'UTC',
  });
  scheduledJobs.push(reminderJob);

  // Missed Event Checker - Runs every 15 minutes
  // Marks events as missed if their start time has passed
  const missedEventJob = cron.schedule('*/15 * * * *', async () => {
    logger.info('[Scheduler] Running missed event checker job...');
    try {
      const count = await markMissedEvents();
      if (count > 0) {
        logger.info(`[Scheduler] Marked ${count} events as missed`);
      }
    } catch (error) {
      logger.error('[Scheduler] Missed event checker failed:', error);
    }
  }, {
    timezone: process.env.SCHEDULER_TIMEZONE || 'UTC',
  });
  scheduledJobs.push(missedEventJob);

  logger.info(`Scheduler initialized with ${scheduledJobs.length} jobs`);
}

/**
 * Stop all scheduled jobs
 * Useful for testing or graceful shutdown
 */
export function stopScheduler(): void {
  logger.info('Stopping job scheduler...');
  for (const job of scheduledJobs) {
    job.stop();
  }
  scheduledJobs = [];
  logger.info('Scheduler stopped');
}

/**
 * Run a specific job manually
 */
export async function runJob(jobName: string): Promise<{ success: boolean; result?: unknown; error?: string }> {
  switch (jobName) {
    case 'recurrence-generator': {
      const result = await runRecurrenceGenerator();
      return { success: true, result };
    }
    case 'reminder-scheduler': {
      const result = await eventReminderService.scheduleAllUpcomingReminders();
      return { success: true, result };
    }
    case 'missed-event-checker': {
      const count = await markMissedEvents();
      return { success: true, result: { missedEventsMarked: count } };
    }
    default:
      return { success: false, error: `Unknown job: ${jobName}` };
  }
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus(): {
  isRunning: boolean;
  jobsCount: number;
  jobs: string[];
} {
  return {
    isRunning: scheduledJobs.length > 0,
    jobsCount: scheduledJobs.length,
    jobs: ['recurrence-generator', 'reminder-scheduler', 'missed-event-checker'],
  };
}
