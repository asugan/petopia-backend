import { Router } from 'express';
import { SubscriptionController } from '../controllers/subscriptionController';
import { validateRequest } from '../middleware/validation';
import { z } from 'zod';

const router = Router();
const subscriptionController = new SubscriptionController();

// Validation schemas
const startTrialSchema = z.object({
  deviceId: z.string().min(1, 'Device ID is required'),
});

// Routes

// GET /api/subscription/status - Get unified subscription status (main endpoint)
router.get('/status', subscriptionController.getSubscriptionStatus);

// GET /api/subscription/downgrade-status - Check if user needs to downgrade
router.get('/downgrade-status', subscriptionController.getDowngradeStatus);

// GET /api/subscription/trial-status - Deprecated: Use /status instead
router.get('/trial-status', subscriptionController.getTrialStatus);

// POST /api/subscription/start-trial - Start a trial
router.post(
  '/start-trial',
  validateRequest(startTrialSchema),
  subscriptionController.startTrial
);

// POST /api/subscription/deactivate-trial - Deprecated: Trial is auto-converted on purchase
router.post('/deactivate-trial', subscriptionController.deactivateTrial);

export default router;
