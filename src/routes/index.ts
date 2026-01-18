import { Request, Response, Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import petRoutes from './petRoutes';
import healthRecordRoutes from './healthRecordRoutes';
import eventRoutes from './eventRoutes';
import feedingScheduleRoutes from './feedingScheduleRoutes';
import expenseRoutes from './expenseRoutes';
import userBudgetRoutes from './userBudgetRoutes';
import userSettingsRoutes from './userSettingsRoutes';
import subscriptionRoutes from './subscriptionRoutes';
import accountRoutes from './accountRoutes';
import recurrenceRoutes from './recurrenceRoutes';
import { WebhookController } from '../controllers/webhookController';
import { requireActiveSubscription } from '../middleware/subscription';

const router = Router();

// Webhook route - NO AUTH (has its own verification)
const webhookController = new WebhookController();
router.post('/subscription/webhook', webhookController.handleWebhook);

// Public config route - NO AUTH (allowlisted public values)
router.get('/public-config', (_req: Request, res: Response) => {
  const requiredKeys = [
    'PUBLIC_REVENUECAT_IOS_API_KEY',
    'PUBLIC_REVENUECAT_ANDROID_API_KEY',
    'PUBLIC_REVENUECAT_ENTITLEMENT_ID',
  ] as const;

  const missingKeys = requiredKeys.filter((key) => !process.env[key]);
  if (missingKeys.length > 0) {
    res.status(500).json({
      success: false,
      error: {
        code: 'PUBLIC_CONFIG_MISSING',
        message: 'Required public config is missing',
        details: missingKeys,
      },
    });
    return;
  }

  res.json({
    success: true,
    data: {
      revenuecat: {
        iosApiKey: process.env.PUBLIC_REVENUECAT_IOS_API_KEY,
        androidApiKey: process.env.PUBLIC_REVENUECAT_ANDROID_API_KEY,
        entitlementId: process.env.PUBLIC_REVENUECAT_ENTITLEMENT_ID,
      },
      legal: {
        privacyUrl: process.env.PUBLIC_LEGAL_PRIVACY_URL ?? null,
        termsUrl: process.env.PUBLIC_LEGAL_TERMS_URL ?? null,
      },
    },
  });
});

// All other API routes require authentication
router.use(authMiddleware);

// Subscription routes remain available without an active subscription
router.use('/subscription', subscriptionRoutes);
router.use('/account', accountRoutes);
router.use('/settings', userSettingsRoutes);

// Core access routes (free forever)
router.use('/pets', petRoutes);
router.use('/health-records', healthRecordRoutes);
router.use('/events', eventRoutes);
router.use('/feeding-schedules', feedingScheduleRoutes);
router.use('/expenses', expenseRoutes);
router.use('/recurrence-rules', recurrenceRoutes);

// Pet-specific nested routes (core access)
router.use('/pets/:petId/health-records', healthRecordRoutes);
router.use('/pets/:petId/events', eventRoutes);
router.use('/pets/:petId/feeding-schedules', feedingScheduleRoutes);
router.use('/pets/:petId/expenses', expenseRoutes);

// Pro-only routes
router.use('/budget', requireActiveSubscription, userBudgetRoutes);

export default router;
