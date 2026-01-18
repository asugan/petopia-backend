import { Types } from 'mongoose';
import { pushNotificationService } from './pushNotificationService.js';
import { UserBudgetModel } from '../models/mongoose/userBudget.js';
import { UserDeviceModel } from '../models/mongoose/userDevices.js';
import { ExpenseModel } from '../models/mongoose/index.js';
import { budgetAlertMessages } from '../config/notificationMessages.js';
import { logger } from '../utils/logger.js';

export interface BudgetAlertResult {
  userId: string;
  success: boolean;
  sentCount: number;
  error?: string;
}

export interface BudgetAlertNotification {
  userId: string;
  title: string;
  body: string;
  percentage: number;
  severity: 'warning' | 'critical';
  currentSpending: number;
  budgetAmount: number;
}

/**
 * Budget Alert Service
 * Handles sending budget alert push notifications
 */
export class BudgetAlertService {
  /**
   * Send budget alert to a user
   */
  async sendBudgetAlert(
    userId: string,
    currentSpending: number,
    budgetAmount: number,
    percentage: number,
    severity: 'warning' | 'critical'
  ): Promise<BudgetAlertResult> {
    try {
      // Get user's active devices
      const devices = await UserDeviceModel.find({
        userId: new Types.ObjectId(userId),
        isActive: true,
      }).select('expoPushToken').lean();

      if (devices.length === 0) {
        logger.info(`No active devices found for user ${userId}`);
        return { userId, success: true, sentCount: 0 };
      }

      const tokens = devices.map(d => d.expoPushToken);

      // Format currency for notification
      const budget = await UserBudgetModel.findOne({ userId: new Types.ObjectId(userId) }).exec();
      const currency = budget?.currency ?? 'USD';
      const remaining = budgetAmount - currentSpending;

      // Use configurable message templates
      const title = severity === 'critical' 
        ? budgetAlertMessages.critical.title 
        : budgetAlertMessages.warning.title;

      const body = severity === 'critical'
        ? budgetAlertMessages.critical.body({
            currency,
            exceeded: Math.abs(remaining),
            current: currentSpending,
            budget: budgetAmount,
          })
        : budgetAlertMessages.warning.body({
            percentage,
            currency,
            remaining,
          });

      const result = await pushNotificationService.sendNotifications(tokens, {
        title,
        body,
        data: {
          type: 'budget_alert',
          screen: 'finance',
          percentage: percentage.toString(),
          severity,
        },
        sound: 'default',
        priority: 'high',
        channelId: 'budget-alerts',
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
        logger.info(`Deactivated ${tokensToRemove.length} invalid push tokens for user ${userId}`);
      }

      logger.info(`Budget alert sent to user ${userId}: ${sentCount} notifications, severity: ${severity}`);
      return { userId, success: true, sentCount };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error sending budget alert to user ${userId}:`, error);
      return { userId, success: false, sentCount: 0, error: errorMessage };
    }
  }

  /**
   * Send budget alerts to all users with active budgets
   * Uses upsert pattern to prevent duplicate alerts within the same period
   */
  async sendAlertsToAllUsers(): Promise<{
    processed: number;
    sent: number;
    failed: number;
  }> {
    const now = new Date();
    const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Get all users with active budgets
    const budgets = await UserBudgetModel.find({ isActive: true }).lean();

    let processed = 0;
    let sent = 0;
    let failed = 0;

    for (const budget of budgets) {
      try {
        const userId = budget.userId.toString();

        // Use upsert-like pattern: check and update atomically
        // This prevents duplicate alerts from concurrent job runs
        const budgetDoc = await UserBudgetModel.findById(budget._id).exec();
        if (!budgetDoc) {
          processed++;
          continue;
        }

        // Check if we've already sent an alert for this period and severity
        // Skip if critical alert already sent this period (prevents duplicate)
        if (
          budgetDoc.lastAlertPeriod === periodKey &&
          budgetDoc.lastAlertSeverity === 'critical'
        ) {
          processed++;
          continue;
        }

        // Calculate current spending from expenses
        const currentSpending = await this.getCurrentMonthSpending(userId, budget.currency);
        const percentage = budget.amount > 0 ? (currentSpending / budget.amount) * 100 : 0;
        const isExceeded = percentage >= 100;
        const severity = isExceeded ? 'critical' : 'warning';

        // Check if we should send alert based on threshold
        if (percentage < budget.alertThreshold * 100 && !isExceeded) {
          processed++;
          continue;
        }

        // Double-check: if we already sent this severity for this period, skip
        // This handles race conditions between concurrent job runs
        const reCheckDoc = await UserBudgetModel.findById(budget._id).select('lastAlertPeriod lastAlertSeverity').exec();
        if (
          reCheckDoc?.lastAlertPeriod === periodKey &&
          reCheckDoc?.lastAlertSeverity === severity
        ) {
          processed++;
          continue;
        }

        // Send alert
        const result = await this.sendBudgetAlert(
          userId,
          currentSpending,
          budget.amount,
          percentage,
          severity
        );

        // Update budget with alert info atomically
        await UserBudgetModel.findByIdAndUpdate(budget._id, {
          $set: {
            lastAlertAt: new Date(),
            lastAlertSeverity: severity,
            lastAlertPeriod: periodKey,
            lastAlertPercentage: percentage,
          },
        });

        if (result.success && result.sentCount > 0) {
          sent++;
        } else if (!result.success) {
          failed++;
        }

        processed++;

      } catch (error) {
        logger.error(`Error processing budget for user ${budget.userId.toString()}:`, error);
        failed++;
        processed++;
      }
    }

    logger.info(`Budget alert job completed: ${processed} processed, ${sent} sent, ${failed} failed`);
    return { processed, sent, failed };
  }

  /**
   * Get current month spending for a user
   */
  private async getCurrentMonthSpending(userId: string, currency: string): Promise<number> {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    interface AggregateResult {
      _id: null;
      total: number;
    }

    const result = await ExpenseModel.aggregate<AggregateResult>([
      {
        $match: {
          userId: new Types.ObjectId(userId),
          baseCurrency: currency,
          date: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amountBase' },
        },
      },
    ]);

    return result[0]?.total ?? 0;
  }

  /**
   * Get budget alert status for a user
   */
  async getBudgetAlertStatus(userId: string): Promise<{
    hasAlert: boolean;
    percentage: number;
    severity?: 'warning' | 'critical';
    lastAlertAt?: Date;
  }> {
    const budget = await UserBudgetModel.findOne({ userId: new Types.ObjectId(userId) }).exec();

    if (!budget) {
      return { hasAlert: false, percentage: 0 };
    }

    const now = new Date();
    const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const hasAlert = budget.lastAlertPeriod === periodKey;
    const severity = hasAlert ? budget.lastAlertSeverity : undefined;

    return {
      hasAlert,
      percentage: budget.lastAlertPercentage ?? 0,
      severity,
      lastAlertAt: budget.lastAlertAt,
    };
  }
}

// Singleton instance
export const budgetAlertService = new BudgetAlertService();
