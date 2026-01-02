import { Router } from 'express';
import { UserSettingsController } from '../controllers/userSettingsController';
import { validateRequest } from '../middleware/validation';
import { authMiddleware } from '../middleware/auth';
import { z } from 'zod';

const router = Router({ mergeParams: true });
const userSettingsController = new UserSettingsController();

const updateUserSettingsSchema = z.object({
  baseCurrency: z.enum(['TRY', 'USD', 'EUR', 'GBP']).optional(),
  timezone: z.string().min(1).optional(),
  language: z.string().min(1).optional(),
  theme: z.enum(['light', 'dark']).optional(),
  notificationsEnabled: z.boolean().optional(),
  budgetNotificationsEnabled: z.boolean().optional(),
  quietHoursEnabled: z.boolean().optional(),
  quietHours: z.object({
    startHour: z.number().int().min(0).max(23),
    startMinute: z.number().int().min(0).max(59),
    endHour: z.number().int().min(0).max(23),
    endMinute: z.number().int().min(0).max(59),
  }).optional(),
});

const updateBaseCurrencySchema = z.object({
  baseCurrency: z.enum(['TRY', 'USD', 'EUR', 'GBP']),
});

router.use(authMiddleware);

router.get('/', userSettingsController.getUserSettings);

router.put(
  '/',
  validateRequest(updateUserSettingsSchema),
  userSettingsController.updateUserSettings
);

router.patch(
  '/currency',
  validateRequest(updateBaseCurrencySchema),
  userSettingsController.updateBaseCurrency
);

export default router;
