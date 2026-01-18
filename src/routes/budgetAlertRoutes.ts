import { Response, Router } from 'express';
import { Types } from 'mongoose';
import { AuthenticatedRequest, authMiddleware } from '../middleware/auth';
import { budgetAlertService } from '../services/budgetAlertService.js';
import { userBudgetService } from '../services/userBudgetService.js';
import { UserBudgetModel } from '../models/mongoose/index.js';
import { logger } from '../utils/logger.js';

const router = Router({ mergeParams: true });

// Apply authentication middleware to all routes
router.use(authMiddleware);

// POST /api/budget/alerts/check - Manually trigger budget alert check for current user only
router.post('/check', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
      return;
    }

    // Check and send alert for the specific user only (not all users)
    const alert = await userBudgetService.checkBudgetAlert(userId);

    if (!alert) {
      res.json({
        success: true,
        data: {
          checked: true,
          sent: false,
          message: 'No budget found or alert not needed',
        },
      });
      return;
    }

    if (!alert.notificationPayload) {
      res.json({
        success: true,
        data: {
          checked: true,
          sent: false,
          percentage: alert.percentage,
          message: 'Alert threshold not reached',
        },
      });
      return;
    }

    // Send the notification for this user only
    const result = await budgetAlertService.sendBudgetAlert(
      userId,
      alert.currentSpending,
      alert.budget.amount,
      alert.percentage,
      alert.notificationPayload.severity
    );

    res.json({
      success: true,
      data: {
        checked: true,
        sent: result.sentCount > 0,
        sentCount: result.sentCount,
        percentage: alert.percentage,
        severity: alert.notificationPayload.severity,
      },
    });
  } catch (error) {
    logger.error('Error checking budget alerts:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to check budget alerts' } });
  }
});

// POST /api/budget/alerts/notify - Send notification for current user's budget alert
router.post('/notify', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
      return;
    }

    // Check and send alert for the specific user
    const alert = await userBudgetService.checkBudgetAlert(userId);

    if (!alert) {
      res.json({
        success: true,
        data: {
          sent: false,
          message: 'No alert needed at this time',
        },
      });
      return;
    }

    if (!alert.notificationPayload) {
      res.json({
        success: true,
        data: {
          sent: false,
          message: 'Alert threshold not reached',
        },
      });
      return;
    }

    // Send the notification
    const result = await budgetAlertService.sendBudgetAlert(
      userId,
      alert.currentSpending,
      alert.budget.amount,
      alert.percentage,
      alert.notificationPayload.severity
    );

    res.json({
      success: true,
      data: {
        sent: result.sentCount > 0,
        sentCount: result.sentCount,
        notificationPayload: alert.notificationPayload,
      },
    });
  } catch (error) {
    logger.error('Error sending budget alert notification:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to send budget alert notification' } });
  }
});

// GET /api/budget/alerts/status - Get budget alert status for current user
router.get('/status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
      return;
    }

    const status = await budgetAlertService.getBudgetAlertStatus(userId);
    res.json({ success: true, data: status });
  } catch (error) {
    logger.error('Error getting budget alert status:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get budget alert status' } });
  }
});

// GET /api/budget/alerts/history - Get budget alert history for current user
router.get('/history', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
      return;
    }

    const budget = await UserBudgetModel.findOne({ userId: new Types.ObjectId(userId) })
      .select('lastAlertAt lastAlertSeverity lastAlertPeriod lastAlertPercentage')
      .lean();

    res.json({
      success: true,
      data: {
        lastAlertAt: budget?.lastAlertAt,
        lastAlertSeverity: budget?.lastAlertSeverity,
        lastAlertPeriod: budget?.lastAlertPeriod,
        lastAlertPercentage: budget?.lastAlertPercentage,
      },
    });
  } catch (error) {
    logger.error('Error getting budget alert history:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get budget alert history' } });
  }
});

export default router;
