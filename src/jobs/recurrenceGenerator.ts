/**
 * Recurrence Generator Job
 * 
 * This job generates future events for all active recurrence rules.
 * It should be run daily via a cron scheduler (e.g., node-cron, AWS EventBridge, etc.)
 * 
 * Usage:
 * - Import and call runRecurrenceGenerator() from your scheduler
 * - Or call the /api/recurrence-rules/generate-all endpoint
 */

import { RecurrenceService } from '../services/recurrenceService';

// Simple mutex to prevent concurrent runs
let isRunning = false;

/**
 * Run the recurrence generator job
 * Generates events for all active recurrence rules up to their horizon
 */
export async function runRecurrenceGenerator(): Promise<{
  success: boolean;
  rulesProcessed: number;
  eventsCreated: number;
  error?: string;
}> {
  if (isRunning) {
    console.log('[RecurrenceGenerator] Job already running, skipping...');
    return {
      success: false,
      rulesProcessed: 0,
      eventsCreated: 0,
      error: 'Job already running',
    };
  }

  isRunning = true;
  const startTime = Date.now();

  console.log('[RecurrenceGenerator] Starting job...');

  try {
    const recurrenceService = new RecurrenceService();
    const result = await recurrenceService.generateEventsForAllActiveRules();

    const duration = Date.now() - startTime;
    console.log(
      `[RecurrenceGenerator] Completed in ${duration}ms. ` +
      `Rules processed: ${result.rulesProcessed}, Events created: ${result.eventsCreated}`
    );

    return {
      success: true,
      rulesProcessed: result.rulesProcessed,
      eventsCreated: result.eventsCreated,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[RecurrenceGenerator] Job failed:', errorMessage);

    return {
      success: false,
      rulesProcessed: 0,
      eventsCreated: 0,
      error: errorMessage,
    };
  } finally {
    isRunning = false;
  }
}

/**
 * Schedule the recurrence generator to run daily
 * Note: This is a simple implementation. For production, consider using:
 * - node-cron
 * - Bull/BullMQ
 * - AWS EventBridge
 * - Cloud Scheduler
 */
export function scheduleRecurrenceGenerator(intervalMs: number = 24 * 60 * 60 * 1000): NodeJS.Timeout {
  console.log(`[RecurrenceGenerator] Scheduling job to run every ${intervalMs / 1000 / 60 / 60} hours`);
  
  // Run immediately on startup
  void runRecurrenceGenerator();
  
  // Then run on interval
  return setInterval(() => {
    void runRecurrenceGenerator();
  }, intervalMs);
}
