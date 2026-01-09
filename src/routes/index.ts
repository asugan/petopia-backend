import { Router } from 'express';
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
import { WebhookController } from '../controllers/webhookController';
import { requireActiveSubscription } from '../middleware/subscription';

const router = Router();

// Webhook route - NO AUTH (has its own verification)
const webhookController = new WebhookController();
router.post('/subscription/webhook', webhookController.handleWebhook);

// All other API routes require authentication
router.use(authMiddleware);

// Subscription routes remain available without an active subscription
router.use('/subscription', subscriptionRoutes);
router.use('/account', accountRoutes);
router.use('/settings', userSettingsRoutes);

// All remaining routes require an active subscription (trial or paid)
router.use(requireActiveSubscription);

// Mount routes
router.use('/pets', petRoutes);
router.use('/health-records', healthRecordRoutes);
router.use('/events', eventRoutes);
router.use('/feeding-schedules', feedingScheduleRoutes);
router.use('/expenses', expenseRoutes);
router.use('/budget', userBudgetRoutes);

// Pet-specific nested routes
router.use('/pets/:petId/health-records', healthRecordRoutes);
router.use('/pets/:petId/events', eventRoutes);
router.use('/pets/:petId/feeding-schedules', feedingScheduleRoutes);
router.use('/pets/:petId/expenses', expenseRoutes);

export default router;
