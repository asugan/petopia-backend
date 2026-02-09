import { Router } from 'express';
import { UserBudgetController } from '../controllers/userBudgetController';
import { validateRequest } from '../middleware/validation';
import { authMiddleware } from '../middleware/auth';
import { z } from 'zod';

const router = Router({ mergeParams: true });
const userBudgetController = new UserBudgetController();

// Validation schemas
const setUserBudgetSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  currency: z
    .string()
    .length(3, 'Currency must be 3 characters (e.g., TRY, USD, EUR)')
    .min(1, 'Currency is required'),
  alertThreshold: z
    .number()
    .min(0, 'Alert threshold must be between 0 and 1')
    .max(1, 'Alert threshold must be between 0 and 1')
    .optional(),
});

const acknowledgeBudgetAlertSchema = z.object({
  severity: z.enum(['warning', 'critical']),
  percentage: z.number(),
});

// Apply authentication middleware to all routes
router.use(authMiddleware);

// GET / - Get user budget
router.get('/', userBudgetController.getUserBudget);

// PUT / - Set/update user budget
router.put(
  '/',
  validateRequest(setUserBudgetSchema),
  userBudgetController.setUserBudget
);

// DELETE / - Remove user budget
router.delete('/', userBudgetController.deleteUserBudget);

// GET /status - Get budget status
router.get('/status', userBudgetController.getBudgetStatus);
// GET /alerts - Get budget alerts (with notification payload)
router.get('/alerts', userBudgetController.checkBudgetAlerts);
// POST /alerts/ack - Mark alert as dispatched/acknowledged
router.post(
  '/alerts/ack',
  validateRequest(acknowledgeBudgetAlertSchema),
  userBudgetController.acknowledgeBudgetAlert
);

export default router;
