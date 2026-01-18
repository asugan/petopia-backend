import { budgetAlertService } from '../services/budgetAlertService.js';
import { logger } from '../utils/logger.js';

/**
 * Check and send budget alerts for all users
 */
export async function checkBudgetAlerts(): Promise<{
  processed: number;
  sent: number;
  failed: number;
}> {
  logger.info('[Budget Alert Checker] Starting budget alert check...');
  
  try {
    const result = await budgetAlertService.sendAlertsToAllUsers();
    logger.info(`[Budget Alert Checker] Completed: ${result.processed} processed, ${result.sent} sent, ${result.failed} failed`);
    return result;
  } catch (error) {
    logger.error('[Budget Alert Checker] Error during budget alert check:', error);
    throw error;
  }
}
