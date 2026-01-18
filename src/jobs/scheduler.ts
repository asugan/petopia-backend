import cron, { type ScheduledTask } from 'node-cron';
import { runRecurrenceGenerator } from './recurrenceGenerator.js';
import { eventReminderService } from '../services/eventReminderService.js';
import { markMissedEvents } from './eventStatusUpdater.js';
import { checkBudgetAlerts } from './budgetAlertChecker.js';
import { checkFeedingReminders } from './feedingReminderChecker.js';
import { logger } from '../utils/logger.js';

let scheduledJobs: ScheduledTask[] = [];
let isShuttingDown = false;

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

  // Register graceful shutdown handlers
  registerGracefulShutdown();

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
    timezone: process.env.SCHEDULER_TIMEZONE ?? 'UTC',
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
    timezone: process.env.SCHEDULER_TIMEZONE ?? 'UTC',
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
    timezone: process.env.SCHEDULER_TIMEZONE ?? 'UTC',
  });
  scheduledJobs.push(missedEventJob);

  // Budget Alert Checker - Runs every hour
  // Checks budget thresholds and sends push notifications
  const budgetAlertJob = cron.schedule('0 * * * *', async () => {
    logger.info('[Scheduler] Running budget alert checker job...');
    try {
      const result = await checkBudgetAlerts();
      logger.info(`[Scheduler] Budget alert checker completed: ${result.processed} processed, ${result.sent} sent, ${result.failed} failed`);
    } catch (error) {
      logger.error('[Scheduler] Budget alert checker failed:', error);
    }
  }, {
    timezone: process.env.SCHEDULER_TIMEZONE ?? 'UTC',
  });
  scheduledJobs.push(budgetAlertJob);

  // Feeding Reminder Checker - Runs every 15 minutes
  // Checks pending feeding reminders and sends push notifications
  const feedingReminderJob = cron.schedule('*/15 * * * *', async () => {
    logger.info('[Scheduler] Running feeding reminder checker job...');
    try {
      const result = await checkFeedingReminders();
      logger.info(`[Scheduler] Feeding reminder checker completed: ${result.checked} checked, ${result.sent} sent, ${result.failed} failed, ${result.retried} retried`);
    } catch (error) {
      logger.error('[Scheduler] Feeding reminder checker failed:', error);
    }
  }, {
    timezone: process.env.SCHEDULER_TIMEZONE ?? 'UTC',
  });
  scheduledJobs.push(feedingReminderJob);

  logger.info(`Scheduler initialized with ${scheduledJobs.length} jobs`);
}

/**
 * Stop all scheduled jobs
 * Useful for testing or graceful shutdown
 */
export function stopScheduler(): void {
  if (isShuttingDown) {
    logger.warn('Scheduler is already shutting down...');
    return;
  }
  
  isShuttingDown = true;
  logger.info('Stopping job scheduler...');
  
  for (const job of scheduledJobs) {
    void job.stop();
  }
  scheduledJobs = [];
  isShuttingDown = false;
  logger.info('Scheduler stopped');
}

/**
 * Register handlers for graceful shutdown on SIGTERM and SIGINT
 */
function registerGracefulShutdown(): void {
  const shutdownHandler = (signal: string) => {
    logger.info(`Received ${signal} signal. Initiating graceful shutdown...`);
    
    stopScheduler();
    
    // Give some time for cleanup, then exit
    setTimeout(() => {
      logger.info('Graceful shutdown complete. Exiting...');
      process.exit(0);
    }, 1000);
  };

  // Handle SIGTERM (sent by container orchestrators like Docker/Kubernetes)
  process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
  
  // Handle SIGINT (Ctrl+C in terminal)
  process.on('SIGINT', () => shutdownHandler('SIGINT'));
  
  // Handle uncaught exceptions - stop scheduler before crash
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception, stopping scheduler:', error);
    stopScheduler();
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection:', reason);
  });
  
  logger.info('Graceful shutdown handlers registered');
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
    case 'budget-alert-checker': {
      const result = await checkBudgetAlerts();
      return { success: true, result };
    }
    case 'feeding-reminder-checker': {
      const result = await checkFeedingReminders();
      return { success: true, result };
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
    jobs: [
      'recurrence-generator',
      'reminder-scheduler',
      'missed-event-checker',
      'budget-alert-checker',
      'feeding-reminder-checker',
    ],
  };
}
